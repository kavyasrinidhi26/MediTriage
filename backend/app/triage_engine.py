from datetime import datetime, timezone
from typing import List, Tuple
from app.schemas import (
    PatientTriageRequest,
    TriageAssessmentResult,
    TriageCategory,
    SpecialtyDepartment,
    AVPUScale,
    VitalSigns,
    RedFlagChecklist,
)


def evaluate_triage(request: PatientTriageRequest) -> TriageAssessmentResult:
    """
    Evaluates patient urgency using established clinical vital signs thresholds
    and protocol red flags adapted from standard triage guidelines (ESI / MTS / Indian National Health protocols).
    Transparent, verifiable, and deterministic rule-based evaluation.
    """
    red_flags: List[str] = []
    vital_abnormalities: List[str] = []
    clinical_rationale: List[str] = []

    rf: RedFlagChecklist = request.red_flags
    v: VitalSigns = request.vitals
    age: int = request.age
    complaint_lower = request.chief_complaint.lower()

    # 1. Evaluate Red Flags
    if rf.severe_respiratory_distress:
        red_flags.append("Severe respiratory distress / acute airway or breathing compromise")
    if rf.crushing_chest_pain:
        red_flags.append("Acute crushing chest pain (potential acute coronary syndrome)")
    if rf.acute_neurological_deficit:
        red_flags.append("Acute neurological deficit (facial droop, limb weakness, or speech slurring)")
    if rf.massive_bleeding_or_shock:
        red_flags.append("Massive hemorrhage or circulatory collapse / clinical shock")
    if rf.severe_trauma:
        red_flags.append("Severe trauma / major injury with compromised stability")
    if rf.active_labor_or_eclampsia:
        red_flags.append("Active emergency labor or eclamptic seizure risk")
    if rf.high_fever_with_stiff_neck:
        red_flags.append("High fever with meningeal signs / altered sensorium")
    if rf.severe_dehydration_lethargy:
        red_flags.append("Severe dehydration with lethargy / sunken eyes (high-risk shock)")

    # 2. Evaluate Vital Signs
    # SpO2
    if v.spo2 is not None:
        if v.spo2 < 90.0:
            vital_abnormalities.append(f"Critical Hypoxemia (SpO2 {v.spo2}% < 90%)")
        elif v.spo2 <= 94.0:
            vital_abnormalities.append(f"Borderline Hypoxemia (SpO2 {v.spo2}%)")

    # Heart Rate
    if v.heart_rate is not None:
        if v.heart_rate > 130:
            vital_abnormalities.append(f"Severe Tachycardia (Heart Rate {v.heart_rate} bpm > 130)")
        elif v.heart_rate < 40:
            vital_abnormalities.append(f"Severe Bradycardia (Heart Rate {v.heart_rate} bpm < 40)")
        elif v.heart_rate > 105:
            vital_abnormalities.append(f"Mild Tachycardia (Heart Rate {v.heart_rate} bpm)")
        elif v.heart_rate < 50:
            vital_abnormalities.append(f"Moderate Bradycardia (Heart Rate {v.heart_rate} bpm)")

    # Blood Pressure (Systolic & Diastolic)
    if v.systolic_bp is not None:
        if v.systolic_bp < 90:
            vital_abnormalities.append(f"Hypotension / Shock indicator (Systolic BP {v.systolic_bp} mmHg < 90)")
        elif v.systolic_bp >= 200:
            vital_abnormalities.append(f"Hypertensive Crisis range (Systolic BP {v.systolic_bp} mmHg >= 200)")
        elif v.systolic_bp >= 160:
            vital_abnormalities.append(f"Stage 2 Hypertension range (Systolic BP {v.systolic_bp} mmHg)")
        elif v.systolic_bp < 100:
            vital_abnormalities.append(f"Borderline low Systolic BP ({v.systolic_bp} mmHg)")
    if v.diastolic_bp is not None:
        if v.diastolic_bp >= 120 and not (v.systolic_bp is not None and v.systolic_bp >= 200):
            vital_abnormalities.append(f"Hypertensive Crisis range (Diastolic BP {v.diastolic_bp} mmHg >= 120)")

    # Respiratory Rate
    if v.respiratory_rate is not None:
        if v.respiratory_rate > 30:
            vital_abnormalities.append(f"Severe Tachypnea (Respiratory Rate {v.respiratory_rate}/min > 30)")
        elif v.respiratory_rate < 8:
            vital_abnormalities.append(f"Bradypnea / Respiratory depression (Respiratory Rate {v.respiratory_rate}/min < 8)")
        elif v.respiratory_rate > 22:
            vital_abnormalities.append(f"Tachypnea (Respiratory Rate {v.respiratory_rate}/min)")

    # Temperature
    if v.temperature_f is not None:
        if v.temperature_f >= 104.0:
            vital_abnormalities.append(f"Hyperpyrexia (Temperature {v.temperature_f}°F >= 104°F)")
        elif v.temperature_f >= 101.5:
            vital_abnormalities.append(f"High Fever (Temperature {v.temperature_f}°F)")
        elif v.temperature_f < 95.0:
            vital_abnormalities.append(f"Hypothermia (Temperature {v.temperature_f}°F < 95°F)")

    # Consciousness / AVPU
    if v.avpu == AVPUScale.UNRESPONSIVE:
        vital_abnormalities.append("Unresponsive on AVPU scale (Immediate resuscitation required)")
    elif v.avpu == AVPUScale.PAIN:
        vital_abnormalities.append("Responds to pain only on AVPU scale (Impaired consciousness)")
    elif v.avpu == AVPUScale.VERBAL:
        vital_abnormalities.append("Responds only to verbal stimuli (Depressed mental state)")

    # 3. Categorize Urgency Level
    is_emergency = False
    is_priority = False
    urgency_score = 2

    # Level 1: EMERGENCY (Red)
    if (
        len(red_flags) > 0
        or v.avpu in (AVPUScale.UNRESPONSIVE, AVPUScale.PAIN)
        or (v.spo2 is not None and v.spo2 < 90.0)
        or (v.heart_rate is not None and (v.heart_rate > 130 or v.heart_rate < 40))
        or (v.systolic_bp is not None and (v.systolic_bp < 90 or v.systolic_bp >= 200))
        or (v.diastolic_bp is not None and v.diastolic_bp >= 120)
        or (v.respiratory_rate is not None and (v.respiratory_rate > 30 or v.respiratory_rate < 8))
    ):
        is_emergency = True
        urgency_score = 9
        if v.avpu == AVPUScale.UNRESPONSIVE or (v.spo2 is not None and v.spo2 < 85):
            urgency_score = 10

    # Level 2: PRIORITY (Yellow)
    elif (
        len(vital_abnormalities) > 0
        or v.avpu == AVPUScale.VERBAL
        or (age < 5 and v.temperature_f is not None and v.temperature_f >= 101.0)
        or (age > 65 and v.systolic_bp is not None and v.systolic_bp >= 160)
        or any(k in complaint_lower for k in ["severe pain", "bleeding", "vomiting", "asthma", "breath", "dizziness", "fainting"])
    ):
        is_priority = True
        urgency_score = 6
        if len(vital_abnormalities) >= 2:
            urgency_score = 7

    # Assign Category & Rationale
    if is_emergency:
        category = TriageCategory.EMERGENCY
        urgency_label = "RED - IMMEDIATE CASUALTY ALERT"
        triage_level = 1 if urgency_score == 10 else 2
        triage_level_name = "Level 1: Resuscitation" if urgency_score == 10 else "Level 2: Emergent"
        max_wait = 0
        action = "Immediate transfer to Emergency Resuscitation / Casualty Ward without queuing."
        clinical_rationale.append("Patient exhibits critical red-flag symptoms or life-threatening vital sign derangement.")
    elif is_priority:
        category = TriageCategory.PRIORITY
        urgency_label = "YELLOW - URGENT OPD ATTENTION"
        triage_level = 3
        triage_level_name = "Level 3: Urgent"
        max_wait = 30
        action = "Fast-track in current OPD specialty queue; reassess vitals every 20-30 minutes."
        clinical_rationale.append("Patient has significant physiological derangement or moderate distress requiring priority clinical review.")
    else:
        category = TriageCategory.ROUTINE
        urgency_label = "GREEN - ROUTINE OPD QUEUE"
        urgency_score = 3
        triage_level = 4 if urgency_score >= 3 else 5
        triage_level_name = "Level 4: Less Urgent" if urgency_score >= 3 else "Level 5: Non-Urgent"
        max_wait = 120
        action = "Direct to standard OPD consultation queue according to registration token."
        clinical_rationale.append("Vitals are within stable operational parameters with no critical acute red flags detected.")

    if red_flags:
        clinical_rationale.extend([f"Red Flag: {rf_item}" for rf_item in red_flags])
    if vital_abnormalities:
        clinical_rationale.extend([f"Vital Alert: {v_item}" for v_item in vital_abnormalities])

    # 4. Determine Recommended OPD Department
    department = determine_department(complaint_lower, age, is_emergency, rf)

    return TriageAssessmentResult(
        triage_category=category,
        urgency_level=urgency_label,
        triage_level=triage_level,
        triage_level_name=triage_level_name,
        urgency_score=urgency_score,
        recommended_department=department,
        red_flags_identified=red_flags,
        vital_abnormalities=vital_abnormalities,
        clinical_rationale=clinical_rationale,
        recommended_action=action,
        max_recommended_wait_minutes=max_wait,
        assessment_timestamp=datetime.now(timezone.utc),
    )


import re


def contains_any_word(text: str, keywords: List[str]) -> bool:
    """Matches keywords with word boundary checking to avoid false substring matches like 'ear' in 'forearm'."""
    for kw in keywords:
        pattern = r"\b" + re.escape(kw) + r"\b"
        if re.search(pattern, text):
            return True
    return False


def determine_department(
    complaint: str,
    age: int,
    is_emergency: bool,
    red_flags: RedFlagChecklist
) -> SpecialtyDepartment:
    """Deterministic routing to hospital specialty based on symptom patterns and demographics."""
    if is_emergency:
        return SpecialtyDepartment.CASUALTY_EMERGENCY

    # Obstetrics & Gynecology
    if red_flags.active_labor_or_eclampsia or contains_any_word(complaint, [
        "pregnancy", "labor", "vaginal", "menstrual", "period", "pelvic pain", "antenatal", "pregnant"
    ]):
        return SpecialtyDepartment.OBGYN

    # Pediatrics for younger patients
    if age < 14 and not contains_any_word(complaint, ["fracture", "bone", "eye", "ear", "skin"]):
        return SpecialtyDepartment.PEDIATRICS

    # Cardiology
    if contains_any_word(complaint, [
        "chest pain", "palpitation", "palpitations", "heart", "angina", "cardiac"
    ]):
        return SpecialtyDepartment.CARDIOLOGY

    # Pulmonology
    if contains_any_word(complaint, [
        "breathless", "breathlessness", "asthma", "cough", "wheezing", "phlegm", "copd", "respiratory", "tb", "tuberculosis"
    ]):
        return SpecialtyDepartment.PULMONOLOGY

    # Dermatology (check before general surgery / ENT)
    if contains_any_word(complaint, [
        "skin", "rash", "itching", "itchy", "eczema", "boil", "allergy", "fungal", "psoriasis", "dermatitis"
    ]):
        return SpecialtyDepartment.DERMATOLOGY

    # Orthopedics
    if contains_any_word(complaint, [
        "fracture", "bone", "joint", "sprain", "knee", "backache", "fall", "dislocation", "arthritis"
    ]):
        return SpecialtyDepartment.ORTHOPEDICS

    # Ophthalmology
    if contains_any_word(complaint, [
        "eye", "vision", "blur", "cataract", "cornea", "conjunctivitis"
    ]):
        return SpecialtyDepartment.OPHTHALMOLOGY

    # ENT
    if contains_any_word(complaint, [
        "ear", "throat", "nose", "sinus", "hearing", "tonsil", "hoarseness", "earache", "epistaxis"
    ]):
        return SpecialtyDepartment.ENT

    # Surgery
    if contains_any_word(complaint, [
        "abscess", "wound", "cut", "lump", "swelling", "hernia", "appendicitis", "hemorrhoid"
    ]):
        return SpecialtyDepartment.GENERAL_SURGERY

    # Psychiatry
    if contains_any_word(complaint, [
        "depression", "anxiety", "panic", "psychosis", "hallucination", "sleep disorder", "insomnia"
    ]):
        return SpecialtyDepartment.PSYCHIATRY

    # Default to General Medicine
    return SpecialtyDepartment.GENERAL_MEDICINE
