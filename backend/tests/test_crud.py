"""
Integration tests for project and conversation CRUD endpoints.
"""
from tests.conftest import auth_headers


# ── Project CRUD ──────────────────────────────────────────────

def test_create_project(client, token):
    res = client.post(
        "/api/projects/",
        json={"name": "My Project", "description": "A test project"},
        headers=auth_headers(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "My Project"
    assert data["description"] == "A test project"
    assert "id" in data
    assert "created_at" in data


def test_list_projects_empty(client, token):
    res = client.get("/api/projects/", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["projects"] == []


def test_list_projects_after_create(client, token):
    client.post("/api/projects/", json={"name": "P1"}, headers=auth_headers(token))
    client.post("/api/projects/", json={"name": "P2"}, headers=auth_headers(token))
    res = client.get("/api/projects/", headers=auth_headers(token))
    assert res.status_code == 200
    names = [p["name"] for p in res.json()["projects"]]
    assert "P1" in names
    assert "P2" in names


def test_get_project(client, token):
    create_res = client.post("/api/projects/", json={"name": "Readable"}, headers=auth_headers(token))
    project_id = create_res.json()["id"]

    res = client.get(f"/api/projects/{project_id}", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["name"] == "Readable"


def test_get_nonexistent_project(client, token):
    res = client.get("/api/projects/999999", headers=auth_headers(token))
    assert res.status_code == 404


def test_update_project(client, token):
    create_res = client.post("/api/projects/", json={"name": "Old name"}, headers=auth_headers(token))
    project_id = create_res.json()["id"]

    res = client.put(
        f"/api/projects/{project_id}",
        json={"name": "New name", "description": "Updated"},
        headers=auth_headers(token),
    )
    assert res.status_code == 200
    assert res.json()["name"] == "New name"
    assert res.json()["description"] == "Updated"


def test_delete_project(client, token):
    create_res = client.post("/api/projects/", json={"name": "To delete"}, headers=auth_headers(token))
    project_id = create_res.json()["id"]

    del_res = client.delete(f"/api/projects/{project_id}", headers=auth_headers(token))
    assert del_res.status_code == 200

    get_res = client.get(f"/api/projects/{project_id}", headers=auth_headers(token))
    assert get_res.status_code == 404


def test_project_requires_auth(client):
    res = client.get("/api/projects/")
    assert res.status_code in (401, 403)


# ── Conversation CRUD ─────────────────────────────────────────

def _make_project(client, token, name="Test Project") -> int:
    res = client.post("/api/projects/", json={"name": name}, headers=auth_headers(token))
    assert res.status_code == 200
    return res.json()["id"]


def test_create_conversation(client, token):
    project_id = _make_project(client, token)

    res = client.post(
        "/api/conversations/",
        json={"project_id": project_id, "title": "Chat 1"},
        headers=auth_headers(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["title"] == "Chat 1"
    assert "id" in data


def test_list_conversations(client, token):
    project_id = _make_project(client, token)
    client.post("/api/conversations/", json={"project_id": project_id, "title": "C1"}, headers=auth_headers(token))
    client.post("/api/conversations/", json={"project_id": project_id, "title": "C2"}, headers=auth_headers(token))

    res = client.get(f"/api/conversations/?project_id={project_id}", headers=auth_headers(token))
    assert res.status_code == 200
    titles = [c["title"] for c in res.json()["conversations"]]
    assert "C1" in titles
    assert "C2" in titles


def test_get_conversation_history_empty(client, token):
    project_id = _make_project(client, token)
    conv_res = client.post(
        "/api/conversations/",
        json={"project_id": project_id, "title": "Empty chat"},
        headers=auth_headers(token),
    )
    conv_id = conv_res.json()["id"]

    res = client.get(f"/api/conversations/{conv_id}/messages", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["messages"] == []


def test_delete_conversation(client, token):
    project_id = _make_project(client, token)
    conv_res = client.post(
        "/api/conversations/",
        json={"project_id": project_id, "title": "Delete me"},
        headers=auth_headers(token),
    )
    conv_id = conv_res.json()["id"]

    del_res = client.delete(f"/api/conversations/{conv_id}", headers=auth_headers(token))
    assert del_res.status_code == 200

    # Conversation should no longer appear in the list
    list_res = client.get(f"/api/conversations/?project_id={project_id}", headers=auth_headers(token))
    ids = [c["id"] for c in list_res.json()["conversations"]]
    assert conv_id not in ids
