"""
Project database models using SQLModel (SQLite).
"""
import os
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field, Session, create_engine, select

from app.config import get_settings

settings = get_settings()

# SQLite database lives alongside chroma_db
_DB_PATH = os.path.join(os.path.dirname(settings.chroma_db_dir), "notebooklm.db")
_engine = create_engine(f"sqlite:///{_DB_PATH}", echo=False)


# ── Models ────────────────────────────────────────────────────

class Project(SQLModel, table=True):
    """A workspace that groups documents and conversations together."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    description: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ProjectDocument(SQLModel, table=True):
    """Links a document (ChromaDB collection) to a project."""
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    collection_name: str
    filename: str
    total_pages: int = 0
    total_chunks: int = 0
    file_path: str = ""
    status: str = "processing"   # processing | ready | error
    error_message: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── Database init ─────────────────────────────────────────────

def init_db():
    """Create all tables if they don't exist, and migrate existing tables."""
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    SQLModel.metadata.create_all(_engine)
    # Migrate: add new columns to existing ProjectDocument table
    _migrate_project_document()

def _migrate_project_document():
    """Add new columns to ProjectDocument if they don't exist (SQLite)."""
    import sqlite3
    conn = sqlite3.connect(_DB_PATH)
    cursor = conn.cursor()
    # Check existing columns
    cursor.execute("PRAGMA table_info(projectdocument)")
    columns = {row[1] for row in cursor.fetchall()}
    if "status" not in columns:
        cursor.execute("ALTER TABLE projectdocument ADD COLUMN status TEXT DEFAULT 'ready'")
    if "error_message" not in columns:
        cursor.execute("ALTER TABLE projectdocument ADD COLUMN error_message TEXT DEFAULT ''")
    conn.commit()
    conn.close()


def get_session() -> Session:
    return Session(_engine)


# ── Project CRUD ──────────────────────────────────────────────

def create_project(name: str, description: str = "") -> Project:
    with get_session() as session:
        project = Project(name=name, description=description)
        session.add(project)
        session.commit()
        session.refresh(project)
        return project


def list_projects() -> list[Project]:
    with get_session() as session:
        return list(session.exec(select(Project).order_by(Project.updated_at.desc())).all())


def get_project(project_id: int) -> Project | None:
    with get_session() as session:
        return session.get(Project, project_id)


def update_project(project_id: int, name: str | None = None, description: str | None = None) -> Project | None:
    with get_session() as session:
        project = session.get(Project, project_id)
        if not project:
            return None
        if name is not None:
            project.name = name
        if description is not None:
            project.description = description
        project.updated_at = datetime.now(timezone.utc).isoformat()
        session.add(project)
        session.commit()
        session.refresh(project)
        return project


def delete_project(project_id: int) -> bool:
    with get_session() as session:
        project = session.get(Project, project_id)
        if not project:
            return False
        # Collect document info before deleting records
        docs = session.exec(
            select(ProjectDocument).where(ProjectDocument.project_id == project_id)
        ).all()
        doc_info = [(d.collection_name, d.file_path) for d in docs]
        for doc in docs:
            session.delete(doc)
        # Also delete any summaries
        summaries = session.exec(
            select(DocumentSummary).where(DocumentSummary.project_id == project_id)
        ).all()
        for s in summaries:
            session.delete(s)
        session.delete(project)
        session.commit()

    # Clean up ChromaDB collections and uploaded files outside session
    from app.services.document_service import delete_document
    for collection_name, file_path in doc_info:
        try:
            delete_document(collection_name, file_path=file_path)
        except Exception:
            pass  # Best-effort cleanup
    return True


# ── ProjectDocument helpers ───────────────────────────────────

def add_document_to_project(project_id: int, collection_name: str,
                            filename: str, total_pages: int,
                            total_chunks: int, file_path: str) -> ProjectDocument:
    with get_session() as session:
        pd = ProjectDocument(
            project_id=project_id,
            collection_name=collection_name,
            filename=filename,
            total_pages=total_pages,
            total_chunks=total_chunks,
            file_path=file_path,
        )
        session.add(pd)
        session.commit()
        session.refresh(pd)
        return pd


def list_project_documents(project_id: int) -> list[ProjectDocument]:
    with get_session() as session:
        return list(session.exec(
            select(ProjectDocument).where(ProjectDocument.project_id == project_id)
        ).all())


def remove_document_from_project(project_id: int, collection_name: str) -> bool:
    with get_session() as session:
        stmt = select(ProjectDocument).where(
            ProjectDocument.project_id == project_id,
            ProjectDocument.collection_name == collection_name,
        )
        pd = session.exec(stmt).first()
        if not pd:
            return False
        session.delete(pd)
        session.commit()
        return True


def get_document_by_collection(collection_name: str) -> ProjectDocument | None:
    with get_session() as session:
        stmt = select(ProjectDocument).where(
            ProjectDocument.collection_name == collection_name,
        )
        return session.exec(stmt).first()


def update_document_status(
    collection_name: str,
    *,
    status: str | None = None,
    total_pages: int | None = None,
    total_chunks: int | None = None,
    error_message: str | None = None,
) -> ProjectDocument | None:
    with get_session() as session:
        stmt = select(ProjectDocument).where(
            ProjectDocument.collection_name == collection_name,
        )
        doc = session.exec(stmt).first()
        if not doc:
            return None
        if status is not None:
            doc.status = status
        if total_pages is not None:
            doc.total_pages = total_pages
        if total_chunks is not None:
            doc.total_chunks = total_chunks
        if error_message is not None:
            doc.error_message = error_message
        session.add(doc)
        session.commit()
        session.refresh(doc)
        return doc


# ── DocumentSummary model & helpers ───────────────────────────

class DocumentSummary(SQLModel, table=True):
    """Stores an LLM-generated study guide / summary for a document."""
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    collection_name: str = Field(index=True)
    status: str = "pending"  # pending | generating | done | error
    summary_text: str = ""
    key_points: str = "[]"   # JSON array of strings
    faqs: str = "[]"         # JSON array of {q, a} objects
    error_message: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def create_summary(project_id: int, collection_name: str) -> DocumentSummary:
    with get_session() as session:
        s = DocumentSummary(project_id=project_id, collection_name=collection_name)
        session.add(s)
        session.commit()
        session.refresh(s)
        return s


def get_summary(collection_name: str) -> DocumentSummary | None:
    with get_session() as session:
        stmt = select(DocumentSummary).where(
            DocumentSummary.collection_name == collection_name,
        )
        return session.exec(stmt).first()


def update_summary(
    collection_name: str,
    *,
    status: str | None = None,
    summary_text: str | None = None,
    key_points: str | None = None,
    faqs: str | None = None,
    error_message: str | None = None,
) -> DocumentSummary | None:
    with get_session() as session:
        stmt = select(DocumentSummary).where(
            DocumentSummary.collection_name == collection_name,
        )
        s = session.exec(stmt).first()
        if not s:
            return None
        if status is not None:
            s.status = status
        if summary_text is not None:
            s.summary_text = summary_text
        if key_points is not None:
            s.key_points = key_points
        if faqs is not None:
            s.faqs = faqs
        if error_message is not None:
            s.error_message = error_message
        s.updated_at = datetime.now(timezone.utc).isoformat()
        session.add(s)
        session.commit()
        session.refresh(s)
        return s


# ── Conversation & Message models ─────────────────────────────

class Conversation(SQLModel, table=True):
    """A chat conversation within a project."""
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    title: str = "新對話"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Message(SQLModel, table=True):
    """A single message in a conversation."""
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(index=True)
    role: str        # "user" or "assistant"
    content: str = ""
    citations_json: str = "[]"   # JSON array of citation objects
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── Conversation helpers ──────────────────────────────────────

def create_conversation(project_id: int, title: str = "新對話") -> Conversation:
    with get_session() as session:
        conv = Conversation(project_id=project_id, title=title)
        session.add(conv)
        session.commit()
        session.refresh(conv)
        return conv


def list_conversations(project_id: int) -> list[Conversation]:
    with get_session() as session:
        stmt = (
            select(Conversation)
            .where(Conversation.project_id == project_id)
            .order_by(Conversation.updated_at.desc())  # type: ignore
        )
        return list(session.exec(stmt).all())


def get_conversation(conversation_id: int) -> Conversation | None:
    with get_session() as session:
        return session.get(Conversation, conversation_id)


def delete_conversation(conversation_id: int) -> bool:
    with get_session() as session:
        conv = session.get(Conversation, conversation_id)
        if not conv:
            return False
        # Delete all messages first
        msgs = session.exec(
            select(Message).where(Message.conversation_id == conversation_id)
        ).all()
        for m in msgs:
            session.delete(m)
        session.delete(conv)
        session.commit()
        return True


def update_conversation_title(conversation_id: int, title: str) -> Conversation | None:
    with get_session() as session:
        conv = session.get(Conversation, conversation_id)
        if not conv:
            return None
        conv.title = title
        conv.updated_at = datetime.now(timezone.utc).isoformat()
        session.add(conv)
        session.commit()
        session.refresh(conv)
        return conv


def touch_conversation(conversation_id: int) -> None:
    """Update the updated_at timestamp."""
    with get_session() as session:
        conv = session.get(Conversation, conversation_id)
        if conv:
            conv.updated_at = datetime.now(timezone.utc).isoformat()
            session.add(conv)
            session.commit()


# ── Message helpers ───────────────────────────────────────────

def add_message(
    conversation_id: int,
    role: str,
    content: str,
    citations_json: str = "[]",
) -> Message:
    with get_session() as session:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            citations_json=citations_json,
        )
        session.add(msg)
        session.commit()
        session.refresh(msg)
        return msg


def list_messages(conversation_id: int) -> list[Message]:
    with get_session() as session:
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())  # type: ignore
        )
        return list(session.exec(stmt).all())
