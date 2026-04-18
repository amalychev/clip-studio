import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import GlobalSetting

router = APIRouter()

SETTINGS_KEY = "global"


class SettingsBody(BaseModel):
    apiKeys: dict = {}
    defaultProvider: str = "mistral"
    defaultModel: str = "mistral-large-latest"
    ttsUrl: str = "http://localhost:8000"
    ttsVoice: str = "kseniya"
    defaultWatermark: str = ""


@router.get("")
def get_settings(db: Session = Depends(get_db)):
    row = db.query(GlobalSetting).filter(GlobalSetting.key == SETTINGS_KEY).first()
    if not row:
        return SettingsBody().model_dump()
    return json.loads(row.value)


@router.post("")
def save_settings(body: SettingsBody, db: Session = Depends(get_db)):
    row = db.query(GlobalSetting).filter(GlobalSetting.key == SETTINGS_KEY).first()
    if row:
        row.value = body.model_dump_json()
    else:
        row = GlobalSetting(key=SETTINGS_KEY, value=body.model_dump_json())
        db.add(row)
    db.commit()
    return {"ok": True}
