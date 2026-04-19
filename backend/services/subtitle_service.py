import re
import textwrap
from pathlib import Path
from database import DATA_DIR
from services.project_naming import get_project_slug

WORD_RE = re.compile(r'[^\s.,!?;:()"«»]+', re.UNICODE)
SENTENCE_SPLIT_RE = re.compile(r'(?<=[.!?…])(?:["»)]*)\s+|\n+')
SUBTITLE_TIME_SHIFT = 0.0


def _split_long_sentence(sentence: str, max_chars: int) -> list[str]:
    """Prefer commas for oversized sentences; fall back to word boundaries only if needed."""
    parts = [part.strip() for part in re.split(r'(?<=,)\s*', sentence) if part.strip()]
    if len(parts) <= 1:
        parts = [sentence.strip()]

    segments: list[str] = []
    current = ""
    for part in parts:
        candidate = f"{current} {part}".strip() if current else part
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            segments.append(current.strip())

        if len(part) <= max_chars:
            current = part
            continue

        # Still too long: only now split by words.
        words = part.split()
        current = ""
        for word in words:
            word_candidate = f"{current} {word}".strip() if current else word
            if len(word_candidate) <= max_chars:
                current = word_candidate
            else:
                if current:
                    segments.append(current.strip())
                current = word

    if current:
        segments.append(current.strip())
    return segments


def _split_into_segments(text: str, max_chars: int = 80) -> list[str]:
    """Split subtitles with priority on sentence boundaries, then commas if the sentence is too long."""
    raw_parts = SENTENCE_SPLIT_RE.split(text.strip())
    sentences = [part.strip() for part in raw_parts if part and part.strip()]
    segments: list[str] = []

    for sentence in sentences:
        if len(sentence) <= max_chars:
            segments.append(sentence)
        else:
            segments.extend(_split_long_sentence(sentence, max_chars))

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


def generate_subtitles(text: str, duration: float, split_by_words: bool = False) -> list[dict]:
    if split_by_words:
        return _generate_by_words(text, duration)

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


def _generate_by_words(text: str, duration: float) -> list[dict]:
    words = WORD_RE.findall(text)
    if not words:
        return []

    total_chars = sum(max(len(w), 1) for w in words)
    subtitles = []
    current_time = 0.0

    for i, word in enumerate(words):
        char_ratio = max(len(word), 1) / total_chars
        seg_duration = max(0.15, min(2.0, duration * char_ratio))
        end_time = min(current_time + seg_duration, duration)

        subtitles.append({
            "index": i + 1,
            "startTime": round(current_time, 3),
            "endTime": round(end_time, 3),
            "text": word,
            "words": [{"text": word, "startTime": round(current_time, 3), "endTime": round(end_time, 3)}],
        })
        current_time = end_time

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


def _shift_subtitle_time(seconds: float, time_offset: float) -> float:
    return max(0.0, seconds + time_offset + SUBTITLE_TIME_SHIFT)


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


def _highlight_line(line_text: str, word_offset: int, active_word_index: int) -> str:
    """Build ASS highlight text for a single pre-wrapped line."""
    parts: list[str] = []
    for token in _split_word_tokens(line_text):
        escaped = _escape_ass_text(str(token["text"]))
        if not token["is_word"]:
            parts.append(r"{\alpha&HFF&}" + escaped)
        elif token["word_index"] + word_offset == active_word_index:
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
    line_spacing_ratio = max(100, min(300, style.get("lineSpacing", 150))) / 100
    line_spacing_px = font_size * line_spacing_ratio
    # borderRadius as % of font_size → outline radius for rounded corners.
    # Technique: Layer 0 renders the text in bg_color with a large border of the
    # same color — this fills the glyph area + extends outward creating a rounded
    # blob. Layer 1 renders the actual text with no background on top.
    border_radius_pct = max(0, min(50, style.get("borderRadius", 30)))
    radius_px = int(font_size * border_radius_pct / 100)
    rounded = radius_px > 0
    # For square boxes (radius=0) keep the simpler BorderStyle=3 path.
    box_outline = max(1, font_size // 5)  # padding for BorderStyle=3
    text_color = _hex_to_ass(style.get("textColor", "#ffffff"), 100)
    active_word_color = _hex_to_ass(style.get("activeWordColor", "#facc15"), 100)
    bg_color_opaque = _hex_to_ass(style.get("bgColor", "#2563eb"), 100)
    bg_color = _hex_to_ass(style.get("bgColor", "#2563eb"), style.get("bgOpacity", 100))
    transparent = "&HFF000000"
    bold = -1 if style.get("bold", True) else 0
    highlight_active_word = bool(style.get("highlightActiveWord", True))
    pos = style.get("position", "bottom")
    margin_v = int(height * style.get("positionMargin", 5) / 100)
    margin_h = int(width * 0.05)

    an = 2 if pos == "bottom" else (8 if pos == "top" else 5)
    cx = width // 2
    chars_per_line = max(10, int((width - 2 * margin_h) / (font_size * 0.52)))

    fmt = ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, "
           "Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, "
           "Shadow, Alignment, MarginL, MarginR, MarginV, Encoding")

    if rounded:
        # TextBg: glyph + border both in bg_color → solid rounded blob
        # TextFg: text only, no background (BorderStyle=1, Outline=0)
        style_bg = (f"Style: TextBg,Arial,{font_size},{bg_color_opaque},{bg_color_opaque},"
                    f"{bg_color_opaque},{transparent},"
                    f"{bold},0,0,0,100,100,0,0,1,{radius_px},0,{an},0,0,0,1")
        style_fg = (f"Style: TextFg,Arial,{font_size},{text_color},{text_color},"
                    f"{transparent},{transparent},"
                    f"{bold},0,0,0,100,100,0,0,1,0,0,{an},0,0,0,1")
        style_aw = (f"Style: ActiveWord,Arial,{font_size},{active_word_color},{active_word_color},"
                    f"{transparent},{transparent},"
                    f"-1,0,0,0,100,100,0,0,1,0,0,{an},0,0,0,1")
        styles_block = f"{style_bg}\n{style_fg}\n{style_aw}"
    else:
        style_def = (f"Style: Default,Arial,{font_size},{text_color},{text_color},"
                     f"{bg_color},{bg_color},"
                     f"{bold},0,0,0,100,100,0,0,3,{box_outline},0,{an},0,0,0,1")
        style_aw = (f"Style: ActiveWord,Arial,{font_size},{active_word_color},{active_word_color},"
                    f"{transparent},{transparent},"
                    f"-1,0,0,0,100,100,0,0,1,0,0,{an},0,0,0,1")
        styles_block = f"{style_def}\n{style_aw}"

    header = "\n".join([
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        fmt,
        styles_block,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ])

    events = []
    for sub in subtitles:
        start_seconds = _shift_subtitle_time(float(sub["startTime"]), time_offset)
        end_seconds = max(start_seconds + 0.01, _shift_subtitle_time(float(sub["endTime"]), time_offset))
        start = _format_ass_time(start_seconds)
        end = _format_ass_time(end_seconds)
        sub_text = str(sub["text"])

        lines = textwrap.wrap(sub_text.strip(), width=chars_per_line,
                              break_long_words=False, break_on_hyphens=False) or [sub_text.strip()]
        n = len(lines)

        # Offset y_base so the border doesn't overflow the margin edge
        r_adj = radius_px if rounded else 0
        if pos == "bottom":
            y_base = height - margin_v - r_adj
            line_ys = [y_base - (n - 1 - i) * line_spacing_px for i in range(n)]
        elif pos == "top":
            y_base = margin_v + r_adj
            line_ys = [y_base + i * line_spacing_px for i in range(n)]
        else:
            block_h = (n - 1) * line_spacing_px
            y_base = height / 2 - block_h / 2
            line_ys = [y_base + i * line_spacing_px for i in range(n)]

        for i, line_text in enumerate(lines):
            ly = round(line_ys[i])
            esc = _escape_ass_text(line_text)
            pos_tag = f"{{\\an{an}\\pos({cx},{ly})}}"
            if rounded:
                events.append(f"Dialogue: 0,{start},{end},TextBg,,0,0,0,,{pos_tag}{esc}")
                events.append(f"Dialogue: 1,{start},{end},TextFg,,0,0,0,,{pos_tag}{esc}")
            else:
                events.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{pos_tag}{esc}")

        words = sub.get("words") or _build_word_timings(sub_text, float(sub["startTime"]), float(sub["endTime"]))
        if highlight_active_word and words:
            line_word_counts = [len(WORD_RE.findall(l)) for l in lines]
            word_offsets: list[int] = [0]
            for c in line_word_counts[:-1]:
                word_offsets.append(word_offsets[-1] + c)

            aw_layer = 2 if rounded else 1
            for word_index, word in enumerate(words):
                word_start_seconds = _shift_subtitle_time(float(word["startTime"]), time_offset)
                word_end_seconds = max(word_start_seconds + 0.01, _shift_subtitle_time(float(word["endTime"]), time_offset))
                word_start = _format_ass_time(word_start_seconds)
                word_end = _format_ass_time(word_end_seconds)

                li = 0
                for k in range(1, len(word_offsets)):
                    if word_index >= word_offsets[k]:
                        li = k
                    else:
                        break

                ly = round(line_ys[li])
                hl = _highlight_line(lines[li], word_offsets[li], word_index)
                pos_tag = f"{{\\an{an}\\pos({cx},{ly})}}"
                events.append(f"Dialogue: {aw_layer},{word_start},{word_end},ActiveWord,,0,0,0,,{pos_tag}{hl}")

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
        start = _shift_subtitle_time(float(sub["startTime"]), time_offset)
        end = max(start + 0.01, _shift_subtitle_time(float(sub["endTime"]), time_offset))
        lines.append(f"{_format_srt_time(start)} --> {_format_srt_time(end)}")
        lines.append(sub["text"])
        lines.append("")

    srt_path.write_text("\n".join(lines), encoding="utf-8")
    return srt_path
