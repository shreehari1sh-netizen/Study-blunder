import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Crown,
  Flame,
  Calendar,
  ShieldCheck,
  Megaphone,
  Gift,
} from 'lucide-react';
import { api } from '../api.ts';
import type { SmartNotification, UserProfile } from '../types.ts';

interface SmartNotificationCenterProps {
  user: UserProfile | null;
}

export const SmartNotificationCenter: React.FC<SmartNotificationCenterProps> = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await api.getNotifications();
      setNotifications(res.notifications);
      setUnreadCount(res.unread_count);
    } catch {
      // Ignore transient error
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadNotifications();
    }, 90000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  // Refresh notifications when App.tsx's single SSE stream broadcasts vip_status_update
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    const handleUpdate = () => {
      void loadNotifications();
    };
    window.addEventListener('sf:vip-status-update', handleUpdate);
    return () => {
      window.removeEventListener('sf:vip-status-update', handleUpdate);
    };
  }, [user, loadNotifications]);

  if (!user) return null;

  const handleMarkAllRead = async () => {
    try {
      await api.markNotificationsRead();
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // Ignore
    }
  };

  const handleMarkOneRead = async (id: string) => {
    try {
      await api.markNotificationsRead(id);
      setNotifications((prev) => {
        const next = prev.map((n) => (n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(next.filter((n) => !n.is_read).length);
        return next;
      });
    } catch {
      // Ignore
    }
  };

  const handleClearRead = async () => {
    try {
      await api.clearReadNotifications();
      setNotifications((prev) => prev.filter((n) => !n.is_read));
    } catch {
      // Ignore
    }
  };

  const getCategoryIcon = (type: SmartNotification['type']) => {
    switch (type) {
      case 'vip_activated':
      case 'payment_submitted':
      case 'payment_approved':
      case 'payment_rejected':
      case 'vip_expiry_reminder':
        return <Crown className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'streak_milestone':
        return <Flame className="w-4 h-4 text-orange-400 shrink-0" />;
      case 'exam_countdown':
        return <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />;
      case 'referral_reward':
        return <Gift className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'vip_announcement':
        return <Megaphone className="w-4 h-4 text-purple-400 shrink-0" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />;
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open) void loadNotifications();
        }}
        title="Smart Notification Center"
        className="relative w-8 h-8 rounded-full bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-slate-700/60 flex items-center justify-center transition-colors"
      >
        <Bell className="w-3.5 h-3.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white font-extrabold text-[9px] flex items-center justify-center shadow">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-10 sm:w-80 md:w-96 z-50 rounded-2xl bg-[#0C1324] border border-slate-700 shadow-2xl p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                Smart Notifications
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                  {unreadCount} New
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[10px] font-bold inline-flex items-center gap-1 px-2"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>Read All</span>
                </button>
              )}
              {notifications.some((n) => n.is_read) && (
                <button
                  type="button"
                  onClick={handleClearRead}
                  title="Clear read notifications"
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-300"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2 pr-0.5">
            {loading && notifications.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">Loading notifications...</p>
            ) : notifications.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">
                You are all caught up! Exam reminders, streak milestones, and VIP updates appear here.
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (!n.is_read) void handleMarkOneRead(n.id);
                  }}
                  className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                    n.is_read
                      ? 'bg-[#080D19]/70 border-slate-800/80 opacity-75'
                      : 'bg-[#10192E] border-amber-500/40'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">{getCategoryIcon(n.type)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-white truncate">{n.title}</span>
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{n.message}</p>
                      <span className="text-[9px] text-slate-500 block mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
