import asyncio
import json
import os
from pathlib import Path
from typing import AsyncGenerator
import mutagen
from services.subtitle_service import save_subtitles_ass

# ffmpeg binary — injected by Electron via env var, falls back to system PATH
FFMPEG_BIN = os.environ.get("FFMPEG_BIN", "ffmpeg")


def _get_audio_duration(audio_path: str) -> float:
    try:
        audio = mutagen.File(audio_path)
        if audio and audio.info:
            return float(audio.info.length)
    except Exception:
        pass
    return 30.0


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _progress(stage: str, percent: int, message: str, done: bool = False, **extra) -> str:
    return _sse({"stage": stage, "percent": percent, "message": message, "done": done, **extra})


def _build_ffmpeg_cmd(
    image_paths: list[str],
    audio_path: str,
    ass_path: str | None,
    music_path: str | None,
    music_volume: float,
    speech_volume: float,
    watermark: str,
    width: int,
    height: int,
    output_path: str,
    lead_in: float = 2.0,
    lead_out: float = 2.0,
    audio_duration: float = 0.0,
    enable_image_transitions: bool = True,
) -> list[str]:
    tts_duration = audio_duration if audio_duration > 0 else _get_audio_duration(audio_path)
    total_duration = tts_duration + lead_in + lead_out
    image_duration = total_duration / max(len(image_paths), 1)
    lead_in_ms = int(lead_in * 1000)
    transition_duration = 0.0
    if enable_image_transitions and len(image_paths) > 1:
        transition_duration = min(0.45, image_duration * 0.35)
        if transition_duration < 0.12:
            transition_duration = 0.0

    cmd = [FFMPEG_BIN, "-y", "-loglevel", "error"]
    for idx, img in enumerate(image_paths):
        loop_duration = image_duration if idx == 0 or transition_duration == 0 else image_duration + transition_duration
        cmd += ["-loop", "1", "-t", f"{loop_duration:.3f}", "-i", img]

    tts_input_idx = len(image_paths)
    cmd += ["-i", audio_path]
    music_input_idx = None

    # Audio: delay TTS by lead_in, pad with silence for lead_out
    if music_path:
        music_input_idx = len(image_paths) + 1
        cmd += ["-stream_loop", "-1", "-i", music_path]
        audio_filter = (
            f"[{tts_input_idx}:a]volume={speech_volume:.2f},"
            f"adelay={lead_in_ms}:all=1,"
            f"apad=whole_dur={total_duration:.3f}[speech];"
            f"[{music_input_idx}:a]volume={music_volume:.2f},"
            f"atrim=duration={total_duration:.3f}[music];"
            f"[speech][music]amix=inputs=2:duration=first[aout]"
        )
    else:
        audio_filter = (
            f"[{tts_input_idx}:a]volume={speech_volume:.2f},"
            f"adelay={lead_in_ms}:all=1,"
            f"apad=whole_dur={total_duration:.3f}[aout]"
        )

    filter_parts: list[str] = []
    base_video_filter = (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},fps=25,setsar=1,format=yuv420p"
    )
    for idx, _ in enumerate(image_paths):
        loop_duration = image_duration if idx == 0 or transition_duration == 0 else image_duration + transition_duration
        filter_parts.append(
            f"[{idx}:v]{base_video_filter},trim=duration={loop_duration:.3f},setpts=PTS-STARTPTS[v{idx}]"
        )

    current_video = "v0"
    if transition_duration > 0:
        for idx in range(1, len(image_paths)):
            output_label = f"vx{idx}"
            offset = image_duration * idx - transition_duration
            filter_parts.append(
                f"[{current_video}][v{idx}]xfade=transition=fade:duration={transition_duration:.3f}:offset={offset:.3f}[{output_label}]"
            )
            current_video = output_label

        enable_expr = "+".join(
            f"between(t,{image_duration * idx - transition_duration:.3f},{image_duration * idx:.3f})"
            for idx in range(1, len(image_paths))
        )
        filter_parts.append(f"[{current_video}]gblur=sigma=12:enable='{enable_expr}'[vblur]")
        current_video = "vblur"

    # ASS subtitles: style embedded in file, PlayRes matches video dims → exact pixel sizes
    if ass_path:
        escaped = ass_path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        filter_parts.append(f"[{current_video}]subtitles='{escaped}'[vsub]")
        current_video = "vsub"

    if watermark:
        escaped_wm = watermark.replace("'", "\\'").replace(":", "\\:")
        filter_parts.append(
            f"[{current_video}]drawtext=text='{escaped_wm}':fontcolor=white:fontsize=28:"
            f"x=w-tw-20:y=20:box=1:boxcolor=black@0.5:boxborderw=6[vwm]"
        )
        current_video = "vwm"

    cmd += [
        "-filter_complex", ";".join(filter_parts + [audio_filter]),
        "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-map", f"[{current_video}]", "-map", "[aout]",
        "-c:a", "aac", "-b:a", "192k",
        "-t", f"{total_duration:.3f}",
        "-movflags", "+faststart",
        output_path,
    ]

    return cmd


async def generate_video_stream(
    project_id: str,
    image_paths: list[str],
    audio_path: str,
    subtitles: list[dict],
    music_path: str | None,
    music_volume: float,
    speech_volume: float,
    subtitle_style: dict,
    watermark: str,
    formats: list[dict],
    output_dir: str,
    lead_in: float = 2.0,
    lead_out: float = 2.0,
    audio_duration: float = 0.0,
    enable_image_transitions: bool = True,
) -> AsyncGenerator[str, None]:
    results = []
    total = len(formats)

    yield _progress("start", 0, "Начало генерации видео...")
    await asyncio.sleep(0.1)

    for i, fmt in enumerate(formats):
        base_pct = int((i / total) * 90)
        fmt_name = fmt["id"]
        width = fmt["width"]
        height = fmt["height"]
        output_path = str(Path(output_dir) / f"{fmt_name}.mp4")

        yield _progress("render", base_pct + 5, f"Рендеринг {fmt_name} ({width}×{height})...")
        await asyncio.sleep(0.05)

        # Generate ASS per format so PlayResX/Y match exact video dimensions
        ass_path = None
        if subtitles:
            ass_path = str(save_subtitles_ass(
                subtitles=subtitles,
                project_id=project_id,
                time_offset=lead_in,
                width=width,
                height=height,
                style=subtitle_style,
                fmt_id=fmt_name,
            ))

        cmd = _build_ffmpeg_cmd(
            image_paths=image_paths,
            audio_path=audio_path,
            ass_path=ass_path,
            music_path=music_path,
            music_volume=music_volume,
            speech_volume=speech_volume,
            watermark=watermark,
            width=width,
            height=height,
            output_path=output_path,
            lead_in=lead_in,
            lead_out=lead_out,
            audio_duration=audio_duration,
            enable_image_transitions=enable_image_transitions,
        )

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await proc.communicate()

            if proc.returncode != 0:
                err = stderr.decode("utf-8", errors="replace")
                yield _progress("error", base_pct, f"Ошибка ffmpeg: {err[:200]}", error=err)
                return

            size = Path(output_path).stat().st_size
            results.append({"format": fmt_name, "path": output_path, "size": size})
            yield _progress("render", base_pct + int(90 / total), f"{fmt_name} готов ({size // 1024} KB)")

        except FileNotFoundError:
            yield _progress(
                "error", 0,
                f"ffmpeg не найден по пути: {FFMPEG_BIN}",
                done=True,
                error="ffmpeg not found",
            )
            return
        except Exception as e:
            yield _progress("error", base_pct, f"Ошибка: {e}", done=True, error=str(e))
            return

    yield _progress("done", 100, f"Готово! Создано {len(results)} файлов", done=True, files=results)
