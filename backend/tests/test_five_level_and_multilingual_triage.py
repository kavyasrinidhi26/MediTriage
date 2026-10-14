import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas import (
    PatientTriageRequest,
    VitalSigns,
    RedFlagChecklist,
    TriageCategory,
    SpecialtyDepartment,
    AVPUScale,
)
from app.triage_engine import evaluate_triage, determine_department_with_reason
from app.nlp.complaint_processor import process_complaint, LanguageFormat

client = TestClient(app)


# -----------------------------------------------------------------------------
# 1. FIVE-LEVEL TRIAGE SCALE TESTS
# -----------------------------------------------------------------------------

def test_level_1_resuscitation_immediate():
    """Level 1: Critical red flags or severe physiological instability (Wait 0m)."""
    req = PatientTriageRequest(
        patient_name="Critically Ill Patient",
        age=55,
        gender="Male",
        chief_complaint="Severe crushing chest pain radiating to left arm with cold diaphoresis",
        vitals=VitalSigns(
            heart_rate=135,
            systolic_bp=85,
            diastolic_bp=55,
            spo2=88.0,
            respiratory_rate=32,
            temperature_f=98.6,
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(crushing_chest_pain=True),
    )
    res = evaluate_triage(req)
    assert res.triage_level == 1
    assert "Level 1" in res.triage_level_name
    assert res.triage_category == TriageCategory.EMERGENCY
    assert res.urgency_score >= 9
    assert res.max_recommended_wait_minutes == 0
    assert res.recommended_department == SpecialtyDepartment.CASUALTY_EMERGENCY
    assert len(res.observed_facts) > 0
    assert len(res.inferred_risks) > 0
    assert "DISCLAIMER" in res.disclaimer.upper() or "PROTOTYPE" in res.disclaimer.upper()


def test_level_2_emergent():
    """Level 2: High risk / borderline instability / severe distress (Wait <= 15m)."""
    req = PatientTriageRequest(
        patient_name="Emergent Patient",
        age=62,
        gender="Female",
        chief_complaint="Persistent cough and chest congestion for 3 days, known asthmatic",
        vitals=VitalSigns(
            heart_rate=112,
            systolic_bp=145,
            diastolic_bp=90,
            spo2=92.0,  # Borderline hypoxemia 90-94%
            respiratory_rate=24,
            temperature_f=99.2,
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(),
    )
    res = evaluate_triage(req)
    assert res.triage_level == 2
    assert "Level 2" in res.triage_level_name
    assert res.triage_category == TriageCategory.PRIORITY
    assert res.urgency_score in (7, 8)
    assert res.max_recommended_wait_minutes == 15
    assert res.recommended_department == SpecialtyDepartment.PULMONOLOGY


def test_level_3_urgent():
    """Level 3: Moderately abnormal vitals or acute systemic illness (Wait <= 30m)."""
    req = PatientTriageRequest(
        patient_name="Urgent Patient",
        age=38,
        gender="Male",
        chief_complaint="Acute abdominal pain with fever for 2 days",
        vitals=VitalSigns(
            heart_rate=98,
            systolic_bp=145,
            diastolic_bp=92,
            spo2=97.0,
            respiratory_rate=20,
            temperature_f=100.4,  # Mild pyrexia 99.6-101.4°F
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(),
    )
    res = evaluate_triage(req)
    assert res.triage_level == 3
    assert "Level 3" in res.triage_level_name
    assert res.triage_category == TriageCategory.PRIORITY
    assert res.urgency_score in (5, 6)
    assert res.max_recommended_wait_minutes == 30
    assert res.recommended_department in (SpecialtyDepartment.GENERAL_MEDICINE, SpecialtyDepartment.GENERAL_SURGERY)


def test_level_4_less_urgent():
    """Level 4: Stable vital signs, mild subacute symptoms (Wait <= 60m)."""
    req = PatientTriageRequest(
        patient_name="Less Urgent Patient",
        age=34,
        gender="Female",
        chief_complaint="Mild persistent headache for 3 days, no fever or vomiting",
        vitals=VitalSigns(
            heart_rate=72,
            systolic_bp=118,
            diastolic_bp=78,
            spo2=99.0,
            respiratory_rate=16,
            temperature_f=98.4,
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(),
    )
    res = evaluate_triage(req)
    assert res.triage_level == 4
    assert "Level 4" in res.triage_level_name
    assert res.triage_category == TriageCategory.ROUTINE
    assert res.urgency_score in (3, 4)
    assert res.max_recommended_wait_minutes == 60


def test_level_5_non_urgent():
    """Level 5: Routine checkup, chronic renewal, or administrative visit (Wait <= 120m)."""
    req = PatientTriageRequest(
        patient_name="Non Urgent Patient",
        age=65,
        gender="Male",
        chief_complaint="Routine blood sugar checkup and repeat medication refill",
        vitals=VitalSigns(
            heart_rate=68,
            systolic_bp=122,
            diastolic_bp=80,
            spo2=98.5,
            respiratory_rate=14,
            temperature_f=98.2,
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(),
    )
    res = evaluate_triage(req)
    assert res.triage_level == 5
    assert "Level 5" in res.triage_level_name
    assert res.triage_category == TriageCategory.ROUTINE
    assert res.urgency_score in (1, 2)
    assert res.max_recommended_wait_minutes == 120
    assert res.recommended_department == SpecialtyDepartment.GENERAL_MEDICINE


# -----------------------------------------------------------------------------
# 2. PATIENT ASSESSMENT & EXPLAINABILITY (FACTS VS RISKS)
# -----------------------------------------------------------------------------

def test_assessment_observed_facts_vs_inferred_risks():
    """Verify clean separation of observed facts from inferred risk indicators."""
    req = PatientTriageRequest(
        patient_name="Explainability Patient",
        age=70,
        gender="Male",
        chief_complaint="Severe dizziness and shortness of breath",
        vitals=VitalSigns(
            heart_rate=44,  # Borderline bradycardia
            systolic_bp=170,  # Stage 2 hypertension
            diastolic_bp=100,
            spo2=91.0,  # Borderline hypoxemia
            respiratory_rate=22,
            temperature_f=98.6,
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(),
    )
    res = evaluate_triage(req)
    # Observed facts must document inputs verbatim
    assert any("70yo Male" in f for f in res.observed_facts)
    assert any("44 bpm" in f for f in res.observed_facts)
    assert any("170/100" in f for f in res.observed_facts)
    assert any("91.0%" in f for f in res.observed_facts)

    # Inferred risks must identify physiological implications
    assert len(res.inferred_risks) > 0
    assert any("hypoxia" in r.lower() or "gas exchange" in r.lower() for r in res.inferred_risks)
    assert any("hypertension" in r.lower() or "damage" in r.lower() or "decompensation" in r.lower() for r in res.inferred_risks)


# -----------------------------------------------------------------------------
# 3. DEPARTMENT RECOMMENDATION & AMBIGUITY REVIEWS
# -----------------------------------------------------------------------------

def test_department_routing_and_reasons():
    """Verify specialist routing across major OPD departments with clear reasons."""
    # Ophthalmology
    dept, reason, review = determine_department_with_reason(
        "Severe red eye, blurred vision and eye irritation for 2 days", 40, False, RedFlagChecklist()
    )
    assert dept == SpecialtyDepartment.OPHTHALMOLOGY
    assert "ocular" in reason.lower() or "eye" in reason.lower() or "visual" in reason.lower()
    assert review is False

    # ENT
    dept, reason, review = determine_department_with_reason(
        "Severe ear pain, ear discharge, and hearing trouble", 32, False, RedFlagChecklist()
    )
    assert dept == SpecialtyDepartment.ENT
    assert "ent" in reason.lower() or "ear" in reason.lower()

    # Dermatology
    dept, reason, review = determine_department_with_reason(
        "Itchy skin rash, eczema patches on arms", 28, False, RedFlagChecklist()
    )
    assert dept == SpecialtyDepartment.DERMATOLOGY
    assert "dermatology" in reason.lower() or "skin" in reason.lower()

    # Orthopedics
    dept, reason, review = determine_department_with_reason(
        "Chronic knee joint pain and swelling when walking", 58, False, RedFlagChecklist()
    )
    assert dept == SpecialtyDepartment.ORTHOPEDICS
    assert "orthopedics" in reason.lower() or "joint" in reason.lower()

    # OBGYN
    dept, reason, review = determine_department_with_reason(
        "Pregnancy antenatal checkup, 24 weeks gestation", 26, False, RedFlagChecklist()
    )
    assert dept == SpecialtyDepartment.OBGYN
    assert "obgyn" in reason.lower() or "pregnancy" in reason.lower()

    # Pediatrics (<14 years old routine checkup / non-localized complaint)
    dept, reason, review = determine_department_with_reason(
        "General pediatric health checkup and appetite assessment", 5, False, RedFlagChecklist()
    )
    assert dept == SpecialtyDepartment.PEDIATRICS
    assert "pediatric" in reason.lower()


def test_department_ambiguity_flags_staff_review():
    """Multiple specialties or vague complaints must set requires_department_review = True."""
    # Ambiguous multi-specialty presentation: knee joint pain AND eye irritation
    dept, reason, review = determine_department_with_reason(
        "Left knee pain swelling and also severe red eye irritation with blurry vision", 45, False, RedFlagChecklist()
    )
    assert review is True
    assert "multiple" in reason.lower() or "review" in reason.lower()

    # Vague complaint
    dept, reason, review = determine_department_with_reason(
        "Feeling sick and uneasy", 45, False, RedFlagChecklist()
    )
    assert review is True
    assert "vague" in reason.lower() or "insufficient" in reason.lower() or "review" in reason.lower()


def test_department_routing_cannot_downgrade_emergency():
    """Safety override invariant: Department routing never overrides Level 1 emergency."""
    # Even if patient has knee pain, if they have crushing chest pain or SpO2 < 90, department is Casualty / Emergency
    dept, reason, review = determine_department_with_reason(
        "Severe knee pain and acute crushing chest pain with sweating", 60, True, RedFlagChecklist(crushing_chest_pain=True)
    )
    assert dept == SpecialtyDepartment.CASUALTY_EMERGENCY
    assert "emergency" in reason.lower() or "casualty" in reason.lower()


# -----------------------------------------------------------------------------
# 4. MULTILINGUAL & TRANSLITERATED COMPLAINTS (ENGLISH & TELUGU)
# -----------------------------------------------------------------------------

def test_telugu_script_complaints():
    """Verify Telugu script complaints are recognized and mapped accurately."""
    # గుండె నొప్పి (Chest pain)
    res_te = process_complaint("తీవ్రమైన గుండె నొప్పి మరియు చెమటలు")
    assert res_te.detected_language == LanguageFormat.TELUGU_SCRIPT
    assert "chest_pain" in res_te.red_flag_triggers

    # ఆయాసం (Breathlessness)
    res_asthma = process_complaint("తీవ్రమైన ఆయాసం దగ్గు")
    assert res_asthma.detected_language == LanguageFormat.TELUGU_SCRIPT
    assert "respiratory_distress" in res_asthma.red_flag_triggers

    # కడుపు నొప్పి (Abdominal pain)
    res_stomach = process_complaint("రెండు రోజులుగా కడుపు నొప్పి మరియు వాంతులు")
    assert res_stomach.detected_language == LanguageFormat.TELUGU_SCRIPT
    assert "abdominal_pain" in res_stomach.positive_concepts


def test_telugu_transliterated_complaints():
    """Verify Telugu transliterated complaints are recognized and mapped accurately."""
    # "gunde noppi" -> Chest pain
    res_translit = process_complaint("chaala gunde noppi ga undi mariyu chematalu")
    assert res_translit.detected_language == LanguageFormat.TELUGU_TRANSLITERATION
    assert "chest_pain" in res_translit.red_flag_triggers

    # "aayasam" -> Breathlessness
    res_resp = process_complaint("pedda aayasam ga undi dammu vastondi")
    assert "respiratory_distress" in res_resp.red_flag_triggers

    # "kadupu noppi" -> Abdominal pain
    res_abd = process_complaint("kadupu noppi mariyu vaantulu")
    assert "abdominal_pain" in res_abd.positive_concepts

    # "kaalla noppulu" -> Joint / Bone pain -> Orthopedics
    dept, reason, _ = determine_department_with_reason("kaalla noppulu nadavaleka potunna", 50, False, RedFlagChecklist())
    assert dept == SpecialtyDepartment.ORTHOPEDICS


def test_multilingual_api_integration():
    """End-to-end API test with Telugu transliterated acute emergency complaint."""
    payload = {
        "patient_name": "Srinivas Rao",
        "age": 58,
        "gender": "Male",
        "chief_complaint": "gunde noppi ga undi gundelo manta chematalu",
        "symptom_duration_days": 0,
        "vitals": {
            "heart_rate": 125,
            "systolic_bp": 90,
            "diastolic_bp": 60,
            "spo2": 91.0,
            "respiratory_rate": 26,
            "temperature_f": 98.4,
            "avpu": "ALERT"
        },
        "red_flags": {}
    }
    res = client.post("/api/triage/assess", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["triage_level"] in (1, 2)
    assert len(data["observed_facts"]) > 0
    assert any("gunde noppi" in f for f in data["observed_facts"])
    assert data["recommended_department"] in ("Casualty / Emergency", "Cardiology")
