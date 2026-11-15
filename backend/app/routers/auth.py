import random
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..models import User, Unit, AuditLog, Notification
from ..schemas import (
    LoginRequest,
    ResidentRegisterRequest,
    PasswordRecoveryRequest,
    PasswordResetConfirm,
    ProfileUpdateRequest,
    TokenResponse,
    UserOut,
)
from ..auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication & Profile"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
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
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/phone or password",
        )
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
        status="active",  # Or 'pending' if manual admin approval is enforced; active for immediate onboarding with valid EST- ID
        estate_id_number=payload.estate_id_number.upper().strip(),
        unit_id=unit.id,
    )
    db.add(new_user)
    db.flush()

    db.add(
        Notification(
            user_id=new_user.id,
            title="Welcome to Estate Gate Access",
            message=f"Your resident account for {unit.unit_number} has been verified with Estate ID {new_user.estate_id_number}.",
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


@router.post("/password-recovery")
def request_password_recovery(payload: PasswordRecoveryRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user:
        return {"message": "If the email exists, a 6-digit recovery code has been sent."}

    code = f"{random.randint(100000, 999999)}"
    user.recovery_code = code
    db.commit()
    return {
        "message": "Recovery code generated and dispatched to your registered email/SMS.",
        "demo_recovery_code": code,
    }


@router.post("/password-reset")
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not user.recovery_code or user.recovery_code != payload.recovery_code.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired recovery code.")

    user.password_hash = hash_password(payload.new_password)
    user.recovery_code = None
    db.commit()
    return {"message": "Password has been reset successfully. You may now log in."}


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
