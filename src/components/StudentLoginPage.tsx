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
  const [logoFailed, setLogoFailed] = useState(false);

  const appName = settings?.app_name || 'STUDY BLUNDER';
  const logoUrl = settings?.app_logo_url || '';
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

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  return (
    <div className="min-h-screen w-full ra-grid-bg bg-[#090909] text-[#F5F5F5] flex flex-col justify-between items-center p-4 sm:p-6 font-body selection:bg-[#FF2525] selection:text-[#F5F5F5] relative overflow-x-hidden">
      {/* Top Armored Brand Bar */}
      <div className="w-full max-w-md flex items-center justify-between gap-2 pt-1 z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-[#141414] border border-[#454545] ra-corners flex items-center justify-center p-1 overflow-hidden shrink-0">
            {logoUrl && !logoFailed ? (
              <img
                src={logoUrl}
                alt={appName}
                referrerPolicy="no-referrer"
                onError={() => setLogoFailed(true)}
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="font-display text-xs font-black text-[#FF2525]">
                {appName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <span className="font-display text-sm font-black uppercase tracking-wider text-[#F5F5F5] block truncate">
              {appName}
            </span>
            <p className="text-[10px] font-mono-tech uppercase tracking-[0.18em] text-[#929292]">
              RED ALERT · STUDENT PORTAL
            </p>
          </div>
        </div>

        {settings?.telegram_channel_url && (
          <a
            href={settings.telegram_channel_url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] flex items-center gap-1.5 px-3 rounded-lg bg-[#141414] border border-[#454545] hover:border-[#FF2525]/70 text-xs text-[#C5C5C5] hover:text-[#F5F5F5] font-display font-bold uppercase tracking-wider transition-colors shrink-0"
          >
            <Send className="w-3.5 h-3.5 text-[#FF2525]" />
            <span>Updates</span>
          </a>
        )}
      </div>

      {/* Center Command Auth Terminal */}
      <div className="w-full max-w-md my-auto py-4 z-10">
        <div className="ra-panel-red ra-corners ra-scanlines rounded-2xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.85)] relative">
          {/* Top Hazard Accent Rail */}
          <div className="ra-hazard-bar h-1.5 w-full" />

          {/* Status Telemetry Strip */}
          <div className="px-5 py-2 bg-[#090909]/90 border-b border-[#454545]/70 flex items-center justify-between text-[10px] font-mono-tech uppercase tracking-[0.16em]">
            <span className="text-[#FF2525] font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF2525]" />
              AUTH TERMINAL
            </span>
            <span className="text-[#929292]">
              {tab === 'login'
                ? 'SIGN-IN GATE'
                : tab === 'register'
                ? 'NEW ENROLLMENT'
                : tab === 'forgot'
                ? 'KEY RECOVERY'
                : 'CREDENTIAL RESET'}
            </span>
          </div>

          <div className="p-5 sm:p-6">
            {/* Crest & Title */}
            <div className="text-center mb-5">
              <div className="w-16 h-16 rounded-xl bg-[#090909] border border-[#FF2525]/55 mx-auto mb-3 flex items-center justify-center p-2 overflow-hidden shadow-[0_0_24px_rgba(255,37,37,0.18)]">
                {logoUrl && !logoFailed ? (
                  <img
                    src={logoUrl}
                    alt={appName}
                    referrerPolicy="no-referrer"
                    onError={() => setLogoFailed(true)}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="font-display text-xl font-black text-[#FF2525] tracking-tight">
                    {appName.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <h1 className="font-display text-xl font-black uppercase tracking-wide text-[#F5F5F5]">
                {tab === 'login'
                  ? 'Student Sign In'
                  : tab === 'register'
                  ? 'Create Account'
                  : tab === 'forgot'
                  ? 'Reset Password'
                  : 'Set New Password'}
              </h1>
              <p className="text-xs text-[#929292] mt-1 leading-relaxed">
                {tab === 'login'
                  ? 'Authenticate to launch study platforms & VIP command decks'
                  : tab === 'register'
                  ? 'Initialize a student account for instant platform access'
                  : tab === 'forgot'
                  ? 'Enter your registered email address to receive a reset link'
                  : 'Enter and confirm your new password below'}
              </p>
            </div>

            {/* Shortener Callback Key Verification Banner */}
            {isKeyVerify && (
              <div className="mb-4 p-3 rounded-xl bg-[#FF762E]/12 border border-[#FF762E]/50 text-[#F5F5F5] text-xs text-center">
                <p className="font-display font-extrabold uppercase flex items-center justify-center gap-1.5 text-[#FF762E]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Verification Completed</span>
                </p>
                <p className="text-[11px] text-[#C5C5C5] mt-1">
                  Sign in or register to claim your 24-Hour Access Pass instantly.
                </p>
              </div>
            )}

            {/* Maintenance / Disabled Notice */}
            {!loginEnabled && (
              <div className="mb-4 p-3 rounded-xl bg-[#FF762E]/12 border border-[#FF762E]/55 text-[#FF762E] text-xs">
                <p className="font-display font-bold uppercase flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Public login temporarily restricted</span>
                </p>
                <p className="text-[11px] text-[#C5C5C5] mt-1">
                  Administrator mode is currently active.
                </p>
              </div>
            )}

            {/* Tab Switcher (Sign In / New Account) */}
            {(tab === 'login' || tab === 'register') && (
              <div className="grid grid-cols-2 p-1 bg-[#090909] rounded-xl border border-[#454545] mb-5 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`min-h-[42px] font-display text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all ${
                    tab === 'login'
                      ? 'bg-[#FF2525] text-[#F5F5F5] shadow-[0_0_16px_rgba(255,37,37,0.35)]'
                      : 'text-[#929292] hover:text-[#F5F5F5]'
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
                  className={`min-h-[42px] font-display text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all ${
                    tab === 'register'
                      ? 'bg-[#FF2525] text-[#F5F5F5] shadow-[0_0_16px_rgba(255,37,37,0.35)]'
                      : 'text-[#929292] hover:text-[#F5F5F5]'
                  }`}
                >
                  New Account
                </button>
              </div>
            )}

            {/* Success Banner */}
            {successMessage && (
              <div className="mb-4 p-3 rounded-xl bg-[#1D1D1D] border border-[#FF762E]/55 text-[#F5F5F5] text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[#FF762E] mt-0.5" />
                  <span className="leading-relaxed">{successMessage}</span>
                </div>
                {generatedResetLink && tab === 'forgot' && (
                  <button
                    type="button"
                    onClick={handleOpenGeneratedResetLink}
                    className="w-full min-h-[42px] px-3 rounded-lg ra-btn-primary text-xs flex items-center justify-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Proceed to Reset Password</span>
                  </button>
                )}
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-[#FF2525]/12 border border-[#FF2525]/60 text-[#F5F5F5] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-[#FF2525]" />
                <span className="leading-tight">{error}</span>
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {(tab === 'login' || tab === 'register' || tab === 'forgot') && (
                <div>
                  <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1.5">
                    Student Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#929292] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="student@example.com"
                      className="w-full h-11 bg-[#090909] border border-[#454545] rounded-xl pl-10 pr-3.5 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525] transition-colors"
                    />
                  </div>
                </div>
              )}

              {(tab === 'login' || tab === 'register') && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5]">
                      Password
                    </label>
                    {tab === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setTab('forgot');
                          setError(null);
                          setSuccessMessage(null);
                          setGeneratedResetLink(null);
                        }}
                        className="text-[11px] font-bold text-[#FF762E] hover:text-[#FF2525] transition-colors"
                      >
                        Forgot Password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#929292] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 bg-[#090909] border border-[#454545] rounded-xl pl-10 pr-10 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#929292] hover:text-[#F5F5F5] p-1.5"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Optional Referral Code */}
                  <div className="mt-3.5">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5]">
                        Referral Code (Optional)
                      </label>
                      {referralProgramEnabled &&
                        settings?.referral_discount_config?.discount_enabled &&
                        settings.referral_discount_config.discount_value > 0 && (
                          <span className="font-mono-tech text-[10px] font-bold text-[#FF762E]">
                            {settings.referral_discount_config.discount_type === 'percentage'
                              ? `${settings.referral_discount_config.discount_value}% VIP OFF`
                              : `₹${settings.referral_discount_config.discount_value} VIP OFF`}
                          </span>
                        )}
                    </div>
                    <div className="relative">
                      <Gift className="w-4 h-4 text-[#929292] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        disabled={!referralProgramEnabled}
                        value={referralProgramEnabled ? referralCode : ''}
                        onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                        placeholder={
                          referralProgramEnabled
                            ? 'Optional code e.g. SF-XXXX'
                            : 'Referral Program is currently OFF.'
                        }
                        maxLength={32}
                        className={`w-full h-11 bg-[#090909] border rounded-xl pl-10 pr-3.5 text-xs uppercase tracking-wider font-mono-tech transition-colors ${
                          referralProgramEnabled
                            ? 'border-[#454545] text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF762E]'
                            : 'border-[#454545]/50 text-[#929292]/50 placeholder-[#929292]/45 cursor-not-allowed'
                        }`}
                      />
                    </div>
                    {!referralProgramEnabled && (
                      <p className="text-[11px] font-semibold text-[#FF762E] mt-1.5 flex items-center gap-1.5">
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
                    <div className="p-2.5 rounded-xl bg-[#090909] border border-[#454545] text-[11px] text-[#929292] flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[#FF2525] shrink-0" />
                      <span className="truncate">
                        Account: <strong className="text-[#F5F5F5]">{email}</strong>
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#929292] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        maxLength={128}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password (min 6 characters)"
                        className="w-full h-11 bg-[#090909] border border-[#454545] rounded-xl pl-10 pr-10 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#929292] hover:text-[#F5F5F5] p-1.5"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1.5">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-[#929292] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        maxLength={128}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full h-11 bg-[#090909] border border-[#454545] rounded-xl pl-10 pr-10 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#929292] hover:text-[#F5F5F5] p-1.5"
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
                className="w-full min-h-[48px] mt-2 px-4 rounded-xl ra-btn-primary text-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <span>
                  {submitting
                    ? 'Authenticating...'
                    : tab === 'login'
                    ? 'Sign In & Launch'
                    : tab === 'register'
                    ? 'Create Free Account'
                    : tab === 'forgot'
                    ? 'Send Reset Link'
                    : 'Update Password'}
                </span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>

              {(tab === 'forgot' || tab === 'reset') && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      typeof window !== 'undefined' &&
                      (window.location.search.includes('reset_token') ||
                        window.location.hash.includes('type=recovery'))
                    ) {
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
                  className="w-full min-h-[44px] rounded-xl ra-btn-secondary text-xs flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>
              )}
            </form>

            {/* Tactical Capabilities Strip */}
            <div className="mt-5 pt-4 border-t border-[#454545]/70 grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-lg bg-[#090909] border border-[#454545]">
                <BookOpen className="w-3.5 h-3.5 text-[#FF2525] mx-auto mb-1" />
                <p className="font-display text-[10px] text-[#F5F5F5] font-bold uppercase tracking-wider">Portals</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[#090909] border border-[#454545]">
                <GraduationCap className="w-3.5 h-3.5 text-[#FF762E] mx-auto mb-1" />
                <p className="font-display text-[10px] text-[#F5F5F5] font-bold uppercase tracking-wider">VIP Deck</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[#090909] border border-[#454545]">
                <Sparkles className="w-3.5 h-3.5 text-[#C5C5C5] mx-auto mb-1" />
                <p className="font-display text-[10px] text-[#F5F5F5] font-bold uppercase tracking-wider">Fast Pass</p>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Portal Switch */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onNavigateAdmin}
            className="min-h-[42px] px-4 rounded-xl bg-[#141414]/80 border border-[#454545]/60 hover:border-[#FF2525]/60 text-xs text-[#C5C5C5] hover:text-[#F5F5F5] font-medium inline-flex items-center gap-2 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#FF2525]" />
            <span>Staff Administrator? Command Login</span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-md text-center py-2 text-[11px] text-[#929292] font-mono-tech z-10">
        <p>© {new Date().getFullYear()} {appName}</p>
      </footer>
    </div>
  );
};


