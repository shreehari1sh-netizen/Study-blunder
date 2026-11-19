import React, { useState } from 'react';
import { X, Lock, Mail, AlertCircle, ArrowRight, ArrowLeft, ShieldCheck, CheckCircle2, KeyRound, Eye, EyeOff, Gift } from 'lucide-react';
import { api } from '../api.ts';
import type { UserProfile } from '../types.ts';

interface AuthModalProps {
  loginEnabled: boolean;
  referralProgramEnabled?: boolean;
  onSuccess: (user: UserProfile) => void;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  loginEnabled,
  referralProgramEnabled = true,
  onSuccess,
  onClose,
}) => {
  const [tab, setTab] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [generatedResetLink, setGeneratedResetLink] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const cleanRef = referralProgramEnabled && referralCode.trim() ? referralCode.trim().toUpperCase() : undefined;
      if (tab === 'login') {
        const res = await api.login(email.trim(), password, cleanRef);
        onSuccess(res.user);
        onClose();
      } else if (tab === 'register') {
        const res = await api.register(email.trim(), password, cleanRef);
        onSuccess(res.user);
        onClose();
      } else if (tab === 'forgot') {
        const res = await api.forgotPassword(email.trim());
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
          new_password: newPassword,
          confirm_password: confirmPassword,
        });
        setResetToken('');
        setGeneratedResetLink(null);
        setNewPassword('');
        setConfirmPassword('');
        setPassword('');
        setSuccessMessage(res.message || 'Password updated! You can now sign in with your new password.');
        setTab('login');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0C1222] border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-900/60"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white mx-auto shadow-md shadow-purple-900/40 mb-2.5">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-base font-extrabold text-white">
            {tab === 'login'
              ? 'Account Sign In'
              : tab === 'register'
              ? 'Create New Account'
              : tab === 'forgot'
              ? 'Forgot Password'
              : 'Reset Password'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {tab === 'forgot'
              ? 'Enter your registered email to receive a reset link'
              : tab === 'reset'
              ? 'Enter and confirm your new password'
              : 'Access platforms, batches, and VIP membership'}
          </p>
        </div>

        {/* Login Page Disabled Notice if applicable */}
        {!loginEnabled && (tab === 'login' || tab === 'register') && (
          <div className="mb-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
            <p className="font-bold">Public login is temporarily disabled.</p>
            <p className="text-[11px] text-amber-300/80 mt-0.5">
              Only authorized staff credentials can sign in at this time.
            </p>
          </div>
        )}

        {/* Tab Switcher */}
        {(tab === 'login' || tab === 'register') && (
          <div className="grid grid-cols-2 p-1 bg-[#070B14] rounded-xl border border-slate-800/80 mb-4">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                tab === 'login' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
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
              className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                tab === 'register' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-700/70 text-emerald-200 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <span>{successMessage}</span>
            </div>
            {generatedResetLink && tab === 'forgot' && (
              <button
                type="button"
                onClick={handleOpenGeneratedResetLink}
                className="w-full py-1.5 px-3 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-200 font-bold text-[11px] flex items-center justify-center gap-1.5 transition"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Proceed to Reset Password Page</span>
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {(tab === 'login' || tab === 'register' || tab === 'forgot') && (
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {(tab === 'login' || tab === 'register') && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-300">Password</label>
                {tab === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('forgot');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="mt-3">
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Enter Referral Code (Optional)
                </label>
                <div className="relative">
                  <Gift className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    disabled={!referralProgramEnabled}
                    value={referralProgramEnabled ? referralCode : ''}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    placeholder={
                      referralProgramEnabled
                        ? 'Enter Referral Code (Optional)'
                        : 'Referral Program is currently OFF.'
                    }
                    maxLength={32}
                    className={`w-full bg-[#080D19] border rounded-xl pl-9 pr-3 py-2 text-xs uppercase tracking-wider font-mono ${
                      referralProgramEnabled
                        ? 'border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/70'
                        : 'border-slate-800/60 text-slate-500 placeholder-slate-500 cursor-not-allowed opacity-75'
                    }`}
                  />
                </div>
                {!referralProgramEnabled && (
                  <p className="text-[10px] font-semibold text-amber-400/90 mt-1">
                    Referral Program is currently OFF.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === 'reset' && (
            <>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">New Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    maxLength={128}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">Confirm New Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    maxLength={128}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-purple-950/50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <span>
              {submitting
                ? 'Please wait...'
                : tab === 'login'
                ? 'Sign In'
                : tab === 'register'
                ? 'Create Account'
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
                setTab('login');
                setError(null);
                setSuccessMessage(null);
              }}
              className="w-full py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Sign In</span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
