"""
Settings API routes – get/update LLM configuration and list available models.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import get_settings
from app.dependencies import get_current_user
from app.models import User

router = APIRouter(prefix="/api/settings", tags=["設定"])


class SettingsResponse(BaseModel):
    llm_api_base_url: str
    llm_api_key: str
    llm_model: str
    embedding_model: str
    temperature: float
    top_k: int
    chunk_size: int


class SettingsUpdate(BaseModel):
    llm_api_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    embedding_model: str | None = None
    temperature: float | None = None
    top_k: int | None = None
    chunk_size: int | None = None


class ModelInfo(BaseModel):
    id: str
    owned_by: str | None = None


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


# ── Runtime settings (mutable, starts from .env) ─────────
_runtime_settings = get_settings()


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
    )


@router.put("/", response_model=SettingsResponse, summary="更新設定")
async def update_settings(update: SettingsUpdate, current_user: User = Depends(get_current_user)):
    if update.llm_api_base_url is not None:
        _runtime_settings.llm_api_base_url = update.llm_api_base_url
    if update.llm_api_key is not None:
        _runtime_settings.llm_api_key = update.llm_api_key
    if update.llm_model is not None:
        _runtime_settings.llm_model = update.llm_model
    if update.embedding_model is not None:
        _runtime_settings.embedding_model = update.embedding_model
    if update.temperature is not None:
        _runtime_settings.temperature = update.temperature
    if update.top_k is not None:
        _runtime_settings.top_k = update.top_k
    if update.chunk_size is not None:
        _runtime_settings.chunk_size = update.chunk_size

    # Re-configure LlamaIndex globals
    from app.services.llm_service import configure_llama_index
    configure_llama_index()

    return await get_current_settings()


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
