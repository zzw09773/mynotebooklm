"""
Document processing service:
  - Parse PDFs via PyMuPDF (with OCR fallback for scanned pages)
  - Process image files via Tesseract OCR
  - Chunk text with LlamaIndex
  - Store / retrieve vectors in ChromaDB
"""
import os
import uuid
import shutil
from pathlib import Path
from typing import Optional
from io import BytesIO

import fitz  # PyMuPDF
import chromadb
import pytesseract
from PIL import Image
from llama_index.core import Document, VectorStoreIndex, StorageContext
from llama_index.core.node_parser import SentenceSplitter
from llama_index.vector_stores.chroma import ChromaVectorStore

from app.config import get_settings
from app.services.llm_service import get_embed_model


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


# ── PDF text extraction (hybrid: native + OCR fallback) ──────

def _ocr_page_image(page: fitz.Page) -> str:
    """Render a PDF page to an image and run Tesseract OCR."""
    pix = page.get_pixmap(dpi=300)
    img = Image.open(BytesIO(pix.tobytes("png")))
    text = pytesseract.image_to_string(img, lang="chi_tra+eng")
    return text.strip()


def extract_text_from_pdf(file_path: str) -> list[dict]:
    """
    Extract text from a PDF file page by page.
    Uses native text extraction first; falls back to OCR if the page
    has fewer than _OCR_THRESHOLD characters of text (scanned page).
    Returns a list of dicts: [{"page": 1, "text": "..."}, ...]
    """
    doc = fitz.open(file_path)
    pages = []
    for page_num, page in enumerate(doc, start=1):
        text = page.get_text("text")
        # If native extraction yields very little text, try OCR
        if len(text.strip()) < _OCR_THRESHOLD:
            ocr_text = _ocr_page_image(page)
            if ocr_text:
                text = ocr_text
        if text.strip():
            pages.append({"page": page_num, "text": text})
    doc.close()
    return pages


# ── Image OCR extraction ─────────────────────────────────────

def extract_text_from_image(file_path: str) -> str:
    """Run Tesseract OCR on a single image file (.jpg/.png)."""
    img = Image.open(file_path)
    text = pytesseract.image_to_string(img, lang="chi_tra+eng")
    return text.strip()


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


def ingest_document(file_path: str, original_filename: str) -> dict:
    """
    Parse a PDF, chunk it, generate embeddings, and store in ChromaDB.
    Returns metadata about the ingested document.
    """
    pages = extract_text_from_pdf(file_path)
    if not pages:
        raise ValueError("PDF 中未萃取到任何文字。")

    # Create LlamaIndex Documents with page‑level metadata
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


def ingest_image(file_path: str, original_filename: str) -> dict:
    """
    Process an image file (.jpg/.png) via OCR, chunk it,
    generate embeddings, and store in ChromaDB.
    """
    text = extract_text_from_image(file_path)
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
    # Clean up the original uploaded file from disk
    if file_path and os.path.exists(file_path):
        os.remove(file_path)


# ── Helpers ───────────────────────────────────────────────────

def _sanitize_collection_name(name: str) -> str:
    """ChromaDB collection names must be 3‑63 chars, ASCII alphanumeric + _-."""
    import hashlib
    # Keep only ASCII alphanumeric, underscore, hyphen
    sanitized = "".join(c if c.isascii() and (c.isalnum() or c in ("_", "-")) else "" for c in name)
    # Ensure it starts/ends with alphanumeric
    sanitized = sanitized.strip("_-")
    if len(sanitized) < 3:
        # Use a hash of the original name as fallback
        sanitized = "doc_" + hashlib.md5(name.encode()).hexdigest()[:8]
    return sanitized[:63]
