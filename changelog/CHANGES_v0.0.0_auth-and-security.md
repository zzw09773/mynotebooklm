# NotebookLM 變更記錄

## 本次重構摘要

本次對程式碼進行全面審查與重構，涵蓋安全性修補、架構拆分、功能新增與測試補齊。

---

## 安全性修補

### C2 — 修正 CORS 設定與 credentials 衝突
**問題：** `allow_origins=["*"]` 搭配 `allow_credentials=True` 違反 CORS 規範，瀏覽器會拒絕請求。
**修正：** 改由環境變數 `CORS_ORIGINS` 控制允許的來源清單（逗號分隔），預設值為 `http://localhost:3000,http://localhost:3100`。

**相關檔案：**
- `backend/app/config.py` — 新增 `cors_origins` 設定欄位
- `backend/app/main.py` — CORS middleware 改從設定讀取來源清單

### C3 — 移除寫死的 LLM API 位址
**問題：** `llm_api_base_url` 預設值寫死為 `https://172.16.120.35/v1`，不應出現在版本控制中。
**修正：** 預設值改為空字串，由使用者透過前端設定介面或環境變數 `LLM_API_BASE_URL` 填入。

**相關檔案：**
- `backend/app/config.py`

### C4 — 修正 IDOR（物件層級授權）漏洞
**問題：** 所有 API 端點缺少擁有者驗證，任何登入用戶均可存取他人的專案、對話與文件。
**修正：** 每個端點加入 `_check_project_ownership()` / `_check_conversation_ownership()` 函式，驗證資源的 `user_id` 是否與當前登入用戶一致，不符者回傳 403。

**相關檔案：**
- `backend/app/routers/projects.py`
- `backend/app/routers/conversations.py`
- `backend/app/routers/documents.py`

### C5 — 檔案上傳大小限制
**問題：** 上傳端點未設大小上限，可能導致伺服器資源耗盡。
**修正：** 加入 50 MB 上限（可透過環境變數 `MAX_UPLOAD_SIZE_MB` 調整），超過時回傳 HTTP 413。

**相關檔案：**
- `backend/app/config.py` — 新增 `max_upload_size_mb` 欄位
- `backend/app/routers/documents.py` — 上傳前檢查 `len(content) > max_size`

---

## 後端 Bug 修正

### H3 — 取代裸露的 `except Exception: pass`
**問題：** `chat_service.py` 中多處以空的 `except` 靜默吞掉錯誤，導致問題難以追蹤。
**修正：** 全部改為 `logging.exception(...)` 記錄完整的錯誤堆疊。

**相關檔案：**
- `backend/app/services/chat_service.py`

### H4 — 修正 `generate_study_guide` 未被 await 的問題
**問題：** `_process_document_background` 定義為同步函式，但呼叫了一個 async 函式而未加 `await`，導致實際上從未執行。
**修正：** 將 `_process_document_background` 改為 `async def`，並正確 `await generate_study_guide(...)`。FastAPI 的 `BackgroundTasks` 原生支援 async 函式。

**相關檔案：**
- `backend/app/routers/documents.py`

### H7 — 將動態 import 移至模組頂層
**問題：** `chat_service.py` 在函式內部使用 `import json as _json`，每次呼叫都觸發 import 機制。
**修正：** 改為標準的頂層 `import json`。

**相關檔案：**
- `backend/app/services/chat_service.py`

---

## 新增功能：使用者認證系統

### 資料模型

新增 `User` 資料表：

```
id          整數，主鍵
username    字串，唯一索引
password_hash 字串（bcrypt 雜湊）
created_at  ISO 8601 時間字串
```

`Project` 資料表新增 `user_id` 欄位，舊資料以 `DEFAULT 0` 保留相容性。

**相關檔案：**
- `backend/app/models.py`

### 認證服務

**相關檔案：**
- `backend/app/services/auth_service.py`（新增）
  - `hash_password()` / `verify_password()` — 使用 passlib bcrypt
  - `create_access_token()` / `decode_access_token()` — 使用 PyJWT，HS256 演算法，預設 24 小時有效期
- `backend/app/dependencies.py`（新增）
  - `get_current_user()` — FastAPI `Depends()` 依賴函式，解析 Bearer Token，無效時回傳 401

### API 端點

**相關檔案：**
- `backend/app/routers/auth.py`（新增）

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/auth/register` | 註冊，回傳 JWT token |
| POST | `/api/auth/login` | 登入，回傳 JWT token |
| GET | `/api/auth/me` | 取得當前用戶資訊 |

驗證規則：`username` 最少 3 字元，`password` 最少 8 字元（Pydantic `min_length` 驗證）。

### 環境變數

```
JWT_SECRET_KEY     JWT 簽名金鑰（生產環境必填，建議 32 字元以上隨機字串）
JWT_EXPIRY_HOURS   Token 有效時間（預設 24）
```

---

## 前端重構

### H2 / H5 — 拆分 1,200 行的 page.tsx
**問題：** `page.tsx` 超過 1,200 行，包含所有 UI 邏輯、狀態管理與 API 呼叫。
**修正：** 拆分為多個獨立元件，各自不超過 200 行。

新增檔案：

| 檔案 | 職責 |
|------|------|
| `frontend/src/components/Sidebar.tsx` | 左側邊欄（文件上傳、專案切換） |
| `frontend/src/components/ChatArea.tsx` | 聊天訊息區、輸入列、引用面板 |
| `frontend/src/components/SettingsModal.tsx` | 設定 Modal（含無障礙支援） |
| `frontend/src/components/ProjectDashboard.tsx` | 專案選擇頁面、登出按鈕 |
| `frontend/src/app/login/page.tsx` | 登入 / 註冊頁面 |
| `frontend/src/lib/auth.ts` | localStorage Token 管理工具函式 |
| `frontend/src/lib/api.ts` | 所有 API 呼叫函式 + TypeScript 介面定義 |
| `frontend/src/hooks/useDocumentPolling.ts` | 文件處理狀態輪詢 Hook |

### H1 — 修正輪詢計時器洩漏
**問題：** 輪詢 `setTimeout` 在元件卸載後繼續執行，且沒有最大重試次數上限。
**修正：** 使用 `useRef<Map>` 追蹤所有計時器，元件卸載時統一清除；加入最大 60 次重試限制。

**相關檔案：**
- `frontend/src/hooks/useDocumentPolling.ts`

### M5 — Modal 無障礙（a11y）支援
**修正：** `SettingsModal` 與 `CitationPanel` 加入：
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- Tab 鍵焦點鎖定（Focus Trap）
- Escape 鍵關閉
- 開啟時自動聚焦第一個可互動元素

### M1 — 修正 React key 不穩定
**問題：** 訊息列表以陣列索引 `key={i}` 作為 key，導致重新渲染時 DOM 比對錯誤。
**修正：** 改用 `key={msg.id ?? \`msg-${i}\``}，優先使用資料庫 ID。

### 新增 PATCH 代理路由
`frontend/src/app/api/[...path]/route.ts` 新增 `PATCH` method 處理器，補齊對後端 PATCH 端點的代理支援。

---

## 測試

新增後端 pytest 測試套件（共 39 個測試，全數通過）：

| 檔案 | 測試數 | 涵蓋範圍 |
|------|--------|----------|
| `backend/tests/conftest.py` | — | 共用 fixtures（in-memory SQLite、mock LLM/ChromaDB） |
| `backend/tests/test_auth.py` | 10 | 註冊驗證、登入、/me 端點 |
| `backend/tests/test_crud.py` | 12 | 專案與對話的完整 CRUD 生命週期 |
| `backend/tests/test_ownership.py` | 7 | IDOR 防護：跨用戶存取必須被拒絕 |
| `backend/tests/test_document_service.py` | 10 | 集合名稱清理邏輯、上傳大小與格式驗證 |

測試基礎設施：
- `backend/pytest.ini` — `asyncio_mode = auto`
- 使用 `StaticPool` 確保 SQLite in-memory 連線共享同一個資料庫實例
- 以 `unittest.mock.patch` 隔離 LLM、ChromaDB 等外部依賴

---

## 依賴套件變更

`backend/requirements.txt` 新增：

```
PyJWT>=2.8.0
passlib[bcrypt]>=1.7.4
bcrypt>=3.1.0,<4.0.0   # passlib 與 bcrypt 4.x 不相容
pytest>=8.0.0
pytest-asyncio>=0.23.0
```

> **注意：** `bcrypt` 必須固定在 `<4.0.0`。bcrypt 4.x 移除了 `__about__` 屬性，導致 passlib 的後端偵測機制崩潰。
