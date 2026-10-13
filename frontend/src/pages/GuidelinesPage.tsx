import React from 'react';
import { BookOpen, ShieldCheck, AlertCircle } from 'lucide-react';

export const GuidelinesPage: React.FC = () => {
  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <BookOpen className="page-title-icon" size={26} />
            Clinical Triage Protocols & Assistive AI Safety Architecture
          </h1>
          <p className="page-subtitle">
            Evidence-based decision-support specifications adapted for public hospital OPD counters.
          </p>
        </div>
      </div>

      {/* Safety & Architecture Overview */}
      <div className="guidelines-card">
        <h3 className="section-title">
          <ShieldCheck size={20} className="icon-success" />
          Deterministic Rule-Based Safeguards & Human Clinician Authority
        </h3>
        <p className="guidelines-text">
          MediTriage AI implements a <strong>safety-first architecture</strong> where machine-learning suggestions are strictly advisory and <em>can never override deterministic clinical safety rules</em>. In critical emergency presentations, deterministic vital-sign overrides and acute red-flag alerts trigger immediate casualty redirection regardless of model confidence or inference status. All final triage assignments and overrides remain strictly under the authority of licensed healthcare professionals.
        </p>
      </div>

      {/* 5-Level International Triage Acuity Protocols */}
      <h3 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px', color: 'var(--text-primary)' }}>
        International 5-Level Triage Acuity Standards & OPD Operational Stream Mapping
      </h3>

      <div className="protocols-grid">
        {/* Category 1: Resuscitation */}
        <div className="protocol-card protocol-red">
          <div className="protocol-header">
            <span className="protocol-badge badge-emergency">LEVEL 1 • RED</span>
            <h4>Resuscitation / Immediate</h4>
          </div>
          <div className="protocol-body">
            <p className="protocol-criteria-title">Casualty Resuscitation Bay (Target Wait: 0 min / Immediate):</p>
            <ul>
              <li><strong>Severe Hypoxia:</strong> SpO2 &lt; 90%</li>
              <li><strong>Circulatory Arrest / Collapse:</strong> Heart Rate = 0, &lt; 40, or &gt; 130 bpm</li>
              <li><strong>Shock or Crisis:</strong> Systolic BP &lt; 90 mmHg, Systolic &ge; 200 mmHg, or Diastolic &ge; 120 mmHg</li>
              <li><strong>Respiratory Failure:</strong> RR &gt; 30 or &lt; 8 breaths/min</li>
              <li><strong>Neurological Deprivation:</strong> AVPU = Pain or Unresponsive</li>
              <li><strong>Severe Red Flags:</strong> Crushing chest pain, severe trauma, active labor complications, meningismus signs</li>
            </ul>
          </div>
        </div>

        {/* Category 2: Emergent / Very Urgent */}
        <div className="protocol-card protocol-yellow">
          <div className="protocol-header">
            <span className="protocol-badge badge-priority">LEVEL 2 • ORANGE / YELLOW</span>
            <h4>Emergent / Very Urgent</h4>
          </div>
          <div className="protocol-body">
            <p className="protocol-criteria-title">Immediate Fast-Track Review (Target Wait: &le; 15 mins):</p>
            <ul>
              <li><strong>Borderline Hypoxemia:</strong> SpO2 90% &ndash; 94%</li>
              <li><strong>Marked Tachycardia / Bradycardia:</strong> HR 105&ndash;130 or 40&ndash;50 bpm</li>
              <li><strong>Stage 2 Severe Hypertension:</strong> Systolic BP 160&ndash;199 mmHg</li>
              <li><strong>Tachypnea:</strong> RR 22&ndash;30 breaths/min</li>
              <li><strong>High Fever / Delirium:</strong> Temperature &ge; 104°F or severe lethargy</li>
              <li><strong>Altered Sensorium:</strong> AVPU = Responds to Voice (V)</li>
            </ul>
          </div>
        </div>

        {/* Category 3: Urgent */}
        <div className="protocol-card protocol-yellow">
          <div className="protocol-header">
            <span className="protocol-badge badge-priority" style={{ background: '#f59e0b', color: '#fff' }}>LEVEL 3 • YELLOW</span>
            <h4>Urgent OPD Evaluation</h4>
          </div>
          <div className="protocol-body">
            <p className="protocol-criteria-title">Priority Doctor Attention (Target Wait: &le; 30 mins):</p>
            <ul>
              <li>Moderately abnormal vitals requiring medical evaluation</li>
              <li>Moderate acute pain, persistent vomiting, or moderate dehydration</li>
              <li>Multiple medical comorbidities requiring priority screening</li>
              <li>Potential for physiological deterioration if untreated for &gt; 30 min</li>
            </ul>
          </div>
        </div>

        {/* Category 4: Less Urgent */}
        <div className="protocol-card protocol-green">
          <div className="protocol-header">
            <span className="protocol-badge badge-routine">LEVEL 4 • GREEN</span>
            <h4>Less Urgent / Standard Queue</h4>
          </div>
          <div className="protocol-body">
            <p className="protocol-criteria-title">Standard OPD Consultation (Target Wait: &le; 60 mins):</p>
            <ul>
              <li>Stable baseline vitals with low risk of acute deterioration</li>
              <li>Mild to moderate subacute complaints (cough &lt; 2 weeks, uncomplicated sprains, mild dysuria)</li>
              <li>Patient alert and orientated (AVPU = Alert)</li>
            </ul>
          </div>
        </div>

        {/* Category 5: Non-Urgent */}
        <div className="protocol-card protocol-green">
          <div className="protocol-header">
            <span className="protocol-badge badge-routine" style={{ opacity: 0.85 }}>LEVEL 5 • BLUE / GREEN</span>
            <h4>Non-Urgent / Primary Care</h4>
          </div>
          <div className="protocol-body">
            <p className="protocol-criteria-title">Routine Queue (Target Wait: &le; 120 mins):</p>
            <ul>
              <li>Fully stable physiological parameters</li>
              <li>Chronic complaints, routine repeat medication refills, minor rash, suture removal</li>
              <li>Routine preventive health checks</li>
            </ul>
          </div>
        </div>

        {/* Emergency First Protocol */}
        <div className="protocol-card protocol-red" style={{ borderColor: 'var(--danger-color)' }}>
          <div className="protocol-header">
            <span className="protocol-badge badge-emergency">EMERGENCY FIRST</span>
            <h4>Trauma & Accident Workflow</h4>
          </div>
          <div className="protocol-body">
            <p className="protocol-criteria-title">Zero-Delay Casualty Intake Policy:</p>
            <ul>
              <li>Direct transfer straight to Resuscitation Bay upon presentation</li>
              <li>Zero delay for registration counter queues or AI analysis</li>
              <li>Immediate ABCDE stabilization, continuous telemetry, and trauma surgery alert</li>
              <li>Synthetic demo records clearly flagged to maintain separation from real queue</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Safety & Regulatory Disclaimer */}
      <div className="guidelines-card disclaimer-box" style={{ marginTop: 24 }}>
        <h3 className="section-title">
          <AlertCircle size={20} className="icon-warning" />
          Safety Notice: Prototype Decision Support — Not Clinically Validated
        </h3>
        <p className="guidelines-text">
          <strong>IMPORTANT SAFETY NOTICE:</strong> MediTriage AI is an experimental clinical decision support research prototype. It has <strong>NOT been clinically validated in randomized trials or certified as Software as a Medical Device (SaMD)</strong> by regulatory authorities (e.g., CDSCO, FDA, or CE). It is intended exclusively to demonstrate assistive queuing and decision-support engineering concepts.
        </p>
        <p className="guidelines-text" style={{ marginTop: 8 }}>
          Under no circumstances should this system be used as the sole basis for clinical diagnosis, patient management, or triage prioritization. Immediate clinical assessment by qualified medical personnel must always be provided, and emergency resuscitation must never be delayed for administrative registration or automated data entry.
        </p>
      </div>
    </div>
  );
};
