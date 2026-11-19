import React from 'react';
import { Wrench, Shield, Lock } from 'lucide-react';

interface MaintenanceScreenProps {
  onAdminLoginClick: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({ onAdminLoginClick }) => {
  return (
    <div className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-6 shadow-2xl shadow-amber-950/40">
        <Wrench className="w-10 h-10 animate-bounce" />
      </div>

      <h1 className="text-2xl font-extrabold text-white tracking-tight max-w-sm">
        Platform Under Maintenance
      </h1>
      <p className="text-sm text-slate-400 mt-2.5 max-w-sm leading-relaxed">
        Our engineers are deploying infrastructure upgrades to improve speed and security. We will be back online shortly.
      </p>

      <div className="mt-8 p-4 rounded-2xl bg-[#0C1222] border border-slate-800 max-w-xs w-full text-xs text-slate-400 space-y-1">
        <p className="font-semibold text-slate-200">Need immediate assistance?</p>
        <p>Check our official Telegram channel for live progress announcements.</p>
      </div>

      <div className="mt-10">
        <button
          onClick={onAdminLoginClick}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Staff & Administrator Access</span>
        </button>
      </div>
    </div>
  );
};
