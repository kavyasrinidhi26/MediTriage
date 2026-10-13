import React, { useState, useEffect } from 'react';
import {
  X,
  Ambulance,
  AlertOctagon,
  Clock,
  HeartPulse,
  Activity,
  ShieldAlert,
  History,
  CheckCircle2,
  AlertTriangle,
  Stethoscope,
  Send,
  Building2,
} from 'lucide-react';
import type {
  EmergencyCaseItem,
  EmergencyCaseStatus,
  EmergencyAuditItem,
} from '../../types/triage';
import {
  updateEmergencyCaseStatus,
  reassessEmergencyCase,
  fetchEmergencyCaseAudit,
} from '../../services/api';

interface EmergencyCaseDetailModalProps {
  caseItem: EmergencyCaseItem | null;
  isOpen: boolean;
  onClose: () => void;
  onCaseUpdated?: (updated: EmergencyCaseItem) => void;
}

export const EmergencyCaseDetailModal: React.FC<EmergencyCaseDetailModalProps> = ({
  caseItem,
  isOpen,
  onClose,
  onCaseUpdated,
}) => {
  const [currentCase, setCurrentCase] = useState<EmergencyCaseItem | null>(caseItem);
  const [activeTab, setActiveTab] = useState<'assessment' | 'audit' | 'reassess'>('assessment');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [targetStatus, setTargetStatus] = useState<EmergencyCaseStatus>('INITIAL_ASSESSMENT');
  const [statusStaff, setStatusStaff] = useState<string>('Trauma Nursing Supervisor');
  const [statusNotes, setStatusNotes] = useState<string>('');
  const [statusError, setStatusError] = useState<string | null>(null);

  // Reassessment form state
  const [reassessAirway, setReassessAirway] = useState<string>('');
  const [reassessBreathing, setReassessBreathing] = useState<string>('');
  const [reassessCirculation, setReassessCirculation] = useState<string>('');
  const [reassessNeurology, setReassessNeurology] = useState<string>('');
  const [reassessPulse, setReassessPulse] = useState<string>('');
  const [reassessBpSys, setReassessBpSys] = useState<string>('');
  const [reassessBpDia, setReassessBpDia] = useState<string>('');
  const [reassessSpo2, setReassessSpo2] = useState<string>('');
  const [reassessGcs, setReassessGcs] = useState<string>('');
  const [reassessStaff, setReassessStaff] = useState<string>('Casualty Medical Officer');
  const [reassessNotes, setReassessNotes] = useState<string>('');
  const [isReassessing, setIsReassessing] = useState<boolean>(false);

  // Audit logs state
  const [auditLogs, setAuditLogs] = useState<EmergencyAuditItem[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);

  useEffect(() => {
    setCurrentCase(caseItem);
    if (caseItem) {
      setTargetStatus((caseItem.status as EmergencyCaseStatus) || 'INITIAL_ASSESSMENT');
      setReassessAirway(caseItem.airway_status || 'Intact');
      setReassessBreathing(caseItem.breathing_status || 'Normal');
      setReassessCirculation(caseItem.circulation_status || 'Palpable');
      setReassessNeurology(caseItem.neurological_status || 'Alert');
      setReassessPulse(caseItem.pulse_bpm != null ? String(caseItem.pulse_bpm) : '');
      setReassessBpSys(caseItem.systolic_bp != null ? String(caseItem.systolic_bp) : '');
      setReassessBpDia(caseItem.diastolic_bp != null ? String(caseItem.diastolic_bp) : '');
      setReassessSpo2(caseItem.spo2 != null ? String(caseItem.spo2) : '');
      setReassessGcs(caseItem.gcs_score != null ? String(caseItem.gcs_score) : '');
    }
  }, [caseItem]);

  const loadAudit = React.useCallback(async () => {
    if (!currentCase) return;
    setIsLoadingAudit(true);
    try {
      const logs = await fetchEmergencyCaseAudit(currentCase.case_id);
      setAuditLogs(logs);
    } catch {
      // Ignored
    } finally {
      setIsLoadingAudit(false);
    }
  }, [currentCase]);

  useEffect(() => {
    if (isOpen && currentCase && activeTab === 'audit') {
      loadAudit();
    }
  }, [isOpen, activeTab, currentCase, loadAudit]);

  if (!isOpen || !currentCase) return null;

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingStatus(true);
    setStatusError(null);
    try {
      const updated = await updateEmergencyCaseStatus(currentCase.case_id, {
        status: targetStatus,
        updated_by: statusStaff.trim() || 'Emergency Clinician',
        notes: statusNotes.trim() || undefined,
      });
      setCurrentCase(updated);
      onCaseUpdated?.(updated);
      setStatusNotes('');
      // Switch back to assessment tab
      setActiveTab('assessment');
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update case lifecycle status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleReassess = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsReassessing(true);
    try {
      const updated = await reassessEmergencyCase(currentCase.case_id, {
        reassessed_by: reassessStaff.trim() || 'Casualty Medical Officer',
        airway_status: reassessAirway || undefined,
        breathing_status: reassessBreathing || undefined,
        circulation_status: reassessCirculation || undefined,
        neurological_status: reassessNeurology || undefined,
        pulse_bpm: reassessPulse ? parseInt(reassessPulse, 10) : undefined,
        systolic_bp: reassessBpSys ? parseInt(reassessBpSys, 10) : undefined,
        diastolic_bp: reassessBpDia ? parseInt(reassessBpDia, 10) : undefined,
        spo2: reassessSpo2 ? parseFloat(reassessSpo2) : undefined,
        gcs_score: reassessGcs ? parseInt(reassessGcs, 10) : undefined,
        reassessment_status: 'PRIMARY_SURVEY_COMPLETED',
        notes: reassessNotes.trim() || undefined,
      });
      setCurrentCase(updated);
      onCaseUpdated?.(updated);
      setActiveTab('assessment');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Reassessment failed');
    } finally {
      setIsReassessing(false);
    }
  };

  const formatElapsedMinutes = (mins: number) => {
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m ago`;
  };

  return (
    <div
      className="modal-backdrop emergency-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="emergency-detail-title"
    >
      <div
        className="modal-card modal-large-card emergency-detail-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="emergency-modal-header">
          <div className="emergency-header-left">
            <div className="emergency-icon-pulse-badge">
              <Ambulance size={26} className="emergency-ambulance-icon" />
            </div>
            <div>
              <div className="emergency-badge-row">
                <span className="emergency-case-id-chip">{currentCase.case_id}</span>
                <span className="emergency-priority-chip">LEVEL 1 RESUSCITATION</span>
                <span className="emergency-bay-chip">
                  <Building2 size={12} /> {currentCase.assigned_resuscitation_bay || 'Red Bay 01'}
                </span>
                <span className="emergency-time-chip">
                  <Clock size={12} /> Arrived: {currentCase.arrival_time} ({formatElapsedMinutes(currentCase.elapsed_minutes)})
                </span>
              </div>
              <h2 id="emergency-detail-title" className="emergency-modal-title">
                {currentCase.patient_identity_status === 'KNOWN' && currentCase.patient_name
                  ? currentCase.patient_name
                  : `Patient: Identity Not Yet Verified (${currentCase.gender}, ~${currentCase.approximate_age ?? '?'} Yrs)`}
              </h2>
              <p className="emergency-modal-subtitle">
                Accident Type: <strong>{currentCase.accident_type.replace(/_/g, ' ')}</strong> • Mechanism: {currentCase.mechanism_of_injury || 'Acute high-impact trauma'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-button emergency-close-button"
            onClick={onClose}
            aria-label="Close emergency detail modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="emergency-tabs-bar">
          <button
            type="button"
            className={`emergency-tab-btn ${activeTab === 'assessment' ? 'active' : ''}`}
            onClick={() => setActiveTab('assessment')}
          >
            <HeartPulse size={16} /> Rapid Assessment & Protocol
          </button>
          <button
            type="button"
            className={`emergency-tab-btn ${activeTab === 'reassess' ? 'active' : ''}`}
            onClick={() => setActiveTab('reassess')}
          >
            <Stethoscope size={16} /> Update Vitals & Reassess
          </button>
          <button
            type="button"
            className={`emergency-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <History size={16} /> Audit Trail & History
          </button>
        </div>

        {/* Tab Content */}
        <div className="modal-body-scrollable emergency-modal-body">
          {activeTab === 'assessment' && (
            <div className="emergency-assessment-panel">
              {/* PRIMARY SURVEY (ABCDE) STRIP */}
              <div className="assessment-survey-container">
                <h3 className="assessment-section-title">
                  <Activity size={18} className="text-emergency-red" />
                  Primary Survey (ABCDE Clinical Status)
                </h3>
                <div className="abcde-status-cards-grid">
                  <div className="survey-status-card">
                    <span className="survey-badge">A • Airway</span>
                    <strong className="survey-value">{currentCase.airway_status || 'Intact'}</strong>
                    <span className="survey-sub">C-spine precautions</span>
                  </div>
                  <div className="survey-status-card">
                    <span className="survey-badge">B • Breathing</span>
                    <strong className="survey-value">{currentCase.breathing_status || 'Normal'}</strong>
                    <span className="survey-sub">RR: {currentCase.respiratory_rate ? `${currentCase.respiratory_rate}/min` : 'Unrecorded'}</span>
                  </div>
                  <div className="survey-status-card">
                    <span className="survey-badge">C • Circulation</span>
                    <strong className="survey-value">{currentCase.circulation_status || 'Palpable'}</strong>
                    <span className="survey-sub">
                      BP: {currentCase.systolic_bp && currentCase.diastolic_bp ? `${currentCase.systolic_bp}/${currentCase.diastolic_bp}` : 'Unrecorded'}
                    </span>
                  </div>
                  <div className="survey-status-card">
                    <span className="survey-badge">D • Disability</span>
                    <strong className="survey-value">{currentCase.neurological_status || 'Alert'}</strong>
                    <span className="survey-sub">GCS: {currentCase.gcs_score ? `${currentCase.gcs_score}/15` : 'N/A'}</span>
                  </div>
                  <div className="survey-status-card">
                    <span className="survey-badge">E • Exposure</span>
                    <strong className="survey-value">{currentCase.major_bleeding || 'None'}</strong>
                    <span className="survey-sub">Bleeding control active</span>
                  </div>
                </div>
              </div>

              {/* VITALS SUMMARY STRIP */}
              <div className="emergency-vitals-strip">
                <div className="vitals-tile">
                  <span className="vitals-label">Pulse</span>
                  <strong className="vitals-number">
                    {currentCase.pulse_bpm != null ? `${currentCase.pulse_bpm} bpm` : '—'}
                  </strong>
                </div>
                <div className="vitals-tile">
                  <span className="vitals-label">Blood Pressure</span>
                  <strong className="vitals-number">
                    {currentCase.systolic_bp != null && currentCase.diastolic_bp != null
                      ? `${currentCase.systolic_bp}/${currentCase.diastolic_bp}`
                      : '—'}
                  </strong>
                </div>
                <div className="vitals-tile">
                  <span className="vitals-label">SpO2 Oxygen</span>
                  <strong
                    className={`vitals-number ${
                      currentCase.spo2 != null && currentCase.spo2 < 90 ? 'text-emergency-red' : ''
                    }`}
                  >
                    {currentCase.spo2 != null ? `${currentCase.spo2}%` : '—'}
                  </strong>
                </div>
                <div className="vitals-tile">
                  <span className="vitals-label">Temperature</span>
                  <strong className="vitals-number">
                    {currentCase.temperature_f != null ? `${currentCase.temperature_f}°F` : '—'}
                  </strong>
                </div>
                <div className="vitals-tile">
                  <span className="vitals-label">Glasgow Coma</span>
                  <strong className="vitals-number">
                    {currentCase.gcs_score != null ? `${currentCase.gcs_score}/15` : '—'}
                  </strong>
                </div>
              </div>

              {/* RED FLAGS & ESCALATION REASON */}
              <div className="emergency-redflags-section">
                <h4 className="redflags-heading">
                  <AlertOctagon size={16} className="text-emergency-red" />
                  Documented Red Flags & Escalation Rationale:
                </h4>
                <div className="redflags-tags-list">
                  {currentCase.red_flags.map((flag, idx) => (
                    <span key={idx} className="redflag-badge">
                      <AlertTriangle size={12} /> {flag}
                    </span>
                  ))}
                </div>
                {currentCase.immediate_actions_taken && (
                  <div className="immediate-actions-note">
                    <strong>Immediate Interventions Administered:</strong> {currentCase.immediate_actions_taken}
                  </div>
                )}
              </div>

              {/* CASE LIFECYCLE CONTROLS (Feature 6) */}
              <div className="emergency-lifecycle-control-card">
                <h4 className="lifecycle-heading">
                  <ShieldAlert size={16} className="text-emergency-red" />
                  Staff Case Lifecycle Transition:
                </h4>
                <form onSubmit={handleUpdateStatus} className="lifecycle-form">
                  {statusError && <div className="text-emergency-red mb-2">{statusError}</div>}
                  <div className="lifecycle-inputs-row">
                    <div className="form-field flex-1">
                      <label htmlFor="status-select">Current Status</label>
                      <select
                        id="status-select"
                        value={targetStatus}
                        onChange={(e) => setTargetStatus(e.target.value as EmergencyCaseStatus)}
                        className="form-select"
                      >
                        <option value="RESPONSE_ACTIVATED">Response Activated (Red Bay Alert)</option>
                        <option value="INITIAL_ASSESSMENT">Initial Assessment in Progress</option>
                        <option value="STABILIZATION_IN_PROGRESS">Stabilization in Progress</option>
                        <option value="AWAITING_CLINICAL_DECISION">Awaiting Further Clinical Decision</option>
                        <option value="TRANSFERRED">Transferred (Higher Trauma Center / OT)</option>
                        <option value="ADMITTED">Admitted (ICU / HDU Ward)</option>
                        <option value="COMPLETED">Completed / Discharged</option>
                      </select>
                    </div>
                    <div className="form-field flex-1">
                      <label htmlFor="staff-name-input">Responsible Clinician</label>
                      <input
                        id="staff-name-input"
                        type="text"
                        value={statusStaff}
                        onChange={(e) => setStatusStaff(e.target.value)}
                        className="form-input"
                      />
                    </div>
                  </div>
                  <div className="form-field mt-2">
                    <label htmlFor="status-notes-input">Handoff / Transition Notes</label>
                    <input
                      id="status-notes-input"
                      type="text"
                      placeholder="e.g. Infusing 2nd unit PRBC; eFAST positive in Morrison pouch; moving to Emergency OT"
                      value={statusNotes}
                      onChange={(e) => setStatusNotes(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="lifecycle-actions mt-3">
                    <button
                      type="submit"
                      disabled={isUpdatingStatus}
                      className="cult-shimmer-btn cult-shimmer-primary cult-shimmer-size-sm"
                    >
                      <Send size={14} /> Update Case Lifecycle
                    </button>
                  </div>
                </form>
              </div>

              {/* HOSPITAL PROTOCOL CHECKLIST */}
              <div className="emergency-protocol-checklist-card mt-3">
                <div className="protocol-checklist-header">
                  <AlertOctagon size={18} className="text-emergency-red" />
                  <h4>Hospital Resuscitation Protocol Checklist:</h4>
                </div>
                <ul className="protocol-instructions-list">
                  {currentCase.hospital_protocol_instructions.map((inst, idx) => (
                    <li key={idx} className="protocol-instruction-item">
                      {inst}
                    </li>
                  ))}
                </ul>
              </div>

              {/* DISCLAIMER */}
              <div className="clinical-disclaimer-box mt-3">
                {currentCase.clinical_disclaimer}
              </div>
            </div>
          )}

          {/* TAB 2: REASSESSMENT */}
          {activeTab === 'reassess' && (
            <form onSubmit={handleReassess} className="emergency-reassessment-form">
              <h3 className="assessment-section-title">
                <Stethoscope size={18} className="text-emergency-red" />
                Document Bedside Clinical Reassessment
              </h3>
              <p className="reassess-desc">
                Record updated physiological vitals, neurological status (GCS/AVPU), or response to fluid resuscitation. All updates are logged in the audit trail.
              </p>

              <div className="form-grid-3">
                <div className="form-field">
                  <label htmlFor="reassess-airway">Airway Status</label>
                  <select
                    id="reassess-airway"
                    value={reassessAirway}
                    onChange={(e) => setReassessAirway(e.target.value)}
                    className="form-select"
                  >
                    <option value="Intact / Clear">Intact / Clear</option>
                    <option value="Compromised">Compromised</option>
                    <option value="Endotracheal Intubation Maintained">Endotracheal Tube Placed</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="reassess-breathing">Breathing Status</label>
                  <select
                    id="reassess-breathing"
                    value={reassessBreathing}
                    onChange={(e) => setReassessBreathing(e.target.value)}
                    className="form-select"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Dyspnea / Shallow">Dyspnea / Shallow</option>
                    <option value="Mechanically Ventilated">Mechanically Ventilated</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="reassess-circulation">Circulatory Status</label>
                  <select
                    id="reassess-circulation"
                    value={reassessCirculation}
                    onChange={(e) => setReassessCirculation(e.target.value)}
                    className="form-select"
                  >
                    <option value="Palpable Regular">Palpable Regular</option>
                    <option value="Tachycardic / Full">Tachycardic / Full</option>
                    <option value="Improving with Fluids">Improving with Fluids</option>
                    <option value="Persistent Shock">Persistent Shock</option>
                  </select>
                </div>
              </div>

              <div className="form-grid-5 mt-3">
                <div className="form-field">
                  <label htmlFor="reassess-pulse">Pulse (bpm)</label>
                  <input
                    id="reassess-pulse"
                    type="number"
                    value={reassessPulse}
                    onChange={(e) => setReassessPulse(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="reassess-sys">Systolic BP</label>
                  <input
                    id="reassess-sys"
                    type="number"
                    value={reassessBpSys}
                    onChange={(e) => setReassessBpSys(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="reassess-dia">Diastolic BP</label>
                  <input
                    id="reassess-dia"
                    type="number"
                    value={reassessBpDia}
                    onChange={(e) => setReassessBpDia(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="reassess-spo2">SpO2 (%)</label>
                  <input
                    id="reassess-spo2"
                    type="number"
                    value={reassessSpo2}
                    onChange={(e) => setReassessSpo2(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="reassess-gcs">GCS Score (3-15)</label>
                  <input
                    id="reassess-gcs"
                    type="number"
                    min={3}
                    max={15}
                    value={reassessGcs}
                    onChange={(e) => setReassessGcs(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-field mt-3">
                <label htmlFor="reassess-staff">Clinician Responsible</label>
                <input
                  id="reassess-staff"
                  type="text"
                  value={reassessStaff}
                  onChange={(e) => setReassessStaff(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-field mt-2">
                <label htmlFor="reassess-notes">Clinical Findings & Reassessment Rationale</label>
                <textarea
                  id="reassess-notes"
                  rows={2}
                  placeholder="e.g. SBP stabilized above 100 after 1L warm crystalloids; pupil reflexes brisk; portable pelvic radiograph clear."
                  value={reassessNotes}
                  onChange={(e) => setReassessNotes(e.target.value)}
                  className="form-textarea"
                />
              </div>

              <div className="form-actions mt-3">
                <button
                  type="submit"
                  disabled={isReassessing}
                  className="cult-shimmer-btn cult-shimmer-primary"
                >
                  <CheckCircle2 size={16} /> Save Reassessment Record
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="emergency-audit-panel">
              <h3 className="assessment-section-title">
                <History size={18} className="text-emergency-red" />
                Case Audit Trail & Clinical Handoff Logs
              </h3>
              {isLoadingAudit ? (
                <div className="p-4 text-center">Loading audit events...</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-4 text-center text-navy-500">No audit events recorded yet.</div>
              ) : (
                <div className="audit-timeline">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="audit-timeline-item">
                      <div className="audit-marker" />
                      <div className="audit-content">
                        <div className="audit-header">
                          <span className="audit-action">{log.action_type}</span>
                          <span className="audit-status-transition">
                            {log.previous_status ? `${log.previous_status} → ` : ''}
                            <strong>{log.new_status}</strong>
                          </span>
                          <span className="audit-time">
                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="audit-staff">Performed by: <strong>{log.performed_by}</strong></div>
                        {log.notes && <div className="audit-notes">{log.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <div className="footer-status-indicator">
            <Ambulance size={14} className="text-emergency-red inline-icon" />
            <span>Dedicated Trauma Care Protocol • Level 1 Precedence</span>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary">
            Close Case Detail
          </button>
        </div>
      </div>
    </div>
  );
};
