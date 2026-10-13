import React, { useState, useMemo } from 'react';
import type { PatientQueueItem } from '../../types/triage';
import {
  calculateArrivalsByHour,
  calculateTriageDistribution,
  calculateWaitTimeByDepartment,
  calculateDepartmentWorkload,
  filterPatientsByTimeRange,
  filterPatientsByDepartment,
  type TimeRangeOption,
} from '../../services/analyticsUtils';
import { PatientArrivalsChart } from './PatientArrivalsChart';
import { TriageDistributionChart } from './TriageDistributionChart';
import { DepartmentWaitTimesChart } from './DepartmentWaitTimesChart';
import { DepartmentWorkloadChart } from './DepartmentWorkloadChart';
import { BarChart3, Activity, Clock, ShieldAlert, Filter, RotateCcw, Info } from 'lucide-react';

interface HospitalAnalyticsDashboardProps {
  patients: PatientQueueItem[];
  isLoading?: boolean;
}

export const HospitalAnalyticsDashboard: React.FC<HospitalAnalyticsDashboardProps> = ({
  patients,
  isLoading = false,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('ALL');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  // Filter patients by active time range and department
  const filteredPatients = useMemo(() => {
    let list = filterPatientsByTimeRange(patients, timeRange);
    list = filterPatientsByDepartment(list, selectedDept);
    return list;
  }, [patients, timeRange, selectedDept]);

  // Memoize all calculations so they only recalculate when filtered array changes
  const { arrivalsResult, triageResult, waitTimesResult, workloadResult } = useMemo(() => {
    return {
      arrivalsResult: calculateArrivalsByHour(filteredPatients),
      triageResult: calculateTriageDistribution(filteredPatients),
      waitTimesResult: calculateWaitTimeByDepartment(filteredPatients),
      workloadResult: calculateDepartmentWorkload(filteredPatients),
    };
  }, [filteredPatients]);

  const emergencyPatientsCount = triageResult.categories.find((c) => c.category === 'EMERGENCY')?.count || 0;
  const overallAvgWait = waitTimesResult.departments.length > 0
    ? Math.round(
        waitTimesResult.departments.reduce((acc, d) => acc + d.avgWaitMinutes, 0) /
          waitTimesResult.departments.length
      )
    : 0;

  const hasActiveFilters = timeRange !== 'ALL' || selectedDept !== 'ALL';

  const handleResetFilters = () => {
    setTimeRange('ALL');
    setSelectedDept('ALL');
  };

  return (
    <div className="hospital-analytics-section" aria-labelledby="analytics-dashboard-heading">
      {/* Analytics Section Header */}
      <div className="analytics-section-header">
        <div className="analytics-header-titles">
          <div className="analytics-title-row">
            <div className="analytics-header-icon-box">
              <BarChart3 size={18} />
            </div>
            <h2 id="analytics-dashboard-heading" className="analytics-section-title">
              OPD Clinical Analytics & Workload Telemetry
            </h2>
            <span className="analytics-live-tag">
              {isLoading ? 'SYNCHRONIZING...' : 'STORED DATABASE RECORDS'}
            </span>
          </div>
          <p className="analytics-section-desc">
            Outpatient throughput, physiological risk distribution, and department load stratification for District Civil Hospital.
          </p>
        </div>

        {/* Quick Clinical Vital Badges */}
        <div className="analytics-quick-chips">
          <div className="analytics-quick-chip">
            <Activity size={14} className="quick-chip-icon text-teal" />
            <div className="quick-chip-data">
              <span className="quick-chip-label">Queue Volume</span>
              <span className="quick-chip-val">{filteredPatients.length} of {patients.length} Active</span>
            </div>
          </div>

          <div className="analytics-quick-chip chip-emergency-highlight">
            <ShieldAlert size={14} className="quick-chip-icon text-emergency" />
            <div className="quick-chip-data">
              <span className="quick-chip-label">Emergency Acuity</span>
              <span className="quick-chip-val">{emergencyPatientsCount} Immediate</span>
            </div>
          </div>

          <div className="analytics-quick-chip">
            <Clock size={14} className="quick-chip-icon text-priority" />
            <div className="quick-chip-data">
              <span className="quick-chip-label">Avg OPD Wait</span>
              <span className="quick-chip-val">~{overallAvgWait} min</span>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Filter & Transparency Bar */}
      <div
        className="analytics-filter-toolbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          padding: '10px 14px',
          background: 'var(--card-bg, #ffffff)',
          border: '1px solid var(--border-color, #e2e8f0)',
          borderRadius: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>
            <Filter size={14} /> Time Range:
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['ALL', 'MORNING', 'AFTERNOON'] as TimeRangeOption[]).map((tr) => (
              <button
                key={tr}
                type="button"
                onClick={() => setTimeRange(tr)}
                className={`filter-btn-pill ${timeRange === tr ? 'active' : ''}`}
                style={{
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: timeRange === tr ? 600 : 500,
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: timeRange === tr ? 'var(--primary-color, #0d9488)' : 'var(--border-color, #e2e8f0)',
                  background: timeRange === tr ? 'rgba(13, 148, 136, 0.1)' : 'transparent',
                  color: timeRange === tr ? 'var(--primary-color, #0d9488)' : 'var(--text-muted, #64748b)',
                  cursor: 'pointer',
                }}
              >
                {tr === 'ALL' ? 'Full Shift (08:00 - 17:00)' : tr === 'MORNING' ? 'Morning (08:00 - 12:00)' : 'Afternoon (12:00 - 17:00)'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted, #64748b)' }}>Department:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              style={{
                padding: '4px 8px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-app, #f8fafc)',
                color: 'var(--text-primary, #0f172a)',
              }}
              aria-label="Filter Analytics by Department"
            >
              <option value="ALL">All Departments</option>
              <option value="Casualty">Casualty / Emergency</option>
              <option value="General Medicine">General Medicine</option>
              <option value="Cardiology">Cardiology</option>
              <option value="Pulmonology">Pulmonology</option>
              <option value="Pediatrics">Pediatrics</option>
              <option value="Orthopedics">Orthopedics</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                fontSize: 12,
                background: 'transparent',
                border: 'none',
                color: 'var(--primary-color, #0d9488)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
              title="Reset all filters"
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted, #64748b)' }}>
          <Info size={13} />
          <span>Derived from stored database records • Synthetic baselines labeled</span>
        </div>
      </div>

      {/* 2x2 Grid of Clinical Charts */}
      <div className="analytics-charts-grid">
        {/* CHART 1: Patient Arrivals by Hour */}
        <PatientArrivalsChart
          data={arrivalsResult.data}
          isSyntheticFallback={arrivalsResult.isSyntheticFallback}
          totalRecorded={arrivalsResult.totalRecorded}
        />

        {/* CHART 2: Triage Distribution Donut */}
        <TriageDistributionChart
          categories={triageResult.categories}
          total={triageResult.total}
        />

        {/* CHART 3: Waiting Time by Department */}
        <DepartmentWaitTimesChart
          data={waitTimesResult.departments}
          isSimulated={waitTimesResult.isSimulated}
        />

        {/* CHART 4: Department Workload */}
        <DepartmentWorkloadChart
          data={workloadResult}
        />
      </div>
    </div>
  );
};
export default HospitalAnalyticsDashboard;
