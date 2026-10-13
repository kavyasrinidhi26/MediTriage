import React, { useState } from 'react';
import type {
  PatientTriageRequest,
  VitalSigns,
  RedFlagChecklist,
  TriageAssessmentResult,
} from '../../types/triage';
import { VitalsInputGroup } from './VitalsInputGroup';
import { RedFlagSelector } from './RedFlagSelector';
import { AssessmentResultCard } from './AssessmentResultCard';
import { assessPatient, registerPatientToQueue } from '../../services/api';
import { User, FileText, Phone, Hash, Sparkles, Check } from 'lucide-react';

interface TriageFormProps {
  onPatientEnrolled?: (token: string) => void;
}

const defaultVitals: VitalSigns = {
  heart_rate: undefined,
  systolic_bp: undefined,
  diastolic_bp: undefined,
  respiratory_rate: undefined,
  spo2: undefined,
  temperature_f: undefined,
  avpu: 'ALERT',
};

const defaultRedFlags: RedFlagChecklist = {
  severe_respiratory_distress: false,
  crushing_chest_pain: false,
  acute_neurological_deficit: false,
  massive_bleeding_or_shock: false,
  severe_trauma: false,
  active_labor_or_eclampsia: false,
  high_fever_with_stiff_neck: false,
  severe_dehydration_lethargy: false,
};

export const TriageForm: React.FC<TriageFormProps> = ({ onPatientEnrolled }) => {
  const [patientName, setPatientName] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState('Male');
  const [phone, setPhone] = useState('');
  const [opdNumber, setOpdNumber] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [durationDays, setDurationDays] = useState<number | ''>(1);
  const [vitals, setVitals] = useState<VitalSigns>(defaultVitals);
  const [redFlags, setRedFlags] = useState<RedFlagChecklist>(defaultRedFlags);
  const [notes, setNotes] = useState('');

  const [loadingAssess, setLoadingAssess] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [assessment, setAssessment] = useState<TriageAssessmentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToken, setSuccessToken] = useState<string | null>(null);

  // Quick complaint presets for emergency counters
  const presets = [
    {
      label: 'Chest Pain (Cardiac)',
      patient_name: 'Ramesh Kumar',
      age: 58,
      gender: 'Male',
      complaint: 'Crushing chest pain radiating to left arm with profuse perspiration',
      vitals: { heart_rate: 125, systolic_bp: 88, diastolic_bp: 58, respiratory_rate: 26, spo2: 91, temperature_f: 98.6, avpu: 'ALERT' as const },
      flags: { crushing_chest_pain: true },
    },
    {
      label: 'Asthma Attack',
      patient_name: 'Priya Sharma',
      age: 29,
      gender: 'Female',
      complaint: 'Severe wheezing, breathlessness, using accessory respiratory muscles',
      vitals: { heart_rate: 115, systolic_bp: 130, diastolic_bp: 85, respiratory_rate: 28, spo2: 92, temperature_f: 99.1, avpu: 'ALERT' as const },
      flags: { severe_respiratory_distress: true },
    },
    {
      label: 'Pediatric High Fever',
      patient_name: 'Aarav Verma',
      age: 3,
      gender: 'Male',
      complaint: 'High grade fever with persistent cough and reduced oral intake',
      vitals: { heart_rate: 122, systolic_bp: 98, diastolic_bp: 62, respiratory_rate: 28, spo2: 97, temperature_f: 102.8, avpu: 'ALERT' as const },
      flags: {},
    },
    {
      label: 'Routine Knee Pain',
      patient_name: 'Sunita Devi',
      age: 52,
      gender: 'Female',
      complaint: 'Chronic bilateral knee joint stiffness and osteoarthritis pain for 6 months',
      vitals: { heart_rate: 74, systolic_bp: 128, diastolic_bp: 80, respiratory_rate: 16, spo2: 98, temperature_f: 98.4, avpu: 'ALERT' as const },
      flags: {},
    },
  ];

  const applyPreset = (preset: typeof presets[0]) => {
    setPatientName(preset.patient_name);
    setAge(preset.age);
    setGender(preset.gender);
    setChiefComplaint(preset.complaint);
    setVitals({ ...defaultVitals, ...preset.vitals });
    setRedFlags({ ...defaultRedFlags, ...preset.flags });
    setAssessment(null);
    setSuccessToken(null);
  };

  const buildPayload = (): PatientTriageRequest => {
    return {
      patient_name: patientName.trim() || 'Anonymous OPD Patient',
      age: age === '' ? 35 : Number(age),
      gender,
      contact_phone: phone.trim() || undefined,
      opd_registration_number: opdNumber.trim() || undefined,
      chief_complaint: chiefComplaint.trim() || 'General health consultation',
      symptom_duration_days: durationDays === '' ? 0 : Number(durationDays),
      vitals,
      red_flags: redFlags,
      clinical_notes: notes.trim() || undefined,
    };
  };

  const handleRunAssessment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);
    setSuccessToken(null);

    if (!patientName.trim()) {
      setErrorMessage('Please enter Patient Name.');
      return;
    }
    if (age === '' || Number(age) < 0) {
      setErrorMessage('Please enter a valid Patient Age.');
      return;
    }
    if (!chiefComplaint.trim()) {
      setErrorMessage('Please enter Chief Presenting Complaint.');
      return;
    }

    try {
      setLoadingAssess(true);
      const payload = buildPayload();
      const result = await assessPatient(payload);
      setAssessment(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error communicating with Triage AI service.');
    } finally {
      setLoadingAssess(false);
    }
  };

  const handleEnrollDirect = async () => {
    setErrorMessage(null);
    if (!patientName.trim() || age === '' || !chiefComplaint.trim()) {
      setErrorMessage('Please fill in Name, Age, and Chief Complaint before queueing.');
      return;
    }

    try {
      setEnrolling(true);
      const payload = buildPayload();
      const queuedItem = await registerPatientToQueue(payload);
      setSuccessToken(queuedItem.token_number);
      setAssessment(queuedItem.assessment);

      if (onPatientEnrolled) {
        onPatientEnrolled(queuedItem.token_number);
      }

      // Reset form fields for next queue patient
      setPatientName('');
      setAge('');
      setPhone('');
      setOpdNumber('');
      setChiefComplaint('');
      setVitals(defaultVitals);
      setRedFlags(defaultRedFlags);
      setNotes('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error registering patient into queue.');
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <div className="triage-form-container">
      {/* Quick Preset Selector for Fast Demos and Triage Rushes */}
      <div className="preset-bar">
        <span className="preset-label">
          <Sparkles size={16} /> Quick Intake Scenarios:
        </span>
        <div className="preset-buttons">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className="preset-btn"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <div className="error-alert">
          <span>{errorMessage}</span>
        </div>
      )}

      {successToken && (
        <div className="success-enroll-card">
          <div className="success-icon-wrap">
            <Check size={28} />
          </div>
          <div>
            <div className="success-heading">Patient Successfully Added to OPD Queue</div>
            <div className="token-display">
              Token Number: <span className="token-highlight">{successToken}</span>
            </div>
            <div className="success-sub">
              Prioritized according to vital risk score. Check the Live OPD Queue tab to track.
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleRunAssessment} className="triage-main-form">
        {/* Section 1: Demographics */}
        <div className="form-card">
          <h3 className="section-title">Patient Identification & Registration</h3>
          <div className="form-grid-3">
            <div className="form-group">
              <label htmlFor="pname">
                <User size={14} style={{ display: 'inline', marginRight: 4 }} />
                Patient Full Name *
              </label>
              <input
                id="pname"
                type="text"
                required
                placeholder="e.g. Ramesh Kumar"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="page">Age (Years) *</label>
              <input
                id="page"
                type="number"
                required
                min="0"
                max="130"
                placeholder="e.g. 45"
                value={age}
                onChange={(e) => setAge(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="pgender">Gender *</label>
              <select
                id="pgender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="form-select"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="pphone">
                <Phone size={14} style={{ display: 'inline', marginRight: 4 }} />
                Contact Phone Number
              </label>
              <input
                id="pphone"
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="popd">
                <Hash size={14} style={{ display: 'inline', marginRight: 4 }} />
                UHID / OPD Registration Slip No.
              </label>
              <input
                id="popd"
                type="text"
                placeholder="e.g. UHID-2026-1049"
                value={opdNumber}
                onChange={(e) => setOpdNumber(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Clinical Chief Complaint */}
        <div className="form-card">
          <h3 className="section-title">Presenting Clinical Complaint</h3>
          <div className="form-group">
            <label htmlFor="pcomplaint">
              <FileText size={14} style={{ display: 'inline', marginRight: 4 }} />
              Chief Complaint / Reason for OPD Visit *
            </label>
            <textarea
              id="pcomplaint"
              required
              rows={3}
              placeholder="Describe symptoms (e.g. Sudden chest tightness, wheezing, high fever, abdominal cramps, chronic joint pain)..."
              value={chiefComplaint}
              onChange={(e) => setChiefComplaint(e.target.value)}
              className="form-textarea"
            />
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="pduration">Symptom Duration (Days)</label>
              <input
                id="pduration"
                type="number"
                min="0"
                placeholder="e.g. 2"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="pnotes">Intake Nurse / Counter Notes</label>
              <input
                id="pnotes"
                type="text"
                placeholder="e.g. Accompanied by son, ambulatory, wheelchair required"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Vitals */}
        <VitalsInputGroup vitals={vitals} onChange={setVitals} />

        {/* Section 4: Red Flag Checklist */}
        <RedFlagSelector redFlags={redFlags} onChange={setRedFlags} />

        {/* Action Controls */}
        <div className="form-submit-row">
          <button
            type="submit"
            disabled={loadingAssess || enrolling}
            className="btn-secondary btn-large"
          >
            {loadingAssess ? 'Assessing Risk...' : 'Run Triage Assessment Preview'}
          </button>

          <button
            type="button"
            onClick={handleEnrollDirect}
            disabled={enrolling || loadingAssess}
            className="btn-primary btn-large"
          >
            {enrolling ? 'Queueing Patient...' : 'Assess & Enroll into OPD Queue'}
          </button>
        </div>
      </form>

      {/* Assessment Outcome Display */}
      {assessment && (
        <div className="assessment-output-wrapper">
          <AssessmentResultCard
            assessment={assessment}
            onConfirmQueue={handleEnrollDirect}
            isQueueing={enrolling}
          />
        </div>
      )}
    </div>
  );
};
