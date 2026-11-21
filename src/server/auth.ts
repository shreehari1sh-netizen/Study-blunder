import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { StorageEngine } from './storage.ts';
import type { User, UserPublicProfile } from './types.ts';
import type { AdminSectionKey, AdminActionKey } from '../constants/masterUpgrade.ts';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is missing in production environment');
    }
    return 'education-portal-secure-secret-2026';
  }
  return secret;
}

export function validateProductionAuthEnv(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set in production mode');
  }
}

const revokedTokens = new Set<string>();
const revokedJtis = new Set<string>();
const revokedUserTimestamps = new Map<string, number>();

export interface AuthenticatedRequest extends Request {
  user?: User;
  tokenJti?: string;
}

export function revokeToken(token: string): void {
  if (token) {
    revokedTokens.add(token);
  }
}

export function revokeTokenJti(jti?: string | null): void {
  if (jti) {
    revokedJtis.add(jti);
  }
}

export function revokeUserSessions(userId: string): void {
  if (userId) {
    revokedUserTimestamps.set(userId, Math.floor(Date.now() / 1000) + 1);
  }
}

export function extractRequestDeviceId(req: Request): string {
  const fromHeader = req.headers['x-device-id'];
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim().slice(0, 128);
  }
  const fromBody = (req.body as Record<string, unknown> | undefined)?.device_id;
  if (typeof fromBody === 'string' && fromBody.trim()) {
    return fromBody.trim().slice(0, 128);
  }
  const fromQuery = req.query?.device_id;
  if (typeof fromQuery === 'string' && fromQuery.trim()) {
    return fromQuery.trim().slice(0, 128);
  }
  return '';
}

export function parseDeviceLabel(userAgent?: string, customLabel?: string): string {
  if (customLabel && typeof customLabel === 'string' && customLabel.trim()) {
    return customLabel.trim().slice(0, 100);
  }
  const ua = userAgent || '';
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
}

export function extractTokenJti(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    return decoded.jti || null;
  } catch {
    return null;
  }
}

export function generateToken(user: User): string {
  const nowSec = Math.floor(Date.now() / 1000);
  // Clear any prior revocation timestamp when issuing a new token for a valid user
  revokedUserTimestamps.delete(user.id);

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
      iat: nowSec,
      exp: nowSec + 7 * 24 * 3600, // 7 days
    })
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

export function verifyToken(token: string): { sub: string; email: string; role: string; jti?: string; iat?: number } | null {
  try {
    if (revokedTokens.has(token)) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', getJwtSecret())
      .update(`${header}.${payload}`)
      .digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (decoded.jti && revokedJtis.has(decoded.jti)) {
      return null; // JTI revoked (e.g. replaced VIP session)
    }
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    const revokedAt = decoded.sub ? revokedUserTimestamps.get(decoded.sub) : undefined;
    if (revokedAt && (!decoded.iat || decoded.iat <= revokedAt)) {
      return null; // User sessions revoked
    }

    return decoded;
  } catch {
    return null;
  }
}

export function toPublicUser(user: User, currentDeviceId?: string): UserPublicProfile {
  const now = Date.now();
  const isBlocked = Boolean(user.is_blocked);
  const isPrivilegedAdmin = user.role === 'admin' || user.role === 'super_admin';
  const storage = StorageEngine.getInstance();
  const settings = storage.getSettings();
  const graceHours = Math.max(0, Number(settings.vip_grace_period_hours ?? 24));
  const graceMs = graceHours * 3600 * 1000;

  let isVipActive = false;
  let vipMembershipState: 'active' | 'expiring_soon' | 'grace_period' | 'expired' | 'none' = 'none';
  let vipGraceUntil: string | null = user.vip_grace_until || null;

  if (!isBlocked) {
    if (isPrivilegedAdmin) {
      isVipActive =
        Boolean(user.vip_active) &&
        (!user.vip_expires_at || new Date(user.vip_expires_at).getTime() + graceMs > now);
      vipMembershipState = isVipActive ? 'active' : 'none';
    } else if (user.vip_expires_at) {
      const expMs = new Date(user.vip_expires_at).getTime();
      const graceEndMs = expMs + graceMs;
      vipGraceUntil = new Date(graceEndMs).toISOString();

      if (user.vip_active && expMs > now) {
        isVipActive = true;
        const daysRemaining = (expMs - now) / (24 * 3600 * 1000);
        vipMembershipState = daysRemaining <= 7 ? 'expiring_soon' : 'active';
      } else if (user.vip_active && graceMs > 0 && graceEndMs > now) {
        // Within grace period: preserve temporary VIP access while signaling grace_period state
        isVipActive = true;
        vipMembershipState = 'grace_period';
      } else {
        isVipActive = false;
        vipMembershipState = 'expired';
      }
    }
  }

  // Priority 3: Check whether free access is still valid AND free_access_expires_at is later than current server time
  let isFreeActive = false;
  if (!isBlocked && user.free_access_expires_at) {
    if (new Date(user.free_access_expires_at).getTime() > now) {
      isFreeActive = true;
    }
  }

  // Compute active per-platform VIP entitlements (strictly scoped to individual platform IDs)
  const activePlatformExpiries: Record<string, string> = {};
  const activeAllowedPlatformIds: string[] = [];
  if (!isBlocked && user.vip_platform_expiries && typeof user.vip_platform_expiries === 'object') {
    for (const [pid, expIso] of Object.entries(user.vip_platform_expiries)) {
      if (!pid || !expIso) continue;
      const expMs = new Date(expIso).getTime();
      if (Number.isFinite(expMs) && expMs + graceMs > now) {
        activePlatformExpiries[pid] = expIso;
        activeAllowedPlatformIds.push(pid);
      }
    }
  }

  let vipDeviceStatus: 'bound_current' | 'bound_other' | 'unbound' | 'not_vip' = 'not_vip';
  const hasAnyVipPrivilege = isVipActive || activeAllowedPlatformIds.length > 0;
  if (hasAnyVipPrivilege) {
    if (!user.vip_bound_device_id) {
      vipDeviceStatus = 'unbound';
    } else if (currentDeviceId) {
      vipDeviceStatus = user.vip_bound_device_id === currentDeviceId ? 'bound_current' : 'bound_other';
    } else {
      vipDeviceStatus = 'bound_current';
    }
  }

  const referralCode = storage.ensureUserReferralCode(user.id);
  const adminPermissions = isPrivilegedAdmin ? storage.getAdminPermissionsForUser(user.id) : undefined;
  const referralPermissions = storage.getUserReferralPermissions(user.id);
  const studyMetrics = storage.getUserStudyActivityMetrics(user.id, user.last_login_at, user.created_at);

  return {
    id: user.id,
    name: user.name || '',
    email: user.email,
    role: user.role,
    vip_active: isVipActive,
    vip_expires_at: user.vip_expires_at,
    vip_allowed_platform_ids: activeAllowedPlatformIds,
    vip_platform_expiries: activePlatformExpiries,
    vip_grace_until: vipGraceUntil,
    vip_membership_state: vipMembershipState,
    free_access_expires_at: user.free_access_expires_at || null,
    free_access_active: isFreeActive,
    is_blocked: isBlocked,
    blocked_at: user.blocked_at || null,
    blocked_reason: user.blocked_reason || null,
    blocked_by: user.blocked_by || null,
    vip_bound_device_id: user.vip_bound_device_id || null,
    vip_bound_session_id: user.vip_bound_session_id || null,
    vip_device_label: user.vip_device_label || null,
    vip_device_bound_at: user.vip_device_bound_at || null,
    vip_device_last_seen_at: user.vip_device_last_seen_at || null,
    vip_device_last_ip: user.vip_device_last_ip || null,
    vip_device_last_ua: user.vip_device_last_ua || null,
    vip_device_reset_count: user.vip_device_reset_count || 0,
    vip_device_last_reset_at: user.vip_device_last_reset_at || null,
    vip_device_last_reset_by: user.vip_device_last_reset_by || null,
    vip_sharing_attempt_count: user.vip_sharing_attempt_count || 0,
    vip_last_sharing_attempt_at: user.vip_last_sharing_attempt_at || null,
    vip_device_status: vipDeviceStatus,
    referral_code: referralCode,
    referred_by_user_id: user.referred_by_user_id || null,
    referred_by_code: user.referred_by_code || null,
    referred_at: user.referred_at || null,
    bonus_vip_days: user.bonus_vip_days || 0,
    ...(adminPermissions && { admin_permissions: adminPermissions }),
    referral_permissions: referralPermissions,
    server_time: new Date(now).toISOString(),
    created_at: user.created_at,
    last_login_at: user.last_login_at,
    last_study_activity_at: studyMetrics.last_study_activity_at,
    total_study_activities: studyMetrics.total_study_activities,
    learner_activity_status: studyMetrics.learner_activity_status,
  };
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed authorization token' });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }

  const storage = StorageEngine.getInstance();
  const user = storage.getUserById(payload.sub);
  if (!user) {
    res.status(401).json({ error: 'User account not found' });
    return;
  }

  if (user.is_blocked) {
    res.status(403).json({
      error: `Your account has been blocked by an administrator.${user.blocked_reason ? ' Reason: ' + user.blocked_reason : ''}`,
      code: 'ACCOUNT_BLOCKED',
      blocked_reason: user.blocked_reason || null,
    });
    return;
  }

  req.user = user;
  req.tokenJti = payload.jti;
  next();
}

export function optionalAuthenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) {
      const storage = StorageEngine.getInstance();
      const user = storage.getUserById(payload.sub);
      if (user) {
        req.user = user;
        req.tokenJti = payload.jti;
      }
    }
  }
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
    res.status(403).json({ error: 'Administrative privileges required' });
    return;
  }
  next();
}

export function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Super Admin privileges required for this operation' });
    return;
  }
  next();
}

export function requireAdminPermission(
  sectionKey: AdminSectionKey | AdminSectionKey[],
  actionKey: AdminActionKey = 'view'
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
      res.status(403).json({ error: 'Administrative privileges required' });
      return;
    }
    if (req.user.role === 'super_admin' || req.user.email.toLowerCase() === 'bhaskardattmishra0101@gmail.com') {
      next();
      return;
    }
    const storage = StorageEngine.getInstance();
    const sections = Array.isArray(sectionKey) ? sectionKey : [sectionKey];
    const allowed = sections.some((sec) => storage.hasAdminPermission(req.user!.id, sec, actionKey));
    if (!allowed) {
      const primarySection = sections[0];
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';
      storage.recordAdminAuditLog({
        admin_id: req.user.id,
        admin_email: req.user.email,
        admin_role: req.user.role,
        action_type: 'permission_denied',
        section: primarySection,
        target_id: req.params?.id || req.originalUrl || primarySection,
        description: `Permission denied for '${actionKey.toUpperCase()}' in '${sections.join(' / ')}'`,
        status: 'failed',
        ip_address: clientIp,
      });
      res.status(403).json({
        error: `Access Restricted: Your administrator account does not have '${actionKey.toUpperCase()}' permission for the '${primarySection}' section. Contact Super Admin.`,
        code: 'ADMIN_PERMISSION_DENIED',
        section: primarySection,
        action: actionKey,
      });
      return;
    }
    next();
  };
}
