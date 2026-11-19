import React, { useEffect, useState } from 'react';
import { ShieldCheck, Mail, ClipboardCheck, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { College } from '../types/campus';

interface VerificationModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
}

export const VerificationModal: React.FC<VerificationModalProps> = ({
  open,
  onClose,
  onVerified,
}) => {
  const {
    firebaseUser,
    profile,
    apiFetch,
    refreshMe,
    resendVerificationEmail,
    refreshEmailVerificationStatus,
  } = useAuth();

  const [colleges, setColleges] = useState<College[]>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState<number>(0);
  const [requestedRole, setRequestedRole] = useState<'student' | 'faculty' | 'alumni'>('student');
  const [collegeEmail, setCollegeEmail] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');

  const [loading, setLoading] = useState(false);
  const [emailActionBusy, setEmailActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStatusMessage(null);
    setEmailFeedback(null);

    fetch('/api/colleges')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: College[]) => {
        setColleges(list);
        if (profile?.collegeId && list.some((c) => c.id === profile.collegeId)) {
          setSelectedCollegeId(profile.collegeId);
        } else if (list[0]) {
          setSelectedCollegeId(list[0].id);
        }
      })
      .catch(() => {});
  }, [open, profile?.collegeId]);

  if (!open) return null;

  const activeCollege = colleges.find((c) => c.id === selectedCollegeId);
  const needsFirebaseEmailVerification = Boolean(firebaseUser && !firebaseUser.emailVerified);

  const handleResendEmail = async () => {
    setEmailActionBusy(true);
    setEmailFeedback(null);
    const result = await resendVerificationEmail();
    setEmailActionBusy(false);
    if (result.ok) {
      setEmailFeedback({
        type: 'success',
        text: 'Verification email sent. Check your inbox (and spam folder), click the link, then click "Refresh Status".',
      });
    } else {
      setEmailFeedback({
        type: 'error',
        text: result.error || 'Could not send verification email. Please try again shortly.',
      });
    }
  };

  const handleRefreshEmailStatus = async () => {
    setEmailActionBusy(true);
    setEmailFeedback(null);
    const result = await refreshEmailVerificationStatus();
    setEmailActionBusy(false);

    if (!result.ok) {
      setEmailFeedback({
        type: 'error',
        text: result.error || 'Unable to refresh email verification status right now.',
      });
      return;
    }

    if (result.emailVerified) {
      setEmailFeedback({
        type: 'success',
        text: 'Your email address is now verified. If you signed up with an approved institutional email, your college membership has been updated automatically.',
      });
      onVerified();
    } else {
      setEmailFeedback({
        type: 'error',
        text: 'Your email is still unverified. Please click the verification link in your inbox first, then click Refresh Status again.',
      });
    }
  };

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollegeId) {
      setError('Please select your college first.');
      return;
    }
    setLoading(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await apiFetch('/api/verification/request', {
        method: 'POST',
        body: JSON.stringify({
          collegeId: selectedCollegeId,
          requestedRole,
          collegeEmail,
          evidenceNote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not submit verification request.');
        return;
      }
      await refreshMe();
      setEvidenceNote('');
      setStatusMessage(
        'Your verification request has been queued for campus administrator review.'
      );
    } catch {
      setError('Network error while submitting request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E3E1EE] dark:border-[#23273A] pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#5B4BFF]" />
            <h2 id="verify-modal-title" className="text-lg font-bold text-[#17152B] dark:text-[#F1F2F9]">
              Verify College Membership
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close verification dialog"
            className="p-2 rounded-lg text-[#6A6784] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {needsFirebaseEmailVerification && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 p-3.5 space-y-2.5">
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Confirm Your Email Address First
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">
                    Your account email has not been verified yet. Confirm your inbox link to enable
                    automatic institutional-domain verification.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={emailActionBusy}
                  onClick={handleResendEmail}
                  className="px-3 py-1.5 rounded-lg bg-amber-700 text-white text-xs font-semibold hover:bg-amber-800 disabled:opacity-50"
                >
                  {emailActionBusy ? 'Working...' : 'Resend Verification Email'}
                </button>
                <button
                  type="button"
                  disabled={emailActionBusy}
                  onClick={handleRefreshEmailStatus}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-[#131622] text-xs font-semibold text-amber-900 dark:text-amber-200 hover:border-amber-500 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  I&apos;ve Verified — Refresh Status
                </button>
              </div>
              {emailFeedback && (
                <p
                  className={`text-xs font-medium ${
                    emailFeedback.type === 'success'
                      ? 'text-[#13866B] dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {emailFeedback.text}
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] p-3 flex items-start gap-2.5">
            <ClipboardCheck className="w-4 h-4 text-[#5B4BFF] mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-[#17152B] dark:text-[#F1F2F9]">
                Campus Administrator Review
              </p>
              <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8] leading-relaxed">
                Self-service email OTP codes are temporarily disabled while transactional email
                delivery is being configured. Submit your campus enrollment details below for
                private review by a campus administrator.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitManual} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                  College
                </label>
                <select
                  required
                  value={selectedCollegeId}
                  onChange={(e) => setSelectedCollegeId(Number(e.target.value))}
                  className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
                >
                  {colleges.length === 0 && <option value={0}>Loading colleges...</option>}
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                  Campus Role
                </label>
                <select
                  value={requestedRole}
                  onChange={(e) =>
                    setRequestedRole(e.target.value as 'student' | 'faculty' | 'alumni')
                  }
                  className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
                >
                  <option value="student">Student</option>
                  <option value="faculty">Faculty</option>
                  <option value="alumni">Alumni</option>
                </select>
              </div>
            </div>

            {activeCollege && activeCollege.approvedDomains.length > 0 && (
              <p className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8]">
                Approved institutional domains for {activeCollege.name}:{' '}
                <span className="font-mono text-[#17152B] dark:text-[#F1F2F9]">
                  {activeCollege.approvedDomains.map((d) => `@${d}`).join(', ')}
                </span>
              </p>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                College Email (if assigned, optional)
              </label>
              <input
                type="email"
                value={collegeEmail}
                onChange={(e) => setCollegeEmail(e.target.value)}
                placeholder="optional@college.edu"
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                Enrollment / ID Details
              </label>
              <textarea
                required
                minLength={10}
                maxLength={600}
                rows={3}
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                placeholder="Include your student roll number, department, admission year, or faculty directory reference. Verification records are visible only to campus administrators."
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !selectedCollegeId}
              className="w-full py-2.5 px-4 rounded-xl bg-[#5B4BFF] text-white text-sm font-semibold hover:bg-[#4B3CE8] disabled:opacity-50"
            >
              {loading ? 'Submitting...' : 'Submit for Admin Review'}
            </button>
          </form>

          {error && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          )}
          {statusMessage && (
            <p className="text-xs font-medium text-[#13866B] dark:text-emerald-400">
              {statusMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
