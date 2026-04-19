import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from database import DATA_DIR
from services.video_service import FFMPEG_BIN, generate_video_stream, render_video_file
from services.project_naming import get_project_slug

ASSETS_MUSIC_DIR = Path(__file__).parent.parent / "assets" / "music"

router = APIRouter()


def _preview_dimensions(width: int, height: int) -> tuple[int, int]:
    # Proxy preview: enough for UI fidelity, much faster than full export size.
    max_long_edge = 960
    long_edge = max(width, height)
    if long_edge <= max_long_edge:
        return width, height
    scale = max_long_edge / long_edge
    scaled_width = max(2, int(round(width * scale / 2) * 2))
    scaled_height = max(2, int(round(height * scale / 2) * 2))
    return scaled_width, scaled_height


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


class PreviewRequest(BaseModel):
    format: ExportFormat
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
    project_slug = get_project_slug(project_id)

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


@router.post("/preview/{project_id}")
async def render_preview(project_id: str, body: PreviewRequest):
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
    safe_format_id = body.format.id.replace(":", "x")
    project_slug = get_project_slug(project_id)
    preview_filename = f"{project_slug}_preview_{safe_format_id}.mp4"
    for old in output_dir.glob(f"*_preview_{safe_format_id}.mp4"):
        old.unlink(missing_ok=True)
    output_path = output_dir / preview_filename

    preview_width, preview_height = _preview_dimensions(body.format.width, body.format.height)

    try:
        result = await render_video_file(
            project_id=project_id,
            image_paths=image_paths,
            audio_path=str(audio_path),
            subtitles=body.subtitles,
            music_path=music_path,
            music_volume=body.music_volume,
            speech_volume=body.speech_volume,
            subtitle_style=body.subtitle_style,
            watermark_path=watermark_path,
            width=preview_width,
            height=preview_height,
            output_path=str(output_path),
            lead_in=body.lead_in,
            lead_out=body.lead_out,
            audio_duration=body.audio_duration,
            enable_image_transitions=body.enable_image_transitions,
            fmt_id=f"preview_{safe_format_id}",
            preview_mode=True,
        )
    except FileNotFoundError:
        raise HTTPException(500, f"ffmpeg не найден по пути: {FFMPEG_BIN}")
    except Exception as exc:
        raise HTTPException(500, str(exc))

    return {
        "filename": preview_filename,
        "path": result["path"],
        "size": result["size"],
    }
