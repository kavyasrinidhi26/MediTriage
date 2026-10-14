import type {
  NewPatientIntakeData,
  IntakeSubmissionResponse,
  PatientQueueItem,
  TriageAssessmentResult,
  AssessmentResultData,
  ExtractedSymptom,
} from '../types/triage.ts';

import { validateIntakeForm, toFahrenheit } from './intakeValidation.ts';
import { SYNTHETIC_DEMO_PATIENTS } from './mockData.ts';
import { addToLocalDemoQueue, getAuthHeaders } from './api.ts';

const DRAFT_STORAGE_KEY = 'meditriage_nurse_intake_draft_v1';
const API_BASE_URL = (typeof import.meta !== 'undefined' && (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL) || '/api';

// In-memory demo queue registry shared across client sessions
let activeLocalQueue: PatientQueueItem[] = [...SYNTHETIC_DEMO_PATIENTS];

/**
 * Persists an unsubmitted intake draft to localStorage so rapid intake progress
 * is never lost upon browser refresh or tab switch.
 */
export function saveIntakeDraft(data: NewPatientIntakeData): void {
  try {
    const payload = {
      ...data,
      last_saved_at: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // LocalStorage quota or access exception silently handled
  }
}

/**
 * Retrieves the currently saved intake draft if one exists.
 */
export function loadIntakeDraft(): NewPatientIntakeData | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NewPatientIntakeData;
  } catch {
    return null;
  }
}

/**
 * Clears the saved intake draft from localStorage.
 */
export function clearIntakeDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // LocalStorage exception safely handled
  }
}

/**
 * =========================================================================
 * FRONTEND SERVICE PLACEHOLDER: Submit Patient Intake
 * =========================================================================
 * Submits the intake form to the local in-memory registry.
 *
 * CLINICAL SAFETY PROTOCOL:
 * Per specification, THIS SERVICE DOES NOT ASSIGN A REAL CLINICAL TRIAGE LEVEL.
 * The record is enrolled into the OPD holding queue with status 'WAITING'
 * and triage status marked as 'PENDING_ASSESSMENT' for subsequent clinician
 * or automated CDSS evaluation.
 * =========================================================================
 */
export async function submitPatientIntake(
  data: NewPatientIntakeData
): Promise<IntakeSubmissionResponse> {
  const validation = validateIntakeForm(data);

  if (!validation.isValid) {
    const firstErrorMessage = Object.values(validation.errors)[0] || 'Validation failed';
    throw new Error(`Intake validation error: ${firstErrorMessage}`);
  }

  // Artificial slight delay for responsive UX
  await new Promise((resolve) => setTimeout(resolve, 200));

  const nowIso = new Date().toISOString();
  let effectiveCreatedAt = nowIso;
  let isSynthetic = true;
  let tokenNumber = `OPD-${100 + activeLocalQueue.length + 1}`;
  let queueId = `syn-intake-${Date.now()}`;
  let assignedStatus: 'WAITING' | 'NEEDS_HUMAN_REVIEW' = validation.alerts.some((a) => a.code === 'CRITICAL_PULSE_ZERO')
    ? 'NEEDS_HUMAN_REVIEW'
    : 'WAITING';

  // 1. Try to persist to FastAPI backend: POST /api/patients
  const effectiveBaseUrl =
    typeof window === 'undefined' && !API_BASE_URL.startsWith('http')
      ? `http://127.0.0.1:8000${API_BASE_URL}`
      : API_BASE_URL;

  try {
    const payload = {
      patient_id: data.patient_id.trim() || undefined,
      patient_name: data.patient_name?.trim() || undefined,
      age: data.age ?? 0,
      gender: data.sex,
      arrival_time: data.arrival_time,
      chief_complaint: data.chief_complaint,
      complaint_language: data.complaint_language,
      known_conditions: data.known_conditions,
      medications: data.medications || '',
      systolic_bp: data.systolic_bp,
      diastolic_bp: data.diastolic_bp,
      pulse_bpm: data.pulse_bpm,
      temperature: data.temperature,
      temperature_unit: data.temperature_unit,
      spo2: data.spo2,
      notes: data.notes || undefined,
    };

    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${effectiveBaseUrl}/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });


    if (res.status === 409) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Patient ID ${data.patient_id} is already registered.`);
    } else if (res.status === 422) {
      const err = await res.json().catch(() => ({}));
      const msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
      throw new Error(`Clinical input rejection: ${msg}`);
    } else if (res.ok) {
      const saved = await res.json();
      tokenNumber = saved.token_number;
      queueId = String(saved.id);
      assignedStatus = saved.status === 'NEEDS_HUMAN_REVIEW' ? 'NEEDS_HUMAN_REVIEW' : 'WAITING';
      if (saved.created_at) {
        effectiveCreatedAt = saved.created_at;
      }
      isSynthetic = false;
    } else {
      console.warn(`Backend POST /api/patients returned ${res.status}; falling back to client queue.`);
    }
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('already registered') || err.message.includes('Clinical input rejection'))) {
      throw err;
    }
    console.info('Backend unreachable, saving to local demo queue cache:', err);
  }

  // Preserve temperature in Fahrenheit if provided
  const tempF = data.temperature !== null ? toFahrenheit(data.temperature, data.temperature_unit) : null;

  // Build a placeholder assessment indicating assessment is pending
  const pendingAssessment: TriageAssessmentResult = {
    triage_category: 'ROUTINE', // Placeholder default pending medical officer assessment
    urgency_level: 'Pending Clinical Assessment',
    urgency_score: 1,
    recommended_department: 'General Medicine',
    red_flags_identified: validation.alerts.map((a) => a.message),
    vital_abnormalities: validation.alerts.map((a) => a.message),
    clinical_rationale: [
      `Chief complaint recorded in ${data.complaint_language}: "${data.chief_complaint}"`,
      `Intake vitals recorded: Pulse=${data.pulse_bpm ?? 'Not measured'}, BP=${data.systolic_bp ?? 'N/A'}/${data.diastolic_bp ?? 'N/A'}, SpO2=${data.spo2 ?? 'N/A'}%`,
      'Automated triage level withheld per protocol: Pending Clinical Officer evaluation.',
    ],
    recommended_action: 'Proceed to Triage Desk / Nursing Station for initial assessment',
    max_recommended_wait_minutes: 60,
    assessment_timestamp: effectiveCreatedAt,
    disclaimer:
      'INTAKE STAGE NOTICE: No definitive clinical triage level has been assigned. This record is placed in the holding queue awaiting medical evaluation.',
  };

  const queueItem: PatientQueueItem = {
    id: queueId,
    token_number: tokenNumber,
    patient_name: data.patient_name?.trim() || `Patient ${data.patient_id}`,
    age: data.age ?? 0,
    gender: data.sex,
    opd_registration_number: data.patient_id,
    chief_complaint: data.chief_complaint,
    symptom_duration_days: 0,
    vitals: {
      heart_rate: data.pulse_bpm,
      systolic_bp: data.systolic_bp,
      diastolic_bp: data.diastolic_bp,
      respiratory_rate: null,
      spo2: data.spo2,
      temperature_f: tempF,
      avpu: 'ALERT',
    },
    red_flags: {},
    clinical_notes: `[Language: ${data.complaint_language}] Medications: ${data.medications || 'None'}. Known Conditions: ${data.known_conditions.join(', ') || 'None'}. ${data.notes || ''}`.trim(),
    assessment: pendingAssessment,
    status: assignedStatus,
    created_at: effectiveCreatedAt,
    updated_at: effectiveCreatedAt,
    is_synthetic: isSynthetic,
  };

  // Prepend into local demo queue avoiding duplicates
  const existingIndex = activeLocalQueue.findIndex((i) => i.id === queueItem.id || i.token_number === queueItem.token_number);
  if (existingIndex >= 0) {
    activeLocalQueue[existingIndex] = queueItem;
  } else {
    activeLocalQueue.unshift(queueItem);
  }
  addToLocalDemoQueue(queueItem);

  // Clear saved draft upon successful submission
  clearIntakeDraft();

  return {
    patient_id: data.patient_id,
    token_number: tokenNumber,
    queue_id: queueId,
    status: queueItem.status,
    intake_timestamp: nowIso,
    message: 'Patient intake recorded successfully. Enrolled in OPD triage queue awaiting clinician assessment.',
    original_complaint_preserved: data.chief_complaint,
    complaint_language: data.complaint_language,
    clinical_alerts: validation.alerts,
    missing_measurements_recorded: validation.missingMeasurements,
    triage_status: 'PENDING_ASSESSMENT',
  };
}

/**
 * Retrieve saved prototype records from FastAPI backend GET /api/patients
 */
export async function fetchPatientsFromBackend(search?: string, limit = 50, offset = 0) {
  const effectiveBaseUrl =
    typeof window === 'undefined' && !API_BASE_URL.startsWith('http')
      ? `http://127.0.0.1:8000${API_BASE_URL}`
      : API_BASE_URL;

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  params.append('limit', String(limit));
  params.append('offset', String(offset));
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${effectiveBaseUrl}/patients?${params.toString()}`, {
    headers: {
      ...authHeaders,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch patients (${res.status}): ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Retrieve one patient record from FastAPI backend GET /api/patients/{patient_id}
 */
export async function fetchPatientByIdFromBackend(patientId: string) {
  const effectiveBaseUrl =
    typeof window === 'undefined' && !API_BASE_URL.startsWith('http')
      ? `http://127.0.0.1:8000${API_BASE_URL}`
      : API_BASE_URL;

  const res = await fetch(`${effectiveBaseUrl}/patients/${encodeURIComponent(patientId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch patient record (${res.status}): ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Connects to the real POST /api/assessments endpoint.
 * Returns the structured ML prediction, red flags, safety rules, and abstention status.
 * If backend is offline, generates a deterministic clinical fallback assessment.
 */
export async function requestPatientAssessment(
  data: NewPatientIntakeData
): Promise<AssessmentResultData> {
  const effectiveBaseUrl =
    typeof window === 'undefined' && !API_BASE_URL.startsWith('http')
      ? `http://127.0.0.1:8000${API_BASE_URL}`
      : API_BASE_URL;

  const payload = {
    patient_id: data.patient_id.trim() || undefined,
    patient_name: data.patient_name?.trim() || undefined,
    age: data.age ?? 0,
    gender: data.sex,
    chief_complaint: data.chief_complaint,
    complaint_language: data.complaint_language,
    known_conditions: data.known_conditions,
    systolic_bp: data.systolic_bp,
    diastolic_bp: data.diastolic_bp,
    pulse_bpm: data.pulse_bpm,
    temperature: data.temperature,
    temperature_unit: data.temperature_unit,
    spo2: data.spo2,
    notes: data.notes || undefined,
  };

  try {
    const res = await fetch(`${effectiveBaseUrl}/assessments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (err: unknown) {
    console.warn('Backend /api/assessments unreachable, generating client fallback assessment:', err);
  }

  // Deterministic offline fallback assessment
  return generateFallbackAssessment(data);
}

interface ClientNLPResult {
  detected_language: string;
  extracted_symptoms: ExtractedSymptom[];
  positive_concepts: string[];
  negated_concepts: string[];
  uncertain_concepts: string[];
  original_complaint: string;
  requires_complaint_review: boolean;
  complaint_review_reason: string | null;
  has_acute_chest_pain: boolean;
}

export function parseClientComplaint(text: string): ClientNLPResult {
  const raw = text || '';
  const lower = raw.toLowerCase().trim();
  const hasTeluguScript = /[\u0C00-\u0C7F]/.test(raw);
  const wordsLatin = lower.match(/[a-z]+/g) || [];

  const teluguTranslitMarkers = [
    'naaku', 'naku', 'chaathilo', 'chathilo', 'chaathi', 'chathi', 'chaati', 'gunde', 'gundelo',
    'noppi', 'noppiga', 'aayasam', 'ayasam', 'jwaram', 'chali', 'talanoppi', 'thala', 'kadupu',
    'undi', 'undhi', 'ledu', 'ledhu'
  ];
  const englishMarkers = [
    'chest', 'pain', 'pains', 'fever', 'body', 'cough', 'breathless', 'headache', 'severe',
    'denies', 'no', 'not', 'dont', 'have', 'fatigue', 'weakness'
  ];

  let detected_language = 'English';
  const hasTe = wordsLatin.some((w) => teluguTranslitMarkers.includes(w));
  const hasEn = wordsLatin.some((w) => englishMarkers.includes(w));

  if (hasTeluguScript) {
    detected_language = wordsLatin.length > 0 ? 'Mixed (Telugu & English)' : 'Telugu Script';
  } else if (hasTe && hasEn) {
    detected_language = 'Mixed (Telugu & English)';
  } else if (hasTe) {
    detected_language = 'Telugu Transliteration';
  } else if (hasEn) {
    detected_language = 'English';
  } else if (raw.trim().length === 0 || wordsLatin.length === 0) {
    detected_language = 'Ambiguous / Unsupported';
  }

  const extracted: ExtractedSymptom[] = [];
  const positive: string[] = [];
  const negated: string[] = [];
  const uncertain: string[] = [];

  // Chest pain detection with negation
  const hasChestPainTerms =
    lower.includes('chest pain') ||
    lower.includes('chaathilo noppi') ||
    lower.includes('chaatilo noppi') ||
    lower.includes('chathilo noppi') ||
    lower.includes('gundelo noppi') ||
    raw.includes('ఛాతిలో నొప్పి') ||
    raw.includes('ఛాతీలో నొప్పి');

  const isChestPainNegated =
    lower.includes('no chest pain') ||
    lower.includes("don't have chest pain") ||
    lower.includes('dont have chest pain') ||
    lower.includes('denies chest pain') ||
    lower.includes('gunde noppi ledu') ||
    lower.includes('chaathilo noppi ledu') ||
    raw.includes('ఛాతిలో నొప్పి లేదు');

  let has_acute_chest_pain = false;
  const hasPositiveChestPainMention =
    lower.includes('have severe chest pain') ||
    lower.includes('have chest pain') ||
    lower.includes('has chest pain') ||
    (hasChestPainTerms && !isChestPainNegated);

  if (hasPositiveChestPainMention && isChestPainNegated) {
    // Both positive and negated mentions present in complaint -> Contradiction!
    positive.push('chest_pain');
    negated.push('chest_pain');
    extracted.push({
      concept: 'chest_pain',
      context: 'positive',
      matched_text: 'chest pain',
      supporting_phrase: 'chest pain',
      is_red_flag: true,
    });
    extracted.push({
      concept: 'chest_pain',
      context: 'negated',
      matched_text: 'chest pain',
      supporting_phrase: 'no chest pain',
      is_red_flag: false,
    });
  } else if (hasChestPainTerms) {
    if (isChestPainNegated) {
      extracted.push({
        concept: 'chest_pain',
        context: 'negated',
        matched_text: 'chest pain',
        supporting_phrase: 'no chest pain',
        is_red_flag: false,
      });
      negated.push('chest_pain');
    } else {
      extracted.push({
        concept: 'chest_pain',
        context: 'positive',
        matched_text: 'chest pain',
        supporting_phrase: raw,
        severity_modifier: lower.includes('severe') ? 'severe' : null,
        is_red_flag: true,
      });
      positive.push('chest_pain');
      has_acute_chest_pain = true;
    }
  }

  // Fever detection
  const hasFeverTerms = lower.includes('fever') || lower.includes('jwaram') || raw.includes('జ్వరం');
  const isFeverNegated =
    lower.includes('no fever') ||
    lower.includes("don't have fever") ||
    lower.includes('jwaram ledu') ||
    raw.includes('జ్వరం లేదు');
  const hasPositiveFeverMention =
    lower.includes('have fever') ||
    lower.includes('high fever') ||
    (hasFeverTerms && !isFeverNegated);

  if (hasPositiveFeverMention && isFeverNegated) {
    positive.push('fever');
    negated.push('fever');
    extracted.push({
      concept: 'fever',
      context: 'positive',
      matched_text: 'fever',
      supporting_phrase: 'fever',
      is_red_flag: false,
    });
    extracted.push({
      concept: 'fever',
      context: 'negated',
      matched_text: 'fever',
      supporting_phrase: 'no fever',
      is_red_flag: false,
    });
  } else if (hasFeverTerms) {
    if (isFeverNegated) {
      extracted.push({
        concept: 'fever',
        context: 'negated',
        matched_text: 'fever',
        supporting_phrase: 'no fever',
        is_red_flag: false,
      });
      negated.push('fever');
    } else {
      extracted.push({
        concept: 'fever',
        context: 'positive',
        matched_text: 'fever',
        supporting_phrase: 'fever',
        is_red_flag: false,
      });
      positive.push('fever');
    }
  }

  // Body pain / joint bone pain
  if (lower.includes('body pain') || lower.includes('body pains') || lower.includes('ollu noppulu')) {
    extracted.push({
      concept: 'joint_bone_pain',
      context: 'positive',
      matched_text: 'body pains',
      supporting_phrase: 'body pains',
      is_red_flag: false,
    });
    positive.push('joint_bone_pain');
  }

  // Contradiction detection
  const contradictions = positive.filter((c) => negated.includes(c));
  let requires_complaint_review = false;
  let complaint_review_reason: string | null = null;

  if (!raw.trim()) {
    requires_complaint_review = true;
    complaint_review_reason = 'Empty presenting complaint; Cannot assess safely — send to nurse now.';
  } else if (contradictions.length > 0) {
    requires_complaint_review = true;
    complaint_review_reason = `Contradictory clinical statements detected for symptom (${contradictions.join(', ')}); Cannot assess safely — send to nurse now.`;
  } else if (detected_language === 'Ambiguous / Unsupported') {
    requires_complaint_review = true;
    complaint_review_reason = 'Unsupported language format or ambiguous complaint text; Cannot assess safely — send to nurse now.';
  }

  return {
    detected_language,
    extracted_symptoms: extracted,
    positive_concepts: positive,
    negated_concepts: negated,
    uncertain_concepts: uncertain,
    original_complaint: raw,
    requires_complaint_review,
    complaint_review_reason,
    has_acute_chest_pain,
  };
}

/**
 * Generates a deterministic clinical safety fallback assessment when the backend model is offline.
 */
export function generateFallbackAssessment(data: NewPatientIntakeData): AssessmentResultData {
  const validation = validateIntakeForm(data);
  const alerts = validation.alerts;
  const missingWarnings = validation.missingMeasurements.map((m) => `${m.label}: ${m.explanation}`);
  const invalidWarnings = Object.entries(validation.errors).map(([k, v]) => `${k}: ${v}`);

  const clientNLP = parseClientComplaint(data.chief_complaint || '');

  const hasPulseZero = data.pulse_bpm === 0;
  const hasCriticalHypoxia = data.spo2 !== null && data.spo2 < 90;
  const hasCriticalShock = data.systolic_bp !== null && data.systolic_bp < 90;
  const isCritical = hasPulseZero || hasCriticalHypoxia || hasCriticalShock || clientNLP.has_acute_chest_pain;

  const triggeredIds: string[] = [];
  const triggeredExpls: string[] = [];

  if (hasPulseZero) {
    triggeredIds.push('CRIT-RULE-PULSE-0');
    triggeredExpls.push('Pulse recorded as 0 bpm (Pulselessness / cardiac arrest suspected). Immediate carotid pulse palpation and CPR readiness required.');
  }
  if (hasCriticalHypoxia) {
    triggeredIds.push('CRIT-RULE-HYPOXIA');
    triggeredExpls.push(`Critical hypoxemia: SpO2 is ${data.spo2}% (< 90%). High-flow supplemental O2 required.`);
  }
  if (hasCriticalShock) {
    triggeredIds.push('CRIT-RULE-SHOCK-BP');
    triggeredExpls.push(`Severe hypotension: Systolic BP is ${data.systolic_bp} mmHg (< 90 mmHg shock threshold).`);
  }
  if (clientNLP.has_acute_chest_pain) {
    triggeredIds.push('CRIT-RULE-NLP-CHEST-PAIN');
    triggeredExpls.push('Acute cardiac chest pain symptoms identified in chief complaint. Urgent ECG and cardiac evaluation mandated.');
  }

  const redFlags = alerts.map((a) => a.message);
  if (clientNLP.has_acute_chest_pain && !redFlags.some((f) => f.includes('chest pain'))) {
    redFlags.push('Acute cardiac / chest pain detected in presenting complaint.');
  }

  const nlpPayload = {
    detected_language: clientNLP.detected_language,
    extracted_symptoms: clientNLP.extracted_symptoms,
    positive_concepts: clientNLP.positive_concepts,
    negated_concepts: clientNLP.negated_concepts,
    uncertain_concepts: clientNLP.uncertain_concepts,
    original_complaint: clientNLP.original_complaint,
    requires_complaint_review: clientNLP.requires_complaint_review,
    complaint_review_reason: clientNLP.complaint_review_reason,
  };

  if (isCritical) {
    return {
      triage_level: 1,
      triage_level_name: 'Level 1 - Resuscitation / Immediate',
      recommended_department: 'Emergency / Casualty',
      detected_red_flags: redFlags,
      model_explanation: '🚨 CRITICAL CLINICAL SAFETY OVERRIDE: Severe physiological red flag or acute emergency complaint triggered. Overrode recommendation to Level 1 / Emergency.',
      triggered_safety_rule_ids: triggeredIds,
      safety_rule_explanations: triggeredExpls,
      missing_data_warnings: missingWarnings,
      invalid_data_warnings: invalidWarnings,
      human_review_required: true,
      abstention_status: 'SAFETY_OVERRIDE',
      model_version: '2026.1-triage-ml-v1 (fallback)',
      rules_version: '2026.1-hackathon-domain-primer-v1',
      model_emergency_flag: true,
      clinical_disclaimer: 'HACKATHON PROTOCOL NOTICE: Assistive decision support only. Physician review required.',
      ...nlpPayload,
    };
  }

  // Check if data quality errors require abstention hold
  if (!validation.isValid) {
    return {
      triage_level: 2,
      triage_level_name: 'Priority Holding (Data Error)',
      recommended_department: 'General Medicine',
      detected_red_flags: redFlags,
      model_explanation: 'Model execution held: Input data contains validation or range errors requiring nurse correction.',
      triggered_safety_rule_ids: ['DATA_QUALITY_HOLD'],
      safety_rule_explanations: invalidWarnings,
      missing_data_warnings: missingWarnings,
      invalid_data_warnings: invalidWarnings,
      human_review_required: true,
      abstention_status: 'ABSTAINED_DATA_QUALITY_HOLD',
      model_version: 'none',
      rules_version: '2026.1-hackathon-domain-primer-v1',
      model_emergency_flag: false,
      clinical_disclaimer: 'Safety protocol active: Data quality hold requires manual nurse verification.',
      ...nlpPayload,
    };
  }

  // Check if complaint requires nurse review
  if (clientNLP.requires_complaint_review) {
    return {
      triage_level: 2,
      triage_level_name: 'Cannot assess safely — send to nurse now.',
      recommended_department: 'General Medicine',
      detected_red_flags: redFlags,
      model_explanation: `Cannot assess safely — send to nurse now: ${clientNLP.complaint_review_reason}`,
      triggered_safety_rule_ids: ['WARN-RULE-COMPLAINT-REVIEW'],
      safety_rule_explanations: [clientNLP.complaint_review_reason || 'Uncertain or ambiguous complaint text.'],
      missing_data_warnings: missingWarnings,
      invalid_data_warnings: invalidWarnings,
      human_review_required: true,
      abstention_status: 'ABSTAINED_COMPLAINT_UNCERTAIN',
      model_version: 'none',
      rules_version: '2026.1-hackathon-domain-primer-v1',
      model_emergency_flag: false,
      clinical_disclaimer: 'Cannot assess safely — send to nurse now. Complaint language is unconfirmed, contradictory, or ambiguous.',
      ...nlpPayload,
    };
  }

  // Standard evaluated recommendation
  const tempF = data.temperature !== null ? toFahrenheit(data.temperature, data.temperature_unit) : null;
  const isPriority = (data.age !== null && data.age > 70) || (tempF !== null && tempF >= 102.5) || alerts.length > 0;
  const level = isPriority ? 2 : 3;

  return {
    triage_level: level,
    triage_level_name: level === 2 ? 'Level 2 - Emergent' : 'Level 3 - Urgent',
    recommended_department: data.age !== null && data.age <= 12 ? 'Pediatrics' : 'General Medicine',
    detected_red_flags: redFlags,
    model_explanation: `Assessed as Level ${level} based on clinical complaints and physiological vital signs.`,
    triggered_safety_rule_ids: triggeredIds,
    safety_rule_explanations: triggeredExpls,
    missing_data_warnings: missingWarnings,
    invalid_data_warnings: invalidWarnings,
    human_review_required: level <= 2,
    abstention_status: 'EVALUATED',
    model_version: '2026.1-triage-ml-v1 (client baseline)',
    rules_version: '2026.1-hackathon-domain-primer-v1',
    model_emergency_flag: false,
    clinical_disclaimer: 'ASSISTIVE DECISION SUPPORT ONLY: This evaluation is generated by MediTriage AI. All assignments remain subject to physician review.',
    ...nlpPayload,
  };
}



