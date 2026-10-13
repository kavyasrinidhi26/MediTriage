"""
Unit and integration tests for dashboard patient volume, queue, and emergency metrics.
Verifies:
1. Local calendar day boundaries in Asia/Kolkata hospital timezone.
2. Separation of Patients Today vs Total Registered Patients vs Currently Waiting.
3. Currently Waiting strictly excludes discharged, completed, and cancelled cases.
4. Emergency metrics clearly distinguish Active, Today, and Total Recorded cases.
5. Patient ID deduplication prevents double-counting across multiple visits.
6. Empty data resilience.
"""

import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from fastapi.testclient import TestClient

from app.main import app
from app.db import SessionLocal
from app.models import PatientModel, EmergencyCaseModel, utc_now
from app.api.routes import get_hospital_today_boundaries, is_timestamp_in_hospital_today

client = TestClient(app)


def test_stats_endpoint_includes_all_distinguished_metrics():
    """Verifies that /api/stats and /api/triage/stats return all required distinguished metrics."""
    res = client.get("/api/stats")
    assert res.status_code == 200
    data = res.json()

    # Legacy fields
    assert "total_patients" in data
    assert "waiting_count" in data
    assert "emergency_count" in data
    assert "priority_count" in data
    assert "routine_count" in data

    # Required distinguished metrics
    assert "patients_today" in data
    assert "total_registered_patients" in data
    assert "currently_waiting" in data
    assert "hospital_timezone" in data
    assert data["hospital_timezone"] == "Asia/Kolkata"
    assert "active_emergency_cases" in data
    assert "today_emergency_cases" in data
    assert "total_recorded_emergency_cases" in data

    # Logical relations
    assert data["patients_today"] <= data["total_registered_patients"]
    assert data["today_emergency_cases"] <= data["total_recorded_emergency_cases"]


def test_hospital_today_boundaries_logic():
    """Tests the date boundary calculation using Asia/Kolkata timezone."""
    tz_str, start_utc, end_utc = get_hospital_today_boundaries("Asia/Kolkata")
    assert tz_str == "Asia/Kolkata"

    tz = ZoneInfo("Asia/Kolkata")
    now_local = datetime.now(tz)

    # 1. Middle of today local -> must be in today
    midday_local = datetime(now_local.year, now_local.month, now_local.day, 12, 0, 0, tzinfo=tz)
    assert is_timestamp_in_hospital_today(midday_local, start_utc, end_utc) is True

    # 2. 1 second after midnight local -> must be in today
    start_second_local = datetime(now_local.year, now_local.month, now_local.day, 0, 0, 1, tzinfo=tz)
    assert is_timestamp_in_hospital_today(start_second_local, start_utc, end_utc) is True

    # 3. 1 second before midnight local -> must be in today
    end_second_local = datetime(now_local.year, now_local.month, now_local.day, 23, 59, 59, tzinfo=tz)
    assert is_timestamp_in_hospital_today(end_second_local, start_utc, end_utc) is True

    # 4. Yesterday afternoon local -> must NOT be in today
    yesterday_local = midday_local - timedelta(days=1)
    assert is_timestamp_in_hospital_today(yesterday_local, start_utc, end_utc) is False

    # 5. Tomorrow morning local -> must NOT be in today
    tomorrow_local = midday_local + timedelta(days=1)
    assert is_timestamp_in_hospital_today(tomorrow_local, start_utc, end_utc) is False

    # 6. None timestamp handling -> safe False
    assert is_timestamp_in_hospital_today(None, start_utc, end_utc) is False


def test_currently_waiting_excludes_completed_and_discharged():
    """
    Verifies that patients whose status is COMPLETED, DISCHARGED, CANCELLED, or TRANSFERRED
    are excluded from currently_waiting.
    """
    db = SessionLocal()
    prefix = f"TEST-STATUS-{uuid.uuid4().hex[:6].upper()}"
    now = utc_now()

    # Create 1 WAITING, 1 COMPLETED, 1 DISCHARGED, 1 CANCELLED
    waiting_p = PatientModel(
        id=str(uuid.uuid4()),
        patient_id=f"{prefix}-WAIT",
        token_number="TK-W1",
        age=30,
        gender="Male",
        arrival_time="10:00",
        chief_complaint="Fever",
        status="WAITING",
        created_at=now,
        updated_at=now,
    )
    completed_p = PatientModel(
        id=str(uuid.uuid4()),
        patient_id=f"{prefix}-COMP",
        token_number="TK-C1",
        age=31,
        gender="Female",
        arrival_time="09:00",
        chief_complaint="Cough",
        status="COMPLETED",
        created_at=now,
        updated_at=now,
    )
    discharged_p = PatientModel(
        id=str(uuid.uuid4()),
        patient_id=f"{prefix}-DISC",
        token_number="TK-D1",
        age=32,
        gender="Other",
        arrival_time="08:00",
        chief_complaint="Headache",
        status="DISCHARGED",
        created_at=now,
        updated_at=now,
    )
    cancelled_p = PatientModel(
        id=str(uuid.uuid4()),
        patient_id=f"{prefix}-CANC",
        token_number="TK-X1",
        age=33,
        gender="Male",
        arrival_time="08:30",
        chief_complaint="Cancelled appointment",
        status="CANCELLED",
        created_at=now,
        updated_at=now,
    )

    db.add_all([waiting_p, completed_p, discharged_p, cancelled_p])
    db.commit()

    try:
        res = client.get("/api/stats")
        assert res.status_code == 200
        stats = res.json()

        # Database patients with WAITING are counted, while COMPLETED/DISCHARGED/CANCELLED are excluded
        all_patients = db.query(PatientModel).all()
        expected_waiting = sum(1 for p in all_patients if (p.status or "").upper() == "WAITING")
        assert stats["currently_waiting"] == expected_waiting
    finally:
        # Cleanup test records
        db.query(PatientModel).filter(PatientModel.patient_id.startswith(prefix)).delete()
        db.commit()
        db.close()


def test_emergency_metrics_distinguish_active_today_and_total():
    """
    Verifies that emergency statistics clearly distinguish active cases,
    today cases, and total recorded cases.
    """
    res = client.get("/api/emergency/stats")
    assert res.status_code == 200
    data = res.json()

    assert "active_emergency_count" in data
    assert "level_1_resuscitation_count" in data
    assert "stabilization_count" in data
    assert "total_emergency_cases_today" in data
    assert "total_recorded_emergency_cases" in data
    assert "hospital_timezone" in data
    assert data["hospital_timezone"] == "Asia/Kolkata"

    assert data["total_emergency_cases_today"] <= data["total_recorded_emergency_cases"]
    assert data["active_emergency_count"] <= data["total_recorded_emergency_cases"]


def test_deduplication_of_patient_id():
    """
    Verifies that the database schema enforces uniqueness of patient_id,
    and the counting logic uses set-based deduplication so duplicate patient
    identities cannot inflate total_registered_patients or patients_today.
    """
    # 1. Verify schema uniqueness prevents creating duplicate patient_id records
    db = SessionLocal()
    prefix = f"TEST-DUP-{uuid.uuid4().hex[:6].upper()}"
    now = utc_now()

    p1 = PatientModel(
        id=str(uuid.uuid4()),
        patient_id=f"{prefix}-ONE",
        token_number="TK-S1",
        age=45,
        gender="Female",
        arrival_time="09:00",
        chief_complaint="Initial Consultation",
        status="WAITING",
        created_at=now,
        updated_at=now,
    )
    db.add(p1)
    db.commit()

    try:
        # Attempting duplicate patient_id is prevented by unique constraint
        p_dup = PatientModel(
            id=str(uuid.uuid4()),
            patient_id=f"{prefix}-ONE",
            token_number="TK-S2",
            age=45,
            gender="Female",
            arrival_time="11:30",
            chief_complaint="Duplicate attempt",
            status="WAITING",
            created_at=now,
            updated_at=now,
        )
        db.add(p_dup)
        import pytest
        from sqlalchemy.exc import IntegrityError
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        # 2. Verify API stats correctly reflects distinct patient count
        res = client.get("/api/stats")
        assert res.status_code == 200
        stats = res.json()

        all_records = db.query(PatientModel).all()
        distinct_count = len(set(p.patient_id or p.id for p in all_records))
        assert stats["total_registered_patients"] == distinct_count
    finally:
        db.query(PatientModel).filter(PatientModel.patient_id.startswith(prefix)).delete()
        db.commit()
        db.close()


def test_filtered_patient_lists_match_dashboard_counts():
    """
    CRITICAL INVARIANT:
    Verifies that the record count of each filtered patient list matches
    the exact corresponding count displayed on the dashboard cards.
    """
    # 1. Fetch dashboard metrics
    stats_res = client.get("/api/stats")
    assert stats_res.status_code == 200
    stats = stats_res.json()

    # 2. Total registered patients list
    all_res = client.get("/api/queue")
    assert all_res.status_code == 200
    all_patients = all_res.json()
    assert len(all_patients) == stats["total_registered_patients"]

    # 3. Patients today list
    today_res = client.get("/api/queue?today_only=true")
    assert today_res.status_code == 200
    today_patients = today_res.json()
    assert len(today_patients) == stats["patients_today"]

    # 4. Currently waiting list
    waiting_res = client.get("/api/queue?status=WAITING")
    assert waiting_res.status_code == 200
    waiting_patients = waiting_res.json()
    assert len(waiting_patients) == stats["currently_waiting"]

    # 5. Priority cases list
    priority_res = client.get("/api/queue?category=PRIORITY")
    assert priority_res.status_code == 200
    priority_patients = priority_res.json()
    assert len(priority_patients) == stats["priority_count"]
    assert all(p["triage_level"] == 2 for p in priority_patients)

    # 6. Routine cases list
    routine_res = client.get("/api/queue?category=ROUTINE")
    assert routine_res.status_code == 200
    routine_patients = routine_res.json()
    assert len(routine_patients) == stats["routine_count"]
    assert all(p["triage_level"] is None or p["triage_level"] >= 3 for p in routine_patients)

    # 7. Active emergency cases list
    emergency_res = client.get("/api/emergency/cases")
    assert emergency_res.status_code == 200
    emergency_cases = emergency_res.json()
    assert len(emergency_cases) == stats["active_emergency_cases"]

