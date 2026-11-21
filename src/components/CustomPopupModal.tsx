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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="ra-panel ra-corners rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl relative text-center">
        <div className="h-1 w-full ra-hazard-bar" />

        <button
          onClick={onClose}
          aria-label="Close popup"
          className="absolute top-3.5 right-3.5 z-10 w-9 h-9 flex items-center justify-center text-[#C5C5C5] hover:text-[#F5F5F5] rounded-lg bg-[#090909]/90 border border-[#454545] hover:border-[#FF2525] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {imageUrl && imageUrl.trim().length > 0 ? (
          <div className="w-full h-44 bg-[#090909] overflow-hidden border-b border-[#454545]">
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
            <div className="w-14 h-14 rounded-2xl bg-[#090909] border border-[#FF2525]/55 flex items-center justify-center mx-auto text-[#FF2525]">
              <Bell className="w-6 h-6" />
            </div>
          </div>
        )}

        <div className="p-6 pt-4">
          {title && title.trim().length > 0 && (
            <h3 className="font-display text-base font-black text-[#F5F5F5] tracking-tight uppercase">
              {title}
            </h3>
          )}
          {message && message.trim().length > 0 && (
            <p className="text-xs text-[#C5C5C5] mt-2 leading-relaxed whitespace-pre-line">
              {message}
            </p>
          )}

          <div className="mt-5 space-y-2.5">
            {validButtonUrl && (
              <button
                onClick={handleActionClick}
                className="w-full min-h-[46px] py-2.5 px-4 rounded-xl ra-btn-primary font-display font-extrabold text-xs tracking-wider uppercase flex items-center justify-center gap-2"
              >
                <span>{buttonText && buttonText.trim().length > 0 ? buttonText : 'Learn More'}</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full min-h-[42px] py-2 rounded-xl ra-btn-secondary text-xs font-semibold text-[#C5C5C5]"
            >
              {closeText && closeText.trim().length > 0 ? closeText : 'Dismiss'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
