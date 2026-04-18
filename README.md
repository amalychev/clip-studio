# Clip Studio

A desktop application for creating short-form social media videos from text content. Takes a script through an 8-step wizard — AI text preparation, text-to-speech, image slideshow, background music, subtitles, and FFmpeg rendering — and exports MP4 files in multiple aspect ratios.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [How It Works — Wizard Steps](#how-it-works--wizard-steps)
- [Video Pipeline](#video-pipeline)
- [API Reference](#api-reference)
- [Configuration](#configuration)
- [Output Formats](#output-formats)
- [Data Storage](#data-storage)

---

## Architecture

```
┌─────────────────────────────────────────┐
│              Electron Shell             │
│  ┌──────────────────────────────────┐   │
│  │   React UI (Vite / renderer)     │   │
│  │   Zustand state · Tailwind CSS   │   │
│  └────────────────┬─────────────────┘   │
│                   │ HTTP (localhost)     │
│  ┌────────────────▼─────────────────┐   │
│  │   FastAPI Backend (port 8765)    │   │
│  │   SQLite · Silero TTS · FFmpeg   │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

The Electron main process automatically bootstraps the Python environment on first launch using [uv](https://github.com/astral-sh/uv) — **no Python or FFmpeg installation is required on the user's machine**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 33 |
| Frontend | React 18, TypeScript, Vite (electron-vite) |
| Styling | Tailwind CSS v3 |
| State management | Zustand |
| Backend | Python 3.13, FastAPI, Uvicorn |
| Database | SQLite via SQLAlchemy |
| TTS | Silero v5 (runs in-process, CPU) |
| Video rendering | FFmpeg (bundled via ffmpeg-static) |
| AI providers | OpenAI, Anthropic, Mistral, Google Gemini |
| Package manager (Python) | uv (auto-downloaded on first launch) |

---

## Prerequisites

For **development only** (not required for end users):

- **Node.js** 20+
- **Python** 3.11+ (uv will manage its own Python 3.13 at runtime)
- **Git**

End users need nothing pre-installed — the app downloads and configures everything automatically on first launch (~350 MB one-time download: Python 3.13 + PyTorch + Silero).

---

## Getting Started

### 1. Clone and install Node dependencies

```bash
git clone <repo-url>
cd clip-studio
npm install
```

### 2. Start the Python backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e .
uvicorn main:app --port 8765 --reload
```

### 3. Start Electron + Vite (dev mode)

```bash
# In the project root (separate terminal from backend)
npm run dev
```

The app opens with hot-reload for both the renderer (React) and backend (uvicorn `--reload`).

### Build for production

```bash
npm run build        # Vite build + Electron pack
```

---

## Project Structure

```
clip-studio/
├── src/
│   ├── main/
│   │   ├── index.ts          # Electron main process — window creation, IPC
│   │   └── startup.ts        # Auto-bootstrap: downloads uv → Python → deps → starts backend
│   ├── preload/
│   │   └── index.ts          # contextBridge — exposes startup IPC and native APIs to renderer
│   └── renderer/
│       └── src/
│           ├── components/
│           │   ├── layout/   # AppLayout, sidebar navigation
│           │   ├── ui/       # Reusable primitives (Button, Card, Input, etc.)
│           │   └── wizard/   # Step1_Text … Step8_Export
│           ├── lib/
│           │   └── api.ts    # Typed fetch wrappers for all backend endpoints
│           ├── pages/        # ProjectsPage, WorkspacePage, SettingsPage, StartupPage
│           ├── stores/
│           │   ├── wizardStore.ts    # All wizard state + 1.5 s auto-save to backend
│           │   └── settingsStore.ts  # Global app settings
│           └── types/
│               └── index.ts  # Shared TypeScript types (SubtitleStyle, VideoFormat, …)
│
└── backend/
    ├── main.py               # FastAPI app, router registration, CORS
    ├── database.py           # SQLAlchemy engine, DATA_DIR resolution
    ├── models.py             # ORM models: Project, Settings
    ├── pyproject.toml        # Python dependencies
    ├── routers/
    │   ├── projects.py       # CRUD for projects
    │   ├── settings.py       # Global settings (API keys, watermark, etc.)
    │   ├── ai.py             # Text preparation via AI providers
    │   ├── tts.py            # Text-to-speech generation
    │   ├── media.py          # Image/audio upload and serving
    │   ├── subtitles.py      # Subtitle generation from TTS audio + text
    │   └── video.py          # Export (SSE streaming) + file save
    ├── services/
    │   ├── ai_service.py         # Multi-provider AI client (OpenAI / Anthropic / Mistral / Gemini)
    │   ├── tts_service.py        # TTS router — Silero (local) or external API
    │   ├── silero_tts_service.py # Silero v5 in-process synthesis
    │   ├── subtitle_service.py   # Subtitle generation + ASS/SRT file export
    │   └── video_service.py      # FFmpeg command builder + async streaming render
    └── assets/
        └── music/            # Bundled background music tracks (MP3)
```

---

## How It Works — Wizard Steps

The workspace is an 8-step linear wizard. State is persisted automatically to the SQLite database after each change (1.5 s debounce) so sessions survive restarts.

| Step | Name | What happens |
|------|------|-------------|
| 1 | **Text** | Paste or type the raw script |
| 2 | **AI Prep** | Send the script to an AI provider for rewriting/formatting; choose provider and model |
| 3 | **Audio** | Generate TTS via Silero (local, Russian voices) or upload a custom audio file |
| 4 | **Images** | Upload photos; drag-and-drop to reorder; images become the video slideshow |
| 5 | **Music** | Pick a background music track from bundled library or user's `~/.clip-studio/music/` |
| 6 | **Subtitles** | Auto-generated from TTS alignment; edit individual lines inline |
| 7 | **Preview** | Full timeline editor — see subtitles overlaid on the slideshow with audio playback; adjust subtitle style, image order, volumes |
| 8 | **Export** | Choose output format(s), render video(s) via FFmpeg, open or save the result |

---

## Video Pipeline

```
Raw script
  │
  ▼ (Step 2) AI provider rewrites / cleans the text
  │
  ▼ (Step 3) Silero TTS → WAV/MP3 audio file  ──────────────┐
  │                                                           │
  ▼ (Step 4) Images uploaded (JPEG/PNG/WEBP)                 │
  │                                                           │
  ▼ (Step 5) Background music selected                       │
  │                                                           │
  ▼ (Step 6) Subtitles auto-generated (text + TTS timing)    │
  │                                                           │
  ▼ (Step 7) Timeline preview                                │
  │   • LEAD_IN = 2 s of silence before TTS starts           │
  │   • LEAD_OUT = 2 s after TTS ends                        │
  │   • Total duration = LEAD_IN + TTS duration + LEAD_OUT   │
  │   • Images cover the full duration equally               │
  │                                                           │
  ▼ (Step 8) FFmpeg render (per selected format)             │
      ffmpeg concat slideshow                                 │
      + adelay(2000ms) on TTS audio ◄───────────────────────┘
      + apad to fill lead-out silence
      + amix with background music (looped, trimmed)
      + subtitles filter (ASS file, PlayRes = video dims)
      + scale/crop to target resolution (cover, no black bars)
      → MP4 (H.264 + AAC, faststart)
```

### Subtitle rendering

Subtitles are written as a proper **ASS (Advanced SubStation Alpha)** file with:
- `PlayResX` / `PlayResY` set to the exact video dimensions so `FontSize` is in real pixels (no libass scaling)
- `BorderStyle=3` opaque box with `OutlineColour = BackColour` (works across all libass versions)
- `ScaledBorderAndShadow: yes` for pixel-accurate outline/margin
- Times offset by `LEAD_IN` so they align with the video timeline

---

## API Reference

The FastAPI backend runs on `http://127.0.0.1:8765`. Interactive docs: `http://127.0.0.1:8765/docs`.

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/projects/` | List all projects |
| `POST` | `/projects/` | Create project |
| `GET` | `/projects/{id}` | Get project (includes `data` JSON blob) |
| `PUT` | `/projects/{id}` | Update project (saves wizard state) |
| `DELETE` | `/projects/{id}` | Delete project and all its files |

### AI

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ai/prepare` | Rewrite raw text using selected AI provider |
| `GET` | `/ai/models` | List available models per provider |

### TTS

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tts/generate` | Synthesize speech → saves MP3, returns filename + duration |

### Media

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/media/upload-image/{project_id}` | Upload image(s) |
| `DELETE` | `/media/image/{project_id}/{filename}` | Delete image |
| `GET` | `/media/audio/{project_id}/{filename}` | Stream audio file |
| `GET` | `/media/images/{project_id}/{filename}` | Serve image |
| `GET` | `/media/music` | List available music tracks |
| `GET` | `/media/music/{filename}` | Stream music file |

### Subtitles

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/subtitles/generate` | Generate subtitle entries from text + TTS duration |

### Video

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/video/export/{project_id}` | Render video(s) — **Server-Sent Events** stream of progress |
| `POST` | `/video/save` | Copy rendered file to user-chosen directory |

#### Export SSE events

Each event is `data: <JSON>\n\n` with fields:

```jsonc
{ "stage": "render", "percent": 45, "message": "Rendering 9:16 (1080×1920)..." }
{ "stage": "done",   "percent": 100, "done": true, "files": [{ "format": "9:16", "path": "...", "size": 12345678 }] }
{ "stage": "error",  "percent": 0,   "error": "ffmpeg error message" }
```

### Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings/` | Get global settings (API keys, default watermark) |
| `PUT` | `/settings/` | Update settings |

---

## Configuration

### API Keys

Set in **Settings → AI Providers** inside the app. Stored in the local SQLite database (never sent anywhere except the chosen AI provider).

Supported providers:
- **Mistral** — default; `mistral-large-latest` and others
- **OpenAI** — `gpt-4o`, `gpt-4o-mini`, etc.
- **Anthropic** — `claude-opus-4-*`, `claude-sonnet-4-*`, etc.
- **Google Gemini** — `gemini-2.0-flash`, etc.

### Background music

Drop MP3 files into `~/.clip-studio/music/`. They appear in Step 5 alongside the bundled tracks.

### Watermark

A text overlay burned into the top-right corner of the video. Set a default in **Settings** or override per-project in **Project Settings**.

---

## Output Formats

| ID | Name | Resolution | Use case |
|----|------|-----------|----------|
| `9:16` | Vertical (Reels/Stories) | 1080 × 1920 | Instagram Reels, TikTok, YouTube Shorts |
| `1:1` | Square | 1080 × 1080 | Instagram feed |
| `4:5` | Portrait | 1080 × 1350 | Instagram portrait post |
| `16:9` | Landscape | 1920 × 1080 | YouTube, Telegram |

Multiple formats can be selected; the app renders each in sequence and reports progress via SSE. All outputs use cover/crop scaling — no black bars.

---

## Data Storage

All runtime data lives in `~/.clip-studio/`:

```
~/.clip-studio/
├── clip_studio.db          # SQLite database (projects + settings)
├── music/                  # User-added background music
├── models/
│   └── v5_ru.pt            # Silero TTS model (downloaded on first use, ~100 MB)
├── projects/
│   └── <project-id>/
│       ├── audio/          # TTS audio files
│       ├── images/         # Uploaded images
│       ├── subtitles/      # Generated ASS subtitle files
│       └── video/          # Rendered MP4 output
└── runtime/                # uv + Python venv (managed automatically)
    ├── uv/
    └── venv/
```

The `runtime/` directory is created and managed automatically by the Electron startup process. Delete it to force a full re-installation of the Python environment.
