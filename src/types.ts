import type {
  AdminSectionKey,
  AdminActionKey,
  AdminSectionPermission,
  AdminSectionDefinition,
  VipFeatureKey,
  VipFeatureToggleConfig,
  VipFeatureManagementState,
  StudyStreakRecord,
  ExamScheduleRecord,
  StudyTimetableItem,
  LearningResourceRecord,
  StudentResourceInteraction,
  VipAnnouncementRecord,
  VipMockTestQuestion,
  VipMockTestRecord,
  VipMockTestAttempt,
  PrioritySupportReply,
  PrioritySupportTicket,
  VipReferralRecord,
  ReferralDiscountConfig,
  UserReferralPermissions,
  ReferrerSalesSummaryReport,
  ReferralPricePreview,
  StudentNotificationRecord,
  AdminAuditLogRecord,
  AuditActionType,
  StudentAchievementBadge,
} from './constants/masterUpgrade.ts';

export type {
  AdminSectionKey,
  AdminActionKey,
  AdminSectionPermission,
  AdminSectionDefinition,
  VipFeatureKey,
  VipFeatureToggleConfig,
  VipFeatureManagementState,
  StudyStreakRecord,
  ExamScheduleRecord,
  StudyTimetableItem,
  LearningResourceRecord,
  StudentResourceInteraction,
  VipAnnouncementRecord,
  VipMockTestQuestion,
  VipMockTestRecord,
  VipMockTestAttempt,
  PrioritySupportReply,
  PrioritySupportTicket,
  VipReferralRecord,
  ReferralDiscountConfig,
  UserReferralPermissions,
  ReferrerSalesSummaryReport,
  ReferralPricePreview,
  StudentNotificationRecord,
  AdminAuditLogRecord,
  AuditActionType,
  StudentAchievementBadge,
};

export type TabType = 'home' | 'vip' | 'profile' | 'vip_dashboard' | 'admin';

export type UserRole = 'user' | 'admin' | 'super_admin';

export interface UserProfile {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  vip_active: boolean;
  vip_plan_title?: string | null;
  vip_expires_at: string | null;
  vip_allowed_platform_ids?: string[];
  vip_platform_expiries?: Record<string, string>;
  vip_grace_until?: string | null;
  vip_membership_state?: 'active' | 'expiring_soon' | 'grace_period' | 'expired' | 'none';
  free_access_expires_at?: string | null;
  free_access_active?: boolean;
  is_blocked?: boolean;
  blocked_at?: string | null;
  blocked_reason?: string | null;
  blocked_by?: string | null;
  vip_bound_device_id?: string | null;
  vip_bound_session_id?: string | null;
  vip_device_label?: string | null;
  vip_device_bound_at?: string | null;
  vip_device_last_seen_at?: string | null;
  vip_device_last_ip?: string | null;
  vip_device_last_ua?: string | null;
  vip_device_reset_count?: number;
  vip_device_last_reset_at?: string | null;
  vip_device_last_reset_by?: string | null;
  vip_sharing_attempt_count?: number;
  vip_sharing_attempts_blocked?: number;
  vip_last_sharing_attempt_at?: string | null;
  vip_device_status?: 'bound_current' | 'bound_other' | 'unbound' | 'not_vip';
  referral_code?: string;
  referred_by_user_id?: string | null;
  referred_by_code?: string | null;
  referred_at?: string | null;
  bonus_vip_days?: number;
  admin_permissions?: Record<AdminSectionKey, AdminSectionPermission>;
  referral_permissions?: UserReferralPermissions;
  server_time?: string;
  created_at: string;
  last_login_at: string | null;
  last_study_activity_at?: string | null;
  total_study_activities?: number;
  learner_activity_status?: 'active_learner' | 'no_study_activity' | 'inactive_30d';
}

export interface Platform {
  id: string;
  name: string;
  category: string;
  logo_url: string;
  target_url: string;
  access_type: 'normal' | 'vip';
  vip_target_url?: string;
  status: 'active' | 'inactive';
  is_visible: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface VipBatch {
  id: string;
  name: string;
  category: string;
  logo_url: string;
  is_locked: boolean;
  display_order: number;
  created_at: string;
}

export interface VipPlan {
  id: string;
  title: string;
  plan_scope?: 'single_platform' | 'all_platforms';
  price_inr: number;
  original_price_inr?: number;
  duration_days: number;
  duration_months?: number;
  bonus_days?: number;
  discount_label?: string;
  badge_label: string;
  description: string;
  features: string[];
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export type PopupFrequency =
  | 'every_launch'
  | 'every_visit'
  | 'once_per_session'
  | 'once_per_day'
  | 'once_per_user'
  | 'disabled';

export type CustomPopupFrequency = PopupFrequency;

export type AppThemePreset = 'red' | 'yellow' | 'pale_white_pink' | 'blue' | 'emerald';

export interface PublicSettings {
  key_generation_enabled: boolean;
  shortener_url: string;
  tutorial_video_url: string;
  telegram_channel_url: string;
  study_blunder_telegram_url?: string;
  study_blunder_telegram_label?: string;
  study_fox_telegram_url?: string;
  study_fox_telegram_label?: string;
  telegram_popup_enabled: boolean;
  telegram_popup_title?: string;
  telegram_popup_message?: string;
  telegram_popup_button_text?: string;
  telegram_popup_close_text?: string;
  telegram_popup_reminder_text?: string;
  telegram_popup_frequency?: PopupFrequency;
  telegram_popup_show_on_resume?: boolean;
  maintenance_mode: boolean;
  login_enabled: boolean;
  key_expiry_hours: number;
  free_access_duration?: number;
  free_access_unit?: 'minutes' | 'hours' | 'days';
  vip_purchase_url: string;
  vip_telegram_url?: string;
  vip_payment_qr_url?: string;
  vip_payment_amount?: number;
  vip_payment_instructions?: string;
  vip_payment_utr_required?: boolean;
  home_single_vip_label?: string;
  home_single_vip_price?: number;
  home_single_vip_duration_days?: number;
  home_single_vip_destination?: 'in_app_single_vip' | 'custom_url';
  home_single_vip_url?: string;
  home_all_vip_label?: string;
  home_all_vip_price?: number;
  home_all_vip_duration_days?: number;
  home_all_vip_destination?: 'in_app_all_vip' | 'custom_url';
  home_all_vip_url?: string;
  vip_grace_period_hours?: number;
  referral_reward_days?: number;
  referral_program_enabled?: boolean;
  referral_discount_config?: ReferralDiscountConfig;
  app_name?: string;
  app_logo_url?: string;
  app_theme_preset?: AppThemePreset;
  theme_primary?: string;
  theme_secondary?: string;
  theme_background?: string;
  theme_text?: string;
  theme_button?: string;
  vip_theme_background?: string;
  vip_theme_card?: string;
  vip_theme_accent?: string;
  vip_theme_text?: string;
  vip_theme_button?: string;
  vip_theme_border?: string;
  // Announcement Slider Settings
  announcement_slider_enabled?: boolean;
  announcement_slide_interval_seconds?: number;
  // Support Settings
  support_enabled?: boolean;
  support_url?: string;
  support_title?: string;
  support_button_label?: string;
  support_description?: string;
  support_image_url?: string;
  // Donation Settings
  donation_enabled?: boolean;
  donation_url?: string;
  donation_button_text?: string;
  donation_title?: string;
  donation_message?: string;
  donation_description?: string;
  donation_qr_url?: string;
  // Custom Popup Settings
  custom_popup_enabled?: boolean;
  custom_popup_title?: string;
  custom_popup_message?: string;
  custom_popup_image_url?: string;
  custom_popup_button_text?: string;
  custom_popup_button_url?: string;
  custom_popup_close_text?: string;
  custom_popup_start_date?: string | null;
  custom_popup_end_date?: string | null;
  custom_popup_frequency?: PopupFrequency;
  // Data Retention Settings
  data_retention_days?: number;
  retention_login_history_days?: number;
  retention_expired_keys_days?: number;
  retention_failed_payments_days?: number;
  // Festival Decoration Manager Settings
  festival_decorations_enabled?: boolean;
  active_festival_id?: string | null;
  festival_configs_json?: Record<string, any>;
  festival_version?: number;
  updated_at?: string;
}

export interface AdminSettings extends PublicSettings {
  updated_at?: string;
}

export type {
  FestivalId,
  FestivalTargetScreen,
  FestivalAnimationSpeed,
  FestivalDecorationSize,
  FestivalCustomAssets,
  FestivalDecorationConfig,
  ActiveFestivalResponse,
  AdminFestivalManagerResponse,
} from './constants/festivals.ts';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  link_url?: string;
  is_published: boolean;
  display_order?: number;
  start_date?: string | null;
  end_date?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface LoginHistoryEntry {
  id: string;
  user_id: string;
  email: string;
  ip_address: string;
  user_agent: string;
  status: 'success' | 'failed' | 'DEVICE_MISMATCH_BLOCKED' | 'DEVICE_RESET_BY_ADMIN';
  timestamp: string;
}

export interface PaymentRecord {
  id: string;
  request_id?: string;
  purchase_source?: 'pre_key' | 'in_app';
  user_id: string;
  email: string;
  submitted_email?: string;
  plan_id: string;
  plan_title: string;
  vip_scope?: 'all_platforms' | 'single_platform';
  selected_platform_id?: string | null;
  selected_platform_name?: string | null;
  plan_duration_days?: number;
  bonus_days_applied?: number;
  original_plan_price?: number;
  referral_discount_applied?: number;
  referral_code_used?: string | null;
  referrer_user_id?: string | null;
  amount: number;
  expected_amount?: number;
  amount_mismatch?: boolean;
  currency: string;
  status: 'pending' | 'pending_verification' | 'approved' | 'completed' | 'failed' | 'rejected';
  status_label?: string;
  transaction_reference: string;
  screenshot_url?: string;
  screenshot_storage_path?: string;
  payment_method?: 'qr_verification' | 'telegram' | 'manual';
  rejection_reason?: string | null;
  admin_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export type FeedbackCategory =
  | 'General Feedback'
  | 'Bug Report'
  | 'Platform Issue'
  | 'VIP Membership'
  | 'Payment Issue'
  | 'Feature Request'
  | 'Other';

export type FeedbackStatus = 'New' | 'In Review' | 'Resolved' | 'Rejected';

export interface UserFeedbackRecord {
  id: string;
  user_id: string;
  user_email: string;
  is_vip_at_submission: boolean;
  category: FeedbackCategory;
  rating: number;
  message: string;
  attachment_url?: string | null;
  attachment_storage_path?: string | null;
  status: FeedbackStatus;
  admin_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface KeyRecord {
  id: string;
  user_id: string;
  user_email: string;
  token?: string;
  shortener_url: string;
  generated_at: string;
  expires_at: string;
  status: 'active' | 'expired' | 'revoked';
  redeemed?: boolean;
  redeemed_at?: string | null;
}

export interface DashboardStats {
  total_users: number;
  active_vips: number;
  active_keys: number;
  total_platforms: number;
  active_platforms: number;
  total_plans: number;
  total_payments: number;
  recent_logins_count: number;
}

export interface VipDeviceLog {
  id: string;
  user_id: string;
  email: string;
  event_type:
    | 'device_bound'
    | 'device_mismatch_blocked'
    | 'device_reset_by_admin'
    | 'vip_session_replaced'
    | 'vip_activated';
  attempted_device_id: string;
  bound_device_id?: string | null;
  device_label: string;
  ip_address: string;
  user_agent: string;
  admin_id?: string | null;
  reason?: string | null;
  details?: string | null;
  timestamp: string;
}

export type CleanupOperationType =
  | 'keys_expired'
  | 'keys_expired_revoked'
  | 'keys_older_than'
  | 'keys_all'
  | 'login_history_old'
  | 'login_history_older_than'
  | 'login_history_all'
  | 'announcements_expired'
  | 'announcements_expired_disabled'
  | 'announcements_all'
  | 'payments_old'
  | 'payments_failed_pending'
  | 'payments_all_non_completed'
  | 'vip_expired'
  | 'vip_clear_expired'
  | 'vip_device_logs_all'
  | 'vip_device_logs_old'
  | 'platforms_inactive'
  | 'plans_inactive'
  | 'users_inactive'
  | 'users_expired_inactive'
  | 'users_expired_free_access'
  | 'storage_unused_assets'
  | 'storage_orphaned_files';

export interface CleanupPreviewResponse {
  operation: CleanupOperationType;
  label: string;
  affected_count: number;
  count: number;
  total_in_section?: number;
  protected_count?: number;
  permanent: boolean;
  description: string;
  requires_super_admin: boolean;
  details?: string[];
  sample_items?: string[];
}

export interface PlatformUsageLog {
  id: string;
  platform_id: string;
  platform_name?: string;
  user_id: string;
  user_email?: string;
  opened_at: string;
}

export interface PlatformUsageStat {
  platform_id: string;
  platform_name: string;
  category: string;
  logo_url: string;
  status: 'active' | 'inactive';
  access_type: 'normal' | 'vip';
  today_opens: number;
  yesterday_opens: number;
  last_7_days_opens: number;
  last_30_days_opens: number;
  total_opens: number;
  filtered_opens: number;
  last_opened_at: string | null;
}

export interface PlatformLogsSummaryResponse {
  timezone: string;
  summary: {
    total_platforms: number;
    opens_today: number;
    opens_last_7_days: number;
    total_recorded_opens: number;
  };
  platforms: PlatformUsageStat[];
  pagination: {
    page: number;
    limit: number;
    total_items: number;
    total_pages: number;
  };
}

export interface PlatformUsageHistoryResponse {
  timezone: string;
  platform: {
    id: string;
    name: string;
    category: string;
    logo_url: string;
    status: 'active' | 'inactive';
    access_type: 'normal' | 'vip';
  };
  stats: PlatformUsageStat;
  daily_breakdown: { date: string; count: number }[];
  logs: PlatformUsageLog[];
  pagination: {
    page: number;
    limit: number;
    total_items: number;
    total_pages: number;
  };
}

// Master Upgrade Response Interfaces & Type Aliases
export type SmartNotification = StudentNotificationRecord;
export type StudyStreakState = StudyStreakRecord;
export type ExamRecord = ExamScheduleRecord;
export type LearningLibraryResource = LearningResourceRecord;
export type VipExclusiveAnnouncement = VipAnnouncementRecord;
export type VipMockTest = VipMockTestRecord;
export type ReferralRecord = VipReferralRecord;
export type AdminSectionPermissionRecord = AdminSectionPermission;
export type AdminPermissionHistoryEntry = AdminAuditLogRecord;
export type AdminAuditLogEntry = AdminAuditLogRecord;
export type VipFeatureConfig = VipFeatureToggleConfig;

export interface VipStudentHubData {
  feature_state: VipFeatureManagementState;
  user: UserProfile;
  streak: StudyStreakRecord;
  achievements: StudentAchievementBadge[];
  exams: ExamScheduleRecord[];
  timetable: StudyTimetableItem[];
  learning_library: LearningResourceRecord[];
  exclusive_resources: LearningResourceRecord[];
  resource_interactions: StudentResourceInteraction[];
  vip_announcements: VipAnnouncementRecord[];
  mock_tests: VipMockTestRecord[];
  mock_attempts: VipMockTestAttempt[];
  support_tickets: PrioritySupportTicket[];
  referrals: VipReferralRecord[];
  referral_code: string;
  referral_program_enabled?: boolean;
  referral_permissions?: UserReferralPermissions;
  referral_sales_summary?: ReferrerSalesSummaryReport;
  total_platforms: number;
  vip_platforms_count: number;
  my_payments: PaymentRecord[];
  recent_platform_opens: {
    id: string;
    platform_id: string;
    platform_name: string;
    category: string;
    opened_at: string;
  }[];
}

export interface AdminReferralManagementResponse {
  referral_program_enabled: boolean;
  discount_config: ReferralDiscountConfig;
  global_summary: {
    total_referrers: number;
    total_referrals: number;
    registered_referrals: number;
    approved_vip_purchases: number;
    pending_vip_purchases: number;
    rejected_vip_purchases: number;
    non_purchasing_referrals: number;
    verified_gross_sales_inr: number;
    total_discounts_given_inr: number;
    net_collected_amount_inr: number;
    verified_net_sales_inr: number;
    total_reward_days_granted: number;
  };
  global_metrics: {
    total_referrers: number;
    total_referrals: number;
    registered_referrals: number;
    approved_vip_purchases: number;
    pending_vip_purchases: number;
    rejected_vip_purchases: number;
    non_purchasing_referrals: number;
    verified_gross_sales_inr: number;
    total_discounts_given_inr: number;
    net_collected_amount_inr: number;
    verified_net_sales_inr: number;
    total_reward_days_granted: number;
  };
  referrer_reports: ReferrerSalesSummaryReport[];
  leaderboard?: ReferrerSalesSummaryReport[];
  all_records: VipReferralRecord[];
  referrals: VipReferralRecord[];
  accounts_directory: {
    id: string;
    name?: string;
    email: string;
    role: UserRole;
    referral_code: string;
    created_at?: string;
    last_login_at?: string | null;
    vip_active?: boolean;
    vip_expires_at?: string | null;
    is_blocked?: boolean;
    referred_by_code?: string | null;
    referred_by_user_id?: string | null;
    bonus_vip_days?: number;
    total_referrals?: number;
    vip_purchases_count?: number;
    approved_vip_purchases?: number;
    reward_days_earned?: number;
    verified_net_sales_inr?: number;
    permissions: UserReferralPermissions;
    referral_permissions: UserReferralPermissions;
  }[];
  users: {
    id: string;
    name?: string;
    email: string;
    role: UserRole;
    referral_code: string;
    created_at?: string;
    last_login_at?: string | null;
    vip_active?: boolean;
    vip_expires_at?: string | null;
    is_blocked?: boolean;
    referred_by_code?: string | null;
    referred_by_user_id?: string | null;
    bonus_vip_days?: number;
    total_referrals?: number;
    vip_purchases_count?: number;
    approved_vip_purchases?: number;
    reward_days_earned?: number;
    verified_net_sales_inr?: number;
    permissions: UserReferralPermissions;
    referral_permissions: UserReferralPermissions;
  }[];
}

export interface AdvancedAdminAnalyticsResponse {
  generated_at: string;
  users: {
    total: number;
    new_today: number;
    new_this_week: number;
    new_this_month: number;
    active: number;
    blocked: number;
  };
  vip: {
    active_vips: number;
    expiring_within_7_days: number;
    expired_vips: number;
    pre_key_purchases: number;
    in_app_purchases: number;
    plan_popularity: { title: string; count: number; revenue: number }[];
  };
  payments: {
    total_approved_revenue: number;
    today_revenue: number;
    monthly_revenue: number;
    approved_count: number;
    pending_count: number;
    rejected_count: number;
  };
  platforms: {
    total_platforms: number;
    total_opens: number;
    vip_opens: number;
    free_opens: number;
    most_used: PlatformUsageStat[];
    least_used: PlatformUsageStat[];
  };
  student_activity: {
    active_streaks: number;
    milestone_7_days: number;
    milestone_30_days: number;
    total_exams_tracked: number;
    completed_library_resources: number;
    bookmarked_resources: number;
    mock_test_attempts: number;
  };
  vip_feature_usage: {
    feature_key: VipFeatureKey;
    name: string;
    is_enabled: boolean;
    usage_count: number;
  }[];
}

export interface DatabaseBackupSnapshot {
  backup_id: string;
  label: string;
  created_at: string;
  created_by: string;
  sha256_checksum: string;
  size_bytes: number;
  record_counts: Record<string, number>;
}

export interface StudentExamTimer {
  user_id: string;
  exam_name: string;
  exam_datetime: string;
  updated_at: string;
}

export interface OfferBoardItem {
  id: string;
  title: string;
  subtitle?: string;
  image_url: string;
  link_url?: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DailyMotivationItem {
  day_number: number; // 1 to 30
  quote: string;
  author?: string;
  image_url?: string;
  updated_at?: string;
}

export interface StudentXpRecord {
  user_id: string;
  xp_total: number;
  weekly_xp: number;
  weekly_key: string;
  daily_streak: number;
  last_login_date: string | null;
  total_login_days: number;
  updated_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  xp_total: number;
  daily_streak: number;
  total_login_days: number;
  is_vip: boolean;
  is_me?: boolean;
}

export interface LeaderboardResponse {
  top_students: LeaderboardEntry[];
  my_rank: number | null;
  my_xp: number;
  my_streak: number;
  daily_xp_claimed_today: boolean;
  daily_xp_awarded_now?: number;
  total_ranked_students: number;
  today_ist: string;
}

export interface StudentStudyLog {
  id: string;
  user_id: string;
  minutes: number;
  source: 'timer' | 'manual' | 'platform';
  note?: string;
  logged_at: string;
  date_ist: string;
}

export interface ParentReportSettings {
  user_id: string;
  parent_name: string;
  parent_whatsapp: string;
  parent_email?: string;
  auto_sunday_enabled: boolean;
  updated_at: string;
}

export interface ParentsReportCardData {
  student_name: string;
  student_email: string;
  week_start_ist: string;
  week_end_ist: string;
  is_sunday_ist: boolean;
  next_sunday_ist: string;
  study_minutes_week: number;
  study_hours_week: number;
  study_sessions_count: number;
  quizzes_taken_week: number;
  quiz_marks_obtained: number;
  quiz_total_marks: number;
  quiz_avg_percentage: number;
  leaderboard_rank: number | null;
  total_ranked_students: number;
  total_xp: number;
  weekly_xp: number;
  daily_streak: number;
  parent_settings: ParentReportSettings;
  recent_study_logs: StudentStudyLog[];
  share_text: string;
  whatsapp_url: string;
}


