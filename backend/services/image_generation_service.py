from __future__ import annotations

import base64
import json

import httpx
from database import DATA_DIR


OPENAI_IMAGE_PROMPT_MODEL = "gpt-5.4-mini"
GEMINI_IMAGE_PROMPT_MODEL = "gemini-2.5-flash"


def _build_prompt_planner_instruction(source_text: str, creative_direction: str, count: int) -> str:
    return f"""Ты создаёшь промпты для генерации кадров короткого видео.

Нужно вернуть {count} отдельных промптов на русском языке для генерации {count} разных изображений по содержанию текста.

Требования:
- Каждый промпт должен описывать отдельную сцену или отдельный визуальный момент.
- Все промпты вместе должны покрывать содержание текста последовательно и логично.
- Промпты должны быть пригодны для text-to-image генерации: сцена, композиция, объекты, атмосфера, свет, стиль, ракурс.
- Избегай текста внутри изображения, логотипов, интерфейсов и коллажей, если это не требуется явно.
- Если передано визуальное направление, учитывай его во всех сценах.
- Верни только JSON-массив строк без пояснений.

Текст ролика:
{source_text.strip()}

Визуальное направление:
{creative_direction.strip() or "Сделай современный, чистый, реалистичный визуальный стиль для новостного/инфо-видео."}
"""


def _parse_prompt_list(raw: str, count: int) -> list[str]:
    text = raw.strip()
    try:
        data = json.loads(text)
        if isinstance(data, list):
            prompts = [str(item).strip() for item in data if str(item).strip()]
            if prompts:
                return prompts[:count]
    except Exception:
        pass

    lines = [line.strip(" -•\t") for line in text.splitlines() if line.strip()]
    prompts = [line for line in lines if line]
    return prompts[:count]


async def _generate_scene_prompts(
    *,
    provider: str,
    api_key: str,
    source_text: str,
    creative_direction: str,
    count: int,
) -> list[str]:
    instruction = _build_prompt_planner_instruction(source_text, creative_direction, count)

    if provider == "openai":
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        response = await client.chat.completions.create(
            model=OPENAI_IMAGE_PROMPT_MODEL,
            messages=[
                {"role": "system", "content": "Ты создаёшь качественные scene-prompts для image generation и отвечаешь строго JSON-массивом строк."},
                {"role": "user", "content": instruction},
            ],
            temperature=0.7,
        )
        content = response.choices[0].message.content or "[]"
        prompts = _parse_prompt_list(content, count)
    elif provider == "gemini":
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_IMAGE_PROMPT_MODEL}:generateContent",
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                json={
                    "contents": [{
                        "parts": [{"text": instruction}],
                    }]
                },
            )
            response.raise_for_status()
            data = response.json()
            content = ""
            for candidate in data.get("candidates", []):
                for part in candidate.get("content", {}).get("parts", []):
                    if "text" in part:
                        content += part["text"]
            prompts = _parse_prompt_list(content, count)
    else:
        raise ValueError(f"Unsupported image provider: {provider}")

    if len(prompts) < count:
        raise RuntimeError("LLM did not return enough image prompts")
    return prompts[:count]


def _save_generated_image(project_id: str, slot: int, image_bytes: bytes, extension: str = ".png") -> dict:
    images_dir = DATA_DIR / "projects" / project_id / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    filename = f"generated_{slot:03d}{extension}"
    for old in images_dir.glob(f"generated_{slot:03d}.*"):
        old.unlink(missing_ok=True)
    path = images_dir / filename
    path.write_bytes(image_bytes)
    return {"id": filename, "filename": filename, "order": slot - 1}


def _clear_stale_generated(project_id: str, keep_count: int) -> None:
    images_dir = DATA_DIR / "projects" / project_id / "images"
    if not images_dir.exists():
        return
    for old in images_dir.glob("generated_*.*"):
        stem = old.stem
        try:
            slot = int(stem.split("_")[-1])
        except ValueError:
            continue
        if slot > keep_count:
            old.unlink(missing_ok=True)


async def generate_project_images(
    *,
    project_id: str,
    provider: str,
    model: str,
    api_key: str,
    source_text: str,
    creative_direction: str,
    count: int,
) -> dict:
    if count < 1:
        raise ValueError("Count must be at least 1")
    if not source_text.strip():
        raise ValueError("Source text is required")

    prompts = await _generate_scene_prompts(
        provider=provider,
        api_key=api_key,
        source_text=source_text,
        creative_direction=creative_direction,
        count=count,
    )
    results: list[dict] = []

    if provider == "openai":
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        for idx, prompt in enumerate(prompts):
            response = await client.images.generate(
                model=model,
                prompt=prompt,
                size="1024x1024",
                quality="medium",
            )
            if not response.data or not response.data[0].b64_json:
                raise RuntimeError("OpenAI did not return image data")
            image_bytes = base64.b64decode(response.data[0].b64_json)
            results.append(_save_generated_image(project_id, idx + 1, image_bytes, ".png"))

    elif provider == "gemini":
        async with httpx.AsyncClient(timeout=180) as client:
            for idx, prompt in enumerate(prompts):
                response = await client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                    headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                    json={
                        "contents": [{
                            "parts": [{"text": prompt}],
                        }]
                    },
                )
                response.raise_for_status()
                data = response.json()
                inline_data = None
                mime_type = "image/png"
                for candidate in data.get("candidates", []):
                    for part in candidate.get("content", {}).get("parts", []):
                        if "inlineData" in part:
                            inline_data = part["inlineData"].get("data")
                            mime_type = part["inlineData"].get("mimeType", mime_type)
                            break
                    if inline_data:
                        break
                if not inline_data:
                    raise RuntimeError("Gemini did not return image data")
                image_bytes = base64.b64decode(inline_data)
                ext = ".png" if "png" in mime_type else ".jpg"
                results.append(_save_generated_image(project_id, idx + 1, image_bytes, ext))
    else:
        raise ValueError(f"Unsupported image provider: {provider}")

    _clear_stale_generated(project_id, count)
    return {"images": results, "prompts": prompts}
