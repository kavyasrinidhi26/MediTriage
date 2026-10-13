import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Users, ShieldAlert, BookOpen, Building2 } from 'lucide-react';

interface HeaderProps {
  hospitalName?: string;
  isBackendHealthy?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  hospitalName = 'District Civil Hospital OPD',
  isBackendHealthy = true,
}) => {
  const location = useLocation();

  const navLinks = [
    { to: '/', label: 'Triage Intake', icon: Activity },
    { to: '/queue', label: 'Live OPD Queue', icon: Users },
    { to: '/dashboard', label: 'Hospital Overview', icon: ShieldAlert },
    { to: '/guidelines', label: 'Clinical Protocols', icon: BookOpen },
  ];

  return (
    <header className="hospital-header">
      <div className="header-container">
        <div className="brand-section">
          <div className="brand-logo">
            <Activity className="brand-icon" size={28} />
          </div>
          <div>
            <div className="brand-title-wrap">
              <span className="brand-title">MediTriage AI</span>
              <span className="prototype-tag">OPD PROTOTYPE</span>
            </div>
            <div className="hospital-subtext">
              <Building2 size={13} style={{ display: 'inline', marginRight: 4 }} />
              {hospitalName}
            </div>
          </div>
        </div>

        <nav className="nav-menu">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="header-status">
          <span
            className={`status-pill ${
              isBackendHealthy ? 'status-connected' : 'status-disconnected'
            }`}
          >
            <span className="status-dot"></span>
            {isBackendHealthy ? 'System Active' : 'Offline / Reconnecting'}
          </span>
        </div>
      </div>
    </header>
  );
};
