from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.ai_service import prepare_text_for_tts

router = APIRouter()


class PrepareRequest(BaseModel):
    text: str
    provider: str
    model: str
    api_key: str
    project_id: str


@router.post("/prepare")
async def prepare_text(body: PrepareRequest):
    if not body.api_key:
        raise HTTPException(400, "API key is required")
    if not body.text.strip():
        raise HTTPException(400, "Text is required")

    try:
        prepared = await prepare_text_for_tts(
            text=body.text,
            provider=body.provider,
            model=body.model,
            api_key=body.api_key,
        )
        return {"prepared_text": prepared}
    except Exception as e:
        raise HTTPException(500, str(e))
