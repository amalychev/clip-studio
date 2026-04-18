from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.subtitle_service import generate_subtitles, save_subtitles_srt

router = APIRouter()


class SubtitleGenRequest(BaseModel):
    text: str
    duration: float
    project_id: str


class SubtitleSaveRequest(BaseModel):
    subtitles: list[dict]
    project_id: str


@router.post("/generate")
def generate(body: SubtitleGenRequest):
    if body.duration <= 0:
        raise HTTPException(400, "Duration must be > 0")
    subs = generate_subtitles(body.text, body.duration)
    return {"subtitles": subs}


@router.post("/save")
def save(body: SubtitleSaveRequest):
    save_subtitles_srt(body.subtitles, body.project_id)
    return {"ok": True}
