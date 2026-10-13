import React from 'react';
import { Search, RefreshCw } from 'lucide-react';

interface QueueFiltersProps {
  search: string;
  onSearchChange: (val: string) => void;
  category: string;
  onCategoryChange: (val: string) => void;
  department: string;
  onDepartmentChange: (val: string) => void;
  departments: string[];
  status: string;
  onStatusChange: (val: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export const QueueFilters: React.FC<QueueFiltersProps> = ({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  department,
  onDepartmentChange,
  departments,
  status,
  onStatusChange,
  onRefresh,
  isLoading = false,
}) => {
  return (
    <div className="filters-card">
      <div className="search-input-wrap">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          placeholder="Search by patient name, UHID, or token number..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="search-input"
        />
      </div>

      <div className="filter-selects-row">
        <div className="filter-group">
          <label htmlFor="cat-filter">Triage Category:</label>
          <select
            id="cat-filter"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="filter-select"
          >
            <option value="">All Categories</option>
            <option value="EMERGENCY">Red — Emergency</option>
            <option value="PRIORITY">Yellow — Priority</option>
            <option value="ROUTINE">Green — Routine</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="dept-filter">Specialty Department:</label>
          <select
            id="dept-filter"
            value={department}
            onChange={(e) => onDepartmentChange(e.target.value)}
            className="filter-select"
          >
            <option value="">All Departments</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="status-filter">Status:</label>
          <select
            id="status-filter"
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="filter-select"
          >
            <option value="">All Active</option>
            <option value="WAITING">Waiting</option>
            <option value="WITH_DOCTOR">With Doctor</option>
            <option value="NEEDS_HUMAN_REVIEW">Needs Human Review</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="btn-refresh"
          title="Refresh Queue"
        >
          <RefreshCw size={16} className={isLoading ? 'spin-icon' : ''} />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
};
