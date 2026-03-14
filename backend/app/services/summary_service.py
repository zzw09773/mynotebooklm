"""
Study Guide / Summary generation service.
Uses the LLM to produce a structured summary, key points, and FAQs
for a given document collection.
"""
import json
import traceback

from llama_index.core.llms import ChatMessage, MessageRole

from app.services.llm_service import get_llm
from app.services.document_service import _get_chroma_client
from app.models import update_summary

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
    docs = results.get("documents", [])
    if not docs:
        return ""

    combined = "\n\n".join(docs)
    # Truncate to fit in context window
    if len(combined) > max_chars:
        combined = combined[:max_chars] + "\n\n…（內容已截斷）"
    return combined


async def generate_study_guide(collection_name: str, project_id: int) -> None:
    """
    Generate a study guide for a document collection using the LLM.
    Updates the DocumentSummary record in-place.
    """
    try:
        update_summary(collection_name, status="generating")

        text = _collect_document_text(collection_name)
        if not text:
            update_summary(
                collection_name,
                status="error",
                error_message="無法從文件中取得任何文字內容。",
            )
            return

        user_msg = f"以下是文件的完整內容：\n\n{text}"

        llm = get_llm()
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
        update_summary(
            collection_name,
            status="error",
            error_message=f"{type(e).__name__}: {str(e)}",
        )
