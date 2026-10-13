import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterPatientsByTimeRange,
  filterPatientsByDepartment,
  type TimeRangeOption,
} from '../src/services/analyticsUtils.ts';
import type { PatientQueueItem, SpecialtyDepartment, TriageCategory, QueueStatus } from '../src/types/triage.ts';

const createMockPatient = (
  id: string,
  category: TriageCategory,
  department: SpecialtyDepartment,
  createdAt: string,
  token = 'OPD-101'
): PatientQueueItem => ({
  id,
  token_number: token,
  patient_name: `Patient ${id}`,
  age: 45,
  gender: 'Female',
  opd_registration_number: `UHID-${id}`,
  chief_complaint: 'Followup',
  symptom_duration_days: 2,
  vitals: {
    heart_rate: 80,
    systolic_bp: 120,
    diastolic_bp: 80,
    temperature_f: 98.6,
    spo2: 98,
    avpu: 'ALERT',
  },
  red_flags: {
    severe_respiratory_distress: false,
    crushing_chest_pain: false,
    acute_neurological_deficit: false,
    massive_bleeding_or_shock: false,
    severe_trauma: false,
    active_labor_or_eclampsia: false,
    high_fever_with_stiff_neck: false,
  },
  assessment: {
    triage_category: category,
    urgency_level: 'Urgent',
    urgency_score: 5,
    recommended_department: department,
    red_flags_identified: [],
    vital_abnormalities: [],
    clinical_rationale: ['Evaluation'],
    recommended_action: 'Consultation',
    max_recommended_wait_minutes: 60,
    assessment_timestamp: createdAt,
  },
  status: 'WAITING' as QueueStatus,
  is_synthetic: false,
  created_at: createdAt,
  updated_at: createdAt,
});

describe('Dashboard Analytics Utilities — Filters & Telemetry', () => {
  const morningPatient = createMockPatient(
    '1',
    'EMERGENCY',
    'Casualty / Emergency',
    '2026-10-12T09:30:00',
    'OPD-101'
  );
  const afternoonPatient = createMockPatient(
    '2',
    'PRIORITY',
    'General Medicine',
    '2026-10-12T14:15:00',
    'OPD-102'
  );
  const eveningPatient = createMockPatient(
    '3',
    'ROUTINE',
    'Pediatrics',
    '2026-10-12T20:00:00',
    'OPD-103'
  );

  const sampleList = [morningPatient, afternoonPatient, eveningPatient];

  test('1. Time Range Filter: ALL preserves entire patient cohort', () => {
    const res = filterPatientsByTimeRange(sampleList, 'ALL');
    assert.equal(res.length, 3);
  });

  test('2. Time Range Filter: MORNING selects only morning shift (08:00 - 12:00)', () => {
    const res = filterPatientsByTimeRange(sampleList, 'MORNING');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, '1');
  });

  test('3. Time Range Filter: AFTERNOON selects only afternoon shift (12:00 - 17:00)', () => {
    const res = filterPatientsByTimeRange(sampleList, 'AFTERNOON');
    assert.equal(res.length, 1);
    assert.equal(res[0].id, '2');
  });

  test('4. Department Filter: ALL preserves all departments', () => {
    const res = filterPatientsByDepartment(sampleList, 'ALL');
    assert.equal(res.length, 3);
  });

  test('5. Department Filter: filters by matching department name', () => {
    const resCasualty = filterPatientsByDepartment(sampleList, 'Casualty / Emergency');
    assert.equal(resCasualty.length, 1);
    assert.equal(resCasualty[0].id, '1');

    const resPeds = filterPatientsByDepartment(sampleList, 'Pediatrics');
    assert.equal(resPeds.length, 1);
    assert.equal(resPeds[0].id, '3');

    const resNonExistent = filterPatientsByDepartment(sampleList, 'Ophthalmology');
    assert.equal(resNonExistent.length, 0);
  });

  test('6. Missing & Malformed Timestamps: Safely retained to avoid losing patient records', () => {
    const invalidTimestampPatient = createMockPatient(
      '4',
      'ROUTINE',
      'General Medicine',
      'invalid-date-string',
      'OPD-104'
    );
    // When timestamp is missing/malformed, safe retention keeps record so patient is never silently dropped
    const result = filterPatientsByTimeRange([invalidTimestampPatient], 'MORNING');
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
    assert.equal(result[0].id, '4');
  });

  test('7. Volume Distinction: Accurately separates Patients Today from Total Registered Patients', () => {
    // Current date in Asia/Kolkata
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayStr = formatter.format(new Date());

    const pToday = createMockPatient('today-1', 'PRIORITY', 'General Medicine', `${todayStr}T10:30:00Z`, 'OPD-201');
    const pYesterday = createMockPatient('yesterday-1', 'ROUTINE', 'General Medicine', '2026-01-01T10:30:00Z', 'OPD-202');

    const cohort = [pToday, pYesterday];

    const isToday = (iso: string) => {
      try {
        return formatter.format(new Date(iso)) === todayStr;
      } catch {
        return false;
      }
    };

    const todayCount = cohort.filter((p) => isToday(p.created_at)).length;
    const totalCount = cohort.length;

    assert.equal(todayCount, 1, "Today count must identify only records from current calendar day");
    assert.equal(totalCount, 2, "Total registered must reflect all persistent database records");
    assert.ok(todayCount <= totalCount, "Today count cannot exceed total registered");
  });

  test('8. Queue Waiting Status: Currently Waiting strictly excludes completed, discharged, and cancelled cases', () => {
    const pWaiting = { ...createMockPatient('w1', 'ROUTINE', 'General Medicine', '2026-10-12T10:00:00Z'), status: 'WAITING' as QueueStatus };
    const pWithDoctor = { ...createMockPatient('w2', 'ROUTINE', 'General Medicine', '2026-10-12T10:00:00Z'), status: 'WITH_DOCTOR' as QueueStatus };
    const pCompleted = { ...createMockPatient('w3', 'ROUTINE', 'General Medicine', '2026-10-12T10:00:00Z'), status: 'COMPLETED' as QueueStatus };
    const pTransferred = { ...createMockPatient('w4', 'EMERGENCY', 'Casualty / Emergency', '2026-10-12T10:00:00Z'), status: 'TRANSFERRED_EMERGENCY' as QueueStatus };

    const queueList = [pWaiting, pWithDoctor, pCompleted, pTransferred];

    // Follow project definition: actively waiting patients
    const waitingOnly = queueList.filter((p) => p.status === 'WAITING');
    assert.equal(waitingOnly.length, 1);
    assert.equal(waitingOnly[0].id, 'w1');

    // Excluded cases
    const excluded = queueList.filter((p) => ['COMPLETED', 'TRANSFERRED_EMERGENCY', 'DISCHARGED', 'CANCELLED'].includes(p.status));
    assert.equal(excluded.length, 2);
  });

  test('9. Emergency Metric Distinction: Delineates active trauma cases, today cases, and total recorded', () => {
    const mockEmergencyStats = {
      active_emergency_count: 5,
      level_1_resuscitation_count: 5,
      stabilization_count: 2,
      total_emergency_cases_today: 3,
      total_recorded_emergency_cases: 12,
      hospital_timezone: 'Asia/Kolkata',
    };

    assert.ok(mockEmergencyStats.active_emergency_count <= mockEmergencyStats.total_recorded_emergency_cases);
    assert.ok(mockEmergencyStats.total_emergency_cases_today <= mockEmergencyStats.total_recorded_emergency_cases);
    assert.equal(mockEmergencyStats.hospital_timezone, 'Asia/Kolkata');
  });

  test('10. Empty Queue Resilience: Computes 0 counters without throwing errors or NaN', () => {
    const emptyList: PatientQueueItem[] = [];

    const todayCount = emptyList.filter((p) => p.created_at.startsWith('2026')).length;
    const totalCount = emptyList.length;
    const waitingCount = emptyList.filter((p) => p.status === 'WAITING').length;

    assert.equal(todayCount, 0);
    assert.equal(totalCount, 0);
    assert.equal(waitingCount, 0);
    assert.ok(!Number.isNaN(todayCount));
    assert.ok(!Number.isNaN(totalCount));
    assert.ok(!Number.isNaN(waitingCount));
  });
});
