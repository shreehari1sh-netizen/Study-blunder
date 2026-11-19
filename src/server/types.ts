import type {
  AdminSectionKey,
  AdminSectionPermission,
  VipFeatureKey,
  VipFeatureToggleConfig,
  VipFeatureManagementState,
  StudyStreakRecord,
  ExamScheduleRecord,
  StudyTimetableItem,
  LearningResourceRecord,
  StudentResourceInteraction,
  VipAnnouncementRecord,
  VipMockTestRecord,
  VipMockTestAttempt,
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
} from '../constants/masterUpgrade.ts';

export type {
  AdminSectionKey,
  AdminSectionPermission,
  VipFeatureKey,
  VipFeatureToggleConfig,
  VipFeatureManagementState,
  StudyStreakRecord,
  ExamScheduleRecord,
  StudyTimetableItem,
  LearningResourceRecord,
  StudentResourceInteraction,
  VipAnnouncementRecord,
  VipMockTestRecord,
  VipMockTestAttempt,
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

export type UserRole = 'user' | 'admin' | 'super_admin';

export interface User {
  id: string;
  name?: string;
  email: string;
  password_hash: string;
  role: UserRole;
  vip_active: boolean;
  vip_expires_at: string | null;
  vip_grace_until?: string | null;
  free_access_expires_at?: string | null;
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
  vip_last_sharing_attempt_at?: string | null;
  referral_code?: string;
  referred_by_user_id?: string | null;
  referred_by_code?: string | null;
  referred_at?: string | null;
  bonus_vip_days?: number;
  created_at: string;
  last_login_at: string | null;
}

export interface UserPublicProfile {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  vip_active: boolean;
  vip_expires_at: string | null;
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

export interface AppSettings {
  key_generation_enabled: boolean;
  shortener_url: string;
  tutorial_video_url: string;
  telegram_channel_url: string;
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
  vip_grace_period_hours?: number;
  referral_reward_days?: number;
  referral_program_enabled?: boolean;
  referral_discount_config?: ReferralDiscountConfig;
  app_name?: string;
  app_logo_url?: string;
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
  updated_at: string;
}

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
  timestamp: string;
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

