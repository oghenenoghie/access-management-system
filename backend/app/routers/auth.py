import hmac
import logging
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..models import User, Unit, AuditLog, Notification
from ..schemas import (
    LoginRequest,
    ResidentRegisterRequest,
    PasswordRecoveryRequest,
    PasswordResetConfirm,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    TokenResponse,
    UserOut,
)
from ..auth import (
    hash_password,
    verify_password,
    password_needs_rehash,
    dummy_password_hash,
    login_failures_by_account,
    login_failures_by_address,
    recovery_requests_by_email,
    client_address,
    create_access_token,
    get_current_user,
    IS_PRODUCTION,
)

logger = logging.getLogger("estate.auth")

router = APIRouter(prefix="/api/auth", tags=["Authentication & Profile"])

RECOVERY_CODE_TTL = timedelta(minutes=15)
RECOVERY_MAX_ATTEMPTS = 5


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    account_key = payload.identifier.lower().strip()
    address_key = client_address(request)
    wait = max(login_failures_by_account.retry_after(account_key), login_failures_by_address.retry_after(address_key))
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed sign-in attempts. Try again in {max(1, wait // 60)} minute(s).",
            headers={"Retry-After": str(wait)},
        )

    user = (
        db.query(User)
        .filter(
            or_(
                User.email == payload.identifier.lower().strip(),
                User.phone == payload.identifier.strip(),
            )
        )
        .first()
    )
    # Check a dummy hash for unknown accounts so timing doesn't reveal which exist.
    password_ok = verify_password(payload.password, user.password_hash if user else dummy_password_hash())
    if not user or not password_ok:
        login_failures_by_account.record_failure(account_key)
        login_failures_by_address.record_failure(address_key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/phone or password",
        )
    login_failures_by_account.reset(account_key)

    # Upgrade old fixed-salt (or weaker) hashes now that we have the password.
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
    if user.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is pending approval by Estate Management.",
        )
    if user.status in ("suspended", "deactivated"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your account is {user.status}. Please contact Estate Management.",
        )

    user.last_login = datetime.utcnow()
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, user=user)


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_resident(payload: ResidentRegisterRequest, db: Session = Depends(get_db)):
    # Verify estate-approved ID format (e.g., EST-XXXX or pre-registered ID)
    if not payload.estate_id_number.upper().startswith("EST-"):
        raise HTTPException(
            status_code=400,
            detail="Invalid Estate Identification Number. Must start with 'EST-' (e.g., EST-2026-009).",
        )

    existing = (
        db.query(User)
        .filter(
            or_(
                User.email == payload.email.lower().strip(),
                User.phone == payload.phone.strip(),
                User.estate_id_number == payload.estate_id_number.upper().strip(),
            )
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A resident with this email, phone, or Estate ID is already registered.",
        )

    unit = db.query(Unit).filter(Unit.unit_number == payload.unit_number.strip()).first()
    if not unit:
        unit = Unit(
            unit_number=payload.unit_number.strip(),
            block_name=payload.unit_number.split("-")[0].strip() if "-" in payload.unit_number else "Main Block",
            unit_type="Apartment",
            is_occupied=True,
        )
        db.add(unit)
        db.flush()

    new_user = User(
        full_name=payload.full_name.strip(),
        email=payload.email.lower().strip(),
        phone=payload.phone.strip(),
        password_hash=hash_password(payload.password),
        role="resident",
        # Anyone can call this endpoint, and an "EST-" prefix proves nothing, so a
        # new resident can't sign in or issue gate passes until Estate
        # Management approves the account in the admin dashboard.
        status="pending",
        estate_id_number=payload.estate_id_number.upper().strip(),
        unit_id=unit.id,
    )
    db.add(new_user)
    db.flush()

    db.add(
        Notification(
            user_id=new_user.id,
            title="Welcome to Estate Gate Access",
            message=(
                f"Your resident account for {unit.unit_number} (Estate ID {new_user.estate_id_number}) "
                "is waiting for approval by Estate Management."
            ),
            event_type="account_update",
        )
    )
    db.add(
        AuditLog(
            actor_id=new_user.id,
            actor_name=new_user.full_name,
            actor_role="resident",
            action="RESIDENT_SELF_REGISTRATION",
            target_type="User",
            target_id=str(new_user.id),
            details=f"Registered with Estate ID {new_user.estate_id_number} for unit {unit.unit_number}",
        )
    )
    db.commit()
    db.refresh(new_user)
    return new_user


def _deliver_recovery_code(user: User, code: str) -> None:
    # No email/SMS provider is configured yet. Never send the code in the API
    # response: anyone could then reset anyone's password.
    if IS_PRODUCTION:
        logger.warning(
            "Password recovery requested for user %s, but no email/SMS delivery is configured.", user.id
        )
    else:
        logger.warning(
            "DEVELOPMENT ONLY - password recovery code for %s: %s (valid %d minutes)",
            user.email,
            code,
            int(RECOVERY_CODE_TTL.total_seconds() // 60),
        )


@router.post("/password-recovery")
def request_password_recovery(payload: PasswordRecoveryRequest, db: Session = Depends(get_db)):
    # Same reply whether or not the email is registered, so this can't be used
    # to find out who has an account.
    reply = {"message": "If that email is registered, a 6-digit recovery code has been sent to it."}
    email = payload.email.lower().strip()
    if recovery_requests_by_email.retry_after(email):
        return reply
    recovery_requests_by_email.record_failure(email)

    user = db.query(User).filter(User.email == email).first()
    if not user or user.status == "deactivated":
        return reply

    code = f"{secrets.randbelow(900000) + 100000}"
    user.recovery_code = code
    user.recovery_expires_at = datetime.utcnow() + RECOVERY_CODE_TTL
    user.recovery_attempts = 0
    db.commit()
    _deliver_recovery_code(user, code)
    return reply


@router.post("/password-reset")
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    invalid = HTTPException(status_code=400, detail="Invalid or expired recovery code.")
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if (
        not user
        or not user.recovery_code
        or not user.recovery_expires_at
        or user.recovery_expires_at < datetime.utcnow()
    ):
        raise invalid

    if not hmac.compare_digest(user.recovery_code, payload.recovery_code.strip()):
        user.recovery_attempts = (user.recovery_attempts or 0) + 1
        if user.recovery_attempts >= RECOVERY_MAX_ATTEMPTS:
            # Too many guesses: the code is no longer usable; request a new one.
            user.recovery_code = None
            user.recovery_expires_at = None
        db.commit()
        raise invalid

    user.password_hash = hash_password(payload.new_password)
    user.recovery_code = None
    user.recovery_expires_at = None
    user.recovery_attempts = 0
    db.add(
        AuditLog(
            actor_id=user.id,
            actor_name=user.full_name,
            actor_role=user.role,
            action="PASSWORD_RESET",
            target_type="User",
            target_id=str(user.id),
            details="Password reset with a recovery code",
        )
    )
    db.commit()
    login_failures_by_account.reset(user.email)
    return {"message": "Password has been reset successfully. You may now log in."}


@router.post("/me/password")
def change_my_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=400, detail="Choose a new password that's different from the current one.")

    current_user.password_hash = hash_password(payload.new_password)
    db.add(
        AuditLog(
            actor_id=current_user.id,
            actor_name=current_user.full_name,
            actor_role=current_user.role,
            action="CHANGE_OWN_PASSWORD",
            target_type="User",
            target_id=str(current_user.id),
            details="Changed their own password",
        )
    )
    db.commit()
    return {"message": "Password changed."}


@router.get("/me", response_model=UserOut)
def get_my_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip()
    if payload.phone is not None:
        current_user.phone = payload.phone.strip()
    if payload.push_token is not None:
        current_user.push_token = payload.push_token.strip()

    db.commit()
    db.refresh(current_user)
    return current_user
