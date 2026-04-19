from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.ai_service import prepare_text_for_tts
from services.image_generation_service import generate_project_images

router = APIRouter()


class PrepareRequest(BaseModel):
    text: str
    provider: str
    model: str
    api_key: str
    project_id: str


class ImageGenerateRequest(BaseModel):
    provider: str
    model: str
    api_key: str
    project_id: str
    source_text: str
    creative_direction: str = ""
    count: int


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


@router.post("/generate-images")
async def generate_images(body: ImageGenerateRequest):
    if not body.api_key:
        raise HTTPException(400, "API key is required")
    if not body.source_text.strip():
        raise HTTPException(400, "Source text is required")
    if body.count < 1:
        raise HTTPException(400, "Count must be at least 1")

    try:
        result = await generate_project_images(
            project_id=body.project_id,
            provider=body.provider,
            model=body.model,
            api_key=body.api_key,
            source_text=body.source_text,
            creative_direction=body.creative_direction,
            count=body.count,
        )
        return result
    except Exception as e:
        raise HTTPException(500, str(e))
