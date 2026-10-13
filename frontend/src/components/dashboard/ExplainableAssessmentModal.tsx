import React, { useState, useEffect, useCallback } from 'react';
import type {
  ExplainableAssessmentData,
  ClinicianTriagePayload,
} from '../../types/triage';
import {
  fetchExplainableAssessment,
  recordClinicianTriage,
} from '../../services/api';
import {
  X,
  ShieldAlert,
  Brain,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Clock,
  UserCheck,
  Info,
} from 'lucide-react';

interface ExplainableAssessmentModalProps {
  patient: {
    patient_id: string;
    token_number?: string | null;
    patient_name?: string | null;
    triage_level_name?: string | null;
  } | null;
  onClose: () => void;
  onPatientUpdated?: () => void;
}

export const ExplainableAssessmentModal: React.FC<ExplainableAssessmentModalProps> = ({
  patient,
  onClose,
  onPatientUpdated,
}) => {
  const [data, setData] = useState<ExplainableAssessmentData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Clinician Review / Override modal state
  const [showOverrideForm, setShowOverrideForm] = useState<boolean>(false);
  const [overrideLevel, setOverrideLevel] = useState<number>(2);
  const [clinicianName, setClinicianName] = useState<string>('');
  const [overrideNotes, setOverrideNotes] = useState<string>('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!patient) return;
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchExplainableAssessment(patient.patient_id);
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch explainable assessment.');
    } finally {
      setIsLoading(false);
    }
  }, [patient]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!patient) return null;

  const handleSaveClinicianOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicianName.trim()) {
      setError('Attending clinician name or ID is mandatory for recorded actions.');
      return;
    }
    if (!overrideNotes.trim()) {
      setError('A formal clinical override rationale is mandatory.');
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
      clinician_name: clinicianName.trim(),
      triage_level: overrideLevel,
      triage_name: levelNames[overrideLevel] || `Level ${overrideLevel}`,
      notes: overrideNotes.trim(),
    };

    try {
      setIsSubmittingOverride(true);
      setError(null);
      await recordClinicianTriage(patient.patient_id, payload);
      setShowOverrideForm(false);
      setOverrideNotes('');
      await loadData();
      if (onPatientUpdated) onPatientUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record clinical override.');
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const isLevel1 = data?.effective_triage_level === 1;
  const isLevel2 = data?.effective_triage_level === 2;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860, width: '95%' }}>
        {/* Header */}
        <div
          className="modal-header"
          style={{
            background: isLevel1 ? '#991b1b' : isLevel2 ? '#9a3412' : '#0f172a',
            color: '#fff',
            borderBottom: '2px solid rgba(255,255,255,0.1)',
          }}
        >
          <div className="modal-title-section">
            <div className="modal-token-row">
              <span className="modal-token-badge">{patient.token_number}</span>
              <span className="modal-uhid-badge">{patient.patient_id}</span>
              <span
                className="badge-status-chip"
                style={{
                  background: isLevel1 ? '#ef4444' : isLevel2 ? '#f97316' : '#10b981',
                  color: '#fff',
                }}
              >
                {data?.effective_triage_name || patient.triage_level_name || 'Level Assessment'}
              </span>
            </div>
            <h2 className="modal-patient-name" style={{ color: '#fff' }}>
              Explainable Triage Assessment: {patient.patient_name || patient.patient_id}
            </h2>
            <div className="modal-patient-sub" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Assessed at {data?.assessment_timestamp ? new Date(data.assessment_timestamp).toLocaleTimeString() : 'N/A'} • Rule Version:{' '}
              {data?.rule_set_version || '2026.1-hackathon-domain-primer-v1'}
            </div>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="modal-body-scrollable" style={{ padding: '20px 24px' }}>
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
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
              <Clock size={28} className="spin-icon" style={{ marginBottom: 10 }} />
              <div>Loading transparent assessment explanation...</div>
            </div>
          ) : (
            <>
              {/* SECTION 1: CLINICIAN-ASSIGNED TRIAGE CATEGORY */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UserCheck size={18} color="#0f766e" />
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                      1. Clinician-Assigned Triage Category
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOverrideForm(!showOverrideForm)}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 4,
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      color: '#0f766e',
                      cursor: 'pointer',
                    }}
                  >
                    {showOverrideForm ? 'Cancel Action' : data?.clinician_assigned_triage?.clinician_triage_level ? 'Revise Triage' : 'Record Clinician Review'}
                  </button>
                </div>

                {data?.clinician_assigned_triage?.clinician_triage_level ? (
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: 6,
                      padding: '12px 14px',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <strong style={{ color: '#166534', fontSize: '0.9rem' }}>
                        Level {data.clinician_assigned_triage.clinician_triage_level}: {data.clinician_assigned_triage.clinician_triage_name}
                      </strong>
                      <span style={{ color: '#15803d', fontSize: '0.75rem' }}>
                        Reviewed: {data.clinician_assigned_triage.clinician_reviewed_at ? new Date(data.clinician_assigned_triage.clinician_reviewed_at).toLocaleTimeString() : 'N/A'}
                      </span>
                    </div>
                    <div style={{ color: '#14532d', marginBottom: 4 }}>
                      <strong>Physician:</strong> {data.clinician_assigned_triage.clinician_reviewed_by}
                    </div>
                    <div style={{ color: '#14532d' }}>
                      <strong>Recorded Clinical Rationale:</strong> {data.clinician_assigned_triage.clinician_triage_notes}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#fff',
                      border: '1px dashed #cbd5e1',
                      borderRadius: 6,
                      color: '#64748b',
                      fontSize: '0.85rem',
                    }}
                  >
                    <strong>Status:</strong> Not available. (Not yet recorded by attending clinician; currently managed under automated intake classification).
                  </div>
                )}

                {/* Inline override form */}
                {showOverrideForm && (
                  <form
                    onSubmit={handleSaveClinicianOverride}
                    style={{
                      marginTop: 12,
                      padding: 12,
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          Clinician-Assigned Level
                        </label>
                        <select
                          value={overrideLevel}
                          onChange={(e) => setOverrideLevel(parseInt(e.target.value, 10))}
                          className="filter-select-element"
                          style={{ width: '100%' }}
                        >
                          <option value={1}>Level 1 - Resuscitation (Immediate)</option>
                          <option value={2}>Level 2 - Emergent (High Risk / Confusion)</option>
                          <option value={3}>Level 3 - Urgent (Multiple Resources)</option>
                          <option value={4}>Level 4 - Less Urgent</option>
                          <option value={5}>Level 5 - Non-Urgent</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                          Reviewing Doctor / CMO Name
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Enter clinician name or ID (e.g. Dr. A. Sharma, CMO)"
                          value={clinicianName}
                          onChange={(e) => setClinicianName(e.target.value)}
                          className="filter-search-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                        Override Clinical Rationale (Audited)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Document why urgency is adjusted..."
                        value={overrideNotes}
                        onChange={(e) => setOverrideNotes(e.target.value)}
                        className="filter-search-input"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setShowOverrideForm(false)}
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingOverride}
                        className="btn-primary"
                        style={{ padding: '4px 14px', fontSize: '0.8rem' }}
                      >
                        {isSubmittingOverride ? 'Saving...' : 'Commit Clinician Triage'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* SECTION 2: AI MODEL SUGGESTION */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Brain size={18} color="#7c3aed" />
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                    2. AI Model Suggestion
                  </h3>
                </div>

                {data?.ai_model_suggestion?.available ? (
                  <div
                    style={{
                      background: '#faf5ff',
                      border: '1px solid #e9d5ff',
                      borderRadius: 6,
                      padding: '12px 14px',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: '#581c87' }}>
                        Model Suggestion: Level {data.ai_model_suggestion.suggested_level} ({data.ai_model_suggestion.suggested_name})
                      </span>
                      <span style={{ color: '#7e22ce', fontSize: '0.75rem' }}>
                        Model Version: {data.ai_model_suggestion.model_version || 'v1.0.0'}
                      </span>
                    </div>

                    {data.ai_model_suggestion.raw_suggested_level && (
                      <div style={{ fontSize: '0.8rem', color: '#6b21a8', marginBottom: 4 }}>
                        <strong>Raw Model Prediction:</strong> Level {data.ai_model_suggestion.raw_suggested_level} ({data.ai_model_suggestion.raw_suggested_name})
                        {data.ai_model_suggestion.override_applied && (
                          <span style={{ color: '#dc2626', fontWeight: 600, marginLeft: 6 }}>
                            [Overridden by Clinical Safety Rule]
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ fontSize: '0.8rem', color: '#6b21a8', marginBottom: 6 }}>
                      <strong>Routing Suggestion:</strong> {data.ai_model_suggestion.recommended_department || 'General Medicine'}
                    </div>

                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#6b21a8',
                        background: 'rgba(255,255,255,0.7)',
                        padding: '6px 10px',
                        borderRadius: 4,
                        border: '1px solid #f3e8ff',
                        fontStyle: 'italic',
                      }}
                    >
                      {data.ai_model_suggestion.disclaimer}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#fff',
                      border: '1px dashed #cbd5e1',
                      borderRadius: 6,
                      color: '#64748b',
                      fontSize: '0.85rem',
                    }}
                  >
                    <strong>Model Suggestion:</strong> Not available. (AI inference service abstained or model weights not activated).
                  </div>
                )}
              </div>

              {/* SECTION 3: RULE-BASED WARNINGS AND TRIGGERED RULE IDENTIFIERS */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <ShieldAlert size={18} color="#dc2626" />
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                    3. Rule-Based Clinical Warnings & Rule Identifiers
                  </h3>
                </div>

                {data?.rule_based_warnings?.length === 0 ? (
                  <div
                    style={{
                      padding: '10px 14px',
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      color: '#16a34a',
                      fontSize: '0.85rem',
                    }}
                  >
                    <CheckCircle size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                    No critical physiological escalation rules were triggered for this case.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data?.rule_based_warnings?.map((rw) => (
                      <div
                        key={rw.rule_id}
                        style={{
                          background: rw.is_critical_override ? '#fef2f2' : '#fffbeb',
                          border: rw.is_critical_override ? '1px solid #fecaca' : '1px solid #fef3c7',
                          borderLeft: rw.is_critical_override ? '4px solid #dc2626' : '4px solid #f59e0b',
                          borderRadius: 6,
                          padding: '10px 12px',
                          fontSize: '0.85rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, color: rw.is_critical_override ? '#991b1b' : '#92400e' }}>
                            {rw.rule_name}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                            ID: {rw.rule_id}
                          </span>
                        </div>
                        <div style={{ color: '#1e293b', marginBottom: 4 }}>{rw.message}</div>
                        <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: 4 }}>
                          <strong>Physiological Rationale:</strong> {rw.clinical_explanation}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#0284c7' }}>
                          <strong>Mandatory Human Verification:</strong> {rw.required_human_verification}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 4: RECORDED RED FLAGS AND SUPPORTING OBSERVATIONS */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <AlertTriangle size={18} color="#ea580c" />
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                    4. Recorded Red Flags & Supporting Observations
                  </h3>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: 12,
                    }}
                  >
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Red Flags Documented
                    </h4>
                    {data?.evidence?.recorded_red_flags?.length === 0 ? (
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        None marked at intake
                      </span>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: '#dc2626' }}>
                        {data?.evidence?.recorded_red_flags?.map((rf, idx) => (
                          <li key={idx} style={{ marginBottom: 2 }}>{rf}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: 12,
                    }}
                  >
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>
                      Vital Abnormalities & Evidence
                    </h4>
                    {data?.evidence?.vital_abnormalities?.length === 0 ? (
                      <span style={{ fontSize: '0.85rem', color: '#16a34a' }}>
                        No acute vital abnormalities recorded
                      </span>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.85rem', color: '#b91c1c' }}>
                        {data?.evidence?.vital_abnormalities?.map((v, idx) => (
                          <li key={idx} style={{ marginBottom: 2 }}>{v}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* SECTION 5: MISSING INFORMATION LIMITING ASSESSMENT */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <HelpCircle size={18} color="#d97706" />
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                    5. Missing Information Limiting Assessment
                  </h3>
                </div>

                <div
                  style={{
                    background: '#fffbeb',
                    border: '1px solid #fef3c7',
                    borderRadius: 6,
                    padding: 12,
                    fontSize: '0.85rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#b45309', marginBottom: 6 }}>
                    Unrecorded Parameters:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {data?.missing_information?.missing_vital_signs?.map((item, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: '#fff',
                          border: '1px solid #fde68a',
                          color: '#92400e',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                        }}
                      >
                        ⚠️ {item}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#78350f', fontStyle: 'italic' }}>
                    {data?.missing_information?.unrecorded_measurements_note}
                  </div>
                </div>
              </div>

              {/* SECTION 6 & 7: AUDIT HISTORY & TIMESTAMPS */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Clock size={18} color="#475569" />
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                    6 & 7. Assessment Timestamps & Human Review Audit History
                  </h3>
                </div>

                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 10 }}>
                  <strong>Intake Initialized:</strong> {data?.assessment_timestamp ? new Date(data.assessment_timestamp).toLocaleString() : 'Not available'} •{' '}
                  <strong>Rule Set Active:</strong> {data?.rule_set_version || 'Not available'}
                </div>

                {(!data?.audit_history || data.audit_history.length === 0) ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Not available (No human review or override actions recorded yet).</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {data?.audit_history?.map((ah, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                          borderRadius: 4,
                          padding: '8px 10px',
                          fontSize: '0.8rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>
                            {ah.action_type.replace(/_/g, ' ')}
                          </span>
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            {new Date(ah.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div style={{ color: '#475569' }}>
                          By <strong>{ah.performed_by}</strong> • New Status: <em>{ah.new_status}</em>
                        </div>
                        {ah.notes && (
                          <div style={{ color: '#334155', marginTop: 2, fontStyle: 'italic' }}>
                            "{ah.notes}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Prototype Clinical Disclaimer */}
          <div className="prototype-disclaimer">
            <Info size={14} className="disclaimer-icon" />
            <span>{data?.clinical_disclaimer || 'Prototype Decision Support: advisory only.'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
