import React, { useState, useEffect, useCallback } from 'react';
import {
  Image as ImageIcon,
  Plus,
  Trash2,
  Save,
  Sparkles,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
  Tag,
  ClipboardList,
} from 'lucide-react';
import { api } from '../../api.ts';
import type { AdminSettings, OfferBoardItem, DailyMotivationItem } from '../../types.ts';

interface GrowthFeaturesAdminTabProps {
  settings: AdminSettings | null;
  onSettingsUpdated?: (updated: AdminSettings) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export const GrowthFeaturesAdminTab: React.FC<GrowthFeaturesAdminTabProps> = ({
  settings,
  onSettingsUpdated,
}) => {
  const [subTab, setSubTab] = useState<'offers' | 'motivation' | 'telegram'>('offers');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Offer Board State
  const [offers, setOffers] = useState<OfferBoardItem[]>([]);

  // 2. 30-Day Daily Motivation State
  const [motivations, setMotivations] = useState<DailyMotivationItem[]>([]);
  const [todayDayNumber, setTodayDayNumber] = useState<number>(1);
  const [bulkText, setBulkText] = useState('');
  const [showBulkBox, setShowBulkBox] = useState(false);

  // 3. Dual Telegram Channels State
  const [sbTelegramLabel, setSbTelegramLabel] = useState('Study Blunder Telegram');
  const [sbTelegramUrl, setSbTelegramUrl] = useState('');
  const [sfTelegramLabel, setSfTelegramLabel] = useState('Study Fox Telegram');
  const [sfTelegramUrl, setSfTelegramUrl] = useState('');

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3800);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [offerList, motData] = await Promise.all([
        api.getAdminOfferBoard(),
        api.getAdminDailyMotivations(),
      ]);
      setOffers(offerList);
      setMotivations(motData.motivations);
      setTodayDayNumber(motData.today?.day_number || 1);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to load Offer Board & Motivation data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!settings) return;
    setSbTelegramLabel(settings.study_blunder_telegram_label || 'Study Blunder Telegram');
    setSbTelegramUrl(settings.study_blunder_telegram_url || settings.telegram_channel_url || '');
    setSfTelegramLabel(settings.study_fox_telegram_label || 'Study Fox Telegram');
    setSfTelegramUrl(settings.study_fox_telegram_url || '');
  }, [settings]);

  // --- Offer Board Actions ---
  const handleAddOffer = () => {
    const now = new Date().toISOString();
    setOffers((prev) => [
      {
        id: `offer_${Date.now()}`,
        title: 'New Offer Banner',
        subtitle: '',
        image_url: '',
        link_url: '',
        is_active: true,
        display_order: prev.length + 1,
        created_at: now,
        updated_at: now,
      },
      ...prev,
    ]);
  };

  const handleOfferChange = (idx: number, patch: Partial<OfferBoardItem>) => {
    setOffers((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const handleRemoveOffer = (idx: number) => {
    setOffers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleOfferPhotoUpload = async (idx: number, file: File | null) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      showToast('error', 'Please choose an image smaller than 4 MB.');
      return;
    }
    const key = `offer_${idx}`;
    setUploadingKey(key);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await api.uploadAdminAsset(dataUrl, `offer_banner_${idx}`, file.type || 'image/png');
      handleOfferChange(idx, { image_url: res.url });
      showToast('success', 'Offer photo uploaded! Click "Save & Publish Offer Board" to make it live.');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to upload offer photo');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSaveOffers = async () => {
    setSaving(true);
    try {
      const ordered = offers.map((item, i) => ({ ...item, display_order: i + 1 }));
      const res = await api.saveAdminOfferBoard(ordered);
      setOffers(res.offers);
      showToast('success', res.message || 'Offer Board saved and live for all students!');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save Offer Board');
    } finally {
      setSaving(false);
    }
  };

  // --- 30-Day Daily Motivation Actions ---
  const handleMotivationChange = (dayNumber: number, patch: Partial<DailyMotivationItem>) => {
    setMotivations((prev) =>
      prev.map((m) => (m.day_number === dayNumber ? { ...m, ...patch } : m))
    );
  };

  const handleMotivationPhotoUpload = async (dayNumber: number, file: File | null) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      showToast('error', 'Please choose a photo smaller than 3 MB.');
      return;
    }
    const key = `mot_${dayNumber}`;
    setUploadingKey(key);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await api.uploadAdminAsset(dataUrl, `motivation_day_${dayNumber}`, file.type || 'image/png');
      handleMotivationChange(dayNumber, { image_url: res.url });
      showToast('success', `Day ${dayNumber} photo uploaded! Remember to Save All 30 Days.`);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to upload motivation photo');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleApplyBulk30Days = () => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast('error', 'Paste at least 1 quote (one quote per line for Day 1..30).');
      return;
    }
    setMotivations((prev) =>
      prev.map((m, idx) => {
        const line = lines[idx];
        if (!line) return m;
        const parts = line.split('—');
        const quote = parts[0].trim();
        const author = parts.length > 1 ? parts.slice(1).join('—').trim() : m.author || 'Study Blunder';
        return { ...m, quote, author };
      })
    );
    setShowBulkBox(false);
    setBulkText('');
    showToast('success', `Loaded ${Math.min(30, lines.length)} days! Click "Save All 30 Days" to publish.`);
  };

  const handleSaveMotivations = async () => {
    setSaving(true);
    try {
      const res = await api.saveAdminDailyMotivations(motivations);
      setMotivations(res.motivations);
      setTodayDayNumber(res.today?.day_number || todayDayNumber);
      showToast('success', res.message || 'All 30 days of Daily Motivation saved!');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save Daily Motivation');
    } finally {
      setSaving(false);
    }
  };

  // --- Dual Telegram Links Actions ---
  const handleSaveDualTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.saveAdminSettings({
        study_blunder_telegram_label: sbTelegramLabel.trim() || 'Study Blunder Telegram',
        study_blunder_telegram_url: sbTelegramUrl.trim(),
        study_fox_telegram_label: sfTelegramLabel.trim() || 'Study Fox Telegram',
        study_fox_telegram_url: sfTelegramUrl.trim(),
      });
      onSettingsUpdated?.(updated);
      showToast('success', 'Both Telegram Channel links updated on Home & Profile pages!');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save Telegram links');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Section Header & Sub-Tabs */}
      <div className="ra-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
              STUDENT ENGAGEMENT MANAGER
            </p>
            <h2 className="font-display text-lg font-black text-[#F5F5F5]">
              Offer Board, 30-Day Motivation & Telegram Channels
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { id: 'offers' as const, label: 'Offer Board', icon: Tag },
              { id: 'motivation' as const, label: '30-Day Motivation', icon: Sparkles },
              { id: 'telegram' as const, label: '2 Telegram Links', icon: Send },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubTab(tab.id)}
                  className={`min-h-[42px] px-3.5 rounded-xl text-xs font-display font-extrabold uppercase tracking-wider inline-flex items-center gap-1.5 border transition-colors ${
                    active ? 'ra-btn-primary' : 'ra-btn-secondary'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {toast && (
          <div
            className={`mt-4 rounded-xl px-4 py-3 text-xs font-bold flex items-center gap-2 border ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : 'bg-red-500/10 border-red-500/40 text-red-400'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.text}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="ra-panel rounded-2xl p-8 text-center font-mono-tech text-xs text-[#929292]">
          Loading Offer Board & 30-Day Motivation...
        </div>
      ) : subTab === 'offers' ? (
        /* ==================== OFFER BOARD MANAGER ==================== */
        <div className="ra-panel rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-black text-[#F5F5F5]">
                Offer Board Banners (Diwali Offer, New Batch, Discounts)
              </h3>
              <p className="text-xs text-[#929292] mt-0.5">
                Photo upload karke Save dabate hi sabhi students ko Home Page ke Offer Board pe dikh jayega.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAddOffer}
                className="min-h-[44px] px-4 rounded-xl ra-btn-secondary text-xs font-display font-extrabold uppercase tracking-wider inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4 text-[#FF2525]" />
                <span>Add Offer Banner</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveOffers}
                className="min-h-[44px] px-5 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider inline-flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save & Publish Offer Board</span>
              </button>
            </div>
          </div>

          {offers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#454545] p-8 text-center space-y-3">
              <ImageIcon className="w-8 h-8 text-[#929292] mx-auto" />
              <p className="text-sm font-bold text-[#F5F5F5]">No Offer Banners Yet</p>
              <p className="text-xs text-[#929292]">
                Click "Add Offer Banner" to upload your first Diwali, New Batch, or Discount offer photo.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {offers.map((offer, idx) => (
                <div
                  key={offer.id || idx}
                  className="rounded-xl bg-[#090909]/80 border border-[#454545] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono-tech text-xs font-bold text-[#FF2525]">
                      OFFER BANNER #{idx + 1}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#C5C5C5] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={offer.is_active}
                          onChange={(e) => handleOfferChange(idx, { is_active: e.target.checked })}
                          className="w-4 h-4 accent-[#FF2525]"
                        />
                        <span>Active (Visible)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveOffer(idx)}
                        className="p-2 rounded-lg text-red-400 hover:bg-red-500/10"
                        title="Delete Offer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-mono-tech text-[10px] uppercase text-[#929292] mb-1">
                        Offer Title
                      </label>
                      <input
                        type="text"
                        value={offer.title}
                        onChange={(e) => handleOfferChange(idx, { title: e.target.value })}
                        placeholder="e.g. Diwali Mega VIP Offer - 50% OFF"
                        className="w-full min-h-[42px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm text-[#F5F5F5]"
                      />
                    </div>
                    <div>
                      <label className="block font-mono-tech text-[10px] uppercase text-[#929292] mb-1">
                        Optional Link URL (When Clicked)
                      </label>
                      <input
                        type="url"
                        value={offer.link_url || ''}
                        onChange={(e) => handleOfferChange(idx, { link_url: e.target.value })}
                        placeholder="https://t.me/... or leave empty"
                        className="w-full min-h-[42px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm text-[#F5F5F5]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono-tech text-[10px] uppercase text-[#929292] mb-1">
                      Offer Description / Subtitle (Optional)
                    </label>
                    <input
                      type="text"
                      value={offer.subtitle || ''}
                      onChange={(e) => handleOfferChange(idx, { subtitle: e.target.value })}
                      placeholder="Short note about offer validity or benefits"
                      className="w-full min-h-[42px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm text-[#F5F5F5]"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label className="block font-mono-tech text-[10px] uppercase text-[#929292] mb-1">
                        Offer Banner Photo URL (or Upload Photo)
                      </label>
                      <input
                        type="text"
                        value={offer.image_url}
                        onChange={(e) => handleOfferChange(idx, { image_url: e.target.value })}
                        placeholder="Upload image or paste URL..."
                        className="w-full min-h-[42px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm text-[#F5F5F5]"
                      />
                    </div>
                    <label className="min-h-[42px] px-4 rounded-xl ra-btn-secondary text-xs font-display font-bold uppercase tracking-wider inline-flex items-center justify-center gap-2 cursor-pointer">
                      {uploadingKey === `offer_${idx}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 text-[#FF2525]" />
                      )}
                      <span>Upload Photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleOfferPhotoUpload(idx, e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  {offer.image_url && (
                    <div className="pt-2">
                      <img
                        src={offer.image_url}
                        alt={offer.title}
                        className="w-full max-h-52 object-cover rounded-xl border border-[#454545]"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : subTab === 'motivation' ? (
        /* ==================== 30-DAY DAILY MOTIVATION ==================== */
        <div className="ra-panel rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-black text-[#F5F5F5]">
                30-Day Daily Motivation Schedule (Today: Day {todayDayNumber})
              </h3>
              <p className="text-xs text-[#929292] mt-0.5">
                Ek baar me poore 30 din ka quote + photo set karein. Har subah IST midnight pe next day ka quote automatically students ko dikhega.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowBulkBox((v) => !v)}
                className="min-h-[44px] px-3.5 rounded-xl ra-btn-secondary text-xs font-display font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
              >
                <ClipboardList className="w-4 h-4 text-[#FF2525]" />
                <span>Bulk Paste 30 Days</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveMotivations}
                className="min-h-[44px] px-5 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider inline-flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>Save All 30 Days</span>
              </button>
            </div>
          </div>

          {showBulkBox && (
            <div className="rounded-xl bg-[#090909]/85 border border-[#454545] p-4 space-y-3">
              <p className="text-xs font-semibold text-[#C5C5C5]">
                Har line me 1 din ka quote paste karein (up to 30 lines). Optional author ke liye <code className="text-[#FF2525]">— Author Name</code> likh sakte hain:
              </p>
              <textarea
                rows={6}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={'Day 1 quote here — Study Blunder\nDay 2 quote here — Dr. Kalam\n...'}
                className="w-full p-3 rounded-xl bg-[#141414] border border-[#454545] text-xs text-[#F5F5F5]"
              />
              <button
                type="button"
                onClick={handleApplyBulk30Days}
                className="min-h-[40px] px-4 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider"
              >
                Fill Days 1–30 From Lines
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[640px] overflow-y-auto pr-1">
            {motivations.map((item) => {
              const isToday = item.day_number === todayDayNumber;
              return (
                <div
                  key={item.day_number}
                  className={`rounded-xl p-3.5 border space-y-2.5 ${
                    isToday
                      ? 'bg-[#FF2525]/10 border-[#FF2525]/65'
                      : 'bg-[#090909]/80 border-[#454545]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-tech text-xs font-black text-[#FF2525]">
                      DAY {item.day_number} {isToday ? '• LIVE TODAY' : ''}
                    </span>
                    <label className="text-[11px] font-display font-bold uppercase text-[#C5C5C5] hover:text-[#FF2525] cursor-pointer inline-flex items-center gap-1">
                      {uploadingKey === `mot_${item.day_number}` ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{item.image_url ? 'Change Photo' : 'Add Photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleMotivationPhotoUpload(item.day_number, e.target.files?.[0] || null)
                        }
                      />
                    </label>
                  </div>

                  <textarea
                    rows={2}
                    value={item.quote}
                    onChange={(e) =>
                      handleMotivationChange(item.day_number, { quote: e.target.value })
                    }
                    placeholder={`Day ${item.day_number} morning motivation quote...`}
                    className="w-full p-2.5 rounded-lg bg-[#141414] border border-[#454545] text-xs text-[#F5F5F5]"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={item.author || ''}
                      onChange={(e) =>
                        handleMotivationChange(item.day_number, { author: e.target.value })
                      }
                      placeholder="Author (optional)"
                      className="min-h-[36px] px-2.5 rounded-lg bg-[#141414] border border-[#454545] text-xs text-[#F5F5F5]"
                    />
                    <input
                      type="text"
                      value={item.image_url || ''}
                      onChange={(e) =>
                        handleMotivationChange(item.day_number, { image_url: e.target.value })
                      }
                      placeholder="Photo URL (optional)"
                      className="min-h-[36px] px-2.5 rounded-lg bg-[#141414] border border-[#454545] text-xs text-[#F5F5F5]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ==================== DUAL TELEGRAM LINKS ==================== */
        <form onSubmit={handleSaveDualTelegram} className="ra-panel rounded-2xl p-4 sm:p-5 space-y-4">
          <div>
            <h3 className="font-display text-base font-black text-[#F5F5F5]">
              Dual Official Telegram Channels (Home Page & Profile Page)
            </h3>
            <p className="text-xs text-[#929292] mt-0.5">
              Dono Telegram Channel links student app ke Home Page aur Profile Page par 1-click Join button ke saath dikhenge.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-[#090909]/80 border border-[#454545] p-4 space-y-3">
              <p className="font-mono-tech text-xs font-bold text-[#FF2525]">
                1. STUDY BLUNDER TELEGRAM
              </p>
              <div>
                <label className="block font-mono-tech text-[10px] uppercase text-[#929292] mb-1">
                  Display Title
                </label>
                <input
                  type="text"
                  value={sbTelegramLabel}
                  onChange={(e) => setSbTelegramLabel(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm text-[#F5F5F5]"
                />
              </div>
              <div>
                <label className="block font-mono-tech text-[10px] uppercase text-[#929292] mb-1">
                  Telegram Channel URL
                </label>
                <input
                  type="url"
                  value={sbTelegramUrl}
                  onChange={(e) => setSbTelegramUrl(e.target.value)}
                  placeholder="https://t.me/studyblunder"
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm text-[#F5F5F5]"
                />
              </div>
            </div>

            <div className="rounded-xl bg-[#090909]/80 border border-[#454545] p-4 space-y-3">
              <p className="font-mono-tech text-xs font-bold text-[#FF2525]">
                2. STUDY FOX TELEGRAM
              </p>
              <div>
                <label className="block font-mono-tech text-[10px] uppercase text-[#929292] mb-1">
                  Display Title
                </label>
                <input
                  type="text"
                  value={sfTelegramLabel}
                  onChange={(e) => setSfTelegramLabel(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm text-[#F5F5F5]"
                />
              </div>
              <div>
                <label className="block font-mono-tech text-[10px] uppercase text-[#929292] mb-1">
                  Telegram Channel URL
                </label>
                <input
                  type="url"
                  value={sfTelegramUrl}
                  onChange={(e) => setSfTelegramUrl(e.target.value)}
                  placeholder="https://t.me/studyfoxofficial"
                  className="w-full min-h-[42px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm text-[#F5F5F5]"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="min-h-[46px] px-6 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider inline-flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Both Telegram Links</span>
          </button>
        </form>
      )}
    </div>
  );
};
