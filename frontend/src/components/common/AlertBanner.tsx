import React from 'react';
import { AlertTriangle, Info, CheckCircle, AlertOctagon } from 'lucide-react';

interface AlertBannerProps {
  type?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  message: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  type = 'info',
  title,
  message,
}) => {
  const iconMap = {
    info: <Info size={18} className="alert-icon-svg" />,
    warning: <AlertTriangle size={18} className="alert-icon-svg" />,
    danger: <AlertOctagon size={18} className="alert-icon-svg" />,
    success: <CheckCircle size={18} className="alert-icon-svg" />,
  };

  return (
    <div className={`alert-banner alert-${type}`}>
      <div className="alert-icon-wrap">{iconMap[type]}</div>
      <div className="alert-content">
        {title && <div className="alert-title">{title}</div>}
        <div className="alert-message">{message}</div>
      </div>
    </div>
  );
};
