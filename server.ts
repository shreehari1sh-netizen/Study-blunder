import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createServer as createViteServer } from 'vite';
import {
  StorageEngine,
  hashPassword,
  verifyPassword,
  ALLOWED_APP_THEME_PRESETS,
  normalizeAppThemePreset,
} from './src/server/storage.ts';
import {
  authenticate,
  optionalAuthenticate,
  requireAdmin,
  requireSuperAdmin,
  requireAdminPermission,
  generateToken,
  revokeToken,
  revokeTokenJti,
  revokeUserSessions,
  extractRequestDeviceId,
  parseDeviceLabel,
  extractTokenJti,
  toPublicUser,
  validateProductionAuthEnv,
  verifyToken,
  type AuthenticatedRequest,
} from './src/server/auth.ts';
import { ADMIN_SECTIONS_REGISTRY, VIP_FEATURES_DEFINITIONS } from './src/constants/masterUpgrade.ts';

import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const storage = StorageEngine.getInstance();
const PRIMARY_SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'bhaskardattmishra0101@gmail.com';

// Security HTTP response headers + Lightweight Gzip Compression middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Skip compression for SSE streams or if client does not accept gzip
  if (req.path === '/api/festivals/stream' || req.headers['accept'] === 'text/event-stream') {
    next();
    return;
  }

  // Enforce strict no-store caching on all dynamic API endpoints so Android WebView/APK never serves stale config
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (!acceptEncoding.includes('gzip')) {
    next();
    return;
  }

  // Automatically Gzip JSON responses >= 512 bytes to reduce API bandwidth by ~75-85%
  const origJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    try {
      if (res.headersSent || res.getHeader('Content-Encoding')) {
        return origJson(body);
      }
      const jsonStr = JSON.stringify(body);
      if (!jsonStr || Buffer.byteLength(jsonStr, 'utf8') < 512) {
        return origJson(body);
      }
      const compressed = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { level: 6 });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(compressed.length));
      return res.end(compressed);
    } catch {
      return origJson(body);
    }
  }) as typeof res.json;

  next();
});

// Sliding-window rate limiter for authentication endpoints (prevents brute-force attacks)
const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_AUTH_ATTEMPTS = 10;
const failedAuthAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

function checkAuthRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = failedAuthAttempts.get(key);
  if (!entry) return { allowed: true, retryAfterSec: 0 };
  if (now - entry.firstAttemptAt > AUTH_WINDOW_MS) {
    failedAuthAttempts.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }
  if (entry.count >= MAX_FAILED_AUTH_ATTEMPTS) {
    const retryAfterSec = Math.ceil((AUTH_WINDOW_MS - (now - entry.firstAttemptAt)) / 1000);
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordFailedAuthAttempt(key: string): void {
  const now = Date.now();
  const entry = failedAuthAttempts.get(key);
  if (!entry || now - entry.firstAttemptAt > AUTH_WINDOW_MS) {
    failedAuthAttempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

function clearFailedAuthAttempts(key: string): void {
  failedAuthAttempts.delete(key);
}

const isSafeHttpUrl = (val: unknown): boolean => {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Configure body parser with 10MB limit to prevent PayloadTooLargeError when uploading logo assets
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure persistent uploads directory exists and is publicly accessible via /uploads with sandbox CSP
const UPLOADS_DIR = path.resolve(process.cwd(), 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Android Digital Asset Links endpoint (/.well-known/assetlinks.json) to hide top URL bar in TWA/PWABuilder APKs
const DEFAULT_ANDROID_SHA256 =
  '28:FD:68:36:6A:C4:82:A6:3D:27:38:10:1E:9C:89:17:F4:97:DF:6D:80:1D:3F:9B:CC:E5:57:FA:43:0D:8D:49';
const LEGACY_ANDROID_SHA256 =
  '94:5B:D7:E0:19:82:66:C0:4D:CB:D4:70:A0:55:F1:E5:9E:2A:E8:48:81:5D:3F:52:9D:9D:9E:98:82:E4:EC:0D';

app.get('/.well-known/assetlinks.json', (req, res) => {
  const rawFingerprints = process.env.ANDROID_SHA256_FINGERPRINT || '';
  const fingerprints = Array.from(
    new Set(
      [
        DEFAULT_ANDROID_SHA256,
        LEGACY_ANDROID_SHA256,
        ...rawFingerprints
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      ]
    )
  );

  const rawPackages = process.env.ANDROID_PACKAGE_NAME || '';
  const envPackages = rawPackages
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  // Dynamically derive TWA package names from the current hostname (e.g., study-fox-xlkq.onrender.com -> com.onrender.study_fox_xlkq.twa)
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0].toLowerCase();
  const dynamicHostPackages: string[] = [];
  if (hostHeader && hostHeader.includes('.')) {
    const parts = hostHeader.split('.').filter(Boolean).reverse();
    if (parts.length >= 2) {
      const underscoreParts = parts.map((p) => p.replace(/[^a-z0-9]/g, '_'));
      const compactParts = parts.map((p) => p.replace(/[^a-z0-9]/g, ''));
      dynamicHostPackages.push(`${underscoreParts.join('.')}.twa`);
      dynamicHostPackages.push(`${compactParts.join('.')}.twa`);
      if (underscoreParts[0] === 'com') {
        dynamicHostPackages.push(`app.${underscoreParts.slice(1).join('.')}.twa`);
        dynamicHostPackages.push(`app.${compactParts.slice(1).join('.')}.twa`);
      }
    }
  }

  const packageNames = Array.from(
    new Set([
      ...envPackages,
      ...dynamicHostPackages,
      'com.onrender.study_fox_xlkq.twa',
      'app.onrender.study_fox_xlkq.twa',
      'com.onrender.studyfoxxlkq.twa',
      'app.onrender.studyfoxxlkq.twa',
      'com.study_fox_xlkq.twa',
      'com.studyfoxxlkq.twa',
      'com.onrender.study_fox.twa',
      'app.onrender.study_fox.twa',
      'com.onrender.studyfox.twa',
      'app.onrender.studyfox.twa',
      'com.studyfox.twa',
      'com.study_fox.twa',
      'com.studyfox.app',
      'com.study_fox.app',
    ])
  );

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  res.status(200).json(
    packageNames.map((pkg) => ({
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: pkg,
        sha256_cert_fingerprints: fingerprints,
      },
    }))
  );
});

// Serve public directory (PWA manifest, icons, favicons) with 7-day browser/APK caching
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: '7d',
      etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('manifest.json')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
        } else if (filePath.endsWith('sw.js')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Service-Worker-Allowed', '/');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
        }
      },
    })
  );
}

app.use(
  '/uploads',
  (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  },
  (req, res, next) => {
    const rawName = path.basename(req.path);
    // Block direct public static access to private payment verification proofs and feedback attachments
    if (
      rawName.startsWith('payment-proof-') ||
      rawName.startsWith('payment-screenshot-') ||
      rawName.startsWith('feedback-attachment-')
    ) {
      res.status(403).json({
        error: 'Direct access to private verification or feedback documents is forbidden. Use authorized endpoints.',
      });
      return;
    }
    next();
  },
  express.static(UPLOADS_DIR, {
    maxAge: '7d',
    etag: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    },
  }),
  async (req, res, next) => {
    const rawName = path.basename(req.path);
    if (
      !rawName ||
      rawName.includes('..') ||
      rawName.startsWith('payment-proof-') ||
      rawName.startsWith('payment-screenshot-') ||
      rawName.startsWith('feedback-attachment-')
    ) {
      return next();
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        // App assets and logos only - never public payment screenshots
        const searchLocations = [
          { bucket: 'app-assets', prefix: 'assets' },
          { bucket: 'app-assets', prefix: 'logos' },
        ];
        for (const loc of searchLocations) {
          const remotePath = loc.prefix ? `${loc.prefix}/${rawName}` : rawName;
          const { data, error } = await supabase.storage.from(loc.bucket).download(remotePath);
          if (!error && data) {
            const buf = Buffer.from(await data.arrayBuffer());
            try {
              fs.writeFileSync(path.join(UPLOADS_DIR, rawName), buf);
            } catch {
              // ignore cache write error
            }
            res.setHeader('Content-Type', data.type || 'image/png');
            res.send(buf);
            return;
          }
        }
      } catch {
        // pass to next middleware if supabase fetch fails
      }
    }
    next();
  }
);

// Error handling middleware for oversized entity payloads
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errorObj = err as { type?: string; status?: number; message?: string };
  if (errorObj?.type === 'entity.too.large' || errorObj?.status === 413) {
    res.status(413).json({ error: 'Payload too large. Please select a logo image under 2MB.' });
    return;
  }
  next(err);
});

// Single source of truth builder for Public Settings (used by GET /api/settings and SSE settings_update)
function buildPublicSettingsPayload() {
  const settings = storage.getSettings();
  return {
    key_generation_enabled: settings.key_generation_enabled,
    shortener_url: settings.shortener_url,
    tutorial_video_url: settings.tutorial_video_url,
    telegram_channel_url: settings.telegram_channel_url,
    study_blunder_telegram_url:
      settings.study_blunder_telegram_url || settings.telegram_channel_url || 'https://t.me/studyblunder',
    study_blunder_telegram_label: settings.study_blunder_telegram_label || 'Study Blunder Telegram',
    study_fox_telegram_url: settings.study_fox_telegram_url || 'https://t.me/studyfoxofficial',
    study_fox_telegram_label: settings.study_fox_telegram_label || 'Study Fox Telegram',
    telegram_popup_enabled: settings.telegram_popup_enabled,
    telegram_popup_title: settings.telegram_popup_title || 'Join Telegram Channel',
    telegram_popup_message:
      settings.telegram_popup_message ||
      'Get instant updates on new batches, free access keys, and announcements.',
    telegram_popup_button_text: settings.telegram_popup_button_text || 'Join Channel',
    telegram_popup_close_text: settings.telegram_popup_close_text || 'Maybe Later',
    telegram_popup_reminder_text: settings.telegram_popup_reminder_text || '',
    telegram_popup_frequency: settings.telegram_popup_frequency || 'once_per_session',
    telegram_popup_show_on_resume: Boolean(settings.telegram_popup_show_on_resume),
    maintenance_mode: settings.maintenance_mode,
    login_enabled: settings.login_enabled,
    key_expiry_hours: settings.key_expiry_hours,
    free_access_duration: settings.free_access_duration ?? settings.key_expiry_hours ?? 24,
    free_access_unit: settings.free_access_unit || 'hours',
    vip_purchase_url: settings.vip_purchase_url ?? '',
    vip_telegram_url: settings.vip_telegram_url ?? settings.vip_purchase_url ?? '',
    vip_payment_qr_url: settings.vip_payment_qr_url ?? '',
    vip_payment_amount: settings.vip_payment_amount ?? 0,
    vip_payment_instructions: settings.vip_payment_instructions ?? '',
    vip_payment_utr_required: Boolean(settings.vip_payment_utr_required),
    home_single_vip_label: settings.home_single_vip_label || 'VIP',
    home_single_vip_price: Number(settings.home_single_vip_price ?? 49),
    home_single_vip_duration_days: Number(settings.home_single_vip_duration_days ?? 30),
    home_single_vip_destination: settings.home_single_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_single_vip',
    home_single_vip_url: settings.home_single_vip_url ?? '',
    home_all_vip_label: settings.home_all_vip_label || 'ALL VIP',
    home_all_vip_price: Number(settings.home_all_vip_price ?? 149),
    home_all_vip_duration_days: Number(settings.home_all_vip_duration_days ?? 30),
    home_all_vip_destination: settings.home_all_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_all_vip',
    home_all_vip_url: settings.home_all_vip_url ?? '',
    app_name: settings.app_name || 'STUDY BLUNDER',
    app_logo_url: settings.app_logo_url || '',
    app_theme_preset: normalizeAppThemePreset(settings.app_theme_preset),
    theme_primary: settings.theme_primary || '#FF2525',
    theme_secondary: settings.theme_secondary || '#C90000',
    theme_background: settings.theme_background || '#090909',
    theme_text: settings.theme_text || '#F5F5F5',
    theme_button: settings.theme_button || '#FF2525',
    vip_theme_background: settings.vip_theme_background || '#090909',
    vip_theme_card: settings.vip_theme_card || '#1D1D1D',
    vip_theme_accent: settings.vip_theme_accent || '#FF2525',
    vip_theme_text: settings.vip_theme_text || '#F5F5F5',
    vip_theme_button: settings.vip_theme_button || '#FF2525',
    vip_theme_border: settings.vip_theme_border || '#454545',
    announcement_slider_enabled: settings.announcement_slider_enabled !== false,
    announcement_slide_interval_seconds: settings.announcement_slide_interval_seconds || 5,
    support_enabled: settings.support_enabled !== false,
    support_url: settings.support_url ?? '',
    support_title: settings.support_title || settings.support_button_label || 'Contact Support',
    support_button_label: settings.support_button_label || settings.support_title || 'Contact Support',
    support_description: settings.support_description ?? '',
    support_image_url: settings.support_image_url ?? '',
    donation_enabled: Boolean(settings.donation_enabled),
    donation_url: settings.donation_url ?? '',
    donation_button_text: settings.donation_button_text || 'Donate & Support Us',
    donation_title: settings.donation_title || 'Support Free Education',
    donation_message: settings.donation_message || settings.donation_description || '',
    donation_description: settings.donation_description || settings.donation_message || '',
    donation_qr_url: settings.donation_qr_url ?? '',
    custom_popup_enabled: Boolean(settings.custom_popup_enabled),
    custom_popup_title: settings.custom_popup_title || '',
    custom_popup_message: settings.custom_popup_message || '',
    custom_popup_image_url: settings.custom_popup_image_url || '',
    custom_popup_button_text: settings.custom_popup_button_text || 'Learn More',
    custom_popup_button_url: settings.custom_popup_button_url || '',
    custom_popup_close_text: settings.custom_popup_close_text || 'Dismiss',
    custom_popup_start_date: settings.custom_popup_start_date || null,
    custom_popup_end_date: settings.custom_popup_end_date || null,
    custom_popup_frequency: settings.custom_popup_frequency || 'once_per_session',
    data_retention_days: settings.data_retention_days ?? 30,
    retention_login_history_days: settings.retention_login_history_days ?? settings.data_retention_days ?? 30,
    retention_expired_keys_days: settings.retention_expired_keys_days ?? 7,
    retention_failed_payments_days: settings.retention_failed_payments_days ?? 30,
    vip_grace_period_hours: settings.vip_grace_period_hours ?? 24,
    referral_reward_days: settings.referral_reward_days ?? 7,
    referral_program_enabled: storage.isReferralProgramEnabled(),
    referral_discount_config: storage.getReferralDiscountConfig(),
    updated_at: settings.updated_at || new Date().toISOString(),
  };
}

// Settings (Public View)
app.get('/api/settings', (_req, res) => {
  res.json(buildPublicSettingsPayload());
});

// Render & Uptime Monitor Health Check Endpoint (GET + HEAD)
app.all('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.status(200).json({
    status: 'ok',
    service: 'study-blunder',
    version: '2.0.0',
    storage: storage.getStorageHealth(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Platforms (Public View: Only visible platforms, with protected destination URLs redacted)
app.get('/api/platforms', (_req, res) => {
  const platforms = storage.getPlatforms(true).map((p) => ({
    ...p,
    target_url: '',
    vip_target_url: '',
  }));
  res.json({ platforms });
});

// Secure Platform Access Verification Endpoint
app.get('/api/platforms/:id/access', optionalAuthenticate, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const platform = storage.getPlatformById(id);

  if (!platform) {
    res.status(404).json({ error: 'Platform not found.' });
    return;
  }

  const user = req.user;
  if (user && user.is_blocked) {
    res.status(403).json({
      allowed: false,
      reason: 'account_blocked',
      error: `Your account has been blocked by an administrator.${user.blocked_reason ? ' Reason: ' + user.blocked_reason : ''}`,
    });
    return;
  }

  const isPrivilegedAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));

  if (!isPrivilegedAdmin && (!platform.is_visible || platform.status !== 'active')) {
    res.status(403).json({ error: 'This platform is currently inactive or unavailable.' });
    return;
  }

  const now = Date.now();
  const settings = storage.getSettings();
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';
  const deviceId = extractRequestDeviceId(req);
  const deviceLabel = parseDeviceLabel(userAgent, req.headers['x-device-label'] as string);

  const graceHours = Number(settings.vip_grace_period_hours ?? 24) || 24;
  const graceMs = Math.max(0, graceHours) * 60 * 60 * 1000;
  const hasAllPlatformsVip = Boolean(
    isPrivilegedAdmin ||
    (user &&
      !user.is_blocked &&
      user.vip_active &&
      user.vip_expires_at &&
      new Date(user.vip_expires_at).getTime() + graceMs > now)
  );
  const singlePlatformExpiryIso =
    user && !user.is_blocked && user.vip_platform_expiries && typeof user.vip_platform_expiries === 'object'
      ? user.vip_platform_expiries[platform.id]
      : undefined;
  const hasThisPlatformVip = Boolean(
    singlePlatformExpiryIso &&
      Number.isFinite(new Date(singlePlatformExpiryIso).getTime()) &&
      new Date(singlePlatformExpiryIso).getTime() + graceMs > now
  );
  const hasVipEntitlement = hasAllPlatformsVip || hasThisPlatformVip;

  // Enforce Single-Device VIP Binding for student VIP accounts
  let isVipActive = hasVipEntitlement;
  let vipDeviceMismatchError: string | null = null;
  let boundDeviceLabel: string | null = null;
  let boundAt: string | null = null;

  if (user && !isPrivilegedAdmin && hasVipEntitlement) {
    const deviceCheck = storage.bindOrVerifyVipDevice(
      user.id,
      deviceId,
      req.tokenJti || '',
      deviceLabel,
      clientIp,
      userAgent,
      true
    );

    if (!deviceCheck.allowed) {
      isVipActive = false;
      boundDeviceLabel = deviceCheck.boundDeviceLabel || 'Registered Primary Device';
      boundAt = deviceCheck.boundAt || null;
      vipDeviceMismatchError = `VIP access is already active on another device (${boundDeviceLabel}). Please use your registered device or contact Admin/Support for a device reset.`;

      storage.addVipDeviceLog({
        user_id: user.id,
        email: user.email,
        event_type: 'device_mismatch_blocked',
        attempted_device_id: deviceId || 'MISSING_DEVICE_ID',
        bound_device_id: user.vip_bound_device_id || null,
        device_label: `${deviceLabel} [Blocked Platform: ${platform.name}]`,
        ip_address: clientIp,
        user_agent: userAgent,
        reason: `Unauthorized second-device VIP platform launch blocked (${platform.name}).`,
      });
    }
  }

  const isFreeAccessActive = Boolean(
    isPrivilegedAdmin ||
    (user &&
      user.free_access_expires_at &&
      new Date(user.free_access_expires_at).getTime() > now)
  );

  // 1. VIP Content Protection
  const shouldTrackOpen = Boolean(user && req.query.skip_log !== '1');
  const clickIdParam = typeof req.query.click_id === 'string' ? req.query.click_id.trim() : undefined;

  const trackAuthorizedOpenSafely = () => {
    if (!shouldTrackOpen || !user) return;
    storage
      .recordPlatformOpen(platform.id, user.id, user.email, { clickId: clickIdParam })
      .catch((err) => {
        console.warn('[PLATFORM LOG] Non-blocking tracking warning:', err);
      });
  };

  if (platform.access_type === 'vip') {
    if (isVipActive) {
      trackAuthorizedOpenSafely();
      res.json({
        allowed: true,
        redirect_url: platform.target_url,
        access_type: 'vip',
      });
    } else if (vipDeviceMismatchError) {
      res.status(403).json({
        allowed: false,
        reason: 'vip_device_mismatch',
        code: 'VIP_DEVICE_MISMATCH',
        bound_device_label: boundDeviceLabel,
        bound_at: boundAt,
        error: vipDeviceMismatchError,
        access_type: 'vip',
      });
    } else {
      const vipRedirectUrl =
        (platform.vip_target_url && platform.vip_target_url.trim()) ||
        (settings.vip_purchase_url && settings.vip_purchase_url.trim()) ||
        '/vip';
      res.json({
        allowed: false,
        reason: 'vip_required',
        access_type: 'vip',
        vip_redirect_url: vipRedirectUrl,
        vip_purchase_url: vipRedirectUrl,
      });
    }
    return;
  }

  // 2. Normal / Standard Content Protection
  // If student has active VIP on their authorized bound device, they automatically have access to all normal platforms
  if (isVipActive) {
    trackAuthorizedOpenSafely();
    res.json({
      allowed: true,
      redirect_url: platform.target_url,
      access_type: 'vip',
    });
    return;
  }

  // If user has VIP entitlement but is on an unauthorized second device AND has no active Free Access key:
  if (vipDeviceMismatchError && settings.key_generation_enabled && !isFreeAccessActive) {
    res.status(403).json({
      allowed: false,
      reason: 'vip_device_mismatch',
      code: 'VIP_DEVICE_MISMATCH',
      bound_device_label: boundDeviceLabel,
      bound_at: boundAt,
      error: vipDeviceMismatchError,
      access_type: 'vip',
    });
    return;
  }

  // If Key Generation is enabled, enforce active non-expired free session pass
  if (settings.key_generation_enabled) {
    if (isFreeAccessActive) {
      trackAuthorizedOpenSafely();
      res.json({
        allowed: true,
        redirect_url: platform.target_url,
        access_type: 'free',
        expires_at: user?.free_access_expires_at,
      });
    } else {
      res.json({
        allowed: false,
        reason: 'key_required',
        access_type: 'free',
        message: 'Your platform access session has expired or has not been generated. Please generate a valid session key.',
      });
    }
    return;
  }

  // Key generation disabled by admin: open access
  trackAuthorizedOpenSafely();
  res.json({
    allowed: true,
    redirect_url: platform.target_url,
    access_type: 'normal',
  });
});

// Record an explicit platform open event for an authenticated user
app.post('/api/platforms/:id/open', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const platformId = (req.params.id || '').trim();
    if (!platformId) {
      res.status(400).json({ error: 'Platform ID is required.' });
      return;
    }

    const platform = storage.getPlatformById(platformId);
    if (!platform) {
      res.status(404).json({ error: 'Platform not found.' });
      return;
    }

    const clickId =
      typeof req.body?.click_id === 'string'
        ? req.body.click_id.trim()
        : typeof req.query.click_id === 'string'
        ? req.query.click_id.trim()
        : undefined;

    const result = await storage.recordPlatformOpen(platform.id, user.id, user.email, { clickId });
    if (!result.log) {
      res.status(404).json({ error: result.error || 'Platform not found.' });
      return;
    }

    res.json({
      success: true,
      deduplicated: result.deduplicated,
      log: result.log,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to record platform open event.';
    res.status(500).json({ error: msg });
  }
});

// Verify Single-Device VIP Authorization (Used by VIP Section & VIP Batch Launch)
app.post('/api/vip/verify-device', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';
  const deviceId = extractRequestDeviceId(req);
  const deviceLabel = parseDeviceLabel(userAgent, (req.body?.device_label as string) || (req.headers['x-device-label'] as string));

  const now = Date.now();
  const settings = storage.getSettings();
  const graceHours = Number(settings.vip_grace_period_hours ?? 24) || 24;
  const graceMs = Math.max(0, graceHours) * 60 * 60 * 1000;
  const isPrivilegedAdmin = user.role === 'admin' || user.role === 'super_admin';
  const hasVip = Boolean(
    !user.is_blocked &&
    (isPrivilegedAdmin ||
      (user.vip_active &&
        user.vip_expires_at &&
        new Date(user.vip_expires_at).getTime() + graceMs > now))
  );

  if (!hasVip) {
    res.status(403).json({
      allowed: false,
      status: 'not_vip',
      code: 'VIP_REQUIRED',
      error: 'Active VIP membership is required to access VIP content.',
    });
    return;
  }

  if (isPrivilegedAdmin) {
    res.json({
      allowed: true,
      status: 'bound_current',
      user: toPublicUser(user, deviceId),
    });
    return;
  }

  const check = storage.bindOrVerifyVipDevice(
    user.id,
    deviceId,
    req.tokenJti || '',
    deviceLabel,
    clientIp,
    userAgent,
    true
  );

  const updatedUser = storage.getUserById(user.id)!;

  if (!check.allowed) {
    storage.addVipDeviceLog({
      user_id: user.id,
      email: user.email,
      event_type: 'device_mismatch_blocked',
      attempted_device_id: deviceId || 'MISSING_DEVICE_ID',
      bound_device_id: updatedUser.vip_bound_device_id || null,
      device_label: deviceLabel,
      ip_address: clientIp,
      user_agent: userAgent,
      reason: 'Blocked VIP section/batch access attempt from an unauthorized second device.',
    });

    res.status(403).json({
      allowed: false,
      status: 'bound_other',
      code: 'VIP_DEVICE_MISMATCH',
      bound_device_label: check.boundDeviceLabel || 'Registered Primary Device',
      bound_at: check.boundAt || null,
      error: `VIP access is already active on another device (${check.boundDeviceLabel || 'Registered Primary Device'}). Please use your registered device or contact Admin/Support for a device reset.`,
      user: toPublicUser(updatedUser, deviceId),
    });
    return;
  }

  res.json({
    allowed: true,
    status: 'bound_current',
    bound_device_label: check.boundDeviceLabel,
    bound_at: check.boundAt,
    newly_bound: Boolean(check.newlyBound),
    user: toPublicUser(updatedUser, deviceId),
  });
});

// VIP Batches (Public View)
app.get('/api/vip/batches', (_req, res) => {
  const batches = storage.getVipBatches();
  res.json({ batches });
});

// VIP Plans (Public View: Only active plans)
app.get('/api/vip/plans', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const plans = storage.getVipPlans(true);
  res.json({ plans });
});

// Authenticated User's Own VIP Payment Claims
app.get('/api/vip/my-payments', authenticate, (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const user = req.user!;
  const payments = storage.getPaymentsByUserId(user.id);
  res.json({ payments });
});

// Backend-Verified Referral Discount Price Preview for Pre-Key & In-App VIP Purchase Pages
app.get('/api/vip/referral-price-preview', authenticate, (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const user = req.user!;
  const planId = typeof req.query.plan_id === 'string' ? req.query.plan_id.trim() : '';
  const activePlans = storage.getVipPlans(true);

  if (planId) {
    const preview = storage.calculateReferralDiscountForUser(user.id, planId);
    res.json({
      referral_program_enabled: storage.isReferralProgramEnabled(),
      preview,
    });
    return;
  }

  const previews: Record<string, ReturnType<typeof storage.calculateReferralDiscountForUser>> = {};
  for (const plan of activePlans) {
    previews[plan.id] = storage.calculateReferralDiscountForUser(user.id, plan.id);
  }
  res.json({
    referral_program_enabled: storage.isReferralProgramEnabled(),
    previews,
  });
});

// Submit VIP QR Payment Claim for Verification (Does NOT auto-activate VIP)
const recentClaimSubmissions = new Map<string, number>();

app.post('/api/vip/payment-claims', authenticate, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (user.is_blocked) {
    res.status(403).json({ error: 'Your account is blocked and cannot submit payment claims.' });
    return;
  }

  // Prevent rapid duplicate submissions caused by repeated button clicks
  const nowMs = Date.now();
  const lastSubmit = recentClaimSubmissions.get(user.id) || 0;
  if (nowMs - lastSubmit < 5000) {
    res.status(429).json({
      error: 'Please wait a few seconds before submitting another payment verification request.',
    });
    return;
  }

  const {
    submitted_email,
    amount,
    plan_id,
    plan_title,
    expected_plan_price,
    transaction_reference,
    screenshot_data_url,
    screenshot_mime_type,
    purchase_source,
    vip_scope,
    selected_platform_id,
    selected_platform_name,
  } = req.body || {};

  // 1. Validate Login Gmail / Email field while linking strictly to authenticated user.id
  const cleanSubmittedEmail = String(submitted_email || user.email || '').trim().toLowerCase();
  if (!cleanSubmittedEmail || cleanSubmittedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanSubmittedEmail)) {
    res.status(400).json({ error: 'Please enter a valid login Gmail / email address.' });
    return;
  }

  // 1b. Duplicate Pending Payment Prevention: Only one active pending request per user
  const existingPending = storage.getActivePendingPaymentByUser(user.id, cleanSubmittedEmail);
  if (existingPending) {
    res.status(409).json({
      code: 'DUPLICATE_PENDING_PAYMENT',
      payment: existingPending,
      error: `You already have a pending payment verification request (${existingPending.request_id || existingPending.id}). Please wait for administrator verification before submitting a new request.`,
    });
    return;
  }

  // 2. Validate VIP Scope (One Platform VIP vs All Platforms VIP) & Authoritative Price from Backend
  const settings = storage.getSettings();
  const resolvedVipScope: 'single_platform' | 'all_platforms' =
    vip_scope === 'single_platform' ? 'single_platform' : 'all_platforms';

  let selectedPlatformRecord: ReturnType<typeof storage.getPlatformById> | undefined = undefined;
  let matchedPlan: ReturnType<typeof storage.getVipPlans>[number] | undefined = undefined;
  let basePlanPrice = 0;

  if (resolvedVipScope === 'single_platform') {
    const cleanPlatformId = String(selected_platform_id || '').trim();
    if (!cleanPlatformId) {
      res.status(400).json({
        code: 'PLATFORM_REQUIRED',
        error: 'Please select a platform for One Platform VIP before submitting payment.',
      });
      return;
    }
    selectedPlatformRecord = storage.getPlatformById(cleanPlatformId);
    if (!selectedPlatformRecord || !selectedPlatformRecord.is_visible || selectedPlatformRecord.status !== 'active') {
      res.status(400).json({
        code: 'PLATFORM_UNAVAILABLE',
        error: 'The selected platform is no longer available. Please refresh and choose an active platform.',
      });
      return;
    }

    const activeSinglePlans = storage
      .getVipPlans(true)
      .filter((p) => p.plan_scope === 'single_platform');
    if (plan_id && !String(plan_id).startsWith('single_platform_')) {
      matchedPlan = activeSinglePlans.find((p) => p.id === String(plan_id));
    }

    if (matchedPlan) {
      basePlanPrice = Number(matchedPlan.price_inr);
    } else {
      basePlanPrice = Number(settings.home_single_vip_price ?? 49);
    }
    if (!Number.isFinite(basePlanPrice) || basePlanPrice <= 0) {
      basePlanPrice = 49;
    }
  } else {
    const activeAllPlans = storage
      .getVipPlans(true)
      .filter((p) => p.plan_scope !== 'single_platform');
    const allPlans = storage.getVipPlans(false);
    matchedPlan = plan_id ? activeAllPlans.find((p) => p.id === String(plan_id)) : undefined;

    if (activeAllPlans.length > 0 && plan_id !== 'all_platforms_default') {
      if (!plan_id) {
        res.status(400).json({
          code: 'PLAN_REQUIRED',
          error: 'Please select a VIP plan before submitting your payment verification request.',
        });
        return;
      }

      if (!matchedPlan) {
        const inactiveMatch = allPlans.find((p) => p.id === String(plan_id));
        res.status(400).json({
          code: 'PLAN_UNAVAILABLE',
          error: inactiveMatch
            ? `The selected VIP plan ("${inactiveMatch.title}") is currently disabled or unavailable. Please select an active plan.`
            : 'The selected VIP plan is no longer available. Please refresh and select an active VIP plan.',
        });
        return;
      }
    } else if (plan_id && plan_id !== 'all_platforms_default' && activeAllPlans.length === 0) {
      res.status(400).json({
        code: 'PLAN_UNAVAILABLE',
        error: 'The selected VIP plan is unavailable.',
      });
      return;
    }

    basePlanPrice = matchedPlan
      ? Number(matchedPlan.price_inr)
      : Number(settings.home_all_vip_price || settings.vip_payment_amount || 149);

    if (matchedPlan && (!Number.isFinite(basePlanPrice) || basePlanPrice <= 0)) {
      res.status(400).json({
        error: 'The selected VIP plan does not have a valid configured price.',
      });
      return;
    }
  }

  // Calculate backend-verified referral discount for this user & plan (never trust frontend discount values)
  const discountPreview =
    matchedPlan
      ? storage.calculateReferralDiscountForUser(user.id, matchedPlan.id)
      : {
          plan_id:
            resolvedVipScope === 'single_platform' && selectedPlatformRecord
              ? `single_platform_${selectedPlatformRecord.id}`
              : String(plan_id || 'all_platforms_default'),
          plan_title:
            resolvedVipScope === 'single_platform' && selectedPlatformRecord
              ? `One Platform VIP — ${selectedPlatformRecord.name}`
              : String(plan_title || 'All Platforms VIP'),
          original_plan_price: basePlanPrice,
          discount_eligible: false,
          discount_applied: 0,
          final_payable_amount: basePlanPrice,
          referral_code_attributed: null,
        };

  const configuredAmount = discountPreview.discount_eligible
    ? discountPreview.final_payable_amount
    : basePlanPrice;

  // Detect if the administrator changed the VIP plan's price between plan selection and submission
  if (matchedPlan && expected_plan_price !== undefined && expected_plan_price !== null) {
    const clientExpectedPrice = Number(expected_plan_price);
    const matchesDiscounted = Math.abs(clientExpectedPrice - configuredAmount) <= 0.01;
    const matchesOriginal = Math.abs(clientExpectedPrice - basePlanPrice) <= 0.01;
    if (!Number.isFinite(clientExpectedPrice) || (!matchesDiscounted && !matchesOriginal)) {
      res.status(409).json({
        code: 'PLAN_PRICE_CHANGED',
        updated_price: configuredAmount,
        original_price: basePlanPrice,
        discount_applied: discountPreview.discount_applied,
        plan: matchedPlan,
        error: `The payable price for "${matchedPlan.title}" was updated to ₹${configuredAmount}. The payment amount has been refreshed—please verify and submit again.`,
      });
      return;
    }
  }

  // 3. Validate Claimed Payment Amount
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 1000000) {
    res.status(400).json({ error: 'Please enter a valid payment amount greater than zero.' });
    return;
  }
  const roundedAmount = Math.round(parsedAmount * 100) / 100;

  const amountMismatch =
    configuredAmount > 0 &&
    Math.abs(roundedAmount - configuredAmount) > 0.01 &&
    Math.abs(roundedAmount - basePlanPrice) > 0.01;

  // 4. Validate Optional/Required Transaction ID / UTR
  const cleanUtr = String(transaction_reference || '').trim().slice(0, 120);
  if (settings.vip_payment_utr_required && !cleanUtr) {
    res.status(400).json({ error: 'Transaction ID / UTR is required for payment verification.' });
    return;
  }

  // Prevent duplicate submission with identical non-empty UTR from same or any user
  if (cleanUtr) {
    const existingWithUtr = storage
      .getPayments()
      .find(
        (p) =>
          p.transaction_reference &&
          p.transaction_reference.toLowerCase() === cleanUtr.toLowerCase() &&
          (p.status === 'pending_verification' || p.status === 'pending' || p.status === 'completed')
      );
    if (existingWithUtr) {
      res.status(409).json({
        error: 'A payment verification claim with this Transaction ID / UTR has already been submitted.',
      });
      return;
    }
  }

  // 5. Validate Payment Screenshot (Required JPG, PNG, or WEBP)
  if (!screenshot_data_url || typeof screenshot_data_url !== 'string') {
    res.status(400).json({ error: 'Payment screenshot image is required.' });
    return;
  }

  const matches = screenshot_data_url.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
  let detectedMime = String(screenshot_mime_type || 'image/png').toLowerCase();
  let base64Data = screenshot_data_url;

  if (matches && matches.length === 3) {
    detectedMime = matches[1].toLowerCase();
    base64Data = matches[2];
  } else if (screenshot_data_url.includes('base64,')) {
    base64Data = screenshot_data_url.split('base64,')[1];
  } else {
    res.status(400).json({ error: 'Invalid screenshot image format.' });
    return;
  }

  const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  if (!allowedMimes.includes(detectedMime)) {
    res.status(400).json({
      error: 'Unsupported screenshot format. Please upload a JPG, PNG, or WEBP image.',
    });
    return;
  }

  const buffer = Buffer.from(base64Data, 'base64');
  const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5MB
  if (buffer.length === 0 || buffer.length > MAX_SCREENSHOT_BYTES) {
    res.status(400).json({
      error: 'Payment screenshot must be a valid image under 5MB.',
    });
    return;
  }

  let ext = 'png';
  if (detectedMime.includes('jpeg') || detectedMime.includes('jpg')) ext = 'jpg';
  else if (detectedMime.includes('webp')) ext = 'webp';

  recentClaimSubmissions.set(user.id, nowMs);

  const safeTimestamp = Date.now();
  const randSuffix = Math.random().toString(36).substring(2, 8);
  const cleanFileName = `payment-proof-${safeTimestamp}-${randSuffix}.${ext}`;
  const localFilePath = path.join(UPLOADS_DIR, cleanFileName);
  let screenshotUrl = '';
  let screenshotStoragePath = '';
  let uploadedToSupabase = false;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isSupabaseConfigured = Boolean(
    supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')
  );

  try {
    // Save local copy in uploads directory for server processing
    fs.writeFileSync(localFilePath, buffer);
    screenshotStoragePath = `uploads/${cleanFileName}`;

    // Also upload to private Supabase Storage if configured
    if (isSupabaseConfigured) {
      try {
        const supabase = createClient(supabaseUrl!, supabaseKey!);
        const { data: bucketData, error: bucketErr } = await supabase.storage.getBucket('payment-screenshots');
        if (bucketErr || !bucketData) {
          await supabase.storage.createBucket('payment-screenshots', {
            public: false, // Strictly private bucket for financial proof security
            fileSizeLimit: MAX_SCREENSHOT_BYTES,
            allowedMimeTypes: allowedMimes,
          });
        }

        const sbPath = `${user.id}/${cleanFileName}`;
        const { error: uploadErr } = await supabase.storage
          .from('payment-screenshots')
          .upload(sbPath, buffer, {
            contentType: detectedMime,
            upsert: false,
          });

        if (!uploadErr) {
          uploadedToSupabase = true;
          screenshotStoragePath = sbPath;
        }
      } catch {
        // Keep local file upload if Supabase Storage bucket is unreachable
      }
    }

    // 6. Save claim record in database with status 'pending_verification' and immutable plan/price snapshot
    const resolvedPlanTitle =
      resolvedVipScope === 'single_platform' && selectedPlatformRecord
        ? matchedPlan
          ? `${matchedPlan.title} — ${selectedPlatformRecord.name}`
          : `One Platform VIP — ${selectedPlatformRecord.name}`
        : matchedPlan
        ? matchedPlan.title
        : plan_title
        ? String(plan_title).trim().slice(0, 120)
        : 'All Platforms VIP';

    const resolvedPlanDurationDays =
      resolvedVipScope === 'single_platform'
        ? matchedPlan
          ? Number(matchedPlan.duration_days) || Math.max(1, Number(settings.home_single_vip_duration_days ?? 30) || 30)
          : Math.max(1, Number(settings.home_single_vip_duration_days ?? 30) || 30)
        : matchedPlan
        ? Number(matchedPlan.duration_days) || 30
        : Math.max(1, Number(settings.home_all_vip_duration_days ?? 30) || 30);
    const resolvedBonusDays =
      matchedPlan && matchedPlan.bonus_days
        ? Math.max(0, Number(matchedPlan.bonus_days) || 0)
        : 0;
    const resolvedPurchaseSource: 'pre_key' | 'in_app' = purchase_source === 'pre_key' ? 'pre_key' : 'in_app';
    const requestId = storage.generatePaymentRequestId();

    const record = await storage.addPayment({
      request_id: requestId,
      user_id: user.id,
      email: user.email,
      submitted_email: cleanSubmittedEmail,
      plan_id:
        matchedPlan
          ? matchedPlan.id
          : resolvedVipScope === 'single_platform' && selectedPlatformRecord
          ? `single_platform_${selectedPlatformRecord.id}`
          : String(plan_id || 'all_platforms_default'),
      plan_title: resolvedPlanTitle,
      vip_scope: resolvedVipScope,
      selected_platform_id:
        resolvedVipScope === 'single_platform' && selectedPlatformRecord ? selectedPlatformRecord.id : null,
      selected_platform_name:
        resolvedVipScope === 'single_platform' && selectedPlatformRecord
          ? selectedPlatformRecord.name
          : selected_platform_name
          ? String(selected_platform_name).trim().slice(0, 120)
          : null,
      plan_duration_days: resolvedPlanDurationDays,
      bonus_days_applied: resolvedBonusDays,
      original_plan_price: basePlanPrice > 0 ? basePlanPrice : roundedAmount,
      referral_discount_applied: discountPreview.discount_eligible ? discountPreview.discount_applied : 0,
      referral_code_used: discountPreview.referral_code_attributed || null,
      referrer_user_id: user.referred_by_user_id || null,
      purchase_source: resolvedPurchaseSource,
      amount: roundedAmount,
      expected_amount: configuredAmount > 0 ? configuredAmount : undefined,
      amount_mismatch: amountMismatch,
      currency: 'INR',
      status: 'pending_verification',
      payment_method: 'qr_verification',
      transaction_reference: cleanUtr || `CLAIM-${safeTimestamp}`,
      screenshot_url: '',
      screenshot_storage_path: screenshotStoragePath,
    });

    // Update screenshot_url to the protected admin screenshot route
    screenshotUrl = `/api/admin/payments/${record.id}/screenshot`;
    await storage.updatePayment(record.id, { screenshot_url: screenshotUrl });

    // Update referral tracking record to pending_verification (never counted as sale until approved)
    storage.recordReferralPaymentSubmitted(user.id, record);

    // Create Smart Notification for the student
    storage.addStudentNotification({
      user_id: user.id,
      type: 'payment_submitted',
      title: 'VIP Payment Verification Submitted',
      message: `Your payment request (${requestId}) for ${resolvedPlanTitle} (₹${roundedAmount}) has been submitted and is pending administrator verification.`,
      action_tab: 'vip',
    });

    res.status(201).json({
      success: true,
      payment: record,
      message:
        'Payment claim submitted for verification. Payment verification usually takes up to 24 hours.',
    });
  } catch (err) {
    // Clean up orphaned screenshot uploads when database saving fails
    recentClaimSubmissions.delete(user.id);
    try {
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
      }
    } catch {
      // Ignore cleanup error
    }
    if (uploadedToSupabase && isSupabaseConfigured && screenshotStoragePath) {
      try {
        const supabase = createClient(supabaseUrl!, supabaseKey!);
        await supabase.storage.from('payment-screenshots').remove([screenshotStoragePath]);
      } catch {
        // Ignore cleanup error
      }
    }
    res.status(500).json({
      error:
        err instanceof Error
          ? err.message
          : 'Failed to save payment verification claim. Please try again.',
    });
  }
});

// Announcements (Public View: Published only)
app.get('/api/announcements', (_req, res) => {
  const announcements = storage.getAnnouncements(true);
  res.json({ announcements });
});

// ----------------------------------------------------
// Authentication APIs
// ----------------------------------------------------

app.post('/api/auth/register', async (req, res) => {
  const { email, password, referral_code } = req.body || {};
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const settings = storage.getSettings();

  if (!settings.login_enabled) {
    res.status(403).json({ error: 'Registration is temporarily disabled by administrator.' });
    return;
  }

  const rateCheck = checkAuthRateLimit(`register:${clientIp}`);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
    res.status(429).json({
      error: `Too many registration attempts. Please wait ${rateCheck.retryAfterSec} seconds and try again.`,
    });
    return;
  }

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Valid email and password are required.' });
    return;
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (trimmedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  if (password.length < 6 || password.length > 128) {
    res.status(400).json({ error: 'Password must be between 6 and 128 characters long.' });
    return;
  }

  if (trimmedEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
    res.status(403).json({ error: 'This email address is reserved and cannot be registered publicly.' });
    return;
  }

  const existing = storage.getUserByEmail(trimmedEmail);
  if (existing) {
    recordFailedAuthAttempt(`register:${clientIp}`);
    res.status(409).json({ error: 'An account with this email address already exists.' });
    return;
  }

  // Validate optional Referral Code BEFORE creating the user account
  // Note: Attribution tracking is preserved even when Global Referral Program is OFF;
  // discounts and rewards apply strictly according to enabled settings.
  const cleanReferralCode = typeof referral_code === 'string' ? referral_code.trim().toUpperCase() : '';
  if (cleanReferralCode) {
    if (!cleanReferralCode.startsWith('SF-REF-')) {
      res.status(400).json({
        code: 'INVALID_REFERRAL_CODE',
        error: 'Please enter a valid Study Fox referral code (e.g., SF-REF-XXXXXX).',
      });
      return;
    }
    for (const u of storage.getUsers()) {
      storage.ensureUserReferralCode(u.id);
    }
    const matchedReferrer = storage.getUsers().find((u) => u.referral_code?.toUpperCase() === cleanReferralCode);
    if (!matchedReferrer) {
      res.status(400).json({
        code: 'REFERRAL_NOT_FOUND',
        error: 'Referral code not found. Please check the code or leave it blank.',
      });
      return;
    }
    if (matchedReferrer.email.toLowerCase() === trimmedEmail) {
      res.status(400).json({
        code: 'SELF_REFERRAL_BLOCKED',
        error: 'Self-referral is not allowed. You cannot use your own referral code.',
      });
      return;
    }
    const referrerPerms = storage.getUserReferralPermissions(matchedReferrer.id);
    if (!referrerPerms.can_create_share_referral_link) {
      res.status(400).json({
        code: 'REFERRER_LINK_DISABLED',
        error: 'This referral code is currently inactive.',
      });
      return;
    }
  }

  try {
    const userAgent = req.headers['user-agent'] || 'Unknown Browser';
    const deviceId = extractRequestDeviceId(req);
    const deviceLabel = parseDeviceLabel(userAgent, req.body?.device_label as string);
    const nowIso = new Date().toISOString();

    const newUser = await storage.createUser({
      id: crypto.randomUUID(),
      email: trimmedEmail,
      password_hash: hashPassword(password),
      role: 'user',
      vip_active: false,
      vip_expires_at: null,
      created_at: nowIso,
      last_login_at: nowIso,
    });

    const token = generateToken(newUser);
    const newJti = extractTokenJti(token) || '';

    if (deviceId) {
      storage.bindOrVerifyVipDevice(
        newUser.id,
        deviceId,
        newJti,
        deviceLabel,
        clientIp,
        userAgent,
        true
      );
    }

    let referralAttributionResult = undefined;
    if (cleanReferralCode) {
      const targetStudent = storage.getUserById(newUser.id) || newUser;
      referralAttributionResult = storage.applyReferralCode(targetStudent, cleanReferralCode, clientIp, deviceId);
    }

    const finalUser = storage.getUserById(newUser.id) || newUser;
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: toPublicUser(finalUser, deviceId),
      ...(referralAttributionResult && { referral_result: referralAttributionResult }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database error while saving user registration.';
    console.error('[AUTH REGISTER FAILURE]', err);
    res.status(500).json({ error: msg });
  }
});

async function verifyUserCredentials(email: string, password: string) {
  const trimmedEmail = email.trim().toLowerCase();
  // Always sync latest VIP, free access, and block state from Supabase app_users before verifying login
  let localUser = await storage.syncUserFromSupabase({ email: trimmedEmail });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isSupabaseConfigured = Boolean(
    supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project')
  );

  // Check if account is backed by Supabase Auth (UUID id or not yet present locally)
  const isUuid = localUser ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localUser.id) : false;

  if (isSupabaseConfigured && (isUuid || !localUser)) {
    try {
      const sbClient = createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await sbClient.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (!error && data?.user) {
        const sbUser = data.user;
        // Enforce email verification if required by Supabase Auth
        if (!sbUser.email_confirmed_at) {
          return { user: null, error: 'Email address has not been verified.' };
        }

        // Derive role strictly from trusted server-side storage or service-role app_metadata (never user_metadata)
        const appMetaRole = sbUser.app_metadata?.role;
        const trustedRole: 'user' | 'admin' | 'super_admin' =
          localUser?.role ||
          (appMetaRole === 'super_admin' || appMetaRole === 'admin' ? appMetaRole : 'user');

        if (!localUser) {
          localUser = await storage.createUser({
            id: sbUser.id,
            email: trimmedEmail,
            password_hash: hashPassword(password),
            role: trustedRole,
            vip_active: trustedRole === 'super_admin' || trustedRole === 'admin',
            vip_expires_at: null,
            created_at: sbUser.created_at || new Date().toISOString(),
            last_login_at: null,
          });
        } else if (!verifyPassword(password, localUser.password_hash) || localUser.role !== trustedRole) {
          localUser = await storage.updateUser(localUser.id, {
            password_hash: hashPassword(password),
            role: trustedRole,
          });
        }

        return { user: localUser, error: null };
      }

      // If Supabase Auth did not match (e.g. account was registered via /api/auth/register in app_users),
      // fall through to verify against localUser.password_hash below.
    } catch {
      // Fall back to local scrypt verification if network/Supabase is temporarily unreachable
    }
  }

  if (localUser && verifyPassword(password, localUser.password_hash)) {
    return { user: localUser, error: null };
  }

  return { user: null, error: 'Invalid credentials' };
}

app.post('/api/auth/login', async (req, res) => {
  try {
  const { email, password } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (trimmedEmail.length > 254 || password.length > 128) {
    res.status(400).json({ error: 'Invalid email or password format.' });
    return;
  }

  const rateKey = `login:${clientIp}:${trimmedEmail}`;
  const rateCheck = checkAuthRateLimit(rateKey);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
    res.status(429).json({
      error: `Too many failed login attempts. Please wait ${rateCheck.retryAfterSec} seconds before trying again.`,
    });
    return;
  }

  const { user, error: authErr } = await verifyUserCredentials(trimmedEmail, password);

  if (!user) {
    recordFailedAuthAttempt(rateKey);
    const existing = storage.getUserByEmail(trimmedEmail);
    await storage.recordLogin({
      user_id: existing ? existing.id : 'unknown',
      email: trimmedEmail,
      ip_address: clientIp,
      user_agent: userAgent,
      status: 'failed',
    });
    res.status(401).json({ error: authErr === 'Email address has not been verified.' ? authErr : 'Invalid email or password.' });
    return;
  }

  if (user.is_blocked) {
    await storage.recordLogin({
      user_id: user.id,
      email: user.email,
      ip_address: clientIp,
      user_agent: `${userAgent} [BLOCKED_USER]`,
      status: 'failed',
    });
    res.status(403).json({
      error: `Your account has been blocked by an administrator.${user.blocked_reason ? ' Reason: ' + user.blocked_reason : ''}`,
      code: 'ACCOUNT_BLOCKED',
    });
    return;
  }

  clearFailedAuthAttempts(rateKey);

  const settings = storage.getSettings();
  // If login is disabled, only admins and super admins can log in
  if (!settings.login_enabled && user.role !== 'admin' && user.role !== 'super_admin') {
    res.status(403).json({
      error: 'User login is temporarily disabled for maintenance or system updates. Please try again later.',
    });
    return;
  }

  // Enforce server-side VIP & free access expiration before issuing login response
  await storage.enforceUserAccessExpiration(user.id);

  const updatedUser = storage.getUserById(user.id)!;
  const deviceId = extractRequestDeviceId(req);
  const deviceLabel = parseDeviceLabel(userAgent, req.body?.device_label as string);

  // Enforce Single-Device Primary Registration for Student Accounts:
  // - First Login (Device A): Saves Device A as the user's registered primary device and allows login.
  // - Same Device Login (Device A Again): Recognizes Device A and allows login normally.
  // - Second Device Attempt (Device B): Rejects login on Device B ONLY without blocking the user account or revoking Device A.
  if (updatedUser.role === 'user' && (deviceId || updatedUser.vip_bound_device_id)) {
    const bindCheck = storage.bindOrVerifyVipDevice(
      updatedUser.id,
      deviceId,
      '',
      deviceLabel,
      clientIp,
      userAgent,
      true
    );

    if (!bindCheck.allowed) {
      const boundName = bindCheck.boundDeviceLabel || 'Registered Primary Device';
      await storage.recordLogin({
        user_id: updatedUser.id,
        email: updatedUser.email,
        ip_address: clientIp,
        user_agent: `${userAgent} (${deviceLabel})`,
        status: 'DEVICE_MISMATCH_BLOCKED',
      });
      await storage.addVipDeviceLog({
        user_id: updatedUser.id,
        email: updatedUser.email,
        event_type: 'device_mismatch_blocked',
        attempted_device_id: deviceId || 'MISSING_DEVICE_ID',
        bound_device_id: updatedUser.vip_bound_device_id || null,
        device_label: deviceLabel,
        ip_address: clientIp,
        user_agent: userAgent,
        reason: 'Login rejected on unauthorized second device while account is registered to primary device.',
      });
      res.status(403).json({
        error: 'This account is already registered on another device. Please log in from your original device or contact admin.',
        code: 'DEVICE_MISMATCH_BLOCKED',
        bound_device_label: boundName,
      });
      return;
    }
  }

  const token = generateToken(updatedUser);
  const newJti = extractTokenJti(token) || '';

  if (updatedUser.role === 'user' && deviceId) {
    const afterBindUser = storage.getUserById(updatedUser.id) || updatedUser;
    if (
      afterBindUser.vip_bound_device_id &&
      afterBindUser.vip_bound_device_id === deviceId &&
      afterBindUser.vip_bound_session_id &&
      afterBindUser.vip_bound_session_id !== newJti
    ) {
      revokeTokenJti(afterBindUser.vip_bound_session_id);
      await storage.addVipDeviceLog({
        user_id: afterBindUser.id,
        email: afterBindUser.email,
        event_type: 'vip_session_replaced',
        attempted_device_id: deviceId,
        bound_device_id: afterBindUser.vip_bound_device_id,
        device_label: deviceLabel,
        ip_address: clientIp,
        user_agent: userAgent,
        reason: 'Previous session token on registered primary device replaced by new login.',
      });
    }
    storage.bindOrVerifyVipDevice(
      updatedUser.id,
      deviceId,
      newJti,
      deviceLabel,
      clientIp,
      userAgent,
      true
    );
  }

  // Update last login & award daily login XP (idempotent once per IST calendar day)
  await storage.updateUser(user.id, { last_login_at: new Date().toISOString() });
  try {
    storage.awardDailyLoginXp(user.id);
  } catch {
    // Non-blocking XP award
  }

  // Optional referral code attribution on login (if provided)
  const rawReferralCode = typeof req.body?.referral_code === 'string' ? req.body.referral_code.trim().toUpperCase() : '';
  if (rawReferralCode) {
    const currentStudent = storage.getUserById(user.id)!;
    // Allow idempotent re-login if the exact same referral code was already linked to this user
    if (currentStudent.referred_by_code?.toUpperCase() !== rawReferralCode) {
      const refResult = storage.applyReferralCode(
        currentStudent,
        rawReferralCode,
        clientIp,
        deviceId,
        { allowAttributionWhenProgramOff: true }
      );
      if (!refResult.success) {
        res.status(400).json({
          code: refResult.code || 'REFERRAL_ERROR',
          error: refResult.error || 'Invalid referral code.',
        });
        return;
      }
    }
  }

  // Record successful login history
  await storage.recordLogin({
    user_id: user.id,
    email: user.email,
    ip_address: clientIp,
    user_agent: userAgent,
    status: 'success',
  });

  const finalUser = storage.getUserById(user.id)!;

  res.json({
    message: 'Login successful',
    token,
    user: toPublicUser(finalUser, deviceId),
  });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Login failed due to server error.';
    console.error('[AUTH LOGIN FAILURE]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    }
  }
});

app.post('/api/auth/admin-login', async (req, res) => {
  try {
  const { email, password } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (trimmedEmail.length > 254 || password.length > 128) {
    res.status(400).json({ error: 'Invalid administrator credentials.' });
    return;
  }

  const rateKey = `admin-login:${clientIp}:${trimmedEmail}`;
  const rateCheck = checkAuthRateLimit(rateKey);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
    res.status(429).json({
      error: `Too many failed administrator login attempts. Please wait ${rateCheck.retryAfterSec} seconds before trying again.`,
    });
    return;
  }

  const { user } = await verifyUserCredentials(trimmedEmail, password);

  if (!user) {
    recordFailedAuthAttempt(rateKey);
    const existing = storage.getUserByEmail(trimmedEmail);
    await storage.recordLogin({
      user_id: existing ? existing.id : 'unknown',
      email: trimmedEmail,
      ip_address: clientIp,
      user_agent: userAgent,
      status: 'failed',
    });
    res.status(401).json({ error: 'Invalid administrator credentials.' });
    return;
  }

  // Server-side RBAC verification: Only admin and super_admin permitted
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    recordFailedAuthAttempt(rateKey);
    await storage.recordLogin({
      user_id: user.id,
      email: user.email,
      ip_address: clientIp,
      user_agent: `${userAgent} [DENIED_ADMIN_ATTEMPT]`,
      status: 'failed',
    });
    res.status(403).json({
      error: 'Access Denied: Administrative privileges required. Normal student accounts cannot log in to the Admin Panel.',
    });
    return;
  }

  if (user.is_blocked) {
    await storage.recordLogin({
      user_id: user.id,
      email: user.email,
      ip_address: clientIp,
      user_agent: `${userAgent} [BLOCKED_ADMIN]`,
      status: 'failed',
    });
    res.status(403).json({
      error: `Your administrator account has been suspended.${user.blocked_reason ? ' Reason: ' + user.blocked_reason : ''}`,
      code: 'ACCOUNT_BLOCKED',
    });
    return;
  }

  clearFailedAuthAttempts(rateKey);

  // Update last login
  await storage.updateUser(user.id, { last_login_at: new Date().toISOString() });

  // Record login history
  await storage.recordLogin({
    user_id: user.id,
    email: user.email,
    ip_address: clientIp,
    user_agent: `${userAgent} [ADMIN_PORTAL]`,
    status: 'success',
  });

  const updatedUser = storage.getUserById(user.id)!;
  const token = generateToken(updatedUser);

  res.json({
    message: 'Administrative login successful',
    token,
    user: toPublicUser(updatedUser),
  });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Administrative login failed due to server error.';
    console.error('[AUTH ADMIN LOGIN FAILURE]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
    }
  }
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    revokeToken(token);
  }
  res.json({ message: 'Logged out successfully.' });
});

// Forgot Password & Password Recovery System (Supabase Auth + Signed Single-Use Recovery Token)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'Please enter your registered email address.' });
    return;
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (trimmedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  const rateKey = `forgot-pwd:${clientIp}:${trimmedEmail}`;
  const rateCheck = checkAuthRateLimit(rateKey);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
    res.status(429).json({
      error: `Too many password reset requests. Please wait ${rateCheck.retryAfterSec} seconds before trying again.`,
    });
    return;
  }
  recordFailedAuthAttempt(rateKey);

  // Sync or lookup user without exposing sensitive account details
  const user = (await storage.syncUserFromSupabase({ email: trimmedEmail })) || storage.getUserByEmail(trimmedEmail);
  if (!user) {
    res.json({
      success: true,
      registered: false,
      message:
        'If this email address is registered with Study Fox, a secure password reset link has been sent to your inbox.',
    });
    return;
  }

  if (user.is_blocked) {
    res.status(403).json({
      error: 'Your account has been suspended by an administrator. Please contact support for assistance.',
      code: 'ACCOUNT_BLOCKED',
    });
    return;
  }

  try {
    const originHeader =
      (req.headers.origin as string) ||
      (req.headers.host ? `${req.protocol || 'https'}://${req.headers.host}` : 'http://localhost:3000');

    const { rawToken, expiresAt } = await storage.createPasswordResetToken(user.id, user.email);
    const resetLink = `${originHeader.replace(/\/$/, '')}/?reset_token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(user.email)}`;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isSupabaseConfigured = Boolean(
      supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project')
    );

    let supabaseEmailDispatched = false;
    if (isSupabaseConfigured) {
      try {
        const sbClient = createClient(supabaseUrl!, supabaseAnonKey!, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: resetErr } = await sbClient.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: resetLink,
        });
        if (!resetErr) {
          supabaseEmailDispatched = true;
        }
      } catch {
        // Fallback to signed Study Fox recovery link if Supabase SMTP is rate-limited or unreachable
      }
    }

    res.json({
      success: true,
      registered: true,
      email_sent: supabaseEmailDispatched,
      reset_link: resetLink,
      expires_at: expiresAt,
      message: supabaseEmailDispatched
        ? 'A password reset link has been sent to your registered email address via Supabase Auth. Please check your inbox (and spam folder).'
        : 'Password reset link generated securely. Open the reset link to set your new password.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to initiate password recovery. Please try again.';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, access_token, new_password, confirm_password } = req.body || {};
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

  const rateKey = `reset-pwd:${clientIp}`;
  const rateCheck = checkAuthRateLimit(rateKey);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
    res.status(429).json({
      error: `Too many password reset attempts. Please wait ${rateCheck.retryAfterSec} seconds and try again.`,
    });
    return;
  }

  if (!new_password || typeof new_password !== 'string') {
    res.status(400).json({ error: 'Please enter a new password.' });
    return;
  }

  if (new_password.length < 6 || new_password.length > 128) {
    res.status(400).json({ error: 'New password must be between 6 and 128 characters long.' });
    return;
  }

  if (confirm_password !== undefined && new_password !== confirm_password) {
    res.status(400).json({ error: 'New password and confirm password do not match.' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || supabaseServiceKey;
  const isSupabaseConfigured = Boolean(
    supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-project')
  );

  let targetUser = undefined as ReturnType<typeof storage.getUserById>;

  // Path 1: Verify single-use signed Study Fox recovery token if provided
  if (token && typeof token === 'string' && token.trim()) {
    const verification = await storage.verifyAndConsumePasswordResetToken(token.trim());
    if (!verification.valid) {
      // If an access_token from Supabase Auth hash fragment was ALSO provided, try that before failing
      if (!access_token || typeof access_token !== 'string' || !access_token.trim()) {
        recordFailedAuthAttempt(rateKey);
        res.status(400).json({
          error: verification.error || 'This password reset link is invalid, expired, or has already been used.',
          code: verification.code || 'INVALID_TOKEN',
        });
        return;
      }
    } else if (verification.user) {
      targetUser = verification.user;
    }
  }

  // Path 2: Verify Supabase Auth recovery access_token if targetUser not yet resolved
  if (!targetUser && access_token && typeof access_token === 'string' && access_token.trim() && isSupabaseConfigured) {
    try {
      const sbClient = createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData, error: userErr } = await sbClient.auth.getUser(access_token.trim());
      if (!userErr && userData?.user?.email) {
        const sbEmail = userData.user.email.trim().toLowerCase();
        targetUser =
          (await storage.syncUserFromSupabase({ id: userData.user.id, email: sbEmail })) ||
          storage.getUserByEmail(sbEmail);
      }
    } catch {
      // Handled below if targetUser remains undefined
    }
  }

  if (!targetUser) {
    recordFailedAuthAttempt(rateKey);
    res.status(400).json({
      error: 'This password reset link is invalid, expired, or has already been used. Please request a new reset link.',
      code: 'INVALID_OR_EXPIRED_RESET_LINK',
    });
    return;
  }

  if (targetUser.is_blocked) {
    res.status(403).json({
      error: 'Your account has been blocked by an administrator and cannot reset its password.',
      code: 'ACCOUNT_BLOCKED',
    });
    return;
  }

  try {
    // 1. Update password hash in Study Fox database (scrypt salted hash — never plain text)
    const newHash = hashPassword(new_password);
    await storage.updateUser(targetUser.id, {
      password_hash: newHash,
    });

    // 2. Also update password in Supabase Auth if configured so both auth layers stay in sync
    if (isSupabaseConfigured && supabaseServiceKey) {
      try {
        const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUser.id);
        let updatedInSbAuth = false;
        if (isUuid) {
          const { error: sbErr } = await sbAdmin.auth.admin.updateUserById(targetUser.id, {
            password: new_password,
            email_confirm: true,
          });
          if (!sbErr) updatedInSbAuth = true;
        }
        if (!updatedInSbAuth) {
          const { data: listData } = await sbAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const matchedSbUser = listData?.users?.find(
            (u: { id: string; email?: string }) => u.email?.toLowerCase() === targetUser!.email.toLowerCase()
          );
          if (matchedSbUser) {
            await sbAdmin.auth.admin.updateUserById(matchedSbUser.id, {
              password: new_password,
              email_confirm: true,
            });
          }
        }
      } catch {
        // Non-fatal if user only exists in app_users table
      }
    }

    // 3. Revoke prior sessions so any compromised old tokens are invalidated
    revokeUserSessions(targetUser.id);
    clearFailedAuthAttempts(rateKey);

    res.json({
      success: true,
      message: 'Your password has been updated successfully! You can now log in with your new password.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update password. Please try again.';
    res.status(500).json({ error: msg });
  }
});

app.get('/api/auth/me', authenticate, async (req: AuthenticatedRequest, res) => {
  const reqUser = req.user!;
  const deviceId = extractRequestDeviceId(req);
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';
  const deviceLabel = parseDeviceLabel(userAgent, req.headers['x-device-label'] as string);

  // Sync latest VIP, free access, and block state from Supabase app_users
  const syncedUser = (await storage.syncUserFromSupabase({ id: reqUser.id, email: reqUser.email })) || reqUser;
  if (syncedUser.is_blocked) {
    res.status(403).json({
      error: `Your account has been blocked by an administrator.${syncedUser.blocked_reason ? ' Reason: ' + syncedUser.blocked_reason : ''}`,
      code: 'ACCOUNT_BLOCKED',
      blocked_reason: syncedUser.blocked_reason || null,
    });
    return;
  }

  // Enforce server-side VIP & free access expiration
  await storage.enforceUserAccessExpiration(syncedUser.id);

  const user = storage.getUserById(syncedUser.id) || syncedUser;

  if (user.role === 'user' && deviceId) {
    const bindCheck = storage.bindOrVerifyVipDevice(
      user.id,
      deviceId,
      req.tokenJti || '',
      deviceLabel,
      clientIp,
      userAgent,
      true
    );
    if (!bindCheck.allowed) {
      res.status(403).json({
        error: 'This account is already registered on another device. Please log in from your original device or contact admin.',
        code: 'DEVICE_MISMATCH_BLOCKED',
        bound_device_label: bindCheck.boundDeviceLabel || 'Registered Primary Device',
      });
      return;
    }
  }

  const latestUser = storage.getUserById(user.id) || user;
  try {
    storage.awardDailyLoginXp(latestUser.id);
  } catch {
    // Non-blocking daily login XP award
  }
  res.json({ user: toPublicUser(latestUser, deviceId) });
});

// Key Generation & Session Activation APIs
// Step 1: Initiate VPLINK flow when user clicks "Generate New Key" (does NOT generate a key or grant access)
app.post('/api/key/generate', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const settings = storage.getSettings();

  if (!settings.key_generation_enabled) {
    res.status(400).json({ error: 'Key generation is currently disabled by administrator.' });
    return;
  }

  const originHeader = req.headers.origin || (req.headers.host ? `${req.protocol || 'https'}://${req.headers.host}` : undefined);
  const pending = storage.createPendingKeyVerification(user.id, user.email, originHeader as string | undefined);

  // CRITICAL: Only returns the flow ID, start time, and configured VPLINK shortener URL.
  // No key is generated or revealed here, and Home access is NOT granted.
  res.json({
    pending: true,
    flow_id: pending.flow_id,
    target_url: pending.target_url,
    shortener_url: pending.target_url,
    callback_url: pending.callback_url,
    started_at: pending.started_at,
    earliest_key_at: pending.earliest_key_at,
    min_wait_seconds: pending.min_wait_seconds,
    expires_at: pending.expires_at,
    message: 'Shortener flow initiated. Complete the shortener process and return after the required time to click Get Key.',
  });
});

// Check current key-generation flow timing from trusted server timestamp (survives page refresh)
app.get('/api/key/flow-status', authenticate, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const flowId = typeof req.query.flow_id === 'string' ? req.query.flow_id.trim() : undefined;
  const status = await storage.getKeyFlowStatus(user.id, flowId);
  res.json(status);
});

// Step 3: Generate and return a unique key when user returns from VPLINK after at least 200 seconds and clicks "Get Key"
app.post('/api/key/get-key', authenticate, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const settings = storage.getSettings();

  if (!settings.key_generation_enabled) {
    res.status(400).json({ error: 'Key generation is currently disabled by administrator.' });
    return;
  }

  const flowId = (req.body?.flow_id || req.body?.verification_token || '') as string;
  const result = await storage.claimGeneratedKey(user.id, user.email, flowId);

  if (!result.success || !result.key) {
    const status = result.code === 'RATE_LIMITED' || result.code === 'CLAIM_IN_PROGRESS' ? 429 : 400;
    res.status(status).json({
      error: result.error || 'Failed to generate access key. Please try again.',
      code: result.code || 'KEY_GENERATION_FAILED',
      ...(result.started_at !== undefined && { started_at: result.started_at }),
      ...(result.earliest_key_at !== undefined && { earliest_key_at: result.earliest_key_at }),
      ...(result.min_wait_seconds !== undefined && { min_wait_seconds: result.min_wait_seconds }),
      ...(result.elapsed_seconds !== undefined && { elapsed_seconds: result.elapsed_seconds }),
      ...(result.remaining_seconds !== undefined && { remaining_seconds: result.remaining_seconds }),
    });
    return;
  }

  res.json({
    success: true,
    key: result.key,
    generated_at: result.generated_at,
    expires_at: result.expires_at,
    message: 'Unique key generated! Copy your key and paste it below to verify.',
  });
});

// Step 4: Verify pasted key and activate exact 24-hour free access
app.post('/api/key/verify', authenticate, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const settings = storage.getSettings();

  if (!settings.key_generation_enabled) {
    res.status(400).json({ error: 'Key generation is currently disabled by administrator.' });
    return;
  }

  const submittedKey = (req.body?.key ?? req.body?.token ?? req.query.token ?? '') as string;
  if (!String(submittedKey).trim()) {
    res.status(400).json({
      error: 'Please paste or enter your access key before clicking Verify Key.',
      code: 'EMPTY_KEY',
    });
    return;
  }

  const deviceId = extractRequestDeviceId(req);
  const result = await storage.verifyAndActivateKey(user.id, submittedKey);
  if (!result.success) {
    res.status(400).json({
      error: result.error || 'Invalid or expired key. Please generate a new key.',
      code: result.code || 'VERIFICATION_FAILED',
    });
    return;
  }

  res.json({
    success: true,
    key_record: result.key_record,
    user: result.user ? toPublicUser(result.user, deviceId) : undefined,
    verified_at: result.verified_at,
    expires_at: result.expires_at,
    message: 'Key verified successfully! 24-hour platform access is now active.',
  });
});

app.post('/api/key/activate', authenticate, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const submittedKey = (req.body?.key ?? req.body?.token ?? req.query.token ?? '') as string;
  if (!String(submittedKey).trim()) {
    res.status(400).json({
      error: 'Invalid or expired key. Please generate a new key.',
      code: 'EMPTY_KEY',
    });
    return;
  }

  const deviceId = extractRequestDeviceId(req);
  const result = await storage.verifyAndActivateKey(user.id, submittedKey);
  if (!result.success) {
    res.status(400).json({
      error: result.error || 'Invalid or expired key. Please generate a new key.',
      code: result.code || 'VERIFICATION_FAILED',
    });
    return;
  }
  res.json({
    success: true,
    key_record: result.key_record,
    user: result.user ? toPublicUser(result.user, deviceId) : undefined,
    verified_at: result.verified_at,
    expires_at: result.expires_at,
    message: 'Access successfully verified and activated!',
  });
});

// ----------------------------------------------------
// Admin APIs (Require Admin or Super Admin)
// ----------------------------------------------------

// 1. Dashboard Stats
app.get('/api/admin/stats', authenticate, requireAdminPermission('dashboard', 'view'), (_req, res) => {
  const users = storage.getUsers();
  const platforms = storage.getPlatforms();
  const plans = storage.getVipPlans();
  const history = storage.getLoginHistory();
  const payments = storage.getPayments();

  const now = Date.now();
  const activeVipCount = users.filter((u) => {
    if (!u.vip_active) return false;
    if (u.vip_expires_at && new Date(u.vip_expires_at).getTime() < now) return false;
    return true;
  }).length;

  const activeKeyCount = storage.getActiveKeysCount();

  res.json({
    total_users: users.length,
    active_vips: activeVipCount,
    active_keys: activeKeyCount,
    total_platforms: platforms.length,
    active_platforms: platforms.filter((p) => p.status === 'active' && p.is_visible).length,
    total_plans: plans.length,
    total_payments: payments.length,
    recent_logins_count: history.length,
  });
});

// 2. Platform Management
app.get('/api/admin/platforms', authenticate, requireAdminPermission('platforms', 'view'), (_req, res) => {
  res.json({ platforms: storage.getPlatforms(false) });
});

app.post('/api/admin/platforms', authenticate, requireAdminPermission('platforms', 'add'), async (req: AuthenticatedRequest, res) => {
  const { name, category, logo_url, target_url, access_type, vip_target_url, status, is_visible, display_order } = req.body;
  if (!name || !String(name).trim() || !target_url || !String(target_url).trim()) {
    res.status(400).json({ error: 'Platform name and destination URL are required.' });
    return;
  }

  const trimmedTargetUrl = String(target_url).trim();
  if (!isSafeHttpUrl(trimmedTargetUrl)) {
    res.status(400).json({ error: 'Destination URL must be a valid URL starting with http:// or https://' });
    return;
  }

  const accessType = access_type === 'vip' ? 'vip' : 'normal';
  const trimmedVipTargetUrl = String(vip_target_url || '').trim();
  if (trimmedVipTargetUrl && !isSafeHttpUrl(trimmedVipTargetUrl)) {
    res.status(400).json({ error: 'VIP Redirect URL must be a valid URL starting with http:// or https://' });
    return;
  }

  const trimmedLogoUrl = String(logo_url || '').trim();
  if (trimmedLogoUrl && !isSafeHttpUrl(trimmedLogoUrl) && !trimmedLogoUrl.startsWith('/') && !trimmedLogoUrl.startsWith('data:image/')) {
    res.status(400).json({ error: 'Logo URL must start with http://, https://, or be an uploaded image.' });
    return;
  }

  const now = new Date().toISOString();
  try {
    const platform = await storage.addPlatform({
      id: crypto.randomUUID(),
      name: String(name).trim(),
      category: String(category || '').trim() || 'General',
      logo_url: trimmedLogoUrl,
      target_url: trimmedTargetUrl,
      access_type: accessType,
      vip_target_url: trimmedVipTargetUrl,
      status: status === 'inactive' ? 'inactive' : 'active',
      is_visible: is_visible !== false,
      display_order: Number(display_order) || 0,
      created_at: now,
      updated_at: now,
    });
    if (req.user) {
      storage.recordAdminAuditLog({
        admin_id: req.user.id,
        admin_email: req.user.email,
        admin_role: req.user.role,
        section: 'platforms',
        action_type: 'platform_change',
        target_id: platform.id,
        description: `Created platform "${platform.name}" (${platform.access_type})`,
        previous_value: null,
        new_value: { name: platform.name, category: platform.category, access_type: platform.access_type },
      });
    }
    broadcastPlatformsUpdate();
    res.status(201).json({ platform });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save platform in database.';
    res.status(500).json({ error: msg });
  }
});

app.put('/api/admin/platforms/:id', authenticate, requireAdminPermission('platforms', 'edit'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { name, category, logo_url, target_url, vip_target_url, access_type, status, is_visible, display_order } = req.body;

  if (target_url !== undefined) {
    const trimmed = String(target_url).trim();
    if (!isSafeHttpUrl(trimmed)) {
      res.status(400).json({ error: 'Destination URL must be a valid URL starting with http:// or https://' });
      return;
    }
  }

  if (vip_target_url !== undefined && String(vip_target_url).trim().length > 0) {
    const trimmed = String(vip_target_url).trim();
    if (!isSafeHttpUrl(trimmed)) {
      res.status(400).json({ error: 'VIP Redirect URL must be a valid URL starting with http:// or https://' });
      return;
    }
  }

  if (logo_url !== undefined && String(logo_url).trim().length > 0) {
    const trimmedLogo = String(logo_url).trim();
    if (!isSafeHttpUrl(trimmedLogo) && !trimmedLogo.startsWith('/') && !trimmedLogo.startsWith('data:image/')) {
      res.status(400).json({ error: 'Logo URL must start with http://, https://, or be an uploaded image.' });
      return;
    }
  }

  if (access_type !== undefined && access_type !== 'normal' && access_type !== 'vip') {
    res.status(400).json({ error: 'Access type must be either normal or vip.' });
    return;
  }

  const prevPlatform = storage.getPlatformById(id);
  const safeUpdates = {
    ...(name !== undefined && { name: String(name).trim() }),
    ...(category !== undefined && { category: String(category).trim() || 'General' }),
    ...(logo_url !== undefined && { logo_url: String(logo_url).trim() }),
    ...(target_url !== undefined && { target_url: String(target_url).trim() }),
    ...(vip_target_url !== undefined && { vip_target_url: String(vip_target_url).trim() }),
    ...(access_type !== undefined && { access_type: access_type as 'normal' | 'vip' }),
    ...(status !== undefined && { status: (status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive' }),
    ...(is_visible !== undefined && { is_visible: Boolean(is_visible) }),
    ...(display_order !== undefined && { display_order: Number(display_order) || 0 }),
  };

  try {
    const updated = await storage.updatePlatform(id, safeUpdates);
    if (!updated) {
      res.status(404).json({ error: 'Platform not found.' });
      return;
    }
    if (req.user) {
      storage.recordAdminAuditLog({
        admin_id: req.user.id,
        admin_email: req.user.email,
        admin_role: req.user.role,
        section: 'platforms',
        action_type: 'platform_change',
        target_id: updated.id,
        description: `Updated platform "${updated.name}"`,
        previous_value: prevPlatform ? { name: prevPlatform.name, status: prevPlatform.status, is_visible: prevPlatform.is_visible } : null,
        new_value: { name: updated.name, status: updated.status, is_visible: updated.is_visible },
      });
    }
    broadcastPlatformsUpdate();
    res.json({ platform: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update platform in database.';
    res.status(500).json({ error: msg });
  }
});

app.delete('/api/admin/platforms/:id', authenticate, requireAdminPermission('platforms', 'delete'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const prev = storage.getPlatformById(id);
  try {
    const ok = await storage.deletePlatform(id);
    if (!ok) {
      res.status(404).json({ error: 'Platform not found.' });
      return;
    }
    if (req.user && prev) {
      storage.recordAdminAuditLog({
        admin_id: req.user.id,
        admin_email: req.user.email,
        admin_role: req.user.role,
        section: 'platforms',
        action_type: 'platform_change',
        target_id: id,
        description: `Deleted platform "${prev.name}"`,
        previous_value: { name: prev.name, category: prev.category },
        new_value: null,
      });
    }
    broadcastPlatformsUpdate();
    res.json({ message: 'Platform deleted successfully.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete platform from database.';
    res.status(500).json({ error: msg });
  }
});

// 3. User Management (Search, Filter, Pagination, Block, Unblock, Delete)
app.get('/api/admin/users', authenticate, requireAdminPermission('users', 'view'), (req, res) => {
  const query = ((req.query.q as string) || '').trim().toLowerCase();
  const statusFilter = ((req.query.filter as string) || 'all').toLowerCase();
  let users = storage.getUsers().map((u) => toPublicUser(u));

  const summary = {
    total_accounts: users.length,
    active_learners_count: users.filter((u) => !u.is_blocked && u.role === 'user' && u.learner_activity_status === 'active_learner').length,
    no_study_activity_count: users.filter((u) => !u.is_blocked && u.role === 'user' && u.learner_activity_status === 'no_study_activity').length,
    inactive_30d_count: users.filter((u) => !u.is_blocked && u.role === 'user' && u.learner_activity_status === 'inactive_30d').length,
  };

  if (query) {
    users = users.filter(
      (u) =>
        u.email.toLowerCase().includes(query) ||
        (u.name && u.name.toLowerCase().includes(query)) ||
        u.role.toLowerCase().includes(query) ||
        u.id.toLowerCase().includes(query) ||
        (u.referral_code && u.referral_code.toLowerCase().includes(query)) ||
        (u.referred_by_code && u.referred_by_code.toLowerCase().includes(query))
    );
  }

  if (statusFilter === 'blocked') {
    users = users.filter((u) => Boolean(u.is_blocked));
  } else if (statusFilter === 'active') {
    users = users.filter((u) => !u.is_blocked && (u.vip_active || u.free_access_active || u.role !== 'user'));
  } else if (statusFilter === 'active_learners') {
    users = users.filter((u) => !u.is_blocked && u.role === 'user' && u.learner_activity_status === 'active_learner');
  } else if (statusFilter === 'inactive') {
    users = users.filter(
      (u) =>
        !u.is_blocked &&
        u.role === 'user' &&
        (u.learner_activity_status === 'no_study_activity' || u.learner_activity_status === 'inactive_30d')
    );
  } else if (statusFilter === 'no_study_activity') {
    users = users.filter((u) => !u.is_blocked && u.role === 'user' && u.learner_activity_status === 'no_study_activity');
  } else if (statusFilter === 'inactive_30d') {
    users = users.filter((u) => !u.is_blocked && u.role === 'user' && u.learner_activity_status === 'inactive_30d');
  } else if (statusFilter === 'vip') {
    users = users.filter((u) => !u.is_blocked && Boolean(u.vip_active));
  } else if (statusFilter === 'free_access') {
    users = users.filter((u) => !u.is_blocked && !u.vip_active && Boolean(u.free_access_active));
  } else if (statusFilter === 'expired') {
    users = users.filter((u) => !u.is_blocked && u.role === 'user' && !u.vip_active && !u.free_access_active);
  }

  res.json({ users, total: users.length, summary });
});

app.put('/api/admin/users/:id', authenticate, requireAdminPermission('users', 'edit'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { name } = req.body || {};
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

  const caller = req.user ? storage.getUserById(req.user.id) : undefined;
  if (!caller || (caller.role !== 'admin' && caller.role !== 'super_admin')) {
    res.status(403).json({ error: 'Administrative privileges required.' });
    return;
  }

  const target = storage.getUserById(id);
  if (!target) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  if (target.role === 'super_admin' && caller.role !== 'super_admin') {
    res.status(403).json({ error: 'Only Super Admin can edit Super Admin profile details.' });
    return;
  }

  if (target.role === 'admin' && caller.role !== 'super_admin' && target.id !== caller.id) {
    res.status(403).json({ error: 'Only Super Admin can edit other Administrator accounts.' });
    return;
  }

  const cleanName = typeof name === 'string' ? name.trim().slice(0, 120) : target.name;
  const previousName = target.name;

  const updated = await storage.updateUser(target.id, {
    name: cleanName,
  });

  storage.recordAdminAuditLog({
    admin_id: caller.id,
    admin_email: caller.email,
    admin_role: caller.role,
    section: 'users',
    action_type: 'user_edited',
    target_id: target.id,
    description: `Updated user profile for ${target.email} (Name: "${previousName || ''}" -> "${cleanName || ''}")`,
    previous_value: { name: previousName, email: target.email },
    new_value: { name: cleanName, email: target.email },
    status: 'success',
    ip_address: clientIp,
  });

  res.json({
    user: toPublicUser(updated!),
    message: `User profile (${target.email}) updated successfully.`,
  });
});

app.post('/api/admin/users/:id/block', authenticate, requireAdminPermission('users', 'edit'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

  const caller = req.user ? storage.getUserById(req.user.id) : undefined;
  if (!caller || (caller.role !== 'admin' && caller.role !== 'super_admin')) {
    res.status(403).json({ error: 'Administrative privileges required.' });
    return;
  }

  const target = storage.getUserById(id);
  if (!target) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  if (target.email.toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL || target.role === 'super_admin') {
    res.status(403).json({ error: 'Super Admin accounts cannot be blocked.' });
    return;
  }

  if (target.id === caller.id) {
    res.status(400).json({ error: 'You cannot block your own account.' });
    return;
  }

  if (target.role === 'admin' && caller.role !== 'super_admin') {
    res.status(403).json({ error: 'Only the Super Admin can block an ordinary Administrator account.' });
    return;
  }

  const cleanReason =
    typeof reason === 'string' && reason.trim().length > 0
      ? reason.trim().slice(0, 300)
      : 'Suspended by administrator';

  const blockedAt = new Date().toISOString();

  // Preserve existing VIP and free access timestamps while marking account blocked
  const updated = await storage.updateUser(target.id, {
    is_blocked: true,
    blocked_at: blockedAt,
    blocked_reason: cleanReason,
    blocked_by: caller.email,
  });

  // Immediately revoke active tokens for the blocked user
  revokeUserSessions(target.id);

  storage.recordAdminAuditLog({
    admin_id: caller.id,
    admin_email: caller.email,
    admin_role: caller.role,
    section: 'users',
    action_type: 'user_blocked',
    target_id: target.id,
    description: `Blocked user ${target.email} (Reason: ${cleanReason})`,
    previous_value: { is_blocked: Boolean(target.is_blocked), blocked_reason: target.blocked_reason || null },
    new_value: { is_blocked: true, blocked_at: blockedAt, blocked_reason: cleanReason, blocked_by: caller.email },
    status: 'success',
    ip_address: clientIp,
  });

  // Sync block state to Supabase if configured
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project')) {
    try {
      const sbAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await sbAdmin
        .from('app_users')
        .update({
          is_blocked: true,
          blocked_at: blockedAt,
          blocked_reason: cleanReason,
          blocked_by: caller.email,
        })
        .eq('email', target.email.toLowerCase());
    } catch {
      // Non-fatal if column not yet migrated in external Supabase instance
    }
  }

  broadcastVipStatusUpdate({
    user_id: target.id,
    email: target.email,
    is_blocked: true,
    blocked_reason: cleanReason,
  });

  res.json({
    user: toPublicUser(updated!),
    message: `User account (${target.email}) has been blocked.`,
  });
});

app.post('/api/admin/users/:id/unblock', authenticate, requireAdminPermission('users', 'edit'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

  const caller = req.user ? storage.getUserById(req.user.id) : undefined;
  if (!caller || (caller.role !== 'admin' && caller.role !== 'super_admin')) {
    res.status(403).json({ error: 'Administrative privileges required.' });
    return;
  }

  const target = storage.getUserById(id);
  if (!target) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  if (target.role !== 'user' && caller.role !== 'super_admin') {
    res.status(403).json({ error: 'Only the Super Admin can unblock administrator accounts.' });
    return;
  }

  // Restore access strictly according to existing VIP / Free Access timestamps (do not reset or extend timestamps)
  const updated = await storage.updateUser(target.id, {
    is_blocked: false,
    blocked_at: null,
    blocked_reason: null,
    blocked_by: null,
  });

  storage.recordAdminAuditLog({
    admin_id: caller.id,
    admin_email: caller.email,
    admin_role: caller.role,
    section: 'users',
    action_type: 'user_unblocked',
    target_id: target.id,
    description: `Unblocked user ${target.email}`,
    previous_value: { is_blocked: Boolean(target.is_blocked), blocked_reason: target.blocked_reason || null },
    new_value: { is_blocked: false, blocked_at: null, blocked_reason: null },
    status: 'success',
    ip_address: clientIp,
  });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project')) {
    try {
      const sbAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await sbAdmin
        .from('app_users')
        .update({
          is_blocked: false,
          blocked_at: null,
          blocked_reason: null,
          blocked_by: null,
        })
        .eq('email', target.email.toLowerCase());
    } catch {
      // Ignore if external table does not have columns yet
    }
  }

  broadcastVipStatusUpdate({
    user_id: target.id,
    email: target.email,
    is_blocked: false,
  });

  res.json({
    user: toPublicUser(updated!),
    message: `User account (${target.email}) has been unblocked.`,
  });
});

app.delete('/api/admin/users/:id', authenticate, requireAdminPermission('users', 'delete'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const caller = req.user ? storage.getUserById(req.user.id) : undefined;
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'admin')) {
      res.status(403).json({
        error: 'Permission denied: Administrative privileges required to delete user accounts.',
      });
      return;
    }

    const target = storage.getUserById(id);
    if (!target) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    if (target.email.toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL || target.role === 'super_admin') {
      res.status(403).json({ error: 'Super Admin accounts are permanently protected and cannot be deleted.' });
      return;
    }

    if (target.role === 'admin' && caller.role !== 'super_admin') {
      res.status(403).json({ error: 'Only the Super Admin can delete an Administrator account.' });
      return;
    }

    if (target.id === caller.id) {
      res.status(400).json({ error: 'You cannot delete your own account.' });
      return;
    }

    // Sync deletion with Supabase Auth & app_users if configured
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project')) {
      const sbAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id);
      let sbTargetId: string | null = isUuid ? target.id : null;

      if (!sbTargetId) {
        const { data: listData } = await sbAdmin.auth.admin.listUsers();
        const foundSb = listData?.users.find(
          (u) => u.email?.toLowerCase() === target.email.toLowerCase()
        );
        if (foundSb && foundSb.email?.toLowerCase() !== PRIMARY_SUPER_ADMIN_EMAIL) {
          sbTargetId = foundSb.id;
        }
      }

      if (sbTargetId) {
        const { error: sbDelErr } = await sbAdmin.auth.admin.deleteUser(sbTargetId);
        if (sbDelErr && !sbDelErr.message?.toLowerCase().includes('not found')) {
          res.status(500).json({ error: `Supabase Auth user deletion failed: ${sbDelErr.message}` });
          return;
        }
      }

      await sbAdmin.from('app_users').delete().eq('email', target.email.toLowerCase());
    }

    // Revoke any active access keys for this user while preserving financial payment_records, referral_records, and audit logs
    storage.revokeAllUserKeys(target.id, target.email);

    const deleted = await storage.deleteUser(target.id);
    if (!deleted) {
      res.status(500).json({ error: 'Failed to delete user record from database.' });
      return;
    }

    revokeUserSessions(target.id);

    storage.recordAdminAuditLog({
      admin_id: caller.id,
      admin_email: caller.email,
      admin_role: caller.role,
      section: 'users',
      action_type: 'user_deleted',
      target_id: target.id,
      description: `Deleted user account ${target.email} (ID: ${target.id})`,
      previous_value: { id: target.id, email: target.email, name: target.name, role: target.role, created_at: target.created_at },
      new_value: null,
      status: 'success',
      ip_address: clientIp,
    });

    res.json({
      success: true,
      deleted_id: target.id,
      message: `User account (${target.email}) deleted permanently.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected server error while deleting user.';
    res.status(500).json({ error: msg });
  }
});

// 4. VIP Management (Turn VIP ON/OFF, set expiry, manage single-device VIP binding)
app.put('/api/admin/users/:id/vip', authenticate, requireAdminPermission(['users', 'vip'], 'edit'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { vip_active, vip_expires_at, duration_days, reset_device_binding } = req.body;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';

  const target = storage.getUserById(id);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (target.role === 'super_admin' && req.user?.role !== 'super_admin') {
    res.status(403).json({ error: 'Ordinary administrators cannot modify Super Admin accounts.' });
    return;
  }

  let finalExpiry = vip_expires_at || null;
  if (vip_active && duration_days !== undefined && duration_days !== null && duration_days !== '') {
    const parsedDays = Number(duration_days);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0) {
      res.status(400).json({
        error: 'VIP Duration must be a positive whole number of days (e.g. 1, 7, 15, 30, 45, 90, 180, 365). Decimals, zero, and negative values are not allowed.',
      });
      return;
    }
    // Server-side date/time calculation based on current server timestamp
    finalExpiry = new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000).toISOString();
  }

  const wasVipActive = Boolean(target.vip_active);
  const nextVipActive = Boolean(vip_active);

  // If VIP is revoked or reset_device_binding is requested, clear any existing bound device
  const shouldClearDevice = !nextVipActive || Boolean(reset_device_binding);
  if (shouldClearDevice && target.vip_bound_session_id) {
    revokeTokenJti(target.vip_bound_session_id);
  }

  const updated = await storage.updateUser(id, {
    vip_active: nextVipActive,
    vip_expires_at: nextVipActive ? finalExpiry : null,
    ...(shouldClearDevice && {
      vip_bound_device_id: null,
      vip_bound_session_id: null,
      vip_device_label: null,
      vip_device_bound_at: null,
      vip_device_last_seen_at: null,
    }),
  });

  if (nextVipActive && !wasVipActive) {
    await storage.addVipDeviceLog({
      user_id: target.id,
      email: target.email,
      event_type: 'vip_activated',
      attempted_device_id: 'PENDING_FIRST_DEVICE',
      bound_device_id: updated?.vip_bound_device_id || null,
      device_label: updated?.vip_device_label || 'Awaiting First Login Device',
      ip_address: clientIp,
      user_agent: userAgent,
      admin_id: req.user?.email || 'admin',
      reason: `VIP entitlement activated until ${finalExpiry ? new Date(finalExpiry).toLocaleDateString() : 'Unlimited'}.`,
    });
  }

  if (req.user) {
    storage.recordAdminAuditLog({
      admin_id: req.user.id,
      admin_email: req.user.email,
      admin_role: req.user.role,
      section: 'users',
      action_type: nextVipActive ? 'manual_vip_grant' : 'vip_revocation',
      target_id: target.id,
      description: `${nextVipActive ? 'Granted/extended' : 'Revoked'} VIP access for ${target.email}`,
      previous_value: { vip_active: wasVipActive, vip_expires_at: target.vip_expires_at },
      new_value: { vip_active: nextVipActive, vip_expires_at: updated?.vip_expires_at },
      status: 'success',
      ip_address: clientIp,
    });
  }

  res.json({ user: toPublicUser(updated!) });
});

app.post('/api/admin/users/:id/reset-vip-device', authenticate, requireAdminPermission(['users', 'vip'], 'edit'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown Browser';

  const caller = req.user ? storage.getUserById(req.user.id) : undefined;
  if (!caller || (caller.role !== 'admin' && caller.role !== 'super_admin')) {
    res.status(403).json({ error: 'Administrative privileges required.' });
    return;
  }

  const target = storage.getUserById(id);
  if (!target) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  if (target.role === 'super_admin' && caller.role !== 'super_admin') {
    res.status(403).json({ error: 'Only Super Admin can modify Super Admin device bindings.' });
    return;
  }

  // Invalidate the previously bound VIP session JTI so the old device loses VIP access immediately
  if (target.vip_bound_session_id) {
    revokeTokenJti(target.vip_bound_session_id);
  }

  const cleanReason =
    typeof reason === 'string' && reason.trim().length > 0
      ? reason.trim().slice(0, 300)
      : 'Authorized VIP device reset by administrator';

  const updated = storage.resetVipDeviceBinding(
    target.id,
    caller.email,
    cleanReason,
    clientIp,
    userAgent
  );

  if (!updated) {
    res.status(500).json({ error: 'Failed to reset VIP device binding.' });
    return;
  }

  storage.recordAdminAuditLog({
    admin_id: caller.id,
    admin_email: caller.email,
    admin_role: caller.role,
    section: 'users',
    action_type: 'device_reset',
    target_id: target.id,
    description: `Reset VIP device binding for ${target.email} (${cleanReason})`,
    previous_value: { bound_device: target.vip_device_label || null, bound_device_id: target.vip_bound_device_id || null },
    new_value: { bound_device: null, bound_device_id: null, reason: cleanReason },
    status: 'success',
    ip_address: clientIp,
  });

  // Sync to Supabase app_users if configured
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project')) {
    try {
      const sbAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      await sbAdmin
        .from('app_users')
        .update({
          vip_bound_device_id: null,
          vip_bound_session_id: null,
          vip_device_label: null,
          vip_device_bound_at: null,
          vip_device_last_seen_at: null,
          vip_device_reset_count: updated.vip_device_reset_count || 1,
          vip_device_last_reset_at: updated.vip_device_last_reset_at,
          vip_device_last_reset_by: caller.email,
        })
        .eq('email', target.email.toLowerCase());
    } catch {
      // Non-fatal if external Supabase columns not yet migrated
    }
  }

  res.json({
    user: toPublicUser(updated),
    message: `VIP device binding reset for ${target.email}. Their next login device will automatically become their new authorized VIP device.`,
  });
});

app.get('/api/admin/vip-device-logs', authenticate, requireAdminPermission('vip', 'view'), (_req, res) => {
  res.json({ logs: storage.getVipDeviceLogs() });
});

app.delete('/api/admin/vip-device-logs/:id', authenticate, requireAdminPermission('vip', 'delete'), async (req, res) => {
  const { id } = req.params;
  const ok = await storage.deleteVipDeviceLog(id);
  if (!ok) {
    res.status(404).json({ error: 'VIP device security log not found.' });
    return;
  }
  res.json({ message: 'VIP device log entry deleted.' });
});

// 5. VIP Plan Management
app.get('/api/admin/vip/plans', authenticate, requireAdminPermission('vip', 'view'), (_req, res) => {
  res.json({ plans: storage.getVipPlans(false) });
});

app.post('/api/admin/vip/plans', authenticate, requireAdminPermission('vip', 'add'), async (req: AuthenticatedRequest, res) => {
  const {
    title,
    plan_scope,
    price_inr,
    original_price_inr,
    duration_days,
    bonus_days,
    badge_label,
    discount_label,
    description,
    features,
    is_active,
    display_order,
  } = req.body;
  if (!title || !String(title).trim() || price_inr === undefined || price_inr === null || price_inr === '') {
    res.status(400).json({ error: 'Plan title and price are required.' });
    return;
  }
  const parsedPriceInr = Number(price_inr);
  if (!Number.isFinite(parsedPriceInr) || parsedPriceInr < 0 || parsedPriceInr > 1000000) {
    res.status(400).json({ error: 'Plan price must be a valid non-negative number.' });
    return;
  }

  if (duration_days === undefined || duration_days === null || duration_days === '') {
    res.status(400).json({ error: 'VIP Duration (Days) is required. Please specify a positive whole number of days.' });
    return;
  }
  const parsedDays = Number(duration_days);
  if (!Number.isInteger(parsedDays) || parsedDays <= 0) {
    res.status(400).json({ error: 'VIP Duration must be a positive whole number of days (e.g. 7, 15, 30, 45, 90, 180, 365). Decimals, zero, and negative values are not allowed.' });
    return;
  }

  const parsedBonusDays = bonus_days !== undefined && bonus_days !== null && bonus_days !== '' ? Math.max(0, Math.round(Number(bonus_days) || 0)) : 0;
  const parsedOrigPrice =
    original_price_inr !== undefined && original_price_inr !== null && original_price_inr !== '' && Number(original_price_inr) > 0
      ? Number(original_price_inr)
      : undefined;
  const resolvedPlanScope: 'single_platform' | 'all_platforms' =
    plan_scope === 'single_platform' ? 'single_platform' : 'all_platforms';

  const now = new Date().toISOString();
  try {
    const plan = await storage.addVipPlan({
      id: crypto.randomUUID(),
      title: title.trim(),
      plan_scope: resolvedPlanScope,
      price_inr: Number(price_inr) || 0,
      original_price_inr: parsedOrigPrice,
      duration_days: parsedDays,
      duration_months: Math.round(parsedDays / 30) || 1,
      bonus_days: parsedBonusDays,
      badge_label: badge_label?.trim() || '',
      discount_label: discount_label?.trim() || '',
      description: description?.trim() || '',
      features: Array.isArray(features) ? features : [],
      is_active: is_active !== false,
      display_order: Number(display_order) || 0,
      created_at: now,
      updated_at: now,
    });
    if (req.user) {
      storage.recordAdminAuditLog({
        admin_id: req.user.id,
        admin_email: req.user.email,
        admin_role: req.user.role,
        section: 'vip',
        action_type: 'vip_plan_change',
        target_id: plan.id,
        description: `Created ${resolvedPlanScope === 'single_platform' ? 'One Platform VIP' : 'All Platforms VIP'} Plan "${plan.title}" (₹${plan.price_inr}, ${plan.duration_days}d + ${plan.bonus_days || 0} bonus)`,
        previous_value: null,
        new_value: { title: plan.title, plan_scope: plan.plan_scope, price_inr: plan.price_inr, duration_days: plan.duration_days, bonus_days: plan.bonus_days },
      });
    }
    broadcastVipPlansUpdate();
    res.status(201).json({ plan });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save VIP plan in database.';
    res.status(500).json({ error: msg });
  }
});

app.put('/api/admin/vip/plans/:id', authenticate, requireAdminPermission('vip', 'edit'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const {
    title,
    plan_scope,
    price_inr,
    original_price_inr,
    duration_days,
    bonus_days,
    badge_label,
    discount_label,
    description,
    features,
    is_active,
    display_order,
  } = req.body;

  let validatedDays: number | undefined;
  let validatedMonths: number | undefined;

  if (duration_days !== undefined) {
    if (duration_days === null || duration_days === '') {
      res.status(400).json({ error: 'VIP Duration (Days) cannot be empty. Please enter a positive whole number of days.' });
      return;
    }
    const parsedDays = Number(duration_days);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0) {
      res.status(400).json({ error: 'VIP Duration must be a positive whole number of days (e.g. 7, 15, 30, 45, 90, 180, 365). Decimals, zero, and negative values are not allowed.' });
      return;
    }
    validatedDays = parsedDays;
    validatedMonths = Math.round(parsedDays / 30) || 1;
  }

  const prevPlan = storage.getVipPlans(false).find((p) => p.id === id);
  const safeUpdates = {
    ...(title !== undefined && { title: String(title).trim() }),
    ...(plan_scope !== undefined && {
      plan_scope: (plan_scope === 'single_platform' ? 'single_platform' : 'all_platforms') as 'single_platform' | 'all_platforms',
    }),
    ...(price_inr !== undefined && { price_inr: Math.max(0, Number(price_inr) || 0) }),
    ...(original_price_inr !== undefined && {
      original_price_inr:
        original_price_inr === null || original_price_inr === '' || Number(original_price_inr) <= 0
          ? undefined
          : Number(original_price_inr),
    }),
    ...(validatedDays !== undefined && { duration_days: validatedDays, duration_months: validatedMonths }),
    ...(bonus_days !== undefined && { bonus_days: Math.max(0, Math.round(Number(bonus_days) || 0)) }),
    ...(badge_label !== undefined && { badge_label: String(badge_label).trim() }),
    ...(discount_label !== undefined && { discount_label: String(discount_label).trim() }),
    ...(description !== undefined && { description: String(description).trim() }),
    ...(Array.isArray(features) && { features: features.map((f: unknown) => String(f).trim()).filter(Boolean) }),
    ...(is_active !== undefined && { is_active: Boolean(is_active) }),
    ...(display_order !== undefined && { display_order: Number(display_order) || 0 }),
  };

  try {
    const updated = await storage.updateVipPlan(id, safeUpdates);
    if (!updated) {
      res.status(404).json({ error: 'VIP Plan not found.' });
      return;
    }
    if (req.user) {
      storage.recordAdminAuditLog({
        admin_id: req.user.id,
        admin_email: req.user.email,
        admin_role: req.user.role,
        section: 'vip',
        action_type: 'vip_plan_change',
        target_id: updated.id,
        description: `Updated VIP Plan "${updated.title}"`,
        previous_value: prevPlan ? { title: prevPlan.title, price_inr: prevPlan.price_inr, duration_days: prevPlan.duration_days, is_active: prevPlan.is_active } : null,
        new_value: { title: updated.title, price_inr: updated.price_inr, duration_days: updated.duration_days, is_active: updated.is_active },
      });
    }
    broadcastVipPlansUpdate();
    res.json({ plan: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update VIP plan in database.';
    res.status(500).json({ error: msg });
  }
});

app.delete('/api/admin/vip/plans/:id', authenticate, requireAdminPermission('vip', 'delete'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const prevPlan = storage.getVipPlans(false).find((p) => p.id === id);
  try {
    const ok = await storage.deleteVipPlan(id);
    if (!ok) {
      res.status(404).json({ error: 'VIP Plan not found.' });
      return;
    }
    if (req.user && prevPlan) {
      storage.recordAdminAuditLog({
        admin_id: req.user.id,
        admin_email: req.user.email,
        admin_role: req.user.role,
        section: 'vip',
        action_type: 'vip_plan_change',
        target_id: id,
        description: `Deleted VIP Plan "${prevPlan.title}"`,
        previous_value: { title: prevPlan.title, price_inr: prevPlan.price_inr },
        new_value: null,
      });
    }
    broadcastVipPlansUpdate();
    res.json({ message: 'VIP Plan deleted successfully.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete VIP plan from database.';
    res.status(500).json({ error: msg });
  }
});

// VIP Batches (Admin)
app.get('/api/admin/vip/batches', authenticate, requireAdminPermission('vip', 'view'), (_req, res) => {
  res.json({ batches: storage.getVipBatches() });
});

app.post('/api/admin/vip/batches', authenticate, requireAdminPermission('vip', 'add'), async (req, res) => {
  const { name, category, logo_url, is_locked, display_order } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Batch name is required.' });
    return;
  }

  const trimmedLogo = String(logo_url || '').trim();
  if (trimmedLogo && !isSafeHttpUrl(trimmedLogo) && !trimmedLogo.startsWith('/') && !trimmedLogo.startsWith('data:image/')) {
    res.status(400).json({ error: 'Batch logo URL must start with http://, https://, or be an uploaded image.' });
    return;
  }

  try {
    const batch = await storage.addVipBatch({
      id: crypto.randomUUID(),
      name: String(name).trim(),
      category: String(category || '').trim() || 'General',
      logo_url: trimmedLogo,
      is_locked: is_locked !== false,
      display_order: Number(display_order) || 0,
      created_at: new Date().toISOString(),
    });
    broadcastVipBatchesUpdate();
    res.status(201).json({ batch });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save batch in database.';
    res.status(500).json({ error: msg });
  }
});

app.put('/api/admin/vip/batches/:id', authenticate, requireAdminPermission('vip', 'edit'), async (req, res) => {
  const { id } = req.params;
  const { name, category, logo_url, is_locked, display_order } = req.body;

  if (logo_url !== undefined && String(logo_url).trim().length > 0) {
    const trimmedLogo = String(logo_url).trim();
    if (!isSafeHttpUrl(trimmedLogo) && !trimmedLogo.startsWith('/') && !trimmedLogo.startsWith('data:image/')) {
      res.status(400).json({ error: 'Batch logo URL must start with http://, https://, or be an uploaded image.' });
      return;
    }
  }

  const safeUpdates = {
    ...(name !== undefined && { name: String(name).trim() }),
    ...(category !== undefined && { category: String(category).trim() || 'General' }),
    ...(logo_url !== undefined && { logo_url: String(logo_url).trim() }),
    ...(is_locked !== undefined && { is_locked: Boolean(is_locked) }),
    ...(display_order !== undefined && { display_order: Number(display_order) || 0 }),
  };

  try {
    const updated = await storage.updateVipBatch(id, safeUpdates);
    if (!updated) {
      res.status(404).json({ error: 'Batch not found.' });
      return;
    }
    broadcastVipBatchesUpdate();
    res.json({ batch: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update batch in database.';
    res.status(500).json({ error: msg });
  }
});

app.delete('/api/admin/vip/batches/:id', authenticate, requireAdminPermission('vip', 'delete'), async (req, res) => {
  const { id } = req.params;
  try {
    const ok = await storage.deleteVipBatch(id);
    if (!ok) {
      res.status(404).json({ error: 'Batch not found.' });
      return;
    }
    broadcastVipBatchesUpdate();
    res.json({ message: 'Batch deleted.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete batch from database.';
    res.status(500).json({ error: msg });
  }
});

// 5b. Platform Usage Logs & Analytics (Admins & Super Admins Only)
app.get('/api/admin/platform-logs', authenticate, requireAdminPermission('platform_logs', 'view'), (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const sortByRaw = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
    const validSortKeys = new Set([
      'total_opens',
      'today_opens',
      'yesterday_opens',
      'last_7_days_opens',
      'last_30_days_opens',
      'filtered_opens',
      'last_opened_at',
      'platform_name',
    ]);
    const sortBy = sortByRaw && validSortKeys.has(sortByRaw)
      ? (sortByRaw as
          | 'total_opens'
          | 'today_opens'
          | 'yesterday_opens'
          | 'last_7_days_opens'
          | 'last_30_days_opens'
          | 'filtered_opens'
          | 'last_opened_at'
          | 'platform_name')
      : undefined;
    const sortOrder =
      req.query.sortOrder === 'asc' || req.query.sortOrder === 'desc'
        ? req.query.sortOrder
        : undefined;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const timezone = typeof req.query.timezone === 'string' ? req.query.timezone : undefined;

    const analytics = storage.getPlatformUsageAnalytics({
      search,
      sortBy,
      sortOrder,
      startDate,
      endDate,
      page,
      limit,
      timezone,
    });

    res.json(analytics);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load platform usage statistics.';
    res.status(500).json({ error: msg });
  }
});

app.get('/api/admin/platform-logs/:platformId/history', authenticate, requireAdmin, (req, res) => {
  try {
    const platformId = (req.params.platformId || '').trim();
    if (!platformId) {
      res.status(400).json({ error: 'Platform ID is required.' });
      return;
    }

    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const timezone = typeof req.query.timezone === 'string' ? req.query.timezone : undefined;

    const history = storage.getPlatformUsageHistory(platformId, {
      startDate,
      endDate,
      page,
      limit,
      timezone,
    });

    if (!history) {
      res.status(404).json({ error: 'Platform not found.' });
      return;
    }

    res.json(history);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to load platform usage history.';
    res.status(500).json({ error: msg });
  }
});

// 6. Payment Management (Auditing & Structure)
app.get('/api/admin/payments', authenticate, requireAdminPermission('payments', 'view'), (_req, res) => {
  const records = storage.getPayments().map((p) => ({
    ...p,
    screenshot_url: (p.screenshot_url || p.screenshot_storage_path)
      ? `/api/admin/payments/${p.id}/screenshot`
      : '',
  }));
  res.json({ payments: records });
});

// Secure Administrator Payment Screenshot Proof Endpoint
app.get('/api/admin/payments/:id/screenshot', async (req: express.Request, res: express.Response) => {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
      token = req.query.token.trim();
    }

    if (!token) {
      res.status(401).json({ error: 'Authentication token required to view payment screenshot proof.' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const user = storage.getUserById(payload.sub);
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin') || user.is_blocked) {
      res.status(403).json({ error: 'Administrative privileges required to view payment proof.' });
      return;
    }

    const { id } = req.params;
    const payment = storage.getPaymentById(id);
    if (!payment) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }

    // Determine filename / storage path
    let localFileName = '';
    if (payment.screenshot_storage_path) {
      localFileName = path.basename(payment.screenshot_storage_path);
    } else if (payment.screenshot_url) {
      localFileName = path.basename(payment.screenshot_url.split('?')[0]);
    }

    const localFilePath = localFileName ? path.join(UPLOADS_DIR, localFileName) : '';

    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    // 1. Check if file exists in server uploads storage
    if (localFilePath && fs.existsSync(localFilePath)) {
      const ext = path.extname(localFilePath).toLowerCase();
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';
      res.setHeader('Content-Type', mimeType);
      fs.createReadStream(localFilePath).pipe(res);
      return;
    }

    // 2. If not local, stream from Supabase private bucket payment-screenshots via service-role
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project') && payment.screenshot_storage_path) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.storage.from('payment-screenshots').download(payment.screenshot_storage_path);
      if (!error && data) {
        const buf = Buffer.from(await data.arrayBuffer());
        res.setHeader('Content-Type', data.type || 'image/png');
        res.send(buf);
        return;
      }
    }

    res.status(404).json({ error: 'Payment screenshot document could not be found.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve payment screenshot.';
    res.status(500).json({ error: msg });
  }
});

// Authorized User Payment Screenshot Proof Endpoint (Owner or Admin only)
app.get('/api/payments/:id/screenshot', async (req: express.Request, res: express.Response) => {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
      token = req.query.token.trim();
    }

    if (!token) {
      res.status(401).json({ error: 'Authentication token required to view payment verification proof.' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const user = storage.getUserById(payload.sub);
    if (!user || user.is_blocked) {
      res.status(403).json({ error: 'Account access restricted.' });
      return;
    }

    const { id } = req.params;
    const payment = storage.getPaymentById(id);
    if (!payment) {
      res.status(404).json({ error: 'Payment verification record not found.' });
      return;
    }

    // Verify ownership: User must be the one who submitted the claim OR an administrator
    const isOwner = payment.user_id === user.id || payment.email.toLowerCase() === user.email.toLowerCase();
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';

    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: 'You do not have permission to view another user\'s payment verification document.' });
      return;
    }

    let localFileName = '';
    if (payment.screenshot_storage_path) {
      localFileName = path.basename(payment.screenshot_storage_path);
    } else if (payment.screenshot_url) {
      localFileName = path.basename(payment.screenshot_url.split('?')[0]);
    }

    const localFilePath = localFileName ? path.join(UPLOADS_DIR, localFileName) : '';

    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    if (localFilePath && fs.existsSync(localFilePath)) {
      const ext = path.extname(localFilePath).toLowerCase();
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';
      res.setHeader('Content-Type', mimeType);
      fs.createReadStream(localFilePath).pipe(res);
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project') && payment.screenshot_storage_path) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.storage.from('payment-screenshots').download(payment.screenshot_storage_path);
      if (!error && data) {
        const buf = Buffer.from(await data.arrayBuffer());
        res.setHeader('Content-Type', data.type || 'image/png');
        res.send(buf);
        return;
      }
    }

    res.status(404).json({ error: 'Payment screenshot document could not be found.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve payment screenshot.';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/admin/payments', authenticate, requireAdminPermission('payments', 'add'), async (req, res) => {
  const { user_id, email, plan_id, plan_title, amount, status, transaction_reference } = req.body;
  if (!email || !amount) {
    res.status(400).json({ error: 'Email and amount are required.' });
    return;
  }

  const record = await storage.addPayment({
    request_id: storage.generatePaymentRequestId(),
    user_id: user_id || 'manual',
    email: email.trim(),
    plan_id: plan_id || '',
    plan_title: plan_title || 'Manual VIP Subscription',
    amount: Number(amount) || 0,
    currency: 'INR',
    status: status || 'completed',
    transaction_reference: transaction_reference || `MAN-${Date.now()}`,
  });

  res.status(201).json({ payment: record });
});

app.post('/api/admin/payments/:id/verify', authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { action, duration_days, admin_note, rejection_reason } = req.body || {};

  if (action !== 'approve' && action !== 'reject') {
    res.status(400).json({ error: 'Action must be either "approve" or "reject".' });
    return;
  }

  // Enforce dynamic action-level permission (approve vs reject) for Normal Admins
  const caller = req.user;
  if (caller && caller.role !== 'super_admin') {
    const requiredAction = action === 'approve' ? 'approve' : 'reject';
    if (!storage.hasAdminPermission(caller.id, 'payments', requiredAction)) {
      res.status(403).json({
        code: 'ADMIN_PERMISSION_RESTRICTED',
        error: `Access Restricted: Your administrator account does not have permission to "${requiredAction}" payments.`,
      });
      return;
    }
  }

  const payment = storage.getPaymentById(id);
  if (!payment) {
    res.status(404).json({ error: 'Payment record not found.' });
    return;
  }

  if (payment.status === 'completed') {
    res.status(409).json({
      error: 'This payment verification claim has already been approved and VIP entitlement was already granted.',
    });
    return;
  }

  const nowIso = new Date().toISOString();
  const cleanNote = typeof admin_note === 'string' ? admin_note.trim().slice(0, 400) : '';
  const cleanReason = typeof rejection_reason === 'string' ? rejection_reason.trim().slice(0, 400) : cleanNote;
  const reviewerEmail = req.user?.email || 'admin';
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

  const targetUser =
    storage.getUserById(payment.user_id) ||
    storage.getUserByEmail(payment.email) ||
    (payment.submitted_email ? storage.getUserByEmail(payment.submitted_email) : undefined);

  if (action === 'reject') {
    if (payment.status === 'rejected') {
      res.status(409).json({
        error: 'This payment verification claim has already been rejected.',
      });
      return;
    }
    const updated = await storage.updatePayment(id, {
      status: 'rejected',
      admin_note: cleanNote || 'Rejected during administrator verification.',
      rejection_reason: cleanReason || 'Payment verification could not be confirmed.',
      reviewed_by: reviewerEmail,
      reviewed_at: nowIso,
    });

    if (targetUser) {
      storage.recordReferralPaymentRejected(targetUser.id, updated || payment);
      storage.addStudentNotification({
        user_id: targetUser.id,
        type: 'payment_rejected',
        title: 'VIP Payment Request Rejected',
        message: `Your payment request (${payment.request_id || payment.id}) for ${payment.plan_title} was not approved. Reason: ${cleanReason || 'Verification mismatch'}. You may submit a new verification request with valid proof.`,
        action_tab: 'vip',
      });
    }

    if (caller) {
      storage.recordAdminAuditLog({
        admin_id: caller.id,
        admin_email: caller.email,
        admin_role: caller.role,
        section: 'payments',
        action_type: 'payment_rejection',
        target_id: payment.id,
        description: `Rejected payment ${payment.request_id || payment.id} for ${payment.email}`,
        previous_value: { status: payment.status },
        new_value: { status: 'rejected', rejection_reason: cleanReason || cleanNote },
        ip_address: clientIp,
      });
    }

    broadcastVipStatusUpdate({
      user_id: targetUser?.id || payment.user_id,
      email: targetUser?.email || payment.email,
      vip_active: Boolean(targetUser?.vip_active),
      vip_expires_at: targetUser?.vip_expires_at || null,
      payment_id: payment.id,
      request_id: payment.request_id,
      payment_status: 'rejected',
    });

    res.json({
      payment: updated,
      message: 'Payment verification claim marked as rejected.',
    });
    return;
  }

  // Approve claim: update payment status to completed and grant VIP access to the linked user
  const plans = storage.getVipPlans(false);
  const matchedPlan = payment.plan_id ? plans.find((p) => p.id === payment.plan_id) : undefined;
  const baseDays =
    duration_days !== undefined && Number.isInteger(Number(duration_days)) && Number(duration_days) > 0
      ? Number(duration_days)
      : payment.plan_duration_days && Number(payment.plan_duration_days) > 0
      ? Number(payment.plan_duration_days)
      : matchedPlan?.duration_days || 30;

  const bonusDays =
    duration_days !== undefined && Number.isInteger(Number(duration_days)) && Number(duration_days) > 0
      ? 0
      : payment.bonus_days_applied !== undefined
      ? Math.max(0, Number(payment.bonus_days_applied) || 0)
      : matchedPlan?.bonus_days
      ? Math.max(0, Number(matchedPlan.bonus_days) || 0)
      : 0;

  const resolvedDays = baseDays + bonusDays;

  const isSinglePlatformScope =
    payment.vip_scope === 'single_platform' && Boolean(payment.selected_platform_id);
  const targetPlatformId = payment.selected_platform_id || '';
  const targetPlatformObj = targetPlatformId ? storage.getPlatformById(targetPlatformId) : undefined;
  const targetPlatformLabel =
    targetPlatformObj?.name || payment.selected_platform_name || 'Selected Platform';

  const updatedPayment = await storage.updatePayment(id, {
    status: 'completed',
    bonus_days_applied: bonusDays,
    admin_note:
      cleanNote ||
      (isSinglePlatformScope
        ? `Approved by ${reviewerEmail} (${resolvedDays} days One Platform VIP granted for "${targetPlatformLabel}" ONLY).`
        : `Approved by ${reviewerEmail} (${resolvedDays} days All Platforms VIP granted${bonusDays > 0 ? ` including +${bonusDays} bonus days` : ''}).`),
    reviewed_by: reviewerEmail,
    reviewed_at: nowIso,
  });

  let updatedUserPublic = undefined;
  if (targetUser) {
    const nowMs = Date.now();
    if (isSinglePlatformScope && targetPlatformId) {
      const existingExpiries: Record<string, string> = {
        ...(targetUser.vip_platform_expiries || {}),
      };
      const existingPlatformExpiryIso = existingExpiries[targetPlatformId];
      const existingPlatformExpiryMs =
        existingPlatformExpiryIso && Number.isFinite(new Date(existingPlatformExpiryIso).getTime())
          ? Math.max(nowMs, new Date(existingPlatformExpiryIso).getTime())
          : nowMs;
      const newPlatformExpiryIso = new Date(
        existingPlatformExpiryMs + resolvedDays * 24 * 60 * 60 * 1000
      ).toISOString();

      existingExpiries[targetPlatformId] = newPlatformExpiryIso;
      const nextAllowedIds = Array.from(
        new Set([...(targetUser.vip_allowed_platform_ids || []), targetPlatformId])
      );

      // STRICT SCOPING: Do NOT set vip_active = true! Only grant the selected platform!
      const updatedUser = await storage.updateUser(targetUser.id, {
        vip_allowed_platform_ids: nextAllowedIds,
        vip_platform_expiries: existingExpiries,
      });
      if (updatedUser) {
        updatedUserPublic = toPublicUser(updatedUser);
      }

      storage.addStudentNotification({
        user_id: targetUser.id,
        type: 'payment_approved',
        title: `One Platform VIP Activated — ${targetPlatformLabel}`,
        message: `Your payment (${payment.request_id || payment.id}) has been verified! You now have ${resolvedDays} days of VIP access strictly for "${targetPlatformLabel}" until ${new Date(newPlatformExpiryIso).toLocaleDateString()}.`,
        action_tab: 'home',
      });

      broadcastVipStatusUpdate({
        user_id: targetUser.id,
        email: targetUser.email,
        vip_active: Boolean(updatedUser?.vip_active),
        vip_expires_at: updatedUser?.vip_expires_at || null,
        payment_id: payment.id,
        request_id: payment.request_id,
        payment_status: 'completed',
      });
    } else {
      const currentExpiryMs =
        targetUser.vip_active && targetUser.vip_expires_at
          ? Math.max(nowMs, new Date(targetUser.vip_expires_at).getTime())
          : nowMs;
      const newExpiryIso = new Date(currentExpiryMs + resolvedDays * 24 * 60 * 60 * 1000).toISOString();

      const updatedUser = await storage.updateUser(targetUser.id, {
        vip_active: true,
        vip_expires_at: newExpiryIso,
      });
      if (updatedUser) {
        updatedUserPublic = toPublicUser(updatedUser);
      }

      storage.addStudentNotification({
        user_id: targetUser.id,
        type: 'payment_approved',
        title: 'All Platforms VIP Activated! 👑',
        message: `Your payment (${payment.request_id || payment.id}) for ${payment.plan_title} has been verified! ${resolvedDays} days of All Platforms VIP access are now active until ${new Date(newExpiryIso).toLocaleDateString()}.`,
        action_tab: 'vip',
      });

      // Trigger referral reward qualification and verified VIP sale attribution if this user was referred
      await storage.processReferralQualificationOnVipApproval(targetUser.id, updatedPayment || payment, newExpiryIso);

      broadcastVipStatusUpdate({
        user_id: targetUser.id,
        email: targetUser.email,
        vip_active: true,
        vip_expires_at: newExpiryIso,
        payment_id: payment.id,
        request_id: payment.request_id,
        payment_status: 'completed',
      });
    }
  }

  if (caller) {
    storage.recordAdminAuditLog({
      admin_id: caller.id,
      admin_email: caller.email,
      admin_role: caller.role,
      section: 'payments',
      action_type: 'payment_approval',
      target_id: payment.id,
      description: `Approved payment ${payment.request_id || payment.id} for ${payment.email} (${resolvedDays} days granted)`,
      previous_value: { status: payment.status },
      new_value: { status: 'completed', granted_days: resolvedDays, bonus_days: bonusDays },
      ip_address: clientIp,
    });
  }

  res.json({
    payment: updatedPayment,
    user: updatedUserPublic,
    message: targetUser
      ? `Payment approved and VIP access activated for ${targetUser.email} (${resolvedDays} days).`
      : 'Payment approved and marked as completed.',
  });
});

app.delete('/api/admin/payments/:id', authenticate, requireAdminPermission('payments', 'delete'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const result = await storage.deletePaymentRecord(id);
  if (!result.deleted) {
    res.status(result.error?.includes('protected') ? 403 : 404).json({
      error: result.error || 'Payment record could not be deleted from database.',
    });
    return;
  }
  res.json({ success: true, message: 'Payment record deleted successfully.' });
});

// 7. Key Management
app.get('/api/admin/keys', authenticate, requireAdminPermission('keys', 'view'), (_req, res) => {
  const settings = storage.getSettings();
  const records = storage.getKeyRecords();
  res.json({
    settings: {
      key_generation_enabled: settings.key_generation_enabled,
      shortener_url: settings.shortener_url,
      tutorial_video_url: settings.tutorial_video_url,
      key_expiry_hours: settings.key_expiry_hours,
      free_access_duration: settings.free_access_duration ?? settings.key_expiry_hours ?? 24,
      free_access_unit: settings.free_access_unit || 'hours',
    },
    active_keys: storage.getActiveKeysCount(),
    records,
  });
});

app.post('/api/admin/keys/settings', authenticate, requireAdminPermission('keys', 'edit'), async (req, res) => {
  const {
    key_generation_enabled,
    shortener_url,
    tutorial_video_url,
    key_expiry_hours,
    free_access_duration,
    free_access_unit,
  } = req.body;

  if (shortener_url !== undefined && String(shortener_url).trim().length > 0) {
    if (!isSafeHttpUrl(shortener_url)) {
      res.status(400).json({ error: 'Shortener URL must be a valid URL starting with http:// or https://' });
      return;
    }
  }

  if (tutorial_video_url !== undefined && String(tutorial_video_url).trim().length > 0) {
    if (!isSafeHttpUrl(tutorial_video_url)) {
      res.status(400).json({ error: 'Tutorial Video URL must be a valid URL starting with http:// or https://' });
      return;
    }
  }

  let validatedDuration: number | undefined = undefined;
  if (free_access_duration !== undefined) {
    const num = Number(free_access_duration);
    if (!Number.isFinite(num) || num <= 0) {
      res.status(400).json({ error: 'Free Access Duration must be a positive number.' });
      return;
    }
    validatedDuration = num;
  }

  let validatedUnit: 'minutes' | 'hours' | 'days' | undefined = undefined;
  if (free_access_unit !== undefined) {
    if (!['minutes', 'hours', 'days'].includes(free_access_unit)) {
      res.status(400).json({ error: 'Free Access Unit must be minutes, hours, or days.' });
      return;
    }
    validatedUnit = free_access_unit;
  }

  // Calculate equivalent key_expiry_hours for backward compatibility
  let equivalentHours = key_expiry_hours ? Number(key_expiry_hours) : undefined;
  if (validatedDuration !== undefined) {
    const u = validatedUnit || storage.getSettings().free_access_unit || 'hours';
    if (u === 'days') equivalentHours = validatedDuration * 24;
    else if (u === 'minutes') equivalentHours = Math.max(1, Math.round(validatedDuration / 60));
    else equivalentHours = validatedDuration;
  }

  try {
    const updated = await storage.updateSettings({
      ...(key_generation_enabled !== undefined && { key_generation_enabled: Boolean(key_generation_enabled) }),
      ...(shortener_url !== undefined && { shortener_url: String(shortener_url).trim() }),
      ...(tutorial_video_url !== undefined && { tutorial_video_url: String(tutorial_video_url).trim() }),
      ...(equivalentHours !== undefined && { key_expiry_hours: equivalentHours }),
      ...(validatedDuration !== undefined && { free_access_duration: validatedDuration }),
      ...(validatedUnit !== undefined && { free_access_unit: validatedUnit }),
    });

    broadcastSettingsUpdate();

    res.json({
      settings: {
        key_generation_enabled: updated.key_generation_enabled,
        shortener_url: updated.shortener_url,
        tutorial_video_url: updated.tutorial_video_url,
        key_expiry_hours: updated.key_expiry_hours,
        free_access_duration: updated.free_access_duration ?? updated.key_expiry_hours ?? 24,
        free_access_unit: updated.free_access_unit || 'hours',
      },
      message: 'Free Access Key settings saved successfully.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save Free Access Key settings in database.';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/admin/keys/:id/revoke', authenticate, requireAdminPermission('keys', 'edit'), async (req, res) => {
  const { id } = req.params;
  try {
    const revoked = await storage.revokeKeyRecord(id);
    if (!revoked) {
      res.status(404).json({ error: 'Access key record not found.' });
      return;
    }
    res.json({
      message: 'Access key revoked successfully.',
      record: revoked,
      active_keys: storage.getActiveKeysCount(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to revoke access key.';
    res.status(500).json({ error: msg });
  }
});

app.delete('/api/admin/keys/:id', authenticate, requireAdminPermission('keys', 'delete'), async (req, res) => {
  const { id } = req.params;
  try {
    const ok = await storage.deleteKeyRecord(id);
    if (!ok) {
      res.status(404).json({ error: 'Key record not found.' });
      return;
    }
    res.json({
      message: 'Key record deleted successfully.',
      active_keys: storage.getActiveKeysCount(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete key record.';
    res.status(500).json({ error: msg });
  }
});

// 8. Login History
app.get('/api/admin/login-history', authenticate, requireAdminPermission('history', 'view'), (_req, res) => {
  res.json({ history: storage.getLoginHistory() });
});

app.delete('/api/admin/login-history/:id', authenticate, requireAdminPermission('history', 'delete'), async (req, res) => {
  const { id } = req.params;
  try {
    const ok = await storage.deleteLoginHistoryEntry(id);
    if (!ok) {
      res.status(404).json({ error: 'Login history entry not found.' });
      return;
    }
    res.json({ message: 'Login history record deleted.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete login history entry.';
    res.status(500).json({ error: msg });
  }
});

// 8b. User Feedback System (VIP & Non-VIP Students + Admin Feedback Management)
const VALID_FEEDBACK_CATEGORIES = new Set([
  'General Feedback',
  'Bug Report',
  'Platform Issue',
  'VIP Membership',
  'Payment Issue',
  'Feature Request',
  'Other',
]);

const VALID_FEEDBACK_STATUSES = new Set(['New', 'In Review', 'Resolved', 'Rejected']);
const recentFeedbackSubmissions = new Map<string, number>();

// Authenticated user fetches their own submitted feedback history (never other users' feedback or internal admin notes)
app.get('/api/feedback/my', authenticate, (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const user = req.user!;
  const records = storage.getUserFeedbackByUser(user.id, user.email).map((f) => ({
    id: f.id,
    user_id: f.user_id,
    user_email: f.user_email,
    is_vip_at_submission: Boolean(f.is_vip_at_submission),
    category: f.category,
    rating: f.rating,
    message: f.message,
    attachment_url: f.attachment_url || f.attachment_storage_path ? `/api/feedback/${f.id}/attachment` : '',
    status: f.status,
    created_at: f.created_at,
    updated_at: f.updated_at,
  }));
  res.json({ feedback: records });
});

// Authenticated user (VIP or Non-VIP) submits feedback
app.post('/api/feedback', authenticate, async (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  if (user.is_blocked) {
    res.status(403).json({ error: 'Your account is blocked and cannot submit feedback.' });
    return;
  }

  const nowMs = Date.now();
  const lastSubmit = recentFeedbackSubmissions.get(user.id) || 0;
  if (nowMs - lastSubmit < 5000) {
    res.status(429).json({
      error: 'Please wait a few seconds before submitting another feedback entry.',
    });
    return;
  }

  const { category, rating, message, attachment_data_url, attachment_mime_type } = req.body || {};

  const cleanCategory = typeof category === 'string' ? category.trim() : '';
  if (!VALID_FEEDBACK_CATEGORIES.has(cleanCategory)) {
    res.status(400).json({ error: 'Please select a valid feedback category.' });
    return;
  }

  const parsedRating = Number(rating);
  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    res.status(400).json({ error: 'Please select a star rating between 1 and 5.' });
    return;
  }

  const cleanMessage = typeof message === 'string' ? message.trim() : '';
  if (cleanMessage.length < 3 || cleanMessage.length > 2000) {
    res.status(400).json({ error: 'Feedback message must be between 3 and 2000 characters long.' });
    return;
  }

  // Optional screenshot/image attachment validation (max 5MB, PNG/JPG/WEBP only)
  let localFilePath = '';
  let attachmentStoragePath = '';
  let uploadedToSupabase = false;
  let detectedMime = 'image/png';

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const isSupabaseConfigured = Boolean(
    supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')
  );

  if (attachment_data_url && typeof attachment_data_url === 'string' && attachment_data_url.trim()) {
    const rawDataUrl = attachment_data_url.trim();
    const matches = rawDataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    detectedMime = String(attachment_mime_type || 'image/png').toLowerCase();
    let base64Data = rawDataUrl;

    if (matches && matches.length === 3) {
      detectedMime = matches[1].toLowerCase();
      base64Data = matches[2];
    } else if (rawDataUrl.includes('base64,')) {
      base64Data = rawDataUrl.split('base64,')[1];
    } else {
      res.status(400).json({ error: 'Invalid image attachment format.' });
      return;
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedMimes.includes(detectedMime)) {
      res.status(400).json({
        error: 'Unsupported image format. Please attach a PNG, JPG, or WEBP image.',
      });
      return;
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB
    if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
      res.status(400).json({
        error: 'Attachment image must be under 5MB.',
      });
      return;
    }

    let ext = 'png';
    if (detectedMime.includes('jpeg') || detectedMime.includes('jpg')) ext = 'jpg';
    else if (detectedMime.includes('webp')) ext = 'webp';

    const randSuffix = Math.random().toString(36).substring(2, 8);
    const cleanFileName = `feedback-attachment-${nowMs}-${randSuffix}.${ext}`;
    localFilePath = path.join(UPLOADS_DIR, cleanFileName);

    try {
      fs.writeFileSync(localFilePath, buffer);
      attachmentStoragePath = `uploads/${cleanFileName}`;

      if (isSupabaseConfigured) {
        try {
          const supabase = createClient(supabaseUrl!, supabaseKey!);
          const { data: bucketData, error: bucketErr } = await supabase.storage.getBucket('feedback-attachments');
          if (bucketErr || !bucketData) {
            await supabase.storage.createBucket('feedback-attachments', {
              public: false,
              fileSizeLimit: MAX_ATTACHMENT_BYTES,
              allowedMimeTypes: allowedMimes,
            });
          }
          const sbPath = `${user.id}/${cleanFileName}`;
          const { error: uploadErr } = await supabase.storage
            .from('feedback-attachments')
            .upload(sbPath, buffer, {
              contentType: detectedMime,
              upsert: false,
            });
          if (!uploadErr) {
            uploadedToSupabase = true;
            attachmentStoragePath = sbPath;
          }
        } catch {
          // Keep local copy if Supabase Storage bucket is temporarily unreachable
        }
      }
    } catch {
      res.status(500).json({ error: 'Failed to process feedback image attachment.' });
      return;
    }
  }

  recentFeedbackSubmissions.set(user.id, nowMs);

  // Determine whether user is VIP or Non-VIP at the exact time of submission
  const latestUser = storage.getUserById(user.id) || user;
  const isVipAtSubmission = Boolean(
    !latestUser.is_blocked &&
      (latestUser.role === 'admin' ||
        latestUser.role === 'super_admin' ||
        (latestUser.vip_active &&
          latestUser.vip_expires_at &&
          new Date(latestUser.vip_expires_at).getTime() > nowMs))
  );

  try {
    const created = await storage.addUserFeedback({
      user_id: latestUser.id,
      user_email: latestUser.email,
      is_vip_at_submission: isVipAtSubmission,
      category: cleanCategory as
        | 'General Feedback'
        | 'Bug Report'
        | 'Platform Issue'
        | 'VIP Membership'
        | 'Payment Issue'
        | 'Feature Request'
        | 'Other',
      rating: parsedRating,
      message: cleanMessage,
      attachment_url: '',
      attachment_storage_path: attachmentStoragePath,
      status: 'New',
    });

    if (attachmentStoragePath) {
      const protectedUrl = `/api/feedback/${created.id}/attachment`;
      await storage.updateUserFeedback(created.id, { attachment_url: protectedUrl });
      created.attachment_url = protectedUrl;
    }

    res.status(201).json({
      success: true,
      feedback: {
        ...created,
        admin_note: undefined,
      },
      message: 'Thank you! Your feedback has been submitted successfully.',
    });
  } catch (err: unknown) {
    recentFeedbackSubmissions.delete(user.id);
    if (localFilePath && fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath);
      } catch {
        // Ignore cleanup error
      }
    }
    if (uploadedToSupabase && isSupabaseConfigured && attachmentStoragePath) {
      try {
        const supabase = createClient(supabaseUrl!, supabaseKey!);
        await supabase.storage.from('feedback-attachments').remove([attachmentStoragePath]);
      } catch {
        // Ignore cleanup error
      }
    }
    const msg = err instanceof Error ? err.message : 'Failed to submit feedback. Please try again.';
    res.status(500).json({ error: msg });
  }
});

// Authorized Feedback Attachment Viewer (Feedback Owner or Admin only)
app.get('/api/feedback/:id/attachment', async (req: express.Request, res: express.Response) => {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
      token = req.query.token.trim();
    }

    if (!token) {
      res.status(401).json({ error: 'Authentication required to view feedback attachment.' });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }

    const user = storage.getUserById(payload.sub);
    if (!user || user.is_blocked) {
      res.status(403).json({ error: 'Account access restricted.' });
      return;
    }

    const { id } = req.params;
    const feedback = storage.getUserFeedbackById(id);
    if (!feedback) {
      res.status(404).json({ error: 'Feedback record not found.' });
      return;
    }

    const isOwner =
      feedback.user_id === user.id ||
      feedback.user_email.toLowerCase() === user.email.toLowerCase();
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';

    if (!isOwner && !isAdmin) {
      res.status(403).json({ error: 'You do not have permission to view another user\'s feedback attachment.' });
      return;
    }

    let localFileName = '';
    if (feedback.attachment_storage_path) {
      localFileName = path.basename(feedback.attachment_storage_path);
    } else if (feedback.attachment_url) {
      localFileName = path.basename(feedback.attachment_url.split('?')[0]);
    }

    const localFilePath = localFileName ? path.join(UPLOADS_DIR, localFileName) : '';

    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    if (localFilePath && fs.existsSync(localFilePath)) {
      const ext = path.extname(localFilePath).toLowerCase();
      let mimeType = 'image/png';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.webp') mimeType = 'image/webp';
      res.setHeader('Content-Type', mimeType);
      fs.createReadStream(localFilePath).pipe(res);
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project') && feedback.attachment_storage_path) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase.storage
        .from('feedback-attachments')
        .download(feedback.attachment_storage_path);
      if (!error && data) {
        const buf = Buffer.from(await data.arrayBuffer());
        res.setHeader('Content-Type', data.type || 'image/png');
        res.send(buf);
        return;
      }
    }

    res.status(404).json({ error: 'Feedback attachment image could not be found.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve feedback attachment.';
    res.status(500).json({ error: msg });
  }
});

// Admin Feedback Management Routes
app.get('/api/admin/feedback', authenticate, requireAdminPermission('feedback', 'view'), (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const records = storage.getAllUserFeedback().map((f) => ({
    ...f,
    attachment_url: f.attachment_url || f.attachment_storage_path ? `/api/feedback/${f.id}/attachment` : '',
  }));
  res.json({ feedback: records });
});

app.patch('/api/admin/feedback/:id', authenticate, requireAdminPermission('feedback', 'edit'), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { status, admin_note } = req.body || {};

  const existing = storage.getUserFeedbackById(id);
  if (!existing) {
    res.status(404).json({ error: 'Feedback record not found.' });
    return;
  }

  let validatedStatus = existing.status;
  if (status !== undefined) {
    if (typeof status !== 'string' || !VALID_FEEDBACK_STATUSES.has(status)) {
      res.status(400).json({ error: 'Invalid feedback status. Allowed values: New, In Review, Resolved, Rejected.' });
      return;
    }
    validatedStatus = status as 'New' | 'In Review' | 'Resolved' | 'Rejected';
  }

  const cleanAdminNote =
    admin_note !== undefined ? String(admin_note || '').trim().slice(0, 1000) : existing.admin_note || '';

  const updated = await storage.updateUserFeedback(id, {
    status: validatedStatus,
    admin_note: cleanAdminNote,
    reviewed_by: req.user?.email || 'admin',
    reviewed_at: new Date().toISOString(),
  });

  if (!updated) {
    res.status(404).json({ error: 'Feedback record not found.' });
    return;
  }

  res.json({
    feedback: {
      ...updated,
      attachment_url:
        updated.attachment_url || updated.attachment_storage_path
          ? `/api/feedback/${updated.id}/attachment`
          : '',
    },
    message: 'Feedback record updated successfully.',
  });
});

app.delete('/api/admin/feedback/:id', authenticate, requireAdminPermission('feedback', 'delete'), async (req, res) => {
  const { id } = req.params;
  const existing = storage.getUserFeedbackById(id);
  if (!existing) {
    res.status(404).json({ error: 'Feedback record not found.' });
    return;
  }

  const ok = await storage.deleteUserFeedback(id);
  if (!ok) {
    res.status(500).json({ error: 'Failed to delete feedback record.' });
    return;
  }

  // Remove local attachment file if present
  if (existing.attachment_storage_path) {
    const fileName = path.basename(existing.attachment_storage_path);
    const localFilePath = path.join(UPLOADS_DIR, fileName);
    if (fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath);
      } catch {
        // Ignore cleanup error
      }
    }
  }

  res.json({ success: true, message: 'Feedback record deleted permanently.' });
});

// 9. Announcements (with Slider Ordering, Optional Link, and Schedule Dates)
app.get('/api/admin/announcements', authenticate, requireAdminPermission('announcements', 'view'), (_req, res) => {
  res.json({ announcements: storage.getAnnouncements(false) });
});

app.post('/api/admin/announcements', authenticate, requireAdminPermission('announcements', 'add'), async (req, res) => {
  const { title, content, link_url, is_published, display_order, start_date, end_date } = req.body;
  if (!title || !content || !String(title).trim() || !String(content).trim()) {
    res.status(400).json({ error: 'Announcement title and message are required.' });
    return;
  }

  const trimmedLink = link_url ? String(link_url).trim() : '';
  if (trimmedLink && !isSafeHttpUrl(trimmedLink)) {
    res.status(400).json({ error: 'Announcement link must be a valid URL starting with http:// or https://' });
    return;
  }

  let parsedStart: string | null = null;
  let parsedEnd: string | null = null;
  if (start_date) {
    const d = new Date(start_date);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: 'Invalid announcement start date.' });
      return;
    }
    parsedStart = d.toISOString();
  }
  if (end_date) {
    const d = new Date(end_date);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: 'Invalid announcement end date.' });
      return;
    }
    parsedEnd = d.toISOString();
  }
  if (parsedStart && parsedEnd && new Date(parsedEnd).getTime() < new Date(parsedStart).getTime()) {
    res.status(400).json({ error: 'Announcement end date must be after start date.' });
    return;
  }

  const existingCount = storage.getAnnouncements(false).length;
  const orderNum =
    display_order !== undefined && display_order !== '' && Number.isFinite(Number(display_order))
      ? Math.max(1, Math.round(Number(display_order)))
      : existingCount + 1;

  const now = new Date().toISOString();
  try {
    const announcement = await storage.addAnnouncement({
      id: crypto.randomUUID(),
      title: String(title).trim().slice(0, 200),
      content: String(content).trim().slice(0, 2000),
      link_url: trimmedLink,
      is_published: is_published !== false,
      display_order: orderNum,
      start_date: parsedStart,
      end_date: parsedEnd,
      created_at: now,
      updated_at: now,
    });
    broadcastAnnouncementsUpdate();
    res.status(201).json({ announcement });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save announcement in database.';
    res.status(500).json({ error: msg });
  }
});

app.put('/api/admin/announcements/:id', authenticate, requireAdminPermission('announcements', 'edit'), async (req, res) => {
  const { id } = req.params;
  const { title, content, link_url, is_published, display_order, start_date, end_date } = req.body;

  if (link_url !== undefined && String(link_url).trim().length > 0) {
    if (!isSafeHttpUrl(link_url)) {
      res.status(400).json({ error: 'Announcement link must be a valid URL starting with http:// or https://' });
      return;
    }
  }

  let parsedStart: string | null | undefined = undefined;
  let parsedEnd: string | null | undefined = undefined;
  if (start_date !== undefined) {
    if (!start_date) parsedStart = null;
    else {
      const d = new Date(start_date);
      if (isNaN(d.getTime())) {
        res.status(400).json({ error: 'Invalid announcement start date.' });
        return;
      }
      parsedStart = d.toISOString();
    }
  }
  if (end_date !== undefined) {
    if (!end_date) parsedEnd = null;
    else {
      const d = new Date(end_date);
      if (isNaN(d.getTime())) {
        res.status(400).json({ error: 'Invalid announcement end date.' });
        return;
      }
      parsedEnd = d.toISOString();
    }
  }

  const safeUpdates = {
    ...(title !== undefined && { title: String(title).trim().slice(0, 200) }),
    ...(content !== undefined && { content: String(content).trim().slice(0, 2000) }),
    ...(link_url !== undefined && { link_url: String(link_url).trim() }),
    ...(is_published !== undefined && { is_published: Boolean(is_published) }),
    ...(display_order !== undefined &&
      Number.isFinite(Number(display_order)) && { display_order: Math.max(1, Math.round(Number(display_order))) }),
    ...(parsedStart !== undefined && { start_date: parsedStart }),
    ...(parsedEnd !== undefined && { end_date: parsedEnd }),
  };

  try {
    const updated = await storage.updateAnnouncement(id, safeUpdates);
    if (!updated) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }
    broadcastAnnouncementsUpdate();
    res.json({ announcement: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update announcement in database.';
    res.status(500).json({ error: msg });
  }
});

app.delete('/api/admin/announcements/:id', authenticate, requireAdminPermission('announcements', 'delete'), async (req, res) => {
  const { id } = req.params;
  try {
    const ok = await storage.deleteAnnouncement(id);
    if (!ok) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }
    broadcastAnnouncementsUpdate();
    res.json({ message: 'Announcement deleted.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete announcement from database.';
    res.status(500).json({ error: msg });
  }
});

// Section-Specific Bulk Cleanup & Storage Optimization Endpoints
const ALLOWED_CLEANUP_OPERATIONS = new Set([
  'keys_expired',
  'keys_expired_revoked',
  'keys_older_than',
  'keys_all',
  'login_history_old',
  'login_history_older_than',
  'login_history_all',
  'announcements_expired',
  'announcements_expired_disabled',
  'announcements_all',
  'payments_old',
  'payments_failed_pending',
  'payments_all_non_completed',
  'vip_expired',
  'vip_clear_expired',
  'vip_device_logs_all',
  'vip_device_logs_old',
  'platforms_inactive',
  'plans_inactive',
  'users_inactive',
  'users_expired_inactive',
  'storage_unused_assets',
  'storage_orphaned_files',
]);

const ALLOWED_BULK_DELETE_SECTIONS = new Set([
  'users',
  'platforms',
  'vip_batches',
  'vip_plans',
  'announcements',
  'login_history',
  'payment_records',
  'key_records',
  'vip_device_logs',
]);

app.post('/api/admin/bulk-delete', authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { section, ids } = req.body || {};
    const cleanSection = String(section || '').trim();

    if (!ALLOWED_BULK_DELETE_SECTIONS.has(cleanSection)) {
      res.status(400).json({ error: `Invalid or disallowed section '${cleanSection}' for bulk deletion.` });
      return;
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'No record IDs were selected for deletion.' });
      return;
    }

    const caller = req.user ? storage.getUserById(req.user.id) : undefined;
    if (!caller || (caller.role !== 'admin' && caller.role !== 'super_admin')) {
      res.status(403).json({ error: 'Administrative privileges required.' });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

    // Map bulk-delete section to AdminSectionKey for permission verification
    const sectionPermissionMap: Record<string, 'users' | 'platforms' | 'vip' | 'payments' | 'keys' | 'announcements' | 'feedback'> = {
      users: 'users',
      platforms: 'platforms',
      vip_batches: 'vip',
      vip_plans: 'vip',
      vip_logs: 'vip',
      payments: 'payments',
      keys: 'keys',
      notifications: 'announcements',
      reports: 'feedback',
    };
    const mappedSection = sectionPermissionMap[cleanSection] || 'users';
    if (!storage.hasAdminPermission(caller.id, mappedSection, 'delete')) {
      storage.recordAdminAuditLog({
        admin_id: caller.id,
        admin_email: caller.email,
        admin_role: caller.role,
        section: mappedSection,
        action_type: 'permission_denied',
        target_id: cleanSection,
        description: `Permission denied for bulk delete in section '${cleanSection}'`,
        previous_value: { requested_ids_count: ids.length },
        new_value: null,
        status: 'failed',
        ip_address: clientIp,
      });
      res.status(403).json({
        error: `Access Restricted: Your administrator account does not have 'delete' permission for '${mappedSection}'. Contact Super Admin.`,
      });
      return;
    }

    // Capture user emails before deletion if section === 'users' so we can sync with Supabase Auth
    const usersToDelete =
      cleanSection === 'users'
        ? ids
            .map((id) => storage.getUserById(String(id)))
            .filter((u): u is NonNullable<typeof u> => Boolean(u))
        : [];

    const result = await storage.bulkDeleteByIds(cleanSection, ids, caller.role, caller.id);

    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    if (result.deleted_count === 0 && result.skipped_count > 0) {
      res.status(403).json({
        error: result.skipped_reasons[0] || 'Selected records are protected and cannot be deleted.',
        skipped_count: result.skipped_count,
        skipped_reasons: result.skipped_reasons,
      });
      return;
    }

    // If users were deleted, revoke sessions and sync with Supabase Auth if configured
    if (cleanSection === 'users' && result.deleted_ids.length > 0) {
      const deletedSet = new Set(result.deleted_ids);
      for (const uid of result.deleted_ids) {
        revokeUserSessions(uid);
      }

      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project')) {
        try {
          const sbAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const { data: listData } = await sbAdmin.auth.admin.listUsers();
          for (const target of usersToDelete) {
            if (!deletedSet.has(target.id)) continue;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id);
            let sbTargetId: string | null = isUuid ? target.id : null;
            if (!sbTargetId && listData?.users) {
              const found = listData.users.find(
                (u) => u.email?.toLowerCase() === target.email.toLowerCase()
              );
              if (found && found.email?.toLowerCase() !== PRIMARY_SUPER_ADMIN_EMAIL) {
                sbTargetId = found.id;
              }
            }
            if (sbTargetId) {
              await sbAdmin.auth.admin.deleteUser(sbTargetId);
            }
            await sbAdmin.from('app_users').delete().eq('email', target.email.toLowerCase());
          }
        } catch {
          // Non-fatal if Supabase is not reachable
        }
      }
    }

    storage.recordAdminAuditLog({
      admin_id: caller.id,
      admin_email: caller.email,
      admin_role: caller.role,
      section: mappedSection,
      action_type: 'bulk_delete',
      target_id: cleanSection,
      description: `Bulk deleted ${result.deleted_count} record(s) in section '${cleanSection}'`,
      previous_value: {
        requested_ids: ids,
        deleted_users:
          cleanSection === 'users'
            ? usersToDelete
                .filter((u) => result.deleted_ids.includes(u.id))
                .map((u) => ({ id: u.id, email: u.email, name: u.name }))
            : undefined,
      },
      new_value: {
        deleted_count: result.deleted_count,
        deleted_ids: result.deleted_ids,
        skipped_count: result.skipped_count,
      },
      status: 'success',
      ip_address: clientIp,
    });

    if (cleanSection === 'platforms') broadcastPlatformsUpdate();
    else if (cleanSection === 'vip_plans') broadcastVipPlansUpdate();
    else if (cleanSection === 'vip_batches') broadcastVipBatchesUpdate();
    else if (cleanSection === 'announcements') broadcastAnnouncementsUpdate();

    res.json({
      success: true,
      section: cleanSection,
      deleted_count: result.deleted_count,
      deleted_ids: result.deleted_ids,
      skipped_count: result.skipped_count,
      skipped_reasons: result.skipped_reasons,
      message:
        result.skipped_count > 0
          ? `Deleted ${result.deleted_count} record(s). Skipped ${result.skipped_count} protected record(s): ${result.skipped_reasons[0]}`
          : `Successfully deleted ${result.deleted_count} selected record(s).`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Bulk deletion failed due to an unexpected server error.';
    res.status(500).json({ error: msg });
  }
});

app.get('/api/admin/cleanup/preview', authenticate, requireAdmin, (req, res) => {
  const operation = String(req.query.operation || '').trim();
  const rawRetention = req.query.retentionDays !== undefined ? Number(req.query.retentionDays) : (storage.getSettings().data_retention_days ?? 30);
  const retentionDays = Math.min(3650, Math.max(0, Number.isFinite(rawRetention) ? rawRetention : 30));

  if (!ALLOWED_CLEANUP_OPERATIONS.has(operation)) {
    res.status(400).json({ error: 'Invalid or unsupported cleanup operation.' });
    return;
  }

  const preview = storage.previewCleanup(operation, retentionDays, UPLOADS_DIR);
  if (!preview) {
    res.status(400).json({ error: 'Unable to preview cleanup operation.' });
    return;
  }

  res.json({ preview });
});

app.post('/api/admin/cleanup/execute', authenticate, requireAdmin, async (req: AuthenticatedRequest, res) => {
  const { operation, retentionDays, confirmed } = req.body || {};
  const op = String(operation || '').trim();

  if (!confirmed) {
    res.status(400).json({ error: 'Explicit confirmation is required to execute bulk data cleanup.' });
    return;
  }

  if (!ALLOWED_CLEANUP_OPERATIONS.has(op)) {
    res.status(400).json({ error: 'Disallowed cleanup operation.' });
    return;
  }

  const caller = req.user ? storage.getUserById(req.user.id) : undefined;
  if (!caller || (caller.role !== 'admin' && caller.role !== 'super_admin')) {
    res.status(403).json({ error: 'Administrative privileges required.' });
    return;
  }

  const rawRetention = retentionDays !== undefined ? Number(retentionDays) : (storage.getSettings().data_retention_days ?? 30);
  const days = Math.min(3650, Math.max(0, Number.isFinite(rawRetention) ? rawRetention : 30));
  const preview = storage.previewCleanup(op, days, UPLOADS_DIR);
  if (!preview) {
    res.status(400).json({ error: 'Cleanup operation not found.' });
    return;
  }

  if (preview.requires_super_admin && caller.role !== 'super_admin') {
    res.status(403).json({
      error: 'Permission denied: Super Admin privileges are required for this bulk cleanup action.',
    });
    return;
  }

  const result = await storage.executeCleanup(op, days, UPLOADS_DIR);
  if (!result) {
    res.status(500).json({ error: 'Failed to execute cleanup operation.' });
    return;
  }

  if (result.deleted_user_ids) {
    for (const uid of result.deleted_user_ids) {
      revokeUserSessions(uid);
    }
  }

  if (op.startsWith('platforms_')) broadcastPlatformsUpdate();
  else if (op.startsWith('plans_')) broadcastVipPlansUpdate();
  else if (op.startsWith('announcements_')) broadcastAnnouncementsUpdate();

  res.json({
    success: true,
    operation: op,
    removed_count: result.removed_count,
    message: result.message,
  });
});

// Helper to validate hex colors
const isValidHex = (color: unknown): boolean => {
  if (typeof color !== 'string') return false;
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color.trim());
};

// 10. Settings & App Customization (Requires Authorized Administrator)
app.get('/api/admin/settings', authenticate, requireAdminPermission('settings', 'view'), (_req, res) => {
  res.json({ settings: storage.getSettings() });
});

app.post('/api/admin/settings', authenticate, requireAdminPermission('settings', 'edit'), async (req: AuthenticatedRequest, res) => {
  const {
    key_generation_enabled,
    shortener_url,
    tutorial_video_url,
    telegram_channel_url,
    study_blunder_telegram_url,
    study_blunder_telegram_label,
    study_fox_telegram_url,
    study_fox_telegram_label,
    telegram_popup_enabled,
    telegram_popup_title,
    telegram_popup_message,
    telegram_popup_button_text,
    telegram_popup_close_text,
    telegram_popup_reminder_text,
    telegram_popup_frequency,
    telegram_popup_show_on_resume,
    maintenance_mode,
    login_enabled,
    key_expiry_hours,
    free_access_duration,
    free_access_unit,
    vip_purchase_url,
    vip_telegram_url,
    vip_payment_qr_url,
    vip_payment_amount,
    vip_payment_instructions,
    vip_payment_utr_required,
    home_single_vip_label,
    home_single_vip_price,
    home_single_vip_duration_days,
    home_single_vip_destination,
    home_single_vip_url,
    home_all_vip_label,
    home_all_vip_price,
    home_all_vip_duration_days,
    home_all_vip_destination,
    home_all_vip_url,
    app_name,
    app_logo_url,
    app_theme_preset,
    theme_primary,
    theme_secondary,
    theme_background,
    theme_text,
    theme_button,
    vip_theme_background,
    vip_theme_card,
    vip_theme_accent,
    vip_theme_text,
    vip_theme_button,
    vip_theme_border,
    announcement_slider_enabled,
    announcement_slide_interval_seconds,
    support_enabled,
    support_url,
    support_title,
    support_button_label,
    support_description,
    support_image_url,
    donation_enabled,
    donation_url,
    donation_button_text,
    donation_title,
    donation_message,
    donation_description,
    donation_qr_url,
    custom_popup_enabled,
    custom_popup_title,
    custom_popup_message,
    custom_popup_image_url,
    custom_popup_button_text,
    custom_popup_button_url,
    custom_popup_close_text,
    custom_popup_start_date,
    custom_popup_end_date,
    custom_popup_frequency,
    data_retention_days,
    retention_login_history_days,
    retention_expired_keys_days,
    retention_failed_payments_days,
  } = req.body;

  const currentSettings = storage.getSettings();

  // Enforce Super Admin privilege only when actually changing global portal lock / retention settings
  const isModifyingSuperAdminSettings =
    (maintenance_mode !== undefined && Boolean(maintenance_mode) !== Boolean(currentSettings.maintenance_mode)) ||
    (login_enabled !== undefined && Boolean(login_enabled) !== Boolean(currentSettings.login_enabled)) ||
    (data_retention_days !== undefined && Number(data_retention_days) !== Number(currentSettings.data_retention_days));

  if (isModifyingSuperAdminSettings && req.user?.role !== 'super_admin') {
    res.status(403).json({ error: 'Super Admin privileges required to modify global system security settings.' });
    return;
  }

  if (shortener_url !== undefined && String(shortener_url).trim().length > 0 && !isSafeHttpUrl(shortener_url)) {
    res.status(400).json({ error: 'Shortener URL must be a valid URL starting with http:// or https://' });
    return;
  }

  let validatedKeyExpiryHours: number | undefined = undefined;
  if (key_expiry_hours !== undefined && key_expiry_hours !== null && key_expiry_hours !== '') {
    const parsedExp = Number(key_expiry_hours);
    if (!Number.isFinite(parsedExp) || parsedExp <= 0 || parsedExp > 8760) {
      res.status(400).json({ error: 'Key Expiry Hours must be a positive number between 1 and 8760.' });
      return;
    }
    validatedKeyExpiryHours = parsedExp;
  }

  let validatedFreeDuration: number | undefined = undefined;
  if (free_access_duration !== undefined && free_access_duration !== null && free_access_duration !== '') {
    const parsedDur = Number(free_access_duration);
    if (!Number.isFinite(parsedDur) || parsedDur <= 0) {
      res.status(400).json({ error: 'Free Access Duration must be a positive number.' });
      return;
    }
    validatedFreeDuration = parsedDur;
  }

  let validatedFreeUnit: 'minutes' | 'hours' | 'days' | undefined = undefined;
  if (free_access_unit !== undefined) {
    if (!['minutes', 'hours', 'days'].includes(String(free_access_unit))) {
      res.status(400).json({ error: 'Free Access Unit must be minutes, hours, or days.' });
      return;
    }
    validatedFreeUnit = free_access_unit as 'minutes' | 'hours' | 'days';
  }

  if (tutorial_video_url !== undefined && String(tutorial_video_url).trim().length > 0 && !isSafeHttpUrl(tutorial_video_url)) {
    res.status(400).json({ error: 'Tutorial Video URL must be a valid URL starting with http:// or https://' });
    return;
  }

  if (telegram_channel_url !== undefined && String(telegram_channel_url).trim().length > 0 && !isSafeHttpUrl(telegram_channel_url)) {
    res.status(400).json({ error: 'Telegram Channel URL must be a valid URL starting with http:// or https://' });
    return;
  }

  if (study_blunder_telegram_url !== undefined && String(study_blunder_telegram_url).trim().length > 0 && !isSafeHttpUrl(study_blunder_telegram_url)) {
    res.status(400).json({ error: 'Study Blunder Telegram URL must be a valid URL starting with http:// or https://' });
    return;
  }

  if (study_fox_telegram_url !== undefined && String(study_fox_telegram_url).trim().length > 0 && !isSafeHttpUrl(study_fox_telegram_url)) {
    res.status(400).json({ error: 'Study Fox Telegram URL must be a valid URL starting with http:// or https://' });
    return;
  }

  if (vip_purchase_url !== undefined && String(vip_purchase_url).trim().length > 0) {
    const trimmedVipUrl = String(vip_purchase_url).trim();
    if (!isSafeHttpUrl(trimmedVipUrl)) {
      res.status(400).json({ error: 'VIP Telegram / Purchase URL must start with http:// or https://' });
      return;
    }
  }

  if (vip_telegram_url !== undefined && String(vip_telegram_url).trim().length > 0) {
    const trimmedVipTgUrl = String(vip_telegram_url).trim();
    if (!isSafeHttpUrl(trimmedVipTgUrl)) {
      res.status(400).json({ error: 'VIP Telegram URL must start with http:// or https://' });
      return;
    }
  }

  let validatedVipPaymentAmount: number | undefined = undefined;
  if (vip_payment_amount !== undefined && vip_payment_amount !== null && vip_payment_amount !== '') {
    const parsedAmt = Number(vip_payment_amount);
    if (!Number.isFinite(parsedAmt) || parsedAmt < 0 || parsedAmt > 1000000) {
      res.status(400).json({ error: 'VIP Payment Amount must be a valid number between 0 and 1,000,000.' });
      return;
    }
    validatedVipPaymentAmount = Math.round(parsedAmt * 100) / 100;
  }

  if (support_url !== undefined && String(support_url).trim().length > 0 && !isSafeHttpUrl(support_url)) {
    res.status(400).json({ error: 'Support URL must be a valid URL starting with http:// or https://' });
    return;
  }

  if (donation_url !== undefined && String(donation_url).trim().length > 0 && !isSafeHttpUrl(donation_url)) {
    res.status(400).json({ error: 'Donation URL must be a valid URL starting with http:// or https://' });
    return;
  }

  if (custom_popup_button_url !== undefined && String(custom_popup_button_url).trim().length > 0 && !isSafeHttpUrl(custom_popup_button_url)) {
    res.status(400).json({ error: 'Custom Popup Button URL must be a valid URL starting with http:// or https://' });
    return;
  }

  const validateImageUrl = (val: unknown, label: string): boolean => {
    if (val === undefined || val === null || String(val).trim().length === 0) return true;
    const trimmed = String(val).trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return isSafeHttpUrl(trimmed);
    if (trimmed.startsWith('data:image/') || trimmed.startsWith('/uploads/')) return true;
    res.status(400).json({ error: `${label} must be a valid http/https image URL or uploaded image.` });
    return false;
  };

  if (!validateImageUrl(app_logo_url, 'App Logo URL')) return;
  if (!validateImageUrl(vip_payment_qr_url, 'VIP Payment QR Image URL')) return;
  if (!validateImageUrl(support_image_url, 'Support Image URL')) return;
  if (!validateImageUrl(donation_qr_url, 'Donation QR Image URL')) return;
  if (!validateImageUrl(custom_popup_image_url, 'Custom Popup Image URL')) return;

  // Announcement Slider Interval validation (2 to 60 seconds)
  let validatedSlideInterval: number | undefined = undefined;
  if (announcement_slide_interval_seconds !== undefined) {
    const parsedInt = Number(announcement_slide_interval_seconds);
    if (!Number.isFinite(parsedInt) || parsedInt < 2 || parsedInt > 60) {
      res.status(400).json({
        error: 'Announcement Slide Interval must be between 2 and 60 seconds.',
      });
      return;
    }
    validatedSlideInterval = Math.round(parsedInt);
  }

  // Custom & Telegram Popup Frequency validation
  const allowedFrequencies = ['every_launch', 'every_visit', 'once_per_session', 'once_per_day', 'once_per_user', 'disabled'];
  if (custom_popup_frequency !== undefined && !allowedFrequencies.includes(custom_popup_frequency)) {
    res.status(400).json({ error: 'Invalid custom popup display frequency.' });
    return;
  }
  if (telegram_popup_frequency !== undefined && !allowedFrequencies.includes(telegram_popup_frequency)) {
    res.status(400).json({ error: 'Invalid Telegram popup display frequency.' });
    return;
  }

  // App Customization Validation
  if (app_name !== undefined) {
    const trimmedName = String(app_name).trim();
    if (trimmedName.length === 0) {
      res.status(400).json({ error: 'Application Name cannot be empty.' });
      return;
    }
    if (trimmedName.length > 80) {
      res.status(400).json({ error: 'Application Name must not exceed 80 characters.' });
      return;
    }
  }

  // Theme Preset Validation (5 official themes)
  if (app_theme_preset !== undefined) {
    const cleanPreset = String(app_theme_preset).trim().toLowerCase();
    if (!(ALLOWED_APP_THEME_PRESETS as readonly string[]).includes(cleanPreset)) {
      res.status(400).json({
        error: 'Invalid theme preset. Allowed themes: red, yellow, pale_white_pink, blue, emerald.',
      });
      return;
    }
  }

  // Theme Colors Validation
  if (theme_primary !== undefined && !isValidHex(theme_primary)) {
    res.status(400).json({ error: 'Primary color must be a valid hex color code (e.g. #6366f1).' });
    return;
  }
  if (theme_secondary !== undefined && !isValidHex(theme_secondary)) {
    res.status(400).json({ error: 'Secondary color must be a valid hex color code (e.g. #8b5cf6).' });
    return;
  }
  if (theme_background !== undefined && !isValidHex(theme_background)) {
    res.status(400).json({ error: 'Background color must be a valid hex color code (e.g. #070B14).' });
    return;
  }
  if (theme_text !== undefined && !isValidHex(theme_text)) {
    res.status(400).json({ error: 'Text color must be a valid hex color code (e.g. #f8fafc).' });
    return;
  }
  if (theme_button !== undefined && !isValidHex(theme_button)) {
    res.status(400).json({ error: 'Button color must be a valid hex color code (e.g. #4f46e5).' });
    return;
  }

  // VIP Section Theme Colors Validation
  if (vip_theme_background !== undefined && !isValidHex(vip_theme_background)) {
    res.status(400).json({ error: 'VIP Background color must be a valid hex color code (e.g. #090d16).' });
    return;
  }
  if (vip_theme_card !== undefined && !isValidHex(vip_theme_card)) {
    res.status(400).json({ error: 'VIP Card color must be a valid hex color code (e.g. #0f172a).' });
    return;
  }
  if (vip_theme_accent !== undefined && !isValidHex(vip_theme_accent)) {
    res.status(400).json({ error: 'VIP Accent color must be a valid hex color code (e.g. #f59e0b).' });
    return;
  }
  if (vip_theme_text !== undefined && !isValidHex(vip_theme_text)) {
    res.status(400).json({ error: 'VIP Text color must be a valid hex color code (e.g. #f8fafc).' });
    return;
  }
  if (vip_theme_button !== undefined && !isValidHex(vip_theme_button)) {
    res.status(400).json({ error: 'VIP Button color must be a valid hex color code (e.g. #eab308).' });
    return;
  }
  if (vip_theme_border !== undefined && !isValidHex(vip_theme_border)) {
    res.status(400).json({ error: 'VIP Border color must be a valid hex color code (e.g. #1e293b).' });
    return;
  }

  // Smart dual-field alias resolution so editing EITHER alias persists without being overwritten by its sibling
  const resolveAliasPair = (
    primaryVal: unknown,
    aliasVal: unknown,
    curPrimary: string,
    curAlias: string
  ): string | undefined => {
    const hasPrimary = primaryVal !== undefined;
    const hasAlias = aliasVal !== undefined;
    if (!hasPrimary && !hasAlias) return undefined;
    const pStr = hasPrimary ? String(primaryVal).trim() : '';
    const aStr = hasAlias ? String(aliasVal).trim() : '';
    if (hasPrimary && !hasAlias) return pStr;
    if (!hasPrimary && hasAlias) return aStr;
    const pChanged = pStr !== (curPrimary || '').trim();
    const aChanged = aStr !== (curAlias || '').trim();
    if (pChanged && !aChanged) return pStr;
    if (aChanged && !pChanged) return aStr;
    return pStr;
  };

  const resolvedVipTelegramUrl = resolveAliasPair(
    vip_telegram_url,
    vip_purchase_url,
    currentSettings.vip_telegram_url || '',
    currentSettings.vip_purchase_url || ''
  );

  const resolvedSupportTitle = resolveAliasPair(
    support_title,
    support_button_label,
    currentSettings.support_title || '',
    currentSettings.support_button_label || ''
  );

  const resolvedDonationMessage = resolveAliasPair(
    donation_message,
    donation_description,
    currentSettings.donation_message || '',
    currentSettings.donation_description || ''
  );

  let validatedGraceHours: number | undefined = undefined;
  if (req.body.vip_grace_period_hours !== undefined && req.body.vip_grace_period_hours !== '') {
    const parsedGrace = Number(req.body.vip_grace_period_hours);
    if (!Number.isFinite(parsedGrace) || parsedGrace < 0 || parsedGrace > 168) {
      res.status(400).json({ error: 'VIP Grace Period must be between 0 and 168 hours.' });
      return;
    }
    validatedGraceHours = Math.round(parsedGrace);
  }

  let validatedReferralRewardDays: number | undefined = undefined;
  if (req.body.referral_reward_days !== undefined && req.body.referral_reward_days !== '') {
    const parsedReward = Number(req.body.referral_reward_days);
    if (!Number.isFinite(parsedReward) || parsedReward < 1 || parsedReward > 90) {
      res.status(400).json({ error: 'Referral Reward Days must be between 1 and 90.' });
      return;
    }
    validatedReferralRewardDays = Math.round(parsedReward);
  }

  try {
    const updated = await storage.updateSettings({
      ...(key_generation_enabled !== undefined && { key_generation_enabled: Boolean(key_generation_enabled) }),
      ...(shortener_url !== undefined && { shortener_url: String(shortener_url).trim() }),
      ...(tutorial_video_url !== undefined && { tutorial_video_url: String(tutorial_video_url).trim() }),
      ...(telegram_channel_url !== undefined && { telegram_channel_url: String(telegram_channel_url).trim() }),
      ...(study_blunder_telegram_url !== undefined && {
        study_blunder_telegram_url: String(study_blunder_telegram_url).trim(),
      }),
      ...(study_blunder_telegram_label !== undefined && {
        study_blunder_telegram_label: String(study_blunder_telegram_label).trim().slice(0, 60) || 'Study Blunder Telegram',
      }),
      ...(study_fox_telegram_url !== undefined && {
        study_fox_telegram_url: String(study_fox_telegram_url).trim(),
      }),
      ...(study_fox_telegram_label !== undefined && {
        study_fox_telegram_label: String(study_fox_telegram_label).trim().slice(0, 60) || 'Study Fox Telegram',
      }),
      ...(telegram_popup_enabled !== undefined && { telegram_popup_enabled: Boolean(telegram_popup_enabled) }),
      ...(telegram_popup_title !== undefined && { telegram_popup_title: String(telegram_popup_title).trim().slice(0, 120) }),
      ...(telegram_popup_message !== undefined && { telegram_popup_message: String(telegram_popup_message).trim().slice(0, 600) }),
      ...(telegram_popup_button_text !== undefined && { telegram_popup_button_text: String(telegram_popup_button_text).trim().slice(0, 60) }),
      ...(telegram_popup_close_text !== undefined && { telegram_popup_close_text: String(telegram_popup_close_text).trim().slice(0, 60) }),
      ...(telegram_popup_reminder_text !== undefined && { telegram_popup_reminder_text: String(telegram_popup_reminder_text).trim().slice(0, 150) }),
      ...(telegram_popup_frequency !== undefined && { telegram_popup_frequency }),
      ...(telegram_popup_show_on_resume !== undefined && { telegram_popup_show_on_resume: Boolean(telegram_popup_show_on_resume) }),
      ...(maintenance_mode !== undefined && { maintenance_mode: Boolean(maintenance_mode) }),
      ...(login_enabled !== undefined && { login_enabled: Boolean(login_enabled) }),
      ...(validatedKeyExpiryHours !== undefined && { key_expiry_hours: validatedKeyExpiryHours }),
      ...(validatedFreeDuration !== undefined && { free_access_duration: validatedFreeDuration }),
      ...(validatedFreeUnit !== undefined && { free_access_unit: validatedFreeUnit }),
      ...(resolvedVipTelegramUrl !== undefined && {
        vip_purchase_url: resolvedVipTelegramUrl,
        vip_telegram_url: resolvedVipTelegramUrl,
      }),
      ...(vip_payment_qr_url !== undefined && { vip_payment_qr_url: String(vip_payment_qr_url).trim() }),
      ...(validatedVipPaymentAmount !== undefined && { vip_payment_amount: validatedVipPaymentAmount }),
      ...(vip_payment_instructions !== undefined && {
        vip_payment_instructions: String(vip_payment_instructions).trim().slice(0, 1000),
      }),
      ...(vip_payment_utr_required !== undefined && { vip_payment_utr_required: Boolean(vip_payment_utr_required) }),
      ...(home_single_vip_label !== undefined && {
        home_single_vip_label: String(home_single_vip_label).trim().slice(0, 40) || 'VIP',
      }),
      ...(home_single_vip_price !== undefined && home_single_vip_price !== '' && Number.isFinite(Number(home_single_vip_price)) && {
        home_single_vip_price: Math.min(1000000, Math.max(0, Number(home_single_vip_price))),
      }),
      ...(home_single_vip_duration_days !== undefined && home_single_vip_duration_days !== '' && Number.isFinite(Number(home_single_vip_duration_days)) && {
        home_single_vip_duration_days: Math.min(3650, Math.max(1, Math.round(Number(home_single_vip_duration_days)))),
      }),
      ...(home_single_vip_destination !== undefined && {
        home_single_vip_destination:
          home_single_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_single_vip',
      }),
      ...(home_single_vip_url !== undefined && {
        home_single_vip_url: String(home_single_vip_url).trim(),
      }),
      ...(home_all_vip_label !== undefined && {
        home_all_vip_label: String(home_all_vip_label).trim().slice(0, 40) || 'ALL VIP',
      }),
      ...(home_all_vip_price !== undefined && home_all_vip_price !== '' && Number.isFinite(Number(home_all_vip_price)) && {
        home_all_vip_price: Math.min(1000000, Math.max(0, Number(home_all_vip_price))),
      }),
      ...(home_all_vip_duration_days !== undefined && home_all_vip_duration_days !== '' && Number.isFinite(Number(home_all_vip_duration_days)) && {
        home_all_vip_duration_days: Math.min(3650, Math.max(1, Math.round(Number(home_all_vip_duration_days)))),
      }),
      ...(home_all_vip_destination !== undefined && {
        home_all_vip_destination:
          home_all_vip_destination === 'custom_url' ? 'custom_url' : 'in_app_all_vip',
      }),
      ...(home_all_vip_url !== undefined && {
        home_all_vip_url: String(home_all_vip_url).trim(),
      }),
      ...(app_name !== undefined && { app_name: String(app_name).trim() }),
      ...(app_logo_url !== undefined && { app_logo_url: String(app_logo_url).trim() }),
      ...(app_theme_preset !== undefined && {
        app_theme_preset: normalizeAppThemePreset(app_theme_preset),
      }),
      ...(theme_primary !== undefined && { theme_primary: String(theme_primary).trim() }),
      ...(theme_secondary !== undefined && { theme_secondary: String(theme_secondary).trim() }),
      ...(theme_background !== undefined && { theme_background: String(theme_background).trim() }),
      ...(theme_text !== undefined && { theme_text: String(theme_text).trim() }),
      ...(theme_button !== undefined && { theme_button: String(theme_button).trim() }),
      ...(vip_theme_background !== undefined && { vip_theme_background: String(vip_theme_background).trim() }),
      ...(vip_theme_card !== undefined && { vip_theme_card: String(vip_theme_card).trim() }),
      ...(vip_theme_accent !== undefined && { vip_theme_accent: String(vip_theme_accent).trim() }),
      ...(vip_theme_text !== undefined && { vip_theme_text: String(vip_theme_text).trim() }),
      ...(vip_theme_button !== undefined && { vip_theme_button: String(vip_theme_button).trim() }),
      ...(vip_theme_border !== undefined && { vip_theme_border: String(vip_theme_border).trim() }),
      ...(announcement_slider_enabled !== undefined && { announcement_slider_enabled: Boolean(announcement_slider_enabled) }),
      ...(validatedSlideInterval !== undefined && { announcement_slide_interval_seconds: validatedSlideInterval }),
      ...(support_enabled !== undefined && { support_enabled: Boolean(support_enabled) }),
      ...(support_url !== undefined && { support_url: String(support_url).trim() }),
      ...(resolvedSupportTitle !== undefined && {
        support_title: resolvedSupportTitle.slice(0, 80),
        support_button_label: resolvedSupportTitle.slice(0, 80),
      }),
      ...(support_description !== undefined && { support_description: String(support_description).trim().slice(0, 400) }),
      ...(support_image_url !== undefined && { support_image_url: String(support_image_url).trim() }),
      ...(donation_enabled !== undefined && { donation_enabled: Boolean(donation_enabled) }),
      ...(donation_url !== undefined && { donation_url: String(donation_url).trim() }),
      ...(donation_button_text !== undefined && { donation_button_text: String(donation_button_text).trim().slice(0, 80) }),
      ...(donation_title !== undefined && { donation_title: String(donation_title).trim().slice(0, 120) }),
      ...(resolvedDonationMessage !== undefined && {
        donation_message: resolvedDonationMessage.slice(0, 500),
        donation_description: resolvedDonationMessage.slice(0, 500),
      }),
      ...(donation_qr_url !== undefined && { donation_qr_url: String(donation_qr_url).trim() }),
      ...(custom_popup_enabled !== undefined && { custom_popup_enabled: Boolean(custom_popup_enabled) }),
      ...(custom_popup_title !== undefined && { custom_popup_title: String(custom_popup_title).trim().slice(0, 150) }),
      ...(custom_popup_message !== undefined && { custom_popup_message: String(custom_popup_message).trim().slice(0, 1000) }),
      ...(custom_popup_image_url !== undefined && { custom_popup_image_url: String(custom_popup_image_url).trim() }),
      ...(custom_popup_button_text !== undefined && { custom_popup_button_text: String(custom_popup_button_text).trim().slice(0, 80) }),
      ...(custom_popup_button_url !== undefined && { custom_popup_button_url: String(custom_popup_button_url).trim() }),
      ...(custom_popup_close_text !== undefined && { custom_popup_close_text: String(custom_popup_close_text).trim().slice(0, 60) }),
      ...(custom_popup_start_date !== undefined && { custom_popup_start_date: custom_popup_start_date || null }),
      ...(custom_popup_end_date !== undefined && { custom_popup_end_date: custom_popup_end_date || null }),
      ...(custom_popup_frequency !== undefined && { custom_popup_frequency }),
      ...(data_retention_days !== undefined && {
        data_retention_days: Math.min(3650, Math.max(1, Math.round(Number(data_retention_days) || 30))),
      }),
      ...(retention_login_history_days !== undefined && {
        retention_login_history_days: Math.min(3650, Math.max(1, Math.round(Number(retention_login_history_days) || 30))),
      }),
      ...(retention_expired_keys_days !== undefined && {
        retention_expired_keys_days: Math.min(3650, Math.max(0, Math.round(Number(retention_expired_keys_days) || 0))),
      }),
      ...(retention_failed_payments_days !== undefined && {
        retention_failed_payments_days: Math.min(3650, Math.max(1, Math.round(Number(retention_failed_payments_days) || 30))),
      }),
      ...(validatedGraceHours !== undefined && { vip_grace_period_hours: validatedGraceHours }),
      ...(validatedReferralRewardDays !== undefined && { referral_reward_days: validatedReferralRewardDays }),
      ...(req.body.referral_program_enabled !== undefined && {
        referral_program_enabled: Boolean(req.body.referral_program_enabled),
      }),
      ...(req.body.referral_discount_config && typeof req.body.referral_discount_config === 'object' && {
        referral_discount_config: req.body.referral_discount_config,
      }),
    });

    if (req.user) {
      storage.recordAdminAuditLog({
        admin_id: req.user.id,
        admin_email: req.user.email,
        admin_role: req.user.role,
        section: 'settings',
        action_type: 'settings_change',
        target_id: 'global_config',
        description: 'Updated Application Settings',
        previous_value: { maintenance_mode: currentSettings.maintenance_mode, login_enabled: currentSettings.login_enabled },
        new_value: { maintenance_mode: updated.maintenance_mode, login_enabled: updated.login_enabled },
        status: 'success',
      });
    }

    broadcastSettingsUpdate();
    res.json({ settings: updated, message: 'Settings saved successfully.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save settings in database.';
    if (req.user) {
      storage.recordAdminAuditLog({
        admin_id: req.user.id,
        admin_email: req.user.email,
        admin_role: req.user.role,
        section: 'settings',
        action_type: 'settings_change',
        target_id: 'global_config',
        description: `Failed to update Application Settings: ${msg}`,
        status: 'failed',
      });
    }
    res.status(500).json({ error: msg });
  }
});

// ==========================================================
// STUDENT GROWTH FEATURES ROUTES
// (Exam Timer, Offer Board, 30-Day Daily Motivation,
//  XP Leaderboard, Study Logs & Sunday Parents Report Card)
// ==========================================================

app.get('/api/offer-board', (_req, res) => {
  res.json({ offers: storage.getOfferBoard(true) });
});

app.get('/api/daily-motivation/today', (_req, res) => {
  res.json(storage.getTodayDailyMotivation());
});

app.get('/api/leaderboard', optionalAuthenticate, (req: AuthenticatedRequest, res) => {
  const userId = req.user?.id;
  res.json(storage.getXpLeaderboard(userId));
});

app.get('/api/student/exam-timer', authenticate, (req: AuthenticatedRequest, res) => {
  const timer = storage.getStudentExamTimer(req.user!.id);
  res.json({ timer });
});

app.put('/api/student/exam-timer', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const { exam_name, exam_datetime } = req.body || {};
    const timer = storage.setStudentExamTimer(req.user!.id, String(exam_name || ''), String(exam_datetime || ''));
    res.json({ timer, message: 'Exam timer saved successfully!' });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save exam timer.' });
  }
});

app.get('/api/student/parents-report', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const report = storage.getParentsReportCard(req.user!.id);
    res.json({ report });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to load parents report card.' });
  }
});

app.put('/api/student/parents-report/settings', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const { parent_name, parent_whatsapp, parent_email, auto_sunday_enabled } = req.body || {};
    storage.saveParentReportSettings(req.user!.id, {
      parent_name,
      parent_whatsapp,
      parent_email,
      auto_sunday_enabled,
    });
    const report = storage.getParentsReportCard(req.user!.id);
    res.json({ report, message: 'Parent report settings saved!' });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save parent settings.' });
  }
});

app.post('/api/student/study-session', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const { minutes, source, note } = req.body || {};
    const parsedMinutes = Number(minutes);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes < 1 || parsedMinutes > 720) {
      res.status(400).json({ error: 'Please enter study time between 1 and 720 minutes.' });
      return;
    }
    const cleanSource = source === 'timer' || source === 'platform' ? source : 'manual';
    const result = storage.logStudyMinutes(req.user!.id, parsedMinutes, cleanSource, String(note || ''));
    const report = storage.getParentsReportCard(req.user!.id);
    res.json({
      success: true,
      log: result.log,
      xp_earned: result.xp_earned,
      report,
      message: `Logged ${result.log.minutes} mins (+${result.xp_earned} XP)!`,
    });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to log study session.' });
  }
});

app.get('/api/admin/offer-board', authenticate, requireAdmin, (_req, res) => {
  res.json({ offers: storage.getOfferBoard(false) });
});

app.put('/api/admin/offer-board', authenticate, requireAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const items = Array.isArray(req.body?.offers) ? req.body.offers : [];
    const saved = storage.saveOfferBoard(items);
    broadcastSettingsUpdate();
    res.json({ offers: saved, message: 'Offer Board updated and published live!' });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update Offer Board.' });
  }
});

app.get('/api/admin/daily-motivation', authenticate, requireAdmin, (_req, res) => {
  res.json({
    motivations: storage.getDailyMotivations(),
    today: storage.getTodayDailyMotivation(),
  });
});

app.put('/api/admin/daily-motivation', authenticate, requireAdmin, (req: AuthenticatedRequest, res) => {
  try {
    const items = Array.isArray(req.body?.motivations) ? req.body.motivations : [];
    const saved = storage.saveDailyMotivations(items);
    broadcastSettingsUpdate();
    res.json({
      motivations: saved,
      today: storage.getTodayDailyMotivation(),
      message: '30-Day Daily Motivation schedule saved!',
    });
  } catch (err: unknown) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save Daily Motivation schedule.' });
  }
});

// Cloud DB Persistence Status, Migration SQL Viewer & 1-Click Sync (Admin Only)
app.get('/api/admin/storage/status', authenticate, requireAdmin, (_req, res) => {
  res.json({
    storage: storage.getStorageHealth(),
    counts: {
      users: storage.getUsers().length,
      platforms: storage.getPlatforms(false).length,
      vip_plans: storage.getVipPlans(false).length,
      announcements: storage.getAnnouncements(false).length,
      payments: storage.getPayments().length,
    },
  });
});

app.get('/api/admin/storage/migration-sql', authenticate, requireAdmin, (_req, res) => {
  try {
    const sqlPath = path.resolve(process.cwd(), 'supabase_migration.sql');
    if (!fs.existsSync(sqlPath)) {
      res.status(404).json({ error: 'supabase_migration.sql file not found on server.' });
      return;
    }
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    res.json({ sql });
  } catch (err: unknown) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load migration SQL.',
    });
  }
});

app.post('/api/admin/storage/sync-supabase', authenticate, requireAdmin, async (_req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const result = await storage.syncAllLocalToSupabase(supabaseUrl, supabaseKey);
  if (!result.synced) {
    res.status(400).json(result);
    return;
  }
  broadcastSettingsUpdate();
  broadcastPlatformsUpdate();
  res.json(result);
});

// Generic Admin Asset Upload Endpoint (for Support Image, VIP Payment QR, Donation QR, Custom Popup Image, Platform Logos)
app.post('/api/admin/upload-asset', authenticate, requireAdmin, async (req, res) => {
  try {
    const { dataUrl, mimeType, prefix, settingKey } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      res.status(400).json({ error: 'Image file data is required.' });
      return;
    }

    const matches = dataUrl.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
    let detectedMime = mimeType || 'image/png';
    let base64Data = dataUrl;

    if (matches && matches.length === 3) {
      detectedMime = matches[1];
      base64Data = matches[2];
    } else if (dataUrl.includes('base64,')) {
      base64Data = dataUrl.split('base64,')[1];
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedMimes.includes(detectedMime.toLowerCase())) {
      res.status(400).json({
        error: 'Unsupported image format. Please upload PNG, JPG, SVG, or WebP.',
      });
      return;
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const MAX_ASSET_BYTES = 5 * 1024 * 1024; // 5MB
    if (buffer.length === 0 || buffer.length > MAX_ASSET_BYTES) {
      res.status(400).json({ error: 'Image exceeds the 5MB limit.' });
      return;
    }

    if (detectedMime.toLowerCase().includes('svg')) {
      const svgText = buffer.toString('utf-8').toLowerCase();
      if (
        svgText.includes('<script') ||
        svgText.includes('javascript:') ||
        /\bon[a-z]+\s*=/.test(svgText)
      ) {
        res.status(400).json({
          error: 'SVG file contains disallowed script or event attributes and was rejected for security.',
        });
        return;
      }
    }

    let ext = 'png';
    if (detectedMime.includes('jpeg') || detectedMime.includes('jpg')) ext = 'jpg';
    else if (detectedMime.includes('svg')) ext = 'svg';
    else if (detectedMime.includes('webp')) ext = 'webp';

    const safePrefix = String(prefix || 'asset').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'asset';
    const cleanFileName = `${safePrefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, cleanFileName);

    // Always write to local persistent uploads directory
    fs.writeFileSync(filePath, buffer);
    let assetUrl = `/uploads/${cleanFileName}`;

    // Also upload to Supabase Storage app-assets bucket if configured
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: bucketData, error: bucketErr } = await supabase.storage.getBucket('app-assets');
        if (bucketErr || !bucketData) {
          await supabase.storage.createBucket('app-assets', {
            public: true,
            fileSizeLimit: MAX_ASSET_BYTES,
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'],
          });
        }
        const storagePath = `assets/${cleanFileName}`;
        const { error: uploadErr } = await supabase.storage
          .from('app-assets')
          .upload(storagePath, buffer, {
            contentType: detectedMime,
            upsert: true,
          });
        if (!uploadErr) {
          const { data: publicUrlData } = supabase.storage
            .from('app-assets')
            .getPublicUrl(storagePath);
          if (publicUrlData?.publicUrl) {
            assetUrl = publicUrlData.publicUrl;
          }
        }
      } catch {
        // Keep local /uploads/ URL if Supabase Storage is unreachable
      }
    }

    // If a known settingKey is provided, immediately persist it in database settings so it survives page refresh
    const allowedSettingKeys = [
      'support_image_url',
      'donation_qr_url',
      'vip_payment_qr_url',
      'custom_popup_image_url',
      'app_logo_url',
    ] as const;

    let updatedSettings = undefined;
    if (settingKey && allowedSettingKeys.includes(settingKey)) {
      updatedSettings = await storage.updateSettings({ [settingKey]: assetUrl });
      broadcastSettingsUpdate();
    }

    res.json({
      success: true,
      url: assetUrl,
      ...(updatedSettings && { settings: updatedSettings }),
      message: 'Image uploaded and saved successfully.',
    });
  } catch {
    res.status(500).json({ error: 'Failed to process image upload.' });
  }
});

// Helper to sync settings to Supabase app_settings table if configured
async function syncSettingsToSupabase(settings: any) {
  if (!settings || typeof settings !== 'object' || typeof settings.then === 'function') return;
  try {
    await storage.syncSettingsToSupabase();
  } catch {
    // Non-fatal fallback
  }
}

// Dedicated Logo Upload Endpoint (Uploads directly to Supabase Storage with local backup)
app.post('/api/admin/upload-logo', authenticate, requireAdmin, async (req, res) => {
  try {
    const { dataUrl, filename, mimeType } = req.body;

    if (!dataUrl || typeof dataUrl !== 'string') {
      res.status(400).json({ error: 'Image file data is required.' });
      return;
    }

    // Match and extract base64 data
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let detectedMime = mimeType || 'image/png';
    let base64Data = dataUrl;

    if (matches && matches.length === 3) {
      detectedMime = matches[1];
      base64Data = matches[2];
    } else if (dataUrl.includes('base64,')) {
      const parts = dataUrl.split('base64,');
      base64Data = parts[1];
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
    if (!allowedMimes.includes(detectedMime.toLowerCase())) {
      res.status(400).json({
        error: `Unsupported image format (${detectedMime}). Supported formats: PNG, JPG, JPEG, SVG, WebP.`,
      });
      return;
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (buffer.length > MAX_SIZE) {
      res.status(400).json({
        error: `Logo file size exceeds the 2MB limit (received ${(buffer.length / (1024 * 1024)).toFixed(2)} MB). Please select an image under 2MB.`,
      });
      return;
    }

    // If SVG, scan for embedded scripts or event handlers to prevent SVG XSS
    if (detectedMime.toLowerCase().includes('svg')) {
      const svgText = buffer.toString('utf-8').toLowerCase();
      if (
        svgText.includes('<script') ||
        svgText.includes('javascript:') ||
        /\bon[a-z]+\s*=/.test(svgText)
      ) {
        res.status(400).json({
          error: 'SVG file contains disallowed script or event attributes and was rejected for security.',
        });
        return;
      }
    }

    // Determine extension
    let ext = 'png';
    if (detectedMime.includes('jpeg') || detectedMime.includes('jpg')) ext = 'jpg';
    else if (detectedMime.includes('svg')) ext = 'svg';
    else if (detectedMime.includes('webp')) ext = 'webp';

    const safeTimestamp = Date.now();
    const cleanFileName = `logo-${safeTimestamp}-${Math.random().toString(36).substring(2, 7)}.${ext}`;
    let finalLogoUrl = '';

    // Check if Supabase Storage is configured in environment
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey && !supabaseUrl.includes('your-project')) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Ensure bucket app-assets exists
        const { data: bucketData, error: bucketErr } = await supabase.storage.getBucket('app-assets');
        if (bucketErr || !bucketData) {
          await supabase.storage.createBucket('app-assets', {
            public: true,
            fileSizeLimit: 2097152,
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'],
          });
        }

        const storagePath = `logos/${cleanFileName}`;
        const { error: uploadErr } = await supabase.storage
          .from('app-assets')
          .upload(storagePath, buffer, {
            contentType: detectedMime,
            upsert: true,
          });

        if (!uploadErr) {
          const { data: publicUrlData } = supabase.storage
            .from('app-assets')
            .getPublicUrl(storagePath);
          if (publicUrlData?.publicUrl) {
            finalLogoUrl = publicUrlData.publicUrl;
          }
        } else {
          console.warn('Supabase storage upload error:', uploadErr.message);
        }
      } catch (sbErr) {
        console.warn('Supabase upload exception:', sbErr);
      }
    }

    // Fallback to local storage if Supabase upload was not possible
    if (!finalLogoUrl) {
      const filePath = path.join(UPLOADS_DIR, cleanFileName);
      fs.writeFileSync(filePath, buffer);
      finalLogoUrl = `/uploads/${cleanFileName}`;
    }

    // Persist new logo URL to database settings immediately
    const updated = await storage.updateSettings({ app_logo_url: finalLogoUrl });
    broadcastSettingsUpdate();

    res.json({
      success: true,
      url: finalLogoUrl,
      settings: updated,
      message: 'Application logo uploaded and saved successfully.',
    });
  } catch (err) {
    console.error('Logo upload handler error:', err);
    res.status(500).json({ error: 'Failed to process logo image upload.' });
  }
});

// 11. Admin Security (Requires Super Admin)
app.get('/api/admin/admins', authenticate, requireSuperAdmin, (_req, res) => {
  const users = storage.getUsers();
  const admins = users.filter((u) => u.role === 'admin' || u.role === 'super_admin').map((u) => toPublicUser(u));
  res.json({ admins });
});

app.post('/api/admin/admins', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const caller = req.user ? storage.getUserById(req.user.id) : undefined;
  if (!caller || caller.role !== 'super_admin') {
    res.status(403).json({ error: 'Super Admin privileges required for this operation.' });
    return;
  }

  const { email, password, role } = req.body;
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (trimmedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    res.status(400).json({ error: 'Please enter a valid administrator email address.' });
    return;
  }

  if (password.length < 6 || password.length > 128) {
    res.status(400).json({ error: 'Administrator password must be between 6 and 128 characters.' });
    return;
  }

  const targetRole = role === 'super_admin' ? 'super_admin' : 'admin';

  // Protect the primary Super Admin account from being downgraded or modified by another account
  if (trimmedEmail === PRIMARY_SUPER_ADMIN_EMAIL) {
    if (targetRole !== 'super_admin') {
      res.status(403).json({ error: 'The primary Super Admin account role cannot be downgraded.' });
      return;
    }
    if (caller.email.toLowerCase() !== PRIMARY_SUPER_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Only the primary Super Admin may update their own credentials.' });
      return;
    }
  }

  let supabaseUserId: string | null = null;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project')) {
    try {
      const sbAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: listData } = await sbAdmin.auth.admin.listUsers();
      const existingSb = listData?.users.find((u) => u.email?.toLowerCase() === trimmedEmail);
      if (existingSb) {
        await sbAdmin.auth.admin.updateUserById(existingSb.id, {
          password,
          email_confirm: true,
          app_metadata: { ...existingSb.app_metadata, role: targetRole },
          user_metadata: { ...existingSb.user_metadata, role: targetRole },
        });
        supabaseUserId = existingSb.id;
      } else {
        const { data: createdSb } = await sbAdmin.auth.admin.createUser({
          email: trimmedEmail,
          password,
          email_confirm: true,
          app_metadata: { role: targetRole },
          user_metadata: { role: targetRole },
        });
        if (createdSb?.user) {
          supabaseUserId = createdSb.user.id;
        }
      }
    } catch {
      // Proceed with local storage update if Supabase Admin API fails
    }
  }

  const existing = storage.getUserByEmail(trimmedEmail);
  if (existing) {
    const updated = await storage.updateUser(existing.id, {
      role: targetRole,
      ...(password ? { password_hash: hashPassword(password) } : {}),
    });
    if (existing.id !== caller.id) {
      revokeUserSessions(existing.id);
    }
    res.json({ admin: toPublicUser(updated!), message: 'Admin account updated.' });
    return;
  }

  const newAdmin = await storage.createUser({
    id: supabaseUserId || `admin_${Date.now()}`,
    email: trimmedEmail,
    password_hash: hashPassword(password),
    role: targetRole,
    vip_active: true,
    vip_expires_at: null,
    created_at: new Date().toISOString(),
    last_login_at: null,
  });

  res.status(201).json({ admin: toPublicUser(newAdmin), message: 'Admin account created successfully.' });
});

app.delete('/api/admin/admins/:id', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // 1. Re-verify Super Admin caller strictly from trusted server-side storage
    const caller = req.user ? storage.getUserById(req.user.id) : undefined;
    if (!caller || caller.role !== 'super_admin') {
      res.status(403).json({
        error: 'Permission denied: Only an authenticated Super Admin may delete ordinary Admin accounts.',
      });
      return;
    }

    // 2. Look up target account in trusted storage
    const target = storage.getUserById(id);
    if (!target) {
      res.status(404).json({ error: 'Administrator account not found.' });
      return;
    }

    // 3. Enforce strict authorization & protection rules
    if (target.email.toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL) {
      res.status(403).json({
        error: 'The primary Super Admin account is protected and cannot be deleted.',
      });
      return;
    }

    if (caller.id === target.id) {
      res.status(400).json({ error: 'You cannot delete your own Super Admin account.' });
      return;
    }

    if (target.role === 'super_admin') {
      res.status(403).json({
        error: 'Super Admin accounts cannot be deleted. Only ordinary Admin accounts may be removed.',
      });
      return;
    }

    if (target.role !== 'admin') {
      res.status(400).json({
        error: 'Target account is not an ordinary Admin account.',
      });
      return;
    }

    // 4. Delete from Supabase Auth & Supabase app_users (if configured and account exists in Supabase)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isSupabaseConfigured = Boolean(
      supabaseUrl && supabaseServiceKey && !supabaseUrl.includes('your-project')
    );

    if (isSupabaseConfigured) {
      const sbAdmin = createClient(supabaseUrl!, supabaseServiceKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Locate matching Supabase Auth account by ID or email
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target.id);
      let sbTargetId: string | null = isUuid ? target.id : null;

      if (!sbTargetId) {
        const { data: listData } = await sbAdmin.auth.admin.listUsers();
        const foundSb = listData?.users.find(
          (u) => u.email?.toLowerCase() === target.email.toLowerCase()
        );
        if (foundSb && foundSb.email?.toLowerCase() !== PRIMARY_SUPER_ADMIN_EMAIL) {
          sbTargetId = foundSb.id;
        }
      }

      if (sbTargetId) {
        const { error: sbDeleteErr } = await sbAdmin.auth.admin.deleteUser(sbTargetId);
        if (sbDeleteErr && !sbDeleteErr.message?.toLowerCase().includes('not found')) {
          res.status(500).json({
            error: `Supabase Auth deletion failed: ${sbDeleteErr.message}. Ensure SUPABASE_SERVICE_ROLE_KEY has service_role permissions.`,
          });
          return;
        }
      }

      // Remove profile row from Supabase app_users table if the table exists in the project
      const { error: dbDeleteErr } = await sbAdmin
        .from('app_users')
        .delete()
        .eq('email', target.email.toLowerCase())
        .eq('role', 'admin');

      if (dbDeleteErr && dbDeleteErr.code !== 'PGRST205' && dbDeleteErr.code !== '42P01') {
        res.status(500).json({
          error: `Database profile deletion failed: ${dbDeleteErr.message}`,
        });
        return;
      }
    }

    // 5. Delete from application database storage (preserving login_history and payment_records audit history)
    const deleted = await storage.deleteUser(target.id);
    if (!deleted) {
      res.status(500).json({ error: 'Failed to remove Admin account from application database.' });
      return;
    }

    // 6. Immediately revoke any active sessions/tokens belonging to the deleted Admin
    revokeUserSessions(target.id);

    res.json({
      success: true,
      deleted_id: target.id,
      message: `Administrator account (${target.email}) deleted successfully.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected server error while deleting administrator account.';
    res.status(500).json({ error: msg });
  }
});

// ----------------------------------------------------
// 12. Festival Decoration Manager (Public, SSE Stream & Admin APIs)
// ----------------------------------------------------

const festivalSseClients = new Set<express.Response>();

function broadcastFestivalUpdate(): void {
  if (festivalSseClients.size === 0) return;
  try {
    const payload = JSON.stringify(storage.getPublicFestivalState());
    const frame = `event: festival_update\ndata: ${payload}\n\n`;
    for (const client of festivalSseClients) {
      try {
        client.write(frame);
      } catch {
        festivalSseClients.delete(client);
      }
    }
  } catch {
    // Non-fatal broadcast error
  }
}

// Background 15-second IST Schedule Evaluator so scheduled festival activations/expirations
// broadcast to live users even when no admin dashboard is open
setInterval(() => {
  try {
    const evalResult = storage.evaluateFestivalSchedules(Date.now());
    if (evalResult.stateChanged) {
      broadcastFestivalUpdate();
    }
  } catch {
    // Ignore transient schedule evaluation errors
  }
}, 15_000);

// Public: Get active festival decoration configuration
app.get('/api/festivals/active', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json(storage.getPublicFestivalState());
});

// Public: Real-Time Server-Sent Events (SSE) stream for instant live decoration sync
app.get('/api/festivals/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  festivalSseClients.add(res);

  // Immediately send current active festival state
  try {
    const initialPayload = JSON.stringify(storage.getPublicFestivalState());
    res.write(`event: festival_update\ndata: ${initialPayload}\n\n`);
  } catch {
    // Ignore write error
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
      festivalSseClients.delete(res);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    festivalSseClients.delete(res);
  });
});

function broadcastSseEvent(eventName: string, data: unknown): void {
  if (festivalSseClients.size === 0) return;
  try {
    const payload = JSON.stringify(data);
    const frame = `event: ${eventName}\ndata: ${payload}\n\n`;
    for (const client of festivalSseClients) {
      try {
        client.write(frame);
      } catch {
        festivalSseClients.delete(client);
      }
    }
  } catch {
    // Non-fatal broadcast error
  }
}

function broadcastSettingsUpdate(): void {
  broadcastSseEvent('settings_update', buildPublicSettingsPayload());
}

function broadcastPlatformsUpdate(): void {
  broadcastSseEvent('platforms_update', { updated_at: new Date().toISOString() });
}

function broadcastAnnouncementsUpdate(): void {
  broadcastSseEvent('announcements_update', { updated_at: new Date().toISOString() });
}

function broadcastVipPlansUpdate(): void {
  broadcastSseEvent('vip_plans_update', { updated_at: new Date().toISOString() });
}

function broadcastVipBatchesUpdate(): void {
  broadcastSseEvent('vip_batches_update', { updated_at: new Date().toISOString() });
}

function broadcastVipStatusUpdate(data: Record<string, unknown>): void {
  broadcastSseEvent('vip_status_update', data);
}

function broadcastVipFeaturesUpdate(): void {
  broadcastSseEvent('vip_features_update', storage.getVipFeatureManagementState());
}

// Admin: Get full 15-festival catalog and master toggle state
app.get('/api/admin/festivals', authenticate, requireAdminPermission('festivals', 'view'), (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(storage.getAdminFestivalState());
});

// Admin: Toggle Global Master Switch ("Festival Decorations – ON/OFF")
app.post('/api/admin/festivals/master-toggle', authenticate, requireAdminPermission('festivals', 'edit'), async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const state = await storage.setFestivalGlobalEnabled(enabled);
    broadcastFestivalUpdate();
    res.json({
      success: true,
      state,
      message: enabled
        ? 'Global Festival Decorations enabled.'
        : 'Global Festival Decorations disabled across the entire website and APK.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update global festival toggle.';
    res.status(500).json({ error: msg });
  }
});

// Admin: Toggle an individual festival ON or OFF (with single-active replacement confirmation check)
app.post('/api/admin/festivals/:id/toggle', authenticate, requireAdminPermission('festivals', 'edit'), async (req, res) => {
  try {
    const festivalId = String(req.params.id || '').trim();
    const enabled = Boolean(req.body?.enabled);
    const forceReplace = Boolean(req.body?.force_replace);

    const result = await storage.toggleFestival(festivalId, enabled, forceReplace);

    if (!result.success && result.requires_confirmation) {
      res.status(200).json({
        success: false,
        requires_confirmation: true,
        current_active: result.current_active,
        target_festival: result.target_festival,
        message: `${result.current_active?.name} ${result.current_active?.icon} is currently active. Activating ${result.target_festival?.name} ${result.target_festival?.icon} will automatically deactivate ${result.current_active?.name}.`,
      });
      return;
    }

    if (!result.success) {
      res.status(400).json({ error: result.error || 'Failed to toggle festival decoration.' });
      return;
    }

    broadcastFestivalUpdate();
    const targetFest = result.state?.festivals.find((f) => f.id === festivalId);
    res.json({
      success: true,
      replaced_festival_name: result.replaced_festival_name || null,
      state: result.state,
      message: enabled
        ? result.replaced_festival_name
          ? `${targetFest?.name || 'Festival'} activated and ${result.replaced_festival_name} automatically deactivated.`
          : `${targetFest?.name || 'Festival'} decoration activated!`
        : `${targetFest?.name || 'Festival'} decoration turned OFF.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to toggle festival status.';
    res.status(500).json({ error: msg });
  }
});

// Admin: Update a festival's customization, IST schedule, target screens, or custom assets
app.put('/api/admin/festivals/:id', authenticate, requireAdminPermission('festivals', 'edit'), async (req, res) => {
  try {
    const festivalId = String(req.params.id || '').trim();
    const result = await storage.updateFestivalConfig(festivalId, req.body || {});
    if (!result.success) {
      res.status(400).json({ error: result.error || 'Failed to update festival configuration.' });
      return;
    }
    broadcastFestivalUpdate();
    res.json({
      success: true,
      festival: result.festival,
      state: result.state,
      message: `${result.festival?.name || 'Festival'} configuration saved.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save festival configuration.';
    res.status(500).json({ error: msg });
  }
});

// Admin: Reset a festival's customization and custom assets to default
app.post('/api/admin/festivals/:id/reset', authenticate, requireAdminPermission('festivals', 'edit'), async (req, res) => {
  try {
    const festivalId = String(req.params.id || '').trim();
    const result = await storage.resetFestivalConfig(festivalId);
    if (!result.success) {
      res.status(400).json({ error: result.error || 'Failed to reset festival configuration.' });
      return;
    }
    broadcastFestivalUpdate();
    res.json({
      success: true,
      festival: result.festival,
      state: result.state,
      message: `${result.festival?.name || 'Festival'} reset to default artwork & settings.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reset festival configuration.';
    res.status(500).json({ error: msg });
  }
});

// ----------------------------------------------------
// 13. Smart Notification Center APIs
// ----------------------------------------------------
app.get('/api/notifications', authenticate, (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = req.user!;
  const notifications = storage.getStudentNotifications(user.id);
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  res.json({ notifications, unread_count: unreadCount });
});

app.post('/api/notifications/read', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const notificationId = typeof req.body?.notification_id === 'string' ? req.body.notification_id.trim() : undefined;
  storage.markNotificationRead(user.id, notificationId);
  res.json({ success: true });
});

app.delete('/api/notifications/clear-read', authenticate, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  storage.clearReadNotifications(user.id);
  res.json({ success: true });
});

// ----------------------------------------------------
// 14. Public / Authenticated VIP Feature Status & VIP Student Hub (14 Features)
// ----------------------------------------------------
app.get('/api/vip/features-status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(storage.getVipFeatureManagementState());
});

// Helper to verify active VIP (including grace period) or Admin for VIP Student Hub endpoints
function verifyVipStudentAccess(req: AuthenticatedRequest, res: express.Response, requiredFeatureKey?: any): boolean {
  const user = req.user;
  if (!user || user.is_blocked) {
    res.status(403).json({ error: 'Account access restricted.' });
    return false;
  }
  const isPrivileged = user.role === 'admin' || user.role === 'super_admin';
  const settings = storage.getSettings();
  const graceMs = Math.max(0, Number(settings.vip_grace_period_hours ?? 24) || 24) * 60 * 60 * 1000;
  const hasVip =
    isPrivileged ||
    Boolean(user.vip_active && user.vip_expires_at && new Date(user.vip_expires_at).getTime() + graceMs > Date.now());

  if (!hasVip) {
    res.status(403).json({
      code: 'VIP_REQUIRED',
      error: 'Active VIP membership is required to access VIP student features.',
    });
    return false;
  }

  if (requiredFeatureKey && !storage.isVipFeatureEffectivelyAvailable(requiredFeatureKey)) {
    res.status(403).json({
      code: 'VIP_FEATURE_DISABLED',
      feature_key: requiredFeatureKey,
      error: 'This VIP feature is temporarily disabled by the administrator.',
    });
    return false;
  }

  if (requiredFeatureKey) {
    storage.recordVipFeatureUsage(requiredFeatureKey);
  }

  return true;
}

app.get('/api/vip/student/hub', authenticate, (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = req.user!;
  const latestUser = storage.getUserById(user.id) || user;
  const publicUser = toPublicUser(latestUser, extractRequestDeviceId(req));
  const isPrivileged = latestUser.role === 'admin' || latestUser.role === 'super_admin';

  // Part C Security: Non-VIP users who have never held VIP membership cannot fetch private VIP dashboard data
  const isActiveVip = Boolean(isPrivileged || publicUser.vip_active);
  const isExpiredVip = Boolean(!isActiveVip && latestUser.vip_expires_at && new Date(latestUser.vip_expires_at).getTime() <= Date.now());

  if (!isActiveVip && !isExpiredVip) {
    res.status(403).json({
      code: 'VIP_REQUIRED',
      membership_status: 'non_vip',
      error: 'Active VIP membership is required to access the VIP Dashboard.',
    });
    return;
  }

  const featureState = storage.getVipFeatureManagementState();
  const streak = storage.getStudentStreak(latestUser.id);
  const achievements = storage.getStudentAchievements(latestUser.id);
  const exams = storage.getExamsForStudent(latestUser.id);
  const timetable = storage.getStudentTimetable(latestUser.id);
  // If VIP is expired, redact direct external content_url on exclusive resources until renewed
  const learningLibrary = storage.getLearningResources('learning_library', false).map((r) =>
    isExpiredVip ? { ...r, content_url: '' } : r
  );
  const exclusiveResources = storage.getLearningResources('exclusive_resources', false).map((r) =>
    isExpiredVip ? { ...r, content_url: '' } : r
  );
  const resourceInteractions = storage.getStudentResourceInteractions(latestUser.id);
  const vipAnnouncements = storage.getVipAnnouncements(true);
  const mockTests = storage.getVipMockTests(true);
  const mockAttempts = storage.getStudentMockTestAttempts(latestUser.id);
  const supportTickets = storage.getPrioritySupportTickets(latestUser.id);
  const referrals = storage.getReferralsForUser(latestUser.id);
  const referralCode = storage.ensureUserReferralCode(latestUser.id);
  const referralPermissions = storage.getUserReferralPermissions(latestUser.id);
  const referralSalesSummary = storage.getReferrerSalesSummary(latestUser.id);
  const platforms = storage.getPlatforms(true);
  const myPayments = storage.getPaymentsByUserId(latestUser.id);
  const userPlatformOpens = storage.getPlatformLogsForStudent(latestUser.id);

  res.json({
    feature_state: featureState,
    user: publicUser,
    streak,
    achievements,
    exams,
    timetable,
    learning_library: learningLibrary,
    exclusive_resources: exclusiveResources,
    resource_interactions: resourceInteractions,
    vip_announcements: vipAnnouncements,
    mock_tests: mockTests,
    mock_attempts: mockAttempts,
    support_tickets: supportTickets,
    referrals,
    referral_code: referralCode,
    referral_program_enabled: storage.isReferralProgramEnabled(),
    referral_permissions: referralPermissions,
    referral_sales_summary: referralSalesSummary,
    total_platforms: platforms.length,
    vip_platforms_count: platforms.filter((p) => p.access_type === 'vip').length,
    my_payments: myPayments,
    recent_platform_opens: userPlatformOpens,
  });
});

// Individual Referrer Dashboard Endpoint (Accessible by any user/admin with can_access_referral_dashboard)
app.get('/api/referrals/my-dashboard', authenticate, (req: AuthenticatedRequest, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const user = req.user!;
  const latestUser = storage.getUserById(user.id) || user;
  const perms = storage.getUserReferralPermissions(latestUser.id);
  if (!perms.can_access_referral_dashboard) {
    res.status(403).json({
      code: 'REFERRAL_DASHBOARD_RESTRICTED',
      error: 'Referral Dashboard access is currently disabled for your account.',
    });
    return;
  }
  const summary = storage.getReferrerSalesSummary(latestUser.id);
  const activePlans = storage.getVipPlans(true);
  const samplePlanId = activePlans[0]?.id || '';
  const samplePreview = samplePlanId
    ? storage.calculateReferralDiscountForUser(latestUser.id, samplePlanId)
    : null;

  const myAttribution = {
    is_referred: Boolean(latestUser.referred_by_user_id || samplePreview?.referral_code_attributed),
    referred_by_code: latestUser.referred_by_code || samplePreview?.referral_code_attributed || null,
    referred_at: latestUser.referred_at || null,
    referrer_email: samplePreview?.referrer_email || null,
    discount_eligible: Boolean(samplePreview?.eligible),
    discount_label: samplePreview?.discount_label || null,
    reason: samplePreview?.reason || null,
  };
  const visibleRecords = perms.can_view_own_referral_data ? summary.records : [];
  const enrichedSummary = {
    ...summary,
    records: visibleRecords,
  };

  res.json({
    referral_program_enabled: storage.isReferralProgramEnabled(),
    discount_config: storage.getReferralDiscountConfig(),
    permissions: perms,
    referral_code: summary.referral_code,
    referred_by_code: myAttribution.referred_by_code,
    my_attribution: myAttribution,
    referrals: visibleRecords,
    sales_summary: enrichedSummary,
    summary: enrichedSummary,
  });
});

app.post('/api/vip/student/streak/check-in', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'daily_study_streak')) return;
  const user = req.user!;
  const result = storage.recordStudyActivity(user.id, 'platform_open');
  res.json({
    success: true,
    ...result,
    achievements: storage.getStudentAchievements(user.id),
    message: result.incremented_today
      ? `Daily study streak recorded! Current streak: ${result.streak.current_streak} day(s).`
      : `Today's study activity (${result.streak.last_study_date_ist}) is already recorded! Current streak: ${result.streak.current_streak} day(s).`,
  });
});

app.post('/api/vip/student/exams', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'exam_counter')) return;
  const user = req.user!;
  const { exam_name, title, exam_category, category, subject, exam_date, target_score, notes, reminders_enabled } = req.body || {};
  const finalExamName = String(exam_name || title || '').trim();
  if (!finalExamName || !exam_date) {
    res.status(400).json({ error: 'Exam name and exam date are required.' });
    return;
  }
  const d = new Date(exam_date);
  if (isNaN(d.getTime())) {
    res.status(400).json({ error: 'Please provide a valid exam date.' });
    return;
  }
  const exam = storage.addExamSchedule({
    scope: 'personal',
    user_id: user.id,
    exam_name: finalExamName.slice(0, 140),
    exam_category: String(exam_category || category || 'Personal Exam').trim().slice(0, 80),
    subject: String(subject || 'Core Subjects').trim().slice(0, 120),
    exam_date: d.toISOString(),
    target_score: target_score ? String(target_score).trim().slice(0, 60) : undefined,
    notes: notes ? String(notes).trim().slice(0, 500) : undefined,
    is_published: true,
    reminders_enabled: reminders_enabled !== false,
    created_by: user.email,
  });
  res.status(201).json({ exam, message: 'Personal exam countdown added.' });
});

app.put('/api/vip/student/exams/:id', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'exam_counter')) return;
  const user = req.user!;
  const updated = storage.updateExamSchedule(req.params.id, req.body || {}, user.id, false);
  if (!updated) {
    res.status(404).json({ error: 'Personal exam record not found or cannot be modified.' });
    return;
  }
  res.json({ exam: updated, message: 'Exam updated.' });
});

app.delete('/api/vip/student/exams/:id', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'exam_counter')) return;
  const user = req.user!;
  const ok = storage.deleteExamSchedule(req.params.id, user.id, false);
  if (!ok) {
    res.status(404).json({ error: 'Personal exam record not found or cannot be deleted.' });
    return;
  }
  res.json({ success: true, message: 'Personal exam removed.' });
});

app.post('/api/vip/student/timetable', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'study_timetable')) return;
  const user = req.user!;
  const { day_of_week, start_time, end_time, subject, topic, priority } = req.body || {};
  if (!subject || !start_time || !end_time) {
    res.status(400).json({ error: 'Subject, start time, and end time are required.' });
    return;
  }
  const entry = storage.addTimetableItem(user.id, {
    day_of_week: (day_of_week || 'Monday') as any,
    start_time: String(start_time).trim().slice(0, 20),
    end_time: String(end_time).trim().slice(0, 20),
    subject: String(subject).trim().slice(0, 100),
    topic: String(topic || '').trim().slice(0, 200),
    priority: (priority === 'High' || priority === 'Low' ? priority : 'Medium') as any,
  });
  res.status(201).json({ entry, message: 'Study timetable slot added.' });
});

app.put('/api/vip/student/timetable/:id', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'study_timetable')) return;
  const user = req.user!;
  const updated = storage.updateTimetableItem(user.id, req.params.id, req.body || {});
  if (!updated) {
    res.status(404).json({ error: 'Timetable entry not found.' });
    return;
  }
  res.json({ entry: updated, message: 'Timetable updated.' });
});

app.delete('/api/vip/student/timetable/:id', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'study_timetable')) return;
  const user = req.user!;
  const ok = storage.deleteTimetableItem(user.id, req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Timetable entry not found.' });
    return;
  }
  res.json({ success: true, message: 'Timetable slot deleted.' });
});

app.post('/api/vip/student/resources/:id/interact', authenticate, (req: AuthenticatedRequest, res) => {
  const resource = storage.getLearningResources(undefined, true).find((r) => r.id === req.params.id);
  const featureKey = resource?.resource_group === 'exclusive_resources' ? 'exclusive_resources' : 'learning_library';
  if (!verifyVipStudentAccess(req, res, featureKey)) return;
  const user = req.user!;
  const { is_bookmarked, is_completed } = req.body || {};
  const interaction = storage.toggleStudentResourceInteraction(user.id, req.params.id, {
    is_bookmarked,
    is_completed,
  });
  res.json({
    interaction,
    achievements: storage.getStudentAchievements(user.id),
  });
});

app.post('/api/vip/student/mock-tests/:id/submit', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'vip_mock_tests')) return;
  const user = req.user!;
  const { selected_answers, time_taken_seconds } = req.body || {};
  try {
    const result = storage.submitMockTestAttempt(
      user,
      req.params.id,
      Array.isArray(selected_answers) ? selected_answers : [],
      Number(time_taken_seconds) || 0
    );
    res.status(201).json({
      attempt: result.attempt,
      test: result.test,
      achievements: storage.getStudentAchievements(user.id),
      message: `Mock test submitted! Score: ${result.attempt.score}/${result.attempt.total_questions} (${result.attempt.percentage}%).`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to submit mock test.';
    res.status(400).json({ error: msg });
  }
});

app.post('/api/vip/student/support-tickets', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'priority_support')) return;
  const user = req.user!;
  const { subject, category, message } = req.body || {};
  if (!subject || !message || String(message).trim().length < 3) {
    res.status(400).json({ error: 'Subject and a detailed message are required.' });
    return;
  }
  const ticket = storage.createPrioritySupportTicket(user, {
    subject: String(subject).trim().slice(0, 150),
    category: (category || 'General VIP Help') as any,
    message: String(message).trim().slice(0, 2000),
  });
  res.status(201).json({ ticket, message: `Priority VIP Support ticket (${ticket.ticket_code}) created.` });
});

app.post('/api/vip/student/support-tickets/:id/reply', authenticate, (req: AuthenticatedRequest, res) => {
  if (!verifyVipStudentAccess(req, res, 'priority_support')) return;
  const user = req.user!;
  const { message } = req.body || {};
  if (!message || !String(message).trim()) {
    res.status(400).json({ error: 'Reply message is required.' });
    return;
  }
  const updated = storage.replyToPrioritySupportTicket(req.params.id, user, String(message).trim());
  if (!updated) {
    res.status(404).json({ error: 'Support ticket not found.' });
    return;
  }
  res.json({ ticket: updated, message: 'Reply sent.' });
});

const handleApplyReferralCode = (req: AuthenticatedRequest, res: express.Response) => {
  const user = req.user!;
  const latestUser = storage.getUserById(user.id) || user;
  const code = String(req.body?.referral_code || '').trim();
  if (!code) {
    res.status(400).json({ error: 'Please enter a valid referral code.' });
    return;
  }
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const deviceId = extractRequestDeviceId(req);
  const result = storage.applyReferralCode(latestUser, code, clientIp, deviceId, {
    allowAttributionWhenProgramOff: true,
  });
  if (!result.success) {
    res.status(400).json({
      code: result.code || 'REFERRAL_ERROR',
      error: result.error || 'Could not apply referral code.',
    });
    return;
  }
  const activePlans = storage.getVipPlans(true);
  const samplePreview = activePlans[0]
    ? storage.calculateReferralDiscountForUser(latestUser.id, activePlans[0].id)
    : null;

  res.json({
    success: true,
    referral: result.referral,
    user: toPublicUser(latestUser, deviceId),
    discount_preview: samplePreview,
    message: samplePreview?.eligible
      ? `Referral code (${result.referral?.referral_code}) linked! Your referral discount (${samplePreview.discount_label}) will automatically apply when you purchase an eligible VIP plan.`
      : 'Referral code linked! When your VIP membership is verified, your referrer will receive their bonus VIP days.',
  });
};

app.post('/api/vip/student/referrals/apply', authenticate, handleApplyReferralCode);
app.post('/api/referrals/apply', authenticate, handleApplyReferralCode);

// ----------------------------------------------------
// 15. Super Admin: ADMIN CONTROL (Section & Action Permissions + Role Management)
// ----------------------------------------------------
app.get('/api/admin/control/permissions', authenticate, requireSuperAdmin, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const users = storage.getUsers();
  const admins = users
    .filter((u) => u.role === 'admin' || u.role === 'super_admin')
    .map((u) => ({
      ...toPublicUser(u),
      permissions: storage.getAdminPermissionsForUser(u.id),
    }));
  const allUsers = users.map((u) => toPublicUser(u));
  const history = storage.getAdminAuditLogs({ section: 'admin_control' });
  res.json({
    registry: ADMIN_SECTIONS_REGISTRY,
    admins,
    users: allUsers,
    history,
  });
});

app.put('/api/admin/control/permissions/:userId', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const { userId } = req.params;
  const { sections } = req.body || {};
  const target = storage.getUserById(userId);
  if (!target) {
    res.status(404).json({ error: 'Administrator account not found.' });
    return;
  }
  if (target.role === 'super_admin') {
    res.status(400).json({ error: 'Super Admin accounts always retain full access to all sections.' });
    return;
  }
  if (!sections || typeof sections !== 'object') {
    res.status(400).json({ error: 'Valid section permissions map is required.' });
    return;
  }
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const updatedProfile = await storage.updateAdminPermissionsForUser(target.id, sections, caller, clientIp);
  res.json({
    success: true,
    permissions: updatedProfile,
    history: storage.getAdminAuditLogs({ section: 'admin_control' }),
    message: `Permissions updated for ${target.email}.`,
  });
});

app.post('/api/admin/control/permissions/:userId/reset', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const { userId } = req.params;
  const target = storage.getUserById(userId);
  if (!target) {
    res.status(404).json({ error: 'Administrator account not found.' });
    return;
  }
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const resetProfile = await storage.resetNormalAdminDefaultPermissions(target.id, caller, clientIp);
  res.json({
    success: true,
    permissions: resetProfile,
    history: storage.getAdminAuditLogs({ section: 'admin_control' }),
    message: `Permissions for ${target.email} reset to Normal Admin default (5 allowed sections).`,
  });
});

app.post('/api/admin/control/role/:userId', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const { userId } = req.params;
  const { role, reason } = req.body || {};
  if (role !== 'admin' && role !== 'user') {
    res.status(400).json({ error: 'Target role must be "admin" or "user".' });
    return;
  }
  const target = storage.getUserById(userId);
  if (!target) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }
  if (target.email.toLowerCase() === PRIMARY_SUPER_ADMIN_EMAIL || target.role === 'super_admin') {
    res.status(403).json({ error: 'Super Admin role is protected and cannot be modified.' });
    return;
  }
  const prevRole = target.role;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';

  const updated = await storage.updateUser(target.id, {
    role,
    ...(role === 'admin' ? { vip_active: true } : {}),
  });

  if (role === 'admin' && prevRole !== 'admin') {
    await storage.resetNormalAdminDefaultPermissions(target.id, caller, clientIp);
  }

  storage.recordAdminAuditLog({
    admin_id: caller.id,
    admin_email: caller.email,
    admin_role: caller.role,
    section: 'admin_control',
    action_type: 'role_change',
    target_id: target.email,
    description:
      role === 'admin'
        ? `Promoted ${target.email} to Normal Admin with 5 default allowed sections`
        : `Revoked Admin access for ${target.email} (restored to user role)`,
    previous_value: { role: prevRole },
    new_value: { role, reason: reason || null },
    ip_address: clientIp,
  });

  revokeUserSessions(target.id);

  res.json({
    success: true,
    user: toPublicUser(updated!),
    permissions: storage.getAdminPermissionsForUser(target.id),
    message:
      role === 'admin'
        ? `${target.email} promoted to Normal Admin with default 5-section access.`
        : `Admin access revoked for ${target.email} (restored to standard user role).`,
  });
});

// ----------------------------------------------------
// 16. Super Admin: VIP FEATURE MANAGEMENT (Global Master Switch + 14 Individual Switches + Content CRUD)
// ----------------------------------------------------
app.get('/api/admin/vip-features', authenticate, requireSuperAdmin, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    definitions: VIP_FEATURES_DEFINITIONS,
    state: storage.getVipFeatureManagementState(),
    global_exams: storage.getAllAdminGlobalExams(),
    resources: storage.getLearningResources(undefined, true),
    vip_announcements: storage.getVipAnnouncements(false),
    mock_tests: storage.getVipMockTests(false),
    support_tickets: storage.getPrioritySupportTickets(),
    referrals: storage.getAllReferrals(),
  });
});

app.post('/api/admin/vip-features/master-switch', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const enabled = Boolean(req.body?.enabled);
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const state = await storage.setVipGlobalMasterSwitch(enabled, caller, clientIp);
  broadcastVipFeaturesUpdate();
  res.json({
    success: true,
    state,
    message: enabled
      ? 'Global VIP Master Switch turned ON. Individual VIP feature switches are now active.'
      : 'Global VIP Master Switch turned OFF. All 14 VIP student features are temporarily disabled without losing any data.',
  });
});

app.post('/api/admin/vip-features/:featureKey/toggle', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const featureKey = String(req.params.featureKey || '').trim() as any;
  const enabled = Boolean(req.body?.enabled);
  const validDef = VIP_FEATURES_DEFINITIONS.find((f) => f.feature_key === featureKey);
  if (!validDef) {
    res.status(400).json({ error: `Unknown VIP feature key: ${featureKey}` });
    return;
  }
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const state = await storage.setIndividualVipFeatureSwitch(featureKey, enabled, caller, clientIp);
  broadcastVipFeaturesUpdate();
  res.json({
    success: true,
    state,
    message: `${validDef.name} switched ${enabled ? 'ON' : 'OFF'}.`,
  });
});

// Super Admin: Reorder VIP Dashboard Features (Move Up / Move Down / Save Order)
app.post('/api/admin/vip-features/reorder', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const orderedKeys = Array.isArray(req.body?.ordered_keys) ? req.body.ordered_keys : [];
  if (orderedKeys.length === 0) {
    res.status(400).json({ error: 'ordered_keys array is required.' });
    return;
  }
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const state = await storage.reorderVipFeatures(orderedKeys, caller, clientIp);
  broadcastVipFeaturesUpdate();
  res.json({
    success: true,
    state,
    message: 'VIP Dashboard feature order saved and updated for all VIP students.',
  });
});

// Super Admin: Reset VIP Dashboard Feature Order to Default (1–14) while preserving ON/OFF availability
app.post('/api/admin/vip-features/reset-order', authenticate, requireSuperAdmin, async (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const state = await storage.resetVipFeaturesOrder(caller, clientIp);
  broadcastVipFeaturesUpdate();
  res.json({
    success: true,
    state,
    message: 'VIP Dashboard feature order reset to default (1–14).',
  });
});

// ----------------------------------------------------
// 16b. Super Admin: REFERRAL PROGRAM MANAGEMENT & SALES REPORTS (Parts E, F, G, H, I)
// ----------------------------------------------------
function requireReferralManagementAccess(action: 'view' | 'manage_settings' | 'manage_permissions') {
  return (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const caller = req.user;
    if (!caller) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (caller.role === 'super_admin') {
      next();
      return;
    }
    const refPerms = storage.getUserReferralPermissions(caller.id);
    const hasAdminSection =
      caller.role === 'admin' && storage.hasAdminPermission(caller.id, 'referral_management', action === 'view' ? 'view' : 'edit');

    if (action === 'manage_permissions') {
      res.status(403).json({ error: 'Super Admin privileges required to modify referral permissions.' });
      return;
    }
    if (action === 'manage_settings' && (refPerms.can_manage_referral_settings || hasAdminSection)) {
      next();
      return;
    }
    if (action === 'view' && (refPerms.can_access_referral_management || refPerms.can_view_referral_reports || hasAdminSection)) {
      next();
      return;
    }
    res.status(403).json({
      code: 'REFERRAL_MANAGEMENT_RESTRICTED',
      error: 'Access Restricted: You do not have permission to access Referral Program Management.',
    });
  };
}

app.get('/api/admin/referrals/management', authenticate, requireReferralManagementAccess('view'), (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(storage.getAdminReferralManagementData());
});

app.post('/api/admin/referrals/global-switch', authenticate, requireReferralManagementAccess('manage_settings'), async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.user!;
    const enabled = Boolean(req.body?.enabled);
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    storage.setReferralProgramGlobalSwitch(enabled, caller, clientIp);
    await storage.syncSettingsToSupabase();
    broadcastSettingsUpdate();
    res.json({
      success: true,
      referral_program_enabled: storage.isReferralProgramEnabled(),
      data: storage.getAdminReferralManagementData(),
      message: enabled
        ? 'Global Referral Program turned ON. Referral code entry on Login/Registration and referral rewards are now active.'
        : 'Global Referral Program turned OFF. Public referral code entry and new referral rewards are disabled while preserving all historical data.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save referral program switch in database.';
    res.status(500).json({ error: msg });
  }
});

app.put('/api/admin/referrals/permissions/:userId', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const { userId } = req.params;
  const target = storage.getUserById(userId);
  if (!target) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const permissions = storage.updateUserReferralPermissions(target.id, req.body || {}, caller, clientIp);
  res.json({
    success: true,
    permissions,
    data: storage.getAdminReferralManagementData(),
    message: `Referral permissions updated for ${target.email}.`,
  });
});

app.put('/api/admin/referrals/discount-config', authenticate, requireReferralManagementAccess('manage_settings'), async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.user!;
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const config = storage.updateReferralDiscountConfig(req.body || {}, caller, clientIp);
    await storage.syncSettingsToSupabase();
    broadcastSettingsUpdate();
    res.json({
      success: true,
      discount_config: config,
      data: storage.getAdminReferralManagementData(),
      message: 'Referral discount configuration saved and applied to backend price calculations.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to save referral discount configuration in database.';
    res.status(500).json({ error: msg });
  }
});

// Part K: Super Admin Confirmed Test Account Cleanup Endpoint (Creates SHA-256 Backup First)
app.post('/api/admin/users/cleanup-confirmed-test-accounts', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const result = storage.purgeConfirmedTestAccounts(caller);
  res.json({
    success: true,
    ...result,
    message:
      result.removed_users_count > 0
        ? `Backed up database (${result.backup_id}) and removed ${result.removed_users_count} confirmed test/example accounts.`
        : `Verified database (${result.backup_id}): 0 confirmed test/example accounts remain (${result.remaining_users_count} genuine/preserved accounts intact).`,
  });
});

// Admin CRUD for Global Exams, Learning Resources, VIP Announcements, Mock Tests, Priority Support
app.post('/api/admin/vip-features/exams', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const { exam_name, title, exam_category, category, subject, exam_date, target_score, notes, is_published } = req.body || {};
  const finalExamName = String(exam_name || title || '').trim();
  if (!finalExamName || !exam_date) {
    res.status(400).json({ error: 'Exam name and exam date are required.' });
    return;
  }
  const exam = storage.addExamSchedule({
    scope: 'global',
    user_id: null,
    exam_name: finalExamName,
    exam_category: String(exam_category || category || 'Common Competitive Exam').trim(),
    subject: String(subject || 'All Subjects').trim(),
    exam_date: new Date(exam_date).toISOString(),
    target_score: target_score ? String(target_score).trim() : undefined,
    notes: notes ? String(notes).trim() : '',
    is_published: is_published !== false,
    reminders_enabled: true,
    created_by: caller.email,
  });
  res.status(201).json({ exam, message: 'Common exam published for VIP students.' });
});

app.delete('/api/admin/vip-features/exams/:id', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const ok = storage.deleteExamSchedule(req.params.id, req.user!.id, true);
  if (!ok) {
    res.status(404).json({ error: 'Exam record not found.' });
    return;
  }
  res.json({ success: true, message: 'Common exam deleted.' });
});

app.post('/api/admin/vip-features/resources', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const { title, category, subject, exam_type, description, content_url, external_url, badge_text, resource_group, is_published } = req.body || {};
  if (!title || !description) {
    res.status(400).json({ error: 'Title and description are required.' });
    return;
  }
  const resource = storage.addLearningResource(
    {
      title: String(title).trim(),
      category: (category || 'Study Notes') as any,
      subject: String(subject || 'All Subjects').trim(),
      exam_type: String(exam_type || 'All Exams').trim(),
      description: String(description).trim(),
      content_url: String(content_url || external_url || 'https://ncert.nic.in/textbook.php').trim(),
      badge_text: badge_text ? String(badge_text).trim() : undefined,
      resource_group: resource_group === 'exclusive_resources' ? 'exclusive_resources' : 'learning_library',
      is_published: is_published !== false,
      created_by: caller.email,
    },
    caller
  );
  res.status(201).json({ resource, message: 'VIP learning resource added.' });
});

app.delete('/api/admin/vip-features/resources/:id', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const ok = storage.deleteLearningResource(req.params.id, req.user!);
  if (!ok) {
    res.status(404).json({ error: 'Resource not found.' });
    return;
  }
  res.json({ success: true, message: 'Resource deleted.' });
});

app.post('/api/admin/vip-features/announcements', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const { title, content, category, action_url, link_url, is_pinned, is_published } = req.body || {};
  if (!title || !content) {
    res.status(400).json({ error: 'Title and content are required.' });
    return;
  }
  const item = storage.addVipAnnouncement(
    {
      title: String(title).trim(),
      content: String(content).trim(),
      category: (category || 'Important Notice') as any,
      action_url: action_url || link_url ? String(action_url || link_url).trim() : undefined,
      is_pinned: Boolean(is_pinned),
      is_published: is_published !== false,
      created_by: caller.email,
    },
    caller
  );
  res.status(201).json({ announcement: item, message: 'VIP announcement published.' });
});

app.delete('/api/admin/vip-features/announcements/:id', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const ok = storage.deleteVipAnnouncement(req.params.id, req.user!);
  if (!ok) {
    res.status(404).json({ error: 'VIP announcement not found.' });
    return;
  }
  res.json({ success: true, message: 'VIP announcement deleted.' });
});

app.post('/api/admin/vip-features/support-tickets/:id/reply', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const { message, status } = req.body || {};
  if (!message || !String(message).trim()) {
    res.status(400).json({ error: 'Reply message is required.' });
    return;
  }
  const updated = storage.replyToPrioritySupportTicket(req.params.id, caller, String(message).trim(), status);
  if (!updated) {
    res.status(404).json({ error: 'Support ticket not found.' });
    return;
  }
  res.json({ ticket: updated, message: 'Admin reply sent to VIP student.' });
});

// ----------------------------------------------------
// 17. Advanced Admin Analytics, Complete Admin Audit Log & Data Backup/Recovery
// ----------------------------------------------------
app.get('/api/admin/analytics/advanced', authenticate, requireAdminPermission('advanced_analytics', 'view'), (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(storage.getAdvancedAdminAnalytics());
});

app.get('/api/admin/audit-logs', authenticate, requireAdminPermission('audit_logs', 'view'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const section = typeof req.query.section === 'string' ? req.query.section.trim() : undefined;
  const admin_email = typeof req.query.actor === 'string' ? req.query.actor.trim() : undefined;
  const action_type = typeof req.query.action === 'string' ? req.query.action.trim() : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
  const logs = storage.getAdminAuditLogs({ section, admin_email, action_type, status, search });
  res.json({ logs });
});

app.get('/api/admin/backups', authenticate, requireAdminPermission('backup_recovery', 'view'), (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ backups: storage.listDatabaseBackups() });
});

app.post('/api/admin/backups/create', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim() : `Manual Safe Snapshot (${new Date().toLocaleDateString()})`;
  const snapshot = storage.createDatabaseBackupSnapshot(caller, label);
  res.status(201).json({
    success: true,
    snapshot,
    backups: storage.listDatabaseBackups(),
    message: `Backup snapshot "${snapshot.label}" created and verified (SHA-256: ${snapshot.sha256_checksum.slice(0, 12)}...).`,
  });
});

app.get('/api/admin/backups/:id/download', authenticate, requireSuperAdmin, (req, res) => {
  const envelope = storage.getBackupEnvelopeById(req.params.id);
  if (!envelope) {
    res.status(404).json({ error: 'Backup snapshot file not found.' });
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="study-fox-backup-${req.params.id}.json"`);
  res.send(JSON.stringify(envelope, null, 2));
});

app.post('/api/admin/backups/restore', authenticate, requireSuperAdmin, (req: AuthenticatedRequest, res) => {
  const caller = req.user!;
  const { backup_id, snapshot_id, envelope: bodyEnvelope } = req.body || {};
  const targetId = String(backup_id || snapshot_id || '').trim();
  const envelope = bodyEnvelope && typeof bodyEnvelope === 'object' ? bodyEnvelope : storage.getBackupEnvelopeById(targetId);
  if (!envelope) {
    res.status(404).json({ error: 'Backup snapshot not found.' });
    return;
  }
  const result = storage.restoreFromBackupEnvelope(envelope, caller);
  if (!result.success) {
    res.status(400).json({ error: result.error || 'Backup restoration failed.' });
    return;
  }
  res.json({
    success: true,
    restored_summary: result.restored_summary,
    message: 'Safe non-destructive backup restoration completed and verified.',
  });
});

// ----------------------------------------------------
// Server bootstrap with Vite
// ----------------------------------------------------

// Prevent unhandled rejections or transient socket errors from killing the server process
process.on('uncaughtException', (err) => {
  console.error('[SERVER UNCAUGHT EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER UNHANDLED REJECTION]', reason);
});

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  // Validate production security environment
  try {
    validateProductionAuthEnv();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SECURITY STARTUP FAILURE] ${msg}`);
    if (isProduction) {
      process.exit(1);
    }
  }

  // Supabase environment check (reports status safely without revealing secrets)
  const hasSbUrl = Boolean(process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project'));
  const hasSbKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Fallback handler for client-side routing in dev
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      if (
        url.startsWith('/api') ||
        url.startsWith('/uploads') ||
        url.startsWith('/manifest.json') ||
        url.startsWith('/sw.js') ||
        url.startsWith('/favicon.ico') ||
        url.startsWith('/logo.png') ||
        url.startsWith('/icon') ||
        url.startsWith('/apple-touch-icon')
      ) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    // Gzip static JS/CSS/SVG/HTML files in production if client supports gzip
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      const acceptEncoding = String(req.headers['accept-encoding'] || '');
      if (!acceptEncoding.includes('gzip')) return next();
      if (!/\.(js|css|svg|json|txt|map)$/i.test(req.path)) return next();

      const safeRelPath = req.path.replace(/^\/+/, '');
      const fullAssetPath = path.resolve(distPath, safeRelPath);
      if (!fullAssetPath.startsWith(distPath) || !fs.existsSync(fullAssetPath)) return next();

      try {
        const stat = fs.statSync(fullAssetPath);
        if (!stat.isFile()) return next();
        const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
        res.setHeader('ETag', etag);
        if (req.headers['if-none-match'] === etag) {
          res.status(304).end();
          return;
        }
        const ext = path.extname(fullAssetPath).toLowerCase();
        const mimeMap: Record<string, string> = {
          '.js': 'application/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.txt': 'text/plain; charset=utf-8',
          '.map': 'application/json; charset=utf-8',
        };
        res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
        if (req.path.startsWith('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        const rawBuf = fs.readFileSync(fullAssetPath);
        const gzBuf = zlib.gzipSync(rawBuf, { level: 6 });
        res.setHeader('Content-Length', String(gzBuf.length));
        res.end(gzBuf);
        return;
      } catch {
        return next();
      }
    });

    app.use(
      express.static(distPath, {
        etag: true,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=604800');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind to PORT after routes & Vite middleware are mounted so pre-warming requests succeed immediately
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`  VITE v8.3.0 ready in 150 ms`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
    console.log(`Education Platform full-stack server running on http://0.0.0.0:${PORT}`);

    if (hasSbUrl && hasSbKey) {
      console.log('[CONFIG] Supabase integration: CONFIGURED (Using SERVICE_ROLE_KEY)');
      storage.rehydrateFromSupabase(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).catch((err) => {
        console.warn('[CONFIG] Rehydration warning:', err);
      });
    } else {
      console.log('[CONFIG] Supabase integration: NOT FULLY CONFIGURED (Running in robust standalone storage mode)');
    }

    // Automatic Keep-Alive Self-Pinger for Render Free Tier (every 8 minutes, before Render's 15-min idle sleep)
    if (isProduction) {
      const externalBaseUrl = (
        process.env.RENDER_EXTERNAL_URL ||
        process.env.APP_URL ||
        'https://study-fox.onrender.com'
      ).replace(/\/+$/, '');
      const healthPingUrl = `${externalBaseUrl}/api/health`;
      const KEEP_ALIVE_INTERVAL_MS = 8 * 60 * 1000; // 8 minutes

      const triggerKeepAlive = async () => {
        try {
          await fetch(healthPingUrl, {
            method: 'GET',
            headers: { 'User-Agent': 'StudyFox-KeepAlive/1.0', 'Cache-Control': 'no-cache' },
          });
        } catch {
          // Ignore transient keep-alive ping errors
        }
      };

      setInterval(triggerKeepAlive, KEEP_ALIVE_INTERVAL_MS);
      console.log(`[KEEP-ALIVE] Active self-ping scheduled every 8 minutes -> ${healthPingUrl}`);
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});

