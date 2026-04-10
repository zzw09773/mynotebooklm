"""
Chat / RAG service – retrieves relevant chunks and streams
answers with citation metadata.
"""
import json
import logging
from typing import AsyncGenerator

log = logging.getLogger(__name__)

from llama_index.core.schema import NodeWithScore

from llama_index.core.llms import ChatMessage, MessageRole

from app.config import get_settings
from app.models import add_message, touch_conversation, get_conversation, Conversation
from app.services.document_service import get_retriever, list_collections
from app.services.error_classifier import classify_llm_error, get_user_message
from app.services.llm_service import get_llm

# History compression thresholds (borrowing from Claude Code toolUseSummary pattern)
_HISTORY_COMPRESS_THRESHOLD = 6   # compress when history exceeds this many messages
_HISTORY_KEEP_RECENT = 4          # number of recent messages to keep verbatim after compression

settings = get_settings()

# ── System prompt for grounded answers with citations ────────
SYSTEM_PROMPT = """This is a single-user local deployment with no resource constraints. You are allowed to generate long, complete responses up to the full token limit. Do not summarize, truncate, or stop early — always finish every sentence and complete your full answer.

你是一位專業的文件分析助手。你的任務是根據提供的參考資料來回答使用者的問題。

規則：
1. 只根據提供的參考資料回答，不要編造資訊。
2. 在回答中引用來源時，使用 [來源 N] 的格式標註（例如 [來源 1]、[來源 2]）。
3. 如果參考資料中找不到答案，請誠實告知使用者。
4. 使用繁體中文（正體中文）回答。
5. 回答要條理清晰、內容完整。
"""


async def _compress_history(
    older_history: list[dict],
    llm,
    existing_summary: str = "",
) -> str:
    """
    Compress older conversation turns into a short summary.
    Borrowed from Claude Code's toolUseSummaryGenerator pattern:
    keeps the context window lean by replacing old turns with a ~200-char digest.
    Failures are silently ignored — the raw history is used as fallback.
    """
    turns = []
    for h in older_history:
        role_label = "使用者" if h["role"] == "user" else "助手"
        turns.append(f"{role_label}：{h['content'][:300]}")
    turns_text = "\n".join(turns)

    prefix = f"（之前摘要：{existing_summary}）\n\n" if existing_summary else ""
    prompt = (
        f"{prefix}請用150字以內摘要以下對話的主要問題與回答要點，"
        f"使用繁體中文，只輸出摘要：\n\n{turns_text}"
    )
    try:
        resp = await llm.achat([
            ChatMessage(role=MessageRole.USER, content=prompt),
        ])
        return resp.message.content.strip()[:400]
    except Exception:
        return existing_summary  # keep old summary on failure


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
    retrieval_errors: list[tuple[str, Exception]] = []
    for cname in collection_names:
        try:
            retriever = get_retriever(cname)
            nodes = retriever.retrieve(query)
            all_nodes.extend(nodes)
        except Exception as e:
            logging.exception("Failed to retrieve from collection: %s", cname)
            retrieval_errors.append((cname, e))
            continue

    # Sort by score descending and take top-k
    all_nodes.sort(key=lambda n: n.score or 0, reverse=True)
    all_nodes = all_nodes[: settings.top_k]

    if not all_nodes:
        if retrieval_errors:
            _, first_exc = retrieval_errors[0]
            error_type = classify_llm_error(first_exc)
            msg = get_user_message(error_type)
            yield _sse({"type": "token", "content": f"向量檢索失敗：{msg}"})
        else:
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
    #    Borrow Claude Code toolUseSummary pattern: compress older turns,
    #    keep only recent _HISTORY_KEEP_RECENT messages verbatim.
    llm = get_llm()
    messages = [
        ChatMessage(role=MessageRole.SYSTEM, content=SYSTEM_PROMPT),
    ]

    if history and len(history) > _HISTORY_COMPRESS_THRESHOLD:
        # Fetch existing summary from DB (may be empty string)
        existing_summary = ""
        if conversation_id is not None:
            conv = get_conversation(conversation_id)
            if conv:
                existing_summary = conv.history_summary or ""

        older = history[:-_HISTORY_KEEP_RECENT]
        recent = history[-_HISTORY_KEEP_RECENT:]

        new_summary = await _compress_history(older, llm, existing_summary)

        # Inject summary as a synthetic assistant turn
        if new_summary:
            messages.append(ChatMessage(
                role=MessageRole.ASSISTANT,
                content=f"[對話摘要] {new_summary}",
            ))

        # Persist updated summary back to DB (non-blocking best-effort)
        if conversation_id is not None and new_summary:
            try:
                from app.models import get_session, select, Conversation as ConvModel
                with get_session() as _sess:
                    _conv = _sess.get(ConvModel, conversation_id)
                    if _conv:
                        _conv.history_summary = new_summary
                        _sess.add(_conv)
                        _sess.commit()
            except Exception:
                pass  # non-critical

        for h in recent:
            role = MessageRole.USER if h["role"] == "user" else MessageRole.ASSISTANT
            messages.append(ChatMessage(role=role, content=h["content"]))
    elif history:
        for h in history[-_HISTORY_COMPRESS_THRESHOLD:]:
            role = MessageRole.USER if h["role"] == "user" else MessageRole.ASSISTANT
            messages.append(ChatMessage(role=role, content=h["content"]))

    # Current user query (with RAG context)
    messages.append(ChatMessage(role=MessageRole.USER, content=user_prompt))

    log.debug("[stream] starting with max_tokens=%d model=%s", llm.max_tokens, llm.model)
    response = await llm.astream_chat(messages)
    full_response = ""
    chunk_count = 0
    last_finish_reason = None
    async for chunk in response:
        token = chunk.delta
        chunk_count += 1
        raw = getattr(chunk, "raw", None)
        if raw:
            try:
                fr = raw.choices[0].finish_reason
                if fr:
                    last_finish_reason = fr
            except Exception:
                pass
        if chunk_count <= 2:
            log.debug("[stream] chunk #%d delta=%r raw=%r", chunk_count, token, raw)
        if token:
            full_response += token
            yield _sse({"type": "token", "content": token})
    log.debug("[stream] finished: %d chunks, %d chars, finish_reason=%r, last50=%r",
                chunk_count, len(full_response), last_finish_reason, full_response[-50:])

    # Generate AI follow-up suggestions (optional — failures are silently ignored)
    try:
        import re as _re
        suggestion_msgs = messages[:-1] + [
            ChatMessage(role=MessageRole.ASSISTANT, content=full_response[:800]),
            ChatMessage(
                role=MessageRole.USER,
                content="根據以上問答，用JSON數組生成3個簡短後續問題（繁體中文），只輸出JSON數組，不要其他文字。",
            ),
        ]
        suggestion_resp = await llm.achat(suggestion_msgs)
        raw = suggestion_resp.message.content.strip()
        match = _re.search(r"\[.*?\]", raw, _re.S)
        if match:
            suggestions = json.loads(match.group())
            if isinstance(suggestions, list):
                yield _sse({"type": "suggestions", "suggestions": [str(s) for s in suggestions[:3]]})
    except Exception:
        pass  # suggestions are optional; never break the main flow

    yield _sse({"type": "done"})

    # 6. Persist messages to DB if conversation_id is provided
    if conversation_id is not None:
        try:
            add_message(conversation_id, "user", query)
            add_message(
                conversation_id,
                "assistant",
                full_response,
                citations_json=json.dumps(citations, ensure_ascii=False),
            )
            touch_conversation(conversation_id)
        except Exception:
            logging.exception("Failed to persist messages for conversation_id=%s", conversation_id)



def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

