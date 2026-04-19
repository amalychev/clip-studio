import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from database import DATA_DIR
from services.video_service import generate_video_stream

ASSETS_MUSIC_DIR = Path(__file__).parent.parent / "assets" / "music"

router = APIRouter()


class ExportFormat(BaseModel):
    id: str
    width: int
    height: int


class ExportRequest(BaseModel):
    formats: list[ExportFormat]
    audio_filename: str
    image_filenames: list[str]
    music_id: str | None = None
    music_volume: float = 0.3
    subtitles: list[dict] = []
    subtitle_style: dict = {}
    speech_volume: float = 1.0
    watermark_filename: str | None = None
    lead_in: float = 2.0
    lead_out: float = 2.0
    audio_duration: float = 0.0
    enable_image_transitions: bool = True


class SaveRequest(BaseModel):
    src: str
    dest_dir: str
    name: str


@router.post("/export/{project_id}")
async def export_video(project_id: str, body: ExportRequest):
    if not body.image_filenames:
        raise HTTPException(400, "No images provided")
    if not body.audio_filename:
        raise HTTPException(400, "No audio provided")

    proj_dir = DATA_DIR / "projects" / project_id
    audio_path = proj_dir / "audio" / body.audio_filename
    if not audio_path.exists():
        raise HTTPException(404, f"Audio file not found: {body.audio_filename}")

    image_paths = []
    for fn in body.image_filenames:
        p = proj_dir / "images" / fn
        if p.exists():
            image_paths.append(str(p))

    if not image_paths:
        raise HTTPException(400, "No valid image files found")

    music_path = None
    if body.music_id:
        for base in [DATA_DIR / "music", ASSETS_MUSIC_DIR]:
            mp = base / body.music_id
            if mp.exists():
                music_path = str(mp)
                break

    watermark_path = None
    if body.watermark_filename:
        candidate = proj_dir / "watermark" / body.watermark_filename
        if candidate.exists():
            watermark_path = str(candidate)

    output_dir = proj_dir / "video"
    output_dir.mkdir(exist_ok=True)

    formats = [{"id": f.id, "width": f.width, "height": f.height} for f in body.formats]

    return StreamingResponse(
        generate_video_stream(
            project_id=project_id,
            image_paths=image_paths,
            audio_path=str(audio_path),
            subtitles=body.subtitles,
            music_path=music_path,
            music_volume=body.music_volume,
            speech_volume=body.speech_volume,
            subtitle_style=body.subtitle_style,
            watermark_path=watermark_path,
            formats=formats,
            output_dir=str(output_dir),
            lead_in=body.lead_in,
            lead_out=body.lead_out,
            audio_duration=body.audio_duration,
            enable_image_transitions=body.enable_image_transitions,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/save")
def save_video(body: SaveRequest):
    src = Path(body.src)
    if not src.exists():
        raise HTTPException(404, "Source file not found")
    dest_dir = Path(body.dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{body.name}{src.suffix}"
    shutil.copy2(str(src), str(dest))
    return {"path": str(dest)}
