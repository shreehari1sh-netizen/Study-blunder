import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Key,
  PlayCircle,
  ExternalLink,
  Sparkles,
  AlertCircle,
  Clock,
  RefreshCw,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
  Crown,
} from 'lucide-react';
import { api } from '../api.ts';
import type { PublicSettings, UserProfile, PaymentRecord } from '../types.ts';
import { PreKeyVipPurchasePage } from './PreKeyVipPurchasePage.tsx';

interface KeyGenerationModalProps {
  settings: PublicSettings | null;
  user?: UserProfile | null;
  onContinueToHome: (updatedUser?: UserProfile) => void;
  onGoToVip?: () => void;
}

interface StoredVplinkFlow {
  userId: string;
  flowId: string;
  targetUrl: string;
  initiatedAt: number;
  earliestKeyAt: number;
  leftAt: number | null;
  returnedAt: number | null;
  expectingReturn: boolean;
  keyClaimed: boolean;
}

const FLOW_STORAGE_PREFIX = 'studyfox_vplink_flow_';
const FLOW_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const MIN_VPLINK_WAIT_SECONDS = 200;
const MIN_VPLINK_WAIT_MS = MIN_VPLINK_WAIT_SECONDS * 1000;
const EARLY_RETURN_MESSAGE = 'Please complete the shortener process and return after the required time.';

function getFlowStorageKey(userId?: string): string {
  return `${FLOW_STORAGE_PREFIX}${userId || 'guest'}`;
}

function readStoredFlow(userId?: string): StoredVplinkFlow | null {
  try {
    const key = getFlowStorageKey(userId);
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredVplinkFlow;
    if (!parsed || !parsed.flowId || !parsed.initiatedAt) return null;
    if (userId && parsed.userId !== userId) return null;
    if (Date.now() - parsed.initiatedAt > FLOW_MAX_AGE_MS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
      return null;
    }
    if (!parsed.earliestKeyAt || parsed.earliestKeyAt < parsed.initiatedAt + MIN_VPLINK_WAIT_MS) {
      parsed.earliestKeyAt = parsed.initiatedAt + MIN_VPLINK_WAIT_MS;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredFlow(flow: StoredVplinkFlow): void {
  try {
    const key = getFlowStorageKey(flow.userId);
    const serialized = JSON.stringify(flow);
    localStorage.setItem(key, serialized);
    sessionStorage.setItem(key, serialized);
  } catch {
    // Ignore storage quota errors
  }
}

function clearStoredFlow(userId?: string): void {
  try {
    const key = getFlowStorageKey(userId);
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

function formatWaitTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, '0')}s (${safe}s)`;
  }
  return `${safe}s`;
}

export const KeyGenerationModal: React.FC<KeyGenerationModalProps> = ({
  settings,
  user,
  onContinueToHome,
  onGoToVip,
}) => {
  const userId = user?.id || 'guest';

  // Flow & Action States
  const [generating, setGenerating] = useState(false);
  const [claimingKey, setClaimingKey] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // VPLINK Flow State
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [lastTargetUrl, setLastTargetUrl] = useState<string | null>(null);
  const [waitingForVplinkReturn, setWaitingForVplinkReturn] = useState(false);
  const [hasReturnedFromVplink, setHasReturnedFromVplink] = useState(false);
  const [earliestKeyAtMs, setEarliestKeyAtMs] = useState<number | null>(null);
  const [waitRemainingSeconds, setWaitRemainingSeconds] = useState<number>(0);
  const [canGetKey, setCanGetKey] = useState(false);

  // Generated Key & Copy State (Never persisted in localStorage so direct page open never reveals a key)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Paste & Verify Key Input State
  const [keyInput, setKeyInput] = useState('');

  // Pre-Key VIP Purchase Page View State & Pending Payment Tracking
  const [showPreKeyVip, setShowPreKeyVip] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<PaymentRecord | null>(null);

  const refreshPendingAndVipState = useCallback(async () => {
    if (!user || user.id === 'guest') return;
    try {
      const [me, payments] = await Promise.all([
        api.getMe().catch(() => null),
        api.getMyVipPayments().catch(() => []),
      ]);
      if (me && me.vip_active && me.vip_expires_at && new Date(me.vip_expires_at).getTime() > Date.now()) {
        clearStoredFlow(userId);
        onContinueToHome(me);
        return;
      }
      const activePending =
        payments.find((p) => p.status === 'pending_verification' || p.status === 'pending') || null;
      setPendingPayment(activePending);
    } catch {
      // Ignore transient network errors
    }
  }, [user, userId, onContinueToHome]);

  useEffect(() => {
    void refreshPendingAndVipState();
    const poll = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refreshPendingAndVipState();
    }, 12000);
    return () => window.clearInterval(poll);
  }, [refreshPendingAndVipState]);

  // Track if the current component mount initiated the flow in this exact tab
  const initiatedInThisMountRef = useRef<string | null>(null);

  const applyFlowTiming = useCallback(
    (flow: StoredVplinkFlow, returnedNow: boolean) => {
      const nowMs = Date.now();
      const targetEarliestMs = Math.max(
        flow.earliestKeyAt || flow.initiatedAt + MIN_VPLINK_WAIT_MS,
        flow.initiatedAt + MIN_VPLINK_WAIT_MS
      );
      const remainingSec = Math.max(0, Math.ceil((targetEarliestMs - nowMs) / 1000));

      setActiveFlowId(flow.flowId);
      setLastTargetUrl(flow.targetUrl);
      setEarliestKeyAtMs(targetEarliestMs);
      setWaitRemainingSeconds(remainingSec);

      if (returnedNow || flow.returnedAt !== null) {
        setHasReturnedFromVplink(true);
        setWaitingForVplinkReturn(remainingSec > 0);
        setCanGetKey(remainingSec === 0);
        if (remainingSec > 0) {
          setError(EARLY_RETURN_MESSAGE);
        } else {
          setError((prev) => (prev === EARLY_RETURN_MESSAGE ? null : prev));
        }
      } else {
        setHasReturnedFromVplink(false);
        setWaitingForVplinkReturn(true);
        setCanGetKey(false);
      }
    },
    []
  );

  // Sync flow state with trusted server timestamp on mount / refresh / return from VPLINK
  useEffect(() => {
    let cancelled = false;
    const stored = readStoredFlow(userId);

    if (stored && !stored.keyClaimed) {
      const elapsedSinceStartMs = Date.now() - stored.initiatedAt;
      const isReturnFromRedirect =
        (stored.expectingReturn &&
          initiatedInThisMountRef.current !== stored.flowId &&
          elapsedSinceStartMs >= 500) ||
        stored.returnedAt !== null;

      const updatedLocal: StoredVplinkFlow = isReturnFromRedirect
        ? {
            ...stored,
            returnedAt: stored.returnedAt || Date.now(),
            expectingReturn: false,
          }
        : stored;

      writeStoredFlow(updatedLocal);
      applyFlowTiming(updatedLocal, isReturnFromRedirect);
    }

    // Query backend for trusted flow timestamp so refreshing or tampering with localStorage cannot bypass the 200s wait
    api
      .getKeyFlowStatus(stored?.flowId)
      .then((serverStatus) => {
        if (cancelled) return;
        if (!serverStatus.has_active_flow || !serverStatus.flow_id || !serverStatus.started_at) {
          if (stored && !stored.keyClaimed) {
            clearStoredFlow(userId);
            setActiveFlowId(null);
            setWaitingForVplinkReturn(false);
            setHasReturnedFromVplink(false);
            setCanGetKey(false);
            setEarliestKeyAtMs(null);
            setWaitRemainingSeconds(0);
          }
          return;
        }

        if (serverStatus.key_claimed) {
          clearStoredFlow(userId);
          setWaitingForVplinkReturn(false);
          setHasReturnedFromVplink(false);
          setCanGetKey(false);
          setWaitRemainingSeconds(0);
          return;
        }

        const serverStartMs = new Date(serverStatus.started_at).getTime();
        const serverEarliestMs = serverStatus.earliest_key_at
          ? new Date(serverStatus.earliest_key_at).getTime()
          : serverStartMs + MIN_VPLINK_WAIT_MS;
        const currentLocal = readStoredFlow(userId);
        const hasReturned =
          Boolean(currentLocal?.returnedAt) ||
          (Boolean(currentLocal?.expectingReturn) &&
            initiatedInThisMountRef.current !== serverStatus.flow_id &&
            Date.now() - serverStartMs >= 500);

        const syncedFlow: StoredVplinkFlow = {
          userId,
          flowId: serverStatus.flow_id,
          targetUrl:
            serverStatus.target_url ||
            currentLocal?.targetUrl ||
            settings?.shortener_url ||
            '',
          initiatedAt: serverStartMs,
          earliestKeyAt: serverEarliestMs,
          leftAt: currentLocal?.leftAt || null,
          returnedAt: hasReturned ? currentLocal?.returnedAt || Date.now() : null,
          expectingReturn: !hasReturned,
          keyClaimed: false,
        };
        writeStoredFlow(syncedFlow);
        applyFlowTiming(syncedFlow, hasReturned);
      })
      .catch(() => {
        // Fallback to local stored flow if offline
      });

    return () => {
      cancelled = true;
    };
  }, [userId, settings?.shortener_url, applyFlowTiming]);

  // Live 1-second countdown until 200 seconds have elapsed
  useEffect(() => {
    if (!earliestKeyAtMs || generatedKey) return;

    const tick = () => {
      const remainingSec = Math.max(0, Math.ceil((earliestKeyAtMs - Date.now()) / 1000));
      setWaitRemainingSeconds(remainingSec);

      if (remainingSec === 0) {
        if (hasReturnedFromVplink) {
          setCanGetKey(true);
          setWaitingForVplinkReturn(false);
          setError((prev) => (prev === EARLY_RETURN_MESSAGE ? null : prev));
        }
      } else if (hasReturnedFromVplink) {
        setCanGetKey(false);
      }
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [earliestKeyAtMs, hasReturnedFromVplink, generatedKey]);

  // Detect return when VPLINK was opened in a new tab/window and the user switches back to this tab
  const handleDetectReturnToTab = useCallback(() => {
    const stored = readStoredFlow(userId);
    if (!stored || stored.keyClaimed) return;

    const elapsedMs = Date.now() - stored.initiatedAt;
    if (stored.leftAt !== null || elapsedMs >= 1000) {
      const updated: StoredVplinkFlow = {
        ...stored,
        returnedAt: stored.returnedAt || Date.now(),
        expectingReturn: false,
      };
      writeStoredFlow(updated);
      applyFlowTiming(updated, true);

      // Verify elapsed time against trusted backend clock
      api
        .getKeyFlowStatus(updated.flowId)
        .then((serverStatus) => {
          if (!serverStatus.has_active_flow || !serverStatus.started_at || !serverStatus.flow_id) return;
          const serverStartMs = new Date(serverStatus.started_at).getTime();
          const serverEarliestMs = serverStatus.earliest_key_at
            ? new Date(serverStatus.earliest_key_at).getTime()
            : serverStartMs + MIN_VPLINK_WAIT_MS;
          const synced: StoredVplinkFlow = {
            ...updated,
            flowId: serverStatus.flow_id,
            initiatedAt: serverStartMs,
            earliestKeyAt: serverEarliestMs,
          };
          writeStoredFlow(synced);
          applyFlowTiming(synced, true);
        })
        .catch(() => {});
    }
  }, [userId, applyFlowTiming]);

  useEffect(() => {
    if (!waitingForVplinkReturn && !hasReturnedFromVplink) return;

    const handleVisibilityChange = () => {
      const stored = readStoredFlow(userId);
      if (!stored || stored.keyClaimed) return;

      if (document.visibilityState === 'hidden') {
        writeStoredFlow({ ...stored, leftAt: Date.now() });
      } else if (document.visibilityState === 'visible') {
        handleDetectReturnToTab();
      }
    };

    const handleWindowBlur = () => {
      const stored = readStoredFlow(userId);
      if (!stored || stored.keyClaimed) return;
      writeStoredFlow({ ...stored, leftAt: Date.now() });
    };

    const handleWindowFocus = () => {
      handleDetectReturnToTab();
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === getFlowStorageKey(userId) && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as StoredVplinkFlow;
          if (parsed && parsed.returnedAt && !parsed.keyClaimed) {
            applyFlowTiming(parsed, true);
          }
        } catch {
          // Ignore malformed storage event
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handleWindowFocus);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handleWindowFocus);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [waitingForVplinkReturn, hasReturnedFromVplink, userId, handleDetectReturnToTab, applyFlowTiming]);

  // Step 1: Click "Generate New Key" -> Record flow initiation and open existing VPLINK URL
  const handleGenerateNewKey = async () => {
    if (generating) return;

    // Prevent repeatedly restarting the timer while an active 200-second shortener flow is already running
    const existingFlow = readStoredFlow(userId);
    if (existingFlow && !existingFlow.keyClaimed && existingFlow.earliestKeyAt > Date.now()) {
      const remainingSec = Math.max(1, Math.ceil((existingFlow.earliestKeyAt - Date.now()) / 1000));
      setEarliestKeyAtMs(existingFlow.earliestKeyAt);
      setWaitRemainingSeconds(remainingSec);
      setLastTargetUrl(existingFlow.targetUrl);
      const openedWin = window.open(existingFlow.targetUrl, '_blank', 'noopener,noreferrer');
      if (!openedWin) {
        writeStoredFlow({ ...existingFlow, leftAt: Date.now(), expectingReturn: true });
        window.location.assign(existingFlow.targetUrl);
      }
      return;
    }

    try {
      setGenerating(true);
      setError(null);
      setGeneratedKey(null);
      setCopySuccess(false);
      setCanGetKey(false);
      setHasReturnedFromVplink(false);

      const res = await api.triggerKeyGeneration();
      const flowId = res.flow_id || res.verification_token || '';
      const targetUrl = res.target_url || res.shortener_url || settings?.shortener_url;

      if (!targetUrl) {
        throw new Error('Shortener URL has not been configured in Admin Settings.');
      }

      let finalUrl = targetUrl.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = `https://${finalUrl}`;
      }

      const parsed = new URL(finalUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Invalid shortener URL protocol.');
      }

      const startedAtMs = res.started_at ? new Date(res.started_at).getTime() : Date.now();
      const earliestAtMs = res.earliest_key_at
        ? new Date(res.earliest_key_at).getTime()
        : startedAtMs + MIN_VPLINK_WAIT_MS;

      initiatedInThisMountRef.current = flowId;
      setActiveFlowId(flowId);
      setLastTargetUrl(parsed.toString());
      setEarliestKeyAtMs(earliestAtMs);
      setWaitRemainingSeconds(MIN_VPLINK_WAIT_SECONDS);
      setWaitingForVplinkReturn(true);

      const newFlow: StoredVplinkFlow = {
        userId,
        flowId,
        targetUrl: parsed.toString(),
        initiatedAt: startedAtMs,
        earliestKeyAt: earliestAtMs,
        leftAt: null,
        returnedAt: null,
        expectingReturn: true,
        keyClaimed: false,
      };
      writeStoredFlow(newFlow);

      // Open VPLINK shortener URL
      const openedWin = window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
      if (!openedWin) {
        // Fallback if popup is blocked or in single-window WebView
        writeStoredFlow({ ...newFlow, leftAt: Date.now() });
        window.location.assign(parsed.toString());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to open shortener link. Please try again.';
      setError(msg);
      setWaitingForVplinkReturn(false);
    } finally {
      setGenerating(false);
    }
  };

  // Step 3: Click "Get Key" after returning from VPLINK and waiting at least 200 seconds -> Request unique key from backend
  const handleGetKey = async () => {
    if (claimingKey) return;

    const stored = readStoredFlow(userId);
    const effectiveEarliest = earliestKeyAtMs || stored?.earliestKeyAt || 0;
    if (effectiveEarliest > Date.now()) {
      const rem = Math.max(1, Math.ceil((effectiveEarliest - Date.now()) / 1000));
      setWaitRemainingSeconds(rem);
      setCanGetKey(false);
      setError(EARLY_RETURN_MESSAGE);
      return;
    }

    try {
      setClaimingKey(true);
      setError(null);
      setCopySuccess(false);

      const flowIdToUse = activeFlowId || stored?.flowId || '';

      const res = await api.claimGeneratedKey(flowIdToUse);
      if (!res.key) {
        throw new Error('Failed to generate key. Please try again.');
      }

      // Mark flow as claimed/cleared in browser storage so reopening the page directly will never reveal or re-trigger it
      clearStoredFlow(userId);
      setGeneratedKey(res.key);
      setCanGetKey(false);
      setHasReturnedFromVplink(false);
      setWaitingForVplinkReturn(false);
      setEarliestKeyAtMs(null);
      setWaitRemainingSeconds(0);
    } catch (err: unknown) {
      const typedErr = err as Error & {
        code?: string;
        earliest_key_at?: string;
        remaining_seconds?: number;
      };
      if (typedErr?.code === 'SHORTENER_WAIT_REQUIRED') {
        const newEarliest = typedErr.earliest_key_at
          ? new Date(typedErr.earliest_key_at).getTime()
          : Date.now() + (typedErr.remaining_seconds || MIN_VPLINK_WAIT_SECONDS) * 1000;
        setEarliestKeyAtMs(newEarliest);
        setWaitRemainingSeconds(
          Math.max(1, typedErr.remaining_seconds || Math.ceil((newEarliest - Date.now()) / 1000))
        );
        setCanGetKey(false);
        setHasReturnedFromVplink(true);
        setError(EARLY_RETURN_MESSAGE);
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to generate key. Please try again.';
        setError(msg);
      }
    } finally {
      setClaimingKey(false);
    }
  };

  // Copy generated key to clipboard
  const handleCopyKey = async () => {
    if (!generatedKey) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(generatedKey);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = generatedKey;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 3500);
    } catch {
      setError('Could not copy automatically. Please select and copy the key manually.');
    }
  };

  // Step 4: Paste Key and Click "Verify Key" -> Validate on backend and start exact 24-hour access timer
  const handleVerifyKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (verifying) return;

    const trimmed = keyInput.trim();
    if (!trimmed) {
      setError('Please paste or enter your access key before clicking Verify Key.');
      return;
    }

    try {
      setVerifying(true);
      setError(null);

      const res = await api.verifyKey(trimmed);
      clearStoredFlow(userId);
      setGeneratedKey(null);
      setCanGetKey(false);
      setWaitingForVplinkReturn(false);
      onContinueToHome(res.user);
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Invalid or expired key. Please generate a new key.';
      setError(msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleReopenLink = () => {
    if (lastTargetUrl) {
      const stored = readStoredFlow(userId);
      if (stored) {
        writeStoredFlow({ ...stored, leftAt: Date.now(), expectingReturn: true });
      }
      const openedWin = window.open(lastTargetUrl, '_blank', 'noopener,noreferrer');
      if (!openedWin) {
        window.location.assign(lastTargetUrl);
      }
    } else {
      handleGenerateNewKey();
    }
  };

  const handleHowToGenerateKey = () => {
    const tutorialUrl = settings?.tutorial_video_url || 'https://www.youtube.com';
    let finalUrl = tutorialUrl.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }
    try {
      const parsed = new URL(finalUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Ignore malformed tutorial URL
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070B14]/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      {showPreKeyVip ? (
        <PreKeyVipPurchasePage
          user={user}
          settings={settings}
          onBackToKeyPage={() => {
            setShowPreKeyVip(false);
            void refreshPendingAndVipState();
          }}
          onVipActivated={(updatedUser) => {
            clearStoredFlow(userId);
            setShowPreKeyVip(false);
            onContinueToHome(updatedUser);
          }}
        />
      ) : (
      <div className="bg-[#0C1222] border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-center animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Glow Crest */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-amber-500 p-0.5 mx-auto shadow-xl shadow-purple-900/50 mb-3.5">
          <div className="w-full h-full bg-[#090D16] rounded-2xl flex items-center justify-center text-indigo-400">
            <Key className="w-7 h-7" />
          </div>
        </div>

        <h2 className="text-lg font-extrabold text-white">Unlock Free Platform Access</h2>
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
          Generate a key via VPLINK, copy your unique key, and verify it below to unlock 24 hours of free access.
        </p>

        <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>Access Validity: 24 Hours after Verification</span>
        </div>

        {/* Pending VIP Payment Verification Status Banner on Key Page */}
        {pendingPayment && (
          <div className="mt-3.5 p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-left space-y-1.5 animate-in fade-in">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Payment Pending Verification</span>
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/30">
                {pendingPayment.request_id || pendingPayment.id}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Your VIP request for <strong>{pendingPayment.plan_title}</strong> (₹{pendingPayment.amount}) is awaiting Admin verification. Home unlocks automatically once approved.
            </p>
            <button
              type="button"
              onClick={() => setShowPreKeyVip(true)}
              className="text-[11px] font-bold text-amber-300 hover:text-amber-200 underline"
            >
              View Payment Request Status →
            </button>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mt-3.5 p-2.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Generated Key Display + Copy Key Button (Shown ONLY after returning from VPLINK and clicking Get Key) */}
        {generatedKey && (
          <div className="mt-4 p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 text-left space-y-2.5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Your Generated Key</span>
              </span>
              <span className="text-[10px] text-slate-400 font-semibold">Single-Use</span>
            </div>

            <div className="flex items-center justify-between gap-2 bg-[#070B14] border border-slate-800 rounded-xl px-3 py-2.5">
              <code className="text-xs font-extrabold tracking-wider text-amber-300 select-all break-all">
                {generatedKey}
              </code>
              <button
                type="button"
                onClick={handleCopyKey}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
              >
                {copySuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Key</span>
                  </>
                )}
              </button>
            </div>

            {copySuccess && (
              <p className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Key copied successfully! Paste it below and click Verify Key.</span>
              </p>
            )}
          </div>
        )}

        {/* Paste Key Input & Verify Key Form */}
        <form onSubmit={handleVerifyKey} className="mt-4 space-y-2.5 text-left">
          <div>
            <label htmlFor="access-key-input" className="block text-[11px] font-bold text-slate-300 mb-1">
              Enter or Paste Access Key
            </label>
            <input
              id="access-key-input"
              type="text"
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. SFOX-XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-[#080D19] border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs font-mono font-bold tracking-wider text-white placeholder-slate-500 focus:outline-none transition-colors uppercase"
            />
          </div>

          <button
            type="submit"
            disabled={verifying}
            className="w-full py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/50 active:scale-[0.98] disabled:opacity-60"
          >
            {verifying ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verifying Key...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Verify Key</span>
              </>
            )}
          </button>
        </form>

        {/* VPLINK Waiting Period Notice */}
        {(waitingForVplinkReturn || (hasReturnedFromVplink && waitRemainingSeconds > 0)) && !generatedKey && (
          <div className="mt-4 p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/40 text-left space-y-1.5 animate-in fade-in">
            <div className="flex items-center justify-between gap-2 text-indigo-300 font-bold text-xs">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                </span>
                <span>Shortener Flow in Progress</span>
              </div>
              {waitRemainingSeconds > 0 && (
                <span className="text-[11px] font-mono text-amber-300">
                  {formatWaitTime(waitRemainingSeconds)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Please complete the shortener process and return after the required time. The <strong>Get Key</strong> button unlocks after 200 seconds.
            </p>
          </div>
        )}

        {/* Key Generation & Get Key Action Buttons */}
        <div className="mt-4 pt-3.5 border-t border-slate-800/80 space-y-2.5">
          {/* Get Key Button: Disabled until at least 200 seconds have elapsed */}
          {(hasReturnedFromVplink || canGetKey) && !generatedKey && (
            <button
              type="button"
              onClick={handleGetKey}
              disabled={claimingKey || !canGetKey || waitRemainingSeconds > 0}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500 hover:opacity-95 text-slate-950 font-extrabold text-xs tracking-wider uppercase shadow-xl shadow-amber-950/50 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed animate-in fade-in"
            >
              {claimingKey ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating Unique Key...</span>
                </>
              ) : waitRemainingSeconds > 0 || !canGetKey ? (
                <>
                  <Clock className="w-4 h-4" />
                  <span>Get Key ({formatWaitTime(waitRemainingSeconds)})</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>Get Key</span>
                </>
              )}
            </button>
          )}

          {/* Generate New Key Button */}
          <button
            type="button"
            onClick={handleGenerateNewKey}
            disabled={generating || (waitRemainingSeconds > 0 && Boolean(activeFlowId))}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-amber-500 hover:opacity-95 text-white font-extrabold text-xs tracking-wider uppercase shadow-xl shadow-purple-950/60 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Key className="w-4 h-4" />
            <span>
              {generating
                ? 'Opening VPLINK...'
                : waitRemainingSeconds > 0 && activeFlowId
                ? `Shortener Active (${formatWaitTime(waitRemainingSeconds)})`
                : 'Generate New Key'}
            </span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>

          {/* 👑 GET VIP Button (Pre-Key VIP Purchase Page inside App) */}
          <button
            type="button"
            onClick={() => setShowPreKeyVip(true)}
            className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500 hover:opacity-95 text-slate-950 font-extrabold text-xs tracking-wider uppercase shadow-xl shadow-amber-950/60 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Crown className="w-4 h-4 stroke-[2.4]" />
            <span>👑 GET VIP</span>
          </button>

          {(waitingForVplinkReturn || (hasReturnedFromVplink && waitRemainingSeconds > 0)) && !generatedKey && (
            <button
              type="button"
              onClick={handleReopenLink}
              className="w-full py-2 px-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
              <span>Re-open VPLINK Page</span>
            </button>
          )}

          {/* How to Generate Key Tutorial Button */}
          <button
            type="button"
            onClick={handleHowToGenerateKey}
            className="w-full py-2.5 px-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 font-bold text-xs tracking-wide flex items-center justify-center gap-2 transition-colors"
          >
            <PlayCircle className="w-4 h-4 text-amber-400" />
            <span>How to Generate Key?</span>
          </button>
        </div>

        {/* VIP Shortcut */}
        <div className="mt-4 pt-3.5 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setShowPreKeyVip(true)}
            className="text-[11px] text-amber-300 hover:text-amber-200 font-semibold flex items-center justify-center gap-1.5 mx-auto transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>VIP Students skip key generation forever. Upgrade to VIP</span>
          </button>
        </div>
      </div>
      )}
    </div>
  );
};

