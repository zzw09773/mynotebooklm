"""
Study Guide / Summary generation service.
Uses the LLM to produce a structured summary, key points, and FAQs
for a given document collection.
"""
import json
import logging

from llama_index.core.llms import ChatMessage, MessageRole

from app.services.llm_service import get_llm
from app.services.document_service import _get_chroma_client
from app.services.error_classifier import log_classified_error, get_user_message
from app.models import update_summary

_SEGMENT_SIZE = 12_000   # chars per segment for long-doc processing
_SEGMENT_OVERLAP = 500   # overlap to preserve context across segments
_SEGMENT_SUMMARY_TOKENS = 800  # target length per segment summary (chars)
_RAW_LIMIT = 15_000      # documents shorter than this skip segmentation

# ── Prompt ────────────────────────────────────────────────────

STUDY_GUIDE_PROMPT = """你是一位專業的學習顧問。請根據以下文件內容，產生一份結構化的學習指南。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "summary": "一段 200-400 字的完整文件摘要",
  "key_points": [
    "重點一",
    "重點二",
    "重點三",
    "重點四",
    "重點五"
  ],
  "faqs": [
    {"q": "問題一？", "a": "回答一"},
    {"q": "問題二？", "a": "回答二"},
    {"q": "問題三？", "a": "回答三"}
  ]
}

規則：
1. 使用繁體中文。
2. 重點整理 5-8 條，每條一句話。
3. FAQ 產生 3-5 個問答對。
4. 輸出必須是合法的 JSON。
"""


def _collect_document_text(collection_name: str, max_chars: int = 15000) -> str:
    """Fetch all stored chunks from a ChromaDB collection and concatenate."""
    client = _get_chroma_client()
    try:
        collection = client.get_collection(name=collection_name)
    except Exception:
        return ""

    results = collection.get(include=["documents"])
    docs = results.get("documents", []) or []
    if not docs:
        return ""

    combined = "\n\n".join(docs)
    if len(combined) > max_chars:
        combined = combined[:max_chars] + "\n\n…（內容已截斷）"
    return combined


def _collect_full_document_text(collection_name: str) -> str:
    """Return the full (un-truncated) document text from ChromaDB."""
    client = _get_chroma_client()
    try:
        collection = client.get_collection(name=collection_name)
    except Exception:
        return ""
    results = collection.get(include=["documents"])
    docs = results.get("documents", []) or []
    return "\n\n".join(docs)


async def _segment_and_summarise(text: str, llm) -> str:
    """
    Borrowed from Claude Code compact/prompt.ts partial-compact pattern.
    Split long text into overlapping segments, summarise each,
    then merge into a single condensed context.
    """
    _SEG_PROMPT = (
        "請用200字以內摘要以下文件片段的核心內容，保留所有重要數據和關鍵事實，"
        "使用繁體中文，只輸出摘要文字，不要加任何標題或說明。"
    )
    segments: list[str] = []
    start = 0
    while start < len(text):
        end = start + _SEGMENT_SIZE
        segments.append(text[start:end])
        start = end - _SEGMENT_OVERLAP  # overlap for context continuity

    logging.info("Long doc segmentation: %d chars → %d segments", len(text), len(segments))

    summaries: list[str] = []
    for i, seg in enumerate(segments):
        try:
            resp = await llm.achat([
                ChatMessage(role=MessageRole.SYSTEM, content=_SEG_PROMPT),
                ChatMessage(role=MessageRole.USER, content=seg),
            ])
            summaries.append(f"[片段 {i+1}/{len(segments)}] {resp.message.content.strip()}")
        except Exception:
            logging.warning("Segment %d summarisation failed, using truncated raw text", i + 1)
            summaries.append(f"[片段 {i+1}/{len(segments)}] {seg[:500]}…")

    return "\n\n".join(summaries)


async def generate_study_guide(collection_name: str, project_id: int) -> None:
    """
    Generate a study guide for a document collection using the LLM.
    Updates the DocumentSummary record in-place.
    For long documents (> _RAW_LIMIT chars), uses segmented summarisation
    borrowed from Claude Code's compact/prompt.ts partial-compact pattern.
    """
    try:
        update_summary(collection_name, status="generating")

        full_text = _collect_full_document_text(collection_name)
        if not full_text:
            update_summary(
                collection_name,
                status="error",
                error_message="無法從文件中取得任何文字內容。",
            )
            return

        llm = get_llm()

        if len(full_text) > _RAW_LIMIT:
            # Long document: segment → summarise each → merge
            text = await _segment_and_summarise(full_text, llm)
            user_msg = f"以下是文件各段落的摘要（文件較長，已分段處理）：\n\n{text}"
        else:
            user_msg = f"以下是文件的完整內容：\n\n{full_text}"

        messages = [
            ChatMessage(role=MessageRole.SYSTEM, content=STUDY_GUIDE_PROMPT),
            ChatMessage(role=MessageRole.USER, content=user_msg),
        ]

        response = await llm.achat(messages)
        raw = response.message.content.strip()

        # Try to extract JSON from the response
        # Handle cases where the LLM wraps in ```json ... ```
        if raw.startswith("```"):
            lines = raw.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            raw = "\n".join(lines)

        data = json.loads(raw)

        update_summary(
            collection_name,
            status="done",
            summary_text=data.get("summary", ""),
            key_points=json.dumps(data.get("key_points", []), ensure_ascii=False),
            faqs=json.dumps(data.get("faqs", []), ensure_ascii=False),
        )

    except json.JSONDecodeError:
        # If LLM output is not valid JSON, store the raw text as summary
        update_summary(
            collection_name,
            status="done",
            summary_text=raw if 'raw' in dir() else "無法解析 LLM 回應。",
            key_points="[]",
            faqs="[]",
        )
    except Exception as e:
        error_type = log_classified_error(e, context=f"summary:{collection_name}")
        update_summary(
            collection_name,
            status="error",
            error_message=get_user_message(error_type),
        )
