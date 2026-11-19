import React from 'react';
import { Home, Crown, User, LayoutDashboard } from 'lucide-react';
import type { TabType, PublicSettings } from '../types.ts';

interface BottomNavProps {
  currentTab: TabType;
  onChangeTab: (tab: TabType) => void;
  settings?: PublicSettings | null;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onChangeTab }) => {
  const tabs: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'home', label: 'HOME', icon: Home },
    { id: 'vip', label: 'VIP', icon: Crown },
    { id: 'profile', label: 'PROFILE', icon: User },
    { id: 'vip_dashboard', label: 'VIP DASHBOARD', icon: LayoutDashboard },
  ];

  return (
    <nav
      style={{ backgroundColor: 'var(--theme-bg, #090D16)' }}
      className="fixed bottom-0 left-0 right-0 z-40 backdrop-blur-lg border-t border-slate-800/80 max-w-lg mx-auto shadow-2xl"
    >
      <div className="grid grid-cols-4 h-16 items-center px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          const isVipDash = tab.id === 'vip_dashboard';

          return (
            <button
              key={tab.id}
              onClick={() => onChangeTab(tab.id)}
              style={{
                color: isActive
                  ? isVipDash
                    ? '#fbbf24'
                    : 'var(--theme-primary, #818cf8)'
                  : undefined,
              }}
              className={`flex flex-col items-center justify-center h-full relative transition-all duration-200 px-1 ${
                isActive ? '' : isVipDash ? 'text-amber-300/80 hover:text-amber-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span
                  style={{
                    backgroundColor: isVipDash ? '#fbbf24' : 'var(--theme-primary, #818cf8)',
                    boxShadow: isVipDash
                      ? '0 0 8px #fbbf24'
                      : '0 0 8px var(--theme-primary, #818cf8)',
                  }}
                  className="absolute top-1.5 w-1.5 h-1 rounded-full"
                />
              )}
              <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110 stroke-[2.2]' : 'stroke-[1.8]'}`} />
              <span className="text-[10px] sm:text-[11px] font-bold tracking-wider mt-1 truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};


