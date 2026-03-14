"""
Chat API routes – streaming RAG responses via SSE, scoped to a project.
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.chat_service import chat_with_rag
from app.models import list_project_documents

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
async def chat(request: ChatRequest):
    """
    Send a query and receive a streamed RAG response with citations.
    If project_id is provided, only search within that project's documents.
    Supports multi-turn conversation via the `history` field.
    Response is SSE (text/event-stream) with events:
      - {"type": "citations", "citations": [...]}
      - {"type": "token", "content": "..."}
      - {"type": "done"}
    """
    collection_names = request.collection_names

    # If project_id specified, scope retrieval to that project's collections
    if request.project_id and not collection_names:
        docs = list_project_documents(request.project_id)
        collection_names = [d.collection_name for d in docs]

    # Convert history to list of dicts for the service layer
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

