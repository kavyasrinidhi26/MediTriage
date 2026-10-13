import React, { useState, useEffect, useCallback } from 'react';
import type { PatientQueueItem } from '../types/triage';
import { fetchQueue } from '../services/api';
import { HospitalAnalyticsDashboard } from '../components/analytics/HospitalAnalyticsDashboard';
import { RefreshCw, ArrowLeft, Users, Brain } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AnalyticsPage: React.FC = () => {
  const [patients, setPatients] = useState<PatientQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = React.useRef(true);
  const isFetchingRef = React.useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!isSilent && isMountedRef.current) setIsLoading(true);
      if (isMountedRef.current) setError(null);
      const queue = await fetchQueue({});
      if (isMountedRef.current) {
        setPatients(queue);
      }
    } catch (err: unknown) {
      if (isMountedRef.current && !isSilent) {
        setError(err instanceof Error ? err.message : 'Error fetching analytics queue records.');
      }
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current && !isSilent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData(false);

    const intervalId = setInterval(() => {
      loadData(true);
    }, 6000);

    return () => {
      clearInterval(intervalId);
    };
  }, [loadData]);

  return (
    <div className="dashboard-content-area">
      {/* Top action header for Analytics */}
      <div className="page-header-actions-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <ArrowLeft size={14} />
            <span>Back to Dashboard</span>
          </Link>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
            District Civil Hospital • Outpatient Flow Analysis
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/evaluation" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <Brain size={14} />
            <span>Model ML Analytics</span>
          </Link>
          <Link to="/queue" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <Users size={14} />
            <span>Manage Queue</span>
          </Link>
          <button
            type="button"
            onClick={() => loadData(false)}
            disabled={isLoading}
            className="btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
          >
            <RefreshCw size={14} className={isLoading ? 'spin-icon' : ''} />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="table-error-state" style={{ marginBottom: 20 }}>
          <p>{error}</p>
          <button type="button" onClick={() => loadData(false)} className="btn-retry">
            Retry Connection
          </button>
        </div>
      )}

      {/* Main 4 Clinical Analytics Charts */}
      <HospitalAnalyticsDashboard patients={patients} isLoading={isLoading} />
    </div>
  );
};
export default AnalyticsPage;
