import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Crown,
  ArrowLeft,
  Check,
  Sparkles,
  QrCode,
  Send,
  Upload,
  Clock,
  CheckCircle2,
  AlertCircle,
  LifeBuoy,
  Image as ImageIcon,
  RefreshCw,
  ShieldCheck,
  Gift,
  Tag,
  X,
} from 'lucide-react';
import { api } from '../api.ts';
import type { VipPlan, PublicSettings, UserProfile, PaymentRecord, ReferralPricePreview } from '../types.ts';

interface PreKeyVipPurchasePageProps {
  user?: UserProfile | null;
  settings: PublicSettings | null;
  onBackToKeyPage: () => void;
  onVipActivated: (updatedUser: UserProfile) => void;
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
    // Ignore invalid URL
  }
  return null;
};

export const PreKeyVipPurchasePage: React.FC<PreKeyVipPurchasePageProps> = ({
  user,
  settings,
  onBackToKeyPage,
  onVipActivated,
}) => {
  const [plans, setPlans] = useState<VipPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [myPayments, setMyPayments] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [activeOption, setActiveOption] = useState<'qr' | 'telegram' | null>(null);
  const [showVerificationForm, setShowVerificationForm] = useState(false);

  const [submittedEmail, setSubmittedEmail] = useState(user?.email || '');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [screenshotMimeType, setScreenshotMimeType] = useState('image/png');
  const [screenshotFileName, setScreenshotFileName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [priceUpdateNotice, setPriceUpdateNotice] = useState<string | null>(null);
  const [submittedClaim, setSubmittedClaim] = useState<PaymentRecord | null>(null);
  const [telegramNotice, setTelegramNotice] = useState<string | null>(null);
  const [supportNotice, setSupportNotice] = useState<string | null>(null);
  const [checkingActivation, setCheckingActivation] = useState(false);
  const [referralPreviews, setReferralPreviews] = useState<Record<string, ReferralPricePreview>>({});
  const [referrerCodeUsed, setReferrerCodeUsed] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const qrSectionRef = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [plns, payList, refPrev] = await Promise.all([
        api.getVipPlans(),
        user ? api.getMyVipPayments().catch(() => []) : Promise.resolve([]),
        user ? api.getVipReferralPricePreview().catch(() => null) : Promise.resolve(null),
      ]);
      setPlans(plns);
      setMyPayments(payList);
      if (refPrev && refPrev.previews) {
        setReferralPreviews(refPrev.previews);
        setReferrerCodeUsed(refPrev.referrer_code || null);
      } else {
        setReferralPreviews({});
        setReferrerCodeUsed(null);
      }
      if (plns.length > 0 && (!selectedPlanId || !plns.some((p) => p.id === selectedPlanId))) {
        const firstPlan = plns[0];
        setSelectedPlanId(firstPlan.id);
        const pPrev = refPrev?.previews?.[firstPlan.id];
        const payable = pPrev && pPrev.eligible ? pPrev.final_payable_amount : Number(firstPlan.price_inr);
        setPaymentAmount(String(payable));
      }
    } catch {
      // Keep existing state on transient error
    } finally {
      setLoadingPlans(false);
      setLoadingPayments(false);
    }
  }, [user, selectedPlanId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (user?.email) {
      setSubmittedEmail(user.email);
    }
  }, [user?.email]);

  // Check if user's VIP membership has been activated by Admin
  const checkVipStatusAndUnlock = useCallback(async () => {
    if (!user) return;
    try {
      setCheckingActivation(true);
      const [profile, payList] = await Promise.all([
        api.getMe(),
        api.getMyVipPayments().catch(() => []),
      ]);
      setMyPayments(payList);
      if (
        profile.vip_active &&
        profile.vip_expires_at &&
        new Date(profile.vip_expires_at).getTime() > Date.now()
      ) {
        onVipActivated(profile);
      }
    } catch {
      // Ignore network hiccup
    } finally {
      setCheckingActivation(false);
    }
  }, [user, onVipActivated]);

  // Poll every 10s while on Pre-Key VIP page or when a pending request exists
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void checkVipStatusAndUnlock();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [checkVipStatusAndUnlock]);

  const selectedPlan = React.useMemo(() => {
    if (plans.length === 0) return null;
    if (selectedPlanId) {
      const found = plans.find((p) => p.id === selectedPlanId);
      if (found) return found;
    }
    return plans[0];
  }, [plans, selectedPlanId]);

  const selectedPlanPreview = selectedPlan ? referralPreviews[selectedPlan.id] || null : null;

  useEffect(() => {
    if (selectedPlan && Number(selectedPlan.price_inr) > 0) {
      const payable =
        selectedPlanPreview && selectedPlanPreview.eligible
          ? selectedPlanPreview.final_payable_amount
          : Number(selectedPlan.price_inr);
      setPaymentAmount(String(payable));
    }
  }, [selectedPlan?.id, selectedPlan?.price_inr, selectedPlanPreview]);

  const activePendingPayment = React.useMemo(
    () =>
      myPayments.find(
        (p) => p.status === 'pending_verification' || p.status === 'pending'
      ) || null,
    [myPayments]
  );

  const latestRejectedPayment = React.useMemo(
    () => myPayments.find((p) => p.status === 'rejected') || null,
    [myPayments]
  );

  const configuredTelegramUrl =
    settings?.vip_telegram_url || settings?.vip_purchase_url || '';
  const configuredQrUrl = settings?.vip_payment_qr_url || '';
  const configuredInstructions = settings?.vip_payment_instructions || '';
  const isUtrRequired = Boolean(settings?.vip_payment_utr_required);
  const configuredSupportUrl = settings?.support_url || settings?.telegram_channel_url || '';

  useEffect(() => {
    if (configuredQrUrl) {
      const img = new Image();
      img.src = configuredQrUrl;
    }
  }, [configuredQrUrl]);

  const configuredAmount = selectedPlan
    ? selectedPlanPreview && selectedPlanPreview.eligible
      ? Number(selectedPlanPreview.final_payable_amount)
      : Number(selectedPlan.price_inr)
    : settings?.vip_payment_amount && Number(settings.vip_payment_amount) > 0
    ? Number(settings.vip_payment_amount)
    : 0;

  const handleSelectPlan = (plan: VipPlan) => {
    setSelectedPlanId(plan.id);
    const prev = referralPreviews[plan.id];
    const payable = prev && prev.eligible ? prev.final_payable_amount : Number(plan.price_inr);
    setPaymentAmount(String(payable));
    setFormError(null);
    setPriceUpdateNotice(null);
  };

  const handleSelectQrOption = (plan: VipPlan) => {
    handleSelectPlan(plan);
    setActiveOption('qr');
    setTelegramNotice(null);
    requestAnimationFrame(() => {
      qrSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleSelectTelegramOption = (plan: VipPlan) => {
    handleSelectPlan(plan);
    setActiveOption('telegram');
    setTelegramNotice(null);
    const validUrl = isValidHttpUrl(configuredTelegramUrl);
    if (!validUrl) {
      setTelegramNotice(
        'Telegram purchase link is not configured yet. Please use Pay via QR Code below.'
      );
      return;
    }
    window.open(validUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenSupport = () => {
    setSupportNotice(null);
    const validSupport = isValidHttpUrl(configuredSupportUrl);
    if (!validSupport) {
      setSupportNotice('Support contact URL has not been configured by the administrator yet.');
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

    const maxBytes = 5 * 1024 * 1024;
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
      setFormError('Failed to read the selected screenshot image.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setFormError(null);
    setPriceUpdateNotice(null);

    if (!user) {
      setFormError(`Please log in to your ${settings?.app_name || 'STUDY BLUNDER'} account before submitting payment proof.`);
      return;
    }

    if (activePendingPayment) {
      setFormError(
        `You already have a payment pending verification (${activePendingPayment.request_id || activePendingPayment.id}). Please wait for Admin review.`
      );
      return;
    }

    if (!selectedPlan || !selectedPlan.is_active) {
      setFormError('Please select an active VIP plan.');
      return;
    }

    const cleanEmail = submittedEmail.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setFormError('Please enter a valid login Gmail / Email address.');
      return;
    }

    const numAmount = Number(paymentAmount);
    if (!paymentAmount || !Number.isFinite(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid payment amount.');
      return;
    }

    if (!screenshotDataUrl) {
      setFormError('Please upload your payment screenshot (JPG, PNG, or WEBP).');
      return;
    }

    const cleanUtr = transactionId.trim();
    if (isUtrRequired && !cleanUtr) {
      setFormError('Transaction ID / UTR is required by the administrator.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.submitVipPaymentClaim({
        submitted_email: cleanEmail,
        amount: numAmount,
        plan_id: selectedPlan.id,
        plan_title: selectedPlan.title,
        expected_plan_price: Number(selectedPlan.price_inr),
        transaction_reference: cleanUtr || undefined,
        screenshot_data_url: screenshotDataUrl,
        screenshot_mime_type: screenshotMimeType,
        purchase_source: 'pre_key',
      });

      setSubmittedClaim(res.payment);
      setShowVerificationForm(false);
      setScreenshotDataUrl(null);
      setScreenshotFileName('');
      setTransactionId('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadData();
    } catch (err: unknown) {
      const customErr = err as Error & {
        code?: string;
        updated_price?: number;
        pending_payment?: PaymentRecord;
      };
      if (customErr?.code === 'DUPLICATE_PENDING_PAYMENT') {
        setFormError(customErr.message);
        await loadData();
      } else if (customErr?.code === 'PLAN_PRICE_CHANGED' && typeof customErr.updated_price === 'number') {
        setPaymentAmount(String(customErr.updated_price));
        setPriceUpdateNotice(
          customErr.message ||
            `Plan price was updated by Admin to ₹${customErr.updated_price}. Your amount has been refreshed.`
        );
        await loadData();
      } else {
        setFormError(
          err instanceof Error ? err.message : 'Failed to submit payment verification request.'
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ra-panel-red ra-corners-orange max-w-lg w-full rounded-2xl overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.9)] relative text-left my-auto max-h-[92vh] flex flex-col">
      {/* Top Hazard Accent */}
      <div className="ra-hazard-bar h-1.5 w-full shrink-0" />

      <div className="p-5 sm:p-6 overflow-y-auto">
        {/* Top Bar: Back to Key Page + VIP Badge */}
        <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-[#454545]/70">
          <button
            type="button"
            onClick={onBackToKeyPage}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#090909] hover:bg-[#1D1D1D] border border-[#454545] hover:border-[#FF2525]/60 text-[#F5F5F5] text-xs font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#FF2525]" />
            <span>Back to Key Page</span>
          </button>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FF762E]/15 border border-[#FF762E]/50 text-[#FF762E] text-[10px] font-mono-tech font-bold uppercase tracking-wider">
            <Crown className="w-3.5 h-3.5 text-[#FF762E]" />
            <span>Pre-Key VIP Store</span>
          </span>
        </div>

        {/* Header */}
        <div className="mt-4 text-center">
          <h2 className="font-display text-lg sm:text-xl font-black text-[#F5F5F5] uppercase tracking-wide flex items-center justify-center gap-2">
            <Crown className="w-5 h-5 text-[#FF762E]" />
            <span>Upgrade to {settings?.app_name || 'STUDY BLUNDER'} VIP</span>
          </h2>
          <p className="text-xs text-[#929292] mt-1.5 leading-relaxed">
            Skip VPLINK key generation forever, unlock all VIP batches, and get instant access to all 14 VIP Student Hub features.
          </p>
          {referrerCodeUsed && (
            <p className="mt-1.5 text-[11px] font-mono-tech text-[#FF762E] font-bold">
              Referral applied: {referrerCodeUsed}
            </p>
          )}
        </div>

        {/* Active Pending Payment Request Banner */}
        {(activePendingPayment || submittedClaim) && (
          <div className="mt-4 p-4 rounded-xl bg-[#FF762E]/12 border border-[#FF762E]/50 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#FF762E] shrink-0" />
                <span className="text-xs font-display font-extrabold uppercase tracking-wider text-[#FF762E]">
                  Payment Pending Verification
                </span>
              </div>
              <span className="text-[10px] font-mono-tech font-bold px-2 py-0.5 rounded bg-[#090909] text-[#FF762E] border border-[#FF762E]/40">
                {(activePendingPayment || submittedClaim)?.request_id ||
                  (activePendingPayment || submittedClaim)?.id}
              </span>
            </div>

            <p className="text-xs text-[#F5F5F5] leading-relaxed">
              Your VIP payment request for{' '}
              <strong className="text-[#F5F5F5]">
                {(activePendingPayment || submittedClaim)?.plan_title || 'VIP Membership'}
              </strong>{' '}
              (₹{(activePendingPayment || submittedClaim)?.amount}) is currently awaiting Admin verification.
            </p>

            <div className="p-2.5 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between gap-2 text-[11px]">
              <div>
                <span className="text-[#929292] block text-[10px] font-mono-tech uppercase">Payment Request ID</span>
                <span className="font-mono-tech font-bold text-[#FF762E]">
                  {(activePendingPayment || submittedClaim)?.request_id ||
                    (activePendingPayment || submittedClaim)?.id}
                </span>
              </div>
              <button
                type="button"
                onClick={checkVipStatusAndUnlock}
                disabled={checkingActivation}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-[11px] uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingActivation ? 'animate-spin' : ''}`} />
                <span>{checkingActivation ? 'Checking...' : 'Check Status'}</span>
              </button>
            </div>

            <p className="text-[11px] text-[#C5C5C5] leading-relaxed">
              As soon as the Admin approves your payment, your VIP membership activates automatically and unlocks Home without generating a key.
            </p>
          </div>
        )}

        {/* Rejected Payment Notice */}
        {!activePendingPayment && latestRejectedPayment && (
          <div className="mt-4 p-3.5 rounded-xl bg-[#FF2525]/12 border border-[#FF2525]/55 text-xs text-[#F5F5F5] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-display font-extrabold uppercase tracking-wider text-[#FF2525] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-[#FF2525]" />
                <span>Previous Request Rejected</span>
              </span>
              <span className="text-[10px] font-mono-tech text-[#FF2525]">
                {latestRejectedPayment.request_id || latestRejectedPayment.id}
              </span>
            </div>
            <p className="text-[11px] text-[#C5C5C5]">
              Reason: {latestRejectedPayment.rejection_reason || latestRejectedPayment.admin_note || 'Verification did not match payment records.'}
            </p>
            <p className="text-[11px] text-[#FF762E] font-semibold">
              You can submit a new payment verification request below.
            </p>
          </div>
        )}

        {telegramNotice && (
          <div className="mt-3 p-3 rounded-xl bg-[#FF762E]/12 border border-[#FF762E]/50 text-[#F5F5F5] text-xs flex items-start justify-between gap-2">
            <span>{telegramNotice}</span>
            <button type="button" onClick={() => setTelegramNotice(null)} className="text-[#FF762E]">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* VIP Plans List */}
        <div className="mt-4 space-y-3.5">
          {loadingPlans || loadingPayments ? (
            <div className="h-44 rounded-xl bg-[#090909] border border-[#454545] animate-pulse" />
          ) : (
            plans.map((plan) => {
              const isSelected = selectedPlan?.id === plan.id;
              const hasOriginalPrice =
                plan.original_price_inr && Number(plan.original_price_inr) > Number(plan.price_inr);
              const bonusDays = Number(plan.bonus_days || 0);
              const refPrev = referralPreviews[plan.id];
              const hasRefDiscount = Boolean(refPrev && refPrev.eligible && refPrev.referral_discount_applied > 0);
              const displayPayable = hasRefDiscount ? refPrev.final_payable_amount : plan.price_inr;

              return (
                <div
                  key={plan.id}
                  onClick={() => handleSelectPlan(plan)}
                  className={`relative rounded-xl border p-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#1D1D1D] border-[#FF2525] ra-corners-red shadow-[0_0_24px_rgba(255,37,37,0.16)]'
                      : 'bg-[#090909] border-[#454545] hover:border-[#C5C5C5]/60'
                  }`}
                >
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-mono-tech font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/45">
                        {plan.duration_days ? `${plan.duration_days} Days` : `${plan.duration_months || 1} Months`}
                      </span>
                      {bonusDays > 0 && (
                        <span className="text-[10px] font-mono-tech font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF762E]/15 text-[#FF762E] border border-[#FF762E]/45 inline-flex items-center gap-1">
                          <Gift className="w-3 h-3" />+{bonusDays} Bonus Days
                        </span>
                      )}
                      {plan.discount_label && (
                        <span className="text-[10px] font-mono-tech font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#141414] text-[#F5F5F5] border border-[#454545] inline-flex items-center gap-1">
                          <Tag className="w-3 h-3 text-[#FF762E]" />
                          {plan.discount_label}
                        </span>
                      )}
                      {hasRefDiscount && refPrev && (
                        <span className="text-[10px] font-mono-tech font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF762E]/20 text-[#FF762E] border border-[#FF762E]/50 inline-flex items-center gap-1">
                          <Gift className="w-3 h-3" />
                          {refPrev.discount_label || `Referral -₹${refPrev.referral_discount_applied}`}
                        </span>
                      )}
                    </div>

                    {plan.badge_label && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FF2525] text-[#F5F5F5] font-display font-extrabold text-[10px] uppercase tracking-wider">
                        <Sparkles className="w-2.5 h-2.5" />
                        {plan.badge_label}
                      </span>
                    )}
                  </div>

                  {/* Title & Pricing */}
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <h3 className="font-display text-sm font-black text-[#F5F5F5] uppercase tracking-wide">
                        {plan.title}
                      </h3>
                      <p className="text-[11px] text-[#929292] mt-0.5">
                        Total Validity: {Number(plan.duration_days || 30) + bonusDays} Days Direct Access
                      </p>
                    </div>
                    <div className="text-right">
                      {(hasOriginalPrice || hasRefDiscount) && (
                        <span className="text-xs text-[#929292] line-through mr-1.5 font-mono-tech">
                          ₹{hasRefDiscount ? plan.price_inr : plan.original_price_inr}
                        </span>
                      )}
                      <span className="text-2xl font-display font-black text-[#FF2525] font-mono-tech">
                        ₹{displayPayable}
                      </span>
                    </div>
                  </div>

                  {/* Referral Discount Breakdown Box */}
                  {hasRefDiscount && refPrev && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-[#141414] border border-[#FF762E]/45 grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-[#929292] block text-[10px]">Original Price</span>
                        <strong className="text-[#F5F5F5] font-mono-tech">₹{refPrev.original_plan_price}</strong>
                      </div>
                      <div>
                        <span className="text-[#929292] block text-[10px]">Referral Discount</span>
                        <strong className="text-[#FF762E] font-mono-tech">-₹{refPrev.referral_discount_applied}</strong>
                      </div>
                      <div className="text-right">
                        <span className="text-[#929292] block text-[10px]">Final Payable</span>
                        <strong className="text-[#FF2525] font-mono-tech">₹{refPrev.final_payable_amount}</strong>
                      </div>
                    </div>
                  )}

                  {/* Features */}
                  {Array.isArray(plan.features) && plan.features.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[#454545]/70 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {plan.features.map((feat, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[11px] text-[#C5C5C5]">
                          <Check className="w-3.5 h-3.5 text-[#FF2525] shrink-0" />
                          <span className="truncate">{feat}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="mt-3.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectTelegramOption(plan);
                      }}
                      className="min-h-[42px] py-2 px-3 rounded-xl ra-btn-secondary text-[11px] flex items-center justify-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5 text-[#FF762E]" />
                      <span>Via Telegram</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectQrOption(plan);
                      }}
                      disabled={Boolean(activePendingPayment)}
                      className="min-h-[42px] py-2 px-3 rounded-xl ra-btn-primary text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>{activePendingPayment ? 'Request Pending' : 'Pay via QR'}</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* QR Code & Verification Section */}
        {activeOption === 'qr' && !activePendingPayment && selectedPlan && (
          <div
            ref={qrSectionRef}
            className="mt-4 p-4 rounded-xl bg-[#090909] border border-[#FF2525]/55 space-y-3.5"
          >
            <div className="flex items-center justify-between border-b border-[#454545]/70 pb-2.5">
              <div>
                <h4 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#FF2525]">
                  Scan QR & Submit Proof ({selectedPlan.title})
                </h4>
                <p className="text-[11px] text-[#929292]">
                  Amount to Pay: <strong className="text-[#F5F5F5] font-mono-tech">₹{configuredAmount}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveOption(null);
                  setShowVerificationForm(false);
                }}
                aria-label="Close QR section"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-[#141414] border border-[#454545] text-[#C5C5C5] hover:text-[#F5F5F5]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!configuredQrUrl ? (
              <div className="p-3.5 rounded-xl bg-[#141414] border border-[#454545] text-center text-xs text-[#929292]">
                Payment QR code is not uploaded yet. Please use Via Telegram or contact Support.
              </div>
            ) : (
              <div className="flex flex-col items-center text-center space-y-3">
                {/* Keep pure white frame strictly behind QR image for reliable UPI scanning */}
                <div className="bg-white p-2.5 rounded-xl shadow-md max-w-[190px] w-full">
                  <img
                    src={configuredQrUrl}
                    alt="Official VIP Payment QR"
                    className="w-full h-auto max-h-[175px] object-contain rounded-lg"
                  />
                </div>

                {configuredInstructions && (
                  <div className="w-full p-3 rounded-xl bg-[#141414] border border-[#454545] text-left text-[11px] text-[#C5C5C5] whitespace-pre-line">
                    {configuredInstructions}
                  </div>
                )}

                {!showVerificationForm && (
                  <button
                    type="button"
                    onClick={() => setShowVerificationForm(true)}
                    className="w-full min-h-[46px] py-2.5 px-4 rounded-xl ra-btn-primary text-xs flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>I Have Paid — Submit Proof</span>
                  </button>
                )}
              </div>
            )}

            {configuredQrUrl && showVerificationForm && (
              <form onSubmit={handleSubmitClaim} className="space-y-3 pt-2 border-t border-[#454545]/70">
                {priceUpdateNotice && (
                  <div className="p-2.5 rounded-xl bg-[#FF762E]/15 border border-[#FF762E]/50 text-[#F5F5F5] text-xs">
                    {priceUpdateNotice}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-mono-tech uppercase tracking-wider text-[#C5C5C5] mb-1">
                    1. Login Email Address <span className="text-[#FF2525]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={submittedEmail}
                    onChange={(e) => setSubmittedEmail(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] text-xs text-[#F5F5F5] focus:outline-none focus:border-[#FF2525]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono-tech uppercase tracking-wider text-[#C5C5C5] mb-1">
                    2. Paid Amount (₹) <span className="text-[#FF2525]">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] text-xs font-mono-tech text-[#F5F5F5] focus:outline-none focus:border-[#FF2525]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-mono-tech uppercase tracking-wider text-[#C5C5C5] mb-1">
                    3. Payment Screenshot (JPG/PNG/WEBP) <span className="text-[#FF2525]">*</span>
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
                      className="w-full py-3.5 px-3 rounded-xl border-2 border-dashed border-[#454545] hover:border-[#FF2525]/70 bg-[#141414] flex flex-col items-center justify-center gap-1 text-xs text-[#F5F5F5] transition-colors"
                    >
                      <Upload className="w-4 h-4 text-[#FF2525]" />
                      <span className="font-semibold">Select Payment Screenshot</span>
                    </button>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-[#141414] border border-[#FF2525]/55 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ImageIcon className="w-4 h-4 text-[#FF2525] shrink-0" />
                        <span className="text-xs text-[#F5F5F5] truncate">{screenshotFileName}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[10px] font-mono-tech uppercase font-bold text-[#FF762E] px-2.5 py-1 rounded bg-[#090909] border border-[#454545]"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-mono-tech uppercase tracking-wider text-[#C5C5C5] mb-1">
                    4. Transaction ID / UTR {isUtrRequired ? <span className="text-[#FF2525]">*</span> : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    required={isUtrRequired}
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="12-digit UTR / UPI Reference"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] text-xs font-mono-tech text-[#F5F5F5] placeholder-[#929292]/55 focus:outline-none focus:border-[#FF2525]"
                  />
                </div>

                {formError && (
                  <div className="p-2.5 rounded-xl bg-[#FF2525]/12 border border-[#FF2525]/55 text-[#F5F5F5] text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[46px] py-2.5 px-4 rounded-xl ra-btn-primary text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Submitting Request...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Submit Pre-Key VIP Request</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Footer Support */}
        <div className="mt-4 pt-3 border-t border-[#454545]/70 flex items-center justify-between gap-2 text-xs">
          <span className="text-[#929292] flex items-center gap-1.5">
            <LifeBuoy className="w-3.5 h-3.5 text-[#FF762E]" />
            <span>Need help with VIP purchase?</span>
          </span>
          <button
            type="button"
            onClick={handleOpenSupport}
            className="min-h-[38px] px-3 py-1.5 rounded-xl ra-btn-secondary text-[11px]"
          >
            Contact Support
          </button>
        </div>

        {supportNotice && (
          <p className="mt-2 text-[11px] text-[#FF762E] text-center">{supportNotice}</p>
        )}
      </div>
    </div>
  );
};
