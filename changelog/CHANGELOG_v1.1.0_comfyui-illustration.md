# NotebookLM ComfyUI Flux 幻燈片插圖自動生成 v1.1.0

**版本：** v1.1.0  
**日期：** 2026-03-30  
**Commit：** `2ebde13`  
**分支：** `v1.1.0`

---

## 📋 概述

本次更新整合了 **ComfyUI Flux.1-dev** 文生圖模型，為幻燈片自動生成 AI 插圖。系統會根據每張幻燈片的標題和內容，先用 LLM 生成英文圖像提示詞，再透過 ComfyUI 生成視覺插圖並嵌入對應的幻燈片版面。此功能為**非強制性**——ComfyUI 未設定或不可用時，幻燈片生成流程照常進行。

**改動統計：**
- **7 個檔案** 新增或修改
- **504 行** 新增
- **0 行** 刪除

**核心改動檔案：**
- `backend/app/services/comfyui_service.py` - 📌 新增 (247 行)
- `backend/app/services/studio_service.py` - +227 行
- `backend/app/config.py` - +3 行
- `backend/app/routers/settings.py` - +8 行
- `frontend/src/components/SettingsModal.tsx` - +14 行
- `backend/app/main.py` - +3 行
- `docker-compose.yml` - +2 行

---

## ✨ 新功能

### 1. ComfyUI 服務客戶端
**檔案：** `backend/app/services/comfyui_service.py` (📌 新增, 247 行)

**使用的模型和工作流：**
```
Diffusion model : flux1-dev-fp8.safetensors  (UNETLoader)
Text encoders   : t5xxl_fp8_e4m3fn.safetensors + clip_l.safetensors  (DualCLIPLoader, flux)
VAE             : ae.safetensors  (VAELoader)
Sampler         : SamplerCustomAdvanced + BasicGuider + FluxGuidance
解析度           : 1024 × 768  (4:3，適合投影片)
```

**核心 API：**
```python
async def is_available() -> bool:
    """檢查 ComfyUI 是否可連線"""

async def generate_image(
    prompt: str,       # 英文提示詞（Flux 不支援中文）
    save_path: Path,   # 輸出檔案路徑
    width: int = 1024,
    height: int = 768,
    seed: int | None = None,
    timeout: int = 180,
) -> bool:
    """生成圖像並儲存，失敗回傳 False（非強制）"""
```

**工作流程：**
```
1. POST /prompt  → 提交 Flux workflow
2. 輪詢 GET /history/{prompt_id}  → 等待完成
3. GET /view  → 下載圖像
4. 儲存至 /data/comfyui_images/
```

### 2. 幻燈片插圖整合
**檔案：** `backend/app/services/studio_service.py` (+227 行)

**支援插圖的版面類型：**
| 版面 | 理由 |
|------|------|
| `cover` | 文字限於左側 60%，右半部可放插圖 |
| `section_divider` | 全頁背景，圖層置底 |
| `content_with_icon` | 右側三分之一留白 |

**不插圖的版面（會遮住內容）：**
- `big_number`、`card_grid`、`dual_column`、`process_flow`、`table`、`chart`、`quote`、`conclusion`

**限制：** 每份簡報最多 **5 張**插圖，避免生成時間過長。

**LLM 提示詞生成策略：**
```
- 根據版面、標題、內文摘要生成 20-45 字英文提示詞
- 強制扁平向量插圖風格、淺色背景、無人臉、無文字
- 主題映射：AI → 神經網路圖示；法規 → 盾牌文件；資料 → 儀表板
```

**整合點（PPTX 生成後執行）：**
```python
# studio_service.py 內部流程
生成 PPTX
   ↓
檢查 comfyui_api_url 是否設定 + ComfyUI 是否可連
   ↓ (若可用)
用 LLM 為每張符合版面的幻燈片生成英文圖像提示詞
   ↓
呼叫 ComfyUI 生成圖像
   ↓
將圖像嵌入 PPTX 對應幻燈片
   ↓ (任何步驟失敗只記錄 log，不中止)
生成縮圖
```

### 3. 設定新增 ComfyUI URL
**檔案：** `config.py` / `settings.py` / `SettingsModal.tsx`

```python
# config.py
comfyui_api_url: str = ""  # 空字串 = 停用
```

```
前端設定介面新增輸入欄位：
ComfyUI URL  [http://host.docker.internal:8188]
說明文字：「用於簡報插圖自動生成（空白 = 停用）」
```

### 4. Docker 網路設定
**檔案：** `docker-compose.yml` (+2 行)

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

讓後端容器能用 `host.docker.internal:8188` 直接存取宿主機上的 ComfyUI 服務。

### 5. 臨時圖像目錄
**檔案：** `backend/app/main.py` (+3 行)

```python
Path("/data/comfyui_images").mkdir(parents=True, exist_ok=True)
```

啟動時自動建立 ComfyUI 圖像的暫存目錄。

---

## 🏗️ 架構

```
SettingsModal
  └─ 設定 comfyui_api_url
       ↓
Settings Router
  └─ 持久化至 DB
       ↓
studio_service._generate_slides_from_json_inner()
  ├─ 生成 PPTX（原有流程）
  └─ (可選) _add_illustrations_to_pptx()
       ├─ _generate_image_prompts_for_slides()  ← LLM 生成提示詞
       └─ comfyui_service.generate_image()      ← ComfyUI 生成圖像
            ├─ POST /prompt
            ├─ 輪詢 /history/{id}
            └─ GET /view → 嵌入 PPTX
```

---

## 🚀 啟用方式

1. 確認 ComfyUI 已在宿主機 `8188` 埠運行，並載入所需模型
2. 在 NotebookLM 設定介面輸入：`http://host.docker.internal:8188`
3. 下次生成簡報時，符合版面的幻燈片將自動附上 AI 插圖

**停用方式：** 將 ComfyUI URL 欄位清空即可，不影響其他功能。

---

## 🔧 環境變數

```env
# 可在 docker-compose.yml 預設（可被前端設定覆蓋）
COMFYUI_API_URL=http://host.docker.internal:8188
```

---

## 📚 相關連結

- **完整 Diff：** `changelog/comfyui-illustration-v1.1.0.diff`
- **前一版本：** `changelog/CHANGELOG_v0.2.0_pydantic-slides.md`
- **Commit：** `2ebde13`

---

*Generated: 2026-03-30*
