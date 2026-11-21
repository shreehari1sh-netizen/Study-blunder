import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Layers,
  Users,
  Crown,
  CreditCard,
  Key,
  History,
  Megaphone,
  Settings as SettingsIcon,
  ShieldAlert,
  Save,
  Plus,
  Trash2,
  Edit,
  Check,
  Copy,
  X,
  Search,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Lock,
  LogOut,
  Palette,
  Upload,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  Ban,
  ShieldCheck,
  Filter,
  Sliders,
  Send,
  LifeBuoy,
  Heart,
  Bell,
  HardDrive,
  Calendar,
  Eye,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Clock,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Star,
  Shield,
  Database,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { api, getStoredToken } from '../../api.ts';
import { CustomPopupModal } from '../CustomPopupModal.tsx';
import { TelegramModal } from '../TelegramModal.tsx';
import { FestivalManagerSection } from './FestivalManagerSection.tsx';
import {
  AdminControlTab,
  VipFeatureManagementTab,
  ReferralManagementTab,
  AdvancedAnalyticsTab,
  AdminAuditLogTab,
  BackupRecoveryTab,
} from './MasterUpgradeAdminTabs.tsx';
import { GrowthFeaturesAdminTab } from './GrowthFeaturesAdminTab.tsx';
import { ThemeManagerTab } from './ThemeManagerTab.tsx';
import type {
  UserProfile,
  Platform,
  VipPlan,
  AdminSettings,
  Announcement,
  LoginHistoryEntry,
  PaymentRecord,
  KeyRecord,
  VipDeviceLog,
  DashboardStats,
  CleanupOperationType,
  CleanupPreviewResponse,
  PopupFrequency,
  PlatformLogsSummaryResponse,
  PlatformUsageHistoryResponse,
  UserFeedbackRecord,
  FeedbackCategory,
  FeedbackStatus,
  AdminSectionKey,
} from '../../types.ts';

interface AdminPanelProps {
  currentUser: UserProfile;
  onClose: () => void;
  onLogout: () => void;
  onRefreshPublicData: () => void;
}

type AdminSection =
  | 'dashboard'
  | 'platforms'
  | 'platform_logs'
  | 'users'
  | 'vip'
  | 'plans'
  | 'payments'
  | 'history'
  | 'feedback'
  | 'announcements'
  | 'growth_board'
  | 'themes'
  | 'festivals'
  | 'settings'
  | 'security'
  | 'admin_control'
  | 'vip_features'
  | 'referral_management'
  | 'advanced_analytics'
  | 'audit_logs'
  | 'backups';

const SECTION_TO_PERMISSION_KEY: Record<AdminSection, AdminSectionKey> = {
  dashboard: 'dashboard',
  platforms: 'platforms',
  platform_logs: 'platform_logs',
  users: 'users',
  vip: 'vip',
  plans: 'vip',
  payments: 'payments',
  history: 'history',
  feedback: 'feedback',
  announcements: 'announcements',
  growth_board: 'announcements',
  themes: 'settings',
  festivals: 'festivals',
  settings: 'settings',
  security: 'admin_control',
  admin_control: 'admin_control',
  vip_features: 'vip_features',
  referral_management: 'referral_management',
  advanced_analytics: 'advanced_analytics',
  audit_logs: 'audit_logs',
  backups: 'backup_recovery',
};

const NORMAL_ADMIN_DEFAULT_SECTIONS = new Set<AdminSectionKey>([
  'dashboard',
  'platforms',
  'users',
  'payments',
  'announcements',
]);

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onClose, onLogout, onRefreshPublicData }) => {
  const isSuperAdmin = currentUser.role === 'super_admin';
  const [activeSection, setActiveSection] = useState<AdminSection>('dashboard');

  const canAccessSection = (sec: AdminSection): boolean => {
    if (isSuperAdmin) return true;
    if (sec === 'referral_management' && currentUser.referral_permissions?.can_access_referral_management) {
      return true;
    }
    const permKey = SECTION_TO_PERMISSION_KEY[sec];
    const perms = currentUser.admin_permissions;
    if (perms && perms[permKey]) {
      return Boolean(perms[permKey].enabled && perms[permKey].actions?.view);
    }
    return NORMAL_ADMIN_DEFAULT_SECTIONS.has(permKey);
  };

  const hasSectionAction = (
    permKey: AdminSectionKey,
    action: 'view' | 'add' | 'edit' | 'delete' | 'approve' | 'reject'
  ): boolean => {
    if (isSuperAdmin) return true;
    const perms = currentUser.admin_permissions;
    if (perms && perms[permKey]) {
      return Boolean(perms[permKey].enabled && perms[permKey].actions?.[action]);
    }
    if (!NORMAL_ADMIN_DEFAULT_SECTIONS.has(permKey)) return false;
    return action === 'view' || action === 'add' || action === 'edit' || action === 'approve' || action === 'reject';
  };

  // Global Toast State
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Section Loading & Error Tracking (Distinguish between 0 records vs load error)
  const [sectionLoading, setSectionLoading] = useState< boolean >(false);
  const [sectionError, setSectionError] = useState<string | null>(null);

  // 1. Dashboard State
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // 2. Platforms State
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [editingPlatform, setEditingPlatform] = useState<Partial<Platform> | null>(null);
  const [isCreatingPlatform, setIsCreatingPlatform] = useState(false);

  // 2b. Platform Logs State
  const [platformLogsData, setPlatformLogsData] = useState<PlatformLogsSummaryResponse | null>(null);
  const [platformLogsSearch, setPlatformLogsSearch] = useState('');
  const [platformLogsSortBy, setPlatformLogsSortBy] = useState<
    | 'total_opens'
    | 'today_opens'
    | 'yesterday_opens'
    | 'last_7_days_opens'
    | 'last_30_days_opens'
    | 'last_opened_at'
    | 'platform_name'
  >('total_opens');
  const [platformLogsSortOrder, setPlatformLogsSortOrder] = useState<'asc' | 'desc'>('desc');
  const [platformLogsStartDate, setPlatformLogsStartDate] = useState('');
  const [platformLogsEndDate, setPlatformLogsEndDate] = useState('');
  const [platformLogsPage, setPlatformLogsPage] = useState(1);
  const [platformLogsLimit] = useState(15);
  const [selectedPlatformHistory, setSelectedPlatformHistory] = useState<PlatformUsageHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  // 3. Users State (Search, Filter, Edit, Block/Unblock, Delete)
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<
    | 'all'
    | 'active_learners'
    | 'inactive'
    | 'no_study_activity'
    | 'inactive_30d'
    | 'active'
    | 'blocked'
    | 'vip'
    | 'free_access'
    | 'expired'
  >('all');
  const [editingUserProfile, setEditingUserProfile] = useState<UserProfile | null>(null);
  const [editingUserNameDraft, setEditingUserNameDraft] = useState('');
  const [isSavingUserProfile, setIsSavingUserProfile] = useState(false);
  const [userPendingBlock, setUserPendingBlock] = useState<{ user: UserProfile; blocked: boolean } | null>(null);
  const [blockReasonInput, setBlockReasonInput] = useState('');
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);
  const [userPendingDelete, setUserPendingDelete] = useState<UserProfile | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [userDeleteError, setUserDeleteError] = useState<string | null>(null);

  // 4. VIP Management & Single-Device Protection State
  const [selectedUserForVip, setSelectedUserForVip] = useState<UserProfile | null>(null);
  const [vipExpiryDays, setVipExpiryDays] = useState<number | string>('');
  const [userPendingVipDeviceReset, setUserPendingVipDeviceReset] = useState<UserProfile | null>(null);
  const [vipResetReasonInput, setVipResetReasonInput] = useState('');
  const [isResettingVipDevice, setIsResettingVipDevice] = useState(false);
  const [vipDeviceLogs, setVipDeviceLogs] = useState<VipDeviceLog[]>([]);
  const [vipLogPendingDelete, setVipLogPendingDelete] = useState<VipDeviceLog | null>(null);

  // App Customization State
  const [customAppName, setCustomAppName] = useState('STUDY BLUNDER');
  const [customAppLogo, setCustomAppLogo] = useState('');
  const [customThemePrimary, setCustomThemePrimary] = useState('#FF2525');
  const [customThemeSecondary, setCustomThemeSecondary] = useState('#C90000');
  const [customThemeBackground, setCustomThemeBackground] = useState('#090909');
  const [customThemeText, setCustomThemeText] = useState('#F5F5F5');
  const [customThemeButton, setCustomThemeButton] = useState('#FF2525');
  // VIP Section Theme State
  const [customVipBg, setCustomVipBg] = useState('#090909');
  const [customVipCard, setCustomVipCard] = useState('#1D1D1D');
  const [customVipAccent, setCustomVipAccent] = useState('#FF2525');
  const [customVipText, setCustomVipText] = useState('#F5F5F5');
  const [customVipButton, setCustomVipButton] = useState('#FF2525');
  const [customVipBorder, setCustomVipBorder] = useState('#454545');
  const [selectedLogoFileName, setSelectedLogoFileName] = useState('');
  const [selectedLogoMimeType, setSelectedLogoMimeType] = useState('');
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [isSavingCustomization, setIsSavingCustomization] = useState(false);

  // 5. VIP Plans State
  const [plans, setPlans] = useState<VipPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<Partial<VipPlan> | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  // 6. Payments State
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<
    'all' | 'approved' | 'completed' | 'pending' | 'rejected'
  >('all');
  const [paymentDateFilter, setPaymentDateFilter] = useState<
    'all' | 'today' | '7d' | '30d' | 'this_month' | 'custom'
  >('all');
  const [paymentStartDate, setPaymentStartDate] = useState('');
  const [paymentEndDate, setPaymentEndDate] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');

  // 7. Key Management State
  const [keySettings, setKeySettings] = useState<{
    key_generation_enabled: boolean;
    shortener_url: string;
    tutorial_video_url: string;
    key_expiry_hours: number;
    free_access_duration: number | string;
    free_access_unit: 'minutes' | 'hours' | 'days';
  }>({
    key_generation_enabled: true,
    shortener_url: '',
    tutorial_video_url: '',
    key_expiry_hours: 24,
    free_access_duration: 24,
    free_access_unit: 'hours',
  });
  const [keyRecords, setKeyRecords] = useState<KeyRecord[]>([]);
  const [copiedDestUrl, setCopiedDestUrl] = useState(false);
  const [isSavingKeySettings, setIsSavingKeySettings] = useState(false);

  // 8. Login History State
  const [history, setHistory] = useState<LoginHistoryEntry[]>([]);

  // 8b. Feedback Management State
  const [feedbackRecords, setFeedbackRecords] = useState<UserFeedbackRecord[]>([]);
  const [feedbackVipFilter, setFeedbackVipFilter] = useState<'all' | 'vip' | 'non_vip'>('all');
  const [feedbackCategoryFilter, setFeedbackCategoryFilter] = useState<'all' | FeedbackCategory>('all');
  const [feedbackRatingFilter, setFeedbackRatingFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5'>('all');
  const [feedbackStatusFilter, setFeedbackStatusFilter] = useState<'all' | FeedbackStatus>('all');
  const [feedbackDateFilter, setFeedbackDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [feedbackSearch, setFeedbackSearch] = useState('');
  const [selectedFeedbackDetail, setSelectedFeedbackDetail] = useState<UserFeedbackRecord | null>(null);
  const [feedbackStatusDraft, setFeedbackStatusDraft] = useState<FeedbackStatus>('New');
  const [feedbackAdminNoteDraft, setFeedbackAdminNoteDraft] = useState('');
  const [isSavingFeedbackUpdate, setIsSavingFeedbackUpdate] = useState(false);
  const [feedbackPendingDelete, setFeedbackPendingDelete] = useState<UserFeedbackRecord | null>(null);
  const [isDeletingFeedback, setIsDeletingFeedback] = useState(false);

  // 9. Announcements & Slider Controls State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnTitle, setNewAnnTitle] = useState('');
  const [newAnnContent, setNewAnnContent] = useState('');
  const [newAnnLinkUrl, setNewAnnLinkUrl] = useState('');
  const [newAnnDisplayOrder, setNewAnnDisplayOrder] = useState<number>(1);
  const [newAnnPublished, setNewAnnPublished] = useState<boolean>(true);
  const [newAnnStartDate, setNewAnnStartDate] = useState('');
  const [newAnnEndDate, setNewAnnEndDate] = useState('');
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [annPendingDelete, setAnnPendingDelete] = useState<Announcement | null>(null);
  const [sliderEnabled, setSliderEnabled] = useState<boolean>(true);
  const [sliderIntervalSec, setSliderIntervalSec] = useState<number>(5);
  const [isSavingSliderSettings, setIsSavingSliderSettings] = useState<boolean>(false);

  // 10. Settings State (Dirty checking + Save Changes + Explicit Save Status)
  const [originalSettings, setOriginalSettings] = useState<AdminSettings | null>(null);
  const [currentSettings, setCurrentSettings] = useState<AdminSettings | null>(null);
  const [isSettingsDirty, setIsSettingsDirty] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const [previewCustomPopup, setPreviewCustomPopup] = useState(false);
  const [previewTelegramPopup, setPreviewTelegramPopup] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);

  // VIP Plan Scope Filter (Both Buttons: 1st One Platform VIP & 2nd All Platforms VIP)
  const [planScopeFilter, setPlanScopeFilter] = useState<'all' | 'single_platform' | 'all_platforms'>('all');

  // 11. Admin Security & Individual Record Delete / Bulk Cleanup State
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'super_admin'>('admin');
  const [adminPendingDelete, setAdminPendingDelete] = useState<UserProfile | null>(null);
  const [isDeletingAdmin, setIsDeletingAdmin] = useState(false);
  const [adminDeleteError, setAdminDeleteError] = useState<string | null>(null);
  const [platformPendingDelete, setPlatformPendingDelete] = useState<Platform | null>(null);
  const [planPendingDelete, setPlanPendingDelete] = useState<VipPlan | null>(null);
  const [paymentPendingDelete, setPaymentPendingDelete] = useState<PaymentRecord | null>(null);
  const [keyPendingDelete, setKeyPendingDelete] = useState<KeyRecord | null>(null);
  const [historyPendingDelete, setHistoryPendingDelete] = useState<LoginHistoryEntry | null>(null);
  const [previewScreenshotPayment, setPreviewScreenshotPayment] = useState<PaymentRecord | null>(null);
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<string | null>(null);

  // Multi-Select Record IDs State per Section
  const [selectedPlatformIds, setSelectedPlatformIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());
  const [selectedKeyIds, setSelectedKeyIds] = useState<Set<string>>(new Set());
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [selectedAnnouncementIds, setSelectedAnnouncementIds] = useState<Set<string>>(new Set());
  const [selectedVipLogIds, setSelectedVipLogIds] = useState<Set<string>>(new Set());

  // Bulk Delete Selected Confirmation Modal State
  const [bulkDeleteModal, setBulkDeleteModal] = useState<{
    section:
      | 'users'
      | 'platforms'
      | 'vip_plans'
      | 'payment_records'
      | 'key_records'
      | 'login_history'
      | 'announcements'
      | 'vip_device_logs';
    title: string;
    ids: string[];
    executing: boolean;
    error: string | null;
  } | null>(null);

  // Section-Specific Bulk Cleanup Modal State
  const [cleanupModal, setCleanupModal] = useState<{
    operation: CleanupOperationType;
    title: string;
    retentionDays?: number;
    supportsRetentionDays?: boolean;
    preview: CleanupPreviewResponse | null;
    loading: boolean;
    executing: boolean;
    error?: string | null;
  } | null>(null);

  const toggleIdInSet = (id: string, setter: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Initial Data Fetching
  const loadInitialData = async () => {
    try {
      const results = await Promise.allSettled([
        api.getAdminStats(),
        api.getAdminPlatforms(),
        api.getAdminVipPlans(),
      ]);
      if (results[0].status === 'fulfilled') setStats(results[0].value);
      if (results[1].status === 'fulfilled') setPlatforms(results[1].value);
      if (results[2].status === 'fulfilled') setPlans(results[2].value);
    } catch (err) {
      console.warn('Initial admin data load note:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Section-specific loaders with explicit error handling
  useEffect(() => {
    setSectionError(null);
    if (activeSection === 'platforms') {
      setSectionLoading(true);
      api
        .getAdminPlatforms()
        .then((res) => {
          setPlatforms(res);
          setSelectedPlatformIds((prev) => new Set([...prev].filter((id) => res.some((r) => r.id === id))));
        })
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load platforms'))
        .finally(() => setSectionLoading(false));
    }
    if (activeSection === 'platform_logs') {
      setSectionLoading(true);
      api
        .getAdminPlatformLogs({
          search: platformLogsSearch,
          sortBy: platformLogsSortBy,
          sortOrder: platformLogsSortOrder,
          startDate: platformLogsStartDate || undefined,
          endDate: platformLogsEndDate || undefined,
          page: platformLogsPage,
          limit: platformLogsLimit,
        })
        .then((res) => {
          setPlatformLogsData(res);
        })
        .catch((err: unknown) =>
          setSectionError(err instanceof Error ? err.message : 'Failed to load platform usage statistics')
        )
        .finally(() => setSectionLoading(false));
    }
    if (activeSection === 'users' || activeSection === 'vip') {
      setSectionLoading(true);
      Promise.all([
        api.getAdminUsers(userSearch, activeSection === 'users' ? userFilter : 'all'),
        activeSection === 'vip' ? api.getVipDeviceLogs() : Promise.resolve(null),
      ])
        .then(([uRes, logsRes]) => {
          setUsers(uRes);
          setSelectedUserIds((prev) => new Set([...prev].filter((id) => uRes.some((u) => u.id === id))));
          if (logsRes) {
            setVipDeviceLogs(logsRes);
            setSelectedVipLogIds((prev) => new Set([...prev].filter((id) => logsRes.some((l) => l.id === id))));
          }
        })
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load users'))
        .finally(() => setSectionLoading(false));
    }
    if (activeSection === 'plans') {
      setSectionLoading(true);
      api
        .getAdminVipPlans()
        .then((res) => {
          setPlans(res);
          setSelectedPlanIds((prev) => new Set([...prev].filter((id) => res.some((r) => r.id === id))));
        })
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load VIP plans'))
        .finally(() => setSectionLoading(false));
    }
    if (activeSection === 'payments') {
      setSectionLoading(true);
      api
        .getAdminPayments()
        .then((res) => {
          setPayments(res);
          setSelectedPaymentIds((prev) => new Set([...prev].filter((id) => res.some((r) => r.id === id))));
        })
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load payment records'))
        .finally(() => setSectionLoading(false));
    }
    if (activeSection === 'history') {
      setSectionLoading(true);
      api
        .getAdminLoginHistory()
        .then((res) => {
          setHistory(res);
          setSelectedHistoryIds((prev) => new Set([...prev].filter((id) => res.some((r) => r.id === id))));
        })
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load login history'))
        .finally(() => setSectionLoading(false));
    }
    if (activeSection === 'feedback') {
      setSectionLoading(true);
      api
        .getAdminFeedback()
        .then((res) => {
          setFeedbackRecords(res);
        })
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load user feedback'))
        .finally(() => setSectionLoading(false));
    }
    if (activeSection === 'announcements') {
      setSectionLoading(true);
      Promise.all([api.getAdminAnnouncements(), api.getSettings()])
        .then(([anns, sett]) => {
          setAnnouncements(anns);
          setSelectedAnnouncementIds((prev) => new Set([...prev].filter((id) => anns.some((r) => r.id === id))));
          setNewAnnDisplayOrder(anns.length + 1);
          setSliderEnabled(sett.announcement_slider_enabled !== false);
          setSliderIntervalSec(sett.announcement_slide_interval_seconds || 5);
        })
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load announcements'))
        .finally(() => setSectionLoading(false));
    }
    if (activeSection === 'settings' || activeSection === 'plans') {
      api
        .getAdminSettings()
        .then((res) => {
          setOriginalSettings(res);
          setCurrentSettings(res);
          setIsSettingsDirty(false);
          setSettingsSaveStatus('idle');
          setSettingsSaveError(null);
          setCustomAppName(res.app_name || 'STUDY BLUNDER');
          setCustomAppLogo(res.app_logo_url || '');
          setCustomThemePrimary(res.theme_primary || '#FF2525');
          setCustomThemeSecondary(res.theme_secondary || '#C90000');
          setCustomThemeBackground(res.theme_background || '#090909');
          setCustomThemeText(res.theme_text || '#F5F5F5');
          setCustomThemeButton(res.theme_button || '#FF2525');
          setCustomVipBg(res.vip_theme_background || '#090909');
          setCustomVipCard(res.vip_theme_card || '#1D1D1D');
          setCustomVipAccent(res.vip_theme_accent || '#FF2525');
          setCustomVipText(res.vip_theme_text || '#F5F5F5');
          setCustomVipButton(res.vip_theme_button || '#FF2525');
          setCustomVipBorder(res.vip_theme_border || '#454545');
        })
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load settings'));
    }
    if (activeSection === 'security' && isSuperAdmin) {
      api
        .getAdminAdmins()
        .then(setAdmins)
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load admins'));
    }
  }, [
    activeSection,
    userSearch,
    userFilter,
    platformLogsSearch,
    platformLogsSortBy,
    platformLogsSortOrder,
    platformLogsStartDate,
    platformLogsEndDate,
    platformLogsPage,
    platformLogsLimit,
  ]);

  const handleOpenPlatformHistory = async (platformId: string, page = 1) => {
    try {
      setHistoryLoading(true);
      setHistoryPage(page);
      const res = await api.getAdminPlatformLogHistory(platformId, {
        startDate: platformLogsStartDate || undefined,
        endDate: platformLogsEndDate || undefined,
        page,
        limit: 15,
      });
      setSelectedPlatformHistory(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load platform usage history';
      showToast(msg, 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  const formatIstDateTime = (iso: string | null | undefined): string => {
    if (!iso) return 'Never opened';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return 'Never opened';
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(d);
    } catch {
      return new Date(iso).toLocaleString();
    }
  };

  // Section 3: User Edit / Block / Unblock / Delete Handlers
  const handleSaveUserProfileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserProfile || isSavingUserProfile) return;
    setIsSavingUserProfile(true);
    try {
      const res = await api.updateAdminUser(editingUserProfile.id, {
        name: editingUserNameDraft.trim(),
      });
      setUsers((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
      showToast(res.message || 'User profile updated');
      setEditingUserProfile(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user profile';
      showToast(msg, 'error');
    } finally {
      setIsSavingUserProfile(false);
    }
  };

  const handleConfirmBlockToggle = async () => {
    if (!userPendingBlock || isUpdatingBlock) return;
    setIsUpdatingBlock(true);
    try {
      const res = userPendingBlock.blocked
        ? await api.blockUser(userPendingBlock.user.id, blockReasonInput.trim() || undefined)
        : await api.unblockUser(userPendingBlock.user.id);
      setUsers((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
      showToast(res.message);
      setUserPendingBlock(null);
      setBlockReasonInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update account block status';
      showToast(msg, 'error');
    } finally {
      setIsUpdatingBlock(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userPendingDelete || isDeletingUser) return;
    setIsDeletingUser(true);
    setUserDeleteError(null);
    try {
      const res = await api.deleteUser(userPendingDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== userPendingDelete.id));
      setAdmins((prev) => prev.filter((a) => a.id !== userPendingDelete.id));
      setSelectedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userPendingDelete.id);
        return next;
      });
      setUserPendingDelete(null);
      showToast(res.message || 'User account deleted');
      api.getAdminStats().then(setStats).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete user account';
      setUserDeleteError(msg);
      showToast(msg, 'error');
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Single-Device VIP Reset & Security Log Delete Handlers
  const handleConfirmResetVipDevice = async () => {
    if (!userPendingVipDeviceReset || isResettingVipDevice) return;
    setIsResettingVipDevice(true);
    try {
      const res = await api.resetUserVipDevice(
        userPendingVipDeviceReset.id,
        vipResetReasonInput.trim() || undefined
      );
      setUsers((prev) => prev.map((u) => (u.id === res.user.id ? res.user : u)));
      showToast(res.message);
      setUserPendingVipDeviceReset(null);
      setVipResetReasonInput('');
      api.getVipDeviceLogs().then(setVipDeviceLogs).catch(() => {});
      api.getAdminLoginHistory().then(setHistory).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset registered device binding';
      showToast(msg, 'error');
    } finally {
      setIsResettingVipDevice(false);
    }
  };

  const handleSaveFeedbackAdminUpdate = async () => {
    if (!selectedFeedbackDetail || isSavingFeedbackUpdate) return;
    setIsSavingFeedbackUpdate(true);
    try {
      const res = await api.updateAdminFeedback(selectedFeedbackDetail.id, {
        status: feedbackStatusDraft,
        admin_note: feedbackAdminNoteDraft,
      });
      setFeedbackRecords((prev) => prev.map((f) => (f.id === res.feedback.id ? res.feedback : f)));
      setSelectedFeedbackDetail(res.feedback);
      showToast(res.message || 'Feedback updated');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update feedback';
      showToast(msg, 'error');
    } finally {
      setIsSavingFeedbackUpdate(false);
    }
  };

  const handleConfirmDeleteFeedback = async () => {
    if (!feedbackPendingDelete || isDeletingFeedback) return;
    setIsDeletingFeedback(true);
    try {
      const res = await api.deleteAdminFeedback(feedbackPendingDelete.id);
      setFeedbackRecords((prev) => prev.filter((f) => f.id !== feedbackPendingDelete.id));
      if (selectedFeedbackDetail?.id === feedbackPendingDelete.id) {
        setSelectedFeedbackDetail(null);
      }
      setFeedbackPendingDelete(null);
      showToast(res.message || 'Feedback deleted');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete feedback';
      showToast(msg, 'error');
    } finally {
      setIsDeletingFeedback(false);
    }
  };

  const handleConfirmDeleteVipLog = async () => {
    if (!vipLogPendingDelete) return;
    try {
      const res = await api.deleteVipDeviceLog(vipLogPendingDelete.id);
      setVipDeviceLogs((prev) => prev.filter((l) => l.id !== vipLogPendingDelete.id));
      setSelectedVipLogIds((prev) => {
        const next = new Set(prev);
        next.delete(vipLogPendingDelete.id);
        return next;
      });
      setVipLogPendingDelete(null);
      showToast(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete VIP device log';
      showToast(msg, 'error');
    }
  };

  // Multi-Select Bulk Delete Handler
  const handleExecuteBulkDeleteSelected = async () => {
    if (!bulkDeleteModal || bulkDeleteModal.executing || bulkDeleteModal.ids.length === 0) return;
    setBulkDeleteModal((prev) => (prev ? { ...prev, executing: true, error: null } : null));
    try {
      const res = await api.bulkDelete(bulkDeleteModal.section, bulkDeleteModal.ids);
      showToast(res.message);
      const sec = bulkDeleteModal.section;
      setBulkDeleteModal(null);

      if (sec === 'platforms') {
        const updated = await api.getAdminPlatforms();
        setPlatforms(updated);
        setSelectedPlatformIds(new Set());
      } else if (sec === 'users') {
        const updated = await api.getAdminUsers(userSearch, activeSection === 'users' ? userFilter : 'all');
        setUsers(updated);
        setSelectedUserIds(new Set());
      } else if (sec === 'vip_plans') {
        const updated = await api.getAdminVipPlans();
        setPlans(updated);
        setSelectedPlanIds(new Set());
      } else if (sec === 'payment_records') {
        const updated = await api.getAdminPayments();
        setPayments(updated);
        setSelectedPaymentIds(new Set());
      } else if (sec === 'key_records') {
        const updated = await api.getAdminKeys();
        setKeyRecords(updated.records);
        setSelectedKeyIds(new Set());
      } else if (sec === 'login_history') {
        const updated = await api.getAdminLoginHistory();
        setHistory(updated);
        setSelectedHistoryIds(new Set());
      } else if (sec === 'announcements') {
        const updated = await api.getAdminAnnouncements();
        setAnnouncements(updated);
        setSelectedAnnouncementIds(new Set());
      } else if (sec === 'vip_device_logs') {
        const updated = await api.getVipDeviceLogs();
        setVipDeviceLogs(updated);
        setSelectedVipLogIds(new Set());
      }
      api.getAdminStats().then(setStats).catch(() => {});
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bulk delete failed';
      showToast(msg, 'error');
      setBulkDeleteModal((prev) => (prev ? { ...prev, executing: false, error: msg } : null));
    }
  };

  // Section-Specific Bulk Cleanup Handlers
  const handleOpenCleanupModal = async (
    operation: CleanupOperationType,
    title: string,
    defaultRetentionDays?: number
  ) => {
    setCleanupModal({
      operation,
      title,
      retentionDays: defaultRetentionDays,
      supportsRetentionDays: defaultRetentionDays !== undefined,
      preview: null,
      loading: true,
      executing: false,
    });
    try {
      const preview = await api.previewCleanup(operation, defaultRetentionDays ?? 0);
      setCleanupModal((prev) => (prev ? { ...prev, preview, loading: false } : null));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load cleanup preview';
      showToast(msg, 'error');
      setCleanupModal(null);
    }
  };

  const handleUpdateCleanupRetentionDays = async (days: number) => {
    if (!cleanupModal) return;
    const validDays = Math.max(0, Math.floor(days));
    setCleanupModal((prev) => (prev ? { ...prev, retentionDays: validDays, loading: true } : null));
    try {
      const preview = await api.previewCleanup(cleanupModal.operation, validDays);
      setCleanupModal((prev) => (prev ? { ...prev, preview, loading: false } : null));
    } catch {
      setCleanupModal((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  const handleExecuteCleanup = async () => {
    if (!cleanupModal || cleanupModal.executing) return;
    setCleanupModal((prev) => (prev ? { ...prev, executing: true } : null));
    try {
      const res = await api.executeCleanup(cleanupModal.operation, cleanupModal.retentionDays ?? 0);
      showToast(res.message);
      const op = cleanupModal.operation;
      setCleanupModal(null);

      // Refresh corresponding section data and clear stale selections
      if (op === 'platforms_inactive') {
        api.getAdminPlatforms().then((r) => { setPlatforms(r); setSelectedPlatformIds(new Set()); }).catch(() => {});
      } else if (
        op === 'users_inactive' ||
        op === 'vip_expired' ||
        op === 'users_expired_inactive' ||
        op === 'users_expired_free_access'
      ) {
        api.getAdminUsers(userSearch, activeSection === 'users' ? userFilter : 'all').then((r) => { setUsers(r); setSelectedUserIds(new Set()); }).catch(() => {});
      } else if (op === 'plans_inactive') {
        api.getAdminVipPlans().then((r) => { setPlans(r); setSelectedPlanIds(new Set()); }).catch(() => {});
      } else if (op.startsWith('payments_')) {
        api.getAdminPayments().then((r) => { setPayments(r); setSelectedPaymentIds(new Set()); }).catch(() => {});
      } else if (op.startsWith('keys_')) {
        api.getAdminKeys().then((kRes) => { setKeyRecords(kRes.records); setSelectedKeyIds(new Set()); }).catch(() => {});
      } else if (op.startsWith('login_history_')) {
        api.getAdminLoginHistory().then((r) => { setHistory(r); setSelectedHistoryIds(new Set()); }).catch(() => {});
      } else if (op.startsWith('announcements_')) {
        api.getAdminAnnouncements().then((r) => { setAnnouncements(r); setSelectedAnnouncementIds(new Set()); }).catch(() => {});
      } else if (op.startsWith('vip_device_logs_')) {
        api.getVipDeviceLogs().then((r) => { setVipDeviceLogs(r); setSelectedVipLogIds(new Set()); }).catch(() => {});
      }
      api.getAdminStats().then(setStats).catch(() => {});
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Cleanup operation failed';
      showToast(msg, 'error');
      setCleanupModal((prev) => (prev ? { ...prev, executing: false } : null));
    }
  };

  // Individual Record Delete Handlers (Payments, Keys, Login History)
  const handleConfirmDeletePayment = async () => {
    if (!paymentPendingDelete) return;
    try {
      const res = await api.deleteAdminPayment(paymentPendingDelete.id);
      setPayments((prev) => prev.filter((p) => p.id !== paymentPendingDelete.id));
      setSelectedPaymentIds((prev) => {
        const next = new Set(prev);
        next.delete(paymentPendingDelete.id);
        return next;
      });
      setPaymentPendingDelete(null);
      showToast(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete payment record';
      showToast(msg, 'error');
    }
  };

  const handleConfirmDeleteKeyRecord = async () => {
    if (!keyPendingDelete) return;
    try {
      const res = await api.deleteAdminKeyRecord(keyPendingDelete.id);
      setKeyRecords((prev) => prev.filter((k) => k.id !== keyPendingDelete.id));
      setSelectedKeyIds((prev) => {
        const next = new Set(prev);
        next.delete(keyPendingDelete.id);
        return next;
      });
      if (stats) {
        setStats({ ...stats, active_keys: res.active_keys });
      }
      setKeyPendingDelete(null);
      showToast(res.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete key record';
      showToast(msg, 'error');
    }
  };

  const handleConfirmDeleteLoginHistory = async () => {
    if (!historyPendingDelete) return;
    try {
      const res = await api.deleteAdminLoginHistory(historyPendingDelete.id);
      setHistory((prev) => prev.filter((h) => h.id !== historyPendingDelete.id));
      setSelectedHistoryIds((prev) => {
        const next = new Set(prev);
        next.delete(historyPendingDelete.id);
        return next;
      });
      setHistoryPendingDelete(null);
      showToast(res.message);
      api.getAdminStats().then(setStats).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete login history entry';
      showToast(msg, 'error');
    }
  };

  // Section 2: Platform Handlers
  const handleSavePlatform = async (p: Partial<Platform>) => {
    try {
      const targetUrl = p.target_url?.trim() || '';
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        showToast('Destination URL must start with http:// or https://', 'error');
        return;
      }

      if (p.access_type === 'vip' && p.vip_target_url && p.vip_target_url.trim().length > 0) {
        const vipUrl = p.vip_target_url.trim();
        if (!vipUrl.startsWith('http://') && !vipUrl.startsWith('https://')) {
          showToast('VIP Redirect URL must start with http:// or https://', 'error');
          return;
        }
      }

      if (isCreatingPlatform) {
        await api.createPlatform(p);
        showToast('Platform created successfully');
      } else if (editingPlatform?.id) {
        await api.updatePlatform(editingPlatform.id, p);
        showToast('Platform updated successfully');
      }
      setIsCreatingPlatform(false);
      setEditingPlatform(null);
      const updated = await api.getAdminPlatforms();
      setPlatforms(updated);
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save platform';
      showToast(msg, 'error');
    }
  };

  const handleDeletePlatform = async (id: string) => {
    try {
      await api.deletePlatform(id);
      showToast('Platform deleted');
      setPlatforms(platforms.filter((p) => p.id !== id));
      setPlatformPendingDelete(null);
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete platform';
      showToast(msg, 'error');
    }
  };

  const [movingPlatformId, setMovingPlatformId] = useState<string | null>(null);

  const handleMovePlatform = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= platforms.length || movingPlatformId) return;

    const currentPlat = platforms[index];
    setMovingPlatformId(currentPlat.id);

    try {
      const reordered = [...platforms];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);

      const normalized = reordered.map((item, idx) => ({
        ...item,
        display_order: idx + 1,
      }));

      setPlatforms(normalized);

      await Promise.all(
        normalized.map((p) =>
          api.updatePlatform(p.id, {
            display_order: p.display_order,
          })
        )
      );

      const updated = await api.getAdminPlatforms();
      setPlatforms(updated);
      onRefreshPublicData();
      showToast(`Moved "${currentPlat.name}" ${direction === 'up' ? 'up' : 'down'}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reorder platform';
      showToast(msg, 'error');
      const fallback = await api.getAdminPlatforms().catch(() => platforms);
      setPlatforms(fallback);
    } finally {
      setMovingPlatformId(null);
    }
  };

  // Section 4: VIP Handlers
  const handleToggleVip = async (user: UserProfile, active: boolean, days?: number | string) => {
    try {
      if (active) {
        const numDays = Number(days);
        if (!Number.isInteger(numDays) || numDays <= 0) {
          showToast(
            'VIP Duration must be a positive whole number of days (e.g. 1, 7, 15, 30, 45, 90, 180, 365). Decimals, zero, and negative values are not allowed.',
            'error'
          );
          return;
        }
        const updated = await api.updateUserVip(user.id, true, numDays);
        setUsers(users.map((u) => (u.id === updated.id ? updated : u)));
        showToast(`VIP activated for ${user.email} (${numDays} days)`);
      } else {
        const updated = await api.updateUserVip(user.id, false);
        setUsers(users.map((u) => (u.id === updated.id ? updated : u)));
        showToast(`VIP revoked for ${user.email}`);
      }
      setSelectedUserForVip(null);
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update VIP status';
      showToast(msg, 'error');
    }
  };

  // Section 5: VIP Plan Handlers
  const handleSavePlan = async (pl: Partial<VipPlan>) => {
    try {
      if (pl.duration_days === undefined || pl.duration_days === null || pl.duration_days === ('' as unknown as number)) {
        showToast('VIP Duration (Days) is required. Please type a positive whole number of days (e.g. 15, 45, 180, 365).', 'error');
        return;
      }
      const days = Number(pl.duration_days);
      if (!Number.isInteger(days) || days <= 0) {
        showToast('VIP Duration must be a positive whole number of days (e.g. 7, 15, 30, 45, 90, 180, 365). Decimals, zero, and negative values are not allowed.', 'error');
        return;
      }

      const payload = {
        ...pl,
        duration_days: days,
        duration_months: Math.round(days / 30) || 1,
      };

      if (isCreatingPlan) {
        await api.createVipPlan(payload);
        showToast('VIP Plan created');
      } else if (editingPlan?.id) {
        await api.updateVipPlan(editingPlan.id, payload);
        showToast('VIP Plan updated');
      }
      setIsCreatingPlan(false);
      setEditingPlan(null);
      const updated = await api.getAdminVipPlans();
      setPlans(updated);
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save plan';
      showToast(msg, 'error');
    }
  };

  const handleDeletePlan = async (id: string) => {
    try {
      await api.deleteVipPlan(id);
      showToast('VIP plan removed');
      setPlans(plans.filter((p) => p.id !== id));
      setPlanPendingDelete(null);
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete plan';
      showToast(msg, 'error');
    }
  };

  const [movingPlanId, setMovingPlanId] = useState<string | null>(null);

  const handleMovePlan = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= plans.length || movingPlanId) return;

    const currentPlan = plans[index];
    setMovingPlanId(currentPlan.id);

    try {
      const reordered = [...plans];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(targetIndex, 0, moved);

      const normalized = reordered.map((item, idx) => ({
        ...item,
        display_order: idx + 1,
      }));

      setPlans(normalized);

      await Promise.all(
        normalized.map((pl) =>
          api.updateVipPlan(pl.id, {
            display_order: pl.display_order,
          })
        )
      );

      const updated = await api.getAdminVipPlans();
      setPlans(updated);
      onRefreshPublicData();
      showToast(`Moved "${currentPlan.title}" ${direction === 'up' ? 'up' : 'down'}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reorder VIP plan';
      showToast(msg, 'error');
      const fallback = await api.getAdminVipPlans().catch(() => plans);
      setPlans(fallback);
    } finally {
      setMovingPlanId(null);
    }
  };

  // Section 7: Key Settings Handler
  const handleSaveKeySettings = async () => {
    if (isSavingKeySettings) return;
    try {
      const dur = Number(keySettings.free_access_duration);
      if (!Number.isFinite(dur) || dur <= 0) {
        showToast('Free Access Duration must be a positive whole or decimal number (e.g. 15, 24, 7).', 'error');
        return;
      }

      setIsSavingKeySettings(true);
      const res = await api.updateKeySettings({
        ...keySettings,
        free_access_duration: dur,
        free_access_unit: keySettings.free_access_unit,
      });

      const saved = res.settings;
      setKeySettings((prev) => ({
        ...prev,
        key_generation_enabled: saved.key_generation_enabled ?? prev.key_generation_enabled,
        shortener_url: saved.shortener_url ?? '',
        tutorial_video_url: saved.tutorial_video_url ?? '',
        key_expiry_hours: saved.key_expiry_hours ?? prev.key_expiry_hours,
        free_access_duration: saved.free_access_duration ?? dur,
        free_access_unit: (saved.free_access_unit as 'minutes' | 'hours' | 'days') ?? prev.free_access_unit,
      }));
      // Keep global settings cache synchronized so switching tabs never clobbers Key settings
      setOriginalSettings((prev) => (prev ? { ...prev, ...saved } : prev));
      setCurrentSettings((prev) => (prev ? { ...prev, ...saved } : prev));
      setIsSettingsDirty(false);

      showToast('Free Access Duration & Key settings saved to database');
      api.getAdminStats().then(setStats).catch(() => {});
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save key settings';
      showToast(msg, 'error');
    } finally {
      setIsSavingKeySettings(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      const res = await api.revokeAdminKey(id);
      setKeyRecords((prev) =>
        prev.map((k) => (k.id === id ? { ...k, status: 'revoked' } : k))
      );
      if (stats) {
        setStats({ ...stats, active_keys: res.active_keys });
      }
      showToast('Access key revoked successfully');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke key';
      showToast(msg, 'error');
    }
  };

  // Section 9: Announcements & Slider Handlers
  const handleSaveSliderControls = async () => {
    const interval = Number(sliderIntervalSec);
    if (!Number.isFinite(interval) || interval < 2 || interval > 60) {
      showToast('Slide interval must be between 2 and 60 seconds.', 'error');
      return;
    }
    setIsSavingSliderSettings(true);
    try {
      const saved = await api.saveAdminSettings({
        announcement_slider_enabled: sliderEnabled,
        announcement_slide_interval_seconds: Math.round(interval),
      });
      setOriginalSettings(saved);
      setCurrentSettings(saved);
      showToast('Announcement slider controls saved');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save slider settings';
      showToast(msg, 'error');
    } finally {
      setIsSavingSliderSettings(false);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnTitle.trim() || !newAnnContent.trim()) return;
    try {
      const ann = await api.createAnnouncement(newAnnTitle.trim(), newAnnContent.trim(), newAnnPublished, {
        link_url: newAnnLinkUrl.trim(),
        display_order: Number(newAnnDisplayOrder) || 1,
        start_date: newAnnStartDate ? new Date(newAnnStartDate).toISOString() : null,
        end_date: newAnnEndDate ? new Date(newAnnEndDate).toISOString() : null,
      });
      const updated = await api.getAdminAnnouncements();
      setAnnouncements(updated);
      setNewAnnTitle('');
      setNewAnnContent('');
      setNewAnnLinkUrl('');
      setNewAnnDisplayOrder(updated.length + 1);
      setNewAnnPublished(true);
      setNewAnnStartDate('');
      setNewAnnEndDate('');
      showToast(ann.is_published ? 'Announcement published to slider' : 'Announcement saved as draft');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish announcement';
      showToast(msg, 'error');
    }
  };

  const handleSaveEditedAnnouncement = async () => {
    if (!editingAnnouncement) return;
    try {
      await api.updateAnnouncement(editingAnnouncement.id, {
        title: editingAnnouncement.title,
        content: editingAnnouncement.content,
        is_published: editingAnnouncement.is_published,
        link_url: editingAnnouncement.link_url || '',
        display_order: Number(editingAnnouncement.display_order) || 1,
        start_date: editingAnnouncement.start_date || null,
        end_date: editingAnnouncement.end_date || null,
      });
      const updated = await api.getAdminAnnouncements();
      setAnnouncements(updated);
      setEditingAnnouncement(null);
      showToast('Announcement updated');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update announcement';
      showToast(msg, 'error');
    }
  };

  const handleToggleAnnouncementActive = async (ann: Announcement) => {
    try {
      await api.updateAnnouncement(ann.id, { is_published: !ann.is_published });
      const updated = await api.getAdminAnnouncements();
      setAnnouncements(updated);
      showToast(!ann.is_published ? 'Announcement activated' : 'Announcement hidden from slider');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle announcement';
      showToast(msg, 'error');
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await api.deleteAnnouncement(id);
      setAnnouncements(announcements.filter((a) => a.id !== id));
      setAnnPendingDelete(null);
      showToast('Announcement deleted');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      showToast(msg, 'error');
    }
  };

  // Section 10: Settings Handlers (Dirty State + Save Changes + Asset Upload)
  const handleSettingChange = <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) => {
    if (!currentSettings) return;
    const updated = { ...currentSettings, [key]: value };
    setCurrentSettings(updated);
    setIsSettingsDirty(JSON.stringify(updated) !== JSON.stringify(originalSettings));
    setSettingsSaveStatus('idle');
    setSettingsSaveError(null);
  };

  const handleUploadSettingAsset = (
    e: React.ChangeEvent<HTMLInputElement>,
    settingKey: 'support_image_url' | 'vip_payment_qr_url' | 'donation_qr_url' | 'custom_popup_image_url'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !currentSettings) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      showToast('Unsupported image format. Please select PNG, JPG, or WEBP.', 'error');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image file size exceeds 5MB limit.', 'error');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      setIsUploadingAsset(true);
      try {
        const res = await api.uploadAdminAsset(reader.result, file.name, file.type, settingKey);
        if (res.settings) {
          setOriginalSettings(res.settings);
          setCurrentSettings((prev) =>
            prev ? { ...prev, ...res.settings, [settingKey]: res.url } : res.settings!
          );
        } else {
          setOriginalSettings((prev) => (prev ? { ...prev, [settingKey]: res.url } : prev));
          setCurrentSettings((prev) => (prev ? { ...prev, [settingKey]: res.url } : prev));
        }
        showToast(res.message || 'Image uploaded and saved to database!');
        onRefreshPublicData();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to upload and save image';
        showToast(msg, 'error');
      } finally {
        setIsUploadingAsset(false);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveSettingAsset = async (
    settingKey: 'support_image_url' | 'vip_payment_qr_url' | 'donation_qr_url' | 'custom_popup_image_url'
  ) => {
    if (!currentSettings) return;
    try {
      setIsUploadingAsset(true);
      const saved = await api.saveAdminSettings({ [settingKey]: '' });
      setOriginalSettings(saved);
      setCurrentSettings((prev) => (prev ? { ...prev, [settingKey]: '' } : saved));
      showToast('Image removed and settings updated.');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove image';
      showToast(msg, 'error');
    } finally {
      setIsUploadingAsset(false);
    }
  };

  const handleVerifyPaymentClaim = async (paymentId: string, action: 'approve' | 'reject') => {
    if (verifyingPaymentId) return;
    setVerifyingPaymentId(paymentId);
    try {
      const res = await api.verifyAdminPayment(paymentId, { action });
      setPayments((prev) => prev.map((p) => (p.id === paymentId ? res.payment : p)));
      if (previewScreenshotPayment?.id === paymentId) {
        setPreviewScreenshotPayment(res.payment);
      }
      showToast(res.message);
      api.getAdminStats().then(setStats).catch(() => {});
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify payment claim';
      showToast(msg, 'error');
    } finally {
      setVerifyingPaymentId(null);
    }
  };

  const handleSaveGlobalSettings = async () => {
    if (!currentSettings || isSavingSettings) return;
    setIsSavingSettings(true);
    setSettingsSaveStatus('saving');
    setSettingsSaveError(null);
    try {
      const tgUrl = (currentSettings.vip_telegram_url ?? currentSettings.vip_purchase_url ?? '').trim();
      if (tgUrl.length > 0 && !tgUrl.startsWith('http://') && !tgUrl.startsWith('https://')) {
        const errText = 'VIP Telegram URL must start with http:// or https://';
        setSettingsSaveStatus('error');
        setSettingsSaveError(errText);
        showToast(errText, 'error');
        return;
      }

      const singleBtnUrl = (currentSettings.home_single_vip_url || '').trim();
      if (
        currentSettings.home_single_vip_destination === 'custom_url' &&
        singleBtnUrl.length > 0 &&
        !singleBtnUrl.startsWith('http://') &&
        !singleBtnUrl.startsWith('https://')
      ) {
        const errText = '1st Button (VIP) Custom Destination URL must start with http:// or https://';
        setSettingsSaveStatus('error');
        setSettingsSaveError(errText);
        showToast(errText, 'error');
        return;
      }

      const allBtnUrl = (currentSettings.home_all_vip_url || '').trim();
      if (
        currentSettings.home_all_vip_destination === 'custom_url' &&
        allBtnUrl.length > 0 &&
        !allBtnUrl.startsWith('http://') &&
        !allBtnUrl.startsWith('https://')
      ) {
        const errText = '2nd Button (ALL VIP) Custom Destination URL must start with http:// or https://';
        setSettingsSaveStatus('error');
        setSettingsSaveError(errText);
        showToast(errText, 'error');
        return;
      }

      // Send only Settings-tab fields so Customization / Announcements / Festival / Referral tabs are never clobbered
      const {
        referral_discount_config: _rdc,
        referral_program_enabled: _rpe,
        festival_configs_json: _fcj,
        active_festival_id: _afi,
        festival_decorations_enabled: _fde,
        festival_version: _fv,
        app_name: _an,
        app_logo_url: _al,
        app_theme_preset: _atp,
        theme_primary: _tp,
        theme_secondary: _ts,
        theme_background: _tb,
        theme_text: _tt,
        theme_button: _tbt,
        vip_theme_background: _vtb,
        vip_theme_card: _vtc,
        vip_theme_accent: _vta,
        vip_theme_text: _vtt,
        vip_theme_button: _vtbt,
        vip_theme_border: _vtbr,
        announcement_slider_enabled: _ase,
        announcement_slide_interval_seconds: _asi,
        free_access_duration: _fad,
        free_access_unit: _fau,
        updated_at: _ua,
        ...settingsTabPayload
      } = currentSettings as unknown as Record<string, unknown>;

      const saved = await api.saveAdminSettings({
        ...(settingsTabPayload as Partial<AdminSettings>),
        vip_purchase_url: tgUrl,
        vip_telegram_url: tgUrl,
        support_button_label: currentSettings.support_title ?? currentSettings.support_button_label,
        donation_description: currentSettings.donation_message ?? currentSettings.donation_description,
      });
      setOriginalSettings(saved);
      setCurrentSettings(saved);
      setKeySettings((prev) => ({
        ...prev,
        key_generation_enabled: saved.key_generation_enabled ?? prev.key_generation_enabled,
        shortener_url: saved.shortener_url ?? '',
        tutorial_video_url: saved.tutorial_video_url ?? '',
        key_expiry_hours: saved.key_expiry_hours ?? prev.key_expiry_hours,
        free_access_duration: saved.free_access_duration ?? prev.free_access_duration,
        free_access_unit: (saved.free_access_unit as 'minutes' | 'hours' | 'days') ?? prev.free_access_unit,
      }));
      setIsSettingsDirty(false);
      setSettingsSaveStatus('saved');
      setSettingsSaveError(null);
      showToast('All settings saved to database & synced to APK');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings';
      setSettingsSaveStatus('error');
      setSettingsSaveError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Cloud persistence runs automatically on the backend (no manual sync UI needed)

  // Section 11: Admin Security Handlers
  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail || !newAdminPassword) return;
    try {
      await api.createOrUpdateAdmin(newAdminEmail, newAdminPassword, newAdminRole);
      setNewAdminEmail('');
      setNewAdminPassword('');
      const updated = await api.getAdminAdmins();
      setAdmins(updated);
      showToast('Administrator account configured');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save admin account';
      showToast(msg, 'error');
    }
  };

  const handleRequestDeleteAdmin = (adm: UserProfile) => {
    setAdminDeleteError(null);
    setAdminPendingDelete(adm);
  };

  const handleConfirmDeleteAdmin = async () => {
    if (!adminPendingDelete || isDeletingAdmin) return;
    setIsDeletingAdmin(true);
    setAdminDeleteError(null);
    try {
      const res = await api.deleteAdmin(adminPendingDelete.id);
      const updatedAdmins = await api.getAdminAdmins();
      setAdmins(updatedAdmins);
      setUsers((prev) => prev.filter((u) => u.id !== adminPendingDelete.id));
      setAdminPendingDelete(null);
      showToast(res.message || 'Administrator account removed');
      api.getAdminStats().then(setStats).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete administrator account';
      setAdminDeleteError(msg);
      showToast(msg, 'error');
    } finally {
      setIsDeletingAdmin(false);
    }
  };

  // Section: App Customization Handlers
  const handleSaveAppName = async () => {
    const trimmed = customAppName.trim();
    if (!trimmed) {
      showToast('Application Name cannot be empty.', 'error');
      return;
    }
    try {
      setIsSavingCustomization(true);
      const saved = await api.saveAdminSettings({ app_name: trimmed });
      setOriginalSettings(saved);
      setCurrentSettings(saved);
      showToast('Application name updated successfully');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update application name';
      showToast(msg, 'error');
    } finally {
      setIsSavingCustomization(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setLogoUploadError('Please select a valid image format (PNG, JPG, SVG, WebP).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setLogoUploadError(`Logo file size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds 2MB limit. Please select a smaller image.`);
      return;
    }

    setSelectedLogoFileName(file.name);
    setSelectedLogoMimeType(file.type);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomAppLogo(reader.result);
      }
    };
    reader.onerror = () => {
      setLogoUploadError('Failed to read the selected image file.');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAppLogo = async () => {
    setLogoUploadError(null);
    try {
      setIsSavingCustomization(true);
      const trimmedLogo = customAppLogo.trim();

      // If user cleared the logo
      if (!trimmedLogo) {
        const saved = await api.saveAdminSettings({ app_logo_url: '' });
        setOriginalSettings(saved);
        setCurrentSettings(saved);
        setCustomAppLogo('');
        showToast('Application logo reset to default icon');
        onRefreshPublicData();
        return;
      }

      // If logo is a base64 Data URI from file selection, upload via dedicated endpoint
      if (trimmedLogo.startsWith('data:image/')) {
        const res = await api.uploadLogo(trimmedLogo, selectedLogoFileName, selectedLogoMimeType);
        setCustomAppLogo(res.url);
        setOriginalSettings(res.settings);
        setCurrentSettings(res.settings);
        showToast(res.message || 'Application logo uploaded and saved successfully');
        onRefreshPublicData();
        return;
      }

      // If logo is a direct URL or path
      if (!trimmedLogo.startsWith('http://') && !trimmedLogo.startsWith('https://') && !trimmedLogo.startsWith('/')) {
        const err = 'Logo URL must be a valid URL starting with http://, https://, or an uploaded image.';
        setLogoUploadError(err);
        showToast(err, 'error');
        return;
      }

      const saved = await api.saveAdminSettings({ app_logo_url: trimmedLogo });
      setOriginalSettings(saved);
      setCurrentSettings(saved);
      showToast('Application logo updated successfully');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save application logo';
      setLogoUploadError(msg);
      showToast(msg, 'error');
    } finally {
      setIsSavingCustomization(false);
    }
  };

  const isValidHexCode = (color: string) => /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color.trim());

  const handleSaveTheme = async () => {
    if (!isValidHexCode(customThemePrimary)) {
      showToast('Primary color must be a valid hex color code (e.g. #FF2525)', 'error');
      return;
    }
    if (!isValidHexCode(customThemeSecondary)) {
      showToast('Secondary color must be a valid hex color code (e.g. #C90000)', 'error');
      return;
    }
    if (!isValidHexCode(customThemeBackground)) {
      showToast('Background color must be a valid hex color code (e.g. #090909)', 'error');
      return;
    }
    if (!isValidHexCode(customThemeText)) {
      showToast('Text color must be a valid hex color code (e.g. #F5F5F5)', 'error');
      return;
    }
    if (!isValidHexCode(customThemeButton)) {
      showToast('Button color must be a valid hex color code (e.g. #FF2525)', 'error');
      return;
    }

    try {
      setIsSavingCustomization(true);
      const saved = await api.saveAdminSettings({
        theme_primary: customThemePrimary.trim(),
        theme_secondary: customThemeSecondary.trim(),
        theme_background: customThemeBackground.trim(),
        theme_text: customThemeText.trim(),
        theme_button: customThemeButton.trim(),
      });
      setOriginalSettings(saved);
      setCurrentSettings(saved);
      showToast('Theme colors saved and applied successfully');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save theme';
      showToast(msg, 'error');
    } finally {
      setIsSavingCustomization(false);
    }
  };

  const handleResetThemeToDefault = () => {
    setCustomThemePrimary('#FF2525');
    setCustomThemeSecondary('#C90000');
    setCustomThemeBackground('#090909');
    setCustomThemeText('#F5F5F5');
    setCustomThemeButton('#FF2525');
    showToast('Theme reset to Red Alert defaults. Click "Save Changes" to persist.');
  };

  const handleApplyPalettePreset = (preset: {
    primary: string;
    secondary: string;
    bg: string;
    text: string;
    button: string;
  }) => {
    setCustomThemePrimary(preset.primary);
    setCustomThemeSecondary(preset.secondary);
    setCustomThemeBackground(preset.bg);
    setCustomThemeText(preset.text);
    setCustomThemeButton(preset.button);
    showToast('Palette selected. Review the preview and click "Save Changes" to apply.');
  };

  const handleSaveVipTheme = async () => {
    if (!isValidHexCode(customVipBg)) {
      showToast('VIP Background color must be a valid hex color code (e.g. #090d16)', 'error');
      return;
    }
    if (!isValidHexCode(customVipCard)) {
      showToast('VIP Card color must be a valid hex color code (e.g. #0f172a)', 'error');
      return;
    }
    if (!isValidHexCode(customVipAccent)) {
      showToast('VIP Accent color must be a valid hex color code (e.g. #f59e0b)', 'error');
      return;
    }
    if (!isValidHexCode(customVipText)) {
      showToast('VIP Text color must be a valid hex color code (e.g. #f8fafc)', 'error');
      return;
    }
    if (!isValidHexCode(customVipButton)) {
      showToast('VIP Button color must be a valid hex color code (e.g. #eab308)', 'error');
      return;
    }
    if (!isValidHexCode(customVipBorder)) {
      showToast('VIP Border color must be a valid hex color code (e.g. #1e293b)', 'error');
      return;
    }

    try {
      setIsSavingCustomization(true);
      const saved = await api.saveAdminSettings({
        vip_theme_background: customVipBg.trim(),
        vip_theme_card: customVipCard.trim(),
        vip_theme_accent: customVipAccent.trim(),
        vip_theme_text: customVipText.trim(),
        vip_theme_button: customVipButton.trim(),
        vip_theme_border: customVipBorder.trim(),
      });
      setOriginalSettings(saved);
      setCurrentSettings(saved);
      showToast('VIP Section theme colors saved persistently and applied to VIP page');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save VIP theme';
      showToast(msg, 'error');
    } finally {
      setIsSavingCustomization(false);
    }
  };

  const handleResetVipThemeToDefault = () => {
    setCustomVipBg('#090909');
    setCustomVipCard('#1D1D1D');
    setCustomVipAccent('#FF2525');
    setCustomVipText('#F5F5F5');
    setCustomVipButton('#FF2525');
    setCustomVipBorder('#454545');
    showToast('VIP theme reset to Red Alert default. Click "Save Changes" to persist.');
  };

  const handleApplyVipPalettePreset = (preset: {
    bg: string;
    card: string;
    accent: string;
    text: string;
    button: string;
    border: string;
  }) => {
    setCustomVipBg(preset.bg);
    setCustomVipCard(preset.card);
    setCustomVipAccent(preset.accent);
    setCustomVipText(preset.text);
    setCustomVipButton(preset.button);
    setCustomVipBorder(preset.border);
    showToast('VIP palette selected. Review preview and click "Save Changes" to apply.');
  };

  const navItems: { id: AdminSection; label: string; icon: React.ComponentType<{ className?: string }>; superAdminOnly?: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'platforms', label: 'Platforms', icon: Layers },
    { id: 'platform_logs', label: 'Platform Logs', icon: BarChart3 },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'vip', label: 'VIP Management', icon: Crown },
    { id: 'plans', label: 'VIP Plans', icon: CreditCard },
    { id: 'payments', label: 'Payment Management', icon: CreditCard },
    { id: 'history', label: 'Login History', icon: History },
    { id: 'feedback', label: 'Feedback Management', icon: MessageSquare },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'growth_board', label: 'Offer Board & Motivation', icon: Sparkles },
    { id: 'themes', label: 'Theme', icon: Palette },
    { id: 'festivals', label: 'Festival Decoration Manager', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'admin_control', label: 'ADMIN CONTROL', icon: Shield, superAdminOnly: true },
    { id: 'vip_features', label: 'VIP FEATURE MANAGEMENT', icon: Crown },
    { id: 'referral_management', label: 'REFERRAL MANAGEMENT', icon: Sparkles },
    { id: 'advanced_analytics', label: 'Advanced Analytics', icon: BarChart3, superAdminOnly: true },
    { id: 'audit_logs', label: 'Audit Logs', icon: FileText },
    { id: 'backups', label: 'Backup & Recovery', icon: Database, superAdminOnly: true },
    { id: 'security', label: 'Admin Security', icon: ShieldAlert, superAdminOnly: true },
  ];

  return (
    <div className="min-h-screen ra-grid-bg bg-[#090909] text-[#F5F5F5] flex flex-col w-full pb-12">
      {/* Red Alert Admin Command Header */}
      <header className="sticky top-0 z-30 w-full bg-[#090909]/95 backdrop-blur-md border-b border-[#454545] px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#141414] border border-[#454545] flex items-center justify-center font-display font-black text-[#FF2525] shadow-md overflow-hidden p-1 shrink-0">
            {currentSettings?.app_logo_url ? (
              <img
                src={currentSettings.app_logo_url}
                alt={currentSettings.app_name || 'STUDY BLUNDER Admin'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain select-none"
              />
            ) : (
              'SB'
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-sm sm:text-base font-black text-[#F5F5F5] flex items-center gap-2 truncate uppercase tracking-tight">
              <span className="truncate">
                {currentSettings?.app_name ? `${currentSettings.app_name} ADMIN` : 'STUDY BLUNDER ADMIN'}
              </span>
              <span className="font-mono-tech text-[10px] font-bold px-2 py-0.5 rounded bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/50 shrink-0 uppercase">
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </span>
            </h1>
            <p className="font-mono-tech text-[11px] text-[#929292] truncate">
              OPERATOR: {currentUser.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClose}
            className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#242424] text-xs font-semibold text-[#C5C5C5] hover:text-[#F5F5F5] border border-[#454545] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#FF2525]" />
            <span className="hidden sm:inline">Student App</span>
          </button>
          <button
            onClick={onLogout}
            className="min-h-[40px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF2525]/12 hover:bg-[#FF2525]/25 border border-[#FF2525]/50 text-xs font-semibold text-[#FF2525] transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Command Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-18 right-4 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2.5 text-xs font-semibold max-w-[92vw] ${
            toastMessage.type === 'success'
              ? 'bg-[#1D1D1D] border-[#C5C5C5]/70 text-[#F5F5F5]'
              : 'bg-[#1D1D1D] border-[#FF2525] text-[#FF2525]'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#FF2525] shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Mobile Horizontal Command Rail */}
      <div className="lg:hidden w-full bg-[#141414] border-b border-[#454545] sticky top-[69px] z-20">
        <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2.5 no-scrollbar">
          {navItems.map((item) => {
            if (item.superAdminOnly && !isSuperAdmin) return null;
            if (!canAccessSection(item.id)) return null;
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors shrink-0 border ${
                  isActive
                    ? 'bg-[#FF2525] text-[#F5F5F5] border-[#FF762E]/60 shadow-[0_4px_14px_rgba(255,37,37,0.3)]'
                    : 'bg-[#1D1D1D] text-[#C5C5C5] border-[#454545] hover:border-[#FF2525]/60 hover:text-[#F5F5F5]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Sidebar + Main Command Viewport */}
      <div className="flex-1 flex w-full max-w-[1440px] mx-auto">
        <aside className="hidden lg:flex lg:flex-col lg:w-64 shrink-0 bg-[#141414]/90 border-r border-[#454545] p-3 sticky top-[73px] h-[calc(100vh-73px)] overflow-y-auto no-scrollbar">
          <div className="px-2.5 pb-2 mb-2 border-b border-[#454545]/70">
            <p className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#929292]">
              COMMAND MODULES
            </p>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              if (item.superAdminOnly && !isSuperAdmin) return null;
              if (!canAccessSection(item.id)) return null;
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full min-h-[40px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold text-left transition-colors border ${
                    isActive
                      ? 'bg-[#FF2525]/15 text-[#F5F5F5] border-[#FF2525] shadow-[inset_3px_0_0_#FF2525]'
                      : 'text-[#C5C5C5] border-transparent hover:bg-[#1D1D1D] hover:text-[#F5F5F5] hover:border-[#454545]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#FF2525]' : 'text-[#929292]'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="p-3.5 sm:p-6 flex-1 min-w-0 w-full">

        {/* 1. DASHBOARD */}
        {activeSection === 'dashboard' && stats && (
          <div className="space-y-5">
            <div className="ra-panel ra-corners rounded-2xl p-5 relative overflow-hidden">
              <div className="h-1 w-full ra-hazard-bar absolute top-0 left-0 right-0" />
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div>
                  <p className="font-mono-tech text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
                    COMMAND OVERVIEW
                  </p>
                  <h2 className="font-display text-xl sm:text-2xl font-black text-[#F5F5F5] uppercase tracking-tight mt-0.5">
                    Live System Analytics
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setActiveSection('settings')}
                    className="min-h-[40px] px-3.5 py-2 rounded-lg ra-btn-primary text-xs font-bold uppercase tracking-wider"
                  >
                    System Settings
                  </button>
                  <button
                    onClick={() => setActiveSection('platforms')}
                    className="min-h-[40px] px-3.5 py-2 rounded-lg ra-btn-secondary text-xs font-bold uppercase tracking-wider"
                  >
                    Manage Platforms
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              <div className="ra-panel rounded-xl p-4">
                <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#929292] font-bold">
                  Registered Users
                </p>
                <p className="font-display text-2xl sm:text-3xl font-black text-[#F5F5F5] mt-1.5 font-mono-tech">
                  {stats.total_users}
                </p>
              </div>
              <div className="ra-panel-red rounded-xl p-4">
                <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#FF762E] font-bold">
                  Active VIP Members
                </p>
                <p className="font-display text-2xl sm:text-3xl font-black text-[#F5F5F5] mt-1.5 font-mono-tech">
                  {stats.active_vips}
                </p>
              </div>
              <div className="ra-panel rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#C5C5C5] font-bold">
                    Active Keys
                  </p>
                  <Key className="w-3.5 h-3.5 text-[#FF2525]" />
                </div>
                <p className="font-display text-2xl sm:text-3xl font-black text-[#FF2525] mt-1.5 font-mono-tech">
                  {stats.active_keys ?? 0}
                </p>
                <p className="text-[10px] text-[#929292] mt-0.5">Valid unexpired sessions</p>
              </div>
              <div className="ra-panel rounded-xl p-4">
                <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#929292] font-bold">
                  Platforms Live
                </p>
                <p className="font-display text-2xl sm:text-3xl font-black text-[#F5F5F5] mt-1.5 font-mono-tech">
                  {stats.active_platforms} / {stats.total_platforms}
                </p>
              </div>
              <div className="ra-panel rounded-xl p-4">
                <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#929292] font-bold">
                  Login Audits
                </p>
                <p className="font-display text-2xl sm:text-3xl font-black text-[#C5C5C5] mt-1.5 font-mono-tech">
                  {stats.recent_logins_count}
                </p>
              </div>
            </div>

            <div className="ra-panel rounded-2xl p-5">
              <h3 className="font-mono-tech text-xs font-bold text-[#C5C5C5] uppercase tracking-[0.14em] mb-3">
                Persistence &amp; Synchronization Architecture
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-[#C5C5C5] py-2 border-b border-[#454545]/60">
                  <span>Primary Persistence Engine</span>
                  <span className="font-mono-tech text-[#FF2525] font-bold">Verified Database + Atomic Rollback</span>
                </div>
                <div className="flex items-center justify-between text-[#C5C5C5] py-2 border-b border-[#454545]/60">
                  <span>APK Real-Time Config Sync</span>
                  <span className="font-mono-tech text-[#F5F5F5] font-bold">SSE Push + No-Store HTTP + Resume Refresh</span>
                </div>
                <div className="flex items-center justify-between text-[#C5C5C5] py-2 border-b border-[#454545]/60">
                  <span>Supabase Migration Ready</span>
                  <span className="font-mono-tech text-[#FF762E] font-bold">supabase_migration.sql</span>
                </div>
                <div className="flex items-center justify-between text-[#C5C5C5] py-2">
                  <span>Your Role Permissions</span>
                  <span className="font-mono-tech text-[#F5F5F5] font-bold">
                    {isSuperAdmin ? 'Super Admin (Full Settings Access)' : 'Admin (Content & User Ops)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section Error Banner if backend query failed */}
        {sectionError && (
          <div className="mb-4 p-3 rounded-2xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0" />
              <span>{sectionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setSectionError(null)}
              className="text-[#FF2525] hover:text-white font-bold px-2 py-0.5 rounded bg-[#FF2525]/15"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 2. PLATFORMS */}
        {activeSection === 'platforms' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Platform Management</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                    {platforms.length} Total ({platforms.filter((p) => p.status === 'active').length} Active)
                  </span>
                </h2>
                <p className="text-xs text-[#929292]">Configure cards, external URLs, and statuses</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedPlatformIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBulkDeleteModal({
                        section: 'platforms',
                        title: `Delete ${selectedPlatformIds.size} Selected Platform(s)`,
                        ids: Array.from(selectedPlatformIds),
                        executing: false,
                        error: null,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white text-xs font-bold shadow-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedPlatformIds.size})</span>
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => handleOpenCleanupModal('platforms_inactive', 'Clean Inactive Platforms')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clean Inactive ({platforms.filter((p) => p.status === 'inactive').length})</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditingPlatform({
                      name: '',
                      category: 'General',
                      logo_url: '',
                      target_url: 'https://',
                      access_type: 'normal',
                      vip_target_url: '',
                      status: 'active',
                      is_visible: true,
                      display_order: platforms.length + 1,
                    });
                    setIsCreatingPlatform(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white text-xs font-bold shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Platform</span>
                </button>
              </div>
            </div>

            {/* Platform Selection Toolbar */}
            {platforms.length > 0 && (
              <div className="bg-[#1D1D1D] border border-[#454545]/80 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[#929292]">
                    Selected: <strong className="text-white">{selectedPlatformIds.size}</strong> of {platforms.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlatformIds(new Set(platforms.map((p) => p.id)))}
                    className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-semibold text-[11px]"
                  >
                    Select All ({platforms.length})
                  </button>
                  {selectedPlatformIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedPlatformIds(new Set())}
                      className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] text-[#929292] font-semibold text-[11px]"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Platform Form Modal */}
            {(isCreatingPlatform || editingPlatform) && (
              <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-3xl max-w-md w-full p-6 space-y-3">
                  <h3 className="text-sm font-bold text-white">
                    {isCreatingPlatform ? 'Add New Platform' : 'Edit Platform'}
                  </h3>

                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5]">Platform Name</label>
                    <input
                      type="text"
                      value={editingPlatform?.name || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, name: e.target.value })}
                      placeholder="e.g. SELECTION WAY TEST"
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5]">Category</label>
                    <input
                      type="text"
                      value={editingPlatform?.category || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, category: e.target.value })}
                      placeholder="e.g. General, Banking, SSC"
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5]">Logo Image URL</label>
                    <input
                      type="text"
                      value={editingPlatform?.logo_url || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, logo_url: e.target.value })}
                      placeholder="https://..."
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5]">Destination URL (Opens when clicked)</label>
                    <input
                      type="text"
                      value={editingPlatform?.target_url || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, target_url: e.target.value })}
                      placeholder="https://testbook.com"
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  {/* Access Type & Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Access Type</label>
                      <select
                        value={editingPlatform?.access_type || 'normal'}
                        onChange={(e) =>
                          setEditingPlatform({
                            ...editingPlatform,
                            access_type: e.target.value as 'normal' | 'vip',
                          })
                        }
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="normal">NORMAL (OPEN Button)</option>
                        <option value="vip">VIP (Crown Button)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Status</label>
                      <select
                        value={editingPlatform?.status || 'active'}
                        onChange={(e) =>
                          setEditingPlatform({ ...editingPlatform, status: e.target.value as 'active' | 'inactive' })
                        }
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  {/* VIP Redirect URL */}
                  <div className={`p-3 rounded-2xl border transition-all ${
                    editingPlatform?.access_type === 'vip'
                      ? 'bg-[#FF2525]/20 border-[#FF2525]/50'
                      : 'bg-[#141414]/40 border-[#454545]/50'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Crown className={`w-3.5 h-3.5 ${editingPlatform?.access_type === 'vip' ? 'text-[#FF762E]' : 'text-[#929292]'}`} />
                      <label className="text-[11px] font-bold text-[#C5C5C5]">VIP Redirect URL</label>
                    </div>
                    <p className="text-[10px] text-[#929292] mb-1.5 leading-relaxed">
                      Opens exclusively for active VIP members. If empty, falls back to destination URL.
                    </p>
                    <input
                      type="text"
                      value={editingPlatform?.vip_target_url || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, vip_target_url: e.target.value })}
                      placeholder="https://vip.example.com/exclusive-portal"
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Display Order</label>
                      <input
                        type="number"
                        value={editingPlatform?.display_order || 1}
                        onChange={(e) =>
                          setEditingPlatform({ ...editingPlatform, display_order: Number(e.target.value) })
                        }
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="plat_vis"
                      checked={editingPlatform?.is_visible !== false}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, is_visible: e.target.checked })}
                    />
                    <label htmlFor="plat_vis" className="text-xs text-[#C5C5C5]">
                      Visible to public visitors
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#454545]">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlatform(null);
                        setIsCreatingPlatform(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-[#1D1D1D] text-xs font-semibold text-[#C5C5C5]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSavePlatform(editingPlatform!)}
                      className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-xs font-bold text-white flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Platforms Table / List */}
            <div className="space-y-2">
              {platforms.map((p, idx) => (
                <div
                  key={p.id}
                  className={`bg-[#1D1D1D] border rounded-2xl p-3 flex items-center justify-between gap-3 transition-colors ${
                    selectedPlatformIds.has(p.id) ? 'border-[#FF2525]/70 bg-[#FF2525]/15' : 'border-[#454545]/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedPlatformIds.has(p.id)}
                      onChange={() => toggleIdInSet(p.id, setSelectedPlatformIds)}
                      className="w-4 h-4 accent-[#FF2525] rounded cursor-pointer shrink-0"
                    />
                    <div className="w-10 h-10 rounded-xl bg-[#141414] border border-[#454545] flex items-center justify-center overflow-hidden shrink-0">
                      {p.logo_url ? (
                        <img src={p.logo_url} alt={p.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs font-bold text-[#929292]">{p.name.substring(0, 2)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#1D1D1D]/80 text-[#C5C5C5] border border-[#454545]/60">
                          #{idx + 1}
                        </span>
                        <p className="text-xs font-bold text-white truncate">{p.name}</p>
                        {p.access_type === 'vip' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FF762E]/20 text-[#FF762E] font-extrabold text-[9px] border border-[#FF762E]/50">
                            <Crown className="w-2.5 h-2.5 text-[#FF762E]" />
                            VIP
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-[#1D1D1D] text-[#929292] font-semibold text-[9px]">
                            NORMAL
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#929292] truncate">{p.target_url}</p>
                      {p.access_type === 'vip' && p.vip_target_url && (
                        <p className="text-[10px] text-[#FF2525] truncate font-medium">
                          VIP Redirect: {p.vip_target_url}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                        <span className={p.status === 'active' ? 'text-[#F5F5F5] font-bold' : 'text-[#929292]'}>
                          ● {p.status}
                        </span>
                        <span>Order: {p.display_order}</span>
                        {!p.is_visible && <span className="text-[#FF762E] font-semibold">(Hidden)</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0 || Boolean(movingPlatformId)}
                      onClick={() => handleMovePlatform(idx, 'up')}
                      className="p-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#C5C5C5] disabled:opacity-35 disabled:cursor-not-allowed"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === platforms.length - 1 || Boolean(movingPlatformId)}
                      onClick={() => handleMovePlatform(idx, 'down')}
                      className="p-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#C5C5C5] disabled:opacity-35 disabled:cursor-not-allowed"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingPlatform(p)}
                      className="p-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF2525]"
                      title="Edit"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPlatformPendingDelete(p)}
                      className="p-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#FF2525]/15 text-[#FF2525]"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {platformPendingDelete && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete Platform</h3>
                  <p className="text-[#C5C5C5]">
                    Are you sure you want to permanently delete <strong className="text-white">{platformPendingDelete.name}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPlatformPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePlatform(platformPendingDelete.id)}
                      className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2B. PLATFORM LOGS */}
        {activeSection === 'platform_logs' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#FF2525]" />
                  <span>Platform Logs</span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                    Timezone: {platformLogsData?.timezone || 'Asia/Kolkata'} (IST)
                  </span>
                </h2>
                <p className="text-xs text-[#929292]">
                  Real-time platform open statistics, daily activity breakdown, and per-platform usage history
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSectionLoading(true);
                  api
                    .getAdminPlatformLogs({
                      search: platformLogsSearch,
                      sortBy: platformLogsSortBy,
                      sortOrder: platformLogsSortOrder,
                      startDate: platformLogsStartDate || undefined,
                      endDate: platformLogsEndDate || undefined,
                      page: platformLogsPage,
                      limit: platformLogsLimit,
                    })
                    .then((res) => setPlatformLogsData(res))
                    .catch((err: unknown) =>
                      showToast(err instanceof Error ? err.message : 'Failed to refresh platform logs', 'error')
                    )
                    .finally(() => setSectionLoading(false));
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] text-xs font-bold border border-[#454545]/70 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#FF2525]" />
                <span>Refresh Logs</span>
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#929292] font-semibold">Total Platforms</p>
                  <Layers className="w-4 h-4 text-[#929292]" />
                </div>
                <p className="text-2xl font-extrabold text-white mt-1.5 tabular-nums">
                  {platformLogsData?.summary.total_platforms ?? platforms.length}
                </p>
                <p className="text-[10px] text-[#929292] mt-0.5">Tracked across portal</p>
              </div>

              <div className="bg-[#1D1D1D] border border-[#C5C5C5]/60 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#F5F5F5] font-semibold">Opens Today</p>
                  <Clock className="w-4 h-4 text-[#F5F5F5]" />
                </div>
                <p className="text-2xl font-extrabold text-[#F5F5F5] mt-1.5 tabular-nums">
                  {platformLogsData?.summary.opens_today ?? 0}
                </p>
                <p className="text-[10px] text-[#929292] mt-0.5">Today in IST (Asia/Kolkata)</p>
              </div>

              <div className="bg-[#1D1D1D] border border-[#FF2525]/40 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#FF2525] font-semibold">Opens in the Last 7 Days</p>
                  <Calendar className="w-4 h-4 text-[#FF2525]" />
                </div>
                <p className="text-2xl font-extrabold text-[#FF2525] mt-1.5 tabular-nums">
                  {platformLogsData?.summary.opens_last_7_days ?? 0}
                </p>
                <p className="text-[10px] text-[#929292] mt-0.5">Rolling 7-day window</p>
              </div>

              <div className="bg-[#1D1D1D] border border-[#FF2525]/40 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#FF2525] font-semibold">Total Recorded Opens</p>
                  <BarChart3 className="w-4 h-4 text-[#FF2525]" />
                </div>
                <p className="text-2xl font-extrabold text-[#FF2525] mt-1.5 tabular-nums">
                  {platformLogsData?.summary.total_recorded_opens ?? 0}
                </p>
                <p className="text-[10px] text-[#929292] mt-0.5">All-time recorded opens</p>
              </div>
            </div>

            {/* Search, Sort & Date-Range Filter Bar */}
            <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Search by platform name */}
                <div className="relative">
                  <Search className="w-4 h-4 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={platformLogsSearch}
                    onChange={(e) => {
                      setPlatformLogsSearch(e.target.value);
                      setPlatformLogsPage(1);
                    }}
                    placeholder="Search by platform name..."
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF2525]/50"
                  />
                </div>

                {/* Sort By */}
                <div className="flex items-center gap-1.5">
                  <select
                    value={platformLogsSortBy}
                    onChange={(e) => {
                      setPlatformLogsSortBy(
                        e.target.value as
                          | 'total_opens'
                          | 'today_opens'
                          | 'yesterday_opens'
                          | 'last_7_days_opens'
                          | 'last_30_days_opens'
                          | 'last_opened_at'
                          | 'platform_name'
                      );
                      setPlatformLogsPage(1);
                    }}
                    className="flex-1 bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF2525]/50"
                  >
                    <option value="total_opens">Sort: Most Used (Total Opens)</option>
                    <option value="today_opens">Sort: Today&apos;s Opens</option>
                    <option value="yesterday_opens">Sort: Yesterday&apos;s Opens</option>
                    <option value="last_7_days_opens">Sort: Last 7 Days Opens</option>
                    <option value="last_30_days_opens">Sort: Last 30 Days Opens</option>
                    <option value="last_opened_at">Sort: Last Opened Time</option>
                    <option value="platform_name">Sort: Platform Name (A-Z)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPlatformLogsSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                    className="px-2.5 py-2 rounded-xl bg-[#141414] border border-[#454545] hover:border-[#454545] text-xs font-bold text-[#C5C5C5]"
                    title={platformLogsSortOrder === 'desc' ? 'Descending (High to Low)' : 'Ascending (Low to High)'}
                  >
                    {platformLogsSortOrder === 'desc' ? 'DESC' : 'ASC'}
                  </button>
                </div>

                {/* Start Date */}
                <div className="flex items-center gap-2 bg-[#141414] border border-[#454545] rounded-xl px-3 py-1.5">
                  <span className="text-[10px] font-bold text-[#929292] shrink-0">From:</span>
                  <input
                    type="date"
                    value={platformLogsStartDate}
                    onChange={(e) => {
                      setPlatformLogsStartDate(e.target.value);
                      setPlatformLogsPage(1);
                    }}
                    className="w-full bg-transparent text-xs text-white focus:outline-none"
                  />
                </div>

                {/* End Date */}
                <div className="flex items-center gap-2 bg-[#141414] border border-[#454545] rounded-xl px-3 py-1.5">
                  <span className="text-[10px] font-bold text-[#929292] shrink-0">To:</span>
                  <input
                    type="date"
                    value={platformLogsEndDate}
                    onChange={(e) => {
                      setPlatformLogsEndDate(e.target.value);
                      setPlatformLogsPage(1);
                    }}
                    className="w-full bg-transparent text-xs text-white focus:outline-none"
                  />
                  {(platformLogsStartDate || platformLogsEndDate || platformLogsSearch) && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlatformLogsStartDate('');
                        setPlatformLogsEndDate('');
                        setPlatformLogsSearch('');
                        setPlatformLogsPage(1);
                      }}
                      className="text-[10px] font-bold text-[#FF2525] hover:text-[#FF2525] shrink-0"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Detailed Platform Logs Table */}
            <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#454545] bg-[#141414]/80 text-[11px] font-extrabold text-[#C5C5C5] uppercase tracking-wider">
                      <th className="py-3 px-4">Platform</th>
                      <th className="py-3 px-3 text-right">Today&apos;s Opens</th>
                      <th className="py-3 px-3 text-right">Yesterday&apos;s Opens</th>
                      <th className="py-3 px-3 text-right">Last 7 Days</th>
                      <th className="py-3 px-3 text-right">Last 30 Days</th>
                      <th className="py-3 px-3 text-right">Total Opens</th>
                      <th className="py-3 px-4">Last Opened</th>
                      <th className="py-3 px-3 text-right">History</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#454545]/70 text-xs">
                    {sectionLoading && !platformLogsData ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-[#929292]">
                          Loading platform usage statistics...
                        </td>
                      </tr>
                    ) : !platformLogsData || platformLogsData.platforms.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-[#929292]">
                          No platforms match the current search or filter criteria.
                        </td>
                      </tr>
                    ) : (
                      platformLogsData.platforms.map((item) => (
                        <tr
                          key={item.platform_id}
                          onClick={() => handleOpenPlatformHistory(item.platform_id, 1)}
                          className="hover:bg-[#141414]/70 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3 min-w-[180px]">
                              <div className="w-9 h-9 rounded-xl bg-[#141414] border border-[#454545] flex items-center justify-center overflow-hidden shrink-0">
                                {item.logo_url ? (
                                  <img
                                    src={item.logo_url}
                                    alt={item.platform_name}
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <span className="text-[11px] font-bold text-[#929292]">
                                    {item.platform_name.substring(0, 2)}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-white truncate">{item.platform_name}</span>
                                  {item.access_type === 'vip' ? (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#FF762E]/20 text-[#FF762E] font-extrabold text-[9px] border border-[#FF762E]/50">
                                      <Crown className="w-2.5 h-2.5 text-[#FF762E]" />
                                      VIP
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-[#1D1D1D] text-[#929292] font-semibold text-[9px]">
                                      NORMAL
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-[#929292]">{item.category}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-extrabold text-[#F5F5F5] tabular-nums">
                            {item.today_opens}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-[#F5F5F5] tabular-nums">
                            {item.yesterday_opens}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-[#FF2525] tabular-nums">
                            {item.last_7_days_opens}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-[#FF2525] tabular-nums">
                            {item.last_30_days_opens}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">
                            <span className="font-extrabold text-white">{item.total_opens}</span>
                            {(platformLogsStartDate || platformLogsEndDate) && (
                              <span className="block text-[10px] text-[#FF2525] font-semibold">
                                In range: {item.filtered_opens}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-[#C5C5C5] whitespace-nowrap">
                            {formatIstDateTime(item.last_opened_at)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPlatformHistory(item.platform_id, 1);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF2525]/20 hover:bg-[#FF2525]/40 border border-[#FF2525]/30 text-[#FF2525] font-bold text-[11px]"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Details</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {platformLogsData && platformLogsData.pagination.total_pages > 1 && (
                <div className="px-4 py-3 border-t border-[#454545] flex items-center justify-between text-xs">
                  <span className="text-[#929292]">
                    Page <strong className="text-white">{platformLogsData.pagination.page}</strong> of{' '}
                    <strong className="text-white">{platformLogsData.pagination.total_pages}</strong> (
                    {platformLogsData.pagination.total_items} platforms)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={platformLogsData.pagination.page <= 1}
                      onClick={() => setPlatformLogsPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] disabled:opacity-40 flex items-center gap-1"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>
                    <button
                      type="button"
                      disabled={platformLogsData.pagination.page >= platformLogsData.pagination.total_pages}
                      onClick={() =>
                        setPlatformLogsPage((p) => Math.min(platformLogsData.pagination.total_pages, p + 1))
                      }
                      className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] disabled:opacity-40 flex items-center gap-1"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Detailed Platform Usage History Modal */}
            {(selectedPlatformHistory || historyLoading) && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-3xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-[#454545] flex items-center justify-between gap-3">
                    {selectedPlatformHistory ? (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-[#141414] border border-[#454545] flex items-center justify-center overflow-hidden shrink-0">
                          {selectedPlatformHistory.platform.logo_url ? (
                            <img
                              src={selectedPlatformHistory.platform.logo_url}
                              alt={selectedPlatformHistory.platform.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-xs font-bold text-[#929292]">
                              {selectedPlatformHistory.platform.name.substring(0, 2)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                            {selectedPlatformHistory.platform.name} — Usage History
                          </h3>
                          <p className="text-[11px] text-[#929292]">
                            Last Opened: {formatIstDateTime(selectedPlatformHistory.stats.last_opened_at)} (IST)
                          </p>
                        </div>
                      </div>
                    ) : (
                      <h3 className="text-sm font-bold text-white">Loading Platform Usage History...</h3>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedPlatformHistory(null)}
                      className="p-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#C5C5C5]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {selectedPlatformHistory && (
                    <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
                      {/* Per-Platform Metric Breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div className="bg-[#141414] border border-[#454545] rounded-xl p-3">
                          <span className="text-[10px] text-[#929292] font-semibold">Today&apos;s Opens</span>
                          <p className="text-lg font-extrabold text-[#F5F5F5] mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.today_opens}
                          </p>
                        </div>
                        <div className="bg-[#141414] border border-[#454545] rounded-xl p-3">
                          <span className="text-[10px] text-[#929292] font-semibold">Yesterday&apos;s Opens</span>
                          <p className="text-lg font-extrabold text-[#F5F5F5] mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.yesterday_opens}
                          </p>
                        </div>
                        <div className="bg-[#141414] border border-[#454545] rounded-xl p-3">
                          <span className="text-[10px] text-[#929292] font-semibold">Last 7 Days</span>
                          <p className="text-lg font-extrabold text-[#FF2525] mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.last_7_days_opens}
                          </p>
                        </div>
                        <div className="bg-[#141414] border border-[#454545] rounded-xl p-3">
                          <span className="text-[10px] text-[#929292] font-semibold">Last 30 Days</span>
                          <p className="text-lg font-extrabold text-[#FF2525] mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.last_30_days_opens}
                          </p>
                        </div>
                        <div className="bg-[#141414] border border-[#454545] rounded-xl p-3">
                          <span className="text-[10px] text-[#929292] font-semibold">Total Opens</span>
                          <p className="text-lg font-extrabold text-white mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.total_opens}
                          </p>
                        </div>
                      </div>

                      {/* Daily Breakdown */}
                      {selectedPlatformHistory.daily_breakdown.length > 0 && (
                        <div className="bg-[#141414] border border-[#454545] rounded-2xl p-3.5 space-y-2">
                          <h4 className="text-[11px] font-extrabold text-[#C5C5C5] uppercase tracking-wider">
                            Daily Activity Breakdown (Asia/Kolkata)
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedPlatformHistory.daily_breakdown.map((d) => (
                              <div
                                key={d.date}
                                className="px-2.5 py-1.5 rounded-xl bg-[#1D1D1D] border border-[#454545] flex items-center gap-2"
                              >
                                <span className="text-[11px] text-[#929292] font-mono">{d.date}</span>
                                <span className="px-1.5 py-0.5 rounded bg-[#FF2525]/20 text-[#FF2525] font-extrabold text-[11px] tabular-nums">
                                  {d.count} {d.count === 1 ? 'open' : 'opens'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent Individual Open Events */}
                      <div className="bg-[#141414] border border-[#454545] rounded-2xl overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-[#454545] flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-[#C5C5C5] uppercase tracking-wider">
                            Recorded Open Events ({selectedPlatformHistory.pagination.total_items})
                          </span>
                          <span className="text-[10px] text-[#929292]">IST (UTC+05:30)</span>
                        </div>
                        {selectedPlatformHistory.logs.length === 0 ? (
                          <div className="p-6 text-center text-[#929292]">
                            No open events recorded for this platform yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-[#454545]/70">
                            {selectedPlatformHistory.logs.map((log) => (
                              <div
                                key={log.id}
                                className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-[#C5C5C5]/20 shrink-0" />
                                  <span className="font-semibold text-white">
                                    {log.user_email || `User ${log.user_id.slice(0, 8)}`}
                                  </span>
                                  <span className="text-[10px] text-[#929292] font-mono">
                                    ID: {log.user_id.slice(0, 12)}
                                  </span>
                                </div>
                                <span className="text-[11px] text-[#C5C5C5] font-mono">
                                  {formatIstDateTime(log.opened_at)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {selectedPlatformHistory.pagination.total_pages > 1 && (
                          <div className="px-4 py-2.5 border-t border-[#454545] flex items-center justify-between">
                            <span className="text-[11px] text-[#929292]">
                              Page {selectedPlatformHistory.pagination.page} of{' '}
                              {selectedPlatformHistory.pagination.total_pages}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={historyPage <= 1 || historyLoading}
                                onClick={() =>
                                  handleOpenPlatformHistory(selectedPlatformHistory.platform.id, historyPage - 1)
                                }
                                className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] disabled:opacity-40"
                              >
                                Prev
                              </button>
                              <button
                                type="button"
                                disabled={
                                  historyPage >= selectedPlatformHistory.pagination.total_pages || historyLoading
                                }
                                onClick={() =>
                                  handleOpenPlatformHistory(selectedPlatformHistory.platform.id, historyPage + 1)
                                }
                                className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] disabled:opacity-40"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. USER MANAGEMENT */}
        {activeSection === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>User Management</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                    {users.length} Displayed
                  </span>
                </h2>
                <p className="text-xs text-[#929292]">
                  Search, filter Active Learners vs. Inactive Users, edit profiles/VIP, block/unblock, reset device bindings, and manage accounts
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedUserIds.size > 0 && hasSectionAction('users', 'delete') && (
                  <button
                    type="button"
                    onClick={() =>
                      setBulkDeleteModal({
                        section: 'users',
                        title: `Delete ${selectedUserIds.size} Selected User Account(s)`,
                        ids: Array.from(selectedUserIds),
                        executing: false,
                        error: null,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white text-xs font-bold shadow-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedUserIds.size})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Active Learners vs. Inactive / Login-Only Summary Cards */}
            {(() => {
              const studentUsers = users.filter((u) => !u.is_blocked && u.role === 'user');
              const activeLearnerCount = studentUsers.filter(
                (u) => u.learner_activity_status === 'active_learner'
              ).length;
              const noStudyCount = studentUsers.filter(
                (u) => u.learner_activity_status === 'no_study_activity'
              ).length;
              const inactive30dCount = studentUsers.filter(
                (u) => u.learner_activity_status === 'inactive_30d'
              ).length;

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    type="button"
                    onClick={() => setUserFilter('active_learners')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      userFilter === 'active_learners'
                        ? 'bg-[#1D1D1D]/50 border-[#C5C5C5]/60'
                        : 'bg-[#1D1D1D] border-[#454545] hover:border-[#454545]'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-[#F5F5F5] block">
                      Active Learners (&lt; 30d)
                    </span>
                    <span className="text-xl font-extrabold text-white mt-0.5 block tabular-nums">
                      {activeLearnerCount}
                    </span>
                    <span className="text-[10px] text-[#929292] block">
                      Meaningful study activity (excludes login-only)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUserFilter('no_study_activity')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      userFilter === 'no_study_activity'
                        ? 'bg-[#FF762E]/15 border-[#FF762E]/50'
                        : 'bg-[#1D1D1D] border-[#454545] hover:border-[#454545]'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-[#FF762E] block">
                      No Study Activity
                    </span>
                    <span className="text-xl font-extrabold text-[#FF762E] mt-0.5 block tabular-nums">
                      {noStudyCount}
                    </span>
                    <span className="text-[10px] text-[#929292] block">
                      Login-only users (0 study activities)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUserFilter('inactive_30d')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      userFilter === 'inactive_30d'
                        ? 'bg-[#FF2525]/15 border-[#FF2525]/55'
                        : 'bg-[#1D1D1D] border-[#454545] hover:border-[#454545]'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-[#FF2525] block">
                      Inactive (30+ Days)
                    </span>
                    <span className="text-xl font-extrabold text-[#FF2525] mt-0.5 block tabular-nums">
                      {inactive30dCount}
                    </span>
                    <span className="text-[10px] text-[#929292] block">
                      No login or study activity in 30+ days
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUserFilter('inactive')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      userFilter === 'inactive'
                        ? 'bg-[#FF2525]/50 border-[#FF2525]/60'
                        : 'bg-[#1D1D1D] border-[#454545] hover:border-[#454545]'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-[#FF2525] block">
                      All Inactive Users
                    </span>
                    <span className="text-xl font-extrabold text-[#FF2525] mt-0.5 block tabular-nums">
                      {noStudyCount + inactive30dCount}
                    </span>
                    <span className="text-[10px] text-[#929292] block">
                      Click to filter all inactive &amp; login-only
                    </span>
                  </button>
                </div>
              );
            })()}

            {/* Inline VIP Editor inside User Management so Admins with User Management access can grant/edit VIP directly */}
            {selectedUserForVip && (
              <div className="bg-[#FF2525]/40 border border-[#FF2525]/60 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#FF2525]">
                    Modifying VIP Access: {selectedUserForVip.email}
                  </h3>
                  <button onClick={() => setSelectedUserForVip(null)} className="text-[#929292] hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5] block mb-1">
                      VIP Duration (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={vipExpiryDays === '' ? '' : vipExpiryDays}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setVipExpiryDays(val);
                      }}
                      placeholder="e.g. 7, 15, 30, 45, 90, 180, 365"
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#FF2525]/50"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => handleToggleVip(selectedUserForVip, true, vipExpiryDays)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF2525] to-[#C90000] text-white font-bold text-xs"
                  >
                    Activate / Extend VIP Access
                  </button>
                  <button
                    onClick={() => handleToggleVip(selectedUserForVip, false)}
                    className="px-4 py-2 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] font-bold text-xs"
                  >
                    Revoke VIP
                  </button>
                </div>
              </div>
            )}

            {/* Inline User Profile Edit Modal */}
            {editingUserProfile && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <form
                  onSubmit={handleSaveUserProfileEdit}
                  className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <Edit className="w-4 h-4 text-[#FF2525]" />
                      <span>Edit User Profile</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingUserProfile(null)}
                      className="text-[#929292] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#141414] border border-[#454545] space-y-1">
                    <p className="font-bold text-white">{editingUserProfile.email}</p>
                    <p className="text-[11px] font-mono text-[#929292]">User ID: {editingUserProfile.id}</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5] block mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editingUserNameDraft}
                      onChange={(e) => setEditingUserNameDraft(e.target.value)}
                      placeholder="Student full name..."
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isSavingUserProfile}
                      onClick={() => setEditingUserProfile(null)}
                      className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingUserProfile}
                      className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingUserProfile ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Search & Status Filters */}
            <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-3 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name, email, role, user ID, or referral code..."
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF2525]/50"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  <Filter className="w-3.5 h-3.5 text-[#929292] shrink-0 mr-1" />
                  {(
                    [
                      { id: 'all', label: 'All Users' },
                      { id: 'active_learners', label: 'Active Users (Study Active)' },
                      { id: 'inactive', label: 'Inactive Users (All)' },
                      { id: 'no_study_activity', label: 'No Study Activity (Login-Only)' },
                      { id: 'inactive_30d', label: 'Inactive (30+ Days)' },
                      { id: 'vip', label: 'VIP Members' },
                      { id: 'free_access', label: 'Free Pass' },
                      { id: 'blocked', label: 'Blocked' },
                      { id: 'expired', label: 'Expired Access' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setUserFilter(f.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                        userFilter === f.id
                          ? 'bg-[#FF2525] text-white shadow-sm'
                          : 'bg-[#141414] text-[#929292] hover:text-[#F5F5F5] border border-[#454545]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Multi-select actions for eligible users */}
                {(() => {
                  const eligibleUsers = users.filter(
                    (u) =>
                      u.email.toLowerCase() !== 'bhaskardattmishra0101@gmail.com' &&
                      u.id !== currentUser.id &&
                      (isSuperAdmin || u.role === 'user')
                  );
                  if (eligibleUsers.length === 0) return null;
                  return (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setSelectedUserIds(new Set(eligibleUsers.map((u) => u.id)))}
                        className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-semibold"
                      >
                        Select Displayed Eligible ({eligibleUsers.length})
                      </button>
                      {selectedUserIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds(new Set())}
                          className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] text-[#929292] font-semibold"
                        >
                          Clear ({selectedUserIds.size})
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* User List */}
            <div className="space-y-2">
              {sectionLoading ? (
                <div className="bg-[#1D1D1D] border border-[#454545]/80 rounded-2xl p-6 text-center text-xs text-[#929292]">
                  Loading user accounts...
                </div>
              ) : users.length === 0 ? (
                <div className="bg-[#1D1D1D] border border-[#454545]/80 rounded-2xl p-6 text-center text-xs text-[#929292]">
                  No users match the selected search or filter criteria.
                </div>
              ) : (
                users.map((u) => {
                  const isPrimarySuperAdmin = u.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com';
                  const isSelf = u.id === currentUser.id;
                  const canModifyThisUser =
                    !isPrimarySuperAdmin &&
                    !isSelf &&
                    (isSuperAdmin || u.role === 'user');
                  const canEditUsers = hasSectionAction('users', 'edit');
                  const canDeleteUsers = hasSectionAction('users', 'delete');

                  return (
                    <div
                      key={u.id}
                      className={`bg-[#1D1D1D] border rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                        selectedUserIds.has(u.id)
                          ? 'border-[#FF2525]/70 bg-[#FF2525]/15'
                          : u.is_blocked
                          ? 'border-[#FF2525]/55 bg-[#FF2525]/15'
                          : 'border-[#454545]/80'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {canModifyThisUser ? (
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(u.id)}
                            onChange={() => toggleIdInSet(u.id, setSelectedUserIds)}
                            className="w-4 h-4 mt-0.5 accent-[#FF2525] rounded cursor-pointer shrink-0"
                          />
                        ) : (
                          <div className="w-4 h-4 mt-0.5 shrink-0" title="Protected account" />
                        )}
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {u.name && u.name.trim().length > 0 && (
                              <span className="font-extrabold text-white">{u.name}</span>
                            )}
                            <span className={`${u.name ? 'text-[#C5C5C5]' : 'font-bold text-white'} truncate`}>
                              {u.email}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                u.role === 'super_admin'
                                  ? 'bg-[#FF2525]/40 text-[#FF2525] border border-[#FF2525]/40'
                                  : u.role === 'admin'
                                  ? 'bg-[#FF2525]/40 text-[#FF2525] border border-[#FF2525]/40'
                                  : 'bg-[#1D1D1D] text-[#C5C5C5]'
                              }`}
                            >
                              {u.role}
                            </span>
                            {u.is_blocked ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/55">
                                <Ban className="w-2.5 h-2.5" />
                                BLOCKED
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1D1D1D]/60 text-[#F5F5F5] border border-[#C5C5C5]/60">
                                Account Active
                              </span>
                            )}

                            {/* Learner Study Activity Status Badge */}
                            {u.role === 'user' && (
                              <span
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                  u.learner_activity_status === 'active_learner'
                                    ? 'bg-[#FF2525]/20 text-[#F5F5F5] border-[#C5C5C5]/60'
                                    : u.learner_activity_status === 'inactive_30d'
                                    ? 'bg-[#FF2525]/20 text-[#FF2525] border-[#FF2525]/55'
                                    : 'bg-[#FF762E]/20 text-[#FF762E] border-[#FF762E]/50'
                                }`}
                              >
                                {u.learner_activity_status === 'active_learner'
                                  ? 'Active Learner'
                                  : u.learner_activity_status === 'inactive_30d'
                                  ? 'Inactive (30+ Days)'
                                  : 'No Study Activity (Login-Only)'}
                              </span>
                            )}
                          </div>

                          <div className="text-[10px] text-[#929292] flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-mono text-[#C5C5C5]">ID: {u.id}</span>
                            {u.referral_code && (
                              <span className="font-mono text-[#FF762E]">Ref Code: {u.referral_code}</span>
                            )}
                            {u.referred_by_code && (
                              <span className="font-mono text-[#FF2525]">Referred By: {u.referred_by_code}</span>
                            )}
                            <span>
                              VIP:{' '}
                              <strong className={u.vip_active ? 'text-[#FF762E]' : 'text-[#929292]'}>
                                {u.vip_active ? 'Active' : 'Inactive'}
                              </strong>
                              {u.vip_expires_at ? ` (until ${new Date(u.vip_expires_at).toLocaleDateString()})` : ''}
                            </span>
                            <span>
                              Device:{' '}
                              <strong className={u.vip_bound_device_id ? 'text-[#F5F5F5]' : 'text-[#929292]'}>
                                {u.vip_bound_device_id ? u.vip_device_label || 'Bound' : 'Unbound'}
                              </strong>
                            </span>
                            <span>
                              Free Pass:{' '}
                              <strong className={u.free_access_active ? 'text-[#F5F5F5]' : 'text-[#929292]'}>
                                {u.free_access_active ? 'Valid' : 'Expired'}
                              </strong>
                            </span>
                          </div>

                          {/* Study & Login Activity Metrics Row */}
                          <div className="text-[10px] text-[#C5C5C5] flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#141414] border border-[#454545]/80 rounded-lg px-2.5 py-1">
                            <span>
                              <strong className="text-[#929292]">Registration Date:</strong>{' '}
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                            </span>
                            <span>·</span>
                            <span>
                              <strong className="text-[#929292]">Last Login Date:</strong>{' '}
                              {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                            </span>
                            <span>·</span>
                            <span>
                              <strong className="text-[#929292]">Last Study Activity:</strong>{' '}
                              <span className={u.last_study_activity_at ? 'text-[#F5F5F5] font-semibold' : 'text-[#FF762E]'}>
                                {u.last_study_activity_at
                                  ? new Date(u.last_study_activity_at).toLocaleString()
                                  : 'No Study Activity'}
                              </span>
                            </span>
                            <span>·</span>
                            <span>
                              <strong className="text-[#929292]">Total Study Activity:</strong>{' '}
                              <strong className="text-white">{u.total_study_activities ?? 0}</strong> actions
                            </span>
                          </div>

                          {u.is_blocked && (
                            <p className="text-[10px] text-[#FF2525]/90 bg-[#FF2525]/15 border border-[#FF2525]/55 rounded-lg px-2 py-1 mt-1">
                              Blocked {u.blocked_at ? `on ${new Date(u.blocked_at).toLocaleString()}` : ''}
                              {u.blocked_by ? ` by ${u.blocked_by}` : ''}
                              {u.blocked_reason ? ` — Reason: ${u.blocked_reason}` : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {canEditUsers && canModifyThisUser && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserProfile(u);
                              setEditingUserNameDraft(u.name || '');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-semibold text-[11px] flex items-center gap-1"
                            title="Edit User Profile"
                          >
                            <Edit className="w-3 h-3 text-[#FF2525]" />
                            <span>Edit</span>
                          </button>
                        )}

                        {canEditUsers && (isSuperAdmin || u.role !== 'super_admin') && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserForVip(u);
                              if (u.vip_expires_at) {
                                const remaining = Math.max(
                                  1,
                                  Math.ceil((new Date(u.vip_expires_at).getTime() - Date.now()) / (24 * 3600 * 1000))
                                );
                                setVipExpiryDays(remaining);
                              } else {
                                setVipExpiryDays('');
                              }
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF762E] font-semibold text-[11px] flex items-center gap-1"
                          >
                            <Crown className="w-3 h-3" />
                            <span>VIP</span>
                          </button>
                        )}

                        {canEditUsers && (isSuperAdmin || u.role !== 'super_admin') && (
                          <button
                            type="button"
                            onClick={() => {
                              setVipResetReasonInput('');
                              setUserPendingVipDeviceReset(u);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#FF2525]/60 hover:bg-[#FF2525]/80 border border-[#FF2525]/50 text-[#FF2525] font-bold text-[11px] flex items-center gap-1"
                            title="Reset Registered Device / Allow New Device"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset Device</span>
                          </button>
                        )}

                        {canModifyThisUser && canEditUsers && (
                          <>
                            {u.is_blocked ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setBlockReasonInput('');
                                  setUserPendingBlock({ user: u, blocked: false });
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#1D1D1D]/60 hover:bg-[#1D1D1D]/80 border border-[#C5C5C5]/60 text-[#F5F5F5] font-bold text-[11px] flex items-center gap-1"
                              >
                                <ShieldCheck className="w-3 h-3" />
                                <span>Unblock</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setBlockReasonInput('');
                                  setUserPendingBlock({ user: u, blocked: true });
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#FF762E]/15 hover:bg-[#FF762E]/15 border border-[#FF762E]/50 text-[#FF762E] font-bold text-[11px] flex items-center gap-1"
                              >
                                <Ban className="w-3 h-3" />
                                <span>Block</span>
                              </button>
                            )}
                          </>
                        )}

                        {canModifyThisUser && canDeleteUsers && (
                          <button
                            type="button"
                            onClick={() => {
                              setUserDeleteError(null);
                              setUserPendingDelete(u);
                            }}
                            className="p-1.5 rounded-lg bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525]"
                            title="Delete User Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Block / Unblock Confirmation Modal */}
            {userPendingBlock && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      {userPendingBlock.blocked ? (
                        <>
                          <Ban className="w-4 h-4 text-[#FF762E]" />
                          <span>Block User Account</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 text-[#F5F5F5]" />
                          <span>Unblock User Account</span>
                        </>
                      )}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setUserPendingBlock(null)}
                      className="text-[#929292] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#141414] border border-[#454545] space-y-1">
                    <p className="font-bold text-white">{userPendingBlock.user.email}</p>
                    <p className="text-[11px] text-[#929292]">
                      {userPendingBlock.blocked
                        ? 'Blocking this account immediately revokes active sessions and prevents the user from accessing protected platforms or generating keys. Account records are preserved.'
                        : 'Unblocking restores access according to the user’s existing VIP or Free Access expiry status without resetting timestamps.'}
                    </p>
                  </div>

                  {userPendingBlock.blocked && (
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5] block mb-1">
                        Block Reason (Optional — shown to user)
                      </label>
                      <input
                        type="text"
                        value={blockReasonInput}
                        onChange={(e) => setBlockReasonInput(e.target.value)}
                        placeholder="e.g. Terms of service violation or suspicious key activity"
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isUpdatingBlock}
                      onClick={() => setUserPendingBlock(null)}
                      className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingBlock}
                      onClick={handleConfirmBlockToggle}
                      className={`px-4 py-2 rounded-xl font-bold text-white ${
                        userPendingBlock.blocked
                          ? 'bg-[#FF762E] hover:bg-[#FF762E]'
                          : 'bg-[#FF2525] hover:bg-[#FF2525]'
                      }`}
                    >
                      {isUpdatingBlock
                        ? 'Updating...'
                        : userPendingBlock.blocked
                        ? 'Confirm Block User'
                        : 'Confirm Unblock User'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete User Confirmation Modal */}
            {userPendingDelete && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-[#FF2525]" />
                      <span>Permanently Delete User Account</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setUserPendingDelete(null)}
                      className="text-[#929292] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#141414] border border-[#454545] space-y-1">
                    <p className="text-[#C5C5C5]">
                      Are you sure you want to permanently delete this user account?
                    </p>
                    <p className="font-bold text-white pt-1">{userPendingDelete.email}</p>
                    <p className="text-[11px] text-[#929292]">
                      Role: <span className="text-[#FF2525] font-semibold">{userPendingDelete.role}</span> · ID: {userPendingDelete.id}
                    </p>
                    <p className="text-[11px] text-[#FF762E]/90 pt-1">
                      Active sessions and expired key logs for this user will be removed, while completed payment audit records are safely preserved.
                    </p>
                  </div>

                  {userDeleteError && (
                    <div className="p-2.5 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0 mt-0.5" />
                      <span>{userDeleteError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isDeletingUser}
                      onClick={() => setUserPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingUser}
                      onClick={handleConfirmDeleteUser}
                      className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] disabled:opacity-50 text-white font-bold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isDeletingUser ? 'Deleting...' : 'Confirm Delete User'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. VIP MANAGEMENT & SINGLE-DEVICE VIP PROTECTION */}
        {activeSection === 'vip' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>VIP Access & Single-Device Protection</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FF762E]/20 text-[#FF762E] border border-[#FF762E]/50">
                    {users.filter((u) => u.vip_active).length} Active VIPs
                  </span>
                </h2>
                <p className="text-xs text-[#929292]">
                  Grant or revoke VIP access, monitor single-device bindings, reset bound devices, and audit sharing attempts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenCleanupModal('vip_expired', 'Clean Expired VIP Statuses')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs font-bold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clean Expired VIP</span>
              </button>
            </div>

            {selectedUserForVip && (
              <div className="bg-[#FF2525]/40 border border-[#FF2525]/60 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#FF2525]">
                    Modifying VIP: {selectedUserForVip.email}
                  </h3>
                  <button onClick={() => setSelectedUserForVip(null)} className="text-[#929292] hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5] block mb-1">
                      VIP Duration (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={vipExpiryDays === '' ? '' : vipExpiryDays}
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setVipExpiryDays(val);
                      }}
                      placeholder="e.g. 7, 15, 30, 45, 90, 180, 365"
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#FF2525]/50"
                    />
                    <p className="text-[10px] text-[#929292] mt-1">
                      Type any positive whole number of days (e.g. 1, 7, 15, 30, 45, 90, 180, 365). Server-side expiry timestamp is calculated consistently from current time.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => handleToggleVip(selectedUserForVip, true, vipExpiryDays)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF2525] to-[#C90000] text-white font-bold text-xs"
                  >
                    Activate VIP Access
                  </button>
                  <button
                    onClick={() => handleToggleVip(selectedUserForVip, false)}
                    className="px-4 py-2 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] font-bold text-xs"
                  >
                    Revoke VIP
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-white">{u.email}</p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          u.vip_active
                            ? 'bg-[#1D1D1D]/80 text-[#F5F5F5] border border-[#C5C5C5]/60'
                            : 'bg-[#1D1D1D] text-[#929292]'
                        }`}
                      >
                        {u.vip_active ? 'VIP ACTIVE' : 'INACTIVE'}
                      </span>
                      {u.vip_expires_at && (
                        <span className="text-[10px] text-[#FF762E] font-semibold">
                          Until {new Date(u.vip_expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Single-Device VIP Binding Info */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[#929292]">
                      <span>
                        Registered Device:{' '}
                        {u.vip_bound_device_id ? (
                          <strong className="text-[#F5F5F5]">
                            {u.vip_device_label || 'Bound Primary Device'} ({u.vip_bound_device_id.slice(0, 12)}…)
                          </strong>
                        ) : (
                          <span className="text-[#929292]">Unbound (binds automatically on next VIP login)</span>
                        )}
                      </span>
                      {u.vip_device_bound_at && (
                        <span>Bound: {new Date(u.vip_device_bound_at).toLocaleString()}</span>
                      )}
                      {u.vip_device_last_seen_at && (
                        <span>Last Active: {new Date(u.vip_device_last_seen_at).toLocaleString()}</span>
                      )}
                      {(u.vip_sharing_attempts_blocked ?? 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] font-bold">
                          Blocked 2nd-Device Attempts: {u.vip_sharing_attempts_blocked}
                        </span>
                      )}
                      {(u.vip_device_reset_count ?? 0) > 0 && (
                        <span className="text-[#FF2525]">
                          Resets: {u.vip_device_reset_count}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {u.vip_bound_device_id && (
                      <button
                        type="button"
                        onClick={() => {
                          setVipResetReasonInput('');
                          setUserPendingVipDeviceReset(u);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#FF2525]/70 hover:bg-[#FF2525]/90 border border-[#FF2525]/50 text-[#FF2525] font-bold text-xs flex items-center gap-1"
                        title="Reset bound VIP device so user can sign in on a new phone/browser"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset VIP Device</span>
                      </button>
                    )}

                    {u.vip_active ? (
                      <>
                        <button
                          onClick={() => {
                            setSelectedUserForVip(u);
                            if (u.vip_expires_at) {
                              const remaining = Math.max(1, Math.ceil((new Date(u.vip_expires_at).getTime() - Date.now()) / (24 * 3600 * 1000)));
                              setVipExpiryDays(remaining);
                            } else {
                              setVipExpiryDays('');
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF2525] font-semibold text-xs"
                        >
                          Edit VIP
                        </button>
                        <button
                          onClick={() => handleToggleVip(u, false)}
                          className="px-3 py-1 rounded-lg bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] font-bold text-xs"
                        >
                          Turn OFF
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedUserForVip(u);
                          setVipExpiryDays('');
                        }}
                        className="px-3 py-1 rounded-lg bg-gradient-to-r from-[#FF2525] to-[#C90000] hover:from-[#FF2525] hover:to-[#C90000] text-white font-bold text-xs shadow-sm"
                      >
                        Activate VIP
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* VIP Device Security & Sharing Attempt Audit Logs */}
            <div className="pt-4 border-t border-[#454545] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#FF762E]" />
                    <span>VIP Single-Device Security & Sharing Logs</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#1D1D1D] text-[#C5C5C5]">
                      {vipDeviceLogs.length} Events
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#929292]">
                    Tracks first-device bindings, blocked second-device sharing attempts, and admin device resets.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedVipLogIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setBulkDeleteModal({
                          section: 'vip_device_logs',
                          title: `Delete ${selectedVipLogIds.size} Selected Security Log(s)`,
                          ids: Array.from(selectedVipLogIds),
                          executing: false,
                          error: null,
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white text-xs font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected ({selectedVipLogIds.size})</span>
                    </button>
                  )}
                  {vipDeviceLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenCleanupModal('vip_device_logs_all', 'Delete All VIP Device Security Logs', 0)
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete All Logs ({vipDeviceLogs.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {vipDeviceLogs.length > 0 && (
                <div className="bg-[#1D1D1D] border border-[#454545]/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                  <span className="text-[#929292]">
                    Selected: <strong className="text-white">{selectedVipLogIds.size}</strong> of {vipDeviceLogs.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedVipLogIds(new Set(vipDeviceLogs.map((l) => l.id)))}
                      className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-semibold text-[11px]"
                    >
                      Select All ({vipDeviceLogs.length})
                    </button>
                    {selectedVipLogIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedVipLogIds(new Set())}
                        className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] text-[#929292] font-semibold text-[11px]"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {vipDeviceLogs.length === 0 ? (
                  <p className="text-xs text-[#929292] py-4 text-center bg-[#1D1D1D] border border-[#454545]/60 rounded-2xl">
                    No VIP device security events recorded yet.
                  </p>
                ) : (
                  vipDeviceLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`bg-[#1D1D1D] border rounded-2xl p-3 flex items-center justify-between gap-3 text-xs ${
                        selectedVipLogIds.has(log.id)
                          ? 'border-[#FF2525]/70 bg-[#FF2525]/15'
                          : log.event_type === 'device_mismatch_blocked'
                          ? 'border-[#FF2525]/55 bg-[#FF2525]/15'
                          : 'border-[#454545]'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedVipLogIds.has(log.id)}
                          onChange={() => toggleIdInSet(log.id, setSelectedVipLogIds)}
                          className="w-4 h-4 mt-0.5 accent-[#FF2525] rounded cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-white">{log.email}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                log.event_type === 'device_mismatch_blocked'
                                  ? 'bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/55'
                                  : log.event_type === 'device_reset_by_admin'
                                  ? 'bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/50'
                                  : 'bg-[#1D1D1D] text-[#F5F5F5] border border-[#C5C5C5]/60'
                              }`}
                            >
                              {log.event_type}
                            </span>
                            <span className="text-[10px] text-[#929292]">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#C5C5C5]">{log.details}</p>
                          <p className="text-[10px] text-[#929292]">
                            IP: {log.ip_address} · Device: {log.device_label || log.attempted_device_id || 'N/A'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setVipLogPendingDelete(log)}
                        className="p-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#FF2525]/15 text-[#FF2525] shrink-0"
                        title="Delete Security Log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {vipLogPendingDelete && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete VIP Security Log</h3>
                  <p className="text-[#C5C5C5]">
                    Delete security log entry for <strong className="text-white">{vipLogPendingDelete.email}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setVipLogPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] text-[#F5F5F5] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteVipLog}
                      className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. VIP PLAN MANAGEMENT (BOTH BUTTONS: 1ST ONE PLATFORM VIP & 2ND ALL PLATFORMS VIP) */}
        {activeSection === 'plans' && (() => {
          const singlePlatformPlans = plans.filter((p) => p.plan_scope === 'single_platform');
          const allPlatformsPlans = plans.filter((p) => p.plan_scope !== 'single_platform');
          const displayedPlans =
            planScopeFilter === 'single_platform'
              ? singlePlatformPlans
              : planScopeFilter === 'all_platforms'
              ? allPlatformsPlans
              : plans;

          return (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>VIP Plan Management (Both Buttons)</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                    {plans.length} Plans
                  </span>
                </h2>
                <p className="text-xs text-[#929292]">
                  Full control over BOTH Home &amp; VIP buttons — edit 1st Button (One Platform VIP) and 2nd Button (All Platforms VIP) pricing, destinations, and VIP plans.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const vipLink = `${window.location.origin}/vip`;
                    navigator.clipboard.writeText(vipLink).then(() => {
                      showToast(`VIP Page Link copied: ${vipLink}`);
                    }).catch(() => {
                      showToast(vipLink);
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF762E]/15 hover:bg-[#FF762E]/25 border border-[#FF762E]/50 text-[#FF762E] text-xs font-bold transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy VIP Page Link</span>
                </button>
                <a
                  href="/vip"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] border border-[#454545] text-[#F5F5F5] text-xs font-bold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open VIP Page</span>
                </a>
                {selectedPlanIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBulkDeleteModal({
                        section: 'vip_plans',
                        title: `Delete ${selectedPlanIds.size} Selected VIP Plan(s)`,
                        ids: Array.from(selectedPlanIds),
                        executing: false,
                        error: null,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-white text-xs font-bold shadow-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedPlanIds.size})</span>
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => handleOpenCleanupModal('plans_inactive', 'Clean Inactive VIP Plans')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-[#FF2525]/25 border border-[#FF2525]/55 text-[#FF2525] text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clean Inactive ({plans.filter((p) => !p.is_active).length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* BOTH BUTTONS DIRECT CONTROL CARD (1ST BUTTON: ONE PLATFORM VIP & 2ND BUTTON: ALL PLATFORMS VIP) */}
            {currentSettings && (
              <div className="bg-[#1D1D1D] border border-[#FF2525]/50 rounded-2xl p-5 space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#454545]">
                  <div>
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <Crown className="w-4 h-4 text-[#FF2525]" />
                      <span>Home &amp; VIP Both-Button Control (1st VIP + 2nd ALL VIP)</span>
                    </h3>
                    <p className="text-[11px] text-[#929292] mt-0.5">
                      Update label, default price, validity days, and click destination for BOTH buttons. Changes save permanently and sync live to the Student APK.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingSettings}
                    onClick={handleSaveGlobalSettings}
                    className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSavingSettings ? 'Saving...' : 'Save Both Buttons'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* 1st Button Control: One Platform VIP */}
                  <div className="p-4 rounded-xl bg-[#141414] border border-[#FF2525]/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs font-black uppercase text-[#FF2525]">
                        1st Button — One Platform VIP
                      </span>
                      <span className="font-mono-tech text-[10px] text-[#C5C5C5] uppercase">
                        1 CHOSEN PLATFORM ONLY
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="font-bold text-[#C5C5C5] block mb-1">Button Label</label>
                        <input
                          type="text"
                          value={currentSettings.home_single_vip_label ?? 'VIP'}
                          onChange={(e) => handleSettingChange('home_single_vip_label', e.target.value)}
                          placeholder="VIP"
                          className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-[#C5C5C5] block mb-1">Default Price (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={currentSettings.home_single_vip_price ?? 49}
                          onChange={(e) => handleSettingChange('home_single_vip_price', Number(e.target.value))}
                          placeholder="49"
                          className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs font-mono-tech"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-[#C5C5C5] block mb-1">Validity (Days)</label>
                        <input
                          type="number"
                          min="1"
                          max="3650"
                          value={currentSettings.home_single_vip_duration_days ?? 30}
                          onChange={(e) =>
                            handleSettingChange('home_single_vip_duration_days', Number(e.target.value))
                          }
                          placeholder="30"
                          className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs font-mono-tech"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">1st Button Destination</label>
                      <select
                        value={currentSettings.home_single_vip_destination || 'in_app_single_vip'}
                        onChange={(e) =>
                          handleSettingChange(
                            'home_single_vip_destination',
                            e.target.value as 'in_app_single_vip' | 'custom_url'
                          )
                        }
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                      >
                        <option value="in_app_single_vip">
                          In-App VIP Page (One Platform VIP Pre-Selected)
                        </option>
                        <option value="custom_url">Custom External URL (Telegram / Payment Link)</option>
                      </select>
                    </div>

                    {currentSettings.home_single_vip_destination === 'custom_url' && (
                      <div>
                        <label className="font-bold text-[#C5C5C5] block mb-1">
                          1st Button Custom Destination URL
                        </label>
                        <input
                          type="text"
                          value={currentSettings.home_single_vip_url || ''}
                          onChange={(e) => handleSettingChange('home_single_vip_url', e.target.value)}
                          placeholder="https://t.me/your_single_vip_link"
                          className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {/* 2nd Button Control: All Platforms VIP */}
                  <div className="p-4 rounded-xl bg-[#141414] border border-[#FF762E]/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs font-black uppercase text-[#FF762E]">
                        2nd Button — ALL VIP (All Platforms)
                      </span>
                      <span className="font-mono-tech text-[10px] text-[#C5C5C5] uppercase">
                        ALL PLATFORMS UNLOCK
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="font-bold text-[#C5C5C5] block mb-1">Button Label</label>
                        <input
                          type="text"
                          value={currentSettings.home_all_vip_label ?? 'ALL VIP'}
                          onChange={(e) => handleSettingChange('home_all_vip_label', e.target.value)}
                          placeholder="ALL VIP"
                          className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-[#C5C5C5] block mb-1">Default Price (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={currentSettings.home_all_vip_price ?? 149}
                          onChange={(e) => handleSettingChange('home_all_vip_price', Number(e.target.value))}
                          placeholder="149"
                          className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs font-mono-tech"
                        />
                      </div>
                      <div>
                        <label className="font-bold text-[#C5C5C5] block mb-1">Validity (Days)</label>
                        <input
                          type="number"
                          min="1"
                          max="3650"
                          value={currentSettings.home_all_vip_duration_days ?? 30}
                          onChange={(e) =>
                            handleSettingChange('home_all_vip_duration_days', Number(e.target.value))
                          }
                          placeholder="30"
                          className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs font-mono-tech"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">2nd Button Destination</label>
                      <select
                        value={currentSettings.home_all_vip_destination || 'in_app_all_vip'}
                        onChange={(e) =>
                          handleSettingChange(
                            'home_all_vip_destination',
                            e.target.value as 'in_app_all_vip' | 'custom_url'
                          )
                        }
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                      >
                        <option value="in_app_all_vip">
                          In-App VIP Page (All Platforms VIP Pre-Selected)
                        </option>
                        <option value="custom_url">Custom External URL (Telegram / Payment Link)</option>
                      </select>
                    </div>

                    {currentSettings.home_all_vip_destination === 'custom_url' && (
                      <div>
                        <label className="font-bold text-[#C5C5C5] block mb-1">
                          2nd Button Custom Destination URL
                        </label>
                        <input
                          type="text"
                          value={currentSettings.home_all_vip_url || ''}
                          onChange={(e) => handleSettingChange('home_all_vip_url', e.target.value)}
                          placeholder="https://t.me/your_all_vip_link"
                          className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ADD VIP PLAN ACTION BAR FOR BOTH BUTTONS + SCOPE FILTER */}
            <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlanScopeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    planScopeFilter === 'all'
                      ? 'bg-[#FF2525] text-white border-[#FF2525]'
                      : 'bg-[#141414] text-[#C5C5C5] border-[#454545] hover:border-[#FF2525]/60'
                  }`}
                >
                  All Plans ({plans.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPlanScopeFilter('single_platform')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    planScopeFilter === 'single_platform'
                      ? 'bg-[#FF2525] text-white border-[#FF2525]'
                      : 'bg-[#141414] text-[#C5C5C5] border-[#454545] hover:border-[#FF2525]/60'
                  }`}
                >
                  1st Button · One Platform VIP ({singlePlatformPlans.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPlanScopeFilter('all_platforms')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    planScopeFilter === 'all_platforms'
                      ? 'bg-[#FF762E] text-[#090909] border-[#FF762E]'
                      : 'bg-[#141414] text-[#C5C5C5] border-[#454545] hover:border-[#FF762E]/60'
                  }`}
                >
                  2nd Button · All Platforms VIP ({allPlatformsPlans.length})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlan({
                      title: 'One Platform VIP Plan',
                      plan_scope: 'single_platform',
                      price_inr: Number(currentSettings?.home_single_vip_price ?? 49),
                      duration_days: Number(currentSettings?.home_single_vip_duration_days ?? 30),
                      badge_label: 'SINGLE ACCESS',
                      description: 'Unlocks 1 selected study platform only',
                      features: [
                        'Direct Access to 1 Chosen Platform',
                        'Ad-Free Instant Launch',
                        'Activated Immediately After Approval',
                      ],
                      is_active: true,
                      display_order: plans.length + 1,
                    });
                    setIsCreatingPlan(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-white text-xs font-bold shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add 1st Button Plan (One Platform)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlan({
                      title: 'All Platforms VIP Plan',
                      plan_scope: 'all_platforms',
                      price_inr: Number(currentSettings?.home_all_vip_price ?? 149),
                      duration_days: Number(currentSettings?.home_all_vip_duration_days ?? 30),
                      badge_label: 'BEST VALUE',
                      description: 'Full VIP Access to ALL study platforms',
                      features: [
                        'Instant Activation',
                        'Full Access to ALL Platforms',
                        'VIP Command Hub & Mock Tests',
                        'Priority Support',
                      ],
                      is_active: true,
                      display_order: plans.length + 1,
                    });
                    setIsCreatingPlan(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FF762E] hover:bg-[#e5641f] text-[#090909] text-xs font-black shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add 2nd Button Plan (All Platforms)</span>
                </button>
              </div>
            </div>

            {displayedPlans.length > 0 && (
              <div className="bg-[#1D1D1D] border border-[#454545]/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-[#929292]">
                  Selected: <strong className="text-white">{selectedPlanIds.size}</strong> of {displayedPlans.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlanIds(new Set(displayedPlans.map((p) => p.id)))}
                    className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#2A2A2A] text-[#F5F5F5] font-semibold text-[11px] border border-[#454545]"
                  >
                    Select Shown ({displayedPlans.length})
                  </button>
                  {selectedPlanIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedPlanIds(new Set())}
                      className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] text-[#929292] font-semibold text-[11px]"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Plan Modal (Supports BOTH 1st Button One Platform VIP and 2nd Button All Platforms VIP) */}
            {(isCreatingPlan || editingPlan) && (
              <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-3xl max-w-md w-full p-6 space-y-3 my-auto">
                  <h3 className="text-sm font-bold text-white">
                    {isCreatingPlan ? 'Add VIP Plan' : 'Edit VIP Plan'}
                  </h3>

                  <div>
                    <label className="text-[11px] font-bold text-[#FF762E] block mb-1">
                      Target Button / VIP Scope
                    </label>
                    <select
                      value={editingPlan?.plan_scope === 'single_platform' ? 'single_platform' : 'all_platforms'}
                      onChange={(e) =>
                        setEditingPlan({
                          ...editingPlan,
                          plan_scope: e.target.value === 'single_platform' ? 'single_platform' : 'all_platforms',
                        })
                      }
                      className="w-full bg-[#141414] border border-[#FF2525]/60 rounded-xl px-3 py-2 text-xs text-white font-semibold"
                    >
                      <option value="single_platform">
                        1st Button — One Platform VIP (Unlocks 1 Selected Platform Only)
                      </option>
                      <option value="all_platforms">
                        2nd Button — All Platforms VIP (Unlocks All Platforms)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5]">Plan Title</label>
                    <input
                      type="text"
                      value={editingPlan?.title || ''}
                      onChange={(e) => setEditingPlan({ ...editingPlan, title: e.target.value })}
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Price (INR ₹)</label>
                      <input
                        type="number"
                        value={editingPlan?.price_inr || 0}
                        onChange={(e) => setEditingPlan({ ...editingPlan, price_inr: Number(e.target.value) })}
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">VIP Duration (Days)</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={
                          editingPlan?.duration_days !== undefined && editingPlan?.duration_days !== null
                            ? editingPlan.duration_days
                            : ''
                        }
                        onChange={(e) => {
                          const val = e.target.value === '' ? ('' as unknown as number) : Number(e.target.value);
                          setEditingPlan({
                            ...editingPlan,
                            duration_days: val,
                            duration_months: typeof val === 'number' && val > 0 ? Math.round(val / 30) : 1,
                          });
                        }}
                        placeholder="e.g. 7, 15, 30, 45, 90, 180, 365"
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      />
                      <p className="text-[10px] text-[#929292] mt-1">
                        Positive whole integer (e.g. 30, 180, 365).
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Original Price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={editingPlan?.original_price_inr ?? ''}
                        onChange={(e) =>
                          setEditingPlan({
                            ...editingPlan,
                            original_price_inr: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="e.g. 499"
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Bonus Days (+)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editingPlan?.bonus_days ?? 0}
                        onChange={(e) =>
                          setEditingPlan({ ...editingPlan, bonus_days: Math.max(0, Number(e.target.value) || 0) })
                        }
                        placeholder="e.g. 5"
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Discount Label</label>
                      <input
                        type="text"
                        value={editingPlan?.discount_label || ''}
                        onChange={(e) => setEditingPlan({ ...editingPlan, discount_label: e.target.value })}
                        placeholder="e.g. 40% OFF"
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Badge Label (Optional)</label>
                      <input
                        type="text"
                        value={editingPlan?.badge_label || ''}
                        onChange={(e) => setEditingPlan({ ...editingPlan, badge_label: e.target.value })}
                        placeholder="e.g. BEST VALUE, POPULAR"
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Display Order</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={editingPlan?.display_order ?? 1}
                        onChange={(e) => setEditingPlan({ ...editingPlan, display_order: Number(e.target.value) || 1 })}
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-[#F5F5F5] cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={editingPlan?.is_active !== false}
                      onChange={(e) => setEditingPlan({ ...editingPlan, is_active: e.target.checked })}
                      className="w-4 h-4 accent-[#FF2525] rounded"
                    />
                    <span className="font-bold">Plan Active (Visible in Student VIP Page)</span>
                  </label>

                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5]">Features (1 per line)</label>
                    <textarea
                      rows={4}
                      value={editingPlan?.features?.join('\n') || ''}
                      onChange={(e) =>
                        setEditingPlan({
                          ...editingPlan,
                          features: e.target.value.split('\n').filter((f) => f.trim().length > 0),
                        })
                      }
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#454545]">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlan(null);
                        setIsCreatingPlan(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-[#141414] border border-[#454545] text-xs text-[#C5C5C5]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSavePlan(editingPlan!)}
                      className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] text-xs font-bold text-white flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {displayedPlans.length === 0 ? (
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-6 text-center text-xs text-[#929292]">
                  {planScopeFilter === 'single_platform'
                    ? 'No custom 1st Button (One Platform VIP) plans created yet. Click "+ Add 1st Button Plan (One Platform)" above, or students will use the Default Price configured above.'
                    : planScopeFilter === 'all_platforms'
                    ? 'No custom 2nd Button (All Platforms VIP) plans created yet. Click "+ Add 2nd Button Plan (All Platforms)" above.'
                    : 'No VIP plans exist in the database yet. Use the buttons above to add 1st Button (One Platform VIP) or 2nd Button (All Platforms VIP) plans.'}
                </div>
              ) : (
                displayedPlans.map((pl) => {
                  const fullIdx = plans.findIndex((x) => x.id === pl.id);
                  const isSelected = selectedPlanIds.has(pl.id);
                  const isSingleScope = pl.plan_scope === 'single_platform';
                  return (
                    <div
                      key={pl.id}
                      className={`bg-[#1D1D1D] border rounded-2xl p-4 flex items-center justify-between gap-3 text-xs ${
                        isSelected ? 'border-[#FF2525]/70 bg-[#FF2525]/15' : 'border-[#454545]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleIdInSet(pl.id, setSelectedPlanIds)}
                          className="w-4 h-4 mt-1 accent-[#FF2525] rounded cursor-pointer shrink-0"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#141414] text-[#C5C5C5] border border-[#454545]">
                              #{fullIdx + 1}
                            </span>
                            <span
                              className={`text-[10px] font-mono-tech font-bold uppercase px-2 py-0.5 rounded border ${
                                isSingleScope
                                  ? 'bg-[#FF2525]/15 text-[#FF2525] border-[#FF2525]/50'
                                  : 'bg-[#FF762E]/15 text-[#FF762E] border-[#FF762E]/50'
                              }`}
                            >
                              {isSingleScope ? '1ST BUTTON · ONE PLATFORM VIP' : '2ND BUTTON · ALL PLATFORMS VIP'}
                            </span>
                            <h3 className="font-extrabold text-white text-sm">{pl.title}</h3>
                            <span className="font-bold text-[#FF762E]">₹{pl.price_inr}</span>
                            <span className="text-[10px] text-[#C5C5C5] font-medium">
                              ({pl.duration_days ? `${pl.duration_days} Days` : `${pl.duration_months || 1} Months`})
                            </span>
                            {pl.badge_label && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF2525]/30 text-[#FF2525] border border-[#FF2525]/40">
                                {pl.badge_label}
                              </span>
                            )}
                            {!pl.is_active && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#141414] text-[#929292] border border-[#454545]">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#929292] mt-1">
                            {pl.features.length} listed benefits · Order: {pl.display_order}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={fullIdx <= 0 || Boolean(movingPlanId)}
                          onClick={() => handleMovePlan(fullIdx, 'up')}
                          className="p-1.5 rounded-lg bg-[#141414] hover:bg-[#2A2A2A] text-[#FF762E] disabled:opacity-35 disabled:cursor-not-allowed"
                          title="Move Plan Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={fullIdx === plans.length - 1 || Boolean(movingPlanId)}
                          onClick={() => handleMovePlan(fullIdx, 'down')}
                          className="p-1.5 rounded-lg bg-[#141414] hover:bg-[#2A2A2A] text-[#FF762E] disabled:opacity-35 disabled:cursor-not-allowed"
                          title="Move Plan Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingPlan(pl)}
                          className="p-1.5 rounded-lg bg-[#141414] hover:bg-[#2A2A2A] text-[#FF2525]"
                          title="Edit Plan"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setPlanPendingDelete(pl)}
                          className="p-1.5 rounded-lg bg-[#141414] hover:bg-[#FF2525]/15 text-[#FF2525]"
                          title="Delete Plan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {planPendingDelete && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete VIP Plan</h3>
                  <p className="text-[#C5C5C5]">
                    Are you sure you want to delete <strong className="text-white">{planPendingDelete.title}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPlanPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePlan(planPendingDelete.id)}
                      className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* 6. PAYMENT MANAGEMENT */}
        {activeSection === 'payments' && (() => {
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const startOf7Days = now.getTime() - 7 * 24 * 3600 * 1000;
          const startOf30Days = now.getTime() - 30 * 24 * 3600 * 1000;
          const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          const customStartMs = paymentStartDate
            ? new Date(`${paymentStartDate}T00:00:00`).getTime()
            : null;
          const customEndMs = paymentEndDate
            ? new Date(`${paymentEndDate}T23:59:59.999`).getTime()
            : null;

          // 1. Filter by Date Range first (Dashboard statistics dynamically reflect selected date filter)
          const dateFilteredPayments = payments.filter((p) => {
            if (paymentDateFilter === 'all') return true;
            const createdMs = new Date(p.created_at).getTime();
            if (isNaN(createdMs)) return false;
            if (paymentDateFilter === 'today') return createdMs >= startOfToday;
            if (paymentDateFilter === '7d') return createdMs >= startOf7Days;
            if (paymentDateFilter === '30d') return createdMs >= startOf30Days;
            if (paymentDateFilter === 'this_month') return createdMs >= startOfThisMonth;
            if (paymentDateFilter === 'custom') {
              if (customStartMs !== null && !isNaN(customStartMs) && createdMs < customStartMs) return false;
              if (customEndMs !== null && !isNaN(customEndMs) && createdMs > customEndMs) return false;
              return true;
            }
            return true;
          });

          // 2. Deduplicated Verified Revenue & Dashboard Statistics Calculation
          // Only count actual verified payment amounts from approved/completed records.
          // Never count pending/rejected/failed or plan expected_amount, and never count the same payment twice.
          const seenPaymentIds = new Set<string>();
          const seenVerifiedTxnRefs = new Set<string>();

          let totalPaymentReceived = 0;
          let approvedPaymentsCount = 0;
          let approvedPaymentsAmount = 0;
          let completedPaymentsCount = 0;
          let completedPaymentsAmount = 0;
          let pendingPaymentsCount = 0;
          let pendingPaymentsAmount = 0;
          let rejectedPaymentsCount = 0;
          let rejectedPaymentsAmount = 0;
          let successfulTransactionsCount = 0;

          for (const p of dateFilteredPayments) {
            if (!p || !p.id || seenPaymentIds.has(p.id)) continue;
            seenPaymentIds.add(p.id);

            const actualAmount = Number(p.amount);
            const validAmount = Number.isFinite(actualAmount) ? actualAmount : 0;
            const isRefundOrReversal =
              validAmount < 0 ||
              Boolean(p.admin_note && /\b(refund|refunded|reversed|chargeback)\b/i.test(p.admin_note));

            if (p.status === 'completed' || p.status === 'approved') {
              const normRef = (p.transaction_reference || '').trim().toUpperCase();
              const isDuplicateRef = normRef.length > 0 && seenVerifiedTxnRefs.has(normRef);
              if (normRef.length > 0) {
                seenVerifiedTxnRefs.add(normRef);
              }

              // Track Approved vs Completed counts
              const isAdminApproved =
                p.status === 'approved' || Boolean(p.reviewed_by) || Boolean(p.reviewed_at);
              if (isAdminApproved) {
                approvedPaymentsCount += 1;
                if (!isDuplicateRef && !isRefundOrReversal) {
                  approvedPaymentsAmount += validAmount;
                }
              }
              if (p.status === 'completed' || p.status === 'approved') {
                completedPaymentsCount += 1;
                if (!isDuplicateRef && !isRefundOrReversal) {
                  completedPaymentsAmount += validAmount;
                }
              }

              if (!isDuplicateRef && !isRefundOrReversal && validAmount > 0) {
                totalPaymentReceived += validAmount;
                successfulTransactionsCount += 1;
              } else if (!isDuplicateRef && validAmount < 0) {
                totalPaymentReceived = Math.max(0, totalPaymentReceived + validAmount);
              }
            } else if (p.status === 'pending_verification' || p.status === 'pending') {
              pendingPaymentsCount += 1;
              if (validAmount > 0) pendingPaymentsAmount += validAmount;
            } else if (p.status === 'rejected' || p.status === 'failed') {
              rejectedPaymentsCount += 1;
              if (validAmount > 0) rejectedPaymentsAmount += validAmount;
            }
          }

          // 3. Apply Status Filter & Search Query for Table
          const filteredPayments = dateFilteredPayments.filter((p) => {
            if (paymentStatusFilter === 'approved') {
              const isApproved =
                p.status === 'approved' ||
                (p.status === 'completed' && (Boolean(p.reviewed_by) || Boolean(p.reviewed_at)));
              if (!isApproved) return false;
            } else if (paymentStatusFilter === 'completed') {
              if (p.status !== 'completed' && p.status !== 'approved') return false;
            } else if (paymentStatusFilter === 'pending') {
              if (p.status !== 'pending_verification' && p.status !== 'pending') return false;
            } else if (paymentStatusFilter === 'rejected') {
              if (p.status !== 'failed' && p.status !== 'rejected') return false;
            }
            if (paymentSearch.trim()) {
              const q = paymentSearch.trim().toLowerCase();
              const matchEmail = p.email.toLowerCase().includes(q);
              const matchUserId = Boolean(p.user_id && p.user_id.toLowerCase().includes(q));
              const matchSubEmail = Boolean(p.submitted_email && p.submitted_email.toLowerCase().includes(q));
              const matchRef = Boolean(p.transaction_reference && p.transaction_reference.toLowerCase().includes(q));
              const matchPlan = Boolean(p.plan_title && p.plan_title.toLowerCase().includes(q));
              const matchId = p.id.toLowerCase().includes(q);
              if (!matchEmail && !matchUserId && !matchSubEmail && !matchRef && !matchPlan && !matchId) {
                return false;
              }
            }
            return true;
          });

          const formatINR = (val: number) =>
            `₹${Number(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

          const selectedRecords = payments.filter((p) => selectedPaymentIds.has(p.id));
          const eligibleSelected = selectedRecords.filter(
            (p) => p.status !== 'completed' && p.status !== 'approved'
          );
          const protectedSelected = selectedRecords.filter(
            (p) => p.status === 'completed' || p.status === 'approved'
          );
          const totalRemovableCount = payments.filter(
            (p) => p.status !== 'completed' && p.status !== 'approved'
          ).length;

          const handleSelectAllFiltered = () => {
            setSelectedPaymentIds((prev) => {
              const next = new Set(prev);
              filteredPayments.forEach((p) => next.add(p.id));
              return next;
            });
          };

          const handleSelectEligibleFiltered = () => {
            setSelectedPaymentIds((prev) => {
              const next = new Set(prev);
              filteredPayments
                .filter((p) => p.status !== 'completed' && p.status !== 'approved')
                .forEach((p) => next.add(p.id));
              return next;
            });
          };

          const handleClearSelection = () => {
            setSelectedPaymentIds(new Set());
          };

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                    <span>Payment Management & Revenue Analytics</span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                      {dateFilteredPayments.length} in Period · {payments.length} Total
                    </span>
                  </h2>
                  <p className="text-xs text-[#929292]">
                    Verified INR (₹) revenue analytics and transaction ledger synced with Supabase.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedPaymentIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setBulkDeleteModal({
                          section: 'payment_records',
                          title: `Delete ${selectedPaymentIds.size} Selected Payment Record(s)`,
                          ids: Array.from(selectedPaymentIds),
                          executing: false,
                          error: null,
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white text-xs font-bold shadow-md"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected ({selectedPaymentIds.size})</span>
                    </button>
                  )}
                  {totalRemovableCount > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        handleOpenCleanupModal(
                          'payments_old',
                          'Clean Failed & Stale Pending Payments',
                          0
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs font-bold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete All Failed / Pending ({totalRemovableCount})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Date Range Filter Bar */}
              <div className="bg-[#1D1D1D] border border-[#454545]/90 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-[#929292] flex items-center gap-1 mr-1">
                    <Calendar className="w-3.5 h-3.5 text-[#FF2525]" />
                    <span>Date Period:</span>
                  </span>
                  {(
                    [
                      { id: 'all', label: 'All Time' },
                      { id: 'today', label: 'Today' },
                      { id: '7d', label: 'Last 7 Days' },
                      { id: '30d', label: 'Last 30 Days' },
                      { id: 'this_month', label: 'This Month' },
                      { id: 'custom', label: 'Custom Date Range' },
                    ] as const
                  ).map((df) => (
                    <button
                      key={df.id}
                      type="button"
                      onClick={() => setPaymentDateFilter(df.id)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all ${
                        paymentDateFilter === df.id
                          ? 'bg-[#FF2525] text-white shadow-sm'
                          : 'bg-[#141414] text-[#C5C5C5] hover:bg-[#1D1D1D] border border-[#454545]'
                      }`}
                    >
                      {df.label}
                    </button>
                  ))}
                </div>

                {paymentDateFilter === 'custom' && (
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#929292]">From:</span>
                      <input
                        type="date"
                        value={paymentStartDate}
                        onChange={(e) => setPaymentStartDate(e.target.value)}
                        className="bg-[#141414] border border-[#454545] rounded-lg px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#929292]">To:</span>
                      <input
                        type="date"
                        value={paymentEndDate}
                        onChange={(e) => setPaymentEndDate(e.target.value)}
                        className="bg-[#141414] border border-[#454545] rounded-lg px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                    {(paymentStartDate || paymentEndDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentStartDate('');
                          setPaymentEndDate('');
                        }}
                        className="px-2 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[11px] text-[#C5C5C5] font-semibold"
                      >
                        Reset Dates
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 6-Card Payment Analytics Dashboard (Dynamically updated by Date Filter) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-gradient-to-br from-[#FF2525]/15 to-[#141414] border border-[#FF2525]/50 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#F5F5F5]/90">
                    Total Payment Received
                  </p>
                  <p className="text-lg font-extrabold text-white">{formatINR(totalPaymentReceived)}</p>
                  <p className="text-[10px] text-[#929292]">
                    Verified actual revenue
                  </p>
                </div>

                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#F5F5F5]">
                    Total Approved Payments
                  </p>
                  <p className="text-lg font-extrabold text-white">{approvedPaymentsCount}</p>
                  <p className="text-[10px] text-[#929292]">
                    {formatINR(approvedPaymentsAmount)} verified
                  </p>
                </div>

                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF2525]">
                    Total Completed Payments
                  </p>
                  <p className="text-lg font-extrabold text-white">{completedPaymentsCount}</p>
                  <p className="text-[10px] text-[#929292]">
                    {formatINR(completedPaymentsAmount)} settled
                  </p>
                </div>

                <div className="bg-[#1D1D1D] border border-[#FF762E]/50 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF762E]">
                    Total Pending Payments
                  </p>
                  <p className="text-lg font-extrabold text-white">{pendingPaymentsCount}</p>
                  <p className="text-[10px] text-[#929292]">
                    {formatINR(pendingPaymentsAmount)} unverified
                  </p>
                </div>

                <div className="bg-[#1D1D1D] border border-[#FF2525]/55 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF2525]">
                    Total Rejected Payments
                  </p>
                  <p className="text-lg font-extrabold text-white">{rejectedPaymentsCount}</p>
                  <p className="text-[10px] text-[#929292]">
                    {formatINR(rejectedPaymentsAmount)} excluded
                  </p>
                </div>

                <div className="bg-[#1D1D1D] border border-[#FF2525]/40 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF2525]">
                    Successful Transactions
                  </p>
                  <p className="text-lg font-extrabold text-white">{successfulTransactionsCount}</p>
                  <p className="text-[10px] text-[#929292]">
                    Deduplicated unique txns
                  </p>
                </div>
              </div>

              {/* Status Filter Tabs & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      paymentStatusFilter === 'all'
                        ? 'bg-[#FF2525] text-white shadow-md'
                        : 'bg-[#141414] text-[#C5C5C5] hover:bg-[#1D1D1D]'
                    }`}
                  >
                    All ({dateFilteredPayments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('approved')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      paymentStatusFilter === 'approved'
                        ? 'bg-[#FF2525] text-white shadow-md'
                        : 'bg-[#141414] text-[#C5C5C5] hover:bg-[#1D1D1D]'
                    }`}
                  >
                    Approved ({approvedPaymentsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('completed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      paymentStatusFilter === 'completed'
                        ? 'bg-[#FF2525] text-white shadow-md'
                        : 'bg-[#141414] text-[#C5C5C5] hover:bg-[#1D1D1D]'
                    }`}
                  >
                    Completed ({completedPaymentsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      paymentStatusFilter === 'pending'
                        ? 'bg-[#FF762E] text-white shadow-md'
                        : 'bg-[#141414] text-[#C5C5C5] hover:bg-[#1D1D1D]'
                    }`}
                  >
                    Pending ({pendingPaymentsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('rejected')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      paymentStatusFilter === 'rejected'
                        ? 'bg-[#FF2525] text-white shadow-md'
                        : 'bg-[#141414] text-[#C5C5C5] hover:bg-[#1D1D1D]'
                    }`}
                  >
                    Rejected ({rejectedPaymentsCount})
                  </button>
                </div>

                <div className="relative min-w-[230px]">
                  <input
                    type="text"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    placeholder="Search email, user ID, UTR, plan..."
                    className="w-full px-3 py-1.5 rounded-xl bg-[#141414]/90 border border-[#454545] text-xs text-white focus:outline-none focus:border-[#FF2525]/50"
                  />
                  {paymentSearch && (
                    <button
                      type="button"
                      onClick={() => setPaymentSearch('')}
                      className="absolute right-2 top-2 text-[#929292] hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selection Control Bar */}
              <div className="bg-[#1D1D1D] border border-[#454545]/80 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#C5C5C5]">
                    Selected: <strong className="text-white font-extrabold">{selectedPaymentIds.size}</strong> of {filteredPayments.length} records
                  </span>
                  {selectedPaymentIds.size > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-[#FF2525]/40 bg-[#FF2525]/10 text-[#FF2525]">
                      {eligibleSelected.length} eligible for deletion
                      {protectedSelected.length > 0 && ` · ${protectedSelected.length} audit-protected (completed)`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-semibold text-[11px]"
                  >
                    Select All ({filteredPayments.length})
                  </button>
                  {filteredPayments.some((p) => p.status !== 'completed' && p.status !== 'approved') && (
                    <button
                      type="button"
                      onClick={handleSelectEligibleFiltered}
                      className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-semibold text-[11px]"
                    >
                      Select Removable Only (
                      {filteredPayments.filter((p) => p.status !== 'completed' && p.status !== 'approved').length})
                    </button>
                  )}
                  {selectedPaymentIds.size > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] text-[#929292] hover:text-white font-semibold text-[11px]"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>

              {/* Payment Records Table */}
              <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl overflow-hidden">
                {filteredPayments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#929292]">
                    {payments.length === 0
                      ? 'No payment transactions exist in the database.'
                      : 'No payment records match the selected date period, status filter, or search.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#141414] border-b border-[#454545] text-[10px] font-extrabold uppercase tracking-wider text-[#929292]">
                          <th className="py-3 px-3 w-8">Sel</th>
                          <th className="py-3 px-3">User Email & ID</th>
                          <th className="py-3 px-3">VIP Plan</th>
                          <th className="py-3 px-3">Actual Amount</th>
                          <th className="py-3 px-3">Status</th>
                          <th className="py-3 px-3">Payment Date</th>
                          <th className="py-3 px-3">Verification Date</th>
                          <th className="py-3 px-3">Transaction / Ref ID</th>
                          <th className="py-3 px-3">Admin Verification Details</th>
                          <th className="py-3 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#454545]/70">
                        {filteredPayments.map((p) => {
                          const isPendingVerification =
                            p.status === 'pending_verification' || p.status === 'pending';
                          const isSelected = selectedPaymentIds.has(p.id);
                          return (
                            <tr
                              key={p.id}
                              className={`transition-colors ${
                                isSelected
                                  ? 'bg-[#FF2525]/25'
                                  : isPendingVerification
                                  ? 'bg-[#FF762E]/15'
                                  : 'hover:bg-[#141414]/40'
                              }`}
                            >
                              <td className="py-3 px-3 align-top">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleIdInSet(p.id, setSelectedPaymentIds)}
                                  aria-label={`Select payment record ${p.id}`}
                                  className="w-4 h-4 mt-0.5 accent-[#FF2525] rounded cursor-pointer"
                                />
                              </td>
                              <td className="py-3 px-3 align-top">
                                <p className="font-bold text-white break-all">{p.email}</p>
                                <p className="text-[10px] font-mono text-[#929292] mt-0.5">
                                  UID: {p.user_id || 'N/A'}
                                </p>
                                {p.submitted_email &&
                                  p.submitted_email.toLowerCase() !== p.email.toLowerCase() && (
                                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/30">
                                      Submitted: {p.submitted_email}
                                    </span>
                                  )}
                              </td>
                              <td className="py-3 px-3 align-top">
                                <span className="font-semibold text-[#F5F5F5] block">{p.plan_title || 'VIP Plan'}</span>
                                {p.vip_scope === 'single_platform' ? (
                                  <span className="inline-block mt-1 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[#FF762E]/20 text-[#FF762E] border border-[#FF762E]/60">
                                    ONE PLATFORM ONLY: {p.selected_platform_name || p.selected_platform_id || 'Selected'}
                                  </span>
                                ) : (
                                  <span className="inline-block mt-1 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[#141414] text-[#C5C5C5] border border-[#454545]">
                                    ALL PLATFORMS VIP
                                  </span>
                                )}
                                <div className="mt-0.5">
                                  {p.request_id && (
                                    <span className="inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#1D1D1D] text-[#FF762E] border border-[#454545]">
                                      {p.request_id}
                                    </span>
                                  )}
                                  {p.purchase_source && (
                                    <span className="inline-block ml-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[#FF2525]/15 text-[#FF2525]">
                                      {p.purchase_source === 'pre_key' ? 'Pre-Key' : 'In-App'}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 align-top">
                                <p className="font-extrabold text-white">{formatINR(p.amount)}</p>
                                {p.amount_mismatch && (
                                  <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FF762E]/20 text-[#FF762E] border border-[#FF762E]/50">
                                    Expected ₹{p.expected_amount}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 align-top">
                                <span
                                  className={`inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                                    p.status === 'completed' || p.status === 'approved'
                                      ? 'bg-[#1D1D1D]/70 text-[#F5F5F5] border-[#C5C5C5]/60'
                                      : p.status === 'failed' || p.status === 'rejected'
                                      ? 'bg-[#FF2525]/15 text-[#FF2525] border-[#FF2525]/55'
                                      : 'bg-[#FF762E]/15 text-[#FF762E] border-[#FF762E]/50'
                                  }`}
                                >
                                  {p.status === 'pending_verification' ? 'Pending Review' : p.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 align-top text-[11px] text-[#C5C5C5] whitespace-nowrap">
                                {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                              </td>
                              <td className="py-3 px-3 align-top text-[11px] text-[#C5C5C5] whitespace-nowrap">
                                {p.reviewed_at ? new Date(p.reviewed_at).toLocaleString() : '—'}
                              </td>
                              <td className="py-3 px-3 align-top">
                                <span className="font-mono text-[11px] text-[#F5F5F5]">
                                  {p.transaction_reference || '—'}
                                </span>
                              </td>
                              <td className="py-3 px-3 align-top max-w-[220px]">
                                {p.reviewed_by ? (
                                  <p className="text-[11px] font-semibold text-[#FF2525]">
                                    Verified by: {p.reviewed_by}
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-[#929292]">Unverified</p>
                                )}
                                {p.admin_note && (
                                  <p className="text-[10px] text-[#929292] italic mt-0.5 break-words">
                                    {p.admin_note}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 px-3 align-top text-right">
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  {p.screenshot_url && (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewScreenshotPayment(p)}
                                      className="px-2 py-1 rounded-lg bg-[#FF2525]/70 hover:bg-[#FF2525]/15 border border-[#FF2525]/40 text-[#FF2525] font-bold text-[10px] flex items-center gap-1"
                                    >
                                      <Eye className="w-3 h-3" />
                                      <span>Proof</span>
                                    </button>
                                  )}
                                  {isPendingVerification && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={verifyingPaymentId === p.id}
                                        onClick={() => handleVerifyPaymentClaim(p.id, 'approve')}
                                        className="px-2 py-1 rounded-lg bg-[#FF2525] hover:bg-[#FF2525] disabled:opacity-50 text-white font-bold text-[10px]"
                                      >
                                        {verifyingPaymentId === p.id ? '...' : 'Approve'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={verifyingPaymentId === p.id}
                                        onClick={() => handleVerifyPaymentClaim(p.id, 'reject')}
                                        className="px-2 py-1 rounded-lg bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 disabled:opacity-50 text-[#FF2525] font-bold text-[10px]"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setPaymentPendingDelete(p)}
                                    className="p-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#FF2525]/15 text-[#FF2525] hover:text-[#FF2525] transition-colors"
                                    title="Delete Payment Record"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Payment Screenshot Proof Review Modal */}
              {previewScreenshotPayment && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
                    <div className="flex items-center justify-between border-b border-[#454545] pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-white">Payment Verification Proof</h3>
                        <p className="text-[11px] text-[#929292]">
                          Claim ID: <span className="font-mono text-[#C5C5C5]">{previewScreenshotPayment.id}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewScreenshotPayment(null)}
                        className="text-[#929292] hover:text-white p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="bg-[#141414] border border-[#454545] rounded-xl p-3 space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-[#929292]">Account Email:</span>
                        <span className="font-bold text-white">{previewScreenshotPayment.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#929292]">User ID:</span>
                        <span className="font-mono text-[#C5C5C5]">{previewScreenshotPayment.user_id}</span>
                      </div>
                      {previewScreenshotPayment.submitted_email && (
                        <div className="flex justify-between">
                          <span className="text-[#929292]">Submitted Login Gmail:</span>
                          <span className="font-bold text-[#FF2525]">{previewScreenshotPayment.submitted_email}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-[#929292]">Entered Amount:</span>
                        <span className="font-extrabold text-[#FF762E]">₹{previewScreenshotPayment.amount}</span>
                      </div>
                      {previewScreenshotPayment.expected_amount !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-[#929292]">Configured Amount:</span>
                          <span className="font-bold text-[#F5F5F5]">₹{previewScreenshotPayment.expected_amount}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-[#929292]">Transaction ID / UTR:</span>
                        <span className="font-mono text-[#F5F5F5]">{previewScreenshotPayment.transaction_reference || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#929292]">Status:</span>
                        <span className="font-bold uppercase text-[#FF762E]">{previewScreenshotPayment.status}</span>
                      </div>
                    </div>

                    {previewScreenshotPayment.screenshot_url && (
                      <div className="bg-black border border-[#454545] rounded-xl p-2 flex items-center justify-center max-h-80 overflow-auto">
                        <img
                          src={
                            previewScreenshotPayment.screenshot_url.includes('/api/admin/payments')
                              ? `${previewScreenshotPayment.screenshot_url}?token=${encodeURIComponent(getStoredToken() || '')}`
                              : previewScreenshotPayment.screenshot_url
                          }
                          alt="Payment Proof Screenshot"
                          className="max-h-72 w-auto object-contain rounded"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#454545]">
                      <button
                        type="button"
                        onClick={() => setPreviewScreenshotPayment(null)}
                        className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] text-[#F5F5F5] font-bold"
                      >
                        Close
                      </button>
                      {(previewScreenshotPayment.status === 'pending_verification' ||
                        previewScreenshotPayment.status === 'pending') && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={verifyingPaymentId === previewScreenshotPayment.id}
                            onClick={() => handleVerifyPaymentClaim(previewScreenshotPayment.id, 'reject')}
                            className="px-3.5 py-2 rounded-xl bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] font-bold"
                          >
                            Reject Claim
                          </button>
                          <button
                            type="button"
                            disabled={verifyingPaymentId === previewScreenshotPayment.id}
                            onClick={() => handleVerifyPaymentClaim(previewScreenshotPayment.id, 'approve')}
                            className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold"
                          >
                            Approve & Activate VIP
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {paymentPendingDelete && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                    <div className="flex items-center gap-2 text-[#FF2525] font-bold text-sm">
                      <Trash2 className="w-4 h-4 shrink-0" />
                      <span>Delete Payment Record</span>
                    </div>
                    <div className="space-y-1.5 text-[#C5C5C5]">
                      <p>
                        Permanently delete this payment record from the database ledger?
                      </p>
                      <div className="p-2.5 rounded-xl bg-[#141414] border border-[#454545] text-[11px] space-y-1">
                        <div>Account: <strong className="text-white">{paymentPendingDelete.email}</strong></div>
                        <div>Amount: <strong className="text-[#F5F5F5]">₹{paymentPendingDelete.amount}</strong></div>
                        <div>Status: <span className="font-bold text-[#FF762E] uppercase">{paymentPendingDelete.status}</span></div>
                        {paymentPendingDelete.transaction_reference && (
                          <div>Ref: <span className="font-mono text-[#929292]">{paymentPendingDelete.transaction_reference}</span></div>
                        )}
                      </div>
                      {(paymentPendingDelete.status === 'completed' || paymentPendingDelete.status === 'approved') && (
                        <p className="text-[11px] text-[#FF762E]/90 bg-[#FF762E]/15 border border-[#FF762E]/50 rounded-lg p-2">
                          Notice: This record was marked completed. Deleting it will permanently remove it from the persistent Supabase database.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#454545]">
                      <button
                        type="button"
                        onClick={() => setPaymentPendingDelete(null)}
                        className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDeletePayment}
                        className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold shadow-md shadow-rose-950/50"
                      >
                        Confirm Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 8. LOGIN HISTORY */}
        {activeSection === 'history' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Login Audit History</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                    {history.length} Entries
                  </span>
                </h2>
                <p className="text-xs text-[#929292]">Legitimate timestamped login events and client metadata.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedHistoryIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBulkDeleteModal({
                        section: 'login_history',
                        title: `Delete ${selectedHistoryIds.size} Selected Login Log(s)`,
                        ids: Array.from(selectedHistoryIds),
                        executing: false,
                        error: null,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white text-xs font-bold shadow-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedHistoryIds.size})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    handleOpenCleanupModal(
                      'login_history_old',
                      'Clean Old Login History',
                      currentSettings?.retention_login_history_days || 30
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clean By Retention</span>
                </button>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      handleOpenCleanupModal(
                        'login_history_all',
                        'Delete All Login Audit History',
                        0
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-rose-800/80 border border-[#FF2525]/55 text-white text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete All ({history.length})</span>
                  </button>
                )}
              </div>
            </div>

            {history.length > 0 && (
              <div className="bg-[#1D1D1D] border border-[#454545]/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-[#929292]">
                  Selected: <strong className="text-white">{selectedHistoryIds.size}</strong> of {history.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryIds(new Set(history.map((h) => h.id)))}
                    className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-semibold text-[11px]"
                  >
                    Select All ({history.length})
                  </button>
                  {selectedHistoryIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryIds(new Set())}
                      className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] text-[#929292] font-semibold text-[11px]"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-6 text-center text-xs text-[#929292]">
                  No login audit entries exist in the database.
                </div>
              ) : (
                history.map((h) => {
                  const isSelected = selectedHistoryIds.has(h.id);
                  return (
                    <div
                      key={h.id}
                      className={`bg-[#1D1D1D] border rounded-2xl p-3 flex items-center justify-between gap-3 text-xs ${
                        isSelected ? 'border-[#FF2525]/70 bg-[#FF2525]/15' : 'border-[#454545]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleIdInSet(h.id, setSelectedHistoryIds)}
                          className="w-4 h-4 mt-1 accent-[#FF2525] rounded cursor-pointer shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white">{h.email}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                h.status === 'success'
                                  ? 'bg-[#1D1D1D]/80 text-[#F5F5F5] border-[#C5C5C5]/60'
                                  : h.status === 'DEVICE_MISMATCH_BLOCKED'
                                  ? 'bg-[#FF762E]/15 text-[#FF762E] border-[#FF762E]/50'
                                  : h.status === 'DEVICE_RESET_BY_ADMIN'
                                  ? 'bg-[#FF2525]/80 text-[#FF2525] border-[#FF2525]/50'
                                  : 'bg-[#FF2525]/15 text-[#FF2525] border-[#FF2525]/55'
                              }`}
                            >
                              {h.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#929292] mt-0.5">
                            IP: {h.ip_address} · {new Date(h.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHistoryPendingDelete(h)}
                        className="p-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#FF2525]/15 text-[#FF2525] shrink-0"
                        title="Delete Login Log"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {historyPendingDelete && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete Login Log</h3>
                  <p className="text-[#C5C5C5]">
                    Remove login history entry for <strong className="text-white">{historyPendingDelete.email}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setHistoryPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] text-[#F5F5F5] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteLoginHistory}
                      className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 8b. FEEDBACK MANAGEMENT (VIP & Non-VIP Users) */}
        {activeSection === 'feedback' && (() => {
          const now = new Date();
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const startOf7Days = now.getTime() - 7 * 24 * 3600 * 1000;
          const startOf30Days = now.getTime() - 30 * 24 * 3600 * 1000;

          const filteredFeedback = feedbackRecords.filter((f) => {
            if (feedbackVipFilter === 'vip' && !f.is_vip_at_submission) return false;
            if (feedbackVipFilter === 'non_vip' && f.is_vip_at_submission) return false;
            if (feedbackCategoryFilter !== 'all' && f.category !== feedbackCategoryFilter) return false;
            if (feedbackRatingFilter !== 'all' && Number(f.rating) !== Number(feedbackRatingFilter)) return false;
            if (feedbackStatusFilter !== 'all' && f.status !== feedbackStatusFilter) return false;
            if (feedbackDateFilter !== 'all') {
              const createdMs = new Date(f.created_at).getTime();
              if (isNaN(createdMs)) return false;
              if (feedbackDateFilter === 'today' && createdMs < startOfToday) return false;
              if (feedbackDateFilter === '7d' && createdMs < startOf7Days) return false;
              if (feedbackDateFilter === '30d' && createdMs < startOf30Days) return false;
            }
            if (feedbackSearch.trim()) {
              const q = feedbackSearch.trim().toLowerCase();
              const matchEmail = f.user_email.toLowerCase().includes(q);
              const matchUid = f.user_id.toLowerCase().includes(q);
              const matchMsg = f.message.toLowerCase().includes(q);
              if (!matchEmail && !matchUid && !matchMsg) return false;
            }
            return true;
          });

          const totalFeedbackCount = feedbackRecords.length;
          const newFeedbackCount = feedbackRecords.filter((f) => f.status === 'New').length;
          const inReviewFeedbackCount = feedbackRecords.filter((f) => f.status === 'In Review').length;
          const resolvedFeedbackCount = feedbackRecords.filter((f) => f.status === 'Resolved').length;
          const vipFeedbackCount = feedbackRecords.filter((f) => f.is_vip_at_submission).length;
          const avgRating =
            totalFeedbackCount > 0
              ? (feedbackRecords.reduce((acc, f) => acc + (Number(f.rating) || 0), 0) / totalFeedbackCount).toFixed(1)
              : '0.0';

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                    <span>User Feedback Management</span>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                      {totalFeedbackCount} Submissions
                    </span>
                  </h2>
                  <p className="text-xs text-[#929292]">
                    Review, filter, and respond to feedback submitted by both VIP and Non-VIP students.
                  </p>
                </div>
              </div>

              {/* Feedback Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-[#929292]">Total Feedback</p>
                  <p className="text-lg font-extrabold text-white">{totalFeedbackCount}</p>
                </div>
                <div className="bg-[#1D1D1D] border border-[#FF762E]/50 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-[#FF762E]">New</p>
                  <p className="text-lg font-extrabold text-white">{newFeedbackCount}</p>
                </div>
                <div className="bg-[#1D1D1D] border border-[#FF2525]/40 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-[#FF2525]">In Review</p>
                  <p className="text-lg font-extrabold text-white">{inReviewFeedbackCount}</p>
                </div>
                <div className="bg-[#1D1D1D] border border-[#C5C5C5]/60 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-[#F5F5F5]">Resolved</p>
                  <p className="text-lg font-extrabold text-white">{resolvedFeedbackCount}</p>
                </div>
                <div className="bg-[#1D1D1D] border border-[#FF2525]/40 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-[#FF2525]">VIP Users</p>
                  <p className="text-lg font-extrabold text-white">
                    {vipFeedbackCount} / {totalFeedbackCount - vipFeedbackCount} Non-VIP
                  </p>
                </div>
                <div className="bg-[#1D1D1D] border border-[#FF762E]/50 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-[#FF762E]">Avg Rating</p>
                  <p className="text-lg font-extrabold text-white flex items-center gap-1">
                    <span>{avgRating}</span>
                    <Star className="w-4 h-4 text-[#FF762E] fill-amber-400" />
                  </p>
                </div>
              </div>

              {/* Filter & Search Controls */}
              <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-3.5 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#929292] block mb-1">
                      VIP / Non-VIP
                    </label>
                    <select
                      value={feedbackVipFilter}
                      onChange={(e) => setFeedbackVipFilter(e.target.value as 'all' | 'vip' | 'non_vip')}
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="all">All Users</option>
                      <option value="vip">VIP Users Only</option>
                      <option value="non_vip">Non-VIP Users Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#929292] block mb-1">
                      Category
                    </label>
                    <select
                      value={feedbackCategoryFilter}
                      onChange={(e) => setFeedbackCategoryFilter(e.target.value as 'all' | FeedbackCategory)}
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="all">All Categories</option>
                      <option value="General Feedback">General Feedback</option>
                      <option value="Bug Report">Bug Report</option>
                      <option value="Platform Issue">Platform Issue</option>
                      <option value="VIP Membership">VIP Membership</option>
                      <option value="Payment Issue">Payment Issue</option>
                      <option value="Feature Request">Feature Request</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#929292] block mb-1">
                      Rating
                    </label>
                    <select
                      value={feedbackRatingFilter}
                      onChange={(e) =>
                        setFeedbackRatingFilter(e.target.value as 'all' | '1' | '2' | '3' | '4' | '5')
                      }
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="all">All Ratings</option>
                      <option value="5">5 Stars (★★★★★)</option>
                      <option value="4">4 Stars (★★★★☆)</option>
                      <option value="3">3 Stars (★★★☆☆)</option>
                      <option value="2">2 Stars (★★☆☆☆)</option>
                      <option value="1">1 Star (★☆☆☆☆)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#929292] block mb-1">
                      Status
                    </label>
                    <select
                      value={feedbackStatusFilter}
                      onChange={(e) => setFeedbackStatusFilter(e.target.value as 'all' | FeedbackStatus)}
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="all">All Statuses</option>
                      <option value="New">New</option>
                      <option value="In Review">In Review</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#929292] block mb-1">
                      Submission Date
                    </label>
                    <select
                      value={feedbackDateFilter}
                      onChange={(e) => setFeedbackDateFilter(e.target.value as 'all' | 'today' | '7d' | '30d')}
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#929292] block mb-1">
                      Search Email or User ID
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={feedbackSearch}
                        onChange={(e) => setFeedbackSearch(e.target.value)}
                        placeholder="Email, UID, keyword..."
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-2.5 py-1.5 text-xs text-white"
                      />
                      {feedbackSearch && (
                        <button
                          type="button"
                          onClick={() => setFeedbackSearch('')}
                          className="absolute right-2 top-2 text-[#929292] hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Feedback List */}
              <div className="space-y-2.5">
                {filteredFeedback.length === 0 ? (
                  <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-6 text-center text-xs text-[#929292]">
                    {feedbackRecords.length === 0
                      ? 'No user feedback has been submitted yet.'
                      : 'No feedback entries match the active filters.'}
                  </div>
                ) : (
                  filteredFeedback.map((f) => (
                    <div
                      key={f.id}
                      className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">{f.user_email}</span>
                          <span className="font-mono text-[10px] text-[#929292]">UID: {f.user_id.slice(0, 12)}</span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              f.is_vip_at_submission
                                ? 'bg-[#FF762E]/15 text-[#FF762E] border-[#FF762E]/50'
                                : 'bg-[#1D1D1D] text-[#C5C5C5] border-[#454545]'
                            }`}
                          >
                            {f.is_vip_at_submission ? 'VIP User' : 'Non-VIP User'}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF2525]/60 text-[#FF2525] border border-[#FF2525]/40">
                            {f.category}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#FF762E]">
                            {'★'.repeat(Math.max(1, Math.min(5, Number(f.rating) || 5)))}
                            <span className="text-slate-600">
                              {'★'.repeat(5 - Math.max(1, Math.min(5, Number(f.rating) || 5)))}
                            </span>
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              f.status === 'Resolved'
                                ? 'bg-[#1D1D1D]/80 text-[#F5F5F5] border-[#C5C5C5]/60'
                                : f.status === 'In Review'
                                ? 'bg-[#FF2525]/80 text-[#FF2525] border-[#FF2525]/50'
                                : f.status === 'Rejected'
                                ? 'bg-[#FF2525]/15 text-[#FF2525] border-[#FF2525]/55'
                                : 'bg-[#FF762E]/15 text-[#FF762E] border-[#FF762E]/50'
                            }`}
                          >
                            {f.status}
                          </span>
                        </div>

                        <p className="text-xs text-[#F5F5F5] whitespace-pre-wrap break-words leading-relaxed">
                          {f.message}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#929292] pt-0.5">
                          <span>Submitted: {new Date(f.created_at).toLocaleString()}</span>
                          {f.reviewed_by && <span>Reviewed by: {f.reviewed_by}</span>}
                          {f.admin_note && (
                            <span className="text-[#FF2525] italic">Admin Note: {f.admin_note}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFeedbackDetail(f);
                            setFeedbackStatusDraft(f.status);
                            setFeedbackAdminNoteDraft(f.admin_note || '');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#FF2525]/20 hover:bg-[#FF2525]/30 border border-[#FF2525]/40 text-[#FF2525] font-bold text-[11px] flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Review / Manage</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedbackPendingDelete(f)}
                          className="p-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#FF2525]/15 text-[#FF2525] hover:text-[#FF2525] transition-colors"
                          title="Delete Feedback"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Feedback Details, Attachment Viewer & Status/Admin Note Modal */}
              {selectedFeedbackDetail && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-[#454545] pb-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-white">Feedback Details & Moderation</h3>
                        <p className="text-[11px] text-[#929292]">
                          ID: <span className="font-mono text-[#C5C5C5]">{selectedFeedbackDetail.id}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFeedbackDetail(null)}
                        className="text-[#929292] hover:text-white p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="bg-[#141414] border border-[#454545] rounded-xl p-3 space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-[#929292]">User Email:</span>
                        <span className="font-bold text-white">{selectedFeedbackDetail.user_email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#929292]">User ID:</span>
                        <span className="font-mono text-[#C5C5C5]">{selectedFeedbackDetail.user_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#929292]">Membership at Submission:</span>
                        <span
                          className={`font-bold ${
                            selectedFeedbackDetail.is_vip_at_submission ? 'text-[#FF762E]' : 'text-[#C5C5C5]'
                          }`}
                        >
                          {selectedFeedbackDetail.is_vip_at_submission ? 'VIP Member' : 'Non-VIP User'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#929292]">Category:</span>
                        <span className="font-bold text-[#FF2525]">{selectedFeedbackDetail.category}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#929292]">Rating:</span>
                        <span className="font-bold text-[#FF762E]">
                          {'★'.repeat(selectedFeedbackDetail.rating)} ({selectedFeedbackDetail.rating}/5)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#929292]">Submitted At:</span>
                        <span className="text-[#C5C5C5]">
                          {new Date(selectedFeedbackDetail.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Feedback Message</label>
                      <div className="p-3 rounded-xl bg-[#141414] border border-[#454545] text-[#F5F5F5] whitespace-pre-wrap break-words leading-relaxed">
                        {selectedFeedbackDetail.message}
                      </div>
                    </div>

                    {selectedFeedbackDetail.attachment_url && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-[#C5C5C5] block">
                          Attached Screenshot
                        </label>
                        <div className="bg-black border border-[#454545] rounded-xl p-2 flex items-center justify-center max-h-72 overflow-auto">
                          <img
                            src={`${selectedFeedbackDetail.attachment_url}?token=${encodeURIComponent(
                              getStoredToken() || ''
                            )}`}
                            alt="Feedback Attachment"
                            className="max-h-64 w-auto object-contain rounded"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 pt-2 border-t border-[#454545]">
                      <div>
                        <label className="text-[11px] font-bold text-[#C5C5C5] block mb-1">
                          Update Feedback Status
                        </label>
                        <select
                          value={feedbackStatusDraft}
                          onChange={(e) => setFeedbackStatusDraft(e.target.value as FeedbackStatus)}
                          className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                        >
                          <option value="New">New</option>
                          <option value="In Review">In Review</option>
                          <option value="Resolved">Resolved</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-[#C5C5C5] block mb-1">
                          Internal Admin Note (Private — never shown to users)
                        </label>
                        <textarea
                          rows={3}
                          value={feedbackAdminNoteDraft}
                          onChange={(e) => setFeedbackAdminNoteDraft(e.target.value)}
                          placeholder="Add internal investigation or resolution notes..."
                          className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#454545]">
                      <button
                        type="button"
                        onClick={() => setSelectedFeedbackDetail(null)}
                        className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        disabled={isSavingFeedbackUpdate}
                        onClick={handleSaveFeedbackAdminUpdate}
                        className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] disabled:opacity-50 text-white font-bold flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{isSavingFeedbackUpdate ? 'Saving...' : 'Save Status & Note'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Delete Feedback Confirmation Modal */}
              {feedbackPendingDelete && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-[#FF2525]" />
                      <span>Delete User Feedback</span>
                    </h3>
                    <p className="text-[#C5C5C5]">
                      Permanently delete this feedback submission from{' '}
                      <strong className="text-white">{feedbackPendingDelete.user_email}</strong>?
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        disabled={isDeletingFeedback}
                        onClick={() => setFeedbackPendingDelete(null)}
                        className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] text-[#F5F5F5] font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingFeedback}
                        onClick={handleConfirmDeleteFeedback}
                        className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] disabled:opacity-50 text-white font-bold"
                      >
                        {isDeletingFeedback ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* 9. ANNOUNCEMENTS & SLIDER CONTROLS */}
        {activeSection === 'announcements' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Announcements & Automatic Slider</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                    {announcements.length} Total · {announcements.filter((a) => a.is_published).length} Active
                  </span>
                </h2>
                <p className="text-xs text-[#929292]">
                  Manage notices, rotation timing, display order, and schedule dates on the Home page slider.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedAnnouncementIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBulkDeleteModal({
                        section: 'announcements',
                        title: `Delete ${selectedAnnouncementIds.size} Selected Announcement(s)`,
                        ids: Array.from(selectedAnnouncementIds),
                        executing: false,
                        error: null,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white text-xs font-bold shadow-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedAnnouncementIds.size})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenCleanupModal('announcements_expired', 'Clean Expired & Inactive Announcements')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    Clean Expired / Inactive (
                    {
                      announcements.filter(
                        (a) => !a.is_published || (a.end_date && new Date(a.end_date).getTime() < Date.now())
                      ).length
                    }
                    )
                  </span>
                </button>
                {announcements.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOpenCleanupModal('announcements_all', 'Delete All Announcements')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF2525]/15 hover:bg-rose-800/80 border border-[#FF2525]/55 text-white text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete All ({announcements.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Announcement Slider Global Controls */}
            <div className="bg-[#1D1D1D] border border-[#FF2525]/30 rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#FF2525]" />
                  <span>Automatic Announcement Slider Controls</span>
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    sliderEnabled
                      ? 'bg-[#1D1D1D]/70 text-[#F5F5F5] border border-[#C5C5C5]/60'
                      : 'bg-[#1D1D1D] text-[#929292]'
                  }`}
                >
                  {sliderEnabled ? `Active (${sliderIntervalSec}s interval)` : 'Slider Disabled'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="flex items-center justify-between bg-[#141414] border border-[#454545] rounded-xl p-3">
                  <div>
                    <label className="font-bold text-white block">Announcement Slider ON / OFF</label>
                    <p className="text-[10px] text-[#929292]">Show or hide the announcement banner on Home</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={sliderEnabled}
                    onChange={(e) => setSliderEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#FF2525]"
                  />
                </div>

                <div className="bg-[#141414] border border-[#454545] rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <label className="font-bold text-white block">Slide Interval (Seconds)</label>
                    <p className="text-[10px] text-[#929292]">Auto-advance speed (2 to 60s)</p>
                  </div>
                  <input
                    type="number"
                    min="2"
                    max="60"
                    value={sliderIntervalSec}
                    onChange={(e) => setSliderIntervalSec(Number(e.target.value))}
                    className="w-20 bg-[#141414] border border-[#454545] rounded-lg px-2.5 py-1.5 text-white font-bold text-center"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={isSavingSliderSettings}
                  onClick={handleSaveSliderControls}
                  className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingSliderSettings ? 'Saving...' : 'Save Slider Settings'}</span>
                </button>
              </div>
            </div>

            {/* Create New Announcement Form */}
            <form onSubmit={handleCreateAnnouncement} className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-4 space-y-3 text-xs">
              <h3 className="text-xs font-bold text-white">Create New Announcement Slide</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-[#C5C5C5]">Announcement Title *</label>
                  <input
                    type="text"
                    required
                    value={newAnnTitle}
                    onChange={(e) => setNewAnnTitle(e.target.value)}
                    placeholder="e.g. New SSC & Banking VIP Batch Live!"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#C5C5C5]">Display Order</label>
                  <input
                    type="number"
                    min="1"
                    value={newAnnDisplayOrder}
                    onChange={(e) => setNewAnnDisplayOrder(Number(e.target.value))}
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#C5C5C5]">Announcement Message / Content *</label>
                <textarea
                  required
                  rows={2}
                  value={newAnnContent}
                  onChange={(e) => setNewAnnContent(e.target.value)}
                  placeholder="Details of the announcement..."
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#C5C5C5]">Action Link URL (Optional)</label>
                  <input
                    type="text"
                    value={newAnnLinkUrl}
                    onChange={(e) => setNewAnnLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#C5C5C5]">Start Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={newAnnStartDate}
                    onChange={(e) => setNewAnnStartDate(e.target.value)}
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#C5C5C5]">End Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={newAnnEndDate}
                    onChange={(e) => setNewAnnEndDate(e.target.value)}
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-[#C5C5C5] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAnnPublished}
                    onChange={(e) => setNewAnnPublished(e.target.checked)}
                    className="w-4 h-4 accent-[#FF2525]"
                  />
                  <span>Active (Publish immediately to slider)</span>
                </label>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Publish Notice</span>
                </button>
              </div>
            </form>

            {announcements.length > 0 && (
              <div className="bg-[#1D1D1D] border border-[#454545]/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-[#929292]">
                  Selected: <strong className="text-white">{selectedAnnouncementIds.size}</strong> of{' '}
                  {announcements.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAnnouncementIds(new Set(announcements.map((a) => a.id)))}
                    className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-semibold text-[11px]"
                  >
                    Select All ({announcements.length})
                  </button>
                  {selectedAnnouncementIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedAnnouncementIds(new Set())}
                      className="px-2.5 py-1 rounded-lg bg-[#141414] hover:bg-[#1D1D1D] text-[#929292] font-semibold text-[11px]"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Announcements List */}
            <div className="space-y-2">
              {announcements.length === 0 ? (
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-6 text-center text-xs text-[#929292]">
                  No announcements exist in the database.
                </div>
              ) : (
                announcements.map((a) => {
                  const isSelected = selectedAnnouncementIds.has(a.id);
                  return (
                    <div
                      key={a.id}
                      className={`bg-[#1D1D1D] border rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        isSelected ? 'border-[#FF2525]/70 bg-[#FF2525]/15' : 'border-[#454545]'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleIdInSet(a.id, setSelectedAnnouncementIds)}
                          className="w-4 h-4 mt-1 accent-[#FF2525] rounded cursor-pointer shrink-0"
                        />
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#1D1D1D] text-[#FF2525]">
                              #{a.display_order ?? 1}
                            </span>
                            <h4 className="font-bold text-white">{a.title}</h4>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                a.is_published
                                  ? 'bg-[#1D1D1D]/70 text-[#F5F5F5] border border-[#C5C5C5]/60'
                                  : 'bg-[#1D1D1D] text-[#929292]'
                              }`}
                            >
                              {a.is_published ? 'Active' : 'Hidden'}
                            </span>
                          </div>
                          <p className="text-[#C5C5C5] text-[11px]">{a.content}</p>
                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#929292]">
                            <span>Created: {new Date(a.created_at).toLocaleDateString()}</span>
                            {a.link_url && <span className="text-[#FF2525] truncate max-w-xs">Link: {a.link_url}</span>}
                            {a.start_date && <span>Starts: {new Date(a.start_date).toLocaleString()}</span>}
                            {a.end_date && <span>Ends: {new Date(a.end_date).toLocaleString()}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleAnnouncementActive(a)}
                          className={`px-2.5 py-1.5 rounded-lg font-bold text-[10px] border ${
                            a.is_published
                              ? 'bg-[#1D1D1D] text-[#C5C5C5] border-[#454545] hover:bg-[#2A2A2A]'
                              : 'bg-[#1D1D1D]/60 text-[#F5F5F5] border-[#C5C5C5]/60 hover:bg-[#1D1D1D]/60'
                          }`}
                        >
                          {a.is_published ? 'Hide' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAnnouncement(a)}
                          className="p-1.5 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF2525]"
                          title="Edit Announcement"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnnPendingDelete(a)}
                          className="p-1.5 rounded-lg bg-[#1D1D1D] text-[#FF2525] hover:bg-[#FF2525]/15"
                          title="Delete Announcement"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Edit Announcement Modal */}
            {editingAnnouncement && (
              <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-3xl max-w-md w-full p-6 space-y-3 text-xs">
                  <h3 className="text-sm font-bold text-white">Edit Announcement</h3>
                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5]">Title</label>
                    <input
                      type="text"
                      value={editingAnnouncement.title}
                      onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })}
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-[#C5C5C5]">Content</label>
                    <textarea
                      rows={3}
                      value={editingAnnouncement.content}
                      onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, content: e.target.value })}
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Display Order</label>
                      <input
                        type="number"
                        min="1"
                        value={editingAnnouncement.display_order ?? 1}
                        onChange={(e) =>
                          setEditingAnnouncement({ ...editingAnnouncement, display_order: Number(e.target.value) })
                        }
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-[#C5C5C5]">Action Link URL</label>
                      <input
                        type="text"
                        value={editingAnnouncement.link_url || ''}
                        onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, link_url: e.target.value })}
                        placeholder="https://..."
                        className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white mt-1"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[#C5C5C5] pt-1">
                    <input
                      type="checkbox"
                      checked={editingAnnouncement.is_published}
                      onChange={(e) =>
                        setEditingAnnouncement({ ...editingAnnouncement, is_published: e.target.checked })
                      }
                      className="w-4 h-4 accent-[#FF2525]"
                    />
                    <span>Published / Visible in Slider</span>
                  </label>
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#454545]">
                    <button
                      type="button"
                      onClick={() => setEditingAnnouncement(null)}
                      className="px-4 py-2 rounded-xl bg-[#1D1D1D] text-[#C5C5C5] font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEditedAnnouncement}
                      className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete Announcement Confirmation Modal */}
            {annPendingDelete && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete Announcement</h3>
                  <p className="text-[#C5C5C5]">
                    Are you sure you want to delete <strong className="text-white">{annPendingDelete.title}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAnnPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] text-[#F5F5F5] font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnnouncement(annPendingDelete.id)}
                      className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 10. SETTINGS (System, VIP Payment Flow, Telegram Popup, Support Link & Image, Donation, Custom Popup & Storage Cleanup) */}
        {activeSection === 'settings' && currentSettings && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 sticky top-16 z-20 bg-[#090909]/95 backdrop-blur-md py-2 border-b border-[#454545]/80">
              <div>
                <h2 className="text-base font-extrabold text-white">System, Get VIP Payment, Support & Donation Settings</h2>
                <p className="text-xs text-[#929292]">
                  Configure Get VIP options (Telegram & Payment QR), Support section image & link, popups, and system parameters.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {settingsSaveStatus === 'error' && settingsSaveError && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#FF2525]/15 text-[#FF2525] border border-[#FF2525]/50">
                    Save Error: {settingsSaveError}
                  </span>
                )}
                {isSettingsDirty && settingsSaveStatus !== 'saving' && (
                  <span className="text-[11px] font-mono-tech font-bold px-2.5 py-1 rounded-lg bg-[#FF762E]/15 text-[#FF762E] border border-[#FF762E]/50 uppercase tracking-wider">
                    Unsaved Changes
                  </span>
                )}
                {!isSettingsDirty && settingsSaveStatus === 'saved' && (
                  <span className="text-[11px] font-mono-tech font-bold px-2.5 py-1 rounded-lg bg-[#1D1D1D] text-[#C5C5C5] border border-[#454545] uppercase tracking-wider">
                    Saved &amp; Synced
                  </span>
                )}
                <button
                  onClick={handleSaveGlobalSettings}
                  disabled={!isSettingsDirty || isSavingSettings}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                    isSettingsDirty && !isSavingSettings
                      ? 'ra-btn-primary active:scale-95'
                      : 'bg-[#1D1D1D] text-[#929292] border border-[#454545] cursor-not-allowed'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingSettings ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            {/* CARD 1: CORE SYSTEM SETTINGS */}
            <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-5 space-y-4 text-xs">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2 pb-2 border-b border-[#454545]">
                <SettingsIcon className="w-4 h-4 text-[#FF2525]" />
                <span>A. Core Access & System Settings</span>
              </h3>

              {/* 1. Key Generation Page ON/OFF */}
              <div className="flex items-center justify-between pb-3 border-b border-[#454545]/80">
                <div>
                  <label className="font-bold text-white block">1. Key Generation Page ON/OFF</label>
                  <p className="text-[11px] text-[#929292]">
                    When OFF, non-VIP users bypass key generation and proceed directly to Home.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={currentSettings.key_generation_enabled}
                  onChange={(e) => handleSettingChange('key_generation_enabled', e.target.checked)}
                  className="w-4 h-4 accent-[#FF2525]"
                />
              </div>

              {/* Shortener Destination URL Helper */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#FF2525] to-[#C90000] border border-[#FF2525]/40 text-xs">
                <div className="flex items-center gap-2 text-[#FF2525] font-extrabold mb-1">
                  <Key className="w-4 h-4 text-[#FF2525]" />
                  <span>Your Key Destination URL (Paste in Shortener)</span>
                </div>
                <p className="text-[11px] text-[#C5C5C5] mb-2 leading-relaxed">
                  Paste this link into <span className="text-[#FF762E] font-bold">ShrinkMe.io</span>, <span className="text-[#FF762E] font-bold">GPlinks</span>, or any shortener to create your shortened URL. When students solve the shortener, they land here and their 24-hour access pass is instantly unlocked!
                </p>
                <div className="flex items-center gap-2 bg-[#080D1A] p-2 rounded-xl border border-[#454545]">
                  <code className="text-xs text-[#FF2525] font-mono flex-1 select-all truncate">
                    {typeof window !== 'undefined' ? `${window.location.origin}/key-verify` : 'https://your-domain/key-verify'}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      const dest = `${window.location.origin}/key-verify`;
                      navigator.clipboard.writeText(dest);
                      setCopiedDestUrl(true);
                      setTimeout(() => setCopiedDestUrl(false), 3000);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-md transition-all active:scale-95"
                  >
                    {copiedDestUrl ? <Check className="w-3.5 h-3.5 text-[#F5F5F5]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDestUrl ? 'Copied Link!' : 'Copy Link for Shortener'}</span>
                  </button>
                </div>
              </div>

              {/* 2. Key Generation URL Shortener link */}
              <div className="pb-3 border-b border-[#454545]/80">
                <label className="font-bold text-white block mb-1">
                  2. Key Generation URL Shortener link (Generated from ShrinkMe.io)
                </label>
                <input
                  type="text"
                  value={currentSettings.shortener_url}
                  onChange={(e) => handleSettingChange('shortener_url', e.target.value)}
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* 3. How to Generate Key tutorial video link */}
              <div className="pb-3 border-b border-[#454545]/80">
                <label className="font-bold text-white block mb-1">
                  3. How to Generate Key tutorial video link
                </label>
                <input
                  type="text"
                  value={currentSettings.tutorial_video_url}
                  onChange={(e) => handleSettingChange('tutorial_video_url', e.target.value)}
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* 4. Maintenance Mode ON/OFF */}
              <div className="flex items-center justify-between pb-3 border-b border-[#454545]/80">
                <div>
                  <label className="font-bold text-white block">4. Maintenance Mode ON/OFF (Super Admin)</label>
                  <p className="text-[11px] text-[#929292]">
                    When ON, public visitors see maintenance notice; administrators retain access.
                  </p>
                </div>
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={currentSettings.maintenance_mode}
                  onChange={(e) => handleSettingChange('maintenance_mode', e.target.checked)}
                  className="w-4 h-4 accent-amber-500 disabled:opacity-40"
                />
              </div>

              {/* 5. Login Page ON/OFF */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-bold text-white block">5. Login Page ON/OFF (Super Admin)</label>
                  <p className="text-[11px] text-[#929292]">
                    When OFF, new logins are blocked; existing active sessions remain preserved.
                  </p>
                </div>
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={currentSettings.login_enabled}
                  onChange={(e) => handleSettingChange('login_enabled', e.target.checked)}
                  className="w-4 h-4 accent-[#FF2525] disabled:opacity-40"
                />
              </div>
            </div>

            {/* CARD 1B: GET VIP PAGE — TELEGRAM & PAYMENT QR CODE CONFIGURATION */}
            <div className="bg-[#1D1D1D] border border-[#FF762E]/50 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#454545]">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Crown className="w-4 h-4 text-[#FF762E]" />
                  <span>Get VIP Page — Option A (Telegram) & Option B (Payment QR Code)</span>
                </h3>
                <button
                  type="button"
                  onClick={handleSaveGlobalSettings}
                  className="px-3 py-1.5 rounded-xl bg-[#FF762E] hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save VIP Payment Settings</span>
                </button>
              </div>

              {/* Option A: Telegram URL */}
              <div className="pb-3 border-b border-[#454545]/80">
                <label className="font-bold text-white block mb-1">
                  Option A — VIP Telegram URL
                </label>
                <p className="text-[11px] text-[#929292] mb-1.5 leading-relaxed">
                  Redirect destination when users choose the Telegram option on the Get VIP page.
                </p>
                <input
                  type="text"
                  value={currentSettings.vip_telegram_url ?? currentSettings.vip_purchase_url ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!currentSettings) return;
                    const updated = {
                      ...currentSettings,
                      vip_telegram_url: val,
                      vip_purchase_url: val,
                    };
                    setCurrentSettings(updated);
                    setIsSettingsDirty(JSON.stringify(updated) !== JSON.stringify(originalSettings));
                  }}
                  placeholder="https://t.me/your_official_telegram"
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              {/* Option B: Payment QR Code & Amount Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-white block mb-1">
                      Option B — Configured Payment Amount (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={currentSettings.vip_payment_amount ?? 0}
                      onChange={(e) => handleSettingChange('vip_payment_amount', Number(e.target.value))}
                      placeholder="e.g. 199"
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                    />
                    <p className="text-[10px] text-[#929292] mt-1">
                      Displayed on the QR payment view. If 0, uses the selected VIP plan price.
                    </p>
                  </div>

                  <div>
                    <label className="font-bold text-white block mb-1">
                      Payment Instructions (Shown under QR Code)
                    </label>
                    <textarea
                      rows={3}
                      value={currentSettings.vip_payment_instructions || ''}
                      onChange={(e) => handleSettingChange('vip_payment_instructions', e.target.value)}
                      placeholder="Scan the QR code using any UPI app (GPay, PhonePe, Paytm), complete payment, and submit your screenshot below."
                      className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <label className="font-bold text-white block">Require Transaction ID / UTR</label>
                      <p className="text-[10px] text-[#929292]">
                        When OFF, the UTR field is clearly labeled optional for students.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(currentSettings.vip_payment_utr_required)}
                      onChange={(e) => handleSettingChange('vip_payment_utr_required', e.target.checked)}
                      className="w-4 h-4 accent-amber-500"
                    />
                  </div>
                </div>

                {/* Payment QR Code Image Upload & Persistent Preview */}
                <div className="space-y-2">
                  <label className="font-bold text-white block">
                    Option B — Payment QR Code Image
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentSettings.vip_payment_qr_url || ''}
                      onChange={(e) => handleSettingChange('vip_payment_qr_url', e.target.value)}
                      placeholder="Upload QR code image or paste URL"
                      className="flex-1 bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                    />
                    <label className="px-3 py-2 rounded-xl bg-[#FF762E]/20 hover:bg-[#FF762E]/30 border border-[#FF762E]/50 text-[#FF762E] font-bold cursor-pointer shrink-0 flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isUploadingAsset ? 'Saving...' : 'Upload QR'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={(e) => handleUploadSettingAsset(e, 'vip_payment_qr_url')}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {currentSettings.vip_payment_qr_url ? (
                    <div className="p-3 rounded-xl bg-[#141414] border border-[#454545] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-white rounded-lg shrink-0">
                          <img
                            src={currentSettings.vip_payment_qr_url}
                            alt="Configured Payment QR"
                            className="w-16 h-16 object-contain"
                          />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-[#F5F5F5]">Payment QR Active & Saved</p>
                          <p className="text-[10px] text-[#929292] truncate max-w-[160px]">
                            {currentSettings.vip_payment_qr_url}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSettingAsset('vip_payment_qr_url')}
                        className="px-2.5 py-1.5 rounded-lg bg-[#FF2525]/15 hover:bg-[#FF2525]/15 text-[#FF2525] text-[10px] font-bold"
                      >
                        Remove QR
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-[#141414] border border-dashed border-[#454545] text-center text-[11px] text-[#929292]">
                      No Payment QR uploaded yet. Upload a PNG, JPG, or WEBP QR image above.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CARD 1B: HOME PAGE PLATFORM 2-BUTTON CONTROL (1st: VIP SINGLE PLATFORM & 2nd: ALL VIP) */}
            <div className="bg-[#1D1D1D] border border-[#FF2525]/50 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#454545]">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <Crown className="w-4 h-4 text-[#FF2525]" />
                    <span>Home Page Platform 2-Button Control (VIP &amp; ALL VIP)</span>
                  </h3>
                  <p className="text-[11px] text-[#929292] mt-0.5">
                    Configure label, price, validity, and click destination for both buttons displayed on every Home platform card.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isSavingSettings}
                  onClick={handleSaveGlobalSettings}
                  className="px-3.5 py-2 rounded-xl bg-[#FF2525] hover:bg-[#C90000] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingSettings ? 'Saving...' : 'Save Button Settings'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 1st Button: Single Platform VIP */}
                <div className="p-4 rounded-xl bg-[#141414] border border-[#FF2525]/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs font-black uppercase text-[#FF2525]">
                      1st Button — Single Platform VIP
                    </span>
                    <span className="font-mono-tech text-[10px] text-[#929292] uppercase">
                      1 PLATFORM ONLY
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">Button Label</label>
                      <input
                        type="text"
                        value={currentSettings.home_single_vip_label ?? 'VIP'}
                        onChange={(e) => handleSettingChange('home_single_vip_label', e.target.value)}
                        placeholder="VIP"
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">Price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={currentSettings.home_single_vip_price ?? 49}
                        onChange={(e) => handleSettingChange('home_single_vip_price', Number(e.target.value))}
                        placeholder="49"
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">Validity (Days)</label>
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={currentSettings.home_single_vip_duration_days ?? 30}
                        onChange={(e) =>
                          handleSettingChange('home_single_vip_duration_days', Number(e.target.value))
                        }
                        placeholder="30"
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs font-mono-tech"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-[#C5C5C5] block mb-1">Button Destination</label>
                    <select
                      value={currentSettings.home_single_vip_destination || 'in_app_single_vip'}
                      onChange={(e) =>
                        handleSettingChange(
                          'home_single_vip_destination',
                          e.target.value as 'in_app_single_vip' | 'custom_url'
                        )
                      }
                      className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                    >
                      <option value="in_app_single_vip">
                        In-App VIP Page (One Platform VIP Pre-Selected)
                      </option>
                      <option value="custom_url">Custom External URL (Telegram / Payment Link)</option>
                    </select>
                  </div>

                  {currentSettings.home_single_vip_destination === 'custom_url' && (
                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">
                        1st Button Custom Destination URL
                      </label>
                      <input
                        type="text"
                        value={currentSettings.home_single_vip_url || ''}
                        onChange={(e) => handleSettingChange('home_single_vip_url', e.target.value)}
                        placeholder="https://t.me/your_single_vip_link"
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* 2nd Button: All Platforms VIP */}
                <div className="p-4 rounded-xl bg-[#141414] border border-[#FF762E]/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-xs font-black uppercase text-[#FF762E]">
                      2nd Button — ALL VIP (All Platforms)
                    </span>
                    <span className="font-mono-tech text-[10px] text-[#929292] uppercase">
                      ALL PLATFORMS
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">Button Label</label>
                      <input
                        type="text"
                        value={currentSettings.home_all_vip_label ?? 'ALL VIP'}
                        onChange={(e) => handleSettingChange('home_all_vip_label', e.target.value)}
                        placeholder="ALL VIP"
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">Price (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={currentSettings.home_all_vip_price ?? 149}
                        onChange={(e) => handleSettingChange('home_all_vip_price', Number(e.target.value))}
                        placeholder="149"
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs font-mono-tech"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">Validity (Days)</label>
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={currentSettings.home_all_vip_duration_days ?? 30}
                        onChange={(e) =>
                          handleSettingChange('home_all_vip_duration_days', Number(e.target.value))
                        }
                        placeholder="30"
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs font-mono-tech"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-[#C5C5C5] block mb-1">Button Destination</label>
                    <select
                      value={currentSettings.home_all_vip_destination || 'in_app_all_vip'}
                      onChange={(e) =>
                        handleSettingChange(
                          'home_all_vip_destination',
                          e.target.value as 'in_app_all_vip' | 'custom_url'
                        )
                      }
                      className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                    >
                      <option value="in_app_all_vip">
                        In-App VIP Page (All Platforms VIP Pre-Selected)
                      </option>
                      <option value="custom_url">Custom External URL (Telegram / Payment Link)</option>
                    </select>
                  </div>

                  {currentSettings.home_all_vip_destination === 'custom_url' && (
                    <div>
                      <label className="font-bold text-[#C5C5C5] block mb-1">
                        2nd Button Custom Destination URL
                      </label>
                      <input
                        type="text"
                        value={currentSettings.home_all_vip_url || ''}
                        onChange={(e) => handleSettingChange('home_all_vip_url', e.target.value)}
                        placeholder="https://t.me/your_all_vip_link"
                        className="w-full bg-[#090909] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CARD 2: TELEGRAM POPUP CONFIGURATION (FEATURE 4) */}
            <div className="bg-[#1D1D1D] border border-[#FF2525]/30 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#454545]">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#FF2525]" />
                  <span>B. Join Telegram Popup Configuration</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setPreviewTelegramPopup(true)}
                  className="px-3 py-1 rounded-lg bg-[#FF2525]/60 hover:bg-[#FF2525]/80 border border-[#FF2525]/50 text-[#FF2525] font-bold text-[11px] flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview Popup</span>
                </button>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-[#454545]/80">
                <div>
                  <label className="font-bold text-white block">Telegram Popup ON / OFF</label>
                  <p className="text-[11px] text-[#929292]">
                    Show the Join Telegram popup modal to visitors according to the display frequency.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={currentSettings.telegram_popup_enabled}
                  onChange={(e) => handleSettingChange('telegram_popup_enabled', e.target.checked)}
                  className="w-4 h-4 accent-[#FF2525]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-white block mb-1">Telegram Channel / Group Link</label>
                  <input
                    type="text"
                    value={currentSettings.telegram_channel_url || ''}
                    onChange={(e) => handleSettingChange('telegram_channel_url', e.target.value)}
                    placeholder="https://t.me/studyfox_official"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Display Frequency</label>
                  <select
                    value={currentSettings.telegram_popup_frequency || 'once_per_session'}
                    onChange={(e) =>
                      handleSettingChange('telegram_popup_frequency', e.target.value as PopupFrequency)
                    }
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  >
                    <option value="every_visit">Every App Open / Visit</option>
                    <option value="once_per_session">Once Per Session</option>
                    <option value="once_per_day">Once Per Day</option>
                    <option value="once_per_user">Once Per User</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#454545]/60">
                <div>
                  <label className="font-bold text-white block mb-1">1. Study Blunder Telegram Link (Home & Profile)</label>
                  <input
                    type="text"
                    value={currentSettings.study_blunder_telegram_url || ''}
                    onChange={(e) => handleSettingChange('study_blunder_telegram_url', e.target.value)}
                    placeholder="https://t.me/studyblunder"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">2. Study Fox Telegram Link (Home & Profile)</label>
                  <input
                    type="text"
                    value={currentSettings.study_fox_telegram_url || ''}
                    onChange={(e) => handleSettingChange('study_fox_telegram_url', e.target.value)}
                    placeholder="https://t.me/studyfoxofficial"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-white block mb-1">Popup Title</label>
                  <input
                    type="text"
                    value={currentSettings.telegram_popup_title || ''}
                    onChange={(e) => handleSettingChange('telegram_popup_title', e.target.value)}
                    placeholder="Join Our Telegram"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Join Button Text</label>
                  <input
                    type="text"
                    value={currentSettings.telegram_popup_button_text || ''}
                    onChange={(e) => handleSettingChange('telegram_popup_button_text', e.target.value)}
                    placeholder="JOIN CHANNEL"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Later / Close Button Text</label>
                  <input
                    type="text"
                    value={currentSettings.telegram_popup_close_text || ''}
                    onChange={(e) => handleSettingChange('telegram_popup_close_text', e.target.value)}
                    placeholder="Remind Me Later"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-white block mb-1">Popup Message / Description</label>
                <textarea
                  rows={2}
                  value={currentSettings.telegram_popup_message || ''}
                  onChange={(e) => handleSettingChange('telegram_popup_message', e.target.value)}
                  placeholder="Get instant exam alerts, new platform notifications, and free access keys..."
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>

            {/* CARD 3: SUPPORT LINK & SUPPORT IMAGE CONFIGURATION */}
            <div className="bg-[#1D1D1D] border border-[#C5C5C5]/60 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#454545]">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-[#F5F5F5]" />
                  <span>C. Support Section Link & Image Configuration</span>
                </h3>
                <button
                  type="button"
                  onClick={handleSaveGlobalSettings}
                  className="px-3 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold text-[11px] flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Support Settings</span>
                </button>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-[#454545]/80">
                <div>
                  <label className="font-bold text-white block">Support Option ON / OFF</label>
                  <p className="text-[11px] text-[#929292]">
                    When enabled, displays Support in Home, Profile, Get VIP page, and Bottom Navigation.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentSettings.support_enabled)}
                  onChange={(e) => handleSettingChange('support_enabled', e.target.checked)}
                  className="w-4 h-4 accent-[#FF2525]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-white block mb-1">Support Label / Title</label>
                  <input
                    type="text"
                    value={currentSettings.support_title || ''}
                    onChange={(e) => handleSettingChange('support_title', e.target.value)}
                    placeholder="Contact Support"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Support Link URL (Telegram / WhatsApp / Help Desk)</label>
                  <input
                    type="text"
                    value={currentSettings.support_url || ''}
                    onChange={(e) => handleSettingChange('support_url', e.target.value)}
                    placeholder="https://t.me/studyfox_support"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-white block mb-1">Support Description</label>
                <input
                  type="text"
                  value={currentSettings.support_description || ''}
                  onChange={(e) => handleSettingChange('support_description', e.target.value)}
                  placeholder="Need help with keys, VIP verification, or platform links? Reach out to our team."
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* Support Image Upload & Persistent Preview */}
              <div className="space-y-2 pt-1">
                <label className="font-bold text-white block">
                  Support Section Image / QR Banner (Persists Across Refresh)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={currentSettings.support_image_url || ''}
                    onChange={(e) => handleSettingChange('support_image_url', e.target.value)}
                    placeholder="https://... or upload Support image"
                    className="flex-1 bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                  <label className="px-3 py-2 rounded-xl bg-[#FF2525]/20 hover:bg-[#FF2525]/30 border border-[#C5C5C5]/60 text-[#F5F5F5] font-bold cursor-pointer shrink-0 flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingAsset ? 'Saving...' : 'Upload Image'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={(e) => handleUploadSettingAsset(e, 'support_image_url')}
                      className="hidden"
                    />
                  </label>
                </div>

                {currentSettings.support_image_url && (
                  <div className="p-3 rounded-xl bg-[#141414] border border-[#454545] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={currentSettings.support_image_url}
                        alt="Support Section Preview"
                        className="w-16 h-16 object-contain rounded-lg bg-[#141414] border border-[#454545] shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-[#F5F5F5]">Support Image Saved in Database</p>
                        <p className="text-[10px] text-[#929292] truncate">
                          {currentSettings.support_image_url}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSettingAsset('support_image_url')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#FF2525]/15 hover:bg-[#FF2525]/15 text-[#FF2525] text-[10px] font-bold shrink-0"
                    >
                      Remove Image
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 4: DONATION FEATURE (FEATURE 6) */}
            <div className="bg-[#1D1D1D] border border-[#FF2525]/50 rounded-2xl p-5 space-y-4 text-xs">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2 pb-2 border-b border-[#454545]">
                <Heart className="w-4 h-4 text-[#FF2525]" />
                <span>D. Donation Feature Configuration</span>
              </h3>

              <div className="flex items-center justify-between pb-3 border-b border-[#454545]/80">
                <div>
                  <label className="font-bold text-white block">Donation Feature ON / OFF</label>
                  <p className="text-[11px] text-[#929292]">
                    Show a voluntary "Support Study Blunder" donation card on the Home and Profile sections.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentSettings.donation_enabled)}
                  onChange={(e) => handleSettingChange('donation_enabled', e.target.checked)}
                  className="w-4 h-4 accent-pink-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-white block mb-1">Donation Title</label>
                  <input
                    type="text"
                    value={currentSettings.donation_title || ''}
                    onChange={(e) => handleSettingChange('donation_title', e.target.value)}
                    placeholder="Support Study Blunder"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Donation Button Text</label>
                  <input
                    type="text"
                    value={currentSettings.donation_button_text || ''}
                    onChange={(e) => handleSettingChange('donation_button_text', e.target.value)}
                    placeholder="Donate Now"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-white block mb-1">Donation Description / Message</label>
                <textarea
                  rows={2}
                  value={currentSettings.donation_message || ''}
                  onChange={(e) => handleSettingChange('donation_message', e.target.value)}
                  placeholder="Help us keep study materials, mock tests, and servers fast for students."
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div>
                  <label className="font-bold text-white block mb-1">Donation Payment / Link URL</label>
                  <input
                    type="text"
                    value={currentSettings.donation_url || ''}
                    onChange={(e) => handleSettingChange('donation_url', e.target.value)}
                    placeholder="https://razorpay.me/... or https://buymeacoffee.com/..."
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="font-bold text-white block">Optional Donation QR Code Image</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentSettings.donation_qr_url || ''}
                      onChange={(e) => handleSettingChange('donation_qr_url', e.target.value)}
                      placeholder="https://... or upload QR image"
                      className="flex-1 bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                    />
                    <label className="px-3 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF2525] font-bold cursor-pointer shrink-0 flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isUploadingAsset ? 'Saving...' : 'Upload'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={(e) => handleUploadSettingAsset(e, 'donation_qr_url')}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {currentSettings.donation_qr_url && (
                    <div className="p-2.5 rounded-xl bg-[#141414] border border-[#454545] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={currentSettings.donation_qr_url}
                          alt="Donation QR Preview"
                          className="w-12 h-12 object-contain rounded bg-white p-1 shrink-0"
                        />
                        <span className="text-[10px] text-[#F5F5F5] font-bold truncate">
                          Saved QR Image
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSettingAsset('donation_qr_url')}
                        className="px-2 py-1 rounded bg-[#FF2525]/15 text-[#FF2525] text-[10px] font-bold shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CARD 5: CUSTOMIZABLE POPUP MANAGEMENT (FEATURE 7) */}
            <div className="bg-[#1D1D1D] border border-[#FF2525]/30 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-[#454545]">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#FF2525]" />
                  <span>E. Customizable Popup Management</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setPreviewCustomPopup(true)}
                  className="px-3 py-1 rounded-lg bg-[#FF2525]/60 hover:bg-[#FF2525]/80 border border-[#FF2525]/50 text-[#FF2525] font-bold text-[11px] flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview Custom Popup</span>
                </button>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-[#454545]/80">
                <div>
                  <label className="font-bold text-white block">Custom Popup ON / OFF</label>
                  <p className="text-[11px] text-[#929292]">
                    Display a custom promotional or exam announcement modal when users visit the platform.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentSettings.custom_popup_enabled)}
                  onChange={(e) => handleSettingChange('custom_popup_enabled', e.target.checked)}
                  className="w-4 h-4 accent-[#FF2525]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-white block mb-1">Popup Title</label>
                  <input
                    type="text"
                    value={currentSettings.custom_popup_title || ''}
                    onChange={(e) => handleSettingChange('custom_popup_title', e.target.value)}
                    placeholder="e.g. Special Exam Marathon Live!"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Display Frequency</label>
                  <select
                    value={currentSettings.custom_popup_frequency || 'once_per_session'}
                    onChange={(e) =>
                      handleSettingChange('custom_popup_frequency', e.target.value as PopupFrequency)
                    }
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  >
                    <option value="every_visit">Every App Open / Visit</option>
                    <option value="once_per_session">Once Per Session</option>
                    <option value="once_per_day">Once Per Day</option>
                    <option value="once_per_user">Once Per User</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-white block mb-1">Popup Message / Description</label>
                <textarea
                  rows={2}
                  value={currentSettings.custom_popup_message || ''}
                  onChange={(e) => handleSettingChange('custom_popup_message', e.target.value)}
                  placeholder="Enter popup announcement details..."
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-white block mb-1">Popup Banner Image URL (Optional)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={currentSettings.custom_popup_image_url || ''}
                      onChange={(e) => handleSettingChange('custom_popup_image_url', e.target.value)}
                      placeholder="https://... or upload image"
                      className="flex-1 bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                    />
                    <label className="px-3 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#FF2525] font-bold cursor-pointer shrink-0 flex items-center gap-1">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isUploadingAsset ? '...' : 'Upload'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(e) => handleUploadSettingAsset(e, 'custom_popup_image_url')}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Close / Dismiss Button Text</label>
                  <input
                    type="text"
                    value={currentSettings.custom_popup_close_text || ''}
                    onChange={(e) => handleSettingChange('custom_popup_close_text', e.target.value)}
                    placeholder="Dismiss"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-white block mb-1">Action Button Text (Optional)</label>
                  <input
                    type="text"
                    value={currentSettings.custom_popup_button_text || ''}
                    onChange={(e) => handleSettingChange('custom_popup_button_text', e.target.value)}
                    placeholder="Explore Now"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Action Button Link URL (Optional)</label>
                  <input
                    type="text"
                    value={currentSettings.custom_popup_button_url || ''}
                    onChange={(e) => handleSettingChange('custom_popup_button_url', e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-white block mb-1">Start Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={
                      currentSettings.custom_popup_start_date
                        ? currentSettings.custom_popup_start_date.slice(0, 16)
                        : ''
                    }
                    onChange={(e) =>
                      handleSettingChange(
                        'custom_popup_start_date',
                        e.target.value ? new Date(e.target.value).toISOString() : null
                      )
                    }
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">End Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={
                      currentSettings.custom_popup_end_date
                        ? currentSettings.custom_popup_end_date.slice(0, 16)
                        : ''
                    }
                    onChange={(e) =>
                      handleSettingChange(
                        'custom_popup_end_date',
                        e.target.value ? new Date(e.target.value).toISOString() : null
                      )
                    }
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>
            </div>

            {/* CARD 6: DATA RETENTION & STORAGE OPTIMIZATION (FEATURE 2) */}
            <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#454545]">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-[#FF762E]" />
                    <span>F. Data Retention & Storage Optimization</span>
                  </h3>
                  <p className="text-[11px] text-[#929292]">
                    Configure default retention periods and clean up orphaned uploaded assets.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleOpenCleanupModal('storage_unused_assets', 'Clean Unused Uploaded Assets')
                  }
                  className="px-3 py-1.5 rounded-xl bg-[#FF762E]/15 hover:bg-[#FF762E]/15 border border-[#FF762E]/50 text-[#FF762E] font-bold text-xs flex items-center gap-1.5"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Clean Unused Assets</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-white block mb-1">Login History Retention (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={currentSettings.retention_login_history_days ?? 30}
                    onChange={(e) =>
                      handleSettingChange('retention_login_history_days', Number(e.target.value))
                    }
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Expired Keys Retention (Days)</label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={currentSettings.retention_expired_keys_days ?? 7}
                    onChange={(e) =>
                      handleSettingChange('retention_expired_keys_days', Number(e.target.value))
                    }
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Failed Payments Retention (Days)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={currentSettings.retention_failed_payments_days ?? 30}
                    onChange={(e) =>
                      handleSettingChange('retention_failed_payments_days', Number(e.target.value))
                    }
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Save Changes Button */}
              <div className="pt-4 border-t border-[#454545] flex items-center justify-between">
                <p className="text-[11px] text-[#929292]">
                  {isSettingsDirty ? 'Click to apply changes to all users' : 'All settings up to date'}
                </p>
                <button
                  onClick={handleSaveGlobalSettings}
                  disabled={!isSettingsDirty}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                    isSettingsDirty
                      ? 'bg-gradient-to-r from-[#FF2525] to-[#C90000] text-white shadow-lg shadow-[#FF2525]/25 active:scale-95'
                      : 'bg-[#1D1D1D] text-[#929292] cursor-not-allowed'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>Save All Settings</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 11. ADMIN SECURITY (Super Admin Only) */}
        {activeSection === 'security' && isSuperAdmin && (
          <div className="space-y-4">
            <h2 className="text-base font-extrabold text-white">Administrator Security & Roles</h2>
            <p className="text-xs text-[#929292]">
              Super Admin privilege: Create and manage administrator accounts and privilege levels.
            </p>

            <form onSubmit={handleCreateAdmin} className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-white">Create or Upgrade Administrator</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#C5C5C5]">Admin Email</label>
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="admin@education.com"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#C5C5C5]">Password</label>
                  <input
                    type="password"
                    required
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#C5C5C5]">Role Privilege</label>
                  <select
                    value={newAdminRole}
                    onChange={(e) => setNewAdminRole(e.target.value as 'admin' | 'super_admin')}
                    className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-xs text-white mt-1"
                  >
                    <option value="admin">Admin (Content & Users)</option>
                    <option value="super_admin">Super Admin (All Sections & Settings)</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white font-bold text-xs"
              >
                Configure Administrator
              </button>
            </form>

            <div className="space-y-2">
              {admins.map((adm) => {
                const isPrimarySuperAdmin = adm.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com';
                const canDeleteThisAdmin =
                  isSuperAdmin &&
                  adm.role === 'admin' &&
                  adm.id !== currentUser.id &&
                  !isPrimarySuperAdmin;

                return (
                  <div
                    key={adm.id}
                    className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white">{adm.email}</p>
                        {isPrimarySuperAdmin && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF762E]/15 border border-[#FF762E]/50 text-[#FF762E]">
                            Primary Super Admin
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5 inline-block ${
                          adm.role === 'super_admin' ? 'bg-[#FF2525]/50 text-[#FF2525]' : 'bg-[#FF2525]/50 text-[#FF2525]'
                        }`}
                      >
                        {adm.role}
                      </span>
                    </div>

                    {canDeleteThisAdmin ? (
                      <button
                        type="button"
                        onClick={() => handleRequestDeleteAdmin(adm)}
                        className="p-1.5 rounded-lg bg-[#1D1D1D] text-[#FF2525] hover:bg-[#FF2525]/15 transition-colors"
                        title="Remove Admin"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-[10px] font-semibold text-[#929292] px-2 py-1 rounded-lg bg-[#141414]/60 border border-[#454545]">
                        Protected
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* In-App Confirmation Dialog for Deleting an Ordinary Admin */}
            {adminPendingDelete && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 flex items-center justify-center text-[#FF2525] shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-white">Remove Administrator Account</h3>
                        <p className="text-[11px] text-[#929292]">Super Admin Authorization Required</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isDeletingAdmin}
                      onClick={() => {
                        setAdminPendingDelete(null);
                        setAdminDeleteError(null);
                      }}
                      className="p-1 rounded-lg text-[#929292] hover:text-white hover:bg-[#1D1D1D]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#141414] border border-[#454545]/90 text-xs space-y-1">
                    <p className="text-[#C5C5C5]">
                      Are you sure you want to permanently remove this administrator account?
                    </p>
                    <p className="font-bold text-white pt-1">{adminPendingDelete.email}</p>
                    <p className="text-[11px] text-[#929292]">
                      Role: <span className="text-[#FF2525] font-semibold">{adminPendingDelete.role}</span> — All active administrative sessions for this account will be revoked immediately.
                    </p>
                  </div>

                  {adminDeleteError && (
                    <div className="p-2.5 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0 mt-0.5" />
                      <span>{adminDeleteError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isDeletingAdmin}
                      onClick={() => {
                        setAdminPendingDelete(null);
                        setAdminDeleteError(null);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold text-xs transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingAdmin}
                      onClick={handleConfirmDeleteAdmin}
                      className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-950/50 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isDeletingAdmin ? 'Removing...' : 'Confirm Remove Admin'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SHARED SECTION-SPECIFIC CLEANUP PREVIEW & CONFIRMATION MODAL */}
        {cleanupModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-[#FF2525]" />
                  <span>{cleanupModal.title}</span>
                </h3>
                <button
                  type="button"
                  disabled={cleanupModal.executing}
                  onClick={() => setCleanupModal(null)}
                  className="text-[#929292] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {cleanupModal.supportsRetentionDays && (
                <div className="bg-[#141414] border border-[#454545] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="font-bold text-white block">Retention Period (Days)</label>
                    <p className="text-[10px] text-[#929292]">
                      0d = All eligible records regardless of age
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[0, 7, 30, 90].map((presetDays) => (
                      <button
                        key={presetDays}
                        type="button"
                        onClick={() => handleUpdateCleanupRetentionDays(presetDays)}
                        className={`px-2 py-1 rounded text-[10px] font-bold ${
                          cleanupModal.retentionDays === presetDays
                            ? 'bg-[#FF2525] text-white'
                            : 'bg-[#1D1D1D] text-[#C5C5C5]'
                        }`}
                      >
                        {presetDays === 0 ? '0d (All)' : `${presetDays}d`}
                      </button>
                    ))}
                    <input
                      type="number"
                      min="0"
                      max="365"
                      value={cleanupModal.retentionDays ?? 0}
                      onChange={(e) => handleUpdateCleanupRetentionDays(Number(e.target.value))}
                      className="w-16 bg-[#141414] border border-[#454545] rounded-lg px-2 py-1 text-white text-center font-bold"
                    />
                  </div>
                </div>
              )}

              {cleanupModal.error && (
                <div className="p-3 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0 mt-0.5" />
                  <span>{cleanupModal.error}</span>
                </div>
              )}

              {cleanupModal.loading ? (
                <div className="p-6 text-center text-[#929292]">
                  Calculating affected records...
                </div>
              ) : cleanupModal.preview ? (
                <div className="p-3.5 rounded-xl bg-[#141414] border border-[#454545] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#929292] font-semibold">Target Records / Files:</span>
                    <span className="text-sm font-extrabold text-[#FF762E]">
                      {cleanupModal.preview.count} {cleanupModal.preview.count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#C5C5C5] leading-relaxed">
                    {cleanupModal.preview.description}
                  </p>
                  {cleanupModal.preview.sample_items && cleanupModal.preview.sample_items.length > 0 && (
                    <div className="pt-2 border-t border-[#454545]/80 space-y-1">
                      <p className="text-[10px] font-bold text-[#929292] uppercase">Preview Sample:</p>
                      <ul className="list-disc pl-4 text-[10px] text-[#C5C5C5] space-y-0.5 max-h-28 overflow-y-auto">
                        {cleanupModal.preview.sample_items.map((item, idx) => (
                          <li key={idx} className="truncate">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={cleanupModal.executing}
                  onClick={() => setCleanupModal(null)}
                  className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    cleanupModal.loading ||
                    cleanupModal.executing ||
                    !cleanupModal.preview ||
                    cleanupModal.preview.count === 0
                  }
                  onClick={handleExecuteCleanup}
                  className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] disabled:opacity-40 text-white font-bold flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {cleanupModal.executing
                      ? 'Cleaning...'
                      : `Confirm Clean (${cleanupModal.preview?.count ?? 0})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BULK DELETE SELECTED RECORDS MODAL */}
        {bulkDeleteModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-[#FF2525]" />
                  <span>{bulkDeleteModal.title}</span>
                </h3>
                <button
                  type="button"
                  disabled={bulkDeleteModal.executing}
                  onClick={() => setBulkDeleteModal(null)}
                  className="text-[#929292] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-[#141414] border border-[#454545] space-y-2">
                <p className="text-[#F5F5F5] font-semibold">
                  You are about to permanently delete{' '}
                  <strong className="text-[#FF762E]">{bulkDeleteModal.ids.length}</strong> selected record(s) from{' '}
                  <span className="font-mono text-[#FF2525]">{bulkDeleteModal.section}</span>.
                </p>
                <p className="text-[11px] text-[#929292]">
                  Protected accounts and active VIP entitlements are automatically safeguarded. Completed payments, VIP history, referral records, and admin audit history are strictly preserved and never deleted.
                </p>

                {bulkDeleteModal.section === 'users' && (
                  <div className="pt-2 border-t border-[#454545] space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FF762E] block">
                      Selected Users to Delete ({bulkDeleteModal.ids.length}):
                    </span>
                    <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                      {bulkDeleteModal.ids.map((uid) => {
                        const found = users.find((u) => u.id === uid);
                        return (
                          <div
                            key={uid}
                            className="p-2 rounded-lg bg-[#1D1D1D] border border-[#454545] flex items-center justify-between gap-2 text-[11px]"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-white block truncate">
                                {found ? `${found.name ? `${found.name} · ` : ''}${found.email}` : uid}
                              </span>
                              <span className="text-[10px] font-mono text-[#929292]">
                                ID: {uid}
                                {found?.created_at
                                  ? ` · Reg: ${new Date(found.created_at).toLocaleDateString()}`
                                  : ''}
                              </span>
                            </div>
                            {found && (
                              <span className="px-2 py-0.5 rounded bg-[#141414] border border-[#454545] text-[10px] text-[#C5C5C5] shrink-0">
                                {found.learner_activity_status === 'active_learner'
                                  ? 'Active Learner'
                                  : found.learner_activity_status === 'inactive_30d'
                                  ? 'Inactive 30d+'
                                  : 'No Study Activity'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {bulkDeleteModal.error && (
                <div className="p-3 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0 mt-0.5" />
                  <span>{bulkDeleteModal.error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={bulkDeleteModal.executing}
                  onClick={() => setBulkDeleteModal(null)}
                  className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkDeleteModal.executing || bulkDeleteModal.ids.length === 0}
                  onClick={handleExecuteBulkDeleteSelected}
                  className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] disabled:opacity-40 text-white font-bold flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {bulkDeleteModal.executing
                      ? 'Deleting...'
                      : `Confirm Delete (${bulkDeleteModal.ids.length})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 12. FESTIVAL DECORATION MANAGER */}
        {activeSection === 'festivals' && (
          <FestivalManagerSection
            onShowToast={showToast}
            onRefreshPublicData={onRefreshPublicData}
          />
        )}

        {/* 13. SUPER ADMIN: ADMIN CONTROL */}
        {activeSection === 'admin_control' && isSuperAdmin && (
          <AdminControlTab onPermissionsChanged={onRefreshPublicData} />
        )}

        {/* 14. SUPER ADMIN / AUTHORIZED ADMIN: VIP FEATURE MANAGEMENT */}
        {activeSection === 'vip_features' && canAccessSection('vip_features') && (
          <VipFeatureManagementTab />
        )}

        {/* 14B. SUPER ADMIN / AUTHORIZED ADMIN: REFERRAL PROGRAM MANAGEMENT */}
        {activeSection === 'referral_management' && canAccessSection('referral_management') && (
          <ReferralManagementTab onSettingsChanged={onRefreshPublicData} />
        )}

        {/* 15. SUPER ADMIN: ADVANCED ANALYTICS */}
        {activeSection === 'advanced_analytics' && isSuperAdmin && (
          <AdvancedAnalyticsTab />
        )}

        {/* 16. SUPER ADMIN / AUTHORIZED ADMIN: AUDIT LOGS */}
        {activeSection === 'audit_logs' && canAccessSection('audit_logs') && (
          <AdminAuditLogTab />
        )}

        {/* 17. SUPER ADMIN: BACKUP & RECOVERY */}
        {activeSection === 'backups' && isSuperAdmin && (
          <BackupRecoveryTab />
        )}

        {/* 18. OFFER BOARD, 30-DAY DAILY MOTIVATION & DUAL TELEGRAM MANAGER */}
        {activeSection === 'growth_board' && (
          <GrowthFeaturesAdminTab
            settings={currentSettings}
            onSettingsUpdated={(updated) => {
              setCurrentSettings(updated);
              onRefreshPublicData();
            }}
          />
        )}

        {/* 19. APP THEME MANAGER (5 OFFICIAL THEMES) */}
        {activeSection === 'themes' && (
          <ThemeManagerTab
            settings={currentSettings}
            onSettingsUpdated={(updated) => {
              setCurrentSettings(updated);
              setOriginalSettings(updated);
              onRefreshPublicData();
            }}
          />
        )}

        {/* RESET REGISTERED DEVICE / ALLOW NEW DEVICE CONFIRMATION MODAL */}
        {userPendingVipDeviceReset && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-[#FF2525]" />
                  <span>Reset Registered Device / Allow New Device</span>
                </h3>
                <button
                  type="button"
                  disabled={isResettingVipDevice}
                  onClick={() => setUserPendingVipDeviceReset(null)}
                  className="text-[#929292] hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#141414] border border-[#454545] space-y-1">
                <p className="font-bold text-white">{userPendingVipDeviceReset.email}</p>
                <p className="text-[11px] text-[#929292]">
                  Current Device:{' '}
                  <span className="text-[#F5F5F5] font-semibold">
                    {userPendingVipDeviceReset.vip_device_label || 'Bound Primary Device'}
                  </span>
                </p>
                <p className="text-[11px] text-[#C5C5C5] pt-1">
                  Clearing this device binding allows the user’s next login device to automatically register as their new primary device. This action is logged as <span className="font-mono text-[#FF2525]">DEVICE_RESET_BY_ADMIN</span>.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#C5C5C5] block mb-1">
                  Admin Reset Note (Optional)
                </label>
                <input
                  type="text"
                  value={vipResetReasonInput}
                  onChange={(e) => setVipResetReasonInput(e.target.value)}
                  placeholder="e.g. User changed phone or reinstalled browser"
                  className="w-full bg-[#141414] border border-[#454545] rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isResettingVipDevice}
                  onClick={() => setUserPendingVipDeviceReset(null)}
                  className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isResettingVipDevice}
                  onClick={handleConfirmResetVipDevice}
                  className="px-4 py-2 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] disabled:opacity-50 text-white font-bold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isResettingVipDevice ? 'Resetting...' : 'Confirm Reset Device'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LIVE PREVIEW MODALS FOR TELEGRAM & CUSTOM POPUP */}
        {previewTelegramPopup && currentSettings && (
          <TelegramModal
            channelUrl={currentSettings.telegram_channel_url || 'https://t.me/education_hub_updates'}
            title={currentSettings.telegram_popup_title}
            message={currentSettings.telegram_popup_message}
            buttonText={currentSettings.telegram_popup_button_text}
            closeText={currentSettings.telegram_popup_close_text}
            reminderText={currentSettings.telegram_popup_reminder_text}
            onClose={() => setPreviewTelegramPopup(false)}
          />
        )}

        {previewCustomPopup && currentSettings && (
          <CustomPopupModal
            title={currentSettings.custom_popup_title || 'Sample Custom Popup'}
            message={
              currentSettings.custom_popup_message ||
              'This is a live preview of how your custom popup will appear to students.'
            }
            imageUrl={currentSettings.custom_popup_image_url}
            buttonText={currentSettings.custom_popup_button_text}
            buttonUrl={currentSettings.custom_popup_button_url}
            closeText={currentSettings.custom_popup_close_text}
            onClose={() => setPreviewCustomPopup(false)}
          />
        )}
        </main>
      </div>
    </div>
  );
};
