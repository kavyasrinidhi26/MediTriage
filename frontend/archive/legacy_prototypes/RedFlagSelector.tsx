import React from 'react';
import type { RedFlagChecklist } from '../../types/triage';
import { AlertCircle, Flame, HeartCrack, Wind, Baby, Zap, ShieldAlert, Droplets } from 'lucide-react';

interface RedFlagSelectorProps {
  redFlags: RedFlagChecklist;
  onChange: (updated: RedFlagChecklist) => void;
}

export const RedFlagSelector: React.FC<RedFlagSelectorProps> = ({ redFlags, onChange }) => {
  const toggleFlag = (key: keyof RedFlagChecklist) => {
    onChange({
      ...redFlags,
      [key]: !redFlags[key],
    });
  };

  const flagItems: Array<{
    key: keyof RedFlagChecklist;
    label: string;
    subtext: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }> = [
    {
      key: 'severe_respiratory_distress',
      label: 'Severe Respiratory Distress',
      subtext: 'Cyanosis, gasping, stridor, inability to speak full sentences',
      icon: Wind,
    },
    {
      key: 'crushing_chest_pain',
      label: 'Crushing Cardiac Chest Pain',
      subtext: 'Substernal pressure, radiating to jaw/arm with sweating',
      icon: HeartCrack,
    },
    {
      key: 'acute_neurological_deficit',
      label: 'Acute Neurological Deficit',
      subtext: 'Sudden face droop, arm weakness, slurred speech, active seizure',
      icon: Zap,
    },
    {
      key: 'massive_bleeding_or_shock',
      label: 'Massive Hemorrhage / Shock',
      subtext: 'Arterial bleeding, profound pallor, cold clammy skin',
      icon: Droplets,
    },
    {
      key: 'severe_trauma',
      label: 'Major Trauma / Poly-trauma',
      subtext: 'High-speed RTA, fall from height, penetrating injury, open fracture',
      icon: ShieldAlert,
    },
    {
      key: 'active_labor_or_eclampsia',
      label: 'Obstetric Emergency',
      subtext: 'Active crowning, severe antepartum bleeding, eclamptic fits',
      icon: Baby,
    },
    {
      key: 'high_fever_with_stiff_neck',
      label: 'Fever with Meningismus',
      subtext: 'Neck rigidity, altered sensorium, petechial rash',
      icon: Flame,
    },
    {
      key: 'severe_dehydration_lethargy',
      label: 'Severe Dehydration / Flaccid',
      subtext: 'Sunken eyes, delayed skin pinch > 2s, limp pediatric state',
      icon: AlertCircle,
    },
  ];

  const activeCount = Object.values(redFlags).filter(Boolean).length;

  return (
    <div className="red-flags-container">
      <div className="section-header-row">
        <div>
          <h3 className="section-title text-danger">
            Clinical Red Flag Checklist
            {activeCount > 0 && (
              <span className="red-flag-count-badge">
                {activeCount} CRITICAL ALERT{activeCount > 1 ? 'S' : ''}
              </span>
            )}
          </h3>
          <p className="section-description">
            Selecting any red flag immediately escalates triage category to RED / CASUALTY.
          </p>
        </div>
      </div>

      <div className="red-flags-grid">
        {flagItems.map((item) => {
          const isChecked = !!redFlags[item.key];
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => toggleFlag(item.key)}
              className={`red-flag-card ${isChecked ? 'red-flag-card-active' : ''}`}
            >
              <div className="red-flag-icon-wrap">
                <Icon size={20} className={isChecked ? 'icon-active' : 'icon-muted'} />
              </div>
              <div className="red-flag-text-wrap">
                <span className="red-flag-label">{item.label}</span>
                <span className="red-flag-subtext">{item.subtext}</span>
              </div>
              <div className="red-flag-checkbox">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  aria-label={item.label}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
