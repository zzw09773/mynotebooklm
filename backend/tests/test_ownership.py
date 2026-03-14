"""
IDOR (Insecure Direct Object Reference) protection tests.
Verifies that User A cannot access or modify User B's resources.
"""
from tests.conftest import auth_headers


# ── Project ownership ─────────────────────────────────────────

def test_user_b_cannot_get_user_a_project(client, token, token_b):
    # User A creates a project
    res = client.post("/api/projects/", json={"name": "Alice's project"}, headers=auth_headers(token))
    assert res.status_code == 200
    project_id = res.json()["id"]

    # User B tries to read it
    res = client.get(f"/api/projects/{project_id}", headers=auth_headers(token_b))
    assert res.status_code == 403


def test_user_b_cannot_update_user_a_project(client, token, token_b):
    res = client.post("/api/projects/", json={"name": "Alice's project"}, headers=auth_headers(token))
    project_id = res.json()["id"]

    res = client.put(
        f"/api/projects/{project_id}",
        json={"name": "Hijacked"},
        headers=auth_headers(token_b),
    )
    assert res.status_code == 403


def test_user_b_cannot_delete_user_a_project(client, token, token_b):
    res = client.post("/api/projects/", json={"name": "Alice's project"}, headers=auth_headers(token))
    project_id = res.json()["id"]

    res = client.delete(f"/api/projects/{project_id}", headers=auth_headers(token_b))
    assert res.status_code == 403


def test_project_list_only_shows_own_projects(client, token, token_b):
    client.post("/api/projects/", json={"name": "Alice project 1"}, headers=auth_headers(token))
    client.post("/api/projects/", json={"name": "Alice project 2"}, headers=auth_headers(token))
    client.post("/api/projects/", json={"name": "Bob project 1"}, headers=auth_headers(token_b))

    res = client.get("/api/projects/", headers=auth_headers(token))
    assert res.status_code == 200
    names = [p["name"] for p in res.json()["projects"]]
    assert "Alice project 1" in names
    assert "Alice project 2" in names
    assert "Bob project 1" not in names


# ── Conversation ownership ────────────────────────────────────

def _create_project_and_conversation(client, token):
    """Helper: create a project and a conversation, return (project_id, conv_id)."""
    project_res = client.post(
        "/api/projects/",
        json={"name": "Shared-test project"},
        headers=auth_headers(token),
    )
    assert project_res.status_code == 200
    project_id = project_res.json()["id"]

    conv_res = client.post(
        "/api/conversations/",
        json={"project_id": project_id, "title": "My chat"},
        headers=auth_headers(token),
    )
    assert conv_res.status_code == 200
    conv_id = conv_res.json()["id"]
    return project_id, conv_id


def test_user_b_cannot_list_user_a_conversations(client, token, token_b):
    project_id, _ = _create_project_and_conversation(client, token)

    res = client.get(
        f"/api/conversations/?project_id={project_id}",
        headers=auth_headers(token_b),
    )
    assert res.status_code == 403


def test_user_b_cannot_delete_user_a_conversation(client, token, token_b):
    project_id, conv_id = _create_project_and_conversation(client, token)

    res = client.delete(
        f"/api/conversations/{conv_id}",
        headers=auth_headers(token_b),
    )
    assert res.status_code == 403


def test_user_b_cannot_get_user_a_conversation_history(client, token, token_b):
    project_id, conv_id = _create_project_and_conversation(client, token)

    res = client.get(
        f"/api/conversations/{conv_id}/messages",
        headers=auth_headers(token_b),
    )
    assert res.status_code == 403
