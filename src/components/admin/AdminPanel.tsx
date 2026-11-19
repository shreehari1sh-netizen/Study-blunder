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
  | 'keys'
  | 'history'
  | 'feedback'
  | 'announcements'
  | 'festivals'
  | 'settings'
  | 'customization'
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
  keys: 'keys',
  history: 'history',
  feedback: 'feedback',
  announcements: 'announcements',
  festivals: 'festivals',
  settings: 'settings',
  customization: 'settings',
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
  const [customAppName, setCustomAppName] = useState('Education Platform');
  const [customAppLogo, setCustomAppLogo] = useState('');
  const [customThemePrimary, setCustomThemePrimary] = useState('#6366f1');
  const [customThemeSecondary, setCustomThemeSecondary] = useState('#8b5cf6');
  const [customThemeBackground, setCustomThemeBackground] = useState('#070B14');
  const [customThemeText, setCustomThemeText] = useState('#f8fafc');
  const [customThemeButton, setCustomThemeButton] = useState('#4f46e5');
  // VIP Section Theme State
  const [customVipBg, setCustomVipBg] = useState('#090d16');
  const [customVipCard, setCustomVipCard] = useState('#0f172a');
  const [customVipAccent, setCustomVipAccent] = useState('#f59e0b');
  const [customVipText, setCustomVipText] = useState('#f8fafc');
  const [customVipButton, setCustomVipButton] = useState('#eab308');
  const [customVipBorder, setCustomVipBorder] = useState('#1e293b');
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

  // 10. Settings State (Dirty checking + Save Changes)
  const [originalSettings, setOriginalSettings] = useState<AdminSettings | null>(null);
  const [currentSettings, setCurrentSettings] = useState<AdminSettings | null>(null);
  const [isSettingsDirty, setIsSettingsDirty] = useState(false);
  const [previewCustomPopup, setPreviewCustomPopup] = useState(false);
  const [previewTelegramPopup, setPreviewTelegramPopup] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);

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
    if (activeSection === 'keys') {
      setSectionLoading(true);
      api
        .getAdminKeys()
        .then((res) => {
          setKeySettings({
            key_generation_enabled: res.settings.key_generation_enabled ?? true,
            shortener_url: res.settings.shortener_url || '',
            tutorial_video_url: res.settings.tutorial_video_url || '',
            key_expiry_hours: res.settings.key_expiry_hours || 24,
            free_access_duration: res.settings.free_access_duration ?? res.settings.key_expiry_hours ?? 24,
            free_access_unit: res.settings.free_access_unit || 'hours',
          });
          setKeyRecords(res.records);
          setSelectedKeyIds((prev) => new Set([...prev].filter((id) => res.records.some((r) => r.id === id))));
          if (res.active_keys !== undefined && stats) {
            setStats((prev) => (prev ? { ...prev, active_keys: res.active_keys! } : null));
          }
        })
        .catch((err: unknown) => setSectionError(err instanceof Error ? err.message : 'Failed to load key records'))
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
    if (activeSection === 'settings' || activeSection === 'customization' || activeSection === 'plans') {
      api
        .getAdminSettings()
        .then((res) => {
          setOriginalSettings(res);
          setCurrentSettings(res);
          setIsSettingsDirty(false);
          setCustomAppName(res.app_name || 'STUDY FOX');
          setCustomAppLogo(res.app_logo_url || '');
          setCustomThemePrimary(res.theme_primary || '#6366f1');
          setCustomThemeSecondary(res.theme_secondary || '#8b5cf6');
          setCustomThemeBackground(res.theme_background || '#070B14');
          setCustomThemeText(res.theme_text || '#f8fafc');
          setCustomThemeButton(res.theme_button || '#4f46e5');
          setCustomVipBg(res.vip_theme_background || '#090d16');
          setCustomVipCard(res.vip_theme_card || '#0f172a');
          setCustomVipAccent(res.vip_theme_accent || '#f59e0b');
          setCustomVipText(res.vip_theme_text || '#f8fafc');
          setCustomVipButton(res.vip_theme_button || '#eab308');
          setCustomVipBorder(res.vip_theme_border || '#1e293b');
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
      } else if (op === 'users_inactive' || op === 'vip_expired' || op === 'users_expired_free_access') {
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
    try {
      const dur = Number(keySettings.free_access_duration);
      if (!Number.isFinite(dur) || dur <= 0) {
        showToast('Free Access Duration must be a positive whole or decimal number (e.g. 15, 24, 7).', 'error');
        return;
      }

      const res = await api.updateKeySettings({
        ...keySettings,
        free_access_duration: dur,
        free_access_unit: keySettings.free_access_unit,
      });

      setKeySettings((prev) => ({
        ...prev,
        free_access_duration: res.settings.free_access_duration ?? dur,
        free_access_unit: (res.settings.free_access_unit as any) ?? prev.free_access_unit,
      }));

      showToast('Free Access Duration & Key settings saved successfully');
      api.getAdminStats().then(setStats).catch(() => {});
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save key settings';
      showToast(msg, 'error');
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
    if (!currentSettings) return;
    try {
      const tgUrl = (currentSettings.vip_telegram_url ?? currentSettings.vip_purchase_url ?? '').trim();
      if (tgUrl.length > 0 && !tgUrl.startsWith('http://') && !tgUrl.startsWith('https://')) {
        showToast('VIP Telegram URL must start with http:// or https://', 'error');
        return;
      }

      const {
        referral_discount_config: _rdc,
        referral_program_enabled: _rpe,
        festival_configs_json: _fcj,
        active_festival_id: _afi,
        festival_decorations_enabled: _fde,
        festival_version: _fv,
        ...settingsTabPayload
      } = currentSettings as unknown as Record<string, unknown>;

      const saved = await api.saveAdminSettings({
        ...(settingsTabPayload as Partial<AdminSettings>),
        vip_purchase_url: tgUrl,
        vip_telegram_url: tgUrl,
      });
      setOriginalSettings(saved);
      setCurrentSettings(saved);
      setIsSettingsDirty(false);
      showToast('All settings saved and applied successfully');
      onRefreshPublicData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings';
      showToast(msg, 'error');
    }
  };

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
      showToast('Primary color must be a valid hex color code (e.g. #6366f1)', 'error');
      return;
    }
    if (!isValidHexCode(customThemeSecondary)) {
      showToast('Secondary color must be a valid hex color code (e.g. #8b5cf6)', 'error');
      return;
    }
    if (!isValidHexCode(customThemeBackground)) {
      showToast('Background color must be a valid hex color code (e.g. #070B14)', 'error');
      return;
    }
    if (!isValidHexCode(customThemeText)) {
      showToast('Text color must be a valid hex color code (e.g. #f8fafc)', 'error');
      return;
    }
    if (!isValidHexCode(customThemeButton)) {
      showToast('Button color must be a valid hex color code (e.g. #4f46e5)', 'error');
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
    setCustomThemePrimary('#6366f1');
    setCustomThemeSecondary('#8b5cf6');
    setCustomThemeBackground('#070B14');
    setCustomThemeText('#f8fafc');
    setCustomThemeButton('#4f46e5');
    showToast('Theme reset to defaults. Click "Save Changes" to store to database.');
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
    setCustomVipBg('#090d16');
    setCustomVipCard('#0f172a');
    setCustomVipAccent('#f59e0b');
    setCustomVipText('#f8fafc');
    setCustomVipButton('#eab308');
    setCustomVipBorder('#1e293b');
    showToast('VIP theme reset to default. Click "Save Changes" to store.');
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
    { id: 'keys', label: 'Key Management', icon: Key },
    { id: 'history', label: 'Login History', icon: History },
    { id: 'feedback', label: 'Feedback Management', icon: MessageSquare },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'festivals', label: 'Festival Decoration Manager', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'customization', label: 'App Customization', icon: Palette },
    { id: 'admin_control', label: 'ADMIN CONTROL', icon: Shield, superAdminOnly: true },
    { id: 'vip_features', label: 'VIP FEATURE MANAGEMENT', icon: Crown },
    { id: 'referral_management', label: 'REFERRAL MANAGEMENT', icon: Sparkles },
    { id: 'advanced_analytics', label: 'Advanced Analytics', icon: BarChart3, superAdminOnly: true },
    { id: 'audit_logs', label: 'Audit Logs', icon: FileText },
    { id: 'backups', label: 'Backup & Recovery', icon: Database, superAdminOnly: true },
    { id: 'security', label: 'Admin Security', icon: ShieldAlert, superAdminOnly: true },
  ];

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col w-full pb-12">
      {/* Admin Top Header */}
      <header className="sticky top-0 z-30 w-full bg-[#0B0F19]/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-5 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#080D19]/80 border-[0.5px] border-white/10 flex items-center justify-center font-bold text-white shadow-md overflow-hidden p-0.5 shrink-0">
            {currentSettings?.app_logo_url ? (
              <img
                src={currentSettings.app_logo_url}
                alt={currentSettings.app_name || 'Admin Logo'}
                className="w-full h-full object-contain select-none"
              />
            ) : (
              'AP'
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2 truncate">
              <span className="truncate">{currentSettings?.app_name ? `${currentSettings.app_name} ADMIN` : 'ADMIN CONTROL PANEL'}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 shrink-0">
                {isSuperAdmin ? 'Super Admin' : 'Admin'}
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 truncate">Authenticated: {currentUser.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-850 hover:bg-slate-800 text-xs font-semibold text-slate-300 border border-slate-700/60 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            <span>Go to Website</span>
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-950/80 border border-rose-800/40 text-xs font-semibold text-rose-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-16 right-4 z-50 p-3 rounded-xl border shadow-2xl flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-600 text-emerald-200'
              : 'bg-rose-950/90 border-rose-600 text-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Horizontal Nav Bar for Mobile & Desktop */}
      <div className="w-full bg-[#0A0E1A] border-b border-slate-800/80">
        <div className="max-w-5xl mx-auto flex items-center gap-1 overflow-x-auto px-4 py-2.5 no-scrollbar">
          {navItems.map((item) => {
            if (item.superAdminOnly && !isSuperAdmin) return null;
            if (!canAccessSection(item.id)) return null;
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors shrink-0 ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-950/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="p-4 flex-1 max-w-5xl mx-auto w-full">
        {/* 1. DASHBOARD */}
        {activeSection === 'dashboard' && stats && (
          <div className="space-y-4">
            <h2 className="text-base font-extrabold text-white">Live System Analytics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-400 font-semibold">Total Registered Users</p>
                <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">{stats.total_users}</p>
              </div>
              <div className="bg-[#0C1222] border border-amber-900/40 rounded-2xl p-4">
                <p className="text-xs text-amber-400 font-semibold">Active VIP Members</p>
                <p className="text-2xl font-extrabold text-amber-300 mt-1 tabular-nums">{stats.active_vips}</p>
              </div>
              <div className="bg-[#0C1222] border border-emerald-900/40 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-emerald-400 font-semibold">Active Keys</p>
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <p className="text-2xl font-extrabold text-emerald-300 mt-1 tabular-nums">
                  {stats.active_keys ?? 0}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Valid unexpired sessions</p>
              </div>
              <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-400 font-semibold">Configured Platforms</p>
                <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">
                  {stats.active_platforms} / {stats.total_platforms}
                </p>
              </div>
              <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-4">
                <p className="text-xs text-slate-400 font-semibold">Login Audits Logged</p>
                <p className="text-2xl font-extrabold text-indigo-400 mt-1 tabular-nums">
                  {stats.recent_logins_count}
                </p>
              </div>
            </div>

            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Operational Status
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300 py-1 border-b border-slate-800/60">
                  <span>Backend Storage Engine</span>
                  <span className="text-emerald-400 font-semibold">Active (data/database.json)</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 py-1 border-b border-slate-800/60">
                  <span>Supabase Schema Ready</span>
                  <span className="text-indigo-400 font-semibold">supabase_schema.sql</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 py-1">
                  <span>Your Role Permissions</span>
                  <span className="text-purple-300 font-semibold">
                    {isSuperAdmin ? 'Super Admin (Full Settings Access)' : 'Admin (Content & User Ops)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section Error Banner if backend query failed */}
        {sectionError && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-950/70 border border-rose-700/60 text-rose-200 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{sectionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setSectionError(null)}
              className="text-rose-300 hover:text-white font-bold px-2 py-0.5 rounded bg-rose-900/50"
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
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {platforms.length} Total ({platforms.filter((p) => p.status === 'active').length} Active)
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Configure cards, external URLs, and statuses</p>
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedPlatformIds.size})</span>
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => handleOpenCleanupModal('platforms_inactive', 'Clean Inactive Platforms')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-950/90 border border-rose-800/50 text-rose-300 text-xs font-bold transition-colors"
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Platform</span>
                </button>
              </div>
            </div>

            {/* Platform Selection Toolbar */}
            {platforms.length > 0 && (
              <div className="bg-[#0C1222] border border-slate-800/80 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">
                    Selected: <strong className="text-white">{selectedPlatformIds.size}</strong> of {platforms.length}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlatformIds(new Set(platforms.map((p) => p.id)))}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                  >
                    Select All ({platforms.length})
                  </button>
                  {selectedPlatformIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedPlatformIds(new Set())}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 font-semibold text-[11px]"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-3">
                  <h3 className="text-sm font-bold text-white">
                    {isCreatingPlatform ? 'Add New Platform' : 'Edit Platform'}
                  </h3>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300">Platform Name</label>
                    <input
                      type="text"
                      value={editingPlatform?.name || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, name: e.target.value })}
                      placeholder="e.g. SELECTION WAY TEST"
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300">Category</label>
                    <input
                      type="text"
                      value={editingPlatform?.category || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, category: e.target.value })}
                      placeholder="e.g. General, Banking, SSC"
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300">Logo Image URL</label>
                    <input
                      type="text"
                      value={editingPlatform?.logo_url || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, logo_url: e.target.value })}
                      placeholder="https://..."
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300">Destination URL (Opens when clicked)</label>
                    <input
                      type="text"
                      value={editingPlatform?.target_url || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, target_url: e.target.value })}
                      placeholder="https://testbook.com"
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  {/* Access Type & Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Access Type</label>
                      <select
                        value={editingPlatform?.access_type || 'normal'}
                        onChange={(e) =>
                          setEditingPlatform({
                            ...editingPlatform,
                            access_type: e.target.value as 'normal' | 'vip',
                          })
                        }
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="normal">NORMAL (OPEN Button)</option>
                        <option value="vip">VIP (Crown Button)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Status</label>
                      <select
                        value={editingPlatform?.status || 'active'}
                        onChange={(e) =>
                          setEditingPlatform({ ...editingPlatform, status: e.target.value as 'active' | 'inactive' })
                        }
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  {/* VIP Redirect URL */}
                  <div className={`p-3 rounded-2xl border transition-all ${
                    editingPlatform?.access_type === 'vip'
                      ? 'bg-purple-950/20 border-purple-800/50'
                      : 'bg-[#080D19]/40 border-slate-800/50'
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Crown className={`w-3.5 h-3.5 ${editingPlatform?.access_type === 'vip' ? 'text-amber-400' : 'text-slate-500'}`} />
                      <label className="text-[11px] font-bold text-slate-300">VIP Redirect URL</label>
                    </div>
                    <p className="text-[10px] text-slate-400 mb-1.5 leading-relaxed">
                      Opens exclusively for active VIP members. If empty, falls back to destination URL.
                    </p>
                    <input
                      type="text"
                      value={editingPlatform?.vip_target_url || ''}
                      onChange={(e) => setEditingPlatform({ ...editingPlatform, vip_target_url: e.target.value })}
                      placeholder="https://vip.example.com/exclusive-portal"
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Display Order</label>
                      <input
                        type="number"
                        value={editingPlatform?.display_order || 1}
                        onChange={(e) =>
                          setEditingPlatform({ ...editingPlatform, display_order: Number(e.target.value) })
                        }
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
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
                    <label htmlFor="plat_vis" className="text-xs text-slate-300">
                      Visible to public visitors
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlatform(null);
                        setIsCreatingPlatform(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSavePlatform(editingPlatform!)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center gap-1.5"
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
                  className={`bg-[#0C1222] border rounded-2xl p-3 flex items-center justify-between gap-3 transition-colors ${
                    selectedPlatformIds.has(p.id) ? 'border-indigo-500/70 bg-indigo-950/15' : 'border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedPlatformIds.has(p.id)}
                      onChange={() => toggleIdInSet(p.id, setSelectedPlatformIds)}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
                    />
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                      {p.logo_url ? (
                        <img src={p.logo_url} alt={p.name} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-xs font-bold text-slate-500">{p.name.substring(0, 2)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60">
                          #{idx + 1}
                        </span>
                        <p className="text-xs font-bold text-white truncate">{p.name}</p>
                        {p.access_type === 'vip' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-extrabold text-[9px] border border-amber-500/30">
                            <Crown className="w-2.5 h-2.5 text-amber-400" />
                            VIP
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold text-[9px]">
                            NORMAL
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 truncate">{p.target_url}</p>
                      {p.access_type === 'vip' && p.vip_target_url && (
                        <p className="text-[10px] text-purple-300 truncate font-medium">
                          VIP Redirect: {p.vip_target_url}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                        <span className={p.status === 'active' ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                          ● {p.status}
                        </span>
                        <span>Order: {p.display_order}</span>
                        {!p.is_visible && <span className="text-amber-400 font-semibold">(Hidden)</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0 || Boolean(movingPlatformId)}
                      onClick={() => handleMovePlatform(idx, 'up')}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-35 disabled:cursor-not-allowed"
                      title="Move Up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === platforms.length - 1 || Boolean(movingPlatformId)}
                      onClick={() => handleMovePlatform(idx, 'down')}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-35 disabled:cursor-not-allowed"
                      title="Move Down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingPlatform(p)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400"
                      title="Edit"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPlatformPendingDelete(p)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-rose-400"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete Platform</h3>
                  <p className="text-slate-300">
                    Are you sure you want to permanently delete <strong className="text-white">{platformPendingDelete.name}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPlatformPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePlatform(platformPendingDelete.id)}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
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
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  <span>Platform Logs</span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Timezone: {platformLogsData?.timezone || 'Asia/Kolkata'} (IST)
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700/70 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                <span>Refresh Logs</span>
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400 font-semibold">Total Platforms</p>
                  <Layers className="w-4 h-4 text-slate-400" />
                </div>
                <p className="text-2xl font-extrabold text-white mt-1.5 tabular-nums">
                  {platformLogsData?.summary.total_platforms ?? platforms.length}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Tracked across portal</p>
              </div>

              <div className="bg-[#0C1222] border border-emerald-900/40 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-emerald-400 font-semibold">Opens Today</p>
                  <Clock className="w-4 h-4 text-emerald-400" />
                </div>
                <p className="text-2xl font-extrabold text-emerald-300 mt-1.5 tabular-nums">
                  {platformLogsData?.summary.opens_today ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Today in IST (Asia/Kolkata)</p>
              </div>

              <div className="bg-[#0C1222] border border-indigo-900/40 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-indigo-400 font-semibold">Opens in the Last 7 Days</p>
                  <Calendar className="w-4 h-4 text-indigo-400" />
                </div>
                <p className="text-2xl font-extrabold text-indigo-300 mt-1.5 tabular-nums">
                  {platformLogsData?.summary.opens_last_7_days ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">Rolling 7-day window</p>
              </div>

              <div className="bg-[#0C1222] border border-purple-900/40 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-purple-400 font-semibold">Total Recorded Opens</p>
                  <BarChart3 className="w-4 h-4 text-purple-400" />
                </div>
                <p className="text-2xl font-extrabold text-purple-300 mt-1.5 tabular-nums">
                  {platformLogsData?.summary.total_recorded_opens ?? 0}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">All-time recorded opens</p>
              </div>
            </div>

            {/* Search, Sort & Date-Range Filter Bar */}
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {/* Search by platform name */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={platformLogsSearch}
                    onChange={(e) => {
                      setPlatformLogsSearch(e.target.value);
                      setPlatformLogsPage(1);
                    }}
                    placeholder="Search by platform name..."
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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
                    className="flex-1 bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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
                    className="px-2.5 py-2 rounded-xl bg-[#080D19] border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300"
                    title={platformLogsSortOrder === 'desc' ? 'Descending (High to Low)' : 'Ascending (Low to High)'}
                  >
                    {platformLogsSortOrder === 'desc' ? 'DESC' : 'ASC'}
                  </button>
                </div>

                {/* Start Date */}
                <div className="flex items-center gap-2 bg-[#080D19] border border-slate-800 rounded-xl px-3 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">From:</span>
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
                <div className="flex items-center gap-2 bg-[#080D19] border border-slate-800 rounded-xl px-3 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0">To:</span>
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
                      className="text-[10px] font-bold text-rose-400 hover:text-rose-300 shrink-0"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Detailed Platform Logs Table */}
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-[#080D19]/80 text-[11px] font-extrabold text-slate-300 uppercase tracking-wider">
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
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {sectionLoading && !platformLogsData ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          Loading platform usage statistics...
                        </td>
                      </tr>
                    ) : !platformLogsData || platformLogsData.platforms.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400">
                          No platforms match the current search or filter criteria.
                        </td>
                      </tr>
                    ) : (
                      platformLogsData.platforms.map((item) => (
                        <tr
                          key={item.platform_id}
                          onClick={() => handleOpenPlatformHistory(item.platform_id, 1)}
                          className="hover:bg-slate-900/70 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3 min-w-[180px]">
                              <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                                {item.logo_url ? (
                                  <img
                                    src={item.logo_url}
                                    alt={item.platform_name}
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  <span className="text-[11px] font-bold text-slate-500">
                                    {item.platform_name.substring(0, 2)}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-white truncate">{item.platform_name}</span>
                                  {item.access_type === 'vip' ? (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-extrabold text-[9px] border border-amber-500/30">
                                      <Crown className="w-2.5 h-2.5 text-amber-400" />
                                      VIP
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold text-[9px]">
                                      NORMAL
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-500">{item.category}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-extrabold text-emerald-400 tabular-nums">
                            {item.today_opens}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-200 tabular-nums">
                            {item.yesterday_opens}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-indigo-300 tabular-nums">
                            {item.last_7_days_opens}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-purple-300 tabular-nums">
                            {item.last_30_days_opens}
                          </td>
                          <td className="py-3 px-3 text-right tabular-nums">
                            <span className="font-extrabold text-white">{item.total_opens}</span>
                            {(platformLogsStartDate || platformLogsEndDate) && (
                              <span className="block text-[10px] text-indigo-400 font-semibold">
                                In range: {item.filtered_opens}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-[11px] text-slate-300 whitespace-nowrap">
                            {formatIstDateTime(item.last_opened_at)}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPlatformHistory(item.platform_id, 1);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 font-bold text-[11px]"
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
                <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    Page <strong className="text-white">{platformLogsData.pagination.page}</strong> of{' '}
                    <strong className="text-white">{platformLogsData.pagination.total_pages}</strong> (
                    {platformLogsData.pagination.total_items} platforms)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={platformLogsData.pagination.page <= 1}
                      onClick={() => setPlatformLogsPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 flex items-center gap-1"
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
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 flex items-center gap-1"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3">
                    {selectedPlatformHistory ? (
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                          {selectedPlatformHistory.platform.logo_url ? (
                            <img
                              src={selectedPlatformHistory.platform.logo_url}
                              alt={selectedPlatformHistory.platform.name}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span className="text-xs font-bold text-slate-400">
                              {selectedPlatformHistory.platform.name.substring(0, 2)}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                            {selectedPlatformHistory.platform.name} — Usage History
                          </h3>
                          <p className="text-[11px] text-slate-400">
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
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {selectedPlatformHistory && (
                    <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
                      {/* Per-Platform Metric Breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3">
                          <span className="text-[10px] text-slate-400 font-semibold">Today&apos;s Opens</span>
                          <p className="text-lg font-extrabold text-emerald-400 mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.today_opens}
                          </p>
                        </div>
                        <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3">
                          <span className="text-[10px] text-slate-400 font-semibold">Yesterday&apos;s Opens</span>
                          <p className="text-lg font-extrabold text-slate-200 mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.yesterday_opens}
                          </p>
                        </div>
                        <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3">
                          <span className="text-[10px] text-slate-400 font-semibold">Last 7 Days</span>
                          <p className="text-lg font-extrabold text-indigo-300 mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.last_7_days_opens}
                          </p>
                        </div>
                        <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3">
                          <span className="text-[10px] text-slate-400 font-semibold">Last 30 Days</span>
                          <p className="text-lg font-extrabold text-purple-300 mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.last_30_days_opens}
                          </p>
                        </div>
                        <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3">
                          <span className="text-[10px] text-slate-400 font-semibold">Total Opens</span>
                          <p className="text-lg font-extrabold text-white mt-0.5 tabular-nums">
                            {selectedPlatformHistory.stats.total_opens}
                          </p>
                        </div>
                      </div>

                      {/* Daily Breakdown */}
                      {selectedPlatformHistory.daily_breakdown.length > 0 && (
                        <div className="bg-[#080D19] border border-slate-800 rounded-2xl p-3.5 space-y-2">
                          <h4 className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider">
                            Daily Activity Breakdown (Asia/Kolkata)
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedPlatformHistory.daily_breakdown.map((d) => (
                              <div
                                key={d.date}
                                className="px-2.5 py-1.5 rounded-xl bg-[#0C1222] border border-slate-800 flex items-center gap-2"
                              >
                                <span className="text-[11px] text-slate-400 font-mono">{d.date}</span>
                                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-extrabold text-[11px] tabular-nums">
                                  {d.count} {d.count === 1 ? 'open' : 'opens'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent Individual Open Events */}
                      <div className="bg-[#080D19] border border-slate-800 rounded-2xl overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-slate-300 uppercase tracking-wider">
                            Recorded Open Events ({selectedPlatformHistory.pagination.total_items})
                          </span>
                          <span className="text-[10px] text-slate-500">IST (UTC+05:30)</span>
                        </div>
                        {selectedPlatformHistory.logs.length === 0 ? (
                          <div className="p-6 text-center text-slate-400">
                            No open events recorded for this platform yet.
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-800/70">
                            {selectedPlatformHistory.logs.map((log) => (
                              <div
                                key={log.id}
                                className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                  <span className="font-semibold text-white">
                                    {log.user_email || `User ${log.user_id.slice(0, 8)}`}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    ID: {log.user_id.slice(0, 12)}
                                  </span>
                                </div>
                                <span className="text-[11px] text-slate-300 font-mono">
                                  {formatIstDateTime(log.opened_at)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {selectedPlatformHistory.pagination.total_pages > 1 && (
                          <div className="px-4 py-2.5 border-t border-slate-800 flex items-center justify-between">
                            <span className="text-[11px] text-slate-400">
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
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40"
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
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40"
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
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {users.length} Displayed
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
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
                        ? 'bg-emerald-950/50 border-emerald-500/60'
                        : 'bg-[#0C1222] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-emerald-400 block">
                      Active Learners (&lt; 30d)
                    </span>
                    <span className="text-xl font-extrabold text-white mt-0.5 block tabular-nums">
                      {activeLearnerCount}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Meaningful study activity (excludes login-only)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUserFilter('no_study_activity')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      userFilter === 'no_study_activity'
                        ? 'bg-amber-950/50 border-amber-500/60'
                        : 'bg-[#0C1222] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-amber-400 block">
                      No Study Activity
                    </span>
                    <span className="text-xl font-extrabold text-amber-300 mt-0.5 block tabular-nums">
                      {noStudyCount}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Login-only users (0 study activities)
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUserFilter('inactive_30d')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      userFilter === 'inactive_30d'
                        ? 'bg-rose-950/50 border-rose-500/60'
                        : 'bg-[#0C1222] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-rose-400 block">
                      Inactive (30+ Days)
                    </span>
                    <span className="text-xl font-extrabold text-rose-300 mt-0.5 block tabular-nums">
                      {inactive30dCount}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      No login or study activity in 30+ days
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUserFilter('inactive')}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      userFilter === 'inactive'
                        ? 'bg-indigo-950/50 border-indigo-500/60'
                        : 'bg-[#0C1222] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-indigo-400 block">
                      All Inactive Users
                    </span>
                    <span className="text-xl font-extrabold text-indigo-300 mt-0.5 block tabular-nums">
                      {noStudyCount + inactive30dCount}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Click to filter all inactive &amp; login-only
                    </span>
                  </button>
                </div>
              );
            })()}

            {/* Inline VIP Editor inside User Management so Admins with User Management access can grant/edit VIP directly */}
            {selectedUserForVip && (
              <div className="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-purple-200">
                    Modifying VIP Access: {selectedUserForVip.email}
                  </h3>
                  <button onClick={() => setSelectedUserForVip(null)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
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
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => handleToggleVip(selectedUserForVip, true, vipExpiryDays)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs"
                  >
                    Activate / Extend VIP Access
                  </button>
                  <button
                    onClick={() => handleToggleVip(selectedUserForVip, false)}
                    className="px-4 py-2 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 font-bold text-xs"
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
                  className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <Edit className="w-4 h-4 text-indigo-400" />
                      <span>Edit User Profile</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingUserProfile(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080D19] border border-slate-800 space-y-1">
                    <p className="font-bold text-white">{editingUserProfile.email}</p>
                    <p className="text-[11px] font-mono text-slate-400">User ID: {editingUserProfile.id}</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={editingUserNameDraft}
                      onChange={(e) => setEditingUserNameDraft(e.target.value)}
                      placeholder="Student full name..."
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isSavingUserProfile}
                      onClick={() => setEditingUserProfile(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingUserProfile}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSavingUserProfile ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Search & Status Filters */}
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-3 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name, email, role, user ID, or referral code..."
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
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
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
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
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                      >
                        Select Displayed Eligible ({eligibleUsers.length})
                      </button>
                      {selectedUserIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds(new Set())}
                          className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 font-semibold"
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
                <div className="bg-[#0C1222] border border-slate-800/80 rounded-2xl p-6 text-center text-xs text-slate-400">
                  Loading user accounts...
                </div>
              ) : users.length === 0 ? (
                <div className="bg-[#0C1222] border border-slate-800/80 rounded-2xl p-6 text-center text-xs text-slate-400">
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
                      className={`bg-[#0C1222] border rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                        selectedUserIds.has(u.id)
                          ? 'border-indigo-500/70 bg-indigo-950/15'
                          : u.is_blocked
                          ? 'border-rose-800/60 bg-rose-950/10'
                          : 'border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {canModifyThisUser ? (
                          <input
                            type="checkbox"
                            checked={selectedUserIds.has(u.id)}
                            onChange={() => toggleIdInSet(u.id, setSelectedUserIds)}
                            className="w-4 h-4 mt-0.5 accent-indigo-600 rounded cursor-pointer shrink-0"
                          />
                        ) : (
                          <div className="w-4 h-4 mt-0.5 shrink-0" title="Protected account" />
                        )}
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {u.name && u.name.trim().length > 0 && (
                              <span className="font-extrabold text-white">{u.name}</span>
                            )}
                            <span className={`${u.name ? 'text-slate-300' : 'font-bold text-white'} truncate`}>
                              {u.email}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                u.role === 'super_admin'
                                  ? 'bg-purple-900/40 text-purple-300 border border-purple-700/40'
                                  : u.role === 'admin'
                                  ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/40'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {u.role}
                            </span>
                            {u.is_blocked ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-700/50">
                                <Ban className="w-2.5 h-2.5" />
                                BLOCKED
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                                Account Active
                              </span>
                            )}

                            {/* Learner Study Activity Status Badge */}
                            {u.role === 'user' && (
                              <span
                                className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                                  u.learner_activity_status === 'active_learner'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : u.learner_activity_status === 'inactive_30d'
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
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

                          <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-mono text-slate-300">ID: {u.id}</span>
                            {u.referral_code && (
                              <span className="font-mono text-amber-300">Ref Code: {u.referral_code}</span>
                            )}
                            {u.referred_by_code && (
                              <span className="font-mono text-indigo-300">Referred By: {u.referred_by_code}</span>
                            )}
                            <span>
                              VIP:{' '}
                              <strong className={u.vip_active ? 'text-amber-400' : 'text-slate-500'}>
                                {u.vip_active ? 'Active' : 'Inactive'}
                              </strong>
                              {u.vip_expires_at ? ` (until ${new Date(u.vip_expires_at).toLocaleDateString()})` : ''}
                            </span>
                            <span>
                              Device:{' '}
                              <strong className={u.vip_bound_device_id ? 'text-emerald-400' : 'text-slate-500'}>
                                {u.vip_bound_device_id ? u.vip_device_label || 'Bound' : 'Unbound'}
                              </strong>
                            </span>
                            <span>
                              Free Pass:{' '}
                              <strong className={u.free_access_active ? 'text-emerald-400' : 'text-slate-500'}>
                                {u.free_access_active ? 'Valid' : 'Expired'}
                              </strong>
                            </span>
                          </div>

                          {/* Study & Login Activity Metrics Row */}
                          <div className="text-[10px] text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#080D19] border border-slate-800/80 rounded-lg px-2.5 py-1">
                            <span>
                              <strong className="text-slate-400">Registration Date:</strong>{' '}
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                            </span>
                            <span>·</span>
                            <span>
                              <strong className="text-slate-400">Last Login Date:</strong>{' '}
                              {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                            </span>
                            <span>·</span>
                            <span>
                              <strong className="text-slate-400">Last Study Activity:</strong>{' '}
                              <span className={u.last_study_activity_at ? 'text-emerald-300 font-semibold' : 'text-amber-300'}>
                                {u.last_study_activity_at
                                  ? new Date(u.last_study_activity_at).toLocaleString()
                                  : 'No Study Activity'}
                              </span>
                            </span>
                            <span>·</span>
                            <span>
                              <strong className="text-slate-400">Total Study Activity:</strong>{' '}
                              <strong className="text-white">{u.total_study_activities ?? 0}</strong> actions
                            </span>
                          </div>

                          {u.is_blocked && (
                            <p className="text-[10px] text-rose-300/90 bg-rose-950/40 border border-rose-900/50 rounded-lg px-2 py-1 mt-1">
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
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] flex items-center gap-1"
                            title="Edit User Profile"
                          >
                            <Edit className="w-3 h-3 text-indigo-400" />
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
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-[11px] flex items-center gap-1"
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
                            className="px-2.5 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-700/50 text-indigo-300 font-bold text-[11px] flex items-center gap-1"
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
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/50 text-emerald-300 font-bold text-[11px] flex items-center gap-1"
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
                                className="px-2.5 py-1.5 rounded-lg bg-amber-950/50 hover:bg-amber-900/70 border border-amber-700/50 text-amber-300 font-bold text-[11px] flex items-center gap-1"
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
                            className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/80 border border-rose-800/50 text-rose-300"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      {userPendingBlock.blocked ? (
                        <>
                          <Ban className="w-4 h-4 text-amber-400" />
                          <span>Block User Account</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <span>Unblock User Account</span>
                        </>
                      )}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setUserPendingBlock(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080D19] border border-slate-800 space-y-1">
                    <p className="font-bold text-white">{userPendingBlock.user.email}</p>
                    <p className="text-[11px] text-slate-400">
                      {userPendingBlock.blocked
                        ? 'Blocking this account immediately revokes active sessions and prevents the user from accessing protected platforms or generating keys. Account records are preserved.'
                        : 'Unblocking restores access according to the user’s existing VIP or Free Access expiry status without resetting timestamps.'}
                    </p>
                  </div>

                  {userPendingBlock.blocked && (
                    <div>
                      <label className="text-[11px] font-bold text-slate-300 block mb-1">
                        Block Reason (Optional — shown to user)
                      </label>
                      <input
                        type="text"
                        value={blockReasonInput}
                        onChange={(e) => setBlockReasonInput(e.target.value)}
                        placeholder="e.g. Terms of service violation or suspicious key activity"
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white text-xs"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isUpdatingBlock}
                      onClick={() => setUserPendingBlock(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isUpdatingBlock}
                      onClick={handleConfirmBlockToggle}
                      className={`px-4 py-2 rounded-xl font-bold text-white ${
                        userPendingBlock.blocked
                          ? 'bg-amber-600 hover:bg-amber-500'
                          : 'bg-emerald-600 hover:bg-emerald-500'
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-rose-400" />
                      <span>Permanently Delete User Account</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setUserPendingDelete(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080D19] border border-slate-800 space-y-1">
                    <p className="text-slate-300">
                      Are you sure you want to permanently delete this user account?
                    </p>
                    <p className="font-bold text-white pt-1">{userPendingDelete.email}</p>
                    <p className="text-[11px] text-slate-400">
                      Role: <span className="text-indigo-300 font-semibold">{userPendingDelete.role}</span> · ID: {userPendingDelete.id}
                    </p>
                    <p className="text-[11px] text-amber-300/90 pt-1">
                      Active sessions and expired key logs for this user will be removed, while completed payment audit records are safely preserved.
                    </p>
                  </div>

                  {userDeleteError && (
                    <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{userDeleteError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isDeletingUser}
                      onClick={() => setUserPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingUser}
                      onClick={handleConfirmDeleteUser}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5"
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
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {users.filter((u) => u.vip_active).length} Active VIPs
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Grant or revoke VIP access, monitor single-device bindings, reset bound devices, and audit sharing attempts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenCleanupModal('vip_expired', 'Clean Expired VIP Statuses')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-950/90 border border-rose-800/50 text-rose-300 text-xs font-bold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clean Expired VIP</span>
              </button>
            </div>

            {selectedUserForVip && (
              <div className="bg-purple-950/40 border border-purple-800/60 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-purple-200">
                    Modifying VIP: {selectedUserForVip.email}
                  </h3>
                  <button onClick={() => setSelectedUserForVip(null)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
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
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Type any positive whole number of days (e.g. 1, 7, 15, 30, 45, 90, 180, 365). Server-side expiry timestamp is calculated consistently from current time.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => handleToggleVip(selectedUserForVip, true, vipExpiryDays)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs"
                  >
                    Activate VIP Access
                  </button>
                  <button
                    onClick={() => handleToggleVip(selectedUserForVip, false)}
                    className="px-4 py-2 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 font-bold text-xs"
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
                  className="bg-[#0C1222] border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-white">{u.email}</p>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          u.vip_active
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {u.vip_active ? 'VIP ACTIVE' : 'INACTIVE'}
                      </span>
                      {u.vip_expires_at && (
                        <span className="text-[10px] text-amber-300 font-semibold">
                          Until {new Date(u.vip_expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Single-Device VIP Binding Info */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                      <span>
                        Registered Device:{' '}
                        {u.vip_bound_device_id ? (
                          <strong className="text-emerald-400">
                            {u.vip_device_label || 'Bound Primary Device'} ({u.vip_bound_device_id.slice(0, 12)}…)
                          </strong>
                        ) : (
                          <span className="text-slate-500">Unbound (binds automatically on next VIP login)</span>
                        )}
                      </span>
                      {u.vip_device_bound_at && (
                        <span>Bound: {new Date(u.vip_device_bound_at).toLocaleString()}</span>
                      )}
                      {u.vip_device_last_seen_at && (
                        <span>Last Active: {new Date(u.vip_device_last_seen_at).toLocaleString()}</span>
                      )}
                      {(u.vip_sharing_attempts_blocked ?? 0) > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-950/80 border border-rose-800 text-rose-300 font-bold">
                          Blocked 2nd-Device Attempts: {u.vip_sharing_attempts_blocked}
                        </span>
                      )}
                      {(u.vip_device_reset_count ?? 0) > 0 && (
                        <span className="text-indigo-300">
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
                        className="px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900/90 border border-indigo-700/50 text-indigo-300 font-bold text-xs flex items-center gap-1"
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
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-semibold text-xs"
                        >
                          Edit VIP
                        </button>
                        <button
                          onClick={() => handleToggleVip(u, false)}
                          className="px-3 py-1 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 font-bold text-xs"
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
                        className="px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-sm"
                      >
                        Activate VIP
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* VIP Device Security & Sharing Attempt Audit Logs */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>VIP Single-Device Security & Sharing Logs</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {vipDeviceLogs.length} Events
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-950/90 border border-rose-800/50 text-rose-300 text-xs font-bold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete All Logs ({vipDeviceLogs.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {vipDeviceLogs.length > 0 && (
                <div className="bg-[#0C1222] border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    Selected: <strong className="text-white">{selectedVipLogIds.size}</strong> of {vipDeviceLogs.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedVipLogIds(new Set(vipDeviceLogs.map((l) => l.id)))}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                    >
                      Select All ({vipDeviceLogs.length})
                    </button>
                    {selectedVipLogIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedVipLogIds(new Set())}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 font-semibold text-[11px]"
                      >
                        Clear Selection
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {vipDeviceLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center bg-[#0C1222] border border-slate-800/60 rounded-2xl">
                    No VIP device security events recorded yet.
                  </p>
                ) : (
                  vipDeviceLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`bg-[#0C1222] border rounded-2xl p-3 flex items-center justify-between gap-3 text-xs ${
                        selectedVipLogIds.has(log.id)
                          ? 'border-indigo-500/70 bg-indigo-950/15'
                          : log.event_type === 'device_mismatch_blocked'
                          ? 'border-rose-800/60 bg-rose-950/10'
                          : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedVipLogIds.has(log.id)}
                          onChange={() => toggleIdInSet(log.id, setSelectedVipLogIds)}
                          className="w-4 h-4 mt-0.5 accent-indigo-600 rounded cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-white">{log.email}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                log.event_type === 'device_mismatch_blocked'
                                  ? 'bg-rose-950 text-rose-300 border border-rose-700/50'
                                  : log.event_type === 'device_reset_by_admin'
                                  ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/50'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                              }`}
                            >
                              {log.event_type}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-300">{log.details}</p>
                          <p className="text-[10px] text-slate-500">
                            IP: {log.ip_address} · Device: {log.device_label || log.attempted_device_id || 'N/A'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setVipLogPendingDelete(log)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 shrink-0"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete VIP Security Log</h3>
                  <p className="text-slate-300">
                    Delete security log entry for <strong className="text-white">{vipLogPendingDelete.email}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setVipLogPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteVipLog}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. VIP PLAN MANAGEMENT */}
        {activeSection === 'plans' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>VIP Plan Management</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {plans.length} Plans
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Manage plan pricing, durations, benefits, and display order (Up / Down)</p>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy VIP Page Link</span>
                </button>
                <a
                  href="/vip"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition-colors"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedPlanIds.size})</span>
                  </button>
                )}
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => handleOpenCleanupModal('plans_inactive', 'Clean Inactive VIP Plans')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-950/90 border border-rose-800/50 text-rose-300 text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clean Inactive Plans ({plans.filter((p) => !p.is_active).length})</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditingPlan({
                      title: 'New VIP Plan',
                      price_inr: 299,
                      duration_days: '' as unknown as number,
                      badge_label: 'BEST VALUE',
                      description: 'Premium VIP Access',
                      features: ['Instant Activation', 'Full VIP Platform Access', 'Priority Support'],
                      is_active: true,
                      display_order: plans.length + 1,
                    });
                    setIsCreatingPlan(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add VIP Plan</span>
                </button>
              </div>
            </div>

            {plans.length > 0 && (
              <div className="bg-[#0C1222] border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Selected: <strong className="text-white">{selectedPlanIds.size}</strong> of {plans.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPlanIds(new Set(plans.map((p) => p.id)))}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                  >
                    Select All ({plans.length})
                  </button>
                  {selectedPlanIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedPlanIds(new Set())}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 font-semibold text-[11px]"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Plan Modal */}
            {(isCreatingPlan || editingPlan) && (
              <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                <div className="bg-[#0C1222] border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-3">
                  <h3 className="text-sm font-bold text-white">
                    {isCreatingPlan ? 'Add VIP Plan' : 'Edit VIP Plan'}
                  </h3>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300">Plan Title</label>
                    <input
                      type="text"
                      value={editingPlan?.title || ''}
                      onChange={(e) => setEditingPlan({ ...editingPlan, title: e.target.value })}
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Price (INR ₹)</label>
                      <input
                        type="number"
                        value={editingPlan?.price_inr || 0}
                        onChange={(e) => setEditingPlan({ ...editingPlan, price_inr: Number(e.target.value) })}
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">VIP Duration (Days)</label>
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
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Positive whole integer (e.g. 30, 180, 365).
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Original Price (₹)</label>
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
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Bonus Days (+)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editingPlan?.bonus_days ?? 0}
                        onChange={(e) =>
                          setEditingPlan({ ...editingPlan, bonus_days: Math.max(0, Number(e.target.value) || 0) })
                        }
                        placeholder="e.g. 5"
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Discount Label</label>
                      <input
                        type="text"
                        value={editingPlan?.discount_label || ''}
                        onChange={(e) => setEditingPlan({ ...editingPlan, discount_label: e.target.value })}
                        placeholder="e.g. 40% OFF"
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Badge Label (Optional)</label>
                      <input
                        type="text"
                        value={editingPlan?.badge_label || ''}
                        onChange={(e) => setEditingPlan({ ...editingPlan, badge_label: e.target.value })}
                        placeholder="e.g. BEST VALUE, POPULAR"
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Display Order</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={editingPlan?.display_order ?? 1}
                        onChange={(e) => setEditingPlan({ ...editingPlan, display_order: Number(e.target.value) || 1 })}
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300">Features (1 per line)</label>
                    <textarea
                      rows={4}
                      value={editingPlan?.features?.join('\n') || ''}
                      onChange={(e) =>
                        setEditingPlan({
                          ...editingPlan,
                          features: e.target.value.split('\n').filter((f) => f.trim().length > 0),
                        })
                      }
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPlan(null);
                        setIsCreatingPlan(false);
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-slate-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSavePlan(editingPlan!)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-xs font-bold text-white flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {plans.length === 0 ? (
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                  No VIP plans exist in the database.
                </div>
              ) : (
                plans.map((pl, idx) => {
                  const isSelected = selectedPlanIds.has(pl.id);
                  return (
                    <div
                      key={pl.id}
                      className={`bg-[#0C1222] border rounded-2xl p-4 flex items-center justify-between gap-3 text-xs ${
                        isSelected ? 'border-indigo-500/70 bg-indigo-950/15' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleIdInSet(pl.id, setSelectedPlanIds)}
                          className="w-4 h-4 mt-1 accent-indigo-600 rounded cursor-pointer shrink-0"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              #{idx + 1}
                            </span>
                            <h3 className="font-extrabold text-white text-sm">{pl.title}</h3>
                            <span className="font-bold text-amber-400">₹{pl.price_inr}</span>
                            <span className="text-[10px] text-slate-300 font-medium">
                              ({pl.duration_days ? `${pl.duration_days} Days` : `${pl.duration_months || 1} Months`})
                            </span>
                            {pl.badge_label && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600/30 text-blue-300 border border-blue-600/40">
                                {pl.badge_label}
                              </span>
                            )}
                            {!pl.is_active && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                                Inactive
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {pl.features.length} listed benefits · Order: {pl.display_order}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0 || Boolean(movingPlanId)}
                          onClick={() => handleMovePlan(idx, 'up')}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 disabled:opacity-35 disabled:cursor-not-allowed"
                          title="Move Plan Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === plans.length - 1 || Boolean(movingPlanId)}
                          onClick={() => handleMovePlan(idx, 'down')}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 disabled:opacity-35 disabled:cursor-not-allowed"
                          title="Move Plan Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingPlan(pl)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400"
                          title="Edit Plan"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setPlanPendingDelete(pl)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/80 text-rose-400"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete VIP Plan</h3>
                  <p className="text-slate-300">
                    Are you sure you want to delete <strong className="text-white">{planPendingDelete.title}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setPlanPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePlan(planPendingDelete.id)}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {dateFilteredPayments.length} in Period · {payments.length} Total
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-950/90 border border-rose-800/50 text-rose-300 text-xs font-bold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete All Failed / Pending ({totalRemovableCount})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Date Range Filter Bar */}
              <div className="bg-[#0C1222] border border-slate-800/90 rounded-2xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mr-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
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
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      {df.label}
                    </button>
                  ))}
                </div>

                {paymentDateFilter === 'custom' && (
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">From:</span>
                      <input
                        type="date"
                        value={paymentStartDate}
                        onChange={(e) => setPaymentStartDate(e.target.value)}
                        className="bg-[#080D19] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">To:</span>
                      <input
                        type="date"
                        value={paymentEndDate}
                        onChange={(e) => setPaymentEndDate(e.target.value)}
                        className="bg-[#080D19] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                      />
                    </div>
                    {(paymentStartDate || paymentEndDate) && (
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentStartDate('');
                          setPaymentEndDate('');
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 font-semibold"
                      >
                        Reset Dates
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* 6-Card Payment Analytics Dashboard (Dynamically updated by Date Filter) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-gradient-to-br from-emerald-950/60 to-[#0C1222] border border-emerald-700/40 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/90">
                    Total Payment Received
                  </p>
                  <p className="text-lg font-extrabold text-white">{formatINR(totalPaymentReceived)}</p>
                  <p className="text-[10px] text-slate-400">
                    Verified actual revenue
                  </p>
                </div>

                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                    Total Approved Payments
                  </p>
                  <p className="text-lg font-extrabold text-white">{approvedPaymentsCount}</p>
                  <p className="text-[10px] text-slate-400">
                    {formatINR(approvedPaymentsAmount)} verified
                  </p>
                </div>

                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                    Total Completed Payments
                  </p>
                  <p className="text-lg font-extrabold text-white">{completedPaymentsCount}</p>
                  <p className="text-[10px] text-slate-400">
                    {formatINR(completedPaymentsAmount)} settled
                  </p>
                </div>

                <div className="bg-[#0C1222] border border-amber-800/40 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    Total Pending Payments
                  </p>
                  <p className="text-lg font-extrabold text-white">{pendingPaymentsCount}</p>
                  <p className="text-[10px] text-slate-400">
                    {formatINR(pendingPaymentsAmount)} unverified
                  </p>
                </div>

                <div className="bg-[#0C1222] border border-rose-800/40 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                    Total Rejected Payments
                  </p>
                  <p className="text-lg font-extrabold text-white">{rejectedPaymentsCount}</p>
                  <p className="text-[10px] text-slate-400">
                    {formatINR(rejectedPaymentsAmount)} excluded
                  </p>
                </div>

                <div className="bg-[#0C1222] border border-purple-800/40 rounded-2xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                    Successful Transactions
                  </p>
                  <p className="text-lg font-extrabold text-white">{successfulTransactionsCount}</p>
                  <p className="text-[10px] text-slate-400">
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
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    All ({dateFilteredPayments.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('approved')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      paymentStatusFilter === 'approved'
                        ? 'bg-teal-600 text-white shadow-md'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Approved ({approvedPaymentsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('completed')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      paymentStatusFilter === 'completed'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Completed ({completedPaymentsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      paymentStatusFilter === 'pending'
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    Pending ({pendingPaymentsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentStatusFilter('rejected')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      paymentStatusFilter === 'rejected'
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
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
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  {paymentSearch && (
                    <button
                      type="button"
                      onClick={() => setPaymentSearch('')}
                      className="absolute right-2 top-2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selection Control Bar */}
              <div className="bg-[#0C1222] border border-slate-800/80 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-300">
                    Selected: <strong className="text-white font-extrabold">{selectedPaymentIds.size}</strong> of {filteredPayments.length} records
                  </span>
                  {selectedPaymentIds.size > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-500/40 bg-indigo-500/10 text-indigo-300">
                      {eligibleSelected.length} eligible for deletion
                      {protectedSelected.length > 0 && ` · ${protectedSelected.length} audit-protected (completed)`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                  >
                    Select All ({filteredPayments.length})
                  </button>
                  {filteredPayments.some((p) => p.status !== 'completed' && p.status !== 'approved') && (
                    <button
                      type="button"
                      onClick={handleSelectEligibleFiltered}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                    >
                      Select Removable Only (
                      {filteredPayments.filter((p) => p.status !== 'completed' && p.status !== 'approved').length})
                    </button>
                  )}
                  {selectedPaymentIds.size > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-[11px]"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>

              {/* Payment Records Table */}
              <div className="bg-[#0C1222] border border-slate-800 rounded-2xl overflow-hidden">
                {filteredPayments.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    {payments.length === 0
                      ? 'No payment transactions exist in the database.'
                      : 'No payment records match the selected date period, status filter, or search.'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#080D19] border-b border-slate-800 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
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
                      <tbody className="divide-y divide-slate-800/70">
                        {filteredPayments.map((p) => {
                          const isPendingVerification =
                            p.status === 'pending_verification' || p.status === 'pending';
                          const isSelected = selectedPaymentIds.has(p.id);
                          return (
                            <tr
                              key={p.id}
                              className={`transition-colors ${
                                isSelected
                                  ? 'bg-indigo-950/25'
                                  : isPendingVerification
                                  ? 'bg-amber-950/10'
                                  : 'hover:bg-slate-900/40'
                              }`}
                            >
                              <td className="py-3 px-3 align-top">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleIdInSet(p.id, setSelectedPaymentIds)}
                                  aria-label={`Select payment record ${p.id}`}
                                  className="w-4 h-4 mt-0.5 accent-indigo-600 rounded cursor-pointer"
                                />
                              </td>
                              <td className="py-3 px-3 align-top">
                                <p className="font-bold text-white break-all">{p.email}</p>
                                <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                                  UID: {p.user_id || 'N/A'}
                                </p>
                                {p.submitted_email &&
                                  p.submitted_email.toLowerCase() !== p.email.toLowerCase() && (
                                    <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                      Submitted: {p.submitted_email}
                                    </span>
                                  )}
                              </td>
                              <td className="py-3 px-3 align-top">
                                <span className="font-semibold text-slate-200 block">{p.plan_title || 'VIP Plan'}</span>
                                {p.request_id && (
                                  <span className="inline-block mt-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                                    {p.request_id}
                                  </span>
                                )}
                                {p.purchase_source && (
                                  <span className="inline-block ml-1 mt-0.5 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300">
                                    {p.purchase_source === 'pre_key' ? 'Pre-Key' : 'In-App'}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 align-top">
                                <p className="font-extrabold text-white">{formatINR(p.amount)}</p>
                                {p.amount_mismatch && (
                                  <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    Expected ₹{p.expected_amount}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-3 align-top">
                                <span
                                  className={`inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                                    p.status === 'completed' || p.status === 'approved'
                                      ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/50'
                                      : p.status === 'failed' || p.status === 'rejected'
                                      ? 'bg-rose-950/70 text-rose-300 border-rose-700/50'
                                      : 'bg-amber-950/70 text-amber-300 border-amber-700/50'
                                  }`}
                                >
                                  {p.status === 'pending_verification' ? 'Pending Review' : p.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 align-top text-[11px] text-slate-300 whitespace-nowrap">
                                {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}
                              </td>
                              <td className="py-3 px-3 align-top text-[11px] text-slate-300 whitespace-nowrap">
                                {p.reviewed_at ? new Date(p.reviewed_at).toLocaleString() : '—'}
                              </td>
                              <td className="py-3 px-3 align-top">
                                <span className="font-mono text-[11px] text-slate-200">
                                  {p.transaction_reference || '—'}
                                </span>
                              </td>
                              <td className="py-3 px-3 align-top max-w-[220px]">
                                {p.reviewed_by ? (
                                  <p className="text-[11px] font-semibold text-indigo-300">
                                    Verified by: {p.reviewed_by}
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-slate-500">Unverified</p>
                                )}
                                {p.admin_note && (
                                  <p className="text-[10px] text-slate-400 italic mt-0.5 break-words">
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
                                      className="px-2 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300 font-bold text-[10px] flex items-center gap-1"
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
                                        className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[10px]"
                                      >
                                        {verifyingPaymentId === p.id ? '...' : 'Approve'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={verifyingPaymentId === p.id}
                                        onClick={() => handleVerifyPaymentClaim(p.id, 'reject')}
                                        className="px-2 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-600/50 disabled:opacity-50 text-rose-200 font-bold text-[10px]"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setPaymentPendingDelete(p)}
                                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 hover:text-rose-300 transition-colors"
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
                  <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-white">Payment Verification Proof</h3>
                        <p className="text-[11px] text-slate-400">
                          Claim ID: <span className="font-mono text-slate-300">{previewScreenshotPayment.id}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewScreenshotPayment(null)}
                        className="text-slate-400 hover:text-white p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Account Email:</span>
                        <span className="font-bold text-white">{previewScreenshotPayment.email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">User ID:</span>
                        <span className="font-mono text-slate-300">{previewScreenshotPayment.user_id}</span>
                      </div>
                      {previewScreenshotPayment.submitted_email && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Submitted Login Gmail:</span>
                          <span className="font-bold text-sky-300">{previewScreenshotPayment.submitted_email}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Entered Amount:</span>
                        <span className="font-extrabold text-amber-400">₹{previewScreenshotPayment.amount}</span>
                      </div>
                      {previewScreenshotPayment.expected_amount !== undefined && (
                        <div className="flex justify-between">
                          <span className="text-slate-400">Configured Amount:</span>
                          <span className="font-bold text-slate-200">₹{previewScreenshotPayment.expected_amount}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-400">Transaction ID / UTR:</span>
                        <span className="font-mono text-slate-200">{previewScreenshotPayment.transaction_reference || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Status:</span>
                        <span className="font-bold uppercase text-amber-300">{previewScreenshotPayment.status}</span>
                      </div>
                    </div>

                    {previewScreenshotPayment.screenshot_url && (
                      <div className="bg-black border border-slate-800 rounded-xl p-2 flex items-center justify-center max-h-80 overflow-auto">
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

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPreviewScreenshotPayment(null)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold"
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
                            className="px-3.5 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 border border-rose-600/50 text-rose-200 font-bold"
                          >
                            Reject Claim
                          </button>
                          <button
                            type="button"
                            disabled={verifyingPaymentId === previewScreenshotPayment.id}
                            onClick={() => handleVerifyPaymentClaim(previewScreenshotPayment.id, 'approve')}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
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
                  <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                      <Trash2 className="w-4 h-4 shrink-0" />
                      <span>Delete Payment Record</span>
                    </div>
                    <div className="space-y-1.5 text-slate-300">
                      <p>
                        Permanently delete this payment record from the database ledger?
                      </p>
                      <div className="p-2.5 rounded-xl bg-[#080D19] border border-slate-800 text-[11px] space-y-1">
                        <div>Account: <strong className="text-white">{paymentPendingDelete.email}</strong></div>
                        <div>Amount: <strong className="text-emerald-400">₹{paymentPendingDelete.amount}</strong></div>
                        <div>Status: <span className="font-bold text-amber-300 uppercase">{paymentPendingDelete.status}</span></div>
                        {paymentPendingDelete.transaction_reference && (
                          <div>Ref: <span className="font-mono text-slate-400">{paymentPendingDelete.transaction_reference}</span></div>
                        )}
                      </div>
                      {(paymentPendingDelete.status === 'completed' || paymentPendingDelete.status === 'approved') && (
                        <p className="text-[11px] text-amber-300/90 bg-amber-950/40 border border-amber-800/40 rounded-lg p-2">
                          Notice: This record was marked completed. Deleting it will permanently remove it from the persistent Supabase database.
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPaymentPendingDelete(null)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDeletePayment}
                        className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-950/50"
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

        {/* 7. KEY MANAGEMENT */}
        {activeSection === 'keys' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Key Generation Settings & Logs</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {keyRecords.length} Total Logs
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
                  Configure the Shortener target link and review direct redirect logs.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedKeyIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setBulkDeleteModal({
                        section: 'key_records',
                        title: `Delete ${selectedKeyIds.size} Selected Key Record(s)`,
                        ids: Array.from(selectedKeyIds),
                        executing: false,
                        error: null,
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedKeyIds.size})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    handleOpenCleanupModal(
                      'keys_expired',
                      'Clean Expired & Revoked Key Logs',
                      0
                    )
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-950/90 border border-rose-800/50 text-rose-300 text-xs font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    Clean Expired/Revoked (
                    {
                      keyRecords.filter(
                        (k) => k.status === 'revoked' || new Date(k.expires_at).getTime() < Date.now()
                      ).length
                    }
                    )
                  </span>
                </button>
                {keyRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      handleOpenCleanupModal(
                        'keys_all',
                        'Delete All Key Generation Logs',
                        0
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-900/60 hover:bg-rose-800/80 border border-rose-700/60 text-white text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete All Logs ({keyRecords.length})</span>
                  </button>
                )}
              </div>
            </div>

            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-200">Configuration</h3>

              {/* Destination URL Helper Box */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950/70 to-purple-950/70 border border-indigo-500/40 text-xs">
                <div className="flex items-center gap-2 text-indigo-300 font-extrabold mb-1">
                  <Key className="w-4 h-4 text-indigo-400" />
                  <span>Target Link for URL Shortener (ShrinkMe.io / GPlinks)</span>
                </div>
                <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
                  Copy this link and paste it into <span className="text-amber-300 font-bold">ShrinkMe.io</span>, <span className="text-amber-300 font-bold">GPlinks</span>, etc., as the <strong className="text-white">Destination URL</strong>. Then paste the shortened link it generates into the input field below!
                </p>
                <div className="flex items-center gap-2 bg-[#080D1A] p-2 rounded-xl border border-slate-800">
                  <code className="text-xs text-indigo-200 font-mono flex-1 select-all truncate">
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
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-md transition-all active:scale-95"
                  >
                    {copiedDestUrl ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDestUrl ? 'Copied Link!' : 'Copy Target Link'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300">URL Shortener Link (Generated from Shortener)</label>
                <input
                  type="text"
                  value={keySettings.shortener_url}
                  onChange={(e) => setKeySettings({ ...keySettings, shortener_url: e.target.value })}
                  placeholder="https://shrinkme.io/..."
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300">How to Generate Tutorial Video URL</label>
                <input
                  type="text"
                  value={keySettings.tutorial_video_url}
                  onChange={(e) => setKeySettings({ ...keySettings, tutorial_video_url: e.target.value })}
                  placeholder="https://youtube.com/..."
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300">Free Access Duration</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={keySettings.free_access_duration}
                    onChange={(e) => setKeySettings({ ...keySettings, free_access_duration: e.target.value })}
                    placeholder="e.g. 24, 7, 15, 60"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Enter any positive whole number for session pass duration.
                  </p>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-300">Duration Unit</label>
                  <select
                    value={keySettings.free_access_unit}
                    onChange={(e) =>
                      setKeySettings({
                        ...keySettings,
                        free_access_unit: e.target.value as 'minutes' | 'hours' | 'days',
                      })
                    }
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Configured: <span className="text-indigo-400 font-semibold">{keySettings.free_access_duration} {keySettings.free_access_unit}</span>
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  onClick={handleSaveKeySettings}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Free Access Duration</span>
                </button>
                <span className="text-[11px] text-slate-400">
                  New keys will activate for {keySettings.free_access_duration} {keySettings.free_access_unit}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <span>Key Access & Verification Ledger</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {stats?.active_keys ?? 0} Active Keys
                </span>
              </h3>
              {keyRecords.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedKeyIds(new Set(keyRecords.map((k) => k.id)))}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                  >
                    Select All ({keyRecords.length})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedKeyIds(
                        new Set(
                          keyRecords
                            .filter((k) => k.status === 'revoked' || new Date(k.expires_at).getTime() < Date.now())
                            .map((k) => k.id)
                        )
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold text-[11px]"
                  >
                    Select Expired/Revoked (
                    {
                      keyRecords.filter(
                        (k) => k.status === 'revoked' || new Date(k.expires_at).getTime() < Date.now()
                      ).length
                    }
                    )
                  </button>
                  {selectedKeyIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedKeyIds(new Set())}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 font-semibold text-[11px]"
                    >
                      Clear Selection ({selectedKeyIds.size})
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {keyRecords.length === 0 ? (
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                  No key generation requests exist in the database.
                </div>
              ) : (
                keyRecords.map((kr) => {
                  const isExpired = new Date(kr.expires_at).getTime() < Date.now();
                  const isRevoked = kr.status === 'revoked';
                  const isActive = kr.status === 'active' && !isExpired;
                  const isSelected = selectedKeyIds.has(kr.id);

                  return (
                    <div
                      key={kr.id}
                      className={`bg-[#0C1222] border rounded-2xl p-3 flex items-center justify-between text-xs gap-3 ${
                        isSelected ? 'border-indigo-500/70 bg-indigo-950/15' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleIdInSet(kr.id, setSelectedKeyIds)}
                          className="w-4 h-4 mt-1 accent-indigo-600 rounded cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-white truncate">{kr.user_email}</p>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isActive
                                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                                  : isRevoked
                                  ? 'bg-rose-950/80 text-rose-400 border-rose-800'
                                  : 'bg-slate-900 text-slate-400 border-slate-800'
                              }`}
                            >
                              {isActive ? 'Active' : isRevoked ? 'Revoked' : 'Expired'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Generated: {new Date(kr.generated_at).toLocaleString()} · Expires:{' '}
                            {new Date(kr.expires_at).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isActive && (
                          <button
                            onClick={() => handleRevokeKey(kr.id)}
                            className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 border border-rose-800/40 text-[10px] font-bold transition-colors"
                          >
                            Revoke Key
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setKeyPendingDelete(kr)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400"
                          title="Delete Key Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {keyPendingDelete && (
              <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete Key Record</h3>
                  <p className="text-slate-300">
                    Delete key log for <strong className="text-white">{keyPendingDelete.user_email}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setKeyPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteKeyRecord}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 8. LOGIN HISTORY */}
        {activeSection === 'history' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Login Audit History</span>
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {history.length} Entries
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Legitimate timestamped login events and client metadata.</p>
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-950/90 border border-rose-800/50 text-rose-300 text-xs font-bold transition-colors"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-900/60 hover:bg-rose-800/80 border border-rose-700/60 text-white text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete All ({history.length})</span>
                  </button>
                )}
              </div>
            </div>

            {history.length > 0 && (
              <div className="bg-[#0C1222] border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Selected: <strong className="text-white">{selectedHistoryIds.size}</strong> of {history.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedHistoryIds(new Set(history.map((h) => h.id)))}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                  >
                    Select All ({history.length})
                  </button>
                  {selectedHistoryIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryIds(new Set())}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 font-semibold text-[11px]"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {history.length === 0 ? (
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                  No login audit entries exist in the database.
                </div>
              ) : (
                history.map((h) => {
                  const isSelected = selectedHistoryIds.has(h.id);
                  return (
                    <div
                      key={h.id}
                      className={`bg-[#0C1222] border rounded-2xl p-3 flex items-center justify-between gap-3 text-xs ${
                        isSelected ? 'border-indigo-500/70 bg-indigo-950/15' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleIdInSet(h.id, setSelectedHistoryIds)}
                          className="w-4 h-4 mt-1 accent-indigo-600 rounded cursor-pointer shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white">{h.email}</span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                h.status === 'success'
                                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/50'
                                  : h.status === 'DEVICE_MISMATCH_BLOCKED'
                                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/50'
                                  : h.status === 'DEVICE_RESET_BY_ADMIN'
                                  ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50'
                                  : 'bg-rose-950/80 text-rose-400 border-rose-700/50'
                              }`}
                            >
                              {h.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            IP: {h.ip_address} · {new Date(h.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setHistoryPendingDelete(h)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 shrink-0"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete Login Log</h3>
                  <p className="text-slate-300">
                    Remove login history entry for <strong className="text-white">{historyPendingDelete.email}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setHistoryPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteLoginHistory}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
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
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {totalFeedbackCount} Submissions
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Review, filter, and respond to feedback submitted by both VIP and Non-VIP students.
                  </p>
                </div>
              </div>

              {/* Feedback Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Total Feedback</p>
                  <p className="text-lg font-extrabold text-white">{totalFeedbackCount}</p>
                </div>
                <div className="bg-[#0C1222] border border-amber-800/40 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-amber-400">New</p>
                  <p className="text-lg font-extrabold text-white">{newFeedbackCount}</p>
                </div>
                <div className="bg-[#0C1222] border border-indigo-800/40 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-indigo-400">In Review</p>
                  <p className="text-lg font-extrabold text-white">{inReviewFeedbackCount}</p>
                </div>
                <div className="bg-[#0C1222] border border-emerald-800/40 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-emerald-400">Resolved</p>
                  <p className="text-lg font-extrabold text-white">{resolvedFeedbackCount}</p>
                </div>
                <div className="bg-[#0C1222] border border-purple-800/40 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-purple-300">VIP Users</p>
                  <p className="text-lg font-extrabold text-white">
                    {vipFeedbackCount} / {totalFeedbackCount - vipFeedbackCount} Non-VIP
                  </p>
                </div>
                <div className="bg-[#0C1222] border border-yellow-800/40 rounded-2xl p-3 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase text-yellow-400">Avg Rating</p>
                  <p className="text-lg font-extrabold text-white flex items-center gap-1">
                    <span>{avgRating}</span>
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                  </p>
                </div>
              </div>

              {/* Filter & Search Controls */}
              <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-3.5 space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      VIP / Non-VIP
                    </label>
                    <select
                      value={feedbackVipFilter}
                      onChange={(e) => setFeedbackVipFilter(e.target.value as 'all' | 'vip' | 'non_vip')}
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="all">All Users</option>
                      <option value="vip">VIP Users Only</option>
                      <option value="non_vip">Non-VIP Users Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Category
                    </label>
                    <select
                      value={feedbackCategoryFilter}
                      onChange={(e) => setFeedbackCategoryFilter(e.target.value as 'all' | FeedbackCategory)}
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
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
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Rating
                    </label>
                    <select
                      value={feedbackRatingFilter}
                      onChange={(e) =>
                        setFeedbackRatingFilter(e.target.value as 'all' | '1' | '2' | '3' | '4' | '5')
                      }
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
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
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Status
                    </label>
                    <select
                      value={feedbackStatusFilter}
                      onChange={(e) => setFeedbackStatusFilter(e.target.value as 'all' | FeedbackStatus)}
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="all">All Statuses</option>
                      <option value="New">New</option>
                      <option value="In Review">In Review</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Submission Date
                    </label>
                    <select
                      value={feedbackDateFilter}
                      onChange={(e) => setFeedbackDateFilter(e.target.value as 'all' | 'today' | '7d' | '30d')}
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Search Email or User ID
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={feedbackSearch}
                        onChange={(e) => setFeedbackSearch(e.target.value)}
                        placeholder="Email, UID, keyword..."
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                      />
                      {feedbackSearch && (
                        <button
                          type="button"
                          onClick={() => setFeedbackSearch('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-white"
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
                  <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                    {feedbackRecords.length === 0
                      ? 'No user feedback has been submitted yet.'
                      : 'No feedback entries match the active filters.'}
                  </div>
                ) : (
                  filteredFeedback.map((f) => (
                    <div
                      key={f.id}
                      className="bg-[#0C1222] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white">{f.user_email}</span>
                          <span className="font-mono text-[10px] text-slate-500">UID: {f.user_id.slice(0, 12)}</span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              f.is_vip_at_submission
                                ? 'bg-amber-950/70 text-amber-300 border-amber-700/50'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {f.is_vip_at_submission ? 'VIP User' : 'Non-VIP User'}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-700/40">
                            {f.category}
                          </span>
                          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-400">
                            {'★'.repeat(Math.max(1, Math.min(5, Number(f.rating) || 5)))}
                            <span className="text-slate-600">
                              {'★'.repeat(5 - Math.max(1, Math.min(5, Number(f.rating) || 5)))}
                            </span>
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              f.status === 'Resolved'
                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50'
                                : f.status === 'In Review'
                                ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50'
                                : f.status === 'Rejected'
                                ? 'bg-rose-950/80 text-rose-300 border-rose-700/50'
                                : 'bg-amber-950/80 text-amber-300 border-amber-700/50'
                            }`}
                          >
                            {f.status}
                          </span>
                        </div>

                        <p className="text-xs text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                          {f.message}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 pt-0.5">
                          <span>Submitted: {new Date(f.created_at).toLocaleString()}</span>
                          {f.reviewed_by && <span>Reviewed by: {f.reviewed_by}</span>}
                          {f.admin_note && (
                            <span className="text-indigo-300 italic">Admin Note: {f.admin_note}</span>
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
                          className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-[11px] flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Review / Manage</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedbackPendingDelete(f)}
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-rose-400 hover:text-rose-300 transition-colors"
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
                  <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-white">Feedback Details & Moderation</h3>
                        <p className="text-[11px] text-slate-400">
                          ID: <span className="font-mono text-slate-300">{selectedFeedbackDetail.id}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFeedbackDetail(null)}
                        className="text-slate-400 hover:text-white p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">User Email:</span>
                        <span className="font-bold text-white">{selectedFeedbackDetail.user_email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">User ID:</span>
                        <span className="font-mono text-slate-300">{selectedFeedbackDetail.user_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Membership at Submission:</span>
                        <span
                          className={`font-bold ${
                            selectedFeedbackDetail.is_vip_at_submission ? 'text-amber-400' : 'text-slate-300'
                          }`}
                        >
                          {selectedFeedbackDetail.is_vip_at_submission ? 'VIP Member' : 'Non-VIP User'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Category:</span>
                        <span className="font-bold text-indigo-300">{selectedFeedbackDetail.category}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Rating:</span>
                        <span className="font-bold text-amber-400">
                          {'★'.repeat(selectedFeedbackDetail.rating)} ({selectedFeedbackDetail.rating}/5)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Submitted At:</span>
                        <span className="text-slate-300">
                          {new Date(selectedFeedbackDetail.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-300">Feedback Message</label>
                      <div className="p-3 rounded-xl bg-[#080D19] border border-slate-800 text-slate-200 whitespace-pre-wrap break-words leading-relaxed">
                        {selectedFeedbackDetail.message}
                      </div>
                    </div>

                    {selectedFeedbackDetail.attachment_url && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-300 block">
                          Attached Screenshot
                        </label>
                        <div className="bg-black border border-slate-800 rounded-xl p-2 flex items-center justify-center max-h-72 overflow-auto">
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

                    <div className="grid grid-cols-1 gap-3 pt-2 border-t border-slate-800">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Update Feedback Status
                        </label>
                        <select
                          value={feedbackStatusDraft}
                          onChange={(e) => setFeedbackStatusDraft(e.target.value as FeedbackStatus)}
                          className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                        >
                          <option value="New">New</option>
                          <option value="In Review">In Review</option>
                          <option value="Resolved">Resolved</option>
                          <option value="Rejected">Rejected</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          Internal Admin Note (Private — never shown to users)
                        </label>
                        <textarea
                          rows={3}
                          value={feedbackAdminNoteDraft}
                          onChange={(e) => setFeedbackAdminNoteDraft(e.target.value)}
                          placeholder="Add internal investigation or resolution notes..."
                          className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={() => setSelectedFeedbackDetail(null)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        disabled={isSavingFeedbackUpdate}
                        onClick={handleSaveFeedbackAdminUpdate}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5"
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
                  <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-rose-400" />
                      <span>Delete User Feedback</span>
                    </h3>
                    <p className="text-slate-300">
                      Permanently delete this feedback submission from{' '}
                      <strong className="text-white">{feedbackPendingDelete.user_email}</strong>?
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        disabled={isDeletingFeedback}
                        onClick={() => setFeedbackPendingDelete(null)}
                        className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isDeletingFeedback}
                        onClick={handleConfirmDeleteFeedback}
                        className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold"
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
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {announcements.length} Total · {announcements.filter((a) => a.is_published).length} Active
                  </span>
                </h2>
                <p className="text-xs text-slate-400">
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Selected ({selectedAnnouncementIds.size})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenCleanupModal('announcements_expired', 'Clean Expired & Inactive Announcements')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/50 hover:bg-rose-950/90 border border-rose-800/50 text-rose-300 text-xs font-bold transition-colors"
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-900/60 hover:bg-rose-800/80 border border-rose-700/60 text-white text-xs font-bold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete All ({announcements.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Announcement Slider Global Controls */}
            <div className="bg-[#0C1222] border border-indigo-500/30 rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Automatic Announcement Slider Controls</span>
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    sliderEnabled
                      ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/60'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {sliderEnabled ? `Active (${sliderIntervalSec}s interval)` : 'Slider Disabled'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="flex items-center justify-between bg-[#080D19] border border-slate-800 rounded-xl p-3">
                  <div>
                    <label className="font-bold text-white block">Announcement Slider ON / OFF</label>
                    <p className="text-[10px] text-slate-400">Show or hide the announcement banner on Home</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={sliderEnabled}
                    onChange={(e) => setSliderEnabled(e.target.checked)}
                    className="w-4 h-4 accent-indigo-600"
                  />
                </div>

                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <label className="font-bold text-white block">Slide Interval (Seconds)</label>
                    <p className="text-[10px] text-slate-400">Auto-advance speed (2 to 60s)</p>
                  </div>
                  <input
                    type="number"
                    min="2"
                    max="60"
                    value={sliderIntervalSec}
                    onChange={(e) => setSliderIntervalSec(Number(e.target.value))}
                    className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold text-center"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={isSavingSliderSettings}
                  onClick={handleSaveSliderControls}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingSliderSettings ? 'Saving...' : 'Save Slider Settings'}</span>
                </button>
              </div>
            </div>

            {/* Create New Announcement Form */}
            <form onSubmit={handleCreateAnnouncement} className="bg-[#0C1222] border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
              <h3 className="text-xs font-bold text-white">Create New Announcement Slide</h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-300">Announcement Title *</label>
                  <input
                    type="text"
                    required
                    value={newAnnTitle}
                    onChange={(e) => setNewAnnTitle(e.target.value)}
                    placeholder="e.g. New SSC & Banking VIP Batch Live!"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300">Display Order</label>
                  <input
                    type="number"
                    min="1"
                    value={newAnnDisplayOrder}
                    onChange={(e) => setNewAnnDisplayOrder(Number(e.target.value))}
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300">Announcement Message / Content *</label>
                <textarea
                  required
                  rows={2}
                  value={newAnnContent}
                  onChange={(e) => setNewAnnContent(e.target.value)}
                  placeholder="Details of the announcement..."
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300">Action Link URL (Optional)</label>
                  <input
                    type="text"
                    value={newAnnLinkUrl}
                    onChange={(e) => setNewAnnLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300">Start Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={newAnnStartDate}
                    onChange={(e) => setNewAnnStartDate(e.target.value)}
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300">End Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={newAnnEndDate}
                    onChange={(e) => setNewAnnEndDate(e.target.value)}
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAnnPublished}
                    onChange={(e) => setNewAnnPublished(e.target.checked)}
                    className="w-4 h-4 accent-purple-600"
                  />
                  <span>Active (Publish immediately to slider)</span>
                </label>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Publish Notice</span>
                </button>
              </div>
            </form>

            {announcements.length > 0 && (
              <div className="bg-[#0C1222] border border-slate-800/80 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Selected: <strong className="text-white">{selectedAnnouncementIds.size}</strong> of{' '}
                  {announcements.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAnnouncementIds(new Set(announcements.map((a) => a.id)))}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px]"
                  >
                    Select All ({announcements.length})
                  </button>
                  {selectedAnnouncementIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedAnnouncementIds(new Set())}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 font-semibold text-[11px]"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                  No announcements exist in the database.
                </div>
              ) : (
                announcements.map((a) => {
                  const isSelected = selectedAnnouncementIds.has(a.id);
                  return (
                    <div
                      key={a.id}
                      className={`bg-[#0C1222] border rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        isSelected ? 'border-indigo-500/70 bg-indigo-950/15' : 'border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleIdInSet(a.id, setSelectedAnnouncementIds)}
                          className="w-4 h-4 mt-1 accent-indigo-600 rounded cursor-pointer shrink-0"
                        />
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                              #{a.display_order ?? 1}
                            </span>
                            <h4 className="font-bold text-white">{a.title}</h4>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                a.is_published
                                  ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {a.is_published ? 'Active' : 'Hidden'}
                            </span>
                          </div>
                          <p className="text-slate-300 text-[11px]">{a.content}</p>
                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                            <span>Created: {new Date(a.created_at).toLocaleDateString()}</span>
                            {a.link_url && <span className="text-indigo-400 truncate max-w-xs">Link: {a.link_url}</span>}
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
                              ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                              : 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50 hover:bg-emerald-900/60'
                          }`}
                        >
                          {a.is_published ? 'Hide' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAnnouncement(a)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400"
                          title="Edit Announcement"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAnnPendingDelete(a)}
                          className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-950"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-3 text-xs">
                  <h3 className="text-sm font-bold text-white">Edit Announcement</h3>
                  <div>
                    <label className="text-[11px] font-bold text-slate-300">Title</label>
                    <input
                      type="text"
                      value={editingAnnouncement.title}
                      onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, title: e.target.value })}
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-300">Content</label>
                    <textarea
                      rows={3}
                      value={editingAnnouncement.content}
                      onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, content: e.target.value })}
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Display Order</label>
                      <input
                        type="number"
                        min="1"
                        value={editingAnnouncement.display_order ?? 1}
                        onChange={(e) =>
                          setEditingAnnouncement({ ...editingAnnouncement, display_order: Number(e.target.value) })
                        }
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-300">Action Link URL</label>
                      <input
                        type="text"
                        value={editingAnnouncement.link_url || ''}
                        onChange={(e) => setEditingAnnouncement({ ...editingAnnouncement, link_url: e.target.value })}
                        placeholder="https://..."
                        className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white mt-1"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-slate-300 pt-1">
                    <input
                      type="checkbox"
                      checked={editingAnnouncement.is_published}
                      onChange={(e) =>
                        setEditingAnnouncement({ ...editingAnnouncement, is_published: e.target.checked })
                      }
                      className="w-4 h-4 accent-indigo-600"
                    />
                    <span>Published / Visible in Slider</span>
                  </label>
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingAnnouncement(null)}
                      className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEditedAnnouncement}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5"
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-xs">
                  <h3 className="text-sm font-bold text-white">Delete Announcement</h3>
                  <p className="text-slate-300">
                    Are you sure you want to delete <strong className="text-white">{annPendingDelete.title}</strong>?
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setAnnPendingDelete(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAnnouncement(annPendingDelete.id)}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold"
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
            <div className="flex flex-wrap items-center justify-between gap-2 sticky top-16 z-20 bg-[#070B14]/95 backdrop-blur-md py-2 border-b border-slate-800/80">
              <div>
                <h2 className="text-base font-extrabold text-white">System, Get VIP Payment, Support & Donation Settings</h2>
                <p className="text-xs text-slate-400">
                  Configure Get VIP options (Telegram & Payment QR), Support section image & link, popups, and system parameters.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isSettingsDirty && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                    Unsaved Changes
                  </span>
                )}
                <button
                  onClick={handleSaveGlobalSettings}
                  disabled={!isSettingsDirty}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                    isSettingsDirty
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/60 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>

            {/* CARD 1: CORE SYSTEM SETTINGS */}
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
                <SettingsIcon className="w-4 h-4 text-indigo-400" />
                <span>A. Core Access & System Settings</span>
              </h3>

              {/* 1. Key Generation Page ON/OFF */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div>
                  <label className="font-bold text-white block">1. Key Generation Page ON/OFF</label>
                  <p className="text-[11px] text-slate-400">
                    When OFF, non-VIP users bypass key generation and proceed directly to Home.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={currentSettings.key_generation_enabled}
                  onChange={(e) => handleSettingChange('key_generation_enabled', e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
              </div>

              {/* Shortener Destination URL Helper */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950/70 to-purple-950/70 border border-indigo-500/40 text-xs">
                <div className="flex items-center gap-2 text-indigo-300 font-extrabold mb-1">
                  <Key className="w-4 h-4 text-indigo-400" />
                  <span>Your Key Destination URL (Paste in Shortener)</span>
                </div>
                <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
                  Paste this link into <span className="text-amber-300 font-bold">ShrinkMe.io</span>, <span className="text-amber-300 font-bold">GPlinks</span>, or any shortener to create your shortened URL. When students solve the shortener, they land here and their 24-hour access pass is instantly unlocked!
                </p>
                <div className="flex items-center gap-2 bg-[#080D1A] p-2 rounded-xl border border-slate-800">
                  <code className="text-xs text-indigo-200 font-mono flex-1 select-all truncate">
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
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-md transition-all active:scale-95"
                  >
                    {copiedDestUrl ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedDestUrl ? 'Copied Link!' : 'Copy Link for Shortener'}</span>
                  </button>
                </div>
              </div>

              {/* 2. Key Generation URL Shortener link */}
              <div className="pb-3 border-b border-slate-800/80">
                <label className="font-bold text-white block mb-1">
                  2. Key Generation URL Shortener link (Generated from ShrinkMe.io)
                </label>
                <input
                  type="text"
                  value={currentSettings.shortener_url}
                  onChange={(e) => handleSettingChange('shortener_url', e.target.value)}
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* 3. How to Generate Key tutorial video link */}
              <div className="pb-3 border-b border-slate-800/80">
                <label className="font-bold text-white block mb-1">
                  3. How to Generate Key tutorial video link
                </label>
                <input
                  type="text"
                  value={currentSettings.tutorial_video_url}
                  onChange={(e) => handleSettingChange('tutorial_video_url', e.target.value)}
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              {/* 4. Maintenance Mode ON/OFF */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div>
                  <label className="font-bold text-white block">4. Maintenance Mode ON/OFF (Super Admin)</label>
                  <p className="text-[11px] text-slate-400">
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
                  <p className="text-[11px] text-slate-400">
                    When OFF, new logins are blocked; existing active sessions remain preserved.
                  </p>
                </div>
                <input
                  type="checkbox"
                  disabled={!isSuperAdmin}
                  checked={currentSettings.login_enabled}
                  onChange={(e) => handleSettingChange('login_enabled', e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 disabled:opacity-40"
                />
              </div>
            </div>

            {/* CARD 1B: GET VIP PAGE — TELEGRAM & PAYMENT QR CODE CONFIGURATION */}
            <div className="bg-[#0C1222] border border-amber-500/40 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>Get VIP Page — Option A (Telegram) & Option B (Payment QR Code)</span>
                </h3>
                <button
                  type="button"
                  onClick={handleSaveGlobalSettings}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save VIP Payment Settings</span>
                </button>
              </div>

              {/* Option A: Telegram URL */}
              <div className="pb-3 border-b border-slate-800/80">
                <label className="font-bold text-white block mb-1">
                  Option A — VIP Telegram URL
                </label>
                <p className="text-[11px] text-slate-400 mb-1.5 leading-relaxed">
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
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white text-xs"
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
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
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
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <label className="font-bold text-white block">Require Transaction ID / UTR</label>
                      <p className="text-[10px] text-slate-400">
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
                      className="flex-1 bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                    <label className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold cursor-pointer shrink-0 flex items-center gap-1">
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
                    <div className="p-3 rounded-xl bg-[#080D19] border border-slate-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-white rounded-lg shrink-0">
                          <img
                            src={currentSettings.vip_payment_qr_url}
                            alt="Configured Payment QR"
                            className="w-16 h-16 object-contain"
                          />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-emerald-400">Payment QR Active & Saved</p>
                          <p className="text-[10px] text-slate-400 truncate max-w-[160px]">
                            {currentSettings.vip_payment_qr_url}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSettingAsset('vip_payment_qr_url')}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 text-[10px] font-bold"
                      >
                        Remove QR
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-[#080D19] border border-dashed border-slate-800 text-center text-[11px] text-slate-400">
                      No Payment QR uploaded yet. Upload a PNG, JPG, or WEBP QR image above.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CARD 2: TELEGRAM POPUP CONFIGURATION (FEATURE 4) */}
            <div className="bg-[#0C1222] border border-sky-500/30 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-sky-400" />
                  <span>B. Join Telegram Popup Configuration</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setPreviewTelegramPopup(true)}
                  className="px-3 py-1 rounded-lg bg-sky-950/60 hover:bg-sky-900/80 border border-sky-700/50 text-sky-300 font-bold text-[11px] flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview Popup</span>
                </button>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div>
                  <label className="font-bold text-white block">Telegram Popup ON / OFF</label>
                  <p className="text-[11px] text-slate-400">
                    Show the Join Telegram popup modal to visitors according to the display frequency.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={currentSettings.telegram_popup_enabled}
                  onChange={(e) => handleSettingChange('telegram_popup_enabled', e.target.checked)}
                  className="w-4 h-4 accent-sky-500"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Display Frequency</label>
                  <select
                    value={currentSettings.telegram_popup_frequency || 'once_per_session'}
                    onChange={(e) =>
                      handleSettingChange('telegram_popup_frequency', e.target.value as PopupFrequency)
                    }
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  >
                    <option value="every_visit">Every App Open / Visit</option>
                    <option value="once_per_session">Once Per Session</option>
                    <option value="once_per_day">Once Per Day</option>
                    <option value="once_per_user">Once Per User</option>
                  </select>
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Join Button Text</label>
                  <input
                    type="text"
                    value={currentSettings.telegram_popup_button_text || ''}
                    onChange={(e) => handleSettingChange('telegram_popup_button_text', e.target.value)}
                    placeholder="JOIN CHANNEL"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Later / Close Button Text</label>
                  <input
                    type="text"
                    value={currentSettings.telegram_popup_close_text || ''}
                    onChange={(e) => handleSettingChange('telegram_popup_close_text', e.target.value)}
                    placeholder="Remind Me Later"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>

            {/* CARD 3: SUPPORT LINK & SUPPORT IMAGE CONFIGURATION */}
            <div className="bg-[#0C1222] border border-emerald-500/30 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-emerald-400" />
                  <span>C. Support Section Link & Image Configuration</span>
                </h3>
                <button
                  type="button"
                  onClick={handleSaveGlobalSettings}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Support Settings</span>
                </button>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div>
                  <label className="font-bold text-white block">Support Option ON / OFF</label>
                  <p className="text-[11px] text-slate-400">
                    When enabled, displays Support in Home, Profile, Get VIP page, and Bottom Navigation.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentSettings.support_enabled)}
                  onChange={(e) => handleSettingChange('support_enabled', e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Support Link URL (Telegram / WhatsApp / Help Desk)</label>
                  <input
                    type="text"
                    value={currentSettings.support_url || ''}
                    onChange={(e) => handleSettingChange('support_url', e.target.value)}
                    placeholder="https://t.me/studyfox_support"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                    className="flex-1 bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                  <label className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold cursor-pointer shrink-0 flex items-center gap-1">
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
                  <div className="p-3 rounded-xl bg-[#080D19] border border-slate-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={currentSettings.support_image_url}
                        alt="Support Section Preview"
                        className="w-16 h-16 object-contain rounded-lg bg-slate-900 border border-slate-800 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-emerald-400">Support Image Saved in Database</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {currentSettings.support_image_url}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSettingAsset('support_image_url')}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 text-[10px] font-bold shrink-0"
                    >
                      Remove Image
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* CARD 4: DONATION FEATURE (FEATURE 6) */}
            <div className="bg-[#0C1222] border border-pink-500/30 rounded-2xl p-5 space-y-4 text-xs">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
                <Heart className="w-4 h-4 text-pink-400" />
                <span>D. Donation Feature Configuration</span>
              </h3>

              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div>
                  <label className="font-bold text-white block">Donation Feature ON / OFF</label>
                  <p className="text-[11px] text-slate-400">
                    Show a voluntary "Support Study Fox" donation card on the Home and Profile sections.
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
                    placeholder="Support Study Fox"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Donation Button Text</label>
                  <input
                    type="text"
                    value={currentSettings.donation_button_text || ''}
                    onChange={(e) => handleSettingChange('donation_button_text', e.target.value)}
                    placeholder="Donate Now"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                      className="flex-1 bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                    <label className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-pink-300 font-bold cursor-pointer shrink-0 flex items-center gap-1">
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
                    <div className="p-2.5 rounded-xl bg-[#080D19] border border-slate-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={currentSettings.donation_qr_url}
                          alt="Donation QR Preview"
                          className="w-12 h-12 object-contain rounded bg-white p-1 shrink-0"
                        />
                        <span className="text-[10px] text-emerald-400 font-bold truncate">
                          Saved QR Image
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSettingAsset('donation_qr_url')}
                        className="px-2 py-1 rounded bg-rose-950/70 text-rose-300 text-[10px] font-bold shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CARD 5: CUSTOMIZABLE POPUP MANAGEMENT (FEATURE 7) */}
            <div className="bg-[#0C1222] border border-purple-500/30 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-purple-400" />
                  <span>E. Customizable Popup Management</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setPreviewCustomPopup(true)}
                  className="px-3 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/50 text-purple-300 font-bold text-[11px] flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>Preview Custom Popup</span>
                </button>
              </div>

              <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                <div>
                  <label className="font-bold text-white block">Custom Popup ON / OFF</label>
                  <p className="text-[11px] text-slate-400">
                    Display a custom promotional or exam announcement modal when users visit the platform.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(currentSettings.custom_popup_enabled)}
                  onChange={(e) => handleSettingChange('custom_popup_enabled', e.target.checked)}
                  className="w-4 h-4 accent-purple-500"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Display Frequency</label>
                  <select
                    value={currentSettings.custom_popup_frequency || 'once_per_session'}
                    onChange={(e) =>
                      handleSettingChange('custom_popup_frequency', e.target.value as PopupFrequency)
                    }
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                      className="flex-1 bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                    <label className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 font-bold cursor-pointer shrink-0 flex items-center gap-1">
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-white block mb-1">Action Button Link URL (Optional)</label>
                  <input
                    type="text"
                    value={currentSettings.custom_popup_button_url || ''}
                    onChange={(e) => handleSettingChange('custom_popup_button_url', e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>
            </div>

            {/* CARD 6: DATA RETENTION & STORAGE OPTIMIZATION (FEATURE 2) */}
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-amber-400" />
                    <span>F. Data Retention & Storage Optimization</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Configure default retention periods and clean up orphaned uploaded assets.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleOpenCleanupModal('storage_unused_assets', 'Clean Unused Uploaded Assets')
                  }
                  className="px-3 py-1.5 rounded-xl bg-amber-950/50 hover:bg-amber-900/70 border border-amber-700/50 text-amber-300 font-bold text-xs flex items-center gap-1.5"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
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
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Save Changes Button */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <p className="text-[11px] text-slate-400">
                  {isSettingsDirty ? 'Click to apply changes to all users' : 'All settings up to date'}
                </p>
                <button
                  onClick={handleSaveGlobalSettings}
                  disabled={!isSettingsDirty}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                    isSettingsDirty
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-950/60 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>Save All Settings</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* APP CUSTOMIZATION SECTION */}
        {activeSection === 'customization' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-400" />
                App Customization
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Customize your portal's display name, branding logo, and visual color theme. All changes persist in the database.
              </p>
            </div>

            {/* A. APP NAME */}
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    A. Application Name
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Change the portal name displayed in headers, navigation, and page titles.
                  </p>
                </div>
                <div className="px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300">
                  <span className="text-slate-400 font-medium">Current saved name: </span>
                  <span className="font-bold text-indigo-300">
                    {currentSettings?.app_name || 'Education Platform'}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  App Name
                </label>
                <input
                  type="text"
                  value={customAppName}
                  onChange={(e) => setCustomAppName(e.target.value)}
                  placeholder="e.g. Education Portal, SHREE HARI, ExamPrep Hub"
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <p className="text-[11px] text-slate-400">
                  {customAppName.trim() !== (currentSettings?.app_name || 'Education Platform')
                    ? 'Unsaved changes to App Name'
                    : 'App Name matches saved database value'}
                </p>
                <button
                  type="button"
                  onClick={handleSaveAppName}
                  disabled={isSavingCustomization || !customAppName.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>

            {/* B. APP LOGO */}
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-purple-400" />
                  B. Application Logo
                </h3>
                <p className="text-[11px] text-slate-400">
                  Upload an image logo or specify a hosted image URL. The logo appears on top headers, portal cards, and login screens.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Upload Logo File (PNG, JPG, SVG, WebP - max 2MB)
                    </label>
                    <label className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[#080D19] border border-dashed border-slate-700 hover:border-indigo-500 rounded-xl cursor-pointer text-xs text-slate-300 transition-colors">
                      <Upload className="w-4 h-4 text-indigo-400" />
                      <span>Choose local image file...</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">
                      Or Direct Image URL
                    </label>
                    <input
                      type="text"
                      value={customAppLogo}
                      onChange={(e) => setCustomAppLogo(e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {logoUploadError && (
                    <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/40 rounded-xl p-2.5">
                      {logoUploadError}
                    </p>
                  )}

                  {customAppLogo && (
                    <button
                      type="button"
                      onClick={() => setCustomAppLogo('')}
                      className="text-xs text-rose-400 hover:text-rose-300 underline"
                    >
                      Clear Logo (Revert to default icon)
                    </button>
                  )}
                </div>

                {/* Preview Box */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">
                    Logo Preview
                  </span>
                  <div className="w-20 h-20 rounded-2xl bg-slate-900/90 border border-slate-700/60 flex items-center justify-center overflow-hidden shadow-inner p-1.5">
                    {customAppLogo ? (
                      <img
                        src={customAppLogo}
                        alt="Logo Preview"
                        className="w-full h-full object-contain"
                        onError={() => setLogoUploadError('Preview failed: Image URL could not be loaded.')}
                      />
                    ) : (
                      <div className="w-full h-full rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-amber-500 flex items-center justify-center shadow-lg">
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 font-semibold mt-2">
                    {customAppLogo ? 'Custom Logo Active' : 'Default Brand Icon'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Will display in header and login portal
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <p className="text-[11px] text-slate-400">
                  {customAppLogo !== (currentSettings?.app_logo_url || '')
                    ? 'Unsaved logo changes pending'
                    : 'Logo matches saved database record'}
                </p>
                <button
                  type="button"
                  onClick={handleSaveAppLogo}
                  disabled={isSavingCustomization}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>

            {/* C. APP THEME */}
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Palette className="w-4 h-4 text-emerald-400" />
                    C. Application Theme Colors
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Customize the 5 brand colors used across the platform. Preview the result before saving.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleResetThemeToDefault}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Default</span>
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 block">
                  Quick Palette Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      name: 'Default Indigo (Classic)',
                      primary: '#6366f1',
                      secondary: '#8b5cf6',
                      bg: '#070B14',
                      text: '#f8fafc',
                      button: '#4f46e5',
                    },
                    {
                      name: 'Emerald Growth',
                      primary: '#10b981',
                      secondary: '#059669',
                      bg: '#061a14',
                      text: '#f0fdf4',
                      button: '#059669',
                    },
                    {
                      name: 'Ocean Cyan',
                      primary: '#06b6d4',
                      secondary: '#3b82f6',
                      bg: '#051329',
                      text: '#f0f9ff',
                      button: '#0284c7',
                    },
                    {
                      name: 'Crimson Pro',
                      primary: '#f43f5e',
                      secondary: '#e11d48',
                      bg: '#1c0a0e',
                      text: '#fff1f2',
                      button: '#e11d48',
                    },
                    {
                      name: 'Royal Purple',
                      primary: '#a855f7',
                      secondary: '#7c3aed',
                      bg: '#120b22',
                      text: '#faf5ff',
                      button: '#7c3aed',
                    },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleApplyPalettePreset(preset)}
                      className="px-2.5 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-700/60 text-[11px] text-slate-300 flex items-center gap-1.5 transition-colors"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: preset.primary }}
                      />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 5 Color Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                {/* 1. Primary */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    1. Primary Color
                  </label>
                  <p className="text-[10px] text-slate-400">Accents & highlights</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customThemePrimary}
                      onChange={(e) => setCustomThemePrimary(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customThemePrimary}
                      onChange={(e) => setCustomThemePrimary(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>

                {/* 2. Secondary */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    2. Secondary Color
                  </label>
                  <p className="text-[10px] text-slate-400">Gradients & borders</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customThemeSecondary}
                      onChange={(e) => setCustomThemeSecondary(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customThemeSecondary}
                      onChange={(e) => setCustomThemeSecondary(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>

                {/* 3. Background */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    3. Background Color
                  </label>
                  <p className="text-[10px] text-slate-400">Main body background</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customThemeBackground}
                      onChange={(e) => setCustomThemeBackground(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customThemeBackground}
                      onChange={(e) => setCustomThemeBackground(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>

                {/* 4. Text */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    4. Text Color
                  </label>
                  <p className="text-[10px] text-slate-400">Headings & labels</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customThemeText}
                      onChange={(e) => setCustomThemeText(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customThemeText}
                      onChange={(e) => setCustomThemeText(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>

                {/* 5. Button */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    5. Button Color
                  </label>
                  <p className="text-[10px] text-slate-400">Buttons & call-to-actions</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customThemeButton}
                      onChange={(e) => setCustomThemeButton(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customThemeButton}
                      onChange={(e) => setCustomThemeButton(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Interactive Live Theme Preview Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Interactive Theme Preview (Before Saving)
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Simulates appearance across website components
                  </span>
                </div>

                <div
                  className="rounded-2xl p-4 border border-slate-700/80 shadow-xl transition-all"
                  style={{
                    backgroundColor: customThemeBackground,
                    color: customThemeText,
                  }}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-700/50">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-xs shadow-md overflow-hidden p-0.5 border-[0.5px] border-white/10 shrink-0"
                        style={{
                          background: customAppLogo
                            ? '#080D1A'
                            : `linear-gradient(135deg, ${customThemePrimary}, ${customThemeSecondary})`,
                        }}
                      >
                        {customAppLogo ? (
                          <img src={customAppLogo} alt="Logo" className="w-full h-full object-contain" />
                        ) : (
                          customAppName.substring(0, 2).toUpperCase() || 'EP'
                        )}
                      </div>
                      <span className="font-extrabold text-sm" style={{ color: customThemeText }}>
                        {customAppName || 'Education Platform'}
                      </span>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm"
                      style={{
                        backgroundColor: `${customThemePrimary}22`,
                        color: customThemePrimary,
                        borderColor: `${customThemePrimary}66`,
                      }}
                    >
                      ★ VIP ACCESS
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div className="bg-black/30 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold" style={{ color: customThemeText }}>
                          Study IQ Education Platform
                        </p>
                        <p className="text-[10px] opacity-75">Live Batch Lectures & Mock Tests</p>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-md active:scale-95 transition-all"
                        style={{ backgroundColor: customThemeButton }}
                      >
                        OPEN
                      </button>
                    </div>

                    <div className="bg-black/30 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold" style={{ color: customThemeText }}>
                          Premium VIP Access Plan
                        </p>
                        <p className="text-[10px] opacity-75">30 Days • Unlimited Access</p>
                      </div>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-md flex items-center gap-1 active:scale-95 transition-all"
                        style={{
                          background: `linear-gradient(135deg, ${customThemePrimary}, ${customThemeSecondary})`,
                        }}
                      >
                        <Crown className="w-3 h-3" />
                        <span>VIP</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Changes Button */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <p className="text-[11px] text-slate-400">
                  Click Save Changes to apply these theme colors consistently across the entire website.
                </p>
                <button
                  type="button"
                  onClick={handleSaveTheme}
                  disabled={isSavingCustomization}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-950/60 transition-all active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </button>
              </div>
            </div>

            {/* D. VIP SECTION THEME CUSTOMIZATION */}
            <div className="bg-[#0C1222] border border-amber-900/40 rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    D. Separate VIP Section Theme Customization
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Customize dedicated background, card, accent, text, button, and border colors for the VIP section. Changing VIP colors will not alter the main website theme.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleResetVipThemeToDefault}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Default</span>
                </button>
              </div>

              {/* Quick VIP Palette Presets */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-amber-400/90 block">
                  Quick VIP Palette Presets
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    {
                      name: 'Royal Amber & Obsidian (Default)',
                      bg: '#090d16',
                      card: '#0f172a',
                      accent: '#f59e0b',
                      text: '#f8fafc',
                      button: '#eab308',
                      border: '#1e293b',
                    },
                    {
                      name: 'Cyber Gold & Midnight',
                      bg: '#050814',
                      card: '#0b1120',
                      accent: '#eab308',
                      text: '#ffffff',
                      button: '#f59e0b',
                      border: '#25334d',
                    },
                    {
                      name: 'Emerald VIP Sovereign',
                      bg: '#04130d',
                      card: '#09261a',
                      accent: '#10b981',
                      text: '#f0fdf4',
                      button: '#059669',
                      border: '#0f402e',
                    },
                    {
                      name: 'Rose Gold Luxury',
                      bg: '#14070d',
                      card: '#210c16',
                      accent: '#fb7185',
                      text: '#fff1f2',
                      button: '#f43f5e',
                      border: '#3d1729',
                    },
                    {
                      name: 'Amethyst Monarch',
                      bg: '#0d0818',
                      card: '#170e2b',
                      accent: '#c084fc',
                      text: '#faf5ff',
                      button: '#9333ea',
                      border: '#2e1c54',
                    },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => handleApplyVipPalettePreset(preset)}
                      className="px-2.5 py-1 rounded-lg bg-slate-850 hover:bg-slate-800 border border-slate-700/60 text-[11px] text-slate-300 flex items-center gap-1.5 transition-colors"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: preset.accent }}
                      />
                      <span>{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 6 Color Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* 1. VIP Background */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    1. Background
                  </label>
                  <p className="text-[10px] text-slate-400">VIP page backdrop</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customVipBg}
                      onChange={(e) => setCustomVipBg(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customVipBg}
                      onChange={(e) => setCustomVipBg(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>

                {/* 2. VIP Card */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    2. Card Color
                  </label>
                  <p className="text-[10px] text-slate-400">Plan cards & panels</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customVipCard}
                      onChange={(e) => setCustomVipCard(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customVipCard}
                      onChange={(e) => setCustomVipCard(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>

                {/* 3. VIP Accent */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    3. Accent Color
                  </label>
                  <p className="text-[10px] text-slate-400">Crowns, badges, checks</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customVipAccent}
                      onChange={(e) => setCustomVipAccent(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customVipAccent}
                      onChange={(e) => setCustomVipAccent(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>

                {/* 4. VIP Text */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    4. Text Color
                  </label>
                  <p className="text-[10px] text-slate-400">Headings & descriptions</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customVipText}
                      onChange={(e) => setCustomVipText(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customVipText}
                      onChange={(e) => setCustomVipText(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>

                {/* 5. VIP Button */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    5. Button Color
                  </label>
                  <p className="text-[10px] text-slate-400">GET VIP action button</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customVipButton}
                      onChange={(e) => setCustomVipButton(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customVipButton}
                      onChange={(e) => setCustomVipButton(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>

                {/* 6. VIP Border */}
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    6. Border Color
                  </label>
                  <p className="text-[10px] text-slate-400">Card borders & lines</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customVipBorder}
                      onChange={(e) => setCustomVipBorder(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={customVipBorder}
                      onChange={(e) => setCustomVipBorder(e.target.value)}
                      maxLength={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Interactive VIP Card Live Preview Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Crown className="w-3.5 h-3.5" />
                    Interactive VIP Card Preview (Live simulation)
                  </label>
                  <span className="text-[10px] text-slate-400">
                    Shows exactly how the VIP section appears to students
                  </span>
                </div>

                <div
                  className="rounded-2xl p-5 border shadow-2xl transition-all relative overflow-hidden"
                  style={{
                    backgroundColor: customVipBg,
                    borderColor: customVipBorder,
                    color: customVipText,
                  }}
                >
                  <div className="max-w-md mx-auto">
                    {/* Simulated VIP Card */}
                    <div
                      className="rounded-2xl p-5 border shadow-xl relative"
                      style={{
                        backgroundColor: customVipCard,
                        borderColor: customVipBorder,
                        color: customVipText,
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span
                            className="text-[10px] font-extrabold uppercase tracking-wider"
                            style={{ color: customVipAccent }}
                          >
                            30 DAYS SPRINT
                          </span>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-2xl font-extrabold tabular-nums" style={{ color: customVipText }}>
                              ₹299
                            </span>
                          </div>
                          <p className="text-xs opacity-75 font-medium mt-0.5">
                            Premium VIP Access Plan
                          </p>
                        </div>

                        <div
                          className="w-10 h-10 rounded-2xl border flex items-center justify-center shadow-md"
                          style={{
                            backgroundColor: `${customVipAccent}20`,
                            borderColor: `${customVipAccent}40`,
                          }}
                        >
                          <Crown className="w-5 h-5 stroke-[2.2]" style={{ color: customVipAccent }} />
                        </div>
                      </div>

                      <div className="mt-3.5 space-y-1.5 border-t pt-3" style={{ borderColor: `${customVipBorder}88` }}>
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" style={{ color: customVipAccent }} />
                          <span style={{ color: customVipText }}>Instant Activation (Keyless access)</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" style={{ color: customVipAccent }} />
                          <span style={{ color: customVipText }}>All Exclusive VIP Batches Unlocked</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        style={{
                          backgroundColor: customVipButton,
                          color: '#000000',
                        }}
                        className="w-full mt-4 py-2.5 rounded-xl font-extrabold text-xs tracking-wider uppercase shadow-md flex items-center justify-center gap-1.5"
                      >
                        <span>GET VIP</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-90 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save VIP Changes Button */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <p className="text-[11px] text-slate-400">
                  Saves separate VIP colors persistently in Supabase and applies them immediately to the VIP page.
                </p>
                <button
                  type="button"
                  onClick={handleSaveVipTheme}
                  disabled={isSavingCustomization}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 disabled:opacity-50 text-black font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-amber-950/60 transition-all active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>Save VIP Theme</span>
                </button>
              </div>
            </div>

            {/* E. ANDROID APK BUILD SPECIFICATION NOTICE */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <AlertCircle className="w-4 h-4" />
                <span>Important Distinction: Native Android APK Customization</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Saving the App Name, Logo, and Theme colors in this section immediately updates the live website, Progressive Web App (PWA), and all connected browser sessions.
              </p>
              <p className="text-slate-400 leading-relaxed">
                However, for a compiled native Android APK, database configuration changes do <strong className="text-white">not</strong> automatically rebuild or resign installed Android binary packages. If this project contains a native Android app, the following build steps are required to produce a matching APK:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-300 font-mono text-[11px]">
                <li>Update the app title in <code className="text-amber-300">android/app/src/main/res/values/strings.xml</code> (&lt;string name=&quot;app_name&quot;&gt;).</li>
                <li>Replace launcher icon mipmaps in <code className="text-amber-300">android/app/src/main/res/mipmap-*/ic_launcher.png</code> with your new logo.</li>
                <li>Update theme primary color definitions in <code className="text-amber-300">res/values/colors.xml</code>.</li>
                <li>Compile and sign the release build via <code className="text-amber-300">./gradlew assembleRelease</code>.</li>
              </ul>
            </div>
          </div>
        )}

        {/* 11. ADMIN SECURITY (Super Admin Only) */}
        {activeSection === 'security' && isSuperAdmin && (
          <div className="space-y-4">
            <h2 className="text-base font-extrabold text-white">Administrator Security & Roles</h2>
            <p className="text-xs text-slate-400">
              Super Admin privilege: Create and manage administrator accounts and privilege levels.
            </p>

            <form onSubmit={handleCreateAdmin} className="bg-[#0C1222] border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-white">Create or Upgrade Administrator</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-300">Admin Email</label>
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="admin@education.com"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300">Password</label>
                  <input
                    type="password"
                    required
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300">Role Privilege</label>
                  <select
                    value={newAdminRole}
                    onChange={(e) => setNewAdminRole(e.target.value as 'admin' | 'super_admin')}
                    className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white mt-1"
                  >
                    <option value="admin">Admin (Content & Users)</option>
                    <option value="super_admin">Super Admin (All Sections & Settings)</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
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
                    className="bg-[#0C1222] border border-slate-800 rounded-2xl p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white">{adm.email}</p>
                        {isPrimarySuperAdmin && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-700/50 text-amber-300">
                            Primary Super Admin
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5 inline-block ${
                          adm.role === 'super_admin' ? 'bg-purple-900/50 text-purple-300' : 'bg-indigo-900/50 text-indigo-300'
                        }`}
                      >
                        {adm.role}
                      </span>
                    </div>

                    {canDeleteThisAdmin ? (
                      <button
                        type="button"
                        onClick={() => handleRequestDeleteAdmin(adm)}
                        className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-950 transition-colors"
                        title="Remove Admin"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-500 px-2 py-1 rounded-lg bg-slate-900/60 border border-slate-800">
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
                <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-rose-950/80 border border-rose-800/60 flex items-center justify-center text-rose-400 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-white">Remove Administrator Account</h3>
                        <p className="text-[11px] text-slate-400">Super Admin Authorization Required</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isDeletingAdmin}
                      onClick={() => {
                        setAdminPendingDelete(null);
                        setAdminDeleteError(null);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-3 rounded-xl bg-[#080D19] border border-slate-800/90 text-xs space-y-1">
                    <p className="text-slate-300">
                      Are you sure you want to permanently remove this administrator account?
                    </p>
                    <p className="font-bold text-white pt-1">{adminPendingDelete.email}</p>
                    <p className="text-[11px] text-slate-400">
                      Role: <span className="text-indigo-300 font-semibold">{adminPendingDelete.role}</span> — All active administrative sessions for this account will be revoked immediately.
                    </p>
                  </div>

                  {adminDeleteError && (
                    <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
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
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingAdmin}
                      onClick={handleConfirmDeleteAdmin}
                      className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-rose-950/50 transition-all"
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
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>{cleanupModal.title}</span>
                </h3>
                <button
                  type="button"
                  disabled={cleanupModal.executing}
                  onClick={() => setCleanupModal(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {cleanupModal.supportsRetentionDays && (
                <div className="bg-[#080D19] border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="font-bold text-white block">Retention Period (Days)</label>
                    <p className="text-[10px] text-slate-400">
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
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-800 text-slate-300'
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
                      className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center font-bold"
                    />
                  </div>
                </div>
              )}

              {cleanupModal.error && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{cleanupModal.error}</span>
                </div>
              )}

              {cleanupModal.loading ? (
                <div className="p-6 text-center text-slate-400">
                  Calculating affected records...
                </div>
              ) : cleanupModal.preview ? (
                <div className="p-3.5 rounded-xl bg-[#080D19] border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-semibold">Target Records / Files:</span>
                    <span className="text-sm font-extrabold text-amber-400">
                      {cleanupModal.preview.count} {cleanupModal.preview.count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {cleanupModal.preview.description}
                  </p>
                  {cleanupModal.preview.sample_items && cleanupModal.preview.sample_items.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Preview Sample:</p>
                      <ul className="list-disc pl-4 text-[10px] text-slate-300 space-y-0.5 max-h-28 overflow-y-auto">
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
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
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
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold flex items-center gap-1.5"
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
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span>{bulkDeleteModal.title}</span>
                </h3>
                <button
                  type="button"
                  disabled={bulkDeleteModal.executing}
                  onClick={() => setBulkDeleteModal(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-[#080D19] border border-slate-800 space-y-2">
                <p className="text-slate-200 font-semibold">
                  You are about to permanently delete{' '}
                  <strong className="text-amber-400">{bulkDeleteModal.ids.length}</strong> selected record(s) from{' '}
                  <span className="font-mono text-indigo-300">{bulkDeleteModal.section}</span>.
                </p>
                <p className="text-[11px] text-slate-400">
                  Protected accounts and active VIP entitlements are automatically safeguarded. Completed payments, VIP history, referral records, and admin audit history are strictly preserved and never deleted.
                </p>

                {bulkDeleteModal.section === 'users' && (
                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 block">
                      Selected Users to Delete ({bulkDeleteModal.ids.length}):
                    </span>
                    <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                      {bulkDeleteModal.ids.map((uid) => {
                        const found = users.find((u) => u.id === uid);
                        return (
                          <div
                            key={uid}
                            className="p-2 rounded-lg bg-[#0C1222] border border-slate-800 flex items-center justify-between gap-2 text-[11px]"
                          >
                            <div className="min-w-0">
                              <span className="font-bold text-white block truncate">
                                {found ? `${found.name ? `${found.name} · ` : ''}${found.email}` : uid}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                ID: {uid}
                                {found?.created_at
                                  ? ` · Reg: ${new Date(found.created_at).toLocaleDateString()}`
                                  : ''}
                              </span>
                            </div>
                            {found && (
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 shrink-0">
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
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{bulkDeleteModal.error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={bulkDeleteModal.executing}
                  onClick={() => setBulkDeleteModal(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={bulkDeleteModal.executing || bulkDeleteModal.ids.length === 0}
                  onClick={handleExecuteBulkDeleteSelected}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold flex items-center gap-1.5 shadow-lg shadow-rose-950/50"
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

        {/* RESET REGISTERED DEVICE / ALLOW NEW DEVICE CONFIRMATION MODAL */}
        {userPendingVipDeviceReset && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0C1222] border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-indigo-400" />
                  <span>Reset Registered Device / Allow New Device</span>
                </h3>
                <button
                  type="button"
                  disabled={isResettingVipDevice}
                  onClick={() => setUserPendingVipDeviceReset(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[#080D19] border border-slate-800 space-y-1">
                <p className="font-bold text-white">{userPendingVipDeviceReset.email}</p>
                <p className="text-[11px] text-slate-400">
                  Current Device:{' '}
                  <span className="text-emerald-400 font-semibold">
                    {userPendingVipDeviceReset.vip_device_label || 'Bound Primary Device'}
                  </span>
                </p>
                <p className="text-[11px] text-slate-300 pt-1">
                  Clearing this device binding allows the user’s next login device to automatically register as their new primary device. This action is logged as <span className="font-mono text-indigo-300">DEVICE_RESET_BY_ADMIN</span>.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Admin Reset Note (Optional)
                </label>
                <input
                  type="text"
                  value={vipResetReasonInput}
                  onChange={(e) => setVipResetReasonInput(e.target.value)}
                  placeholder="e.g. User changed phone or reinstalled browser"
                  className="w-full bg-[#080D19] border border-slate-800 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isResettingVipDevice}
                  onClick={() => setUserPendingVipDeviceReset(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isResettingVipDevice}
                  onClick={handleConfirmResetVipDevice}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold flex items-center gap-1.5"
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
  );
};
