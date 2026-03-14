"""
Conversation management API routes – CRUD for chat history persistence.
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.models import (
    User,
    create_conversation,
    list_conversations,
    get_conversation,
    get_project,
    delete_conversation,
    update_conversation_title,
    add_message,
    list_messages,
)

router = APIRouter(prefix="/api/conversations", tags=["對話管理"])


# ── Request / Response schemas ────────────────────────────────

class CreateConversationRequest(BaseModel):
    project_id: int
    title: str = "新對話"


class ConversationInfo(BaseModel):
    id: int
    project_id: int
    title: str
    created_at: str
    updated_at: str


class ConversationListResponse(BaseModel):
    conversations: list[ConversationInfo]


class MessageInfo(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    citations: list[dict] = []
    created_at: str


class MessageListResponse(BaseModel):
    messages: list[MessageInfo]


class AddMessageRequest(BaseModel):
    role: str
    content: str
    citations: list[dict] = []


class UpdateTitleRequest(BaseModel):
    title: str


# ── Helpers ──────────────────────────────────────────────────

def _check_conversation_ownership(conversation_id: int, user: User):
    """Verify user owns the project that contains this conversation."""
    conv = get_conversation(conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="找不到該對話。")
    project = get_project(conv.project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=403, detail="您無權存取此對話。")
    return conv


# ── Routes ────────────────────────────────────────────────────

@router.post("/", response_model=ConversationInfo, summary="建立新對話")
async def create_new_conversation(req: CreateConversationRequest, current_user: User = Depends(get_current_user)):
    project = get_project(req.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="找不到該專案。")
    if project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="您無權在此專案建立對話。")

    conv = create_conversation(project_id=req.project_id, title=req.title)
    return ConversationInfo(
        id=conv.id,
        project_id=conv.project_id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.get("/", response_model=ConversationListResponse, summary="列出專案對話")
async def get_conversations(
    project_id: int = Query(..., description="專案 ID"),
    current_user: User = Depends(get_current_user),
):
    project = get_project(project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="您無權存取此專案的對話。")

    convs = list_conversations(project_id)
    return ConversationListResponse(
        conversations=[
            ConversationInfo(
                id=c.id,
                project_id=c.project_id,
                title=c.title,
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
            for c in convs
        ]
    )


@router.get("/{conversation_id}/messages", response_model=MessageListResponse, summary="取得對話歷史")
async def get_conversation_messages(conversation_id: int, current_user: User = Depends(get_current_user)):
    _check_conversation_ownership(conversation_id, current_user)

    msgs = list_messages(conversation_id)
    return MessageListResponse(
        messages=[
            MessageInfo(
                id=m.id,
                conversation_id=m.conversation_id,
                role=m.role,
                content=m.content,
                citations=json.loads(m.citations_json) if m.citations_json else [],
                created_at=m.created_at,
            )
            for m in msgs
        ]
    )


@router.post("/{conversation_id}/messages", response_model=MessageInfo, summary="新增訊息")
async def post_message(conversation_id: int, req: AddMessageRequest, current_user: User = Depends(get_current_user)):
    _check_conversation_ownership(conversation_id, current_user)

    citations_json = json.dumps(req.citations, ensure_ascii=False)
    msg = add_message(
        conversation_id=conversation_id,
        role=req.role,
        content=req.content,
        citations_json=citations_json,
    )
    return MessageInfo(
        id=msg.id,
        conversation_id=msg.conversation_id,
        role=msg.role,
        content=msg.content,
        citations=req.citations,
        created_at=msg.created_at,
    )


@router.patch("/{conversation_id}", response_model=ConversationInfo, summary="更新對話標題")
async def patch_conversation(conversation_id: int, req: UpdateTitleRequest, current_user: User = Depends(get_current_user)):
    _check_conversation_ownership(conversation_id, current_user)

    conv = update_conversation_title(conversation_id, req.title)
    if not conv:
        raise HTTPException(status_code=404, detail="找不到該對話。")
    return ConversationInfo(
        id=conv.id,
        project_id=conv.project_id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.delete("/{conversation_id}", summary="刪除對話")
async def remove_conversation(conversation_id: int, current_user: User = Depends(get_current_user)):
    _check_conversation_ownership(conversation_id, current_user)

    ok = delete_conversation(conversation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="找不到該對話。")
    return {"detail": "已刪除"}
