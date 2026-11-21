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
    { id: 'vip_dashboard', label: 'VIP HUB', icon: LayoutDashboard },
  ];

  return (
    <nav
      aria-label="Primary Navigation"
      className="fixed bottom-2.5 inset-x-3 z-40 max-w-xl mx-auto rounded-2xl bg-[#141414]/96 backdrop-blur-md border border-[#454545] shadow-[0_14px_36px_rgba(5,14,32,0.45)]"
    >
      <div className="grid grid-cols-4 min-h-[62px] items-stretch p-1.5 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center min-h-[52px] rounded-xl border transition-all duration-150 px-1 active:scale-95 ${
                isActive
                  ? 'bg-[#FF2525]/14 border-[#FF2525]/65 text-[#FF2525]'
                  : 'border-transparent text-[#929292] hover:text-[#F5F5F5] hover:bg-[#1D1D1D]'
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2.5px] bg-[#FF2525]"
                />
              )}
              <Icon
                className={`w-[19px] h-[19px] transition-transform duration-150 ${
                  isActive ? 'scale-105 stroke-[2.3]' : 'stroke-[1.8]'
                }`}
              />
              <span className="font-display text-[10px] font-extrabold tracking-[0.09em] mt-1 truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

