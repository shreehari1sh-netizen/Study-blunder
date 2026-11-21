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
import {
  XpLeaderboardCard,
  ParentsReportCard,
  DualTelegramChannelsCard,
  ThemeModeCard,
} from './StudentGrowthWidgets.tsx';

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
  colorMode?: 'dark' | 'light';
  onToggleColorMode?: () => void;
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
  colorMode = 'dark',
  onToggleColorMode,
  onLogout,
  onGoToVip,
  onOpenAuth,
  onOpenKeyGen,
  onUserUpdated,
}) => {
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [leaderboardRefreshKey, setLeaderboardRefreshKey] = useState(0);

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
    const brandName = settings?.app_name || 'STUDY BLUNDER';
    const shareUrl = `${window.location.origin}/?ref=${encodeURIComponent(code)}`;
    const shareText = `Join ${brandName} using my referral code ${code} to unlock a special discount on your VIP Membership! ${shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${brandName} VIP Referral`,
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
      <div className="pb-28 pt-6 px-3.5 sm:px-5 max-w-xl lg:max-w-3xl mx-auto space-y-4">
        <div className="ra-panel-red ra-corners rounded-2xl overflow-hidden text-center">
          <div className="ra-hazard-bar h-1.5 w-full" />
          <div className="p-6">
            <div className="w-14 h-14 rounded-xl bg-[#090909] border border-[#FF2525]/55 flex items-center justify-center mx-auto text-[#FF2525] mb-3">
              <User className="w-7 h-7" />
            </div>
            <p className="font-mono-tech text-[10px] uppercase tracking-[0.2em] text-[#FF2525] font-bold">
              IDENTITY TERMINAL · OFFLINE
            </p>
            <h2 className="font-display text-lg font-black uppercase tracking-wide text-[#F5F5F5] mt-1">
              Guest Session
            </h2>
            <p className="text-xs text-[#929292] mt-1.5 max-w-xs mx-auto mb-5 leading-relaxed">
              Sign in or create an account to view your membership status, VIP validity, referral rewards, and access pass.
            </p>

            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[46px] px-6 rounded-xl ra-btn-primary text-xs"
            >
              Sign In / Register
            </button>
          </div>
        </div>

        {/* Dark / Light Mode Toggle (Gold + Navy Blue Theme) */}
        {onToggleColorMode && (
          <ThemeModeCard colorMode={colorMode} onToggleColorMode={onToggleColorMode} />
        )}

        {/* Top 10 XP Leaderboard — Visible to ALL Users on Profile Page */}
        <XpLeaderboardCard user={null} onOpenAuth={onOpenAuth} />

        {/* Dual Official Telegram Channels */}
        <DualTelegramChannelsCard settings={settings || null} />

        {(showSupportOption || showDonationOption) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {showSupportOption && (
              <div className="ra-panel rounded-2xl p-4 flex flex-col gap-3 text-left">
                <button
                  type="button"
                  onClick={() => validSupportUrl && handleOpenExternal(validSupportUrl)}
                  className="w-full flex items-center justify-between text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#090909] border border-[#FF2525]/45 text-[#FF2525] flex items-center justify-center shrink-0">
                      <LifeBuoy className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display text-xs font-extrabold uppercase text-[#F5F5F5] truncate">
                        {settings?.support_title || 'Support / Help'}
                      </h4>
                      <p className="text-[11px] text-[#929292] truncate">
                        {settings?.support_description || 'Get assistance from our team'}
                      </p>
                    </div>
                  </div>
                  {validSupportUrl && (
                    <ExternalLink className="w-4 h-4 text-[#929292] group-hover:text-[#FF2525] shrink-0 ml-2" />
                  )}
                </button>
              </div>
            )}

            {showDonationOption && (
              <button
                type="button"
                onClick={() => setShowDonationModal(true)}
                className="ra-panel hover:border-[#FF762E]/60 rounded-2xl p-4 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#090909] border border-[#FF762E]/45 text-[#FF762E] flex items-center justify-center shrink-0">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-display text-xs font-extrabold uppercase text-[#F5F5F5] truncate">
                      {settings?.donation_title || `Support ${settings?.app_name || 'STUDY BLUNDER'}`}
                    </h4>
                    <p className="text-[11px] text-[#929292] truncate">Contribute to our platform</p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-[#FF762E] shrink-0 ml-2" />
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
        return 'text-[#F5F5F5]';
      case 'In Review':
        return 'text-[#FF762E]';
      case 'Rejected':
        return 'text-[#FF2525]';
      default:
        return 'text-[#929292]';
    }
  };

  return (
    <div className="pb-28 pt-4 px-3.5 sm:px-5 max-w-xl lg:max-w-3xl mx-auto space-y-4">
      {/* Blocked Account Warning Banner */}
      {user.is_blocked && (
        <div className="ra-panel-red ra-corners-red rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#FF2525]/15 border border-[#FF2525]/50 text-[#FF2525] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="text-xs space-y-1 min-w-0">
            <p className="font-display font-extrabold text-[#FF2525] uppercase tracking-wider">
              Account Blocked
            </p>
            <p className="text-[#C5C5C5] leading-relaxed">
              Your account has been restricted by an administrator. Protected batches and study resources are currently unavailable.
              {user.blocked_reason ? ` Reason: ${user.blocked_reason}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* User Cyber Identity Command Header Card */}
      <section className="ra-panel-red ra-corners ra-scanlines rounded-2xl overflow-hidden shadow-[0_18px_45px_rgba(0,0,0,0.7)]">
        <div className="ra-hazard-bar h-1.5 w-full" />
        <div className="p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-[#090909] border border-[#FF2525]/60 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(255,37,37,0.18)]">
            <span className="font-display font-black text-lg text-[#FF2525] tracking-wider">
              {(user.name || user.email).substring(0, 2).toUpperCase()}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-mono-tech uppercase tracking-[0.14em] text-[#C5C5C5]">
              <Shield className="w-3 h-3 text-[#FF2525] shrink-0" />
              <span className="truncate">{roleLabel}</span>
              <span className="text-[#454545]">·</span>
              <span className="shrink-0">JOINED {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
            {user.name && user.name.trim().length > 0 && (
              <h2 className="font-display text-base font-black text-[#F5F5F5] truncate mt-0.5 uppercase">
                {user.name}
              </h2>
            )}
            <p
              className={`${
                user.name ? 'text-xs text-[#929292]' : 'font-display text-sm font-extrabold text-[#F5F5F5] mt-0.5'
              } font-mono-tech truncate`}
            >
              {user.email}
            </p>
          </div>
        </div>

        {/* Operator Clearance Telemetry Strip */}
        <div className="grid grid-cols-3 border-t border-[#454545]/70 bg-[#090909]/80 text-center divide-x divide-[#454545]/60">
          <div className="py-2.5 px-2">
            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-[#929292]">
              CLEARANCE
            </span>
            <span
              className={`font-display text-[11px] font-extrabold uppercase ${
                isVipValid ? 'text-[#FF762E]' : 'text-[#C5C5C5]'
              }`}
            >
              {isVipValid ? 'VIP' : 'STANDARD'}
            </span>
          </div>
          <div className="py-2.5 px-2">
            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-[#929292]">
              STATUS
            </span>
            <span
              className={`font-display text-[11px] font-extrabold uppercase ${
                user.is_blocked ? 'text-[#FF2525]' : isVipValid || isFreeAccessValid ? 'text-[#F5F5F5]' : 'text-[#FF762E]'
              }`}
            >
              {user.is_blocked ? 'BLOCKED' : isVipValid || isFreeAccessValid ? 'ONLINE' : 'EXPIRED'}
            </span>
          </div>
          <div className="py-2.5 px-2">
            <span className="block font-mono-tech text-[9px] uppercase tracking-wider text-[#929292]">
              DEVICE
            </span>
            <span
              className={`font-display text-[11px] font-extrabold uppercase ${
                isVipDeviceMismatch ? 'text-[#FF2525]' : 'text-[#C5C5C5]'
              }`}
            >
              {isVipDeviceMismatch ? 'LOCKED' : 'VERIFIED'}
            </span>
          </div>
        </div>
      </section>

      {/* DARK / LIGHT MODE SWITCH (Gold + Navy Blue Theme) */}
      {onToggleColorMode && (
        <ThemeModeCard colorMode={colorMode} onToggleColorMode={onToggleColorMode} />
      )}

      {/* XP SYSTEM + TOP 10 LEADERBOARD (Shown to ALL Users on Profile Page) */}
      <XpLeaderboardCard user={user} refreshSignal={leaderboardRefreshKey} />

      {/* SUNDAY PARENTS REPORT CARD (Padhai, Quiz & Rank) */}
      <ParentsReportCard
        user={user}
        onXpUpdated={() => setLeaderboardRefreshKey((k) => k + 1)}
      />

      {/* DUAL OFFICIAL TELEGRAM CHANNELS (Study Blunder + Study Fox) */}
      <DualTelegramChannelsCard settings={settings || null} />

      {/* 1. VIP MEMBERSHIP CARD */}
      <div
        className={`border rounded-2xl p-5 transition-all ra-corners ${
          isVipValid
            ? isVipDeviceMismatch
              ? 'bg-[#141414] border-[#FF2525]/70 ra-corners-red'
              : 'bg-[#141414] border-[#FF762E]/65 ra-corners-orange'
            : 'bg-[#141414] border-[#454545]'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                isVipValid
                  ? 'bg-[#090909] border-[#FF762E]/55 text-[#FF762E]'
                  : 'bg-[#090909] border-[#454545] text-[#C5C5C5]'
              }`}
            >
              <Crown className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="font-mono-tech text-[10px] text-[#929292] font-bold uppercase tracking-wider">
                Membership Tier
              </p>
              <h3 className="font-display text-sm font-black uppercase text-[#F5F5F5] flex items-center gap-2 mt-0.5">
                {isVipValid ? (
                  <>
                    <span>VIP Member</span>
                    {isVipDeviceMismatch ? (
                      <span className="font-mono-tech text-[10px] font-bold text-[#FF2525]">
                        DEVICE LOCKED
                      </span>
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-[#FF762E]" />
                    )}
                  </>
                ) : (
                  <>
                    <span>Free Tier Student</span>
                    <span className="font-mono-tech text-[10px] font-semibold text-[#929292]">
                      STANDARD
                    </span>
                  </>
                )}
              </h3>
            </div>
          </div>

          {!isVipValid && !user.is_blocked && (
            <button
              type="button"
              onClick={onGoToVip}
              className="min-h-[42px] px-4 rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider active:scale-95 transition-all flex items-center gap-1.5 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Upgrade</span>
            </button>
          )}
        </div>

        {isVipValid ? (
          <div className="mt-4 pt-4 border-t border-[#454545]/70 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[#929292]">
                <Clock className="w-3.5 h-3.5 text-[#FF762E] shrink-0" />
                <span>Remaining VIP</span>
              </span>
              <span className="font-mono-tech font-bold text-[#FF762E] text-right">
                <LiveCountdownLabel targetIso={user.vip_expires_at} mode="vip" externalNow={externalNow} />
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[#929292]">
                <Calendar className="w-3.5 h-3.5 text-[#929292] shrink-0" />
                <span>VIP Expiry</span>
              </span>
              <span className="font-mono-tech font-bold text-[#F5F5F5] text-right">
                {formatDateTime(user.vip_expires_at)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[#929292]">
                <Shield className="w-3.5 h-3.5 text-[#FF2525] shrink-0" />
                <span>Registered Device</span>
              </span>
              <span
                className={`font-mono-tech font-bold text-right ${
                  isVipDeviceMismatch ? 'text-[#FF2525]' : 'text-[#F5F5F5]'
                }`}
              >
                {user.vip_device_label || 'Authorized Primary Device'}
                {!isVipDeviceMismatch ? ' (This Device)' : ' (Other Device)'}
              </span>
            </div>

            {isVipDeviceMismatch && (
              <div className="mt-3 p-3.5 rounded-xl bg-[#090909] border border-[#FF2525]/55 text-xs text-[#C5C5C5] space-y-2">
                <p className="font-display font-extrabold uppercase text-[#FF2525]">
                  VIP Access Active on Another Device
                </p>
                <p className="leading-relaxed">
                  Your VIP entitlement is bound to{' '}
                  <span className="font-bold text-[#F5F5F5]">
                    {user.vip_device_label || 'your primary device'}
                  </span>
                  . Single-device protection blocks VIP usage on unauthorized second devices. Please use your registered device or contact Admin/Support for a device reset.
                </p>
                {validSupportUrl && (
                  <button
                    type="button"
                    onClick={() => handleOpenExternal(validSupportUrl)}
                    className="min-h-[38px] inline-flex items-center gap-1.5 px-3 rounded-lg ra-btn-primary text-[11px]"
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

      {/* 2. FREE STUDENT ACCESS STATUS CARD */}
      {!isVipValid && (
        <div
          className={`bg-[#141414] border rounded-2xl p-5 space-y-3.5 ra-corners ${
            isFreeAccessValid ? 'border-[#454545]' : 'border-[#FF2525]/65 ra-corners-red'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                  isFreeAccessValid
                    ? 'bg-[#090909] border-[#FF762E]/50 text-[#FF762E]'
                    : 'bg-[#090909] border-[#FF2525]/55 text-[#FF2525]'
                }`}
              >
                <Key className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-mono-tech text-[10px] text-[#929292] font-bold uppercase tracking-wider">
                  Session Access Pass
                </p>
                <h3 className="font-display text-sm font-black uppercase flex items-center gap-1.5 mt-0.5">
                  {isFreeAccessValid ? (
                    <>
                      <span className="text-[#F5F5F5]">Active Access</span>
                      <CheckCircle2 className="w-4 h-4 text-[#FF762E]" />
                    </>
                  ) : (
                    <>
                      <span className="text-[#FF2525]">Access Expired</span>
                      <AlertCircle className="w-4 h-4 text-[#FF2525]" />
                    </>
                  )}
                </h3>
              </div>
            </div>

            {onOpenKeyGen && !user.is_blocked && (
              <button
                type="button"
                onClick={onOpenKeyGen}
                className="min-h-[42px] px-3.5 rounded-xl ra-btn-primary text-xs flex items-center gap-1.5 shrink-0"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{isFreeAccessValid ? 'Renew Key' : 'Generate Key'}</span>
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-[#454545]/70 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[#929292]">
                <Clock className="w-3.5 h-3.5 text-[#FF762E] shrink-0" />
                <span>Remaining Time</span>
              </span>
              <span
                className={`font-mono-tech font-bold text-right ${
                  isFreeAccessValid ? 'text-[#FF762E]' : 'text-[#FF2525]'
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
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[#929292]">
                  <Calendar className="w-3.5 h-3.5 text-[#929292] shrink-0" />
                  <span>Expiry Timestamp</span>
                </span>
                <span className="font-mono-tech font-bold text-[#F5F5F5] text-right">
                  {formatDateTime(user.free_access_expires_at)}
                </span>
              </div>
            )}

            {!isFreeAccessValid && !user.is_blocked && (
              <p className="text-[11px] text-[#929292] leading-relaxed pt-1">
                Your session pass has expired. Complete the verification link to activate a new access period configured by the administrator.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 2B. REFERRAL CODE & REWARDS CARD */}
      {!user.is_blocked &&
        settings?.referral_program_enabled !== false &&
        (referralData === null || referralData.referral_program_enabled !== false) &&
        referralData?.permissions?.can_access_referral_dashboard !== false && (
          <div className="ra-panel ra-corners-orange rounded-2xl p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#090909] border border-[#FF762E]/50 text-[#FF762E] flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display text-xs sm:text-sm font-black uppercase text-[#F5F5F5]">
                    Referral Code & Rewards
                  </h3>
                  <span className="font-mono-tech text-[10px] font-bold uppercase text-[#FF762E]">
                    +BONUS VIP DAYS
                  </span>
                </div>
                <p className="text-[11px] text-[#929292] mt-0.5">
                  Share your code with friends — they get a VIP discount and you earn bonus VIP days.
                </p>
              </div>
            </div>

            {referralData?.permissions?.can_create_share_referral_link !== false && (
              <div className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider text-[#929292] block">
                    Your Unique Code
                  </span>
                  <span className="text-base font-mono-tech font-black text-[#FF2525] tracking-wider">
                    {referralData?.referral_code || user.referral_code || 'LOADING...'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyProfileRefCode}
                    className="flex-1 sm:flex-initial min-h-[42px] px-3.5 rounded-xl ra-btn-secondary text-xs inline-flex items-center justify-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5 text-[#FF2525]" />
                    <span>{copiedRefCode ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareProfileRefLink}
                    className="flex-1 sm:flex-initial min-h-[42px] px-3.5 rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{copiedRefLink ? 'Copied Link' : 'Share'}</span>
                  </button>
                </div>
              </div>
            )}

            {referralData?.sales_summary && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
                  <span className="text-[10px] font-mono-tech uppercase text-[#929292] block">
                    Referred
                  </span>
                  <strong className="text-base font-black text-[#F5F5F5] font-mono-tech">
                    {referralData.sales_summary.total_referrals}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
                  <span className="text-[10px] font-mono-tech uppercase text-[#929292] block">
                    VIP Joins
                  </span>
                  <strong className="text-base font-black text-[#FF2525] font-mono-tech">
                    {referralData.sales_summary.vip_purchases}
                  </strong>
                </div>
                <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
                  <span className="text-[10px] font-mono-tech uppercase text-[#929292] block">
                    Bonus Days
                  </span>
                  <strong className="text-base font-black text-[#FF762E] font-mono-tech">
                    +{referralData.sales_summary.reward_days_earned}d
                  </strong>
                </div>
              </div>
            )}

            {referralData?.my_attribution?.is_referred || user.referred_by_user_id ? (
              <div className="p-3.5 rounded-xl bg-[#090909] border border-[#FF762E]/45 flex items-start gap-2.5 text-xs">
                <Tag className="w-4 h-4 text-[#FF762E] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-[#F5F5F5]">
                      Linked Code:{' '}
                      <span className="font-mono-tech text-[#FF762E]">
                        {referralData?.my_attribution?.referred_by_code ||
                          (user as any).referred_by_code ||
                          'Verified'}
                      </span>
                    </span>
                    {referralData?.my_attribution?.discount_eligible && (
                      <span className="font-mono-tech text-[10px] font-bold uppercase text-[#FF762E]">
                        {referralData.my_attribution.discount_label || 'DISCOUNT ACTIVE'}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#929292] mt-1 leading-relaxed">
                    {referralData?.my_attribution?.discount_eligible
                      ? 'Your referral discount is linked to your account and applies automatically at VIP checkout.'
                      : referralData?.my_attribution?.reason ||
                        'Your account is linked to this referral code.'}
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleApplyReferralOnProfile} className="pt-3 border-t border-[#454545]/70 space-y-2">
                <label className="block text-[11px] font-bold text-[#C5C5C5]">
                  Have a Friend&apos;s Referral Code? Apply it for a VIP Discount:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={applyCodeInput}
                    onChange={(e) => setApplyCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. SF-REF-A1B2C3"
                    className="flex-1 h-11 px-3 rounded-xl bg-[#090909] border border-[#454545] text-xs text-[#F5F5F5] font-mono-tech uppercase focus:outline-none focus:border-[#FF2525]"
                  />
                  <button
                    type="submit"
                    disabled={applyingCode || !applyCodeInput.trim()}
                    className="h-11 px-4 rounded-xl ra-btn-primary disabled:opacity-50 text-xs shrink-0"
                  >
                    {applyingCode ? 'Applying...' : 'Apply'}
                  </button>
                </div>
                {applyCodeMsg && (
                  <p
                    className={`text-[11px] font-semibold ${
                      applyCodeMsg.type === 'success' ? 'text-[#FF762E]' : 'text-[#FF2525]'
                    }`}
                  >
                    {applyCodeMsg.text}
                  </p>
                )}
              </form>
            )}
          </div>
        )}

      {/* 3. STUDENT FEEDBACK PANEL */}
      {!user.is_blocked && (
        <div className="ra-panel rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#090909] border border-[#FF2525]/45 text-[#FF2525] flex items-center justify-center shrink-0">
                <MessageSquarePlus className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-display text-xs sm:text-sm font-black uppercase text-[#F5F5F5] truncate">
                    Student Feedback
                  </h4>
                  <span
                    className={`font-mono-tech text-[10px] font-bold uppercase ${
                      isVipValid ? 'text-[#FF762E]' : 'text-[#929292]'
                    }`}
                  >
                    {isVipValid ? 'VIP' : 'STANDARD'}
                  </span>
                </div>
                <p className="text-[11px] text-[#929292] truncate">
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
              className="min-h-[40px] px-3.5 rounded-xl ra-btn-secondary text-xs shrink-0"
            >
              {feedbackOpen ? 'Close' : 'Open'}
            </button>
          </div>

          {feedbackOpen && (
            <div className="pt-3.5 border-t border-[#454545]/70 space-y-4">
              <div className="grid grid-cols-2 p-1 bg-[#090909] rounded-xl border border-[#454545] gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackTab('submit');
                    setFbError(null);
                  }}
                  className={`min-h-[38px] text-xs font-display font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    feedbackTab === 'submit'
                      ? 'bg-[#FF2525] text-[#F5F5F5]'
                      : 'text-[#929292] hover:text-[#F5F5F5]'
                  }`}
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span>Submit</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackTab('history');
                    void loadMyFeedback();
                  }}
                  className={`min-h-[38px] text-xs font-display font-bold uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    feedbackTab === 'history'
                      ? 'bg-[#FF2525] text-[#F5F5F5]'
                      : 'text-[#929292] hover:text-[#F5F5F5]'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>History ({myFeedbackList.length})</span>
                </button>
              </div>

              {feedbackTab === 'submit' ? (
                <form onSubmit={handleFeedbackSubmit} className="space-y-3.5">
                  {fbSuccess && (
                    <div className="p-3 rounded-xl bg-[#1D1D1D] border border-[#FF762E]/55 text-[#FF762E] text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{fbSuccess}</span>
                    </div>
                  )}

                  {fbError && (
                    <div className="p-3 rounded-xl bg-[#FF2525]/12 border border-[#FF2525]/55 text-[#F5F5F5] text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-[#FF2525]" />
                      <span>{fbError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1.5">
                      1. Feedback Category
                    </label>
                    <select
                      value={fbCategory}
                      onChange={(e) => setFbCategory(e.target.value as FeedbackCategory)}
                      className="w-full h-11 bg-[#090909] border border-[#454545] rounded-xl px-3.5 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#FF2525]"
                    >
                      {FEEDBACK_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat} className="bg-[#141414] text-[#F5F5F5]">
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1.5">
                      2. Overall Rating ({fbRating} / 5 Stars)
                    </label>
                    <div className="flex items-center gap-2 bg-[#090909] border border-[#454545] rounded-xl p-2.5">
                      {[1, 2, 3, 4, 5].map((starValue) => (
                        <button
                          key={starValue}
                          type="button"
                          onClick={() => setFbRating(starValue)}
                          className="p-1 rounded-lg hover:bg-[#1D1D1D] transition-transform active:scale-90"
                          title={`Rate ${starValue} star${starValue > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`w-5 h-5 transition-colors ${
                              starValue <= fbRating
                                ? 'text-[#FF762E] fill-[#FF762E]'
                                : 'text-[#454545]'
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-auto font-mono-tech text-[11px] font-bold text-[#FF762E]">
                        {fbRating === 5
                          ? 'EXCELLENT'
                          : fbRating === 4
                          ? 'GOOD'
                          : fbRating === 3
                          ? 'AVERAGE'
                          : fbRating === 2
                          ? 'NEEDS WORK'
                          : 'POOR'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1.5">
                      3. Feedback Message
                    </label>
                    <textarea
                      required
                      rows={4}
                      maxLength={2000}
                      value={fbMessage}
                      onChange={(e) => setFbMessage(e.target.value)}
                      placeholder="Describe your feedback, suggestion, or issue in detail..."
                      className="w-full bg-[#090909] border border-[#454545] rounded-xl p-3 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525] resize-none"
                    />
                    <div className="flex justify-between font-mono-tech text-[10px] text-[#929292] mt-1">
                      <span className="truncate">{user.email}</span>
                      <span>{fbMessage.length} / 2000</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1.5">
                      4. Screenshot Attachment (Optional, Max 5MB)
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 cursor-pointer bg-[#090909] hover:bg-[#1D1D1D] border border-dashed border-[#454545] hover:border-[#FF2525]/60 rounded-xl p-2.5 text-xs text-[#F5F5F5] flex items-center justify-center gap-2 transition">
                        <ImageIcon className="w-4 h-4 text-[#FF2525] shrink-0" />
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
                          className="w-10 h-10 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/50 text-[#FF2525] flex items-center justify-center shrink-0"
                          title="Remove attachment"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {fbAttachmentDataUrl && (
                      <div className="mt-2 p-2 rounded-xl bg-[#090909] border border-[#454545] inline-block">
                        <img
                          src={fbAttachmentDataUrl}
                          alt="Attachment Preview"
                          className="max-h-28 rounded-lg object-contain"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={fbSubmitting}
                    className="w-full min-h-[46px] rounded-xl ra-btn-primary text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{fbSubmitting ? 'Submitting Feedback...' : 'Submit Feedback'}</span>
                  </button>
                </form>
              ) : (
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {loadingFeedback ? (
                    <div className="text-center py-6 text-xs text-[#929292]">
                      Loading your feedback history...
                    </div>
                  ) : myFeedbackList.length === 0 ? (
                    <div className="text-center py-6 bg-[#090909] rounded-xl border border-[#454545] p-4">
                      <p className="font-display text-xs font-bold uppercase text-[#F5F5F5]">
                        No feedback submitted yet
                      </p>
                      <p className="text-[11px] text-[#929292] mt-1">
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
                          className="bg-[#090909] border border-[#454545] rounded-xl p-3 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-display font-bold uppercase text-[#F5F5F5]">
                              {fb.category}
                            </span>
                            <span
                              className={`font-mono-tech text-[10px] font-bold uppercase ${getFeedbackStatusStyle(
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
                                  s <= fb.rating ? 'text-[#FF762E] fill-[#FF762E]' : 'text-[#454545]'
                                }`}
                              />
                            ))}
                            <span className="font-mono-tech text-[10px] text-[#929292] ml-1.5">
                              {new Date(fb.created_at).toLocaleString()}
                            </span>
                          </div>

                          <p className="text-[#F5F5F5]/90 text-xs leading-relaxed whitespace-pre-wrap break-words">
                            {fb.message}
                          </p>

                          {attachHref && (
                            <button
                              type="button"
                              onClick={() => setPreviewAttachmentUrl(attachHref)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] border border-[#454545] text-[#FF762E] text-[10px] font-bold"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View Screenshot</span>
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
            <div className="ra-panel hover:border-[#FF2525]/60 rounded-2xl p-4 transition-colors">
              <button
                type="button"
                onClick={() => validSupportUrl && handleOpenExternal(validSupportUrl)}
                className="w-full flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#090909] border border-[#FF2525]/45 text-[#FF2525] flex items-center justify-center shrink-0">
                    <LifeBuoy className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-display text-xs font-extrabold uppercase text-[#F5F5F5] truncate">
                      {settings?.support_title || 'Support / Help'}
                    </h4>
                    <p className="text-[11px] text-[#929292] truncate">
                      {settings?.support_description || 'Contact help & support'}
                    </p>
                  </div>
                </div>
                {validSupportUrl && (
                  <ExternalLink className="w-4 h-4 text-[#929292] group-hover:text-[#FF2525] shrink-0 ml-2" />
                )}
              </button>
            </div>
          )}

          {showDonationOption && (
            <div className="ra-panel hover:border-[#FF762E]/60 rounded-2xl p-4 transition-colors">
              <button
                type="button"
                onClick={() => setShowDonationModal(true)}
                className="w-full flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[#090909] border border-[#FF762E]/45 text-[#FF762E] flex items-center justify-center shrink-0">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-display text-xs font-extrabold uppercase text-[#F5F5F5] truncate">
                      {settings?.donation_title || `Support ${settings?.app_name || 'STUDY BLUNDER'}`}
                    </h4>
                    <p className="text-[11px] text-[#929292] truncate">
                      {settings?.donation_button_text || 'Donate Now'}
                    </p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-[#FF762E] shrink-0 ml-2" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Logout Button */}
      <button
        type="button"
        onClick={onLogout}
        className="w-full min-h-[48px] rounded-xl bg-[#141414] hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
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
            className="ra-panel-red ra-corners rounded-2xl max-w-lg w-full p-4 relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-display text-xs font-extrabold uppercase text-[#F5F5F5]">
                Attached Screenshot
              </h4>
              <button
                type="button"
                onClick={() => setPreviewAttachmentUrl(null)}
                aria-label="Close preview"
                className="w-9 h-9 rounded-lg bg-[#090909] border border-[#454545] text-[#C5C5C5] hover:text-[#F5F5F5] flex items-center justify-center"
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
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ra-panel-red ra-corners-orange rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl relative text-center">
            <div className="ra-hazard-bar h-1.5 w-full" />
            <div className="p-6 relative">
              <button
                type="button"
                onClick={() => setShowDonationModal(false)}
                aria-label="Close donation dialog"
                className="absolute top-3.5 right-3.5 w-9 h-9 rounded-lg bg-[#090909] border border-[#454545] text-[#C5C5C5] hover:text-[#F5F5F5] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-11 h-11 rounded-xl bg-[#090909] border border-[#FF762E]/50 flex items-center justify-center mx-auto text-[#FF762E] mb-3">
                <Heart className="w-5 h-5" />
              </div>

              <h3 className="font-display text-sm font-black uppercase text-[#F5F5F5]">
                {settings?.donation_title || `Support ${settings?.app_name || 'STUDY BLUNDER'}`}
              </h3>
              {settings?.donation_message && (
                <p className="text-xs text-[#C5C5C5] mt-1.5 leading-relaxed whitespace-pre-line">
                  {settings.donation_message}
                </p>
              )}

              {hasDonationQr ? (
                <div className="mt-4 bg-white p-3 rounded-xl inline-block mx-auto">
                  <img
                    src={resolvedDonationQrUrl}
                    alt="Donation QR Code"
                    className="w-44 h-44 object-contain mx-auto"
                  />
                </div>
              ) : (
                <div className="mt-4 p-4 rounded-xl bg-[#090909] border border-[#454545] text-[#929292] text-xs">
                  No donation QR image has been configured yet.
                </div>
              )}

              <div className="mt-5 space-y-2">
                {validDonationUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenExternal(validDonationUrl);
                      setShowDonationModal(false);
                    }}
                    className="w-full min-h-[44px] rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    <Heart className="w-4 h-4" />
                    <span>{settings?.donation_button_text || 'Donate Now'}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDonationModal(false)}
                  className="w-full min-h-[42px] rounded-xl ra-btn-secondary text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
