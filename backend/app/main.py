"""
NotebookLM Backend – FastAPI application entry point.
"""
import warnings
import urllib3

# Suppress SSL warnings for self-signed certificates
warnings.filterwarnings("ignore", category=urllib3.exceptions.InsecureRequestWarning)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import documents, chat, settings
from app.services.llm_service import configure_llama_index

# Configure LlamaIndex global defaults
configure_llama_index()

app = FastAPI(
    title="NotebookLM API",
    description="本地 NotebookLM – 基於文件的 RAG 對話系統 API",
    version="0.1.0",
)

# CORS – allow the frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(settings.router)


@app.get("/health", tags=["系統"])
async def health():
    return {"status": "ok", "service": "notebooklm-backend"}
