"""Password resets, password changes and production start-up behaviour."""
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import auth as auth_module
from app.bootstrap import ensure_initial_admin
from app.models import AuditLog, Notification, User
from tests.conftest import ADEWALE, ADMIN, CHIOMA, OFFICER, bearer, headers_for, login, token_for

BACKEND = Path(__file__).resolve().parents[1]


def _user(db, email):
    db.expire_all()
    return db.query(User).filter(User.email == email).one()


# ---------- Admin password reset ----------


def test_admin_reset_gives_a_working_temporary_password(client, db):
    chioma = _user(db, CHIOMA)
    res = client.post(f"/api/admin/users/{chioma.id}/reset-password", headers=headers_for(client, ADMIN))
    assert res.status_code == 200
    temporary = res.json()["temporary_password"]
    assert len(temporary) >= 12

    assert login(client, CHIOMA, temporary).status_code == 200
    assert login(client, CHIOMA, "Resident@123").status_code == 401
    assert db.query(AuditLog).filter(AuditLog.action == "ADMIN_RESET_PASSWORD").count() == 1
    titles = [n.title for n in db.query(Notification).filter(Notification.user_id == chioma.id)]
    assert "Password reset by Estate Management" in titles


def test_admin_reset_lifts_a_sign_in_lockout(client, db):
    for _ in range(5):
        login(client, CHIOMA, "wrong-password")
    assert login(client, CHIOMA).status_code == 429
    chioma = _user(db, CHIOMA)
    temporary = client.post(
        f"/api/admin/users/{chioma.id}/reset-password", headers=headers_for(client, ADMIN)
    ).json()["temporary_password"]
    assert login(client, CHIOMA, temporary).status_code == 200


@pytest.mark.parametrize("email", [ADEWALE, OFFICER])
def test_only_admins_can_reset_passwords(client, db, email):
    target = _user(db, CHIOMA)
    res = client.post(f"/api/admin/users/{target.id}/reset-password", headers=headers_for(client, email))
    assert res.status_code == 403


def test_admin_cannot_reset_their_own_password(client, db):
    admin = _user(db, ADMIN)
    res = client.post(f"/api/admin/users/{admin.id}/reset-password", headers=headers_for(client, ADMIN))
    assert res.status_code == 400


def test_reset_of_unknown_user_is_404(client):
    assert client.post("/api/admin/users/99999/reset-password", headers=headers_for(client, ADMIN)).status_code == 404


# ---------- Change own password ----------


def _change(client, token, current, new):
    return client.post(
        "/api/auth/me/password",
        json={"current_password": current, "new_password": new},
        headers=bearer(token),
    )


def test_user_can_change_their_password(client):
    token = token_for(client, ADEWALE)
    assert _change(client, token, "Resident@123", "Changed#2026").status_code == 200
    assert login(client, ADEWALE, "Changed#2026").status_code == 200
    assert login(client, ADEWALE, "Resident@123").status_code == 401


def test_change_password_checks_the_current_password(client):
    token = token_for(client, ADEWALE)
    assert _change(client, token, "wrong-current", "Changed#2026").status_code == 400
    assert login(client, ADEWALE).status_code == 200


def test_change_password_rejects_same_or_short_passwords(client):
    token = token_for(client, ADEWALE)
    assert _change(client, token, "Resident@123", "Resident@123").status_code == 400
    assert _change(client, token, "Resident@123", "short").status_code == 422


def test_change_password_needs_a_session(client):
    res = client.post("/api/auth/me/password", json={"current_password": "x", "new_password": "Changed#2026"})
    assert res.status_code == 401


# ---------- Client address behind a proxy ----------


def _request(peer, forwarded=None):
    headers = {"x-forwarded-for": forwarded} if forwarded else {}
    return SimpleNamespace(client=SimpleNamespace(host=peer), headers=headers)


def test_client_address_ignores_forwarded_header_without_a_trusted_proxy(monkeypatch):
    monkeypatch.setattr(auth_module, "TRUSTED_PROXY_HOPS", 0)
    assert auth_module.client_address(_request("10.0.0.5", "6.6.6.6")) == "10.0.0.5"


def test_client_address_uses_the_entry_added_by_our_proxy(monkeypatch):
    monkeypatch.setattr(auth_module, "TRUSTED_PROXY_HOPS", 1)
    # The client can write anything to the left; the proxy appends the real address.
    assert auth_module.client_address(_request("10.0.0.5", "6.6.6.6, 203.0.113.7")) == "203.0.113.7"
    assert auth_module.client_address(_request("10.0.0.5", "203.0.113.7")) == "203.0.113.7"
    assert auth_module.client_address(_request("10.0.0.5")) == "10.0.0.5"


# ---------- First administrator in production ----------


@pytest.fixture
def no_admin(client, db):
    """Simulates a fresh production database by demoting the seeded admin."""
    admin = _user(db, ADMIN)
    admin.role = "security"
    db.commit()
    return db


def test_initial_admin_needs_both_settings(no_admin, monkeypatch):
    monkeypatch.delenv("INITIAL_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("INITIAL_ADMIN_PASSWORD", raising=False)
    ensure_initial_admin(no_admin)
    assert no_admin.query(User).filter(User.role == "admin").count() == 0


def test_initial_admin_needs_a_long_password(no_admin, monkeypatch):
    monkeypatch.setenv("INITIAL_ADMIN_EMAIL", "first.admin@example.com")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "short-pass")
    ensure_initial_admin(no_admin)
    assert no_admin.query(User).filter(User.role == "admin").count() == 0


def test_initial_admin_is_created_once_and_can_sign_in(no_admin, client, monkeypatch):
    monkeypatch.setenv("INITIAL_ADMIN_EMAIL", "First.Admin@Example.com")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "Long-Initial#Password1")
    monkeypatch.setenv("INITIAL_ADMIN_PHONE", "+2348000009999")
    ensure_initial_admin(no_admin)
    ensure_initial_admin(no_admin)  # second start: no duplicate
    admins = no_admin.query(User).filter(User.role == "admin").all()
    assert [a.email for a in admins] == ["first.admin@example.com"]
    assert login(client, "first.admin@example.com", "Long-Initial#Password1").status_code == 200
    assert no_admin.query(AuditLog).filter(AuditLog.action == "CREATE_INITIAL_ADMIN").count() == 1


def test_production_refuses_to_start_on_sqlite():
    env = dict(
        os.environ,
        APP_ENV="production",
        JWT_SECRET_KEY="a-long-random-production-key-for-this-test-only-123",
        DATABASE_URL="sqlite:///./should-not-be-created.db",
    )
    result = subprocess.run(
        [sys.executable, "-c", "import app.main"], cwd=BACKEND, env=env, capture_output=True, text=True
    )
    assert result.returncode != 0
    assert "PostgreSQL" in result.stderr
    assert not (BACKEND / "should-not-be-created.db").exists()
