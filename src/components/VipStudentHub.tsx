import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Crown,
  Flame,
  Calendar,
  BarChart3,
  Award,
  BookOpen,
  ShieldCheck,
  Megaphone,
  Clock,
  BellRing,
  CheckSquare,
  Headphones,
  Gift,
  Sparkles,
  CheckCircle2,
  Plus,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Bookmark,
  Play,
  Send,
  Lock,
  LifeBuoy,
  Share2,
  TrendingUp,
  AlertCircle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../api.ts';
import type {
  UserProfile,
  PublicSettings,
  VipStudentHubData,
  VipFeatureKey,
  StudyTimetableItem,
  VipMockTest,
  VipMockTestAttempt,
  PrioritySupportTicket,
} from '../types.ts';

interface VipStudentHubProps {
  user: UserProfile | null;
  settings?: PublicSettings | null;
  onScrollToRenewal: () => void;
  onOpenAuth?: () => void;
}

interface FeatureTabMeta {
  key: VipFeatureKey;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOrder: number;
}

const FEATURE_TABS: FeatureTabMeta[] = [
  {
    key: 'vip_dashboard',
    label: 'VIP Dashboard Overview',
    shortDesc: 'Complete overview of your VIP membership, study streak, exams & quick actions.',
    icon: Crown,
    defaultOrder: 1,
  },
  {
    key: 'daily_study_streak',
    label: 'Daily Study Streak',
    shortDesc: 'IST-verified daily study streak counter, calendar history & 7d/30d milestones.',
    icon: Flame,
    defaultOrder: 2,
  },
  {
    key: 'exam_counter',
    label: 'Exam Counter',
    shortDesc: 'Live day countdowns for official Admin exams and your personal target exams.',
    icon: Calendar,
    defaultOrder: 3,
  },
  {
    key: 'study_analytics',
    label: 'Study Analytics',
    shortDesc: 'Genuine measured platform launches, mock test accuracy & timetable completion.',
    icon: BarChart3,
    defaultOrder: 4,
  },
  {
    key: 'achievements_rewards',
    label: 'Achievements & Rewards',
    shortDesc: 'Unlock scholar badges and milestone achievements as you study consistently.',
    icon: Award,
    defaultOrder: 5,
  },
  {
    key: 'learning_library',
    label: 'Learning Library',
    shortDesc: 'Curated study notes, chapter summaries, syllabus guides & practice sets.',
    icon: BookOpen,
    defaultOrder: 6,
  },
  {
    key: 'vip_membership_center',
    label: 'VIP Membership Center',
    shortDesc: 'Single-device security status, 24-hour grace protection & plan renewal.',
    icon: ShieldCheck,
    defaultOrder: 7,
  },
  {
    key: 'vip_announcements',
    label: 'VIP Announcements',
    shortDesc: 'Priority batch updates, exam alerts & mentor notices for VIP students.',
    icon: Megaphone,
    defaultOrder: 8,
  },
  {
    key: 'study_timetable',
    label: 'Study Timetable',
    shortDesc: 'Build and track your personalized daily and weekly subject study schedule.',
    icon: Clock,
    defaultOrder: 9,
  },
  {
    key: 'exam_reminders',
    label: 'Exam Reminders',
    shortDesc: 'Smart 30d, 15d, 7d, 3d & 1d revision alerts for upcoming exams.',
    icon: BellRing,
    defaultOrder: 10,
  },
  {
    key: 'vip_mock_tests',
    label: 'VIP Mock Tests',
    shortDesc: 'High-yield timed practice tests with instant score evaluation & explanations.',
    icon: CheckSquare,
    defaultOrder: 11,
  },
  {
    key: 'priority_support',
    label: 'Priority Support',
    shortDesc: 'Fast-track VIP support ticket desk with direct administrator replies.',
    icon: Headphones,
    defaultOrder: 12,
  },
  {
    key: 'vip_referral_rewards',
    label: 'VIP Referral Rewards',
    shortDesc: 'Share your referral code, give friends VIP discounts & earn +7 bonus VIP days.',
    icon: Gift,
    defaultOrder: 13,
  },
  {
    key: 'exclusive_resources',
    label: 'Exclusive Resources',
    shortDesc: 'VIP vault of topper handwritten notes, formula sheets & rapid revision books.',
    icon: Sparkles,
    defaultOrder: 14,
  },
];

/**
 * Isolated 1-second live countdown component (Part B & Part J).
 * Prevents re-rendering the entire VIP Dashboard or Home page every second.
 */
const VipLiveCountdownCard: React.FC<{
  vipExpiresAt: string | null;
  membershipState: string;
  planName: string;
  isAdminBypass: boolean;
  onRenewClick: () => void;
}> = React.memo(({ vipExpiresAt, membershipState, planName, isAdminBypass, onRenewClick }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!vipExpiresAt) return;
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [vipExpiresAt]);

  const expiryMs = vipExpiresAt ? new Date(vipExpiresAt).getTime() : 0;
  const remainingMs = Math.max(0, expiryMs - nowMs);
  const isExpired = !isAdminBypass && (membershipState === 'expired' || (expiryMs > 0 && remainingMs <= 0));
  const isGrace = membershipState === 'grace_period';

  const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remainingMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((remainingMs / (1000 * 60)) % 60);
  const seconds = Math.floor((remainingMs / 1000) % 60);

  return (
    <div
      className={`rounded-xl border shadow-2xl relative overflow-hidden ${
        isExpired
          ? 'ra-panel-red border-[#FF2525]/65 ra-corners-red'
          : isGrace
          ? 'ra-panel border-[#FF762E]/65 ra-corners-orange'
          : 'ra-panel-red border-[#FF2525]/55 ra-corners-red'
      }`}
    >
      <div className="ra-hazard-bar h-1.5 w-full opacity-90" />
      <div className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono-tech font-bold uppercase tracking-wider border ${
                isExpired
                  ? 'bg-[#FF2525]/15 border-[#FF2525]/55 text-[#FF2525]'
                  : isGrace
                  ? 'bg-[#FF762E]/15 border-[#FF762E]/50 text-[#FF762E]'
                  : 'bg-[#FF2525]/15 border-[#FF2525]/50 text-[#FF2525]'
              }`}
            >
              <Crown className="w-3 h-3 text-[#FF762E]" />
              <span>
                {isAdminBypass
                  ? 'STAFF ADMIN VIP ACCESS'
                  : isExpired
                  ? 'VIP MEMBERSHIP EXPIRED'
                  : isGrace
                  ? '24H RENEWAL GRACE PERIOD'
                  : 'ACTIVE VIP CLEARANCE'}
              </span>
            </span>

            <span className="text-[10px] font-mono-tech font-bold text-[#FF762E] bg-[#090909] border border-[#454545] px-2.5 py-1 rounded-md uppercase">
              Plan: {planName}
            </span>
          </div>

          <p className="text-xs text-[#929292] mt-2">
            {vipExpiresAt ? (
              <>
                Expiry Date:{' '}
                <strong className="text-[#F5F5F5] font-mono-tech">
                  {new Date(vipExpiresAt).toLocaleString()}
                </strong>
              </>
            ) : isAdminBypass ? (
              <strong className="text-[#FF2525]">Unlimited Administrator Access</strong>
            ) : (
              'No active expiry date found'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onRenewClick}
          className="min-h-[40px] px-3.5 py-2 rounded-lg ra-btn-primary text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shrink-0"
        >
          <Crown className="w-3.5 h-3.5" />
          <span>{isExpired ? 'Renew VIP Now' : 'Extend / Upgrade VIP'}</span>
        </button>
      </div>

      {/* Prominent 4-Unit Countdown Grid */}
      {vipExpiresAt && (
        <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3 text-center">
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#090909] border border-[#454545]">
            <span
              className={`text-xl sm:text-2xl font-display font-extrabold font-mono-tech block ${
                isExpired ? 'text-[#FF2525]' : 'text-[#FF762E]'
              }`}
            >
              {String(days).padStart(2, '0')}
            </span>
            <span className="text-[10px] font-mono-tech uppercase tracking-wider text-[#929292] mt-0.5 block">
              Days
            </span>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#090909] border border-[#454545]">
            <span
              className={`text-xl sm:text-2xl font-display font-extrabold font-mono-tech block ${
                isExpired ? 'text-[#FF2525]' : 'text-[#F5F5F5]'
              }`}
            >
              {String(hours).padStart(2, '0')}
            </span>
            <span className="text-[10px] font-mono-tech uppercase tracking-wider text-[#929292] mt-0.5 block">
              Hours
            </span>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#090909] border border-[#454545]">
            <span
              className={`text-xl sm:text-2xl font-display font-extrabold font-mono-tech block ${
                isExpired ? 'text-[#FF2525]' : 'text-[#F5F5F5]'
              }`}
            >
              {String(minutes).padStart(2, '0')}
            </span>
            <span className="text-[10px] font-mono-tech uppercase tracking-wider text-[#929292] mt-0.5 block">
              Minutes
            </span>
          </div>
          <div className="p-2.5 sm:p-3 rounded-xl bg-[#090909] border border-[#454545]">
            <span
              className={`text-xl sm:text-2xl font-display font-extrabold font-mono-tech block ${
                isExpired ? 'text-[#FF2525]' : 'text-[#FF2525]'
              }`}
            >
              {String(seconds).padStart(2, '0')}
            </span>
            <span className="text-[10px] font-mono-tech uppercase tracking-wider text-[#929292] mt-0.5 block">
              Seconds
            </span>
          </div>
        </div>
      )}
      </div>
    </div>
  );
});

export const VipStudentHub: React.FC<VipStudentHubProps> = ({
  user,
  settings,
  onScrollToRenewal,
  onOpenAuth,
}) => {
  const [hubData, setHubData] = useState<VipStudentHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [activeFeature, setActiveFeature] = useState<VipFeatureKey>('vip_dashboard');
  const [toast, setToast] = useState<string | null>(null);

  // Streak check-in
  const [checkingInStreak, setCheckingInStreak] = useState(false);

  // Personal Exam Form
  const [examTitle, setExamTitle] = useState('');
  const [examSubject, setExamSubject] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examTarget, setExamTarget] = useState('');
  const [addingExam, setAddingExam] = useState(false);

  // Timetable Form
  const [ttDay, setTtDay] = useState<StudyTimetableItem['day_of_week']>('Monday');
  const [ttStart, setTtStart] = useState('06:00');
  const [ttEnd, setTtEnd] = useState('07:30');
  const [ttSubject, setTtSubject] = useState('');
  const [ttTopic, setTtTopic] = useState('');
  const [ttPriority, setTtPriority] = useState<StudyTimetableItem['priority']>('High');
  const [addingTimetable, setAddingTimetable] = useState(false);

  // Library Filter & Reader
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  // Mock Test Runner
  const [activeTest, setActiveTest] = useState<VipMockTest | null>(null);
  const [testAnswers, setTestAnswers] = useState<number[]>([]);
  const [testStartMs, setTestStartMs] = useState<number>(0);
  const [submittingTest, setSubmittingTest] = useState(false);
  const [lastAttemptResult, setLastAttemptResult] = useState<VipMockTestAttempt | null>(null);

  // Priority Support Form
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState<PrioritySupportTicket['category']>('General Study Help');
  const [ticketMessage, setTicketMessage] = useState('');
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [replyTextMap, setReplyTextMap] = useState<Record<string, string>>({});

  // Referral Form
  const [referralInput, setReferralInput] = useState('');
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  // Support URL helper (Part A: retain Support access inside VIP Dashboard)
  const validSupportUrl = useMemo(() => {
    if (!settings?.support_enabled) return null;
    const raw = (settings.support_url || '').trim();
    if (!raw) return null;
    const candidate = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`;
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  }, [settings?.support_enabled, settings?.support_url]);

  const isAdminBypass = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
  const hasVipHistory = Boolean(
    user &&
      (user.vip_active ||
        user.vip_membership_state === 'active' ||
        user.vip_membership_state === 'grace_period' ||
        user.vip_membership_state === 'expired' ||
        Boolean(user.vip_expires_at) ||
        isAdminBypass)
  );

  const loadHub = useCallback(async () => {
    if (!user || !hasVipHistory) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setErrorCode(null);
      const data = await api.getVipStudentHub();
      setHubData(data);
    } catch (err: unknown) {
      const customErr = err as Error & { code?: string };
      setError(customErr instanceof Error ? customErr.message : 'Failed to load VIP Dashboard');
      if (customErr?.code) setErrorCode(customErr.code);
    } finally {
      setLoading(false);
    }
  }, [user, hasVipHistory]);

  useEffect(() => {
    void loadHub();
  }, [loadHub]);

  // Real-time SSE updates when Super Admin toggles or reorders VIP features
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined' || !user || !hasVipHistory) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/festivals/stream');
      const handleVipFeaturesUpdate = () => {
        void loadHub();
      };
      es.addEventListener('vip_features_update', handleVipFeaturesUpdate as EventListener);
      es.addEventListener('vip_status_update', handleVipFeaturesUpdate as EventListener);
    } catch {
      // Ignore SSE fallback
    }
    return () => {
      if (es) es.close();
    };
  }, [loadHub, user, hasVipHistory]);

  // Sort features by Super Admin's saved display_order (Part D)
  const orderedFeatureTabs = useMemo(() => {
    const featuresMap = hubData?.feature_state?.features;
    return [...FEATURE_TABS].sort((a, b) => {
      const orderA = featuresMap?.[a.key]?.display_order ?? a.defaultOrder;
      const orderB = featuresMap?.[b.key]?.display_order ?? b.defaultOrder;
      return orderA - orderB;
    });
  }, [hubData?.feature_state?.features]);

  const isFeatureEnabled = useCallback(
    (key: VipFeatureKey): boolean => {
      if (!hubData?.feature_state?.global_master_enabled) return false;
      const found = hubData.feature_state.features?.[key];
      return found ? found.is_enabled : true;
    },
    [hubData]
  );

  const enabledTabs = useMemo(
    () => orderedFeatureTabs.filter((t) => isFeatureEnabled(t.key)),
    [orderedFeatureTabs, isFeatureEnabled]
  );

  useEffect(() => {
    if (enabledTabs.length > 0 && !enabledTabs.some((t) => t.key === activeFeature)) {
      setActiveFeature(enabledTabs[0].key);
    }
  }, [enabledTabs, activeFeature]);

  // PART C.1: Non-VIP User Locked Screen (No private VIP data exposed)
  if (!user || !hasVipHistory || errorCode === 'VIP_REQUIRED') {
    return (
      <div className="space-y-4 pb-8">
        <div className="rounded-xl ra-panel-red border border-[#FF2525]/55 ra-corners-red shadow-2xl relative overflow-hidden">
          <div className="ra-hazard-bar h-1.5 w-full opacity-90" />
          <div className="p-6 sm:p-7 text-center">
            <div className="w-16 h-16 rounded-xl bg-[#090909] border border-[#FF2525]/60 flex items-center justify-center text-[#FF2525] mx-auto mb-4 shadow-[0_0_24px_rgba(255,37,37,0.22)]">
              <Crown className="w-8 h-8 stroke-[2.2]" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#FF2525]/15 border border-[#FF2525]/45 text-[#FF2525] text-[10px] font-mono-tech font-bold uppercase tracking-wider mb-2.5">
              <Lock className="w-3.5 h-3.5 text-[#FF2525]" />
              <span>VIP Clearance Required</span>
            </div>

            <h1 className="font-display text-xl sm:text-2xl font-extrabold text-[#F5F5F5] tracking-tight uppercase">
              Unlock the {settings?.app_name || 'STUDY BLUNDER'} VIP Command Hub
            </h1>
            <p className="text-xs sm:text-sm text-[#929292] mt-2 max-w-md mx-auto leading-relaxed">
              Upgrade to VIP Membership to unlock all 14 tactical student tools — including Daily Study Streak, Official & Personal Exam Countdowns, Study Analytics, VIP Mock Tests, Learning Library, Priority Support, and Exclusive Topper Vault.
            </p>

            {/* Preview of VIP Features */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2 text-left">
              {FEATURE_TABS.slice(0, 9).map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.key}
                    className="p-2.5 rounded-lg bg-[#090909] border border-[#454545] flex items-center gap-2"
                  >
                    <Icon className="w-4 h-4 text-[#FF2525] shrink-0" />
                    <span className="text-[11px] font-semibold text-[#F5F5F5] truncate">{f.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={onScrollToRenewal}
                className="w-full sm:w-auto min-h-[46px] px-6 py-3 rounded-lg ra-btn-primary text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Crown className="w-4 h-4 stroke-[2.4]" />
                <span>Get VIP / Upgrade VIP</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {!user && onOpenAuth && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="w-full sm:w-auto min-h-[46px] px-5 py-3 rounded-lg ra-btn-secondary text-xs uppercase tracking-wider"
                >
                  Sign In to Existing Account
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Retained Support Access Card */}
        {validSupportUrl && (
          <div className="rounded-xl ra-panel border border-[#454545] p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#090909] border border-[#FF2525]/45 flex items-center justify-center text-[#FF2525] shrink-0">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-xs font-extrabold text-[#F5F5F5] uppercase">
                  {settings?.support_title || 'Need Help or Support?'}
                </h3>
                <p className="text-[11px] text-[#929292]">
                  Contact official {settings?.app_name || 'STUDY BLUNDER'} support for account, key, or VIP inquiries.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => window.open(validSupportUrl, '_blank', 'noopener,noreferrer')}
              className="min-h-[38px] px-3.5 py-2 rounded-lg bg-[#FF2525]/12 hover:bg-[#FF2525]/22 border border-[#FF2525]/45 text-[#FF2525] font-display font-bold text-xs inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <span>Open Support</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-2xl border border-[#454545] bg-[#141414] p-5 animate-pulse space-y-3">
        <div className="h-6 w-48 bg-[#454545] rounded-lg" />
        <div className="h-28 bg-[#090909] rounded-xl" />
        <div className="h-40 bg-[#090909] rounded-xl" />
      </div>
    );
  }

  if (error || !hubData) {
    return (
      <div className="rounded-2xl bg-[#141414] border border-[#FF2525]/45 ra-corners-red p-5 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-[#FF2525] mx-auto" />
        <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase">
          Unable to Load VIP Dashboard
        </h3>
        <p className="text-xs text-[#929292]">{error || 'Please check your connection and try again.'}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadHub();
          }}
          className="min-h-[40px] px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-[#F5F5F5] font-display font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  const expiryMs = user.vip_expires_at ? new Date(user.vip_expires_at).getTime() : 0;
  const isExpiredVip =
    !isAdminBypass &&
    (user.vip_membership_state === 'expired' ||
      (!user.vip_active && user.vip_membership_state !== 'grace_period' && expiryMs > 0 && expiryMs <= Date.now()));

  // Determine active VIP plan label
  const activePlanLabel = user.vip_plan_title || (isAdminBypass ? 'Staff Unlimited VIP' : `${settings?.app_name || 'STUDY BLUNDER'} VIP Pass`);

  // If Global VIP Master Switch is OFF, display a clean notice while still showing the user's VIP Membership Countdown card & Support link
  if (!hubData.feature_state.global_master_enabled || enabledTabs.length === 0) {
    return (
      <div className="space-y-4 pb-8">
        <VipLiveCountdownCard
          vipExpiresAt={user.vip_expires_at}
          membershipState={user.vip_membership_state || (user.vip_active ? 'active' : 'expired')}
          planName={activePlanLabel}
          isAdminBypass={isAdminBypass}
          onRenewClick={onScrollToRenewal}
        />
        <div className="rounded-xl ra-panel border border-[#454545] p-5 text-center space-y-2">
          <Sparkles className="w-6 h-6 text-[#FF762E] mx-auto" />
          <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase">
            VIP Student Features Temporarily Offline
          </h3>
          <p className="text-xs text-[#929292]">
            Your VIP membership and batch access remain active. Interactive student dashboard tools are currently under maintenance by Super Admin.
          </p>
        </div>
      </div>
    );
  }

  const handleStreakCheckIn = async () => {
    if (checkingInStreak || isExpiredVip) return;
    try {
      setCheckingInStreak(true);
      const res = await api.checkInStudyStreak('vip_hub_checkin');
      showToast(res.message);
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not check in');
    } finally {
      setCheckingInStreak(false);
    }
  };

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim() || !examDate || isExpiredVip) return;
    try {
      setAddingExam(true);
      const res = await api.addStudentExam({
        exam_name: examTitle.trim(),
        title: examTitle.trim(),
        subject: examSubject.trim() || 'General',
        exam_date: examDate,
        target_score: examTarget.trim() || undefined,
      });
      setExamTitle('');
      setExamSubject('');
      setExamDate('');
      setExamTarget('');
      showToast(res.message);
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add exam');
    } finally {
      setAddingExam(false);
    }
  };

  const handleDeleteExam = async (id: string) => {
    if (isExpiredVip) return;
    try {
      await api.deleteStudentExam(id);
      showToast('Exam removed.');
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete exam');
    }
  };

  const handleAddTimetable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ttSubject.trim() || !ttTopic.trim() || isExpiredVip) return;
    try {
      setAddingTimetable(true);
      await api.addTimetableItem({
        day_of_week: ttDay,
        start_time: ttStart,
        end_time: ttEnd,
        subject: ttSubject.trim(),
        topic: ttTopic.trim(),
        priority: ttPriority,
      });
      setTtSubject('');
      setTtTopic('');
      showToast('Study slot added to your timetable.');
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add study slot');
    } finally {
      setAddingTimetable(false);
    }
  };

  const handleToggleTimetableComplete = async (item: StudyTimetableItem) => {
    if (isExpiredVip) return;
    try {
      await api.updateTimetableItem(item.id, { is_completed: !item.is_completed });
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update slot');
    }
  };

  const handleDeleteTimetable = async (id: string) => {
    if (isExpiredVip) return;
    try {
      await api.deleteTimetableItem(id);
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete slot');
    }
  };

  const bookmarkedIds = new Set(
    (hubData.resource_interactions || []).filter((i) => i.is_bookmarked).map((i) => i.resource_id)
  );
  const completedIds = new Set(
    (hubData.resource_interactions || []).filter((i) => i.is_completed).map((i) => i.resource_id)
  );

  const handleResourceAction = async (id: string, action: 'bookmark' | 'complete') => {
    if (isExpiredVip) {
      showToast('Renew your VIP membership to update learning library progress.');
      return;
    }
    try {
      const payload =
        action === 'bookmark'
          ? { is_bookmarked: !bookmarkedIds.has(id) }
          : { is_completed: !completedIds.has(id) };
      await api.interactWithResource(id, payload);
      await loadHub();
    } catch {
      // Ignore error
    }
  };

  const handleStartMockTest = (test: VipMockTest) => {
    if (isExpiredVip) {
      showToast('Renew your VIP membership to take VIP Practice Mock Tests.');
      return;
    }
    setActiveTest(test);
    setTestAnswers(new Array(test.questions.length).fill(-1));
    setTestStartMs(Date.now());
    setLastAttemptResult(null);
  };

  const handleSubmitMockTest = async () => {
    if (!activeTest || submittingTest || isExpiredVip) return;
    try {
      setSubmittingTest(true);
      const elapsedSec = Math.max(5, Math.round((Date.now() - testStartMs) / 1000));
      const res = await api.submitMockTestAttempt(activeTest.id, {
        selected_answers: testAnswers,
        time_taken_seconds: elapsedSec,
      });
      setLastAttemptResult(res.attempt);
      showToast(res.message);
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to submit test');
    } finally {
      setSubmittingTest(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim() || creatingTicket || isExpiredVip) return;
    try {
      setCreatingTicket(true);
      const res = await api.createPrioritySupportTicket({
        subject: ticketSubject.trim(),
        category: ticketCategory,
        message: ticketMessage.trim(),
      });
      setTicketSubject('');
      setTicketMessage('');
      showToast(res.message);
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create priority ticket');
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleReplyTicket = async (ticketId: string) => {
    const msg = (replyTextMap[ticketId] || '').trim();
    if (!msg || isExpiredVip) return;
    try {
      await api.replyPrioritySupportTicket(ticketId, msg);
      setReplyTextMap((prev) => ({ ...prev, [ticketId]: '' }));
      showToast('Reply sent.');
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send reply');
    }
  };

  const handleApplyReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralInput.trim() || applyingReferral) return;
    try {
      setApplyingReferral(true);
      const res = await api.applyReferralCode(referralInput.trim());
      setReferralInput('');
      showToast(res.message);
      await loadHub();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to apply referral code');
    } finally {
      setApplyingReferral(false);
    }
  };

  // Calculate exam countdowns
  const upcomingExamsWithDays = (hubData.exams || [])
    .map((ex) => {
      const diffDays = Math.ceil((new Date(ex.exam_date).getTime() - Date.now()) / (24 * 3600 * 1000));
      return { ...ex, daysLeft: diffDays };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const urgentExamReminders = upcomingExamsWithDays.filter((e) => e.daysLeft >= 0 && e.daysLeft <= 30);

  // Derived study analytics from genuine backend arrays
  const uniquePlatformsCount = new Set((hubData.recent_platform_opens || []).map((p) => p.platform_id)).size;
  const totalPlatformOpens = (hubData.recent_platform_opens || []).length;
  const avgMockScore =
    hubData.mock_attempts && hubData.mock_attempts.length > 0
      ? Math.round(
          hubData.mock_attempts.reduce((s, a) => s + (a.percentage || 0), 0) / hubData.mock_attempts.length
        )
      : 0;
  const completedTimetableSlotsCount = (hubData.timetable || []).filter((t) => t.is_completed).length;

  const milestone7Unlocked =
    hubData.streak.longest_streak >= 7 || (hubData.streak.milestones_unlocked || []).includes('streak_7');
  const milestone30Unlocked =
    hubData.streak.longest_streak >= 30 || (hubData.streak.milestones_unlocked || []).includes('streak_30');

  const totalBonusReferralDays = (hubData.referrals || []).reduce(
    (sum, r) => sum + (Number(r.reward_days_granted) || 0),
    0
  );

  const referralPerms = hubData.referral_permissions;
  const referralProgramOn = hubData.referral_program_enabled !== false;
  const shareableReferralUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?ref=${encodeURIComponent(hubData.referral_code)}`
      : `/?ref=${encodeURIComponent(hubData.referral_code)}`;

  return (
    <div className="mb-7 space-y-4">
      {toast && (
        <div className="p-3 rounded-xl bg-[#141414] border border-[#FF2525]/50 text-[#F5F5F5] text-xs font-semibold flex items-center justify-between gap-2 shadow-xl">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#FF2525] shrink-0" />
            <span>{toast}</span>
          </div>
          <button type="button" onClick={() => setToast(null)} className="text-[#FF2525] text-xs px-1">
            ✕
          </button>
        </div>
      )}

      {/* PART B: Prominent Server-Synced VIP Membership Countdown Card */}
      <VipLiveCountdownCard
        vipExpiresAt={user.vip_expires_at}
        membershipState={user.vip_membership_state || (user.vip_active ? 'active' : 'expired')}
        planName={activePlanLabel}
        isAdminBypass={isAdminBypass}
        onRenewClick={onScrollToRenewal}
      />

      {/* PART C.3: Expired VIP Lock Banner */}
      {isExpiredVip && (
        <div className="rounded-2xl bg-[#FF2525]/10 border border-[#FF2525]/45 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="space-y-0.5">
            <h3 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#FF2525] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#FF2525]" />
              <span>VIP Membership Expired — Read-Only History Mode</span>
            </h3>
            <p className="text-xs text-[#F5F5F5]">
              Your saved study streak ({hubData.streak.longest_streak}d best), badges, and exam history are safely preserved. Renew VIP to unlock interactive VIP tools.
            </p>
          </div>
          <button
            type="button"
            onClick={onScrollToRenewal}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider shrink-0 transition-colors"
          >
            Renew VIP Access
          </button>
        </div>
      )}

      {/* VIP Student Hub Navigation Header */}
      <div className="rounded-xl ra-panel-red border border-[#FF2525]/45 ra-corners-red overflow-hidden">
        <div className="ra-hazard-bar h-1 w-full opacity-80" />
        <div className="p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div>
              <h2 className="font-display text-sm sm:text-base font-extrabold text-[#F5F5F5] uppercase tracking-tight flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FF2525]" />
                <span>VIP Tactical Hub ({enabledTabs.length} Active Modules)</span>
              </h2>
              <p className="text-[11px] text-[#929292]">
                Operator: <strong className="text-[#F5F5F5]">{user.email.split('@')[0]}</strong> · Select any VIP module below
              </p>
            </div>

            {validSupportUrl && (
              <button
                type="button"
                onClick={() => window.open(validSupportUrl, '_blank', 'noopener,noreferrer')}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#090909] hover:bg-[#1D1D1D] border border-[#FF2525]/45 text-[#FF2525] font-display font-bold text-[11px] uppercase inline-flex items-center gap-1.5 transition-colors"
              >
                <LifeBuoy className="w-3.5 h-3.5" />
                <span>{settings?.support_title || 'Support'}</span>
              </button>
            )}
          </div>

          {/* Horizontal Scrollable 14-Feature Navigation Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-scrollbar">
            {enabledTabs.map((tab, idx) => {
              const Icon = tab.icon;
              const active = activeFeature === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveFeature(tab.key)}
                  className={`min-h-[38px] px-3 py-2 rounded-lg font-display font-bold text-[11px] whitespace-nowrap flex items-center gap-1.5 transition-all shrink-0 border ${
                    active
                      ? 'bg-[#FF2525] text-[#F5F5F5] border-[#FF2525] shadow-[0_0_16px_rgba(255,37,37,0.3)]'
                      : 'bg-[#090909] text-[#C5C5C5] border-[#454545] hover:text-[#F5F5F5] hover:border-[#FF2525]/55'
                  }`}
                >
                  <span className="text-[10px] opacity-75 font-mono-tech">{idx + 1}.</span>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 1. VIP DASHBOARD OVERVIEW */}
      {activeFeature === 'vip_dashboard' && isFeatureEnabled('vip_dashboard') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-[10px] font-mono-tech uppercase text-[#929292] block">Daily Streak</span>
              <span className="text-lg font-display font-extrabold font-mono-tech text-[#FF762E] flex items-center gap-1 mt-0.5">
                <Flame className="w-4 h-4 text-[#FF762E]" />
                {hubData.streak.current_streak} Days
              </span>
              <span className="text-[10px] text-[#929292]/75">Best: {hubData.streak.longest_streak}d (IST)</span>
            </div>

            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-[10px] font-mono-tech uppercase text-[#929292] block">Platforms Available</span>
              <span className="text-lg font-display font-extrabold font-mono-tech text-[#FF2525] mt-0.5 block">
                {hubData.total_platforms} Total
              </span>
              <span className="text-[10px] text-[#929292]/75">
                {hubData.vip_platforms_count} VIP Exclusive · {totalPlatformOpens} Opens
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-[10px] font-mono-tech uppercase text-[#929292] block">Upcoming Exams</span>
              <span className="text-lg font-display font-extrabold font-mono-tech text-[#F5F5F5] mt-0.5 block">
                {upcomingExamsWithDays.filter((e) => e.daysLeft >= 0).length} Scheduled
              </span>
              <span className="text-[10px] text-[#929292]/75">
                {urgentExamReminders.length} within 30 days
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-[10px] font-mono-tech uppercase text-[#929292] block">Badges Earned</span>
              <span className="text-lg font-display font-extrabold font-mono-tech text-[#FF2525] mt-0.5 block">
                {hubData.achievements.filter((a) => a.unlocked).length} / {hubData.achievements.length}
              </span>
              <span className="text-[10px] text-[#929292]/75">
                {completedIds.size} Resources Done
              </span>
            </div>
          </div>

          {/* Quick Actions & Recent Activity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#FF762E]">
                  Today&apos;s Study Streak (IST)
                </h4>
                <span className="text-[10px] font-mono-tech text-[#929292]">
                  Last: {hubData.streak.last_study_date_ist || 'Not yet today'}
                </span>
              </div>
              <p className="text-[11px] text-[#929292] leading-relaxed">
                Launching any study platform on Home or checking in below records your verified daily study activity in IST.
              </p>
              <button
                type="button"
                onClick={handleStreakCheckIn}
                disabled={checkingInStreak || isExpiredVip}
                className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>
                  {isExpiredVip
                    ? 'Renew VIP to Record Streak'
                    : checkingInStreak
                    ? 'Recording...'
                    : 'Record Today’s Study Check-In'}
                </span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-2">
              <h4 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#FF2525]">
                Next Upcoming Exam
              </h4>
              {upcomingExamsWithDays.filter((e) => e.daysLeft >= 0).length === 0 ? (
                <p className="text-xs text-[#929292]">No upcoming exams added yet.</p>
              ) : (
                (() => {
                  const nextEx = upcomingExamsWithDays.filter((e) => e.daysLeft >= 0)[0];
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#F5F5F5]">{nextEx.exam_name}</span>
                        <span className="px-2 py-0.5 rounded bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/35 font-mono-tech font-bold text-[10px]">
                          {nextEx.daysLeft === 0 ? 'Today!' : `${nextEx.daysLeft} Days Left`}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#929292]">
                        Subject: {nextEx.subject} · Date: {new Date(nextEx.exam_date).toLocaleDateString()}
                      </p>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* All Enabled VIP Features Directory Grid */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="font-mono-tech text-[11px] font-bold uppercase tracking-wider text-[#929292]">
                All VIP Student Features (Ordered by Priority)
              </h4>
              <span className="text-[10px] font-mono-tech text-[#FF2525]">
                Tap any card to open
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {enabledTabs.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActiveFeature(item.key)}
                    className="p-3.5 rounded-xl bg-[#090909] hover:bg-[#1D1D1D] border border-[#454545] hover:border-[#FF2525]/45 text-left transition-all flex items-start gap-3 group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#141414] border border-[#FF762E]/35 flex items-center justify-center text-[#FF762E] shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs font-extrabold text-[#F5F5F5] group-hover:text-[#FF2525] transition-colors truncate">
                          {index + 1}. {item.label}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-[#929292] group-hover:text-[#FF2525] shrink-0" />
                      </div>
                      <p className="text-[11px] text-[#929292] line-clamp-2 mt-0.5 leading-relaxed">
                        {item.shortDesc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. DAILY STUDY STREAK */}
      {activeFeature === 'daily_study_streak' && isFeatureEnabled('daily_study_streak') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
                <Flame className="w-4 h-4 text-[#FF762E]" />
                <span>Daily Study Streak System (IST Verified)</span>
              </h3>
              <p className="text-[11px] text-[#929292] mt-0.5">
                Streaks increment once per IST calendar day upon verified platform launch or study check-in.
              </p>
            </div>
            <button
              type="button"
              onClick={handleStreakCheckIn}
              disabled={checkingInStreak || isExpiredVip}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>{isExpiredVip ? 'VIP Required' : 'Verify Study Today'}</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-xl font-display font-extrabold font-mono-tech text-[#FF762E]">{hubData.streak.current_streak}</span>
              <span className="text-[10px] font-mono-tech text-[#929292] block uppercase mt-0.5">Current Streak</span>
            </div>
            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-xl font-display font-extrabold font-mono-tech text-[#FF2525]">{hubData.streak.longest_streak}</span>
              <span className="text-[10px] font-mono-tech text-[#929292] block uppercase mt-0.5">Longest Streak</span>
            </div>
            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-xl font-display font-extrabold font-mono-tech text-[#F5F5F5]">{hubData.streak.active_dates_ist.length}</span>
              <span className="text-[10px] font-mono-tech text-[#929292] block uppercase mt-0.5">Total Active Days</span>
            </div>
          </div>

          {/* 7-Day & 30-Day Milestones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              className={`p-3 rounded-xl border flex items-center justify-between ${
                milestone7Unlocked
                  ? 'bg-[#FF2525]/10 border-[#FF2525]/40 text-[#F5F5F5]'
                  : 'bg-[#090909] border-[#454545] text-[#929292]'
              }`}
            >
              <div>
                <span className="text-xs font-extrabold block">7-Day Consistency Warrior</span>
                <span className="text-[11px] opacity-80">Study 7 consecutive days</span>
              </div>
              <span className="text-[10px] font-mono-tech font-bold uppercase px-2.5 py-1 rounded bg-[#090909] border border-[#454545] text-[#FF2525]">
                {milestone7Unlocked ? 'Unlocked' : `${Math.min(7, hubData.streak.current_streak)}/7`}
              </span>
            </div>

            <div
              className={`p-3 rounded-xl border flex items-center justify-between ${
                milestone30Unlocked
                  ? 'bg-[#FF762E]/12 border-[#FF762E]/40 text-[#F5F5F5]'
                  : 'bg-[#090909] border-[#454545] text-[#929292]'
              }`}
            >
              <div>
                <span className="text-xs font-extrabold block">30-Day Unstoppable Scholar</span>
                <span className="text-[11px] opacity-80">Study 30 consecutive days</span>
              </div>
              <span className="text-[10px] font-mono-tech font-bold uppercase px-2.5 py-1 rounded bg-[#090909] border border-[#454545] text-[#FF762E]">
                {milestone30Unlocked ? 'Unlocked' : `${Math.min(30, hubData.streak.current_streak)}/30`}
              </span>
            </div>
          </div>

          {/* Recent Verified IST Dates */}
          <div className="p-3.5 rounded-xl bg-[#090909] border border-[#454545]">
            <span className="text-[11px] font-mono-tech uppercase text-[#929292] block mb-2">
              Verified Activity History (IST Dates)
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {hubData.streak.active_dates_ist.length === 0 ? (
                <span className="text-xs text-[#929292]/70">No study days recorded yet.</span>
              ) : (
                hubData.streak.active_dates_ist.slice(-14).map((dt) => (
                  <span
                    key={dt}
                    className="px-2.5 py-1 rounded-lg bg-[#FF2525]/12 border border-[#FF2525]/35 text-[#FF2525] font-mono-tech text-[10px] font-bold"
                  >
                    ✓ {dt}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. EXAM COUNTER */}
      {activeFeature === 'exam_counter' && isFeatureEnabled('exam_counter') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
          <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#FF2525]" />
            <span>Official & Personal Exam Countdown Tracker</span>
          </h3>

          <div className="space-y-2.5">
            {upcomingExamsWithDays.map((ex) => {
              const isGlobal = ex.scope === 'global';
              return (
                <div
                  key={ex.id}
                  className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-[#F5F5F5]">{ex.exam_name}</span>
                      <span
                        className={`text-[10px] font-mono-tech font-bold px-2 py-0.5 rounded uppercase border ${
                          isGlobal
                            ? 'bg-[#FF762E]/12 text-[#FF762E] border-[#FF762E]/35'
                            : 'bg-[#FF2525]/12 text-[#FF2525] border-[#FF2525]/35'
                        }`}
                      >
                        {isGlobal ? 'Admin Official Exam' : 'Personal Exam'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#929292] mt-0.5">
                      Subject: {ex.subject} · Date: {new Date(ex.exam_date).toLocaleDateString()}
                      {ex.target_score ? ` · Target: ${ex.target_score}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 rounded-lg font-mono-tech font-bold text-xs border ${
                        ex.daysLeft < 0
                          ? 'bg-[#141414] text-[#929292] border-[#454545]'
                          : ex.daysLeft <= 7
                          ? 'bg-[#FF2525]/12 text-[#FF2525] border-[#FF2525]/35'
                          : 'bg-[#FF762E]/12 text-[#FF762E] border-[#FF762E]/35'
                      }`}
                    >
                      {ex.daysLeft < 0 ? 'Completed' : ex.daysLeft === 0 ? 'Today!' : `${ex.daysLeft}d left`}
                    </span>
                    {!isGlobal && !isExpiredVip && (
                      <button
                        type="button"
                        onClick={() => handleDeleteExam(ex.id)}
                        aria-label="Delete exam"
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg bg-[#FF2525]/12 hover:bg-[#FF2525]/25 border border-[#FF2525]/35 text-[#FF2525]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Personal Exam Form */}
          {!isExpiredVip && (
            <form onSubmit={handleAddExam} className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-3">
              <h4 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#FF2525]">
                + Add Personal Target Exam
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Exam Title (e.g. Mock Test 4 / Half Yearly)"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5] placeholder-[#929292]/45"
                />
                <input
                  type="text"
                  placeholder="Subject (e.g. Physics / Full Syllabus)"
                  value={examSubject}
                  onChange={(e) => setExamSubject(e.target.value)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5] placeholder-[#929292]/45"
                />
                <input
                  type="date"
                  required
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5]"
                />
                <input
                  type="text"
                  placeholder="Target Score / Rank (Optional)"
                  value={examTarget}
                  onChange={(e) => setExamTarget(e.target.value)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5] placeholder-[#929292]/45"
                />
              </div>
              <button
                type="submit"
                disabled={addingExam}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-[#F5F5F5] font-display font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addingExam ? 'Saving...' : 'Save Personal Exam'}</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* 4. STUDY ANALYTICS */}
      {activeFeature === 'study_analytics' && isFeatureEnabled('study_analytics') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#FF2525]" />
              <span>Verified Study Activity & Self-Reported Targets</span>
            </h3>
            <p className="text-[11px] text-[#929292] mt-0.5">
              Measured metrics come from actual platform launches, completed library resources, & mock test submissions. Timetable sessions are tracked separately as self-reported study goals.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-[10px] font-mono-tech uppercase text-[#FF2525] block">
                Measured: Platform Opens
              </span>
              <span className="text-xl font-display font-extrabold font-mono-tech text-[#F5F5F5] mt-0.5 block">
                {totalPlatformOpens}
              </span>
              <span className="text-[10px] text-[#929292]">
                Across {uniquePlatformsCount} unique platforms
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-[10px] font-mono-tech uppercase text-[#F5F5F5] block">
                Measured: Mock Tests
              </span>
              <span className="text-xl font-display font-extrabold font-mono-tech text-[#FF2525] mt-0.5 block">
                {hubData.mock_attempts.length} Taken
              </span>
              <span className="text-[10px] text-[#929292]">
                Avg Score: {avgMockScore}%
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#090909] border border-[#454545]">
              <span className="text-[10px] font-mono-tech uppercase text-[#FF762E] block">
                Self-Reported: Timetable
              </span>
              <span className="text-xl font-display font-extrabold font-mono-tech text-[#F5F5F5] mt-0.5 block">
                {completedTimetableSlotsCount} / {hubData.timetable.length} Slots
              </span>
              <span className="text-[10px] text-[#929292]">Completed study tasks</span>
            </div>
          </div>

          {/* Recent Verified Platform Launches */}
          <div className="p-4 rounded-xl bg-[#090909] border border-[#454545] space-y-2">
            <span className="font-mono-tech text-[11px] uppercase text-[#929292] block">
              Recent Verified Platform Launches
            </span>
            {hubData.recent_platform_opens.length === 0 ? (
              <p className="text-xs text-[#929292]/70">
                No platform opens recorded yet. Open any platform on Home to log verified study activity.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {hubData.recent_platform_opens.slice(0, 10).map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-lg bg-[#141414] border border-[#454545] flex items-center justify-between text-xs gap-2"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-[#F5F5F5]">{log.platform_name}</span>
                      <span className="text-[10px] text-[#929292] ml-2">({log.category})</span>
                    </div>
                    <span className="text-[10px] font-mono-tech text-[#929292] shrink-0">
                      {new Date(log.opened_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. ACHIEVEMENTS & REWARDS */}
      {activeFeature === 'achievements_rewards' && isFeatureEnabled('achievements_rewards') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
            <Award className="w-4 h-4 text-[#FF762E]" />
            <span>VIP Student Achievements & Milestone Badges</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hubData.achievements.map((ach) => (
              <div
                key={ach.id}
                className={`p-3.5 rounded-xl border space-y-2 ${
                  ach.unlocked
                    ? 'bg-[#FF2525]/10 border-[#FF2525]/40'
                    : 'bg-[#090909] border-[#454545] opacity-80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#F5F5F5]">{ach.title}</span>
                  <span
                    className={`text-[10px] font-mono-tech font-bold px-2 py-0.5 rounded uppercase border ${
                      ach.unlocked
                        ? 'bg-[#FF2525]/15 text-[#FF2525] border-[#FF2525]/40'
                        : 'bg-[#141414] text-[#929292] border-[#454545]'
                    }`}
                  >
                    {ach.unlocked ? 'Unlocked ✓' : ach.progress_text}
                  </span>
                </div>
                <p className="text-[11px] text-[#929292]">{ach.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. LEARNING LIBRARY & 14. EXCLUSIVE RESOURCES */}
      {(activeFeature === 'learning_library' || activeFeature === 'exclusive_resources') &&
        isFeatureEnabled(activeFeature) && (
          <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
            <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#FF762E]" />
              <span>
                {activeFeature === 'exclusive_resources'
                  ? 'VIP Exclusive Vault (Topper Notes, Formula Books & Checklists)'
                  : 'VIP Learning Library (Notes, Syllabus Guides & Practice Sets)'}
              </span>
            </h3>

            <div className="space-y-3">
              {(activeFeature === 'exclusive_resources'
                ? hubData.exclusive_resources
                : hubData.learning_library
              ).map((res) => {
                const isBookmarked = bookmarkedIds.has(res.id);
                const isCompleted = completedIds.has(res.id);
                const isExpanded = selectedResourceId === res.id;

                return (
                  <div
                    key={res.id}
                    className="p-4 rounded-xl bg-[#090909] border border-[#454545] space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono-tech font-bold uppercase px-2 py-0.5 rounded bg-[#FF762E]/12 text-[#FF762E] border border-[#FF762E]/30">
                            {res.subject}
                          </span>
                          <span className="text-[10px] font-mono-tech uppercase px-2 py-0.5 rounded bg-[#141414] text-[#929292] border border-[#454545]">
                            {res.category}
                          </span>
                          {res.badge_text && (
                            <span className="text-[10px] font-mono-tech font-bold px-2 py-0.5 rounded bg-[#141414] text-[#F5F5F5] border border-[#454545]">
                              {res.badge_text}
                            </span>
                          )}
                          {isCompleted && (
                            <span className="text-[10px] font-mono-tech font-bold px-2 py-0.5 rounded bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/35">
                              Completed ✓
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-[#F5F5F5] mt-1.5">{res.title}</h4>
                        <p className="text-[11px] text-[#929292] mt-0.5">{res.description}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleResourceAction(res.id, 'bookmark')}
                          className={`min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border text-xs ${
                            isBookmarked
                              ? 'bg-[#FF762E]/15 border-[#FF762E]/45 text-[#FF762E]'
                              : 'bg-[#141414] border-[#454545] text-[#929292]'
                          }`}
                          title="Bookmark"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResourceAction(res.id, 'complete')}
                          className={`min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border text-xs ${
                            isCompleted
                              ? 'bg-[#FF2525]/15 border-[#FF2525]/45 text-[#FF2525]'
                              : 'bg-[#141414] border-[#454545] text-[#929292]'
                          }`}
                          title="Mark Completed"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedResourceId(isExpanded ? null : res.id)}
                        className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] border border-[#454545] text-[#F5F5F5] font-semibold text-[11px]"
                      >
                        {isExpanded ? 'Hide Resource Details' : 'View Resource Details'}
                      </button>
                      {!isExpiredVip && res.content_url ? (
                        <a
                          href={res.content_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#FF2525] hover:bg-[#C90000] text-[#F5F5F5] font-display font-bold text-[11px] uppercase inline-flex items-center gap-1"
                        >
                          <span>Open Study Material</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : isExpiredVip ? (
                        <button
                          type="button"
                          onClick={onScrollToRenewal}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#FF2525]/12 border border-[#FF2525]/40 text-[#FF2525] font-bold text-[11px] inline-flex items-center gap-1"
                        >
                          <Lock className="w-3 h-3" />
                          <span>Renew VIP to Open Material</span>
                        </button>
                      ) : null}
                    </div>

                    {isExpanded && (
                      <div className="mt-2 p-3.5 rounded-xl bg-[#141414] border border-[#454545] text-xs text-[#929292] space-y-1">
                        <div>
                          <strong className="text-[#FF762E]">Exam Focus:</strong> {res.exam_type}
                        </div>
                        <div>
                          <strong className="text-[#FF762E]">Summary:</strong> {res.description}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* 7. VIP MEMBERSHIP CENTER */}
      {activeFeature === 'vip_membership_center' && isFeatureEnabled('vip_membership_center') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
          <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#FF762E]" />
            <span>VIP Membership Security & Renewal Center</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-1">
              <span className="text-[10px] font-mono-tech uppercase text-[#929292]">Membership Status</span>
              <p className="font-display text-sm font-extrabold text-[#FF2525] uppercase">
                {user.vip_membership_state || (user.vip_active ? 'active' : 'expired')}
              </p>
              <p className="text-[11px] text-[#929292]">
                Expires: {user.vip_expires_at ? new Date(user.vip_expires_at).toLocaleString() : 'Unlimited'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-1">
              <span className="text-[10px] font-mono-tech uppercase text-[#929292]">Single-Device Lock</span>
              <p className="font-display text-sm font-extrabold text-[#FF762E]">
                {user.vip_device_label || 'Bound to Current Device'}
              </p>
              <p className="text-[11px] text-[#929292]">
                Protected by hardware-fingerprint + cookie binding
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#090909] border border-[#FF762E]/35 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-[#929292]">
              <strong className="text-[#FF762E] block">24-Hour Grace Period Protection</strong>
              If your VIP plan expires, {settings?.app_name || 'STUDY BLUNDER'} preserves your study streak and VIP hub access for a 24-hour renewal grace period.
            </div>
            <button
              type="button"
              onClick={onScrollToRenewal}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider shrink-0 transition-colors"
            >
              Renew / Extend VIP Plan
            </button>
          </div>
        </div>
      )}

      {/* 8. VIP ANNOUNCEMENTS */}
      {activeFeature === 'vip_announcements' && isFeatureEnabled('vip_announcements') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[#FF762E]" />
            <span>VIP Exclusive Announcements & Study Alerts</span>
          </h3>
          {hubData.vip_announcements.length === 0 ? (
            <p className="text-xs text-[#929292]">No VIP-specific announcements published right now.</p>
          ) : (
            hubData.vip_announcements.map((ann) => (
              <div key={ann.id} className="p-4 rounded-xl bg-[#090909] border border-[#FF762E]/35 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#FF762E]">{ann.title}</span>
                  <span className="text-[10px] font-mono-tech font-bold uppercase px-2 py-0.5 rounded bg-[#FF762E]/12 text-[#FF762E] border border-[#FF762E]/30">
                    {ann.category}
                  </span>
                </div>
                <p className="text-xs text-[#929292] leading-relaxed">{ann.content}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* 9. STUDY TIMETABLE */}
      {activeFeature === 'study_timetable' && isFeatureEnabled('study_timetable') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
          <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#FF2525]" />
            <span>Personal Study Timetable & Daily Goal Tracker</span>
          </h3>

          <div className="space-y-2">
            {hubData.timetable.length === 0 ? (
              <p className="text-xs text-[#929292]">No study slots added yet. Create your schedule below.</p>
            ) : (
              hubData.timetable.map((slot) => (
                <div
                  key={slot.id}
                  className="p-3 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      disabled={isExpiredVip}
                      onClick={() => handleToggleTimetableComplete(slot)}
                      aria-label="Toggle slot completion"
                      className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                        slot.is_completed
                          ? 'bg-[#FF2525] border-[#FF2525] text-[#090909]'
                          : 'border-[#454545] bg-[#141414] text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </button>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#F5F5F5] block truncate">
                        [{slot.day_of_week}] <span className="font-mono-tech">{slot.start_time} – {slot.end_time}</span> · {slot.subject}
                      </span>
                      <span className="text-[11px] text-[#929292] block truncate">
                        Topic: {slot.topic} · Priority: {slot.priority}
                      </span>
                    </div>
                  </div>
                  {!isExpiredVip && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTimetable(slot.id)}
                      aria-label="Delete timetable slot"
                      className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg bg-[#FF2525]/12 border border-[#FF2525]/35 text-[#FF2525]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {!isExpiredVip && (
            <form onSubmit={handleAddTimetable} className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-3">
              <h4 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#FF2525]">
                + Add Study Timetable Slot
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <select
                  value={ttDay}
                  onChange={(e) => setTtDay(e.target.value as StudyTimetableItem['day_of_week'])}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5]"
                >
                  {['Daily', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={ttStart}
                  onChange={(e) => setTtStart(e.target.value)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5]"
                />
                <input
                  type="time"
                  value={ttEnd}
                  onChange={(e) => setTtEnd(e.target.value)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5]"
                />
                <input
                  type="text"
                  required
                  placeholder="Subject (e.g. Organic Chem)"
                  value={ttSubject}
                  onChange={(e) => setTtSubject(e.target.value)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5] placeholder-[#929292]/45"
                />
                <input
                  type="text"
                  required
                  placeholder="Topic / Chapter"
                  value={ttTopic}
                  onChange={(e) => setTtTopic(e.target.value)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5] placeholder-[#929292]/45"
                />
                <select
                  value={ttPriority}
                  onChange={(e) => setTtPriority(e.target.value as StudyTimetableItem['priority'])}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5]"
                >
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={addingTimetable}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-[#F5F5F5] font-display font-extrabold text-xs uppercase tracking-wider transition-colors"
              >
                {addingTimetable ? 'Adding...' : 'Add to Timetable'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* 10. EXAM REMINDERS */}
      {activeFeature === 'exam_reminders' && isFeatureEnabled('exam_reminders') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[#FF2525]" />
            <span>Smart Exam Alert & Revision Milestones (Next 30 Days)</span>
          </h3>
          {urgentExamReminders.length === 0 ? (
            <p className="text-xs text-[#929292]">
              No exams falling within the next 30 days. Add personal exams in the Exam Counter tab to receive automated 30d, 15d, 7d, 3d, and 1d alerts.
            </p>
          ) : (
            urgentExamReminders.map((ex) => (
              <div
                key={ex.id}
                className="p-3.5 rounded-xl bg-[#FF2525]/10 border border-[#FF2525]/40 flex items-center justify-between gap-2"
              >
                <div>
                  <span className="text-xs font-extrabold text-[#F5F5F5]">{ex.exam_name}</span>
                  <p className="text-[11px] text-[#929292] mt-0.5">
                    Priority Revision Window Active · Exam Date: {new Date(ex.exam_date).toLocaleDateString()}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-[#FF2525] text-[#090909] font-mono-tech font-extrabold text-xs shrink-0">
                  {ex.daysLeft === 0 ? 'TODAY' : `${ex.daysLeft} Days`}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* 11. VIP MOCK TESTS */}
      {activeFeature === 'vip_mock_tests' && isFeatureEnabled('vip_mock_tests') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
          <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-[#FF2525]" />
            <span>VIP Practice Mock Tests & Instant Evaluation</span>
          </h3>

          {!activeTest ? (
            <div className="space-y-3">
              {hubData.mock_tests.map((test) => {
                const attemptsForTest = hubData.mock_attempts.filter((a) => a.test_id === test.id);
                const bestScore =
                  attemptsForTest.length > 0 ? Math.max(...attemptsForTest.map((a) => a.percentage)) : null;

                return (
                  <div
                    key={test.id}
                    className="p-4 rounded-xl bg-[#090909] border border-[#454545] flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div>
                      <span className="text-[10px] font-mono-tech font-bold uppercase px-2 py-0.5 rounded bg-[#FF762E]/12 text-[#FF762E] border border-[#FF762E]/30">
                        {test.subject} · {test.duration_minutes} Mins
                      </span>
                      <h4 className="text-sm font-extrabold text-[#F5F5F5] mt-1">{test.title}</h4>
                      <p className="text-[11px] text-[#929292]">
                        {test.questions.length} High-Yield MCQs · {test.exam_category}
                        {bestScore !== null ? ` · Best Score: ${bestScore}%` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStartMockTest(test)}
                      disabled={isExpiredVip}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-[#F5F5F5] font-display font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isExpiredVip ? 'VIP Required' : 'Start Test'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#090909] border border-[#FF2525]/40 space-y-4">
              <div className="flex items-center justify-between border-b border-[#454545] pb-2.5">
                <h4 className="font-display text-xs sm:text-sm font-extrabold text-[#F5F5F5] uppercase">
                  {activeTest.title}
                </h4>
                <button
                  type="button"
                  onClick={() => setActiveTest(null)}
                  className="text-xs text-[#929292] hover:text-[#F5F5F5]"
                >
                  ← Back to Tests
                </button>
              </div>

              <div className="space-y-4">
                {activeTest.questions.map((q, qIdx) => (
                  <div key={q.id} className="p-3.5 rounded-xl bg-[#141414] border border-[#454545] space-y-2">
                    <p className="text-xs font-bold text-[#F5F5F5]">
                      Q{qIdx + 1}. {q.question}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.options.map((opt, optIdx) => {
                        const selected = testAnswers[qIdx] === optIdx;
                        const showAnswer = Boolean(lastAttemptResult);
                        const isCorrect = q.correct_index === optIdx;
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            disabled={Boolean(lastAttemptResult)}
                            onClick={() => {
                              const copy = [...testAnswers];
                              copy[qIdx] = optIdx;
                              setTestAnswers(copy);
                            }}
                            className={`min-h-[40px] p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                              showAnswer
                                ? isCorrect
                                  ? 'bg-[#FF2525]/15 border-[#FF2525] text-[#FF2525]'
                                  : selected
                                  ? 'bg-[#FF2525]/15 border-[#FF2525] text-[#FF2525]'
                                  : 'bg-[#090909] border-[#454545] text-[#929292]'
                                : selected
                                ? 'bg-[#FF2525]/15 border-[#FF2525] text-[#F5F5F5]'
                                : 'bg-[#090909] border-[#454545] text-[#929292] hover:text-[#F5F5F5] hover:border-[#929292]/40'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    {lastAttemptResult && (
                      <p className="text-[11px] text-[#FF762E] pt-1">
                        Explanation: {q.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {!lastAttemptResult ? (
                <button
                  type="button"
                  onClick={handleSubmitMockTest}
                  disabled={submittingTest}
                  className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-[#F5F5F5] font-display font-extrabold text-xs uppercase tracking-wider transition-colors"
                >
                  {submittingTest ? 'Submitting & Evaluating...' : 'Submit Mock Test'}
                </button>
              ) : (
                <div className="p-3.5 rounded-xl bg-[#FF2525]/12 border border-[#FF2525]/40 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-mono-tech font-extrabold text-[#FF2525] block">
                      Score: {lastAttemptResult.score} / {lastAttemptResult.total_questions} ({lastAttemptResult.percentage}%)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTest(null)}
                    className="min-h-[34px] px-3 py-1.5 rounded-lg bg-[#141414] border border-[#454545] text-[#F5F5F5] text-xs font-bold"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 12. PRIORITY SUPPORT */}
      {activeFeature === 'priority_support' && isFeatureEnabled('priority_support') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
              <Headphones className="w-4 h-4 text-[#FF762E]" />
              <span>VIP Fast-Track Priority Support Desk</span>
            </h3>
            {validSupportUrl && (
              <button
                type="button"
                onClick={() => window.open(validSupportUrl, '_blank', 'noopener,noreferrer')}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#090909] border border-[#FF2525]/40 text-[#FF2525] font-display font-bold text-[11px] uppercase inline-flex items-center gap-1.5"
              >
                <LifeBuoy className="w-3.5 h-3.5" />
                <span>Direct {settings?.support_title || 'Support'} Channel</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          {!isExpiredVip && (
            <form onSubmit={handleCreateTicket} className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Ticket Subject"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5] placeholder-[#929292]/45"
                />
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value as PrioritySupportTicket['category'])}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5]"
                >
                  <option value="General Study Help">General Study Help</option>
                  <option value="Platform Access">Batch / Platform Access</option>
                  <option value="VIP Membership">VIP Membership</option>
                  <option value="Payment Help">Payment Help</option>
                  <option value="Technical Issue">Technical Issue</option>
                </select>
              </div>
              <textarea
                rows={2}
                required
                placeholder="Describe how our team can help you..."
                value={ticketMessage}
                onChange={(e) => setTicketMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5] placeholder-[#929292]/45"
              />
              <button
                type="submit"
                disabled={creatingTicket}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider transition-colors"
              >
                {creatingTicket ? 'Submitting...' : 'Open Priority VIP Ticket'}
              </button>
            </form>
          )}

          <div className="space-y-2.5">
            {hubData.support_tickets.map((t) => (
              <div key={t.id} className="p-3.5 rounded-xl bg-[#090909] border border-[#454545] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[#F5F5F5]">
                    {t.subject} <span className="font-mono-tech text-[#929292]">({t.ticket_code})</span>
                  </span>
                  <span className="text-[10px] font-mono-tech font-bold uppercase px-2 py-0.5 rounded bg-[#FF762E]/12 text-[#FF762E] border border-[#FF762E]/30">
                    {t.status}
                  </span>
                </div>
                <p className="text-xs text-[#929292] bg-[#141414] p-2.5 rounded-xl border border-[#454545]">
                  {t.message}
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {t.replies.map((m) => (
                    <div
                      key={m.id}
                      className={`p-2.5 rounded-xl text-[11px] border ${
                        m.sender_role !== 'student'
                          ? 'bg-[#FF2525]/10 border-[#FF2525]/35 text-[#F5F5F5]'
                          : 'bg-[#141414] border-[#454545] text-[#929292]'
                      }`}
                    >
                      <strong className="block text-[10px] font-mono-tech uppercase text-[#FF2525] mb-0.5">
                        {m.sender_role !== 'student' ? 'Admin Support' : 'You'}
                      </strong>
                      {m.message}
                    </div>
                  ))}
                </div>
                {t.status !== 'Resolved' && t.status !== 'Closed' && !isExpiredVip && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Reply to support..."
                      value={replyTextMap[t.id] || ''}
                      onChange={(e) => setReplyTextMap((prev) => ({ ...prev, [t.id]: e.target.value }))}
                      className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-[#141414] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5]"
                    />
                    <button
                      type="button"
                      onClick={() => handleReplyTicket(t.id)}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-[#F5F5F5] text-xs font-display font-extrabold uppercase inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>Send</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 13. VIP REFERRAL REWARDS */}
      {activeFeature === 'vip_referral_rewards' && isFeatureEnabled('vip_referral_rewards') && (
        <div className="rounded-xl ra-panel border border-[#454545] p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-display text-sm font-extrabold text-[#F5F5F5] uppercase flex items-center gap-2">
                <Gift className="w-4 h-4 text-[#FF2525]" />
                <span>VIP Referral Rewards & Sales Attribution</span>
              </h3>
              <p className="text-[11px] text-[#929292] mt-0.5">
                Earn +7 Bonus VIP Days for every referred student whose VIP payment is verified by Admin.
              </p>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono-tech font-bold uppercase border ${
                referralProgramOn
                  ? 'bg-[#FF2525]/12 border-[#FF2525]/35 text-[#FF2525]'
                  : 'bg-[#FF762E]/12 border-[#FF762E]/35 text-[#FF762E]'
              }`}
            >
              {referralProgramOn ? 'Referral Program: ON' : 'Referral Program: OFF'}
            </span>
          </div>

          {!referralProgramOn && (
            <div className="p-3.5 rounded-xl bg-[#FF762E]/10 border border-[#FF762E]/40 text-[#F5F5F5] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#FF762E] shrink-0" />
              <span>
                Referral Program is currently OFF. New referral attribution is paused, but your existing referral history and rewards remain preserved below.
              </span>
            </div>
          )}

          {referralPerms && !referralPerms.can_access_referral_dashboard ? (
            <div className="p-4 rounded-xl bg-[#090909] border border-[#454545] text-center text-xs text-[#929292]">
              Referral dashboard access is currently restricted for your account by Super Admin.
            </div>
          ) : (
            <>
              {/* Referral Code & Shareable Link Card */}
              {(!referralPerms || referralPerms.can_create_share_referral_link) && (
                <div className="p-4 rounded-xl bg-[#090909] border border-[#FF762E]/40 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <span className="text-[10px] font-mono-tech uppercase text-[#929292] block">
                        Your Unique Referral Code
                      </span>
                      <span className="text-lg font-mono-tech font-extrabold text-[#FF762E]">
                        {hubData.referral_code || 'RESTRICTED'}
                      </span>
                      <span className="text-[11px] text-[#929292] block mt-0.5">
                        Total Bonus Earned: <strong className="text-[#FF2525] font-mono-tech">+{totalBonusReferralDays} VIP Days</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(hubData.referral_code);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 3000);
                        }}
                        className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#FF762E] hover:bg-[#ff8a4c] text-[#090909] font-display font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-1.5"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCode ? 'Copied Code!' : 'Copy Code'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(shareableReferralUrl);
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 3000);
                        }}
                        className="min-h-[38px] px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-[#F5F5F5] font-display font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-1.5"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'Copied Link!' : 'Copy Invite Link'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#141414] border border-[#454545] text-[11px] text-[#929292] font-mono-tech truncate">
                    Invite Link: <span className="text-[#F5F5F5]">{shareableReferralUrl}</span>
                  </div>
                </div>
              )}

              {/* Individual Referrer Sales & Conversion Summary */}
              {hubData.referral_sales_summary && (!referralPerms || referralPerms.can_view_referral_sales) && (
                <div className="p-4 rounded-xl bg-[#090909] border border-[#454545] space-y-3">
                  <h4 className="font-display text-xs font-extrabold uppercase tracking-wider text-[#FF2525] flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" />
                    <span>Your Referral VIP Sales & Conversion Summary</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                    <div className="p-2.5 rounded-xl bg-[#141414] border border-[#454545]">
                      <span className="text-base font-display font-extrabold font-mono-tech text-[#F5F5F5] block">
                        {hubData.referral_sales_summary.total_referrals}
                      </span>
                      <span className="text-[10px] font-mono-tech text-[#929292] uppercase">Total Referrals</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#141414] border border-[#454545]">
                      <span className="text-base font-display font-extrabold font-mono-tech text-[#FF2525] block">
                        {hubData.referral_sales_summary.vip_purchases_count}
                      </span>
                      <span className="text-[10px] font-mono-tech text-[#929292] uppercase">Approved VIP Sales</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#141414] border border-[#454545]">
                      <span className="text-base font-display font-extrabold font-mono-tech text-[#929292] block">
                        {hubData.referral_sales_summary.non_purchasing_referrals_count}
                      </span>
                      <span className="text-[10px] font-mono-tech text-[#929292] uppercase">Non-Purchasing</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#141414] border border-[#454545]">
                      <span className="text-base font-display font-extrabold font-mono-tech text-[#FF762E] block">
                        ₹{hubData.referral_sales_summary.verified_net_sales_inr}
                      </span>
                      <span className="text-[10px] font-mono-tech text-[#929292] uppercase">Net VIP Sales</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[#929292] pt-1 border-t border-[#454545] flex-wrap gap-2">
                    <span>
                      Gross Plan Value: <strong className="text-[#F5F5F5] font-mono-tech">₹{hubData.referral_sales_summary.verified_gross_sales_inr}</strong>
                    </span>
                    <span>
                      Referral Discounts Given: <strong className="text-[#FF2525] font-mono-tech">-₹{hubData.referral_sales_summary.total_discounts_given_inr}</strong>
                    </span>
                    <span>
                      Net Collected: <strong className="text-[#FF762E] font-mono-tech">₹{hubData.referral_sales_summary.verified_net_sales_inr}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Referred Friends & Purchase Attribution List */}
              {(!referralPerms || referralPerms.can_view_own_referral_data) && (
                <div className="p-4 rounded-xl bg-[#090909] border border-[#454545] space-y-2.5">
                  <span className="font-mono-tech text-[11px] uppercase text-[#929292] block">
                    Your Referred Students ({hubData.referrals.length})
                  </span>
                  {hubData.referrals.length === 0 ? (
                    <p className="text-xs text-[#929292]/70">
                      No referred students yet. Share your code above so friends can enter it on the Login Page!
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {hubData.referrals.map((ref) => (
                        <div
                          key={ref.id}
                          className="p-3 rounded-xl bg-[#141414] border border-[#454545] flex items-center justify-between gap-2 flex-wrap text-xs"
                        >
                          <div>
                            <span className="font-bold text-[#F5F5F5]">{ref.referred_email}</span>
                            <span className="text-[10px] text-[#929292] block">
                              Joined: {new Date(ref.created_at).toLocaleDateString()}
                              {ref.purchased_plan_title ? ` · Plan: ${ref.purchased_plan_title}` : ''}
                              {typeof ref.final_amount_paid === 'number' ? ` · Paid: ₹${ref.final_amount_paid}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-mono-tech font-bold uppercase px-2 py-0.5 rounded border ${
                                ref.vip_purchase_status === 'approved'
                                  ? 'bg-[#FF2525]/12 text-[#FF2525] border-[#FF2525]/35'
                                  : ref.vip_purchase_status === 'pending'
                                  ? 'bg-[#FF762E]/12 text-[#FF762E] border-[#FF762E]/35'
                                  : 'bg-[#090909] text-[#929292] border-[#454545]'
                              }`}
                            >
                              {ref.vip_purchase_status === 'approved'
                                ? `VIP Verified (+${ref.reward_days_granted}d)`
                                : ref.vip_purchase_status === 'pending'
                                ? 'Payment Pending'
                                : 'Registered'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Apply Friend's Referral Code */}
              {!user.referred_by_user_id && referralProgramOn && (
                <form onSubmit={handleApplyReferral} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Have a friend's referral code? (e.g. SF-REF-XXXXXX)"
                    value={referralInput}
                    onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
                    className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#090909] border border-[#454545] focus:border-[#FF2525] focus:outline-none text-xs text-[#F5F5F5] font-mono-tech uppercase placeholder-[#929292]/45"
                  />
                  <button
                    type="submit"
                    disabled={applyingReferral}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-[#F5F5F5] font-display font-extrabold text-xs uppercase tracking-wider shrink-0 transition-colors"
                  >
                    {applyingReferral ? 'Verifying...' : 'Apply Code'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
