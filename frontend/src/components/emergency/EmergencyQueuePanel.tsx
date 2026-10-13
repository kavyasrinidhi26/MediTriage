import React from 'react';
import {
  Ambulance,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Building2,
  RefreshCw,
} from 'lucide-react';
import type { EmergencyCaseItem } from '../../types/triage';

interface EmergencyQueuePanelProps {
  cases: EmergencyCaseItem[];
  isLoading?: boolean;
  onSelectCase: (caseItem: EmergencyCaseItem) => void;
  onRefresh?: () => void;
  onIntakeClick?: () => void;
}

export const EmergencyQueuePanel: React.FC<EmergencyQueuePanelProps> = ({
  cases,
  isLoading = false,
  onSelectCase,
  onRefresh,
  onIntakeClick,
}) => {
  const formatElapsed = (mins: number) => {
    if (mins < 60) return `${mins}m in Bay`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RESPONSE_ACTIVATED':
        return { label: 'Response Activated', className: 'status-chip-activated' };
      case 'INITIAL_ASSESSMENT':
        return { label: 'Initial Assessment', className: 'status-chip-assessment' };
      case 'STABILIZATION_IN_PROGRESS':
        return { label: 'Stabilizing in Bay', className: 'status-chip-stabilizing' };
      case 'AWAITING_CLINICAL_DECISION':
        return { label: 'Awaiting Decision', className: 'status-chip-decision' };
      case 'TRANSFERRED':
        return { label: 'Transferred', className: 'status-chip-transferred' };
      case 'ADMITTED':
        return { label: 'Admitted ICU/OT', className: 'status-chip-admitted' };
      case 'COMPLETED':
        return { label: 'Completed', className: 'status-chip-completed' };
      default:
        return { label: status.replace(/_/g, ' '), className: 'status-chip-default' };
    }
  };

  return (
    <div className="emergency-queue-container" id="emergency-trauma-queue-section">
      {/* Panel Header */}
      <div className="emergency-queue-header">
        <div className="queue-header-left">
          <div className="emergency-icon-badge">
            <Ambulance size={20} className="text-white" />
          </div>
          <div>
            <div className="flex-row-center gap-2">
              <h2 className="emergency-queue-title">
                Active Trauma & Emergency Cases (Level 1 Response)
              </h2>
              <span className="emergency-count-badge">
                {cases.length} {cases.length === 1 ? 'Case' : 'Cases'} Active
              </span>
            </div>
            <p className="emergency-queue-sub">
              Preempts routine OPD queue. Direct bedside priority with zero administrative delays.
            </p>
          </div>
        </div>

        <div className="queue-header-right">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="top-navbar-refresh-btn"
              title="Refresh emergency cases"
              aria-label="Refresh emergency cases"
            >
              <RefreshCw size={14} className={isLoading ? 'spin-icon' : ''} />
            </button>
          )}
          {onIntakeClick && (
            <button
              type="button"
              onClick={onIntakeClick}
              className="emergency-quick-intake-btn"
              id="btn-panel-emergency-intake"
            >
              <Ambulance size={15} />
              <span>New Accident Intake</span>
            </button>
          )}
        </div>
      </div>

      {/* Emergency Cases List */}
      {cases.length === 0 ? (
        <div className="emergency-empty-state">
          <ShieldAlert size={28} className="text-navy-400" />
          <div className="empty-text">No active acute emergency cases in resuscitation bays.</div>
          <span className="empty-sub">Trauma team on standby. Routine OPD consultation continuing.</span>
        </div>
      ) : (
        <div className="emergency-cards-grid">
          {cases.map((c) => {
            const statusInfo = getStatusBadge(c.status);
            return (
              <div
                key={c.case_id}
                className="emergency-case-card"
                onClick={() => onSelectCase(c)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectCase(c);
                  }
                }}
                aria-label={`Open emergency case ${c.case_id}`}
              >
                {/* Top strip */}
                <div className="card-top-strip">
                  <div className="card-id-group">
                    <span className="case-id-tag">{c.case_id}</span>
                    <span className="case-urgency-tag">LEVEL 1 TRAUMA</span>
                  </div>
                  <div className="card-time-group">
                    <span className="elapsed-time-chip">
                      <Clock size={12} /> {formatElapsed(c.elapsed_minutes)}
                    </span>
                  </div>
                </div>

                {/* Patient Name / Identity */}
                <div className="card-patient-info">
                  <div className="patient-name-line">
                    <strong className="patient-display-name">
                      {c.patient_identity_status === 'KNOWN' && c.patient_name
                        ? c.patient_name
                        : 'Identity Not Yet Verified'}
                    </strong>
                    <span className="patient-demo-sub">
                      ({c.gender}, ~{c.approximate_age ?? '?'}y)
                    </span>
                  </div>
                  <div className="accident-mechanism-line">
                    <span className="accident-type-chip">
                      {c.accident_type.replace(/_/g, ' ')}
                    </span>
                    <span className="mechanism-preview" title={c.mechanism_of_injury || ''}>
                      {c.mechanism_of_injury || 'Acute high-impact accident'}
                    </span>
                  </div>
                </div>

                {/* Physiological Vitals Snapshot */}
                <div className="card-vitals-snapshot">
                  <span className="vital-pill">
                    Pulse: <strong>{c.pulse_bpm != null ? `${c.pulse_bpm}` : '—'}</strong>
                  </span>
                  <span className="vital-pill">
                    BP: <strong>{c.systolic_bp && c.diastolic_bp ? `${c.systolic_bp}/${c.diastolic_bp}` : '—'}</strong>
                  </span>
                  <span
                    className={`vital-pill ${
                      c.spo2 != null && c.spo2 < 90 ? 'vital-danger' : ''
                    }`}
                  >
                    SpO2: <strong>{c.spo2 != null ? `${c.spo2}%` : '—'}</strong>
                  </span>
                  <span className="vital-pill">
                    GCS: <strong>{c.gcs_score != null ? `${c.gcs_score}` : '—'}</strong>
                  </span>
                </div>

                {/* Red Flags Preview */}
                {c.red_flags && c.red_flags.length > 0 && (
                  <div className="card-redflags-row">
                    <AlertTriangle size={13} className="text-emergency-red flex-shrink-0" />
                    <span className="redflags-preview-text">
                      {c.red_flags.slice(0, 2).join(' • ')}
                      {c.red_flags.length > 2 ? ` (+${c.red_flags.length - 2} more)` : ''}
                    </span>
                  </div>
                )}

                {/* Bottom Bar: Bay, Status, Open Action */}
                <div className="card-footer-bar">
                  <div className="bay-allocated">
                    <Building2 size={13} />
                    <span>{c.assigned_resuscitation_bay || 'Red Bay 01'}</span>
                  </div>
                  <div className="footer-right-actions">
                    <span className={`status-badge ${statusInfo.className}`}>
                      {statusInfo.label}
                    </span>
                    <button
                      type="button"
                      className="open-case-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCase(c);
                      }}
                      title="Open rapid assessment details"
                    >
                      <span>Assess</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
