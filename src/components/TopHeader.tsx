import React from 'react';
import { ShieldCheck, Send, LogIn, Crown, Sparkles } from 'lucide-react';
import type { UserProfile, PublicSettings } from '../types.ts';
import { SmartNotificationCenter } from './SmartNotificationCenter.tsx';

interface TopHeaderProps {
  user: UserProfile | null;
  settings: PublicSettings | null;
  onOpenAuth: () => void;
  onOpenAdmin: () => void;
  onOpenTelegram: () => void;
  isAdminView: boolean;
  onExitAdmin: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  user,
  settings,
  onOpenAuth,
  onOpenAdmin,
  onOpenTelegram,
  isAdminView,
  onExitAdmin,
}) => {
  const isPrivileged = user && (user.role === 'admin' || user.role === 'super_admin');

  return (
    <header
      style={{ backgroundColor: 'var(--theme-bg, #070B14)' }}
      className="sticky top-0 z-30 w-full backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-4 py-2 sm:py-2.5 transition-colors"
    >
      <div className="w-full flex items-center justify-between gap-3">
        {/* Brand - Positioned at extreme left side */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-14 h-14 sm:w-16 sm:h-16 md:w-[4.5rem] md:h-[4.5rem] rounded-2xl bg-[#080D1A]/80 border-[0.5px] border-white/10 flex items-center justify-center shadow-md shadow-black/30 overflow-hidden p-0.5 shrink-0"
          >
            {settings?.app_logo_url ? (
              <img
                src={settings.app_logo_url}
                alt={settings.app_name || 'STUDY FOX Logo'}
                className="w-full h-full object-contain select-none"
              />
            ) : (
              <div
                style={{
                  background: 'linear-gradient(135deg, var(--theme-primary, #06b6d4), var(--theme-secondary, #3b82f6))',
                }}
                className="w-full h-full rounded-xl flex items-center justify-center text-white shadow-inner"
              >
                <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
            )}
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <h1 className="text-base sm:text-lg md:text-xl font-black tracking-tight text-white flex items-center gap-2 truncate">
              <span className="truncate">{settings?.app_name || 'STUDY FOX'}</span>
              {user?.vip_active && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                  <Crown className="w-2.5 h-2.5" /> VIP
                </span>
              )}
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-400 font-medium truncate">All-in-One Education Hub</p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          {/* Smart Notification Center */}
          <SmartNotificationCenter user={user} />

          {/* Telegram link button */}
          {settings?.telegram_channel_url && (
            <button
              onClick={onOpenTelegram}
              title="Official Telegram Channel"
              className="w-8 h-8 rounded-full bg-slate-800/90 hover:bg-slate-700 text-sky-400 border border-slate-700/60 flex items-center justify-center transition-colors"
            >
              <Send className="w-3.5 h-3.5 -translate-x-0.5" />
            </button>
          )}

          {/* Admin Switcher */}
          {isAdminView ? (
            <button
              onClick={onExitAdmin}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-colors"
            >
              Exit Admin
            </button>
          ) : isPrivileged ? (
            <button
              onClick={onOpenAdmin}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 text-purple-300 border border-purple-700/50 text-xs font-semibold shadow-sm transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              Admin
            </button>
          ) : !user ? (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
            >
              <LogIn className="w-3.5 h-3.5 text-slate-400" />
              Login
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
};
