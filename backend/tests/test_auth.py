"""
Tests for authentication endpoints: register, login, /me.
"""


def test_register_success(client):
    res = client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
    assert res.status_code == 201
    data = res.json()
    assert "token" in data
    assert data["user"]["username"] == "alice"


def test_register_username_too_short(client):
    res = client.post("/api/auth/register", json={"username": "ab", "password": "password123"})
    assert res.status_code == 422


def test_register_password_too_short(client):
    res = client.post("/api/auth/register", json={"username": "alice", "password": "short"})
    assert res.status_code == 422


def test_register_duplicate_username(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
    res = client.post("/api/auth/register", json={"username": "alice", "password": "password456"})
    assert res.status_code == 409


def test_login_success(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
    res = client.post("/api/auth/login", json={"username": "alice", "password": "password123"})
    assert res.status_code == 200
    assert "token" in res.json()


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
    res = client.post("/api/auth/login", json={"username": "alice", "password": "wrongpassword"})
    assert res.status_code == 401


def test_login_unknown_user(client):
    res = client.post("/api/auth/login", json={"username": "nobody", "password": "password123"})
    assert res.status_code == 401


def test_me_no_token(client):
    res = client.get("/api/auth/me")
    assert res.status_code in (401, 403)  # HTTPBearer raises 401 or 403 when header is missing


def test_me_with_token(client, token):
    from tests.conftest import auth_headers
    res = client.get("/api/auth/me", headers=auth_headers(token))
    assert res.status_code == 200
    assert res.json()["username"] == "testuser"


def test_me_invalid_token(client):
    res = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"})
    assert res.status_code == 401
