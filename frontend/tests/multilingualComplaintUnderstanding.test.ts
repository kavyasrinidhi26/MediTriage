import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientComplaint, generateFallbackAssessment } from '../src/services/intakeService.ts';
import type { NewPatientIntakeData } from '../src/types/triage.ts';

describe('Multilingual Complaint Understanding & Fallback Pipeline', () => {
  const basePatientData: NewPatientIntakeData = {
    patient_id: 'TEST-1001',
    patient_name: 'Synthetic Test Patient',
    age: 45,
    sex: 'Male',
    arrival_time: '10:00',
    chief_complaint: '',
    complaint_language: 'English',
    known_conditions: [],
    medications: '',
    systolic_bp: 120,
    diastolic_bp: 80,
    pulse_bpm: 72,
    temperature: 98.6,
    temperature_unit: 'F',
    spo2: 99,
  };

  test('1. Recognizes English severe chest pain as active positive finding with severe modifier', () => {
    const parsed = parseClientComplaint('I have severe chest pain.');
    assert.equal(parsed.detected_language, 'English');
    assert.ok(parsed.positive_concepts.includes('chest_pain'));
    assert.ok(!parsed.negated_concepts.includes('chest_pain'));
    assert.equal(parsed.has_acute_chest_pain, true);
    assert.equal(parsed.requires_complaint_review, false);

    const assessment = generateFallbackAssessment({
      ...basePatientData,
      chief_complaint: 'I have severe chest pain.',
    });
    assert.equal(assessment.triage_level, 1);
    assert.equal(assessment.model_emergency_flag, true);
    assert.ok(assessment.triggered_safety_rule_ids.includes('CRIT-RULE-NLP-CHEST-PAIN'));
  });

  test('2. Recognizes Telugu script chest pain: "నాకు ఛాతిలో నొప్పిగా ఉంది"', () => {
    const parsed = parseClientComplaint('నాకు ఛాతిలో నొప్పిగా ఉంది');
    assert.equal(parsed.detected_language, 'Telugu Script');
    assert.ok(parsed.positive_concepts.includes('chest_pain'));
    assert.equal(parsed.has_acute_chest_pain, true);

    const assessment = generateFallbackAssessment({
      ...basePatientData,
      chief_complaint: 'నాకు ఛాతిలో నొప్పిగా ఉంది',
      complaint_language: 'Telugu',
    });
    assert.equal(assessment.triage_level, 1);
    assert.equal(assessment.recommended_department, 'Emergency / Casualty');
  });

  test('3. Recognizes Telugu transliteration: "naaku chaathilo noppi ga undi"', () => {
    const parsed = parseClientComplaint('naaku chaathilo noppi ga undi');
    assert.equal(parsed.detected_language, 'Telugu Transliteration');
    assert.ok(parsed.positive_concepts.includes('chest_pain'));
    assert.equal(parsed.has_acute_chest_pain, true);

    const assessment = generateFallbackAssessment({
      ...basePatientData,
      chief_complaint: 'naaku chaathilo noppi ga undi',
      complaint_language: 'Telugu',
    });
    assert.equal(assessment.triage_level, 1);
  });

  test('4. Detects Mixed language: "Naku fever undi and body pains."', () => {
    const parsed = parseClientComplaint('Naku fever undi and body pains.');
    assert.equal(parsed.detected_language, 'Mixed (Telugu & English)');
    assert.ok(parsed.positive_concepts.includes('fever'));
    assert.ok(parsed.positive_concepts.includes('joint_bone_pain'));
    assert.equal(parsed.requires_complaint_review, false);

    const assessment = generateFallbackAssessment({
      ...basePatientData,
      chief_complaint: 'Naku fever undi and body pains.',
      complaint_language: 'Mixed (Telugu & English)',
    });
    assert.ok(assessment.triage_level >= 2);
    assert.equal(assessment.detected_language, 'Mixed (Telugu & English)');
  });

  test('5. Correctly marks negated symptoms: "mild cough, no chest pain"', () => {
    const parsed = parseClientComplaint('mild cough, no chest pain, I do not have fever');
    assert.ok(parsed.negated_concepts.includes('chest_pain'));
    assert.ok(!parsed.positive_concepts.includes('chest_pain'));
    assert.equal(parsed.has_acute_chest_pain, false);

    // Stable vitals + negated chest pain should NOT trigger Level 1 emergency override
    const assessment = generateFallbackAssessment({
      ...basePatientData,
      chief_complaint: 'mild cough, no chest pain',
    });
    assert.notEqual(assessment.triage_level, 1);
    assert.ok(!assessment.triggered_safety_rule_ids.includes('CRIT-RULE-NLP-CHEST-PAIN'));
  });

  test('6. Flags contradictory complaints for nurse review', () => {
    const parsed = parseClientComplaint('I have chest pain and no chest pain');
    assert.equal(parsed.requires_complaint_review, true);
    assert.ok(parsed.complaint_review_reason?.includes('Contradictory'));

    const assessment = generateFallbackAssessment({
      ...basePatientData,
      chief_complaint: 'I have chest pain and no chest pain',
    });
    assert.ok(assessment.triage_level_name.includes('Cannot assess safely — send to nurse now.'));
    assert.equal(assessment.abstention_status, 'ABSTAINED_COMPLAINT_UNCERTAIN');
  });

  test('7. Flags empty or gibberish complaints for safe nurse review', () => {
    const emptyParsed = parseClientComplaint('');
    assert.equal(emptyParsed.requires_complaint_review, true);

    const gibberishParsed = parseClientComplaint('###@@@!!! 123456');
    assert.equal(gibberishParsed.requires_complaint_review, true);
    assert.equal(gibberishParsed.detected_language, 'Ambiguous / Unsupported');
  });

  test('8. Critical vital signs (pulse 0, SpO2 78%) always trigger Level 1 emergency regardless of complaint', () => {
    // Even if complaint says "no chest pain", SpO2 78% must remain Level 1 Emergency
    const hypoxicAssessment = generateFallbackAssessment({
      ...basePatientData,
      chief_complaint: 'no chest pain',
      spo2: 78,
    });
    assert.equal(hypoxicAssessment.triage_level, 1);
    assert.equal(hypoxicAssessment.model_emergency_flag, true);
    assert.ok(hypoxicAssessment.triggered_safety_rule_ids.includes('CRIT-RULE-HYPOXIA'));

    // Pulseless patient with empty complaint
    const pulselessAssessment = generateFallbackAssessment({
      ...basePatientData,
      chief_complaint: '',
      pulse_bpm: 0,
    });
    assert.equal(pulselessAssessment.triage_level, 1);
    assert.equal(pulselessAssessment.model_emergency_flag, true);
    assert.ok(pulselessAssessment.triggered_safety_rule_ids.includes('CRIT-RULE-PULSE-0'));
  });
});
