import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  PatientQueueItem,
  QueueStatus,
  DashboardSummaryMetrics,
  EmergencyCaseItem,
} from '../types/triage';
import {
  fetchQueue,
  fetchDashboardSummaryMetrics,
  updatePatientStatus,
  updatePatientCategory,
  deletePatient,
  fetchEmergencyCases,
  subscribeToQueueUpdates,
  isPatientInHospitalToday,
} from '../services/api';
import { SummaryCards } from '../components/dashboard/SummaryCards';
import { PatientQueueTable } from '../components/dashboard/PatientQueueTable';
import { PatientDetailModal } from '../components/dashboard/PatientDetailModal';
import { NewPatientModal } from '../components/dashboard/NewPatientModal';
import { HospitalAnalyticsDashboard } from '../components/analytics/HospitalAnalyticsDashboard';
import { EmergencyQueuePanel } from '../components/emergency/EmergencyQueuePanel';
import { EmergencyCaseDetailModal } from '../components/emergency/EmergencyCaseDetailModal';
import { PatientListModal, type CardCategoryType } from '../components/dashboard/PatientListModal';
import { motion, useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Ambulance } from 'lucide-react';

interface DashboardPageProps {
  onRegisterClick: () => void;
  isRegisterModalOpen: boolean;
  onCloseRegisterModal: () => void;
  onEmergencyClick?: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onRegisterClick,
  isRegisterModalOpen,
  onCloseRegisterModal,
  onEmergencyClick,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const [patients, setPatients] = useState<PatientQueueItem[]>([]);
  const [allPatients, setAllPatients] = useState<PatientQueueItem[]>([]);
  const [emergencyCases, setEmergencyCases] = useState<EmergencyCaseItem[]>([]);
  const [selectedEmergencyCase, setSelectedEmergencyCase] = useState<EmergencyCaseItem | null>(null);

  const [acuityCounts, setAcuityCounts] = useState({
    total_patients: 0,
    emergency_cases: 0,
    priority_cases: 0,
    routine_cases: 0,
  });
  const [metrics, setMetrics] = useState<DashboardSummaryMetrics>({
    total_patients: 0,
    high_priority_cases: 0,
    awaiting_review_cases: 0,
    assessments_requiring_human_review: 0,
  });

  // Filter states
  const [selectedTriageLevel, setSelectedTriageLevel] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCardFilter, setActiveCardFilter] = useState<string>('all');

  // Loading & error states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Selected patient for modal details
  const [selectedPatient, setSelectedPatient] = useState<PatientQueueItem | null>(null);

  // Clickable Dashboard Cards -> Dedicated Patient List Modal
  const [isPatientListModalOpen, setIsPatientListModalOpen] = useState<boolean>(false);
  const [selectedCardCategory, setSelectedCardCategory] = useState<CardCategoryType>('all');
  const isMountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadDashboardData = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!isSilent && isMountedRef.current) {
        setIsLoading(true);
      }
      if (isMountedRef.current) {
        setError(null);
      }

      const [filteredQueue, fullQueue, metricsData, emgCases] = await Promise.all([
        fetchQueue({
          category: selectedTriageLevel || undefined,
          status: selectedStatus || undefined,
          search: searchQuery.trim() || undefined,
        }),
        fetchQueue({}),
        fetchDashboardSummaryMetrics(),
        fetchEmergencyCases(),
      ]);

      if (!isMountedRef.current) return;

      setPatients(filteredQueue);
      setAllPatients(fullQueue);
      setMetrics(metricsData);
      setEmergencyCases(emgCases);

      const emCount = metricsData.emergency_cases ?? fullQueue.filter((p) => p.assessment.triage_category === 'EMERGENCY').length;
      const prCount = metricsData.priority_cases ?? fullQueue.filter((p) => p.assessment.triage_category === 'PRIORITY').length;
      const roCount = metricsData.routine_cases ?? fullQueue.filter((p) => p.assessment.triage_category === 'ROUTINE').length;

      setAcuityCounts({
        total_patients: metricsData.total_registered_patients ?? fullQueue.length,
        emergency_cases: emCount,
        priority_cases: prCount,
        routine_cases: roCount,
      });
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      if (!isSilent) {
        setError(err instanceof Error ? err.message : 'Error communicating with Triage service.');
      }
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current && !isSilent) {
        setIsLoading(false);
      }
    }
  }, [selectedTriageLevel, selectedStatus, searchQuery]);

  useEffect(() => {
    loadDashboardData();

    // Subscribe to immediate real-time local / API queue change events
    const unsubscribe = subscribeToQueueUpdates(() => {
      loadDashboardData(true);
    });

    // Lightweight live polling interval (every 6 seconds) to synchronize live arrivals and queue
    const intervalId = setInterval(() => {
      loadDashboardData(true);
    }, 6000);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [loadDashboardData]);

  // Compute department breakdown dynamically from actual hospital records
  const departmentWorkload = useMemo(() => {
    const list = allPatients.length > 0 ? allPatients : patients;
    const counts: Record<string, number> = {};
    for (const p of list) {
      const d = p.assessment?.recommended_department || 'General Medicine';
      counts[d] = (counts[d] || 0) + 1;
    }
    const standardDepts = [
      'Casualty / Emergency',
      'General Medicine',
      'Pulmonology',
      'Cardiology',
      'Pediatrics',
      'Orthopedics',
    ];
    return standardDepts.map((name) => ({
      department: name,
      count: counts[name] || 0,
    }));
  }, [allPatients, patients]);

  const getCardTitle = (cat: CardCategoryType): string => {
    if (String(cat).startsWith('dept:')) {
      const dept = String(cat).replace('dept:', '');
      return `${dept} — Assigned Patients`;
    }
    switch (cat) {
      case 'today':
        return "Today's Registered Patients";
      case 'all':
        return 'Total Patients (All Records)';
      case 'WAITING':
        return 'Waiting Patients (Active Hall Queue)';
      case 'EMERGENCY':
        return 'Critical Patients (Active Trauma & Level 1)';
      case 'PRIORITY':
        return 'Priority Triage Patients (Level 2)';
      case 'ROUTINE':
        return 'Routine Outpatient Cases (Level 3-5)';
      default:
        return 'Patient Records';
    }
  };

  const getCardExpectedCount = (cat: CardCategoryType): number => {
    if (String(cat).startsWith('dept:')) {
      const dept = String(cat).replace('dept:', '');
      const list = allPatients.length > 0 ? allPatients : patients;
      return list.filter((p) => (p.assessment?.recommended_department || '').toLowerCase() === dept.toLowerCase()).length;
    }
    switch (cat) {
      case 'today':
        return metrics.patients_today ?? acuityCounts.total_patients;
      case 'all':
        return metrics.total_registered_patients ?? acuityCounts.total_patients;
      case 'WAITING':
        return metrics.currently_waiting ?? metrics.awaiting_review_cases;
      case 'EMERGENCY':
        return metrics.emergency_cases ?? acuityCounts.emergency_cases;
      case 'PRIORITY':
        return metrics.priority_cases ?? acuityCounts.priority_cases;
      case 'ROUTINE':
        return metrics.routine_cases ?? acuityCounts.routine_cases;
      default:
        return 0;
    }
  };

  // Handle quick card filter clicks
  const handleCardClick = (filterType: string) => {
    setActiveCardFilter(filterType);
    setSelectedCardCategory(filterType as CardCategoryType);
    setIsPatientListModalOpen(true);

    if (filterType.startsWith('dept:')) {
      const deptName = filterType.replace('dept:', '');
      setSelectedDepartment(deptName);
      setSelectedTriageLevel('');
      setSelectedStatus('');
    } else if (filterType === 'all') {
      setSelectedTriageLevel('');
      setSelectedStatus('');
      setSelectedDepartment('');
    } else if (filterType === 'today') {
      setSelectedTriageLevel('');
      setSelectedStatus('');
      setSelectedDepartment('');
    } else if (filterType === 'WAITING') {
      setSelectedTriageLevel('');
      setSelectedStatus('WAITING');
      setSelectedDepartment('');
    } else if (filterType === 'EMERGENCY') {
      setSelectedTriageLevel('EMERGENCY');
      setSelectedStatus('');
      setSelectedDepartment('');
    } else if (filterType === 'PRIORITY') {
      setSelectedTriageLevel('PRIORITY');
      setSelectedStatus('');
      setSelectedDepartment('');
    } else if (filterType === 'ROUTINE') {
      setSelectedTriageLevel('ROUTINE');
      setSelectedStatus('');
      setSelectedDepartment('');
    }
  };

  // Handle status update
  const handleUpdateStatus = async (patientId: string, newStatus: QueueStatus) => {
    try {
      await updatePatientStatus(patientId, newStatus);
      setSelectedPatient((prev) => (prev && prev.id === patientId ? { ...prev, status: newStatus } : prev));
      await loadDashboardData(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update patient queue status.');
    }
  };

  // Handle triage category update
  const handleUpdateCategory = async (patientId: string, newCategory: 'EMERGENCY' | 'PRIORITY' | 'ROUTINE') => {
    try {
      await updatePatientCategory(patientId, newCategory);
      setSelectedPatient((prev) => {
        if (!prev || prev.id !== patientId) return prev;
        const triageLevel = newCategory === 'EMERGENCY' ? 1 : newCategory === 'PRIORITY' ? 2 : 3;
        const levelName = newCategory === 'EMERGENCY' ? 'Level 1 - Resuscitation' : newCategory === 'PRIORITY' ? 'Level 2 - Priority' : 'Level 3 - Routine';
        return {
          ...prev,
          assessment: {
            ...prev.assessment,
            triage_category: newCategory,
            triage_level: triageLevel,
            urgency_level: levelName,
          },
        };
      });
      await loadDashboardData(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update patient triage category.');
    }
  };

  // Handle patient record deletion
  const handleDeletePatient = async (patientId: string) => {
    try {
      await deletePatient(patientId);
      setSelectedPatient(null);
      await loadDashboardData(true);
    } catch (err: any) {
      setError(err.message || 'Failed to delete patient record.');
    }
  };

  const routineEmergencyCount = patients.filter(
    (p) => p.assessment.triage_category === 'EMERGENCY' && p.status === 'WAITING'
  ).length;

  const activeTraumaCount = emergencyCases.filter(
    (c) => !['COMPLETED', 'TRANSFERRED', 'ADMITTED'].includes(c.status)
  ).length;

  const totalLevel1Count = routineEmergencyCount + activeTraumaCount;

  return (
    <div className="dashboard-content-area">
      {/* Overview Hero Section with Emergency Quick-Action */}
      <motion.div
        className="dashboard-hero-overview"
        initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' as const }}
      >
        <div className="hero-svg-overlay" aria-hidden="true" />
        <div className="hero-content-wrap">
          <div className="hero-text-block">
            <div className="hero-badge-pill">
              <span className="hero-dot" />
              <span>District Civil Hospital • Outpatient & Emergency Command</span>
            </div>
            <h1 className="hero-heading">OPD Clinical Acuity & Rapid Emergency Triage</h1>
            <p className="hero-subtext">
              Real-time physiological risk evaluation, non-linear waiting-time escalation, and dedicated emergency accident intake with zero registration delays.
            </p>
          </div>
          <div className="hero-actions-group">
            <Link
              to="/emergency-intake"
              className="hero-emergency-quick-btn"
              id="btn-hero-emergency-intake"
              title="Immediate Dedicated Level 1 Emergency Intake Page"
            >
              <span className="emergency-beacon-dot" aria-hidden="true" />
              <Ambulance size={18} />
              <span>Emergency Accident Intake</span>
            </Link>
            <div className="hero-stats-chips">
              <div className="hero-stat-chip">
                <span className="hero-stat-label">Shift Status</span>
                <span className="hero-stat-val">Morning Counter 01</span>
              </div>
              <div className="hero-stat-chip">
                <span className="hero-stat-label">Decision Support</span>
                <span className="hero-stat-val">Active Rules & ML</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 1. Summary Cards Section */}
      <motion.section
        className="dashboard-section"
        aria-labelledby="summary-cards-heading"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' as const }}
      >
        <h2 id="summary-cards-heading" className="sr-only">Triage Metrics Summary</h2>
        <SummaryCards
          metrics={{ ...metrics, ...acuityCounts }}
          departments={departmentWorkload}
          activeFilter={activeCardFilter}
          onCardClick={handleCardClick}
          isLoading={isLoading}
          error={error}
          onRetry={() => loadDashboardData(false)}
        />
      </motion.section>

      {/* 2. Hospital Clinical Analytics & Workload Overview (4 Realistic Clinical Charts) */}
      <motion.section
        className="dashboard-section"
        aria-labelledby="analytics-dashboard-heading"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 7 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: 'easeOut' as const }}
      >
        <HospitalAnalyticsDashboard
          patients={allPatients.length > 0 ? allPatients : patients}
          isLoading={isLoading}
        />
      </motion.section>

      {/* Feature 5: DEDICATED EMERGENCY CASES PANEL ABOVE ROUTINE OPD QUEUE */}
      <section className="dashboard-section" aria-label="Dedicated Emergency Cases Queue">
        <EmergencyQueuePanel
          cases={emergencyCases}
          isLoading={isLoading}
          onSelectCase={setSelectedEmergencyCase}
          onRefresh={() => loadDashboardData(false)}
          onIntakeClick={onEmergencyClick}
        />
      </section>

      {/* 3. Routine Patient Queue Table Section */}
      <motion.section
        className="dashboard-section"
        aria-labelledby="queue-table-heading"
        initial={shouldReduceMotion || totalLevel1Count > 0 ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: totalLevel1Count > 0 ? 0 : 0.25,
          ease: 'easeOut' as const,
          delay: shouldReduceMotion || totalLevel1Count > 0 ? 0 : 0.06,
        }}
      >
        <div className="section-title-wrap mb-2">
          <h2 id="queue-table-heading" className="section-title">Routine Outpatient Department Queue</h2>
          <span className="section-subtitle">Acuity-prioritized waiting list for scheduled OPD consultation rooms</span>
        </div>
        <PatientQueueTable
          patients={
            (activeCardFilter === 'today' ? patients.filter((p) => isPatientInHospitalToday(p.created_at)) : patients).filter(
              (p) => !selectedDepartment || (p.assessment?.recommended_department || '').toLowerCase().includes(selectedDepartment.toLowerCase())
            )
          }
          selectedTriageLevel={selectedTriageLevel}
          onTriageLevelChange={(val) => {
            setSelectedTriageLevel(val);
            setActiveCardFilter('');
            setSelectedDepartment('');
          }}
          selectedStatus={selectedStatus}
          onStatusChange={(val) => {
            setSelectedStatus(val);
            setActiveCardFilter('');
            setSelectedDepartment('');
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onViewDetails={setSelectedPatient}
          onUpdateStatus={handleUpdateStatus}
          isLoading={isLoading}
          error={error}
          onRetry={() => loadDashboardData(false)}
          onRegisterClick={onRegisterClick}
        />
      </motion.section>

      {/* Routine Patient Detail Modal */}
      {selectedPatient && (
        <PatientDetailModal
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onUpdateStatus={handleUpdateStatus}
          onUpdateCategory={handleUpdateCategory}
          onDeletePatient={handleDeletePatient}
        />
      )}

      {/* Emergency Trauma Case Detail Modal (Feature 4, 6) */}
      {selectedEmergencyCase && (
        <EmergencyCaseDetailModal
          caseItem={selectedEmergencyCase}
          isOpen={Boolean(selectedEmergencyCase)}
          onClose={() => setSelectedEmergencyCase(null)}
          onCaseUpdated={() => loadDashboardData(true)}
        />
      )}

      {/* Dedicated Clickable Card Patient List Modal */}
      <PatientListModal
        isOpen={isPatientListModalOpen}
        onClose={() => setIsPatientListModalOpen(false)}
        cardId={selectedCardCategory}
        cardTitle={getCardTitle(selectedCardCategory)}
        expectedCount={getCardExpectedCount(selectedCardCategory)}
        hospitalTimezone={metrics.hospital_timezone}
        onSelectPatient={(patient) => {
          setSelectedPatient(patient);
          setIsPatientListModalOpen(false);
        }}
        onSelectEmergencyCase={(caseItem) => {
          setSelectedEmergencyCase(caseItem);
          setIsPatientListModalOpen(false);
        }}
      />

      {/* New Patient Registration Modal */}
      <NewPatientModal
        isOpen={isRegisterModalOpen}
        onClose={onCloseRegisterModal}
        onPatientEnrolled={() => {
          loadDashboardData();
        }}
      />
    </div>
  );
};
