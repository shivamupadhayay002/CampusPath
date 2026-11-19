import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NotificationItem } from '../types/campus';

interface NotificationsViewProps {
  onRefreshMe: () => Promise<void>;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ onRefreshMe }) => {
  const { apiFetch } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/notifications');
      if (res.ok) {
        const list = await res.json();
        setItems(list);
      }
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleReadAll = async () => {
    const res = await apiFetch('/api/notifications/read-all', { method: 'POST' });
    if (res.ok) {
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await onRefreshMe();
    }
  };

  return (
    <div className="rounded-2xl bg-white dark:bg-[#131622] border border-[#E3E1EE] dark:border-[#23273A] p-5">
      <div className="flex items-center justify-between border-b border-[#E3E1EE] dark:border-[#23273A] pb-3">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[#5B4BFF]" />
          <h1 className="text-lg font-bold text-[#17152B] dark:text-[#F1F2F9]">Notifications</h1>
        </div>
        {items.some((n) => !n.isRead) && (
          <button
            type="button"
            onClick={handleReadAll}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B4BFF] hover:underline"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <p className="py-6 text-xs text-[#6A6784]">Loading notifications...</p>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-xs text-[#6A6784]">
          You are caught up. Interactions, messages, and verification updates appear here.
        </p>
      ) : (
        <div className="divide-y divide-[#E3E1EE] dark:divide-[#23273A]">
          {items.map((n) => (
            <div
              key={n.id}
              className={`py-3.5 flex items-start justify-between gap-3 ${
                n.isRead ? 'opacity-75' : 'font-semibold'
              }`}
            >
              <p className="text-sm text-[#17152B] dark:text-[#F1F2F9]">{n.message}</p>
              <span className="text-[11px] text-[#6A6784] dark:text-[#9CA0B8] whitespace-nowrap tabular-nums">
                {new Date(n.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
