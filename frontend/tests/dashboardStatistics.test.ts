import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchStats,
  addToLocalDemoQueue,
  updatePatientCategory,
  updatePatientStatus,
  deletePatient,
  resetLocalDemoQueue,
  loadPersistedLocalQueue,
  subscribeToQueueUpdates,
  isPatientInHospitalToday,
} from '../src/services/api.ts';
import type { PatientQueueItem } from '../src/types/triage.ts';

// Ensure localStorage mock is present in Node test runtime
if (!globalThis.localStorage) {
  const memoryStore = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, val: string) => memoryStore.set(key, String(val)),
    removeItem: (key: string) => { memoryStore.delete(key); },
    clear: () => { memoryStore.clear(); },
    key: (idx: number) => Array.from(memoryStore.keys())[idx] ?? null,
    get length() {
      return memoryStore.size;
    },
  };
}

describe('MediTriage Dynamic Dashboard Statistics Requirements', () => {
  beforeEach(() => {
    // Reset to clean local demo queue before each test
    resetLocalDemoQueue();
  });

  test('1. Register a new patient and verify Total Patients and Patients Today increase correctly', async () => {
    const initialStats = await fetchStats();
    const initialTotal = initialStats.total_registered_patients ?? initialStats.total_patients;
    const initialToday = initialStats.patients_today;

    // Create a new patient registered right now (today in hospital local time)
    const newPatient: PatientQueueItem = {
      id: `P-TEST-REG-${Date.now()}`,
      token_number: 'T-999',
      patient_name: 'Test Today Patient',
      age: 35,
      gender: 'MALE',
      opd_registration_number: `OPD-REG-${Date.now()}`,
      chief_complaint: 'Mild fever and cough',
      symptom_duration_days: 1,
      vitals: {
        heart_rate: 76,
        systolic_bp: 120,
        diastolic_bp: 80,
        temperature_f: 99.1,
        spo2: 98,
        avpu: 'ALERT',
      },
      red_flags: {},
      assessment: {
        triage_category: 'ROUTINE',
        urgency_level: 'Level 3 - Routine',
        urgency_score: 3,
        recommended_department: 'General Medicine',
        red_flags_identified: [],
        vital_abnormalities: [],
        clinical_rationale: ['Stable vitals'],
        recommended_action: 'General OPD',
        max_recommended_wait_minutes: 120,
        assessment_timestamp: new Date().toISOString(),
        disclaimer: 'Prototype Clinical Decision Support',
      },
      status: 'WAITING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    addToLocalDemoQueue(newPatient);

    const updatedStats = await fetchStats();
    const updatedTotal = updatedStats.total_registered_patients ?? updatedStats.total_patients;
    const updatedToday = updatedStats.patients_today;

    assert.equal(updatedTotal, initialTotal + 1, 'Total Patients count must increment by 1');
    assert.equal(updatedToday, initialToday + 1, 'Patients Today count must increment by 1 when registered today');
  });

  test('2. Change a waiting patient triage category to critical and verify relevant counts update correctly', async () => {
    // Register a routine waiting patient
    const patientId = `P-CAT-CHANGE-${Date.now()}`;
    const testPatient: PatientQueueItem = {
      id: patientId,
      token_number: 'T-CAT-01',
      patient_name: 'Status Change Subject',
      age: 42,
      gender: 'FEMALE',
      opd_registration_number: `OPD-CAT-${Date.now()}`,
      chief_complaint: 'Moderate abdominal pain',
      symptom_duration_days: 2,
      vitals: {
        heart_rate: 82,
        systolic_bp: 125,
        diastolic_bp: 82,
        temperature_f: 98.6,
        spo2: 98,
        avpu: 'ALERT',
      },
      red_flags: {},
      assessment: {
        triage_category: 'ROUTINE',
        urgency_level: 'Level 3 - Routine',
        urgency_score: 4,
        recommended_department: 'General Medicine',
        red_flags_identified: [],
        vital_abnormalities: [],
        clinical_rationale: ['Routine assessment'],
        recommended_action: 'Standard queue',
        max_recommended_wait_minutes: 120,
        assessment_timestamp: new Date().toISOString(),
        disclaimer: 'Prototype',
      },
      status: 'WAITING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    addToLocalDemoQueue(testPatient);

    const statsBefore = await fetchStats();
    const emergencyBefore = statsBefore.emergency_cases;
    const routineBefore = statsBefore.routine_cases;

    // Escalate to EMERGENCY (Critical)
    await updatePatientCategory(patientId, 'EMERGENCY');

    const statsAfter = await fetchStats();
    const emergencyAfter = statsAfter.emergency_cases;
    const routineAfter = statsAfter.routine_cases;

    assert.equal(emergencyAfter, emergencyBefore + 1, 'Emergency/Critical cases count must increment by 1');
    assert.equal(routineAfter, routineBefore - 1, 'Routine cases count must decrement by 1');
  });

  test('3. Change a patient from waiting to completed and verify Waiting Patients decreases', async () => {
    const patientId = `P-WAIT-${Date.now()}`;
    const testPatient: PatientQueueItem = {
      id: patientId,
      token_number: 'T-WAIT-01',
      patient_name: 'Waiting Patient Test',
      age: 50,
      gender: 'MALE',
      opd_registration_number: `OPD-WAIT-${Date.now()}`,
      chief_complaint: 'Chronic back pain',
      symptom_duration_days: 14,
      vitals: {
        heart_rate: 70,
        systolic_bp: 118,
        diastolic_bp: 78,
        temperature_f: 98.4,
        spo2: 99,
        avpu: 'ALERT',
      },
      red_flags: {},
      assessment: {
        triage_category: 'ROUTINE',
        urgency_level: 'Level 3 - Routine',
        urgency_score: 3,
        recommended_department: 'Orthopedics',
        red_flags_identified: [],
        vital_abnormalities: [],
        clinical_rationale: ['Stable vitals'],
        recommended_action: 'OPD Consultation',
        max_recommended_wait_minutes: 120,
        assessment_timestamp: new Date().toISOString(),
        disclaimer: 'Prototype',
      },
      status: 'WAITING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    addToLocalDemoQueue(testPatient);

    const statsWaiting = await fetchStats();
    const waitingCountBefore = statsWaiting.currently_waiting;

    // Transition from WAITING to COMPLETED
    await updatePatientStatus(patientId, 'COMPLETED');

    const statsCompleted = await fetchStats();
    const waitingCountAfter = statsCompleted.currently_waiting;

    assert.equal(waitingCountAfter, waitingCountBefore - 1, 'Currently waiting count must decrease by 1 upon completion');
  });

  test('4. Register multiple patients and verify Priority Patients and Routine Cases reflect actual classifications', async () => {
    const statsStart = await fetchStats();
    const priorityStart = statsStart.priority_cases;
    const routineStart = statsStart.routine_cases;

    const p1: PatientQueueItem = {
      id: `P-MULTI-PRIO-${Date.now()}`,
      token_number: 'T-PRIO-01',
      patient_name: 'Priority Case Alpha',
      age: 60,
      gender: 'FEMALE',
      opd_registration_number: `OPD-P1-${Date.now()}`,
      chief_complaint: 'High fever and severe lethargy',
      symptom_duration_days: 3,
      vitals: {
        heart_rate: 104,
        systolic_bp: 138,
        diastolic_bp: 88,
        temperature_f: 102.5,
        spo2: 95,
        avpu: 'ALERT',
      },
      red_flags: {},
      assessment: {
        triage_category: 'PRIORITY',
        urgency_level: 'Level 2 - Priority',
        urgency_score: 7,
        recommended_department: 'General Medicine',
        red_flags_identified: ['High grade pyrexia'],
        vital_abnormalities: ['Tachycardia'],
        clinical_rationale: ['Priority attention required'],
        recommended_action: 'Priority Consultation',
        max_recommended_wait_minutes: 45,
        assessment_timestamp: new Date().toISOString(),
        disclaimer: 'Prototype',
      },
      status: 'WAITING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const p2: PatientQueueItem = {
      id: `P-MULTI-ROUT-${Date.now()}`,
      token_number: 'T-ROUT-01',
      patient_name: 'Routine Case Beta',
      age: 24,
      gender: 'MALE',
      opd_registration_number: `OPD-P2-${Date.now()}`,
      chief_complaint: 'Prescription refill for allergy',
      symptom_duration_days: 30,
      vitals: {
        heart_rate: 72,
        systolic_bp: 115,
        diastolic_bp: 75,
        temperature_f: 98.2,
        spo2: 99,
        avpu: 'ALERT',
      },
      red_flags: {},
      assessment: {
        triage_category: 'ROUTINE',
        urgency_level: 'Level 3 - Routine',
        urgency_score: 2,
        recommended_department: 'General Medicine',
        red_flags_identified: [],
        vital_abnormalities: [],
        clinical_rationale: ['Allergy medication renewal'],
        recommended_action: 'Routine Clinic',
        max_recommended_wait_minutes: 180,
        assessment_timestamp: new Date().toISOString(),
        disclaimer: 'Prototype',
      },
      status: 'WAITING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    addToLocalDemoQueue(p1);
    addToLocalDemoQueue(p2);

    const statsEnd = await fetchStats();
    assert.equal(statsEnd.priority_cases, priorityStart + 1, 'Priority cases must reflect the 1 newly added priority patient');
    assert.equal(statsEnd.routine_cases, routineStart + 1, 'Routine cases must reflect the 1 newly added routine patient');

    // Mutually exclusive category partition check:
    const totalAcuity = statsEnd.emergency_cases + statsEnd.priority_cases + statsEnd.routine_cases;
    const totalRecords = statsEnd.total_registered_patients ?? statsEnd.total_patients;
    assert.equal(totalAcuity, totalRecords, 'Emergency + Priority + Routine must sum exactly to Total Registered Patients');
  });

  test('5. Refresh the page (simulate by reloading from localStorage persistence) and confirm all counts remain consistent', async () => {
    // Add a unique patient
    const uniquePatientId = `P-REFRESH-${Date.now()}`;
    const p: PatientQueueItem = {
      id: uniquePatientId,
      token_number: 'T-REF-01',
      patient_name: 'Persistent Record Test',
      age: 48,
      gender: 'MALE',
      opd_registration_number: `OPD-REF-${Date.now()}`,
      chief_complaint: 'Persistent cough for 2 weeks',
      symptom_duration_days: 14,
      vitals: {
        heart_rate: 80,
        systolic_bp: 122,
        diastolic_bp: 80,
        temperature_f: 98.6,
        spo2: 97,
        avpu: 'ALERT',
      },
      red_flags: {},
      assessment: {
        triage_category: 'PRIORITY',
        urgency_level: 'Level 2 - Priority',
        urgency_score: 6,
        recommended_department: 'Pulmonology',
        red_flags_identified: [],
        vital_abnormalities: [],
        clinical_rationale: ['Subacute cough evaluation'],
        recommended_action: 'Pulmonology clinic review',
        max_recommended_wait_minutes: 60,
        assessment_timestamp: new Date().toISOString(),
        disclaimer: 'Prototype',
      },
      status: 'WAITING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    addToLocalDemoQueue(p);
    const statsBeforeReload = await fetchStats();

    // Verify localStorage has the persisted queue
    const rawStored = globalThis.localStorage?.getItem('meditriage_local_queue_records_v1');
    assert.ok(rawStored, 'localStorage key meditriage_local_queue_records_v1 must exist');

    // Simulate page reload: load from localStorage
    const reloadedQueue = loadPersistedLocalQueue();
    assert.ok(reloadedQueue && reloadedQueue.length > 0, 'Reloaded queue from storage must not be empty');
    assert.ok(reloadedQueue.some((item) => item.id === uniquePatientId), 'Added patient must be present in reloaded storage');

    const statsAfterReload = await fetchStats();
    assert.deepEqual(statsAfterReload, statsBeforeReload, 'All stats metrics must remain identical after storage reload/refresh');
  });

  test('6. Test deletion of a patient and real-time subscription update', async () => {
    let updateEventReceived = false;
    const unsubscribe = subscribeToQueueUpdates(() => {
      updateEventReceived = true;
    });

    const patientId = `P-DEL-${Date.now()}`;
    const patientToDelete: PatientQueueItem = {
      id: patientId,
      token_number: 'T-DEL-01',
      patient_name: 'Candidate For Deletion',
      age: 28,
      gender: 'FEMALE',
      opd_registration_number: `OPD-DEL-${Date.now()}`,
      chief_complaint: 'Mild sprain',
      symptom_duration_days: 1,
      vitals: {
        heart_rate: 74,
        systolic_bp: 118,
        diastolic_bp: 76,
        temperature_f: 98.4,
        spo2: 99,
        avpu: 'ALERT',
      },
      red_flags: {},
      assessment: {
        triage_category: 'ROUTINE',
        urgency_level: 'Level 3 - Routine',
        urgency_score: 2,
        recommended_department: 'Orthopedics',
        red_flags_identified: [],
        vital_abnormalities: [],
        clinical_rationale: ['Minor sprain'],
        recommended_action: 'General OPD',
        max_recommended_wait_minutes: 180,
        assessment_timestamp: new Date().toISOString(),
        disclaimer: 'Prototype',
      },
      status: 'WAITING',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    addToLocalDemoQueue(patientToDelete);
    assert.equal(updateEventReceived, true, 'Subscribers must be notified upon registration');

    updateEventReceived = false;
    const statsBeforeDelete = await fetchStats();
    const totalBefore = statsBeforeDelete.total_registered_patients ?? statsBeforeDelete.total_patients;

    await deletePatient(patientId);
    assert.equal(updateEventReceived, true, 'Subscribers must be notified upon record deletion');

    const statsAfterDelete = await fetchStats();
    const totalAfter = statsAfterDelete.total_registered_patients ?? statsAfterDelete.total_patients;
    assert.equal(totalAfter, totalBefore - 1, 'Total Patients count must decrease by 1 upon deletion');

    unsubscribe();
  });

  test('7. Timezone accuracy: Patients registered today vs previous dates', () => {
    const today = new Date().toISOString();
    assert.equal(isPatientInHospitalToday(today), true, 'Timestamp of today must return true');

    const pastDate = '2025-01-01T10:00:00.000Z';
    assert.equal(isPatientInHospitalToday(pastDate), false, 'Past timestamp must return false');

    assert.equal(isPatientInHospitalToday(undefined), false, 'Undefined timestamp must return false');
  });
});
