from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .models import Unit, User, AccessCode, GateLog, Notification, AuditLog
from .auth import hash_password


def seed_initial_data(db: Session):
    if db.query(User).count() > 0:
        return

    now = datetime.utcnow()

    # 1. Create Residential Units
    units_data = [
        Unit(unit_number="Block A - Apt 101", block_name="Block A (Hibiscus)", street_address="12 Palm Avenue", unit_type="Apartment"),
        Unit(unit_number="Block A - Apt 102", block_name="Block A (Hibiscus)", street_address="12 Palm Avenue", unit_type="Apartment"),
        Unit(unit_number="Block B - Duplex 04", block_name="Block B (Cedar)", street_address="5 Orchid Drive", unit_type="Duplex"),
        Unit(unit_number="Villa 14 - Royal Close", block_name="Royal Villas", street_address="14 Royal Close", unit_type="Villa"),
    ]
    db.add_all(units_data)
    db.flush()

    # 2. Create Users (Estate Admin, Security Officers, Residents)
    admin_user = User(
        full_name="Chief Estate Administrator",
        email="admin@royalpalmsestate.com",
        phone="+2348010000001",
        password_hash=hash_password("Admin@123"),
        role="admin",
        status="active",
        estate_id_number="EST-ADM-001",
    )

    security_1 = User(
        full_name="Officer Samuel Okafor",
        email="security.north@royalpalmsestate.com",
        phone="+2348020000001",
        password_hash=hash_password("Security@123"),
        role="security",
        status="active",
        estate_id_number="EST-SEC-001",
    )

    security_2 = User(
        full_name="Officer Ibrahim Musa",
        email="security.south@royalpalmsestate.com",
        phone="+2348020000002",
        password_hash=hash_password("Security@123"),
        role="security",
        status="active",
        estate_id_number="EST-SEC-002",
    )

    resident_1 = User(
        full_name="Engr. Adewale Banjo",
        email="adewale.banjo@example.com",
        phone="+2348031112222",
        password_hash=hash_password("Resident@123"),
        role="resident",
        status="active",
        estate_id_number="EST-2026-101",
        unit_id=units_data[0].id,
    )

    resident_2 = User(
        full_name="Dr. Chioma Nwosu",
        email="chioma.nwosu@example.com",
        phone="+2348033334444",
        password_hash=hash_password("Resident@123"),
        role="resident",
        status="active",
        estate_id_number="EST-2026-102",
        unit_id=units_data[2].id,
    )

    resident_pending = User(
        full_name="Mr. Tunde Bakare",
        email="tunde.bakare@example.com",
        phone="+2348035556666",
        password_hash=hash_password("Resident@123"),
        role="resident",
        status="pending",
        estate_id_number="EST-2026-103",
        unit_id=units_data[1].id,
    )

    db.add_all([admin_user, security_1, security_2, resident_1, resident_2, resident_pending])
    db.flush()

    # 3. Create Sample Access Codes
    code_active_1 = AccessCode(
        code="482910",
        qr_payload="ESTATE-PASS|CODE:482910|UNIT:1|SIG:A9F03C1E8B12",
        resident_id=resident_1.id,
        unit_id=units_data[0].id,
        visitor_name="Michael Oluwaseun",
        visitor_phone="+2348091234567",
        vehicle_plate="LSR-482-KJ",
        purpose="Personal Visit",
        code_type="one_time",
        arrival_date=now.strftime("%Y-%m-%d"),
        valid_from=now - timedelta(hours=1),
        valid_until=now + timedelta(hours=8),
        max_uses=1,
        use_count=0,
        status="active",
    )

    code_active_temp = AccessCode(
        code="739104",
        qr_payload="ESTATE-PASS|CODE:739104|UNIT:3|SIG:B7D19E4A2C08",
        resident_id=resident_2.id,
        unit_id=units_data[2].id,
        visitor_name="Solar Tech Maintenance Team",
        visitor_phone="+2348087654321",
        vehicle_plate="APP-901-XY",
        purpose="Contractor / Maintenance",
        code_type="temporary",
        arrival_date=now.strftime("%Y-%m-%d"),
        valid_from=now - timedelta(hours=2),
        valid_until=now + timedelta(hours=24),
        max_uses=4,
        use_count=1,
        status="active",
    )

    code_used = AccessCode(
        code="510293",
        qr_payload="ESTATE-PASS|CODE:510293|UNIT:1|SIG:C2E41F8B9A11",
        resident_id=resident_1.id,
        unit_id=units_data[0].id,
        visitor_name="DHL Express Courier",
        visitor_phone="+2348050009999",
        vehicle_plate="KJA-112-AA",
        purpose="Delivery",
        code_type="one_time",
        arrival_date=now.strftime("%Y-%m-%d"),
        valid_from=now - timedelta(hours=4),
        valid_until=now + timedelta(hours=2),
        max_uses=1,
        use_count=1,
        status="used",
        used_at=now - timedelta(hours=2),
    )

    code_expired = AccessCode(
        code="194822",
        qr_payload="ESTATE-PASS|CODE:194822|UNIT:1|SIG:D4A92C3E1F77",
        resident_id=resident_1.id,
        unit_id=units_data[0].id,
        visitor_name="Grace Adebayo",
        visitor_phone="+2348071112233",
        purpose="Personal Visit",
        code_type="one_time",
        arrival_date=(now - timedelta(days=1)).strftime("%Y-%m-%d"),
        valid_from=now - timedelta(hours=28),
        valid_until=now - timedelta(hours=16),
        max_uses=1,
        use_count=0,
        status="expired",
    )

    db.add_all([code_active_1, code_active_temp, code_used, code_expired])
    db.flush()

    # 4. Create Gate Logs
    log_1 = GateLog(
        access_code_id=code_used.id,
        code_entered="510293",
        visitor_name="DHL Express Courier",
        visitor_phone="+2348050009999",
        resident_name=resident_1.full_name,
        unit_number=units_data[0].unit_number,
        security_officer_id=security_1.id,
        security_officer_name=security_1.full_name,
        action="exit_recorded",
        gate_name="Main North Gate",
        vehicle_plate="KJA-112-AA",
        notes="Package delivered to Block A Apt 101",
        entry_time=now - timedelta(hours=2, minutes=15),
        exit_time=now - timedelta(hours=1, minutes=50),
        created_at=now - timedelta(hours=2, minutes=15),
    )

    log_2 = GateLog(
        access_code_id=code_active_temp.id,
        code_entered="739104",
        visitor_name="Solar Tech Maintenance Team",
        visitor_phone="+2348087654321",
        resident_name=resident_2.full_name,
        unit_number=units_data[2].unit_number,
        security_officer_id=security_1.id,
        security_officer_name=security_1.full_name,
        action="entry_granted",
        gate_name="Main North Gate",
        vehicle_plate="APP-901-XY",
        notes="Inverter inspection crew (currently inside estate)",
        entry_time=now - timedelta(minutes=45),
        created_at=now - timedelta(minutes=45),
    )

    log_3 = GateLog(
        access_code_id=code_expired.id,
        code_entered="194822",
        visitor_name="Grace Adebayo",
        visitor_phone="+2348071112233",
        resident_name=resident_1.full_name,
        unit_number=units_data[0].unit_number,
        security_officer_id=security_2.id,
        security_officer_name=security_2.full_name,
        action="entry_rejected",
        rejection_reason="Code expired",
        gate_name="South Service Gate",
        created_at=now - timedelta(hours=3),
    )

    db.add_all([log_1, log_2, log_3])

    # 5. Create Notifications
    db.add_all(
        [
            Notification(
                user_id=resident_1.id,
                title="Visitor Admitted at Gate",
                message="DHL Express Courier was verified and admitted at Main North Gate using code 510293.",
                event_type="visitor_admitted",
                related_code="510293",
            ),
            Notification(
                user_id=resident_1.id,
                title="Expired Visitor Code Presented",
                message="Visitor Grace Adebayo presented expired code 194822 at South Service Gate. Entry was denied.",
                event_type="code_expired",
                related_code="194822",
            ),
            Notification(
                user_id=resident_2.id,
                title="Visitor Admitted at Gate",
                message="Solar Tech Maintenance Team entered via Main North Gate using temporary code 739104 (Use 1/4).",
                event_type="visitor_admitted",
                related_code="739104",
            ),
        ]
    )

    db.add(
        AuditLog(
            actor_id=admin_user.id,
            actor_name=admin_user.full_name,
            actor_role="admin",
            action="SYSTEM_INITIALIZATION",
            target_type="System",
            target_id="1",
            details="Initial database seed completed with demo residents, security officers, units, and access logs.",
        )
    )

    db.commit()
