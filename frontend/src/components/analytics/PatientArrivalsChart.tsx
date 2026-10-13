import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Users, Info } from 'lucide-react';
import type { HourlyArrivalData } from '../../services/analyticsUtils';

interface PatientArrivalsChartProps {
  data: HourlyArrivalData[];
  isSyntheticFallback: boolean;
  totalRecorded: number;
}

export const PatientArrivalsChart: React.FC<PatientArrivalsChartProps> = ({
  data,
  isSyntheticFallback,
  totalRecorded,
}) => {
  return (
    <div className="analytics-card" role="region" aria-label="Patient Arrivals Over Time Chart">
      <div className="analytics-card-header">
        <div className="analytics-card-title-group">
          <div className="analytics-card-icon-box">
            <Users size={16} />
          </div>
          <div>
            <h3 className="analytics-card-title">Patient Arrivals by Hour</h3>
            <p className="analytics-card-subtitle">
              OPD Registration flow & rush stratification across standard clinic hours
            </p>
          </div>
        </div>
        <div className="analytics-card-badge-wrap">
          {isSyntheticFallback ? (
            <span className="badge-synthetic" title="Historical timestamps not available in queue cache; showing synthetic clinical baseline">
              SYNTHETIC BASELINE
            </span>
          ) : (
            <span className="badge-actual" title={`${totalRecorded} patient arrival timestamps recorded`}>
              LIVE ARRIVALS ({totalRecorded})
            </span>
          )}
        </div>
      </div>

      <div className="analytics-chart-container" style={{ height: 260, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 18, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="hourLabel"
              tick={{ fill: '#475569', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={false}
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
                  return (
                    <div className="chart-tooltip-box">
                      <p className="tooltip-title">{label}</p>
                      <div className="tooltip-row">
                        <span className="tooltip-indicator" style={{ backgroundColor: '#0d9488' }} />
                        <span className="tooltip-label">Current Shift Arrivals:</span>
                        <span className="tooltip-value">{payload[0]?.value ?? 0} registered</span>
                      </div>
                      <div className="tooltip-row">
                        <span className="tooltip-indicator" style={{ backgroundColor: '#94a3b8' }} />
                        <span className="tooltip-label">Synthetic Historical Baseline:</span>
                        <span className="tooltip-value">{payload[1]?.value ?? 0} expected</span>
                      </div>
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
            <Line
              type="monotone"
              name="Current Shift Arrivals (Stored Timestamps)"
              dataKey="actualCount"
              stroke="#0d9488"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: '#0d9488' }}
              activeDot={{ r: 5.5, stroke: '#0f766e', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              name="Synthetic Historical Baseline"
              dataKey="syntheticBaseline"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="analytics-card-footer">
        <Info size={13} className="footer-info-icon" />
        <span>
          {isSyntheticFallback
            ? 'Displaying synthetic outpatient arrival baseline for comparison. Live registrations will populate automatically as patients register.'
            : 'Arrival points reflect authentic patient registration timestamps recorded at District Civil Hospital OPD intake. Synthetic baseline shown for comparative shift rush.'}
        </span>
      </div>
    </div>
  );
};
export default PatientArrivalsChart;
