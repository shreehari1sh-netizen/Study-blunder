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
  Layers,
  Lock,
} from 'lucide-react';
import type { Platform, VipBatch, VipPlan, UserProfile, PublicSettings, PaymentRecord, ReferralPricePreview } from '../types.ts';
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
  platforms?: Platform[];
  initialVipMode?: 'single_platform' | 'all_platforms';
  initialPlatformId?: string | null;
  vipIntentNonce?: number;
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
  platforms = [],
  initialVipMode,
  initialPlatformId,
  vipIntentNonce,
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
  const [vipMode, setVipMode] = useState<'single_platform' | 'all_platforms'>(
    initialVipMode || 'single_platform'
  );
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(
    initialPlatformId || (platforms.length > 0 ? platforms[0].id : null)
  );
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

  // Visible active platforms from Home section for One Platform VIP selection
  const availableHomePlatforms = useMemo(
    () => platforms.filter((p) => p.status === 'active' && p.is_visible !== false),
    [platforms]
  );

  // React to navigation intent from Home Page buttons (1st VIP -> single_platform + platformId, 2nd ALL VIP -> all_platforms)
  useEffect(() => {
    if (initialVipMode) {
      setVipMode(initialVipMode);
      setActiveOption('qr');
      setFormError(null);
      setPriceUpdateNotice(null);
    }
    if (initialPlatformId) {
      setSelectedPlatformId(initialPlatformId);
    }
  }, [initialVipMode, initialPlatformId, vipIntentNonce]);

  // Ensure a valid platform is selected whenever platforms load
  useEffect(() => {
    if (
      availableHomePlatforms.length > 0 &&
      (!selectedPlatformId || !availableHomePlatforms.some((p) => p.id === selectedPlatformId))
    ) {
      setSelectedPlatformId(availableHomePlatforms[0].id);
    }
  }, [availableHomePlatforms, selectedPlatformId]);

  const selectedPlatform: Platform | null = useMemo(() => {
    if (availableHomePlatforms.length === 0) return null;
    if (selectedPlatformId) {
      const found = availableHomePlatforms.find((p) => p.id === selectedPlatformId);
      if (found) return found;
    }
    return availableHomePlatforms[0];
  }, [availableHomePlatforms, selectedPlatformId]);

  const [selectedSinglePlanId, setSelectedSinglePlanId] = useState<string | null>(null);

  // Partition active plans by Admin's target button scope: 1st Button (single_platform) vs 2nd Button (all_platforms)
  const singlePlatformPlans = useMemo(
    () => plans.filter((p) => p.plan_scope === 'single_platform'),
    [plans]
  );
  const allPlatformPlans = useMemo(
    () => plans.filter((p) => p.plan_scope !== 'single_platform'),
    [plans]
  );

  // Authoritative selected plan for 1st Button (One Platform VIP)
  const selectedSinglePlan: VipPlan | null = useMemo(() => {
    if (singlePlatformPlans.length === 0) return null;
    if (selectedSinglePlanId) {
      const found = singlePlatformPlans.find((p) => p.id === selectedSinglePlanId);
      if (found) return found;
    }
    return singlePlatformPlans[0];
  }, [singlePlatformPlans, selectedSinglePlanId]);

  useEffect(() => {
    if (
      singlePlatformPlans.length > 0 &&
      (!selectedSinglePlanId || !singlePlatformPlans.some((p) => p.id === selectedSinglePlanId))
    ) {
      setSelectedSinglePlanId(singlePlatformPlans[0].id);
    }
  }, [singlePlatformPlans, selectedSinglePlanId]);

  // Authoritative selected plan for 2nd Button (All Platforms VIP)
  const selectedPlan: VipPlan | null = useMemo(() => {
    if (allPlatformPlans.length === 0) return null;
    if (selectedPlanId) {
      const found = allPlatformPlans.find((p) => p.id === selectedPlanId);
      if (found) return found;
    }
    return allPlatformPlans[0];
  }, [allPlatformPlans, selectedPlanId]);

  // Keep selectedPlanId valid whenever allPlatformPlans load or change
  useEffect(() => {
    if (allPlatformPlans.length > 0 && (!selectedPlanId || !allPlatformPlans.some((p) => p.id === selectedPlanId))) {
      setSelectedPlanId(allPlatformPlans[0].id);
    }
  }, [allPlatformPlans, selectedPlanId]);

  const selectedSinglePlanPreview = selectedSinglePlan ? referralPreviews[selectedSinglePlan.id] || null : null;
  const selectedPlanPreview = selectedPlan ? referralPreviews[selectedPlan.id] || null : null;

  // Single Platform VIP & Fallback All Platforms VIP configured prices
  const fallbackSingleVipPrice = Number(settings?.home_single_vip_price ?? 49);
  const fallbackSingleVipDurationDays = Number(settings?.home_single_vip_duration_days ?? 30);
  const singleVipPrice = selectedSinglePlan
    ? selectedSinglePlanPreview && selectedSinglePlanPreview.eligible
      ? Number(selectedSinglePlanPreview.final_payable_amount)
      : Number(selectedSinglePlan.price_inr)
    : fallbackSingleVipPrice;
  const singleVipDurationDays = selectedSinglePlan
    ? Number(selectedSinglePlan.duration_days) || fallbackSingleVipDurationDays
    : fallbackSingleVipDurationDays;

  const allVipFallbackPrice = Number(
    settings?.home_all_vip_price || settings?.vip_payment_amount || 149
  );
  const allVipFallbackDays = Number(settings?.home_all_vip_duration_days ?? 30);

  // Pre-load the QR code image into browser cache so clicking Get VIP displays it instantaneously
  const configuredQrUrl = settings?.vip_payment_qr_url || '';
  useEffect(() => {
    if (configuredQrUrl) {
      const img = new Image();
      img.src = configuredQrUrl;
    }
  }, [configuredQrUrl]);

  // Synchronize paymentAmount whenever mode, selected plan, or settings change
  useEffect(() => {
    if (vipMode === 'single_platform') {
      if (singleVipPrice > 0) {
        setPaymentAmount(String(singleVipPrice));
      }
      return;
    }
    if (selectedPlan && Number(selectedPlan.price_inr) > 0) {
      const payable =
        selectedPlanPreview && selectedPlanPreview.eligible
          ? selectedPlanPreview.final_payable_amount
          : Number(selectedPlan.price_inr);
      setPaymentAmount(String(payable));
    } else if (allVipFallbackPrice > 0) {
      setPaymentAmount(String(allVipFallbackPrice));
    }
  }, [
    vipMode,
    singleVipPrice,
    allVipFallbackPrice,
    selectedSinglePlan?.id,
    selectedSinglePlan?.price_inr,
    selectedSinglePlanPreview,
    selectedPlan?.id,
    selectedPlan?.price_inr,
    selectedPlanPreview,
  ]);

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

  // Dynamic payment amount strictly synchronized with the active VIP mode (One Platform VIP vs All Platforms VIP)
  const configuredAmount =
    vipMode === 'single_platform'
      ? singleVipPrice
      : selectedPlan
      ? selectedPlanPreview && selectedPlanPreview.eligible
        ? Number(selectedPlanPreview.final_payable_amount)
        : Number(selectedPlan.price_inr)
      : allVipFallbackPrice;

  const originalPlanPrice =
    vipMode === 'single_platform'
      ? selectedSinglePlan
        ? selectedSinglePlanPreview && selectedSinglePlanPreview.eligible
          ? Number(selectedSinglePlanPreview.original_plan_price)
          : selectedSinglePlan.original_price_inr && Number(selectedSinglePlan.original_price_inr) > Number(selectedSinglePlan.price_inr)
          ? Number(selectedSinglePlan.original_price_inr)
          : Number(selectedSinglePlan.price_inr)
        : singleVipPrice
      : selectedPlan
      ? selectedPlanPreview && selectedPlanPreview.eligible
        ? Number(selectedPlanPreview.original_plan_price)
        : selectedPlan.original_price_inr && Number(selectedPlan.original_price_inr) > Number(selectedPlan.price_inr)
        ? Number(selectedPlan.original_price_inr)
        : Number(selectedPlan.price_inr)
      : configuredAmount;

  const referralDiscountAmount =
    vipMode === 'single_platform'
      ? selectedSinglePlanPreview && selectedSinglePlanPreview.eligible
        ? Number(selectedSinglePlanPreview.referral_discount_applied) || 0
        : 0
      : selectedPlanPreview && selectedPlanPreview.eligible
      ? Number(selectedPlanPreview.referral_discount_applied) || 0
      : 0;

  const planOfferSavings =
    vipMode === 'single_platform'
      ? selectedSinglePlan &&
        selectedSinglePlan.original_price_inr &&
        Number(selectedSinglePlan.original_price_inr) > Number(selectedSinglePlan.price_inr)
        ? Number(selectedSinglePlan.original_price_inr) - Number(selectedSinglePlan.price_inr)
        : 0
      : selectedPlan &&
        selectedPlan.original_price_inr &&
        Number(selectedPlan.original_price_inr) > Number(selectedPlan.price_inr)
      ? Number(selectedPlan.original_price_inr) - Number(selectedPlan.price_inr)
      : 0;

  const checkoutPlanTitle =
    vipMode === 'single_platform'
      ? selectedPlatform
        ? `${selectedSinglePlan ? selectedSinglePlan.title : 'One Platform VIP'} — ${selectedPlatform.name}`
        : selectedSinglePlan
        ? selectedSinglePlan.title
        : 'One Platform VIP'
      : selectedPlan
      ? selectedPlan.title
      : 'All Platforms VIP';

  const selectedPlanDurationLabel =
    vipMode === 'single_platform'
      ? `${singleVipDurationDays} Days`
      : selectedPlan
      ? selectedPlan.duration_days
        ? `${selectedPlan.duration_days} Days`
        : `${selectedPlan.duration_months || 1} Months`
      : `${allVipFallbackDays} Days`;

  const configuredInstructions = settings?.vip_payment_instructions || '';
  const isUtrRequired = Boolean(settings?.vip_payment_utr_required);
  const configuredSupportUrl = settings?.support_url || supportUrl || '';

  const paymentRequestIdPreview = useMemo(
    () =>
      submittedClaimSuccess?.request_id ||
      generateClientRequestIdPreview(
        vipMode === 'single_platform' ? selectedPlatform?.id || 'SINGLE' : selectedPlan?.id || 'ALL',
        user?.id
      ),
    [submittedClaimSuccess?.request_id, vipMode, selectedPlatform?.id, selectedPlan?.id, user?.id]
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
      setFormError(`Please log in to your ${settings?.app_name || 'STUDY BLUNDER'} account before submitting a payment claim.`);
      return;
    }

    if (vipMode === 'single_platform') {
      if (!selectedPlatform) {
        setFormError('Please select a platform from the list before submitting One Platform VIP payment.');
        return;
      }
    } else {
      if (allPlatformPlans.length > 0 && (!selectedPlan || !selectedPlan.is_active)) {
        setFormError('Please select an active VIP plan before submitting payment verification.');
        return;
      }

      if (selectedPlan && (!Number.isFinite(Number(selectedPlan.price_inr)) || Number(selectedPlan.price_inr) <= 0)) {
        setFormError('The selected VIP plan has an invalid price configuration. Please contact an administrator.');
        return;
      }
    }

    const cleanEmail = submittedEmail.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError(`Please enter the valid Gmail / Email address used to log in to ${settings?.app_name || 'STUDY BLUNDER'}.`);
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
        vip_scope: vipMode,
        selected_platform_id: vipMode === 'single_platform' ? selectedPlatform?.id || null : null,
        selected_platform_name: vipMode === 'single_platform' ? selectedPlatform?.name || null : null,
        plan_id:
          vipMode === 'single_platform'
            ? selectedSinglePlan?.id || `single_platform_${selectedPlatform?.id || 'selected'}`
            : selectedPlan?.id || 'all_platforms_default',
        plan_title: checkoutPlanTitle,
        expected_plan_price:
          vipMode === 'single_platform'
            ? selectedSinglePlan
              ? Number(selectedSinglePlan.price_inr)
              : singleVipPrice
            : selectedPlan
            ? Number(selectedPlan.price_inr)
            : allVipFallbackPrice,
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

  const brandTitle = settings?.app_name || 'STUDY BLUNDER';

  return (
    <div className="min-h-[85vh] text-[#F5F5F5] pb-28 pt-4 px-3.5 sm:px-5 transition-colors duration-200">
      <div className="max-w-xl lg:max-w-5xl mx-auto">
        {/* Single-Device Protection Warning (if applicable) */}
        {isBoundOther && (
          <div className="mb-4 w-full ra-panel-red ra-corners-red rounded-2xl p-4 text-left">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/50 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-xs font-extrabold text-[#FF2525] uppercase tracking-wider">
                  Single-Device VIP Protection Active
                </h3>
                <p className="text-xs text-[#C5C5C5] mt-1 leading-relaxed">
                  {deviceMismatchError?.message ||
                    `VIP access is already active on another device (${user?.vip_device_label || 'Registered Primary Device'}). Please use your registered device or contact Admin/Support for a device reset.`}
                </p>
                <button
                  type="button"
                  onClick={handleOpenSupport}
                  className="mt-3 min-h-[40px] inline-flex items-center gap-1.5 px-3.5 rounded-lg ra-btn-primary text-[11px]"
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
          <div className="mb-4 p-3.5 rounded-xl bg-[#141414] border border-[#FF762E]/55 text-[#F5F5F5] text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-[#FF762E] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-[#F5F5F5]">{telegramNotice}</p>
            </div>
            <button
              type="button"
              onClick={() => setTelegramNotice(null)}
              aria-label="Dismiss notice"
              className="text-[#929292] hover:text-[#F5F5F5] p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* VIP Membership Command Deck Header */}
        <div className="mb-4 rounded-2xl ra-panel-red ra-corners ra-scanlines overflow-hidden shadow-[0_18px_45px_rgba(0,0,0,0.65)]">
          <div className="ra-hazard-bar h-1.5 w-full" />
          <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-mono-tech uppercase tracking-[0.18em] text-[#FF2525] font-bold mb-1">
                <Crown className="w-3.5 h-3.5 stroke-[2.4] text-[#FF762E]" />
                <span>{brandTitle} · VIP CLEARANCE DECK</span>
              </div>
              <h1 className="font-display text-lg sm:text-2xl font-black uppercase tracking-wide text-[#F5F5F5]">
                VIP Membership Plans
              </h1>
              <p className="text-xs text-[#929292] mt-1">
                Instant ad-free access to all study platforms, mock tests, and exclusive VIP command modules.
              </p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              {hasActiveVipStatus && onOpenVipDashboard && (
                <button
                  type="button"
                  onClick={onOpenVipDashboard}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider transition-colors"
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>VIP Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              <span className="font-mono-tech text-[11px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg bg-[#090909] border border-[#454545] text-[#C5C5C5]">
                {plans.length} {plans.length === 1 ? 'PLAN' : 'PLANS'}
              </span>
            </div>
          </div>
        </div>

        {/* UPPER-SIDE 2-OPTION VIP MODE SELECTOR: 1st ONE PLATFORM VIP vs 2nd ALL PLATFORMS VIP */}
        <div
          className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3"
          data-testid="vip-mode-selector"
        >
          <button
            type="button"
            onClick={() => {
              setVipMode('single_platform');
              setActiveOption('qr');
              setFormError(null);
              setPriceUpdateNotice(null);
            }}
            data-testid="vip-mode-one-platform"
            className={`text-left rounded-2xl p-4 border transition-all ra-corners ${
              vipMode === 'single_platform'
                ? 'bg-[#1D1D1D] border-[#FF2525] ra-corners-red shadow-[0_0_24px_rgba(255,37,37,0.22)]'
                : 'bg-[#141414] border-[#454545] hover:border-[#FF2525]/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    vipMode === 'single_platform'
                      ? 'bg-[#FF2525] text-[#F5F5F5] border-[#FF2525]'
                      : 'bg-[#090909] text-[#FF2525] border-[#454545]'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider text-[#FF762E] block">
                    OPTION 01 · SINGLE ACCESS
                  </span>
                  <h2 className="font-display text-sm sm:text-base font-black uppercase text-[#F5F5F5]">
                    One Platform VIP
                  </h2>
                </div>
              </div>
              <span className="font-mono-tech text-sm sm:text-base font-black text-[#FF2525] shrink-0">
                ₹{singlePlatformPlans.length > 0 ? Math.min(...singlePlatformPlans.map((p) => Number(p.price_inr) || fallbackSingleVipPrice)) : fallbackSingleVipPrice}
              </span>
            </div>
            <p className="text-[11px] text-[#929292] mt-2 leading-relaxed">
              Choose 1 platform from Home below. After Admin approval, access unlocks strictly for that selected platform only ({singleVipDurationDays} Days).
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setVipMode('all_platforms');
              setActiveOption('qr');
              setFormError(null);
              setPriceUpdateNotice(null);
            }}
            data-testid="vip-mode-all-platforms"
            className={`text-left rounded-2xl p-4 border transition-all ra-corners ${
              vipMode === 'all_platforms'
                ? 'bg-[#1D1D1D] border-[#FF762E] ra-corners-orange shadow-[0_0_24px_rgba(255,118,46,0.22)]'
                : 'bg-[#141414] border-[#454545] hover:border-[#FF762E]/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                    vipMode === 'all_platforms'
                      ? 'bg-gradient-to-b from-[#FF762E] to-[#C90000] text-[#F5F5F5] border-[#FF762E]'
                      : 'bg-[#090909] text-[#FF762E] border-[#454545]'
                  }`}
                >
                  <Crown className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider text-[#FF762E] block">
                    OPTION 02 · FULL UNLOCK
                  </span>
                  <h2 className="font-display text-sm sm:text-base font-black uppercase text-[#F5F5F5]">
                    All Platforms VIP
                  </h2>
                </div>
              </div>
              <span className="font-mono-tech text-sm sm:text-base font-black text-[#FF762E] shrink-0">
                ₹{allPlatformPlans.length > 0 ? Math.min(...allPlatformPlans.map((p) => Number(p.price_inr) || allVipFallbackPrice)) : allVipFallbackPrice}
              </span>
            </div>
            <p className="text-[11px] text-[#929292] mt-2 leading-relaxed">
              Unlock EVERY study platform, ad-free direct access, VIP Command Hub, mock tests, and priority features with one membership.
            </p>
          </button>
        </div>

        {/* MODE 1: ONE PLATFORM VIP — ADMIN-CONFIGURED SINGLE-PLATFORM PLANS + HOME PLATFORMS SELECTOR */}
        {vipMode === 'single_platform' && (
          <div className="mb-5 space-y-4">
            {singlePlatformPlans.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {singlePlatformPlans.map((plan) => {
                  const isSelected = selectedSinglePlan?.id === plan.id;
                  const refPrev = referralPreviews[plan.id];
                  const hasRefDiscount = Boolean(refPrev && refPrev.eligible && refPrev.referral_discount_applied > 0);
                  const displayPayable = hasRefDiscount ? refPrev.final_payable_amount : plan.price_inr;
                  const strikePrice = hasRefDiscount
                    ? plan.price_inr
                    : plan.original_price_inr && Number(plan.original_price_inr) > Number(plan.price_inr)
                    ? Number(plan.original_price_inr)
                    : null;

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        setSelectedSinglePlanId(plan.id);
                        setPaymentAmount(String(displayPayable));
                        setFormError(null);
                        setPriceUpdateNotice(null);
                      }}
                      className={`text-left rounded-2xl p-4 border transition-all ra-corners ${
                        isSelected
                          ? 'bg-[#1D1D1D] border-[#FF2525] ra-corners-red shadow-[0_0_24px_rgba(255,37,37,0.22)]'
                          : 'bg-[#141414] border-[#454545] hover:border-[#FF2525]/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap font-mono-tech text-[10px] font-bold uppercase text-[#FF762E]">
                            <span>{plan.duration_days} DAYS</span>
                            {Number(plan.bonus_days || 0) > 0 && (
                              <span className="text-[#FF2525]">+{plan.bonus_days}D BONUS</span>
                            )}
                            {plan.badge_label && (
                              <span className="px-1.5 py-0.5 rounded bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/40">
                                {plan.badge_label}
                              </span>
                            )}
                          </div>
                          <h3 className="font-display text-sm sm:text-base font-black uppercase text-[#F5F5F5] mt-1">
                            {plan.title}
                          </h3>
                        </div>
                        <div className="text-right shrink-0">
                          {strikePrice && (
                            <span className="block font-mono-tech text-[11px] text-[#929292] line-through">
                              ₹{strikePrice}
                            </span>
                          )}
                          <span className="font-mono-tech text-xl font-black text-[#FF2525]">
                            ₹{displayPayable}
                          </span>
                        </div>
                      </div>
                      {plan.features.length > 0 && (
                        <ul className="mt-2.5 pt-2.5 border-t border-[#454545]/70 space-y-1 text-[11px] text-[#C5C5C5]">
                          {plan.features.slice(0, 3).map((feat, fIdx) => (
                            <li key={fIdx} className="flex items-center gap-1.5">
                              <Check className="w-3 h-3 text-[#FF2525] shrink-0" />
                              <span className="truncate">{feat}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Default One Platform VIP Plan Summary Card (when no custom single-platform plans exist yet) */
              <div className="ra-panel-red ra-corners-red rounded-2xl p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#454545]/70">
                  <div>
                    <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider text-[#FF762E]">
                      ONE PLATFORM VIP PLAN · {singleVipDurationDays} DAYS VALIDITY
                    </span>
                    <h3 className="font-display text-base sm:text-lg font-black uppercase text-[#F5F5F5] mt-0.5">
                      Single Platform Unlock Pass
                    </h3>
                  </div>
                  <div className="text-right">
                    <span className="font-mono-tech text-2xl sm:text-3xl font-black text-[#FF2525]">
                      ₹{singleVipPrice}
                    </span>
                    <span className="block font-mono-tech text-[10px] text-[#929292] uppercase">
                      PER SELECTED PLATFORM
                    </span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-[#C5C5C5]">
                  <div className="flex items-center gap-2 bg-[#090909] border border-[#454545] rounded-xl px-3 py-2">
                    <Check className="w-3.5 h-3.5 text-[#FF2525] shrink-0" />
                    <span>Direct access to 1 chosen platform</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#090909] border border-[#454545] rounded-xl px-3 py-2">
                    <Check className="w-3.5 h-3.5 text-[#FF2525] shrink-0" />
                    <span>Valid for {singleVipDurationDays} days after approval</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[#090909] border border-[#454545] rounded-xl px-3 py-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#FF762E] shrink-0" />
                    <span>Does NOT unlock other platforms</span>
                  </div>
                </div>
              </div>
            )}

            {/* Live Home Section Platform List Selector */}
            <div className="ra-panel rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#FF2525]" />
                  <h3 className="font-display text-xs sm:text-sm font-black uppercase tracking-wider text-[#F5F5F5]">
                    Select Your Platform (From Home Section)
                  </h3>
                </div>
                <span className="font-mono-tech text-[10px] font-bold uppercase text-[#929292]">
                  {availableHomePlatforms.length} AVAILABLE
                </span>
              </div>

              {availableHomePlatforms.length === 0 ? (
                <div className="p-6 rounded-xl bg-[#090909] border border-[#454545] text-center">
                  <p className="font-display text-xs font-bold uppercase text-[#F5F5F5]">
                    No Platforms Added in Home Section Yet
                  </p>
                  <p className="text-xs text-[#929292] mt-1">
                    Platforms added by the administrator in the Home section will automatically appear here for One Platform VIP selection.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {availableHomePlatforms.map((plat) => {
                    const isPicked = selectedPlatform?.id === plat.id;
                    const alreadyOwned = Boolean(
                      hasActiveVipStatus || user?.vip_allowed_platform_ids?.includes(plat.id)
                    );
                    return (
                      <button
                        key={plat.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlatformId(plat.id);
                          setActiveOption('qr');
                          setFormError(null);
                          setPaymentAmount(String(singleVipPrice));
                        }}
                        data-testid={`vip-select-platform-${plat.id}`}
                        className={`text-left rounded-xl p-3 border transition-all flex items-center gap-3 ${
                          isPicked
                            ? 'bg-[#1D1D1D] border-[#FF2525] shadow-[0_0_16px_rgba(255,37,37,0.22)]'
                            : 'bg-[#090909] border-[#454545] hover:border-[#FF2525]/60'
                        }`}
                      >
                        <div className="w-11 h-11 rounded-lg bg-[#141414] border border-[#454545] flex items-center justify-center overflow-hidden shrink-0 p-1">
                          {plat.logo_url ? (
                            <img
                              src={plat.logo_url}
                              alt={plat.name}
                              className="w-full h-full object-contain rounded"
                            />
                          ) : (
                            <span className="font-display font-black text-xs text-[#FF2525]">
                              {plat.name.substring(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-display text-xs font-black uppercase text-[#F5F5F5] truncate">
                              {plat.name}
                            </p>
                            {isPicked && (
                              <span className="w-4 h-4 rounded-full bg-[#FF2525] text-[#F5F5F5] flex items-center justify-center shrink-0">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </span>
                            )}
                          </div>
                          <p className="font-mono-tech text-[10px] text-[#929292] uppercase truncate">
                            {plat.category || 'General'}
                          </p>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="font-mono-tech text-[10px] font-bold text-[#FF762E]">
                              ₹{singleVipPrice} / {singleVipDurationDays}D
                            </span>
                            {alreadyOwned && (
                              <span className="font-mono-tech text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#FF2525]/15 text-[#F5F5F5] border border-[#FF2525]/50">
                                UNLOCKED
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedPlatform && (
                <div className="mt-4 pt-3.5 border-t border-[#454545]/70 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-[#C5C5C5]">
                    Selected Platform:{' '}
                    <strong className="font-display uppercase text-[#F5F5F5]">
                      {selectedPlatform.name}
                    </strong>{' '}
                    <span className="font-mono-tech text-[#FF2525] font-bold">
                      (₹{singleVipPrice})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveOption('qr');
                        requestAnimationFrame(() => {
                          inlineQrCheckoutRef.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                          });
                        });
                      }}
                      className="min-h-[42px] px-4 rounded-xl ra-btn-primary text-xs inline-flex items-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Pay ₹{singleVipPrice} via QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTelegramOption()}
                      className="min-h-[42px] px-3.5 rounded-xl ra-btn-secondary text-[11px] inline-flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5 text-[#FF762E]" />
                      <span>Telegram</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODE 2: ALL PLATFORMS VIP — QUICK PLAN SELECTOR + PLANS GRID (WITH FALLBACK PASS IF NO PLANS YET) */}
        {vipMode === 'all_platforms' && !loading && allPlatformPlans.length > 1 && (
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {allPlatformPlans.map((p) => {
                const isSelected = selectedPlan?.id === p.id;
                const refPrev = referralPreviews[p.id];
                const hasRef = Boolean(refPrev && refPrev.eligible && refPrev.referral_discount_applied > 0);
                const price = hasRef ? refPrev.final_payable_amount : p.price_inr;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPlan(p, true)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-lg font-display text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${
                      isSelected
                        ? 'bg-[#FF2525] text-[#F5F5F5] border-[#FF2525] shadow-[0_0_16px_rgba(255,37,37,0.3)]'
                        : 'bg-[#141414] text-[#C5C5C5] border-[#454545] hover:border-[#FF2525]/60 hover:text-[#F5F5F5]'
                    }`}
                  >
                    <span>{p.title}</span>
                    <span className={`ml-1.5 font-mono-tech ${isSelected ? 'text-[#F5F5F5]' : 'text-[#FF762E]'}`}>
                      ₹{price}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => handleScrollCarousel('left')}
                aria-label="Previous Plan"
                className="w-10 h-10 rounded-lg bg-[#141414] border border-[#454545] hover:border-[#FF2525] text-[#C5C5C5] hover:text-[#F5F5F5] flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleScrollCarousel('right')}
                aria-label="Next Plan"
                className="w-10 h-10 rounded-lg bg-[#141414] border border-[#454545] hover:border-[#FF2525] text-[#C5C5C5] hover:text-[#F5F5F5] flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* VIP PLANS HORIZONTAL SNAP CAROUSEL ON MOBILE / MULTI-COLUMN GRID ON DESKTOP (ALL PLATFORMS VIP MODE) */}
        {vipMode === 'all_platforms' && (
        <div
          ref={plansCarouselRef}
          className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-3 -mx-1 px-1 scroll-smooth md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible"
        >
          {loading ? (
            <>
              <div className="min-w-[86vw] sm:min-w-[320px] md:min-w-0 h-72 bg-[#141414] border border-[#454545] rounded-2xl animate-pulse" />
              <div className="hidden md:block h-72 bg-[#141414] border border-[#454545] rounded-2xl animate-pulse" />
            </>
          ) : allPlatformPlans.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 ra-panel-red ra-corners-orange rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider text-[#FF762E]">
                  ALL PLATFORMS VIP PASS · {allVipFallbackDays} DAYS
                </span>
                <h2 className="font-display text-lg font-black uppercase text-[#F5F5F5] mt-1">
                  All Platforms Full VIP Access
                </h2>
                <p className="text-xs text-[#929292] mt-1">
                  Unlocks every Home platform, VIP Command Hub, ad-free direct links, and all premium batches.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono-tech text-3xl font-black text-[#FF2525]">
                  ₹{allVipFallbackPrice}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveOption('qr');
                    setPaymentAmount(String(allVipFallbackPrice));
                    requestAnimationFrame(() => {
                      inlineQrCheckoutRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                      });
                    });
                  }}
                  className="min-h-[44px] px-4 rounded-xl ra-btn-primary text-xs inline-flex items-center gap-1.5"
                >
                  <Crown className="w-4 h-4" />
                  <span>Pay ₹{allVipFallbackPrice}</span>
                </button>
              </div>
            </div>
          ) : (
            allPlatformPlans.map((plan) => {
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
                  {/* Top Popular / Value Tag */}
                  {plan.badge_label && (
                    <div className="absolute top-0 left-4 z-10">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#FF2525] text-[#F5F5F5] font-display font-extrabold text-[10px] tracking-wider uppercase shadow-[0_0_12px_rgba(255,37,37,0.45)]">
                        <Sparkles className="w-2.5 h-2.5" />
                        {plan.badge_label}
                      </span>
                    </div>
                  )}

                  {/* Red Alert Mechanical Plan Card */}
                  <div
                    className={`h-full flex flex-col justify-between rounded-2xl p-5 transition-all duration-150 border ra-corners ${
                      isSelected
                        ? 'bg-[#1D1D1D] border-[#FF2525] ra-corners-red shadow-[0_0_28px_rgba(255,37,37,0.18)]'
                        : 'bg-[#141414] border-[#454545] hover:border-[#C5C5C5]/60'
                    }`}
                  >
                    <div>
                      {/* Card Top Row: Duration + Crown Icon */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap font-mono-tech text-[11px] font-bold uppercase tracking-wider">
                            <span className="text-[#FF762E]">
                              {plan.duration_days
                                ? `${plan.duration_days} DAYS`
                                : `${plan.duration_months || 1} MONTHS`}
                            </span>
                            {Number(plan.bonus_days || 0) > 0 && (
                              <span className="text-[#FF2525] inline-flex items-center gap-1">
                                <Gift className="w-3 h-3" />+{plan.bonus_days}D BONUS
                              </span>
                            )}
                            {plan.discount_label && (
                              <span className="text-[#C5C5C5] inline-flex items-center gap-1">
                                <Tag className="w-3 h-3 text-[#FF762E]" />
                                {plan.discount_label}
                              </span>
                            )}
                          </div>

                          <h2 className="font-display text-base font-black uppercase text-[#F5F5F5] mt-2 tracking-wide">
                            {plan.title}
                          </h2>
                          {plan.description && (
                            <p className="text-xs text-[#929292] mt-1 line-clamp-2 leading-relaxed">
                              {plan.description}
                            </p>
                          )}
                        </div>

                        <div
                          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-[#FF2525] text-[#F5F5F5] border-[#FF2525]'
                              : 'bg-[#090909] text-[#FF762E] border-[#454545]'
                          }`}
                        >
                          <Crown className="w-5 h-5 stroke-[2.2]" />
                        </div>
                      </div>

                      {/* Price & Savings Block */}
                      <div className="mt-4 pt-3.5 border-t border-[#454545]/70 flex items-baseline justify-between gap-2 flex-wrap">
                        <div className="flex items-baseline gap-2">
                          {strikePrice && (
                            <span className="text-sm font-bold text-[#929292] line-through font-mono-tech">
                              ₹{strikePrice}
                            </span>
                          )}
                          <span className="text-3xl font-black text-[#F5F5F5] font-mono-tech">
                            ₹{displayPayable}
                          </span>
                        </div>

                        {totalSaved > 0 && (
                          <span className="font-mono-tech text-[11px] font-bold text-[#FF762E] uppercase px-2 py-0.5 rounded bg-[#FF762E]/12 border border-[#FF762E]/40">
                            SAVE ₹{totalSaved}
                          </span>
                        )}
                      </div>

                      {/* Referral Discount Applied Banner */}
                      {hasRefDiscount && refPrev && (
                        <div className="mt-3 px-3 py-2 rounded-lg bg-[#090909] border border-[#FF762E]/45 flex items-center justify-between text-[11px]">
                          <span className="font-bold text-[#FF762E] flex items-center gap-1.5">
                            <Gift className="w-3.5 h-3.5 shrink-0" />
                            <span>{refPrev.discount_label || 'Referral Discount Applied'}</span>
                          </span>
                          <span className="font-extrabold font-mono-tech text-[#FF762E]">
                            -₹{refPrev.referral_discount_applied}
                          </span>
                        </div>
                      )}

                      {/* Benefit Checklist */}
                      {Array.isArray(plan.features) && plan.features.length > 0 && (
                        <div className="mt-3.5 space-y-2 border-t border-[#454545]/70 pt-3.5">
                          {plan.features.map((feature, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-[#F5F5F5]/90">
                              <div className="w-4 h-4 rounded bg-[#FF2525]/15 border border-[#FF2525]/50 text-[#FF2525] flex items-center justify-center shrink-0 mt-0.5">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                              <span className="leading-snug">{feature}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons on Plan Card */}
                    <div className="mt-5 pt-3.5 border-t border-[#454545]/70 space-y-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGetVipClick(plan);
                        }}
                        className="w-full min-h-[46px] py-2.5 px-4 rounded-xl ra-btn-primary text-xs flex items-center justify-center gap-2"
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
                        className="w-full min-h-[42px] py-2 px-3 rounded-xl ra-btn-secondary text-[11px] flex items-center justify-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5 text-[#FF762E]" />
                        <span>Buy via Telegram</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        )}

        {/* INLINE QR & PAYMENT CHECKOUT PANEL */}
        {activeOption === 'qr' &&
          ((vipMode === 'single_platform' && Boolean(selectedPlatform)) ||
            vipMode === 'all_platforms') && (
          <div
            ref={inlineQrCheckoutRef}
            className="mt-4 ra-panel-red ra-corners-red rounded-2xl overflow-hidden transition-all"
          >
            <div className="ra-hazard-bar h-1 w-full" />
            <div className="p-4 sm:p-6">
              {/* Top Bar of Checkout Box */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#454545]/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#090909] border border-[#FF2525]/55 text-[#FF2525] flex items-center justify-center shrink-0">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider text-[#FF2525] block">
                      {vipMode === 'single_platform'
                        ? 'ONE PLATFORM VIP CHECKOUT & OFFICIAL QR'
                        : 'ALL PLATFORMS VIP CHECKOUT & OFFICIAL QR'}
                    </span>
                    <h3 className="font-display text-sm sm:text-base font-black uppercase text-[#F5F5F5]">
                      {checkoutPlanTitle} ({selectedPlanDurationLabel})
                    </h3>
                  </div>
                </div>

                {/* Payment Request ID */}
                <div className="flex items-center gap-2 bg-[#090909] border border-[#454545] rounded-xl px-3 py-2">
                  <span className="text-[10px] font-bold text-[#929292] uppercase">REQ ID</span>
                  <span className="text-xs font-mono-tech font-bold text-[#F5F5F5]">
                    {paymentRequestIdPreview}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyRequestId}
                    className="ml-1 text-[10px] font-display font-bold uppercase text-[#FF762E] hover:text-[#FF2525] inline-flex items-center gap-1"
                    title="Copy Payment Request ID"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedReqId ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Selected Plan Price + Referral Discount + Final Payable Summary Strip */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[#090909] border border-[#454545]">
                <div>
                  <span className="text-[10px] font-mono-tech uppercase tracking-wider text-[#929292] block">
                    {vipMode === 'single_platform' ? 'Selected Platform' : 'Selected Plan'}
                  </span>
                  <strong className="font-display text-xs sm:text-sm font-extrabold text-[#F5F5F5] truncate block mt-0.5">
                    {checkoutPlanTitle}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-mono-tech uppercase tracking-wider text-[#929292] block">
                    Original Price
                  </span>
                  <strong className="text-xs sm:text-sm font-bold text-[#F5F5F5] font-mono-tech block mt-0.5">
                    ₹{originalPlanPrice}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-mono-tech uppercase tracking-wider text-[#929292] block">
                    Discount
                  </span>
                  <strong className="text-xs sm:text-sm font-bold text-[#FF762E] font-mono-tech block mt-0.5">
                    {referralDiscountAmount > 0
                      ? `-₹${referralDiscountAmount} (Referral)`
                      : planOfferSavings > 0
                      ? `-₹${planOfferSavings} (Offer)`
                      : '₹0'}
                  </strong>
                </div>
                <div className="text-left sm:text-right">
                  <span className="text-[10px] font-mono-tech uppercase tracking-wider text-[#FF2525] block">
                    Final Payable
                  </span>
                  <strong className="text-lg sm:text-xl font-black text-[#FF2525] font-mono-tech block">
                    ₹{configuredAmount}
                  </strong>
                </div>
              </div>

              {/* Side-by-Side QR Code & Verification Proof Form */}
              {!configuredQrUrl ? (
                <div className="mt-4 p-5 rounded-xl bg-[#090909] border border-[#454545] text-center space-y-2">
                  <AlertCircle className="w-7 h-7 text-[#FF762E] mx-auto" />
                  <h4 className="font-display text-xs font-extrabold uppercase text-[#F5F5F5]">
                    Payment QR Code Not Configured Yet
                  </h4>
                  <p className="text-xs text-[#929292] leading-relaxed max-w-sm mx-auto">
                    The administrator has not uploaded a payment QR code yet. Please use the Telegram option or contact Support for assistance.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                  {/* Left Column: Official QR Code & Instructions */}
                  <div className="md:col-span-5 flex flex-col items-center text-center bg-[#090909] border border-[#454545] rounded-xl p-4">
                    {/* White inner scanner box strictly for UPI QR reliability */}
                    <div className="bg-white p-3 rounded-xl w-52 h-52 flex items-center justify-center">
                      <img
                        src={configuredQrUrl}
                        alt="Official VIP Payment QR Code"
                        width={192}
                        height={192}
                        loading="eager"
                        decoding="sync"
                        className="w-48 h-48 object-contain rounded"
                      />
                    </div>

                    <p className="text-xs text-[#C5C5C5] mt-3 leading-relaxed">
                      Scan with any UPI app (GPay, PhonePe, Paytm) and pay{' '}
                      <strong className="text-[#FF2525] font-mono-tech">₹{configuredAmount}</strong> for{' '}
                      <strong className="text-[#F5F5F5]">{checkoutPlanTitle}</strong>.
                    </p>

                    <a
                      href={configuredQrUrl}
                      download={`StudyBlunder-VIP-QR-${checkoutPlanTitle.replace(/\s+/g, '-')}.png`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 min-h-[40px] inline-flex items-center gap-1.5 px-3.5 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] border border-[#454545] text-[#F5F5F5] text-[11px] font-bold transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-[#FF2525]" />
                      <span>Download QR Image</span>
                    </a>

                    {configuredInstructions && (
                      <div className="mt-3 w-full bg-[#141414] border border-[#454545] rounded-xl p-3 text-left text-xs text-[#C5C5C5] leading-relaxed whitespace-pre-line">
                        <span className="font-display font-bold uppercase text-[#F5F5F5] text-[11px] block mb-1">
                          Payment Instructions
                        </span>
                        {configuredInstructions}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Submit Payment Verification Form */}
                  <div className="md:col-span-7 bg-[#090909] border border-[#454545] rounded-xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#F5F5F5]">
                        Submit Payment Verification Proof
                      </h4>
                      <span className="font-mono-tech text-[10px] font-bold uppercase text-[#FF762E]">
                        INSTANT CLAIM
                      </span>
                    </div>

                    {priceUpdateNotice && (
                      <div className="p-3 rounded-xl bg-[#FF762E]/12 border border-[#FF762E]/50 text-[#FF762E] text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{priceUpdateNotice}</span>
                      </div>
                    )}

                    {!user ? (
                      <div className="p-4 rounded-xl bg-[#141414] border border-[#454545] text-center space-y-3">
                        <AlertCircle className="w-6 h-6 text-[#FF762E] mx-auto" />
                        <div>
                          <p className="font-display text-xs font-bold uppercase text-[#F5F5F5]">
                            Account Login Required
                          </p>
                          <p className="text-xs text-[#929292] mt-1 leading-relaxed">
                            Please log in to your account so your VIP membership and referral discount are linked to your profile.
                          </p>
                        </div>
                        {onOpenAuth && (
                          <button
                            type="button"
                            onClick={onOpenAuth}
                            className="min-h-[44px] inline-flex items-center gap-2 px-4 rounded-xl ra-btn-primary text-xs"
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
                          <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1">
                            1. Login Gmail / Email <span className="text-[#FF2525]">*</span>
                          </label>
                          <input
                            type="email"
                            required
                            value={submittedEmail}
                            onChange={(e) => setSubmittedEmail(e.target.value)}
                            placeholder="Enter the Gmail used to log in"
                            className="w-full h-11 px-3 rounded-xl bg-[#141414] border border-[#454545] text-xs text-[#F5F5F5] placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525]"
                          />
                          <p className="text-[10px] text-[#929292] mt-1">
                            Authenticated account:{' '}
                            <span className="font-mono-tech font-semibold text-[#FF762E]">{user.email}</span>
                          </p>
                        </div>

                        {/* 2. Payment Amount & 3. UTR */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5]">
                                2. Paid Amount (₹) <span className="text-[#FF2525]">*</span>
                              </label>
                              {configuredAmount > 0 && (
                                <span className="text-[10px] font-bold text-[#FF762E] font-mono-tech">
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
                              className="w-full h-11 px-3 rounded-xl bg-[#141414] border border-[#454545] text-xs text-[#F5F5F5] font-mono-tech focus:outline-none focus:border-[#FF2525]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1">
                              3. UPI Ref / 12-Digit UTR{' '}
                              {isUtrRequired ? (
                                <span className="text-[#FF2525]">*</span>
                              ) : (
                                <span className="text-[#929292] font-normal">(Optional)</span>
                              )}
                            </label>
                            <input
                              type="text"
                              required={isUtrRequired}
                              value={transactionId}
                              onChange={(e) => setTransactionId(e.target.value)}
                              placeholder="12-digit UPI UTR Number"
                              className="w-full h-11 px-3 rounded-xl bg-[#141414] border border-[#454545] text-xs text-[#F5F5F5] font-mono-tech focus:outline-none focus:border-[#FF2525]"
                            />
                          </div>
                        </div>

                        {hasAmountMismatch && (
                          <p className="text-[11px] text-[#FF762E] bg-[#FF762E]/12 border border-[#FF762E]/50 rounded-lg px-2.5 py-2 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Entered amount (₹{enteredAmountNumber}) differs from the payable amount (₹{configuredAmount}). It will be flagged for admin review.
                            </span>
                          </p>
                        )}

                        {/* 4. Payment Screenshot */}
                        <div>
                          <label className="block text-[11px] font-mono-tech uppercase tracking-wider font-bold text-[#C5C5C5] mb-1">
                            4. Upload Payment Screenshot (JPG, PNG, WEBP) <span className="text-[#FF2525]">*</span>
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
                              className="w-full py-4 px-4 rounded-xl border border-dashed border-[#454545] hover:border-[#FF2525]/70 bg-[#141414] flex flex-col items-center justify-center gap-1 transition-colors"
                            >
                              <Upload className="w-5 h-5 text-[#FF2525]" />
                              <span className="text-xs font-bold text-[#F5F5F5]">
                                Tap to Upload Payment Screenshot
                              </span>
                              <span className="text-[10px] text-[#929292]">
                                Supports JPG, PNG, WEBP (Max 5MB)
                              </span>
                            </button>
                          ) : (
                            <div className="p-3 rounded-xl bg-[#141414] border border-[#454545] space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <ImageIcon className="w-4 h-4 text-[#FF2525] shrink-0" />
                                  <span className="text-xs font-semibold text-[#F5F5F5] truncate">
                                    {screenshotFileName || 'Payment Screenshot Selected'}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  className="px-2.5 py-1 rounded-lg bg-[#090909] hover:bg-[#1D1D1D] border border-[#454545] text-[10px] font-bold text-[#F5F5F5] shrink-0 transition-colors"
                                >
                                  Change Image
                                </button>
                              </div>
                              <div className="max-h-40 overflow-hidden rounded-lg border border-[#454545] bg-[#090909] flex items-center justify-center">
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
                          <div className="p-3 rounded-xl bg-[#FF2525]/12 border border-[#FF2525]/55 text-[#F5F5F5] text-xs flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#FF2525]" />
                            <span>{formError}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={isSubmittingClaim}
                          className="w-full min-h-[48px] py-2.5 px-4 rounded-xl ra-btn-primary text-xs disabled:opacity-50 flex items-center justify-center gap-2"
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
                      <div className="p-4 rounded-xl bg-[#1D1D1D] border border-[#FF762E]/55 text-[#F5F5F5] space-y-2">
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-5 h-5 text-[#FF762E] shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h4 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#FF762E]">
                                Payment Submitted — Pending Verification
                              </h4>
                              <span className="font-mono-tech text-[10px] font-bold uppercase text-[#FF762E]">
                                PENDING
                              </span>
                            </div>
                            <p className="text-xs text-[#F5F5F5]/90 mt-1 leading-relaxed">
                              Request ID:{' '}
                              <span className="font-mono-tech font-bold text-[#FF2525]">
                                {submittedClaimSuccess.request_id || submittedClaimSuccess.id}
                              </span>{' '}
                              for <strong>₹{submittedClaimSuccess.amount}</strong> ({submittedClaimSuccess.plan_title}).
                            </p>
                            <p className="text-[11px] text-[#C5C5C5] mt-1 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-[#FF762E] shrink-0" />
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
          </div>
        )}

        {/* User's Payment Verification Claims Status List */}
        {user && myPayments.length > 0 && (
          <div className="mt-5 ra-panel rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#F5F5F5] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#FF762E]" />
                <span>Payment Verification History</span>
              </h3>
              <button
                type="button"
                onClick={loadMyPayments}
                disabled={loadingMyPayments}
                className="text-[11px] font-semibold text-[#C5C5C5] hover:text-[#FF2525] inline-flex items-center gap-1 transition-colors"
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
                  ? 'PENDING'
                  : isApproved
                  ? 'APPROVED'
                  : claim.status === 'rejected'
                  ? 'REJECTED'
                  : 'FAILED';

                return (
                  <div
                    key={claim.id}
                    className="bg-[#090909] border border-[#454545] rounded-xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-[#F5F5F5] font-mono-tech">
                          ₹{claim.amount}
                        </span>
                        <span className="text-xs font-semibold text-[#C5C5C5] truncate">
                          {claim.plan_title}
                        </span>
                        {claim.request_id && (
                          <span className="text-[10px] font-mono-tech font-bold text-[#FF762E]">
                            {claim.request_id}
                          </span>
                        )}
                        <span
                          className={`font-mono-tech text-[10px] font-bold uppercase ${
                            isPending
                              ? 'text-[#FF762E]'
                              : isApproved
                              ? 'text-[#F5F5F5]'
                              : 'text-[#FF2525]'
                          }`}
                        >
                          · {statusLabel}
                        </span>
                      </div>
                      <p className="text-[10px] text-[#929292] mt-1 truncate font-mono-tech">
                        {new Date(claim.created_at).toLocaleString()}
                        {claim.transaction_reference ? ` · UTR: ${claim.transaction_reference}` : ''}
                      </p>
                      {claim.admin_note && (
                        <p className="text-[11px] text-[#FF762E] font-medium mt-1">
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
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl ra-panel text-xs">
          <div className="flex items-center gap-2.5 text-[#C5C5C5]">
            <LifeBuoy className="w-4 h-4 text-[#FF2525] shrink-0" />
            <span>Need assistance with VIP plans or payment verification?</span>
          </div>
          <button
            type="button"
            onClick={handleOpenSupport}
            className="min-h-[40px] px-3.5 rounded-lg ra-btn-secondary text-[11px] shrink-0"
          >
            Contact Support
          </button>
        </div>

        {supportNotice && (
          <div className="mt-2.5 p-3 rounded-xl bg-[#141414] border border-[#FF762E]/50 text-[#FF762E] text-xs flex items-center justify-between gap-2">
            <span>{supportNotice}</span>
            <button
              type="button"
              onClick={() => setSupportNotice(null)}
              aria-label="Close support notice"
              className="text-[#C5C5C5] hover:text-[#F5F5F5]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

