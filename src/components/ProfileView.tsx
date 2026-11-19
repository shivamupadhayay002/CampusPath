import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Ban,
  ExternalLink,
  Flag,
  FolderGit2,
  MessageSquare,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  AchievementItem,
  POST_CATEGORY_LABELS,
  PostCategory,
  PrivacySettings,
  ProjectItem,
  UserProfile,
} from '../types/campus';
import { Avatar } from './Avatar';

interface ProfileViewProps {
  userId: number;
  onStartMessage: (userId: number) => void;
  onOpenVerify: () => void;
  onReport: (target: { type: 'user'; id: number; label: string }) => void;
  onToast: (msg: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userId,
  onStartMessage,
  onOpenVerify,
  onReport,
  onToast,
}) => {
  const { profile: me, apiFetch, refreshMe, signOut } = useAuth();
  const isSelf = me?.id === userId;

  const [member, setMember] = useState<UserProfile | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [memberPosts, setMemberPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [branch, setBranch] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [bio, setBio] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [privacy, setPrivacy] = useState<PrivacySettings>({
    showEmail: false,
    showLinkedIn: true,
    showAcademicYear: true,
    allowMessagesFrom: 'college',
  });
  const [saving, setSaving] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/users/${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setMember(data.user);
      setFollowersCount(data.followersCount);
      setFollowingCount(data.followingCount);
      setIsFollowing(data.isFollowing);
      setIsBlocked(data.isBlocked);
      setMemberPosts(data.posts || []);

      if (isSelf && data.user) {
        setDisplayName(data.user.displayName);
        setHeadline(data.user.headline || '');
        setBranch(data.user.branch || '');
        setAcademicYear(data.user.academicYear || '');
        setBio(data.user.bio || '');
        setLinkedinUrl(data.user.linkedinUrl || '');
        setSkillsText((data.user.skills || []).join(', '));
        setProjects(data.user.projects || []);
        setAchievements(data.user.achievements || []);
        if (me?.privacySettings) setPrivacy(me.privacySettings);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch, userId, isSelf, me?.privacySettings]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const skills = skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiFetch('/api/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName,
          headline,
          branch,
          academicYear,
          bio,
          linkedinUrl,
          skills,
          projects,
          achievements,
          privacySettings: privacy,
        }),
      });
      if (res.ok) {
        await refreshMe();
        await loadProfile();
        setEditing(false);
        onToast('Profile saved.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFollow = async () => {
    const res = await apiFetch(`/api/users/${userId}/follow`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setIsFollowing(data.following);
      setFollowersCount((c) => (data.following ? c + 1 : Math.max(0, c - 1)));
    }
  };

  const handleToggleBlock = async () => {
    const res = await apiFetch(`/api/users/${userId}/block`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setIsBlocked(data.blocked);
      onToast(data.blocked ? 'Member blocked.' : 'Member unblocked.');
    }
  };

  const handleDeleteAccount = async () => {
    const res = await apiFetch('/api/me', { method: 'DELETE' });
    if (res.ok) {
      await signOut();
      onToast('Your CampusPath account has been permanently deleted.');
    }
  };

  if (loading) {
    return (
      <div className="h-64 rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-6 animate-pulse" />
    );
  }

  if (!member) {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-8 text-center">
        <p className="text-sm text-[#6A6784]">Profile not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar src={member.avatarUrl} name={member.displayName} size="xl" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-[#17152B] dark:text-[#F1F2F9]">
                  {member.displayName}
                </h1>
                {member.verificationStatus === 'verified' && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#13866B] dark:text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                    Verified Campus Member
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-[#3F3C56] dark:text-[#C5C7D9]">{member.headline}</p>
              <p className="mt-1.5 text-xs text-[#6A6784] dark:text-[#9CA0B8] tabular-nums">
                <span className="capitalize font-semibold text-[#5B4BFF] dark:text-[#A59BFF]">
                  {member.role}
                </span>
                {member.branch ? ` · ${member.branch}` : ''}
                {member.academicYear ? ` · ${member.academicYear}` : ''}
                {` · ${followersCount} followers · ${followingCount} following`}
              </p>
              {member.linkedinUrl && (
                <a
                  href={member.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#5B4BFF] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  LinkedIn Profile (Optional Identity Link)
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isSelf ? (
              <>
                {member.verificationStatus !== 'verified' && (
                  <button
                    type="button"
                    onClick={onOpenVerify}
                    className="px-4 py-2 rounded-xl bg-[#DD2A7B] text-white text-xs font-semibold"
                  >
                    Verify College
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(!editing)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold hover:bg-[#4B3CE8]"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {editing ? 'Close Editor' : 'Edit Profile'}
                </button>
              </>
            ) : me ? (
              <>
                <button
                  type="button"
                  onClick={handleToggleFollow}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold ${
                    isFollowing
                      ? 'bg-[#F5F5FA] dark:bg-[#1C2030] text-[#17152B] dark:text-[#F1F2F9]'
                      : 'bg-[#5B4BFF] text-white'
                  }`}
                >
                  {isFollowing ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
                <button
                  type="button"
                  onClick={() => onStartMessage(member.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E3E1EE] dark:border-[#23273A] text-xs font-semibold text-[#17152B] dark:text-[#F1F2F9]"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message
                </button>
                <button
                  type="button"
                  onClick={() => onReport({ type: 'user', id: member.id, label: member.displayName })}
                  aria-label="Report member"
                  className="p-2 rounded-xl border border-[#E3E1EE] dark:border-[#23273A] text-[#6A6784] hover:text-[#DD2A7B]"
                >
                  <Flag className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleToggleBlock}
                  aria-label={isBlocked ? 'Unblock member' : 'Block member'}
                  className={`p-2 rounded-xl border border-[#E3E1EE] dark:border-[#23273A] ${
                    isBlocked ? 'text-red-600' : 'text-[#6A6784] hover:text-red-600'
                  }`}
                >
                  <Ban className="w-3.5 h-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {member.bio && !editing && (
          <p className="mt-4 pt-4 border-t border-[#E3E1EE] dark:border-[#23273A] text-sm leading-relaxed text-[#3F3C56] dark:text-[#C5C7D9]">
            {member.bio}
          </p>
        )}

        {member.skills.length > 0 && !editing && (
          <div className="mt-4 pt-4 border-t border-[#E3E1EE] dark:border-[#23273A]">
            <h2 className="text-xs font-bold text-[#6A6784] dark:text-[#9CA0B8]">Skills &amp; Interests</h2>
            <p className="mt-1.5 text-sm font-medium text-[#17152B] dark:text-[#F1F2F9]">
              {member.skills.join(' · ')}
            </p>
          </div>
        )}
      </div>

      {/* Self Profile Editor */}
      {isSelf && editing && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-6 space-y-5"
        >
          <h2 className="text-base font-bold text-[#17152B] dark:text-[#F1F2F9]">
            Edit Academic Profile &amp; Privacy
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                Display Name
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                Headline
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                Branch / Department
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Computer Science & Engineering"
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                Academic Year / Cohort
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="Junior (3rd Year)"
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
              Bio
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                Skills (comma-separated)
              </label>
              <input
                type="text"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] mb-1">
                Optional LinkedIn URL
              </label>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/..."
                className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Projects Editor */}
          <div className="space-y-2 pt-2 border-t border-[#E3E1EE] dark:border-[#23273A]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#17152B] dark:text-[#F1F2F9]">Projects</span>
              <button
                type="button"
                onClick={() =>
                  setProjects((prev) => [
                    ...prev,
                    { id: String(Date.now()), title: '', description: '' },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B4BFF]"
              >
                <Plus className="w-3.5 h-3.5" /> Add Project
              </button>
            </div>
            {projects.map((p, idx) => (
              <div key={p.id} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
                <input
                  type="text"
                  placeholder="Project title"
                  value={p.title}
                  onChange={(e) =>
                    setProjects((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item))
                    )
                  }
                  className="rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  placeholder="Short description"
                  value={p.description}
                  onChange={(e) =>
                    setProjects((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, description: e.target.value } : item
                      )
                    )
                  }
                  className="sm:col-span-2 rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs"
                />
              </div>
            ))}
          </div>

          {/* Achievements Editor */}
          <div className="space-y-2 pt-2 border-t border-[#E3E1EE] dark:border-[#23273A]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#17152B] dark:text-[#F1F2F9]">
                Self-Listed Achievements
              </span>
              <button
                type="button"
                onClick={() =>
                  setAchievements((prev) => [
                    ...prev,
                    { id: String(Date.now()), title: '', issuer: '', date: '2026' },
                  ])
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B4BFF]"
              >
                <Plus className="w-3.5 h-3.5" /> Add Achievement
              </button>
            </div>
            {achievements.map((a, idx) => (
              <div key={a.id} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Achievement title"
                  value={a.title}
                  onChange={(e) =>
                    setAchievements((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item))
                    )
                  }
                  className="rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  placeholder="Organization / Event"
                  value={a.issuer}
                  onChange={(e) =>
                    setAchievements((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, issuer: e.target.value } : item))
                    )
                  }
                  className="rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  placeholder="Date (e.g., 2026-03)"
                  value={a.date}
                  onChange={(e) =>
                    setAchievements((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, date: e.target.value } : item))
                    )
                  }
                  className="rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3 py-2 text-xs"
                />
              </div>
            ))}
          </div>

          {/* Privacy Controls */}
          <div className="space-y-2 pt-2 border-t border-[#E3E1EE] dark:border-[#23273A]">
            <span className="text-xs font-bold text-[#17152B] dark:text-[#F1F2F9]">
              Profile Visibility &amp; Messaging Privacy
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#3F3C56] dark:text-[#C5C7D9]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={privacy.showAcademicYear}
                  onChange={(e) => setPrivacy({ ...privacy, showAcademicYear: e.target.checked })}
                />
                Show academic year on profile
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={privacy.showLinkedIn}
                  onChange={(e) => setPrivacy({ ...privacy, showLinkedIn: e.target.checked })}
                />
                Show optional LinkedIn link
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={privacy.showEmail}
                  onChange={(e) => setPrivacy({ ...privacy, showEmail: e.target.checked })}
                />
                Show email to college peers
              </label>
              <select
                value={privacy.allowMessagesFrom}
                onChange={(e) =>
                  setPrivacy({
                    ...privacy,
                    allowMessagesFrom: e.target.value as 'college' | 'followers',
                  })
                }
                className="rounded-lg border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-2.5 py-1.5 text-xs"
              >
                <option value="college">Messages from verified campus members</option>
                <option value="followers">Messages only from people I follow</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#E3E1EE] dark:border-[#23273A]">
            <div>
              {!confirmDeleteAccount ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAccount(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Account
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
                  >
                    Confirm Permanent Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAccount(false)}
                    className="text-xs text-[#6A6784]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#6A6784]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold hover:bg-[#4B3CE8] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Projects & Achievements */}
      {(member.projects.length > 0 || member.achievements.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
              <FolderGit2 className="w-4 h-4 text-[#5B4BFF]" />
              Projects
            </h2>
            {member.projects.length === 0 ? (
              <p className="mt-2 text-xs text-[#6A6784]">No projects listed yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {member.projects.map((proj) => (
                  <div key={proj.id} className="pt-2 first:pt-0 border-t first:border-t-0 border-[#E3E1EE] dark:border-[#23273A]">
                    <p className="text-sm font-semibold text-[#17152B] dark:text-[#F1F2F9]">
                      {proj.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[#6A6784] dark:text-[#9CA0B8]">
                      {proj.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
              <Award className="w-4 h-4 text-[#F58529]" />
              Achievements
            </h2>
            <p className="mt-0.5 text-[11px] text-[#6A6784] dark:text-[#9CA0B8]">
              Self-reported student milestones (not official registrar transcripts).
            </p>
            {member.achievements.length === 0 ? (
              <p className="mt-2 text-xs text-[#6A6784]">No achievements listed yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {member.achievements.map((ach) => (
                  <div key={ach.id} className="pt-2 first:pt-0 border-t first:border-t-0 border-[#E3E1EE] dark:border-[#23273A]">
                    <p className="text-sm font-semibold text-[#17152B] dark:text-[#F1F2F9]">
                      {ach.title}
                    </p>
                    <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8] tabular-nums">
                      {ach.issuer} · {ach.date}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Member's Recent Posts */}
      <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5">
        <h2 className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
          Recent Contributions
        </h2>
        {memberPosts.length === 0 ? (
          <p className="mt-2 text-xs text-[#6A6784]">No posts shared yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-[#E3E1EE] dark:divide-[#23273A]">
            {memberPosts.map((p) => (
              <div key={p.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-xs font-semibold text-[#5B4BFF]">
                  {POST_CATEGORY_LABELS[p.category as PostCategory] || p.category}
                  {p.contextLabel ? ` · ${p.contextLabel}` : ''}
                </p>
                <p className="mt-0.5 text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
                  {p.title}
                </p>
                <p className="mt-1 text-xs text-[#6A6784] dark:text-[#9CA0B8] line-clamp-2">
                  {p.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
