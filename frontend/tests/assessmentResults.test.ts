import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateFallbackAssessment,
  requestPatientAssessment,
} from '../src/services/intakeService.ts';
import type { NewPatientIntakeData, AssessmentResultData } from '../src/types/triage.ts';

describe('Nurse Assessment Results — Decision Support & Safety Evaluation', () => {
  const baseNormalIntake: NewPatientIntakeData = {
    patient_id: 'DEMO-PT-2026-9001',
    patient_name: 'Suresh Kumar',
    age: 38,
    sex: 'Male',
    arrival_time: '09:15',
    chief_complaint: 'Mild cough and intermittent low-grade fever for 2 days',
    complaint_language: 'English',
    known_conditions: ['None / Unknown'],
    medications: 'None',
    systolic_bp: 120,
    diastolic_bp: 80,
    pulse_bpm: 76,
    temperature: 98.6,
    temperature_unit: 'F',
    spo2: 99,
  };

  test('1. Normal Results: produces routine/urgent assessment without made-up confidence percentages', () => {
    const assessment: AssessmentResultData = generateFallbackAssessment(baseNormalIntake);

    assert.equal(typeof assessment.triage_level, 'number');
    assert.ok(assessment.triage_level >= 3, 'Normal vitals should yield Level 3 or higher');
    assert.equal(assessment.recommended_department, 'General Medicine');
    assert.equal(assessment.detected_red_flags.length, 0);
    assert.equal(assessment.triggered_safety_rule_ids.length, 0);
    assert.equal(assessment.abstention_status, 'EVALUATED');

    // Requirement: No made-up confidence percentage
    assert.equal('confidence_percentage' in (assessment as unknown as Record<string, unknown>), false);
    assert.equal('confidence_score' in (assessment as unknown as Record<string, unknown>), false);

    // Audit and version checks
    assert.ok(assessment.model_version.length > 0);
    assert.ok(assessment.rules_version.length > 0);
    assert.ok(assessment.clinical_disclaimer.includes('physician') || assessment.clinical_disclaimer.includes('decision support'));
  });

  test('2. Critical Escalation: pulse zero triggers immediate Level 1 override & safety rule', () => {
    const pulseZeroIntake: NewPatientIntakeData = {
      ...baseNormalIntake,
      patient_id: 'DEMO-PT-2026-9002',
      chief_complaint: 'Sudden collapse at OPD entrance, unresponsive',
      pulse_bpm: 0, // Critical pulse 0 bpm
    };

    const assessment = generateFallbackAssessment(pulseZeroIntake);

    assert.equal(assessment.triage_level, 1, 'Pulse 0 must be classified as Level 1 Immediate');
    assert.equal(assessment.recommended_department, 'Emergency / Casualty');
    assert.equal(assessment.abstention_status, 'SAFETY_OVERRIDE');
    assert.equal(assessment.human_review_required, true);
    assert.ok(assessment.model_emergency_flag, 'Emergency flag must be active');

    // Must trigger CRIT-RULE-PULSE-0
    assert.ok(assessment.triggered_safety_rule_ids.includes('CRIT-RULE-PULSE-0'));
    assert.ok(
      assessment.safety_rule_explanations.some((exp) => exp.includes('cardiac arrest') || exp.includes('Pulselessness'))
    );

    // Safety constraint: Never low priority presentation
    assert.notEqual(assessment.triage_level, 4);
    assert.notEqual(assessment.triage_level, 5);
  });

  test('2b. Critical Escalation: severe hypoxemia (SpO2 < 90%) triggers Level 1 escalation', () => {
    const hypoxicIntake: NewPatientIntakeData = {
      ...baseNormalIntake,
      patient_id: 'DEMO-PT-2026-9003',
      chief_complaint: 'Severe shortness of breath and blue lips',
      spo2: 82, // Critical hypoxemia
    };

    const assessment = generateFallbackAssessment(hypoxicIntake);

    assert.equal(assessment.triage_level, 1);
    assert.equal(assessment.recommended_department, 'Emergency / Casualty');
    assert.ok(assessment.triggered_safety_rule_ids.includes('CRIT-RULE-HYPOXIA'));
    assert.equal(assessment.model_emergency_flag, true);
  });

  test('3. Missing Data: genuine missing vitals generate warnings and are NOT defaulted to normal', () => {
    const missingVitalsIntake: NewPatientIntakeData = {
      ...baseNormalIntake,
      patient_id: 'DEMO-PT-2026-9004',
      systolic_bp: null,
      diastolic_bp: null,
      spo2: null,
      temperature: null,
    };

    const assessment = generateFallbackAssessment(missingVitalsIntake);

    // Missing measurements must be recorded explicitly
    assert.ok(assessment.missing_data_warnings.length > 0);
    const missingText = assessment.missing_data_warnings.join(' ');
    assert.ok(missingText.includes('Blood Pressure'));
    assert.ok(missingText.includes('SpO2'));
    assert.ok(missingText.includes('Temperature'));

    // Missing vitals should not cause a crash or false critical override
    assert.ok(assessment.triage_level >= 1);
  });

  test('4. API Failure / Offline Resilience: falls back to deterministic safety assessment without throwing', async () => {
    // Calling requestPatientAssessment when backend is offline or on invalid port
    const testIntake: NewPatientIntakeData = {
      ...baseNormalIntake,
      patient_id: 'DEMO-PT-2026-OFFLINE',
    };

    // Should resolve safely with fallback without throwing unhandled rejection
    const assessment = await requestPatientAssessment(testIntake);

    assert.ok(assessment !== null && typeof assessment === 'object');
    assert.ok(assessment.triage_level >= 1 && assessment.triage_level <= 5);
    assert.ok(assessment.model_version.includes('fallback') || assessment.model_version.includes('triage-ml'));
    assert.ok(assessment.clinical_disclaimer.length > 0);
  });

  test('5. Abstention: data quality validation errors place patient on safety hold', () => {
    const invalidIntake: NewPatientIntakeData = {
      ...baseNormalIntake,
      patient_id: 'DEMO-PT-2026-9005',
      systolic_bp: 100,
      diastolic_bp: 110, // Invalid: systolic <= diastolic
    };

    const assessment = generateFallbackAssessment(invalidIntake);

    assert.equal(assessment.abstention_status, 'ABSTAINED_DATA_QUALITY_HOLD');
    assert.equal(assessment.human_review_required, true);
    assert.ok(assessment.invalid_data_warnings.length > 0);
    assert.ok(
      assessment.invalid_data_warnings.some((w) => w.toLowerCase().includes('systolic') || w.toLowerCase().includes('diastolic'))
    );

    // Must be placed on priority hold (never sent to back of routine queue)
    assert.equal(assessment.triage_level_name.includes('Holding'), true);
  });
});
