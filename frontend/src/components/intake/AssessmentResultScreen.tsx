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
  Languages,
  XCircle,
  HelpCircle,
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

  const originalComplaint = assessment.original_complaint || intakeData.chief_complaint;
  const detectedLang = assessment.detected_language || intakeData.complaint_language;
  const requiresComplaintReview = Boolean(assessment.requires_complaint_review);

  const extractedSymptoms = assessment.extracted_symptoms || [];
  const activeFindings = extractedSymptoms.filter((s) => s.context === 'positive');
  const negatedFindings = extractedSymptoms.filter((s) => s.context === 'negated');
  const uncertainFindings = extractedSymptoms.filter((s) => s.context === 'uncertain');
  const historicalFindings = extractedSymptoms.filter((s) => s.context === 'historical');

  const isAbstained =
    (typeof assessment.abstention_status === 'string' &&
      assessment.abstention_status.startsWith('ABSTAINED')) ||
    requiresComplaintReview;

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
            <h2 className="banner-title">Cannot assess safely — send to nurse now.</h2>
            <p className="banner-desc">
              MediTriage AI has safely withheld automated acuity scoring ({assessment.abstention_status}).
              Reason: {assessment.invalid_data_warnings?.length ? assessment.invalid_data_warnings.join('; ') : (assessment.missing_data_warnings?.length ? assessment.missing_data_warnings.join('; ') : 'Clinical data uncertain or model confidence below safety threshold')}.
              Patient is placed in <strong>Priority Holding</strong> status. Bedside nurse must perform direct manual evaluation.
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
              ) : isAbstained ? (
                <span className="source-tag" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>
                  <AlertTriangle size={12} /> Safety Hold (Unconfirmed Model Decision)
                </span>
              ) : (
                <span className="source-tag tag-model-prediction">
                  <Sparkles size={12} /> Machine Learning Decision Support
                </span>
              )}
            </div>
            <h1 className="acuity-level-title" style={{ color: urgencyPillColor }}>
              {isAbstained ? 'Cannot assess safely — send to nurse now.' : assessment.triage_level_name || urgencyBadgeText}
            </h1>
            <p className="acuity-level-sub">
              {isAbstained
                ? 'Automated classification deferred for patient safety. Bedside nurse must verify vitals and assign definitive acuity.'
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

        {/* MULTILINGUAL SYMPTOM & CHIEF COMPLAINT UNDERSTANDING */}
        <div className="section-block complaint-understanding-block" style={{ border: '1px solid #e2e8f0', borderRadius: '10px', background: '#ffffff', padding: '1.25rem', margin: '1.25rem 0' }}>
          <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Languages size={20} style={{ color: '#2563eb' }} />
              <h3 className="section-header-title" style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: '#1e293b' }}>
                Symptom & Chief Complaint Understanding
              </h3>
            </div>
            {detectedLang && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                }}
              >
                <span>Input Format:</span>
                <strong>{detectedLang}</strong>
              </span>
            )}
          </div>

          {/* Original Chief Complaint Verbatim */}
          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.25rem' }}>
              Original Patient Complaint (Verbatim for Nurse Review):
            </div>
            <div style={{ fontSize: '1rem', color: '#0f172a', fontWeight: 500, fontStyle: 'italic' }}>
              "{originalComplaint}"
            </div>
          </div>

          {/* Nurse Review Banner if Interpretation Ambiguous, Contradictory, or Unsupported */}
          {requiresComplaintReview && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '0.85rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
              }}
              role="alert"
            >
              <AlertTriangle size={22} style={{ color: '#b45309', flexShrink: 0, marginTop: '2px' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#92400e', marginBottom: '0.25rem' }}>
                  Cannot assess safely — send to nurse now.
                </div>
                <p style={{ margin: 0, fontSize: '0.835rem', color: '#78350f', lineHeight: 1.4 }}>
                  {assessment.complaint_review_reason || 'Complaint phrasing is unverified, dialectally ambiguous, or contains contradictory statements. Direct bedside nurse interview required.'}
                </p>
                <div style={{ marginTop: '0.6rem' }}>
                  <button
                    type="button"
                    onClick={onReviewIntake}
                    style={{
                      background: '#b45309',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <FileEdit size={14} /> Review Complaint with Patient
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Extracted Findings Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {/* Active Positive Findings */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '0.75rem 0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#166534', fontWeight: 700, fontSize: '0.825rem', marginBottom: '0.5rem' }}>
                <CheckCircle2 size={16} />
                <span>Recognized Active Findings ({activeFindings.length})</span>
              </div>
              {activeFindings.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#65a30d', fontStyle: 'italic' }}>
                  No active red-flag symptoms recognized
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {activeFindings.map((sym, idx) => (
                    <div key={idx} style={{ background: '#ffffff', border: '1px solid #86efac', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#15803d' }}>{sym.concept.replace(/_/g, ' ')}</span>
                        {sym.severity_modifier && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontWeight: 700 }}>
                            {sym.severity_modifier}
                          </span>
                        )}
                        {sym.is_red_flag && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: '#dc2626', color: '#ffffff', borderRadius: '4px', fontWeight: 700 }}>
                            RED FLAG
                          </span>
                        )}
                      </div>
                      {sym.supporting_phrase && (
                        <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.2rem' }}>
                          Matched: <span style={{ fontStyle: 'italic', fontWeight: 500 }}>"{sym.supporting_phrase}"</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Explicitly Denied (Negated) Symptoms */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#475569', fontWeight: 700, fontSize: '0.825rem', marginBottom: '0.5rem' }}>
                <XCircle size={16} style={{ color: '#64748b' }} />
                <span>Explicitly Denied / Negated Symptoms ({negatedFindings.length})</span>
              </div>
              {negatedFindings.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                  No negated symptoms explicitly noted
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {negatedFindings.map((sym, idx) => (
                    <div key={idx} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: '#334155' }}>{sym.concept.replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: '#f1f5f9', color: '#475569', borderRadius: '4px', fontWeight: 600 }}>
                          NEGATED (DENIED)
                        </span>
                      </div>
                      {sym.supporting_phrase && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                          Evidence: <span style={{ fontStyle: 'italic' }}>"{sym.supporting_phrase}"</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Uncertain or Historical (if any) */}
            {(uncertainFindings.length > 0 || historicalFindings.length > 0) && (
              <div style={{ background: '#fdf4ff', border: '1px solid #f0abfc', borderRadius: '8px', padding: '0.75rem 0.9rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#86198f', fontWeight: 700, fontSize: '0.825rem', marginBottom: '0.5rem' }}>
                  <HelpCircle size={16} />
                  <span>Uncertain / Historical Context</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {uncertainFindings.map((sym, idx) => (
                    <div key={`u-${idx}`} style={{ background: '#ffffff', border: '1px solid #e879f9', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
                      <span style={{ fontWeight: 600, color: '#a21caf' }}>{sym.concept.replace(/_/g, ' ')}</span>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: '#fae8ff', color: '#86198f', borderRadius: '4px' }}>
                        UNCERTAIN
                      </span>
                    </div>
                  ))}
                  {historicalFindings.map((sym, idx) => (
                    <div key={`h-${idx}`} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
                      <span style={{ fontWeight: 600, color: '#475569' }}>{sym.concept.replace(/_/g, ' ')}</span>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '0.1rem 0.35rem', background: '#f1f5f9', color: '#475569', borderRadius: '4px' }}>
                        HISTORICAL
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

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

        {/* REQUIRED NEXT ACTION FOR CLINICAL STAFF */}
        <div className="section-block" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', margin: '1rem 0' }}>
          <div className="section-header-row text-slate-900" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Building2 size={18} style={{ color: '#0284c7' }} />
            <h3 className="section-header-title" style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
              Required Next Action for Staff
            </h3>
          </div>
          <div style={{ fontSize: '0.88rem', color: '#334155', lineHeight: 1.5 }}>
            {isCriticalPresentation ? (
              <p style={{ margin: 0, fontWeight: 600, color: '#dc2626' }}>
                🚨 Immediate Action: Transfer patient immediately to Emergency Resuscitation / Casualty Bay without delay. Notify attending medical officer immediately.
              </p>
            ) : isAbstained ? (
              <p style={{ margin: 0, fontWeight: 600, color: '#b45309' }}>
                ⚠️ Nurse Action Required: Patient is held in Priority Review queue. Bedside nurse must verify vital signs, correct any missing or contradictory measurements, and assign definitive clinician triage level.
              </p>
            ) : (
              <p style={{ margin: 0, color: '#475569' }}>
                Standard Action: Direct patient to {assessment.recommended_department || 'General Medicine'} waiting area according to token order. Monitor for clinical deterioration while in queue.
              </p>
            )}
          </div>
        </div>

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
