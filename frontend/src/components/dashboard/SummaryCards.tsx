import React from 'react';
import {
  Users,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Calendar,
  Building2,
  Stethoscope,
  Wind,
  Heart,
  Activity,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { DashboardSummaryMetrics } from '../../types/triage';
import { SpotlightCard } from '../ui/SpotlightCard';

export interface SummaryCardMetrics extends DashboardSummaryMetrics {
  patients_today?: number;
  total_registered_patients?: number;
  currently_waiting?: number;
  hospital_timezone?: string;
  active_emergency_cases?: number;
  today_emergency_cases?: number;
  total_recorded_emergency_cases?: number;
  emergency_cases?: number;
  priority_cases?: number;
  routine_cases?: number;
}

export interface DepartmentSummaryItem {
  department: string;
  count: number;
  emergencyCount?: number;
}

interface SummaryCardsProps {
  metrics: SummaryCardMetrics;
  departments?: DepartmentSummaryItem[];
  activeFilter?: string;
  onCardClick?: (filterType: string) => void;
  isLoading?: boolean;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  metrics,
  departments = [],
  activeFilter,
  onCardClick,
  isLoading = false,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const emergencyCount = metrics.emergency_cases ?? metrics.high_priority_cases;
  const priorityCount = metrics.priority_cases ?? Math.max(0, metrics.high_priority_cases - (metrics.emergency_cases ?? 0));
  const routineCount = metrics.routine_cases ?? Math.max(0, metrics.total_patients - (metrics.high_priority_cases ?? 0));

  const patientsTodayCount = metrics.patients_today ?? metrics.total_patients;
  const totalRegisteredCount = metrics.total_registered_patients ?? metrics.total_patients;
  const currentlyWaitingCount = metrics.currently_waiting ?? metrics.awaiting_review_cases;
  const activeEmergenciesCount = metrics.active_emergency_cases ?? emergencyCount;

  // Canonical Specialty Departments with icons
  const defaultDepartmentConfig: Array<{ name: string; icon: any }> = [
    { name: 'Casualty / Emergency', icon: AlertTriangle },
    { name: 'General Medicine', icon: Stethoscope },
    { name: 'Pulmonology', icon: Wind },
    { name: 'Cardiology', icon: Heart },
    { name: 'Pediatrics', icon: Activity },
    { name: 'Orthopedics', icon: Building2 },
  ];

  const deptMap = new Map<string, number>();
  departments.forEach((d) => deptMap.set(d.department.toLowerCase(), d.count));

  const displayDepartments = defaultDepartmentConfig.map((cfg) => {
    let count = deptMap.get(cfg.name.toLowerCase()) ?? 0;
    if (count === 0 && cfg.name.includes('/')) {
      count = deptMap.get('casualty') ?? deptMap.get('emergency') ?? 0;
    }
    return {
      name: cfg.name,
      icon: cfg.icon,
      count,
    };
  });

  const cards = [
    {
      id: 'today',
      title: 'Patients Today',
      value: patientsTodayCount,
      subtext: `Arrival & intake volume today (${metrics.hospital_timezone || 'Asia/Kolkata'})`,
      icon: Calendar,
      cardClass: 'metric-card-total',
      badgeText: 'Calendar Day',
      badgeClass: 'metric-badge-total',
      spotlightColor: 'rgba(13, 148, 136, 0.16)',
    },
    {
      id: 'all',
      title: 'Total Patients',
      value: totalRegisteredCount,
      subtext: 'All outpatient records stored in database',
      icon: Users,
      cardClass: 'metric-card-review',
      badgeText: 'Database Total',
      badgeClass: 'metric-badge-review',
      spotlightColor: 'rgba(139, 92, 246, 0.16)',
    },
    {
      id: 'WAITING',
      title: 'Waiting Patients',
      value: currentlyWaitingCount,
      subtext: 'Active OPD queue awaiting consultation',
      icon: Clock,
      cardClass: 'metric-card-awaiting',
      badgeText: 'Active Queue',
      badgeClass: 'metric-badge-warning',
      spotlightColor: 'rgba(245, 158, 11, 0.18)',
    },
    {
      id: 'EMERGENCY',
      title: 'Critical Patients',
      value: activeEmergenciesCount,
      subtext: `${metrics.today_emergency_cases ?? 0} today • ${metrics.total_recorded_emergency_cases ?? 0} total recorded`,
      icon: AlertTriangle,
      cardClass: 'metric-card-priority',
      badgeText: 'Level 1 • Critical',
      badgeClass: 'metric-badge-danger',
      spotlightColor: 'rgba(239, 68, 68, 0.18)',
    },
    {
      id: 'PRIORITY',
      title: 'Priority Cases',
      value: priorityCount,
      subtext: 'Level 2 urgent clinical evaluation',
      icon: Clock,
      cardClass: 'metric-card-awaiting',
      badgeText: 'Level 2 • Urgent',
      badgeClass: 'metric-badge-warning',
      spotlightColor: 'rgba(245, 158, 11, 0.18)',
    },
    {
      id: 'ROUTINE',
      title: 'Routine Cases',
      value: routineCount,
      subtext: 'Level 3-5 standard outpatient queue',
      icon: Users,
      cardClass: 'metric-card-total',
      badgeText: 'Level 3-5 • Routine',
      badgeClass: 'metric-badge-total',
      spotlightColor: 'rgba(16, 185, 129, 0.18)',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.25,
        ease: 'easeOut' as const,
      },
    },
  };

  return (
    <div className="summary-cards-wrapper">
      <motion.div
        className="summary-cards-grid"
        variants={containerVariants}
        initial={shouldReduceMotion ? false : 'hidden'}
        animate="visible"
      >
        {cards.map((card) => {
          const Icon = card.icon;
          const isSelected = activeFilter === card.id;

          return (
            <motion.div
              key={card.id}
              variants={itemVariants}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <SpotlightCard
                spotlightColor={card.spotlightColor}
                onClick={() => onCardClick?.(card.id)}
                className={`summary-card ${card.cardClass} ${isSelected ? 'summary-card-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${card.title}: ${card.value} patients`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onCardClick?.(card.id);
                  }
                }}
              >
                <div className="summary-card-header">
                  <span className="summary-card-title">{card.title}</span>
                  <div className="summary-card-icon-box">
                    <Icon size={18} />
                  </div>
                </div>

                <div className="summary-card-body">
                  <div className="summary-card-value">
                    {isLoading ? (
                      <motion.span
                        className="skeleton-num"
                        animate={shouldReduceMotion ? undefined : { opacity: [0.4, 0.9, 0.4] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        --
                      </motion.span>
                    ) : (
                      <motion.span
                        key={card.value}
                        initial={shouldReduceMotion ? false : { opacity: 0.6 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        {card.value}
                      </motion.span>
                    )}
                  </div>
                  <span className={`summary-card-pill ${card.badgeClass}`}>
                    {card.badgeText}
                  </span>
                </div>

                <div className="summary-card-footer">
                  <span className="summary-card-subtext">{card.subtext}</span>
                  <span className="summary-card-action">
                    Filter <ArrowUpRight size={12} />
                  </span>
                </div>
              </SpotlightCard>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Triage Urgency Level Filter Strip */}
      <div
        className="summary-acuity-strip"
        style={{
          display: 'flex',
          gap: '10px',
          marginTop: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          padding: '8px 12px',
          background: 'var(--navy-50, #f8fafc)',
          borderRadius: '8px',
          border: '1px solid var(--navy-200, #e2e8f0)',
        }}
      >
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--navy-600, #475569)', marginRight: '4px' }}>
          Triage Urgency Breakdown:
        </span>
        <button
          type="button"
          onClick={() => onCardClick?.('EMERGENCY')}
          className={`summary-pill-btn ${activeFilter === 'EMERGENCY' ? 'active' : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.725rem',
            fontWeight: 600,
            backgroundColor: 'var(--emergency-bg, #fef2f2)',
            color: 'var(--emergency-red-dark, #991b1b)',
            border: activeFilter === 'EMERGENCY' ? '2px solid #ef4444' : '1px solid var(--emergency-border, #fecaca)',
            cursor: 'pointer',
          }}
          aria-label={`Filter Emergency: ${emergencyCount}`}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444' }} />
          Level 1 Emergency: {emergencyCount}
        </button>
        <button
          type="button"
          onClick={() => onCardClick?.('PRIORITY')}
          className={`summary-pill-btn ${activeFilter === 'PRIORITY' ? 'active' : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.725rem',
            fontWeight: 600,
            backgroundColor: 'var(--priority-bg, #fffbeb)',
            color: 'var(--priority-amber-dark, #92400e)',
            border: activeFilter === 'PRIORITY' ? '2px solid #f59e0b' : '1px solid var(--priority-border, #fde68a)',
            cursor: 'pointer',
          }}
          aria-label={`Filter Priority: ${priorityCount}`}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
          Level 2 Priority: {priorityCount}
        </button>
        <button
          type="button"
          onClick={() => onCardClick?.('ROUTINE')}
          className={`summary-pill-btn ${activeFilter === 'ROUTINE' ? 'active' : ''}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.725rem',
            fontWeight: 600,
            backgroundColor: 'var(--teal-50, #f0fdf4)',
            color: 'var(--teal-800, #166534)',
            border: activeFilter === 'ROUTINE' ? '2px solid #10b981' : '1px solid var(--teal-200, #bbf7d0)',
            cursor: 'pointer',
          }}
          aria-label={`Filter Routine: ${routineCount}`}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981' }} />
          Level 3-5 Routine: {routineCount}
        </button>
      </div>

      {/* OPD Department Specialty Cards */}
      <div className="department-summary-section" style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={16} style={{ color: 'var(--teal-600)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--navy-900)' }}>
              Hospital Department Specialty Queues
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>
              (Click any department card to view assigned patients)
            </span>
          </div>
        </div>

        <div className="department-cards-grid">
          {displayDepartments.map((dept) => {
            const isDeptSelected = activeFilter === `dept:${dept.name}`;
            const DeptIcon = dept.icon || Building2;
            return (
              <div
                key={dept.name}
                className={`department-summary-card ${isDeptSelected ? 'dept-card-selected' : ''}`}
                onClick={() => onCardClick?.(`dept:${dept.name}`)}
                role="button"
                tabIndex={0}
                aria-label={`${dept.name}: ${dept.count} patients`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onCardClick?.(`dept:${dept.name}`);
                  }
                }}
              >
                <div className="dept-card-top">
                  <div className="dept-card-icon-box">
                    <DeptIcon size={16} />
                  </div>
                  <span className="dept-card-badge">
                    {dept.count} {dept.count === 1 ? 'Patient' : 'Patients'}
                  </span>
                </div>
                <div className="dept-card-title">{dept.name}</div>
                <div className="dept-card-footer">
                  <span>View Patients</span>
                  <ArrowUpRight size={12} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
