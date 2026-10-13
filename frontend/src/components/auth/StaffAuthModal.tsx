import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Lock,
  UserCheck,
  LogOut,
  AlertTriangle,
  ShieldAlert,
  Loader2,
  Ambulance,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface StaffAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StaffAuthModal: React.FC<StaffAuthModalProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    isFirebaseConfigured,
    missingConfigKeys,
    signInWithEmail,
    signOutStaff,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both staff email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      await signInWithEmail(email, password);
      onClose();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
        setErrorMessage('Invalid staff email or password. Please verify your credentials.');
      } else if (code === 'auth/too-many-requests') {
        setErrorMessage('Access temporarily blocked due to repeated failed attempts. Please try again later.');
      } else {
        setErrorMessage(err?.message || 'Failed to authenticate with Firebase.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOutStaff();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to sign out.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        className="modal-backdrop"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-auth-modal-title"
        style={{ zIndex: 1200 }}
      >
        <motion.div
          className="modal-card staff-auth-modal-card"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 14 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          style={{ maxWidth: '480px', width: '92vw' }}
        >
          {/* Modal Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--navy-200)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--teal-50)',
                  color: 'var(--teal-700)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Lock size={18} />
              </div>
              <div>
                <h3
                  id="staff-auth-modal-title"
                  style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--navy-900)' }}
                >
                  Clinical Staff Authentication
                </h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--navy-500)' }}>
                  District Civil Hospital OPD Security
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="modal-close-btn"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>

          {/* Modal Body */}
          <div style={{ padding: '20px' }}>
            {/* Case 1: Firebase is NOT configured */}
            {!isFirebaseConfigured ? (
              <div>
                <div
                  style={{
                    backgroundColor: '#FEF3C7',
                    border: '1px solid #F59E0B',
                    borderRadius: '8px',
                    padding: '14px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <ShieldAlert size={20} color="#B45309" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#92400E', fontWeight: 700 }}>
                        Firebase Configuration Required
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#78350F', lineHeight: 1.45 }}>
                        Firebase Authentication is not yet configured. To protect clinical duty operations with real
                        credentials, add your project settings to <code>frontend/.env</code>.
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--navy-50)',
                    border: '1px solid var(--navy-200)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    marginBottom: '16px',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-800)', display: 'block', marginBottom: '6px' }}>
                    Missing Frontend Environment Variables:
                  </span>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.75rem', color: 'var(--navy-600)', fontFamily: 'monospace' }}>
                    {missingConfigKeys.map((k) => (
                      <li key={k} style={{ marginBottom: '3px' }}>
                        {k}
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  style={{
                    border: '1px solid var(--teal-200)',
                    backgroundColor: 'var(--teal-50)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Ambulance size={16} color="var(--teal-700)" />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--teal-900)' }}>
                      Emergency Resuscitation Safeguard
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--teal-800)', lineHeight: 1.4 }}>
                    Emergency accident intake and rapid resuscitation workflows remain accessible and are never
                    delayed by authentication setup.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    className="cult-shimmer-btn cult-shimmer-size-sm"
                    style={{ padding: '8px 18px' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : currentUser ? (
              /* Case 2: User is currently signed in */
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px',
                    backgroundColor: 'var(--teal-50)',
                    border: '1px solid var(--teal-200)',
                    borderRadius: '8px',
                    marginBottom: '18px',
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--teal-600)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UserCheck size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--teal-700)', fontWeight: 600 }}>
                      Active Duty Staff
                    </span>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.9rem',
                        fontWeight: 700,
                        color: 'var(--navy-900)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {currentUser.email}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--navy-500)', fontFamily: 'monospace' }}>
                      UID: {currentUser.uid.slice(0, 16)}...
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    className="cult-shimmer-btn cult-shimmer-size-sm"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={isLoading}
                    className="cult-shimmer-btn cult-shimmer-danger cult-shimmer-size-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {isLoading ? <Loader2 size={14} className="spin-icon" /> : <LogOut size={14} />}
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Case 3: Firebase IS configured, show real sign-in form */
              <form onSubmit={handleSignIn}>
                {errorMessage && (
                  <div
                    style={{
                      backgroundColor: '#FEE2E2',
                      border: '1px solid #EF4444',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      marginBottom: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.8rem',
                      color: '#991B1B',
                    }}
                  >
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div style={{ marginBottom: '14px' }}>
                  <label
                    htmlFor="staff-email-input"
                    style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-700)', marginBottom: '4px' }}
                  >
                    Staff Hospital Email
                  </label>
                  <input
                    id="staff-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nurse.duty@civilhospital.gov.in"
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--navy-300)',
                      fontSize: '0.875rem',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label
                    htmlFor="staff-password-input"
                    style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--navy-700)', marginBottom: '4px' }}
                  >
                    Password
                  </label>
                  <input
                    id="staff-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--navy-300)',
                      fontSize: '0.875rem',
                      outline: 'none',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={onClose}
                    className="cult-shimmer-btn cult-shimmer-size-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="cult-shimmer-btn cult-shimmer-primary cult-shimmer-size-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    {isLoading ? <Loader2 size={14} className="spin-icon" /> : <Lock size={14} />}
                    <span>Sign In</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
