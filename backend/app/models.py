"""
Project database models using SQLModel (SQLite).
"""
import logging
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

class User(SQLModel, table=True):
    """A registered user."""
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Project(SQLModel, table=True):
    """A workspace that groups documents and conversations together."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(default=0, index=True)
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
    # Migrate: add new columns to existing tables
    _run_migrations()

def _run_migrations():
    """Add new columns to existing tables if they don't exist (SQLite)."""
    import sqlite3
    conn = sqlite3.connect(_DB_PATH)
    try:
        cursor = conn.cursor()

        # Migrate ProjectDocument
        cursor.execute("PRAGMA table_info(projectdocument)")
        pd_cols = {row[1] for row in cursor.fetchall()}
        if pd_cols:  # table exists
            if "status" not in pd_cols:
                cursor.execute("ALTER TABLE projectdocument ADD COLUMN status TEXT DEFAULT 'ready'")
            if "error_message" not in pd_cols:
                cursor.execute("ALTER TABLE projectdocument ADD COLUMN error_message TEXT DEFAULT ''")

        # Migrate Project – add user_id
        cursor.execute("PRAGMA table_info(project)")
        proj_cols = {row[1] for row in cursor.fetchall()}
        if proj_cols and "user_id" not in proj_cols:
            cursor.execute("ALTER TABLE project ADD COLUMN user_id INTEGER DEFAULT 0")

        conn.commit()
    except sqlite3.OperationalError as e:
        logging.warning("Migration warning: %s", e)
    finally:
        conn.close()


def get_session() -> Session:
    return Session(_engine)


# ── User CRUD ────────────────────────────────────────────────

def create_user(username: str, password_hash: str) -> User:
    with get_session() as session:
        user = User(username=username, password_hash=password_hash)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


def get_user_by_username(username: str) -> User | None:
    with get_session() as session:
        stmt = select(User).where(User.username == username)
        return session.exec(stmt).first()


def get_user_by_id(user_id: int) -> User | None:
    with get_session() as session:
        return session.get(User, user_id)


# ── Project CRUD ──────────────────────────────────────────────

def create_project(name: str, description: str = "", user_id: int = 0) -> Project:
    with get_session() as session:
        project = Project(name=name, description=description, user_id=user_id)
        session.add(project)
        session.commit()
        session.refresh(project)
        return project


def list_projects(user_id: int | None = None) -> list[Project]:
    with get_session() as session:
        stmt = select(Project).order_by(Project.updated_at.desc())
        if user_id is not None:
            stmt = stmt.where(Project.user_id == user_id)
        return list(session.exec(stmt).all())


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
        # Delete studio artifacts
        artifacts = session.exec(
            select(StudioArtifact).where(StudioArtifact.project_id == project_id)
        ).all()
        for a in artifacts:
            session.delete(a)
        # Delete conversations and their messages
        conversations = session.exec(
            select(Conversation).where(Conversation.project_id == project_id)
        ).all()
        for conv in conversations:
            msgs = session.exec(
                select(Message).where(Message.conversation_id == conv.id)
            ).all()
            for msg in msgs:
                session.delete(msg)
            session.delete(conv)
        session.delete(project)
        session.commit()

    # Clean up ChromaDB collections and uploaded files outside session
    from app.services.document_service import delete_document
    for collection_name, file_path in doc_info:
        try:
            delete_document(collection_name, file_path=file_path)
        except Exception:
            logging.exception("Failed to cleanup document: %s", collection_name)
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


# ── StudioArtifact model & helpers ────────────────────────────

STUDIO_ARTIFACT_TYPES = frozenset({
    "podcast", "slides", "video_script", "mindmap",
    "report", "flashcards", "quiz", "infographic", "datatable",
})


class StudioArtifact(SQLModel, table=True):
    """Stores an LLM-generated studio artifact for a project."""
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(index=True)
    artifact_type: str = Field(index=True)   # one of STUDIO_ARTIFACT_TYPES
    status: str = "pending"     # pending | generating | done | error
    content_json: str = "{}"    # structured JSON output
    content_text: str = ""      # plain-text output (for copy)
    error_message: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def create_studio_artifact(project_id: int, artifact_type: str) -> StudioArtifact:
    with get_session() as session:
        artifact = StudioArtifact(project_id=project_id, artifact_type=artifact_type)
        session.add(artifact)
        session.commit()
        session.refresh(artifact)
        return artifact


def get_studio_artifact(project_id: int, artifact_type: str) -> StudioArtifact | None:
    with get_session() as session:
        stmt = select(StudioArtifact).where(
            StudioArtifact.project_id == project_id,
            StudioArtifact.artifact_type == artifact_type,
        )
        return session.exec(stmt).first()


def update_studio_artifact(
    artifact_id: int,
    *,
    status: str | None = None,
    content_json: str | None = None,
    content_text: str | None = None,
    error_message: str | None = None,
) -> StudioArtifact | None:
    with get_session() as session:
        artifact = session.get(StudioArtifact, artifact_id)
        if not artifact:
            return None
        if status is not None:
            artifact.status = status
        if content_json is not None:
            artifact.content_json = content_json
        if content_text is not None:
            artifact.content_text = content_text
        if error_message is not None:
            artifact.error_message = error_message
        artifact.updated_at = datetime.now(timezone.utc).isoformat()
        session.add(artifact)
        session.commit()
        session.refresh(artifact)
        return artifact


def list_studio_artifacts(project_id: int) -> list[StudioArtifact]:
    with get_session() as session:
        stmt = select(StudioArtifact).where(StudioArtifact.project_id == project_id)
        return list(session.exec(stmt).all())
