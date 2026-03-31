# NotebookLM v1.1.0 — ComfyUI 插圖 + 幻燈片管線全面重構

**版本：** v1.1.0  
**日期：** 2026-03-30 ~ 2026-03-31  
**Commits：** `2ebde13`, `f6c7e3f`  
**分支：** `v1.1.0`

---

## 📋 概述

v1.1.0 包含兩大改動：

1. **ComfyUI Flux 整合**（`2ebde13`）— 幻燈片自動生成 AI 插圖
2. **幻燈片管線全面重構**（`f6c7e3f`）— 結構化 QA、確定性渲染、自動修復

**合計統計：**
- **18 個檔案** 變更（含 1 個刪除）
- **1,182 行** 新增
- **647 行** 刪除

---

## Part 1：ComfyUI Flux 插圖整合 (`2ebde13`)

**改動：** 7 個檔案，+504 行

### 新增檔案

#### 📌 `backend/app/services/comfyui_service.py` (247 行)
- ComfyUI Flux.1-dev 非同步客戶端
- 使用 `flux1-dev-fp8.safetensors` 模型
- 支援 1024×768（4:3 投影片比例）
- 完整的輪詢和下載機制

### 修改檔案

| 檔案 | 改動 | 說明 |
|------|------|------|
| `config.py` | +3 | 新增 `comfyui_api_url` 設定 |
| `main.py` | +3 | 建立 `/data/comfyui_images` 目錄 |
| `settings.py` | +8 | ComfyUI URL 的讀寫和持久化 |
| `studio_service.py` | +227 | 插圖生成邏輯和 LLM 提示詞 |
| `SettingsModal.tsx` | +14 | ComfyUI URL 設定欄位 |
| `docker-compose.yml` | +2 | `host.docker.internal` 映射 |

### 插圖支援的版面
- ✅ `cover` — 右半部面板
- ✅ `section_divider` — 全頁背景圖
- ✅ `content_with_icon` — 右側三分之一
- ❌ 其他版面（會遮住內容）

### 設計原則
- **非強制**：ComfyUI 不可用時不影響幻燈片生成
- **每份簡報最多 5 張**插圖
- **LLM 生成英文提示詞**（Flux 不支援中文）

---

## Part 2：幻燈片管線全面重構 (`f6c7e3f`)

**改動：** 11 個檔案，+678/-647 行

### 刪除檔案

#### ❌ `backend/app/scripts/pptx_runner.js` (174 行)
- 舊的 LLM 生成代碼 + vm 沙盒執行模式
- 已被確定性的 `slides_renderer.js` 完全取代

### Pydantic Schema 強化

**檔案：** `backend/app/schemas/slides.py` (+88/-24 行)

| 改進 | 說明 |
|------|------|
| `SlideBase` 基類 | 所有幻燈片統一繼承，支援 `speaker_notes` |
| `max_length` 約束 | subtitle、description、quote 等字段加上長度限制 |
| `TableSlide` 驗證器 | `rows_match_header_count` — 行列數必須匹配 |
| `ChartSlide` 驗證器 | `labels_values_same_length` — 標籤和數值數量一致 |
| `SlidesSpec` 驗證器 | `cover_first_conclusion_last` — 首頁封面、末頁結論 |
| `ProcessFlowSlide` | `min_length` 從 2 改為 3（至少三步驟） |

### 結構化 Vision QA

**檔案：** `backend/app/services/vision_qa.py` (+155/-94 行)

```python
class IssueType(str, Enum):
    LOW_CONTRAST    = "low_contrast"
    TEXT_OVERFLOW    = "text_overflow"
    EXCESSIVE_BLANK = "excessive_blank"
    OVERLAP         = "overlap"
    UNKNOWN         = "unknown"
```

| 改進 | v1.0 | v1.1 |
|------|------|------|
| 處理模式 | 逐張序列 | 並行（Semaphore=4） |
| 問題分類 | 純文字 | 結構化 IssueType 枚舉 |
| 輸出格式 | `{"issues": ["desc"]}` | `{"issues": [{"type": "...", "description": "..."}]}` |
| 自動修復 | ❌ | ✅ 依 IssueType 觸發 |

### 確定性 PPTX 渲染

**檔案：** `backend/app/services/pptx_runner_service.py` (+170/-170 行)

```
舊流程：LLM 生成 JS 代碼 → vm 沙盒執行 → 不穩定
新流程：JSON → slides_renderer.js → 確定性輸出 ✅
```

- 刪除 `SYNTAX_ERROR` / `RUNTIME_ERROR` / `TIMEOUT` 等舊錯誤碼
- 統一使用 `slides_renderer.js` 渲染

### slide_count 追蹤

**檔案：** `backend/app/models.py` (+6 行) / `backend/app/routers/studio.py` (+4 行)

```python
# 新增字段
slide_count: int = 0  # 幻燈片縮圖數量

# API 回應包含 slide_count
class ArtifactResponse:
    progress_message: str
    slide_count: int
```

### 前端優化

**檔案：** `SlidesViewer.tsx` (+48/-26 行) / `StudioPanel.tsx` (+2/-2 行)

- 使用 API 的 `slide_count` 直接顯示，不再逐張探測縮圖
- 保留 fallback 探測機制（相容舊 artifact）

---

## 🏗️ 完整管線架構

```
用戶點擊「生成簡報」
   ↓
LLM 生成 JSON（符合 Pydantic schema）
   ↓
Pydantic 驗證
   ├─ 類型檢查 ✓
   ├─ 長度限制 ✓
   ├─ 表格行列匹配 ✓
   ├─ 圖表標籤數值匹配 ✓
   └─ 封面+結論結構 ✓
   ↓
slides_renderer.js（確定性渲染）
   ↓
Vision QA（並行檢查）
   ├─ 結構化問題分類
   └─ 自動修復 → 重新生成 → 再驗證
   ↓
(可選) ComfyUI 插圖
   ↓
生成縮圖 + 記錄 slide_count
   ↓
完成 ✅
```

---

## 📚 相關連結

- **Diff (ComfyUI)：** `changelog/comfyui-illustration-v1.1.0.diff`
- **Diff (管線重構)：** `changelog/slide-pipeline-overhaul-v1.1.0.diff`
- **前一版本：** `changelog/CHANGELOG_v0.2.0_pydantic-slides.md`

---

*Generated: 2026-03-31*
