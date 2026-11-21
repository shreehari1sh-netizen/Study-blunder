import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock,
  Edit3,
  Check,
  X,
  Sparkles,
  Flame,
  Trophy,
  Crown,
  Send,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Calendar,
  BookOpen,
  Award,
  Share2,
  Copy,
  Play,
  Square,
  Plus,
  Users,
  Sun,
  Moon,
  Tag,
  CheckCircle2,
  Loader2,
  Save,
} from 'lucide-react';
import { api } from '../api.ts';
import type {
  UserProfile,
  PublicSettings,
  StudentExamTimer,
  OfferBoardItem,
  DailyMotivationItem,
  LeaderboardResponse,
  ParentsReportCardData,
} from '../types.ts';

const LOCAL_EXAM_TIMER_KEY = 'sb_student_exam_timer_v1';

interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isPast: boolean;
}

function computeCountdown(targetIso: string): CountdownParts {
  const targetMs = new Date(targetIso).getTime();
  if (!Number.isFinite(targetMs)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  }
  const diff = targetMs - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
  }
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, isPast: false };
}

function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDefaultExamIso(): string {
  const d = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

// ================================================================
// 1. EXAM COUNTDOWN TIMER CARD (Home Page)
// ================================================================
interface ExamCountdownCardProps {
  user: UserProfile | null;
}

export const ExamCountdownCard: React.FC<ExamCountdownCardProps> = ({ user }) => {
  const [timer, setTimer] = useState<StudentExamTimer | null>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_EXAM_TIMER_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore storage error
    }
    return null;
  });

  const [editing, setEditing] = useState(false);
  const [examNameInput, setExamNameInput] = useState('');
  const [examDateInput, setExamDateInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [, setTick] = useState(0);

  // Sync from server when logged in
  useEffect(() => {
    let active = true;
    if (!user) return;
    api
      .getStudentExamTimer()
      .then((serverTimer) => {
        if (!active || !serverTimer) return;
        setTimer(serverTimer);
        try {
          localStorage.setItem(LOCAL_EXAM_TIMER_KEY, JSON.stringify(serverTimer));
        } catch {
          // Ignore storage error
        }
      })
      .catch(() => {
        // Fallback to localStorage seamlessly
      });
    return () => {
      active = false;
    };
  }, [user]);

  // Live 1-second countdown ticker (pauses when tab hidden)
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setTick((t) => (t + 1) % 100000);
    }, 1000);
    return () => clearInterval(id);
  }, [timer]);

  const openEditor = () => {
    setExamNameInput(timer?.exam_name || 'NEET / JEE / GATE 2027');
    setExamDateInput(isoToDatetimeLocalValue(timer?.exam_datetime || getDefaultExamIso()));
    setError(null);
    setEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = examNameInput.trim();
    if (!cleanName) {
      setError('Apne Exam / Paper ka naam likhein (e.g. GATE 2029, NEET 2027).');
      return;
    }
    const dt = new Date(examDateInput);
    if (isNaN(dt.getTime())) {
      setError('Valid Exam Date & Time select karein.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let nextRecord: StudentExamTimer = {
        user_id: user?.id || 'local',
        exam_name: cleanName,
        exam_datetime: dt.toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (user) {
        const res = await api.saveStudentExamTimer(cleanName, dt.toISOString());
        nextRecord = res.timer;
      }
      setTimer(nextRecord);
      try {
        localStorage.setItem(LOCAL_EXAM_TIMER_KEY, JSON.stringify(nextRecord));
      } catch {
        // Ignore
      }
      setEditing(false);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save Exam Timer.');
    } finally {
      setSaving(false);
    }
  };

  const countdown = timer ? computeCountdown(timer.exam_datetime) : null;

  return (
    <section className="ra-panel-red ra-corners rounded-2xl p-4 sm:p-5 relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#1D1D1D] border border-[#FF2525]/55 flex items-center justify-center text-[#FF2525] shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
              EXAM COUNTDOWN TIMER
            </p>
            <h3 className="font-display text-sm sm:text-base font-black text-[#F5F5F5] truncate">
              {timer ? timer.exam_name : 'Apna Exam / Paper Time Set Karein'}
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={editing ? () => setEditing(false) : openEditor}
          className="min-h-[40px] px-3 rounded-lg ra-btn-secondary text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5 shrink-0"
        >
          {editing ? (
            <>
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </>
          ) : (
            <>
              <Edit3 className="w-3.5 h-3.5 text-[#FF2525]" />
              <span>{timer ? 'Edit Exam' : 'Set Timer'}</span>
            </>
          )}
        </button>
      </div>

      {savedNotice && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-[#FF2525]/12 border border-[#FF2525]/50 text-xs font-semibold text-[#F5F5F5] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>Exam Timer saved! Roz apne aap update hota rahega.</span>
        </div>
      )}

      {editing ? (
        <form onSubmit={handleSave} className="mt-4 space-y-3 pt-3 border-t border-[#454545]">
          {error && (
            <p className="text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono-tech text-[10px] uppercase tracking-wider text-[#929292] mb-1">
                Exam / Paper Name
              </label>
              <input
                type="text"
                value={examNameInput}
                onChange={(e) => setExamNameInput(e.target.value)}
                placeholder="e.g. GATE 2029, NEET 2027"
                maxLength={80}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#090909] border border-[#454545] text-sm text-[#F5F5F5] focus:border-[#FF2525]"
              />
            </div>
            <div>
              <label className="block font-mono-tech text-[10px] uppercase tracking-wider text-[#929292] mb-1">
                Exam Date & Time
              </label>
              <input
                type="datetime-local"
                value={examDateInput}
                onChange={(e) => setExamDateInput(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#090909] border border-[#454545] text-sm text-[#F5F5F5] focus:border-[#FF2525]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>{saving ? 'Saving...' : 'Save Exam Timer'}</span>
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-[44px] px-4 rounded-xl ra-btn-secondary text-xs font-display font-bold uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : timer && countdown ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'DIN', value: countdown.days },
              { label: 'GHANTE', value: countdown.hours },
              { label: 'MIN', value: countdown.minutes },
              { label: 'SEC', value: countdown.seconds },
            ].map((unit) => (
              <div
                key={unit.label}
                className="rounded-xl bg-[#090909]/85 border border-[#454545] py-2.5 px-2 text-center"
              >
                <div className="font-mono-tech text-xl sm:text-2xl font-black text-[#FF2525] leading-none">
                  {String(unit.value).padStart(2, '0')}
                </div>
                <div className="font-mono-tech text-[9px] font-bold tracking-[0.14em] text-[#929292] mt-1">
                  {unit.label}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-[#1D1D1D]/90 border border-[#454545] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs sm:text-sm font-bold text-[#F5F5F5]">
              {countdown.isPast ? (
                <>
                  <span className="text-[#FF2525]">{timer.exam_name}</span> ka exam time aa gaya hai — All The Best!
                </>
              ) : (
                <>
                  <span className="text-[#FF2525]">{timer.exam_name}</span> me{' '}
                  <span className="font-mono-tech font-black">{countdown.days} Din</span>,{' '}
                  <span className="font-mono-tech font-black">{countdown.hours} Ghante</span> Bache Hai.
                </>
              )}
            </p>
            <span className="font-mono-tech text-[10px] text-[#929292]">
              Target: {new Date(timer.exam_datetime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3 pt-3 border-t border-[#454545] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-[#C5C5C5] leading-relaxed">
            Example: <strong className="text-[#F5F5F5]">GATE 2029 me 342 Din, 12 Ghante Bache Hai.</strong> Apne target exam ka date set karein — timer har din apne aap update hoga.
          </p>
          <button
            type="button"
            onClick={openEditor}
            className="min-h-[44px] px-4 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider shrink-0"
          >
            Set My Exam Date
          </button>
        </div>
      )}
    </section>
  );
};

// ================================================================
// 2. OFFER BOARD BANNER (Home Page — Admin Uploaded Photo Banners)
// ================================================================
export const OfferBoardBanner: React.FC = () => {
  const [offers, setOffers] = useState<OfferBoardItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let active = true;
    const loadOffers = () => {
      api
        .getOfferBoard()
        .then((list) => {
          if (active) setOffers(list);
        })
        .catch(() => {
          // Silent
        });
    };
    loadOffers();
    const interval = setInterval(loadOffers, 45000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (offers.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % offers.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [offers.length]);

  if (offers.length === 0) return null;

  const safeIdx = activeIdx % offers.length;
  const current = offers[safeIdx];

  return (
    <section className="ra-panel ra-corners rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#454545] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Tag className="w-4 h-4 text-[#FF2525] shrink-0" />
          <span className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
            OFFER BOARD
          </span>
          <span className="text-xs font-bold text-[#F5F5F5] truncate">— {current.title}</span>
        </div>

        {offers.length > 1 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              aria-label="Previous offer"
              onClick={() => setActiveIdx((prev) => (prev - 1 + offers.length) % offers.length)}
              className="w-8 h-8 rounded-lg ra-btn-secondary flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono-tech text-[10px] text-[#929292] px-1">
              {safeIdx + 1}/{offers.length}
            </span>
            <button
              type="button"
              aria-label="Next offer"
              onClick={() => setActiveIdx((prev) => (prev + 1) % offers.length)}
              className="w-8 h-8 rounded-lg ra-btn-secondary flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {current.image_url && (
        <div className="relative w-full bg-[#090909]">
          <img
            src={current.image_url}
            alt={current.title}
            referrerPolicy="no-referrer"
            className="w-full max-h-[280px] sm:max-h-[340px] object-cover block"
          />
        </div>
      )}

      {(current.subtitle || current.link_url) && (
        <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <h4 className="font-display text-sm font-extrabold text-[#F5F5F5]">{current.title}</h4>
            {current.subtitle && (
              <p className="text-xs text-[#C5C5C5] mt-0.5 leading-relaxed">{current.subtitle}</p>
            )}
          </div>
          {current.link_url && (
            <a
              href={current.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-4 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider inline-flex items-center justify-center gap-1.5 shrink-0"
            >
              <span>View Offer</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}
    </section>
  );
};

// ================================================================
// 3. DAILY MOTIVATION CARD (Home Page — Fresh Every Morning IST)
// ================================================================
export const DailyMotivationCard: React.FC = () => {
  const [data, setData] = useState<{ item: DailyMotivationItem; today_ist: string; day_number: number } | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getTodayMotivation()
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {
        // Silent
      });
    return () => {
      active = false;
    };
  }, []);

  if (!data || !data.item) return null;

  const { item, day_number } = data;

  return (
    <section className="ra-panel rounded-2xl p-4 sm:p-5 relative overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#FF2525] shrink-0" />
          <span className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
            DAILY MORNING MOTIVATION
          </span>
        </div>
        <span className="font-mono-tech text-[10px] font-bold text-[#929292] uppercase">
          DAY {day_number} / 30
        </span>
      </div>

      <div className={item.image_url ? 'grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4 items-center' : ''}>
        {item.image_url && (
          <img
            src={item.image_url}
            alt={`Day ${day_number} Motivation`}
            referrerPolicy="no-referrer"
            className="w-full h-36 sm:h-28 object-cover rounded-xl border border-[#454545]"
          />
        )}
        <div className="min-w-0">
          <blockquote className="text-sm sm:text-base font-bold text-[#F5F5F5] leading-relaxed">
            “{item.quote}”
          </blockquote>
          {item.author && (
            <p className="mt-2 font-mono-tech text-[11px] font-semibold text-[#929292]">
              — {item.author}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

// ================================================================
// 4. DUAL TELEGRAM CHANNELS CARD (BOTH Home Page & Profile Page)
// ================================================================
interface DualTelegramChannelsCardProps {
  settings: PublicSettings | null;
}

export const DualTelegramChannelsCard: React.FC<DualTelegramChannelsCardProps> = ({ settings }) => {
  const studyBlunderUrl =
    settings?.study_blunder_telegram_url || settings?.telegram_channel_url || 'https://t.me/studyblunder';
  const studyBlunderLabel = settings?.study_blunder_telegram_label || 'Study Blunder Telegram';
  const studyFoxUrl = settings?.study_fox_telegram_url || 'https://t.me/studyfoxofficial';
  const studyFoxLabel = settings?.study_fox_telegram_label || 'Study Fox Telegram';

  const channels = [
    {
      id: 'study-blunder',
      title: studyBlunderLabel,
      subtitle: 'Official Study Blunder Updates, Batches & Offers',
      url: studyBlunderUrl,
    },
    {
      id: 'study-fox',
      title: studyFoxLabel,
      subtitle: 'Official Study Fox Notes, Links & Alerts',
      url: studyFoxUrl,
    },
  ];

  return (
    <section className="ra-panel rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Send className="w-4 h-4 text-[#FF2525] shrink-0" />
        <span className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
          OFFICIAL TELEGRAM CHANNELS
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {channels.map((ch) => (
          <a
            key={ch.id}
            href={ch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group min-h-[60px] rounded-xl bg-[#1D1D1D] hover:bg-[#2A2A2A] border border-[#454545] hover:border-[#FF2525] p-3.5 flex items-center justify-between gap-3 transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#090909] border border-[#FF2525]/55 flex items-center justify-center text-[#FF2525] shrink-0">
                <Send className="w-4 h-4 -translate-x-px" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-xs sm:text-sm font-extrabold text-[#F5F5F5] truncate">
                  {ch.title}
                </p>
                <p className="text-[11px] text-[#929292] truncate">{ch.subtitle}</p>
              </div>
            </div>
            <span className="px-2.5 py-1.5 rounded-lg ra-btn-primary text-[10px] font-display font-extrabold uppercase tracking-wider shrink-0">
              Join
            </span>
          </a>
        ))}
      </div>
    </section>
  );
};

// ================================================================
// 5. XP SYSTEM + TOP 10 LEADERBOARD (Profile Page — Shown to ALL Users)
// ================================================================
interface XpLeaderboardCardProps {
  user: UserProfile | null;
  onOpenAuth?: () => void;
  refreshSignal?: number;
}

export const XpLeaderboardCard: React.FC<XpLeaderboardCardProps> = ({
  user,
  onOpenAuth,
  refreshSignal = 0,
}) => {
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBoard = useCallback(async () => {
    try {
      const data = await api.getXpLeaderboard();
      setBoard(data);
    } catch {
      // Keep previous
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard, user?.id, refreshSignal]);

  return (
    <section className="ra-panel-red ra-corners rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1D1D1D] border border-[#FF2525]/55 flex items-center justify-center text-[#FF2525] shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <p className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
              XP SYSTEM + TOP 10 LEADERBOARD
            </p>
            <h3 className="font-display text-sm sm:text-base font-black text-[#F5F5F5]">
              Top 10 Study Blunder Champions
            </h3>
          </div>
        </div>

        {board?.daily_xp_claimed_today && user && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D1D1D] border border-[#FF2525]/55 text-[11px] font-mono-tech font-bold text-[#FF2525]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {board.daily_xp_awarded_now
                ? `+${board.daily_xp_awarded_now} Daily XP Earned!`
                : 'Daily Login XP Claimed'}
            </span>
          </div>
        )}
      </div>

      {/* Current User XP Summary Bar */}
      {user && board ? (
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <div className="rounded-xl bg-[#090909]/85 border border-[#454545] p-3 text-center">
            <div className="font-mono-tech text-[10px] text-[#929292] uppercase">MY RANK</div>
            <div className="font-mono-tech text-lg sm:text-xl font-black text-[#FF2525] mt-0.5">
              {board.my_rank ? `#${board.my_rank}` : '—'}
            </div>
          </div>
          <div className="rounded-xl bg-[#090909]/85 border border-[#454545] p-3 text-center">
            <div className="font-mono-tech text-[10px] text-[#929292] uppercase">TOTAL XP</div>
            <div className="font-mono-tech text-lg sm:text-xl font-black text-[#F5F5F5] mt-0.5">
              {board.my_xp}
            </div>
          </div>
          <div className="rounded-xl bg-[#090909]/85 border border-[#454545] p-3 text-center">
            <div className="font-mono-tech text-[10px] text-[#929292] uppercase">STREAK</div>
            <div className="font-mono-tech text-lg sm:text-xl font-black text-[#FF2525] mt-0.5 inline-flex items-center gap-1">
              <Flame className="w-4 h-4" />
              {board.my_streak}d
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-xl bg-[#1D1D1D] border border-[#454545] p-3.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[#C5C5C5]">
            Roz login karne par <strong className="text-[#FF2525]">+50 Daily XP</strong> aur Streak Bonus milta hai. Top 10 me aane ke liye login karein!
          </p>
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="min-h-[40px] px-3.5 rounded-lg ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider"
            >
              Login to Earn XP
            </button>
          )}
        </div>
      )}

      {/* Top 10 List */}
      {loading ? (
        <div className="py-6 text-center font-mono-tech text-xs text-[#929292]">
          Loading Top 10 Leaderboard...
        </div>
      ) : !board || board.top_students.length === 0 ? (
        <div className="py-6 text-center text-xs text-[#929292]">
          Daily login karke pehla XP earn karein aur #1 Rank haasil karein!
        </div>
      ) : (
        <div className="space-y-2">
          {board.top_students.map((entry) => {
            const isTop3 = entry.rank <= 3;
            const rankBadgeStyle =
              entry.rank === 1
                ? 'bg-[#FF2525] text-white border-[#FF2525]'
                : entry.rank === 2
                ? 'bg-[#CBD5E1] text-[#090909] border-[#E2E8F0]'
                : entry.rank === 3
                ? 'bg-[#FF762E] text-white border-[#FF762E]'
                : 'bg-[#1D1D1D] text-[#C5C5C5] border-[#454545]';

            return (
              <div
                key={entry.user_id}
                className={`rounded-xl px-3 py-2.5 border flex items-center justify-between gap-3 transition-colors ${
                  entry.is_me
                    ? 'bg-[#FF2525]/14 border-[#FF2525]/65'
                    : isTop3
                    ? 'bg-[#1D1D1D] border-[#FF2525]/45'
                    : 'bg-[#090909]/70 border-[#454545]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg border font-mono-tech text-xs font-black flex items-center justify-center shrink-0 ${rankBadgeStyle}`}
                  >
                    #{entry.rank}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-display text-xs sm:text-sm font-extrabold text-[#F5F5F5] truncate">
                        {entry.display_name}
                      </span>
                      {entry.is_me && (
                        <span className="font-mono-tech text-[9px] font-black uppercase text-[#FF2525]">
                          (YOU)
                        </span>
                      )}
                      {entry.is_vip && <Crown className="w-3.5 h-3.5 text-[#FF2525] shrink-0" />}
                    </div>
                    <p className="font-mono-tech text-[10px] text-[#929292]">
                      {entry.daily_streak} day streak • {entry.total_login_days} logins
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono-tech text-sm font-black text-[#FF2525]">
                    {entry.xp_total} XP
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

// ================================================================
// 6. SUNDAY PARENTS REPORT CARD (Profile Page)
// ================================================================
interface ParentsReportCardProps {
  user: UserProfile;
  onXpUpdated?: () => void;
}

export const ParentsReportCard: React.FC<ParentsReportCardProps> = ({ user, onXpUpdated }) => {
  const [report, setReport] = useState<ParentsReportCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [parentName, setParentName] = useState('');
  const [parentWhatsapp, setParentWhatsapp] = useState('');
  const [autoSunday, setAutoSunday] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Quick Study Session Logger + Live Study Stopwatch
  const [logMinutes, setLogMinutes] = useState('45');
  const [logNote, setLogNote] = useState('');
  const [loggingStudy, setLoggingStudy] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerStartRef = useRef<number | null>(null);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadReport = useCallback(async () => {
    try {
      const data = await api.getParentsReportCard();
      setReport(data);
      setParentName(data.parent_settings.parent_name || '');
      setParentWhatsapp(data.parent_settings.parent_whatsapp || '');
      setAutoSunday(data.parent_settings.auto_sunday_enabled !== false);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport, user.id]);

  // Live Study Timer tick
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      if (timerStartRef.current) {
        setElapsedSec(Math.floor((Date.now() - timerStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  const handleToggleStudyTimer = async () => {
    if (!timerRunning) {
      timerStartRef.current = Date.now() - elapsedSec * 1000;
      setTimerRunning(true);
      return;
    }
    setTimerRunning(false);
    const mins = Math.max(1, Math.round(elapsedSec / 60));
    setElapsedSec(0);
    timerStartRef.current = null;
    try {
      setLoggingStudy(true);
      const res = await api.logStudySession(mins, 'timer', 'Live Study Timer');
      setReport(res.report);
      setStatusMsg(res.message);
      onXpUpdated?.();
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to log timer');
    } finally {
      setLoggingStudy(false);
    }
  };

  const handleQuickLogMinutes = async (minsToLog?: number) => {
    const mins = minsToLog ?? Number(logMinutes);
    if (!Number.isFinite(mins) || mins < 1) return;
    try {
      setLoggingStudy(true);
      const res = await api.logStudySession(mins, 'manual', logNote.trim());
      setReport(res.report);
      setLogNote('');
      setStatusMsg(res.message);
      onXpUpdated?.();
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to log study time');
    } finally {
      setLoggingStudy(false);
    }
  };

  const handleSaveParentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const res = await api.saveParentReportSettings({
        parent_name: parentName,
        parent_whatsapp: parentWhatsapp,
        auto_sunday_enabled: autoSunday,
      });
      setReport(res.report);
      setShowSettings(false);
      setStatusMsg('Parent WhatsApp & Sunday Report settings saved!');
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err: unknown) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCopyReport = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.share_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Ignore clipboard restriction
    }
  };

  if (loading || !report) {
    return (
      <section className="ra-panel rounded-2xl p-5 text-center font-mono-tech text-xs text-[#929292]">
        Loading Sunday Parents Report Card...
      </section>
    );
  }

  const hrs = Math.floor(report.study_minutes_week / 60);
  const mins = report.study_minutes_week % 60;
  const stopwatchMm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const stopwatchSs = String(elapsedSec % 60).padStart(2, '0');

  return (
    <section className="ra-panel ra-corners rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1D1D1D] border border-[#FF2525]/55 flex items-center justify-center text-[#FF2525] shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
              PARENTS REPORT CARD • EVERY SUNDAY
            </p>
            <h3 className="font-display text-sm sm:text-base font-black text-[#F5F5F5]">
              Weekly Student Progress Report
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="min-h-[40px] px-3 rounded-lg ra-btn-secondary text-xs font-display font-bold uppercase tracking-wider flex items-center gap-1.5"
        >
          <Edit3 className="w-3.5 h-3.5 text-[#FF2525]" />
          <span>{showSettings ? 'Close' : 'Parent Setup'}</span>
        </button>
      </div>

      {/* Sunday Status Strip */}
      <div className="rounded-xl bg-[#1D1D1D] border border-[#454545] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-[#F5F5F5] flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#FF2525] shrink-0" />
          {report.is_sunday_ist ? (
            <span>Aaj Sunday hai! Weekly Parents Report Card bhejne ke liye ready hai.</span>
          ) : (
            <span>Har Sunday ko Parents ko Report jayega • Next Sunday: {report.next_sunday_ist}</span>
          )}
        </span>
        <span className="font-mono-tech text-[10px] text-[#929292]">
          Week: {report.week_start_ist} → {report.week_end_ist}
        </span>
      </div>

      {statusMsg && (
        <div className="rounded-xl bg-[#FF2525]/12 border border-[#FF2525]/55 px-3.5 py-2 text-xs font-bold text-[#F5F5F5]">
          {statusMsg}
        </div>
      )}

      {/* 3 Core Report Metrics: Padhai, Quiz, Rank */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Padhai */}
        <div className="rounded-xl bg-[#090909]/85 border border-[#454545] p-3.5">
          <div className="flex items-center gap-2 text-[#FF2525] mb-1.5">
            <BookOpen className="w-4 h-4" />
            <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider">
              PADHAI (WEEKLY)
            </span>
          </div>
          <div className="font-mono-tech text-xl font-black text-[#F5F5F5]">
            {hrs}h {mins}m
          </div>
          <p className="text-[11px] text-[#929292] mt-1">
            {report.study_sessions_count} study sessions logged
          </p>
        </div>

        {/* Quiz */}
        <div className="rounded-xl bg-[#090909]/85 border border-[#454545] p-3.5">
          <div className="flex items-center gap-2 text-[#FF2525] mb-1.5">
            <Award className="w-4 h-4" />
            <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider">
              QUIZ & MARKS
            </span>
          </div>
          <div className="font-mono-tech text-xl font-black text-[#F5F5F5]">
            {report.quizzes_taken_week} Quiz
          </div>
          <p className="text-[11px] text-[#929292] mt-1">
            {report.quizzes_taken_week > 0
              ? `Marks: ${report.quiz_marks_obtained}/${report.quiz_total_marks} (${report.quiz_avg_percentage}%)`
              : 'VIP Hub me Quiz attempt karein'}
          </p>
        </div>

        {/* Rank */}
        <div className="rounded-xl bg-[#090909]/85 border border-[#454545] p-3.5">
          <div className="flex items-center gap-2 text-[#FF2525] mb-1.5">
            <Trophy className="w-4 h-4" />
            <span className="font-mono-tech text-[10px] font-bold uppercase tracking-wider">
              LEADERBOARD RANK
            </span>
          </div>
          <div className="font-mono-tech text-xl font-black text-[#FF2525]">
            {report.leaderboard_rank ? `#${report.leaderboard_rank}` : 'Unranked'}
          </div>
          <p className="text-[11px] text-[#929292] mt-1">
            {report.total_xp} XP • {report.daily_streak} day streak
          </p>
        </div>
      </div>

      {/* Study Hours Tracker (Live Timer + Quick Log) */}
      <div className="rounded-xl bg-[#1D1D1D] border border-[#454545] p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-display text-xs font-extrabold uppercase tracking-wider text-[#F5F5F5]">
              Track Padhai Hours (+XP)
            </p>
            <p className="text-[11px] text-[#929292]">
              Apni padhai log karein — automatically Sunday Parents Report me add hoga.
            </p>
          </div>
          <button
            type="button"
            disabled={loggingStudy}
            onClick={handleToggleStudyTimer}
            className={`min-h-[42px] px-4 rounded-xl text-xs font-display font-extrabold uppercase tracking-wider flex items-center gap-2 ${
              timerRunning
                ? 'bg-red-600 text-white border border-red-400'
                : 'ra-btn-primary'
            }`}
          >
            {timerRunning ? (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>Stop & Save ({stopwatchMm}:{stopwatchSs})</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Start Study Timer</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[30, 60, 120].map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={loggingStudy}
              onClick={() => handleQuickLogMinutes(preset)}
              className="min-h-[38px] px-3 rounded-lg ra-btn-secondary font-mono-tech text-xs font-bold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5 text-[#FF2525]" />
              <span>{preset >= 60 ? `${preset / 60}h` : `${preset}m`}</span>
            </button>
          ))}
          <div className="flex items-center gap-1.5 flex-1 min-w-[170px]">
            <input
              type="number"
              min={1}
              max={720}
              value={logMinutes}
              onChange={(e) => setLogMinutes(e.target.value)}
              placeholder="Mins"
              className="w-20 min-h-[38px] px-2.5 rounded-lg bg-[#090909] border border-[#454545] text-xs font-mono-tech text-[#F5F5F5]"
            />
            <button
              type="button"
              disabled={loggingStudy}
              onClick={() => handleQuickLogMinutes()}
              className="min-h-[38px] px-3 rounded-lg ra-btn-secondary text-xs font-display font-bold uppercase"
            >
              Log Mins
            </button>
          </div>
        </div>
      </div>

      {/* Parent Contact Setup (Expandable) */}
      {showSettings && (
        <form onSubmit={handleSaveParentSettings} className="rounded-xl bg-[#090909]/80 border border-[#454545] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono-tech text-[10px] uppercase tracking-wider text-[#929292] mb-1">
                Parent Name (e.g. Papa / Mummy)
              </label>
              <input
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                placeholder="e.g. Rajesh Ji"
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm text-[#F5F5F5]"
              />
            </div>
            <div>
              <label className="block font-mono-tech text-[10px] uppercase tracking-wider text-[#929292] mb-1">
                Parent WhatsApp Number
              </label>
              <input
                type="tel"
                value={parentWhatsapp}
                onChange={(e) => setParentWhatsapp(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full min-h-[44px] px-3 rounded-xl bg-[#141414] border border-[#454545] text-sm font-mono-tech text-[#F5F5F5]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-[#C5C5C5] cursor-pointer">
            <input
              type="checkbox"
              checked={autoSunday}
              onChange={(e) => setAutoSunday(e.target.checked)}
              className="w-4 h-4 accent-[#FF2525]"
            />
            <span>Har Sunday ko Parents Report reminder aur quick-send card enable rakhein</span>
          </label>

          <button
            type="submit"
            disabled={savingSettings}
            className="min-h-[44px] px-5 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider inline-flex items-center gap-2"
          >
            {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Parent Details</span>
          </button>
        </form>
      )}

      {/* Action Buttons: Send to Parents on WhatsApp / Copy */}
      <div className="flex flex-wrap items-center gap-2.5">
        <a
          href={report.whatsapp_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-[200px] min-h-[46px] px-4 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider inline-flex items-center justify-center gap-2"
        >
          <Share2 className="w-4 h-4" />
          <span>Send Sunday Report to Parents (WhatsApp)</span>
        </a>

        <button
          type="button"
          onClick={handleCopyReport}
          className="min-h-[46px] px-4 rounded-xl ra-btn-secondary text-xs font-display font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
        >
          {copied ? <Check className="w-4 h-4 text-[#FF2525]" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied!' : 'Copy Report'}</span>
        </button>
      </div>
    </section>
  );
};

// ================================================================
// 7. DARK / LIGHT MODE SWITCHER CARD (Profile Page)
// ================================================================
interface ThemeModeCardProps {
  colorMode: 'dark' | 'light';
  onToggleColorMode: () => void;
}

export const ThemeModeCard: React.FC<ThemeModeCardProps> = ({ colorMode, onToggleColorMode }) => {
  const isDark = colorMode === 'dark';
  return (
    <section className="ra-panel rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-[#1D1D1D] border border-[#FF2525]/55 flex items-center justify-center text-[#FF2525] shrink-0">
          {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </div>
        <div className="min-w-0">
          <p className="font-mono-tech text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF2525]">
            DISPLAY MODE
          </p>
          <h3 className="font-display text-sm font-black text-[#F5F5F5]">
            {isDark ? 'Dark Mode (Night Study)' : 'Light Mode (Day Study)'}
          </h3>
          <p className="text-[11px] text-[#929292]">
            {isDark
              ? 'Raat me padhne ke liye eye-comfort Dark Mode active hai.'
              : 'Din me padhne ke liye crisp Light Mode active hai.'}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleColorMode}
        className="min-h-[44px] px-4 rounded-xl ra-btn-primary text-xs font-display font-extrabold uppercase tracking-wider inline-flex items-center gap-2 shrink-0"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        <span>{isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
      </button>
    </section>
  );
};
