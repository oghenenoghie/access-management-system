from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field


# --- Auth & User Schemas ---
class LoginRequest(BaseModel):
    identifier: str = Field(..., description="Email or Phone number")
    password: str


class ResidentRegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str = Field(..., min_length=8, max_length=128, description="At least 8 characters")
    estate_id_number: str = Field(..., description="Estate-approved identification number")
    unit_number: str = Field(..., description="Residential unit or apartment number")


class PasswordRecoveryRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    recovery_code: str
    new_password: str = Field(..., min_length=8, max_length=128, description="At least 8 characters")


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128, description="At least 8 characters")


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    push_token: Optional[str] = None


class UnitOut(BaseModel):
    id: int
    unit_number: str
    block_name: str
    street_address: Optional[str] = None
    unit_type: str
    is_occupied: bool
    access_suspended: bool

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    phone: str
    role: str
    status: str
    estate_id_number: Optional[str] = None
    unit_id: Optional[int] = None
    unit: Optional[UnitOut] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Access Code Schemas ---
class AccessCodeCreate(BaseModel):
    visitor_name: str
    visitor_phone: str
    visitor_count: int = 1
    vehicle_plate: Optional[str] = None
    purpose: str = "Personal Visit"
    code_type: str = Field("one_time", description="one_time or temporary")
    arrival_date: str = Field(..., description="YYYY-MM-DD")
    valid_hours: int = Field(12, ge=1, le=168, description="Validity window in hours")
    max_uses: int = Field(1, ge=1, le=50)


class AccessCodeOut(BaseModel):
    id: int
    code: str
    qr_payload: str
    resident_id: int
    resident_name: Optional[str] = None
    unit_number: Optional[str] = None
    visitor_name: str
    visitor_phone: str
    vehicle_plate: Optional[str] = None
    purpose: str
    code_type: str
    arrival_date: str
    valid_from: datetime
    valid_until: datetime
    max_uses: int
    use_count: int
    status: str
    created_at: datetime
    used_at: Optional[datetime] = None
    share_message: Optional[str] = None

    class Config:
        from_attributes = True


# --- Security Gate Verification Schemas ---
class GateVerifyRequest(BaseModel):
    code_or_qr: str = Field(..., description="6-digit code or scanned QR payload")
    gate_name: str = "Main North Gate"


class GateVerifyResponse(BaseModel):
    is_valid: bool
    verification_status: str  # VALID | EXPIRED | CANCELLED | ALREADY_USED | INVALID | SUSPENDED_RESIDENT
    message: str
    access_code: Optional[AccessCodeOut] = None
    resident_name: Optional[str] = None
    resident_phone: Optional[str] = None
    unit_number: Optional[str] = None


class GateActionRequest(BaseModel):
    code: str
    gate_name: str = "Main North Gate"
    vehicle_plate: Optional[str] = None
    notes: Optional[str] = None


class GateLogOut(BaseModel):
    id: int
    access_code_id: Optional[int] = None
    code_entered: str
    visitor_name: Optional[str] = None
    visitor_phone: Optional[str] = None
    resident_name: Optional[str] = None
    unit_number: Optional[str] = None
    security_officer_name: Optional[str] = None
    action: str
    rejection_reason: Optional[str] = None
    gate_name: str
    vehicle_plate: Optional[str] = None
    notes: Optional[str] = None
    entry_time: Optional[datetime] = None
    exit_time: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Notification Schemas ---
class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    event_type: str
    related_code: Optional[str] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- Admin Schemas ---
class UnitCreate(BaseModel):
    unit_number: str
    block_name: str
    street_address: Optional[str] = None
    unit_type: str = "Apartment"


class AdminUserCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str = Field(..., min_length=8, max_length=128, description="At least 8 characters")
    role: str = "resident"  # resident | security | admin
    status: str = "active"
    estate_id_number: Optional[str] = None
    unit_id: Optional[int] = None


class UserStatusUpdate(BaseModel):
    status: str  # active | suspended | deactivated | pending
    reason: Optional[str] = None
