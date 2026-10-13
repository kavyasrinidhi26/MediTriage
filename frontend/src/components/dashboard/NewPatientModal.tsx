import React from 'react';
import { X, UserPlus, Sparkles } from 'lucide-react';
import { NurseIntakeForm } from '../intake/NurseIntakeForm';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientEnrolled?: (token: string) => void;
}

export const NewPatientModal: React.FC<NewPatientModalProps> = ({
  isOpen,
  onClose,
  onPatientEnrolled,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card modal-large-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header modal-header-intake">
          <div className="modal-title-section">
            <div className="intake-badge-row">
              <span className="modal-token-badge">Rapid Intake Desk</span>
              <span className="modal-synthetic-pill">
                <Sparkles size={11} /> Synthetic Testing Mode
              </span>
            </div>
            <h2 className="modal-patient-name">Register & Triage New OPD Patient</h2>
            <div className="modal-patient-sub">
              Enter bedside physiological vitals and symptoms to compute instant acuity level.
            </div>
          </div>
          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label="Close intake modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="modal-body-scrollable">
          <NurseIntakeForm
            onSuccess={(response) => {
              onPatientEnrolled?.(response.token_number);
            }}
            onReturnToQueue={onClose}
          />
        </div>

        <div className="modal-footer">
          <div className="footer-status-indicator">
            <UserPlus size={14} style={{ display: 'inline', marginRight: 4 }} />
            <span>Fill required demographics and complaints to enroll into queue</span>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary">
            Close Intake Window
          </button>
        </div>
      </div>
    </div>
  );
};
