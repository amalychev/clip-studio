# Clip Studio

Desktop app for generating social media videos from text content.

## Stack

- **Frontend**: Electron + React 18 + TypeScript + Tailwind CSS v3
- **Backend**: Python FastAPI + SQLite
- **AI**: OpenAI, Anthropic, Mistral, Google Gemini
- **TTS**: Silero v5 via banks-services
- **Video**: FFmpeg

## Requirements

- Node.js 20+
- Python 3.11+
- FFmpeg (`brew install ffmpeg`)
- banks-services TTS running on port 8000

## Development

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn main:app --port 8765 --reload
```

### 2. Frontend (Electron + Vite)

```bash
npm install
npm run dev
```

### Add background music

Drop MP3 files into `~/.clip-studio/music/`

## Video pipeline

```
Text → AI prep → TTS audio → Images → Music mix → Subtitles → FFmpeg → MP4
```

## Output formats

| Format | Size | Use |
|--------|------|-----|
| Instagram Story | 1080×1920 | Reels / Stories |
| Instagram Feed | 1080×1080 | Square post |
| Instagram Portrait | 1080×1350 | 4:5 post |
| YouTube / Landscape | 1920×1080 | YouTube / Telegram |
