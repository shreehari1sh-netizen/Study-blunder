import React, { useState, useEffect, useMemo, useRef } from 'react';
import type {
  FestivalAnimationSpeed,
  FestivalDecorationConfig,
  FestivalId,
  FestivalParticleIntensity,
  FestivalParticleSize,
  FestivalTargetScreen,
} from '../constants/festivals.ts';

interface FestivalOverlayEngineProps {
  festival: FestivalDecorationConfig | null;
  globalEnabled?: boolean;
  currentScreen: FestivalTargetScreen;
  isPreview?: boolean;
}

interface ParticleSpec {
  id: number;
  left: string;
  top: string;
  delay: string;
  duration: string;
  sizeRem: number;
  variant: number;
  motionClass: string;
  opacityScale: number;
}

export interface DiwaliRocketPalette {
  id: 'red' | 'green' | 'blue' | 'golden' | 'pink' | 'purple';
  name: string;
  rocketColor: string;
  headCore: string;
  trailColor: string;
  burstPrimary: string;
  burstSecondary: string;
}

export const DIWALI_ROCKET_PALETTES: readonly DiwaliRocketPalette[] = [
  {
    id: 'red',
    name: 'Red Rocket',
    rocketColor: '#EF4444',
    headCore: '#FFE4E6',
    trailColor: '#F97316',
    burstPrimary: '#EF4444',
    burstSecondary: '#FCA5A5',
  },
  {
    id: 'green',
    name: 'Green Rocket',
    rocketColor: '#22C55E',
    headCore: '#DCFCE7',
    trailColor: '#F59E0B',
    burstPrimary: '#22C55E',
    burstSecondary: '#86EFAC',
  },
  {
    id: 'blue',
    name: 'Blue Rocket',
    rocketColor: '#3B82F6',
    headCore: '#DBEAFE',
    trailColor: '#F59E0B',
    burstPrimary: '#3B82F6',
    burstSecondary: '#93C5FD',
  },
  {
    id: 'golden',
    name: 'Golden Rocket',
    rocketColor: '#FACC15',
    headCore: '#FEF9C3',
    trailColor: '#F59E0B',
    burstPrimary: '#F59E0B',
    burstSecondary: '#FDE047',
  },
  {
    id: 'pink',
    name: 'Pink Rocket',
    rocketColor: '#EC4899',
    headCore: '#FCE7F3',
    trailColor: '#F97316',
    burstPrimary: '#EC4899',
    burstSecondary: '#F9A8D4',
  },
  {
    id: 'purple',
    name: 'Purple Rocket',
    rocketColor: '#A855F7',
    headCore: '#F3E8FF',
    trailColor: '#F59E0B',
    burstPrimary: '#A855F7',
    burstSecondary: '#D8B4FE',
  },
] as const;

export interface DiwaliBurstSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  paletteId: DiwaliRocketPalette['id'];
  alpha: number;
  decay: number;
}

export interface DiwaliFlyingRocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  palette: DiwaliRocketPalette;
  headRadius: number;
  trail: { x: number; y: number }[];
}

export function computeDiwaliBurstParticleCount(density: number): number {
  const clamped = Math.min(24, Math.max(4, Math.round(density)));
  // Map admin density (6..22) cleanly to 12..24 burst particles per explosion
  const mapped = Math.round(12 + ((clamped - 6) / 16) * 12);
  return Math.min(24, Math.max(12, mapped));
}

export function createDiwaliRocketBurstParticles(
  originX: number,
  originY: number,
  palette: DiwaliRocketPalette,
  particleCount: number,
  sizeMode: FestivalParticleSize,
  speedMode: FestivalAnimationSpeed
): DiwaliBurstSpark[] {
  const count = Math.min(24, Math.max(12, Math.round(particleCount)));
  const sizeScale = sizeMode === 'small' ? 0.78 : 1.0;
  const speedScale = speedMode === 'slow' ? 0.78 : speedMode === 'fast' ? 1.25 : 1.0;
  const sparks: DiwaliBurstSpark[] = [];

  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * Math.PI * 2;
    const jitterAngle = baseAngle + (Math.random() - 0.5) * 0.28;
    // Two concentric velocity rings so the burst looks full yet compact (radius ~35px-65px)
    const ringFactor = i % 3 === 0 ? 0.65 : 1.0;
    const speed = (1.15 + Math.random() * 1.65) * ringFactor * speedScale * sizeScale;
    const isPrimary = i % 2 === 0;

    sparks.push({
      x: originX,
      y: originY,
      vx: Math.cos(jitterAngle) * speed,
      vy: Math.sin(jitterAngle) * speed,
      radius: (isPrimary ? 2.6 : 2.0) * sizeScale,
      color: isPrimary ? palette.burstPrimary : palette.burstSecondary,
      paletteId: palette.id,
      alpha: 1.0,
      decay: (0.015 + Math.random() * 0.01) * (speedMode === 'fast' ? 1.18 : speedMode === 'slow' ? 0.85 : 1.0),
    });
  }

  return sparks;
}

function getMotionClassForFestival(festivalId: FestivalId, variant: number): string {
  switch (festivalId) {
    case 'holi':
      return variant % 2 === 0 ? 'sf-pt-holi-puff' : 'sf-pt-holi-splash';
    case 'sharad_navratri':
      return variant % 3 === 0
        ? 'sf-pt-petal-drift'
        : variant % 3 === 1
        ? 'sf-pt-float-gentle'
        : 'sf-pt-garba-twirl';
    case 'dussehra':
      return variant % 3 === 0
        ? 'sf-pt-arrow-glide'
        : variant % 3 === 1
        ? 'sf-pt-twinkle'
        : 'sf-pt-petal-drift';
    case 'ganesh_chaturthi':
      return variant % 3 === 0
        ? 'sf-pt-petal-drift'
        : variant % 3 === 1
        ? 'sf-pt-float-gentle'
        : 'sf-pt-twinkle';
    case 'krishna_janmashtami':
      return variant % 3 === 0
        ? 'sf-pt-feather-sway'
        : variant % 3 === 1
        ? 'sf-pt-float-gentle'
        : 'sf-pt-petal-drift';
    case 'ram_navami':
      return variant % 3 === 0
        ? 'sf-pt-flag-flutter'
        : variant % 3 === 1
        ? 'sf-pt-twinkle'
        : 'sf-pt-float-gentle';
    case 'mahashivratri':
      return variant % 3 === 0
        ? 'sf-pt-rise-soft'
        : variant % 3 === 1
        ? 'sf-pt-leaf-drift'
        : 'sf-pt-shiv-orb';
    case 'makar_sankranti':
      return variant % 3 === 2 ? 'sf-pt-twinkle' : 'sf-pt-kite-glide';
    case 'raksha_bandhan':
      return variant % 3 === 0
        ? 'sf-pt-float-gentle'
        : variant % 3 === 1
        ? 'sf-pt-thread-wave'
        : 'sf-pt-petal-drift';
    case 'durga_puja':
      return variant % 3 === 0
        ? 'sf-pt-petal-drift'
        : variant % 3 === 1
        ? 'sf-pt-float-gentle'
        : 'sf-pt-twinkle';
    case 'dev_deepawali':
      return variant % 3 === 0
        ? 'sf-pt-diya-drift'
        : variant % 3 === 1
        ? 'sf-pt-rise-soft'
        : 'sf-pt-water-shimmer';
    case 'govardhan_puja':
      return variant % 3 === 0
        ? 'sf-pt-petal-drift'
        : variant % 3 === 1
        ? 'sf-pt-leaf-drift'
        : 'sf-pt-float-gentle';
    case 'republic_day':
      return variant % 3 === 1
        ? 'sf-pt-chakra-float'
        : variant % 3 === 0
        ? 'sf-pt-petal-drift'
        : 'sf-pt-twinkle';
    case 'independence_day':
      return variant % 3 === 0
        ? 'sf-pt-flag-flutter'
        : variant % 3 === 1
        ? 'sf-pt-petal-drift'
        : 'sf-pt-twinkle';
    default:
      return 'sf-pt-float-gentle';
  }
}

/* ============================================================================
 * DIWALI 2D ROCKET LAUNCH & COLOUR-MATCHED FIREWORK BURST CANVAS
 * ========================================================================== */
const DiwaliFireworksCanvas: React.FC<{
  intensity: FestivalParticleIntensity;
  sizeMode: FestivalParticleSize;
  speedMode: FestivalAnimationSpeed;
  density: number;
  animationEnabled: boolean;
  isDocumentHidden: boolean;
  isCompactViewport: boolean;
  isLowEndDevice: boolean;
}> = React.memo(({
  intensity,
  sizeMode,
  speedMode,
  density,
  animationEnabled,
  isDocumentHidden,
  isCompactViewport,
  isLowEndDevice,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPaletteIdxRef = useRef<number>(-1);

  const rawBurstCount = computeDiwaliBurstParticleCount(density);
  const burstParticleCount = isLowEndDevice
    ? Math.max(12, Math.min(16, Math.round(rawBurstCount * 0.78)))
    : isCompactViewport
    ? Math.max(12, Math.min(18, Math.round(rawBurstCount * 0.88)))
    : rawBurstCount;

  const maxSimultaneousRockets =
    intensity === 'low'
      ? 1
      : isLowEndDevice || isCompactViewport
      ? 2
      : intensity === 'high'
      ? 3
      : 2;

  const maxActiveSparks = isLowEndDevice ? 32 : isCompactViewport ? 42 : 64;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!animationEnabled || isDocumentHidden) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Respect OS reduced-motion setting
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return;

    let isCancelled = false;
    let width = window.innerWidth || 390;
    let height = window.innerHeight || 844;
    // Cap DPR on Android WebView / compact viewports to avoid 4x pixel fill bottlenecks
    const dpr = isLowEndDevice
      ? 1
      : isCompactViewport
      ? Math.min(window.devicePixelRatio || 1, 1.25)
      : Math.min(window.devicePixelRatio || 1, 1.5);

    const updateCanvasSize = () => {
      width = window.innerWidth || 390;
      height = window.innerHeight || 844;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize, { passive: true });

    // Detect active touch/scroll so scrolling gets priority frame budget on Android APK
    let scrollingUntil = 0;
    const handleScrollActivity = () => {
      scrollingUntil = performance.now() + 120;
    };
    window.addEventListener('scroll', handleScrollActivity, { passive: true });
    window.addEventListener('touchmove', handleScrollActivity, { passive: true });

    const rockets: DiwaliFlyingRocket[] = [];
    const sparks: DiwaliBurstSpark[] = [];

    const speedFactor =
      speedMode === 'slow' ? 0.75 : speedMode === 'fast' ? 1.3 : 1.0;

    const pickNextPalette = (): DiwaliRocketPalette => {
      let idx = Math.floor(Math.random() * DIWALI_ROCKET_PALETTES.length);
      if (idx === lastPaletteIdxRef.current) {
        idx = (idx + 1 + Math.floor(Math.random() * (DIWALI_ROCKET_PALETTES.length - 1))) % DIWALI_ROCKET_PALETTES.length;
      }
      lastPaletteIdxRef.current = idx;
      return DIWALI_ROCKET_PALETTES[idx];
    };

    const spawnRocket = () => {
      if (rockets.length >= maxSimultaneousRockets) return;
      if (sparks.length >= maxActiveSparks) return;
      const palette = pickNextPalette();
      // Launch from lower part of visible screen (76% to 90% height)
      const startX = width * (0.12 + Math.random() * 0.76);
      const startY = height * (0.76 + Math.random() * 0.14);
      // Burst at upper-mid screen (18% to 46% height)
      const targetY = height * (0.18 + Math.random() * 0.28);
      const horizontalDrift = (Math.random() - 0.5) * 0.7;
      const upwardSpeed = (3.6 + Math.random() * 1.1) * speedFactor;

      rockets.push({
        x: startX,
        y: startY,
        vx: horizontalDrift,
        vy: -upwardSpeed,
        targetY,
        palette,
        headRadius: sizeMode === 'small' ? 2.5 : 3.2,
        trail: [{ x: startX, y: startY }],
      });
    };

    // Launch first rocket right away so live preview & active screen show immediate motion
    spawnRocket();

    let nextSpawnTime = performance.now() + 700 / speedFactor;
    let lastFrameTime = 0;
    let rafId = 0;

    const getSpawnIntervalMs = () => {
      const baseMin = intensity === 'low' ? 1200 : intensity === 'high' ? 540 : 820;
      const baseRange = intensity === 'low' ? 750 : intensity === 'high' ? 480 : 620;
      const mobileMultiplier = isLowEndDevice ? 1.32 : isCompactViewport ? 1.18 : 1.0;
      return ((baseMin + Math.random() * baseRange) * mobileMultiplier) / speedFactor;
    };

    const renderFrame = (now: number) => {
      if (isCancelled) return;

      // Throttle frame rate slightly during active touch scrolling or on low-end devices to keep scrolling 60fps
      const isActivelyScrolling = now < scrollingUntil;
      const minFrameDelta = isActivelyScrolling ? 42 : isLowEndDevice ? 24 : 15;
      if (now - lastFrameTime < minFrameDelta) {
        rafId = window.requestAnimationFrame(renderFrame);
        return;
      }
      lastFrameTime = now;

      ctx.clearRect(0, 0, width, height);

      if (now >= nextSpawnTime && !isActivelyScrolling) {
        spawnRocket();
        nextSpawnTime = now + getSpawnIntervalMs();
      }

      const maxTrailLen = isLowEndDevice ? 9 : sizeMode === 'small' ? 11 : 14;
      const trailWidth = sizeMode === 'small' ? 1.9 : 2.5;

      // 1. Update & Draw Ascending Rockets + Lightweight Glowing Trails
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx;
        r.y += r.vy;
        r.vy *= 0.994;

        r.trail.push({ x: r.x, y: r.y });
        if (r.trail.length > maxTrailLen) {
          r.trail.shift();
        }

        // Draw segmented fading trail without per-frame gradient allocations
        if (r.trail.length >= 2) {
          ctx.lineCap = 'round';
          ctx.lineWidth = trailWidth;
          ctx.strokeStyle = r.palette.trailColor;
          ctx.globalAlpha = 0.55;
          ctx.beginPath();
          ctx.moveTo(r.trail[0].x, r.trail[0].y);
          for (let t = 1; t < r.trail.length; t++) {
            ctx.lineTo(r.trail[t].x, r.trail[t].y);
          }
          ctx.stroke();
        }

        // Draw glowing coloured rocket head using fast concentric circles (zero radialGradient/shadowBlur overhead)
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = r.palette.rocketColor;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.headRadius * 2.9, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.95;
        ctx.fillStyle = r.palette.rocketColor;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.headRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = r.palette.headCore;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.headRadius * 0.48, 0, Math.PI * 2);
        ctx.fill();

        // Check if rocket reached target burst height
        if (r.y <= r.targetY || Math.abs(r.vy) < 0.8) {
          const availableSlots = Math.max(8, maxActiveSparks - sparks.length);
          const countToSpawn = Math.min(burstParticleCount, availableSlots);
          const newSparks = createDiwaliRocketBurstParticles(
            r.x,
            r.y,
            r.palette,
            countToSpawn,
            sizeMode,
            speedMode
          );
          sparks.push(...newSparks);
          rockets.splice(i, 1);
        }
      }

      // 2. Update & Draw Colour-Matched Firework Burst Particles (Zero shadowBlur GPU stall)
      for (let j = sparks.length - 1; j >= 0; j--) {
        const sp = sparks[j];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vx *= 0.962;
        sp.vy = sp.vy * 0.962 + 0.032 * speedFactor;
        sp.alpha -= sp.decay;

        if (sp.alpha <= 0.03) {
          sparks.splice(j, 1);
          continue;
        }

        const clampedAlpha = Math.max(0, Math.min(1, sp.alpha));
        ctx.fillStyle = sp.color;

        // Fast outer glow halo circle (replaces expensive ctx.shadowBlur)
        ctx.globalAlpha = clampedAlpha * 0.26;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.radius * 2.0, 0, Math.PI * 2);
        ctx.fill();

        // Bright inner spark core
        ctx.globalAlpha = clampedAlpha;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateCanvasSize);
      window.removeEventListener('scroll', handleScrollActivity);
      window.removeEventListener('touchmove', handleScrollActivity);
    };
  }, [
    intensity,
    sizeMode,
    speedMode,
    burstParticleCount,
    maxSimultaneousRockets,
    maxActiveSparks,
    animationEnabled,
    isDocumentHidden,
    isCompactViewport,
    isLowEndDevice,
  ]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="festival-particles-diwali"
      data-particle-engine="diwali-2d-rockets"
      data-particle-count={burstParticleCount}
      data-particle-size={sizeMode}
      data-particle-intensity={intensity}
      data-particle-speed={speedMode}
      data-rocket-palettes={DIWALI_ROCKET_PALETTES.map((p) => p.id).join(',')}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
});

const FestivalOverlayEngineInner: React.FC<FestivalOverlayEngineProps> = ({
  festival,
  globalEnabled = true,
  currentScreen,
}) => {
  const [failedAssets, setFailedAssets] = useState<Record<string, boolean>>({});
  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(false);
  const [isCompactViewport, setIsCompactViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  const [isLowEndDevice] = useState<boolean>(() => {
    if (typeof navigator === 'undefined') return false;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4;
    return cores <= 4 || memory <= 3;
  });

  useEffect(() => {
    setFailedAssets((prev) => (Object.keys(prev).length === 0 ? prev : {}));
  }, [festival?.id, festival?.updated_at]);

  // Pause animations when tab/APK WebView is in background & adapt density on mobile screens
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      setIsDocumentHidden(document.hidden);
    };
    const handleResize = () => {
      setIsCompactViewport(window.innerWidth < 640);
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const markAssetFailed = (slotKey: string) => {
    setFailedAssets((prev) => (prev[slotKey] ? prev : { ...prev, [slotKey]: true }));
  };

  const particleSpeedMode: FestivalAnimationSpeed =
    festival?.particle_speed || festival?.animation_speed || 'normal';
  const particleSizeMode: FestivalParticleSize = festival?.particle_size || 'normal';
  const particleIntensityMode: FestivalParticleIntensity = festival?.particle_intensity || 'medium';
  const baseParticleDensity =
    typeof festival?.particle_density === 'number' && Number.isFinite(festival.particle_density)
      ? Math.min(24, Math.max(4, Math.round(festival.particle_density)))
      : 14;

  // Deterministic, festival-aware particle specs for the other 14 festivals
  const particles = useMemo<ParticleSpec[]>(() => {
    const festId: FestivalId = festival?.id || 'diwali';

    const speedFactor =
      particleSpeedMode === 'slow' ? 1.48 : particleSpeedMode === 'fast' ? 0.68 : 1.0;

    const intensityDensityScale =
      particleIntensityMode === 'low' ? 0.72 : particleIntensityMode === 'high' ? 1.22 : 1.0;

    const viewportScale = isLowEndDevice ? 0.65 : isCompactViewport ? 0.75 : 1.0;
    const maxCap = isLowEndDevice ? 10 : isCompactViewport ? 12 : 18;
    const totalCount = Math.min(
      maxCap,
      Math.max(4, Math.round(baseParticleDensity * intensityDensityScale * viewportScale))
    );

    const sizeScale = particleSizeMode === 'small' ? 0.76 : 1.0;

    const baseOpacity =
      particleIntensityMode === 'low' ? 0.68 : particleIntensityMode === 'high' ? 0.92 : 0.82;

    return Array.from({ length: totalCount }, (_, idx) => {
      const leftPct = 4 + ((idx * 19 + 9) % 92);
      const topPct = 11 + ((idx * 23 + 11) % 75);
      const rawDur = 5.8 + (idx % 5) * 1.25;
      const baseDur = rawDur * speedFactor;
      const delaySec = ((idx * 0.73) % 5.2).toFixed(2);
      const remBase = 0.84 + (idx % 3) * 0.14;

      return {
        id: idx,
        left: `${leftPct}%`,
        top: `${topPct}%`,
        delay: `${delaySec}s`,
        duration: `${baseDur.toFixed(2)}s`,
        sizeRem: Number((remBase * sizeScale).toFixed(2)),
        variant: idx % 6,
        motionClass: getMotionClassForFestival(festId, idx),
        opacityScale: baseOpacity,
      };
    });
  }, [
    festival?.id,
    particleSpeedMode,
    particleSizeMode,
    particleIntensityMode,
    baseParticleDensity,
    isCompactViewport,
    isLowEndDevice,
  ]);

  if (!globalEnabled || !festival || !festival.is_enabled) {
    return null;
  }

  const targetScreens = Array.isArray(festival.target_screens)
    ? festival.target_screens
    : ['home', 'vip', 'profile'];
  if (!targetScreens.includes(currentScreen)) {
    return null;
  }

  const sizeMultiplier =
    festival.decoration_size === 'small'
      ? 0.82
      : festival.decoration_size === 'large'
      ? 1.2
      : 1.0;

  const animDurationSec =
    festival.animation_speed === 'slow'
      ? 5.5
      : festival.animation_speed === 'fast'
      ? 2.2
      : 3.6;

  const animateClass = !festival.animation_enabled
    ? 'sf-fest-static'
    : isDocumentHidden
    ? 'sf-fest-animated sf-fest-paused'
    : 'sf-fest-animated';

  const customAssets = festival.custom_assets || {};

  const canUseCustom = (slot: keyof typeof customAssets) => {
    const url = customAssets[slot];
    return Boolean(url && url.trim().length > 0 && !failedAssets[slot]);
  };

  return (
    <div
      aria-hidden="true"
      style={{
        opacity: festival.opacity ?? 0.92,
        contain: 'layout style paint',
        transform: 'translateZ(0)',
      }}
      className={`sf-fest-overlay fixed inset-0 pointer-events-none z-40 overflow-hidden select-none ${animateClass}`}
    >
      <style>{`
        /* Prevent expensive offscreen CSS filter rasterization on Android WebView */
        .sf-fest-overlay .drop-shadow,
        .sf-fest-overlay .drop-shadow-md,
        .sf-fest-overlay .drop-shadow-lg {
          filter: none !important;
        }
        @keyframes sfFestFloat {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          50% { transform: translate3d(0, -10px, 0) rotate(3deg); }
        }
        @keyframes sfFestSway {
          0%, 100% { transform: rotate(-3deg) translate3d(0, 0, 0); }
          50% { transform: rotate(3deg) translate3d(0, 3px, 0); }
        }
        @keyframes sfFestPulseGlow {
          0%, 100% { opacity: 0.72; transform: scale(0.98); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        @keyframes sfFestFlame {
          0%, 100% { transform: scaleY(1) scaleX(1); opacity: 0.95; }
          50% { transform: scaleY(1.16) scaleX(0.92); opacity: 1; }
        }
        @keyframes sfFestSpinSlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* =========================================================
         * FESTIVAL-SPECIFIC FLOATING PARTICLE KEYFRAMES
         * ========================================================= */
        @keyframes sfHoliPuffDrift {
          0%, 100% { transform: translate3d(0, 0, 0) scale(0.88) rotate(0deg); opacity: 0.65; }
          50% { transform: translate3d(8px, -12px, 0) scale(1.12) rotate(12deg); opacity: 0.92; }
        }
        @keyframes sfHoliSplashBloom {
          0%, 100% { transform: translate3d(0, 4px, 0) scale(0.82); opacity: 0.58; }
          45% { transform: translate3d(-6px, -8px, 0) scale(1.14); opacity: 0.9; }
        }
        @keyframes sfPetalDrift {
          0%, 100% { transform: translate3d(-6px, -8px, 0) rotate(-14deg); }
          50% { transform: translate3d(8px, 10px, 0) rotate(18deg); }
        }
        @keyframes sfGarbaTwirl {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg) scale(0.92); }
          50% { transform: translate3d(0, -9px, 0) rotate(180deg) scale(1.06); }
        }
        @keyframes sfArrowGlide {
          0% { transform: translate3d(-14px, 12px, 0) rotate(-35deg); opacity: 0.25; }
          25% { opacity: 0.92; }
          75% { opacity: 0.92; }
          100% { transform: translate3d(16px, -16px, 0) rotate(-35deg); opacity: 0.2; }
        }
        @keyframes sfFeatherSway {
          0%, 100% { transform: translate3d(-5px, 0, 0) rotate(-16deg); }
          50% { transform: translate3d(6px, -9px, 0) rotate(14deg); }
        }
        @keyframes sfFlagFlutter {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-5deg) skewX(0deg); }
          25% { transform: translate3d(3px, -5px, 0) rotate(2deg) skewX(-5deg); }
          75% { transform: translate3d(-2px, -8px, 0) rotate(-2deg) skewX(4deg); }
        }
        @keyframes sfLeafDrift {
          0%, 100% { transform: translate3d(-7px, -5px, 0) rotate(-12deg); }
          50% { transform: translate3d(7px, 7px, 0) rotate(15deg); }
        }
        @keyframes sfShivOrbGlow {
          0%, 100% { transform: translate3d(0, 2px, 0) scale(0.88); opacity: 0.62; }
          50% { transform: translate3d(0, -10px, 0) scale(1.12); opacity: 0.96; }
        }
        @keyframes sfKiteGlide {
          0%, 100% { transform: translate3d(-9px, 5px, 0) rotate(-8deg); }
          50% { transform: translate3d(11px, -12px, 0) rotate(10deg); }
        }
        @keyframes sfThreadWave {
          0%, 100% { transform: translate3d(-4px, 0, 0) rotate(-6deg); }
          50% { transform: translate3d(5px, -8px, 0) rotate(8deg); }
        }
        @keyframes sfDiyaDrift {
          0%, 100% { transform: translate3d(-8px, 0, 0); }
          50% { transform: translate3d(8px, -6px, 0); }
        }
        @keyframes sfWaterShimmer {
          0%, 100% { transform: scaleX(0.85); opacity: 0.55; }
          50% { transform: scaleX(1.15); opacity: 0.92; }
        }
        @keyframes sfChakraFloat {
          0% { transform: translate3d(0, 0, 0) rotate(0deg); }
          50% { transform: translate3d(0, -8px, 0) rotate(180deg); }
          100% { transform: translate3d(0, 0, 0) rotate(360deg); }
        }
        @keyframes sfParticleRiseSoft {
          0% { transform: translate3d(0, 12px, 0) scale(0.85); opacity: 0.35; }
          50% { transform: translate3d(0, -8px, 0) scale(1.06); opacity: 0.92; }
          100% { transform: translate3d(0, -20px, 0) scale(0.8); opacity: 0.25; }
        }
        @keyframes sfParticleTwinkle {
          0%, 100% { transform: scale(0.78) rotate(0deg); opacity: 0.55; }
          50% { transform: scale(1.12) rotate(45deg); opacity: 0.98; }
        }

        .sf-fest-animated .sf-anim-float {
          animation: sfFestFloat ${animDurationSec}s ease-in-out infinite;
          will-change: transform;
        }
        .sf-fest-animated .sf-anim-sway {
          animation: sfFestSway ${animDurationSec * 1.1}s ease-in-out infinite;
          transform-origin: top center;
          will-change: transform;
        }
        .sf-fest-animated .sf-anim-glow {
          animation: sfFestPulseGlow ${animDurationSec}s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .sf-fest-animated .sf-anim-flame {
          animation: sfFestFlame ${(animDurationSec * 0.45).toFixed(2)}s ease-in-out infinite;
          transform-origin: bottom center;
          will-change: transform, opacity;
        }
        .sf-fest-animated .sf-anim-spin {
          animation: sfFestSpinSlow ${(animDurationSec * 5).toFixed(1)}s linear infinite;
          transform-origin: center center;
        }

        /* Festival Particle Motion Bindings */
        .sf-fest-animated .sf-pt-float-gentle {
          animation: sfFestFloat var(--sf-pt-dur, 6s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-holi-puff {
          animation: sfHoliPuffDrift var(--sf-pt-dur, 6s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform, opacity;
        }
        .sf-fest-animated .sf-pt-holi-splash {
          animation: sfHoliSplashBloom var(--sf-pt-dur, 5.5s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform, opacity;
        }
        .sf-fest-animated .sf-pt-petal-drift {
          animation: sfPetalDrift var(--sf-pt-dur, 6.2s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-garba-twirl {
          animation: sfGarbaTwirl var(--sf-pt-dur, 6.5s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-arrow-glide {
          animation: sfArrowGlide var(--sf-pt-dur, 5.4s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform, opacity;
        }
        .sf-fest-animated .sf-pt-feather-sway {
          animation: sfFeatherSway var(--sf-pt-dur, 6.4s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-flag-flutter {
          animation: sfFlagFlutter var(--sf-pt-dur, 5.2s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-leaf-drift {
          animation: sfLeafDrift var(--sf-pt-dur, 6.2s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-shiv-orb {
          animation: sfShivOrbGlow var(--sf-pt-dur, 5.6s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform, opacity;
        }
        .sf-fest-animated .sf-pt-kite-glide {
          animation: sfKiteGlide var(--sf-pt-dur, 6.6s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-thread-wave {
          animation: sfThreadWave var(--sf-pt-dur, 5.8s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-diya-drift {
          animation: sfDiyaDrift var(--sf-pt-dur, 6.2s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-water-shimmer {
          animation: sfWaterShimmer var(--sf-pt-dur, 4.8s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform, opacity;
        }
        .sf-fest-animated .sf-pt-chakra-float {
          animation: sfChakraFloat var(--sf-pt-dur, 8s) linear infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform;
        }
        .sf-fest-animated .sf-pt-rise-soft {
          animation: sfParticleRiseSoft var(--sf-pt-dur, 5.5s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform, opacity;
        }
        .sf-fest-animated .sf-pt-twinkle {
          animation: sfParticleTwinkle var(--sf-pt-dur, 4.6s) ease-in-out infinite;
          animation-delay: var(--sf-pt-delay, 0s);
          will-change: transform, opacity;
        }

        /* Pause all animations when browser tab or APK WebView is backgrounded */
        .sf-fest-paused *,
        .sf-fest-paused *::before,
        .sf-fest-paused *::after {
          animation-play-state: paused !important;
        }

        @media (prefers-reduced-motion: reduce) {
          .sf-fest-animated *,
          .sf-fest-animated *::before,
          .sf-fest-animated *::after {
            animation: none !important;
          }
        }
      `}</style>

      {/* 1. AMBIENT FESTIVAL LIGHTING GLOW LAYER */}
      {festival.glow_enabled && (
        <div className="absolute inset-0 pointer-events-none">
          <div
            style={{
              background: `radial-gradient(circle at 50% 0%, ${festival.primary_accent}29 0%, transparent 58%)`,
            }}
            className="absolute top-0 inset-x-0 h-56 sf-anim-glow"
          />
          <div
            style={{
              background: `radial-gradient(circle at 0% 0%, ${festival.primary_accent}33 0%, transparent 65%)`,
            }}
            className="absolute top-0 left-0 w-52 h-52"
          />
          <div
            style={{
              background: `radial-gradient(circle at 100% 0%, ${festival.secondary_accent}33 0%, transparent 65%)`,
            }}
            className="absolute top-0 right-0 w-52 h-52"
          />
          <div
            style={{
              background: `radial-gradient(circle at 0% 100%, ${festival.secondary_accent}26 0%, transparent 65%)`,
            }}
            className="absolute bottom-14 left-0 w-48 h-48"
          />
          <div
            style={{
              background: `radial-gradient(circle at 100% 100%, ${festival.primary_accent}26 0%, transparent 65%)`,
            }}
            className="absolute bottom-14 right-0 w-48 h-48"
          />
        </div>
      )}

      {/* 2. TOP GARLAND / TORAN / FESTIVE BORDER LAYER */}
      {festival.border_enabled && (
        <div className="absolute top-0 inset-x-0 flex justify-center overflow-hidden">
          <TopFestivalGarland
            festivalId={festival.id}
            primary={festival.primary_accent}
            secondary={festival.secondary_accent}
            sizeMultiplier={sizeMultiplier}
          />
        </div>
      )}

      {/* 3. FOUR CORNER ORNAMENTS LAYER (Supports Custom Uploaded Images with Built-in SVG Fallback) */}
      {festival.corners_enabled && (
        <>
          {/* Top-Left Corner */}
          <div
            style={{ transform: `scale(${sizeMultiplier})`, transformOrigin: 'top left' }}
            className="absolute top-12 left-1 sm:left-2"
          >
            {canUseCustom('top_left_url') ? (
              <img
                src={customAssets.top_left_url}
                alt=""
                onError={() => markAssetFailed('top_left_url')}
                className="w-20 h-20 sm:w-28 sm:h-28 object-contain drop-shadow-lg sf-anim-sway"
              />
            ) : (
              <FestivalCornerArtwork
                festivalId={festival.id}
                position="top-left"
                primary={festival.primary_accent}
                secondary={festival.secondary_accent}
              />
            )}
          </div>

          {/* Top-Right Corner */}
          <div
            style={{ transform: `scale(${sizeMultiplier})`, transformOrigin: 'top right' }}
            className="absolute top-12 right-1 sm:right-2"
          >
            {canUseCustom('top_right_url') ? (
              <img
                src={customAssets.top_right_url}
                alt=""
                onError={() => markAssetFailed('top_right_url')}
                className="w-20 h-20 sm:w-28 sm:h-28 object-contain drop-shadow-lg sf-anim-sway"
              />
            ) : (
              <FestivalCornerArtwork
                festivalId={festival.id}
                position="top-right"
                primary={festival.primary_accent}
                secondary={festival.secondary_accent}
              />
            )}
          </div>

          {/* Bottom-Left Corner (Positioned safely above BottomNav) */}
          <div
            style={{ transform: `scale(${sizeMultiplier})`, transformOrigin: 'bottom left' }}
            className="absolute bottom-16 left-1 sm:left-3"
          >
            {canUseCustom('bottom_left_url') ? (
              <img
                src={customAssets.bottom_left_url}
                alt=""
                onError={() => markAssetFailed('bottom_left_url')}
                className="w-20 h-20 sm:w-28 sm:h-28 object-contain drop-shadow-lg sf-anim-float"
              />
            ) : (
              <FestivalCornerArtwork
                festivalId={festival.id}
                position="bottom-left"
                primary={festival.primary_accent}
                secondary={festival.secondary_accent}
              />
            )}
          </div>

          {/* Bottom-Right Corner (Positioned safely above BottomNav) */}
          <div
            style={{ transform: `scale(${sizeMultiplier})`, transformOrigin: 'bottom right' }}
            className="absolute bottom-16 right-1 sm:right-3"
          >
            {canUseCustom('bottom_right_url') ? (
              <img
                src={customAssets.bottom_right_url}
                alt=""
                onError={() => markAssetFailed('bottom_right_url')}
                className="w-20 h-20 sm:w-28 sm:h-28 object-contain drop-shadow-lg sf-anim-float"
              />
            ) : (
              <FestivalCornerArtwork
                festivalId={festival.id}
                position="bottom-right"
                primary={festival.primary_accent}
                secondary={festival.secondary_accent}
              />
            )}
          </div>
        </>
      )}

      {/* 4. FLOATING FESTIVE PARTICLES LAYER */}
      {festival.floating_enabled && (
        festival.id === 'diwali' && !canUseCustom('floating_element_url') ? (
          <DiwaliFireworksCanvas
            intensity={particleIntensityMode}
            sizeMode={particleSizeMode}
            speedMode={particleSpeedMode}
            density={baseParticleDensity}
            animationEnabled={Boolean(festival.animation_enabled)}
            isDocumentHidden={isDocumentHidden}
            isCompactViewport={isCompactViewport}
            isLowEndDevice={isLowEndDevice}
          />
        ) : (
          <div
            data-testid={`festival-particles-${festival.id}`}
            data-particle-count={particles.length}
            data-particle-size={particleSizeMode}
            data-particle-intensity={particleIntensityMode}
            data-particle-speed={particleSpeedMode}
            className="absolute inset-0 pointer-events-none overflow-hidden"
          >
            {particles.map((pt) => (
              <div
                key={pt.id}
                style={
                  {
                    left: pt.left,
                    top: pt.top,
                    opacity: pt.opacityScale,
                    '--sf-pt-delay': pt.delay,
                    '--sf-pt-dur': pt.duration,
                  } as React.CSSProperties
                }
                className={`absolute ${pt.motionClass}`}
              >
                {canUseCustom('floating_element_url') ? (
                  <img
                    src={customAssets.floating_element_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => markAssetFailed('floating_element_url')}
                    style={{ width: `${pt.sizeRem * 1.15}rem`, height: `${pt.sizeRem * 1.15}rem` }}
                    className="object-contain opacity-85"
                  />
                ) : (
                  <FestivalFloatingParticle
                    festivalId={festival.id}
                    variant={pt.variant}
                    sizeRem={pt.sizeRem}
                    intensity={particleIntensityMode}
                    primary={festival.primary_accent}
                    secondary={festival.secondary_accent}
                  />
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* 5. TOP FESTIVE GREETING BANNER PILL LAYER */}
      {festival.banner_enabled && (
        <div className="absolute top-[58px] sm:top-[64px] inset-x-0 flex justify-center px-3">
          {canUseCustom('banner_image_url') ? (
            <div
              style={{ transform: `scale(${sizeMultiplier})`, transformOrigin: 'top center' }}
              className="max-w-xs sm:max-w-md overflow-hidden rounded-2xl shadow-xl"
            >
              <img
                src={customAssets.banner_image_url}
                alt={festival.banner_text}
                loading="lazy"
                decoding="async"
                onError={() => markAssetFailed('banner_image_url')}
                className="max-h-14 sm:max-h-16 w-auto object-contain mx-auto"
              />
            </div>
          ) : (
            <div
              style={{
                transform: `scale(${sizeMultiplier})`,
                transformOrigin: 'top center',
                borderColor: `${festival.primary_accent}66`,
                boxShadow: `0 6px 24px -4px ${festival.primary_accent}40`,
              }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#090E1C]/95 border text-center max-w-[90vw] sm:max-w-md"
            >
              <span className="text-sm sm:text-base shrink-0 sf-anim-glow">{festival.icon}</span>
              <div className="min-w-0 leading-tight">
                <p
                  style={{ color: festival.secondary_accent }}
                  className="text-[11px] sm:text-xs font-extrabold tracking-wide truncate"
                >
                  {festival.banner_text}
                </p>
                {festival.banner_subtitle && (
                  <p className="text-[9px] sm:text-[10px] text-slate-300/90 font-medium truncate max-w-[230px] sm:max-w-[330px]">
                    {festival.banner_subtitle}
                  </p>
                )}
              </div>
              <span className="text-sm sm:text-base shrink-0 sf-anim-glow">{festival.icon}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const FestivalOverlayEngine = React.memo(FestivalOverlayEngineInner);

/* ============================================================================
 * TOP GARLAND / TORAN ARTWORK (15 Festivals)
 * ========================================================================== */
const TopFestivalGarland: React.FC<{
  festivalId: FestivalId;
  primary: string;
  secondary: string;
  sizeMultiplier: number;
}> = ({ festivalId, primary, secondary, sizeMultiplier }) => {
  const heightPx = Math.round(44 * sizeMultiplier);
  const isPatriotic = festivalId === 'republic_day' || festivalId === 'independence_day';
  const isHoli = festivalId === 'holi';
  const isShivratri = festivalId === 'mahashivratri';

  return (
    <svg
      viewBox="0 0 1200 68"
      style={{ height: `${heightPx}px` }}
      className="w-full max-w-6xl overflow-visible drop-shadow-md"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`sf-toran-grad-${festivalId}`} x1="0%" y1="0%" x2="100%" y2="0%">
          {isPatriotic ? (
            <>
              <stop offset="0%" stopColor="#FF9933" />
              <stop offset="50%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#138808" />
            </>
          ) : isHoli ? (
            <>
              <stop offset="0%" stopColor="#EC4899" />
              <stop offset="33%" stopColor="#FACC15" />
              <stop offset="66%" stopColor="#22D3EE" />
              <stop offset="100%" stopColor="#A855F7" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={primary} />
              <stop offset="50%" stopColor={secondary} />
              <stop offset="100%" stopColor={primary} />
            </>
          )}
        </linearGradient>
      </defs>

      {/* Top gold/festive cord */}
      <line
        x1="0"
        y1="3"
        x2="1200"
        y2="3"
        stroke={`url(#sf-toran-grad-${festivalId})`}
        strokeWidth="4"
      />

      {/* Repeating Scallop Marigold / Leaf / Bunting Swags (Stationary Top Garland) */}
      {[0, 150, 300, 450, 600, 750, 900, 1050].map((x, idx) => (
        <g key={x}>
          {isPatriotic ? (
            <>
              <path
                d={`M ${x} 4 Q ${x + 75} 44 ${x + 150} 4`}
                fill="none"
                stroke={idx % 2 === 0 ? '#FF9933' : '#138808'}
                strokeWidth="3.5"
              />
              <path
                d={`M ${x + 10} 4 Q ${x + 75} 34 ${x + 140} 4`}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeOpacity="0.85"
              />
              <circle cx={x + 75} cy="25" r="7" fill="#FFFFFF" stroke="#000080" strokeWidth="1.8" />
              <circle cx={x + 75} cy="25" r="2" fill="#000080" />
            </>
          ) : isShivratri ? (
            <>
              <path
                d={`M ${x} 4 Q ${x + 75} 40 ${x + 150} 4`}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.5"
                strokeDasharray="6 4"
              />
              <circle cx={x + 38} cy="16" r="4.5" fill="#10B981" />
              <circle cx={x + 75} cy="24" r="5.5" fill="#F59E0B" />
              <circle cx={x + 112} cy="16" r="4.5" fill="#10B981" />
              <line x1={x + 75} y1="24" x2={x + 75} y2="42" stroke="#FBBF24" strokeWidth="1.5" />
              <path d={`M ${x + 69} 48 L ${x + 81} 48 L ${x + 78} 40 L ${x + 72} 40 Z`} fill="#FBBF24" />
              <circle cx={x + 75} cy="50" r="2" fill="#FEF08A" />
            </>
          ) : (
            <>
              <polygon
                points={`${x + 30},4 ${x + 36},18 ${x + 42},4`}
                fill="#15803D"
                opacity="0.9"
              />
              <polygon
                points={`${x + 70},4 ${x + 76},20 ${x + 82},4`}
                fill="#16A34A"
                opacity="0.9"
              />
              <polygon
                points={`${x + 110},4 ${x + 116},18 ${x + 122},4`}
                fill="#15803D"
                opacity="0.9"
              />
              <path
                d={`M ${x} 4 Q ${x + 75} 42 ${x + 150} 4`}
                fill="none"
                stroke={primary}
                strokeWidth="5"
                strokeDasharray="9 5"
                strokeLinecap="round"
              />
              <path
                d={`M ${x + 8} 4 Q ${x + 75} 32 ${x + 142} 4`}
                fill="none"
                stroke={secondary}
                strokeWidth="3.5"
                strokeDasharray="6 6"
                strokeLinecap="round"
              />
              <line x1={x + 75} y1="23" x2={x + 75} y2="44" stroke={secondary} strokeWidth="1.5" />
              <circle cx={x + 75} cy="46" r="4.5" fill={primary} />
              <circle cx={x + 75} cy="46" r="2" fill="#FFFBEB" />
            </>
          )}
        </g>
      ))}
    </svg>
  );
};

/* ============================================================================
 * 4-CORNER BESPOKE CULTURAL ARTWORK FOR ALL 15 FESTIVALS
 * ========================================================================== */
const FestivalCornerArtwork: React.FC<{
  festivalId: FestivalId;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  primary: string;
  secondary: string;
}> = ({ festivalId, position, primary }) => {
  const isRight = position === 'top-right' || position === 'bottom-right';
  const isTop = position === 'top-left' || position === 'top-right';
  const flipX = isRight ? 'scale(-1, 1)' : undefined;

  switch (festivalId) {
    case 'diwali':
    case 'dev_deepawali':
      return (
        <svg
          viewBox="0 0 110 110"
          className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg"
        >
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }}>
            {isTop ? (
              <g className="sf-anim-sway">
                <line x1="36" y1="0" x2="36" y2="24" stroke="#FDE047" strokeWidth="2" />
                <polygon
                  points="36,18 54,34 46,60 26,60 18,34"
                  fill={primary}
                  stroke="#FEF08A"
                  strokeWidth="2"
                />
                <polygon points="36,24 46,34 41,54 31,54 26,34" fill="#FEF08A" opacity="0.85" />
                <line x1="28" y1="60" x2="25" y2="82" stroke="#FDE047" strokeWidth="2" />
                <line x1="36" y1="60" x2="36" y2="88" stroke="#F97316" strokeWidth="2" />
                <line x1="44" y1="60" x2="47" y2="82" stroke="#FDE047" strokeWidth="2" />
                <circle cx="36" cy="40" r="18" fill="#FDE047" opacity="0.22" className="sf-anim-glow" />
              </g>
            ) : (
              <g className="sf-anim-float">
                {festivalId === 'dev_deepawali' && (
                  <g opacity="0.75">
                    <rect x="6" y="84" width="76" height="6" rx="2" fill="#D97706" />
                    <rect x="12" y="76" width="60" height="6" rx="2" fill="#F59E0B" />
                    <rect x="18" y="68" width="44" height="6" rx="2" fill="#FBBF24" />
                  </g>
                )}
                <circle cx="42" cy="76" r="24" fill="#EC4899" opacity="0.25" />
                <circle
                  cx="42"
                  cy="76"
                  r="19"
                  fill="none"
                  stroke="#FDE047"
                  strokeWidth="1.8"
                  strokeDasharray="4 3"
                />
                <path
                  d="M 16 68 Q 42 94 68 68 L 62 60 Q 42 66 22 60 Z"
                  fill="#B45309"
                  stroke="#FDE047"
                  strokeWidth="2"
                />
                <path d="M 22 62 Q 42 70 62 62" fill="none" stroke="#FEF08A" strokeWidth="2" />
                <g className="sf-anim-flame">
                  <path
                    d="M 42 32 C 50 44 52 56 42 62 C 32 56 34 44 42 32 Z"
                    fill="#F97316"
                  />
                  <path
                    d="M 42 39 C 47 47 47 55 42 60 C 37 55 37 47 42 39 Z"
                    fill="#FEF08A"
                  />
                </g>
                <circle cx="42" cy="48" r="20" fill="#FDE047" opacity="0.28" className="sf-anim-glow" />
              </g>
            )}
          </g>
        </svg>
      );

    case 'holi':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            <circle cx="28" cy={isTop ? '30' : '74'} r="18" fill="#EC4899" opacity="0.75" />
            <circle cx="48" cy={isTop ? '24' : '80'} r="14" fill="#FACC15" opacity="0.8" />
            <circle cx="24" cy={isTop ? '50' : '54'} r="13" fill="#22D3EE" opacity="0.75" />
            <circle cx="44" cy={isTop ? '44' : '62'} r="11" fill="#A855F7" opacity="0.8" />
            <circle cx="62" cy={isTop ? '36' : '72'} r="8" fill="#4ADE80" opacity="0.85" />
            <g transform={isTop ? 'rotate(35 36 36)' : 'rotate(-35 36 70)'}>
              <rect x="10" y="62" width="34" height="9" rx="3" fill="#F59E0B" stroke="#FEF08A" strokeWidth="1.5" />
              <polygon points="44,61 52,66.5 44,72" fill="#EC4899" />
            </g>
          </g>
        </svg>
      );

    case 'sharad_navratri':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            {isTop ? (
              <g>
                <line x1="14" y1="62" x2="66" y2="16" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
                <line x1="14" y1="62" x2="66" y2="16" stroke="#FDE047" strokeWidth="3" strokeDasharray="5 5" />
                <line x1="16" y1="16" x2="66" y2="62" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
                <line x1="16" y1="16" x2="66" y2="62" stroke="#FDE047" strokeWidth="3" strokeDasharray="5 5" />
                <circle cx="40" cy="39" r="7" fill="#F97316" stroke="#FEF08A" strokeWidth="2" />
              </g>
            ) : (
              <g>
                <ellipse cx="40" cy="78" rx="18" ry="14" fill="#D97706" stroke="#FDE047" strokeWidth="2" />
                <rect x="30" y="58" width="20" height="6" rx="2" fill="#F59E0B" />
                <path d="M 32 58 Q 20 48 22 62 Z" fill="#16A34A" />
                <path d="M 48 58 Q 60 48 58 62 Z" fill="#16A34A" />
                <ellipse cx="40" cy="50" rx="9" ry="11" fill="#92400E" stroke="#FDE047" strokeWidth="1.5" />
                <path d="M 36 74 L 44 74 M 40 70 L 40 78" stroke="#FEF08A" strokeWidth="2" />
              </g>
            )}
          </g>
        </svg>
      );

    case 'dussehra':
    case 'ram_navami':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            {festivalId === 'ram_navami' && isTop ? (
              <g className="sf-anim-sway">
                <line x1="20" y1="12" x2="20" y2="82" stroke="#FDE047" strokeWidth="3" strokeLinecap="round" />
                <polygon
                  points="20,14 78,26 56,36 76,46 20,54"
                  fill="#F97316"
                  stroke="#FDE047"
                  strokeWidth="1.8"
                />
                <circle cx="38" cy="34" r="6" fill="#FEF08A" />
              </g>
            ) : (
              <g>
                <path
                  d="M 22 20 Q 68 52 22 84"
                  fill="none"
                  stroke="#FBBF24"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
                <line x1="22" y1="20" x2="22" y2="84" stroke="#FEF08A" strokeWidth="1.8" />
                <line x1="14" y1="52" x2="72" y2="52" stroke="#F59E0B" strokeWidth="3" />
                <polygon points="72,52 60,45 63,52 60,59" fill="#FEF08A" />
                <circle cx="44" cy="52" r="18" fill="#F97316" opacity="0.2" className="sf-anim-glow" />
              </g>
            )}
          </g>
        </svg>
      );

    case 'ganesh_chaturthi':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            <circle cx="42" cy="54" r="24" fill="#FB923C" opacity="0.2" className="sf-anim-glow" />
            <polygon points="42,20 52,38 32,38" fill="#FBBF24" stroke="#FEF08A" strokeWidth="1.5" />
            <path
              d="M 32 44 Q 42 40 52 44 M 35 48 Q 42 45 49 48"
              fill="none"
              stroke="#EF4444"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M 42 44 C 42 64 38 74 52 74 C 58 74 58 66 53 65"
              fill="none"
              stroke="#F97316"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path d="M 22 66 C 14 76 16 84 22 84 C 28 84 30 76 22 66 Z" fill="#FEF08A" stroke="#F59E0B" strokeWidth="1.5" />
          </g>
        </svg>
      );

    case 'krishna_janmashtami':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            {isTop ? (
              <g className="sf-anim-sway">
                <line x1="40" y1="0" x2="40" y2="28" stroke="#FACC15" strokeWidth="2" />
                <ellipse cx="40" cy="48" rx="18" ry="15" fill="#B45309" stroke="#FDE047" strokeWidth="2" />
                <rect x="30" y="30" width="20" height="6" rx="3" fill="#D97706" stroke="#FDE047" strokeWidth="1.5" />
                <path d="M 32 30 Q 36 22 42 28 Q 48 22 50 30 Z" fill="#FFFBEB" />
              </g>
            ) : (
              <g>
                <ellipse
                  cx="44"
                  cy="44"
                  rx="16"
                  ry="22"
                  transform="rotate(-25 44 44)"
                  fill="#0D9488"
                  stroke="#FACC15"
                  strokeWidth="1.5"
                />
                <ellipse
                  cx="44"
                  cy="42"
                  rx="9"
                  ry="13"
                  transform="rotate(-25 44 42)"
                  fill="#38BDF8"
                />
                <ellipse
                  cx="44"
                  cy="41"
                  rx="5"
                  ry="7"
                  transform="rotate(-25 44 41)"
                  fill="#1E1B4B"
                />
                <rect
                  x="12"
                  y="64"
                  width="64"
                  height="7"
                  rx="3.5"
                  transform="rotate(-18 44 67)"
                  fill="#FACC15"
                  stroke="#FEF08A"
                  strokeWidth="1.5"
                />
              </g>
            )}
          </g>
        </svg>
      );

    case 'mahashivratri':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            <circle cx="42" cy="52" r="24" fill="#818CF8" opacity="0.22" className="sf-anim-glow" />
            <line x1="42" y1="22" x2="42" y2="88" stroke="#FBBF24" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M 42 18 L 37 30 L 42 26 L 47 30 Z" fill="#FEF08A" />
            <path
              d="M 26 26 C 24 44 36 48 42 46 C 48 48 60 44 58 26"
              fill="none"
              stroke="#FBBF24"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <polygon points="32,56 42,63 32,70" fill="#D97706" stroke="#FEF08A" strokeWidth="1.2" />
            <polygon points="52,56 42,63 52,70" fill="#D97706" stroke="#FEF08A" strokeWidth="1.2" />
            <path d="M 52 20 A 10 10 0 1 1 42 32 A 8 8 0 1 0 52 20 Z" fill="#F8FAFC" />
          </g>
        </svg>
      );

    case 'makar_sankranti':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            <circle cx="24" cy="26" r="11" fill="#FACC15" className="sf-anim-glow" />
            <g transform="rotate(14 48 52)">
              <polygon points="48,22 72,48 48,74 24,48" fill="#F97316" stroke="#FEF08A" strokeWidth="2" />
              <polygon points="48,22 72,48 48,48" fill="#EC4899" />
              <polygon points="48,48 24,48 48,74" fill="#06B6D4" />
              <line x1="48" y1="22" x2="48" y2="74" stroke="#FEF08A" strokeWidth="1.5" />
              <path d="M 24 48 Q 48 38 72 48" fill="none" stroke="#FEF08A" strokeWidth="1.5" />
              <polygon points="48,74 41,86 55,86" fill="#FACC15" />
            </g>
          </g>
        </svg>
      );

    case 'raksha_bandhan':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            <path
              d="M 6 26 Q 42 52 78 78"
              fill="none"
              stroke="#EF4444"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M 6 26 Q 42 52 78 78"
              fill="none"
              stroke="#FBBF24"
              strokeWidth="2.5"
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
            <circle cx="42" cy="52" r="18" fill="#F43F5E" stroke="#FDE047" strokeWidth="2.5" />
            <circle
              cx="42"
              cy="52"
              r="13"
              fill="none"
              stroke="#FFFBEB"
              strokeWidth="2.5"
              strokeDasharray="3 4"
            />
            <circle cx="42" cy="52" r="6" fill="#FBBF24" />
          </g>
        </svg>
      );

    case 'durga_puja':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            <circle cx="44" cy="54" r="24" fill="#E11D48" opacity="0.88" stroke="#FFFBEB" strokeWidth="2" />
            <circle
              cx="44"
              cy="54"
              r="19"
              fill="none"
              stroke="#FFFBEB"
              strokeWidth="1.8"
              strokeDasharray="4 3"
            />
            <circle cx="44" cy="43" r="3.5" fill="#FDE047" />
            <path d="M 28 53 Q 35 48 41 53 Q 35 56 28 53 Z" fill="#FFFBEB" />
            <circle cx="35" cy="52.5" r="1.8" fill="#0F172A" />
            <path d="M 47 53 Q 53 48 60 53 Q 53 56 47 53 Z" fill="#FFFBEB" />
            <circle cx="53" cy="52.5" r="1.8" fill="#0F172A" />
            <path d="M 34 65 Q 44 74 54 65" fill="none" stroke="#FDE047" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        </svg>
      );

    case 'govardhan_puja':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            <circle cx="44" cy="42" r="18" fill="#FBBF24" opacity="0.25" className="sf-anim-glow" />
            <path
              d="M 10 80 L 32 42 L 46 56 L 58 36 L 78 80 Z"
              fill="#059669"
              stroke="#FDE047"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M 24 62 Q 44 72 66 58"
              fill="none"
              stroke="#F59E0B"
              strokeWidth="3.5"
              strokeDasharray="4 3"
            />
            <path d="M 34 80 Q 44 88 54 80 Z" fill="#D97706" />
            <circle cx="44" cy="76" r="3.5" fill="#FEF08A" className="sf-anim-flame" />
          </g>
        </svg>
      );

    case 'republic_day':
    case 'independence_day':
      return (
        <svg viewBox="0 0 110 110" className="w-20 h-20 sm:w-28 sm:h-28 overflow-visible drop-shadow-lg">
          <g transform={flipX} style={{ transformOrigin: '55px 55px' }} className="sf-anim-float">
            <path
              d="M 8 24 Q 42 14 74 36"
              fill="none"
              stroke="#FF9933"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M 8 34 Q 42 24 74 46"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M 8 44 Q 42 34 74 56"
              fill="none"
              stroke="#138808"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <g className="sf-anim-spin" style={{ transformOrigin: '42px 38px' }}>
              <circle cx="42" cy="38" r="12" fill="#FFFFFF" stroke="#000080" strokeWidth="2.2" />
              <circle cx="42" cy="38" r="2.5" fill="#000080" />
              {[0, 30, 60, 90, 120, 150].map((deg) => (
                <line
                  key={deg}
                  x1="42"
                  y1="26"
                  x2="42"
                  y2="50"
                  stroke="#000080"
                  strokeWidth="1.1"
                  transform={`rotate(${deg} 42 38)`}
                />
              ))}
            </g>
          </g>
        </svg>
      );

    default:
      return null;
  }
};

/* ============================================================================
 * FLOATING PARTICLE ARTWORK FOR THE OTHER 14 FESTIVALS
 * ========================================================================== */
const FestivalFloatingParticle: React.FC<{
  festivalId: FestivalId;
  variant: number;
  sizeRem: number;
  intensity: FestivalParticleIntensity;
  primary: string;
  secondary: string;
}> = ({ festivalId, variant, sizeRem, primary, secondary }) => {
  const px = Math.max(11, Math.min(20, Math.round(sizeRem * 16)));

  switch (festivalId) {
    /* HOLI: Small colourful gulal particles, soft colour splashes & gently floating powder */
    case 'holi': {
      const holiColors = ['#EC4899', '#FACC15', '#22D3EE', '#A855F7', '#4ADE80', '#FB7185'];
      const c1 = holiColors[variant % holiColors.length];
      const c2 = holiColors[(variant + 2) % holiColors.length];
      if (variant % 2 === 0) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24">
            <circle cx="11" cy="12" r="6" fill={c1} opacity="0.72" />
            <circle cx="15" cy="9" r="4.5" fill={c2} opacity="0.68" />
            <circle cx="7" cy="8" r="2.2" fill={c1} opacity="0.85" />
            <circle cx="18" cy="16" r="2" fill={c2} opacity="0.85" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24">
          <path
            d="M12 5 C15 5 18 7.5 17.5 11 C17.8 14.5 14.8 17.5 11.5 17 C8 17.2 6 14 6.8 10.5 C7.2 7 9.2 5 12 5 Z"
            fill={c1}
            opacity="0.82"
          />
          <circle cx="19" cy="6" r="2" fill={c2} />
          <circle cx="5" cy="17" r="1.8" fill={c1} />
          <circle cx="18" cy="18" r="1.5" fill={c2} />
        </svg>
      );
    }

    /* SHARAD NAVRATRI: Small flower petals, glowing mini diyas & garba mirror particles */
    case 'sharad_navratri': {
      if (variant % 3 === 0) {
        const petalFill = variant % 2 === 0 ? '#F97316' : '#EF4444';
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <path d="M12 3 C17 8 17 16 12 21 C7 16 7 8 12 3 Z" fill={petalFill} stroke="#FDE047" strokeWidth="1" />
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <path d="M12 4 C14.5 7.5 14.5 11 12 13 C9.5 11 9.5 7.5 12 4 Z" fill="#FEF08A" />
            <path d="M5 13 Q12 21 19 13 Z" fill="#D97706" stroke="#FDE047" strokeWidth="1.2" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
          <polygon points="12,3 21,12 12,21 3,12" fill="#EF4444" stroke="#FDE047" strokeWidth="1.5" />
          <polygon points="12,7 17,12 12,17 7,12" fill="#FEF08A" />
        </svg>
      );
    }

    /* DUSSEHRA: Small glowing arrows moving gently, golden sparkles & victory particles */
    case 'dussehra': {
      if (variant % 3 === 0) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <line x1="4" y1="18" x2="19" y2="5" stroke="#FBBF24" strokeWidth="2.2" strokeLinecap="round" />
            <polygon points="20,4 13,5 17,9" fill="#FEF08A" />
            <line x1="4" y1="18" x2="8" y2="19" stroke="#EA580C" strokeWidth="1.6" />
            <line x1="4" y1="18" x2="5" y2="14" stroke="#EA580C" strokeWidth="1.6" />
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <path d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" fill="#FDE047" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24">
          <path d="M12 3 C16.5 7.5 16.5 16.5 12 21 C7.5 16.5 7.5 7.5 12 3 Z" fill="#F59E0B" />
          <circle cx="12" cy="12" r="2" fill="#FEF08A" />
        </svg>
      );
    }

    /* GANESH CHATURTHI: Small flower petals, modak-inspired elements & golden sparkles */
    case 'ganesh_chaturthi': {
      if (variant % 3 === 0) {
        const c = variant % 2 === 0 ? '#EF4444' : '#FB923C';
        return (
          <svg width={px} height={px} viewBox="0 0 24 24">
            <path d="M12 3 C17 7 18 15 12 20 C6 15 7 7 12 3 Z" fill={c} />
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <path
              d="M12 4 C14.5 9 19 13 18 17.5 C17 20 7 20 6 17.5 C5 13 9.5 9 12 4 Z"
              fill="#FFFBEB"
              stroke="#F59E0B"
              strokeWidth="1.4"
            />
            <line x1="12" y1="7" x2="12" y2="18" stroke="#FBBF24" strokeWidth="1" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24">
          <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="#FDE047" />
        </svg>
      );
    }

    /* KRISHNA JANMASHTAMI: Small peacock feathers, flute-inspired particles & tiny petals */
    case 'krishna_janmashtami': {
      if (variant % 3 === 0) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <ellipse cx="12" cy="11" rx="6" ry="8.5" fill="#0D9488" stroke="#FACC15" strokeWidth="1.2" />
            <ellipse cx="12" cy="10" rx="3.8" ry="5.2" fill="#38BDF8" />
            <ellipse cx="12" cy="9.5" rx="2" ry="2.8" fill="#1E1B4B" />
            <line x1="12" y1="19" x2="12" y2="23" stroke="#FACC15" strokeWidth="1.4" />
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <rect
              x="3"
              y="10"
              width="18"
              height="4"
              rx="2"
              transform="rotate(-20 12 12)"
              fill="#FACC15"
              stroke="#FEF08A"
              strokeWidth="1"
            />
            <circle cx="9" cy="6" r="1.5" fill="#38BDF8" />
            <circle cx="16" cy="17" r="1.5" fill="#FDE047" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24">
          <path d="M12 4 C16 8 16 16 12 20 C8 16 8 8 12 4 Z" fill="#FACC15" />
        </svg>
      );
    }

    /* RAM NAVAMI: Small saffron flags, subtle golden sparkles & gentle bow/arrow elements */
    case 'ram_navami': {
      if (variant % 3 === 0) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <line x1="5" y1="3" x2="5" y2="21" stroke="#FDE047" strokeWidth="1.8" strokeLinecap="round" />
            <polygon points="5,4 20,8 14,11.5 19,15 5,17" fill="#F97316" stroke="#FEF08A" strokeWidth="1" />
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24">
            <path d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" fill="#FBBF24" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
          <path d="M7 4 Q18 12 7 20" fill="none" stroke="#FBBF24" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" stroke="#FEF08A" strokeWidth="1.6" />
          <polygon points="20,12 16,9.5 16,14.5" fill="#F97316" />
        </svg>
      );
    }

    /* MAHASHIVRATRI: Small glowing trishul particles, bilva leaves & blue-purple glowing effects */
    case 'mahashivratri': {
      if (variant % 3 === 0) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <line x1="12" y1="4" x2="12" y2="21" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
            <path
              d="M6 7 C6 13 10 14 12 13 C14 14 18 13 18 7"
              fill="none"
              stroke="#FDE047"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <ellipse cx="12" cy="7.5" rx="3.2" ry="5" fill="#10B981" />
            <ellipse cx="7" cy="13" rx="4.2" ry="2.8" transform="rotate(-25 7 13)" fill="#059669" />
            <ellipse cx="17" cy="13" rx="4.2" ry="2.8" transform="rotate(25 17 13)" fill="#059669" />
            <line x1="12" y1="12" x2="12" y2="20" stroke="#34D399" strokeWidth="1.5" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="6.5" fill="#818CF8" opacity="0.45" />
          <circle cx="12" cy="12" r="3.5" fill="#C084FC" />
          <circle cx="12" cy="12" r="1.5" fill="#F8FAFC" />
        </svg>
      );
    }

    /* MAKAR SANKRANTI: Small colourful kites floating gently across the screen */
    case 'makar_sankranti': {
      const kiteColors = [
        { main: '#F97316', wing: '#EC4899' },
        { main: '#06B6D4', wing: '#FACC15' },
        { main: '#10B981', wing: '#F59E0B' },
        { main: '#A855F7', wing: '#38BDF8' },
      ];
      const kc = kiteColors[variant % kiteColors.length];
      if (variant % 3 === 2) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="5" fill="#FACC15" stroke="#FEF08A" strokeWidth="1.5" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
          <polygon points="12,2 20,10 12,18 4,10" fill={kc.main} stroke="#FEF08A" strokeWidth="1.1" />
          <polygon points="12,2 20,10 12,10" fill={kc.wing} />
          <polygon points="12,18 9,22 15,22" fill="#FEF08A" />
        </svg>
      );
    }

    /* RAKSHA BANDHAN: Small decorative rakhis, colourful threads & flower petals */
    case 'raksha_bandhan': {
      if (variant % 3 === 0) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <line x1="2" y1="12" x2="22" y2="12" stroke="#EF4444" strokeWidth="2" />
            <circle cx="12" cy="12" r="5.5" fill="#F43F5E" stroke="#FDE047" strokeWidth="1.5" />
            <circle cx="12" cy="12" r="2.2" fill="#FEF08A" />
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24">
            <path
              d="M3 14 Q8 6 12 12 T21 10"
              fill="none"
              stroke="#F43F5E"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M3 14 Q8 6 12 12 T21 10"
              fill="none"
              stroke="#FBBF24"
              strokeWidth="1.6"
              strokeDasharray="3 3"
              strokeLinecap="round"
            />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24">
          <path d="M12 4 C16.5 8 16.5 16 12 20 C7.5 16 7.5 8 12 4 Z" fill="#FB7185" />
        </svg>
      );
    }

    /* DURGA PUJA: Small red & white flower petals, dhak-inspired effects & golden sparkles */
    case 'durga_puja': {
      if (variant % 3 === 0) {
        const isWhiteShiuli = variant % 2 === 0;
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <path
              d="M12 3 C16.5 7.5 16.5 15.5 12 19.5 C7.5 15.5 7.5 7.5 12 3 Z"
              fill={isWhiteShiuli ? '#FFFBEB' : '#E11D48'}
              stroke={isWhiteShiuli ? '#F97316' : '#FDE047'}
              strokeWidth="1.1"
            />
            {isWhiteShiuli && <line x1="12" y1="18" x2="12" y2="22" stroke="#F97316" strokeWidth="2" />}
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <rect
              x="6"
              y="7"
              width="12"
              height="10"
              rx="3"
              fill="#B45309"
              stroke="#FEF08A"
              strokeWidth="1.4"
            />
            <line x1="9" y1="7" x2="9" y2="17" stroke="#FDE047" strokeWidth="1.1" />
            <line x1="15" y1="7" x2="15" y2="17" stroke="#FDE047" strokeWidth="1.1" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24">
          <path d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" fill="#FDE047" />
        </svg>
      );
    }

    /* DEV DEEPAWALI: Small floating diyas, warm golden light particles & glowing reflections */
    case 'dev_deepawali': {
      if (variant % 3 === 0) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <path d="M12 4 C14.2 7.5 14.2 10.5 12 12.5 C9.8 10.5 9.8 7.5 12 4 Z" fill="#FEF08A" />
            <path d="M5 12.5 Q12 19.5 19 12.5 Z" fill="#D97706" stroke="#FDE047" strokeWidth="1.2" />
            <line x1="4" y1="20" x2="20" y2="20" stroke="#FDE047" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="5.5" fill="#F59E0B" opacity="0.45" />
            <circle cx="12" cy="12" r="3" fill="#FEF08A" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24">
          <line x1="4" y1="10" x2="20" y2="10" stroke="#FDE047" strokeWidth="2" strokeLinecap="round" />
          <line x1="7" y1="14" x2="17" y2="14" stroke="#FB923C" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    }

    /* GOVARDHAN PUJA: Small flower petals, leaves & nature-inspired floating particles */
    case 'govardhan_puja': {
      if (variant % 3 === 0) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24">
            <path d="M12 4 C16.5 8 16.5 16 12 20 C7.5 16 7.5 8 12 4 Z" fill="#F59E0B" />
          </svg>
        );
      }
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <path
              d="M6 18 C6 9 12 4 19 4 C19 11 14 18 6 18 Z"
              fill="#10B981"
              stroke="#34D399"
              strokeWidth="1"
            />
            <line x1="6" y1="18" x2="16" y2="7" stroke="#A7F3D0" strokeWidth="1" />
          </svg>
        );
      }
      return (
        <svg width={px} height={px} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="4" fill="#FBBF24" />
          <circle cx="12" cy="12" r="1.8" fill="#FFFBEB" />
        </svg>
      );
    }

    /* REPUBLIC DAY: Small saffron, white & green particles with Ashoka Chakra elements */
    case 'republic_day': {
      if (variant % 3 === 1) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <circle cx="12" cy="12" r="7.5" fill="#FFFFFF" stroke="#000080" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2" fill="#000080" />
            <line x1="12" y1="4.5" x2="12" y2="19.5" stroke="#000080" strokeWidth="1" />
            <line x1="4.5" y1="12" x2="19.5" y2="12" stroke="#000080" strokeWidth="1" />
            <line x1="6.7" y1="6.7" x2="17.3" y2="17.3" stroke="#000080" strokeWidth="1" />
            <line x1="17.3" y1="6.7" x2="6.7" y2="17.3" stroke="#000080" strokeWidth="1" />
          </svg>
        );
      }
      const triColors = ['#FF9933', '#FFFFFF', '#138808'];
      const fill = triColors[variant % triColors.length];
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
          {variant % 2 === 0 ? (
            <path d="M12 3 C16 8 16 16 12 21 C8 16 8 8 12 3 Z" fill={fill} />
          ) : (
            <path d="M12 2 L14.4 9.6 L22 12 L14.4 14.4 L12 22 L9.6 14.4 L2 12 L9.6 9.6 Z" fill={fill} />
          )}
        </svg>
      );
    }

    /* INDEPENDENCE DAY: Small tricolour particles, gently floating flags & patriotic sparkles */
    case 'independence_day': {
      if (variant % 3 === 0) {
        return (
          <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
            <line x1="4" y1="3" x2="4" y2="21" stroke="#E2E8F0" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="5" y="4" width="14" height="3.2" fill="#FF9933" />
            <rect x="5" y="7.2" width="14" height="3.2" fill="#FFFFFF" />
            <rect x="5" y="10.4" width="14" height="3.2" fill="#138808" />
            <circle cx="12" cy="8.8" r="1.3" fill="#000080" />
          </svg>
        );
      }
      const triColors = ['#FF9933', '#FFFFFF', '#138808'];
      const fill = triColors[variant % triColors.length];
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
          {variant % 3 === 1 ? (
            <circle cx="12" cy="12" r="4.5" fill={fill} />
          ) : (
            <path d="M12 2 L14.4 9.6 L22 12 L14.4 14.4 L12 22 L9.6 14.4 L2 12 L9.6 9.6 Z" fill={fill} />
          )}
        </svg>
      );
    }

    default: {
      const fill = variant % 2 === 0 ? primary : secondary;
      return (
        <svg width={px} height={px} viewBox="0 0 24 24" className="drop-shadow">
          <circle cx="12" cy="12" r="4.5" fill={fill} />
        </svg>
      );
    }
  }
};
