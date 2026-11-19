import React, { useCallback, useEffect, useState } from 'react';
import { Send, ShieldAlert, Ban } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ConversationSummary, MessageItem } from '../types/campus';
import { Avatar } from './Avatar';

interface MessagesViewProps {
  initialConversationId?: number | null;
  onOpenProfile: (userId: number) => void;
  onReport: (target: { type: 'user' | 'message'; id: number; label: string }) => void;
  onRequireSignIn: () => void;
  onRequireVerify: () => void;
  onToast: (msg: string) => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  initialConversationId,
  onOpenProfile,
  onReport,
  onRequireSignIn,
  onRequireVerify,
  onToast,
}) => {
  const { profile, apiFetch } = useAuth();
  const isVerified = profile?.verificationStatus === 'verified';

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(initialConversationId ?? null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!isVerified) {
      setLoadingList(false);
      return;
    }
    try {
      const res = await apiFetch('/api/conversations');
      if (res.ok) {
        const list: ConversationSummary[] = await res.json();
        setConversations(list);
        if (!selectedId && list.length > 0) {
          setSelectedId(list[0].id);
        }
      }
    } finally {
      setLoadingList(false);
    }
  }, [apiFetch, isVerified, selectedId]);

  useEffect(() => {
    if (initialConversationId) {
      setSelectedId(initialConversationId);
    }
  }, [initialConversationId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const loadMessages = useCallback(
    async (convId: number) => {
      setLoadingMsgs(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/conversations/${convId}/messages`);
        if (res.ok) {
          const list = await res.json();
          setMessages(list);
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
          );
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.error || 'Unable to load conversation.');
        }
      } finally {
        setLoadingMsgs(false);
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    if (selectedId && isVerified) {
      loadMessages(selectedId);
    }
  }, [selectedId, isVerified, loadMessages]);

  if (!profile) {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-[#17152B] dark:text-[#F1F2F9]">
          Sign in to message peers and alumni mentors
        </p>
        <button
          type="button"
          onClick={onRequireSignIn}
          className="px-4 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold hover:bg-[#4B3CE8]"
        >
          Sign In / Sign Up
        </button>
      </div>
    );
  }

  if (!isVerified) {
    return (
      <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-8 text-center space-y-3">
        <p className="text-base font-bold text-[#17152B] dark:text-[#F1F2F9]">
          Verification Required for Campus Messaging
        </p>
        <p className="text-xs text-[#6A6784] dark:text-[#9CA0B8] max-w-md mx-auto">
          To prevent spam and protect student privacy, direct messages are unlocked after
          verifying your college membership.
        </p>
        <button
          type="button"
          onClick={onRequireVerify}
          className="px-4 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold"
        >
          Verify Membership
        </button>
      </div>
    );
  }

  const activeConversation = conversations.find((c) => c.id === selectedId);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: draft.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send message.');
        return;
      }
      setMessages((prev) => [...prev, data.message]);
      setDraft('');
      loadConversations();
    } catch {
      setError('Network error while sending message.');
    } finally {
      setSending(false);
    }
  };

  const handleBlockPeer = async (peerId: number, name: string) => {
    const res = await apiFetch(`/api/users/${peerId}/block`, { method: 'POST' });
    if (res.ok) {
      onToast(`Blocked ${name}. You will no longer receive messages from them.`);
      setSelectedId(null);
      loadConversations();
    }
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] overflow-hidden grid grid-cols-1 md:grid-cols-3 min-h-[540px]">
      {/* Left Conversation List */}
      <div className="border-b md:border-b-0 md:border-r border-[#E3E1EE] dark:border-[#23273A] flex flex-col">
        <div className="p-4 border-b border-[#E3E1EE] dark:border-[#23273A]">
          <h1 className="text-base font-bold text-[#17152B] dark:text-[#F1F2F9]">Messages</h1>
          <p className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8]">
            Private 1:1 campus threads
          </p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#E3E1EE] dark:divide-[#23273A]">
          {loadingList ? (
            <p className="p-4 text-xs text-[#6A6784]">Loading conversations...</p>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-xs font-medium text-[#17152B] dark:text-[#F1F2F9]">
                No conversations yet
              </p>
              <p className="mt-1 text-[11px] text-[#6A6784] dark:text-[#9CA0B8]">
                Visit Discover to connect with seniors, classmates, or alumni mentors.
              </p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                type="button"
                onClick={() => setSelectedId(conv.id)}
                className={`w-full p-3.5 text-left flex items-center gap-3 transition-colors ${
                  conv.id === selectedId
                    ? 'bg-[#ECEBFF]/70 dark:bg-[#232048]/60'
                    : 'hover:bg-[#FAF9FF] dark:hover:bg-[#191D2E]'
                }`}
              >
                <Avatar
                  src={conv.peer?.avatarUrl}
                  name={conv.peer?.displayName || 'Member'}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#17152B] dark:text-[#F1F2F9] truncate">
                      {conv.peer?.displayName || 'Campus Member'}
                    </span>
                    {conv.unreadCount > 0 && (
                      <span className="text-[11px] font-bold text-[#5B4BFF] tabular-nums">
                        {conv.unreadCount} new
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#6A6784] dark:text-[#9CA0B8] truncate">
                    {conv.lastMessage?.content || 'Start the conversation'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right Active Thread */}
      <div className="md:col-span-2 flex flex-col">
        {!activeConversation ? (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <p className="text-sm font-semibold text-[#17152B] dark:text-[#F1F2F9]">
                Select a conversation
              </p>
              <p className="mt-1 text-xs text-[#6A6784] dark:text-[#9CA0B8]">
                Discuss study materials, request resume reviews, or coordinate campus projects.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-[#E3E1EE] dark:border-[#23273A] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => activeConversation.peer && onOpenProfile(activeConversation.peer.id)}
                className="flex items-center gap-2.5 text-left min-w-0"
              >
                <Avatar
                  src={activeConversation.peer?.avatarUrl}
                  name={activeConversation.peer?.displayName || 'Member'}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#17152B] dark:text-[#F1F2F9] truncate">
                    {activeConversation.peer?.displayName || 'Member'}
                  </p>
                  <p className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8] truncate">
                    {activeConversation.peer?.headline}
                  </p>
                </div>
              </button>

              {activeConversation.peer && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onReport({
                        type: 'user',
                        id: activeConversation.peer!.id,
                        label: activeConversation.peer!.displayName,
                      })
                    }
                    className="p-2 rounded-lg text-[#6A6784] hover:text-[#DD2A7B]"
                    aria-label="Report member"
                  >
                    <ShieldAlert className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleBlockPeer(
                        activeConversation.peer!.id,
                        activeConversation.peer!.displayName
                      )
                    }
                    className="p-2 rounded-lg text-[#6A6784] hover:text-red-600"
                    aria-label="Block member"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[380px]">
              {loadingMsgs ? (
                <p className="text-xs text-[#6A6784]">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="text-xs text-[#6A6784] text-center py-8">
                  Send your first message to {activeConversation.peer?.displayName}.
                </p>
              ) : (
                messages.map((m) => {
                  const isMine = m.senderId === profile.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          isMine
                            ? 'bg-[#5B4BFF] text-white'
                            : 'bg-[#F5F5FA] dark:bg-[#1C2030] text-[#17152B] dark:text-[#F1F2F9]'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.content}</p>
                        <p
                          className={`mt-1 text-[10px] tabular-nums ${
                            isMine ? 'text-white/75' : 'text-[#6A6784] dark:text-[#9CA0B8]'
                          }`}
                        >
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {error && (
              <p className="px-4 py-1 text-xs text-red-600 dark:text-red-400">{error}</p>
            )}

            <form
              onSubmit={handleSend}
              className="p-3 border-t border-[#E3E1EE] dark:border-[#23273A] flex gap-2"
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message..."
                maxLength={2000}
                className="flex-1 rounded-xl border border-[#E3E1EE] dark:border-[#23273A] bg-[#FAF9FF] dark:bg-[#0E101A] px-3.5 py-2 text-sm text-[#17152B] dark:text-[#F1F2F9]"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#5B4BFF] text-white text-xs font-semibold hover:bg-[#4B3CE8] disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
