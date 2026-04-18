from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from database import engine, DATA_DIR
import models

from routers import projects, settings, ai, tts, media, video, subtitles

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Clip Studio API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(settings.router, prefix="/settings", tags=["settings"])
app.include_router(ai.router, prefix="/ai", tags=["ai"])
app.include_router(tts.router, prefix="/tts", tags=["tts"])
app.include_router(media.router, prefix="/media", tags=["media"])
app.include_router(video.router, prefix="/video", tags=["video"])
app.include_router(subtitles.router, prefix="/subtitles", tags=["subtitles"])

# Static media files (mounted last to avoid route conflicts)
app.mount("/media/music_files", StaticFiles(directory=str(DATA_DIR / "music"), html=False), name="music_static")


@app.get("/healthz")
def health():
    return {"status": "ok"}
