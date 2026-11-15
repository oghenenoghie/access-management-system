import random
import hashlib
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User, AccessCode, GateLog, Notification, AuditLog
from ..schemas import AccessCodeCreate, AccessCodeOut, GateLogOut, NotificationOut
from ..auth import require_resident

router = APIRouter(prefix="/api/residents", tags=["Residents Mobile App"])


def _generate_unique_code(db: Session) -> str:
    for _ in range(25):
        candidate = f"{random.randint(100000, 999999)}"
        exists = db.query(AccessCode).filter(AccessCode.code == candidate).first()
        if not exists:
            return candidate
    raise RuntimeError("Unable to generate unique access code")


def _format_code_out(ac: AccessCode) -> AccessCodeOut:
    unit_num = ac.unit.unit_number if ac.unit else "Unassigned Unit"
    res_name = ac.resident.full_name if ac.resident else "Resident"
    share_msg = (
        f"Hello {ac.visitor_name}, you have been granted visitor access to Royal Palms Estate "
        f"({unit_num}) by {res_name}.\n"
        f"🔑 Access Code: *{ac.code}*\n"
        f"📅 Valid Until: {ac.valid_until.strftime('%Y-%m-%d %H:%M')}\n"
        f"🎫 Type: {'One-Time Entry' if ac.code_type == 'one_time' else f'Temporary ({ac.max_uses} uses)'}\n"
        f"Please present this code or QR pass to Security at the Estate Gate."
    )
    return AccessCodeOut(
        id=ac.id,
        code=ac.code,
        qr_payload=ac.qr_payload,
        resident_id=ac.resident_id,
        resident_name=res_name,
        unit_number=unit_num,
        visitor_name=ac.visitor_name,
        visitor_phone=ac.visitor_phone,
        vehicle_plate=ac.vehicle_plate,
        purpose=ac.purpose,
        code_type=ac.code_type,
        arrival_date=ac.arrival_date,
        valid_from=ac.valid_from,
        valid_until=ac.valid_until,
        max_uses=ac.max_uses,
        use_count=ac.use_count,
        status=ac.status,
        created_at=ac.created_at,
        used_at=ac.used_at,
        share_message=share_msg,
    )


@router.post("/access-codes", response_model=AccessCodeOut)
def create_access_code(
    payload: AccessCodeCreate,
    current_user: User = Depends(require_resident),
    db: Session = Depends(get_db),
):
    if current_user.unit and current_user.unit.access_suspended:
        raise HTTPException(
            status_code=403,
            detail="Visitor code generation for your residential unit is currently suspended by Estate Management.",
        )

    code = _generate_unique_code(db)
    now = datetime.utcnow()
    valid_until = now + timedelta(hours=payload.valid_hours)
    max_uses = 1 if payload.code_type == "one_time" else max(2, payload.max_uses)

    sig = hashlib.sha256(f"{code}:{current_user.id}:{now.isoformat()}".encode()).hexdigest()[:12].upper()
    qr_payload = f"ESTATE-PASS|CODE:{code}|UNIT:{current_user.unit_id or 0}|SIG:{sig}"

    new_code = AccessCode(
        code=code,
        qr_payload=qr_payload,
        resident_id=current_user.id,
        unit_id=current_user.unit_id,
        visitor_name=payload.visitor_name.strip(),
        visitor_phone=payload.visitor_phone.strip(),
        visitor_Count=payload.visitor_count,
        vehicle_plate=payload.vehicle_plate.strip().upper() if payload.vehicle_plate else None,
        purpose=payload.purpose,
        code_type=payload.code_type,
        arrival_date=payload.arrival_date,
        valid_from=now,
        valid_until=valid_until,
        max_uses=max_uses,
        use_count=0,
        status="active",
    )
    db.add(new_code)
    db.add(
        AuditLog(
            actor_id=current_user.id,
            actor_name=current_user.full_name,
            actor_role=current_user.role,
            action="GENERATE_ACCESS_CODE",
            target_type="AccessCode",
            target_id=code,
            details=f"Generated {payload.code_type} code for visitor {payload.visitor_name} ({payload.visitor_phone})",
        )
    )
    db.commit()
    db.refresh(new_code)
    return _format_code_out(new_code)


@router.get("/access-codes", response_model=List[AccessCodeOut])
def list_my_access_codes(
    status_filter: Optional[str] = Query(None, description="Filter by active, used, expired, cancelled"),
    current_user: User = Depends(require_resident),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    # Auto-expire past codes
    active_codes = (
        db.query(AccessCode)
        .filter(AccessCode.resident_id == current_user.id, AccessCode.status == "active")
        .all()
    )
    for c in active_codes:
        if c.valid_until < now:
            c.status = "expired"
    db.commit()

    query = db.query(AccessCode).filter(AccessCode.resident_id == current_user.id)
    if status_filter:
        query = query.filter(AccessCode.status == status_filter)

    codes = query.order_by(AccessCode.created_at.desc()).all()
    return [_format_code_out(c) for c in codes]


@router.post("/access-codes/{code_id}/cancel", response_model=AccessCodeOut)
def cancel_access_code(
    code_id: int,
    current_user: User = Depends(require_resident),
    db: Session = Depends(get_db),
):
    ac = (
        db.query(AccessCode)
        .filter(AccessCode.id == code_id, AccessCode.resident_id == current_user.id)
        .first()
    )
    if not ac:
        raise HTTPException(status_code=404, detail="Access code not found.")
    if ac.status != "active":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel code because its status is already '{ac.status}'.",
        )

    ac.status = "cancelled"
    ac.cancelled_at = datetime.utcnow()
    db.add(
        AuditLog(
            actor_id=current_user.id,
            actor_name=current_user.full_name,
            actor_role=current_user.role,
            action="CANCEL_ACCESS_CODE",
            target_type="AccessCode",
            target_id=ac.code,
            details=f"Resident cancelled access code {ac.code} for {ac.visitor_name}",
        )
    )
    db.commit()
    db.refresh(ac)
    return _format_code_out(ac)


@router.get("/visitor-history", response_model=List[GateLogOut])
def get_my_visitor_history(
    current_user: User = Depends(require_resident),
    db: Session = Depends(get_db),
):
    my_code_ids = [
        c.id for c in db.query(AccessCode.id).filter(AccessCode.resident_id == current_user.id).all()
    ]
    if not my_code_ids:
        return []
    logs = (
        db.query(GateLog)
        .filter(GateLog.access_code_id.in_(my_code_ids))
        .order_by(GateLog.created_at.desc())
        .limit(100)
        .all()
    )
    return logs


@router.get("/notifications", response_model=List[NotificationOut])
def get_my_notifications(
    current_user: User = Depends(require_resident),
    db: Session = Depends(get_db),
):
    return (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(require_resident),
    db: Session = Depends(get_db),
):
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    return {"status": "ok"}
