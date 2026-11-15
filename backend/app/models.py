from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.orm import relationship
from .database import Base


class Unit(Base):
    __tablename__ = "units"

    id = Column(Integer, primary_key=True, index=True)
    unit_number = Column(String(50), unique=True, index=True, nullable=False)  # e.g., "Block A - Apt 101"
    block_name = Column(String(100), nullable=False)
    street_address = Column(String(200), nullable=True)
    unit_type = Column(String(50), default="Apartment")  # Apartment, Duplex, Villa, Townhouse
    is_occupied = Column(Boolean, default=True)
    access_suspended = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    residents = relationship("User", back_populates="unit")
    access_codes = relationship("AccessCode", back_populates="unit")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    phone = Column(String(30), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(30), nullable=False, default="resident")  # resident | security | admin
    status = Column(String(30), nullable=False, default="active")  # pending | active | suspended | deactivated
    estate_id_number = Column(String(60), unique=True, index=True, nullable=True)  # Estate-approved ID
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)
    push_token = Column(String(255), nullable=True)
    recovery_code = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    unit = relationship("Unit", back_populates="residents")
    access_codes = relationship("AccessCode", back_populates="resident", foreign_keys="AccessCode.resident_id")
    notifications = relationship("Notification", back_populates="user")


class AccessCode(Base):
    __tablename__ = "access_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, index=True, nullable=False)  # e.g., "849201"
    qr_payload = Column(String(255), unique=True, nullable=False)
    resident_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    unit_id = Column(Integer, ForeignKey("units.id"), nullable=True)

    visitor_name = Column(String(150), nullable=False)
    visitor_phone = Column(String(30), nullable=False)
    visitor_Count = Column(Integer, default=1)
    vehicle_plate = Column(String(30), nullable=True)
    purpose = Column(String(100), default="Personal Visit")  # Personal Visit, Delivery, Contractor, Taxi

    code_type = Column(String(30), default="one_time")  # one_time | temporary
    arrival_date = Column(String(20), nullable=False)
    valid_from = Column(DateTime, nullable=False)
    valid_until = Column(DateTime, nullable=False)

    max_uses = Column(Integer, default=1)
    use_count = Column(Integer, default=0)

    # active | used | expired | cancelled | suspended
    status = Column(String(30), default="active", index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    used_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    resident = relationship("User", back_populates="access_codes", foreign_keys=[resident_id])
    unit = relationship("Unit", back_populates="access_codes")
    gate_logs = relationship("GateLog", back_populates="access_code")


class GateLog(Base):
    __tablename__ = "gate_logs"

    id = Column(Integer, primary_key=True, index=True)
    access_code_id = Column(Integer, ForeignKey("access_codes.id"), nullable=True)
    code_entered = Column(String(50), index=True, nullable=False)
    visitor_name = Column(String(150), nullable=True)
    visitor_phone = Column(String(30), nullable=True)
    resident_name = Column(String(150), nullable=True)
    unit_number = Column(String(50), nullable=True)
    security_officer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    security_officer_name = Column(String(150), nullable=True)

    # entry_granted | exit_recorded | entry_rejected
    action = Column(String(40), nullable=False, index=True)
    rejection_reason = Column(String(200), nullable=True)
    gate_name = Column(String(60), default="Main North Gate")
    vehicle_plate = Column(String(30), nullable=True)
    notes = Column(Text, nullable=True)

    entry_time = Column(DateTime, nullable=True)
    exit_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    access_code = relationship("AccessCode", back_populates="gate_logs")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    event_type = Column(String(50), default="general")
    # visitor_admitted | visitor_exited | code_rejected | code_expired | account_update
    related_code = Column(String(20), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="notifications")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    actor_name = Column(String(150), nullable=False)
    actor_role = Column(String(30), nullable=False)
    action = Column(String(100), nullable=False)
    target_type = Column(String(50), nullable=False)
    target_id = Column(String(50), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
