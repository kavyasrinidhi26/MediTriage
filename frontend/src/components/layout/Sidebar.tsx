import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  UserPlus,
  Users,
  History,
  Activity,
  Building2,
  X,
  Stethoscope,
  Timer,
  BookOpen,
  BarChart3,
  Settings,
  Ambulance,
  Brain,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onRegisterClick: () => void;
  onEmergencyClick?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  onRegisterClick,
  onEmergencyClick,
}) => {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/emergency-intake', label: 'Emergency Intake', icon: Ambulance, isEmergency: true },
    { to: '/new-patient', label: 'New Patient', icon: UserPlus },
    { to: '/queue', label: 'Live Queue', icon: Users },
    { to: '/history', label: 'Assessment History', icon: History },
    { to: '/evaluation', label: 'Model Evaluation', icon: Brain },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/simulation', label: 'Digital Twin Simulator', icon: Timer },
    { to: '/guidelines', label: 'Guidelines', icon: BookOpen },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}

      <aside className={`app-sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        {/* Sidebar Brand Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <Activity size={24} />
            </div>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-title">MediTriage AI</span>
              <span className="sidebar-brand-sub">OPD Assistant</span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Hospital Facility Tag */}
        <div className="sidebar-facility-tag">
          <Building2 size={15} className="facility-icon" />
          <div className="facility-details">
            <span className="facility-name">District Civil Hospital</span>
            <span className="facility-shift">OPD Triage Counter • Shift A</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="sidebar-nav">
          <div className="sidebar-nav-label">CLINICAL SECTIONS</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''} ${item.isEmergency ? 'nav-emergency-item' : ''}`
                }
              >
                <Icon size={19} className={`nav-icon ${item.isEmergency ? 'emergency-nav-icon' : ''}`} />
                <span className="nav-label">{item.label}</span>
                {item.isEmergency && <span className="nav-emergency-badge">L1</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Quick Action Button in Sidebar */}
        <div className="sidebar-quick-action">
          {onEmergencyClick && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEmergencyClick();
              }}
              className="sidebar-emergency-btn mb-2"
              id="sidebar-btn-emergency-intake"
            >
              <Ambulance size={16} />
              <span>Emergency Accident</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              onRegisterClick();
            }}
            className="sidebar-register-btn"
          >
            <UserPlus size={16} />
            <span>Intake New Patient</span>
          </button>
        </div>

        {/* Ethical System Notice Footer */}
        <div className="sidebar-footer">
          <div className="system-pill">
            <Stethoscope size={13} />
            <span>Decision Support System</span>
          </div>
          <p className="system-disclaimer">
            Assistive prototype for hospital rush stratification. Physician authority is supreme.
          </p>
        </div>
      </aside>
    </>
  );
};
