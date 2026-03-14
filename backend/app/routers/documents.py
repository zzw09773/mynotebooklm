"""
Document management API routes – scoped to a project.
Supports PDF and image (.jpg/.png) uploads with OCR.
"""
import json
import os
import traceback
from fastapi import APIRouter, UploadFile, File, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from app.services.document_service import (
    save_uploaded_file,
    ingest_document,
    ingest_image,
    delete_document,
    _sanitize_collection_name,
)
from app.services.summary_service import generate_study_guide
from app.models import (
    get_project,
    add_document_to_project,
    list_project_documents,
    remove_document_from_project,
    create_summary,
    get_summary,
    get_document_by_collection,
    update_document_status,
)
from app.config import get_settings

router = APIRouter(prefix="/api/documents", tags=["文件管理"])
settings = get_settings()

_ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}


class DocumentInfo(BaseModel):
    doc_id: str
    collection_name: str
    filename: str
    total_pages: int
    total_chunks: int
    status: str = "processing"


class DocumentListResponse(BaseModel):
    documents: list[DocumentInfo]


class SummaryResponse(BaseModel):
    collection_name: str
    status: str
    summary_text: str = ""
    key_points: list[str] = []
    faqs: list[dict] = []
    error_message: str = ""


class DocumentStatusResponse(BaseModel):
    collection_name: str
    status: str
    total_pages: int = 0
    total_chunks: int = 0
    error_message: str = ""


def _process_document_background(
    file_path: str, filename: str, ext: str,
    collection_name: str, project_id: int,
):
    """Background task: parse, embed, then update status."""
    try:
        if ext == ".pdf":
            result = ingest_document(file_path, filename)
        else:
            result = ingest_image(file_path, filename)

        update_document_status(
            collection_name,
            status="ready",
            total_pages=result["total_pages"],
            total_chunks=result["total_chunks"],
        )

        # Trigger study guide generation
        create_summary(project_id, collection_name)
        generate_study_guide(collection_name, project_id)

    except Exception as e:
        update_document_status(
            collection_name,
            status="error",
            error_message=str(e),
        )


@router.post("/upload", response_model=DocumentInfo, summary="上傳 PDF 或圖片文件")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    project_id: int = Query(..., description="此文件隸屬的專案 ID"),
):
    """
    Upload a PDF or image file. Returns immediately with status='processing'.
    The actual parsing, embedding, and study guide generation happen in the background.
    Use GET /api/documents/{collection_name}/status to poll for completion.
    """
    # Validate project exists
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="找不到該專案。")

    if not file.filename:
        raise HTTPException(status_code=400, detail="檔案名稱無效。")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支援的檔案格式。支援的格式：{', '.join(_ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="檔案內容為空。")

    try:
        file_path = save_uploaded_file(file.filename, content)
        from pathlib import Path
        doc_id = Path(file_path).stem
        collection_name = _sanitize_collection_name(doc_id)

        # Create DB record immediately with status=processing
        add_document_to_project(
            project_id=project_id,
            collection_name=collection_name,
            filename=file.filename,
            total_pages=0,
            total_chunks=0,
            file_path=file_path,
        )

        # Run ingestion in background
        background_tasks.add_task(
            _process_document_background,
            file_path, file.filename, ext,
            collection_name, project_id,
        )

        return DocumentInfo(
            doc_id=doc_id,
            collection_name=collection_name,
            filename=file.filename,
            total_pages=0,
            total_chunks=0,
            status="processing",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"處理文件時發生錯誤：{str(e)}")


@router.get("/{collection_name}/status", response_model=DocumentStatusResponse, summary="查詢文件處理狀態")
async def get_document_status(collection_name: str):
    """
    Poll document processing status. Returns status: processing | ready | error.
    """
    doc = get_document_by_collection(collection_name)
    if not doc:
        raise HTTPException(status_code=404, detail="找不到該文件。")

    return DocumentStatusResponse(
        collection_name=doc.collection_name,
        status=doc.status,
        total_pages=doc.total_pages,
        total_chunks=doc.total_chunks,
        error_message=doc.error_message,
    )


@router.get("/", response_model=DocumentListResponse, summary="取得專案的已上傳文件")
async def get_documents(
    project_id: int = Query(..., description="專案 ID"),
):
    """
    List all ingested documents for a project.
    """
    project = get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="找不到該專案。")

    docs = list_project_documents(project_id)
    return DocumentListResponse(
        documents=[
            DocumentInfo(
                doc_id=d.collection_name,
                collection_name=d.collection_name,
                filename=d.filename,
                total_pages=d.total_pages,
                total_chunks=d.total_chunks,
                status=d.status,
            )
            for d in docs
        ]
    )


@router.get("/{collection_name}/summary", response_model=SummaryResponse, summary="取得文件摘要/學習指南")
async def get_document_summary(collection_name: str):
    """
    Get the auto-generated study guide / summary for a document.
    """
    s = get_summary(collection_name)
    if not s:
        raise HTTPException(status_code=404, detail="找不到該文件的摘要資料。")

    return SummaryResponse(
        collection_name=s.collection_name,
        status=s.status,
        summary_text=s.summary_text,
        key_points=json.loads(s.key_points) if s.key_points else [],
        faqs=json.loads(s.faqs) if s.faqs else [],
        error_message=s.error_message,
    )


@router.delete("/{collection_name}", summary="刪除文件")
async def remove_document(
    collection_name: str,
    project_id: int = Query(..., description="專案 ID"),
):
    """
    Delete a document collection from the vector store and unlink from project.
    Also removes the original uploaded file from disk.
    """
    try:
        # Look up file_path from DB before deleting the record
        docs = list_project_documents(project_id)
        file_path = None
        for d in docs:
            if d.collection_name == collection_name:
                file_path = d.file_path
                break

        delete_document(collection_name, file_path=file_path)
        remove_document_from_project(project_id, collection_name)
        return {"message": f"文件 {collection_name} 已成功刪除。"}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"找不到文件或刪除失敗：{str(e)}")
