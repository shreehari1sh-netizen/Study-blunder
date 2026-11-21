import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  User,
  Platform,
  VipBatch,
  VipPlan,
  AppThemePreset,
  AppSettings,
  Announcement,
  LoginHistoryEntry,
  PaymentRecord,
  KeyRecord,
  VipDeviceLog,
  PlatformUsageLog,
  PlatformUsageStat,
  PlatformLogsSummaryResponse,
  PlatformUsageHistoryResponse,
  UserFeedbackRecord,
  FeedbackCategory,
  FeedbackStatus,
  StudentExamTimer,
  OfferBoardItem,
  DailyMotivationItem,
  StudentXpRecord,
  LeaderboardEntry,
  LeaderboardResponse,
  StudentStudyLog,
  ParentReportSettings,
  ParentsReportCardData,
} from './types.ts';
import {
  ADMIN_SECTIONS_REGISTRY,
  VIP_FEATURES_DEFINITIONS,
  getDefaultNormalAdminPermissions,
  getFullSuperAdminPermissions,
  getDefaultVipFeatureManagementState,
  getDefaultReferralDiscountConfig,
  getDefaultUserReferralPermissions,
  getInitialLearningResources,
  getInitialGlobalExams,
  getInitialVipMockTests,
  type AdminSectionKey,
  type AdminActionKey,
  type AdminSectionPermission,
  type VipFeatureKey,
  type VipFeatureToggleConfig,
  type VipFeatureManagementState,
  type StudyStreakRecord,
  type ExamScheduleRecord,
  type StudyTimetableItem,
  type LearningResourceRecord,
  type StudentResourceInteraction,
  type VipAnnouncementRecord,
  type VipMockTestRecord,
  type VipMockTestAttempt,
  type PrioritySupportTicket,
  type VipReferralRecord,
  type ReferralDiscountConfig,
  type UserReferralPermissions,
  type ReferrerSalesSummaryReport,
  type ReferralPricePreview,
  type StudentNotificationRecord,
  type AdminAuditLogRecord,
  type AuditActionType,
  type StudentAchievementBadge,
} from '../constants/masterUpgrade.ts';
import {
  FESTIVAL_ORDER,
  isValidFestivalId,
  getDefaultFestivalConfig,
  normalizeSingleFestivalConfig,
  normalizeAllFestivalConfigs,
  istDatetimeLocalToIso,
  type FestivalId,
  type FestivalDecorationConfig,
  type ActiveFestivalResponse,
  type AdminFestivalManagerResponse,
} from '../constants/festivals.ts';

export const MIN_VPLINK_WAIT_SECONDS = 200;
export const MIN_VPLINK_WAIT_MS = MIN_VPLINK_WAIT_SECONDS * 1000;
export const DEFAULT_APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

export const ALLOWED_APP_THEME_PRESETS: readonly AppThemePreset[] = [
  'red',
  'yellow',
  'pale_white_pink',
  'blue',
  'emerald',
] as const;

export function normalizeAppThemePreset(value: unknown): AppThemePreset {
  const clean = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if ((ALLOWED_APP_THEME_PRESETS as readonly string[]).includes(clean)) {
    return clean as AppThemePreset;
  }
  return 'red';
}

export function formatDateInTimezone(dateOrIso: Date | string | number, timeZone = DEFAULT_APP_TIMEZONE): string {
  const d = typeof dateOrIso === 'object' ? dateOrIso : new Date(dateOrIso);
  if (isNaN(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch {
    // Fallback to IST offset (+05:30)
  }
  const istDate = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return istDate.toISOString().slice(0, 10);
}

export function shiftCalendarDate(yyyyMmDd: string, deltaDays: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return yyyyMmDd;
  const shifted = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return shifted.toISOString().slice(0, 10);
}


export interface PendingVerificationAttempt {
  id?: string;
  token: string;
  user_id: string;
  user_email: string;
  target_url: string;
  created_at: string;
  earliest_key_at?: string;
  expires_at: string;
  consumed: boolean;
  key_claimed?: boolean;
  claimed_key_id?: string | null;
  claimed_key_token?: string | null;
}

export function normalizeStoredKeyRecord(k: KeyRecord): KeyRecord {
  const rawToken = String(k.token || '').trim();
  let cleanToken = rawToken;
  let redeemed = k.redeemed !== undefined ? Boolean(k.redeemed) : true;

  if (rawToken.startsWith('UNREDEEMED:')) {
    cleanToken = rawToken.slice('UNREDEEMED:'.length).trim();
    redeemed = false;
  } else if (rawToken.startsWith('REDEEMED:')) {
    cleanToken = rawToken.slice('REDEEMED:'.length).trim();
    redeemed = true;
  }

  const isExpired = new Date(k.expires_at).getTime() <= Date.now();
  const status: 'active' | 'expired' | 'revoked' =
    k.status === 'revoked' ? 'revoked' : isExpired ? 'expired' : k.status || 'active';

  return {
    ...k,
    token: cleanToken,
    status,
    redeemed,
    redeemed_at: k.redeemed_at || (redeemed ? k.generated_at : null),
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'database.json');
const DATA_BACKUP_FILE = path.join(DATA_DIR, 'database.backup.json');
const DATA_TMP_FILE = path.join(DATA_DIR, 'database.json.tmp');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export function ensureUuid(id: string): string {
  if (!id) return crypto.randomUUID();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  const hash = crypto.createHash('md5').update(`studyfox_uuid_v1_${id}`).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16) + hash.substring(18, 20),
    hash.substring(20, 32),
  ].join('-').toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, combinedHash: string): boolean {
  try {
    const [salt, key] = combinedHash.split(':');
    if (!salt || !key) return false;
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(testHash, 'hex'));
  } catch {
    return false;
  }
}

export function isConfirmedTestOrDemoEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (
    [
      'superadmin@education.com',
      'admin@education.com',
      'student@education.com',
      'vipstudent@education.com',
      'platlog_test_1793302180667@example.com',
      'spamone234fake@gmail.com',
      'mithunikhil@examole.com',
    ].includes(clean)
  ) {
    return true;
  }
  if (clean.endsWith('@studyfox.test') || clean.startsWith('platlog_test_')) {
    return true;
  }
  return false;
}

interface DatabaseSchema {
  users: User[];
  platforms: Platform[];
  vip_batches: VipBatch[];
  vip_plans: VipPlan[];
  settings: AppSettings;
  announcements: Announcement[];
  login_history: LoginHistoryEntry[];
  payment_records: PaymentRecord[];
  key_records: KeyRecord[];
  vip_device_logs: VipDeviceLog[];
  platform_usage_logs: PlatformUsageLog[];
  user_feedback: UserFeedbackRecord[];
  pending_verifications?: PendingVerificationAttempt[];
  password_reset_tokens?: {
    id: string;
    token_hash: string;
    user_id: string;
    email: string;
    created_at: string;
    expires_at: string;
    used: boolean;
    used_at?: string | null;
  }[];
  // Master Upgrade Collections (Parts 2, 3, 4 & Additional Master Update)
  admin_permissions?: Record<string, Record<AdminSectionKey, AdminSectionPermission>>;
  user_referral_permissions?: Record<string, UserReferralPermissions>;
  vip_feature_state?: VipFeatureManagementState;
  study_streaks?: Record<string, StudyStreakRecord>;
  exam_schedules?: ExamScheduleRecord[];
  study_timetables?: StudyTimetableItem[];
  learning_resources?: LearningResourceRecord[];
  student_resource_interactions?: StudentResourceInteraction[];
  vip_announcements?: VipAnnouncementRecord[];
  vip_mock_tests?: VipMockTestRecord[];
  vip_mock_test_attempts?: VipMockTestAttempt[];
  priority_support_tickets?: PrioritySupportTicket[];
  vip_referrals?: VipReferralRecord[];
  student_notifications?: StudentNotificationRecord[];
  admin_audit_logs?: AdminAuditLogRecord[];
  vip_feature_usage_counts?: Record<string, number>;
  // Student Growth & Engagement Features
  offer_board?: OfferBoardItem[];
  daily_motivations?: DailyMotivationItem[];
  student_exam_timers?: Record<string, StudentExamTimer>;
  student_xp?: Record<string, StudentXpRecord>;
  student_study_logs?: StudentStudyLog[];
  parent_report_settings?: Record<string, ParentReportSettings>;
}

const DEFAULT_30_DAY_MOTIVATIONS: { quote: string; author: string }[] = [
  { quote: 'Sapne wo nahi jo neend me aate hain, sapne wo hain jo aapko sone nahi dete.', author: 'Dr. A.P.J. Abdul Kalam' },
  { quote: 'Roz thoda-thoda padhna ek din aapko topper bana deta hai — consistency hi asli power hai.', author: 'Study Blunder' },
  { quote: 'Aaj ka hard work kal ka rank banega. Ek ghanta aur focus karo!', author: 'Study Blunder' },
  { quote: 'Jab tak todenge nahi, tab tak chhodenge nahi. Apne exam goal par dhyan rakho.', author: 'Study Blunder' },
  { quote: 'Success kisi luck ka result nahi, roz ke disciplined revision ka result hota hai.', author: 'Study Blunder' },
  { quote: 'Har subah ek naya mauka hai apne kal se behtar banne ka.', author: 'Study Blunder' },
  { quote: 'Jo student roz practice karta hai, exam hall me wahi sabse calm rehta hai.', author: 'Study Blunder' },
  { quote: 'Distraction ko 60 minute ke liye door rakho, result khud bol uthega.', author: 'Study Blunder' },
  { quote: 'Chhote daily targets poore karo — bade exams apne aap crack ho jayenge.', author: 'Study Blunder' },
  { quote: 'Mushkil chapters se bhaago mat, wahi aapko baaki sabse aage nikalte hain.', author: 'Study Blunder' },
  { quote: 'Revision bina padhai adhoori hai — aaj 30 minute purane notes zaroor revise karo.', author: 'Study Blunder' },
  { quote: 'Apne parents ki muskaan yaad rakho, thakaan apne aap gayab ho jayegi.', author: 'Study Blunder' },
  { quote: 'Mock test me kam marks aana haar nahi hai, apni kamzori pehchanne ka best chance hai.', author: 'Study Blunder' },
  { quote: 'Aaj ka ek extra solved question exam me aapki rank hazaro upar le ja sakta hai.', author: 'Study Blunder' },
  { quote: 'Waqt sabke paas 24 ghante hi hai — farq bas is baat ka hai ki aap kitne focus se padhte hain.', author: 'Study Blunder' },
  { quote: 'Khud par bharosa rakho; jitni gehri taiyari hogi, utni badi jeet hogi.', author: 'Study Blunder' },
  { quote: 'Phone scroll karne se sirf time jata hai, notes padhne se future banta hai.', author: 'Study Blunder' },
  { quote: 'Ek din ka break bhi rhythm tod sakta hai — aaj kam se kam ek topic zaroor finish karo.', author: 'Study Blunder' },
  { quote: 'Smart study + consistent daily effort = guaranteed selection.', author: 'Study Blunder' },
  { quote: 'Galtiyon se daro mat; har galat sawal aapko exam ke sahi answer ke kareeb le jata hai.', author: 'Study Blunder' },
  { quote: 'Subah ki shanti me padha hua concept lambe samay tak yaad rehta hai.', author: 'Study Blunder' },
  { quote: 'Aapka competition kisi aur se nahi, aapke kal wale version se hai.', author: 'Study Blunder' },
  { quote: 'Discipline wo bridge hai jo aapke target aur aapke selection ko jodta hai.', author: 'Study Blunder' },
  { quote: 'Jab mann bole kal padhenge, tabhi 15 minute ke liye kitaab khol lo — momentum ban jayega.', author: 'Study Blunder' },
  { quote: 'Har topper kabhi beginner tha, bas usne roz seekhna band nahi kiya.', author: 'Study Blunder' },
  { quote: 'Concept clear hoga toh koi bhi tricky question aasan lagne lagega.', author: 'Study Blunder' },
  { quote: 'Mehnat itni khamoshi se karo ki aapka result shor macha de.', author: 'Study Blunder' },
  { quote: 'Aaj ka focus session aapko aapke dream college aur dream rank ke aur kareeb layega.', author: 'Study Blunder' },
  { quote: 'Thoda aur sabr, thodi aur mehnat — manzil bahut kareeb hai.', author: 'Study Blunder' },
  { quote: '30 din ki lagatar mehnat aapki aadat aur aapka confidence dono badal deti hai!', author: 'Study Blunder' },
];

export function getDefault30DayMotivations(): DailyMotivationItem[] {
  const now = new Date().toISOString();
  return DEFAULT_30_DAY_MOTIVATIONS.map((item, index) => ({
    day_number: index + 1,
    quote: item.quote,
    author: item.author,
    image_url: '',
    updated_at: now,
  }));
}

function getInitialDatabase(): DatabaseSchema {
  const now = new Date().toISOString();
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // Strict production policy: no hardcoded sample demo users
  const initialUsers: User[] = [
    {
      id: '27f86505-bb19-465f-9597-aecf7ec7ee85',
      email: 'bhaskardattmishra0101@gmail.com',
      password_hash: '10593a12dfd49a326354f7a84d789543:21c33f6dd9d9c82a44253681dcfe1847c38c9682c72a9e68017484151e44bbe09d2f1b232a510f935272021656e1fef5a278ba771ca24a4bc20d2be30e235b94', // Set via Supabase Auth or initial setup
      role: 'super_admin',
      vip_active: true,
      vip_expires_at: nextYear,
      referral_code: 'SF-REF-SUPER1',
      created_at: now,
      last_login_at: null,
    },
  ];

  return {
    users: initialUsers,
    platforms: [],
    vip_batches: [],
    vip_plans: [],
    settings: {
      key_generation_enabled: true,
      shortener_url: 'https://shrinkme.io/edu-portal-redirect',
      tutorial_video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      telegram_channel_url: 'https://t.me/studyblunder',
      study_blunder_telegram_url: 'https://t.me/studyblunder',
      study_blunder_telegram_label: 'Study Blunder Telegram',
      study_fox_telegram_url: 'https://t.me/studyfoxofficial',
      study_fox_telegram_label: 'Study Fox Telegram',
      telegram_popup_enabled: true,
      telegram_popup_title: 'Join Telegram Channel',
      telegram_popup_message: 'Get instant updates on new batches, free access keys, and announcements.',
      telegram_popup_button_text: 'Join Channel',
      telegram_popup_close_text: 'Maybe Later',
      telegram_popup_reminder_text: 'Official Study Blunder Community',
      telegram_popup_show_on_resume: false,
      maintenance_mode: false,
      login_enabled: true,
      key_expiry_hours: 24,
      free_access_duration: 24,
      free_access_unit: 'hours',
      vip_purchase_url: 'https://t.me/education_hub_updates',
      vip_telegram_url: 'https://t.me/education_hub_updates',
      vip_payment_qr_url: '',
      vip_payment_amount: 299,
      vip_payment_instructions: 'Scan the QR code using any UPI app (GPay, PhonePe, Paytm), complete the payment, and submit your payment screenshot below for verification.',
      vip_payment_utr_required: false,
      home_single_vip_label: 'VIP',
      home_single_vip_price: 49,
      home_single_vip_duration_days: 30,
      home_single_vip_destination: 'in_app_single_vip',
      home_single_vip_url: '',
      home_all_vip_label: 'ALL VIP',
      home_all_vip_price: 149,
      home_all_vip_duration_days: 30,
      home_all_vip_destination: 'in_app_all_vip',
      home_all_vip_url: '',
      vip_grace_period_hours: 24,
      referral_reward_days: 7,
      referral_program_enabled: true,
      referral_discount_config: getDefaultReferralDiscountConfig(),
      app_name: 'STUDY BLUNDER',
      app_logo_url: '/logo.png',
      app_theme_preset: 'red',
      theme_primary: '#FF2525',
      theme_secondary: '#C90000',
      theme_background: '#090909',
      theme_text: '#F5F5F5',
      theme_button: '#FF2525',
      vip_theme_background: '#090909',
      vip_theme_card: '#1D1D1D',
      vip_theme_accent: '#FF2525',
      vip_theme_text: '#F5F5F5',
      vip_theme_button: '#FF2525',
      vip_theme_border: '#454545',
      announcement_slider_enabled: true,
      announcement_slide_interval_seconds: 5,
      support_enabled: true,
      support_url: 'https://t.me/education_hub_updates',
      support_button_label: 'Contact Support',
      support_description: 'Need help with your account, access keys, or VIP membership? Contact our support desk.',
      support_image_url: '',
      donation_enabled: false,
      donation_url: '',
      donation_button_text: 'Donate & Support Us',
      donation_title: 'Support Free Education',
      donation_description: 'Help us keep servers online and educational resources accessible for every student.',
      donation_qr_url: '',
      custom_popup_enabled: false,
      custom_popup_title: '',
      custom_popup_message: '',
      custom_popup_image_url: '',
      custom_popup_button_text: 'Learn More',
      custom_popup_button_url: '',
      custom_popup_close_text: 'Dismiss',
      custom_popup_start_date: null,
      custom_popup_end_date: null,
      custom_popup_frequency: 'once_per_session',
      data_retention_days: 30,
      festival_decorations_enabled: true,
      active_festival_id: null,
      festival_configs_json: normalizeAllFestivalConfigs(null),
      festival_version: 1,
      updated_at: now,
    },
    announcements: [],
    login_history: [],
    payment_records: [],
    key_records: [],
    vip_device_logs: [],
    platform_usage_logs: [],
    user_feedback: [],
    pending_verifications: [],
    password_reset_tokens: [],
    admin_permissions: {},
    user_referral_permissions: {},
    vip_feature_state: getDefaultVipFeatureManagementState(),
    study_streaks: {},
    exam_schedules: getInitialGlobalExams(),
    study_timetables: [],
    learning_resources: getInitialLearningResources(),
    student_resource_interactions: [],
    vip_announcements: [],
    vip_mock_tests: getInitialVipMockTests(),
    vip_mock_test_attempts: [],
    priority_support_tickets: [],
    vip_referrals: [],
    student_notifications: [],
    admin_audit_logs: [],
    vip_feature_usage_counts: {},
    offer_board: [],
    daily_motivations: getDefault30DayMotivations(),
    student_exam_timers: {},
    student_xp: {},
    student_study_logs: [],
    parent_report_settings: {},
  };
}

export class StorageEngine {
  private static instance: StorageEngine;
  private db: DatabaseSchema;
  private supabase: SupabaseClient | null = null;
  private cloudStorageClient: SupabaseClient | null = null;
  private readonly cloudStorageBucket = 'study-blunder-cloud-db';
  private readonly cloudStorageObjectPath = 'database.json';
  private cloudSyncInFlight: Promise<void> | null = null;
  private pendingCloudPayload: string | null = null;
  private lastCloudSyncAt: string | null = null;
  private supabaseConfiguredFlag = false;
  private supabaseSchemaReady = false;
  private supabaseSchemaError: string | null = null;
  private pending_verifications = new Map<string, PendingVerificationAttempt>();
  private claiming_key_users = new Set<string>();
  private redeeming_keys = new Set<string>();
  private last_key_claim_ms = new Map<string, number>();
  private recent_platform_clicks = new Map<string, { log: PlatformUsageLog; expiresAtMs: number }>();
  private last_platform_open_ms = new Map<string, { log: PlatformUsageLog; atMs: number }>();
  private festival_mutex: Promise<void> = Promise.resolve();

  private constructor() {
    this.ensureDataDir();
    this.initSupabaseFromEnv();
    this.db = this.loadDatabase();
    this.hydratePendingVerificationsFromDb();
    this.purgeConfirmedTestAccountsOnStartup();
  }

  private hydratePendingVerificationsFromDb(): void {
    const nowMs = Date.now();
    const list = Array.isArray(this.db.pending_verifications) ? this.db.pending_verifications : [];
    for (const item of list) {
      if (
        item &&
        item.token &&
        !item.consumed &&
        new Date(item.expires_at).getTime() > nowMs
      ) {
        const startedMs = new Date(item.created_at).getTime();
        const earliestIso =
          item.earliest_key_at ||
          new Date((Number.isFinite(startedMs) ? startedMs : nowMs) + MIN_VPLINK_WAIT_MS).toISOString();
        this.pending_verifications.set(item.token, {
          ...item,
          earliest_key_at: earliestIso,
        });
      }
    }
  }

  private syncPendingVerificationsToDb(): void {
    const nowMs = Date.now();
    const activeList: PendingVerificationAttempt[] = [];
    for (const [token, attempt] of this.pending_verifications.entries()) {
      if (attempt.consumed || new Date(attempt.expires_at).getTime() <= nowMs) {
        this.pending_verifications.delete(token);
      } else {
        activeList.push(attempt);
      }
    }
    this.db.pending_verifications = activeList;
    this.saveDatabase(this.db);
  }

  public initSupabaseFromEnv(): void {
    const sbUrl = process.env.SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sbUrl && sbKey && !sbUrl.includes('your-project')) {
      this.supabaseConfiguredFlag = true;
      try {
        this.supabase = createClient(sbUrl, sbKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
      } catch (err) {
        console.warn('[STORAGE] Failed to initialize Supabase client:', err);
        this.supabaseSchemaError = err instanceof Error ? err.message : 'Failed to initialize Supabase client';
      }
    }
  }

  public getSupabaseClient(): SupabaseClient | null {
    return this.supabase;
  }

  public static getInstance(): StorageEngine {
    if (!StorageEngine.instance) {
      StorageEngine.instance = new StorageEngine();
    }
    return StorageEngine.instance;
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadDatabase(): DatabaseSchema {
    const readJsonFileSafe = (filePath: string): any | null => {
      try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (!raw || !raw.trim()) return null;
        return JSON.parse(raw);
      } catch (err) {
        console.warn(`[STORAGE] Failed to parse ${path.basename(filePath)}:`, err);
        return null;
      }
    };

    try {
      const parsed = readJsonFileSafe(DATA_FILE) || readJsonFileSafe(DATA_BACKUP_FILE);
      if (parsed) {
        // Ensure all keys exist
        const initial = getInitialDatabase();
        return {
          ...initial,
          ...parsed,
          users: (parsed.users || initial.users)
            .filter((u: User) => !['superadmin@education.com', 'admin@education.com', 'student@education.com', 'vipstudent@education.com'].includes(u.email?.toLowerCase()))
            .map((u: User) => ({
              ...u,
              role: u.email?.toLowerCase() === 'bhaskardattmishra0101@gmail.com' ? 'super_admin' : u.role,
              name: u.name || '',
              is_blocked: Boolean(u.is_blocked),
              blocked_at: u.blocked_at || null,
              blocked_reason: u.blocked_reason || null,
              blocked_by: u.blocked_by || null,
              vip_bound_device_id: u.vip_bound_device_id || null,
              vip_bound_session_id: u.vip_bound_session_id || null,
              vip_device_label: u.vip_device_label || null,
              vip_device_bound_at: u.vip_device_bound_at || null,
              vip_device_last_seen_at: u.vip_device_last_seen_at || null,
              vip_device_last_ip: u.vip_device_last_ip || null,
              vip_device_last_ua: u.vip_device_last_ua || null,
              vip_device_reset_count: typeof u.vip_device_reset_count === 'number' ? u.vip_device_reset_count : 0,
              vip_device_last_reset_at: u.vip_device_last_reset_at || null,
              vip_device_last_reset_by: u.vip_device_last_reset_by || null,
              vip_sharing_attempt_count: typeof u.vip_sharing_attempt_count === 'number' ? u.vip_sharing_attempt_count : 0,
              vip_last_sharing_attempt_at: u.vip_last_sharing_attempt_at || null,
              vip_allowed_platform_ids: Array.isArray(u.vip_allowed_platform_ids) ? u.vip_allowed_platform_ids.filter(Boolean) : [],
              vip_platform_expiries: u.vip_platform_expiries && typeof u.vip_platform_expiries === 'object' ? u.vip_platform_expiries : {},
              free_access_expires_at: u.free_access_expires_at || null,
            })),
          platforms: (parsed.platforms || initial.platforms).map((p: Platform) => ({
            ...p,
            access_type: p.access_type || 'normal',
            vip_target_url: p.vip_target_url || '',
          })),
          vip_plans: (parsed.vip_plans || initial.vip_plans).map((pl: VipPlan) => ({
            ...pl,
            plan_scope: pl.plan_scope === 'single_platform' ? 'single_platform' : 'all_platforms',
            duration_days: pl.duration_days !== undefined && pl.duration_days !== null ? pl.duration_days : (pl.duration_months ? pl.duration_months * 30 : 30),
          })),
          announcements: (parsed.announcements || initial.announcements).map((a: Announcement, idx: number) => ({
            ...a,
            link_url: a.link_url || '',
            display_order: typeof a.display_order === 'number' ? a.display_order : idx + 1,
            start_date: a.start_date || null,
            end_date: a.end_date || null,
          })),
          settings: {
            ...initial.settings,
            ...(parsed.settings || {}),
            free_access_duration: parsed.settings?.free_access_duration ?? parsed.settings?.key_expiry_hours ?? 24,
            free_access_unit: parsed.settings?.free_access_unit || 'hours',
            vip_purchase_url: parsed.settings?.vip_purchase_url ?? initial.settings.vip_purchase_url ?? '',
            vip_telegram_url: parsed.settings?.vip_telegram_url ?? parsed.settings?.vip_purchase_url ?? initial.settings.vip_telegram_url ?? '',
            vip_payment_qr_url: parsed.settings?.vip_payment_qr_url ?? '',
            vip_payment_amount: typeof parsed.settings?.vip_payment_amount === 'number' ? parsed.settings.vip_payment_amount : (initial.settings.vip_payment_amount ?? 299),
            vip_payment_instructions: parsed.settings?.vip_payment_instructions ?? initial.settings.vip_payment_instructions ?? '',
            vip_payment_utr_required: Boolean(parsed.settings?.vip_payment_utr_required),
            home_single_vip_label: parsed.settings?.home_single_vip_label || initial.settings.home_single_vip_label || 'VIP',
            home_single_vip_price:
              typeof parsed.settings?.home_single_vip_price === 'number'
                ? parsed.settings.home_single_vip_price
                : (initial.settings.home_single_vip_price ?? 49),
            home_single_vip_duration_days:
              typeof parsed.settings?.home_single_vip_duration_days === 'number' && parsed.settings.home_single_vip_duration_days > 0
                ? parsed.settings.home_single_vip_duration_days
                : (initial.settings.home_single_vip_duration_days ?? 30),
            home_single_vip_destination:
              parsed.settings?.home_single_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_single_vip',
            home_single_vip_url: parsed.settings?.home_single_vip_url ?? '',
            home_all_vip_label: parsed.settings?.home_all_vip_label || initial.settings.home_all_vip_label || 'ALL VIP',
            home_all_vip_price:
              typeof parsed.settings?.home_all_vip_price === 'number'
                ? parsed.settings.home_all_vip_price
                : (initial.settings.home_all_vip_price ?? 149),
            home_all_vip_duration_days:
              typeof parsed.settings?.home_all_vip_duration_days === 'number' && parsed.settings.home_all_vip_duration_days > 0
                ? parsed.settings.home_all_vip_duration_days
                : (initial.settings.home_all_vip_duration_days ?? 30),
            home_all_vip_destination:
              parsed.settings?.home_all_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_all_vip',
            home_all_vip_url: parsed.settings?.home_all_vip_url ?? '',
            app_theme_preset: normalizeAppThemePreset(parsed.settings?.app_theme_preset),
            vip_theme_background: parsed.settings?.vip_theme_background || initial.settings.vip_theme_background || '#090909',
            vip_theme_card: parsed.settings?.vip_theme_card || initial.settings.vip_theme_card || '#0f172a',
            vip_theme_accent: parsed.settings?.vip_theme_accent || initial.settings.vip_theme_accent || '#f59e0b',
            vip_theme_text: parsed.settings?.vip_theme_text || initial.settings.vip_theme_text || '#f8fafc',
            vip_theme_button: parsed.settings?.vip_theme_button || initial.settings.vip_theme_button || '#eab308',
            vip_theme_border: parsed.settings?.vip_theme_border || initial.settings.vip_theme_border || '#1e293b',
            announcement_slider_enabled: parsed.settings?.announcement_slider_enabled ?? true,
            announcement_slide_interval_seconds: parsed.settings?.announcement_slide_interval_seconds ?? 5,
            study_blunder_telegram_url:
              parsed.settings?.study_blunder_telegram_url ??
              parsed.settings?.telegram_channel_url ??
              initial.settings.study_blunder_telegram_url ??
              'https://t.me/studyblunder',
            study_blunder_telegram_label:
              parsed.settings?.study_blunder_telegram_label || 'Study Blunder Telegram',
            study_fox_telegram_url:
              parsed.settings?.study_fox_telegram_url ??
              initial.settings.study_fox_telegram_url ??
              'https://t.me/studyfoxofficial',
            study_fox_telegram_label:
              parsed.settings?.study_fox_telegram_label || 'Study Fox Telegram',
            telegram_popup_title: parsed.settings?.telegram_popup_title ?? initial.settings.telegram_popup_title,
            telegram_popup_message: parsed.settings?.telegram_popup_message ?? initial.settings.telegram_popup_message,
            telegram_popup_button_text: parsed.settings?.telegram_popup_button_text ?? initial.settings.telegram_popup_button_text,
            telegram_popup_close_text: parsed.settings?.telegram_popup_close_text ?? initial.settings.telegram_popup_close_text,
            telegram_popup_reminder_text: parsed.settings?.telegram_popup_reminder_text ?? initial.settings.telegram_popup_reminder_text,
            telegram_popup_frequency: parsed.settings?.telegram_popup_frequency || 'once_per_session',
            telegram_popup_show_on_resume: Boolean(parsed.settings?.telegram_popup_show_on_resume),
            support_enabled: parsed.settings?.support_enabled ?? true,
            support_url: parsed.settings?.support_url ?? initial.settings.support_url,
            support_title: parsed.settings?.support_title || parsed.settings?.support_button_label || initial.settings.support_button_label || 'Support / Help',
            support_button_label: parsed.settings?.support_button_label || parsed.settings?.support_title || initial.settings.support_button_label || 'Support / Help',
            support_description: parsed.settings?.support_description ?? initial.settings.support_description,
            support_image_url: parsed.settings?.support_image_url ?? '',
            donation_enabled: Boolean(parsed.settings?.donation_enabled),
            donation_url: parsed.settings?.donation_url ?? '',
            donation_button_text: parsed.settings?.donation_button_text ?? initial.settings.donation_button_text,
            donation_title: parsed.settings?.donation_title ?? initial.settings.donation_title,
            donation_message: parsed.settings?.donation_message ?? parsed.settings?.donation_description ?? initial.settings.donation_description,
            donation_description: parsed.settings?.donation_description ?? parsed.settings?.donation_message ?? initial.settings.donation_description,
            donation_qr_url: parsed.settings?.donation_qr_url ?? '',
            custom_popup_enabled: Boolean(parsed.settings?.custom_popup_enabled),
            custom_popup_title: parsed.settings?.custom_popup_title ?? '',
            custom_popup_message: parsed.settings?.custom_popup_message ?? '',
            custom_popup_image_url: parsed.settings?.custom_popup_image_url ?? '',
            custom_popup_button_text: parsed.settings?.custom_popup_button_text ?? 'Learn More',
            custom_popup_button_url: parsed.settings?.custom_popup_button_url ?? '',
            custom_popup_close_text: parsed.settings?.custom_popup_close_text ?? 'Dismiss',
            custom_popup_start_date: parsed.settings?.custom_popup_start_date || null,
            custom_popup_end_date: parsed.settings?.custom_popup_end_date || null,
            custom_popup_frequency: parsed.settings?.custom_popup_frequency || 'once_per_session',
            data_retention_days: parsed.settings?.data_retention_days ?? 30,
            retention_login_history_days: parsed.settings?.retention_login_history_days ?? parsed.settings?.data_retention_days ?? 30,
            retention_expired_keys_days: parsed.settings?.retention_expired_keys_days ?? 7,
            retention_failed_payments_days: parsed.settings?.retention_failed_payments_days ?? 30,
            festival_decorations_enabled:
              parsed.settings?.festival_decorations_enabled !== undefined
                ? Boolean(parsed.settings.festival_decorations_enabled)
                : true,
            active_festival_id: parsed.settings?.active_festival_id || null,
            festival_configs_json: normalizeAllFestivalConfigs(parsed.settings?.festival_configs_json),
            festival_version:
              typeof parsed.settings?.festival_version === 'number' && parsed.settings.festival_version > 0
                ? parsed.settings.festival_version
                : 1,
            vip_grace_period_hours:
              typeof parsed.settings?.vip_grace_period_hours === 'number'
                ? parsed.settings.vip_grace_period_hours
                : 24,
            referral_reward_days:
              typeof parsed.settings?.referral_reward_days === 'number'
                ? parsed.settings.referral_reward_days
                : 7,
            referral_program_enabled:
              parsed.settings?.referral_program_enabled !== undefined
                ? Boolean(parsed.settings.referral_program_enabled)
                : true,
            referral_discount_config:
              parsed.settings?.referral_discount_config && typeof parsed.settings.referral_discount_config === 'object'
                ? {
                    ...getDefaultReferralDiscountConfig(),
                    ...parsed.settings.referral_discount_config,
                  }
                : getDefaultReferralDiscountConfig(),
          },
          key_records: (parsed.key_records || initial.key_records)
            .filter((k: KeyRecord) => {
              const t = String(k.token || '').trim();
              return (
                !t.startsWith('FLOW:') &&
                !t.startsWith('PLATLOG:') &&
                !t.startsWith('FESTIVAL_STATE:') &&
                !t.startsWith('FEEDBACK_ITEM:') &&
                !t.startsWith('PW_RESET:')
              );
            })
            .map((k: KeyRecord) => normalizeStoredKeyRecord(k)),
          payment_records: (parsed.payment_records || initial.payment_records).map((p: PaymentRecord, idx: number) => ({
            ...p,
            request_id: p.request_id || `SF-VIP-2026-${String(p.id || idx).replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase().padStart(5, '8')}`,
            purchase_source: p.purchase_source || 'in_app',
            vip_scope: p.vip_scope === 'single_platform' ? 'single_platform' : 'all_platforms',
            selected_platform_id: p.selected_platform_id || null,
            selected_platform_name: p.selected_platform_name || null,
          })),
          vip_device_logs: Array.isArray(parsed.vip_device_logs) ? parsed.vip_device_logs : [],
          platform_usage_logs: Array.isArray(parsed.platform_usage_logs) ? parsed.platform_usage_logs : [],
          user_feedback: Array.isArray(parsed.user_feedback) ? parsed.user_feedback : [],
          pending_verifications: Array.isArray(parsed.pending_verifications) ? parsed.pending_verifications : [],
          password_reset_tokens: Array.isArray(parsed.password_reset_tokens) ? parsed.password_reset_tokens : [],
          admin_permissions: parsed.admin_permissions && typeof parsed.admin_permissions === 'object' ? parsed.admin_permissions : {},
          user_referral_permissions: parsed.user_referral_permissions && typeof parsed.user_referral_permissions === 'object' ? parsed.user_referral_permissions : {},
          vip_feature_state: parsed.vip_feature_state && typeof parsed.vip_feature_state === 'object'
            ? {
                ...getDefaultVipFeatureManagementState(),
                ...parsed.vip_feature_state,
                features: {
                  ...getDefaultVipFeatureManagementState().features,
                  ...(parsed.vip_feature_state.features || {}),
                },
              }
            : getDefaultVipFeatureManagementState(),
          study_streaks: parsed.study_streaks && typeof parsed.study_streaks === 'object' ? parsed.study_streaks : {},
          exam_schedules: Array.isArray(parsed.exam_schedules) && parsed.exam_schedules.length > 0 ? parsed.exam_schedules : getInitialGlobalExams(),
          study_timetables: Array.isArray(parsed.study_timetables) ? parsed.study_timetables : [],
          learning_resources: Array.isArray(parsed.learning_resources) && parsed.learning_resources.length > 0 ? parsed.learning_resources : getInitialLearningResources(),
          student_resource_interactions: Array.isArray(parsed.student_resource_interactions) ? parsed.student_resource_interactions : [],
          vip_announcements: Array.isArray(parsed.vip_announcements) ? parsed.vip_announcements : [],
          vip_mock_tests: Array.isArray(parsed.vip_mock_tests) && parsed.vip_mock_tests.length > 0 ? parsed.vip_mock_tests : getInitialVipMockTests(),
          vip_mock_test_attempts: Array.isArray(parsed.vip_mock_test_attempts) ? parsed.vip_mock_test_attempts : [],
          priority_support_tickets: Array.isArray(parsed.priority_support_tickets) ? parsed.priority_support_tickets : [],
          vip_referrals: Array.isArray(parsed.vip_referrals) ? parsed.vip_referrals : [],
          student_notifications: Array.isArray(parsed.student_notifications) ? parsed.student_notifications : [],
          admin_audit_logs: Array.isArray(parsed.admin_audit_logs) ? parsed.admin_audit_logs : [],
          vip_feature_usage_counts: parsed.vip_feature_usage_counts && typeof parsed.vip_feature_usage_counts === 'object' ? parsed.vip_feature_usage_counts : {},
          offer_board: Array.isArray(parsed.offer_board) ? parsed.offer_board : [],
          daily_motivations:
            Array.isArray(parsed.daily_motivations) && parsed.daily_motivations.length > 0
              ? parsed.daily_motivations
              : getDefault30DayMotivations(),
          student_exam_timers:
            parsed.student_exam_timers && typeof parsed.student_exam_timers === 'object'
              ? parsed.student_exam_timers
              : {},
          student_xp:
            parsed.student_xp && typeof parsed.student_xp === 'object'
              ? parsed.student_xp
              : {},
          student_study_logs: Array.isArray(parsed.student_study_logs) ? parsed.student_study_logs : [],
          parent_report_settings:
            parsed.parent_report_settings && typeof parsed.parent_report_settings === 'object'
              ? parsed.parent_report_settings
              : {},
        };
      }
    } catch (err) {
      console.warn('Failed to parse database.json, initializing fresh database', err);
    }

    const fresh = getInitialDatabase();
    this.saveDatabase(fresh);
    return fresh;
  }

  private normalizeDatabasePayload(parsed: any): DatabaseSchema {
    const initial = getInitialDatabase();
    if (!parsed || typeof parsed !== 'object') return initial;
    return {
      ...initial,
      ...parsed,
      users: (Array.isArray(parsed.users) && parsed.users.length > 0 ? parsed.users : initial.users)
        .filter((u: User) => !['superadmin@education.com', 'admin@education.com', 'student@education.com', 'vipstudent@education.com'].includes(u.email?.toLowerCase()))
        .map((u: User) => ({
          ...u,
          role: u.email?.toLowerCase() === 'bhaskardattmishra0101@gmail.com' ? 'super_admin' : u.role,
          name: u.name || '',
          is_blocked: Boolean(u.is_blocked),
          blocked_at: u.blocked_at || null,
          blocked_reason: u.blocked_reason || null,
          blocked_by: u.blocked_by || null,
          vip_bound_device_id: u.vip_bound_device_id || null,
          vip_bound_session_id: u.vip_bound_session_id || null,
          vip_device_label: u.vip_device_label || null,
          vip_device_bound_at: u.vip_device_bound_at || null,
          vip_device_last_seen_at: u.vip_device_last_seen_at || null,
          vip_device_last_ip: u.vip_device_last_ip || null,
          vip_device_last_ua: u.vip_device_last_ua || null,
          vip_device_reset_count: typeof u.vip_device_reset_count === 'number' ? u.vip_device_reset_count : 0,
          vip_device_last_reset_at: u.vip_device_last_reset_at || null,
          vip_device_last_reset_by: u.vip_device_last_reset_by || null,
          vip_sharing_attempt_count: typeof u.vip_sharing_attempt_count === 'number' ? u.vip_sharing_attempt_count : 0,
          vip_last_sharing_attempt_at: u.vip_last_sharing_attempt_at || null,
          vip_allowed_platform_ids: Array.isArray(u.vip_allowed_platform_ids) ? u.vip_allowed_platform_ids.filter(Boolean) : [],
          vip_platform_expiries: u.vip_platform_expiries && typeof u.vip_platform_expiries === 'object' ? u.vip_platform_expiries : {},
          free_access_expires_at: u.free_access_expires_at || null,
        })),
      platforms: (Array.isArray(parsed.platforms) ? parsed.platforms : initial.platforms).map((p: Platform) => ({
        ...p,
        access_type: p.access_type || 'normal',
        vip_target_url: p.vip_target_url || '',
      })),
      vip_plans: (Array.isArray(parsed.vip_plans) ? parsed.vip_plans : initial.vip_plans).map((pl: VipPlan) => ({
        ...pl,
        plan_scope: pl.plan_scope === 'single_platform' ? 'single_platform' : 'all_platforms',
        duration_days: pl.duration_days !== undefined && pl.duration_days !== null ? pl.duration_days : (pl.duration_months ? pl.duration_months * 30 : 30),
      })),
      announcements: (Array.isArray(parsed.announcements) ? parsed.announcements : initial.announcements).map((a: Announcement, idx: number) => ({
        ...a,
        link_url: a.link_url || '',
        display_order: typeof a.display_order === 'number' ? a.display_order : idx + 1,
        start_date: a.start_date || null,
        end_date: a.end_date || null,
      })),
      settings: {
        ...initial.settings,
        ...(parsed.settings || {}),
        home_single_vip_label: parsed.settings?.home_single_vip_label || initial.settings.home_single_vip_label || 'VIP',
        home_single_vip_price:
          typeof parsed.settings?.home_single_vip_price === 'number'
            ? parsed.settings.home_single_vip_price
            : (initial.settings.home_single_vip_price ?? 49),
        home_single_vip_duration_days:
          typeof parsed.settings?.home_single_vip_duration_days === 'number' && parsed.settings.home_single_vip_duration_days > 0
            ? parsed.settings.home_single_vip_duration_days
            : (initial.settings.home_single_vip_duration_days ?? 30),
        home_single_vip_destination:
          parsed.settings?.home_single_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_single_vip',
        home_single_vip_url: parsed.settings?.home_single_vip_url ?? '',
        home_all_vip_label: parsed.settings?.home_all_vip_label || initial.settings.home_all_vip_label || 'ALL VIP',
        home_all_vip_price:
          typeof parsed.settings?.home_all_vip_price === 'number'
            ? parsed.settings.home_all_vip_price
            : (initial.settings.home_all_vip_price ?? 149),
        home_all_vip_duration_days:
          typeof parsed.settings?.home_all_vip_duration_days === 'number' && parsed.settings.home_all_vip_duration_days > 0
            ? parsed.settings.home_all_vip_duration_days
            : (initial.settings.home_all_vip_duration_days ?? 30),
        home_all_vip_destination:
          parsed.settings?.home_all_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_all_vip',
        home_all_vip_url: parsed.settings?.home_all_vip_url ?? '',
        app_theme_preset: normalizeAppThemePreset(parsed.settings?.app_theme_preset),
        study_blunder_telegram_url:
          parsed.settings?.study_blunder_telegram_url ??
          parsed.settings?.telegram_channel_url ??
          initial.settings.study_blunder_telegram_url ??
          'https://t.me/studyblunder',
        study_blunder_telegram_label:
          parsed.settings?.study_blunder_telegram_label || 'Study Blunder Telegram',
        study_fox_telegram_url:
          parsed.settings?.study_fox_telegram_url ??
          initial.settings.study_fox_telegram_url ??
          'https://t.me/studyfoxofficial',
        study_fox_telegram_label:
          parsed.settings?.study_fox_telegram_label || 'Study Fox Telegram',
        festival_configs_json: normalizeAllFestivalConfigs(parsed.settings?.festival_configs_json),
        referral_discount_config:
          parsed.settings?.referral_discount_config && typeof parsed.settings.referral_discount_config === 'object'
            ? {
                ...getDefaultReferralDiscountConfig(),
                ...parsed.settings.referral_discount_config,
              }
            : getDefaultReferralDiscountConfig(),
      },
      payment_records: (Array.isArray(parsed.payment_records) ? parsed.payment_records : initial.payment_records).map((p: PaymentRecord, idx: number) => ({
        ...p,
        request_id: p.request_id || `SF-VIP-2026-${String(p.id || idx).replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase().padStart(5, '8')}`,
        purchase_source: p.purchase_source || 'in_app',
        vip_scope: p.vip_scope === 'single_platform' ? 'single_platform' : 'all_platforms',
        selected_platform_id: p.selected_platform_id || null,
        selected_platform_name: p.selected_platform_name || null,
      })),
      key_records: (Array.isArray(parsed.key_records) ? parsed.key_records : initial.key_records)
        .filter((k: KeyRecord) => {
          const t = String(k.token || '').trim();
          return (
            !t.startsWith('FLOW:') &&
            !t.startsWith('PLATLOG:') &&
            !t.startsWith('FESTIVAL_STATE:') &&
            !t.startsWith('FEEDBACK_ITEM:') &&
            !t.startsWith('PW_RESET:')
          );
        })
        .map((k: KeyRecord) => normalizeStoredKeyRecord(k)),
      vip_device_logs: Array.isArray(parsed.vip_device_logs) ? parsed.vip_device_logs : [],
      platform_usage_logs: Array.isArray(parsed.platform_usage_logs) ? parsed.platform_usage_logs : [],
      user_feedback: Array.isArray(parsed.user_feedback) ? parsed.user_feedback : [],
      pending_verifications: Array.isArray(parsed.pending_verifications) ? parsed.pending_verifications : [],
      password_reset_tokens: Array.isArray(parsed.password_reset_tokens) ? parsed.password_reset_tokens : [],
      admin_permissions: parsed.admin_permissions && typeof parsed.admin_permissions === 'object' ? parsed.admin_permissions : {},
      user_referral_permissions: parsed.user_referral_permissions && typeof parsed.user_referral_permissions === 'object' ? parsed.user_referral_permissions : {},
      vip_feature_state:
        parsed.vip_feature_state && typeof parsed.vip_feature_state === 'object'
          ? {
              ...getDefaultVipFeatureManagementState(),
              ...parsed.vip_feature_state,
              features: {
                ...getDefaultVipFeatureManagementState().features,
                ...(parsed.vip_feature_state.features || {}),
              },
            }
          : getDefaultVipFeatureManagementState(),
      study_streaks: parsed.study_streaks && typeof parsed.study_streaks === 'object' ? parsed.study_streaks : {},
      exam_schedules: Array.isArray(parsed.exam_schedules) && parsed.exam_schedules.length > 0 ? parsed.exam_schedules : getInitialGlobalExams(),
      study_timetables: Array.isArray(parsed.study_timetables) ? parsed.study_timetables : [],
      learning_resources: Array.isArray(parsed.learning_resources) && parsed.learning_resources.length > 0 ? parsed.learning_resources : getInitialLearningResources(),
      student_resource_interactions: Array.isArray(parsed.student_resource_interactions) ? parsed.student_resource_interactions : [],
      vip_announcements: Array.isArray(parsed.vip_announcements) ? parsed.vip_announcements : [],
      vip_mock_tests: Array.isArray(parsed.vip_mock_tests) && parsed.vip_mock_tests.length > 0 ? parsed.vip_mock_tests : getInitialVipMockTests(),
      vip_mock_test_attempts: Array.isArray(parsed.vip_mock_test_attempts) ? parsed.vip_mock_test_attempts : [],
      priority_support_tickets: Array.isArray(parsed.priority_support_tickets) ? parsed.priority_support_tickets : [],
      vip_referrals: Array.isArray(parsed.vip_referrals) ? parsed.vip_referrals : [],
      student_notifications: Array.isArray(parsed.student_notifications) ? parsed.student_notifications : [],
      admin_audit_logs: Array.isArray(parsed.admin_audit_logs) ? parsed.admin_audit_logs : [],
      vip_feature_usage_counts: parsed.vip_feature_usage_counts && typeof parsed.vip_feature_usage_counts === 'object' ? parsed.vip_feature_usage_counts : {},
      offer_board: Array.isArray(parsed.offer_board) ? parsed.offer_board : [],
      daily_motivations:
        Array.isArray(parsed.daily_motivations) && parsed.daily_motivations.length > 0
          ? parsed.daily_motivations
          : getDefault30DayMotivations(),
      student_exam_timers:
        parsed.student_exam_timers && typeof parsed.student_exam_timers === 'object'
          ? parsed.student_exam_timers
          : {},
      student_xp:
        parsed.student_xp && typeof parsed.student_xp === 'object'
          ? parsed.student_xp
          : {},
      student_study_logs: Array.isArray(parsed.student_study_logs) ? parsed.student_study_logs : [],
      parent_report_settings:
        parsed.parent_report_settings && typeof parsed.parent_report_settings === 'object'
          ? parsed.parent_report_settings
          : {},
    };
  }

  private scheduleCloudStorageSync(serialized: string): void {
    if (!this.cloudStorageClient) return;
    this.pendingCloudPayload = serialized;
    if (this.cloudSyncInFlight) return;

    const drainQueue = async () => {
      try {
        while (this.pendingCloudPayload && this.cloudStorageClient) {
          const payloadToUpload = this.pendingCloudPayload;
          this.pendingCloudPayload = null;
          const buffer = Buffer.from(payloadToUpload, 'utf-8');
          const { error } = await this.cloudStorageClient.storage
            .from(this.cloudStorageBucket)
            .upload(this.cloudStorageObjectPath, buffer, {
              upsert: true,
              contentType: 'application/json',
              cacheControl: '0',
            });
          if (error) {
            console.warn('[STORAGE] Automatic cloud storage sync warning:', error.message);
          } else {
            this.lastCloudSyncAt = new Date().toISOString();
          }
        }
      } catch (err) {
        console.warn('[STORAGE] Automatic cloud storage sync error:', err);
      } finally {
        this.cloudSyncInFlight = null;
        if (this.pendingCloudPayload && this.cloudStorageClient) {
          this.scheduleCloudStorageSync(this.pendingCloudPayload);
        }
      }
    };

    this.cloudSyncInFlight = drainQueue();
  }

  private async activateAutomaticCloudStorage(client: SupabaseClient, forcePushLocal = false): Promise<boolean> {
    try {
      // 1. Ensure private cloud database bucket exists automatically
      const { error: bucketCheckErr } = await client.storage.getBucket(this.cloudStorageBucket);
      if (bucketCheckErr) {
        const { error: createErr } = await client.storage.createBucket(this.cloudStorageBucket, {
          public: false,
        });
        if (createErr && !String(createErr.message || '').toLowerCase().includes('already exists')) {
          console.warn('[STORAGE] Could not create automatic cloud bucket:', createErr.message);
          return false;
        }
      }

      // 2. If not forcing local push, check if a persisted cloud snapshot exists and restore it automatically
      if (!forcePushLocal) {
        const { data: blob, error: dlErr } = await client.storage
          .from(this.cloudStorageBucket)
          .download(this.cloudStorageObjectPath);

        if (!dlErr && blob) {
          try {
            const text = await blob.text();
            if (text && text.trim()) {
              const remoteParsed = JSON.parse(text);
              const normalizedRemote = this.normalizeDatabasePayload(remoteParsed);

              // Preserve Super Admin guarantee
              if (!normalizedRemote.users.some((u) => u.email?.toLowerCase() === 'bhaskardattmishra0101@gmail.com')) {
                const defaultSuper = getInitialDatabase().users[0];
                if (defaultSuper) normalizedRemote.users.unshift(defaultSuper);
              }

              const localUpdatedMs = Date.parse(this.db.settings?.updated_at || '') || 0;
              const remoteUpdatedMs = Date.parse(normalizedRemote.settings?.updated_at || '') || 0;
              const localRichness =
                (this.db.platforms?.length || 0) +
                (this.db.vip_plans?.length || 0) +
                (this.db.payment_records?.length || 0) +
                Math.max(0, (this.db.users?.length || 1) - 1);
              const remoteRichness =
                (normalizedRemote.platforms?.length || 0) +
                (normalizedRemote.vip_plans?.length || 0) +
                (normalizedRemote.payment_records?.length || 0) +
                Math.max(0, (normalizedRemote.users?.length || 1) - 1);

              // Restore from cloud when cloud is at least as fresh, OR local is fresh/empty while cloud has data
              if (remoteUpdatedMs >= localUpdatedMs || (localRichness === 0 && remoteRichness > 0)) {
                this.db = normalizedRemote;
                this.writeLocalFilesOnly(this.db);
                console.log(
                  `[STORAGE] Restored permanent cloud snapshot automatically (${this.db.platforms.length} platforms, ${this.db.vip_plans.length} plans, ${this.db.users.length} users)`
                );
              }
            }
          } catch (parseErr) {
            console.warn('[STORAGE] Failed to parse cloud snapshot, will overwrite with current DB:', parseErr);
          }
        }
      }

      // 3. Activate automatic cloud storage client and push current snapshot immediately
      this.cloudStorageClient = client;
      this.supabase = null;
      this.supabaseConfiguredFlag = true;
      this.supabaseSchemaReady = true;
      this.supabaseSchemaError = null;

      const serialized = JSON.stringify(this.db, null, 2);
      const { error: uploadErr } = await client.storage
        .from(this.cloudStorageBucket)
        .upload(this.cloudStorageObjectPath, Buffer.from(serialized, 'utf-8'), {
          upsert: true,
          contentType: 'application/json',
          cacheControl: '0',
        });

      if (uploadErr) {
        console.warn('[STORAGE] Initial automatic cloud upload warning:', uploadErr.message);
      } else {
        this.lastCloudSyncAt = new Date().toISOString();
      }

      console.log(`[STORAGE] Automatic Supabase Cloud Storage persistence ACTIVE (bucket: ${this.cloudStorageBucket})`);
      return true;
    } catch (err) {
      console.warn('[STORAGE] Automatic cloud storage activation failed:', err);
      return false;
    }
  }

  private writeLocalFilesOnly(data: DatabaseSchema): string {
    this.ensureDataDir();
    const serialized = JSON.stringify(data, null, 2);
    // Atomic write to prevent half-written JSON corruption on sudden container stop/restart
    fs.writeFileSync(DATA_TMP_FILE, serialized, 'utf-8');
    fs.renameSync(DATA_TMP_FILE, DATA_FILE);
    try {
      fs.writeFileSync(DATA_BACKUP_FILE, serialized, 'utf-8');
    } catch {
      // Non-fatal backup write failure
    }
    return serialized;
  }

  private saveDatabase(data: DatabaseSchema): void {
    const serialized = this.writeLocalFilesOnly(data);
    if (this.cloudStorageClient) {
      this.scheduleCloudStorageSync(serialized);
    }
  }

  // --- Users ---
  public getUsers(): User[] {
    return this.db.users;
  }

  public getUserById(id: string): User | undefined {
    return this.db.users.find((u) => u.id === id);
  }

  public getUserByEmail(email: string): User | undefined {
    return this.db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  public async syncUserFromSupabase(identifier: { id?: string; email?: string }): Promise<User | undefined> {
    const cleanId = identifier.id?.trim();
    const cleanEmail = identifier.email?.trim().toLowerCase();

    let localUser = cleanId
      ? this.getUserById(cleanId)
      : cleanEmail
      ? this.getUserByEmail(cleanEmail)
      : undefined;

    if (!this.supabase || (!cleanId && !cleanEmail)) {
      return localUser;
    }

    try {
      const filterExpr =
        cleanId && cleanEmail
          ? `id.eq.${cleanId},email.eq.${cleanEmail}`
          : cleanId
          ? `id.eq.${cleanId}`
          : `email.eq.${cleanEmail}`;

      const { data: remoteUser, error } = await this.supabase
        .from('app_users')
        .select('*')
        .or(filterExpr)
        .limit(1)
        .maybeSingle();

      if (!error && remoteUser) {
        const email = String(remoteUser.email || cleanEmail || '').toLowerCase();
        const mergedUser: User = {
          id: remoteUser.id || localUser?.id || crypto.randomUUID(),
          name: remoteUser.name ?? localUser?.name ?? '',
          email,
          password_hash: remoteUser.password_hash || localUser?.password_hash || '',
          role:
            email === 'bhaskardattmishra0101@gmail.com'
              ? 'super_admin'
              : (remoteUser.role || localUser?.role || 'user'),
          vip_active:
            email === 'bhaskardattmishra0101@gmail.com'
              ? true
              : Boolean(remoteUser.vip_active),
          vip_expires_at: remoteUser.vip_expires_at ?? null,
          vip_allowed_platform_ids: Array.isArray(remoteUser.vip_allowed_platform_ids)
            ? remoteUser.vip_allowed_platform_ids
            : localUser?.vip_allowed_platform_ids || [],
          vip_platform_expiries:
            remoteUser.vip_platform_expiries && typeof remoteUser.vip_platform_expiries === 'object'
              ? remoteUser.vip_platform_expiries
              : localUser?.vip_platform_expiries || {},
          free_access_expires_at: remoteUser.free_access_expires_at ?? null,
          is_blocked: Boolean(remoteUser.is_blocked),
          blocked_at: remoteUser.blocked_at || null,
          blocked_reason: remoteUser.blocked_reason || null,
          blocked_by: remoteUser.blocked_by || null,
          vip_bound_device_id:
            'vip_bound_device_id' in remoteUser
              ? remoteUser.vip_bound_device_id ||
                (!remoteUser.vip_device_last_reset_at && localUser?.vip_bound_device_id ? localUser.vip_bound_device_id : null)
              : localUser?.vip_bound_device_id || null,
          vip_bound_session_id:
            'vip_bound_session_id' in remoteUser
              ? remoteUser.vip_bound_session_id || localUser?.vip_bound_session_id || null
              : localUser?.vip_bound_session_id || null,
          vip_device_label:
            'vip_device_label' in remoteUser
              ? remoteUser.vip_device_label || localUser?.vip_device_label || null
              : localUser?.vip_device_label || null,
          vip_device_bound_at:
            'vip_device_bound_at' in remoteUser
              ? remoteUser.vip_device_bound_at || localUser?.vip_device_bound_at || null
              : localUser?.vip_device_bound_at || null,
          vip_device_last_seen_at:
            'vip_device_last_seen_at' in remoteUser
              ? remoteUser.vip_device_last_seen_at || localUser?.vip_device_last_seen_at || null
              : localUser?.vip_device_last_seen_at || null,
          vip_device_last_ip:
            'vip_device_last_ip' in remoteUser
              ? remoteUser.vip_device_last_ip || localUser?.vip_device_last_ip || null
              : localUser?.vip_device_last_ip || null,
          vip_device_last_ua:
            'vip_device_last_ua' in remoteUser
              ? remoteUser.vip_device_last_ua || localUser?.vip_device_last_ua || null
              : localUser?.vip_device_last_ua || null,
          vip_device_reset_count:
            typeof remoteUser.vip_device_reset_count === 'number'
              ? Math.max(remoteUser.vip_device_reset_count, localUser?.vip_device_reset_count || 0)
              : localUser?.vip_device_reset_count || 0,
          vip_device_last_reset_at:
            remoteUser.vip_device_last_reset_at || localUser?.vip_device_last_reset_at || null,
          vip_device_last_reset_by:
            remoteUser.vip_device_last_reset_by || localUser?.vip_device_last_reset_by || null,
          vip_sharing_attempt_count:
            typeof remoteUser.vip_sharing_attempt_count === 'number'
              ? Math.max(remoteUser.vip_sharing_attempt_count, localUser?.vip_sharing_attempt_count || 0)
              : localUser?.vip_sharing_attempt_count || 0,
          vip_last_sharing_attempt_at:
            remoteUser.vip_last_sharing_attempt_at || localUser?.vip_last_sharing_attempt_at || null,
          referral_code: remoteUser.referral_code || localUser?.referral_code || undefined,
          referred_by_user_id: remoteUser.referred_by_user_id ?? localUser?.referred_by_user_id ?? null,
          referred_by_code: remoteUser.referred_by_code ?? localUser?.referred_by_code ?? null,
          referred_at: remoteUser.referred_at ?? localUser?.referred_at ?? null,
          bonus_vip_days:
            typeof remoteUser.bonus_vip_days === 'number'
              ? Math.max(remoteUser.bonus_vip_days, localUser?.bonus_vip_days || 0)
              : localUser?.bonus_vip_days || 0,
          created_at: remoteUser.created_at || localUser?.created_at || new Date().toISOString(),
          last_login_at: remoteUser.last_login_at || localUser?.last_login_at || null,
        };

        const idx = this.db.users.findIndex(
          (u) => u.id === mergedUser.id || u.email.toLowerCase() === mergedUser.email
        );
        if (idx !== -1) {
          this.db.users[idx] = mergedUser;
        } else {
          this.db.users.push(mergedUser);
        }
        this.saveDatabase(this.db);
        return mergedUser;
      }
    } catch {
      // Fall back to in-memory user if Supabase query fails transiently
    }

    return localUser;
  }

  public async createUser(user: User): Promise<User> {
    this.db.users.push(user);
    this.saveDatabase(this.db);
    if (this.supabase) {
      const { error } = await this.supabase.from('app_users').insert({
        id: user.id,
        email: user.email.toLowerCase(),
        password_hash: user.password_hash,
        role: user.role,
        vip_active: Boolean(user.vip_active),
        vip_expires_at: user.vip_expires_at || null,
        free_access_expires_at: user.free_access_expires_at || null,
        name: user.name || '',
        is_blocked: Boolean(user.is_blocked),
        blocked_at: user.blocked_at || null,
        blocked_reason: user.blocked_reason || null,
        blocked_by: user.blocked_by || null,
        created_at: user.created_at || new Date().toISOString(),
        last_login_at: user.last_login_at || null,
      });
      if (error) {
        console.error('[STORAGE] Failed to persist user into Supabase app_users:', error);
        this.db.users = this.db.users.filter((u) => u.id !== user.id);
        this.saveDatabase(this.db);
        throw new Error(`Database persistence failure: ${error.message}`);
      }
    }
    return user;
  }

  public async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const idx = this.db.users.findIndex((u) => u.id === id);
    if (idx === -1) return undefined;
    const prevUser = { ...this.db.users[idx] };
    const { id: _ignoreId, created_at: _ignoreCreated, ...safeUpdates } = updates;
    this.db.users[idx] = { ...this.db.users[idx], ...safeUpdates };
    this.saveDatabase(this.db);

    if (this.supabase) {
      const payload: Record<string, unknown> = {};
      if (safeUpdates.email !== undefined) payload.email = safeUpdates.email.toLowerCase();
      if (safeUpdates.password_hash !== undefined) payload.password_hash = safeUpdates.password_hash;
      if (safeUpdates.role !== undefined) payload.role = safeUpdates.role;
      if (safeUpdates.vip_active !== undefined) payload.vip_active = safeUpdates.vip_active;
      if (safeUpdates.vip_expires_at !== undefined) payload.vip_expires_at = safeUpdates.vip_expires_at;
      if (safeUpdates.free_access_expires_at !== undefined) payload.free_access_expires_at = safeUpdates.free_access_expires_at;
      if (safeUpdates.name !== undefined) payload.name = safeUpdates.name;
      if (safeUpdates.is_blocked !== undefined) payload.is_blocked = safeUpdates.is_blocked;
      if (safeUpdates.blocked_at !== undefined) payload.blocked_at = safeUpdates.blocked_at;
      if (safeUpdates.blocked_reason !== undefined) payload.blocked_reason = safeUpdates.blocked_reason;
      if (safeUpdates.blocked_by !== undefined) payload.blocked_by = safeUpdates.blocked_by;
      if (safeUpdates.vip_bound_device_id !== undefined) payload.vip_bound_device_id = safeUpdates.vip_bound_device_id;
      if (safeUpdates.vip_bound_session_id !== undefined) payload.vip_bound_session_id = safeUpdates.vip_bound_session_id;
      if (safeUpdates.vip_device_label !== undefined) payload.vip_device_label = safeUpdates.vip_device_label;
      if (safeUpdates.vip_device_bound_at !== undefined) payload.vip_device_bound_at = safeUpdates.vip_device_bound_at;
      if (safeUpdates.vip_device_last_seen_at !== undefined) payload.vip_device_last_seen_at = safeUpdates.vip_device_last_seen_at;
      if (safeUpdates.vip_device_last_ip !== undefined) payload.vip_device_last_ip = safeUpdates.vip_device_last_ip;
      if (safeUpdates.vip_device_last_ua !== undefined) payload.vip_device_last_ua = safeUpdates.vip_device_last_ua;
      if (safeUpdates.vip_device_reset_count !== undefined) payload.vip_device_reset_count = safeUpdates.vip_device_reset_count;
      if (safeUpdates.vip_device_last_reset_at !== undefined) payload.vip_device_last_reset_at = safeUpdates.vip_device_last_reset_at;
      if (safeUpdates.vip_device_last_reset_by !== undefined) payload.vip_device_last_reset_by = safeUpdates.vip_device_last_reset_by;
      if (safeUpdates.vip_sharing_attempt_count !== undefined) payload.vip_sharing_attempt_count = safeUpdates.vip_sharing_attempt_count;
      if (safeUpdates.vip_last_sharing_attempt_at !== undefined) payload.vip_last_sharing_attempt_at = safeUpdates.vip_last_sharing_attempt_at;
      if (safeUpdates.last_login_at !== undefined) payload.last_login_at = safeUpdates.last_login_at;
      if (safeUpdates.referral_code !== undefined) payload.referral_code = safeUpdates.referral_code;
      if (safeUpdates.referred_by_user_id !== undefined) payload.referred_by_user_id = safeUpdates.referred_by_user_id;
      if (safeUpdates.referred_by_code !== undefined) payload.referred_by_code = safeUpdates.referred_by_code;
      if (safeUpdates.referred_at !== undefined) payload.referred_at = safeUpdates.referred_at;
      if (safeUpdates.bonus_vip_days !== undefined) payload.bonus_vip_days = safeUpdates.bonus_vip_days;
      if (safeUpdates.vip_allowed_platform_ids !== undefined) {
        payload.vip_allowed_platform_ids = safeUpdates.vip_allowed_platform_ids;
      }
      if (safeUpdates.vip_platform_expiries !== undefined) {
        payload.vip_platform_expiries = safeUpdates.vip_platform_expiries;
      }

      if (Object.keys(payload).length > 0) {
        const userEmail = this.db.users[idx].email.toLowerCase();
        const { error: updateErr } = await this.supabase
          .from('app_users')
          .update(payload)
          .or(`id.eq.${id},email.eq.${userEmail}`);
        if (updateErr) {
          const errMsg = String(updateErr.message || '');
          const isSchemaErr =
            updateErr.code === 'PGRST204' ||
            updateErr.code === '42703' ||
            errMsg.includes('schema cache') ||
            errMsg.includes('does not exist');
          if (!isSchemaErr) {
            this.db.users[idx] = prevUser;
            this.saveDatabase(this.db);
            console.error('[STORAGE] Error syncing updateUser to Supabase:', updateErr);
            throw new Error(`Database persistence failure (app_users): ${updateErr.message}`);
          }
          const corePayload: Record<string, unknown> = {};
          const coreKeys = [
            'email',
            'password_hash',
            'role',
            'vip_active',
            'vip_expires_at',
            'free_access_expires_at',
            'name',
            'is_blocked',
            'blocked_at',
            'blocked_reason',
            'blocked_by',
            'last_login_at',
          ];
          for (const k of coreKeys) {
            if (k in payload) corePayload[k] = payload[k];
          }
          if (Object.keys(corePayload).length > 0) {
            const { error: coreErr } = await this.supabase
              .from('app_users')
              .update(corePayload)
              .or(`id.eq.${id},email.eq.${userEmail}`);
            if (coreErr) {
              this.db.users[idx] = prevUser;
              this.saveDatabase(this.db);
              console.error('[STORAGE] Error syncing core updateUser to Supabase:', coreErr);
              throw new Error(`Database persistence failure (app_users): ${coreErr.message}`);
            }
          }
        }
      }
    }

    return this.db.users[idx];
  }

  public async deleteUser(id: string): Promise<boolean> {
    const target = this.db.users.find((u) => u.id === id);
    if (!target) return false;
    if (target.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com') return false;

    this.db.users = this.db.users.filter((u) => u.id !== id);
    this.saveDatabase(this.db);

    if (this.supabase) {
      try {
        await this.supabase.from('app_users').delete().or(`id.eq.${id},email.eq.${target.email.toLowerCase()}`);
      } catch (err) {
        console.error('[STORAGE] Error deleting user from Supabase app_users:', err);
      }
    }
    return true;
  }

  // --- Platforms ---
  public getPlatforms(onlyVisible = false): Platform[] {
    const list = onlyVisible ? this.db.platforms.filter((p) => p.is_visible) : this.db.platforms;
    return [...list].sort((a, b) => a.display_order - b.display_order);
  }

  public getPlatformById(id: string): Platform | undefined {
    const uuid = ensureUuid(id);
    return this.db.platforms.find((p) => p.id === id || p.id === uuid);
  }

  public async addPlatform(platform: Platform): Promise<Platform> {
    const platUuid = ensureUuid(platform.id || crypto.randomUUID());
    const newPlat: Platform = {
      ...platform,
      id: platUuid,
      created_at: platform.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const prevPlatforms = [...this.db.platforms];
    this.db.platforms.push(newPlat);
    this.saveDatabase(this.db);
    if (this.supabase) {
      const { error } = await this.supabase.from('platforms').upsert(newPlat);
      if (error) {
        this.db.platforms = prevPlatforms;
        this.saveDatabase(this.db);
        console.error('[STORAGE] Error syncing addPlatform to Supabase:', error);
        throw new Error(`Database persistence failure (platforms): ${error.message}`);
      }
    }
    return newPlat;
  }

  public async updatePlatform(id: string, updates: Partial<Platform>): Promise<Platform | undefined> {
    const uuid = ensureUuid(id);
    const idx = this.db.platforms.findIndex((p) => p.id === id || p.id === uuid);
    if (idx === -1) return undefined;
    const prevPlat = { ...this.db.platforms[idx] };
    const { id: _ignoreId, created_at: _ignoreCreated, ...safeUpdates } = updates;
    const targetUuid = ensureUuid(this.db.platforms[idx].id);
    const updatedPlat: Platform = {
      ...this.db.platforms[idx],
      ...safeUpdates,
      id: targetUuid,
      updated_at: new Date().toISOString(),
    };
    this.db.platforms[idx] = updatedPlat;
    this.saveDatabase(this.db);
    if (this.supabase) {
      const { error } = await this.supabase.from('platforms').upsert(updatedPlat);
      if (error) {
        this.db.platforms[idx] = prevPlat;
        this.saveDatabase(this.db);
        console.error('[STORAGE] Error syncing updatePlatform to Supabase:', error);
        throw new Error(`Database persistence failure (platforms): ${error.message}`);
      }
    }
    return this.db.platforms[idx];
  }

  public async deletePlatform(id: string): Promise<boolean> {
    const uuid = ensureUuid(id);
    const prevPlatforms = [...this.db.platforms];
    const before = this.db.platforms.length;
    this.db.platforms = this.db.platforms.filter((p) => p.id !== id && p.id !== uuid);
    if (this.db.platforms.length !== before) {
      this.saveDatabase(this.db);
      if (this.supabase) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const { error } = isUuid
          ? await this.supabase.from('platforms').delete().eq('id', id)
          : await this.supabase.from('platforms').delete().eq('id', uuid);
        if (error) {
          this.db.platforms = prevPlatforms;
          this.saveDatabase(this.db);
          console.error('[STORAGE] Error syncing deletePlatform to Supabase:', error);
          throw new Error(`Database deletion failure (platforms): ${error.message}`);
        }
      }
      return true;
    }
    return false;
  }

  // --- VIP Batches ---
  public getVipBatches(): VipBatch[] {
    return [...this.db.vip_batches].sort((a, b) => a.display_order - b.display_order);
  }

  public async addVipBatch(batch: VipBatch): Promise<VipBatch> {
    const batchUuid = ensureUuid(batch.id || crypto.randomUUID());
    const newBatch: VipBatch = {
      ...batch,
      id: batchUuid,
      created_at: batch.created_at || new Date().toISOString(),
    };
    this.db.vip_batches.push(newBatch);
    this.saveDatabase(this.db);
    if (this.supabase) {
      const { error } = await this.supabase.from('vip_batches').upsert(newBatch);
      if (error) {
        console.error('[STORAGE] Error syncing addVipBatch to Supabase:', error);
        throw new Error(`Database persistence failure (vip_batches): ${error.message}`);
      }
    }
    return newBatch;
  }

  public async updateVipBatch(id: string, updates: Partial<VipBatch>): Promise<VipBatch | undefined> {
    const uuid = ensureUuid(id);
    const idx = this.db.vip_batches.findIndex((b) => b.id === id || b.id === uuid);
    if (idx === -1) return undefined;
    const { id: _ignoreId, created_at: _ignoreCreated, ...safeUpdates } = updates;
    const targetUuid = ensureUuid(this.db.vip_batches[idx].id);
    const updatedBatch: VipBatch = {
      ...this.db.vip_batches[idx],
      ...safeUpdates,
      id: targetUuid,
    };
    this.db.vip_batches[idx] = updatedBatch;
    this.saveDatabase(this.db);
    if (this.supabase) {
      const { error } = await this.supabase.from('vip_batches').upsert(updatedBatch);
      if (error) {
        console.error('[STORAGE] Error syncing updateVipBatch to Supabase:', error);
        throw new Error(`Database persistence failure (vip_batches): ${error.message}`);
      }
    }
    return this.db.vip_batches[idx];
  }

  public async deleteVipBatch(id: string): Promise<boolean> {
    const uuid = ensureUuid(id);
    const before = this.db.vip_batches.length;
    this.db.vip_batches = this.db.vip_batches.filter((b) => b.id !== id && b.id !== uuid);
    if (this.db.vip_batches.length !== before) {
      this.saveDatabase(this.db);
      if (this.supabase) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const { error } = isUuid
          ? await this.supabase.from('vip_batches').delete().eq('id', id)
          : await this.supabase.from('vip_batches').delete().eq('id', uuid);
        if (error) {
          console.error('[STORAGE] Error syncing deleteVipBatch to Supabase:', error);
          throw new Error(`Database deletion failure (vip_batches): ${error.message}`);
        }
      }
      return true;
    }
    return false;
  }

  // --- VIP Plans ---
  public getVipPlans(onlyActive = false): VipPlan[] {
    const list = onlyActive ? this.db.vip_plans.filter((p) => p.is_active) : this.db.vip_plans;
    return [...list].sort((a, b) => a.display_order - b.display_order);
  }

  public async addVipPlan(plan: VipPlan): Promise<VipPlan> {
    const planUuid = ensureUuid(plan.id || crypto.randomUUID());
    const newPlan: VipPlan = {
      ...plan,
      id: planUuid,
      plan_scope: plan.plan_scope === 'single_platform' ? 'single_platform' : 'all_platforms',
      original_price_inr: plan.original_price_inr !== undefined ? Number(plan.original_price_inr) : undefined,
      bonus_days: plan.bonus_days !== undefined ? Math.max(0, Math.round(Number(plan.bonus_days) || 0)) : 0,
      discount_label: plan.discount_label ? String(plan.discount_label).trim() : '',
      created_at: plan.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.db.vip_plans.push(newPlan);
    this.saveDatabase(this.db);
    if (this.supabase) {
      const { error } = await this.supabase.from('vip_plans').upsert(newPlan);
      if (error) {
        // Fallback if remote Supabase table does not yet have plan_scope / original_price_inr / bonus_days / discount_label columns
        const { plan_scope: _ps, original_price_inr: _op, bonus_days: _bd, discount_label: _dl, ...legacyPlan } = newPlan;
        const { error: retryErr } = await this.supabase.from('vip_plans').upsert(legacyPlan);
        if (retryErr) {
          console.error('[STORAGE] Error syncing addVipPlan to Supabase:', retryErr);
          throw new Error(`Database persistence failure (vip_plans): ${retryErr.message}`);
        }
      }
    }
    return newPlan;
  }

  public async updateVipPlan(id: string, updates: Partial<VipPlan>): Promise<VipPlan | undefined> {
    const uuid = ensureUuid(id);
    const idx = this.db.vip_plans.findIndex((p) => p.id === id || p.id === uuid);
    if (idx === -1) return undefined;
    const { id: _ignoreId, created_at: _ignoreCreated, ...safeUpdates } = updates;
    const targetUuid = ensureUuid(this.db.vip_plans[idx].id);
    const mergedScope =
      safeUpdates.plan_scope !== undefined
        ? safeUpdates.plan_scope === 'single_platform'
          ? 'single_platform'
          : 'all_platforms'
        : this.db.vip_plans[idx].plan_scope === 'single_platform'
        ? 'single_platform'
        : 'all_platforms';
    const updatedPlan: VipPlan = {
      ...this.db.vip_plans[idx],
      ...safeUpdates,
      plan_scope: mergedScope,
      id: targetUuid,
      updated_at: new Date().toISOString(),
    };
    this.db.vip_plans[idx] = updatedPlan;
    this.saveDatabase(this.db);
    if (this.supabase) {
      const { error } = await this.supabase.from('vip_plans').upsert(updatedPlan);
      if (error) {
        const { plan_scope: _ps, original_price_inr: _op, bonus_days: _bd, discount_label: _dl, ...legacyPlan } = updatedPlan;
        const { error: retryErr } = await this.supabase.from('vip_plans').upsert(legacyPlan);
        if (retryErr) {
          console.error('[STORAGE] Error syncing updateVipPlan to Supabase:', retryErr);
          throw new Error(`Database persistence failure (vip_plans): ${retryErr.message}`);
        }
      }
    }
    return this.db.vip_plans[idx];
  }

  public async deleteVipPlan(id: string): Promise<boolean> {
    const uuid = ensureUuid(id);
    const before = this.db.vip_plans.length;
    this.db.vip_plans = this.db.vip_plans.filter((p) => p.id !== id && p.id !== uuid);
    if (this.db.vip_plans.length !== before) {
      this.saveDatabase(this.db);
      if (this.supabase) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const { error } = isUuid
          ? await this.supabase.from('vip_plans').delete().eq('id', id)
          : await this.supabase.from('vip_plans').delete().eq('id', uuid);
        if (error) {
          console.error('[STORAGE] Error syncing deleteVipPlan to Supabase:', error);
          throw new Error(`Database deletion failure (vip_plans): ${error.message}`);
        }
      }
      return true;
    }
    return false;
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    return this.db.settings;
  }

  public getStorageHealth(): {
    mode: 'supabase' | 'supabase_cloud_storage' | 'local_json' | 'local_json_fallback';
    supabaseConfigured: boolean;
    supabaseSchemaReady: boolean;
    supabaseSchemaError: string | null;
    lastUpdatedAt: string;
  } {
    const mode = this.supabase
      ? 'supabase'
      : this.cloudStorageClient
      ? 'supabase_cloud_storage'
      : this.supabaseConfiguredFlag
      ? 'local_json_fallback'
      : 'local_json';
    return {
      mode,
      supabaseConfigured: this.supabaseConfiguredFlag || Boolean(this.supabase) || Boolean(this.cloudStorageClient),
      supabaseSchemaReady: this.supabaseSchemaReady || Boolean(this.cloudStorageClient),
      supabaseSchemaError: this.cloudStorageClient ? null : this.supabaseSchemaError,
      lastUpdatedAt: this.lastCloudSyncAt || this.db.settings?.updated_at || new Date().toISOString(),
    };
  }

  public async syncAllLocalToSupabase(
    supabaseUrl: string,
    supabaseKey: string
  ): Promise<{
    synced: boolean;
    error?: string;
    counts?: {
      users: number;
      platforms: number;
      vip_plans: number;
      vip_batches: number;
      announcements: number;
      payment_records: number;
    };
    storage: ReturnType<StorageEngine['getStorageHealth']>;
  }> {
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project')) {
      return {
        synced: true,
        counts: {
          users: this.db.users.length,
          platforms: this.db.platforms.length,
          vip_plans: this.db.vip_plans.length,
          vip_batches: this.db.vip_batches.length,
          announcements: this.db.announcements.length,
          payment_records: this.db.payment_records.length,
        },
        storage: this.getStorageHealth(),
      };
    }

    try {
      const client = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const [{ error: settingsProbeErr }, { error: platformsProbeErr }] = await Promise.all([
        client.from('app_settings').select('id').limit(1),
        client.from('platforms').select('id').limit(1),
      ]);

      const probeErr = settingsProbeErr || platformsProbeErr;
      if (probeErr) {
        // Automatically sync via private Supabase Cloud Storage bucket without requiring manual SQL
        const activated = await this.activateAutomaticCloudStorage(client, true);
        if (activated) {
          return {
            synced: true,
            counts: {
              users: this.db.users.length,
              platforms: this.db.platforms.length,
              vip_plans: this.db.vip_plans.length,
              vip_batches: this.db.vip_batches.length,
              announcements: this.db.announcements.length,
              payment_records: this.db.payment_records.length,
            },
            storage: this.getStorageHealth(),
          };
        }
        return {
          synced: false,
          error: 'Automatic cloud sync temporarily unavailable. Local persistent storage remains active.',
          storage: this.getStorageHealth(),
        };
      }

      // Activate Supabase client permanently for all subsequent writes
      this.supabase = client;
      this.supabaseConfiguredFlag = true;
      this.supabaseSchemaReady = true;
      this.supabaseSchemaError = null;

      // Push settings first
      await this.syncSettingsToSupabase(client);

      // Push users, platforms, plans, batches, announcements, payments
      const upsertQuietly = async (table: string, rows: Record<string, any>[]) => {
        let count = 0;
        for (const row of rows) {
          const { error } = await client.from(table).upsert(row);
          if (!error) count++;
        }
        return count;
      };

      const counts = {
        users: await upsertQuietly('app_users', this.db.users as any[]),
        platforms: await upsertQuietly('platforms', this.db.platforms as any[]),
        vip_plans: await upsertQuietly('vip_plans', this.db.vip_plans as any[]),
        vip_batches: await upsertQuietly('vip_batches', this.db.vip_batches as any[]),
        announcements: await upsertQuietly('announcements', this.db.announcements as any[]),
        payment_records: await upsertQuietly('payment_records', this.db.payment_records as any[]),
      };

      this.saveDatabase(this.db);

      return {
        synced: true,
        counts,
        storage: this.getStorageHealth(),
      };
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : 'Failed to verify and sync Supabase cloud database.';
      return {
        synced: false,
        error: msg,
        storage: this.getStorageHealth(),
      };
    }
  }

  public async syncSettingsToSupabase(customClient?: any): Promise<void> {
    const client = customClient || this.supabase;
    if (!client) return;

    const fullPayload: Record<string, any> = {
      id: 'global_config',
      ...this.db.settings,
    };

    const knownExtendedColumns = [
      'referral_discount_config',
      'referral_program_enabled',
      'festival_decorations_enabled',
      'active_festival_id',
      'festival_configs_json',
      'festival_version',
      'vip_grace_period_hours',
      'referral_reward_days',
      'home_single_vip_label',
      'home_single_vip_price',
      'home_single_vip_duration_days',
      'home_single_vip_destination',
      'home_single_vip_url',
      'home_all_vip_label',
      'home_all_vip_price',
      'home_all_vip_duration_days',
      'home_all_vip_destination',
      'home_all_vip_url',
    ];

    let strippedAnyExtended = false;
    let lastError: any = null;
    const workingPayload: Record<string, any> = { ...fullPayload };

    for (let attempt = 0; attempt < 25; attempt++) {
      const { error } = await client.from('app_settings').upsert(workingPayload);
      if (!error) {
        lastError = null;
        break;
      }

      lastError = error;
      const errMsg = String(error.message || '');
      const isMissingColumnError =
        error.code === 'PGRST204' ||
        error.code === '42703' ||
        errMsg.includes('schema cache') ||
        errMsg.includes('Could not find the') ||
        errMsg.includes('does not exist');

      if (!isMissingColumnError) {
        break;
      }

      // Extract the specific column reported by PostgREST / PostgreSQL
      const matchSingleQuote = errMsg.match(/Could not find the '([^']+)' column/i);
      const matchDoubleQuote = errMsg.match(/column "([^"]+)" of relation "app_settings" does not exist/i);
      const missingCol = matchSingleQuote?.[1] || matchDoubleQuote?.[1];

      if (missingCol && missingCol !== 'id' && missingCol in workingPayload) {
        delete workingPayload[missingCol];
        strippedAnyExtended = true;
        continue;
      }

      // Fallback: strip all known extended columns at once if not already stripped
      let removedCount = 0;
      for (const extCol of knownExtendedColumns) {
        if (extCol in workingPayload) {
          delete workingPayload[extCol];
          removedCount++;
          strippedAnyExtended = true;
        }
      }
      if (removedCount === 0) {
        break;
      }
    }

    if (lastError) {
      console.error('[STORAGE] Error syncing updateSettings to Supabase:', lastError);
      throw new Error(`Database persistence failure (settings): ${lastError.message}`);
    }

    // Persist complete non-festival settings snapshot in SETTINGS_EXT_STATE so zero settings
    // are ever dropped if external Supabase schema is missing optional columns prior to migration.
    try {
      const { festival_configs_json: _omitFest, ...nonFestivalSettings } = this.db.settings as unknown as Record<string, unknown>;
      const extSnapshot = JSON.stringify({
        ...nonFestivalSettings,
        referral_program_enabled: this.db.settings.referral_program_enabled !== false,
        referral_discount_config: this.getReferralDiscountConfig(),
        vip_grace_period_hours: this.db.settings.vip_grace_period_hours ?? 24,
        referral_reward_days: this.db.settings.referral_reward_days ?? 7,
        updated_at: this.db.settings.updated_at || new Date().toISOString(),
      });
      await client.from('key_records').upsert({
        id: '00000000-0000-4000-8000-00000000cf99',
        user_id: '27f86505-bb19-465f-9597-aecf7ec7ee85',
        user_email: 'system@studyblunder.app',
        token: `SETTINGS_EXT_STATE:${extSnapshot}`,
        shortener_url: 'settings_ext_state',
        status: 'expired',
        generated_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
      });
    } catch {
      // Non-fatal fallback
    }

    if (strippedAnyExtended || this.db.settings.referral_discount_config) {
      try {
        const cfg = this.getReferralDiscountConfig();
        await client.from('referral_discount_config').upsert({
          id: 'referral_discount_config',
          discount_enabled: Boolean(cfg.discount_enabled),
          discount_type: cfg.discount_type || 'percentage',
          discount_value: Number(cfg.discount_value) || 0,
          min_purchase_amount: Number(cfg.min_purchase_amount) || 0,
          max_discount_amount: Number(cfg.max_discount_amount) || 0,
          valid_from: cfg.valid_from || null,
          valid_until: cfg.valid_until || null,
          usage_limit_per_user: Number(cfg.usage_limit_per_user) || 1,
          combine_with_plan_discount: Boolean(cfg.combine_with_plan_discount),
          campaign_label: cfg.campaign_label || 'Referral Welcome Offer',
          updated_at: cfg.updated_at || new Date().toISOString(),
          updated_by: cfg.updated_by || null,
        });
      } catch {
        // Ignore if referral_discount_config table is not yet created
      }
    }
  }

  public async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const prevSettings = { ...this.db.settings };
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates || {}).filter(([, v]) => v !== undefined)
    ) as Partial<AppSettings>;

    const preservedDiscountConfig =
      cleanUpdates.referral_discount_config && typeof cleanUpdates.referral_discount_config === 'object'
        ? {
            ...this.getReferralDiscountConfig(),
            ...cleanUpdates.referral_discount_config,
          }
        : this.getReferralDiscountConfig();

    const preservedReferralProgramEnabled =
      cleanUpdates.referral_program_enabled !== undefined
        ? Boolean(cleanUpdates.referral_program_enabled)
        : this.isReferralProgramEnabled();

    this.db.settings = {
      ...this.db.settings,
      ...cleanUpdates,
      referral_program_enabled: preservedReferralProgramEnabled,
      referral_discount_config: preservedDiscountConfig,
      app_name: (cleanUpdates.app_name !== undefined ? cleanUpdates.app_name : this.db.settings.app_name) || 'STUDY BLUNDER',
      updated_at: new Date().toISOString(),
    };
    this.saveDatabase(this.db);
    if (this.supabase) {
      try {
        await this.syncSettingsToSupabase();
      } catch (err) {
        this.db.settings = prevSettings;
        this.saveDatabase(this.db);
        throw err;
      }
    }
    return this.db.settings;
  }

  // --- Announcements ---
  public getAnnouncements(onlyPublished = false): Announcement[] {
    const now = Date.now();
    const list = onlyPublished
      ? this.db.announcements.filter((a) => {
          if (!a.is_published) return false;
          if (a.start_date) {
            const startMs = new Date(a.start_date).getTime();
            if (!isNaN(startMs) && now < startMs) return false;
          }
          if (a.end_date) {
            const endMs = new Date(a.end_date).getTime();
            if (!isNaN(endMs) && now > endMs) return false;
          }
          return true;
        })
      : this.db.announcements;

    return [...list].sort((a, b) => {
      const orderA = typeof a.display_order === 'number' ? a.display_order : 999;
      const orderB = typeof b.display_order === 'number' ? b.display_order : 999;
      if (orderA !== orderB) return orderA - orderB;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  public async addAnnouncement(announcement: Announcement): Promise<Announcement> {
    const annUuid = ensureUuid(announcement.id || crypto.randomUUID());
    const newAnn: Announcement = {
      ...announcement,
      id: annUuid,
      created_at: announcement.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.db.announcements.push(newAnn);
    this.saveDatabase(this.db);
    if (this.supabase) {
      const { error } = await this.supabase.from('announcements').upsert(newAnn);
      if (error) {
        console.error('[STORAGE] Error syncing addAnnouncement to Supabase:', error);
        throw new Error(`Database persistence failure (announcements): ${error.message}`);
      }
    }
    return newAnn;
  }

  public async updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<Announcement | undefined> {
    const uuid = ensureUuid(id);
    const idx = this.db.announcements.findIndex((a) => a.id === id || a.id === uuid);
    if (idx === -1) return undefined;
    const { id: _ignoreId, created_at: _ignoreCreated, ...safeUpdates } = updates;
    const targetUuid = ensureUuid(this.db.announcements[idx].id);
    const updatedAnn: Announcement = {
      ...this.db.announcements[idx],
      ...safeUpdates,
      id: targetUuid,
      updated_at: new Date().toISOString(),
    };
    this.db.announcements[idx] = updatedAnn;
    this.saveDatabase(this.db);
    if (this.supabase) {
      const { error } = await this.supabase.from('announcements').upsert(updatedAnn);
      if (error) {
        console.error('[STORAGE] Error syncing updateAnnouncement to Supabase:', error);
        throw new Error(`Database persistence failure (announcements): ${error.message}`);
      }
    }
    return this.db.announcements[idx];
  }

  public async deleteAnnouncement(id: string): Promise<boolean> {
    const uuid = ensureUuid(id);
    const before = this.db.announcements.length;
    this.db.announcements = this.db.announcements.filter((a) => a.id !== id && a.id !== uuid);
    if (this.db.announcements.length !== before) {
      this.saveDatabase(this.db);
      if (this.supabase) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const { error } = isUuid
          ? await this.supabase.from('announcements').delete().eq('id', id)
          : await this.supabase.from('announcements').delete().eq('id', uuid);
        if (error) {
          console.error('[STORAGE] Error syncing deleteAnnouncement to Supabase:', error);
          throw new Error(`Database deletion failure (announcements): ${error.message}`);
        }
      }
      return true;
    }
    return false;
  }

  // --- Login History ---
  public getLoginHistory(): LoginHistoryEntry[] {
    return [...this.db.login_history].reverse();
  }

  public async recordLogin(entry: Omit<LoginHistoryEntry, 'id' | 'timestamp'>): Promise<LoginHistoryEntry> {
    const record: LoginHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.db.login_history.unshift(record);
    // Keep max 500 records
    if (this.db.login_history.length > 500) {
      this.db.login_history.pop();
    }
    this.saveDatabase(this.db);
    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('login_history').insert({
          id: record.id,
          user_id: record.user_id,
          email: record.email,
          ip_address: record.ip_address,
          user_agent: record.user_agent,
          status: record.status,
          timestamp: record.timestamp,
        });
        if (error) {
          // If external Supabase table still has legacy CHECK (status IN ('success', 'failed')),
          // persist with status='failed' and tag user_agent so audit entry is never lost
          if (record.status === 'DEVICE_MISMATCH_BLOCKED' || record.status === 'DEVICE_RESET_BY_ADMIN') {
            const taggedUa = record.user_agent.includes(`[${record.status}]`)
              ? record.user_agent
              : `${record.user_agent} [${record.status}]`;
            await this.supabase.from('login_history').insert({
              id: record.id,
              user_id: record.user_id,
              email: record.email,
              ip_address: record.ip_address,
              user_agent: taggedUa,
              status: 'failed',
              timestamp: record.timestamp,
            });
          } else {
            console.error('[STORAGE] Error inserting login_history into Supabase:', error);
          }
        }
      } catch (err) {
        console.error('[STORAGE] Error syncing recordLogin to Supabase:', err);
      }
    }
    return record;
  }

  public async deleteLoginHistoryEntry(id: string): Promise<boolean> {
    const uuid = ensureUuid(id);
    const before = this.db.login_history.length;
    this.db.login_history = this.db.login_history.filter((entry) => entry.id !== id && entry.id !== uuid);
    if (this.db.login_history.length !== before) {
      this.saveDatabase(this.db);
      if (this.supabase) {
        try {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
          const query = isUuid
            ? this.supabase.from('login_history').delete().eq('id', id)
            : this.supabase.from('login_history').delete().eq('id', uuid);
          await query;
        } catch (err) {
          console.error('[STORAGE] Error deleting login_history from Supabase:', err);
        }
      }
      return true;
    }
    return false;
  }

  // --- Payment Records ---
  public generatePaymentRequestId(): string {
    const year = new Date().getFullYear();
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      const bytes = crypto.randomBytes(6);
      for (let i = 0; i < 6; i++) {
        code += alphabet[bytes[i] % alphabet.length];
      }
      const reqId = `SF-VIP-${year}-${code}`;
      const exists = this.db.payment_records.some((p) => p.request_id === reqId);
      if (!exists) return reqId;
    }
    return `SF-VIP-${year}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  }

  public getActivePendingPaymentByUser(userId: string, email?: string): PaymentRecord | undefined {
    const cleanEmail = (email || '').trim().toLowerCase();
    return this.db.payment_records.find(
      (p) =>
        (p.user_id === userId || (cleanEmail && p.email.toLowerCase() === cleanEmail)) &&
        (p.status === 'pending' || p.status === 'pending_verification')
    );
  }

  public getPayments(): PaymentRecord[] {
    return [...this.db.payment_records].reverse();
  }

  public getPaymentsByUserId(userId: string): PaymentRecord[] {
    return [...this.db.payment_records]
      .filter((p) => p.user_id === userId)
      .reverse();
  }

  public getPaymentById(id: string): PaymentRecord | undefined {
    return this.db.payment_records.find((p) => p.id === id || p.request_id === id);
  }

  public async addPayment(record: Omit<PaymentRecord, 'id' | 'created_at'> & { id?: string; created_at?: string }): Promise<PaymentRecord> {
    const newRecord: PaymentRecord = {
      ...record,
      id: record.id || `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      request_id: record.request_id || this.generatePaymentRequestId(),
      purchase_source: record.purchase_source || 'in_app',
      created_at: record.created_at || new Date().toISOString(),
    };
    this.db.payment_records.unshift(newRecord);
    this.saveDatabase(this.db);
    if (this.supabase) {
      try {
        const safeUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(newRecord.user_id)
          ? newRecord.user_id
          : null;
        const legacyPayload = {
          id: newRecord.id,
          user_id: safeUserId,
          email: newRecord.email,
          submitted_email: newRecord.submitted_email || null,
          plan_id: newRecord.plan_id || null,
          plan_title: newRecord.plan_title || 'VIP Plan',
          plan_duration_days: newRecord.plan_duration_days || null,
          amount: newRecord.amount,
          expected_amount: newRecord.expected_amount || null,
          amount_mismatch: Boolean(newRecord.amount_mismatch),
          currency: newRecord.currency || 'INR',
          status: newRecord.status,
          payment_method: newRecord.payment_method || 'qr_verification',
          transaction_reference: newRecord.transaction_reference,
          screenshot_url: newRecord.screenshot_url || null,
          screenshot_storage_path: newRecord.screenshot_storage_path || null,
          admin_note: newRecord.admin_note || null,
          reviewed_by: newRecord.reviewed_by || null,
          reviewed_at: newRecord.reviewed_at || null,
          created_at: newRecord.created_at,
          updated_at: new Date().toISOString(),
        };
        const { error } = await this.supabase.from('payment_records').upsert({
          ...legacyPayload,
          request_id: newRecord.request_id,
          purchase_source: newRecord.purchase_source,
          bonus_days_applied: newRecord.bonus_days_applied || 0,
          vip_scope: newRecord.vip_scope || 'all_platforms',
          selected_platform_id: newRecord.selected_platform_id || null,
          selected_platform_name: newRecord.selected_platform_name || null,
        });
        if (error) {
          const { error: retryErr } = await this.supabase.from('payment_records').upsert(legacyPayload);
          if (retryErr) {
            console.error('[STORAGE] Error syncing addPayment to Supabase:', retryErr);
            throw new Error(`Database persistence failure (payment_records): ${retryErr.message}`);
          }
        }
      } catch (err: any) {
        console.error('[STORAGE] Error syncing addPayment to Supabase:', err);
        throw err;
      }
    }
    return newRecord;
  }

  public async updatePayment(id: string, updates: Partial<PaymentRecord>): Promise<PaymentRecord | undefined> {
    const idx = this.db.payment_records.findIndex((p) => p.id === id || p.request_id === id);
    if (idx === -1) return undefined;
    const targetId = this.db.payment_records[idx].id;
    const { id: _ignoreId, created_at: _ignoreCreated, ...safeUpdates } = updates;
    this.db.payment_records[idx] = {
      ...this.db.payment_records[idx],
      ...safeUpdates,
      updated_at: new Date().toISOString(),
    };
    this.saveDatabase(this.db);
    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('payment_records').update(safeUpdates).eq('id', targetId);
        if (error) {
          const {
            request_id: _ri,
            purchase_source: _ps,
            bonus_days_applied: _bda,
            rejection_reason: _rr,
            vip_scope: _vs,
            selected_platform_id: _spid,
            selected_platform_name: _spn,
            ...legacyUpdates
          } = safeUpdates;
          const { error: retryErr } = await this.supabase.from('payment_records').update(legacyUpdates).eq('id', targetId);
          if (retryErr) {
            console.error('[STORAGE] Error syncing updatePayment to Supabase:', retryErr);
            throw new Error(`Database persistence failure (payment_records): ${retryErr.message}`);
          }
        }
      } catch (err: any) {
        console.error('[STORAGE] Error syncing updatePayment to Supabase:', err);
        throw err;
      }
    }
    return this.db.payment_records[idx];
  }

  public async deletePaymentRecord(id: string): Promise<{ deleted: boolean; error?: string }> {
    const payment = this.db.payment_records.find((p) => p.id === id);
    if (!payment) return { deleted: false, error: 'Payment record not found.' };

    this.db.payment_records = this.db.payment_records.filter((p) => p.id !== id);
    this.saveDatabase(this.db);

    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('payment_records').delete().eq('id', id);
        if (error) {
          console.error('[STORAGE] Error deleting payment record from Supabase:', error);
          this.db.payment_records.unshift(payment);
          this.saveDatabase(this.db);
          return { deleted: false, error: `Failed to delete from database: ${error.message}` };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.db.payment_records.unshift(payment);
        this.saveDatabase(this.db);
        return { deleted: false, error: `Database communication error: ${msg}` };
      }
    }
    return { deleted: true };
  }

  // --- Key Records & Secure Token-Based Key Generation ---
  public getKeyRecords(): KeyRecord[] {
    const now = Date.now();
    let modified = false;
    for (const k of this.db.key_records) {
      if (k.status === 'active' && new Date(k.expires_at).getTime() <= now) {
        k.status = 'expired';
        modified = true;
      }
    }
    if (modified) {
      this.saveDatabase(this.db);
    }
    return [...this.db.key_records].reverse();
  }

  private generateUniqueAccessKeyString(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const existingTokens = new Set(
      this.db.key_records.map((k) => (k.token || '').trim().toUpperCase()).filter(Boolean)
    );

    for (let attempt = 0; attempt < 25; attempt++) {
      const bytes = crypto.randomBytes(12);
      let chars = '';
      for (let i = 0; i < 12; i++) {
        chars += alphabet[bytes[i] % alphabet.length];
      }
      const candidate = `SFOX-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
      if (!existingTokens.has(candidate)) {
        return candidate;
      }
    }

    const fallbackHex = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `SFOX-${fallbackHex.slice(0, 4)}-${fallbackHex.slice(4, 8)}-${fallbackHex.slice(8, 12)}`;
  }

  public createPendingKeyVerification(
    userId: string,
    email: string,
    origin?: string
  ): {
    token: string;
    flow_id: string;
    target_url: string;
    callback_url: string;
    started_at: string;
    earliest_key_at: string;
    min_wait_seconds: number;
    expires_at: string;
  } {
    const settings = this.getSettings();
    const token = crypto.randomBytes(32).toString('hex');
    const attemptId = crypto.randomUUID();
    const now = Date.now();
    const startedAtIso = new Date(now).toISOString();
    const earliestKeyAtIso = new Date(now + MIN_VPLINK_WAIT_MS).toISOString();
    const expiresAt = new Date(now + 30 * 60 * 1000).toISOString(); // 30-minute flow validity

    const cleanOrigin = origin || (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : 'https://study-fox.onrender.com');
    const callbackUrl = `${cleanOrigin}/`;

    // Use the existing configured VPLINK shortener URL without altering or inventing a new one
    let shortenerTarget = (settings.shortener_url || '').trim();
    if (!shortenerTarget) {
      shortenerTarget = callbackUrl;
    } else if (shortenerTarget.includes('{url}')) {
      shortenerTarget = shortenerTarget.replace('{url}', encodeURIComponent(callbackUrl));
    } else if (shortenerTarget.includes('{token}')) {
      shortenerTarget = shortenerTarget.replace('{token}', token);
    }

    // Invalidate any prior unconsumed flow attempts for this user so only the latest initiated flow is active
    // and restarting the timer can never reuse an older flow start timestamp to bypass the 200-second wait.
    for (const [oldToken, existingAttempt] of this.pending_verifications.entries()) {
      if (existingAttempt.user_id === userId && !existingAttempt.consumed) {
        existingAttempt.consumed = true;
        if (this.supabase) {
          void this.supabase
            .from('key_records')
            .delete()
            .eq('user_id', userId)
            .eq('token', `FLOW:${oldToken}`);
        }
      }
    }

    const attempt: PendingVerificationAttempt = {
      id: attemptId,
      token,
      user_id: userId,
      user_email: email.toLowerCase(),
      target_url: shortenerTarget,
      created_at: startedAtIso,
      earliest_key_at: earliestKeyAtIso,
      expires_at: expiresAt,
      consumed: false,
      key_claimed: false,
      claimed_key_id: null,
      claimed_key_token: null,
    };

    this.pending_verifications.set(token, attempt);
    this.syncPendingVerificationsToDb();

    // Persist flow start timestamp in Supabase key_records (prefixed with FLOW:) so server restarts cannot bypass the timer
    if (this.supabase) {
      void this.supabase
        .from('key_records')
        .insert({
          id: attemptId,
          user_id: userId,
          user_email: email.toLowerCase(),
          token: `FLOW:${token}`,
          shortener_url: shortenerTarget,
          status: 'active',
          generated_at: startedAtIso,
          expires_at: expiresAt,
        })
        .then(({ error }) => {
          if (error) {
            console.warn('[STORAGE] Could not sync pending flow timestamp to Supabase:', error.message);
          }
        });
    }

    // CRITICAL SECURITY REQUIREMENT:
    // Clicking "Generate New Key" NEVER generates an access key, NEVER reveals a key,
    // and NEVER sets user.free_access_expires_at.
    return {
      token,
      flow_id: token,
      target_url: shortenerTarget,
      callback_url: callbackUrl,
      started_at: startedAtIso,
      earliest_key_at: earliestKeyAtIso,
      min_wait_seconds: MIN_VPLINK_WAIT_SECONDS,
      expires_at: expiresAt,
    };
  }

  private async resolveActivePendingAttempt(
    userId: string,
    flowId?: string
  ): Promise<PendingVerificationAttempt | undefined> {
    const nowMs = Date.now();
    const cleanFlowId = (flowId || '').trim();
    let attempt: PendingVerificationAttempt | undefined;

    if (cleanFlowId) {
      const matched = this.pending_verifications.get(cleanFlowId);
      if (matched && matched.user_id === userId && !matched.consumed && new Date(matched.expires_at).getTime() > nowMs) {
        attempt = matched;
      }
    }

    if (!attempt) {
      const userAttempts = Array.from(this.pending_verifications.values())
        .filter(
          (a) =>
            a.user_id === userId &&
            !a.consumed &&
            new Date(a.expires_at).getTime() > nowMs
        )
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (userAttempts.length > 0) {
        attempt = userAttempts[0];
      }
    }

    // If not in local memory, check Supabase for a persisted FLOW: record for this user
    if (!attempt && this.supabase) {
      try {
        let query = this.supabase
          .from('key_records')
          .select('*')
          .eq('user_id', userId)
          .like('token', 'FLOW:%')
          .order('generated_at', { ascending: false })
          .limit(1);

        if (cleanFlowId) {
          query = this.supabase
            .from('key_records')
            .select('*')
            .eq('user_id', userId)
            .eq('token', `FLOW:${cleanFlowId}`)
            .limit(1);
        }

        const { data: rows } = await query;
        if (rows && rows.length > 0) {
          const row = rows[0];
          const expMs = new Date(row.expires_at).getTime();
          const startMs = new Date(row.generated_at).getTime();
          const rawToken = String(row.token || '').slice('FLOW:'.length).trim();
          if (rawToken && expMs > nowMs && Number.isFinite(startMs)) {
            const restored: PendingVerificationAttempt = {
              id: row.id,
              token: rawToken,
              user_id: row.user_id,
              user_email: (row.user_email || '').toLowerCase(),
              target_url: row.shortener_url || (this.getSettings().shortener_url || '').trim(),
              created_at: new Date(startMs).toISOString(),
              earliest_key_at: new Date(startMs + MIN_VPLINK_WAIT_MS).toISOString(),
              expires_at: new Date(expMs).toISOString(),
              consumed: false,
              key_claimed: false,
              claimed_key_id: null,
              claimed_key_token: null,
            };
            this.pending_verifications.set(rawToken, restored);
            this.syncPendingVerificationsToDb();
            attempt = restored;
          }
        }
      } catch (err) {
        console.warn('[STORAGE] Error checking persisted key flow in Supabase:', err);
      }
    }

    return attempt;
  }

  public async getKeyFlowStatus(
    userId: string,
    flowId?: string
  ): Promise<{
    has_active_flow: boolean;
    flow_id: string | null;
    target_url: string | null;
    started_at: string | null;
    earliest_key_at: string | null;
    expires_at: string | null;
    min_wait_seconds: number;
    elapsed_seconds: number;
    remaining_seconds: number;
    can_get_key: boolean;
    key_claimed: boolean;
    claimed_key: string | null;
  }> {
    const nowMs = Date.now();
    const attempt = await this.resolveActivePendingAttempt(userId, flowId);

    if (!attempt || attempt.consumed || new Date(attempt.expires_at).getTime() <= nowMs) {
      return {
        has_active_flow: false,
        flow_id: null,
        target_url: null,
        started_at: null,
        earliest_key_at: null,
        expires_at: null,
        min_wait_seconds: MIN_VPLINK_WAIT_SECONDS,
        elapsed_seconds: 0,
        remaining_seconds: MIN_VPLINK_WAIT_SECONDS,
        can_get_key: false,
        key_claimed: false,
        claimed_key: null,
      };
    }

    const startedAtMs = new Date(attempt.created_at).getTime();
    const earliestKeyAtMs = attempt.earliest_key_at
      ? new Date(attempt.earliest_key_at).getTime()
      : startedAtMs + MIN_VPLINK_WAIT_MS;
    const elapsedMs = Math.max(0, nowMs - startedAtMs);
    const remainingMs = Math.max(0, earliestKeyAtMs - nowMs);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const canGetKey = remainingMs <= 0;

    let validClaimedKey: string | null = null;
    if (attempt.key_claimed && attempt.claimed_key_token) {
      const existingKey = this.db.key_records.find(
        (k) =>
          k.user_id === userId &&
          k.token === attempt.claimed_key_token &&
          k.redeemed === false &&
          k.status === 'active' &&
          new Date(k.expires_at).getTime() > nowMs
      );
      if (existingKey) {
        validClaimedKey = existingKey.token || null;
      }
    }

    return {
      has_active_flow: true,
      flow_id: attempt.token,
      target_url: attempt.target_url,
      started_at: attempt.created_at,
      earliest_key_at: new Date(earliestKeyAtMs).toISOString(),
      expires_at: attempt.expires_at,
      min_wait_seconds: MIN_VPLINK_WAIT_SECONDS,
      elapsed_seconds: elapsedSeconds,
      remaining_seconds: remainingSeconds,
      can_get_key: canGetKey,
      key_claimed: Boolean(validClaimedKey),
      claimed_key: validClaimedKey,
    };
  }

  public async claimGeneratedKey(
    userId: string,
    email: string,
    flowId?: string
  ): Promise<{
    success: boolean;
    error?: string;
    code?: string;
    key?: string;
    generated_at?: string;
    expires_at?: string;
    started_at?: string;
    earliest_key_at?: string;
    min_wait_seconds?: number;
    elapsed_seconds?: number;
    remaining_seconds?: number;
  }> {
    if (this.claiming_key_users.has(userId)) {
      return {
        success: false,
        code: 'CLAIM_IN_PROGRESS',
        error: 'Key generation is already in progress. Please wait a moment.',
      };
    }

    const nowMs = Date.now();

    this.claiming_key_users.add(userId);
    try {
      const attempt = await this.resolveActivePendingAttempt(userId, flowId);

      if (!attempt || attempt.consumed || new Date(attempt.expires_at).getTime() <= nowMs) {
        return {
          success: false,
          code: 'FLOW_NOT_INITIATED',
          error: 'Please click "Generate New Key" and complete the VPLINK step first.',
        };
      }

      if (attempt.user_id !== userId) {
        return {
          success: false,
          code: 'UNAUTHORIZED_FLOW',
          error: 'Invalid key generation session for this account.',
        };
      }

      // Enforce 200-second minimum waiting period on the backend using trusted server/database timestamp
      const startedAtMs = new Date(attempt.created_at).getTime();
      const earliestKeyAtMs = attempt.earliest_key_at
        ? new Date(attempt.earliest_key_at).getTime()
        : startedAtMs + MIN_VPLINK_WAIT_MS;
      const elapsedMs = Math.max(0, nowMs - startedAtMs);
      const remainingMs = earliestKeyAtMs - nowMs;

      if (!Number.isFinite(startedAtMs) || remainingMs > 0) {
        const remainingSeconds = Number.isFinite(remainingMs)
          ? Math.max(1, Math.ceil(remainingMs / 1000))
          : MIN_VPLINK_WAIT_SECONDS;
        const elapsedSeconds = Number.isFinite(elapsedMs)
          ? Math.max(0, Math.floor(elapsedMs / 1000))
          : 0;
        return {
          success: false,
          code: 'SHORTENER_WAIT_REQUIRED',
          error: 'Please complete the shortener process and return after the required time.',
          started_at: attempt.created_at,
          earliest_key_at: new Date(earliestKeyAtMs).toISOString(),
          min_wait_seconds: MIN_VPLINK_WAIT_SECONDS,
          elapsed_seconds: elapsedSeconds,
          remaining_seconds: remainingSeconds,
        };
      }

      // Prevent duplicate key creation if Get Key is clicked repeatedly for the same initiated flow
      if (attempt.key_claimed && attempt.claimed_key_token) {
        const existingKey = this.db.key_records.find(
          (k) =>
            k.user_id === userId &&
            k.token === attempt!.claimed_key_token &&
            k.redeemed === false &&
            k.status === 'active' &&
            new Date(k.expires_at).getTime() > nowMs
        );
        if (existingKey) {
          return {
            success: true,
            key: existingKey.token,
            generated_at: existingKey.generated_at,
            expires_at: existingKey.expires_at,
          };
        }
        return {
          success: false,
          code: 'FLOW_ALREADY_USED',
          error: 'A key was already generated for this session. Please click "Generate New Key" to start a new session.',
        };
      }

      const lastClaim = this.last_key_claim_ms.get(userId) || 0;
      if (nowMs - lastClaim < 1500) {
        return {
          success: false,
          code: 'RATE_LIMITED',
          error: 'Please wait a moment before requesting a key again.',
        };
      }

      // Expire any older unredeemed keys for this user so unused keys cannot be stockpiled
      for (const k of this.db.key_records) {
        if (k.user_id === userId && k.redeemed === false && k.status === 'active') {
          k.status = 'expired';
          if (this.supabase) {
            void this.supabase
              .from('key_records')
              .update({ status: 'expired' })
              .eq('id', k.id);
          }
        }
      }

      const generatedKey = this.generateUniqueAccessKeyString();
      const nowIso = new Date(nowMs).toISOString();
      // Unredeemed key must be pasted and verified within 30 minutes; does NOT start the 24-hour access timer
      const unredeemedExpiresIso = new Date(nowMs + 30 * 60 * 1000).toISOString();
      const settings = this.getSettings();

      const keyRec: KeyRecord = {
        id: crypto.randomUUID(),
        user_id: userId,
        user_email: email.toLowerCase(),
        token: generatedKey,
        shortener_url: attempt.target_url || settings.shortener_url || '',
        generated_at: nowIso,
        expires_at: unredeemedExpiresIso,
        status: 'active',
        redeemed: false,
        redeemed_at: null,
      };

      attempt.key_claimed = true;
      attempt.claimed_key_id = keyRec.id;
      attempt.claimed_key_token = generatedKey;
      this.last_key_claim_ms.set(userId, nowMs);

      this.db.key_records.unshift(keyRec);
      this.syncPendingVerificationsToDb();

      if (this.supabase) {
        try {
          // Remove temporary FLOW: marker record and insert UNREDEEMED: key record
          await this.supabase
            .from('key_records')
            .delete()
            .eq('user_id', userId)
            .eq('token', `FLOW:${attempt.token}`);

          const { error } = await this.supabase.from('key_records').insert({
            id: keyRec.id,
            user_id: keyRec.user_id,
            user_email: keyRec.user_email,
            token: `UNREDEEMED:${generatedKey}`,
            shortener_url: keyRec.shortener_url,
            status: 'active',
            generated_at: keyRec.generated_at,
            expires_at: keyRec.expires_at,
          });
          if (error) {
            console.error('[STORAGE] Error inserting unredeemed key_record into Supabase:', error);
          }
        } catch (err) {
          console.error('[STORAGE] Error inserting unredeemed key_record into Supabase:', err);
        }
      }

      // CRITICAL: We do NOT update user.free_access_expires_at here.
      // The 24-hour timer starts ONLY when the user pastes and verifies the key.
      return {
        success: true,
        key: generatedKey,
        generated_at: nowIso,
        expires_at: unredeemedExpiresIso,
      };
    } finally {
      this.claiming_key_users.delete(userId);
    }
  }

  public async verifyAndActivateKey(
    userId: string,
    token?: string
  ): Promise<{
    success: boolean;
    error?: string;
    code?: string;
    key_record?: KeyRecord;
    user?: User;
    verified_at?: string;
    expires_at?: string;
  }> {
    const rawInput = (token || '').trim();
    if (!rawInput) {
      return {
        success: false,
        code: 'EMPTY_KEY',
        error: 'Please paste or enter your access key before clicking Verify Key.',
      };
    }

    const cleanKey = rawInput.toUpperCase();
    const invalidMsg = 'Invalid or expired key. Please generate a new key.';

    if (this.redeeming_keys.has(cleanKey)) {
      return {
        success: false,
        code: 'ALREADY_USED',
        error: invalidMsg,
      };
    }

    this.redeeming_keys.add(cleanKey);
    try {
      const nowMs = Date.now();

      // Look up key record in local storage first, and query Supabase if needed
      let keyRec = this.db.key_records.find(
        (k) => (k.token || '').trim().toUpperCase() === cleanKey
      );

      if (!keyRec && this.supabase) {
        try {
          const { data: remoteRows } = await this.supabase
            .from('key_records')
            .select('*')
            .in('token', [`UNREDEEMED:${cleanKey}`, `REDEEMED:${cleanKey}`, cleanKey])
            .limit(1);

          if (remoteRows && remoteRows.length > 0) {
            const normalized = normalizeStoredKeyRecord(remoteRows[0] as KeyRecord);
            this.db.key_records.unshift(normalized);
            keyRec = normalized;
          }
        } catch (err) {
          console.error('[STORAGE] Error querying key_records in Supabase during verification:', err);
        }
      }

      if (!keyRec) {
        return {
          success: false,
          code: 'INVALID_KEY',
          error: invalidMsg,
        };
      }

      // Ensure key belongs to the authenticated user
      if (keyRec.user_id !== userId) {
        return {
          success: false,
          code: 'WRONG_USER',
          error: invalidMsg,
        };
      }

      // Prevent a key from being used more than once
      if (keyRec.redeemed !== false) {
        return {
          success: false,
          code: 'ALREADY_USED',
          error: invalidMsg,
        };
      }

      // Check if key was revoked or expired before verification
      if (keyRec.status !== 'active' || new Date(keyRec.expires_at).getTime() <= nowMs) {
        keyRec.status = 'expired';
        this.saveDatabase(this.db);
        if (this.supabase) {
          void this.supabase
            .from('key_records')
            .update({ status: 'expired' })
            .eq('id', keyRec.id);
        }
        return {
          success: false,
          code: 'EXPIRED_KEY',
          error: invalidMsg,
        };
      }

      // Exact 24-hour timer starts strictly at successful server-side verification
      const verifiedAtMs = Date.now();
      const verifiedAtIso = new Date(verifiedAtMs).toISOString();
      const EXACT_24_HOURS_MS = 24 * 60 * 60 * 1000;
      const accessExpiresAtIso = new Date(verifiedAtMs + EXACT_24_HOURS_MS).toISOString();

      // Atomic conditional update in Supabase if configured
      if (this.supabase) {
        try {
          const { data: updatedRows, error: sbErr } = await this.supabase
            .from('key_records')
            .update({
              token: `REDEEMED:${cleanKey}`,
              status: 'active',
              generated_at: verifiedAtIso,
              expires_at: accessExpiresAtIso,
            })
            .eq('id', keyRec.id)
            .eq('user_id', userId)
            .eq('token', `UNREDEEMED:${cleanKey}`)
            .select('id');

          if (sbErr) {
            console.error('[STORAGE] Supabase key redemption update failed:', sbErr);
            return {
              success: false,
              code: 'DB_ERROR',
              error: 'Unable to verify key right now due to a database error. Please try again.',
            };
          }

          if (!updatedRows || updatedRows.length === 0) {
            keyRec.redeemed = true;
            this.saveDatabase(this.db);
            return {
              success: false,
              code: 'ALREADY_USED',
              error: invalidMsg,
            };
          }
        } catch (err) {
          console.error('[STORAGE] Supabase key redemption exception:', err);
          return {
            success: false,
            code: 'DB_ERROR',
            error: 'Unable to verify key right now due to a network error. Please try again.',
          };
        }
      }

      // Mark key as redeemed and update timestamps to the 24-hour window
      keyRec.token = cleanKey;
      keyRec.redeemed = true;
      keyRec.redeemed_at = verifiedAtIso;
      keyRec.generated_at = verifiedAtIso;
      keyRec.expires_at = accessExpiresAtIso;
      keyRec.status = 'active';

      // Consume any active pending VPLINK flow for this user
      for (const [flowToken, attempt] of this.pending_verifications.entries()) {
        if (attempt.user_id === userId && !attempt.consumed) {
          attempt.consumed = true;
          if (this.supabase) {
            void this.supabase
              .from('key_records')
              .delete()
              .eq('user_id', userId)
              .eq('token', `FLOW:${flowToken}`);
          }
        }
      }
      this.syncPendingVerificationsToDb();

      // Save exact 24-hour free access expiration on the user (preserving VIP fields untouched)
      const updatedUser = await this.updateUser(userId, {
        free_access_expires_at: accessExpiresAtIso,
      });

      this.saveDatabase(this.db);

      return {
        success: true,
        key_record: keyRec,
        user: updatedUser,
        verified_at: verifiedAtIso,
        expires_at: accessExpiresAtIso,
      };
    } finally {
      this.redeeming_keys.delete(cleanKey);
    }
  }

  public async enforceUserAccessExpiration(userId: string): Promise<User | undefined> {
    const user = this.getUserById(userId);
    if (!user) return undefined;

    const nowMs = Date.now();
    let keyModified = false;

    for (const k of this.db.key_records) {
      if (k.user_id === userId && k.status === 'active' && new Date(k.expires_at).getTime() <= nowMs) {
        k.status = 'expired';
        keyModified = true;
        if (this.supabase) {
          void this.supabase
            .from('key_records')
            .update({ status: 'expired' })
            .eq('id', k.id);
        }
      }
    }

    const userUpdates: Partial<User> = {};

    // If student VIP is flagged active but has no expiry or its expiry timestamp has passed, mark vip_active = false
    if (
      user.role === 'user' &&
      user.vip_active &&
      (!user.vip_expires_at || new Date(user.vip_expires_at).getTime() <= nowMs)
    ) {
      userUpdates.vip_active = false;
    }

    if (user.free_access_expires_at && new Date(user.free_access_expires_at).getTime() <= nowMs) {
      // Free access period has ended; clear expired free access timestamp while preserving valid VIP status untouched
      userUpdates.free_access_expires_at = null;
    }

    if (Object.keys(userUpdates).length > 0) {
      const updated = await this.updateUser(userId, userUpdates);
      return updated;
    }

    if (keyModified) {
      this.saveDatabase(this.db);
    }

    return user;
  }

  public async recordKeyGeneration(
    userId: string,
    email: string,
    shortenerUrl: string,
    duration?: number,
    unit?: 'minutes' | 'hours' | 'days'
  ): Promise<KeyRecord> {
    const settings = this.getSettings();
    const effectiveDuration =
      duration !== undefined && duration > 0
        ? duration
        : (settings.free_access_duration || settings.key_expiry_hours || 24);
    const effectiveUnit = unit || settings.free_access_unit || 'hours';

    const now = new Date();
    const ms =
      effectiveUnit === 'minutes'
        ? effectiveDuration * 60 * 1000
        : effectiveUnit === 'days'
        ? effectiveDuration * 24 * 3600 * 1000
        : effectiveDuration * 3600 * 1000;
    const expires = new Date(now.getTime() + ms);
    const token = this.generateUniqueAccessKeyString();

    const keyRec: KeyRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      user_email: email,
      token,
      shortener_url: shortenerUrl,
      generated_at: now.toISOString(),
      expires_at: expires.toISOString(),
      status: 'active',
      redeemed: true,
      redeemed_at: now.toISOString(),
    };
    this.db.key_records.unshift(keyRec);

    await this.updateUser(userId, { free_access_expires_at: expires.toISOString() });

    if (this.supabase) {
      try {
        await this.supabase.from('key_records').insert({
          id: keyRec.id,
          user_id: keyRec.user_id,
          user_email: keyRec.user_email,
          token: `REDEEMED:${token}`,
          shortener_url: keyRec.shortener_url,
          status: 'active',
          generated_at: keyRec.generated_at,
          expires_at: keyRec.expires_at,
        });
      } catch (err) {
        console.error('[STORAGE] Error syncing key generation to Supabase:', err);
      }
    }

    this.saveDatabase(this.db);
    return keyRec;
  }

  public async revokeKeyRecord(id: string): Promise<KeyRecord | undefined> {
    const uuid = ensureUuid(id);
    const key = this.db.key_records.find((k) => k.id === id || k.id === uuid);
    if (!key) return undefined;
    key.status = 'revoked';

    // Recalculate remaining active access for this user
    const now = Date.now();
    const user = this.db.users.find(
      (u) => u.id === key.user_id || u.email.toLowerCase() === key.user_email.toLowerCase()
    );
    if (user) {
      const otherActive = this.db.key_records.filter(
        (k) =>
          (k.user_id === user.id || k.user_email.toLowerCase() === user.email.toLowerCase()) &&
          k.status === 'active' &&
          k.redeemed !== false &&
          new Date(k.expires_at).getTime() > now
      );
      if (otherActive.length > 0) {
        otherActive.sort((a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime());
        await this.updateUser(user.id, { free_access_expires_at: otherActive[0].expires_at });
      } else {
        await this.updateUser(user.id, { free_access_expires_at: null });
      }
    }

    if (this.supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const query = isUuid
          ? this.supabase.from('key_records').update({ status: 'revoked' }).eq('id', id)
          : this.supabase.from('key_records').update({ status: 'revoked' }).eq('id', uuid);
        await query;
      } catch (err) {
        console.error('[STORAGE] Error updating revoked key in Supabase:', err);
      }
    }

    this.saveDatabase(this.db);
    return key;
  }

  public async deleteKeyRecord(id: string): Promise<boolean> {
    const uuid = ensureUuid(id);
    const key = this.db.key_records.find((k) => k.id === id || k.id === uuid);
    if (!key) return false;
    // If key was active, revoke first so user's free_access_expires_at is updated accurately
    if (key.status === 'active') {
      await this.revokeKeyRecord(id);
    }
    this.db.key_records = this.db.key_records.filter((k) => k.id !== id && k.id !== uuid);
    this.saveDatabase(this.db);

    if (this.supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const query = isUuid
          ? this.supabase.from('key_records').delete().eq('id', id)
          : this.supabase.from('key_records').delete().eq('id', uuid);
        await query;
      } catch (err) {
        console.error('[STORAGE] Error deleting key_record from Supabase:', err);
      }
    }

    return true;
  }

  public revokeAllUserKeys(userId: string, userEmail: string): void {
    let changed = false;
    for (const k of this.db.key_records) {
      if (
        (k.user_id === userId || k.user_email.toLowerCase() === userEmail.toLowerCase()) &&
        k.status === 'active'
      ) {
        k.status = 'revoked';
        changed = true;
      }
    }
    if (changed) {
      this.saveDatabase(this.db);
    }
  }

  public getActiveKeysCount(): number {
    const now = Date.now();
    return this.db.key_records.filter((k) => {
      if (k.status !== 'active' || k.redeemed === false) return false;
      const exp = new Date(k.expires_at).getTime();
      return !isNaN(exp) && exp > now;
    }).length;
  }

  // --- Single-Device VIP Binding & Security Logs ---
  public getVipDeviceLogs(): VipDeviceLog[] {
    return [...(this.db.vip_device_logs || [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public async addVipDeviceLog(entry: Omit<VipDeviceLog, 'id' | 'timestamp'>): Promise<VipDeviceLog> {
    if (!Array.isArray(this.db.vip_device_logs)) {
      this.db.vip_device_logs = [];
    }
    const newLog: VipDeviceLog = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.db.vip_device_logs.unshift(newLog);
    if (this.db.vip_device_logs.length > 500) {
      this.db.vip_device_logs = this.db.vip_device_logs.slice(0, 500);
    }
    this.saveDatabase(this.db);
    if (this.supabase) {
      try {
        await this.supabase.from('vip_device_logs').insert(newLog);
      } catch {
        // Ignore if table not present
      }
    }
    return newLog;
  }

  public async deleteVipDeviceLog(id: string): Promise<boolean> {
    if (!Array.isArray(this.db.vip_device_logs)) return false;
    const uuid = ensureUuid(id);
    const before = this.db.vip_device_logs.length;
    this.db.vip_device_logs = this.db.vip_device_logs.filter((l) => l.id !== id && l.id !== uuid);
    if (this.db.vip_device_logs.length !== before) {
      this.saveDatabase(this.db);
      if (this.supabase) {
        try {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
          await (isUuid
            ? this.supabase.from('vip_device_logs').delete().eq('id', id)
            : this.supabase.from('vip_device_logs').delete().eq('id', uuid));
        } catch {
          // Ignore
        }
      }
      return true;
    }
    return false;
  }

  public bindOrVerifyVipDevice(
    userId: string,
    deviceId: string,
    sessionId: string,
    deviceLabel: string,
    ip: string,
    ua: string,
    autoBindIfUnbound = true
  ): {
    allowed: boolean;
    status: 'bound_current' | 'bound_other' | 'unbound' | 'not_vip';
    boundDeviceLabel?: string | null;
    boundAt?: string | null;
    newlyBound?: boolean;
  } {
    const user = this.getUserById(userId);
    if (!user) {
      return { allowed: false, status: 'not_vip' };
    }

    const nowMs = Date.now();
    const isPrivilegedAdmin = user.role === 'admin' || user.role === 'super_admin';
    if (isPrivilegedAdmin) {
      return {
        allowed: true,
        status: 'bound_current',
        boundDeviceLabel: user.vip_device_label || deviceLabel || 'Admin Device',
        boundAt: user.vip_device_bound_at || new Date(nowMs).toISOString(),
      };
    }

    // Student accounts bind to their first registered device (Device A) and verify against it on subsequent logins/sessions
    if (!deviceId || !deviceId.trim()) {
      return {
        allowed: false,
        status: user.vip_bound_device_id ? 'bound_other' : 'unbound',
        boundDeviceLabel: user.vip_device_label || null,
        boundAt: user.vip_device_bound_at || null,
      };
    }

    const cleanDeviceId = deviceId.trim();
    const nowIso = new Date().toISOString();

    if (!user.vip_bound_device_id) {
      if (!autoBindIfUnbound) {
        return { allowed: false, status: 'unbound' };
      }
      user.vip_bound_device_id = cleanDeviceId;
      user.vip_bound_session_id = sessionId || user.vip_bound_session_id || null;
      user.vip_device_label = deviceLabel || 'Authorized Browser/Device';
      user.vip_device_bound_at = nowIso;
      user.vip_device_last_seen_at = nowIso;
      user.vip_device_last_ip = ip;
      user.vip_device_last_ua = ua;
      this.saveDatabase(this.db);

      void this.updateUser(user.id, {
        vip_bound_device_id: user.vip_bound_device_id,
        vip_bound_session_id: user.vip_bound_session_id,
        vip_device_label: user.vip_device_label,
        vip_device_bound_at: user.vip_device_bound_at,
        vip_device_last_seen_at: user.vip_device_last_seen_at,
        vip_device_last_ip: user.vip_device_last_ip,
        vip_device_last_ua: user.vip_device_last_ua,
      });

      void this.addVipDeviceLog({
        user_id: user.id,
        email: user.email,
        event_type: 'device_bound',
        attempted_device_id: cleanDeviceId,
        bound_device_id: cleanDeviceId,
        device_label: user.vip_device_label,
        ip_address: ip,
        user_agent: ua,
        reason: 'Primary VIP device bound automatically on authorized session.',
      });

      return {
        allowed: true,
        status: 'bound_current',
        boundDeviceLabel: user.vip_device_label,
        boundAt: user.vip_device_bound_at,
        newlyBound: true,
      };
    }

    if (user.vip_bound_device_id === cleanDeviceId) {
      user.vip_device_last_seen_at = nowIso;
      user.vip_device_last_ip = ip;
      user.vip_device_last_ua = ua;
      if (sessionId && user.vip_bound_session_id !== sessionId) {
        user.vip_bound_session_id = sessionId;
      }
      this.saveDatabase(this.db);
      void this.updateUser(user.id, {
        vip_device_last_seen_at: user.vip_device_last_seen_at,
        vip_device_last_ip: user.vip_device_last_ip,
        vip_device_last_ua: user.vip_device_last_ua,
        vip_bound_session_id: user.vip_bound_session_id,
      });
      return {
        allowed: true,
        status: 'bound_current',
        boundDeviceLabel: user.vip_device_label,
        boundAt: user.vip_device_bound_at,
      };
    }

    // If the user is on the SAME physical device & browser:
    // Case A: Both bound and current IDs use the deterministic hardware fingerprint format `sf_fp_<hash>_<rand>`
    // and share the exact same hardware fingerprint hash prefix (`sf_fp_<hash>`).
    // Case B: The user was previously bound with a legacy `sf_dev_` ID and is now logging in from the
    // same browser User-Agent with the upgraded `sf_fp_` hardware fingerprint ID.
    const sameUserAgent = Boolean(
      !user.vip_device_last_ua ||
      !ua ||
      user.vip_device_last_ua.trim() === ua.trim()
    );
    const boundFpPrefix = user.vip_bound_device_id.startsWith('sf_fp_')
      ? user.vip_bound_device_id.split('_').slice(0, 3).join('_')
      : '';
    const currentFpPrefix = cleanDeviceId.startsWith('sf_fp_')
      ? cleanDeviceId.split('_').slice(0, 3).join('_')
      : '';
    const isSameHardwareFingerprint = Boolean(
      boundFpPrefix && currentFpPrefix && boundFpPrefix === currentFpPrefix
    );
    const isLegacySameBrowserUpgrade = Boolean(
      user.vip_bound_device_id.startsWith('sf_dev_') &&
      cleanDeviceId.startsWith('sf_fp_') &&
      sameUserAgent
    );

    if (isSameHardwareFingerprint || isLegacySameBrowserUpgrade) {
      user.vip_bound_device_id = cleanDeviceId;
      user.vip_device_last_seen_at = nowIso;
      user.vip_device_last_ip = ip;
      if (ua) user.vip_device_last_ua = ua;
      if (deviceLabel) user.vip_device_label = deviceLabel;
      if (sessionId && user.vip_bound_session_id !== sessionId) {
        user.vip_bound_session_id = sessionId;
      }
      this.saveDatabase(this.db);
      void this.updateUser(user.id, {
        vip_bound_device_id: user.vip_bound_device_id,
        vip_device_label: user.vip_device_label,
        vip_device_last_seen_at: user.vip_device_last_seen_at,
        vip_device_last_ip: user.vip_device_last_ip,
        vip_device_last_ua: user.vip_device_last_ua,
        vip_bound_session_id: user.vip_bound_session_id,
      });
      return {
        allowed: true,
        status: 'bound_current',
        boundDeviceLabel: user.vip_device_label,
        boundAt: user.vip_device_bound_at,
      };
    }

    // Mismatch! Another device (Device B) is trying to use this account while bound to Device A.
    // IMPORTANT: Never set user.is_blocked = true and never overwrite or revoke Device A.
    user.vip_sharing_attempt_count = (user.vip_sharing_attempt_count || 0) + 1;
    user.vip_last_sharing_attempt_at = nowIso;
    this.saveDatabase(this.db);
    void this.updateUser(user.id, {
      vip_sharing_attempt_count: user.vip_sharing_attempt_count,
      vip_last_sharing_attempt_at: user.vip_last_sharing_attempt_at,
    });

    return {
      allowed: false,
      status: 'bound_other',
      boundDeviceLabel: user.vip_device_label || 'Registered Primary Device',
      boundAt: user.vip_device_bound_at || null,
    };
  }

  public resetVipDeviceBinding(
    userId: string,
    adminId: string,
    reason: string,
    ip: string,
    ua: string
  ): User | undefined {
    const user = this.getUserById(userId);
    if (!user) return undefined;

    const previousDeviceId = user.vip_bound_device_id || null;
    const previousLabel = user.vip_device_label || 'None';
    const nowIso = new Date().toISOString();

    user.vip_bound_device_id = null;
    user.vip_bound_session_id = null;
    user.vip_device_label = null;
    user.vip_device_bound_at = null;
    user.vip_device_last_seen_at = null;
    user.vip_device_last_ip = null;
    user.vip_device_last_ua = null;
    user.vip_device_reset_count = (user.vip_device_reset_count || 0) + 1;
    user.vip_device_last_reset_at = nowIso;
    user.vip_device_last_reset_by = adminId;

    this.saveDatabase(this.db);
    void this.updateUser(user.id, {
      vip_bound_device_id: null,
      vip_bound_session_id: null,
      vip_device_label: null,
      vip_device_bound_at: null,
      vip_device_last_seen_at: null,
      vip_device_last_ip: null,
      vip_device_last_ua: null,
      vip_device_reset_count: user.vip_device_reset_count,
      vip_device_last_reset_at: nowIso,
      vip_device_last_reset_by: adminId,
    });

    void this.addVipDeviceLog({
      user_id: user.id,
      email: user.email,
      event_type: 'device_reset_by_admin',
      attempted_device_id: 'ADMIN_RESET',
      bound_device_id: previousDeviceId,
      device_label: `Reset (was: ${previousLabel})`,
      ip_address: ip,
      user_agent: ua,
      admin_id: adminId,
      reason: reason || 'Admin reset VIP device binding.',
    });

    void this.recordLogin({
      user_id: user.id,
      email: user.email,
      ip_address: ip,
      user_agent: `Admin Device Reset by ${adminId} (Previous: ${previousLabel}) [DEVICE_RESET_BY_ADMIN]`,
      status: 'DEVICE_RESET_BY_ADMIN',
    });

    return user;
  }

  public getUserStudyActivityMetrics(
    userId: string,
    lastLoginAt?: string | null,
    createdAt?: string
  ): {
    last_study_activity_at: string | null;
    total_study_activities: number;
    learner_activity_status: 'active_learner' | 'no_study_activity' | 'inactive_30d';
  } {
    let totalCount = 0;
    let latestMs = 0;

    const considerTimestamp = (ts?: string | null) => {
      if (!ts) return;
      const ms = new Date(ts).getTime();
      if (Number.isFinite(ms) && ms > latestMs) {
        latestMs = ms;
      }
    };

    // 1. Platform usage logs (meaningful study platform launches)
    if (Array.isArray(this.db.platform_usage_logs)) {
      for (const log of this.db.platform_usage_logs) {
        if (log.user_id === userId) {
          totalCount += 1;
          considerTimestamp(log.opened_at);
        }
      }
    }

    // 2. Study streaks
    const streak = this.db.study_streaks?.[userId];
    if (streak) {
      if (typeof streak.total_study_actions === 'number' && streak.total_study_actions > totalCount) {
        totalCount = streak.total_study_actions;
      }
      if (streak.last_study_date_ist) {
        considerTimestamp(streak.updated_at || `${streak.last_study_date_ist}T12:00:00.000Z`);
      }
    }

    // 3. Mock test attempts
    if (Array.isArray(this.db.vip_mock_test_attempts)) {
      for (const att of this.db.vip_mock_test_attempts) {
        if (att.user_id === userId) {
          totalCount += 1;
          considerTimestamp(att.completed_at);
        }
      }
    }

    // 4. Learning library & exclusive resource interactions
    if (Array.isArray(this.db.student_resource_interactions)) {
      for (const inter of this.db.student_resource_interactions) {
        if (inter.user_id === userId && (inter.is_completed || inter.is_bookmarked || inter.last_accessed_at)) {
          totalCount += 1;
          considerTimestamp(inter.completed_at || inter.last_accessed_at);
        }
      }
    }

    // 5. Completed study timetable tasks
    if (Array.isArray(this.db.study_timetables)) {
      for (const tt of this.db.study_timetables) {
        if (tt.user_id === userId && tt.is_completed) {
          totalCount += 1;
          considerTimestamp(tt.completed_at || tt.updated_at);
        }
      }
    }

    const lastStudyActivityAt = latestMs > 0 ? new Date(latestMs).toISOString() : null;
    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const lastLoginMs = lastLoginAt ? new Date(lastLoginAt).getTime() : 0;
    const createdMs = createdAt ? new Date(createdAt).getTime() : 0;
    const mostRecentEngagementMs = Math.max(
      latestMs,
      Number.isFinite(lastLoginMs) ? lastLoginMs : 0
    );

    // Categorization rule:
    // - If the user has 0 study activities: 'no_study_activity' (or 'inactive_30d' if registered/logged in > 30 days ago with no recent login)
    // - If no login or meaningful study activity in the last 30 days: 'inactive_30d'
    // - Only users with meaningful study activity (totalCount > 0) within the last 30 days are 'active_learner'
    let status: 'active_learner' | 'no_study_activity' | 'inactive_30d' = 'no_study_activity';
    if (totalCount > 0 && latestMs >= thirtyDaysAgoMs) {
      status = 'active_learner';
    } else if (
      (mostRecentEngagementMs > 0 && mostRecentEngagementMs < thirtyDaysAgoMs) ||
      (mostRecentEngagementMs === 0 && createdMs > 0 && createdMs < thirtyDaysAgoMs)
    ) {
      status = 'inactive_30d';
    } else {
      status = 'no_study_activity';
    }

    return {
      last_study_activity_at: lastStudyActivityAt,
      total_study_activities: totalCount,
      learner_activity_status: status,
    };
  }

  // --- Section-Specific Bulk Delete By IDs ---
  public async bulkDeleteByIds(
    section: string,
    ids: string[],
    actorRole: 'admin' | 'super_admin',
    actorId: string
  ): Promise<{
    deleted_count: number;
    deleted_ids: string[];
    skipped_count: number;
    skipped_reasons: string[];
    error?: string;
  }> {
    const cleanIds = Array.from(
      new Set((Array.isArray(ids) ? ids : []).map((id) => String(id).trim()).filter(Boolean))
    );
    if (cleanIds.length === 0) {
      return {
        deleted_count: 0,
        deleted_ids: [],
        skipped_count: 0,
        skipped_reasons: [],
        error: 'No valid record IDs were provided for deletion.',
      };
    }

    const deletedIds: string[] = [];
    const skippedReasons: string[] = [];

    switch (section) {
      case 'users': {
        for (const id of cleanIds) {
          const target = this.getUserById(id);
          if (!target) {
            skippedReasons.push(`User ID ${id} not found.`);
            continue;
          }
          if (target.id === actorId) {
            skippedReasons.push(`${target.email}: Cannot delete your own active account.`);
            continue;
          }
          if (
            target.role === 'super_admin' ||
            target.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com'
          ) {
            skippedReasons.push(`${target.email}: Primary Super Admin is permanently protected.`);
            continue;
          }
          if (target.role === 'admin' && actorRole !== 'super_admin') {
            skippedReasons.push(`${target.email}: Only Super Admin can delete administrator accounts.`);
            continue;
          }
          const isActiveVip =
            target.role === 'user' &&
            Boolean(target.vip_active) &&
            (!target.vip_expires_at || new Date(target.vip_expires_at).getTime() > Date.now());
          if (isActiveVip) {
            skippedReasons.push(`${target.email}: Active VIP entitlement is protected from bulk deletion. Revoke VIP first if you intend to delete this user.`);
            continue;
          }
          this.revokeAllUserKeys(target.id, target.email);
          const ok = await this.deleteUser(target.id);
          if (ok) {
            deletedIds.push(target.id);
          }
        }
        break;
      }
      case 'platforms': {
        for (const id of cleanIds) {
          const ok = await this.deletePlatform(id);
          if (!ok) {
            skippedReasons.push(`Platform ${id} not found.`);
            continue;
          }
          deletedIds.push(id);
        }
        break;
      }
      case 'vip_batches': {
        for (const id of cleanIds) {
          const ok = await this.deleteVipBatch(id);
          if (!ok) {
            skippedReasons.push(`VIP Batch ${id} not found.`);
            continue;
          }
          deletedIds.push(id);
        }
        break;
      }
      case 'vip_plans': {
        for (const id of cleanIds) {
          const ok = await this.deleteVipPlan(id);
          if (!ok) {
            skippedReasons.push(`VIP Plan ${id} not found.`);
            continue;
          }
          deletedIds.push(id);
        }
        break;
      }
      case 'announcements': {
        for (const id of cleanIds) {
          const ok = await this.deleteAnnouncement(id);
          if (!ok) {
            skippedReasons.push(`Announcement ${id} not found.`);
            continue;
          }
          deletedIds.push(id);
        }
        break;
      }
      case 'login_history': {
        for (const id of cleanIds) {
          const ok = await this.deleteLoginHistoryEntry(id);
          if (!ok) {
            skippedReasons.push(`Login record ${id} not found.`);
            continue;
          }
          deletedIds.push(id);
        }
        break;
      }
      case 'payment_records': {
        for (const id of cleanIds) {
          const rec = this.db.payment_records.find((p) => p.id === id);
          if (!rec) {
            skippedReasons.push(`Payment ${id} not found.`);
            continue;
          }
          if (rec.status === 'completed') {
            skippedReasons.push(
              `Payment ${rec.transaction_reference || rec.id} (${rec.email}): Completed payment records are protected for financial audit compliance.`
            );
            continue;
          }
          const res = await this.deletePaymentRecord(id);
          if (res.deleted) {
            deletedIds.push(id);
          } else {
            skippedReasons.push(res.error || `Failed to delete payment ${id}.`);
          }
        }
        break;
      }
      case 'key_records': {
        for (const id of cleanIds) {
          const ok = await this.deleteKeyRecord(id);
          if (!ok) {
            skippedReasons.push(`Key ${id} not found.`);
            continue;
          }
          deletedIds.push(id);
        }
        break;
      }
      case 'vip_device_logs': {
        if (!Array.isArray(this.db.vip_device_logs)) this.db.vip_device_logs = [];
        for (const id of cleanIds) {
          const ok = await this.deleteVipDeviceLog(id);
          if (!ok) {
            skippedReasons.push(`Device log ${id} not found.`);
            continue;
          }
          deletedIds.push(id);
        }
        break;
      }
      default:
        return {
          deleted_count: 0,
          deleted_ids: [],
          skipped_count: cleanIds.length,
          skipped_reasons: [`Unsupported section '${section}'.`],
          error: `Unsupported bulk-delete section '${section}'.`,
        };
    }

    return {
      deleted_count: deletedIds.length,
      deleted_ids: deletedIds,
      skipped_count: skippedReasons.length,
      skipped_reasons: skippedReasons,
    };
  }

  // --- Section-Specific Bulk Cleanup & Storage Optimization Engine ---
  public getReferencedUploadFilenames(): Set<string> {
    const referenced = new Set<string>();
    const addUrlRef = (url?: string | null) => {
      if (!url || typeof url !== 'string') return;
      const trimmed = url.trim();
      if (trimmed.startsWith('/uploads/')) {
        referenced.add(path.basename(trimmed));
      } else if (trimmed.includes('/uploads/')) {
        referenced.add(path.basename(trimmed.split('/uploads/').pop() || ''));
      }
    };

    addUrlRef(this.db.settings.app_logo_url);
    addUrlRef(this.db.settings.donation_qr_url);
    addUrlRef(this.db.settings.support_image_url);
    addUrlRef(this.db.settings.vip_payment_qr_url);
    addUrlRef(this.db.settings.custom_popup_image_url);

    for (const p of this.db.platforms) {
      addUrlRef(p.logo_url);
    }
    for (const b of this.db.vip_batches) {
      addUrlRef(b.logo_url);
    }
    for (const pay of this.db.payment_records) {
      addUrlRef(pay.screenshot_url);
      addUrlRef(pay.screenshot_storage_path);
    }
    for (const fb of this.db.user_feedback || []) {
      addUrlRef(fb.attachment_url);
      addUrlRef(fb.attachment_storage_path);
    }

    return referenced;
  }

  public getOrphanedUploadFiles(uploadsDir: string): string[] {
    if (!fs.existsSync(uploadsDir)) return [];
    const referenced = this.getReferencedUploadFilenames();
    const allFiles = fs.readdirSync(uploadsDir);
    return allFiles.filter((file) => {
      const fullPath = path.join(uploadsDir, file);
      try {
        return fs.statSync(fullPath).isFile() && !referenced.has(file);
      } catch {
        return false;
      }
    });
  }

  public previewCleanup(
    operation: string,
    retentionDays = 30,
    uploadsDir?: string
  ): {
    operation: string;
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
  } | null {
    const now = Date.now();
    const cutoffMs = now - Math.max(0, retentionDays) * 24 * 3600 * 1000;
    // Sync expired keys first
    this.getKeyRecords();

    const buildRes = (res: {
      operation: string;
      label: string;
      affected_count: number;
      total_in_section?: number;
      protected_count?: number;
      permanent: boolean;
      description: string;
      requires_super_admin: boolean;
      details?: string[];
    }) => ({
      ...res,
      count: res.affected_count,
      sample_items: res.details || [],
    });

    switch (operation) {
      case 'keys_expired':
      case 'keys_expired_revoked': {
        const total = this.db.key_records.length;
        const eligible = this.db.key_records.filter(
          (k) =>
            k.status === 'expired' ||
            k.status === 'revoked' ||
            new Date(k.expires_at).getTime() <= now
        );
        const activeProtected = total - eligible.length;
        return buildRes({
          operation,
          label: 'Delete Expired & Revoked Keys',
          affected_count: eligible.length,
          total_in_section: total,
          protected_count: activeProtected,
          permanent: true,
          description:
            eligible.length > 0
              ? `Permanently removes ${eligible.length} expired/revoked key record(s). ${activeProtected} active student key(s) are preserved.`
              : total > 0
              ? `0 of ${total} key record(s) are expired or revoked. All ${activeProtected} current key(s) are active and protected.`
              : 'No key records exist in the database.',
          requires_super_admin: false,
          details: eligible.slice(0, 8).map((k) => `${k.user_email} (${k.status})`),
        });
      }
      case 'keys_all': {
        const total = this.db.key_records.length;
        const activeCount = this.db.key_records.filter(
          (k) => k.status === 'active' && new Date(k.expires_at).getTime() > now
        ).length;
        return buildRes({
          operation,
          label: 'Delete All Key Records (Revokes Active Keys)',
          affected_count: total,
          total_in_section: total,
          protected_count: 0,
          permanent: true,
          description:
            total > 0
              ? `Permanently deletes all ${total} key record(s) (${activeCount} currently active key(s) will be revoked first).`
              : 'No key records exist in the database.',
          requires_super_admin: true,
          details: this.db.key_records.slice(0, 8).map((k) => `${k.user_email} (${k.status})`),
        });
      }
      case 'keys_older_than': {
        const total = this.db.key_records.length;
        const eligible = this.db.key_records.filter(
          (k) =>
            (k.status === 'expired' || k.status === 'revoked' || new Date(k.expires_at).getTime() <= now) &&
            new Date(k.generated_at).getTime() < cutoffMs
        );
        return buildRes({
          operation,
          label: `Delete Inactive Keys Older Than ${retentionDays} Days`,
          affected_count: eligible.length,
          total_in_section: total,
          protected_count: total - eligible.length,
          permanent: true,
          description:
            eligible.length > 0
              ? `Permanently deletes ${eligible.length} expired or revoked key record(s) generated more than ${retentionDays} days ago. Active keys are never deleted.`
              : total > 0
              ? `0 of ${total} key record(s) match 'inactive AND older than ${retentionDays} days'. Use 'Delete Expired & Revoked Keys' to remove recent expired keys.`
              : 'No key records exist in the database.',
          requires_super_admin: false,
          details: eligible.slice(0, 8).map((k) => `${k.user_email} (${k.status})`),
        });
      }
      case 'login_history_old':
      case 'login_history_older_than': {
        const total = this.db.login_history.length;
        const eligible = this.db.login_history.filter(
          (lh) => new Date(lh.timestamp).getTime() < cutoffMs
        );
        return buildRes({
          operation,
          label: `Clear Login History Older Than ${retentionDays} Days`,
          affected_count: eligible.length,
          total_in_section: total,
          protected_count: total - eligible.length,
          permanent: true,
          description:
            eligible.length > 0
              ? `Permanently removes ${eligible.length} login history record(s) older than ${retentionDays} days while retaining ${total - eligible.length} recent log(s).`
              : total > 0
              ? `0 of ${total} login history record(s) are older than ${retentionDays} days (all ${total} records are recent). Use 'Clear All History' or select specific rows to delete recent records.`
              : 'No login history records exist in the database.',
          requires_super_admin: false,
          details: eligible.slice(0, 8).map((lh) => `${lh.email} (${new Date(lh.timestamp).toLocaleDateString()})`),
        });
      }
      case 'login_history_all': {
        const total = this.db.login_history.length;
        return buildRes({
          operation,
          label: 'Clear All Login History',
          affected_count: total,
          total_in_section: total,
          protected_count: 0,
          permanent: true,
          description:
            total > 0
              ? `Permanently clears all ${total} stored login history audit log(s) from the Login History section.`
              : 'No login history records exist in the database.',
          requires_super_admin: true,
          details: this.db.login_history.slice(0, 8).map((lh) => `${lh.email} (${lh.status})`),
        });
      }
      case 'announcements_expired':
      case 'announcements_expired_disabled': {
        const total = this.db.announcements.length;
        const eligible = this.db.announcements.filter((a) => {
          if (!a.is_published) return true;
          if (a.end_date) {
            const endMs = new Date(a.end_date).getTime();
            if (!isNaN(endMs) && endMs < now) return true;
          }
          return false;
        });
        return buildRes({
          operation,
          label: 'Delete Disabled & Expired Announcements',
          affected_count: eligible.length,
          total_in_section: total,
          protected_count: total - eligible.length,
          permanent: true,
          description:
            eligible.length > 0
              ? `Permanently removes ${eligible.length} unpublished/disabled or expired announcement(s). ${total - eligible.length} active published announcement(s) are preserved.`
              : total > 0
              ? `0 of ${total} announcement(s) are disabled or expired. All ${total} announcement(s) are currently active and published.`
              : 'No announcements exist in the database.',
          requires_super_admin: false,
          details: eligible.slice(0, 8).map((a) => a.title),
        });
      }
      case 'announcements_all': {
        const total = this.db.announcements.length;
        return buildRes({
          operation,
          label: 'Delete All Announcements',
          affected_count: total,
          total_in_section: total,
          protected_count: 0,
          permanent: true,
          description:
            total > 0
              ? `Permanently deletes all ${total} announcement(s) in the Announcements section.`
              : 'No announcements exist in the database.',
          requires_super_admin: true,
          details: this.db.announcements.slice(0, 8).map((a) => a.title),
        });
      }
      case 'payments_failed_pending':
      case 'payments_all_non_completed': {
        const total = this.db.payment_records.length;
        const completedCount = this.db.payment_records.filter((p) => p.status === 'completed').length;
        const eligible = this.db.payment_records.filter((p) => p.status !== 'completed');
        return buildRes({
          operation,
          label: 'Delete All Failed & Pending Payments',
          affected_count: eligible.length,
          total_in_section: total,
          protected_count: completedCount,
          permanent: true,
          description:
            eligible.length > 0
              ? `Removes ${eligible.length} failed/pending payment record(s). ${completedCount} completed payment record(s) are strictly preserved for financial audit compliance.`
              : total > 0
              ? `0 of ${total} payment record(s) are failed or pending. All ${completedCount} record(s) are Completed payments protected for financial audit compliance.`
              : 'No payment records exist in the database.',
          requires_super_admin: false,
          details: eligible.slice(0, 8).map((p) => `${p.email} - ₹${p.amount} (${p.status})`),
        });
      }
      case 'payments_old': {
        const total = this.db.payment_records.length;
        const completedCount = this.db.payment_records.filter((p) => p.status === 'completed').length;
        const eligible = this.db.payment_records.filter(
          (p) =>
            p.status === 'failed' ||
            p.status === 'rejected' ||
            ((p.status === 'pending' || p.status === 'pending_verification') &&
              new Date(p.created_at).getTime() < cutoffMs)
        );
        return buildRes({
          operation,
          label: `Clean Up Failed & Stale Pending Payments (> ${retentionDays} Days)`,
          affected_count: eligible.length,
          total_in_section: total,
          protected_count: completedCount,
          permanent: true,
          description:
            eligible.length > 0
              ? `Removes ${eligible.length} failed/stale pending payment(s). ${completedCount} completed payment record(s) are strictly preserved.`
              : total > 0
              ? `0 of ${total} payment record(s) match failed or pending older than ${retentionDays} days (${completedCount} completed payment(s) are protected).`
              : 'No payment records exist in the database.',
          requires_super_admin: true,
          details: eligible.slice(0, 8).map((p) => `${p.email} - ₹${p.amount} (${p.status})`),
        });
      }
      case 'vip_expired':
      case 'vip_clear_expired': {
        const totalUsers = this.db.users.length;
        const eligible = this.db.users.filter(
          (u) =>
            u.role === 'user' &&
            u.vip_active &&
            u.vip_expires_at &&
            new Date(u.vip_expires_at).getTime() <= now
        );
        const activeVips = this.db.users.filter(
          (u) => u.vip_active && (!u.vip_expires_at || new Date(u.vip_expires_at).getTime() > now)
        ).length;
        return buildRes({
          operation,
          label: 'Reset Expired VIP Flags',
          affected_count: eligible.length,
          total_in_section: totalUsers,
          protected_count: activeVips,
          permanent: false,
          description:
            eligible.length > 0
              ? `Marks vip_active = false on ${eligible.length} student account(s) whose VIP expiration timestamp has passed. ${activeVips} active VIP account(s) are preserved.`
              : `0 student accounts have an unreset expired VIP flag. All ${activeVips} active VIP entitlement(s) are valid and preserved.`,
          requires_super_admin: false,
          details: eligible.slice(0, 8).map((u) => u.email),
        });
      }
      case 'vip_device_logs_all': {
        const logs = this.db.vip_device_logs || [];
        return buildRes({
          operation,
          label: 'Clear All VIP Device Security Logs',
          affected_count: logs.length,
          total_in_section: logs.length,
          protected_count: 0,
          permanent: true,
          description:
            logs.length > 0
              ? `Permanently clears all ${logs.length} VIP device binding and sharing attempt audit log(s). Active device bindings on student accounts are not reset.`
              : 'No VIP device security logs exist.',
          requires_super_admin: true,
          details: logs.slice(0, 8).map((l) => `${l.email} (${l.event_type})`),
        });
      }
      case 'vip_device_logs_old': {
        const logs = this.db.vip_device_logs || [];
        const eligible = logs.filter((l) => new Date(l.timestamp).getTime() < cutoffMs);
        return buildRes({
          operation,
          label: `Clear VIP Device Logs Older Than ${retentionDays} Days`,
          affected_count: eligible.length,
          total_in_section: logs.length,
          protected_count: logs.length - eligible.length,
          permanent: true,
          description:
            eligible.length > 0
              ? `Permanently removes ${eligible.length} VIP device security log(s) older than ${retentionDays} days.`
              : logs.length > 0
              ? `0 of ${logs.length} VIP device security log(s) are older than ${retentionDays} days.`
              : 'No VIP device security logs exist.',
          requires_super_admin: false,
          details: eligible.slice(0, 8).map((l) => `${l.email} (${l.event_type})`),
        });
      }
      case 'platforms_inactive': {
        const total = this.db.platforms.length;
        const eligible = this.db.platforms.filter((p) => p.status === 'inactive');
        return buildRes({
          operation,
          label: 'Delete Inactive Platforms',
          affected_count: eligible.length,
          total_in_section: total,
          protected_count: total - eligible.length,
          permanent: true,
          description:
            eligible.length > 0
              ? `Permanently deletes ${eligible.length} platform(s) currently marked as Inactive. ${total - eligible.length} active platform(s) are untouched.`
              : `0 of ${total} platform(s) are marked as Inactive. All ${total} platform(s) are currently Active and protected (or select specific platforms in the list to delete).`,
          requires_super_admin: true,
          details: eligible.map((p) => p.name),
        });
      }
      case 'plans_inactive': {
        const total = this.db.vip_plans.length;
        const eligible = this.db.vip_plans.filter((p) => !p.is_active);
        return buildRes({
          operation,
          label: 'Delete Inactive VIP Plans',
          affected_count: eligible.length,
          total_in_section: total,
          protected_count: total - eligible.length,
          permanent: true,
          description:
            eligible.length > 0
              ? `Permanently deletes ${eligible.length} VIP plan(s) currently marked as Inactive. ${total - eligible.length} active plan(s) are untouched.`
              : `0 of ${total} VIP plan(s) are marked as Inactive. All ${total} plan(s) are currently Active and protected.`,
          requires_super_admin: true,
          details: eligible.map((p) => p.title),
        });
      }
      case 'users_inactive':
      case 'users_expired_inactive': {
        const total = this.db.users.length;
        const completedPaymentUserIds = new Set(
          this.db.payment_records.filter((p) => p.status === 'completed').map((p) => p.user_id)
        );
        const completedPaymentEmails = new Set(
          this.db.payment_records.filter((p) => p.status === 'completed').map((p) => p.email.toLowerCase())
        );
        const eligible = this.db.users.filter((u) => {
          if (u.role !== 'user') return false;
          if (u.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com') return false;
          const hasValidVip = u.vip_active && (!u.vip_expires_at || new Date(u.vip_expires_at).getTime() > now);
          if (hasValidVip) return false;
          const hasValidFree = u.free_access_expires_at && new Date(u.free_access_expires_at).getTime() > now;
          if (hasValidFree) return false;
          if (completedPaymentUserIds.has(u.id) || completedPaymentEmails.has(u.email.toLowerCase())) return false;
          const lastActivity = u.last_login_at ? new Date(u.last_login_at).getTime() : new Date(u.created_at).getTime();
          return lastActivity < cutoffMs;
        });
        return buildRes({
          operation,
          label: `Delete Inactive Expired Users (> ${retentionDays} Days)`,
          affected_count: eligible.length,
          total_in_section: total,
          protected_count: total - eligible.length,
          permanent: true,
          description:
            eligible.length > 0
              ? `Permanently deletes ${eligible.length} student account(s) inactive for over ${retentionDays} days with no active VIP, no active Free Access, and no completed payments.`
              : `0 of ${total} user account(s) are inactive for > ${retentionDays} days without VIP/Free Access/Completed Payments. Select specific users in the table below to delete individual accounts immediately.`,
          requires_super_admin: true,
          details: eligible.slice(0, 10).map((u) => u.email),
        });
      }
      case 'storage_unused_assets':
      case 'storage_orphaned_files': {
        const orphaned = uploadsDir ? this.getOrphanedUploadFiles(uploadsDir) : [];
        return buildRes({
          operation,
          label: 'Delete Unreferenced Uploaded Files',
          affected_count: orphaned.length,
          permanent: true,
          description: 'Scans /uploads and removes only unreferenced image files not used by App Logo, Platforms, VIP Batches, Donation QR, or Custom Popups.',
          requires_super_admin: true,
          details: orphaned,
        });
      }
      default:
        return null;
    }
  }

  public async executeCleanup(
    operation: string,
    retentionDays = 30,
    uploadsDir?: string
  ): Promise<{ removed_count: number; message: string; deleted_user_ids?: string[] } | null> {
    const now = Date.now();
    const cutoffMs = now - Math.max(0, retentionDays) * 24 * 3600 * 1000;
    this.getKeyRecords();

    switch (operation) {
      case 'keys_expired':
      case 'keys_expired_revoked': {
        const toDelete = this.db.key_records.filter(
          (k) =>
            k.status === 'expired' ||
            k.status === 'revoked' ||
            new Date(k.expires_at).getTime() <= now
        );
        for (const k of toDelete) {
          await this.deleteKeyRecord(k.id);
        }
        return { removed_count: toDelete.length, message: `Deleted ${toDelete.length} expired/revoked key record(s).` };
      }
      case 'keys_all': {
        const toDelete = [...this.db.key_records];
        for (const k of toDelete) {
          await this.deleteKeyRecord(k.id);
        }
        return { removed_count: toDelete.length, message: `Deleted all ${toDelete.length} key record(s).` };
      }
      case 'keys_older_than': {
        const toDelete = this.db.key_records.filter(
          (k) =>
            (k.status === 'expired' || k.status === 'revoked' || new Date(k.expires_at).getTime() <= now) &&
            new Date(k.generated_at).getTime() < cutoffMs
        );
        for (const k of toDelete) {
          await this.deleteKeyRecord(k.id);
        }
        return { removed_count: toDelete.length, message: `Deleted ${toDelete.length} inactive key record(s) older than ${retentionDays} days.` };
      }
      case 'login_history_old':
      case 'login_history_older_than': {
        const toDelete = this.db.login_history.filter(
          (lh) => new Date(lh.timestamp).getTime() < cutoffMs
        );
        for (const lh of toDelete) {
          await this.deleteLoginHistoryEntry(lh.id);
        }
        return { removed_count: toDelete.length, message: `Cleared ${toDelete.length} login history record(s) older than ${retentionDays} days.` };
      }
      case 'login_history_all': {
        const toDelete = [...this.db.login_history];
        for (const lh of toDelete) {
          await this.deleteLoginHistoryEntry(lh.id);
        }
        return { removed_count: toDelete.length, message: `Cleared all ${toDelete.length} login history record(s).` };
      }
      case 'announcements_expired':
      case 'announcements_expired_disabled': {
        const toDelete = this.db.announcements.filter((a) => {
          if (!a.is_published) return true;
          if (a.end_date) {
            const endMs = new Date(a.end_date).getTime();
            if (!isNaN(endMs) && endMs < now) return true;
          }
          return false;
        });
        for (const a of toDelete) {
          await this.deleteAnnouncement(a.id);
        }
        return { removed_count: toDelete.length, message: `Deleted ${toDelete.length} disabled/expired announcement(s).` };
      }
      case 'announcements_all': {
        const toDelete = [...this.db.announcements];
        for (const a of toDelete) {
          await this.deleteAnnouncement(a.id);
        }
        return { removed_count: toDelete.length, message: `Deleted all ${toDelete.length} announcement(s).` };
      }
      case 'payments_failed_pending':
      case 'payments_all_non_completed': {
        const toDelete = this.db.payment_records.filter((p) => p.status !== 'completed');
        let removed = 0;
        for (const p of toDelete) {
          const res = await this.deletePaymentRecord(p.id);
          if (res.deleted) removed++;
        }
        return {
          removed_count: removed,
          message: `Cleaned up ${removed} failed/pending payment record(s). All completed payments were preserved.`,
        };
      }
      case 'payments_old': {
        const toDelete = this.db.payment_records.filter(
          (p) =>
            p.status === 'failed' ||
            p.status === 'rejected' ||
            ((p.status === 'pending' || p.status === 'pending_verification') &&
              new Date(p.created_at).getTime() < cutoffMs)
        );
        let removed = 0;
        for (const p of toDelete) {
          const res = await this.deletePaymentRecord(p.id);
          if (res.deleted) removed++;
        }
        return {
          removed_count: removed,
          message: `Cleaned up ${removed} failed/abandoned payment record(s). All completed payments were preserved.`,
        };
      }
      case 'vip_expired':
      case 'vip_clear_expired': {
        let count = 0;
        for (const u of this.db.users) {
          if (
            u.role === 'user' &&
            u.vip_active &&
            u.vip_expires_at &&
            new Date(u.vip_expires_at).getTime() <= now
          ) {
            await this.updateUser(u.id, { vip_active: false });
            count++;
          }
        }
        return { removed_count: count, message: `Reset expired VIP status flag on ${count} student account(s).` };
      }
      case 'vip_device_logs_all': {
        const toDelete = [...(this.db.vip_device_logs || [])];
        for (const l of toDelete) {
          await this.deleteVipDeviceLog(l.id);
        }
        return { removed_count: toDelete.length, message: `Cleared all ${toDelete.length} VIP device security log(s).` };
      }
      case 'vip_device_logs_old': {
        const toDelete = (this.db.vip_device_logs || []).filter(
          (l) => new Date(l.timestamp).getTime() < cutoffMs
        );
        for (const l of toDelete) {
          await this.deleteVipDeviceLog(l.id);
        }
        return {
          removed_count: toDelete.length,
          message: `Cleared ${toDelete.length} VIP device security log(s) older than ${retentionDays} days.`,
        };
      }
      case 'platforms_inactive': {
        const toDelete = this.db.platforms.filter((p) => p.status === 'inactive');
        for (const p of toDelete) {
          await this.deletePlatform(p.id);
        }
        return { removed_count: toDelete.length, message: `Deleted ${toDelete.length} inactive platform(s).` };
      }
      case 'plans_inactive': {
        const toDelete = this.db.vip_plans.filter((p) => !p.is_active);
        for (const p of toDelete) {
          await this.deleteVipPlan(p.id);
        }
        return { removed_count: toDelete.length, message: `Deleted ${toDelete.length} inactive VIP plan(s).` };
      }
      case 'users_inactive':
      case 'users_expired_inactive': {
        const completedPaymentUserIds = new Set(
          this.db.payment_records.filter((p) => p.status === 'completed').map((p) => p.user_id)
        );
        const completedPaymentEmails = new Set(
          this.db.payment_records.filter((p) => p.status === 'completed').map((p) => p.email.toLowerCase())
        );
        const toDelete = this.db.users.filter((u) => {
          if (u.role !== 'user') return false;
          if (u.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com') return false;
          const hasValidVip = u.vip_active && (!u.vip_expires_at || new Date(u.vip_expires_at).getTime() > now);
          if (hasValidVip) return false;
          const hasValidFree = u.free_access_expires_at && new Date(u.free_access_expires_at).getTime() > now;
          if (hasValidFree) return false;
          if (completedPaymentUserIds.has(u.id) || completedPaymentEmails.has(u.email.toLowerCase())) return false;
          const lastActivity = u.last_login_at ? new Date(u.last_login_at).getTime() : new Date(u.created_at).getTime();
          return lastActivity < cutoffMs;
        });
        const deletedIds: string[] = [];
        for (const u of toDelete) {
          this.revokeAllUserKeys(u.id, u.email);
          const ok = await this.deleteUser(u.id);
          if (ok) deletedIds.push(u.id);
        }
        return {
          removed_count: deletedIds.length,
          deleted_user_ids: deletedIds,
          message: `Deleted ${deletedIds.length} inactive expired student account(s).`,
        };
      }
      case 'storage_unused_assets':
      case 'storage_orphaned_files': {
        if (!uploadsDir) return { removed_count: 0, message: 'No uploads directory configured.' };
        const orphaned = this.getOrphanedUploadFiles(uploadsDir);
        let removed = 0;
        for (const file of orphaned) {
          try {
            fs.unlinkSync(path.join(uploadsDir, file));
            removed++;
          } catch {
            // Ignore unlink error
          }
        }
        return {
          removed_count: removed,
          message: `Removed ${removed} unreferenced file(s) from local uploads storage.`,
        };
      }
      default:
        return null;
    }
  }

  public async rehydrateFromSupabase(supabaseUrl: string, supabaseKey: string): Promise<void> {
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project')) {
      return;
    }
    try {
      if (!this.supabase) {
        this.supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
      }

      // Execute all 10 table queries in parallel for near-instant server boot
      const [
        { data: remoteUsers, error: usersErr },
        { data: remoteSettings, error: settingsErr },
        { data: remotePlatforms, error: platErr },
        { data: remotePlans, error: plansErr },
        { data: remoteBatches, error: batchesErr },
        { data: remoteAnnouncements, error: annErr },
        { data: remotePayments, error: payErr },
        { data: remoteKeys, error: keyErr },
        { data: remoteLoginHistory, error: lhErr },
        { data: remoteDeviceLogs, error: dlErr },
      ] = await Promise.all([
        this.supabase.from('app_users').select('*'),
        this.supabase.from('app_settings').select('*').eq('id', 'global_config').maybeSingle(),
        this.supabase.from('platforms').select('*').order('display_order', { ascending: true }),
        this.supabase.from('vip_plans').select('*').order('display_order', { ascending: true }),
        this.supabase.from('vip_batches').select('*').order('display_order', { ascending: true }),
        this.supabase.from('announcements').select('*').order('display_order', { ascending: true }),
        this.supabase.from('payment_records').select('*').order('created_at', { ascending: false }),
        this.supabase.from('key_records').select('*').order('generated_at', { ascending: false }),
        this.supabase.from('login_history').select('*').order('timestamp', { ascending: false }).limit(500),
        this.supabase.from('vip_device_logs').select('*').order('timestamp', { ascending: false }).limit(500),
      ]);

      // Detect uninitialized Supabase project (missing core tables such as PGRST205 / 42P01)
      const isMissingTableErr = (err: { code?: string; message?: string } | null | undefined) => {
        if (!err) return false;
        const msg = String(err.message || '');
        return (
          err.code === 'PGRST205' ||
          err.code === '42P01' ||
          msg.includes('Could not find the table') ||
          msg.includes('does not exist')
        );
      };

      if (isMissingTableErr(usersErr) || isMissingTableErr(settingsErr)) {
        const cloudClient =
          this.supabase ||
          createClient(supabaseUrl, supabaseKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
        const cloudActivated = await this.activateAutomaticCloudStorage(cloudClient, false);
        if (!cloudActivated) {
          this.supabase = null;
          this.supabaseSchemaReady = true;
          this.supabaseSchemaError = null;
          console.warn('[STORAGE] Continuing with persistent local JSON + backup storage (data/database.json).');
        }
        return;
      }

      this.supabaseSchemaReady = true;
      this.supabaseSchemaError = null;

      // 1. Rehydrate app_users
      if (!usersErr && remoteUsers && remoteUsers.length > 0) {
        const localByEmail = new Map<string, User>();
        const localById = new Map<string, User>();
        for (const lu of this.db.users || []) {
          if (lu.email) localByEmail.set(lu.email.toLowerCase(), lu);
          if (lu.id) localById.set(lu.id, lu);
        }
        const remoteUserMap = new Map<string, User>();
        const confirmedTestIdsToPurge: string[] = [];
        for (const u of remoteUsers) {
          const email = (u.email || '').toLowerCase();
          if (isConfirmedTestOrDemoEmail(email)) {
            if (u.id) confirmedTestIdsToPurge.push(u.id);
            continue;
          }
          const localMatch = localById.get(u.id) || localByEmail.get(email);
          const refRec = (this.db.vip_referrals || []).find(
            (r) => (r.referred_user_id === u.id || r.referred_email?.toLowerCase() === email) && r.status !== 'rejected_fraud'
          );
          remoteUserMap.set(email, {
            id: u.id,
            name: u.name || localMatch?.name || '',
            email,
            password_hash: u.password_hash || localMatch?.password_hash || '',
            role: email === 'bhaskardattmishra0101@gmail.com' ? 'super_admin' : (u.role || localMatch?.role || 'user'),
            vip_active: email === 'bhaskardattmishra0101@gmail.com' ? true : Boolean(u.vip_active),
            vip_expires_at: u.vip_expires_at || null,
            vip_allowed_platform_ids: Array.isArray(u.vip_allowed_platform_ids)
              ? u.vip_allowed_platform_ids
              : localMatch?.vip_allowed_platform_ids || [],
            vip_platform_expiries:
              u.vip_platform_expiries && typeof u.vip_platform_expiries === 'object'
                ? u.vip_platform_expiries
                : localMatch?.vip_platform_expiries || {},
            free_access_expires_at: u.free_access_expires_at || null,
            is_blocked: Boolean(u.is_blocked),
            blocked_at: u.blocked_at || null,
            blocked_reason: u.blocked_reason || null,
            blocked_by: u.blocked_by || null,
            vip_bound_device_id: u.vip_bound_device_id || localMatch?.vip_bound_device_id || null,
            vip_bound_session_id: u.vip_bound_session_id || localMatch?.vip_bound_session_id || null,
            vip_device_label: u.vip_device_label || localMatch?.vip_device_label || null,
            vip_device_bound_at: u.vip_device_bound_at || localMatch?.vip_device_bound_at || null,
            vip_device_last_seen_at: u.vip_device_last_seen_at || localMatch?.vip_device_last_seen_at || null,
            vip_device_last_ip: u.vip_device_last_ip || localMatch?.vip_device_last_ip || null,
            vip_device_last_ua: u.vip_device_last_ua || localMatch?.vip_device_last_ua || null,
            vip_device_reset_count: typeof u.vip_device_reset_count === 'number' ? u.vip_device_reset_count : (localMatch?.vip_device_reset_count || 0),
            vip_device_last_reset_at: u.vip_device_last_reset_at || localMatch?.vip_device_last_reset_at || null,
            vip_device_last_reset_by: u.vip_device_last_reset_by || localMatch?.vip_device_last_reset_by || null,
            vip_sharing_attempt_count: typeof u.vip_sharing_attempt_count === 'number' ? u.vip_sharing_attempt_count : (localMatch?.vip_sharing_attempt_count || 0),
            vip_last_sharing_attempt_at: u.vip_last_sharing_attempt_at || localMatch?.vip_last_sharing_attempt_at || null,
            referral_code: u.referral_code || localMatch?.referral_code || undefined,
            referred_by_user_id: u.referred_by_user_id ?? localMatch?.referred_by_user_id ?? refRec?.referrer_user_id ?? null,
            referred_by_code: u.referred_by_code ?? localMatch?.referred_by_code ?? refRec?.referral_code ?? null,
            referred_at: u.referred_at ?? localMatch?.referred_at ?? refRec?.created_at ?? null,
            bonus_vip_days: typeof u.bonus_vip_days === 'number' ? Math.max(u.bonus_vip_days, localMatch?.bonus_vip_days || 0) : (localMatch?.bonus_vip_days || 0),
            created_at: u.created_at || localMatch?.created_at || new Date().toISOString(),
            last_login_at: u.last_login_at || localMatch?.last_login_at || null,
          });
        }

        if (confirmedTestIdsToPurge.length > 0 && this.supabase) {
          this.supabase.from('app_users').delete().in('id', confirmedTestIdsToPurge).then(() => {});
        }

        // Keep local Super Admin if not yet migrated in Supabase
        const currentSuperAdmin = this.db.users.find((u) => u.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com');
        if (currentSuperAdmin && !remoteUserMap.has('bhaskardattmishra0101@gmail.com')) {
          remoteUserMap.set('bhaskardattmishra0101@gmail.com', currentSuperAdmin);
        }

        // Authoritative replacement from Supabase: deleted sample accounts will NEVER resurrect!
        this.db.users = Array.from(remoteUserMap.values());
      } else if (remoteUsers && remoteUsers.length === 0) {
        // App users table is newly created, ensure Super Admin is inserted
        const currentSuperAdmin = this.db.users.find((u) => u.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com');
        if (currentSuperAdmin) {
          await this.createUser(currentSuperAdmin).catch(() => {});
        }
      }

      // 2. Rehydrate settings if available (preserving referral_discount_config & referral_program_enabled if columns are absent)
      if (!settingsErr && remoteSettings) {
        const prevDiscountCfg = this.getReferralDiscountConfig();
        const prevRefEnabled = this.isReferralProgramEnabled();
        const remoteDiscountCfg =
          remoteSettings.referral_discount_config && typeof remoteSettings.referral_discount_config === 'object'
            ? {
                ...getDefaultReferralDiscountConfig(),
                ...prevDiscountCfg,
                ...remoteSettings.referral_discount_config,
              }
            : prevDiscountCfg;
        const remoteRefEnabled =
          typeof remoteSettings.referral_program_enabled === 'boolean'
            ? remoteSettings.referral_program_enabled
            : prevRefEnabled;

        this.db.settings = {
          ...this.db.settings,
          ...remoteSettings,
          referral_program_enabled: remoteRefEnabled,
          referral_discount_config: remoteDiscountCfg,
          app_name:
            remoteSettings.app_name && remoteSettings.app_name !== 'Education Platform'
              ? remoteSettings.app_name
              : this.db.settings.app_name || 'STUDY BLUNDER',
          updated_at: remoteSettings.updated_at || this.db.settings.updated_at,
        };
      }

      // 3. Rehydrate platforms if available (NEVER wipe local admin-added platforms if Supabase table was freshly created & empty)
      if (!platErr && Array.isArray(remotePlatforms)) {
        if (remotePlatforms.length > 0) {
          this.db.platforms = remotePlatforms;
        } else if (this.db.platforms.length > 0) {
          for (const lp of this.db.platforms) {
            await this.supabase.from('platforms').upsert(lp).then(() => {});
          }
        }
      }

      // 4. Rehydrate VIP plans if available (preserve & push local plans if remote table is newly created & empty)
      if (!plansErr && Array.isArray(remotePlans)) {
        if (remotePlans.length > 0) {
          this.db.vip_plans = remotePlans.map((pl: VipPlan) => ({
            ...pl,
            plan_scope: pl.plan_scope === 'single_platform' ? 'single_platform' : 'all_platforms',
          }));
        } else if (this.db.vip_plans.length > 0) {
          for (const lpl of this.db.vip_plans) {
            await this.supabase.from('vip_plans').upsert(lpl).then(() => {});
          }
        }
      }

      // 5. Rehydrate VIP batches if available
      if (!batchesErr && Array.isArray(remoteBatches)) {
        if (remoteBatches.length > 0) {
          this.db.vip_batches = remoteBatches;
        } else if (this.db.vip_batches.length > 0) {
          for (const lb of this.db.vip_batches) {
            await this.supabase.from('vip_batches').upsert(lb).then(() => {});
          }
        }
      }

      // 6. Rehydrate announcements if available
      if (!annErr && Array.isArray(remoteAnnouncements)) {
        if (remoteAnnouncements.length > 0) {
          this.db.announcements = remoteAnnouncements;
        } else if (this.db.announcements.length > 0) {
          for (const la of this.db.announcements) {
            await this.supabase.from('announcements').upsert(la).then(() => {});
          }
        }
      }

      // 7. Rehydrate payment_records if available
      if (!payErr && Array.isArray(remotePayments)) {
        if (remotePayments.length > 0) {
          this.db.payment_records = remotePayments;
        } else if (this.db.payment_records.length > 0) {
          for (const lpay of this.db.payment_records) {
            await this.supabase.from('payment_records').upsert(lpay).then(() => {});
          }
        }
      }

      // 8. Rehydrate key_records if available (extracting FLOW:, PLATLOG:, FESTIVAL_STATE:, FEEDBACK_ITEM:, PW_RESET:)
      const fallbackPlatformLogs: PlatformUsageLog[] = [];
      const fallbackFeedbackItems: UserFeedbackRecord[] = [];
      if (!keyErr && remoteKeys) {
        const nowMs = Date.now();
        const actualKeyRecords: KeyRecord[] = [];
        for (const k of remoteKeys as KeyRecord[]) {
          const rawToken = String(k.token || '').trim();
          if (rawToken.startsWith('FLOW:')) {
            const flowToken = rawToken.slice('FLOW:'.length).trim();
            const expMs = new Date(k.expires_at).getTime();
            const startMs = new Date(k.generated_at).getTime();
            if (flowToken && expMs > nowMs && Number.isFinite(startMs)) {
              this.pending_verifications.set(flowToken, {
                id: k.id,
                token: flowToken,
                user_id: k.user_id,
                user_email: (k.user_email || '').toLowerCase(),
                target_url: k.shortener_url || (this.db.settings.shortener_url || '').trim(),
                created_at: new Date(startMs).toISOString(),
                earliest_key_at: new Date(startMs + MIN_VPLINK_WAIT_MS).toISOString(),
                expires_at: new Date(expMs).toISOString(),
                consumed: false,
                key_claimed: false,
                claimed_key_id: null,
                claimed_key_token: null,
              });
            }
          } else if (rawToken.startsWith('PLATLOG:')) {
            try {
              const parsedLog = JSON.parse(rawToken.slice('PLATLOG:'.length));
              if (parsedLog && parsedLog.p && parsedLog.u && parsedLog.t) {
                fallbackPlatformLogs.push({
                  id: parsedLog.id || k.id,
                  platform_id: String(parsedLog.p),
                  user_id: String(parsedLog.u),
                  user_email: parsedLog.e ? String(parsedLog.e).toLowerCase() : (k.user_email || '').toLowerCase(),
                  opened_at: new Date(parsedLog.t).toISOString(),
                });
              }
            } catch {
              // Ignore malformed fallback log token
            }
          } else if (rawToken.startsWith('FESTIVAL_STATE:')) {
            try {
              const parsedFestState = JSON.parse(rawToken.slice('FESTIVAL_STATE:'.length));
              if (parsedFestState && typeof parsedFestState === 'object') {
                if (parsedFestState.festival_decorations_enabled !== undefined) {
                  this.db.settings.festival_decorations_enabled = Boolean(parsedFestState.festival_decorations_enabled);
                }
                if (parsedFestState.active_festival_id !== undefined) {
                  this.db.settings.active_festival_id = parsedFestState.active_festival_id || null;
                }
                if (parsedFestState.festival_configs_json) {
                  this.db.settings.festival_configs_json = normalizeAllFestivalConfigs(parsedFestState.festival_configs_json);
                }
                if (typeof parsedFestState.festival_version === 'number') {
                  this.db.settings.festival_version = parsedFestState.festival_version;
                }
              }
            } catch {
              // Ignore malformed fallback festival state
            }
          } else if (rawToken.startsWith('SETTINGS_EXT_STATE:')) {
            try {
              const parsedExtState = JSON.parse(rawToken.slice('SETTINGS_EXT_STATE:'.length));
              if (parsedExtState && typeof parsedExtState === 'object') {
                const extTs = parsedExtState.updated_at ? new Date(parsedExtState.updated_at).getTime() : 0;
                const curTs = this.db.settings.updated_at ? new Date(this.db.settings.updated_at).getTime() : 0;
                const { festival_configs_json: _omitFest, id: _omitId, ...safeExt } = parsedExtState as Record<string, unknown>;
                if (extTs >= curTs) {
                  this.db.settings = {
                    ...this.db.settings,
                    ...(safeExt as Partial<AppSettings>),
                  };
                }
                if (typeof parsedExtState.referral_program_enabled === 'boolean') {
                  this.db.settings.referral_program_enabled = parsedExtState.referral_program_enabled;
                }
                if (parsedExtState.referral_discount_config && typeof parsedExtState.referral_discount_config === 'object') {
                  this.db.settings.referral_discount_config = {
                    ...getDefaultReferralDiscountConfig(),
                    ...this.db.settings.referral_discount_config,
                    ...parsedExtState.referral_discount_config,
                  };
                }
                if (typeof parsedExtState.vip_grace_period_hours === 'number') {
                  this.db.settings.vip_grace_period_hours = parsedExtState.vip_grace_period_hours;
                }
                if (typeof parsedExtState.referral_reward_days === 'number') {
                  this.db.settings.referral_reward_days = parsedExtState.referral_reward_days;
                }
              }
            } catch {
              // Ignore malformed fallback extended settings state
            }
          } else if (rawToken.startsWith('FEEDBACK_ITEM:')) {
            try {
              const parsedFb = JSON.parse(rawToken.slice('FEEDBACK_ITEM:'.length));
              if (parsedFb && parsedFb.id && parsedFb.user_id && parsedFb.message) {
                fallbackFeedbackItems.push(parsedFb as UserFeedbackRecord);
              }
            } catch {
              // Ignore malformed fallback feedback item
            }
          } else if (rawToken.startsWith('PW_RESET:')) {
            try {
              const parsedPw = JSON.parse(rawToken.slice('PW_RESET:'.length));
              if (parsedPw && parsedPw.token_hash && parsedPw.user_id) {
                if (!Array.isArray(this.db.password_reset_tokens)) {
                  this.db.password_reset_tokens = [];
                }
                const exists = this.db.password_reset_tokens.some((t) => t.token_hash === parsedPw.token_hash);
                if (!exists) {
                  this.db.password_reset_tokens.push(parsedPw);
                }
              }
            } catch {
              // Ignore
            }
          } else {
            actualKeyRecords.push(normalizeStoredKeyRecord(k));
          }
        }
        this.db.key_records = actualKeyRecords;
        this.syncPendingVerificationsToDb();
      }

      // 9. Rehydrate login_history if available (restoring tagged DEVICE_MISMATCH_BLOCKED / DEVICE_RESET_BY_ADMIN statuses)
      if (!lhErr && remoteLoginHistory) {
        this.db.login_history = remoteLoginHistory.map((lh: LoginHistoryEntry) => {
          const ua = String(lh.user_agent || '');
          let resolvedStatus = lh.status;
          if (ua.includes('[DEVICE_MISMATCH_BLOCKED]')) {
            resolvedStatus = 'DEVICE_MISMATCH_BLOCKED';
          } else if (ua.includes('[DEVICE_RESET_BY_ADMIN]')) {
            resolvedStatus = 'DEVICE_RESET_BY_ADMIN';
          }
          return {
            ...lh,
            status: resolvedStatus,
          };
        });
      }

      // 10. Rehydrate vip_device_logs if available
      if (!dlErr && remoteDeviceLogs) {
        this.db.vip_device_logs = remoteDeviceLogs;
      }

      // 10b. Rehydrate user_feedback table if present + fallback feedback records
      try {
        const { data: remoteFeedback, error: fbErr } = await this.supabase
          .from('user_feedback')
          .select('*')
          .order('created_at', { ascending: false });

        const fbMap = new Map<string, UserFeedbackRecord>();
        for (const localFb of this.db.user_feedback || []) {
          if (localFb && localFb.id) fbMap.set(localFb.id, localFb);
        }
        for (const fallbackFb of fallbackFeedbackItems) {
          if (fallbackFb && fallbackFb.id) fbMap.set(fallbackFb.id, fallbackFb);
        }
        if (!fbErr && Array.isArray(remoteFeedback)) {
          for (const row of remoteFeedback) {
            if (row && row.id) {
              fbMap.set(String(row.id), {
                id: String(row.id),
                user_id: String(row.user_id),
                user_email: String(row.user_email || '').toLowerCase(),
                is_vip_at_submission: Boolean(row.is_vip_at_submission),
                category: (row.category as FeedbackCategory) || 'General Feedback',
                rating: Math.min(5, Math.max(1, Number(row.rating) || 5)),
                message: String(row.message || ''),
                attachment_url: row.attachment_url || null,
                attachment_storage_path: row.attachment_storage_path || null,
                status: (row.status as FeedbackStatus) || 'New',
                admin_note: row.admin_note || null,
                reviewed_by: row.reviewed_by || null,
                reviewed_at: row.reviewed_at || null,
                created_at: row.created_at || new Date().toISOString(),
                updated_at: row.updated_at || row.created_at || new Date().toISOString(),
              });
            }
          }
        }
        this.db.user_feedback = Array.from(fbMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } catch {
        // Non-fatal if user_feedback table does not exist yet
      }

      // 11. Rehydrate platform_usage_logs (from dedicated table if present + fallback logs + local logs)
      try {
        const { data: remotePlatformLogs, error: plErr } = await this.supabase
          .from('platform_usage_logs')
          .select('*')
          .order('opened_at', { ascending: false })
          .limit(10000);

        const mergedMap = new Map<string, PlatformUsageLog>();
        for (const existing of this.db.platform_usage_logs || []) {
          if (existing && existing.id) {
            mergedMap.set(existing.id, existing);
          }
        }
        for (const fb of fallbackPlatformLogs) {
          if (fb && fb.id) {
            mergedMap.set(fb.id, fb);
          }
        }
        if (!plErr && Array.isArray(remotePlatformLogs)) {
          for (const row of remotePlatformLogs) {
            if (row && row.id && row.platform_id && row.user_id && row.opened_at) {
              mergedMap.set(String(row.id), {
                id: String(row.id),
                platform_id: String(row.platform_id),
                user_id: String(row.user_id),
                user_email: row.user_email ? String(row.user_email).toLowerCase() : undefined,
                opened_at: new Date(row.opened_at).toISOString(),
              });
            }
          }
        }
        this.db.platform_usage_logs = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()
        );
      } catch {
        // Non-fatal if platform_usage_logs table does not exist yet
      }

      // 12. Rehydrate festival_decorations table if present and normalize festival_configs_json
      try {
        this.db.settings.festival_configs_json = normalizeAllFestivalConfigs(
          this.db.settings.festival_configs_json as Record<string, Partial<FestivalDecorationConfig>> | undefined
        );
        const { data: remoteFestivals, error: festErr } = await this.supabase
          .from('festival_decorations')
          .select('*');
        if (!festErr && Array.isArray(remoteFestivals) && remoteFestivals.length > 0) {
          const mergedMap: Record<string, Partial<FestivalDecorationConfig>> = {
            ...(this.db.settings.festival_configs_json || {}),
          };
          for (const row of remoteFestivals) {
            if (row && isValidFestivalId(row.id)) {
              mergedMap[row.id] = {
                ...mergedMap[row.id],
                id: row.id,
                is_enabled: Boolean(row.is_enabled),
                start_at: row.start_at || null,
                end_at: row.end_at || null,
                manual_off_override: Boolean(row.manual_off_override),
                banner_enabled: row.banner_enabled !== undefined ? Boolean(row.banner_enabled) : true,
                banner_text: row.banner_text || undefined,
                banner_subtitle: row.banner_subtitle ?? undefined,
                corners_enabled: row.corners_enabled !== undefined ? Boolean(row.corners_enabled) : true,
                floating_enabled: row.floating_enabled !== undefined ? Boolean(row.floating_enabled) : true,
                border_enabled: row.border_enabled !== undefined ? Boolean(row.border_enabled) : true,
                glow_enabled: row.glow_enabled !== undefined ? Boolean(row.glow_enabled) : true,
                animation_enabled: row.animation_enabled !== undefined ? Boolean(row.animation_enabled) : true,
                animation_speed: row.animation_speed || 'normal',
                decoration_size: row.decoration_size || 'medium',
                opacity: typeof row.opacity === 'number' ? Number(row.opacity) : 0.9,
                target_screens: Array.isArray(row.target_screens) ? row.target_screens : ['home', 'vip', 'profile'],
                custom_assets: row.custom_assets && typeof row.custom_assets === 'object' ? row.custom_assets : {},
                updated_at: row.updated_at || new Date().toISOString(),
              };
            }
          }
          this.db.settings.festival_configs_json = normalizeAllFestivalConfigs(mergedMap);
        }
      } catch {
        // Non-fatal if festival_decorations table does not exist yet
      }

      this.saveDatabase(this.db);
      console.log('[STORAGE] Full parallel rehydration from Supabase completed successfully.');
    } catch (err) {
      console.warn('[STORAGE] Rehydration encountered a non-fatal error:', err);
    }
  }

  // --- Platform Usage Logs & Analytics ---
  public async recordPlatformOpen(
    platformId: string,
    userId: string,
    userEmail?: string,
    options?: { clickId?: string; openedAt?: string }
  ): Promise<{ log: PlatformUsageLog | null; deduplicated: boolean; error?: string }> {
    const platform = this.getPlatformById(platformId);
    if (!platform) {
      return { log: null, deduplicated: false, error: 'Platform not found' };
    }

    const canonicalPlatformId = platform.id;
    const nowMs = Date.now();

    // Clean up expired clickId deduplication entries
    for (const [k, v] of this.recent_platform_clicks.entries()) {
      if (v.expiresAtMs <= nowMs) {
        this.recent_platform_clicks.delete(k);
      }
    }

    const cleanClickId = typeof options?.clickId === 'string' ? options.clickId.trim() : '';
    if (cleanClickId) {
      const clickKey = `${userId}:${canonicalPlatformId}:${cleanClickId}`;
      const existingClick = this.recent_platform_clicks.get(clickKey);
      if (existingClick && existingClick.expiresAtMs > nowMs) {
        return { log: existingClick.log, deduplicated: true };
      }
    } else if (!options?.openedAt) {
      // Guard against accidental simultaneous duplicate request firing within 120ms from a single click
      const rapidKey = `${userId}:${canonicalPlatformId}`;
      const prevOpen = this.last_platform_open_ms.get(rapidKey);
      if (prevOpen && nowMs - prevOpen.atMs < 120) {
        return { log: prevOpen.log, deduplicated: true };
      }
    }

    let openedAtIso = new Date(nowMs).toISOString();
    if (options?.openedAt) {
      const parsedMs = new Date(options.openedAt).getTime();
      if (Number.isFinite(parsedMs)) {
        openedAtIso = new Date(parsedMs).toISOString();
      }
    }

    const logEntry: PlatformUsageLog = {
      id: crypto.randomUUID(),
      platform_id: canonicalPlatformId,
      user_id: userId,
      user_email: userEmail ? userEmail.trim().toLowerCase() : undefined,
      opened_at: openedAtIso,
    };

    if (!Array.isArray(this.db.platform_usage_logs)) {
      this.db.platform_usage_logs = [];
    }
    this.db.platform_usage_logs.unshift(logEntry);
    this.saveDatabase(this.db);

    if (cleanClickId) {
      this.recent_platform_clicks.set(`${userId}:${canonicalPlatformId}:${cleanClickId}`, {
        log: logEntry,
        expiresAtMs: nowMs + 60_000,
      });
    }
    this.last_platform_open_ms.set(`${userId}:${canonicalPlatformId}`, {
      log: logEntry,
      atMs: nowMs,
    });

    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('platform_usage_logs').insert({
          id: logEntry.id,
          platform_id: logEntry.platform_id,
          user_id: logEntry.user_id,
          user_email: logEntry.user_email || null,
          opened_at: logEntry.opened_at,
        });

        if (error) {
          // Fallback persistence into key_records with PLATLOG: prefix if platform_usage_logs table is not yet migrated
          await this.supabase.from('key_records').insert({
            id: logEntry.id,
            user_id: logEntry.user_id,
            user_email: logEntry.user_email || 'user@studyfox.app',
            token: `PLATLOG:${JSON.stringify({
              id: logEntry.id,
              p: logEntry.platform_id,
              u: logEntry.user_id,
              e: logEntry.user_email || '',
              t: logEntry.opened_at,
            })}`,
            shortener_url: 'platform_log',
            status: 'expired',
            generated_at: logEntry.opened_at,
            expires_at: logEntry.opened_at,
          });
        }
      } catch (err) {
        console.warn('[STORAGE] Non-blocking warning persisting platform usage log to Supabase:', err);
      }
    }

    // Automatically credit genuine student study streak in IST timezone on non-deduplicated platform launch
    this.recordStudyActivity(userId, 'platform_open');

    return { log: logEntry, deduplicated: false };
  }

  public async deletePlatformUsageLog(id: string): Promise<boolean> {
    if (!Array.isArray(this.db.platform_usage_logs)) return false;
    const before = this.db.platform_usage_logs.length;
    this.db.platform_usage_logs = this.db.platform_usage_logs.filter((l) => l.id !== id);
    const removed = this.db.platform_usage_logs.length !== before;
    if (removed) {
      this.saveDatabase(this.db);
    }
    if (this.supabase) {
      try {
        await this.supabase.from('platform_usage_logs').delete().eq('id', id);
      } catch {
        // Ignore if table not present
      }
      try {
        await this.supabase.from('key_records').delete().eq('id', id);
      } catch {
        // Ignore fallback delete error
      }
    }
    return removed;
  }

  public getPlatformUsageAnalytics(options?: {
    search?: string;
    sortBy?:
      | 'total_opens'
      | 'today_opens'
      | 'yesterday_opens'
      | 'last_7_days_opens'
      | 'last_30_days_opens'
      | 'filtered_opens'
      | 'last_opened_at'
      | 'platform_name';
    sortOrder?: 'asc' | 'desc';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    timezone?: string;
    now?: Date;
  }): PlatformLogsSummaryResponse {
    const tz = (options?.timezone || DEFAULT_APP_TIMEZONE).trim() || 'Asia/Kolkata';
    const refNow = options?.now instanceof Date ? options.now : new Date();
    const todayStr = formatDateInTimezone(refNow, tz);
    const yesterdayStr = shiftCalendarDate(todayStr, -1);
    const sevenDaysStartStr = shiftCalendarDate(todayStr, -6);
    const thirtyDaysStartStr = shiftCalendarDate(todayStr, -29);

    const startDateFilter = options?.startDate ? options.startDate.trim().slice(0, 10) : '';
    const endDateFilter = options?.endDate ? options.endDate.trim().slice(0, 10) : '';
    const hasDateFilter = Boolean(startDateFilter || endDateFilter);

    const allPlatforms = this.getPlatforms(false);
    const platformIdLookup = new Map<string, string>();
    for (const p of allPlatforms) {
      platformIdLookup.set(p.id, p.id);
      platformIdLookup.set(ensureUuid(p.id), p.id);
    }

    const statsMap = new Map<string, PlatformUsageStat>();
    for (const p of allPlatforms) {
      statsMap.set(p.id, {
        platform_id: p.id,
        platform_name: p.name,
        category: p.category || 'General',
        logo_url: p.logo_url || '',
        status: p.status || 'active',
        access_type: p.access_type || 'normal',
        today_opens: 0,
        yesterday_opens: 0,
        last_7_days_opens: 0,
        last_30_days_opens: 0,
        total_opens: 0,
        filtered_opens: 0,
        last_opened_at: null,
      });
    }

    let summaryOpensToday = 0;
    let summaryOpensLast7Days = 0;
    let summaryTotalRecordedOpens = 0;

    const logs = Array.isArray(this.db.platform_usage_logs) ? this.db.platform_usage_logs : [];
    for (const log of logs) {
      if (!log || !log.platform_id || !log.opened_at) continue;
      const canonicalId = platformIdLookup.get(log.platform_id) || platformIdLookup.get(ensureUuid(log.platform_id));
      if (!canonicalId) continue;
      const stat = statsMap.get(canonicalId);
      if (!stat) continue;

      const logDateStr = formatDateInTimezone(log.opened_at, tz);
      if (!logDateStr) continue;

      const matchesDateRange =
        (!startDateFilter || logDateStr >= startDateFilter) &&
        (!endDateFilter || logDateStr <= endDateFilter);

      stat.total_opens += 1;
      summaryTotalRecordedOpens += 1;

      if (matchesDateRange) {
        stat.filtered_opens += 1;
      }

      if (logDateStr === todayStr) {
        stat.today_opens += 1;
        summaryOpensToday += 1;
      }
      if (logDateStr === yesterdayStr) {
        stat.yesterday_opens += 1;
      }
      if (logDateStr >= sevenDaysStartStr && logDateStr <= todayStr) {
        stat.last_7_days_opens += 1;
        summaryOpensLast7Days += 1;
      }
      if (logDateStr >= thirtyDaysStartStr && logDateStr <= todayStr) {
        stat.last_30_days_opens += 1;
      }

      if (!stat.last_opened_at || new Date(log.opened_at).getTime() > new Date(stat.last_opened_at).getTime()) {
        stat.last_opened_at = log.opened_at;
      }
    }

    let platformStats = Array.from(statsMap.values());

    // Search filter by platform name or category
    const search = (options?.search || '').trim().toLowerCase();
    if (search) {
      platformStats = platformStats.filter(
        (item) =>
          item.platform_name.toLowerCase().includes(search) ||
          item.category.toLowerCase().includes(search) ||
          item.platform_id.toLowerCase().includes(search)
      );
    }

    // If a date range filter is active, sort default or filter if requested
    const sortBy = options?.sortBy || (hasDateFilter ? 'filtered_opens' : 'total_opens');
    const sortOrder = options?.sortOrder || (sortBy === 'platform_name' ? 'asc' : 'desc');
    const dir = sortOrder === 'asc' ? 1 : -1;

    platformStats.sort((a, b) => {
      if (sortBy === 'platform_name') {
        return a.platform_name.localeCompare(b.platform_name) * dir;
      }
      if (sortBy === 'last_opened_at') {
        const aTime = a.last_opened_at ? new Date(a.last_opened_at).getTime() : 0;
        const bTime = b.last_opened_at ? new Date(b.last_opened_at).getTime() : 0;
        if (aTime !== bTime) return (aTime - bTime) * dir;
        return b.total_opens - a.total_opens;
      }
      const aVal = a[sortBy] ?? a.total_opens;
      const bVal = b[sortBy] ?? b.total_opens;
      if (aVal !== bVal) {
        return (Number(aVal) - Number(bVal)) * dir;
      }
      return a.platform_name.localeCompare(b.platform_name);
    });

    const totalItems = platformStats.length;
    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(options?.limit) || 50));
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * limit;
    const paginatedPlatforms = platformStats.slice(startIdx, startIdx + limit);

    return {
      timezone: tz,
      summary: {
        total_platforms: allPlatforms.length,
        opens_today: summaryOpensToday,
        opens_last_7_days: summaryOpensLast7Days,
        total_recorded_opens: summaryTotalRecordedOpens,
      },
      platforms: paginatedPlatforms,
      pagination: {
        page: safePage,
        limit,
        total_items: totalItems,
        total_pages: totalPages,
      },
    };
  }

  public getPlatformUsageHistory(
    platformId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
      timezone?: string;
      now?: Date;
    }
  ): PlatformUsageHistoryResponse | null {
    const platform = this.getPlatformById(platformId);
    if (!platform) return null;

    const tz = (options?.timezone || DEFAULT_APP_TIMEZONE).trim() || 'Asia/Kolkata';
    const refNow = options?.now instanceof Date ? options.now : new Date();
    const todayStr = formatDateInTimezone(refNow, tz);
    const yesterdayStr = shiftCalendarDate(todayStr, -1);
    const sevenDaysStartStr = shiftCalendarDate(todayStr, -6);
    const thirtyDaysStartStr = shiftCalendarDate(todayStr, -29);

    const startDateFilter = options?.startDate ? options.startDate.trim().slice(0, 10) : '';
    const endDateFilter = options?.endDate ? options.endDate.trim().slice(0, 10) : '';

    const canonicalId = platform.id;
    const altUuid = ensureUuid(platform.id);

    const userEmailLookup = new Map<string, string>();
    for (const u of this.db.users) {
      userEmailLookup.set(u.id, u.email);
    }

    const stat: PlatformUsageStat = {
      platform_id: platform.id,
      platform_name: platform.name,
      category: platform.category || 'General',
      logo_url: platform.logo_url || '',
      status: platform.status || 'active',
      access_type: platform.access_type || 'normal',
      today_opens: 0,
      yesterday_opens: 0,
      last_7_days_opens: 0,
      last_30_days_opens: 0,
      total_opens: 0,
      filtered_opens: 0,
      last_opened_at: null,
    };

    const dailyCounts = new Map<string, number>();
    const matchingLogs: PlatformUsageLog[] = [];

    const allLogs = Array.isArray(this.db.platform_usage_logs) ? this.db.platform_usage_logs : [];
    for (const log of allLogs) {
      if (!log || !log.platform_id || !log.opened_at) continue;
      if (log.platform_id !== canonicalId && log.platform_id !== altUuid && ensureUuid(log.platform_id) !== altUuid) {
        continue;
      }

      const logDateStr = formatDateInTimezone(log.opened_at, tz);
      if (!logDateStr) continue;

      stat.total_opens += 1;
      if (logDateStr === todayStr) stat.today_opens += 1;
      if (logDateStr === yesterdayStr) stat.yesterday_opens += 1;
      if (logDateStr >= sevenDaysStartStr && logDateStr <= todayStr) stat.last_7_days_opens += 1;
      if (logDateStr >= thirtyDaysStartStr && logDateStr <= todayStr) stat.last_30_days_opens += 1;
      if (!stat.last_opened_at || new Date(log.opened_at).getTime() > new Date(stat.last_opened_at).getTime()) {
        stat.last_opened_at = log.opened_at;
      }

      const inRange =
        (!startDateFilter || logDateStr >= startDateFilter) &&
        (!endDateFilter || logDateStr <= endDateFilter);

      if (inRange) {
        stat.filtered_opens += 1;
        dailyCounts.set(logDateStr, (dailyCounts.get(logDateStr) || 0) + 1);
        matchingLogs.push({
          id: log.id,
          platform_id: platform.id,
          platform_name: platform.name,
          user_id: log.user_id,
          user_email: log.user_email || userEmailLookup.get(log.user_id) || undefined,
          opened_at: log.opened_at,
        });
      }
    }

    matchingLogs.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

    const dailyBreakdown = Array.from(dailyCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 30);

    const totalItems = matchingLogs.length;
    const page = Math.max(1, Number(options?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(options?.limit) || 20));
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(page, totalPages);
    const startIdx = (safePage - 1) * limit;
    const paginatedLogs = matchingLogs.slice(startIdx, startIdx + limit);

    return {
      timezone: tz,
      platform: {
        id: platform.id,
        name: platform.name,
        category: platform.category || 'General',
        logo_url: platform.logo_url || '',
        status: platform.status || 'active',
        access_type: platform.access_type || 'normal',
      },
      stats: stat,
      daily_breakdown: dailyBreakdown,
      logs: paginatedLogs,
      pagination: {
        page: safePage,
        limit,
        total_items: totalItems,
        total_pages: totalPages,
      },
    };
  }

  // --- Festival Decoration Manager (15 Indian Festivals, IST Scheduler, Atomic Mutex) ---
  private async withFestivalLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.festival_mutex;
    let release!: () => void;
    this.festival_mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private getNormalizedFestivalMap(): Record<FestivalId, FestivalDecorationConfig> {
    const normalized = normalizeAllFestivalConfigs(
      this.db.settings.festival_configs_json as Record<string, Partial<FestivalDecorationConfig>> | undefined
    );
    this.db.settings.festival_configs_json = normalized;
    return normalized;
  }

  private async persistFestivalStateToSupabase(
    configsMap: Record<FestivalId, FestivalDecorationConfig>
  ): Promise<void> {
    this.db.settings.festival_configs_json = configsMap;
    this.db.settings.updated_at = new Date().toISOString();
    this.saveDatabase(this.db);

    if (!this.supabase) return;

    // 1. Sync settings + compact festival state snapshot in key_records with FESTIVAL_STATE: prefix
    try {
      await this.syncSettingsToSupabase();
      const stateSnapshot = JSON.stringify({
        festival_decorations_enabled: this.db.settings.festival_decorations_enabled !== false,
        active_festival_id: this.db.settings.active_festival_id || null,
        festival_version: this.db.settings.festival_version || 1,
        festival_configs_json: configsMap,
      });
      await this.supabase.from('key_records').upsert({
        id: '00000000-0000-4000-8000-00000000fe57',
        user_id: '27f86505-bb19-465f-9597-aecf7ec7ee85',
        user_email: 'system@studyfox.app',
        token: `FESTIVAL_STATE:${stateSnapshot}`,
        shortener_url: 'festival_state',
        status: 'expired',
        generated_at: new Date().toISOString(),
        expires_at: new Date().toISOString(),
      });
    } catch {
      // Non-fatal
    }

    // 2. Also sync rows to festival_decorations table if migrated
    try {
      const rows = FESTIVAL_ORDER.map((id) => {
        const c = configsMap[id];
        return {
          id: c.id,
          name: c.name,
          icon: c.icon,
          is_enabled: Boolean(c.is_enabled),
          start_at: c.start_at || null,
          end_at: c.end_at || null,
          manual_off_override: Boolean(c.manual_off_override),
          banner_enabled: Boolean(c.banner_enabled),
          banner_text: c.banner_text,
          banner_subtitle: c.banner_subtitle || '',
          corners_enabled: Boolean(c.corners_enabled),
          floating_enabled: Boolean(c.floating_enabled),
          border_enabled: Boolean(c.border_enabled),
          glow_enabled: Boolean(c.glow_enabled),
          animation_enabled: Boolean(c.animation_enabled),
          animation_speed: c.animation_speed,
          decoration_size: c.decoration_size,
          opacity: c.opacity,
          target_screens: c.target_screens,
          custom_assets: c.custom_assets || {},
          updated_at: c.updated_at || new Date().toISOString(),
        };
      });
      await this.supabase
        .from('festival_decorations')
        .update({ is_enabled: false })
        .eq('is_enabled', true);
      await this.supabase.from('festival_decorations').upsert(rows);
    } catch {
      // Ignore if festival_decorations table is not yet migrated in Supabase
    }
  }

  /**
   * Evaluates IST schedules (`Asia/Kolkata`) and resolves the single active festival.
   */
  public evaluateFestivalSchedules(nowMs = Date.now()): {
    stateChanged: boolean;
    globalEnabled: boolean;
    activeFestival: FestivalDecorationConfig | null;
    activeSource: 'manual' | 'schedule' | null;
    festivals: FestivalDecorationConfig[];
    version: number;
  } {
    const globalEnabled = this.db.settings.festival_decorations_enabled !== false;
    const map = this.getNormalizedFestivalMap();
    let stateChanged = false;

    // Step 1: Check if any festival's scheduled end_at has passed
    for (const id of FESTIVAL_ORDER) {
      const f = map[id];
      const endMs = f.end_at ? new Date(f.end_at).getTime() : null;
      const startMs = f.start_at ? new Date(f.start_at).getTime() : null;

      if (endMs && Number.isFinite(endMs) && nowMs >= endMs) {
        if (f.is_enabled) {
          f.is_enabled = false;
          f.updated_at = new Date(nowMs).toISOString();
          stateChanged = true;
        }
        if (f.manual_off_override) {
          f.manual_off_override = false;
          stateChanged = true;
        }
      } else if (startMs && Number.isFinite(startMs) && nowMs < startMs && f.manual_off_override) {
        // Clear stale manual_off_override if we are before the scheduled start
        f.manual_off_override = false;
        stateChanged = true;
      }
    }

    // Step 2: Find currently enabled festival (if any)
    let currentlyEnabledId: FestivalId | null = null;
    for (const id of FESTIVAL_ORDER) {
      if (map[id].is_enabled) {
        if (!currentlyEnabledId) {
          currentlyEnabledId = id;
        } else {
          // Enforce single-active invariant
          map[id].is_enabled = false;
          stateChanged = true;
        }
      }
    }

    // Step 3: If no festival is currently enabled, check if any festival is within its scheduled [start_at, end_at) window
    // and does NOT have manual_off_override = true
    if (!currentlyEnabledId) {
      for (const id of FESTIVAL_ORDER) {
        const f = map[id];
        if (f.manual_off_override) continue;
        const startMs = f.start_at ? new Date(f.start_at).getTime() : null;
        const endMs = f.end_at ? new Date(f.end_at).getTime() : null;
        if (!startMs && !endMs) continue;

        const afterStart = !startMs || (Number.isFinite(startMs) && nowMs >= startMs);
        const beforeEnd = !endMs || (Number.isFinite(endMs) && nowMs < endMs);
        if (afterStart && beforeEnd) {
          f.is_enabled = true;
          f.updated_at = new Date(nowMs).toISOString();
          currentlyEnabledId = id;
          stateChanged = true;
          break;
        }
      }
    }

    if (this.db.settings.active_festival_id !== currentlyEnabledId) {
      this.db.settings.active_festival_id = currentlyEnabledId;
      stateChanged = true;
    }

    if (stateChanged) {
      this.db.settings.festival_version = (this.db.settings.festival_version || 1) + 1;
      void this.persistFestivalStateToSupabase(map);
    }

    const activeFestival = globalEnabled && currentlyEnabledId ? map[currentlyEnabledId] : null;
    let activeSource: 'manual' | 'schedule' | null = null;
    if (activeFestival) {
      const sMs = activeFestival.start_at ? new Date(activeFestival.start_at).getTime() : null;
      const eMs = activeFestival.end_at ? new Date(activeFestival.end_at).getTime() : null;
      const inScheduleWindow =
        Boolean(sMs || eMs) &&
        (!sMs || nowMs >= sMs) &&
        (!eMs || nowMs < eMs);
      activeSource = inScheduleWindow ? 'schedule' : 'manual';
    }

    return {
      stateChanged,
      globalEnabled,
      activeFestival,
      activeSource,
      festivals: FESTIVAL_ORDER.map((id) => map[id]),
      version: this.db.settings.festival_version || 1,
    };
  }

  public getPublicFestivalState(): ActiveFestivalResponse {
    const resolved = this.evaluateFestivalSchedules(Date.now());
    return {
      global_enabled: resolved.globalEnabled,
      active_festival_id: resolved.activeFestival ? resolved.activeFestival.id : null,
      active_source: resolved.activeSource,
      festival: resolved.activeFestival,
      version: resolved.version,
      server_time: new Date().toISOString(),
      timezone: DEFAULT_APP_TIMEZONE,
    };
  }

  public getAdminFestivalState(): AdminFestivalManagerResponse {
    const resolved = this.evaluateFestivalSchedules(Date.now());
    const map = this.getNormalizedFestivalMap();
    const rawActiveId = FESTIVAL_ORDER.find((id) => map[id].is_enabled) || null;
    return {
      global_enabled: resolved.globalEnabled,
      active_festival_id: rawActiveId,
      active_source: resolved.activeSource,
      active_festival: rawActiveId ? map[rawActiveId] : null,
      festivals: resolved.festivals,
      version: resolved.version,
      server_time: new Date().toISOString(),
      timezone: DEFAULT_APP_TIMEZONE,
    };
  }

  public async setFestivalGlobalEnabled(enabled: boolean): Promise<AdminFestivalManagerResponse> {
    return this.withFestivalLock(async () => {
      const map = this.getNormalizedFestivalMap();
      this.db.settings.festival_decorations_enabled = Boolean(enabled);
      this.db.settings.festival_version = (this.db.settings.festival_version || 1) + 1;
      await this.persistFestivalStateToSupabase(map);
      return this.getAdminFestivalState();
    });
  }

  public async toggleFestival(
    festivalId: string,
    enabled: boolean,
    forceReplace = false
  ): Promise<{
    success: boolean;
    requires_confirmation?: boolean;
    current_active?: FestivalDecorationConfig;
    target_festival?: FestivalDecorationConfig;
    replaced_festival_name?: string | null;
    state?: AdminFestivalManagerResponse;
    error?: string;
  }> {
    if (!isValidFestivalId(festivalId)) {
      return { success: false, error: 'Invalid festival identifier.' };
    }

    return this.withFestivalLock(async () => {
      this.evaluateFestivalSchedules(Date.now());
      const map = this.getNormalizedFestivalMap();
      const target = map[festivalId];
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      if (enabled) {
        // Check if another festival is already active
        const existingActiveId = FESTIVAL_ORDER.find((id) => id !== festivalId && map[id].is_enabled) || null;
        if (existingActiveId && !forceReplace) {
          return {
            success: false,
            requires_confirmation: true,
            current_active: map[existingActiveId],
            target_festival: target,
          };
        }

        let replacedName: string | null = null;
        for (const id of FESTIVAL_ORDER) {
          if (id === festivalId) {
            map[id].is_enabled = true;
            map[id].manual_off_override = false;
            map[id].updated_at = nowIso;
          } else {
            if (map[id].is_enabled) {
              replacedName = map[id].name;
              map[id].is_enabled = false;
              const sMs = map[id].start_at ? new Date(map[id].start_at!).getTime() : null;
              const eMs = map[id].end_at ? new Date(map[id].end_at!).getTime() : null;
              if ((sMs || eMs) && (!sMs || nowMs >= sMs) && (!eMs || nowMs < eMs)) {
                map[id].manual_off_override = true;
              }
              map[id].updated_at = nowIso;
            }
          }
        }

        this.db.settings.active_festival_id = festivalId;
        this.db.settings.festival_version = (this.db.settings.festival_version || 1) + 1;
        await this.persistFestivalStateToSupabase(map);

        return {
          success: true,
          replaced_festival_name: replacedName,
          state: this.getAdminFestivalState(),
        };
      } else {
        // Deactivating festivalId
        target.is_enabled = false;
        const sMs = target.start_at ? new Date(target.start_at).getTime() : null;
        const eMs = target.end_at ? new Date(target.end_at).getTime() : null;
        const inScheduledWindow =
          Boolean(sMs || eMs) &&
          (!sMs || nowMs >= sMs) &&
          (!eMs || nowMs < eMs);
        if (inScheduledWindow) {
          // Priority Rule: Manual OFF during an active schedule window prevents the schedule from re-activating it
          target.manual_off_override = true;
        }
        target.updated_at = nowIso;

        if (this.db.settings.active_festival_id === festivalId) {
          this.db.settings.active_festival_id = null;
        }
        this.db.settings.festival_version = (this.db.settings.festival_version || 1) + 1;
        await this.persistFestivalStateToSupabase(map);

        return {
          success: true,
          state: this.getAdminFestivalState(),
        };
      }
    });
  }

  public async updateFestivalConfig(
    festivalId: string,
    updates: Partial<FestivalDecorationConfig>
  ): Promise<{
    success: boolean;
    festival?: FestivalDecorationConfig;
    state?: AdminFestivalManagerResponse;
    error?: string;
  }> {
    if (!isValidFestivalId(festivalId)) {
      return { success: false, error: 'Invalid festival identifier.' };
    }

    return this.withFestivalLock(async () => {
      const map = this.getNormalizedFestivalMap();
      const existing = map[festivalId];

      const nextStartIso =
        updates.start_at !== undefined
          ? updates.start_at
            ? istDatetimeLocalToIso(updates.start_at)
            : null
          : existing.start_at;
      const nextEndIso =
        updates.end_at !== undefined
          ? updates.end_at
            ? istDatetimeLocalToIso(updates.end_at)
            : null
          : existing.end_at;

      if (updates.start_at && !nextStartIso) {
        return { success: false, error: 'Invalid Start Date & Time format.' };
      }
      if (updates.end_at && !nextEndIso) {
        return { success: false, error: 'Invalid End Date & Time format.' };
      }

      if (nextStartIso && nextEndIso) {
        const sMs = new Date(nextStartIso).getTime();
        const eMs = new Date(nextEndIso).getTime();
        if (eMs <= sMs) {
          return {
            success: false,
            error: 'End Date & Time must be later than Start Date & Time.',
          };
        }

        // Check for overlapping schedule windows with any of the other 14 festivals
        for (const otherId of FESTIVAL_ORDER) {
          if (otherId === festivalId) continue;
          const other = map[otherId];
          if (other.start_at && other.end_at) {
            const osMs = new Date(other.start_at).getTime();
            const oeMs = new Date(other.end_at).getTime();
            if (Number.isFinite(osMs) && Number.isFinite(oeMs) && sMs < oeMs && eMs > osMs) {
              return {
                success: false,
                error: `Schedule overlaps with "${other.name} ${other.icon}". Only one festival can be scheduled for the same time window.`,
              };
            }
          }
        }
      }

      const scheduleChanged = nextStartIso !== existing.start_at || nextEndIso !== existing.end_at;

      const merged = normalizeSingleFestivalConfig(festivalId, {
        ...existing,
        ...updates,
        id: festivalId,
        is_enabled: existing.is_enabled,
        start_at: nextStartIso,
        end_at: nextEndIso,
        manual_off_override: scheduleChanged ? false : existing.manual_off_override,
        updated_at: new Date().toISOString(),
      });

      map[festivalId] = merged;
      this.db.settings.festival_version = (this.db.settings.festival_version || 1) + 1;
      await this.persistFestivalStateToSupabase(map);

      return {
        success: true,
        festival: map[festivalId],
        state: this.getAdminFestivalState(),
      };
    });
  }

  public async resetFestivalConfig(
    festivalId: string
  ): Promise<{
    success: boolean;
    festival?: FestivalDecorationConfig;
    state?: AdminFestivalManagerResponse;
    error?: string;
  }> {
    if (!isValidFestivalId(festivalId)) {
      return { success: false, error: 'Invalid festival identifier.' };
    }

    return this.withFestivalLock(async () => {
      const map = this.getNormalizedFestivalMap();
      const wasEnabled = map[festivalId].is_enabled;
      const resetCfg = getDefaultFestivalConfig(festivalId);
      resetCfg.is_enabled = wasEnabled;
      resetCfg.updated_at = new Date().toISOString();

      map[festivalId] = resetCfg;
      this.db.settings.festival_version = (this.db.settings.festival_version || 1) + 1;
      await this.persistFestivalStateToSupabase(map);

      return {
        success: true,
        festival: map[festivalId],
        state: this.getAdminFestivalState(),
      };
    });
  }

  // --- Password Recovery Token Management (Single-Use, 30-Minute Expiry, SHA-256 Hashed) ---
  public async createPasswordResetToken(
    userId: string,
    email: string
  ): Promise<{ rawToken: string; expiresAt: string }> {
    if (!Array.isArray(this.db.password_reset_tokens)) {
      this.db.password_reset_tokens = [];
    }

    const nowMs = Date.now();
    // Invalidate any previous unused reset tokens for this user
    for (const existing of this.db.password_reset_tokens) {
      if (existing.user_id === userId && !existing.used) {
        existing.used = true;
        existing.used_at = new Date(nowMs).toISOString();
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const createdAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + 30 * 60 * 1000).toISOString(); // 30 minutes
    const recordId = crypto.randomUUID();

    const entry = {
      id: recordId,
      token_hash: tokenHash,
      user_id: userId,
      email: email.trim().toLowerCase(),
      created_at: createdAt,
      expires_at: expiresAt,
      used: false,
      used_at: null,
    };

    this.db.password_reset_tokens.unshift(entry);
    // Keep max 200 tokens
    if (this.db.password_reset_tokens.length > 200) {
      this.db.password_reset_tokens = this.db.password_reset_tokens.slice(0, 200);
    }
    this.saveDatabase(this.db);

    if (this.supabase) {
      try {
        await this.supabase.from('key_records').insert({
          id: recordId,
          user_id: userId,
          user_email: entry.email,
          token: `PW_RESET:${JSON.stringify(entry)}`,
          shortener_url: 'password_reset',
          status: 'active',
          generated_at: createdAt,
          expires_at: expiresAt,
        });
      } catch {
        // Non-fatal
      }
    }

    return { rawToken, expiresAt };
  }

  public async verifyAndConsumePasswordResetToken(
    rawToken: string
  ): Promise<{ valid: boolean; user?: User; error?: string; code?: string }> {
    const cleanToken = (rawToken || '').trim();
    if (!cleanToken || cleanToken.length < 32) {
      return { valid: false, error: 'Invalid or malformed password reset link.', code: 'INVALID_TOKEN' };
    }

    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
    if (!Array.isArray(this.db.password_reset_tokens)) {
      this.db.password_reset_tokens = [];
    }

    let entry = this.db.password_reset_tokens.find((t) => t.token_hash === tokenHash);

    // If not in local memory, check Supabase fallback
    if (!entry && this.supabase) {
      try {
        const { data: rows } = await this.supabase
          .from('key_records')
          .select('*')
          .like('token', `PW_RESET:%${tokenHash}%`)
          .limit(1);
        if (rows && rows.length > 0) {
          const raw = String(rows[0].token || '');
          const parsed = JSON.parse(raw.slice('PW_RESET:'.length));
          if (parsed && parsed.token_hash === tokenHash) {
            if (rows[0].status === 'revoked' || rows[0].status === 'expired') {
              parsed.used = true;
            }
            this.db.password_reset_tokens.push(parsed);
            entry = parsed;
          }
        }
      } catch {
        // Ignore
      }
    }

    if (!entry) {
      return { valid: false, error: 'This password reset link is invalid or does not exist.', code: 'INVALID_TOKEN' };
    }

    if (entry.used) {
      return {
        valid: false,
        error: 'This password reset link has already been used. Please request a new reset link if needed.',
        code: 'ALREADY_USED',
      };
    }

    const nowMs = Date.now();
    if (new Date(entry.expires_at).getTime() <= nowMs) {
      entry.used = true;
      this.saveDatabase(this.db);
      return {
        valid: false,
        error: 'This password reset link has expired. Please request a new password reset email.',
        code: 'EXPIRED_TOKEN',
      };
    }

    const user =
      (await this.syncUserFromSupabase({ id: entry.user_id, email: entry.email })) ||
      this.getUserById(entry.user_id) ||
      this.getUserByEmail(entry.email);

    if (!user) {
      return { valid: false, error: 'User account associated with this reset link was not found.', code: 'USER_NOT_FOUND' };
    }

    // Consume token immediately so it cannot be reused
    entry.used = true;
    entry.used_at = new Date(nowMs).toISOString();
    this.saveDatabase(this.db);

    if (this.supabase) {
      try {
        await this.supabase
          .from('key_records')
          .update({
            status: 'revoked',
            token: `PW_RESET:${JSON.stringify(entry)}`,
          })
          .eq('id', entry.id);
      } catch {
        // Ignore
      }
    }

    return { valid: true, user };
  }

  // --- User Feedback Management (VIP & Non-VIP Users) ---
  public getAllUserFeedback(): UserFeedbackRecord[] {
    if (!Array.isArray(this.db.user_feedback)) {
      this.db.user_feedback = [];
    }
    return [...this.db.user_feedback].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public getUserFeedbackByUser(userId: string, userEmail?: string): UserFeedbackRecord[] {
    const cleanEmail = (userEmail || '').trim().toLowerCase();
    return this.getAllUserFeedback()
      .filter(
        (fb) =>
          fb.user_id === userId ||
          (cleanEmail && fb.user_email.toLowerCase() === cleanEmail)
      )
      .map((fb) => ({
        ...fb,
        // Never expose internal admin notes to students
        admin_note: null,
      }));
  }

  public getUserFeedbackById(id: string): UserFeedbackRecord | undefined {
    if (!Array.isArray(this.db.user_feedback)) return undefined;
    return this.db.user_feedback.find((fb) => fb.id === id);
  }

  public async addUserFeedback(
    input: Omit<UserFeedbackRecord, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<UserFeedbackRecord> {
    if (!Array.isArray(this.db.user_feedback)) {
      this.db.user_feedback = [];
    }
    const nowIso = new Date().toISOString();
    const record: UserFeedbackRecord = {
      id: input.id || crypto.randomUUID(),
      user_id: input.user_id,
      user_email: input.user_email.trim().toLowerCase(),
      is_vip_at_submission: Boolean(input.is_vip_at_submission),
      category: input.category,
      rating: Math.min(5, Math.max(1, Math.round(Number(input.rating) || 5))),
      message: input.message.trim(),
      attachment_url: input.attachment_url || null,
      attachment_storage_path: input.attachment_storage_path || null,
      status: input.status || 'New',
      admin_note: input.admin_note || null,
      reviewed_by: input.reviewed_by || null,
      reviewed_at: input.reviewed_at || null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    this.db.user_feedback.unshift(record);
    this.saveDatabase(this.db);

    if (this.supabase) {
      try {
        const { error } = await this.supabase.from('user_feedback').upsert(record);
        if (error) {
          // Fallback persistence into key_records if user_feedback table is not yet migrated in remote Supabase
          await this.supabase.from('key_records').upsert({
            id: ensureUuid(record.id),
            user_id: record.user_id,
            user_email: record.user_email,
            token: `FEEDBACK_ITEM:${JSON.stringify(record)}`,
            shortener_url: 'user_feedback',
            status: 'expired',
            generated_at: record.created_at,
            expires_at: record.created_at,
          });
        }
      } catch (err) {
        console.warn('[STORAGE] Non-blocking warning persisting user_feedback to Supabase:', err);
      }
    }

    return record;
  }

  public async updateUserFeedback(
    id: string,
    updates: Partial<
      Pick<UserFeedbackRecord, 'status' | 'admin_note' | 'reviewed_by' | 'reviewed_at' | 'attachment_url'>
    >
  ): Promise<UserFeedbackRecord | undefined> {
    if (!Array.isArray(this.db.user_feedback)) return undefined;
    const idx = this.db.user_feedback.findIndex((fb) => fb.id === id);
    if (idx === -1) return undefined;

    const nowIso = new Date().toISOString();
    const updated: UserFeedbackRecord = {
      ...this.db.user_feedback[idx],
      ...(updates.status !== undefined && { status: updates.status }),
      ...(updates.admin_note !== undefined && { admin_note: updates.admin_note }),
      ...(updates.reviewed_by !== undefined && { reviewed_by: updates.reviewed_by }),
      ...(updates.reviewed_at !== undefined && { reviewed_at: updates.reviewed_at }),
      ...(updates.attachment_url !== undefined && { attachment_url: updates.attachment_url }),
      updated_at: nowIso,
    };

    this.db.user_feedback[idx] = updated;
    this.saveDatabase(this.db);

    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('user_feedback')
          .update({
            status: updated.status,
            admin_note: updated.admin_note,
            reviewed_by: updated.reviewed_by,
            reviewed_at: updated.reviewed_at,
            attachment_url: updated.attachment_url,
            updated_at: updated.updated_at,
          })
          .eq('id', id);

        if (error) {
          await this.supabase.from('key_records').upsert({
            id: ensureUuid(updated.id),
            user_id: updated.user_id,
            user_email: updated.user_email,
            token: `FEEDBACK_ITEM:${JSON.stringify(updated)}`,
            shortener_url: 'user_feedback',
            status: 'expired',
            generated_at: updated.created_at,
            expires_at: updated.created_at,
          });
        }
      } catch {
        // Ignore
      }
    }

    return updated;
  }

  public async deleteUserFeedback(id: string): Promise<boolean> {
    if (!Array.isArray(this.db.user_feedback)) return false;
    const before = this.db.user_feedback.length;
    this.db.user_feedback = this.db.user_feedback.filter((fb) => fb.id !== id);
    if (this.db.user_feedback.length === before) return false;

    this.saveDatabase(this.db);

    if (this.supabase) {
      try {
        await this.supabase.from('user_feedback').delete().eq('id', id);
      } catch {
        // Ignore
      }
      try {
        await this.supabase.from('key_records').delete().eq('id', ensureUuid(id));
      } catch {
        // Ignore
      }
    }

    return true;
  }

  // ===========================================================================
  // PART 2: ADMIN CONTROL & DYNAMIC SECTION / ACTION PERMISSIONS
  // ===========================================================================

  public getAdminPermissionsForUser(userId: string): Record<AdminSectionKey, AdminSectionPermission> {
    const user = this.getUserById(userId);
    if (!user) return getDefaultNormalAdminPermissions();
    if (user.role === 'super_admin' || user.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com') {
      return getFullSuperAdminPermissions();
    }
    if (!this.db.admin_permissions) {
      this.db.admin_permissions = {};
    }
    const defaults = getDefaultNormalAdminPermissions();
    const stored = this.db.admin_permissions[userId];
    if (!stored) {
      this.db.admin_permissions[userId] = defaults;
      this.saveDatabase(this.db);
      return defaults;
    }
    const merged = { ...defaults };
    for (const def of ADMIN_SECTIONS_REGISTRY) {
      if (def.superAdminOnly) {
        merged[def.key] = defaults[def.key];
      } else if (stored[def.key]) {
        merged[def.key] = {
          ...defaults[def.key],
          ...stored[def.key],
          actions: {
            ...defaults[def.key].actions,
            ...(stored[def.key].actions || {}),
          },
        };
      }
    }
    return merged;
  }

  public hasAdminPermission(
    userId: string,
    sectionKey: AdminSectionKey,
    actionKey: AdminActionKey = 'view'
  ): boolean {
    const user = this.getUserById(userId);
    if (!user || user.is_blocked) return false;
    if (user.role === 'super_admin' || user.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com') {
      return true;
    }
    if (user.role !== 'admin') return false;
    const def = ADMIN_SECTIONS_REGISTRY.find((s) => s.key === sectionKey);
    if (def?.superAdminOnly) return false;

    const perms = this.getAdminPermissionsForUser(userId);
    const sec = perms[sectionKey];
    if (!sec || !sec.enabled) return false;
    if (!sec.actions.view) return false;
    return Boolean(sec.actions[actionKey]);
  }

  public async updateAdminPermissionsForUser(
    targetUserId: string,
    updates: Partial<Record<AdminSectionKey, Partial<AdminSectionPermission>>>,
    actor: User,
    ipAddress?: string
  ): Promise<Record<AdminSectionKey, AdminSectionPermission>> {
    if (!this.db.admin_permissions) {
      this.db.admin_permissions = {};
    }
    const prevPerms = JSON.parse(JSON.stringify(this.getAdminPermissionsForUser(targetUserId)));
    const nextPerms = JSON.parse(JSON.stringify(prevPerms)) as Record<AdminSectionKey, AdminSectionPermission>;
    const nowIso = new Date().toISOString();

    for (const def of ADMIN_SECTIONS_REGISTRY) {
      if (def.superAdminOnly) continue;
      const incoming = updates[def.key];
      if (!incoming) continue;
      const enabled = incoming.enabled !== undefined ? Boolean(incoming.enabled) : nextPerms[def.key].enabled;
      const incomingActions = incoming.actions || ({} as Partial<AdminSectionPermission['actions']>);
      nextPerms[def.key] = {
        section_key: def.key,
        enabled,
        actions: {
          view: enabled ? Boolean(incomingActions.view ?? nextPerms[def.key].actions.view ?? true) : false,
          add: enabled && def.supportedActions.includes('add') ? Boolean(incomingActions.add ?? nextPerms[def.key].actions.add) : false,
          edit: enabled && def.supportedActions.includes('edit') ? Boolean(incomingActions.edit ?? nextPerms[def.key].actions.edit) : false,
          delete: enabled && def.supportedActions.includes('delete') ? Boolean(incomingActions.delete ?? nextPerms[def.key].actions.delete) : false,
          approve: enabled && def.supportedActions.includes('approve') ? Boolean(incomingActions.approve ?? nextPerms[def.key].actions.approve) : false,
          reject: enabled && def.supportedActions.includes('reject') ? Boolean(incomingActions.reject ?? nextPerms[def.key].actions.reject) : false,
        },
        updated_by: actor.email,
        updated_at: nowIso,
      };
    }

    this.db.admin_permissions[targetUserId] = nextPerms;
    this.saveDatabase(this.db);

    const targetUser = this.getUserById(targetUserId);
    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'permission_change',
      section: 'admin_control',
      target_id: targetUser?.email || targetUserId,
      description: `Updated Admin Panel section & action permissions for ${targetUser?.email || targetUserId}`,
      previous_value: prevPerms,
      new_value: nextPerms,
      ip_address: ipAddress,
    });

    return nextPerms;
  }

  public async resetNormalAdminDefaultPermissions(
    targetUserId: string,
    actor: User,
    ipAddress?: string
  ): Promise<Record<AdminSectionKey, AdminSectionPermission>> {
    if (!this.db.admin_permissions) {
      this.db.admin_permissions = {};
    }
    const prevPerms = this.getAdminPermissionsForUser(targetUserId);
    const defaults = getDefaultNormalAdminPermissions();
    this.db.admin_permissions[targetUserId] = defaults;
    this.saveDatabase(this.db);

    const targetUser = this.getUserById(targetUserId);
    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'permission_change',
      section: 'admin_control',
      target_id: targetUser?.email || targetUserId,
      description: `Reset permissions to Normal Admin default (5 sections) for ${targetUser?.email || targetUserId}`,
      previous_value: prevPerms,
      new_value: defaults,
      ip_address: ipAddress,
    });

    return defaults;
  }

  // ===========================================================================
  // PART 2: VIP FEATURE MANAGEMENT (GLOBAL MASTER SWITCH + 14 FEATURE SWITCHES)
  // ===========================================================================

  public getVipFeatureManagementState(): VipFeatureManagementState {
    if (!this.db.vip_feature_state) {
      this.db.vip_feature_state = getDefaultVipFeatureManagementState();
      this.saveDatabase(this.db);
    }
    const defaults = getDefaultVipFeatureManagementState();
    return {
      global_master_enabled: Boolean(this.db.vip_feature_state.global_master_enabled),
      global_updated_by: this.db.vip_feature_state.global_updated_by || 'system_default',
      global_updated_at: this.db.vip_feature_state.global_updated_at || defaults.global_updated_at,
      features: {
        ...defaults.features,
        ...(this.db.vip_feature_state.features || {}),
      },
    };
  }

  public isVipFeatureEffectivelyAvailable(featureKey: VipFeatureKey): boolean {
    const state = this.getVipFeatureManagementState();
    if (!state.global_master_enabled) return false;
    return Boolean(state.features[featureKey]?.is_enabled);
  }

  public recordVipFeatureUsage(featureKey: VipFeatureKey): void {
    if (!this.db.vip_feature_usage_counts) {
      this.db.vip_feature_usage_counts = {};
    }
    this.db.vip_feature_usage_counts[featureKey] = (this.db.vip_feature_usage_counts[featureKey] || 0) + 1;
    this.saveDatabase(this.db);
  }

  public async setVipGlobalMasterSwitch(
    enabled: boolean,
    actor: User,
    ipAddress?: string
  ): Promise<VipFeatureManagementState> {
    const state = this.getVipFeatureManagementState();
    const prevEnabled = state.global_master_enabled;
    const nowIso = new Date().toISOString();

    state.global_master_enabled = Boolean(enabled);
    state.global_updated_by = actor.email;
    state.global_updated_at = nowIso;
    this.db.vip_feature_state = state;
    this.saveDatabase(this.db);

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'global_vip_master_switch',
      section: 'vip_features',
      target_id: 'global_vip_master_switch',
      description: `Global VIP Master Switch turned ${enabled ? 'ON' : 'OFF'} (all 14 individual switch states preserved)`,
      previous_value: { global_master_enabled: prevEnabled },
      new_value: { global_master_enabled: Boolean(enabled) },
      ip_address: ipAddress,
    });

    return state;
  }

  public async setIndividualVipFeatureSwitch(
    featureKey: VipFeatureKey,
    enabled: boolean,
    actor: User,
    ipAddress?: string
  ): Promise<VipFeatureManagementState> {
    const state = this.getVipFeatureManagementState();
    const target = state.features[featureKey];
    if (!target) {
      throw new Error(`Unknown VIP feature key: ${featureKey}`);
    }
    const prevEnabled = target.is_enabled;
    const nowIso = new Date().toISOString();

    state.features[featureKey] = {
      ...target,
      is_enabled: Boolean(enabled),
      updated_by: actor.email,
      updated_at: nowIso,
    };
    this.db.vip_feature_state = state;
    this.saveDatabase(this.db);

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'individual_vip_feature_switch',
      section: 'vip_features',
      target_id: featureKey,
      description: `VIP Feature "${target.name}" turned ${enabled ? 'ON' : 'OFF'} (display order #${target.display_order} preserved)`,
      previous_value: { feature_key: featureKey, is_enabled: prevEnabled, display_order: target.display_order },
      new_value: { feature_key: featureKey, is_enabled: Boolean(enabled), display_order: target.display_order },
      ip_address: ipAddress,
    });

    return state;
  }

  public async reorderVipFeatures(
    orderedKeys: VipFeatureKey[],
    actor: User,
    ipAddress?: string
  ): Promise<VipFeatureManagementState> {
    const state = this.getVipFeatureManagementState();
    const nowIso = new Date().toISOString();
    const prevOrder = Object.values(state.features)
      .sort((a, b) => a.display_order - b.display_order)
      .map((f) => ({ feature_key: f.feature_key, display_order: f.display_order, is_enabled: f.is_enabled }));

    const validSet = new Set(VIP_FEATURES_DEFINITIONS.map((d) => d.feature_key));
    const seen = new Set<VipFeatureKey>();
    const finalSequence: VipFeatureKey[] = [];

    for (const k of orderedKeys || []) {
      if (validSet.has(k) && !seen.has(k)) {
        seen.add(k);
        finalSequence.push(k);
      }
    }

    // Append any remaining features in their existing relative order
    const remaining = Object.values(state.features)
      .filter((f) => !seen.has(f.feature_key))
      .sort((a, b) => a.display_order - b.display_order);
    for (const rem of remaining) {
      finalSequence.push(rem.feature_key);
    }

    finalSequence.forEach((key, index) => {
      const existing = state.features[key];
      if (existing) {
        state.features[key] = {
          ...existing,
          display_order: index + 1,
          updated_by: actor.email,
          updated_at: nowIso,
        };
      }
    });

    this.db.vip_feature_state = state;
    this.saveDatabase(this.db);

    const newOrder = Object.values(state.features)
      .sort((a, b) => a.display_order - b.display_order)
      .map((f) => ({ feature_key: f.feature_key, display_order: f.display_order, is_enabled: f.is_enabled }));

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'vip_feature_order_change',
      section: 'vip_features',
      target_id: 'vip_dashboard_feature_order',
      description: `Updated VIP Dashboard feature display order (all 14 ON/OFF availability states preserved)`,
      previous_value: prevOrder,
      new_value: newOrder,
      ip_address: ipAddress,
    });

    return state;
  }

  public async resetVipFeaturesOrder(
    actor: User,
    ipAddress?: string
  ): Promise<VipFeatureManagementState> {
    const state = this.getVipFeatureManagementState();
    const nowIso = new Date().toISOString();
    const prevOrder = Object.values(state.features)
      .sort((a, b) => a.display_order - b.display_order)
      .map((f) => ({ feature_key: f.feature_key, display_order: f.display_order, is_enabled: f.is_enabled }));

    for (const def of VIP_FEATURES_DEFINITIONS) {
      const existing = state.features[def.feature_key];
      state.features[def.feature_key] = {
        ...(existing || def),
        is_enabled: existing ? Boolean(existing.is_enabled) : true,
        display_order: def.display_order,
        updated_by: actor.email,
        updated_at: nowIso,
      };
    }

    this.db.vip_feature_state = state;
    this.saveDatabase(this.db);

    const newOrder = Object.values(state.features)
      .sort((a, b) => a.display_order - b.display_order)
      .map((f) => ({ feature_key: f.feature_key, display_order: f.display_order, is_enabled: f.is_enabled }));

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'vip_feature_order_change',
      section: 'vip_features',
      target_id: 'vip_dashboard_feature_order_reset',
      description: `Reset VIP Dashboard feature display order to default (1–14) while preserving ON/OFF availability`,
      previous_value: prevOrder,
      new_value: newOrder,
      ip_address: ipAddress,
    });

    return state;
  }

  // ===========================================================================
  // PART 3: 14 PREMIUM VIP STUDENT FEATURES & SMART NOTIFICATIONS
  // ===========================================================================

  // 2. Daily Study Streak (IST Timezone, Genuine Activity Only)
  public getStudentStreak(userId: string): StudyStreakRecord {
    if (!this.db.study_streaks) {
      this.db.study_streaks = {};
    }
    const todayIst = formatDateInTimezone(new Date(), DEFAULT_APP_TIMEZONE);
    const yesterdayIst = shiftCalendarDate(todayIst, -1);

    let record = this.db.study_streaks[userId];
    if (!record) {
      // Seed from existing historical platform_usage_logs for this user so genuine past activity is honored
      const userLogs = (this.db.platform_usage_logs || []).filter((l) => l.user_id === userId);
      const uniqueDatesSet = new Set<string>();
      for (const l of userLogs) {
        const dStr = formatDateInTimezone(l.opened_at, DEFAULT_APP_TIMEZONE);
        if (dStr) uniqueDatesSet.add(dStr);
      }
      const sortedDates = Array.from(uniqueDatesSet).sort();
      let currentStreak = 0;
      let longestStreak = 0;
      let running = 0;
      for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0) {
          running = 1;
        } else {
          const expectedNext = shiftCalendarDate(sortedDates[i - 1], 1);
          if (sortedDates[i] === expectedNext) {
            running += 1;
          } else {
            running = 1;
          }
        }
        if (running > longestStreak) longestStreak = running;
      }
      const lastDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
      if (lastDate === todayIst || lastDate === yesterdayIst) {
        currentStreak = running;
      } else {
        currentStreak = 0;
      }
      const milestones: string[] = [];
      if (longestStreak >= 1 || userLogs.length > 0) milestones.push('first_study');
      if (longestStreak >= 7) milestones.push('streak_7');
      if (longestStreak >= 30) milestones.push('streak_30');

      record = {
        user_id: userId,
        current_streak: currentStreak,
        longest_streak: longestStreak,
        last_study_date_ist: lastDate,
        active_dates_ist: sortedDates.slice(-90),
        total_study_actions: userLogs.length,
        milestones_unlocked: milestones,
        updated_at: new Date().toISOString(),
      };
      this.db.study_streaks[userId] = record;
      this.saveDatabase(this.db);
      return record;
    }

    // Re-evaluate if streak broke (last study date was earlier than yesterday in IST)
    if (
      record.last_study_date_ist &&
      record.last_study_date_ist !== todayIst &&
      record.last_study_date_ist !== yesterdayIst &&
      record.current_streak > 0
    ) {
      record.current_streak = 0;
      record.updated_at = new Date().toISOString();
      this.saveDatabase(this.db);
    }

    return record;
  }

  public recordStudyActivity(
    userId: string,
    activityType: 'platform_open' | 'resource_completed' | 'mock_test_completed' | 'timetable_task_completed'
  ): { streak: StudyStreakRecord; incremented_today: boolean; new_milestone?: string } {
    const streak = this.getStudentStreak(userId);
    const todayIst = formatDateInTimezone(new Date(), DEFAULT_APP_TIMEZONE);
    const yesterdayIst = shiftCalendarDate(todayIst, -1);

    streak.total_study_actions = (streak.total_study_actions || 0) + 1;
    let incrementedToday = false;
    let newMilestone: string | undefined;

    if (!streak.milestones_unlocked.includes('first_study')) {
      streak.milestones_unlocked.push('first_study');
      newMilestone = 'First Study Activity';
    }

    if (streak.last_study_date_ist !== todayIst) {
      if (streak.last_study_date_ist === yesterdayIst) {
        streak.current_streak += 1;
      } else {
        streak.current_streak = 1;
      }
      if (streak.current_streak > streak.longest_streak) {
        streak.longest_streak = streak.current_streak;
      }
      streak.last_study_date_ist = todayIst;
      if (!streak.active_dates_ist.includes(todayIst)) {
        streak.active_dates_ist.push(todayIst);
        streak.active_dates_ist.sort();
        if (streak.active_dates_ist.length > 120) {
          streak.active_dates_ist = streak.active_dates_ist.slice(-120);
        }
      }
      incrementedToday = true;

      if (streak.current_streak >= 7 && !streak.milestones_unlocked.includes('streak_7')) {
        streak.milestones_unlocked.push('streak_7');
        newMilestone = '7-Day Study Streak';
        this.addStudentNotification({
          user_id: userId,
          type: 'streak_milestone',
          title: '🔥 7-Day Study Streak Unlocked!',
          message: `Awesome consistency! You have studied for 7 consecutive days via ${activityType.replace(/_/g, ' ')}.`,
          action_tab: 'vip',
        });
      }
      if (streak.current_streak >= 30 && !streak.milestones_unlocked.includes('streak_30')) {
        streak.milestones_unlocked.push('streak_30');
        newMilestone = '30-Day Study Streak';
        this.addStudentNotification({
          user_id: userId,
          type: 'streak_milestone',
          title: '🏆 30-Day Master Streak Unlocked!',
          message: 'Incredible dedication! You have completed a full 30-day consecutive study streak on Study Fox.',
          action_tab: 'vip',
        });
      }
    }

    streak.updated_at = new Date().toISOString();
    if (!this.db.study_streaks) this.db.study_streaks = {};
    this.db.study_streaks[userId] = streak;
    this.saveDatabase(this.db);

    return { streak, incremented_today: incrementedToday, new_milestone: newMilestone };
  }

  // 3 & 10. Exam Data Counter & Exam Reminders (Admin Global + Student Personal)
  public getExamsForStudent(userId: string): ExamScheduleRecord[] {
    if (!Array.isArray(this.db.exam_schedules)) {
      this.db.exam_schedules = getInitialGlobalExams();
    }
    return this.db.exam_schedules
      .filter((e) => (e.scope === 'global' && e.is_published) || (e.scope === 'personal' && e.user_id === userId))
      .sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime());
  }

  public getAllAdminGlobalExams(): ExamScheduleRecord[] {
    if (!Array.isArray(this.db.exam_schedules)) {
      this.db.exam_schedules = getInitialGlobalExams();
    }
    return this.db.exam_schedules
      .filter((e) => e.scope === 'global')
      .sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime());
  }

  public addExamSchedule(
    input: Omit<ExamScheduleRecord, 'id' | 'created_at' | 'updated_at'>
  ): ExamScheduleRecord {
    if (!Array.isArray(this.db.exam_schedules)) {
      this.db.exam_schedules = getInitialGlobalExams();
    }
    const nowIso = new Date().toISOString();
    const record: ExamScheduleRecord = {
      ...input,
      id: `exam_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.db.exam_schedules.push(record);
    this.saveDatabase(this.db);
    return record;
  }

  public updateExamSchedule(
    id: string,
    updates: Partial<ExamScheduleRecord>,
    actorUserId: string,
    isAdmin = false
  ): ExamScheduleRecord | undefined {
    if (!Array.isArray(this.db.exam_schedules)) return undefined;
    const idx = this.db.exam_schedules.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    const existing = this.db.exam_schedules[idx];
    if (existing.scope === 'global' && !isAdmin) return undefined;
    if (existing.scope === 'personal' && existing.user_id !== actorUserId && !isAdmin) return undefined;

    const updated: ExamScheduleRecord = {
      ...existing,
      ...updates,
      id: existing.id,
      scope: existing.scope,
      user_id: existing.user_id,
      updated_at: new Date().toISOString(),
    };
    this.db.exam_schedules[idx] = updated;
    this.saveDatabase(this.db);
    return updated;
  }

  public deleteExamSchedule(id: string, actorUserId: string, isAdmin = false): boolean {
    if (!Array.isArray(this.db.exam_schedules)) return false;
    const existing = this.db.exam_schedules.find((e) => e.id === id);
    if (!existing) return false;
    if (existing.scope === 'global' && !isAdmin) return false;
    if (existing.scope === 'personal' && existing.user_id !== actorUserId && !isAdmin) return false;

    this.db.exam_schedules = this.db.exam_schedules.filter((e) => e.id !== id);
    this.saveDatabase(this.db);
    return true;
  }

  // 5. Achievements & Rewards
  public getStudentAchievements(userId: string): StudentAchievementBadge[] {
    const streak = this.getStudentStreak(userId);
    const interactions = (this.db.student_resource_interactions || []).filter((r) => r.user_id === userId);
    const completedResources = interactions.filter((r) => r.is_completed).length;
    const personalExams = (this.db.exam_schedules || []).filter((e) => e.scope === 'personal' && e.user_id === userId).length;
    const timetableTasks = (this.db.study_timetables || []).filter((t) => t.user_id === userId);
    const completedTasks = timetableTasks.filter((t) => t.is_completed).length;
    const mockAttempts = (this.db.vip_mock_test_attempts || []).filter((a) => a.user_id === userId).length;
    const user = this.getUserById(userId);
    const nowIso = streak.updated_at;

    return [
      {
        id: 'first_study',
        title: 'First Study Activity',
        description: 'Complete your first verified platform launch, resource study, or practice test.',
        icon: 'Sparkles',
        unlocked: streak.total_study_actions >= 1,
        unlocked_at: streak.total_study_actions >= 1 ? nowIso : null,
        progress_text: `${Math.min(1, streak.total_study_actions)} / 1 Activity`,
      },
      {
        id: 'streak_7',
        title: '7-Day Study Streak',
        description: 'Maintain a verified daily study streak for 7 consecutive days (IST).',
        icon: 'Flame',
        unlocked: streak.longest_streak >= 7 || streak.milestones_unlocked.includes('streak_7'),
        unlocked_at: streak.longest_streak >= 7 ? nowIso : null,
        progress_text: `${Math.min(7, streak.longest_streak)} / 7 Days`,
      },
      {
        id: 'streak_30',
        title: '30-Day Study Streak',
        description: 'Achieve 30 consecutive days of verified study consistency.',
        icon: 'Trophy',
        unlocked: streak.longest_streak >= 30 || streak.milestones_unlocked.includes('streak_30'),
        unlocked_at: streak.longest_streak >= 30 ? nowIso : null,
        progress_text: `${Math.min(30, streak.longest_streak)} / 30 Days`,
      },
      {
        id: 'resource_explorer',
        title: 'Resource Explorer',
        description: 'Complete at least 3 study materials from the VIP Learning Library or Exclusive Resources.',
        icon: 'BookOpen',
        unlocked: completedResources >= 3,
        unlocked_at: completedResources >= 3 ? nowIso : null,
        progress_text: `${Math.min(3, completedResources)} / 3 Resources`,
      },
      {
        id: 'exam_planner',
        title: 'Exam Planner',
        description: 'Add a personal exam countdown or complete 3 study timetable sessions.',
        icon: 'CalendarCheck',
        unlocked: personalExams >= 1 || completedTasks >= 3,
        unlocked_at: personalExams >= 1 || completedTasks >= 3 ? nowIso : null,
        progress_text: personalExams >= 1 ? 'Exam Added' : `${Math.min(3, completedTasks)} / 3 Tasks`,
      },
      {
        id: 'consistent_learner',
        title: 'Consistent Learner',
        description: 'Complete at least 1 VIP Mock Test and 5 total verified study actions.',
        icon: 'Target',
        unlocked: mockAttempts >= 1 && streak.total_study_actions >= 5,
        unlocked_at: mockAttempts >= 1 && streak.total_study_actions >= 5 ? nowIso : null,
        progress_text: `${Math.min(1, mockAttempts)}/1 Test • ${Math.min(5, streak.total_study_actions)}/5 Actions`,
      },
      {
        id: 'vip_scholar',
        title: 'VIP Scholar',
        description: 'Active verified Study Fox VIP member with unlocked premium learning privileges.',
        icon: 'Crown',
        unlocked: Boolean(user?.vip_active),
        unlocked_at: user?.created_at || nowIso,
        progress_text: user?.vip_active ? 'Active VIP Member' : 'VIP Required',
      },
    ];
  }

  // 6 & 14. Learning Library & Exclusive Resources + Bookmarks / Completion
  public getLearningResources(group?: 'learning_library' | 'exclusive_resources', includeUnpublished = false): LearningResourceRecord[] {
    if (!Array.isArray(this.db.learning_resources) || this.db.learning_resources.length === 0) {
      this.db.learning_resources = getInitialLearningResources();
      this.saveDatabase(this.db);
    }
    return this.db.learning_resources.filter((r) => {
      if (!includeUnpublished && !r.is_published) return false;
      if (group && r.resource_group !== group) return false;
      return true;
    });
  }

  public getStudentResourceInteractions(userId: string): StudentResourceInteraction[] {
    if (!Array.isArray(this.db.student_resource_interactions)) {
      this.db.student_resource_interactions = [];
    }
    return this.db.student_resource_interactions.filter((i) => i.user_id === userId);
  }

  public toggleStudentResourceInteraction(
    userId: string,
    resourceId: string,
    updates: { is_bookmarked?: boolean; is_completed?: boolean }
  ): StudentResourceInteraction {
    if (!Array.isArray(this.db.student_resource_interactions)) {
      this.db.student_resource_interactions = [];
    }
    const nowIso = new Date().toISOString();
    const idx = this.db.student_resource_interactions.findIndex(
      (i) => i.user_id === userId && i.resource_id === resourceId
    );
    let record: StudentResourceInteraction;
    let newlyCompleted = false;

    if (idx === -1) {
      newlyCompleted = Boolean(updates.is_completed);
      record = {
        id: `sri_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        user_id: userId,
        resource_id: resourceId,
        is_bookmarked: Boolean(updates.is_bookmarked),
        is_completed: Boolean(updates.is_completed),
        last_accessed_at: nowIso,
        completed_at: updates.is_completed ? nowIso : null,
      };
      this.db.student_resource_interactions.push(record);
    } else {
      const prev = this.db.student_resource_interactions[idx];
      newlyCompleted = Boolean(updates.is_completed && !prev.is_completed);
      record = {
        ...prev,
        ...(updates.is_bookmarked !== undefined && { is_bookmarked: Boolean(updates.is_bookmarked) }),
        ...(updates.is_completed !== undefined && {
          is_completed: Boolean(updates.is_completed),
          completed_at: updates.is_completed ? nowIso : null,
        }),
        last_accessed_at: nowIso,
      };
      this.db.student_resource_interactions[idx] = record;
    }

    this.saveDatabase(this.db);
    if (newlyCompleted) {
      this.recordStudyActivity(userId, 'resource_completed');
    }
    return record;
  }

  public addLearningResource(
    input: Omit<LearningResourceRecord, 'id' | 'created_at' | 'updated_at'>,
    actor: User
  ): LearningResourceRecord {
    if (!Array.isArray(this.db.learning_resources)) {
      this.db.learning_resources = getInitialLearningResources();
    }
    const nowIso = new Date().toISOString();
    const record: LearningResourceRecord = {
      ...input,
      id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.db.learning_resources.unshift(record);
    this.saveDatabase(this.db);

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'library_resource_change',
      section: 'vip_features',
      target_id: record.id,
      description: `Added ${record.resource_group} resource: "${record.title}"`,
      new_value: record,
    });
    return record;
  }

  public deleteLearningResource(id: string, actor: User): boolean {
    if (!Array.isArray(this.db.learning_resources)) return false;
    const existing = this.db.learning_resources.find((r) => r.id === id);
    if (!existing) return false;
    this.db.learning_resources = this.db.learning_resources.filter((r) => r.id !== id);
    this.saveDatabase(this.db);

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'library_resource_change',
      section: 'vip_features',
      target_id: id,
      description: `Deleted ${existing.resource_group} resource: "${existing.title}"`,
      previous_value: existing,
    });
    return true;
  }

  // 8. VIP Announcements
  public getVipAnnouncements(onlyPublished = true): VipAnnouncementRecord[] {
    if (!Array.isArray(this.db.vip_announcements)) {
      this.db.vip_announcements = [];
    }
    const list = onlyPublished
      ? this.db.vip_announcements.filter((a) => a.is_published)
      : this.db.vip_announcements;
    return [...list].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  public addVipAnnouncement(
    input: Omit<VipAnnouncementRecord, 'id' | 'created_at' | 'updated_at'>,
    actor: User
  ): VipAnnouncementRecord {
    if (!Array.isArray(this.db.vip_announcements)) {
      this.db.vip_announcements = [];
    }
    const nowIso = new Date().toISOString();
    const record: VipAnnouncementRecord = {
      ...input,
      id: `vann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.db.vip_announcements.unshift(record);
    this.saveDatabase(this.db);

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'announcement_change',
      section: 'vip_features',
      target_id: record.id,
      description: `Published VIP Announcement: "${record.title}" (${record.category})`,
      new_value: record,
    });

    return record;
  }

  public deleteVipAnnouncement(id: string, actor: User): boolean {
    if (!Array.isArray(this.db.vip_announcements)) return false;
    const existing = this.db.vip_announcements.find((a) => a.id === id);
    if (!existing) return false;
    this.db.vip_announcements = this.db.vip_announcements.filter((a) => a.id !== id);
    this.saveDatabase(this.db);

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'announcement_change',
      section: 'vip_features',
      target_id: id,
      description: `Deleted VIP Announcement: "${existing.title}"`,
      previous_value: existing,
    });
    return true;
  }

  // 9. Personal Study Timetable
  public getStudentTimetable(userId: string): StudyTimetableItem[] {
    if (!Array.isArray(this.db.study_timetables)) {
      this.db.study_timetables = [];
    }
    return this.db.study_timetables
      .filter((t) => t.user_id === userId)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }

  public addTimetableItem(
    userId: string,
    input: Omit<StudyTimetableItem, 'id' | 'user_id' | 'is_completed' | 'completed_at' | 'created_at' | 'updated_at'>
  ): StudyTimetableItem {
    if (!Array.isArray(this.db.study_timetables)) {
      this.db.study_timetables = [];
    }
    const nowIso = new Date().toISOString();
    const item: StudyTimetableItem = {
      ...input,
      id: `tt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      user_id: userId,
      is_completed: false,
      completed_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.db.study_timetables.push(item);
    this.saveDatabase(this.db);
    return item;
  }

  public updateTimetableItem(
    userId: string,
    id: string,
    updates: Partial<StudyTimetableItem>
  ): StudyTimetableItem | undefined {
    if (!Array.isArray(this.db.study_timetables)) return undefined;
    const idx = this.db.study_timetables.findIndex((t) => t.id === id && t.user_id === userId);
    if (idx === -1) return undefined;
    const prev = this.db.study_timetables[idx];
    const nowIso = new Date().toISOString();
    const newlyCompleted = Boolean(updates.is_completed && !prev.is_completed);

    const updated: StudyTimetableItem = {
      ...prev,
      ...updates,
      id: prev.id,
      user_id: prev.user_id,
      completed_at: updates.is_completed ? (prev.completed_at || nowIso) : (updates.is_completed === false ? null : prev.completed_at),
      updated_at: nowIso,
    };
    this.db.study_timetables[idx] = updated;
    this.saveDatabase(this.db);

    if (newlyCompleted) {
      this.recordStudyActivity(userId, 'timetable_task_completed');
    }
    return updated;
  }

  public deleteTimetableItem(userId: string, id: string): boolean {
    if (!Array.isArray(this.db.study_timetables)) return false;
    const before = this.db.study_timetables.length;
    this.db.study_timetables = this.db.study_timetables.filter((t) => !(t.id === id && t.user_id === userId));
    if (this.db.study_timetables.length !== before) {
      this.saveDatabase(this.db);
      return true;
    }
    return false;
  }

  // 11. VIP Mock Tests & Attempts
  public getVipMockTests(onlyPublished = true): VipMockTestRecord[] {
    if (!Array.isArray(this.db.vip_mock_tests) || this.db.vip_mock_tests.length === 0) {
      this.db.vip_mock_tests = getInitialVipMockTests();
      this.saveDatabase(this.db);
    }
    return onlyPublished
      ? this.db.vip_mock_tests.filter((t) => t.is_published)
      : this.db.vip_mock_tests;
  }

  public getStudentMockTestAttempts(userId: string): VipMockTestAttempt[] {
    if (!Array.isArray(this.db.vip_mock_test_attempts)) {
      this.db.vip_mock_test_attempts = [];
    }
    return this.db.vip_mock_test_attempts
      .filter((a) => a.user_id === userId)
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
  }

  public submitMockTestAttempt(
    user: User,
    testId: string,
    selectedAnswers: number[],
    timeTakenSeconds: number
  ): { attempt: VipMockTestAttempt; test: VipMockTestRecord } {
    const tests = this.getVipMockTests(false);
    const test = tests.find((t) => t.id === testId);
    if (!test) {
      throw new Error('Mock test not found.');
    }
    let score = 0;
    const safeAnswers = test.questions.map((q, idx) => {
      const ans = typeof selectedAnswers[idx] === 'number' ? selectedAnswers[idx] : -1;
      if (ans === q.correct_index) score += 1;
      return ans;
    });
    const total = Math.max(1, test.questions.length);
    const percentage = Math.round((score / total) * 100);

    if (!Array.isArray(this.db.vip_mock_test_attempts)) {
      this.db.vip_mock_test_attempts = [];
    }
    const attempt: VipMockTestAttempt = {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      test_id: test.id,
      test_title: test.title,
      user_id: user.id,
      user_email: user.email,
      score,
      total_questions: test.questions.length,
      percentage,
      selected_answers: safeAnswers,
      time_taken_seconds: Math.max(1, Math.round(Number(timeTakenSeconds) || 0)),
      completed_at: new Date().toISOString(),
    };
    this.db.vip_mock_test_attempts.unshift(attempt);
    this.saveDatabase(this.db);

    this.recordStudyActivity(user.id, 'mock_test_completed');
    return { attempt, test };
  }

  public addVipMockTest(
    input: Omit<VipMockTestRecord, 'id' | 'created_at' | 'updated_at'>,
    actor: User
  ): VipMockTestRecord {
    if (!Array.isArray(this.db.vip_mock_tests)) {
      this.db.vip_mock_tests = getInitialVipMockTests();
    }
    const nowIso = new Date().toISOString();
    const record: VipMockTestRecord = {
      ...input,
      id: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.db.vip_mock_tests.unshift(record);
    this.saveDatabase(this.db);
    return record;
  }

  public deleteVipMockTest(id: string): boolean {
    if (!Array.isArray(this.db.vip_mock_tests)) return false;
    const before = this.db.vip_mock_tests.length;
    this.db.vip_mock_tests = this.db.vip_mock_tests.filter((t) => t.id !== id);
    if (this.db.vip_mock_tests.length !== before) {
      this.saveDatabase(this.db);
      return true;
    }
    return false;
  }

  // 12. Priority VIP Support Tickets
  public getPrioritySupportTickets(userId?: string): PrioritySupportTicket[] {
    if (!Array.isArray(this.db.priority_support_tickets)) {
      this.db.priority_support_tickets = [];
    }
    const list = userId
      ? this.db.priority_support_tickets.filter((t) => t.user_id === userId)
      : this.db.priority_support_tickets;
    return [...list].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  public createPrioritySupportTicket(
    user: User,
    input: {
      category: PrioritySupportTicket['category'];
      subject: string;
      message: string;
      attachment_url?: string | null;
    }
  ): PrioritySupportTicket {
    if (!Array.isArray(this.db.priority_support_tickets)) {
      this.db.priority_support_tickets = [];
    }
    const nowIso = new Date().toISOString();
    const ticketCode = `SF-VIP-SUP-${Math.floor(10000 + Math.random() * 90000)}`;
    const ticket: PrioritySupportTicket = {
      id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ticket_code: ticketCode,
      user_id: user.id,
      user_email: user.email,
      category: input.category,
      subject: input.subject.trim().slice(0, 160),
      message: input.message.trim().slice(0, 2000),
      attachment_url: input.attachment_url || null,
      status: 'Open',
      priority: 'VIP High',
      replies: [],
      created_at: nowIso,
      updated_at: nowIso,
    };
    this.db.priority_support_tickets.unshift(ticket);
    this.saveDatabase(this.db);
    return ticket;
  }

  public replyToPrioritySupportTicket(
    ticketId: string,
    sender: User,
    message: string,
    newStatus?: PrioritySupportTicket['status']
  ): PrioritySupportTicket | undefined {
    if (!Array.isArray(this.db.priority_support_tickets)) return undefined;
    const idx = this.db.priority_support_tickets.findIndex((t) => t.id === ticketId || t.ticket_code === ticketId);
    if (idx === -1) return undefined;
    const ticket = this.db.priority_support_tickets[idx];
    const isAdmin = sender.role === 'admin' || sender.role === 'super_admin';
    if (!isAdmin && ticket.user_id !== sender.id) return undefined;

    const nowIso = new Date().toISOString();
    const reply = {
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sender_role: (isAdmin ? sender.role : 'student') as 'student' | 'admin' | 'super_admin',
      sender_email: sender.email,
      message: message.trim().slice(0, 2000),
      created_at: nowIso,
    };
    ticket.replies.push(reply);
    if (newStatus) {
      ticket.status = newStatus;
    } else if (isAdmin && ticket.status === 'Open') {
      ticket.status = 'In Progress';
    }
    ticket.updated_at = nowIso;
    this.db.priority_support_tickets[idx] = ticket;
    this.saveDatabase(this.db);

    if (isAdmin) {
      this.addStudentNotification({
        user_id: ticket.user_id,
        type: 'support_reply',
        title: `Priority Support Reply (${ticket.ticket_code})`,
        message: `Admin replied to "${ticket.subject}": "${reply.message.slice(0, 90)}${reply.message.length > 90 ? '...' : ''}"`,
        action_tab: 'vip',
      });
    }

    return ticket;
  }

  // ===========================================================================
  // PART E, F, G, H, I: VIP REFERRAL MANAGEMENT, DISCOUNT ENGINE & SALES REPORTS
  // ===========================================================================

  public isReferralProgramEnabled(): boolean {
    return this.db.settings.referral_program_enabled !== false;
  }

  public setReferralProgramGlobalSwitch(
    enabled: boolean,
    actor: User,
    ipAddress?: string
  ): AppSettings {
    const prev = this.isReferralProgramEnabled();
    this.db.settings.referral_program_enabled = Boolean(enabled);
    this.db.settings.updated_at = new Date().toISOString();
    this.saveDatabase(this.db);
    if (this.supabase) {
      this.syncSettingsToSupabase().catch((err) => {
        console.error('[STORAGE] Error syncing referral_program_enabled to Supabase:', err);
      });
    }

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'referral_program_switch',
      section: 'referral_management',
      target_id: 'global_referral_program_switch',
      description: `Global Referral Program turned ${enabled ? 'ON' : 'OFF'} (all existing referral records, sales reports, and discount configs preserved)`,
      previous_value: { referral_program_enabled: prev },
      new_value: { referral_program_enabled: Boolean(enabled) },
      status: 'success',
      ip_address: ipAddress,
    });

    return this.db.settings;
  }

  public getUserReferralPermissions(userId: string): UserReferralPermissions {
    const user = this.getUserById(userId);
    const isSuper = user?.role === 'super_admin' || user?.email?.toLowerCase() === 'bhaskardattmishra0101@gmail.com';
    if (isSuper) {
      return getDefaultUserReferralPermissions(userId, true);
    }
    if (!this.db.user_referral_permissions) {
      this.db.user_referral_permissions = {};
    }
    const existing = this.db.user_referral_permissions[userId];
    const defaults = getDefaultUserReferralPermissions(userId, false);
    if (!existing) {
      return defaults;
    }
    return {
      ...defaults,
      ...existing,
      user_id: userId,
    };
  }

  public updateUserReferralPermissions(
    targetUserId: string,
    updates: Partial<UserReferralPermissions>,
    actor: User,
    ipAddress?: string
  ): UserReferralPermissions {
    if (!this.db.user_referral_permissions) {
      this.db.user_referral_permissions = {};
    }
    const targetUser = this.getUserById(targetUserId);
    const isSuper = targetUser?.role === 'super_admin' || targetUser?.email?.toLowerCase() === 'bhaskardattmishra0101@gmail.com';
    if (isSuper) {
      return getDefaultUserReferralPermissions(targetUserId, true);
    }

    const prev = this.getUserReferralPermissions(targetUserId);
    const nowIso = new Date().toISOString();
    const next: UserReferralPermissions = {
      user_id: targetUserId,
      can_access_referral_dashboard:
        updates.can_access_referral_dashboard !== undefined
          ? Boolean(updates.can_access_referral_dashboard)
          : prev.can_access_referral_dashboard,
      can_view_own_referral_data:
        updates.can_view_own_referral_data !== undefined
          ? Boolean(updates.can_view_own_referral_data)
          : prev.can_view_own_referral_data,
      can_view_referral_sales:
        updates.can_view_referral_sales !== undefined
          ? Boolean(updates.can_view_referral_sales)
          : prev.can_view_referral_sales,
      can_create_share_referral_link:
        updates.can_create_share_referral_link !== undefined
          ? Boolean(updates.can_create_share_referral_link)
          : prev.can_create_share_referral_link,
      can_manage_referral_settings:
        updates.can_manage_referral_settings !== undefined
          ? Boolean(updates.can_manage_referral_settings)
          : prev.can_manage_referral_settings,
      can_view_referral_reports:
        updates.can_view_referral_reports !== undefined
          ? Boolean(updates.can_view_referral_reports)
          : prev.can_view_referral_reports,
      can_access_referral_management:
        updates.can_access_referral_management !== undefined
          ? Boolean(updates.can_access_referral_management)
          : prev.can_access_referral_management,
      updated_by: actor.email,
      updated_at: nowIso,
    };

    this.db.user_referral_permissions[targetUserId] = next;
    this.saveDatabase(this.db);

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'referral_permission_change',
      section: 'referral_management',
      target_id: targetUser?.email || targetUserId,
      description: `Updated individual referral permissions for ${targetUser?.email || targetUserId}`,
      previous_value: prev,
      new_value: next,
      ip_address: ipAddress,
    });

    return next;
  }

  public getReferralDiscountConfig(): ReferralDiscountConfig {
    if (!this.db.settings.referral_discount_config) {
      this.db.settings.referral_discount_config = getDefaultReferralDiscountConfig();
      this.saveDatabase(this.db);
    }
    return {
      ...getDefaultReferralDiscountConfig(),
      ...this.db.settings.referral_discount_config,
    };
  }

  public updateReferralDiscountConfig(
    updates: Partial<ReferralDiscountConfig>,
    actor: User,
    ipAddress?: string
  ): ReferralDiscountConfig {
    const prev = this.getReferralDiscountConfig();
    const nowIso = new Date().toISOString();
    const rawType = updates.discount_type || prev.discount_type;
    // Mutually exclusive: either 'percentage' or 'fixed' (if 'none' was passed, disable discount and keep 'percentage' as default type)
    const validType: 'none' | 'percentage' | 'fixed' =
      rawType === 'fixed' ? 'fixed' : rawType === 'none' ? 'none' : 'percentage';

    const rawVal = updates.discount_value !== undefined ? Number(updates.discount_value) : prev.discount_value;
    const safeVal = Number.isFinite(rawVal)
      ? Math.max(0, validType === 'percentage' ? Math.min(100, rawVal) : rawVal)
      : 0;

    const isDiscountEnabled =
      updates.discount_enabled !== undefined
        ? Boolean(updates.discount_enabled) && validType !== 'none'
        : prev.discount_enabled && validType !== 'none';

    const next: ReferralDiscountConfig = {
      discount_enabled: isDiscountEnabled,
      discount_type: validType === 'none' ? 'percentage' : validType,
      discount_value: safeVal,
      min_purchase_amount:
        updates.min_purchase_amount !== undefined
          ? Math.max(0, Number(updates.min_purchase_amount) || 0)
          : prev.min_purchase_amount,
      max_discount_amount:
        updates.max_discount_amount !== undefined
          ? Math.max(0, Number(updates.max_discount_amount) || 0)
          : prev.max_discount_amount,
      eligible_plan_ids: Array.isArray(updates.eligible_plan_ids)
        ? updates.eligible_plan_ids.map(String)
        : prev.eligible_plan_ids || [],
      disabled_plan_ids: Array.isArray(updates.disabled_plan_ids)
        ? updates.disabled_plan_ids.map(String)
        : prev.disabled_plan_ids || [],
      valid_from: updates.valid_from !== undefined ? updates.valid_from || null : prev.valid_from,
      valid_until: updates.valid_until !== undefined ? updates.valid_until || null : prev.valid_until,
      attribution_validity_days:
        updates.attribution_validity_days !== undefined
          ? Math.max(0, Math.round(Number(updates.attribution_validity_days) || 0))
          : prev.attribution_validity_days ?? 0,
      usage_limit_per_user:
        updates.usage_limit_per_user !== undefined
          ? Math.max(1, Math.round(Number(updates.usage_limit_per_user) || 1))
          : prev.usage_limit_per_user || 1,
      combine_with_plan_discount:
        updates.combine_with_plan_discount !== undefined
          ? Boolean(updates.combine_with_plan_discount)
          : prev.combine_with_plan_discount,
      campaign_label:
        updates.campaign_label !== undefined
          ? String(updates.campaign_label || '').trim().slice(0, 80)
          : prev.campaign_label,
      updated_by: actor.email,
      updated_at: nowIso,
    };

    this.db.settings.referral_discount_config = next;
    this.db.settings.updated_at = nowIso;
    this.saveDatabase(this.db);
    if (this.supabase) {
      this.syncSettingsToSupabase().catch((err) => {
        console.error('[STORAGE] Error syncing referral_discount_config to Supabase:', err);
      });
    }

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'referral_discount_change',
      section: 'referral_management',
      target_id: 'referral_discount_config',
      description: `Updated Referral Discount Settings (${next.discount_enabled ? `${next.discount_type.toUpperCase()} ${next.discount_type === 'percentage' ? `${next.discount_value}%` : `₹${next.discount_value}`}` : 'OFF'})`,
      previous_value: prev,
      new_value: next,
      status: 'success',
      ip_address: ipAddress,
    });

    return next;
  }

  public calculateReferralDiscountForUser(userId: string, planId: string): ReferralPricePreview {
    const plans = this.getVipPlans(false);
    const plan = plans.find((p) => p.id === planId);
    const originalPrice = Math.max(0, plan ? Number(plan.price_inr) || 0 : Number(this.db.settings.vip_payment_amount) || 0);
    const planTitle = plan ? plan.title : 'VIP Plan';

    const makeIneligible = (reason: string, code?: string | null, refEmail?: string | null): ReferralPricePreview => ({
      plan_id: planId,
      plan_title: planTitle,
      original_plan_price: originalPrice,
      eligible: false,
      discount_eligible: false,
      discount_applied: 0,
      referral_discount_applied: 0,
      final_payable_amount: originalPrice,
      referral_code_attributed: code ?? null,
      referrer_email: refEmail ?? null,
      reason,
    });

    const user = this.getUserById(userId);
    if (!user) {
      return makeIneligible('User not found.');
    }

    let refRecord = (this.db.vip_referrals || []).find(
      (r) =>
        (r.referred_user_id === user.id || r.referred_email?.toLowerCase() === user.email.toLowerCase()) &&
        r.status !== 'rejected_fraud'
    );
    const referrerId = user.referred_by_user_id || refRecord?.referrer_user_id || null;

    // Auto-reconcile if user.referred_by_user_id exists on the user record from Day 1 login/signup
    if (referrerId && !refRecord) {
      const referrerUser = this.getUserById(referrerId);
      if (referrerUser) {
        const refCode = user.referred_by_code || this.ensureUserReferralCode(referrerUser.id);
        const nowIso = user.referred_at || user.created_at || new Date().toISOString();
        refRecord = {
          id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          referrer_user_id: referrerUser.id,
          referrer_name: referrerUser.name || referrerUser.email.split('@')[0],
          referrer_email: referrerUser.email,
          referrer_role: referrerUser.role,
          referrer_account_type: referrerUser.role,
          referred_user_id: user.id,
          referred_name: user.name || user.email.split('@')[0],
          referred_email: user.email,
          referral_code: refCode,
          status: 'pending_verification',
          vip_purchase_status: 'not_purchased',
          purchased_plan_id: null,
          purchased_plan_title: null,
          original_plan_price: 0,
          discount_applied: 0,
          final_amount_paid: 0,
          payment_request_id: null,
          payment_verification_status: 'none',
          vip_activation_status: user.vip_active ? 'active' : 'inactive',
          vip_expires_at: user.vip_expires_at || null,
          reward_status: 'pending',
          counted_in_referral_sales: false,
          fraud_reason: null,
          reward_days_granted: 0,
          created_at: nowIso,
          registered_at: user.created_at || nowIso,
          qualified_at: null,
          rewarded_at: null,
        };
        if (!Array.isArray(this.db.vip_referrals)) {
          this.db.vip_referrals = [];
        }
        this.db.vip_referrals.unshift(refRecord);
        this.saveDatabase(this.db);
      }
    } else if (refRecord && !user.referred_by_user_id) {
      user.referred_by_user_id = refRecord.referrer_user_id;
      user.referred_by_code = refRecord.referral_code;
      user.referred_at = user.referred_at || refRecord.created_at;
      this.saveDatabase(this.db);
    }

    if (!referrerId || !refRecord) {
      return makeIneligible('Account was not registered with a referral code.');
    }

    // Check referrer's referral link permission
    const referrerPerms = this.getUserReferralPermissions(referrerId);
    if (!referrerPerms.can_create_share_referral_link) {
      return makeIneligible(
        'The referral code associated with this account is currently inactive.',
        refRecord.referral_code,
        refRecord.referrer_email
      );
    }

    // Note: Attribution tracking is preserved even when Global Referral Program is OFF;
    // Discount applies strictly according to the Referral Discount ON/OFF & type settings.
    const config = this.getReferralDiscountConfig();
    if (!config.discount_enabled || config.discount_type === 'none' || config.discount_value <= 0) {
      return makeIneligible(
        'Referral purchase discounts are currently OFF. Original plan price applies.',
        refRecord.referral_code,
        refRecord.referrer_email
      );
    }

    const nowMs = Date.now();
    // Check configurable attribution validity window (0 = never expires until used)
    if (config.attribution_validity_days && config.attribution_validity_days > 0) {
      const attributedAtStr = user.referred_at || refRecord.created_at || user.created_at;
      const attributedAtMs = attributedAtStr ? new Date(attributedAtStr).getTime() : nowMs;
      const maxWindowMs = config.attribution_validity_days * 24 * 60 * 60 * 1000;
      if (Number.isFinite(attributedAtMs) && nowMs - attributedAtMs > maxWindowMs) {
        return makeIneligible(
          `Referral discount attribution window (${config.attribution_validity_days} days) has expired.`,
          refRecord.referral_code,
          refRecord.referrer_email
        );
      }
    }

    if (config.valid_from && new Date(config.valid_from).getTime() > nowMs) {
      return makeIneligible(
        'Referral discount campaign has not started yet.',
        refRecord.referral_code,
        refRecord.referrer_email
      );
    }
    if (config.valid_until && new Date(config.valid_until).getTime() < nowMs) {
      return makeIneligible(
        'Referral discount campaign has expired.',
        refRecord.referral_code,
        refRecord.referrer_email
      );
    }

    if (config.min_purchase_amount > 0 && originalPrice < config.min_purchase_amount) {
      return makeIneligible(
        `Minimum plan price of ₹${config.min_purchase_amount} is required for referral discount.`,
        refRecord.referral_code,
        refRecord.referrer_email
      );
    }

    if (plan && config.disabled_plan_ids && config.disabled_plan_ids.includes(plan.id)) {
      return makeIneligible(
        'Referral discount is not applicable to this VIP plan.',
        refRecord.referral_code,
        refRecord.referrer_email
      );
    }

    if (
      plan &&
      Array.isArray(config.eligible_plan_ids) &&
      config.eligible_plan_ids.length > 0 &&
      !config.eligible_plan_ids.includes(plan.id)
    ) {
      return makeIneligible(
        'Referral discount is only available on selected VIP plans.',
        refRecord.referral_code,
        refRecord.referrer_email
      );
    }

    if (
      !config.combine_with_plan_discount &&
      plan &&
      ((plan.original_price_inr && plan.original_price_inr > plan.price_inr) || Boolean(plan.discount_label))
    ) {
      return makeIneligible(
        'Referral discount cannot be combined with an already discounted plan.',
        refRecord.referral_code,
        refRecord.referrer_email
      );
    }

    // Usage limit per referred user (only count non-rejected payments that applied a referral discount)
    const usedDiscountCount = (this.db.payment_records || []).filter(
      (p) =>
        p.user_id === user.id &&
        (Number(p.referral_discount_applied) || 0) > 0 &&
        p.status !== 'rejected' &&
        p.status !== 'failed'
    ).length;

    const maxUses = Math.max(1, Number(config.usage_limit_per_user) || 1);
    if (usedDiscountCount >= maxUses) {
      return makeIneligible(
        'Referral discount usage limit has already been used for your account.',
        refRecord.referral_code,
        refRecord.referrer_email
      );
    }

    // Mutually exclusive calculation: Percentage (%) OR Fixed Amount (₹) — never both
    let rawDiscount = 0;
    if (config.discount_type === 'percentage') {
      const pct = Math.max(0, Math.min(100, Number(config.discount_value) || 0));
      rawDiscount = (originalPrice * pct) / 100;
    } else if (config.discount_type === 'fixed') {
      rawDiscount = Math.max(0, Number(config.discount_value) || 0);
    }

    if (config.max_discount_amount > 0 && rawDiscount > config.max_discount_amount) {
      rawDiscount = config.max_discount_amount;
    }

    // Backend validation: Final price must NEVER be negative
    const maxAllowedDiscount = Math.max(0, originalPrice);
    const discountApplied = Math.round(Math.min(rawDiscount, maxAllowedDiscount) * 100) / 100;
    const finalPayable = Math.max(0, Math.round((originalPrice - discountApplied) * 100) / 100);
    const label =
      config.campaign_label ||
      (config.discount_type === 'percentage'
        ? `Referral Discount (${config.discount_value}% OFF)`
        : `Referral Discount (₹${config.discount_value} OFF)`);

    return {
      plan_id: planId,
      plan_title: planTitle,
      original_plan_price: originalPrice,
      eligible: discountApplied > 0,
      discount_eligible: discountApplied > 0,
      discount_applied: discountApplied,
      referral_discount_applied: discountApplied,
      final_payable_amount: finalPayable,
      campaign_label: label,
      discount_label: label,
      referral_code_attributed: refRecord.referral_code,
      referrer_email: refRecord.referrer_email,
    };
  }

  public ensureUserReferralCode(userId: string): string {
    const user = this.getUserById(userId);
    if (!user) return '';
    if (user.referral_code && user.referral_code.startsWith('SF-REF-')) {
      return user.referral_code;
    }
    const cleanHex = crypto.createHash('md5').update(user.id + user.email).digest('hex').slice(0, 6).toUpperCase();
    const code = `SF-REF-${cleanHex}`;
    user.referral_code = code;
    this.saveDatabase(this.db);
    return code;
  }

  private enrichReferralRecord(r: VipReferralRecord): VipReferralRecord {
    const referrer = this.getUserById(r.referrer_user_id);
    const referred = this.getUserById(r.referred_user_id);
    const nowMs = Date.now();
    const isReferredVipActive = Boolean(
      referred &&
        referred.vip_active &&
        (!referred.vip_expires_at || new Date(referred.vip_expires_at).getTime() > nowMs)
    );
    const isReferredVipExpired = Boolean(
      referred &&
        referred.vip_expires_at &&
        new Date(referred.vip_expires_at).getTime() <= nowMs
    );

    const vipPurchaseStatus =
      r.vip_purchase_status ||
      (r.status === 'rewarded' || r.status === 'qualified' ? 'approved' : 'not_purchased');

    const paymentVerificationStatus =
      r.payment_verification_status ||
      (vipPurchaseStatus === 'approved'
        ? 'approved'
        : vipPurchaseStatus === 'pending_verification' || vipPurchaseStatus === 'pending'
        ? 'pending_verification'
        : vipPurchaseStatus === 'rejected'
        ? 'rejected'
        : 'none');

    const vipActivationStatus: 'inactive' | 'active' | 'expired' = isReferredVipActive
      ? 'active'
      : isReferredVipExpired
      ? 'expired'
      : r.vip_activation_status || 'inactive';

    const rewardStatus =
      r.reward_status ||
      (r.status === 'rewarded'
        ? 'rewarded'
        : r.status === 'rejected_fraud'
        ? 'rejected'
        : 'pending');

    const resolvedRole = referrer?.role || r.referrer_role || r.referrer_account_type || 'user';

    return {
      ...r,
      referrer_name: referrer?.name || r.referrer_name || r.referrer_email.split('@')[0],
      referrer_email: referrer?.email || r.referrer_email,
      referrer_role: resolvedRole,
      referrer_account_type: resolvedRole,
      referred_name: referred?.name || r.referred_name || r.referred_email.split('@')[0],
      referred_email: referred?.email || r.referred_email,
      registered_at: r.registered_at || referred?.created_at || r.created_at,
      registration_date: r.registered_at || referred?.created_at || r.created_at,
      vip_purchase_status: vipPurchaseStatus,
      purchased_plan_id: r.purchased_plan_id ?? null,
      purchased_plan_title: r.purchased_plan_title ?? null,
      original_plan_price: Number(r.original_plan_price) || 0,
      discount_applied: Number(r.discount_applied) || 0,
      final_amount_paid: Number(r.final_amount_paid) || 0,
      payment_request_id: r.payment_request_id ?? null,
      payment_verification_status: paymentVerificationStatus,
      vip_activation_status: vipActivationStatus,
      vip_expires_at: referred?.vip_expires_at || r.vip_expires_at || null,
      membership_expiry_date: referred?.vip_expires_at || r.vip_expires_at || null,
      reward_status: rewardStatus,
      counted_in_referral_sales: Boolean(
        r.counted_in_referral_sales ||
          (vipPurchaseStatus === 'approved' && paymentVerificationStatus === 'approved')
      ),
    };
  }

  public getReferralsForUser(userId: string): VipReferralRecord[] {
    if (!Array.isArray(this.db.vip_referrals)) {
      this.db.vip_referrals = [];
    }
    return this.db.vip_referrals
      .filter((r) => r.referrer_user_id === userId)
      .map((r) => this.enrichReferralRecord(r))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getAllReferrals(): VipReferralRecord[] {
    if (!Array.isArray(this.db.vip_referrals)) {
      this.db.vip_referrals = [];
    }
    return [...this.db.vip_referrals]
      .map((r) => this.enrichReferralRecord(r))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public applyReferralCode(
    student: User,
    rawCode: string,
    clientIp?: string,
    deviceId?: string,
    options?: { allowAttributionWhenProgramOff?: boolean }
  ): { success: boolean; code?: string; referral?: VipReferralRecord; error?: string } {
    const allowWhenOff = options?.allowAttributionWhenProgramOff !== false;
    if (!this.isReferralProgramEnabled() && !allowWhenOff) {
      return {
        success: false,
        code: 'REFERRAL_PROGRAM_OFF',
        error: 'Referral Program is currently OFF.',
      };
    }

    const cleanCode = (rawCode || '').trim().toUpperCase();
    if (!cleanCode || !cleanCode.startsWith('SF-REF-')) {
      return {
        success: false,
        code: 'INVALID_REFERRAL_CODE',
        error: 'Please enter a valid Study Fox referral code (e.g., SF-REF-XXXXXX).',
      };
    }

    if (student.referred_by_user_id) {
      return {
        success: false,
        code: 'ALREADY_REFERRED',
        error: 'Your account has already claimed a referral code.',
      };
    }

    // Ensure all users have their referral codes initialized
    for (const u of this.db.users) {
      this.ensureUserReferralCode(u.id);
    }

    const referrer = this.db.users.find((u) => u.referral_code?.toUpperCase() === cleanCode);
    if (!referrer) {
      return {
        success: false,
        code: 'REFERRAL_NOT_FOUND',
        error: 'Referral code not found. Please check the code and try again.',
      };
    }

    // Check if referrer's referral sharing permission was disabled by Super Admin
    const referrerPerms = this.getUserReferralPermissions(referrer.id);
    if (!referrerPerms.can_create_share_referral_link) {
      return {
        success: false,
        code: 'REFERRER_LINK_DISABLED',
        error: 'This referral code is currently inactive.',
      };
    }

    // Fraud Rule 1: Self-referral prevention
    if (referrer.id === student.id || referrer.email.toLowerCase() === student.email.toLowerCase()) {
      return {
        success: false,
        code: 'SELF_REFERRAL_BLOCKED',
        error: 'Self-referral is not allowed. You cannot use your own referral code.',
      };
    }

    if (!Array.isArray(this.db.vip_referrals)) {
      this.db.vip_referrals = [];
    }

    // Fraud Rule 2: Duplicate attribution check
    const alreadyReferred = this.db.vip_referrals.find(
      (r) =>
        r.referred_user_id === student.id ||
        r.referred_email?.toLowerCase() === student.email.toLowerCase()
    );
    if (alreadyReferred) {
      return {
        success: false,
        code: 'ALREADY_REFERRED',
        error: 'This account is already linked to a referral record.',
      };
    }

    // Fraud Rule 3: Device & IP collision detection
    const sameDevice = Boolean(
      deviceId &&
        referrer.vip_bound_device_id &&
        referrer.vip_bound_device_id === deviceId
    );
    const sameIp = Boolean(
      clientIp &&
        clientIp !== '127.0.0.1' &&
        referrer.vip_device_last_ip &&
        referrer.vip_device_last_ip === clientIp
    );

    const nowIso = new Date().toISOString();
    const record: VipReferralRecord = {
      id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      referrer_user_id: referrer.id,
      referrer_name: referrer.name || referrer.email.split('@')[0],
      referrer_email: referrer.email,
      referrer_role: referrer.role,
      referrer_account_type: referrer.role,
      referred_user_id: student.id,
      referred_name: student.name || student.email.split('@')[0],
      referred_email: student.email,
      referral_code: cleanCode,
      status: sameDevice ? 'rejected_fraud' : 'pending_verification',
      vip_purchase_status: 'not_purchased',
      purchased_plan_id: null,
      purchased_plan_title: null,
      original_plan_price: 0,
      discount_applied: 0,
      final_amount_paid: 0,
      payment_request_id: null,
      payment_verification_status: 'none',
      vip_activation_status: student.vip_active ? 'active' : 'inactive',
      vip_expires_at: student.vip_expires_at || null,
      reward_status: sameDevice ? 'rejected' : 'pending',
      counted_in_referral_sales: false,
      fraud_reason: sameDevice
        ? 'Blocked: Referrer and referred account share the same physical device fingerprint.'
        : sameIp
        ? 'Flagged for Admin Review: Matching network IP address.'
        : null,
      reward_days_granted: 0,
      ip_address: clientIp,
      device_id: deviceId,
      created_at: nowIso,
      registered_at: student.created_at || nowIso,
      qualified_at: null,
      rewarded_at: null,
    };

    if (!sameDevice) {
      student.referred_by_user_id = referrer.id;
      student.referred_by_code = cleanCode;
      student.referred_at = nowIso;
    }
    this.db.vip_referrals.unshift(record);
    this.saveDatabase(this.db);

    if (!sameDevice) {
      void this.updateUser(student.id, {
        referred_by_user_id: referrer.id,
        referred_by_code: cleanCode,
        referred_at: nowIso,
      });
    }

    if (record.status === 'rejected_fraud') {
      return {
        success: false,
        code: 'DEVICE_COLLISION_FRAUD',
        error: 'Referral could not be verified because both accounts share the same device.',
      };
    }

    return { success: true, referral: this.enrichReferralRecord(record) };
  }

  public recordReferralPaymentSubmitted(userId: string, payment: PaymentRecord): void {
    if (!Array.isArray(this.db.vip_referrals)) return;
    const refRecord = this.db.vip_referrals.find(
      (r) => r.referred_user_id === userId && r.status !== 'rejected_fraud'
    );
    if (!refRecord) return;

    // Only update if not already counted as an approved sale
    if (refRecord.counted_in_referral_sales && refRecord.vip_purchase_status === 'approved') {
      return;
    }

    refRecord.vip_purchase_status = 'pending_verification';
    refRecord.payment_verification_status = 'pending_verification';
    refRecord.purchased_plan_id = payment.plan_id || null;
    refRecord.purchased_plan_title = payment.plan_title || 'VIP Plan';
    refRecord.original_plan_price = Number(payment.original_plan_price ?? payment.expected_amount ?? payment.amount) || 0;
    refRecord.discount_applied = Number(payment.referral_discount_applied) || 0;
    refRecord.final_amount_paid = Number(payment.amount) || 0;
    refRecord.payment_request_id = payment.request_id || payment.id;
    refRecord.counted_in_referral_sales = false;
    this.saveDatabase(this.db);
  }

  public recordReferralPaymentRejected(userId: string, payment: PaymentRecord): void {
    if (!Array.isArray(this.db.vip_referrals)) return;
    const refRecord = this.db.vip_referrals.find(
      (r) => r.referred_user_id === userId && r.status !== 'rejected_fraud'
    );
    if (!refRecord) return;

    // Never overwrite an already approved/counted sale from an earlier valid purchase
    if (refRecord.counted_in_referral_sales && refRecord.vip_purchase_status === 'approved') {
      return;
    }

    refRecord.vip_purchase_status = 'rejected';
    refRecord.payment_verification_status = 'rejected';
    refRecord.payment_request_id = payment.request_id || payment.id;
    refRecord.counted_in_referral_sales = false;
    this.saveDatabase(this.db);
  }

  /**
   * Idempotently qualifies, records verified VIP sales, and rewards a referrer ONLY when the referred user completes an approved VIP purchase
   */
  public async processReferralQualificationOnVipApproval(
    referredUserId: string,
    approvedPayment?: PaymentRecord,
    newVipExpiresAt?: string | null
  ): Promise<VipReferralRecord | null> {
    if (!Array.isArray(this.db.vip_referrals)) return null;
    const refRecord = this.db.vip_referrals.find(
      (r) => r.referred_user_id === referredUserId && r.status !== 'rejected_fraud'
    );
    if (!refRecord) return null;

    const referredUser = this.getUserById(referredUserId);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // Update verified purchase & sale fields (idempotent: only count once per referral record)
    if (!refRecord.counted_in_referral_sales) {
      refRecord.vip_purchase_status = 'approved';
      refRecord.payment_verification_status = 'approved';
      refRecord.vip_activation_status = 'active';
      refRecord.vip_expires_at = newVipExpiresAt || referredUser?.vip_expires_at || refRecord.vip_expires_at || null;
      if (approvedPayment) {
        refRecord.purchased_plan_id = approvedPayment.plan_id || refRecord.purchased_plan_id || null;
        refRecord.purchased_plan_title = approvedPayment.plan_title || refRecord.purchased_plan_title || 'VIP Plan';
        refRecord.original_plan_price =
          Number(approvedPayment.original_plan_price ?? approvedPayment.expected_amount ?? approvedPayment.amount) ||
          Number(refRecord.original_plan_price) ||
          0;
        refRecord.discount_applied =
          Number(approvedPayment.referral_discount_applied ?? refRecord.discount_applied) || 0;
        refRecord.final_amount_paid = Number(approvedPayment.amount) || Number(refRecord.final_amount_paid) || 0;
        refRecord.payment_request_id = approvedPayment.request_id || approvedPayment.id;
      }
      refRecord.counted_in_referral_sales = true;
      refRecord.qualified_at = refRecord.qualified_at || nowIso;
    } else {
      refRecord.vip_activation_status = 'active';
      refRecord.vip_expires_at = newVipExpiresAt || referredUser?.vip_expires_at || refRecord.vip_expires_at || null;
    }

    if (refRecord.status === 'rewarded') {
      this.saveDatabase(this.db);
      return this.enrichReferralRecord(refRecord); // Idempotent guard against duplicate bonus days
    }

    if (!this.isReferralProgramEnabled()) {
      refRecord.status = 'qualified';
      refRecord.reward_status = 'ineligible';
      this.saveDatabase(this.db);
      return this.enrichReferralRecord(refRecord);
    }

    const rewardDays = Math.max(1, Number(this.db.settings.referral_reward_days ?? 7));
    const referrer = this.getUserById(refRecord.referrer_user_id);
    if (!referrer) {
      this.saveDatabase(this.db);
      return this.enrichReferralRecord(refRecord);
    }

    const baseExpiryMs =
      referrer.vip_active && referrer.vip_expires_at
        ? Math.max(nowMs, new Date(referrer.vip_expires_at).getTime())
        : nowMs;
    const newExpiryIso = new Date(baseExpiryMs + rewardDays * 24 * 3600 * 1000).toISOString();

    await this.updateUser(referrer.id, {
      vip_active: true,
      vip_expires_at: newExpiryIso,
      bonus_vip_days: (referrer.bonus_vip_days || 0) + rewardDays,
    });

    refRecord.status = 'rewarded';
    refRecord.reward_status = 'rewarded';
    refRecord.reward_days_granted = rewardDays;
    refRecord.qualified_at = refRecord.qualified_at || nowIso;
    refRecord.rewarded_at = nowIso;
    this.saveDatabase(this.db);

    this.addStudentNotification({
      user_id: referrer.id,
      type: 'referral_reward',
      title: `🎁 +${rewardDays} Bonus VIP Days Earned!`,
      message: `Your referred friend (${refRecord.referred_email}) activated VIP membership! +${rewardDays} bonus VIP days have been added to your account.`,
      action_tab: 'vip_dashboard',
    });

    return this.enrichReferralRecord(refRecord);
  }

  public getReferrerSalesSummary(referrerUserId: string): ReferrerSalesSummaryReport {
    const user = this.getUserById(referrerUserId);
    const referralCode = user ? this.ensureUserReferralCode(user.id) : '';
    const permissions = this.getUserReferralPermissions(referrerUserId);
    const records = this.getReferralsForUser(referrerUserId);

    let vipPurchases = 0;
    let nonPurchasingReferrals = 0;
    let pendingPurchases = 0;
    let rejectedPurchases = 0;
    let verifiedGrossSalesInr = 0;
    let discountsGivenInr = 0;
    let netCollectedAmountInr = 0;
    let rewardDaysEarned = 0;

    for (const r of records) {
      rewardDaysEarned += Number(r.reward_days_granted) || 0;
      const isApprovedSale =
        r.status !== 'rejected_fraud' &&
        (r.vip_purchase_status === 'approved' ||
          r.payment_verification_status === 'approved' ||
          r.counted_in_referral_sales === true);

      if (isApprovedSale) {
        vipPurchases += 1;
        const orig = Number(r.original_plan_price) || Number(r.final_amount_paid) || 0;
        const disc = Number(r.discount_applied) || 0;
        const paid = Number(r.final_amount_paid) || Math.max(0, orig - disc);
        verifiedGrossSalesInr += orig;
        discountsGivenInr += disc;
        netCollectedAmountInr += paid;
      } else if (
        r.vip_purchase_status === 'pending_verification' ||
        r.vip_purchase_status === 'pending' ||
        r.payment_verification_status === 'pending_verification'
      ) {
        pendingPurchases += 1;
        nonPurchasingReferrals += 1;
      } else if (r.vip_purchase_status === 'rejected' || r.payment_verification_status === 'rejected') {
        rejectedPurchases += 1;
        nonPurchasingReferrals += 1;
      } else {
        nonPurchasingReferrals += 1;
      }
    }

    const grossRounded = Math.round(verifiedGrossSalesInr * 100) / 100;
    const discRounded = Math.round(discountsGivenInr * 100) / 100;
    const netRounded = Math.round(netCollectedAmountInr * 100) / 100;
    const role = user?.role || 'user';

    return {
      referrer_user_id: referrerUserId,
      referrer_name: user?.name || (user?.email ? user.email.split('@')[0] : 'Referrer'),
      referrer_email: user?.email || '',
      referrer_role: role,
      referrer_account_type: role,
      referral_code: referralCode,
      permissions,
      total_referrals: records.length,
      registered_referrals: records.length,
      vip_purchases: vipPurchases,
      vip_purchases_count: vipPurchases,
      non_purchasing_referrals: nonPurchasingReferrals,
      non_purchasing_referrals_count: nonPurchasingReferrals,
      pending_purchases: pendingPurchases,
      rejected_purchases: rejectedPurchases,
      verified_gross_sales_inr: grossRounded,
      discounts_given_inr: discRounded,
      total_discounts_given_inr: discRounded,
      net_collected_amount_inr: netRounded,
      verified_net_sales_inr: netRounded,
      reward_days_earned: rewardDaysEarned,
      records,
    };
  }

  public getAdminReferralManagementData() {
    const allUsers = this.getUsers();
    for (const u of allUsers) {
      this.ensureUserReferralCode(u.id);
    }

    // Reconcile any user who has referred_by_user_id on their user object but no row in vip_referrals
    if (!Array.isArray(this.db.vip_referrals)) {
      this.db.vip_referrals = [];
    }
    let reconciledAny = false;
    for (const u of allUsers) {
      if (u.referred_by_user_id) {
        const exists = this.db.vip_referrals.some(
          (r) => r.referred_user_id === u.id || r.referred_email?.toLowerCase() === u.email.toLowerCase()
        );
        if (!exists) {
          const referrer = this.getUserById(u.referred_by_user_id);
          if (referrer) {
            const refCode = u.referred_by_code || this.ensureUserReferralCode(referrer.id);
            const nowIso = u.referred_at || u.created_at || new Date().toISOString();
            this.db.vip_referrals.unshift({
              id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              referrer_user_id: referrer.id,
              referrer_name: referrer.name || referrer.email.split('@')[0],
              referrer_email: referrer.email,
              referrer_role: referrer.role,
              referrer_account_type: referrer.role,
              referred_user_id: u.id,
              referred_name: u.name || u.email.split('@')[0],
              referred_email: u.email,
              referral_code: refCode,
              status: 'pending_verification',
              vip_purchase_status: 'not_purchased',
              purchased_plan_id: null,
              purchased_plan_title: null,
              original_plan_price: 0,
              discount_applied: 0,
              final_amount_paid: 0,
              payment_request_id: null,
              payment_verification_status: 'none',
              vip_activation_status: u.vip_active ? 'active' : 'inactive',
              vip_expires_at: u.vip_expires_at || null,
              reward_status: 'pending',
              counted_in_referral_sales: false,
              fraud_reason: null,
              reward_days_granted: 0,
              created_at: nowIso,
              registered_at: u.created_at || nowIso,
              qualified_at: null,
              rewarded_at: null,
            });
            reconciledAny = true;
          }
        }
      }
    }
    if (reconciledAny) {
      this.saveDatabase(this.db);
    }

    const allRecords = this.getAllReferrals();
    const referrerIdsSet = new Set<string>();
    for (const r of allRecords) {
      if (r.referrer_user_id) referrerIdsSet.add(r.referrer_user_id);
    }
    for (const u of allUsers) {
      if (u.role === 'admin' || u.role === 'super_admin' || this.db.user_referral_permissions?.[u.id]) {
        referrerIdsSet.add(u.id);
      }
    }

    const referrerReportsMap = new Map<string, ReferrerSalesSummaryReport>();
    for (const uid of referrerIdsSet) {
      const summary = this.getReferrerSalesSummary(uid);
      if (summary.referrer_email) {
        referrerReportsMap.set(uid, summary);
      }
    }

    const referrerReports: ReferrerSalesSummaryReport[] = Array.from(referrerReportsMap.values()).sort((a, b) => {
      if (b.vip_purchases_count !== a.vip_purchases_count) {
        return b.vip_purchases_count - a.vip_purchases_count;
      }
      if (b.total_referrals !== a.total_referrals) {
        return b.total_referrals - a.total_referrals;
      }
      return b.net_collected_amount_inr - a.net_collected_amount_inr;
    });

    const leaderboard: ReferrerSalesSummaryReport[] = [...referrerReports]
      .filter((r) => r.total_referrals > 0 || r.vip_purchases_count > 0 || r.reward_days_earned > 0)
      .sort((a, b) => {
        if (b.vip_purchases_count !== a.vip_purchases_count) {
          return b.vip_purchases_count - a.vip_purchases_count;
        }
        if (b.total_referrals !== a.total_referrals) {
          return b.total_referrals - a.total_referrals;
        }
        if (b.reward_days_earned !== a.reward_days_earned) {
          return b.reward_days_earned - a.reward_days_earned;
        }
        return b.net_collected_amount_inr - a.net_collected_amount_inr;
      });

    let approvedPurchases = 0;
    let pendingPurchases = 0;
    let rejectedPurchases = 0;
    let nonPurchasing = 0;
    let grossSales = 0;
    let totalDiscounts = 0;
    let netCollected = 0;
    let totalRewardDays = 0;

    for (const r of allRecords) {
      totalRewardDays += Number(r.reward_days_granted) || 0;
      const isApproved =
        r.status !== 'rejected_fraud' &&
        (r.vip_purchase_status === 'approved' ||
          r.payment_verification_status === 'approved' ||
          r.counted_in_referral_sales === true);

      if (isApproved) {
        approvedPurchases += 1;
        const orig = Number(r.original_plan_price) || Number(r.final_amount_paid) || 0;
        const disc = Number(r.discount_applied) || 0;
        const paid = Number(r.final_amount_paid) || Math.max(0, orig - disc);
        grossSales += orig;
        totalDiscounts += disc;
        netCollected += paid;
      } else if (r.vip_purchase_status === 'pending_verification' || r.vip_purchase_status === 'pending') {
        pendingPurchases += 1;
        nonPurchasing += 1;
      } else if (r.vip_purchase_status === 'rejected') {
        rejectedPurchases += 1;
        nonPurchasing += 1;
      } else {
        nonPurchasing += 1;
      }
    }

    const accountsDirectory = allUsers.map((u) => {
      const perms = this.getUserReferralPermissions(u.id);
      const rep = referrerReportsMap.get(u.id);
      return {
        id: u.id,
        name: u.name || u.email.split('@')[0],
        email: u.email,
        role: u.role,
        referral_code: u.referral_code || this.ensureUserReferralCode(u.id),
        created_at: u.created_at,
        last_login_at: u.last_login_at,
        vip_active: Boolean(u.vip_active),
        vip_expires_at: u.vip_expires_at,
        is_blocked: Boolean(u.is_blocked),
        referred_by_code: u.referred_by_code || null,
        referred_by_user_id: u.referred_by_user_id || null,
        total_referrals: rep?.total_referrals || 0,
        vip_purchases_count: rep?.vip_purchases_count || 0,
        reward_days_earned: rep?.reward_days_earned || 0,
        verified_net_sales_inr: rep?.verified_net_sales_inr || 0,
        permissions: perms,
        referral_permissions: perms,
      };
    });

    const summaryMetrics = {
      total_referrers: referrerReports.filter((r) => r.total_referrals > 0).length,
      total_referrals: allRecords.length,
      registered_referrals: allRecords.length,
      approved_vip_purchases: approvedPurchases,
      pending_vip_purchases: pendingPurchases,
      rejected_vip_purchases: rejectedPurchases,
      non_purchasing_referrals: nonPurchasing,
      verified_gross_sales_inr: Math.round(grossSales * 100) / 100,
      total_discounts_given_inr: Math.round(totalDiscounts * 100) / 100,
      net_collected_amount_inr: Math.round(netCollected * 100) / 100,
      verified_net_sales_inr: Math.round(netCollected * 100) / 100,
      total_reward_days_granted: totalRewardDays,
    };

    return {
      referral_program_enabled: this.isReferralProgramEnabled(),
      discount_config: this.getReferralDiscountConfig(),
      global_summary: summaryMetrics,
      global_metrics: summaryMetrics,
      referrer_reports: referrerReports,
      leaderboard,
      all_records: allRecords,
      referrals: allRecords,
      accounts_directory: accountsDirectory,
      users: accountsDirectory,
    };
  }

  // ===========================================================================
  // PART K: CONFIRMED TEST/EXAMPLE ACCOUNT CLEANUP (WITH VERIFIED BACKUP FIRST)
  // ===========================================================================

  private purgeConfirmedTestAccountsOnStartup(): void {
    try {
      const confirmedUsers = (this.db.users || []).filter((u) => isConfirmedTestOrDemoEmail(u.email));
      const confirmedPayments = (this.db.payment_records || []).filter((p) => isConfirmedTestOrDemoEmail(p.email));
      if (confirmedUsers.length === 0 && confirmedPayments.length === 0) {
        return;
      }
      const superAdmin =
        this.db.users.find((u) => u.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com') ||
        this.db.users.find((u) => u.role === 'super_admin') || {
          id: '27f86505-bb19-465f-9597-aecf7ec7ee85',
          email: 'bhaskardattmishra0101@gmail.com',
          password_hash: '',
          role: 'super_admin' as const,
          vip_active: true,
          vip_expires_at: null,
          created_at: new Date().toISOString(),
          last_login_at: null,
        };
      this.purgeConfirmedTestAccounts(superAdmin);
    } catch (err) {
      console.warn('[CLEANUP] Non-fatal warning during startup test account cleanup:', err);
    }
  }

  public purgeConfirmedTestAccounts(actor: User): {
    backup_id: string;
    removed_users_count: number;
    removed_emails: string[];
    removed_payments_count: number;
    remaining_users_count: number;
  } {
    const confirmedUsers = (this.db.users || []).filter((u) => isConfirmedTestOrDemoEmail(u.email));
    const confirmedUserIds = new Set(confirmedUsers.map((u) => u.id));
    const removedEmails = confirmedUsers.map((u) => u.email);

    // 1. Always create a verified SHA-256 backup snapshot BEFORE removing any records
    const snapshot = this.createDatabaseBackupSnapshot(
      actor,
      `Pre-Cleanup Verified Snapshot (${confirmedUsers.length} confirmed test accounts)`
    );

    // 2. Remove confirmed test accounts from users
    this.db.users = (this.db.users || []).filter((u) => !isConfirmedTestOrDemoEmail(u.email));

    // 3. Remove synthetic payment claims, keys, streaks, interactions, tickets, and referrals belonging to confirmed test accounts
    const beforePay = (this.db.payment_records || []).length;
    this.db.payment_records = (this.db.payment_records || []).filter(
      (p) => !confirmedUserIds.has(p.user_id) && !isConfirmedTestOrDemoEmail(p.email) && !isConfirmedTestOrDemoEmail(p.submitted_email)
    );
    const removedPaymentsCount = beforePay - this.db.payment_records.length;

    this.db.key_records = (this.db.key_records || []).filter(
      (k) => !confirmedUserIds.has(k.user_id) && !isConfirmedTestOrDemoEmail(k.user_email)
    );
    this.db.login_history = (this.db.login_history || []).filter(
      (lh) => !confirmedUserIds.has(lh.user_id) && !isConfirmedTestOrDemoEmail(lh.email)
    );
    this.db.vip_device_logs = (this.db.vip_device_logs || []).filter(
      (dl) => !confirmedUserIds.has(dl.user_id) && !isConfirmedTestOrDemoEmail(dl.email)
    );
    this.db.platform_usage_logs = (this.db.platform_usage_logs || []).filter(
      (pl) => !confirmedUserIds.has(pl.user_id) && !isConfirmedTestOrDemoEmail(pl.user_email)
    );
    this.db.user_feedback = (this.db.user_feedback || []).filter(
      (fb) => !confirmedUserIds.has(fb.user_id) && !isConfirmedTestOrDemoEmail(fb.user_email)
    );
    this.db.exam_schedules = (this.db.exam_schedules || []).filter(
      (ex) => !(ex.scope === 'personal' && ex.user_id && confirmedUserIds.has(ex.user_id))
    );
    this.db.study_timetables = (this.db.study_timetables || []).filter(
      (tt) => !confirmedUserIds.has(tt.user_id)
    );
    this.db.student_resource_interactions = (this.db.student_resource_interactions || []).filter(
      (sri) => !confirmedUserIds.has(sri.user_id)
    );
    this.db.vip_mock_test_attempts = (this.db.vip_mock_test_attempts || []).filter(
      (att) => !confirmedUserIds.has(att.user_id) && !isConfirmedTestOrDemoEmail(att.user_email)
    );
    this.db.priority_support_tickets = (this.db.priority_support_tickets || []).filter(
      (t) => !confirmedUserIds.has(t.user_id) && !isConfirmedTestOrDemoEmail(t.user_email)
    );
    this.db.vip_referrals = (this.db.vip_referrals || []).filter(
      (ref) =>
        !confirmedUserIds.has(ref.referrer_user_id) &&
        !confirmedUserIds.has(ref.referred_user_id) &&
        !isConfirmedTestOrDemoEmail(ref.referrer_email) &&
        !isConfirmedTestOrDemoEmail(ref.referred_email)
    );
    this.db.student_notifications = (this.db.student_notifications || []).filter(
      (n) => !confirmedUserIds.has(n.user_id)
    );

    if (this.db.study_streaks) {
      for (const uid of confirmedUserIds) {
        delete this.db.study_streaks[uid];
      }
    }
    if (this.db.admin_permissions) {
      for (const uid of confirmedUserIds) {
        delete this.db.admin_permissions[uid];
      }
    }
    if (this.db.user_referral_permissions) {
      for (const uid of confirmedUserIds) {
        delete this.db.user_referral_permissions[uid];
      }
    }

    this.saveDatabase(this.db);

    if (this.supabase && confirmedUsers.length > 0) {
      const ids = Array.from(confirmedUserIds);
      this.supabase.from('app_users').delete().in('id', ids).then(() => {});
    }

    if (confirmedUsers.length > 0 || removedPaymentsCount > 0) {
      this.recordAdminAuditLog({
        admin_id: actor.id,
        admin_email: actor.email,
        admin_role: actor.role,
        action_type: 'test_account_cleanup',
        section: 'users',
        target_id: snapshot.backup_id,
        description: `Removed ${confirmedUsers.length} confirmed test/example accounts and ${removedPaymentsCount} synthetic payment claims after backup ${snapshot.backup_id}`,
        previous_value: { removed_emails: removedEmails },
        new_value: { remaining_users_count: this.db.users.length },
        status: 'success',
      });
    }

    return {
      backup_id: snapshot.backup_id,
      removed_users_count: confirmedUsers.length,
      removed_emails: removedEmails,
      removed_payments_count: removedPaymentsCount,
      remaining_users_count: this.db.users.length,
    };
  }

  // ===========================================================================
  // PART 3: SMART NOTIFICATION CENTER & VIP EXPIRY REMINDERS
  // ===========================================================================

  public getStudentNotifications(userId: string): StudentNotificationRecord[] {
    if (!Array.isArray(this.db.student_notifications)) {
      this.db.student_notifications = [];
    }
    this.evaluateAutomatedStudentNotifications(userId);
    return this.db.student_notifications
      .filter((n) => n.user_id === userId || n.user_id === 'ALL_VIP')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 60);
  }

  public addStudentNotification(
    input: Omit<StudentNotificationRecord, 'id' | 'is_read' | 'created_at'>
  ): StudentNotificationRecord {
    if (!Array.isArray(this.db.student_notifications)) {
      this.db.student_notifications = [];
    }
    const record: StudentNotificationRecord = {
      ...input,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    this.db.student_notifications.unshift(record);
    if (this.db.student_notifications.length > 1000) {
      this.db.student_notifications = this.db.student_notifications.slice(0, 1000);
    }
    this.saveDatabase(this.db);
    return record;
  }

  public markNotificationRead(userId: string, notificationId?: string): void {
    if (!Array.isArray(this.db.student_notifications)) return;
    for (const n of this.db.student_notifications) {
      if (n.user_id === userId || n.user_id === 'ALL_VIP') {
        if (!notificationId || n.id === notificationId) {
          n.is_read = true;
        }
      }
    }
    this.saveDatabase(this.db);
  }

  public clearReadNotifications(userId: string): void {
    if (!Array.isArray(this.db.student_notifications)) return;
    this.db.student_notifications = this.db.student_notifications.filter(
      (n) => !(n.user_id === userId && n.is_read)
    );
    this.saveDatabase(this.db);
  }

  private evaluateAutomatedStudentNotifications(userId: string): void {
    const user = this.getUserById(userId);
    if (!user || !user.vip_expires_at) return;
    const nowMs = Date.now();
    const expMs = new Date(user.vip_expires_at).getTime();
    const daysLeft = Math.ceil((expMs - nowMs) / (24 * 3600 * 1000));

    const thresholds = [7, 3, 1, 0];
    if (thresholds.includes(daysLeft)) {
      const tag = `vip_exp_${user.vip_expires_at.slice(0, 10)}_${daysLeft}d`;
      const exists = (this.db.student_notifications || []).some(
        (n) => n.user_id === userId && n.metadata?.dedupe_tag === tag
      );
      if (!exists) {
        this.addStudentNotification({
          user_id: userId,
          type: 'vip_expiry_reminder',
          title:
            daysLeft <= 0
              ? '⚠️ VIP Membership Expired — Grace Period Active'
              : `⏳ VIP Membership Expiring in ${daysLeft} Day${daysLeft === 1 ? '' : 's'}`,
          message:
            daysLeft <= 0
              ? 'Your VIP plan has reached its expiration date. Renew now during your 24-hour grace period to keep uninterrupted VIP access and streak progress!'
              : `Your Study Fox VIP membership expires on ${new Date(user.vip_expires_at).toLocaleDateString()}. Renew early to extend without losing any remaining days.`,
          action_tab: 'vip',
          metadata: { dedupe_tag: tag },
        });
      }
    }
  }

  // ===========================================================================
  // PART 4: COMPLETE ADMIN AUDIT LOG
  // ===========================================================================

  public recordAdminAuditLog(
    entry: Omit<AdminAuditLogRecord, 'id' | 'timestamp'>
  ): AdminAuditLogRecord {
    if (!Array.isArray(this.db.admin_audit_logs)) {
      this.db.admin_audit_logs = [];
    }
    const record: AdminAuditLogRecord = {
      ...entry,
      status: entry.status || 'success',
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    this.db.admin_audit_logs.unshift(record);
    if (this.db.admin_audit_logs.length > 2000) {
      this.db.admin_audit_logs = this.db.admin_audit_logs.slice(0, 2000);
    }
    this.saveDatabase(this.db);
    return record;
  }

  public getAdminAuditLogs(filters?: {
    admin_email?: string;
    action_type?: string;
    section?: string;
    status?: string;
    search?: string;
  }): AdminAuditLogRecord[] {
    if (!Array.isArray(this.db.admin_audit_logs)) {
      this.db.admin_audit_logs = [];
    }
    let list = this.db.admin_audit_logs.map((l) => ({
      ...l,
      status: l.status || 'success',
    }));
    if (filters?.admin_email) {
      const q = filters.admin_email.toLowerCase();
      list = list.filter((l) => l.admin_email.toLowerCase().includes(q) || l.admin_id.toLowerCase().includes(q));
    }
    if (filters?.action_type && filters.action_type !== 'all') {
      list = list.filter((l) => l.action_type === filters.action_type);
    }
    if (filters?.section && filters.section !== 'all') {
      list = list.filter((l) => l.section === filters.section);
    }
    if (filters?.status && filters.status !== 'all') {
      list = list.filter((l) => (l.status || 'success') === filters.status);
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      list = list.filter(
        (l) =>
          l.description.toLowerCase().includes(s) ||
          l.target_id.toLowerCase().includes(s) ||
          l.admin_email.toLowerCase().includes(s) ||
          l.admin_id.toLowerCase().includes(s) ||
          l.section.toLowerCase().includes(s) ||
          l.action_type.toLowerCase().includes(s)
      );
    }
    return list;
  }

  // ===========================================================================
  // PART 4: ADVANCED ADMIN ANALYTICS
  // ===========================================================================

  public getAdvancedAdminAnalytics() {
    const now = Date.now();
    const dayMs = 24 * 3600 * 1000;
    const todayStr = formatDateInTimezone(new Date(now), DEFAULT_APP_TIMEZONE);
    const weekAgoMs = now - 7 * dayMs;
    const monthAgoMs = now - 30 * dayMs;

    const users = this.db.users || [];
    const payments = this.db.payment_records || [];
    const platforms = this.db.platforms || [];
    const platformLogs = this.db.platform_usage_logs || [];
    const streaks = Object.values(this.db.study_streaks || {});
    const interactions = this.db.student_resource_interactions || [];
    const exams = this.db.exam_schedules || [];
    const mockAttempts = this.db.vip_mock_test_attempts || [];
    const featureUsage = this.db.vip_feature_usage_counts || {};

    // 1. User Analytics
    const newUsersToday = users.filter((u) => formatDateInTimezone(u.created_at, DEFAULT_APP_TIMEZONE) === todayStr).length;
    const newUsersWeek = users.filter((u) => new Date(u.created_at).getTime() >= weekAgoMs).length;
    const newUsersMonth = users.filter((u) => new Date(u.created_at).getTime() >= monthAgoMs).length;
    const blockedUsers = users.filter((u) => Boolean(u.is_blocked)).length;
    const activeUsers = users.length - blockedUsers;

    // 2. VIP Analytics
    const activeVipUsers = users.filter(
      (u) => !u.is_blocked && u.vip_active && (!u.vip_expires_at || new Date(u.vip_expires_at).getTime() > now)
    );
    const expiringSoonVips = activeVipUsers.filter(
      (u) => u.vip_expires_at && new Date(u.vip_expires_at).getTime() - now <= 7 * dayMs
    ).length;
    const expiredVips = users.filter(
      (u) => u.role === 'user' && u.vip_expires_at && new Date(u.vip_expires_at).getTime() <= now
    ).length;

    const approvedPayments = payments.filter((p) => p.status === 'completed' || p.status === 'approved');
    const pendingPayments = payments.filter((p) => p.status === 'pending' || p.status === 'pending_verification');
    const rejectedPayments = payments.filter((p) => p.status === 'rejected' || p.status === 'failed');

    const preKeyPurchases = approvedPayments.filter((p) => p.purchase_source === 'pre_key').length;
    const inAppPurchases = approvedPayments.filter((p) => p.purchase_source !== 'pre_key').length;

    // Plan popularity
    const planCounts: Record<string, { title: string; count: number; revenue: number }> = {};
    for (const p of approvedPayments) {
      const key = p.plan_title || 'Custom VIP Plan';
      if (!planCounts[key]) planCounts[key] = { title: key, count: 0, revenue: 0 };
      planCounts[key].count += 1;
      planCounts[key].revenue += Number(p.amount) || 0;
    }

    // 3. Payment Analytics
    const totalRevenue = approvedPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const todayRevenue = approvedPayments
      .filter((p) => formatDateInTimezone(p.created_at, DEFAULT_APP_TIMEZONE) === todayStr)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const monthlyRevenue = approvedPayments
      .filter((p) => new Date(p.created_at).getTime() >= monthAgoMs)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // 4. Platform Analytics
    const vipUserIds = new Set(activeVipUsers.map((u) => u.id));
    let vipPlatformOpens = 0;
    let freePlatformOpens = 0;
    for (const log of platformLogs) {
      if (vipUserIds.has(log.user_id)) vipPlatformOpens += 1;
      else freePlatformOpens += 1;
    }
    const platformSummary = this.getPlatformUsageAnalytics({ limit: 10 });

    // 5. Student Activity Analytics
    const activeStreaksCount = streaks.filter((s) => s.current_streak > 0).length;
    const sevenDayStreaksCount = streaks.filter((s) => s.longest_streak >= 7).length;
    const thirtyDayStreaksCount = streaks.filter((s) => s.longest_streak >= 30).length;
    const completedResourcesCount = interactions.filter((i) => i.is_completed).length;
    const bookmarkedResourcesCount = interactions.filter((i) => i.is_bookmarked).length;

    // 6. VIP Feature Usage Analytics
    const featureUsageList = VIP_FEATURES_DEFINITIONS.map((def) => ({
      feature_key: def.feature_key,
      name: def.name,
      is_enabled: this.isVipFeatureEffectivelyAvailable(def.feature_key),
      usage_count: featureUsage[def.feature_key] || 0,
    }));

    return {
      generated_at: new Date(now).toISOString(),
      users: {
        total: users.length,
        new_today: newUsersToday,
        new_this_week: newUsersWeek,
        new_this_month: newUsersMonth,
        active: activeUsers,
        blocked: blockedUsers,
      },
      vip: {
        active_vips: activeVipUsers.length,
        expiring_within_7_days: expiringSoonVips,
        expired_vips: expiredVips,
        pre_key_purchases: preKeyPurchases,
        in_app_purchases: inAppPurchases,
        plan_popularity: Object.values(planCounts).sort((a, b) => b.count - a.count),
      },
      payments: {
        total_approved_revenue: totalRevenue,
        today_revenue: todayRevenue,
        monthly_revenue: monthlyRevenue,
        approved_count: approvedPayments.length,
        pending_count: pendingPayments.length,
        rejected_count: rejectedPayments.length,
      },
      platforms: {
        total_platforms: platforms.length,
        total_opens: platformLogs.length,
        vip_opens: vipPlatformOpens,
        free_opens: freePlatformOpens,
        most_used: platformSummary.platforms.slice(0, 5),
        least_used: [...platformSummary.platforms].reverse().slice(0, 5),
      },
      student_activity: {
        active_streaks: activeStreaksCount,
        milestone_7_days: sevenDayStreaksCount,
        milestone_30_days: thirtyDayStreaksCount,
        total_exams_tracked: exams.length,
        completed_library_resources: completedResourcesCount,
        bookmarked_resources: bookmarkedResourcesCount,
        mock_test_attempts: mockAttempts.length,
      },
      vip_feature_usage: featureUsageList,
    };
  }

  // ===========================================================================
  // PART 4: DATA BACKUP & SAFE NON-DESTRUCTIVE RECOVERY ENGINE
  // ===========================================================================

  private ensureBackupDir(): void {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  public createDatabaseBackupSnapshot(actor: User, label?: string) {
    this.ensureBackupDir();
    const nowIso = new Date().toISOString();
    const safeTimestamp = nowIso.replace(/[:.]/g, '-');
    const backupId = `sf_backup_${safeTimestamp}`;
    const fileName = `${backupId}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);

    // Strip any raw password reset tokens while preserving all user, VIP, payment, key, streak, exam, timetable, referral, and audit records
    const dataPayload = {
      users: this.db.users,
      platforms: this.db.platforms,
      vip_batches: this.db.vip_batches,
      vip_plans: this.db.vip_plans,
      settings: this.db.settings,
      announcements: this.db.announcements,
      login_history: this.db.login_history,
      payment_records: this.db.payment_records,
      key_records: this.db.key_records,
      vip_device_logs: this.db.vip_device_logs,
      platform_usage_logs: this.db.platform_usage_logs,
      user_feedback: this.db.user_feedback,
      admin_permissions: this.db.admin_permissions || {},
      vip_feature_state: this.db.vip_feature_state || getDefaultVipFeatureManagementState(),
      study_streaks: this.db.study_streaks || {},
      exam_schedules: this.db.exam_schedules || [],
      study_timetables: this.db.study_timetables || [],
      learning_resources: this.db.learning_resources || [],
      student_resource_interactions: this.db.student_resource_interactions || [],
      vip_announcements: this.db.vip_announcements || [],
      vip_mock_tests: this.db.vip_mock_tests || [],
      vip_mock_test_attempts: this.db.vip_mock_test_attempts || [],
      priority_support_tickets: this.db.priority_support_tickets || [],
      vip_referrals: this.db.vip_referrals || [],
      student_notifications: this.db.student_notifications || [],
      admin_audit_logs: this.db.admin_audit_logs || [],
    };

    const canonicalJson = JSON.stringify(dataPayload);
    const sha256Checksum = crypto.createHash('sha256').update(canonicalJson).digest('hex');

    const envelope = {
      backup_id: backupId,
      schema_version: 'studyfox_master_v4',
      label: (label || 'Manual Super Admin Snapshot').trim().slice(0, 120),
      created_at: nowIso,
      created_by: actor.email,
      sha256_checksum: sha256Checksum,
      record_counts: {
        users: dataPayload.users.length,
        vip_plans: dataPayload.vip_plans.length,
        payment_records: dataPayload.payment_records.length,
        key_records: dataPayload.key_records.length,
        platforms: dataPayload.platforms.length,
        study_streaks: Object.keys(dataPayload.study_streaks).length,
        exam_schedules: dataPayload.exam_schedules.length,
        study_timetables: dataPayload.study_timetables.length,
        learning_resources: dataPayload.learning_resources.length,
        vip_referrals: dataPayload.vip_referrals.length,
        admin_audit_logs: dataPayload.admin_audit_logs.length,
      },
      data: dataPayload,
    };

    fs.writeFileSync(filePath, JSON.stringify(envelope, null, 2), 'utf-8');

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'backup_restore_action',
      section: 'backup_recovery',
      target_id: backupId,
      description: `Created verified database backup snapshot (${backupId}, SHA-256: ${sha256Checksum.slice(0, 12)}...)`,
      new_value: envelope.record_counts,
    });

    return {
      backup_id: backupId,
      label: envelope.label,
      created_at: nowIso,
      created_by: actor.email,
      sha256_checksum: sha256Checksum,
      size_bytes: Buffer.byteLength(JSON.stringify(envelope)),
      record_counts: envelope.record_counts,
      envelope,
    };
  }

  public listDatabaseBackups() {
    this.ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json'));
    const list = [];
    for (const file of files) {
      try {
        const fullPath = path.join(BACKUP_DIR, file);
        const stat = fs.statSync(fullPath);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.backup_id) {
          list.push({
            backup_id: parsed.backup_id,
            label: parsed.label || 'Database Snapshot',
            created_at: parsed.created_at,
            created_by: parsed.created_by || 'super_admin',
            sha256_checksum: parsed.sha256_checksum,
            size_bytes: stat.size,
            record_counts: parsed.record_counts || {},
          });
        }
      } catch {
        // Ignore malformed file
      }
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public getBackupEnvelopeById(backupId: string) {
    this.ensureBackupDir();
    const safeId = path.basename(backupId).replace(/\.json$/, '');
    const fullPath = path.join(BACKUP_DIR, `${safeId}.json`);
    if (!fs.existsSync(fullPath)) return null;
    const raw = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Safe Non-Destructive Restore:
   * 1. Verifies SHA-256 checksum integrity before touching any data.
   * 2. Merges records by ID without deleting newer valid users, payments, or keys.
   * 3. Preserves newer VIP expiration timestamps if a user renewed after the backup was taken.
   */
  public restoreFromBackupEnvelope(
    envelope: any,
    actor: User
  ): { success: boolean; restored_summary: Record<string, number>; error?: string } {
    if (!envelope || typeof envelope !== 'object' || !envelope.data) {
      return { success: false, restored_summary: {}, error: 'Invalid backup snapshot format: missing data payload.' };
    }

    // Verify SHA-256 integrity if checksum is provided
    if (envelope.sha256_checksum) {
      const computedHash = crypto.createHash('sha256').update(JSON.stringify(envelope.data)).digest('hex');
      if (computedHash !== envelope.sha256_checksum) {
        return {
          success: false,
          restored_summary: {},
          error: 'Backup Integrity Check Failed: SHA-256 checksum mismatch! Restoration aborted to protect live data.',
        };
      }
    }

    const incoming = envelope.data;
    const summary: Record<string, number> = {
      users_merged: 0,
      payments_merged: 0,
      plans_merged: 0,
      platforms_merged: 0,
      exams_merged: 0,
      resources_merged: 0,
    };

    // Safe merge users (never downgrade Super Admin or shorten a newer VIP expiry)
    if (Array.isArray(incoming.users)) {
      for (const incUser of incoming.users) {
        if (!incUser || !incUser.id || !incUser.email) continue;
        const existing = this.getUserById(incUser.id) || this.getUserByEmail(incUser.email);
        if (!existing) {
          this.db.users.push(incUser);
          summary.users_merged += 1;
        } else {
          // Keep newer VIP expiry so valid newer renewals are never overwritten
          const curExp = existing.vip_expires_at ? new Date(existing.vip_expires_at).getTime() : 0;
          const incExp = incUser.vip_expires_at ? new Date(incUser.vip_expires_at).getTime() : 0;
          if (incExp > curExp) {
            existing.vip_expires_at = incUser.vip_expires_at;
            existing.vip_active = Boolean(incUser.vip_active);
            summary.users_merged += 1;
          }
        }
      }
    }

    // Safe merge payment_records
    if (Array.isArray(incoming.payment_records)) {
      const existingIds = new Set(this.db.payment_records.map((p) => p.id));
      for (const p of incoming.payment_records) {
        if (p && p.id && !existingIds.has(p.id)) {
          this.db.payment_records.push(p);
          summary.payments_merged += 1;
        }
      }
    }

    // Safe merge vip_plans
    if (Array.isArray(incoming.vip_plans)) {
      const existingIds = new Set(this.db.vip_plans.map((p) => p.id));
      for (const pl of incoming.vip_plans) {
        if (pl && pl.id && !existingIds.has(pl.id)) {
          this.db.vip_plans.push(pl);
          summary.plans_merged += 1;
        }
      }
    }

    // Safe merge platforms
    if (Array.isArray(incoming.platforms)) {
      const existingIds = new Set(this.db.platforms.map((p) => p.id));
      for (const plat of incoming.platforms) {
        if (plat && plat.id && !existingIds.has(plat.id)) {
          this.db.platforms.push(plat);
          summary.platforms_merged += 1;
        }
      }
    }

    // Safe merge exam_schedules
    if (Array.isArray(incoming.exam_schedules)) {
      if (!Array.isArray(this.db.exam_schedules)) this.db.exam_schedules = [];
      const existingIds = new Set(this.db.exam_schedules.map((e) => e.id));
      for (const ex of incoming.exam_schedules) {
        if (ex && ex.id && !existingIds.has(ex.id)) {
          this.db.exam_schedules.push(ex);
          summary.exams_merged += 1;
        }
      }
    }

    // Safe merge learning_resources
    if (Array.isArray(incoming.learning_resources)) {
      if (!Array.isArray(this.db.learning_resources)) this.db.learning_resources = [];
      const existingIds = new Set(this.db.learning_resources.map((r) => r.id));
      for (const res of incoming.learning_resources) {
        if (res && res.id && !existingIds.has(res.id)) {
          this.db.learning_resources.push(res);
          summary.resources_merged += 1;
        }
      }
    }

    this.saveDatabase(this.db);

    this.recordAdminAuditLog({
      admin_id: actor.id,
      admin_email: actor.email,
      admin_role: actor.role,
      action_type: 'backup_restore_action',
      section: 'backup_recovery',
      target_id: envelope.backup_id || 'uploaded_backup',
      description: `Executed safe non-destructive restore from snapshot ${envelope.backup_id || 'uploaded_backup'}`,
      new_value: summary,
    });

    return { success: true, restored_summary: summary };
  }

  public getPlatformLogsForStudent(userId: string, limit = 25) {
    const logs = (this.db.platform_usage_logs || []).filter((l) => l.user_id === userId).slice(0, limit);
    const platforms = this.getPlatforms(false);
    const platMap = new Map(platforms.map((p) => [p.id, p]));
    return logs.map((l) => {
      const p = platMap.get(l.platform_id);
      return {
        id: l.id,
        platform_id: l.platform_id,
        platform_name: p?.name || 'Study Platform',
        category: p?.category || 'General',
        opened_at: l.opened_at,
      };
    });
  }

  // ==========================================================
  // STUDENT GROWTH FEATURES:
  // 1. Exam Timer
  // 2. Offer Board (Photo Banners)
  // 3. 30-Day Daily Motivation
  // 4. Daily Login XP + Top 10 Leaderboard
  // 5. Study Session Logs + Sunday Parents Report Card
  // ==========================================================

  private getIstWeekRange(nowDate = new Date()): {
    todayIst: string;
    weekStartIst: string;
    weekEndIst: string;
    isSundayIst: boolean;
    nextSundayIst: string;
    weekKey: string;
  } {
    const todayIst = formatDateInTimezone(nowDate, DEFAULT_APP_TIMEZONE);
    const [y, m, d] = todayIst.split('-').map((n) => parseInt(n, 10));
    const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const isSundayIst = utcDay === 0;
    // Week window: Monday .. Sunday containing todayIst
    const daysSinceMonday = utcDay === 0 ? 6 : utcDay - 1;
    const weekStartIst = shiftCalendarDate(todayIst, -daysSinceMonday);
    const weekEndIst = shiftCalendarDate(weekStartIst, 6);
    const nextSundayIst = isSundayIst ? todayIst : weekEndIst;
    return {
      todayIst,
      weekStartIst,
      weekEndIst,
      isSundayIst,
      nextSundayIst,
      weekKey: weekStartIst,
    };
  }

  // --- 1. Student Personal Exam Timer ---
  public getStudentExamTimer(userId: string): StudentExamTimer | null {
    if (!this.db.student_exam_timers || typeof this.db.student_exam_timers !== 'object') {
      this.db.student_exam_timers = {};
    }
    return this.db.student_exam_timers[userId] || null;
  }

  public setStudentExamTimer(userId: string, examName: string, examDatetime: string): StudentExamTimer {
    if (!this.db.student_exam_timers || typeof this.db.student_exam_timers !== 'object') {
      this.db.student_exam_timers = {};
    }
    const cleanName = String(examName || '').trim().slice(0, 80);
    const parsedDate = new Date(examDatetime);
    if (!cleanName) {
      throw new Error('Please enter your Exam or Paper name.');
    }
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Please choose a valid Exam date and time.');
    }
    const record: StudentExamTimer = {
      user_id: userId,
      exam_name: cleanName,
      exam_datetime: parsedDate.toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.db.student_exam_timers[userId] = record;
    this.saveDatabase(this.db);
    return record;
  }

  // --- 2. Offer Board (Admin Uploaded Photo Banners) ---
  public getOfferBoard(onlyActive = false): OfferBoardItem[] {
    const list = Array.isArray(this.db.offer_board) ? this.db.offer_board : [];
    const filtered = onlyActive ? list.filter((item) => item && item.is_active) : list;
    return [...filtered].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  }

  public saveOfferBoard(items: Partial<OfferBoardItem>[]): OfferBoardItem[] {
    const now = new Date().toISOString();
    const normalized: OfferBoardItem[] = (Array.isArray(items) ? items : [])
      .map((item, idx) => ({
        id: item.id && String(item.id).trim() ? String(item.id).trim() : crypto.randomUUID(),
        title: String(item.title || '').trim().slice(0, 120) || 'Special Offer',
        subtitle: String(item.subtitle || '').trim().slice(0, 240),
        image_url: String(item.image_url || '').trim(),
        link_url: String(item.link_url || '').trim(),
        is_active: item.is_active !== false,
        display_order: typeof item.display_order === 'number' ? item.display_order : idx + 1,
        created_at: item.created_at || now,
        updated_at: now,
      }))
      .filter((item) => Boolean(item.image_url || item.title));

    this.db.offer_board = normalized;
    this.saveDatabase(this.db);
    return normalized;
  }

  // --- 3. 30-Day Daily Motivation ---
  public getDailyMotivations(): DailyMotivationItem[] {
    const defaults = getDefault30DayMotivations();
    const stored = Array.isArray(this.db.daily_motivations) ? this.db.daily_motivations : [];
    const byDay = new Map<number, DailyMotivationItem>();
    for (const d of defaults) {
      byDay.set(d.day_number, d);
    }
    for (const s of stored) {
      const dayNum = Number(s?.day_number);
      if (dayNum >= 1 && dayNum <= 30) {
        byDay.set(dayNum, {
          day_number: dayNum,
          quote: String(s.quote || '').trim() || byDay.get(dayNum)?.quote || '',
          author: String(s.author || '').trim(),
          image_url: String(s.image_url || '').trim(),
          updated_at: s.updated_at || new Date().toISOString(),
        });
      }
    }
    return Array.from({ length: 30 }, (_, idx) => byDay.get(idx + 1)!);
  }

  public saveDailyMotivations(items: Partial<DailyMotivationItem>[]): DailyMotivationItem[] {
    const existing = this.getDailyMotivations();
    const byDay = new Map<number, DailyMotivationItem>(existing.map((m) => [m.day_number, m]));
    const now = new Date().toISOString();

    for (const raw of Array.isArray(items) ? items : []) {
      const dayNum = Math.floor(Number(raw?.day_number));
      if (dayNum >= 1 && dayNum <= 30) {
        const prev = byDay.get(dayNum)!;
        byDay.set(dayNum, {
          day_number: dayNum,
          quote: raw.quote !== undefined ? String(raw.quote).trim() : prev.quote,
          author: raw.author !== undefined ? String(raw.author).trim() : prev.author || '',
          image_url: raw.image_url !== undefined ? String(raw.image_url).trim() : prev.image_url || '',
          updated_at: now,
        });
      }
    }

    const result = Array.from({ length: 30 }, (_, idx) => byDay.get(idx + 1)!);
    this.db.daily_motivations = result;
    this.saveDatabase(this.db);
    return result;
  }

  public getTodayDailyMotivation(): { item: DailyMotivationItem; today_ist: string; day_number: number } {
    const todayIst = formatDateInTimezone(new Date(), DEFAULT_APP_TIMEZONE);
    const [y, m, d] = todayIst.split('-').map((n) => parseInt(n, 10));
    const daysSinceEpoch = Math.floor(Date.UTC(y, m - 1, d) / (24 * 60 * 60 * 1000));
    const dayNumber = (((daysSinceEpoch % 30) + 30) % 30) + 1; // 1..30 rotating daily at IST midnight
    const list = this.getDailyMotivations();
    const item = list[dayNumber - 1] || list[0];
    return {
      item,
      today_ist: todayIst,
      day_number: dayNumber,
    };
  }

  // --- 4. Daily Login XP System + Top 10 Leaderboard ---
  private ensureXpRecord(userId: string): StudentXpRecord {
    if (!this.db.student_xp || typeof this.db.student_xp !== 'object') {
      this.db.student_xp = {};
    }
    const { weekKey } = this.getIstWeekRange();
    const existing = this.db.student_xp[userId];
    if (existing) {
      if (existing.weekly_key !== weekKey) {
        existing.weekly_xp = 0;
        existing.weekly_key = weekKey;
      }
      return existing;
    }
    const created: StudentXpRecord = {
      user_id: userId,
      xp_total: 0,
      weekly_xp: 0,
      weekly_key: weekKey,
      daily_streak: 0,
      last_login_date: null,
      total_login_days: 0,
      updated_at: new Date().toISOString(),
    };
    this.db.student_xp[userId] = created;
    return created;
  }

  public awardDailyLoginXp(userId: string): {
    awarded: boolean;
    xp_awarded: number;
    record: StudentXpRecord;
  } {
    const user = this.getUserById(userId);
    if (!user) {
      return {
        awarded: false,
        xp_awarded: 0,
        record: {
          user_id: userId,
          xp_total: 0,
          weekly_xp: 0,
          weekly_key: this.getIstWeekRange().weekKey,
          daily_streak: 0,
          last_login_date: null,
          total_login_days: 0,
          updated_at: new Date().toISOString(),
        },
      };
    }

    const { todayIst, weekKey } = this.getIstWeekRange();
    const rec = this.ensureXpRecord(userId);
    if (rec.last_login_date === todayIst) {
      return { awarded: false, xp_awarded: 0, record: rec };
    }

    const yesterdayIst = shiftCalendarDate(todayIst, -1);
    const isConsecutive = rec.last_login_date === yesterdayIst;
    const nextStreak = isConsecutive ? rec.daily_streak + 1 : 1;
    const baseXp = 50;
    const streakBonus = Math.min(nextStreak - 1, 7) * 10; // up to +70 bonus XP for 7+ day streak
    const earned = baseXp + streakBonus;

    rec.xp_total += earned;
    rec.weekly_xp = (rec.weekly_key === weekKey ? rec.weekly_xp : 0) + earned;
    rec.weekly_key = weekKey;
    rec.daily_streak = nextStreak;
    rec.last_login_date = todayIst;
    rec.total_login_days += 1;
    rec.updated_at = new Date().toISOString();

    this.db.student_xp![userId] = rec;
    this.saveDatabase(this.db);
    return { awarded: true, xp_awarded: earned, record: rec };
  }

  public awardBonusXp(userId: string, points: number): StudentXpRecord {
    const safePoints = Math.max(0, Math.min(500, Math.round(points)));
    const { weekKey } = this.getIstWeekRange();
    const rec = this.ensureXpRecord(userId);
    if (safePoints > 0) {
      rec.xp_total += safePoints;
      rec.weekly_xp = (rec.weekly_key === weekKey ? rec.weekly_xp : 0) + safePoints;
      rec.weekly_key = weekKey;
      rec.updated_at = new Date().toISOString();
      this.db.student_xp![userId] = rec;
      this.saveDatabase(this.db);
    }
    return rec;
  }

  private getSafeStudentDisplayName(user: User): string {
    const cleanName = String(user.name || '').trim();
    if (cleanName) return cleanName;
    const emailPrefix = String(user.email || '').split('@')[0] || 'Student';
    const prettified = emailPrefix
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!prettified) return 'Student';
    return prettified
      .split(' ')
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
      .join(' ')
      .slice(0, 26);
  }

  public getXpLeaderboard(currentUserId?: string): LeaderboardResponse {
    const { todayIst } = this.getIstWeekRange();
    let awardedNow = 0;
    if (currentUserId) {
      const awardRes = this.awardDailyLoginXp(currentUserId);
      if (awardRes.awarded) awardedNow = awardRes.xp_awarded;
    }

    const xpMap = this.db.student_xp && typeof this.db.student_xp === 'object' ? this.db.student_xp : {};
    const validUsers = (this.db.users || []).filter((u) => !u.is_blocked);

    const rankedAll: LeaderboardEntry[] = validUsers
      .map((u) => {
        const rec = xpMap[u.id];
        const xpTotal = rec ? Number(rec.xp_total || 0) : 0;
        const streak = rec ? Number(rec.daily_streak || 0) : 0;
        const loginDays = rec ? Number(rec.total_login_days || 0) : 0;
        const vipValid =
          Boolean(u.vip_active) &&
          (!u.vip_expires_at || new Date(u.vip_expires_at).getTime() > Date.now());
        return {
          rank: 0,
          user_id: u.id,
          display_name: this.getSafeStudentDisplayName(u),
          xp_total: xpTotal,
          daily_streak: streak,
          total_login_days: loginDays,
          is_vip: vipValid,
          is_me: currentUserId ? u.id === currentUserId : false,
        };
      })
      .filter((entry) => entry.xp_total > 0 || entry.is_me)
      .sort((a, b) => {
        if (b.xp_total !== a.xp_total) return b.xp_total - a.xp_total;
        if (b.daily_streak !== a.daily_streak) return b.daily_streak - a.daily_streak;
        return a.display_name.localeCompare(b.display_name);
      });

    rankedAll.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    const myEntry = currentUserId ? rankedAll.find((e) => e.user_id === currentUserId) || null : null;
    const myRec = currentUserId ? xpMap[currentUserId] : undefined;

    return {
      top_students: rankedAll.slice(0, 10),
      my_rank: myEntry ? myEntry.rank : null,
      my_xp: myRec ? Number(myRec.xp_total || 0) : 0,
      my_streak: myRec ? Number(myRec.daily_streak || 0) : 0,
      daily_xp_claimed_today: Boolean(myRec && myRec.last_login_date === todayIst),
      daily_xp_awarded_now: awardedNow > 0 ? awardedNow : undefined,
      total_ranked_students: rankedAll.length,
      today_ist: todayIst,
    };
  }

  // --- 5. Study Session Logging & Sunday Parents Report Card ---
  public logStudyMinutes(
    userId: string,
    minutes: number,
    source: 'timer' | 'manual' | 'platform' = 'manual',
    note = ''
  ): { log: StudentStudyLog; xp_earned: number } {
    const cleanMinutes = Math.max(1, Math.min(720, Math.round(Number(minutes) || 0)));
    const nowIso = new Date().toISOString();
    const todayIst = formatDateInTimezone(nowIso, DEFAULT_APP_TIMEZONE);
    if (!Array.isArray(this.db.student_study_logs)) {
      this.db.student_study_logs = [];
    }
    const log: StudentStudyLog = {
      id: crypto.randomUUID(),
      user_id: userId,
      minutes: cleanMinutes,
      source,
      note: String(note || '').trim().slice(0, 140),
      logged_at: nowIso,
      date_ist: todayIst,
    };
    this.db.student_study_logs.unshift(log);
    if (this.db.student_study_logs.length > 5000) {
      this.db.student_study_logs = this.db.student_study_logs.slice(0, 5000);
    }
    const xpEarned = Math.min(120, Math.max(5, Math.round(cleanMinutes * 1.5)));
    this.awardBonusXp(userId, xpEarned);
    this.saveDatabase(this.db);
    return { log, xp_earned: xpEarned };
  }

  public saveParentReportSettings(
    userId: string,
    updates: {
      parent_name?: string;
      parent_whatsapp?: string;
      parent_email?: string;
      auto_sunday_enabled?: boolean;
    }
  ): ParentReportSettings {
    if (!this.db.parent_report_settings || typeof this.db.parent_report_settings !== 'object') {
      this.db.parent_report_settings = {};
    }
    const prev = this.db.parent_report_settings[userId] || {
      user_id: userId,
      parent_name: '',
      parent_whatsapp: '',
      parent_email: '',
      auto_sunday_enabled: true,
      updated_at: new Date().toISOString(),
    };

    const next: ParentReportSettings = {
      user_id: userId,
      parent_name:
        updates.parent_name !== undefined ? String(updates.parent_name).trim().slice(0, 80) : prev.parent_name,
      parent_whatsapp:
        updates.parent_whatsapp !== undefined
          ? String(updates.parent_whatsapp).replace(/[^\d+]/g, '').slice(0, 18)
          : prev.parent_whatsapp,
      parent_email:
        updates.parent_email !== undefined ? String(updates.parent_email).trim().slice(0, 120) : prev.parent_email || '',
      auto_sunday_enabled:
        updates.auto_sunday_enabled !== undefined ? Boolean(updates.auto_sunday_enabled) : prev.auto_sunday_enabled,
      updated_at: new Date().toISOString(),
    };
    this.db.parent_report_settings[userId] = next;
    this.saveDatabase(this.db);
    return next;
  }

  public getParentsReportCard(userId: string): ParentsReportCardData {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    const { weekStartIst, weekEndIst, isSundayIst, nextSundayIst } = this.getIstWeekRange();
    const leaderboard = this.getXpLeaderboard(userId);
    const xpRec = this.ensureXpRecord(userId);

    // 1. Weekly Study Hours (from real student_study_logs + platform study activity fallback)
    const allUserLogs = (this.db.student_study_logs || []).filter((l) => l.user_id === userId);
    const weekLogs = allUserLogs.filter((l) => l.date_ist >= weekStartIst && l.date_ist <= weekEndIst);
    const loggedMinutes = weekLogs.reduce((sum, l) => sum + Number(l.minutes || 0), 0);

    // Count platform study sessions this week (each unique platform open adds 15 min if not manually logged)
    const weekPlatformOpens = (this.db.platform_usage_logs || []).filter((l) => {
      if (l.user_id !== userId) return false;
      const dIst = formatDateInTimezone(l.opened_at, DEFAULT_APP_TIMEZONE);
      return dIst >= weekStartIst && dIst <= weekEndIst;
    }).length;
    const totalMinutes = loggedMinutes + (loggedMinutes === 0 ? weekPlatformOpens * 15 : 0);
    const studyHoursWeek = Math.round((totalMinutes / 60) * 10) / 10;

    // 2. Weekly Quizzes Taken & Marks (from real vip_mock_test_attempts)
    const weekAttempts = (this.db.vip_mock_test_attempts || []).filter((att) => {
      if (att.user_id !== userId) return false;
      const dIst = formatDateInTimezone(att.completed_at, DEFAULT_APP_TIMEZONE);
      return dIst >= weekStartIst && dIst <= weekEndIst;
    });
    const quizzesTakenWeek = weekAttempts.length;
    const quizMarksObtained = weekAttempts.reduce((sum, a) => sum + Number(a.score || 0), 0);
    const quizTotalMarks = weekAttempts.reduce((sum, a) => sum + Number(a.total_questions || 0), 0);
    const quizAvgPercentage =
      quizTotalMarks > 0
        ? Math.round((quizMarksObtained / quizTotalMarks) * 100)
        : quizzesTakenWeek > 0
        ? Math.round(weekAttempts.reduce((s, a) => s + Number(a.percentage || 0), 0) / quizzesTakenWeek)
        : 0;

    // 3. Parent Settings
    const parentSettings: ParentReportSettings =
      (this.db.parent_report_settings && this.db.parent_report_settings[userId]) || {
        user_id: userId,
        parent_name: '',
        parent_whatsapp: '',
        parent_email: '',
        auto_sunday_enabled: true,
        updated_at: new Date().toISOString(),
      };

    const studentName = this.getSafeStudentDisplayName(user);
    const rankLabel = leaderboard.my_rank
      ? `#${leaderboard.my_rank} / ${leaderboard.total_ranked_students}`
      : 'Unranked';
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const padhaiFormatted = hrs > 0 ? `${hrs} Ghante ${mins} Min` : `${mins} Min`;
    const quizFormatted =
      quizzesTakenWeek > 0
        ? `${quizzesTakenWeek} Quiz (${quizMarksObtained}/${quizTotalMarks} Marks • ${quizAvgPercentage}%)`
        : '0 Quiz attempted this week';

    const greeting = parentSettings.parent_name
      ? `Namaste ${parentSettings.parent_name} Ji,`
      : 'Namaste Parents,';

    const shareText = [
      `📊 *STUDY BLUNDER — Sunday Parents Report Card*`,
      `${greeting}`,
      ``,
      `👨‍🎓 *Student:* ${studentName}`,
      `📅 *Week:* ${weekStartIst} to ${weekEndIst}`,
      ``,
      `⏱️ *Padhai (Study Time):* ${padhaiFormatted}`,
      `📝 *Quiz Performance:* ${quizFormatted}`,
      `🏆 *Leaderboard Rank:* ${rankLabel} (${xpRec.xp_total} Total XP • ${xpRec.daily_streak} Day Streak)`,
      ``,
      `— Sent via STUDY BLUNDER Student App`,
    ].join('\n');

    const digitsOnly = parentSettings.parent_whatsapp.replace(/[^\d]/g, '');
    const waPhone = digitsOnly.length === 10 ? `91${digitsOnly}` : digitsOnly;
    const whatsappUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(shareText)}`
      : `https://wa.me/?text=${encodeURIComponent(shareText)}`;

    return {
      student_name: studentName,
      student_email: user.email,
      week_start_ist: weekStartIst,
      week_end_ist: weekEndIst,
      is_sunday_ist: isSundayIst,
      next_sunday_ist: nextSundayIst,
      study_minutes_week: totalMinutes,
      study_hours_week: studyHoursWeek,
      study_sessions_count: weekLogs.length + (loggedMinutes === 0 ? weekPlatformOpens : 0),
      quizzes_taken_week: quizzesTakenWeek,
      quiz_marks_obtained: quizMarksObtained,
      quiz_total_marks: quizTotalMarks,
      quiz_avg_percentage: quizAvgPercentage,
      leaderboard_rank: leaderboard.my_rank,
      total_ranked_students: leaderboard.total_ranked_students,
      total_xp: xpRec.xp_total,
      weekly_xp: xpRec.weekly_xp,
      daily_streak: xpRec.daily_streak,
      parent_settings: parentSettings,
      recent_study_logs: weekLogs.slice(0, 10),
      share_text: shareText,
      whatsapp_url: whatsappUrl,
    };
  }
}

