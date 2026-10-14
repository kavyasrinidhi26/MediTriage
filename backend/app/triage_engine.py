import re
from datetime import datetime, timezone
from typing import List, Tuple, Optional

from app.schemas import (
    PatientTriageRequest,
    TriageAssessmentResult,
    TriageCategory,
    SpecialtyDepartment,
    AVPUScale,
    VitalSigns,
    RedFlagChecklist,
)
from app.nlp.complaint_processor import process_complaint
from app.nlp.symptom_dictionary import (
    CONCEPT_CHEST_PAIN,
    CONCEPT_RESPIRATORY_DISTRESS,
    CONCEPT_FEVER,
    CONCEPT_ALTERED_SENSORIUM,
    CONCEPT_SEVERE_BLEEDING,
    CONCEPT_HEADACHE,
    CONCEPT_ABDOMINAL_PAIN,
    CONCEPT_VOMITING_DIARRHEA,
    CONCEPT_SEIZURE,
    CONCEPT_TRAUMA,
    CONCEPT_PALPITATIONS,
    CONCEPT_DIZZINESS,
    CONCEPT_STROKE_DEFICIT,
    CONCEPT_COUGH,
    CONCEPT_JOINT_BONE_PAIN,
    CONCEPT_SKIN_RASH,
    CONCEPT_EYE_SYMPTOMS,
    CONCEPT_EAR_ENT_SYMPTOMS,
    CONCEPT_PREGNANCY_OBGYN,
    CONCEPT_ROUTINE_ADMINISTRATIVE,
)


def contains_any_word(text: str, keywords: List[str]) -> bool:
    """Matches keywords with word boundary checking to avoid false substring matches like 'ear' in 'forearm'."""
    for kw in keywords:
        pattern = r"\b" + re.escape(kw) + r"\b"
        if re.search(pattern, text):
            return True
    return False


def determine_department_with_reason(
    complaint: str,
    age: int,
    is_emergency: bool,
    red_flags: RedFlagChecklist,
    positive_concepts: Optional[List[str]] = None,
) -> Tuple[SpecialtyDepartment, str, bool]:
    """
    Deterministic routing to hospital specialty based on symptom patterns and demographics.
    Returns:
    - SpecialtyDepartment enum
    - Clinical rationale explaining why this department was selected
    - requires_department_review boolean flag (True if multiple specialties plausible or complaint is vague)
    """
    positive_concepts = positive_concepts or []
    complaint_lower = (complaint or "").lower()

    # Safety Invariant: Emergency cases are always routed to Casualty / Resuscitation Bay
    if is_emergency:
        return (
            SpecialtyDepartment.CASUALTY_EMERGENCY,
            "Immediate casualty and resuscitation team transfer due to critical red flags or vital instability.",
            False,
        )

    candidates: List[Tuple[SpecialtyDepartment, str]] = []

    # 1. Obstetrics & Gynecology
    if red_flags.active_labor_or_eclampsia or CONCEPT_PREGNANCY_OBGYN in positive_concepts or contains_any_word(complaint_lower, [
        "pregnancy", "labor", "vaginal", "menstrual", "period", "pelvic pain", "antenatal", "pregnant",
        "garbhavathi", "nelalu", "delivery noppulu", "periods"
    ]):
        candidates.append((SpecialtyDepartment.OBGYN, "obstetric, gynecologic, or pregnancy-related symptoms"))

    # 2. Cardiology
    if CONCEPT_CHEST_PAIN in positive_concepts or CONCEPT_PALPITATIONS in positive_concepts or contains_any_word(complaint_lower, [
        "chest pain", "palpitation", "palpitations", "heart", "angina", "cardiac",
        "gunde noppi", "gundelo noppi", "chhati noppi", "chest lo noppi"
    ]):
        candidates.append((SpecialtyDepartment.CARDIOLOGY, "cardiac or chest complaints"))

    # 3. Pulmonology (for adolescent and adult patients; pediatric cough/cold routes to Pediatrics)
    if age >= 14 and (
        CONCEPT_RESPIRATORY_DISTRESS in positive_concepts or CONCEPT_COUGH in positive_concepts or contains_any_word(complaint_lower, [
            "breathless", "breathlessness", "asthma", "cough", "wheezing", "phlegm", "copd", "respiratory",
            "tb", "tuberculosis", "aayasam", "ayasam", "daggu", "kafam"
        ])
    ):
        candidates.append((SpecialtyDepartment.PULMONOLOGY, "respiratory symptoms or pulmonary complaints"))

    # 4. Dermatology
    if CONCEPT_SKIN_RASH in positive_concepts or contains_any_word(complaint_lower, [
        "skin", "rash", "itching", "itchy", "eczema", "boil", "allergy", "fungal", "psoriasis", "dermatitis",
        "durada", "charmam durada", "daddurlu", "gajji"
    ]):
        candidates.append((SpecialtyDepartment.DERMATOLOGY, "dermatological rash or skin allergy symptoms"))

    # 5. Orthopedics
    if CONCEPT_JOINT_BONE_PAIN in positive_concepts or contains_any_word(complaint_lower, [
        "fracture", "bone", "joint", "sprain", "knee", "backache", "fall", "dislocation", "arthritis",
        "keella noppulu", "mokaalla noppi", "nadumu noppi", "emuka virigindi", "back pain", "knee pain",
        "kaalla noppulu", "kaalla noppi"
    ]):
        candidates.append((SpecialtyDepartment.ORTHOPEDICS, "musculoskeletal, joint, or bone symptoms"))

    # 6. Ophthalmology
    if CONCEPT_EYE_SYMPTOMS in positive_concepts or contains_any_word(complaint_lower, [
        "eye", "vision", "blur", "cataract", "cornea", "conjunctivitis",
        "kanti noppi", "kanti choopu", "kallu errabadatam"
    ]):
        candidates.append((SpecialtyDepartment.OPHTHALMOLOGY, "ocular or visual symptoms"))

    # 7. ENT (Ear, Nose, Throat)
    if CONCEPT_EAR_ENT_SYMPTOMS in positive_concepts or contains_any_word(complaint_lower, [
        "ear", "throat", "nose", "sinus", "hearing", "tonsil", "hoarseness", "earache", "epistaxis",
        "chevi noppi", "gonthu noppi", "sore throat"
    ]):
        candidates.append((SpecialtyDepartment.ENT, "ear, nose, or throat complaints"))

    # 8. General Surgery
    if contains_any_word(complaint_lower, [
        "abscess", "wound", "cut", "lump", "swelling", "hernia", "appendicitis", "hemorrhoid", "piles"
    ]):
        candidates.append((SpecialtyDepartment.GENERAL_SURGERY, "localized surgical, wound, or abdominal mass complaints"))

    # 9. Psychiatry
    if contains_any_word(complaint_lower, [
        "depression", "anxiety", "panic", "psychosis", "hallucination", "sleep disorder", "insomnia"
    ]):
        candidates.append((SpecialtyDepartment.PSYCHIATRY, "psychological or mental health complaints"))

    # 10. Pediatrics (for children under 14 without localized subspecialty)
    if age < 14:
        if not candidates:
            return (
                SpecialtyDepartment.PEDIATRICS,
                f"Routed to Pediatrics based on patient age ({age} years < 14) and pediatric care protocol.",
                False,
            )
        # If localized subspecialty exists (e.g. eye, ear, fracture), subspecialty takes clinical priority
        # but pediatric review is noted

    # Evaluate multiple plausible departments vs specific vs non-specific
    if len(candidates) > 1:
        primary_dept, primary_reason = candidates[0]
        all_dept_names = [c[0].value for c in candidates]
        return (
            primary_dept,
            f"Multiple plausible clinical specialties detected ({', '.join(all_dept_names)}). Staff review recommended to confirm primary counter.",
            True,
        )
    elif len(candidates) == 1:
        dept, reason = candidates[0]
        return (dept, f"Routed to {dept.value} based on {reason}.", False)
    else:
        # No specific specialty candidates found
        is_vague = (
            len(complaint_lower.split()) < 2
            or contains_any_word(complaint_lower, ["sick", "unwell", "ill", "pain", "weakness", "not feeling well", "problem", "body pain"])
        )
        if is_vague:
            return (
                SpecialtyDepartment.GENERAL_MEDICINE,
                "Presenting complaint is non-specific; nurse intake review required to determine appropriate specialty.",
                True,
            )
        return (
            SpecialtyDepartment.GENERAL_MEDICINE,
            "Routed to General Medicine for systemic clinical evaluation.",
            False,
        )


def determine_department(
    complaint: str,
    age: int,
    is_emergency: bool,
    red_flags: RedFlagChecklist
) -> SpecialtyDepartment:
    """Backwards-compatible wrapper returning SpecialtyDepartment enum."""
    dept, _, _ = determine_department_with_reason(complaint, age, is_emergency, red_flags)
    return dept


def evaluate_triage(request: PatientTriageRequest) -> TriageAssessmentResult:
    """
    Evaluates patient acuity across standard 5 distinct triage levels (1-5)
    using the documented clinical definitions in docs/TRIAGE_CRITERIA.md.
    
    Level 1: Resuscitation / Immediate (Red, Target wait 0 min)
    Level 2: Emergent / Very Urgent (Orange/Yellow, Target wait <= 15 min)
    Level 3: Urgent (Yellow, Target wait <= 30 min)
    Level 4: Less Urgent / Standard (Green, Target wait <= 60 min)
    Level 5: Non-Urgent / Primary Care (Blue/Green, Target wait <= 120 min)
    """
    red_flags: List[str] = []
    vital_abnormalities: List[str] = []
    clinical_rationale: List[str] = []
    observed_facts: List[str] = []
    inferred_risks: List[str] = []

    rf: RedFlagChecklist = request.red_flags
    v: VitalSigns = request.vitals
    age: int = request.age
    complaint_raw = request.chief_complaint or ""
    complaint_lower = complaint_raw.lower()

    # Process multilingual chief complaint safely
    complaint_res = process_complaint(complaint_raw)
    positive_concepts = complaint_res.positive_concepts

    # 1. Record Observed Facts (strictly facts directly reported or observed)
    observed_facts.append(f"Demographics: {age}yo {request.gender}")
    observed_facts.append(f"Presenting Complaint ({complaint_res.detected_language.value}): \"{complaint_raw}\"")
    if positive_concepts:
        observed_facts.append(f"Extracted Active Findings: {', '.join(positive_concepts)}")
    if complaint_res.negated_concepts:
        observed_facts.append(f"Explicitly Denied Symptoms: {', '.join(complaint_res.negated_concepts)}")
    if v.heart_rate is not None:
        observed_facts.append(f"Observed Heart Rate: {v.heart_rate} bpm")
    if v.systolic_bp is not None:
        observed_facts.append(f"Observed Blood Pressure: {v.systolic_bp}/{v.diastolic_bp or '-'} mmHg")
    if v.spo2 is not None:
        observed_facts.append(f"Observed SpO2: {v.spo2}%")
    if v.respiratory_rate is not None:
        observed_facts.append(f"Observed Respiratory Rate: {v.respiratory_rate}/min")
    if v.temperature_f is not None:
        observed_facts.append(f"Observed Temperature: {v.temperature_f}°F")
    observed_facts.append(f"Observed Sensorium (AVPU): {v.avpu.value if hasattr(v.avpu, 'value') else v.avpu}")

    # 2. Evaluate Clinical Red Flags (Checklist + NLP triggers)
    if rf.severe_respiratory_distress or "respiratory_distress" in complaint_res.red_flag_triggers:
        red_flags.append("Severe respiratory distress / acute breathing compromise")
    if rf.crushing_chest_pain or "chest_pain" in complaint_res.red_flag_triggers:
        red_flags.append("Acute crushing chest pain (potential acute coronary syndrome)")
    if rf.acute_neurological_deficit or "stroke_deficit" in complaint_res.red_flag_triggers:
        red_flags.append("Acute neurological deficit / focal stroke symptoms")
    if rf.massive_bleeding_or_shock or "severe_bleeding" in complaint_res.red_flag_triggers:
        red_flags.append("Massive hemorrhage or circulatory collapse / clinical shock")
    if rf.severe_trauma or "trauma" in complaint_res.red_flag_triggers:
        red_flags.append("Severe trauma / major injury with compromised stability")
    if rf.active_labor_or_eclampsia:
        red_flags.append("Active emergency labor or eclamptic seizure risk")
    if rf.high_fever_with_stiff_neck:
        red_flags.append("High fever with meningeal signs / altered sensorium")
    if rf.severe_dehydration_lethargy:
        red_flags.append("Severe dehydration with lethargy / sunken eyes (high-risk shock)")
    if "seizure" in complaint_res.red_flag_triggers:
        red_flags.append("Active or unprovoked seizure / convulsions")

    # 3. Evaluate Vital Signs Derangements
    # SpO2
    if v.spo2 is not None:
        if v.spo2 < 90.0:
            vital_abnormalities.append(f"Critical Hypoxemia (SpO2 {v.spo2}% < 90%)")
            inferred_risks.append("Imminent respiratory failure / acute tissue hypoxia")
        elif v.spo2 <= 94.0:
            vital_abnormalities.append(f"Borderline Hypoxemia (SpO2 {v.spo2}%)")
            inferred_risks.append("Subacute gas exchange impairment")

    # Heart Rate
    if v.heart_rate is not None:
        if v.heart_rate == 0:
            vital_abnormalities.append("Cardiac arrest / Pulseless reading (0 bpm)")
            inferred_risks.append("Cardiac arrest or non-viable measurement requiring carotid pulse verification")
        elif v.heart_rate > 130:
            vital_abnormalities.append(f"Severe Tachycardia (Heart Rate {v.heart_rate} bpm > 130)")
            inferred_risks.append("Hemodynamic decompensation or severe tachyarrhythmia")
        elif v.heart_rate < 40:
            vital_abnormalities.append(f"Severe Bradycardia (Heart Rate {v.heart_rate} bpm < 40)")
            inferred_risks.append("Profound bradycardia risking hemodynamic arrest")
        elif v.heart_rate > 100:
            vital_abnormalities.append(f"Moderate Tachycardia (Heart Rate {v.heart_rate} bpm)")
        elif v.heart_rate < 50:
            vital_abnormalities.append(f"Borderline Bradycardia (Heart Rate {v.heart_rate} bpm)")

    # Blood Pressure (Systolic & Diastolic)
    if v.systolic_bp is not None:
        if v.systolic_bp < 90:
            vital_abnormalities.append(f"Hypotension / Shock indicator (Systolic BP {v.systolic_bp} mmHg < 90)")
            inferred_risks.append("Clinical shock / circulatory failure")
        elif v.systolic_bp >= 200:
            vital_abnormalities.append(f"Hypertensive Crisis range (Systolic BP {v.systolic_bp} mmHg >= 200)")
            inferred_risks.append("Acute end-organ hypertensive damage risk")
        elif v.systolic_bp >= 160:
            vital_abnormalities.append(f"Stage 2 Severe Hypertension (Systolic BP {v.systolic_bp} mmHg)")
            inferred_risks.append("Stage 2 severe hypertension with acute cardiovascular risk")
        elif v.systolic_bp < 100:
            vital_abnormalities.append(f"Borderline low Systolic BP ({v.systolic_bp} mmHg)")
    if v.diastolic_bp is not None:
        if v.diastolic_bp >= 120 and not (v.systolic_bp is not None and v.systolic_bp >= 200):
            vital_abnormalities.append(f"Hypertensive Crisis range (Diastolic BP {v.diastolic_bp} mmHg >= 120)")
            inferred_risks.append("Severe malignant diastolic hypertension")
        elif v.diastolic_bp >= 100:
            vital_abnormalities.append(f"Stage 2 Diastolic Hypertension ({v.diastolic_bp} mmHg)")

    # Respiratory Rate
    if v.respiratory_rate is not None:
        if v.respiratory_rate > 30:
            vital_abnormalities.append(f"Severe Tachypnea (Respiratory Rate {v.respiratory_rate}/min > 30)")
            inferred_risks.append("Severe respiratory muscle exhaustion risk")
        elif 0 < v.respiratory_rate < 8:
            vital_abnormalities.append(f"Bradypnea / Respiratory Depression (Respiratory Rate {v.respiratory_rate}/min < 8)")
            inferred_risks.append("Impending ventilatory arrest")
        elif v.respiratory_rate >= 21:
            vital_abnormalities.append(f"Elevated Respiratory Rate ({v.respiratory_rate}/min)")

    # Temperature
    if v.temperature_f is not None:
        if v.temperature_f >= 104.0:
            vital_abnormalities.append(f"Hyperpyrexia (Temperature {v.temperature_f}°F >= 104°F)")
            inferred_risks.append("Extreme pyrexia with febrile delirium/seizure vulnerability")
        elif v.temperature_f < 95.0:
            vital_abnormalities.append(f"Severe Hypothermia (Temperature {v.temperature_f}°F < 95°F)")
            inferred_risks.append("Profound hypothermic systemic depression")
        elif v.temperature_f >= 101.5:
            vital_abnormalities.append(f"High Fever (Temperature {v.temperature_f}°F)")
        elif v.temperature_f >= 99.6:
            vital_abnormalities.append(f"Mild Pyrexia (Temperature {v.temperature_f}°F)")

    # AVPU Sensorium
    if v.avpu == AVPUScale.UNRESPONSIVE:
        vital_abnormalities.append("Unresponsive on AVPU scale (Immediate resuscitation required)")
        inferred_risks.append("Coma / Loss of airway protective reflexes")
    elif v.avpu == AVPUScale.PAIN:
        vital_abnormalities.append("Responds to pain only on AVPU scale (Impaired consciousness)")
        inferred_risks.append("Severe neurological depression")
    elif v.avpu == AVPUScale.VERBAL:
        vital_abnormalities.append("Responds only to verbal stimuli (Depressed mental state)")
        inferred_risks.append("Lethargy / Depressed conscious state")

    # 4. Five-Level Acuity Evaluation (Strictly following docs/TRIAGE_CRITERIA.md)
    # --------------------------------------------------------------------------
    # Level 1 Criteria: Critical Red Flags or Critical Vital Signs
    is_level_1 = (
        len(red_flags) > 0
        or v.avpu in (AVPUScale.UNRESPONSIVE, AVPUScale.PAIN)
        or (v.spo2 is not None and v.spo2 < 90.0)
        or (v.heart_rate is not None and (v.heart_rate == 0 or v.heart_rate < 40 or v.heart_rate > 130))
        or (v.systolic_bp is not None and (v.systolic_bp < 90 or v.systolic_bp >= 200))
        or (v.diastolic_bp is not None and v.diastolic_bp >= 120)
        or (v.respiratory_rate is not None and (v.respiratory_rate > 30 or (0 < v.respiratory_rate < 8)))
        or (v.temperature_f is not None and (v.temperature_f >= 104.0 or v.temperature_f < 95.0))
    )

    # Level 2 Criteria: Emergent / Very Urgent (Borderline vital instability, vulnerability, or severe acute symptoms)
    is_level_2 = not is_level_1 and (
        (v.spo2 is not None and 90.0 <= v.spo2 <= 94.0)
        or (v.heart_rate is not None and ((40 <= v.heart_rate < 50) or (101 <= v.heart_rate <= 130)))
        or (v.systolic_bp is not None and ((90 <= v.systolic_bp < 100) or (160 <= v.systolic_bp < 200)))
        or (v.diastolic_bp is not None and 100 <= v.diastolic_bp < 120)
        or (v.respiratory_rate is not None and 21 <= v.respiratory_rate <= 30)
        or (v.temperature_f is not None and 101.5 <= v.temperature_f < 104.0)
        or v.avpu == AVPUScale.VERBAL
        or (age < 5 and v.temperature_f is not None and v.temperature_f >= 101.0)
        or (age > 65 and v.systolic_bp is not None and v.systolic_bp >= 160)
        or any(k in complaint_lower for k in ["severe pain", "severe bleeding", "acute asthma", "fainting", "syncope"])
        or (CONCEPT_VOMITING_DIARRHEA in positive_concepts and (v.temperature_f is not None and v.temperature_f >= 100.0))
    )

    # Level 3 Criteria: Urgent (Mild abnormal vitals or acute systemic illness requiring multiple resources)
    is_level_3 = not is_level_1 and not is_level_2 and (
        (v.temperature_f is not None and 99.6 <= v.temperature_f < 101.5)
        or (v.heart_rate is not None and 95 <= v.heart_rate <= 100)
        or (v.systolic_bp is not None and 140 <= v.systolic_bp < 160)
        or (v.respiratory_rate is not None and 20 <= v.respiratory_rate <= 22)
        or CONCEPT_ABDOMINAL_PAIN in positive_concepts
        or CONCEPT_FEVER in positive_concepts
        or CONCEPT_VOMITING_DIARRHEA in positive_concepts
        or any(k in complaint_lower for k in [
            "abdominal pain", "stomach ache", "belly pain", "kadupu noppi"
        ])
    )

    # Level 5 Criteria: Non-Urgent / Primary Care (Routine checkups, prescription renewals, administrative)
    is_level_5 = not is_level_1 and not is_level_2 and not is_level_3 and (
        CONCEPT_ROUTINE_ADMINISTRATIVE in positive_concepts
        or any(k in complaint_lower for k in [
            "routine checkup", "regular follow-up", "blood sugar check", "bp check", "refill",
            "repeat medication", "prescription renewal", "dressing change", "suture removal",
            "medical certificate", "health checkup", "annual review", "sugar checkup", "bp checkup",
            "follow up", "mandulu", "sugar test", "bp test"
        ])
    )

    # Assign final 5-level designations
    if is_level_1:
        category = TriageCategory.EMERGENCY
        urgency_label = "RED - IMMEDIATE CASUALTY ALERT"
        triage_level = 1
        triage_level_name = "Level 1 - Resuscitation / Immediate"
        urgency_score = 10 if (v.avpu == AVPUScale.UNRESPONSIVE or (v.spo2 is not None and v.spo2 < 85)) else 9
        max_wait = 0
        action = "Immediate transfer to Emergency Resuscitation / Casualty Ward without queuing."
        clinical_rationale.append("Level 1 assigned: Patient exhibits critical red-flag signs or acute life-threatening vital sign derangement.")
    elif is_level_2:
        category = TriageCategory.PRIORITY
        urgency_label = "ORANGE - VERY URGENT OPD REVIEW"
        triage_level = 2
        triage_level_name = "Level 2 - Emergent"
        urgency_score = 8 if len(vital_abnormalities) >= 2 else 7
        max_wait = 15
        action = "Fast-track in Priority Review queue; bedside clinician evaluation targeted within 15 minutes."
        clinical_rationale.append("Level 2 assigned: High-risk clinical presentation with potential rapid physiological deterioration or severe pain.")
    elif is_level_3:
        category = TriageCategory.PRIORITY
        urgency_label = "YELLOW - URGENT OPD ATTENTION"
        triage_level = 3
        triage_level_name = "Level 3 - Urgent"
        urgency_score = 6 if len(vital_abnormalities) > 0 else 5
        max_wait = 30
        action = "Priority OPD token queue; physician evaluation targeted within 30 minutes."
        clinical_rationale.append("Level 3 assigned: Moderate physiological derangement or acute systemic illness requiring physician evaluation.")
    elif not is_level_1 and complaint_res.requires_nurse_review:
        # SAFETY INVARIANT: If the complaint is unsupported, ambiguous, contradictory, or uncertain,
        # never classify as Routine OPD. Place in Priority Holding with clear nurse review mandate.
        category = TriageCategory.PRIORITY
        urgency_label = "Cannot assess safely — send to nurse now."
        triage_level = 2
        triage_level_name = "Cannot assess safely — send to nurse now."
        urgency_score = 6
        max_wait = 15
        action = "Cannot assess safely — send to nurse now. Immediate bedside nurse verification required."
        clinical_rationale.append(f"Cannot assess safely — send to nurse now: {complaint_res.review_reason}")
    elif is_level_5:
        category = TriageCategory.ROUTINE
        urgency_label = "BLUE - NON-URGENT / PRIMARY CARE"
        triage_level = 5
        triage_level_name = "Level 5 - Non-Urgent"
        urgency_score = 1
        max_wait = 120
        action = "Direct to standard primary care / prescription renewal counter according to token order."
        clinical_rationale.append("Level 5 assigned: Fully stable vitals with routine chronic maintenance or administrative consultation.")
    else:
        # Default Level 4: Less Urgent / Standard OPD
        category = TriageCategory.ROUTINE
        urgency_label = "GREEN - LESS URGENT / STANDARD OPD"
        triage_level = 4
        triage_level_name = "Level 4 - Less Urgent"
        urgency_score = 3
        max_wait = 60
        action = "Direct to standard OPD consultation queue according to registration token."
        clinical_rationale.append("Level 4 assigned: Vitals are within stable operational parameters with mild or subacute localized symptoms.")

    if red_flags:
        clinical_rationale.extend([f"Red Flag: {rf_item}" for rf_item in red_flags])
    if vital_abnormalities:
        clinical_rationale.extend([f"Vital Alert: {v_item}" for v_item in vital_abnormalities])
    if complaint_res.requires_nurse_review and complaint_res.review_reason and not (not is_level_1 and complaint_res.requires_nurse_review):
        clinical_rationale.append(f"Language Notice: {complaint_res.review_reason}")

    # 5. Determine Recommended Specialty Department with Clinical Reason
    department, dept_reason, requires_dept_review = determine_department_with_reason(
        complaint=complaint_raw,
        age=age,
        is_emergency=is_level_1,
        red_flags=rf,
        positive_concepts=positive_concepts,
    )
    if complaint_res.requires_nurse_review:
        requires_dept_review = True

    return TriageAssessmentResult(
        triage_category=category,
        urgency_level=urgency_label,
        triage_level=triage_level,
        triage_level_name=triage_level_name,
        urgency_score=urgency_score,
        recommended_department=department,
        department_reason=dept_reason,
        requires_department_review=requires_dept_review,
        red_flags_identified=red_flags,
        vital_abnormalities=vital_abnormalities,
        observed_facts=observed_facts,
        inferred_risks=inferred_risks,
        clinical_rationale=clinical_rationale,
        recommended_action=action,
        max_recommended_wait_minutes=max_wait,
        assessment_timestamp=datetime.now(timezone.utc),
        detected_language=complaint_res.detected_language.value,
        extracted_symptoms=[s.model_dump() for s in complaint_res.extracted_symptoms],
        positive_concepts=complaint_res.positive_concepts,
        negated_concepts=complaint_res.negated_concepts,
        uncertain_concepts=complaint_res.uncertain_concepts,
        original_complaint=complaint_res.original_complaint,
        requires_complaint_review=complaint_res.requires_nurse_review,
        complaint_review_reason=complaint_res.review_reason,
    )
