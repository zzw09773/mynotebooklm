# 📝 CHANGELOG v1.1.1 — 參數微調與自修復提示強化

**版本：** v1.1.1  
**日期：** 2026-03-31  
**分支：** `main`  
**Commits：** `88dce08`, `3d84e33`  
**類型：** Patch（參數調校 + Bug Fix）

---

## 🎯 變更摘要

此版本為 v1.1.0 的微調修補，包含兩個改動：

1. **RAG 參數與 Schema 字數放寬** — chunk size 從 512→480（留 buffer 給 nv-embed-v2 的 512 上限），title 欄位從 15→20 字以減少 LLM 產出截斷。
2. **自修復提示強化** — 在 `_fix_slides_json` 的修復 prompt 中加入完整的欄位字元上限表，讓 LLM 一次性修正所有超長欄位，而非只修錯誤訊息提到的那個。

---

## 📋 Commit 1：參數微調 (`88dce08`)

> refactor: update chunk size and overlap settings; increase title length limits for slides

### 改動檔案

| 檔案 | 改動 |
|------|------|
| `backend/app/config.py` | chunk_size: 512→480, chunk_overlap: 64→48 |
| `backend/app/schemas/slides.py` | 所有 title 欄位 max_length: 15→20, table headers: 15→20 |
| `backend/app/services/studio_service.py` | 生成 prompt 中的字數表同步更新 |
| `data/uploads/` | 清理 5 個重複的 PDF 上傳檔 |

### 詳細說明

#### config.py — RAG 分塊參數
```python
# Before
chunk_size: int = 512
chunk_overlap: int = 64

# After
chunk_size: int = 480   # nv-embed-v2 max is 512; leave buffer for sentence boundary
chunk_overlap: int = 48
```
- **原因：** nv-embed-v2 的 token 上限為 512，原本直接用 512 可能在句子邊界處超標，降到 480 留出安全空間。

#### slides.py — 標題字數放寬
- 所有 layout 的 `title` 欄位：`max_length=15` → `max_length=20`
- `TableSlide.headers`：`max_length=15` → `max_length=20`
- **影響範圍：** CoverSlide, SectionDividerSlide, BigNumberSlide, CardGridSlide, DualColumnSlide, ProcessFlowSlide, ContentWithIconSlide, TableSlide, ChartSlide, ConclusionSlide（共 13 處）
- **原因：** 15 字中文標題太短，LLM 常產出 16-20 字導致驗證失敗，放寬後減少自修復循環次數。

---

## 📋 Commit 2：自修復提示強化 (`3d84e33`)

> fix: add field length limits to slide self-repair prompt for better LLM compliance

### 改動檔案

| 檔案 | 改動 |
|------|------|
| `backend/app/services/studio_service.py` | `_fix_slides_json` 加入欄位字元上限清單 |

### 詳細說明

在 `_fix_slides_json()` 的修復 prompt 中新增完整的字元上限表：

```python
"欄位字元上限（請一次檢查所有欄位，不只修錯誤訊息中提到的那一個）：\n"
"- 所有版面 title：20字\n"
"- cover subtitle：30字\n"
"- section_divider description：40字\n"
"- process_flow step description：40字\n"
"- content_with_icon block description：40字\n"
"- big_number value：10字，unit/label：10/15字\n"
"- quote_slide quote：60字\n"
"- table header cell：20字，data cell：20字\n"
"- conclusion point text：25字\n"
"- dual_column points 每條：25字\n"
```

- **原因：** 原本的修復提示只傳遞 Pydantic 的錯誤訊息，LLM 會只修被提到的欄位，其他超長的欄位繼續存在，導致多次修復循環。加入完整的字元上限表後，LLM 可以一次性修正所有超長欄位。

---

## 📊 統計

| 指標 | 數值 |
|------|------|
| 變更檔案 | 3 個程式碼 + 5 個清理 |
| 新增行數 | +30 |
| 刪除行數 | -19 |
| 淨變化 | +11 |

---

## 🔗 相關連結

- **Diff：** `changelog/tuning-and-repair-v1.1.1.diff`
- **上一版本：** `changelog/CHANGELOG_v1.1.0_comfyui-illustration.md`
