import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Search, UserCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserProfile } from '../types/campus';
import { Avatar } from './Avatar';

interface DiscoverViewProps {
  onOpenProfile: (userId: number) => void;
  onStartMessage: (userId: number) => void;
  onRequireSignIn: () => void;
  onRequireVerify: () => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  onOpenProfile,
  onStartMessage,
  onRequireSignIn,
  onRequireVerify,
}) => {
  const { profile, apiFetch } = useAuth();
  const [people, setPeople] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'all' | 'student' | 'faculty' | 'alumni'>('all');
  const [branch, setBranch] = useState('');

  const loadPeople = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (role !== 'all') params.set('role', role);
      if (branch.trim()) params.set('branch', branch.trim());

      const res = await apiFetch(`/api/discover/people?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load directory');
      const data = await res.json();
      setPeople(data);
    } catch {
      setError('Unable to load campus members right now.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, q, role, branch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPeople();
    }, 180);
    return () => clearTimeout(timer);
  }, [loadPeople]);

  const handleToggleFollow = async (targetId: number) => {
    if (!profile) {
      onRequireSignIn();
      return;
    }
    if (profile.verificationStatus !== 'verified') {
      onRequireVerify();
      return;
    }

    setPeople((prev) =>
      prev.map((p) => (p.id === targetId ? { ...p, isFollowing: !p.isFollowing } : p))
    );

    const res = await apiFetch(`/api/users/${targetId}/follow`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setPeople((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, isFollowing: data.following } : p))
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5">
        <h1 className="text-xl font-bold text-[#17152B] dark:text-[#F1F2F9]">
          Discover Campus Network
        </h1>
        <p className="mt-1 text-xs text-[#6A6784] dark:text-[#9CA0B8]">
          Connect with verified students, faculty advisors, and alumni mentors across departments.
        </p>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-[#6A6784] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, skill (Go, PyTorch, VLSI), or headline..."
              className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] pl-10 pr-3.5 py-2.5 text-sm text-[#17152B] dark:text-[#F1F2F9]"
            />
          </div>
          <input
            type="text"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="Filter branch (e.g., Computer Science)"
            className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2.5 text-sm text-[#17152B] dark:text-[#F1F2F9]"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(['all', 'student', 'faculty', 'alumni'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setRole(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap shrink-0 ${
                role === tab
                  ? 'bg-[#5B4BFF] text-white'
                  : 'bg-[#F5F5FA] dark:bg-[#0E101A] text-[#6A6784] dark:text-[#9CA0B8] hover:text-[#17152B] dark:hover:text-[#F1F2F9]'
              }`}
            >
              {tab === 'all' ? 'All Members' : tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-44 rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-8 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            type="button"
            onClick={loadPeople}
            className="mt-3 px-4 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : people.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-10 text-center">
          <p className="text-sm font-semibold text-[#17152B] dark:text-[#F1F2F9]">
            No matching campus members found
          </p>
          <p className="mt-1 text-xs text-[#6A6784] dark:text-[#9CA0B8]">
            Try clearing the branch filter or searching a broader skill keyword.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {people.map((person) => {
            const isSelf = profile?.id === person.id;
            return (
              <div
                key={person.id}
                className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => onOpenProfile(person.id)}
                      className="shrink-0 rounded-full"
                    >
                      <Avatar src={person.avatarUrl} name={person.displayName} size="lg" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpenProfile(person.id)}
                        className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9] hover:text-[#5B4BFF] truncate block text-left"
                      >
                        {person.displayName}
                      </button>
                      <p className="text-xs font-medium text-[#5B4BFF] dark:text-[#A59BFF] capitalize">
                        {person.role}
                        {person.branch ? ` · ${person.branch}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-[#6A6784] dark:text-[#9CA0B8] line-clamp-2">
                        {person.headline}
                      </p>
                    </div>
                  </div>

                  {person.skills.length > 0 && (
                    <p className="mt-3 text-xs text-[#3F3C56] dark:text-[#C5C7D9] truncate">
                      {person.skills.slice(0, 5).join(' · ')}
                    </p>
                  )}
                </div>

                {!isSelf && (
                  <div className="flex items-center gap-2 pt-3 border-t border-[#E3E1EE] dark:border-[#23273A]">
                    <button
                      type="button"
                      onClick={() => handleToggleFollow(person.id)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                        person.isFollowing
                          ? 'bg-[#F5F5FA] dark:bg-[#1C2030] text-[#17152B] dark:text-[#F1F2F9]'
                          : 'bg-[#5B4BFF] text-white hover:bg-[#4B3CE8]'
                      }`}
                    >
                      {person.isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5" />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          Follow
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!profile) onRequireSignIn();
                        else if (profile.verificationStatus !== 'verified') onRequireVerify();
                        else onStartMessage(person.id);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-[#E3E1EE] dark:border-[#23273A] text-xs font-semibold text-[#17152B] dark:text-[#F1F2F9] hover:border-[#5B4BFF] whitespace-nowrap"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      Message
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
