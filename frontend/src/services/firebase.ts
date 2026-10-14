import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

export interface FirebaseConfigStatus {
  isConfigured: boolean;
  missingKeys: string[];
}

const readEnv = (val: unknown, key: string): string => {
  if (typeof val === 'string' && val.trim()) return val.trim();
  const proc = typeof globalThis !== 'undefined'
    ? (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
    : undefined;
  if (proc?.env && proc.env[key]) {
    return String(proc.env[key]).trim();
  }
  return '';
};

// Direct property access enables Vite AST compile-time static string replacement during production build
export const firebaseConfig = {
  apiKey: readEnv(import.meta.env?.VITE_FIREBASE_API_KEY, 'VITE_FIREBASE_API_KEY'),
  authDomain: readEnv(import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN, 'VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv(import.meta.env?.VITE_FIREBASE_PROJECT_ID, 'VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv(import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET, 'VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv(import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID, 'VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv(import.meta.env?.VITE_FIREBASE_APP_ID, 'VITE_FIREBASE_APP_ID'),
  measurementId: readEnv(import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID, 'VITE_FIREBASE_MEASUREMENT_ID') || undefined,
};

export const REQUIRED_CONFIG_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export function validateFirebaseConfig(config: {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
}): FirebaseConfigStatus {
  const missingKeys: string[] = [];

  if (!config.apiKey?.trim()) missingKeys.push('VITE_FIREBASE_API_KEY');
  if (!config.authDomain?.trim()) missingKeys.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!config.projectId?.trim()) missingKeys.push('VITE_FIREBASE_PROJECT_ID');
  if (!config.appId?.trim()) missingKeys.push('VITE_FIREBASE_APP_ID');

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
  };
}

export function checkFirebaseConfig(): FirebaseConfigStatus {
  return validateFirebaseConfig(firebaseConfig);
}

const status = checkFirebaseConfig();

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (status.isConfigured) {
  try {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
  } catch (err) {
    console.warn('Firebase initialization encountered an error:', err);
    app = null;
    auth = null;
  }
}

export { app, auth };
export const isFirebaseConfigured = status.isConfigured && Boolean(auth);
export const missingFirebaseKeys = status.missingKeys;
