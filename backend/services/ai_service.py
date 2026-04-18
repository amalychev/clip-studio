SYSTEM_PROMPT = """Ты — редактор, который адаптирует тексты для синтеза речи (TTS).

Задача: преобразуй исходный текст так, чтобы он звучал естественно при озвучке:
- Убери все специальные символы, HTML-теги, ссылки и markdown
- Раскрой аббревиатуры и числа словами там где нужно
- Расставь естественные паузы через запятые и точки
- Убери лишние повторы и технический жаргон
- Сохрани смысл и структуру текста
- Верни только готовый текст без пояснений
"""


async def prepare_text_for_tts(text: str, provider: str, model: str, api_key: str) -> str:
    if provider == "openai":
        return await _openai(text, model, api_key)
    elif provider == "anthropic":
        return await _anthropic(text, model, api_key)
    elif provider == "mistral":
        return await _mistral(text, model, api_key)
    elif provider == "gemini":
        return await _gemini(text, model, api_key)
    else:
        raise ValueError(f"Unknown provider: {provider}")


async def _openai(text: str, model: str, api_key: str) -> str:
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        max_tokens=4096,
        temperature=0.3,
    )
    return resp.choices[0].message.content or text


async def _anthropic(text: str, model: str, api_key: str) -> str:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)
    resp = await client.messages.create(
        model=model,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": text}],
    )
    return resp.content[0].text if resp.content else text


async def _mistral(text: str, model: str, api_key: str) -> str:
    from mistralai import Mistral
    client = Mistral(api_key=api_key)
    resp = await client.chat.complete_async(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
    )
    return resp.choices[0].message.content or text


async def _gemini(text: str, model: str, api_key: str) -> str:
    import google.generativeai as genai
    genai.configure(api_key=api_key)
    gemini = genai.GenerativeModel(
        model_name=model,
        system_instruction=SYSTEM_PROMPT,
    )
    resp = await gemini.generate_content_async(text)
    return resp.text or text
