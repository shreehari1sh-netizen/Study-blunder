import React from 'react';
import { Wrench, Lock } from 'lucide-react';

interface MaintenanceScreenProps {
  onAdminLoginClick: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ onAdminLoginClick }) => {
  return (
    <div className="min-h-screen ra-grid-bg bg-[#090909] flex flex-col items-center justify-center p-5 text-center text-[#F5F5F5]">
      <div className="ra-panel ra-corners rounded-2xl max-w-md w-full p-7 relative overflow-hidden">
        <div className="h-1.5 w-full ra-hazard-bar absolute top-0 left-0 right-0" />

        <div className="w-16 h-16 rounded-2xl bg-[#090909] border border-[#FF2525]/60 flex items-center justify-center text-[#FF2525] mx-auto mb-5 mt-2 shadow-[0_0_24px_rgba(255,37,37,0.18)]">
          <Wrench className="w-8 h-8" />
        </div>

        <p className="font-mono-tech text-[11px] font-bold uppercase tracking-[0.22em] text-[#FF2525] mb-1.5">
          SYSTEM LOCKDOWN · MAINTENANCE
        </p>

        <h1 className="font-display text-2xl font-black text-[#F5F5F5] tracking-tight uppercase">
          Command Hub Under Upgrade
        </h1>
        <p className="text-xs sm:text-sm text-[#C5C5C5] mt-2.5 leading-relaxed">
          Scheduled infrastructure maintenance is currently underway to upgrade performance and security. Access will resume shortly.
        </p>

        <div className="mt-6 p-4 rounded-xl bg-[#090909] border border-[#454545] text-xs text-[#929292] space-y-1 text-left">
          <p className="font-display font-bold uppercase tracking-wider text-[#F5F5F5]">
            Live Status Updates
          </p>
          <p>Check our official Telegram channel for real-time restoration updates.</p>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={onAdminLoginClick}
            className="w-full min-h-[46px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl ra-btn-secondary text-xs font-display font-bold uppercase tracking-wider"
          >
            <Lock className="w-3.5 h-3.5 text-[#FF2525]" />
            <span>Administrator Override</span>
          </button>
        </div>
      </div>
    </div>
  );
};
