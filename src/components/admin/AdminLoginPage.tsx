import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, ArrowRight, AlertCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { api } from '../../api.ts';
import type { UserProfile, PublicSettings } from '../../types.ts';

interface AdminLoginPageProps {
  settings?: PublicSettings | null;
  onLoginSuccess: (adminUser: UserProfile) => void;
  onNavigateHome: () => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ settings, onLoginSuccess, onNavigateHome }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const brandName = (settings?.app_name || 'STUDY BLUNDER').trim() || 'STUDY BLUNDER';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await api.adminLogin(email.trim(), password);
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Administrative authentication failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen ra-grid-bg bg-[#090909] text-[#F5F5F5] flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Top Return Bar */}
      <div className="w-full max-w-md mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onNavigateHome}
          className="inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-lg bg-[#141414] border border-[#454545] text-xs font-semibold text-[#C5C5C5] hover:text-[#F5F5F5] hover:border-[#FF2525]/70 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[#FF2525]" />
          <span>Return to App</span>
        </button>

        <span className="font-mono-tech text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF2525] px-2.5 py-1 border border-[#FF2525]/40 bg-[#141414]">
          ADMIN TERMINAL
        </span>
      </div>

      {/* Armored Login Module */}
      <div className="ra-panel ra-corners rounded-2xl max-w-md w-full p-6 sm:p-8 relative overflow-hidden">
        <div className="h-1 w-full ra-hazard-bar absolute top-0 left-0 right-0" />

        {/* Brand Crest */}
        <div className="text-center mb-7 pt-2">
          <div className="w-20 h-20 rounded-xl bg-[#090909] border border-[#454545] p-2 mx-auto mb-4 flex items-center justify-center overflow-hidden shadow-[0_0_24px_rgba(255,37,37,0.16)]">
            {settings?.app_logo_url ? (
              <img
                src={settings.app_logo_url}
                alt={`${brandName} Admin`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain select-none"
              />
            ) : (
              <div className="w-full h-full rounded-lg bg-[#141414] border border-[#FF2525]/35 flex items-center justify-center text-[#FF2525]">
                <KeyRound className="w-8 h-8" />
              </div>
            )}
          </div>

          <h1 className="font-display text-xl sm:text-2xl font-black text-[#F5F5F5] tracking-tight uppercase">
            {brandName} Admin
          </h1>
          <p className="text-xs text-[#929292] mt-1.5">
            Restricted command interface for authorized administrators
          </p>

          <div className="mt-3.5 inline-flex items-center gap-2 px-3 py-1.5 bg-[#090909] border border-[#454545] text-[11px] font-mono-tech font-semibold text-[#C5C5C5] uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-[#FF2525]" />
            <span>RBAC Verified Session</span>
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-[#FF2525]/12 border border-[#FF2525]/60 text-[#F5F5F5] text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-mono-tech text-[11px] font-bold uppercase tracking-wider text-[#C5C5C5] mb-1.5">
              Administrator Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#929292] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@domain.com"
                className="w-full min-h-[46px] bg-[#090909] border border-[#454545] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block font-mono-tech text-[11px] font-bold uppercase tracking-wider text-[#C5C5C5] mb-1.5">
              Security Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#929292] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter administrator password"
                className="w-full min-h-[46px] bg-[#090909] border border-[#454545] rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] mt-2 py-3.5 rounded-xl ra-btn-primary font-display font-extrabold text-xs uppercase tracking-[0.16em] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>{submitting ? 'Verifying Credentials...' : 'Enter Command Center'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#454545]/60 text-center">
          <p className="text-[11px] text-[#929292]">
            All administrative sign-ins and configuration changes are logged by the server.
          </p>
        </div>
      </div>
    </div>
  );
};
