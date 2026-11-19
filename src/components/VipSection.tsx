import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Crown,
  Check,
  Sparkles,
  ShieldAlert,
  X,
  ExternalLink,
  QrCode,
  Send,
  Upload,
  Clock,
  CheckCircle2,
  AlertCircle,
  LifeBuoy,
  Image as ImageIcon,
  LogIn,
  RefreshCw,
  Gift,
  Tag,
  Copy,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import type { VipBatch, VipPlan, UserProfile, PublicSettings, PaymentRecord, ReferralPricePreview } from '../types.ts';
import { api } from '../api.ts';

export interface VipThemeSettings {
  background?: string;
  card?: string;
  accent?: string;
  text?: string;
  button?: string;
  border?: string;
}

interface VipSectionProps {
  batches?: VipBatch[];
  plans: VipPlan[];
  loading: boolean;
  isUserVip: boolean;
  user?: UserProfile | null;
  settings?: PublicSettings | null;
  supportUrl?: string;
  vipPurchaseUrl?: string;
  onOpenAuth?: () => void;
  onOpenVipDashboard?: () => void;
  onRefreshPlans?: () => Promise<void> | void;
  vipTheme?: VipThemeSettings;
}

const isValidHttpUrl = (rawUrl?: string | null): string | null => {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Do not auto-invent broken URLs; require valid http/https URL
  }
  return null;
};

const generateClientRequestIdPreview = (planId?: string | null, userId?: string | null): string => {
  const seed = `${planId || 'VIP'}-${userId || 'GUEST'}`.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const suffix = (seed.slice(0, 3) + Math.abs(seed.split('').reduce((a, c) => a + c.charCodeAt(0), 2026)).toString().slice(-3))
    .padEnd(5, '8')
    .slice(0, 5);
  return `SF-VIP-2026-${suffix}`;
};

export const VipSection: React.FC<VipSectionProps> = ({
  plans,
  loading,
  isUserVip,
  user,
  settings,
  supportUrl,
  vipPurchaseUrl,
  onOpenAuth,
  onOpenVipDashboard,
  onRefreshPlans,
}) => {
  const [activeOption, setActiveOption] = useState<'telegram' | 'qr' | null>('qr');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(() =>
    plans.length > 0 ? plans[0].id : null
  );
  const [showVerificationForm, setShowVerificationForm] = useState(false);
  const [copiedReqId, setCopiedReqId] = useState(false);

  // Payment Verification Form State
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotMimeType, setScreenshotMimeType] = useState<string>('image/png');
  const [screenshotFileName, setScreenshotFileName] = useState<string>('');
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [priceUpdateNotice, setPriceUpdateNotice] = useState<string | null>(null);
  const [submittedClaimSuccess, setSubmittedClaimSuccess] = useState<PaymentRecord | null>(null);
  const [telegramNotice, setTelegramNotice] = useState<string | null>(null);
  const [supportNotice, setSupportNotice] = useState<string | null>(null);

  // User's existing payment verification claims & referral price previews
  const [myPayments, setMyPayments] = useState<PaymentRecord[]>([]);
  const [loadingMyPayments, setLoadingMyPayments] = useState(false);
  const [referralPreviews, setReferralPreviews] = useState<Record<string, ReferralPricePreview>>({});

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inlineQrCheckoutRef = useRef<HTMLDivElement | null>(null);
  const plansCarouselRef = useRef<HTMLDivElement | null>(null);
  const planCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [deviceMismatchError, setDeviceMismatchError] = useState<{
    boundDeviceLabel: string;
    message: string;
  } | null>(null);

  // Authoritative selected plan derived directly from live `plans` prop
  const selectedPlan: VipPlan | null = useMemo(() => {
    if (plans.length === 0) return null;
    if (selectedPlanId) {
      const found = plans.find((p) => p.id === selectedPlanId);
      if (found) return found;
    }
    return plans[0];
  }, [plans, selectedPlanId]);

  // Keep selectedPlanId valid whenever plans load or change
  useEffect(() => {
    if (plans.length > 0 && (!selectedPlanId || !plans.some((p) => p.id === selectedPlanId))) {
      setSelectedPlanId(plans[0].id);
    }
  }, [plans, selectedPlanId]);

  const selectedPlanPreview = selectedPlan ? referralPreviews[selectedPlan.id] || null : null;

  // Pre-load the QR code image into browser cache so clicking Get VIP displays it instantaneously
  const configuredQrUrl = settings?.vip_payment_qr_url || '';
  useEffect(() => {
    if (configuredQrUrl) {
      const img = new Image();
      img.src = configuredQrUrl;
    }
  }, [configuredQrUrl]);

  // Synchronize paymentAmount whenever the selected plan or referral discount changes
  useEffect(() => {
    if (selectedPlan && Number(selectedPlan.price_inr) > 0) {
      const payable =
        selectedPlanPreview && selectedPlanPreview.eligible
          ? selectedPlanPreview.final_payable_amount
          : Number(selectedPlan.price_inr);
      setPaymentAmount(String(payable));
    }
  }, [selectedPlan?.id, selectedPlan?.price_inr, selectedPlanPreview]);

  useEffect(() => {
    if (user?.email) {
      setSubmittedEmail(user.email);
    }
  }, [user?.email]);

  const loadMyPayments = () => {
    if (!user) {
      setMyPayments([]);
      setReferralPreviews({});
      return;
    }
    setLoadingMyPayments(true);
    Promise.all([
      api.getMyVipPayments().catch(() => []),
      api.getVipReferralPricePreview().catch(() => null),
    ])
      .then(([list, refPrev]) => {
        setMyPayments(list);
        if (refPrev && refPrev.previews) {
          setReferralPreviews(refPrev.previews);
        } else {
          setReferralPreviews({});
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMyPayments(false));
  };

  useEffect(() => {
    loadMyPayments();
  }, [user?.id]);

  useEffect(() => {
    if (user?.vip_active && user?.role === 'user') {
      api
        .verifyVipDevice()
        .then((res) => {
          if (!res.allowed && res.status === 'bound_other') {
            setDeviceMismatchError({
              boundDeviceLabel:
                res.bound_device_label || user.vip_device_label || 'Registered Primary Device',
              message:
                res.error ||
                'VIP access is already active on another device. Please use your registered device or contact Admin/Support for a device reset.',
            });
          } else {
            setDeviceMismatchError(null);
          }
        })
        .catch(() => {});
    } else {
      setDeviceMismatchError(null);
    }
  }, [user?.id, user?.vip_active, user?.vip_device_status]);

  // Admin-configured URLs & QR settings
  const configuredTelegramUrl =
    settings?.vip_telegram_url || settings?.vip_purchase_url || vipPurchaseUrl || '';

  // Dynamic payment amount strictly synchronized with the selected VIP plan's configured price (and referral discount if eligible)
  const configuredAmount = selectedPlan
    ? selectedPlanPreview && selectedPlanPreview.eligible
      ? Number(selectedPlanPreview.final_payable_amount)
      : Number(selectedPlan.price_inr)
    : settings?.vip_payment_amount && Number(settings.vip_payment_amount) > 0
    ? Number(settings.vip_payment_amount)
    : 0;

  const originalPlanPrice = selectedPlan
    ? selectedPlanPreview && selectedPlanPreview.eligible
      ? Number(selectedPlanPreview.original_plan_price)
      : selectedPlan.original_price_inr && Number(selectedPlan.original_price_inr) > Number(selectedPlan.price_inr)
      ? Number(selectedPlan.original_price_inr)
      : Number(selectedPlan.price_inr)
    : configuredAmount;

  const referralDiscountAmount =
    selectedPlanPreview && selectedPlanPreview.eligible
      ? Number(selectedPlanPreview.referral_discount_applied) || 0
      : 0;

  const planOfferSavings =
    selectedPlan &&
    selectedPlan.original_price_inr &&
    Number(selectedPlan.original_price_inr) > Number(selectedPlan.price_inr)
      ? Number(selectedPlan.original_price_inr) - Number(selectedPlan.price_inr)
      : 0;

  const selectedPlanDurationLabel = selectedPlan
    ? selectedPlan.duration_days
      ? `${selectedPlan.duration_days} Days`
      : `${selectedPlan.duration_months || 1} Months`
    : '';

  const configuredInstructions = settings?.vip_payment_instructions || '';
  const isUtrRequired = Boolean(settings?.vip_payment_utr_required);
  const configuredSupportUrl = settings?.support_url || supportUrl || '';

  const paymentRequestIdPreview = useMemo(
    () =>
      submittedClaimSuccess?.request_id ||
      generateClientRequestIdPreview(selectedPlan?.id, user?.id),
    [submittedClaimSuccess?.request_id, selectedPlan?.id, user?.id]
  );

  const handleSelectPlan = (plan: VipPlan, scrollCardIntoView = false) => {
    setSelectedPlanId(plan.id);
    const prev = referralPreviews[plan.id];
    const payable = prev && prev.eligible ? prev.final_payable_amount : Number(plan.price_inr);
    setPaymentAmount(String(payable));
    setFormError(null);
    setPriceUpdateNotice(null);
    if (scrollCardIntoView && planCardRefs.current[plan.id]) {
      planCardRefs.current[plan.id]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  };

  const handleSelectTelegramOption = (plan?: VipPlan) => {
    if (plan) {
      handleSelectPlan(plan);
    }
    setActiveOption('telegram');
    setTelegramNotice(null);

    const validUrl = isValidHttpUrl(configuredTelegramUrl);
    if (!validUrl) {
      setTelegramNotice(
        'The administrator has not configured a valid Telegram URL yet. Please use Get VIP (Pay via QR Code) below.'
      );
      inlineQrCheckoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    window.open(validUrl, '_blank', 'noopener,noreferrer');
  };

  const handleGetVipClick = (plan?: VipPlan) => {
    const targetPlan = plan || selectedPlan || (plans.length > 0 ? plans[0] : null);
    if (targetPlan) {
      setSelectedPlanId(targetPlan.id);
      const prev = referralPreviews[targetPlan.id];
      const payable = prev && prev.eligible ? prev.final_payable_amount : Number(targetPlan.price_inr);
      setPaymentAmount(String(payable));
    }
    setActiveOption('qr');
    setTelegramNotice(null);
    setSubmittedClaimSuccess(null);
    setFormError(null);
    setPriceUpdateNotice(null);

    if (onRefreshPlans) {
      onRefreshPlans();
    }

    // Smoothly scroll the inline QR checkout box directly below the selected plan into view
    requestAnimationFrame(() => {
      inlineQrCheckoutRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  };

  const handleScrollCarousel = (direction: 'left' | 'right') => {
    const el = plansCarouselRef.current;
    if (!el) return;
    const offset = direction === 'left' ? -300 : 300;
    el.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const handleCopyRequestId = () => {
    navigator.clipboard?.writeText(paymentRequestIdPreview).catch(() => {});
    setCopiedReqId(true);
    setTimeout(() => setCopiedReqId(false), 2000);
  };

  const handleOpenSupport = () => {
    setSupportNotice(null);
    const validSupport = isValidHttpUrl(configuredSupportUrl);
    if (!validSupport) {
      setSupportNotice(
        'Support contact URL has not been configured by the administrator yet. Please check back shortly.'
      );
      return;
    }
    window.open(validSupport, '_blank', 'noopener,noreferrer');
  };

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.type.toLowerCase())) {
      setFormError('Invalid file format. Please select a JPG, PNG, or WEBP screenshot image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const maxBytes = 5 * 1024 * 1024; // 5MB
    if (file.size <= 0 || file.size > maxBytes) {
      setFormError('Screenshot file size must be under 5MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setScreenshotDataUrl(reader.result);
        setScreenshotMimeType(file.type.toLowerCase());
        setScreenshotFileName(file.name);
      }
    };
    reader.onerror = () => {
      setFormError('Failed to read the selected screenshot image. Please try another file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingClaim) return;

    setFormError(null);
    setPriceUpdateNotice(null);

    if (!user) {
      setFormError('Please log in to your STUDY FOX account before submitting a payment claim.');
      return;
    }

    if (plans.length > 0 && (!selectedPlan || !selectedPlan.is_active)) {
      setFormError('Please select an active VIP plan before submitting payment verification.');
      return;
    }

    if (selectedPlan && (!Number.isFinite(Number(selectedPlan.price_inr)) || Number(selectedPlan.price_inr) <= 0)) {
      setFormError('The selected VIP plan has an invalid price configuration. Please contact an administrator.');
      return;
    }

    const cleanEmail = submittedEmail.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError('Please enter the valid Gmail / Email address used to log in to STUDY FOX.');
      return;
    }

    const numAmount = Number(paymentAmount);
    if (!paymentAmount || !Number.isFinite(numAmount) || numAmount <= 0 || numAmount > 1000000) {
      setFormError('Please enter a valid payment amount greater than 0.');
      return;
    }

    if (!screenshotDataUrl) {
      setFormError('Please upload your payment screenshot (JPG, PNG, or WEBP) before submitting.');
      return;
    }

    const cleanUtr = transactionId.trim();
    if (isUtrRequired && !cleanUtr) {
      setFormError('Transaction ID / UTR is required by the administrator.');
      return;
    }

    setIsSubmittingClaim(true);
    try {
      const response = await api.submitVipPaymentClaim({
        submitted_email: cleanEmail,
        amount: numAmount,
        plan_id: selectedPlan?.id,
        plan_title: selectedPlan?.title || 'VIP Membership',
        expected_plan_price: selectedPlan ? Number(selectedPlan.price_inr) : undefined,
        transaction_reference: cleanUtr || undefined,
        screenshot_data_url: screenshotDataUrl,
        screenshot_mime_type: screenshotMimeType,
        purchase_source: 'in_app',
      });

      setSubmittedClaimSuccess(response.payment);
      setShowVerificationForm(false);
      setScreenshotDataUrl(null);
      setScreenshotFileName('');
      setTransactionId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      loadMyPayments();
    } catch (err: unknown) {
      const customErr = err as Error & {
        code?: string;
        updated_price?: number;
      };
      if (customErr?.code === 'PLAN_PRICE_CHANGED' && typeof customErr.updated_price === 'number') {
        setPaymentAmount(String(customErr.updated_price));
        setPriceUpdateNotice(
          customErr.message ||
            `The plan price was recently updated by the administrator to ₹${customErr.updated_price}. Your payment amount has been refreshed.`
        );
        if (onRefreshPlans) {
          await onRefreshPlans();
        }
      } else if (customErr?.code === 'PLAN_UNAVAILABLE' || customErr?.code === 'INVALID_PLAN') {
        setFormError(customErr.message);
        if (onRefreshPlans) {
          await onRefreshPlans();
        }
      } else {
        setFormError(
          err instanceof Error
            ? err.message
            : 'Failed to submit payment verification claim. Please try again.'
        );
      }
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  const isBoundOther =
    Boolean(deviceMismatchError) ||
    Boolean(user?.vip_active && user?.vip_device_status === 'bound_other');

  const enteredAmountNumber = Number(paymentAmount);
  const hasAmountMismatch =
    configuredAmount > 0 &&
    Number.isFinite(enteredAmountNumber) &&
    enteredAmountNumber > 0 &&
    Math.abs(enteredAmountNumber - configuredAmount) > 0.01;

  const hasActiveVipStatus = Boolean(
    user &&
      (isUserVip ||
        user.vip_active ||
        user.vip_membership_state === 'grace_period' ||
        user.role === 'admin' ||
        user.role === 'super_admin')
  );

  return (
    <div className="min-h-[85vh] bg-[#FAF8F5] text-slate-900 pb-28 pt-4 px-3 sm:px-5 transition-colors duration-200">
      <div className="max-w-5xl mx-auto">
        {/* Single-Device Protection Warning (if applicable) */}
        {isBoundOther && (
          <div className="mb-4 w-full bg-rose-50 border border-rose-300 rounded-2xl p-4 text-left shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-rose-100 text-rose-700 border border-rose-200 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-extrabold text-rose-900 uppercase tracking-wider">
                  Single-Device VIP Protection Active
                </h3>
                <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                  {deviceMismatchError?.message ||
                    `VIP access is already active on another device (${user?.vip_device_label || 'Registered Primary Device'}). Please use your registered device or contact Admin/Support for a device reset.`}
                </p>
                <button
                  type="button"
                  onClick={handleOpenSupport}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] transition-colors"
                >
                  <span>Request Device Reset via Support</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Helpful notice if Telegram URL is missing or invalid */}
        {telegramNotice && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{telegramNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setTelegramNotice(null)}
              className="text-amber-700 hover:text-slate-900"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* FIRST THING ON THE VIP PAGE: VIP MEMBERSHIP PLANS HEADER */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100/90 border border-amber-300/80 text-amber-900 text-[10px] font-extrabold uppercase tracking-wider mb-1">
              <Crown className="w-3 h-3 text-amber-600 stroke-[2.4]" />
              <span>Official Study Fox VIP Store</span>
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <span>VIP Membership Plans</span>
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Instant ad-free access to all study platforms, mock tests, and VIP resources.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveVipStatus && onOpenVipDashboard && (
              <button
                type="button"
                onClick={onOpenVipDashboard}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-[11px] shadow-sm transition-colors"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Open VIP Dashboard</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
            <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-800">
              {plans.length} {plans.length === 1 ? 'Plan' : 'Plans'}
            </span>
          </div>
        </div>

        {/* Quick Plan Selector Pills + Carousel Navigation Controls */}
        {!loading && plans.length > 1 && (
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {plans.map((p) => {
                const isSelected = selectedPlan?.id === p.id;
                const refPrev = referralPreviews[p.id];
                const hasRef = Boolean(refPrev && refPrev.eligible && refPrev.referral_discount_applied > 0);
                const price = hasRef ? refPrev.final_payable_amount : p.price_inr;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPlan(p, true)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all border ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-amber-400 hover:text-slate-900'
                    }`}
                  >
                    <span>{p.title}</span>
                    <span className={`ml-1.5 font-mono ${isSelected ? 'text-amber-300' : 'text-amber-700'}`}>
                      ₹{price}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleScrollCarousel('left')}
                aria-label="Previous Plan"
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:border-amber-400 text-slate-700 flex items-center justify-center shadow-xs"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleScrollCarousel('right')}
                aria-label="Next Plan"
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:border-amber-400 text-slate-700 flex items-center justify-center shadow-xs"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* VIP PLANS HORIZONTAL SNAP CAROUSEL ON MOBILE / MULTI-COLUMN GRID ON DESKTOP */}
        <div
          ref={plansCarouselRef}
          className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-3 -mx-1 px-1 scroll-smooth md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible"
        >
          {loading ? (
            <>
              <div className="min-w-[86vw] sm:min-w-[320px] md:min-w-0 h-72 bg-white border border-slate-200 rounded-2xl animate-pulse" />
              <div className="hidden md:block h-72 bg-white border border-slate-200 rounded-2xl animate-pulse" />
            </>
          ) : (
            plans.map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              const refPrev = referralPreviews[plan.id];
              const hasRefDiscount = Boolean(refPrev && refPrev.eligible && refPrev.referral_discount_applied > 0);
              const displayPayable = hasRefDiscount ? refPrev.final_payable_amount : plan.price_inr;
              const strikePrice = hasRefDiscount
                ? plan.price_inr
                : plan.original_price_inr && Number(plan.original_price_inr) > Number(plan.price_inr)
                ? Number(plan.original_price_inr)
                : null;
              const totalSaved = strikePrice ? Math.max(0, strikePrice - Number(displayPayable)) : 0;

              return (
                <div
                  key={plan.id}
                  ref={(el) => {
                    planCardRefs.current[plan.id] = el;
                  }}
                  onClick={() => handleSelectPlan(plan)}
                  className="min-w-[85vw] sm:min-w-[320px] md:min-w-0 snap-center relative pt-3 cursor-pointer"
                >
                  {/* Top Popular / Value Badge */}
                  {plan.badge_label && (
                    <div className="absolute top-0 left-5 z-10">
                      <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-white font-extrabold text-[10px] tracking-wider uppercase shadow-sm">
                        <Sparkles className="w-2.5 h-2.5" />
                        {plan.badge_label}
                      </span>
                    </div>
                  )}

                  {/* Light Theme Plan Card */}
                  <div
                    className={`h-full flex flex-col justify-between rounded-2xl p-5 transition-all duration-200 border ${
                      isSelected
                        ? 'bg-white border-2 border-amber-500 shadow-md ring-2 ring-amber-500/15'
                        : 'bg-white border-slate-200 hover:border-amber-300 shadow-sm'
                    }`}
                  >
                    <div>
                      {/* Card Top Row: Duration + Crown Icon */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                              {plan.duration_days
                                ? `${plan.duration_days} DAYS`
                                : `${plan.duration_months || 1} MONTHS`}
                            </span>
                            {Number(plan.bonus_days || 0) > 0 && (
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                                <Gift className="w-3 h-3" />+{plan.bonus_days} Bonus Days
                              </span>
                            )}
                            {plan.discount_label && (
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 inline-flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                {plan.discount_label}
                              </span>
                            )}
                          </div>

                          <h2 className="text-base font-extrabold text-slate-900 mt-2">
                            {plan.title}
                          </h2>
                          {plan.description && (
                            <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                              {plan.description}
                            </p>
                          )}
                        </div>

                        <div
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                              : 'bg-amber-50 text-amber-600 border-amber-200'
                          }`}
                        >
                          <Crown className="w-5 h-5 stroke-[2.2]" />
                        </div>
                      </div>

                      {/* Price & Savings Block */}
                      <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-baseline justify-between gap-2 flex-wrap">
                        <div className="flex items-baseline gap-2">
                          {strikePrice && (
                            <span className="text-sm font-bold text-slate-400 line-through font-mono">
                              ₹{strikePrice}
                            </span>
                          )}
                          <span className="text-3xl font-extrabold text-slate-900 tabular-nums font-mono">
                            ₹{displayPayable}
                          </span>
                        </div>

                        {totalSaved > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-extrabold">
                            Save ₹{totalSaved}
                          </span>
                        )}
                      </div>

                      {/* Referral Discount Applied Banner on Card */}
                      {hasRefDiscount && refPrev && (
                        <div className="mt-2.5 px-3 py-2 rounded-xl bg-emerald-50/90 border border-emerald-200 flex items-center justify-between text-[11px]">
                          <span className="font-bold text-emerald-800 flex items-center gap-1">
                            <Gift className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{refPrev.discount_label || 'Referral Discount Applied'}</span>
                          </span>
                          <span className="font-extrabold font-mono text-emerald-700">
                            -₹{refPrev.referral_discount_applied}
                          </span>
                        </div>
                      )}

                      {/* Benefit Checklist */}
                      {Array.isArray(plan.features) && plan.features.length > 0 && (
                        <div className="mt-3.5 space-y-2 border-t border-slate-100 pt-3">
                          {plan.features.map((feature, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                              <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                              <span className="font-medium leading-snug">{feature}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons on Plan Card */}
                    <div className="mt-5 pt-3 border-t border-slate-100 space-y-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGetVipClick(plan);
                        }}
                        className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs tracking-wider uppercase shadow-sm active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                      >
                        <Crown className="w-4 h-4 stroke-[2.4]" />
                        <span>Get VIP — Pay ₹{displayPayable}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectTelegramOption(plan);
                        }}
                        className="w-full py-2 px-3 rounded-xl font-bold text-[11px] tracking-wide uppercase border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Send className="w-3 h-3" />
                        <span>Buy via Telegram</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* INLINE / IMMEDIATELY ADJACENT QR & PAYMENT CHECKOUT PANEL (RIGHT BELOW SELECTED PLAN) */}
        {selectedPlan && activeOption === 'qr' && (
          <div
            ref={inlineQrCheckoutRef}
            className="mt-4 bg-white border-2 border-amber-400 rounded-2xl p-4 sm:p-6 shadow-md transition-all"
          >
            {/* Top Bar of Checkout Box */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 block">
                    Selected Plan Checkout & Official QR
                  </span>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    {selectedPlan.title} ({selectedPlanDurationLabel})
                  </h3>
                </div>
              </div>

              {/* Unique Payment Request ID Badge */}
              <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Request ID:</span>
                <span className="text-xs font-mono font-extrabold text-slate-900">
                  {paymentRequestIdPreview}
                </span>
                <button
                  type="button"
                  onClick={handleCopyRequestId}
                  className="ml-1 text-[10px] font-bold text-amber-700 hover:text-amber-900 inline-flex items-center gap-0.5"
                  title="Copy Payment Request ID"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedReqId ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Selected Plan Price + Referral Discount + Final Payable Summary Strip */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/90">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Selected Plan
                </span>
                <strong className="text-xs sm:text-sm font-extrabold text-slate-900 truncate block">
                  {selectedPlan.title}
                </strong>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Original Price
                </span>
                <strong className="text-xs sm:text-sm font-extrabold text-slate-700 font-mono">
                  ₹{originalPlanPrice}
                </strong>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Referral / Offer Discount
                </span>
                <strong className="text-xs sm:text-sm font-extrabold text-emerald-700 font-mono">
                  {referralDiscountAmount > 0
                    ? `-₹${referralDiscountAmount} (Referral)`
                    : planOfferSavings > 0
                    ? `-₹${planOfferSavings} (Offer)`
                    : '₹0'}
                </strong>
              </div>
              <div className="text-left sm:text-right">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 block">
                  Final Payable Amount
                </span>
                <strong className="text-lg sm:text-xl font-extrabold text-amber-700 font-mono tabular-nums">
                  ₹{configuredAmount}
                </strong>
              </div>
            </div>

            {/* Side-by-Side QR Code & Verification Proof Form */}
            {!configuredQrUrl ? (
              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <AlertCircle className="w-7 h-7 text-amber-600 mx-auto" />
                <h4 className="text-xs font-bold text-slate-900">
                  Payment QR Code Not Configured Yet
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                  The administrator has not uploaded a payment QR code yet. Please use the Telegram option or contact Support for assistance.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                {/* Left Column: Official QR Code & Instructions */}
                <div className="md:col-span-5 flex flex-col items-center text-center bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="bg-white p-3 rounded-2xl shadow-xs border border-slate-200 w-52 h-52 flex items-center justify-center">
                    <img
                      src={configuredQrUrl}
                      alt="Official VIP Payment QR Code"
                      width={192}
                      height={192}
                      loading="eager"
                      decoding="sync"
                      className="w-48 h-48 object-contain rounded-lg"
                    />
                  </div>

                  <p className="text-xs text-slate-700 mt-3 leading-relaxed">
                    Scan with any UPI app (GPay, PhonePe, Paytm) and pay{' '}
                    <strong className="text-amber-700 font-mono">₹{configuredAmount}</strong> for{' '}
                    <strong>{selectedPlan.title}</strong>.
                  </p>

                  <a
                    href={configuredQrUrl}
                    download={`StudyFox-VIP-QR-${selectedPlan.title.replace(/\s+/g, '-')}.png`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-bold transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download QR Image</span>
                  </a>

                  {configuredInstructions && (
                    <div className="mt-3 w-full bg-white border border-slate-200 rounded-xl p-3 text-left text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                      <span className="font-bold text-slate-900 block mb-0.5">
                        Payment Instructions:
                      </span>
                      {configuredInstructions}
                    </div>
                  )}
                </div>

                {/* Right Column: Submit Payment Verification Form */}
                <div className="md:col-span-7 bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                      Submit Payment Verification Proof
                    </h4>
                    <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-300">
                      Instant Claim Submission
                    </span>
                  </div>

                  {priceUpdateNotice && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>{priceUpdateNotice}</span>
                    </div>
                  )}

                  {!user ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-center space-y-3">
                      <AlertCircle className="w-6 h-6 text-amber-600 mx-auto" />
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          Account Login Required
                        </p>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          Please log in to your STUDY FOX account so your VIP membership and referral discount are linked to your profile.
                        </p>
                      </div>
                      {onOpenAuth && (
                        <button
                          type="button"
                          onClick={onOpenAuth}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-xs"
                        >
                          <LogIn className="w-4 h-4" />
                          <span>Log In / Register Now</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitClaim} className="space-y-3">
                      {/* 1. Login Gmail / Email */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          1. Login Gmail / Email <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          value={submittedEmail}
                          onChange={(e) => setSubmittedEmail(e.target.value)}
                          placeholder="Enter the Gmail used to log in to STUDY FOX"
                          className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          Authenticated account: <span className="font-semibold text-emerald-700">{user.email}</span>
                        </p>
                      </div>

                      {/* 2. Payment Amount */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] font-bold text-slate-700">
                              2. Paid Amount (₹) <span className="text-rose-600">*</span>
                            </label>
                            {configuredAmount > 0 && (
                              <span className="text-[10px] font-bold text-amber-700 font-mono">
                                Payable: ₹{configuredAmount}
                              </span>
                            )}
                          </div>
                          <input
                            type="number"
                            step="any"
                            min="1"
                            required
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            placeholder={configuredAmount > 0 ? `e.g. ${configuredAmount}` : 'Enter paid amount'}
                            className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 font-mono focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        {/* 3. Transaction ID / UTR */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            3. UPI Ref / 12-Digit UTR{' '}
                            {isUtrRequired ? (
                              <span className="text-rose-600">*</span>
                            ) : (
                              <span className="text-slate-400 font-normal">(Optional)</span>
                            )}
                          </label>
                          <input
                            type="text"
                            required={isUtrRequired}
                            value={transactionId}
                            onChange={(e) => setTransactionId(e.target.value)}
                            placeholder="12-digit UPI UTR Number"
                            className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 font-mono focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>

                      {hasAmountMismatch && (
                        <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>
                            Entered amount (₹{enteredAmountNumber}) differs from the payable amount (₹{configuredAmount}). It will be flagged for admin review.
                          </span>
                        </p>
                      )}

                      {/* 4. Payment Screenshot */}
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          4. Upload Payment Screenshot (JPG, PNG, WEBP) <span className="text-rose-600">*</span>
                        </label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/webp"
                          onChange={handleScreenshotChange}
                          className="hidden"
                        />

                        {!screenshotDataUrl ? (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-4 px-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-amber-500 bg-white flex flex-col items-center justify-center gap-1 transition-colors"
                          >
                            <Upload className="w-5 h-5 text-amber-600" />
                            <span className="text-xs font-bold text-slate-800">
                              Tap to Upload Payment Screenshot
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Supports JPG, PNG, WEBP (Max 5MB)
                            </span>
                          </button>
                        ) : (
                          <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span className="text-xs font-semibold text-slate-800 truncate">
                                  {screenshotFileName || 'Payment Screenshot Selected'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-800 shrink-0 transition-colors"
                              >
                                Change Image
                              </button>
                            </div>
                            <div className="max-h-40 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                              <img
                                src={screenshotDataUrl}
                                alt="Payment Screenshot Preview"
                                className="max-h-36 w-auto object-contain"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {formError && (
                        <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                          <span>{formError}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isSubmittingClaim}
                        className="w-full min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-extrabold text-xs uppercase tracking-wider shadow-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        {isSubmittingClaim ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Submitting Payment Proof...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                            <span>Submit Payment for Verification</span>
                          </>
                        )}
                      </button>
                    </form>
                  )}

                  {/* Submission Confirmation Banner */}
                  {submittedClaimSuccess && (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 space-y-2">
                      <div className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                              Payment Submitted — Pending Verification
                            </h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                              Pending Verification
                            </span>
                          </div>
                          <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                            Request ID:{' '}
                            <span className="font-mono font-bold text-slate-900">
                              {submittedClaimSuccess.request_id || submittedClaimSuccess.id}
                            </span>{' '}
                            for <strong>₹{submittedClaimSuccess.amount}</strong> ({submittedClaimSuccess.plan_title}).
                          </p>
                          <p className="text-[11px] font-semibold text-emerald-800 mt-1 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>Your VIP membership will activate automatically once verified by Admin.</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User's Payment Verification Claims Status List */}
        {user && myPayments.length > 0 && (
          <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Your Payment Verification History</span>
              </h3>
              <button
                type="button"
                onClick={loadMyPayments}
                disabled={loadingMyPayments}
                className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingMyPayments ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="space-y-2">
              {myPayments.slice(0, 5).map((claim) => {
                const isPending =
                  claim.status === 'pending_verification' || claim.status === 'pending';
                const isApproved = claim.status === 'completed' || claim.status === 'approved';
                const statusLabel = isPending
                  ? 'Pending Verification'
                  : isApproved
                  ? 'Verified & Approved'
                  : claim.status === 'rejected'
                  ? 'Rejected'
                  : 'Failed';

                return (
                  <div
                    key={claim.id}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900 font-mono">
                          ₹{claim.amount}
                        </span>
                        <span className="text-xs font-semibold text-slate-700 truncate">
                          {claim.plan_title}
                        </span>
                        {claim.request_id && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            {claim.request_id}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isPending
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : isApproved
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 truncate">
                        Submitted: {new Date(claim.created_at).toLocaleString()}
                        {claim.transaction_reference ? ` · UTR: ${claim.transaction_reference}` : ''}
                      </p>
                      {claim.admin_note && (
                        <p className="text-[10px] text-amber-800 font-medium mt-1">
                          Note: {claim.admin_note}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Global Support / Help Notice */}
        <div className="mt-5 flex items-center justify-between p-3.5 rounded-2xl bg-white border border-slate-200 text-xs shadow-2xs">
          <div className="flex items-center gap-2 text-slate-700">
            <LifeBuoy className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Need assistance with VIP plans or payment verification?</span>
          </div>
          <button
            type="button"
            onClick={handleOpenSupport}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] transition-colors shrink-0"
          >
            Contact Support
          </button>
        </div>

        {supportNotice && (
          <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-[11px] flex items-center justify-between gap-2">
            <span>{supportNotice}</span>
            <button
              type="button"
              onClick={() => setSupportNotice(null)}
              className="text-amber-700 hover:text-slate-900"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
