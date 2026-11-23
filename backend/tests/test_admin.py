from datetime import date

import pytest

from app.models import AccessCode, AuditLog, Unit, User
from tests.conftest import ADEWALE, ADMIN, CHIOMA, OFFICER, headers_for, login


@pytest.fixture
def admin(client):
    return headers_for(client, ADMIN)


@pytest.fixture
def officer(client):
    return headers_for(client, OFFICER)


def verify_status(client, officer, code):
    res = client.post("/api/security/verify", json={"code_or_qr": code}, headers=officer)
    assert res.status_code == 200, res.text
    return res.json()["verification_status"]


@pytest.mark.parametrize("email", [ADEWALE, OFFICER])
def test_admin_endpoints_need_the_admin_role(client, email):
    headers = headers_for(client, email)
    for path in ("/api/admin/overview", "/api/admin/users", "/api/admin/gate-logs", "/api/admin/audit-logs"):
        assert client.get(path, headers=headers).status_code == 403, path


def test_admin_endpoints_need_a_token(client):
    assert client.get("/api/admin/overview").status_code == 401


def test_overview_counts_seed_data(client, admin):
    metrics = client.get("/api/admin/overview", headers=admin).json()["metrics"]
    assert metrics["total_residents"] == 3
    assert metrics["pending_residents"] == 1
    assert metrics["security_officers"] == 2


def test_revoked_code_is_rejected_at_the_gate_and_audited(client, admin, officer, db):
    code = db.query(AccessCode).filter(AccessCode.code == "482910").one()
    res = client.post(f"/api/admin/access-codes/{code.id}/revoke", headers=admin)
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"
    assert verify_status(client, officer, "482910") == "CANCELLED"
    assert db.query(AuditLog).filter(AuditLog.action == "ADMIN_REVOKE_CODE").count() == 1


def test_suspending_a_resident_cancels_their_active_codes(client, admin, officer, db):
    adewale = db.query(User).filter(User.email == ADEWALE).one()
    res = client.patch(
        f"/api/admin/users/{adewale.id}/status",
        json={"status": "suspended", "reason": "Testing"},
        headers=admin,
    )
    assert res.status_code == 200
    db.expire_all()
    code = db.query(AccessCode).filter(AccessCode.code == "482910").one()
    assert code.status == "cancelled"
    assert verify_status(client, officer, "482910") in ("CANCELLED", "SUSPENDED_RESIDENT")
    assert login(client, ADEWALE).status_code == 403


def test_suspending_a_unit_rejects_its_codes(client, admin, officer, db):
    unit = db.query(Unit).filter(Unit.unit_number == "Block B - Duplex 04").one()  # Chioma's unit
    res = client.patch(f"/api/admin/units/{unit.id}/toggle-suspension", headers=admin)
    assert res.status_code == 200
    assert res.json()["access_suspended"] is True
    assert verify_status(client, officer, "739104") == "SUSPENDED_RESIDENT"

    # The resident can't issue new passes while the unit is suspended.
    res = client.post(
        "/api/residents/access-codes",
        json={"visitor_name": "X", "visitor_phone": "1", "arrival_date": date.today().isoformat()},
        headers=headers_for(client, CHIOMA),
    )
    assert res.status_code == 403

    # Restoring access makes the code valid again.
    client.patch(f"/api/admin/units/{unit.id}/toggle-suspension", headers=admin)
    assert verify_status(client, officer, "739104") == "VALID"


def test_creating_units(client, admin):
    payload = {"unit_number": "Block C - Apt 301", "block_name": "Block C", "unit_type": "Apartment"}
    assert client.post("/api/admin/units", json=payload, headers=admin).status_code == 200
    assert client.post("/api/admin/units", json=payload, headers=admin).status_code == 400


def test_created_officer_can_sign_in_and_be_deactivated(client, admin, db):
    payload = {
        "full_name": "New Officer",
        "email": "new.officer@example.com",
        "phone": "+2348000003001",
        "password": "Officer#2026",
        "role": "security",
        "estate_id_number": "EST-SEC-900",
    }
    res = client.post("/api/admin/users", json=payload, headers=admin)
    assert res.status_code == 200
    officer_id = res.json()["id"]
    assert login(client, payload["email"], payload["password"]).status_code == 200

    client.patch(f"/api/admin/users/{officer_id}/status", json={"status": "deactivated"}, headers=admin)
    assert login(client, payload["email"], payload["password"]).status_code == 403


def test_admin_created_accounts_need_a_valid_email_and_password(client, admin):
    base = {"full_name": "X", "email": "x@example.com", "phone": "+2348000003002", "password": "Officer#2026", "role": "security"}
    assert client.post("/api/admin/users", json=dict(base, email="not-an-email"), headers=admin).status_code == 422
    assert client.post("/api/admin/users", json=dict(base, password="short"), headers=admin).status_code == 422


def test_gate_log_search(client, admin, officer):
    client.post("/api/security/verify", json={"code_or_qr": "194822"}, headers=officer)
    logs = client.get("/api/admin/gate-logs", params={"search": "Grace", "action": "entry_rejected"}, headers=admin).json()
    assert logs and all(log["action"] == "entry_rejected" for log in logs)
    assert all("Grace" in (log["visitor_name"] or "") for log in logs)


def test_cors_only_allows_configured_origins(client):
    preflight = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}
    allowed = client.options("/api/auth/login", headers={**preflight, "Origin": "http://localhost:3000"})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"
    other = client.options("/api/auth/login", headers={**preflight, "Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in other.headers
