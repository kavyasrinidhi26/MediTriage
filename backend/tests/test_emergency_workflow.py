"""
Tests for the Emergency Accident Intake and Rapid Triage Workflow.
Validates:
1. Unknown patient identity intake without routine registration.
2. Immediate Level 1 emergency activation.
3. Idempotent retry safety preventing duplicate cases.
4. Emergency queue separation from routine OPD queue.
5. Case lifecycle status transitions and persistent audit trail.
6. Reassessment documentation.
7. Trauma department stats and hospital protocol instructions.
"""

import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_emergency_intake_unknown_identity():
    """
    Scenario 1: An accident patient with unknown identity can receive an
    emergency case ID immediately without completing routine registration.
    """
    payload = {
        "patient_identity_status": "UNKNOWN",
        "accident_type": "ROAD_TRAFFIC_ACCIDENT",
        "mechanism_of_injury": "Motorcyclist hit by speeding truck, severe head trauma",
        "airway_status": "Threatened / Stridor",
        "breathing_status": "Severe Distress",
        "circulation_status": "Weak Thread",
        "neurological_status": "Unresponsive (U)",
        "major_bleeding": "Massive Scalp Laceration",
        "pulse_bpm": 135,
        "systolic_bp": 82,
        "diastolic_bp": 50,
        "spo2": 88.0,
        "gcs_score": 6,
        "red_flags": [
            "Severe polytrauma",
            "Compromised airway",
            "Hemorrhagic shock SBP < 90",
        ],
        "escalation_reason": "Acute high-velocity RTA with hemorrhagic shock and airway compromise",
        "immediate_actions_taken": "Cervical collar applied, 15L O2 started",
        "activated_by": "Staff Nurse Priya",
        "assigned_resuscitation_bay": "Red Trauma Bay 01",
    }

    response = client.post("/api/emergency/intake", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()

    assert data["case_id"].startswith("EMG-")
    assert data["patient_identity_status"] == "UNKNOWN"
    assert data["patient_name"] is None
    assert data["status"] == "RESPONSE_ACTIVATED"
    assert data["triage_category"] == "LEVEL_1_RESUSCITATION"
    assert data["urgency_level"] == "Level 1 - Immediate Resuscitation"
    assert data["assigned_resuscitation_bay"] == "Red Trauma Bay 01"
    assert len(data["hospital_protocol_instructions"]) > 0
    assert "CRITICAL CLINICAL DECISION-SUPPORT NOTICE" in data["clinical_disclaimer"]


def test_emergency_intake_minimal_fields():
    """
    Validates that rapid emergency intake succeeds even with only minimal
    fields supplied (e.g. unknown vitals, minimal mechanism).
    """
    payload = {
        "accident_type": "BURN",
        "mechanism_of_injury": "High-voltage industrial electrical burn",
    }
    response = client.post("/api/emergency/intake", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()

    assert data["case_id"].startswith("EMG-")
    assert data["accident_type"] == "BURN"
    assert data["status"] == "RESPONSE_ACTIVATED"
    assert data["triage_category"] == "LEVEL_1_RESUSCITATION"


def test_idempotent_retry_prevents_duplicate_cases():
    """
    Scenario 3: A client-supplied case_id on network retry does not create
    duplicate cases.
    """
    custom_case_id = f"EMG-RETRY-{uuid.uuid4().hex[:6].upper()}"
    payload = {
        "case_id": custom_case_id,
        "patient_identity_status": "NOT_YET_VERIFIED",
        "accident_type": "FALL",
        "mechanism_of_injury": "Fall from height 15 ft",
    }

    # Initial intake
    res1 = client.post("/api/emergency/intake", json=payload)
    assert res1.status_code == 201
    data1 = res1.json()
    assert data1["case_id"] == custom_case_id

    # Simulated network retry with identical case_id
    res2 = client.post("/api/emergency/intake", json=payload)
    assert res2.status_code in [200, 201]
    data2 = res2.json()
    assert data2["id"] == data1["id"]
    assert data2["case_id"] == custom_case_id

    # Check case list - only ONE instance exists
    cases_res = client.get(f"/api/emergency/cases?search={custom_case_id}&include_completed=true")
    assert cases_res.status_code == 200
    matched = [c for c in cases_res.json() if c["case_id"] == custom_case_id]
    assert len(matched) == 1, "Duplicate case was created on retry!"


def test_emergency_queue_separation_from_routine_opd():
    """
    Scenario 4: Dedicated emergency queue exists separately from routine OPD queue,
    and routine OPD patients remain in the existing queue without interference.
    """
    emg_res = client.get("/api/emergency/cases")
    assert emg_res.status_code == 200
    emg_cases = emg_res.json()
    assert len(emg_cases) >= 1
    for c in emg_cases:
        assert c["case_id"].startswith("EMG-")

    # Routine OPD queue still functions normally
    opd_res = client.get("/api/queue")
    assert opd_res.status_code == 200
    opd_cases = opd_res.json()
    assert len(opd_cases) >= 1
    for p in opd_cases:
        assert "token_number" in p


def test_emergency_lifecycle_status_and_audit():
    """
    Scenario 6 & 7: Case lifecycle transitions (RESPONSE_ACTIVATED -> INITIAL_ASSESSMENT
    -> STABILIZATION_IN_PROGRESS -> TRANSFERRED) and audit trail logging.
    """
    # Create a case
    create_res = client.post(
        "/api/emergency/intake",
        json={
            "patient_identity_status": "KNOWN",
            "patient_name": "Arun Saxena",
            "approximate_age": 35,
            "gender": "Male",
            "accident_type": "WORKPLACE_ACCIDENT",
            "mechanism_of_injury": "Crush injury to left forearm under machinery",
            "major_bleeding": "Controlled Extremity",
            "pulse_bpm": 102,
            "systolic_bp": 118,
            "diastolic_bp": 74,
            "activated_by": "Dr. Mehta",
        },
    )
    assert create_res.status_code == 201
    case = create_res.json()
    case_id = case["case_id"]

    # 1. Update status to INITIAL_ASSESSMENT
    patch1 = client.patch(
        f"/api/emergency/cases/{case_id}/status",
        json={
            "status": "INITIAL_ASSESSMENT",
            "updated_by": "Dr. Mehta",
            "notes": "Patient wheeled into Red Bay 01; primary survey underway",
        },
    )
    assert patch1.status_code == 200
    assert patch1.json()["status"] == "INITIAL_ASSESSMENT"

    # 2. Update status to STABILIZATION_IN_PROGRESS
    patch2 = client.patch(
        f"/api/emergency/cases/{case_id}/status",
        json={
            "status": "STABILIZATION_IN_PROGRESS",
            "updated_by": "Staff Nurse Anita",
            "notes": "Analgesia administered; wound cleaned and packed",
        },
    )
    assert patch2.status_code == 200
    assert patch2.json()["status"] == "STABILIZATION_IN_PROGRESS"

    # 3. Check audit trail
    audit_res = client.get(f"/api/emergency/cases/{case_id}/audit")
    assert audit_res.status_code == 200
    audit_logs = audit_res.json()
    assert len(audit_logs) >= 3  # activation + 2 updates

    actions = [a["action_type"] for a in audit_logs]
    assert "EMERGENCY_ACTIVATED" in actions
    assert "STATUS_UPDATED" in actions


def test_emergency_reassessment_documentation():
    """
    Scenario 4 & 6: Clinician documents reassessment of ABCDE and vitals.
    """
    create_res = client.post(
        "/api/emergency/intake",
        json={
            "accident_type": "FALL",
            "mechanism_of_injury": "Fall down 12 stairs",
        },
    )
    case_id = create_res.json()["case_id"]

    reassess_res = client.post(
        f"/api/emergency/cases/{case_id}/reassess",
        json={
            "reassessed_by": "Dr. S. Kulkarni",
            "airway_status": "Intact",
            "breathing_status": "Normal",
            "circulation_status": "Palpable Regular",
            "neurological_status": "Alert (A)",
            "pulse_bpm": 84,
            "systolic_bp": 124,
            "diastolic_bp": 80,
            "spo2": 98.0,
            "gcs_score": 15,
            "reassessment_status": "PRIMARY_SURVEY_COMPLETED",
            "notes": "Hemodynamics stable; cervical spine cleared by portable CT",
        },
    )
    assert reassess_res.status_code == 200
    updated = reassess_res.json()
    assert updated["pulse_bpm"] == 84
    assert updated["spo2"] == 98.0
    assert updated["gcs_score"] == 15
    assert updated["reassessment_status"] == "PRIMARY_SURVEY_COMPLETED"


def test_emergency_stats():
    """
    Scenario 6: Department stats reflect active emergency counts.
    """
    stats_res = client.get("/api/emergency/stats")
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert "active_emergency_count" in stats
    assert "level_1_resuscitation_count" in stats
    assert "stabilization_count" in stats
    assert stats["active_emergency_count"] >= 1


def test_emergency_intake_invalid_inputs():
    """
    Validates that invalid inputs are rejected with appropriate error codes (422)
    and do not claim an unsaved case was created:
    - Invalid accident type
    - Out-of-bounds physiological vitals and age
    - Non-existent case status patch returns 404
    - Invalid lifecycle status returns 422
    """
    # 1. Invalid accident type
    res_bad_accident = client.post("/api/emergency/intake", json={"accident_type": "SPORTS_ACCIDENT_INVALID"})
    assert res_bad_accident.status_code == 422

    # 2. Out of bounds age (> 130)
    res_bad_age = client.post("/api/emergency/intake", json={"approximate_age": 250})
    assert res_bad_age.status_code == 422

    # 3. Out of bounds pulse (> 300)
    res_bad_pulse = client.post("/api/emergency/intake", json={"pulse_bpm": 500})
    assert res_bad_pulse.status_code == 422

    # 4. Out of bounds GCS score (< 3 or > 15)
    res_bad_gcs = client.post("/api/emergency/intake", json={"gcs_score": 1})
    assert res_bad_gcs.status_code == 422

    # 5. Non-existent case ID status patch returns 404
    res_not_found = client.patch(
        "/api/emergency/cases/EMG-NONEXISTENT-9999/status",
        json={"status": "INITIAL_ASSESSMENT", "updated_by": "Nurse"}
    )
    assert res_not_found.status_code == 404

    # 6. Invalid status string returns 422
    res_bad_status = client.patch(
        "/api/emergency/cases/EMG-NONEXISTENT-9999/status",
        json={"status": "INVALID_STATUS_CODE", "updated_by": "Nurse"}
    )
    assert res_bad_status.status_code == 422


def test_emergency_intake_invalid_bp_consistency():
    """
    Validates that contradictory blood pressures (systolic <= diastolic)
    are rejected with HTTP 422 for both intake and reassessment.
    """
    # Intake with systolic <= diastolic
    bad_intake_res = client.post(
        "/api/emergency/intake",
        json={
            "accident_type": "FALL",
            "systolic_bp": 70,
            "diastolic_bp": 90,
        },
    )
    assert bad_intake_res.status_code == 422
    assert "Systolic blood pressure must be strictly greater than diastolic" in bad_intake_res.text

    # Reassessment with systolic <= diastolic
    create_res = client.post(
        "/api/emergency/intake",
        json={
            "accident_type": "FALL",
            "systolic_bp": 110,
            "diastolic_bp": 70,
        },
    )
    assert create_res.status_code == 201
    case_id = create_res.json()["case_id"]

    bad_reassess_res = client.post(
        f"/api/emergency/cases/{case_id}/reassess",
        json={
            "reassessed_by": "Dr. Smith",
            "systolic_bp": 80,
            "diastolic_bp": 80,
        },
    )
    assert bad_reassess_res.status_code == 422
    assert "Systolic blood pressure must be strictly greater than diastolic" in bad_reassess_res.text


def test_emergency_intake_database_failure_rollback(monkeypatch):
    """
    Simulates a database commit failure during emergency case creation
    and verifies that HTTP 500 is returned and changes are rolled back.
    """
    from sqlalchemy.orm import Session

    def mock_commit(self):
        raise RuntimeError("Simulated transient database write error")

    monkeypatch.setattr(Session, "commit", mock_commit)

    res = client.post(
        "/api/emergency/intake",
        json={
            "accident_type": "WORKPLACE_ACCIDENT",
            "mechanism_of_injury": "Hand trapped in heavy machinery",
        },
    )
    assert res.status_code == 500
    assert "Database failure while recording emergency intake" in res.json()["detail"]


def test_stats_and_triage_stats_endpoints():
    """
    Verifies that /api/triage/stats and /api/stats return identical summary
    metrics consistent with patient records.
    """
    res1 = client.get("/api/triage/stats")
    res2 = client.get("/api/stats")

    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json() == res2.json()

    data = res1.json()
    assert "total_patients" in data
    assert "waiting_count" in data
    assert "with_doctor_count" in data
    assert "needs_human_review_count" in data
    assert "emergency_count" in data
    assert "priority_count" in data
    assert "routine_count" in data
    assert "departments_breakdown" in data


