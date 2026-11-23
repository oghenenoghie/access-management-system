import hashlib
import hmac
import logging
import os
import secrets
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .database import get_db
from .models import User

logger = logging.getLogger("estate.auth")

# APP_ENV=production turns the development conveniences below into hard errors.
APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"

# ---------------------------------------------------------------------------
# JWT signing key
# ---------------------------------------------------------------------------

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Keys that were committed to this public repository. Anyone can forge tokens
# signed with them, so they must never be used.
_PUBLISHED_KEYS = {
    "estate-gate-super-secret-jwt-key-2026",
    "estate-gate-production-secret-2026",
}

_DEV_SECRET_FILE = Path(__file__).resolve().parent.parent / ".jwt_secret"


def _load_secret_key() -> str:
    key = os.getenv("JWT_SECRET_KEY", "").strip()
    if key:
        problem = None
        if key in _PUBLISHED_KEYS:
            problem = "JWT_SECRET_KEY is a value published in this repository"
        elif len(key) < 32:
            problem = "JWT_SECRET_KEY is shorter than 32 characters"
        if problem:
            if IS_PRODUCTION:
                raise RuntimeError(f"{problem}. Set it to a long random value.")
            logger.warning("%s; use a long random value outside local development.", problem)
        return key

    if IS_PRODUCTION:
        raise RuntimeError(
            "JWT_SECRET_KEY is not set. Generate one with "
            "`python -c \"import secrets; print(secrets.token_urlsafe(48))\"` "
            "and set it in the server's environment."
        )

    # Development: a random key kept in backend/.jwt_secret (git-ignored) so
    # sign-ins survive restarts without anyone having to configure anything.
    try:
        if _DEV_SECRET_FILE.exists():
            stored = _DEV_SECRET_FILE.read_text(encoding="utf-8").strip()
            if len(stored) >= 32:
                return stored
        key = secrets.token_urlsafe(48)
        _DEV_SECRET_FILE.write_text(key, encoding="utf-8")
        logger.warning("JWT_SECRET_KEY not set; generated a development key in %s.", _DEV_SECRET_FILE)
        return key
    except OSError:
        logger.warning("JWT_SECRET_KEY not set; using a per-process key (sign-ins end when the server restarts).")
        return secrets.token_urlsafe(48)


SECRET_KEY = _load_secret_key()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ---------------------------------------------------------------------------
# Password hashing: PBKDF2-HMAC-SHA256 with a random salt per password,
# stored as "pbkdf2_sha256$<iterations>$<salt>$<hex digest>".
# ---------------------------------------------------------------------------

PASSWORD_SCHEME = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = max(100_000, int(os.getenv("PASSWORD_HASH_ITERATIONS", "310000")))

# Hashes created before per-password salts: one fixed salt for everyone.
_LEGACY_SALT = b"estate_salt_v1"
_LEGACY_ITERATIONS = 100_000


def _pbkdf2(password: str, salt: bytes, iterations: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations).hex()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = _pbkdf2(password, salt.encode("ascii"), PASSWORD_HASH_ITERATIONS)
    return f"{PASSWORD_SCHEME}${PASSWORD_HASH_ITERATIONS}${salt}${digest}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hashed_password.startswith(PASSWORD_SCHEME + "$"):
        try:
            _, iterations, salt, digest = hashed_password.split("$", 3)
            expected = _pbkdf2(plain_password, salt.encode("ascii"), int(iterations))
        except (ValueError, UnicodeEncodeError):
            return False
        return hmac.compare_digest(expected, digest)
    # Legacy fixed-salt hash; upgraded by the login route after a successful sign-in.
    return hmac.compare_digest(_pbkdf2(plain_password, _LEGACY_SALT, _LEGACY_ITERATIONS), hashed_password)


def password_needs_rehash(hashed_password: str) -> bool:
    if not hashed_password.startswith(PASSWORD_SCHEME + "$"):
        return True
    try:
        return int(hashed_password.split("$")[1]) < PASSWORD_HASH_ITERATIONS
    except (IndexError, ValueError):
        return True


_dummy_hash: Optional[str] = None


def dummy_password_hash() -> str:
    """A hash to check against when the account doesn't exist, so a failed
    sign-in takes the same time whether or not the email/phone is registered."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_hex(16))
    return _dummy_hash


# ---------------------------------------------------------------------------
# Failed-attempt limiting (per server process)
# ---------------------------------------------------------------------------


class FailureLimiter:
    """Locks a key (an account or client address) after too many failures in a
    time window. Kept in memory: it resets when the server restarts and isn't
    shared between multiple server processes."""

    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> List[float]:
        times = [t for t in self._failures.get(key, []) if now - t < self.window_seconds]
        if times:
            self._failures[key] = times
        else:
            self._failures.pop(key, None)
        return times

    def retry_after(self, key: str) -> int:
        """Seconds until the key may try again, or 0 if it isn't locked."""
        now = time.monotonic()
        with self._lock:
            times = self._recent(key, now)
            if len(times) < self.max_failures:
                return 0
            return max(1, int(self.window_seconds - (now - times[0])))

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._recent(key, now)
            self._failures.setdefault(key, []).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


# Number of reverse proxies in front of the app that append the client's address
# to X-Forwarded-For (Railway: 1). Entries further left are written by the
# client and can be faked, so only the one our own proxy added is trusted.
TRUSTED_PROXY_HOPS = max(0, int(os.getenv("TRUSTED_PROXY_HOPS", "0")))


def client_address(request) -> str:
    if TRUSTED_PROXY_HOPS:
        forwarded = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
        if len(forwarded) >= TRUSTED_PROXY_HOPS:
            return forwarded[-TRUSTED_PROXY_HOPS]
    return request.client.host if request.client else "unknown"


# 5 wrong passwords for one account, or 30 from one address, within 15 minutes.
login_failures_by_account = FailureLimiter(max_failures=5, window_seconds=15 * 60)
login_failures_by_address = FailureLimiter(max_failures=30, window_seconds=15 * 60)
# At most 5 recovery-code requests per email address per hour.
recovery_requests_by_email = FailureLimiter(max_failures=5, window_seconds=60 * 60)

# ---------------------------------------------------------------------------
# Tokens and role guards
# ---------------------------------------------------------------------------


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    if user.status in ("suspended", "deactivated", "pending"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is currently {user.status}. Please contact Estate Management.",
        )
    return user


def require_resident(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("resident", "admin"):
        raise HTTPException(status_code=403, detail="Resident privileges required")
    return current_user


def require_security(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("security", "admin"):
        raise HTTPException(status_code=403, detail="Security personnel privileges required")
    return current_user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Estate Management Administrator privileges required")
    return current_user
