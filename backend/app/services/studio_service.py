"""
Studio artifact generation service.
Generates 9 types of AI content from a project's documents:
  podcast, slides, video_script, mindmap, report,
  flashcards, quiz, infographic, datatable
"""
import asyncio
import json
import logging

from llama_index.core.llms import ChatMessage, MessageRole

from app.services.llm_service import get_llm
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

SLIDES_PROMPT = """你是一位專業的簡報設計師。請根據以下文件內容，產生一份視覺多元的簡報 JSON。

═══════════════════════════════════════
【絕對禁止——違反以下任何一條即為錯誤】
═══════════════════════════════════════
1. conclusion 只能出現 1 次，必須是最後一張。禁止在中間章節放 conclusion。
2. cover 只能出現 1 次，必須是第一張。
3. 禁止重複結構：不可把簡報分成「兩個各自完整的弧線」——整份只有一個開頭和一個結尾。
4. hero_text 最多 1 張。section 最多 3 張。quote 最多 1 張。
5. content 版面不超過總頁數的 25%（例如 14 頁簡報最多 3 頁 content）。
6. 每條 bullet 不超過 25 個中文字。title 不超過 15 個中文字。subtitle 不超過 20 個中文字。

═══════════════════════════════════════
【基本要求】
═══════════════════════════════════════
- 總頁數：12-16 張（含封面和結論）
- 至少使用 6 種不同的 layout_type
- 使用繁體中文（icon 名稱和 visual_keywords 用英文）
- 輸出純 JSON，不加 markdown 標記

═══════════════════════════════════════
【敘事結構】先判斷文件類型：
═══════════════════════════════════════
- 匯報型：背景 → 行動/方法 → 成果數據 → 結論
- 提案型：問題/機會 → 解決方案 → 執行計畫 → 行動呼籲
- 教學型：概念 → 原理 → 步驟 → 應用
- 分析型：背景 → 發現 → 洞察 → 建議

═══════════════════════════════════════
【12 種版面格式】（每張必須指定 layout_type）
═══════════════════════════════════════

cover    第一張封面
  必填：title, subtitle
  示例：{"layout_type":"cover","title":"AI治理實務","subtitle":"ISO 42001 導入報告","bullets":[],"visual_keywords":["governance"]}

section  章節分隔（最多3張）
  必填：title  可選：subtitle
  示例：{"layout_type":"section","title":"導入背景與挑戰","bullets":[],"visual_keywords":["context"]}

content  一般說明（最多佔25%）
  必填：title, bullets（3-4條，每條≤25字）
  示例：{"layout_type":"content","title":"核心架構說明","bullets":["第一條要點，精煉","第二條要點，精煉"],"visual_keywords":["structure"]}

big_number  大數字指標（展示單一 KPI）
  必填：metric, label  可選：unit, title, bullets（1條補充說明）
  示例：{"layout_type":"big_number","title":"關鍵成效","metric":"87","unit":"%","label":"合規達成率","bullets":["相較去年提升 12%"],"visual_keywords":["kpi"]}

dual_card  左右對比（比較/Before-After）
  必填：title, left_card{title,bullets}, right_card{title,bullets}
  示例：{"layout_type":"dual_card","title":"導入前後對比","left_card":{"title":"導入前","bullets":["人工審查","回應慢"]},"right_card":{"title":"導入後","bullets":["自動化","即時回應"]},"bullets":[],"visual_keywords":["comparison"]}

multi_card  多格卡片（3-4個並列）
  必填：title, cards（每張必填 icon + title + description）
  icon 從以下選擇：FaRocket FaShieldAlt FaChartLine FaUsers FaCog FaLightbulb FaDatabase FaCloud FaCode FaGlobe FaLock FaBolt FaStar FaCheck FaArrowUp MdDashboard MdAnalytics MdSecurity MdSpeed MdBuild MdInsights
  示例：{"layout_type":"multi_card","title":"四大核心模組","cards":[{"icon":"FaShieldAlt","title":"風險管控","description":"識別並降低AI風險"},{"icon":"FaChartLine","title":"績效追蹤","description":"量化成效指標"}],"bullets":[],"visual_keywords":["modules"]}

stats  數字統計卡（2-4個數字）
  必填：title, bullets（格式：「數字：說明」，每條≤15字）
  示例：{"layout_type":"stats","title":"成果數字","bullets":["98%：系統可用率","1,200：新增用戶","3.2x：效能提升"],"visual_keywords":["metrics"]}

table  表格對比（規格/時程/數據）
  必填：title, headers（陣列）, rows（2D陣列，每格≤10字）
  示例：{"layout_type":"table","title":"方案比較","headers":["項目","方案A","方案B"],"rows":[["成本","低","高"],["功能","基本","完整"]],"bullets":[],"visual_keywords":["comparison"]}

flow  流程圖（3-5個步驟）
  必填：title, steps（每步：label≤8字，description≤15字）
  示例：{"layout_type":"flow","title":"實施四步驟","steps":[{"label":"需求分析","description":"蒐集利害關係人意見"},{"label":"設計規劃","description":"制定治理框架"}],"bullets":[],"visual_keywords":["process"]}

quote  引言（最多1張）
  必填：title, bullets[0]（引言內容，≤40字）  可選：subtitle（來源）
  示例：{"layout_type":"quote","title":"核心洞見","subtitle":"— ISO 42001:2023","bullets":["AI治理的本質是讓技術為人服務，而非反之"],"visual_keywords":["insight"]}

hero_text  全版大字轉場（最多1張）
  必填：title（≤12字）, subtitle（≤20字）
  示例：{"layout_type":"hero_text","title":"我們的核心承諾","subtitle":"以人為本，數據為輔","bullets":[],"visual_keywords":["vision"]}

conclusion  結論頁（全份只有1張，最後一頁）
  必填：title, subtitle, bullets（3-4條要點，每條≤25字）
  示例：{"layout_type":"conclusion","title":"結論與展望","subtitle":"感謝聆聽，歡迎交流","bullets":["要點一精煉","要點二精煉","要點三精煉"],"visual_keywords":["summary"]}

═══════════════════════════════════════
【JSON 輸出格式】
═══════════════════════════════════════
{
  "title": "簡報主標題（≤15字）",
  "theme": "從以下選擇：tech-innovation / midnight-galaxy / ocean-depths / modern-minimalist / sunset-boulevard / forest-canopy / golden-hour / arctic-frost / desert-rose / botanical-garden",
  "accent_color": "6碼hex不含#",
  "slides": [12-16張投影片陣列]
}

theme 選擇依據：
tech-innovation=科技AI軟體　midnight-galaxy=娛樂遊戲創意　ocean-depths=商業財務法律
modern-minimalist=設計建築工業　sunset-boulevard=行銷生活旅遊　forest-canopy=環境健康永續
golden-hour=文化歷史美食　arctic-frost=科學醫療研究　desert-rose=時尚精品美學　botanical-garden=教育生物科普

所有版面的 bullets 欄位都必須存在（不用 bullets 的版面給空陣列 []）。
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
_PROGRESS_UPDATE_EVERY = 500  # chars between DB progress updates


def _strip_code_fence(raw: str) -> str:
    """Remove markdown ```json ... ``` wrappers from LLM output."""
    if raw.startswith("```"):
        lines = [l for l in raw.split("\n") if not l.strip().startswith("```")]
        return "\n".join(lines).strip()
    return raw


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

        combined = "\n\n".join(parts)
        if len(combined) > _MAX_TOTAL_CHARS:
            combined = combined[:_MAX_TOTAL_CHARS] + "\n\n…（內容已截斷）"

        prompt = ARTIFACT_PROMPTS[artifact_type]
        user_msg = f"以下是專案的所有文件內容：\n\n{combined}"

        llm = get_llm()
        messages = [
            ChatMessage(role=MessageRole.SYSTEM, content=prompt),
            ChatMessage(role=MessageRole.USER, content=user_msg),
        ]

        update_studio_artifact(artifact_id, progress_message="AI 正在生成內容，請耐心等候…")

        # Use streaming to avoid httpx.ReadTimeout on long JSON responses
        # (non-streaming waits for the full response before the first byte arrives)
        raw_parts: list[str] = []
        total_chars = 0
        last_progress_chars = 0
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
        raw = "".join(raw_parts).strip()
        raw = _strip_code_fence(raw)

        data = json.loads(raw)
        content_text = _format_text(artifact_type, data)

        content_json_str = json.dumps(data, ensure_ascii=False)
        update_studio_artifact(
            artifact_id,
            status="done",
            content_json=content_json_str,
            content_text=content_text,
        )

        # For slides, kick off thumbnail generation in a separate task
        # so the artifact status flips to "done" immediately.
        if artifact_type == "slides":
            asyncio.create_task(_generate_thumbnails_bg(artifact_id, content_json_str))

    except json.JSONDecodeError:
        # LLM output wasn't valid JSON — store raw text so user can still read it
        update_studio_artifact(
            artifact_id,
            status="done",
            content_json="{}",
            content_text=raw,
        )
    except Exception:
        logging.exception("Studio artifact generation failed: project=%s type=%s", project_id, artifact_type)
        update_studio_artifact(
            artifact_id,
            status="error",
            error_message="生成失敗，請確認文件內容有效後稍後重試。",
        )


async def _generate_thumbnails_bg(artifact_id: int, content_json: str) -> None:
    """Run thumbnail generation in a thread (non-blocking background task)."""
    from app.services.thumbnail_service import generate_thumbnails
    try:
        await asyncio.to_thread(generate_thumbnails, artifact_id, content_json)
    except Exception:
        logging.exception("Thumbnail generation failed: artifact=%d", artifact_id)
