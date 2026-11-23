import hashlib
from datetime import datetime, timedelta

import pytest
from jose import jwt

from app.models import User
from tests.conftest import ADEWALE, ADMIN, CHIOMA, OFFICER, TUNDE, bearer, headers_for, login, token_for


# ---------- Sign-in ----------


@pytest.mark.parametrize("email, role", [(ADMIN, "admin"), (OFFICER, "security"), (ADEWALE, "resident")])
def test_each_role_can_sign_in(client, email, role):
    res = login(client, email)
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == role
    assert body["access_token"]


def test_phone_number_also_signs_in(client):
    assert login(client, "+2348031112222", "Resident@123").status_code == 200


def test_wrong_password_is_refused(client):
    res = login(client, ADEWALE, "not-the-password")
    assert res.status_code == 401


def test_unknown_account_is_refused_like_a_wrong_password(client):
    unknown = login(client, "nobody@example.com", "whatever-password")
    wrong = login(client, ADEWALE, "not-the-password")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_pending_account_cannot_sign_in(client):
    res = login(client, TUNDE)
    assert res.status_code == 403
    assert "pending" in res.json()["detail"]


def test_suspended_account_cannot_sign_in_and_loses_its_session(client, db):
    resident_token = token_for(client, CHIOMA)
    chioma = db.query(User).filter(User.email == CHIOMA).one()
    res = client.patch(
        f"/api/admin/users/{chioma.id}/status",
        json={"status": "suspended", "reason": "test"},
        headers=headers_for(client, ADMIN),
    )
    assert res.status_code == 200
    assert login(client, CHIOMA).status_code == 403
    # A token issued before the suspension stops working immediately.
    assert client.get("/api/auth/me", headers=bearer(resident_token)).status_code == 403


# ---------- Lockout ----------


def test_account_locks_after_five_wrong_passwords(client):
    for _ in range(5):
        assert login(client, CHIOMA, "wrong-password").status_code == 401
    locked = login(client, CHIOMA)  # even the right password
    assert locked.status_code == 429
    assert int(locked.headers["retry-after"]) > 0
    # Other accounts are unaffected.
    assert login(client, ADEWALE).status_code == 200


def test_successful_sign_in_clears_earlier_failures(client):
    for _ in range(4):
        login(client, CHIOMA, "wrong-password")
    assert login(client, CHIOMA).status_code == 200
    for _ in range(4):
        assert login(client, CHIOMA, "wrong-password").status_code == 401
    assert login(client, CHIOMA).status_code == 200


# ---------- Password hashing ----------


def test_passwords_are_stored_with_a_salt_per_password(db, client):
    res = client.post(
        "/api/admin/users",
        json={
            "full_name": "Hash Check",
            "email": "hash.check@example.com",
            "phone": "+2348000001001",
            "password": "Same#Password1",
            "role": "security",
        },
        headers=headers_for(client, ADMIN),
    )
    assert res.status_code == 200
    stored = db.query(User).filter(User.email == "hash.check@example.com").one().password_hash
    assert stored.startswith("pbkdf2_sha256$")
    assert "Same#Password1" not in stored


def test_old_fixed_salt_hash_still_works_and_is_upgraded(client, db):
    legacy = hashlib.pbkdf2_hmac("sha256", b"Resident@123", b"estate_salt_v1", 100000).hex()
    user = db.query(User).filter(User.email == ADEWALE).one()
    user.password_hash = legacy
    db.commit()

    assert login(client, ADEWALE).status_code == 200
    db.expire_all()
    upgraded = db.query(User).filter(User.email == ADEWALE).one().password_hash
    assert upgraded.startswith("pbkdf2_sha256$")
    assert login(client, ADEWALE).status_code == 200


# ---------- Tokens ----------


@pytest.mark.parametrize(
    "published_key",
    ["estate-gate-super-secret-jwt-key-2026", "estate-gate-production-secret-2026"],
)
def test_tokens_signed_with_published_keys_are_rejected(client, published_key):
    forged = jwt.encode(
        {"sub": "1", "role": "admin", "exp": datetime.utcnow() + timedelta(hours=1)},
        published_key,
        algorithm="HS256",
    )
    assert client.get("/api/admin/overview", headers=bearer(forged)).status_code == 401


def test_garbage_token_is_rejected(client):
    assert client.get("/api/auth/me", headers=bearer("not-a-token")).status_code == 401


# ---------- Registration ----------

NEW_RESIDENT = {
    "full_name": "New Resident",
    "email": "new.resident@example.com",
    "phone": "+2348000001002",
    "password": "Register#2026",
    "estate_id_number": "EST-2026-900",
    "unit_number": "Block A - Apt 101",
}


def test_registration_waits_for_approval(client, db):
    res = client.post("/api/auth/register", json=NEW_RESIDENT)
    assert res.status_code == 201
    assert res.json()["status"] == "pending"
    assert login(client, NEW_RESIDENT["email"], NEW_RESIDENT["password"]).status_code == 403

    user = db.query(User).filter(User.email == NEW_RESIDENT["email"]).one()
    approve = client.patch(
        f"/api/admin/users/{user.id}/status",
        json={"status": "active"},
        headers=headers_for(client, ADMIN),
    )
    assert approve.status_code == 200
    assert login(client, NEW_RESIDENT["email"], NEW_RESIDENT["password"]).status_code == 200


@pytest.mark.parametrize("password", ["short", "x" * 129])
def test_registration_enforces_password_length(client, password):
    res = client.post("/api/auth/register", json=dict(NEW_RESIDENT, password=password))
    assert res.status_code == 422


def test_registration_rejects_duplicates(client):
    assert client.post("/api/auth/register", json=NEW_RESIDENT).status_code == 201
    assert client.post("/api/auth/register", json=NEW_RESIDENT).status_code == 400


# ---------- Password recovery ----------


def _request_code(client, db, email):
    res = client.post("/api/auth/password-recovery", json={"email": email})
    assert res.status_code == 200
    db.expire_all()
    return res.json(), db.query(User).filter(User.email == email).one().recovery_code


def _reset(client, email, code, new_password="NewPass#2026"):
    return client.post(
        "/api/auth/password-reset",
        json={"email": email, "recovery_code": code, "new_password": new_password},
    )


def test_recovery_never_returns_the_code(client, db):
    known, code = _request_code(client, db, ADEWALE)
    unknown = client.post("/api/auth/password-recovery", json={"email": "nobody@example.com"}).json()
    assert code is not None
    assert code not in str(known)
    assert known == unknown  # can't tell who has an account


def test_recovery_code_resets_the_password_once(client, db):
    _, code = _request_code(client, db, ADEWALE)
    assert _reset(client, ADEWALE, code).status_code == 200
    assert login(client, ADEWALE, "NewPass#2026").status_code == 200
    assert login(client, ADEWALE, "Resident@123").status_code == 401
    assert _reset(client, ADEWALE, code, "Another#2026").status_code == 400  # single use


def test_recovery_code_stops_working_after_five_wrong_tries(client, db):
    _, code = _request_code(client, db, ADEWALE)
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        assert _reset(client, ADEWALE, wrong).status_code == 400
    assert _reset(client, ADEWALE, code).status_code == 400


def test_expired_recovery_code_is_refused(client, db):
    _, code = _request_code(client, db, ADEWALE)
    user = db.query(User).filter(User.email == ADEWALE).one()
    user.recovery_expires_at = datetime.utcnow() - timedelta(minutes=1)
    db.commit()
    assert _reset(client, ADEWALE, code).status_code == 400


def test_password_reset_enforces_password_length(client, db):
    _, code = _request_code(client, db, ADEWALE)
    assert _reset(client, ADEWALE, code, "short").status_code == 422


def test_recovery_requests_are_rate_limited_per_email(client, db):
    codes = [_request_code(client, db, ADEWALE)[1] for _ in range(5)]
    assert all(codes)
    # The 6th request in the hour gets the same reply but doesn't issue a new code.
    _, sixth = _request_code(client, db, ADEWALE)
    assert sixth == codes[-1]
