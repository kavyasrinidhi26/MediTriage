"""
Tests for intake-data validation, vital-sign safety handling, multilingual complaints,
and synthetic dataset generation requirements.
"""

import os
import pytest
import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.ml.inference import TriageInferenceService
from app.safety_rules import (
    evaluate_data_quality,
    evaluate_clinical_escalation_rules,
    apply_safety_override,
    DataQualityStatus,
)
from app.ml.synthetic_data import (
    generate_synthetic_fixture,
    generate_and_save_dataset_30k,
)
from app.db import get_db
from app.models import PatientModel


client = TestClient(app)


# ============================================================================
# 1. Missing Vital-Sign Entries Handling
# ============================================================================

def test_missing_vitals_not_defaulted_to_normal():
    """
    Missing vitals must NOT be silently replaced with normal values
    (e.g., BP != 120/80, SpO2 != 98%, Temp != 98.6F).
    Instead, they must be flagged as MISSING and reported to staff.
    """
    issues = evaluate_data_quality(
        age=35,
        gender="Female",
        chief_complaint="Persistent dry cough for two days",
        systolic_bp=None,
        diastolic_bp=None,
        pulse_bpm=None,
        temperature=None,
        spo2=None,
    )

    issue_codes = [i.code for i in issues]
    assert "MISSING_BP" in issue_codes, "Missing BP must be explicitly flagged."
    assert "MISSING_PULSE" in issue_codes, "Missing pulse must be explicitly flagged."
    assert "MISSING_TEMP" in issue_codes, "Missing temperature must be explicitly flagged."
    assert "MISSING_SPO2" in issue_codes, "Missing SpO2 must be explicitly flagged."

    # Verify messages state that normal values are NOT assumed
    bp_issue = next(i for i in issues if i.code == "MISSING_BP")
    assert "NOT be assumed normal" in bp_issue.message

    spo2_issue = next(i for i in issues if i.code == "MISSING_SPO2")
    assert "NOT be assumed normal" in spo2_issue.message


def test_missing_single_bp_component_blocks():
    """Providing only systolic or only diastolic BP is incomplete and must block auto-triage."""
    issues_sys_only = evaluate_data_quality(
        age=40,
        gender="Male",
        chief_complaint="Mild headache",
        systolic_bp=120,
        diastolic_bp=None,
    )
    assert any(i.code == "INCOMPLETE_BP_DIASTOLIC" and i.is_blocking for i in issues_sys_only)

    issues_dia_only = evaluate_data_quality(
        age=40,
        gender="Male",
        chief_complaint="Mild headache",
        systolic_bp=None,
        diastolic_bp=80,
    )
    assert any(i.code == "INCOMPLETE_BP_SYSTOLIC" and i.is_blocking for i in issues_dia_only)


# ============================================================================
# 2. Non-Numeric, String, and Malformed Vital-Sign Entries
# ============================================================================

def test_non_numeric_and_empty_vital_entries():
    """
    Inputs such as 'N/A', '', 'unknown', or floating string values must be handled
    gracefully without raising TypeError or ValueError.
    """
    issues = evaluate_data_quality(
        age=45,
        gender="Female",
        chief_complaint="General weakness and fatigue",
        systolic_bp="not_a_number",  # malformed string
        diastolic_bp="",              # empty string
        pulse_bpm="invalid_pulse",    # malformed string
        temperature="101.5",          # valid numeric string
        temperature_unit="F",
        spo2="98",                    # valid numeric string
    )

    issue_codes = [i.code for i in issues]
    assert "MALFORMED_SYSTOLIC_BP" in issue_codes
    assert "MALFORMED_PULSE_BPM" in issue_codes
    # Valid numeric strings should be parsed without malformed errors
    assert "MALFORMED_TEMP" not in issue_codes
    assert "MALFORMED_SPO2" not in issue_codes


# ============================================================================
# 3. Explicit Tests: BP = 0 and Temperature = 96°C
# ============================================================================

def test_bp_zero_explicit_handling():
    """
    Systolic BP = 0 or Diastolic BP = 0 must trigger ZERO_BLOOD_PRESSURE data error,
    flagging non-viable reading requiring manual carotid/radial pulse check.
    In the absence of a life-threatening red flag, the system must abstain with
    'Cannot assess — send to nurse now.'
    """
    issues = evaluate_data_quality(
        age=50,
        gender="Male",
        chief_complaint="Dizziness upon standing",
        systolic_bp=0,
        diastolic_bp=0,
        pulse_bpm=72,
    )

    zero_bp_issue = next((i for i in issues if i.code == "ZERO_BLOOD_PRESSURE"), None)
    assert zero_bp_issue is not None, "ZERO_BLOOD_PRESSURE must be raised for BP = 0."
    assert zero_bp_issue.is_blocking is True
    assert "0 mmHg" in zero_bp_issue.message
    assert "carotid" in zero_bp_issue.message.lower()

    # Safety override behavior
    result = apply_safety_override(
        data_quality_issues=issues,
        clinical_alerts=[],
        model_prediction="ROUTINE",
    )
    assert result.final_urgency_level == "Cannot assess — send to nurse now."
    assert result.is_data_acceptable is False


def test_temperature_96_celsius_explicit_handling():
    """
    Temperature = 96°C is physically impossible for a living human and indicates a unit entry error.
    It must be caught by OUT_OF_RANGE_TEMP_C and trigger an explicit abstention.
    """
    issues = evaluate_data_quality(
        age=30,
        gender="Female",
        chief_complaint="Fever and body aches",
        systolic_bp=120,
        diastolic_bp=80,
        pulse_bpm=80,
        temperature=96.0,
        temperature_unit="C",
        spo2=98.0,
    )

    temp_c_issue = next((i for i in issues if i.code == "OUT_OF_RANGE_TEMP_C"), None)
    assert temp_c_issue is not None, "OUT_OF_RANGE_TEMP_C must be raised for 96°C."
    assert temp_c_issue.is_blocking is True
    assert "96.0°C" in temp_c_issue.message or "96°C" in temp_c_issue.message

    result = apply_safety_override(
        data_quality_issues=issues,
        clinical_alerts=[],
        model_prediction="ROUTINE",
    )
    assert result.final_urgency_level == "Cannot assess — send to nurse now."


def test_temperature_96_fahrenheit_hypothermia_flag():
    """
    Temperature = 96.0°F is a valid borderline measurement requiring hypothermia
    clinical verification alert (CRIT-RULE-TEMP-96-HYPOTHERMIA).
    """
    alerts = evaluate_clinical_escalation_rules(
        systolic_bp=120,
        diastolic_bp=80,
        pulse_bpm=75,
        temperature=96.0,
        temperature_unit="F",
        spo2=98.0,
    )

    hypo_alert = next((a for a in alerts if a.rule_id == "CRIT-RULE-TEMP-96-HYPOTHERMIA"), None)
    assert hypo_alert is not None, "CRIT-RULE-TEMP-96-HYPOTHERMIA must be triggered for 96.0°F."
    assert "Hypothermia" in hypo_alert.rule_name


# ============================================================================
# 4. Safety Invariant: Emergency Complaints Never Suppressed by Data Errors
# ============================================================================

def test_emergency_complaint_not_suppressed_by_bp_zero():
    """
    SAFETY INVARIANT:
    A patient with a critical complaint (e.g., crushing chest pain) who has BP = 0
    must NOT be downgraded to routine or delayed in holding.
    Emergency status (Level 1 Resuscitation) MUST be preserved with a concurrent data warning.
    """
    service = TriageInferenceService()

    result = service.assess(
        age=58,
        gender="Male",
        chief_complaint="Severe crushing retrosternal chest pain radiating to left arm with profuse sweating",
        systolic_bp=0,
        diastolic_bp=0,
        pulse_bpm=80,
        temperature=98.6,
        temperature_unit="F",
        spo2=95.0,
    )

    assert result["triage_level"] == 1, "Crushing chest pain must remain Level 1 despite BP = 0."
    assert result["recommended_department"] == "Emergency / Casualty"
    assert result["model_emergency_flag"] is True
    assert result["human_review_required"] is True
    # The data error must be noted, not ignored
    assert any("0 mmHg" in w for w in result["invalid_data_warnings"])


def test_emergency_complaint_not_suppressed_by_temp_96_celsius():
    """
    A patient with acute respiratory distress with temperature mistyped as 96°C
    must remain Level 1 Emergency / Casualty.
    """
    service = TriageInferenceService()

    result = service.assess(
        age=62,
        gender="Female",
        chief_complaint="Gasping for air, severe breathlessness and cyanosis",
        systolic_bp=130,
        diastolic_bp=85,
        pulse_bpm=110,
        temperature=96.0,
        temperature_unit="C",  # Typo: meant 96°F
        spo2=82.0,            # Severe hypoxia
    )

    assert result["triage_level"] == 1
    assert result["recommended_department"] == "Emergency / Casualty"
    assert result["model_emergency_flag"] is True
    assert any("96.0°C" in w for w in result["invalid_data_warnings"])


# ============================================================================
# 5. Multilingual and Transliterated Complaints
# ============================================================================

def test_telugu_script_complaint_emergency_detection():
    """
    Native Telugu script complaint describing crushing chest pain must trigger
    the emergency cardiac red flag and assign Level 1.
    """
    service = TriageInferenceService()

    result = service.assess(
        age=54,
        gender="Male",
        chief_complaint="నాకు తీవ్రమైన గుండె నొప్పి మరియు శ్వాస తీసుకోవడం కష్టంగా ఉంది",
        complaint_language="Telugu",
        systolic_bp=130,
        diastolic_bp=85,
        pulse_bpm=90,
    )

    assert result["triage_level"] == 1
    assert result["recommended_department"] == "Emergency / Casualty"
    assert result["model_emergency_flag"] is True


def test_telugu_transliterated_complaint_detection():
    """
    Latin transliterated Telugu complaint ('chati noppi', chest pain) must be recognized.
    """
    service = TriageInferenceService()

    result = service.assess(
        age=48,
        gender="Male",
        chief_complaint="naaku chati noppi ga undi gundelo manta gundepotu",
        complaint_language="Telugu",
        systolic_bp=135,
        diastolic_bp=88,
        pulse_bpm=86,
    )

    assert result["triage_level"] == 1
    assert result["recommended_department"] == "Emergency / Casualty"
    assert result["model_emergency_flag"] is True


# ============================================================================
# 6. API Route Integration: POST /api/v1/assess
# ============================================================================

def test_api_assess_bp_zero_abstains_safely():
    """POST /api/assess with systolic_bp = 0 returns 200 with explicit abstention."""
    response = client.post(
        "/api/assessments",
        json={
            "age": 45,
            "gender": "Male",
            "chief_complaint": "Mild intermittent joint pain in knees for one week",
            "systolic_bp": 0,
            "diastolic_bp": 0,
            "pulse_bpm": 70,
            "temperature": 98.4,
            "temperature_unit": "F",
            "spo2": 98.0,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["triage_level_name"] == "Cannot assess — send to nurse now."
    assert any("0 mmHg" in w for w in data["invalid_data_warnings"])
    assert data["human_review_required"] is True


def test_api_assess_temperature_96c_abstains_safely():
    """POST /api/assess with temperature = 96°C returns 200 with explicit abstention."""
    response = client.post(
        "/api/assessments",
        json={
            "age": 30,
            "gender": "Female",
            "chief_complaint": "Runny nose and mild scratchy throat",
            "systolic_bp": 115,
            "diastolic_bp": 75,
            "pulse_bpm": 72,
            "temperature": 96.0,
            "temperature_unit": "C",
            "spo2": 99.0,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["triage_level_name"] == "Cannot assess — send to nurse now."
    assert any("96.0°C" in w for w in data["invalid_data_warnings"])


def test_api_assess_accepts_medications_field():
    """POST /api/assess accepts medication list as part of intake data."""
    response = client.post(
        "/api/assessments",
        json={
            "age": 60,
            "gender": "Male",
            "chief_complaint": "Routine blood pressure checkup and prescription refill",
            "known_conditions": ["Hypertension", "Type 2 Diabetes"],
            "medications": ["Amlodipine 5mg", "Metformin 500mg"],
            "systolic_bp": 128,
            "diastolic_bp": 82,
            "pulse_bpm": 72,
            "temperature": 98.2,
            "temperature_unit": "F",
            "spo2": 98.0,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert 1 <= data["triage_level"] <= 5
    assert data["recommended_department"] == "General Medicine"


# ============================================================================
# 7. Synthetic Dataset Generation (30,000 Records)
# ============================================================================

def test_synthetic_data_generation_30k_properties():
    """
    Validates synthetic data generation properties:
    - Generates requested count accurately
    - Populates all 9 required fields
    - Calibrated emergency prevalence ~4%
    - Never uses identifiable patient information
    """
    df_sample = generate_synthetic_fixture(n_samples=500, random_seed=42)

    assert len(df_sample) == 500

    required_fields = [
        "age",
        "gender",
        "systolic_bp",
        "diastolic_bp",
        "pulse_bpm",
        "temperature",
        "spo2",
        "chief_complaint",
        "known_conditions_text",
        "medications",
        "triage_level",
        "department",
        "is_emergency",
    ]
    for field in required_fields:
        assert field in df_sample.columns, f"Field '{field}' missing from synthetic dataset."

    # Verify ~4% emergency prevalence on sample
    emerg_rate = df_sample["is_emergency"].mean()
    assert 0.02 <= emerg_rate <= 0.08, f"Emergency rate {emerg_rate:.3f} outside expected tolerance [0.02, 0.08]."


def test_saved_30k_csv_and_database_isolation():
    """
    Verifies that the generated 30,000 record synthetic dataset exists as a CSV,
    contains exactly 30,000 rows, and did NOT flood the SQLite queue database.
    """
    csv_path = os.path.join(os.path.dirname(__file__), "..", "app", "ml", "data", "synthetic_patients_30k.csv")
    assert os.path.exists(csv_path), f"Synthetic dataset CSV not found at {csv_path}"

    df_30k = pd.read_csv(csv_path)
    assert len(df_30k) == 30000, f"Expected 30,000 rows, found {len(df_30k)}"

    # Verify prevalence in full 30,000 dataset is approximately 4%
    emerg_count = int(df_30k["is_emergency"].sum())
    emerg_pct = emerg_count / len(df_30k)
    assert 0.035 <= emerg_pct <= 0.045, f"Expected ~4% emergency prevalence, got {emerg_pct * 100:.2f}% ({emerg_count})"

    # Verify SQLite database records remain isolated (not 30,000 records in SQLite)
    db = next(get_db())
    try:
        db_count = db.query(PatientModel).count()
        assert db_count < 2000, f"SQLite queue database flooded with {db_count} records! Dataset must remain separate."
    finally:
        db.close()
