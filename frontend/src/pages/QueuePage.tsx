import React, { useState, useEffect, useCallback } from 'react';
import type { SavedPatientQueueItem, EmergencyCaseItem } from '../types/triage';
import {
  fetchSavedQueue,
  markPatientReviewed,
  flagPatientDeterioration,
  reassessPatient,
  fetchEmergencyCases,
} from '../services/api';
import { ReviewAssessmentModal } from '../components/dashboard/ReviewAssessmentModal';
import { FlagDeteriorationModal } from '../components/dashboard/FlagDeteriorationModal';
import { AuditTrailModal } from '../components/dashboard/AuditTrailModal';
import { ReassessmentModal } from '../components/dashboard/ReassessmentModal';
import { NewPatientModal } from '../components/dashboard/NewPatientModal';
import { DeteriorationWatchModal } from '../components/dashboard/DeteriorationWatchModal';
import { ExplainableAssessmentModal } from '../components/dashboard/ExplainableAssessmentModal';
import { EmergencyQueuePanel } from '../components/emergency/EmergencyQueuePanel';
import { EmergencyCaseDetailModal } from '../components/emergency/EmergencyCaseDetailModal';
import {
  Users,
  AlertTriangle,
  Sparkles,
  Search,
  Filter,
  RotateCcw,
  CheckCircle,
  Clock,
  Building2,
  AlertOctagon,
  History,
  Stethoscope,
  Eye,
  Info,
  Activity,
} from 'lucide-react';
import { LottieAnimation } from '../components/common/LottieAnimation';
import loadingLottie from '../assets/lottie/loading.json';
import emptyQueueLottie from '../assets/lottie/empty-queue.json';

interface QueuePageProps {
  onRegisterClick: () => void;
  isRegisterModalOpen: boolean;
  onCloseRegisterModal: () => void;
  onEmergencyClick?: () => void;
}

export const QueuePage: React.FC<QueuePageProps> = ({
  onRegisterClick,
  isRegisterModalOpen,
  onCloseRegisterModal,
  onEmergencyClick,
}) => {
  const [patients, setPatients] = useState<SavedPatientQueueItem[]>([]);
  const [emergencyCases, setEmergencyCases] = useState<EmergencyCaseItem[]>([]);
  const [selectedEmergencyCase, setSelectedEmergencyCase] = useState<EmergencyCaseItem | null>(null);
  const [selectedTriageLevel, setSelectedTriageLevel] = useState<string>('');
  const [selectedReviewStatus, setSelectedReviewStatus] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active Modals
  const [reviewPatient, setReviewPatient] = useState<SavedPatientQueueItem | null>(null);
  const [deteriorationPatient, setDeteriorationPatient] = useState<SavedPatientQueueItem | null>(null);
  const [auditPatient, setAuditPatient] = useState<SavedPatientQueueItem | null>(null);
  const [reassessPatientItem, setReassessPatientItem] = useState<SavedPatientQueueItem | null>(null);
  const [watchPatient, setWatchPatient] = useState<SavedPatientQueueItem | null>(null);
  const [explainablePatient, setExplainablePatient] = useState<SavedPatientQueueItem | null>(null);

  const isMountedRef = React.useRef(true);
  const isFetchingRef = React.useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadQueue = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!isSilent && isMountedRef.current) setIsLoading(true);
      if (isMountedRef.current) setError(null);
      const [data, emgData] = await Promise.all([
        fetchSavedQueue({
          triage_level: selectedTriageLevel || undefined,
          review_status: selectedReviewStatus || undefined,
          department: selectedDepartment || undefined,
          search: searchQuery.trim() || undefined,
        }),
        fetchEmergencyCases(),
      ]);
      if (isMountedRef.current) {
        setPatients(data);
        setEmergencyCases(emgData);
      }
    } catch (err: unknown) {
      if (isMountedRef.current && !isSilent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch queue records');
      }
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current && !isSilent) {
        setIsLoading(false);
      }
    }
  }, [selectedTriageLevel, selectedReviewStatus, selectedDepartment, searchQuery]);

  useEffect(() => {
    loadQueue();

    // Regular live polling interval (every 6 seconds) with clean unmount teardown
    const intervalId = setInterval(() => {
      loadQueue(true);
    }, 6000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadQueue]);

  // Review handler
  const handleConfirmReview = async (patientId: string, reviewedBy: string, reviewNotes?: string) => {
    await markPatientReviewed(patientId, reviewedBy, reviewNotes);
    await loadQueue();
  };

  // Deterioration handler
  const handleConfirmDeterioration = async (patientId: string, flaggedBy: string, reason: string, notes?: string) => {
    await flagPatientDeterioration(patientId, flaggedBy, reason, notes);
    await loadQueue();
  };

  // Reassessment handler
  const handleConfirmReassessment = async (
    patientId: string,
    payload: {
      requested_by: string;
      updated_pulse?: number;
      updated_spo2?: number;
      updated_systolic_bp?: number;
      updated_diastolic_bp?: number;
      updated_temperature?: number;
      notes?: string;
    }
  ) => {
    await reassessPatient(patientId, payload);
    await loadQueue();
  };

  const handleClearFilters = () => {
    setSelectedTriageLevel('');
    setSelectedReviewStatus('');
    setSelectedDepartment('');
    setSearchQuery('');
  };

  const hasActiveFilters =
    selectedTriageLevel !== '' ||
    selectedReviewStatus !== '' ||
    selectedDepartment !== '' ||
    searchQuery.trim() !== '';

  const criticalCount = patients.filter((p) => p.is_critical_escalation).length;
  const unreviewedCount = patients.filter((p) => p.review_status === 'UNREVIEWED').length;

  const renderTriageLevelBadge = (level?: number | null, name?: string | null) => {
    if (!level) {
      return (
        <span className="triage-level-chip" style={{ background: '#64748b', color: '#fff' }}>
          Pending Assessment
        </span>
      );
    }
    switch (level) {
      case 1:
        return (
          <span className="triage-level-chip chip-emergency">
            <span className="chip-dot-danger" />
            <span>RED • Level 1 (Resuscitation)</span>
          </span>
        );
      case 2:
        return (
          <span className="triage-level-chip chip-priority">
            <span className="chip-dot-warning" />
            <span>ORANGE • Level 2 (Emergent)</span>
          </span>
        );
      case 3:
        return (
          <span className="triage-level-chip" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#b45309', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', marginRight: 6 }} />
            <span>YELLOW • Level 3 (Urgent)</span>
          </span>
        );
      case 4:
        return (
          <span className="triage-level-chip" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#1d4ed8', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', display: 'inline-block', marginRight: 6 }} />
            <span>BLUE • Level 4 (Less Urgent)</span>
          </span>
        );
      case 5:
        return (
          <span className="triage-level-chip chip-routine">
            <span className="chip-dot-success" />
            <span>GREEN • Level 5 (Routine)</span>
          </span>
        );
      default:
        return <span className="triage-level-chip">{name || `Level ${level}`}</span>;
    }
  };

  const renderReviewStatusBadge = (reviewStatus: string, reviewer?: string | null) => {
    switch (reviewStatus) {
      case 'DETERIORATION_FLAGGED':
        return (
          <span className="status-badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid #ef4444', fontWeight: 700 }}>
            <AlertOctagon size={12} style={{ display: 'inline', marginRight: 4 }} /> DETERIORATING
          </span>
        );
      case 'REVIEWED':
        return (
          <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 600 }}>
            <CheckCircle size={12} style={{ display: 'inline', marginRight: 4 }} /> Reviewed
            {reviewer && <span style={{ fontSize: 10, opacity: 0.85, display: 'block' }}>by {reviewer.split(' ')[0]}</span>}
          </span>
        );
      case 'UNREVIEWED':
      default:
        return (
          <span className="status-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 600 }}>
            <Clock size={12} style={{ display: 'inline', marginRight: 4 }} /> Unreviewed
          </span>
        );
    }
  };

  return (
    <div className="inner-page-container">
      {/* Page Header */}
      <div className="inner-page-header">
        <div className="header-text-group">
          <div className="title-with-icon">
            <div className="page-icon-badge">
              <Users size={22} />
            </div>
            <div>
              <h1 className="inner-page-title">Live Outpatient Acuity Queue Monitor</h1>
              <p className="inner-page-subtitle">
                Prioritized OPD Queue: Level 1 emergencies and deteriorating patients always take top precedence over routine cases.
              </p>
            </div>
          </div>
        </div>

        <div className="header-notice-pill">
          <Sparkles size={14} />
          <span>Persistent Backend Decision Support</span>
        </div>
      </div>

      {/* Critical Attention Banner */}
      {criticalCount > 0 && (
        <div className="urgent-casualty-banner" role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertTriangle size={24} className="alert-pulse-icon" />
            <div>
              <strong>URGENT CASUALTY ALERT:</strong> {criticalCount} Critical Escalation case(s) waiting in OPD hall!
              <span style={{ fontSize: 13, display: 'block', opacity: 0.9 }}>
                Immediate resuscitation intervention required. Overrides all routine waiting orders.
              </span>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', background: 'rgba(255,255,255,0.2)', borderRadius: 20 }}>
            {unreviewedCount} Awaiting Review
          </span>
        </div>
      )}

      {/* Prototype Clinical Disclaimer */}
      <div style={{ padding: '8px 14px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        <Info size={16} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
        <span>
          <strong>PROTOTYPE CLINICAL DECISION SUPPORT NOTICE:</strong> Automated triage priority distinguishes physiological acuity from waiting time and nurse review status. Not certified as a final diagnosis; all patient allocations require licensed clinician sign-off.
        </span>
      </div>

      {/* Feature 5: Dedicated Emergency Trauma Queue Panel */}
      <div style={{ marginBottom: 20 }}>
        <EmergencyQueuePanel
          cases={emergencyCases}
          isLoading={isLoading}
          onSelectCase={setSelectedEmergencyCase}
          onRefresh={loadQueue}
          onIntakeClick={onEmergencyClick}
        />
      </div>

      {/* Main Queue Card */}
      <div className="queue-table-card">
        {/* Top Filter Bar */}
        <div className="queue-table-topbar">
          <div className="topbar-title-section">
            <h2 className="table-main-title">Prioritized OPD Patient Queue ({patients.length})</h2>
          </div>

          <div className="queue-filters-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {/* Search Input */}
            <div className="filter-search-box">
              <Search size={16} className="filter-search-icon" />
              <input
                type="text"
                placeholder="Search Demo ID, Token, Name, Complaint..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="filter-search-input"
                aria-label="Search demo patient ID"
              />
            </div>

            {/* Triage Level Filter */}
            <div className="filter-dropdown-wrapper">
              <Filter size={14} className="filter-icon" />
              <select
                value={selectedTriageLevel}
                onChange={(e) => setSelectedTriageLevel(e.target.value)}
                className="filter-select-element"
                aria-label="Filter by Triage Level"
              >
                <option value="">All Triage Acuity Levels</option>
                <option value="1">Level 1 — Resuscitation (Red)</option>
                <option value="2">Level 2 — Emergent (Orange)</option>
                <option value="3">Level 3 — Urgent (Yellow)</option>
                <option value="4">Level 4 — Less Urgent (Blue)</option>
                <option value="5">Level 5 — Routine (Green)</option>
              </select>
            </div>

            {/* Review Status Filter */}
            <div className="filter-dropdown-wrapper">
              <select
                value={selectedReviewStatus}
                onChange={(e) => setSelectedReviewStatus(e.target.value)}
                className="filter-select-element"
                aria-label="Filter by Review Status"
              >
                <option value="">All Review Statuses</option>
                <option value="UNREVIEWED">Unreviewed</option>
                <option value="REVIEWED">Reviewed by Nurse</option>
                <option value="DETERIORATION_FLAGGED">Deterioration Flagged</option>
              </select>
            </div>

            {/* Department Filter */}
            <div className="filter-dropdown-wrapper">
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="filter-select-element"
                aria-label="Filter by Department"
              >
                <option value="">All Departments</option>
                <option value="Casualty">Casualty / Emergency</option>
                <option value="General Medicine">General Medicine</option>
                <option value="Pulmonology">Pulmonology</option>
                <option value="Pediatrics">Pediatrics</option>
                <option value="Orthopedics">Orthopedics</option>
                <option value="Cardiology">Cardiology</option>
              </select>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="btn-clear-filters"
                title="Reset filters"
              >
                <RotateCcw size={13} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="table-error-state" role="alert">
            <AlertOctagon size={24} className="error-icon" />
            <div className="error-text-wrap">
              <span className="error-headline">Unable to retrieve queue records</span>
              <span className="error-details">{error}</span>
            </div>
            <button type="button" onClick={() => { loadQueue(); }} className="btn-retry">
              Retry Connection
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && !error && (
          <div className="table-loading-state" aria-live="polite">
            <LottieAnimation
              animationData={loadingLottie}
              width={38}
              height={38}
              fallbackIcon={<div className="loading-spinner" />}
              aria-label="Synchronizing persistent triage queue"
            />
            <span>Synchronizing persistent triage queue...</span>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && patients.length === 0 && (
          <div className="table-empty-state">
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
                : 'The OPD triage queue is currently empty. Register incoming patients to begin decision support.'}
            </p>
            <button type="button" onClick={onRegisterClick} className="btn-intake-submit">
              Register New Patient
            </button>
          </div>
        )}

        {/* Data Table */}
        {!isLoading && !error && patients.length > 0 && (
          <div className="queue-table-scroll-wrapper">
            <table className="patients-data-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Acuity Priority</th>
                  <th style={{ width: 160 }}>Patient & Demo ID</th>
                  <th style={{ width: 130 }}>Arrival & Wait</th>
                  <th>Presenting Complaint</th>
                  <th style={{ width: 190 }}>Warning Signs</th>
                  <th style={{ width: 140 }}>Assessment & Status</th>
                  <th style={{ width: 130 }}>Department</th>
                  <th style={{ width: 170, textAlign: 'right' }}>Nurse Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient, index) => {
                  const isCritical = patient.is_critical_escalation;
                  const isDeteriorating = patient.deterioration_flag;
                  const rowClass = isDeteriorating
                    ? 'row-deteriorating'
                    : isCritical
                    ? 'row-critical-emergency'
                    : patient.triage_level === 2
                    ? 'row-priority'
                    : '';

                  return (
                    <tr key={patient.id} className={rowClass} style={{ background: isDeteriorating ? 'rgba(239, 68, 68, 0.08)' : isCritical ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                      {/* Priority Acuity Column */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span className="queue-cell-token" style={{ fontWeight: 700 }}>
                            #{index + 1} • {patient.token_number}
                          </span>
                          {renderTriageLevelBadge(patient.triage_level, patient.triage_level_name)}
                          {isDeteriorating && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase' }}>
                              🚨 Deterioration Flagged
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Patient & Demo ID Column */}
                      <td>
                        <div className="queue-cell-patient">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="patient-primary-name" style={{ fontWeight: 600 }}>
                              {patient.patient_name || 'Patient ' + patient.token_number}
                            </span>
                            {patient.is_synthetic && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: 'var(--text-muted, #64748b)',
                                  background: 'rgba(100, 116, 139, 0.12)',
                                  border: '1px solid rgba(100, 116, 139, 0.25)',
                                  padding: '1px 5px',
                                  borderRadius: 4,
                                  letterSpacing: '0.04em',
                                  textTransform: 'uppercase',
                                }}
                                title="Synthetic demo record - not an active hospital patient"
                              >
                                SYNTHETIC
                              </span>
                            )}
                          </div>
                          <span className="patient-uhid-tag" style={{ fontSize: 12, color: 'var(--primary-color)', fontWeight: 500 }}>
                            {patient.patient_id}
                          </span>
                          <span className="patient-demographics-text" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {patient.age}y • {patient.gender}
                          </span>
                        </div>
                      </td>

                      {/* Arrival & Waiting Time Column */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{patient.arrival_time}</span>
                          <span style={{ fontSize: 11, color: patient.waiting_minutes > 45 ? 'var(--danger-color)' : 'var(--text-muted)' }}>
                            <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />
                            {patient.waiting_minutes}m waiting
                          </span>
                        </div>
                      </td>

                      {/* Presenting Complaint Column */}
                      <td>
                        <div style={{ maxWidth: 300 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-app)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', display: 'inline-block', marginBottom: 3 }}>
                            {patient.complaint_language}
                          </span>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {patient.chief_complaint}
                          </p>
                        </div>
                      </td>

                      {/* Detected Warning Signs Column */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {patient.warning_signs && patient.warning_signs.length > 0 ? (
                            patient.warning_signs.slice(0, 2).map((sign, idx) => (
                              <span
                                key={idx}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: 'var(--danger-color)',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  display: 'inline-block',
                                  maxWidth: 180,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={sign}
                              >
                                {sign}
                              </span>
                            ))
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No acute red flags</span>
                          )}
                          {patient.warning_signs && patient.warning_signs.length > 2 && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                              +{patient.warning_signs.length - 2} more signs
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Assessment & Review Status Column */}
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {patient.assessment_status}
                          </span>
                          {renderReviewStatusBadge(patient.review_status, patient.reviewed_by)}
                        </div>
                      </td>

                      {/* Department Column */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--text-primary)' }}>
                          <Building2 size={13} style={{ color: 'var(--text-muted)' }} />
                          <span>{patient.recommended_department || 'General Medicine'}</span>
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => setWatchPatient(patient)}
                            className="btn-action-secondary"
                            style={{
                              padding: '5px 8px',
                              fontSize: 12,
                              borderRadius: 6,
                              border: patient.deterioration_flag ? '1px solid #ef4444' : '1px solid #0284c7',
                              background: patient.deterioration_flag ? '#fee2e2' : '#f0f9ff',
                              color: patient.deterioration_flag ? '#b91c1c' : '#0369a1',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title="Clinician Deterioration Watch (Longitudinal vitals & warnings)"
                          >
                            <Activity size={13} />
                            <span>Watch</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setExplainablePatient(patient)}
                            className="btn-action-secondary"
                            style={{
                              padding: '5px 8px',
                              fontSize: 12,
                              borderRadius: 6,
                              border: '1px solid #7c3aed',
                              background: '#faf5ff',
                              color: '#6d28d9',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title="Explainable Assessment (AI Model & Safety Rules Breakdown)"
                          >
                            <Sparkles size={13} />
                            <span>Explain</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setReviewPatient(patient)}
                            className="btn-action-primary"
                            style={{ padding: '5px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title="Open assessment findings and mark as reviewed"
                          >
                            <Eye size={13} />
                            <span>{patient.review_status === 'REVIEWED' ? 'Details' : 'Review'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeteriorationPatient(patient)}
                            className="btn-action-danger"
                            style={{ padding: '5px 8px', fontSize: 12, color: 'var(--danger-color)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 6 }}
                            title="Flag clinical deterioration"
                          >
                            <AlertTriangle size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setReassessPatientItem(patient)}
                            className="btn-action-secondary"
                            style={{ padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-app)' }}
                            title="Reassess vitals"
                          >
                            <Stethoscope size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setAuditPatient(patient)}
                            className="btn-action-secondary"
                            style={{ padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-color)', background: 'var(--bg-app)' }}
                            title="View status audit log"
                          >
                            <History size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 1. Review Assessment Modal */}
      {reviewPatient && (
        <ReviewAssessmentModal
          patient={reviewPatient}
          onClose={() => setReviewPatient(null)}
          onConfirmReview={handleConfirmReview}
          onOpenExplainable={(p) => {
            setReviewPatient(null);
            setExplainablePatient(p);
          }}
          onOpenDeteriorationWatch={(p) => {
            setReviewPatient(null);
            setWatchPatient(p);
          }}
        />
      )}

      {/* Deterioration Watch Modal */}
      {watchPatient && (
        <DeteriorationWatchModal
          patient={watchPatient}
          onClose={() => setWatchPatient(null)}
          onPatientUpdated={loadQueue}
        />
      )}

      {/* Explainable Assessment Modal */}
      {explainablePatient && (
        <ExplainableAssessmentModal
          patient={explainablePatient}
          onClose={() => setExplainablePatient(null)}
          onPatientUpdated={loadQueue}
        />
      )}

      {/* 2. Flag Deterioration Modal */}
      {deteriorationPatient && (
        <FlagDeteriorationModal
          patient={deteriorationPatient}
          onClose={() => setDeteriorationPatient(null)}
          onConfirmDeterioration={handleConfirmDeterioration}
        />
      )}

      {/* 3. Reassessment Modal */}
      {reassessPatientItem && (
        <ReassessmentModal
          patient={reassessPatientItem}
          onClose={() => setReassessPatientItem(null)}
          onConfirmReassessment={handleConfirmReassessment}
        />
      )}

      {/* 4. Audit Trail Modal */}
      {auditPatient && (
        <AuditTrailModal
          patient={auditPatient}
          onClose={() => setAuditPatient(null)}
        />
      )}

      {/* 5. New Patient Modal */}
      <NewPatientModal
        isOpen={isRegisterModalOpen}
        onClose={onCloseRegisterModal}
        onPatientEnrolled={() => {
          loadQueue();
        }}
      />

      {/* 6. Emergency Case Detail Modal (Feature 4, 6) */}
      {selectedEmergencyCase && (
        <EmergencyCaseDetailModal
          caseItem={selectedEmergencyCase}
          isOpen={Boolean(selectedEmergencyCase)}
          onClose={() => setSelectedEmergencyCase(null)}
          onCaseUpdated={() => {
            loadQueue();
          }}
        />
      )}
    </div>
  );
};
