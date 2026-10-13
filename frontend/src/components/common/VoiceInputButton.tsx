import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertTriangle, X, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

// Safe interface for Web Speech API SpeechRecognition
interface IWindowWithSpeech extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

interface VoiceInputButtonProps {
  onTranscriptAccepted: (text: string, mode: 'insert' | 'append') => void;
  targetFieldLabel?: string;
  defaultLang?: 'te-IN' | 'en-IN';
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscriptAccepted,
  targetFieldLabel = 'Complaint',
  defaultLang,
}) => {
  const { language, t } = useLanguage();
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [interimText, setInterimText] = useState<string>('');
  const [editableTranscript, setEditableTranscript] = useState<string>('');
  const [selectedSpeechLang, setSelectedSpeechLang] = useState<'te-IN' | 'en-IN'>(() => {
    if (defaultLang) return defaultLang;
    return language === 'te' ? 'te-IN' : 'en-IN';
  });
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);

  // Sync speech language when global language changes unless explicitly overridden
  useEffect(() => {
    if (!defaultLang) {
      setSelectedSpeechLang(language === 'te' ? 'te-IN' : 'en-IN');
    }
  }, [language, defaultLang]);

  // Check browser capability on mount
  useEffect(() => {
    const win = window as unknown as IWindowWithSpeech;
    const SpeechAPI = win.SpeechRecognition || win.webkitSpeechRecognition;
    setIsSupported(Boolean(SpeechAPI));
  }, []);

  const startListening = () => {
    setSpeechError(null);
    setInterimText('');
    setEditableTranscript('');

    const win = window as unknown as IWindowWithSpeech;
    const SpeechAPI = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechAPI) {
      setSpeechError(t('voice.not_supported'));
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = selectedSpeechLang;

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError(null);
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            currentFinal += item[0].transcript;
          } else {
            currentInterim += item[0].transcript;
          }
        }

        setInterimText(currentInterim);
        if (currentFinal) {
          setEditableTranscript((prev) => {
            return prev ? `${prev} ${currentFinal.trim()}` : currentFinal.trim();
          });
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        const errType = event.error;
        if (errType === 'not-allowed') {
          setSpeechError(t('voice.permission_denied'));
        } else if (errType === 'no-speech') {
          setSpeechError(t('voice.no_speech'));
        } else if (errType === 'network') {
          setSpeechError(t('voice.network_error'));
        } else {
          setSpeechError(`${t('voice.error_generic')} (${errType})`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        // If there was any final text recorded, open the review panel
        setEditableTranscript((curr) => {
          if (curr.trim()) {
            setShowReviewModal(true);
          }
          return curr;
        });
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (_err: unknown) {
      setIsListening(false);
      setSpeechError(t('voice.error_generic'));
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  };

  const handleCommit = (mode: 'insert' | 'append') => {
    if (editableTranscript.trim()) {
      onTranscriptAccepted(editableTranscript.trim(), mode);
    }
    setShowReviewModal(false);
    setInterimText('');
    setEditableTranscript('');
  };

  const handleDiscard = () => {
    setShowReviewModal(false);
    setInterimText('');
    setEditableTranscript('');
  };

  return (
    <div className="voice-input-widget-container" style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Language selector for speech */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#475569' }}>
          <span>🎙️</span>
          <select
            value={selectedSpeechLang}
            onChange={(e) => setSelectedSpeechLang(e.target.value as 'te-IN' | 'en-IN')}
            disabled={isListening}
            style={{
              padding: '3px 8px',
              fontSize: '0.78rem',
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: '#fff',
            }}
            title="Speech Recognition Spoken Language"
          >
            <option value="te-IN">{t('voice.lang_telugu')}</option>
            <option value="en-IN">{t('voice.lang_english')}</option>
          </select>
        </div>

        {/* Start / Stop dictation button */}
        {!isListening ? (
          <button
            type="button"
            onClick={startListening}
            disabled={!isSupported}
            className="btn-voice-dictate"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              fontSize: '0.8rem',
              fontWeight: 600,
              background: isSupported ? '#f1f5f9' : '#f8fafc',
              color: isSupported ? '#1e293b' : '#94a3b8',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              cursor: isSupported ? 'pointer' : 'not-allowed',
            }}
            title={isSupported ? t('voice.start_dictation') : t('voice.not_supported')}
          >
            <Mic size={14} color={isSupported ? '#0284c7' : '#94a3b8'} />
            <span>{t('voice.start_dictation')}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={stopListening}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              fontSize: '0.8rem',
              fontWeight: 700,
              background: '#ef4444',
              color: '#fff',
              border: '1px solid #dc2626',
              borderRadius: 6,
              cursor: 'pointer',
              animation: 'pulse 1.5s infinite',
            }}
            title={t('voice.stop_dictation')}
          >
            <MicOff size={14} />
            <span>{t('voice.stop_dictation')}</span>
          </button>
        )}

        {isListening && (
          <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
            {t('voice.listening')}
          </span>
        )}
      </div>

      {/* Live Interim feedback while talking */}
      {isListening && interimText && (
        <div
          style={{
            fontSize: '0.8rem',
            color: '#64748b',
            fontStyle: 'italic',
            padding: '4px 8px',
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: 4,
          }}
        >
          &quot;{interimText}&quot;
        </div>
      )}

      {/* Error or Browser limitation notice */}
      {speechError && (
        <div
          style={{
            fontSize: '0.78rem',
            color: '#b91c1c',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 4,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
          }}
        >
          <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <div>{speechError}</div>
            <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>
              {t('voice.manual_fallback')}
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY REVIEW & CORRECTION MODAL / POPUP BEFORE SAVING */}
      {showReviewModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={handleDiscard}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 10,
              maxWidth: 580,
              width: '100%',
              padding: 20,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                  {t('voice.review_heading')} ({targetFieldLabel})
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Spoken Language: {selectedSpeechLang === 'te-IN' ? 'Telugu (తెలుగు)' : 'English'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleDiscard}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* MANDATORY CLINICAL SAFETY WARNING */}
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 6,
                padding: '10px 12px',
                marginBottom: 12,
                display: 'flex',
                gap: 8,
                fontSize: '0.8rem',
                color: '#92400e',
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>{t('voice.disclaimer')}</strong>
              </div>
            </div>

            {/* Editable Transcript Field */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Review and correct recognized transcript before accepting:
              </label>
              <textarea
                rows={4}
                value={editableTranscript}
                onChange={(e) => setEditableTranscript(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  fontSize: '0.9rem',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* PRIVACY DISCLOSURE */}
            <div
              style={{
                fontSize: '0.75rem',
                color: '#64748b',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 4,
                padding: '6px 10px',
                marginBottom: 16,
              }}
            >
              🔒 {t('voice.privacy_notice')}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={handleDiscard}
                style={{
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('voice.btn_discard')}
              </button>
              <button
                type="button"
                onClick={() => handleCommit('append')}
                style={{
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: '1px solid #0284c7',
                  background: '#f0f9ff',
                  color: '#0369a1',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('voice.btn_append')}
              </button>
              <button
                type="button"
                onClick={() => handleCommit('insert')}
                style={{
                  padding: '7px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#0284c7',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('voice.btn_insert')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
