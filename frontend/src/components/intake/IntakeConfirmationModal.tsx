import React, { useState } from 'react';
import type {
  NewPatientIntakeData,
  IntakeValidationResult,
} from '../../types/triage';
import { toFahrenheit, toCelsius } from '../../services/intakeValidation';
import {
  AlertTriangle,
  AlertOctagon,
  X,
  ArrowLeft,
  Send,
  Info,
  Clock,
  User,
  Activity,
  FileText,
  ShieldAlert,
} from 'lucide-react';

interface IntakeConfirmationModalProps {
  data: NewPatientIntakeData;
  validation: IntakeValidationResult;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isSubmitting: boolean;
}

export const IntakeConfirmationModal: React.FC<IntakeConfirmationModalProps> = ({
  data,
  validation,
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
}) => {
  const [safetyCheckConfirmed, setSafetyCheckConfirmed] = useState(false);

  if (!isOpen) return null;

  const hasPulseZero = validation.alerts.some((a) => a.code === 'CRITICAL_PULSE_ZERO');
  const tempF = data.temperature !== null ? toFahrenheit(data.temperature, data.temperature_unit) : null;
  const tempC = data.temperature !== null ? toCelsius(data.temperature, data.temperature_unit) : null;

  const canSubmit = !hasPulseZero || safetyCheckConfirmed;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirmation-modal-title">
      <div className="modal-content confirmation-modal-card">
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-header-text">
            <h2 id="confirmation-modal-title" className="modal-title">
              Confirm Patient Intake Submission
            </h2>
            <p className="modal-subtitle">
              Verify recorded patient details and clinical verification notices before enrolling into the triage queue.
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close confirmation dialog"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body confirmation-modal-body">
          {/* CRITICAL PULSE ZERO SAFETY NOTICE */}
          {hasPulseZero && (
            <div className="critical-safety-box pulse-zero-alert" role="alert">
              <div className="safety-box-header">
                <AlertOctagon size={24} className="safety-alert-icon animate-pulse" />
                <div>
                  <h3 className="safety-box-title">CRITICAL SAFETY ALERT: Pulse Entered as 0 bpm</h3>
                  <p className="safety-box-subtitle">
                    Possible Pulselessness / Cardiac Arrest. This is NOT treated as missing data.
                  </p>
                </div>
              </div>
              <div className="safety-box-instructions">
                <strong>Configured Safety Protocol:</strong>
                <ul>
                  <li>Immediately check central carotid pulse on the patient.</li>
                  <li>If pulselessness is confirmed, initiate CPR and activate Emergency Code Blue immediately.</li>
                  <li>If patient is alert and conversing, re-verify pulse manually and update the record.</li>
                </ul>
              </div>
              <label className="safety-acknowledgement-checkbox">
                <input
                  type="checkbox"
                  checked={safetyCheckConfirmed}
                  onChange={(e) => setSafetyCheckConfirmed(e.target.checked)}
                />
                <span>
                  <strong>Nurse Safety Acknowledgment:</strong> I have physically verified the patient's carotid pulse and initiated the required clinical safety protocol.
                </span>
              </label>
            </div>
          )}

          {/* CLINICAL VERIFICATION ALERTS LIST */}
          {validation.alerts.length > 0 && !hasPulseZero && (
            <div className="clinical-alerts-summary">
              <div className="alerts-summary-title">
                <AlertTriangle size={18} className="text-amber-600" />
                <span>Clinical Verification Warnings Detected ({validation.alerts.length})</span>
              </div>
              <div className="alerts-summary-list">
                {validation.alerts.map((alert, idx) => (
                  <div key={idx} className={`alert-pill-item ${alert.severity}`}>
                    <strong>{alert.message}</strong>
                    <p>{alert.safetyProtocol}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PATIENT DEMOGRAPHICS SUMMARY */}
          <div className="confirmation-section">
            <h4 className="section-label">
              <User size={16} />
              <span>Patient Identification & Demographics</span>
            </h4>
            <div className="summary-grid-3">
              <div className="summary-data-card">
                <span className="data-title">Demo Patient ID</span>
                <span className="data-val font-mono">{data.patient_id}</span>
              </div>
              <div className="summary-data-card">
                <span className="data-title">Patient Name</span>
                <span className="data-val">{data.patient_name || 'Anonymous OPD Patient'}</span>
              </div>
              <div className="summary-data-card">
                <span className="data-title">Age / Sex</span>
                <span className="data-val">
                  {data.age} yrs • {data.sex}
                </span>
              </div>
              <div className="summary-data-card">
                <span className="data-title">Arrival Time</span>
                <span className="data-val flex-center gap-1">
                  <Clock size={14} /> {data.arrival_time}
                </span>
              </div>
              <div className="summary-data-card">
                <span className="data-title">Complaint Language</span>
                <span className="data-val badge-lang">{data.complaint_language}</span>
              </div>
            </div>
          </div>

          {/* PRESENTING SYMPTOMS & MEDICAL HISTORY */}
          <div className="confirmation-section">
            <h4 className="section-label">
              <FileText size={16} />
              <span>Symptoms & Medical History (Preserved Verbatim)</span>
            </h4>
            <div className="verbatim-complaint-box">
              <div className="verbatim-label">
                Chief Complaint (in patient's own words — {data.complaint_language}):
              </div>
              <p className="verbatim-text">"{data.chief_complaint}"</p>
            </div>

            <div className="summary-grid-2 mt-3">
              <div className="summary-data-card">
                <span className="data-title">Known Medical Conditions</span>
                <span className="data-val">
                  {data.known_conditions.length > 0 ? data.known_conditions.join(', ') : 'None Reported'}
                </span>
              </div>
              <div className="summary-data-card">
                <span className="data-title">Current Medications</span>
                <span className="data-val">{data.medications || 'None Reported'}</span>
              </div>
            </div>
          </div>

          {/* VITAL SIGNS INSPECTION */}
          <div className="confirmation-section">
            <h4 className="section-label">
              <Activity size={16} />
              <span>Vital Signs Recorded at Intake</span>
            </h4>
            <div className="vitals-inspection-grid">
              <div className={`vital-inspect-card ${data.systolic_bp !== null ? (data.systolic_bp < 90 ? 'critical' : 'normal') : 'missing'}`}>
                <span className="inspect-title">Blood Pressure</span>
                <span className="inspect-val">
                  {data.systolic_bp !== null && data.diastolic_bp !== null
                    ? `${data.systolic_bp}/${data.diastolic_bp} mmHg`
                    : 'Not Recorded'}
                </span>
                <span className="inspect-sub">
                  {data.systolic_bp !== null ? (data.systolic_bp < 90 ? 'Hypotension' : 'Recorded') : 'Genuinely Missing'}
                </span>
              </div>

              <div className={`vital-inspect-card ${data.pulse_bpm !== null ? (data.pulse_bpm === 0 ? 'critical' : data.pulse_bpm > 130 ? 'warning' : 'normal') : 'missing'}`}>
                <span className="inspect-title">Pulse / Heart Rate</span>
                <span className="inspect-val">
                  {data.pulse_bpm !== null ? `${data.pulse_bpm} bpm` : 'Not Recorded'}
                </span>
                <span className="inspect-sub">
                  {data.pulse_bpm === 0
                    ? '🚨 0 bpm (Pulseless)'
                    : data.pulse_bpm !== null
                    ? 'Recorded'
                    : 'Genuinely Missing'}
                </span>
              </div>

              <div className={`vital-inspect-card ${data.temperature !== null ? (tempF === 96.0 ? 'warning' : 'normal') : 'missing'}`}>
                <span className="inspect-title">Body Temperature</span>
                <span className="inspect-val">
                  {data.temperature !== null
                    ? `${data.temperature}°${data.temperature_unit} (${tempF}°F / ${tempC}°C)`
                    : 'Not Recorded'}
                </span>
                <span className="inspect-sub">
                  {tempF === 96.0
                    ? '⚠️ 96°F (Verification Flag)'
                    : data.temperature !== null
                    ? 'Recorded'
                    : 'Genuinely Missing'}
                </span>
              </div>

              <div className={`vital-inspect-card ${data.spo2 !== null ? (data.spo2 < 90 ? 'critical' : 'normal') : 'missing'}`}>
                <span className="inspect-title">SpO2 Oxygen</span>
                <span className="inspect-val">
                  {data.spo2 !== null ? `${data.spo2}%` : 'Not Recorded'}
                </span>
                <span className="inspect-sub">
                  {data.spo2 !== null
                    ? data.spo2 < 90
                      ? 'Severe Hypoxemia'
                      : 'Recorded'
                    : 'Genuinely Missing'}
                </span>
              </div>
            </div>
          </div>

          {/* MISSING MEASUREMENTS EXPLICIT NOTICE */}
          {validation.missingMeasurements.length > 0 && (
            <div className="missing-measurements-panel">
              <div className="missing-panel-header">
                <Info size={16} />
                <span>Measurements Genuinely Missing ({validation.missingMeasurements.length})</span>
              </div>
              <p className="missing-panel-desc">
                The following vital signs were not recorded during intake. They will be registered as unavailable and <strong>will NEVER be silently converted to normal values</strong>:
              </p>
              <ul className="missing-items-list">
                {validation.missingMeasurements.map((m, idx) => (
                  <li key={idx}>
                    <strong>{m.label}:</strong> {m.explanation}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* PROTOCOL DISCLAIMER */}
          <div className="protocol-notice-box">
            <ShieldAlert size={16} />
            <span>
              <strong>Triage Policy:</strong> No real clinical triage level is assigned at intake. The patient record is enrolled into the OPD queue with status <strong>WAITING</strong> for medical officer triage evaluation.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary flex-center gap-1"
            onClick={onClose}
            disabled={isSubmitting}
          >
            <ArrowLeft size={16} />
            <span>Back to Edit Form</span>
          </button>
          <button
            type="button"
            className={`btn btn-primary flex-center gap-2 ${!canSubmit ? 'btn-disabled' : ''}`}
            onClick={onConfirm}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="loading-spinner-small" />
                <span>Submitting Intake...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>Confirm & Submit for Assessment</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
