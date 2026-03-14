"""
Studio API routes – generate and retrieve AI content artifacts for a project.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.models import (
    User,
    StudioArtifact,
    STUDIO_ARTIFACT_TYPES,
    create_studio_artifact,
    get_studio_artifact,
    update_studio_artifact,
    list_studio_artifacts,
    get_project,
)
from app.services.studio_service import generate_artifact

router = APIRouter(prefix="/api/studio", tags=["工作室"])


# ── Schemas ───────────────────────────────────────────────────

class ArtifactResponse(BaseModel):
    id: int
    project_id: int
    artifact_type: str
    status: str
    content_json: str
    content_text: str
    error_message: str
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, a: StudioArtifact) -> "ArtifactResponse":
        return cls(
            id=a.id,
            project_id=a.project_id,
            artifact_type=a.artifact_type,
            status=a.status,
            content_json=a.content_json,
            content_text=a.content_text,
            error_message=a.error_message,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )


class ArtifactListResponse(BaseModel):
    artifacts: list[ArtifactResponse]


# ── Helpers ───────────────────────────────────────────────────

def _check_project_ownership(project_id: int, user: User):
    """Fetch project and verify the user owns it. Raises 404/403."""
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="找不到該專案。")
    if project.user_id != user.id:
        raise HTTPException(status_code=403, detail="您無權存取此專案。")
    return project


def _validate_artifact_type(artifact_type: str):
    if artifact_type not in STUDIO_ARTIFACT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支援的 artifact 類型：{artifact_type}。"
                   f"支援的類型：{', '.join(sorted(STUDIO_ARTIFACT_TYPES))}",
        )


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/{project_id}", response_model=ArtifactListResponse, summary="取得專案所有工作室 artifacts")
async def list_artifacts(
    project_id: int,
    current_user: User = Depends(get_current_user),
):
    _check_project_ownership(project_id, current_user)
    artifacts = list_studio_artifacts(project_id)
    return ArtifactListResponse(artifacts=[ArtifactResponse.from_orm(a) for a in artifacts])


@router.get("/{project_id}/{artifact_type}", response_model=ArtifactResponse, summary="取得單一 artifact")
async def get_artifact(
    project_id: int,
    artifact_type: str,
    current_user: User = Depends(get_current_user),
):
    _check_project_ownership(project_id, current_user)
    _validate_artifact_type(artifact_type)
    artifact = get_studio_artifact(project_id, artifact_type)
    if not artifact:
        raise HTTPException(status_code=404, detail="尚未生成此 artifact。")
    return ArtifactResponse.from_orm(artifact)


@router.post("/{project_id}/{artifact_type}/generate", response_model=ArtifactResponse, summary="觸發生成 artifact")
async def trigger_generate(
    project_id: int,
    artifact_type: str,
    background_tasks: BackgroundTasks,
    force: bool = Query(False, description="強制重新生成（忽略快取）"),
    current_user: User = Depends(get_current_user),
):
    _check_project_ownership(project_id, current_user)
    _validate_artifact_type(artifact_type)

    existing = get_studio_artifact(project_id, artifact_type)

    # Cache hit: already done and not forcing regeneration
    if existing and existing.status == "done" and not force:
        return ArtifactResponse.from_orm(existing)

    # Already in progress: avoid duplicate background tasks
    if existing and existing.status == "generating":
        return ArtifactResponse.from_orm(existing)

    if not existing:
        artifact = create_studio_artifact(project_id, artifact_type)
    else:
        # Reset the existing record for regeneration
        artifact = update_studio_artifact(
            existing.id,
            status="pending",
            content_json="{}",
            content_text="",
            error_message="",
        )

    background_tasks.add_task(generate_artifact, project_id, artifact.id, artifact_type)
    return ArtifactResponse.from_orm(artifact)
