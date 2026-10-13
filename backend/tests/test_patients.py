import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import SessionLocal
from app.models import PatientModel, SafetyAuditModel

client = TestClient(app)


def test_create_patient_valid_intake():
    """Test valid patient intake record registration and response schema."""
    unique_id = f"TEST-PT-{uuid.uuid4().hex[:6]}"
    payload = {
        "patient_id": unique_id,
        "patient_name": "Kavitha Reddy",
        "age": 45,
        "gender": "Female",
        "arrival_time": "10:15",
        "chief_complaint": "Severe abdominal pain for 2 days radiating to back",
        "complaint_language": "Telugu",
        "known_conditions": ["Hypertension", "Type 2 Diabetes"],
        "medications": "Metformin 500mg, Amlodipine 5mg",
        "systolic_bp": 140,
        "diastolic_bp": 90,
        "pulse_bpm": 88,
        "temperature": 99.1,
        "temperature_unit": "F",
        "spo2": 97.0,
        "notes": "Walk-in patient accompanied by family member",
    }

    response = client.post("/api/patients", json=payload)
    assert response.status_code == 201, response.text
    data = response.json()

    assert data["patient_id"] == unique_id
    assert data["token_number"].startswith("OPD-")
    assert data["patient_name"] == "Kavitha Reddy"
    assert data["age"] == 45
    assert data["gender"] == "Female"
    assert data["chief_complaint"] == "Severe abdominal pain for 2 days radiating to back"
    assert data["complaint_language"] == "Telugu"
    assert "Hypertension" in data["known_conditions"]
    assert data["systolic_bp"] == 140
    assert data["diastolic_bp"] == 90
    assert data["pulse_bpm"] == 88
    assert data["status"] in ["WAITING", "NEEDS_HUMAN_REVIEW"]
    assert "safety_evaluation" in data
    assert data["safety_evaluation"]["rule_version"].startswith("2026.1")


def test_patient_id_collision_prevention():
    """Test that submitting an identical patient_id twice returns HTTP 409 Conflict."""
    collision_id = f"COLLISION-{uuid.uuid4().hex[:6]}"
    payload = {
        "patient_id": collision_id,
        "patient_name": "First Patient",
        "age": 30,
        "gender": "Male",
        "arrival_time": "09:00",
        "chief_complaint": "Persistent productive cough",
        "complaint_language": "English",
    }

    # First attempt should succeed
    res1 = client.post("/api/patients", json=payload)
    assert res1.status_code == 201

    # Second attempt with same ID must be rejected with 409
    res2 = client.post("/api/patients", json=payload)
    assert res2.status_code == 409
    assert "already registered" in res2.json()["detail"]


def test_create_patient_missing_optional_fields():
    """
    Test that optional clinical fields (BP, pulse, SpO2, temp) remain None/null.
    They must never be silently converted into arbitrary normal values.
    """
    unique_id = f"MINIMAL-{uuid.uuid4().hex[:6]}"
    payload = {
        "patient_id": unique_id,
        "patient_name": "Minimal Data Patient",
        "age": 28,
        "gender": "Other",
        "arrival_time": "11:30",
        "chief_complaint": "Sprained left ankle while playing cricket",
        "complaint_language": "English",
        # BP, pulse, temp, spo2 left completely omitted
    }

    response = client.post("/api/patients", json=payload)
    assert response.status_code == 201
    data = response.json()

    # Verify optional fields remain genuinely null
    assert data["systolic_bp"] is None
    assert data["diastolic_bp"] is None
    assert data["pulse_bpm"] is None
    assert data["temperature"] is None
    assert data["spo2"] is None

    # Verify safety evaluation flags missing measurements rather than fabricating defaults
    safety = data["safety_evaluation"]
    quality_codes = [issue["code"] for issue in safety["data_quality_issues"]]
    assert "MISSING_BP" in quality_codes
    assert "MISSING_PULSE" in quality_codes
    assert "MISSING_SPO2" in quality_codes
    assert "MISSING_TEMP" in quality_codes


def test_invalid_bp_relationship_rejected():
    """Test that invalid physiological entry (systolic <= diastolic) is rejected with 422."""
    payload = {
        "patient_name": "Invalid BP Patient",
        "age": 50,
        "gender": "Male",
        "arrival_time": "12:00",
        "chief_complaint": "General weakness",
        "complaint_language": "English",
        "systolic_bp": 80,
        "diastolic_bp": 120,  # Systolic < Diastolic is physiologically invalid
    }

    response = client.post("/api/patients", json=payload)
    assert response.status_code == 422
    assert "Systolic BP must be strictly greater than Diastolic BP" in str(response.json())


def test_get_patient_by_id_and_audit_persistence():
    """Test retrieving a patient record by patient_id and checking database persistence."""
    patient_id = f"RETRIEVE-{uuid.uuid4().hex[:6]}"
    create_payload = {
        "patient_id": patient_id,
        "patient_name": "Geeta Bai",
        "age": 62,
        "gender": "Female",
        "arrival_time": "08:45",
        "chief_complaint": "Dizziness and blurred vision since morning",
        "complaint_language": "Telugu",
        "systolic_bp": 170,
        "diastolic_bp": 105,
        "pulse_bpm": 92,
        "spo2": 95.0,
    }

    create_res = client.post("/api/patients", json=create_payload)
    assert create_res.status_code == 201

    # Fetch via GET /api/patients/{patient_id}
    get_res = client.get(f"/api/patients/{patient_id}")
    assert get_res.status_code == 200
    fetched = get_res.json()
    assert fetched["patient_id"] == patient_id
    assert fetched["patient_name"] == "Geeta Bai"
    assert fetched["systolic_bp"] == 170
    assert fetched["diastolic_bp"] == 105
    assert "safety_evaluation" in fetched

    # Verify persistence directly in SQLite via ORM session
    db = SessionLocal()
    try:
        db_patient = db.query(PatientModel).filter(PatientModel.patient_id == patient_id).first()
        assert db_patient is not None
        assert db_patient.patient_name == "Geeta Bai"

        db_audit = db.query(SafetyAuditModel).filter(SafetyAuditModel.patient_id == patient_id).first()
        assert db_audit is not None
        assert db_audit.rule_version.startswith("2026.1")
    finally:
        db.close()


def test_list_patients_and_search():
    """Test querying the patient list with search filter and pagination."""
    search_token = uuid.uuid4().hex[:5]
    name_to_search = f"Patient-{search_token}"
    client.post(
        "/api/patients",
        json={
            "patient_name": name_to_search,
            "age": 40,
            "gender": "Male",
            "arrival_time": "14:00",
            "chief_complaint": "Acute lower back spasm",
            "complaint_language": "English",
        },
    )

    # Search for this patient
    res = client.get(f"/api/patients?search={search_token}")
    assert res.status_code == 200
    data = res.json()
    assert "patients" in data
    assert data["total"] >= 1
    found = any(p["patient_name"] == name_to_search for p in data["patients"])
    assert found
