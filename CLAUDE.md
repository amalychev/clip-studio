# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend (Electron + React)
```bash
npm run dev          # Start Electron + Vite dev server (hot reload)
npm run build        # Production Vite build
npm run build:dist   # Full distributable (Vite build + electron-builder)
```

### Backend (FastAPI)
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn main:app --port 8765 --reload

# With bundled ffmpeg (matches what the app uses):
npm run backend:dev
```

Backend API docs available at `http://127.0.0.1:8765/docs` when running.

There are no automated tests or linting configurations in this project.

---

## Architecture

### Process model

Three processes run simultaneously in development:

1. **Electron main** (`src/main/index.ts`) — creates the `BrowserWindow`, exposes IPC handlers (`dialog:selectDirectory`, `dialog:selectFiles`, `shell:openPath`, `startup:retry`), and launches `runStartup`.
2. **Electron renderer** (`src/renderer/`) — React SPA, communicates with the backend over HTTP to `http://127.0.0.1:8765`. Never calls Electron IPC directly; uses `window.api` and `window.startup` injected by the preload.
3. **FastAPI backend** (`backend/`) — Python process managed by the Electron main process via `startup.ts`. In production, auto-bootstrapped with `uv` (downloads Python 3.13 + deps on first launch into `~/.clip-studio/runtime/`).

### Auto-bootstrap (`src/main/startup.ts`)

On first launch (no pre-installed Python needed):
1. Downloads `uv` binary (~15 MB) into `~/.clip-studio/runtime/uv/`
2. `uv python install 3.13` + `uv venv`
3. `uv pip install -e <backendDir>` — installs PyTorch, Silero, FastAPI, etc.
4. Spawns `uvicorn main:app --port 8765` with `FFMPEG_BIN` env var pointing to the bundled `ffmpeg-static` binary
5. Health-checks `/healthz` until ready, then sends `startup:done` IPC to renderer

### Backend routers and services

Seven routers under `backend/routers/`: `projects`, `settings`, `ai`, `tts`, `media`, `video`, `subtitles`.

Key services under `backend/services/`:
- **`ai_service.py`** — Text preparation for Russian TTS and image-prompt generation. Dispatches to whichever provider the user configured (OpenAI, Anthropic, Mistral, Gemini) via a shared system-prompt approach.
- **`image_generation_service.py`** — Image generation supporting multiple providers (OpenAI DALL-E, Gemini). Reads provider from global settings.
- **`silero_tts_service.py`** — In-process Silero v5 speech synthesis, CPU-only, Russian voices only.
- **`subtitle_service.py`** — Segments text and writes `.ass` subtitle files with per-format styling.
- **`video_service.py`** — Assembles and runs the FFmpeg command; streams progress as SSE.

### Wizard steps (`src/renderer/src/components/wizard/`)

The 8-step wizard maps to `STEP_COMPONENTS` in `WorkspacePage`:
1. Text input (`Step1_Text`) 
2. AI text preparation (`Step2_AIPrep`)
3. TTS voice selection and audio generation (`Step3_Audio`)
4. Image upload / AI generation (`Step4_Images`)
5. Background music (`Step5_Music`)
6. Subtitle styling (`Step6_Subtitles`)
7. Preview + timeline editor (`Step7_Preview`) — largest component, canvas-based
8. Export / save (`Step8_Export`)

### Frontend state (`src/renderer/src/stores/`)

- **`wizardStore.ts`** — single Zustand store holding all 8-step wizard state for the open project. Auto-saves to the backend on every change with a 1.5 s debounce via `useWizardStore.subscribe`. On project open, `restoreState()` rehydrates from the backend's `project.data` JSON blob (reconstructing media URLs from filenames).
- **`settingsStore.ts`** — global app settings (API keys, default watermark).

### Data flow: images vs. timeline

`images` in the store = all uploaded images for the project (source of truth, never deleted by timeline operations).  
`timelineImageIds` = ordered subset of image IDs currently on the timeline (local to Step 7 Preview, synced to store via `setTimelineImageIds`). Removing from timeline only filters `timelineImageIds`; it does not call `removeImage`. The export step reads `timelineImageIds` to build `image_filenames` for the render payload.

### Backend persistence

All project data is stored in a single `data_json` (Text column) on the `Project` SQLAlchemy model. The `data` property serializes/deserializes it as JSON. There are no separate tables for wizard steps, subtitles, images, etc. — everything lives in this blob.

Files are stored under `~/.clip-studio/projects/<project-id>/`:
- `audio/` — TTS audio files
- `images/` — uploaded photos
- `subtitles/` — generated `.ass` files (one per video format)
- `video/` — rendered `.mp4` output

### Video rendering (`backend/services/video_service.py`)

`_build_ffmpeg_cmd` assembles the complete FFmpeg command:
- **Timeline**: 2 s silence lead-in before TTS, 2 s lead-out after — total duration = `audio_duration + 4`. Images cover the full duration equally via concat.
- **Audio**: TTS delayed with `adelay={lead_in_ms}:all=1`, padded with `apad=whole_dur={total}`. Music looped and trimmed to total duration, mixed with `amix`.
- **Subtitles**: Written as a proper `.ass` file per format (via `subtitle_service.save_subtitles_ass`) with `PlayResX/PlayResY` matching exact video dimensions so `FontSize` is in real pixels. `OutlineColour` and `BackColour` are both set to the user's background color (required for consistent libass rendering of `BorderStyle=3`). Subtitle times are offset by `lead_in`.
- **Scale**: `force_original_aspect_ratio=increase` + `crop` (cover/fill, no black bars).
- Export streams progress as SSE events (`data: <JSON>\n\n`).

### Subtitle font sizing

`fontSize` in `SubtitleStyle` is a **percentage of video height** (e.g., `2.5` = 2.5%). Applied as `box.h * fontSize / 100` CSS pixels in the preview canvas, and `int(height * fontSize / 100)` pixels in the ASS file. Padding and border-radius in the preview scale proportionally from `fontSizePx`. `positionMargin` is also a percentage of height, applied as CSS `%` in preview and as `int(height * positionMargin / 100)` px in `MarginV`.

### IPC surface (preload → renderer)

`window.api` — `selectDirectory()`, `selectFiles(filters)`, `openPath(path)`  
`window.startup` — `onProgress(cb)`, `onDone(cb)`, `onError(cb)`, `retry()`

### Routing

React Router v6. Main routes: `/` → `ProjectsPage`, `/project/:projectId` → `WorkspacePage`, `/settings` → `SettingsPage`. `WorkspacePage` renders the current wizard step from `STEP_COMPONENTS[currentStep]` (steps 1–8).

### Frontend conventions

- Path alias `@renderer` resolves to `src/renderer/src/` (configured in `electron-vite.config.ts`).
- Tailwind CSS v3 with a custom theme: `surface-*` color scale for backgrounds, `accent-*` for interactive blues. Use these tokens rather than raw gray/blue utilities.
- All API calls go through `src/renderer/src/lib/api.ts` — add new endpoint wrappers there.
