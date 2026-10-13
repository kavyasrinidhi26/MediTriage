import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

export interface FirebaseConfigStatus {
  isConfigured: boolean;
  missingKeys: string[];
}

// Read Vite environment variables safely across browser and test runners
const globalProc = typeof globalThis !== 'undefined'
  ? (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
  : undefined;

const metaEnv: Record<string, string | undefined> =
  typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string | undefined> }).env
    ? (import.meta as { env: Record<string, string | undefined> }).env
    : globalProc && globalProc.env
    ? globalProc.env
    : {};

const firebaseConfig = {
  apiKey: metaEnv.VITE_FIREBASE_API_KEY?.trim() || '',
  authDomain: metaEnv.VITE_FIREBASE_AUTH_DOMAIN?.trim() || '',
  projectId: metaEnv.VITE_FIREBASE_PROJECT_ID?.trim() || '',
  storageBucket: metaEnv.VITE_FIREBASE_STORAGE_BUCKET?.trim() || '',
  messagingSenderId: metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || '',
  appId: metaEnv.VITE_FIREBASE_APP_ID?.trim() || '',
  measurementId: metaEnv.VITE_FIREBASE_MEASUREMENT_ID?.trim() || undefined,
};

export const REQUIRED_CONFIG_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export function checkFirebaseConfig(): FirebaseConfigStatus {
  const missingKeys: string[] = [];

  if (!firebaseConfig.apiKey) missingKeys.push('VITE_FIREBASE_API_KEY');
  if (!firebaseConfig.authDomain) missingKeys.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!firebaseConfig.projectId) missingKeys.push('VITE_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.appId) missingKeys.push('VITE_FIREBASE_APP_ID');

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
  };
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
