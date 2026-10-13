import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Ambulance,
  ArrowLeft,
  Clock,
  AlertOctagon,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Activity,
  Building2,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import type {
  EmergencyIntakePayload,
  AccidentType,
  IdentityStatus,
  EmergencyCaseItem,
} from '../types/triage';
import {
  createEmergencyCase,
  fetchEmergencyCases,
} from '../services/api';
import { EmergencyQueuePanel } from '../components/emergency/EmergencyQueuePanel';
import { EmergencyCaseDetailModal } from '../components/emergency/EmergencyCaseDetailModal';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSelector } from '../components/common/LanguageSelector';
import { VoiceInputButton } from '../components/common/VoiceInputButton';

export const EmergencyIntakePage: React.FC = () => {
  const { t } = useLanguage();

  // Generated Case ID (collision-resistant & stable across network retries)
  const [caseId, setCaseId] = useState<string>('');
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Patient Identity
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>('UNKNOWN');
  const [patientName, setPatientName] = useState<string>('');
  const [approximateAge, setApproximateAge] = useState<string>('');
  const [gender, setGender] = useState<string>('Unknown');

  // Accident Details
  const [accidentType, setAccidentType] = useState<AccidentType>('ROAD_TRAFFIC_ACCIDENT');
  const [mechanismOfInjury, setMechanismOfInjury] = useState<string>('');
  const [arrivalTime, setArrivalTime] = useState<string>('');

  // Primary Survey (ABCDE Rapid Observations)
  const [airwayStatus, setAirwayStatus] = useState<string>('Compromised');
  const [breathingStatus, setBreathingStatus] = useState<string>('Severe Distress');
  const [circulationStatus, setCirculationStatus] = useState<string>('Weak Thread');
  const [neurologicalStatus, setNeurologicalStatus] = useState<string>('Pain Only (P)');
  const [majorBleeding, setMajorBleeding] = useState<string>('Controlled Extremity');

  // Physiological Vitals (completely optional for emergency activation)
  const [pulse, setPulse] = useState<string>('126');
  const [systolicBp, setSystolicBp] = useState<string>('84');
  const [diastolicBp, setDiastolicBp] = useState<string>('52');
  const [respiratoryRate, setRespiratoryRate] = useState<string>('30');
  const [spo2, setSpo2] = useState<string>('88');
  const [temperature, setTemperature] = useState<string>('97.2');
  const [gcsScore, setGcsScore] = useState<string>('8');

  // Observed Red Flags
  const [selectedRedFlags, setSelectedRedFlags] = useState<string[]>([
    'High-Velocity Trauma / Severe Impact',
    'Massive Bleeding or Shock Symptoms',
    'Severe Respiratory Distress / Hypoxia',
  ]);

  // Immediate Interventions & Staff Notes
  const [immediateActions, setImmediateActions] = useState<string>(
    'Rigid cervical collar applied; 15L O2 via NRB mask; 2 large-bore 16G IV cannulas secured'
  );
  const [staffNotes, setStaffNotes] = useState<string>('');
  const [activatedBy, setActivatedBy] = useState<string>('Trauma Nursing Station / CMO');
  const [assignedBay, setAssignedBay] = useState<string>('Red Trauma Bay 01');

  // Submission & Validation States
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [successCase, setSuccessCase] = useState<EmergencyCaseItem | null>(null);

  // Live Emergency Cases & Selected Case for Detail Modal
  const [emergencyCases, setEmergencyCases] = useState<EmergencyCaseItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState<boolean>(false);
  const [selectedCase, setSelectedCase] = useState<EmergencyCaseItem | null>(null);

  // Generate ID on mount
  const generateNewCaseId = useCallback(() => {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newId = `EMG-${todayStr}-${randomSuffix}`;
    setCaseId(newId);
    setArrivalTime(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    return newId;
  }, []);

  useEffect(() => {
    if (!caseId) {
      generateNewCaseId();
    }
  }, [caseId, generateNewCaseId]);

  // Load live emergency queue
  const loadEmergencyQueue = useCallback(async () => {
    setIsLoadingQueue(true);
    try {
      const cases = await fetchEmergencyCases();
      setEmergencyCases(cases);
    } catch {
      // Non-blocking fallback
    } finally {
      setIsLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    loadEmergencyQueue();
    const interval = setInterval(loadEmergencyQueue, 8000);
    return () => clearInterval(interval);
  }, [loadEmergencyQueue]);

  const handleCopyId = () => {
    if (!caseId) return;
    navigator.clipboard.writeText(caseId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleToggleRedFlag = (flag: string) => {
    setSelectedRedFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    );
  };

  const handleClearVitals = () => {
    setPulse('');
    setSystolicBp('');
    setDiastolicBp('');
    setRespiratoryRate('');
    setSpo2('');
    setTemperature('');
    setGcsScore('');
  };

  const handleSetNormalVitals = () => {
    setPulse('80');
    setSystolicBp('120');
    setDiastolicBp('80');
    setRespiratoryRate('16');
    setSpo2('98');
    setTemperature('98.6');
    setGcsScore('15');
  };

  const validateForm = (): boolean => {
    const errors: string[] = [];
    if (approximateAge) {
      const ageNum = parseInt(approximateAge, 10);
      if (isNaN(ageNum) || ageNum < 0 || ageNum > 130) {
        errors.push('Approximate age must be between 0 and 130 years.');
      }
    }
    if (pulse) {
      const p = parseInt(pulse, 10);
      if (isNaN(p) || p < 0 || p > 300) {
        errors.push('Pulse must be between 0 and 300 bpm.');
      }
    }
    if (systolicBp) {
      const s = parseInt(systolicBp, 10);
      if (isNaN(s) || s < 30 || s > 300) {
        errors.push('Systolic BP must be between 30 and 300 mmHg.');
      }
    }
    if (diastolicBp) {
      const d = parseInt(diastolicBp, 10);
      if (isNaN(d) || d < 10 || d > 200) {
        errors.push('Diastolic BP must be between 10 and 200 mmHg.');
      }
    }
    if (systolicBp && diastolicBp) {
      const s = parseInt(systolicBp, 10);
      const d = parseInt(diastolicBp, 10);
      if (!isNaN(s) && !isNaN(d) && s <= d) {
        errors.push('Systolic BP must be strictly greater than Diastolic BP.');
      }
    }
    if (spo2) {
      const sp = parseFloat(spo2);
      if (isNaN(sp) || sp < 20 || sp > 100) {
        errors.push('SpO2 must be between 20% and 100%.');
      }
    }
    if (gcsScore) {
      const g = parseInt(gcsScore, 10);
      if (isNaN(g) || g < 3 || g > 15) {
        errors.push('Glasgow Coma Scale (GCS) must be between 3 and 15.');
      }
    }
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleActivateEmergency = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    const fullNotes = [
      immediateActions ? `Actions: ${immediateActions}` : '',
      staffNotes ? `Staff Notes: ${staffNotes}` : '',
    ].filter(Boolean).join(' | ');

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
      immediate_actions_taken: fullNotes || undefined,
      activated_by: activatedBy.trim() || 'Staff Nurse',
      assigned_resuscitation_bay: assignedBay,
    };

    try {
      const created = await createEmergencyCase(payload);
      setSuccessCase(created);
      await loadEmergencyQueue();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Network error communicating with emergency backend. Click Safe Retry below to re-attempt without duplicate case creation.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForNewIntake = () => {
    setSuccessCase(null);
    setError(null);
    setValidationErrors([]);
    generateNewCaseId();
    setIdentityStatus('UNKNOWN');
    setPatientName('');
    setApproximateAge('');
    setGender('Unknown');
    setAccidentType('ROAD_TRAFFIC_ACCIDENT');
    setMechanismOfInjury('');
    setSelectedRedFlags([
      'High-Velocity Trauma / Severe Impact',
      'Massive Bleeding or Shock Symptoms',
    ]);
    setStaffNotes('');
  };

  const redFlagOptions = [
    'Airway Compromise / Stridor',
    'Severe Respiratory Distress / Hypoxia',
    'Massive Bleeding or Shock Symptoms',
    'Severe Polytrauma / High-Velocity Impact',
    'Traumatic Brain Injury / GCS ≤ 8',
    'Penetrating Torso or Neck Trauma',
    'Crush Injury / Traumatic Amputation',
    'Major Burns (> 20% TBSA or Facial)',
    'Hemodynamic Collapse (SBP < 90 mmHg)',
  ];

  return (
    <div className="emergency-intake-page-container">
      {/* 1. Page Header & Critical Escalation Banner */}
      <div className="emergency-page-header">
        <div className="emergency-header-top-row">
          <div className="emergency-header-left">
            <Link to="/" className="emergency-back-link" title="Return to OPD Dashboard">
              <ArrowLeft size={16} />
              <span>Back to OPD Dashboard</span>
            </Link>
            <div className="emergency-title-cluster">
              <span className="emergency-beacon-dot" aria-hidden="true" />
              <div className="emergency-icon-pill">
                <Ambulance size={22} />
              </div>
              <div>
                <h1 className="emergency-main-title">{t('emergency.title')}</h1>
                <p className="emergency-sub-title">
                  {t('emergency.subtitle')}
                </p>
              </div>
            </div>
          </div>

          <div className="emergency-header-right">
            <LanguageSelector variant="pill" />
            <div className="emergency-counter-pill" title="Active trauma cases undergoing acute management">
              <Activity size={16} className="emergency-counter-icon" />
              <div className="emergency-counter-text">
                <span className="emergency-counter-num">{emergencyCases.length}</span>
                <span className="emergency-counter-label">Trauma Active</span>
              </div>
            </div>
            <button
              type="button"
              onClick={loadEmergencyQueue}
              className="top-navbar-refresh-btn"
              title="Refresh live trauma queue"
              aria-label="Refresh live trauma queue"
            >
              <RefreshCw size={16} className={isLoadingQueue ? 'spin-icon' : ''} />
            </button>
          </div>
        </div>

        {/* Ethical Safety Alert Banner */}
        <div className="emergency-safety-alert-strip">
          <ShieldAlert size={16} className="flex-shrink-0" />
          <span>
            <strong>CLINICAL DECISION SUPPORT MANDATE:</strong> Immediate life-saving interventions must
            proceed unconditionally. Administrative registration, identity verification, and AI predictions are
            never prerequisites for emergency care. Qualified medical staff decisions remain supreme.
          </span>
        </div>
      </div>

      {/* 2. Success Confirmation Banner (When Case Activated) */}
      {successCase && (
        <div className="emergency-success-banner" role="status">
          <div className="emergency-success-content">
            <div className="emergency-success-icon-wrap">
              <CheckCircle2 size={32} className="text-emerald-600" />
            </div>
            <div className="emergency-success-details">
              <div className="emergency-success-badge-row">
                <span className="badge-level1-emergency">LEVEL 1 ACTIVATED</span>
                <span className="case-id-tag">{successCase.case_id}</span>
                <span className="bay-tag">{successCase.assigned_resuscitation_bay}</span>
              </div>
              <h3 className="emergency-success-title">
                Trauma Response Activated Successfully
              </h3>
              <p className="emergency-success-desc">
                Case <strong>{successCase.case_id}</strong> is now live in the trauma bay queue.
                Accident classification: <strong>{successCase.accident_type.replace(/_/g, ' ')}</strong>.
                Responsible clinician: <strong>{successCase.activated_by}</strong>.
              </p>
              {successCase.hospital_protocol_instructions && (
                <div className="protocol-instructions-list">
                  <strong>Hospital Resuscitation Directives:</strong>
                  <ul>
                    {successCase.hospital_protocol_instructions.map((inst, idx) => (
                      <li key={idx}>{inst}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
          <div className="emergency-success-actions">
            <button
              type="button"
              onClick={() => setSelectedCase(successCase)}
              className="cult-shimmer-btn cult-shimmer-size-sm cult-shimmer-teal"
            >
              Open Rapid Assessment Panel
            </button>
            <button
              type="button"
              onClick={handleResetForNewIntake}
              className="cult-shimmer-btn cult-shimmer-size-sm cult-shimmer-danger"
            >
              Intake Another Emergency Patient
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Grid: Intake Form (Left) & Live Emergency Queue (Right) */}
      <div className="emergency-page-layout-grid">
        {/* Left Column: Rapid Intake Form */}
        <section className="emergency-intake-form-column" aria-label="Emergency Intake Form">
          <form onSubmit={handleActivateEmergency} className="emergency-intake-card">
            {/* Form Section Header with Auto-Generated ID */}
            <div className="emergency-card-header">
              <div className="emergency-case-id-banner">
                <div className="case-id-info">
                  <span className="case-id-label">EMERGENCY CASE ID (AUTO-GENERATED)</span>
                  <div className="case-id-display-row">
                    <span className="case-id-value" id="generated-case-id">{caseId}</span>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="case-id-action-btn"
                      title="Copy Case ID"
                      aria-label="Copy Case ID"
                    >
                      {copiedId ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={generateNewCaseId}
                      className="case-id-action-btn"
                      title="Regenerate unique ID"
                      aria-label="Regenerate ID"
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </div>
                <div className="arrival-time-info">
                  <span className="arrival-label">RECORDED ARRIVAL TIME</span>
                  <div className="arrival-input-row">
                    <Clock size={14} className="text-red-500" />
                    <input
                      type="text"
                      value={arrivalTime}
                      onChange={(e) => setArrivalTime(e.target.value)}
                      className="arrival-time-field"
                      placeholder="e.g. 18:45"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Validation Errors Notice */}
            {validationErrors.length > 0 && (
              <div className="emergency-validation-alert" role="alert">
                <AlertTriangle size={18} className="flex-shrink-0" />
                <div>
                  <strong>Please correct the following fields:</strong>
                  <ul>
                    {validationErrors.map((vErr, i) => (
                      <li key={i}>{vErr}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Error with Safe Retry Button */}
            {error && (
              <div className="emergency-error-alert" role="alert">
                <div className="emergency-error-content">
                  <AlertOctagon size={20} className="flex-shrink-0 text-red-600" />
                  <div>
                    <strong className="block text-red-900 font-bold">Network / Backend Notice</strong>
                    <span className="text-xs text-red-800">{error}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleActivateEmergency()}
                  disabled={isSubmitting}
                  className="emergency-retry-btn"
                >
                  <RotateCcw size={14} />
                  <span>Safe Retry (Same ID: {caseId})</span>
                </button>
              </div>
            )}

            {/* SECTION 1: Patient Identity (Flexible & Fast) */}
            <div className="form-sub-section">
              <div className="form-sub-header">
                <span className="sub-num">1</span>
                <div>
                  <h3 className="sub-title">Patient Identity</h3>
                  <span className="sub-help">Permit unknown identity. Never delay acute trauma response.</span>
                </div>
              </div>

              <div className="identity-status-selector">
                {(['UNKNOWN', 'NOT_YET_VERIFIED', 'KNOWN'] as IdentityStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setIdentityStatus(st)}
                    className={`identity-pill-btn ${identityStatus === st ? 'active' : ''}`}
                  >
                    {st === 'UNKNOWN' && 'Unknown Patient'}
                    {st === 'NOT_YET_VERIFIED' && 'Not Yet Verified'}
                    {st === 'KNOWN' && 'Known Identity'}
                  </button>
                ))}
              </div>

              <div className="form-grid-3">
                {identityStatus === 'KNOWN' && (
                  <div className="form-field-group">
                    <label className="form-label" htmlFor="patient-name-field">Patient Full Name</label>
                    <input
                      id="patient-name-field"
                      type="text"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      placeholder="e.g. Rajesh Kumar"
                      className="form-input-text"
                    />
                  </div>
                )}
                <div className="form-field-group">
                  <label className="form-label" htmlFor="approx-age-field">Approx. Age (Years)</label>
                  <input
                    id="approx-age-field"
                    type="number"
                    min="0"
                    max="130"
                    value={approximateAge}
                    onChange={(e) => setApproximateAge(e.target.value)}
                    placeholder="e.g. 35 (approx)"
                    className="form-input-text"
                  />
                </div>
                <div className="form-field-group">
                  <label className="form-label" htmlFor="gender-field">Gender</label>
                  <select
                    id="gender-field"
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
              </div>
            </div>

            {/* SECTION 2: Accident Classification & Mechanism */}
            <div className="form-sub-section">
              <div className="form-sub-header">
                <span className="sub-num">2</span>
                <div>
                  <h3 className="sub-title">Accident Classification & Mechanism</h3>
                  <span className="sub-help">Classification of trauma impact and assigned bay.</span>
                </div>
              </div>

              <div className="accident-type-chips">
                {(
                  [
                    ['ROAD_TRAFFIC_ACCIDENT', 'Road Traffic Accident (RTA)'],
                    ['FALL', 'Fall from Height / Ground'],
                    ['WORKPLACE_ACCIDENT', 'Workplace / Industrial'],
                    ['BURN', 'Burn / Chemical Exposure'],
                    ['OTHER', 'Other Acute Trauma'],
                  ] as [AccidentType, string][]
                ).map(([typeKey, label]) => (
                  <button
                    key={typeKey}
                    type="button"
                    onClick={() => setAccidentType(typeKey)}
                    className={`accident-chip ${accidentType === typeKey ? 'active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="form-grid-2">
                <div className="form-field-group full-width">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
                    <label className="form-label" htmlFor="mechanism-field" style={{ margin: 0 }}>
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
                    id="mechanism-field"
                    rows={2}
                    value={mechanismOfInjury}
                    onChange={(e) => setMechanismOfInjury(e.target.value)}
                    placeholder={t('emergency.mechanism_placeholder')}
                    className="form-textarea"
                  />
                </div>
                <div className="form-field-group">
                  <label className="form-label" htmlFor="assigned-bay-field">Assigned Resuscitation Bay</label>
                  <select
                    id="assigned-bay-field"
                    value={assignedBay}
                    onChange={(e) => setAssignedBay(e.target.value)}
                    className="form-select font-bold text-red-700"
                  >
                    <option value="Red Trauma Bay 01">Red Trauma Bay 01 (Critical)</option>
                    <option value="Red Trauma Bay 02">Red Trauma Bay 02 (Critical)</option>
                    <option value="Yellow Bay 01">Yellow Bay 01 (Monitored)</option>
                    <option value="Resuscitation Bay">Resuscitation Room 01</option>
                  </select>
                </div>
                <div className="form-field-group">
                  <label className="form-label" htmlFor="activated-by-field">Initiating Clinician / Staff</label>
                  <input
                    id="activated-by-field"
                    type="text"
                    value={activatedBy}
                    onChange={(e) => setActivatedBy(e.target.value)}
                    className="form-input-text"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: Primary Survey (ABCDE Rapid Observations) */}
            <div className="form-sub-section">
              <div className="form-sub-header">
                <span className="sub-num">3</span>
                <div>
                  <h3 className="sub-title">Primary Survey (ABCDE Rapid Observations)</h3>
                  <span className="sub-help">Immediate physiological observations documented by trained staff.</span>
                </div>
              </div>

              <div className="abcde-grid">
                <div className="abcde-card">
                  <span className="abcde-letter">A</span>
                  <label className="abcde-label" htmlFor="airway-field">Airway</label>
                  <select
                    id="airway-field"
                    value={airwayStatus}
                    onChange={(e) => setAirwayStatus(e.target.value)}
                    className="abcde-select"
                  >
                    <option value="Intact">Intact / Patent</option>
                    <option value="Compromised">Compromised / Threatened</option>
                    <option value="Obstructed">Obstructed / Stridor</option>
                    <option value="Definitive Airway (ETT)">Definitive Airway (ETT)</option>
                  </select>
                </div>

                <div className="abcde-card">
                  <span className="abcde-letter">B</span>
                  <label className="abcde-label" htmlFor="breathing-field">Breathing</label>
                  <select
                    id="breathing-field"
                    value={breathingStatus}
                    onChange={(e) => setBreathingStatus(e.target.value)}
                    className="abcde-select"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Severe Distress">Severe Distress / Tachypnea</option>
                    <option value="Apnea / Gasps">Apnea / Agonal Gasps</option>
                    <option value="Pneumothorax Susp.">Tension Pneumothorax Susp.</option>
                  </select>
                </div>

                <div className="abcde-card">
                  <span className="abcde-letter">C</span>
                  <label className="abcde-label" htmlFor="circulation-field">Circulation</label>
                  <select
                    id="circulation-field"
                    value={circulationStatus}
                    onChange={(e) => setCirculationStatus(e.target.value)}
                    className="abcde-select"
                  >
                    <option value="Palpable">Palpable Radial Normal</option>
                    <option value="Weak Thread">Weak / Thready / Clammy</option>
                    <option value="Severe Shock">Hemorrhagic Shock / Hypotension</option>
                    <option value="Pulseless">Pulseless (CPR Initiated)</option>
                  </select>
                </div>

                <div className="abcde-card">
                  <span className="abcde-letter">D</span>
                  <label className="abcde-label" htmlFor="disability-field">Disability / AVPU</label>
                  <select
                    id="disability-field"
                    value={neurologicalStatus}
                    onChange={(e) => setNeurologicalStatus(e.target.value)}
                    className="abcde-select"
                  >
                    <option value="Alert (A)">Alert (A)</option>
                    <option value="Verbal (V)">Responds to Voice (V)</option>
                    <option value="Pain Only (P)">Responds to Pain (P)</option>
                    <option value="Unresponsive (U)">Unresponsive (U)</option>
                  </select>
                </div>

                <div className="abcde-card">
                  <span className="abcde-letter">E</span>
                  <label className="abcde-label" htmlFor="bleeding-field">Major Bleeding</label>
                  <select
                    id="bleeding-field"
                    value={majorBleeding}
                    onChange={(e) => setMajorBleeding(e.target.value)}
                    className="abcde-select"
                  >
                    <option value="None">None Observed</option>
                    <option value="Controlled Extremity">Controlled Extremity Bleeding</option>
                    <option value="Massive Exsanguinating">Massive Exsanguinating Bleeding</option>
                    <option value="Tourniquet Applied">Tourniquet Applied</option>
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 4: Available Vitals (Optional - No Care Delay) */}
            <div className="form-sub-section">
              <div className="form-sub-header">
                <span className="sub-num">4</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="sub-title">Observations & Vital Signs (Optional)</h3>
                    <div className="vitals-quick-actions">
                      <button
                        type="button"
                        onClick={handleSetNormalVitals}
                        className="vitals-quick-btn"
                      >
                        Sample Normal
                      </button>
                      <button
                        type="button"
                        onClick={handleClearVitals}
                        className="vitals-quick-btn"
                      >
                        Clear Vitals
                      </button>
                    </div>
                  </div>
                  <span className="sub-help">Record available physiological markers. None required to activate Level 1.</span>
                </div>
              </div>

              <div className="vitals-inputs-grid">
                <div className="vital-input-card">
                  <span className="vital-label">Pulse (bpm)</span>
                  <input
                    type="number"
                    min="0"
                    max="300"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    placeholder="e.g. 126"
                    className="vital-field"
                  />
                </div>
                <div className="vital-input-card">
                  <span className="vital-label">BP Sys / Dia</span>
                  <div className="bp-pair">
                    <input
                      type="number"
                      min="30"
                      max="300"
                      value={systolicBp}
                      onChange={(e) => setSystolicBp(e.target.value)}
                      placeholder="84"
                      className="vital-field bp"
                    />
                    <span>/</span>
                    <input
                      type="number"
                      min="10"
                      max="200"
                      value={diastolicBp}
                      onChange={(e) => setDiastolicBp(e.target.value)}
                      placeholder="52"
                      className="vital-field bp"
                    />
                  </div>
                </div>
                <div className="vital-input-card">
                  <span className="vital-label">Resp. Rate (/min)</span>
                  <input
                    type="number"
                    min="0"
                    max="80"
                    value={respiratoryRate}
                    onChange={(e) => setRespiratoryRate(e.target.value)}
                    placeholder="e.g. 30"
                    className="vital-field"
                  />
                </div>
                <div className="vital-input-card">
                  <span className="vital-label">SpO2 (%)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="20"
                    max="100"
                    value={spo2}
                    onChange={(e) => setSpo2(e.target.value)}
                    placeholder="e.g. 88"
                    className="vital-field"
                  />
                </div>
                <div className="vital-input-card">
                  <span className="vital-label">Temp (°F)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="80"
                    max="115"
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    placeholder="e.g. 97.2"
                    className="vital-field"
                  />
                </div>
                <div className="vital-input-card">
                  <span className="vital-label">GCS Score (3-15)</span>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    value={gcsScore}
                    onChange={(e) => setGcsScore(e.target.value)}
                    placeholder="e.g. 8"
                    className="vital-field"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 5: Observed Red Flags */}
            <div className="form-sub-section">
              <div className="form-sub-header">
                <span className="sub-num">5</span>
                <div>
                  <h3 className="sub-title">Observed Red Flags</h3>
                  <span className="sub-help">Documented by trained staff to justify rapid escalation.</span>
                </div>
              </div>

              <div className="red-flags-select-grid">
                {redFlagOptions.map((flag) => {
                  const isChecked = selectedRedFlags.includes(flag);
                  return (
                    <button
                      key={flag}
                      type="button"
                      onClick={() => handleToggleRedFlag(flag)}
                      className={`red-flag-checkbox-chip ${isChecked ? 'active' : ''}`}
                    >
                      <span className="flag-check-box">{isChecked ? '✓' : ''}</span>
                      <span className="flag-text">{flag}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 6: Immediate Actions Taken & Staff Notes */}
            <div className="form-sub-section">
              <div className="form-sub-header">
                <span className="sub-num">6</span>
                <div>
                  <h3 className="sub-title">Immediate Actions Taken & Staff Notes</h3>
                  <span className="sub-help">Document immediate resuscitation steps and handover remarks.</span>
                </div>
              </div>

              <div className="form-grid-1">
                <div className="form-field-group">
                  <label className="form-label" htmlFor="immediate-actions-field">
                    Immediate Clinical Actions Taken
                  </label>
                  <input
                    id="immediate-actions-field"
                    type="text"
                    value={immediateActions}
                    onChange={(e) => setImmediateActions(e.target.value)}
                    placeholder="e.g. Cervical collar, 15L O2 via NRB, 2 large-bore 16G IV cannulas, pressure dressing..."
                    className="form-input-text"
                  />
                </div>
                <div className="form-field-group">
                  <label className="form-label" htmlFor="staff-notes-field">
                    Optional Clinical Handover Notes
                  </label>
                  <textarea
                    id="staff-notes-field"
                    rows={2}
                    value={staffNotes}
                    onChange={(e) => setStaffNotes(e.target.value)}
                    placeholder="Additional context from ambulance paramedic or police escort..."
                    className="form-textarea"
                  />
                </div>
              </div>
            </div>

            {/* FORM FOOTER & PROMINENT EMERGENCY ACTIVATION BUTTON */}
            <div className="emergency-form-submit-footer">
              <div className="submit-disclaimer">
                <ShieldAlert size={14} className="text-red-600" />
                <span>
                  Immediate hospital Level 1 trauma alert will be broadcast. Bedside priority escalation enabled.
                </span>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="activate-emergency-response-btn"
                id="btn-activate-emergency-response"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={20} className="spin-icon" />
                    <span>Activating Level 1 Trauma Protocol...</span>
                  </>
                ) : (
                  <>
                    <span className="emergency-beacon-dot" aria-hidden="true" />
                    <Ambulance size={22} />
                    <span>Activate Emergency Response</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Right Column: Live Dedicated Emergency Cases Queue & Quick Bedside Panel */}
        <aside className="emergency-queue-column" aria-label="Live Trauma Bay Operations">
          <div className="emergency-operations-card">
            <div className="emergency-ops-header">
              <div className="ops-header-title">
                <Building2 size={18} className="text-red-600" />
                <h3>Active Trauma Resuscitation Bays</h3>
              </div>
              <span className="ops-live-tag">
                <span className="status-ping" />
                <span>LIVE QUEUE</span>
              </span>
            </div>
            <p className="ops-header-desc">
              Dedicated trauma queue isolated from routine OPD waiting. Real-time arrival and bay monitoring.
            </p>

            <EmergencyQueuePanel
              cases={emergencyCases}
              isLoading={isLoadingQueue}
              onSelectCase={(c) => setSelectedCase(c)}
              onRefresh={loadEmergencyQueue}
              onIntakeClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        </aside>
      </div>

      {/* 4. Modal: Emergency Case Detail & Rapid Assessment */}
      {selectedCase && (
        <EmergencyCaseDetailModal
          caseItem={selectedCase}
          isOpen={!!selectedCase}
          onClose={() => setSelectedCase(null)}
          onCaseUpdated={(updated) => {
            setSelectedCase(updated);
            loadEmergencyQueue();
          }}
        />
      )}
    </div>
  );
};
