import React, { useState } from 'react';
import type { SavedPatientQueueItem } from '../../types/triage';
import { X, AlertTriangle, AlertOctagon } from 'lucide-react';

interface FlagDeteriorationModalProps {
  patient: SavedPatientQueueItem | null;
  onClose: () => void;
  onConfirmDeterioration: (patientId: string, flaggedBy: string, reason: string, notes?: string) => Promise<void>;
}

export const FlagDeteriorationModal: React.FC<FlagDeteriorationModalProps> = ({
  patient,
  onClose,
  onConfirmDeterioration,
}) => {
  const [nurseName, setNurseName] = useState<string>('Staff Nurse Sunita');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!patient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please specify observed signs of acute clinical deterioration.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirmDeterioration(patient.patient_id, nurseName.trim() || 'Bedside Triage Nurse', reason.trim(), notes.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record deterioration alert.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        {/* Header */}
        <div className="modal-header modal-header-emergency">
          <div className="modal-title-section">
            <div className="modal-token-row">
              <span className="modal-token-badge">{patient.token_number}</span>
              <span className="modal-uhid-badge">{patient.patient_id}</span>
              <span className="badge-status-chip" style={{ background: '#ef4444', color: '#fff' }}>CLINICAL DETERIORATION ALERT</span>
            </div>
            <h2 className="modal-patient-name" style={{ color: '#fff' }}>
              Flag Patient Deterioration — {patient.patient_name || patient.patient_id}
            </h2>
            <div className="modal-patient-sub" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Acuity Escalation Workflow • Immediately advances patient to Top Priority (Tier 0)
            </div>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body-scrollable">
          <div style={{ padding: '12px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger-color)', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              <AlertOctagon size={18} /> URGENT SAFETY OVERRIDE PROTOCOL
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Flagging clinical deterioration will immediately reclassify this case as <strong>NEEDS_HUMAN_REVIEW</strong> with an urgency score of <strong>10/10</strong>, alerting the casualty medical team and moving the patient to the very top of the priority queue.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, color: 'var(--danger-color)', fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Reporting Staff Name *
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
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  Observed Acute Deterioration Signs *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Patient acutely sweating and clutching chest; SpO2 dropping rapidly to 89%; onset of confusion in waiting area."
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: 13 }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  Immediate Action Taken / Resuscitation Bay Location (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Wheeled to Resuscitation Bay 2, Code Red team paged."
                  className="filter-search-input"
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                onClick={onClose}
                className="btn-clear-filters"
                style={{ padding: '8px 16px', fontSize: 13 }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-intake-submit"
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--danger-color)',
                  borderColor: 'var(--danger-color)',
                  color: '#fff',
                }}
                disabled={isSubmitting}
              >
                <AlertTriangle size={15} />
                <span>{isSubmitting ? 'Escalating...' : 'Confirm Deterioration Escalation'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
