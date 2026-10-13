# MediTriage AI — Backend REST API Reference

Base URL in local development: `http://127.0.0.1:8000/api`
Interactive Swagger Documentation: `http://127.0.0.1:8000/docs`

---

## 1. Health Check
`GET /api/health`

### Response `200 OK`
```json
{
  "status": "healthy",
  "service": "MediTriage AI Backend",
  "environment": "development",
  "version": "1.0.0-prototype",
  "timestamp": "2026-10-10T14:40:00Z",
  "hospital": "District Civil Hospital OPD"
}
```

---

## 2. Assess Patient Acuity (Dry Run)
`POST /api/triage/assess`

Evaluates vital signs and symptoms and returns urgency level without committing the patient to the active queue.

### Request Body
```json
{
  "patient_name": "Ramesh Kumar",
  "age": 58,
  "gender": "Male",
  "contact_phone": "9876543210",
  "opd_registration_number": "UHID-2026-901",
  "chief_complaint": "Severe crushing chest pain radiating to jaw, cold sweating",
  "symptom_duration_days": 0,
  "vitals": {
    "heart_rate": 124,
    "systolic_bp": 88,
    "diastolic_bp": 56,
    "respiratory_rate": 28,
    "spo2": 91.0,
    "temperature_f": 98.4,
    "avpu": "ALERT"
  },
  "red_flags": {
    "crushing_chest_pain": true
  },
  "clinical_notes": "Diaphoretic at counter"
}
```

### Response `200 OK`
```json
{
  "triage_category": "EMERGENCY",
  "urgency_level": "RED — IMMEDIATE CASUALTY ALERT",
  "urgency_score": 9,
  "recommended_department": "Casualty / Emergency",
  "red_flags_identified": [
    "Acute crushing chest pain (potential acute coronary syndrome)"
  ],
  "vital_abnormalities": [
    "Borderline Hypoxemia (SpO2 91.0%)",
    "Mild Tachycardia (Heart Rate 124 bpm)",
    "Hypotension / Shock indicator (Systolic BP 88 mmHg < 90)"
  ],
  "clinical_rationale": [
    "Patient exhibits critical red-flag symptoms or life-threatening vital sign derangement.",
    "Red Flag: Acute crushing chest pain (potential acute coronary syndrome)",
    "Vital Alert: Borderline Hypoxemia (SpO2 91.0%)",
    "Vital Alert: Mild Tachycardia (Heart Rate 124 bpm)",
    "Vital Alert: Hypotension / Shock indicator (Systolic BP 88 mmHg < 90)"
  ],
  "recommended_action": "Immediate transfer to Emergency Resuscitation / Casualty Ward without queuing.",
  "max_recommended_wait_minutes": 0,
  "assessment_timestamp": "2026-10-10T14:40:00Z",
  "disclaimer": "PROTOTYPE DECISION-SUPPORT NOTICE: This automated assessment provides rule-based clinical triage prioritization assistance for hospital intake queues..."
}
```

---

## 3. Register & Enroll in Queue
`POST /api/triage/queue`

Evaluates triage acuity, generates a hospital OPD token (`OPD-101`), and commits the patient to the priority queue.

### Response `201 Created`
Returns full `PatientQueueItem` object with token number, acuity category, and queue status `WAITING`.

---

## 4. Get Live OPD Queue
`GET /api/triage/queue`

Query parameters:
- `category` (optional): `EMERGENCY`, `PRIORITY`, `ROUTINE`
- `department` (optional): Filter by department name (e.g. `Cardiology`)
- `status` (optional): `WAITING`, `WITH_DOCTOR`, `COMPLETED`
- `search` (optional): Search by patient name, UHID, or token number

Sorted primarily by acuity (Emergency &rarr; Priority &rarr; Routine), then urgency score descending, then arrival timestamp.

---

## 5. Update Queue Status
`PATCH /api/triage/queue/{patient_id}/status`

### Request Body
```json
{
  "status": "WITH_DOCTOR",
  "doctor_room": "Room 104 - Dr. Verma"
}
```

---

## 6. Hospital Queue Statistics
`GET /api/triage/stats`

Returns aggregated counts:
- `total_patients`
- `waiting_count`
- `with_doctor_count`
- `completed_count`
- `emergency_count`
- `priority_count`
- `routine_count`
- `departments_breakdown`

---

## 7. Patient Intake Registration
`POST /api/patients`

Accepts bedside nurse intake data, assigns unique UHID, and persists prototype records using parameterized SQLAlchemy operations.

### Request Body
```json
{
  "patient_id": "DEMO-PT-2026-1001",
  "patient_name": "Lakshmi Devi",
  "age": 48,
  "gender": "Female",
  "arrival_time": "10:30",
  "chief_complaint": "తీవ్రమైన తలనొప్పి మరియు కళ్ళు తిరగడం",
  "complaint_language": "Telugu",
  "known_conditions": ["Hypertension"],
  "medications": "Amlodipine 5mg",
  "systolic_bp": 130,
  "diastolic_bp": 85,
  "pulse_bpm": 78,
  "temperature": 98.4,
  "temperature_unit": "F",
  "spo2": 98.0
}
```

### Response `201 Created`
Returns `PatientIntakeResponse` with database ID, sanitized attributes, audit safety evaluation, and pending assessment status.

---

## 8. ML Decision Support & Safety Assessment
`POST /api/assessments`

Evaluates a patient record through the approved 7-step clinical decision flow:
1. Input validation and data hygiene.
2. Independent clinical safety checks.
3. Critical rule escalation evaluation.
4. Model execution on verified inputs.
5. Escalation policy application.
6. Safe abstention on missing or contradictory inputs (patient placed on Priority Holding).
7. Auditable response serialization.

### Request Body
```json
{
  "patient_id": "DEMO-PT-2026-1001",
  "age": 48,
  "gender": "Female",
  "chief_complaint": "Severe crushing chest pain radiating to left jaw",
  "complaint_language": "English",
  "known_conditions": ["Hypertension"],
  "systolic_bp": 85,
  "diastolic_bp": 55,
  "pulse_bpm": 124,
  "temperature": 98.4,
  "temperature_unit": "F",
  "spo2": 91.0
}
```

### Response `200 OK`
```json
{
  "triage_level": 1,
  "triage_level_name": "Level 1 - Resuscitation / Immediate",
  "recommended_department": "Emergency / Casualty",
  "detected_red_flags": [
    "Hemodynamic Shock Boundary (Systolic BP < 90 mmHg)"
  ],
  "model_explanation": "🚨 CRITICAL CLINICAL SAFETY OVERRIDE: Severe physiological red flag triggered. Overrode machine-learning recommendation to Level 1 / Emergency.",
  "triggered_safety_rule_ids": [
    "CRIT-RULE-SHOCK-BP"
  ],
  "safety_rule_explanations": [
    "Inadequate end-organ perfusion indicating hypovolemic, septic, or cardiogenic shock."
  ],
  "missing_data_warnings": [],
  "invalid_data_warnings": [],
  "human_review_required": true,
  "abstention_status": "SAFETY_OVERRIDE",
  "model_version": "2026.1-triage-ml-v1",
  "rules_version": "2026.1-hackathon-domain-primer-v1",
  "model_emergency_flag": true,
  "clinical_disclaimer": "ASSISTIVE DECISION SUPPORT ONLY: This evaluation is generated by MediTriage AI. An emergency flag or triage category from the model alone does NOT constitute a confirmed medical diagnosis. All patient assignments remain subject to physician bedside review."
}
```

---

## 7. Persistent OPD Patient Queue
`GET /api/queue`

Retrieves the prioritized OPD queue from the persistent SQLite database according to the approved clinical escalation policy:
1. Deteriorating cases (`deterioration_flag = true`) & Level 1 emergencies at top.
2. Emergent & holding cases needing human review preserved (cannot be dropped).
3. Routine cases ordered secondarily by waiting time.

### Query Parameters
- `triage_level` (int, optional): Filter by triage level `1` to `5`.
- `review_status` (string, optional): Filter by `UNREVIEWED`, `REVIEWED`, or `DETERIORATION_FLAGGED`.
- `department` (string, optional): Filter by specialty department name (e.g. `Casualty`, `Pediatrics`, `Pulmonology`).
- `search` (string, optional): Filter by demo patient ID (`UHID-2026-901`), token number, patient name, or complaint text.

---

## 8. Nurse Review Verification
`POST /api/queue/{patient_id}/review`

Records staff nurse bedside evaluation, updates status to `REVIEWED`, timestamps the review, and appends an immutable entry to the queue audit trail.

### Request Body
```json
{
  "reviewed_by": "Staff Nurse Kavitha, RN",
  "review_notes": "Auscultated bilateral wheezing. Nebulizer therapy administered."
}
```

---

## 9. Staff Deterioration Reporting
`POST /api/queue/{patient_id}/deterioration`

Safety mechanism allowing staff to flag acute physiological deterioration or sudden symptom onset. Immediately elevates patient urgency to 10/10, marks status as `NEEDS_HUMAN_REVIEW`, places the case in Tier 0 at the top of the queue, and logs the action to the audit trail.

### Request Body
```json
{
  "flagged_by": "Staff Nurse Sunita, RN",
  "reason": "Sudden diaphoresis and SpO2 desaturation to 88% in waiting hall",
  "notes": "Wheeled to Resuscitation Bay 1"
}
```

---

## 10. Bedside Reassessment
`POST /api/queue/{patient_id}/reassess`

Allows clinicians to submit updated vital measurements, re-runs the CDSS ML and safety decision pipeline, updates triage acuity level, and logs the reassessment.

### Request Body
```json
{
  "requested_by": "Dr. Verma",
  "updated_spo2": 88.0,
  "updated_pulse": 130,
  "notes": "SpO2 drop after 20 minutes observation"
}
```

---

## 11. Patient Queue Audit Trail
`GET /api/queue/{patient_id}/audit`

Returns the chronological history of all status transitions, review sign-offs, deterioration reports, and reassessment actions for the specified patient ID.

---

## 12. Multilingual Chief-Complaint Text Processing
Module: `app.nlp.complaint_processor`

Modular NLP component supporting:
- English, Telugu script (తెలుగు), and common Latin transliterations (`gunde noppi`, `aayasam`, `jwaram`).
- Whitespace and punctuation normalization while strictly preserving negations (`no chest pain`, `gunde noppi ledu`, `దగ్గు లేదు`).
- Contextual categorization: `POSITIVE`, `NEGATED`, `UNCERTAIN`, `HISTORICAL`.
- Language detection kept independent from translation.
- Red flags derived strictly from positive symptoms.


