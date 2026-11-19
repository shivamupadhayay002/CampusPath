import React, { useEffect, useState } from 'react';
import { X, Paperclip, Trash2, UploadCloud } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { College, POST_CATEGORY_LABELS, PostCategory, PostItem } from '../types/campus';

interface ComposerModalProps {
  open: boolean;
  editingPost?: PostItem | null;
  onClose: () => void;
  onSaved: (post: PostItem, isEdit: boolean) => void;
}

const CATEGORIES = Object.keys(POST_CATEGORY_LABELS) as PostCategory[];

export const ComposerModal: React.FC<ComposerModalProps> = ({
  open,
  editingPost,
  onClose,
  onSaved,
}) => {
  const { profile, apiFetch } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [activeColleges, setActiveColleges] = useState<College[]>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>('');
  const [category, setCategory] = useState<PostCategory>('study_materials');
  const [title, setTitle] = useState('');
  const [contextLabel, setContextLabel] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [externalLink, setExternalLink] = useState('');
  const [visibility, setVisibility] = useState<'college' | 'public_preview'>('college');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingPost) {
      setCategory(editingPost.category);
      setTitle(editingPost.title);
      setContextLabel(editingPost.contextLabel || '');
      setContent(editingPost.content);
      setTags(editingPost.tags.join(', '));
      setExternalLink(editingPost.externalLink || '');
      setVisibility(editingPost.visibility === 'public_preview' ? 'public_preview' : 'college');
      setFiles([]);
    } else {
      setCategory('study_materials');
      setTitle('');
      setContextLabel('');
      setContent('');
      setTags('');
      setExternalLink('');
      setVisibility('college');
      setFiles([]);
    }
    setError(null);
  }, [editingPost, open]);

  useEffect(() => {
    if (!open || editingPost || !isAdmin) return;
    fetch('/api/colleges')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: College[]) => {
        setActiveColleges(list);
        if (profile?.collegeId && list.some((c) => c.id === profile.collegeId)) {
          setSelectedCollegeId(String(profile.collegeId));
        } else {
          setSelectedCollegeId('');
        }
      })
      .catch(() => {
        setActiveColleges([]);
        setSelectedCollegeId('');
      });
  }, [open, editingPost, isAdmin, profile?.collegeId]);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    const merged = [...files, ...selected].slice(0, 3);
    for (const file of merged) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`"${file.name}" exceeds the 10 MB per-file limit.`);
        return;
      }
    }
    setError(null);
    setFiles(merged);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (editingPost) {
        const res = await apiFetch(`/api/posts/${editingPost.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            category,
            title,
            contextLabel,
            content,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Unable to update post.');
          return;
        }
        onSaved({ ...editingPost, ...data.post }, true);
        onClose();
        return;
      }

      if (isAdmin && !selectedCollegeId) {
        setError('Please select a target active college before publishing.');
        setSubmitting(false);
        return;
      }

      const formData = new FormData();
      formData.append('category', category);
      formData.append('title', title);
      formData.append('contextLabel', contextLabel);
      formData.append('content', content);
      formData.append('tags', tags);
      formData.append('externalLink', externalLink);
      formData.append('visibility', visibility);
      if (isAdmin && selectedCollegeId) {
        formData.append('collegeId', selectedCollegeId);
      }
      for (const file of files) {
        formData.append('attachments', file);
      }

      const res = await apiFetch('/api/posts', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to publish post.');
        return;
      }
      onSaved(data.post, false);
      onClose();
    } catch {
      setError('Network error while publishing post.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="composer-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E3E1EE] dark:border-[#23273A] pb-3">
          <h2 id="composer-title" className="text-lg font-bold text-[#17152B] dark:text-[#F1F2F9]">
            {editingPost ? 'Edit Campus Post' : 'Share with Your Campus Network'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close post composer"
            className="p-2 rounded-lg text-[#6A6784] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1.5">
              Category
            </label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    category === cat
                      ? 'bg-[#5B4BFF] text-white'
                      : 'bg-[#F5F5FA] dark:bg-[#0E101A] text-[#6A6784] dark:text-[#9CA0B8] hover:text-[#17152B] dark:hover:text-[#F1F2F9]'
                  }`}
                >
                  {POST_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {!editingPost && isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                Target College (Required for Admin Posts)
              </label>
              <select
                required
                value={selectedCollegeId}
                onChange={(e) => setSelectedCollegeId(e.target.value)}
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
              >
                <option value="">Select an active college...</option>
                {activeColleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
              Headline
            </label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={160}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., CS304 Operating Systems Midterm Sheet or Google SWE Intern Round Breakdown"
              className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2.5 text-sm text-[#17152B] dark:text-[#F1F2F9]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                Course, Company, or Event Context
              </label>
              <input
                type="text"
                maxLength={100}
                value={contextLabel}
                onChange={(e) => setContextLabel(e.target.value)}
                placeholder="e.g., CS304 · Fall 2026 or CloudScale SWE"
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
              />
            </div>

            {!editingPost && (
              <div>
                <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="dsa, dbms, internship-prep"
                  className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
              Details, Notes, or Interview Breakdown
            </label>
            <textarea
              required
              minLength={10}
              maxLength={8000}
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write structured study takeaways, interview questions, or referral details that classmates can reference later..."
              className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2.5 text-sm leading-relaxed text-[#17152B] dark:text-[#F1F2F9]"
            />
          </div>

          {!editingPost && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                    Reference Link (optional)
                  </label>
                  <input
                    type="url"
                    value={externalLink}
                    onChange={(e) => setExternalLink(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                    Visibility
                  </label>
                  <select
                    value={visibility}
                    onChange={(e) =>
                      setVisibility(e.target.value as 'college' | 'public_preview')
                    }
                    className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
                  >
                    <option value="college">Verified College Members Only</option>
                    <option value="public_preview">Public Campus Showcase</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1.5">
                  Attachments (PDF, DOCX, PNG, JPEG, WEBP — max 3 files, 10 MB each)
                </label>
                <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#C7C4DC] dark:border-[#2E334B] bg-[#FAF9FF] dark:bg-[#0E101A] px-4 py-4 text-xs font-medium text-[#6A6784] dark:text-[#9CA0B8] cursor-pointer hover:border-[#5B4BFF]">
                  <UploadCloud className="w-4 h-4 text-[#5B4BFF]" />
                  <span>Choose study notes or slides to attach</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>

                {files.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {files.map((f, idx) => (
                      <li
                        key={`${f.name}-${idx}`}
                        className="flex items-center justify-between rounded-lg border border-[#E3E1EE] dark:border-[#23273A] px-3 py-1.5 text-xs"
                      >
                        <span className="flex items-center gap-2 truncate text-[#17152B] dark:text-[#F1F2F9]">
                          <Paperclip className="w-3.5 h-3.5 text-[#5B4BFF] shrink-0" />
                          <span className="truncate">{f.name}</span>
                          <span className="text-[#6A6784] tabular-nums">
                            ({(f.size / 1024).toFixed(0)} KB)
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label={`Remove ${f.name}`}
                          className="p-1 text-[#6A6784] hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

          {error && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-[#E3E1EE] dark:border-[#23273A] pt-4">
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
              className="px-5 py-2 rounded-xl bg-[#5B4BFF] text-white text-sm font-semibold hover:bg-[#4B3CE8] disabled:opacity-50"
            >
              {submitting
                ? editingPost
                  ? 'Saving...'
                  : 'Publishing...'
                : editingPost
                ? 'Save Changes'
                : 'Publish Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
