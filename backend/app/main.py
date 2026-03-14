"""
NotebookLM Backend – FastAPI application entry point.
"""
import warnings
import urllib3

# Suppress SSL warnings for self-signed certificates
warnings.filterwarnings("ignore", category=urllib3.exceptions.InsecureRequestWarning)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, documents, chat, settings, projects, conversations, studio
from app.services.llm_service import configure_llama_index
from app.models import init_db

# Configure LlamaIndex global defaults
configure_llama_index()
init_db()

_settings = get_settings()

app = FastAPI(
    title="NotebookLM API",
    description="本地 NotebookLM – 基於文件的 RAG 對話系統 API",
    version="0.2.0",
)

# CORS – allow specific origins from config
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(settings.router)
app.include_router(projects.router)
app.include_router(conversations.router)
app.include_router(studio.router)


@app.get("/health", tags=["系統"])
async def health():
    return {"status": "ok", "service": "notebooklm-backend"}
