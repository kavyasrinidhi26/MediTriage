from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_triage_emergency_assessment():
    """Test critical patient triage triggers RED / EMERGENCY category."""
    payload = {
        "patient_name": "Emergency Patient",
        "age": 52,
        "gender": "Male",
        "chief_complaint": "Acute severe crushing chest pain, sweating",
        "symptom_duration_days": 0,
        "vitals": {
            "heart_rate": 135,
            "systolic_bp": 85,
            "diastolic_bp": 50,
            "respiratory_rate": 32,
            "spo2": 88.0,
            "temperature_f": 98.6,
            "avpu": "ALERT"
        },
        "red_flags": {
            "crushing_chest_pain": True
        }
    }
    response = client.post("/api/triage/assess", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["triage_category"] == "EMERGENCY"
    assert data["urgency_score"] >= 8
    assert len(data["red_flags_identified"]) > 0
    assert len(data["vital_abnormalities"]) > 0


def test_triage_routine_assessment():
    """Test stable patient with normal vitals receives GREEN / ROUTINE category."""
    payload = {
        "patient_name": "Routine Patient",
        "age": 30,
        "gender": "Female",
        "chief_complaint": "Mild skin allergy and itchy rash on forearm",
        "symptom_duration_days": 5,
        "vitals": {
            "heart_rate": 72,
            "systolic_bp": 118,
            "diastolic_bp": 76,
            "respiratory_rate": 16,
            "spo2": 99.0,
            "temperature_f": 98.4,
            "avpu": "ALERT"
        },
        "red_flags": {}
    }
    response = client.post("/api/triage/assess", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["triage_category"] == "ROUTINE"
    assert data["recommended_department"] == "Dermatology"


def test_triage_null_optional_vitals():
    """Test that patient intake with empty/null optional vitals evaluates safely."""
    payload = {
        "patient_name": "Minimal Vitals Patient",
        "age": 42,
        "gender": "Male",
        "chief_complaint": "Mild persistent headache",
        "vitals": {
            "avpu": "ALERT"
        },
        "red_flags": {}
    }
    response = client.post("/api/triage/assess", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["triage_category"] == "ROUTINE"
    assert "disclaimer" in data


def test_queue_enroll_and_status_update():
    """Test queue enrollment, listing, status update, and department filtering."""
    payload = {
        "patient_name": "Queue Test Patient",
        "age": 60,
        "gender": "Male",
        "chief_complaint": "Chronic knee joint pain",
        "vitals": {
            "heart_rate": 70,
            "systolic_bp": 120,
            "diastolic_bp": 80,
            "respiratory_rate": 16,
            "spo2": 98.0,
            "temperature_f": 98.6,
            "avpu": "ALERT"
        },
        "red_flags": {}
    }
    enroll_res = client.post("/api/triage/queue", json=payload)
    assert enroll_res.status_code == 201
    enrolled = enroll_res.json()
    patient_id = enrolled["id"]
    assert enrolled["token_number"].startswith("OPD-")

    # Update status to WITH_DOCTOR
    patch_res = client.patch(
        f"/api/triage/queue/{patient_id}/status",
        json={"status": "WITH_DOCTOR", "doctor_room": "Room 102"}
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "WITH_DOCTOR"

    # Filter queue by Orthopedics
    filter_res = client.get("/api/triage/queue?department=Orthopedics")
    assert filter_res.status_code == 200
    items = filter_res.json()
    assert any(i["id"] == patient_id for i in items)


def test_queue_listing():
    """Test queue listing and statistics endpoint."""
    response = client.get("/api/triage/queue")
    assert response.status_code == 200
    queue = response.json()
    assert isinstance(queue, list)
    assert len(queue) > 0

    stats_response = client.get("/api/triage/stats")
    assert stats_response.status_code == 200
    stats = stats_response.json()
    assert stats["total_patients"] >= len(queue)
