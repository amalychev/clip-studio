import re
import shutil
import mutagen
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
import aiofiles
from database import DATA_DIR
from services.project_naming import get_project_slug

ASSETS_MUSIC_DIR = Path(__file__).parent.parent / "assets" / "music"
AUDIO_EXTENSIONS = {".mp3", ".m4a", ".ogg", ".wav", ".flac"}
DEFAULT_WATERMARK_DIR = DATA_DIR / "default_watermark"

router = APIRouter()


def _sanitize_name(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value).strip("._-").lower()
    return cleaned or fallback


@router.post("/images/{project_id}")
async def upload_images(project_id: str, files: list[UploadFile] = File(...)):
    images_dir = DATA_DIR / "projects" / project_id / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    project_slug = get_project_slug(project_id)

    result = []
    used_names: set[str] = set()
    for i, file in enumerate(files):
        ext = Path(file.filename or "img.jpg").suffix.lower() or ".jpg"
        original_base = _sanitize_name(Path(file.filename or "").stem, f"image_{i + 1:03d}")
        base_name = f"{project_slug}_{original_base}"
        candidate = base_name
        suffix = 2
        while candidate in used_names:
            candidate = f"{base_name}_{suffix}"
            suffix += 1
        used_names.add(candidate)
        for old in images_dir.glob(f"{candidate}.*"):
            old.unlink(missing_ok=True)
        filename = f"{candidate}{ext}"
        dest = images_dir / filename
        async with aiofiles.open(dest, "wb") as f:
            content = await file.read()
            await f.write(content)
        result.append({"id": filename, "filename": filename, "order": i})

    return {"images": result}


@router.get("/images/{project_id}")
def list_images(project_id: str):
    images_dir = DATA_DIR / "projects" / project_id / "images"
    if not images_dir.exists():
        return {"images": []}
    files = sorted(images_dir.iterdir(), key=lambda p: p.stat().st_mtime)
    return {
        "images": [
            {"id": f.name, "filename": f.name, "url": f"/media/images/{project_id}/images/{f.name}"}
            for f in files if f.is_file()
        ]
    }


@router.get("/images/{project_id}/{filename}")
def get_image(project_id: str, filename: str):
    path = DATA_DIR / "projects" / project_id / "images" / filename
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(str(path))


@router.delete("/images/{project_id}/{filename}")
def delete_image(project_id: str, filename: str):
    path = DATA_DIR / "projects" / project_id / "images" / filename
    if path.exists():
        path.unlink()
    return {"ok": True}


@router.post("/watermark/{project_id}")
async def upload_watermark(project_id: str, file: UploadFile = File(...)):
    watermark_dir = DATA_DIR / "projects" / project_id / "watermark"
    watermark_dir.mkdir(parents=True, exist_ok=True)
    project_slug = get_project_slug(project_id)

    ext = Path(file.filename or "watermark.png").suffix.lower() or ".png"
    for old in watermark_dir.glob("*_watermark.*"):
        old.unlink(missing_ok=True)

    filename = f"{project_slug}_watermark{ext}"
    dest = watermark_dir / filename
    async with aiofiles.open(dest, "wb") as f:
        await f.write(await file.read())

    return {"filename": filename}


@router.post("/default-watermark")
async def upload_default_watermark(file: UploadFile = File(...)):
    DEFAULT_WATERMARK_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "watermark.png").suffix.lower() or ".png"
    for old in DEFAULT_WATERMARK_DIR.glob("default_watermark.*"):
        old.unlink(missing_ok=True)

    filename = f"default_watermark{ext}"
    dest = DEFAULT_WATERMARK_DIR / filename
    async with aiofiles.open(dest, "wb") as f:
        await f.write(await file.read())

    return {"filename": filename}


@router.get("/default-watermark/{filename}")
def get_default_watermark(filename: str):
    path = DEFAULT_WATERMARK_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(str(path))


@router.delete("/default-watermark/{filename}")
def delete_default_watermark(filename: str):
    path = DEFAULT_WATERMARK_DIR / filename
    if path.exists():
        path.unlink()
    return {"ok": True}


@router.post("/default-watermark/apply/{project_id}")
def apply_default_watermark(project_id: str):
    DEFAULT_WATERMARK_DIR.mkdir(parents=True, exist_ok=True)
    source = next((f for f in DEFAULT_WATERMARK_DIR.glob("default_watermark.*") if f.is_file()), None)
    if not source:
        raise HTTPException(404, "Default watermark not found")

    watermark_dir = DATA_DIR / "projects" / project_id / "watermark"
    watermark_dir.mkdir(parents=True, exist_ok=True)
    project_slug = get_project_slug(project_id)
    for old in watermark_dir.glob("*_watermark.*"):
        old.unlink(missing_ok=True)

    filename = f"{project_slug}_watermark{source.suffix.lower() or '.png'}"
    dest = watermark_dir / filename
    shutil.copy2(str(source), str(dest))
    return {"filename": filename}


@router.get("/watermark/{project_id}/{filename}")
def get_watermark(project_id: str, filename: str):
    path = DATA_DIR / "projects" / project_id / "watermark" / filename
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(str(path))


@router.delete("/watermark/{project_id}/{filename}")
def delete_watermark(project_id: str, filename: str):
    path = DATA_DIR / "projects" / project_id / "watermark" / filename
    if path.exists():
        path.unlink()
    return {"ok": True}


@router.get("/audio/{project_id}/{filename}")
def get_audio(project_id: str, filename: str):
    path = DATA_DIR / "projects" / project_id / "audio" / filename
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(str(path), headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    })


@router.get("/video/{project_id}/{filename}")
def get_video(project_id: str, filename: str):
    path = DATA_DIR / "projects" / project_id / "video" / filename
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(str(path), headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    })


@router.get("/music/{track_id}")
def get_music_file(track_id: str):
    # Check user-uploaded first, then bundled assets
    for base in [DATA_DIR / "music", ASSETS_MUSIC_DIR]:
        path = base / track_id
        if path.exists():
            return FileResponse(str(path))
    raise HTTPException(404, "Not found")


def _track_entry(f: Path, source: str) -> dict:
    duration = 0
    try:
        audio = mutagen.File(str(f))
        if audio and audio.info:
            duration = int(audio.info.length)
    except Exception:
        pass
    # Clean up name: remove trailing _NNNNN numeric suffix added by freesound etc.
    import re
    name = re.sub(r'[_-]\d+$', '', f.stem)
    name = name.replace("_", " ").replace("-", " ").title()
    return {"id": f.name, "name": name, "duration": duration, "source": source}


@router.get("/music")
def list_music():
    tracks = []

    # Bundled tracks (always available)
    if ASSETS_MUSIC_DIR.exists():
        for f in sorted(ASSETS_MUSIC_DIR.iterdir()):
            if f.suffix.lower() in AUDIO_EXTENSIONS and f.is_file():
                tracks.append(_track_entry(f, "builtin"))

    # User-uploaded tracks
    music_dir = DATA_DIR / "music"
    music_dir.mkdir(exist_ok=True)
    for f in sorted(music_dir.iterdir()):
        if f.suffix.lower() in AUDIO_EXTENSIONS and f.is_file():
            tracks.append(_track_entry(f, "user"))

    return tracks


@router.post("/music")
async def upload_music(file: UploadFile = File(...)):
    music_dir = DATA_DIR / "music"
    music_dir.mkdir(exist_ok=True)
    dest = music_dir / (file.filename or "track.mp3")
    async with aiofiles.open(dest, "wb") as f:
        await f.write(await file.read())
    return {"filename": dest.name}
