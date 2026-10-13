import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Building2, Inbox } from 'lucide-react';
import type { DepartmentWorkloadData } from '../../services/analyticsUtils';

interface DepartmentWorkloadChartProps {
  data: DepartmentWorkloadData[];
}

export const DepartmentWorkloadChart: React.FC<DepartmentWorkloadChartProps> = ({ data }) => {
  const hasData = data.length > 0 && data.some((d) => d.totalWaiting > 0);

  return (
    <div className="analytics-card" role="region" aria-label="Department Workload Bar Chart">
      <div className="analytics-card-header">
        <div className="analytics-card-title-group">
          <div className="analytics-card-icon-box">
            <Building2 size={16} />
          </div>
          <div>
            <h3 className="analytics-card-title">Department Clinical Workload</h3>
            <p className="analytics-card-subtitle">
              Active patient queue volume and acuity distribution by specialty
            </p>
          </div>
        </div>
        <div className="analytics-card-badge-wrap">
          <span className="badge-live-calc">REAL QUEUE RECORDS</span>
        </div>
      </div>

      <div className="analytics-chart-container" style={{ height: 260, width: '100%' }}>
        {!hasData ? (
          <div className="analytics-empty-state">
            <Inbox size={32} className="empty-icon" />
            <p className="empty-title">No Active Department Workload</p>
            <p className="empty-sub">
              There are currently no patients waiting in specialty queues. New patient registrations will appear here.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 12, right: 18, left: -10, bottom: 25 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="department"
                tick={{ fill: '#475569', fontSize: 10 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                angle={-18}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tick={{ fill: '#475569', fontSize: 11 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const total = payload.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
                    return (
                      <div className="chart-tooltip-box">
                        <p className="tooltip-title">{label}</p>
                        <p className="tooltip-sub font-semibold">Total Waiting: {total} patients</p>
                        <div className="tooltip-divider" />
                        {payload.map((entry, idx) => (
                          <div key={idx} className="tooltip-row">
                            <span className="tooltip-indicator" style={{ backgroundColor: entry.color }} />
                            <span className="tooltip-label">{entry.name}:</span>
                            <span className="tooltip-value">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                wrapperStyle={{ fontSize: 11, paddingBottom: 6 }}
              />
              <Bar dataKey="emergencyCount" name="Emergency (L1)" stackId="a" fill="#dc2626" />
              <Bar dataKey="priorityCount" name="Priority (L2-3)" stackId="a" fill="#d97706" />
              <Bar dataKey="routineCount" name="Routine (L4-5)" stackId="a" fill="#14b8a6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="analytics-card-footer">
        <span className="footer-status-dot" />
        <span>
          Aggregated in real-time from active queue entries and AI specialty department assignments.
        </span>
      </div>
    </div>
  );
};
export default DepartmentWorkloadChart;
