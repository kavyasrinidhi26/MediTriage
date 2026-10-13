import React, { useState } from 'react';
import type { AssessmentResultData, NewPatientIntakeData } from '../../types/triage';
import { ExplainableAssessmentModal } from '../dashboard/ExplainableAssessmentModal';
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  Clock,
  ArrowLeft,
  CheckCircle2,
  FileEdit,
  ShieldAlert,
  Info,
  Sparkles,
  Stethoscope,
  HeartPulse,
  User,
  CheckCheck,
} from 'lucide-react';

export interface AssessmentResultScreenProps {
  assessment: AssessmentResultData;
  intakeData: NewPatientIntakeData;
  onReturnToQueue: () => void;
  onReviewIntake: () => void;
  onMarkReviewed?: () => void;
  onNewPatient?: () => void;
}

export const AssessmentResultScreen: React.FC<AssessmentResultScreenProps> = ({
  assessment,
  intakeData,
  onReturnToQueue,
  onReviewIntake,
  onMarkReviewed,
  onNewPatient,
}) => {
  const [isReviewedLocally, setIsReviewedLocally] = useState(!assessment.human_review_required);
  const reviewerName = 'Staff Nursing Officer';
  const [reviewTimestamp, setReviewTimestamp] = useState<string | null>(null);
  const [showExplainableModal, setShowExplainableModal] = useState<boolean>(false);

  const explainableTarget = {
    patient_id: intakeData.patient_id,
    token_number: intakeData.patient_id,
    patient_name: intakeData.patient_name || null,
    triage_level_name: assessment.triage_level_name || null,
  };

  const isAbstained =
    typeof assessment.abstention_status === 'string' &&
    assessment.abstention_status.startsWith('ABSTAINED');

  const isRuleOverride =
    assessment.abstention_status === 'SAFETY_OVERRIDE' ||
    (assessment.triggered_safety_rule_ids && assessment.triggered_safety_rule_ids.length > 0);

  const hasCriticalRedFlags =
    assessment.detected_red_flags && assessment.detected_red_flags.length > 0;

  // SAFETY RULE: Never use green or low-priority presentation for an unresolved critical warning!
  // If Level 1 or critical override or critical red flags exist, visual state MUST be critical.
  const isCriticalPresentation =
    assessment.triage_level === 1 ||
    assessment.model_emergency_flag ||
    assessment.abstention_status === 'SAFETY_OVERRIDE' ||
    assessment.triggered_safety_rule_ids.some((id) => id.startsWith('CRIT-'));

  const isEmergentPresentation = !isCriticalPresentation && assessment.triage_level === 2;
  const isUrgentPresentation = !isCriticalPresentation && !isEmergentPresentation && assessment.triage_level === 3;
  const isRoutinePresentation =
    !isCriticalPresentation && !isEmergentPresentation && !isUrgentPresentation && !hasCriticalRedFlags;

  // Theme styling based on validated safety urgency
  let urgencyThemeClass = 'urgency-routine';
  let urgencyBadgeText = 'Routine / Standard';
  let urgencyPillBg = '#eff6ff';
  let urgencyPillColor = '#1e40af';
  let urgencyBorder = '#bfdbfe';

  if (isAbstained) {
    urgencyThemeClass = 'urgency-abstained';
    urgencyBadgeText = 'Priority Holding (Abstained)';
    urgencyPillBg = '#fef3c7';
    urgencyPillColor = '#92400e';
    urgencyBorder = '#fcd34d';
  } else if (isCriticalPresentation) {
    urgencyThemeClass = 'urgency-critical';
    urgencyBadgeText = 'Level 1 — Immediate Resuscitation';
    urgencyPillBg = '#fef2f2';
    urgencyPillColor = '#991b1b';
    urgencyBorder = '#f87171';
  } else if (isEmergentPresentation) {
    urgencyThemeClass = 'urgency-emergent';
    urgencyBadgeText = 'Level 2 — Emergent / High Priority';
    urgencyPillBg = '#fff7ed';
    urgencyPillColor = '#9a3412';
    urgencyBorder = '#fdba74';
  } else if (isUrgentPresentation) {
    urgencyThemeClass = 'urgency-urgent';
    urgencyBadgeText = 'Level 3 — Urgent';
    urgencyPillBg = '#fffbeb';
    urgencyPillColor = '#b45309';
    urgencyBorder = '#fde68a';
  } else if (isRoutinePresentation) {
    urgencyThemeClass = 'urgency-less-urgent';
    urgencyBadgeText = `Level ${assessment.triage_level} — Routine OPD`;
    urgencyPillBg = '#f0fdf4';
    urgencyPillColor = '#166534';
    urgencyBorder = '#bbf7d0';
  }

  const handleToggleReview = () => {
    const nextState = !isReviewedLocally;
    setIsReviewedLocally(nextState);
    if (nextState) {
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setReviewTimestamp(nowTime);
    } else {
      setReviewTimestamp(null);
    }
    if (onMarkReviewed) {
      onMarkReviewed();
    }
  };

  return (
    <div
      className={`assessment-result-screen ${urgencyThemeClass}`}
      role="region"
      aria-label="Triage Assessment Result"
    >
      {/* SCREEN BANNER: CRITICAL ALERT IF SAFETY OVERRIDE */}
      {isCriticalPresentation && (
        <div className="critical-urgency-banner" role="alert" aria-live="assertive">
          <div className="banner-icon-col">
            <AlertOctagon size={32} className="alert-icon-pulse" />
          </div>
          <div className="banner-content-col">
            <h2 className="banner-title">CRITICAL CLINICAL ESCALATION — IMMEDIATE CARE REQUIRED</h2>
            <p className="banner-desc">
              Patient exhibits physiological red-flags or critical safety override triggers. Escalate directly to
              Casualty / Resuscitation Bay. Do not delay bedside clinical intervention.
            </p>
          </div>
        </div>
      )}

      {/* SCREEN BANNER: ABSTENTION HOLD */}
      {isAbstained && (
        <div className="abstention-banner" role="alert" aria-live="polite">
          <div className="banner-icon-col">
            <AlertTriangle size={28} className="text-amber-700" />
          </div>
          <div className="banner-content-col">
            <h2 className="banner-title">SYSTEM ABSTENTION: MANUAL CLINICAL TRIAGE REQUIRED</h2>
            <p className="banner-desc">
              MediTriage AI has safely withheld automated acuity scoring ({assessment.abstention_status}).
              The patient is placed in <strong>Priority Holding</strong> status. Bedside nurse or triage physician must perform direct manual evaluation.
            </p>
          </div>
        </div>
      )}

      {/* RESULT CARD MAIN */}
      <div className="result-main-card">
        {/* CARD TOP BAR: Patient ID, Arrival Time, Review Status */}
        <div className="result-top-bar">
          <div className="patient-demographics-badge">
            <div className="uhid-badge">
              <User size={15} />
              <span>UHID: <strong>{intakeData.patient_id}</strong></span>
            </div>
            {intakeData.patient_name && (
              <span className="patient-name-display">{intakeData.patient_name}</span>
            )}
            <span className="demographics-text">
              {intakeData.age !== null ? `${intakeData.age}y` : 'Age unknown'} • {intakeData.sex}
            </span>
            <div className="arrival-badge">
              <Clock size={14} />
              <span>Arrived: <strong>{intakeData.arrival_time}</strong></span>
            </div>
          </div>

          <div className="review-status-indicator">
            {isReviewedLocally ? (
              <span className="badge-reviewed" role="status">
                <CheckCheck size={14} />
                Reviewed by {reviewerName} {reviewTimestamp ? `(${reviewTimestamp})` : ''}
              </span>
            ) : (
              <span className="badge-review-required" role="status">
                <ShieldAlert size={14} />
                Human Clinical Review Required
              </span>
            )}
          </div>
        </div>

        {/* PRIMARY ACUITY STRIP */}
        <div
          className="acuity-strip"
          style={{
            backgroundColor: urgencyPillBg,
            borderColor: urgencyBorder,
          }}
        >
          <div className="acuity-level-block">
            <div className="acuity-kicker">
              {isRuleOverride ? (
                <span className="source-tag tag-rule-override">
                  <ShieldAlert size={12} /> Rule-Based Safety Override
                </span>
              ) : (
                <span className="source-tag tag-model-prediction">
                  <Sparkles size={12} /> Machine Learning Decision Support
                </span>
              )}
            </div>
            <h1 className="acuity-level-title" style={{ color: urgencyPillColor }}>
              {isAbstained ? 'System Abstained' : assessment.triage_level_name || urgencyBadgeText}
            </h1>
            <p className="acuity-level-sub">
              {isAbstained
                ? 'Automated classification deferred for patient safety. Held in Priority Review queue.'
                : isCriticalPresentation
                ? 'Immediate medical officer bedside intervention mandated by protocol.'
                : 'Acuity score derived from physiological vitals and multilingual symptom analysis.'}
            </p>
          </div>

          <div className="routing-department-block">
            <div className="routing-icon-wrapper">
              <Building2 size={24} />
            </div>
            <div>
              <div className="routing-label">Recommended Specialty OPD</div>
              <div className="routing-dept-name">{assessment.recommended_department || 'General Medicine'}</div>
              <div className="routing-disposition">Immediate Bedside Referral</div>
            </div>
          </div>
        </div>

        {/* RED-FLAG SYMPTOMS (IF ANY) */}
        {hasCriticalRedFlags && (
          <div className="section-block red-flags-block" role="alert">
            <div className="section-header-row text-red-800">
              <AlertOctagon size={18} />
              <h3 className="section-header-title">Detected Red-Flag Symptoms & Vital Anomalies</h3>
            </div>
            <div className="red-flags-grid">
              {assessment.detected_red_flags.map((flag, idx) => (
                <div key={idx} className="red-flag-item">
                  <HeartPulse size={16} className="text-red-600 flex-shrink-0" />
                  <span>{flag}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TRIGGERED SAFETY RULES */}
        {assessment.triggered_safety_rule_ids && assessment.triggered_safety_rule_ids.length > 0 && (
          <div className="section-block safety-rules-block">
            <div className="section-header-row text-amber-900">
              <ShieldAlert size={18} />
              <h3 className="section-header-title">Triggered Deterministic Safety Rules</h3>
              <span className="rules-version-badge">Version {assessment.rules_version}</span>
            </div>
            <ul className="rules-list">
              {assessment.triggered_safety_rule_ids.map((ruleId, idx) => (
                <li key={idx} className="rule-list-item">
                  <div className="rule-id-code">
                    <code>{ruleId}</code>
                  </div>
                  <div className="rule-explanation">
                    {assessment.safety_rule_explanations[idx] || 'Safety threshold boundary activated.'}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CLINICAL & MODEL RATIONALE */}
        <div className="section-block rationale-block">
          <div className="section-header-row">
            <Stethoscope size={18} />
            <h3 className="section-header-title">Clinical Recommendation Rationale</h3>
          </div>
          <div className="rationale-text-card">
            <p className="rationale-text">{assessment.model_explanation}</p>
            <div className="rationale-complaint-quote">
              <span className="quote-label">Recorded Chief Complaint ({intakeData.complaint_language}):</span>
              <p className="quote-content">"{intakeData.chief_complaint}"</p>
            </div>
          </div>
        </div>

        {/* DATA QUALITY & MISSING MEASUREMENTS */}
        {(assessment.missing_data_warnings.length > 0 || assessment.invalid_data_warnings.length > 0) && (
          <div className="section-block data-quality-block">
            <div className="section-header-row text-slate-800">
              <Info size={18} />
              <h3 className="section-header-title">Data Quality & Completeness Audit</h3>
            </div>
            <div className="data-quality-grid">
              {assessment.missing_data_warnings.length > 0 && (
                <div className="dq-column dq-missing">
                  <h4 className="dq-col-title">Missing Optional Measurements:</h4>
                  <p className="dq-subtext">
                    Measurements left blank were recorded as genuinely missing. System did NOT invent normal defaults.
                  </p>
                  <ul className="dq-list">
                    {assessment.missing_data_warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {assessment.invalid_data_warnings.length > 0 && (
                <div className="dq-column dq-invalid">
                  <h4 className="dq-col-title">Data Discrepancies / Boundary Flags:</h4>
                  <ul className="dq-list">
                    {assessment.invalid_data_warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AUDIT & VERSION FOOTER */}
        <div className="system-metadata-strip">
          <div className="meta-pair">
            <span className="meta-key">Model Version:</span>
            <span className="meta-val">{assessment.model_version}</span>
          </div>
          <div className="meta-pair">
            <span className="meta-key">Safety Engine:</span>
            <span className="meta-val">{assessment.rules_version}</span>
          </div>
          <div className="meta-pair">
            <span className="meta-key">Abstention Status:</span>
            <span className="meta-val">{assessment.abstention_status}</span>
          </div>
          <div className="meta-pair">
            <span className="meta-key">Acuity Basis:</span>
            <span className="meta-val">
              {isRuleOverride ? 'Deterministic Clinical Safety Protocol' : 'Machine Learning Inference Pipeline'}
            </span>
          </div>
        </div>

        {/* VISIBLE PROTOTYPE CLINICAL DISCLAIMER */}
        <div className="prototype-legal-disclaimer" role="note">
          <Info size={16} className="disclaimer-icon-alert" />
          <div className="disclaimer-text">
            <strong>HOSPITAL PROTOTYPE SAFETY NOTICE:</strong> {assessment.clinical_disclaimer ||
              'MediTriage AI is an assistive OPD triage prototype designed for high-volume government hospital settings. All triage levels, department routing recommendations, and physiological assessments require clinical verification by a qualified bedside nursing officer or medical doctor prior to treatment.'}
          </div>
        </div>

        {/* PRIMARY ACTION BUTTONS */}
        <div className="assessment-action-row">
          <button
            type="button"
            className="btn btn-secondary action-btn"
            style={{
              borderColor: '#7c3aed',
              color: '#6d28d9',
              background: '#faf5ff',
              fontWeight: 600,
            }}
            onClick={() => setShowExplainableModal(true)}
            aria-label="View Explainable Assessment Breakdown"
          >
            <Sparkles size={16} /> Explainable Assessment
          </button>

          <button
            type="button"
            className="btn btn-secondary action-btn"
            onClick={onReturnToQueue}
            aria-label="Return to patient queue"
          >
            <ArrowLeft size={16} /> Return to Queue
          </button>

          <button
            type="button"
            className="btn btn-secondary action-btn"
            onClick={onReviewIntake}
            aria-label="Review and edit intake data"
          >
            <FileEdit size={16} /> Review Intake Data
          </button>

          <button
            type="button"
            className={`btn action-btn ${isReviewedLocally ? 'btn-reviewed' : 'btn-primary'}`}
            onClick={handleToggleReview}
            aria-label={isReviewedLocally ? 'Mark case as requiring review' : 'Mark case as reviewed'}
          >
            {isReviewedLocally ? (
              <>
                <CheckCheck size={16} /> Mark as Requiring Review
              </>
            ) : (
              <>
                <CheckCircle2 size={16} /> Mark Case as Reviewed
              </>
            )}
          </button>

          {onNewPatient && (
            <button
              type="button"
              className="btn btn-primary action-btn-accent"
              onClick={onNewPatient}
              aria-label="Register next patient"
            >
              + Register Next Patient
            </button>
          )}
        </div>
      </div>

      {showExplainableModal && (
        <ExplainableAssessmentModal
          patient={explainableTarget}
          onClose={() => setShowExplainableModal(false)}
        />
      )}
    </div>
  );
};
