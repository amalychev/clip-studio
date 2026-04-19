from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.ai_service import prepare_text_for_tts
from services.image_generation_service import generate_project_images, generate_single_image_for_slot

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
    prompts: list[str] | None = None


class ImagePromptRequest(BaseModel):
    provider: str
    model: str
    api_key: str
    project_id: str
    source_text: str
    creative_direction: str = ""
    count: int


class SingleImageRequest(BaseModel):
    provider: str
    model: str
    api_key: str
    project_id: str
    prompt: str
    slot: int


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
            prompts=body.prompts,
        )
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/generate-single-image")
async def generate_single_image(body: SingleImageRequest):
    if not body.api_key:
        raise HTTPException(400, "API key is required")
    if not body.prompt.strip():
        raise HTTPException(400, "Prompt is required")
    if body.slot < 1:
        raise HTTPException(400, "Slot must be at least 1")

    try:
        result = await generate_single_image_for_slot(
            project_id=body.project_id,
            provider=body.provider,
            model=body.model,
            api_key=body.api_key,
            prompt=body.prompt,
            slot=body.slot,
        )
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/generate-image-prompts")
async def generate_image_prompts(body: ImagePromptRequest):
    if not body.api_key:
        raise HTTPException(400, "API key is required")
    if not body.source_text.strip():
        raise HTTPException(400, "Source text is required")
    if body.count < 1:
        raise HTTPException(400, "Count must be at least 1")

    try:
        from services.image_generation_service import generate_scene_prompts

        prompts = await generate_scene_prompts(
            provider=body.provider,
            model=body.model,
            api_key=body.api_key,
            source_text=body.source_text,
            creative_direction=body.creative_direction,
            count=body.count,
        )
        return {"prompts": prompts}
    except Exception as e:
        raise HTTPException(500, str(e))
