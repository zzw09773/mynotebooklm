# 簡報功能 JSON 中間層改造

## Context

NotebookLM 的簡報功能目前透過 LLM 直接生成 PptxGenJS JavaScript 程式碼，需要 4 層錯誤修正機制（Python 前處理 → JS 修正 → 相容性 shim → LLM 重試）。根本原因是讓 LLM 同時負責「內容決策」和「程式碼實作」。

本計畫將簡報功能改造為 **JSON 中間層架構**：LLM 只負責產出結構化 JSON（版面類型、標題、要點），由確定性的模板引擎負責渲染成 PptxGenJS 程式碼，從根本消除程式碼生成錯誤。

---

## 現況評估摘要

### 核心問題

1. **4 層 shim 是架構警示**：Python 前處理 → JS regex 修正 → addText/addShape shim → LLM 重試
2. **max_tokens=8192 偏低**：12 頁 × ~700 token/頁 ≈ 8400，容易截斷
3. **無並行控制**：`asyncio.create_task()` 無 semaphore
4. **`_fix_pptxgenjs_code` 未使用 slides_model**，修正 prompt 也缺少設計規則
5. **無錯誤率追蹤**，無法量化改進效果

### 現行版面類型（共 11 種，改造後需全部支援）

| 版面 | 用途 | 渲染注意事項 |
|------|------|-------------|
| `cover` | 封面 | 固定佈局 |
| `section_divider` | 章節分隔 | 固定佈局 |
| `big_number` | 關鍵指標 | **1 個→超大字居中；2-3 個→卡片並排，動態 cardWidth** |
| `dual_column` | 比較 | 固定左右分欄 |
| `card_grid` | 並列卡片 | **3 個 vs 4 個卡片的 cardWidth 不同，需動態計算** |
| `process_flow` | 流程步驟 | **3-5 個步驟的間距需動態調整** |
| `content_with_icon` | 圖文交替 | 固定佈局 |
| `quote_slide` | 金句 | 固定佈局 |
| `table` | 表格 | 動態欄寬 |
| `chart` | 圖表 | **僅當文件含具體數據時使用**（見 Step 1 說明） |
| `conclusion` | 結尾 | 固定佈局 |

---

## 實作計畫

### Step 1: 定義 Slide JSON Schema（Pydantic models）

**新增檔案：** `backend/app/schemas/slides.py`

定義以下 Pydantic models：

- `CoverSlide` — layout="cover", title, subtitle
- `SectionDividerSlide` — layout="section_divider", label, title, description
- `BigNumberSlide` — layout="big_number", title, items: list[BigNumberItem(value, unit, label)]（min=1, max=3）
- `CardGridSlide` — layout="card_grid", title, cards: list[CardItem(icon, title, description)]（min=2, max=4）
- `DualColumnSlide` — layout="dual_column", title, left/right: DualColumnSide(icon, title, points)
- `ProcessFlowSlide` — layout="process_flow", title, steps: list[ProcessStep(title, description)]（min=2, max=5）
- `ContentWithIconSlide` — layout="content_with_icon", title, icon, blocks: list[ContentBlock(title, description)]
- `QuoteSlide` — layout="quote_slide", quote, source
- `TableSlide` — layout="table", title, headers, rows
- `ChartSlide` — layout="chart", title, chart_type(BAR/PIE), labels, values
- `ConclusionSlide` — layout="conclusion", title, summary, points: list[ConclusionPoint(text, icon="FaCheck")]（icon 有預設值，LLM 可省略但 renderer 仍會畫）

使用 `Annotated[Union[...], Field(discriminator="layout")]` 做 discriminated union。

頂層：`SlidesSpec(theme, narrative, slides: list[SlideData])`

每個欄位都有 max_length 約束（標題≤15字、要點≤25字），min/max items 約束（slides: 8-12, cards: 2-4, steps: 2-5）。

**chart 的特殊處理：**
- ChartSlide 在 schema 中是 optional——它是 SlideData union 的一員，但 prompt 會明確指示「只有文件中包含具體數據時才使用 chart layout」
- 如果文件純文字無數字，LLM 直接跳過 chart，使用其他 layout
- 這避免了 LLM 為了湊版面而編造假數據的問題

### Step 2: 重寫 SLIDES_PROMPT

**修改檔案：** `backend/app/services/studio_service.py`（SLIDES_PROMPT 區塊）

新 prompt 包含 4 個區塊：

**區塊 A：色票對照表（~200 字）**

LLM 需要知道每組色票適合什麼場景才能正確選擇：

```
色票選擇（根據文件主題選一）：
| 名稱 | 適用場景 |
| tech | 科技、AI、軟體、數位轉型 |
| ocean | 環境、醫療、教育、公共政策 |
| golden | 金融、商業、行銷、品牌策略 |
| frost | 學術、研究、法律、白皮書 |
| garden | 農業、食品、永續、ESG |
| sports | 體育、賽事、健康、活力主題 |
```

**區塊 B：JSON schema 描述（每種 layout 的欄位說明）**

不含座標，只描述語義欄位。特別標註：
- `chart`：「只有文件中包含具體數據（數字、百分比、統計量）時才使用此 layout。若文件無明確數字資料，請選擇其他 layout。」

**區塊 C：內容規則**
- 首頁 cover、末頁 conclusion
- 相鄰兩頁不可相同 layout，全簡報 ≥5 種不同 layout
- 繁體中文、不編造數據
- 標題≤15字、要點≤25字
- 有明確數字 → 優先 big_number
- 可用 icon 列表

**區塊 D：3-4 頁 mini example（~400 字）**

提供一個完整的 JSON output 範例，讓模型知道期望格式：

```json
{
  "theme": "tech",
  "narrative": "匯報",
  "slides": [
    {
      "layout": "cover",
      "title": "AI 導入成效報告",
      "subtitle": "2026 Q1 季度回顧"
    },
    {
      "layout": "big_number",
      "title": "關鍵指標",
      "items": [
        {"value": "98%", "unit": "準確率", "label": "模型推論"},
        {"value": "3.2x", "unit": "加速", "label": "處理速度"}
      ]
    },
    {
      "layout": "card_grid",
      "title": "三大策略方向",
      "cards": [
        {"icon": "FaRocket", "title": "擴展部署", "description": "將服務推廣至五個部門"},
        {"icon": "FaDatabase", "title": "資料整合", "description": "統一資料湖架構"},
        {"icon": "FaUsers", "title": "人才培訓", "description": "培訓兩百名工程師"}
      ]
    },
    {
      "layout": "conclusion",
      "title": "總結與展望",
      "summary": "AI 導入已見初步成效",
      "points": [
        {"text": "模型準確率達 98%"},
        {"text": "處理速度提升 3.2 倍"},
        {"text": "下季度擴展至全公司", "icon": "FaRocket"}
      ]
    }
  ]
}
```

**預估 prompt 長度：** ~1200 字（含 example），比原本 ~2500 字減半。

### Step 3: 新增 `_sanitize_json()` 清理函式

**修改檔案：** `backend/app/services/studio_service.py`

在 Pydantic 驗證前加入 `_sanitize_json(raw: str) -> str`，處理 LLM 產出 JSON 的三種常見錯誤：

1. **Markdown code fence**：複用現有 `_strip_code_fence()`
2. **Trailing comma**：`{"a": 1,}` → `{"a": 1}` — 用 regex `r',\s*([}\]])'` → `r'\1'`
3. **未轉義換行符**：JSON string 中的裸 `\n` 需要變成 `\\n` — 用 regex 處理 `"..."` 內的 literal newline

處理順序：strip_code_fence → trailing comma → unescaped newline → return

### Step 4: 新增 JSON 驗證失敗時的 LLM 修正機制

**修改檔案：** `backend/app/services/studio_service.py`

新增 `_fix_slides_json(raw: str, validation_error: str) -> str`：

當 Pydantic 驗證失敗時，將 validation error 餵回 LLM 做一次修正：

```
以下 JSON 簡報資料有驗證錯誤，請修正並只輸出修正後的完整 JSON：

錯誤訊息：
slides[3].cards[2].title: String should have at most 15 characters
slides[5].layout: Input should be 'cover', 'big_number', ...

原始 JSON：
{...}
```

**與舊版 `_fix_pptxgenjs_code` 的差異：**
- LLM 修 JSON 比修 JS 容易十倍——格式明確、錯誤訊息精準
- 使用 `slides_model`（如已設定）
- Validation error 天然包含「哪個欄位、什麼問題」，LLM 修正精確度極高
- 修正後再次通過 `_sanitize_json` + Pydantic 驗證
- 仍僅重試一次（避免迴圈）

### Step 5: 抽取 `addIcon` 為共用模組 + 新增模板引擎 `slides_renderer.js`

**新增檔案：** `backend/app/scripts/icon_utils.js`

從 `pptx_runner.js:34-55` 抽取 `addIcon` 函式為獨立模組：

```javascript
// icon_utils.js
const fs = require("fs");
const path = require("path");
const ICONS = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/icon_registry.json"), "utf8"));

function addIcon(sld, iconName, colorHex, x, y, w, h) {
    // ... 現有邏輯（SVG path → base64 data URI → sld.addImage）
}
module.exports = { addIcon, ICONS };
```

`pptx_runner.js` 改為 `const { addIcon } = require("./icon_utils");`（向後相容）。

**新增檔案：** `backend/app/scripts/slides_renderer.js`

```
Usage: node slides_renderer.js <slides.json> <output.pptx>
```

內部結構：
- `const { addIcon } = require("./icon_utils");` — 共用 icon 邏輯
- `THEMES` 物件：6 套色票的 hex 值（single source of truth）
- `FONT` 常數："Microsoft JhengHei"
- 11 個 render 函式（座標從現有 SLIDES_PROMPT 翻譯）
- `RENDERERS` dispatch map
- main：`JSON.parse` → iterate slides → dispatch → `pres.writeFile`

**動態佈局的 render 函式重點：**

`renderBigNumber(pres, theme, data)`：
- `items.length === 1`：超大字居中 fontSize:100, x:0.5, y:1.4, w:9, h:2.2, align:center
- `items.length === 2-3`：N 張等寬 cardW=2.7 卡片 (gap=0.45) 水平置中
- 公式：`totalW = N * 2.7 + (N-1) * 0.45; startX = (10 - totalW) / 2`

`renderCardGrid(pres, theme, data)`：
- 同樣使用 `N * 2.7 + (N-1) * 0.45` 公式
- 3 卡片 vs 4 卡片的 startX 不同

`renderProcessFlow(pres, theme, data)`：
- 步驟數 3-5，圓形半徑 circR=0.35，圓直徑 circD=0.7
- 簡化公式：`startX = 0.5 + circR`（即 0.85，與原 prompt 一致，兩邊各留 0.5 margin）
- 間距：`gap = (9.0 - N * circD) / (N - 1)`
- 每個圓心 x：`cx = startX + i * (circD + gap)`
- 連接線 y:1.85 也需配合間距

安全性：純 JSON input → `JSON.parse` → PptxGenJS API。不使用 vm sandbox、不執行動態程式碼。使用 `create_subprocess_exec`（非 shell）。

### Step 6: 更新 `pptx_runner_service.py`

**修改檔案：** `backend/app/services/pptx_runner_service.py`

新增 `execute_slides_json(slides_json, output_path, timeout)`：
- 將 JSON 寫入 temp file
- `asyncio.create_subprocess_exec("node", renderer_script, json_file, output_path)`
- 回傳 `(RunResult, stderr)`
- renderer 不會有 syntax error（不執行動態碼），所以只有 SUCCESS 或 RUNTIME_ERROR

同時更新 `pptx_runner.js` 的 `addIcon` import：
- `const { addIcon } = require("./icon_utils");`
- 移除 `pptx_runner.js` 中的 `addIcon` 函式定義和 ICONS 載入（已移至 icon_utils.js）

### Step 7: 更新 `studio_service.py` 的 slides 路徑

**修改檔案：** `backend/app/services/studio_service.py`

slides 處理流程改為：

```
1. LLM streaming → raw text
2. _sanitize_json(raw) — 清理 code fence、trailing comma、unescaped newline
3. SlidesSpec.model_validate_json(sanitized)
4. 若驗證失敗：
   a. 提取 Pydantic ValidationError 訊息
   b. _fix_slides_json(sanitized, error_msg) → LLM 修正一次
   c. _sanitize_json(fixed) → 再次驗證
   d. 若仍失敗 → status="error" + 回傳具體驗證錯誤
5. 驗證通過 → update_studio_artifact(content_json=spec.model_dump_json())
6. asyncio.create_task(_generate_slides_from_json(artifact_id, json_str))
```

`_generate_slides_from_json`：
- 類似現有 `_generate_slides_pptx_bg` 但調用 `execute_slides_json`
- 不需要舊的 `_fix_pptxgenjs_code`
- 仍執行縮圖生成 + Vision QA

### Step 8: 保留舊路徑 + 加入並行控制與指標

- `pptx_runner.js`（改為 import icon_utils）+ `_preprocess_code` + shims **保留**
- `execute_pptxgenjs` 保留
- 待 JSON 路徑穩定後，下一版本再移除

並行控制：
- `_SLIDES_SEMAPHORE = asyncio.Semaphore(2)` 在 `_generate_slides_from_json` 開頭
- `time.monotonic()` 計時 + logging 記錄生成時間

---

## 關鍵檔案清單

| 操作 | 檔案 |
|------|------|
| **新增** | `backend/app/schemas/slides.py` — Pydantic JSON schema |
| **新增** | `backend/app/scripts/icon_utils.js` — 從 pptx_runner.js 抽取的共用 addIcon |
| **新增** | `backend/app/scripts/slides_renderer.js` — 確定性模板引擎（11 個 render 函式） |
| **修改** | `backend/app/services/studio_service.py` — 新 prompt + _sanitize_json + _fix_slides_json + JSON 路徑 + semaphore |
| **修改** | `backend/app/services/pptx_runner_service.py` — 新增 `execute_slides_json` |
| **修改** | `backend/app/scripts/pptx_runner.js` — addIcon 改為 import icon_utils（向後相容） |
| **保留** | 舊路徑所有檔案（暫不刪除） |

---

## 驗證方式

### Unit Tests
- **Schema**：每種 layout 的 Pydantic model validate/reject 測試
- **_sanitize_json**：code fence / trailing comma / unescaped newline 各一個 test case

### Renderer Tests
- 每種 layout 準備一個 fixture JSON，確認 `slides_renderer.js` 能成功產出 PPTX
- **動態佈局重點測試**：
  - `big_number`：分別測 1 個、2 個、3 個 items
  - `card_grid`：分別測 2 個、3 個、4 個 cards
  - `process_flow`：分別測 3 個、4 個、5 個 steps
- `addIcon` 在 `icon_utils.js` 中的 icon 嵌入功能正常

### 端對端
- 用相同文件生成 10 次簡報，統計：
  - JSON 首次驗證通過率（預期 > 90%）
  - 經 LLM 修正後通過率（預期 > 98%）
  - 總生成時間
  - 視覺品質（模板引擎座標精確度 > LLM 自由生成）
