"""
Settings API routes – get/update LLM configuration and list available models.

Settings are persisted to the SQLite database so they survive backend restarts.
On startup, DB values override .env defaults for any key that was previously saved.
"""
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.dependencies import get_current_user
from app.models import User, load_persisted_settings, set_persisted_setting

router = APIRouter(prefix="/api/settings", tags=["設定"])

# ── Startup: merge .env defaults with DB-persisted overrides ──

def _build_runtime_settings():
    base = get_settings()
    try:
        persisted = load_persisted_settings()
    except Exception:
        logging.warning("Could not load persisted settings from DB; using .env defaults.")
        persisted = {}

    if persisted.get("llm_api_base_url"):
        base.llm_api_base_url = persisted["llm_api_base_url"]
    if persisted.get("llm_api_key"):
        base.llm_api_key = persisted["llm_api_key"]
    if persisted.get("llm_model"):
        base.llm_model = persisted["llm_model"]
    if persisted.get("embedding_model"):
        base.embedding_model = persisted["embedding_model"]
    if persisted.get("temperature"):
        base.temperature = float(persisted["temperature"])
    if persisted.get("top_k"):
        base.top_k = int(persisted["top_k"])
    if persisted.get("chunk_size"):
        base.chunk_size = int(persisted["chunk_size"])
    if persisted.get("llm_max_tokens"):
        base.llm_max_tokens = int(persisted["llm_max_tokens"])
    return base


_runtime_settings = _build_runtime_settings()

# Apply persisted settings to LlamaIndex globals immediately at import time
try:
    from app.services.llm_service import configure_llama_index
    configure_llama_index()
except Exception:
    logging.warning("Could not configure LlamaIndex at settings module load.")


# ── Schemas ───────────────────────────────────────────────────

class SettingsResponse(BaseModel):
    llm_api_base_url: str
    llm_api_key: str
    llm_model: str
    embedding_model: str
    temperature: float
    top_k: int
    chunk_size: int
    llm_max_tokens: int


class SettingsUpdate(BaseModel):
    llm_api_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    embedding_model: str | None = None
    temperature: float | None = None
    top_k: int | None = None
    chunk_size: int | None = None
    llm_max_tokens: int | None = None


class ModelInfo(BaseModel):
    id: str
    owned_by: str | None = None


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


# ── Endpoints ─────────────────────────────────────────────────

@router.get("/", response_model=SettingsResponse, summary="取得目前設定")
async def get_current_settings(current_user: User = Depends(get_current_user)):
    return SettingsResponse(
        llm_api_base_url=_runtime_settings.llm_api_base_url,
        llm_api_key=_runtime_settings.llm_api_key,
        llm_model=_runtime_settings.llm_model,
        embedding_model=_runtime_settings.embedding_model,
        temperature=_runtime_settings.temperature,
        top_k=_runtime_settings.top_k,
        chunk_size=_runtime_settings.chunk_size,
        llm_max_tokens=_runtime_settings.llm_max_tokens,
    )


@router.put("/", response_model=SettingsResponse, summary="更新設定（持久化到 DB）")
async def update_settings(update: SettingsUpdate, current_user: User = Depends(get_current_user)):
    # Update runtime object
    changed: dict[str, str] = {}
    if update.llm_api_base_url is not None:
        _runtime_settings.llm_api_base_url = update.llm_api_base_url
        changed["llm_api_base_url"] = update.llm_api_base_url
    if update.llm_api_key is not None:
        _runtime_settings.llm_api_key = update.llm_api_key
        changed["llm_api_key"] = update.llm_api_key
    if update.llm_model is not None:
        _runtime_settings.llm_model = update.llm_model
        changed["llm_model"] = update.llm_model
    if update.embedding_model is not None:
        _runtime_settings.embedding_model = update.embedding_model
        changed["embedding_model"] = update.embedding_model
    if update.temperature is not None:
        _runtime_settings.temperature = update.temperature
        changed["temperature"] = str(update.temperature)
    if update.top_k is not None:
        _runtime_settings.top_k = update.top_k
        changed["top_k"] = str(update.top_k)
    if update.chunk_size is not None:
        _runtime_settings.chunk_size = update.chunk_size
        changed["chunk_size"] = str(update.chunk_size)
    if update.llm_max_tokens is not None:
        _runtime_settings.llm_max_tokens = update.llm_max_tokens
        changed["llm_max_tokens"] = str(update.llm_max_tokens)

    # Persist to DB so settings survive restarts
    for key, value in changed.items():
        set_persisted_setting(key, value)

    # Re-configure LlamaIndex globals with updated credentials
    from app.services.llm_service import configure_llama_index
    configure_llama_index()

    return await get_current_settings(current_user)


@router.get("/models", response_model=ModelsResponse, summary="列出可用模型")
async def list_models(current_user: User = Depends(get_current_user)):
    """Fetch available models from the LLM API endpoint."""
    try:
        async with httpx.AsyncClient(verify=False, timeout=15.0) as client:
            res = await client.get(
                f"{_runtime_settings.llm_api_base_url}/models",
                headers={"Authorization": f"Bearer {_runtime_settings.llm_api_key}"},
            )
            if res.status_code != 200:
                raise HTTPException(status_code=502, detail=f"上游 API 回傳錯誤：{res.status_code}")
            data = res.json()
            models = [
                ModelInfo(id=m["id"], owned_by=m.get("owned_by"))
                for m in data.get("data", [])
            ]
            return ModelsResponse(models=models)
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="無法連線到 LLM API 伺服器")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
