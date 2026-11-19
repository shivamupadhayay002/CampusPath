import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Heart,
  Link2,
  MessageSquare,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CommentItem, POST_CATEGORY_LABELS, PostAttachment, PostItem } from '../types/campus';
import { Avatar } from './Avatar';

interface PostCardProps {
  post: PostItem;
  onOpenProfile: (userId: number) => void;
  onRequireSignIn: () => void;
  onRequireVerify: () => void;
  onEditPost: (post: PostItem) => void;
  onDeletePost: (postId: number) => void;
  onReport: (target: { type: 'post' | 'comment'; id: number; label: string }) => void;
  onToast: (msg: string) => void;
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const AuthenticatedAttachment: React.FC<{
  attachment: PostAttachment;
  isVerified: boolean;
  onRequireAuth: () => void;
}> = ({ attachment, isVerified, onRequireAuth }) => {
  const { apiFetch } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    if (attachment.kind === 'image' && isVerified) {
      apiFetch(`/api/attachments/${attachment.id}`)
        .then((res) => (res.ok ? res.blob() : null))
        .then((blob) => {
          if (blob && active) {
            objectUrl = URL.createObjectURL(blob);
            setImageUrl(objectUrl);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.kind, isVerified, apiFetch]);

  const handleDownload = async () => {
    if (!isVerified) {
      onRequireAuth();
      return;
    }
    setDownloading(true);
    try {
      const res = await apiFetch(`/api/attachments/${attachment.id}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.originalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (attachment.kind === 'image' && imageUrl) {
    return (
      <div className="overflow-hidden rounded-xl border border-[#E3E1EE] dark:border-[#23273A]">
        <img
          src={imageUrl}
          alt={attachment.originalName}
          referrerPolicy="no-referrer"
          className="max-h-96 w-full object-cover"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={downloading}
      className="w-full flex items-center justify-between rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2.5 text-left hover:border-[#5B4BFF] transition-colors"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <FileText className="w-4 h-4 text-[#5B4BFF] shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#17152B] dark:text-[#F1F2F9] truncate">
            {attachment.originalName}
          </p>
          <p className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8] tabular-nums">
            {attachment.mimeType === 'application/pdf' ? 'PDF Document' : 'Study Resource'} ·{' '}
            {formatBytes(attachment.sizeBytes)}
          </p>
        </div>
      </div>
      <span className="flex items-center gap-1 text-xs font-semibold text-[#5B4BFF] shrink-0 ml-3">
        <Download className="w-3.5 h-3.5" />
        {downloading ? 'Loading...' : isVerified ? 'Download' : 'Verify to Access'}
      </span>
    </button>
  );
};

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onOpenProfile,
  onRequireSignIn,
  onRequireVerify,
  onEditPost,
  onDeletePost,
  onReport,
  onToast,
}) => {
  const { profile, apiFetch } = useAuth();
  const isVerified = profile?.verificationStatus === 'verified';
  const isOwner = profile?.id === post.authorId;
  const isModerator = profile?.role === 'admin' || profile?.role === 'moderator';

  const [liked, setLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [saved, setSaved] = useState(post.isSaved);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const ensureEligible = () => {
    if (!profile) {
      onRequireSignIn();
      return false;
    }
    if (!isVerified) {
      onRequireVerify();
      return false;
    }
    return true;
  };

  const handleLike = async () => {
    if (!ensureEligible()) return;
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(!prevLiked);
    setLikesCount(prevLiked ? Math.max(0, prevCount - 1) : prevCount + 1);

    try {
      const res = await apiFetch(`/api/posts/${post.id}/like`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLiked(data.liked);
      setLikesCount(data.likesCount);
    } catch {
      setLiked(prevLiked);
      setLikesCount(prevCount);
    }
  };

  const handleSave = async () => {
    if (!ensureEligible()) return;
    const prev = saved;
    setSaved(!prev);
    try {
      const res = await apiFetch(`/api/posts/${post.id}/save`, { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSaved(data.saved);
      onToast(data.saved ? 'Saved to your bookmarks.' : 'Removed from saved items.');
    } catch {
      setSaved(prev);
    }
  };

  const handleToggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      setLoadingComments(true);
      try {
        const res = await apiFetch(`/api/posts/${post.id}/comments`);
        if (res.ok) {
          const list = await res.json();
          setComments(list);
        }
      } finally {
        setLoadingComments(false);
      }
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ensureEligible() || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await apiFetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setCommentsCount((c) => c + 1);
        setCommentText('');
      }
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/?post=${post.id}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    onToast('Post link copied to clipboard.');
    setTimeout(() => setCopied(false), 1800);
  };

  const authorName = post.author?.displayName || 'Campus Member';
  const roleLabel =
    post.author?.role === 'faculty'
      ? 'Faculty'
      : post.author?.role === 'alumni'
      ? 'Alumni'
      : post.author?.role === 'admin' || post.author?.role === 'moderator'
      ? 'Campus Lead'
      : 'Student';

  return (
    <article className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5 transition-colors">
      {/* Unboxed inline metadata header (Zero-Pill Discipline) */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => post.author && onOpenProfile(post.author.id)}
            className="shrink-0 rounded-full"
          >
            <Avatar src={post.author?.avatarUrl} name={authorName} size="md" />
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
              <button
                type="button"
                onClick={() => post.author && onOpenProfile(post.author.id)}
                className="font-bold text-[#17152B] dark:text-[#F1F2F9] hover:text-[#5B4BFF] truncate"
              >
                {authorName}
              </button>
              <span className="text-[#9CA0B8]" aria-hidden="true">·</span>
              <span className="text-xs font-medium text-[#5B4BFF] dark:text-[#A59BFF]">
                {roleLabel}
              </span>
              <span className="text-[#9CA0B8]" aria-hidden="true">·</span>
              <span className="text-xs text-[#6A6784] dark:text-[#9CA0B8] tabular-nums">
                {formatRelativeTime(post.createdAt)}
              </span>
            </div>
            <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8] truncate">
              {post.author?.headline || post.author?.branch || 'Campus Member'}
            </p>
          </div>
        </div>

        {(isOwner || isModerator) && (
          <div className="flex items-center gap-1 shrink-0">
            {isOwner && (
              <button
                type="button"
                onClick={() => onEditPost(post)}
                aria-label="Edit post"
                className="p-2 rounded-lg text-[#6A6784] hover:text-[#5B4BFF] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete post"
                className="p-2 rounded-lg text-[#6A6784] hover:text-red-600 hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onDeletePost(post.id)}
                  className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 rounded-lg text-xs text-[#6A6784]"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Category & Context Metadata as quiet text line */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6A6784] dark:text-[#9CA0B8]">
        <span className="font-semibold text-[#5B4BFF] dark:text-[#A59BFF]">
          {POST_CATEGORY_LABELS[post.category] || post.category}
        </span>
        {post.contextLabel && (
          <>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-[#3F3C56] dark:text-[#C5C7D9]">
              {post.contextLabel}
            </span>
          </>
        )}
        {post.tags.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{post.tags.map((t) => `#${t}`).join('  ')}</span>
          </>
        )}
      </div>

      {/* Title & Body */}
      <h3 className="mt-2 text-[17px] font-bold leading-snug text-[#17152B] dark:text-[#F1F2F9]">
        {post.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-[#3F3C56] dark:text-[#C5C7D9] whitespace-pre-line">
        {post.content}
      </p>

      {post.externalLink && (
        <a
          href={post.externalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B4BFF] hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open External Reference
        </a>
      )}

      {/* Attachments */}
      {post.attachments.length > 0 && (
        <div className="mt-3.5 space-y-2">
          {post.attachments.map((att) => (
            <AuthenticatedAttachment
              key={att.id}
              attachment={att}
              isVerified={Boolean(isVerified)}
              onRequireAuth={() => {
                if (!profile) onRequireSignIn();
                else onRequireVerify();
              }}
            />
          ))}
        </div>
      )}

      {/* Action Bar */}
      <div className="mt-4 pt-3 border-t border-[#E3E1EE] dark:border-[#23273A] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={handleLike}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              liked
                ? 'text-[#DD2A7B] bg-[#FFF0F6] dark:bg-[#2B1523]'
                : 'text-[#6A6784] dark:text-[#9CA0B8] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]'
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
            <span className="tabular-nums">{likesCount}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleComments}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#6A6784] dark:text-[#9CA0B8] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030] transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="tabular-nums">{commentsCount}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              saved
                ? 'text-[#5B4BFF] bg-[#ECEBFF] dark:bg-[#232048]'
                : 'text-[#6A6784] dark:text-[#9CA0B8] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${saved ? 'fill-current' : ''}`} />
            <span>{saved ? 'Saved' : 'Save'}</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label="Copy post link"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6A6784] dark:text-[#9CA0B8] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#13866B]" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Share'}</span>
          </button>

          {profile && !isOwner && (
            <button
              type="button"
              onClick={() =>
                onReport({ type: 'post', id: post.id, label: post.title.slice(0, 60) })
              }
              aria-label="Report post"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6A6784] dark:text-[#9CA0B8] hover:text-[#DD2A7B] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Comment Drawer */}
      {showComments && (
        <div className="mt-4 pt-3 border-t border-[#E3E1EE] dark:border-[#23273A] space-y-3">
          {loadingComments ? (
            <p className="text-xs text-[#6A6784]">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-[#6A6784]">No comments yet. Start the discussion.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <Avatar
                    src={c.author?.avatarUrl}
                    name={c.author?.displayName || 'Member'}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => c.author && onOpenProfile(c.author.id)}
                          className="font-semibold text-[#17152B] dark:text-[#F1F2F9] hover:text-[#5B4BFF]"
                        >
                          {c.author?.displayName || 'Member'}
                        </button>
                        <span className="text-[#9CA0B8]">·</span>
                        <span className="text-[#6A6784] dark:text-[#9CA0B8] tabular-nums">
                          {formatRelativeTime(c.createdAt)}
                        </span>
                      </div>
                      {profile && c.authorId !== profile.id && (
                        <button
                          type="button"
                          onClick={() =>
                            onReport({
                              type: 'comment',
                              id: c.id,
                              label: c.content.slice(0, 50),
                            })
                          }
                          className="text-[11px] text-[#6A6784] hover:text-[#DD2A7B]"
                        >
                          Report
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-[#3F3C56] dark:text-[#C5C7D9]">
                      {c.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddComment} className="flex gap-2 pt-1">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={
                isVerified
                  ? 'Add a helpful reply or question...'
                  : 'Verify college membership to join discussions'
              }
              disabled={!isVerified}
              className="flex-1 rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs text-[#17152B] dark:text-[#F1F2F9] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!isVerified || submittingComment || !commentText.trim()}
              className="px-4 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold hover:bg-[#4B3CE8] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {submittingComment ? 'Posting...' : 'Reply'}
            </button>
          </form>
        </div>
      )}
    </article>
  );
};
