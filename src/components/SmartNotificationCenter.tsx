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
      case 'vip_expiry_reminder':
        return <Crown className="w-4 h-4 text-[#FF762E] shrink-0" />;
      case 'payment_rejected':
        return <Crown className="w-4 h-4 text-[#FF2525] shrink-0" />;
      case 'streak_milestone':
        return <Flame className="w-4 h-4 text-[#FF762E] shrink-0" />;
      case 'exam_countdown':
        return <Calendar className="w-4 h-4 text-[#FF2525] shrink-0" />;
      case 'referral_reward':
        return <Gift className="w-4 h-4 text-[#FF762E] shrink-0" />;
      case 'vip_announcement':
        return <Megaphone className="w-4 h-4 text-[#FF2525] shrink-0" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-[#C5C5C5] shrink-0" />;
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
        title="Notifications"
        aria-label="Notifications"
        className="relative w-11 h-11 rounded-lg bg-[#1D1D1D] hover:bg-[#252525] active:scale-95 text-[#F5F5F5] border border-[#454545] hover:border-[#FF2525] flex items-center justify-center transition-all"
      >
        <Bell className="w-4 h-4 text-[#FF762E]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded bg-[#FF2525] text-[#F5F5F5] font-mono-tech font-bold text-[10px] flex items-center justify-center border border-[#090909]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-17 sm:absolute sm:inset-x-auto sm:right-0 sm:top-13 sm:w-80 md:w-96 z-50 rounded-2xl ra-panel ra-corners shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-[#454545] pb-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-[#FF2525] shrink-0" />
              <span className="font-display text-xs font-black uppercase tracking-wider text-[#F5F5F5] truncate">
                Alerts &amp; Updates
              </span>
              {unreadCount > 0 && (
                <span className="font-mono-tech text-[10px] font-bold text-[#FF2525]">
                  ({unreadCount})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                  className="h-7 px-2 rounded bg-[#090909] hover:bg-[#252525] text-[#F5F5F5] border border-[#454545] text-[10px] font-bold inline-flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="w-3 h-3 text-[#FF2525]" />
                  <span>Read All</span>
                </button>
              )}
              {notifications.some((n) => n.is_read) && (
                <button
                  type="button"
                  onClick={handleClearRead}
                  title="Clear read notifications"
                  className="w-7 h-7 rounded bg-[#090909] hover:bg-[#252525] text-[#929292] hover:text-[#FF2525] border border-[#454545] flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="w-7 h-7 rounded bg-[#090909] hover:bg-[#252525] text-[#929292] hover:text-[#F5F5F5] border border-[#454545] flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto space-y-2 pr-0.5">
            {loading && notifications.length === 0 ? (
              <p className="text-xs text-[#929292] text-center py-6">Loading notifications...</p>
            ) : notifications.length === 0 ? (
              <p className="text-xs text-[#929292] text-center py-6 leading-relaxed">
                All caught up. Exam reminders, streak milestones, and VIP updates appear here.
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
                      ? 'bg-[#090909]/70 border-[#454545]/70 opacity-75'
                      : 'bg-[#090909] border-[#FF2525]/55'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5">{getCategoryIcon(n.type)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#F5F5F5] truncate">{n.title}</span>
                        {!n.is_read && (
                          <span className="font-mono-tech text-[9px] font-bold uppercase text-[#FF2525] shrink-0">
                            NEW
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#C5C5C5] mt-1 leading-relaxed">{n.message}</p>
                      <span className="font-mono-tech text-[10px] text-[#929292] block mt-1.5">
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
