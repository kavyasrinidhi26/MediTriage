import React, { useState, useEffect, useMemo } from 'react';
import type {
  SavedPatientQueueItem,
  PatientQueueItem,
  EmergencyCaseItem,
} from '../../types/triage';
import {
  fetchSavedQueue,
  fetchEmergencyCases,
} from '../../services/api';
import {
  X,
  Search,
  Filter,
  ArrowUpDown,
  ArrowLeft,
  Eye,
  AlertTriangle,
  Building2,
  Activity,
  Ambulance,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type CardCategoryType =
  | 'today'
  | 'all'
  | 'WAITING'
  | 'EMERGENCY'
  | 'PRIORITY'
  | 'ROUTINE'
  | string;

interface PatientListModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: CardCategoryType;
  cardTitle: string;
  expectedCount: number;
  hospitalTimezone?: string;
  onSelectPatient: (patient: PatientQueueItem) => void;
  onSelectEmergencyCase?: (caseItem: EmergencyCaseItem) => void;
}

// Convert SavedPatientQueueItem to PatientQueueItem for PatientDetailModal
function mapSavedToQueueItem(s: SavedPatientQueueItem): PatientQueueItem {
  const cat =
    s.triage_level === 1
      ? 'EMERGENCY'
      : s.triage_level === 2
      ? 'PRIORITY'
      : 'ROUTINE';
  const levelName =
    s.triage_level_name ||
    (s.triage_level === 1
      ? 'Level 1 - Resuscitation'
      : s.triage_level === 2
      ? 'Level 2 - Priority'
      : 'Level 3 - Routine');

  return {
    id: s.id,
    token_number: s.token_number,
    patient_name: s.patient_name || `Patient ${s.patient_id}`,
    age: s.age,
    gender: s.gender,
    opd_registration_number: s.patient_id,
    chief_complaint: s.chief_complaint,
    symptom_duration_days: 0,
    vitals: {
      heart_rate: s.pulse_bpm,
      systolic_bp: s.systolic_bp,
      diastolic_bp: s.diastolic_bp,
      temperature_f:
        s.temperature_unit === 'C' && s.temperature != null
          ? (s.temperature * 9) / 5 + 32
          : s.temperature,
      spo2: s.spo2,
      avpu: 'ALERT',
    },
    red_flags: {},
    clinical_notes: s.review_notes,
    assessment: {
      triage_category: cat,
      urgency_level: levelName,
      urgency_score: s.urgency_score || (s.triage_level === 1 ? 9 : s.triage_level === 2 ? 6 : 3),
      recommended_department: s.recommended_department || 'General Medicine',
      red_flags_identified: s.warning_signs || [],
      vital_abnormalities: [],
      clinical_rationale: [levelName],
      recommended_action: 'Clinical Consultation',
      max_recommended_wait_minutes: s.triage_level === 1 ? 15 : s.triage_level === 2 ? 60 : 120,
      assessment_timestamp: s.created_at,
      disclaimer: s.disclaimer,
    },
    status: (s.status as any) || 'WAITING',
    created_at: s.created_at,
    updated_at: s.updated_at,
    is_synthetic: s.is_synthetic,
  };
}

export const PatientListModal: React.FC<PatientListModalProps> = ({
  isOpen,
  onClose,
  cardId,
  cardTitle,
  expectedCount,
  hospitalTimezone = 'Asia/Kolkata',
  onSelectPatient,
  onSelectEmergencyCase,
}) => {
  const [patients, setPatients] = useState<SavedPatientQueueItem[]>([]);
  const [emergencyCases, setEmergencyCases] = useState<EmergencyCaseItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Sub-tabs for Emergency Card (Trauma bay cases vs OPD Level 1 emergencies)
  const [emergencyViewMode, setEmergencyViewMode] = useState<'trauma' | 'opd'>(
    'trauma'
  );

  // Search & Filters within modal
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [triageLevelFilter, setTriageLevelFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('acuity_desc');

  // Load records matching the clicked card definition
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);
    setSearchQuery('');
    setDepartmentFilter('');
    setStatusFilter('');
    setTriageLevelFilter('');

    async function loadData() {
      try {
        if (cardId.startsWith('dept:') || (!['today', 'all', 'WAITING', 'EMERGENCY', 'PRIORITY', 'ROUTINE'].includes(cardId))) {
          const deptName = cardId.startsWith('dept:') ? cardId.replace('dept:', '') : cardId;
          const list = await fetchSavedQueue({ department: deptName });
          if (!isMounted) return;
          setPatients(list);
          setDepartmentFilter(deptName);
        } else if (cardId === 'EMERGENCY') {
          // Fetch both dedicated trauma cases and OPD Level 1 patients
          const [trauma, opdL1] = await Promise.all([
            fetchEmergencyCases(),
            fetchSavedQueue({ category: 'EMERGENCY' }),
          ]);
          if (!isMounted) return;
          setEmergencyCases(trauma);
          setPatients(opdL1);
          setTriageLevelFilter('EMERGENCY');
        } else if (cardId === 'today') {
          const list = await fetchSavedQueue({ today_only: true });
          if (!isMounted) return;
          setPatients(list);
        } else if (cardId === 'all') {
          const list = await fetchSavedQueue({});
          if (!isMounted) return;
          setPatients(list);
        } else if (cardId === 'WAITING') {
          const list = await fetchSavedQueue({ status: 'WAITING' });
          if (!isMounted) return;
          setPatients(list);
          setStatusFilter('WAITING');
        } else if (cardId === 'PRIORITY') {
          const list = await fetchSavedQueue({ category: 'PRIORITY' });
          if (!isMounted) return;
          setPatients(list);
          setTriageLevelFilter('PRIORITY');
        } else if (cardId === 'ROUTINE') {
          const list = await fetchSavedQueue({ category: 'ROUTINE' });
          if (!isMounted) return;
          setPatients(list);
          setTriageLevelFilter('ROUTINE');
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch patient records from backend.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, cardId]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Unique departments for filter dropdown
  const availableDepartments = useMemo(() => {
    const set = new Set<string>([
      'Casualty / Emergency',
      'General Medicine',
      'Pulmonology',
      'Cardiology',
      'Pediatrics',
      'Orthopedics',
    ]);
    for (const p of patients) {
      if (p.recommended_department) {
        set.add(p.recommended_department);
      }
    }
    return Array.from(set).sort();
  }, [patients]);

  // Filtered and sorted patient list
  const filteredPatients = useMemo(() => {
    let result = [...patients];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.patient_id.toLowerCase().includes(q) ||
          p.token_number.toLowerCase().includes(q) ||
          (p.patient_name && p.patient_name.toLowerCase().includes(q)) ||
          p.chief_complaint.toLowerCase().includes(q)
      );
    }

    if (departmentFilter) {
      result = result.filter((p) => {
        const d = (p.recommended_department || '').toLowerCase();
        const f = departmentFilter.toLowerCase();
        return d === f || d.includes(f) || f.includes(d);
      });
    }

    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (triageLevelFilter) {
      if (triageLevelFilter === '1' || triageLevelFilter === 'EMERGENCY') {
        result = result.filter((p) => p.triage_level === 1);
      } else if (triageLevelFilter === '2' || triageLevelFilter === 'PRIORITY') {
        result = result.filter((p) => p.triage_level === 2);
      } else if (triageLevelFilter === 'ROUTINE') {
        result = result.filter((p) => !p.triage_level || p.triage_level >= 3);
      } else {
        result = result.filter((p) => String(p.triage_level) === triageLevelFilter);
      }
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'acuity_desc') {
        const scoreA = a.urgency_score || 0;
        const scoreB = b.urgency_score || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'time_desc') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'time_asc') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === 'name_asc') {
        return (a.patient_name || '').localeCompare(b.patient_name || '');
      }
      if (sortBy === 'id_asc') {
        return a.patient_id.localeCompare(b.patient_id);
      }
      return 0;
    });

    return result;
  }, [patients, searchQuery, departmentFilter, statusFilter, sortBy]);

  // Filtered emergency trauma cases (when cardId === 'EMERGENCY' and emergencyViewMode === 'trauma')
  const filteredEmergencyCases = useMemo(() => {
    let result = [...emergencyCases];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.case_id.toLowerCase().includes(q) ||
          (c.patient_name && c.patient_name.toLowerCase().includes(q)) ||
          (c.mechanism_of_injury && c.mechanism_of_injury.toLowerCase().includes(q)) ||
          c.accident_type.toLowerCase().includes(q)
      );
    }
    return result;
  }, [emergencyCases, searchQuery]);

  if (!isOpen) return null;

  const isEmergencyTraumaActive =
    cardId === 'EMERGENCY' && emergencyViewMode === 'trauma';

  const displayedTotalCount = isEmergencyTraumaActive
    ? filteredEmergencyCases.length
    : filteredPatients.length;

  const getCategoryBadgeClass = (level?: number | null) => {
    if (level === 1) return 'triage-badge-emergency';
    if (level === 2) return 'triage-badge-priority';
    return 'triage-badge-routine';
  };

  const getStatusBadgeClass = (st?: string) => {
    switch (st) {
      case 'WAITING':
        return 'status-badge-waiting';
      case 'WITH_DOCTOR':
        return 'status-badge-with-doctor';
      case 'NEEDS_HUMAN_REVIEW':
        return 'status-badge-review';
      case 'COMPLETED':
        return 'status-badge-completed';
      case 'RESPONSE_ACTIVATED':
      case 'STABILIZATION_IN_PROGRESS':
        return 'status-badge-emergency-active';
      default:
        return 'status-badge-default';
    }
  };

  const formatDisplayTime = (isoString?: string) => {
    if (!isoString) return '--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <AnimatePresence>
      <div
        className="modal-backdrop"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-list-modal-title"
        style={{ zIndex: 1100 }}
      >
        <motion.div
          className="modal-card patient-list-modal-card"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{
            maxWidth: '1200px',
            width: '95vw',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div className="patient-list-modal-header" style={{ borderBottom: '1px solid var(--navy-200)', padding: '18px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="patient-list-return-btn"
                  title="Return to Dashboard"
                  id="btn-back-to-dashboard"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--navy-100)',
                    color: 'var(--navy-800)',
                    border: '1px solid var(--navy-300)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Back to Dashboard</span>
                </button>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h2 id="patient-list-modal-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--navy-900)' }}>
                      {cardTitle}
                    </h2>
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        backgroundColor: 'var(--teal-50)',
                        color: 'var(--teal-800)',
                        border: '1px solid var(--teal-200)',
                      }}
                    >
                      {displayedTotalCount} {displayedTotalCount === 1 ? 'Record' : 'Records'}
                      {expectedCount !== undefined && expectedCount !== displayedTotalCount && (
                        <span style={{ marginLeft: '4px', opacity: 0.8 }}>(Card Count: {expectedCount})</span>
                      )}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--navy-500)' }}>
                    {cardId === 'today' && `Patients registered during current hospital date (${hospitalTimezone})`}
                    {cardId === 'all' && 'All outpatient registrations stored in the database'}
                    {cardId === 'WAITING' && 'Patients currently awaiting clinical consultation (excluding completed/discharged)'}
                    {cardId === 'EMERGENCY' && 'Emergency cases matching clinical triage criteria (Trauma Bays & Level 1)'}
                    {cardId === 'PRIORITY' && 'Urgent Level 2 priority cases requiring timely physician review'}
                    {cardId === 'ROUTINE' && 'Level 3-5 routine outpatient queue cases'}
                    {String(cardId).startsWith('dept:') && `Patients allocated to ${String(cardId).replace('dept:', '')} specialty clinic`}
                  </p>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--navy-100)',
                      fontSize: '0.7rem',
                      color: 'var(--navy-600)',
                      fontWeight: 600,
                      marginTop: '4px',
                    }}
                  >
                    <span>⚕️ Clinical Decision Support Prototype • Synthetic Demo Records Included (Bedside Verification Mandatory)</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="modal-close-btn"
                aria-label="Close patient list"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--navy-400)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Emergency Sub-View Toggle if Emergency card */}
            {cardId === 'EMERGENCY' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                <button
                  type="button"
                  onClick={() => setEmergencyViewMode('trauma')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: emergencyViewMode === 'trauma' ? 'var(--emergency-red)' : 'var(--navy-100)',
                    color: emergencyViewMode === 'trauma' ? '#ffffff' : 'var(--navy-700)',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Ambulance size={14} />
                  <span>Active Trauma Emergency Cases ({emergencyCases.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEmergencyViewMode('opd')}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: emergencyViewMode === 'opd' ? 'var(--navy-800)' : 'var(--navy-100)',
                    color: emergencyViewMode === 'opd' ? '#ffffff' : 'var(--navy-700)',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <AlertTriangle size={14} />
                  <span>Outpatient Level 1 Emergencies ({patients.length})</span>
                </button>
              </div>
            )}
          </div>

          {/* Controls Bar: Search, Filters, Sorting */}
          <div
            className="patient-list-controls"
            style={{
              padding: '12px 24px',
              backgroundColor: 'var(--navy-50)',
              borderBottom: '1px solid var(--navy-200)',
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '280px', maxWidth: '420px', position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--navy-400)' }} />
              <input
                type="text"
                placeholder={isEmergencyTraumaActive ? "Search by Case ID, name, or mechanism..." : "Search by Patient ID, UHID, name, or complaint..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 32px',
                  borderRadius: '6px',
                  border: '1px solid var(--navy-300)',
                  fontSize: '0.85rem',
                  backgroundColor: '#ffffff',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '10px', top: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-400)' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {!isEmergencyTraumaActive && availableDepartments.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Building2 size={14} style={{ color: 'var(--navy-500)' }} />
                  <select
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--navy-300)',
                      fontSize: '0.8rem',
                      backgroundColor: '#ffffff',
                    }}
                    aria-label="Filter by department"
                  >
                    <option value="">All Departments</option>
                    {availableDepartments.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {!isEmergencyTraumaActive && cardId !== 'WAITING' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Filter size={14} style={{ color: 'var(--navy-500)' }} />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--navy-300)',
                      fontSize: '0.8rem',
                      backgroundColor: '#ffffff',
                    }}
                    aria-label="Filter by status"
                  >
                    <option value="">All Statuses</option>
                    <option value="WAITING">Waiting</option>
                    <option value="WITH_DOCTOR">With Doctor</option>
                    <option value="NEEDS_HUMAN_REVIEW">Needs Human Review</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              )}

              {!isEmergencyTraumaActive && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Activity size={14} style={{ color: 'var(--navy-500)' }} />
                  <select
                    value={triageLevelFilter}
                    onChange={(e) => setTriageLevelFilter(e.target.value)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--navy-300)',
                      fontSize: '0.8rem',
                      backgroundColor: '#ffffff',
                    }}
                    aria-label="Filter by triage level"
                  >
                    <option value="">All Triage Levels</option>
                    <option value="EMERGENCY">Level 1 — Emergency (Red)</option>
                    <option value="PRIORITY">Level 2 — Priority (Yellow)</option>
                    <option value="ROUTINE">Level 3-5 — Routine (Green)</option>
                    <option value="1">Level 1 Resuscitation</option>
                    <option value="2">Level 2 Emergent</option>
                    <option value="3">Level 3 Urgent</option>
                    <option value="4">Level 4 Less Urgent</option>
                    <option value="5">Level 5 Non-urgent</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowUpDown size={14} style={{ color: 'var(--navy-500)' }} />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--navy-300)',
                    fontSize: '0.8rem',
                    backgroundColor: '#ffffff',
                  }}
                  aria-label="Sort patient list"
                >
                  <option value="acuity_desc">Urgency (High to Low)</option>
                  <option value="time_desc">Arrival (Newest First)</option>
                  <option value="time_asc">Arrival (Oldest First)</option>
                  <option value="name_asc">Patient Name (A - Z)</option>
                  <option value="id_asc">Patient ID (Ascending)</option>
                </select>
              </div>

              {(searchQuery || departmentFilter || statusFilter || triageLevelFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDepartmentFilter('');
                    setStatusFilter('');
                    setTriageLevelFilter('');
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.775rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--navy-100)',
                    color: 'var(--navy-800)',
                    border: '1px solid var(--navy-300)',
                    cursor: 'pointer',
                  }}
                  title="Clear all search and filter conditions"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Body Table Area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--navy-500)' }}>
                <Activity size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: 'var(--teal-600)' }} />
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Loading patient records...</p>
              </div>
            ) : error ? (
              <div style={{ padding: '24px', textAlign: 'center', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <AlertTriangle size={24} style={{ color: '#ef4444', margin: '0 auto 8px auto' }} />
                <p style={{ margin: '0 0 12px 0', color: '#991b1b', fontSize: '0.9rem', fontWeight: 600 }}>{error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true);
                    setError(null);
                  }}
                  className="cult-shimmer-btn cult-shimmer-size-sm"
                >
                  Retry Loading
                </button>
              </div>
            ) : isEmergencyTraumaActive ? (
              // Dedicated Emergency Trauma Table
              filteredEmergencyCases.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--navy-500)' }}>
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>No emergency trauma cases match your search criteria.</p>
                </div>
              ) : (
                <table className="queue-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Case ID</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Patient Identity</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Arrival</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Accident Type & Mechanism</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Resuscitation Bay</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Lifecycle Status</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmergencyCases.map((c) => (
                      <tr
                        key={c.case_id}
                        className="queue-table-row"
                        style={{ borderBottom: '1px solid var(--navy-100)', cursor: 'pointer' }}
                        onClick={() => onSelectEmergencyCase?.(c)}
                      >
                        <td style={{ padding: '12px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--emergency-red)', fontSize: '0.85rem' }}>
                            {c.case_id}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--navy-900)' }}>
                            {c.patient_name || (c.patient_identity_status === 'UNKNOWN' ? 'UNKNOWN PATIENT' : 'Identity Unverified')}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>
                            {c.gender} • {c.approximate_age ? `${c.approximate_age} yrs` : 'Age Unspecified'}
                          </div>
                        </td>
                        <td style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--navy-700)' }}>
                          {c.arrival_time}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--navy-800)' }}>
                            {c.accident_type.replace(/_/g, ' ')}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.mechanism_of_injury || 'Acute trauma activation'}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
                            }}
                          >
                            {c.assigned_resuscitation_bay}
                          </span>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span className={`status-pill ${getStatusBadgeClass(c.status)}`}>
                            {c.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectEmergencyCase?.(c);
                            }}
                            className="cult-shimmer-btn cult-shimmer-size-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Eye size={12} />
                            <span>Details</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              // Standard OPD Patient List Table
              filteredPatients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--navy-500)' }}>
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>No patient records match the selected filters.</p>
                </div>
              ) : (
                <table className="queue-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Patient ID / Token</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Patient Name & Demographics</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Arrival Time</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Triage Urgency</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Queue Status</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px' }}>Department</th>
                      <th style={{ textAlign: 'right', padding: '10px 12px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map((p) => {
                      const queueItem = mapSavedToQueueItem(p);
                      return (
                        <tr
                          key={p.id}
                          className="queue-table-row"
                          style={{ borderBottom: '1px solid var(--navy-100)', cursor: 'pointer' }}
                          onClick={() => onSelectPatient(queueItem)}
                        >
                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--navy-900)' }}>
                                {p.token_number}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)', fontFamily: 'monospace' }}>
                                {p.patient_id}
                              </span>
                            </div>
                            {p.is_synthetic && (
                              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--navy-400)' }}>
                                DEMO
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--navy-900)' }}>
                              {p.patient_name || `Patient ${p.patient_id}`}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>
                              {p.gender} • {p.age} yrs
                            </div>
                          </td>
                          <td style={{ padding: '12px', fontSize: '0.85rem', color: 'var(--navy-700)' }}>
                            {formatDisplayTime(p.created_at)}
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span className={`triage-badge ${getCategoryBadgeClass(p.triage_level)}`}>
                              {p.triage_level_name || (p.triage_level ? `Level ${p.triage_level}` : 'Routine')}
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span className={`status-pill ${getStatusBadgeClass(p.status)}`}>
                              {p.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '12px', fontSize: '0.8rem', color: 'var(--navy-700)' }}>
                            {p.recommended_department || 'General Medicine'}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPatient(queueItem);
                              }}
                              className="cult-shimmer-btn cult-shimmer-size-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Eye size={12} />
                              <span>Details</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>

          {/* Modal Footer */}
          <div
            className="patient-list-modal-footer"
            style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--navy-200)',
              backgroundColor: 'var(--navy-50)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--navy-500)' }}>
              Showing {displayedTotalCount} matching records • Click any patient row to open clinical details
            </span>
            <button
              type="button"
              onClick={onClose}
              className="cult-shimmer-btn cult-shimmer-size-sm"
              title="Return to hospital overview"
            >
              Back to Dashboard
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
