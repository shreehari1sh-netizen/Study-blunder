import React from 'react';
import { X, ExternalLink, Bell } from 'lucide-react';

interface CustomPopupModalProps {
  title: string;
  message: string;
  imageUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  closeText?: string;
  onClose: () => void;
}

export const CustomPopupModal: React.FC<CustomPopupModalProps> = ({
  title,
  message,
  imageUrl,
  buttonText,
  buttonUrl,
  closeText = 'Dismiss',
  onClose,
}) => {
  const getValidHttpUrl = (raw?: string): string | null => {
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

  const validButtonUrl = getValidHttpUrl(buttonUrl);

  const handleActionClick = () => {
    if (!validButtonUrl) return;
    window.open(validButtonUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[#0C1222] border border-indigo-500/40 rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative text-center">
        <button
          onClick={onClose}
          aria-label="Close popup"
          className="absolute top-3.5 right-3.5 z-10 text-slate-300 hover:text-white p-1.5 rounded-full bg-slate-950/75 border border-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {imageUrl && imageUrl.trim().length > 0 ? (
          <div className="w-full h-40 bg-slate-900 overflow-hidden border-b border-slate-800/80">
            <img
              src={imageUrl}
              alt={title || 'Announcement'}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        ) : (
          <div className="pt-6 pb-1">
            <div
              style={{
                background: 'linear-gradient(135deg, var(--theme-primary, #6366f1), var(--theme-secondary, #8b5cf6))',
              }}
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto text-white shadow-lg shadow-indigo-900/40"
            >
              <Bell className="w-7 h-7" />
            </div>
          </div>
        )}

        <div className="p-6 pt-4">
          {title && title.trim().length > 0 && (
            <h3 className="text-base font-extrabold text-white tracking-tight">{title}</h3>
          )}
          {message && message.trim().length > 0 && (
            <p className="text-xs text-slate-300 mt-2 leading-relaxed whitespace-pre-line">
              {message}
            </p>
          )}

          <div className="mt-5 space-y-2">
            {validButtonUrl && (
              <button
                onClick={handleActionClick}
                style={{
                  background: 'linear-gradient(135deg, var(--theme-primary, #6366f1), var(--theme-secondary, #8b5cf6))',
                }}
                className="w-full py-3 px-4 rounded-xl text-white font-extrabold text-xs tracking-wider uppercase shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <span>{buttonText && buttonText.trim().length > 0 ? buttonText : 'Learn More'}</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-slate-900/70 hover:bg-slate-800 text-xs font-semibold text-slate-300 hover:text-white border border-slate-800 transition-colors"
            >
              {closeText && closeText.trim().length > 0 ? closeText : 'Dismiss'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
