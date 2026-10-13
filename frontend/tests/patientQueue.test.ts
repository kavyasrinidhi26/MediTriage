import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchSavedQueue,
} from '../src/services/api.ts';
import type { SavedPatientQueueItem } from '../src/types/triage.ts';

describe('Functional Patient Queue & Nurse Review Workflow', () => {
  test('1. Ordering & Prioritization: Emergency Level 1 & deterioration cases appear ahead of routine cases', async () => {
    const queue: SavedPatientQueueItem[] = await fetchSavedQueue();
    assert.ok(Array.isArray(queue));
    assert.ok(queue.length > 0);

    // First patient should be high acuity / emergency or priority
    const firstPatient = queue[0];
    assert.ok(
      firstPatient.is_critical_escalation ||
      firstPatient.triage_level === 1 ||
      firstPatient.triage_level === 2 ||
      firstPatient.deterioration_flag,
      'Top queue item should have high clinical urgency'
    );

    // Verify prototype disclaimer
    assert.ok(firstPatient.disclaimer.includes('PROTOTYPE') || firstPatient.disclaimer.includes('clinical'));
  });

  test('2. Missing Assessments & Human Review Retention: Cases requiring human review do not disappear', async () => {
    const queue = await fetchSavedQueue();

    // Verify cases needing review are present
    const reviewCases = queue.filter(
      (p) => p.status === 'NEEDS_HUMAN_REVIEW' || p.review_status === 'UNREVIEWED'
    );
    assert.ok(reviewCases.length > 0, 'Queue must retain unreviewed cases');

    // Ensure they possess distinct triage priority vs waiting time
    for (const item of reviewCases) {
      assert.equal(typeof item.urgency_score, 'number');
      assert.equal(typeof item.waiting_minutes, 'number');
      assert.ok(item.waiting_minutes >= 0);
    }
  });

  test('3. Escalation Visibility: Warning signs and critical alerts are prominently extracted', async () => {
    const queue = await fetchSavedQueue();
    const criticalPatients = queue.filter((p) => p.is_critical_escalation);

    assert.ok(criticalPatients.length > 0, 'Critical patients must be identified');
    for (const patient of criticalPatients) {
      assert.equal(patient.is_critical_escalation, true);
      assert.ok(patient.triage_level === 1 || patient.deterioration_flag || patient.assessment_status === 'SAFETY_OVERRIDE');
    }
  });

  test('4. Filtering by Triage Level, Review Status, and Department', async () => {
    // Filter level 1
    const l1Queue = await fetchSavedQueue({ triage_level: '1' });
    assert.ok(Array.isArray(l1Queue));
    if (l1Queue.length > 0) {
      assert.ok(l1Queue.every((p) => p.triage_level === 1));
    }

    // Filter review status
    const unreviewed = await fetchSavedQueue({ review_status: 'UNREVIEWED' });
    assert.ok(Array.isArray(unreviewed));
    if (unreviewed.length > 0) {
      assert.ok(unreviewed.every((p) => p.review_status === 'UNREVIEWED'));
    }

    // Filter department
    const casualty = await fetchSavedQueue({ department: 'Casualty' });
    assert.ok(Array.isArray(casualty));
    if (casualty.length > 0) {
      assert.ok(casualty.every((p) => p.recommended_department?.toLowerCase().includes('casualty') || p.recommended_department?.toLowerCase().includes('emergency')));
    }
  });

  test('5. Search by Demo Patient ID', async () => {
    const searched = await fetchSavedQueue({ search: 'UHID-2026-901' });
    assert.ok(Array.isArray(searched));
    if (searched.length > 0) {
      assert.equal(searched[0].patient_id, 'UHID-2026-901');
    }
  });

  test('6. Synthetic Record Distinction: Demo records are explicitly marked as synthetic', async () => {
    const queue = await fetchSavedQueue();
    assert.ok(queue.length > 0);
    // In demo environment, local fallback or demo records must carry is_synthetic flag
    for (const patient of queue) {
      assert.ok('is_synthetic' in patient, 'Every queue item must define is_synthetic property');
      assert.equal(typeof patient.is_synthetic, 'boolean');
    }
  });

  test('7. Card Patient List Filters: Returns correctly partitioned queues for all 6 dashboard cards', async () => {
    // 1. Total Registered Patients (all)
    const allPatients = await fetchSavedQueue();
    assert.ok(Array.isArray(allPatients));
    assert.ok(allPatients.length > 0, 'Total patients queue must have records');

    // 2. Patients Today (today_only = true)
    const todayPatients = await fetchSavedQueue({ today_only: true });
    assert.ok(Array.isArray(todayPatients));
    assert.ok(todayPatients.length <= allPatients.length, 'Today patients count cannot exceed total count');

    // 3. Currently Waiting (status = WAITING)
    const waitingPatients = await fetchSavedQueue({ status: 'WAITING' });
    assert.ok(Array.isArray(waitingPatients));
    assert.ok(
      waitingPatients.every((p) => p.status === 'WAITING'),
      'All patients in WAITING list must have status WAITING'
    );

    // 4. Emergency Cases (category = EMERGENCY)
    const emergencyPatients = await fetchSavedQueue({ category: 'EMERGENCY' });
    assert.ok(Array.isArray(emergencyPatients));
    assert.ok(
      emergencyPatients.every((p) => p.triage_level === 1),
      'All patients in EMERGENCY list must have Level 1 triage'
    );

    // 5. Priority Cases (category = PRIORITY)
    const priorityPatients = await fetchSavedQueue({ category: 'PRIORITY' });
    assert.ok(Array.isArray(priorityPatients));
    assert.ok(
      priorityPatients.every((p) => p.triage_level === 2),
      'All patients in PRIORITY list must have Level 2 triage'
    );

    // 6. Routine Cases (category = ROUTINE)
    const routinePatients = await fetchSavedQueue({ category: 'ROUTINE' });
    assert.ok(Array.isArray(routinePatients));
    assert.ok(
      routinePatients.every((p) => !p.triage_level || p.triage_level >= 3),
      'All patients in ROUTINE list must have Level 3-5 triage'
    );
  });
});

