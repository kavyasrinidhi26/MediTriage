from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, model_validator
from datetime import datetime


class TriageCategory(str, Enum):
    EMERGENCY = "EMERGENCY"  # Red / Immediate life-threat
    PRIORITY = "PRIORITY"    # Yellow / Urgent, high risk
    ROUTINE = "ROUTINE"      # Green / Non-urgent, standard OPD queue


class AVPUScale(str, Enum):
    ALERT = "ALERT"                    # Fully alert
    VERBAL = "VERBAL"                  # Responds to voice
    PAIN = "PAIN"                      # Responds to pain only
    UNRESPONSIVE = "UNRESPONSIVE"      # Unresponsive


class SpecialtyDepartment(str, Enum):
    CASUALTY_EMERGENCY = "Casualty / Emergency"
    GENERAL_MEDICINE = "General Medicine"
    CARDIOLOGY = "Cardiology"
    PULMONOLOGY = "Pulmonology"
    PEDIATRICS = "Pediatrics"
    ORTHOPEDICS = "Orthopedics"
    OBGYN = "Obstetrics & Gynecology"
    GENERAL_SURGERY = "General Surgery"
    ENT = "ENT (Ear, Nose, Throat)"
    OPHTHALMOLOGY = "Ophthalmology"
    DERMATOLOGY = "Dermatology"
    PSYCHIATRY = "Psychiatry"


class QueueStatus(str, Enum):
    WAITING = "WAITING"
    WITH_DOCTOR = "WITH_DOCTOR"
    NEEDS_HUMAN_REVIEW = "NEEDS_HUMAN_REVIEW"
    COMPLETED = "COMPLETED"
    TRANSFERRED_EMERGENCY = "TRANSFERRED_EMERGENCY"


class VitalSigns(BaseModel):
    heart_rate: Optional[int] = Field(None, ge=20, le=300, description="Heart rate in beats per minute (bpm)")
    systolic_bp: Optional[int] = Field(None, ge=40, le=300, description="Systolic blood pressure in mmHg")
    diastolic_bp: Optional[int] = Field(None, ge=20, le=200, description="Diastolic blood pressure in mmHg")
    respiratory_rate: Optional[int] = Field(None, ge=4, le=80, description="Respiratory rate in breaths per minute")
    spo2: Optional[float] = Field(None, ge=40.0, le=100.0, description="Oxygen saturation SpO2 percentage (%)")
    temperature_f: Optional[float] = Field(None, ge=85.0, le=115.0, description="Body temperature in Fahrenheit (°F)")
    avpu: AVPUScale = Field(default=AVPUScale.ALERT, description="Consciousness level on AVPU scale")


class RedFlagChecklist(BaseModel):
    severe_respiratory_distress: bool = Field(False, description="Severe struggle to breathe, cyanosis, stridor")
    crushing_chest_pain: bool = Field(False, description="Radiating chest pain, diaphoresis, acute cardiac symptoms")
    acute_neurological_deficit: bool = Field(False, description="Sudden facial drooping, arm weakness, speech slurring, acute seizure")
    massive_bleeding_or_shock: bool = Field(False, description="Uncontrolled bleeding, cold clammy extremities, circulatory collapse")
    severe_trauma: bool = Field(False, description="Major road traffic accident, penetrating injury, head injury with LOC")
    active_labor_or_eclampsia: bool = Field(False, description="Imminent delivery, vaginal hemorrhage, seizures in pregnancy")
    high_fever_with_stiff_neck: bool = Field(False, description="Meningismus signs, altered sensorium with fever")
    severe_dehydration_lethargy: bool = Field(False, description="Sunken eyes, skin pinch > 2s, unable to drink fluids (pediatric alert)")


class PatientTriageRequest(BaseModel):
    patient_name: str = Field(..., min_length=1, max_length=120, description="Patient full name")
    age: int = Field(..., ge=0, le=130, description="Age in years (0 for infant)")
    gender: str = Field(..., pattern="^(Male|Female|Other|Unspecified)$", description="Patient gender")
    contact_phone: Optional[str] = Field(None, max_length=20, description="Contact phone or guardian contact")
    opd_registration_number: Optional[str] = Field(None, max_length=50, description="OPD token or UHID number")
    chief_complaint: str = Field(..., min_length=2, max_length=500, description="Primary presenting symptoms")
    symptom_duration_days: Optional[int] = Field(0, ge=0, le=3650, description="Duration of symptoms in days")
    vitals: VitalSigns
    red_flags: RedFlagChecklist = Field(default_factory=RedFlagChecklist)
    clinical_notes: Optional[str] = Field(None, max_length=1000, description="Additional intake nurse notes")


class TriageAssessmentResult(BaseModel):
    triage_category: TriageCategory
    urgency_level: str
    triage_level: Optional[int] = Field(None, ge=1, le=5, description="5-level clinical triage acuity (1=Resuscitation, 2=Emergent, 3=Urgent, 4=Less Urgent, 5=Non-Urgent)")
    triage_level_name: Optional[str] = Field(None, description="5-level triage acuity name")
    urgency_score: int = Field(..., ge=1, le=10, description="Urgency priority score (10 = highest immediate threat, 1 = routine)")
    recommended_department: SpecialtyDepartment
    department_reason: Optional[str] = Field(None, description="Clinical rationale for recommended department")
    requires_department_review: bool = Field(False, description="Flag indicating multiple plausible departments or vague routing requiring nurse review")
    red_flags_identified: List[str]
    vital_abnormalities: List[str]
    observed_facts: List[str] = Field(default_factory=list, description="Verified objective intake observations")
    inferred_risks: List[str] = Field(default_factory=list, description="Inferred physiological risk factors")
    clinical_rationale: List[str]
    recommended_action: str
    max_recommended_wait_minutes: int
    assessment_timestamp: datetime
    disclaimer: str = (
        "PROTOTYPE DECISION-SUPPORT NOTICE: This automated assessment provides rule-based clinical "
        "triage prioritization assistance for hospital intake queues. It does not constitute a "
        "medical diagnosis or replace clinical evaluation by licensed medical professionals."
    )


class PatientQueueItem(BaseModel):
    id: str
    token_number: str
    patient_name: str
    age: int
    gender: str
    opd_registration_number: Optional[str]
    chief_complaint: str
    symptom_duration_days: int
    vitals: VitalSigns
    red_flags: RedFlagChecklist
    clinical_notes: Optional[str]
    assessment: TriageAssessmentResult
    status: QueueStatus = QueueStatus.WAITING
    is_synthetic: bool = False
    created_at: datetime
    updated_at: datetime


class QueueStatusUpdate(BaseModel):
    status: QueueStatus
    doctor_room: Optional[str] = None
    notes: Optional[str] = None


class QueueSummaryStats(BaseModel):
    total_patients: int
    waiting_count: int
    with_doctor_count: int
    needs_human_review_count: int = 0
    completed_count: int
    emergency_count: int
    priority_count: int
    routine_count: int
    departments_breakdown: Dict[str, int]
    patients_today: int = 0
    total_registered_patients: int = 0
    currently_waiting: int = 0
    hospital_timezone: str = "Asia/Kolkata"
    active_emergency_cases: int = 0
    today_emergency_cases: int = 0
    total_recorded_emergency_cases: int = 0
    emergency_cases: int = 0
    priority_cases: int = 0
    routine_cases: int = 0


class HealthResponse(BaseModel):
    status: str
    service: str
    environment: str
    version: str
    timestamp: datetime
    hospital: str


class PatientIntakeCreate(BaseModel):
    patient_id: Optional[str] = Field(None, max_length=64, description="Optional client-supplied ID; generated on backend if omitted")
    patient_name: Optional[str] = Field(None, max_length=120, description="Patient full name")
    age: int = Field(..., ge=0, le=130, description="Age in years (0 for infant)")
    gender: str = Field(..., pattern="^(Male|Female|Other|Unspecified)$", description="Gender")
    arrival_time: str = Field(..., min_length=1, max_length=32, description="Arrival time")
    chief_complaint: str = Field(..., min_length=3, max_length=1000, description="Chief presenting complaint in patient's own words")
    complaint_language: str = Field(default="English", max_length=32, description="Language of presenting complaint")
    known_conditions: List[str] = Field(default_factory=list, description="Pre-existing medical conditions")
    medications: Optional[str] = Field(default="", max_length=500, description="Current medication list")
    systolic_bp: Optional[int] = Field(None, ge=40, le=300, description="Systolic blood pressure in mmHg")
    diastolic_bp: Optional[int] = Field(None, ge=20, le=200, description="Diastolic blood pressure in mmHg")
    pulse_bpm: Optional[int] = Field(None, ge=0, le=300, description="Pulse in bpm (0 is valid clinical finding)")
    temperature: Optional[float] = Field(None, description="Body temperature")
    temperature_unit: str = Field(default="F", pattern="^(F|C)$", description="Temperature unit (F or C)")
    spo2: Optional[float] = Field(None, ge=30.0, le=100.0, description="Oxygen saturation SpO2 %")
    notes: Optional[str] = Field(None, max_length=1000, description="Additional intake notes")

    @model_validator(mode="after")
    def validate_clinical_data_integrity(self):
        if self.systolic_bp is not None and self.diastolic_bp is not None:
            if self.systolic_bp <= self.diastolic_bp:
                raise ValueError("Systolic BP must be strictly greater than Diastolic BP.")

        if self.temperature is not None:
            if self.temperature_unit == "F" and not (85.0 <= self.temperature <= 115.0):
                raise ValueError("Temperature in °F must be between 85.0°F and 115.0°F.")
            elif self.temperature_unit == "C" and not (29.4 <= self.temperature <= 46.1):
                raise ValueError("Temperature in °C must be between 29.4°C and 46.1°C.")

        if self.pulse_bpm is not None and 0 < self.pulse_bpm < 20:
            raise ValueError("Pulse between 1 and 19 bpm is physiologically non-viable without arrest. Enter 0 if pulseless.")

        return self


class PatientIntakeResponse(BaseModel):
    id: str
    patient_id: str
    token_number: str
    patient_name: Optional[str] = None
    age: int
    gender: str
    arrival_time: str
    chief_complaint: str
    complaint_language: str
    known_conditions: List[str]
    medications: str
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    pulse_bpm: Optional[int] = None
    temperature: Optional[float] = None
    temperature_unit: str
    spo2: Optional[float] = None
    notes: Optional[str] = None
    status: str
    is_synthetic: bool = False
    created_at: datetime
    updated_at: datetime
    safety_evaluation: Optional[Dict[str, Any]] = None


class PatientListResponse(BaseModel):
    patients: List[PatientIntakeResponse]
    total: int
    limit: int
    offset: int


class AssessmentRequest(BaseModel):
    patient_id: Optional[str] = Field(None, description="Optional registered patient ID. If provided, pulls saved intake data from database.")
    patient_name: Optional[str] = Field(None, max_length=120)
    age: Optional[int] = Field(None, ge=0, le=130)
    gender: Optional[str] = Field(None, pattern="^(Male|Female|Other|Unspecified)$")
    chief_complaint: Optional[str] = Field(None, max_length=1000)
    complaint_language: str = Field(default="English", max_length=32)
    known_conditions: List[str] = Field(default_factory=list)
    medications: Optional[Any] = Field(default_factory=list)
    systolic_bp: Optional[int] = Field(None, le=300)
    diastolic_bp: Optional[int] = Field(None, le=200)
    pulse_bpm: Optional[int] = Field(None, ge=0, le=300)
    temperature: Optional[float] = None
    temperature_unit: str = Field(default="F", pattern="^(F|C)$")
    spo2: Optional[float] = Field(None, le=100.0)
    respiratory_rate: Optional[int] = Field(None, le=80)
    notes: Optional[str] = None


class AssessmentResponse(BaseModel):
    triage_level: int = Field(..., ge=1, le=5, description="Triage urgency level (1-5)")
    triage_level_name: str
    recommended_department: str
    department_reason: Optional[str] = None
    requires_department_review: bool = False
    detected_red_flags: List[str]
    model_explanation: str
    triggered_safety_rule_ids: List[str]
    safety_rule_explanations: List[str]
    missing_data_warnings: List[str]
    invalid_data_warnings: List[str]
    observed_facts: List[str] = Field(default_factory=list)
    inferred_risks: List[str] = Field(default_factory=list)
    human_review_required: bool
    abstention_status: str
    model_version: str
    rules_version: str
    model_emergency_flag: bool = False
    clinical_disclaimer: str


class QueueReviewRequest(BaseModel):
    reviewed_by: str = Field(default="Staff Nurse", min_length=1, max_length=120)
    review_notes: Optional[str] = Field(None, max_length=1000)


class DeteriorationReportRequest(BaseModel):
    flagged_by: str = Field(default="Staff Nurse", min_length=1, max_length=120)
    reason: str = Field(..., min_length=3, max_length=500, description="Observed acute clinical deterioration signs")
    notes: Optional[str] = Field(None, max_length=1000)


class ReassessmentRequest(BaseModel):
    requested_by: str = Field(default="Staff Nurse", min_length=1, max_length=120)
    updated_pulse: Optional[int] = Field(None, ge=0, le=300)
    updated_spo2: Optional[float] = Field(None, ge=30.0, le=100.0)
    updated_systolic_bp: Optional[int] = Field(None, ge=40, le=300)
    updated_diastolic_bp: Optional[int] = Field(None, ge=20, le=200)
    updated_temperature: Optional[float] = None
    notes: Optional[str] = Field(None, max_length=1000)


class QueueAuditItemResponse(BaseModel):
    id: int
    patient_id: str
    previous_status: Optional[str] = None
    new_status: str
    action_type: str
    performed_by: str
    notes: Optional[str] = None
    created_at: datetime


class SavedPatientQueueItem(BaseModel):
    id: str
    patient_id: str
    token_number: str
    patient_name: Optional[str] = None
    age: int
    gender: str
    arrival_time: str
    chief_complaint: str
    complaint_language: str
    known_conditions: List[str]
    medications: Optional[str] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    pulse_bpm: Optional[int] = None
    temperature: Optional[float] = None
    temperature_unit: str = "F"
    spo2: Optional[float] = None
    triage_level: Optional[int] = None
    triage_level_name: Optional[str] = None
    recommended_department: Optional[str] = None
    urgency_score: int = 3
    warning_signs: List[str] = Field(default_factory=list)
    assessment_status: str = "PENDING_ASSESSMENT"
    review_status: str = "UNREVIEWED"
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    deterioration_flag: bool = False
    deterioration_reason: Optional[str] = None
    last_reassessed_at: Optional[datetime] = None
    status: str = "WAITING"
    waiting_minutes: int = 0
    is_critical_escalation: bool = False
    is_synthetic: bool = False
    created_at: datetime
    updated_at: datetime
    disclaimer: str = (
        "PROTOTYPE OPD QUEUE NOTICE: Priority ranking is based on clinical rules, "
        "vital abnormalities and ML decision support. Not clinically certified. "
        "All patient decisions require licensed clinical review."
    )


class SimulationRequest(BaseModel):
    num_doctors: int = Field(default=3, ge=1, le=20)
    n_patients: int = Field(default=50, ge=0, le=200)
    num_patients: Optional[int] = Field(default=None, ge=0, le=200)
    random_seed: int = Field(default=42, ge=0)
    service_time_emergency: int = Field(default=20, ge=1, le=120)
    service_time_priority: int = Field(default=15, ge=1, le=120)
    service_time_routine: int = Field(default=10, ge=1, le=120)
    starvation_reassessment_threshold: int = Field(default=90, ge=10, le=360)
    emergency_proportion: Optional[float] = Field(default=0.15, ge=0.0, le=1.0)
    scenario_duration_minutes: Optional[int] = Field(default=240, ge=30, le=720)
    avg_service_duration: Optional[int] = Field(default=None, ge=1, le=120)
    custom_arrivals: Optional[List[Dict[str, Any]]] = None
    dataset_source: Optional[str] = Field(default="synthetic", description="'synthetic' | 'database' | 'custom' | 'official'")
    doctor_break_minutes: Optional[int] = Field(default=0, ge=0, le=120)
    doctor_break_interval_minutes: Optional[int] = Field(default=240, ge=30, le=480)


class ArrivalLogStatusResponse(BaseModel):
    official_log_available: bool
    official_log_filename: Optional[str] = None
    limitation_statement: str
    database_records_count: int
    synthetic_demo_available: bool = True


class RunEvaluationRequest(BaseModel):
    synthetic_samples: int = Field(default=250, ge=50, le=2000)
    random_seed: int = Field(default=42, ge=0)
    use_xgboost: bool = Field(default=True)


# ==============================================================================
# Emergency Accident Intake & Rapid Triage Workflow Schemas
# ==============================================================================

class AccidentType(str, Enum):
    ROAD_TRAFFIC_ACCIDENT = "ROAD_TRAFFIC_ACCIDENT"
    FALL = "FALL"
    WORKPLACE_ACCIDENT = "WORKPLACE_ACCIDENT"
    BURN = "BURN"
    OTHER = "OTHER"


class IdentityStatus(str, Enum):
    KNOWN = "KNOWN"
    UNKNOWN = "UNKNOWN"
    NOT_YET_VERIFIED = "NOT_YET_VERIFIED"


class EmergencyCaseStatus(str, Enum):
    RESPONSE_ACTIVATED = "RESPONSE_ACTIVATED"
    INITIAL_ASSESSMENT = "INITIAL_ASSESSMENT"
    STABILIZATION_IN_PROGRESS = "STABILIZATION_IN_PROGRESS"
    AWAITING_CLINICAL_DECISION = "AWAITING_CLINICAL_DECISION"
    TRANSFERRED = "TRANSFERRED"
    ADMITTED = "ADMITTED"
    COMPLETED = "COMPLETED"


class EmergencyIntakeRequest(BaseModel):
    case_id: Optional[str] = Field(None, max_length=64, description="Unique client-supplied emergency case ID for retry idempotency")
    patient_identity_status: IdentityStatus = Field(default=IdentityStatus.NOT_YET_VERIFIED, description="Identity verification status")
    patient_name: Optional[str] = Field(None, max_length=120, description="Patient name if known")
    approximate_age: Optional[int] = Field(None, ge=0, le=130, description="Approximate age if known")
    gender: Optional[str] = Field(default="Unknown", description="Patient gender or Unknown")
    accident_type: AccidentType = Field(default=AccidentType.OTHER, description="Accident type classification")
    mechanism_of_injury: Optional[str] = Field(None, max_length=1000, description="Brief mechanism of injury description")
    arrival_time: Optional[str] = Field(None, max_length=32, description="Recorded arrival time")

    # Primary survey (ABCDE) observations
    airway_status: Optional[str] = Field("Intact", max_length=64, description="Airway evaluation (Intact, Compromised, Obstructed, etc.)")
    breathing_status: Optional[str] = Field("Normal", max_length=64, description="Breathing evaluation (Normal, Dyspnea, Severe Distress, etc.)")
    circulation_status: Optional[str] = Field("Palpable", max_length=64, description="Circulatory status (Palpable, Weak, Shock, Pulseless, etc.)")
    neurological_status: Optional[str] = Field("Alert", max_length=64, description="Consciousness / AVPU (Alert, Verbal, Pain, Unresponsive)")
    major_bleeding: Optional[str] = Field("None", max_length=64, description="Bleeding status (None, Controlled, Massive Hemorrhage, etc.)")

    # Physiological vitals (all optional for rapid emergency activation)
    pulse_bpm: Optional[int] = Field(None, ge=0, le=300, description="Pulse rate bpm")
    systolic_bp: Optional[int] = Field(None, ge=30, le=300, description="Systolic blood pressure mmHg")
    diastolic_bp: Optional[int] = Field(None, ge=10, le=200, description="Diastolic blood pressure mmHg")
    respiratory_rate: Optional[int] = Field(None, ge=0, le=80, description="Respiratory rate breaths/min")
    spo2: Optional[float] = Field(None, ge=20.0, le=100.0, description="Oxygen saturation SpO2 %")
    temperature_f: Optional[float] = Field(None, ge=80.0, le=115.0, description="Temperature °F")
    gcs_score: Optional[int] = Field(None, ge=3, le=15, description="Glasgow Coma Scale score (3-15)")

    # Red flags and immediate actions
    red_flags: List[str] = Field(default_factory=list, description="List of staff-documented red flag alerts")
    escalation_reason: Optional[str] = Field(None, max_length=500, description="Specific clinical reason for emergency escalation")
    immediate_actions_taken: Optional[str] = Field(None, max_length=1000, description="Immediate clinical interventions already performed")
    activated_by: Optional[str] = Field("Trauma Staff", max_length=120, description="Staff member initiating emergency response")
    assigned_resuscitation_bay: Optional[str] = Field("Red Trauma Bay 01", max_length=32, description="Assigned emergency resuscitation bay")

    @model_validator(mode="after")
    def validate_blood_pressure_consistency(self):
        if self.systolic_bp is not None and self.diastolic_bp is not None:
            if self.systolic_bp <= self.diastolic_bp:
                raise ValueError("Systolic blood pressure must be strictly greater than diastolic blood pressure.")
        return self


class EmergencyCaseResponse(BaseModel):
    id: str
    case_id: str
    patient_identity_status: str
    patient_name: Optional[str] = None
    approximate_age: Optional[int] = None
    gender: str
    accident_type: str
    mechanism_of_injury: Optional[str] = None
    arrival_time: str
    arrival_datetime: datetime
    elapsed_minutes: int = 0

    # ABCDE Observations
    airway_status: Optional[str] = None
    breathing_status: Optional[str] = None
    circulation_status: Optional[str] = None
    neurological_status: Optional[str] = None
    major_bleeding: Optional[str] = None

    # Vitals
    pulse_bpm: Optional[int] = None
    systolic_bp: Optional[int] = None
    diastolic_bp: Optional[int] = None
    respiratory_rate: Optional[int] = None
    spo2: Optional[float] = None
    temperature_f: Optional[float] = None
    gcs_score: Optional[int] = None

    # Triage and Red Flags
    red_flags: List[str] = Field(default_factory=list)
    escalation_reason: Optional[str] = None
    triage_category: str
    urgency_level: str
    immediate_actions_taken: Optional[str] = None

    # Status & Workflow
    status: str
    activated_by: str
    activated_at: datetime
    assigned_resuscitation_bay: Optional[str] = None
    reassessment_status: str
    reassessed_at: Optional[datetime] = None
    is_synthetic: bool = True
    created_at: datetime
    updated_at: datetime
    hospital_protocol_instructions: List[str] = Field(default_factory=list)
    clinical_disclaimer: str = (
        "CRITICAL CLINICAL DECISION-SUPPORT NOTICE: This rapid emergency accident workflow "
        "initiates hospital resuscitation protocols. Clinical decisions, diagnoses, and "
        "interventions must be directed by qualified emergency healthcare professionals."
    )


class EmergencyStatusUpdateRequest(BaseModel):
    status: EmergencyCaseStatus = Field(..., description="Target lifecycle status")
    updated_by: str = Field(default="Staff Nurse", min_length=1, max_length=120, description="Responsible clinician name")
    notes: Optional[str] = Field(None, max_length=1000, description="Clinical handoff or transfer notes")
    assigned_resuscitation_bay: Optional[str] = Field(None, max_length=32, description="Updated bay allocation")


class EmergencyReassessmentRequest(BaseModel):
    reassessed_by: str = Field(default="Emergency Clinician", min_length=1, max_length=120)
    airway_status: Optional[str] = None
    breathing_status: Optional[str] = None
    circulation_status: Optional[str] = None
    neurological_status: Optional[str] = None
    major_bleeding: Optional[str] = None
    pulse_bpm: Optional[int] = Field(None, ge=0, le=300)
    systolic_bp: Optional[int] = Field(None, ge=30, le=300)
    diastolic_bp: Optional[int] = Field(None, ge=10, le=200)
    respiratory_rate: Optional[int] = Field(None, ge=0, le=80)
    spo2: Optional[float] = Field(None, ge=20.0, le=100.0)
    temperature_f: Optional[float] = None
    gcs_score: Optional[int] = Field(None, ge=3, le=15)
    reassessment_status: str = Field(default="PRIMARY_SURVEY_COMPLETED")
    notes: Optional[str] = Field(None, max_length=1000)

    @model_validator(mode="after")
    def validate_blood_pressure_consistency(self):
        if self.systolic_bp is not None and self.diastolic_bp is not None:
            if self.systolic_bp <= self.diastolic_bp:
                raise ValueError("Systolic blood pressure must be strictly greater than diastolic blood pressure.")
        return self


class EmergencyAuditItemResponse(BaseModel):
    id: int
    case_id: str
    previous_status: Optional[str] = None
    new_status: str
    action_type: str
    performed_by: str
    notes: Optional[str] = None
    created_at: datetime


class EmergencyStatsResponse(BaseModel):
    active_emergency_count: int
    level_1_resuscitation_count: int
    stabilization_count: int
    total_emergency_cases_today: int
    total_recorded_emergency_cases: int = 0
    hospital_timezone: str = "Asia/Kolkata"


# ============================================================================
# Longitudinal Deterioration Watch & Physiological Monitoring Schemas
# ============================================================================

class ObservationType(str, Enum):
    PULSE = "PULSE"
    SPO2 = "SPO2"
    SYSTOLIC_BP = "SYSTOLIC_BP"
    DIASTOLIC_BP = "DIASTOLIC_BP"
    RESPIRATORY_RATE = "RESPIRATORY_RATE"
    TEMPERATURE = "TEMPERATURE"


class ObservationCreateRequest(BaseModel):
    observation_type: str = Field(..., description="PULSE, SPO2, SYSTOLIC_BP, DIASTOLIC_BP, RESPIRATORY_RATE, TEMPERATURE")
    value: float = Field(..., description="Numerical value of observation")
    secondary_value: Optional[float] = Field(None, description="Optional secondary value (e.g. Diastolic BP)")
    unit: str = Field(..., max_length=16, description="Unit e.g. bpm, %, mmHg, /min, °F")
    measured_at: Optional[datetime] = Field(None, description="Measurement timestamp")
    recorded_by: str = Field(..., min_length=1, max_length=120, description="Authorized staff name or ID")
    notes: Optional[str] = Field(None, max_length=500, description="Clinical contextual notes")


class ObservationItemResponse(BaseModel):
    id: int
    patient_id: str
    observation_type: str
    value: float
    secondary_value: Optional[float] = None
    unit: str
    measured_at: datetime
    recorded_by: str
    notes: Optional[str] = None
    created_at: datetime


class ObservationSummaryItem(BaseModel):
    observation_type: str
    display_name: str
    current_value: Optional[float] = None
    current_secondary_value: Optional[float] = None
    unit: str
    measured_at: Optional[datetime] = None
    previous_value: Optional[float] = None
    delta: Optional[float] = None
    is_outdated: bool = False
    is_missing: bool = True
    recorded_by: Optional[str] = None


class DeteriorationWarningResponse(BaseModel):
    id: int
    patient_id: str
    warning_id: str
    severity: str
    trigger_reason: str
    supporting_observation: Optional[str] = None
    status: str
    acknowledged_by: Optional[str] = None
    acknowledged_at: Optional[datetime] = None
    acknowledgment_notes: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolution_notes: Optional[str] = None
    rule_version: str
    created_at: datetime
    updated_at: datetime


class WarningAcknowledgeRequest(BaseModel):
    acknowledged_by: str = Field(..., min_length=1, max_length=120, description="Authorized clinician/nurse")
    notes: Optional[str] = Field(None, max_length=500, description="Clinical action notes")
    status: str = Field(default="ACKNOWLEDGED", description="Target status: ACKNOWLEDGED, REASSESSMENT_IN_PROGRESS, REASSESSED_ESCALATED, REASSESSED_MAINTAINED")


class ClinicianTriageAssignmentRequest(BaseModel):
    clinician_name: str = Field(..., min_length=1, max_length=120, description="Authorized clinician name")
    triage_level: int = Field(..., ge=1, le=5, description="Clinician-assigned triage level (1 to 5)")
    triage_name: str = Field(..., min_length=1, max_length=64, description="Level name e.g. Resuscitation, Emergent, Urgent, Routine")
    notes: str = Field(..., min_length=1, max_length=1000, description="Mandatory clinical rationale or override reason")


class ClinicianTriageInfo(BaseModel):
    clinician_triage_level: Optional[int] = None
    clinician_triage_name: Optional[str] = None
    clinician_triage_notes: Optional[str] = None
    clinician_reviewed_by: Optional[str] = None
    clinician_reviewed_at: Optional[datetime] = None


class DeteriorationWatchResponse(BaseModel):
    patient_id: str
    patient_name: str
    age: int
    gender: str
    token_number: str
    deterioration_flag: bool
    deterioration_reason: Optional[str] = None
    last_reassessed_at: Optional[datetime] = None
    clinician_assigned_triage: ClinicianTriageInfo
    rule_evaluation_configured: bool = True
    rule_set_version: str
    observations: List[ObservationSummaryItem]
    raw_observation_history: List[ObservationItemResponse]
    active_warnings: List[DeteriorationWarningResponse]
    audit_trail: List[Dict[str, Any]]
    disclaimer: str = (
        "PHYSIOLOGICAL SURVEILLANCE NOTICE: Deterioration watch evaluates recorded vital signs "
        "against configured clinical prototype thresholds. It does not replace ongoing bedside "
        "nursing observation, diagnostic tests, or emergency clinician judgment. Never delay "
        "emergency care while waiting for new measurements or review."
    )


# ============================================================================
# Explainable Assessment Schemas
# ============================================================================

class RuleWarningDetail(BaseModel):
    rule_id: str
    rule_name: str
    acuity_level: str
    message: str
    clinical_explanation: str
    required_human_verification: str
    is_critical_override: bool


class AIModelSuggestionInfo(BaseModel):
    available: bool
    model_name: Optional[str] = "MediTriage Multi-Head XGBoost / Tabular Ensemble"
    model_version: Optional[str] = None
    raw_suggested_level: Optional[int] = None
    raw_suggested_name: Optional[str] = None
    suggested_level: Optional[int] = None
    suggested_name: Optional[str] = None
    recommended_department: Optional[str] = None
    override_applied: bool = False
    abstention_status: Optional[str] = None
    disclaimer: str = (
        "AI model output is an assistive suggestion only. Correlation does not imply causation, "
        "and model suggestions do NOT constitute a medical diagnosis or confirmed triage tier."
    )


class RedFlagAndObservationEvidence(BaseModel):
    recorded_red_flags: List[str]
    vital_abnormalities: List[str]
    supporting_observations: List[str]


class MissingAssessmentInformation(BaseModel):
    missing_vital_signs: List[str]
    data_quality_issues: List[str]
    unrecorded_measurements_note: str


class AssessmentAuditHistoryItem(BaseModel):
    action_type: str
    performed_by: str
    timestamp: datetime
    previous_status: Optional[str] = None
    new_status: str
    notes: Optional[str] = None


class ExplainableAssessmentResponse(BaseModel):
    patient_id: str
    patient_name: str
    token_number: str
    assessment_timestamp: datetime
    rule_set_version: str

    clinician_assigned_triage: ClinicianTriageInfo
    ai_model_suggestion: AIModelSuggestionInfo
    rule_based_warnings: List[RuleWarningDetail]
    evidence: RedFlagAndObservationEvidence
    missing_information: MissingAssessmentInformation

    effective_triage_level: int
    effective_triage_name: str
    recommended_department: str

    review_status: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_notes: Optional[str] = None
    audit_history: List[AssessmentAuditHistoryItem]

    clinical_disclaimer: str = (
        "EXPLAINABLE CLINICAL DECISION-SUPPORT NOTICE: This panel explains the physiological rationale, "
        "rule triggers, and machine-learning suggestions evaluated during triage intake. All classifications "
        "are advisory for queue prioritization and do not supersede qualified clinical evaluation."
    )






