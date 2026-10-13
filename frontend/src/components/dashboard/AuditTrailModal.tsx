import React, { useState, useEffect } from 'react';
import type { SavedPatientQueueItem, QueueAuditItem } from '../../types/triage';
import { fetchPatientAuditLogs } from '../../services/api';
import { X, History, Clock } from 'lucide-react';

interface AuditTrailModalProps {
  patient: SavedPatientQueueItem | null;
  onClose: () => void;
}

export const AuditTrailModal: React.FC<AuditTrailModalProps> = ({ patient, onClose }) => {
  const [logs, setLogs] = useState<QueueAuditItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!patient) return;
    let isMounted = true;
    setIsLoading(true);

    fetchPatientAuditLogs(patient.patient_id)
      .then((data) => {
        if (isMounted) setLogs(data);
      })
      .catch((err) => {
        console.error('Audit load error:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [patient]);

  if (!patient) return null;

  const getActionBadgeColor = (action: string) => {
    if (action.includes('DETERIORATION')) return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '#ef4444' };
    if (action.includes('REVIEW')) return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '#10b981' };
    if (action.includes('REASSESS')) return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '#f59e0b' };
    return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '#3b82f6' };
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        {/* Header */}
        <div className="modal-header modal-header-priority" style={{ background: '#1e293b', color: '#fff' }}>
          <div className="modal-title-section">
            <div className="modal-token-row">
              <span className="modal-token-badge">{patient.token_number}</span>
              <span className="modal-uhid-badge">{patient.patient_id}</span>
              <span className="badge-status-chip">AUDIT TRAIL</span>
            </div>
            <h2 className="modal-patient-name" style={{ color: '#fff' }}>
              Clinical Status & Review Audit History
            </h2>
            <div className="modal-patient-sub" style={{ color: 'rgba(255,255,255,0.8)' }}>
              {patient.patient_name || patient.patient_id} • Immutable status event logs
            </div>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body-scrollable">
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              <Clock size={24} className="spin-icon" style={{ marginBottom: 8 }} />
              <div>Loading audit trail history...</div>
            </div>
          ) : logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              <History size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>No status update history recorded yet for this patient.</div>
            </div>
          ) : (
            <div className="audit-timeline" style={{ position: 'relative', paddingLeft: 20 }}>
              <div style={{ position: 'absolute', top: 10, bottom: 10, left: 7, width: 2, background: 'var(--border-color)' }} />
              {logs.map((log) => {
                const badge = getActionBadgeColor(log.action_type);
                return (
                  <div key={log.id} style={{ position: 'relative', marginBottom: 20 }}>
                    <div style={{ position: 'absolute', left: -19, top: 4, width: 12, height: 12, borderRadius: '50%', background: badge.color, border: '2px solid var(--bg-card)' }} />
                    <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                          {log.action_type}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                        {log.performed_by}
                      </div>
                      {log.previous_status && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                          Status: <span style={{ textDecoration: 'line-through' }}>{log.previous_status}</span> ➔ <strong>{log.new_status}</strong>
                        </div>
                      )}
                      {log.notes && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '6px 10px', borderRadius: 4, marginTop: 4 }}>
                          {log.notes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
            <button type="button" onClick={onClose} className="btn-clear-filters" style={{ padding: '8px 18px', fontSize: 13 }}>
              Close Audit Trail
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
