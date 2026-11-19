import type {
  UserProfile,
  Platform,
  VipBatch,
  VipPlan,
  PublicSettings,
  AdminSettings,
  Announcement,
  LoginHistoryEntry,
  PaymentRecord,
  KeyRecord,
  VipDeviceLog,
  DashboardStats,
  CleanupOperationType,
  CleanupPreviewResponse,
  PlatformUsageLog,
  PlatformLogsSummaryResponse,
  PlatformUsageHistoryResponse,
  FestivalDecorationConfig,
  ActiveFestivalResponse,
  AdminFestivalManagerResponse,
  FeedbackCategory,
  FeedbackStatus,
  UserFeedbackRecord,
  AdminSectionKey,
  AdminSectionDefinition,
  AdminSectionPermissionRecord,
  AdminPermissionHistoryEntry,
  VipFeatureKey,
  VipFeatureConfig,
  VipFeatureManagementState,
  StudyStreakState,
  ExamRecord,
  LearningLibraryResource,
  VipExclusiveAnnouncement,
  StudyTimetableItem,
  VipMockTest,
  VipMockTestAttempt,
  PrioritySupportTicket,
  ReferralRecord,
  SmartNotification,
  AdminAuditLogEntry,
  DatabaseBackupSnapshot,
  AdvancedAdminAnalyticsResponse,
  VipStudentHubData,
  ReferralDiscountConfig,
  UserReferralPermissions,
  ReferrerSalesSummaryReport,
  ReferralPricePreview,
  AdminReferralManagementResponse,
} from './types.ts';

const TOKEN_KEY = 'edu_portal_token';
const DEVICE_ID_KEY = 'edu_portal_device_id';
const DEVICE_COOKIE_KEY = 'sf_device_id';

function readDeviceIdCookie(): string | null {
  try {
    if (typeof document === 'undefined' || !document.cookie) return null;
    const parts = document.cookie.split(';');
    for (const part of parts) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (rawKey === DEVICE_COOKIE_KEY && rest.length > 0) {
        const val = decodeURIComponent(rest.join('=')).trim();
        if (val.length >= 12) return val;
      }
    }
  } catch {
    // Ignore cookie read error
  }
  return null;
}

function persistDeviceIdEverywhere(deviceId: string): void {
  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    // Ignore localStorage quota/privacy error
  }
  try {
    sessionStorage.setItem(DEVICE_ID_KEY, deviceId);
  } catch {
    // Ignore sessionStorage error
  }
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${DEVICE_COOKIE_KEY}=${encodeURIComponent(deviceId)}; max-age=31536000; path=/; SameSite=Lax`;
    }
  } catch {
    // Ignore cookie write error
  }
}

function computeBrowserHardwarePrefix(): string {
  try {
    const raw = [
      typeof navigator !== 'undefined' ? navigator.userAgent || '' : '',
      typeof navigator !== 'undefined' ? navigator.language || '' : '',
      typeof screen !== 'undefined' ? `${screen.width}x${screen.height}x${screen.colorDepth}` : '',
      typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '',
    ].join('|');
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  } catch {
    return '00000000';
  }
}

export function getOrCreateDeviceId(): string {
  try {
    let deviceId =
      localStorage.getItem(DEVICE_ID_KEY) ||
      sessionStorage.getItem(DEVICE_ID_KEY) ||
      readDeviceIdCookie();
    if (!deviceId || deviceId.trim().length < 12) {
      const fpHex = computeBrowserHardwarePrefix();
      const rand =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
          : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      deviceId = `sf_fp_${fpHex}_${rand}`;
    }
    persistDeviceIdEverywhere(deviceId);
    return deviceId;
  } catch {
    return 'dev_fallback_browser_client';
  }
}

export function getClientDeviceLabel(): string {
  try {
    const ua = navigator.userAgent || '';
    let os = 'Desktop/Mobile';
    if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    let browser = 'Browser';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = 'Chrome';
    else if (/firefox\//i.test(ua)) browser = 'Firefox';
    else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';

    return `${browser} on ${os}`;
  } catch {
    return 'Web Browser';
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function getAuthHeaders(): HeadersInit {
  const token = getStoredToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'X-Device-Id': getOrCreateDeviceId(),
    'X-Device-Label': getClientDeviceLabel(),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  return fetch(input, init);
}

export const api = {
  // Public
  async getSettings(): Promise<PublicSettings> {
    const res = await apiFetch('/api/settings');
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  async getPlatforms(): Promise<Platform[]> {
    const res = await apiFetch('/api/platforms');
    if (!res.ok) throw new Error('Failed to fetch platforms');
    const data = await res.json();
    return data.platforms;
  },

  async getPlatformAccess(
    id: string,
    clickId?: string
  ): Promise<{
    allowed: boolean;
    redirect_url?: string;
    reason?: string;
    code?: string;
    bound_device_label?: string;
    bound_at?: string;
    error?: string;
    access_type: 'normal' | 'vip';
    vip_redirect_url?: string;
    vip_purchase_url?: string;
  }> {
    const qs = clickId ? `?click_id=${encodeURIComponent(clickId)}` : '';
    const res = await apiFetch(`/api/platforms/${encodeURIComponent(id)}/access${qs}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (res.status === 403 && (data.code === 'VIP_DEVICE_MISMATCH' || data.reason === 'vip_device_mismatch')) {
      return data;
    }
    if (!res.ok) {
      throw new Error(data.error || 'Failed to verify platform access');
    }
    return data;
  },

  async recordPlatformOpen(
    id: string,
    clickId?: string
  ): Promise<{ success: boolean; deduplicated?: boolean; log?: PlatformUsageLog }> {
    try {
      const res = await apiFetch(
        `/api/platforms/${encodeURIComponent(id)}/open`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ click_id: clickId }),
        },
        0
      );
      if (!res.ok) return { success: false };
      return res.json();
    } catch {
      return { success: false };
    }
  },

  async verifyVipDevice(): Promise<{
    allowed: boolean;
    status: 'bound_current' | 'bound_other' | 'unbound' | 'not_vip';
    code?: string;
    bound_device_label?: string;
    bound_at?: string;
    error?: string;
    user?: UserProfile;
  }> {
    const res = await apiFetch('/api/vip/verify-device', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        device_id: getOrCreateDeviceId(),
        device_label: getClientDeviceLabel(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 && data.code === 'VIP_DEVICE_MISMATCH') {
      return {
        allowed: false,
        status: 'bound_other',
        code: data.code,
        bound_device_label: data.bound_device_label,
        bound_at: data.bound_at,
        error: data.error,
        user: data.user,
      };
    }
    if (!res.ok) {
      throw new Error(data.error || 'Failed to verify VIP device authorization');
    }
    return data;
  },

  async getVipBatches(): Promise<VipBatch[]> {
    const res = await apiFetch('/api/vip/batches');
    if (!res.ok) throw new Error('Failed to fetch batches');
    const data = await res.json();
    return data.batches;
  },

  async getVipPlans(): Promise<VipPlan[]> {
    const res = await apiFetch('/api/vip/plans');
    if (!res.ok) throw new Error('Failed to fetch plans');
    const data = await res.json();
    return data.plans;
  },

  async getMyVipPayments(): Promise<PaymentRecord[]> {
    const res = await apiFetch('/api/vip/my-payments', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to fetch your payment verification claims');
    return data.payments || [];
  },

  async submitVipPaymentClaim(payload: {
    submitted_email: string;
    amount: number;
    plan_id?: string;
    plan_title?: string;
    expected_plan_price?: number;
    transaction_reference?: string;
    screenshot_data_url: string;
    screenshot_mime_type?: string;
    purchase_source?: 'pre_key' | 'in_app';
  }): Promise<{ success: boolean; payment: PaymentRecord; message: string }> {
    const res = await apiFetch('/api/vip/payment-claims', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to submit payment verification claim') as Error & {
        code?: string;
        updated_price?: number;
        plan?: VipPlan;
        pending_payment?: PaymentRecord;
      };
      if (data.code) err.code = data.code;
      if (typeof data.updated_price === 'number') err.updated_price = data.updated_price;
      if (data.plan) err.plan = data.plan;
      if (data.pending_payment) err.pending_payment = data.pending_payment;
      throw err;
    }
    return data;
  },

  async getAnnouncements(): Promise<Announcement[]> {
    const res = await apiFetch('/api/announcements');
    if (!res.ok) throw new Error('Failed to fetch announcements');
    const data = await res.json();
    return data.announcements;
  },

  // Auth
  async login(
    email: string,
    password: string,
    referralCode?: string
  ): Promise<{
    token: string;
    user: UserProfile;
    vip_device_warning?: string;
    referral_attribution?: { applied: boolean; message: string };
  }> {
    const cleanRef = referralCode ? referralCode.trim().toUpperCase() : undefined;
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': getOrCreateDeviceId(),
        'X-Device-Label': getClientDeviceLabel(),
      },
      body: JSON.stringify({
        email,
        password,
        referral_code: cleanRef || undefined,
        device_id: getOrCreateDeviceId(),
        device_label: getClientDeviceLabel(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to login');
    setStoredToken(data.token);
    return data;
  },

  async adminLogin(email: string, password: string): Promise<{ token: string; user: UserProfile }> {
    const res = await apiFetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to authenticate administrator');
    setStoredToken(data.token);
    return data;
  },

  async register(
    email: string,
    password: string,
    referralCode?: string
  ): Promise<{
    token: string;
    user: UserProfile;
    referral_attribution?: { applied: boolean; message: string };
  }> {
    const cleanRef = referralCode ? referralCode.trim().toUpperCase() : undefined;
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': getOrCreateDeviceId(),
        'X-Device-Label': getClientDeviceLabel(),
      },
      body: JSON.stringify({
        email,
        password,
        referral_code: cleanRef || undefined,
        device_id: getOrCreateDeviceId(),
        device_label: getClientDeviceLabel(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to register');
    setStoredToken(data.token);
    return data;
  },

  async forgotPassword(email: string): Promise<{
    success: boolean;
    registered?: boolean;
    email_sent?: boolean;
    reset_link?: string;
    expires_at?: string;
    message: string;
  }> {
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to initiate password recovery');
    return data;
  },

  async resetPassword(payload: {
    token?: string;
    access_token?: string;
    new_password: string;
    confirm_password: string;
  }): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to reset password');
    return data;
  },

  async getMe(): Promise<UserProfile> {
    const res = await apiFetch('/api/auth/me', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Session expired') as Error & { code?: string };
      if (data.code) err.code = data.code;
      throw err;
    }
    return data.user;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch {
      // Ignore network errors during logout
    } finally {
      removeStoredToken();
    }
  },

  // User Feedback (VIP & Non-VIP Students)
  async getMyFeedback(): Promise<UserFeedbackRecord[]> {
    const res = await apiFetch('/api/feedback/my', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load your feedback history');
    return data.feedback || [];
  },

  async submitFeedback(payload: {
    category: FeedbackCategory;
    rating: number;
    message: string;
    attachment_data_url?: string;
    attachment_mime_type?: string;
  }): Promise<{ success: boolean; feedback: UserFeedbackRecord; message: string }> {
    const res = await apiFetch('/api/feedback', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to submit feedback');
    return data;
  },

  async triggerKeyGeneration(): Promise<{
    pending: boolean;
    flow_id?: string;
    verification_token?: string;
    target_url: string;
    callback_url: string;
    started_at?: string;
    earliest_key_at?: string;
    min_wait_seconds?: number;
    expires_at: string;
    message?: string;
    shortener_url?: string;
  }> {
    const res = await apiFetch('/api/key/generate', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Key generation failed');
    return data;
  },

  async getKeyFlowStatus(flowId?: string): Promise<{
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
    const q = flowId ? `?flow_id=${encodeURIComponent(flowId)}` : '';
    const res = await apiFetch(`/api/key/flow-status${q}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to check key flow status');
    return data;
  },

  async claimGeneratedKey(flowId?: string): Promise<{
    success: boolean;
    key: string;
    generated_at?: string;
    expires_at?: string;
    message?: string;
  }> {
    const res = await apiFetch('/api/key/get-key', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ flow_id: flowId || '' }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to generate access key') as Error & {
        code?: string;
        started_at?: string;
        earliest_key_at?: string;
        min_wait_seconds?: number;
        elapsed_seconds?: number;
        remaining_seconds?: number;
      };
      err.code = data.code;
      err.started_at = data.started_at;
      err.earliest_key_at = data.earliest_key_at;
      err.min_wait_seconds = data.min_wait_seconds;
      err.elapsed_seconds = data.elapsed_seconds;
      err.remaining_seconds = data.remaining_seconds;
      throw err;
    }
    return data;
  },

  async verifyKey(key: string): Promise<{
    success: boolean;
    key_record: KeyRecord;
    user: UserProfile;
    verified_at?: string;
    expires_at?: string;
    message: string;
  }> {
    const res = await apiFetch('/api/key/verify', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ key, token: key }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Invalid or expired key. Please generate a new key.');
    }
    return data;
  },

  async activateKey(token?: string): Promise<{ key_record: KeyRecord; user: UserProfile; message: string }> {
    const res = await apiFetch('/api/key/activate', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ key: token, token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Invalid or expired key. Please generate a new key.');
    return data;
  },

  // Admin APIs
  async getAdminStats(): Promise<DashboardStats> {
    const res = await apiFetch('/api/admin/stats', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  async getAdminPlatforms(): Promise<Platform[]> {
    const res = await apiFetch('/api/admin/platforms', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch admin platforms');
    const data = await res.json();
    return data.platforms;
  },

  async createPlatform(payload: Partial<Platform>): Promise<Platform> {
    const res = await apiFetch('/api/admin/platforms', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create platform');
    return data.platform;
  },

  async updatePlatform(id: string, payload: Partial<Platform>): Promise<Platform> {
    const res = await apiFetch(`/api/admin/platforms/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update platform');
    return data.platform;
  },

  async deletePlatform(id: string): Promise<void> {
    const res = await apiFetch(`/api/admin/platforms/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete platform');
    }
  },

  async getAdminUsers(query = '', filter = 'all'): Promise<UserProfile[]> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (filter && filter !== 'all') params.set('filter', filter);
    const res = await apiFetch(`/api/admin/users?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to fetch users');
    const data = await res.json();
    return data.users;
  },

  async updateAdminUser(id: string, payload: { name: string }): Promise<{ user: UserProfile; message: string }> {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update user profile');
    return data;
  },

  async blockUser(id: string, reason?: string): Promise<{ user: UserProfile; message: string }> {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(id)}/block`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to block user');
    return data;
  },

  async unblockUser(id: string): Promise<{ user: UserProfile; message: string }> {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(id)}/unblock`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to unblock user');
    return data;
  },

  async deleteUser(id: string): Promise<{ success: boolean; deleted_id: string; message: string }> {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete user account');
    return data;
  },

  async updateUserVip(
    id: string,
    vip_active: boolean,
    duration_days?: number,
    vip_expires_at?: string | null
  ): Promise<UserProfile> {
    const res = await apiFetch(`/api/admin/users/${id}/vip`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ vip_active, duration_days, vip_expires_at }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update VIP status');
    return data.user;
  },

  async getAdminVipPlans(): Promise<VipPlan[]> {
    const res = await apiFetch('/api/admin/vip/plans', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch VIP plans');
    const data = await res.json();
    return data.plans;
  },

  async createVipPlan(payload: Partial<VipPlan>): Promise<VipPlan> {
    const res = await apiFetch('/api/admin/vip/plans', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create plan');
    return data.plan;
  },

  async updateVipPlan(id: string, payload: Partial<VipPlan>): Promise<VipPlan> {
    const res = await apiFetch(`/api/admin/vip/plans/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update plan');
    return data.plan;
  },

  async deleteVipPlan(id: string): Promise<void> {
    const res = await apiFetch(`/api/admin/vip/plans/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete VIP plan');
  },

  async getAdminPayments(): Promise<PaymentRecord[]> {
    const res = await apiFetch('/api/admin/payments', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch payments');
    const data = await res.json();
    return data.payments;
  },

  async createPayment(payload: Partial<PaymentRecord>): Promise<PaymentRecord> {
    const res = await apiFetch('/api/admin/payments', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to record payment');
    return data.payment;
  },

  async deletePayment(id: string): Promise<{ message: string }> {
    const res = await apiFetch(`/api/admin/payments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete payment record');
    return data;
  },

  async deleteAdminPayment(id: string): Promise<{ message: string }> {
    return this.deletePayment(id);
  },

  async verifyAdminPayment(
    id: string,
    payload: { action: 'approve' | 'reject'; duration_days?: number; admin_note?: string; rejection_reason?: string }
  ): Promise<{ payment: PaymentRecord; user?: UserProfile; message: string }> {
    const res = await apiFetch(`/api/admin/payments/${encodeURIComponent(id)}/verify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to verify payment claim');
    return data;
  },

  async getAdminKeys(): Promise<{ settings: Partial<AdminSettings>; records: KeyRecord[]; active_keys?: number }> {
    const res = await apiFetch('/api/admin/keys', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch key management data');
    return res.json();
  },

  async updateKeySettings(payload: {
    key_generation_enabled?: boolean;
    shortener_url?: string;
    tutorial_video_url?: string;
    key_expiry_hours?: number;
    free_access_duration?: number;
    free_access_unit?: 'minutes' | 'hours' | 'days';
  }): Promise<{ settings: Partial<AdminSettings>; message: string }> {
    const res = await apiFetch('/api/admin/keys/settings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save key settings');
    return data;
  },

  async revokeAdminKey(id: string): Promise<{ active_keys: number; message: string }> {
    const res = await apiFetch(`/api/admin/keys/${id}/revoke`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to revoke key');
    return data;
  },

  async deleteAdminKey(id: string): Promise<{ active_keys: number; message: string }> {
    const res = await apiFetch(`/api/admin/keys/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete key record');
    return data;
  },

  async deleteAdminKeyRecord(id: string): Promise<{ active_keys: number; message: string }> {
    return this.deleteAdminKey(id);
  },

  async getAdminLoginHistory(): Promise<LoginHistoryEntry[]> {
    const res = await apiFetch('/api/admin/login-history', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch login history');
    const data = await res.json();
    return data.history;
  },

  async deleteLoginHistoryEntry(id: string): Promise<{ message: string }> {
    const res = await apiFetch(`/api/admin/login-history/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete login history entry');
    return data;
  },

  async deleteAdminLoginHistory(id: string): Promise<{ message: string }> {
    return this.deleteLoginHistoryEntry(id);
  },

  async getAdminAnnouncements(): Promise<Announcement[]> {
    const res = await apiFetch('/api/admin/announcements', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch announcements');
    const data = await res.json();
    return data.announcements;
  },

  async createAnnouncement(
    title: string,
    content: string,
    is_published: boolean,
    extra?: {
      link_url?: string;
      display_order?: number;
      start_date?: string | null;
      end_date?: string | null;
    }
  ): Promise<Announcement> {
    const res = await apiFetch('/api/admin/announcements', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title, content, is_published, ...(extra || {}) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create announcement');
    return data.announcement;
  },

  async updateAnnouncement(id: string, payload: Partial<Announcement>): Promise<Announcement> {
    const res = await apiFetch(`/api/admin/announcements/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update announcement');
    return data.announcement;
  },

  async deleteAnnouncement(id: string): Promise<void> {
    const res = await apiFetch(`/api/admin/announcements/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete announcement');
  },

  async previewCleanup(operation: CleanupOperationType, retentionDays = 30): Promise<CleanupPreviewResponse> {
    const params = new URLSearchParams({ operation, retentionDays: String(retentionDays) });
    const res = await apiFetch(`/api/admin/cleanup/preview?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to preview cleanup operation');
    return data.preview;
  },

  async executeCleanup(
    operation: CleanupOperationType,
    retentionDays = 30
  ): Promise<{ success: boolean; removed_count: number; message: string }> {
    const res = await apiFetch('/api/admin/cleanup/execute', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ operation, retentionDays, confirmed: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to execute cleanup operation');
    return data;
  },

  async bulkDelete(
    section:
      | 'users'
      | 'platforms'
      | 'vip_batches'
      | 'vip_plans'
      | 'announcements'
      | 'login_history'
      | 'payment_records'
      | 'key_records'
      | 'vip_device_logs',
    ids: string[]
  ): Promise<{
    success: boolean;
    deleted_count: number;
    deleted_ids: string[];
    skipped_count: number;
    skipped_reasons: string[];
    message: string;
  }> {
    const res = await apiFetch('/api/admin/bulk-delete', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ section, ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete selected records');
    return data;
  },

  async resetUserVipDevice(
    userId: string,
    reason?: string
  ): Promise<{ user: UserProfile; message: string }> {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/reset-vip-device`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to reset VIP device binding');
    return data;
  },

  async getVipDeviceLogs(): Promise<VipDeviceLog[]> {
    const res = await apiFetch('/api/admin/vip-device-logs', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to fetch VIP device security logs');
    return data.logs || [];
  },

  async deleteVipDeviceLog(id: string): Promise<{ message: string }> {
    const res = await apiFetch(`/api/admin/vip-device-logs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete VIP device log');
    return data;
  },

  async getAdminSettings(): Promise<AdminSettings> {
    const res = await apiFetch('/api/admin/settings', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch settings');
    const data = await res.json();
    return data.settings;
  },

  async saveAdminSettings(settings: Partial<AdminSettings>): Promise<AdminSettings> {
    const res = await apiFetch('/api/admin/settings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save settings');
    return data.settings;
  },

  async uploadLogo(
    dataUrl: string,
    filename?: string,
    mimeType?: string
  ): Promise<{ url: string; settings: AdminSettings; message?: string }> {
    const res = await apiFetch('/api/admin/upload-logo', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ dataUrl, filename, mimeType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to upload application logo');
    return data;
  },

  async uploadAsset(
    dataUrl: string,
    mimeType?: string,
    prefix = 'asset',
    settingKey?: 'support_image_url' | 'donation_qr_url' | 'vip_payment_qr_url' | 'custom_popup_image_url' | 'app_logo_url'
  ): Promise<{ url: string; settings?: AdminSettings; message?: string }> {
    const res = await apiFetch('/api/admin/upload-asset', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ dataUrl, mimeType, prefix, settingKey }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to upload image asset');
    return data;
  },

  async uploadAdminAsset(
    dataUrl: string,
    filename?: string,
    mimeType?: string,
    settingKey?: 'support_image_url' | 'donation_qr_url' | 'vip_payment_qr_url' | 'custom_popup_image_url' | 'app_logo_url'
  ): Promise<{ url: string; settings?: AdminSettings; message?: string }> {
    return this.uploadAsset(dataUrl, mimeType, filename || 'asset', settingKey);
  },

  async getAdminAdmins(): Promise<UserProfile[]> {
    const res = await apiFetch('/api/admin/admins', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch admins');
    const data = await res.json();
    return data.admins;
  },

  async createOrUpdateAdmin(email: string, password?: string, role?: string): Promise<UserProfile> {
    const res = await apiFetch('/api/admin/admins', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, password, role }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save admin account');
    return data.admin;
  },

  async deleteAdmin(id: string): Promise<{ success: boolean; deleted_id: string; message: string }> {
    const res = await apiFetch(`/api/admin/admins/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    let data: { error?: string; success?: boolean; deleted_id?: string; message?: string } = {};
    try {
      data = await res.json();
    } catch {
      // Fallback if response is not JSON
    }
    if (!res.ok) {
      throw new Error(data.error || `Failed to delete administrator account (HTTP ${res.status})`);
    }
    return {
      success: Boolean(data.success ?? true),
      deleted_id: data.deleted_id || id,
      message: data.message || 'Administrator account removed.',
    };
  },

  async getAdminPlatformLogs(params?: {
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<PlatformLogsSummaryResponse> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    const res = await apiFetch(`/api/admin/platform-logs${qs ? `?${qs}` : ''}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch platform usage logs');
    }
    return data;
  },

  async getAdminPlatformLogHistory(
    platformId: string,
    params?: {
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<PlatformUsageHistoryResponse> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const qs = searchParams.toString();
    const res = await apiFetch(
      `/api/admin/platform-logs/${encodeURIComponent(platformId)}/history${qs ? `?${qs}` : ''}`,
      {
        headers: getAuthHeaders(),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to fetch platform usage history');
    }
    return data;
  },

  // Festival Decoration Manager APIs
  async getActiveFestival(): Promise<ActiveFestivalResponse> {
    const res = await apiFetch('/api/festivals/active', {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error('Failed to fetch active festival state');
    return res.json();
  },

  async getAdminFestivals(): Promise<AdminFestivalManagerResponse> {
    const res = await apiFetch('/api/admin/festivals', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load Festival Decoration Manager');
    return data;
  },

  async toggleFestivalGlobalMaster(
    enabled: boolean
  ): Promise<{ success: boolean; state: AdminFestivalManagerResponse; message: string }> {
    const res = await apiFetch('/api/admin/festivals/master-toggle', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update global festival master toggle');
    return data;
  },

  async toggleFestival(
    id: string,
    enabled: boolean,
    forceReplace = false
  ): Promise<{
    success: boolean;
    requires_confirmation?: boolean;
    current_active?: FestivalDecorationConfig;
    target_festival?: FestivalDecorationConfig;
    replaced_festival_name?: string | null;
    state?: AdminFestivalManagerResponse;
    message?: string;
  }> {
    const res = await apiFetch(`/api/admin/festivals/${encodeURIComponent(id)}/toggle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled, force_replace: forceReplace }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to toggle festival decoration');
    return data;
  },

  async updateFestivalConfig(
    id: string,
    updates: Partial<FestivalDecorationConfig>
  ): Promise<{
    success: boolean;
    festival: FestivalDecorationConfig;
    state: AdminFestivalManagerResponse;
    message: string;
  }> {
    const res = await apiFetch(`/api/admin/festivals/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save festival configuration');
    return data;
  },

  async resetFestivalConfig(
    id: string
  ): Promise<{
    success: boolean;
    festival: FestivalDecorationConfig;
    state: AdminFestivalManagerResponse;
    message: string;
  }> {
    const res = await apiFetch(`/api/admin/festivals/${encodeURIComponent(id)}/reset`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to reset festival configuration');
    return data;
  },

  // Admin Feedback Management APIs
  async getAdminFeedback(): Promise<UserFeedbackRecord[]> {
    const res = await apiFetch('/api/admin/feedback', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load user feedback records');
    return data.feedback || [];
  },

  async updateAdminFeedback(
    id: string,
    payload: { status?: FeedbackStatus; admin_note?: string }
  ): Promise<{ feedback: UserFeedbackRecord; message: string }> {
    const res = await apiFetch(`/api/admin/feedback/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update feedback status');
    return data;
  },

  async deleteAdminFeedback(id: string): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch(`/api/admin/feedback/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete feedback record');
    return data;
  },

  // ==========================================================
  // MASTER UPGRADE: SMART NOTIFICATIONS, VIP STUDENT HUB,
  // ADMIN CONTROL, VIP FEATURE MANAGEMENT, ANALYTICS, AUDIT & BACKUPS
  // ==========================================================

  async getNotifications(): Promise<{ notifications: SmartNotification[]; unread_count: number }> {
    const res = await apiFetch('/api/notifications', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load notifications');
    return {
      notifications: data.notifications || [],
      unread_count: Number(data.unread_count || 0),
    };
  },

  async markNotificationsRead(notificationId?: string): Promise<{ success: boolean }> {
    const res = await apiFetch('/api/notifications/read', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ notification_id: notificationId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to mark notifications read');
    return data;
  },

  async clearReadNotifications(): Promise<{ success: boolean }> {
    const res = await apiFetch('/api/notifications/clear-read', {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to clear read notifications');
    return data;
  },

  async getVipFeaturesStatus(): Promise<VipFeatureManagementState> {
    const res = await apiFetch('/api/vip/features-status');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to fetch VIP features status');
    return data;
  },

  async getVipStudentHub(): Promise<VipStudentHubData> {
    const res = await apiFetch('/api/vip/student/hub', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || 'Failed to load VIP Student Hub') as Error & { code?: string };
      if (data.code) err.code = data.code;
      throw err;
    }
    return data;
  },

  async checkInStudyStreak(source?: string): Promise<{
    success: boolean;
    incremented_today: boolean;
    streak: StudyStreakState;
    new_milestone?: string;
    message: string;
  }> {
    const res = await apiFetch('/api/vip/student/streak/check-in', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ source }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to record study streak');
    return data;
  },

  async addStudentExam(payload: {
    exam_name?: string;
    title?: string;
    exam_category?: string;
    subject?: string;
    exam_date: string;
    target_score?: string;
    notes?: string;
  }): Promise<{ exam: ExamRecord; message: string }> {
    const res = await apiFetch('/api/vip/student/exams', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to add personal exam');
    return data;
  },

  async updateStudentExam(
    id: string,
    payload: Partial<ExamRecord>
  ): Promise<{ exam: ExamRecord; message: string }> {
    const res = await apiFetch(`/api/vip/student/exams/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update personal exam');
    return data;
  },

  async deleteStudentExam(id: string): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch(`/api/vip/student/exams/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete personal exam');
    return data;
  },

  async addTimetableItem(payload: {
    day_of_week: StudyTimetableItem['day_of_week'];
    start_time: string;
    end_time: string;
    subject: string;
    topic: string;
    priority?: StudyTimetableItem['priority'];
    notes?: string;
  }): Promise<{ entry: StudyTimetableItem; message: string }> {
    const res = await apiFetch('/api/vip/student/timetable', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to add timetable item');
    return data;
  },

  async updateTimetableItem(
    id: string,
    payload: Partial<StudyTimetableItem>
  ): Promise<{ entry: StudyTimetableItem; message: string }> {
    const res = await apiFetch(`/api/vip/student/timetable/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update timetable item');
    return data;
  },

  async deleteTimetableItem(id: string): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch(`/api/vip/student/timetable/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete timetable item');
    return data;
  },

  async interactWithResource(
    id: string,
    payload: { is_bookmarked?: boolean; is_completed?: boolean }
  ): Promise<{ interaction: any; achievements: any[] }> {
    const res = await apiFetch(`/api/vip/student/resources/${encodeURIComponent(id)}/interact`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update resource interaction');
    return data;
  },

  async submitMockTestAttempt(
    id: string,
    payload: { selected_answers: number[]; time_taken_seconds: number }
  ): Promise<{ attempt: VipMockTestAttempt; test: VipMockTest; message: string }> {
    const res = await apiFetch(`/api/vip/student/mock-tests/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to submit mock test');
    return data;
  },

  async createPrioritySupportTicket(payload: {
    subject: string;
    category: PrioritySupportTicket['category'];
    message: string;
  }): Promise<{ ticket: PrioritySupportTicket; message: string }> {
    const res = await apiFetch('/api/vip/student/support-tickets', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to create priority support ticket');
    return data;
  },

  async replyPrioritySupportTicket(
    id: string,
    message: string
  ): Promise<{ ticket: PrioritySupportTicket; message: string }> {
    const res = await apiFetch(`/api/vip/student/support-tickets/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to send reply');
    return data;
  },

  async applyReferralCode(referral_code: string): Promise<{ referral: ReferralRecord; message: string }> {
    const res = await apiFetch('/api/vip/student/referrals/apply', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ referral_code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to apply referral code');
    return data;
  },

  // Super Admin: ADMIN CONTROL
  async getAdminControlData(): Promise<{
    registry: AdminSectionDefinition[];
    admins: (UserProfile & { permissions: Record<AdminSectionKey, AdminSectionPermissionRecord> })[];
    users: UserProfile[];
    history: AdminPermissionHistoryEntry[];
  }> {
    const res = await apiFetch('/api/admin/control/permissions', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load Admin Control');
    return data;
  },

  async updateAdminPermissions(
    adminId: string,
    sections: Partial<Record<AdminSectionKey, Partial<AdminSectionPermissionRecord>>>
  ): Promise<{
    permissions: Record<AdminSectionKey, AdminSectionPermissionRecord>;
    history: AdminPermissionHistoryEntry[];
    message: string;
  }> {
    const res = await apiFetch(`/api/admin/control/permissions/${encodeURIComponent(adminId)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ sections }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save admin permissions');
    return data;
  },

  async resetAdminPermissions(adminId: string): Promise<{
    permissions: Record<AdminSectionKey, AdminSectionPermissionRecord>;
    history: AdminPermissionHistoryEntry[];
    message: string;
  }> {
    const res = await apiFetch(`/api/admin/control/permissions/${encodeURIComponent(adminId)}/reset`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to reset admin permissions');
    return data;
  },

  async changeAdminRole(
    userId: string,
    role: 'admin' | 'user',
    reason?: string
  ): Promise<{ user: UserProfile; permissions: Record<AdminSectionKey, AdminSectionPermissionRecord>; message: string }> {
    const res = await apiFetch(`/api/admin/control/role/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update user role');
    return data;
  },

  // Super Admin: VIP FEATURE MANAGEMENT
  async getAdminVipFeaturesData(): Promise<{
    definitions: Omit<VipFeatureConfig, 'is_enabled' | 'updated_by' | 'updated_at'>[];
    state: VipFeatureManagementState;
    global_exams: ExamRecord[];
    resources: LearningLibraryResource[];
    vip_announcements: VipExclusiveAnnouncement[];
    mock_tests: VipMockTest[];
    support_tickets: PrioritySupportTicket[];
    referrals: ReferralRecord[];
  }> {
    const res = await apiFetch('/api/admin/vip-features', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load VIP Feature Management');
    return data;
  },

  async setGlobalVipMasterSwitch(
    enabled: boolean
  ): Promise<{ state: VipFeatureManagementState; message: string }> {
    const res = await apiFetch('/api/admin/vip-features/master-switch', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to toggle Global VIP Master Switch');
    return data;
  },

  async toggleIndividualVipFeature(
    featureKey: VipFeatureKey,
    enabled: boolean
  ): Promise<{ state: VipFeatureManagementState; message: string }> {
    const res = await apiFetch(`/api/admin/vip-features/${encodeURIComponent(featureKey)}/toggle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to toggle VIP feature');
    return data;
  },

  async addAdminGlobalExam(payload: {
    exam_name?: string;
    title?: string;
    exam_category?: string;
    subject: string;
    exam_date: string;
    target_score?: string;
    notes?: string;
    is_published?: boolean;
  }): Promise<{ exam: ExamRecord; message: string }> {
    const res = await apiFetch('/api/admin/vip-features/exams', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to add global exam');
    return data;
  },

  async deleteAdminGlobalExam(id: string): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch(`/api/admin/vip-features/exams/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete global exam');
    return data;
  },

  async addAdminLearningResource(payload: {
    title: string;
    subject: string;
    category: LearningLibraryResource['category'];
    description: string;
    content_url?: string;
    external_url?: string;
    badge_text?: string;
    resource_group?: 'learning_library' | 'exclusive_resources';
    is_published?: boolean;
  }): Promise<{ resource: LearningLibraryResource; message: string }> {
    const res = await apiFetch('/api/admin/vip-features/resources', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to add learning resource');
    return data;
  },

  async deleteAdminLearningResource(id: string): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch(`/api/admin/vip-features/resources/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete learning resource');
    return data;
  },

  async addAdminVipAnnouncement(payload: {
    title: string;
    content: string;
    category?: VipExclusiveAnnouncement['category'];
    is_pinned?: boolean;
    action_url?: string;
  }): Promise<{ announcement: VipExclusiveAnnouncement; message: string }> {
    const res = await apiFetch('/api/admin/vip-features/announcements', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to publish VIP announcement');
    return data;
  },

  async deleteAdminVipAnnouncement(id: string): Promise<{ success: boolean; message: string }> {
    const res = await apiFetch(`/api/admin/vip-features/announcements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to delete VIP announcement');
    return data;
  },

  async replyAdminPrioritySupportTicket(
    id: string,
    payload: { message: string; status?: PrioritySupportTicket['status'] }
  ): Promise<{ ticket: PrioritySupportTicket; message: string }> {
    const res = await apiFetch(`/api/admin/vip-features/support-tickets/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update priority ticket');
    return data;
  },

  // Super Admin: ADVANCED ANALYTICS, AUDIT LOGS & BACKUPS
  async getAdvancedAdminAnalytics(): Promise<AdvancedAdminAnalyticsResponse> {
    const res = await apiFetch('/api/admin/analytics/advanced', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load advanced analytics');
    return data;
  },

  async getAdminAuditLogs(params?: {
    search?: string;
    section?: string;
    actor?: string;
    action?: string;
    status?: string;
  }): Promise<{ logs: AdminAuditLogEntry[] }> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.section) qs.set('section', params.section);
    if (params?.actor) qs.set('actor', params.actor);
    if (params?.action) qs.set('action', params.action);
    if (params?.status) qs.set('status', params.status);
    const q = qs.toString();
    const res = await apiFetch(`/api/admin/audit-logs${q ? `?${q}` : ''}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load admin audit logs');
    return { logs: data.logs || [] };
  },

  async getDatabaseBackups(): Promise<{ backups: DatabaseBackupSnapshot[] }> {
    const res = await apiFetch('/api/admin/backups', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load database backups');
    return { backups: data.backups || [] };
  },

  async createDatabaseBackup(label?: string): Promise<{
    success: boolean;
    snapshot: DatabaseBackupSnapshot;
    backups: DatabaseBackupSnapshot[];
    message: string;
  }> {
    const res = await apiFetch('/api/admin/backups/create', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ label }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to create backup snapshot');
    return data;
  },

  async restoreDatabaseBackup(backupId: string): Promise<{
    success: boolean;
    restored_summary: Record<string, number>;
    message: string;
  }> {
    const res = await apiFetch('/api/admin/backups/restore', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ backup_id: backupId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to restore backup snapshot');
    return data;
  },

  // ==========================================================
  // ADDITIONAL MASTER UPDATE: VIP FEATURE REORDERING & REFERRAL MANAGEMENT
  // ==========================================================

  async getVipReferralPricePreview(planId?: string): Promise<{
    referral_program_enabled: boolean;
    discount_config: ReferralDiscountConfig;
    has_active_referral_attribution: boolean;
    referrer_code: string | null;
    previews: Record<string, ReferralPricePreview>;
  }> {
    const qs = planId ? `?plan_id=${encodeURIComponent(planId)}` : '';
    const res = await apiFetch(`/api/vip/referral-price-preview${qs}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to fetch referral price preview');
    return data;
  },

  async getMyReferralDashboard(): Promise<{
    referral_program_enabled: boolean;
    permissions: UserReferralPermissions;
    referral_code: string;
    referred_by_code: string | null;
    my_attribution?: {
      is_referred: boolean;
      referred_by_user_id: string | null;
      referred_by_code: string | null;
      referred_at: string | null;
      discount_eligible: boolean;
      discount_label: string;
      reason: string;
    };
    discount_config: ReferralDiscountConfig;
    referrals: ReferralRecord[];
    sales_summary: ReferrerSalesSummaryReport | null;
  }> {
    const res = await apiFetch('/api/referrals/my-dashboard', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load referral dashboard');
    return data;
  },

  async reorderAdminVipFeatures(
    orderedKeys: VipFeatureKey[]
  ): Promise<{ state: VipFeatureManagementState; message: string }> {
    const res = await apiFetch('/api/admin/vip-features/reorder', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ordered_keys: orderedKeys }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save VIP feature order');
    return data;
  },

  async resetAdminVipFeaturesOrder(): Promise<{ state: VipFeatureManagementState; message: string }> {
    const res = await apiFetch('/api/admin/vip-features/reset-order', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to reset VIP feature order');
    return data;
  },

  async getAdminReferralManagement(): Promise<AdminReferralManagementResponse> {
    const res = await apiFetch('/api/admin/referrals/management', {
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load Referral Management');
    return data;
  },

  async setAdminReferralGlobalSwitch(
    enabled: boolean
  ): Promise<{ referral_program_enabled: boolean; message: string }> {
    const res = await apiFetch('/api/admin/referrals/global-switch', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update Referral Program switch');
    return data;
  },

  async updateAdminReferralPermissions(
    userId: string,
    permissions: Partial<UserReferralPermissions>
  ): Promise<{ permissions: UserReferralPermissions; message: string }> {
    const res = await apiFetch(`/api/admin/referrals/permissions/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(permissions),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update referral permissions');
    return data;
  },

  async updateAdminReferralDiscountConfig(
    config: Partial<ReferralDiscountConfig>
  ): Promise<{ discount_config: ReferralDiscountConfig; message: string }> {
    const res = await apiFetch('/api/admin/referrals/discount-config', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(config),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to update referral discount settings');
    return data;
  },

  async cleanupConfirmedTestAccounts(): Promise<{
    removed_count: number;
    removed_emails: string[];
    removed_payment_ids: string[];
    backup_id: string;
    message: string;
  }> {
    const res = await apiFetch('/api/admin/users/cleanup-confirmed-test-accounts', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to cleanup confirmed test accounts');
    return data;
  },
};



