"""
Silero TTS v5 — built-in speech synthesis, no Docker or external services required.
"""
from __future__ import annotations

import io
import re
import logging
from typing import Literal

import numpy as np
import torch

from database import DATA_DIR

logger = logging.getLogger(__name__)

MODELS_DIR = DATA_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

MODEL_FILE = MODELS_DIR / "v5_ru.pt"
MODEL_URL = "https://models.silero.ai/models/tts/ru/v5_ru.pt"

_DEVICE = torch.device("cpu")  # Silero v5 — CPU only
_model: object | None = None



# ─── Model ────────────────────────────────────────────────────────────────────

def _ensure_model() -> object:
    global _model
    if _model is not None:
        return _model

    if not MODEL_FILE.exists():
        logger.info("Downloading Silero v5_ru.pt…")
        torch.hub.download_url_to_file(MODEL_URL, str(MODEL_FILE))

    _model = torch.package.PackageImporter(str(MODEL_FILE)).load_pickle("tts_models", "model")
    _model.to(_DEVICE)  # type: ignore[attr-defined]
    logger.info("Silero model loaded on CPU.")
    return _model


# ─── Text preprocessing ───────────────────────────────────────────────────────

def _clean(text: str) -> str:
    text = re.sub(r'https?://\S+', '', text)           # URLs
    text = re.sub(r'<[^>]+>', '', text)                # HTML
    text = re.sub(r'[*_`#~]', '', text)                # markdown
    text = re.sub(r'\.[ \t]*\n{1,}', '. ', text)      # "sentence.\nparagraph" → keep dot
    text = re.sub(r'\n{2,}', '. ', text)               # blank lines → pause
    text = re.sub(r'\n', ' ', text)
    text = re.sub(r'\.{2,}', '.', text)                # "word.." → "word."
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'[^\wа-яёА-ЯЁ\s.,!?;:\-–—«»"\'()]', '', text, flags=re.UNICODE)
    return text.strip()



def _split_sentences(text: str) -> list[str]:
    """Split at sentence boundaries (.!?) — keeps natural intonation."""
    parts = re.split(r'(?<=[.!?])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


# ─── Synthesis ────────────────────────────────────────────────────────────────

def _synth_one(model: object, text: str, voice: str, sample_rate: int, _depth: int = 0) -> np.ndarray:
    """
    Synthesise one chunk. If Silero reports the text is too long,
    automatically splits it in half at a word boundary and retries
    (up to 4 levels of recursion — covers even very long words).
    """
    text = text.strip()
    if not text:
        return np.zeros(int(sample_rate * 0.1), dtype=np.float32)

    if text[-1] not in ".!?":
        text += "."

    try:
        audio: torch.Tensor = model.apply_tts(  # type: ignore[attr-defined]
            text=text,
            speaker=voice,
            sample_rate=sample_rate,
        )
        return audio.numpy()
    except Exception as exc:
        is_length_error = "too long" in str(exc).lower() or "couldn't generate" in str(exc).lower()

        if is_length_error and _depth < 4 and len(text) > 8:
            # Split in half at nearest word boundary
            mid = len(text) // 2
            left_end = text.rfind(" ", 0, mid)
            if left_end <= 0:
                left_end = mid
            left = text[:left_end].strip()
            right = text[left_end:].strip()
            logger.debug("Auto-split depth=%d: %d chars → %d + %d", _depth, len(text), len(left), len(right))
            silence = np.zeros(int(sample_rate * 0.15), dtype=np.float32)
            return np.concatenate([
                _synth_one(model, left,  voice, sample_rate, _depth + 1),
                silence,
                _synth_one(model, right, voice, sample_rate, _depth + 1),
            ])

        logger.warning("Chunk synthesis failed (%s): %r — using silence", exc, text[:80])
        return np.zeros(int(sample_rate * 0.2), dtype=np.float32)


def synthesize(
    text: str,
    voice: str = "kseniya",
    sample_rate: int = 48000,
    fmt: Literal["mp3", "wav"] = "mp3",
) -> bytes:
    model = _ensure_model()
    text = _clean(text)

    if not text:
        raise ValueError("Text is empty after cleaning.")

    chunks = _split_sentences(text)
    if not chunks:
        raise ValueError("Could not split text into sentences.")

    logger.info("TTS: %d sentences from %d chars", len(chunks), len(text))
    for i, c in enumerate(chunks):
        logger.debug("  [%d/%d] %d chars: %r", i + 1, len(chunks), len(c), c[:60])

    silence = np.zeros(int(sample_rate * 0.25), dtype=np.float32)
    parts: list[np.ndarray] = []

    for i, chunk in enumerate(chunks):
        parts.append(_synth_one(model, chunk, voice, sample_rate))
        if i < len(chunks) - 1:
            parts.append(silence)

    combined = np.concatenate(parts)
    return _to_mp3(combined, sample_rate) if fmt == "mp3" else _to_wav(combined, sample_rate)


def _to_mp3(audio: np.ndarray, sample_rate: int) -> bytes:
    import lameenc
    samples = (audio * 32767).astype(np.int16)
    enc = lameenc.Encoder()
    enc.set_bit_rate(192)
    enc.set_in_sample_rate(sample_rate)
    enc.set_channels(1)
    enc.set_quality(2)
    return enc.encode(samples.tobytes()) + enc.flush()


def _to_wav(audio: np.ndarray, sample_rate: int) -> bytes:
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, audio, sample_rate, format="WAV", subtype="PCM_24")
    return buf.getvalue()


AVAILABLE_VOICES = ["kseniya", "aidar", "baya", "irina", "ruslan"]
