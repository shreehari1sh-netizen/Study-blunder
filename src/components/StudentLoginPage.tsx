import React, { useState, useEffect } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  Send,
  AlertCircle,
  BookOpen,
  GraduationCap,
  CheckCircle2,
  KeyRound,
  Gift,
} from 'lucide-react';
import { api } from '../api.ts';
import type { PublicSettings, UserProfile } from '../types.ts';

interface StudentLoginPageProps {
  settings: PublicSettings | null;
  onAuthSuccess: (user: UserProfile) => void;
  onNavigateAdmin: () => void;
  isKeyVerify?: boolean;
  onPasswordResetComplete?: () => void;
}

export const StudentLoginPage: React.FC<StudentLoginPageProps> = ({
  settings,
  onAuthSuccess,
  onNavigateAdmin,
  isKeyVerify = false,
  onPasswordResetComplete,
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [recoveryAccessToken, setRecoveryAccessToken] = useState('');
  const [generatedResetLink, setGeneratedResetLink] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const appName = settings?.app_name || 'STUDY FOX';
  const logoUrl = settings?.app_logo_url || '/logo.png';
  const loginEnabled = settings?.login_enabled !== false;
  const referralProgramEnabled = settings?.referral_program_enabled !== false;

  // Detect password reset link parameters from query string (?reset_token=...) or Supabase Auth hash (#access_token=...&type=recovery)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const qToken = searchParams.get('reset_token') || '';
    const qEmail = searchParams.get('email') || '';
    const qRef = (searchParams.get('ref') || searchParams.get('referral') || '').trim().toUpperCase();
    if (qRef && referralProgramEnabled) {
      setReferralCode(qRef);
    }

    const hashStr = window.location.hash.startsWith('#')
      ? window.location.hash.substring(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hashStr);
    const hashType = hashParams.get('type');
    const hashAccessToken = hashParams.get('access_token') || '';
    const hashErrorDesc = hashParams.get('error_description') || '';

    if (hashErrorDesc) {
      setTab('forgot');
      setError(decodeURIComponent(hashErrorDesc.replace(/\+/g, ' ')));
      return;
    }

    if (qToken || (hashType === 'recovery' && hashAccessToken)) {
      if (qToken) setResetToken(qToken.trim());
      if (hashAccessToken) setRecoveryAccessToken(hashAccessToken.trim());
      if (qEmail) setEmail(qEmail.trim());
      setTab('reset');
      setError(null);
      setSuccessMessage(null);
    }
  }, [referralProgramEnabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const cleanRef = referralProgramEnabled && referralCode.trim() ? referralCode.trim().toUpperCase() : undefined;
      if (tab === 'login') {
        const res = await api.login(email.trim(), password, cleanRef);
        onAuthSuccess(res.user);
      } else if (tab === 'register') {
        const res = await api.register(email.trim(), password, cleanRef);
        onAuthSuccess(res.user);
      } else if (tab === 'forgot') {
        const cleanEmail = email.trim();
        if (!cleanEmail) {
          setError('Please enter your registered email address.');
          setSubmitting(false);
          return;
        }
        const res = await api.forgotPassword(cleanEmail);
        setSuccessMessage(res.message);
        if (res.reset_link) {
          setGeneratedResetLink(res.reset_link);
        }
      } else if (tab === 'reset') {
        if (newPassword.length < 6 || newPassword.length > 128) {
          setError('New password must be between 6 and 128 characters long.');
          setSubmitting(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError('New password and confirm password do not match.');
          setSubmitting(false);
          return;
        }
        const res = await api.resetPassword({
          token: resetToken || undefined,
          access_token: recoveryAccessToken || undefined,
          new_password: newPassword,
          confirm_password: confirmPassword,
        });
        // Clean URL query/hash after successful password reset
        if (typeof window !== 'undefined') {
          window.history.replaceState({}, '', '/');
        }
        setResetToken('');
        setRecoveryAccessToken('');
        setGeneratedResetLink(null);
        setNewPassword('');
        setConfirmPassword('');
        setPassword('');
        setSuccessMessage(res.message || 'Password updated successfully! Please sign in with your new password.');
        setTab('login');
        if (onPasswordResetComplete) {
          onPasswordResetComplete();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please verify credentials.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenGeneratedResetLink = () => {
    if (!generatedResetLink) return;
    try {
      const parsed = new URL(generatedResetLink, window.location.origin);
      const tokenParam = parsed.searchParams.get('reset_token') || '';
      const emailParam = parsed.searchParams.get('email') || '';
      if (tokenParam) {
        setResetToken(tokenParam);
        if (emailParam) setEmail(emailParam);
        setGeneratedResetLink(null);
        setSuccessMessage(null);
        setError(null);
        setTab('reset');
      }
    } catch {
      window.location.href = generatedResetLink;
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070B14] flex flex-col justify-between items-center p-4 sm:p-6 font-['Plus_Jakarta_Sans',sans-serif] selection:bg-purple-600 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-b from-purple-600/20 to-indigo-600/10 rounded-full blur-3xl opacity-60" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-t from-amber-500/15 to-transparent rounded-full blur-3xl opacity-40" />
      </div>

      {/* Top Brand Banner */}
      <div className="w-full max-w-sm flex items-center justify-between pt-2 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#0C1222] border border-white/10 flex items-center justify-center p-0.5 shadow-lg overflow-hidden shrink-0">
            <img src={logoUrl} alt={appName} className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="text-sm font-black text-white tracking-tight">{appName}</span>
            <p className="text-[10px] text-slate-400 font-medium">Education Platform</p>
          </div>
        </div>

        {settings?.telegram_channel_url && (
          <a
            href={settings.telegram_channel_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-sky-400 hover:text-sky-300 font-semibold shadow-sm transition"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Updates</span>
          </a>
        )}
      </div>

      {/* Center Auth Card */}
      <div className="w-full max-w-sm my-auto z-10">
        <div className="bg-[#0C1222]/90 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/60 relative">
          {/* Logo Crest */}
          <div className="text-center mb-5">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-amber-500 p-0.5 mx-auto shadow-xl shadow-purple-950/50 mb-3 overflow-hidden">
              <div className="w-full h-full bg-[#080D1A] rounded-2xl flex items-center justify-center p-1 overflow-hidden">
                <img src={logoUrl} alt={appName} className="w-full h-full object-contain" />
              </div>
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">
              {tab === 'login'
                ? 'Student Sign In'
                : tab === 'register'
                ? 'Create Student Account'
                : tab === 'forgot'
                ? 'Forgot Password'
                : 'Set New Password'}
            </h1>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {tab === 'login'
                ? 'Sign in to access your educational portals & VIP batches'
                : tab === 'register'
                ? 'Sign up for free to access live lecture batches & portals'
                : tab === 'forgot'
                ? 'Enter your registered email address to receive a password reset link'
                : 'Enter and confirm your new password below'}
            </p>
          </div>

          {/* Shortener Callback Key Verification Banner */}
          {isKeyVerify && (
            <div className="mb-4 p-3 rounded-2xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs text-center animate-in fade-in">
              <p className="font-extrabold flex items-center justify-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Shortener Verification Completed!</span>
              </p>
              <p className="text-[11px] text-emerald-300/90 mt-1">
                Sign in or register to claim your 24-Hour Access Pass instantly!
              </p>
            </div>
          )}

          {/* Maintenance / Disabled Notice */}
          {!loginEnabled && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
              <p className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Public login temporarily restricted</span>
              </p>
              <p className="text-[11px] text-amber-300/80 mt-1">
                Administrator mode is currently active.
              </p>
            </div>
          )}

          {/* Tab Switcher (Sign In / New Account) */}
          {(tab === 'login' || tab === 'register') && (
            <div className="grid grid-cols-2 p-1 bg-[#070B14] rounded-2xl border border-slate-800/80 mb-5">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  tab === 'login'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-indigo-950/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setError(null);
                  setSuccessMessage(null);
                }}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  tab === 'register'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-indigo-950/50'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                New Account
              </button>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="mb-4 p-3 rounded-2xl bg-emerald-950/60 border border-emerald-700/70 text-emerald-200 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <span className="leading-relaxed">{successMessage}</span>
              </div>
              {generatedResetLink && tab === 'forgot' && (
                <button
                  type="button"
                  onClick={handleOpenGeneratedResetLink}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-200 font-bold text-[11px] flex items-center justify-center gap-1.5 transition"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Proceed to Reset Password Page</span>
                </button>
              )}
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="leading-tight">{error}</span>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {(tab === 'login' || tab === 'register' || tab === 'forgot') && (
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Student Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@example.com"
                    className="w-full bg-[#070B14] border border-slate-800 rounded-xl pl-10 pr-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {(tab === 'login' || tab === 'register') && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">Password</label>
                  {tab === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setTab('forgot');
                        setError(null);
                        setSuccessMessage(null);
                        setGeneratedResetLink(null);
                      }}
                      className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#070B14] border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Part E: Enter Referral Code (Optional) directly below Password */}
                <div className="mt-3.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-bold text-slate-300">
                      Enter Referral Code (Optional)
                    </label>
                    {referralProgramEnabled && settings?.referral_discount_config?.discount_enabled && settings.referral_discount_config.discount_value > 0 && (
                      <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md">
                        {settings.referral_discount_config.discount_type === 'percentage'
                          ? `${settings.referral_discount_config.discount_value}% VIP Discount`
                          : `₹${settings.referral_discount_config.discount_value} VIP Discount`}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <Gift className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      disabled={!referralProgramEnabled}
                      value={referralProgramEnabled ? referralCode : ''}
                      onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                      placeholder={
                        referralProgramEnabled
                          ? 'Enter Referral Code (Optional) e.g. SF-XXXX'
                          : 'Referral Program is currently OFF.'
                      }
                      maxLength={32}
                      className={`w-full bg-[#070B14] border rounded-xl pl-10 pr-3.5 py-2.5 text-xs uppercase tracking-wider font-mono transition-colors ${
                        referralProgramEnabled
                          ? 'border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/70'
                          : 'border-slate-800/60 text-slate-500 placeholder-slate-500 cursor-not-allowed opacity-75'
                      }`}
                    />
                  </div>
                  {!referralProgramEnabled && (
                    <p className="text-[11px] font-semibold text-amber-400/90 mt-1.5 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Referral Program is currently OFF.</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {tab === 'reset' && (
              <>
                {email && (
                  <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">Account: <strong className="text-white">{email}</strong></span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      maxLength={128}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 6 characters)"
                      className="w-full bg-[#070B14] border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Confirm New Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      maxLength={128}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full bg-[#070B14] border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting || (!loginEnabled && (tab === 'login' || tab === 'register'))}
              className="w-full mt-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-amber-500 hover:opacity-95 text-white font-extrabold text-xs uppercase tracking-wider shadow-xl shadow-purple-950/60 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>
                {submitting
                  ? 'Please wait...'
                  : tab === 'login'
                  ? 'Sign In & Access'
                  : tab === 'register'
                  ? 'Create Free Account'
                  : tab === 'forgot'
                  ? 'Send Reset Link'
                  : 'Update Password'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {(tab === 'forgot' || tab === 'reset') && (
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined' && (window.location.search.includes('reset_token') || window.location.hash.includes('type=recovery'))) {
                    window.history.replaceState({}, '', '/');
                  }
                  setTab('login');
                  setError(null);
                  setSuccessMessage(null);
                  setGeneratedResetLink(null);
                  if (onPasswordResetComplete) {
                    onPasswordResetComplete();
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            )}
          </form>

          {/* Value Props */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/50">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400 mx-auto mb-1" />
              <p className="text-[10px] text-slate-300 font-bold">Live Portals</p>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/50">
              <GraduationCap className="w-3.5 h-3.5 text-purple-400 mx-auto mb-1" />
              <p className="text-[10px] text-slate-300 font-bold">VIP Batches</p>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800/50">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
              <p className="text-[10px] text-slate-300 font-bold">Fast Access</p>
            </div>
          </div>
        </div>

        {/* Admin Link at Bottom */}
        <div className="mt-4 text-center">
          <button
            onClick={onNavigateAdmin}
            className="text-xs text-slate-500 hover:text-slate-300 font-medium inline-flex items-center gap-1.5 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>Are you a Staff Administrator? Admin Login</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-sm text-center py-3 text-[11px] text-slate-500 z-10">
        <p>© {new Date().getFullYear()} {appName}. All rights reserved.</p>
      </footer>
    </div>
  );
};
