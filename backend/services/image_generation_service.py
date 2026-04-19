from __future__ import annotations

import base64
import json
import time

import httpx
from database import DATA_DIR
from services.project_naming import get_project_slug


OPENAI_IMAGE_PROMPT_MODEL = "gpt-5.4-mini"
GEMINI_IMAGE_PROMPT_MODEL = "gemini-2.5-flash"


def _build_prompt_planner_instruction(source_text: str, creative_direction: str, count: int) -> str:
    return f"""Ты создаёшь промпты для генерации кадров короткого видео.

Нужно вернуть {count} отдельных промптов на русском языке для генерации {count} разных изображений по содержанию текста.

Требования:
- Каждый промпт должен описывать отдельную сцену или отдельный визуальный момент.
- Все промпты вместе должны покрывать содержание текста последовательно и логично.
- Промпты должны быть пригодны для text-to-image генерации: сцена, композиция, объекты, атмосфера, свет, стиль, ракурс.
- Каждый промпт должен быть ориентирован на вертикальную композицию 9:16.
- Во всех промптах нужен реалистичный визуальный стиль, фотореализм или близкий к нему cinematic realism.
- Во всех промптах явно избегай текста внутри изображения, надписей, типографики, логотипов, интерфейсов и коллажей.
- Если передано визуальное направление, учитывай его во всех сценах.
- Верни только JSON-массив строк без пояснений.

Текст ролика:
{source_text.strip()}

Визуальное направление:
{creative_direction.strip() or "Сделай современный, чистый, реалистичный визуальный стиль для новостного/инфо-видео."}
"""


def _build_image_generation_prompt(prompt: str) -> str:
    return (
        f"{prompt.strip()}\n\n"
        "Дополнительные требования: вертикальная композиция 9:16, реализм, фотореалистичный cinematic look, "
        "без текста, без надписей, без логотипов, без интерфейсов."
    )


def _parse_prompt_list(raw: str, count: int) -> list[str]:
    import re
    text = raw.strip()
    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    text = re.sub(r"^```[a-z]*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```$", "", text)
    text = text.strip()
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


async def generate_scene_prompts(
    *,
    provider: str,
    model: str,
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
            model=model,
            messages=[
                {"role": "system", "content": "Ты создаёшь качественные scene-prompts для image generation и отвечаешь строго JSON-массивом строк."},
                {"role": "user", "content": instruction},
            ],
            temperature=0.7,
        )
        content = response.choices[0].message.content or "[]"
        prompts = _parse_prompt_list(content, count)
    elif provider == "anthropic":
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            system="Ты создаёшь качественные scene-prompts для image generation и отвечаешь строго JSON-массивом строк.",
            messages=[{"role": "user", "content": instruction}],
        )
        content = response.content[0].text if response.content else "[]"
        prompts = _parse_prompt_list(content, count)
    elif provider == "mistral":
        from mistralai import Mistral

        client = Mistral(api_key=api_key)
        response = await client.chat.complete_async(
            model=model,
            messages=[
                {"role": "system", "content": "Ты создаёшь качественные scene-prompts для image generation и отвечаешь строго JSON-массивом строк."},
                {"role": "user", "content": instruction},
            ],
        )
        content = response.choices[0].message.content or "[]"
        prompts = _parse_prompt_list(content, count)
    elif provider == "gemini":
        import google.generativeai as genai

        genai.configure(api_key=api_key)
        gemini = genai.GenerativeModel(
            model_name=model,
            system_instruction="Ты создаёшь качественные scene-prompts для image generation и отвечаешь строго JSON-массивом строк.",
        )
        response = await gemini.generate_content_async(instruction)
        content = response.text or "[]"
        prompts = _parse_prompt_list(content, count)
    else:
        raise ValueError(f"Unsupported image provider: {provider}")

    if len(prompts) < count:
        raise RuntimeError("LLM did not return enough image prompts")
    return prompts[:count]


def _save_generated_image(project_id: str, slot: int, image_bytes: bytes, extension: str = ".png") -> dict:
    images_dir = DATA_DIR / "projects" / project_id / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    project_slug = get_project_slug(project_id)
    ts = int(time.time() * 1000)
    filename = f"{project_slug}_generated_{slot:03d}_{ts}{extension}"
    path = images_dir / filename
    path.write_bytes(image_bytes)
    return {"id": filename, "filename": filename, "order": slot - 1}


def _clear_stale_generated(project_id: str, keep_count: int) -> None:
    images_dir = DATA_DIR / "projects" / project_id / "images"
    if not images_dir.exists():
        return
    project_slug = get_project_slug(project_id)
    for old in images_dir.glob("*_generated_*.*"):
        stem = old.stem
        try:
            slot = int(stem.split("_")[-1])
        except ValueError:
            continue
        if slot > keep_count:
            old.unlink(missing_ok=True)


async def _generate_image_openai(model: str, api_key: str, prompt: str) -> bytes:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    is_dalle3 = model == "dall-e-3"
    kwargs: dict = dict(
        model=model,
        prompt=_build_image_generation_prompt(prompt),
        # Portrait 9:16 for dall-e-3; gpt-image-1 uses auto sizing
        size="1024x1792" if is_dalle3 else "1024x1536",
        quality="standard" if is_dalle3 else "medium",
    )
    if is_dalle3:
        # dall-e-3 defaults to URL; must opt in to b64
        kwargs["response_format"] = "b64_json"

    response = await client.images.generate(**kwargs)
    if not response.data or not response.data[0].b64_json:
        raise RuntimeError("OpenAI did not return image data")
    return base64.b64decode(response.data[0].b64_json)


async def _generate_image_gemini(client: httpx.AsyncClient, model: str, api_key: str, prompt: str) -> tuple[bytes, str]:
    full_prompt = _build_image_generation_prompt(prompt)

    response = await client.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json={"contents": [{"parts": [{"text": full_prompt}]}]},
    )
    if not response.is_success:
        raise RuntimeError(f"Gemini API error {response.status_code}: {response.text}")
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
        candidates = data.get("candidates", [])
        finish_reason = candidates[0].get("finishReason", "unknown") if candidates else "no candidates"
        raise RuntimeError(f"Gemini did not return image data (finishReason: {finish_reason})")
    return base64.b64decode(inline_data), mime_type


async def generate_single_image_for_slot(
    *,
    project_id: str,
    provider: str,
    model: str,
    api_key: str,
    prompt: str,
    slot: int,
) -> dict:
    if provider == "openai":
        image_bytes = await _generate_image_openai(model, api_key, prompt)
        return _save_generated_image(project_id, slot, image_bytes, ".png")

    elif provider == "gemini":
        async with httpx.AsyncClient(timeout=180) as client:
            image_bytes, mime_type = await _generate_image_gemini(client, model, api_key, prompt)
        ext = ".png" if "png" in mime_type else ".jpg"
        return _save_generated_image(project_id, slot, image_bytes, ext)

    else:
        raise ValueError(f"Unsupported image provider: {provider}")


async def generate_project_images(
    *,
    project_id: str,
    provider: str,
    model: str,
    api_key: str,
    source_text: str,
    creative_direction: str,
    count: int,
    prompts: list[str] | None = None,
) -> dict:
    if count < 1:
        raise ValueError("Count must be at least 1")
    if not source_text.strip():
        raise ValueError("Source text is required")

    scene_prompts = prompts if prompts else await generate_scene_prompts(
        provider="openai" if provider == "openai" else "gemini",
        model=OPENAI_IMAGE_PROMPT_MODEL if provider == "openai" else GEMINI_IMAGE_PROMPT_MODEL,
        api_key=api_key,
        source_text=source_text,
        creative_direction=creative_direction,
        count=count,
    )
    results: list[dict] = []

    if provider == "openai":
        for idx, prompt in enumerate(scene_prompts):
            image_bytes = await _generate_image_openai(model, api_key, prompt)
            results.append(_save_generated_image(project_id, idx + 1, image_bytes, ".png"))

    elif provider == "gemini":
        async with httpx.AsyncClient(timeout=180) as client:
            for idx, prompt in enumerate(scene_prompts):
                image_bytes, mime_type = await _generate_image_gemini(client, model, api_key, prompt)
                ext = ".png" if "png" in mime_type else ".jpg"
                results.append(_save_generated_image(project_id, idx + 1, image_bytes, ext))
    else:
        raise ValueError(f"Unsupported image provider: {provider}")

    _clear_stale_generated(project_id, count)
    return {"images": results, "prompts": scene_prompts}
