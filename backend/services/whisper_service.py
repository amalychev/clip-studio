from __future__ import annotations

import os
import threading
from pathlib import Path

_lock = threading.Lock()
_model = None
_model_size: str | None = None


def _ensure_ffmpeg_in_path() -> None:
    """Add bundled ffmpeg directory to PATH so whisper can find it."""
    ffmpeg_bin = os.environ.get("FFMPEG_BIN", "")
    if ffmpeg_bin:
        ffmpeg_dir = os.path.dirname(ffmpeg_bin)
        path = os.environ.get("PATH", "")
        if ffmpeg_dir not in path:
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + path


def _load_audio_numpy(audio_path: Path) -> "np.ndarray":
    """Decode audio to 16 kHz mono float32 using the bundled ffmpeg binary."""
    import subprocess
    import numpy as np

    ffmpeg_bin = os.environ.get("FFMPEG_BIN", "ffmpeg")
    proc = subprocess.run(
        [
            ffmpeg_bin,
            "-nostdin",
            "-i", str(audio_path),
            "-f", "f32le",   # raw float32 little-endian PCM
            "-ac", "1",      # mono
            "-ar", "16000",  # 16 kHz (whisper requirement)
            "-",
        ],
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg decode failed: {proc.stderr.decode()[:300]}")
    return np.frombuffer(proc.stdout, dtype=np.float32)


def _get_model(size: str = "small"):
    global _model, _model_size
    with _lock:
        if _model is None or _model_size != size:
            import whisper
            _model = whisper.load_model(size)
            _model_size = size
    return _model


def transcribe_for_subtitles(audio_path: Path, model_size: str = "small") -> list[dict]:
    """
    Transcribe audio with Whisper and return subtitle entries with word-level timestamps.
    Uses torchaudio for decoding (no system ffmpeg required).
    """
    import whisper

    MAX_CHARS = 70

    _ensure_ffmpeg_in_path()
    model = _get_model(model_size)

    audio = _load_audio_numpy(audio_path)

    result = whisper.transcribe(
        model,
        audio,
        language="ru",
        word_timestamps=True,
        verbose=False,
    )

    all_words: list[dict] = []
    for segment in result.get("segments", []):
        for w in segment.get("words", []):
            text = w["word"].strip()
            if text:
                all_words.append({
                    "text": text,
                    "start": float(w["start"]),
                    "end": float(w["end"]),
                })

    if not all_words:
        return []

    subtitles: list[dict] = []
    index = 1
    group: list[dict] = []
    group_text = ""

    def flush() -> None:
        nonlocal index, group, group_text
        if not group:
            return
        subtitles.append({
            "index": index,
            "startTime": round(group[0]["start"], 3),
            "endTime": round(group[-1]["end"], 3),
            "text": group_text,
            "words": [
                {
                    "text": w["text"],
                    "startTime": round(w["start"], 3),
                    "endTime": round(w["end"], 3),
                }
                for w in group
            ],
        })
        index += 1
        group.clear()
        group_text = ""

    for word in all_words:
        candidate = (group_text + " " + word["text"]).strip() if group_text else word["text"]
        if group and len(candidate) > MAX_CHARS:
            flush()
            candidate = word["text"]
        group.append(word)
        group_text = candidate
        # Flush at sentence boundary
        if word["text"].endswith((".", "!", "?")):
            flush()
        # Flush at comma boundary only when group is substantial
        elif word["text"].endswith(",") and len(group_text) >= MAX_CHARS // 2:
            flush()

    flush()
    return subtitles
