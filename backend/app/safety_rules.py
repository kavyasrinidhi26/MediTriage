from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from app.nlp.complaint_processor import process_complaint
from app.nlp.symptom_dictionary import (
    CONCEPT_CHEST_PAIN,
    CONCEPT_RESPIRATORY_DISTRESS,
    CONCEPT_ALTERED_SENSORIUM,
    CONCEPT_SEVERE_BLEEDING,
    CONCEPT_SEIZURE,
)

# Versioned rules derived from domain primer (docs/TRIAGE_CRITERIA.md)
SAFETY_RULE_VERSION = "2026.1-hackathon-domain-primer-v1"

SAFETY_RULES_DISCLAIMER = (
    "HACKATHON PROTOCOL NOTICE: These safety and validation rules are derived from "
    "the prototype domain primer for demonstration and clinical decision support only. "
    "They are NOT certified as an approved clinical medical device or diagnosis."
)


class DataQualityStatus(str, Enum):
    VALID = "VALID"
    MISSING = "MISSING"
    MALFORMED = "MALFORMED"
    CONTRADICTORY = "CONTRADICTORY"


class RuleAcuity(str, Enum):
    EMERGENCY = "EMERGENCY"  # Level 1 / Immediate life threat
    PRIORITY = "PRIORITY"    # Level 2 / Urgent
    ROUTINE = "ROUTINE"      # Level 3 / Standard OPD queue


class DataQualityIssue(BaseModel):
    field: str
    status: DataQualityStatus
    code: str
    message: str
    is_blocking: bool = False  # If true, data cannot be processed for ML


class ClinicalAlert(BaseModel):
    rule_id: str
    rule_name: str
    acuity_level: RuleAcuity
    message: str
    clinical_explanation: str
    required_human_verification: str
    is_critical_override: bool = False


class SafetyEvaluationResult(BaseModel):
    rule_version: str
    is_data_acceptable: bool
    data_quality_issues: List[DataQualityIssue]
    triggered_rule_ids: List[str]
    clinical_alerts: List[ClinicalAlert]
    original_model_prediction: Optional[str] = None
    override_applied: bool = False
    final_urgency_level: str
    required_verification: Optional[str] = None
    escalation_status: str  # 'ESCALATED_EMERGENCY', 'ESCALATED_PRIORITY', 'STANDARD', 'DATA_QUALITY_HOLD'
    disclaimer: str = SAFETY_RULES_DISCLAIMER


def to_fahrenheit(temp: Optional[float], unit: str) -> Optional[float]:
    if temp is None:
        return None
    if unit.upper() == "C":
        return round((temp * 9.0 / 5.0) + 32.0, 1)
    return round(temp, 1)


def evaluate_data_quality(
    age: Optional[int],
    gender: Optional[str],
    chief_complaint: Optional[str],
    systolic_bp: Optional[int],
    diastolic_bp: Optional[int],
    pulse_bpm: Optional[int],
    temperature: Optional[float],
    temperature_unit: str = "F",
    spo2: Optional[float] = None,
    notes: Optional[str] = None,
) -> List[DataQualityIssue]:
    """
    Separates data-quality checks from clinical acuity rules.
    Detects missing measurements, malformed/out-of-range values, and contradictory inputs.
    Preserves missing values as genuinely unrecorded without converting to normal.
    Does NOT automatically classify every invalid measurement as a medical emergency.
    """
    issues: List[DataQualityIssue] = []

    # 1. Age quality
    if age is None:
        issues.append(
            DataQualityIssue(
                field="age",
                status=DataQualityStatus.MISSING,
                code="MISSING_AGE",
                message="Patient age is missing.",
                is_blocking=True,
            )
        )
    elif age < 0 or age > 130:
        issues.append(
            DataQualityIssue(
                field="age",
                status=DataQualityStatus.MALFORMED,
                code="OUT_OF_RANGE_AGE",
                message=f"Age ({age}) is outside valid physiological boundary [0, 130].",
                is_blocking=True,
            )
        )

    # 2. Gender quality
    valid_genders = ["Male", "Female", "Other", "Unspecified"]
    if not gender or gender not in valid_genders:
        issues.append(
            DataQualityIssue(
                field="gender",
                status=DataQualityStatus.MALFORMED,
                code="INVALID_GENDER",
                message=f"Gender '{gender}' is not in allowed schema options {valid_genders}.",
                is_blocking=True,
            )
        )

    # 3. Chief Complaint quality
    if not chief_complaint or len(chief_complaint.strip()) < 3:
        issues.append(
            DataQualityIssue(
                field="chief_complaint",
                status=DataQualityStatus.MISSING,
                code="MISSING_COMPLAINT",
                message="Chief complaint in patient's own words is required (min 3 chars).",
                is_blocking=True,
            )
        )

    # 4. Blood Pressure quality
    has_sys = systolic_bp is not None
    has_dia = diastolic_bp is not None

    if not has_sys and not has_dia:
        issues.append(
            DataQualityIssue(
                field="blood_pressure",
                status=DataQualityStatus.MISSING,
                code="MISSING_BP",
                message="Blood pressure was not recorded at intake. Will NOT be assumed normal (120/80 mmHg).",
                is_blocking=False,
            )
        )
    elif has_sys and not has_dia:
        issues.append(
            DataQualityIssue(
                field="diastolic_bp",
                status=DataQualityStatus.MISSING,
                code="INCOMPLETE_BP_DIASTOLIC",
                message="Diastolic BP is missing while systolic BP was recorded.",
                is_blocking=True,
            )
        )
    elif has_dia and not has_sys:
        issues.append(
            DataQualityIssue(
                field="systolic_bp",
                status=DataQualityStatus.MISSING,
                code="INCOMPLETE_BP_SYSTOLIC",
                message="Systolic BP is missing while diastolic BP was recorded.",
                is_blocking=True,
            )
        )
    else:
        # Both provided: Check range and contradiction
        if systolic_bp < 40 or systolic_bp > 300:
            issues.append(
                DataQualityIssue(
                    field="systolic_bp",
                    status=DataQualityStatus.MALFORMED,
                    code="OUT_OF_RANGE_SYSTOLIC",
                    message=f"Systolic BP {systolic_bp} mmHg is outside viable recording range [40, 300].",
                    is_blocking=True,
                )
            )
        if diastolic_bp < 20 or diastolic_bp > 200:
            issues.append(
                DataQualityIssue(
                    field="diastolic_bp",
                    status=DataQualityStatus.MALFORMED,
                    code="OUT_OF_RANGE_DIASTOLIC",
                    message=f"Diastolic BP {diastolic_bp} mmHg is outside viable recording range [20, 200].",
                    is_blocking=True,
                )
            )
        if systolic_bp <= diastolic_bp:
            issues.append(
                DataQualityIssue(
                    field="blood_pressure",
                    status=DataQualityStatus.CONTRADICTORY,
                    code="CONTRADICTORY_BP_VALUES",
                    message=f"Systolic BP ({systolic_bp}) must be strictly greater than Diastolic BP ({diastolic_bp}). Data entry error.",
                    is_blocking=True,
                )
            )

    # 5. Pulse quality
    if pulse_bpm is None:
        issues.append(
            DataQualityIssue(
                field="pulse_bpm",
                status=DataQualityStatus.MISSING,
                code="MISSING_PULSE",
                message="Pulse rate was not recorded at intake. Will NOT be assumed normal (72 bpm).",
                is_blocking=False,
            )
        )
    elif pulse_bpm < 0 or pulse_bpm > 300:
        issues.append(
            DataQualityIssue(
                field="pulse_bpm",
                status=DataQualityStatus.MALFORMED,
                code="OUT_OF_RANGE_PULSE",
                message=f"Pulse {pulse_bpm} bpm is outside physiological range [0, 300].",
                is_blocking=True,
            )
        )
    elif 0 < pulse_bpm < 20:
        issues.append(
            DataQualityIssue(
                field="pulse_bpm",
                status=DataQualityStatus.MALFORMED,
                code="IMPLAUSIBLE_PULSE_RATE",
                message=f"Pulse of {pulse_bpm} bpm is physiologically non-viable without arrest. Enter 0 if pulseless or re-verify manually.",
                is_blocking=True,
            )
        )

    # 6. Temperature quality
    if temperature is None:
        issues.append(
            DataQualityIssue(
                field="temperature",
                status=DataQualityStatus.MISSING,
                code="MISSING_TEMP",
                message="Body temperature was not recorded. Will NOT be assumed normal (98.6°F / 37.0°C).",
                is_blocking=False,
            )
        )
    else:
        temp_f = to_fahrenheit(temperature, temperature_unit)
        if temperature_unit.upper() == "F":
            if temperature < 85.0 or temperature > 115.0:
                issues.append(
                    DataQualityIssue(
                        field="temperature",
                        status=DataQualityStatus.MALFORMED,
                        code="OUT_OF_RANGE_TEMP_F",
                        message=f"Temperature {temperature}°F is outside measurable range [85.0, 115.0].",
                        is_blocking=True,
                    )
                )
        elif temperature_unit.upper() == "C":
            if temperature < 29.4 or temperature > 46.1:
                issues.append(
                    DataQualityIssue(
                        field="temperature",
                        status=DataQualityStatus.MALFORMED,
                        code="OUT_OF_RANGE_TEMP_C",
                        message=f"Temperature {temperature}°C is outside measurable range [29.4, 46.1].",
                        is_blocking=True,
                    )
                )

    # 7. SpO2 quality
    if spo2 is None:
        issues.append(
            DataQualityIssue(
                field="spo2",
                status=DataQualityStatus.MISSING,
                code="MISSING_SPO2",
                message="SpO2 oxygen saturation was not measured. Will NOT be assumed normal (98%).",
                is_blocking=False,
            )
        )
    elif spo2 < 30.0 or spo2 > 100.0:
        issues.append(
            DataQualityIssue(
                field="spo2",
                status=DataQualityStatus.MALFORMED,
                code="OUT_OF_RANGE_SPO2",
                message=f"SpO2 {spo2}% is outside measurable pulse oximetry range [30.0, 100.0].",
                is_blocking=True,
            )
        )

    # 8. Contradictory clinical presentations
    complaint_lower = (chief_complaint or "").lower()
    notes_lower = (notes or "").lower()
    combined_text = f"{complaint_lower} {notes_lower}"

    # Contradiction: Male patient with obstetric complaints
    if gender == "Male":
        obstetric_keywords = [
            "labor", "labour", "active labor", "active labour", "labour pains", "labor pains",
            "pregnancy", "pregnant", "eclampsia", "vaginal bleeding", "uterine contractions",
            "antepartum", "water breaking"
        ]
        if any(kw in combined_text for kw in obstetric_keywords):
            issues.append(
                DataQualityIssue(
                    field="chief_complaint",
                    status=DataQualityStatus.CONTRADICTORY,
                    code="CONTRADICTORY_GENDER_OBSTETRIC",
                    message="Patient gender recorded as Male with obstetric / labor complaint. Verify demographics.",
                    is_blocking=True,
                )
            )

    # Contradiction: Pulse = 0 but patient noted as alert, speaking, or walking
    if pulse_bpm == 0:
        conscious_keywords = [
            "fully alert", "talking normally", "talking", "conversing", "walking",
            "walked", "eating", "asymptomatic", "alert"
        ]
        if any(kw in combined_text for kw in conscious_keywords):
            issues.append(
                DataQualityIssue(
                    field="pulse_bpm",
                    status=DataQualityStatus.CONTRADICTORY,
                    code="CONTRADICTORY_AMBULATORY_PULSELESS",
                    message="Pulse entered as 0 bpm for an alert/conversing/walking patient. Data contradiction; re-measure manual radial pulse.",
                    is_blocking=True,
                )
            )

    return issues


def evaluate_clinical_escalation_rules(
    systolic_bp: Optional[int] = None,
    diastolic_bp: Optional[int] = None,
    pulse_bpm: Optional[int] = None,
    temperature: Optional[float] = None,
    temperature_unit: str = "F",
    spo2: Optional[float] = None,
    red_flags: Optional[Dict[str, bool]] = None,
    age: Optional[int] = None,
    gender: Optional[str] = None,
    chief_complaint: Optional[str] = None,
    known_conditions: Optional[List[str]] = None,
    pain_score: Optional[int] = None,
    mobility: Optional[str] = None,
) -> List[ClinicalAlert]:
    """
    Evaluates configurable, versioned clinical safety escalation rules derived from
    the OPD clinical domain primer (docs/TRIAGE_CRITERIA.md).
    Critical rules flag life-threats for immediate override of machine-learning models.
    """
    alerts: List[ClinicalAlert] = []
    red_flags = red_flags or {}


    # CRIT-RULE-PULSE-0: Pulse entered as zero
    if pulse_bpm == 0:
        alerts.append(
            ClinicalAlert(
                rule_id="CRIT-RULE-PULSE-0",
                rule_name="Pulselessness / Cardiac Arrest Suspected",
                acuity_level=RuleAcuity.EMERGENCY,
                message="🚨 CRITICAL ALERT: Pulse recorded as 0 bpm.",
                clinical_explanation="Absence of measurable pulse indicates circulatory arrest or non-perfusion until proven otherwise.",
                required_human_verification="Immediately palpate carotid pulse. If pulseless, activate Code Blue / CPR protocol without delay. If patient is alert, check pulse oximeter probe and take manual radial pulse.",
                is_critical_override=True,
            )
        )

    # CRIT-RULE-HYPOXIA: SpO2 < 90%
    if spo2 is not None and spo2 < 90.0:
        alerts.append(
            ClinicalAlert(
                rule_id="CRIT-RULE-HYPOXIA",
                rule_name="Critical Hypoxemia (SpO2 < 90%)",
                acuity_level=RuleAcuity.EMERGENCY,
                message=f"🚨 CRITICAL HYPOXIA: SpO2 is {spo2}% (< 90%).",
                clinical_explanation="Severe oxygen desaturation poses immediate risk of hypoxic cardiac arrest or encephalopathy.",
                required_human_verification="Administer high-flow supplemental oxygen immediately; transfer to Resuscitation Bay.",
                is_critical_override=True,
            )
        )
    elif spo2 is not None and 90.0 <= spo2 <= 94.0:
        alerts.append(
            ClinicalAlert(
                rule_id="WARN-RULE-BORDERLINE-SPO2",
                rule_name="Borderline Hypoxemia (SpO2 90-94%)",
                acuity_level=RuleAcuity.PRIORITY,
                message=f"⚠️ BORDERLINE SPO2: Oxygen saturation is {spo2}%.",
                clinical_explanation="Mild to moderate respiratory compromise requiring accelerated medical evaluation.",
                required_human_verification="Position upright, monitor SpO2 continuously, expedite Pulmonology/Medicine consult.",
                is_critical_override=False,
            )
        )

    # CRIT-RULE-SHOCK-BP: Systolic BP < 90 mmHg
    if systolic_bp is not None and systolic_bp < 90:
        alerts.append(
            ClinicalAlert(
                rule_id="CRIT-RULE-SHOCK-BP",
                rule_name="Hemodynamic Shock Boundary (Systolic BP < 90 mmHg)",
                acuity_level=RuleAcuity.EMERGENCY,
                message=f"🚨 HYPOTENSIVE SHOCK: Systolic BP is {systolic_bp} mmHg.",
                clinical_explanation="Inadequate end-organ perfusion indicating hypovolemic, septic, or cardiogenic shock.",
                required_human_verification="Assess perfusion (capillary refill, conscious state), establish IV access, and begin volume assessment.",
                is_critical_override=True,
            )
        )
    elif (systolic_bp is not None and systolic_bp >= 200) or (diastolic_bp is not None and diastolic_bp >= 120):
        bp_detail = f"Systolic BP is {systolic_bp} mmHg" if (systolic_bp is not None and systolic_bp >= 200) else f"Diastolic BP is {diastolic_bp} mmHg"
        alerts.append(
            ClinicalAlert(
                rule_id="CRIT-RULE-HYPERTENSIVE-CRISIS",
                rule_name="Hypertensive Crisis Boundary (Systolic BP >= 200 or Diastolic BP >= 120 mmHg)",
                acuity_level=RuleAcuity.EMERGENCY,
                message=f"🚨 SEVERE HYPERTENSION: {bp_detail}.",
                clinical_explanation="Acute vascular pressure elevation with imminent target organ damage risk (stroke, aortic dissection).",
                required_human_verification="Check for focal neurological signs, chest pain, and funduscopic changes.",
                is_critical_override=True,
            )
        )

    # CRIT-RULE-TEMP-96-HYPOTHERMIA: Temperature 96°F clinical verification
    temp_f = to_fahrenheit(temperature, temperature_unit)
    if temp_f is not None and abs(temp_f - 96.0) <= 0.3:
        alerts.append(
            ClinicalAlert(
                rule_id="CRIT-RULE-TEMP-96-HYPOTHERMIA",
                rule_name="Hypothermia Clinical Verification Flag (Temp ~96.0°F)",
                acuity_level=RuleAcuity.PRIORITY,
                message=f"⚠️ CLINICAL VERIFICATION: Temperature recorded as {temperature}°{temperature_unit} ({temp_f}°F).",
                clinical_explanation="Reading reflects core temperature ~96°F (35.6°C). In elderly, pediatric, or septic patients, hypothermia is a grave indicator; DO NOT automatically discard as a typographical mistake.",
                required_human_verification="Re-take temperature using calibrated core/axillary thermometer. Inspect patient for cold exposure, endocrine failure, or occult sepsis.",
                is_critical_override=False,
            )
        )
    elif temp_f is not None and temp_f >= 104.0:
        alerts.append(
            ClinicalAlert(
                rule_id="CRIT-RULE-HIGH-HYPERPYREXIA",
                rule_name="Severe Hyperpyrexia (Temp >= 104.0°F)",
                acuity_level=RuleAcuity.EMERGENCY,
                message=f"🚨 SEVERE HYPERPYREXIA: Temperature is {temp_f}°F.",
                clinical_explanation="Dangerously elevated body temperature risking febrile convulsions, delirium, or heat injury.",
                required_human_verification="Initiate active physical cooling and evaluate for acute intracranial or systemic sepsis.",
                is_critical_override=True,
            )
        )

    # Tachycardia / Bradycardia
    if pulse_bpm is not None and pulse_bpm > 130:
        alerts.append(
            ClinicalAlert(
                rule_id="CRIT-RULE-SEVERE-TACHYCARDIA",
                rule_name="Severe Tachycardia (Pulse > 130 bpm)",
                acuity_level=RuleAcuity.EMERGENCY,
                message=f"🚨 TACHYCARDIA: Heart rate is {pulse_bpm} bpm.",
                clinical_explanation="Compromised diastolic filling time risking hemodynamic instability or supraventricular tachyarrhythmia.",
                required_human_verification="Obtain immediate 12-lead ECG and evaluate for volume depletion, sepsis, or arrhythmia.",
                is_critical_override=True,
            )
        )
    elif pulse_bpm is not None and (101 <= pulse_bpm <= 130):
        alerts.append(
            ClinicalAlert(
                rule_id="WARN-RULE-TACHYCARDIA",
                rule_name="Urgent Tachycardia (Pulse 101-130 bpm)",
                acuity_level=RuleAcuity.PRIORITY,
                message=f"⚠️ ELEVATED PULSE: Heart rate is {pulse_bpm} bpm.",
                clinical_explanation="Abnormal compensatory tachycardia.",
                required_human_verification="Evaluate for pain, fever, dehydration, or anxiety.",
                is_critical_override=False,
            )
        )
    elif pulse_bpm is not None and (0 < pulse_bpm < 50):
        alerts.append(
            ClinicalAlert(
                rule_id="WARN-RULE-BRADYCARDIA",
                rule_name="Severe Bradycardia (Pulse < 50 bpm)",
                acuity_level=RuleAcuity.PRIORITY,
                message=f"⚠️ BRADYCARDIA: Heart rate is {pulse_bpm} bpm.",
                clinical_explanation="Risk of heart block, nodal rhythm, or syncope.",
                required_human_verification="Verify pulse manually and obtain urgent ECG.",
                is_critical_override=False,
            )
        )

    # Red flag escalations
    # Red flag escalations
    red_flag_keys = [
        "severe_respiratory_distress",
        "crushing_chest_pain",
        "acute_neurological_deficit",
        "massive_bleeding_or_shock",
        "severe_trauma",
        "active_labor_or_eclampsia",
        "high_fever_with_stiff_neck",
        "severe_dehydration_lethargy",
    ]
    triggered_flags = [k for k in red_flag_keys if red_flags.get(k)]
    if triggered_flags:
        alerts.append(
            ClinicalAlert(
                rule_id="CRIT-RULE-RED-FLAGS",
                rule_name="Red Flag Emergency Sign",
                acuity_level=RuleAcuity.EMERGENCY,
                message=f"🚨 RED FLAG IDENTIFIED: {', '.join(triggered_flags)}",
                clinical_explanation="Organ failure or acute surgical/medical emergency requires immediate resuscitation override.",
                required_human_verification="Transfer patient immediately to resuscitation/casualty team.",
                is_critical_override=True,
            )
        )

    # Multilingual Chief Complaint Symptom Extraction & Red Flag Detection
    if chief_complaint and chief_complaint.strip():
        complaint_res = process_complaint(chief_complaint)
        for rf_concept in complaint_res.red_flag_triggers:
            if rf_concept == CONCEPT_CHEST_PAIN and not red_flags.get("crushing_chest_pain"):
                alerts.append(
                    ClinicalAlert(
                        rule_id="CRIT-RULE-NLP-CHEST-PAIN",
                        rule_name="Acute Cardiac / Chest Pain Symptom",
                        acuity_level=RuleAcuity.EMERGENCY,
                        message="🚨 CRITICAL ALERT: Acute cardiac / chest pain detected in presenting complaint.",
                        clinical_explanation="High risk of acute coronary syndrome or myocardial ischemia requiring immediate ECG and resuscitation readiness.",
                        required_human_verification="Immediately perform STAT 12-lead ECG, assess vitals, and alert emergency medical officer.",
                        is_critical_override=True,
                    )
                )
            elif rf_concept == CONCEPT_RESPIRATORY_DISTRESS and not red_flags.get("severe_respiratory_distress"):
                alerts.append(
                    ClinicalAlert(
                        rule_id="CRIT-RULE-NLP-RESPIRATORY",
                        rule_name="Acute Respiratory Distress Symptom",
                        acuity_level=RuleAcuity.EMERGENCY,
                        message="🚨 CRITICAL ALERT: Severe respiratory compromise or breathlessness detected in presenting complaint.",
                        clinical_explanation="Potential respiratory failure or acute airway/parenchymal compromise.",
                        required_human_verification="Administer high-flow O2, check pulse oximetry, and position patient upright.",
                        is_critical_override=True,
                    )
                )
            elif rf_concept == CONCEPT_SEVERE_BLEEDING and not red_flags.get("massive_bleeding_or_shock"):
                alerts.append(
                    ClinicalAlert(
                        rule_id="CRIT-RULE-NLP-BLEEDING",
                        rule_name="Active Hemorrhage / Bleeding Symptom",
                        acuity_level=RuleAcuity.EMERGENCY,
                        message="🚨 CRITICAL ALERT: Active hemorrhage or severe bleeding detected in presenting complaint.",
                        clinical_explanation="Risk of hypovolemic shock or rapid hemodynamic collapse.",
                        required_human_verification="Apply direct pressure, establish wide-bore IV access, and notify surgical team.",
                        is_critical_override=True,
                    )
                )
            elif rf_concept == CONCEPT_ALTERED_SENSORIUM and not red_flags.get("acute_neurological_deficit"):
                alerts.append(
                    ClinicalAlert(
                        rule_id="CRIT-RULE-NLP-ALTERED-SENSORIUM",
                        rule_name="Altered Sensorium / Unconsciousness",
                        acuity_level=RuleAcuity.EMERGENCY,
                        message="🚨 CRITICAL ALERT: Loss of consciousness or altered sensorium detected in presenting complaint.",
                        clinical_explanation="Potential acute intracranial event, severe hypoglycemia, or cerebral hypoperfusion.",
                        required_human_verification="Assess GCS/AVPU, perform rapid bedside capillary blood glucose, secure airway.",
                        is_critical_override=True,
                    )
                )
            elif rf_concept == CONCEPT_SEIZURE:
                alerts.append(
                    ClinicalAlert(
                        rule_id="CRIT-RULE-NLP-SEIZURE",
                        rule_name="Acute Seizure / Convulsions",
                        acuity_level=RuleAcuity.EMERGENCY,
                        message="🚨 CRITICAL ALERT: Convulsions or active seizure symptoms detected in presenting complaint.",
                        clinical_explanation="Risk of status epilepticus, post-ictal hypoxia, or acute neurological insult.",
                        required_human_verification="Position in lateral recovery position, suction airway if indicated, prepare IV lorazepam.",
                        is_critical_override=True,
                    )
                )

        if complaint_res.requires_nurse_review and complaint_res.review_reason:
            alerts.append(
                ClinicalAlert(
                    rule_id="WARN-RULE-COMPLAINT-REVIEW",
                    rule_name="Complaint Language / Ambiguity Review",
                    acuity_level=RuleAcuity.PRIORITY,
                    message=f"⚠️ CLINICAL VERIFICATION: {complaint_res.review_reason}",
                    clinical_explanation="Presenting complaint requires nurse clarification or dialect translation verification.",
                    required_human_verification="Conduct nurse bedside interview to clarify exact onset, duration, and severity.",
                    is_critical_override=False,
                )
            )

    return alerts


def apply_safety_override(
    data_quality_issues: List[DataQualityIssue],
    clinical_alerts: List[ClinicalAlert],
    model_prediction: Optional[str] = None,
) -> SafetyEvaluationResult:
    """
    Combines data quality issues and clinical escalation rules.
    If blocking data-quality issues exist, holds for re-entry.
    Ensures validated critical rules override any lower-urgency ML prediction.
    """
    has_blocking_data_error = any(issue.is_blocking for issue in data_quality_issues)

    if has_blocking_data_error:
        blocking_msgs = [i.message for i in data_quality_issues if i.is_blocking]
        return SafetyEvaluationResult(
            rule_version=SAFETY_RULE_VERSION,
            is_data_acceptable=False,
            data_quality_issues=data_quality_issues,
            triggered_rule_ids=[i.code for i in data_quality_issues],
            clinical_alerts=clinical_alerts,
            original_model_prediction=model_prediction,
            override_applied=False,
            final_urgency_level="Cannot assess — send to nurse now.",
            required_verification=f"Cannot assess — send to nurse now. Data Quality Error: {'; '.join(blocking_msgs)}. Please verify and correct inputs.",
            escalation_status="Cannot assess — send to nurse now.",
        )

    # Check for critical rules that override lower ML predictions
    critical_rules = [a for a in clinical_alerts if a.is_critical_override]
    priority_rules = [a for a in clinical_alerts if a.acuity_level == RuleAcuity.PRIORITY]

    triggered_ids = [a.rule_id for a in clinical_alerts]
    override_applied = False
    final_acuity = model_prediction or "ROUTINE"

    if critical_rules:
        # Override to EMERGENCY if not already EMERGENCY
        if final_acuity != "EMERGENCY":
            override_applied = True
        final_acuity = "EMERGENCY"
        escalation_status = "ESCALATED_EMERGENCY"
        verification = "; ".join(a.required_human_verification for a in critical_rules)
    elif priority_rules:
        if final_acuity == "ROUTINE":
            override_applied = True
            final_acuity = "PRIORITY"
        escalation_status = "ESCALATED_PRIORITY"
        verification = "; ".join(a.required_human_verification for a in priority_rules)
    else:
        escalation_status = "STANDARD"
        verification = None

    return SafetyEvaluationResult(
        rule_version=SAFETY_RULE_VERSION,
        is_data_acceptable=True,
        data_quality_issues=data_quality_issues,
        triggered_rule_ids=triggered_ids,
        clinical_alerts=clinical_alerts,
        original_model_prediction=model_prediction,
        override_applied=override_applied,
        final_urgency_level=final_acuity,
        required_verification=verification,
        escalation_status=escalation_status,
    )


# ============================================================================
# Clinically Reviewed Prototype Deterioration Warning Rules
# ============================================================================

DETERIORATION_RULES_VERSION = "2026.1-prototype-clinical-rules"


def evaluate_deterioration_warnings(
    observations_by_type: Dict[str, List[Any]],
    is_rules_configured: bool = True,
) -> List[Dict[str, Any]]:
    """
    Evaluates recorded physiological observations against configured prototype
    warning thresholds adapted from ESI and NEWS2 public clinical guidelines.
    
    If is_rules_configured is False, returns empty list without arbitrary scoring,
    and the UI marks warning evaluation as not configured.
    """
    if not is_rules_configured:
        return []

    warnings: List[Dict[str, Any]] = []

    # 1. SpO2 Rules
    spo2_obs = observations_by_type.get("SPO2", [])
    if spo2_obs:
        latest = spo2_obs[0]
        val = latest.value
        if val < 92.0:
            warnings.append({
                "warning_id": "CRIT-WARN-SPO2-HYPOXIA",
                "severity": "CRITICAL",
                "trigger_reason": f"Critical SpO2 hypoxemia ({val}% < 92%) - immediate oxygenation and bedside airway assessment required.",
                "supporting_observation": f"SpO2: {val}% measured at {latest.measured_at.strftime('%H:%M:%S') if hasattr(latest.measured_at, 'strftime') else latest.measured_at}",
            })
        if len(spo2_obs) >= 2:
            prev = spo2_obs[1].value
            drop = prev - val
            if drop >= 4.0:
                warnings.append({
                    "warning_id": "CRIT-WARN-SPO2-DESAT",
                    "severity": "CRITICAL",
                    "trigger_reason": f"Acute desaturation event: SpO2 dropped from {prev}% to {val}% (Δ -{drop:.1f}%).",
                    "supporting_observation": f"SpO2 trend: {prev}% -> {val}%",
                })

    # 2. Systolic Blood Pressure Rules
    sbp_obs = observations_by_type.get("SYSTOLIC_BP", [])
    if sbp_obs:
        latest = sbp_obs[0]
        val = latest.value
        sec = latest.secondary_value
        if val < 90.0:
            warnings.append({
                "warning_id": "CRIT-WARN-BP-HYPOTENSION",
                "severity": "CRITICAL",
                "trigger_reason": f"Severe hypotension (Systolic BP {int(val)} mmHg < 90 mmHg) indicating potential shock or hemodynamic collapse.",
                "supporting_observation": f"Systolic BP: {int(val)} mmHg",
            })
        elif val >= 180.0 or (sec is not None and sec >= 110.0):
            bp_str = f"{int(val)}/{int(sec)} mmHg" if sec is not None else f"{int(val)} mmHg"
            warnings.append({
                "warning_id": "URG-WARN-BP-HYPERTENSIVE",
                "severity": "URGENT",
                "trigger_reason": f"Severe hypertensive range ({bp_str}) - prompt evaluation for acute target organ damage.",
                "supporting_observation": f"Blood Pressure: {bp_str}",
            })
        if len(sbp_obs) >= 2:
            prev = sbp_obs[1].value
            drop = prev - val
            if drop >= 25.0:
                warnings.append({
                    "warning_id": "CRIT-WARN-BP-RAPID-DROP",
                    "severity": "CRITICAL",
                    "trigger_reason": f"Acute blood pressure decline: Systolic BP fell from {int(prev)} to {int(val)} mmHg (Δ -{int(drop)} mmHg).",
                    "supporting_observation": f"Systolic BP trend: {int(prev)} -> {int(val)} mmHg",
                })

    # 3. Heart Rate / Pulse Rules
    pulse_obs = observations_by_type.get("PULSE", [])
    if pulse_obs:
        latest = pulse_obs[0]
        val = latest.value
        if val > 120.0:
            warnings.append({
                "warning_id": "URG-WARN-HR-TACHYCARDIA",
                "severity": "URGENT",
                "trigger_reason": f"Severe tachycardia (Pulse {int(val)} bpm > 120 bpm) - evaluate for arrhythmia, sepsis, pain, or volume depletion.",
                "supporting_observation": f"Pulse: {int(val)} bpm",
            })
        elif val < 50.0:
            warnings.append({
                "warning_id": "URG-WARN-HR-BRADYCARDIA",
                "severity": "URGENT",
                "trigger_reason": f"Severe bradycardia (Pulse {int(val)} bpm < 50 bpm) - monitor for perfusion deficit and heart block.",
                "supporting_observation": f"Pulse: {int(val)} bpm",
            })

    # 4. Respiratory Rate Rules
    rr_obs = observations_by_type.get("RESPIRATORY_RATE", [])
    if rr_obs:
        latest = rr_obs[0]
        val = latest.value
        if val > 26.0:
            warnings.append({
                "warning_id": "URG-WARN-RR-TACHYPNEA",
                "severity": "URGENT",
                "trigger_reason": f"Severe tachypnea (Respiratory Rate {int(val)}/min > 26/min) indicating increased work of breathing and metabolic distress.",
                "supporting_observation": f"Respiratory Rate: {int(val)}/min",
            })
        elif val < 9.0:
            warnings.append({
                "warning_id": "CRIT-WARN-RR-BRADYPNEA",
                "severity": "CRITICAL",
                "trigger_reason": f"Critical bradypnea (Respiratory Rate {int(val)}/min < 9/min) - high risk of respiratory exhaustion or central depression.",
                "supporting_observation": f"Respiratory Rate: {int(val)}/min",
            })

    # 5. Temperature Rules
    temp_obs = observations_by_type.get("TEMPERATURE", [])
    if temp_obs:
        latest = temp_obs[0]
        val = latest.value
        if val >= 103.5:
            warnings.append({
                "warning_id": "WARN-TEMP-HYPERPYREXIA",
                "severity": "WARNING",
                "trigger_reason": f"Hyperpyrexia (Temperature {val:.1f}°F >= 103.5°F) - antipyretic protocol and sepsis screen advised.",
                "supporting_observation": f"Temperature: {val:.1f}°F",
            })

    return warnings

