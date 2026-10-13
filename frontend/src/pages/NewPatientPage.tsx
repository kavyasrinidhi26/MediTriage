import React from 'react';
import { Link } from 'react-router-dom';
import { NurseIntakeForm } from '../components/intake/NurseIntakeForm';
import { UserPlus, Sparkles, Ambulance, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface NewPatientPageProps {
  onEmergencyClick?: () => void;
}

export const NewPatientPage: React.FC<NewPatientPageProps> = () => {
  const { t } = useLanguage();

  return (
    <div className="inner-page-container">
      {/* Prominent Emergency Access Banner on Registration Page (Feature 1) */}
      <div className="registration-emergency-bypass-banner">
        <div className="bypass-banner-left">
          <div className="bypass-icon-badge">
            <Ambulance size={22} className="text-white" />
            <span className="emergency-beacon-dot" aria-hidden="true" />
          </div>
          <div className="bypass-text">
            <div className="bypass-tag">{t('intake.emergency_banner_tag')}</div>
            <h3 className="bypass-heading">{t('intake.emergency_banner_heading')}</h3>
            <p className="bypass-sub">
              {t('intake.emergency_banner_sub')}
            </p>
          </div>
        </div>
        <div className="bypass-banner-right">
          <Link
            to="/emergency-intake"
            className="emergency-bypass-action-btn"
            id="btn-registration-emergency-intake"
            title="Open Emergency Accident Intake Screen"
          >
            <Ambulance size={18} />
            <span>{t('intake.emergency_banner_btn')}</span>
          </Link>
        </div>
      </div>

      {/* Routine Registration Page Header */}
      <div className="inner-page-header">
        <div className="header-text-group">
          <div className="title-with-icon">
            <div className="page-icon-badge">
              <UserPlus size={22} />
            </div>
            <div>
              <h1 className="inner-page-title">{t('intake.title')}</h1>
              <p className="inner-page-subtitle">
                {t('intake.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="header-notice-pill">
          <Sparkles size={14} />
          <span>{t('intake.demo_mode')}</span>
        </div>
      </div>

      {/* Clinical Guidance Strip */}
      <div className="clinical-guidance-strip">
        <ShieldCheck size={18} className="guidance-icon" />
        <div className="guidance-text">
          <strong>Clinical Verification Protocols:</strong> Pulse entered as <strong>0 bpm</strong> triggers an immediate pulselessness / cardiac arrest safety workflow. Temperature at <strong>96.0°F (35.6°C)</strong> flags for hypothermia verification and is never assumed to be a typo. Missing measurements remain unrecorded and are <strong>never converted into default normal values</strong>.
        </div>
      </div>

      {/* Main Routine Intake Form */}
      <div className="intake-form-wrapper">
        <NurseIntakeForm />
      </div>
    </div>
  );
};
