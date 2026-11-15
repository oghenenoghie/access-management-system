from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from ..database import get_db
from ..models import User, AccessCode, GateLog, Notification, AuditLog
from ..schemas import (
    GateVerifyRequest,
    GateVerifyResponse,
    GateActionRequest,
    GateLogOut,
)
from ..auth import require_security
from .residents import _format_code_out

router = APIRouter(prefix="/api/security", tags=["Security Gate Interface"])


def _extract_code(raw: str) -> str:
    cleaned = raw.strip()
    if "CODE:" in cleaned:
        for part in cleaned.split("|"):
            if part.startswith("CODE:"):
                return part.replace("CODE:", "").strip()
    return cleaned


@router.post("/verify", response_model=GateVerifyResponse)
def verify_visitor_code(
    payload: GateVerifyRequest,
    current_officer: User = Depends(require_security),
    db: Session = Depends(get_db),
):
    code_str = _extract_code(payload.code_or_qr)
    ac = (
        db.query(AccessCode)
        .filter(
            or_(
                AccessCode.code == code_str,
                AccessCode.qr_payload == payload.code_or_qr.strip(),
            )
        )
        .first()
    )

    now = datetime.utcnow()

    if not ac:
        # Log rejected unknown code attempt
        db.add(
            GateLog(
                code_entered=code_str[:20],
                security_officer_id=current_officer.id,
                security_officer_name=current_officer.full_name,
                action="entry_rejected",
                rejection_reason="Invalid / Unrecognized Access Code",
                gate_name=payload.gate_name,
            )
        )
        db.commit()
        return GateVerifyResponse(
            is_valid=False,
            verification_status="INVALID",
            message="Access Code not found in Estate Database. Entry Denied.",
        )

    resident = ac.resident
    unit_number = ac.unit.unit_number if ac.unit else "Unassigned"

    # Check if resident or unit is suspended
    if resident.status != "active" or (ac.unit and ac.unit.access_suspended):
        reason = "Authorising resident or unit access privileges are suspended"
        db.add(
            GateLog(
                access_code_id=ac.id,
                code_entered=ac.code,
                visitor_name=ac.visitor_name,
                visitor_phone=ac.visitor_phone,
                resident_name=resident.full_name,
                unit_number=unit_number,
                security_officer_id=current_officer.id,
                security_officer_name=current_officer.full_name,
                action="entry_rejected",
                rejection_reason=reason,
                gate_name=payload.gate_name,
            )
        )
        db.commit()
        return GateVerifyResponse(
            is_valid=False,
            verification_status="SUSPENDED_RESIDENT",
            message=f"REJECTED: {reason}.",
            access_code=_format_code_out(ac),
            resident_name=resident.full_name,
            resident_phone=resident.phone,
            unit_number=unit_number,
        )

    # Check cancelled status
    if ac.status == "cancelled":
        reason = "Access code was cancelled by the resident or management"
        db.add(
            GateLog(
                access_code_id=ac.id,
                code_entered=ac.code,
                visitor_name=ac.visitor_name,
                visitor_phone=ac.visitor_phone,
                resident_name=resident.full_name,
                unit_number=unit_number,
                security_officer_id=current_officer.id,
                security_officer_name=current_officer.full_name,
                action="entry_rejected",
                rejection_reason=reason,
                gate_name=payload.gate_name,
            )
        )
        db.add(
            Notification(
                user_id=resident.id,
                title="Rejected Cancelled Code at Gate",
                message=f"Visitor {ac.visitor_name} presented cancelled code {ac.code} at {payload.gate_name}. Entry was denied.",
                event_type="code_rejected",
                related_code=ac.code,
            )
        )
        db.commit()
        return GateVerifyResponse(
            is_valid=False,
            verification_status="CANCELLED",
            message="REJECTED: This access code was cancelled.",
            access_code=_format_code_out(ac),
            resident_name=resident.full_name,
            resident_phone=resident.phone,
            unit_number=unit_number,
        )

    # Check already used (one-time code or max uses reached)
    if ac.status == "used" or ac.use_count >= ac.max_uses:
        ac.status = "used"
        reason = f"Code already used ({ac.use_count}/{ac.max_uses} uses)"
        db.add(
            GateLog(
                access_code_id=ac.id,
                code_entered=ac.code,
                visitor_name=ac.visitor_name,
                visitor_phone=ac.visitor_phone,
                resident_name=resident.full_name,
                unit_number=unit_number,
                security_officer_id=current_officer.id,
                security_officer_name=current_officer.full_name,
                action="entry_rejected",
                rejection_reason=reason,
                gate_name=payload.gate_name,
            )
        )
        db.add(
            Notification(
                user_id=resident.id,
                title="Duplicate Code Attempt Rejected",
                message=f"Already-used code {ac.code} for {ac.visitor_name} was presented again at {payload.gate_name} and rejected.",
                event_type="code_rejected",
                related_code=ac.code,
            )
        )
        db.commit()
        return GateVerifyResponse(
            is_valid=False,
            verification_status="ALREADY_USED",
            message=f"REJECTED: One-time/temporary code has already been used ({ac.use_count}/{ac.max_uses}).",
            access_code=_format_code_out(ac),
            resident_name=resident.full_name,
            resident_phone=resident.phone,
            unit_number=unit_number,
        )

    # Check expiry
    if now > ac.valid_until or ac.status == "expired":
        ac.status = "expired"
        reason = f"Code expired at {ac.valid_until.strftime('%Y-%m-%d %H:%M UTC')}"
        db.add(
            GateLog(
                access_code_id=ac.id,
                code_entered=ac.code,
                visitor_name=ac.visitor_name,
                visitor_phone=ac.visitor_phone,
                resident_name=resident.full_name,
                unit_number=unit_number,
                security_officer_id=current_officer.id,
                security_officer_name=current_officer.full_name,
                action="entry_rejected",
                rejection_reason=reason,
                gate_name=payload.gate_name,
            )
        )
        db.add(
            Notification(
                user_id=resident.id,
                title="Expired Visitor Code Presented",
                message=f"Visitor {ac.visitor_name} arrived at {payload.gate_name} with expired code {ac.code}. Entry was blocked.",
                event_type="code_expired",
                related_code=ac.code,
            )
        )
        db.commit()
        return GateVerifyResponse(
            is_valid=False,
            verification_status="EXPIRED",
            message=f"REJECTED: Access code expired on {ac.valid_until.strftime('%Y-%m-%d %H:%M')}.",
            access_code=_format_code_out(ac),
            resident_name=resident.full_name,
            resident_phone=resident.phone,
            unit_number=unit_number,
        )

    # Code is authentic and valid
    return GateVerifyResponse(
        is_valid=True,
        verification_status="VALID",
        message="VALID ACCESS CODE: Visitor is authorised for entry.",
        access_code=_format_code_out(ac),
        resident_name=resident.full_name,
        resident_phone=resident.phone,
        unit_number=unit_number,
    )


@router.post("/admit", response_model=GateLogOut)
def admit_visitor_entry(
    payload: GateActionRequest,
    current_officer: User = Depends(require_security),
    db: Session = Depends(get_db),
):
    code_str = _extract_code(payload.code)
    ac = db.query(AccessCode).filter(AccessCode.code == code_str).first()
    if not ac:
        raise HTTPException(status_code=404, detail="Access code not found.")

    now = datetime.utcnow()
    if ac.status != "active" or now > ac.valid_until or ac.use_count >= ac.max_uses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot admit visitor: Code status is '{ac.status}' or limit reached.",
        )

    ac.use_count += 1
    ac.used_at = now
    if ac.code_type == "one_time" or ac.use_count >= ac.max_uses:
        ac.status = "used"

    unit_number = ac.unit.unit_number if ac.unit else "Unassigned"
    resident = ac.resident

    gate_log = GateLog(
        access_code_id=ac.id,
        code_entered=ac.code,
        visitor_name=ac.visitor_name,
        visitor_phone=ac.visitor_phone,
        resident_name=resident.full_name,
        unit_number=unit_number,
        security_officer_id=current_officer.id,
        security_officer_name=current_officer.full_name,
        action="entry_granted",
        gate_name=payload.gate_name,
        vehicle_plate=payload.vehicle_plate or ac.vehicle_plate,
        notes=payload.notes,
        entry_time=now,
    )
    db.add(gate_log)

    db.add(
        Notification(
            user_id=resident.id,
            title="Visitor Admitted at Gate",
            message=f"{ac.visitor_name} has been verified and admitted through {payload.gate_name} at {now.strftime('%H:%M')} using code {ac.code}.",
            event_type="visitor_admitted",
            related_code=ac.code,
        )
    )
    db.commit()
    db.refresh(gate_log)
    return gate_log


@router.post("/exit/{gate_log_id}", response_model=GateLogOut)
def record_visitor_exit(
    gate_log_id: int,
    current_officer: User = Depends(require_security),
    db: Session = Depends(get_db),
):
    log = db.query(GateLog).filter(GateLog.id == gate_log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Gate entry record not found.")
    if log.exit_time is not None:
        raise HTTPException(status_code=400, detail="Visitor exit has already been recorded.")

    now = datetime.utcnow()
    log.exit_time = now
    log.action = "exit_recorded"

    if log.access_code and log.access_code.resident_id:
        db.add(
            Notification(
                user_id=log.access_code.resident_id,
                title="Visitor Departed Estate",
                message=f"Visitor {log.visitor_name} exited the estate via {log.gate_name} at {now.strftime('%H:%M')}.",
                event_type="visitor_exited",
                related_code=log.code_entered,
            )
        )
    db.commit()
    db.refresh(log)
    return log


@router.get("/active-visitors", response_model=List[GateLogOut])
def list_visitors_currently_inside(
    current_officer: User = Depends(require_security),
    db: Session = Depends(get_db),
):
    return (
        db.query(GateLog)
        .filter(GateLog.action == "entry_granted", GateLog.exit_time.is_(None))
        .order_by(GateLog.entry_time.desc())
        .all()
    )


@router.get("/recent-logs", response_model=List[GateLogOut])
def list_recent_gate_logs(
    current_officer: User = Depends(require_security),
    db: Session = Depends(get_db),
):
    return db.query(GateLog).order_by(GateLog.created_at.desc()).limit(50).all()
