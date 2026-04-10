"""
Document Structure Extraction Service.

Inspired by Claude Code's services/extractMemories pattern:
after a document is ingested, a background LLM call extracts a
structured representation (chapters, key entities, content type),
which is cached in SQLite and reused by Studio artifact generation
and Chat RAG query expansion.

This replaces the naive "concat all chunks → truncate at 15,000 chars"
approach used by summary_service and studio_service.
"""
from __future__ import annotations

import json
import logging
import re

from llama_index.core.llms import ChatMessage, MessageRole

from app.services.llm_service import get_llm, _fresh_async_client
from app.services.error_classifier import log_classified_error


# ── Prompt ────────────────────────────────────────────────────────────────────

_STRUCTURE_SYSTEM_PROMPT = """你是一位專業的文件分析師。請根據以下文件內容，提取結構化的文件摘要。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "title": "文件標題（從內容推斷，若不明確則用原始檔名）",
  "language": "zh-TW 或 en 或 mixed",
  "word_count_estimate": 估計字數（整數）,
  "chapters": [
    {
      "title": "章節標題",
      "summary": "100字以內的章節摘要",
      "key_data": ["重要數據或事實1", "重要數據或事實2"],
      "content_type": "narrative 或 data 或 mixed"
    }
  ],
  "key_entities": ["重要人名、機構名、概念名（最多15個）"],
  "has_numerical_data": true 或 false,
  "suggested_artifact_focus": "analysis 或 report 或 education 或 briefing"
}

規則：
1. chapters 最多 8 個，每個摘要不超過 100 字。
2. key_entities 只包含最重要的專有名詞（人名、機構、法律名稱、產品名等）。
3. suggested_artifact_focus 選擇最適合此文件類型的簡報風格：
   - analysis：分析型（適合調查報告、研究論文）
   - report：匯報型（適合工作報告、會議記錄）
   - education：教學型（適合教材、說明文件）
   - briefing：簡報型（適合商業計劃、產品介紹）
4. 輸出必須是合法的 JSON。
"""


# ── Main function ─────────────────────────────────────────────────────────────

def _collect_text(collection_name: str, max_chars: int = 20_000) -> str:
    """Fetch all chunks from ChromaDB and return a sample for structure extraction."""
    from app.services.document_service import _get_chroma_client
    client = _get_chroma_client()
    try:
        collection = client.get_collection(name=collection_name)
    except Exception:
        return ""
    results = collection.get(include=["documents"])
    docs = results.get("documents", []) or []
    combined = "\n\n".join(docs)
    if len(combined) > max_chars:
        combined = combined[:max_chars] + "\n\n…（內容已截斷，以上為前段代表性文字）"
    return combined


async def extract_document_structure(
    collection_name: str,
    project_id: int,
) -> None:
    """
    Extract and persist structured metadata for a document.
    Called as a background task after document ingestion completes.
    Silently logs errors — never raises, so it cannot break the upload pipeline.
    """
    from app.models import create_document_structure, update_document_structure

    # Mark as generating
    try:
        create_document_structure(project_id, collection_name)
    except Exception:
        logging.exception("Failed to create DocumentStructure record for %s", collection_name)
        return

    update_document_structure(collection_name, status="generating")

    document_text = _collect_text(collection_name)
    if not document_text:
        update_document_structure(collection_name, status="error",
                                   error_message="無法從文件中取得任何文字內容")
        return

    text_sample = document_text

    client = _fresh_async_client()
    try:
        llm = get_llm(async_client=client)
        messages = [
            ChatMessage(role=MessageRole.SYSTEM, content=_STRUCTURE_SYSTEM_PROMPT),
            ChatMessage(role=MessageRole.USER, content=f"請分析以下文件內容：\n\n{text_sample}"),
        ]
        import asyncio
        response = await asyncio.wait_for(llm.achat(messages), timeout=60.0)
        raw = response.message.content.strip()

        # Strip markdown fences
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)

        data = json.loads(raw)

        update_document_structure(
            collection_name,
            status="done",
            structure_json=json.dumps(data, ensure_ascii=False),
        )
        logging.info("Document structure extracted for %s: %d chapters, lang=%s",
                     collection_name, len(data.get("chapters", [])), data.get("language", "?"))

    except json.JSONDecodeError:
        logging.warning("Document structure LLM output was not valid JSON for %s", collection_name)
        update_document_structure(collection_name, status="error",
                                   error_message="LLM 輸出非合法 JSON")
    except Exception as e:
        error_type = log_classified_error(e, context=f"structure:{collection_name}")
        update_document_structure(collection_name, status="error",
                                   error_message=str(e)[:200])
    finally:
        await client.aclose()


def get_structure_context(collection_names: list[str], max_chars: int = 8000) -> str:
    """
    Build a condensed context string from DocumentStructure records.
    Used by Studio artifact generation to replace raw text truncation.

    Returns a formatted string summarising the document structure,
    or empty string if no structures are available yet.
    """
    from app.models import get_document_structure
    import json as _json

    parts: list[str] = []
    for cname in collection_names:
        ds = get_document_structure(cname)
        if not ds or ds.status != "done" or not ds.structure_json:
            continue
        try:
            data = _json.loads(ds.structure_json)
        except Exception:
            continue

        title = data.get("title", cname)
        lang = data.get("language", "")
        focus = data.get("suggested_artifact_focus", "")
        entities = data.get("key_entities", [])
        has_data = data.get("has_numerical_data", False)
        chapters = data.get("chapters", [])

        doc_parts = [f"【文件：{title}】（語言：{lang}，建議風格：{focus}）"]
        if entities:
            doc_parts.append(f"關鍵主體：{'、'.join(entities[:10])}")
        if has_data:
            doc_parts.append("（包含數值數據）")
        for ch in chapters:
            ch_title = ch.get("title", "")
            ch_summary = ch.get("summary", "")
            key_data = ch.get("key_data", [])
            line = f"  • {ch_title}：{ch_summary}"
            if key_data:
                line += f"（關鍵數據：{'; '.join(key_data[:3])}）"
            doc_parts.append(line)

        parts.append("\n".join(doc_parts))

    if not parts:
        return ""

    result = "\n\n".join(parts)
    if len(result) > max_chars:
        result = result[:max_chars] + "\n\n…（結構摘要已截斷）"
    return result
