"""
LLM and Embedding model service.
Uses httpx with SSL verification disabled for self-signed certs.
"""
import ssl
import httpx
from llama_index.core import Settings as LlamaSettings
from llama_index.llms.openai_like import OpenAILike
from llama_index.embeddings.openai import OpenAIEmbedding

from app.config import get_settings, create_ssl_context

settings = get_settings()

# Global httpx client that skips SSL verification
_http_client = httpx.Client(verify=False, timeout=httpx.Timeout(120.0))
_async_http_client = httpx.AsyncClient(
    verify=False,
    timeout=httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=10.0),
)

_ASYNC_CLIENT_TIMEOUT = httpx.Timeout(connect=10.0, read=300.0, write=30.0, pool=10.0)


def _fresh_async_client() -> httpx.AsyncClient:
    """Return a new AsyncClient. Use for streaming requests to avoid stale
    connection pool state after asyncio cancellation."""
    return httpx.AsyncClient(verify=False, timeout=_ASYNC_CLIENT_TIMEOUT)


def get_llm(async_client: httpx.AsyncClient | None = None) -> OpenAILike:
    """Return a configured LLM instance pointing to the local API.

    Pass async_client to use a dedicated client (e.g. for streaming, where
    asyncio cancellation can corrupt the shared pool).
    """
    from app.routers.settings import _runtime_settings
    llm = OpenAILike(
        api_base=_runtime_settings.llm_api_base_url or settings.llm_api_base_url,
        api_key=_runtime_settings.llm_api_key or settings.llm_api_key,
        model=_runtime_settings.llm_model or settings.llm_model,
        temperature=_runtime_settings.temperature,
        is_chat_model=True,
        is_function_calling_model=False,
        max_tokens=_runtime_settings.llm_max_tokens,
        http_client=_http_client,
        async_http_client=async_client or _async_http_client,
    )
    return llm


def get_embed_model() -> OpenAIEmbedding:
    """Return a configured embedding model instance."""
    embed = OpenAIEmbedding(
        api_base=settings.llm_api_base_url,
        api_key=settings.llm_api_key,
        model_name=settings.embedding_model,
        embed_batch_size=1,  # Prevent CUDA OOM in Triton by forcing sequential embedding evaluation
        http_client=_http_client,
    )
    return embed


def configure_llama_index():
    """Set global LlamaIndex defaults."""
    LlamaSettings.llm = get_llm()
    LlamaSettings.embed_model = get_embed_model()
    LlamaSettings.chunk_size = settings.chunk_size
    LlamaSettings.chunk_overlap = settings.chunk_overlap
