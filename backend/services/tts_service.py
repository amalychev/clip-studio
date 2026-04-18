import uuid
import httpx
import mutagen
from pathlib import Path
from database import DATA_DIR


async def generate_tts(text: str, voice: str, tts_url: str, project_id: str) -> dict:
    audio_dir = DATA_DIR / "projects" / project_id / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    filename = f"tts_{uuid.uuid4().hex[:8]}.mp3"
    dest_path = audio_dir / filename

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{tts_url}/text-to-speech",
            json={"text": text, "voice": voice, "format": "mp3", "rate": 44100},
        )
        resp.raise_for_status()

    dest_path.write_bytes(resp.content)

    duration = 0.0
    try:
        audio = mutagen.File(str(dest_path))
        if audio and audio.info:
            duration = float(audio.info.length)
    except Exception:
        pass

    return {"filename": filename, "duration": duration}
