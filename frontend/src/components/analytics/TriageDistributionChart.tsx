import React from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import { Activity, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { TriageCategoryDistribution } from '../../services/analyticsUtils';

interface TriageDistributionChartProps {
  categories: TriageCategoryDistribution[];
  total: number;
}

export const TriageDistributionChart: React.FC<TriageDistributionChartProps> = ({
  categories,
  total,
}) => {
  const chartData = categories.map((cat) => ({
    name: cat.displayName,
    value: cat.count,
    percentage: cat.percentage,
    color: cat.color,
    clinicalDescription: cat.clinicalDescription,
    categoryKey: cat.category,
  }));

  const getCategoryIcon = (categoryKey: string) => {
    switch (categoryKey) {
      case 'EMERGENCY':
        return <ShieldAlert size={14} className="text-emergency" />;
      case 'PRIORITY':
        return <AlertTriangle size={14} className="text-priority" />;
      default:
        return <CheckCircle2 size={14} className="text-routine" />;
    }
  };

  return (
    <div className="analytics-card" role="region" aria-label="Triage Distribution Donut Chart">
      <div className="analytics-card-header">
        <div className="analytics-card-title-group">
          <div className="analytics-card-icon-box">
            <Activity size={16} />
          </div>
          <div>
            <h3 className="analytics-card-title">Triage Acuity Distribution</h3>
            <p className="analytics-card-subtitle">
              Current queue breakdown by physiological risk category
            </p>
          </div>
        </div>
        <div className="analytics-card-badge-wrap">
          <span className="badge-live-calc">LIVE QUEUE CALCULATION</span>
        </div>
      </div>

      <div className="distribution-content-wrapper">
        <div className="distribution-chart-wrapper" style={{ height: 210, width: '48%', minWidth: 180 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={3}
                stroke="#ffffff"
                strokeWidth={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="chart-tooltip-box">
                        <p className="tooltip-title" style={{ color: data.color }}>
                          {data.name}
                        </p>
                        <p className="tooltip-sub">{data.clinicalDescription}</p>
                        <div className="tooltip-row">
                          <span className="tooltip-label">Patients:</span>
                          <span className="tooltip-value">{data.value}</span>
                        </div>
                        <div className="tooltip-row">
                          <span className="tooltip-label">Proportion:</span>
                          <span className="tooltip-value">{data.percentage}%</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centered Total Indicator */}
          <div className="donut-center-overlay" aria-hidden="true">
            <span className="donut-center-num">{total}</span>
            <span className="donut-center-label">Patients</span>
          </div>
        </div>

        {/* Clinical Category Legend List */}
        <div className="distribution-legend-list">
          {categories.map((cat) => (
            <div key={cat.category} className="legend-category-row">
              <div className="legend-category-header">
                <div className="legend-title-wrap">
                  {getCategoryIcon(cat.category)}
                  <span className="legend-cat-name">{cat.displayName}</span>
                </div>
                <div className="legend-metrics-wrap">
                  <span className="legend-count-badge" style={{ backgroundColor: `${cat.color}18`, color: cat.color }}>
                    {cat.count}
                  </span>
                  <span className="legend-pct-text">{cat.percentage}%</span>
                </div>
              </div>
              <p className="legend-cat-desc">{cat.clinicalDescription}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="analytics-card-footer">
        <span className="footer-status-dot" />
        <span>
          Emergency category overrides any ML score. Values reflect real-time counts across active registrations.
        </span>
      </div>
    </div>
  );
};
export default TriageDistributionChart;
