import React, { useState, useEffect } from 'react';
import {
  Ambulance,
  X,
  AlertOctagon,
  ShieldAlert,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  HeartPulse,
} from 'lucide-react';
import type {
  EmergencyIntakePayload,
  AccidentType,
  IdentityStatus,
  EmergencyCaseItem,
} from '../../types/triage';
import { createEmergencyCase } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { VoiceInputButton } from '../common/VoiceInputButton';

interface EmergencyIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmergencyActivated?: (caseItem: EmergencyCaseItem) => void;
}

export const EmergencyIntakeModal: React.FC<EmergencyIntakeModalProps> = ({
  isOpen,
  onClose,
  onEmergencyActivated,
}) => {
  const { t } = useLanguage();
  // State: Generated Case ID (stable across retries)
  const [caseId, setCaseId] = useState<string>('');

  // Identity
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>('UNKNOWN');
  const [patientName, setPatientName] = useState<string>('');
  const [approximateAge, setApproximateAge] = useState<string>('');
  const [gender, setGender] = useState<string>('Unknown');

  // Accident Details
  const [accidentType, setAccidentType] = useState<AccidentType>('ROAD_TRAFFIC_ACCIDENT');
  const [mechanismOfInjury, setMechanismOfInjury] = useState<string>('');
  const [arrivalTime, setArrivalTime] = useState<string>('');

  // Primary Survey (ABCDE)
  const [airwayStatus, setAirwayStatus] = useState<string>('Compromised');
  const [breathingStatus, setBreathingStatus] = useState<string>('Severe Distress');
  const [circulationStatus, setCirculationStatus] = useState<string>('Weak Thread');
  const [neurologicalStatus, setNeurologicalStatus] = useState<string>('Pain Only (P)');
  const [majorBleeding, setMajorBleeding] = useState<string>('Controlled Extremity');

  // Vitals (optional)
  const [pulse, setPulse] = useState<string>('126');
  const [systolicBp, setSystolicBp] = useState<string>('84');
  const [diastolicBp, setDiastolicBp] = useState<string>('52');
  const [respiratoryRate, setRespiratoryRate] = useState<string>('30');
  const [spo2, setSpo2] = useState<string>('88');
  const [temperature, setTemperature] = useState<string>('97.2');
  const [gcsScore, setGcsScore] = useState<string>('8');

  // Red Flags
  const [selectedRedFlags, setSelectedRedFlags] = useState<string[]>([
    'High-Velocity Trauma / Severe Impact',
    'Massive Bleeding or Shock Symptoms',
    'Severe Respiratory Distress / Hypoxia',
  ]);

  // Interventions & Staff
  const [immediateActions, setImmediateActions] = useState<string>(
    'Rigid cervical collar applied; 15L O2 via NRB mask; 2 large-bore 16G IV cannulas secured'
  );
  const [activatedBy, setActivatedBy] = useState<string>('Trauma Nursing Station / CMO');
  const [assignedBay, setAssignedBay] = useState<string>('Red Trauma Bay 01');

  // Submission / Error state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successCase, setSuccessCase] = useState<EmergencyCaseItem | null>(null);

  // Initialize unique Case ID on mount or when opening
  useEffect(() => {
    if (isOpen && !caseId) {
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      setCaseId(`EMG-${todayStr}-${randomSuffix}`);
      setArrivalTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    }
    if (!isOpen) {
      // Reset state on close
      setSuccessCase(null);
      setError(null);
    }
  }, [isOpen, caseId]);

  if (!isOpen) return null;

  const handleToggleRedFlag = (flag: string) => {
    setSelectedRedFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    );
  };

  const handleActivateEmergency = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (systolicBp && diastolicBp) {
      const s = parseInt(systolicBp, 10);
      const d = parseInt(diastolicBp, 10);
      if (!isNaN(s) && !isNaN(d) && s <= d) {
        setError('Systolic BP must be strictly greater than Diastolic BP.');
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    const payload: EmergencyIntakePayload = {
      case_id: caseId,
      patient_identity_status: identityStatus,
      patient_name: identityStatus === 'KNOWN' ? patientName.trim() || undefined : undefined,
      approximate_age: approximateAge ? parseInt(approximateAge, 10) : undefined,
      gender: gender,
      accident_type: accidentType,
      mechanism_of_injury: mechanismOfInjury.trim() || undefined,
      arrival_time: arrivalTime || undefined,
      airway_status: airwayStatus,
      breathing_status: breathingStatus,
      circulation_status: circulationStatus,
      neurological_status: neurologicalStatus,
      major_bleeding: majorBleeding,
      pulse_bpm: pulse ? parseInt(pulse, 10) : undefined,
      systolic_bp: systolicBp ? parseInt(systolicBp, 10) : undefined,
      diastolic_bp: diastolicBp ? parseInt(diastolicBp, 10) : undefined,
      respiratory_rate: respiratoryRate ? parseInt(respiratoryRate, 10) : undefined,
      spo2: spo2 ? parseFloat(spo2) : undefined,
      temperature_f: temperature ? parseFloat(temperature) : undefined,
      gcs_score: gcsScore ? parseInt(gcsScore, 10) : undefined,
      red_flags: selectedRedFlags,
      escalation_reason: `Rapid accident intake: ${accidentType.replace(/_/g, ' ')} with immediate resuscitation response.`,
      immediate_actions_taken: immediateActions.trim() || undefined,
      activated_by: activatedBy.trim() || 'Staff Nurse',
      assigned_resuscitation_bay: assignedBay,
    };

    try {
      const created = await createEmergencyCase(payload);
      setSuccessCase(created);
      onEmergencyActivated?.(created);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Network error communicating with emergency backend. Click Retry below to safely re-attempt.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop emergency-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-intake-title"
    >
      <div
        className="modal-card modal-large-card emergency-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header with Emergency Styling */}
        <div className="emergency-modal-header">
          <div className="emergency-header-left">
            <div className="emergency-icon-pulse-badge">
              <Ambulance size={26} className="emergency-ambulance-icon" />
              <span className="emergency-beacon-ring" aria-hidden="true" />
            </div>
            <div>
              <div className="emergency-badge-row">
                <span className="emergency-case-id-chip">{caseId || 'EMG-GENERATING...'}</span>
                <span className="emergency-priority-chip">LEVEL 1 CASUALTY / TRAUMA OVERRIDE</span>
                <span className="emergency-demo-pill">
                  <Sparkles size={11} /> Synthetic Demo Records
                </span>
              </div>
              <h2 id="emergency-intake-title" className="emergency-modal-title">
                Emergency Accident Intake & Rapid Triage
              </h2>
              <p className="emergency-modal-subtitle">
                Rapid clinician protocol: Initiate immediate trauma care without administrative registration delays.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-button emergency-close-button"
            onClick={onClose}
            aria-label="Close emergency intake modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-scrollable emergency-modal-body">
          {successCase ? (
            /* Confirmation Feedback Screen */
            <div className="emergency-success-view">
              <div className="emergency-success-icon-wrap">
                <CheckCircle2 size={48} className="emergency-success-check" />
              </div>
              <h3 className="emergency-success-title">Emergency Response Activated!</h3>
              <p className="emergency-success-desc">
                Case <strong>{successCase.case_id}</strong> is now live in the dedicated Emergency Queue. Resuscitation Bay <strong>{successCase.assigned_resuscitation_bay}</strong> has been allocated.
              </p>

              {/* Protocol Instructions Checklist */}
              <div className="emergency-protocol-checklist-card">
                <div className="protocol-checklist-header">
                  <AlertOctagon size={18} className="text-emergency-red" />
                  <h4>Hospital Trauma Resuscitation Protocol:</h4>
                </div>
                <ul className="protocol-instructions-list">
                  {successCase.hospital_protocol_instructions.map((instruction, idx) => (
                    <li key={idx} className="protocol-instruction-item">
                      {instruction}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="emergency-success-actions">
                <button
                  type="button"
                  className="cult-shimmer-btn cult-shimmer-primary"
                  onClick={onClose}
                >
                  View Emergency Queue
                </button>
              </div>
            </div>
          ) : (
            /* Emergency Rapid Intake Form */
            <form onSubmit={handleActivateEmergency} className="emergency-intake-form">
              {error && (
                <div className="emergency-error-banner" role="alert">
                  <AlertTriangle size={18} />
                  <div className="error-banner-content">
                    <strong>Transmission Error:</strong> {error}
                    <button
                      type="button"
                      onClick={() => handleActivateEmergency()}
                      className="error-retry-btn"
                    >
                      <RotateCcw size={13} /> Retry Safely (Preserves Case ID)
                    </button>
                  </div>
                </div>
              )}

              {/* Clinical Staff Responsibility & Zero-Delay Banner */}
              <div style={{
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '0.82rem',
                color: '#9f1239'
              }}>
                <ShieldAlert size={18} style={{ flexShrink: 0, color: '#e11d48' }} />
                <span>
                  <strong>Clinical Policy Notice:</strong> Qualified clinical staff assess and manage emergencies. Emergency trauma resuscitation must never be delayed for intake documentation or software operations.
                </span>
              </div>

              {/* SECTION 1: Patient Identity & Demographics */}
              <div className="emergency-form-section">
                <div className="form-section-title">
                  <ShieldAlert size={16} className="text-emergency-red" />
                  <span>1. Patient Identity & Demographics (Optional for Trauma)</span>
                </div>
                <div className="identity-status-selector">
                  <span className="selector-label">Identity Status:</span>
                  <div className="selector-options">
                    <label className={`radio-pill ${identityStatus === 'UNKNOWN' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="identityStatus"
                        value="UNKNOWN"
                        checked={identityStatus === 'UNKNOWN'}
                        onChange={() => setIdentityStatus('UNKNOWN')}
                      />
                      <span>Unknown / Unidentified</span>
                    </label>
                    <label className={`radio-pill ${identityStatus === 'NOT_YET_VERIFIED' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="identityStatus"
                        value="NOT_YET_VERIFIED"
                        checked={identityStatus === 'NOT_YET_VERIFIED'}
                        onChange={() => setIdentityStatus('NOT_YET_VERIFIED')}
                      />
                      <span>Not Yet Verified</span>
                    </label>
                    <label className={`radio-pill ${identityStatus === 'KNOWN' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="identityStatus"
                        value="KNOWN"
                        checked={identityStatus === 'KNOWN'}
                        onChange={() => setIdentityStatus('KNOWN')}
                      />
                      <span>Known Patient</span>
                    </label>
                  </div>
                </div>

                <div className="form-grid-3">
                  {identityStatus === 'KNOWN' && (
                    <div className="form-field">
                      <label htmlFor="patient-name-input">Patient Name</label>
                      <input
                        id="patient-name-input"
                        type="text"
                        placeholder="e.g. Rajesh Patil"
                        value={patientName}
                        onChange={(e) => setPatientName(e.target.value)}
                        className="form-input"
                      />
                    </div>
                  )}
                  <div className="form-field">
                    <label htmlFor="approx-age-input">Approx. Age (Years)</label>
                    <input
                      id="approx-age-input"
                      type="number"
                      placeholder="e.g. 30"
                      min={0}
                      max={120}
                      value={approximateAge}
                      onChange={(e) => setApproximateAge(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="gender-select">Sex / Gender</label>
                    <select
                      id="gender-select"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="form-select"
                    >
                      <option value="Unknown">Unknown</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label htmlFor="arrival-time-input">Recorded Arrival Time</label>
                    <input
                      id="arrival-time-input"
                      type="text"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Accident Classification & Mechanism of Injury */}
              <div className="emergency-form-section">
                <div className="form-section-title">
                  <AlertOctagon size={16} className="text-emergency-red" />
                  <span>2. Accident Type & Mechanism of Injury</span>
                </div>
                <div className="accident-types-grid">
                  {[
                    { type: 'ROAD_TRAFFIC_ACCIDENT', label: 'Road Traffic Accident (RTA)' },
                    { type: 'FALL', label: 'Severe Fall / Height' },
                    { type: 'WORKPLACE_ACCIDENT', label: 'Workplace / Industrial Trauma' },
                    { type: 'BURN', label: 'Severe Burn / Electrical' },
                    { type: 'OTHER', label: 'Other Acute Injury' },
                  ].map((acc) => (
                    <button
                      key={acc.type}
                      type="button"
                      className={`accident-type-chip ${accidentType === acc.type ? 'active' : ''}`}
                      onClick={() => setAccidentType(acc.type as AccidentType)}
                    >
                      {acc.label}
                    </button>
                  ))}
                </div>

                <div className="form-field mt-3">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
                    <label htmlFor="mechanism-input" style={{ margin: 0 }}>
                      {t('emergency.mechanism')}
                    </label>
                    <VoiceInputButton
                      targetFieldLabel={t('emergency.mechanism')}
                      onTranscriptAccepted={(text, mode) => {
                        if (mode === 'insert') {
                          setMechanismOfInjury(text);
                        } else {
                          setMechanismOfInjury((prev) => prev ? `${prev} ${text}` : text);
                        }
                      }}
                    />
                  </div>
                  <textarea
                    id="mechanism-input"
                    rows={2}
                    placeholder={t('emergency.mechanism_placeholder')}
                    value={mechanismOfInjury}
                    onChange={(e) => setMechanismOfInjury(e.target.value)}
                    className="form-textarea"
                  />
                </div>
              </div>

              {/* SECTION 3: Rapid Primary Survey (ABCDE Framework) */}
              <div className="emergency-form-section">
                <div className="form-section-title">
                  <HeartPulse size={16} className="text-emergency-red" />
                  <span>3. Rapid Primary Survey (ABCDE Clinical Observations)</span>
                </div>
                <div className="abcde-grid">
                  <div className="abcde-box">
                    <span className="abcde-letter">A</span>
                    <span className="abcde-label">Airway</span>
                    <select
                      value={airwayStatus}
                      onChange={(e) => setAirwayStatus(e.target.value)}
                      className="abcde-select"
                      aria-label="Airway Status"
                    >
                      <option value="Intact / Clear">Clear / Patent</option>
                      <option value="Compromised">Compromised / Stridor</option>
                      <option value="Threatened / Gurgling">Gurgling / Secretions</option>
                      <option value="Obstructed">Obstructed</option>
                      <option value="Intubated / Maintained">Intubated / Airway Maintained</option>
                    </select>
                  </div>

                  <div className="abcde-box">
                    <span className="abcde-letter">B</span>
                    <span className="abcde-label">Breathing</span>
                    <select
                      value={breathingStatus}
                      onChange={(e) => setBreathingStatus(e.target.value)}
                      className="abcde-select"
                      aria-label="Breathing Status"
                    >
                      <option value="Normal">Normal</option>
                      <option value="Dyspnea / Shallow">Dyspnea / Shallow</option>
                      <option value="Severe Distress">Severe Tachypnea / Retractions</option>
                      <option value="Cyanosis / Agonal">Cyanosis / Agonal</option>
                      <option value="Absent">Apneic / Absent</option>
                    </select>
                  </div>

                  <div className="abcde-box">
                    <span className="abcde-letter">C</span>
                    <span className="abcde-label">Circulation</span>
                    <select
                      value={circulationStatus}
                      onChange={(e) => setCirculationStatus(e.target.value)}
                      className="abcde-select"
                      aria-label="Circulation Status"
                    >
                      <option value="Palpable Regular">Palpable Regular</option>
                      <option value="Tachycardic / Full">Tachycardic / Full</option>
                      <option value="Weak Thread">Weak Thready Pulses</option>
                      <option value="Severe Shock">Cold Clammy / Shock</option>
                      <option value="Pulseless">Pulseless (Arrest)</option>
                    </select>
                  </div>

                  <div className="abcde-box">
                    <span className="abcde-letter">D</span>
                    <span className="abcde-label">Disability (AVPU)</span>
                    <select
                      value={neurologicalStatus}
                      onChange={(e) => setNeurologicalStatus(e.target.value)}
                      className="abcde-select"
                      aria-label="Disability Status"
                    >
                      <option value="Alert (A)">Alert (A)</option>
                      <option value="Verbal (V)">Voice (V)</option>
                      <option value="Pain Only (P)">Pain Only (P)</option>
                      <option value="Unresponsive (U)">Unresponsive (U)</option>
                      <option value="Acute Seizure">Active Seizure</option>
                    </select>
                  </div>

                  <div className="abcde-box">
                    <span className="abcde-letter">E</span>
                    <span className="abcde-label">Exposure & Bleed</span>
                    <select
                      value={majorBleeding}
                      onChange={(e) => setMajorBleeding(e.target.value)}
                      className="abcde-select"
                      aria-label="Major Bleeding"
                    >
                      <option value="None">No Major External Bleeding</option>
                      <option value="Controlled Extremity">Controlled Extremity Bleed</option>
                      <option value="Massive Hemorrhage">Massive Uncontrolled Bleed</option>
                      <option value="Tourniquet Applied">Tourniquet Applied</option>
                      <option value="Traumatic Amputation">Traumatic Amputation</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 4: Available Physiological Vitals (Optional) */}
              <div className="emergency-form-section">
                <div className="form-section-title">
                  <Clock size={16} className="text-emergency-red" />
                  <span>4. Physiological Vitals (Enter if Available; None Required to Activate)</span>
                </div>
                <div className="form-grid-6">
                  <div className="form-field">
                    <label htmlFor="pulse-input">Pulse (bpm)</label>
                    <input
                      id="pulse-input"
                      type="number"
                      placeholder="e.g. 120"
                      value={pulse}
                      onChange={(e) => setPulse(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="sbp-input">Systolic BP (mmHg)</label>
                    <input
                      id="sbp-input"
                      type="number"
                      placeholder="e.g. 80"
                      value={systolicBp}
                      onChange={(e) => setSystolicBp(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="dbp-input">Diastolic BP (mmHg)</label>
                    <input
                      id="dbp-input"
                      type="number"
                      placeholder="e.g. 50"
                      value={diastolicBp}
                      onChange={(e) => setDiastolicBp(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="spo2-input">SpO2 (%)</label>
                    <input
                      id="spo2-input"
                      type="number"
                      placeholder="e.g. 88"
                      value={spo2}
                      onChange={(e) => setSpo2(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="rr-input">Resp. Rate (/min)</label>
                    <input
                      id="rr-input"
                      type="number"
                      placeholder="e.g. 30"
                      value={respiratoryRate}
                      onChange={(e) => setRespiratoryRate(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="gcs-input">GCS (3-15)</label>
                    <input
                      id="gcs-input"
                      type="number"
                      placeholder="e.g. 8"
                      min={3}
                      max={15}
                      value={gcsScore}
                      onChange={(e) => setGcsScore(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="emergency-temp-input">Temp (°F)</label>
                    <input
                      id="emergency-temp-input"
                      type="number"
                      step="0.1"
                      placeholder="e.g. 98.4"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 5: Red Flags & Immediate Actions */}
              <div className="emergency-form-section">
                <div className="form-section-title">
                  <AlertOctagon size={16} className="text-emergency-red" />
                  <span>5. Clinical Red Flags & Immediate Actions Taken</span>
                </div>
                <div className="red-flags-checkbox-grid">
                  {[
                    'High-Velocity Trauma / Severe Impact',
                    'Massive Bleeding or Shock Symptoms',
                    'Severe Respiratory Distress / Hypoxia',
                    'Penetrating Torso / Head Injury',
                    'Unstable Pelvis / Bilateral Femur Fractures',
                    'Altered Sensorium / GCS <= 8',
                    'High-Tension Electrical / Inhalation Burn',
                  ].map((flag) => {
                    const isChecked = selectedRedFlags.includes(flag);
                    return (
                      <label
                        key={flag}
                        className={`red-flag-checkbox-chip ${isChecked ? 'checked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleRedFlag(flag)}
                        />
                        <span>{flag}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="form-grid-2 mt-3">
                  <div className="form-field">
                    <label htmlFor="actions-taken-input">Immediate Interventions Already Administered</label>
                    <input
                      id="actions-taken-input"
                      type="text"
                      placeholder="e.g. Cervical collar applied; 15L O2 started; 2x 16G IV placed"
                      value={immediateActions}
                      onChange={(e) => setImmediateActions(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor="bay-select">Assigned Resuscitation Bay</label>
                    <select
                      id="bay-select"
                      value={assignedBay}
                      onChange={(e) => setAssignedBay(e.target.value)}
                      className="form-select"
                    >
                      <option value="Red Trauma Bay 01">Red Trauma Bay 01 (Major Resuscitation)</option>
                      <option value="Red Trauma Bay 02">Red Trauma Bay 02 (Surgical / Shock)</option>
                      <option value="Red Trauma Bay 03">Red Trauma Bay 03 (Burn / Isolation)</option>
                    </select>
                  </div>
                </div>

                <div className="form-field mt-2">
                  <label htmlFor="activated-by-input">Activating Clinician / Staff Nurse</label>
                  <input
                    id="activated-by-input"
                    type="text"
                    value={activatedBy}
                    onChange={(e) => setActivatedBy(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              {/* Protocol Instructions Notice */}
              <div className="emergency-protocol-callout">
                <AlertOctagon size={18} className="callout-icon" />
                <div className="callout-text">
                  <strong>Hospital Protocol Notice:</strong> Activating emergency response will alert the Casualty Medical Officer and allocate Resuscitation Bay. Machine-learning predictions and routine demographic forms are deliberately bypassed for immediate clinical care.
                </div>
              </div>

              {/* Modal Footer with Emergency Action Button */}
              <div className="emergency-form-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancel / Return
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="emergency-activate-btn"
                  id="btn-activate-emergency-response"
                >
                  <Ambulance size={18} />
                  <span>{isSubmitting ? 'Activating Protocol...' : 'Activate Emergency Response'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
