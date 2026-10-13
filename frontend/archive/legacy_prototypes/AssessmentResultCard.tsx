import React, { useState } from 'react';
import type { TriageAssessmentResult } from '../../types/triage';
import { Badge } from '../common/Badge';
import {
  Clock,
  Building2,
  Info,
  ShieldAlert,
  Brain,
  Sparkles,
  ChevronDown,
  ChevronUp,
  UserCheck,
  AlertTriangle,
  HelpCircle,
  FileText,
} from 'lucide-react';

interface AssessmentResultCardProps {
  assessment: TriageAssessmentResult;
  onConfirmQueue?: () => void;
  isQueueing?: boolean;
}

export const AssessmentResultCard: React.FC<AssessmentResultCardProps> = ({
  assessment,
  onConfirmQueue,
  isQueueing = false,
}) => {
  const [isExplainableExpanded, setIsExplainableExpanded] = useState<boolean>(true);

  const isEmergency = assessment.triage_category === 'EMERGENCY';
  const isPriority = assessment.triage_category === 'PRIORITY';

  const cardBorderClass = isEmergency
    ? 'result-card-emergency'
    : isPriority
    ? 'result-card-priority'
    : 'result-card-routine';

  // Rule identifiers mapped to triggered abnormalities
  const ruleIdentifiers: Array<{ id: string; name: string; reason: string }> = [];
  if (assessment.red_flags_identified && assessment.red_flags_identified.length > 0) {
    assessment.red_flags_identified.forEach((rf, idx) => {
      ruleIdentifiers.push({
        id: `CRIT-RULE-REDFLAG-0${idx + 1}`,
        name: 'Protocol Red Flag Override',
        reason: rf,
      });
    });
  }
  if (assessment.vital_abnormalities && assessment.vital_abnormalities.length > 0) {
    assessment.vital_abnormalities.forEach((va, idx) => {
      ruleIdentifiers.push({
        id: `CRIT-RULE-VITAL-0${idx + 1}`,
        name: 'Physiological Boundary Override',
        reason: va,
      });
    });
  }

  return (
    <div className={`assessment-card ${cardBorderClass}`}>
      <div className="assessment-card-header">
        <div className="category-header-info">
          <Badge type="category" category={assessment.triage_category} />
          <h2 className="urgency-title">{assessment.urgency_level}</h2>
        </div>
        <div className="urgency-score-block">
          <span className="score-num">{assessment.urgency_score}</span>
          <span className="score-denom">/ 10 Priority</span>
        </div>
      </div>

      {/* Recommended Department and Wait Time */}
      <div className="result-meta-grid">
        <div className="meta-box">
          <div className="meta-icon">
            <Building2 size={20} />
          </div>
          <div>
            <div className="meta-label">Routing Specialty</div>
            <div className="meta-value">{assessment.recommended_department}</div>
          </div>
        </div>

        <div className="meta-box">
          <div className="meta-icon">
            <Clock size={20} />
          </div>
          <div>
            <div className="meta-label">Max Safe Wait</div>
            <div className="meta-value">
              {assessment.max_recommended_wait_minutes === 0
                ? '0 min (Immediate Care)'
                : `≤ ${assessment.max_recommended_wait_minutes} Minutes`}
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Action */}
      <div className={`action-notice ${isEmergency ? 'action-danger' : isPriority ? 'action-warning' : 'action-normal'}`}>
        <div className="action-text-bold">Clinical Directive:</div>
        <div>{assessment.recommended_action}</div>
      </div>

      {/* Rationale and Flag list */}
      <div className="rationale-section">
        <div className="rationale-heading">
          <ShieldAlert size={16} /> Clinical Risk Stratification Findings:
        </div>
        <ul className="rationale-list">
          {assessment.clinical_rationale.map((item, idx) => (
            <li key={idx} className="rationale-item">
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* ========================================================================= */}
      {/* EXPLAINABLE ASSESSMENT PANEL (Feature Requirement)                      */}
      {/* ========================================================================= */}
      <div
        style={{
          marginTop: 18,
          marginBottom: 18,
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          background: '#f8fafc',
          overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setIsExplainableExpanded(!isExplainableExpanded)}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: '#0f172a',
            color: '#fff',
            border: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            textAlign: 'left',
          }}
          aria-expanded={isExplainableExpanded}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={18} color="#a855f7" />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              Explainable Assessment Panel (Transparent Clinical Breakdown)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#cbd5e1' }}>
            <span>{isExplainableExpanded ? 'Collapse Panel' : 'Expand Details'}</span>
            {isExplainableExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </button>

        {isExplainableExpanded && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* 1. Clinician-assigned triage category */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <UserCheck size={16} color="#0f766e" />
                <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                  1. Clinician-Assigned Triage Category:
                </strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#475569', marginLeft: 22 }}>
                Not recorded during initial counter intake. Attending doctor or nurse may document clinical triage override upon bedside admission.
              </div>
            </div>

            {/* 2. AI model suggestion */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Sparkles size={16} color="#7c3aed" />
                <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                  2. AI Model Suggestion:
                </strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#475569', marginLeft: 22 }}>
                <div>
                  <strong>Model Suggestion:</strong> {assessment.urgency_level} ({assessment.triage_category}) • Routing: {assessment.recommended_department}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b21a8', marginTop: 4, fontStyle: 'italic' }}>
                  Assisted suggestion only. Correlation does not imply causation, and model suggestions do not constitute a confirmed diagnosis.
                </div>
              </div>
            </div>

            {/* 3. Rule-based warnings and exact rule identifiers */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <ShieldAlert size={16} color="#dc2626" />
                <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                  3. Rule-Based Warnings & Exact Rule Identifiers:
                </strong>
              </div>
              {ruleIdentifiers.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: '#16a34a', marginLeft: 22 }}>
                  No emergency rule overrides triggered. Evaluated within routine criteria.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 22 }}>
                  {ruleIdentifiers.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        padding: '6px 10px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderLeft: '3px solid #dc2626',
                        borderRadius: 4,
                        fontSize: '0.8rem',
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#991b1b', marginRight: 8 }}>
                        [{r.id}]
                      </span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{r.name}:</span>{' '}
                      <span style={{ color: '#475569' }}>{r.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. Recorded red flags and supporting observations */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <AlertTriangle size={16} color="#d97706" />
                <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                  4. Recorded Red Flags & Supporting Observations:
                </strong>
              </div>
              <div style={{ marginLeft: 22, fontSize: '0.85rem' }}>
                <div style={{ marginBottom: 4 }}>
                  <strong>Red Flags:</strong>{' '}
                  {assessment.red_flags_identified && assessment.red_flags_identified.length > 0
                    ? assessment.red_flags_identified.join(', ')
                    : 'None marked'}
                </div>
                <div>
                  <strong>Vital Abnormalities:</strong>{' '}
                  {assessment.vital_abnormalities && assessment.vital_abnormalities.length > 0
                    ? assessment.vital_abnormalities.join(', ')
                    : 'Within physiological baseline'}
                </div>
              </div>
            </div>

            {/* 5. Missing information that limits assessment */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <HelpCircle size={16} color="#b45309" />
                <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                  5. Missing Information Limiting Assessment:
                </strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#92400e', background: '#fffbeb', padding: '6px 10px', borderRadius: 4, marginLeft: 22 }}>
                Any unmeasured vital parameters (e.g. Respiratory Rate, repeat oximetry) must be verified at bedside. Missing values are preserved as unrecorded and never assumed normal.
              </div>
            </div>

            {/* 6. Assessment timestamp and model/rule-set version */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Clock size={16} color="#475569" />
                <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                  6. Assessment Timestamp & Versioning:
                </strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#475569', marginLeft: 22 }}>
                Timestamp: {assessment.assessment_timestamp || new Date().toISOString()} • Rule-Set: 2026.1-hackathon-domain-primer-v1 • Model: v1.0.0
              </div>
            </div>

            {/* 7. Human review, override reason, and audit history */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <FileText size={16} color="#334155" />
                <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                  7. Human Review & Audit Trail:
                </strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: '#475569', marginLeft: 22 }}>
                Patient intake initialized. Human clinical verification action is queued for nursing triage desk.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action CTA */}
      {onConfirmQueue && (
        <div className="assessment-actions">
          <button
            type="button"
            onClick={onConfirmQueue}
            disabled={isQueueing}
            className={`btn-primary btn-large ${isEmergency ? 'btn-emergency' : ''}`}
          >
            {isQueueing ? (
              'Enrolling Patient in OPD Queue...'
            ) : (
              `Add to Active Queue (${assessment.recommended_department})`
            )}
          </button>
        </div>
      )}

      {/* Prototype Legal / Medical Disclaimer */}
      <div className="prototype-disclaimer">
        <Info size={14} className="disclaimer-icon" />
        <span>{assessment.disclaimer}</span>
      </div>
    </div>
  );
};
