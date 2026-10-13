import React, { useState, useEffect } from 'react';
import type { QueueSummaryStats } from '../types/triage';
import { fetchStats } from '../services/api';
import { StatsOverview } from '../components/stats/StatsOverview';
import { BarChart3, RefreshCw } from 'lucide-react';

export const HospitalDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<QueueSummaryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchStats();
      setStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load hospital statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <BarChart3 className="page-title-icon" size={26} />
            Hospital OPD Operations & Rush Analytics
          </h1>
          <p className="page-subtitle">
            Aggregate outpatient load metrics, acuity distribution, and departmental patient pressure.
          </p>
        </div>
        <button
          type="button"
          onClick={loadStats}
          disabled={loading}
          className="btn-secondary"
        >
          <RefreshCw size={15} className={loading ? 'spin-icon' : ''} />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {error && (
        <div className="error-alert">
          <span>{error}</span>
        </div>
      )}

      <StatsOverview stats={stats} isLoading={loading} />
    </div>
  );
};
