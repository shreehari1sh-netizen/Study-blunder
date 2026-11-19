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
} from 'lucide-react';
import type { Platform, Announcement, UserProfile, PublicSettings, UserFeedbackRecord, FeedbackCategory } from '../types.ts';
import { api } from '../api.ts';

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
  onNavigateToVip?: () => void;
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
    <span className="font-bold truncate">
      {isVipValid
        ? `VIP Active — Expires in ${formatRemainingTime(vipExpiresAt, tickNow)}`
        : isFreeAccessValid
        ? `Key Active — ${formatRemainingTime(freeAccessExpiresAt, tickNow)} left`
        : 'Access Key Expired — Generate a new key to open platforms'}
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

  // Existing Feedback System State (accessible directly from Home Screen for VIP & Non-VIP users)
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

  // Use 30-second schedule bucket so announcement memo does not re-evaluate every 1 second
  const scheduleBucketMs = Math.floor(now / 30000) * 30000;

  // Filter announcements by published status and optional start/end schedule dates, sorted by display_order
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

  // Reset slide index if out of bounds
  useEffect(() => {
    if (currentSlide >= activeAnnouncements.length && activeAnnouncements.length > 0) {
      setCurrentSlide(0);
    }
  }, [activeAnnouncements.length, currentSlide]);

  // Automatic announcement slider timer (pauses when tab is hidden or hovered/touched)
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

  const isInternalStudyFoxHost = (parsedUrl: URL): boolean => {
    const host = parsedUrl.hostname.toLowerCase();
    return (
      parsedUrl.origin === window.location.origin ||
      host === 'study-fox.onrender.com'
    );
  };

  const handleOpenUrl = (url: string) => {
    const valid = getValidHttpUrl(url);
    if (!valid) return;
    try {
      const parsed = new URL(valid);
      if (isInternalStudyFoxHost(parsed)) {
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
            (isInternalStudyFoxHost(parsed) &&
              parsed.searchParams.get('tab')?.toLowerCase() === 'vip')) &&
          onNavigateToVip
        ) {
          onNavigateToVip();
          return;
        }
      } catch {
        // Fallback to opening external URL
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

    // Immediate client-side guard for expired free student access on protected normal platforms
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
        // Ensure usage event is recorded non-blockingly (deduplicated by clickId on server)
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
        // Non-VIP user clicked a VIP platform: redirect directly to VIP destination / VIP page
        handleRedirectToVipDestination(res.vip_redirect_url || res.vip_purchase_url);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('blocked')) {
        setBlockedAlertMessage(msg);
        return;
      }
      // Never bypass server-side access verification on network/API errors
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

  return (
    <div className="pb-24 pt-3 px-4 max-w-lg mx-auto">
      {/* Blocked Account Notice Banner */}
      {user?.is_blocked && (
        <div className="mb-3 rounded-2xl p-3.5 bg-rose-950/60 border border-rose-500/50 text-rose-200 flex items-start gap-2.5 shadow-lg">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-extrabold text-rose-300">Account Suspended</p>
            <p className="text-rose-200/90 mt-0.5">
              Your account has been blocked by an administrator and cannot access protected platforms.
              {user.blocked_reason ? ` Reason: ${user.blocked_reason}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Live Student Access Countdown Banner */}
      {isStudent && !user?.is_blocked && (
        <div
          className={`mb-3 rounded-2xl px-3.5 py-2.5 border flex items-center justify-between gap-2 text-xs shadow-md transition-colors ${
            isVipValid
              ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
              : isFreeAccessValid
              ? 'bg-[#0C1222]/90 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isVipValid ? (
              <Crown className="w-4 h-4 text-amber-400 shrink-0" />
            ) : isFreeAccessValid ? (
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <IsolatedHomeAccessCountdown
              isVipValid={isVipValid}
              isFreeAccessValid={isFreeAccessValid}
              vipExpiresAt={user?.vip_expires_at}
              freeAccessExpiresAt={user?.free_access_expires_at}
            />
          </div>

          {!isVipValid && onOpenKeyGen && (
            <button
              onClick={onOpenKeyGen}
              className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-white font-bold text-[11px] flex items-center gap-1 shrink-0 border border-slate-700"
            >
              <Key className="w-3 h-3 text-indigo-400" />
              <span>{isFreeAccessValid ? 'Renew' : 'Generate Key'}</span>
            </button>
          )}
        </div>
      )}

      {/* Announcement Slider (Only rendered when enabled and active announcements exist) */}
      {sliderEnabled && activeAnnouncements.length > 0 && currentAnn && (
        <div
          onMouseEnter={() => setSliderPaused(true)}
          onMouseLeave={() => setSliderPaused(false)}
          onTouchStart={() => setSliderPaused(true)}
          onTouchEnd={() => setSliderPaused(false)}
          className="mb-3 bg-gradient-to-r from-purple-950/75 via-indigo-950/75 to-slate-900/90 border border-purple-700/40 rounded-2xl p-3.5 shadow-lg relative overflow-hidden"
        >
          <div className="flex items-start justify-between gap-2.5 min-h-[52px]">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div className="p-1.5 rounded-xl bg-purple-600/30 text-purple-300 shrink-0 mt-0.5 border border-purple-500/30">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-extrabold text-purple-200 truncate">
                    {currentAnn.title}
                  </p>
                  {activeAnnouncements.length > 1 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300 shrink-0 tabular-nums">
                      {currentSlide + 1}/{activeAnnouncements.length}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed line-clamp-2">
                  {currentAnn.content}
                </p>
                {currentAnnLink && (
                  <button
                    onClick={() => handleOpenUrl(currentAnnLink)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-300 hover:text-white transition-colors"
                  >
                    <span>Open Link</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {activeAnnouncements.length > 1 && (
              <div className="flex items-center gap-1 shrink-0 self-center">
                <button
                  onClick={() =>
                    setCurrentSlide(
                      (prev) => (prev - 1 + activeAnnouncements.length) % activeAnnouncements.length
                    )
                  }
                  aria-label="Previous announcement"
                  className="p-1 rounded-lg bg-slate-900/70 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() =>
                    setCurrentSlide((prev) => (prev + 1) % activeAnnouncements.length)
                  }
                  aria-label="Next announcement"
                  className="p-1 rounded-lg bg-slate-900/70 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {activeAnnouncements.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-2.5">
              {activeAnnouncements.map((ann, idx) => (
                <button
                  key={ann.id}
                  onClick={() => setCurrentSlide(idx)}
                  aria-label={`Slide ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === currentSlide
                      ? 'w-4 bg-purple-400'
                      : 'w-1.5 bg-slate-700 hover:bg-slate-500'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Compact Feedback Bar — Directly below Announcement Banner and above Platform Cards (Visible to VIP & Non-VIP users) */}
      <div className="mb-3 bg-[#0C1222]/90 border border-slate-800/90 rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <MessageSquarePlus className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-white tracking-wide truncate">
              Feedback & Issue Report
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              Share suggestions or report bugs to Admin
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
          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs tracking-wide shrink-0 shadow-sm shadow-indigo-950/50 active:scale-95 transition-all flex items-center gap-1.5"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" />
          <span>Feedback</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative mb-3">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search education platforms..."
          className="w-full bg-[#0E1526]/90 border border-slate-800/90 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Category Filter Tabs */}
      {categories.length > 2 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                backgroundColor: selectedCategory === cat ? 'var(--theme-button, #4f46e5)' : undefined,
              }}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'text-white shadow-sm'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Platform List (Screenshot 1 Match) */}
      <div className="space-y-3 mt-1">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-20 bg-slate-900/60 border border-slate-800/50 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-4 bg-slate-900/40 rounded-2xl border border-slate-800/60">
            <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-300">No platforms found</p>
            <p className="text-xs text-slate-500 mt-1">Try another search or category filter</p>
          </div>
        ) : (
          filtered.map((platform) => {
            const isActive = platform.status === 'active';
            const isVip = platform.access_type === 'vip';
            const isChecking = checkingPlatformId === platform.id;

            return (
              <div
                key={platform.id}
                className="bg-[#0C1222]/90 hover:bg-[#10172B] border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-lg shadow-black/20 transition-all duration-200"
              >
                {/* Left: Logo & Details */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-[#080D19] border border-slate-800 flex items-center justify-center overflow-hidden shrink-0 p-1">
                    {platform.logo_url ? (
                      <img
                        src={platform.logo_url}
                        alt={platform.name}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain rounded-lg"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-xs text-indigo-400">
                        {platform.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-xs md:text-sm font-extrabold uppercase text-white tracking-wide truncate">
                        {platform.name}
                      </h2>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                      {platform.category || 'General'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isActive ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-slate-500'
                        }`}
                      />
                      <span className={`text-[10px] font-semibold ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Button: VIP (with Crown icon) OR OPEN (with ExternalLink icon) */}
                {isVip ? (
                  <button
                    onClick={() => handlePlatformClick(platform)}
                    disabled={!isActive || isChecking}
                    style={{
                      background: isActive
                        ? 'linear-gradient(135deg, var(--vip-theme-accent, #f59e0b), var(--vip-theme-button, #eab308))'
                        : undefined,
                      color: isActive ? '#000000' : undefined,
                    }}
                    className={`px-4 py-2 rounded-full text-xs font-extrabold tracking-wider flex items-center gap-1.5 shrink-0 transition-all ${
                      isActive
                        ? 'hover:opacity-95 shadow-md shadow-black/40 active:scale-95'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/40'
                    }`}
                  >
                    {isChecking ? (
                      <span className="text-[11px] animate-pulse">Checking...</span>
                    ) : (
                      <>
                        <Crown className="w-3.5 h-3.5 stroke-[2.3]" />
                        <span>VIP</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => handlePlatformClick(platform)}
                    disabled={!isActive}
                    style={{
                      backgroundColor: isActive ? 'var(--theme-button, #0284c7)' : undefined,
                      color: isActive ? 'var(--theme-text, #ffffff)' : undefined,
                      boxShadow: isActive ? '0 4px 14px -2px rgba(0, 0, 0, 0.4)' : undefined,
                    }}
                    className={`px-4 py-2 rounded-full text-xs font-bold tracking-wider flex items-center gap-1.5 shrink-0 transition-all ${
                      isActive
                        ? 'hover:opacity-90 active:scale-95'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/40'
                    }`}
                  >
                    <span>OPEN</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Support & Help Option (Restored to previous clean layout without support image) */}
      {showSupportOption && (
        <div className="mt-5 bg-[#0C1222]/90 border border-indigo-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-extrabold text-white tracking-wide">
                  {settings?.support_title || settings?.support_button_label || 'Contact Support'}
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  {settings?.support_description || 'Need help with keys, VIP access, or platform links? Reach out to our team.'}
                </p>
              </div>
            </div>
          </div>

          {validSupportUrl && (
            <button
              onClick={() => handleOpenUrl(validSupportUrl)}
              className="mt-3 w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs tracking-wider uppercase shadow-md shadow-indigo-950/50 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
            >
              <LifeBuoy className="w-3.5 h-3.5" />
              <span>{settings?.support_button_label || settings?.support_title || 'Contact Support'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Voluntary Donation Option (Image remains hidden on page; clicking button opens donation modal) */}
      {showDonationOption && (
        <div className="mt-4 bg-gradient-to-br from-rose-950/35 via-[#0C1222] to-indigo-950/35 border border-rose-500/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Heart className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-extrabold text-white tracking-wide">
                  {settings?.donation_title || 'Support Free Education'}
                </h3>
                {(settings?.donation_description || settings?.donation_message) && (
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                    {settings?.donation_description || settings?.donation_message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowDonationModal(true)}
            className="mt-3 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-extrabold text-xs tracking-wider uppercase shadow-md shadow-rose-950/50 flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
          >
            <Heart className="w-3.5 h-3.5" />
            <span>{settings?.donation_button_text || 'Donate & Support Us'}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Donation QR / Details Modal (Image is only displayed inside this modal when user clicks Donate) */}
      {showDonationModal && showDonationOption && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-rose-500/40 rounded-3xl max-w-sm w-full p-5 shadow-2xl relative text-center animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowDonationModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3 border border-rose-500/30">
              <Heart className="w-6 h-6" />
            </div>

            <h3 className="text-sm font-extrabold text-white">
              {settings?.donation_title || 'Support Free Education'}
            </h3>
            {(settings?.donation_description || settings?.donation_message) && (
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                {settings?.donation_description || settings?.donation_message}
              </p>
            )}

            {hasDonationQr ? (
              <div className="mt-4 p-3 bg-white rounded-2xl inline-block mx-auto shadow-inner">
                <img
                  src={resolvedDonationQrUrl}
                  alt="Support / Donation QR Code"
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
                    handleOpenUrl(validDonationUrl);
                    setShowDonationModal(false);
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5"
                >
                  <span>{settings?.donation_button_text || 'Open Donation Link'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setShowDonationModal(false)}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocked Account Alert Modal */}
      {blockedAlertMessage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-rose-500/40 rounded-3xl max-w-sm w-full p-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setBlockedAlertMessage(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">Account Blocked</h3>
                <p className="text-xs text-rose-400 font-medium">Access Restricted</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">{blockedAlertMessage}</p>
            <button
              onClick={() => setBlockedAlertMessage(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Single-Device VIP Protection Mismatch Modal */}
      {vipDeviceMismatchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-amber-500/40 rounded-3xl max-w-sm w-full p-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setVipDeviceMismatchModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">Single-Device VIP Protection</h3>
                <p className="text-xs text-amber-400 font-medium">Registered to Another Device</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              {vipDeviceMismatchModal.message}
            </p>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 mb-4 text-[11px] space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Authorized Device:</span>
                <span className="font-bold text-amber-300">{vipDeviceMismatchModal.boundDeviceLabel}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Requested Platform:</span>
                <span className="font-semibold text-white">{vipDeviceMismatchModal.platformName}</span>
              </div>
            </div>

            <div className="space-y-2">
              {(getValidHttpUrl(settings?.support_url) || getValidHttpUrl(settings?.telegram_channel_url)) && (
                <button
                  onClick={() => {
                    const supportLink =
                      getValidHttpUrl(settings?.support_url) ||
                      getValidHttpUrl(settings?.telegram_channel_url);
                    setVipDeviceMismatchModal(null);
                    if (supportLink) handleOpenUrl(supportLink);
                  }}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Contact Admin / Support for Device Reset</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={() => setVipDeviceMismatchModal(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIP Access Required Modal */}
      {vipDeniedModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-purple-500/40 rounded-3xl max-w-sm w-full p-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setVipDeniedModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                <Crown className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">VIP Access Required</h3>
                <p className="text-xs text-amber-400/90 font-medium">{vipDeniedModal.platformName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              This platform is restricted to active VIP members. Your current account does not have an active VIP entitlement.
            </p>

            <div className="space-y-2">
              <button
                onClick={handleUnlockVipClick}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-purple-600 to-indigo-600 hover:opacity-95 text-white font-extrabold text-xs tracking-wider uppercase shadow-lg shadow-purple-950/60 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>Unlock VIP Access</span>
              </button>

              <button
                onClick={() => setVipDeniedModal(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors"
              >
                Back to Platforms
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing User Feedback Modal (Accessible directly from Home Screen for VIP & Non-VIP users) */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-indigo-500/40 rounded-3xl max-w-md w-full p-5 shadow-2xl relative max-h-[88vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowFeedbackModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-500/30">
                <MessageSquarePlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">User Feedback & Issue Report</h3>
                <p className="text-[11px] text-slate-400">
                  {user?.email ? `Signed in as ${user.email}` : 'Share feedback or report an issue'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800 mb-3">
              <button
                type="button"
                onClick={() => setFeedbackTab('submit')}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                  feedbackTab === 'submit'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Submit Feedback
              </button>
              <button
                type="button"
                onClick={() => setFeedbackTab('history')}
                className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                  feedbackTab === 'history'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                My Submissions ({myFeedbackList.length})
              </button>
            </div>

            {feedbackTab === 'submit' ? (
              <form onSubmit={handleSubmitFeedback} className="space-y-3">
                {feedbackError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-700/60 text-rose-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{feedbackError}</span>
                  </div>
                )}

                {feedbackSuccess && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{feedbackSuccess}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Feedback Category
                    </label>
                    <select
                      value={feedbackCategory}
                      onChange={(e) => setFeedbackCategory(e.target.value as FeedbackCategory)}
                      className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    >
                      {FEEDBACK_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">
                      Rating ({feedbackRating} / 5 Stars)
                    </label>
                    <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFeedbackRating(star)}
                          className="p-0.5 transition-transform active:scale-90"
                          title={`${star} Star${star > 1 ? 's' : ''}`}
                        >
                          <Star
                            className={`w-4 h-4 ${
                              star <= feedbackRating
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-slate-600'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Your Message
                  </label>
                  <textarea
                    rows={3}
                    value={feedbackMessage}
                    onChange={(e) => setFeedbackMessage(e.target.value)}
                    placeholder="Describe your bug report, issue, or feature suggestion..."
                    maxLength={2000}
                    required
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
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
                      className="cursor-pointer px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-[11px] font-semibold border border-slate-800 flex items-center gap-1.5 transition-colors"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-indigo-400" />
                      <span>
                        {feedbackScreenshotName
                          ? feedbackScreenshotName.slice(0, 18)
                          : 'Attach Screenshot (Optional)'}
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
                        className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submittingFeedback}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-950/50 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{submittingFeedback ? 'Sending...' : 'Submit Feedback'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {loadingFeedbackList ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    Loading your feedback...
                  </p>
                ) : myFeedbackList.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">
                    You have not submitted any feedback yet.
                  </p>
                ) : (
                  myFeedbackList.map((fb) => (
                    <div
                      key={fb.id}
                      className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-indigo-300">
                          {fb.category}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase ${
                            fb.status === 'Resolved'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                              : fb.status === 'In Review'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-700/50'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {fb.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 whitespace-pre-wrap break-words">
                        {fb.message}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                        <span>{'★'.repeat(fb.rating)}{'☆'.repeat(Math.max(0, 5 - fb.rating))}</span>
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
