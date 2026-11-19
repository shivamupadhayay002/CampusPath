import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  Compass,
  Home,
  LogOut,
  MessageSquare,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { AdminConsoleView } from './components/AdminConsoleView';
import { AuthModal } from './components/AuthModal';
import { Avatar } from './components/Avatar';
import { ComposerModal } from './components/ComposerModal';
import { DiscoverView } from './components/DiscoverView';
import { GuidelinesModal } from './components/GuidelinesModal';
import { MessagesView } from './components/MessagesView';
import { NotificationsView } from './components/NotificationsView';
import { PostCard } from './components/PostCard';
import { ProfileView } from './components/ProfileView';
import { ReportModal } from './components/ReportModal';
import { VerificationModal } from './components/VerificationModal';
import { useAuth } from './context/AuthContext';
import {
  POST_CATEGORY_LABELS,
  PostCategory,
  PostItem,
  UserProfile,
} from './types/campus';

type ActiveTab =
  | 'feed'
  | 'discover'
  | 'messages'
  | 'saved'
  | 'notifications'
  | 'profile'
  | 'admin';

const CATEGORIES = Object.keys(POST_CATEGORY_LABELS) as PostCategory[];
const CAMPUS_BANNER_PATH = '/src/assets/images/campus_hero_banner_1794991315375.jpg';

export default function App() {
  const {
    profile,
    college,
    unreadNotifications,
    followersCount,
    followingCount,
    loading: authLoading,
    authError,
    signOut,
    refreshMe,
    apiFetch,
  } = useAuth();

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const stored = localStorage.getItem('campuspath_theme');
    return stored === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('campuspath_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  const navigateToTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Feed State
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [restrictedMode, setRestrictedMode] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<PostCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [followingOnly, setFollowingOnly] = useState(false);

  // Sidebar Suggested Mentors & Peers
  const [suggestedPeople, setSuggestedPeople] = useState<UserProfile[]>([]);

  // Modals & Toast
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<PostItem | null>(null);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  const openAuthModal = useCallback((mode: 'signin' | 'signup' = 'signin') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }, []);
  const [reportTarget, setReportTarget] = useState<{
    type: 'post' | 'comment' | 'user' | 'message';
    id: number;
    label: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const loadFeed = useCallback(
    async (offset = 0, append = false) => {
      if (append) setLoadingMore(true);
      else setFeedLoading(true);
      setFeedError(null);

      try {
        const params = new URLSearchParams();
        params.set('limit', '10');
        params.set('offset', String(offset));
        if (selectedCategory !== 'all') params.set('category', selectedCategory);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (activeTab === 'saved') params.set('savedOnly', 'true');
        if (followingOnly && activeTab === 'feed') params.set('followingOnly', 'true');

        const res = await apiFetch(`/api/feed?${params.toString()}`);
        if (!res.ok) throw new Error('Unable to fetch feed');
        const data = await res.json();
        setPosts((prev) => (append ? [...prev, ...data.items] : data.items));
        setHasMore(Boolean(data.hasMore));
        setRestrictedMode(Boolean(data.restrictedMode));
      } catch {
        setFeedError('Could not load campus posts. Please retry.');
      } finally {
        setFeedLoading(false);
        setLoadingMore(false);
      }
    },
    [apiFetch, selectedCategory, searchQuery, activeTab, followingOnly]
  );

  useEffect(() => {
    if (activeTab === 'feed' || activeTab === 'saved') {
      const timer = setTimeout(() => {
        loadFeed(0, false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeTab, loadFeed, profile?.id, profile?.verificationStatus]);

  useEffect(() => {
    apiFetch('/api/discover/people')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: UserProfile[]) => setSuggestedPeople(list.slice(0, 4)))
      .catch(() => {});
  }, [apiFetch, profile?.id]);

  const handleOpenProfile = (userId: number) => {
    setSelectedProfileId(userId);
    setActiveTab('profile');
  };

  const handleStartMessage = async (userId: number) => {
    const res = await apiFetch('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not start conversation.');
      return;
    }
    setActiveConversationId(data.conversationId);
    setActiveTab('messages');
  };

  const handleDeletePost = async (postId: number) => {
    const res = await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
    if (res.ok) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      showToast('Post deleted.');
    }
  };

  const handlePrimaryCta = () => {
    if (!profile) {
      openAuthModal('signin');
      return;
    }
    if (profile.verificationStatus !== 'verified') {
      setVerifyModalOpen(true);
      return;
    }
    setEditingPost(null);
    setComposerOpen(true);
  };

  const isPrivileged = profile?.role === 'admin' || profile?.role === 'moderator';
  const isVerified = profile?.verificationStatus === 'verified';

  return (
    <div className="fixed inset-0 lg:static lg:inset-auto lg:h-auto lg:min-h-screen flex flex-col overflow-hidden lg:overflow-visible bg-[#F5F5FA] dark:bg-[#0B0D14] text-[#17152B] dark:text-[#F1F2F9]">
      {/* Strict 3-Zone Top Bar Contract (always pinned at top on phone, tablet, and desktop) */}
      <header className="w-full shrink-0 lg:sticky lg:top-0 z-40 pt-[env(safe-area-inset-top)] bg-white dark:bg-[#131622] lg:bg-white/95 lg:dark:bg-[#131622]/95 lg:backdrop-blur-md border-b border-[#E3E1EE] dark:border-[#23273A]">
        <div className="max-w-[1280px] mx-auto h-14 lg:h-16 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-4 lg:gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => navigateToTab('feed')}
            className="inline-flex items-center text-lg sm:text-xl font-extrabold tracking-tight whitespace-nowrap shrink-0 text-left text-[#17152B] dark:text-[#F1F2F9]"
          >
            <span>Campus</span>
            <span className="campus-gradient-text inline-block">Path</span>
          </button>

          {/* Zone 2: 4-5 Single-Line Navigation Links (desktop; phone/tablet use persistent bottom nav) */}
          <nav
            aria-label="Primary"
            className="hidden lg:flex items-center gap-6 text-sm font-semibold"
          >
            <button
              type="button"
              onClick={() => setActiveTab('feed')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                activeTab === 'feed'
                  ? 'border-[#5B4BFF] text-[#5B4BFF] dark:text-[#A59BFF]'
                  : 'border-transparent text-[#6A6784] dark:text-[#9CA0B8] hover:text-[#17152B] dark:hover:text-[#F1F2F9]'
              }`}
            >
              Feed
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                activeTab === 'discover'
                  ? 'border-[#5B4BFF] text-[#5B4BFF] dark:text-[#A59BFF]'
                  : 'border-transparent text-[#6A6784] dark:text-[#9CA0B8] hover:text-[#17152B] dark:hover:text-[#F1F2F9]'
              }`}
            >
              Discover
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('messages')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                activeTab === 'messages'
                  ? 'border-[#5B4BFF] text-[#5B4BFF] dark:text-[#A59BFF]'
                  : 'border-transparent text-[#6A6784] dark:text-[#9CA0B8] hover:text-[#17152B] dark:hover:text-[#F1F2F9]'
              }`}
            >
              Messages
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                activeTab === 'saved'
                  ? 'border-[#5B4BFF] text-[#5B4BFF] dark:text-[#A59BFF]'
                  : 'border-transparent text-[#6A6784] dark:text-[#9CA0B8] hover:text-[#17152B] dark:hover:text-[#F1F2F9]'
              }`}
            >
              Saved
            </button>
            {isPrivileged && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  activeTab === 'admin'
                    ? 'border-[#5B4BFF] text-[#5B4BFF] dark:text-[#A59BFF]'
                    : 'border-transparent text-[#6A6784] dark:text-[#9CA0B8] hover:text-[#17152B] dark:hover:text-[#F1F2F9]'
                }`}
              >
                Admin
              </button>
            )}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handlePrimaryCta}
              className="px-3.5 sm:px-4 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs sm:text-sm font-semibold hover:bg-[#4B3CE8] transition-colors whitespace-nowrap shrink-0"
            >
              {!profile ? 'Sign In' : isVerified ? 'New Post' : 'Verify College'}
            </button>
          </div>
        </div>
      </header>

      {/* Scrollable Body Shell (locked between header & bottom nav on phone/tablet) */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain lg:overflow-visible"
      >
        {/* Main 3-Column Campus Layout */}
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-5 pb-6 lg:pb-8 grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_290px] gap-6 items-start">
        {/* Left Sidebar: Profile Summary + Category Filter + Workspace Controls */}
        <aside className="hidden lg:block sticky top-22 space-y-4">
          <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-4 space-y-4">
            {authLoading ? (
              <div className="h-28 animate-pulse" />
            ) : profile ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar src={profile.avatarUrl} name={profile.displayName} size="md" />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => handleOpenProfile(profile.id)}
                      className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9] hover:text-[#5B4BFF] truncate block text-left"
                    >
                      {profile.displayName}
                    </button>
                    <p className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8] capitalize truncate">
                      {profile.role} · {profile.verificationStatus}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#E3E1EE] dark:border-[#23273A] text-xs">
                  <div>
                    <p className="font-bold text-[#17152B] dark:text-[#F1F2F9] tabular-nums">
                      {followersCount}
                    </p>
                    <p className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8]">Followers</p>
                  </div>
                  <div>
                    <p className="font-bold text-[#17152B] dark:text-[#F1F2F9] tabular-nums">
                      {followingCount}
                    </p>
                    <p className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8]">Following</p>
                  </div>
                </div>

                <div className="space-y-1 pt-2 border-t border-[#E3E1EE] dark:border-[#23273A]">
                  <button
                    type="button"
                    onClick={() => handleOpenProfile(profile.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
                  >
                    <User className="w-3.5 h-3.5" />
                    My Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('notifications')}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-[#3F3C56] dark:text-[#C5C7D9] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
                  >
                    <span className="flex items-center gap-2">
                      <Bell className="w-3.5 h-3.5" />
                      Notifications
                    </span>
                    {unreadNotifications > 0 && (
                      <span className="text-[11px] font-bold text-[#5B4BFF] tabular-nums">
                        {unreadNotifications}
                      </span>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
                  Join Your Campus Network
                </p>
                <p className="text-xs leading-relaxed text-[#6A6784] dark:text-[#9CA0B8]">
                  Sign up with your student Gmail or college email to share study guides, interview
                  prep, and connect directly with peers and alumni.
                </p>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => openAuthModal('signup')}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold hover:bg-[#4B3CE8]"
                  >
                    Sign Up with Student Gmail
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuthModal('signin')}
                    className="w-full py-2 px-4 rounded-xl border border-[#E3E1EE] dark:border-[#23273A] text-xs font-semibold text-[#17152B] dark:text-[#F1F2F9] hover:border-[#5B4BFF]"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-[#E3E1EE] dark:border-[#23273A] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#6A6784] dark:text-[#9CA0B8] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                {darkMode ? 'Light Theme' : 'Dark Theme'}
              </button>
              {profile && (
                <button
                  type="button"
                  onClick={signOut}
                  aria-label="Sign out"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#6A6784] hover:text-red-600"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              )}
            </div>
          </div>

          {/* Categories Filter Rail */}
          <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-3">
            <p className="px-2.5 py-1.5 text-xs font-bold text-[#6A6784] dark:text-[#9CA0B8]">
              Topics
            </p>
            <div className="space-y-0.5 mt-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setActiveTab('feed');
                }}
                className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  selectedCategory === 'all' && activeTab === 'feed'
                    ? 'bg-[#ECEBFF] dark:bg-[#232048] text-[#5B4BFF] dark:text-[#A59BFF]'
                    : 'text-[#3F3C56] dark:text-[#C5C7D9] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]'
                }`}
              >
                All Campus Posts
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setActiveTab('feed');
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                    selectedCategory === cat && activeTab === 'feed'
                      ? 'bg-[#ECEBFF] dark:bg-[#232048] text-[#5B4BFF] dark:text-[#A59BFF]'
                      : 'text-[#3F3C56] dark:text-[#C5C7D9] hover:bg-[#F5F5FA] dark:hover:bg-[#1C2030]'
                  }`}
                >
                  {POST_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Workspace */}
        <main className="min-w-0 space-y-4">
          {/* Mobile Quick Controls (non-sticky so sticky chrome stays <= 15%) */}
          <div className="flex lg:hidden items-center justify-between gap-2 overflow-x-auto pb-1">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('saved')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                  activeTab === 'saved'
                    ? 'bg-[#5B4BFF] text-white'
                    : 'bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] text-[#3F3C56] dark:text-[#C5C7D9]'
                }`}
              >
                Saved
              </button>
              {profile && (
                <button
                  type="button"
                  onClick={() => setActiveTab('notifications')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                    activeTab === 'notifications'
                      ? 'bg-[#5B4BFF] text-white'
                      : 'bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] text-[#3F3C56] dark:text-[#C5C7D9]'
                  }`}
                >
                  Alerts{unreadNotifications > 0 ? ` (${unreadNotifications})` : ''}
                </button>
              )}
              {isPrivileged && (
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                    activeTab === 'admin'
                      ? 'bg-[#5B4BFF] text-white'
                      : 'bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] text-[#3F3C56] dark:text-[#C5C7D9]'
                  }`}
                >
                  Admin
                </button>
              )}
              <button
                type="button"
                onClick={() => setGuidelinesOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] text-[#3F3C56] dark:text-[#C5C7D9]"
              >
                Rules
              </button>
            </div>
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle theme"
              className="p-2 rounded-lg bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] text-[#6A6784] shrink-0"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>

          {authError && (
            <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-4 text-xs text-red-700 dark:text-red-300">
              {authError}
            </div>
          )}

          {/* Verification Status Gate Banner */}
          {profile && !isVerified && (
            <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
                  {profile.verificationStatus === 'pending'
                    ? 'College Verification Under Review'
                    : 'Complete College Verification to Unlock Full Campus Access'}
                </p>
                <p className="mt-0.5 text-xs text-[#6A6784] dark:text-[#9CA0B8]">
                  {profile.verificationStatus === 'pending'
                    ? 'Administrators are reviewing your enrollment request. You can still verify instantly with an institutional email code.'
                    : 'Unverified accounts only preview public highlights. Verify via college email or admin review to post, download materials, and message peers.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVerifyModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Verify Now
              </button>
            </div>
          )}

          {(activeTab === 'feed' || activeTab === 'saved') && (
            <>
              {/* Feed Toolbar & Search */}
              <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-[#6A6784] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search study notes, interview rounds, courses, or tags..."
                      className="w-full rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] pl-10 pr-3.5 py-2.5 text-sm text-[#17152B] dark:text-[#F1F2F9]"
                    />
                  </div>

                  {activeTab === 'feed' && isVerified && (
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F5F5FA] dark:bg-[#0E101A] border border-[#E3E1EE] dark:border-[#23273A] shrink-0">
                      <button
                        type="button"
                        onClick={() => setFollowingOnly(false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                          !followingOnly
                            ? 'bg-white dark:bg-[#191D2E] text-[#17152B] dark:text-[#F1F2F9]'
                            : 'text-[#6A6784]'
                        }`}
                      >
                        Campus Feed
                      </button>
                      <button
                        type="button"
                        onClick={() => setFollowingOnly(true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                          followingOnly
                            ? 'bg-white dark:bg-[#191D2E] text-[#17152B] dark:text-[#F1F2F9]'
                            : 'text-[#6A6784]'
                        }`}
                      >
                        Following
                      </button>
                    </div>
                  )}
                </div>

                {/* Mobile/Tablet Category Filter */}
                <div className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                      selectedCategory === 'all'
                        ? 'bg-[#5B4BFF] text-white'
                        : 'bg-[#F5F5FA] dark:bg-[#0E101A] text-[#6A6784]'
                    }`}
                  >
                    All
                  </button>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-[#5B4BFF] text-white'
                          : 'bg-[#F5F5FA] dark:bg-[#0E101A] text-[#6A6784]'
                      }`}
                    >
                      {POST_CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>

                {restrictedMode && activeTab === 'feed' && (
                  <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8]">
                    Showing public campus highlights.{' '}
                    <button
                      type="button"
                      onClick={() => (!profile ? openAuthModal('signup') : setVerifyModalOpen(true))}
                      className="font-semibold text-[#5B4BFF] hover:underline"
                    >
                      {!profile ? 'Sign in & verify' : 'Verify your college membership'}
                    </button>{' '}
                    to access full study packets, attachments, and peer discussions.
                  </p>
                )}
              </div>

              {feedLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-48 rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] animate-pulse"
                    />
                  ))}
                </div>
              ) : feedError ? (
                <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-8 text-center">
                  <p className="text-sm text-red-600 dark:text-red-400">{feedError}</p>
                  <button
                    type="button"
                    onClick={() => loadFeed(0, false)}
                    className="mt-3 px-4 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold"
                  >
                    Retry
                  </button>
                </div>
              ) : posts.length === 0 ? (
                <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-10 text-center space-y-2">
                  <p className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9]">
                    {activeTab === 'saved'
                      ? 'No saved posts yet'
                      : 'No campus posts match your filters'}
                  </p>
                  <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8]">
                    {activeTab === 'saved'
                      ? 'Bookmark study sheets, interview breakdowns, or internship posts to review them here.'
                      : 'Try another category or share the first guide for this topic.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      onOpenProfile={handleOpenProfile}
                      onRequireSignIn={() => openAuthModal('signin')}
                      onRequireVerify={() => setVerifyModalOpen(true)}
                      onEditPost={(p) => {
                        setEditingPost(p);
                        setComposerOpen(true);
                      }}
                      onDeletePost={handleDeletePost}
                      onReport={(t) => setReportTarget(t)}
                      onToast={showToast}
                    />
                  ))}

                  {hasMore && (
                    <div className="flex justify-center pt-2">
                      <button
                        type="button"
                        disabled={loadingMore}
                        onClick={() => loadFeed(posts.length, true)}
                        className="px-5 py-2.5 rounded-xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] text-xs font-semibold text-[#17152B] dark:text-[#F1F2F9] hover:border-[#5B4BFF] disabled:opacity-50"
                      >
                        {loadingMore ? 'Loading more...' : 'Load More Posts'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'discover' && (
            <DiscoverView
              onOpenProfile={handleOpenProfile}
              onStartMessage={handleStartMessage}
              onRequireSignIn={() => openAuthModal('signin')}
              onRequireVerify={() => setVerifyModalOpen(true)}
            />
          )}

          {activeTab === 'messages' && (
            <MessagesView
              initialConversationId={activeConversationId}
              onOpenProfile={handleOpenProfile}
              onReport={(t) => setReportTarget(t)}
              onRequireSignIn={() => openAuthModal('signin')}
              onRequireVerify={() => setVerifyModalOpen(true)}
              onToast={showToast}
            />
          )}

          {activeTab === 'notifications' && profile && (
            <NotificationsView onRefreshMe={refreshMe} />
          )}

          {activeTab === 'profile' && (selectedProfileId || profile) && (
            <ProfileView
              userId={selectedProfileId || profile!.id}
              onStartMessage={handleStartMessage}
              onOpenVerify={() => setVerifyModalOpen(true)}
              onReport={(t) => setReportTarget(t)}
              onToast={showToast}
            />
          )}

          {activeTab === 'admin' && <AdminConsoleView onToast={showToast} />}
        </main>

        {/* Right Sidebar: Campus Showcase & Suggested Peers */}
        <aside className="hidden lg:block sticky top-22 space-y-4">
          <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] overflow-hidden">
            <div className="relative aspect-16/9 w-full bg-[#17152B]">
              <img
                src={CAMPUS_BANNER_PATH}
                alt={college?.name ? `${college.name} campus courtyard` : 'CampusPath student community courtyard'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-4">
                <p className="text-xs font-semibold text-white/80">Campus Community</p>
                <p className="text-sm font-bold text-white">
                  {college?.name ||
                    (profile?.verificationStatus === 'verified'
                      ? 'CampusPath Network'
                      : 'Verify to join your campus')}
                </p>
              </div>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-xs leading-relaxed text-[#6A6784] dark:text-[#9CA0B8]">
                A verified space for study materials, internship referrals, and peer interview
                mentorship.
              </p>
              <button
                type="button"
                onClick={() => setGuidelinesOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B4BFF] hover:underline"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Community Guidelines &amp; Privacy
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-[#6A6784] dark:text-[#9CA0B8]">
                Peers, Faculty &amp; Alumni
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('discover')}
                className="text-xs font-semibold text-[#5B4BFF] hover:underline"
              >
                View all
              </button>
            </div>

            <div className="space-y-3">
              {suggestedPeople.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => handleOpenProfile(person.id)}
                  className="w-full flex items-center gap-2.5 text-left group"
                >
                  <Avatar src={person.avatarUrl} name={person.displayName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[#17152B] dark:text-[#F1F2F9] group-hover:text-[#5B4BFF] truncate">
                      {person.displayName}
                    </p>
                    <p className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8] capitalize truncate">
                      {person.role} · {person.branch}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <footer className="px-2 text-[11px] text-[#6A6784] dark:text-[#9CA0B8] space-y-1">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => setGuidelinesOpen(true)}
                className="hover:underline"
              >
                Rules &amp; Privacy
              </button>
              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                className="hover:underline"
              >
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
            <p>CampusPath · Verified Student Community</p>
          </footer>
        </aside>
        </div>
      </div>

      {/* Persistent Phone & Tablet Bottom Navigation (always pinned at bottom of 100dvh shell) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden shrink-0 z-40 min-h-14 pb-[env(safe-area-inset-bottom)] bg-white dark:bg-[#131622] border-t border-[#E3E1EE] dark:border-[#23273A] shadow-[0_-2px_10px_rgba(23,21,43,0.06)] dark:shadow-[0_-2px_12px_rgba(0,0,0,0.35)] grid grid-cols-5"
      >
        <button
          type="button"
          onClick={() => navigateToTab('feed')}
          className={`min-h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'feed'
              ? 'text-[#5B4BFF] dark:text-[#A59BFF]'
              : 'text-[#6A6784] dark:text-[#9CA0B8]'
          }`}
        >
          <Home className="w-4 h-4" />
          <span>Feed</span>
        </button>
        <button
          type="button"
          onClick={() => navigateToTab('discover')}
          className={`min-h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'discover'
              ? 'text-[#5B4BFF] dark:text-[#A59BFF]'
              : 'text-[#6A6784] dark:text-[#9CA0B8]'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Discover</span>
        </button>
        <button
          type="button"
          onClick={handlePrimaryCta}
          className="min-h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#5B4BFF] dark:text-[#A59BFF] whitespace-nowrap"
        >
          <Plus className="w-5 h-5" />
          <span>Post</span>
        </button>
        <button
          type="button"
          onClick={() => navigateToTab('messages')}
          className={`min-h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'messages'
              ? 'text-[#5B4BFF] dark:text-[#A59BFF]'
              : 'text-[#6A6784] dark:text-[#9CA0B8]'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Messages</span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (!profile) openAuthModal('signin');
            else {
              handleOpenProfile(profile.id);
              scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          className={`min-h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'profile'
              ? 'text-[#5B4BFF] dark:text-[#A59BFF]'
              : 'text-[#6A6784] dark:text-[#9CA0B8]'
          }`}
        >
          <User className="w-4 h-4" />
          <span>{profile ? 'Profile' : 'Sign In'}</span>
        </button>
      </nav>

      {/* Modals */}
      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(msg) => showToast(msg)}
      />

      <ComposerModal
        open={composerOpen}
        editingPost={editingPost}
        onClose={() => {
          setComposerOpen(false);
          setEditingPost(null);
        }}
        onSaved={(savedPost, isEdit) => {
          if (isEdit) {
            setPosts((prev) => prev.map((p) => (p.id === savedPost.id ? savedPost : p)));
            showToast('Post updated.');
          } else {
            setPosts((prev) => [savedPost, ...prev]);
            showToast('Published to CampusPath.');
          }
        }}
      />

      <VerificationModal
        open={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        onVerified={() => {
          showToast('College membership verified!');
          loadFeed(0, false);
        }}
      />

      <GuidelinesModal open={guidelinesOpen} onClose={() => setGuidelinesOpen(false)} />

      <ReportModal
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onSubmitted={(msg) => showToast(msg)}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 rounded-xl bg-[#17152B] dark:bg-white text-white dark:text-[#17152B] px-4 py-2.5 text-xs font-semibold shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
