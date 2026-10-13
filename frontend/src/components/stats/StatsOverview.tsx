import React from 'react';
import type { QueueSummaryStats } from '../../types/triage';
import { Users, AlertTriangle, CheckCircle, Clock, Stethoscope, Activity } from 'lucide-react';

interface StatsOverviewProps {
  stats: QueueSummaryStats | null;
  isLoading?: boolean;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats, isLoading = false }) => {
  if (isLoading || !stats) {
    return <div className="stats-loading">Loading hospital queue metrics...</div>;
  }

  const statCards = [
    {
      label: 'Emergency (Red)',
      value: stats.emergency_count,
      subtext: 'Immediate resuscitation / casualty transfer',
      cssClass: 'stat-card-emergency',
      icon: AlertTriangle,
    },
    {
      label: 'Priority (Yellow)',
      value: stats.priority_count,
      subtext: 'Fast-track urgent consultation',
      cssClass: 'stat-card-priority',
      icon: Clock,
    },
    {
      label: 'Routine (Green)',
      value: stats.routine_count,
      subtext: 'Standard OPD consultation queue',
      cssClass: 'stat-card-routine',
      icon: CheckCircle,
    },
    {
      label: 'Currently Waiting',
      value: stats.waiting_count,
      subtext: 'Pending consultation in waiting halls',
      cssClass: 'stat-card-waiting',
      icon: Users,
    },
    {
      label: 'With Doctor',
      value: stats.with_doctor_count,
      subtext: 'Currently inside consultation rooms',
      cssClass: 'stat-card-active',
      icon: Stethoscope,
    },
    {
      label: 'Completed / Discharged',
      value: stats.completed_count,
      subtext: 'Triaged and treated patients',
      cssClass: 'stat-card-completed',
      icon: Activity,
    },
  ];

  return (
    <div className="stats-container">
      {/* High-level Triage Stat Cards */}
      <div className="stats-grid-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`stat-card ${card.cssClass}`}>
              <div className="stat-card-top">
                <span className="stat-card-label">{card.label}</span>
                <Icon size={18} className="stat-icon" />
              </div>
              <div className="stat-card-value">{card.value}</div>
              <div className="stat-card-subtext">{card.subtext}</div>
            </div>
          );
        })}
      </div>

      {/* Department Breakdown */}
      <div className="dept-breakdown-card">
        <h3 className="section-title">OPD Specialty Department Distribution</h3>
        <p className="section-description">
          Real-time patient distribution across hospital outpatient specialty wings.
        </p>

        <div className="dept-bars-grid">
          {Object.entries(stats.departments_breakdown).length === 0 ? (
            <div className="text-muted">No department traffic recorded yet.</div>
          ) : (
            Object.entries(stats.departments_breakdown).map(([dept, count]) => {
              const pct = stats.total_patients > 0 ? Math.round((count / stats.total_patients) * 100) : 0;
              return (
                <div key={dept} className="dept-stat-row">
                  <div className="dept-label-row">
                    <span className="dept-name">{dept}</span>
                    <span className="dept-count">
                      {count} patient{count > 1 ? 's' : ''} ({pct}%)
                    </span>
                  </div>
                  <div className="dept-progress-bar-bg">
                    <div
                      className="dept-progress-bar-fill"
                      style={{ width: `${Math.max(pct, 5)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
