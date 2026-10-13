import React from 'react';
import { AlertTriangle, ShieldAlert, CheckCircle2, Info } from 'lucide-react';

export interface StatusPanelProps {
  level: 'emergency' | 'warning' | 'success' | 'info';
  title: string;
  description: string;
  count?: number;
  badgeLabel?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * StatusPanel — Cult UI inspired status panel with animated halo indicator.
 * Provides accessible, high-visibility clinical status notifications with
 * distinct color-coded halo pulses for triage alerts.
 */
export const StatusPanel: React.FC<StatusPanelProps> = ({
  level,
  title,
  description,
  count,
  badgeLabel,
  action,
  className = '',
}) => {
  const getIcon = () => {
    switch (level) {
      case 'emergency':
        return <AlertTriangle size={20} className="cult-status-icon-emergency" />;
      case 'warning':
        return <ShieldAlert size={20} className="cult-status-icon-warning" />;
      case 'success':
        return <CheckCircle2 size={20} className="cult-status-icon-success" />;
      default:
        return <Info size={20} className="cult-status-icon-info" />;
    }
  };

  return (
    <div
      role="alert"
      aria-live={level === 'emergency' ? 'assertive' : 'polite'}
      className={`cult-status-panel cult-status-${level} ${className}`}
    >
      <div className="cult-status-halo-wrapper">
        <span className="cult-status-halo-ping" />
        <span className="cult-status-halo-dot" />
      </div>

      <div className="cult-status-icon-box">{getIcon()}</div>

      <div className="cult-status-content">
        <div className="cult-status-header-row">
          <span className="cult-status-title">{title}</span>
          {count != null && count > 0 && (
            <span className="cult-status-count-pill">
              {count} {count === 1 ? 'Patient' : 'Patients'}
            </span>
          )}
          {badgeLabel && <span className="cult-status-badge">{badgeLabel}</span>}
        </div>
        <p className="cult-status-desc">{description}</p>
      </div>

      {action && <div className="cult-status-action">{action}</div>}
    </div>
  );
};

export default StatusPanel;
