import type {
  HealthResponse,
  PatientTriageRequest,
  TriageAssessmentResult,
  PatientQueueItem,
  QueueStatus,
  QueueSummaryStats,
  DashboardSummaryMetrics,
  SavedPatientQueueItem,
  QueueAuditItem,
  QueueFiltersState,
  ModelEvaluationResponse,
  SimulationResponse,
  EmergencyCaseItem,
  EmergencyIntakePayload,
  EmergencyStatusUpdatePayload,
  EmergencyReassessmentPayload,
  EmergencyAuditItem,
  EmergencyStats,
  ObservationCreatePayload,
  ObservationItem,
  DeteriorationWarning,
  WarningAcknowledgePayload,
  ClinicianTriagePayload,
  ClinicianTriageInfo,
  DeteriorationWatchData,
  ExplainableAssessmentData,
} from '../types/triage.ts';
import {
  SYNTHETIC_DEMO_PATIENTS,
  SYNTHETIC_DEMO_EMERGENCY_CASES,
} from './mockData.ts';

import { auth } from './firebase.ts';

const API_BASE_URL = (typeof import.meta !== 'undefined' && (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL) || '/api';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (auth && auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        return { Authorization: `Bearer ${token}` };
      }
    } catch {
      // Gracefully continue without Authorization header if token retrieval fails
    }
  }
  return {};
}

function getApiUrl(path: string): string {
  const base =
    typeof window === 'undefined' && !API_BASE_URL.startsWith('http')
      ? `http://127.0.0.1:8000${API_BASE_URL}`
      : API_BASE_URL;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

// In-memory demo queue cache used when backend is offline
export let localDemoQueue: PatientQueueItem[] = [...SYNTHETIC_DEMO_PATIENTS];
export let localDemoEmergencyCases: EmergencyCaseItem[] = [...SYNTHETIC_DEMO_EMERGENCY_CASES];


export function addToLocalDemoQueue(item: PatientQueueItem): void {
  const existingIdx = localDemoQueue.findIndex(
    (i) => (item.id && i.id === item.id) || (item.token_number && i.token_number === item.token_number)
  );
  if (existingIdx >= 0) {
    localDemoQueue[existingIdx] = item;
  } else {
    localDemoQueue.unshift(item);
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(getApiUrl('/health'));
    if (!res.ok) {
      throw new Error(`Health check failed: ${res.statusText}`);
    }
    return await res.json();
  } catch {
    // Return fallback healthy status marked as local demo mode
    return {
      status: 'demo',
      service: 'MediTriage AI (Client Demo Mode)',
      environment: 'demo',
      version: '1.0.0-prototype',
      timestamp: new Date().toISOString(),
      hospital: 'District Civil Hospital OPD',
    };
  }
}

export async function assessPatient(payload: PatientTriageRequest): Promise<TriageAssessmentResult> {
  try {
    const res = await fetch(getApiUrl('/triage/assess'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Proceed to deterministic client-side evaluation fallback
  }

  // Deterministic client-side evaluation fallback
  return clientEvaluateTriage(payload);
}

export async function registerPatientToQueue(payload: PatientTriageRequest): Promise<PatientQueueItem> {
  try {
    const res = await fetch(getApiUrl('/triage/queue'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const item = await res.json();
      localDemoQueue.unshift(item);
      return item;
    }
  } catch {
    // Proceed to fallback
  }

  // Fallback registration into local demo queue
  const assessment = clientEvaluateTriage(payload);
  const tokenNum = `OPD-${localDemoQueue.length + 101}`;
  const now = new Date().toISOString();
  const newItem: PatientQueueItem = {
    id: `syn-${Date.now()}`,
    token_number: tokenNum,
    patient_name: payload.patient_name,
    age: payload.age,
    gender: payload.gender,
    opd_registration_number: payload.opd_registration_number || `UHID-2026-${Math.floor(100 + Math.random() * 900)}`,
    chief_complaint: payload.chief_complaint,
    symptom_duration_days: payload.symptom_duration_days || 0,
    vitals: payload.vitals,
    red_flags: payload.red_flags,
    clinical_notes: payload.clinical_notes,
    assessment,
    status: 'WAITING',
    created_at: now,
    updated_at: now,
    is_synthetic: true,
  };
  localDemoQueue.unshift(newItem);
  return newItem;
}

export async function fetchQueue(params?: {
  department?: string;
  category?: string;
  status?: string;
  search?: string;
}): Promise<PatientQueueItem[]> {
  try {
    const query = new URLSearchParams();
    if (params?.department) query.append('department', params.department);
    if (params?.category) query.append('category', params.category);
    if (params?.status) query.append('status', params.status);
    if (params?.search) query.append('search', params.search);

    const url = getApiUrl(`/triage/queue${query.toString() ? `?${query.toString()}` : ''}`);
    const res = await fetch(url);
    if (res.ok) {
      const data: PatientQueueItem[] = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch {
    // Fallback to local demo queue
  }

  // Apply filters to local demo queue
  let items = [...localDemoQueue];
  if (params?.category) {
    items = items.filter((i) => i.assessment.triage_category === params.category);
  }
  if (params?.status) {
    items = items.filter((i) => i.status === params.status);
  }
  if (params?.department) {
    const deptLower = params.department.toLowerCase();
    items = items.filter((i) => i.assessment.recommended_department.toLowerCase().includes(deptLower));
  }
  if (params?.search) {
    const s = params.search.toLowerCase();
    items = items.filter(
      (i) =>
        i.patient_name.toLowerCase().includes(s) ||
        (i.opd_registration_number && i.opd_registration_number.toLowerCase().includes(s)) ||
        i.token_number.toLowerCase().includes(s) ||
        i.chief_complaint.toLowerCase().includes(s)
    );
  }

  return items;
}

export async function updatePatientStatus(
  patientId: string,
  newStatus: QueueStatus,
  doctorRoom?: string
): Promise<PatientQueueItem> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(getApiUrl(`/triage/queue/${patientId}/status`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        status: newStatus,
        doctor_room: doctorRoom,
      }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Proceed to local update
  }

  // Update in local demo queue
  const idx = localDemoQueue.findIndex((i) => i.id === patientId);
  if (idx !== -1) {
    localDemoQueue[idx] = {
      ...localDemoQueue[idx],
      status: newStatus,
      updated_at: new Date().toISOString(),
      clinical_notes: doctorRoom
        ? `${localDemoQueue[idx].clinical_notes || ''} | Room: ${doctorRoom}`.trim()
        : localDemoQueue[idx].clinical_notes,
    };
    return localDemoQueue[idx];
  }

  throw new Error(`Patient with ID '${patientId}' not found in queue.`);
}

/**
 * Fetch persistent prioritized OPD patient queue from backend SQLite database
 */
export async function fetchSavedQueue(
  filters?: QueueFiltersState
): Promise<SavedPatientQueueItem[]> {
  try {
    const query = new URLSearchParams();
    if (filters?.triage_level) query.append('triage_level', filters.triage_level);
    if (filters?.category) query.append('category', filters.category);
    if (filters?.review_status) query.append('review_status', filters.review_status);
    if (filters?.status) query.append('status', filters.status);
    if (filters?.department) query.append('department', filters.department);
    if (filters?.search) query.append('search', filters.search);
    if (filters?.today_only) query.append('today_only', 'true');

    const url = getApiUrl(`/queue${query.toString() ? `?${query.toString()}` : ''}`);
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Backend /queue unreachable, using fallback saved queue:', err);
  }

  // Client-side fallback mapping from local demo queue
  let items: SavedPatientQueueItem[] = localDemoQueue.map((item, idx) => ({
    id: item.id,
    patient_id: item.opd_registration_number || `UHID-2026-${900 + idx}`,
    token_number: item.token_number,
    patient_name: item.patient_name,
    age: item.age,
    gender: item.gender,
    arrival_time: '08:30 AM',
    chief_complaint: item.chief_complaint,
    complaint_language: 'English',
    known_conditions: [],
    medications: '',
    systolic_bp: item.vitals.systolic_bp ?? null,
    diastolic_bp: item.vitals.diastolic_bp ?? null,
    pulse_bpm: item.vitals.heart_rate ?? null,
    temperature: item.vitals.temperature_f ?? null,
    temperature_unit: 'F',
    spo2: item.vitals.spo2 ?? null,
    triage_level: item.assessment.triage_category === 'EMERGENCY' ? 1 : item.assessment.triage_category === 'PRIORITY' ? 2 : 3,
    triage_level_name: item.assessment.urgency_level,
    recommended_department: item.assessment.recommended_department,
    urgency_score: item.assessment.urgency_score,
    warning_signs: item.assessment.red_flags_identified || [],
    assessment_status: 'EVALUATED',
    review_status: idx % 2 === 0 ? 'UNREVIEWED' : 'REVIEWED',
    reviewed_by: idx % 2 !== 0 ? 'Staff Nurse Anita' : null,
    reviewed_at: idx % 2 !== 0 ? new Date().toISOString() : null,
    review_notes: null,
    deterioration_flag: false,
    status: item.status,
    waiting_minutes: (idx + 1) * 12,
    is_critical_escalation: item.assessment.triage_category === 'EMERGENCY',
    is_synthetic: item.is_synthetic ?? true,
    created_at: item.created_at,
    updated_at: item.updated_at,
    disclaimer: item.assessment.disclaimer,
  }));

  if (filters?.triage_level) {
    const levelNum = parseInt(String(filters.triage_level), 10);
    items = items.filter((p) => p.triage_level === levelNum);
  }
  if (filters?.category) {
    const catUpper = filters.category.toUpperCase();
    if (catUpper === 'EMERGENCY') items = items.filter((p) => p.triage_level === 1);
    else if (catUpper === 'PRIORITY') items = items.filter((p) => p.triage_level === 2);
    else if (catUpper === 'ROUTINE') items = items.filter((p) => !p.triage_level || p.triage_level >= 3);
  }
  if (filters?.status) {
    items = items.filter((p) => p.status === filters.status);
  }
  if (filters?.today_only) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 86400000;
    items = items.filter((p) => {
      const t = new Date(p.created_at).getTime();
      return !isNaN(t) && t >= startOfToday && t < endOfToday;
    });
  }
  if (filters?.review_status) {
    items = items.filter((p) => p.review_status === filters.review_status);
  }
  if (filters?.department) {
    const deptLower = filters.department.toLowerCase();
    items = items.filter((p) => p.recommended_department?.toLowerCase().includes(deptLower));
  }
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    items = items.filter(
      (p) =>
        p.patient_id.toLowerCase().includes(s) ||
        (p.patient_name && p.patient_name.toLowerCase().includes(s)) ||
        p.token_number.toLowerCase().includes(s) ||
        p.chief_complaint.toLowerCase().includes(s)
    );
  }

  return items;
}

/**
 * Nurse marks a patient assessment as reviewed with audit log
 */
export async function markPatientReviewed(
  patientId: string,
  reviewedBy: string,
  reviewNotes?: string
): Promise<SavedPatientQueueItem> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(getApiUrl(`/queue/${encodeURIComponent(patientId)}/review`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      reviewed_by: reviewedBy,
      review_notes: reviewNotes,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to review patient (${res.status})`);
  }
  return await res.json();
}

/**
 * Staff flags clinical deterioration or requests acute escalation
 */
export async function flagPatientDeterioration(
  patientId: string,
  flaggedBy: string,
  reason: string,
  notes?: string
): Promise<SavedPatientQueueItem> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(getApiUrl(`/queue/${encodeURIComponent(patientId)}/deterioration`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      flagged_by: flaggedBy,
      reason: reason,
      notes: notes,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to flag deterioration (${res.status})`);
  }
  return await res.json();
}

/**
 * Re-evaluates patient triage assessment with updated vital parameters
 */
export async function reassessPatient(
  patientId: string,
  payload: {
    requested_by: string;
    updated_pulse?: number;
    updated_spo2?: number;
    updated_systolic_bp?: number;
    updated_diastolic_bp?: number;
    updated_temperature?: number;
    notes?: string;
  }
): Promise<SavedPatientQueueItem> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(getApiUrl(`/queue/${encodeURIComponent(patientId)}/reassess`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to reassess patient (${res.status})`);
  }
  return await res.json();
}

/**
 * Retrieve status change audit trail for a patient
 */
export async function fetchPatientAuditLogs(patientId: string): Promise<QueueAuditItem[]> {
  try {
    const res = await fetch(getApiUrl(`/queue/${encodeURIComponent(patientId)}/audit`));
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to load audit logs:', err);
  }
  return [];
}

export async function fetchStats(): Promise<QueueSummaryStats> {
  try {
    const res = await fetch(getApiUrl('/triage/stats'));
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Proceed to local stats calculation
  }

  // Compute stats dynamically from localDemoQueue
  const items = localDemoQueue;
  const deptCounts: Record<string, number> = {};
  for (const item of items) {
    const dept = item.assessment.recommended_department;
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86400000;
  const todayCount = items.filter((i) => {
    const t = new Date(i.created_at).getTime();
    return !isNaN(t) && t >= startOfToday && t < endOfToday;
  }).length;

  return {
    total_patients: items.length,
    waiting_count: items.filter((i) => i.status === 'WAITING').length,
    with_doctor_count: items.filter((i) => i.status === 'WITH_DOCTOR').length,
    needs_human_review_count: items.filter((i) => i.status === 'NEEDS_HUMAN_REVIEW').length,
    completed_count: items.filter((i) => i.status === 'COMPLETED').length,
    emergency_count: items.filter((i) => i.assessment.triage_category === 'EMERGENCY').length,
    priority_count: items.filter((i) => i.assessment.triage_category === 'PRIORITY').length,
    routine_count: items.filter((i) => i.assessment.triage_category === 'ROUTINE').length,
    departments_breakdown: deptCounts,
    patients_today: todayCount,
    total_registered_patients: items.length,
    currently_waiting: items.filter((i) => i.status === 'WAITING').length,
    hospital_timezone: 'Asia/Kolkata',
    active_emergency_cases: items.filter((i) => i.assessment.triage_category === 'EMERGENCY').length,
    today_emergency_cases: items.filter((i) => i.assessment.triage_category === 'EMERGENCY').length,
    total_recorded_emergency_cases: items.filter((i) => i.assessment.triage_category === 'EMERGENCY').length,
  };
}

export async function fetchDashboardSummaryMetrics(): Promise<DashboardSummaryMetrics> {
  const stats = await fetchStats();
  return {
    total_patients: stats.total_registered_patients ?? stats.total_patients,
    high_priority_cases: stats.emergency_count + stats.priority_count,
    awaiting_review_cases: stats.currently_waiting ?? stats.waiting_count,
    assessments_requiring_human_review: stats.needs_human_review_count ?? 0,
    patients_today: stats.patients_today,
    total_registered_patients: stats.total_registered_patients ?? stats.total_patients,
    currently_waiting: stats.currently_waiting ?? stats.waiting_count,
    hospital_timezone: stats.hospital_timezone || 'Asia/Kolkata',
    active_emergency_cases: stats.active_emergency_cases,
    today_emergency_cases: stats.today_emergency_cases,
    total_recorded_emergency_cases: stats.total_recorded_emergency_cases,
    emergency_cases: stats.emergency_count,
    priority_cases: stats.priority_count,
    routine_cases: stats.routine_count,
  };
}

export async function fetchDepartments(): Promise<string[]> {
  try {
    const res = await fetch(getApiUrl('/departments'));
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Proceed to fallback
  }

  return [
    'Casualty / Emergency',
    'General Medicine',
    'Cardiology',
    'Pulmonology',
    'Pediatrics',
    'Orthopedics',
    'Obstetrics & Gynecology',
    'General Surgery',
    'ENT (Ear, Nose, Throat)',
    'Ophthalmology',
    'Dermatology',
    'Psychiatry',
  ];
}

// Client-side rule evaluator for standalone offline demonstration
function clientEvaluateTriage(req: PatientTriageRequest): TriageAssessmentResult {
  const redFlags: string[] = [];
  const vitalAlerts: string[] = [];
  const rationale: string[] = [];

  const rf = req.red_flags;
  const v = req.vitals;

  if (rf.severe_respiratory_distress) redFlags.push('Severe respiratory distress / acute breathing compromise');
  if (rf.crushing_chest_pain) redFlags.push('Acute crushing cardiac chest pain');
  if (rf.acute_neurological_deficit) redFlags.push('Acute neurological deficit (facial droop or weakness)');
  if (rf.massive_bleeding_or_shock) redFlags.push('Massive hemorrhage / circulatory shock');
  if (rf.severe_trauma) redFlags.push('Severe trauma / polytrauma');
  if (rf.active_labor_or_eclampsia) redFlags.push('Active emergency labor / eclampsia');
  if (rf.high_fever_with_stiff_neck) redFlags.push('High fever with meningismus signs');
  if (rf.severe_dehydration_lethargy) redFlags.push('Severe dehydration / lethargy');

  if (v.spo2 != null && !isNaN(v.spo2)) {
    if (v.spo2 < 90) vitalAlerts.push(`Critical Hypoxemia (SpO2 ${v.spo2}% < 90%)`);
    else if (v.spo2 <= 94) vitalAlerts.push(`Borderline Hypoxemia (SpO2 ${v.spo2}%)`);
  }
  if (v.heart_rate != null && !isNaN(v.heart_rate)) {
    if (v.heart_rate > 130 || v.heart_rate < 40) vitalAlerts.push(`Severe Tachy/Bradycardia (${v.heart_rate} bpm)`);
    else if (v.heart_rate > 105 || v.heart_rate < 50) vitalAlerts.push(`Borderline Heart Rate (${v.heart_rate} bpm)`);
  }
  if (v.systolic_bp != null && !isNaN(v.systolic_bp)) {
    if (v.systolic_bp < 90 || v.systolic_bp >= 200) vitalAlerts.push(`Critical BP (${v.systolic_bp} mmHg)`);
    else if (v.systolic_bp >= 160 || v.systolic_bp < 100) vitalAlerts.push(`Abnormal BP (${v.systolic_bp} mmHg)`);
  }
  if (v.respiratory_rate != null && !isNaN(v.respiratory_rate)) {
    if (v.respiratory_rate > 30 || v.respiratory_rate < 8) vitalAlerts.push(`Critical Respiratory Rate (${v.respiratory_rate}/min)`);
    else if (v.respiratory_rate > 22) vitalAlerts.push(`Tachypnea (${v.respiratory_rate}/min)`);
  }

  const isEmergency =
    redFlags.length > 0 ||
    v.avpu === 'UNRESPONSIVE' ||
    v.avpu === 'PAIN' ||
    (v.spo2 != null && v.spo2 < 90) ||
    (v.heart_rate != null && (v.heart_rate > 130 || v.heart_rate < 40)) ||
    (v.systolic_bp != null && (v.systolic_bp < 90 || v.systolic_bp >= 200));

  const isPriority =
    !isEmergency &&
    (vitalAlerts.length > 0 ||
      v.avpu === 'VERBAL' ||
      (req.age < 5 && v.temperature_f != null && v.temperature_f >= 101) ||
      (req.age > 65 && v.systolic_bp != null && v.systolic_bp >= 160));

  let category: 'EMERGENCY' | 'PRIORITY' | 'ROUTINE' = 'ROUTINE';
  let urgencyLevel = 'GREEN - ROUTINE OPD QUEUE';
  let urgencyScore = 3;
  let waitMin = 120;
  let action = 'Standard consultation queue according to registration token.';
  let dept = 'General Medicine';

  if (isEmergency) {
    category = 'EMERGENCY';
    urgencyLevel = 'RED - IMMEDIATE CASUALTY ALERT';
    urgencyScore = 9;
    waitMin = 0;
    action = 'Immediate transfer to Emergency Resuscitation / Casualty Ward without queuing.';
    dept = 'Casualty / Emergency';
    rationale.push('Critical red-flag symptoms or life-threatening vital sign derangement detected.');
  } else if (isPriority) {
    category = 'PRIORITY';
    urgencyLevel = 'YELLOW - URGENT OPD ATTENTION';
    urgencyScore = 6;
    waitMin = 30;
    action = 'Fast-track in current OPD specialty queue; reassess vitals every 20-30 minutes.';
    dept = req.age < 14 ? 'Pediatrics' : 'General Medicine';
    rationale.push('Significant physiological derangement requiring priority clinical review.');
  } else {
    rationale.push('Vital signs are within stable parameters with no acute red flags.');
  }

  if (redFlags.length) rationale.push(...redFlags.map((r) => `Red Flag: ${r}`));
  if (vitalAlerts.length) rationale.push(...vitalAlerts.map((v) => `Vital Alert: ${v}`));

  return {
    triage_category: category,
    urgency_level: urgencyLevel,
    urgency_score: urgencyScore,
    recommended_department: dept,
    red_flags_identified: redFlags,
    vital_abnormalities: vitalAlerts,
    clinical_rationale: rationale,
    recommended_action: action,
    max_recommended_wait_minutes: waitMin,
    assessment_timestamp: new Date().toISOString(),
    disclaimer:
      'PROTOTYPE DECISION-SUPPORT NOTICE: This automated assessment provides rule-based clinical triage prioritization assistance. It does not constitute a medical diagnosis or replace clinical evaluation by licensed medical professionals.',
  };
}

/**
 * Fetch authentic machine-learning model evaluation metrics across splits
 */
export async function fetchModelEvaluation(
  artifactsDir?: string
): Promise<ModelEvaluationResponse> {
  const query = artifactsDir ? `?artifacts_dir=${encodeURIComponent(artifactsDir)}` : '';
  const res = await fetch(getApiUrl(`/model/evaluation${query}`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch model evaluation (${res.status})`);
  }
  return await res.json();
}

/**
 * Trigger backend model training and evaluation job
 */
export async function runModelEvaluationJob(params?: {
  synthetic_samples?: number;
  random_seed?: number;
  use_xgboost?: boolean;
}): Promise<{ success: boolean; message: string; evaluation: ModelEvaluationResponse }> {
  const res = await fetch(getApiUrl('/model/evaluate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Model evaluation job failed (${res.status})`);
  }
  return await res.json();
}

/**
 * Fetch reproducible demo patient arrival log
 */
export async function fetchDemoArrivals(
  nPatients: number = 50,
  randomSeed: number = 42
): Promise<any[]> {
  const res = await fetch(
    getApiUrl(`/simulation/demo-arrivals?n_patients=${nPatients}&random_seed=${randomSeed}`)
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch demo arrivals (${res.status})`);
  }
  return await res.json();
}

/**
 * Run discrete-event queue simulation comparing FCFS vs Triage-assisted policies
 */
export async function runQueueSimulation(params: {
  num_doctors?: number;
  n_patients?: number;
  random_seed?: number;
  service_time_emergency?: number;
  service_time_priority?: number;
  service_time_routine?: number;
  starvation_reassessment_threshold?: number;
  emergency_proportion?: number;
  scenario_duration_minutes?: number;
  avg_service_duration?: number;
  custom_arrivals?: any[];
}): Promise<SimulationResponse> {
  const res = await fetch(getApiUrl('/simulation/run'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Queue simulation failed (${res.status})`);
  }
  return await res.json();
}

// ============================================================================
// Feature 2, 3, 4, 5, 6: Emergency Accident Intake & Rapid Triage Client API
// ============================================================================

/**
 * Creates or activates an acute emergency case with automatic fallback and retry safety.
 */
export async function createEmergencyCase(
  payload: EmergencyIntakePayload
): Promise<EmergencyCaseItem> {
  try {
    const res = await fetch(getApiUrl('/emergency/intake'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data: EmergencyCaseItem = await res.json();
      const existingIdx = localDemoEmergencyCases.findIndex((c) => c.case_id === data.case_id);
      if (existingIdx >= 0) {
        localDemoEmergencyCases[existingIdx] = data;
      } else {
        localDemoEmergencyCases.unshift(data);
      }
      return data;
    }
  } catch (err) {
    console.warn('Backend /emergency/intake unreachable, generating resilient client-side case:', err);
  }

  // Fallback creation into localDemoEmergencyCases with idempotency check
  const caseId =
    payload.case_id ||
    `EMG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  const existing = localDemoEmergencyCases.find((c) => c.case_id === caseId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const flags = [...(payload.red_flags || [])];
  if (payload.pulse_bpm != null && (payload.pulse_bpm === 0 || payload.pulse_bpm > 130 || payload.pulse_bpm < 40)) {
    flags.push(`Abnormal Pulse (${payload.pulse_bpm} bpm)`);
  }
  if (payload.spo2 != null && payload.spo2 < 90) {
    flags.push(`Severe Hypoxemia (SpO2 ${payload.spo2}%)`);
  }
  if (payload.systolic_bp != null && payload.systolic_bp < 90) {
    flags.push(`Hypotensive Shock (SBP ${payload.systolic_bp} mmHg)`);
  }

  const fallbackItem: EmergencyCaseItem = {
    id: `emg-syn-${Date.now()}`,
    case_id: caseId,
    patient_identity_status: payload.patient_identity_status || 'NOT_YET_VERIFIED',
    patient_name: payload.patient_name || null,
    approximate_age: payload.approximate_age ?? null,
    gender: payload.gender || 'Unknown',
    accident_type: payload.accident_type,
    mechanism_of_injury: payload.mechanism_of_injury || null,
    arrival_time: payload.arrival_time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    arrival_datetime: now,
    elapsed_minutes: 0,
    airway_status: payload.airway_status || 'Intact',
    breathing_status: payload.breathing_status || 'Normal',
    circulation_status: payload.circulation_status || 'Palpable',
    neurological_status: payload.neurological_status || 'Alert',
    major_bleeding: payload.major_bleeding || 'None',
    pulse_bpm: payload.pulse_bpm ?? null,
    systolic_bp: payload.systolic_bp ?? null,
    diastolic_bp: payload.diastolic_bp ?? null,
    respiratory_rate: payload.respiratory_rate ?? null,
    spo2: payload.spo2 ?? null,
    temperature_f: payload.temperature_f ?? null,
    gcs_score: payload.gcs_score ?? null,
    red_flags: flags,
    escalation_reason: payload.escalation_reason || `Acute ${payload.accident_type} trauma response activated`,
    triage_category: 'LEVEL_1_RESUSCITATION',
    urgency_level: 'Level 1 - Immediate Resuscitation',
    immediate_actions_taken: payload.immediate_actions_taken || null,
    status: 'RESPONSE_ACTIVATED',
    activated_by: payload.activated_by || 'Emergency Staff',
    activated_at: now,
    assigned_resuscitation_bay: payload.assigned_resuscitation_bay || 'Red Trauma Bay 01',
    reassessment_status: 'PENDING_PRIMARY_SURVEY',
    reassessed_at: null,
    is_synthetic: true,
    created_at: now,
    updated_at: now,
    hospital_protocol_instructions: [
      '1. IMMEDIATE BAY ACTIVATION: Direct patient straight to designated Red Resuscitation Bay. Zero registration delay.',
      '2. STAT TRAUMA NOTIFICATION: Alert Casualty Medical Officer (CMO), Trauma Surgeon on call, and Anesthesiologist.',
      '3. AIRWAY & CERVICAL SPINE: Maintain in-line cervical stabilization. Prepare suction and RSI kit if indicated.',
      '4. BREATHING & OXYGENATION: Administer 100% high-flow oxygen via non-rebreather mask (15 L/min). Auscultate bilateral breath sounds.',
      '5. CIRCULATION & SHOCK: Secure dual large-bore IV lines (14G or 16G). Infuse warm balanced crystalloid. Send STAT Type & Crossmatch.',
      '6. BEDSIDE ULTRASOUND: Perform immediate eFAST scan for internal bleeding.',
      '7. CONTINUOUS MONITORING: Maintain continuous vitals telemetry (ECG, SpO2, NIBP).',
    ],
    clinical_disclaimer:
      'CRITICAL CLINICAL DECISION-SUPPORT NOTICE: This rapid emergency accident workflow initiates hospital resuscitation protocols. Clinical decisions, diagnoses, and interventions must be directed by qualified emergency healthcare professionals.',
  };

  localDemoEmergencyCases.unshift(fallbackItem);
  return fallbackItem;
}

/**
 * Fetches active emergency trauma cases from backend or local cache.
 */
export async function fetchEmergencyCases(params?: {
  status?: string;
  accident_type?: string;
  search?: string;
  include_completed?: boolean;
}): Promise<EmergencyCaseItem[]> {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.accident_type) query.append('accident_type', params.accident_type);
    if (params?.search) query.append('search', params.search);
    if (params?.include_completed) query.append('include_completed', 'true');

    const url = getApiUrl(`/emergency/cases${query.toString() ? `?${query.toString()}` : ''}`);
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Backend /emergency/cases unreachable, using local fallback cases:', err);
  }

  // Local fallback
  let items = [...localDemoEmergencyCases];
  if (!params?.include_completed) {
    items = items.filter((c) => !['COMPLETED', 'TRANSFERRED', 'ADMITTED'].includes(c.status));
  }
  if (params?.status) {
    items = items.filter((c) => c.status === params.status);
  }
  if (params?.accident_type) {
    items = items.filter((c) => c.accident_type === params.accident_type);
  }
  if (params?.search) {
    const s = params.search.toLowerCase();
    items = items.filter(
      (c) =>
        c.case_id.toLowerCase().includes(s) ||
        (c.patient_name && c.patient_name.toLowerCase().includes(s)) ||
        (c.mechanism_of_injury && c.mechanism_of_injury.toLowerCase().includes(s))
    );
  }
  return items;
}

/**
 * Retrieves details for a specific emergency case.
 */
export async function getEmergencyCase(caseId: string): Promise<EmergencyCaseItem> {
  try {
    const res = await fetch(getApiUrl(`/emergency/cases/${encodeURIComponent(caseId)}`));
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn(`Backend /emergency/cases/${caseId} unreachable:`, err);
  }

  const found = localDemoEmergencyCases.find((c) => c.case_id === caseId || c.id === caseId);
  if (found) {
    return found;
  }
  throw new Error(`Emergency case '${caseId}' not found.`);
}

/**
 * Updates lifecycle status for an emergency case.
 */
export async function updateEmergencyCaseStatus(
  caseId: string,
  payload: EmergencyStatusUpdatePayload
): Promise<EmergencyCaseItem> {
  try {
    const res = await fetch(getApiUrl(`/emergency/cases/${encodeURIComponent(caseId)}/status`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = localDemoEmergencyCases.findIndex((c) => c.case_id === caseId || c.id === caseId);
      if (idx >= 0) localDemoEmergencyCases[idx] = updated;
      return updated;
    }
  } catch (err) {
    console.warn(`Backend status update unreachable for ${caseId}:`, err);
  }

  const idx = localDemoEmergencyCases.findIndex((c) => c.case_id === caseId || c.id === caseId);
  if (idx >= 0) {
    localDemoEmergencyCases[idx] = {
      ...localDemoEmergencyCases[idx],
      status: payload.status,
      assigned_resuscitation_bay: payload.assigned_resuscitation_bay || localDemoEmergencyCases[idx].assigned_resuscitation_bay,
      updated_at: new Date().toISOString(),
    };
    return localDemoEmergencyCases[idx];
  }
  throw new Error(`Emergency case '${caseId}' not found.`);
}

/**
 * Reassesses ABCDE observations and vitals for an emergency case.
 */
export async function reassessEmergencyCase(
  caseId: string,
  payload: EmergencyReassessmentPayload
): Promise<EmergencyCaseItem> {
  try {
    const res = await fetch(getApiUrl(`/emergency/cases/${encodeURIComponent(caseId)}/reassess`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const updated = await res.json();
      const idx = localDemoEmergencyCases.findIndex((c) => c.case_id === caseId || c.id === caseId);
      if (idx >= 0) localDemoEmergencyCases[idx] = updated;
      return updated;
    }
  } catch (err) {
    console.warn(`Backend reassessment unreachable for ${caseId}:`, err);
  }

  const idx = localDemoEmergencyCases.findIndex((c) => c.case_id === caseId || c.id === caseId);
  if (idx >= 0) {
    const prev = localDemoEmergencyCases[idx];
    localDemoEmergencyCases[idx] = {
      ...prev,
      airway_status: payload.airway_status ?? prev.airway_status,
      breathing_status: payload.breathing_status ?? prev.breathing_status,
      circulation_status: payload.circulation_status ?? prev.circulation_status,
      neurological_status: payload.neurological_status ?? prev.neurological_status,
      major_bleeding: payload.major_bleeding ?? prev.major_bleeding,
      pulse_bpm: payload.pulse_bpm ?? prev.pulse_bpm,
      systolic_bp: payload.systolic_bp ?? prev.systolic_bp,
      diastolic_bp: payload.diastolic_bp ?? prev.diastolic_bp,
      respiratory_rate: payload.respiratory_rate ?? prev.respiratory_rate,
      spo2: payload.spo2 ?? prev.spo2,
      temperature_f: payload.temperature_f ?? prev.temperature_f,
      gcs_score: payload.gcs_score ?? prev.gcs_score,
      reassessment_status: payload.reassessment_status || 'PRIMARY_SURVEY_COMPLETED',
      reassessed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return localDemoEmergencyCases[idx];
  }
  throw new Error(`Emergency case '${caseId}' not found.`);
}

/**
 * Retrieves audit log history for an emergency case.
 */
export async function fetchEmergencyCaseAudit(caseId: string): Promise<EmergencyAuditItem[]> {
  try {
    const res = await fetch(getApiUrl(`/emergency/cases/${encodeURIComponent(caseId)}/audit`));
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to load emergency audit logs:', err);
  }
  return [
    {
      id: 1,
      case_id: caseId,
      previous_status: null,
      new_status: 'RESPONSE_ACTIVATED',
      action_type: 'EMERGENCY_ACTIVATED',
      performed_by: 'Emergency Triage Nurse',
      notes: 'Initial emergency response activated at trauma desk',
      created_at: new Date().toISOString(),
    },
  ];
}

/**
 * Retrieves emergency trauma workload stats.
 */
export async function fetchEmergencyStats(): Promise<EmergencyStats> {
  try {
    const res = await fetch(getApiUrl('/emergency/stats'));
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend /emergency/stats unreachable:', err);
  }

  const active = localDemoEmergencyCases.filter(
    (c) => !['COMPLETED', 'TRANSFERRED', 'ADMITTED'].includes(c.status)
  );
  return {
    active_emergency_count: active.length,
    level_1_resuscitation_count: active.filter((c) => c.triage_category === 'LEVEL_1_RESUSCITATION').length,
    stabilization_count: active.filter((c) => ['INITIAL_ASSESSMENT', 'STABILIZATION_IN_PROGRESS'].includes(c.status)).length,
    total_emergency_cases_today: localDemoEmergencyCases.length,
  };
}

// ============================================================================
// Deterioration Watch & Explainable Assessment API Handlers
// ============================================================================

/**
 * Fetches clinician-facing deterioration watch observations, deltas, and warning flags.
 */
export async function fetchDeteriorationWatch(
  patientId: string,
  rulesConfigured: boolean = true
): Promise<DeteriorationWatchData> {
  const url = getApiUrl(`/patients/${encodeURIComponent(patientId)}/deterioration-watch?rules_configured=${rulesConfigured}`);
  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to load deterioration watch data: ${errorText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Records a new timestamped physiological observation for a patient by authorized staff.
 */
export async function recordObservation(
  patientId: string,
  payload: ObservationCreatePayload,
  rulesConfigured: boolean = true
): Promise<ObservationItem> {
  const authHeaders = await getAuthHeaders();
  const url = getApiUrl(`/patients/${encodeURIComponent(patientId)}/observations?rules_configured=${rulesConfigured}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to record observation: ${errorText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Acknowledges or transitions a deterioration warning status with clinician notes.
 */
export async function acknowledgeWarning(
  patientId: string,
  warningId: string | number,
  payload: WarningAcknowledgePayload
): Promise<DeteriorationWarning> {
  const authHeaders = await getAuthHeaders();
  const url = getApiUrl(`/patients/${encodeURIComponent(patientId)}/warnings/${encodeURIComponent(String(warningId))}/acknowledge`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to acknowledge warning: ${errorText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Records clinician-assigned triage category and mandatory clinical override notes.
 */
export async function recordClinicianTriage(
  patientId: string,
  payload: ClinicianTriagePayload
): Promise<ClinicianTriageInfo> {
  const authHeaders = await getAuthHeaders();
  const url = getApiUrl(`/patients/${encodeURIComponent(patientId)}/clinician-triage`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to record clinician triage: ${errorText || res.statusText}`);
  }
  return await res.json();
}

/**
 * Fetches explainable assessment breakdown with separate sections for model suggestions,
 * rules, red flags, missing info, and human review audit trail.
 */
export async function fetchExplainableAssessment(
  patientId: string
): Promise<ExplainableAssessmentData> {
  const url = getApiUrl(`/patients/${encodeURIComponent(patientId)}/explainable-assessment`);
  const res = await fetch(url);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to load explainable assessment: ${errorText || res.statusText}`);
  }
  return await res.json();
}



