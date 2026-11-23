"""Start-up data: demo data in development, the first administrator in production."""
import logging
import os

from sqlalchemy.orm import Session

from .auth import hash_password
from .models import AuditLog, User

logger = logging.getLogger("estate.bootstrap")

MIN_INITIAL_ADMIN_PASSWORD = 12


def ensure_initial_admin(db: Session) -> None:
    """Creates the first administrator from INITIAL_ADMIN_* settings when the
    database has none. The password is typed into the hosting provider's
    settings by the estate, so it never appears in code, logs or chat."""
    if db.query(User).filter(User.role == "admin").count():
        return

    email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("INITIAL_ADMIN_PASSWORD", "")
    if not email or not password:
        logger.warning(
            "No administrator account exists yet. Set INITIAL_ADMIN_EMAIL and "
            "INITIAL_ADMIN_PASSWORD, then restart the server to create one."
        )
        return
    if len(password) < MIN_INITIAL_ADMIN_PASSWORD:
        logger.error(
            "INITIAL_ADMIN_PASSWORD must be at least %d characters; no administrator was created.",
            MIN_INITIAL_ADMIN_PASSWORD,
        )
        return

    admin = User(
        full_name=os.getenv("INITIAL_ADMIN_NAME", "Estate Administrator").strip() or "Estate Administrator",
        email=email,
        phone=os.getenv("INITIAL_ADMIN_PHONE", "+0000000000").strip() or "+0000000000",
        password_hash=hash_password(password),
        role="admin",
        status="active",
    )
    db.add(admin)
    db.flush()
    db.add(
        AuditLog(
            actor_id=admin.id,
            actor_name=admin.full_name,
            actor_role="system",
            action="CREATE_INITIAL_ADMIN",
            target_type="User",
            target_id=email,
            details="Created the first administrator from INITIAL_ADMIN_* settings",
        )
    )
    db.commit()
    logger.warning(
        "Created the first administrator account (%s). Remove INITIAL_ADMIN_PASSWORD "
        "from the server's settings now.",
        email,
    )
