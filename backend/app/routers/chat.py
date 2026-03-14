"""
Chat API routes – streaming RAG responses via SSE, scoped to a project.
"""
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.dependencies import get_current_user
from app.models import User, list_project_documents, get_project
from app.services.chat_service import chat_with_rag

router = APIRouter(prefix="/api/chat", tags=["聊天"])


class ChatHistoryMessage(BaseModel):
    role: str       # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    query: str
    project_id: int | None = None
    collection_names: list[str] | None = None
    history: list[ChatHistoryMessage] = []
    conversation_id: int | None = None


@router.post("/", summary="與文件對話（串流回應）")
async def chat(request: ChatRequest, current_user: User = Depends(get_current_user)):
    collection_names = request.collection_names

    # If project_id specified, verify ownership and scope retrieval
    if request.project_id and not collection_names:
        project = get_project(request.project_id)
        if project and project.user_id == current_user.id:
            docs = list_project_documents(request.project_id)
            collection_names = [d.collection_name for d in docs]

    history = [{"role": h.role, "content": h.content} for h in request.history]

    return StreamingResponse(
        chat_with_rag(
            request.query,
            collection_names,
            history=history,
            conversation_id=request.conversation_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
