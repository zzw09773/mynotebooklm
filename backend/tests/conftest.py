"""
Shared pytest fixtures for NotebookLM backend tests.
"""
import os
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, create_engine, Session

# ── Use in-memory SQLite for tests ────────────────────────────
# StaticPool ensures every Session() reuses the same connection, so tables
# created by create_all() are visible to all subsequent sessions.
TEST_DB_URL = "sqlite:///:memory:"

# Patch DB engine before importing app modules
import app.models as models_module

_test_engine = create_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@pytest.fixture(autouse=True)
def fresh_db():
    """Create all tables before each test, drop after."""
    SQLModel.metadata.create_all(_test_engine)
    original_engine = models_module._engine
    models_module._engine = _test_engine
    yield
    models_module._engine = original_engine
    SQLModel.metadata.drop_all(_test_engine)


@pytest.fixture
def client():
    """FastAPI test client with LLM/ChromaDB mocked out."""
    with (
        patch("app.services.llm_service.configure_llama_index", return_value=None),
        patch("app.models.init_db", return_value=None),
        patch("app.services.document_service._get_chroma_client", return_value=MagicMock()),
    ):
        from app.main import app
        with TestClient(app, raise_server_exceptions=True) as c:
            yield c


# ── Auth helpers ────────────────────────────────────────────

def register_and_login(client: TestClient, username: str = "testuser", password: str = "testpassword") -> str:
    """Register a user and return the JWT token."""
    res = client.post("/api/auth/register", json={"username": username, "password": password})
    assert res.status_code == 201, res.text
    return res.json()["token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def token(client):
    return register_and_login(client)


@pytest.fixture
def token_b(client):
    return register_and_login(client, username="otheruser", password="otherpassword")
