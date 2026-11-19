import React from 'react';
import { X, ShieldCheck, Lock, FileText } from 'lucide-react';

interface GuidelinesModalProps {
  open: boolean;
  onClose: () => void;
}

export const GuidelinesModal: React.FC<GuidelinesModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guidelines-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E3E1EE] dark:border-[#23273A] pb-4">
          <h2 id="guidelines-title" className="text-xl font-bold text-[#17152B] dark:text-[#F1F2F9]">
            Community Guidelines, Privacy &amp; Eligibility
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close community guidelines"
            className="p-2 rounded-lg text-[#6A6784] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-5 space-y-6 text-sm leading-relaxed text-[#3F3C56] dark:text-[#C5C7D9]">
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 font-semibold text-[#17152B] dark:text-[#F1F2F9]">
              <ShieldCheck className="w-4 h-4 text-[#5B4BFF]" />
              Campus Eligibility &amp; Verification
            </h3>
            <p>
              CampusPath is built for verified students, faculty, and alumni of participating colleges.
              You can verify via an approved institutional email domain or submit an enrollment review
              to campus administrators. Optional LinkedIn links help peers view your portfolio, but
              never replace college verification.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="flex items-center gap-2 font-semibold text-[#17152B] dark:text-[#F1F2F9]">
              <FileText className="w-4 h-4 text-[#DD2A7B]" />
              Academic Integrity &amp; Safe Conduct
            </h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Share study guides, lecture summaries, and interview insights you own or are permitted to distribute.</li>
              <li>Do not upload copyrighted textbooks, leaked exam papers, harassment, impersonation, scams, or spam.</li>
              <li>Use Report on any post, comment, profile, or message to route violations to campus moderators.</li>
              <li>Moderated content or account restrictions can be appealed via campus administration.</li>
            </ul>
          </div>

          <div className="space-y-2">
            <h3 className="flex items-center gap-2 font-semibold text-[#17152B] dark:text-[#F1F2F9]">
              <Lock className="w-4 h-4 text-[#13866B]" />
              Privacy &amp; Data Handling
            </h3>
            <p>
              Verification notes and student ID references are visible strictly to authorized campus
              administrators and are never shown publicly. You control whether your email, academic year,
              or LinkedIn URL appears on your profile, and you may permanently delete your account at
              any time from Profile settings. Direct messages are private to conversation participants
              and are not advertised as end-to-end encrypted.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-[#E3E1EE] dark:border-[#23273A] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#5B4BFF] text-white text-sm font-semibold hover:bg-[#4B3CE8] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
