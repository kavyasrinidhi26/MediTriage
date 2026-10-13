import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmergencyCase,
  fetchEmergencyCases,
  updateEmergencyCaseStatus,
  reassessEmergencyCase,
  fetchEmergencyStats,
  fetchSavedQueue,
} from '../src/services/api.ts';
import type {
  EmergencyCaseItem,
  EmergencyIntakePayload,
  EmergencyStatusUpdatePayload,
} from '../src/types/triage.ts';

describe('Emergency Accident Intake & Rapid Triage Workflow', () => {
  test('1. Unknown Identity Intake: Accident patient receives an emergency case ID without routine registration', async () => {
    const payload: EmergencyIntakePayload = {
      patient_identity_status: 'UNKNOWN',
      accident_type: 'ROAD_TRAFFIC_ACCIDENT',
      mechanism_of_injury: 'Pedestrian struck by heavy vehicle on highway',
      airway_status: 'Compromised',
      breathing_status: 'Severe Distress',
      circulation_status: 'Weak Thread',
      neurological_status: 'Unresponsive (U)',
      major_bleeding: 'Massive Scalp Laceration',
      pulse_bpm: 130,
      systolic_bp: 80,
      diastolic_bp: 50,
      spo2: 86.0,
      gcs_score: 7,
      red_flags: ['High-Velocity Impact', 'Hemorrhagic Shock', 'Airway Compromised'],
      activated_by: 'Staff Nurse Sunita',
      assigned_resuscitation_bay: 'Red Trauma Bay 01',
    };

    const emergencyCase: EmergencyCaseItem = await createEmergencyCase(payload);

    assert.ok(emergencyCase.case_id.startsWith('EMG-'), 'Must generate unique EMG case ID');
    assert.equal(emergencyCase.patient_identity_status, 'UNKNOWN');
    assert.equal(emergencyCase.status, 'RESPONSE_ACTIVATED');
    assert.equal(emergencyCase.triage_category, 'LEVEL_1_RESUSCITATION');
    assert.ok(emergencyCase.hospital_protocol_instructions.length > 0, 'Must include resuscitation protocol');
    assert.ok(emergencyCase.clinical_disclaimer.includes('CRITICAL CLINICAL DECISION-SUPPORT NOTICE'));
  });

  test('2. Immediate Activation & Queue Presence: Case appears in dedicated emergency queue', async () => {
    const cases = await fetchEmergencyCases();
    assert.ok(Array.isArray(cases));
    assert.ok(cases.length > 0, 'Emergency queue must contain active trauma cases');

    // All cases in emergency queue must have EMG IDs and Level 1 triage
    for (const c of cases) {
      assert.ok(c.case_id.startsWith('EMG-'));
      assert.equal(c.triage_category, 'LEVEL_1_RESUSCITATION');
      assert.ok(c.elapsed_minutes >= 0);
    }
  });

  test('3. Idempotent Retry Safety: Retrying with same case ID prevents duplicate records', async () => {
    const uniqueCaseId = `EMG-TEST-RETRY-${Date.now()}`;
    const payload: EmergencyIntakePayload = {
      case_id: uniqueCaseId,
      patient_identity_status: 'NOT_YET_VERIFIED',
      accident_type: 'FALL',
      mechanism_of_injury: 'Fall from 15ft ladder',
    };

    // First attempt
    const case1 = await createEmergencyCase(payload);
    assert.equal(case1.case_id, uniqueCaseId);

    // Simulated network retry with identical case ID
    const case2 = await createEmergencyCase(payload);
    assert.equal(case2.case_id, uniqueCaseId);
    assert.equal(case2.id, case1.id, 'Must return same case instance on retry');

    // Verify queue does not contain duplicate
    const allCases = await fetchEmergencyCases({ search: uniqueCaseId, include_completed: true });
    const duplicates = allCases.filter((c) => c.case_id === uniqueCaseId);
    assert.equal(duplicates.length, 1, 'Retry must not duplicate emergency records');
  });

  test('4. Queue Separation: Routine OPD queue remains separate and functional', async () => {
    const routineQueue = await fetchSavedQueue();
    assert.ok(Array.isArray(routineQueue));
    assert.ok(routineQueue.length > 0);

    // Routine items use OPD token numbers, not emergency trauma case IDs
    for (const item of routineQueue) {
      assert.ok(item.token_number.startsWith('OPD-'));
    }
  });

  test('5. Lifecycle Transitions & Timestamps: Case moves through clinical states', async () => {
    // Create new case
    const created = await createEmergencyCase({
      accident_type: 'WORKPLACE_ACCIDENT',
      mechanism_of_injury: 'Industrial machinery crush injury',
      patient_identity_status: 'KNOWN',
      patient_name: 'Dinesh Chandra',
    });

    // Update status to INITIAL_ASSESSMENT
    const updated1 = await updateEmergencyCaseStatus(created.case_id, {
      status: 'INITIAL_ASSESSMENT',
      updated_by: 'Dr. R. Nair',
      notes: 'Patient in Trauma Bay 01; eFAST scan initiated',
    });
    assert.equal(updated1.status, 'INITIAL_ASSESSMENT');

    // Update status to STABILIZATION_IN_PROGRESS
    const updated2 = await updateEmergencyCaseStatus(created.case_id, {
      status: 'STABILIZATION_IN_PROGRESS',
      updated_by: 'Staff Nurse Leela',
      notes: 'Blood products infusing, BP responsive',
    });
    assert.equal(updated2.status, 'STABILIZATION_IN_PROGRESS');
  });

  test('6. Reassessment Documentation: Staff updates ABCDE survey and vital signs', async () => {
    const created = await createEmergencyCase({
      accident_type: 'BURN',
      mechanism_of_injury: 'Flash burn 25% TBSA',
    });

    const reassessed = await reassessEmergencyCase(created.case_id, {
      reassessed_by: 'Casualty Medical Officer',
      airway_status: 'Intact / Airway Protected',
      breathing_status: 'Normal',
      circulation_status: 'Palpable Regular',
      pulse_bpm: 96,
      systolic_bp: 110,
      diastolic_bp: 70,
      spo2: 97.0,
      reassessment_status: 'PRIMARY_SURVEY_COMPLETED',
      notes: 'Parkland formula fluids on schedule',
    });

    assert.equal(reassessed.pulse_bpm, 96);
    assert.equal(reassessed.spo2, 97.0);
    assert.equal(reassessed.reassessment_status, 'PRIMARY_SURVEY_COMPLETED');
  });

  test('7. Emergency Stats: Live counters report trauma workload accurately', async () => {
    const stats = await fetchEmergencyStats();
    assert.ok(typeof stats.active_emergency_count === 'number');
    assert.ok(typeof stats.level_1_resuscitation_count === 'number');
    assert.ok(typeof stats.stabilization_count === 'number');
    assert.ok(stats.active_emergency_count >= 1);
  });
});
