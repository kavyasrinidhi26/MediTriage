import uuid
import json
import random
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    PatientModel,
    SafetyAuditModel,
    QueueAuditModel,
    EmergencyCaseModel,
    EmergencyAuditModel,
    PatientObservationModel,
    DeteriorationWarningModel,
    utc_now,
)
from app.safety_rules import (
    evaluate_data_quality,
    evaluate_clinical_escalation_rules,
    apply_safety_override,
    evaluate_deterioration_warnings,
    DETERIORATION_RULES_VERSION,
    SAFETY_RULE_VERSION,
)
from app.schemas import (
    HealthResponse,
    PatientTriageRequest,
    TriageAssessmentResult,
    PatientQueueItem,
    QueueStatusUpdate,
    QueueSummaryStats,
    QueueStatus,
    TriageCategory,
    SpecialtyDepartment,
    VitalSigns,
    RedFlagChecklist,
    AVPUScale,
    PatientIntakeCreate,
    PatientIntakeResponse,
    PatientListResponse,
    AssessmentRequest,
    AssessmentResponse,
    SavedPatientQueueItem,
    QueueReviewRequest,
    DeteriorationReportRequest,
    ReassessmentRequest,
    QueueAuditItemResponse,
    SimulationRequest,
    RunEvaluationRequest,
    EmergencyIntakeRequest,
    EmergencyCaseResponse,
    EmergencyStatusUpdateRequest,
    EmergencyReassessmentRequest,
    EmergencyAuditItemResponse,
    EmergencyStatsResponse,
    EmergencyCaseStatus,
    AccidentType,
    IdentityStatus,
    ObservationType,
    ObservationCreateRequest,
    ObservationItemResponse,
    ObservationSummaryItem,
    DeteriorationWarningResponse,
    WarningAcknowledgeRequest,
    ClinicianTriageAssignmentRequest,
    ClinicianTriageInfo,
    DeteriorationWatchResponse,
    RuleWarningDetail,
    AIModelSuggestionInfo,
    RedFlagAndObservationEvidence,
    MissingAssessmentInformation,
    AssessmentAuditHistoryItem,
    ExplainableAssessmentResponse,
    ArrivalLogStatusResponse,
)
from app.ml.inference import TriageInferenceService
from app.ml.train import train_pipeline, DEFAULT_ARTIFACTS_DIR
from app.simulation import (
    generate_synthetic_arrivals,
    run_comparative_simulation,
    check_official_arrival_log,
    load_database_arrivals,
)
from app.triage_engine import evaluate_triage
from app.config import get_settings
from app.auth import get_current_staff_user, StaffUser
import os

router = APIRouter()
settings = get_settings()
inference_service = TriageInferenceService()


# In-memory storage for demonstration and hackathon prototype queue
# Seeded with realistic sample cases to immediately test hospital queue dynamics
QUEUE_STORAGE: Dict[str, PatientQueueItem] = {}
TOKEN_COUNTER = 100


def generate_token_number(db: Optional[Session] = None) -> str:
    global TOKEN_COUNTER
    if db is not None:
        try:
            latest = (
                db.query(PatientModel.token_number)
                .filter(PatientModel.token_number.like("OPD-%"))
                .all()
            )
            max_num = TOKEN_COUNTER
            for (t_str,) in latest:
                try:
                    num = int(t_str.replace("OPD-", ""))
                    if num > max_num:
                        max_num = num
                except (ValueError, TypeError):
                    pass
            TOKEN_COUNTER = max(TOKEN_COUNTER, max_num)
        except Exception:
            pass
    TOKEN_COUNTER += 1
    return f"OPD-{TOKEN_COUNTER}"


def init_seed_data():
    """Seed queue with initial realistic sample patients representing typical OPD rush."""
    sample_patients = [
        PatientTriageRequest(
            patient_name="Ramesh Kumar",
            age=58,
            gender="Male",
            contact_phone="9876543210",
            opd_registration_number="UHID-2026-901",
            chief_complaint="Severe retrosternal squeezing chest pain radiating to left jaw, profuse cold sweating",
            symptom_duration_days=0,
            vitals=VitalSigns(
                heart_rate=124,
                systolic_bp=88,
                diastolic_bp=56,
                respiratory_rate=28,
                spo2=91.0,
                temperature_f=98.4,
                avpu=AVPUScale.ALERT,
            ),
            red_flags=RedFlagChecklist(crushing_chest_pain=True),
            clinical_notes="Diaphoretic, clutching chest at counter",
        ),
        PatientTriageRequest(
            patient_name="Priya Sharma",
            age=29,
            gender="Female",
            contact_phone="9876501234",
            opd_registration_number="UHID-2026-902",
            chief_complaint="Productive cough, wheezing, and moderate breathlessness for 3 days; known asthmatic",
            symptom_duration_days=3,
            vitals=VitalSigns(
                heart_rate=108,
                systolic_bp=126,
                diastolic_bp=82,
                respiratory_rate=24,
                spo2=93.5,
                temperature_f=99.8,
                avpu=AVPUScale.ALERT,
            ),
            red_flags=RedFlagChecklist(),
            clinical_notes="Using home inhaler with minimal relief",
        ),
        PatientTriageRequest(
            patient_name="Aarav Verma",
            age=4,
            gender="Male",
            contact_phone="9812345678",
            opd_registration_number="UHID-2026-903",
            chief_complaint="High fever 102.5 F, runny nose, irritability, reduced oral intake",
            symptom_duration_days=2,
            vitals=VitalSigns(
                heart_rate=118,
                systolic_bp=96,
                diastolic_bp=60,
                respiratory_rate=26,
                spo2=97.0,
                temperature_f=102.5,
                avpu=AVPUScale.ALERT,
            ),
            red_flags=RedFlagChecklist(),
            clinical_notes="Brought by mother; crying and active on touch",
        ),
        PatientTriageRequest(
            patient_name="Sunita Devi",
            age=45,
            gender="Female",
            contact_phone="9988776655",
            opd_registration_number="UHID-2026-904",
            chief_complaint="Chronic bilateral knee joint pain, stiffness in morning, routine medication refill",
            symptom_duration_days=180,
            vitals=VitalSigns(
                heart_rate=74,
                systolic_bp=124,
                diastolic_bp=78,
                respiratory_rate=16,
                spo2=98.5,
                temperature_f=98.2,
                avpu=AVPUScale.ALERT,
            ),
            red_flags=RedFlagChecklist(),
            clinical_notes="Walking with mild limp, stable gait",
        ),
        PatientTriageRequest(
            patient_name="Mohammad Tariq",
            age=68,
            gender="Male",
            contact_phone="9871122334",
            opd_registration_number="UHID-2026-905",
            chief_complaint="Epigastric discomfort with unexplained fatigue and nausea; known diabetic for 15 years",
            symptom_duration_days=1,
            vitals=VitalSigns(
                heart_rate=96,
                systolic_bp=146,
                diastolic_bp=92,
                respiratory_rate=21,
                spo2=94.0,
                temperature_f=98.8,
                avpu=AVPUScale.ALERT,
            ),
            red_flags=RedFlagChecklist(),
            clinical_notes="Atypical presentation in elderly diabetic; flagged for senior registrar bedside review",
        ),
    ]

    for idx, sample in enumerate(sample_patients):
        assessment = evaluate_triage(sample)
        item_id = str(uuid.uuid4())
        token = generate_token_number()
        now = datetime.now(timezone.utc)
        item_status = QueueStatus.NEEDS_HUMAN_REVIEW if idx == 4 else QueueStatus.WAITING
        QUEUE_STORAGE[item_id] = PatientQueueItem(
            id=item_id,
            token_number=token,
            patient_name=sample.patient_name,
            age=sample.age,
            gender=sample.gender,
            opd_registration_number=sample.opd_registration_number,
            chief_complaint=sample.chief_complaint,
            symptom_duration_days=sample.symptom_duration_days or 0,
            vitals=sample.vitals,
            red_flags=sample.red_flags,
            clinical_notes=sample.clinical_notes,
            assessment=assessment,
            status=item_status,
            created_at=now,
            updated_at=now,
        )


# Initialize seed data on load
init_seed_data()


@router.get("/health", response_model=HealthResponse, summary="Backend health check")
def get_health() -> HealthResponse:
    """Returns application health status, environment, version, and server timestamp."""
    return HealthResponse(
        status="healthy",
        service=settings.APP_NAME,
        environment=settings.ENVIRONMENT,
        version=settings.TRIAGE_VERSION,
        timestamp=datetime.now(timezone.utc),
        hospital=settings.HOSPITAL_NAME,
    )


@router.post("/triage/assess", response_model=TriageAssessmentResult, summary="Assess triage category without storing")
def assess_patient(request: PatientTriageRequest) -> TriageAssessmentResult:
    """
    Evaluates patient vital signs, red flags, and chief complaints.
    Returns triage classification (EMERGENCY / PRIORITY / ROUTINE),
    urgency score (1-10), recommended department, and explainable rationale.
    """
    return evaluate_triage(request)


@router.post("/triage/queue", response_model=PatientQueueItem, status_code=status.HTTP_201_CREATED, summary="Assess and register patient into OPD live queue")
def register_and_queue_patient(
    request: PatientTriageRequest,
    db: Session = Depends(get_db),
) -> PatientQueueItem:
    """Assess patient and push immediately into the active OPD priority queue."""
    assessment = evaluate_triage(request)
    item_id = str(uuid.uuid4())
    token = generate_token_number(db)
    now = datetime.now(timezone.utc)

    queue_item = PatientQueueItem(
        id=item_id,
        token_number=token,
        patient_name=request.patient_name,
        age=request.age,
        gender=request.gender,
        opd_registration_number=request.opd_registration_number,
        chief_complaint=request.chief_complaint,
        symptom_duration_days=request.symptom_duration_days or 0,
        vitals=request.vitals,
        red_flags=request.red_flags,
        clinical_notes=request.clinical_notes,
        assessment=assessment,
        status=QueueStatus.WAITING,
        created_at=now,
        updated_at=now,
    )
    QUEUE_STORAGE[item_id] = queue_item

    # Persist to SQLite so both in-memory and persistent database queues remain synchronized
    try:
        triage_level_val = 1 if assessment.triage_category == TriageCategory.EMERGENCY else (
            2 if assessment.triage_category == TriageCategory.PRIORITY else 3
        )
        patient_id_val = request.opd_registration_number or f"PT-{int(now.timestamp())}-{token}"
        existing = db.query(PatientModel).filter(
            (PatientModel.patient_id == patient_id_val) | (PatientModel.id == item_id)
        ).first()
        if not existing:
            patient_model = PatientModel(
                id=item_id,
                patient_id=patient_id_val,
                token_number=token,
                patient_name=request.patient_name,
                age=request.age,
                gender=request.gender,
                arrival_time=now.strftime("%H:%M"),
                chief_complaint=request.chief_complaint,
                complaint_language="English",
                known_conditions="[]",
                medications="",
                systolic_bp=request.vitals.systolic_bp,
                diastolic_bp=request.vitals.diastolic_bp,
                pulse_bpm=request.vitals.heart_rate,
                temperature=request.vitals.temperature_f,
                temperature_unit="F",
                spo2=request.vitals.spo2,
                notes=request.clinical_notes,
                status="WAITING",
                triage_level=triage_level_val,
                triage_level_name=assessment.urgency_level,
                recommended_department=assessment.recommended_department.value if hasattr(assessment.recommended_department, "value") else str(assessment.recommended_department),
                urgency_score=assessment.urgency_score,
                warning_signs=json.dumps(assessment.red_flags_identified),
                assessment_status="EVALUATED",
                review_status="UNREVIEWED",
                created_at=now,
                updated_at=now,
            )
            db.add(patient_model)
            queue_audit = QueueAuditModel(
                patient_id=patient_id_val,
                previous_status=None,
                new_status="WAITING",
                action_type="INTAKE_REGISTERED",
                performed_by="Triage Intake Desk",
                notes=f"Triage intake registered. Category: {assessment.triage_category.value if hasattr(assessment.triage_category, 'value') else assessment.triage_category}",
                created_at=now,
            )
            db.add(queue_audit)
            db.commit()
    except Exception as e:
        logger.warning(f"Note: Error synchronizing patient to SQLite database: {e}")
        db.rollback()

    return queue_item


def sync_db_to_queue_storage(db: Session):
    """
    Synchronizes persistent patients from SQLite into QUEUE_STORAGE.
    Eliminates memory-database drift while maintaining backwards compatibility.
    Guarantees zero duplicate entries or count inflation.
    """
    try:
        patients = db.query(PatientModel).all()
        for p in patients:
            key = str(p.id)
            existing_key = None
            if key in QUEUE_STORAGE:
                existing_key = key
            else:
                for k, item in list(QUEUE_STORAGE.items()):
                    if item.opd_registration_number == p.patient_id:
                        existing_key = k
                        break

            st = (
                QueueStatus.NEEDS_HUMAN_REVIEW if p.status == "NEEDS_HUMAN_REVIEW" else (
                    QueueStatus.WITH_DOCTOR if p.status == "WITH_DOCTOR" else (
                        QueueStatus.TRANSFERRED_EMERGENCY if p.status == "TRANSFERRED_EMERGENCY" else (
                            QueueStatus.COMPLETED if p.status == "COMPLETED" else QueueStatus.WAITING
                        )
                    )
                )
            )

            is_syn = bool(
                getattr(p, "is_synthetic", False)
                or (p.patient_id and (p.patient_id.startswith("UHID-2026-9") or p.patient_id.startswith("DEMO-") or p.patient_id.startswith("SYN-")))
            )

            if existing_key:
                q_item = QUEUE_STORAGE[existing_key]
                q_item.status = st
                q_item.is_synthetic = is_syn
                if p.triage_level == 1:
                    q_item.assessment.triage_category = TriageCategory.EMERGENCY
                    q_item.assessment.urgency_score = p.urgency_score or 10
                    q_item.assessment.triage_level = 1
                    q_item.assessment.triage_level_name = p.triage_level_name or "Level 1 - Resuscitation / Immediate"
                elif p.triage_level == 2:
                    q_item.assessment.triage_category = TriageCategory.PRIORITY
                    q_item.assessment.urgency_score = p.urgency_score or 7
                    q_item.assessment.triage_level = 2
                    q_item.assessment.triage_level_name = p.triage_level_name or "Level 2 - Emergent"
                elif p.triage_level == 3:
                    q_item.assessment.triage_category = TriageCategory.PRIORITY
                    q_item.assessment.urgency_score = p.urgency_score or 5
                    q_item.assessment.triage_level = 3
                    q_item.assessment.triage_level_name = p.triage_level_name or "Level 3 - Urgent"
                elif p.triage_level == 4:
                    q_item.assessment.triage_category = TriageCategory.ROUTINE
                    q_item.assessment.urgency_score = p.urgency_score or 3
                    q_item.assessment.triage_level = 4
                    q_item.assessment.triage_level_name = p.triage_level_name or "Level 4 - Less Urgent"
                elif p.triage_level == 5:
                    q_item.assessment.triage_category = TriageCategory.ROUTINE
                    q_item.assessment.urgency_score = p.urgency_score or 1
                    q_item.assessment.triage_level = 5
                    q_item.assessment.triage_level_name = p.triage_level_name or "Level 5 - Non-Urgent"
                if p.triage_level_name:
                    q_item.assessment.urgency_level = p.triage_level_name

                if existing_key != key:
                    del QUEUE_STORAGE[existing_key]
                QUEUE_STORAGE[key] = q_item
                continue

            temp_f = (
                p.temperature
                if p.temperature_unit == "F"
                else ((p.temperature * 9 / 5) + 32 if p.temperature is not None else None)
            )
            vitals = VitalSigns(
                heart_rate=p.pulse_bpm,
                systolic_bp=p.systolic_bp,
                diastolic_bp=p.diastolic_bp,
                temperature_f=temp_f,
                spo2=p.spo2,
                avpu=AVPUScale.ALERT,
            )
            red_flags = RedFlagChecklist()

            if p.triage_level == 1:
                cat = TriageCategory.EMERGENCY
                score = p.urgency_score or 10
            elif p.triage_level == 2:
                cat = TriageCategory.PRIORITY
                score = p.urgency_score or 7
            elif p.triage_level == 3:
                cat = TriageCategory.PRIORITY
                score = p.urgency_score or 5
            elif p.triage_level == 5:
                cat = TriageCategory.ROUTINE
                score = p.urgency_score or 1
            else:
                cat = TriageCategory.ROUTINE
                score = p.urgency_score or 3

            try:
                dept_val = p.recommended_department or "General Medicine"
                dept = SpecialtyDepartment(dept_val)
            except Exception:
                dept = SpecialtyDepartment.GENERAL_MEDICINE

            p_created = p.created_at if p.created_at and getattr(p.created_at, "tzinfo", None) else (
                p.created_at.replace(tzinfo=timezone.utc) if p.created_at else utc_now()
            )
            p_updated = p.updated_at if p.updated_at and getattr(p.updated_at, "tzinfo", None) else (
                p.updated_at.replace(tzinfo=timezone.utc) if p.updated_at else p_created
            )

            red_flags_list = []
            if p.warning_signs:
                try:
                    import json
                    parsed_signs = json.loads(p.warning_signs)
                    if isinstance(parsed_signs, list):
                        red_flags_list = parsed_signs
                except Exception:
                    pass

            target_wait = (
                0 if p.triage_level == 1 else (
                    15 if p.triage_level == 2 else (
                        30 if p.triage_level == 3 else (
                            60 if p.triage_level == 4 else 120
                        )
                    )
                )
            )

            assessment = TriageAssessmentResult(
                triage_category=cat,
                urgency_level=p.triage_level_name or ("Pending Assessment" if not p.triage_level else f"Level {p.triage_level}"),
                triage_level=p.triage_level,
                triage_level_name=p.triage_level_name,
                urgency_score=score,
                recommended_department=dept,
                red_flags_identified=red_flags_list,
                vital_abnormalities=[],
                clinical_rationale=[f"Assessed acuity: {p.triage_level_name or 'Standard'}"],
                recommended_action="Triage Queue Evaluation",
                max_recommended_wait_minutes=target_wait,
                assessment_timestamp=p_created,
            )

            QUEUE_STORAGE[key] = PatientQueueItem(
                id=str(p.id),
                token_number=p.token_number,
                patient_name=p.patient_name or f"Patient {p.patient_id}",
                age=p.age,
                gender=p.gender,
                opd_registration_number=p.patient_id,
                chief_complaint=p.chief_complaint,
                symptom_duration_days=0,
                vitals=vitals,
                red_flags=red_flags,
                clinical_notes=p.notes,
                assessment=assessment,
                status=st,
                is_synthetic=is_syn,
                created_at=p_created,
                updated_at=p_updated,
            )
    except Exception:
        pass


@router.get("/triage/queue", response_model=List[PatientQueueItem], summary="Get live prioritized OPD queue")
def get_queue(
    department: Optional[str] = Query(None, description="Filter by recommended department"),
    category: Optional[TriageCategory] = Query(None, description="Filter by category (EMERGENCY, PRIORITY, ROUTINE)"),
    status: Optional[QueueStatus] = Query(None, description="Filter by status (WAITING, WITH_DOCTOR, COMPLETED)"),
    search: Optional[str] = Query(None, description="Search by patient name, UHID, or token"),
    today_only: Optional[bool] = Query(False, description="Filter patients registered within today's hospital date"),
    db: Session = Depends(get_db),
) -> List[PatientQueueItem]:
    """
    Retrieves the OPD patient queue sorted primarily by urgency score descending
    (Emergency -> Priority -> Routine), and secondarily by registration time.
    Emergency Level 1 life-threats strictly precede routine reviews.
    """
    sync_db_to_queue_storage(db)
    items = list(QUEUE_STORAGE.values())

    # Apply filters
    if today_only:
        tz_str, start_utc, end_utc = get_hospital_today_boundaries()
        items = [i for i in items if is_timestamp_in_hospital_today(i.created_at, start_utc, end_utc)]
    if department:
        dept_filter = department.lower()
        items = [
            i for i in items
            if dept_filter in (i.assessment.recommended_department.value if hasattr(i.assessment.recommended_department, "value") else str(i.assessment.recommended_department)).lower()
        ]
    if category:
        items = [i for i in items if i.assessment.triage_category == category]
    if status:
        items = [i for i in items if i.status == status]
    if search:
        s = search.lower()
        items = [
            i for i in items
            if s in i.patient_name.lower()
            or (i.opd_registration_number and s in i.opd_registration_number.lower())
            or s in i.token_number.lower()
        ]

    # Clinical sort priority:
    # 1. Active cases (WAITING, NEEDS_HUMAN_REVIEW):
    #    - Level 1 EMERGENCY strictly first (tier 0)
    #    - Level 2 PRIORITY or holding cases second (tier 1)
    #    - Level 3 ROUTINE third (tier 2)
    # 2. In-consultation cases (WITH_DOCTOR = tier 3)
    # 3. Transferred cases (TRANSFERRED_EMERGENCY = tier 4)
    # 4. Completed cases (COMPLETED = tier 5)
    def sort_key(item: PatientQueueItem):
        if item.status in (QueueStatus.WAITING, QueueStatus.NEEDS_HUMAN_REVIEW):
            if item.assessment.triage_category == TriageCategory.EMERGENCY:
                tier = 0
            elif item.assessment.triage_category == TriageCategory.PRIORITY or item.status == QueueStatus.NEEDS_HUMAN_REVIEW:
                tier = 1
            else:
                tier = 2
        elif item.status == QueueStatus.WITH_DOCTOR:
            tier = 3
        elif item.status == QueueStatus.TRANSFERRED_EMERGENCY:
            tier = 4
        else:
            tier = 5

        created_dt = item.created_at
        if created_dt and created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        created_ts = created_dt.timestamp() if created_dt else 0.0

        return (
            tier,
            -item.assessment.urgency_score,
            created_ts,
        )

    return sorted(items, key=sort_key)


@router.patch("/triage/queue/{patient_id}/status", response_model=PatientQueueItem, summary="Update patient triage queue status")
def update_queue_status(
    patient_id: str,
    payload: QueueStatusUpdate,
    current_staff: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
) -> PatientQueueItem:
    """Updates patient status (e.g., mark as called into doctor room or completed)."""
    sync_db_to_queue_storage(db)
    target_key = patient_id if patient_id in QUEUE_STORAGE else None
    if not target_key:
        for k, v in QUEUE_STORAGE.items():
            if v.id == patient_id or v.opd_registration_number == patient_id or v.token_number == patient_id:
                target_key = k
                break

    if not target_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found in queue."
        )

    item = QUEUE_STORAGE[target_key]
    
    # Active Level 1 Emergency dismissal protection: Require documented clinical review notes
    if item.assessment.triage_category == TriageCategory.EMERGENCY and payload.status == QueueStatus.COMPLETED:
        if not payload.notes or len(payload.notes.strip()) < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Active Level 1 Emergency cannot be dismissed or completed without documented clinical review notes (minimum 5 characters).",
            )

    item.status = payload.status
    item.updated_at = datetime.now(timezone.utc)
    if payload.doctor_room:
        if item.clinical_notes:
            item.clinical_notes += f" | Room: {payload.doctor_room}"
        else:
            item.clinical_notes = f"Room: {payload.doctor_room}"
    staff_identifier = current_staff.name or current_staff.email or current_staff.uid or "Staff"
    if payload.notes:
        note_str = f"Clinical Note ({staff_identifier}): {payload.notes.strip()}"
        if item.clinical_notes:
            item.clinical_notes += f" | {note_str}"
        else:
            item.clinical_notes = note_str

    # Also synchronize status in SQLite PatientModel if record exists
    record = (
        db.query(PatientModel)
        .filter((PatientModel.id == patient_id) | (PatientModel.patient_id == patient_id))
        .first()
    )
    if record:
        status_str = payload.status.value if hasattr(payload.status, "value") else str(payload.status)
        record.status = status_str
        if payload.notes:
            record.review_notes = (record.review_notes + " | " + payload.notes.strip()) if record.review_notes else payload.notes.strip()
            record.reviewed_by = staff_identifier
            record.reviewed_at = utc_now()
        record.updated_at = utc_now()
        db.commit()

    return item


@router.delete("/triage/queue/{patient_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove patient from queue")
def remove_from_queue(
    patient_id: str,
    current_staff: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    """Deletes or discharges a patient from the queue."""
    target_key = patient_id if patient_id in QUEUE_STORAGE else None
    if not target_key:
        for k, v in QUEUE_STORAGE.items():
            if v.id == patient_id or v.opd_registration_number == patient_id or v.token_number == patient_id:
                target_key = k
                break
    if not target_key:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found."
        )
    item = QUEUE_STORAGE[target_key]
    if item.assessment.triage_category == TriageCategory.EMERGENCY and item.status != QueueStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active Level 1 Emergency cannot be deleted without completing clinical handover or documenting review notes.",
        )
    del QUEUE_STORAGE[target_key]
    record = (
        db.query(PatientModel)
        .filter((PatientModel.id == patient_id) | (PatientModel.patient_id == patient_id))
        .first()
    )
    if record:
        record.status = "COMPLETED"
        record.updated_at = utc_now()
        db.commit()
    return None


def get_hospital_today_boundaries(hospital_tz_name: Optional[str] = None):
    """
    Computes strict calendar day start and end timestamps in UTC
    for the hospital's local timezone (configured in Settings as Asia/Kolkata).
    """
    tz_str = hospital_tz_name or getattr(settings, "HOSPITAL_TIMEZONE", "Asia/Kolkata")
    try:
        tz = ZoneInfo(tz_str)
    except Exception:
        tz = timezone(timedelta(hours=5, minutes=30))
    now_local = datetime.now(tz)
    start_local = datetime(now_local.year, now_local.month, now_local.day, 0, 0, 0, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)
    return tz_str, start_utc, end_utc


def is_timestamp_in_hospital_today(dt: Optional[datetime], start_utc: datetime, end_utc: datetime) -> bool:
    """Verifies whether a timestamp falls strictly within the local hospital calendar day."""
    if not dt:
        return False
    if getattr(dt, "tzinfo", None) is None:
        dt_utc = dt.replace(tzinfo=timezone.utc)
    else:
        dt_utc = dt.astimezone(timezone.utc)
    return start_utc <= dt_utc < end_utc


@router.get("/triage/stats", response_model=QueueSummaryStats, summary="Queue metrics and OPD load statistics")
@router.get("/stats", response_model=QueueSummaryStats, summary="Queue metrics and OPD load statistics (alias)")
@router.get("/analytics/dashboard/summary", response_model=QueueSummaryStats, summary="Queue metrics and OPD load statistics (alias)")
def get_queue_statistics(db: Session = Depends(get_db)) -> QueueSummaryStats:
    """Returns overview statistics on current OPD rush, waiting counts, and urgency breakdowns."""
    sync_db_to_queue_storage(db)
    items = list(QUEUE_STORAGE.values())

    tz_str, start_utc, end_utc = get_hospital_today_boundaries()

    # Authoritative database records
    db_patients = db.query(PatientModel).all()

    # Total registered patients (distinct UHID/patient identities across database)
    if db_patients:
        total_registered = len(set(p.patient_id or p.id for p in db_patients))
    else:
        total_registered = len(items)

    # Patients today: registration timestamp falls within current local hospital calendar day
    if db_patients:
        today_patient_ids = set()
        for p in db_patients:
            if is_timestamp_in_hospital_today(p.created_at, start_utc, end_utc):
                today_patient_ids.add(p.patient_id or p.id)
        patients_today_count = len(today_patient_ids)
    else:
        patients_today_count = sum(1 for i in items if is_timestamp_in_hospital_today(i.created_at, start_utc, end_utc))

    # Currently waiting: status WAITING (excluding completed, discharged, cancelled, transferred)
    if db_patients:
        currently_waiting_count = sum(
            1 for p in db_patients
            if (p.status or "").upper() == "WAITING"
        )
    else:
        currently_waiting_count = sum(1 for i in items if i.status == QueueStatus.WAITING)

    # Department breakdown & Acuity counts from live queue items
    dept_counts: Dict[str, int] = {}
    for item in items:
        dept = item.assessment.recommended_department.value if hasattr(item.assessment.recommended_department, "value") else str(item.assessment.recommended_department)
        dept_counts[dept] = dept_counts.get(dept, 0) + 1

    # Emergency Trauma metrics from EmergencyCaseModel
    db_emergencies = db.query(EmergencyCaseModel).all()
    active_emergency_cases_count = sum(
        1 for c in db_emergencies
        if (c.status or "").upper() not in ["COMPLETED", "TRANSFERRED", "ADMITTED"]
    )
    today_emergency_cases_count = sum(
        1 for c in db_emergencies
        if is_timestamp_in_hospital_today(c.created_at or c.arrival_datetime, start_utc, end_utc)
    )
    total_recorded_emergency_cases_count = len(db_emergencies)

    return QueueSummaryStats(
        total_patients=total_registered,
        waiting_count=sum(1 for i in items if i.status == QueueStatus.WAITING),
        with_doctor_count=sum(1 for i in items if i.status == QueueStatus.WITH_DOCTOR),
        needs_human_review_count=sum(1 for i in items if i.status == QueueStatus.NEEDS_HUMAN_REVIEW),
        completed_count=sum(1 for i in items if i.status == QueueStatus.COMPLETED),
        emergency_count=sum(1 for p in db_patients if p.triage_level == 1) if db_patients else sum(1 for i in items if i.assessment.triage_category == TriageCategory.EMERGENCY),
        priority_count=sum(1 for p in db_patients if p.triage_level == 2) if db_patients else sum(1 for i in items if i.assessment.triage_category == TriageCategory.PRIORITY),
        routine_count=sum(1 for p in db_patients if p.triage_level and p.triage_level >= 3) if db_patients else sum(1 for i in items if i.assessment.triage_category == TriageCategory.ROUTINE),
        departments_breakdown=dept_counts,
        # Explicit distinguished metrics
        patients_today=patients_today_count,
        total_registered_patients=total_registered,
        currently_waiting=currently_waiting_count,
        hospital_timezone=tz_str,
        active_emergency_cases=active_emergency_cases_count,
        today_emergency_cases=today_emergency_cases_count,
        total_recorded_emergency_cases=total_recorded_emergency_cases_count,
        emergency_cases=sum(1 for p in db_patients if p.triage_level == 1) if db_patients else sum(1 for i in items if i.assessment.triage_category == TriageCategory.EMERGENCY),
        priority_cases=sum(1 for p in db_patients if p.triage_level == 2) if db_patients else sum(1 for i in items if i.assessment.triage_category == TriageCategory.PRIORITY),
        routine_cases=sum(1 for p in db_patients if p.triage_level and p.triage_level >= 3) if db_patients else sum(1 for i in items if i.assessment.triage_category == TriageCategory.ROUTINE),
    )


@router.get("/departments", response_model=List[str], summary="List available hospital specialty departments")
def list_departments() -> List[str]:
    """Returns list of all available OPD departments."""
    return [dept.value for dept in SpecialtyDepartment]


# ==============================================================================
# Patient Intake & Safety Validation Endpoints (Prototype Persistence)
# ==============================================================================


@router.post(
    "/patients",
    response_model=PatientIntakeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Accept and validate patient intake record with safety evaluation",
)
def create_patient_intake(
    payload: PatientIntakeCreate,
    current_staff: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
) -> PatientIntakeResponse:
    """
    Validates and persists a patient intake record into the prototype database.
    Evaluates safety rules, checks for clinical red flags, and prevents ID collisions.
    Does NOT assign an unverified machine-learning triage prediction at intake.
    """
    # 1. Resolve or generate patient ID and check for collisions
    if payload.patient_id and payload.patient_id.strip():
        patient_id = payload.patient_id.strip()
        existing = db.query(PatientModel).filter(PatientModel.patient_id == patient_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Patient with ID '{patient_id}' is already registered.",
            )
    else:
        patient_id = f"PT-{int(datetime.now(timezone.utc).timestamp())}-{uuid.uuid4().hex[:6].upper()}"

    token_number = generate_token_number(db)

    # 2. Run independent Safety & Input Validation Module
    dq_issues = evaluate_data_quality(
        age=payload.age,
        gender=payload.gender,
        chief_complaint=payload.chief_complaint,
        systolic_bp=payload.systolic_bp,
        diastolic_bp=payload.diastolic_bp,
        pulse_bpm=payload.pulse_bpm,
        temperature=payload.temperature,
        temperature_unit=payload.temperature_unit,
        spo2=payload.spo2,
    )

    clinical_alerts = evaluate_clinical_escalation_rules(
        age=payload.age,
        gender=payload.gender,
        chief_complaint=payload.chief_complaint,
        known_conditions=payload.known_conditions,
        systolic_bp=payload.systolic_bp,
        diastolic_bp=payload.diastolic_bp,
        pulse_bpm=payload.pulse_bpm,
        temperature=payload.temperature,
        temperature_unit=payload.temperature_unit,
        spo2=payload.spo2,
    )

    safety_evaluation = apply_safety_override(
        data_quality_issues=dq_issues,
        clinical_alerts=clinical_alerts,
        model_prediction=None,
    )

    # If blocking data quality issues exist, reject with HTTP 422
    if not safety_evaluation.is_data_acceptable:
        blocking_reasons = [issue.message for issue in dq_issues if issue.is_blocking]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Data Quality Hold: {'; '.join(blocking_reasons)}",
        )

    # 3. Determine intake status based on clinical safety evaluation
    if safety_evaluation.escalation_status in ["ESCALATED_EMERGENCY", "ESCALATED_PRIORITY"]:
        record_status = "NEEDS_HUMAN_REVIEW"
    else:
        record_status = "WAITING"

    initial_triage_level = 1 if safety_evaluation.escalation_status == "ESCALATED_EMERGENCY" else (
        2 if safety_evaluation.escalation_status == "ESCALATED_PRIORITY" else 3
    )
    initial_triage_name = "Level 1 - Resuscitation" if initial_triage_level == 1 else (
        "Level 2 - Emergent" if initial_triage_level == 2 else "Level 3 - Urgent"
    )
    initial_warning_signs = [alert.rule_name for alert in clinical_alerts]
    initial_department = "Casualty / Emergency" if initial_triage_level == 1 else (
        "Pediatrics" if payload.age <= 12 else "General Medicine"
    )

    # 4. Persist prototype record using SQLAlchemy
    patient_record = PatientModel(
        patient_id=patient_id,
        token_number=token_number,
        patient_name=payload.patient_name,
        age=payload.age,
        gender=payload.gender,
        arrival_time=payload.arrival_time,
        chief_complaint=payload.chief_complaint,
        complaint_language=payload.complaint_language,
        known_conditions=json.dumps(payload.known_conditions),
        medications=payload.medications or "",
        systolic_bp=payload.systolic_bp,
        diastolic_bp=payload.diastolic_bp,
        pulse_bpm=payload.pulse_bpm,
        temperature=payload.temperature,
        temperature_unit=payload.temperature_unit,
        spo2=payload.spo2,
        notes=payload.notes,
        status=record_status,
        triage_level=initial_triage_level,
        triage_level_name=initial_triage_name,
        recommended_department=initial_department,
        urgency_score=9 if initial_triage_level == 1 else (6 if initial_triage_level == 2 else 3),
        warning_signs=json.dumps(initial_warning_signs),
        assessment_status=safety_evaluation.escalation_status if safety_evaluation.override_applied else "PENDING_ASSESSMENT",
        review_status="UNREVIEWED",
        is_synthetic=bool(patient_id and (patient_id.startswith("DEMO-") or patient_id.startswith("SYN-") or patient_id.startswith("TEST-") or patient_id.startswith("UHID-2026-9"))),
    )
    db.add(patient_record)
    db.commit()
    db.refresh(patient_record)

    # 5. Persist audit logs
    audit_log = SafetyAuditModel(
        patient_id=patient_id,
        rule_version=safety_evaluation.rule_version,
        triggered_rule_ids=json.dumps(safety_evaluation.triggered_rule_ids),
        override_applied=safety_evaluation.override_applied,
        escalation_status=safety_evaluation.escalation_status,
    )
    db.add(audit_log)

    queue_audit = QueueAuditModel(
        patient_id=patient_id,
        previous_status=None,
        new_status=record_status,
        action_type="INTAKE_REGISTERED",
        performed_by="Intake Nurse Station",
        notes=f"Intake registered. Language: {payload.complaint_language}. Initial Acuity: {initial_triage_name}",
    )
    db.add(queue_audit)
    db.commit()

    # Synchronize registered patient into live OPD queue storage with actual creation timestamp
    temp_f = (
        payload.temperature
        if payload.temperature_unit == "F"
        else ((payload.temperature * 9 / 5) + 32 if payload.temperature is not None else None)
    )
    triage_req = PatientTriageRequest(
        patient_name=patient_record.patient_name,
        age=patient_record.age,
        gender=patient_record.gender,
        opd_registration_number=patient_record.patient_id,
        chief_complaint=patient_record.chief_complaint,
        symptom_duration_days=0,
        vitals=VitalSigns(
            heart_rate=payload.pulse_bpm,
            systolic_bp=payload.systolic_bp,
            diastolic_bp=payload.diastolic_bp,
            temperature_f=temp_f,
            spo2=payload.spo2,
            avpu=AVPUScale.ALERT,
        ),
        red_flags=RedFlagChecklist(),
        clinical_notes=patient_record.notes,
    )
    evaluated_assessment = evaluate_triage(triage_req)
    if safety_evaluation.escalation_status == "ESCALATED_EMERGENCY":
        evaluated_assessment.triage_category = TriageCategory.EMERGENCY
        evaluated_assessment.urgency_score = max(evaluated_assessment.urgency_score, 9)
    elif safety_evaluation.escalation_status == "ESCALATED_PRIORITY":
        if evaluated_assessment.triage_category == TriageCategory.ROUTINE:
            evaluated_assessment.triage_category = TriageCategory.PRIORITY
            evaluated_assessment.urgency_score = max(evaluated_assessment.urgency_score, 6)

    queue_item = PatientQueueItem(
        id=str(patient_record.id),
        token_number=patient_record.token_number,
        patient_name=patient_record.patient_name,
        age=patient_record.age,
        gender=patient_record.gender,
        opd_registration_number=patient_record.patient_id,
        chief_complaint=patient_record.chief_complaint,
        symptom_duration_days=0,
        vitals=triage_req.vitals,
        red_flags=triage_req.red_flags,
        clinical_notes=patient_record.notes,
        assessment=evaluated_assessment,
        status=QueueStatus.NEEDS_HUMAN_REVIEW if record_status == "NEEDS_HUMAN_REVIEW" else QueueStatus.WAITING,
        is_synthetic=patient_record.is_synthetic,
        created_at=patient_record.created_at if patient_record.created_at.tzinfo else patient_record.created_at.replace(tzinfo=timezone.utc),
        updated_at=(patient_record.updated_at or patient_record.created_at) if (patient_record.updated_at or patient_record.created_at).tzinfo else (patient_record.updated_at or patient_record.created_at).replace(tzinfo=timezone.utc),
    )
    QUEUE_STORAGE[str(patient_record.id)] = queue_item

    return PatientIntakeResponse(
        id=patient_record.id,
        patient_id=patient_record.patient_id,
        token_number=patient_record.token_number,
        patient_name=patient_record.patient_name,
        age=patient_record.age,
        gender=patient_record.gender,
        arrival_time=patient_record.arrival_time,
        chief_complaint=patient_record.chief_complaint,
        complaint_language=patient_record.complaint_language,
        known_conditions=payload.known_conditions,
        medications=patient_record.medications,
        systolic_bp=patient_record.systolic_bp,
        diastolic_bp=patient_record.diastolic_bp,
        pulse_bpm=patient_record.pulse_bpm,
        temperature=patient_record.temperature,
        temperature_unit=patient_record.temperature_unit,
        spo2=patient_record.spo2,
        notes=patient_record.notes,
        status=patient_record.status,
        is_synthetic=patient_record.is_synthetic,
        created_at=patient_record.created_at,
        updated_at=patient_record.updated_at,
        safety_evaluation=safety_evaluation.model_dump(),
    )


@router.get(
    "/patients",
    response_model=PatientListResponse,
    summary="Retrieve saved prototype patient intake records",
)
def list_patients(
    search: Optional[str] = Query(None, description="Search by ID, name, or complaint text"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    offset: int = Query(0, ge=0, description="Page offset"),
    db: Session = Depends(get_db),
) -> PatientListResponse:
    """Returns paginated list of registered prototype intake patients."""
    query = db.query(PatientModel)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (PatientModel.patient_id.ilike(term))
            | (PatientModel.patient_name.ilike(term))
            | (PatientModel.chief_complaint.ilike(term))
        )

    total = query.count()
    records = query.order_by(PatientModel.created_at.desc()).offset(offset).limit(limit).all()

    patient_items: List[PatientIntakeResponse] = []
    for r in records:
        try:
            conds = json.loads(r.known_conditions) if r.known_conditions else []
        except Exception:
            conds = []

        patient_items.append(
            PatientIntakeResponse(
                id=r.id,
                patient_id=r.patient_id,
                token_number=r.token_number,
                patient_name=r.patient_name,
                age=r.age,
                gender=r.gender,
                arrival_time=r.arrival_time,
                chief_complaint=r.chief_complaint,
                complaint_language=r.complaint_language,
                known_conditions=conds,
                medications=r.medications,
                systolic_bp=r.systolic_bp,
                diastolic_bp=r.diastolic_bp,
                pulse_bpm=r.pulse_bpm,
                temperature=r.temperature,
                temperature_unit=r.temperature_unit,
                spo2=r.spo2,
                notes=r.notes,
                status=r.status,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )

    return PatientListResponse(
        patients=patient_items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/patients/{patient_id}",
    response_model=PatientIntakeResponse,
    summary="Retrieve a single patient record by patient ID",
)
def get_patient(
    patient_id: str,
    db: Session = Depends(get_db),
) -> PatientIntakeResponse:
    """Fetches a specific patient record by patient ID or UUID with live safety evaluation."""
    record = (
        db.query(PatientModel)
        .filter((PatientModel.patient_id == patient_id) | (PatientModel.id == patient_id))
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    try:
        conds = json.loads(record.known_conditions) if record.known_conditions else []
    except Exception:
        conds = []

    # Run safety rules for live display
    dq = evaluate_data_quality(
        age=record.age,
        gender=record.gender,
        chief_complaint=record.chief_complaint,
        systolic_bp=record.systolic_bp,
        diastolic_bp=record.diastolic_bp,
        pulse_bpm=record.pulse_bpm,
        temperature=record.temperature,
        temperature_unit=record.temperature_unit,
        spo2=record.spo2,
    )
    alerts = evaluate_clinical_escalation_rules(
        age=record.age,
        gender=record.gender,
        chief_complaint=record.chief_complaint,
        known_conditions=conds,
        systolic_bp=record.systolic_bp,
        diastolic_bp=record.diastolic_bp,
        pulse_bpm=record.pulse_bpm,
        temperature=record.temperature,
        temperature_unit=record.temperature_unit,
        spo2=record.spo2,
    )
    safety_eval = apply_safety_override(dq, alerts, model_prediction=None)

    return PatientIntakeResponse(
        id=record.id,
        patient_id=record.patient_id,
        token_number=record.token_number,
        patient_name=record.patient_name,
        age=record.age,
        gender=record.gender,
        arrival_time=record.arrival_time,
        chief_complaint=record.chief_complaint,
        complaint_language=record.complaint_language,
        known_conditions=conds,
        medications=record.medications,
        systolic_bp=record.systolic_bp,
        diastolic_bp=record.diastolic_bp,
        pulse_bpm=record.pulse_bpm,
        temperature=record.temperature,
        temperature_unit=record.temperature_unit,
        spo2=record.spo2,
        notes=record.notes,
        status=record.status,
        created_at=record.created_at,
        updated_at=record.updated_at,
        safety_evaluation=safety_eval.model_dump(),
    )


# ==============================================================================
# ML Decision Support & Safety Assessment Endpoint
# ==============================================================================


@router.post(
    "/assessments",
    response_model=AssessmentResponse,
    summary="Assess registered patient with ML model and safety escalation",
)
def create_assessment(
    payload: AssessmentRequest,
    db: Session = Depends(get_db),
) -> AssessmentResponse:
    """
    Executes the approved 7-step decision flow:
    1. Validates input.
    2. Runs independent safety rules engine.
    3. Escalates critical rules over lower-urgency ML predictions.
    4. Executes trained ML model if available.
    5. Abstains safely if model/data is insufficient (never placing patient at back of queue).
    6. Returns an auditable response.
    """
    # If patient_id is provided, retrieve patient from database if fields are omitted
    age = payload.age
    gender = payload.gender
    chief_complaint = payload.chief_complaint
    complaint_language = payload.complaint_language
    known_conditions = payload.known_conditions
    systolic_bp = payload.systolic_bp
    diastolic_bp = payload.diastolic_bp
    pulse_bpm = payload.pulse_bpm
    temperature = payload.temperature
    temperature_unit = payload.temperature_unit
    spo2 = payload.spo2
    respiratory_rate = payload.respiratory_rate
    notes = payload.notes
    record = None
    if payload.patient_id:
        record = (
            db.query(PatientModel)
            .filter((PatientModel.patient_id == payload.patient_id) | (PatientModel.id == payload.patient_id))
            .first()
        )
        if record:
            if age is None:
                age = record.age
            if gender is None:
                gender = record.gender
            if chief_complaint is None:
                chief_complaint = record.chief_complaint
            if not known_conditions:
                try:
                    known_conditions = json.loads(record.known_conditions) if record.known_conditions else []
                except Exception:
                    known_conditions = []
            if systolic_bp is None:
                systolic_bp = record.systolic_bp
            if diastolic_bp is None:
                diastolic_bp = record.diastolic_bp
            if pulse_bpm is None:
                pulse_bpm = record.pulse_bpm
            if temperature is None:
                temperature = record.temperature
                temperature_unit = record.temperature_unit or payload.temperature_unit or "F"
            if spo2 is None:
                spo2 = record.spo2
            if notes is None:
                notes = record.notes

    if age is None or gender is None or not chief_complaint:
        # Require minimal essential clinical attributes
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Patient assessment requires at minimum: age, gender, and chief_complaint (or a valid registered patient_id).",
        )

    medications = payload.medications
    if not medications and record and hasattr(record, "medications"):
        try:
            medications = json.loads(record.medications) if record.medications else []
        except Exception:
            medications = [record.medications]

    # Execute inference service with approved decision flow
    result = inference_service.assess(
        age=age,
        gender=gender,
        chief_complaint=chief_complaint,
        complaint_language=complaint_language,
        known_conditions=known_conditions,
        medications=medications,
        systolic_bp=systolic_bp,
        diastolic_bp=diastolic_bp,
        pulse_bpm=pulse_bpm,
        temperature=temperature,
        temperature_unit=temperature_unit,
        spo2=spo2,
        respiratory_rate=respiratory_rate,
        notes=notes,
    )

    # Update registered patient record with assessment findings
    if payload.patient_id and record:
        record.triage_level = result["triage_level"]
        record.triage_level_name = result["triage_level_name"]
        record.recommended_department = result["recommended_department"]
        record.warning_signs = json.dumps(result["detected_red_flags"])
        record.assessment_status = result["abstention_status"]
        if result["triage_level"] == 1:
            record.status = "NEEDS_HUMAN_REVIEW"
            record.urgency_score = 10
        elif result["triage_level"] == 2:
            record.urgency_score = 7
        db.commit()

        db.add(QueueAuditModel(
            patient_id=record.patient_id,
            previous_status=record.status,
            new_status=record.status,
            action_type="ASSESSMENT_COMPLETED",
            performed_by="CDSS Decision Support",
            notes=f"Triage Level {result['triage_level']} ({result['triage_level_name']}) assigned. Status: {result['abstention_status']}",
        ))
        db.commit()

        # Synchronize assessed triage level into QUEUE_STORAGE if patient is queued
        target_key = str(record.id) if str(record.id) in QUEUE_STORAGE else (
            record.patient_id if record.patient_id in QUEUE_STORAGE else None
        )
        if target_key:
            q_item = QUEUE_STORAGE[target_key]
            lvl = result.get("triage_level", 3)
            if lvl == 1:
                q_item.assessment.triage_category = TriageCategory.EMERGENCY
            elif lvl == 2:
                q_item.assessment.triage_category = TriageCategory.PRIORITY
            else:
                q_item.assessment.triage_category = TriageCategory.ROUTINE
            q_item.assessment.urgency_level = result.get("triage_level_name", f"Level {lvl}")
            q_item.assessment.urgency_score = record.urgency_score or (9 if lvl == 1 else (6 if lvl == 2 else 3))
            try:
                dept_val = result.get("recommended_department", "General Medicine")
                q_item.assessment.recommended_department = SpecialtyDepartment(dept_val)
            except Exception:
                pass
            if record.status == "NEEDS_HUMAN_REVIEW":
                q_item.status = QueueStatus.NEEDS_HUMAN_REVIEW
            q_item.updated_at = datetime.now(timezone.utc)


    # Audit log persistence (no sensitive patient PII)
    audit = SafetyAuditModel(
        patient_id=payload.patient_id or "ANON_ASSESSMENT",
        rule_version=result["rules_version"],
        triggered_rule_ids=json.dumps(result["triggered_safety_rule_ids"]),
        override_applied=(result["abstention_status"] == "SAFETY_OVERRIDE"),
        escalation_status=result["abstention_status"],
    )
    db.add(audit)
    db.commit()

    return AssessmentResponse(**result)


# ==============================================================================
# Functional Saved Patient Queue & Nurse Review Workflow
# ==============================================================================


def seed_saved_patients(db: Session):
    """
    Seeds initial realistic prototype OPD cases in the persistent SQLite database
    ensuring the triage queue reflects active rush and diverse clinical acuities.
    """
    has_benchmark = db.query(PatientModel).filter(PatientModel.patient_id == "UHID-2026-901").first()
    if has_benchmark:
        return

    # Backfill any legacy unassessed rows from earlier tests
    legacy_rows = db.query(PatientModel).filter(PatientModel.triage_level.is_(None)).all()
    for row in legacy_rows:
        row.triage_level = 3
        row.triage_level_name = "Level 3 - Urgent"
        row.recommended_department = "General Medicine"
        row.urgency_score = 3
        row.assessment_status = "PENDING_ASSESSMENT"
        row.review_status = "UNREVIEWED"
        row.warning_signs = json.dumps([])
        row.deterioration_flag = False
    if legacy_rows:
        db.commit()

    now = utc_now()
    sample_records = [
        PatientModel(
            patient_id="UHID-2026-901",
            token_number="OPD-101",
            patient_name="Ramesh Kumar",
            age=58,
            gender="Male",
            arrival_time="08:15 AM",
            chief_complaint="Severe retrosternal squeezing chest pain radiating to left jaw, profuse cold sweating",
            complaint_language="English",
            known_conditions=json.dumps(["Hypertension", "Dyslipidemia"]),
            medications="Amlodipine 5mg",
            systolic_bp=88,
            diastolic_bp=56,
            pulse_bpm=124,
            temperature=98.4,
            temperature_unit="F",
            spo2=91.0,
            status="NEEDS_HUMAN_REVIEW",
            triage_level=1,
            triage_level_name="Level 1 - Resuscitation",
            recommended_department="Casualty / Emergency",
            urgency_score=10,
            warning_signs=json.dumps(["Acute Cardiac / Chest Pain Symptom", "Hemodynamic Shock Boundary (Systolic BP < 90 mmHg)"]),
            assessment_status="SAFETY_OVERRIDE",
            review_status="UNREVIEWED",
            deterioration_flag=False,
            created_at=now,
        ),
        PatientModel(
            patient_id="UHID-2026-902",
            token_number="OPD-102",
            patient_name="Priya Sharma",
            age=29,
            gender="Female",
            arrival_time="08:30 AM",
            chief_complaint="Productive cough, wheezing, and moderate breathlessness for 3 days; known asthmatic",
            complaint_language="English",
            known_conditions=json.dumps(["Bronchial Asthma"]),
            medications="Salbutamol inhaler",
            systolic_bp=126,
            diastolic_bp=82,
            pulse_bpm=108,
            temperature=99.8,
            temperature_unit="F",
            spo2=93.5,
            status="WAITING",
            triage_level=2,
            triage_level_name="Level 2 - Emergent",
            recommended_department="Pulmonology",
            urgency_score=7,
            warning_signs=json.dumps(["Borderline Hypoxemia (SpO2 90-94%)"]),
            assessment_status="EVALUATED",
            review_status="UNREVIEWED",
            deterioration_flag=False,
            created_at=now,
        ),
        PatientModel(
            patient_id="UHID-2026-903",
            token_number="OPD-103",
            patient_name="Aarav Verma",
            age=4,
            gender="Male",
            arrival_time="08:45 AM",
            chief_complaint="High fever 102.5 F, runny nose, irritability, reduced oral intake",
            complaint_language="English",
            known_conditions=json.dumps([]),
            medications="Paracetamol syrup",
            systolic_bp=96,
            diastolic_bp=60,
            pulse_bpm=118,
            temperature=102.5,
            temperature_unit="F",
            spo2=97.0,
            status="WAITING",
            triage_level=2,
            triage_level_name="Level 2 - Emergent (Pediatric)",
            recommended_department="Pediatrics",
            urgency_score=6,
            warning_signs=json.dumps(["Pediatric High Fever"]),
            assessment_status="EVALUATED",
            review_status="REVIEWED",
            reviewed_by="Staff Nurse Anita",
            reviewed_at=now,
            review_notes="Pediatric vital check completed. Mother instructed on hydration.",
            deterioration_flag=False,
            created_at=now,
        ),
        PatientModel(
            patient_id="UHID-2026-904",
            token_number="OPD-104",
            patient_name="Sunita Devi",
            age=45,
            gender="Female",
            arrival_time="09:00 AM",
            chief_complaint="Chronic bilateral knee joint pain, stiffness in morning, routine medication refill",
            complaint_language="English",
            known_conditions=json.dumps(["Osteoarthritis"]),
            medications="Calcium, Paracetamol",
            systolic_bp=124,
            diastolic_bp=78,
            pulse_bpm=74,
            temperature=98.2,
            temperature_unit="F",
            spo2=98.5,
            status="WAITING",
            triage_level=4,
            triage_level_name="Level 4 - Less Urgent",
            recommended_department="Orthopedics",
            urgency_score=3,
            warning_signs=json.dumps([]),
            assessment_status="EVALUATED",
            review_status="UNREVIEWED",
            deterioration_flag=False,
            created_at=now,
        ),
        PatientModel(
            patient_id="UHID-2026-905",
            token_number="OPD-105",
            patient_name="Mohammad Tariq",
            age=68,
            gender="Male",
            arrival_time="09:10 AM",
            chief_complaint="Epigastric discomfort with unexplained fatigue and nausea; known diabetic for 15 years",
            complaint_language="English",
            known_conditions=json.dumps(["Type 2 Diabetes Mellitus"]),
            medications="Metformin 500mg",
            systolic_bp=146,
            diastolic_bp=92,
            pulse_bpm=96,
            temperature=98.8,
            temperature_unit="F",
            spo2=94.0,
            status="NEEDS_HUMAN_REVIEW",
            triage_level=2,
            triage_level_name="Level 2 - Emergent",
            recommended_department="General Medicine",
            urgency_score=9,
            warning_signs=json.dumps(["Elderly Diabetic Atypical Acute Presentation"]),
            assessment_status="EVALUATED",
            review_status="DETERIORATION_FLAGGED",
            deterioration_flag=True,
            deterioration_reason="Diaphoresis and dizziness worsening in waiting area. Alerted Senior Registrar.",
            created_at=now,
        ),
        PatientModel(
            patient_id="UHID-2026-906",
            token_number="OPD-106",
            patient_name="Venkat Rao",
            age=62,
            gender="Male",
            arrival_time="09:20 AM",
            chief_complaint="gunde lo noppi undi mariyu aayasam ga undi",
            complaint_language="Telugu",
            known_conditions=json.dumps(["CAD suspected"]),
            medications="",
            systolic_bp=90,
            diastolic_bp=60,
            pulse_bpm=112,
            temperature=98.6,
            temperature_unit="F",
            spo2=90.0,
            status="NEEDS_HUMAN_REVIEW",
            triage_level=1,
            triage_level_name="Level 1 - Resuscitation",
            recommended_department="Casualty / Emergency",
            urgency_score=10,
            warning_signs=json.dumps(["Acute Cardiac / Chest Pain Symptom (Telugu Translit)", "Acute Respiratory Distress Symptom"]),
            assessment_status="SAFETY_OVERRIDE",
            review_status="UNREVIEWED",
            deterioration_flag=False,
            created_at=now,
        ),
        PatientModel(
            patient_id="UHID-2026-907",
            token_number="OPD-107",
            patient_name="Lakshmi Bai",
            age=50,
            gender="Female",
            arrival_time="09:30 AM",
            chief_complaint="తీవ్రమైన కడుపు నొప్పి మరియు వాంతులు",
            complaint_language="Telugu",
            known_conditions=json.dumps([]),
            medications="",
            systolic_bp=130,
            diastolic_bp=84,
            pulse_bpm=88,
            temperature=99.0,
            temperature_unit="F",
            spo2=98.0,
            status="WAITING",
            triage_level=3,
            triage_level_name="Level 3 - Urgent",
            recommended_department="General Medicine",
            urgency_score=5,
            warning_signs=json.dumps(["Abdominal Pain & Emesis (Telugu Script)"]),
            assessment_status="EVALUATED",
            review_status="REVIEWED",
            reviewed_by="Staff Nurse Sunita",
            reviewed_at=now,
            review_notes="Oral rehydration solution provided while queuing.",
            deterioration_flag=False,
            created_at=now,
        ),
    ]

    for p in sample_records:
        db.add(p)
        db.flush()
        db.add(QueueAuditModel(
            patient_id=p.patient_id,
            previous_status=None,
            new_status=p.status,
            action_type="INTAKE_REGISTERED",
            performed_by="OPD Triage Desk",
            notes=f"Initial registration token {p.token_number} issued. Language: {p.complaint_language}",
            created_at=now,
        ))
        if p.review_status == "REVIEWED":
            db.add(QueueAuditModel(
                patient_id=p.patient_id,
                previous_status="UNREVIEWED",
                new_status="REVIEWED",
                action_type="NURSE_REVIEWED",
                performed_by=p.reviewed_by or "Staff Nurse",
                notes=p.review_notes or "Routine clinical review complete",
                created_at=now,
            ))
        elif p.deterioration_flag:
            db.add(QueueAuditModel(
                patient_id=p.patient_id,
                previous_status="WAITING",
                new_status="DETERIORATION_FLAGGED",
                action_type="DETERIORATION_FLAGGED",
                performed_by="Bedside Triage Nurse",
                notes=p.deterioration_reason,
                created_at=now,
            ))
    db.commit()


def queue_clinical_sort_key(patient: PatientModel):
    """
    Approved Clinical Prioritization Sorting Key:
    - Tier 0: Deterioration flagged (top immediate attention)
    - Tier 1: Level 1 Resuscitation / Immediate Casualty / Safety Override
    - Tier 2: Level 2 Emergent or Abstention holds / Needs Human Review
    - Tier 3: Level 3 Urgent
    - Tier 4: Level 4 Less Urgent
    - Tier 5: Level 5 Non-Urgent
    - Tier 6: Unassessed / Pending
    Within each acuity tier: sort by waiting time (earliest created_at first).
    """
    if patient.deterioration_flag:
        tier = 0
    elif patient.triage_level == 1 or patient.assessment_status == "SAFETY_OVERRIDE":
        tier = 1
    elif patient.triage_level == 2 or patient.status == "NEEDS_HUMAN_REVIEW" or "HOLD" in (patient.assessment_status or ""):
        tier = 2
    elif patient.triage_level == 3:
        tier = 3
    elif patient.triage_level == 4:
        tier = 4
    elif patient.triage_level == 5:
        tier = 5
    else:
        tier = 6

    created_ts = patient.created_at.timestamp() if patient.created_at else 0
    return (tier, -patient.urgency_score, created_ts)


def map_patient_to_queue_item(p: PatientModel) -> SavedPatientQueueItem:
    """Helper to convert PatientModel database entity to SavedPatientQueueItem."""
    try:
        conds = json.loads(p.known_conditions) if p.known_conditions else []
    except Exception:
        conds = []

    try:
        warnings = json.loads(p.warning_signs) if p.warning_signs else []
    except Exception:
        warnings = []

    now = utc_now()
    p_created = p.created_at if p.created_at.tzinfo else p.created_at.replace(tzinfo=timezone.utc)
    waiting_mins = max(0, int((now - p_created).total_seconds() / 60))

    is_critical = bool(
        p.triage_level == 1
        or p.deterioration_flag
        or p.assessment_status == "SAFETY_OVERRIDE"
        or any("CRIT" in str(w).upper() or "CARDIAC" in str(w).upper() for w in warnings)
    )

    is_syn = bool(
        getattr(p, "is_synthetic", False)
        or (p.patient_id and (p.patient_id.startswith("UHID-2026-9") or p.patient_id.startswith("DEMO-") or p.patient_id.startswith("SYN-")))
    )

    return SavedPatientQueueItem(
        id=p.id,
        patient_id=p.patient_id,
        token_number=p.token_number,
        patient_name=p.patient_name,
        age=p.age,
        gender=p.gender,
        arrival_time=p.arrival_time,
        chief_complaint=p.chief_complaint,
        complaint_language=p.complaint_language,
        known_conditions=conds,
        medications=p.medications,
        systolic_bp=p.systolic_bp,
        diastolic_bp=p.diastolic_bp,
        pulse_bpm=p.pulse_bpm,
        temperature=p.temperature,
        temperature_unit=p.temperature_unit or "F",
        spo2=p.spo2,
        triage_level=p.triage_level,
        triage_level_name=p.triage_level_name or ("Pending Assessment" if not p.triage_level else f"Level {p.triage_level}"),
        recommended_department=p.recommended_department or "General Medicine",
        urgency_score=p.urgency_score or 3,
        warning_signs=warnings,
        assessment_status=p.assessment_status or "PENDING_ASSESSMENT",
        review_status=p.review_status or "UNREVIEWED",
        reviewed_by=p.reviewed_by,
        reviewed_at=p.reviewed_at,
        review_notes=p.review_notes,
        deterioration_flag=p.deterioration_flag,
        deterioration_reason=p.deterioration_reason,
        last_reassessed_at=p.last_reassessed_at,
        status=p.status,
        waiting_minutes=waiting_mins,
        is_critical_escalation=is_critical,
        is_synthetic=is_syn,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.get(
    "/queue",
    response_model=List[SavedPatientQueueItem],
    summary="Retrieve persistent prioritized OPD triage queue from database",
)
def get_saved_patient_queue(
    triage_level: Optional[int] = Query(None, ge=1, le=5, description="Filter by triage level (1-5)"),
    category: Optional[str] = Query(None, description="Filter by category (EMERGENCY, PRIORITY, ROUTINE)"),
    review_status: Optional[str] = Query(None, description="Filter by review status (UNREVIEWED, REVIEWED, DETERIORATION_FLAGGED)"),
    status: Optional[str] = Query(None, description="Filter by patient queue status (WAITING, WITH_DOCTOR, NEEDS_HUMAN_REVIEW, COMPLETED)"),
    department: Optional[str] = Query(None, description="Filter by recommended department"),
    search: Optional[str] = Query(None, description="Search by demo patient ID, name, token, or complaint"),
    today_only: Optional[bool] = Query(False, description="Filter patients registered within today's local hospital date"),
    db: Session = Depends(get_db),
) -> List[SavedPatientQueueItem]:
    """
    Retrieves the clinical patient queue persisted in the database.
    Applies the approved clinical escalation policy:
    1. Critical escalation & deteriorating cases prominently prioritized at top.
    2. Emergent & holding cases needing human review preserved (never lost).
    3. Routine cases ordered secondarily by waiting time.
    """
    seed_saved_patients(db)
    query = db.query(PatientModel)

    if triage_level is not None:
        query = query.filter(PatientModel.triage_level == triage_level)

    if category:
        cat_upper = category.strip().upper()
        if cat_upper == "EMERGENCY":
            query = query.filter(PatientModel.triage_level == 1)
        elif cat_upper == "PRIORITY":
            query = query.filter(PatientModel.triage_level == 2)
        elif cat_upper == "ROUTINE":
            query = query.filter((PatientModel.triage_level >= 3) | (PatientModel.triage_level.is_(None)))

    if review_status:
        query = query.filter(PatientModel.review_status == review_status.strip().upper())

    if status:
        query = query.filter(PatientModel.status == status.strip().upper())

    if department:
        query = query.filter(PatientModel.recommended_department.ilike(f"%{department.strip()}%"))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (PatientModel.patient_id.ilike(term))
            | (PatientModel.token_number.ilike(term))
            | (PatientModel.patient_name.ilike(term))
            | (PatientModel.chief_complaint.ilike(term))
        )

    records = query.all()

    if today_only:
        tz_str, start_utc, end_utc = get_hospital_today_boundaries()
        records = [r for r in records if is_timestamp_in_hospital_today(r.created_at, start_utc, end_utc)]

    # Sort according to approved clinical triage escalation policy
    sorted_records = sorted(records, key=queue_clinical_sort_key)
    return [map_patient_to_queue_item(r) for r in sorted_records]


@router.post(
    "/queue/{patient_id}/review",
    response_model=SavedPatientQueueItem,
    summary="Mark an assessment as reviewed by clinical nurse with audit logging",
)
def mark_patient_reviewed(
    patient_id: str,
    payload: QueueReviewRequest,
    current_staff: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
) -> SavedPatientQueueItem:
    """Records nurse review status, timestamp, and review notes with persistent audit trail."""
    record = (
        db.query(PatientModel)
        .filter((PatientModel.patient_id == patient_id) | (PatientModel.id == patient_id))
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient with ID '{patient_id}' not found in queue.",
        )

    prev_review_status = record.review_status or "UNREVIEWED"
    record.review_status = "REVIEWED"
    record.reviewed_by = payload.reviewed_by
    record.reviewed_at = utc_now()
    record.review_notes = payload.review_notes
    record.updated_at = utc_now()

    # If patient had no critical deterioration, clear the NEEDS_HUMAN_REVIEW blocking hold
    if record.status == "NEEDS_HUMAN_REVIEW" and not record.deterioration_flag and record.triage_level != 1:
        record.status = "WAITING"

    db.commit()
    db.refresh(record)

    # Persist audit trail log
    audit_entry = QueueAuditModel(
        patient_id=record.patient_id,
        previous_status=prev_review_status,
        new_status="REVIEWED",
        action_type="NURSE_REVIEWED",
        performed_by=payload.reviewed_by,
        notes=payload.review_notes or "Assessment reviewed and verified by staff nurse.",
        created_at=utc_now(),
    )
    db.add(audit_entry)
    db.commit()

    return map_patient_to_queue_item(record)


@router.post(
    "/queue/{patient_id}/deterioration",
    response_model=SavedPatientQueueItem,
    summary="Flag acute patient deterioration or request urgent reassessment",
)
def flag_patient_deterioration(
    patient_id: str,
    payload: DeteriorationReportRequest,
    current_staff: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
) -> SavedPatientQueueItem:
    """
    Clinical Safety Mechanism:
    Allows staff to flag physiological deterioration or acute symptom onset.
    Immediately elevates patient to top priority tier and marks status as NEEDS_HUMAN_REVIEW.
    """
    record = (
        db.query(PatientModel)
        .filter((PatientModel.patient_id == patient_id) | (PatientModel.id == patient_id))
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found in queue.",
        )

    prev_status = record.review_status or "UNREVIEWED"
    record.deterioration_flag = True
    record.deterioration_reason = payload.reason
    record.review_status = "DETERIORATION_FLAGGED"
    record.status = "NEEDS_HUMAN_REVIEW"
    record.urgency_score = 10
    record.updated_at = utc_now()

    db.commit()
    db.refresh(record)

    # Audit trail
    db.add(QueueAuditModel(
        patient_id=record.patient_id,
        previous_status=prev_status,
        new_status="DETERIORATION_FLAGGED",
        action_type="DETERIORATION_FLAGGED",
        performed_by=payload.flagged_by,
        notes=f"Deterioration reported: {payload.reason} | {payload.notes or ''}",
        created_at=utc_now(),
    ))
    db.commit()

    return map_patient_to_queue_item(record)


@router.post(
    "/queue/{patient_id}/reassess",
    response_model=SavedPatientQueueItem,
    summary="Re-evaluate triage assessment with updated vitals or clinical findings",
)
def reassess_patient_queue(
    patient_id: str,
    payload: ReassessmentRequest,
    current_staff: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
) -> SavedPatientQueueItem:
    """
    Re-evaluates patient using updated vital measurements through the ML and safety engine.
    Persists updated acuity level and records reassessment audit entry.
    """
    record = (
        db.query(PatientModel)
        .filter((PatientModel.patient_id == patient_id) | (PatientModel.id == patient_id))
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    # Update vitals if supplied
    if payload.updated_pulse is not None:
        record.pulse_bpm = payload.updated_pulse
    if payload.updated_spo2 is not None:
        record.spo2 = payload.updated_spo2
    if payload.updated_systolic_bp is not None:
        record.systolic_bp = payload.updated_systolic_bp
    if payload.updated_diastolic_bp is not None:
        record.diastolic_bp = payload.updated_diastolic_bp
    if payload.updated_temperature is not None:
        record.temperature = payload.updated_temperature

    try:
        conds = json.loads(record.known_conditions) if record.known_conditions else []
    except Exception:
        conds = []

    # Run inference engine
    eval_result = inference_service.assess(
        age=record.age,
        gender=record.gender,
        chief_complaint=record.chief_complaint,
        complaint_language=record.complaint_language,
        known_conditions=conds,
        systolic_bp=record.systolic_bp,
        diastolic_bp=record.diastolic_bp,
        pulse_bpm=record.pulse_bpm,
        temperature=record.temperature,
        temperature_unit=record.temperature_unit or "F",
        spo2=record.spo2,
        notes=record.notes,
    )

    old_triage = record.triage_level
    record.triage_level = eval_result["triage_level"]
    record.triage_level_name = eval_result["triage_level_name"]
    record.recommended_department = eval_result["recommended_department"]
    record.warning_signs = json.dumps(eval_result["detected_red_flags"])
    record.assessment_status = eval_result["abstention_status"]
    record.urgency_score = 10 if eval_result["triage_level"] == 1 else (7 if eval_result["triage_level"] == 2 else 4)
    record.last_reassessed_at = utc_now()
    record.updated_at = utc_now()

    db.commit()
    db.refresh(record)

    db.add(QueueAuditModel(
        patient_id=record.patient_id,
        previous_status=f"Level {old_triage}",
        new_status=f"Level {eval_result['triage_level']}",
        action_type="REASSESSMENT_REQUESTED",
        performed_by=payload.requested_by,
        notes=f"Reassessment complete: {eval_result['model_explanation']}. Notes: {payload.notes or ''}",
        created_at=utc_now(),
    ))
    db.commit()

    return map_patient_to_queue_item(record)


@router.get(
    "/queue/{patient_id}/audit",
    response_model=List[QueueAuditItemResponse],
    summary="Retrieve audit trail for a patient queue record",
)
def get_patient_queue_audit(
    patient_id: str,
    db: Session = Depends(get_db),
) -> List[QueueAuditItemResponse]:
    """Returns chronological audit trail of all review events, deterioration flags, and status changes."""
    logs = (
        db.query(QueueAuditModel)
        .filter(QueueAuditModel.patient_id == patient_id)
        .order_by(QueueAuditModel.created_at.desc())
        .all()
    )
    return [
        QueueAuditItemResponse(
            id=l.id,
            patient_id=l.patient_id,
            previous_status=l.previous_status,
            new_status=l.new_status,
            action_type=l.action_type,
            performed_by=l.performed_by,
            notes=l.notes,
            created_at=l.created_at,
        )
        for l in logs
    ]


# ============================================================================
# Model Evaluation & Benchmark Endpoints
# ============================================================================

@router.get(
    "/model/evaluation",
    summary="Retrieve genuine ML model evaluation metrics across training, validation, and test splits",
)
def get_model_evaluation(artifacts_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    Returns authentic evaluation metrics produced by the ML pipeline.
    Never reports fabricated metrics. If artifacts are missing, returns an explicit empty state.
    """
    target_dir = artifacts_dir or DEFAULT_ARTIFACTS_DIR
    metadata_path = os.path.join(target_dir, "metadata.json")

    if not os.path.exists(metadata_path):
        return {
            "available": False,
            "reason": "Evaluation artifacts not found. Model has not been trained or metadata is missing.",
            "supports_job_execution": True,
            "disclaimer": "No evaluation metrics available. Train the pipeline to produce genuine test metrics.",
        }

    try:
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read evaluation metadata artifact: {str(e)}",
        )

    # Format response cleanly separating splits
    splits = metadata.get("splits", {})
    eval_metrics = metadata.get("evaluation_metrics", {})
    triage_test = eval_metrics.get("triage", {})

    # Calculate emergency precision if missing
    emerg_prec = triage_test.get("emergency_precision")
    if emerg_prec is None:
        p_class = triage_test.get("per_class_metrics", {}).get("1", {})
        emerg_prec = p_class.get("precision", 0.0)

    # Official weighted score
    official_score = triage_test.get("official_weighted_score")
    if not official_score:
        raw = 0.50 * triage_test.get("emergency_recall_sensitivity", 0) + 0.30 * triage_test.get("f1_macro", 0) + 0.20 * triage_test.get("accuracy", 0)
        fn_pen = min(0.30, triage_test.get("emergency_false_negatives", 0) * 0.10)
        official_score = {
            "score": round(max(0.0, raw - fn_pen), 4),
            "raw_weighted_score": round(raw, 4),
            "formula": "0.50 * Emergency_Recall + 0.30 * Macro_F1 + 0.20 * Accuracy - (0.10 * Emergency_False_Negatives)",
            "weights": {
                "emergency_recall": 0.50,
                "macro_f1": 0.30,
                "accuracy": 0.20,
                "emergency_fn_penalty_per_case": 0.10,
            },
            "description": "Official clinical evaluation score prioritizing zero emergency false negatives.",
        }

    return {
        "available": True,
        "model_version": metadata.get("model_version", "2026.1-triage-ml-v1"),
        "dataset_version": metadata.get("data_source", "Prototype Dataset"),
        "created_at": metadata.get("created_at"),
        "is_synthetic_training": metadata.get("is_synthetic_training", True),
        "triage_classifier_type": metadata.get("triage_classifier_type", "GradientBoosting"),
        "department_supported": metadata.get("department_supported", False),
        "emergency_flag_supported": metadata.get("emergency_flag_supported", False),
        "supports_job_execution": True,
        "sample_counts": {
            "total": metadata.get("training_samples_total", 0),
            "training": metadata.get("train_samples", 0),
            "validation": metadata.get("val_samples", 0),
            "test": metadata.get("test_samples", 0),
        },
        "splits": splits,
        "evaluation_metrics": eval_metrics,
        "emergency_metrics": {
            "emergency_recall": triage_test.get("emergency_recall_sensitivity"),
            "emergency_precision": emerg_prec,
            "emergency_false_negatives": triage_test.get("emergency_false_negatives", 0),
            "emergency_cases_total": triage_test.get("emergency_cases_total", 0),
            "emergency_recall_numerator": triage_test.get("emergency_recall_numerator", 0),
            "emergency_recall_denominator": triage_test.get("emergency_recall_denominator", 0),
            "emergency_recall_display": triage_test.get("emergency_recall_display", "0/0 (N/A)"),
            "is_emergency_set_empty": triage_test.get("is_emergency_set_empty", False),
        },
        "asymmetric_clinical_cost": triage_test.get("asymmetric_clinical_cost", {}),
        "abstention_metrics": triage_test.get("abstention_metrics", {}),
        "split_integrity": metadata.get("split_integrity", {}),
        "dataset_distribution": metadata.get("dataset_distribution", {}),
        "official_weighted_score": official_score,
        "clinical_safety_notice": (
            "CRITICAL CLINICAL SAFETY PRINCIPLE: High overall accuracy (e.g. 96%) can dangerously "
            "conceal missed emergencies (false negatives). In clinical triage, emergency sensitivity "
            "and zero false negatives are vastly more critical than overall percentage accuracy."
        ),
        "disclaimer": metadata.get(
            "disclaimer",
            "This model is evaluated on prototype records for decision support demonstration only."
        ),
    }


@router.post(
    "/model/evaluate",
    summary="Trigger model training and evaluation job to produce fresh genuine evaluation metrics",
)
def run_model_evaluation_job(
    payload: Optional[RunEvaluationRequest] = None,
) -> Dict[str, Any]:
    """
    Executes the training and evaluation pipeline, generating authentic multi-split metrics.
    Ensures preprocessor and model are fitted strictly on train data without test leakage.
    """
    req = payload or RunEvaluationRequest()
    try:
        metadata = train_pipeline(
            data_path=None,  # Uses reproducible synthetic fixture if no data path provided
            output_dir=DEFAULT_ARTIFACTS_DIR,
            use_xgboost=req.use_xgboost,
            random_seed=req.random_seed,
            synthetic_samples=req.synthetic_samples,
        )
        return {
            "success": True,
            "message": "Model training and evaluation job completed successfully.",
            "evaluation": get_model_evaluation(),
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model evaluation job failed: {str(e)}",
        )


# ============================================================================
# Queue Simulation Endpoints (FCFS vs Triage-Assisted)
# ============================================================================

@router.get(
    "/simulation/arrival-log-status",
    response_model=ArrivalLogStatusResponse,
    summary="Check availability of official patient arrival log and report limitations",
)
def get_arrival_log_status(
    db: Session = Depends(get_db),
) -> ArrivalLogStatusResponse:
    """
    Checks for the presence of the provided patient arrival log.
    If the official log is missing, reports that limitation explicitly.
    Also returns the count of intake records available in the system database.
    """
    official_check = check_official_arrival_log()
    db_count = db.query(PatientModel).count()
    return ArrivalLogStatusResponse(
        official_log_available=official_check["official_log_available"],
        official_log_filename=official_check["file_path"],
        limitation_statement=(
            official_check["limitation_statement"]
            if not official_check["official_log_available"]
            else "Official arrival log detected and ready for evaluation."
        ),
        database_records_count=db_count,
        synthetic_demo_available=True,
    )


@router.get(
    "/simulation/database-arrivals",
    summary="Extract patient arrival records from system SQLite database for simulation",
)
def get_database_arrivals(
    limit: int = Query(default=50, ge=1, le=200),
) -> List[Dict[str, Any]]:
    """Returns patient arrival sequence extracted from the hospital SQLite intake records."""
    arrivals = load_database_arrivals(limit=limit)
    return [
        {
            "patient_id": a.patient_id,
            "arrival_minute": a.arrival_minute,
            "arrival_time_str": a.arrival_time_str,
            "chief_complaint": a.chief_complaint,
            "triage_level": a.triage_level,
            "urgency_category": a.urgency_category,
            "service_time_minutes": a.service_time_minutes,
            "target_wait_minutes": a.target_wait_minutes,
            "is_escalated": a.is_escalated,
        }
        for a in arrivals
    ]


@router.get(
    "/simulation/demo-arrivals",
    summary="Fetch reproducible demonstration patient arrival log for queue simulation",
)
def get_demo_arrivals(
    n_patients: int = Query(default=50, ge=0, le=200),
    random_seed: int = Query(default=42, ge=0),
) -> List[Dict[str, Any]]:
    """Returns clearly labelled synthetic demonstration arrival log."""
    arrivals = generate_synthetic_arrivals(n_patients=n_patients, random_seed=random_seed)
    return [
        {
            "patient_id": a.patient_id,
            "arrival_minute": a.arrival_minute,
            "arrival_time_str": a.arrival_time_str,
            "chief_complaint": a.chief_complaint,
            "triage_level": a.triage_level,
            "urgency_category": a.urgency_category,
            "service_time_minutes": a.service_time_minutes,
            "target_wait_minutes": a.target_wait_minutes,
            "is_escalated": a.is_escalated,
        }
        for a in arrivals
    ]


@router.post(
    "/simulation/run",
    summary="Run comparative simulation of FCFS vs Triage-Assisted OPD queue scheduling",
)
def run_simulation(
    payload: SimulationRequest,
) -> Dict[str, Any]:
    """
    Executes discrete-event queue simulation comparing baseline FCFS against Triage-assisted policy.
    Uses identical arrival sequence, service times, and staffing assumptions for fair, reproducible comparison.
    """
    try:
        n_pts = payload.num_patients if payload.num_patients is not None else payload.n_patients
        ds_source = payload.dataset_source or ("custom" if payload.custom_arrivals else "synthetic")

        if ds_source == "official":
            official_check = check_official_arrival_log()
            if not official_check["official_log_available"]:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=official_check["limitation_statement"],
                )

        result = run_comparative_simulation(
            n_patients=n_pts,
            num_doctors=payload.num_doctors,
            random_seed=payload.random_seed,
            service_time_emergency=payload.service_time_emergency,
            service_time_priority=payload.service_time_priority,
            service_time_routine=payload.service_time_routine,
            starvation_reassessment_threshold=payload.starvation_reassessment_threshold,
            emergency_proportion=payload.emergency_proportion,
            scenario_duration_minutes=payload.scenario_duration_minutes or 240,
            avg_service_duration=payload.avg_service_duration,
            custom_arrivals=payload.custom_arrivals,
            dataset_source=ds_source,
            doctor_break_minutes=payload.doctor_break_minutes or 0,
            doctor_break_interval_minutes=payload.doctor_break_interval_minutes or 240,
        )
        return result
    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Simulation failed: {str(e)}",
        )


# ==============================================================================
# Feature 2, 3, 4, 5, 6: Emergency Accident Intake & Rapid Triage Endpoints
# ==============================================================================

def generate_unique_emergency_case_id(db: Session) -> str:
    """Safely generates a collision-free emergency case ID (EMG-YYYYMMDD-XXXX)."""
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    for _ in range(20):
        suffix = random.randint(1000, 9999)
        candidate_id = f"EMG-{today_str}-{suffix}"
        exists = db.query(EmergencyCaseModel).filter(EmergencyCaseModel.case_id == candidate_id).first()
        if not exists:
            return candidate_id
    # Fallback to UUID prefix if random integers saturated
    return f"EMG-{today_str}-{uuid.uuid4().hex[:4].upper()}"


def get_emergency_protocol_instructions(case: EmergencyCaseModel) -> List[str]:
    """Provides standard hospital-approved emergency response protocol instructions."""
    instructions = [
        "1. IMMEDIATE BAY ACTIVATION: Direct patient straight to designated Red Resuscitation Bay. Zero registration delay.",
        "2. STAT TRAUMA NOTIFICATION: Alert Casualty Medical Officer (CMO), Trauma Surgeon on call, and Anesthesiologist.",
        "3. AIRWAY & CERVICAL SPINE: Maintain in-line cervical stabilization. Prepare suction and rapid-sequence intubation (RSI) kit if airway compromised or GCS <= 8.",
        "4. BREATHING & OXYGENATION: Administer 100% high-flow oxygen via non-rebreather mask (15 L/min). Auscultate bilateral breath sounds immediately.",
        "5. CIRCULATION & SHOCK: Secure dual large-bore IV lines (14G or 16G). Infuse warm balanced crystalloid. Send STAT Type & Crossmatch for 4 units PRBC.",
        "6. BEDISDE ULTRASOUND: Perform immediate eFAST scan to rule out hemoperitoneum, hemothorax, and cardiac tamponade.",
        "7. CONTINUOUS MONITORING: Maintain 3-lead ECG, pulse oximetry, continuous NIBP, and core temperature monitoring.",
    ]
    if case.accident_type == "ROAD_TRAFFIC_ACCIDENT":
        instructions.append("8. POLYTRAUMA PROTOCOL: Log-roll with 4 providers to inspect spine; place pelvic binder if pelvic instability suspected.")
    elif case.accident_type == "BURN":
        instructions.append("8. BURN RESUSCITATION: Calculate TBSA % using Rule of Nines; commence Parkland fluid resuscitation formula.")
    elif case.accident_type == "FALL":
        instructions.append("8. FALL INJURY PROTOCOL: Examine for calcaneal, vertebral, and retroperitoneal deceleration injuries.")
    return instructions


def map_emergency_case_to_response(c: EmergencyCaseModel) -> EmergencyCaseResponse:
    """Maps an EmergencyCaseModel instance to its API response schema."""
    now = utc_now()
    arr_dt = c.arrival_datetime or c.created_at or now
    if arr_dt.tzinfo is None:
        arr_dt = arr_dt.replace(tzinfo=timezone.utc)
    elapsed = max(0, int((now - arr_dt).total_seconds() / 60))

    try:
        flags = json.loads(c.red_flags) if c.red_flags else []
    except Exception:
        flags = []

    return EmergencyCaseResponse(
        id=c.id,
        case_id=c.case_id,
        patient_identity_status=c.patient_identity_status,
        patient_name=c.patient_name,
        approximate_age=c.approximate_age,
        gender=c.gender,
        accident_type=c.accident_type,
        mechanism_of_injury=c.mechanism_of_injury,
        arrival_time=c.arrival_time,
        arrival_datetime=c.arrival_datetime,
        elapsed_minutes=elapsed,
        airway_status=c.airway_status,
        breathing_status=c.breathing_status,
        circulation_status=c.circulation_status,
        neurological_status=c.neurological_status,
        major_bleeding=c.major_bleeding,
        pulse_bpm=c.pulse_bpm,
        systolic_bp=c.systolic_bp,
        diastolic_bp=c.diastolic_bp,
        respiratory_rate=c.respiratory_rate,
        spo2=c.spo2,
        temperature_f=c.temperature_f,
        gcs_score=c.gcs_score,
        red_flags=flags,
        escalation_reason=c.escalation_reason,
        triage_category=c.triage_category,
        urgency_level=c.urgency_level,
        immediate_actions_taken=c.immediate_actions_taken,
        status=c.status,
        activated_by=c.activated_by,
        activated_at=c.activated_at,
        assigned_resuscitation_bay=c.assigned_resuscitation_bay,
        reassessment_status=c.reassessment_status,
        reassessed_at=c.reassessed_at,
        is_synthetic=c.is_synthetic,
        created_at=c.created_at,
        updated_at=c.updated_at,
        hospital_protocol_instructions=get_emergency_protocol_instructions(c),
    )


def seed_emergency_cases(db: Session):
    """Seed initial realistic synthetic trauma demonstration cases for hospital dashboard."""
    if db.query(EmergencyCaseModel).count() > 0:
        return

    now = utc_now()
    demo_cases = [
        EmergencyCaseModel(
            case_id="EMG-20261011-9101",
            patient_identity_status="UNKNOWN",
            patient_name="Unidentified Male (~28 Yrs)",
            approximate_age=28,
            gender="Male",
            accident_type="ROAD_TRAFFIC_ACCIDENT",
            mechanism_of_injury="Pedestrian struck by heavy commercial bus; thrown 5 meters onto road divider",
            arrival_time="10:45 AM",
            arrival_datetime=now,
            airway_status="Threatened / Gurgling",
            breathing_status="Severe Tachypnea (RR 32)",
            circulation_status="Weak Thready Radial Pulse",
            neurological_status="Pain Only (P)",
            major_bleeding="Massive Scalp Laceration (Active Arterial Bleed)",
            pulse_bpm=138,
            systolic_bp=78,
            diastolic_bp=48,
            respiratory_rate=32,
            spo2=86.0,
            temperature_f=96.4,
            gcs_score=7,
            red_flags=json.dumps([
                "Major Road Traffic Accident with Polytrauma",
                "Massive Uncontrolled Scalp Hemorrhage",
                "Severe Hypoxia (SpO2 86% on Room Air)",
                "Profound Hemorrhagic Shock (BP 78/48 mmHg)",
                "Depressed Consciousness (GCS 7 / Unresponsive to Voice)",
            ]),
            escalation_reason="Severe polytrauma with hemorrhagic shock, compromised airway, and altered sensorium",
            triage_category="LEVEL_1_RESUSCITATION",
            urgency_level="Level 1 - Immediate Resuscitation",
            immediate_actions_taken="Rigid cervical collar applied; compressive head bandage wrapped; 15L high-flow O2 attached; 2x 16G cannulas inserted",
            status="RESPONSE_ACTIVATED",
            activated_by="Dr. S. Kulkarni (Casualty Medical Officer)",
            activated_at=now,
            assigned_resuscitation_bay="Red Trauma Bay 01",
            reassessment_status="PRIMARY_SURVEY_IN_PROGRESS",
            is_synthetic=True,
            created_at=now,
            updated_at=now,
        ),
        EmergencyCaseModel(
            case_id="EMG-20261011-9102",
            patient_identity_status="KNOWN",
            patient_name="Sunil Verma",
            approximate_age=44,
            gender="Male",
            accident_type="FALL",
            mechanism_of_injury="Fall from 2nd floor construction scaffolding (~22 ft) onto concrete and metal rebars",
            arrival_time="11:10 AM",
            arrival_datetime=now,
            airway_status="Intact",
            breathing_status="Dyspnea with Right Chest Pain",
            circulation_status="Tachycardic / Full Pulses",
            neurological_status="Alert & Oriented (A)",
            major_bleeding="Controlled Extremity Deformity",
            pulse_bpm=116,
            systolic_bp=104,
            diastolic_bp=68,
            respiratory_rate=26,
            spo2=92.0,
            temperature_f=98.4,
            gcs_score=14,
            red_flags=json.dumps([
                "High-Energy Fall > 20 Feet",
                "Suspected Pelvic / Flail Chest Injury",
                "Open Right Femur Fracture with Deformity",
            ]),
            escalation_reason="High-energy fall with open long-bone fracture and respiratory distress",
            triage_category="LEVEL_1_RESUSCITATION",
            urgency_level="Level 1 - Immediate Resuscitation",
            immediate_actions_taken="Lower limb Thomas splint applied; IV analgesia given; warm Normal Saline 1000ml running",
            status="INITIAL_ASSESSMENT",
            activated_by="Staff Nurse Thomas",
            activated_at=now,
            assigned_resuscitation_bay="Red Trauma Bay 02",
            reassessment_status="PENDING_PORTABLE_XR",
            is_synthetic=True,
            created_at=now,
            updated_at=now,
        ),
    ]

    for c in demo_cases:
        db.add(c)
        db.add(
            EmergencyAuditModel(
                case_id=c.case_id,
                previous_status=None,
                new_status=c.status,
                action_type="EMERGENCY_ACTIVATED",
                performed_by=c.activated_by,
                notes=f"Emergency Response activated for {c.accident_type}: {c.escalation_reason}",
                created_at=now,
            )
        )
    db.commit()


@router.post(
    "/emergency/intake",
    response_model=EmergencyCaseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Rapid Emergency Accident Intake & Immediate Level 1 Response Activation",
)
def create_emergency_case(
    payload: EmergencyIntakeRequest,
    db: Session = Depends(get_db),
) -> EmergencyCaseResponse:
    """
    Rapid Emergency Accident Intake Workflow:
    - Creates or updates an emergency case immediately without administrative delays.
    - Permits unknown or unverified patient identity.
    - Idempotent: Client can supply `case_id`; retrying with the same ID returns the existing case safely without creating duplicates.
    - Does NOT require completion of optional fields.
    - Immediately activates Level 1 emergency response and logs an audit trail.
    """
    # 1. Check for client-supplied case_id for idempotent retry
    if payload.case_id and payload.case_id.strip():
        existing = db.query(EmergencyCaseModel).filter(
            EmergencyCaseModel.case_id == payload.case_id.strip()
        ).first()
        if existing:
            # Idempotent response: return existing case without duplicate creation
            return map_emergency_case_to_response(existing)
        case_id = payload.case_id.strip()
    else:
        case_id = generate_unique_emergency_case_id(db)

    now = utc_now()
    arrival_time_str = payload.arrival_time or now.strftime("%I:%M %p")

    # Determine clinician-assigned category based on observations or default to Level 1
    triage_category = "LEVEL_1_RESUSCITATION"
    urgency_level = "Level 1 - Immediate Resuscitation"

    # Red flag compilation
    red_flags = list(payload.red_flags)
    if payload.pulse_bpm is not None and (payload.pulse_bpm == 0 or payload.pulse_bpm > 130 or payload.pulse_bpm < 40):
        red_flags.append(f"Abnormal Pulse ({payload.pulse_bpm} bpm)")
    if payload.spo2 is not None and payload.spo2 < 90:
        red_flags.append(f"Severe Hypoxemia (SpO2 {payload.spo2}%)")
    if payload.systolic_bp is not None and payload.systolic_bp < 90:
        red_flags.append(f"Hypotensive Shock (SBP {payload.systolic_bp} mmHg)")
    if payload.gcs_score is not None and payload.gcs_score <= 8:
        red_flags.append(f"Severe Coma (GCS {payload.gcs_score}/15)")

    new_case = EmergencyCaseModel(
        case_id=case_id,
        patient_identity_status=payload.patient_identity_status.value if hasattr(payload.patient_identity_status, "value") else str(payload.patient_identity_status),
        patient_name=payload.patient_name.strip() if payload.patient_name else None,
        approximate_age=payload.approximate_age,
        gender=payload.gender or "Unknown",
        accident_type=payload.accident_type.value if hasattr(payload.accident_type, "value") else str(payload.accident_type),
        mechanism_of_injury=payload.mechanism_of_injury,
        arrival_time=arrival_time_str,
        arrival_datetime=now,
        airway_status=payload.airway_status or "Intact",
        breathing_status=payload.breathing_status or "Normal",
        circulation_status=payload.circulation_status or "Palpable",
        neurological_status=payload.neurological_status or "Alert",
        major_bleeding=payload.major_bleeding or "None",
        pulse_bpm=payload.pulse_bpm,
        systolic_bp=payload.systolic_bp,
        diastolic_bp=payload.diastolic_bp,
        respiratory_rate=payload.respiratory_rate,
        spo2=payload.spo2,
        temperature_f=payload.temperature_f,
        gcs_score=payload.gcs_score,
        red_flags=json.dumps(red_flags),
        escalation_reason=payload.escalation_reason or f"Acute {payload.accident_type} trauma intake activated",
        triage_category=triage_category,
        urgency_level=urgency_level,
        immediate_actions_taken=payload.immediate_actions_taken,
        status="RESPONSE_ACTIVATED",
        activated_by=payload.activated_by or "Emergency Staff",
        activated_at=now,
        assigned_resuscitation_bay=payload.assigned_resuscitation_bay or "Red Trauma Bay 01",
        reassessment_status="PENDING_PRIMARY_SURVEY",
        is_synthetic=True,
        created_at=now,
        updated_at=now,
    )

    try:
        db.add(new_case)
        db.commit()
        db.refresh(new_case)

        # Record persistent audit trail event
        audit_entry = EmergencyAuditModel(
            case_id=new_case.case_id,
            previous_status=None,
            new_status="RESPONSE_ACTIVATED",
            action_type="EMERGENCY_ACTIVATED",
            performed_by=new_case.activated_by,
            notes=f"Emergency Response activated for {new_case.accident_type}. Bay: {new_case.assigned_resuscitation_bay}",
            created_at=now,
        )
        db.add(audit_entry)
        db.commit()
    except Exception as e:
        db.rollback()
        # If case was concurrently created with same case_id, return existing case safely
        existing = db.query(EmergencyCaseModel).filter(
            EmergencyCaseModel.case_id == case_id
        ).first()
        if existing:
            return map_emergency_case_to_response(existing)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database failure while recording emergency intake: {str(e)}",
        )

    return map_emergency_case_to_response(new_case)


@router.get(
    "/emergency/cases",
    response_model=List[EmergencyCaseResponse],
    summary="Retrieve Active Emergency Accident Cases in Dedicated Queue",
)
def get_emergency_cases(
    status: Optional[str] = Query(None, description="Filter by case status"),
    accident_type: Optional[str] = Query(None, description="Filter by accident type"),
    search: Optional[str] = Query(None, description="Search by case ID, patient name, or mechanism"),
    include_completed: bool = Query(False, description="Whether to include completed/transferred cases"),
    db: Session = Depends(get_db),
) -> List[EmergencyCaseResponse]:
    """
    Returns prioritized emergency cases from dedicated trauma queue.
    Ensures emergency cases are tracked completely separately from routine OPD queue.
    """
    seed_emergency_cases(db)
    query = db.query(EmergencyCaseModel)

    if not include_completed:
        query = query.filter(EmergencyCaseModel.status.notin_(["COMPLETED", "TRANSFERRED", "ADMITTED"]))

    if status and status.strip():
        query = query.filter(EmergencyCaseModel.status == status.strip().upper())

    if accident_type and accident_type.strip():
        query = query.filter(EmergencyCaseModel.accident_type == accident_type.strip().upper())

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (EmergencyCaseModel.case_id.ilike(term))
            | (EmergencyCaseModel.patient_name.ilike(term))
            | (EmergencyCaseModel.mechanism_of_injury.ilike(term))
        )

    # Order by activation time descending (newest arrivals first)
    cases = query.order_by(EmergencyCaseModel.created_at.desc()).all()
    return [map_emergency_case_to_response(c) for c in cases]


@router.get(
    "/emergency/cases/{case_id}",
    response_model=EmergencyCaseResponse,
    summary="Retrieve Single Emergency Accident Case Details",
)
def get_emergency_case(
    case_id: str,
    db: Session = Depends(get_db),
) -> EmergencyCaseResponse:
    """Fetches complete clinical assessment and observations for an emergency case."""
    c = db.query(EmergencyCaseModel).filter(
        (EmergencyCaseModel.case_id == case_id) | (EmergencyCaseModel.id == case_id)
    ).first()
    if not c:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case '{case_id}' not found.",
        )
    return map_emergency_case_to_response(c)


@router.patch(
    "/emergency/cases/{case_id}/status",
    response_model=EmergencyCaseResponse,
    summary="Update Emergency Case Lifecycle Status with Audit Trail",
)
def update_emergency_case_status(
    case_id: str,
    payload: EmergencyStatusUpdateRequest,
    db: Session = Depends(get_db),
) -> EmergencyCaseResponse:
    """
    Updates emergency case status along the clinical lifecycle:
    - RESPONSE_ACTIVATED -> INITIAL_ASSESSMENT -> STABILIZATION_IN_PROGRESS ->
      AWAITING_CLINICAL_DECISION -> TRANSFERRED / ADMITTED / COMPLETED
    Records an immutable audit trail entry with timestamp and responsible clinician.
    """
    c = db.query(EmergencyCaseModel).filter(
        (EmergencyCaseModel.case_id == case_id) | (EmergencyCaseModel.id == case_id)
    ).first()
    if not c:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case '{case_id}' not found.",
        )

    try:
        previous_status = c.status
        target_status = payload.status.value if hasattr(payload.status, "value") else str(payload.status)
        c.status = target_status
        if payload.assigned_resuscitation_bay:
            c.assigned_resuscitation_bay = payload.assigned_resuscitation_bay
        c.updated_at = utc_now()

        db.commit()
        db.refresh(c)

        # Audit log
        audit_log = EmergencyAuditModel(
            case_id=c.case_id,
            previous_status=previous_status,
            new_status=target_status,
            action_type="STATUS_UPDATED",
            performed_by=payload.updated_by,
            notes=payload.notes or f"Status updated from {previous_status} to {target_status}",
            created_at=utc_now(),
        )
        db.add(audit_log)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database failure while updating emergency status: {str(e)}",
        )

    return map_emergency_case_to_response(c)


@router.post(
    "/emergency/cases/{case_id}/reassess",
    response_model=EmergencyCaseResponse,
    summary="Perform Rapid Clinical Reassessment of Emergency Case",
)
def reassess_emergency_case(
    case_id: str,
    payload: EmergencyReassessmentRequest,
    db: Session = Depends(get_db),
) -> EmergencyCaseResponse:
    """
    Updates ABCDE observations, vital measurements, and reassessment status for an active emergency case.
    Logs an audit event with responsible clinician credentials.
    """
    c = db.query(EmergencyCaseModel).filter(
        (EmergencyCaseModel.case_id == case_id) | (EmergencyCaseModel.id == case_id)
    ).first()
    if not c:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Emergency case '{case_id}' not found.",
        )

    try:
        if payload.airway_status:
            c.airway_status = payload.airway_status
        if payload.breathing_status:
            c.breathing_status = payload.breathing_status
        if payload.circulation_status:
            c.circulation_status = payload.circulation_status
        if payload.neurological_status:
            c.neurological_status = payload.neurological_status
        if payload.major_bleeding:
            c.major_bleeding = payload.major_bleeding

        if payload.pulse_bpm is not None:
            c.pulse_bpm = payload.pulse_bpm
        if payload.systolic_bp is not None:
            c.systolic_bp = payload.systolic_bp
        if payload.diastolic_bp is not None:
            c.diastolic_bp = payload.diastolic_bp
        if payload.respiratory_rate is not None:
            c.respiratory_rate = payload.respiratory_rate
        if payload.spo2 is not None:
            c.spo2 = payload.spo2
        if payload.temperature_f is not None:
            c.temperature_f = payload.temperature_f
        if payload.gcs_score is not None:
            c.gcs_score = payload.gcs_score

        c.reassessment_status = payload.reassessment_status
        c.reassessed_at = utc_now()
        c.updated_at = utc_now()

        db.commit()
        db.refresh(c)

        db.add(
            EmergencyAuditModel(
                case_id=c.case_id,
                previous_status=c.status,
                new_status=c.status,
                action_type="REASSESSMENT_LOGGED",
                performed_by=payload.reassessed_by,
                notes=f"Reassessment documented: {payload.reassessment_status}. Notes: {payload.notes or 'None'}",
                created_at=utc_now(),
            )
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database failure while recording emergency reassessment: {str(e)}",
        )

    return map_emergency_case_to_response(c)


@router.get(
    "/emergency/cases/{case_id}/audit",
    response_model=List[EmergencyAuditItemResponse],
    summary="Retrieve Audit Trail for Emergency Case",
)
def get_emergency_case_audit(
    case_id: str,
    db: Session = Depends(get_db),
) -> List[EmergencyAuditItemResponse]:
    """Returns chronological audit trail for the emergency case."""
    logs = (
        db.query(EmergencyAuditModel)
        .filter(EmergencyAuditModel.case_id == case_id)
        .order_by(EmergencyAuditModel.created_at.desc())
        .all()
    )
    return [
        EmergencyAuditItemResponse(
            id=log.id,
            case_id=log.case_id,
            previous_status=log.previous_status,
            new_status=log.new_status,
            action_type=log.action_type,
            performed_by=log.performed_by,
            notes=log.notes,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.get(
    "/emergency/stats",
    response_model=EmergencyStatsResponse,
    summary="Retrieve Emergency Trauma Department Workload Metrics",
)
def get_emergency_stats(
    db: Session = Depends(get_db),
) -> EmergencyStatsResponse:
    """Returns real-time emergency metrics from database records."""
    seed_emergency_cases(db)
    active = db.query(EmergencyCaseModel).filter(
        EmergencyCaseModel.status.notin_(["COMPLETED", "TRANSFERRED", "ADMITTED"])
    ).all()

    active_count = len(active)
    level_1_count = sum(1 for c in active if c.triage_category == "LEVEL_1_RESUSCITATION")
    stabilization_count = sum(1 for c in active if c.status in ["INITIAL_ASSESSMENT", "STABILIZATION_IN_PROGRESS"])

    tz_str, start_utc, end_utc = get_hospital_today_boundaries()
    all_cases = db.query(EmergencyCaseModel).all()
    today_count = sum(
        1 for c in all_cases
        if is_timestamp_in_hospital_today(c.created_at or c.arrival_datetime, start_utc, end_utc)
    )

    return EmergencyStatsResponse(
        active_emergency_count=active_count,
        level_1_resuscitation_count=level_1_count,
        stabilization_count=stabilization_count,
        total_emergency_cases_today=today_count,
        total_recorded_emergency_cases=len(all_cases),
        hospital_timezone=tz_str,
    )


# ============================================================================
# Clinician Deterioration Watch & Explainable Assessment Endpoints
# ============================================================================

def seed_demo_observations(patient: PatientModel, db: Session):
    """Seed realistic chronological observation records for demonstration patients if empty."""
    from datetime import timedelta
    existing_count = (
        db.query(PatientObservationModel)
        .filter(PatientObservationModel.patient_id == patient.patient_id)
        .count()
    )
    if existing_count > 0:
        return

    now = utc_now()
    if patient.pulse_bpm is not None:
        db.add(
            PatientObservationModel(
                patient_id=patient.patient_id,
                observation_type="PULSE",
                value=float(patient.pulse_bpm),
                unit="bpm",
                measured_at=now - timedelta(minutes=18),
                recorded_by="Staff Nurse Sunita",
                notes="Triage desk vital monitor",
                created_at=now - timedelta(minutes=18),
            )
        )
        db.add(
            PatientObservationModel(
                patient_id=patient.patient_id,
                observation_type="PULSE",
                value=float(patient.pulse_bpm - 12 if patient.pulse_bpm > 75 else patient.pulse_bpm + 8),
                unit="bpm",
                measured_at=now - timedelta(minutes=75),
                recorded_by="Intake Triage Desk",
                notes="Intake baseline",
                created_at=now - timedelta(minutes=75),
            )
        )

    if patient.spo2 is not None:
        db.add(
            PatientObservationModel(
                patient_id=patient.patient_id,
                observation_type="SPO2",
                value=float(patient.spo2),
                unit="%",
                measured_at=now - timedelta(minutes=18),
                recorded_by="Staff Nurse Sunita",
                notes="Room air pulse oximeter",
                created_at=now - timedelta(minutes=18),
            )
        )
        db.add(
            PatientObservationModel(
                patient_id=patient.patient_id,
                observation_type="SPO2",
                value=float(min(99.0, patient.spo2 + 3.0)),
                unit="%",
                measured_at=now - timedelta(minutes=75),
                recorded_by="Intake Triage Desk",
                notes="Intake baseline oximetry",
                created_at=now - timedelta(minutes=75),
            )
        )

    if patient.systolic_bp is not None:
        db.add(
            PatientObservationModel(
                patient_id=patient.patient_id,
                observation_type="SYSTOLIC_BP",
                value=float(patient.systolic_bp),
                secondary_value=float(patient.diastolic_bp) if patient.diastolic_bp is not None else None,
                unit="mmHg",
                measured_at=now - timedelta(minutes=18),
                recorded_by="Staff Nurse Sunita",
                notes="Manual sphygmomanometer right arm",
                created_at=now - timedelta(minutes=18),
            )
        )
        db.add(
            PatientObservationModel(
                patient_id=patient.patient_id,
                observation_type="SYSTOLIC_BP",
                value=float(patient.systolic_bp + 14 if patient.systolic_bp < 140 else patient.systolic_bp - 12),
                secondary_value=float(patient.diastolic_bp + 6 if patient.diastolic_bp else 75),
                unit="mmHg",
                measured_at=now - timedelta(minutes=75),
                recorded_by="Intake Triage Desk",
                notes="Intake baseline BP",
                created_at=now - timedelta(minutes=75),
            )
        )

    if patient.temperature is not None:
        db.add(
            PatientObservationModel(
                patient_id=patient.patient_id,
                observation_type="TEMPERATURE",
                value=float(patient.temperature),
                unit=patient.temperature_unit or "F",
                measured_at=now - timedelta(minutes=18),
                recorded_by="Staff Nurse Sunita",
                notes="Infrared forehead thermometry",
                created_at=now - timedelta(minutes=18),
            )
        )

    db.commit()


@router.get(
    "/patients/{patient_id}/deterioration-watch",
    response_model=DeteriorationWatchResponse,
    summary="Clinician-facing Longitudinal Deterioration Watch Data",
)
def get_patient_deterioration_watch(
    patient_id: str,
    rules_configured: bool = Query(True, description="Whether prototype warning rules are clinically configured"),
    db: Session = Depends(get_db),
) -> DeteriorationWatchResponse:
    """
    Returns actual recorded observations, chronological previous values with deltas,
    outdated/missing indicators, and active physiological warning flags.
    """
    patient = (
        db.query(PatientModel)
        .filter((PatientModel.patient_id == patient_id) | (PatientModel.id == patient_id))
        .first()
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    seed_demo_observations(patient, db)

    raw_obs = (
        db.query(PatientObservationModel)
        .filter(PatientObservationModel.patient_id == patient.patient_id)
        .order_by(PatientObservationModel.measured_at.desc())
        .all()
    )

    obs_by_type: Dict[str, List[PatientObservationModel]] = {}
    for o in raw_obs:
        obs_by_type.setdefault(o.observation_type.upper(), []).append(o)

    standard_types = [
        ("SPO2", "Oxygen Saturation (SpO2)", "%"),
        ("PULSE", "Pulse / Heart Rate", "bpm"),
        ("SYSTOLIC_BP", "Blood Pressure", "mmHg"),
        ("RESPIRATORY_RATE", "Respiratory Rate", "/min"),
        ("TEMPERATURE", "Body Temperature", "°F"),
    ]

    now = utc_now()
    summary_items: List[ObservationSummaryItem] = []
    for o_type, display_name, def_unit in standard_types:
        records = obs_by_type.get(o_type, [])
        if not records:
            summary_items.append(
                ObservationSummaryItem(
                    observation_type=o_type,
                    display_name=display_name,
                    current_value=None,
                    current_secondary_value=None,
                    unit=def_unit,
                    measured_at=None,
                    previous_value=None,
                    delta=None,
                    is_outdated=False,
                    is_missing=True,
                    recorded_by=None,
                )
            )
        else:
            latest = records[0]
            prev_val = records[1].value if len(records) > 1 else None
            delta = round(latest.value - prev_val, 1) if prev_val is not None else None
            m_at = latest.measured_at
            if m_at.tzinfo is None:
                m_at = m_at.replace(tzinfo=timezone.utc)
            diff_minutes = (now - m_at).total_seconds() / 60
            is_outdated = diff_minutes > 120
            summary_items.append(
                ObservationSummaryItem(
                    observation_type=o_type,
                    display_name=display_name,
                    current_value=latest.value,
                    current_secondary_value=latest.secondary_value,
                    unit=latest.unit or def_unit,
                    measured_at=latest.measured_at,
                    previous_value=prev_val,
                    delta=delta,
                    is_outdated=is_outdated,
                    is_missing=False,
                    recorded_by=latest.recorded_by,
                )
            )

    evaluated_warning_dicts = evaluate_deterioration_warnings(
        obs_by_type,
        is_rules_configured=rules_configured,
    )

    existing_warn_objs = (
        db.query(DeteriorationWarningModel)
        .filter(DeteriorationWarningModel.patient_id == patient.patient_id)
        .all()
    )
    existing_by_warn_id = {w.warning_id: w for w in existing_warn_objs}

    for w_dict in evaluated_warning_dicts:
        w_id = w_dict["warning_id"]
        if w_id not in existing_by_warn_id:
            new_warn = DeteriorationWarningModel(
                patient_id=patient.patient_id,
                warning_id=w_id,
                severity=w_dict["severity"],
                trigger_reason=w_dict["trigger_reason"],
                supporting_observation=w_dict.get("supporting_observation"),
                status="PENDING_REVIEW",
                rule_version=DETERIORATION_RULES_VERSION,
                created_at=utc_now(),
            )
            db.add(new_warn)
            existing_by_warn_id[w_id] = new_warn
            patient.deterioration_flag = True
            patient.deterioration_reason = w_dict["trigger_reason"]
            patient.status = "NEEDS_HUMAN_REVIEW"

    db.commit()

    active_warnings = (
        db.query(DeteriorationWarningModel)
        .filter(DeteriorationWarningModel.patient_id == patient.patient_id)
        .order_by(DeteriorationWarningModel.created_at.desc())
        .all()
    )

    audits = (
        db.query(QueueAuditModel)
        .filter(QueueAuditModel.patient_id == patient.patient_id)
        .order_by(QueueAuditModel.created_at.desc())
        .all()
    )
    audit_trail_dicts = [
        {
            "id": a.id,
            "action_type": a.action_type,
            "performed_by": a.performed_by,
            "previous_status": a.previous_status,
            "new_status": a.new_status,
            "notes": a.notes,
            "created_at": a.created_at,
        }
        for a in audits
    ]

    clinician_info = ClinicianTriageInfo(
        clinician_triage_level=patient.clinician_triage_level,
        clinician_triage_name=patient.clinician_triage_name,
        clinician_triage_notes=patient.clinician_triage_notes,
        clinician_reviewed_by=patient.clinician_reviewed_by,
        clinician_reviewed_at=patient.clinician_reviewed_at,
    )

    return DeteriorationWatchResponse(
        patient_id=patient.patient_id,
        patient_name=patient.patient_name,
        age=patient.age,
        gender=patient.gender,
        token_number=patient.token_number,
        deterioration_flag=bool(patient.deterioration_flag),
        deterioration_reason=patient.deterioration_reason,
        last_reassessed_at=patient.last_reassessed_at,
        clinician_assigned_triage=clinician_info,
        rule_evaluation_configured=rules_configured,
        rule_set_version=DETERIORATION_RULES_VERSION,
        observations=summary_items,
        raw_observation_history=[
            ObservationItemResponse(
                id=o.id,
                patient_id=o.patient_id,
                observation_type=o.observation_type,
                value=o.value,
                secondary_value=o.secondary_value,
                unit=o.unit,
                measured_at=o.measured_at,
                recorded_by=o.recorded_by,
                notes=o.notes,
                created_at=o.created_at,
            )
            for o in raw_obs
        ],
        active_warnings=[
            DeteriorationWarningResponse(
                id=w.id,
                patient_id=w.patient_id,
                warning_id=w.warning_id,
                severity=w.severity,
                trigger_reason=w.trigger_reason,
                supporting_observation=w.supporting_observation,
                status=w.status,
                acknowledged_by=w.acknowledged_by,
                acknowledged_at=w.acknowledged_at,
                acknowledgment_notes=w.acknowledgment_notes,
                resolved_by=w.resolved_by,
                resolved_at=w.resolved_at,
                resolution_notes=w.resolution_notes,
                rule_version=w.rule_version,
                created_at=w.created_at,
                updated_at=w.updated_at or w.created_at,
            )
            for w in active_warnings
        ],
        audit_trail=audit_trail_dicts,
    )


@router.post(
    "/patients/{patient_id}/observations",
    response_model=ObservationItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record New Timestamped Observation by Authorized Staff",
)
def record_patient_observation(
    patient_id: str,
    payload: ObservationCreateRequest,
    rules_configured: bool = Query(True, description="Whether prototype warning rules are clinically configured"),
    current_staff: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
) -> ObservationItemResponse:
    """
    Records a new authorized physiological observation, updates active patient vitals,
    evaluates clinically reviewed warning triggers, and appends to the immutable audit trail.
    """
    patient = (
        db.query(PatientModel)
        .filter((PatientModel.patient_id == patient_id) | (PatientModel.id == patient_id))
        .first()
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    measured_time = payload.measured_at or utc_now()
    obs_record = PatientObservationModel(
        patient_id=patient.patient_id,
        observation_type=payload.observation_type.upper(),
        value=payload.value,
        secondary_value=payload.secondary_value,
        unit=payload.unit,
        measured_at=measured_time,
        recorded_by=payload.recorded_by,
        notes=payload.notes,
        created_at=utc_now(),
    )
    db.add(obs_record)

    # Sync into PatientModel
    t = payload.observation_type.upper()
    if t == "PULSE":
        patient.pulse_bpm = int(payload.value)
    elif t == "SPO2":
        patient.spo2 = float(payload.value)
    elif t == "SYSTOLIC_BP":
        patient.systolic_bp = int(payload.value)
        if payload.secondary_value is not None:
            patient.diastolic_bp = int(payload.secondary_value)
    elif t == "DIASTOLIC_BP":
        patient.diastolic_bp = int(payload.value)
    elif t == "TEMPERATURE":
        patient.temperature = float(payload.value)
        patient.temperature_unit = payload.unit.replace("°", "")

    db.add(
        QueueAuditModel(
            patient_id=patient.patient_id,
            previous_status=patient.status,
            new_status=patient.status,
            action_type="OBSERVATION_RECORDED",
            performed_by=payload.recorded_by,
            notes=f"Recorded {payload.observation_type}: {payload.value} {payload.unit}. Notes: {payload.notes or 'None'}",
            created_at=utc_now(),
        )
    )
    db.commit()
    db.refresh(obs_record)

    # Re-evaluate warning triggers
    all_obs = (
        db.query(PatientObservationModel)
        .filter(PatientObservationModel.patient_id == patient.patient_id)
        .order_by(PatientObservationModel.measured_at.desc())
        .all()
    )
    obs_by_type: Dict[str, List[PatientObservationModel]] = {}
    for o in all_obs:
        obs_by_type.setdefault(o.observation_type.upper(), []).append(o)

    if rules_configured:
        warnings = evaluate_deterioration_warnings(obs_by_type, is_rules_configured=True)
        for w in warnings:
            existing = (
                db.query(DeteriorationWarningModel)
                .filter(
                    DeteriorationWarningModel.patient_id == patient.patient_id,
                    DeteriorationWarningModel.warning_id == w["warning_id"],
                    DeteriorationWarningModel.status.in_(["PENDING_REVIEW", "ACKNOWLEDGED", "REASSESSMENT_IN_PROGRESS"]),
                )
                .first()
            )
            if not existing:
                new_w = DeteriorationWarningModel(
                    patient_id=patient.patient_id,
                    warning_id=w["warning_id"],
                    severity=w["severity"],
                    trigger_reason=w["trigger_reason"],
                    supporting_observation=w.get("supporting_observation"),
                    status="PENDING_REVIEW",
                    rule_version=DETERIORATION_RULES_VERSION,
                    created_at=utc_now(),
                )
                db.add(new_w)
                patient.deterioration_flag = True
                patient.deterioration_reason = w["trigger_reason"]
                patient.status = "NEEDS_HUMAN_REVIEW"
                db.add(
                    QueueAuditModel(
                        patient_id=patient.patient_id,
                        previous_status=patient.status,
                        new_status="NEEDS_HUMAN_REVIEW",
                        action_type="DETERIORATION_WARNING_TRIGGERED",
                        performed_by="Automated Physiological Rule Engine",
                        notes=f"Triggered {w['warning_id']}: {w['trigger_reason']}",
                        created_at=utc_now(),
                    )
                )
        db.commit()

    return ObservationItemResponse(
        id=obs_record.id,
        patient_id=obs_record.patient_id,
        observation_type=obs_record.observation_type,
        value=obs_record.value,
        secondary_value=obs_record.secondary_value,
        unit=obs_record.unit,
        measured_at=obs_record.measured_at,
        recorded_by=obs_record.recorded_by,
        notes=obs_record.notes,
        created_at=obs_record.created_at,
    )


@router.post(
    "/patients/{patient_id}/warnings/{warning_id}/acknowledge",
    response_model=DeteriorationWarningResponse,
    summary="Acknowledge Deterioration Warning or Advance Reassessment Status",
)
def acknowledge_deterioration_warning(
    patient_id: str,
    warning_id: str,
    payload: WarningAcknowledgeRequest,
    current_staff: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
) -> DeteriorationWarningResponse:
    """
    Transitions warning status (e.g. ACKNOWLEDGED, REASSESSMENT_IN_PROGRESS,
    REASSESSED_ESCALATED, REASSESSED_MAINTAINED) and creates an immutable audit entry.
    """
    patient = (
        db.query(PatientModel)
        .filter((PatientModel.patient_id == patient_id) | (PatientModel.id == patient_id))
        .first()
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    warn_record = (
        db.query(DeteriorationWarningModel)
        .filter(
            DeteriorationWarningModel.patient_id == patient.patient_id,
            (DeteriorationWarningModel.warning_id == warning_id) | (DeteriorationWarningModel.id == (int(warning_id) if warning_id.isdigit() else -1)),
        )
        .first()
    )
    if not warn_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Warning '{warning_id}' not found for patient '{patient_id}'.",
        )

    prev_status = warn_record.status
    warn_record.status = payload.status
    warn_record.acknowledged_by = payload.acknowledged_by
    warn_record.acknowledged_at = utc_now()
    warn_record.acknowledgment_notes = payload.notes
    warn_record.updated_at = utc_now()

    if payload.status in ["REASSESSED_ESCALATED", "REASSESSED_MAINTAINED"]:
        warn_record.resolved_by = payload.acknowledged_by
        warn_record.resolved_at = utc_now()
        warn_record.resolution_notes = payload.notes
        patient.last_reassessed_at = utc_now()

    db.add(
        QueueAuditModel(
            patient_id=patient.patient_id,
            previous_status=prev_status,
            new_status=payload.status,
            action_type="WARNING_STATUS_UPDATED",
            performed_by=payload.acknowledged_by,
            notes=f"Warning {warn_record.warning_id} updated to {payload.status}. Notes: {payload.notes or 'None'}",
            created_at=utc_now(),
        )
    )
    db.commit()
    db.refresh(warn_record)

    return DeteriorationWarningResponse(
        id=warn_record.id,
        patient_id=warn_record.patient_id,
        warning_id=warn_record.warning_id,
        severity=warn_record.severity,
        trigger_reason=warn_record.trigger_reason,
        supporting_observation=warn_record.supporting_observation,
        status=warn_record.status,
        acknowledged_by=warn_record.acknowledged_by,
        acknowledged_at=warn_record.acknowledged_at,
        acknowledgment_notes=warn_record.acknowledgment_notes,
        resolved_by=warn_record.resolved_by,
        resolved_at=warn_record.resolved_at,
        resolution_notes=warn_record.resolution_notes,
        rule_version=warn_record.rule_version,
        created_at=warn_record.created_at,
        updated_at=warn_record.updated_at or warn_record.created_at,
    )


@router.post(
    "/patients/{patient_id}/clinician-triage",
    response_model=ClinicianTriageInfo,
    summary="Clinician-Assigned Triage and Clinical Override Recording",
)
def record_clinician_triage(
    patient_id: str,
    payload: ClinicianTriageAssignmentRequest,
    current_staff: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
) -> ClinicianTriageInfo:
    """
    Records clinician-assigned triage category, rationale, and review timestamp.
    Maintains strict clinical separation from automated model suggestions and warnings.
    """
    patient = (
        db.query(PatientModel)
        .filter((PatientModel.patient_id == patient_id) | (PatientModel.id == patient_id))
        .first()
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    patient.clinician_triage_level = payload.triage_level
    patient.clinician_triage_name = payload.triage_name
    patient.clinician_triage_notes = payload.notes
    patient.clinician_reviewed_by = payload.clinician_name
    patient.clinician_reviewed_at = utc_now()

    patient.review_status = "CLINICIAN_REVIEWED"
    patient.reviewed_by = payload.clinician_name
    patient.reviewed_at = utc_now()
    patient.review_notes = payload.notes
    action_type = "CLINICIAN_TRIAGE_OVERRIDE" if patient.triage_level != payload.triage_level else "CLINICIAN_TRIAGE_ASSIGNED"
    patient.triage_level = payload.triage_level
    patient.triage_level_name = payload.triage_name
    patient.updated_at = utc_now()

    db.add(
        QueueAuditModel(
            patient_id=patient.patient_id,
            previous_status=patient.status,
            new_status="CLINICIAN_REVIEWED",
            action_type=action_type,
            performed_by=payload.clinician_name,
            notes=f"Clinician assigned Level {payload.triage_level} ({payload.triage_name}). Clinical rationale: {payload.notes}",
            created_at=utc_now(),
        )
    )
    db.commit()

    return ClinicianTriageInfo(
        clinician_triage_level=patient.clinician_triage_level,
        clinician_triage_name=patient.clinician_triage_name,
        clinician_triage_notes=patient.clinician_triage_notes,
        clinician_reviewed_by=patient.clinician_reviewed_by,
        clinician_reviewed_at=patient.clinician_reviewed_at,
    )


@router.get(
    "/patients/{patient_id}/explainable-assessment",
    response_model=ExplainableAssessmentResponse,
    summary="Clinician-facing Explainable Assessment Breakdown",
)
def get_explainable_assessment(
    patient_id: str,
    db: Session = Depends(get_db),
) -> ExplainableAssessmentResponse:
    """
    Returns complete, auditable explainable assessment breakdown with separate sections:
    1. Clinician-assigned triage category, if recorded.
    2. AI model suggestion, if available.
    3. Rule-based warnings and exact rule identifiers.
    4. Recorded red flags and supporting observations.
    5. Missing information that limits assessment.
    6. Assessment timestamp and model/rule-set version.
    7. Human review, override reason, and audit history.
    """
    patient = (
        db.query(PatientModel)
        .filter((PatientModel.patient_id == patient_id) | (PatientModel.id == patient_id))
        .first()
    )
    if not patient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Patient '{patient_id}' not found.",
        )

    temp_f = patient.temperature if patient.temperature_unit == "F" else (
        (patient.temperature * 9 / 5) + 32 if patient.temperature is not None else None
    )
    dq_issues = evaluate_data_quality(
        age=patient.age,
        gender=patient.gender,
        chief_complaint=patient.chief_complaint,
        systolic_bp=patient.systolic_bp,
        diastolic_bp=patient.diastolic_bp,
        pulse_bpm=patient.pulse_bpm,
        temperature=temp_f,
        temperature_unit="F",
        spo2=patient.spo2,
        notes=patient.notes,
    )

    alerts = evaluate_clinical_escalation_rules(
        systolic_bp=patient.systolic_bp,
        diastolic_bp=patient.diastolic_bp,
        pulse_bpm=patient.pulse_bpm,
        temperature=temp_f,
        temperature_unit="F",
        spo2=patient.spo2,
        red_flags={},
        age=patient.age,
        gender=patient.gender,
        chief_complaint=patient.chief_complaint,
    )

    # AI Model suggestion evaluation
    try:
        if inference_service.is_loaded:
            inf_res = inference_service.assess(
                age=patient.age,
                gender=patient.gender,
                chief_complaint=patient.chief_complaint,
                complaint_language=patient.complaint_language or "English",
                known_conditions=json.loads(patient.known_conditions) if patient.known_conditions else [],
                systolic_bp=patient.systolic_bp,
                diastolic_bp=patient.diastolic_bp,
                pulse_bpm=patient.pulse_bpm,
                temperature=temp_f,
                temperature_unit="F",
                spo2=patient.spo2,
                notes=patient.notes,
            )
            is_abstained = bool(
                inf_res.get("abstention_status")
                and str(inf_res.get("abstention_status")).startswith("ABSTAINED")
            )
            ai_suggestion = AIModelSuggestionInfo(
                available=not is_abstained,
                model_name="MediTriage Multi-Head XGBoost / Tabular Ensemble" if not is_abstained else None,
                model_version=inf_res.get("model_version") if not is_abstained else None,
                raw_suggested_level=inf_res.get("raw_model_level") if not is_abstained else None,
                raw_suggested_name=inf_res.get("raw_model_name") if not is_abstained else None,
                suggested_level=inf_res.get("triage_level") if not is_abstained else None,
                suggested_name=inf_res.get("triage_level_name") if not is_abstained else None,
                recommended_department=inf_res.get("recommended_department") if not is_abstained else None,
                override_applied=inf_res.get("override_applied", False),
                abstention_status=inf_res.get("abstention_status"),
            )
        else:
            ai_suggestion = AIModelSuggestionInfo(
                available=False,
                model_name=None,
                model_version=None,
                raw_suggested_level=None,
                raw_suggested_name=None,
                suggested_level=None,
                suggested_name=None,
                recommended_department=None,
                override_applied=False,
                abstention_status="ABSTAINED_MODEL_UNAVAILABLE",
            )
    except Exception:
        ai_suggestion = AIModelSuggestionInfo(
            available=False,
            model_name=None,
            model_version=None,
            raw_suggested_level=None,
            raw_suggested_name=None,
            suggested_level=None,
            suggested_name=None,
            recommended_department=None,
            override_applied=False,
            abstention_status="ABSTAINED_INFERENCE_ERROR",
        )

    rule_warnings = [
        RuleWarningDetail(
            rule_id=a.rule_id,
            rule_name=a.rule_name,
            acuity_level=a.acuity_level.value,
            message=a.message,
            clinical_explanation=a.clinical_explanation,
            required_human_verification=a.required_human_verification,
            is_critical_override=a.is_critical_override,
        )
        for a in alerts
    ]

    red_flags: List[str] = []
    vital_abnormalities: List[str] = []
    supporting_obs: List[str] = []

    if patient.spo2 is not None:
        if patient.spo2 < 92.0:
            vital_abnormalities.append(f"Severe Hypoxemia: SpO2 {patient.spo2}% < 92%")
        elif patient.spo2 <= 94.0:
            vital_abnormalities.append(f"Borderline SpO2: {patient.spo2}%")
        supporting_obs.append(f"SpO2: {patient.spo2}%")
    if patient.systolic_bp is not None:
        if patient.systolic_bp < 90:
            vital_abnormalities.append(f"Hypotension: Systolic BP {patient.systolic_bp} mmHg < 90 mmHg")
        elif patient.systolic_bp >= 180:
            vital_abnormalities.append(f"Hypertensive Urgency: Systolic BP {patient.systolic_bp} mmHg >= 180 mmHg")
        bp_str = f"BP: {patient.systolic_bp}/{patient.diastolic_bp or '-'} mmHg"
        supporting_obs.append(bp_str)
    if patient.pulse_bpm is not None:
        if patient.pulse_bpm > 120:
            vital_abnormalities.append(f"Severe Tachycardia: Heart Rate {patient.pulse_bpm} bpm > 120 bpm")
        elif patient.pulse_bpm < 50:
            vital_abnormalities.append(f"Severe Bradycardia: Heart Rate {patient.pulse_bpm} bpm < 50 bpm")
        supporting_obs.append(f"Pulse: {patient.pulse_bpm} bpm")
    if temp_f is not None:
        if temp_f >= 103.5:
            vital_abnormalities.append(f"Hyperpyrexia: Temperature {temp_f:.1f}°F >= 103.5°F")
        supporting_obs.append(f"Temp: {temp_f:.1f}°F")

    if patient.warning_signs:
        try:
            ws = json.loads(patient.warning_signs)
            if isinstance(ws, list):
                red_flags.extend(ws)
        except Exception:
            pass

    evidence = RedFlagAndObservationEvidence(
        recorded_red_flags=red_flags,
        vital_abnormalities=vital_abnormalities,
        supporting_observations=supporting_obs,
    )

    missing_vitals: List[str] = []
    if patient.spo2 is None:
        missing_vitals.append("SpO2 (Pulse Oximetry)")
    if patient.systolic_bp is None or patient.diastolic_bp is None:
        missing_vitals.append("Blood Pressure (Sphygmomanometer)")
    if patient.pulse_bpm is None:
        missing_vitals.append("Pulse / Heart Rate")
    if patient.temperature is None:
        missing_vitals.append("Body Temperature")
    missing_vitals.append("Respiratory Rate (Unrecorded at initial intake)")

    dq_msgs = [i.message for i in dq_issues if i.status.value != "VALID"]
    missing_info = MissingAssessmentInformation(
        missing_vital_signs=missing_vitals,
        data_quality_issues=dq_msgs,
        unrecorded_measurements_note=(
            "Missing physiological parameters must be verified at triage bedside. "
            "Never assume unrecorded vital signs are normal or delay emergency care."
        ),
    )

    clinician_info = ClinicianTriageInfo(
        clinician_triage_level=patient.clinician_triage_level,
        clinician_triage_name=patient.clinician_triage_name,
        clinician_triage_notes=patient.clinician_triage_notes,
        clinician_reviewed_by=patient.clinician_reviewed_by,
        clinician_reviewed_at=patient.clinician_reviewed_at,
    )

    audits = (
        db.query(QueueAuditModel)
        .filter(QueueAuditModel.patient_id == patient.patient_id)
        .order_by(QueueAuditModel.created_at.desc())
        .all()
    )
    audit_history = [
        AssessmentAuditHistoryItem(
            action_type=a.action_type,
            performed_by=a.performed_by,
            timestamp=a.created_at,
            previous_status=a.previous_status,
            new_status=a.new_status,
            notes=a.notes,
        )
        for a in audits
    ]

    return ExplainableAssessmentResponse(
        patient_id=patient.patient_id,
        patient_name=patient.patient_name,
        token_number=patient.token_number,
        assessment_timestamp=patient.created_at or utc_now(),
        rule_set_version=SAFETY_RULE_VERSION,
        clinician_assigned_triage=clinician_info,
        ai_model_suggestion=ai_suggestion,
        rule_based_warnings=rule_warnings,
        evidence=evidence,
        missing_information=missing_info,
        effective_triage_level=patient.triage_level or 3,
        effective_triage_name=patient.triage_level_name or "Level 3 - Urgent",
        recommended_department=patient.recommended_department or "General Medicine",
        review_status=patient.review_status or "UNREVIEWED",
        reviewed_by=patient.reviewed_by,
        reviewed_at=patient.reviewed_at,
        review_notes=patient.review_notes,
        audit_history=audit_history,
    )






