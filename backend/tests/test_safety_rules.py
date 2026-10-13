import pytest
from app.safety_rules import (
    evaluate_data_quality,
    evaluate_clinical_escalation_rules,
    apply_safety_override,
    DataQualityStatus,
    RuleAcuity,
    SAFETY_RULE_VERSION,
)


def test_missing_blood_pressure_not_defaulted():
    """
    Test that missing blood pressure is recorded as MISSING without substituting
    arbitrary normal values (e.g. 120/80 mmHg).
    """
    dq_issues = evaluate_data_quality(
        age=35,
        gender="Female",
        chief_complaint="Persistent headache",
        systolic_bp=None,
        diastolic_bp=None,
        pulse_bpm=72,
        temperature=98.6,
        temperature_unit="F",
        spo2=99.0,
    )

    bp_issues = [issue for issue in dq_issues if issue.field == "blood_pressure"]
    assert len(bp_issues) == 1
    assert bp_issues[0].status == DataQualityStatus.MISSING
    assert bp_issues[0].code == "MISSING_BP"
    assert "Will NOT be assumed normal" in bp_issues[0].message
    assert bp_issues[0].is_blocking is False  # Missing vitals do not block human assessment


def test_pulse_zero_triggers_critical_emergency():
    """
    Test that a pulse entered as 0 bpm is treated as an immediate clinical emergency
    (suspected pulselessness / cardiac arrest) requiring carotid verification,
    NOT as ordinary missing data or a typo.
    """
    alerts = evaluate_clinical_escalation_rules(
        age=55,
        gender="Male",
        chief_complaint="Sudden collapse in registration line",
        known_conditions=[],
        systolic_bp=0,
        diastolic_bp=0,
        pulse_bpm=0,
        temperature=97.0,
        temperature_unit="F",
        spo2=None,
    )

    pulse_zero_alerts = [a for a in alerts if a.rule_id == "CRIT-RULE-PULSE-0"]
    assert len(pulse_zero_alerts) == 1
    alert = pulse_zero_alerts[0]
    assert alert.acuity_level == RuleAcuity.EMERGENCY
    assert alert.is_critical_override is True
    assert "carotid pulse" in alert.required_human_verification.lower()
    assert "Code Blue" in alert.required_human_verification



def test_temperature_96_triggers_hypothermia_verification():
    """
    Test that a temperature of 96.0°F (35.6°C) flags for hypothermia clinical verification
    rather than automatically assuming it is a transcription typo.
    """
    alerts = evaluate_clinical_escalation_rules(
        age=72,
        gender="Female",
        chief_complaint="Extreme shivering, confusion, and shivering after exposure to monsoon rain",
        known_conditions=["Dementia"],
        pulse_bpm=58,
        temperature=96.0,
        temperature_unit="F",
        spo2=94.0,
    )

    hypo_alerts = [a for a in alerts if a.rule_id == "CRIT-RULE-TEMP-96-HYPOTHERMIA"]
    assert len(hypo_alerts) == 1
    alert = hypo_alerts[0]
    assert alert.acuity_level == RuleAcuity.PRIORITY
    assert "Re-take temperature" in alert.required_human_verification
    assert "hypothermia" in alert.clinical_explanation.lower()




def test_missing_spo2_not_defaulted_to_normal():
    """
    Test that missing SpO2 measurement is recorded as MISSING rather than
    fabricating 98% or 100%.
    """
    dq_issues = evaluate_data_quality(
        age=24,
        gender="Male",
        chief_complaint="Right ankle sprain",
        systolic_bp=122,
        diastolic_bp=78,
        pulse_bpm=74,
        temperature=98.4,
        temperature_unit="F",
        spo2=None,
    )

    spo2_issues = [i for i in dq_issues if i.field == "spo2"]
    assert len(spo2_issues) == 1
    assert spo2_issues[0].status == DataQualityStatus.MISSING
    assert spo2_issues[0].code == "MISSING_SPO2"
    assert "Will NOT be assumed normal" in spo2_issues[0].message


def test_conflicting_symptoms_flagged():
    """
    Test that conflicting clinical presentation is detected:
    e.g., Male patient with obstetric / labor symptoms, or pulseless (0 bpm) but alert and walking.
    """
    # 1. Male obstetric contradiction
    dq_male_pregnancy = evaluate_data_quality(
        age=32,
        gender="Male",
        chief_complaint="Active labour pains and water breaking",
        systolic_bp=120,
        diastolic_bp=80,
        pulse_bpm=80,
        temperature=98.6,
        temperature_unit="F",
        spo2=98.0,
    )
    conflicts = [i for i in dq_male_pregnancy if i.status == DataQualityStatus.CONTRADICTORY]
    assert len(conflicts) >= 1
    assert conflicts[0].code == "CONTRADICTORY_GENDER_OBSTETRIC"

    # 2. Pulseless alert/walking contradiction
    dq_pulseless_walking = evaluate_data_quality(
        age=45,
        gender="Female",
        chief_complaint="Patient walked into OPD complaining of mild sore throat and runny nose",
        systolic_bp=110,
        diastolic_bp=70,
        pulse_bpm=0,  # 0 pulse entered for an ambulatory patient
        temperature=98.6,
        temperature_unit="F",
        spo2=99.0,
    )
    pulse_conflicts = [i for i in dq_pulseless_walking if i.code == "CONTRADICTORY_AMBULATORY_PULSELESS"]
    assert len(pulse_conflicts) >= 1
    assert pulse_conflicts[0].is_blocking is True


def test_critical_safety_rule_overrides_lower_ml_prediction():
    """
    Test that a validated critical safety rule (e.g. SpO2 = 84% indicating severe hypoxia)
    strictly overrides an erroneous lower-urgency ML prediction (e.g. ROUTINE).
    """
    dq_issues = evaluate_data_quality(
        age=60,
        gender="Male",
        chief_complaint="Breathlessness",
        systolic_bp=130,
        diastolic_bp=85,
        pulse_bpm=110,
        temperature=99.0,
        temperature_unit="F",
        spo2=84.0,  # Critical hypoxia (< 90%)
    )

    clinical_alerts = evaluate_clinical_escalation_rules(
        age=60,
        gender="Male",
        chief_complaint="Breathlessness",
        known_conditions=["COPD"],
        systolic_bp=130,
        diastolic_bp=85,
        pulse_bpm=110,
        temperature=99.0,
        temperature_unit="F",
        spo2=84.0,
    )

    # Suppose a flawed ML model predicted "ROUTINE"
    flawed_ml_prediction = "ROUTINE"

    result = apply_safety_override(
        data_quality_issues=dq_issues,
        clinical_alerts=clinical_alerts,
        model_prediction=flawed_ml_prediction,
    )

    assert result.is_data_acceptable is True
    assert result.original_model_prediction == "ROUTINE"
    assert result.override_applied is True
    assert result.final_urgency_level == "EMERGENCY"
    assert result.escalation_status == "ESCALATED_EMERGENCY"
    assert "supplemental oxygen" in result.required_verification.lower()
    assert "CRIT-RULE-HYPOXIA" in result.triggered_rule_ids



def test_safety_rule_user_facing_action_and_disclaimer():
    """
    Test that safety evaluation returns clear required user-facing actions
    and the prototype disclaimer.
    """
    dq_issues = []
    clinical_alerts = evaluate_clinical_escalation_rules(
        age=64,
        gender="Male",
        chief_complaint="Acute severe crushing retrosternal chest pain",
        known_conditions=["Coronary Artery Disease"],
        systolic_bp=85,  # Cardiogenic shock / hypotension (< 90)
        diastolic_bp=55,
        pulse_bpm=120,
        temperature=98.4,
        temperature_unit="F",
        spo2=91.0,
    )

    result = apply_safety_override(
        data_quality_issues=dq_issues,
        clinical_alerts=clinical_alerts,
        model_prediction="PRIORITY",
    )

    assert result.final_urgency_level == "EMERGENCY"
    assert result.override_applied is True
    assert result.required_verification is not None
    assert len(result.required_verification) > 10
    assert "HACKATHON PROTOCOL NOTICE" in result.disclaimer
    assert result.rule_version == SAFETY_RULE_VERSION


def test_diastolic_hypertensive_crisis_override():
    """
    SAFETY REQUIREMENT:
    Verify that Diastolic BP >= 120 mmHg triggers CRIT-RULE-HYPERTENSIVE-CRISIS
    even when Systolic BP is below 200 mmHg (e.g. 170/125 mmHg).
    """
    alerts = evaluate_clinical_escalation_rules(
        age=50,
        gender="Female",
        chief_complaint="Severe pounding occipital headache",
        known_conditions=["Essential Hypertension"],
        systolic_bp=170,
        diastolic_bp=125,
        pulse_bpm=88,
        temperature=98.6,
        temperature_unit="F",
        spo2=98.0,
    )
    ht_alerts = [a for a in alerts if a.rule_id == "CRIT-RULE-HYPERTENSIVE-CRISIS"]
    assert len(ht_alerts) == 1
    assert ht_alerts[0].acuity_level == RuleAcuity.EMERGENCY
    assert ht_alerts[0].is_critical_override is True

    result = apply_safety_override(
        data_quality_issues=[],
        clinical_alerts=alerts,
        model_prediction="ROUTINE",
    )
    assert result.final_urgency_level == "EMERGENCY"
    assert result.override_applied is True


def test_systolic_hypertensive_crisis_override():
    """Verify that Systolic BP >= 200 mmHg triggers CRIT-RULE-HYPERTENSIVE-CRISIS."""
    alerts = evaluate_clinical_escalation_rules(
        age=58,
        gender="Male",
        chief_complaint="Dizziness and blurred vision",
        known_conditions=[],
        systolic_bp=205,
        diastolic_bp=100,
        pulse_bpm=92,
        temperature=98.4,
        temperature_unit="F",
        spo2=97.0,
    )
    ht_alerts = [a for a in alerts if a.rule_id == "CRIT-RULE-HYPERTENSIVE-CRISIS"]
    assert len(ht_alerts) == 1
    assert ht_alerts[0].acuity_level == RuleAcuity.EMERGENCY


def test_hypotensive_shock_override():
    """Verify that Systolic BP < 90 mmHg triggers CRIT-RULE-SHOCK-BP."""
    alerts = evaluate_clinical_escalation_rules(
        age=42,
        gender="Female",
        chief_complaint="Dizziness and profound weakness",
        known_conditions=[],
        systolic_bp=82,
        diastolic_bp=50,
        pulse_bpm=115,
        temperature=97.8,
        temperature_unit="F",
        spo2=96.0,
    )
    shock_alerts = [a for a in alerts if a.rule_id == "CRIT-RULE-SHOCK-BP"]
    assert len(shock_alerts) == 1
    assert shock_alerts[0].acuity_level == RuleAcuity.EMERGENCY


def test_hyperpyrexia_and_hypothermia_boundaries():
    """Verify temperature extremes trigger critical and priority alerts."""
    # Hyperpyrexia >= 104 F
    alerts_hot = evaluate_clinical_escalation_rules(
        age=28,
        gender="Male",
        chief_complaint="Extremely high fever and rigors",
        known_conditions=[],
        systolic_bp=120,
        diastolic_bp=80,
        pulse_bpm=120,
        temperature=104.5,
        temperature_unit="F",
        spo2=96.0,
    )
    hot_alerts = [a for a in alerts_hot if a.rule_id == "CRIT-RULE-HIGH-HYPERPYREXIA"]
    assert len(hot_alerts) == 1
    assert hot_alerts[0].acuity_level == RuleAcuity.EMERGENCY

    # Hypothermia verification around 96.0 F
    alerts_cold = evaluate_clinical_escalation_rules(
        age=72,
        gender="Female",
        chief_complaint="Found collapsed in cold weather",
        known_conditions=[],
        systolic_bp=95,
        diastolic_bp=60,
        pulse_bpm=48,
        temperature=96.0,
        temperature_unit="F",
        spo2=94.0,
    )
    cold_alerts = [a for a in alerts_cold if a.rule_id == "CRIT-RULE-TEMP-96-HYPOTHERMIA"]
    assert len(cold_alerts) == 1
    assert cold_alerts[0].acuity_level == RuleAcuity.PRIORITY


def test_critical_emergency_overrides_low_confidence_model_abstention():
    """
    CRITICAL SAFETY REQUIREMENT:
    When an incoming case triggers an emergency safety rule (e.g. SpO2 < 90%),
    the engine must NEVER downgrade the patient to Level 2 Priority Review
    just because the model had low confidence (pred_confidence < confidence_threshold).
    It must immediately output Level 1 Resuscitation with SAFETY_OVERRIDE.
    """
    from app.ml.inference import TriageInferenceService

    service = TriageInferenceService()
    result = service.assess(
        age=52,
        gender="Male",
        chief_complaint="Sudden severe breathlessness and chest tightness",
        known_conditions=["Asthma"],
        systolic_bp=110,
        diastolic_bp=70,
        pulse_bpm=125,
        temperature=98.6,
        temperature_unit="F",
        spo2=82.0,  # Critical hypoxemia rule
        confidence_threshold=1.0,  # Artificially force model confidence to be below threshold
    )

    assert result["triage_level"] == 1
    assert "Level 1" in result["triage_level_name"]
    assert result["abstention_status"] == "SAFETY_OVERRIDE"
    assert result["model_emergency_flag"] is True
    assert "CRIT-RULE-HYPOXIA" in result["triggered_safety_rule_ids"]

