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

SLIDES_PROMPT = """你是專業簡報設計師。根據文件內容輸出 PptxGenJS 程式碼。

═══ 環境 ═══
`pres`已建立。`addIcon(sld,name,colorHex,x,y,w,h)`可用。畫布10"×5.625"。
禁用require/import/writeFile/fs/process/module/exports。
Icon: FaRocket FaShieldAlt FaChartLine FaUsers FaCog FaLightbulb FaDatabase FaCloud FaCode FaGlobe FaLock FaBolt FaStar FaCheck FaArrowUp FaExchangeAlt FaBalanceScale FaHandshake FaTrophy FaFlag FaHeart FaMoneyBillWave FaClipboardList FaSearchDollar FaBullseye FaProjectDiagram FaSitemap FaRegCalendarAlt FaUserTie FaBriefcase MdDashboard MdAnalytics MdSecurity MdSpeed MdBuild MdInsights MdTrendingUp MdCompareArrows MdTimeline MdAssessment

═══ 步驟一：敘事弧線 ═══
匯報型:背景→發現→數據→啟示→結論 | 提案型:痛點→方案→可行性→佐證→行動
分析型:定義→拆解→案例→利弊→建議 | 教學型:重要性→概念→步驟→案例→回顧
敘事型:背景→經過→轉折→影響→結語
根據弧線重新組織內容順序，不要逐段搬原文。

═══ 步驟二：選版面（相鄰不重複，≥5種）═══
1-3個數字→big_number | 比較兩者→dual_column | 3-4並列→card_grid
有序步驟→process_flow | 結構化數據→table | 趨勢佔比→chart
金句→quote_slide | 章節轉換→section_divider | 其餘→content_with_icon
連續3頁密集內容後插入section_divider或quote_slide。

═══ 步驟三：色票(bg/accent/title/text/muted/cardBg) ═══
tech-innovation(科技AI):1E1E1E/0066FF/FFFFFF/CCCCCC/888888/2A2A2A
ocean-depths(商業財務):1A2332/2D8B8B/F1FAEE/A8DADC/5A8A8A/243040
sunset-boulevard(行銷旅遊):264653/E76F51/E9C46A/F4A261/A09060/314D5E
forest-canopy(環境健康):2D4A2B/A4AC86/FAF9F6/C8CCB8/7D8471/3A5C38
golden-hour(文化歷史):4A403A/F4A900/D4B896/D4B896/C1666B/5A4E47
arctic-frost(科學醫療):FAFAFA/4A6FA5/1A2332/334155/909090/D4E4F7
botanical-garden(教育科普):F5F3ED/4A7C59/333333/555555/B7472A/EBE9E1
sports-arena(運動競技):1B1F3B/E63946/FFFFFF/D0D0D0/6C7A96/252A4A
modern-minimalist(設計建築):FFFFFF/708090/36454F/36454F/A0A0A0/F0F0F0
midnight-galaxy(娛樂創意):2B1E3E/A490C2/E6E6FA/C8B8E0/6B5B8A/3A2D50
desert-rose(時尚精品):E8D5C4/B87D6D/5D2E46/5D2E46/D4A5A5/F0E4D8

═══ 固定開頭 ═══
pres.defineLayout({name:"16x9",width:10,height:5.625});
pres.layout="16x9";
const theme={bg:"...",accent:"...",title:"...",text:"...",muted:"...",cardBg:"..."};
const FONT="Microsoft JhengHei";

═══ 共用標題（cover/section_divider/quote_slide除外）═══
sld.addShape(pres.ShapeType.rect,{x:0,y:0,w:10,h:0.06,fill:{color:theme.accent}});
sld.addText("標題",{x:0.5,y:0.2,w:9,h:0.6,fontSize:24,color:theme.title,fontFace:FONT,bold:true,shrinkText:true});

═══ 版面範例 ═══

【cover】bg=theme.bg。頂部accent條h:0.06。左裝飾線x:0.5,y:1.5,w:0.07,h:2.4。主標題x:0.85,y:1.5,w:8.5,h:1.2,fontSize:40。副標x:0.85,y:2.85,fontSize:18,color:muted。右下色塊x:8.8,y:4.6,w:1,h:0.8。

【section_divider】bg=accent。"SECTION 0N"x:0.6,y:1.2,fontSize:14,color:bg,charSpacing:4。標題x:0.6,y:1.8,fontSize:36,color:FFFFFF。描述x:0.6,y:3.3。

【big_number — 多數字並排（關鍵範例）】
const stats=[{num:"16",unit:"分鐘",label:"出場時間"},{num:"8.2",unit:"分",label:"場均得分"},{num:"+3",unit:"",label:"正負值"}];
const cardW=2.7,gap=0.45,startX=(10-(stats.length*cardW+(stats.length-1)*gap))/2;
stats.forEach((s,i)=>{
  const cx=startX+i*(cardW+gap);
  sld.addShape(pres.ShapeType.rect,{x:cx,y:1.3,w:cardW,h:3.0,fill:{color:theme.cardBg},rectRadius:0.08});
  sld.addShape(pres.ShapeType.rect,{x:cx,y:1.3,w:cardW,h:0.06,fill:{color:theme.accent}});
  sld.addText(s.num,{x:cx,y:1.6,w:cardW,h:1.4,fontSize:52,color:theme.accent,fontFace:FONT,bold:true,align:"center",valign:"middle",shrinkText:true});
  if(s.unit)sld.addText(s.unit,{x:cx,y:2.9,w:cardW,h:0.4,fontSize:14,color:theme.muted,fontFace:FONT,align:"center",shrinkText:true});
  sld.addText(s.label,{x:cx+0.2,y:3.5,w:cardW-0.4,h:0.5,fontSize:13,color:theme.text,fontFace:FONT,align:"center",shrinkText:true});
});
單一大數字：數字fontSize:100,x:0.5,y:1.4,w:9,h:2.2,align:center。說明y:3.6,fontSize:16,color:muted。

【dual_column】左卡x:0.4,y:1.15,w:4.35,h:3.6,fill:cardBg。頂部accent條h:0.06。icon+標題fontSize:18+要點列表fontSize:13。中間"VS"x:4.35,y:2.6。右卡x:5.25,結構同左。

【card_grid（關鍵範例）】
const items=[{icon:"FaChartLine",t:"概念一",d:"說明"},{icon:"FaUsers",t:"概念二",d:"說明"},{icon:"FaLightbulb",t:"概念三",d:"說明"}];
const n=items.length,cW=2.7,cG=0.45,cX=(10-(n*cW+(n-1)*cG))/2;
items.forEach((it,i)=>{
  const cx=cX+i*(cW+cG);
  sld.addShape(pres.ShapeType.rect,{x:cx,y:1.2,w:cW,h:3.4,fill:{color:theme.cardBg},rectRadius:0.08});
  sld.addShape(pres.ShapeType.rect,{x:cx,y:1.2,w:cW,h:0.06,fill:{color:theme.accent}});
  addIcon(sld,it.icon,"#"+theme.accent,cx+0.2,1.55,0.45,0.45);
  sld.addText(it.t,{x:cx+0.2,y:2.15,w:cW-0.4,h:0.45,fontSize:16,color:theme.title,fontFace:FONT,bold:true,shrinkText:true});
  sld.addText(it.d,{x:cx+0.2,y:2.7,w:cW-0.4,h:1.6,fontSize:12,color:theme.text,fontFace:FONT,valign:"top",shrinkText:true});
});

【process_flow】圓形r=0.35水平排列。連接線y:1.85。sGap=(9.0-sN*0.7)/(sN-1)。每步：accent圓+白色編號fontSize:16 → 標題y:2.5,fontSize:14 → 說明y:2.95,fontSize:11。

【content_with_icon】左icon x:0.5,y:1.4,w:0.9。垂直線x:1.7,w:0.04,h:3.2。右側addText陣列x:2.0,w:7.5交替粗體標題fontSize:16+說明fontSize:13。

【quote_slide】bg=cardBg。"\u201C"fontSize:80,x:0.8,y:0.8。引文x:1.2,y:1.7,w:7.6,fontSize:24,italic,align:center。分隔線y:3.9。出處y:4.1,fontSize:14。

【table】header:bold,color:FFFFFF,fill:accent,fontSize:13。交替行fill:cardBg/bg,fontSize:12。x:0.5,y:1.1,w:9。

【chart】BAR:x:0.8,y:1.2,w:8.4,h:3.8,barDir:"col",chartColors:[theme.accent],valGridLine:{color:theme.cardBg,size:0.5},catGridLine:{style:"none"},showValue:true,showLegend:false。
PIE:x:2.5,y:1.2,w:5,h:3.8,showPercent:true。

【conclusion】標題fontSize:28。accent線w:2。一句總結italic,color:accent。3條要點用卡片y=1.9+i*1.0,h:0.75,fill:cardBg + FaCheck icon + 文字。

═══ 規則 ═══
- (x+w)≤9.7, (y+h)≤5.5。N卡片：totalW=N*cardW+(N-1)*gap≤9.3, startX=(10-totalW)/2
- 只用文件真實數據，禁止編造數字/引言。全部繁體中文不混簡體
- 標題≤15字，要點≤25字。所有addText加shrinkText:true。addIcon的colorHex加"#"
- 不連續兩頁同版面。一頁最多4卡片/5步驟。數字用big_number不用bullet

═══ 輸出 ═══
只輸出JS。從pres.defineLayout(...)開始。不加```或說明。不呼叫writeFile()。
12-16頁。首頁cover末頁conclusion。≥5種版面。≥5頁用addIcon。
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

        if artifact_type == "slides":
            # LLM returns PptxGenJS JavaScript code (not JSON).
            # Store the code in content_text and execute it via Node.js runner.
            update_studio_artifact(
                artifact_id,
                status="done",
                content_json="{}",
                content_text=raw,
            )
            asyncio.create_task(_generate_slides_pptx_bg(artifact_id, raw))
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


_THUMB_ROOT = Path("/data/thumbnails")


async def _generate_slides_pptx_bg(artifact_id: int, pptxgenjs_code: str) -> None:
    """
    Background task for slides:
      1. Execute LLM-generated PptxGenJS code → .pptx file (Node.js runner)
      2. Persist the .pptx to /data/thumbnails/{id}/slides.pptx for download
      3. Convert .pptx → JPEG thumbnails (soffice → fitz)
    """
    from app.services.pptx_runner_service import execute_pptxgenjs
    from app.services.thumbnail_service import generate_thumbnails

    with tempfile.TemporaryDirectory() as tmp:
        pptx_tmp = str(Path(tmp) / "slides.pptx")
        update_studio_artifact(artifact_id, progress_message="正在執行 PptxGenJS 生成簡報…")

        success = await execute_pptxgenjs(pptxgenjs_code, pptx_tmp)
        if not success:
            logging.error("PptxGenJS execution failed for artifact %d", artifact_id)
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
                update_studio_artifact(artifact_id, progress_message=f"視覺 QA 發現 {problem_count} 個問題（詳見日誌）")
