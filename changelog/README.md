# NotebookLM 變更日誌 (Changelog)

此資料夾存放所有 NotebookLM 項目的版本變更記錄和差異檔。

## 📂 檔案結構

```
changelog/
├── README.md                                    # 本檔案
├── SUMMARY.txt                                  # 快速摘要
├── CHANGELOG_v0.1.1_pptx-optimization.md       # v0.1.1 PPTX 優化
├── pptx-optimization-v0.1.1.diff              # v0.1.1 Diff 檔
├── CHANGELOG_v0.1.0_*.md                       # v0.1.0 UI 增強
├── studio-feature-v0.1.0.diff                 # v0.1.0 Diff 檔
├── CHANGELOG_v0.0.3_optimization.md           # v0.0.3 優化
├── optimization-and-refactor-v0.0.3.diff     # v0.0.3 Diff 檔
├── CHANGELOG_v0.0.2_bugfix-refactor.md        # v0.0.2 Bug 修正
├── bugfix-and-refactor-v0.0.2.diff            # v0.0.2 Diff 檔
├── CHANGELOG_v0.0.1_studio.md                 # v0.0.1 Studio
├── studio-feature-v0.0.1.diff                 # v0.0.1 Diff 檔
├── CHANGES_v0.0.0_auth-and-security.md        # v0.0.0 認證
├── quick-access.sh                             # 快速查詢工具
└── ...
```

## 📝 版本記錄

### v1.1.1 - 參數微調與自修復提示強化 ⭐ 最新版本
**日期：** 2026-03-31  
**分支：** `main`  
**Commits：** `88dce08`, `3d84e33`

**主要改動：**
- 🔧 RAG chunk_size 512→480（nv-embed-v2 留 buffer）
- 📏 所有 slide title max_length 15→20 字
- 🛠️ 自修復 prompt 加入完整欄位字元上限表
- 🗑️ 清理 5 個重複 PDF 上傳檔

**統計：**
- 3 個程式碼檔案變更
- +30 行新增 / -19 行刪除

**檔案：**
- 📄 詳細說明：`CHANGELOG_v1.1.1_tuning-and-repair.md`
- 🔀 Diff：`tuning-and-repair-v1.1.1.diff`

---

### v1.1.0 - ComfyUI Flux 插圖 + 幻燈片管線全面重構
**日期：** 2026-03-30 ~ 2026-03-31  
**分支：** `v1.1.0`  
**Commits：** `2ebde13`, `f6c7e3f`

**主要改動：**
- 🎨 ComfyUI Flux.1-dev 文生圖整合（幻燈片自動插圖）
- 📋 Pydantic schema 強化（SlideBase、model_validator）
- � 結構化 Vision QA（IssueType 枚舉、並行處理、自動修復）
- �️ 刪除舊 pptx_runner.js，統一確定性渲染
- 📊 新增 slide_count 字段，消除前端縮圖探測

**統計：**
- 18 個檔案變更
- 1,182 行新增 / 647 行刪除

**檔案：**
- 📄 詳細說明：`CHANGELOG_v1.1.0_comfyui-illustration.md`
- 🔀 Diff (ComfyUI)：`comfyui-illustration-v1.1.0.diff`
- 🔀 Diff (管線重構)：`slide-pipeline-overhaul-v1.1.0.diff`

---

### v0.2.0 - Pydantic 模型和幻燈片渲染邏輯
**日期：** 2026-03-26  
**分支：** `v0.2.0`  
**Commit：** `7226b44`

**主要改動：**
- 📋 Pydantic 資料模型（11 種幻燈片類型）
- 🎨 獨立的幻燈片渲染引擎（slides_renderer.js）
- 🔧 圖標工具函數和主題管理
- 🛡️ 強類型驗證和自動 JSON Schema
- 📈 架構升級和可維護性提升

**統計：**
- 8 個檔案新增或修改
- 1,209 行新增 / 100 行刪除
- 淨變化：+1,109 行（架構升級）

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.2.0_pydantic-slides.md`
- 🔀 完整 diff：`pydantic-slides-v0.2.0.diff`

---

### v0.1.4 - 幻燈片提示優化和視覺 QA 改進
**日期：** 2026-03-24  
**分支：** `v0.1.4`  
**Commit：** `e56c63b`

**主要改動：**
- 🎯 幻燈片生成提示重構
- 🔍 視覺 QA 檢查改進（單幻燈片模式）
- 📊 避免 CUDA OOM 錯誤
- ✨ 前端 Studio 面板重構
- ⚡ PPTX 運行器增強

**統計：**
- 9 個檔案修改
- 513 行新增 / 206 行刪除
- 淨變化：+307 行

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.1.4_slide-refactor.md`
- 🔀 完整 diff：`slide-prompt-refactor-v0.1.4.diff`

---

### v0.1.3 - 孤立生成物清理功能
**日期：** 2026-03-23  
**分支：** `v0.1.3`  
**Commit：** `475d14f`

**主要改動：**
- 🗑️ 孤立生成物自動清理機制
- 📷 縮略圖清理功能
- 🔧 LLM 客戶端優化
- 📊 Artifact 生命週期管理
- ⚙️ Studio 服務增強

**統計：**
- 4 個檔案修改
- 168 行新增 / 39 行刪除
- 淨變化：+129 行

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.1.3_cleanup-orphaned.md`
- 🔀 完整 diff：`cleanup-orphaned-v0.1.3.diff`

---

### v0.1.2 - VLM 集成和圖像理解
**日期：** 2026-03-20  
**分支：** `v0.1.0`  
**Commit：** `5a43764`

**主要改動：**
- 🤖 VLM（視覺語言模型）服務集成
- 🖼️ 高級圖像理解功能
- 📄 文檔處理管道增強
- 🖨️ PPTX 運行器優化
- ⚙️ 設置模態框更新

**統計：**
- 12 個檔案修改
- 2,942 行新增 / 263 行刪除
- 淨變化：+2,679 行

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.1.2_vlm-integration.md`
- 🔀 完整 diff：`vlm-integration-v0.1.2.diff`

---

### v0.1.1 - PPTX 優化和架構改進
**日期：** 2026-03-20  
**分支：** `v0.1.0`  
**Commit：** `56ae671`

**主要改動：**
- 🔧 Node.js PPTX 運行時服務（沙盒隔離）
- 📷 圖像質量分析服務（vision_qa）
- 🎨 圖標提取腳本（extract_icons）
- ⚙️ 架構重構和代碼精簡（-429 行）
- 🔐 增強的安全性和隔離

**統計：**
- 13 個檔案修改
- 672 行新增 / 1,101 行刪除
- 淨變化：-429 行（代碼精簡）

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.1.1_pptx-optimization.md`
- 🔀 完整 diff：`pptx-optimization-v0.1.1.diff`

---

### v0.1.0 - UI 增強和 PPTX 支持
**日期：** 2026-03-19  
**分支：** `v0.1.0`  
**Commit：** `a9d0f81`

**主要改動：**
- 🎨 完整的 UI 重構和增強
- 📊 PPTX 生成和縮圖支持
- ⚡ 工作流程優化
- 📚 完整的 README 文檔

**統計：**
- 87 個檔案修改
- 15,000+ 行新增

---

### v0.0.3 - 優化和重構
**日期：** 2026-03-16  
**分支：** `工作室功能v0.0.1`  
**Commit：** `f9756a5`

**主要改動：**
- ⚡ 輪詢邏輯性能優化（-20~30%）
- 🛡️ 增強的錯誤處理
- 🗑️ 級聯刪除改進
- ⌨️ 鍵盤快捷鍵支援

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.0.3_optimization.md`
- 🔀 完整 diff：`optimization-and-refactor-v0.0.3.diff`

---

### v0.0.2 - Bug 修正 & 重構
**日期：** 2026-03-16  
**分支：** `工作室功能v0.0.1`  
**Commit：** `6b71f45`

**主要改動：**
- 🔧 Chat 函式性能優化
- 🎨 心智圖完全重構（樹形佈局）
- 🔄 Studio 與 Chat 集成
- 📚 建立 Changelog 管理系統

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.0.2_bugfix-refactor.md`
- 🔀 完整 diff：`bugfix-and-refactor-v0.0.2.diff`

---

### v0.0.1 - Studio 工作室功能
**日期：** 2026-03-14  
**分支：** `工作室功能v0.0.1`  
**Commit：** `91ea558`

**主要改動：**
- ✨ 實現 Studio 面板和多種 artifact 查看器
- 🎨 支援 9 種不同的學習物件類型
- 🔄 實時狀態輪詢機制
- 📊 完整的後端 API 和業務邏輯

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.0.1_studio.md`
- 🔀 完整 diff：`studio-feature-v0.0.1.diff`

---

### v0.0.0 - 認證與安全性
**日期：** 2026-03-14  
**分支：** `main`  
**Commit：** `534ef5b`

**主要改動：**
- 🔐 新增使用者認證系統
- 🛡️ 修復 CORS 設定和 IDOR 漏洞
- 📤 檔案上傳大小限制
- 🧪 完整的單元測試

**檔案：**
- 📄 詳細說明：`CHANGES_v0.0.0_auth-and-security.md`

---

## 🔍 如何閱讀 Changelog

### Markdown 檔案 (.md)
包含詳細的說明和改動內容，適合快速了解改動概要：
```bash
cat changelog/CHANGELOG_v0.1.1_pptx-optimization.md
```

### Diff 檔案 (.diff)
包含完整的代碼差異，適合進行詳細的代碼審查：
```bash
# 查看 diff 檔
less changelog/pptx-optimization-v0.1.1.diff

# 查看統計摘要
diffstat changelog/pptx-optimization-v0.1.1.diff

# 應用 diff 到其他分支
git apply changelog/pptx-optimization-v0.1.1.diff

# 查看特定檔案的改動
grep -A 20 "pptx_runner_service.py" changelog/pptx-optimization-v0.1.1.diff
```

---

## 📊 版本對比

| 版本 | 日期 | 主要功能 | 檔案變更 | 新增行數 |
|------|------|---------|---------|---------|
| **v0.1.1** | 2026-03-20 | PPTX 優化 | 13 | 672 |
| v0.1.0 | 2026-03-19 | UI 增強 | 87 | 15,000+ |
| v0.0.3 | 2026-03-16 | 優化 & 重構 | 10 | 3,540 |
| v0.0.2 | 2026-03-16 | Bug 修正 | 10 | 2,843 |
| v0.0.1 | 2026-03-14 | Studio 工作室 | 17 | 1,665 |
| v0.0.0 | 2026-03-14 | 認證 & 安全 | 30 | 2,346 |

---

## 🚀 使用場景

### 場景 1：我想快速了解最新版本的改動
```bash
cat changelog/SUMMARY.txt
# 或
head -100 changelog/CHANGELOG_v0.1.1_pptx-optimization.md
```

### 場景 2：我要進行代碼審查
```bash
# 在編輯器中打開 diff
code changelog/pptx-optimization-v0.1.1.diff

# 或使用 less 分頁檢視
less changelog/pptx-optimization-v0.1.1.diff

# 查看統計
diffstat changelog/pptx-optimization-v0.1.1.diff
```

### 場景 3：我要應用某個版本的改動
```bash
git apply changelog/pptx-optimization-v0.1.1.diff
```

### 場景 4：我要追蹤特定功能的發展
```bash
# 查找 PPTX 相關的所有版本
grep -l "PPTX\|pptx" changelog/CHANGELOG_*.md

# 查看心智圖在各版本的改動
grep -A 5 -B 2 "MindMap\|心智圖" changelog/CHANGELOG_*.md
```

---

## 📈 性能改進統計

### v0.1.1
- Node.js 沙盒運行時
- 圖像質量分析
- 代碼精簡 (-429 行)

### v0.1.0
- 完整 UI 重構
- PPTX 生成支持

### v0.0.3
- React 重新渲染：-20~30%
- 輪詢效率：+40~50%

---

## 💡 最佳實踐

✅ **務必做：**
- 每個版本發佈時建立新的 changelog
- 保留完整的 diff 檔以供審查
- 使用清晰的版本命名 (v[major].[minor].[patch])
- 在 markdown 中包含統計數據

❌ **不應該做：**
- 刪除舊的 changelog 記錄
- 修改已發佈版本的 changelog
- 只保留 diff 不保留 markdown 說明
- 使用不一致的命名約定

---

## 🎯 相關資源

| 資源 | 位置 |
|------|------|
| 快速摘要 | `SUMMARY.txt` |
| 快速查詢 | `quick-access.sh` |
| 項目根目錄 | `../` |
| 主要分支 | `origin/main` |
| 開發分支 | `origin/v0.1.0` |

---

## 📅 更新歷史

- **2026-03-20** - 新增 v0.1.1 (PPTX 優化)
- **2026-03-19** - 新增 v0.1.0 (UI 增強)
- **2026-03-16** - 新增 v0.0.3 (優化)
- **2026-03-14** - 初始建立 changelog 資料夾

---

**提示：** 使用 `./quick-access.sh` 獲取快速查詢指令。

*Last Updated: 2026-03-20*
