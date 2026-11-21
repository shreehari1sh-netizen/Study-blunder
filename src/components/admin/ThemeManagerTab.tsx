import React, { useState, useEffect } from 'react';
import { Palette, Check, Sparkles, Loader2, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../api.ts';
import { APP_THEME_PRESETS, getThemePresetDefinition } from '../../constants/themes.ts';
import type { AdminSettings, AppThemePreset } from '../../types.ts';

interface ThemeManagerTabProps {
  settings: AdminSettings | null;
  onSettingsUpdated: (updated: AdminSettings) => void;
}

export const ThemeManagerTab: React.FC<ThemeManagerTabProps> = ({
  settings,
  onSettingsUpdated,
}) => {
  const savedPreset: AppThemePreset = (settings?.app_theme_preset as AppThemePreset) || 'red';
  const [selectedPreset, setSelectedPreset] = useState<AppThemePreset>(savedPreset);
  const [savingPreset, setSavingPreset] = useState<AppThemePreset | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setSelectedPreset(savedPreset);
  }, [savedPreset]);

  const handleApplyTheme = async (presetId: AppThemePreset) => {
    if (savingPreset) return;
    setSavingPreset(presetId);
    setFeedback(null);
    setSelectedPreset(presetId);

    // Instant live preview on document root
    document.documentElement.setAttribute('data-app-theme', presetId);

    try {
      const def = getThemePresetDefinition(presetId);
      const saved = await api.saveAdminSettings({
        app_theme_preset: presetId,
        theme_primary: def.darkVars.primary,
        theme_secondary: def.darkVars.secondary,
        theme_background: def.darkVars.bg,
        theme_text: def.darkVars.text,
        theme_button: def.darkVars.button,
      });
      onSettingsUpdated(saved);
      setFeedback({
        type: 'success',
        text: `Theme changed to "${def.name}" and saved permanently for all students!`,
      });
    } catch (err: unknown) {
      // Revert live preview if server rejected
      document.documentElement.setAttribute('data-app-theme', savedPreset);
      setSelectedPreset(savedPreset);
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save selected theme.',
      });
    } finally {
      setSavingPreset(null);
    }
  };

  const activeDef = getThemePresetDefinition(savedPreset);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="ra-panel-red ra-corners rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#1D1D1D] border border-[#FF2525]/55 flex items-center justify-center text-[#FF2525] shrink-0">
            <Palette className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
              APP APPEARANCE CONTROL
            </p>
            <h2 className="font-display text-lg sm:text-xl font-black text-[#F5F5F5] uppercase tracking-tight">
              Theme Manager
            </h2>
            <p className="text-xs text-[#C5C5C5] mt-0.5">
              Choose from 5 official themes. Changes save permanently to the database and sync live to the Student APK.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="px-3 py-2 rounded-xl bg-[#090909]/85 border border-[#454545] flex items-center gap-2">
            <span
              className="w-3.5 h-3.5 rounded-full border border-white/30 shrink-0"
              style={{ backgroundColor: activeDef.swatches.accent }}
            />
            <span className="font-mono-tech text-[11px] font-bold text-[#F5F5F5] uppercase">
              ACTIVE: {activeDef.name}
            </span>
          </div>

          {savedPreset !== 'red' && (
            <button
              type="button"
              disabled={Boolean(savingPreset)}
              onClick={() => handleApplyTheme('red')}
              className="min-h-[42px] px-3.5 rounded-xl ra-btn-secondary text-xs font-display font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#FF2525]" />
              <span>Reset to Red</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-xl px-4 py-3 border text-xs font-semibold flex items-center gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-[#FF2525]/12 border-[#FF2525]/55 text-[#F5F5F5]'
              : 'bg-red-950/60 border-red-500/60 text-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#FF2525] shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 5 Official Theme Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {APP_THEME_PRESETS.map((theme) => {
          const isActive = savedPreset === theme.id;
          const isSavingThis = savingPreset === theme.id;

          return (
            <div
              key={theme.id}
              className={`rounded-2xl border p-4 flex flex-col justify-between gap-4 transition-all ${
                isActive
                  ? 'ra-panel-red ring-1 ring-[#FF2525]/60'
                  : 'ra-panel hover:border-[#FF2525]/50'
              }`}
            >
              <div className="space-y-3">
                {/* Top Row: Number, Title, Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono-tech text-[10px] font-black px-2 py-0.5 rounded bg-[#090909]/80 border border-[#454545] text-[#C5C5C5]">
                        #{theme.order}
                      </span>
                      <h3 className="font-display text-base font-black text-[#F5F5F5] tracking-tight">
                        {theme.name}
                      </h3>
                      {theme.badge && (
                        <span className="font-mono-tech text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-[#FF2525]/15 border border-[#FF2525]/50 text-[#FF2525]">
                          {theme.badge}
                        </span>
                      )}
                    </div>
                    <p className="font-mono-tech text-[10px] uppercase tracking-wider text-[#929292] mt-1">
                      {theme.tagline}
                    </p>
                  </div>

                  {isActive && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF2525] text-[10px] font-mono-tech font-black uppercase tracking-wider shrink-0">
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  )}
                </div>

                {/* Live Mini UI Preview Mock */}
                <div
                  className="rounded-xl p-3 border space-y-2.5"
                  style={{
                    backgroundColor: theme.swatches.bg,
                    borderColor: theme.darkVars.border,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: theme.swatches.accent }}
                      />
                      <span
                        className="font-display text-[11px] font-black uppercase tracking-wider"
                        style={{ color: theme.swatches.text }}
                      >
                        STUDY BLUNDER
                      </span>
                    </div>
                    <span
                      className="px-2 py-0.5 rounded text-[9px] font-mono-tech font-bold uppercase"
                      style={{
                        backgroundColor: theme.swatches.accent,
                        color: theme.id === 'yellow' || theme.id === 'emerald' ? '#090909' : '#FFFFFF',
                      }}
                    >
                      VIP
                    </span>
                  </div>

                  <div
                    className="rounded-lg p-2.5 border flex items-center justify-between gap-2"
                    style={{
                      backgroundColor: theme.swatches.surface,
                      borderColor: theme.darkVars.border,
                    }}
                  >
                    <div className="space-y-1">
                      <div
                        className="h-2 w-24 rounded-full"
                        style={{ backgroundColor: theme.swatches.text, opacity: 0.85 }}
                      />
                      <div
                        className="h-1.5 w-16 rounded-full"
                        style={{ backgroundColor: theme.swatches.text, opacity: 0.35 }}
                      />
                    </div>
                    <div
                      className="px-2.5 py-1 rounded-md text-[9px] font-display font-extrabold uppercase"
                      style={{
                        backgroundColor: theme.swatches.accent,
                        color: theme.id === 'yellow' || theme.id === 'emerald' ? '#090909' : '#FFFFFF',
                      }}
                    >
                      OPEN
                    </div>
                  </div>

                  {/* Color Swatches */}
                  <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-1.5">
                      {[
                        theme.swatches.bg,
                        theme.swatches.surface,
                        theme.swatches.accent,
                        theme.swatches.accent2,
                        theme.swatches.text,
                      ].map((hex, i) => (
                        <span
                          key={`${theme.id}-sw-${i}`}
                          title={hex}
                          className="w-4 h-4 rounded-md border border-black/25 shadow-xs"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                    <span
                      className="font-mono-tech text-[9px] font-bold uppercase"
                      style={{ color: theme.swatches.accent }}
                    >
                      {theme.swatches.accent}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#C5C5C5] leading-relaxed">{theme.description}</p>
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={Boolean(savingPreset) || isActive}
                onClick={() => handleApplyTheme(theme.id)}
                className={`w-full min-h-[44px] px-4 rounded-xl text-xs font-display font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  isActive
                    ? 'ra-btn-secondary opacity-85 cursor-default'
                    : 'ra-btn-primary'
                }`}
              >
                {isSavingThis ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Applying {theme.name}...</span>
                  </>
                ) : isActive ? (
                  <>
                    <Check className="w-4 h-4 text-[#FF2525]" />
                    <span>Currently Active Theme</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Apply {theme.name} Theme</span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Persistence Info Note */}
      <div className="rounded-xl bg-[#141414] border border-[#454545] px-4 py-3 text-xs text-[#929292] flex flex-wrap items-center justify-between gap-2">
        <span>
          Selected theme is stored persistently in the database and pushed automatically to all Student APK users without affecting any other settings or features.
        </span>
        <span className="font-mono-tech text-[10px] uppercase text-[#C5C5C5]">
          PRESET ID: {selectedPreset}
        </span>
      </div>
    </div>
  );
};
