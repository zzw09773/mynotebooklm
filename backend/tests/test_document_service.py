"""
Unit tests for document_service helpers and upload endpoint.
"""
from unittest.mock import patch, MagicMock
from tests.conftest import auth_headers


# ── _sanitize_collection_name ─────────────────────────────────

def _sanitize(name: str) -> str:
    """Import lazily to avoid heavy dep loading."""
    with patch("app.services.document_service._get_chroma_client", return_value=MagicMock()):
        from app.services.document_service import _sanitize_collection_name
        return _sanitize_collection_name(name)


def test_sanitize_normal_name():
    assert _sanitize("my_document") == "my_document"


def test_sanitize_strips_leading_trailing_hyphens_underscores():
    result = _sanitize("__hello__")
    assert not result.startswith("_")
    assert not result.endswith("_")


def test_sanitize_removes_non_ascii_chars():
    result = _sanitize("報告文件2024")
    # All non-ASCII stripped → too short → falls back to hash
    assert len(result) >= 3


def test_sanitize_short_result_uses_hash():
    # "ab" → stripped → 2 chars → hash fallback
    result = _sanitize("ab")
    assert result.startswith("doc_")
    assert len(result) >= 8


def test_sanitize_long_name_truncated_to_63():
    long_name = "a" * 100
    result = _sanitize(long_name)
    assert len(result) <= 63


def test_sanitize_keeps_hyphens_and_underscores():
    result = _sanitize("my-doc_name")
    assert result == "my-doc_name"


def test_sanitize_removes_spaces():
    result = _sanitize("hello world doc")
    assert " " not in result


# ── Upload size validation (via HTTP endpoint) ─────────────────

def _make_project(client, token, name="TestProject") -> int:
    res = client.post("/api/projects/", json={"name": name}, headers=auth_headers(token))
    assert res.status_code == 200
    return res.json()["id"]


def test_upload_too_large_returns_413(client, token):
    project_id = _make_project(client, token)

    # Build a fake file > 50 MB
    big_content = b"x" * (51 * 1024 * 1024)

    with patch("app.routers.documents.save_uploaded_file", return_value="/tmp/fake.pdf"):
        res = client.post(
            f"/api/documents/upload?project_id={project_id}",
            files={"file": ("huge.pdf", big_content, "application/pdf")},
            headers=auth_headers(token),
        )
    assert res.status_code == 413


def test_upload_unsupported_type_returns_400(client, token):
    project_id = _make_project(client, token)

    small_content = b"fake content"
    res = client.post(
        f"/api/documents/upload?project_id={project_id}",
        files={"file": ("report.xlsx", small_content, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=auth_headers(token),
    )
    assert res.status_code == 400


def test_upload_requires_auth(client, token):
    project_id = _make_project(client, token)

    res = client.post(
        f"/api/documents/upload?project_id={project_id}",
        files={"file": ("report.pdf", b"data", "application/pdf")},
        # No auth header
    )
    assert res.status_code in (401, 403)
