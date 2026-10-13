import React, { useState, useEffect, useCallback } from 'react';
import type { PatientQueueItem, QueueStatus } from '../types/triage';
import { fetchQueue, updatePatientStatus, fetchDepartments } from '../services/api';
import { QueueFilters } from '../components/queue/QueueFilters';
import { QueueTable } from '../components/queue/QueueTable';
import { Users, AlertTriangle } from 'lucide-react';

export const LiveQueuePage: React.FC = () => {
  const [queue, setQueue] = useState<PatientQueueItem[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [queueData, deptList] = await Promise.all([
        fetchQueue({
          search: search.trim() || undefined,
          category: category || undefined,
          department: department || undefined,
          status: status || undefined,
        }),
        departments.length === 0 ? fetchDepartments() : Promise.resolve(departments),
      ]);
      setQueue(queueData);
      if (departments.length === 0) setDepartments(deptList);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch queue data');
    } finally {
      setLoading(false);
    }
  }, [search, category, department, status, departments]);

  useEffect(() => {
    loadData();
    // Auto-refresh every 15 seconds to simulate real-time hospital triage monitor
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleStatusChange = async (id: string, newStatus: QueueStatus, doctorRoom?: string) => {
    try {
      setUpdating(true);
      await updatePatientStatus(id, newStatus, doctorRoom);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update patient status');
    } finally {
      setUpdating(false);
    }
  };

  const emergencyCount = queue.filter((i) => i.assessment.triage_category === 'EMERGENCY' && i.status === 'WAITING').length;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Users className="page-title-icon" size={26} />
            Live OPD Prioritized Queue Monitor
          </h1>
          <p className="page-subtitle">
            Dynamic acuity-based queue ordering: Critical emergency patients are automatically escalated above routine token holders.
          </p>
        </div>
      </div>

      {emergencyCount > 0 && (
        <div className="emergency-alert-banner">
          <AlertTriangle size={20} className="emergency-blink" />
          <span>
            <strong>URGENT ATTENTION:</strong> {emergencyCount} Red-Category patient(s) currently waiting! Immediate casualty intervention required.
          </span>
        </div>
      )}

      {error && (
        <div className="error-alert">
          <span>{error}</span>
        </div>
      )}

      <QueueFilters
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        department={department}
        onDepartmentChange={setDepartment}
        departments={departments}
        status={status}
        onStatusChange={setStatus}
        onRefresh={loadData}
        isLoading={loading}
      />

      <QueueTable
        items={queue}
        onStatusChange={handleStatusChange}
        isUpdating={updating}
      />
    </div>
  );
};
