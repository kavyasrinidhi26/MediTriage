import React, { useState } from 'react';
import type { PatientQueueItem, QueueStatus } from '../../types/triage';
import { Badge } from '../common/Badge';
import { UserCheck, CheckCircle2, ChevronDown, ChevronUp, AlertCircle, Building2, Clock } from 'lucide-react';

interface QueueTableProps {
  items: PatientQueueItem[];
  onStatusChange: (id: string, newStatus: QueueStatus, doctorRoom?: string) => void;
  isUpdating?: boolean;
}

export const QueueTable: React.FC<QueueTableProps> = ({
  items,
  onStatusChange,
  isUpdating = false,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [roomInputs, setRoomInputs] = useState<Record<string, string>>({});

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleRoomChange = (id: string, val: string) => {
    setRoomInputs((prev) => ({ ...prev, [id]: val }));
  };

  if (items.length === 0) {
    return (
      <div className="empty-queue-card">
        <AlertCircle size={32} className="empty-icon" />
        <h4 className="empty-heading">No Patients Found in Triage Queue</h4>
        <p className="empty-text">
          Adjust your filter criteria or use the Triage Intake tab to register incoming OPD patients.
        </p>
      </div>
    );
  }

  return (
    <div className="queue-list-container">
      {items.map((item) => {
        const isExpanded = expandedId === item.id;
        const isEmergency = item.assessment.triage_category === 'EMERGENCY';
        const isPriority = item.assessment.triage_category === 'PRIORITY';

        const rowCardClass = isEmergency
          ? 'queue-card-emergency'
          : isPriority
          ? 'queue-card-priority'
          : 'queue-card-routine';

        return (
          <div key={item.id} className={`queue-patient-card ${rowCardClass}`}>
            <div className="queue-card-main-row">
              {/* Token column */}
              <div className="queue-token-column">
                <span className="token-label">TOKEN</span>
                <span className="token-value">{item.token_number}</span>
                <span className="priority-rank-badge">
                  Score {item.assessment.urgency_score}/10
                </span>
              </div>

              {/* Patient info column */}
              <div className="queue-info-column">
                <div className="patient-headline">
                  <span className="patient-name-text">{item.patient_name}</span>
                  <span className="patient-demographics">
                    {item.age} yrs • {item.gender}
                  </span>
                  {item.opd_registration_number && (
                    <span className="uhid-chip">{item.opd_registration_number}</span>
                  )}
                </div>

                <div className="patient-complaint-snippet">
                  <strong>Complaint:</strong> {item.chief_complaint}
                </div>

                {/* Vitals summary bar */}
                <div className="vitals-summary-tags">
                  {item.vitals.spo2 != null && !isNaN(item.vitals.spo2) && (
                    <span className={`vital-pill ${item.vitals.spo2 < 90 ? 'vital-alert' : ''}`}>
                      SpO2: {item.vitals.spo2}%
                    </span>
                  )}
                  {item.vitals.heart_rate != null && !isNaN(item.vitals.heart_rate) && (
                    <span className={`vital-pill ${item.vitals.heart_rate > 120 || item.vitals.heart_rate < 50 ? 'vital-alert' : ''}`}>
                      HR: {item.vitals.heart_rate} bpm
                    </span>
                  )}
                  {item.vitals.systolic_bp != null && !isNaN(item.vitals.systolic_bp) && (
                    <span className={`vital-pill ${item.vitals.systolic_bp < 90 || item.vitals.systolic_bp >= 180 ? 'vital-alert' : ''}`}>
                      BP: {item.vitals.systolic_bp}/{item.vitals.diastolic_bp != null ? item.vitals.diastolic_bp : '-'}
                    </span>
                  )}
                  {item.vitals.respiratory_rate != null && !isNaN(item.vitals.respiratory_rate) && (
                    <span className={`vital-pill ${item.vitals.respiratory_rate > 28 ? 'vital-alert' : ''}`}>
                      RR: {item.vitals.respiratory_rate}/min
                    </span>
                  )}
                  {item.vitals.temperature_f != null && !isNaN(item.vitals.temperature_f) && (
                    <span className="vital-pill">
                      Temp: {item.vitals.temperature_f}°F
                    </span>
                  )}
                </div>
              </div>

              {/* Triage & Department Column */}
              <div className="queue-triage-column">
                <Badge type="category" category={item.assessment.triage_category} />
                <div className="dept-badge-row">
                  <Building2 size={14} />
                  <span>{item.assessment.recommended_department}</span>
                </div>
                <div className="wait-rec-row">
                  <Clock size={13} />
                  <span>
                    {item.assessment.max_recommended_wait_minutes === 0
                      ? 'Immediate'
                      : `≤ ${item.assessment.max_recommended_wait_minutes}m`}
                  </span>
                </div>
              </div>

              {/* Status and Action Controls */}
              <div className="queue-action-column">
                <Badge type="status" status={item.status} />

                {item.status === 'WAITING' && (
                  <div className="action-button-group">
                    <input
                      type="text"
                      placeholder="Doctor Room #"
                      value={roomInputs[item.id] || ''}
                      onChange={(e) => handleRoomChange(item.id, e.target.value)}
                      className="room-input-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onStatusChange(item.id, 'WITH_DOCTOR', roomInputs[item.id] || 'OPD Room 1')
                      }
                      disabled={isUpdating}
                      className="btn-action-primary"
                      title="Call to doctor"
                    >
                      <UserCheck size={14} />
                      <span>Call Next</span>
                    </button>
                  </div>
                )}

                {item.status === 'WITH_DOCTOR' && (
                  <button
                    type="button"
                    onClick={() => onStatusChange(item.id, 'COMPLETED')}
                    disabled={isUpdating}
                    className="btn-action-success"
                    title="Mark consultation completed"
                  >
                    <CheckCircle2 size={14} />
                    <span>Complete</span>
                  </button>
                )}

                {item.status === 'NEEDS_HUMAN_REVIEW' && (
                  <button
                    type="button"
                    onClick={() => onStatusChange(item.id, 'WITH_DOCTOR', 'Doctor Bedside Review')}
                    disabled={isUpdating}
                    className="btn-action-primary"
                    title="Initiate doctor review"
                  >
                    <UserCheck size={14} />
                    <span>Doctor Review</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => toggleExpand(item.id)}
                  className="btn-expand-toggle"
                  aria-label="Toggle clinical details"
                >
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </div>

            {/* Accordion Clinical Details */}
            {isExpanded && (
              <div className="queue-card-expanded-body">
                <div className="expanded-grid">
                  <div>
                    <h5 className="sub-heading">Clinical Risk Findings:</h5>
                    <ul className="details-list">
                      {item.assessment.clinical_rationale.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h5 className="sub-heading">Intake Information & Notes:</h5>
                    <p className="detail-line">
                      <strong>Registered at:</strong>{' '}
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </p>
                    {item.clinical_notes && (
                      <p className="detail-line">
                        <strong>Counter Notes:</strong> {item.clinical_notes}
                      </p>
                    )}
                    <p className="detail-line">
                      <strong>Directive:</strong> {item.assessment.recommended_action}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
