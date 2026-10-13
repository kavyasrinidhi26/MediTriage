"""
Unit & Integration Tests for POST /api/assessments
Tests ML model integration, clinical safety rules escalation, abstention logic,
missing values handling, and registered patient ID retrieval.
"""

import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.ml.inference import TriageInferenceService

client = TestClient(app)


def test_assessment_valid_prediction():
    """Test standard intake assessment evaluates cleanly through the decision flow."""
    payload = {
        "age": 34,
        "gender": "Female",
        "chief_complaint": "Moderate persistent cough and sore throat for 4 days",
        "complaint_language": "English",
        "known_conditions": ["None / Unknown"],
        "systolic_bp": 118,
        "diastolic_bp": 76,
        "pulse_bpm": 74,
        "temperature": 98.6,
        "temperature_unit": "F",
        "spo2": 98.0,
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["triage_level"] in [1, 2, 3, 4, 5]
    assert "triage_level_name" in data
    assert "recommended_department" in data
    assert data["abstention_status"] in ["EVALUATED", "SAFETY_OVERRIDE"]
    assert "model_version" in data
    assert "rules_version" in data
    assert "clinical_disclaimer" in data


def test_assessment_critical_rule_overrides_model():
    """
    Test that a validated critical rule (e.g. SpO2 = 82% critical hypoxemia)
    strictly escalates triage to Level 1 / Emergency (SAFETY_OVERRIDE),
    overriding any lower-urgency ML prediction.
    """
    payload = {
        "age": 62,
        "gender": "Male",
        "chief_complaint": "Shortness of breath and productive cough",
        "systolic_bp": 125,
        "diastolic_bp": 80,
        "pulse_bpm": 105,
        "temperature": 99.0,
        "temperature_unit": "F",
        "spo2": 82.0,  # Critical hypoxemia < 90%
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["triage_level"] == 1
    assert data["abstention_status"] == "SAFETY_OVERRIDE"
    assert data["recommended_department"] == "Emergency / Casualty"
    assert data["human_review_required"] is True
    assert "CRIT-RULE-HYPOXIA" in data["triggered_safety_rule_ids"]
    assert "OVERRIDE" in data["model_explanation"]


def test_assessment_pulse_zero_critical_override():
    """
    Test that pulse = 0 bpm triggers immediate Level 1 / Emergency override
    with cardiac arrest safety protocol.
    """
    payload = {
        "age": 50,
        "gender": "Male",
        "chief_complaint": "Sudden collapse in hospital foyer",
        "pulse_bpm": 0,
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["triage_level"] == 1
    assert data["abstention_status"] == "SAFETY_OVERRIDE"
    assert "CRIT-RULE-PULSE-0" in data["triggered_safety_rule_ids"]


def test_assessment_with_missing_optional_vitals():
    """
    Test that assessment handles missing optional vitals safely
    without crashing or fabricating default normal values.
    """
    payload = {
        "age": 25,
        "gender": "Other",
        "chief_complaint": "Twisted right ankle while running, mild swelling",
        # BP, pulse, temp, spo2 left completely omitted
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["triage_level"] in [1, 2, 3, 4, 5]
    assert len(data["missing_data_warnings"]) > 0
    assert any("Blood pressure was not recorded" in w or "blood_pressure" in w.lower() for w in data["missing_data_warnings"])


def test_assessment_abstention_on_data_quality_hold():
    """
    Test that contradictory input (e.g. pulse = 0 entered for a walking patient)
    triggers explicit ABSTAINED_DATA_QUALITY_HOLD.
    Crucially: Patient is placed in Priority holding status, NEVER at the back of the queue.
    """
    payload = {
        "age": 40,
        "gender": "Female",
        "chief_complaint": "Patient walked into the OPD counter complaining of mild sore throat",
        "pulse_bpm": 0,  # Contradiction: Pulseless 0 bpm for an alert walking patient
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["abstention_status"] == "ABSTAINED_DATA_QUALITY_HOLD"
    # Never placed at routine / back of queue (level must be <= 2)
    assert data["triage_level"] <= 2
    assert data["human_review_required"] is True
    assert "CONTRADICTORY_AMBULATORY_PULSELESS" in data["triggered_safety_rule_ids"]


def test_assessment_fallback_when_model_unavailable(monkeypatch):
    """
    Test that when model artifacts cannot be loaded, the system abstains gracefully
    to rules-based safety evaluation (ABSTAINED_MODEL_UNAVAILABLE) without fabricating predictions.
    """
    # Create an uninitialized inference service pointing to non-existent directory
    mock_service = TriageInferenceService(artifacts_dir="/non/existent/path")
    assert mock_service.is_loaded is False

    from app.api import routes
    monkeypatch.setattr(routes, "inference_service", mock_service)

    payload = {
        "age": 30,
        "gender": "Male",
        "chief_complaint": "Mild headache for 2 days",
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["abstention_status"] == "ABSTAINED_MODEL_UNAVAILABLE"
    assert data["model_version"] == "none"
    assert data["human_review_required"] is True


def test_assessment_from_registered_patient_id():
    """
    Test assessing a registered patient by passing patient_id from the database.
    """
    unique_id = f"REG-TEST-{uuid.uuid4().hex[:6]}"
    intake_payload = {
        "patient_id": unique_id,
        "patient_name": "Ravi Teja",
        "age": 48,
        "gender": "Male",
        "arrival_time": "15:20",
        "chief_complaint": "Severe retrosternal squeezing chest pain radiating to left jaw",
        "complaint_language": "Telugu",
        "systolic_bp": 85,  # Hypotension / shock boundary
        "diastolic_bp": 55,
        "pulse_bpm": 124,
        "spo2": 91.0,
    }

    # 1. Register intake
    reg_res = client.post("/api/patients", json=intake_payload)
    assert reg_res.status_code == 201

    # 2. Assess referencing patient_id only
    assess_res = client.post("/api/assessments", json={"patient_id": unique_id})
    assert assess_res.status_code == 200
    assess_data = assess_res.json()

    assert assess_data["triage_level"] == 1
    assert assess_data["abstention_status"] == "SAFETY_OVERRIDE"
    assert "CRIT-RULE-SHOCK-BP" in assess_data["triggered_safety_rule_ids"]


def test_assessment_priority_rule_override():
    """
    Test that a clinical priority finding (e.g. urgent tachycardia pulse 115)
    elevates acuity to at least Level 2 / Priority, overriding routine classification.
    """
    payload = {
        "age": 35,
        "gender": "Female",
        "chief_complaint": "Persistent fast heart rate and palpitations with dizziness",
        "temperature": 98.6,
        "temperature_unit": "F",
        "pulse_bpm": 115,  # Triggers WARN-RULE-TACHYCARDIA (Priority)
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "spo2": 97.0,
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Must be elevated to at least Level 2 (Priority)
    assert data["triage_level"] <= 2
    assert "WARN-RULE-TACHYCARDIA" in data["triggered_safety_rule_ids"]
    assert data["human_review_required"] is True


def test_assessment_emergency_flag_not_confirmed_diagnosis():
    """
    Safety requirement: Verify that an emergency flag from the model alone
    is accompanied by the explicit disclaimer that it does NOT constitute a confirmed medical diagnosis.
    """
    payload = {
        "age": 55,
        "gender": "Male",
        "chief_complaint": "Severe crushing retrosternal chest pain radiating to left arm",
        "pulse_bpm": 110,
        "systolic_bp": 140,
        "diastolic_bp": 90,
        "spo2": 96.0,
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    data = response.json()

    disclaimer = data["clinical_disclaimer"]
    assert "not constitute a confirmed medical diagnosis" in disclaimer.lower() or "physician" in disclaimer.lower()
    assert "decision support" in disclaimer.lower() or "prototype" in disclaimer.lower()


def test_assessment_abstention_never_places_at_end_of_queue():
    """
    Safety requirement: Verify that abstention (data quality hold or model unavailable)
    never silently sends a patient to routine OPD priority / end of queue (level must be <= 2).
    """
    # Case A: Data quality hold
    res_dq = client.post("/api/assessments", json={
        "age": 20,
        "gender": "Male",
        "chief_complaint": "Alert patient walking in",
        "pulse_bpm": 0,  # Contradictory pulselessness
    })
    assert res_dq.status_code == 200
    data_dq = res_dq.json()
    assert data_dq["abstention_status"].startswith("ABSTAINED_")
    assert data_dq["triage_level"] <= 2
    assert (
        "Cannot assess — send to nurse now." in data_dq["triage_level_name"]
        or "Holding" in data_dq["triage_level_name"]
        or "Priority" in data_dq["triage_level_name"]
    )


def test_assessment_never_fabricates_confidence_percentage():
    """
    Safety requirement: Verify that no made-up confidence percentages
    or fabricated metrics appear in assessment responses.
    """
    payload = {
        "age": 28,
        "gender": "Female",
        "chief_complaint": "Mild superficial scratch on index finger",
        "pulse_bpm": 72,
        "systolic_bp": 115,
        "diastolic_bp": 75,
        "spo2": 99.0,
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "% model confidence" not in data["model_explanation"]
    assert "confidence_score" not in data
    assert "confidence_percentage" not in data


def test_assessment_latency_under_60_seconds():
    """
    Requirement 10: Measured assessment latency of 60 seconds or less.
    Verifies that end-to-end inference and safety validation completes well within 60s (typically < 0.5s).
    """
    import time

    payload = {
        "age": 45,
        "gender": "Male",
        "chief_complaint": "Acute onset retrosternal crushing chest pain radiating to left jaw with cold sweats",
        "systolic_bp": 92,
        "diastolic_bp": 58,
        "pulse_bpm": 118,
        "temperature": 98.4,
        "temperature_unit": "F",
        "spo2": 91.0,
    }

    start_time = time.perf_counter()
    response = client.post("/api/assessments", json=payload)
    duration = time.perf_counter() - start_time

    assert response.status_code == 200
    # Must strictly satisfy Requirement 10 (latency <= 60 seconds)
    assert duration < 60.0
    # Strict internal SLA benchmark (< 2.0 seconds)
    assert duration < 2.0


def test_explicit_abstention_nurse_phrase():
    """
    Requirement 9: Explicit abstention phrasing 'Cannot assess — send to nurse now.'
    When data quality issues or low confidence prevent reliable assessment, the engine must
    issue the required clinical abstention directive.
    """
    payload = {
        "age": 30,
        "gender": "Female",
        "chief_complaint": "Patient walking and eating snack",
        "pulse_bpm": 0,  # Contradiction: Pulseless alert ambulatory patient
    }

    response = client.post("/api/assessments", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["triage_level_name"] == "Cannot assess — send to nurse now."
    assert "Cannot assess — send to nurse now." in data["clinical_disclaimer"]

