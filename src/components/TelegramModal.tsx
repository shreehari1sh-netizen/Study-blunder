import React from 'react';
import { Send, X, ExternalLink, ShieldCheck } from 'lucide-react';

interface TelegramModalProps {
  channelUrl: string;
  title?: string;
  message?: string;
  buttonText?: string;
  closeText?: string;
  reminderText?: string;
  onClose: () => void;
}

export const TelegramModal: React.FC<TelegramModalProps> = ({
  channelUrl,
  title = 'Join Our Telegram Community',
  message = 'Get real-time platform updates, backup mirror links, batch notifications, and direct priority support.',
  buttonText = 'JOIN TELEGRAM CHANNEL',
  closeText = 'Maybe Later',
  reminderText = 'Official channel with active study updates.',
  onClose,
}) => {
  const getValidHttpUrl = (raw: string): string | null => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return null;
    const candidate =
      trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : `https://${trimmed}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
      return null;
    } catch {
      return null;
    }
  };

  const validUrl = getValidHttpUrl(channelUrl);

  const handleJoin = () => {
    if (!validUrl) return;
    window.open(validUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0C1222] border border-sky-500/40 rounded-3xl max-w-sm w-full p-6 shadow-2xl relative text-center animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          aria-label="Close Telegram popup"
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-900/60"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center mx-auto text-white shadow-xl shadow-sky-900/40 mb-4">
          <Send className="w-7 h-7 -translate-x-0.5" />
        </div>

        <h3 className="text-base font-extrabold text-white">
          {title || 'Join Our Telegram Community'}
        </h3>
        <p className="text-xs text-slate-300 mt-1.5 leading-relaxed whitespace-pre-line">
          {message || 'Get real-time platform updates, backup mirror links, batch notifications, and direct priority support.'}
        </p>

        {reminderText && reminderText.trim().length > 0 && (
          <div className="mt-4 p-3 rounded-2xl bg-sky-950/30 border border-sky-900/50 flex items-center gap-2 text-xs text-sky-200 text-left">
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{reminderText}</span>
          </div>
        )}

        <div className="mt-5 space-y-2.5">
          {validUrl && (
            <button
              onClick={handleJoin}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-xs tracking-wider uppercase shadow-lg shadow-sky-900/50 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <span>{buttonText || 'JOIN TELEGRAM CHANNEL'}</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            {closeText || 'Maybe Later'}
          </button>
        </div>
      </div>
    </div>
  );
};
