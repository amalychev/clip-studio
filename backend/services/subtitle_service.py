import re
from pathlib import Path
from database import DATA_DIR


def _split_into_segments(text: str, max_chars: int = 80) -> list[str]:
    """Split text into subtitle segments of reasonable length."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    segments = []
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) <= max_chars:
            segments.append(sentence)
        else:
            # Split long sentences by comma or at word boundaries
            parts = re.split(r',\s*', sentence)
            current = ""
            for part in parts:
                if not current:
                    current = part
                elif len(current) + len(part) + 2 <= max_chars:
                    current += ", " + part
                else:
                    if current:
                        segments.append(current.strip())
                    current = part
            if current:
                segments.append(current.strip())
    return segments if segments else [text.strip()]


def generate_subtitles(text: str, duration: float) -> list[dict]:
    segments = _split_into_segments(text)
    if not segments:
        return []

    total_chars = sum(len(s) for s in segments)
    subtitles = []
    current_time = 0.0

    for i, segment in enumerate(segments):
        char_ratio = len(segment) / max(total_chars, 1)
        seg_duration = duration * char_ratio
        # Minimum 1.5s, maximum 8s per subtitle
        seg_duration = max(1.5, min(8.0, seg_duration))

        end_time = min(current_time + seg_duration, duration)
        subtitles.append({
            "index": i + 1,
            "startTime": round(current_time, 3),
            "endTime": round(end_time, 3),
            "text": segment,
        })
        current_time = end_time + 0.1

        if current_time >= duration:
            break

    return subtitles


def _format_srt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _format_ass_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _hex_to_ass(hex_color: str, opacity: int = 100) -> str:
    """Convert #rrggbb + opacity 0-100 → ASS &HAABBGGRR (0=opaque, 255=transparent)."""
    h = hex_color.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    alpha = int((1 - opacity / 100) * 255)
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"


def save_subtitles_ass(
    subtitles: list[dict],
    project_id: str,
    time_offset: float,
    width: int,
    height: int,
    style: dict,
    fmt_id: str = "",
) -> Path:
    """Generate a proper ASS file with PlayRes matching video dimensions.

    FontSize and margins are in exact pixels — no libass scaling surprises.
    """
    subs_dir = DATA_DIR / "projects" / project_id / "subtitles"
    subs_dir.mkdir(parents=True, exist_ok=True)
    ass_path = subs_dir / f"subtitles_{fmt_id}.ass"

    font_size = max(8, int(height * style.get("fontSize", 2.5) / 100))
    outline = max(1, font_size // 5)
    text_color = _hex_to_ass(style.get("textColor", "#ffffff"), 100)
    bg_color = _hex_to_ass(style.get("bgColor", "#2563eb"), style.get("bgOpacity", 100))
    bold = -1 if style.get("bold", True) else 0
    pos = style.get("position", "bottom")
    alignment = 2 if pos == "bottom" else (8 if pos == "top" else 5)
    margin_v = int(height * style.get("positionMargin", 5) / 100)
    margin_h = int(width * 0.05)

    header = "\n".join([
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
        "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
        "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # OutlineColour = BackColour so the box color is correct in all libass versions
        f"Style: Default,Arial,{font_size},{text_color},{text_color},{bg_color},{bg_color},"
        f"{bold},0,0,0,100,100,0,0,3,{outline},0,{alignment},{margin_h},{margin_h},{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ])

    events = []
    for sub in subtitles:
        start = _format_ass_time(sub["startTime"] + time_offset)
        end = _format_ass_time(sub["endTime"] + time_offset)
        text = str(sub["text"]).replace("\n", "\\N")
        events.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")

    ass_path.write_text(header + "\n" + "\n".join(events) + "\n", encoding="utf-8")
    return ass_path


def save_subtitles_srt(subtitles: list[dict], project_id: str, time_offset: float = 0.0) -> Path:
    subs_dir = DATA_DIR / "projects" / project_id / "subtitles"
    subs_dir.mkdir(parents=True, exist_ok=True)
    srt_path = subs_dir / "subtitles.srt"

    lines = []
    for sub in subtitles:
        lines.append(str(sub["index"]))
        start = sub["startTime"] + time_offset
        end = sub["endTime"] + time_offset
        lines.append(f"{_format_srt_time(start)} --> {_format_srt_time(end)}")
        lines.append(sub["text"])
        lines.append("")

    srt_path.write_text("\n".join(lines), encoding="utf-8")
    return srt_path
