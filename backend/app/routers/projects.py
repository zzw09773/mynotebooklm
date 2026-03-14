"""
Project management API routes – CRUD for workspaces.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models import (
    create_project,
    list_projects,
    get_project,
    update_project,
    delete_project as db_delete_project,
    list_project_documents,
    remove_document_from_project,
)
from app.services.document_service import delete_document

router = APIRouter(prefix="/api/projects", tags=["專案管理"])


# ── Request / Response schemas ────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    created_at: str
    updated_at: str
    document_count: int = 0


class ProjectListResponse(BaseModel):
    projects: list[ProjectResponse]


class ProjectDocResponse(BaseModel):
    collection_name: str
    filename: str
    total_pages: int
    total_chunks: int
    created_at: str


# ── Endpoints ─────────────────────────────────────────────────

@router.post("/", response_model=ProjectResponse, summary="建立新專案")
async def create(body: ProjectCreate):
    project = create_project(body.name, body.description)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        document_count=0,
    )


@router.get("/", response_model=ProjectListResponse, summary="列出所有專案")
async def list_all():
    projects = list_projects()
    result = []
    for p in projects:
        docs = list_project_documents(p.id)
        result.append(ProjectResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            created_at=p.created_at,
            updated_at=p.updated_at,
            document_count=len(docs),
        ))
    return ProjectListResponse(projects=result)


@router.get("/{project_id}", response_model=ProjectResponse, summary="取得專案詳情")
async def get_one(project_id: int):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="找不到該專案。")
    docs = list_project_documents(project.id)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        document_count=len(docs),
    )


@router.put("/{project_id}", response_model=ProjectResponse, summary="更新專案資訊")
async def update(project_id: int, body: ProjectUpdate):
    project = update_project(project_id, body.name, body.description)
    if not project:
        raise HTTPException(status_code=404, detail="找不到該專案。")
    docs = list_project_documents(project.id)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        updated_at=project.updated_at,
        document_count=len(docs),
    )


@router.delete("/{project_id}", summary="刪除專案及其所有文件")
async def remove(project_id: int):
    # Delete all associated ChromaDB collections first
    docs = list_project_documents(project_id)
    for doc in docs:
        try:
            delete_document(doc.collection_name)
        except Exception:
            pass

    ok = db_delete_project(project_id)
    if not ok:
        raise HTTPException(status_code=404, detail="找不到該專案。")
    return {"message": "專案及其文件已全部刪除。"}


@router.get("/{project_id}/documents", summary="列出專案內的文件")
async def get_project_docs(project_id: int):
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="找不到該專案。")
    docs = list_project_documents(project_id)
    return {
        "documents": [
            ProjectDocResponse(
                collection_name=d.collection_name,
                filename=d.filename,
                total_pages=d.total_pages,
                total_chunks=d.total_chunks,
                created_at=d.created_at,
            )
            for d in docs
        ]
    }
