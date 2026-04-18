import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db, DATA_DIR
from models import Project

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    data: dict | None = None


@router.get("")
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [p.to_dict() for p in projects]


@router.post("")
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project_id = str(uuid.uuid4())
    project = Project(id=project_id, name=body.name, description=body.description)
    db.add(project)
    db.commit()
    db.refresh(project)

    # Create project media directories
    proj_dir = DATA_DIR / "projects" / project_id
    (proj_dir / "images").mkdir(parents=True, exist_ok=True)
    (proj_dir / "audio").mkdir(parents=True, exist_ok=True)
    (proj_dir / "video").mkdir(parents=True, exist_ok=True)
    (proj_dir / "subtitles").mkdir(parents=True, exist_ok=True)

    return project.to_dict()


@router.get("/{project_id}")
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    return project.to_dict()


@router.patch("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.data is not None:
        existing = project.data
        existing.update(body.data)
        project.data = existing
    db.commit()
    db.refresh(project)
    return project.to_dict()


@router.delete("/{project_id}")
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()
    return {"ok": True}
