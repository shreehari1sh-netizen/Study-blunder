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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await api.adminLogin(email, password);
      onLoginSuccess(res.user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Administrative authentication failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const autofillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#060A12] text-slate-100 flex flex-col items-center justify-center p-4">
      {/* Back to Website link */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Public Website</span>
        </button>

        <span className="text-[11px] font-bold text-purple-400/80 bg-purple-950/40 border border-purple-800/40 px-2.5 py-0.5 rounded-full">
          /admin route
        </span>
      </div>

      <div className="bg-[#0C1222] border border-slate-800 rounded-3xl max-w-md w-full p-6 md:p-8 shadow-2xl relative">
        {/* Top Crest */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-[#080D19]/80 border-[0.5px] border-white/10 p-0.5 mx-auto shadow-xl shadow-black/50 mb-3 overflow-hidden flex items-center justify-center">
            {settings?.app_logo_url ? (
              <img
                src={settings.app_logo_url}
                alt={settings.app_name || 'STUDY FOX Admin'}
                className="w-full h-full object-contain select-none"
              />
            ) : (
              <div className="w-full h-full rounded-xl bg-purple-950/60 flex items-center justify-center text-purple-400">
                <KeyRound className="w-8 h-8" />
              </div>
            )}
          </div>

          <h1 className="text-lg md:text-xl font-extrabold text-white tracking-tight">
            {settings?.app_name ? `${settings.app_name} Admin` : 'Administrative Control Portal'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Restricted access zone for authorized administrators
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/60 border border-purple-800/40 text-[11px] font-semibold text-purple-300">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>Server-Verified RBAC Protection</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">{error}</div>
          </div>
        )}

        {/* Admin Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Administrator Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="superadmin@education.com"
                className="w-full bg-[#080D19] border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Security Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#080D19] border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-purple-950/60 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <span>{submitting ? 'Verifying Authorization...' : 'Sign In as Administrator'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Access Credentials */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <p className="text-[11px] font-bold text-slate-400 mb-2">Authorized Test Credentials:</p>
          <div className="grid grid-cols-2 gap-2 text-left">
            <button
              type="button"
              onClick={() => autofillDemo('superadmin@education.com', 'SuperAdmin@2026')}
              className="p-2 rounded-xl bg-purple-950/40 border border-purple-800/50 hover:border-purple-400 text-xs text-left"
            >
              <div className="font-bold text-purple-300 text-[11px]">Super Admin</div>
              <div className="text-[10px] text-slate-400 truncate">superadmin@education.com</div>
            </button>

            <button
              type="button"
              onClick={() => autofillDemo('admin@education.com', 'Admin@2026')}
              className="p-2 rounded-xl bg-indigo-950/40 border border-indigo-800/50 hover:border-indigo-400 text-xs text-left"
            >
              <div className="font-bold text-indigo-300 text-[11px]">Regular Admin</div>
              <div className="text-[10px] text-slate-400 truncate">admin@education.com</div>
            </button>
          </div>

          {/* Unauthorized account test trigger */}
          <div className="mt-2.5 text-center">
            <button
              type="button"
              onClick={() => autofillDemo('student@education.com', 'Student@2026')}
              className="text-[10px] text-slate-500 hover:text-slate-400 underline"
            >
              Autofill normal student account (to test 403 Forbidden rejection)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
