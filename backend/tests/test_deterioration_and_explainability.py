import uuid
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_deterioration_watch_flow_and_missing_observations():
    """
    Verifies that deterioration watch displays only recorded values,
    identifies missing observations, and shows deltas when multiple observations exist.
    """
    unique_id = "TEST-W-" + uuid.uuid4().hex[:6]
    create_payload = {
        "patient_id": unique_id,
        "patient_name": "Test Watch Patient",
        "age": 42,
        "gender": "Female",
        "arrival_time": "10:15",
        "chief_complaint": "Persistent headache and nausea for 2 days",
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "pulse_bpm": 76,
        "spo2": 98.0,
        "temperature": 98.6,
        "temperature_unit": "F",
    }
    resp = client.post("/api/patients", json=create_payload)
    assert resp.status_code == 201
    p_data = resp.json()
    patient_id = p_data["patient_id"]

    # Query deterioration watch
    watch_resp = client.get(f"/api/patients/{patient_id}/deterioration-watch")
    assert watch_resp.status_code == 200
    w_data = watch_resp.json()

    assert w_data["patient_id"] == patient_id
    assert w_data["rule_evaluation_configured"] is True

    # Check observations list: respiratory rate should be marked missing because unrecorded
    obs_map = {item["observation_type"]: item for item in w_data["observations"]}
    assert "RESPIRATORY_RATE" in obs_map
    assert obs_map["RESPIRATORY_RATE"]["is_missing"] is True
    assert obs_map["RESPIRATORY_RATE"]["current_value"] is None

    # Check SpO2
    assert "SPO2" in obs_map
    assert obs_map["SPO2"]["is_missing"] is False
    assert obs_map["SPO2"]["current_value"] == 98.0


def test_record_observation_and_trigger_warning():
    """
    Verifies authorized staff can record new observations, triggering a configured
    physiological warning rule (e.g. SpO2 < 92%) and flagging patient for reassessment.
    """
    unique_id = "TEST-HYP-" + uuid.uuid4().hex[:6]
    create_payload = {
        "patient_id": unique_id,
        "patient_name": "Hypoxia Test Patient",
        "age": 60,
        "gender": "Male",
        "arrival_time": "11:00",
        "chief_complaint": "Increasing shortness of breath",
        "systolic_bp": 115,
        "diastolic_bp": 75,
        "pulse_bpm": 88,
        "spo2": 95.0,
    }
    p_resp = client.post("/api/patients", json=create_payload)
    assert p_resp.status_code == 201
    patient_id = p_resp.json()["patient_id"]

    # Staff records acute desaturation: SpO2 drops to 89.0%
    obs_payload = {
        "observation_type": "SPO2",
        "value": 89.0,
        "unit": "%",
        "recorded_by": "Staff Nurse Priya",
        "notes": "Patient appears cyanotic on room air",
    }
    obs_resp = client.post(f"/api/patients/{patient_id}/observations", json=obs_payload)
    assert obs_resp.status_code == 201
    obs_data = obs_resp.json()
    assert obs_data["value"] == 89.0
    assert obs_data["recorded_by"] == "Staff Nurse Priya"

    # Verify Deterioration Watch shows active warning and patient is flagged
    watch_resp = client.get(f"/api/patients/{patient_id}/deterioration-watch")
    assert watch_resp.status_code == 200
    w_data = watch_resp.json()
    assert w_data["deterioration_flag"] is True

    # Active warning should include CRIT-WARN-SPO2-HYPOXIA
    warn_ids = [w["warning_id"] for w in w_data["active_warnings"]]
    assert "CRIT-WARN-SPO2-HYPOXIA" in warn_ids

    # Find the warning and acknowledge it
    hypoxia_warn = next(w for w in w_data["active_warnings"] if w["warning_id"] == "CRIT-WARN-SPO2-HYPOXIA")
    assert hypoxia_warn["status"] == "PENDING_REVIEW"

    ack_payload = {
        "acknowledged_by": "Dr. R. Sharma",
        "notes": "Administering 4L oxygen via nasal cannula; ordering urgent ABG",
        "status": "REASSESSMENT_IN_PROGRESS",
    }
    ack_resp = client.post(
        f"/api/patients/{patient_id}/warnings/{hypoxia_warn['warning_id']}/acknowledge",
        json=ack_payload,
    )
    assert ack_resp.status_code == 200
    ack_data = ack_resp.json()
    assert ack_data["status"] == "REASSESSMENT_IN_PROGRESS"
    assert ack_data["acknowledged_by"] == "Dr. R. Sharma"


def test_rules_unconfigured_preserves_structure_without_arbitrary_scores():
    """
    If no approved rule set exists or rules are not configured,
    the panel structure must be preserved with rule_evaluation_configured=False
    and zero automated warnings generated.
    """
    unique_id = "TEST-UNCONF-" + uuid.uuid4().hex[:6]
    create_payload = {
        "patient_id": unique_id,
        "patient_name": "Unconfigured Rules Patient",
        "age": 35,
        "gender": "Female",
        "arrival_time": "11:30",
        "chief_complaint": "Mild fever and sore throat",
        "systolic_bp": 85,
        "diastolic_bp": 55,
        "spo2": 90.0,
    }
    p_resp = client.post("/api/patients", json=create_payload)
    assert p_resp.status_code == 201
    patient_id = p_resp.json()["patient_id"]

    watch_resp = client.get(f"/api/patients/{patient_id}/deterioration-watch?rules_configured=false")
    assert watch_resp.status_code == 200
    w_data = watch_resp.json()
    assert w_data["rule_evaluation_configured"] is False
    assert len(w_data["active_warnings"]) == 0
    assert len(w_data["observations"]) > 0


def test_clinician_triage_assignment_and_separation():
    """
    Verifies authorized clinicians can record clinician-assigned triage
    with notes, and that it remains clearly distinguished from automated suggestions.
    """
    unique_id = "TEST-CLIN-" + uuid.uuid4().hex[:6]
    create_payload = {
        "patient_id": unique_id,
        "patient_name": "Clinician Override Patient",
        "age": 50,
        "gender": "Male",
        "arrival_time": "12:00",
        "chief_complaint": "Generalized weakness",
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "pulse_bpm": 80,
    }
    p_resp = client.post("/api/patients", json=create_payload)
    assert p_resp.status_code == 201
    patient_id = p_resp.json()["patient_id"]

    # Clinician reviews and assigns Level 2
    clinician_payload = {
        "clinician_name": "Dr. Anita Desai (CMO)",
        "triage_level": 2,
        "triage_name": "Emergent / High Risk",
        "notes": "Patient has subtle diaphoresis and history of CAD; escalating to Level 2 for continuous ECG monitoring.",
    }
    c_resp = client.post(f"/api/patients/{patient_id}/clinician-triage", json=clinician_payload)
    assert c_resp.status_code == 200
    c_data = c_resp.json()
    assert c_data["clinician_triage_level"] == 2
    assert c_data["clinician_reviewed_by"] == "Dr. Anita Desai (CMO)"

    # Verify explainable assessment displays clinician-assigned triage
    exp_resp = client.get(f"/api/patients/{patient_id}/explainable-assessment")
    assert exp_resp.status_code == 200
    exp_data = exp_resp.json()

    assert exp_data["clinician_assigned_triage"]["clinician_triage_level"] == 2
    assert exp_data["clinician_assigned_triage"]["clinician_reviewed_by"] == "Dr. Anita Desai (CMO)"
    assert exp_data["effective_triage_level"] == 2


def test_explainable_assessment_breakdown_and_evidence():
    """
    Tests that Explainable Assessment returns separate sections for
    clinician triage, AI suggestion, rule warnings, evidence, missing information,
    and audit history.
    """
    unique_id = "TEST-EXP-" + uuid.uuid4().hex[:6]
    create_payload = {
        "patient_id": unique_id,
        "patient_name": "Cardiac Breakdown Patient",
        "age": 62,
        "gender": "Male",
        "arrival_time": "12:15",
        "chief_complaint": "Severe crushing chest pain radiating to left shoulder",
        "systolic_bp": 85,
        "diastolic_bp": 55,
        "pulse_bpm": 128,
        "spo2": 91.0,
    }
    p_resp = client.post("/api/patients", json=create_payload)
    assert p_resp.status_code == 201
    patient_id = p_resp.json()["patient_id"]

    exp_resp = client.get(f"/api/patients/{patient_id}/explainable-assessment")
    assert exp_resp.status_code == 200
    data = exp_resp.json()

    # 1. Clinician assigned triage should be None initially
    assert data["clinician_assigned_triage"]["clinician_triage_level"] is None

    # 2. AI model suggestion
    assert "ai_model_suggestion" in data
    assert "available" in data["ai_model_suggestion"]

    # 3. Rule based warnings
    rule_ids = [rw["rule_id"] for rw in data["rule_based_warnings"]]
    assert any("CRIT-RULE" in r for r in rule_ids)

    # 4. Evidence
    assert len(data["evidence"]["vital_abnormalities"]) > 0
    assert any("Hypoxemia" in v or "Hypotension" in v for v in data["evidence"]["vital_abnormalities"])

    # 5. Missing information
    assert "Respiratory Rate" in " ".join(data["missing_information"]["missing_vital_signs"])

    # 6. Audit history
    assert len(data["audit_history"]) > 0


def test_explainable_assessment_missing_model_output(monkeypatch):
    """
    Verifies that when model output is missing or inference engine is unavailable/abstained,
    the explainable assessment reports available=False without inventing confidence or level,
    and includes the mandatory clinical advisory disclaimer.
    """
    from app.api.routes import inference_service

    unique_id = "TEST-ABSTAIN-" + uuid.uuid4().hex[:6]
    create_payload = {
        "patient_id": unique_id,
        "patient_name": "Model Unavailable Patient",
        "age": 45,
        "gender": "Female",
        "arrival_time": "13:00",
        "chief_complaint": "General health checkup",
        "systolic_bp": 120,
        "diastolic_bp": 80,
        "pulse_bpm": 76,
        "spo2": 98.0,
    }
    p_resp = client.post("/api/patients", json=create_payload)
    assert p_resp.status_code == 201
    patient_id = p_resp.json()["patient_id"]

    # Temporarily simulate unloaded / unavailable model inference service
    monkeypatch.setattr(inference_service, "is_loaded", False)

    exp_resp = client.get(f"/api/patients/{patient_id}/explainable-assessment")
    assert exp_resp.status_code == 200
    data = exp_resp.json()

    ai_info = data["ai_model_suggestion"]
    assert ai_info["available"] is False
    assert ai_info["suggested_level"] is None
    assert ai_info["raw_suggested_level"] is None
    assert "ABSTAINED" in (ai_info["abstention_status"] or "")
    assert "assistive suggestion only" in ai_info["disclaimer"]
    assert "medical diagnosis" in ai_info["disclaimer"]


def test_explainable_assessment_triggered_rules():
    """
    Verifies that when critical physiological thresholds are breached,
    triggered rule IDs and descriptions are clearly exposed with is_critical_override=True,
    and supporting observations are documented.
    """
    unique_id = "TEST-RULES-" + uuid.uuid4().hex[:6]
    create_payload = {
        "patient_id": unique_id,
        "patient_name": "Hypoxic Shock Patient",
        "age": 68,
        "gender": "Male",
        "arrival_time": "13:15",
        "chief_complaint": "Acute respiratory distress and pale diaphoresis",
        "systolic_bp": 78,
        "diastolic_bp": 48,
        "pulse_bpm": 136,
        "spo2": 82.0,
        "temperature": 99.1,
    }
    p_resp = client.post("/api/patients", json=create_payload)
    assert p_resp.status_code == 201
    patient_id = p_resp.json()["patient_id"]

    exp_resp = client.get(f"/api/patients/{patient_id}/explainable-assessment")
    assert exp_resp.status_code == 200
    data = exp_resp.json()

    # Must contain triggered rules with CRIT identifiers
    rule_warnings = data["rule_based_warnings"]
    assert len(rule_warnings) > 0
    rule_ids = [rw["rule_id"] for rw in rule_warnings]
    assert any("CRIT" in rid for rid in rule_ids)

    # Verify critical override flag and clinical explanation
    hypoxemia_rule = next(rw for rw in rule_warnings if "SPO2" in rw["rule_id"] or rw["is_critical_override"])
    assert hypoxemia_rule["is_critical_override"] is True
    assert len(hypoxemia_rule["clinical_explanation"]) > 0
    assert len(hypoxemia_rule["required_human_verification"]) > 0

    # Vital abnormalities must reflect the physiological derangements
    vital_abnormalities = data["evidence"]["vital_abnormalities"]
    assert any("Hypoxemia" in v for v in vital_abnormalities)
    assert any("Hypotension" in v for v in vital_abnormalities)
    assert any("Tachycardia" in v for v in vital_abnormalities)


def test_explainable_assessment_overrides_and_audit():
    """
    Verifies that clinician overrides are recorded with full rationale,
    timestamp, and reviewer identity, and that unreviewed patients do NOT
    claim a clinician review without a recorded action.
    """
    unique_id = "TEST-OVERRIDE-" + uuid.uuid4().hex[:6]
    create_payload = {
        "patient_id": unique_id,
        "patient_name": "Potential ACS Patient",
        "age": 55,
        "gender": "Male",
        "arrival_time": "13:30",
        "chief_complaint": "Atypical epigastric burning with left arm numbness",
        "systolic_bp": 130,
        "diastolic_bp": 85,
        "pulse_bpm": 82,
        "spo2": 97.0,
    }
    p_resp = client.post("/api/patients", json=create_payload)
    assert p_resp.status_code == 201
    patient_id = p_resp.json()["patient_id"]

    # Initial check: Clinician review MUST be None
    init_exp = client.get(f"/api/patients/{patient_id}/explainable-assessment").json()
    assert init_exp["clinician_assigned_triage"]["clinician_triage_level"] is None
    assert init_exp["clinician_assigned_triage"]["clinician_reviewed_by"] is None

    # Record Clinician Override
    override_payload = {
        "clinician_name": "Dr. Ramesh Gupta (Attending Physician)",
        "triage_level": 1,
        "triage_name": "Level 1 - Resuscitation",
        "notes": "ECG reveals hyperacute T-waves in V1-V4; escalating to Resuscitation Bay for immediate cath lab activation.",
    }
    override_resp = client.post(f"/api/patients/{patient_id}/clinician-triage", json=override_payload)
    assert override_resp.status_code == 200

    # Re-query explainable assessment: Check clinician-assigned triage and audit history
    updated_exp = client.get(f"/api/patients/{patient_id}/explainable-assessment").json()
    clinician_info = updated_exp["clinician_assigned_triage"]
    assert clinician_info["clinician_triage_level"] == 1
    assert clinician_info["clinician_triage_name"] == "Level 1 - Resuscitation"
    assert clinician_info["clinician_reviewed_by"] == "Dr. Ramesh Gupta (Attending Physician)"
    assert "hyperacute T-waves" in clinician_info["clinician_triage_notes"]
    assert clinician_info["clinician_reviewed_at"] is not None

    # Check audit history trail
    audits = updated_exp["audit_history"]
    assert len(audits) > 0
    override_audit = next(a for a in audits if a["action_type"] == "CLINICIAN_TRIAGE_OVERRIDE")
    assert override_audit["performed_by"] == "Dr. Ramesh Gupta (Attending Physician)"
    assert "hyperacute T-waves" in override_audit["notes"]


def test_explainable_assessment_normal_assessment():
    """
    Verifies that a patient with benign, normal vitals produces:
    - 0 rule-based warnings
    - 0 red-flag alerts
    - 0 vital abnormalities
    - Clean missing information breakdown
    """
    unique_id = "TEST-NORMAL-" + uuid.uuid4().hex[:6]
    create_payload = {
        "patient_id": unique_id,
        "patient_name": "Routine Dermatology Followup",
        "age": 28,
        "gender": "Female",
        "arrival_time": "14:00",
        "chief_complaint": "Routine follow up for mild acne treatment",
        "systolic_bp": 118,
        "diastolic_bp": 76,
        "pulse_bpm": 72,
        "spo2": 99.0,
        "temperature": 98.4,
    }
    p_resp = client.post("/api/patients", json=create_payload)
    assert p_resp.status_code == 201
    patient_id = p_resp.json()["patient_id"]

    exp_resp = client.get(f"/api/patients/{patient_id}/explainable-assessment")
    assert exp_resp.status_code == 200
    data = exp_resp.json()

    # Rule based warnings must be completely empty
    assert len(data["rule_based_warnings"]) == 0

    # Evidence: No red flags and no vital abnormalities
    assert len(data["evidence"]["recorded_red_flags"]) == 0
    assert len(data["evidence"]["vital_abnormalities"]) == 0
    assert len(data["evidence"]["supporting_observations"]) > 0

    # Clinician review unrecorded
    assert data["clinician_assigned_triage"]["clinician_triage_level"] is None

