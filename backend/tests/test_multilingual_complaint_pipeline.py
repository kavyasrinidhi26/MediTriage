"""
Comprehensive automated tests for Multilingual Complaint Processing & Safety Triage Pipeline.

Covers:
1. Target clinical inputs:
   - English: "I have severe chest pain."
   - Telugu script: "నాకు ఛాతిలో నొప్పిగా ఉంది"
   - Telugu transliteration: "naaku chaathilo noppi ga undi"
   - Mixed language: "Naku fever undi and body pains."
2. Negations and context sensitivity:
   - "no chest pain", "I don't have fever", "gunde noppi ledu"
   - "not breathing normally" -> active respiratory distress
3. Ambiguous, contradictory, or uninterpretable complaints:
   - Empty complaint: ""
   - Gibberish / unsupported text: "asdfghjk qwerty"
   - Contradictory statements: "I have severe chest pain but no chest pain"
4. Safety invariants:
   - Critical vital signs (SpO2 < 90, pulse = 0, severe hypotension) trigger Level 1 emergency override
     irrespective of complaint language or interpretation outcome.
   - Language processing failure / exception degrades safely to bedside nurse review.
"""

import pytest
from unittest.mock import patch, MagicMock
from app.nlp.complaint_processor import (
    process_complaint,
    LanguageFormat,
    SymptomContext,
)
from app.nlp.symptom_dictionary import (
    CONCEPT_CHEST_PAIN,
    CONCEPT_FEVER,
    CONCEPT_JOINT_BONE_PAIN,
    CONCEPT_RESPIRATORY_DISTRESS,
)
from app.triage_engine import evaluate_triage
from app.schemas import PatientTriageRequest, VitalSigns, RedFlagChecklist, AVPUScale, TriageCategory
from app.safety_rules import evaluate_clinical_escalation_rules, RuleAcuity
from app.ml.inference import TriageInferenceService


# ==============================================================================
# 1. TARGET CLINICAL EXAMPLES & LANGUAGE FORMATS
# ==============================================================================

def test_target_example_1_english_severe_chest_pain():
    """Target 1: 'I have severe chest pain.' -> English, POSITIVE chest_pain with severe modifier."""
    text = "I have severe chest pain."
    res = process_complaint(text)

    assert res.detected_language == LanguageFormat.ENGLISH
    assert CONCEPT_CHEST_PAIN in res.positive_concepts
    assert CONCEPT_CHEST_PAIN in res.red_flag_triggers
    assert res.requires_nurse_review is False

    # Check extracted details
    sym = next(s for s in res.extracted_symptoms if s.concept == CONCEPT_CHEST_PAIN)
    assert sym.context == SymptomContext.POSITIVE
    assert sym.severity_modifier == "severe"
    assert sym.is_red_flag is True
    assert sym.supporting_phrase is not None

    # Triage pipeline integration: Acute chest pain triggers emergency evaluation
    alerts = evaluate_clinical_escalation_rules(
        age=50,
        gender="Male",
        chief_complaint=text,
    )
    assert any(a.rule_id == "CRIT-RULE-NLP-CHEST-PAIN" for a in alerts)


def test_target_example_2_telugu_script_chest_pain():
    """Target 2: 'నాకు ఛాతిలో నొప్పిగా ఉంది' -> Telugu Script, POSITIVE chest_pain."""
    text = "నాకు ఛాతిలో నొప్పిగా ఉంది"
    res = process_complaint(text)

    assert res.detected_language == LanguageFormat.TELUGU_SCRIPT
    assert CONCEPT_CHEST_PAIN in res.positive_concepts
    assert CONCEPT_CHEST_PAIN in res.red_flag_triggers
    assert res.requires_nurse_review is False

    sym = next(s for s in res.extracted_symptoms if s.concept == CONCEPT_CHEST_PAIN)
    assert sym.context == SymptomContext.POSITIVE
    assert sym.is_red_flag is True
    assert "ఛాతిలో నొప్పి" in sym.supporting_phrase

    # Pipeline integration: triggers CRIT-RULE-NLP-CHEST-PAIN override
    alerts = evaluate_clinical_escalation_rules(
        age=52,
        gender="Male",
        chief_complaint=text,
    )
    assert any(a.rule_id == "CRIT-RULE-NLP-CHEST-PAIN" for a in alerts)


def test_target_example_3_telugu_transliteration_chest_pain():
    """Target 3: 'naaku chaathilo noppi ga undi' -> Telugu Transliteration, POSITIVE chest_pain."""
    text = "naaku chaathilo noppi ga undi"
    res = process_complaint(text)

    assert res.detected_language == LanguageFormat.TELUGU_TRANSLITERATION
    assert CONCEPT_CHEST_PAIN in res.positive_concepts
    assert CONCEPT_CHEST_PAIN in res.red_flag_triggers
    assert res.requires_nurse_review is False

    sym = next(s for s in res.extracted_symptoms if s.concept == CONCEPT_CHEST_PAIN)
    assert sym.context == SymptomContext.POSITIVE
    assert sym.is_red_flag is True
    assert "chaathilo noppi" in sym.supporting_phrase

    # Pipeline integration: triggers CRIT-RULE-NLP-CHEST-PAIN override
    alerts = evaluate_clinical_escalation_rules(
        age=55,
        gender="Male",
        chief_complaint=text,
    )
    assert any(a.rule_id == "CRIT-RULE-NLP-CHEST-PAIN" for a in alerts)


def test_target_example_4_mixed_language_fever_and_body_pains():
    """Target 4: 'Naku fever undi and body pains.' -> Mixed (Telugu & English), POSITIVE fever and joint_bone_pain."""
    text = "Naku fever undi and body pains."
    res = process_complaint(text)

    assert res.detected_language == LanguageFormat.MIXED_TELUGU_ENGLISH
    assert CONCEPT_FEVER in res.positive_concepts
    assert CONCEPT_JOINT_BONE_PAIN in res.positive_concepts
    assert res.requires_nurse_review is False

    # Pipeline integration: Full triage engine assigns stable priority/urgent
    req = PatientTriageRequest(
        patient_name="Synthetic Mixed-Language Patient",
        age=32,
        gender="Female",
        chief_complaint=text,
        vitals=VitalSigns(
            heart_rate=84,
            systolic_bp=120,
            diastolic_bp=80,
            respiratory_rate=16,
            spo2=99,
            temperature_f=101.4,
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(),
    )
    triage_result = evaluate_triage(req)
    assert triage_result.detected_language == "Mixed (Telugu & English)"
    assert CONCEPT_FEVER in triage_result.positive_concepts
    assert CONCEPT_JOINT_BONE_PAIN in triage_result.positive_concepts


# ==============================================================================
# 2. NEGATION & CONTEXT PRESERVATION
# ==============================================================================

def test_negation_preserves_safety_denies_chest_pain():
    """'no chest pain' or 'I don't have chest pain' must NEVER trigger a cardiac red flag."""
    for text in ["mild cough, no chest pain", "patient reports I don't have chest pain", "fever since 2 days, gunde noppi ledu"]:
        res = process_complaint(text)
        assert CONCEPT_CHEST_PAIN in res.negated_concepts
        assert CONCEPT_CHEST_PAIN not in res.positive_concepts
        assert CONCEPT_CHEST_PAIN not in res.red_flag_triggers

        alerts = evaluate_clinical_escalation_rules(
            age=40,
            gender="Male",
            chief_complaint=text,
        )
        assert not any(a.rule_id == "CRIT-RULE-NLP-CHEST-PAIN" for a in alerts)


def test_negation_not_breathing_normally_maps_to_active_respiratory_distress():
    """'not breathing normally' is abnormal negation and must map to active respiratory distress."""
    text = "Feeling weak and not breathing normally since morning"
    res = process_complaint(text)

    assert CONCEPT_RESPIRATORY_DISTRESS in res.positive_concepts
    assert CONCEPT_RESPIRATORY_DISTRESS in res.red_flag_triggers
    assert res.requires_nurse_review is False


# ==============================================================================
# 3. AMBIGUOUS, UNKNOWN, CONTRADICTORY, OR EMPTY COMPLAINTS
# ==============================================================================

def test_empty_or_whitespace_complaint():
    """Empty complaints require nurse review and cannot be safely assessed."""
    for text in ["", "   ", "\t\n"]:
        res = process_complaint(text)
        assert res.requires_nurse_review is True
        assert res.is_unsupported_or_ambiguous is True
        assert "Cannot assess safely — send to nurse now." in (res.review_reason or "")


def test_gibberish_and_unsupported_phrases():
    """Unrecognized gibberish phrases are tagged as Ambiguous/Unsupported and routed to nurse."""
    text = "asdfghjk qwerty zxcvbnm 12345"
    res = process_complaint(text)

    assert res.detected_language == LanguageFormat.AMBIGUOUS_OR_UNSUPPORTED
    assert res.requires_nurse_review is True
    assert res.is_unsupported_or_ambiguous is True
    assert "Cannot assess safely — send to nurse now." in (res.review_reason or "")

    # Triage engine routes ambiguous complaint to Priority Holding with nurse message
    req = PatientTriageRequest(
        patient_name="Synthetic Ambiguous Case",
        age=30,
        gender="Male",
        chief_complaint=text,
        vitals=VitalSigns(
            heart_rate=72,
            systolic_bp=120,
            diastolic_bp=80,
            respiratory_rate=16,
            spo2=99,
            temperature_f=98.6,
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(),
    )
    triage_result = evaluate_triage(req)
    assert triage_result.triage_level_name == "Cannot assess safely — send to nurse now."
    assert triage_result.triage_level == 2  # Nurse holding priority, never placed at back of queue


def test_contradictory_clinical_statements():
    """Contradictory complaints (e.g. 'severe chest pain' AND 'no chest pain') require nurse review."""
    text = "I have severe chest pain but I have no chest pain"
    res = process_complaint(text)

    assert res.is_contradictory is True
    assert res.requires_nurse_review is True
    assert "Contradictory" in (res.review_reason or "")
    assert "Cannot assess safely — send to nurse now." in (res.review_reason or "")


# ==============================================================================
# 4. SAFETY INVARIANTS: CRITICAL VITALS OVERRIDE COMPLAINTS
# ==============================================================================

def test_critical_vital_overrides_negated_or_ambiguous_complaint():
    """
    CRITICAL CLINICAL INVARIANT:
    Severe physiological derangement (e.g. SpO2 < 90% or pulselessness)
    MUST NEVER be downgraded or dismissed due to language processing results.
    """
    # Patient has SpO2 78% (severe hypoxia) but complaint says "no chest pain"
    req_hypoxia = PatientTriageRequest(
        patient_name="Synthetic Critical Hypoxia Case",
        age=65,
        gender="Female",
        chief_complaint="Patient reports no chest pain and no fever",
        vitals=VitalSigns(
            heart_rate=115,
            systolic_bp=110,
            diastolic_bp=70,
            respiratory_rate=28,
            spo2=78,  # Critical hypoxemia < 85%
            temperature_f=98.6,
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(),
    )
    result_hypoxia = evaluate_triage(req_hypoxia)
    assert result_hypoxia.triage_level == 1
    assert result_hypoxia.triage_category == TriageCategory.EMERGENCY
    assert any("SpO2" in abn or "hypoxemia" in abn for abn in result_hypoxia.vital_abnormalities)

    # Pulseless patient (pulse = 0) with ambiguous complaint text
    service = TriageInferenceService()
    res_pulse_zero = service.assess(
        age=45,
        gender="Male",
        chief_complaint="asdfghjk unrecognizable gibberish",
        pulse_bpm=0,
        systolic_bp=None,
        diastolic_bp=None,
        temperature=None,
        spo2=None,
    )
    assert res_pulse_zero["triage_level"] == 1
    assert res_pulse_zero["model_emergency_flag"] is True
    assert "CRIT-RULE-PULSE-0" in res_pulse_zero["triggered_safety_rule_ids"]


# ==============================================================================
# 5. SERVICE FAILURE & EXCEPTION FALLBACK
# ==============================================================================

def test_language_processing_exception_degrades_safely_to_nurse_review():
    """If NLP processing encounters an unexpected runtime error, it safely returns nurse review."""
    with patch("app.nlp.complaint_processor.detect_complaint_language", side_effect=RuntimeError("Simulated NLP crash")):
        res = process_complaint("Any valid complaint text")
        assert res.requires_nurse_review is True
        assert res.is_unsupported_or_ambiguous is True
        assert "Cannot assess safely — send to nurse now." in (res.review_reason or "")
