import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, isFirebaseConfigured, missingFirebaseKeys } from '../services/firebase';

export interface AuthContextType {
  currentUser: User | null;
  idToken: string | null;
  loading: boolean;
  isFirebaseConfigured: boolean;
  missingConfigKeys: string[];
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOutStaff: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const token = await user.getIdToken();
          setIdToken(token);
        } catch (err) {
          console.warn('Failed to retrieve Firebase ID token:', err);
          setIdToken(null);
        }
      } else {
        setIdToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<void> => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error(
        'Firebase Authentication is not configured. Please provide the required VITE_FIREBASE_* variables in your frontend .env file.'
      );
    }
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
    const token = await userCredential.user.getIdToken();
    setCurrentUser(userCredential.user);
    setIdToken(token);
  }, []);

  const signOutStaff = useCallback(async (): Promise<void> => {
    if (!isFirebaseConfigured || !auth) {
      setCurrentUser(null);
      setIdToken(null);
      return;
    }
    await signOut(auth);
    setCurrentUser(null);
    setIdToken(null);
  }, []);

  const getIdToken = useCallback(
    async (forceRefresh = false): Promise<string | null> => {
      if (!currentUser) return null;
      try {
        const token = await currentUser.getIdToken(forceRefresh);
        setIdToken(token);
        return token;
      } catch (err) {
        console.warn('Failed to refresh Firebase token:', err);
        return null;
      }
    },
    [currentUser]
  );

  const value: AuthContextType = {
    currentUser,
    idToken,
    loading,
    isFirebaseConfigured,
    missingConfigKeys: missingFirebaseKeys,
    signInWithEmail,
    signOutStaff,
    getIdToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
