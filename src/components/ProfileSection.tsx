import React, { useState, useEffect, useCallback } from 'react';
import {
  Crown,
  Shield,
  User,
  LogOut,
  Calendar,
  Clock,
  CheckCircle2,
  Key,
  Sparkles,
  AlertCircle,
  LifeBuoy,
  Heart,
  ExternalLink,
  ShieldAlert,
  X,
  MessageSquarePlus,
  Star,
  Image as ImageIcon,
  Send,
  History,
  Eye,
  Gift,
  Copy,
  Share2,
  Tag,
} from 'lucide-react';
import { api, getStoredToken } from '../api.ts';
import type { UserProfile, PublicSettings, FeedbackCategory, UserFeedbackRecord } from '../types.ts';

const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  'General Feedback',
  'Bug Report',
  'Platform Issue',
  'VIP Membership',
  'Payment Issue',
  'Feature Request',
  'Other',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

const LiveCountdownLabel: React.FC<{
  targetIso: string | null | undefined;
  mode: 'vip' | 'free';
  externalNow?: number;
}> = React.memo(({ targetIso, mode, externalNow }) => {
  const [tickNow, setTickNow] = useState<number>(() => externalNow ?? Date.now());

  useEffect(() => {
    if (externalNow !== undefined) {
      setTickNow(externalNow);
      return;
    }
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setTickNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [externalNow]);

  if (!targetIso) {
    return <>{mode === 'vip' ? 'Lifetime VIP' : 'Access expired (00h 00m 00s)'}</>;
  }
  const targetMs = new Date(targetIso).getTime();
  const diff = targetMs - tickNow;
  if (diff <= 0) {
    return <>{mode === 'vip' ? 'VIP expired (00h 00m 00s)' : 'Access expired (00h 00m 00s)'}</>;
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return <>{`Access expires in ${days}d ${pad2(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s`}</>;
  }
  return <>{`Access expires in ${pad2(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s`}</>;
});

interface ProfileSectionProps {
  user: UserProfile | null;
  settings?: PublicSettings | null;
  now?: number;
  onLogout: () => void;
  onGoToVip: () => void;
  onSwitchAccount: (email: string, pass: string) => void;
  onOpenAuth: () => void;
  onOpenKeyGen?: () => void;
  onUserUpdated?: () => void;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({
  user,
  settings,
  now: externalNow,
  onLogout,
  onGoToVip,
  onOpenAuth,
  onOpenKeyGen,
  onUserUpdated,
}) => {
  const [showDonationModal, setShowDonationModal] = useState(false);

  // Referral Section State on Profile Page
  const [referralData, setReferralData] = useState<{
    referral_program_enabled: boolean;
    referral_code: string;
    referred_by_code: string | null;
    my_attribution?: {
      is_referred: boolean;
      referred_by_code: string | null;
      referred_at: string | null;
      referrer_email: string | null;
      discount_eligible: boolean;
      discount_label: string | null;
      reason: string | null;
    };
    sales_summary?: {
      total_referrals: number;
      vip_purchases: number;
      reward_days_earned: number;
    } | null;
    permissions?: {
      can_access_referral_dashboard: boolean;
      can_create_share_referral_link: boolean;
    };
  } | null>(null);
  const [copiedRefCode, setCopiedRefCode] = useState(false);
  const [copiedRefLink, setCopiedRefLink] = useState(false);
  const [applyCodeInput, setApplyCodeInput] = useState('');
  const [applyingCode, setApplyingCode] = useState(false);
  const [applyCodeMsg, setApplyCodeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User Feedback State
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackTab, setFeedbackTab] = useState<'submit' | 'history'>('submit');
  const [fbCategory, setFbCategory] = useState<FeedbackCategory>('General Feedback');
  const [fbRating, setFbRating] = useState<number>(5);
  const [fbMessage, setFbMessage] = useState<string>('');
  const [fbAttachmentDataUrl, setFbAttachmentDataUrl] = useState<string>('');
  const [fbAttachmentMime, setFbAttachmentMime] = useState<string>('');
  const [fbAttachmentName, setFbAttachmentName] = useState<string>('');
  const [fbSubmitting, setFbSubmitting] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);
  const [fbSuccess, setFbSuccess] = useState<string | null>(null);
  const [myFeedbackList, setMyFeedbackList] = useState<UserFeedbackRecord[]>([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [previewAttachmentUrl, setPreviewAttachmentUrl] = useState<string | null>(null);

  const now = externalNow ?? Date.now();

  const loadMyReferralSummary = useCallback(async () => {
    if (!user) {
      setReferralData(null);
      return;
    }
    try {
      const res = await api.getMyReferralDashboard();
      setReferralData(res as any);
    } catch {
      // If restricted or offline, fallback to user profile fields
      setReferralData({
        referral_program_enabled: settings?.referral_program_enabled !== false,
        referral_code: user.referral_code || '',
        referred_by_code: (user as any).referred_by_code || null,
        permissions: user.referral_permissions
          ? {
              can_access_referral_dashboard: user.referral_permissions.can_access_referral_dashboard,
              can_create_share_referral_link: user.referral_permissions.can_create_share_referral_link,
            }
          : { can_access_referral_dashboard: true, can_create_share_referral_link: true },
      });
    }
  }, [user, settings?.referral_program_enabled]);

  useEffect(() => {
    if (user) {
      void loadMyReferralSummary();
    } else {
      setReferralData(null);
    }
  }, [user?.id, loadMyReferralSummary]);

  const handleCopyProfileRefCode = () => {
    const code = referralData?.referral_code || user?.referral_code || '';
    if (!code) return;
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedRefCode(true);
    setTimeout(() => setCopiedRefCode(false), 2000);
  };

  const handleShareProfileRefLink = async () => {
    const code = referralData?.referral_code || user?.referral_code || '';
    if (!code) return;
    const shareUrl = `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
    const shareText = `Join Study Fox using my referral code ${code} to unlock a special discount on your VIP Membership! ${shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Study Fox VIP Referral',
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // Fallback to clipboard copy if user cancels native share sheet
      }
    }
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedRefLink(true);
    setTimeout(() => setCopiedRefLink(false), 2000);
  };

  const handleApplyReferralOnProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = applyCodeInput.trim().toUpperCase();
    if (!clean) return;
    setApplyingCode(true);
    setApplyCodeMsg(null);
    try {
      const res = await api.applyReferralCode(clean);
      setApplyCodeMsg({
        type: 'success',
        text: res.message || `Referral code ${clean} linked! Your VIP discount will apply automatically at checkout.`,
      });
      setApplyCodeInput('');
      await loadMyReferralSummary();
      if (onUserUpdated) onUserUpdated();
    } catch (err: unknown) {
      setApplyCodeMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to apply referral code.',
      });
    } finally {
      setApplyingCode(false);
    }
  };

  const loadMyFeedback = useCallback(async () => {
    if (!user) return;
    setLoadingFeedback(true);
    try {
      const list = await api.getMyFeedback();
      setMyFeedbackList(list);
    } catch {
      // Ignore transient error
    } finally {
      setLoadingFeedback(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && feedbackOpen) {
      void loadMyFeedback();
    }
  }, [user, feedbackOpen, loadMyFeedback]);

  const handleFeedbackImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFbError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setFbAttachmentDataUrl('');
      setFbAttachmentMime('');
      setFbAttachmentName('');
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setFbError('Please select a valid PNG, JPG, or WEBP image.');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFbError('Screenshot image must be under 5MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFbAttachmentDataUrl(reader.result);
        setFbAttachmentMime(file.type);
        setFbAttachmentName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFbError(null);
    setFbSuccess(null);

    const trimmedMsg = fbMessage.trim();
    if (trimmedMsg.length < 3) {
      setFbError('Please enter your feedback message (at least 3 characters).');
      return;
    }

    setFbSubmitting(true);
    try {
      const res = await api.submitFeedback({
        category: fbCategory,
        rating: fbRating,
        message: trimmedMsg,
        ...(fbAttachmentDataUrl && {
          attachment_data_url: fbAttachmentDataUrl,
          attachment_mime_type: fbAttachmentMime || 'image/png',
        }),
      });
      setFbSuccess(res.message || 'Thank you! Your feedback has been submitted successfully.');
      setFbMessage('');
      setFbRating(5);
      setFbCategory('General Feedback');
      setFbAttachmentDataUrl('');
      setFbAttachmentMime('');
      setFbAttachmentName('');
      void loadMyFeedback();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit feedback. Please try again.';
      setFbError(msg);
    } finally {
      setFbSubmitting(false);
    }
  };

  const getValidHttpUrl = (raw?: string | null): string | null => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return null;
    const candidate =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
      return null;
    } catch {
      return null;
    }
  };

  const validSupportUrl = getValidHttpUrl(settings?.support_url);
  const resolvedSupportImageUrl =
    (settings?.support_image_url && settings.support_image_url.trim()) ||
    (settings?.donation_qr_url && settings.donation_qr_url.trim()) ||
    '';
  const hasSupportImage = Boolean(resolvedSupportImageUrl.length > 0);
  const showSupportOption = Boolean(settings?.support_enabled !== false && (validSupportUrl || hasSupportImage));

  const validDonationUrl = getValidHttpUrl(settings?.donation_url);
  const resolvedDonationQrUrl =
    (settings?.donation_qr_url && settings.donation_qr_url.trim()) ||
    (settings?.support_image_url && settings.support_image_url.trim()) ||
    '';
  const hasDonationQr = Boolean(resolvedDonationQrUrl.length > 0);
  const showDonationOption = Boolean(settings?.donation_enabled && (validDonationUrl || hasDonationQr));

  const handleOpenExternal = (url: string | null) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!user) {
    return (
      <div className="pb-24 pt-8 px-4 max-w-lg mx-auto space-y-4">
        <div className="bg-[#0C1222]/95 border border-slate-800/90 rounded-2xl p-6 text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500 mb-3">
            <User className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-white">Guest Session</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto mb-5">
            Sign in or create an account to view your private membership details, VIP validity, and custom platform preferences.
          </p>

          <button
            onClick={onOpenAuth}
            style={{
              background: 'linear-gradient(135deg, var(--theme-primary, #06b6d4), var(--theme-secondary, #3b82f6))',
            }}
            className="px-6 py-2.5 rounded-full text-white font-bold text-xs shadow-lg shadow-black/40 hover:opacity-95 active:scale-95 transition-all"
          >
            Sign In / Register
          </button>
        </div>

        {/* Support & Donation cards for guests too when enabled */}
        {(showSupportOption || showDonationOption) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {showSupportOption && (
              <div className="bg-[#0C1222]/95 border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-3 text-left shadow-md">
                <button
                  type="button"
                  onClick={() => validSupportUrl && handleOpenExternal(validSupportUrl)}
                  className="w-full flex items-center justify-between text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                      <LifeBuoy className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-extrabold text-white truncate">
                        {settings?.support_title || 'Support / Help'}
                      </h4>
                      <p className="text-[10px] text-slate-400 truncate">
                        {settings?.support_description || 'Get assistance from our team'}
                      </p>
                    </div>
                  </div>
                  {validSupportUrl && (
                    <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0 ml-2" />
                  )}
                </button>
              </div>
            )}

            {showDonationOption && (
              <button
                onClick={() => setShowDonationModal(true)}
                className="bg-[#0C1222]/95 hover:bg-slate-900 border border-pink-500/30 rounded-2xl p-4 flex items-center justify-between text-left transition-all shadow-md group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/30 text-pink-400 flex items-center justify-center shrink-0">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-extrabold text-white truncate">
                      {settings?.donation_title || 'Support Study Fox'}
                    </h4>
                    <p className="text-[10px] text-slate-400 truncate">Contribute to our platform</p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-pink-400 group-hover:text-pink-300 shrink-0 ml-2" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const roleLabel =
    user.role === 'super_admin'
      ? 'Super Administrator'
      : user.role === 'admin'
      ? 'Administrator'
      : 'Student Member';

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return 'Not configured';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Determine active states from actual saved timestamps (blocked users do not have active access)
  const isVipDeviceMismatch = Boolean(
    user.role === 'user' && user.vip_active && user.vip_device_status === 'bound_other'
  );
  const isVipValid = Boolean(
    !user.is_blocked &&
    user.vip_active &&
    (!user.vip_expires_at || new Date(user.vip_expires_at).getTime() > now)
  );

  const isFreeAccessValid = Boolean(
    !user.is_blocked &&
    user.free_access_expires_at &&
    new Date(user.free_access_expires_at).getTime() > now
  );

  const getFeedbackStatusStyle = (status: UserFeedbackRecord['status']) => {
    switch (status) {
      case 'Resolved':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'In Review':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'Rejected':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default:
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    }
  };

  return (
    <div className="pb-24 pt-4 px-4 max-w-lg mx-auto space-y-4">
      {/* Blocked Account Warning Banner */}
      {user.is_blocked && (
        <div className="bg-rose-950/60 border border-rose-500/50 rounded-2xl p-4 shadow-lg flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-200 space-y-1">
            <p className="font-extrabold text-rose-300 uppercase tracking-wider">Account Blocked</p>
            <p className="leading-relaxed">
              Your account has been restricted by an administrator. Protected batches and study resources are currently unavailable.
              {user.blocked_reason ? ` Reason: ${user.blocked_reason}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* User Header Card */}
      <div className="bg-[#0C1222]/95 border border-slate-800/90 rounded-2xl p-5 shadow-lg flex items-center gap-4">
        <div
          style={{
            background: 'linear-gradient(135deg, var(--theme-primary, #06b6d4), var(--theme-secondary, #3b82f6))',
          }}
          className="w-14 h-14 rounded-2xl p-0.5 shadow-md shrink-0"
        >
          <div className="w-full h-full rounded-2xl bg-[#080D19] flex items-center justify-center font-bold text-lg text-white">
            {(user.name || user.email).substring(0, 2).toUpperCase()}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {user.name && user.name.trim().length > 0 && (
            <h2 className="text-sm font-extrabold text-white truncate">{user.name}</h2>
          )}
          <div className="flex items-center gap-2">
            <p className={`${user.name ? 'text-xs text-slate-300' : 'text-sm font-extrabold text-white'} truncate`}>
              {user.email}
            </p>
          </div>
          <p
            style={{ color: 'var(--theme-primary, #06b6d4)' }}
            className="text-xs font-semibold flex items-center gap-1 mt-0.5"
          >
            <Shield className="w-3.5 h-3.5" />
            {roleLabel}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Joined: {new Date(user.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* 1. VIP MEMBERSHIP CARD */}
      <div
        className={`border rounded-2xl p-5 shadow-xl transition-all ${
          isVipValid
            ? isVipDeviceMismatch
              ? 'bg-gradient-to-br from-rose-950/50 to-[#0F172A] border-rose-500/50 shadow-black/40'
              : 'bg-gradient-to-br from-[#0F172A] to-[#1E1B4B] border-amber-500/40 shadow-black/40'
            : 'bg-[#0C1222]/90 border-slate-800/80 shadow-black/30'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl ${
                isVipValid ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                Membership Tier
              </p>
              <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 mt-0.5">
                {isVipValid ? (
                  <>
                    <span>VIP Member</span>
                    {isVipDeviceMismatch ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        Device Locked
                      </span>
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    )}
                  </>
                ) : (
                  <>
                    <span>Free Tier Student</span>
                    <span className="text-[10px] font-semibold text-slate-400">(Standard)</span>
                  </>
                )}
              </h3>
            </div>
          </div>

          {!isVipValid && !user.is_blocked && (
            <button
              onClick={onGoToVip}
              style={{
                background: 'linear-gradient(135deg, var(--vip-theme-accent, #f59e0b), var(--vip-theme-button, #eab308))',
                color: '#000000',
              }}
              className="px-3.5 py-1.5 rounded-full font-extrabold text-xs shadow-md active:scale-95 transition-transform flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-black" />
              <span>Upgrade</span>
            </button>
          )}
        </div>

        {isVipValid ? (
          <div className="mt-4 pt-4 border-t border-purple-900/40 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-amber-400" /> Remaining VIP Duration:
              </span>
              <span className="font-bold text-amber-300 tabular-nums">
                <LiveCountdownLabel targetIso={user.vip_expires_at} mode="vip" externalNow={externalNow} />
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Calendar className="w-3.5 h-3.5 text-slate-400" /> VIP Expiry Date & Time:
              </span>
              <span className="font-bold text-white tabular-nums">
                {formatDateTime(user.vip_expires_at)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Shield className="w-3.5 h-3.5 text-emerald-400" /> Registered VIP Device:
              </span>
              <span className={`font-semibold ${isVipDeviceMismatch ? 'text-rose-400' : 'text-emerald-400'}`}>
                {user.vip_device_label || 'Authorized Primary Device'}
                {!isVipDeviceMismatch ? ' (This Device)' : ' (Other Device)'}
              </span>
            </div>

            {isVipDeviceMismatch && (
              <div className="mt-3 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-[11px] text-rose-200 space-y-1.5">
                <p className="font-extrabold text-rose-300">
                  VIP Access Active on Another Device
                </p>
                <p className="leading-relaxed">
                  Your VIP entitlement is bound to <span className="font-bold text-white">{user.vip_device_label || 'your primary device'}</span>. Single-device protection blocks VIP usage on unauthorized second devices. Please use your registered device or contact Admin/Support for a device reset.
                </p>
                {validSupportUrl && (
                  <button
                    onClick={() => handleOpenExternal(validSupportUrl)}
                    className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] transition-colors"
                  >
                    <span>Contact Support for Device Reset</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* 2. FREE STUDENT ACCESS STATUS CARD (Always shown for non-VIP or expired VIP) */}
      {!isVipValid && (
        <div className="bg-[#0C1222]/95 border border-slate-800/90 rounded-2xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`p-2 rounded-xl ${
                  isFreeAccessValid
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-rose-950/40 text-rose-400'
                }`}
              >
                <Key className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                  Session Access Pass
                </p>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 mt-0.5">
                  {isFreeAccessValid ? (
                    <>
                      <span>Active Access</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </>
                  ) : (
                    <>
                      <span className="text-rose-400">Access Expired / Required</span>
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    </>
                  )}
                </h3>
              </div>
            </div>

            {onOpenKeyGen && !user.is_blocked && (
              <button
                onClick={onOpenKeyGen}
                style={{
                  backgroundColor: 'var(--theme-button, #0284c7)',
                  color: 'var(--theme-text, #ffffff)',
                }}
                className="px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md hover:opacity-90 active:scale-95"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{isFreeAccessValid ? 'Renew Key' : 'Generate Key'}</span>
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800/80 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Remaining Time:
              </span>
              <span
                className={`font-bold tabular-nums ${
                  isFreeAccessValid ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isFreeAccessValid ? (
                  <LiveCountdownLabel
                    targetIso={user.free_access_expires_at}
                    mode="free"
                    externalNow={externalNow}
                  />
                ) : (
                  'Access expired (00h 00m 00s)'
                )}
              </span>
            </div>

            {user.free_access_expires_at && (
              <div className="flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" /> Expiry Date & Time:
                </span>
                <span className="font-bold text-white tabular-nums">
                  {formatDateTime(user.free_access_expires_at)}
                </span>
              </div>
            )}

            {!isFreeAccessValid && !user.is_blocked && (
              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                Your session pass has expired. Complete the quick sponsor link to activate a new access period configured by the administrator.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 2B. REFERRAL CODE & REWARDS CARD ON PROFILE PAGE (Governed by Global Referral Switch & User Permissions) */}
      {!user.is_blocked &&
        settings?.referral_program_enabled !== false &&
        (referralData === null || referralData.referral_program_enabled !== false) &&
        referralData?.permissions?.can_access_referral_dashboard !== false && (
          <div className="bg-[#0C1222]/95 border border-amber-500/35 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Gift className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-extrabold text-white">
                      Your Referral Code & Rewards
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Earn Bonus VIP Days
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Share your code with friends — they get a VIP discount and you earn bonus VIP days!
                  </p>
                </div>
              </div>
            </div>

            {/* User's Unique Referral Code + Copy & Share Actions */}
            {referralData?.permissions?.can_create_share_referral_link !== false && (
              <div className="p-3 rounded-xl bg-[#070B14] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Your Unique Referral Code
                  </span>
                  <span className="text-base font-mono font-extrabold text-amber-400 tracking-wide">
                    {referralData?.referral_code || user.referral_code || 'SF-REF-LOADING'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyProfileRefCode}
                    className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5 text-amber-400" />
                    <span>{copiedRefCode ? 'Copied Code!' : 'Copy Code'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareProfileRefLink}
                    className="flex-1 sm:flex-initial px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs inline-flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{copiedRefLink ? 'Link Copied!' : 'Share Link'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Personal Referral Stats Mini-Grid */}
            {referralData?.sales_summary && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-[#070B14]/80 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Referred Friends</span>
                  <strong className="text-sm font-extrabold text-white font-mono">
                    {referralData.sales_summary.total_referrals}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#070B14]/80 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">VIP Conversions</span>
                  <strong className="text-sm font-extrabold text-emerald-400 font-mono">
                    {referralData.sales_summary.vip_purchases}
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[#070B14]/80 border border-slate-800/80">
                  <span className="text-[10px] text-slate-400 block">Bonus Days Earned</span>
                  <strong className="text-sm font-extrabold text-amber-400 font-mono">
                    +{referralData.sales_summary.reward_days_earned}d
                  </strong>
                </div>
              </div>
            )}

            {/* Incoming Referral Attribution Status / Apply Friend's Referral Code */}
            {referralData?.my_attribution?.is_referred || user.referred_by_user_id ? (
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-2.5 text-xs">
                <Tag className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-extrabold text-emerald-300">
                      Referral Code Linked:{' '}
                      <span className="font-mono">
                        {referralData?.my_attribution?.referred_by_code ||
                          (user as any).referred_by_code ||
                          'Verified'}
                      </span>
                    </span>
                    {referralData?.my_attribution?.discount_eligible && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {referralData.my_attribution.discount_label || 'Discount Active'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                    {referralData?.my_attribution?.discount_eligible
                      ? 'Your referral discount is saved to your account and will automatically reduce your VIP plan price whenever you upgrade!'
                      : referralData?.my_attribution?.reason ||
                        'Your account is linked to this referral code.'}
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleApplyReferralOnProfile} className="pt-2 border-t border-slate-800/80 space-y-2">
                <label className="block text-[11px] font-bold text-slate-300">
                  Have a Friend&apos;s Referral Code? Apply it for a VIP Discount:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={applyCodeInput}
                    onChange={(e) => setApplyCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. SF-REF-A1B2C3"
                    className="flex-1 px-3 py-2 rounded-xl bg-[#070B14] border border-slate-800 text-xs text-white font-mono uppercase focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={applyingCode || !applyCodeInput.trim()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs transition-colors shrink-0"
                  >
                    {applyingCode ? 'Applying...' : 'Apply Code'}
                  </button>
                </div>
                {applyCodeMsg && (
                  <p
                    className={`text-[11px] font-semibold ${
                      applyCodeMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {applyCodeMsg.text}
                  </p>
                )}
              </form>
            )}
          </div>
        )}

      {/* 3. USER FEEDBACK SYSTEM (Available to Both VIP and Non-VIP Authenticated Users) */}
      {!user.is_blocked && (
        <div className="bg-[#0C1222]/95 border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
                <MessageSquarePlus className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-extrabold text-white truncate">Student Feedback</h4>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      isVipValid
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    {isVipValid ? 'VIP Member' : 'Non-VIP'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">
                  Share feedback, report bugs, or request features
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setFeedbackOpen(!feedbackOpen);
                setFbError(null);
                setFbSuccess(null);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md active:scale-95 transition-all shrink-0"
            >
              {feedbackOpen ? 'Close' : 'Feedback'}
            </button>
          </div>

          {feedbackOpen && (
            <div className="pt-3 border-t border-slate-800/80 space-y-4 animate-in fade-in duration-200">
              {/* Sub-navigation: Submit Feedback vs My Feedback History */}
              <div className="grid grid-cols-2 p-1 bg-[#070B14] rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackTab('submit');
                    setFbError(null);
                  }}
                  className={`py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    feedbackTab === 'submit'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span>Submit Feedback</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackTab('history');
                    void loadMyFeedback();
                  }}
                  className={`py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    feedbackTab === 'history'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>My Submissions ({myFeedbackList.length})</span>
                </button>
              </div>

              {feedbackTab === 'submit' ? (
                <form onSubmit={handleFeedbackSubmit} className="space-y-3.5">
                  {fbSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/70 text-emerald-200 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{fbSuccess}</span>
                    </div>
                  )}

                  {fbError && (
                    <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{fbError}</span>
                    </div>
                  )}

                  {/* 1. Category */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                      1. Feedback Category
                    </label>
                    <select
                      value={fbCategory}
                      onChange={(e) => setFbCategory(e.target.value as FeedbackCategory)}
                      className="w-full bg-[#070B14] border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      {FEEDBACK_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat} className="bg-[#0C1222] text-white">
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. Rating (1 to 5 stars) */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                      2. Overall Rating ({fbRating} / 5 Stars)
                    </label>
                    <div className="flex items-center gap-2 bg-[#070B14] border border-slate-800 rounded-xl p-2.5">
                      {[1, 2, 3, 4, 5].map((starValue) => (
                        <button
                          key={starValue}
                          type="button"
                          onClick={() => setFbRating(starValue)}
                          className="p-1 rounded-lg hover:bg-slate-800/80 transition-transform active:scale-90"
                          title={`Rate ${starValue} star${starValue > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`w-6 h-6 transition-colors ${
                              starValue <= fbRating
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-600'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-auto text-[11px] font-bold text-amber-300">
                        {fbRating === 5
                          ? 'Excellent'
                          : fbRating === 4
                          ? 'Good'
                          : fbRating === 3
                          ? 'Average'
                          : fbRating === 2
                          ? 'Needs Work'
                          : 'Poor'}
                      </span>
                    </div>
                  </div>

                  {/* 3. Feedback Message */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                      3. Feedback Message
                    </label>
                    <textarea
                      required
                      rows={4}
                      maxLength={2000}
                      value={fbMessage}
                      onChange={(e) => setFbMessage(e.target.value)}
                      placeholder="Describe your feedback, suggestion, or issue in detail..."
                      className="w-full bg-[#070B14] border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                      <span>Logged in as: {user.email}</span>
                      <span>{fbMessage.length} / 2000</span>
                    </div>
                  </div>

                  {/* 4. Optional Screenshot / Image Attachment */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                      4. Screenshot / Image Attachment (Optional, Max 5MB)
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 cursor-pointer bg-[#070B14] hover:bg-slate-900 border border-dashed border-slate-700 rounded-xl p-2.5 text-xs text-slate-300 flex items-center justify-center gap-2 transition">
                        <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span className="truncate">
                          {fbAttachmentName || 'Choose PNG, JPG, or WEBP screenshot'}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp"
                          onChange={handleFeedbackImageChange}
                          className="hidden"
                        />
                      </label>
                      {fbAttachmentDataUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setFbAttachmentDataUrl('');
                            setFbAttachmentMime('');
                            setFbAttachmentName('');
                          }}
                          className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 hover:bg-rose-900/60"
                          title="Remove attachment"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {fbAttachmentDataUrl && (
                      <div className="mt-2 p-2 rounded-xl bg-[#070B14] border border-slate-800 inline-block">
                        <img
                          src={fbAttachmentDataUrl}
                          alt="Attachment Preview"
                          className="max-h-28 rounded-lg object-contain"
                        />
                      </div>
                    )}
                  </div>

                  {/* 5. Submit Feedback Button */}
                  <button
                    type="submit"
                    disabled={fbSubmitting}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{fbSubmitting ? 'Submitting Feedback...' : 'Submit Feedback'}</span>
                  </button>
                </form>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {loadingFeedback ? (
                    <div className="text-center py-6 text-xs text-slate-400">
                      Loading your feedback history...
                    </div>
                  ) : myFeedbackList.length === 0 ? (
                    <div className="text-center py-6 bg-[#070B14] rounded-xl border border-slate-800/80 p-4">
                      <p className="text-xs font-bold text-slate-300">No feedback submitted yet</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Your submitted feedback and review statuses will appear here.
                      </p>
                    </div>
                  ) : (
                    myFeedbackList.map((fb) => {
                      const token = getStoredToken();
                      const attachHref =
                        fb.attachment_url && token
                          ? `${fb.attachment_url}${fb.attachment_url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
                          : fb.attachment_url;

                      return (
                        <div
                          key={fb.id}
                          className="bg-[#070B14] border border-slate-800/90 rounded-xl p-3 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-extrabold text-white">{fb.category}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getFeedbackStatusStyle(
                                fb.status
                              )}`}
                            >
                              {fb.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3.5 h-3.5 ${
                                  s <= fb.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-700'
                                }`}
                              />
                            ))}
                            <span className="text-[10px] text-slate-400 ml-1.5">
                              {new Date(fb.created_at).toLocaleString()}
                            </span>
                          </div>

                          <p className="text-slate-300 text-[11px] leading-relaxed whitespace-pre-wrap break-words">
                            {fb.message}
                          </p>

                          {attachHref && (
                            <button
                              type="button"
                              onClick={() => setPreviewAttachmentUrl(attachHref)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-indigo-300 text-[10px] font-bold"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View Attached Screenshot</span>
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. SUPPORT & DONATION SECTION */}
      {(showSupportOption || showDonationOption) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {showSupportOption && (
            <div className="bg-[#0C1222]/95 border border-slate-800/90 rounded-2xl p-4 flex flex-col gap-3 text-left shadow-lg">
              <button
                type="button"
                onClick={() => validSupportUrl && handleOpenExternal(validSupportUrl)}
                className="w-full flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                    <LifeBuoy className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-extrabold text-white truncate">
                      {settings?.support_title || 'Support / Help'}
                    </h4>
                    <p className="text-[10px] text-slate-400 truncate">
                      {settings?.support_description || 'Contact help & support'}
                    </p>
                  </div>
                </div>
                {validSupportUrl && (
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0 ml-2" />
                )}
              </button>
            </div>
          )}

          {showDonationOption && (
            <div className="bg-[#0C1222]/95 border border-pink-500/30 rounded-2xl p-4 flex flex-col gap-3 text-left shadow-lg">
              <button
                type="button"
                onClick={() => setShowDonationModal(true)}
                className="w-full flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-pink-500/15 border border-pink-500/30 text-pink-400 flex items-center justify-center shrink-0">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-extrabold text-white truncate">
                      {settings?.donation_title || 'Support Study Fox'}
                    </h4>
                    <p className="text-[10px] text-slate-400 truncate">
                      {settings?.donation_button_text || 'Donate Now'}
                    </p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-pink-400 group-hover:text-pink-300 shrink-0 ml-2" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Logout Button */}
      <button
        onClick={onLogout}
        className="w-full py-3 rounded-2xl bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/40 text-rose-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-md"
      >
        <LogOut className="w-4 h-4" />
        <span>Log Out</span>
      </button>

      {/* Attachment Preview Modal */}
      {previewAttachmentUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewAttachmentUrl(null)}
        >
          <div
            className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-lg w-full p-4 relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-extrabold text-white">Attached Screenshot</h4>
              <button
                type="button"
                onClick={() => setPreviewAttachmentUrl(null)}
                className="p-1 rounded-lg bg-slate-900 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <img
              src={previewAttachmentUrl}
              alt="Feedback Attachment"
              className="max-h-[70vh] w-auto mx-auto rounded-xl object-contain"
            />
          </div>
        </div>
      )}

      {/* Donation Modal */}
      {showDonationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0C1222] border border-pink-500/40 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-center">
            <button
              onClick={() => setShowDonationModal(false)}
              aria-label="Close donation dialog"
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg bg-slate-900/60"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-pink-500/15 border border-pink-500/30 flex items-center justify-center mx-auto text-pink-400 mb-3">
              <Heart className="w-6 h-6" />
            </div>

            <h3 className="text-base font-extrabold text-white">
              {settings?.donation_title || 'Support Study Fox'}
            </h3>
            {settings?.donation_message && (
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed whitespace-pre-line">
                {settings.donation_message}
              </p>
            )}

            {hasDonationQr ? (
              <div className="mt-4 bg-white p-3 rounded-2xl inline-block mx-auto shadow-inner">
                <img
                  src={resolvedDonationQrUrl}
                  alt="Donation QR Code"
                  className="w-44 h-44 object-contain mx-auto"
                />
              </div>
            ) : (
              <div className="mt-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs">
                No donation QR image has been configured yet.
              </div>
            )}

            <div className="mt-5 space-y-2">
              {validDonationUrl && (
                <button
                  onClick={() => {
                    handleOpenExternal(validDonationUrl);
                    setShowDonationModal(false);
                  }}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Heart className="w-4 h-4" />
                  <span>{settings?.donation_button_text || 'Donate Now'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setShowDonationModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold text-xs border border-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

