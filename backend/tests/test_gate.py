from datetime import date

import pytest

from app.models import AccessCode
from tests.conftest import ADEWALE, OFFICER, headers_for

GATE = "Main North Gate"


@pytest.fixture
def officer(client):
    return headers_for(client, OFFICER)


@pytest.fixture
def resident(client):
    return headers_for(client, ADEWALE)


def verify(client, headers, code_or_qr):
    res = client.post("/api/security/verify", json={"code_or_qr": code_or_qr, "gate_name": GATE}, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def admit(client, headers, code, **extra):
    return client.post("/api/security/admit", json={"code": code, "gate_name": GATE, **extra}, headers=headers)


def create_pass(client, headers, **overrides):
    payload = {
        "visitor_name": "Test Visitor",
        "visitor_phone": "+2348000002001",
        "purpose": "Personal Visit",
        "code_type": "one_time",
        "arrival_date": date.today().isoformat(),
        "valid_hours": 12,
        "max_uses": 1,
        **overrides,
    }
    res = client.post("/api/residents/access-codes", json=payload, headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


# ---------- Verify ----------


def test_valid_seeded_code(client, officer):
    result = verify(client, officer, "482910")
    assert result["is_valid"] is True
    assert result["verification_status"] == "VALID"
    assert result["resident_name"] == "Engr. Adewale Banjo"


@pytest.mark.parametrize(
    "code, status",
    [("510293", "ALREADY_USED"), ("194822", "EXPIRED"), ("999999", "INVALID")],
)
def test_rejected_codes(client, officer, code, status):
    result = verify(client, officer, code)
    assert result["is_valid"] is False
    assert result["verification_status"] == status


def test_rejections_are_logged(client, officer):
    verify(client, officer, "194822")
    logs = client.get("/api/security/recent-logs", headers=officer).json()
    assert logs[0]["code_entered"] == "194822"
    assert logs[0]["action"] == "entry_rejected"


def test_scanned_qr_payload_verifies(client, officer, resident):
    new_pass = create_pass(client, resident)
    assert new_pass["qr_payload"].startswith(f"ESTATE-PASS|CODE:{new_pass['code']}|")
    assert verify(client, officer, new_pass["qr_payload"])["verification_status"] == "VALID"


# ---------- Admit & exit ----------


def test_one_time_code_is_used_up_by_admission(client, officer, db):
    res = admit(client, officer, "482910", vehicle_plate="LSR-482-KJ")
    assert res.status_code == 200
    log = res.json()
    assert log["action"] == "entry_granted"
    assert log["vehicle_plate"] == "LSR-482-KJ"

    db.expire_all()
    code = db.query(AccessCode).filter(AccessCode.code == "482910").one()
    assert (code.status, code.use_count) == ("used", 1)
    assert verify(client, officer, "482910")["verification_status"] == "ALREADY_USED"
    assert admit(client, officer, "482910").status_code == 400


def test_temporary_code_allows_its_remaining_uses(client, officer):
    # Seeded 739104: temporary, 1 of 4 uses already taken.
    for _ in range(3):
        assert admit(client, officer, "739104").status_code == 200
    assert admit(client, officer, "739104").status_code == 400
    assert verify(client, officer, "739104")["verification_status"] == "ALREADY_USED"


def test_admitted_visitor_is_inside_until_exit_is_recorded(client, officer):
    log_id = admit(client, officer, "482910").json()["id"]
    inside = client.get("/api/security/active-visitors", headers=officer).json()
    assert log_id in [v["id"] for v in inside]

    res = client.post(f"/api/security/exit/{log_id}", headers=officer)
    assert res.status_code == 200
    assert res.json()["exit_time"] is not None
    inside = client.get("/api/security/active-visitors", headers=officer).json()
    assert log_id not in [v["id"] for v in inside]
    assert client.post(f"/api/security/exit/{log_id}", headers=officer).status_code == 400


def test_resident_is_notified_of_admission(client, officer, resident):
    admit(client, officer, "482910")
    titles = [n["title"] for n in client.get("/api/residents/notifications", headers=resident).json()]
    assert "Visitor Admitted at Gate" in titles


# ---------- Resident passes ----------


def test_resident_cancelled_pass_is_rejected_at_the_gate(client, officer, resident):
    new_pass = create_pass(client, resident)
    res = client.post(f"/api/residents/access-codes/{new_pass['id']}/cancel", headers=resident)
    assert res.status_code == 200
    assert verify(client, officer, new_pass["code"])["verification_status"] == "CANCELLED"


def test_temporary_pass_needs_at_least_two_uses(client, resident):
    new_pass = create_pass(client, resident, code_type="temporary", max_uses=1)
    assert new_pass["max_uses"] == 2


@pytest.mark.parametrize("field, value", [("valid_hours", 0), ("valid_hours", 169), ("max_uses", 51)])
def test_pass_creation_validates_limits(client, resident, field, value):
    res = client.post(
        "/api/residents/access-codes",
        json={
            "visitor_name": "Test Visitor",
            "visitor_phone": "+2348000002001",
            "code_type": "temporary",
            "arrival_date": date.today().isoformat(),
            field: value,
        },
        headers=resident,
    )
    assert res.status_code == 422


def test_residents_cannot_use_the_gate_endpoints(client, resident):
    res = client.post("/api/security/verify", json={"code_or_qr": "482910"}, headers=resident)
    assert res.status_code == 403


def test_officers_cannot_create_passes(client, officer):
    res = client.post(
        "/api/residents/access-codes",
        json={"visitor_name": "X", "visitor_phone": "1", "arrival_date": date.today().isoformat()},
        headers=officer,
    )
    assert res.status_code == 403
