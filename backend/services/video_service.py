import asyncio
import json
import os
from pathlib import Path
from typing import AsyncGenerator
import mutagen
from services.subtitle_service import save_subtitles_ass
from services.project_naming import get_project_slug

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


def _get_edge_transition_duration(
    total_duration: float,
    transition_duration: float,
    enable_image_transitions: bool,
) -> float:
    if not enable_image_transitions or total_duration <= 0:
        return 0.0
    if transition_duration > 0:
        return transition_duration
    return min(0.45, total_duration / 2)


def _build_ffmpeg_cmd(
    image_paths: list[str],
    audio_path: str,
    ass_path: str | None,
    music_path: str | None,
    music_volume: float,
    speech_volume: float,
    watermark_path: str | None,
    width: int,
    height: int,
    output_path: str,
    lead_in: float = 2.0,
    lead_out: float = 2.0,
    audio_duration: float = 0.0,
    enable_image_transitions: bool = True,
    preview_mode: bool = False,
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

    watermark_input_idx = None
    if watermark_path:
        watermark_input_idx = len(image_paths) + 1 + (1 if music_path else 0)
        cmd += ["-i", watermark_path]

    filter_parts: list[str] = []
    fps = 18 if preview_mode else 25
    base_video_filter = (
        f"scale={width}:{height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},fps={fps},setsar=1,format=yuv420p"
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
    elif len(image_paths) > 1:
        concat_inputs = "".join(f"[v{idx}]" for idx in range(len(image_paths)))
        filter_parts.append(f"{concat_inputs}concat=n={len(image_paths)}:v=1:a=0[vcat]")
        current_video = "vcat"

    edge_transition_duration = _get_edge_transition_duration(
        total_duration=total_duration,
        transition_duration=transition_duration,
        enable_image_transitions=enable_image_transitions,
    )
    if edge_transition_duration > 0:
        edge_end_start = max(total_duration - edge_transition_duration, 0)
        edge_mix_expr = (
            f"min(1,"
            f"if(lt(T,{edge_transition_duration:.3f}),pow(1-T/{edge_transition_duration:.3f},2),0)+"
            f"if(gte(T,{edge_end_start:.3f}),pow((T-{edge_end_start:.3f})/{edge_transition_duration:.3f},2),0))"
        )
        filter_parts.append(f"[{current_video}]split[vedgebase][vedgeblurin]")
        filter_parts.append("[vedgeblurin]gblur=sigma=8[vedgeblur]")
        filter_parts.append(
            f"[vedgebase][vedgeblur]blend=all_expr='A*(1-({edge_mix_expr}))+B*({edge_mix_expr})'[vedge]"
        )
        current_video = "vedge"

    # ASS subtitles: style embedded in file, PlayRes matches video dims → exact pixel sizes
    if ass_path:
        escaped = ass_path.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
        filter_parts.append(f"[{current_video}]subtitles='{escaped}'[vsub]")
        current_video = "vsub"

    if watermark_path and watermark_input_idx is not None:
        wm_width = max(int(width * 0.12), 72)
        filter_parts.append(f"[{watermark_input_idx}:v]scale={wm_width}:-1[wm]")
        filter_parts.append(
            f"[{current_video}][wm]overlay=x=W-w-20:y=20:format=auto[vwm]"
        )
        current_video = "vwm"

    cmd += ["-filter_complex", ";".join(filter_parts + [audio_filter])]
    if preview_mode:
        cmd += [
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "fastdecode",
            "-crf", "31",
            "-g", "36",
            "-pix_fmt", "yuv420p",
            "-map", f"[{current_video}]", "-map", "[aout]",
            "-c:a", "aac", "-b:a", "96k",
            "-t", f"{total_duration:.3f}",
            "-movflags", "+faststart",
            output_path,
        ]
    else:
        cmd += [
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
    watermark_path: str | None,
    formats: list[dict],
    output_dir: str,
    lead_in: float = 2.0,
    lead_out: float = 2.0,
    audio_duration: float = 0.0,
    enable_image_transitions: bool = True,
) -> AsyncGenerator[str, None]:
    results = []
    total = len(formats)
    project_slug = get_project_slug(project_id)

    yield _progress("start", 0, "Начало генерации видео...")
    await asyncio.sleep(0.1)

    for i, fmt in enumerate(formats):
        base_pct = int((i / total) * 90)
        fmt_name = fmt["id"]
        width = fmt["width"]
        height = fmt["height"]
        output_file = Path(output_dir) / f"{project_slug}_{fmt_name}.mp4"
        for old in Path(output_dir).glob(f"*_{fmt_name}.mp4"):
            old.unlink(missing_ok=True)
        output_path = str(output_file)

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

        try:
            result = await render_video_file(
                project_id=project_id,
                image_paths=image_paths,
                audio_path=audio_path,
                subtitles=subtitles,
                music_path=music_path,
                music_volume=music_volume,
                speech_volume=speech_volume,
                subtitle_style=subtitle_style,
                watermark_path=watermark_path,
                width=width,
                height=height,
                output_path=output_path,
                lead_in=lead_in,
                lead_out=lead_out,
                audio_duration=audio_duration,
                enable_image_transitions=enable_image_transitions,
                fmt_id=fmt_name,
            )
            results.append({"format": fmt_name, "path": output_path, "size": result["size"]})
            yield _progress("render", base_pct + int(90 / total), f"{fmt_name} готов ({result['size'] // 1024} KB)")
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


async def render_video_file(
    project_id: str,
    image_paths: list[str],
    audio_path: str,
    subtitles: list[dict],
    music_path: str | None,
    music_volume: float,
    speech_volume: float,
    subtitle_style: dict,
    watermark_path: str | None,
    width: int,
    height: int,
    output_path: str,
    lead_in: float = 2.0,
    lead_out: float = 2.0,
    audio_duration: float = 0.0,
    enable_image_transitions: bool = True,
    fmt_id: str = "preview",
    preview_mode: bool = False,
) -> dict:
    ass_path = None
    if subtitles:
        ass_path = str(save_subtitles_ass(
            subtitles=subtitles,
            project_id=project_id,
            time_offset=lead_in,
            width=width,
            height=height,
            style=subtitle_style,
            fmt_id=fmt_id,
        ))

    temp_output_path = f"{output_path}.tmp.mp4" if preview_mode else output_path

    cmd = _build_ffmpeg_cmd(
        image_paths=image_paths,
        audio_path=audio_path,
        ass_path=ass_path,
        music_path=music_path,
        music_volume=music_volume,
        speech_volume=speech_volume,
            watermark_path=watermark_path,
            width=width,
            height=height,
        output_path=temp_output_path,
        lead_in=lead_in,
        lead_out=lead_out,
        audio_duration=audio_duration,
        enable_image_transitions=enable_image_transitions,
        preview_mode=preview_mode,
    )

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()

    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="replace")
        raise RuntimeError(f"Ошибка ffmpeg: {err[:200]}")

    output = Path(output_path)
    if preview_mode:
        temp_output = Path(temp_output_path)
        temp_output.replace(output)
    return {"path": str(output), "size": output.stat().st_size}
