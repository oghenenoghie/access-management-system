"""Test setup: every test gets a fresh copy of the seeded demo database.

The environment is configured before the app is imported, because the app reads
DATABASE_URL and JWT_SECRET_KEY at import time. Nothing here touches
backend/estate_access.db or backend/.jwt_secret.
"""
import os
import shutil
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="estate-tests-"))
_DB = _TMP / "test.db"
_TEMPLATE = _TMP / "seeded.db"

os.environ["DATABASE_URL"] = f"sqlite:///{_DB.as_posix()}"
os.environ["JWT_SECRET_KEY"] = "automated-tests-only-signing-key-0123456789abcdef"
os.environ["APP_ENV"] = "test"
os.environ["PASSWORD_HASH_ITERATIONS"] = "100000"  # the minimum; keeps tests quick

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import auth as auth_module  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402  (creates the tables)
from app.seed import seed_initial_data  # noqa: E402

DEMO_PASSWORDS = {
    "admin@royalpalmsestate.com": "Admin@123",
    "security.north@royalpalmsestate.com": "Security@123",
    "adewale.banjo@example.com": "Resident@123",
    "chioma.nwosu@example.com": "Resident@123",
    "tunde.bakare@example.com": "Resident@123",  # seeded as pending
}
ADMIN = "admin@royalpalmsestate.com"
OFFICER = "security.north@royalpalmsestate.com"
ADEWALE = "adewale.banjo@example.com"  # resident, Block A - Apt 101
CHIOMA = "chioma.nwosu@example.com"  # resident, Block B - Duplex 04
TUNDE = "tunde.bakare@example.com"  # pending resident


@pytest.fixture(scope="session", autouse=True)
def _seeded_template():
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    engine.dispose()
    shutil.copy(_DB, _TEMPLATE)
    yield
    engine.dispose()
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture
def client():
    engine.dispose()
    shutil.copy(_TEMPLATE, _DB)
    for limiter in (
        auth_module.login_failures_by_account,
        auth_module.login_failures_by_address,
        auth_module.recovery_requests_by_email,
    ):
        limiter._failures.clear()
    with TestClient(app) as test_client:
        yield test_client
    engine.dispose()


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def login(client, email, password=None):
    return client.post(
        "/api/auth/login",
        json={"identifier": email, "password": password or DEMO_PASSWORDS[email]},
    )


def token_for(client, email, password=None):
    res = login(client, email, password)
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def headers_for(client, email, password=None):
    return bearer(token_for(client, email, password))
