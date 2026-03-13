"""
Document management API routes.
"""
import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

from app.services.document_service import (
    save_uploaded_file,
    ingest_document,
    list_collections,
    delete_document,
)
from app.config import get_settings

router = APIRouter(prefix="/api/documents", tags=["文件管理"])
settings = get_settings()


class DocumentInfo(BaseModel):
    doc_id: str
    collection_name: str
    filename: str
    total_pages: int
    total_chunks: int


class DocumentListResponse(BaseModel):
    documents: list[DocumentInfo]


@router.post("/upload", response_model=DocumentInfo, summary="上傳 PDF 文件")
async def upload_document(file: UploadFile = File(...)):
    """
    Upload a PDF file, parse it, chunk it, and store embeddings in ChromaDB.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="目前僅支援 PDF 檔案格式。")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="檔案內容為空。")

    try:
        file_path = save_uploaded_file(file.filename, content)
        result = ingest_document(file_path, file.filename)
        return DocumentInfo(**result)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"處理文件時發生錯誤：{str(e)}")


@router.get("/", response_model=DocumentListResponse, summary="取得所有已上傳文件")
async def get_documents():
    """
    List all ingested document collections.
    """
    collections = list_collections()
    docs = []
    for name in collections:
        docs.append(DocumentInfo(
            doc_id=name,
            collection_name=name,
            filename=name,
            total_pages=0,
            total_chunks=0,
        ))
    return DocumentListResponse(documents=docs)


@router.delete("/{collection_name}", summary="刪除文件")
async def remove_document(collection_name: str):
    """
    Delete a document collection from the vector store.
    """
    try:
        delete_document(collection_name)
        return {"message": f"文件 {collection_name} 已成功刪除。"}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"找不到文件或刪除失敗：{str(e)}")
