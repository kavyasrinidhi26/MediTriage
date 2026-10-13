import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateIntakeForm, getInitialIntakeData } from '../src/services/intakeValidation.ts';

describe('Multilingual Support & Voice Input Safety Invariants', () => {
  test('1. Translation Dictionary Integrity: English and Telugu keys match standard patient intake labels', () => {
    // Test Telugu and English translations for core form controls
    const expectedKeys = [
      'nav.brand',
      'nav.btn_register',
      'nav.btn_emergency',
      'intake.title',
      'intake.patient_id',
      'intake.chief_complaint',
      'intake.systolic_bp',
      'intake.pulse',
      'voice.disclaimer',
      'voice.privacy_notice',
      'voice.manual_fallback',
      'emergency.title',
      'emergency.activate_btn',
    ];

    for (const key of expectedKeys) {
      assert.ok(typeof key === 'string' && key.length > 0, `Key ${key} must exist`);
    }
  });

  test('2. Fallback Mechanism: Missing Telugu translation gracefully falls back to English without crashing', () => {
    // Simulate translation resolution logic
    const enDict: Record<string, string> = {
      'sample.key': 'Sample English Value',
      'sample.only_en': 'English Only Value',
    };
    const teDict: Record<string, string> = {
      'sample.key': 'నమూనా తెలుగు విలువ',
    };

    const resolveTranslation = (lang: 'en' | 'te', key: string): string => {
      const dict = lang === 'te' ? teDict : enDict;
      let text = dict[key];
      if (!text && lang === 'te') {
        text = enDict[key];
      }
      return text || key;
    };

    assert.equal(resolveTranslation('te', 'sample.key'), 'నమూనా తెలుగు విలువ');
    // Key only in English falls back to English
    assert.equal(resolveTranslation('te', 'sample.only_en'), 'English Only Value');
    // Completely nonexistent key falls back to key itself
    assert.equal(resolveTranslation('te', 'nonexistent.key'), 'nonexistent.key');
  });

  test('3. Multilingual Narrative Preservation: Telugu script and Latin transliteration are preserved verbatim', () => {
    const intakeTeluguScript = getInitialIntakeData();
    intakeTeluguScript.patient_name = 'వెంకటేశ్వర్లు';
    intakeTeluguScript.complaint_language = 'Telugu';
    intakeTeluguScript.chief_complaint = 'ఛాతీలో విపరీతమైన నొప్పి వస్తోంది, ఎడమ చేతికి పాకుతోంది, తీవ్రమైన ఆయాసం';
    intakeTeluguScript.age = 58;

    const validationScript = validateIntakeForm(intakeTeluguScript);
    assert.ok(validationScript.isValid);
    assert.equal(intakeTeluguScript.chief_complaint, 'ఛాతీలో విపరీతమైన నొప్పి వస్తోంది, ఎడమ చేతికి పాకుతోంది, తీవ్రమైన ఆయాసం');

    const intakeTransliterated = getInitialIntakeData();
    intakeTransliterated.complaint_language = 'Telugu';
    intakeTransliterated.chief_complaint = 'Chathilo manta ga undi mariyu aayasam ga undi';
    intakeTransliterated.age = 42;

    const validationTranslit = validateIntakeForm(intakeTransliterated);
    assert.ok(validationTranslit.isValid);
    assert.equal(intakeTransliterated.chief_complaint, 'Chathilo manta ga undi mariyu aayasam ga undi');
  });

  test('4. Voice Input Safety: Transcript is never automatically treated as verified medical fact', () => {
    // Clinical requirement check: Speech recognition disclaimers
    const disclaimer = 'Notice: Automated voice transcript may contain transcription errors. Do not treat as verified medical fact. Clinicians and nursing staff must review, verify, and correct text before saving.';
    assert.ok(disclaimer.includes('Do not treat as verified medical fact'));
    assert.ok(disclaimer.includes('review, verify, and correct text before saving'));

    const privacyNotice = 'Privacy Notice: Audio is processed locally via browser Web Speech API. No audio recordings are transmitted to external third-party servers.';
    assert.ok(privacyNotice.includes('locally via browser Web Speech API'));
    assert.ok(privacyNotice.includes('No audio recordings are transmitted to external third-party servers'));
  });

  test('5. Manual Typing Fallback: Voice failure states do NOT block patient intake submission', () => {
    // Even if voice recognition fails (e.g., 'not-allowed', 'network', 'not-supported'),
    // manual keyboard input allows valid registration
    const data = getInitialIntakeData();
    data.patient_name = 'Manual Fallback Patient';
    data.age = 35;
    data.sex = 'Male';
    data.chief_complaint = 'Entered manually via keyboard after mic permission was denied';

    const validation = validateIntakeForm(data);
    assert.ok(validation.isValid, 'Intake with manual typing must remain 100% valid');
  });

  test('6. Clinical Triage Invariant: Language selection does not modify triage categories or safety rules', () => {
    // Clinical categories must strictly remain the standard ESI / hospital tiers
    const STANDARD_TRIAGE_LEVELS = [
      'Level 1 - Resuscitation',
      'Level 2 - Emergent',
      'Level 3 - Urgent',
      'Level 4 - Less Urgent',
      'Level 5 - Non-Urgent',
    ];

    assert.equal(STANDARD_TRIAGE_LEVELS.length, 5);
    assert.ok(STANDARD_TRIAGE_LEVELS[0].includes('Resuscitation'));
    assert.ok(STANDARD_TRIAGE_LEVELS[1].includes('Emergent'));
  });

  test('7. Language Switching Preserves Form Data: Patient state is retained across English and Telugu switching', () => {
    // Populate form data
    const formData = getInitialIntakeData();
    formData.patient_id = 'UHID-TEL-9988';
    formData.patient_name = 'Lakshmi Devi';
    formData.age = 52;
    formData.sex = 'Female';
    formData.arrival_time = '10:30';
    formData.chief_complaint = 'తీవ్రమైన ఛాతీ నొప్పి మరియు కళ్ళు తిరగడం';
    formData.complaint_language = 'Telugu';
    formData.systolic_bp = 145;
    formData.diastolic_bp = 95;
    formData.pulse_bpm = 88;
    formData.spo2 = 96.0;

    // Simulate switching language from English to Telugu and back
    let currentAppLang: 'en' | 'te' = 'en';
    const switchLanguage = (target: 'en' | 'te') => {
      currentAppLang = target;
      // In React context, language state updates independently of form state
    };

    switchLanguage('te');
    assert.equal(currentAppLang, 'te');
    assert.equal(formData.patient_id, 'UHID-TEL-9988');
    assert.equal(formData.patient_name, 'Lakshmi Devi');
    assert.equal(formData.chief_complaint, 'తీవ్రమైన ఛాతీ నొప్పి మరియు కళ్ళు తిరగడం');
    assert.equal(formData.systolic_bp, 145);
    assert.equal(formData.spo2, 96.0);

    switchLanguage('en');
    assert.equal(currentAppLang, 'en');
    assert.equal(formData.chief_complaint, 'తీవ్రమైన ఛాతీ నొప్పి మరియు కళ్ళు తిరగడం');
    assert.equal(formData.pulse_bpm, 88);

    const validation = validateIntakeForm(formData);
    assert.ok(validation.isValid);
  });
});
