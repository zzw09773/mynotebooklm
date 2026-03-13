"""
Chat API routes – streaming RAG responses via SSE.
"""
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.chat_service import chat_with_rag

router = APIRouter(prefix="/api/chat", tags=["聊天"])


class ChatRequest(BaseModel):
    query: str
    collection_names: list[str] | None = None


@router.post("/", summary="與文件對話（串流回應）")
async def chat(request: ChatRequest):
    """
    Send a query and receive a streamed RAG response with citations.
    Response is SSE (text/event-stream) with events:
      - {"type": "citations", "citations": [...]}
      - {"type": "token", "content": "..."}
      - {"type": "done"}
    """
    return StreamingResponse(
        chat_with_rag(request.query, request.collection_names),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
