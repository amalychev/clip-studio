import re

from database import SessionLocal
from models import Project


def sanitize_project_part(value: str, fallback: str = "project") -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", value).strip("._-").lower()
    return cleaned or fallback


def get_project_slug(project_id: str, fallback: str = "project") -> str:
    db = SessionLocal()
    try:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project or not project.name:
            return fallback
        return sanitize_project_part(project.name, fallback)
    finally:
        db.close()
