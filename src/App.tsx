/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  TabType,
  UserProfile,
  Platform,
  VipBatch,
  VipPlan,
  PublicSettings,
  Announcement,
  PopupFrequency,
  ActiveFestivalResponse,
} from './types.ts';
import { CheckCircle2 } from 'lucide-react';
import { api, getStoredToken, removeStoredToken } from './api.ts';
import { getThemePresetDefinition } from './constants/themes.ts';
import { TopHeader } from './components/TopHeader.tsx';
import { BottomNav } from './components/BottomNav.tsx';
import { HomeSection } from './components/HomeSection.tsx';
import { VipSection } from './components/VipSection.tsx';
import { ProfileSection } from './components/ProfileSection.tsx';
import { KeyGenerationModal } from './components/KeyGenerationModal.tsx';
import { TelegramModal } from './components/TelegramModal.tsx';
import { CustomPopupModal } from './components/CustomPopupModal.tsx';
import { MaintenanceScreen } from './components/MaintenanceScreen.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { StudentLoginPage } from './components/StudentLoginPage.tsx';

const AdminPanel = React.lazy(() =>
  import('./components/admin/AdminPanel.tsx').then((m) => ({ default: m.AdminPanel }))
);
const AdminLoginPage = React.lazy(() =>
  import('./components/admin/AdminLoginPage.tsx').then((m) => ({ default: m.AdminLoginPage }))
);
const FestivalOverlayEngine = React.lazy(() =>
  import('./components/FestivalOverlayEngine.tsx').then((m) => ({ default: m.FestivalOverlayEngine }))
);
const VipStudentHub = React.lazy(() =>
  import('./components/VipStudentHub.tsx').then((m) => ({ default: m.VipStudentHub }))
);

function shouldShowPopupByFrequency(
  prefix: string,
  frequency: PopupFrequency | undefined,
  userId?: string
): boolean {
  const freq: PopupFrequency = frequency || 'once_per_session';
  if (freq === 'every_visit') {
    return true;
  }
  if (freq === 'once_per_session') {
    return !sessionStorage.getItem(`${prefix}_session`);
  }
  if (freq === 'once_per_day') {
    const today = new Date().toISOString().slice(0, 10);
    return localStorage.getItem(`${prefix}_day`) !== today;
  }
  if (freq === 'once_per_user') {
    const key = userId ? `${prefix}_user_${userId}` : `${prefix}_user_guest`;
    return !localStorage.getItem(key);
  }
  return !sessionStorage.getItem(`${prefix}_session`);
}

function recordPopupDismissed(
  prefix: string,
  frequency: PopupFrequency | undefined,
  userId?: string
): void {
  const freq: PopupFrequency = frequency || 'once_per_session';
  sessionStorage.setItem(`${prefix}_session`, 'true');
  if (freq === 'once_per_day') {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`${prefix}_day`, today);
  } else if (freq === 'once_per_user') {
    const key = userId ? `${prefix}_user_${userId}` : `${prefix}_user_guest`;
    localStorage.setItem(key, 'true');
  }
}

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname);
  const [currentTab, setCurrentTab] = useState<TabType>(() => {
    const p = window.location.pathname.toLowerCase();
    const q = new URLSearchParams(window.location.search).get('tab')?.toLowerCase();
    if (p === '/vip-dashboard' || q === 'vip_dashboard' || q === 'vip-dashboard') return 'vip_dashboard';
    if (p === '/vip' || p.startsWith('/vip/') || q === 'vip') return 'vip';
    if (p === '/profile' || q === 'profile') return 'profile';
    return 'home';
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [batches, setBatches] = useState<VipBatch[]>([]);
  const [plans, setPlans] = useState<VipPlan[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [activeFestivalState, setActiveFestivalState] = useState<ActiveFestivalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState<boolean>(() => Boolean(getStoredToken()));
  const [colorMode, setColorMode] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('sb_color_mode');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  const toggleColorMode = useCallback(() => {
    setColorMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('sb_color_mode', next);
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);
  const serverTimeOffsetRef = useRef<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());

  const syncServerTime = useCallback((userObj?: UserProfile | null): number => {
    if (userObj?.server_time) {
      const parsedServerMs = new Date(userObj.server_time).getTime();
      if (Number.isFinite(parsedServerMs)) {
        serverTimeOffsetRef.current = parsedServerMs - Date.now();
      }
    }
    const currentServerNow = Date.now() + serverTimeOffsetRef.current;
    setNow(currentServerNow);
    return currentServerNow;
  }, []);

  // Modals & States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showKeyGenModal, setShowKeyGenModal] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [showCustomPopupModal, setShowCustomPopupModal] = useState(false);
  const [vipIntent, setVipIntent] = useState<{
    mode: 'single_platform' | 'all_platforms';
    platformId?: string | null;
    nonce: number;
  } | null>(null);

  const prevAccessStateRef = useRef<{ userId: string; valid: boolean; tab: TabType } | null>(null);
  const isInitialTabMount = useRef(true);

  // Detect Key Shortener destination/verification callback route
  const isKeyVerifyRoute =
    currentPath === '/key-verify' ||
    currentPath.startsWith('/key-verify') ||
    (typeof window !== 'undefined' && window.location.search.includes('verify_key'));
  const [keyVerifiedToast, setKeyVerifiedToast] = useState(false);
  const [isPasswordResetFlow, setIsPasswordResetFlow] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.location.search.includes('reset_token=') ||
      window.location.hash.includes('type=recovery')
    );
  });

  // Priority 1: Check whether user is blocked
  // Priority 2: Check whether VIP membership is active AND vip_expires_at > server time
  const isUserVipValid = Boolean(
    user &&
    !user.is_blocked &&
    user.vip_active &&
    (user.role !== 'user' ||
      (user.vip_expires_at && new Date(user.vip_expires_at).getTime() > now))
  );

  // Priority 3: Check whether free access is still valid AND free_access_expires_at > server time
  const isUserFreeAccessValid = Boolean(
    user &&
    !user.is_blocked &&
    user.free_access_expires_at &&
    new Date(user.free_access_expires_at).getTime() > now
  );

  const hasValidStudentAccess = Boolean(
    isUserVipValid ||
    isUserFreeAccessValid ||
    settings?.key_generation_enabled === false
  );

  const effectiveUser: UserProfile | null = useMemo(() => {
    if (!user) return null;
    return {
      ...user,
      vip_active: isUserVipValid,
      free_access_active: isUserFreeAccessValid,
    };
  }, [user, isUserVipValid, isUserFreeAccessValid]);

  // If user lands on /key-verify, normalize URL to / and open Key Page only if neither VIP nor free access is valid
  useEffect(() => {
    if (!authChecking && !loading && isKeyVerifyRoute && user && user.role === 'user') {
      window.history.replaceState({}, '', '/');
      setCurrentPath('/');
      setCurrentTab('home');
      if (!isUserVipValid && !isUserFreeAccessValid && settings?.key_generation_enabled !== false) {
        setShowKeyGenModal(true);
      } else {
        setShowKeyGenModal(false);
      }
    }
  }, [authChecking, loading, isKeyVerifyRoute, user, isUserVipValid, isUserFreeAccessValid, settings?.key_generation_enabled]);

  // Sync client-side route with browser history
  useEffect(() => {
    const handlePopState = () => {
      const nextPath = window.location.pathname;
      setCurrentPath(nextPath);
      const p = nextPath.toLowerCase();
      const q = new URLSearchParams(window.location.search).get('tab')?.toLowerCase();
      if (p === '/vip-dashboard' || q === 'vip_dashboard' || q === 'vip-dashboard') {
        setCurrentTab('vip_dashboard');
      } else if (p === '/vip' || p.startsWith('/vip/') || q === 'vip') {
        setCurrentTab('vip');
      } else if (p === '/profile' || q === 'profile') {
        setCurrentTab('profile');
      } else if (p === '/') {
        setCurrentTab('home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Part J: Lightweight server-synced access expiry watcher (updates every 15s + exact expiry timeout so App & HomeSection never re-render every second)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setNow(Date.now() + serverTimeOffsetRef.current);
    }, 15000);

    let expiryTimeout: ReturnType<typeof setTimeout> | null = null;
    const currentNow = Date.now() + serverTimeOffsetRef.current;
    const candidateExpiries = [
      user?.vip_expires_at ? new Date(user.vip_expires_at).getTime() : 0,
      user?.free_access_expires_at ? new Date(user.free_access_expires_at).getTime() : 0,
    ].filter((ms) => ms > currentNow);

    if (candidateExpiries.length > 0) {
      const nextExpiryMs = Math.min(...candidateExpiries);
      const delayMs = Math.min(2147483647, Math.max(250, nextExpiryMs - currentNow + 150));
      expiryTimeout = setTimeout(() => {
        setNow(Date.now() + serverTimeOffsetRef.current);
      }, delayMs);
    }

    return () => {
      clearInterval(timer);
      if (expiryTimeout) clearTimeout(expiryTimeout);
    };
  }, [user?.vip_expires_at, user?.free_access_expires_at]);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    const p = path.toLowerCase();
    if (p === '/vip-dashboard') {
      setCurrentTab('vip_dashboard');
    } else if (p === '/vip' || p.startsWith('/vip/')) {
      setCurrentTab('vip');
    } else if (p === '/profile') {
      setCurrentTab('profile');
    } else if (p === '/') {
      setCurrentTab('home');
    }
  };

  const handleTabChange = (tab: TabType) => {
    setCurrentTab(tab);
    const nextUrl =
      tab === 'vip_dashboard'
        ? '/vip-dashboard'
        : tab === 'vip'
        ? '/vip'
        : tab === 'profile'
        ? '/profile'
        : '/';
    if (window.location.pathname !== nextUrl) {
      window.history.pushState({}, '', nextUrl);
      setCurrentPath(nextUrl);
    }
  };

  const settingsUpdatedAtRef = useRef<number>(0);

  const applyFreshSettings = useCallback((incoming: PublicSettings | null | undefined) => {
    if (!incoming || typeof incoming !== 'object') return;
    const incomingTs = incoming.updated_at ? new Date(incoming.updated_at).getTime() : 0;
    if (
      Number.isFinite(incomingTs) &&
      incomingTs > 0 &&
      settingsUpdatedAtRef.current > 0 &&
      incomingTs < settingsUpdatedAtRef.current
    ) {
      // Never overwrite newer database settings with stale data
      return;
    }
    if (Number.isFinite(incomingTs) && incomingTs > 0) {
      settingsUpdatedAtRef.current = incomingTs;
    }
    setSettings(incoming);
  }, []);

  // Load all public configuration on initial boot or full manual refresh
  const loadPublicData = useCallback(async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        api.getSettings(),
        api.getPlatforms(),
        api.getVipBatches(),
        api.getVipPlans(),
        api.getAnnouncements(),
        api.getActiveFestival(),
      ]);
      const [sett, plats, bat, plns, anns, fest] = results;
      if (sett.status === 'fulfilled') applyFreshSettings(sett.value);
      if (plats.status === 'fulfilled') setPlatforms(plats.value);
      if (bat.status === 'fulfilled') setBatches(bat.value);
      if (plns.status === 'fulfilled') setPlans(plns.value);
      if (anns.status === 'fulfilled') setAnnouncements(anns.value);
      if (fest.status === 'fulfilled') setActiveFestivalState(fest.value);
    } catch {
      // Gracefully maintain existing state on temporary network failure
    } finally {
      setLoading(false);
    }
  }, [applyFreshSettings]);

  const lastConfigRefreshAtRef = useRef<number>(0);

  // Silent single-source-of-truth config refresh (settings + platforms + batches + plans + announcements + festival)
  const refreshAllPublicConfig = useCallback(
    async (force = false) => {
      const nowTs = Date.now();
      if (!force && nowTs - lastConfigRefreshAtRef.current < 2500) {
        return;
      }
      lastConfigRefreshAtRef.current = nowTs;
      try {
        const results = await Promise.allSettled([
          api.getSettings(),
          api.getPlatforms(),
          api.getVipBatches(),
          api.getVipPlans(),
          api.getAnnouncements(),
          api.getActiveFestival(),
        ]);
        const [sett, plats, bat, plns, anns, fest] = results;
        if (sett.status === 'fulfilled') applyFreshSettings(sett.value);
        if (plats.status === 'fulfilled') setPlatforms(plats.value);
        if (bat.status === 'fulfilled') setBatches(bat.value);
        if (plns.status === 'fulfilled') setPlans(plns.value);
        if (anns.status === 'fulfilled') setAnnouncements(anns.value);
        if (fest.status === 'fulfilled') setActiveFestivalState(fest.value);
      } catch {
        // Safely retain last known valid config on temporary network failures
      }
    },
    [applyFreshSettings]
  );

  // Check existing session and refresh authoritative access state from server
  const checkAuth = useCallback(
    async (isInitial = false) => {
      const token = getStoredToken();
      if (!token) {
        if (isInitial) setAuthChecking(false);
        return;
      }
      if (isInitial) setAuthChecking(true);
      try {
        const profile = await api.getMe();
        syncServerTime(profile);
        if (profile.is_blocked) {
          removeStoredToken();
          setUser(null);
          setShowKeyGenModal(false);
          return;
        }
        setUser(profile);
      } catch {
        removeStoredToken();
        setUser(null);
        setShowKeyGenModal(false);
      } finally {
        if (isInitial) setAuthChecking(false);
      }
    },
    [syncServerTime]
  );

  useEffect(() => {
    loadPublicData();
    checkAuth(true);
  }, [loadPublicData, checkAuth]);

  // Real-time Server-Sent Events (SSE) subscription for instant Admin -> APK synchronization
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/festivals/stream');

      const handleSettingsEvent = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data) as PublicSettings;
          if (parsed && typeof parsed === 'object') {
            applyFreshSettings(parsed);
          }
        } catch {
          void refreshAllPublicConfig(true);
        }
      };

      const handlePlatformsEvent = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (Array.isArray(parsed)) {
            setPlatforms(parsed);
          } else {
            void refreshAllPublicConfig(true);
          }
        } catch {
          void refreshAllPublicConfig(true);
        }
      };

      const handleAnnouncementsEvent = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (Array.isArray(parsed)) {
            setAnnouncements(parsed);
          } else {
            void refreshAllPublicConfig(true);
          }
        } catch {
          void refreshAllPublicConfig(true);
        }
      };

      const handleVipPlansEvent = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (Array.isArray(parsed)) {
            setPlans(parsed);
          } else {
            void refreshAllPublicConfig(true);
          }
        } catch {
          void refreshAllPublicConfig(true);
        }
      };

      const handleVipBatchesEvent = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (Array.isArray(parsed)) {
            setBatches(parsed);
          } else {
            void refreshAllPublicConfig(true);
          }
        } catch {
          void refreshAllPublicConfig(true);
        }
      };

      const handleFestivalEvent = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data) as ActiveFestivalResponse;
          if (parsed && typeof parsed === 'object') {
            setActiveFestivalState(parsed);
          }
        } catch {
          // Ignore malformed event payload
        }
      };

      const handleVipStatusEvent = () => {
        if (getStoredToken()) {
          void checkAuth(false);
        }
        void refreshAllPublicConfig(true);
        window.dispatchEvent(new CustomEvent('sf:vip-status-update'));
      };

      es.addEventListener('settings_update', handleSettingsEvent as EventListener);
      es.addEventListener('platforms_update', handlePlatformsEvent as EventListener);
      es.addEventListener('announcements_update', handleAnnouncementsEvent as EventListener);
      es.addEventListener('vip_plans_update', handleVipPlansEvent as EventListener);
      es.addEventListener('vip_batches_update', handleVipBatchesEvent as EventListener);
      es.addEventListener('festival_update', handleFestivalEvent as EventListener);
      es.addEventListener('vip_status_update', handleVipStatusEvent as EventListener);
      es.addEventListener('vip_features_update', handleVipStatusEvent as EventListener);
    } catch {
      // Fallback resume refresh in handleActiveSync handles environments without SSE
    }
    return () => {
      if (es) {
        es.close();
      }
    };
  }, [applyFreshSettings, checkAuth, refreshAllPublicConfig]);

  // Refresh public config whenever student switches tabs (debounced)
  useEffect(() => {
    if (isInitialTabMount.current) {
      isInitialTabMount.current = false;
      return;
    }
    if (currentPath !== '/admin') {
      void refreshAllPublicConfig(false);
    }
  }, [currentTab, currentPath, refreshAllPublicConfig]);

  // Sync authoritative settings & auth whenever APK/tab resumes, regains focus, or reconnects online
  useEffect(() => {
    let lastResumeSync = 0;

    const handleActiveSync = () => {
      const current = Date.now();
      setNow(current + serverTimeOffsetRef.current);
      if (current - lastResumeSync > 2500) {
        lastResumeSync = current;
        void refreshAllPublicConfig(true);
        if (getStoredToken()) {
          void checkAuth(false);
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleActiveSync();
      }
    };

    window.addEventListener('focus', handleActiveSync);
    window.addEventListener('online', handleActiveSync);
    document.addEventListener('visibilitychange', handleVisibility);

    // Lightweight background safety sync while visible (every 60s)
    const periodicSync = setInterval(() => {
      if (document.visibilityState === 'visible') {
        lastResumeSync = Date.now();
        void refreshAllPublicConfig(false);
        if (getStoredToken()) {
          void checkAuth(false);
        }
      }
    }, 60000);

    return () => {
      window.removeEventListener('focus', handleActiveSync);
      window.removeEventListener('online', handleActiveSync);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(periodicSync);
    };
  }, [checkAuth, refreshAllPublicConfig]);

  // Apply dynamic theme custom properties & document title
  // Applies active Admin-selected theme preset (defaults to restored Old Red Theme) + Dark/Light mode
  useEffect(() => {
    const brandName = (settings?.app_name || 'STUDY BLUNDER').trim() || 'STUDY BLUNDER';
    document.title = currentPath === '/admin' ? `${brandName} | Admin Command` : brandName;

    const activeThemeDef = getThemePresetDefinition(settings?.app_theme_preset);
    const isLight = colorMode === 'light';

    document.documentElement.setAttribute('data-app-theme', activeThemeDef.id);
    document.documentElement.setAttribute('data-theme', colorMode);

    const palette = isLight ? activeThemeDef.lightVars : activeThemeDef.darkVars;

    document.documentElement.style.setProperty('--color-primary', palette.primary);
    document.documentElement.style.setProperty('--color-secondary', palette.secondary);
    document.documentElement.style.setProperty('--color-bg', palette.bg);
    document.documentElement.style.setProperty('--color-text', palette.text);
    document.documentElement.style.setProperty('--color-button', palette.button);

    document.documentElement.style.setProperty('--vip-theme-bg', palette.bg);
    document.documentElement.style.setProperty('--vip-theme-card', palette.card);
    document.documentElement.style.setProperty('--vip-theme-accent', palette.primary);
    document.documentElement.style.setProperty('--vip-theme-text', palette.text);
    document.documentElement.style.setProperty('--vip-theme-button', palette.button);
    document.documentElement.style.setProperty('--vip-theme-border', palette.border);

    document.body.style.backgroundColor = palette.bg;
    document.body.style.color = palette.text;

    let styleEl = document.getElementById('custom-theme-styles') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'custom-theme-styles';
      document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = `
      :root {
        --theme-primary: ${palette.primary};
        --theme-secondary: ${palette.secondary};
        --theme-bg: ${palette.bg};
        --theme-text: ${palette.text};
        --theme-button: ${palette.button};
        --vip-theme-bg: ${palette.bg};
        --vip-theme-card: ${palette.card};
        --vip-theme-accent: ${palette.primary};
        --vip-theme-text: ${palette.text};
        --vip-theme-button: ${palette.button};
        --vip-theme-border: ${palette.border};
      }
      body {
        background-color: ${palette.bg} !important;
        color: ${palette.text} !important;
      }
    `;
  }, [settings, currentPath, colorMode]);

  // Enforce access priority & automatically detect access expiry while the app is open
  // Prevent premature redirects while user profile or settings are still loading
  useEffect(() => {
    if (authChecking || loading) {
      return;
    }

    if (
      !user ||
      user.role !== 'user' ||
      user.is_blocked ||
      !settings ||
      currentPath === '/admin' ||
      settings.maintenance_mode
    ) {
      if (user?.is_blocked && showKeyGenModal) {
        setShowKeyGenModal(false);
      }
      prevAccessStateRef.current = null;
      return;
    }

    const prev = prevAccessStateRef.current;

    if (hasValidStudentAccess) {
      // Active VIP or valid Free Access: keep on Home, never redirect to Key Generation Page
      if (showKeyGenModal) {
        setShowKeyGenModal(false);
      }
    } else {
      // Neither VIP nor Free Access is valid -> redirect to Key Page
      const justExpired = prev !== null && prev.userId === user.id && prev.valid === true;
      const initialLoadOrUserSwitch = prev === null || prev.userId !== user.id;
      const switchedToHomeTab = prev !== null && prev.tab !== 'home' && currentTab === 'home';

      if (justExpired) {
        setCurrentTab('home');
        if (window.location.pathname !== '/') {
          window.history.replaceState({}, '', '/');
          setCurrentPath('/');
        }
        setShowKeyGenModal(true);
        void checkAuth(false);
      } else if (
        (initialLoadOrUserSwitch && currentTab === 'home') ||
        switchedToHomeTab ||
        (currentTab === 'home' && !showKeyGenModal)
      ) {
        setShowKeyGenModal(true);
      }
    }

    prevAccessStateRef.current = {
      userId: user.id,
      valid: hasValidStudentAccess,
      tab: currentTab,
    };
  }, [
    authChecking,
    loading,
    user,
    settings,
    currentPath,
    currentTab,
    hasValidStudentAccess,
    isUserVipValid,
    isUserFreeAccessValid,
    showKeyGenModal,
    checkAuth,
  ]);

  // Check Telegram popup condition with frequency support
  useEffect(() => {
    if (settings?.telegram_popup_enabled && settings?.telegram_channel_url && currentPath !== '/admin') {
      if (shouldShowPopupByFrequency('tg_popup', settings.telegram_popup_frequency, user?.id)) {
        const timer = setTimeout(() => {
          setShowTelegramModal(true);
        }, 1200);
        return () => clearTimeout(timer);
      }
    } else {
      setShowTelegramModal(false);
    }
  }, [
    settings?.telegram_popup_enabled,
    settings?.telegram_channel_url,
    settings?.telegram_popup_frequency,
    currentPath,
    user?.id,
  ]);

  // Check Custom Popup condition with schedule & frequency support
  useEffect(() => {
    if (!settings?.custom_popup_enabled || currentPath === '/admin') {
      setShowCustomPopupModal(false);
      return;
    }

    const nowMs = Date.now();
    if (settings.custom_popup_start_date) {
      const startMs = new Date(settings.custom_popup_start_date).getTime();
      if (!isNaN(startMs) && nowMs < startMs) {
        setShowCustomPopupModal(false);
        return;
      }
    }
    if (settings.custom_popup_end_date) {
      const endMs = new Date(settings.custom_popup_end_date).getTime();
      if (!isNaN(endMs) && nowMs > endMs) {
        setShowCustomPopupModal(false);
        return;
      }
    }

    const hasContent = Boolean(
      (settings.custom_popup_title && settings.custom_popup_title.trim().length > 0) ||
      (settings.custom_popup_message && settings.custom_popup_message.trim().length > 0) ||
      (settings.custom_popup_image_url && settings.custom_popup_image_url.trim().length > 0)
    );

    if (!hasContent) {
      setShowCustomPopupModal(false);
      return;
    }

    if (shouldShowPopupByFrequency('custom_popup', settings.custom_popup_frequency, user?.id)) {
      const timer = setTimeout(() => {
        setShowCustomPopupModal(true);
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [
    settings?.custom_popup_enabled,
    settings?.custom_popup_title,
    settings?.custom_popup_message,
    settings?.custom_popup_image_url,
    settings?.custom_popup_start_date,
    settings?.custom_popup_end_date,
    settings?.custom_popup_frequency,
    currentPath,
    user?.id,
  ]);

  // Handle Login / Registration success with strict 4-step access priority
  const handleAuthSuccess = (authenticatedUser: UserProfile) => {
    const currentServerNow = syncServerTime(authenticatedUser);
    setShowAuthModal(false);

    // 1. Check whether the user is blocked. If blocked, deny access.
    if (authenticatedUser.is_blocked) {
      removeStoredToken();
      setUser(null);
      setShowKeyGenModal(false);
      return;
    }

    setUser(authenticatedUser);

    // If an administrator logs in, open the Admin Dashboard directly at /admin
    if (authenticatedUser.role === 'super_admin' || authenticatedUser.role === 'admin') {
      navigateTo('/admin');
      return;
    }

    // Normalize route to Home ('/')
    if (isKeyVerifyRoute || window.location.pathname !== '/') {
      window.history.replaceState({}, '', '/');
      setCurrentPath('/');
    }
    setCurrentTab('home');

    // 2. Check whether the user's VIP membership is active AND "vip_expires_at" is later than current server time
    const isVip = Boolean(
      authenticatedUser.vip_active &&
      authenticatedUser.vip_expires_at &&
      new Date(authenticatedUser.vip_expires_at).getTime() > currentServerNow
    );

    if (isVip) {
      // Active VIP user: redirect directly to Home, never open Key Page
      setShowKeyGenModal(false);
      prevAccessStateRef.current = {
        userId: authenticatedUser.id,
        valid: true,
        tab: 'home',
      };
      void checkAuth(false);
      return;
    }

    // 3. Otherwise, check whether the user's free access is still valid AND "free_access_expires_at" is later than current server time
    const hasValidFreeAccess = Boolean(
      authenticatedUser.free_access_expires_at &&
      new Date(authenticatedUser.free_access_expires_at).getTime() > currentServerNow
    );

    if (hasValidFreeAccess || settings?.key_generation_enabled === false) {
      // Valid Free Access (or key generation globally disabled): redirect directly to Home
      setShowKeyGenModal(false);
      prevAccessStateRef.current = {
        userId: authenticatedUser.id,
        valid: true,
        tab: 'home',
      };
      void checkAuth(false);
      return;
    }

    // 4. Neither VIP nor free access is valid: redirect to the Key Page
    setShowKeyGenModal(true);
    prevAccessStateRef.current = {
      userId: authenticatedUser.id,
      valid: false,
      tab: 'home',
    };
    void checkAuth(false);
  };

  const handleLogout = () => {
    api.logout().catch(() => {});
    removeStoredToken();
    setUser(null);
    prevAccessStateRef.current = null;
    setShowKeyGenModal(false);
    if (currentPath === '/admin') {
      // Stay on /admin and display AdminLoginPage
    } else {
      setCurrentTab('home');
    }
  };

  const handleSwitchAccount = async (email: string, pass: string) => {
    try {
      const res = await api.login(email, pass);
      handleAuthSuccess(res.user);
    } catch (err) {
      console.error('Failed switching test account:', err);
    }
  };

  const handleCloseTelegram = () => {
    recordPopupDismissed('tg_popup', settings?.telegram_popup_frequency, user?.id);
    setShowTelegramModal(false);
  };

  const handleCloseCustomPopup = () => {
    recordPopupDismissed('custom_popup', settings?.custom_popup_frequency, user?.id);
    setShowCustomPopupModal(false);
  };

  // ----------------------------------------------------
  // ROUTE 1: Dedicated /admin Route (Option B)
  // ----------------------------------------------------
  if (currentPath === '/admin') {
    const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin') && !user.is_blocked;

    if (isAdmin) {
      // Super Admin or Admin logged in: Display ONLY Admin Panel
      return (
        <React.Suspense
          fallback={
            <div className="min-h-screen ra-grid-bg bg-[#090909] flex items-center justify-center p-4">
              <div className="ra-panel ra-corners px-6 py-4 rounded-xl text-center">
                <p className="font-display text-xs text-[#F5F5F5] font-bold tracking-[0.2em] uppercase">
                  Loading Admin Command
                </p>
              </div>
            </div>
          }
        >
          <AdminPanel
            currentUser={user}
            onClose={() => navigateTo('/')}
            onLogout={handleLogout}
            onRefreshPublicData={() => refreshAllPublicConfig(true)}
          />
        </React.Suspense>
      );
    }

    // Unauthenticated or Non-Admin on /admin: Display Dedicated Admin Login
    return (
      <React.Suspense
        fallback={
          <div className="min-h-screen ra-grid-bg bg-[#090909] flex items-center justify-center p-4">
            <div className="ra-panel ra-corners px-6 py-4 rounded-xl text-center">
              <p className="font-display text-xs text-[#F5F5F5] font-bold tracking-[0.2em] uppercase">
                Loading Admin Access
              </p>
            </div>
          </div>
        }
      >
        <AdminLoginPage
          settings={settings}
          onLoginSuccess={(adminUser) => {
            setUser(adminUser);
          }}
          onNavigateHome={() => navigateTo('/')}
        />
      </React.Suspense>
    );
  }

  // ----------------------------------------------------
  // ROUTE 2: Normal Public User Website (/)
  // ----------------------------------------------------

  // Maintenance mode gate: if active and user is not admin, show maintenance screen
  const isPrivileged = user && (user.role === 'admin' || user.role === 'super_admin') && !user.is_blocked;
  if (settings?.maintenance_mode && !isPrivileged) {
    return (
      <>
        <MaintenanceScreen onAdminLoginClick={() => navigateTo('/admin')} />
        {showAuthModal && (
          <AuthModal
            loginEnabled={true}
            onSuccess={handleAuthSuccess}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </>
    );
  }

  // Initial loading state while verifying existing session token or settings
  if ((loading || authChecking) && !user) {
    const brandName = settings?.app_name || 'STUDY BLUNDER';
    return (
      <div className="min-h-screen ra-grid-bg bg-[#090909] flex flex-col items-center justify-center p-6">
        <div className="ra-corners w-18 h-18 rounded-xl bg-[#1D1D1D] border border-[#454545] p-2.5 mb-5 flex items-center justify-center overflow-hidden relative shadow-[0_0_28px_rgba(255,37,37,0.18)]">
          <div className="ra-scan-beam absolute inset-x-0 h-5 bg-gradient-to-b from-transparent via-[#FF2525]/35 to-transparent pointer-events-none" />
          {settings?.app_logo_url ? (
            <img
              src={settings.app_logo_url}
              alt={brandName}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          ) : (
            <span className="font-display text-xl font-black text-[#FF2525] tracking-tight">
              {brandName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <p className="font-display text-sm text-[#F5F5F5] font-extrabold tracking-[0.24em] uppercase">
          {brandName}
        </p>
        <div className="mt-3.5 w-36 h-1 bg-[#141414] border border-[#454545] overflow-hidden">
          <div className="h-full w-2/5 bg-[#FF2525]" />
        </div>
      </div>
    );
  }

  // Student Authentication Gate or Password Reset Link Gate
  if (!user || isPasswordResetFlow) {
    return (
      <StudentLoginPage
        settings={settings}
        onAuthSuccess={(authenticatedUser) => {
          setIsPasswordResetFlow(false);
          handleAuthSuccess(authenticatedUser);
        }}
        onNavigateAdmin={() => navigateTo('/admin')}
        isKeyVerify={isKeyVerifyRoute}
        onPasswordResetComplete={() => {
          removeStoredToken();
          setUser(null);
          setIsPasswordResetFlow(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-body ra-grid-bg bg-[#090909] text-[#F5F5F5] transition-colors duration-200 relative overflow-x-hidden">
      {/* Non-Intrusive Festival Decoration Overlay Layer (Renders nothing when OFF or inactive) */}
      {activeFestivalState?.global_enabled !== false && activeFestivalState?.festival && (
        <React.Suspense fallback={null}>
          <FestivalOverlayEngine
            festival={activeFestivalState.festival}
            globalEnabled={true}
            currentScreen={currentTab === 'vip' ? 'vip' : currentTab === 'profile' ? 'profile' : 'home'}
          />
        </React.Suspense>
      )}

      {/* Key Verified Toast Notification */}
      {keyVerifiedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-[#1D1D1D] text-[#F5F5F5] font-bold text-xs shadow-2xl flex items-center gap-2.5 border border-[#FF2525]/70 ra-corners max-w-[92vw]">
          <CheckCircle2 className="w-4 h-4 text-[#FF2525] shrink-0" />
          <span>Access Pass Activated — Valid for 24 Hours</span>
        </div>
      )}

      {/* Top Header */}
      <TopHeader
        user={effectiveUser}
        settings={settings}
        onOpenAuth={() => setShowAuthModal(true)}
        onOpenAdmin={() => navigateTo('/admin')}
        onOpenTelegram={() => setShowTelegramModal(true)}
        isAdminView={false}
        onExitAdmin={() => {}}
        colorMode={colorMode}
        onToggleColorMode={toggleColorMode}
      />

      {/* Main Tab Content */}
      <main className="flex-1">
        {currentTab === 'home' && (
          <HomeSection
            platforms={platforms}
            announcements={announcements}
            settings={settings}
            loading={loading}
            user={effectiveUser}
            now={now}
            keyGenerationEnabled={settings?.key_generation_enabled !== false}
            onRefresh={() => refreshAllPublicConfig(true)}
            onNavigateToVip={(mode?: 'single_platform' | 'all_platforms', platformId?: string | null) => {
              if (mode) {
                setVipIntent({ mode, platformId: platformId || null, nonce: Date.now() });
              }
              handleTabChange('vip');
            }}
            onOpenKeyGen={() => {
              if (!effectiveUser?.is_blocked) {
                setShowKeyGenModal(true);
              }
            }}
          />
        )}

        {currentTab === 'vip' && (
          <VipSection
            batches={batches}
            plans={plans}
            platforms={platforms}
            initialVipMode={vipIntent?.mode}
            initialPlatformId={vipIntent?.platformId}
            vipIntentNonce={vipIntent?.nonce}
            loading={loading}
            isUserVip={isUserVipValid}
            user={effectiveUser}
            settings={settings}
            supportUrl={settings?.support_url || settings?.telegram_channel_url}
            vipPurchaseUrl={settings?.vip_telegram_url || settings?.vip_purchase_url}
            onOpenAuth={() => setShowAuthModal(true)}
            onRefreshPlans={refreshAllPublicConfig}
            onOpenVipDashboard={() => handleTabChange('vip_dashboard')}
            vipTheme={{
              background: settings?.vip_theme_background,
              card: settings?.vip_theme_card,
              accent: settings?.vip_theme_accent,
              text: settings?.vip_theme_text,
              button: settings?.vip_theme_button,
              border: settings?.vip_theme_border,
            }}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileSection
            user={effectiveUser}
            settings={settings}
            colorMode={colorMode}
            onToggleColorMode={toggleColorMode}
            onLogout={handleLogout}
            onGoToVip={() => handleTabChange('vip')}
            onSwitchAccount={handleSwitchAccount}
            onOpenAuth={() => setShowAuthModal(true)}
            onUserUpdated={checkAuth}
            onOpenKeyGen={() => {
              if (!effectiveUser?.is_blocked) {
                setShowKeyGenModal(true);
              }
            }}
          />
        )}

        {currentTab === 'vip_dashboard' && (
          <div className="max-w-xl lg:max-w-4xl mx-auto px-3.5 sm:px-5 pt-4 pb-28">
            <React.Suspense
              fallback={
                <div className="p-8 rounded-2xl ra-panel ra-corners text-center">
                  <p className="font-display text-xs font-bold text-[#FF2525] uppercase tracking-[0.2em]">
                    Loading VIP Command Hub
                  </p>
                </div>
              }
            >
              <VipStudentHub
                user={effectiveUser}
                settings={settings}
                onScrollToRenewal={() => handleTabChange('vip')}
                onOpenAuth={() => setShowAuthModal(true)}
              />
            </React.Suspense>
          </div>
        )}
      </main>

      {/* Fixed Bottom Navigation */}
      <BottomNav currentTab={currentTab} onChangeTab={handleTabChange} settings={settings} />

      {/* Intermediary Key Generation Modal */}
      {showKeyGenModal && !effectiveUser?.is_blocked && (
        <KeyGenerationModal
          settings={settings}
          user={effectiveUser}
          onContinueToHome={(updatedUser) => {
            if (updatedUser) {
              const currentNow = Date.now();
              setNow(currentNow);
              setUser(updatedUser);
              prevAccessStateRef.current = {
                userId: updatedUser.id,
                valid: true,
                tab: 'home',
              };
            }
            setKeyVerifiedToast(true);
            setTimeout(() => setKeyVerifiedToast(false), 5000);
            setShowKeyGenModal(false);
            setCurrentTab('home');
            checkAuth();
          }}
          onGoToVip={() => {
            if (user) {
              prevAccessStateRef.current = {
                userId: user.id,
                valid: hasValidStudentAccess,
                tab: 'vip',
              };
            }
            setShowKeyGenModal(false);
            setCurrentTab('vip');
          }}
        />
      )}

      {/* Telegram Popup Modal */}
      {showTelegramModal && settings?.telegram_channel_url && (
        <TelegramModal
          channelUrl={settings.telegram_channel_url}
          title={settings.telegram_popup_title}
          message={settings.telegram_popup_message}
          buttonText={settings.telegram_popup_button_text}
          closeText={settings.telegram_popup_close_text}
          reminderText={settings.telegram_popup_reminder_text}
          onClose={handleCloseTelegram}
        />
      )}

      {/* Customizable Popup Modal */}
      {showCustomPopupModal && settings?.custom_popup_enabled && !showTelegramModal && (
        <CustomPopupModal
          title={settings.custom_popup_title || ''}
          message={settings.custom_popup_message || ''}
          imageUrl={settings.custom_popup_image_url}
          buttonText={settings.custom_popup_button_text}
          buttonUrl={settings.custom_popup_button_url}
          closeText={settings.custom_popup_close_text}
          onClose={handleCloseCustomPopup}
        />
      )}

      {/* Auth Modal (Login / Register for normal users) */}
      {showAuthModal && (
        <AuthModal
          loginEnabled={settings?.login_enabled !== false}
          referralProgramEnabled={settings?.referral_program_enabled !== false}
          onSuccess={handleAuthSuccess}
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}

