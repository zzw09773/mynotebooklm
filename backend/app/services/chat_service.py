"""
Chat / RAG service – retrieves relevant chunks and streams
answers with citation metadata.
"""
import json
from typing import AsyncGenerator

from llama_index.core.schema import NodeWithScore

from llama_index.core.llms import ChatMessage, MessageRole

from app.config import get_settings
from app.services.document_service import get_retriever, list_collections
from app.services.llm_service import get_llm

settings = get_settings()

# ── System prompt for grounded answers with citations ────────
SYSTEM_PROMPT = """你是一位專業的文件分析助手。你的任務是根據提供的參考資料來回答使用者的問題。

規則：
1. 只根據提供的參考資料回答，不要編造資訊。
2. 在回答中引用來源時，使用 [來源 N] 的格式標註（例如 [來源 1]、[來源 2]）。
3. 如果參考資料中找不到答案，請誠實告知使用者。
4. 使用繁體中文（正體中文）回答。
5. 回答要條理清晰、內容完整。
"""


def _build_context_and_citations(
    nodes: list[NodeWithScore],
) -> tuple[str, list[dict]]:
    """
    Format retrieved nodes into a context string and
    a structured citations list for the frontend.
    """
    context_parts: list[str] = []
    citations: list[dict] = []

    for idx, node_with_score in enumerate(nodes, start=1):
        node = node_with_score.node
        meta = node.metadata
        text_snippet = node.get_content()

        context_parts.append(
            f"[來源 {idx}]（檔案：{meta.get('source_file', '?')}, "
            f"第 {meta.get('page_number', '?')} 頁）\n{text_snippet}"
        )

        citations.append({
            "index": idx,
            "source_file": meta.get("source_file", ""),
            "page_number": meta.get("page_number", 0),
            "chunk_index": meta.get("chunk_index", 0),
            "doc_id": meta.get("doc_id", ""),
            "text": text_snippet,
            "score": round(node_with_score.score or 0.0, 4),
        })

    context = "\n\n---\n\n".join(context_parts)
    return context, citations


async def chat_with_rag(
    query: str,
    collection_names: list[str] | None = None,
    history: list[dict] | None = None,
    conversation_id: int | None = None,
) -> AsyncGenerator[str, None]:
    """
    Perform RAG retrieval then stream the LLM answer.
    Supports multi-turn conversation via the `history` parameter.
    If `conversation_id` is provided, persists messages to DB after streaming.

    Yields SSE-formatted lines:
      - data: {"type": "citations", "citations": [...]}
      - data: {"type": "token", "content": "..."}
      - data: {"type": "done"}
    """
    # 1. Determine which collections to search
    if collection_names is None:
        collection_names = list_collections()

    if not collection_names:
        yield _sse({"type": "token", "content": "目前沒有任何已上傳的文件。請先上傳文件後再開始對話。"})
        yield _sse({"type": "done"})
        return

    # 2. Retrieve relevant chunks from all selected collections
    all_nodes: list[NodeWithScore] = []
    for cname in collection_names:
        try:
            retriever = get_retriever(cname)
            nodes = retriever.retrieve(query)
            all_nodes.extend(nodes)
        except Exception:
            continue

    # Sort by score descending and take top-k
    all_nodes.sort(key=lambda n: n.score or 0, reverse=True)
    all_nodes = all_nodes[: settings.top_k]

    if not all_nodes:
        yield _sse({"type": "token", "content": "在已上傳的文件中找不到與您的問題相關的資訊。"})
        yield _sse({"type": "done"})
        return

    # 3. Build context and citations
    context, citations = _build_context_and_citations(all_nodes)

    # Send citations metadata first
    yield _sse({"type": "citations", "citations": citations})

    # 4. Build prompt
    user_prompt = (
        f"以下是從文件中擷取的參考資料：\n\n{context}\n\n"
        f"---\n\n使用者的問題：{query}\n\n"
        f"請根據上述參考資料，用繁體中文詳細回答這個問題，並使用 [來源 N] 標註引用。"
    )

    # 5. Build message list with conversation history
    llm = get_llm()
    messages = [
        ChatMessage(role=MessageRole.SYSTEM, content=SYSTEM_PROMPT),
    ]

    # Inject recent conversation history (last 6 messages = ~3 turns)
    if history:
        for h in history[-6:]:
            role = MessageRole.USER if h["role"] == "user" else MessageRole.ASSISTANT
            messages.append(ChatMessage(role=role, content=h["content"]))

    # Current user query (with RAG context)
    messages.append(ChatMessage(role=MessageRole.USER, content=user_prompt))

    response = await llm.astream_chat(messages)
    full_response = ""
    async for chunk in response:
        token = chunk.delta
        if token:
            full_response += token
            yield _sse({"type": "token", "content": token})

    yield _sse({"type": "done"})

    # 6. Persist messages to DB if conversation_id is provided
    if conversation_id is not None:
        import json as _json
        from app.models import add_message, touch_conversation
        try:
            add_message(conversation_id, "user", query)
            add_message(
                conversation_id,
                "assistant",
                full_response,
                citations_json=_json.dumps(citations, ensure_ascii=False),
            )
            touch_conversation(conversation_id)
        except Exception:
            pass  # Don't fail the stream if persistence fails



def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

