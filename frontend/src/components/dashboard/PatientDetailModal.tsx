import React from 'react';
import type { PatientQueueItem, QueueStatus } from '../../types/triage';
import {
  X,
  Building2,
  Clock,
  ShieldAlert,
  UserCheck,
  CheckCircle,
  Stethoscope,
  Info,
  Heart,
  Wind,
  Gauge,
  Thermometer,
} from 'lucide-react';

interface PatientDetailModalProps {
  patient: PatientQueueItem | null;
  onClose: () => void;
  onUpdateStatus: (patientId: string, newStatus: QueueStatus) => void;
}

export const PatientDetailModal: React.FC<PatientDetailModalProps> = ({
  patient,
  onClose,
  onUpdateStatus,
}) => {
  if (!patient) return null;

  const isEmergency = patient.assessment.triage_category === 'EMERGENCY';
  const isPriority = patient.assessment.triage_category === 'PRIORITY';

  const categoryColorClass = isEmergency
    ? 'modal-header-emergency'
    : isPriority
    ? 'modal-header-priority'
    : 'modal-header-routine';

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={`modal-header ${categoryColorClass}`}>
          <div className="modal-title-section">
            <div className="modal-token-row">
              <span className="modal-token-badge">{patient.token_number}</span>
              <span className="modal-uhid-badge">{patient.opd_registration_number || 'UHID-Pending'}</span>
              {patient.is_synthetic && (
                <span className="modal-synthetic-pill">SYNTHETIC DEMO RECORD</span>
              )}
            </div>
            <h2 className="modal-patient-name">{patient.patient_name}</h2>
            <div className="modal-patient-sub">
              {patient.age} years old • {patient.gender} • Registered at{' '}
              {new Date(patient.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body-scrollable">
          {/* Triage Decision Banner */}
          <div className="modal-decision-banner">
            <div className="decision-left">
              <span className="decision-category-label">
                {patient.assessment.urgency_level}
              </span>
              <div className="decision-directive">
                <strong>Directive:</strong> {patient.assessment.recommended_action}
              </div>
            </div>
            <div className="decision-right">
              <span className="decision-score-num">{patient.assessment.urgency_score}</span>
              <span className="decision-score-text">/ 10 Acuity</span>
            </div>
          </div>

          {/* Department & Maximum Wait */}
          <div className="modal-meta-grid">
            <div className="modal-meta-box">
              <Building2 size={18} className="meta-icon" />
              <div>
                <span className="meta-sub">Assigned Department</span>
                <span className="meta-val">{patient.assessment.recommended_department}</span>
              </div>
            </div>
            <div className="modal-meta-box">
              <Clock size={18} className="meta-icon" />
              <div>
                <span className="meta-sub">Max Recommended Wait</span>
                <span className="meta-val">
                  {patient.assessment.max_recommended_wait_minutes === 0
                    ? '0 min (Immediate Care)'
                    : `≤ ${patient.assessment.max_recommended_wait_minutes} Minutes`}
                </span>
              </div>
            </div>
          </div>

          {/* Chief Complaint */}
          <div className="modal-section">
            <h4 className="modal-section-title">Chief Presenting Complaint</h4>
            <div className="modal-complaint-box">
              <p>{patient.chief_complaint}</p>
              {patient.clinical_notes && (
                <div className="modal-notes-snippet">
                  <strong>Intake Notes:</strong> {patient.clinical_notes}
                </div>
              )}
            </div>
          </div>

          {/* Bedside Vitals Grid */}
          <div className="modal-section">
            <h4 className="modal-section-title">Recorded Physiological Vital Signs</h4>
            <div className="modal-vitals-grid">
              <div className="modal-vital-chip">
                <Wind size={15} className="vital-chip-icon" />
                <span className="vital-chip-name">SpO2:</span>
                <span className={`vital-chip-val ${patient.vitals.spo2 != null && patient.vitals.spo2 < 92 ? 'val-danger' : ''}`}>
                  {patient.vitals.spo2 != null ? `${patient.vitals.spo2}%` : 'Not recorded'}
                </span>
              </div>

              <div className="modal-vital-chip">
                <Heart size={15} className="vital-chip-icon" />
                <span className="vital-chip-name">Pulse / HR:</span>
                <span className={`vital-chip-val ${patient.vitals.heart_rate != null && (patient.vitals.heart_rate > 120 || patient.vitals.heart_rate < 50) ? 'val-danger' : ''}`}>
                  {patient.vitals.heart_rate != null ? `${patient.vitals.heart_rate} bpm` : 'Not recorded'}
                </span>
              </div>

              <div className="modal-vital-chip">
                <Gauge size={15} className="vital-chip-icon" />
                <span className="vital-chip-name">Blood Pressure:</span>
                <span className={`vital-chip-val ${patient.vitals.systolic_bp != null && (patient.vitals.systolic_bp < 90 || patient.vitals.systolic_bp >= 160) ? 'val-danger' : ''}`}>
                  {patient.vitals.systolic_bp != null ? `${patient.vitals.systolic_bp}/${patient.vitals.diastolic_bp || '-'} mmHg` : 'Not recorded'}
                </span>
              </div>

              <div className="modal-vital-chip">
                <Wind size={15} className="vital-chip-icon" />
                <span className="vital-chip-name">Resp Rate:</span>
                <span className="vital-chip-val">
                  {patient.vitals.respiratory_rate != null ? `${patient.vitals.respiratory_rate}/min` : 'Not recorded'}
                </span>
              </div>

              <div className="modal-vital-chip">
                <Thermometer size={15} className="vital-chip-icon" />
                <span className="vital-chip-name">Temperature:</span>
                <span className="vital-chip-val">
                  {patient.vitals.temperature_f != null ? `${patient.vitals.temperature_f}°F` : 'Not recorded'}
                </span>
              </div>

              <div className="modal-vital-chip">
                <UserCheck size={15} className="vital-chip-icon" />
                <span className="vital-chip-name">AVPU Scale:</span>
                <span className={`vital-chip-val ${patient.vitals.avpu !== 'ALERT' ? 'val-danger' : ''}`}>
                  {patient.vitals.avpu}
                </span>
              </div>
            </div>
          </div>

          {/* Clinical Decision Rationale */}
          <div className="modal-section">
            <h4 className="modal-section-title">
              <ShieldAlert size={16} /> Clinical Risk Findings & Transparent Rationale
            </h4>
            <ul className="modal-rationale-list">
              {patient.assessment.clinical_rationale.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>

          {/* Prototype Disclosure Notice */}
          <div className="modal-prototype-notice">
            <Info size={14} className="notice-icon" />
            <p>
              {patient.assessment.disclaimer}
            </p>
          </div>
        </div>

        {/* Modal Footer & Status Quick Controls */}
        <div className="modal-footer">
          <div className="footer-status-indicator">
            Current Status: <strong>{patient.status.replace('_', ' ')}</strong>
          </div>

          <div className="footer-action-buttons">
            {patient.status !== 'WITH_DOCTOR' && (
              <button
                type="button"
                onClick={() => {
                  onUpdateStatus(patient.id, 'WITH_DOCTOR');
                  onClose();
                }}
                className="btn-call-doctor"
              >
                <Stethoscope size={15} />
                <span>Call into Doctor Room</span>
              </button>
            )}

            {patient.status !== 'NEEDS_HUMAN_REVIEW' && (
              <button
                type="button"
                onClick={() => {
                  onUpdateStatus(patient.id, 'NEEDS_HUMAN_REVIEW');
                  onClose();
                }}
                className="btn-flag-review"
              >
                <UserCheck size={15} />
                <span>Flag for Doctor Review</span>
              </button>
            )}

            {patient.status !== 'COMPLETED' && (
              <button
                type="button"
                onClick={() => {
                  onUpdateStatus(patient.id, 'COMPLETED');
                  onClose();
                }}
                className="btn-mark-complete"
              >
                <CheckCircle size={15} />
                <span>Mark Completed</span>
              </button>
            )}

            <button type="button" onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
