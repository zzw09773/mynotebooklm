# NotebookLM 變更日誌 (Changelog)

此資料夾存放所有 NotebookLM 項目的版本變更記錄和差異檔。

## 📂 檔案結構

```
changelog/
├── README.md ## 📊 版本對比

| 版本 | 日期 | 主要功能 | 檔案變更 | 新增行數 |
|------|------|---------|---------|---------|
| **v0.1.0** | 2026-03-19 | PPTX & 縮圖 | 487 | 442,162 |
| v0.0.3 | 2026-03-16 | 優化 & 重構 | 10 | 3,540 |
| v0.0.2 | 2026-03-16 | Bug 修正 | 10 | 2,843 |
| v0.0.1 | 2026-03-14 | Studio 工作室 | 17 | 1,665 |
| v0.0.0 | 2026-03-14 | 認證 & 安全 | 30 | 2,346 |                       # 本檔案
├── CHANGES_v0.0.0_auth-and-security.md  # 認證與安全性更新
├── CHANGELOG_v0.0.1_studio.md            # Studio 工作室功能
├── studio-feature-v0.0.1.diff            # Studio 功能的詳細 diff
└── ...
```

## 📝 版本記錄

### v0.1.0 - PowerPoint & 縮圖生成 ⭐ 最新版本 (重大升級)
**日期：** 2026-03-19  
**分支：** `v0.1.0`  
**Commit：** `a9d0f81`

**主要改動：**
- 🎨 完整的 PowerPoint (PPTX) 生成引擎
- 📸 縮圖生成服務（含緩存）
- 🎯 12 種投影片版面格式
- 🌈 10 種預設設計主題
- 📊 增強的 Slides 查看器 (+613 行)
- 📚 10+ 完整示例和資源
- 🛠️ 完整的 Office 工具集
- 📦 70+ 字體和 React Icons 庫

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.1.0_pptx-generation.md`
- 🔀 完整 diff：`pptx-and-thumbnail-v0.1.0.diff` (87 MB)

---

### v0.0.3 - 優化和重構
**日期：** 2026-03-16  
**分支：** `工作室功能v0.0.1`  
**Commit：** `f9756a5`

**主要改動：**
- ⚡ 輪詢邏輯性能優化（預期減少 20-30% 重新渲染）
- 🛡️ 增強的錯誤處理（完整的 logging 和使用者友善訊息）
- 🗑️ 級聯刪除改進（數據完整性保障）
- ⌨️ 鍵盤快捷鍵支援（Escape 鍵退出全螢幕）

**檔案：**
- 📄 詳細說明：`CHANGELOG_v0.0.3_optimization.md`
- 🔀 完整 diff：`optimization-and-refactor-v0.0.3.diff`

---

### v0.0.2 - Bug Fix & Refactor
**日期：** 2026-03-16  
**分支：** `工作室功能v0.0.1`  
**Commit：** `6b71f45`

**主要改動：**
- 🔧 Chat 函式性能優化（依賴項重構）
- 🎨 心智圖完全重構（圓形 → 樹形佈局）
- 🔄 增加展開/收合和互動詢問功能
- 📚 建立 Changelog 管理系統
- 🖥️ 新增全螢幕預覽模式

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
- 🎨 支援 9 種不同的學習物件類型（播客、投影片、影片腳本等）
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
cat CHANGELOG_v0.0.1_studio.md
```

### Diff 檔案 (.diff)
包含完整的代碼差異，適合進行詳細的代碼審查：
```bash
# 查看 diff 檔
cat studio-feature-v0.0.1.diff

# 應用 diff 到其他分支
git apply studio-feature-v0.0.1.diff

# 查看 diff 的統計
diffstat studio-feature-v0.0.1.diff
```

---

## 📊 版本對比

| 版本 | 日期 | 主要功能 | 檔案變更 | 新增行數 |
|------|------|---------|---------|---------|
| v0.0.1 | 2026-03-14 | Studio 工作室 | 17 | 1,665 |
| v0.0.0 | 2026-03-14 | 認證與安全 | 30 | 2,346 |

---

## 📋 新增 Changelog 的步驟

當有新的功能更新時，請按以下步驟操作：

### 1. 建立新的 Markdown 文檔
```bash
touch changelog/CHANGELOG_v{version}_feature-name.md
```

### 2. 生成 Diff 檔
```bash
# 如果在分支上
git diff main..current-branch > changelog/feature-v{version}.diff

# 或者對比特定 commit
git diff commit1..commit2 > changelog/feature-v{version}.diff
```

### 3. 填寫 Changelog 模板

使用以下模板填寫新的 Markdown 檔案：

```markdown
# NotebookLM [功能名稱] v[版本]

**版本：** v[版本]  
**日期：** [日期]  
**分支：** `[分支名]`

---

## 📋 概述

[簡潔的功能描述]

**改動統計：**
- **X 個檔案** 被修改或新建
- **X 行** 新增
- **X 行** 刪除

---

## ✨ 新功能

### 功能 1
[詳細說明]

---

## 📁 改動檔案清單

### 後端檔案
- ...

### 前端檔案
- ...

---

## 🧪 測試建議

- [ ] 測試項目 1
- [ ] 測試項目 2

---

## 📝 相關連結

- **Diff 檔案：** `changelog/feature-v[版本].diff`
- **分支：** `[分支名]`
- **Commit：** `[commit-hash]`
```

### 4. 更新此 README

在本文檔中新增版本記錄。

---

## 🎯 最佳實踐

1. **命名約定**
   - Changelog：`CHANGELOG_v[version]_[feature-name].md`
   - Diff 檔：`[feature-name]-v[version].diff`

2. **內容組織**
   - 使用清晰的標題層次
   - 包含統計數據
   - 列出所有變更的檔案
   - 提供測試建議

3. **定期維護**
   - 每個版本發佈時建立新的 changelog
   - 保留完整的歷史記錄
   - 保持 README 的更新

---

## 📞 相關資源

- 項目根目錄：`/home/aia/c1147259/project/notebooklm/`
- 現有 CHANGES.md：已移至 `CHANGES_v0.0.0_auth-and-security.md`

---

*Last Updated: 2026-03-14*
