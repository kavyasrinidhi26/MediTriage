import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Clock, AlertCircle } from 'lucide-react';
import type { DepartmentWaitTimeData } from '../../services/analyticsUtils';

interface DepartmentWaitTimesChartProps {
  data: DepartmentWaitTimeData[];
  isSimulated: boolean;
}

export const DepartmentWaitTimesChart: React.FC<DepartmentWaitTimesChartProps> = ({
  data,
  isSimulated,
}) => {
  // Color coding wait times: < 15 min (teal), 15-30 min (amber), > 30 min (coral/red)
  const getWaitColor = (minutes: number) => {
    if (minutes <= 15) return '#0d9488'; // Teal
    if (minutes <= 30) return '#d97706'; // Amber
    return '#e11d48'; // Red/Rose
  };

  return (
    <div className="analytics-card" role="region" aria-label="Waiting Time by Department Horizontal Bar Chart">
      <div className="analytics-card-header">
        <div className="analytics-card-title-group">
          <div className="analytics-card-icon-box">
            <Clock size={16} />
          </div>
          <div>
            <h3 className="analytics-card-title">Estimated Wait Time by Department</h3>
            <p className="analytics-card-subtitle">
              Average elapsed time from registration to clinician consultation
            </p>
          </div>
        </div>
        <div className="analytics-card-badge-wrap">
          {isSimulated ? (
            <span className="badge-synthetic" title="Queue is empty or lacks elapsed duration; displaying simulated outpatient benchmark">
              SIMULATED BENCHMARK
            </span>
          ) : (
            <span className="badge-actual" title="Calculated from real arrival timestamps in active queue">
              ELAPSED TIMESTAMPS
            </span>
          )}
        </div>
      </div>

      <div className="analytics-chart-container" style={{ height: 260, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 28, left: 30, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis
              type="number"
              unit=" min"
              tick={{ fill: '#475569', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="department"
              tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
              width={110}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload as DepartmentWaitTimeData;
                  return (
                    <div className="chart-tooltip-box">
                      <p className="tooltip-title">{item.department}</p>
                      <div className="tooltip-row">
                        <span className="tooltip-label">Average Wait:</span>
                        <span className="tooltip-value font-bold">{item.avgWaitMinutes} minutes</span>
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-label">Maximum Wait:</span>
                        <span className="tooltip-value">{item.maxWaitMinutes} minutes</span>
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-label">Waiting Patients:</span>
                        <span className="tooltip-value">{item.patientCount}</span>
                      </div>
                      <p className="tooltip-disclaimer">
                        {item.isSimulated
                          ? 'Simulated OPD benchmark based on standard rush profile.'
                          : 'Calculated from actual queue arrival timestamps.'}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="avgWaitMinutes" radius={[0, 4, 4, 0]} barSize={16}>
              {data.map((entry, idx) => (
                <Cell key={`bar-${idx}`} fill={getWaitColor(entry.avgWaitMinutes)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="analytics-card-footer">
        <AlertCircle size={13} className="footer-info-icon" />
        <span>
          {isSimulated
            ? 'Simulated performance reference. Real hospital metrics will never be fabricated.'
            : 'Times update automatically as patients are called in by attending physicians.'}
        </span>
      </div>
    </div>
  );
};
export default DepartmentWaitTimesChart;
