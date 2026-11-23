import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..models import User, Unit, AccessCode, GateLog, Notification, AuditLog
from ..schemas import (
    UserOut,
    UnitOut,
    UnitCreate,
    AdminUserCreate,
    UserStatusUpdate,
    AccessCodeOut,
    GateLogOut,
)
from ..auth import require_admin, hash_password, login_failures_by_account
from .residents import _format_code_out

router = APIRouter(prefix="/api/admin", tags=["Estate Management Administration"])


@router.get("/overview")
def get_dashboard_overview(
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_residents = db.query(User).filter(User.role == "resident").count()
    active_residents = db.query(User).filter(User.role == "resident", User.status == "active").count()
    pending_residents = db.query(User).filter(User.role == "resident", User.status == "pending").count()
    security_officers = db.query(User).filter(User.role == "security").count()
    total_units = db.query(Unit).count()

    active_codes = db.query(AccessCode).filter(AccessCode.status == "active").count()
    visitors_inside = (
        db.query(GateLog)
        .filter(GateLog.action == "entry_granted", GateLog.exit_time.is_(None))
        .count()
    )

    daily_entries = (
        db.query(GateLog)
        .filter(GateLog.created_at >= day_ago, GateLog.action.in_(["entry_granted", "exit_recorded"]))
        .count()
    )
    daily_rejections = (
        db.query(GateLog)
        .filter(GateLog.created_at >= day_ago, GateLog.action == "entry_rejected")
        .count()
    )
    weekly_entries = (
        db.query(GateLog)
        .filter(GateLog.created_at >= week_ago, GateLog.action.in_(["entry_granted", "exit_recorded"]))
        .count()
    )
    monthly_entries = (
        db.query(GateLog)
        .filter(GateLog.created_at >= month_ago, GateLog.action.in_(["entry_granted", "exit_recorded"]))
        .count()
    )

    return {
        "metrics": {
            "total_residents": total_residents,
            "active_residents": active_residents,
            "pending_residents": pending_residents,
            "security_officers": security_officers,
            "total_units": total_units,
            "active_codes": active_codes,
            "visitors_currently_inside": visitors_inside,
        },
        "reports_summary": {
            "daily_entries": daily_entries,
            "daily_rejections": daily_rejections,
            "weekly_entries": weekly_entries,
            "monthly_entries": monthly_entries,
        },
    }


# --- Resident & Security Personnel Account Management ---
@router.get("/users", response_model=List[UserOut])
def list_all_users(
    role: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    if status:
        query = query.filter(User.status == status)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(term),
                User.email.ilike(term),
                User.phone.ilike(term),
                User.estate_id_number.ilike(term),
            )
        )
    return query.order_by(User.created_at.desc()).all()


@router.post("/users", response_model=UserOut)
def create_user_account(
    payload: AdminUserCreate,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = (
        db.query(User)
        .filter(or_(User.email == payload.email.lower(), User.phone == payload.phone))
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email or phone already registered.")

    user = User(
        full_name=payload.full_name.strip(),
        email=payload.email.lower().strip(),
        phone=payload.phone.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        status=payload.status,
        estate_id_number=payload.estate_id_number,
        unit_id=payload.unit_id,
    )
    db.add(user)
    db.add(
        AuditLog(
            actor_id=current_admin.id,
            actor_name=current_admin.full_name,
            actor_role="admin",
            action=f"CREATE_{payload.role.upper()}_ACCOUNT",
            target_type="User",
            target_id=payload.email,
            details=f"Created {payload.role} account for {payload.full_name}",
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/status", response_model=UserOut)
def update_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    old_status = user.status
    user.status = payload.status

    # If resident is suspended or deactivated, automatically cancel their active visitor codes
    if payload.status in ("suspended", "deactivated"):
        active_codes = (
            db.query(AccessCode)
            .filter(AccessCode.resident_id == user.id, AccessCode.status == "active")
            .all()
        )
        for c in active_codes:
            c.status = "cancelled"
            c.cancelled_at = datetime.utcnow()

    db.add(
        Notification(
            user_id=user.id,
            title=f"Account Status Updated: {payload.status.upper()}",
            message=f"Estate Management updated your account status from {old_status} to {payload.status}. {payload.reason or ''}",
            event_type="account_update",
        )
    )
    db.add(
        AuditLog(
            actor_id=current_admin.id,
            actor_name=current_admin.full_name,
            actor_role="admin",
            action="UPDATE_USER_STATUS",
            target_type="User",
            target_id=str(user.id),
            details=f"Changed {user.full_name} status from {old_status} to {payload.status}. Reason: {payload.reason or 'N/A'}",
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Sets a one-time temporary password and returns it to the admin, who passes
    it on in person or by phone. Used while no email/SMS sender is configured."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Use Change password for your own account.")

    temporary_password = secrets.token_urlsafe(9)  # 12 characters
    user.password_hash = hash_password(temporary_password)
    user.recovery_code = None
    user.recovery_expires_at = None
    user.recovery_attempts = 0
    db.add(
        Notification(
            user_id=user.id,
            title="Password reset by Estate Management",
            message="Estate Management reset your password. Sign in with the temporary password they gave you, then change it.",
            event_type="account_update",
        )
    )
    db.add(
        AuditLog(
            actor_id=current_admin.id,
            actor_name=current_admin.full_name,
            actor_role="admin",
            action="ADMIN_RESET_PASSWORD",
            target_type="User",
            target_id=str(user.id),
            details=f"Reset the password for {user.full_name}",
        )
    )
    db.commit()
    login_failures_by_account.reset(user.email)  # also lift any sign-in lockout
    return {
        "temporary_password": temporary_password,
        "message": f"Give this temporary password to {user.full_name}. It won't be shown again.",
    }


# --- Residential Units & Apartment Management ---
@router.get("/units", response_model=List[UnitOut])
def list_units(
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(Unit).order_by(Unit.unit_number.asc()).all()


@router.post("/units", response_model=UnitOut)
def create_unit(
    payload: UnitCreate,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    exists = db.query(Unit).filter(Unit.unit_number == payload.unit_number.strip()).first()
    if exists:
        raise HTTPException(status_code=400, detail="Unit number already exists.")
    unit = Unit(
        unit_number=payload.unit_number.strip(),
        block_name=payload.block_name.strip(),
        street_address=payload.street_address,
        unit_type=payload.unit_type,
        is_occupied=True,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


@router.patch("/units/{unit_id}/toggle-suspension", response_model=UnitOut)
def toggle_unit_access_suspension(
    unit_id: int,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found.")
    unit.access_suspended = not unit.access_suspended
    db.add(
        AuditLog(
            actor_id=current_admin.id,
            actor_name=current_admin.full_name,
            actor_role="admin",
            action="TOGGLE_UNIT_SUSPENSION",
            target_type="Unit",
            target_id=unit.unit_number,
            details=f"Unit {unit.unit_number} access_suspended set to {unit.access_suspended}",
        )
    )
    db.commit()
    db.refresh(unit)
    return unit


# --- Access Codes & Gate Activity Monitoring ---
@router.get("/access-codes", response_model=List[AccessCodeOut])
def list_all_access_codes(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(AccessCode)
    if status:
        query = query.filter(AccessCode.status == status)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                AccessCode.code.ilike(term),
                AccessCode.visitor_name.ilike(term),
                AccessCode.visitor_phone.ilike(term),
            )
        )
    codes = query.order_by(AccessCode.created_at.desc()).limit(200).all()
    return [_format_code_out(c) for c in codes]


@router.post("/access-codes/{code_id}/revoke", response_model=AccessCodeOut)
def admin_revoke_access_code(
    code_id: int,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ac = db.query(AccessCode).filter(AccessCode.id == code_id).first()
    if not ac:
        raise HTTPException(status_code=404, detail="Access code not found.")
    ac.status = "cancelled"
    ac.cancelled_at = datetime.utcnow()
    db.add(
        AuditLog(
            actor_id=current_admin.id,
            actor_name=current_admin.full_name,
            actor_role="admin",
            action="ADMIN_REVOKE_CODE",
            target_type="AccessCode",
            target_id=ac.code,
            details=f"Admin revoked visitor code {ac.code} ({ac.visitor_name})",
        )
    )
    db.commit()
    db.refresh(ac)
    return _format_code_out(ac)


@router.get("/gate-logs", response_model=List[GateLogOut])
def search_gate_logs_and_investigations(
    period: Optional[str] = Query(None, description="daily, weekly, monthly, or all"),
    action: Optional[str] = Query(None, description="entry_granted, exit_recorded, entry_rejected"),
    search: Optional[str] = Query(None, description="Visitor name, phone, code, unit, or vehicle plate"),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(GateLog)
    now = datetime.utcnow()
    if period == "daily":
        query = query.filter(GateLog.created_at >= now - timedelta(days=1))
    elif period == "weekly":
        query = query.filter(GateLog.created_at >= now - timedelta(days=7))
    elif period == "monthly":
        query = query.filter(GateLog.created_at >= now - timedelta(days=30))

    if action:
        query = query.filter(GateLog.action == action)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                GateLog.code_entered.ilike(term),
                GateLog.visitor_name.ilike(term),
                GateLog.visitor_phone.ilike(term),
                GateLog.resident_name.ilike(term),
                GateLog.unit_number.ilike(term),
                GateLog.vehicle_plate.ilike(term),
            )
        )
    return query.order_by(GateLog.created_at.desc()).limit(300).all()


@router.get("/audit-logs")
def get_system_audit_logs(
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(100).all()
