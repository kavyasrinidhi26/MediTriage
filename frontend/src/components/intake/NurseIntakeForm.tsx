import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  NewPatientIntakeData,
  SexOption,
  ComplaintLanguage,
  TemperatureUnit,
  IntakeSubmissionResponse,
  AssessmentResultData,
} from '../../types/triage';
import {
  generateDemoPatientId,
  getCurrentTimeHHMM,
  getInitialIntakeData,
  validateIntakeForm,
  toFahrenheit,
} from '../../services/intakeValidation';
import {
  saveIntakeDraft,
  loadIntakeDraft,
  clearIntakeDraft,
  submitPatientIntake,
  requestPatientAssessment,
} from '../../services/intakeService';
import { IntakeConfirmationModal } from './IntakeConfirmationModal';
import { AssessmentResultScreen } from './AssessmentResultScreen';
import { useLanguage } from '../../context/LanguageContext';
import { LanguageSelector } from '../common/LanguageSelector';
import { VoiceInputButton } from '../common/VoiceInputButton';
import {
  User,
  Heart,
  Activity,
  FileText,
  Save,
  RotateCcw,
  Send,
  AlertTriangle,
  AlertOctagon,
  Clock,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Pill,
  Languages,
} from 'lucide-react';

const COMMON_CONDITIONS = [
  'Hypertension',
  'Type 2 Diabetes',
  'Asthma / COPD',
  'Ischemic Heart Disease (CAD)',
  'Chronic Kidney Disease',
  'Epilepsy / Seizures',
  'Previous Stroke / TIA',
  'None / Unknown',
];

interface NurseIntakeFormProps {
  onSuccess?: (response: IntakeSubmissionResponse) => void;
  onReturnToQueue?: () => void;
}

export const NurseIntakeForm: React.FC<NurseIntakeFormProps> = ({ onSuccess, onReturnToQueue }) => {
  const { language, t } = useLanguage();
  const [formData, setFormData] = useState<NewPatientIntakeData>(() => {
    return loadIntakeDraft() || getInitialIntakeData();
  });
  const [submittedAttempts, setSubmittedAttempts] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(() => {
    const saved = loadIntakeDraft();
    if (saved?.last_saved_at) {
      const time = new Date(saved.last_saved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Restored saved draft from ${time}.`;
    }
    return null;
  });
  const [submissionSuccess, setSubmissionSuccess] = useState<IntakeSubmissionResponse | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [currentAssessment, setCurrentAssessment] = useState<AssessmentResultData | null>(null);

  // Real-time validation derived directly during render
  const validation = useMemo(() => validateIntakeForm(formData), [formData]);

  const updateField = useCallback(
    <K extends keyof NewPatientIntakeData>(field: K, value: NewPatientIntakeData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setSubmissionSuccess(null);
      setCurrentAssessment(null);
      setSubmissionError(null);
    },
    []
  );

  const translateError = useCallback(
    (field: string, raw: string): string => {
      if (field === 'patient_id') return t('validation.id_required');
      if (field === 'age') return t('validation.age_required');
      if (field === 'sex') return t('validation.sex_required');
      if (field === 'arrival_time') return t('validation.arrival_required');
      if (field === 'chief_complaint') return t('validation.complaint_required');
      if (field === 'blood_pressure') return t('validation.bp_inconsistent');
      if (field === 'pulse_bpm') return t('validation.pulse_range');
      if (field === 'temperature') return t('validation.temp_range');
      if (field === 'spo2') return t('validation.spo2_range');
      return raw;
    },
    [t]
  );

  const handleVoiceTranscript = (text: string, mode: 'insert' | 'append') => {
    if (mode === 'insert') {
      updateField('chief_complaint', text);
    } else {
      updateField('chief_complaint', formData.chief_complaint ? `${formData.chief_complaint} ${text}` : text);
    }
  };


  const toggleCondition = (condition: string) => {
    setFormData((prev) => {
      const current = prev.known_conditions;
      if (condition === 'None / Unknown') {
        return { ...prev, known_conditions: current.includes(condition) ? [] : ['None / Unknown'] };
      }
      const filtered = current.filter((c) => c !== 'None / Unknown');
      const updated = filtered.includes(condition)
        ? filtered.filter((c) => c !== condition)
        : [...filtered, condition];
      return { ...prev, known_conditions: updated };
    });
  };

  const handleSaveDraft = useCallback(() => {
    saveIntakeDraft(formData);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setDraftNotice(`Draft saved to browser storage at ${nowTime}.`);
    setTimeout(() => setDraftNotice(null), 4000);
  }, [formData]);

  // Keyboard shortcut for Save Draft (Ctrl+S or Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveDraft();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveDraft]);

  const handleClearForm = () => {
    if (window.confirm('Are you sure you want to clear this intake form? Any unsaved changes will be lost.')) {
      clearIntakeDraft();
      const fresh = getInitialIntakeData();
      setFormData(fresh);
      setSubmittedAttempts(false);
      setDraftNotice('Intake form cleared.');
      setSubmissionSuccess(null);
      setTimeout(() => setDraftNotice(null), 3000);
    }
  };

  const handleRegenerateId = () => {
    updateField('patient_id', generateDemoPatientId());
  };

  const handleSetCurrentTime = () => {
    updateField('arrival_time', getCurrentTimeHHMM());
  };

  // Quick nurse test presets
  const applyPreset = (preset: {
    patient_name: string;
    age: number;
    sex: SexOption;
    chief_complaint: string;
    complaint_language: ComplaintLanguage;
    known_conditions: string[];
    medications: string;
    systolic_bp: number | null;
    diastolic_bp: number | null;
    pulse_bpm: number | null;
    temperature: number | null;
    temperature_unit: TemperatureUnit;
    spo2: number | null;
  }) => {
    setFormData((prev) => ({
      ...prev,
      ...preset,
      arrival_time: getCurrentTimeHHMM(),
    }));
    setSubmittedAttempts(false);
    setSubmissionSuccess(null);
    setDraftNotice(`Loaded demo preset: "${preset.patient_name}"`);
    setTimeout(() => setDraftNotice(null), 3500);
  };

  const handleSubmitClick = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedAttempts(true);

    if (validation.isValid) {
      setShowConfirmation(true);
    } else {
      // Find first error and scroll to view
      const firstKey = Object.keys(validation.errors)[0];
      const element = document.getElementById(`field-${firstKey}`);
      if (element) {
        element.focus();
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const response = await submitPatientIntake(formData);
      const assessmentResult = await requestPatientAssessment(formData);
      setShowConfirmation(false);
      setSubmissionSuccess(response);
      setCurrentAssessment(assessmentResult);
      clearIntakeDraft();
      if (onSuccess) {
        onSuccess(response);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting intake';
      setSubmissionError(msg);
      setShowConfirmation(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartNextPatient = () => {
    const fresh = getInitialIntakeData();
    setFormData(fresh);
    setSubmittedAttempts(false);
    setSubmissionSuccess(null);
    setCurrentAssessment(null);
    setSubmissionError(null);
    setDraftNotice(null);
  };


  // Pre-calculate live temperature conversions and flags
  const tempF = formData.temperature !== null ? toFahrenheit(formData.temperature, formData.temperature_unit) : null;
  const isTemp96Flag = tempF !== null && Math.abs(tempF - 96.0) <= 0.3;
  const isPulseZeroFlag = formData.pulse_bpm === 0;

  if (currentAssessment) {
    return (
      <div className="nurse-intake-container">
        <AssessmentResultScreen
          assessment={currentAssessment}
          intakeData={formData}
          onReturnToQueue={() => {
            if (onReturnToQueue) {
              onReturnToQueue();
            } else {
              window.location.href = '/queue';
            }
          }}
          onReviewIntake={() => {
            setCurrentAssessment(null);
          }}
          onNewPatient={handleStartNextPatient}
        />
      </div>
    );
  }

  return (
    <div className="nurse-intake-container">
      {/* SUCCESS BANNER WHEN ENROLLED */}
      {submissionSuccess && (
        <div className="intake-success-banner" role="status" aria-live="polite">
          <div className="success-banner-main">
            <CheckCircle2 size={28} className="text-emerald-600" />
            <div>
              <h3 className="success-banner-title">Patient Intake Successfully Registered!</h3>
              <p className="success-banner-desc">
                Enrolled into active OPD queue as Token <strong>{submissionSuccess.token_number}</strong> (UHID: <strong>{submissionSuccess.patient_id}</strong>).
                Clinical triage level is <strong>PENDING CLINICIAN ASSESSMENT</strong>.
              </p>
            </div>
          </div>
          <div className="success-banner-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStartNextPatient}
            >
              + Register Next Patient
            </button>
            <a href="/queue" className="btn btn-secondary">
              View OPD Queue
            </a>
          </div>
        </div>
      )}

      {/* ERROR BANNER ON SUBMISSION FAILURE */}
      {submissionError && (
        <div
          className="intake-error-banner"
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            marginBottom: '16px',
            color: '#991b1b',
          }}
        >
          <AlertOctagon size={22} className="text-rose-600 flex-shrink-0" />
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '14px' }}>Intake Submission Failed</strong>
            <span style={{ fontSize: '13px' }}>{submissionError}</span>
          </div>
          <button
            type="button"
            className="btn-xs"
            onClick={() => setSubmissionError(null)}
            style={{
              background: 'transparent',
              border: '1px solid #fca5a5',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#991b1b',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* DRAFT NOTIFICATION TOAST */}

      {draftNotice && (
        <div className="draft-notice-toast" role="status">
          <Sparkles size={16} />
          <span>{draftNotice}</span>
        </div>
      )}

      {/* LANGUAGE SELECTOR TOOLBAR */}
      <div
        className="intake-language-bar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Languages size={18} color="#0284c7" />
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>
            {t('nav.lang_select')}:
          </span>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            {language === 'te' ? 'తెలుగు ఇంటర్‌ఫేస్ సక్రియంగా ఉంది' : 'English interface active'}
          </span>
        </div>
        <LanguageSelector variant="pill" />
      </div>

      {/* QUICK SYNTHETIC PRESETS STRIP */}
      <div className="demo-presets-panel">
        <div className="presets-panel-label">
          <Sparkles size={14} />
          <span>{t('intake.quick_presets')} (Synthetic Test Records):</span>
        </div>
        <div className="presets-chips">
          <button
            type="button"
            className="preset-chip"
            onClick={() =>
              applyPreset({
                patient_name: 'వెంకటేశ్వర్లు (Venkateshwarlu)',
                age: 58,
                sex: 'Male',
                chief_complaint: 'ఛాతీలో విపరీతమైన నొప్పి వస్తోంది, ఎడమ చేతికి పాకుతోంది, తీవ్రమైన ఆయాసం',
                complaint_language: 'Telugu',
                known_conditions: ['Hypertension', 'Type 2 Diabetes'],
                medications: 'Metformin 500mg BD, Amlodipine 5mg OD',
                systolic_bp: 90,
                diastolic_bp: 60,
                pulse_bpm: 118,
                temperature: 98.4,
                temperature_unit: 'F',
                spo2: 91,
              })
            }
          >
            Telugu: Chest Pain & Diabetes
          </button>

          <button
            type="button"
            className="preset-chip"
            onClick={() =>
              applyPreset({
                patient_name: 'సుజాత (Sujatha)',
                age: 34,
                sex: 'Female',
                chief_complaint: 'మూడు రోజులుగా తీవ్రమైన చలి జ్వరం, తలనొప్పి మరియు నీరసం',
                complaint_language: 'Telugu',
                known_conditions: ['None / Unknown'],
                medications: 'Paracetamol 650mg SOS',
                systolic_bp: 110,
                diastolic_bp: 72,
                pulse_bpm: 88,
                temperature: 102.6,
                temperature_unit: 'F',
                spo2: 98,
              })
            }
          >
            Telugu: High Fever & Chills
          </button>

          <button
            type="button"
            className="preset-chip"
            onClick={() =>
              applyPreset({
                patient_name: 'Aarav Sharma',
                age: 8,
                sex: 'Male',
                chief_complaint: 'Severe wheezing, breathlessness, not able to speak full sentences',
                complaint_language: 'English',
                known_conditions: ['Asthma / COPD'],
                medications: 'Salbutamol Inhaler PRN',
                systolic_bp: 102,
                diastolic_bp: 64,
                pulse_bpm: 122,
                temperature: 98.6,
                temperature_unit: 'F',
                spo2: 89,
              })
            }
          >
            English: Pediatric Asthma
          </button>

          <button
            type="button"
            className="preset-chip preset-warning"
            onClick={() =>
              applyPreset({
                patient_name: 'Rajeshwar Rao',
                age: 72,
                sex: 'Male',
                chief_complaint: 'Found drowsy after prolonged cold exposure, shivering ceased, lethargic',
                complaint_language: 'English',
                known_conditions: ['Hypertension'],
                medications: 'Telmisartan 40mg',
                systolic_bp: 94,
                diastolic_bp: 58,
                pulse_bpm: 52,
                temperature: 96.0,
                temperature_unit: 'F',
                spo2: 93,
              })
            }
          >
            ⚠️ Hypothermia Check (96°F)
          </button>

          <button
            type="button"
            className="preset-chip preset-critical"
            onClick={() =>
              applyPreset({
                patient_name: 'Unknown Emergency Patient',
                age: 45,
                sex: 'Unspecified',
                chief_complaint: 'Brought in unresponsive by bystanders, no palpable radial pulse',
                complaint_language: 'English',
                known_conditions: [],
                medications: 'Unknown',
                systolic_bp: null,
                diastolic_bp: null,
                pulse_bpm: 0,
                temperature: null,
                temperature_unit: 'F',
                spo2: null,
              })
            }
          >
            🚨 Pulseless Check (Pulse 0)
          </button>
        </div>
      </div>

      {/* MAIN FORM */}
      <form onSubmit={handleSubmitClick} noValidate className="nurse-intake-form">
        {/* SECTION 1: PATIENT IDENTIFICATION */}
        <fieldset className="intake-card-section">
          <legend className="section-legend">
            <User size={18} className="legend-icon" />
            <span>{t('intake.sec1_title')}</span>
          </legend>

          <div className="form-grid-3">
            {/* Demo Patient ID */}
            <div className="form-group">
              <label htmlFor="field-patient_id" className="form-label">
                {t('intake.patient_id')} <span className="label-req">*</span>
              </label>
              <div className="input-with-action">
                <input
                  id="field-patient_id"
                  type="text"
                  className={`form-input font-mono ${submittedAttempts && validation.errors.patient_id ? 'input-error' : ''}`}
                  value={formData.patient_id}
                  onChange={(e) => updateField('patient_id', e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-input-addon"
                  onClick={handleRegenerateId}
                  title={t('intake.patient_id_regen')}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              {submittedAttempts && validation.errors.patient_id && (
                <span className="field-error-msg">{translateError('patient_id', validation.errors.patient_id)}</span>
              )}
            </div>

            {/* Patient Name */}
            <div className="form-group">
              <label htmlFor="field-patient_name" className="form-label">
                {t('intake.patient_name')} <span className="label-opt">{t('intake.patient_name_opt')}</span>
              </label>
              <input
                id="field-patient_name"
                type="text"
                className="form-input"
                placeholder={t('intake.patient_name_placeholder')}
                value={formData.patient_name || ''}
                onChange={(e) => updateField('patient_name', e.target.value)}
              />
            </div>

            {/* Age */}
            <div className="form-group">
              <label htmlFor="field-age" className="form-label">
                {t('intake.age')} <span className="label-req">*</span>
              </label>
              <input
                id="field-age"
                type="number"
                min="0"
                max="130"
                step="1"
                className={`form-input ${submittedAttempts && validation.errors.age ? 'input-error' : ''}`}
                placeholder={t('intake.age_placeholder')}
                value={formData.age !== null ? formData.age : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                  updateField('age', val);
                }}
                required
              />
              {submittedAttempts && validation.errors.age && (
                <span className="field-error-msg">{translateError('age', validation.errors.age)}</span>
              )}
            </div>

            {/* Sex */}
            <div className="form-group">
              <label htmlFor="field-sex" className="form-label">
                {t('intake.sex')} <span className="label-req">*</span>
              </label>
              <select
                id="field-sex"
                className={`form-select ${submittedAttempts && validation.errors.sex ? 'input-error' : ''}`}
                value={formData.sex}
                onChange={(e) => updateField('sex', e.target.value as SexOption)}
                required
              >
                <option value="Male">{t('intake.sex_male')}</option>
                <option value="Female">{t('intake.sex_female')}</option>
                <option value="Other">{t('intake.sex_other')}</option>
                <option value="Unspecified">{t('intake.sex_unspecified')}</option>
              </select>
              {submittedAttempts && validation.errors.sex && (
                <span className="field-error-msg">{translateError('sex', validation.errors.sex)}</span>
              )}
            </div>

            {/* Arrival Time */}
            <div className="form-group">
              <label htmlFor="field-arrival_time" className="form-label">
                {t('intake.arrival_time')} <span className="label-req">*</span>
              </label>
              <div className="input-with-action">
                <input
                  id="field-arrival_time"
                  type="time"
                  className={`form-input ${submittedAttempts && validation.errors.arrival_time ? 'input-error' : ''}`}
                  value={formData.arrival_time}
                  onChange={(e) => updateField('arrival_time', e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-input-addon"
                  onClick={handleSetCurrentTime}
                  title="Set to current local time"
                >
                  <Clock size={14} /> {t('intake.btn_now')}
                </button>
              </div>
              {submittedAttempts && validation.errors.arrival_time && (
                <span className="field-error-msg">{translateError('arrival_time', validation.errors.arrival_time)}</span>
              )}
            </div>
          </div>
        </fieldset>

        {/* SECTION 2: PRESENTING SYMPTOMS & CLINICAL HISTORY */}
        <fieldset className="intake-card-section">
          <legend className="section-legend">
            <FileText size={18} className="legend-icon" />
            <span>{t('intake.sec2_title')}</span>
          </legend>

          <div className="form-grid-2">
            {/* Language of Complaint */}
            <div className="form-group">
              <label htmlFor="field-complaint_language" className="form-label">
                <Languages size={14} /> {t('intake.complaint_lang')} <span className="label-req">*</span>
              </label>
              <select
                id="field-complaint_language"
                className={`form-select ${submittedAttempts && validation.errors.complaint_language ? 'input-error' : ''}`}
                value={formData.complaint_language}
                onChange={(e) => updateField('complaint_language', e.target.value as ComplaintLanguage)}
                required
              >
                <option value="English">English</option>
                <option value="Telugu">Telugu (తెలుగు)</option>
                <option value="Hindi">Hindi (हिंदी)</option>
                <option value="Urdu">Urdu (اردو)</option>
                <option value="Kannada">Kannada (ಕನ್ನಡ)</option>
                <option value="Tamil">Tamil (தமிழ்)</option>
                <option value="Other">Other / Regional</option>
              </select>
              <span className="field-hint">
                {t('intake.complaint_lang_hint')}
              </span>
            </div>

            {/* Current Medications */}
            <div className="form-group">
              <label htmlFor="field-medications" className="form-label">
                <Pill size={14} /> {t('intake.medications')} <span className="label-opt">{t('intake.patient_name_opt')}</span>
              </label>
              <input
                id="field-medications"
                type="text"
                className="form-input"
                placeholder={t('intake.medications_placeholder')}
                value={formData.medications}
                onChange={(e) => updateField('medications', e.target.value)}
              />
            </div>
          </div>

          {/* Chief Complaint in Patient's Own Words */}
          <div className="form-group mt-3">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
              <label htmlFor="field-chief_complaint" className="form-label" style={{ margin: 0 }}>
                {t('intake.chief_complaint')} <span className="label-req">*</span>
                <span className="badge-char-count" style={{ marginLeft: 8 }}>{formData.chief_complaint.length} chars</span>
              </label>
              {/* Optional Voice-to-Text Input with verification review & manual fallback */}
              <VoiceInputButton
                targetFieldLabel={t('intake.chief_complaint')}
                onTranscriptAccepted={handleVoiceTranscript}
              />
            </div>
            <textarea
              id="field-chief_complaint"
              rows={3}
              className={`form-textarea ${submittedAttempts && validation.errors.chief_complaint ? 'input-error' : ''}`}
              placeholder={t('intake.chief_complaint_placeholder')}
              value={formData.chief_complaint}
              onChange={(e) => updateField('chief_complaint', e.target.value)}
              required
            />
            {submittedAttempts && validation.errors.chief_complaint && (
              <span className="field-error-msg">{translateError('chief_complaint', validation.errors.chief_complaint)}</span>
            )}
            <span className="field-hint">
              {t('intake.chief_complaint_hint')}
            </span>
          </div>

          {/* Known Medical Conditions Chips */}
          <div className="form-group mt-3">
            <label className="form-label">
              {t('intake.known_conditions')} <span className="label-opt">(Select all reported)</span>
            </label>
            <div className="conditions-chips-group">
              {COMMON_CONDITIONS.map((cond) => {
                const isSelected = formData.known_conditions.includes(cond);
                return (
                  <button
                    key={cond}
                    type="button"
                    className={`condition-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleCondition(cond)}
                  >
                    {isSelected ? '✓ ' : '+ '}
                    {cond === 'None / Unknown' ? t('intake.condition_none') : cond}
                  </button>
                );
              })}
            </div>
          </div>
        </fieldset>

        {/* SECTION 3: VITAL SIGNS & MEASUREMENTS */}
        <fieldset className="intake-card-section">
          <legend className="section-legend flex-between">
            <div className="flex-center gap-2">
              <Activity size={18} className="legend-icon" />
              <span>{t('intake.sec3_title')}</span>
            </div>
            <div className="vitals-policy-badge">
              <HelpCircle size={14} />
              <span>{t('intake.vitals_subtitle')}</span>
            </div>
          </legend>

          <div className="form-grid-4">
            {/* Systolic BP */}
            <div className="form-group">
              <label htmlFor="field-systolic_bp" className="form-label">
                {t('intake.systolic_bp')} <span className="label-opt">{t('intake.patient_name_opt')}</span>
              </label>
              <input
                id="field-systolic_bp"
                type="number"
                min="40"
                max="300"
                className={`form-input ${submittedAttempts && validation.errors.systolic_bp ? 'input-error' : ''}`}
                placeholder="e.g. 120"
                value={formData.systolic_bp !== null ? formData.systolic_bp : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                  updateField('systolic_bp', val);
                }}
              />
              {submittedAttempts && validation.errors.systolic_bp && (
                <span className="field-error-msg">{translateError('blood_pressure', validation.errors.systolic_bp)}</span>
              )}
            </div>

            {/* Diastolic BP */}
            <div className="form-group">
              <label htmlFor="field-diastolic_bp" className="form-label">
                {t('intake.diastolic_bp')} <span className="label-opt">{t('intake.patient_name_opt')}</span>
              </label>
              <input
                id="field-diastolic_bp"
                type="number"
                min="20"
                max="200"
                className={`form-input ${submittedAttempts && validation.errors.diastolic_bp ? 'input-error' : ''}`}
                placeholder="e.g. 80"
                value={formData.diastolic_bp !== null ? formData.diastolic_bp : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                  updateField('diastolic_bp', val);
                }}
              />
              {submittedAttempts && validation.errors.diastolic_bp && (
                <span className="field-error-msg">{translateError('blood_pressure', validation.errors.diastolic_bp)}</span>
              )}
            </div>

            {/* Pulse Rate */}
            <div className="form-group">
              <label htmlFor="field-pulse_bpm" className="form-label">
                <Heart size={14} /> {t('intake.pulse')} <span className="label-opt">{t('intake.patient_name_opt')}</span>
              </label>
              <input
                id="field-pulse_bpm"
                type="number"
                min="0"
                max="300"
                className={`form-input ${isPulseZeroFlag ? 'input-pulse-critical' : ''} ${submittedAttempts && validation.errors.pulse_bpm ? 'input-error' : ''}`}
                placeholder="e.g. 76 (0 if pulseless)"
                value={formData.pulse_bpm !== null ? formData.pulse_bpm : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                  updateField('pulse_bpm', val);
                }}
              />
              {submittedAttempts && validation.errors.pulse_bpm && (
                <span className="field-error-msg">{translateError('pulse_bpm', validation.errors.pulse_bpm)}</span>
              )}
            </div>

            {/* Temperature with Unit Selector */}
            <div className="form-group">
              <label htmlFor="field-temperature" className="form-label">
                {t('intake.temp')} <span className="label-opt">{t('intake.patient_name_opt')}</span>
              </label>
              <div className="input-with-action">
                <input
                  id="field-temperature"
                  type="number"
                  step="0.1"
                  className={`form-input ${isTemp96Flag ? 'input-temp-warning' : ''} ${submittedAttempts && validation.errors.temperature ? 'input-error' : ''}`}
                  placeholder={formData.temperature_unit === 'F' ? 'e.g. 98.6' : 'e.g. 37.0'}
                  value={formData.temperature !== null ? formData.temperature : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseFloat(e.target.value);
                    updateField('temperature', val);
                  }}
                />
                <div className="unit-toggle-group">
                  <button
                    type="button"
                    className={`btn-unit ${formData.temperature_unit === 'F' ? 'active' : ''}`}
                    onClick={() => updateField('temperature_unit', 'F')}
                  >
                    °F
                  </button>
                  <button
                    type="button"
                    className={`btn-unit ${formData.temperature_unit === 'C' ? 'active' : ''}`}
                    onClick={() => updateField('temperature_unit', 'C')}
                  >
                    °C
                  </button>
                </div>
              </div>
              {submittedAttempts && validation.errors.temperature && (
                <span className="field-error-msg">{translateError('temperature', validation.errors.temperature)}</span>
              )}
            </div>

            {/* SpO2 % */}
            <div className="form-group">
              <label htmlFor="field-spo2" className="form-label">
                {t('intake.spo2')} <span className="label-opt">{t('intake.patient_name_opt')}</span>
              </label>
              <input
                id="field-spo2"
                type="number"
                min="30"
                max="100"
                className={`form-input ${formData.spo2 !== null && formData.spo2 < 90 ? 'input-pulse-critical' : ''} ${submittedAttempts && validation.errors.spo2 ? 'input-error' : ''}`}
                placeholder="e.g. 98"
                value={formData.spo2 !== null ? formData.spo2 : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                  updateField('spo2', val);
                }}
              />
              {submittedAttempts && validation.errors.spo2 && (
                <span className="field-error-msg">{translateError('spo2', validation.errors.spo2)}</span>
              )}
            </div>
          </div>

          {/* REAL-TIME SAFETY CALLOUTS BELOW VITALS */}
          {/* PULSE ZERO CRITICAL BANNER */}
          {isPulseZeroFlag && (
            <div className="inline-safety-callout critical mt-3" role="alert">
              <AlertOctagon size={20} className="safety-callout-icon" />
              <div>
                <strong>{t('intake.pulse_flag_warning')}</strong>
                <p>
                  Pulse of 0 is an active clinical finding, NOT missing data. Immediately check carotid pulse. If pulseless, begin CPR / Code Blue resuscitation protocol immediately.
                </p>
              </div>
            </div>
          )}

          {/* TEMPERATURE 96°F CLINICAL VERIFICATION BANNER */}
          {isTemp96Flag && (
            <div className="inline-safety-callout warning mt-3" role="alert">
              <AlertTriangle size={20} className="safety-callout-icon" />
              <div>
                <strong>{t('intake.temp_96_flag')}</strong>
                <p>
                  Reading corresponds to ~96.0°F (35.6°C). Flagged for bedside hypothermia / cold exposure verification. Do not assume this is a typographical error.
                </p>
              </div>
            </div>
          )}

          {/* SPO2 HYPOXEMIA BANNER */}
          {formData.spo2 !== null && formData.spo2 < 90 && (
            <div className="inline-safety-callout critical mt-3" role="alert">
              <AlertOctagon size={20} className="safety-callout-icon" />
              <div>
                <strong>{t('intake.spo2_hypoxia')}</strong>
                <p>
                  Patient requires immediate supplemental oxygen evaluation and accelerated medical officer examination.
                </p>
              </div>
            </div>
          )}
        </fieldset>

        {/* INLINE VALIDATION SUMMARY IF ATTEMPTED WITH ERRORS */}
        {submittedAttempts && !validation.isValid && (
          <div className="form-errors-summary" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>Please correct the following errors before submitting:</strong>
              <ul>
                {Object.entries(validation.errors).map(([fKey, err], i) => (
                  <li key={i}>{translateError(fKey, err)}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ACTIONS TOOLBAR */}
        <div className="intake-actions-toolbar">
          <div className="toolbar-left">
            <button
              type="button"
              className="btn btn-outline flex-center gap-1"
              onClick={handleClearForm}
              title={t('intake.btn_clear')}
            >
              <RotateCcw size={16} />
              <span>{t('intake.btn_clear')}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary flex-center gap-1"
              onClick={handleSaveDraft}
              title={t('intake.btn_save_draft')}
            >
              <Save size={16} />
              <span>{t('intake.btn_save_draft')}</span>
            </button>
          </div>

          <div className="toolbar-right">
            <button
              type="submit"
              className="btn btn-primary flex-center gap-2 btn-submit-intake"
            >
              <Send size={16} />
              <span>{t('intake.btn_submit')}</span>
            </button>
          </div>
        </div>
      </form>

      {/* CONFIRMATION SCREEN MODAL */}
      <IntakeConfirmationModal
        data={formData}
        validation={validation}
        isOpen={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        onConfirm={handleConfirmSubmit}
        isSubmitting={isSubmitting}
      />
    </div>
  );
};
