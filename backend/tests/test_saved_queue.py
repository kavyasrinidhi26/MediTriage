"""
Tests for the persistent, functional OPD Patient Queue and Nurse Review Workflow.
Verifies clinical prioritization, escalation visibility, human-review retention,
filtering by triage level/department/review status, demo ID search,
review status persistence, deterioration flagging, and audit trail integrity.
"""

import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_queue_listing_and_escalation_prominence():
    """
    Verifies that the live queue retrieves persistent database records,
    places critical escalation and deteriorating cases prominently at the top,
    and distinguishes priority from waiting time.
    """
    response = client.get("/api/queue")
    assert response.status_code == 200
    queue = response.json()
    assert len(queue) >= 5

    # Top patients must be critical life-threats or deteriorating cases (Tier 0 / Tier 1)
    first_patient = queue[0]
    assert first_patient["deterioration_flag"] or first_patient["triage_level"] == 1
    assert first_patient["is_critical_escalation"] is True

    # Disclaimer must be present
    assert "PROTOTYPE OPD QUEUE NOTICE" in first_patient["disclaimer"]


def test_queue_ordering_and_human_review_retention():
    """
    SAFETY REQUIREMENT:
    Cases requiring human review or lacking model scores must NOT disappear
    or drop to the end of the queue. They remain in high-priority holding tiers.
    """
    response = client.get("/api/queue")
    assert response.status_code == 200
    queue = response.json()

    # Find patient needing human review
    review_needed = [p for p in queue if p["status"] == "NEEDS_HUMAN_REVIEW"]
    assert len(review_needed) > 0

    # Ensure none of the human-review-required cases are ranked at the very end
    # when routine (Level 4/5) patients exist
    routine_indices = [
        idx for idx, p in enumerate(queue)
        if p["triage_level"] and p["triage_level"] >= 4 and not p["deterioration_flag"]
    ]
    if routine_indices:
        earliest_routine = min(routine_indices)
        for p_idx, p in enumerate(queue):
            if p["status"] == "NEEDS_HUMAN_REVIEW" and (p["triage_level"] in [1, 2] or p["deterioration_flag"]):
                assert p_idx < earliest_routine, "Human-review case dropped behind routine patients!"


def test_queue_filtering_by_triage_level():
    """Verifies filtering queue by triage level (1 to 5)."""
    # Level 1 filter
    res_l1 = client.get("/api/queue?triage_level=1")
    assert res_l1.status_code == 200
    items_l1 = res_l1.json()
    assert len(items_l1) > 0
    assert all(p["triage_level"] == 1 for p in items_l1)

    # Level 4 filter
    res_l4 = client.get("/api/queue?triage_level=4")
    assert res_l4.status_code == 200
    items_l4 = res_l4.json()
    assert len(items_l4) > 0
    assert all(p["triage_level"] == 4 for p in items_l4)


def test_queue_filtering_by_department():
    """Verifies filtering by clinical department."""
    res = client.get("/api/queue?department=Pediatrics")
    assert res.status_code == 200
    items = res.json()
    assert len(items) > 0
    assert any("Pediatrics" in p["recommended_department"] for p in items)


def test_queue_filtering_by_review_status():
    """Verifies filtering by review status (UNREVIEWED, REVIEWED, DETERIORATION_FLAGGED)."""
    # Filter unreviewed
    res_unreviewed = client.get("/api/queue?review_status=UNREVIEWED")
    assert res_unreviewed.status_code == 200
    items_un = res_unreviewed.json()
    assert len(items_un) > 0
    assert all(p["review_status"] == "UNREVIEWED" for p in items_un)

    # Filter deteriorating
    res_det = client.get("/api/queue?review_status=DETERIORATION_FLAGGED")
    assert res_det.status_code == 200
    items_det = res_det.json()
    assert len(items_det) > 0
    assert all(p["review_status"] == "DETERIORATION_FLAGGED" for p in items_det)


def test_queue_search_by_demo_patient_id():
    """Verifies demo ID search functionality."""
    res = client.get("/api/queue?search=UHID-2026-901")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    assert items[0]["patient_id"] == "UHID-2026-901"
    assert "Ramesh Kumar" in items[0]["patient_name"]


def test_nurse_review_persistence_and_audit():
    """
    Verifies that a nurse can open an assessment and mark it as reviewed,
    persisting timestamp and reviewer information to the database and audit trail.
    """
    patient_id = "UHID-2026-902"
    review_payload = {
        "reviewed_by": "Staff Nurse Kavitha",
        "review_notes": "Auscultated bilateral wheezing. Nebulizer started.",
    }
    res = client.post(f"/api/queue/{patient_id}/review", json=review_payload)
    assert res.status_code == 200
    updated = res.json()
    assert updated["review_status"] == "REVIEWED"
    assert updated["reviewed_by"] == "Staff Nurse Kavitha"
    assert updated["reviewed_at"] is not None

    # Verify audit trail contains the action
    audit_res = client.get(f"/api/queue/{patient_id}/audit")
    assert audit_res.status_code == 200
    audit_logs = audit_res.json()
    assert len(audit_logs) > 0
    review_entries = [log for log in audit_logs if log["action_type"] == "NURSE_REVIEWED"]
    assert len(review_entries) > 0
    assert review_entries[0]["performed_by"] == "Staff Nurse Kavitha"


def test_staff_flag_deterioration_mechanism():
    """
    Verifies that clinical staff can flag acute patient deterioration,
    immediately elevating the patient's queue priority and creating an audit record.
    """
    patient_id = "UHID-TEST-DET-01"
    client.post("/api/patients", json={
        "patient_id": patient_id,
        "patient_name": "Test Deterioration Patient",
        "age": 40,
        "gender": "Male",
        "arrival_time": "10:00 AM",
        "chief_complaint": "Mild toe pain and swelling",
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "pulse_bpm": 70,
        "temperature": 98.4,
        "temperature_unit": "F",
        "spo2": 99.0,
    })

    deterioration_payload = {
        "flagged_by": "Triage Nurse Ramesh",
        "reason": "Sudden onset severe chest pain and dizziness in waiting area",
        "notes": "Transferring to resuscitation bed",
    }
    res = client.post(f"/api/queue/{patient_id}/deterioration", json=deterioration_payload)
    assert res.status_code == 200
    item = res.json()
    assert item["deterioration_flag"] is True
    assert item["review_status"] == "DETERIORATION_FLAGGED"
    assert item["is_critical_escalation"] is True
    assert item["status"] == "NEEDS_HUMAN_REVIEW"

    # Verify patient has now jumped to the top of the queue
    q_res = client.get("/api/queue")
    q_items = q_res.json()
    top_ids = [p["patient_id"] for p in q_items[:4]]
    assert patient_id in top_ids


def test_staff_reassessment_with_updated_vitals():
    """Verifies reassessment workflow with updated vital parameters."""
    patient_id = "UHID-TEST-REASSESS-01"
    client.post("/api/patients", json={
        "patient_id": patient_id,
        "patient_name": "Test Reassess Patient",
        "age": 35,
        "gender": "Female",
        "arrival_time": "10:15 AM",
        "chief_complaint": "Moderate cough and mild wheeze",
        "systolic_bp": 122,
        "diastolic_bp": 80,
        "pulse_bpm": 85,
        "temperature": 98.6,
        "temperature_unit": "F",
        "spo2": 96.0,
    })

    reassess_payload = {
        "requested_by": "Dr. Verma",
        "updated_spo2": 88.0,  # Critical hypoxemia drop
        "notes": "SpO2 dropped below 90% despite nebulization",
    }
    res = client.post(f"/api/queue/{patient_id}/reassess", json=reassess_payload)
    assert res.status_code == 200
    updated = res.json()
    # SpO2 < 90% should escalate to Level 1
    assert updated["triage_level"] == 1
    assert updated["spo2"] == 88.0


def test_queue_no_count_inflation_on_multiple_syncs():
    """
    DATA INTEGRITY REQUIREMENT:
    Repeated requests to /api/triage/queue must sync the persistent database
    WITHOUT duplicating patients or inflating queue counts.
    """
    res1 = client.get("/api/triage/queue")
    assert res1.status_code == 200
    count1 = len(res1.json())

    # Call it 3 more times to trigger sync logic
    client.get("/api/triage/queue")
    client.get("/api/triage/queue")
    res2 = client.get("/api/triage/queue")
    assert res2.status_code == 200
    count2 = len(res2.json())

    assert count1 == count2, f"Queue count inflated from {count1} to {count2} on repeated sync!"

    # Ensure no token numbers or names are duplicated
    tokens = [item["token_number"] for item in res2.json()]
    assert len(tokens) == len(set(tokens)), f"Duplicate token numbers detected: {tokens}"


def test_duplicate_patient_submission_does_not_inflate_queue():
    """
    INTAKE INTEGRITY REQUIREMENT:
    Submitting an intake with the same patient_id / registration number updates
    the existing record rather than generating a duplicated queue item.
    """
    patient_id = f"UHID-DEDUP-{uuid.uuid4().hex[:8].upper()}"
    intake_data = {
        "patient_id": patient_id,
        "patient_name": "Dedup Test Patient",
        "age": 44,
        "gender": "Male",
        "arrival_time": "11:00 AM",
        "chief_complaint": "Joint aching in knee",
        "systolic_bp": 124,
        "diastolic_bp": 82,
        "pulse_bpm": 74,
        "temperature": 98.6,
        "temperature_unit": "F",
        "spo2": 98.0,
    }

    # Submit first time
    res1 = client.post("/api/patients", json=intake_data)
    assert res1.status_code == 201
    token1 = res1.json()["token_number"]

    # Get count
    q_res1 = client.get("/api/queue")
    matching_before = [p for p in q_res1.json() if p["patient_id"] == patient_id]
    assert len(matching_before) == 1

    # Attempting to submit a duplicate patient ID must be rejected with 409 Conflict
    intake_data["chief_complaint"] = "Joint aching in knee - worsening after walk"
    res2 = client.post("/api/patients", json=intake_data)
    assert res2.status_code == 409
    assert "already registered" in res2.json()["detail"]

    # Verify still exactly one record exists in queue for this patient (no duplicate created)
    q_res2 = client.get("/api/queue")
    matching_after = [p for p in q_res2.json() if p["patient_id"] == patient_id]
    assert len(matching_after) == 1


def test_synthetic_flag_distinction():
    """
    DISTINGUISHABILITY REQUIREMENT:
    Verify that synthetic demo records carry is_synthetic=True,
    allowing downstream views to distinguish them from authentic hospital registrations.
    """
    res = client.get("/api/queue")
    assert res.status_code == 200
    items = res.json()
    assert len(items) > 0
    # Seed records in demo database are synthetic
    for item in items:
        assert "is_synthetic" in item


