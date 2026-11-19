import React, { useState } from 'react';
import { X, Flag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ReportModalProps {
  target: {
    type: 'post' | 'comment' | 'user' | 'message';
    id: number;
    label: string;
  } | null;
  onClose: () => void;
  onSubmitted: (msg: string) => void;
}

const REPORT_REASONS = [
  'Spam or unsolicited promotion',
  'Harassment, hate speech, or impersonation',
  'Copyrighted or leaked exam material',
  'Misleading job/internship scam',
  'Inappropriate or unsafe content',
  'Other community rule violation',
];

export const ReportModal: React.FC<ReportModalProps> = ({ target, onClose, onSubmitted }) => {
  const { apiFetch } = useAuth();
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!target) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          targetType: target.type,
          targetId: target.id,
          reason,
          details,
          priority,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not submit report.');
        return;
      }
      onSubmitted('Report submitted to campus moderators for review.');
      onClose();
    } catch {
      setError('Network error while sending report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E3E1EE] dark:border-[#23273A] pb-3">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-[#DD2A7B]" />
            <h2 id="report-modal-title" className="text-lg font-bold text-[#17152B] dark:text-[#F1F2F9]">
              Report {target.type}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report dialog"
            className="p-2 rounded-lg text-[#6A6784] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8]">
            Reporting: <span className="font-medium text-[#17152B] dark:text-[#F1F2F9]">{target.label}</span>
          </p>

          <div>
            <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1.5">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2.5 text-sm text-[#17152B] dark:text-[#F1F2F9]"
            >
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1.5">
              Severity
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPriority(level)}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold capitalize border transition-colors ${
                    priority === level
                      ? 'bg-[#5B4BFF] text-white border-[#5B4BFF]'
                      : 'border-[#E3E1EE] dark:border-[#23273A] text-[#6A6784] dark:text-[#9CA0B8]'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1.5">
              Additional Context (optional)
            </label>
            <textarea
              rows={3}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Describe what happened so moderators can act accurately..."
              className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2.5 text-sm text-[#17152B] dark:text-[#F1F2F9]"
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[#6A6784] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-[#DD2A7B] text-white text-sm font-semibold hover:bg-[#C4216B] disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
