import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDemoPatientId,
  getInitialIntakeData,
  validateIntakeForm,
  toFahrenheit,
  toCelsius,
} from '../src/services/intakeValidation.ts';
import {
  submitPatientIntake,
  saveIntakeDraft,
  loadIntakeDraft,
  clearIntakeDraft,
} from '../src/services/intakeService.ts';
import type { NewPatientIntakeData } from '../src/types/triage.ts';

describe('Nurse Patient Intake — Validation & Safety Rules', () => {
  test('generateDemoPatientId creates formatted demo ID', () => {
    const id1 = generateDemoPatientId();
    const id2 = generateDemoPatientId();
    assert.match(id1, /^DEMO-PT-2026-\d+$/);
    assert.match(id2, /^DEMO-PT-2026-\d+$/);
  });

  test('temperature conversion helpers work correctly', () => {
    assert.equal(toFahrenheit(98.6, 'F'), 98.6);
    assert.equal(toFahrenheit(37, 'C'), 98.6);
    assert.equal(toCelsius(98.6, 'F'), 37);
    assert.equal(toCelsius(37, 'C'), 37);
  });

  test('valid intake form passes validation', () => {
    const data: NewPatientIntakeData = {
      patient_id: 'DEMO-PT-2026-1001',
      patient_name: 'Lakshmi Devi',
      age: 48,
      sex: 'Female',
      arrival_time: '10:30',
      chief_complaint: 'తీవ్రమైన తలనొప్పి మరియు కళ్ళు తిరగడం',
      complaint_language: 'Telugu',
      known_conditions: ['Hypertension'],
      medications: 'Amlodipine 5mg',
      systolic_bp: 130,
      diastolic_bp: 85,
      pulse_bpm: 78,
      temperature: 98.4,
      temperature_unit: 'F',
      spo2: 98,
    };

    const res = validateIntakeForm(data);
    assert.equal(res.isValid, true);
    assert.equal(Object.keys(res.errors).length, 0);
  });

  test('allows optional vital measurements to remain genuinely missing without inventing normal values', () => {
    const data: NewPatientIntakeData = {
      patient_id: 'DEMO-PT-2026-1002',
      age: 30,
      sex: 'Male',
      arrival_time: '11:00',
      chief_complaint: 'Routine follow-up prescription renewal',
      complaint_language: 'English',
      known_conditions: [],
      medications: '',
      systolic_bp: null,
      diastolic_bp: null,
      pulse_bpm: null,
      temperature: null,
      temperature_unit: 'F',
      spo2: null,
    };

    const res = validateIntakeForm(data);
    assert.equal(res.isValid, true, 'Form should be valid even with unrecorded optional vitals');
    assert.equal(res.missingMeasurements.length, 4, 'Should record all 4 unmeasured vitals');

    const fields = res.missingMeasurements.map((m) => m.field);
    assert.ok(fields.includes('blood_pressure'));
    assert.ok(fields.includes('pulse_bpm'));
    assert.ok(fields.includes('temperature'));
    assert.ok(fields.includes('spo2'));

    // Check that none are silently converted to default values
    assert.equal(data.pulse_bpm, null);
    assert.equal(data.systolic_bp, null);
    assert.equal(data.spo2, null);
  });

  test('CRITICAL RULE: Pulse entered as 0 bpm triggers immediate safety workflow, NOT treated as missing data', () => {
    const data: NewPatientIntakeData = {
      patient_id: 'DEMO-PT-2026-1003',
      age: 55,
      sex: 'Other',
      arrival_time: '11:15',
      chief_complaint: 'Found unresponsive by relative',
      complaint_language: 'English',
      known_conditions: ['Ischemic Heart Disease (CAD)'],
      medications: '',
      systolic_bp: null,
      diastolic_bp: null,
      pulse_bpm: 0, // PULSE = 0
      temperature: null,
      temperature_unit: 'F',
      spo2: null,
    };

    const res = validateIntakeForm(data);
    assert.equal(res.isValid, true, 'Pulse of 0 is a valid clinical entry');

    // Must NOT be in missing measurements
    const missingPulse = res.missingMeasurements.find((m) => m.field === 'pulse_bpm');
    assert.equal(missingPulse, undefined, 'Pulse of 0 must NOT be classified as missing');

    // Must trigger CRITICAL_PULSE_ZERO alert
    const pulseZeroAlert = res.alerts.find((a) => a.code === 'CRITICAL_PULSE_ZERO');
    assert.ok(pulseZeroAlert, 'Must trigger CRITICAL_PULSE_ZERO alert');
    assert.equal(pulseZeroAlert.severity, 'critical');
    assert.match(pulseZeroAlert.message, /0 bpm/);
    assert.match(pulseZeroAlert.safetyProtocol, /carotid pulse/i);
    assert.match(pulseZeroAlert.safetyProtocol, /CPR/i);
  });

  test('CLINICAL VERIFICATION RULE: Flag temperature of 96°F for clinical verification rather than typo', () => {
    const dataF: NewPatientIntakeData = {
      patient_id: 'DEMO-PT-2026-1004',
      age: 70,
      sex: 'Female',
      arrival_time: '08:00',
      chief_complaint: 'Elderly patient found on cold floor, drowsy',
      complaint_language: 'English',
      known_conditions: [],
      medications: '',
      systolic_bp: 100,
      diastolic_bp: 65,
      pulse_bpm: 56,
      temperature: 96.0,
      temperature_unit: 'F',
      spo2: 95,
    };

    const resF = validateIntakeForm(dataF);
    assert.equal(resF.isValid, true);
    assert.equal(resF.errors.temperature, undefined, '96°F must not be flagged as an invalid error');

    const tempAlertF = resF.alerts.find((a) => a.code === 'TEMP_96_VERIFICATION');
    assert.ok(tempAlertF, 'Must trigger TEMP_96_VERIFICATION alert');
    assert.match(tempAlertF.safetyProtocol, /hypothermia/i);
    assert.match(tempAlertF.safetyProtocol, /DO NOT assume this reading is a typo/i);

    // Also verify equivalent in Celsius (35.6°C = 96.08°F)
    const dataC: NewPatientIntakeData = {
      ...dataF,
      temperature: 35.6,
      temperature_unit: 'C',
    };
    const resC = validateIntakeForm(dataC);
    const tempAlertC = resC.alerts.find((a) => a.code === 'TEMP_96_VERIFICATION');
    assert.ok(tempAlertC, '35.6°C should also trigger TEMP_96_VERIFICATION alert');
  });

  test('validates age boundaries and required fields', () => {
    const badAge: NewPatientIntakeData = {
      ...getInitialIntakeData(),
      age: -5,
      chief_complaint: 'Fever',
    };
    const res1 = validateIntakeForm(badAge);
    assert.equal(res1.isValid, false);
    assert.ok(res1.errors.age);

    const overAge: NewPatientIntakeData = {
      ...getInitialIntakeData(),
      age: 150,
      chief_complaint: 'Fever',
    };
    const res2 = validateIntakeForm(overAge);
    assert.equal(res2.isValid, false);
    assert.ok(res2.errors.age);

    const emptyComplaint: NewPatientIntakeData = {
      ...getInitialIntakeData(),
      age: 25,
      chief_complaint: '',
    };
    const res3 = validateIntakeForm(emptyComplaint);
    assert.equal(res3.isValid, false);
    assert.ok(res3.errors.chief_complaint);
  });

  test('rejects systolic BP less than or equal to diastolic BP', () => {
    const badBP: NewPatientIntakeData = {
      ...getInitialIntakeData(),
      age: 40,
      chief_complaint: 'Dizziness and headache',
      systolic_bp: 80,
      diastolic_bp: 90,
    };
    const res = validateIntakeForm(badBP);
    assert.equal(res.isValid, false);
    assert.match(res.errors.systolic_bp, /greater than Diastolic/);
  });

  test('flags severe hypoxemia when SpO2 is below 90%', () => {
    const hypoxicData: NewPatientIntakeData = {
      ...getInitialIntakeData(),
      age: 62,
      chief_complaint: 'Severe shortness of breath',
      spo2: 86,
    };
    const res = validateIntakeForm(hypoxicData);
    assert.equal(res.isValid, true);
    const hypoxiaAlert = res.alerts.find((a) => a.code === 'CRITICAL_HYPOXIA');
    assert.ok(hypoxiaAlert);
    assert.equal(hypoxiaAlert.severity, 'critical');
  });

  test('preserves multilingual complaints in Telugu without modification', () => {
    const teluguText = 'రెండు రోజులుగా తీవ్రమైన చలి జ్వరం మరియు దగ్గు';
    const data: NewPatientIntakeData = {
      ...getInitialIntakeData(),
      age: 38,
      chief_complaint: teluguText,
      complaint_language: 'Telugu',
    };
    const res = validateIntakeForm(data);
    assert.equal(res.isValid, true);
    assert.equal(data.chief_complaint, teluguText, 'Original Telugu text must be preserved verbatim');
    assert.equal(data.complaint_language, 'Telugu');
  });
});

describe('Nurse Patient Intake — Service Layer Placeholder', () => {
  test('submitPatientIntake does NOT assign real clinical triage level', async () => {
    const testId = `DEMO-PT-${Date.now()}`;
    const data: NewPatientIntakeData = {
      patient_id: testId,
      patient_name: 'Triage Candidate',
      age: 50,
      sex: 'Male',
      arrival_time: '12:00',
      chief_complaint: 'Chest heaviness after walking up stairs',
      complaint_language: 'English',
      known_conditions: ['Hypertension'],
      medications: 'Aspirin 75mg',
      systolic_bp: 140,
      diastolic_bp: 88,
      pulse_bpm: 82,
      temperature: 98.6,
      temperature_unit: 'F',
      spo2: 96,
    };

    const response = await submitPatientIntake(data);
    assert.equal(response.patient_id, testId);
    assert.equal(response.triage_status, 'PENDING_ASSESSMENT', 'Must be PENDING_ASSESSMENT at intake stage');
    assert.equal(response.original_complaint_preserved, data.chief_complaint);
    assert.ok(response.token_number.startsWith('OPD-'));
  });

  test('draft saving, loading, and clearing persists form state', () => {
    const storage: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: (k: string) => storage[k] || null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
      clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
    };
    (globalThis as unknown as { localStorage: typeof mockLocalStorage }).localStorage = mockLocalStorage;

    const draftData: NewPatientIntakeData = {
      ...getInitialIntakeData(),
      patient_id: 'DEMO-PT-DRAFT-01',
      patient_name: 'Draft Patient',
      age: 44,
      chief_complaint: 'Mild headache',
    };

    saveIntakeDraft(draftData);
    const loaded = loadIntakeDraft();
    assert.ok(loaded);
    assert.equal(loaded.patient_id, 'DEMO-PT-DRAFT-01');
    assert.equal(loaded.patient_name, 'Draft Patient');

    clearIntakeDraft();
    assert.equal(loadIntakeDraft(), null);
  });
});

