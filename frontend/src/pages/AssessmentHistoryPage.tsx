import React, { useState } from 'react';
import { History, Sparkles, Search, Filter, ShieldCheck, UserCheck } from 'lucide-react';
import { SYNTHETIC_AUDIT_HISTORY } from '../services/mockData';
import type { SyntheticAuditRecord, TriageCategory } from '../types/triage';

export const AssessmentHistoryPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  const records: SyntheticAuditRecord[] = SYNTHETIC_AUDIT_HISTORY.filter((item) => {
    const matchesSearch =
      search.trim() === '' ||
      item.patient_name.toLowerCase().includes(search.toLowerCase()) ||
      item.uhid.toLowerCase().includes(search.toLowerCase()) ||
      item.complaint.toLowerCase().includes(search.toLowerCase()) ||
      item.reviewed_by.toLowerCase().includes(search.toLowerCase());

    const matchesLevel = levelFilter === '' || item.final_level === levelFilter;

    return matchesSearch && matchesLevel;
  });

  const renderBadge = (cat: TriageCategory) => {
    switch (cat) {
      case 'EMERGENCY':
        return <span className="triage-level-chip chip-emergency">RED • Level 1</span>;
      case 'PRIORITY':
        return <span className="triage-level-chip chip-priority">YELLOW • Level 2</span>;
      case 'ROUTINE':
        return <span className="triage-level-chip chip-routine">GREEN • Level 3</span>;
      default:
        return <span>{cat}</span>;
    }
  };

  return (
    <div className="inner-page-container">
      {/* Header */}
      <div className="inner-page-header">
        <div className="header-text-group">
          <div className="title-with-icon">
            <div className="page-icon-badge">
              <History size={22} />
            </div>
            <div>
              <h1 className="inner-page-title">Triage Assessment Audit History</h1>
              <p className="inner-page-subtitle">
                Historical triage review logs and clinician overrides for outpatient queue tracking.
              </p>
            </div>
          </div>
        </div>

        <div className="header-notice-pill">
          <Sparkles size={14} />
          <span>Synthetic Historical Simulation</span>
        </div>
      </div>

      {/* Disclaimers & Info */}
      <div className="history-info-banner">
        <ShieldCheck size={18} className="info-icon" />
        <p>
          <strong>Clinical Governance Log:</strong> Every triage decision is recorded with physiological rationale. Senior clinicians can review and adjust urgency levels at any point during OPD rush. Records below are synthetic training benchmarks.
        </p>
      </div>

      {/* Filters Bar */}
      <div className="history-filters-bar">
        <div className="filter-search-box">
          <Search size={16} className="filter-search-icon" />
          <input
            type="text"
            placeholder="Search by Patient Name, UHID, Doctor or Complaint..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="filter-search-input"
          />
        </div>

        <div className="filter-dropdown-wrapper">
          <Filter size={14} className="filter-icon" />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="filter-select-element"
          >
            <option value="">All Triage Levels</option>
            <option value="EMERGENCY">Emergency (Red)</option>
            <option value="PRIORITY">Priority (Yellow)</option>
            <option value="ROUTINE">Routine (Green)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="table-responsive-container">
        <table className="patient-queue-table" aria-label="Assessment History Table">
          <thead>
            <tr>
              <th scope="col" style={{ width: '12%' }}>Audit ID</th>
              <th scope="col" style={{ width: '16%' }}>Patient & UHID</th>
              <th scope="col" style={{ width: '12%' }}>Timestamp</th>
              <th scope="col" style={{ width: '22%' }}>Complaint & Vitals</th>
              <th scope="col" style={{ width: '14%' }}>Acuity Outcome</th>
              <th scope="col" style={{ width: '24%' }}>Reviewer & Decision Basis</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr key={rec.audit_id}>
                <td className="cell-patient-id">
                  <span className="token-number-bold">{rec.audit_id}</span>
                  <span className="synthetic-badge-tag">SYNTHETIC</span>
                </td>

                <td>
                  <div className="patient-name-bold">{rec.patient_name}</div>
                  <div className="uhid-text">{rec.uhid} ({rec.age}y • {rec.gender})</div>
                </td>

                <td className="cell-arrival">
                  <span className="arrival-time-text">{rec.timestamp}</span>
                </td>

                <td>
                  <div className="complaint-snippet"><strong>Complaint:</strong> {rec.complaint}</div>
                  <div className="vitals-snippet-tag">{rec.vitals_summary}</div>
                </td>

                <td>
                  <div className="acuity-outcome-box">
                    <div>{renderBadge(rec.final_level)}</div>
                    {rec.initial_level !== rec.final_level && (
                      <span className="overridden-tag">Adjusted from {rec.initial_level}</span>
                    )}
                  </div>
                </td>

                <td>
                  <div className="reviewer-name-row">
                    <UserCheck size={13} />
                    <span>{rec.reviewed_by}</span>
                  </div>
                  <p className="decision-basis-text">{rec.decision_basis}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
