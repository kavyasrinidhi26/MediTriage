import React from 'react';
import type { TriageCategory, QueueStatus } from '../../types/triage';

interface BadgeProps {
  type?: 'category' | 'status' | 'custom';
  category?: TriageCategory;
  status?: QueueStatus;
  label?: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  type = 'category',
  category,
  status,
  label,
  className = '',
}) => {
  if (type === 'category' && category) {
    const configMap: Record<TriageCategory, { text: string; cssClass: string }> = {
      EMERGENCY: { text: 'RED • EMERGENCY', cssClass: 'badge-emergency' },
      PRIORITY: { text: 'YELLOW • PRIORITY', cssClass: 'badge-priority' },
      ROUTINE: { text: 'GREEN • ROUTINE', cssClass: 'badge-routine' },
    };
    const config = configMap[category] || { text: category, cssClass: 'badge-routine' };
    return <span className={`badge ${config.cssClass} ${className}`}>{config.text}</span>;
  }

  if (type === 'status' && status) {
    const statusMap: Record<QueueStatus, { text: string; cssClass: string }> = {
      WAITING: { text: 'Waiting', cssClass: 'badge-status-waiting' },
      WITH_DOCTOR: { text: 'With Doctor', cssClass: 'badge-status-doctor' },
      NEEDS_HUMAN_REVIEW: { text: 'Needs Review', cssClass: 'badge-status-review' },
      COMPLETED: { text: 'Completed', cssClass: 'badge-status-completed' },
      TRANSFERRED_EMERGENCY: { text: 'Casualty Transfer', cssClass: 'badge-status-transfer' },
    };
    const config = statusMap[status] || { text: status, cssClass: 'badge-status-waiting' };
    return <span className={`badge ${config.cssClass} ${className}`}>{config.text}</span>;
  }

  return <span className={`badge badge-default ${className}`}>{label}</span>;
};
