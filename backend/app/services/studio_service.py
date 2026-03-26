"""
Studio artifact generation service.
Generates 9 types of AI content from a project's documents:
  podcast, slides, video_script, mindmap, report,
  flashcards, quiz, infographic, datatable
"""
import asyncio
import json
import logging
import shutil
import tempfile
from pathlib import Path

from llama_index.core.llms import ChatMessage, MessageRole

from app.services.llm_service import get_llm, _fresh_async_client
from app.services.summary_service import _collect_document_text
from app.models import (
    list_project_documents,
    update_studio_artifact,
    STUDIO_ARTIFACT_TYPES,
)

# ── System prompts ────────────────────────────────────────────

PODCAST_PROMPT = """你是一位專業的 Podcast 腳本撰寫人。請根據以下文件內容，撰寫一段雙人主持的對話腳本。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "host_a": ["主持人A第一句台詞", "主持人A第二句台詞", ...],
  "host_b": ["主持人B第一句台詞", "主持人B第二句台詞", ...]
}

規則：
1. 使用繁體中文。
2. 兩位主持人輪流對話，每人 8-12 句。
3. 對話自然生動，像真實的討論節目。
4. 涵蓋文件的主要重點與有趣細節。
5. 輸出必須是合法的 JSON。
"""

SLIDES_PROMPT = """你是專業簡報設計師。根據文件內容輸出 JSON 格式的簡報結構。

## 色票選擇（根據文件主題選一）
| 名稱 | 適用場景 |
|------|---------|
| tech | 科技、AI、軟體、數位轉型 |
| ocean | 環境、醫療、教育、公共政策 |
| golden | 金融、商業、行銷、品牌策略 |
| frost | 學術、研究、法律、白皮書 |
| garden | 農業、食品、永續、ESG |
| sports | 體育、賽事、健康、活力主題 |

## 可用版面類型
- cover: 封面（title, subtitle）
- section_divider: 章節分隔（label, title, description）
- big_number: 關鍵指標（title, items:[{value,unit,label}], 1-3個）
- card_grid: 並列卡片（title, cards:[{icon,title,description}], 2-4張）
- dual_column: 比較（title, left/right:{icon,title,points:[]}）
- process_flow: 流程步驟（title, steps:[{title,description}], 2-5步）
- content_with_icon: 圖文（title, icon, blocks:[{title,description}], 1-4個）
- quote_slide: 金句（quote, source）
- table: 表格（title, headers:[], rows:[[]]）
- chart: 圖表（title, chart_type:BAR|PIE, labels:[], values:[]）⚠️ 僅當文件含具體數字時使用
- conclusion: 結尾（title, summary, points:[{text,icon}]）

可用 icon：FaShieldAlt FaChartLine FaUsers FaLightbulb FaDatabase FaGlobe FaLock FaCheck FaGavel FaBook FaChartBar FaSearch FaFlag FaRocket FaHandshake FaCog

## 內容規則
- 首頁 cover，末頁 conclusion
- 相鄰兩頁不可相同 layout，全簡報 ≥5 種不同 layout
- 繁體中文，不編造數據或引言
- 標題≤15字，要點≤25字
- 有明確數字優先用 big_number；chart 僅用於文件有具體數字時
- 敘事弧線：匯報(背景→發現→數據→啟示→結論) | 提案(痛點→方案→佐證→行動) | 分析(定義→拆解→利弊→建議) | 教學(重要性→概念→步驟→回顧)

## 輸出範例（4頁示意，實際需封面＋12-15頁內容＋結尾，共 14-17 頁）
```json
{
  "theme": "tech",
  "narrative": "匯報",
  "slides": [
    {"layout": "cover", "title": "AI 導入成效報告", "subtitle": "2026 Q1 季度回顧"},
    {"layout": "big_number", "title": "關鍵指標", "items": [
      {"value": "98%", "unit": "準確率", "label": "模型推論"},
      {"value": "3.2x", "unit": "加速", "label": "處理速度"}
    ]},
    {"layout": "card_grid", "title": "三大策略方向", "cards": [
      {"icon": "FaRocket", "title": "擴展部署", "description": "推廣至五個部門"},
      {"icon": "FaDatabase", "title": "資料整合", "description": "統一資料湖架構"},
      {"icon": "FaUsers", "title": "人才培訓", "description": "培訓兩百名工程師"}
    ]},
    {"layout": "conclusion", "title": "總結與展望", "summary": "AI 導入已見初步成效",
     "points": [{"text": "模型準確率達 98%"}, {"text": "處理速度提升 3.2 倍"}, {"text": "下季度擴展至全公司", "icon": "FaRocket"}]}
  ]
}
```

## 輸出規則
- 只輸出 JSON，不加 ```json 標記或任何說明文字
- slides 陣列必須包含 14-17 頁（1 封面 ＋ 12-15 內容頁 ＋ 1 結尾）
- 充分利用文件素材，每個主題/章節至少一頁，不要將多個主題壓縮在一頁
- 輸出必須是合法的 JSON
"""

VIDEO_SCRIPT_PROMPT = """你是一位專業的影片旁白撰寫人。請根據以下文件內容，撰寫一段影片解說旁白腳本。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "script": "完整的旁白腳本文字，以段落分隔，包含場景提示用[...]標示"
}

規則：
1. 使用繁體中文。
2. 旁白長度約 400-600 字。
3. 語氣清晰、適合朗讀。
4. 可加入簡短的場景提示，例如 [顯示圖表]、[切換畫面]。
5. 涵蓋文件核心內容。
6. 輸出必須是合法的 JSON。
"""

MINDMAP_PROMPT = """你是一位知識整理專家。請根據以下文件內容，產生一份心智圖結構。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "root": {
    "label": "中心主題",
    "children": [
      {
        "label": "主要分支一",
        "children": [
          {"label": "子節點一"},
          {"label": "子節點二"}
        ]
      }
    ]
  }
}

規則：
1. 使用繁體中文。
2. 根節點為文件主題。
3. 第一層 4-6 個主要分支。
4. 每個分支 2-4 個子節點。
5. 第三層節點不再展開（最多三層）。
6. 輸出必須是合法的 JSON。
"""

REPORT_PROMPT = """你是一位專業的分析報告撰寫人。請根據以下文件內容，撰寫一份完整的分析報告。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "markdown": "完整的 Markdown 格式報告（使用 # ## ### 標題層級，- 列表，**粗體** 強調）"
}

規則：
1. 使用繁體中文。
2. 報告包含：執行摘要、背景、主要發現、分析、結論與建議。
3. 長度 600-1000 字。
4. 使用標準 Markdown 語法。
5. 輸出必須是合法的 JSON。
"""

FLASHCARDS_PROMPT = """你是一位教育內容設計師。請根據以下文件內容，製作一組學習卡片。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "cards": [
    {"front": "問題或概念", "back": "答案或解釋"},
    ...
  ]
}

規則：
1. 使用繁體中文。
2. 製作 10-15 張卡片。
3. 正面是問題、概念或術語。
4. 背面是簡潔的答案或定義（1-3 句）。
5. 涵蓋文件的關鍵知識點。
6. 輸出必須是合法的 JSON。
"""

QUIZ_PROMPT = """你是一位出題老師。請根據以下文件內容，設計一份選擇題測驗。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "questions": [
    {
      "q": "題目文字？",
      "options": ["選項A", "選項B", "選項C", "選項D"],
      "answer": 0,
      "explanation": "解析說明"
    }
  ]
}

規則：
1. 使用繁體中文。
2. 出 8-10 道選擇題。
3. 每題四個選項，answer 為正確答案的索引（0-3）。
4. 難易適中，考察理解而非死記。
5. 每題附上解析。
6. 輸出必須是合法的 JSON。
"""

INFOGRAPHIC_PROMPT = """你是一位資料視覺化專家。請根據以下文件內容，萃取出適合以圖表呈現的數據或比較資訊。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "chart_type": "bar",
  "title": "圖表標題",
  "labels": ["項目A", "項目B", "項目C"],
  "datasets": [
    {
      "label": "數據系列名稱",
      "data": [100, 200, 150]
    }
  ]
}

規則：
1. 使用繁體中文。
2. chart_type 從 "bar"（長條圖）、"pie"（圓餅圖）、"line"（折線圖）中選最適合的。
3. labels 3-8 個項目。
4. 若文件無明確數字，可用相對重要性（1-10 分）或出現頻率估計。
5. 輸出必須是合法的 JSON。
"""

DATATABLE_PROMPT = """你是一位資料分析師。請根據以下文件內容，萃取或整理成一份結構化的資料表格。

請嚴格按照以下 JSON 格式輸出（不要加入其他文字或 markdown 標記）：
{
  "title": "表格標題",
  "headers": ["欄位一", "欄位二", "欄位三"],
  "rows": [
    ["資料A1", "資料A2", "資料A3"],
    ["資料B1", "資料B2", "資料B3"]
  ]
}

規則：
1. 使用繁體中文。
2. 3-6 個欄位，5-15 筆資料。
3. 選擇文件中最有價值的比較或清單資訊製表。
4. 若文件含多個主題，可整理成重要概念對照表。
5. 輸出必須是合法的 JSON。
"""

ARTIFACT_PROMPTS: dict[str, str] = {
    "podcast": PODCAST_PROMPT,
    "slides": SLIDES_PROMPT,
    "video_script": VIDEO_SCRIPT_PROMPT,
    "mindmap": MINDMAP_PROMPT,
    "report": REPORT_PROMPT,
    "flashcards": FLASHCARDS_PROMPT,
    "quiz": QUIZ_PROMPT,
    "infographic": INFOGRAPHIC_PROMPT,
    "datatable": DATATABLE_PROMPT,
}

# Types where content_text holds the plain-text (copy-friendly) version
_TEXT_ONLY_TYPES = {"video_script", "report"}

_MAX_PER_DOC_CHARS = 8000
_MAX_TOTAL_CHARS = 20000
_SLIDES_MAX_PER_DOC_CHARS = 6000   # enough material per doc for 8-12 slides
_SLIDES_MAX_TOTAL_CHARS = 15000    # allow richer context so LLM can fill 8-12 pages
_PROGRESS_UPDATE_EVERY = 500  # chars between DB progress updates
_STREAM_TIMEOUT_SECS = 300    # max seconds to wait for LLM streaming (including first-token latency)
_STREAM_MAX_RETRIES = 2       # retry attempts when streaming returns 0 chars (server busy)


def _strip_code_fence(raw: str) -> str:
    """Remove markdown ```json ... ``` wrappers from LLM output."""
    if raw.startswith("```"):
        lines = [l for l in raw.split("\n") if not l.strip().startswith("```")]
        return "\n".join(lines).strip()
    return raw


def _sanitize_json(raw: str) -> str:
    """
    Clean common LLM JSON output issues before Pydantic validation.
    1. Strip markdown code fences (```json ... ```)
    2. Remove trailing commas before } or ]
    3. Unescape literal newlines inside JSON strings
    """
    import re
    # 1. Strip code fences
    text = _strip_code_fence(raw)
    # 2. Remove trailing commas: {"a": 1,} → {"a": 1}
    text = re.sub(r",\s*([}\]])", r"\1", text)
    # 3. Replace literal (unescaped) newlines inside JSON strings with \\n
    # Only replace newlines that are inside double-quoted strings
    def _fix_newlines(m: re.Match) -> str:
        return m.group(0).replace("\n", "\\n").replace("\r", "")
    text = re.sub(r'"[^"\\]*(?:\\.[^"\\]*)*"', _fix_newlines, text, flags=re.DOTALL)
    return text.strip()


async def _fix_slides_json(raw_json: str, validation_error: str) -> str:
    """
    Ask the LLM to fix a JSON validation error in slides spec.
    Returns the corrected JSON string, or the original if the fix fails.
    Uses slides_model if configured.
    """
    from app.routers.settings import _runtime_settings as _rs
    fix_prompt = (
        "以下 JSON 簡報資料有驗證錯誤，請修正並只輸出修正後的完整 JSON，不加任何說明或 markdown 標記。\n\n"
        f"錯誤訊息：\n{validation_error}\n\n"
        f"原始 JSON：\n{raw_json}"
    )
    messages = [ChatMessage(role=MessageRole.USER, content=fix_prompt)]
    fix_client = _fresh_async_client()
    llm = get_llm(
        async_client=fix_client,
        model_override=_rs.slides_model if _rs.slides_model else None,
    )
    try:
        parts: list[str] = []
        async for chunk in await llm.astream_chat(messages):
            if chunk.delta:
                parts.append(chunk.delta)
        fixed = "".join(parts).strip()
        return _sanitize_json(fixed) if fixed else raw_json
    except Exception:
        logging.exception("_fix_slides_json LLM call failed — using original JSON")
        return raw_json
    finally:
        await fix_client.aclose()


def _format_text(artifact_type: str, data: dict) -> str:
    """Extract a plain-text representation from parsed JSON data."""
    if artifact_type == "video_script":
        return data.get("script", "")
    if artifact_type == "report":
        return data.get("markdown", "")
    if artifact_type == "podcast":
        # Interleave host_a and host_b lines
        host_a = data.get("host_a", [])
        host_b = data.get("host_b", [])
        lines = []
        for i, (a, b) in enumerate(zip(host_a, host_b)):
            lines.append(f"主持人 A：{a}")
            lines.append(f"主持人 B：{b}")
        # Append remaining lines if one list is longer
        for line in host_a[len(host_b):]:
            lines.append(f"主持人 A：{line}")
        for line in host_b[len(host_a):]:
            lines.append(f"主持人 B：{line}")
        return "\n\n".join(lines)
    return ""


# ── Core generation function ──────────────────────────────────

async def generate_artifact(project_id: int, artifact_id: int, artifact_type: str) -> None:
    """
    Background task: collect all document text for the project,
    call the LLM with the appropriate prompt, then persist the result.
    """
    raw = ""
    try:
        update_studio_artifact(artifact_id, status="generating", progress_message="正在讀取文件內容…")

        # Collect text from all ready documents in the project
        docs = list_project_documents(project_id)
        parts: list[str] = []
        for doc in docs:
            if doc.status == "ready":
                text = _collect_document_text(doc.collection_name, max_chars=_MAX_PER_DOC_CHARS)
                if text:
                    parts.append(f"=== 文件：{doc.filename} ===\n{text}")

        if not parts:
            update_studio_artifact(
                artifact_id,
                status="error",
                error_message="專案中尚無可用的文件內容，請先上傳並等待文件處理完成。",
            )
            return

        if artifact_type not in ARTIFACT_PROMPTS:
            update_studio_artifact(
                artifact_id,
                status="error",
                error_message=f"不支援的 artifact 類型：{artifact_type}",
            )
            return

        # Slides use a tighter text budget to keep the total LLM context smaller,
        # which reduces model reasoning time (TTFT) significantly.
        if artifact_type == "slides":
            parts_slides: list[str] = []
            for doc in docs:
                if doc.status == "ready":
                    text = _collect_document_text(doc.collection_name, max_chars=_SLIDES_MAX_PER_DOC_CHARS)
                    if text:
                        parts_slides.append(f"=== 文件：{doc.filename} ===\n{text}")
            combined = "\n\n".join(parts_slides) if parts_slides else "\n\n".join(parts)
            if len(combined) > _SLIDES_MAX_TOTAL_CHARS:
                combined = combined[:_SLIDES_MAX_TOTAL_CHARS] + "\n\n…（內容已截斷）"
        else:
            combined = "\n\n".join(parts)
            if len(combined) > _MAX_TOTAL_CHARS:
                combined = combined[:_MAX_TOTAL_CHARS] + "\n\n…（內容已截斷）"

        prompt = ARTIFACT_PROMPTS[artifact_type]
        user_msg = f"以下是專案的所有文件內容：\n\n{combined}"

        # Use a fresh AsyncClient per generation to avoid stale connection
        # pool state after asyncio cancellation (previous timeout can corrupt
        # the shared pool, causing the next streaming request to receive 0 bytes).
        _stream_client = _fresh_async_client()
        # Slides may use a dedicated larger model (slides_model) to improve
        # generation quality and reduce TTFT on complex prompts.
        from app.routers.settings import _runtime_settings as _rs
        llm = get_llm(
            async_client=_stream_client,
            model_override=_rs.slides_model if artifact_type == "slides" and _rs.slides_model else None,
            max_tokens_override=8192 if artifact_type == "slides" else None,
        )
        messages = [
            ChatMessage(role=MessageRole.SYSTEM, content=prompt),
            ChatMessage(role=MessageRole.USER, content=user_msg),
        ]

        update_studio_artifact(artifact_id, progress_message="AI 正在生成內容，請耐心等候…")

        # Streaming with auto-retry on zero-char timeout.
        # The model server can be temporarily overloaded, causing 0 chars within
        # the timeout. A fresh client + brief pause before retry often succeeds.
        raw_parts: list[str] = []
        total_chars = 0
        last_progress_chars = 0
        for _attempt in range(1 + _STREAM_MAX_RETRIES):
            if _attempt > 0:
                logging.info(
                    "Retrying LLM stream for artifact %d (attempt %d/%d)",
                    artifact_id, _attempt + 1, 1 + _STREAM_MAX_RETRIES,
                )
                update_studio_artifact(
                    artifact_id,
                    progress_message=f"AI 伺服器忙碌，自動重試中（第 {_attempt + 1} 次）…",
                )
                await asyncio.sleep(5)
                await _stream_client.aclose()
                _stream_client = _fresh_async_client()
                llm = get_llm(async_client=_stream_client)

            raw_parts = []
            total_chars = 0
            last_progress_chars = 0
            try:
                async with asyncio.timeout(_STREAM_TIMEOUT_SECS):
                    async for chunk in await llm.astream_chat(messages):
                        if chunk.delta:
                            raw_parts.append(chunk.delta)
                            total_chars += len(chunk.delta)
                            if total_chars - last_progress_chars >= _PROGRESS_UPDATE_EVERY:
                                last_progress_chars = total_chars
                                update_studio_artifact(
                                    artifact_id,
                                    progress_message=f"AI 正在生成…已產生約 {total_chars} 字",
                                )
            except TimeoutError:
                logging.warning(
                    "LLM streaming timed out after %ds for artifact %d (got %d chars, attempt %d)",
                    _STREAM_TIMEOUT_SECS, artifact_id, total_chars, _attempt + 1,
                )
                if total_chars == 0 and _attempt < _STREAM_MAX_RETRIES:
                    continue  # retry
                if not raw_parts:
                    update_studio_artifact(
                        artifact_id,
                        status="error",
                        error_message=f"AI 伺服器忙碌，{_STREAM_TIMEOUT_SECS} 秒內未回應（已重試 {_attempt + 1} 次），請稍後重試。",
                    )
                    await _stream_client.aclose()
                    return
                # Got partial content — try to use what we have
            break  # success or partial — stop retrying
        await _stream_client.aclose()
        raw = "".join(raw_parts).strip()
        raw = _strip_code_fence(raw)

        if not raw:
            update_studio_artifact(
                artifact_id,
                status="error",
                error_message="AI 未產生任何內容，可能模型暫時無法回應，請稍後重試。",
            )
            return

        if artifact_type == "slides":
            # LLM returns structured JSON (SlidesSpec), not PptxGenJS code.
            # Validate via Pydantic, fix once if needed, then hand off to renderer.
            from pydantic import ValidationError
            from app.schemas.slides import SlidesSpec

            sanitized = _sanitize_json(raw)
            spec: SlidesSpec | None = None
            try:
                spec = SlidesSpec.model_validate_json(sanitized)
            except (ValidationError, Exception) as first_err:
                logging.warning(
                    "SlidesSpec validation failed for artifact %d — asking LLM to fix: %s",
                    artifact_id, str(first_err)[:300],
                )
                update_studio_artifact(artifact_id, progress_message="JSON 格式有誤，正在要求 AI 修正…")
                fixed_json = await _fix_slides_json(sanitized, str(first_err))
                try:
                    spec = SlidesSpec.model_validate_json(fixed_json)
                    sanitized = fixed_json
                except (ValidationError, Exception) as second_err:
                    update_studio_artifact(
                        artifact_id,
                        status="error",
                        content_json="{}",
                        content_text=raw,
                        error_message=f"簡報 JSON 驗證失敗，請稍後重試。({str(second_err)[:200]})",
                    )
                    return

            spec_json = spec.model_dump_json()
            update_studio_artifact(
                artifact_id,
                content_json=spec_json,
                content_text="",
                progress_message="AI 產出完成，正在建立簡報…",
            )
            asyncio.create_task(_generate_slides_from_json(artifact_id, spec_json))
            return

        data = json.loads(raw)
        content_text = _format_text(artifact_type, data)

        content_json_str = json.dumps(data, ensure_ascii=False)
        update_studio_artifact(
            artifact_id,
            status="done",
            content_json=content_json_str,
            content_text=content_text,
        )

    except json.JSONDecodeError:
        # LLM output wasn't valid JSON — store raw text for debugging
        update_studio_artifact(
            artifact_id,
            status="error",
            content_json="{}",
            content_text=raw,
            error_message="AI 回應格式有誤，無法解析內容，請稍後重試。",
        )
    except Exception:
        logging.exception("Studio artifact generation failed: project=%s type=%s", project_id, artifact_type)
        update_studio_artifact(
            artifact_id,
            status="error",
            error_message="生成失敗，請確認文件內容有效後稍後重試。",
        )


_THUMB_ROOT = Path("/data/thumbnails")

# Limit concurrent slides renders (JSON renderer + LibreOffice thumbnail generation
# both consume significant CPU/memory; cap at 2 to avoid OOM on constrained hosts).
_SLIDES_SEMAPHORE = asyncio.Semaphore(2)


async def _generate_slides_from_json(artifact_id: int, spec_json: str) -> None:
    """
    Background task: convert a validated SlidesSpec JSON string into a PPTX
    file using the deterministic slides_renderer.js template engine, then
    generate thumbnails and run optional Vision QA.
    """
    async with _SLIDES_SEMAPHORE:
        await _generate_slides_from_json_inner(artifact_id, spec_json)


async def _generate_slides_from_json_inner(artifact_id: int, spec_json: str) -> None:
    import time
    from app.services.pptx_runner_service import execute_slides_json, RunResult
    from app.services.thumbnail_service import generate_thumbnails

    t0 = time.monotonic()

    with tempfile.TemporaryDirectory() as tmp:
        pptx_tmp = str(Path(tmp) / "slides.pptx")
        update_studio_artifact(artifact_id, progress_message="正在渲染簡報範本…")

        result, stderr = await execute_slides_json(spec_json, pptx_tmp)

        if result != RunResult.SUCCESS:
            logging.error(
                "slides_renderer failed for artifact %d (%s): %s",
                artifact_id, result, stderr,
            )
            update_studio_artifact(
                artifact_id,
                status="error",
                error_message="簡報渲染失敗，請稍後重試。",
            )
            return

        # Persist PPTX for download
        persistent_dir = _THUMB_ROOT / str(artifact_id)
        persistent_dir.mkdir(parents=True, exist_ok=True)
        pptx_path = persistent_dir / "slides.pptx"
        shutil.copy2(pptx_tmp, pptx_path)

        update_studio_artifact(artifact_id, progress_message="正在生成投影片縮圖…")
        try:
            await asyncio.to_thread(generate_thumbnails, artifact_id, str(pptx_path))
        except Exception:
            logging.exception("Thumbnail generation failed: artifact=%d", artifact_id)
            update_studio_artifact(
                artifact_id,
                status="error",
                error_message="縮圖生成失敗，請稍後重試。",
            )
            return

        # Optional Vision QA
        from app.routers.settings import _runtime_settings
        from app.services.vision_qa import visual_qa_check
        from app.services.thumbnail_service import get_thumbnail_urls

        if _runtime_settings.vision_model:
            thumb_urls = get_thumbnail_urls(artifact_id)
            thumb_paths = [_THUMB_ROOT / str(artifact_id) / Path(u).name for u in thumb_urls]
            update_studio_artifact(artifact_id, progress_message="正在進行視覺品質檢查…")
            issues = await visual_qa_check(
                thumb_paths,
                api_base_url=_runtime_settings.llm_api_base_url,
                api_key=_runtime_settings.llm_api_key,
                model=_runtime_settings.vision_model,
            )
            problem_count = sum(len(s.get("issues", [])) for s in issues)
            if problem_count > 0:
                logging.warning(
                    "Vision QA found %d issue(s) in artifact %d: %s",
                    problem_count, artifact_id, issues,
                )

        elapsed = time.monotonic() - t0
        logging.info(
            "slides_from_json artifact=%d done in %.1fs (renderer+thumbnails+qa)",
            artifact_id, elapsed,
        )
        update_studio_artifact(artifact_id, status="done", progress_message="")


async def _fix_pptxgenjs_code(code: str, error_msg: str) -> str:
    """
    Ask the LLM to fix an error in PptxGenJS code.
    Returns the corrected code, or the original code if the fix attempt fails.
    """
    fix_prompt = (
        "以下 PptxGenJS 程式碼執行時發生錯誤，請修正並只輸出修正後的完整 JS 程式碼，"
        "不加任何說明或 markdown 標記。\n\n"
        "重要提醒：每張投影片必須先 var sld = pres.addSlide({bkgd:theme.bg}) 才能使用 sld。\n\n"
        f"錯誤訊息：{error_msg}\n\n"
        f"程式碼：\n{code}"
    )
    messages = [ChatMessage(role=MessageRole.USER, content=fix_prompt)]
    fix_client = _fresh_async_client()
    llm = get_llm(async_client=fix_client)
    try:
        parts: list[str] = []
        async for chunk in await llm.astream_chat(messages):
            if chunk.delta:
                parts.append(chunk.delta)
        fixed = "".join(parts).strip()
        fixed = _strip_code_fence(fixed)
        return fixed if fixed else code
    except Exception:
        logging.exception("Code fix LLM call failed for artifact — using original code")
        return code
    finally:
        await fix_client.aclose()


async def _generate_slides_pptx_bg(artifact_id: int, pptxgenjs_code: str) -> None:
    """
    Background task for slides:
      1. Execute LLM-generated PptxGenJS code → .pptx file (Node.js runner)
         On SyntaxError or RuntimeError: ask LLM to fix and retry once.
      2. Persist the .pptx to /data/thumbnails/{id}/slides.pptx for download
      3. Convert .pptx → JPEG thumbnails (soffice → fitz)
    """
    from app.services.pptx_runner_service import execute_pptxgenjs, RunResult
    from app.services.thumbnail_service import generate_thumbnails

    with tempfile.TemporaryDirectory() as tmp:
        pptx_tmp = str(Path(tmp) / "slides.pptx")
        update_studio_artifact(artifact_id, progress_message="正在執行 PptxGenJS 生成簡報…")

        result, stderr = await execute_pptxgenjs(pptxgenjs_code, pptx_tmp)

        # On syntax or runtime error: ask LLM to fix then retry once
        if result in (RunResult.SYNTAX_ERROR, RunResult.RUNTIME_ERROR):
            logging.warning("PptxGenJS %s for artifact %d — asking LLM to fix", result.value, artifact_id)
            update_studio_artifact(artifact_id, progress_message="偵測到執行錯誤，正在要求 AI 修正…")
            pptxgenjs_code = await _fix_pptxgenjs_code(pptxgenjs_code, stderr)
            update_studio_artifact(artifact_id, progress_message="重新執行修正後的程式碼…")
            # Remove stale output file from first attempt before retry
            Path(pptx_tmp).unlink(missing_ok=True)
            result, stderr = await execute_pptxgenjs(pptxgenjs_code, pptx_tmp)

        if result != RunResult.SUCCESS:
            logging.error(
                "PptxGenJS execution failed for artifact %d (%s): %s",
                artifact_id, result, stderr,
            )
            update_studio_artifact(
                artifact_id,
                status="error",
                error_message="PptxGenJS 執行失敗，請稍後重試。",
            )
            return

        # Persist PPTX alongside thumbnails so it can be served as a static file
        # at /thumbnails/{artifact_id}/slides.pptx
        persistent_dir = _THUMB_ROOT / str(artifact_id)
        persistent_dir.mkdir(parents=True, exist_ok=True)
        pptx_path = persistent_dir / "slides.pptx"
        shutil.copy2(pptx_tmp, pptx_path)

        update_studio_artifact(artifact_id, progress_message="正在生成投影片縮圖…")
        try:
            await asyncio.to_thread(generate_thumbnails, artifact_id, str(pptx_path))
        except Exception:
            logging.exception("Thumbnail generation failed: artifact=%d", artifact_id)
            update_studio_artifact(
                artifact_id,
                status="error",
                error_message="縮圖生成失敗，請稍後重試。",
            )
            return

        # Optional: Vision QA — only runs when vision_model is configured
        from app.routers.settings import _runtime_settings
        from app.services.vision_qa import visual_qa_check
        from app.services.thumbnail_service import get_thumbnail_urls

        if _runtime_settings.vision_model:
            thumb_urls = get_thumbnail_urls(artifact_id)
            thumb_paths = [_THUMB_ROOT / str(artifact_id) / Path(u).name for u in thumb_urls]
            update_studio_artifact(artifact_id, progress_message="正在進行視覺品質檢查…")
            issues = await visual_qa_check(
                thumb_paths,
                api_base_url=_runtime_settings.llm_api_base_url,
                api_key=_runtime_settings.llm_api_key,
                model=_runtime_settings.vision_model,
            )
            problem_count = sum(len(s.get("issues", [])) for s in issues)
            if problem_count > 0:
                logging.warning("Vision QA found %d issue(s) in artifact %d: %s", problem_count, artifact_id, issues)

        # Thumbnails ready — mark artifact as done so frontend stops polling
        update_studio_artifact(artifact_id, status="done", progress_message="")
