import React from 'react';
import { Languages } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface LanguageSelectorProps {
  className?: string;
  variant?: 'navbar' | 'compact' | 'pill';
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ variant = 'navbar' }) => {
  const { language, setLanguage, t } = useLanguage();

  if (variant === 'pill') {
    return (
      <div
        className="language-selector-pill"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: '#f1f5f9',
          padding: '2px 4px',
          borderRadius: 20,
          border: '1px solid #cbd5e1',
        }}
      >
        <button
          type="button"
          onClick={() => setLanguage('en')}
          style={{
            padding: '3px 10px',
            borderRadius: 16,
            fontSize: '0.78rem',
            fontWeight: language === 'en' ? 700 : 500,
            background: language === 'en' ? '#0f172a' : 'transparent',
            color: language === 'en' ? '#ffffff' : '#64748b',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => setLanguage('te')}
          style={{
            padding: '3px 10px',
            borderRadius: 16,
            fontSize: '0.78rem',
            fontWeight: language === 'te' ? 700 : 500,
            background: language === 'te' ? '#0284c7' : 'transparent',
            color: language === 'te' ? '#ffffff' : '#64748b',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          తెలుగు (Telugu)
        </button>
      </div>
    );
  }

  return (
    <div
      className="language-selector-wrapper"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 6,
        background: 'rgba(255, 255, 255, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
      }}
    >
      <Languages size={14} color="#94a3b8" />
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as 'en' | 'te')}
        title={t('nav.lang_select')}
        aria-label="Application Language"
        style={{
          background: 'transparent',
          color: '#f8fafc',
          border: 'none',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="en" style={{ color: '#0f172a', background: '#fff' }}>
          English
        </option>
        <option value="te" style={{ color: '#0f172a', background: '#fff' }}>
          తెలుగు (Telugu)
        </option>
      </select>
    </div>
  );
};
