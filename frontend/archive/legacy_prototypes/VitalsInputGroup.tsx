import React from 'react';
import type { VitalSigns, AVPUScale } from '../../types/triage';

interface VitalsInputGroupProps {
  vitals: VitalSigns;
  onChange: (updated: VitalSigns) => void;
}

export const VitalsInputGroup: React.FC<VitalsInputGroupProps> = ({ vitals, onChange }) => {
  const handleChange = (field: keyof VitalSigns, value: any) => {
    onChange({
      ...vitals,
      [field]: value === '' ? undefined : value,
    });
  };

  // Helper range status helpers
  const getSpo2Status = (val?: number | null) => {
    if (val == null || isNaN(val)) return null;
    if (val < 90) return { label: 'CRITICAL HYPOXIA', color: 'critical' };
    if (val <= 94) return { label: 'Borderline Low', color: 'warning' };
    return { label: 'Normal', color: 'normal' };
  };

  const getHrStatus = (val?: number | null) => {
    if (val == null || isNaN(val)) return null;
    if (val > 130 || val < 40) return { label: 'CRITICAL RATE', color: 'critical' };
    if (val > 100 || val < 50) return { label: 'Borderline Rate', color: 'warning' };
    return { label: 'Normal (60-100)', color: 'normal' };
  };

  const getBpStatus = (val?: number | null) => {
    if (val == null || isNaN(val)) return null;
    if (val < 90 || val >= 200) return { label: 'CRITICAL BP', color: 'critical' };
    if (val >= 160 || val < 100) return { label: 'Abnormal BP', color: 'warning' };
    return { label: 'Normal Range', color: 'normal' };
  };

  const getRrStatus = (val?: number | null) => {
    if (val == null || isNaN(val)) return null;
    if (val > 30 || val < 8) return { label: 'CRITICAL RESP', color: 'critical' };
    if (val > 22) return { label: 'Tachypnea', color: 'warning' };
    return { label: 'Normal (12-20)', color: 'normal' };
  };

  const spo2Status = getSpo2Status(vitals.spo2);
  const hrStatus = getHrStatus(vitals.heart_rate);
  const bpStatus = getBpStatus(vitals.systolic_bp);
  const rrStatus = getRrStatus(vitals.respiratory_rate);

  return (
    <div className="vitals-section-card">
      <div className="section-header-row">
        <div>
          <h3 className="section-title">Physiological Vital Signs</h3>
          <p className="section-description">
            Measure and enter current patient bedside parameters for automated risk scoring.
          </p>
        </div>
      </div>

      <div className="vitals-grid">
        {/* Oxygen Saturation SpO2 */}
        <div className="form-group vital-input-card">
          <div className="vital-header-label">
            <label htmlFor="spo2-input">SpO2 (%)</label>
            {spo2Status && (
              <span className={`vital-status-pill vital-pill-${spo2Status.color}`}>
                {spo2Status.label}
              </span>
            )}
          </div>
          <input
            id="spo2-input"
            type="number"
            min="40"
            max="100"
            step="0.1"
            placeholder="e.g. 98"
            value={vitals.spo2 ?? ''}
            onChange={(e) => handleChange('spo2', e.target.value === '' ? '' : parseFloat(e.target.value))}
            className={`form-input ${spo2Status?.color === 'critical' ? 'input-critical' : ''}`}
          />
          <span className="input-hint">Target: ≥ 95% (Hypoxia: &lt; 90%)</span>
        </div>

        {/* Heart Rate */}
        <div className="form-group vital-input-card">
          <div className="vital-header-label">
            <label htmlFor="hr-input">Pulse / HR (bpm)</label>
            {hrStatus && (
              <span className={`vital-status-pill vital-pill-${hrStatus.color}`}>
                {hrStatus.label}
              </span>
            )}
          </div>
          <input
            id="hr-input"
            type="number"
            min="20"
            max="250"
            placeholder="e.g. 78"
            value={vitals.heart_rate ?? ''}
            onChange={(e) => handleChange('heart_rate', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className={`form-input ${hrStatus?.color === 'critical' ? 'input-critical' : ''}`}
          />
          <span className="input-hint">Target: 60 - 100 bpm</span>
        </div>

        {/* Systolic BP */}
        <div className="form-group vital-input-card">
          <div className="vital-header-label">
            <label htmlFor="sbp-input">Systolic BP (mmHg)</label>
            {bpStatus && (
              <span className={`vital-status-pill vital-pill-${bpStatus.color}`}>
                {bpStatus.label}
              </span>
            )}
          </div>
          <input
            id="sbp-input"
            type="number"
            min="40"
            max="260"
            placeholder="e.g. 120"
            value={vitals.systolic_bp ?? ''}
            onChange={(e) => handleChange('systolic_bp', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className={`form-input ${bpStatus?.color === 'critical' ? 'input-critical' : ''}`}
          />
          <span className="input-hint">Shock: &lt; 90 | Crisis: ≥ 200</span>
        </div>

        {/* Diastolic BP */}
        <div className="form-group vital-input-card">
          <div className="vital-header-label">
            <label htmlFor="dbp-input">Diastolic BP (mmHg)</label>
          </div>
          <input
            id="dbp-input"
            type="number"
            min="30"
            max="160"
            placeholder="e.g. 80"
            value={vitals.diastolic_bp ?? ''}
            onChange={(e) => handleChange('diastolic_bp', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className="form-input"
          />
          <span className="input-hint">Target: 60 - 90 mmHg</span>
        </div>

        {/* Respiratory Rate */}
        <div className="form-group vital-input-card">
          <div className="vital-header-label">
            <label htmlFor="rr-input">Resp Rate (breaths/min)</label>
            {rrStatus && (
              <span className={`vital-status-pill vital-pill-${rrStatus.color}`}>
                {rrStatus.label}
              </span>
            )}
          </div>
          <input
            id="rr-input"
            type="number"
            min="4"
            max="70"
            placeholder="e.g. 16"
            value={vitals.respiratory_rate ?? ''}
            onChange={(e) => handleChange('respiratory_rate', e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            className={`form-input ${rrStatus?.color === 'critical' ? 'input-critical' : ''}`}
          />
          <span className="input-hint">Target: 12 - 20 (Severe: &gt; 30)</span>
        </div>

        {/* Temperature */}
        <div className="form-group vital-input-card">
          <div className="vital-header-label">
            <label htmlFor="temp-input">Temperature (°F)</label>
          </div>
          <input
            id="temp-input"
            type="number"
            min="90"
            max="110"
            step="0.1"
            placeholder="e.g. 98.6"
            value={vitals.temperature_f ?? ''}
            onChange={(e) => handleChange('temperature_f', e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="form-input"
          />
          <span className="input-hint">Fever: &gt; 100.4°F | High: ≥ 103°F</span>
        </div>
      </div>

      {/* AVPU Scale Selector */}
      <div className="avpu-wrapper">
        <label className="field-label-bold">Consciousness Level (AVPU Scale)</label>
        <div className="avpu-buttons-row">
          {(
            [
              { key: 'ALERT', label: 'A — Alert', desc: 'Fully awake, responds spontaneously' },
              { key: 'VERBAL', label: 'V — Voice', desc: 'Responds only when spoken to loudly' },
              { key: 'PAIN', label: 'P — Pain', desc: 'Responds only to painful stimulation' },
              { key: 'UNRESPONSIVE', label: 'U — Unresponsive', desc: 'No verbal or motor response' },
            ] as const
          ).map((item) => {
            const isSelected = vitals.avpu === item.key;
            const isDanger = item.key === 'PAIN' || item.key === 'UNRESPONSIVE';
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleChange('avpu', item.key as AVPUScale)}
                className={`avpu-btn ${isSelected ? (isDanger ? 'avpu-selected-danger' : 'avpu-selected') : ''}`}
              >
                <span className="avpu-btn-title">{item.label}</span>
                <span className="avpu-btn-desc">{item.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
