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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ra-panel ra-corners rounded-2xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden">
        <div className="h-1 w-full ra-hazard-bar absolute top-0 left-0 right-0" />

        <button
          onClick={onClose}
          aria-label="Close sign in dialog"
          className="absolute top-3.5 right-3.5 w-9 h-9 flex items-center justify-center text-[#C5C5C5] hover:text-[#F5F5F5] rounded-lg bg-[#090909] border border-[#454545] hover:border-[#FF2525] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-5 pt-1">
          <div className="w-12 h-12 rounded-xl bg-[#090909] border border-[#FF2525]/55 flex items-center justify-center text-[#FF2525] mx-auto mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="font-display text-lg font-black text-[#F5F5F5] tracking-tight uppercase">
            {tab === 'login'
              ? 'Account Sign In'
              : tab === 'register'
              ? 'Create Account'
              : tab === 'forgot'
              ? 'Forgot Password'
              : 'Reset Password'}
          </h2>
          <p className="text-xs text-[#929292] mt-1">
            {tab === 'forgot'
              ? 'Enter your registered email to receive a reset link'
              : tab === 'reset'
              ? 'Enter and confirm your new password'
              : 'Access platforms, batches, and VIP membership'}
          </p>
        </div>

        {!loginEnabled && (tab === 'login' || tab === 'register') && (
          <div className="mb-4 p-3 rounded-xl bg-[#FF762E]/12 border border-[#FF762E]/45 text-[#F5F5F5] text-xs">
            <p className="font-bold text-[#FF762E]">Public login is temporarily disabled.</p>
            <p className="text-[11px] text-[#C5C5C5] mt-0.5">
              Only authorized staff credentials can sign in at this time.
            </p>
          </div>
        )}

        {(tab === 'login' || tab === 'register') && (
          <div className="grid grid-cols-2 p-1 bg-[#090909] rounded-xl border border-[#454545] mb-4 gap-1">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`min-h-[40px] text-xs font-display font-extrabold uppercase tracking-wider rounded-lg transition-colors ${
                tab === 'login' ? 'bg-[#FF2525] text-[#F5F5F5]' : 'text-[#929292] hover:text-[#F5F5F5]'
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
              className={`min-h-[40px] text-xs font-display font-extrabold uppercase tracking-wider rounded-lg transition-colors ${
                tab === 'register' ? 'bg-[#FF2525] text-[#F5F5F5]' : 'text-[#929292] hover:text-[#F5F5F5]'
              }`}
            >
              Register
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-xl bg-[#141414] border border-[#C5C5C5]/60 text-[#F5F5F5] text-xs space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#FF2525] mt-0.5" />
              <span>{successMessage}</span>
            </div>
            {generatedResetLink && tab === 'forgot' && (
              <button
                type="button"
                onClick={handleOpenGeneratedResetLink}
                className="w-full min-h-[40px] px-3 rounded-lg ra-btn-primary font-display font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Proceed to Reset Password</span>
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#F5F5F5] text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {(tab === 'login' || tab === 'register' || tab === 'forgot') && (
            <div>
              <label className="block text-[10px] font-mono-tech font-bold uppercase tracking-wider text-[#C5C5C5] mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full min-h-[44px] bg-[#090909] border border-[#454545] rounded-xl pl-9 pr-3 py-2 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525]"
                />
              </div>
            </div>
          )}

          {(tab === 'login' || tab === 'register') && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-mono-tech font-bold uppercase tracking-wider text-[#C5C5C5]">
                  Password
                </label>
                {tab === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('forgot');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[11px] font-semibold text-[#FF2525] hover:text-[#FF762E]"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[44px] bg-[#090909] border border-[#454545] rounded-xl pl-9 pr-10 py-2 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#929292] hover:text-[#F5F5F5] p-1.5"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="mt-3">
                <label className="block text-[10px] font-mono-tech font-bold uppercase tracking-wider text-[#C5C5C5] mb-1.5">
                  Referral Code (Optional)
                </label>
                <div className="relative">
                  <Gift className="w-4 h-4 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                    className={`w-full min-h-[44px] bg-[#090909] border rounded-xl pl-9 pr-3 py-2 text-xs uppercase tracking-wider font-mono-tech ${
                      referralProgramEnabled
                        ? 'border-[#454545] text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF762E]'
                        : 'border-[#454545]/60 text-[#929292]/60 placeholder-[#929292]/50 cursor-not-allowed opacity-70'
                    }`}
                  />
                </div>
                {!referralProgramEnabled && (
                  <p className="text-[10px] font-mono-tech text-[#FF762E] mt-1">
                    Referral Program is currently OFF.
                  </p>
                )}
              </div>
            </div>
          )}

          {tab === 'reset' && (
            <>
              <div>
                <label className="block text-[10px] font-mono-tech font-bold uppercase tracking-wider text-[#C5C5C5] mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    maxLength={128}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full min-h-[44px] bg-[#090909] border border-[#454545] rounded-xl pl-9 pr-3 py-2 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-mono-tech font-bold uppercase tracking-wider text-[#C5C5C5] mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    maxLength={128}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full min-h-[44px] bg-[#090909] border border-[#454545] rounded-xl pl-9 pr-3 py-2 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525]"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-2 min-h-[46px] py-2.5 rounded-xl ra-btn-primary disabled:opacity-60 font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2"
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
              className="w-full min-h-[42px] py-2 rounded-xl ra-btn-secondary text-xs font-semibold flex items-center justify-center gap-1.5"
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
