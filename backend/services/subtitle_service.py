import re
from pathlib import Path
from database import DATA_DIR
from services.project_naming import get_project_slug

WORD_RE = re.compile(r'[^\s.,!?;:()"«»]+', re.UNICODE)


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


def _split_word_tokens(text: str) -> list[dict]:
    tokens: list[dict] = []
    last_index = 0
    word_index = 0

    for match in WORD_RE.finditer(text):
        start, end = match.span()
        if start > last_index:
            tokens.append({"text": text[last_index:start], "is_word": False, "word_index": None})
        tokens.append({"text": match.group(0), "is_word": True, "word_index": word_index})
        word_index += 1
        last_index = end

    if last_index < len(text):
        tokens.append({"text": text[last_index:], "is_word": False, "word_index": None})

    if not tokens:
        tokens.append({"text": text, "is_word": False, "word_index": None})

    return tokens


def _build_word_timings(text: str, start_time: float, end_time: float) -> list[dict]:
    word_tokens = [token for token in _split_word_tokens(text) if token["is_word"]]
    if not word_tokens:
        return []

    total_duration = max(end_time - start_time, 0.0)
    weighted_length = sum(max(len(token["text"]), 1) for token in word_tokens)
    cursor = start_time
    words = []

    for i, token in enumerate(word_tokens):
        if i == len(word_tokens) - 1:
            word_end = end_time
        else:
            duration = total_duration * (max(len(token["text"]), 1) / max(weighted_length, 1))
            word_end = min(end_time, cursor + duration)

        words.append({
            "text": token["text"],
            "startTime": round(cursor, 3),
            "endTime": round(word_end, 3),
        })
        cursor = word_end

    return words


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
            "words": _build_word_timings(segment, current_time, end_time),
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


def _escape_ass_text(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}").replace("\n", r"\N")


def _build_ass_highlight_text(text: str, active_word_index: int) -> str:
    parts: list[str] = []
    for token in _split_word_tokens(text):
        escaped = _escape_ass_text(str(token["text"]))
        if not token["is_word"]:
            parts.append(r"{\alpha&HFF&}" + escaped)
        elif token["word_index"] == active_word_index:
            parts.append(r"{\alpha&H00&}" + escaped)
        else:
            parts.append(r"{\alpha&HFF&}" + escaped)
    return "".join(parts)


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
    project_slug = get_project_slug(project_id)
    ass_path = subs_dir / f"{project_slug}_subtitles_{fmt_id}.ass"
    for old in subs_dir.glob(f"*_subtitles_{fmt_id}.ass"):
        old.unlink(missing_ok=True)

    font_size = max(8, int(height * style.get("fontSize", 2.5) / 100))
    outline = max(1, font_size // 5)
    text_color = _hex_to_ass(style.get("textColor", "#ffffff"), 100)
    active_word_color = _hex_to_ass(style.get("activeWordColor", "#facc15"), 100)
    bg_color = _hex_to_ass(style.get("bgColor", "#2563eb"), style.get("bgOpacity", 100))
    transparent = "&HFF000000"
    bold = -1 if style.get("bold", True) else 0
    highlight_active_word = bool(style.get("highlightActiveWord", True))
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
        f"Style: ActiveWord,Arial,{font_size},{active_word_color},{active_word_color},{transparent},{transparent},"
        f"-1,0,0,0,100,100,0,0,1,0,0,{alignment},{margin_h},{margin_h},{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ])

    events = []
    for sub in subtitles:
        start = _format_ass_time(sub["startTime"] + time_offset)
        end = _format_ass_time(sub["endTime"] + time_offset)
        text = _escape_ass_text(str(sub["text"]))
        events.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text}")

        words = sub.get("words") or _build_word_timings(str(sub["text"]), float(sub["startTime"]), float(sub["endTime"]))
        if highlight_active_word and words:
            for word_index, word in enumerate(words):
                word_start = _format_ass_time(float(word["startTime"]) + time_offset)
                word_end = _format_ass_time(float(word["endTime"]) + time_offset)
                highlight_text = _build_ass_highlight_text(str(sub["text"]), word_index)
                events.append(f"Dialogue: 1,{word_start},{word_end},ActiveWord,,0,0,0,,{highlight_text}")

    ass_path.write_text(header + "\n" + "\n".join(events) + "\n", encoding="utf-8")
    return ass_path


def save_subtitles_srt(subtitles: list[dict], project_id: str, time_offset: float = 0.0) -> Path:
    subs_dir = DATA_DIR / "projects" / project_id / "subtitles"
    subs_dir.mkdir(parents=True, exist_ok=True)
    project_slug = get_project_slug(project_id)
    srt_path = subs_dir / f"{project_slug}_subtitles.srt"
    for old in subs_dir.glob("*_subtitles.srt"):
        old.unlink(missing_ok=True)

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
