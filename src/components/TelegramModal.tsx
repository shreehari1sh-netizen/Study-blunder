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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ra-panel ra-corners rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-center overflow-hidden">
        <div className="h-1 w-full ra-hazard-bar absolute top-0 left-0 right-0" />

        <button
          onClick={onClose}
          aria-label="Close Telegram popup"
          className="absolute top-3.5 right-3.5 w-9 h-9 flex items-center justify-center text-[#C5C5C5] hover:text-[#F5F5F5] rounded-lg bg-[#090909] border border-[#454545] hover:border-[#FF2525] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-[#090909] border border-[#FF2525]/55 flex items-center justify-center mx-auto text-[#FF2525] mb-4 mt-1">
          <Send className="w-6 h-6 -translate-x-0.5" />
        </div>

        <h3 className="font-display text-base font-black text-[#F5F5F5] uppercase tracking-tight">
          {title || 'Join Our Telegram Community'}
        </h3>
        <p className="text-xs text-[#C5C5C5] mt-2 leading-relaxed whitespace-pre-line">
          {message || 'Get real-time platform updates, backup mirror links, batch notifications, and direct priority support.'}
        </p>

        {reminderText && reminderText.trim().length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-[#090909] border border-[#454545] flex items-center gap-2.5 text-xs text-left">
            <ShieldCheck className="w-4 h-4 text-[#FF2525] shrink-0" />
            <span className="text-[#C5C5C5]">{reminderText}</span>
          </div>
        )}

        <div className="mt-5 space-y-2.5">
          {validUrl && (
            <button
              onClick={handleJoin}
              className="w-full min-h-[46px] py-2.5 px-4 rounded-xl ra-btn-primary font-display font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2"
            >
              <span>{buttonText || 'JOIN TELEGRAM CHANNEL'}</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="w-full min-h-[42px] py-2 rounded-xl ra-btn-secondary text-xs font-semibold text-[#C5C5C5]"
          >
            {closeText || 'Maybe Later'}
          </button>
        </div>
      </div>
    </div>
  );
};
