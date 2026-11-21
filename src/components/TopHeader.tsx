import React, { useState, useEffect } from 'react';
import { ShieldCheck, Send, LogIn, Crown, Cpu, Sun, Moon } from 'lucide-react';
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
  colorMode?: 'dark' | 'light';
  onToggleColorMode?: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  user,
  settings,
  onOpenAuth,
  onOpenAdmin,
  onOpenTelegram,
  isAdminView,
  onExitAdmin,
  colorMode = 'dark',
  onToggleColorMode,
}) => {
  const [logoFailed, setLogoFailed] = useState(false);

  // Reset fallback if admin uploads a new logo URL
  useEffect(() => {
    setLogoFailed(false);
  }, [settings?.app_logo_url]);

  const isPrivileged = user && (user.role === 'admin' || user.role === 'super_admin');
  const brandTitle = (settings?.app_name || 'STUDY BLUNDER').trim() || 'STUDY BLUNDER';
  const isDark = colorMode === 'dark';

  return (
    <header className="sticky top-0 z-30 w-full bg-[#090909]/95 backdrop-blur-md border-b border-[#454545] shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-colors duration-200">
      {/* Theme Accent Top Rail */}
      <div
        className="h-[2.5px] w-full"
        style={{
          background: 'linear-gradient(90deg, var(--sb-accent) 0%, var(--sb-accent-2) 55%, var(--sb-border) 100%)',
        }}
      />

      <div className="w-full max-w-xl lg:max-w-5xl mx-auto px-3.5 sm:px-5 h-15 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand Identity */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="ra-corners w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-[#141414] border border-[#454545] flex items-center justify-center overflow-hidden p-1 shrink-0">
            {settings?.app_logo_url && !logoFailed ? (
              <img
                src={settings.app_logo_url}
                alt={brandTitle}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-full h-full object-contain select-none"
              />
            ) : (
              <div className="w-full h-full rounded bg-[#090909] border border-[#FF2525]/50 flex items-center justify-center text-[#FF2525]">
                <Cpu className="w-5 h-5" />
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="font-display text-sm sm:text-base font-black tracking-[0.06em] uppercase truncate text-[#F5F5F5]">
                {brandTitle}
              </h1>
              {user?.vip_active && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono-tech font-bold uppercase tracking-wider shrink-0 border bg-[#FF2525]/15 border-[#FF2525]/60 text-[#FF2525]">
                  <Crown className="w-3 h-3" />
                  VIP
                </span>
              )}
            </div>
            <p className="font-mono-tech text-[10px] uppercase tracking-[0.14em] truncate leading-tight mt-0.5 text-[#929292]">
              STUDY COMMAND HUB • {isDark ? 'DARK MODE' : 'LIGHT MODE'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Dark / Light Mode Toggle */}
          {onToggleColorMode && (
            <button
              type="button"
              onClick={onToggleColorMode}
              title={isDark ? 'Switch to Light Mode (Day Study)' : 'Switch to Dark Mode (Night Study)'}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="w-11 h-11 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF2525] border border-[#454545] hover:border-[#FF2525] flex items-center justify-center active:scale-95 transition-all"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}

          <SmartNotificationCenter user={user} />

          {(settings?.study_blunder_telegram_url || settings?.telegram_channel_url) && (
            <button
              type="button"
              onClick={onOpenTelegram}
              title="Official Telegram Channels"
              aria-label="Official Telegram Channels"
              className="w-11 h-11 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF2525] border border-[#454545] hover:border-[#FF2525] flex items-center justify-center active:scale-95 transition-all"
            >
              <Send className="w-4 h-4 -translate-x-px" />
            </button>
          )}

          {isAdminView ? (
            <button
              type="button"
              onClick={onExitAdmin}
              className="min-h-[44px] px-3.5 rounded-lg ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider"
            >
              Exit Admin
            </button>
          ) : isPrivileged ? (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="min-h-[44px] flex items-center gap-1.5 px-3 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF2525] border border-[#FF2525]/55 hover:border-[#FF2525] text-xs font-display font-extrabold uppercase tracking-wider transition-colors"
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline sm:inline">Admin</span>
            </button>
          ) : !user ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[44px] flex items-center gap-1.5 px-3.5 rounded-lg ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login</span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
};
