import React, { useState, useEffect, useCallback, useId } from 'react';
import {
  Timer,
  Play,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  Info,
  Sliders,
  AlertTriangle,
  Users,
  Clock,
  Activity,
  BarChart2,
  Stethoscope,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { motion, useReducedMotion } from 'motion/react';
import { runQueueSimulation } from '../services/api';
import type {
  SimulationResponse,
  UrgencyGroupMetrics,
} from '../types/triage';

export const QueueSimulationPage: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const formId = useId();

  // Configurable Parameters
  const [numPatients, setNumPatients] = useState<number>(50);
  const [scenarioDuration, setScenarioDuration] = useState<number>(240); // minutes (e.g. 240 = 4h shift)
  const [numDoctors, setNumDoctors] = useState<number>(3);
  const [avgServiceDuration, setAvgServiceDuration] = useState<number>(15); // minutes
  const [emergencyProportion, setEmergencyProportion] = useState<number>(0.15); // 15%
  const [starvationThreshold, setStarvationThreshold] = useState<number>(90); // minutes
  const [randomSeed, setRandomSeed] = useState<number>(42);

  // Advanced service duration breakdown
  const [serviceEmergency, setServiceEmergency] = useState<number>(20);
  const [servicePriority, setServicePriority] = useState<number>(15);
  const [serviceRoutine, setServiceRoutine] = useState<number>(10);

  // Simulation State
  const [data, setData] = useState<SimulationResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'kpis' | 'queue_trend' | 'waiting_chart' | 'workload' | 'timeline' | 'methodology'>('kpis');

  const executeSimulation = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await runQueueSimulation({
        n_patients: numPatients,
        scenario_duration_minutes: scenarioDuration,
        num_doctors: numDoctors,
        avg_service_duration: avgServiceDuration,
        emergency_proportion: emergencyProportion,
        random_seed: randomSeed,
        service_time_emergency: serviceEmergency,
        service_time_priority: servicePriority,
        service_time_routine: serviceRoutine,
        starvation_reassessment_threshold: starvationThreshold,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Simulation run failed.');
    } finally {
      setIsLoading(false);
    }
  }, [
    numPatients,
    scenarioDuration,
    numDoctors,
    avgServiceDuration,
    emergencyProportion,
    randomSeed,
    serviceEmergency,
    servicePriority,
    serviceRoutine,
    starvationThreshold,
  ]);

  useEffect(() => {
    executeSimulation();
  }, [executeSimulation]);

  const handleResetDefaults = () => {
    setNumPatients(50);
    setScenarioDuration(240);
    setNumDoctors(3);
    setAvgServiceDuration(15);
    setEmergencyProportion(0.15);
    setStarvationThreshold(90);
    setRandomSeed(42);
    setServiceEmergency(20);
    setServicePriority(15);
    setServiceRoutine(10);
  };

  const handleRerun = () => {
    executeSimulation();
  };

  const fcfsGroups: Record<string, UrgencyGroupMetrics> = data?.fcfs?.by_urgency || {};
  const triageGroups: Record<string, UrgencyGroupMetrics> = data?.triage?.by_urgency || {};

  // Chart 2 Data: Waiting Time Comparison by Category
  const waitTimeComparisonData = [
    {
      category: 'L1 Emergency',
      target: 5,
      fcfs_avg: fcfsGroups.EMERGENCY?.avg_wait_minutes ?? 0,
      triage_avg: triageGroups.EMERGENCY?.avg_wait_minutes ?? 0,
      fcfs_median: fcfsGroups.EMERGENCY?.median_wait_minutes ?? 0,
      triage_median: triageGroups.EMERGENCY?.median_wait_minutes ?? 0,
    },
    {
      category: 'L2 Priority',
      target: 45,
      fcfs_avg: fcfsGroups.PRIORITY?.avg_wait_minutes ?? 0,
      triage_avg: triageGroups.PRIORITY?.avg_wait_minutes ?? 0,
      fcfs_median: fcfsGroups.PRIORITY?.median_wait_minutes ?? 0,
      triage_median: triageGroups.PRIORITY?.median_wait_minutes ?? 0,
    },
    {
      category: 'L3 Routine',
      target: 120,
      fcfs_avg: fcfsGroups.ROUTINE?.avg_wait_minutes ?? 0,
      triage_avg: triageGroups.ROUTINE?.avg_wait_minutes ?? 0,
      fcfs_median: fcfsGroups.ROUTINE?.median_wait_minutes ?? 0,
      triage_median: triageGroups.ROUTINE?.median_wait_minutes ?? 0,
    },
    {
      category: 'Overall Total',
      target: 60,
      fcfs_avg: data?.fcfs?.overall?.avg_wait_minutes ?? 0,
      triage_avg: data?.triage?.overall?.avg_wait_minutes ?? 0,
      fcfs_median: data?.fcfs?.overall?.median_wait_minutes ?? 0,
      triage_median: data?.triage?.overall?.median_wait_minutes ?? 0,
    },
  ];

  // Workload Chart Data
  const workloadData = (data?.clinician_workload || []).map((w) => ({
    name: w.clinician_name,
    'Baseline Patients': w.fcfs_patients,
    'Proposed Patients': w.triage_patients,
    'Baseline Utilization %': w.fcfs_utilization_percent,
    'Proposed Utilization %': w.triage_utilization_percent,
    'L1 Emergency Patients': w.triage_emergency_patients,
  }));

  // Waiting Time Distribution Data
  const waitDistData = (data?.waiting_time_distribution || []).map((d) => ({
    range: d.range,
    'Baseline FCFS': d.fcfs_count,
    'Proposed Triage': d.triage_count,
  }));

  // Queue Over Time Data
  const queueOverTimeData = data?.queue_over_time || [];

  return (
    <div className="inner-page-container digital-twin-page">
      {/* 1. Header with Simulation Disclaimer & Actions */}
      <div className="digital-twin-header">
        <div className="header-top-row">
          <div className="header-title-block">
            <div className="title-icon-wrap">
              <Timer size={24} className="text-sky-400" />
            </div>
            <div>
              <div className="twin-badge-cluster">
                <span className="twin-simulation-tag">SIMULATION MODE — NOT LIVE HOSPITAL DATA</span>
                <span className="twin-model-tag">Discrete-Event M/G/c Twin</span>
              </div>
              <h1 className="digital-twin-title">Hospital Digital Twin</h1>
              <p className="digital-twin-subtitle">
                Interactive Queue Simulator & Capacity Dynamics: Baseline (FCFS) vs. Proposed (Emergency-Priority Triage)
              </p>
            </div>
          </div>

          <div className="header-actions">
            <button
              type="button"
              onClick={executeSimulation}
              disabled={isLoading}
              className="digital-twin-run-btn"
              id="btn-run-simulation"
            >
              {isLoading ? (
                <>
                  <RefreshCw size={16} className="spin-icon" />
                  <span>Simulating...</span>
                </>
              ) : (
                <>
                  <Play size={16} />
                  <span>Run Simulation</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleRerun}
              disabled={isLoading}
              className="digital-twin-secondary-btn"
              title="Rerun simulation with exact current settings"
            >
              <RefreshCw size={14} />
              <span>Rerun</span>
            </button>

            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={isLoading}
              className="digital-twin-secondary-btn"
              title="Reset scenario to standard defaults"
            >
              <RotateCcw size={14} />
              <span>Reset Scenario</span>
            </button>
          </div>
        </div>

        {/* Ethical Safety Alert Strip */}
        <div className="digital-twin-disclaimer-strip">
          <Info size={18} className="flex-shrink-0 text-sky-400" />
          <span>
            <strong>RESEARCH & PLANNING NOTICE:</strong> All simulated arrivals, clinicians, and wait durations are
            purely synthetic models. Real clinical flow is subject to inpatient bed availability, laboratory turnaround,
            and physician authority. Estimates must never be presented as actual hospital performance metrics.
          </span>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="emergency-error-alert" role="alert">
          <AlertTriangle size={18} className="text-red-600 flex-shrink-0" />
          <div>
            <strong>Simulation Execution Notice:</strong> {error}
          </div>
        </div>
      )}

      {/* 2. Interactive Control Panel */}
      <div className="digital-twin-control-panel">
        <div className="control-panel-header">
          <Sliders size={18} className="text-sky-500" />
          <h3 className="control-panel-title">Interactive Digital Twin Parameter Controls</h3>
          <span className="control-panel-sub">Adjust scenario assumptions and trigger dynamic recalculation</span>
        </div>

        <div className="controls-grid">
          {/* Control 1: Incoming Patient Volume */}
          <div className="control-field-card">
            <div className="control-field-label-row">
              <label htmlFor={`${formId}-patients`} className="control-label">Simulated Incoming Patients</label>
              <span className="control-value-badge">{numPatients} patients</span>
            </div>
            <div className="quick-select-pills">
              {[5, 10, 20, 30, 50].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setNumPatients(count)}
                  className={`quick-pill-btn ${numPatients === count ? 'active' : ''}`}
                >
                  {count}
                </button>
              ))}
            </div>
            <input
              id={`${formId}-patients`}
              type="range"
              min={5}
              max={100}
              step={5}
              value={numPatients}
              onChange={(e) => setNumPatients(Number(e.target.value))}
              className="control-slider"
            />
          </div>

          {/* Control 2: Scenario Duration */}
          <div className="control-field-card">
            <div className="control-field-label-row">
              <label htmlFor={`${formId}-duration`} className="control-label">Scenario Duration</label>
              <span className="control-value-badge">{scenarioDuration} min ({Math.round(scenarioDuration / 60)}h)</span>
            </div>
            <div className="quick-select-pills">
              {[
                [60, '1h'],
                [120, '2h'],
                [240, '4h Shift'],
                [360, '6h'],
                [480, '8h Full'],
              ].map(([dur, label]) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => setScenarioDuration(Number(dur))}
                  className={`quick-pill-btn ${scenarioDuration === dur ? 'active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              id={`${formId}-duration`}
              type="range"
              min={60}
              max={480}
              step={30}
              value={scenarioDuration}
              onChange={(e) => setScenarioDuration(Number(e.target.value))}
              className="control-slider"
            />
          </div>

          {/* Control 3: Available Clinicians */}
          <div className="control-field-card">
            <div className="control-field-label-row">
              <label htmlFor={`${formId}-doctors`} className="control-label">Available Clinicians</label>
              <span className="control-value-badge">{numDoctors} Doctors</span>
            </div>
            <div className="quick-select-pills">
              {[1, 2, 3, 4, 5, 6].map((docs) => (
                <button
                  key={docs}
                  type="button"
                  onClick={() => setNumDoctors(docs)}
                  className={`quick-pill-btn ${numDoctors === docs ? 'active' : ''}`}
                >
                  {docs} Doc
                </button>
              ))}
            </div>
            <input
              id={`${formId}-doctors`}
              type="range"
              min={1}
              max={8}
              value={numDoctors}
              onChange={(e) => setNumDoctors(Number(e.target.value))}
              className="control-slider"
            />
          </div>

          {/* Control 4: Average Service Duration */}
          <div className="control-field-card">
            <div className="control-field-label-row">
              <label htmlFor={`${formId}-service`} className="control-label">Avg. Service Duration</label>
              <span className="control-value-badge">{avgServiceDuration} min/case</span>
            </div>
            <div className="quick-select-pills">
              {[10, 15, 20, 25, 30].map((dur) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => {
                    setAvgServiceDuration(dur);
                    setServiceEmergency(Math.max(8, Math.round(dur * 1.35)));
                    setServicePriority(dur);
                    setServiceRoutine(Math.max(5, Math.round(dur * 0.75)));
                  }}
                  className={`quick-pill-btn ${avgServiceDuration === dur ? 'active' : ''}`}
                >
                  {dur}m
                </button>
              ))}
            </div>
            <input
              id={`${formId}-service`}
              type="range"
              min={5}
              max={40}
              step={1}
              value={avgServiceDuration}
              onChange={(e) => {
                const val = Number(e.target.value);
                setAvgServiceDuration(val);
                setServiceEmergency(Math.max(8, Math.round(val * 1.35)));
                setServicePriority(val);
                setServiceRoutine(Math.max(5, Math.round(val * 0.75)));
              }}
              className="control-slider"
            />
          </div>

          {/* Control 5: Emergency Proportion */}
          <div className="control-field-card">
            <div className="control-field-label-row">
              <label htmlFor={`${formId}-emerg-prop`} className="control-label">Emergency Proportion</label>
              <span className="control-value-badge">{Math.round(emergencyProportion * 100)}% L1 Trauma</span>
            </div>
            <div className="quick-select-pills">
              {[0.05, 0.1, 0.15, 0.2, 0.3, 0.4].map((prop) => (
                <button
                  key={prop}
                  type="button"
                  onClick={() => setEmergencyProportion(prop)}
                  className={`quick-pill-btn ${emergencyProportion === prop ? 'active' : ''}`}
                >
                  {Math.round(prop * 100)}%
                </button>
              ))}
            </div>
            <input
              id={`${formId}-emerg-prop`}
              type="range"
              min={0.05}
              max={0.5}
              step={0.05}
              value={emergencyProportion}
              onChange={(e) => setEmergencyProportion(Number(e.target.value))}
              className="control-slider"
            />
          </div>

          {/* Control 6: Anti-Starvation Guard & Seed */}
          <div className="control-field-card">
            <div className="control-field-label-row">
              <label htmlFor={`${formId}-starvation`} className="control-label">Anti-Starvation Threshold</label>
              <span className="control-value-badge">{starvationThreshold}m Wait</span>
            </div>
            <div className="quick-select-pills">
              {[45, 60, 90, 120].map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => setStarvationThreshold(th)}
                  className={`quick-pill-btn ${starvationThreshold === th ? 'active' : ''}`}
                >
                  {th}m
                </button>
              ))}
            </div>
            <div className="seed-input-row mt-2">
              <span className="text-xs text-slate-500 font-semibold">Random Seed:</span>
              <input
                id={`${formId}-seed`}
                aria-label="Random Seed for Reproducibility"
                type="number"
                value={randomSeed}
                onChange={(e) => setRandomSeed(Number(e.target.value))}
                className="seed-input-field"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Short Automatically Generated Clinical Summary */}
      {data?.auto_generated_summary && (
        <motion.div
          className="digital-twin-summary-card"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="summary-card-header">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-teal-600" />
              <h4 className="summary-card-title">Calculated Digital Twin Scenario Summary</h4>
            </div>
            <span className="summary-calc-tag">DERIVED PURELY FROM SIMULATION OUTPUTS</span>
          </div>
          <div className="summary-card-body">
            <p className="summary-text-block">{data.auto_generated_summary}</p>
          </div>
        </motion.div>
      )}

      {/* 4. Before-and-After KPI Cards */}
      {data && (
        <div className="kpi-comparison-grid">
          {/* Card 1: Emergency Wait Time */}
          <div className="kpi-card highlight-danger">
            <div className="kpi-header">
              <span className="kpi-label">L1 EMERGENCY AVERAGE WAIT</span>
              <TrendingDown size={18} className="text-emerald-500" />
            </div>
            <div className="kpi-stat-pair">
              <div className="stat-side baseline">
                <span className="stat-tag">BASELINE (FCFS)</span>
                <span className="stat-num">{data.comparison_highlights.emergency_avg_wait_fcfs}m</span>
              </div>
              <div className="stat-arrow">&rarr;</div>
              <div className="stat-side proposed">
                <span className="stat-tag">PROPOSED (TRIAGE)</span>
                <span className="stat-num text-emerald-600">{data.comparison_highlights.emergency_avg_wait_triage}m</span>
              </div>
            </div>
            <div className="kpi-sub-text">
              Wait Reduction: <strong>-{data.comparison_highlights.emergency_wait_reduction_percent}%</strong> (Target &le; 5m)
            </div>
          </div>

          {/* Card 2: Overall Average Wait */}
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">OVERALL AVERAGE WAIT TIME</span>
              <Clock size={16} className="text-sky-500" />
            </div>
            <div className="kpi-stat-pair">
              <div className="stat-side baseline">
                <span className="stat-tag">BASELINE (FCFS)</span>
                <span className="stat-num">{data.fcfs.overall.avg_wait_minutes}m</span>
              </div>
              <div className="stat-arrow">&rarr;</div>
              <div className="stat-side proposed">
                <span className="stat-tag">PROPOSED (TRIAGE)</span>
                <span className="stat-num text-sky-600">{data.triage.overall.avg_wait_minutes}m</span>
              </div>
            </div>
            <div className="kpi-sub-text">
              Median Wait: FCFS {data.fcfs.overall.median_wait_minutes}m &rarr; Triage {data.triage.overall.median_wait_minutes}m
            </div>
          </div>

          {/* Card 3: Longest Simulated Wait */}
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">LONGEST SIMULATED WAIT (MAX)</span>
              <Activity size={16} className="text-amber-500" />
            </div>
            <div className="kpi-stat-pair">
              <div className="stat-side baseline">
                <span className="stat-tag">BASELINE (FCFS)</span>
                <span className="stat-num">{data.fcfs.overall.max_wait_minutes}m</span>
              </div>
              <div className="stat-arrow">&rarr;</div>
              <div className="stat-side proposed">
                <span className="stat-tag">PROPOSED (TRIAGE)</span>
                <span className="stat-num text-amber-600">{data.triage.overall.max_wait_minutes}m</span>
              </div>
            </div>
            <div className="kpi-sub-text">
              Anti-Starvation Reassessments Triggered: <strong>{data.comparison_highlights.starvation_safeguards_triggered}</strong>
            </div>
          </div>

          {/* Card 4: Maximum Queue Length & Completion */}
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">PEAK QUEUE BACKLOG & COMPLETION</span>
              <Users size={16} className="text-teal-500" />
            </div>
            <div className="kpi-stat-pair">
              <div className="stat-side baseline">
                <span className="stat-tag">MAX QUEUE (FCFS)</span>
                <span className="stat-num">{data.max_queue_length?.fcfs ?? 0} pts</span>
              </div>
              <div className="stat-arrow">&rarr;</div>
              <div className="stat-side proposed">
                <span className="stat-tag">MAX QUEUE (TRIAGE)</span>
                <span className="stat-num text-teal-600">{data.max_queue_length?.triage ?? 0} pts</span>
              </div>
            </div>
            <div className="kpi-sub-text">
              Completed in {scenarioDuration}m: <strong>{data.case_completion?.triage_completed ?? 0}</strong> ({data.case_completion?.triage_remaining ?? 0} remaining)
            </div>
          </div>
        </div>
      )}

      {/* 5. Navigation Tabs for Visualizations & Data */}
      <div className="twin-tabs-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'kpis'}
          onClick={() => setActiveTab('kpis')}
          className={`twin-tab-btn ${activeTab === 'kpis' ? 'active' : ''}`}
        >
          <BarChart2 size={16} />
          <span>Acuity Targets & Table</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'queue_trend'}
          onClick={() => setActiveTab('queue_trend')}
          className={`twin-tab-btn ${activeTab === 'queue_trend' ? 'active' : ''}`}
        >
          <TrendingDown size={16} />
          <span>Queue Over Time Chart</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'waiting_chart'}
          onClick={() => setActiveTab('waiting_chart')}
          className={`twin-tab-btn ${activeTab === 'waiting_chart' ? 'active' : ''}`}
        >
          <Clock size={16} />
          <span>Waiting Time Comparison</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'workload'}
          onClick={() => setActiveTab('workload')}
          className={`twin-tab-btn ${activeTab === 'workload' ? 'active' : ''}`}
        >
          <Stethoscope size={16} />
          <span>Clinician & Dept Workload</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'timeline'}
          onClick={() => setActiveTab('timeline')}
          className={`twin-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
        >
          <Activity size={16} />
          <span>Simulation Event Timeline</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'methodology'}
          onClick={() => setActiveTab('methodology')}
          className={`twin-tab-btn ${activeTab === 'methodology' ? 'active' : ''}`}
        >
          <Info size={16} />
          <span>Methodology & Assumptions</span>
        </button>
      </div>

      {/* TAB 1: Acuity Targets Comparison Table */}
      {activeTab === 'kpis' && data && (
        <div className="twin-content-panel">
          <div className="table-card">
            <div className="table-card-header">
              <div>
                <h3 className="table-title">Urgency Tier Wait Time Comparison: Baseline vs. Proposed Triage</h3>
                <p className="table-subtitle">
                  Direct evaluation under identical simulated arrival stream ({numPatients} patients, {numDoctors} clinicians, seed {randomSeed}).
                </p>
              </div>
              <span className="badge-synthetic">SIMULATED EVALUATION</span>
            </div>

            <div className="overflow-x-auto">
              <table className="twin-table">
                <thead>
                  <tr>
                    <th>Triage Category</th>
                    <th className="text-center">Simulated Count</th>
                    <th className="text-center">Clinical Target</th>
                    <th className="text-right">FCFS Avg Wait</th>
                    <th className="text-right text-sky-700">Triage Avg Wait</th>
                    <th className="text-right">FCFS Max Wait</th>
                    <th className="text-right text-sky-700">Triage Max Wait</th>
                    <th className="text-right">FCFS Breaches</th>
                    <th className="text-right text-emerald-700">Triage Breaches</th>
                    <th className="text-right text-teal-700">Adherence</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['EMERGENCY', 'Level 1 Emergency', 5, 'badge-emergency'],
                    ['PRIORITY', 'Level 2 Priority', 45, 'badge-priority'],
                    ['ROUTINE', 'Level 3 Routine', 120, 'badge-routine'],
                  ].map(([key, label, target, badgeClass]) => {
                    const fcfs = fcfsGroups[key] || {};
                    const tr = triageGroups[key] || {};
                    return (
                      <tr key={key}>
                        <td>
                          <span className={`urgency-pill ${badgeClass}`}>{label}</span>
                        </td>
                        <td className="text-center font-bold">{tr.patient_count ?? 0}</td>
                        <td className="text-center font-semibold text-slate-500">&le; {target}m</td>
                        <td className="text-right font-mono">{fcfs.avg_wait_minutes ?? 0}m</td>
                        <td className="text-right font-mono font-bold text-sky-700">{tr.avg_wait_minutes ?? 0}m</td>
                        <td className="text-right font-mono">{fcfs.max_wait_minutes ?? 0}m</td>
                        <td className="text-right font-mono font-bold text-sky-700">{tr.max_wait_minutes ?? 0}m</td>
                        <td className="text-right font-mono text-red-600 font-semibold">{fcfs.exceeded_target_count ?? 0}</td>
                        <td className="text-right font-mono text-emerald-700 font-bold">{tr.exceeded_target_count ?? 0}</td>
                        <td className="text-right font-bold text-teal-700">{tr.target_adherence_percent ?? 100}%</td>
                      </tr>
                    );
                  })}
                  {/* Overall Summary Row */}
                  <tr className="twin-table-total-row">
                    <td>
                      <strong>Total / Overall Average</strong>
                    </td>
                    <td className="text-center font-extrabold">{data.triage.overall.total_patients}</td>
                    <td className="text-center text-slate-400">—</td>
                    <td className="text-right font-mono font-bold">{data.fcfs.overall.avg_wait_minutes}m</td>
                    <td className="text-right font-mono font-extrabold text-sky-700">{data.triage.overall.avg_wait_minutes}m</td>
                    <td className="text-right font-mono">{data.fcfs.overall.max_wait_minutes}m</td>
                    <td className="text-right font-mono font-bold text-sky-700">{data.triage.overall.max_wait_minutes}m</td>
                    <td className="text-right font-mono text-red-600">{data.fcfs.overall.total_exceeded_target}</td>
                    <td className="text-right font-mono text-emerald-700 font-bold">{data.triage.overall.total_exceeded_target}</td>
                    <td className="text-right font-extrabold text-teal-700">{data.triage.overall.target_adherence_rate}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Queue Over Time Line Chart */}
      {activeTab === 'queue_trend' && (
        <div className="twin-content-panel">
          <div className="chart-card">
            <div className="chart-card-header">
              <div>
                <h3 className="chart-title">Simulated Queue Length Over Time</h3>
                <p className="chart-subtitle">
                  Backlog progression comparing Baseline FCFS (navy line) against Proposed Triage (teal line).
                </p>
              </div>
              <div className="chart-legend-chips">
                <span className="legend-chip fcfs">Baseline (FCFS)</span>
                <span className="legend-chip triage">Proposed (Triage)</span>
              </div>
            </div>

            <div className="chart-container" style={{ height: 320, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={queueOverTimeData} margin={{ top: 12, right: 24, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="time_str" tick={{ fill: '#475569', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#475569', fontSize: 11 }} label={{ value: 'Queued Patients', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 8, fontSize: 12 }}
                    formatter={(val: any, name: any) => [`${val ?? 0} waiting`, name === 'fcfs_queue' ? 'Baseline (FCFS)' : 'Proposed (Triage)']}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="fcfs_queue" name="Baseline (FCFS)" stroke="#1e293b" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="triage_queue" name="Proposed (Triage)" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Waiting Time Comparison Bar Chart */}
      {activeTab === 'waiting_chart' && (
        <div className="twin-content-panel">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart: Average Waiting Time by Tier */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <h3 className="chart-title">Average Wait Time by Urgency Tier</h3>
                  <p className="chart-subtitle">Direct comparison of mean wait minutes</p>
                </div>
              </div>
              <div className="chart-container" style={{ height: 280, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waitTimeComparisonData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="category" tick={{ fill: '#475569', fontSize: 11 }} />
                    <YAxis label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 8, fontSize: 12 }}
                      formatter={(val: any, name: any) => [`${val ?? 0} min`, name === 'fcfs_avg' ? 'Baseline FCFS' : 'Proposed Triage']}
                    />
                    <Legend />
                    <Bar dataKey="fcfs_avg" name="Baseline (FCFS)" fill="#64748b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="triage_avg" name="Proposed (Triage)" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart: Waiting Time Distribution Histogram */}
            <div className="chart-card">
              <div className="chart-card-header">
                <div>
                  <h3 className="chart-title">Waiting Time Distribution Buckets</h3>
                  <p className="chart-subtitle">Patient count distribution across wait duration tiers</p>
                </div>
              </div>
              <div className="chart-container" style={{ height: 280, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waitDistData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="range" tick={{ fill: '#475569', fontSize: 11 }} />
                    <YAxis label={{ value: 'Patient Count', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend />
                    <Bar dataKey="Baseline FCFS" fill="#475569" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Proposed Triage" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Clinician Workload & Utilization */}
      {activeTab === 'workload' && (
        <div className="twin-content-panel">
          <div className="chart-card">
            <div className="chart-card-header">
              <div>
                <h3 className="chart-title">Clinician & Department Throughput & Capacity Utilization</h3>
                <p className="chart-subtitle">
                  Workload balance across {numDoctors} modeled clinicians and simulated hospital care units during {scenarioDuration}-minute shift.
                </p>
              </div>
            </div>

            {/* Department-level Workload Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div className="p-3.5 rounded-lg border border-red-200 bg-red-50/70 dark:bg-red-950/20">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-800 dark:text-red-300">
                    Emergency & Resuscitation Bay
                  </span>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
                    Immediate / Level 1
                  </span>
                </div>
                <div className="text-xl font-extrabold text-red-900 dark:text-red-200">
                  {triageGroups.EMERGENCY?.patient_count ?? 0} <span className="text-xs font-normal text-slate-600 dark:text-slate-400">simulated patients</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Avg wait: <strong>{data?.comparison_highlights.emergency_avg_wait_triage ?? 0}m</strong> (Target &le; 5m) • Dedicated emergency escalation pathway
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-sky-200 bg-sky-50/70 dark:bg-sky-950/20">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                    General Medicine OPD Consultation Rooms
                  </span>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                    Priority & Routine
                  </span>
                </div>
                <div className="text-xl font-extrabold text-sky-900 dark:text-sky-200">
                  {(triageGroups.PRIORITY?.patient_count ?? 0) + (triageGroups.ROUTINE?.patient_count ?? 0)} <span className="text-xs font-normal text-slate-600 dark:text-slate-400">simulated patients</span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Urgent Priority: <strong>{triageGroups.PRIORITY?.patient_count ?? 0}</strong> • Routine: <strong>{triageGroups.ROUTINE?.patient_count ?? 0}</strong> • Anti-starvation safeguards active
                </div>
              </div>
            </div>

            <div className="chart-container" style={{ height: 300, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workloadData} margin={{ top: 12, right: 20, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} />
                  <YAxis label={{ value: 'Patients Treated', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', color: '#f8fafc', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend />
                  <Bar dataKey="Baseline Patients" fill="#64748b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Proposed Patients" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="L1 Emergency Patients" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Clinician Detailed Stats Row */}
            <div className="clinician-stats-row mt-4">
              {data?.clinician_workload?.map((w) => (
                <div key={w.clinician_id} className="clinician-badge-card">
                  <div className="flex items-center gap-2 mb-1">
                    <Stethoscope size={16} className="text-sky-600" />
                    <span className="font-bold text-slate-800 text-sm">{w.clinician_name}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Patients Seen: <strong>{w.triage_patients}</strong> (Emerg: <strong>{w.triage_emergency_patients}</strong>)
                  </div>
                  <div className="text-xs text-slate-600">
                    Busy Time: <strong>{w.triage_busy_minutes}m</strong> ({w.triage_utilization_percent}% utilization)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: Simulation Event Timeline */}
      {activeTab === 'timeline' && data && (
        <div className="twin-content-panel">
          <div className="timeline-container-card">
            <div className="timeline-card-header">
              <div>
                <h3 className="timeline-title">Simulation Event Timeline</h3>
                <p className="timeline-subtitle">
                  Chronological trace of synthetic arrivals, queue entries, consultation starts, and completions.
                </p>
              </div>
              <span className="text-xs text-slate-500 font-semibold">Showing first 60 discrete events</span>
            </div>

            <div className="simulation-events-stream">
              {data.event_timeline?.map((evt, idx) => {
                const isStart = evt.event_type === 'SERVICE_START';
                return (
                  <div key={idx} className={`event-stream-item ${evt.event_type.toLowerCase()}`}>
                    <div className="event-marker-dot" />
                    <div className="event-card-box">
                      <div className="event-top-row">
                        <span className="event-time-badge">{evt.time_str} (T+{evt.minute}m)</span>
                        <span className={`event-urgency-badge ${evt.urgency_category.toLowerCase()}`}>
                          {evt.urgency_category}
                        </span>
                        <span className="event-patient-id">{evt.patient_id}</span>
                      </div>
                      <h5 className="event-item-title">{evt.title}</h5>
                      <p className="event-item-desc">{evt.description}</p>
                      {isStart && evt.wait_time_minutes !== undefined && (
                        <div className="event-meta-row">
                          <span className={`wait-pill ${evt.exceeded_target ? 'exceeded' : 'adherent'}`}>
                            Wait: {evt.wait_time_minutes}m
                          </span>
                          {evt.reassessment_escalated && (
                            <span className="starvation-bump-pill">
                              Anti-Starvation Bump Triggered
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: Methodology & Limitations */}
      {activeTab === 'methodology' && data && (
        <div className="twin-content-panel">
          <div className="methodology-card">
            <h3 className="methodology-title">Simulation Modeling Framework & Mathematical Assumptions</h3>
            <p className="methodology-lead">{data.methodology_and_limitations.methodology}</p>

            <div className="methodology-section mt-4">
              <h4 className="section-heading">Key Discrete-Event Queue Assumptions</h4>
              <ul className="methodology-list">
                {data.methodology_and_limitations.assumptions.map((assump, i) => (
                  <li key={i}>{assump}</li>
                ))}
              </ul>
            </div>

            <div className="methodology-disclaimer-box mt-4">
              <ShieldCheck size={20} className="text-sky-600 flex-shrink-0" />
              <div>
                <h5 className="disclaimer-heading">Scientific Disclaimer on Hospital Digital Twin Models</h5>
                <p className="disclaimer-text">{data.methodology_and_limitations.limitations_disclaimer}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
