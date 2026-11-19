import React, { useEffect, useState } from 'react';
import { Lock, Mail, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'signin' | 'signup';
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  initialMode = 'signin',
  onClose,
  onSuccess,
}) => {
  const {
    authError,
    clearAuthError,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [branch, setBranch] = useState('');
  const [academicYear, setAcademicYear] = useState('Sophomore (2nd Year)');
  const [busy, setBusy] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setInfoMessage(null);
    clearAuthError();
  }, [open, initialMode, clearAuthError]);

  if (!open) return null;

  const handleGoogleContinue = async () => {
    setBusy(true);
    setInfoMessage(null);
    const ok = await signInWithGoogle(
      mode === 'signup'
        ? {
            displayName: displayName.trim() || undefined,
            branch: branch.trim() || undefined,
            academicYear: academicYear.trim() || undefined,
          }
        : undefined
    );
    setBusy(false);
    if (ok) {
      onSuccess(
        mode === 'signup'
          ? 'Welcome to CampusPath! Complete verification to join your college community.'
          : 'Signed in to CampusPath.'
      );
      onClose();
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setInfoMessage(null);

    if (mode === 'signin') {
      const ok = await signInWithEmail(email, password);
      setBusy(false);
      if (ok) {
        onSuccess('Signed in to CampusPath.');
        onClose();
      }
      return;
    }

    const result = await signUpWithEmail({
      email,
      password,
      displayName,
      branch,
      academicYear,
    });
    setBusy(false);
    if (result.ok) {
      if (result.verificationEmailSent) {
        onSuccess(
          'Account created! Please check your inbox and click the verification link, then refresh your status.'
        );
      } else {
        onSuccess(
          `Account created, but we could not send the verification email (${result.verificationError || 'delivery error'}). Open Verify Membership to resend it.`
        );
      }
      onClose();
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      setInfoMessage('Enter your Gmail or college email above first to receive a reset link.');
      return;
    }
    setBusy(true);
    const ok = await sendPasswordReset(email);
    setBusy(false);
    if (ok) {
      setInfoMessage(`Password reset email sent to ${email.trim()}.`);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E3E1EE] dark:border-[#23273A] pb-3">
          <div>
            <h2 id="auth-modal-title" className="text-lg font-bold text-[#17152B] dark:text-[#F1F2F9]">
              {mode === 'signin' ? 'Sign in to CampusPath' : 'Create Student Account'}
            </h2>
            <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8]">
              Use your student Gmail or institutional email
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in dialog"
            className="p-2 rounded-lg text-[#6A6784] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switch */}
        <div className="mt-4 grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#F5F5FA] dark:bg-[#0E101A] border border-[#E3E1EE] dark:border-[#23273A]">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              clearAuthError();
              setInfoMessage(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'signin'
                ? 'bg-white dark:bg-[#191D2E] text-[#17152B] dark:text-[#F1F2F9] shadow-xs'
                : 'text-[#6A6784] dark:text-[#9CA0B8]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              clearAuthError();
              setInfoMessage(null);
            }}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
              mode === 'signup'
                ? 'bg-white dark:bg-[#191D2E] text-[#17152B] dark:text-[#F1F2F9] shadow-xs'
                : 'text-[#6A6784] dark:text-[#9CA0B8]'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Google Student Gmail Action */}
        <div className="mt-4">
          <button
            type="button"
            disabled={busy}
            onClick={handleGoogleContinue}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-xl border border-[#D8D5E8] dark:border-[#2E334B] bg-white dark:bg-[#191D2E] text-sm font-semibold text-[#17152B] dark:text-[#F1F2F9] hover:border-[#5B4BFF] transition-colors disabled:opacity-50"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.09A12 12 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29V6.62H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l4-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.09c.95-2.84 3.6-4.95 6.72-4.95z"
              />
            </svg>
            <span>
              {mode === 'signin'
                ? 'Continue with Student Gmail (Google)'
                : 'Sign Up with Student Gmail (Google)'}
            </span>
          </button>
        </div>

        <div className="my-4 flex items-center gap-3 text-[11px] text-[#6A6784] dark:text-[#9CA0B8]">
          <div className="h-px flex-1 bg-[#E3E1EE] dark:bg-[#23273A]" />
          <span>or with email &amp; password</span>
          <div className="h-px flex-1 bg-[#E3E1EE] dark:bg-[#23273A]" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#6A6784] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g., Ananya Rao"
                    className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] pl-9 pr-3 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                    Branch / Department
                  </label>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="e.g., Computer Science"
                    className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs text-[#17152B] dark:text-[#F1F2F9]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                    Academic Year
                  </label>
                  <select
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs text-[#17152B] dark:text-[#F1F2F9]"
                  >
                    <option value="Freshman (1st Year)">Freshman (1st Year)</option>
                    <option value="Sophomore (2nd Year)">Sophomore (2nd Year)</option>
                    <option value="Junior (3rd Year)">Junior (3rd Year)</option>
                    <option value="Senior (4th Year)">Senior (4th Year)</option>
                    <option value="Postgraduate / Masters">Postgraduate / Masters</option>
                    <option value="Alumni">Alumni</option>
                    <option value="Faculty">Faculty</option>
                  </select>
                </div>
              </div>

              <p className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8]">
                Your college assignment is confirmed after verifying your institutional email or
                completing campus administrator review.
              </p>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
              Student Gmail or College Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#6A6784] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@gmail.com or name@student.apex.edu"
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] pl-9 pr-3 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9]">
                Password
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  className="text-[11px] font-semibold text-[#5B4BFF] hover:underline"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#6A6784] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'At least 6 characters' : 'Enter password'}
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] pl-9 pr-3 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
              />
            </div>
          </div>

          {authError && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 text-xs text-red-700 dark:text-red-300 leading-relaxed space-y-2">
              <p>{authError}</p>
              {authError.includes('unauthorized') && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                >
                  Reload Preview to Clear Cache
                </button>
              )}
            </div>
          )}

          {infoMessage && (
            <p className="rounded-xl bg-[#ECEBFF] dark:bg-[#232048] p-3 text-xs font-medium text-[#5B4BFF] dark:text-[#A59BFF]">
              {infoMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 px-4 rounded-xl bg-[#5B4BFF] text-white text-sm font-semibold hover:bg-[#4B3CE8] transition-colors disabled:opacity-50"
          >
            {busy
              ? mode === 'signin'
                ? 'Signing in...'
                : 'Creating account...'
              : mode === 'signin'
              ? 'Sign In'
              : 'Create Student Account'}
          </button>
        </form>
      </div>
    </div>
  );
};
