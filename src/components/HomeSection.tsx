import React, { useState, useEffect, useRef } from 'react';
import {
  ExternalLink,
  Search,
  Bell,
  BookOpen,
  Crown,
  Lock,
  Sparkles,
  X,
  Clock,
  Key,
  ChevronLeft,
  ChevronRight,
  Heart,
  ShieldAlert,
  LifeBuoy,
  MessageSquarePlus,
  Star,
  Send,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Layers,
  ChevronRight as ArrowIcon,
} from 'lucide-react';
import type { Platform, Announcement, UserProfile, PublicSettings, UserFeedbackRecord, FeedbackCategory } from '../types.ts';
import { api } from '../api.ts';
import {
  ExamCountdownCard,
  OfferBoardBanner,
  DailyMotivationCard,
  DualTelegramChannelsCard,
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

interface HomeSectionProps {
  platforms: Platform[];
  announcements: Announcement[];
  settings?: PublicSettings | null;
  loading: boolean;
  user?: UserProfile | null;
  now?: number;
  keyGenerationEnabled?: boolean;
  onRefresh: () => void;
  onNavigateToVip?: (mode?: 'single_platform' | 'all_platforms', platformId?: string | null) => void;
  onOpenKeyGen?: () => void;
}

const formatRemainingTime = (isoDate?: string | null, currentMs: number = Date.now()) => {
  if (!isoDate) return '';
  const diff = new Date(isoDate).getTime() - currentMs;
  if (diff <= 0) return 'Expired';
  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m ${s}s`;
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
};

const IsolatedHomeAccessCountdown: React.FC<{
  isVipValid: boolean;
  isFreeAccessValid: boolean;
  vipExpiresAt?: string | null;
  freeAccessExpiresAt?: string | null;
}> = React.memo(({ isVipValid, isFreeAccessValid, vipExpiresAt, freeAccessExpiresAt }) => {
  const [tickNow, setTickNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isVipValid && !isFreeAccessValid) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setTickNow(Date.now());
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [isVipValid, isFreeAccessValid]);

  return (
    <span className="font-mono-tech text-xs sm:text-sm font-bold truncate">
      {isVipValid
        ? formatRemainingTime(vipExpiresAt, tickNow)
        : isFreeAccessValid
        ? formatRemainingTime(freeAccessExpiresAt, tickNow)
        : 'LOCKED'}
    </span>
  );
});

export const HomeSection: React.FC<HomeSectionProps> = ({
  platforms,
  announcements,
  settings,
  loading,
  user,
  now = Date.now(),
  keyGenerationEnabled = true,
  onNavigateToVip,
  onOpenKeyGen,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [checkingPlatformId, setCheckingPlatformId] = useState<string | null>(null);
  const [failedLogoIds, setFailedLogoIds] = useState<Record<string, boolean>>({});
  const [vipDeniedModal, setVipDeniedModal] = useState<{
    platformName: string;
    vipPurchaseUrl?: string;
  } | null>(null);
  const [vipDeviceMismatchModal, setVipDeviceMismatchModal] = useState<{
    platformName: string;
    boundDeviceLabel: string;
    message: string;
  } | null>(null);
  const [blockedAlertMessage, setBlockedAlertMessage] = useState<string | null>(null);
  const [showDonationModal, setShowDonationModal] = useState(false);

  const openExternalDestination = (rawUrl?: string | null): boolean => {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    const trimmed = rawUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    const anchor = document.createElement('a');
    anchor.href = trimmed;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  };

  const singleVipLabel = (settings?.home_single_vip_label || 'VIP').trim();
  const singleVipPrice = Number(settings?.home_single_vip_price ?? 49);
  const singleVipDestination = settings?.home_single_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_single_vip';
  const singleVipCustomUrl = (settings?.home_single_vip_url || '').trim();

  const allVipLabel = (settings?.home_all_vip_label || 'ALL VIP').trim();
  const allVipPrice = Number(settings?.home_all_vip_price ?? 149);
  const allVipDestination = settings?.home_all_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_all_vip';
  const allVipCustomUrl = (settings?.home_all_vip_url || '').trim();

  const userHasAllPlatformsVip = Boolean(
    user &&
      !user.is_blocked &&
      (user.role === 'admin' ||
        user.role === 'super_admin' ||
        (user.vip_active &&
          (!user.vip_expires_at || new Date(user.vip_expires_at).getTime() > now)))
  );

  const userHasPlatformVip = (platformId: string): boolean => {
    if (userHasAllPlatformsVip) return true;
    if (!user || user.is_blocked) return false;
    const allowedIds = user.vip_allowed_platform_ids || [];
    if (allowedIds.includes(platformId)) return true;
    const expIso = user.vip_platform_expiries?.[platformId];
    return Boolean(expIso && new Date(expIso).getTime() > now);
  };

  const handleHomeSingleVipAction = (platform: Platform) => {
    if (userHasPlatformVip(platform.id)) {
      handlePlatformClick(platform);
      return;
    }
    if (singleVipDestination === 'custom_url' && openExternalDestination(singleVipCustomUrl)) {
      return;
    }
    if (onNavigateToVip) {
      onNavigateToVip('single_platform', platform.id);
    }
  };

  const handleHomeAllVipAction = (platform: Platform) => {
    if (userHasAllPlatformsVip) {
      handlePlatformClick(platform);
      return;
    }
    if (allVipDestination === 'custom_url' && openExternalDestination(allVipCustomUrl)) {
      return;
    }
    if (onNavigateToVip) {
      onNavigateToVip('all_platforms', null);
    }
  };

  // Feedback System State (accessible directly from Home Screen for VIP & Non-VIP users)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackTab, setFeedbackTab] = useState<'submit' | 'history'>('submit');
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>('General Feedback');
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackScreenshot, setFeedbackScreenshot] = useState<string | null>(null);
  const [feedbackScreenshotMime, setFeedbackScreenshotMime] = useState<string>('');
  const [feedbackScreenshotName, setFeedbackScreenshotName] = useState<string>('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [myFeedbackList, setMyFeedbackList] = useState<UserFeedbackRecord[]>([]);
  const [loadingFeedbackList, setLoadingFeedbackList] = useState(false);
  const feedbackFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadMyFeedback = async () => {
    if (!user) return;
    setLoadingFeedbackList(true);
    try {
      const list = await api.getMyFeedback();
      setMyFeedbackList(Array.isArray(list) ? list : []);
    } catch {
      // Ignore silent load errors
    } finally {
      setLoadingFeedbackList(false);
    }
  };

  useEffect(() => {
    if (showFeedbackModal && user) {
      loadMyFeedback();
    }
  }, [showFeedbackModal, user?.id]);

  const handleFeedbackScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFeedbackError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFeedbackError('Screenshot file size must be under 5 MB.');
      return;
    }
    setFeedbackError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFeedbackScreenshot(reader.result);
        setFeedbackScreenshotMime(file.type || 'image/png');
        setFeedbackScreenshotName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError(null);
    setFeedbackSuccess(null);

    const cleanMessage = feedbackMessage.trim();
    if (cleanMessage.length < 3) {
      setFeedbackError('Please enter your feedback message (at least 3 characters).');
      return;
    }

    setSubmittingFeedback(true);
    try {
      const res = await api.submitFeedback({
        category: feedbackCategory,
        rating: feedbackRating,
        message: cleanMessage,
        ...(feedbackScreenshot && {
          attachment_data_url: feedbackScreenshot,
          attachment_mime_type: feedbackScreenshotMime || 'image/png',
        }),
      });
      setFeedbackSuccess(res.message || 'Thank you! Your feedback has been submitted.');
      setFeedbackMessage('');
      setFeedbackScreenshot(null);
      setFeedbackScreenshotMime('');
      setFeedbackScreenshotName('');
      if (feedbackFileInputRef.current) {
        feedbackFileInputRef.current.value = '';
      }
      await loadMyFeedback();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  // Announcement Slider State
  const [currentSlide, setCurrentSlide] = useState(0);
  const [sliderPaused, setSliderPaused] = useState(false);

  const sliderEnabled = settings?.announcement_slider_enabled !== false;
  const slideIntervalSec = Math.min(
    60,
    Math.max(2, Number(settings?.announcement_slide_interval_seconds) || 5)
  );

  const scheduleBucketMs = Math.floor(now / 30000) * 30000;

  const activeAnnouncements = React.useMemo(() => {
    if (!sliderEnabled) return [];
    return announcements
      .filter((a) => {
        if (!a.is_published) return false;
        if (a.start_date) {
          const startMs = new Date(a.start_date).getTime();
          if (!isNaN(startMs) && scheduleBucketMs < startMs) return false;
        }
        if (a.end_date) {
          const endMs = new Date(a.end_date).getTime();
          if (!isNaN(endMs) && scheduleBucketMs > endMs) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const orderA = typeof a.display_order === 'number' ? a.display_order : 999;
        const orderB = typeof b.display_order === 'number' ? b.display_order : 999;
        if (orderA !== orderB) return orderA - orderB;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [announcements, sliderEnabled, scheduleBucketMs]);

  useEffect(() => {
    if (currentSlide >= activeAnnouncements.length && activeAnnouncements.length > 0) {
      setCurrentSlide(0);
    }
  }, [activeAnnouncements.length, currentSlide]);

  useEffect(() => {
    if (!sliderEnabled || activeAnnouncements.length <= 1 || sliderPaused) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setCurrentSlide((prev) => (prev + 1) % activeAnnouncements.length);
      }
    }, slideIntervalSec * 1000);
    return () => clearInterval(timer);
  }, [sliderEnabled, activeAnnouncements.length, slideIntervalSec, sliderPaused]);

  const isStudent = Boolean(user && user.role === 'user');
  const isVipDeviceMismatch = Boolean(
    isStudent && user?.vip_active && user?.vip_device_status === 'bound_other'
  );
  const isVipValid = Boolean(
    user &&
    !user.is_blocked &&
    user.vip_active &&
    (user.role !== 'user' ||
      (user.vip_expires_at && new Date(user.vip_expires_at).getTime() > now))
  );
  const isFreeAccessValid = Boolean(
    user &&
    !user.is_blocked &&
    user.free_access_expires_at &&
    new Date(user.free_access_expires_at).getTime() > now
  );
  const isStudentAccessBlocked = Boolean(
    isStudent && keyGenerationEnabled && !isVipValid && !isFreeAccessValid
  );

  const categories = ['All', ...Array.from(new Set(platforms.map((p) => p.category || 'General')))];

  const filtered = platforms.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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

  const isInternalStudyHost = (parsedUrl: URL): boolean => {
    const host = parsedUrl.hostname.toLowerCase();
    return parsedUrl.origin === window.location.origin || host === 'study-fox.onrender.com';
  };

  const handleOpenUrl = (url: string) => {
    const valid = getValidHttpUrl(url);
    if (!valid) return;
    try {
      const parsed = new URL(valid);
      if (isInternalStudyHost(parsed)) {
        const pathLower = parsed.pathname.toLowerCase().replace(/\/+$/, '');
        if (
          (pathLower === '/vip' || parsed.searchParams.get('tab')?.toLowerCase() === 'vip') &&
          onNavigateToVip
        ) {
          onNavigateToVip();
          return;
        }
        window.location.assign(valid);
        return;
      }
    } catch {
      // Fallback to standard external open
    }
    window.open(valid, '_blank', 'noopener,noreferrer');
  };

  const handleRedirectToVipDestination = (rawUrl?: string | null) => {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed || trimmed.toLowerCase() === '/vip' || trimmed.toLowerCase().startsWith('/vip/')) {
      if (onNavigateToVip) {
        onNavigateToVip();
        return;
      }
    }
    const valid = getValidHttpUrl(trimmed);
    if (valid) {
      try {
        const parsed = new URL(valid);
        const pathLower = parsed.pathname.toLowerCase().replace(/\/+$/, '');
        if (
          (pathLower === '/vip' ||
            (isInternalStudyHost(parsed) &&
              parsed.searchParams.get('tab')?.toLowerCase() === 'vip')) &&
          onNavigateToVip
        ) {
          onNavigateToVip();
          return;
        }
      } catch {
        // Fallback to external URL
      }
      handleOpenUrl(valid);
      return;
    }
    if (onNavigateToVip) {
      onNavigateToVip();
    }
  };

  const openingPlatformRef = useRef<string | null>(null);

  const handlePlatformClick = async (platform: Platform) => {
    if (openingPlatformRef.current === platform.id || checkingPlatformId === platform.id) {
      return;
    }

    if (user?.is_blocked) {
      setBlockedAlertMessage(
        `Your account has been blocked by an administrator.${user.blocked_reason ? ' Reason: ' + user.blocked_reason : ''}`
      );
      return;
    }

    if (platform.access_type !== 'vip' && isStudentAccessBlocked && !isVipDeviceMismatch) {
      if (onOpenKeyGen) {
        onOpenKeyGen();
      }
      return;
    }

    const clickId = `clk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    try {
      openingPlatformRef.current = platform.id;
      setCheckingPlatformId(platform.id);
      const res = await api.getPlatformAccess(platform.id, clickId);

      if (res.allowed && res.redirect_url) {
        handleOpenUrl(res.redirect_url);
        api.recordPlatformOpen(platform.id, clickId).catch(() => {});
      } else if (res.reason === 'account_blocked') {
        setBlockedAlertMessage(res.error || 'Your account has been blocked by an administrator.');
      } else if (res.reason === 'vip_device_mismatch' || res.code === 'VIP_DEVICE_MISMATCH') {
        setVipDeviceMismatchModal({
          platformName: platform.name,
          boundDeviceLabel: res.bound_device_label || user?.vip_device_label || 'Registered Primary Device',
          message:
            res.error ||
            'VIP access is already active on another device. Please use your registered device or contact Admin/Support for a device reset.',
        });
      } else if (res.reason === 'key_required') {
        if (onOpenKeyGen) {
          onOpenKeyGen();
        }
      } else {
        handleRedirectToVipDestination(res.vip_redirect_url || res.vip_purchase_url);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('blocked')) {
        setBlockedAlertMessage(msg);
        return;
      }
      if (platform.access_type === 'normal' && isStudentAccessBlocked) {
        if (onOpenKeyGen) {
          onOpenKeyGen();
        }
      } else if (platform.access_type === 'vip') {
        handleRedirectToVipDestination();
      }
    } finally {
      openingPlatformRef.current = null;
      setCheckingPlatformId(null);
    }
  };

  const handleUnlockVipClick = () => {
    const purchaseUrl = vipDeniedModal?.vipPurchaseUrl;
    setVipDeniedModal(null);
    handleRedirectToVipDestination(purchaseUrl);
  };

  const validSupportUrl = getValidHttpUrl(settings?.support_url);
  const showSupportOption = Boolean(
    settings?.support_enabled !== false &&
      (validSupportUrl || (settings?.support_description && settings.support_description.trim().length > 0))
  );

  const validDonationUrl = getValidHttpUrl(settings?.donation_url);
  const resolvedDonationQrUrl =
    (settings?.donation_qr_url && settings.donation_qr_url.trim()) ||
    (settings?.support_image_url && settings.support_image_url.trim()) ||
    '';
  const hasDonationQr = Boolean(resolvedDonationQrUrl.length > 0);
  const showDonationOption = Boolean(
    settings?.donation_enabled &&
      (validDonationUrl || hasDonationQr || (settings?.donation_message && settings.donation_message.trim().length > 0))
  );

  const currentAnn = activeAnnouncements[currentSlide] || activeAnnouncements[0];
  const currentAnnLink = getValidHttpUrl(currentAnn?.link_url);

  const activePlatformCount = platforms.filter((p) => p.status === 'active').length;
  const vipPlatformCount = platforms.filter((p) => p.access_type === 'vip' && p.status === 'active').length;
  const studentDisplayName =
    user?.name?.trim() || (user?.email ? user.email.split('@')[0] : 'Student');

  return (
    <div className="pb-28 pt-4 px-3.5 sm:px-5 max-w-xl lg:max-w-5xl mx-auto space-y-4">
      {/* Blocked Account Notice Banner */}
      {user?.is_blocked && (
        <div className="rounded-2xl p-4 bg-[#1D1D1D] border border-[#FF2525] ra-corners text-[#F5F5F5] flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="text-xs min-w-0">
            <p className="font-display font-black uppercase tracking-wider text-[#FF2525]">
              Account Restricted
            </p>
            <p className="text-[#C5C5C5] mt-1 leading-relaxed">
              Your account has been blocked by an administrator and cannot access protected platforms.
              {user.blocked_reason ? ` Reason: ${user.blocked_reason}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* RED ALERT COMMAND DECK — Hero & Live Access Readout */}
      <section className="ra-panel ra-corners rounded-2xl relative overflow-hidden">
        <div className="h-1 w-full ra-hazard-bar" />

        <div className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono-tech text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.2em] text-[#FF2525]">
                {isVipValid
                  ? 'VIP CLEARANCE VERIFIED'
                  : isFreeAccessValid
                  ? 'ACTIVE STUDY SESSION'
                  : isStudent
                  ? 'KEY VERIFICATION REQUIRED'
                  : 'OPERATOR COMMAND DECK'}
              </p>
              <h2 className="font-display text-xl sm:text-2xl font-black text-[#F5F5F5] tracking-tight mt-1 truncate">
                Welcome back, <span className="text-[#FF2525]">{studentDisplayName}</span>
              </h2>
              <p className="text-xs text-[#929292] mt-1">
                Direct launcher for all configured study platforms and batches.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {isStudent && !user?.is_blocked && !isVipValid && onOpenKeyGen && (
                <button
                  type="button"
                  onClick={onOpenKeyGen}
                  className="min-h-[44px] px-4 rounded-xl ra-btn-primary font-display font-extrabold text-xs uppercase tracking-[0.12em] flex items-center justify-center gap-1.5"
                >
                  <Key className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>{isFreeAccessValid ? 'Renew Key' : 'Generate Key'}</span>
                </button>
              )}
              {!isVipValid && onNavigateToVip && (
                <button
                  type="button"
                  onClick={() => onNavigateToVip('all_platforms')}
                  className="min-h-[44px] px-4 rounded-xl ra-btn-secondary font-display font-extrabold text-xs uppercase tracking-[0.12em] text-[#FF762E] border-[#FF762E]/50 hover:border-[#FF762E] flex items-center justify-center gap-1.5"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Go VIP</span>
                </button>
              )}
            </div>
          </div>

          {/* Structured 3-Plate Telemetry Bar */}
          <div className="mt-4 pt-4 border-t border-[#454545]/70 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl bg-[#090909] border border-[#454545]/80 p-2.5 sm:p-3">
              <p className="font-mono-tech text-[9px] sm:text-[10px] uppercase tracking-wider text-[#929292]">
                Access Tier
              </p>
              <p className={`font-display text-xs sm:text-sm font-black uppercase mt-1 truncate ${isVipValid ? 'text-[#FF762E]' : 'text-[#F5F5F5]'}`}>
                {isVipValid ? 'VIP Elite' : isStudent ? 'Standard' : 'Admin'}
              </p>
            </div>

            <div className="rounded-xl bg-[#090909] border border-[#454545]/80 p-2.5 sm:p-3">
              <p className="font-mono-tech text-[9px] sm:text-[10px] uppercase tracking-wider text-[#929292]">
                Platforms Ready
              </p>
              <p className="font-mono-tech text-xs sm:text-sm font-bold text-[#F5F5F5] mt-1">
                {activePlatformCount}
                {vipPlatformCount > 0 && (
                  <span className="text-[10px] text-[#FF762E] ml-1">({vipPlatformCount} VIP)</span>
                )}
              </p>
            </div>

            <div className="rounded-xl bg-[#090909] border border-[#454545]/80 p-2.5 sm:p-3">
              <p className="font-mono-tech text-[9px] sm:text-[10px] uppercase tracking-wider text-[#929292]">
                Session Timer
              </p>
              <div className={`mt-1 flex items-center gap-1 ${isVipValid ? 'text-[#FF762E]' : isFreeAccessValid ? 'text-[#F5F5F5]' : 'text-[#FF2525]'}`}>
                {isStudent && !user?.is_blocked ? (
                  <>
                    {isVipValid ? (
                      <Crown className="w-3.5 h-3.5 shrink-0" />
                    ) : isFreeAccessValid ? (
                      <Clock className="w-3.5 h-3.5 shrink-0 text-[#FF2525]" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <IsolatedHomeAccessCountdown
                      isVipValid={isVipValid}
                      isFreeAccessValid={isFreeAccessValid}
                      vipExpiresAt={user?.vip_expires_at}
                      freeAccessExpiresAt={user?.free_access_expires_at}
                    />
                  </>
                ) : (
                  <span className="font-mono-tech text-xs sm:text-sm font-bold text-[#F5F5F5]">
                    UNLIMITED
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 1. EXAM COUNTDOWN TIMER (Always visible on app open) */}
      <ExamCountdownCard user={user || null} />

      {/* 2. ADMIN OFFER BOARD (Photo Banners) */}
      <OfferBoardBanner />

      {/* 3. DAILY MORNING MOTIVATION (30-Day Schedule) */}
      <DailyMotivationCard />

      {/* ANNOUNCEMENT BROADCAST SLIDER */}
      {sliderEnabled && activeAnnouncements.length > 0 && currentAnn && (
        <section
          onMouseEnter={() => setSliderPaused(true)}
          onMouseLeave={() => setSliderPaused(false)}
          onTouchStart={() => setSliderPaused(true)}
          onTouchEnd={() => setSliderPaused(false)}
          className="ra-panel-red ra-corners rounded-2xl p-4 relative overflow-hidden"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-lg bg-[#090909] border border-[#FF2525]/55 text-[#FF2525] shrink-0 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono-tech text-[10px] font-bold uppercase tracking-widest text-[#FF2525]">
                    BROADCAST
                  </span>
                  {activeAnnouncements.length > 1 && (
                    <span className="font-mono-tech text-[10px] font-bold text-[#929292]">
                      {String(currentSlide + 1).padStart(2, '0')} / {String(activeAnnouncements.length).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-[#F5F5F5] mt-0.5 truncate">
                  {currentAnn.title}
                </h3>
                <p className="text-xs text-[#C5C5C5] mt-1 leading-relaxed line-clamp-2">
                  {currentAnn.content}
                </p>
                {currentAnnLink && (
                  <button
                    type="button"
                    onClick={() => handleOpenUrl(currentAnnLink)}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-display font-extrabold uppercase tracking-wider text-[#FF2525] hover:text-[#FF762E] transition-colors"
                  >
                    <span>Open Announcement Link</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {activeAnnouncements.length > 1 && (
              <div className="flex items-center gap-1.5 shrink-0 self-center">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentSlide(
                      (prev) => (prev - 1 + activeAnnouncements.length) % activeAnnouncements.length
                    )
                  }
                  aria-label="Previous announcement"
                  className="w-9 h-9 rounded-lg bg-[#090909] hover:bg-[#1D1D1D] text-[#C5C5C5] hover:text-[#F5F5F5] border border-[#454545] flex items-center justify-center transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentSlide((prev) => (prev + 1) % activeAnnouncements.length)
                  }
                  aria-label="Next announcement"
                  className="w-9 h-9 rounded-lg bg-[#090909] hover:bg-[#1D1D1D] text-[#C5C5C5] hover:text-[#F5F5F5] border border-[#454545] flex items-center justify-center transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {activeAnnouncements.length > 1 && (
            <div className="flex items-center gap-1.5 mt-3">
              {activeAnnouncements.map((ann, idx) => (
                <button
                  key={ann.id}
                  type="button"
                  onClick={() => setCurrentSlide(idx)}
                  aria-label={`Slide ${idx + 1}`}
                  className={`h-1 transition-all ${
                    idx === currentSlide
                      ? 'flex-1 bg-[#FF2525]'
                      : 'w-5 bg-[#454545] hover:bg-[#929292]'
                  }`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SEARCH + FEEDBACK COMMAND BAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        <div className="relative lg:col-span-7">
          <Search className="w-4 h-4 text-[#929292] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search study platforms or categories..."
            className="w-full min-h-[48px] bg-[#141414] border border-[#454545] rounded-xl pl-10 pr-10 text-xs sm:text-sm text-[#F5F5F5] placeholder-[#929292]/75 focus:outline-none focus:border-[#FF2525] transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-[#929292] hover:text-[#F5F5F5] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="lg:col-span-5 bg-[#141414] border border-[#454545] rounded-xl px-3.5 py-2 flex items-center justify-between gap-2.5 min-h-[48px]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#090909] border border-[#454545] flex items-center justify-center text-[#FF2525] shrink-0">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-xs font-extrabold uppercase tracking-wide text-[#F5F5F5] truncate">
                Issue &amp; Feedback Desk
              </p>
              <p className="text-[11px] text-[#929292] truncate">
                Report broken links or request batches
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setFeedbackError(null);
              setFeedbackSuccess(null);
              setShowFeedbackModal(true);
            }}
            data-testid="home-feedback-button"
            className="min-h-[38px] px-3.5 rounded-lg bg-[#1D1D1D] hover:bg-[#FF2525] text-[#F5F5F5] border border-[#FF2525]/55 font-display font-bold text-[11px] uppercase tracking-wider shrink-0 active:scale-95 transition-all"
          >
            Report
          </button>
        </div>
      </div>

      {/* CATEGORY FILTER STRIP */}
      {categories.length > 2 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-lg font-display text-[11px] font-extrabold uppercase tracking-wider whitespace-nowrap border transition-colors ${
                  isSelected
                    ? 'bg-[#FF2525] text-[#F5F5F5] border-[#FF2525] shadow-[0_4px_14px_rgba(255,37,37,0.3)]'
                    : 'bg-[#141414] text-[#C5C5C5] border-[#454545] hover:text-[#F5F5F5] hover:border-[#FF2525]/60'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* PLATFORMS SECTION HEADER */}
      <div className="flex items-center justify-between pt-1 px-0.5">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#FF2525]" />
          <h3 className="font-display text-xs sm:text-sm font-black uppercase tracking-[0.16em] text-[#F5F5F5]">
            Study Platforms
          </h3>
        </div>
        <span className="font-mono-tech text-[11px] font-bold text-[#929292]">
          {filtered.length} {filtered.length === 1 ? 'UNIT' : 'UNITS'}
        </span>
      </div>

      {/* INDUSTRIAL MECHANICAL PLATFORM MODULE GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {loading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-[116px] bg-[#1D1D1D] border border-[#454545] rounded-2xl animate-pulse"
              />
            ))}
          </>
        ) : filtered.length === 0 ? (
          <div className="md:col-span-2 text-center py-14 px-5 ra-panel ra-corners rounded-2xl">
            <div className="w-12 h-12 rounded-xl bg-[#090909] border border-[#454545] text-[#FF2525] flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-6 h-6" />
            </div>
            <p className="font-display text-sm font-black uppercase tracking-wider text-[#F5F5F5]">
              {platforms.length === 0 ? 'No Platforms Published Yet' : 'No Matching Platforms'}
            </p>
            <p className="text-xs text-[#929292] mt-1.5 max-w-xs mx-auto leading-relaxed">
              {platforms.length === 0
                ? 'Platforms added and enabled by the administrator will appear here automatically.'
                : 'Adjust your search term or clear the category filter to view all platforms.'}
            </p>
            {(search || selectedCategory !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedCategory('All');
                }}
                className="mt-4 min-h-[40px] px-4 rounded-lg ra-btn-secondary text-xs font-display font-bold uppercase tracking-wider"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          filtered.map((platform) => {
            const isActive = platform.status === 'active';
            const isVip = platform.access_type === 'vip';
            const isChecking = checkingPlatformId === platform.id;
            const logoErrored = Boolean(failedLogoIds[platform.id]);
            const isThisPlatformUnlocked = userHasPlatformVip(platform.id);

            return (
              <article
                key={platform.id}
                className={`group rounded-2xl p-4 flex flex-col justify-between gap-3.5 transition-all duration-150 ra-corners ${
                  isThisPlatformUnlocked
                    ? 'ra-panel-red ra-corners-red border-[#FF2525]/80 hover:border-[#FF2525]'
                    : isVip
                    ? 'ra-panel-red ra-corners-orange hover:border-[#FF762E]'
                    : 'ra-panel hover:border-[#FF2525]'
                }`}
              >
                {/* Top Module Row: Original Platform Logo + Title + Access Status */}
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-14 h-14 rounded-xl bg-[#090909] border border-[#454545] group-hover:border-[#FF2525]/70 flex items-center justify-center overflow-hidden shrink-0 p-1.5 transition-colors">
                    {platform.logo_url && !logoErrored ? (
                      <img
                        src={platform.logo_url}
                        alt={platform.name}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain rounded"
                        onError={() => {
                          setFailedLogoIds((prev) => ({ ...prev, [platform.id]: true }));
                        }}
                      />
                    ) : (
                      <div
                        className={`w-full h-full flex items-center justify-center font-display font-black text-sm tracking-wider ${
                          isVip ? 'text-[#FF762E]' : 'text-[#FF2525]'
                        }`}
                      >
                        {platform.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider text-[#929292] truncate">
                        {platform.category || 'General'}
                      </span>
                      {isThisPlatformUnlocked ? (
                        <span className="font-mono-tech text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 bg-[#FF2525]/15 text-[#F5F5F5] border-[#FF2525]/60 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5 text-[#FF2525]" />
                          <span>UNLOCKED</span>
                        </span>
                      ) : (
                        <span
                          className={`font-mono-tech text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                            isVip
                              ? 'bg-[#FF762E]/15 text-[#FF762E] border-[#FF762E]/55'
                              : 'bg-[#090909] text-[#C5C5C5] border-[#454545]'
                          }`}
                        >
                          {isVip ? 'VIP' : 'PLATFORM'}
                        </span>
                      )}
                    </div>

                    <h2 className="font-display text-sm sm:text-base font-black uppercase text-[#F5F5F5] tracking-wide truncate mt-1">
                      {platform.name}
                    </h2>

                    <div className="flex items-center gap-2 mt-1 font-mono-tech text-[10px]">
                      <span
                        className={`font-bold uppercase ${
                          isActive
                            ? isThisPlatformUnlocked
                              ? 'text-[#FF2525]'
                              : isVip
                              ? 'text-[#FF762E]'
                              : 'text-[#C5C5C5]'
                            : 'text-[#929292]'
                        }`}
                      >
                        {isActive ? 'ONLINE' : 'OFFLINE'}
                      </span>
                      <span className="text-[#454545]">|</span>
                      <span className="text-[#929292] truncate">
                        {userHasAllPlatformsVip
                          ? 'All Platforms VIP Active'
                          : isThisPlatformUnlocked
                          ? 'Single Platform VIP Active'
                          : 'Select VIP (1 Platform) or All VIP'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Plate — 2 Admin-Controlled VIP Buttons (1st: VIP Single Platform, 2nd: ALL VIP) */}
                <div className="pt-2.5 border-t border-[#454545]/60 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {/* 1st Button: Single Platform VIP (or Open Directly if Unlocked) */}
                    <button
                      type="button"
                      onClick={() => handleHomeSingleVipAction(platform)}
                      disabled={!isActive || isChecking}
                      data-testid={`platform-btn-single-vip-${platform.id}`}
                      className={`min-h-[44px] px-2.5 py-2 rounded-xl font-display text-[11px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        !isActive
                          ? 'bg-[#090909] text-[#929292] cursor-not-allowed border border-[#454545]'
                          : isThisPlatformUnlocked
                          ? 'ra-btn-primary'
                          : 'bg-[#141414] hover:bg-[#FF2525] text-[#F5F5F5] border border-[#FF2525]/70 active:scale-95'
                      }`}
                    >
                      {isChecking ? (
                        <span className="font-mono-tech text-[10px]">WAIT...</span>
                      ) : isThisPlatformUnlocked ? (
                        <>
                          <ExternalLink className="w-3.5 h-3.5 stroke-[2.4] shrink-0" />
                          <span className="truncate">OPEN {singleVipLabel}</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5 text-[#FF2525] group-hover:text-[#F5F5F5] shrink-0" />
                          <span className="truncate">{singleVipLabel}</span>
                          {singleVipPrice > 0 && (
                            <span className="font-mono-tech text-[10px] text-[#FF762E] shrink-0">
                              ₹{singleVipPrice}
                            </span>
                          )}
                        </>
                      )}
                    </button>

                    {/* 2nd Button: ALL VIP (Unlocks All Platforms) */}
                    <button
                      type="button"
                      onClick={() => handleHomeAllVipAction(platform)}
                      disabled={!isActive || isChecking}
                      data-testid={`platform-btn-all-vip-${platform.id}`}
                      className={`min-h-[44px] px-2.5 py-2 rounded-xl font-display text-[11px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                        !isActive
                          ? 'bg-[#090909] text-[#929292] cursor-not-allowed border border-[#454545]'
                          : userHasAllPlatformsVip
                          ? 'bg-[#090909] text-[#FF762E] border border-[#FF762E]/60 hover:bg-[#1D1D1D] active:scale-95'
                          : 'bg-gradient-to-b from-[#FF762E] to-[#C90000] hover:brightness-110 text-[#F5F5F5] border border-[#FF762E]/70 active:scale-95 shadow-[0_4px_14px_rgba(255,37,37,0.28)]'
                      }`}
                    >
                      <Crown className="w-3.5 h-3.5 stroke-[2.4] shrink-0" />
                      <span className="truncate">
                        {userHasAllPlatformsVip ? `${allVipLabel} ACTIVE` : allVipLabel}
                      </span>
                      {!userHasAllPlatformsVip && allVipPrice > 0 && (
                        <span className="font-mono-tech text-[10px] text-[#F5F5F5]/95 shrink-0">
                          ₹{allVipPrice}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* SUPPORT & DONATION COMMAND CARDS */}
      {(showSupportOption || showDonationOption) && (
        <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {showSupportOption && (
            <div className="ra-panel rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#090909] border border-[#FF2525]/50 flex items-center justify-center text-[#FF2525] shrink-0">
                  <LifeBuoy className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-black uppercase tracking-wide text-[#F5F5F5]">
                    {settings?.support_title || settings?.support_button_label || 'Contact Support'}
                  </h3>
                  <p className="text-xs text-[#C5C5C5] mt-1 leading-relaxed">
                    {settings?.support_description ||
                      'Need help with keys, VIP access, or platform links? Reach out to our team.'}
                  </p>
                </div>
              </div>

              {validSupportUrl && (
                <button
                  type="button"
                  onClick={() => handleOpenUrl(validSupportUrl)}
                  className="w-full min-h-[44px] px-4 rounded-xl ra-btn-secondary font-display font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2"
                >
                  <LifeBuoy className="w-4 h-4 text-[#FF2525]" />
                  <span>{settings?.support_button_label || settings?.support_title || 'Contact Support'}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#929292]" />
                </button>
              )}
            </div>
          )}

          {showDonationOption && (
            <div className="ra-panel-red rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-[#090909] border border-[#FF762E]/55 flex items-center justify-center text-[#FF762E] shrink-0">
                  <Heart className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-black uppercase tracking-wide text-[#F5F5F5]">
                    {settings?.donation_title || 'Support Free Education'}
                  </h3>
                  {(settings?.donation_description || settings?.donation_message) && (
                    <p className="text-xs text-[#C5C5C5] mt-1 leading-relaxed">
                      {settings?.donation_description || settings?.donation_message}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDonationModal(true)}
                className="w-full min-h-[44px] px-4 rounded-xl ra-btn-primary font-display font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2"
              >
                <Heart className="w-4 h-4" />
                <span>{settings?.donation_button_text || 'Donate & Support Us'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* DUAL OFFICIAL TELEGRAM CHANNELS (Study Blunder + Study Fox) */}
      <DualTelegramChannelsCard settings={settings || null} />

      {/* DONATION QR MODAL (Keeps pure bg-white strictly behind QR <img> for scanner readability) */}
      {showDonationModal && showDonationOption && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ra-panel ra-corners rounded-2xl max-w-sm w-full p-5 shadow-2xl relative text-center">
            <button
              type="button"
              onClick={() => setShowDonationModal(false)}
              aria-label="Close modal"
              className="absolute top-3.5 right-3.5 w-9 h-9 rounded-lg bg-[#090909] border border-[#454545] text-[#C5C5C5] hover:text-[#F5F5F5] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-xl bg-[#090909] text-[#FF2525] flex items-center justify-center mx-auto mb-3 border border-[#FF2525]/50">
              <Heart className="w-5 h-5" />
            </div>

            <h3 className="font-display text-base font-black uppercase tracking-wide text-[#F5F5F5]">
              {settings?.donation_title || 'Support Free Education'}
            </h3>
            {(settings?.donation_description || settings?.donation_message) && (
              <p className="text-xs text-[#C5C5C5] mt-1.5 leading-relaxed">
                {settings?.donation_description || settings?.donation_message}
              </p>
            )}

            {hasDonationQr ? (
              <div className="mt-4 p-3 bg-white rounded-xl inline-block mx-auto shadow-lg">
                <img
                  src={resolvedDonationQrUrl}
                  alt="Support / Donation QR Code"
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
                    handleOpenUrl(validDonationUrl);
                    setShowDonationModal(false);
                  }}
                  className="w-full min-h-[46px] rounded-xl ra-btn-primary font-display font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5"
                >
                  <span>{settings?.donation_button_text || 'Open Donation Link'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowDonationModal(false)}
                className="w-full min-h-[44px] rounded-xl ra-btn-secondary font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BLOCKED ACCOUNT ALERT MODAL */}
      {blockedAlertMessage && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ra-panel ra-corners rounded-2xl max-w-sm w-full p-5 shadow-2xl relative border-[#FF2525]">
            <button
              type="button"
              onClick={() => setBlockedAlertMessage(null)}
              aria-label="Close modal"
              className="absolute top-3.5 right-3.5 w-9 h-9 rounded-lg bg-[#090909] border border-[#454545] text-[#C5C5C5] hover:text-[#F5F5F5] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF2525]/15 text-[#FF2525] flex items-center justify-center shrink-0 border border-[#FF2525]/55">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-sm font-black uppercase text-[#F5F5F5]">
                  Account Blocked
                </h3>
                <p className="text-xs text-[#FF2525] font-semibold">Access Restricted</p>
              </div>
            </div>
            <p className="text-xs text-[#C5C5C5] leading-relaxed mb-4">{blockedAlertMessage}</p>
            <button
              type="button"
              onClick={() => setBlockedAlertMessage(null)}
              className="w-full min-h-[44px] rounded-xl ra-btn-secondary font-bold text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* SINGLE-DEVICE VIP PROTECTION MISMATCH MODAL */}
      {vipDeviceMismatchModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ra-panel ra-corners ra-corners-orange rounded-2xl max-w-sm w-full p-5 shadow-2xl relative border-[#FF762E]/60">
            <button
              type="button"
              onClick={() => setVipDeviceMismatchModal(null)}
              aria-label="Close modal"
              className="absolute top-3.5 right-3.5 w-9 h-9 rounded-lg bg-[#090909] border border-[#454545] text-[#C5C5C5] hover:text-[#F5F5F5] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF762E]/15 text-[#FF762E] flex items-center justify-center shrink-0 border border-[#FF762E]/55">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-sm font-black uppercase text-[#F5F5F5]">
                  Device Lock Active
                </h3>
                <p className="text-xs text-[#FF762E] font-semibold">Registered to Another Device</p>
              </div>
            </div>

            <p className="text-xs text-[#C5C5C5] leading-relaxed mb-3">
              {vipDeviceMismatchModal.message}
            </p>

            <div className="bg-[#090909] border border-[#454545] rounded-xl p-3 mb-4 text-[11px] space-y-1.5">
              <div className="flex justify-between gap-2 text-[#929292]">
                <span>Authorized Device</span>
                <span className="font-mono-tech font-bold text-[#FF762E] truncate">
                  {vipDeviceMismatchModal.boundDeviceLabel}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-[#929292]">
                <span>Requested Platform</span>
                <span className="font-bold text-[#F5F5F5] truncate">
                  {vipDeviceMismatchModal.platformName}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              {(getValidHttpUrl(settings?.support_url) || getValidHttpUrl(settings?.telegram_channel_url)) && (
                <button
                  type="button"
                  onClick={() => {
                    const supportLink =
                      getValidHttpUrl(settings?.support_url) ||
                      getValidHttpUrl(settings?.telegram_channel_url);
                    setVipDeviceMismatchModal(null);
                    if (supportLink) handleOpenUrl(supportLink);
                  }}
                  className="w-full min-h-[46px] rounded-xl ra-btn-primary font-display font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5"
                >
                  <span>Contact Support for Device Reset</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setVipDeviceMismatchModal(null)}
                className="w-full min-h-[44px] rounded-xl ra-btn-secondary font-bold text-xs"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIP ACCESS REQUIRED MODAL */}
      {vipDeniedModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ra-panel-red ra-corners rounded-2xl max-w-sm w-full p-5 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setVipDeniedModal(null)}
              aria-label="Close modal"
              className="absolute top-3.5 right-3.5 w-9 h-9 rounded-lg bg-[#090909] border border-[#454545] text-[#C5C5C5] hover:text-[#F5F5F5] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF762E]/15 text-[#FF762E] flex items-center justify-center shrink-0 border border-[#FF762E]/55">
                <Crown className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-black uppercase text-[#F5F5F5]">
                  VIP Clearance Required
                </h3>
                <p className="text-xs text-[#FF762E] font-semibold truncate">
                  {vipDeniedModal.platformName}
                </p>
              </div>
            </div>

            <p className="text-xs text-[#C5C5C5] leading-relaxed mb-4">
              This platform is restricted to active VIP members. Upgrade your account to unlock direct access.
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleUnlockVipClick}
                className="w-full min-h-[46px] rounded-xl ra-btn-primary font-display font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Unlock VIP Access</span>
              </button>

              <button
                type="button"
                onClick={() => setVipDeniedModal(null)}
                className="w-full min-h-[44px] rounded-xl ra-btn-secondary font-bold text-xs"
              >
                Back to Platforms
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USER FEEDBACK & REPORT MODAL */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="ra-panel ra-corners rounded-2xl max-w-md w-full p-5 shadow-2xl relative max-h-[88vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowFeedbackModal(false)}
              aria-label="Close feedback modal"
              className="absolute top-3.5 right-3.5 w-9 h-9 rounded-lg bg-[#090909] border border-[#454545] text-[#C5C5C5] hover:text-[#F5F5F5] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#090909] text-[#FF2525] flex items-center justify-center shrink-0 border border-[#FF2525]/55">
                <MessageSquarePlus className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display text-sm font-black uppercase text-[#F5F5F5]">
                  Feedback &amp; Issue Report
                </h3>
                <p className="text-[11px] text-[#929292] truncate">
                  {user?.email ? `Signed in as ${user.email}` : 'Share feedback or report an issue'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-[#090909] p-1 rounded-xl border border-[#454545] mb-4">
              <button
                type="button"
                onClick={() => setFeedbackTab('submit')}
                className={`flex-1 min-h-[40px] rounded-lg font-display text-[11px] font-extrabold uppercase tracking-wider transition-colors ${
                  feedbackTab === 'submit'
                    ? 'bg-[#FF2525] text-[#F5F5F5]'
                    : 'text-[#929292] hover:text-[#F5F5F5]'
                }`}
              >
                Submit Report
              </button>
              <button
                type="button"
                onClick={() => setFeedbackTab('history')}
                className={`flex-1 min-h-[40px] rounded-lg font-display text-[11px] font-extrabold uppercase tracking-wider transition-colors ${
                  feedbackTab === 'history'
                    ? 'bg-[#FF2525] text-[#F5F5F5]'
                    : 'text-[#929292] hover:text-[#F5F5F5]'
                }`}
              >
                History ({myFeedbackList.length})
              </button>
            </div>

            {feedbackTab === 'submit' ? (
              <form onSubmit={handleSubmitFeedback} className="space-y-3.5">
                {feedbackError && (
                  <div className="p-3 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#F5F5F5] text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0" />
                    <span>{feedbackError}</span>
                  </div>
                )}

                {feedbackSuccess && (
                  <div className="p-3 rounded-xl bg-[#1D1D1D] border border-[#C5C5C5]/60 text-[#F5F5F5] text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#FF2525] shrink-0" />
                    <span>{feedbackSuccess}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-mono-tech text-[10px] uppercase tracking-wider font-bold text-[#C5C5C5] mb-1">
                      Category
                    </label>
                    <select
                      value={feedbackCategory}
                      onChange={(e) => setFeedbackCategory(e.target.value as FeedbackCategory)}
                      className="w-full min-h-[44px] bg-[#090909] border border-[#454545] rounded-xl px-3 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#FF2525]"
                    >
                      {FEEDBACK_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-mono-tech text-[10px] uppercase tracking-wider font-bold text-[#C5C5C5] mb-1">
                      Rating ({feedbackRating} / 5)
                    </label>
                    <div className="flex items-center justify-between min-h-[44px] bg-[#090909] border border-[#454545] rounded-xl px-3">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className="p-1 transition-transform active:scale-90"
                          title={`${star} Star${star > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`w-4 h-4 ${
                              star <= feedbackRating
                                ? 'text-[#FF762E] fill-[#FF762E]'
                                : 'text-[#454545]'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block font-mono-tech text-[10px] uppercase tracking-wider font-bold text-[#C5C5C5] mb-1">
                    Message
                  </label>
                  <textarea
                    rows={3}
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    placeholder="Describe your bug report, issue, or feature suggestion..."
                    maxLength={2000}
                    required
                    className="w-full bg-[#090909] border border-[#454545] rounded-xl p-3 text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525] resize-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      ref={feedbackFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFeedbackScreenshotChange}
                      className="hidden"
                      id="home-feedback-screenshot-input"
                    />
                    <label
                      htmlFor="home-feedback-screenshot-input"
                      className="cursor-pointer min-h-[42px] px-3 rounded-lg bg-[#090909] hover:bg-[#1D1D1D] text-[#F5F5F5] text-[11px] font-semibold border border-[#454545] flex items-center gap-1.5 transition-colors"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-[#FF2525]" />
                      <span>
                        {feedbackScreenshotName
                          ? feedbackScreenshotName.slice(0, 18)
                          : 'Attach Screenshot'}
                      </span>
                    </label>
                    {feedbackScreenshot && (
                      <button
                        type="button"
                        onClick={() => {
                          setFeedbackScreenshot(null);
                          setFeedbackScreenshotName('');
                          if (feedbackFileInputRef.current) feedbackFileInputRef.current.value = '';
                        }}
                        className="text-[11px] text-[#FF2525] hover:underline font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submittingFeedback}
                    className="min-h-[44px] px-5 rounded-xl ra-btn-primary disabled:opacity-50 font-display font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submittingFeedback ? 'Sending...' : 'Submit'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {loadingFeedbackList ? (
                  <p className="text-xs text-[#929292] text-center py-6">
                    Loading your feedback...
                  </p>
                ) : myFeedbackList.length === 0 ? (
                  <p className="text-xs text-[#929292] text-center py-6">
                    You have not submitted any feedback yet.
                  </p>
                ) : (
                  myFeedbackList.map((fb) => (
                    <div
                      key={fb.id}
                      className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-[11px] font-extrabold uppercase tracking-wider text-[#FF2525]">
                          {fb.category}
                        </span>
                        <span
                          className={`font-mono-tech text-[10px] font-bold uppercase ${
                            fb.status === 'Resolved'
                              ? 'text-[#F5F5F5]'
                              : fb.status === 'In Review'
                              ? 'text-[#FF762E]'
                              : 'text-[#929292]'
                          }`}
                        >
                          {fb.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#F5F5F5] whitespace-pre-wrap break-words">
                        {fb.message}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-[#929292] pt-1 font-mono-tech">
                        <span className="text-[#FF762E]">
                          {'★'.repeat(fb.rating)}
                          {'☆'.repeat(Math.max(0, 5 - fb.rating))}
                        </span>
                        <span>{new Date(fb.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
