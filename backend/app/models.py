import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, Text, DateTime
from app.db import Base


def utc_now():
    return datetime.now(timezone.utc)


class PatientModel(Base):
    """
    SQLAlchemy ORM model for storing patient triage intake and queue records.
    Stores clinical and demographic data required for OPD prioritization without
    storing unnecessary personally identifiable information.
    """
    __tablename__ = "patients"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(64), unique=True, index=True, nullable=False)
    token_number = Column(String(32), index=True, nullable=False)
    patient_name = Column(String(120), nullable=True)
    age = Column(Integer, nullable=False)
    gender = Column(String(20), nullable=False)
    arrival_time = Column(String(32), nullable=False)
    chief_complaint = Column(Text, nullable=False)
    complaint_language = Column(String(32), default="English", nullable=False)
    known_conditions = Column(Text, default="[]", nullable=False)  # JSON-encoded list
    medications = Column(Text, default="", nullable=False)
    systolic_bp = Column(Integer, nullable=True)
    diastolic_bp = Column(Integer, nullable=True)
    pulse_bpm = Column(Integer, nullable=True)
    temperature = Column(Float, nullable=True)
    temperature_unit = Column(String(4), default="F", nullable=False)
    spo2 = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String(32), default="WAITING", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Clinical Triage & Real-Time Queue Prioritization Fields
    triage_level = Column(Integer, nullable=True)                  # 1-5, or None if pending
    triage_level_name = Column(String(64), nullable=True)         # "Level 1 - Resuscitation", etc.
    recommended_department = Column(String(64), nullable=True)    # "Casualty / Emergency", etc.
    urgency_score = Column(Integer, default=3, nullable=False)    # 1-10
    warning_signs = Column(Text, default="[]", nullable=False)     # JSON list of detected warning signs
    assessment_status = Column(String(64), default="PENDING_ASSESSMENT", nullable=False) # PENDING_ASSESSMENT, EVALUATED, SAFETY_OVERRIDE, ABSTAINED_DATA_QUALITY_HOLD, etc.
    review_status = Column(String(64), default="UNREVIEWED", nullable=False) # UNREVIEWED, REVIEWED, DETERIORATION_FLAGGED, REASSESSMENT_REQUESTED
    reviewed_by = Column(String(120), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_notes = Column(Text, nullable=True)
    deterioration_flag = Column(Boolean, default=False, nullable=False)
    deterioration_reason = Column(Text, nullable=True)
    last_reassessed_at = Column(DateTime(timezone=True), nullable=True)

    # Clinician-Assigned Triage (strictly separated from automated AI/rules predictions)
    clinician_triage_level = Column(Integer, nullable=True)
    clinician_triage_name = Column(String(64), nullable=True)
    clinician_triage_notes = Column(Text, nullable=True)
    clinician_reviewed_by = Column(String(120), nullable=True)
    clinician_reviewed_at = Column(DateTime(timezone=True), nullable=True)

    # Distinguish synthetic demonstration cases from real patient records
    is_synthetic = Column(Boolean, default=False, nullable=False)


class PatientObservationModel(Base):
    """
    Chronological observation records for longitudinal deterioration watching.
    Stores only observations actually measured, with measurement timestamp,
    recorded clinician/nurse, and unit.
    """
    __tablename__ = "patient_observations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(64), index=True, nullable=False)
    observation_type = Column(String(64), nullable=False)  # PULSE, SPO2, SYSTOLIC_BP, DIASTOLIC_BP, TEMPERATURE, RESPIRATORY_RATE
    value = Column(Float, nullable=False)
    secondary_value = Column(Float, nullable=True)  # e.g. diastolic BP if stored alongside systolic
    unit = Column(String(16), nullable=False)
    measured_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    recorded_by = Column(String(120), default="Staff Nurse", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class DeteriorationWarningModel(Base):
    """
    Active and historical clinical deterioration warnings triggered by
    configured, approved physiological prototype rules.
    """
    __tablename__ = "deterioration_warnings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(64), index=True, nullable=False)
    warning_id = Column(String(64), nullable=False)  # e.g. CRIT-WARN-SPO2-HYPOXIA
    severity = Column(String(32), nullable=False)    # CRITICAL, URGENT, WARNING
    trigger_reason = Column(Text, nullable=False)
    supporting_observation = Column(Text, nullable=True)
    status = Column(String(64), default="PENDING_REVIEW", nullable=False)  # PENDING_REVIEW, ACKNOWLEDGED, REASSESSMENT_IN_PROGRESS, REASSESSED_ESCALATED, REASSESSED_MAINTAINED
    acknowledged_by = Column(String(120), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    acknowledgment_notes = Column(Text, nullable=True)
    resolved_by = Column(String(120), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_notes = Column(Text, nullable=True)
    rule_version = Column(String(64), default="2026.1-prototype-clinical-rules", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class QueueAuditModel(Base):
    """
    Audit trail recording nurse and clinician review actions, status changes,
    deterioration flags, and reassessment events.
    """
    __tablename__ = "queue_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(64), index=True, nullable=False)
    previous_status = Column(String(64), nullable=True)
    new_status = Column(String(64), nullable=False)
    action_type = Column(String(64), nullable=False)  # INTAKE_REGISTERED, REVIEWED, DETERIORATION_FLAGGED, REASSESSMENT_REQUESTED, STATUS_UPDATED
    performed_by = Column(String(120), default="Nurse Station", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class SafetyAuditModel(Base):
    """
    Audit log recording rule versions and triggered clinical safety rules
    without storing sensitive patient PII.
    """
    __tablename__ = "safety_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(64), index=True, nullable=False)
    rule_version = Column(String(64), nullable=False)
    triggered_rule_ids = Column(Text, nullable=False)  # JSON-encoded list of rule IDs
    override_applied = Column(Boolean, default=False, nullable=False)
    escalation_status = Column(String(64), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class EmergencyCaseModel(Base):
    """
    Dedicated model for acute emergency & accident intake cases.
    Operates independently from routine OPD queues, enabling rapid triage,
    immediate Level 1 response activation, and primary survey (ABCDE) documentation
    without requiring routine demographic registration or ML delays.
    """
    __tablename__ = "emergency_cases"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    case_id = Column(String(64), unique=True, index=True, nullable=False)
    patient_identity_status = Column(String(32), default="NOT_YET_VERIFIED", nullable=False)  # KNOWN, UNKNOWN, NOT_YET_VERIFIED
    patient_name = Column(String(120), nullable=True)
    approximate_age = Column(Integer, nullable=True)
    gender = Column(String(20), default="Unknown", nullable=False)  # Male, Female, Other, Unknown
    accident_type = Column(String(64), default="OTHER", nullable=False)  # ROAD_TRAFFIC_ACCIDENT, FALL, WORKPLACE_ACCIDENT, BURN, OTHER
    mechanism_of_injury = Column(Text, nullable=True)
    arrival_time = Column(String(32), nullable=False)
    arrival_datetime = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Primary Survey (ABCDE) observations
    airway_status = Column(String(64), default="Intact", nullable=True)
    breathing_status = Column(String(64), default="Normal", nullable=True)
    circulation_status = Column(String(64), default="Palpable", nullable=True)
    neurological_status = Column(String(64), default="Alert", nullable=True)  # AVPU scale or neurological state
    major_bleeding = Column(String(64), default="None", nullable=True)

    # Physiological vitals
    pulse_bpm = Column(Integer, nullable=True)
    systolic_bp = Column(Integer, nullable=True)
    diastolic_bp = Column(Integer, nullable=True)
    respiratory_rate = Column(Integer, nullable=True)
    spo2 = Column(Float, nullable=True)
    temperature_f = Column(Float, nullable=True)
    gcs_score = Column(Integer, nullable=True)

    # Red Flags, clinical escalation, and interventions
    red_flags = Column(Text, default="[]", nullable=False)  # JSON-encoded list of red flags
    escalation_reason = Column(Text, nullable=True)
    triage_category = Column(String(32), default="LEVEL_1_RESUSCITATION", nullable=False)
    urgency_level = Column(String(64), default="Level 1 - Immediate Resuscitation", nullable=False)
    immediate_actions_taken = Column(Text, nullable=True)

    # Case Lifecycle & Response Workflow
    status = Column(String(64), default="RESPONSE_ACTIVATED", nullable=False)
    activated_by = Column(String(120), default="Trauma Staff", nullable=False)
    activated_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    assigned_resuscitation_bay = Column(String(32), default="Red Trauma Bay 01", nullable=True)
    reassessment_status = Column(String(64), default="PENDING_PRIMARY_SURVEY", nullable=False)
    reassessed_at = Column(DateTime(timezone=True), nullable=True)
    is_synthetic = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class EmergencyAuditModel(Base):
    """
    Dedicated audit log recording chronological status changes, clinical reassessments,
    and staff escalation actions for emergency trauma cases.
    """
    __tablename__ = "emergency_audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String(64), index=True, nullable=False)
    previous_status = Column(String(64), nullable=True)
    new_status = Column(String(64), nullable=False)
    action_type = Column(String(64), nullable=False)  # EMERGENCY_ACTIVATED, STATUS_UPDATED, REASSESSMENT_LOGGED, TRANSFERRED
    performed_by = Column(String(120), default="Emergency Staff", nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

