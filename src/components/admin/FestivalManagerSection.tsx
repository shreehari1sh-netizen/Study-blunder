import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Eye,
  Sliders,
  Calendar,
  Upload,
  Trash2,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  Search,
  Clock,
  Power,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';
import { api } from '../../api.ts';
import {
  isoToIstDatetimeLocal,
  istDatetimeLocalToIso,
  formatIstScheduleLabel,
  getDefaultFestivalConfig,
  FESTIVAL_PARTICLE_DESCRIPTIONS,
  type FestivalDecorationConfig,
  type FestivalTargetScreen,
  type FestivalAnimationSpeed,
  type FestivalDecorationSize,
  type FestivalParticleIntensity,
  type FestivalParticleSize,
  type FestivalCustomAssets,
  type AdminFestivalManagerResponse,
} from '../../constants/festivals.ts';
import { FestivalOverlayEngine } from '../FestivalOverlayEngine.tsx';

interface FestivalManagerSectionProps {
  onShowToast: (text: string, type?: 'success' | 'error') => void;
  onRefreshPublicData?: () => void;
}

const ASSET_SLOTS: {
  key: keyof FestivalCustomAssets;
  label: string;
  hint: string;
}[] = [
  {
    key: 'banner_image_url',
    label: 'Top Greeting Banner Image',
    hint: 'Optional custom banner graphic (replaces default greeting pill)',
  },
  {
    key: 'top_left_url',
    label: 'Top-Left Corner Decoration',
    hint: 'Optional custom corner ornament (PNG / SVG / WebP)',
  },
  {
    key: 'top_right_url',
    label: 'Top-Right Corner Decoration',
    hint: 'Optional custom corner ornament (PNG / SVG / WebP)',
  },
  {
    key: 'bottom_left_url',
    label: 'Bottom-Left Corner Decoration',
    hint: 'Optional custom corner ornament above bottom nav',
  },
  {
    key: 'bottom_right_url',
    label: 'Bottom-Right Corner Decoration',
    hint: 'Optional custom corner ornament above bottom nav',
  },
  {
    key: 'floating_element_url',
    label: 'Floating Particle Icon',
    hint: 'Optional custom floating motif across screen',
  },
];

export const FestivalManagerSection: React.FC<FestivalManagerSectionProps> = ({
  onShowToast,
  onRefreshPublicData,
}) => {
  const [managerState, setManagerState] = useState<AdminFestivalManagerResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'scheduled' | 'custom'>('all');

  // Busy states
  const [togglingMaster, setTogglingMaster] = useState<boolean>(false);
  const [togglingFestivalId, setTogglingFestivalId] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  // Replacement Confirmation Modal State (When activating Festival B while Festival A is active)
  const [replaceConfirmation, setReplaceConfirmation] = useState<{
    currentActive: FestivalDecorationConfig;
    targetFestival: FestivalDecorationConfig;
  } | null>(null);

  // Configuration & Asset Upload Modal State
  const [editingFestival, setEditingFestival] = useState<FestivalDecorationConfig | null>(null);
  const [startIstInput, setStartIstInput] = useState<string>('');
  const [endIstInput, setEndIstInput] = useState<string>('');
  const [configError, setConfigError] = useState<string | null>(null);

  // Isolated Admin Preview State (Only visible to the admin session)
  const [previewFestival, setPreviewFestival] = useState<FestivalDecorationConfig | null>(null);
  const [previewScreen, setPreviewScreen] = useState<FestivalTargetScreen>('home');

  const loadFestivalManager = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const data = await api.getAdminFestivals();
      setManagerState(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load Festival Decoration Manager';
      setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFestivalManager();
    // Periodically refresh admin schedule status every 20 seconds
    const interval = setInterval(() => {
      loadFestivalManager(true);
    }, 20_000);
    return () => clearInterval(interval);
  }, [loadFestivalManager]);

  // Derive live preview directly so editingFestival changes reflect immediately without extra state updates
  const activePreviewFestival: FestivalDecorationConfig | null =
    previewFestival && editingFestival && previewFestival.id === editingFestival.id
      ? { ...editingFestival, is_enabled: true }
      : previewFestival;

  const handleToggleGlobalMaster = async () => {
    if (!managerState || togglingMaster) return;
    const nextEnabled = !managerState.global_enabled;
    setTogglingMaster(true);
    try {
      const res = await api.toggleFestivalGlobalMaster(nextEnabled);
      setManagerState(res.state);
      onShowToast(res.message, 'success');
      onRefreshPublicData?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle global festival master switch';
      onShowToast(msg, 'error');
    } finally {
      setTogglingMaster(false);
    }
  };

  const handleRequestToggleFestival = async (
    festival: FestivalDecorationConfig,
    nextEnabled: boolean,
    forceReplace = false
  ) => {
    if (togglingFestivalId) return;
    setTogglingFestivalId(festival.id);
    try {
      const res = await api.toggleFestival(festival.id, nextEnabled, forceReplace);
      if (res.requires_confirmation && res.current_active && res.target_festival) {
        setReplaceConfirmation({
          currentActive: res.current_active,
          targetFestival: res.target_festival,
        });
        return;
      }
      if (res.state) {
        setManagerState(res.state);
      }
      setReplaceConfirmation(null);
      onShowToast(res.message || `${festival.name} updated`, 'success');
      onRefreshPublicData?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update festival status';
      onShowToast(msg, 'error');
    } finally {
      setTogglingFestivalId(null);
    }
  };

  const handleOpenConfigModal = (festival: FestivalDecorationConfig) => {
    setConfigError(null);
    setEditingFestival({
      ...festival,
      target_screens: [...(festival.target_screens || ['home', 'vip', 'profile'])],
      custom_assets: { ...(festival.custom_assets || {}) },
    });
    setStartIstInput(isoToIstDatetimeLocal(festival.start_at));
    setEndIstInput(isoToIstDatetimeLocal(festival.end_at));
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFestival || savingConfig) return;
    setConfigError(null);

    const parsedStartIso = startIstInput.trim() ? istDatetimeLocalToIso(startIstInput.trim()) : null;
    const parsedEndIso = endIstInput.trim() ? istDatetimeLocalToIso(endIstInput.trim()) : null;

    if (startIstInput.trim() && !parsedStartIso) {
      setConfigError('Please enter a valid Start Date & Time (IST).');
      return;
    }
    if (endIstInput.trim() && !parsedEndIso) {
      setConfigError('Please enter a valid End Date & Time (IST).');
      return;
    }
    if (parsedStartIso && parsedEndIso && new Date(parsedEndIso).getTime() <= new Date(parsedStartIso).getTime()) {
      setConfigError('End Date & Time must be after Start Date & Time.');
      return;
    }
    if (!editingFestival.target_screens || editingFestival.target_screens.length === 0) {
      setConfigError('Please select at least one target screen (Home, VIP, or Profile).');
      return;
    }

    setSavingConfig(true);
    try {
      const res = await api.updateFestivalConfig(editingFestival.id, {
        ...editingFestival,
        start_at: parsedStartIso,
        end_at: parsedEndIso,
      });
      setManagerState(res.state);
      setEditingFestival(null);
      onShowToast(res.message || `${res.festival.name} configuration saved`, 'success');
      onRefreshPublicData?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save festival configuration';
      setConfigError(msg);
      onShowToast(msg, 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleResetToDefault = async (festival: FestivalDecorationConfig) => {
    if (resettingId) return;
    setResettingId(festival.id);
    try {
      const res = await api.resetFestivalConfig(festival.id);
      setManagerState(res.state);
      if (editingFestival?.id === festival.id) {
        setEditingFestival({
          ...res.festival,
          target_screens: [...res.festival.target_screens],
          custom_assets: { ...res.festival.custom_assets },
        });
        setStartIstInput('');
        setEndIstInput('');
      }
      onShowToast(res.message || `${festival.name} reset to default`, 'success');
      onRefreshPublicData?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset festival settings';
      onShowToast(msg, 'error');
    } finally {
      setResettingId(null);
    }
  };

  const handleResetParticleDefault = () => {
    if (!editingFestival) return;
    const def = getDefaultFestivalConfig(editingFestival.id);
    setEditingFestival({
      ...editingFestival,
      floating_enabled: def.floating_enabled,
      animation_enabled: def.animation_enabled,
      particle_intensity: def.particle_intensity,
      particle_size: def.particle_size,
      particle_speed: def.particle_speed,
      particle_density: def.particle_density,
    });
    onShowToast(
      `${editingFestival.name} floating particle animation reset to default settings.`,
      'success'
    );
  };

  const handleUploadCustomAsset = (
    e: React.ChangeEvent<HTMLInputElement>,
    slotKey: keyof FestivalCustomAssets
  ) => {
    const file = e.target.files?.[0];
    if (!file || !editingFestival) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      onShowToast('Unsupported file format. Please upload PNG, SVG, WebP, or JPG.', 'error');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      onShowToast('File size exceeds the 5MB maximum limit.', 'error');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      setUploadingSlot(slotKey);
      try {
        const prefix = `fest_${editingFestival.id}_${slotKey}`;
        const res = await api.uploadAsset(reader.result, file.type, prefix);
        setEditingFestival((prev) =>
          prev
            ? {
                ...prev,
                custom_assets: {
                  ...prev.custom_assets,
                  [slotKey]: res.url,
                },
              }
            : null
        );
        onShowToast('Custom decoration asset uploaded! Click "Save Configuration" to apply.', 'success');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to upload decoration asset';
        onShowToast(msg, 'error');
      } finally {
        setUploadingSlot(null);
        e.target.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleToggleTargetScreen = (screen: FestivalTargetScreen) => {
    if (!editingFestival) return;
    const current = editingFestival.target_screens || [];
    const exists = current.includes(screen);
    const next = exists ? current.filter((s) => s !== screen) : [...current, screen];
    setEditingFestival({
      ...editingFestival,
      target_screens: next,
    });
  };

  const festivals = managerState?.festivals || [];
  const globalEnabled = managerState?.global_enabled !== false;
  const activeFestival = managerState?.active_festival || null;

  const filteredFestivals = festivals.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      f.name.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q) ||
      f.banner_text.toLowerCase().includes(q) ||
      f.tagline.toLowerCase().includes(q);
    if (!matchesSearch) return false;

    if (statusFilter === 'active') return f.is_enabled;
    if (statusFilter === 'scheduled') return Boolean(f.start_at || f.end_at);
    if (statusFilter === 'custom') {
      return Object.values(f.custom_assets || {}).some((v) => Boolean(v && v.trim()));
    }
    return true;
  });

  return (
    <div className="space-y-5 relative">
      {/* ISOLATED ADMIN PREVIEW OVERLAY & FLOATING PREVIEW CONTROLLER */}
      {activePreviewFestival && (
        <>
          <FestivalOverlayEngine
            festival={activePreviewFestival}
            globalEnabled={true}
            currentScreen={previewScreen}
            isPreview={true}
          />
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[94vw] max-w-xl bg-[#090E1C]/95 backdrop-blur-xl border border-[#FF2525]/50 rounded-2xl p-3 shadow-2xl shadow-[#FF2525]/25 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl shrink-0">{activePreviewFestival.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/40">
                    Admin Preview Only
                  </span>
                  <span className="text-xs font-extrabold text-white truncate">
                    {activePreviewFestival.name}
                  </span>
                </div>
                <p className="text-[10px] text-[#929292] truncate">
                  Live students do not see this preview until you activate the festival.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center bg-[#141414]/90 border border-[#454545] rounded-xl p-0.5 text-[10px] font-bold">
                {(['home', 'vip', 'profile'] as FestivalTargetScreen[]).map((scr) => (
                  <button
                    key={scr}
                    type="button"
                    onClick={() => setPreviewScreen(scr)}
                    className={`px-2 py-1 rounded-lg uppercase transition-colors ${
                      previewScreen === scr
                        ? 'bg-[#FF2525] text-white'
                        : 'text-[#929292] hover:text-[#F5F5F5]'
                    }`}
                  >
                    {scr}
                  </button>
                ))}
              </div>

              {! (festivals.find((f) => f.id === activePreviewFestival.id)?.is_enabled) && (
                <button
                  type="button"
                  onClick={() => {
                    const target = festivals.find((f) => f.id === activePreviewFestival.id) || activePreviewFestival;
                    setPreviewFestival(null);
                    handleRequestToggleFestival(target, true, false);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-[#FF2525] hover:bg-[#FF2525] text-white text-[11px] font-extrabold flex items-center gap-1 shadow-md"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Activate Live</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setPreviewFestival(null)}
                className="px-2.5 py-1.5 rounded-xl bg-[#FF2525]/90 hover:bg-[#FF2525] text-white text-[11px] font-extrabold flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                <span>Exit Preview</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* SECTION HEADER & GLOBAL MASTER SWITCH CARD */}
      <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Sparkles className="w-5 h-5 text-[#FF762E]" />
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Festival Decoration Manager
              </h2>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#FF762E]/15 text-[#FF762E] border border-[#FF762E]/50">
                15 Cultural & National Themes
              </span>
            </div>
            <p className="text-xs text-[#929292]">
              Control, preview, customize, and schedule non-intrusive festive overlays across Home, VIP, and Profile screens without altering the core STUDY BLUNDER layout.
            </p>
          </div>

          {/* GLOBAL MASTER SWITCH */}
          <div
            className={`flex items-center justify-between sm:justify-end gap-3 px-4 py-3 rounded-2xl border transition-colors shrink-0 ${
              globalEnabled
                ? 'bg-[#1D1D1D]/30 border-[#C5C5C5]/60'
                : 'bg-[#FF2525]/15 border-[#FF2525]/55'
            }`}
          >
            <div>
              <p className="text-xs font-extrabold text-white flex items-center gap-1.5">
                <Power className={`w-3.5 h-3.5 ${globalEnabled ? 'text-[#F5F5F5]' : 'text-[#FF2525]'}`} />
                <span>Festival Decorations – {globalEnabled ? 'ON' : 'OFF'}</span>
              </p>
              <p className="text-[10px] text-[#929292]">
                {globalEnabled
                  ? 'Master switch is enabled'
                  : 'All decorations globally hidden'}
              </p>
            </div>
            <button
              type="button"
              disabled={togglingMaster || loading}
              onClick={handleToggleGlobalMaster}
              aria-label="Toggle Global Festival Decorations"
              className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                globalEnabled ? 'bg-[#FF2525]' : 'bg-[#2A2A2A]'
              } ${togglingMaster ? 'opacity-60' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition duration-200 ease-in-out ${
                  globalEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* CURRENT ACTIVE FESTIVAL STATUS BANNER */}
        <div
          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            !globalEnabled
              ? 'bg-[#FF2525]/15 border-[#FF2525]/55 text-[#FF2525]'
              : activeFestival
              ? 'bg-gradient-to-r from-amber-950/40 via-[#C90000] to-[#C90000] border-[#FF762E]/50'
              : 'bg-[#141414] border-[#454545]/80'
          }`}
        >
          {!globalEnabled ? (
            <div className="flex items-center gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0" />
              <span>
                <strong>Global Master Switch is OFF.</strong> No festival decorations are being shown to users. Saved configurations and schedules remain intact.
              </span>
            </div>
          ) : activeFestival ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#FF762E]/15 border border-[#FF762E]/50 flex items-center justify-center text-xl shrink-0">
                  {activeFestival.icon}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF2525]/20 text-[#F5F5F5] border border-[#C5C5C5]/60">
                      Currently Active ({managerState?.active_source === 'schedule' ? 'Scheduled IST' : 'Manual'})
                    </span>
                    <span className="text-sm font-extrabold text-white">
                      {activeFestival.name} {activeFestival.icon}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#C5C5C5] truncate mt-0.5">
                    Banner: <span className="text-[#FF762E] font-semibold">“{activeFestival.banner_text}”</span> • Screens:{' '}
                    <span className="uppercase font-bold text-[#FF2525]">
                      {activeFestival.target_screens.join(', ')}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewFestival(activeFestival)}
                  className="px-3 py-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] text-xs font-bold flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-[#FF2525]" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  disabled={togglingFestivalId === activeFestival.id}
                  onClick={() => handleRequestToggleFestival(activeFestival, false)}
                  className="px-3 py-1.5 rounded-xl bg-[#FF2525]/90 hover:bg-[#FF2525] text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Turn OFF</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full gap-2 text-xs text-[#929292]">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-[#F5F5F5] shrink-0" />
                <span>
                  <strong>No festival decoration is currently active.</strong> The STUDY BLUNDER website & APK are displaying their clean default UI.
                </span>
              </div>
              <span className="text-[10px] text-[#929292] font-mono shrink-0 hidden sm:inline">
                Timezone: Asia/Kolkata (IST)
              </span>
            </div>
          )}
        </div>

        {/* SEARCH & FILTER BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#929292] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 15 festivals by name or greeting..."
              className="w-full bg-[#141414] border border-[#454545] rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-[#929292]/60 focus:outline-none focus:border-[#FF2525]/50"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: `All (${festivals.length})` },
                { id: 'active', label: `Active (${festivals.filter((f) => f.is_enabled).length})` },
                {
                  id: 'scheduled',
                  label: `Scheduled (${festivals.filter((f) => Boolean(f.start_at || f.end_at)).length})`,
                },
                {
                  id: 'custom',
                  label: `Custom Assets (${
                    festivals.filter((f) => Object.values(f.custom_assets || {}).some(Boolean)).length
                  })`,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-[#FF2525] text-white'
                    : 'bg-[#141414] text-[#929292] hover:text-[#F5F5F5] border border-[#454545]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ERROR OR LOADING STATE */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadFestivalManager()}
            className="px-3 py-1 rounded-lg bg-[#FF2525]/15 hover:bg-rose-800 text-white font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-2xl bg-[#1D1D1D] border border-[#454545]/80 p-4 animate-pulse"
            />
          ))}
        </div>
      ) : (
        /* 15 FESTIVALS GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredFestivals.map((fest) => {
            const isActive = fest.is_enabled;
            const hasSchedule = Boolean(fest.start_at || fest.end_at);
            const customAssetCount = Object.values(fest.custom_assets || {}).filter(Boolean).length;
            const isToggling = togglingFestivalId === fest.id;
            const isPreviewing = previewFestival?.id === fest.id;

            return (
              <div
                key={fest.id}
                style={{
                  borderColor: isActive ? `${fest.primary_accent}88` : undefined,
                  boxShadow: isActive ? `0 8px 30px -10px ${fest.primary_accent}35` : undefined,
                }}
                className={`rounded-2xl bg-[#1D1D1D] border transition-all p-4 flex flex-col justify-between gap-3.5 ${
                  isActive ? 'border-[#FF2525] bg-gradient-to-b from-[#1D1D1D] to-[#141414]' : 'border-[#454545]/90'
                }`}
              >
                {/* Top Row: Icon, Name, Status Badge & ON/OFF Switch */}
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        style={{
                          backgroundColor: `${fest.primary_accent}1F`,
                          borderColor: `${fest.primary_accent}4D`,
                        }}
                        className="w-11 h-11 rounded-2xl border flex items-center justify-center text-2xl shrink-0 shadow-inner"
                      >
                        {fest.icon}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-extrabold text-white truncate flex items-center gap-1.5">
                          <span className="truncate">{fest.name}</span>
                        </h3>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          {isActive ? (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#FF2525]/20 text-[#F5F5F5] border border-[#C5C5C5]/60">
                              {globalEnabled ? '● ACTIVE' : '● ENABLED (MASTER OFF)'}
                            </span>
                          ) : fest.manual_off_override ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF762E]/20 text-[#FF762E] border border-[#FF762E]/50">
                              MANUAL OFF
                            </span>
                          ) : hasSchedule ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                              SCHEDULED
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1D1D1D] text-[#929292]">
                              INACTIVE
                            </span>
                          )}

                          {customAssetCount > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FF2525]/20 text-[#FF2525] border border-[#FF2525]/30">
                              {customAssetCount} Custom Asset{customAssetCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Individual Festival ON/OFF Toggle */}
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => handleRequestToggleFestival(fest, !isActive, false)}
                      title={isActive ? `Turn OFF ${fest.name}` : `Activate ${fest.name}`}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                        isActive ? 'bg-[#FF2525]' : 'bg-[#2A2A2A] hover:bg-slate-600'
                      } ${isToggling ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                          isActive ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Description & Greeting */}
                  <p className="text-[11px] text-[#929292] line-clamp-2 leading-relaxed">
                    {fest.tagline}
                  </p>

                  <div className="p-2.5 rounded-xl bg-[#141414] border border-[#454545]/80 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#929292] font-semibold">Banner:</span>
                      <span
                        style={{ color: fest.secondary_accent }}
                        className="font-bold truncate max-w-[180px]"
                      >
                        {fest.banner_enabled ? fest.banner_text : 'Hidden'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#929292] font-semibold">Screens:</span>
                      <span className="text-[#F5F5F5] font-bold uppercase text-[10px]">
                        {fest.target_screens.join(' • ')}
                      </span>
                    </div>
                    {hasSchedule && (
                      <div className="pt-1 border-t border-[#454545]/80 space-y-0.5 text-[10px]">
                        {fest.start_at && (
                          <div className="flex items-center justify-between text-[#FF2525]">
                            <span>Starts:</span>
                            <span className="font-mono">{formatIstScheduleLabel(fest.start_at)}</span>
                          </div>
                        )}
                        {fest.end_at && (
                          <div className="flex items-center justify-between text-[#FF762E]">
                            <span>Ends:</span>
                            <span className="font-mono">{formatIstScheduleLabel(fest.end_at)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons: Preview & Configure */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewFestival(isPreviewing ? null : { ...fest, is_enabled: true })
                    }
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition-colors ${
                      isPreviewing
                        ? 'bg-[#FF2525] border-[#FF2525]/50 text-white'
                        : 'bg-[#141414] hover:bg-[#1D1D1D] border-[#454545]/80 text-[#F5F5F5]'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5 text-[#FF2525]" />
                    <span>{isPreviewing ? 'Previewing' : 'Preview'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenConfigModal(fest)}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] border border-[#454545] text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Sliders className="w-3.5 h-3.5 text-[#FF762E]" />
                    <span>Configure</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============================================================================
       * MODAL 1: SINGLE ACTIVE FESTIVAL REPLACEMENT CONFIRMATION
       * ========================================================================== */}
      {replaceConfirmation && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1D1D1D] border border-[#FF762E]/50 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-[#FF762E]" />
                <h3 className="text-sm font-extrabold text-white">
                  Replace Currently Active Festival?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReplaceConfirmation(null)}
                className="text-[#929292] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#141414] border border-[#454545] space-y-2.5 text-xs">
              <p className="text-[#F5F5F5] leading-relaxed">
                Only one festival decoration can be active at a time.{' '}
                <strong className="text-[#FF762E]">
                  {replaceConfirmation.currentActive.name} {replaceConfirmation.currentActive.icon}
                </strong>{' '}
                is currently active.
              </p>
              <p className="text-[#C5C5C5] leading-relaxed">
                Activating{' '}
                <strong className="text-[#F5F5F5]">
                  {replaceConfirmation.targetFestival.name} {replaceConfirmation.targetFestival.icon}
                </strong>{' '}
                will automatically deactivate{' '}
                <strong>{replaceConfirmation.currentActive.name}</strong> across all student devices.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setReplaceConfirmation(null)}
                className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(togglingFestivalId)}
                onClick={() =>
                  handleRequestToggleFestival(replaceConfirmation.targetFestival, true, true)
                }
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-lg"
              >
                <Check className="w-4 h-4" />
                <span>
                  Activate {replaceConfirmation.targetFestival.name} {replaceConfirmation.targetFestival.icon}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================
       * MODAL 2: FESTIVAL CUSTOMIZATION, IST SCHEDULING & ASSET UPLOAD MODAL
       * ========================================================================== */}
      {editingFestival && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#1D1D1D] border border-[#454545] rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl my-auto">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#454545] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-2xl">{editingFestival.icon}</span>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-extrabold text-white truncate">
                    Configure {editingFestival.name}
                  </h3>
                  <p className="text-[11px] text-[#929292] truncate">{editingFestival.tagline}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewFestival({
                      ...editingFestival,
                      is_enabled: true,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-[#FF2525]/20 hover:bg-[#FF2525]/30 border border-[#FF2525]/40 text-[#FF2525] text-xs font-bold flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Live Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingFestival(null)}
                  className="p-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#C5C5C5]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveConfig} className="p-5 space-y-5 overflow-y-auto text-xs flex-1">
              {configError && (
                <div className="p-3 rounded-xl bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#FF2525] shrink-0" />
                  <span>{configError}</span>
                </div>
              )}

              {/* 1. GREETING BANNER TEXT & SUBTITLE */}
              <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF762E]" />
                    <span>1. Festive Greeting Banner</span>
                  </h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingFestival.banner_enabled}
                      onChange={(e) =>
                        setEditingFestival({ ...editingFestival, banner_enabled: e.target.checked })
                      }
                      className="rounded border-[#454545] accent-[#FF2525] focus:ring-[#FF2525]/40"
                    />
                    <span className="text-[#C5C5C5] font-bold">Show Greeting Banner</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#929292] mb-1">
                      Greeting Title (Max 100 chars)
                    </label>
                    <input
                      type="text"
                      maxLength={100}
                      value={editingFestival.banner_text}
                      onChange={(e) =>
                        setEditingFestival({ ...editingFestival, banner_text: e.target.value })
                      }
                      className="w-full bg-[#1D1D1D] border border-[#454545] rounded-xl px-3 py-2 text-white font-semibold"
                      placeholder="e.g. Happy Diwali"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#929292] mb-1">
                      Optional Greeting Subtitle (Max 180 chars)
                    </label>
                    <input
                      type="text"
                      maxLength={180}
                      value={editingFestival.banner_subtitle}
                      onChange={(e) =>
                        setEditingFestival({ ...editingFestival, banner_subtitle: e.target.value })
                      }
                      className="w-full bg-[#1D1D1D] border border-[#454545] rounded-xl px-3 py-2 text-white"
                      placeholder="Optional festive wish for students"
                    />
                  </div>
                </div>
              </div>

              {/* 2. DECORATION LAYER TOGGLES & TARGET SCREENS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-2.5">
                  <h4 className="font-extrabold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#FF2525]" />
                    <span>2. Decoration Layers</span>
                  </h4>
                  {(
                    [
                      { key: 'border_enabled', label: 'Top Garland / Toran Border' },
                      { key: 'corners_enabled', label: '4 Corner Cultural Ornaments' },
                      { key: 'floating_enabled', label: 'Floating Festive Particles' },
                      { key: 'glow_enabled', label: 'Ambient Radial Lighting Glow' },
                      { key: 'animation_enabled', label: 'Smooth GPU Motion Animations' },
                    ] as const
                  ).map((layer) => (
                    <label
                      key={layer.key}
                      className="flex items-center justify-between py-1 cursor-pointer"
                    >
                      <span className="text-[#C5C5C5] font-medium">{layer.label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(editingFestival[layer.key])}
                        onChange={(e) =>
                          setEditingFestival({
                            ...editingFestival,
                            [layer.key]: e.target.checked,
                          })
                        }
                        className="rounded border-[#454545] accent-[#FF2525] focus:ring-[#FF2525]/40"
                      />
                    </label>
                  ))}
                </div>

                {/* Target Screens & Intensity */}
                <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
                  <h4 className="font-extrabold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[#F5F5F5]" />
                    <span>3. Target Screens & Intensity</span>
                  </h4>

                  <div>
                    <p className="text-[11px] text-[#929292] font-semibold mb-1.5">
                      Display Decoration On:
                    </p>
                    <div className="flex items-center gap-2">
                      {(['home', 'vip', 'profile'] as FestivalTargetScreen[]).map((scr) => {
                        const checked = editingFestival.target_screens.includes(scr);
                        return (
                          <button
                            key={scr}
                            type="button"
                            onClick={() => handleToggleTargetScreen(scr)}
                            className={`flex-1 py-1.5 px-2.5 rounded-xl font-bold uppercase text-[11px] border transition-colors ${
                              checked
                                ? 'bg-[#FF2525]/30 border-[#FF2525]/50 text-white'
                                : 'bg-[#1D1D1D] border-[#454545] text-[#929292]'
                            }`}
                          >
                            {checked ? '✓ ' : ''}
                            {scr}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold text-[#929292] mb-1">
                        Animation Speed
                      </label>
                      <select
                        value={editingFestival.animation_speed}
                        onChange={(e) =>
                          setEditingFestival({
                            ...editingFestival,
                            animation_speed: e.target.value as FestivalAnimationSpeed,
                          })
                        }
                        className="w-full bg-[#1D1D1D] border border-[#454545] rounded-xl px-2.5 py-1.5 text-white font-semibold"
                      >
                        <option value="slow">Slow & Gentle</option>
                        <option value="normal">Normal</option>
                        <option value="fast">Lively / Fast</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#929292] mb-1">
                        Ornament Size
                      </label>
                      <select
                        value={editingFestival.decoration_size}
                        onChange={(e) =>
                          setEditingFestival({
                            ...editingFestival,
                            decoration_size: e.target.value as FestivalDecorationSize,
                          })
                        }
                        className="w-full bg-[#1D1D1D] border border-[#454545] rounded-xl px-2.5 py-1.5 text-white font-semibold"
                      >
                        <option value="small">Compact (Small)</option>
                        <option value="medium">Balanced (Medium)</option>
                        <option value="large">Grand (Large)</option>
                      </select>
                    </div>
                  </div>

                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-[#929292] mb-1">
                        <span>Decoration Opacity</span>
                        <span className="text-[#FF762E]">{Math.round(editingFestival.opacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.25"
                        max="1"
                        step="0.05"
                        value={editingFestival.opacity}
                        onChange={(e) =>
                          setEditingFestival({
                            ...editingFestival,
                            opacity: Number(e.target.value),
                          })
                        }
                        className="w-full accent-[#FF2525]"
                      />
                    </div>
                  </div>
                </div>

              {/* 3B. FLOATING FESTIVAL PARTICLES (FESTIVAL-SPECIFIC ANIMATION CONFIGURATION) */}
              <div className="p-4 rounded-2xl bg-[#141414] border border-[#FF762E]/50 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Sparkles className="w-3.5 h-3.5 text-[#FF762E]" />
                      <h4 className="font-extrabold text-white uppercase tracking-wider text-[11px]">
                        Floating Festival Particles ({editingFestival.name} {editingFestival.icon})
                      </h4>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          editingFestival.floating_enabled && editingFestival.animation_enabled
                            ? 'bg-[#FF2525]/20 text-[#F5F5F5] border-[#C5C5C5]/60'
                            : 'bg-[#1D1D1D] text-[#929292] border-[#454545]'
                        }`}
                      >
                        {editingFestival.floating_enabled && editingFestival.animation_enabled
                          ? 'Animation Enabled'
                          : 'Animation Disabled'}
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-200/90 mt-1">
                      {FESTIVAL_PARTICLE_DESCRIPTIONS[editingFestival.id]}
                    </p>
                  </div>

                  {/* Enable / Disable Floating Festival Particle Animation */}
                  <label className="flex items-center gap-2 cursor-pointer shrink-0 bg-[#1D1D1D] px-3 py-1.5 rounded-xl border border-[#454545]">
                    <input
                      type="checkbox"
                      checked={Boolean(editingFestival.floating_enabled && editingFestival.animation_enabled)}
                      onChange={(e) =>
                        setEditingFestival({
                          ...editingFestival,
                          floating_enabled: e.target.checked,
                          ...(e.target.checked ? { animation_enabled: true } : {}),
                        })
                      }
                      className="rounded border-[#454545] text-[#FF762E] focus:ring-amber-500"
                    />
                    <span className="text-[#F5F5F5] font-bold text-[11px]">
                      Enable Floating Animation
                    </span>
                  </label>
                </div>

                {/* Controls Grid: Intensity, Size, Speed, Density */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Animation Intensity: Low / Medium / High */}
                  <div className="p-2.5 rounded-xl bg-[#1D1D1D] border border-[#454545] space-y-1.5">
                    <label className="block text-[10px] font-bold text-[#929292]">
                      Animation Intensity
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['low', 'medium', 'high'] as FestivalParticleIntensity[]).map((lvl) => {
                        const active = (editingFestival.particle_intensity || 'medium') === lvl;
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() =>
                              setEditingFestival({
                                ...editingFestival,
                                particle_intensity: lvl,
                              })
                            }
                            className={`py-1.5 px-2 rounded-lg font-extrabold uppercase text-[10px] border transition-colors ${
                              active
                                ? 'bg-[#FF762E]/25 border-[#FF762E]/50 text-amber-200'
                                : 'bg-[#141414] border-[#454545] text-[#929292] hover:text-[#F5F5F5]'
                            }`}
                          >
                            {lvl}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Particle Size: Small / Normal */}
                  <div className="p-2.5 rounded-xl bg-[#1D1D1D] border border-[#454545] space-y-1.5">
                    <label className="block text-[10px] font-bold text-[#929292]">
                      Particle Size
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['small', 'normal'] as FestivalParticleSize[]).map((sz) => {
                        const active = (editingFestival.particle_size || 'normal') === sz;
                        return (
                          <button
                            key={sz}
                            type="button"
                            onClick={() =>
                              setEditingFestival({
                                ...editingFestival,
                                particle_size: sz,
                              })
                            }
                            className={`py-1.5 px-2 rounded-lg font-extrabold uppercase text-[10px] border transition-colors ${
                              active
                                ? 'bg-[#FF2525]/30 border-[#FF2525]/50 text-[#FF2525]'
                                : 'bg-[#141414] border-[#454545] text-[#929292] hover:text-[#F5F5F5]'
                            }`}
                          >
                            {sz}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Animation Speed: Slow / Normal / Fast */}
                  <div className="p-2.5 rounded-xl bg-[#1D1D1D] border border-[#454545] space-y-1.5">
                    <label className="block text-[10px] font-bold text-[#929292]">
                      Animation Speed
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['slow', 'normal', 'fast'] as FestivalAnimationSpeed[]).map((spd) => {
                        const active =
                          (editingFestival.particle_speed || editingFestival.animation_speed || 'normal') ===
                          spd;
                        return (
                          <button
                            key={spd}
                            type="button"
                            onClick={() =>
                              setEditingFestival({
                                ...editingFestival,
                                particle_speed: spd,
                              })
                            }
                            className={`py-1.5 px-2 rounded-lg font-extrabold uppercase text-[10px] border transition-colors ${
                              active
                                ? 'bg-[#FF2525]/25 border-[#C5C5C5]/60 text-[#F5F5F5]'
                                : 'bg-[#141414] border-[#454545] text-[#929292] hover:text-[#F5F5F5]'
                            }`}
                          >
                            {spd}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Particle Density Slider + Live Preview & Reset Particle Default Buttons */}
                <div className="p-3 rounded-xl bg-[#1D1D1D] border border-[#454545] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#929292]">
                      <span>Particle Density (Lightweight Screen Balance)</span>
                      <span className="text-[#FF762E] font-mono">
                        {editingFestival.particle_density ?? 14} Particles
                      </span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="22"
                      step="1"
                      value={editingFestival.particle_density ?? 14}
                      onChange={(e) =>
                        setEditingFestival({
                          ...editingFestival,
                          particle_density: Number(e.target.value),
                        })
                      }
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewFestival({
                          ...editingFestival,
                          is_enabled: true,
                          floating_enabled: true,
                          animation_enabled: true,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-[#FF2525]/25 hover:bg-[#FF2525]/40 border border-[#FF2525]/50 text-[#FF2525] text-[11px] font-bold flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5 text-[#FF2525]" />
                      <span>Live Preview</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleResetParticleDefault}
                      className="px-3 py-1.5 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] border border-[#454545] text-[#F5F5F5] text-[11px] font-bold flex items-center gap-1.5"
                      title="Reset floating particle animation settings to this festival's default"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#FF762E]" />
                      <span>Reset Particle Default</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. AUTOMATIC IST SCHEDULING */}
              <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-extrabold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[#FF2525]" />
                      <span>4. Optional Automatic Schedule (IST – Asia/Kolkata)</span>
                    </h4>
                    <p className="text-[10px] text-[#929292] mt-0.5">
                      Automatically activates at Start Date/Time and deactivates at End Date/Time on the server without needing an admin logged in.
                    </p>
                  </div>
                  {(startIstInput || endIstInput) && (
                    <button
                      type="button"
                      onClick={() => {
                        setStartIstInput('');
                        setEndIstInput('');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#C5C5C5] text-[10px] font-bold"
                    >
                      Clear Schedule
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#929292] mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#FF2525]" />
                      <span>Start Date & Time (IST)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={startIstInput}
                      onChange={(e) => setStartIstInput(e.target.value)}
                      className="w-full bg-[#1D1D1D] border border-[#454545] rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#929292] mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#FF762E]" />
                      <span>End Date & Time (IST)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={endIstInput}
                      onChange={(e) => setEndIstInput(e.target.value)}
                      className="w-full bg-[#1D1D1D] border border-[#454545] rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* 5. CUSTOM DECORATION ASSET UPLOADS (WITH DEFAULT ARTWORK FALLBACK) */}
              <div className="p-4 rounded-2xl bg-[#141414] border border-[#454545] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-extrabold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-[#FF2525]" />
                      <span>5. Custom Festival Assets (Optional)</span>
                    </h4>
                    <p className="text-[10px] text-[#929292] mt-0.5">
                      Each festival already includes built-in multi-layered SVG artwork. Upload custom PNG, SVG, WebP, or JPG (up to 5MB) to override specific slots.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ASSET_SLOTS.map((slot) => {
                    const currentUrl = editingFestival.custom_assets?.[slot.key];
                    const isUploading = uploadingSlot === slot.key;

                    return (
                      <div
                        key={slot.key}
                        className="p-3 rounded-xl bg-[#1D1D1D] border border-[#454545] flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-white text-[11px] truncate">{slot.label}</p>
                            <p className="text-[10px] text-[#929292] line-clamp-1">{slot.hint}</p>
                          </div>
                          {currentUrl && (
                            <img
                              src={currentUrl}
                              alt={slot.label}
                              className="w-9 h-9 rounded-lg object-contain bg-[#141414] border border-[#454545] p-0.5 shrink-0"
                            />
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 pt-1">
                          <label className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors">
                            <Upload className="w-3 h-3 text-[#FF2525]" />
                            <span>
                              {isUploading
                                ? 'Uploading...'
                                : currentUrl
                                ? 'Replace Image'
                                : 'Upload Image'}
                            </span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                              disabled={isUploading}
                              onChange={(e) => handleUploadCustomAsset(e, slot.key)}
                              className="hidden"
                            />
                          </label>

                          {currentUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingFestival({
                                  ...editingFestival,
                                  custom_assets: {
                                    ...editingFestival.custom_assets,
                                    [slot.key]: undefined,
                                  },
                                })
                              }
                              className="p-1.5 rounded-lg bg-[#FF2525]/15 hover:bg-[#FF2525]/15 border border-[#FF2525]/55 text-[#FF2525]"
                              title="Remove custom image and restore default SVG artwork"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#454545]">
                <button
                  type="button"
                  disabled={resettingId === editingFestival.id || savingConfig}
                  onClick={() => handleResetToDefault(editingFestival)}
                  className="px-3 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#C5C5C5] text-xs font-bold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#FF762E]" />
                  <span>Reset to Default</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={savingConfig}
                    onClick={() => setEditingFestival(null)}
                    className="px-3.5 py-2 rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] text-[#F5F5F5] text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingConfig || Boolean(uploadingSlot)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF2525] to-[#C90000] hover:from-[#FF2525] hover:to-[#C90000] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg"
                  >
                    <Check className="w-4 h-4" />
                    <span>{savingConfig ? 'Saving...' : 'Save Configuration'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
