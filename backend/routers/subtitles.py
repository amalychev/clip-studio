import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import DATA_DIR
from services.subtitle_service import generate_subtitles, save_subtitles_srt

router = APIRouter()


class SubtitleGenRequest(BaseModel):
    text: str
    duration: float
    project_id: str


class SubtitleAudioRequest(BaseModel):
    project_id: str
    audio_filename: str
    model_size: str = "small"


class SubtitleSaveRequest(BaseModel):
    subtitles: list[dict]
    project_id: str


@router.post("/generate")
def generate(body: SubtitleGenRequest):
    if body.duration <= 0:
        raise HTTPException(400, "Duration must be > 0")
    subs = generate_subtitles(body.text, body.duration)
    return {"subtitles": subs}


@router.post("/generate-from-audio")
async def generate_from_audio(body: SubtitleAudioRequest):
    audio_path = DATA_DIR / "projects" / body.project_id / "audio" / body.audio_filename
    if not audio_path.exists():
        raise HTTPException(404, "Audio file not found")

    try:
        from services.whisper_service import transcribe_for_subtitles
        loop = asyncio.get_event_loop()
        subs = await loop.run_in_executor(
            None,
            transcribe_for_subtitles,
            audio_path,
            body.model_size,
        )
        return {"subtitles": subs}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/save")
def save(body: SubtitleSaveRequest):
    save_subtitles_srt(body.subtitles, body.project_id)
    return {"ok": True}
