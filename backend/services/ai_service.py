SYSTEM_PROMPT = """Ты — редактор текста для русскоязычной TTS-озвучки.

Нужно переписать исходный текст так, чтобы диктор естественно и без ошибок его озвучил.

Обязательные правила:
- Верни только готовый текст для озвучки, без комментариев, пояснений, markdown и кавычек вокруг ответа.
- Сохрани исходный смысл, факты, порядок блоков и общий объём настолько, насколько это возможно.
- На конце каждого законченного предложения и строки должны быть корректные знаки препинания.
- Расставляй запятые, точки, двоеточия и тире так, чтобы речь звучала естественно.
- Убирай HTML, markdown, мусорные символы, служебные пометки, URL-схемы и лишний технический шум.
- Любые цифры, суммы, даты, проценты, номера и артикулы переводи в слова, если это нужно для естественной озвучки.
- Любые латинские буквы, домены, сокращения, коды, бренды и смешанные конструкции переводи в русское фонетическое чтение.
- Если встречается домен, URL, ник, артикул, модель или код, произноси его так, как это сказал бы русскоязычный диктор.
- Если встречаются отдельные латинские буквы, читай их по-русски: A → эй, B → би, C → си, D → ди и так далее.
- Если встречаются последовательности букв и цифр, разбивай их на естественно озвучиваемые части.
- Не оставляй голые арабские цифры и латиницу, если их можно безопасно озвучить словами.

Примеры преобразования:
- banks.kg → бэнкс точка кей джи
- STI-1242 → эс ти ай, двенадцать сорок два
- 25% → двадцать пять процентов
- 2026 → две тысячи двадцать шестой год или две тысячи двадцать шесть, по смыслу
- 15:30 → пятнадцать тридцать
- №12 → номер двенадцать

Если написание неоднозначно, выбирай самый естественный и понятный для русской озвучки вариант.
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
