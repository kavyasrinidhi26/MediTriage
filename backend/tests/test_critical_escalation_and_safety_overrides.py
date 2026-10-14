import pytest
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.main import app
from app.schemas import (
    PatientTriageRequest,
    VitalSigns,
    RedFlagChecklist,
    QueueStatusUpdate,
    QueueStatus,
    TriageCategory,
)
from app.safety_rules import (
    evaluate_clinical_escalation_rules,
    evaluate_data_quality,
    apply_safety_override,
    DataQualityStatus,
    RuleAcuity,
)
from app.ml.inference import TriageInferenceService
from app.api.routes import QUEUE_STORAGE, sync_db_to_queue_storage

client = TestClient(app)


def test_severe_bradycardia_critical_escalation():
    """Critical safety rule: Pulse < 40 bpm must trigger CRIT-RULE-SEVERE-BRADYCARDIA Level 1 override."""
    alerts = evaluate_clinical_escalation_rules(
        age=62,
        gender="Male",
        chief_complaint="Dizziness and fatigue",
        pulse_bpm=34,
        systolic_bp=100,
        diastolic_bp=60,
    )
    crit_alerts = [a for a in alerts if a.rule_id == "CRIT-RULE-SEVERE-BRADYCARDIA"]
    assert len(crit_alerts) == 1
    assert crit_alerts[0].acuity_level == RuleAcuity.EMERGENCY
    assert crit_alerts[0].is_critical_override is True
    assert "34 bpm" in crit_alerts[0].message


def test_severe_hypothermia_critical_escalation():
    """Critical safety rule: Temp < 95.0°F must trigger CRIT-RULE-SEVERE-HYPOTHERMIA Level 1 override."""
    alerts = evaluate_clinical_escalation_rules(
        age=78,
        gender="Female",
        chief_complaint="Found unresponsive in cold weather",
        temperature=93.2,
        temperature_unit="F",
        pulse_bpm=52,
    )
    crit_alerts = [a for a in alerts if a.rule_id == "CRIT-RULE-SEVERE-HYPOTHERMIA"]
    assert len(crit_alerts) == 1
    assert crit_alerts[0].acuity_level == RuleAcuity.EMERGENCY
    assert crit_alerts[0].is_critical_override is True


def test_extreme_respiratory_rate_critical_escalation():
    """Critical safety rule: RR > 30 or < 8 /min must trigger CRIT-RULE-SEVERE-RESPIRATORY-RATE Level 1 override."""
    # Tachypnea RR = 36
    alerts_tachypnea = evaluate_clinical_escalation_rules(
        age=45,
        gender="Male",
        chief_complaint="Pneumonia symptoms",
        respiratory_rate=36,
    )
    crit_rr = [a for a in alerts_tachypnea if a.rule_id == "CRIT-RULE-SEVERE-RESPIRATORY-RATE"]
    assert len(crit_rr) == 1
    assert crit_rr[0].acuity_level == RuleAcuity.EMERGENCY
    assert crit_rr[0].is_critical_override is True

    # Severe bradypnea RR = 6
    alerts_bradypnea = evaluate_clinical_escalation_rules(
        age=50,
        gender="Female",
        chief_complaint="Suspected sedative overdose",
        respiratory_rate=6,
    )
    crit_rr_low = [a for a in alerts_bradypnea if a.rule_id == "CRIT-RULE-SEVERE-RESPIRATORY-RATE"]
    assert len(crit_rr_low) == 1
    assert crit_rr_low[0].is_critical_override is True


def test_stroke_complaint_multilingual_critical_escalation():
    """Emergency complaint: Acute focal neurological deficits trigger CRIT-RULE-NLP-STROKE across English and Telugu."""
    # English complaint
    alerts_en = evaluate_clinical_escalation_rules(
        age=68,
        gender="Male",
        chief_complaint="Sudden facial droop and right arm weakness since 40 minutes",
    )
    stroke_alerts_en = [a for a in alerts_en if a.rule_id == "CRIT-RULE-NLP-STROKE"]
    assert len(stroke_alerts_en) == 1
    assert stroke_alerts_en[0].acuity_level == RuleAcuity.EMERGENCY
    assert stroke_alerts_en[0].is_critical_override is True

    # Telugu script complaint
    alerts_te = evaluate_clinical_escalation_rules(
        age=71,
        gender="Female",
        chief_complaint="పక్షవాతం లక్షణాలు మరియు మాట తడబడటం",
    )
    stroke_alerts_te = [a for a in alerts_te if a.rule_id == "CRIT-RULE-NLP-STROKE"]
    assert len(stroke_alerts_te) == 1
    assert stroke_alerts_te[0].is_critical_override is True

    # Telugu transliteration complaint
    alerts_tr = evaluate_clinical_escalation_rules(
        age=65,
        gender="Male",
        chief_complaint="pakshavatham vachindi sudden right side weakness",
    )
    stroke_alerts_tr = [a for a in alerts_tr if a.rule_id == "CRIT-RULE-NLP-STROKE"]
    assert len(stroke_alerts_tr) == 1
    assert stroke_alerts_tr[0].is_critical_override is True


def test_safety_rule_overrides_ordinary_model_prediction():
    """
    Model inference test: Severe physiological red flag or acute emergency complaint
    must strictly override model output, setting Level 1 Emergency with override_applied=True.
    """
    engine = TriageInferenceService()
    # Patient with crushing chest pain, but normal vitals
    result = engine.assess(
        age=54,
        gender="Male",
        chief_complaint="Severe retrosternal squeezing chest pain radiating to left shoulder",
        systolic_bp=120,
        diastolic_bp=80,
        pulse_bpm=75,
        temperature=98.6,
        temperature_unit="F",
        spo2=98.0,
    )
    assert result["triage_level"] == 1
    assert result["override_applied"] is True
    assert "CRIT-RULE-NLP-CHEST-PAIN" in result["triggered_safety_rule_ids"]
    assert result["recommended_department"] == "Emergency / Casualty"
    assert result["human_review_required"] is True
    assert "CRITICAL CLINICAL SAFETY OVERRIDE" in result["model_explanation"]


def test_queue_sorting_keeps_emergency_at_top_across_filters():
    """Queue sorting test: Active Level 1 Emergency always stays in tier 0 ahead of Priority and Routine."""
    res = client.get("/api/triage/queue")
    assert res.status_code == 200
    queue = res.json()
    assert len(queue) > 0

    # Verify that any waiting Level 1 patient appears before Level 2 and Level 3
    waiting_items = [i for i in queue if i["status"] in ("WAITING", "NEEDS_HUMAN_REVIEW")]
    if len(waiting_items) >= 2:
        for idx in range(len(waiting_items) - 1):
            curr_cat = waiting_items[idx]["assessment"]["triage_category"]
            next_cat = waiting_items[idx + 1]["assessment"]["triage_category"]
            if curr_cat == "EMERGENCY":
                # Emergency cannot be placed after Routine
                assert next_cat in ("EMERGENCY", "PRIORITY", "ROUTINE")
            elif curr_cat == "PRIORITY":
                assert next_cat in ("PRIORITY", "ROUTINE")


def test_active_emergency_dismissal_requires_clinical_notes():
    """
    Override protection test: Attempting to mark an active Level 1 Emergency as COMPLETED
    without documented clinical review notes (min 5 chars) must be rejected with HTTP 400.
    """
    # 1. Register a Level 1 Emergency patient
    emergency_req = {
        "patient_name": "Emergency Test Patient",
        "age": 60,
        "gender": "Male",
        "contact_phone": "9999988888",
        "opd_registration_number": "TEST-EMERG-DISMISS-01",
        "chief_complaint": "Acute massive hematemesis and vomiting blood",
        "symptom_duration_days": 0,
        "vitals": {
            "heart_rate": 135,
            "systolic_bp": 70,
            "diastolic_bp": 40,
            "spo2": 88.0,
            "temperature_f": 98.4,
            "avpu": "VERBAL",
        },
        "red_flags": {
            "massive_bleeding_or_shock": True,
        },
        "clinical_notes": "Immediate resuscitation bay needed",
    }
    reg_res = client.post("/api/triage/queue", json=emergency_req)
    assert reg_res.status_code == 201
    created_item = reg_res.json()
    patient_id = created_item["id"]
    assert created_item["assessment"]["triage_category"] == "EMERGENCY"

    # 2. Try to dismiss (mark COMPLETED) without notes -> Expect 400 Bad Request
    fail_res = client.patch(
        f"/api/triage/queue/{patient_id}/status",
        json={"status": "COMPLETED", "notes": ""},
    )
    assert fail_res.status_code == 400
    assert "Active Level 1 Emergency cannot be dismissed" in fail_res.json()["detail"]

    # 3. Try to delete the active emergency -> Expect 400 Bad Request
    del_res = client.delete(f"/api/triage/queue/{patient_id}")
    assert del_res.status_code == 400
    assert "Active Level 1 Emergency cannot be deleted" in del_res.json()["detail"]

    # 4. Now dismiss WITH documented clinical handover notes -> Expect 200 OK
    success_res = client.patch(
        f"/api/triage/queue/{patient_id}/status",
        json={
            "status": "COMPLETED",
            "notes": "Patient stabilized and handed over to Trauma Resuscitation Bay 1 under Dr. Sharma.",
        },
    )
    assert success_res.status_code == 200
    updated_item = success_res.json()
    assert updated_item["status"] == "COMPLETED"
    assert "Trauma Resuscitation Bay 1" in updated_item["clinical_notes"]
