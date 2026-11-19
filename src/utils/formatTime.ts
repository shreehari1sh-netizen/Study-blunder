/**
 * Utility functions for precise remaining-access and VIP countdown timers with seconds.
 * Always calculates from the actual saved ISO timestamp as the single source of truth.
 */

export interface RemainingTimeResult {
  text: string;
  isExpired: boolean;
  totalSeconds: number;
  timeString: string;
}

const pad = (n: number): string => String(Math.max(0, n)).padStart(2, '0');

export function formatRemainingAccessTime(
  targetIso: string | null | undefined,
  nowMs: number,
  prefix = 'Access expires in '
): RemainingTimeResult {
  if (!targetIso) {
    return {
      text: 'Access expired (00h 00m 00s)',
      isExpired: true,
      totalSeconds: 0,
      timeString: '00h 00m 00s',
    };
  }

  const targetMs = new Date(targetIso).getTime();
  if (isNaN(targetMs)) {
    return {
      text: 'Invalid expiry timestamp',
      isExpired: true,
      totalSeconds: 0,
      timeString: '00h 00m 00s',
    };
  }

  const diff = targetMs - nowMs;
  if (diff <= 0) {
    return {
      text: 'Access expired (00h 00m 00s)',
      isExpired: true,
      totalSeconds: 0,
      timeString: '00h 00m 00s',
    };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let timeString = '';
  if (days > 0) {
    timeString = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  } else {
    timeString = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  return {
    text: `${prefix}${timeString}`,
    isExpired: false,
    totalSeconds,
    timeString,
  };
}

export function formatVipRemainingTime(
  targetIso: string | null | undefined,
  nowMs: number
): { text: string; isExpired: boolean; isLifetime: boolean; totalSeconds: number; timeString: string } {
  if (!targetIso) {
    return {
      text: 'Lifetime VIP',
      isExpired: false,
      isLifetime: true,
      totalSeconds: Infinity,
      timeString: 'Lifetime',
    };
  }

  const targetMs = new Date(targetIso).getTime();
  if (isNaN(targetMs)) {
    return {
      text: 'Invalid VIP timestamp',
      isExpired: true,
      isLifetime: false,
      totalSeconds: 0,
      timeString: '00h 00m 00s',
    };
  }

  const diff = targetMs - nowMs;
  if (diff <= 0) {
    return {
      text: 'VIP expired',
      isExpired: true,
      isLifetime: false,
      totalSeconds: 0,
      timeString: '00h 00m 00s',
    };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let timeString = '';
  if (days > 0) {
    timeString = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  } else {
    timeString = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }

  return {
    text: `VIP expires in ${timeString}`,
    isExpired: false,
    isLifetime: false,
    totalSeconds,
    timeString,
  };
}
