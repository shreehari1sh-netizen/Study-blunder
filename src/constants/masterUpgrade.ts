export type AdminSectionKey =
  | 'dashboard'
  | 'platforms'
  | 'users'
  | 'payments'
  | 'announcements'
  | 'vip'
  | 'keys'
  | 'settings'
  | 'history'
  | 'festivals'
  | 'feedback'
  | 'platform_logs'
  | 'admin_control'
  | 'vip_features'
  | 'advanced_analytics'
  | 'audit_logs'
  | 'backup_recovery'
  | 'referral_management';

export type AdminActionKey = 'view' | 'add' | 'edit' | 'delete' | 'approve' | 'reject';

export interface AdminSectionPermission {
  section_key: AdminSectionKey;
  enabled: boolean;
  actions: {
    view: boolean;
    add: boolean;
    edit: boolean;
    delete: boolean;
    approve: boolean;
    reject: boolean;
  };
  updated_by?: string;
  updated_at?: string;
}

export interface AdminSectionDefinition {
  key: AdminSectionKey;
  label: string;
  description: string;
  normalAdminDefault: boolean;
  superAdminOnly?: boolean;
  supportedActions: AdminActionKey[];
}

export const ADMIN_SECTIONS_REGISTRY: AdminSectionDefinition[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Overview statistics and system health metrics',
    normalAdminDefault: true,
    supportedActions: ['view'],
  },
  {
    key: 'platforms',
    label: 'Platform',
    description: 'Manage educational platforms, links, logos, and access types',
    normalAdminDefault: true,
    supportedActions: ['view', 'add', 'edit', 'delete'],
  },
  {
    key: 'users',
    label: 'User Management',
    description: 'Search users, manage VIP status, block/unblock, and reset device binding',
    normalAdminDefault: true,
    supportedActions: ['view', 'add', 'edit', 'delete'],
  },
  {
    key: 'payments',
    label: 'Payment Management',
    description: 'Review payment proofs, verify UTRs, approve or reject VIP claims',
    normalAdminDefault: true,
    supportedActions: ['view', 'add', 'edit', 'delete', 'approve', 'reject'],
  },
  {
    key: 'announcements',
    label: 'Announcements',
    description: 'Publish and schedule home screen and VIP announcements',
    normalAdminDefault: true,
    supportedActions: ['view', 'add', 'edit', 'delete'],
  },
  {
    key: 'vip',
    label: 'VIP Management',
    description: 'Configure VIP plans, pricing, discounts, bonus days, and VIP batches',
    normalAdminDefault: false,
    supportedActions: ['view', 'add', 'edit', 'delete'],
  },
  {
    key: 'keys',
    label: 'Key Management',
    description: 'Manage VPLINK shortener settings, key duration, and active student keys',
    normalAdminDefault: false,
    supportedActions: ['view', 'edit', 'delete'],
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Configure app branding, QR codes, Telegram links, popups, and maintenance',
    normalAdminDefault: false,
    supportedActions: ['view', 'edit'],
  },
  {
    key: 'history',
    label: 'Login History',
    description: 'Inspect student and admin authentication logs and device security events',
    normalAdminDefault: false,
    supportedActions: ['view', 'delete'],
  },
  {
    key: 'festivals',
    label: 'Festival Decoration Manager',
    description: 'Control festival animations, schedules, and visual effects',
    normalAdminDefault: false,
    supportedActions: ['view', 'edit'],
  },
  {
    key: 'feedback',
    label: 'Feedback Management',
    description: 'Review student feedback, ratings, attachments, and update resolution status',
    normalAdminDefault: false,
    supportedActions: ['view', 'edit', 'delete', 'approve', 'reject'],
  },
  {
    key: 'platform_logs',
    label: 'Platform Log',
    description: 'View platform click analytics and student access logs',
    normalAdminDefault: false,
    supportedActions: ['view'],
  },
  {
    key: 'admin_control',
    label: 'Admin Control',
    description: 'Manage Normal Admin section permissions, action privileges, and roles',
    normalAdminDefault: false,
    superAdminOnly: true,
    supportedActions: ['view', 'add', 'edit', 'delete'],
  },
  {
    key: 'vip_features',
    label: 'VIP Feature Management',
    description: 'Control the Global VIP Master Switch, 14 VIP Student Feature switches, and VIP content',
    normalAdminDefault: false,
    superAdminOnly: true,
    supportedActions: ['view', 'add', 'edit', 'delete'],
  },
  {
    key: 'advanced_analytics',
    label: 'Advanced Analytics',
    description: 'Comprehensive User, VIP, Payment, Platform, and Student Activity analytics',
    normalAdminDefault: false,
    supportedActions: ['view'],
  },
  {
    key: 'audit_logs',
    label: 'Audit Log',
    description: 'Immutable security audit trail of all administrative actions',
    normalAdminDefault: false,
    superAdminOnly: true,
    supportedActions: ['view'],
  },
  {
    key: 'backup_recovery',
    label: 'Backup & Recovery',
    description: 'Create verified database snapshots, verify integrity, and safely restore records',
    normalAdminDefault: false,
    superAdminOnly: true,
    supportedActions: ['view', 'add', 'edit'],
  },
  {
    key: 'referral_management',
    label: 'Referral Management',
    description: 'Control Global Referral Switch, individual referrer permissions, per-referrer sales reports, and referral discounts',
    normalAdminDefault: false,
    superAdminOnly: false,
    supportedActions: ['view', 'add', 'edit', 'delete', 'approve', 'reject'],
  },
];

export function getDefaultNormalAdminPermissions(): Record<AdminSectionKey, AdminSectionPermission> {
  const now = new Date().toISOString();
  const map = {} as Record<AdminSectionKey, AdminSectionPermission>;
  for (const def of ADMIN_SECTIONS_REGISTRY) {
    const allowed = Boolean(def.normalAdminDefault && !def.superAdminOnly);
    map[def.key] = {
      section_key: def.key,
      enabled: allowed,
      actions: {
        view: allowed && def.supportedActions.includes('view'),
        add: allowed && def.supportedActions.includes('add'),
        edit: allowed && def.supportedActions.includes('edit'),
        delete: allowed && def.supportedActions.includes('delete'),
        approve: allowed && def.supportedActions.includes('approve'),
        reject: allowed && def.supportedActions.includes('reject'),
      },
      updated_by: 'system_default',
      updated_at: now,
    };
  }
  return map;
}

export function getFullSuperAdminPermissions(): Record<AdminSectionKey, AdminSectionPermission> {
  const now = new Date().toISOString();
  const map = {} as Record<AdminSectionKey, AdminSectionPermission>;
  for (const def of ADMIN_SECTIONS_REGISTRY) {
    map[def.key] = {
      section_key: def.key,
      enabled: true,
      actions: {
        view: true,
        add: true,
        edit: true,
        delete: true,
        approve: true,
        reject: true,
      },
      updated_by: 'super_admin',
      updated_at: now,
    };
  }
  return map;
}

// ---------------------------------------------------------------------------
// PART 2 & 3: 14 VIP STUDENT FEATURES REGISTRY
// ---------------------------------------------------------------------------

export type VipFeatureKey =
  | 'vip_dashboard'
  | 'daily_study_streak'
  | 'exam_counter'
  | 'study_analytics'
  | 'achievements_rewards'
  | 'learning_library'
  | 'vip_membership_center'
  | 'vip_announcements'
  | 'study_timetable'
  | 'exam_reminders'
  | 'vip_mock_tests'
  | 'priority_support'
  | 'vip_referral_rewards'
  | 'exclusive_resources';

export interface VipFeatureToggleConfig {
  feature_key: VipFeatureKey;
  name: string;
  description: string;
  icon: string;
  is_enabled: boolean;
  display_order: number;
  updated_by: string;
  updated_at: string;
}

export interface VipFeatureManagementState {
  global_master_enabled: boolean;
  global_updated_by: string;
  global_updated_at: string;
  features: Record<VipFeatureKey, VipFeatureToggleConfig>;
}

export const VIP_FEATURES_DEFINITIONS: Omit<VipFeatureToggleConfig, 'is_enabled' | 'updated_by' | 'updated_at'>[] = [
  {
    feature_key: 'vip_dashboard',
    name: 'VIP Dashboard',
    description: 'Dedicated VIP overview with membership countdown, streak summary, upcoming exams, and recent activity.',
    icon: 'Crown',
    display_order: 1,
  },
  {
    feature_key: 'daily_study_streak',
    name: 'Daily Study Streak',
    description: 'Server-validated IST consecutive study-day tracker, activity calendar, and 7/30-day streak milestones.',
    icon: 'Flame',
    display_order: 2,
  },
  {
    feature_key: 'exam_counter',
    name: 'Exam Counter',
    description: 'Live Days/Hours/Minutes exam countdowns for both Admin common exams and Student personal exams.',
    icon: 'CalendarClock',
    display_order: 3,
  },
  {
    feature_key: 'study_analytics',
    name: 'Study Analytics',
    description: 'Verified platform launches, completed resources, subject focus, and weekly/monthly study trends.',
    icon: 'BarChart3',
    display_order: 4,
  },
  {
    feature_key: 'achievements_rewards',
    name: 'Achievements & Rewards',
    description: 'Unlockable student achievement badges for study streaks, resource completion, and exam planning.',
    icon: 'Award',
    display_order: 5,
  },
  {
    feature_key: 'learning_library',
    name: 'Learning Library',
    description: 'Curated study notes, PDFs, syllabus guides, practice sheets, bookmarks, and completion tracking.',
    icon: 'BookOpen',
    display_order: 6,
  },
  {
    feature_key: 'vip_membership_center',
    name: 'VIP Membership Center',
    description: 'Complete VIP plan status, expiry countdown, grace period protection, payment request history, and renewal.',
    icon: 'ShieldCheck',
    display_order: 7,
  },
  {
    feature_key: 'vip_announcements',
    name: 'VIP Announcements',
    description: 'Priority pinned notices, exam alerts, new resource updates, and exclusive VIP offers.',
    icon: 'Megaphone',
    display_order: 8,
  },
  {
    feature_key: 'study_timetable',
    name: 'Study Timetable',
    description: 'Personal daily & weekly study schedule planner with priority tags and task completion tracking.',
    icon: 'Calendar',
    display_order: 9,
  },
  {
    feature_key: 'exam_reminders',
    name: 'Exam Reminders',
    description: 'Automated 30d, 15d, 7d, 3d, 1d, and Exam-Day countdown reminders with custom student preferences.',
    icon: 'BellRing',
    display_order: 10,
  },
  {
    feature_key: 'vip_mock_tests',
    name: 'VIP Mock Tests',
    description: 'Timed MCQ practice tests with instant score calculation, detailed explanations, and attempt history.',
    icon: 'ClipboardCheck',
    display_order: 11,
  },
  {
    feature_key: 'priority_support',
    name: 'Priority Support',
    description: 'Fast-track VIP support tickets with priority queue status and direct administrator responses.',
    icon: 'Headphones',
    display_order: 12,
  },
  {
    feature_key: 'vip_referral_rewards',
    name: 'VIP Referral Rewards',
    description: 'Unique student referral code with anti-fraud verification and bonus VIP reward days.',
    icon: 'Gift',
    display_order: 13,
  },
  {
    feature_key: 'exclusive_resources',
    name: 'Exclusive Resources',
    description: 'VIP-only formula books, high-yield revision sheets, exam checklists, and top strategy guides.',
    icon: 'Sparkles',
    display_order: 14,
  },
];

export function getDefaultVipFeatureManagementState(): VipFeatureManagementState {
  const now = new Date().toISOString();
  const features = {} as Record<VipFeatureKey, VipFeatureToggleConfig>;
  for (const def of VIP_FEATURES_DEFINITIONS) {
    features[def.feature_key] = {
      ...def,
      is_enabled: true,
      updated_by: 'system_default',
      updated_at: now,
    };
  }
  return {
    global_master_enabled: true,
    global_updated_by: 'system_default',
    global_updated_at: now,
    features,
  };
}

// ---------------------------------------------------------------------------
// PART 3 & 4 DATA MODELS
// ---------------------------------------------------------------------------

export interface StudyStreakRecord {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_study_date_ist: string | null; // YYYY-MM-DD in Asia/Kolkata
  active_dates_ist: string[]; // Sorted list of YYYY-MM-DD dates
  total_study_actions: number;
  milestones_unlocked: string[]; // e.g., ['streak_7', 'streak_30']
  updated_at: string;
}

export interface ExamScheduleRecord {
  id: string;
  scope: 'global' | 'personal';
  user_id?: string | null; // null for global admin exams
  exam_name: string;
  exam_category: string;
  subject: string;
  exam_date: string; // ISO string
  target_score?: string;
  notes?: string;
  is_published: boolean;
  reminders_enabled?: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface StudyTimetableItem {
  id: string;
  user_id: string;
  subject: string;
  topic: string;
  day_of_week: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | 'Daily';
  start_time: string; // e.g. "09:00"
  end_time: string;   // e.g. "10:30"
  priority: 'High' | 'Medium' | 'Low';
  notes?: string;
  is_completed: boolean;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningResourceRecord {
  id: string;
  resource_group: 'learning_library' | 'exclusive_resources';
  title: string;
  category: 'Study Notes' | 'PDFs' | 'Practice Links' | 'Important Topics' | 'Syllabus Guides' | 'Exam Preparation' | 'Revision Sheets' | 'Formula Books' | 'Exam Checklists';
  subject: string;
  exam_type: string;
  description: string;
  content_url: string;
  badge_text?: string;
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface StudentResourceInteraction {
  id: string;
  user_id: string;
  resource_id: string;
  is_bookmarked: boolean;
  is_completed: boolean;
  last_accessed_at: string;
  completed_at?: string | null;
}

export interface VipAnnouncementRecord {
  id: string;
  title: string;
  content: string;
  category: 'Exam Alert' | 'New Resource' | 'Platform Update' | 'Important Notice' | 'VIP Offer';
  is_pinned: boolean;
  is_published: boolean;
  action_url?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VipMockTestQuestion {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface VipMockTestRecord {
  id: string;
  title: string;
  subject: string;
  exam_category: string;
  duration_minutes: number;
  questions: VipMockTestQuestion[];
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VipMockTestAttempt {
  id: string;
  test_id: string;
  test_title: string;
  user_id: string;
  user_email: string;
  score: number;
  total_questions: number;
  percentage: number;
  selected_answers: number[];
  time_taken_seconds: number;
  completed_at: string;
}

export interface PrioritySupportReply {
  id: string;
  sender_role: 'student' | 'admin' | 'super_admin';
  sender_email: string;
  message: string;
  created_at: string;
}

export interface PrioritySupportTicket {
  id: string;
  ticket_code: string; // e.g., SF-VIP-SUP-8192
  user_id: string;
  user_email: string;
  category: 'Technical Issue' | 'Payment Help' | 'Platform Access' | 'VIP Membership' | 'General Study Help';
  subject: string;
  message: string;
  attachment_url?: string | null;
  status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
  priority: 'VIP High' | 'Urgent';
  replies: PrioritySupportReply[];
  created_at: string;
  updated_at: string;
}

export interface VipReferralRecord {
  id: string;
  referrer_user_id: string;
  referrer_name?: string;
  referrer_email: string;
  referrer_role?: 'user' | 'admin' | 'super_admin';
  referrer_account_type?: 'user' | 'admin' | 'super_admin';
  referred_user_id: string;
  referred_name?: string;
  referred_email: string;
  referral_code: string;
  status: 'pending_verification' | 'qualified' | 'rewarded' | 'rejected_fraud';
  vip_purchase_status?: 'not_purchased' | 'pending' | 'pending_verification' | 'approved' | 'rejected';
  purchased_plan_id?: string | null;
  purchased_plan_title?: string | null;
  original_plan_price?: number;
  discount_applied?: number;
  final_amount_paid?: number;
  payment_request_id?: string | null;
  payment_verification_status?: 'none' | 'pending' | 'pending_verification' | 'approved' | 'rejected';
  vip_activation_status?: 'inactive' | 'active' | 'expired';
  vip_expires_at?: string | null;
  membership_expiry_date?: string | null;
  reward_status?: 'pending' | 'rewarded' | 'ineligible' | 'rejected';
  counted_in_referral_sales?: boolean;
  fraud_reason?: string | null;
  reward_days_granted: number;
  ip_address?: string;
  device_id?: string;
  created_at: string;
  registered_at?: string;
  registration_date?: string;
  qualified_at?: string | null;
  rewarded_at?: string | null;
}

export interface ReferralDiscountConfig {
  discount_enabled: boolean;
  discount_type: 'none' | 'percentage' | 'fixed';
  discount_value: number; // percentage (0-100) or fixed INR
  min_purchase_amount: number;
  max_discount_amount: number; // 0 = no cap
  eligible_plan_ids: string[]; // empty array = all active plans eligible unless in disabled_plan_ids
  disabled_plan_ids: string[];
  valid_from: string | null;
  valid_until: string | null;
  attribution_validity_days: number; // 0 = never expires until used, or N days from referral attribution
  usage_limit_per_user: number; // default 1 (one-time per referred user)
  combine_with_plan_discount: boolean;
  campaign_label: string;
  updated_by?: string;
  updated_at?: string;
}

export function getDefaultReferralDiscountConfig(): ReferralDiscountConfig {
  return {
    discount_enabled: true,
    discount_type: 'percentage',
    discount_value: 10,
    min_purchase_amount: 49,
    max_discount_amount: 100,
    eligible_plan_ids: [],
    disabled_plan_ids: [],
    valid_from: null,
    valid_until: null,
    attribution_validity_days: 0,
    usage_limit_per_user: 1,
    combine_with_plan_discount: true,
    campaign_label: 'Referral Welcome Offer',
    updated_by: 'system_default',
    updated_at: new Date().toISOString(),
  };
}

export interface UserReferralPermissions {
  user_id: string;
  can_access_referral_dashboard: boolean;
  can_view_own_referral_data: boolean;
  can_view_referral_sales: boolean;
  can_create_share_referral_link: boolean;
  can_manage_referral_settings: boolean;
  can_view_referral_reports: boolean;
  can_access_referral_management: boolean;
  updated_by: string;
  updated_at: string;
}

export function getDefaultUserReferralPermissions(userId: string, isSuperAdmin = false): UserReferralPermissions {
  return {
    user_id: userId,
    can_access_referral_dashboard: true,
    can_view_own_referral_data: true,
    can_view_referral_sales: true,
    can_create_share_referral_link: true,
    can_manage_referral_settings: isSuperAdmin,
    can_view_referral_reports: isSuperAdmin,
    can_access_referral_management: isSuperAdmin,
    updated_by: isSuperAdmin ? 'super_admin' : 'system_default',
    updated_at: new Date().toISOString(),
  };
}

export interface ReferrerSalesSummaryReport {
  referrer_user_id: string;
  referrer_name: string;
  referrer_email: string;
  referrer_role: 'user' | 'admin' | 'super_admin';
  referrer_account_type: 'user' | 'admin' | 'super_admin';
  referral_code: string;
  permissions: UserReferralPermissions;
  total_referrals: number;
  registered_referrals: number;
  vip_purchases: number;
  vip_purchases_count: number;
  non_purchasing_referrals: number;
  non_purchasing_referrals_count: number;
  pending_purchases: number;
  rejected_purchases: number;
  verified_gross_sales_inr: number;
  discounts_given_inr: number;
  total_discounts_given_inr: number;
  net_collected_amount_inr: number;
  verified_net_sales_inr: number;
  reward_days_earned: number;
  total_reward_days_granted?: number;
  records: VipReferralRecord[];
}

export interface ReferralPricePreview {
  plan_id: string;
  plan_title: string;
  original_plan_price: number;
  eligible: boolean;
  discount_eligible: boolean;
  discount_applied: number;
  referral_discount_applied: number;
  final_payable_amount: number;
  campaign_label?: string;
  discount_label?: string;
  referral_code_attributed?: string | null;
  referrer_email?: string | null;
  reason?: string;
}

export interface StudentNotificationRecord {
  id: string;
  user_id: string; // or 'ALL_VIP'
  type:
    | 'vip_activated'
    | 'payment_submitted'
    | 'payment_approved'
    | 'payment_rejected'
    | 'vip_expiry_reminder'
    | 'exam_countdown'
    | 'support_reply'
    | 'streak_milestone'
    | 'vip_announcement'
    | 'referral_reward';
  title: string;
  message: string;
  is_read: boolean;
  action_tab?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export type AuditActionType =
  | 'role_change'
  | 'permission_change'
  | 'vip_plan_change'
  | 'payment_approval'
  | 'payment_rejection'
  | 'manual_vip_grant'
  | 'vip_revocation'
  | 'global_vip_master_switch'
  | 'individual_vip_feature_switch'
  | 'vip_feature_order_change'
  | 'referral_program_switch'
  | 'referral_permission_change'
  | 'referral_discount_change'
  | 'test_account_cleanup'
  | 'platform_change'
  | 'announcement_change'
  | 'device_reset'
  | 'user_block_unblock'
  | 'user_blocked'
  | 'user_unblocked'
  | 'user_deleted'
  | 'user_edited'
  | 'bulk_delete'
  | 'permission_denied'
  | 'key_management_change'
  | 'festival_decoration_change'
  | 'feedback_moderation'
  | 'exam_schedule_change'
  | 'library_resource_change'
  | 'settings_change'
  | 'backup_restore_action';

export interface AdminAuditLogRecord {
  id: string;
  admin_id: string;
  admin_email: string;
  admin_role: string;
  action_type: AuditActionType;
  section: string;
  target_id: string;
  description: string;
  previous_value?: any;
  new_value?: any;
  status?: 'success' | 'failed';
  ip_address?: string;
  timestamp: string;
}

export interface StudentAchievementBadge {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlocked_at?: string | null;
  progress_text: string;
}

export function getInitialLearningResources(): LearningResourceRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'res_lib_1',
      resource_group: 'learning_library',
      title: 'Complete Physics Formula & Concept Handbook (Class 11 & 12)',
      category: 'Study Notes',
      subject: 'Physics',
      exam_type: 'JEE / NEET / Board Exams',
      description: 'Comprehensive chapter-wise derivations, SI units, dimensional formulas, and key problem-solving shortcuts.',
      content_url: 'https://ncert.nic.in/textbook.php',
      badge_text: 'High Yield',
      is_published: true,
      created_by: 'bhaskardattmishra0101@gmail.com',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'res_lib_2',
      resource_group: 'learning_library',
      title: 'Organic & Inorganic Chemistry Reaction Mechanisms Master Guide',
      category: 'Syllabus Guides',
      subject: 'Chemistry',
      exam_type: 'JEE / NEET',
      description: 'Named reactions, periodic table exceptions, coordination chemistry, and quick memory maps.',
      content_url: 'https://ncert.nic.in/textbook.php',
      badge_text: 'Updated 2026',
      is_published: true,
      created_by: 'bhaskardattmishra0101@gmail.com',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'res_lib_3',
      resource_group: 'learning_library',
      title: 'Calculus, Coordinate Geometry & Vectors Problem Set',
      category: 'Practice Links',
      subject: 'Mathematics',
      exam_type: 'JEE Main & Advanced',
      description: 'Curated PYQ patterns, integration reduction formulas, and 3D geometry quick reference.',
      content_url: 'https://ncert.nic.in/textbook.php',
      badge_text: 'Must Practice',
      is_published: true,
      created_by: 'bhaskardattmishra0101@gmail.com',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'res_excl_1',
      resource_group: 'exclusive_resources',
      title: 'VIP Rapid 14-Day Final Revision Checklist & Strategy Sheet',
      category: 'Exam Checklists',
      subject: 'All Subjects',
      exam_type: 'Competitive Exams',
      description: 'High-weightage topics checklist, negative-marking avoidance matrix, and exam-hall time allocation blueprint.',
      content_url: 'https://ncert.nic.in/exemplar-problems.php',
      badge_text: 'VIP Exclusive',
      is_published: true,
      created_by: 'bhaskardattmishra0101@gmail.com',
      created_at: now,
      updated_at: now,
    },
    {
      id: 'res_excl_2',
      resource_group: 'exclusive_resources',
      title: 'One-Page Master Formula Book (Physics, Chemistry & Maths)',
      category: 'Formula Books',
      subject: 'PCM / PCB',
      exam_type: 'All Entrance Exams',
      description: 'Condensed rapid-revision sheets designed for last-minute morning review before exams.',
      content_url: 'https://ncert.nic.in/exemplar-problems.php',
      badge_text: 'VIP Exclusive',
      is_published: true,
      created_by: 'bhaskardattmishra0101@gmail.com',
      created_at: now,
      updated_at: now,
    },
  ];
}

export function getInitialGlobalExams(): ExamScheduleRecord[] {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  return [
    {
      id: 'exam_global_1',
      scope: 'global',
      user_id: null,
      exam_name: 'JEE Main Session 1 Examination',
      exam_category: 'Engineering Entrance',
      subject: 'Physics, Chemistry, Mathematics',
      exam_date: new Date(now + 45 * 24 * 3600 * 1000).toISOString(),
      target_score: '99+ Percentile',
      notes: 'Official NTA Computer Based Test — focus on high-weightage NCERT & PYQ chapters.',
      is_published: true,
      reminders_enabled: true,
      created_by: 'bhaskardattmishra0101@gmail.com',
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'exam_global_2',
      scope: 'global',
      user_id: null,
      exam_name: 'NEET UG National Entrance Exam',
      exam_category: 'Medical Entrance',
      subject: 'Physics, Chemistry, Biology',
      exam_date: new Date(now + 75 * 24 * 3600 * 1000).toISOString(),
      target_score: '680+ / 720',
      notes: 'Complete NCERT line-by-line Biology & Chemistry revision + timed OMR practice.',
      is_published: true,
      reminders_enabled: true,
      created_by: 'bhaskardattmishra0101@gmail.com',
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: 'exam_global_3',
      scope: 'global',
      user_id: null,
      exam_name: 'CBSE / State Board Final Examinations',
      exam_category: 'Board Exams',
      subject: 'All Core Subjects',
      exam_date: new Date(now + 30 * 24 * 3600 * 1000).toISOString(),
      target_score: '95%+',
      notes: 'Practice sample papers and step-wise subjective answer presentation.',
      is_published: true,
      reminders_enabled: true,
      created_by: 'bhaskardattmishra0101@gmail.com',
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
}

export function getInitialVipMockTests(): VipMockTestRecord[] {
  const nowIso = new Date().toISOString();
  return [
    {
      id: 'mock_test_1',
      title: 'VIP High-Yield Physics & Chemistry Speed Diagnostic',
      subject: 'Physics & Chemistry',
      exam_category: 'JEE / NEET Foundation',
      duration_minutes: 15,
      is_published: true,
      created_by: 'bhaskardattmishra0101@gmail.com',
      created_at: nowIso,
      updated_at: nowIso,
      questions: [
        {
          id: 'q1',
          question: 'Which physical quantity has the dimensional formula [M L² T⁻²]?',
          options: ['Force', 'Work / Energy', 'Power', 'Linear Momentum'],
          correct_index: 1,
          explanation: 'Work = Force × Displacement = [M L T⁻²] × [L] = [M L² T⁻²], which is also the dimension of Energy and Torque.',
        },
        {
          id: 'q2',
          question: 'For an ideal gas undergoing an isothermal reversible expansion, which of the following is true?',
          options: ['ΔU = 0', 'ΔH ≠ 0', 'q = 0', 'w = 0'],
          correct_index: 0,
          explanation: 'Internal energy (U) of an ideal gas depends only on temperature. Since temperature is constant (ΔT = 0) in an isothermal process, ΔU = 0.',
        },
        {
          id: 'q3',
          question: 'If the radius of a current-carrying circular loop is doubled while keeping the current constant, the magnetic field at its center becomes:',
          options: ['Doubled', 'Halved', 'Four times', 'Unchanged'],
          correct_index: 1,
          explanation: 'Magnetic field at the center of a circular loop is B = μ₀I / (2R). Since B is inversely proportional to R, doubling R halves B.',
        },
        {
          id: 'q4',
          question: 'Which among the following molecules has zero dipole moment (μ = 0) due to symmetrical geometry?',
          options: ['NH₃', 'H₂O', 'BF₃', 'SO₂'],
          correct_index: 2,
          explanation: 'BF₃ has a symmetrical trigonal planar geometry (sp² hybridization) where the three B–F bond dipoles cancel out completely, resulting in μ = 0.',
        },
        {
          id: 'q5',
          question: 'The escape velocity from the surface of the Earth (radius R, acceleration due to gravity g) is given by:',
          options: ['√(gR)', '√(2gR)', '2√(gR)', '√(gR / 2)'],
          correct_index: 1,
          explanation: 'Equating kinetic energy (½mv²) to gravitational potential energy (GMm/R = mgR) gives v_e = √(2gR) ≈ 11.2 km/s.',
        },
      ],
    },
  ];
}
