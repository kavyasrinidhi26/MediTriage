import React, { useState } from 'react';
import {
  Settings,
  Building2,
  ShieldAlert,
  CheckCircle2,
  Sliders,
  Volume2,
  Lock,
} from 'lucide-react';
import { LottieAnimation } from '../components/common/LottieAnimation';
import successActionLottie from '../assets/lottie/success-action.json';

export const SettingsPage: React.FC = () => {
  const [hospitalName, setHospitalName] = useState('District Civil Hospital');
  const [counterId, setCounterId] = useState('OPD-Counter-01');
  const [shift, setShift] = useState('Morning (08:00 - 14:00)');
  const [emergencySoundAlert, setEmergencySoundAlert] = useState(true);
  const [bilingualAssist, setBilingualAssist] = useState(true);
  const [autoEscalateMinutes, setAutoEscalateMinutes] = useState(45);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="inner-page-container">
      {/* Header */}
      <div className="inner-page-header">
        <div className="header-text-group">
          <div className="title-with-icon">
            <div className="page-icon-badge">
              <Settings size={22} />
            </div>
            <div>
              <h1 className="inner-page-title">OPD System Settings</h1>
              <p className="inner-page-subtitle">
                Configure hospital counter identification, escalation timing thresholds, language assistance, and clinical decision support preferences.
              </p>
            </div>
          </div>
        </div>

        <div className="header-notice-pill">
          <Sliders size={14} />
          <span>Local Counter Preferences</span>
        </div>
      </div>

      {saveSuccess && (
        <div className="settings-saved-banner" role="status">
          <LottieAnimation
            animationData={successActionLottie}
            width={24}
            height={24}
            loop={false}
            fallbackIcon={<CheckCircle2 size={18} />}
            aria-label="Settings saved confirmation"
          />
          <span>Settings saved successfully for current session!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="settings-grid">
        {/* Section 1: Facility Identification */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Building2 size={18} className="settings-card-icon" />
            <h2 className="settings-card-title">Facility & Counter Identity</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-field">
              <label htmlFor="hospital-name" className="settings-label">
                Hospital / Institution Name
              </label>
              <input
                id="hospital-name"
                type="text"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                className="settings-input"
              />
            </div>

            <div className="settings-field">
              <label htmlFor="counter-id" className="settings-label">
                Intake Counter Identifier
              </label>
              <input
                id="counter-id"
                type="text"
                value={counterId}
                onChange={(e) => setCounterId(e.target.value)}
                className="settings-input"
              />
            </div>

            <div className="settings-field">
              <label htmlFor="shift-select" className="settings-label">
                Active Nursing Shift
              </label>
              <select
                id="shift-select"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="settings-select"
              >
                <option value="Morning (08:00 - 14:00)">Morning (08:00 - 14:00)</option>
                <option value="Evening (14:00 - 20:00)">Evening (14:00 - 20:00)</option>
                <option value="Night Casualty (20:00 - 08:00)">Night Casualty (20:00 - 08:00)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Clinical Alerts & Language */}
        <div className="settings-card">
          <div className="settings-card-header">
            <Volume2 size={18} className="settings-card-icon" />
            <h2 className="settings-card-title">Alerts & Language Assistance</h2>
          </div>
          <div className="settings-card-body">
            <div className="settings-toggle-field">
              <div>
                <span className="toggle-title">Emergency Level 1 Audio Alert</span>
                <span className="toggle-desc">
                  Play audible prompt when Red-Category casualty or severe shock index is identified.
                </span>
              </div>
              <input
                type="checkbox"
                checked={emergencySoundAlert}
                onChange={(e) => setEmergencySoundAlert(e.target.checked)}
                className="settings-toggle"
                aria-label="Toggle Emergency Audio Alert"
              />
            </div>

            <div className="settings-toggle-field">
              <div>
                <span className="toggle-title">Telugu Clinical NLP Assist</span>
                <span className="toggle-desc">
                  Automatically parse Telugu complaints and transliterated terms with negation detection.
                </span>
              </div>
              <input
                type="checkbox"
                checked={bilingualAssist}
                onChange={(e) => setBilingualAssist(e.target.checked)}
                className="settings-toggle"
                aria-label="Toggle Telugu NLP Assist"
              />
            </div>

            <div className="settings-field">
              <label htmlFor="escalate-minutes" className="settings-label">
                Wait Time Starvation Escalation (Minutes)
              </label>
              <input
                id="escalate-minutes"
                type="number"
                min="15"
                max="180"
                value={autoEscalateMinutes}
                onChange={(e) => setAutoEscalateMinutes(Number(e.target.value))}
                className="settings-input"
              />
              <span className="settings-hint">
                Patients waiting longer than this threshold receive automated review escalation.
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Invariant Safety Policies (Locked) */}
        <div className="settings-card settings-card-locked">
          <div className="settings-card-header">
            <ShieldAlert size={18} className="settings-card-icon-danger" />
            <h2 className="settings-card-title">Immutable Safety Guardrails</h2>
            <Lock size={14} className="lock-icon" />
          </div>
          <div className="settings-card-body">
            <ul className="locked-safety-list">
              <li>
                <strong>Critical Red Flags:</strong> Severe hypoxemia (SpO2 &le; 89%), Shock Index &gt; 1.0, and pulse 0 bpm override ML models to Level 1 Emergency. (Enforced by backend)
              </li>
              <li>
                <strong>Abstention Workflow:</strong> Conflicting vitals require bedside human verification and cannot be bypassed.
              </li>
              <li>
                <strong>Audit Trail:</strong> All status transitions and nurse overrides are logged immutably in SQLite.
              </li>
            </ul>
          </div>
        </div>

        <div className="settings-actions-footer">
          <button type="submit" className="btn-primary">
            Save Preferences
          </button>
        </div>
      </form>
    </div>
  );
};

export default SettingsPage;
