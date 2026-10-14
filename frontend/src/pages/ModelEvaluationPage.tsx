import React, { useState, useEffect, useCallback } from 'react';
import {
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Scale,
  Brain,
  ShieldAlert,
  Info,
  Layers,
  Database,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import { fetchModelEvaluation, runModelEvaluationJob } from '../services/api';
import type {
  ModelEvaluationResponse,
  TriageEvaluationMetrics,
  DepartmentEvaluationMetrics,
} from '../types/triage';

type SplitTab = 'test' | 'validation' | 'training';

export const ModelEvaluationPage: React.FC = () => {
  const [data, setData] = useState<ModelEvaluationResponse | null>(null);
  const [activeSplit, setActiveSplit] = useState<SplitTab>('test');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvaluation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchModelEvaluation();
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to model evaluation service.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvaluation();
  }, [loadEvaluation]);

  const handleRunEvaluation = async () => {
    if (isEvaluating) return;
    setIsEvaluating(true);
    setError(null);
    try {
      const res = await runModelEvaluationJob({
        synthetic_samples: 250,
        random_seed: 42,
        use_xgboost: true,
      });
      setData(res.evaluation);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Evaluation job failed.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Extract metrics based on the currently selected split
  const getActiveMetrics = (): {
    triage?: TriageEvaluationMetrics;
    department?: DepartmentEvaluationMetrics | null;
    sampleCount: number;
    splitLabel: string;
  } => {
    if (!data || !data.available) {
      return { sampleCount: 0, splitLabel: 'No Data' };
    }

    const splitData = data.splits?.[activeSplit];
    const totalCount =
      activeSplit === 'test'
        ? data.sample_counts?.test || 0
        : activeSplit === 'validation'
        ? data.sample_counts?.validation || 0
        : data.sample_counts?.training || 0;

    const label =
      activeSplit === 'test'
        ? 'Test Holdout Split (20% unseen data)'
        : activeSplit === 'validation'
        ? 'Validation Split (20% tuning data)'
        : 'Training Split (60% training data)';

    if (splitData) {
      return {
        triage: splitData.triage,
        department: splitData.department,
        sampleCount: splitData.sample_count || totalCount,
        splitLabel: label,
      };
    }

    // Fallback to top-level evaluation_metrics if splits object is not populated
    return {
      triage: data.evaluation_metrics?.triage,
      department: data.evaluation_metrics?.department,
      sampleCount: totalCount || data.sample_counts?.total || 0,
      splitLabel: label,
    };
  };

  const { triage, department, sampleCount, splitLabel } = getActiveMetrics();

  return (
    <div className="inner-page-container">
      {/* Header */}
      <div className="inner-page-header">
        <div className="header-text-group">
          <div className="title-with-icon">
            <div className="page-icon-badge">
              <FileCheck2 size={24} />
            </div>
            <div>
              <h1 className="inner-page-title">Genuine Model Evaluation & Clinical Benchmark</h1>
              <p className="inner-page-subtitle">
                Rigorous evaluation across independent training, validation, and holdout test splits.
              </p>
            </div>
          </div>
        </div>

        <div className="header-actions-group" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {data?.supports_job_execution && (
            <button
              type="button"
              className="primary-button-compact"
              onClick={handleRunEvaluation}
              disabled={isLoading || isEvaluating}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'var(--brand-primary, #0284c7)',
                color: '#fff',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: isEvaluating ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              <RefreshCw size={15} className={isEvaluating ? 'spin-animation' : ''} />
              <span>{isEvaluating ? 'Running Evaluation...' : 'Re-Run Evaluation Job'}</span>
            </button>
          )}

          <div className="header-notice-pill">
            <Scale size={14} />
            <span>Anti-Leakage Split Architecture</span>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="eval-loading-card" style={{ padding: '3rem', textAlign: 'center', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', margin: '1rem 0' }}>
          <RefreshCw size={32} className="spin-animation" style={{ color: '#0284c7', margin: '0 auto 1rem auto' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b' }}>Loading Genuine Evaluation Artifacts...</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Parsing versioned model metadata and multi-split evaluation matrices.</p>
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <div className="eval-error-card" style={{ padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', margin: '1rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <AlertTriangle size={24} style={{ color: '#dc2626', flexShrink: 0 }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#991b1b', margin: '0 0 0.5rem 0' }}>
                Failed to Retrieve Evaluation Artifacts
              </h3>
              <p style={{ color: '#b91c1c', fontSize: '0.9rem', margin: '0 0 1rem 0' }}>{error}</p>
              <button
                type="button"
                onClick={loadEvaluation}
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                  padding: '0.4rem 0.9rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State when artifacts not available */}
      {!isLoading && !error && data && !data.available && (
        <div className="eval-empty-card" style={{ padding: '3rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center', margin: '1rem 0' }}>
          <Database size={40} style={{ color: '#94a3b8', margin: '0 auto 1rem auto' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
            No Evaluation Artifacts Available
          </h3>
          <p style={{ color: '#64748b', maxWidth: '550px', margin: '0 auto 1.5rem auto', fontSize: '0.92rem' }}>
            {data.reason || 'The model has not been trained or evaluation metadata is not present on disk. In adherence to clinical transparency principles, MediTriage AI never displays fabricated metrics when real evaluation results are absent.'}
          </p>
          {data.supports_job_execution && (
            <button
              type="button"
              onClick={handleRunEvaluation}
              disabled={isEvaluating}
              style={{
                backgroundColor: '#0284c7',
                color: '#fff',
                padding: '0.6rem 1.25rem',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Brain size={16} />
              <span>{isEvaluating ? 'Training & Evaluating...' : 'Generate Genuine Evaluation Now'}</span>
            </button>
          )}
        </div>
      )}

      {/* Main Content when Evaluation Data Available */}
      {!isLoading && !error && data && data.available && (
        <>
          {/* Critical Clinical Safety Principle Banner */}
          <div
            className="clinical-safety-card"
            style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '8px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              display: 'flex',
              gap: '1rem',
              alignItems: 'flex-start',
            }}
          >
            <ShieldAlert size={28} style={{ color: '#e11d48', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#9f1239', margin: '0 0 0.35rem 0' }}>
                Why High Overall Accuracy Can Conceal Missed Emergencies
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#be123c', margin: 0, lineHeight: 1.5 }}>
                In a typical hospital OPD, 85–90% of arrivals are non-urgent. A naïve machine-learning classifier could easily achieve <strong>90% overall accuracy</strong> by predicting &quot;Routine&quot; for every patient, while missing <strong>100% of cardiac arrests, strokes, and shock cases</strong>. In clinical triage, <strong>Emergency Sensitivity (Recall)</strong> and <strong>Zero False Negatives</strong> are non-negotiable safety imperatives.
              </p>
            </div>
          </div>

          {/* Model & Dataset Version Info Bar */}
          <div
            className="version-info-bar"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '0.85rem 1.25rem',
              borderRadius: '8px',
              marginBottom: '1.25rem',
              fontSize: '0.88rem',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
              <div>
                <span style={{ color: '#64748b' }}>Model Version: </span>
                <strong style={{ color: '#1e293b' }}>{data.model_version || '2026.1-triage-ml-v1'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Algorithm: </span>
                <strong style={{ color: '#1e293b' }}>{data.triage_classifier_type || 'XGBoost'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Dataset: </span>
                <strong style={{ color: '#1e293b' }}>{data.dataset_version || 'Synthetic OPD Fixture'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Total Records: </span>
                <strong style={{ color: '#1e293b' }}>{data.sample_counts?.total ?? 0} patients</strong>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0369a1' }}>
              <Info size={15} />
              <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>Preprocessed with zero test leakage</span>
            </div>
          </div>

          {/* Split Navigation Tabs */}
          <div
            className="split-tabs-container"
            style={{
              display: 'flex',
              gap: '0.5rem',
              borderBottom: '2px solid #e2e8f0',
              marginBottom: '1.5rem',
            }}
          >
            {(['test', 'validation', 'training'] as SplitTab[]).map((tab) => {
              const isActive = activeSplit === tab;
              const count =
                tab === 'test'
                  ? data.sample_counts?.test || 0
                  : tab === 'validation'
                  ? data.sample_counts?.validation || 0
                  : data.sample_counts?.training || 0;

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveSplit(tab)}
                  style={{
                    padding: '0.65rem 1.25rem',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: isActive ? '#0284c7' : '#64748b',
                    borderBottom: isActive ? '3px solid #0284c7' : '3px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '-2px',
                  }}
                >
                  <Layers size={16} />
                  <span>
                    {tab === 'test'
                      ? 'Holdout Test Split'
                      : tab === 'validation'
                      ? 'Validation Split'
                      : 'Training Split'}
                  </span>
                  <span
                    style={{
                      background: isActive ? '#e0f2fe' : '#f1f5f9',
                      color: isActive ? '#0369a1' : '#64748b',
                      fontSize: '0.75rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '10px',
                    }}
                  >
                    {count} records
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Split Identification Card */}
          <div
            style={{
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '6px',
              padding: '0.65rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ color: '#0369a1', fontWeight: 600 }}>
              <span>Active Evaluation Split: </span>
              <span style={{ color: '#0c4a6e' }}>{splitLabel}</span>
            </div>
            <div style={{ color: '#0284c7', fontSize: '0.8rem' }}>
              {activeSplit === 'test'
                ? 'Strict holdout: Evaluated after training completed; not trained on.'
                : activeSplit === 'validation'
                ? 'Used for parameter validation.'
                : 'Training set fit metrics.'}
            </div>
          </div>

          {/* Highlight KPI Cards: Emergency Metrics Prominence */}
          <div
            className="kpi-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* 1. Emergency Recall (Prominent) */}
            <div
              className="kpi-card-prominent"
              style={{
                background: '#fff',
                border: '2px solid #ef4444',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>
                  Emergency Sensitivity
                </span>
                <span
                  style={{
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    border: '1px solid #fecaca',
                  }}
                >
                  CRITICAL
                </span>
              </div>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#991b1b', lineHeight: 1.1 }}>
                {triage?.is_emergency_set_empty
                  ? 'Insufficient data'
                  : triage?.emergency_recall_sensitivity !== undefined && triage?.emergency_recall_sensitivity !== null
                  ? `${(triage.emergency_recall_sensitivity * 100).toFixed(1)}%`
                  : 'Insufficient data'}
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#b91c1c', marginTop: '0.35rem' }}>
                {triage?.is_emergency_set_empty
                  ? 'No labelled emergency cases in this split'
                  : triage?.emergency_recall_display ||
                    (triage?.emergency_recall_numerator !== undefined && triage?.emergency_cases_total !== undefined
                      ? `${triage.emergency_recall_numerator} / ${triage.emergency_cases_total} (${(
                          (triage.emergency_recall_sensitivity || 0) * 100
                        ).toFixed(1)}%)`
                      : 'Insufficient data')}
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.4rem 0 0 0' }}>
                {triage?.emergency_cases_total !== undefined
                  ? `Genuine Emergencies: ${triage.emergency_cases_total} | Detected: ${triage.emergency_recall_numerator ?? 0}`
                  : 'Numerator: detected emergencies • Denominator: true emergencies'}
              </p>
              {triage && (triage.emergency_false_negatives ?? 0) > 0 && (
                <div style={{ marginTop: '0.5rem', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.35rem 0.5rem', borderRadius: '4px', color: '#991b1b', fontSize: '0.75rem', fontWeight: 600 }}>
                  ⚠️ Warning: {triage.emergency_false_negatives} genuine emergencies missed in this evaluation split!
                </div>
              )}
            </div>

            {/* 2. Emergency False Negatives (Missed Emergencies) */}
            <div
              className="kpi-card"
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Missed Emergencies (FN)
                </span>
                {triage?.emergency_false_negatives === 0 ? (
                  <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
                ) : (
                  <AlertTriangle size={16} style={{ color: '#dc2626' }} />
                )}
              </div>
              <div
                style={{
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: triage?.emergency_false_negatives === 0 ? '#16a34a' : '#dc2626',
                  lineHeight: 1.1,
                }}
              >
                {triage?.emergency_false_negatives ?? 0}
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.4rem 0 0 0' }}>
                {triage?.emergency_false_negatives === 0
                  ? '0 missed emergencies (All true emergencies flagged)'
                  : `${triage?.emergency_false_negatives} true emergency cases failed escalation`}
              </p>
            </div>

            {/* 3. False Positives & Over-Triage */}
            <div
              className="kpi-card"
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Over-Triage & False Positives
                </span>
                <span
                  style={{
                    background: '#f1f5f9',
                    color: '#475569',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  FP: {triage?.emergency_false_positives ?? (triage?.asymmetric_clinical_cost?.over_triage_count ?? 0)}
                </span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>
                {triage?.over_triage_display ||
                  (triage?.emergency_false_positives !== undefined && triage?.non_emergency_cases_total !== undefined
                    ? `${triage.emergency_false_positives} / ${triage.non_emergency_cases_total} (${((triage.over_triage_rate || 0) * 100).toFixed(1)}%)`
                    : triage?.emergency_precision !== undefined && triage?.emergency_precision !== null
                    ? `Prec: ${(triage.emergency_precision * 100).toFixed(1)}%`
                    : 'N/A')}
              </div>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0.4rem 0 0 0' }}>
                Non-emergency cases incorrectly escalated as Level 1 emergencies
              </p>
            </div>

            {/* 4. Challenge Score Status */}
            <div
              className="kpi-card"
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>
                  Challenge Score Status
                </span>
                <HelpCircle size={15} style={{ color: '#64748b' }} />
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0369a1', lineHeight: 1.2 }}>
                {data.official_weighted_score?.score !== undefined
                  ? `${data.official_weighted_score.score.toFixed(4)}*`
                  : triage?.official_weighted_score?.score !== undefined
                  ? `${triage.official_weighted_score.score.toFixed(4)}*`
                  : 'Unverified'}
              </div>
              <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '0.3rem 0 0 0' }}>
                *Official evaluate.py not supplied; score follows documented domain primer formula.
              </p>
            </div>

            {/* 5. Overall Accuracy & Macro F1 */}
            <div
              className="kpi-card"
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <div style={{ marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Overall Accuracy & F1
                </span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>
                {triage?.accuracy !== undefined ? `${(triage.accuracy * 100).toFixed(1)}%` : 'N/A'}{' '}
                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>
                  (F1: {triage?.f1_macro !== undefined ? triage.f1_macro.toFixed(3) : 'N/A'})
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.4rem 0 0 0' }}>
                Evaluated on {sampleCount} records in {activeSplit} split
              </p>
            </div>
          </div>

          {/* Asymmetric Clinical Safety & Explicit Abstention Section */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
              gap: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* Asymmetric Cost Card */}
            <div
              style={{
                background: '#fff',
                border: '1px solid #fed7aa',
                borderRadius: '8px',
                padding: '1.25rem',
                borderLeft: '4px solid #f97316',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#9a3412', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldAlert size={18} />
                  <span>Asymmetric Safety Cost (20x Under-Triage Penalty)</span>
                </h4>
                <span
                  style={{
                    background: '#ffedd5',
                    color: '#9a3412',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  20&times; PENALTY
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 0.75rem 0' }}>
                Clinical loss function weighting under-triaged true emergencies at 20x vs routine discrepancies at 1x.
              </p>

              {(() => {
                const cost = triage?.asymmetric_clinical_cost || data.asymmetric_clinical_cost;
                return cost ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ background: '#fff7ed', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#c2410c', fontWeight: 600 }}>Emergency Under-Triage</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: cost.emergency_under_triage_count > 0 ? '#dc2626' : '#16a34a' }}>
                          {cost.emergency_under_triage_count}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9a3412' }}>Cost (20x): {cost.emergency_under_triage_cost.toFixed(1)}</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Routine Discrepancies</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>
                          {cost.non_emergency_misclassifications_count}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Cost (1x): {cost.non_emergency_misclassifications_count.toFixed(1)}</div>
                      </div>
                      <div style={{ background: '#fff7ed', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#c2410c', fontWeight: 600 }}>Total Clinical Loss</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#9a3412' }}>
                          {cost.total_asymmetric_clinical_loss.toFixed(1)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#9a3412' }}>Mean/pt: {cost.mean_clinical_loss_per_patient.toFixed(3)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9a3412', background: '#fff7ed', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                      <strong>Status:</strong> Provisional specification internally implemented (no external <code>evaluate.py</code> provided).
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#64748b', fontSize: '0.8rem' }}>Asymmetric cost metrics unavailable for this split.</p>
                );
              })()}
            </div>

            {/* Explicit Abstention Card */}
            <div
              style={{
                background: '#fff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                padding: '1.25rem',
                borderLeft: '4px solid #3b82f6',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e40af', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Brain size={18} />
                  <span>Explicit Abstention & Nurse Escalation</span>
                </h4>
                <span
                  style={{
                    background: '#dbeafe',
                    color: '#1e40af',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  SAFETY HOLD
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 0.75rem 0' }}>
                Explicit mandate: <em>&ldquo;Cannot assess &mdash; send to nurse now.&rdquo;</em> on insufficient or uncertain inputs.
              </p>

              {(() => {
                const abst = triage?.abstention_metrics || data.abstention_metrics;
                return abst ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div style={{ background: '#eff6ff', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>Definitive ML Cases</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e40af' }}>
                          {abst.definitive_cases_count ?? (sampleCount - abst.abstention_count)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#3b82f6' }}>Definitive predictions</div>
                      </div>
                      <div style={{ background: '#eff6ff', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>Referred to Nurse</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e40af' }}>
                          {abst.abstention_count}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#3b82f6' }}>Rate: {(abst.abstention_rate * 100).toFixed(1)}%</div>
                      </div>
                      <div style={{ background: '#f8fafc', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Autonomous Recall</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>
                          {abst.autonomous_emergency_recall !== null ? `${(abst.autonomous_emergency_recall * 100).toFixed(1)}%` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          {abst.autonomous_emergency_recall_display || 'Excludes nurse holds'}
                        </div>
                      </div>
                      <div style={{ background: '#eff6ff', padding: '0.6rem 0.75rem', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>Workflow Safety Rate</div>
                        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#15803d' }}>
                          {abst.workflow_safety_rate_with_nurse_review !== null ? `${(abst.workflow_safety_rate_with_nurse_review * 100).toFixed(1)}%` : 'N/A'}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#15803d' }}>With bedside nurse review</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', color: '#475569', marginBottom: '0.5rem', background: '#f8fafc', padding: '0.4rem 0.75rem', borderRadius: '4px' }}>
                      <span><strong>Abstained Emergencies:</strong> {abst.emergencies_in_abstained_count ?? 0}</span>
                      <span>&bull;</span>
                      <span><strong>Abstained Routine:</strong> {abst.non_emergencies_in_abstained_count ?? (abst.abstention_count - (abst.emergencies_in_abstained_count ?? 0))}</span>
                      <span>&bull;</span>
                      <span><strong>Total Evaluated:</strong> {abst.total_cases ?? sampleCount}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#1e40af', background: '#eff6ff', padding: '0.4rem 0.6rem', borderRadius: '4px' }}>
                      <strong>Clinical Invariant:</strong> Abstention cases are prioritized for rapid nurse intake &bull; Never placed at end of queue &bull; Never counted as autonomous ML Level 1 predictions.
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#64748b', fontSize: '0.8rem' }}>Abstention metrics unavailable for this split.</p>
                );
              })()}
            </div>
          </div>

          {/* Classification Performance Tables & Confusion Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Class-wise Metrics Table */}
            <div
              className="card-section"
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 size={18} style={{ color: '#0284c7' }} />
                <span>Class-Wise Triage Metrics ({splitLabel})</span>
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1rem' }}>
                Precision, recall, and F1-score across Emergency Severity Index tiers.
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569' }}>Triage Tier</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Precision</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Recall</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#475569' }}>F1-Score</th>
                      <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#475569' }}>Support</th>
                    </tr>
                  </thead>
                  <tbody>
                    {triage?.per_class_metrics ? (
                      Object.entries(triage.per_class_metrics).map(([cls, m]) => {
                        const isEmerg = cls === '1';
                        const tierName =
                          cls === '1'
                            ? 'Level 1 (Emergency)'
                            : cls === '2'
                            ? 'Level 2 (Priority)'
                            : cls === '3'
                            ? 'Level 3 (Routine)'
                            : cls === '4'
                            ? 'Level 4 (Less Urgent)'
                            : `Level ${cls}`;

                        return (
                          <tr
                            key={cls}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              background: isEmerg ? '#fff5f5' : 'transparent',
                            }}
                          >
                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: isEmerg ? 700 : 500, color: isEmerg ? '#991b1b' : '#1e293b' }}>
                              {tierName}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                              {(m.precision * 100).toFixed(1)}%
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace', fontWeight: isEmerg ? 700 : 400, color: isEmerg ? '#dc2626' : 'inherit' }}>
                              {(m.recall * 100).toFixed(1)}%
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                              {m['f1-score'].toFixed(3)}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'right', color: '#64748b' }}>
                              {m.support}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>
                          No per-class metrics available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Confusion Matrix Card */}
            <div
              className="card-section"
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem' }}>
                Triage Confusion Matrix ({splitLabel})
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1rem' }}>
                Rows indicate Actual Acuity; Columns indicate Predicted Acuity. Diagonal entries are correct.
              </p>

              {triage?.confusion_matrix && triage.labels ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.5rem', background: '#f8fafc', color: '#64748b', fontSize: '0.75rem' }}>
                          Actual \ Pred
                        </th>
                        {triage.labels.map((lbl) => (
                          <th key={lbl} style={{ padding: '0.5rem', background: '#f8fafc', fontWeight: 600, color: '#334155' }}>
                            L{lbl}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {triage.confusion_matrix.map((row, rIdx) => {
                        const actualLabel = triage.labels[rIdx];
                        return (
                          <tr key={rIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.5rem', fontWeight: 600, background: '#f8fafc', color: '#334155', textAlign: 'left' }}>
                              Level {actualLabel}
                            </td>
                            {row.map((val, cIdx) => {
                              const isDiagonal = rIdx === cIdx;
                              const isEmergencyMiss = actualLabel === 1 && cIdx > 0 && val > 0;
                              return (
                                <td
                                  key={cIdx}
                                  style={{
                                    padding: '0.5rem',
                                    fontWeight: isDiagonal ? 700 : 400,
                                    background: isEmergencyMiss
                                      ? '#fee2e2'
                                      : isDiagonal && val > 0
                                      ? '#f0fdf4'
                                      : 'transparent',
                                    color: isEmergencyMiss
                                      ? '#991b1b'
                                      : isDiagonal && val > 0
                                      ? '#166534'
                                      : '#475569',
                                    fontFamily: 'monospace',
                                  }}
                                >
                                  {val}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No confusion matrix available.</p>
              )}
            </div>
          </div>

          {/* Department Classification Metrics (When Available) */}
          {department && department.departments && (
            <div
              className="department-metrics-card"
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.25rem' }}>
                Automated Department Routing Performance
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '1rem' }}>
                Specialty OPD routing evaluated across {department.departments.length} clinic wings.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Department Accuracy</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                    {(department.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Department Macro F1</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                    {department.f1_macro.toFixed(3)}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Department Weighted F1</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                    {department.f1_weighted.toFixed(3)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {department.departments.map((dept) => (
                  <span
                    key={dept}
                    style={{
                      background: '#f1f5f9',
                      color: '#475569',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      padding: '0.2rem 0.6rem',
                      borderRadius: '4px',
                    }}
                  >
                    {dept}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Official Weighted Score Explanation & Methodology Card */}
          <div
            className="methodology-card"
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1.25rem',
              fontSize: '0.85rem',
              color: '#475569',
              lineHeight: 1.5,
            }}
          >
            <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#1e293b', margin: '0 0 0.5rem 0' }}>
              Official Evaluation Specification & Anti-Leakage Protocol
            </h4>
            <p style={{ margin: '0 0 0.5rem 0' }}>
              <strong>Official Scoring Formula:</strong>{' '}
              <code>0.50 &times; Emergency_Recall + 0.30 &times; Macro_F1 + 0.20 &times; Accuracy &minus; (0.10 &times; Emergency_False_Negatives)</code>.
              This evaluation places 50% weight directly on emergency sensitivity and penalizes any missed emergencies by 0.10 per case.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Strict Holdout Isolation:</strong> The preprocessing transformer and feature scalers were fitted <em>strictly</em> on the training split ({data.sample_counts?.training} records) and transformed onto the holdout test set ({data.sample_counts?.test} records) without feature leakage or cross-contamination.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default ModelEvaluationPage;
