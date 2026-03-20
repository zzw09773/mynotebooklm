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

### v0.1.1 - PPTX 優化和架構改進 ⭐ 最新版本
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
