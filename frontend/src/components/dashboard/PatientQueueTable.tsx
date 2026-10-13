import React from 'react';
import type { PatientQueueItem, QueueStatus, TriageCategory } from '../../types/triage';
import {
  Clock,
  Eye,
  UserCheck,
  CheckCircle,
  AlertOctagon,
  Search,
  Filter,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Stethoscope,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { LottieAnimation } from '../common/LottieAnimation';
import loadingLottie from '../../assets/lottie/loading.json';
import emptyQueueLottie from '../../assets/lottie/empty-queue.json';

interface PatientQueueTableProps {
  patients: PatientQueueItem[];
  selectedTriageLevel: string;
  onTriageLevelChange: (val: string) => void;
  selectedStatus: string;
  onStatusChange: (val: string) => void;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onViewDetails: (patient: PatientQueueItem) => void;
  onUpdateStatus: (patientId: string, newStatus: QueueStatus) => void;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
  onRegisterClick: () => void;
}

export const PatientQueueTable: React.FC<PatientQueueTableProps> = ({
  patients,
  selectedTriageLevel,
  onTriageLevelChange,
  selectedStatus,
  onStatusChange,
  searchQuery,
  onSearchChange,
  onViewDetails,
  onUpdateStatus,
  isLoading,
  error,
  onRetry,
  onRegisterClick,
}) => {
  const shouldReduceMotion = useReducedMotion();

  // Format arrival time helper
  const formatArrivalTime = (isoString?: string) => {
    if (!isoString) return '08:30 AM';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '08:30 AM';
    }
  };

  // Helper to extract warning signs
  const getWarningSigns = (patient: PatientQueueItem): Array<{ label: string; isDanger: boolean }> => {
    const list: Array<{ label: string; isDanger: boolean }> = [];

    // Red flags identified
    if (patient.assessment.red_flags_identified && patient.assessment.red_flags_identified.length > 0) {
      patient.assessment.red_flags_identified.forEach((rf) => {
        list.push({ label: rf, isDanger: true });
      });
    }

    // Vital sign abnormalities
    if (patient.vitals.spo2 != null && !isNaN(patient.vitals.spo2) && patient.vitals.spo2 < 92) {
      list.push({ label: `Hypoxia: SpO2 ${patient.vitals.spo2}%`, isDanger: true });
    }
    if (patient.vitals.systolic_bp != null && !isNaN(patient.vitals.systolic_bp)) {
      if (patient.vitals.systolic_bp < 90) {
        list.push({ label: `Shock: BP ${patient.vitals.systolic_bp} mmHg`, isDanger: true });
      } else if (patient.vitals.systolic_bp >= 160) {
        list.push({ label: `Severe HTN: ${patient.vitals.systolic_bp} mmHg`, isDanger: false });
      }
    }
    if (patient.vitals.heart_rate != null && !isNaN(patient.vitals.heart_rate)) {
      if (patient.vitals.heart_rate > 130 || patient.vitals.heart_rate < 40) {
        list.push({ label: `HR ${patient.vitals.heart_rate} bpm`, isDanger: true });
      }
    }
    if (patient.vitals.respiratory_rate != null && !isNaN(patient.vitals.respiratory_rate) && patient.vitals.respiratory_rate > 28) {
      list.push({ label: `Tachypnea: RR ${patient.vitals.respiratory_rate}`, isDanger: false });
    }

    if (list.length === 0) {
      list.push({ label: 'Vitals Stable', isDanger: false });
    }

    return list;
  };

  // Render triage level badge
  const renderTriageBadge = (category: TriageCategory) => {
    switch (category) {
      case 'EMERGENCY':
        return (
          <span className="triage-level-chip chip-emergency">
            <span className="chip-dot-danger" />
            <span className="chip-text">RED • Level 1 (Emergency)</span>
          </span>
        );
      case 'PRIORITY':
        return (
          <span className="triage-level-chip chip-priority">
            <span className="chip-dot-warning" />
            <span className="chip-text">YELLOW • Level 2 (Priority)</span>
          </span>
        );
      case 'ROUTINE':
        return (
          <span className="triage-level-chip chip-routine">
            <span className="chip-dot-success" />
            <span className="chip-text">GREEN • Level 3 (Routine)</span>
          </span>
        );
      default:
        return <span className="triage-level-chip">{category}</span>;
    }
  };

  // Render status badge
  const renderStatusBadge = (status: QueueStatus) => {
    switch (status) {
      case 'WAITING':
        return <span className="status-badge status-badge-waiting">Waiting in Hall</span>;
      case 'WITH_DOCTOR':
        return <span className="status-badge status-badge-doctor">With Doctor</span>;
      case 'NEEDS_HUMAN_REVIEW':
        return <span className="status-badge status-badge-review">Doctor Review</span>;
      case 'COMPLETED':
        return <span className="status-badge status-badge-completed">Completed</span>;
      case 'TRANSFERRED_EMERGENCY':
        return <span className="status-badge status-badge-transferred">Casualty Transfer</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const hasActiveFilters = selectedTriageLevel !== '' || selectedStatus !== '' || searchQuery.trim() !== '';

  const handleClearFilters = () => {
    onTriageLevelChange('');
    onStatusChange('');
    onSearchChange('');
  };

  return (
    <div className="queue-table-card">
      {/* Table Header and Filters Bar */}
      <div className="queue-table-topbar">
        <div className="topbar-title-section">
          <h2 className="table-main-title">Hospital OPD Triage Queue</h2>
          <span className="synthetic-pill-tag">
            <Sparkles size={12} /> Synthetic Demo Records Included
          </span>
        </div>

        <div className="queue-filters-bar">
          {/* Search Input */}
          <div className="filter-search-box">
            <Search size={16} className="filter-search-icon" />
            <input
              type="text"
              placeholder="Search by UHID, Token, Patient Name or Complaint..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="filter-search-input"
              aria-label="Search patients"
            />
          </div>

          {/* Triage Level Filter */}
          <div className="filter-dropdown-wrapper">
            <Filter size={14} className="filter-icon" />
            <select
              value={selectedTriageLevel}
              onChange={(e) => onTriageLevelChange(e.target.value)}
              className="filter-select-element"
              aria-label="Filter by Triage Level"
            >
              <option value="">All Triage Levels</option>
              <option value="EMERGENCY">Level 1 — Emergency (Red)</option>
              <option value="PRIORITY">Level 2 — Priority (Yellow)</option>
              <option value="ROUTINE">Level 3 — Routine (Green)</option>
            </select>
          </div>

          {/* Assessment Status Filter */}
          <div className="filter-dropdown-wrapper">
            <select
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
              className="filter-select-element"
              aria-label="Filter by Assessment Status"
            >
              <option value="">All Assessment Statuses</option>
              <option value="WAITING">Waiting in Hall</option>
              <option value="NEEDS_HUMAN_REVIEW">Awaiting Doctor Review</option>
              <option value="WITH_DOCTOR">With Doctor</option>
              <option value="COMPLETED">Completed Consultation</option>
            </select>
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="btn-clear-filters"
              title="Reset all filters"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* ERROR STATE */}
      {error && (
        <div className="table-error-state" role="alert">
          <AlertOctagon size={24} className="error-icon" />
          <div className="error-text-wrap">
            <span className="error-headline">Unable to retrieve queue records</span>
            <span className="error-details">{error}</span>
          </div>
          {onRetry && (
            <button type="button" onClick={onRetry} className="btn-retry">
              Retry Connection
            </button>
          )}
        </div>
      )}

      {/* LOADING STATE */}
      {isLoading && !error && (
        <motion.div
          className="table-loading-state"
          aria-live="polite"
          initial={shouldReduceMotion ? false : { opacity: 0.6 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <LottieAnimation
            animationData={loadingLottie}
            width={38}
            height={38}
            fallbackIcon={<div className="loading-spinner" />}
            aria-label="Synchronizing records"
          />
          <span>Synchronizing patient triage records...</span>
        </motion.div>
      )}

      {/* EMPTY STATE */}
      {!isLoading && !error && patients.length === 0 && (
        <motion.div
          className="table-empty-state"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          <div className="empty-lottie-bubble">
            <LottieAnimation
              animationData={emptyQueueLottie}
              width={96}
              height={96}
              fallbackIcon={<AlertTriangle size={36} />}
              aria-label="Empty queue illustration"
            />
          </div>
          <h3 className="empty-state-title">No matching patient records found</h3>
          <p className="empty-state-sub">
            {hasActiveFilters
              ? 'No patients match your current filter selections. Try clearing your search or status filters.'
              : 'The OPD triage queue is currently empty. Register incoming patients to initiate automated risk scoring.'}
          </p>
          <div className="empty-state-actions">
            {hasActiveFilters ? (
              <button type="button" onClick={handleClearFilters} className="btn-secondary">
                <RotateCcw size={15} />
                <span>Reset Filters</span>
              </button>
            ) : (
              <button type="button" onClick={onRegisterClick} className="btn-primary">
                Register First Patient
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* DATA TABLE */}
      {!isLoading && !error && patients.length > 0 && (
        <div className="table-responsive-container">
          <table className="patient-queue-table" aria-label="OPD Patient Queue Table">
            <thead>
              <tr>
                <th scope="col" style={{ width: '13%' }}>Patient ID</th>
                <th scope="col" style={{ width: '11%' }}>Arrival Time</th>
                <th scope="col" style={{ width: '28%' }}>Complaint Summary</th>
                <th scope="col" style={{ width: '18%' }}>Triage Level</th>
                <th scope="col" style={{ width: '18%' }}>Detected Warning Signs</th>
                <th scope="col" style={{ width: '12%' }}>Status & Action</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => {
                const warnings = getWarningSigns(patient);
                const isEmergency = patient.assessment.triage_category === 'EMERGENCY';

                return (
                  <motion.tr
                    key={patient.id}
                    initial={shouldReduceMotion || isEmergency ? false : { opacity: 0.85 }}
                    animate={{ opacity: 1 }}
                    transition={isEmergency ? { duration: 0 } : { duration: 0.18, ease: 'easeOut' as const }}
                    className={`queue-row ${isEmergency ? 'row-emergency-highlight' : ''}`}
                  >
                    {/* 1. Patient ID */}
                    <td className="cell-patient-id">
                      <div className="token-headline">
                        <span className="token-number-bold">{patient.token_number}</span>
                      </div>
                      <span className="uhid-text">{patient.opd_registration_number || 'UHID-Pending'}</span>
                      {patient.is_synthetic && (
                        <span className="synthetic-badge-tag">SYNTHETIC</span>
                      )}
                    </td>

                    {/* 2. Arrival Time */}
                    <td className="cell-arrival">
                      <div className="arrival-row">
                        <Clock size={13} className="cell-clock-icon" />
                        <span className="arrival-time-text">{formatArrivalTime(patient.created_at)}</span>
                      </div>
                      <span className="dept-tag">{patient.assessment.recommended_department}</span>
                    </td>

                    {/* 3. Complaint Summary */}
                    <td className="cell-complaint">
                      <div className="patient-meta-row">
                        <span className="patient-name-bold">{patient.patient_name}</span>
                        <span className="patient-demographics-text">
                          ({patient.age}y • {patient.gender})
                        </span>
                      </div>
                      <p className="complaint-snippet" title={patient.chief_complaint}>
                        {patient.chief_complaint}
                      </p>
                      {patient.clinical_notes && (
                        <span className="notes-tag">Note: {patient.clinical_notes}</span>
                      )}
                    </td>

                    {/* 4. Triage Level */}
                    <td className="cell-triage-level">
                      {renderTriageBadge(patient.assessment.triage_category)}
                      <div className="acuity-score-bar">
                        <span className="score-mini-label">Priority Acuity:</span>
                        <span className="score-mini-value">{patient.assessment.urgency_score}/10</span>
                      </div>
                    </td>

                    {/* 5. Detected Warning Signs */}
                    <td className="cell-warnings">
                      <div className="warning-chips-container">
                        {warnings.map((w, i) => (
                          <span
                            key={i}
                            className={`warning-chip ${w.isDanger ? 'warning-chip-danger' : 'warning-chip-stable'}`}
                          >
                            {w.label}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* 6. Status & Actions */}
                    <td className="cell-status-actions">
                      <div className="status-action-wrapper">
                        {renderStatusBadge(patient.status)}

                        <div className="row-action-buttons">
                          {/* View Clinical Details Card */}
                          <motion.button
                            type="button"
                            whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                            whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                            onClick={() => onViewDetails(patient)}
                            className="btn-view-card"
                            title="Inspect clinical assessment & vital findings"
                            aria-label={`View clinical card for ${patient.patient_name}`}
                          >
                            <Eye size={14} />
                            <span>Clinical Card</span>
                          </motion.button>

                          {/* Quick Status Action */}
                          {patient.status === 'WAITING' && (
                            <motion.button
                              type="button"
                              whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                              onClick={() => onUpdateStatus(patient.id, 'WITH_DOCTOR')}
                              className="btn-quick-call"
                              title="Call patient into doctor consultation room"
                            >
                              <Stethoscope size={13} />
                              <span>Call In</span>
                            </motion.button>
                          )}

                          {patient.status === 'NEEDS_HUMAN_REVIEW' && (
                            <motion.button
                              type="button"
                              whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                              onClick={() => onUpdateStatus(patient.id, 'WITH_DOCTOR')}
                              className="btn-quick-review"
                              title="Mark clinician review complete & call in"
                            >
                              <UserCheck size={13} />
                              <span>Reviewed</span>
                            </motion.button>
                          )}

                          {patient.status === 'WITH_DOCTOR' && (
                            <motion.button
                              type="button"
                              whileHover={shouldReduceMotion ? undefined : { scale: 1.02 }}
                              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                              onClick={() => onUpdateStatus(patient.id, 'COMPLETED')}
                              className="btn-quick-complete"
                              title="Mark consultation completed"
                            >
                              <CheckCircle size={13} />
                              <span>Discharge</span>
                            </motion.button>
                          )}
                        </div>
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
