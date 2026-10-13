import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, UserPlus, Calendar, RefreshCw, ShieldAlert, Lock, UserCheck } from 'lucide-react';
import { ShimmerButton } from '../ui/ShimmerButton';
import { LanguageSelector } from '../common/LanguageSelector';
import { useAuth } from '../../context/AuthContext';
import { StaffAuthModal } from '../auth/StaffAuthModal';

interface TopNavbarProps {
  onToggleSidebar: () => void;
  onRegisterClick: () => void;
  onEmergencyClick?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  isBackendHealthy?: boolean;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  onToggleSidebar,
  onRegisterClick,
  onEmergencyClick: _onEmergencyClick,
  onRefresh,
  isRefreshing = false,
  isBackendHealthy = true,
}) => {
  const location = useLocation();
  const { currentUser, isFirebaseConfigured } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Format current date once on mount
  const [currentDateFormatted] = useState(() => {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date());
  });

  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/':
        return { title: 'Hospital Triage Dashboard', subtitle: 'OPD Acuity Stratification & Live Hall Queue' };
      case '/emergency-intake':
      case '/emergency':
        return { title: 'Emergency Accident Intake', subtitle: 'Rapid Trauma Resuscitation & Clinical Escalation' };
      case '/new-patient':
        return { title: 'Nurse Patient Intake', subtitle: 'Rapid Intake & Vital Sign Verification' };
      case '/queue':
        return { title: 'Live Patient Queue', subtitle: 'Real-time Acuity & Room Consultation' };
      case '/history':
        return { title: 'Assessment History', subtitle: 'Transactional Audit Trail & Clinical Log' };
      case '/guidelines':
        return { title: 'Triage Guidelines', subtitle: 'Clinical Protocols & Decision Support Rules' };
      case '/analytics':
      case '/evaluation':
        return { title: 'Model Analytics & Evaluation', subtitle: 'Authentic Pipeline Metrics & Emergency Recall' };
      case '/simulation':
        return { title: 'Hospital Digital Twin', subtitle: 'Queue Simulator & Multi-Server Policy Twin' };
      case '/settings':
        return { title: 'System Settings', subtitle: 'Counter Preferences & Safety Invariants' };
      default:
        return { title: 'MediTriage AI', subtitle: 'Public OPD Acuity Dashboard' };
    }
  };

  const pageInfo = getPageTitle(location.pathname);

  return (
    <header className="top-navbar">
      <div className="top-navbar-left">
        {/* Mobile / Tablet Menu Toggle */}
        <button
          type="button"
          onClick={onToggleSidebar}
          className="top-navbar-menu-btn"
          aria-label="Toggle navigation menu"
        >
          <Menu size={22} />
        </button>

        <div className="top-navbar-titles">
          <span className="project-heading">{pageInfo.title}</span>
          <span className="project-subheading">{pageInfo.subtitle}</span>
        </div>
      </div>

      <div className="top-navbar-center">
        {/* Current Date Display */}
        <div className="current-date-chip">
          <Calendar size={14} className="date-icon" />
          <span>{currentDateFormatted}</span>
        </div>

        {/* Clearly Labeled Demo Environment */}
        <div
          className="demo-env-badge"
          title="Clinical Decision Support Prototype — Synthetic Outpatient Demonstration Data"
        >
          <ShieldAlert size={14} className="demo-env-icon" />
          <span className="demo-env-text">DEMO ENVIRONMENT</span>
        </div>
      </div>

      <div className="top-navbar-right">
        {/* Language Selector (Telugu / English) */}
        <LanguageSelector variant="navbar" />

        {/* Backend Connectivity Status */}
        <div
          className={`system-status-indicator ${
            isBackendHealthy ? 'status-online' : 'status-demo'
          }`}
          title={isBackendHealthy ? 'FastAPI Backend Online' : 'Local Synthetic Mode Active'}
        >
          <span className="status-ping" />
          <span className="status-label">
            {isBackendHealthy ? 'API Active' : 'Demo Local'}
          </span>
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="top-navbar-refresh-btn"
            title="Refresh patient queue"
            aria-label="Refresh data"
          >
            <RefreshCw size={15} className={isRefreshing ? 'spin-icon' : ''} />
          </button>
        )}

        {/* Staff Authentication Status & Sign In (Prominent) */}
        <button
          type="button"
          onClick={() => setIsAuthModalOpen(true)}
          className={`top-navbar-staff-btn ${currentUser ? 'staff-btn-active' : ''}`}
          id="btn-staff-auth"
          title={
            currentUser
              ? `Signed in as ${currentUser.email}`
              : isFirebaseConfigured
              ? 'Clinical Staff Sign In'
              : 'Firebase Authentication Setup Pending'
          }
          aria-label={currentUser ? `Signed in as ${currentUser.email}` : 'Clinical Staff Login'}
        >
          {currentUser ? (
            <>
              <UserCheck size={18} color="var(--teal-700)" />
              <span className="staff-user-label">
                {currentUser.email?.split('@')[0]}
              </span>
            </>
          ) : (
            <>
              <Lock size={17} />
              <span className="staff-login-label">Staff Login</span>
              {!isFirebaseConfigured && (
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#F59E0B',
                    marginLeft: '2px',
                    boxShadow: '0 0 4px #F59E0B',
                  }}
                  title="Firebase Configuration Required"
                />
              )}
            </>
          )}
        </button>

        {/* Prominent Button to Register a New Patient */}
        <ShimmerButton
          variant="primary"
          size="md"
          icon={<UserPlus size={16} />}
          onClick={onRegisterClick}
          id="btn-register-new-patient"
        >
          Register New Patient
        </ShimmerButton>
      </div>

      {/* Staff Authentication Modal */}
      <StaffAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </header>
  );
};
