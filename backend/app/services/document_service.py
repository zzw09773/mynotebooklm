"""
Document processing service:
  - Parse PDFs via PyMuPDF (with OCR fallback for scanned pages)
  - Process image files via Tesseract OCR
  - Optionally supplement OCR with VLM semantic understanding
  - Chunk text with LlamaIndex
  - Store / retrieve vectors in ChromaDB
"""
import os
import uuid
from io import BytesIO
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF
import chromadb
import pytesseract
from PIL import Image
from llama_index.core import Document, VectorStoreIndex, StorageContext
from llama_index.core.node_parser import SentenceSplitter
from llama_index.vector_stores.chroma import ChromaVectorStore

from app.config import get_settings
from app.services.llm_service import get_embed_model
from app.services.vlm_service import describe_image


settings = get_settings()

# Minimum characters on a page before triggering OCR fallback
_OCR_THRESHOLD = 50


# ── ChromaDB singleton ───────────────────────────────────────
_chroma_client: Optional[chromadb.PersistentClient] = None


def _get_chroma_client() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        os.makedirs(settings.chroma_db_dir, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=settings.chroma_db_dir)
    return _chroma_client


def _get_vlm_config() -> dict | None:
    """Return VLM config from runtime settings, or None if vision_model is unset."""
    from app.routers.settings import _runtime_settings
    if not _runtime_settings.vision_model:
        return None
    return {
        "api_base_url": _runtime_settings.llm_api_base_url,
        "api_key": _runtime_settings.llm_api_key,
        "model": _runtime_settings.vision_model,
    }


# ── PDF text extraction (hybrid: native + OCR + VLM) ────────

def _ocr_page_image(page: fitz.Page) -> str:
    """Render a PDF page to an image and run Tesseract OCR."""
    pix = page.get_pixmap(dpi=300)
    img = Image.open(BytesIO(pix.tobytes("png")))
    text = pytesseract.image_to_string(img, lang="chi_tra+eng")
    return text.strip()


async def extract_text_from_pdf(file_path: str, vlm_config: dict | None = None) -> list[dict]:
    """
    Extract text from a PDF file page by page.
    Uses native text extraction first; falls back to OCR if the page
    has fewer than _OCR_THRESHOLD characters of text (scanned page).
    If vlm_config is provided, additionally sends each page image to the VLM
    for semantic understanding (charts, diagrams, etc.).
    Returns a list of dicts: [{"page": 1, "text": "..."}, ...]
    """
    doc = fitz.open(file_path)
    pages = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text")
        if len(text.strip()) < _OCR_THRESHOLD:
            ocr_text = _ocr_page_image(page)
            if ocr_text:
                text = ocr_text

        # VLM semantic understanding — 150 DPI is sufficient for comprehension
        if vlm_config:
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("jpeg")
            vlm_desc = await describe_image(
                img_bytes,
                **vlm_config,
                context_hint=f"這是 PDF 文件的第 {page_num} 頁",
            )
            if vlm_desc:
                text = f"{text}\n\n[圖片理解]\n{vlm_desc}"

        if text.strip():
            pages.append({"page": page_num, "text": text})
    doc.close()
    return pages


# ── Image OCR + VLM extraction ───────────────────────────────

async def extract_text_from_image(file_path: str, vlm_config: dict | None = None) -> str:
    """
    Run Tesseract OCR on a single image file (.jpg/.png).
    If vlm_config is provided, also sends the image to the VLM for semantic
    understanding and appends the description after the OCR text.
    """
    img = Image.open(file_path)
    ocr_text = pytesseract.image_to_string(img, lang="chi_tra+eng").strip()

    if vlm_config:
        img_bytes = Path(file_path).read_bytes()
        vlm_desc = await describe_image(img_bytes, **vlm_config)
        if vlm_desc:
            return f"{ocr_text}\n\n[圖片理解]\n{vlm_desc}" if ocr_text else vlm_desc

    return ocr_text


# ── Document ingestion ───────────────────────────────────────

def save_uploaded_file(filename: str, content: bytes) -> str:
    """Save uploaded bytes to the uploads directory. Returns the saved path."""
    os.makedirs(settings.upload_dir, exist_ok=True)
    file_id = uuid.uuid4().hex[:8]
    safe_name = f"{file_id}_{filename}"
    dest = os.path.join(settings.upload_dir, safe_name)
    with open(dest, "wb") as f:
        f.write(content)
    return dest


async def ingest_document(file_path: str, original_filename: str) -> dict:
    """
    Parse a PDF, chunk it, generate embeddings, and store in ChromaDB.
    Returns metadata about the ingested document.
    """
    vlm_config = _get_vlm_config()
    pages = await extract_text_from_pdf(file_path, vlm_config=vlm_config)
    if not pages:
        raise ValueError("PDF 中未萃取到任何文字。")

    # Create LlamaIndex Documents with page-level metadata
    documents = []
    for p in pages:
        doc = Document(
            text=p["text"],
            metadata={
                "source_file": original_filename,
                "file_path": file_path,
                "page_number": p["page"],
            },
        )
        documents.append(doc)

    # Chunk (split) the documents
    splitter = SentenceSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    nodes = splitter.get_nodes_from_documents(documents)

    # Assign a stable document_id to each node for citation tracking
    doc_id = Path(file_path).stem
    for i, node in enumerate(nodes):
        node.metadata["doc_id"] = doc_id
        node.metadata["chunk_index"] = i

    # Persist into ChromaDB
    chroma_client = _get_chroma_client()
    collection_name = _sanitize_collection_name(doc_id)
    chroma_collection = chroma_client.get_or_create_collection(name=collection_name)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    embed_model = get_embed_model()
    VectorStoreIndex(
        nodes=nodes,
        storage_context=storage_context,
        embed_model=embed_model,
    )

    return {
        "doc_id": doc_id,
        "collection_name": collection_name,
        "filename": original_filename,
        "total_pages": len(pages),
        "total_chunks": len(nodes),
        "file_path": file_path,
    }


async def ingest_image(file_path: str, original_filename: str) -> dict:
    """
    Process an image file (.jpg/.png) via OCR (+ optional VLM), chunk it,
    generate embeddings, and store in ChromaDB.
    """
    vlm_config = _get_vlm_config()
    text = await extract_text_from_image(file_path, vlm_config=vlm_config)
    if not text:
        raise ValueError("圖片中未辨識到任何文字。")

    doc = Document(
        text=text,
        metadata={
            "source_file": original_filename,
            "file_path": file_path,
            "page_number": 1,
        },
    )

    splitter = SentenceSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    nodes = splitter.get_nodes_from_documents([doc])

    doc_id = Path(file_path).stem
    for i, node in enumerate(nodes):
        node.metadata["doc_id"] = doc_id
        node.metadata["chunk_index"] = i

    chroma_client = _get_chroma_client()
    collection_name = _sanitize_collection_name(doc_id)
    chroma_collection = chroma_client.get_or_create_collection(name=collection_name)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    embed_model = get_embed_model()
    VectorStoreIndex(
        nodes=nodes,
        storage_context=storage_context,
        embed_model=embed_model,
    )

    return {
        "doc_id": doc_id,
        "collection_name": collection_name,
        "filename": original_filename,
        "total_pages": 1,
        "total_chunks": len(nodes),
        "file_path": file_path,
    }


def ingest_markdown(file_path: str, original_filename: str) -> dict:
    """
    Ingest a Markdown (.md) file by reading it as plain text,
    chunking it, generating embeddings, and storing in ChromaDB.
    Markdown has no images, so no VLM is needed.
    """
    with open(file_path, encoding="utf-8") as f:
        text = f.read().strip()
    if not text:
        raise ValueError("Markdown 檔案內容為空。")

    doc = Document(
        text=text,
        metadata={
            "source_file": original_filename,
            "file_path": file_path,
            "page_number": 1,
        },
    )

    splitter = SentenceSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    nodes = splitter.get_nodes_from_documents([doc])

    doc_id = Path(file_path).stem
    for i, node in enumerate(nodes):
        node.metadata["doc_id"] = doc_id
        node.metadata["chunk_index"] = i

    chroma_client = _get_chroma_client()
    collection_name = _sanitize_collection_name(doc_id)
    chroma_collection = chroma_client.get_or_create_collection(name=collection_name)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    storage_context = StorageContext.from_defaults(vector_store=vector_store)

    embed_model = get_embed_model()
    VectorStoreIndex(
        nodes=nodes,
        storage_context=storage_context,
        embed_model=embed_model,
    )

    return {
        "doc_id": doc_id,
        "collection_name": collection_name,
        "filename": original_filename,
        "total_pages": 1,
        "total_chunks": len(nodes),
        "file_path": file_path,
    }


# ── Document retrieval helpers ────────────────────────────────

def list_collections() -> list[str]:
    """Return the names of all ingested document collections."""
    client = _get_chroma_client()
    return [c.name for c in client.list_collections()]


def get_retriever(collection_name: str, top_k: int | None = None):
    """
    Build a LlamaIndex VectorStoreIndex retriever for a given collection.
    """
    chroma_client = _get_chroma_client()
    chroma_collection = chroma_client.get_collection(name=collection_name)
    vector_store = ChromaVectorStore(chroma_collection=chroma_collection)
    embed_model = get_embed_model()

    index = VectorStoreIndex.from_vector_store(
        vector_store=vector_store,
        embed_model=embed_model,
    )
    return index.as_retriever(similarity_top_k=top_k or settings.top_k)


def delete_document(collection_name: str, file_path: str | None = None) -> None:
    """Delete a document collection and its uploaded file."""
    client = _get_chroma_client()
    client.delete_collection(name=collection_name)
    if file_path and os.path.exists(file_path):
        os.remove(file_path)


# ── Helpers ───────────────────────────────────────────────────

def _sanitize_collection_name(name: str) -> str:
    """ChromaDB collection names must be 3-63 chars, ASCII alphanumeric + _-."""
    import hashlib
    sanitized = "".join(c if c.isascii() and (c.isalnum() or c in ("_", "-")) else "" for c in name)
    sanitized = sanitized.strip("_-")
    if len(sanitized) < 3:
        sanitized = "doc_" + hashlib.md5(name.encode()).hexdigest()[:8]
    return sanitized[:63]
