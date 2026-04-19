import mutagen
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import DATA_DIR

router = APIRouter()


class TTSRequest(BaseModel):
    text: str
    voice: str = "kseniya"
    format: str = "mp3"
    project_id: str


class TTSVoicesResponse(BaseModel):
    voices: list[str]


@router.get("/voices")
def get_voices():
    from services.silero_tts_service import AVAILABLE_VOICES
    return {"voices": AVAILABLE_VOICES}


@router.post("/generate")
async def tts_generate(body: TTSRequest):
    if not body.text.strip():
        raise HTTPException(400, "Text is required")

    fmt = body.format if body.format in ("mp3", "wav") else "mp3"

    try:
        from services.silero_tts_service import synthesize
        audio_bytes = synthesize(text=body.text, voice=body.voice, fmt=fmt)  # type: ignore[arg-type]
    except Exception as e:
        raise HTTPException(500, f"TTS synthesis failed: {e}")

    filename = f"tts.{fmt}"
    audio_dir = DATA_DIR / "projects" / body.project_id / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    for old in audio_dir.glob("tts.*"):
        old.unlink(missing_ok=True)
    (audio_dir / filename).write_bytes(audio_bytes)

    duration = 0.0
    try:
        import mutagen.mp3
        audio = mutagen.mp3.MP3(str(audio_dir / filename))
        duration = float(audio.info.length)
    except Exception:
        try:
            audio = mutagen.File(str(audio_dir / filename))
            if audio and audio.info:
                duration = float(audio.info.length)
        except Exception:
            pass

    return {"filename": filename, "duration": duration}
