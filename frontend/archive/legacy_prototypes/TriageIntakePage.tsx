import React from 'react';
import { TriageForm } from '../components/triage/TriageForm';
import { AlertBanner } from '../components/common/AlertBanner';
import { ClipboardList } from 'lucide-react';

export const TriageIntakePage: React.FC = () => {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ClipboardList className="page-title-icon" size={26} />
            OPD Triage & Risk Stratification Desk
          </h1>
          <p className="page-subtitle">
            Rapid physiological intake and clinical urgency assessment for crowded hospital outpatient departments.
          </p>
        </div>
      </div>

      <AlertBanner
        type="info"
        title="Prototype Clinical Decision Support"
        message="This assistant executes transparent, deterministic vital signs criteria based on Emergency Severity Index (ESI) & public health triage rules to prevent fatal queue delays in overloaded government OPDs."
      />

      <TriageForm />
    </div>
  );
};
