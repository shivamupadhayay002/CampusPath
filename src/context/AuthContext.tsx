import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { College, UserProfile } from '../types/campus';

export interface StudentSignupDetails {
  displayName?: string;
  branch?: string;
  academicYear?: string;
}

export interface EmailSignupResult {
  ok: boolean;
  verificationEmailSent: boolean;
  verificationError?: string;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  profile: UserProfile | null;
  college: College | null;
  unreadNotifications: number;
  followersCount: number;
  followingCount: number;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: (details?: StudentSignupDetails) => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (params: {
    email: string;
    password: string;
    displayName: string;
    branch?: string;
    academicYear?: string;
  }) => Promise<EmailSignupResult>;
  resendVerificationEmail: () => Promise<{ ok: boolean; error?: string }>;
  refreshEmailVerificationStatus: () => Promise<{
    ok: boolean;
    emailVerified: boolean;
    error?: string;
  }>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  apiFetch: (path: string, options?: RequestInit) => Promise<Response>;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function formatFirebaseAuthError(err: any): string {
  const code = err?.code || '';
  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
    return `Firebase reported "${host}" as unauthorized. If you already added it under Authorized domains in campuspath-86c73, reload the preview below to clear Firebase's cached auth session (and ensure ais-mob-remswyaqwonfjmi34kduc4-62379221155.asia-east1.run.app is also added if testing mobile preview).`;
  }
  if (code === 'auth/operation-not-allowed') {
    return 'This sign-in provider is disabled in Firebase Console. Enable Google and Email/Password under Authentication -> Sign-in method.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Switch to Sign In instead.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters long.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid Gmail or college email address.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many verification requests right now. Please wait a few minutes before retrying.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Browser blocked the Google sign-in popup. Please allow popups for this site and try again.';
  }
  return err?.message || 'Authentication failed. Please try again.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [college, setCollege] = useState<College | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Store ID token strictly in memory (never localStorage)
  const tokenRef = useRef<string | null>(null);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const getToken = useCallback(async () => {
    if (auth.currentUser) {
      const fresh = await auth.currentUser.getIdToken();
      tokenRef.current = fresh;
      return fresh;
    }
    return tokenRef.current;
  }, []);

  const apiFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = await getToken();
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      return fetch(path, { ...options, headers });
    },
    [getToken]
  );

  const refreshMe = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      setCollege(null);
      setUnreadNotifications(0);
      setFollowersCount(0);
      setFollowingCount(0);
      return;
    }

    try {
      const res = await apiFetch('/api/me');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setAuthError(err.error || 'Could not load your CampusPath profile.');
        return;
      }
      const data = await res.json();
      setProfile(data.user);
      setCollege(data.college);
      setUnreadNotifications(data.unreadNotifications ?? 0);
      setFollowersCount(data.followersCount ?? 0);
      setFollowingCount(data.followingCount ?? 0);
      setAuthError(null);
    } catch {
      setAuthError('Network error while synchronizing your session.');
    }
  }, [apiFetch]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        tokenRef.current = await user.getIdToken();
        await refreshMe();
      } else {
        tokenRef.current = null;
        setProfile(null);
        setCollege(null);
        setUnreadNotifications(0);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [refreshMe]);

  const applyInitialSignupDetails = useCallback(
    async (details?: StudentSignupDetails) => {
      if (!details) return;
      const payload: Record<string, unknown> = {};
      if (details.displayName?.trim()) payload.displayName = details.displayName.trim();
      if (details.branch?.trim()) payload.branch = details.branch.trim();
      if (details.academicYear?.trim()) payload.academicYear = details.academicYear.trim();

      if (Object.keys(payload).length > 0) {
        await apiFetch('/api/me', {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }
    },
    [apiFetch]
  );

  const signInWithGoogle = useCallback(
    async (details?: StudentSignupDetails): Promise<boolean> => {
      setAuthError(null);
      try {
        const cred = await signInWithPopup(auth, googleAuthProvider);
        tokenRef.current = await cred.user.getIdToken(true);
        await apiFetch('/api/me');
        await applyInitialSignupDetails(details);
        await refreshMe();
        return true;
      } catch (err: any) {
        if (err?.code !== 'auth/popup-closed-by-user') {
          setAuthError(formatFirebaseAuthError(err));
        }
        return false;
      }
    },
    [apiFetch, applyInitialSignupDetails, refreshMe]
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setAuthError(null);
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        tokenRef.current = await cred.user.getIdToken(true);
        await refreshMe();
        return true;
      } catch (err: any) {
        setAuthError(formatFirebaseAuthError(err));
        return false;
      }
    },
    [refreshMe]
  );

  const signUpWithEmail = useCallback(
    async (params: {
      email: string;
      password: string;
      displayName: string;
      branch?: string;
      academicYear?: string;
    }): Promise<EmailSignupResult> => {
      setAuthError(null);
      try {
        const cred = await createUserWithEmailAndPassword(
          auth,
          params.email.trim(),
          params.password
        );
        if (params.displayName.trim()) {
          await updateProfile(cred.user, { displayName: params.displayName.trim() });
        }

        let verificationEmailSent = false;
        let verificationError: string | undefined;
        try {
          await sendEmailVerification(cred.user);
          verificationEmailSent = true;
        } catch (verifyErr: any) {
          verificationEmailSent = false;
          verificationError = formatFirebaseAuthError(verifyErr);
        }

        tokenRef.current = await cred.user.getIdToken(true);
        await apiFetch('/api/me');
        await applyInitialSignupDetails({
          displayName: params.displayName,
          branch: params.branch,
          academicYear: params.academicYear,
        });
        await refreshMe();

        return {
          ok: true,
          verificationEmailSent,
          verificationError,
        };
      } catch (err: any) {
        setAuthError(formatFirebaseAuthError(err));
        return {
          ok: false,
          verificationEmailSent: false,
        };
      }
    },
    [apiFetch, applyInitialSignupDetails, refreshMe]
  );

  const resendVerificationEmail = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    const user = auth.currentUser;
    if (!user) {
      return { ok: false, error: 'You must be signed in to resend a verification email.' };
    }
    try {
      await sendEmailVerification(user);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: formatFirebaseAuthError(err) };
    }
  }, []);

  const refreshEmailVerificationStatus = useCallback(async (): Promise<{
    ok: boolean;
    emailVerified: boolean;
    error?: string;
  }> => {
    const user = auth.currentUser;
    if (!user) {
      return {
        ok: false,
        emailVerified: false,
        error: 'You must be signed in to refresh verification status.',
      };
    }
    try {
      await user.reload();
      const reloadedUser = auth.currentUser;
      setFirebaseUser(reloadedUser);
      if (reloadedUser) {
        tokenRef.current = await reloadedUser.getIdToken(true);
      }
      await refreshMe();
      return {
        ok: true,
        emailVerified: Boolean(reloadedUser?.emailVerified),
      };
    } catch (err: any) {
      return {
        ok: false,
        emailVerified: Boolean(user.emailVerified),
        error: formatFirebaseAuthError(err),
      };
    }
  }, [refreshMe]);

  const sendPasswordReset = useCallback(async (email: string): Promise<boolean> => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      return true;
    } catch (err: any) {
      setAuthError(formatFirebaseAuthError(err));
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    tokenRef.current = null;
    setProfile(null);
    setCollege(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        college,
        unreadNotifications,
        followersCount,
        followingCount,
        loading,
        authError,
        clearAuthError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resendVerificationEmail,
        refreshEmailVerificationStatus,
        sendPasswordReset,
        signOut,
        refreshMe,
        apiFetch,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
