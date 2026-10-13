import React, { useState } from 'react';
import type { SavedPatientQueueItem } from '../../types/triage';
import { X, Heart, Wind, Gauge, Thermometer, Stethoscope } from 'lucide-react';

interface ReassessmentModalProps {
  patient: SavedPatientQueueItem | null;
  onClose: () => void;
  onConfirmReassessment: (
    patientId: string,
    payload: {
      requested_by: string;
      updated_pulse?: number;
      updated_spo2?: number;
      updated_systolic_bp?: number;
      updated_diastolic_bp?: number;
      updated_temperature?: number;
      notes?: string;
    }
  ) => Promise<void>;
}

export const ReassessmentModal: React.FC<ReassessmentModalProps> = ({
  patient,
  onClose,
  onConfirmReassessment,
}) => {
  const [nurseName, setNurseName] = useState<string>('Staff Nurse Sunita');
  const [pulse, setPulse] = useState<string>(patient?.pulse_bpm != null ? String(patient.pulse_bpm) : '');
  const [spo2, setSpo2] = useState<string>(patient?.spo2 != null ? String(patient.spo2) : '');
  const [systolic, setSystolic] = useState<string>(patient?.systolic_bp != null ? String(patient.systolic_bp) : '');
  const [diastolic, setDiastolic] = useState<string>(patient?.diastolic_bp != null ? String(patient.diastolic_bp) : '');
  const [temperature, setTemperature] = useState<string>(patient?.temperature != null ? String(patient.temperature) : '');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!patient) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirmReassessment(patient.patient_id, {
        requested_by: nurseName.trim() || 'Staff Nurse',
        updated_pulse: pulse ? parseInt(pulse, 10) : undefined,
        updated_spo2: spo2 ? parseFloat(spo2) : undefined,
        updated_systolic_bp: systolic ? parseInt(systolic, 10) : undefined,
        updated_diastolic_bp: diastolic ? parseInt(diastolic, 10) : undefined,
        updated_temperature: temperature ? parseFloat(temperature) : undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reassessment failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
        {/* Header */}
        <div className="modal-header modal-header-priority" style={{ background: '#2563eb', color: '#fff' }}>
          <div className="modal-title-section">
            <div className="modal-token-row">
              <span className="modal-token-badge">{patient.token_number}</span>
              <span className="modal-uhid-badge">{patient.patient_id}</span>
              <span className="badge-status-chip">REASSESSMENT</span>
            </div>
            <h2 className="modal-patient-name" style={{ color: '#fff' }}>
              Bedside Vital Reassessment — {patient.patient_name || patient.patient_id}
            </h2>
            <div className="modal-patient-sub" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Re-evaluate physiological acuity and update triage priority
            </div>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body-scrollable">
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6, color: 'var(--danger-color)', fontSize: 13, marginBottom: 12 }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                Reassessing Clinician / Nurse *
              </label>
              <input
                type="text"
                value={nurseName}
                onChange={(e) => setNurseName(e.target.value)}
                placeholder="Staff Nurse Sunita, RN"
                className="filter-search-input"
                style={{ width: '100%', padding: '8px 12px' }}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <Heart size={13} /> Pulse (bpm)
                </label>
                <input
                  type="number"
                  min="0"
                  max="300"
                  value={pulse}
                  onChange={(e) => setPulse(e.target.value)}
                  placeholder="e.g. 88"
                  className="filter-search-input"
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <Wind size={13} /> SpO2 Oxygen (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="100"
                  value={spo2}
                  onChange={(e) => setSpo2(e.target.value)}
                  placeholder="e.g. 96"
                  className="filter-search-input"
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <Gauge size={13} /> Systolic BP (mmHg)
                </label>
                <input
                  type="number"
                  min="40"
                  max="300"
                  value={systolic}
                  onChange={(e) => setSystolic(e.target.value)}
                  placeholder="e.g. 120"
                  className="filter-search-input"
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <Gauge size={13} /> Diastolic BP (mmHg)
                </label>
                <input
                  type="number"
                  min="20"
                  max="200"
                  value={diastolic}
                  onChange={(e) => setDiastolic(e.target.value)}
                  placeholder="e.g. 80"
                  className="filter-search-input"
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  <Thermometer size={13} /> Temperature (°F)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="85"
                  max="115"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  placeholder="e.g. 98.6"
                  className="filter-search-input"
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Clinical Reassessment Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Rechecked vitals after 20 minutes of rest and oxygen therapy."
                rows={2}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
                style={{ padding: '8px 20px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                disabled={isSubmitting}
              >
                <Stethoscope size={15} />
                <span>{isSubmitting ? 'Evaluating...' : 'Run Reassessment'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
