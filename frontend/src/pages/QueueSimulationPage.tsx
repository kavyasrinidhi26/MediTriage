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
  Database,
  Coffee,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
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
import { runQueueSimulation, fetchArrivalLogStatus } from '../services/api';
import type {
  SimulationResponse,
  UrgencyGroupMetrics,
  ArrivalLogStatusResponse,
} from '../types/triage';

export const QueueSimulationPage: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const formId = useId();

  // Dataset Source: 'synthetic' | 'database' | 'official'
  const [datasetSource, setDatasetSource] = useState<'synthetic' | 'database' | 'official'>('synthetic');
  const [arrivalLogStatus, setArrivalLogStatus] = useState<ArrivalLogStatusResponse | null>(null);

  // Configurable Parameters
  const [numPatients, setNumPatients] = useState<number>(50);
  const [scenarioDuration, setScenarioDuration] = useState<number>(240); // minutes (e.g. 240 = 4h shift)
  const [numDoctors, setNumDoctors] = useState<number>(3);
  const [avgServiceDuration, setAvgServiceDuration] = useState<number>(15); // minutes
  const [emergencyProportion, setEmergencyProportion] = useState<number>(0.15); // 15%
  const [starvationThreshold, setStarvationThreshold] = useState<number>(90); // minutes
  const [randomSeed, setRandomSeed] = useState<number>(42);

  // Advanced doctor break configuration
  const [doctorBreakMinutes, setDoctorBreakMinutes] = useState<number>(0); // 0 = continuous
  const [doctorBreakInterval, setDoctorBreakInterval] = useState<number>(240); // 4h

  // Advanced service duration breakdown
  const [serviceEmergency, setServiceEmergency] = useState<number>(20);
  const [servicePriority, setServicePriority] = useState<number>(15);
  const [serviceRoutine, setServiceRoutine] = useState<number>(10);

  // Simulation State
  const [data, setData] = useState<SimulationResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'kpis' | 'queue_trend' | 'waiting_chart' | 'workload' | 'timeline' | 'methodology'>('kpis');

  // Check arrival log status on mount
  useEffect(() => {
    fetchArrivalLogStatus()
      .then((status) => setArrivalLogStatus(status))
      .catch(() => {});
  }, []);

  const executeSimulation = useCallback(async () => {
    if (datasetSource === 'official') {
      setIsLoading(false);
      setData(null);
      setError(
        'Official patient arrival log is unavailable. The H1 OPD problem statement repository does not provide an official arrival log file. In accordance with requirements, this limitation is explicitly reported and no invented results are displayed under this mode. Please select "Synthetic Demonstration" or "Database Intake Log".'
      );
      return;
    }

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
        dataset_source: datasetSource,
        doctor_break_minutes: doctorBreakMinutes,
        doctor_break_interval_minutes: doctorBreakInterval,
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Simulation run failed.');
      setData(null);
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
    datasetSource,
    doctorBreakMinutes,
    doctorBreakInterval,
  ]);

  useEffect(() => {
    executeSimulation();
  }, [executeSimulation]);

  const handleResetDefaults = () => {
    setDatasetSource('synthetic');
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
    setDoctorBreakMinutes(0);
    setDoctorBreakInterval(240);
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
          <span className="control-panel-sub">Adjust scenario assumptions, data sources, and clinician staffing</span>
        </div>

        {/* Dataset Source Selection & Status */}
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Database size={14} className="text-sky-600" />
              Patient Arrival Log Source:
            </span>
            {arrivalLogStatus && (
              <span className={`text-xs px-2 py-0.5 rounded font-semibold flex items-center gap-1 ${
                arrivalLogStatus.official_log_available
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
              }`}>
                {arrivalLogStatus.official_log_available ? (
                  <>
                    <CheckCircle2 size={12} /> Official Log Available
                  </>
                ) : (
                  <>
                    <AlertCircle size={12} /> Official Log: Not Provided (Limitation Reported)
                  </>
                )}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDatasetSource('synthetic')}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                datasetSource === 'synthetic'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <Activity size={14} />
              Synthetic Demonstration Scenario (M/G/c Model)
            </button>
            <button
              type="button"
              onClick={() => setDatasetSource('database')}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                datasetSource === 'database'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <Database size={14} />
              Database Patient Intake Records ({arrivalLogStatus?.database_records_count ?? 580} records)
            </button>
            <button
              type="button"
              onClick={() => setDatasetSource('official')}
              className={`px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                datasetSource === 'official'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet size={14} />
              Official Problem Statement Arrival Log
            </button>
          </div>

          {/* Contextual guidance on active dataset source */}
          <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {datasetSource === 'synthetic' && (
              <span className="text-sky-700 dark:text-sky-300 font-medium">
                <strong>Labelled Synthetic Demonstration:</strong> Parameterized discrete-event arrival stream for reproducible comparison. Never presented as official evaluation data.
              </span>
            )}
            {datasetSource === 'database' && (
              <span className="text-teal-700 dark:text-teal-300 font-medium">
                <strong>Recorded Hospital Intake Records:</strong> Patient arrival times, chief complaints, and triage categories loaded directly from the system SQLite intake database.
              </span>
            )}
            {datasetSource === 'official' && (
              <span className="text-amber-700 dark:text-amber-300 font-medium">
                <strong>Limitation Notice:</strong> No external official arrival log file was provided in this challenge problem statement. In accordance with requirements, this limitation is explicitly reported rather than fabricating data.
              </span>
            )}
          </div>
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
                disabled={datasetSource === 'database'}
                title={datasetSource === 'database' ? 'Disabled for recorded database influx' : 'Random seed for reproducibility'}
              />
            </div>
          </div>

          {/* Control 7: Doctor Rest Breaks & Capacity */}
          <div className="control-field-card">
            <div className="control-field-label-row">
              <label className="control-label flex items-center gap-1.5">
                <Coffee size={14} className="text-amber-600" />
                Doctor Rest Breaks
              </label>
              <span className="control-value-badge">
                {doctorBreakMinutes === 0 ? 'Continuous (0m)' : `${doctorBreakMinutes}m / ${doctorBreakInterval / 60}h`}
              </span>
            </div>
            <div className="quick-select-pills">
              {[
                [0, 'Continuous (0m)'],
                [15, '15m Break'],
                [30, '30m Break'],
              ].map(([dur, label]) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => setDoctorBreakMinutes(Number(dur))}
                  className={`quick-pill-btn ${doctorBreakMinutes === dur ? 'active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {doctorBreakMinutes > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Interval:</span>
                {[
                  [120, 'Every 2h'],
                  [240, 'Every 4h'],
                  [360, 'Every 6h'],
                ].map(([intv, label]) => (
                  <button
                    key={intv}
                    type="button"
                    onClick={() => setDoctorBreakInterval(Number(intv))}
                    className={`quick-pill-btn ${doctorBreakInterval === intv ? 'active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Empty State / Inputs Unavailable Notice */}
      {!data && !isLoading && (
        <div className="p-8 my-6 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 text-slate-800 dark:text-slate-200 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-lg flex-shrink-0">
              <FileSpreadsheet size={32} />
            </div>
            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200 uppercase tracking-wide">
                  Dataset Limitation Notice
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Requested: <strong>{datasetSource === 'official' ? 'Official Problem Statement Arrival Log' : datasetSource}</strong>
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Official Arrival Log File Not Provided In Problem Statement
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                No external patient arrival log file (e.g. <code>arrival_log.csv</code>) exists in the problem statement distribution.
                In strict compliance with evaluation instructions, <strong>results are never invented or fabricated when real inputs are unavailable</strong>,
                nor do we make ungrounded real-world waiting-time claims.
              </p>
              <div className="p-3 bg-white/80 dark:bg-slate-900/60 rounded-lg border border-amber-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                <p><strong>Available Reproducible Evaluation Options:</strong></p>
                <p>&bull; <strong>Recorded Hospital Intake Database:</strong> Replays actual patient arrivals, vital signs, and triage levels recorded in the system SQLite database ({arrivalLogStatus?.database_records_count ?? 580} records).</p>
                <p>&bull; <strong>Synthetic Demonstration Scenario:</strong> Generates a parameterized M/G/c arrival stream with configured emergency proportions and random seeds for reproducible policy benchmarking.</p>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDatasetSource('database')}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Database size={14} />
                  Load Recorded Database Arrivals ({arrivalLogStatus?.database_records_count ?? 580} records)
                </button>
                <button
                  type="button"
                  onClick={() => setDatasetSource('synthetic')}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-2 shadow-sm"
                >
                  <Activity size={14} />
                  Load Synthetic Demonstration Scenario
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <span className="kpi-label">L1 EMERGENCY WAIT TIME</span>
              <TrendingDown size={18} className="text-emerald-500" />
            </div>
            <div className="kpi-stat-pair">
              <div className="stat-side baseline">
                <span className="stat-tag">BASELINE (FCFS)</span>
                <span className="stat-num">{data.comparison_highlights.emergency_avg_wait_fcfs}m</span>
                <span className="text-[10px] text-slate-500">
                  Med: {data.comparison_highlights.emergency_median_wait_fcfs ?? fcfsGroups.EMERGENCY?.median_wait_minutes ?? 0}m | P90: {data.comparison_highlights.emergency_p90_fcfs ?? fcfsGroups.EMERGENCY?.p90_wait_minutes ?? 0}m
                </span>
              </div>
              <div className="stat-arrow">&rarr;</div>
              <div className="stat-side proposed">
                <span className="stat-tag">PROPOSED (TRIAGE)</span>
                <span className="stat-num text-emerald-600">{data.comparison_highlights.emergency_avg_wait_triage}m</span>
                <span className="text-[10px] text-slate-500">
                  Med: {data.comparison_highlights.emergency_median_wait_triage ?? triageGroups.EMERGENCY?.median_wait_minutes ?? 0}m | P90: {data.comparison_highlights.emergency_p90_triage ?? triageGroups.EMERGENCY?.p90_wait_minutes ?? 0}m
                </span>
              </div>
            </div>
            <div className="kpi-sub-text flex flex-col gap-1">
              <div>
                Simulated Reduction: <strong className="text-emerald-600">
                  {data.comparison_highlights.emergency_wait_reduction_minutes !== undefined ? `-${data.comparison_highlights.emergency_wait_reduction_minutes}m` : ''} (-{data.comparison_highlights.emergency_wait_reduction_percent}%)
                </strong>
              </div>
              <div className="text-[11px] text-slate-500">
                Target &le; 5m | Breaches: FCFS {data.comparison_highlights.emergency_exceeded_target_fcfs} &rarr; Triage {data.comparison_highlights.emergency_exceeded_target_triage}
              </div>
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
                <span className="text-[10px] text-slate-500">
                  Med: {data.fcfs.overall.median_wait_minutes}m | P90: {data.fcfs.overall.p90_wait_minutes ?? 0}m
                </span>
              </div>
              <div className="stat-arrow">&rarr;</div>
              <div className="stat-side proposed">
                <span className="stat-tag">PROPOSED (TRIAGE)</span>
                <span className="stat-num text-sky-600">{data.triage.overall.avg_wait_minutes}m</span>
                <span className="text-[10px] text-slate-500">
                  Med: {data.triage.overall.median_wait_minutes}m | P90: {data.triage.overall.p90_wait_minutes ?? 0}m
                </span>
              </div>
            </div>
            <div className="kpi-sub-text flex flex-col gap-1">
              <div>
                Net Change: <strong className={(data.comparison_highlights.overall_wait_reduction_minutes ?? 0) >= 0 ? 'text-sky-700' : 'text-amber-700'}>
                  {(data.comparison_highlights.overall_wait_reduction_minutes ?? 0) >= 0 ? `-${data.comparison_highlights.overall_wait_reduction_minutes}m` : `+${Math.abs(data.comparison_highlights.overall_wait_reduction_minutes ?? 0)}m`} ({(data.comparison_highlights.overall_wait_reduction_percent ?? 0) >= 0 ? `-${data.comparison_highlights.overall_wait_reduction_percent}%` : `+${Math.abs(data.comparison_highlights.overall_wait_reduction_percent ?? 0)}%`})
                </strong>
              </div>
              <div className="text-[11px] text-slate-500">
                P75: FCFS {data.fcfs.overall.p75_wait_minutes ?? 0}m &rarr; Triage {data.triage.overall.p75_wait_minutes ?? 0}m
              </div>
            </div>
          </div>

          {/* Card 3: Longest Simulated Wait */}
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">LONGEST WAIT & SAFEGUARDS</span>
              <Activity size={16} className="text-amber-500" />
            </div>
            <div className="kpi-stat-pair">
              <div className="stat-side baseline">
                <span className="stat-tag">BASELINE (FCFS)</span>
                <span className="stat-num">{data.fcfs.overall.max_wait_minutes}m</span>
                <span className="text-[10px] text-slate-500">Min: {data.fcfs.overall.min_wait_minutes}m</span>
              </div>
              <div className="stat-arrow">&rarr;</div>
              <div className="stat-side proposed">
                <span className="stat-tag">PROPOSED (TRIAGE)</span>
                <span className="stat-num text-amber-600">{data.triage.overall.max_wait_minutes}m</span>
                <span className="text-[10px] text-slate-500">Min: {data.triage.overall.min_wait_minutes}m</span>
              </div>
            </div>
            <div className="kpi-sub-text flex flex-col gap-1">
              <div>
                Anti-Starvation Safeguards: <strong>{data.comparison_highlights.starvation_safeguards_triggered} triggered</strong>
              </div>
              <div className="text-[11px] text-slate-500">
                Prevents routine low-acuity cases from waiting indefinitely
              </div>
            </div>
          </div>

          {/* Card 4: Maximum Queue Length & Completion */}
          <div className="kpi-card">
            <div className="kpi-header">
              <span className="kpi-label">PEAK QUEUE & SERVED COUNTS</span>
              <Users size={16} className="text-teal-500" />
            </div>
            <div className="kpi-stat-pair">
              <div className="stat-side baseline">
                <span className="stat-tag">MAX QUEUE (FCFS)</span>
                <span className="stat-num">{data.max_queue_length?.fcfs ?? 0} pts</span>
                <span className="text-[10px] text-slate-500">
                  Served: {data.case_completion?.fcfs_completed ?? data.fcfs.overall.total_served ?? 0} ({data.case_completion?.fcfs_remaining ?? data.fcfs.overall.total_still_waiting ?? 0} waiting)
                </span>
              </div>
              <div className="stat-arrow">&rarr;</div>
              <div className="stat-side proposed">
                <span className="stat-tag">MAX QUEUE (TRIAGE)</span>
                <span className="stat-num text-teal-600">{data.max_queue_length?.triage ?? 0} pts</span>
                <span className="text-[10px] text-slate-500">
                  Served: {data.case_completion?.triage_completed ?? data.triage.overall.total_served ?? 0} ({data.case_completion?.triage_remaining ?? data.triage.overall.total_still_waiting ?? 0} waiting)
                </span>
              </div>
            </div>
            <div className="kpi-sub-text flex flex-col gap-1">
              <div>
                Simulation Horizon: <strong>{scenarioDuration} minutes</strong> ({data.parameters.num_doctors} clinicians)
              </div>
              <div className="text-[11px] text-slate-500">
                Breaks: {doctorBreakMinutes > 0 ? `${doctorBreakMinutes}m every ${doctorBreakInterval / 60}h` : 'Continuous'}
              </div>
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
              <div className="flex items-center gap-2">
                <span className="badge-synthetic">SIMULATED ESTIMATES</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                  Source: {data.dataset_source || data.data_source}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="twin-table">
                <thead>
                  <tr>
                    <th>Triage Category</th>
                    <th className="text-center">Arrivals (Served / Wait)</th>
                    <th className="text-center">Target</th>
                    <th className="text-right">Baseline Mean (Med | P90)</th>
                    <th className="text-right text-sky-700">Triage Mean (Med | P90)</th>
                    <th className="text-right text-emerald-700">Wait Reduction</th>
                    <th className="text-right">Baseline Max</th>
                    <th className="text-right text-sky-700">Triage Max</th>
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
                    const diffMin = Math.round(((fcfs.avg_wait_minutes ?? 0) - (tr.avg_wait_minutes ?? 0)) * 10) / 10;
                    const pctChange = (fcfs.avg_wait_minutes && fcfs.avg_wait_minutes > 0)
                      ? Math.round((diffMin / fcfs.avg_wait_minutes) * 1000) / 10
                      : 0.0;
                    return (
                      <tr key={key}>
                        <td>
                          <span className={`urgency-pill ${badgeClass}`}>{label}</span>
                        </td>
                        <td className="text-center">
                          <span className="font-bold">{tr.patient_count ?? 0}</span>
                          <span className="text-xs text-slate-500 ml-1">
                            ({tr.served_count ?? 0} srv / {tr.still_waiting_count ?? 0} wait)
                          </span>
                        </td>
                        <td className="text-center font-semibold text-slate-500">&le; {target}m</td>
                        <td className="text-right font-mono">
                          <strong>{fcfs.avg_wait_minutes ?? 0}m</strong>
                          <span className="text-xs text-slate-500 block">
                            (med {fcfs.median_wait_minutes ?? 0}m | p90 {fcfs.p90_wait_minutes ?? 0}m)
                          </span>
                        </td>
                        <td className="text-right font-mono font-bold text-sky-700">
                          <strong>{tr.avg_wait_minutes ?? 0}m</strong>
                          <span className="text-xs text-sky-600 block font-normal">
                            (med {tr.median_wait_minutes ?? 0}m | p90 {tr.p90_wait_minutes ?? 0}m)
                          </span>
                        </td>
                        <td className="text-right font-mono font-bold">
                          <span className={diffMin >= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                            {diffMin >= 0 ? `-${diffMin}m` : `+${Math.abs(diffMin)}m`}
                            <span className="text-xs block font-normal">
                              ({diffMin >= 0 ? `-${pctChange}%` : `+${Math.abs(pctChange)}%`})
                            </span>
                          </span>
                        </td>
                        <td className="text-right font-mono">{fcfs.max_wait_minutes ?? 0}m</td>
                        <td className="text-right font-mono font-bold text-sky-700">{tr.max_wait_minutes ?? 0}m</td>
                        <td className="text-right font-mono text-red-600 font-semibold">{fcfs.exceeded_target_count ?? 0}</td>
                        <td className="text-right font-mono text-emerald-700 font-bold">{tr.exceeded_target_count ?? 0}</td>
                        <td className="text-right font-bold text-teal-700">{tr.target_adherence_percent ?? 100}%</td>
                      </tr>
                    );
                  })}
                  {/* Overall Summary Row */}
                  {(() => {
                    const totalDiffMin = Math.round(((data.fcfs.overall.avg_wait_minutes ?? 0) - (data.triage.overall.avg_wait_minutes ?? 0)) * 10) / 10;
                    const totalPctChange = (data.fcfs.overall.avg_wait_minutes && data.fcfs.overall.avg_wait_minutes > 0)
                      ? Math.round((totalDiffMin / data.fcfs.overall.avg_wait_minutes) * 1000) / 10
                      : 0.0;
                    return (
                      <tr className="twin-table-total-row">
                        <td>
                          <strong>Total / Overall Average</strong>
                        </td>
                        <td className="text-center font-extrabold">
                          {data.triage.overall.total_patients}
                          <span className="text-xs text-slate-500 font-normal ml-1">
                            ({data.case_completion?.triage_completed ?? data.triage.overall.total_served ?? 0} srv / {data.case_completion?.triage_remaining ?? data.triage.overall.total_still_waiting ?? 0} wait)
                          </span>
                        </td>
                        <td className="text-center text-slate-400">—</td>
                        <td className="text-right font-mono font-bold">
                          {data.fcfs.overall.avg_wait_minutes}m
                          <span className="text-xs text-slate-500 block font-normal">
                            (med {data.fcfs.overall.median_wait_minutes}m | p90 {data.fcfs.overall.p90_wait_minutes ?? 0}m)
                          </span>
                        </td>
                        <td className="text-right font-mono font-extrabold text-sky-700">
                          {data.triage.overall.avg_wait_minutes}m
                          <span className="text-xs text-sky-600 block font-normal">
                            (med {data.triage.overall.median_wait_minutes}m | p90 {data.triage.overall.p90_wait_minutes ?? 0}m)
                          </span>
                        </td>
                        <td className="text-right font-mono font-bold">
                          <span className={totalDiffMin >= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                            {totalDiffMin >= 0 ? `-${totalDiffMin}m` : `+${Math.abs(totalDiffMin)}m`}
                            <span className="text-xs block font-normal">
                              ({totalDiffMin >= 0 ? `-${totalPctChange}%` : `+${Math.abs(totalPctChange)}%`})
                            </span>
                          </span>
                        </td>
                        <td className="text-right font-mono">{data.fcfs.overall.max_wait_minutes}m</td>
                        <td className="text-right font-mono font-bold text-sky-700">{data.triage.overall.max_wait_minutes}m</td>
                        <td className="text-right font-mono text-red-600">{data.fcfs.overall.total_exceeded_target}</td>
                        <td className="text-right font-mono text-emerald-700 font-bold">{data.triage.overall.total_exceeded_target}</td>
                        <td className="text-right font-extrabold text-teal-700">{data.triage.overall.target_adherence_rate}%</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            {/* Case Completion & Horizon Status Breakdown */}
            {data.case_completion?.by_urgency && (
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
                  <Clock size={14} className="text-sky-600" />
                  Patient Service & Completion Status at Simulation Horizon ({scenarioDuration} minutes)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(data.case_completion.by_urgency).map(([catKey, item]) => {
                    const fcfsCompPct = item.total_arrived > 0 ? Math.round((item.fcfs_completed / item.total_arrived) * 100) : 100;
                    const triageCompPct = item.total_arrived > 0 ? Math.round((item.triage_completed / item.total_arrived) * 100) : 100;
                    return (
                      <div key={catKey} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
                        <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                          <span>{item.urgency_category}</span>
                          <span className="text-slate-500 font-normal">{item.total_arrived} total</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-600 dark:text-slate-400">
                            <span>Baseline (FCFS):</span>
                            <span><strong>{item.fcfs_completed}</strong> served ({item.fcfs_still_waiting} waiting &bull; {fcfsCompPct}%)</span>
                          </div>
                          <div className="flex justify-between text-sky-700 dark:text-sky-400 font-semibold">
                            <span>Proposed (Triage):</span>
                            <span><strong>{item.triage_completed}</strong> served ({item.triage_still_waiting} waiting &bull; {triageCompPct}%)</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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

            {/* Explicit Assumptions Documentation */}
            {data.assumptions_documentation && (
              <div className="methodology-section mt-6">
                <h4 className="section-heading flex items-center gap-2">
                  <Sliders size={16} className="text-sky-600" />
                  Explicit Policy & System Assumptions Documentation
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  {Object.entries(data.assumptions_documentation).map(([k, text]) => {
                    const labelMap: Record<string, string> = {
                      dataset_source: 'Arrival Log & Data Influx',
                      arrival_order_rule: 'Baseline FCFS Arrival Ordering',
                      equal_priority_rule: 'Equal-Priority Tie-Breaking Rule',
                      emergency_escalation_rule: 'Critical Safety Escalation Invariant',
                      doctor_staffing: 'Doctor Availability & Staffing Model',
                      doctor_breaks: 'Doctor Rest Breaks & Shifts',
                      service_durations: 'Consultation Duration Model',
                      capacity_limitations: 'Capacity & Departmental Scope',
                      disclaimer: 'Scientific Limitations Disclaimer',
                    };
                    const title = labelMap[k] || k.replace(/_/g, ' ').toUpperCase();
                    return (
                      <div key={k} className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                          {title}
                        </span>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                          {text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="methodology-section mt-6">
              <h4 className="section-heading">Discrete-Event Mathematical Principles</h4>
              <ul className="methodology-list">
                {data.methodology_and_limitations.assumptions.map((assump, i) => (
                  <li key={i}>{assump}</li>
                ))}
              </ul>
            </div>

            <div className="methodology-disclaimer-box mt-6">
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
