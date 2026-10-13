import React, { useState } from 'react';
import type { SavedPatientQueueItem } from '../../types/triage';
import {
  X,
  CheckCircle,
  ShieldAlert,
  Heart,
  Wind,
  Gauge,
  Thermometer,
  FileText,
} from 'lucide-react';

interface ReviewAssessmentModalProps {
  patient: SavedPatientQueueItem | null;
  onClose: () => void;
  onConfirmReview: (patientId: string, reviewedBy: string, reviewNotes?: string) => Promise<void>;
  onOpenExplainable?: (patient: SavedPatientQueueItem) => void;
  onOpenDeteriorationWatch?: (patient: SavedPatientQueueItem) => void;
}

export const ReviewAssessmentModal: React.FC<ReviewAssessmentModalProps> = ({
  patient,
  onClose,
  onConfirmReview,
  onOpenExplainable,
  onOpenDeteriorationWatch,
}) => {
  const [nurseName, setNurseName] = useState<string>('Staff Nurse Sunita');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!patient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nurseName.trim()) {
      setError('Nurse name or staff identifier is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirmReview(patient.patient_id, nurseName.trim(), reviewNotes.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record nurse review.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLevel1 = patient.triage_level === 1;
  const isLevel2 = patient.triage_level === 2;

  const headerClass = isLevel1
    ? 'modal-header-emergency'
    : isLevel2
    ? 'modal-header-priority'
    : 'modal-header-routine';

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        {/* Header */}
        <div className={`modal-header ${headerClass}`}>
          <div className="modal-title-section">
            <div className="modal-token-row">
              <span className="modal-token-badge">{patient.token_number}</span>
              <span className="modal-uhid-badge">{patient.patient_id}</span>
              <span className="badge-status-chip">{patient.assessment_status}</span>
            </div>
            <h2 className="modal-patient-name">{patient.patient_name || 'Patient ' + patient.patient_id}</h2>
            <div className="modal-patient-sub">
              {patient.age} yrs • {patient.gender} • Arrived at {patient.arrival_time} ({patient.waiting_minutes}m wait)
            </div>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="modal-body-scrollable">
          {/* Triage Decision Banner */}
          <div className="modal-decision-banner" style={{ marginBottom: 16 }}>
            <div className="decision-left">
              <span className="decision-category-label">
                {patient.triage_level_name || (patient.triage_level ? `Level ${patient.triage_level}` : 'Pending Clinical Assessment')}
              </span>
              <div className="decision-directive">
                <strong>Assigned Specialty:</strong> {patient.recommended_department || 'General Medicine'}
              </div>
            </div>
            <div className="decision-right">
              <span className="decision-score-num">{patient.urgency_score}</span>
              <span className="decision-score-text">/ 10 Acuity Score</span>
            </div>
          </div>

          {/* Quick-links for Explainable Assessment and Deterioration Watch */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {onOpenExplainable && (
              <button
                type="button"
                onClick={() => onOpenExplainable(patient)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #7c3aed',
                  background: '#faf5ff',
                  color: '#6d28d9',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <ShieldAlert size={15} />
                <span>Explainable Assessment (AI & Rules)</span>
              </button>
            )}
            {onOpenDeteriorationWatch && (
              <button
                type="button"
                onClick={() => onOpenDeteriorationWatch(patient)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #0284c7',
                  background: '#f0f9ff',
                  color: '#0369a1',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <Heart size={15} />
                <span>Deterioration Watch Panel</span>
              </button>
            )}
          </div>

          {/* Presenting Complaint Section */}
          <div className="modal-section-box">
            <h4 className="section-title-with-icon">
              <FileText size={16} /> Chief Presenting Complaint
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>
                [Language: {patient.complaint_language}]
              </span>
            </h4>
            <p className="complaint-text-preserved" style={{ padding: '8px 12px', background: 'var(--bg-app)', borderRadius: 6, fontStyle: 'italic', margin: 0 }}>
              "{patient.chief_complaint}"
            </p>
          </div>

          {/* Vitals Summary */}
          <div className="modal-section-box" style={{ marginTop: 14 }}>
            <h4 className="section-title-with-icon">
              <Heart size={16} /> Intake Vital Signs
            </h4>
            <div className="vitals-chips-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 8 }}>
              <div className="vital-mini-chip">
                <Gauge size={14} className="vital-mini-icon" />
                <span className="vital-mini-label">Blood Pressure</span>
                <span className="vital-mini-val">
                  {patient.systolic_bp != null && patient.diastolic_bp != null ? `${patient.systolic_bp}/${patient.diastolic_bp}` : 'Not measured'} mmHg
                </span>
              </div>
              <div className="vital-mini-chip">
                <Heart size={14} className="vital-mini-icon" />
                <span className="vital-mini-label">Pulse</span>
                <span className="vital-mini-val" style={{ color: patient.pulse_bpm === 0 ? 'var(--danger-color)' : undefined, fontWeight: patient.pulse_bpm === 0 ? 700 : undefined }}>
                  {patient.pulse_bpm != null ? `${patient.pulse_bpm} bpm` : 'Not measured'}
                  {patient.pulse_bpm === 0 && ' 🚨'}
                </span>
              </div>
              <div className="vital-mini-chip">
                <Wind size={14} className="vital-mini-icon" />
                <span className="vital-mini-label">SpO2 Oxygen</span>
                <span className="vital-mini-val" style={{ color: patient.spo2 != null && patient.spo2 < 92 ? 'var(--danger-color)' : undefined }}>
                  {patient.spo2 != null ? `${patient.spo2}%` : 'Not measured'}
                </span>
              </div>
              <div className="vital-mini-chip">
                <Thermometer size={14} className="vital-mini-icon" />
                <span className="vital-mini-label">Temperature</span>
                <span className="vital-mini-val">
                  {patient.temperature != null ? `${patient.temperature}°${patient.temperature_unit}` : 'Not measured'}
                </span>
              </div>
            </div>
          </div>

          {/* Warning Signs */}
          {patient.warning_signs && patient.warning_signs.length > 0 && (
            <div className="modal-section-box" style={{ marginTop: 14 }}>
              <h4 className="section-title-with-icon" style={{ color: 'var(--danger-color)' }}>
                <ShieldAlert size={16} /> Detected Warning Signs & Safety Triggers
              </h4>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                {patient.warning_signs.map((sign, idx) => (
                  <li key={idx} style={{ color: 'var(--danger-color)', fontWeight: 500, fontSize: 13, marginBottom: 4 }}>
                    {sign}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Existing Review Info */}
          {patient.review_status === 'REVIEWED' && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success-color)', fontWeight: 600, fontSize: 13 }}>
                <CheckCircle size={16} /> Previously Reviewed by {patient.reviewed_by}
              </div>
              {patient.reviewed_at && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Timestamp: {new Date(patient.reviewed_at).toLocaleString()}
                </div>
              )}
              {patient.review_notes && (
                <div style={{ fontSize: 13, color: 'var(--text-primary)', marginTop: 4 }}>
                  Notes: {patient.review_notes}
                </div>
              )}
            </div>
          )}

          {/* Review Confirmation Form */}
          <form onSubmit={handleSubmit} style={{ marginTop: 18, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              Nurse Clinical Review Sign-Off
            </h4>

            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, color: 'var(--danger-color)', fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Reviewing Nurse / Medical Officer Name *
                </label>
                <input
                  type="text"
                  value={nurseName}
                  onChange={(e) => setNurseName(e.target.value)}
                  placeholder="e.g. Staff Nurse Sunita, RN"
                  className="filter-search-input"
                  style={{ width: '100%', padding: '8px 12px' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Bedside Assessment Notes / Interventions Taken (Optional)
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g. Radial pulse confirmed palpable. High-flow O2 started via nasal cannula. Fast-tracked to Casualty."
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={onClose}
                className="btn-clear-filters"
                style={{ padding: '8px 16px', fontSize: 13 }}
                disabled={isSubmitting}
              >
                Close
              </button>
              <button
                type="submit"
                className="btn-intake-submit"
                style={{ padding: '8px 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                disabled={isSubmitting}
              >
                <CheckCircle size={15} />
                <span>{isSubmitting ? 'Recording...' : patient.review_status === 'REVIEWED' ? 'Update Review' : 'Mark as Reviewed'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
