import React, { useState, useEffect, useCallback } from 'react';
import type {
  SavedPatientQueueItem,
  DeteriorationWatchData,
  ObservationCreatePayload,
  WarningAcknowledgePayload,
  ClinicianTriagePayload,
} from '../../types/triage';
import {
  fetchDeteriorationWatch,
  recordObservation,
  acknowledgeWarning,
  recordClinicianTriage,
} from '../../services/api';
import {
  X,
  Activity,
  AlertTriangle,
  ShieldAlert,
  Clock,
  PlusCircle,
  CheckCircle,
  UserCheck,
  Info,
} from 'lucide-react';

interface DeteriorationWatchModalProps {
  patient: SavedPatientQueueItem | null;
  onClose: () => void;
  onPatientUpdated?: () => void;
}

export const DeteriorationWatchModal: React.FC<DeteriorationWatchModalProps> = ({
  patient,
  onClose,
  onPatientUpdated,
}) => {
  const [data, setData] = useState<DeteriorationWatchData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRulesConfigured, setIsRulesConfigured] = useState<boolean>(true);

  // Record Observation Form state
  const [showAddObs, setShowAddObs] = useState<boolean>(false);
  const [obsType, setObsType] = useState<string>('SPO2');
  const [obsValue, setObsValue] = useState<string>('');
  const [obsSecValue, setObsSecValue] = useState<string>('');
  const [obsStaff, setObsStaff] = useState<string>('Staff Nurse Sunita');
  const [obsNotes, setObsNotes] = useState<string>('');
  const [isSavingObs, setIsSavingObs] = useState<boolean>(false);

  // Warning Acknowledge state
  const [selectedWarningId, setSelectedWarningId] = useState<string | null>(null);
  const [ackStatus, setAckStatus] = useState<string>('ACKNOWLEDGED');
  const [ackStaff, setAckStaff] = useState<string>('Dr. Rajesh Verma (Duty CMO)');
  const [ackNotes, setAckNotes] = useState<string>('');
  const [isSavingAck, setIsSavingAck] = useState<boolean>(false);

  // Clinician Triage Override state
  const [clinicianLevel, setClinicianLevel] = useState<number>(2);
  const [clinicianName, setClinicianName] = useState<string>('Dr. Rajesh Verma (Duty CMO)');
  const [clinicianNotes, setClinicianNotes] = useState<string>('');
  const [isSavingClinician, setIsSavingClinician] = useState<boolean>(false);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'observations' | 'warnings' | 'clinician' | 'audit'>('observations');

  const loadData = useCallback(async () => {
    if (!patient) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchDeteriorationWatch(patient.patient_id, isRulesConfigured);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load deterioration watch data.');
    } finally {
      setIsLoading(false);
    }
  }, [patient, isRulesConfigured]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!patient) return null;

  // Handle adding a new observation
  const handleSaveObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    const valNum = parseFloat(obsValue);
    if (isNaN(valNum)) {
      setError('Please enter a valid numerical value for observation.');
      return;
    }

    let unit = '%';
    if (obsType === 'PULSE') unit = 'bpm';
    else if (obsType === 'SYSTOLIC_BP' || obsType === 'DIASTOLIC_BP') unit = 'mmHg';
    else if (obsType === 'RESPIRATORY_RATE') unit = '/min';
    else if (obsType === 'TEMPERATURE') unit = '°F';

    const payload: ObservationCreatePayload = {
      observation_type: obsType,
      value: valNum,
      secondary_value: obsSecValue ? parseFloat(obsSecValue) : undefined,
      unit,
      recorded_by: obsStaff.trim() || 'Staff Nurse',
      notes: obsNotes.trim() || undefined,
    };

    try {
      setIsSavingObs(true);
      setError(null);
      await recordObservation(patient.patient_id, payload, isRulesConfigured);
      setObsValue('');
      setObsSecValue('');
      setObsNotes('');
      setShowAddObs(false);
      await loadData();
      if (onPatientUpdated) onPatientUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record observation.');
    } finally {
      setIsSavingObs(false);
    }
  };

  // Handle acknowledging a warning
  const handleConfirmAck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWarningId) return;

    const payload: WarningAcknowledgePayload = {
      acknowledged_by: ackStaff.trim() || 'Clinician',
      notes: ackNotes.trim() || undefined,
      status: ackStatus,
    };

    try {
      setIsSavingAck(true);
      setError(null);
      await acknowledgeWarning(patient.patient_id, selectedWarningId, payload);
      setSelectedWarningId(null);
      setAckNotes('');
      await loadData();
      if (onPatientUpdated) onPatientUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge warning.');
    } finally {
      setIsSavingAck(false);
    }
  };

  // Handle clinician-assigned triage
  const handleSaveClinicianTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicianNotes.trim()) {
      setError('Clinical rationale / override notes are required for clinician triage assignment.');
      return;
    }

    const levelNames: Record<number, string> = {
      1: 'Level 1 - Resuscitation',
      2: 'Level 2 - Emergent',
      3: 'Level 3 - Urgent',
      4: 'Level 4 - Less Urgent',
      5: 'Level 5 - Non-Urgent',
    };

    const payload: ClinicianTriagePayload = {
      clinician_name: clinicianName.trim() || 'Attending Physician',
      triage_level: clinicianLevel,
      triage_name: levelNames[clinicianLevel] || `Level ${clinicianLevel}`,
      notes: clinicianNotes.trim(),
    };

    try {
      setIsSavingClinician(true);
      setError(null);
      await recordClinicianTriage(patient.patient_id, payload);
      await loadData();
      if (onPatientUpdated) onPatientUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record clinician triage.');
    } finally {
      setIsSavingClinician(false);
    }
  };

  const activeWarningsCount = data?.active_warnings?.filter(
    (w) => w.status === 'PENDING_REVIEW' || w.status === 'REASSESSMENT_IN_PROGRESS'
  ).length || 0;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 840, width: '95%' }}>
        {/* Header */}
        <div
          className="modal-header"
          style={{
            background: data?.deterioration_flag ? '#7f1d1d' : '#0f172a',
            color: '#fff',
            borderBottom: '2px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="modal-title-section">
            <div className="modal-token-row">
              <span className="modal-token-badge">{patient.token_number}</span>
              <span className="modal-uhid-badge">{patient.patient_id}</span>
              {data?.deterioration_flag ? (
                <span className="badge-status-chip" style={{ background: '#ef4444', color: '#fff' }}>
                  🚨 REASSESSMENT REQUIRED
                </span>
              ) : (
                <span className="badge-status-chip" style={{ background: '#10b981', color: '#fff' }}>
                  STABLE VITAL MONITORING
                </span>
              )}
            </div>
            <h2 className="modal-patient-name" style={{ color: '#fff' }}>
              Clinician Deterioration Watch: {patient.patient_name || patient.patient_id}
            </h2>
            <div className="modal-patient-sub" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {patient.age} yrs • {patient.gender} • Chief Complaint: {patient.chief_complaint}
            </div>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="modal-body-scrollable" style={{ padding: '20px 24px' }}>
          {/* Critical Clinical Safety Directive Banner */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              marginBottom: 16,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: 2, color: '#dc2626' }} />
            <div>
              <strong>CRITICAL CLINICAL DIRECTIVE:</strong> Deterioration Watch tracks longitudinal vitals against configured clinical prototype thresholds.
              <span style={{ display: 'block', marginTop: 4 }}>
                <strong>Never delay emergency resuscitation, airway support, or doctor intervention</strong> while awaiting new vital entries or algorithmic re-evaluation.
              </span>
            </div>
          </div>

          {/* Configuration status pill bar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '10px 14px',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
              <Activity size={16} color="#0284c7" />
              <span>
                <strong>Warning Rule Engine:</strong>{' '}
                {isRulesConfigured ? (
                  <span style={{ color: '#047857' }}>Configured ({data?.rule_set_version || 'NEWS2/ESI Prototype'})</span>
                ) : (
                  <span style={{ color: '#b45309' }}>NOT CONFIGURED (Manual bedside review only)</span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsRulesConfigured(!isRulesConfigured)}
              style={{
                fontSize: '0.75rem',
                padding: '4px 10px',
                borderRadius: 4,
                border: '1px solid #cbd5e1',
                background: '#fff',
                cursor: 'pointer',
              }}
              title="Toggle to test unconfigured rule set behavior"
            >
              Simulate: {isRulesConfigured ? 'Set Rules Unconfigured' : 'Enable Prototype Rules'}
            </button>
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              borderBottom: '2px solid #e2e8f0',
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('observations')}
              style={{
                padding: '8px 14px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === 'observations' ? '2px solid #0284c7' : '2px solid transparent',
                color: activeTab === 'observations' ? '#0284c7' : '#64748b',
                fontWeight: activeTab === 'observations' ? 600 : 400,
                cursor: 'pointer',
                marginBottom: -2,
              }}
            >
              Recorded Observations ({data?.observations?.filter((o) => !o.is_missing).length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('warnings')}
              style={{
                padding: '8px 14px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === 'warnings' ? '2px solid #ef4444' : '2px solid transparent',
                color: activeTab === 'warnings' ? '#dc2626' : '#64748b',
                fontWeight: activeTab === 'warnings' ? 600 : 400,
                cursor: 'pointer',
                marginBottom: -2,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>Deterioration Warnings</span>
              {activeWarningsCount > 0 && (
                <span
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '1px 6px',
                    fontSize: '0.75rem',
                  }}
                >
                  {activeWarningsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('clinician')}
              style={{
                padding: '8px 14px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === 'clinician' ? '2px solid #0f766e' : '2px solid transparent',
                color: activeTab === 'clinician' ? '#0f766e' : '#64748b',
                fontWeight: activeTab === 'clinician' ? 600 : 400,
                cursor: 'pointer',
                marginBottom: -2,
              }}
            >
              Clinician Triage Assignment
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              style={{
                padding: '8px 14px',
                border: 'none',
                background: 'none',
                borderBottom: activeTab === 'audit' ? '2px solid #475569' : '2px solid transparent',
                color: activeTab === 'audit' ? '#475569' : '#64748b',
                fontWeight: activeTab === 'audit' ? 600 : 400,
                cursor: 'pointer',
                marginBottom: -2,
              }}
            >
              Audit Trail ({data?.audit_trail?.length || 0})
            </button>
          </div>

          {error && (
            <div
              style={{
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #f87171',
                padding: '10px 14px',
                borderRadius: 6,
                marginBottom: 16,
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748b' }}>
              <Clock size={28} className="spin-icon" style={{ marginBottom: 10 }} />
              <div>Loading physiological surveillance data...</div>
            </div>
          ) : (
            <>
              {/* TAB 1: RECORDED OBSERVATIONS */}
              {activeTab === 'observations' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                        Physiological Measurements & Vital Trends
                      </h3>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                        Displays only measurements actually recorded. Unrecorded or outdated vitals (&gt;120m) are explicitly flagged.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddObs(!showAddObs)}
                      className="btn-primary"
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <PlusCircle size={15} />
                      {showAddObs ? 'Cancel Recording' : 'Record New Observation'}
                    </button>
                  </div>

                  {/* Add New Observation Collapsible Form */}
                  {showAddObs && (
                    <form
                      onSubmit={handleSaveObservation}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: 8,
                        padding: 16,
                        marginBottom: 16,
                      }}
                    >
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#0f172a' }}>
                        Document Timestamped Observation
                      </h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Parameter Type
                          </label>
                          <select
                            value={obsType}
                            onChange={(e) => setObsType(e.target.value)}
                            className="filter-select-element"
                            style={{ width: '100%' }}
                          >
                            <option value="SPO2">SpO2 (Pulse Oximetry, %)</option>
                            <option value="PULSE">Pulse / Heart Rate (bpm)</option>
                            <option value="SYSTOLIC_BP">Systolic BP (mmHg)</option>
                            <option value="RESPIRATORY_RATE">Respiratory Rate (/min)</option>
                            <option value="TEMPERATURE">Temperature (°F)</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Measured Value
                          </label>
                          <input
                            type="number"
                            step="any"
                            required
                            placeholder="e.g. 91 or 120"
                            value={obsValue}
                            onChange={(e) => setObsValue(e.target.value)}
                            className="filter-search-input"
                            style={{ width: '100%' }}
                          />
                        </div>
                        {obsType === 'SYSTOLIC_BP' && (
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                              Diastolic BP (Optional)
                            </label>
                            <input
                              type="number"
                              placeholder="e.g. 70"
                              value={obsSecValue}
                              onChange={(e) => setObsSecValue(e.target.value)}
                              className="filter-search-input"
                              style={{ width: '100%' }}
                            />
                          </div>
                        )}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Recorded By (Staff ID)
                          </label>
                          <input
                            type="text"
                            required
                            value={obsStaff}
                            onChange={(e) => setObsStaff(e.target.value)}
                            className="filter-search-input"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          Contextual Clinical Notes (e.g. room air, posture)
                        </label>
                        <input
                          type="text"
                          placeholder="Optional notes..."
                          value={obsNotes}
                          onChange={(e) => setObsNotes(e.target.value)}
                          className="filter-search-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => setShowAddObs(false)}
                          className="btn-secondary"
                          style={{ padding: '6px 14px' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingObs}
                          className="btn-primary"
                          style={{ padding: '6px 16px' }}
                        >
                          {isSavingObs ? 'Saving...' : 'Save Observation'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Observations Table */}
                  <div className="table-responsive-container">
                    <table className="patient-queue-table" aria-label="Recorded Observations">
                      <thead>
                        <tr>
                          <th>Observation Type</th>
                          <th>Current Value</th>
                          <th>Previous Reading</th>
                          <th>Trend (Delta)</th>
                          <th>Recorded Time</th>
                          <th>Status / Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data?.observations?.map((obs) => {
                          const isMissing = obs.is_missing;
                          const isOutdated = obs.is_outdated;
                          const delta = obs.delta;

                          let valDisplay = '—';
                          if (!isMissing && obs.current_value !== null && obs.current_value !== undefined) {
                            if (obs.observation_type === 'SYSTOLIC_BP' && obs.current_secondary_value) {
                              valDisplay = `${obs.current_value}/${obs.current_secondary_value} ${obs.unit}`;
                            } else {
                              valDisplay = `${obs.current_value} ${obs.unit}`;
                            }
                          }

                          let prevDisplay = 'None recorded';
                          if (obs.previous_value !== null && obs.previous_value !== undefined) {
                            prevDisplay = `${obs.previous_value} ${obs.unit}`;
                          }

                          let deltaDisplay = '—';
                          if (delta !== null && delta !== undefined) {
                            const isDrop = delta < 0;
                            deltaDisplay = `${delta > 0 ? '+' : ''}${delta} ${obs.unit}`;
                            if (isDrop && (obs.observation_type === 'SPO2' || obs.observation_type === 'SYSTOLIC_BP')) {
                              deltaDisplay = `🔻 ${deltaDisplay} (Decline)`;
                            }
                          }

                          return (
                            <tr key={obs.observation_type}>
                              <td>
                                <strong>{obs.display_name}</strong>
                              </td>
                              <td>
                                {isMissing ? (
                                  <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Unrecorded</span>
                                ) : (
                                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{valDisplay}</span>
                                )}
                              </td>
                              <td style={{ color: '#64748b' }}>{prevDisplay}</td>
                              <td>
                                {delta !== null && delta !== undefined ? (
                                  <span
                                    style={{
                                      fontWeight: 600,
                                      color: delta < 0 ? '#dc2626' : '#16a34a',
                                    }}
                                  >
                                    {deltaDisplay}
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8' }}>—</span>
                                )}
                              </td>
                              <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                {obs.measured_at ? new Date(obs.measured_at).toLocaleTimeString() : '—'}
                                {obs.recorded_by && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>by {obs.recorded_by}</div>}
                              </td>
                              <td>
                                {isMissing ? (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      background: '#fef3c7',
                                      color: '#92400e',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Missing Observation
                                  </span>
                                ) : isOutdated ? (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      background: '#fee2e2',
                                      color: '#991b1b',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Outdated (&gt;120m)
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      padding: '2px 8px',
                                      borderRadius: 4,
                                      background: '#dcfce7',
                                      color: '#166534',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Current Reading
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: DETERIORATION WARNINGS & REASSESSMENT WORKFLOW */}
              {activeTab === 'warnings' && (
                <div>
                  <div style={{ marginBottom: 14 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                      Active & Historical Clinical Warnings
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                      Warnings generated only when physiologically triggered by approved prototype rules. Staff must acknowledge and document bedside reassessment status.
                    </div>
                  </div>

                  {!isRulesConfigured ? (
                    <div
                      style={{
                        padding: 24,
                        textAlign: 'center',
                        background: '#fefce8',
                        border: '1px dashed #ca8a04',
                        borderRadius: 8,
                        color: '#854d0e',
                      }}
                    >
                      <AlertTriangle size={32} style={{ margin: '0 auto 8px auto' }} />
                      <h4 style={{ margin: '0 0 6px 0' }}>Automated Warning Evaluation Not Configured</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>
                        No approved prototype clinical rule-set is currently activated for this health center. The system will not invent severity scores or automatic alarms. Clinicians must conduct direct bedside clinical examination.
                      </p>
                    </div>
                  ) : data?.active_warnings?.length === 0 ? (
                    <div
                      style={{
                        padding: 30,
                        textAlign: 'center',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        color: '#64748b',
                      }}
                    >
                      <CheckCircle size={32} color="#16a34a" style={{ margin: '0 auto 8px auto' }} />
                      <h4 style={{ margin: '0 0 4px 0', color: '#16a34a' }}>No Physiological Warnings Triggered</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>
                        Current vital observations remain within configured baseline parameters.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {data?.active_warnings?.map((warn) => {
                        const isCritical = warn.severity === 'CRITICAL';
                        const isPending = warn.status === 'PENDING_REVIEW';
                        return (
                          <div
                            key={warn.id}
                            style={{
                              border: isCritical ? '1px solid #f87171' : '1px solid #fdba74',
                              borderLeft: isCritical ? '6px solid #dc2626' : '6px solid #f97316',
                              background: isCritical ? '#fff5f5' : '#fffaf0',
                              borderRadius: 8,
                              padding: 14,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                              <div>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 4,
                                    background: isCritical ? '#dc2626' : '#ea580c',
                                    color: '#fff',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    marginRight: 8,
                                  }}
                                >
                                  {warn.severity}
                                </span>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>
                                  [{warn.warning_id}]
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: isPending ? '#fee2e2' : '#e0f2fe',
                                  color: isPending ? '#b91c1c' : '#0369a1',
                                }}
                              >
                                Status: {warn.status.replace(/_/g, ' ')}
                              </span>
                            </div>

                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>
                              {warn.trigger_reason}
                            </div>
                            {warn.supporting_observation && (
                              <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: 6 }}>
                                <strong>Evidence:</strong> {warn.supporting_observation}
                              </div>
                            )}

                            {warn.acknowledged_by && (
                              <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: 6 }}>
                                <strong>Acknowledged By:</strong> {warn.acknowledged_by} at{' '}
                                {warn.acknowledged_at ? new Date(warn.acknowledged_at).toLocaleTimeString() : 'N/A'}.
                                {warn.acknowledgment_notes && <span> Notes: {warn.acknowledgment_notes}</span>}
                              </div>
                            )}

                            {isPending && (
                              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedWarningId(String(warn.id))}
                                  style={{
                                    padding: '5px 12px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    background: '#dc2626',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Acknowledge & Reassess
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Warning Acknowledge Modal Dialog */}
                  {selectedWarningId && (
                    <div
                      style={{
                        marginTop: 16,
                        padding: 16,
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: 8,
                      }}
                    >
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#0f172a' }}>
                        Advance Warning Status & Bedside Reassessment
                      </h4>
                      <form onSubmit={handleConfirmAck}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                              Reassessment Action Status
                            </label>
                            <select
                              value={ackStatus}
                              onChange={(e) => setAckStatus(e.target.value)}
                              className="filter-select-element"
                              style={{ width: '100%' }}
                            >
                              <option value="ACKNOWLEDGED">Acknowledged (Nursing Bedside Assessment)</option>
                              <option value="REASSESSMENT_IN_PROGRESS">Reassessment In Progress</option>
                              <option value="REASSESSED_ESCALATED">Reassessed: Escalated Triage Tier</option>
                              <option value="REASSESSED_MAINTAINED">Reassessed: Maintained Existing Tier</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                              Clinician / Nurse Identifier
                            </label>
                            <input
                              type="text"
                              required
                              value={ackStaff}
                              onChange={(e) => setAckStaff(e.target.value)}
                              className="filter-search-input"
                              style={{ width: '100%' }}
                            />
                          </div>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Clinical Findings & Interventions (Mandatory Audit Trail)
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Document interventions, oxygen started, doctor summoned..."
                            value={ackNotes}
                            onChange={(e) => setAckNotes(e.target.value)}
                            className="filter-search-input"
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => setSelectedWarningId(null)}
                            className="btn-secondary"
                            style={{ padding: '6px 12px' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSavingAck}
                            className="btn-primary"
                            style={{ padding: '6px 16px' }}
                          >
                            {isSavingAck ? 'Updating...' : 'Commit Status Update'}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CLINICIAN TRIAGE ASSIGNMENT */}
              {activeTab === 'clinician' && (
                <div>
                  <div style={{ marginBottom: 14 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                      Clinician-Assigned Triage Tier
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                      Strictly segregated from automated model suggestions. Records direct clinical decisions with physician audit trail.
                    </div>
                  </div>

                  {data?.clinician_assigned_triage?.clinician_triage_level ? (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '1rem',
                            color: '#065f46',
                          }}
                        >
                          Level {data.clinician_assigned_triage.clinician_triage_level}: {data.clinician_assigned_triage.clinician_triage_name}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#047857' }}>
                          Assigned: {data.clinician_assigned_triage.clinician_reviewed_at ? new Date(data.clinician_assigned_triage.clinician_reviewed_at).toLocaleTimeString() : 'N/A'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#064e3b', marginBottom: 4 }}>
                        <strong>Attending Clinician:</strong> {data.clinician_assigned_triage.clinician_reviewed_by}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#064e3b' }}>
                        <strong>Clinical Rationale:</strong> {data.clinician_assigned_triage.clinician_triage_notes}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: 20,
                        textAlign: 'center',
                        background: '#f8fafc',
                        border: '1px dashed #cbd5e1',
                        borderRadius: 8,
                        color: '#64748b',
                        marginBottom: 16,
                      }}
                    >
                      <UserCheck size={28} style={{ margin: '0 auto 6px auto' }} />
                      <div style={{ fontWeight: 600 }}>No Clinician-Assigned Triage Recorded Yet</div>
                      <div style={{ fontSize: '0.8rem', marginTop: 4 }}>
                        Patient is currently categorized under initial automated intake. Attending doctors can document formal triage override below.
                      </div>
                    </div>
                  )}

                  {/* Form to Assign or Override Clinician Triage */}
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: '#0f172a' }}>
                      {data?.clinician_assigned_triage?.clinician_triage_level ? 'Revise Clinician Triage' : 'Record Clinician Triage'}
                    </h4>
                    <form onSubmit={handleSaveClinicianTriage}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Assigned Urgency Level
                          </label>
                          <select
                            value={clinicianLevel}
                            onChange={(e) => setClinicianLevel(parseInt(e.target.value, 10))}
                            className="filter-select-element"
                            style={{ width: '100%' }}
                          >
                            <option value={1}>Level 1 - Resuscitation (Immediate Life Threat)</option>
                            <option value={2}>Level 2 - Emergent (High Risk / Confusion / Severe Pain)</option>
                            <option value={3}>Level 3 - Urgent (Multiple Resources Needed)</option>
                            <option value={4}>Level 4 - Less Urgent (Single Resource Needed)</option>
                            <option value={5}>Level 5 - Non-Urgent (Routine OPD Care)</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                            Responsible Clinician
                          </label>
                          <input
                            type="text"
                            required
                            value={clinicianName}
                            onChange={(e) => setClinicianName(e.target.value)}
                            className="filter-search-input"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          Clinical Decision Rationale (Required)
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="State clinical reasoning for selected triage tier..."
                          value={clinicianNotes}
                          onChange={(e) => setClinicianNotes(e.target.value)}
                          className="filter-search-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="submit"
                          disabled={isSavingClinician}
                          className="btn-primary"
                          style={{ padding: '6px 16px' }}
                        >
                          {isSavingClinician ? 'Recording...' : 'Commit Clinician Triage'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* TAB 4: AUDIT TRAIL */}
              {activeTab === 'audit' && (
                <div>
                  <div style={{ marginBottom: 14 }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                      Patient Surveillance Audit Log
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                      Immutable historical audit trail documenting all intake events, observations, warning triggers, and clinician reviews.
                    </div>
                  </div>

                  {data?.audit_trail?.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                      No audit events recorded yet for this patient.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {data?.audit_trail?.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            padding: '10px 14px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: 6,
                            fontSize: '0.85rem',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>
                              {item.action_type.replace(/_/g, ' ')}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {new Date(item.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <div style={{ color: '#475569', fontSize: '0.8rem' }}>
                            <strong>Actor:</strong> {item.performed_by} • <strong>Status:</strong> {item.new_status}
                          </div>
                          {item.notes && (
                            <div style={{ color: '#334155', fontSize: '0.8rem', marginTop: 4, fontStyle: 'italic' }}>
                              "{item.notes}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Legal / Medical Prototype Notice */}
          <div className="prototype-disclaimer" style={{ marginTop: 20 }}>
            <Info size={14} className="disclaimer-icon" />
            <span>{data?.disclaimer || 'Physiological Surveillance: prototype decision support only.'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
