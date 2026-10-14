import React from 'react';
import { Cpu } from 'lucide-react';

export default function Header({ currentView = 'landing', onViewChange, sysInfo = null }) {
  const handleNavigation = (targetId) => {
    if (currentView !== 'landing') {
      if (onViewChange) onViewChange('landing');
      setTimeout(() => {
        if (targetId) {
          const el = document.getElementById(targetId);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
    } else {
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <header className="border-b border-[#222] bg-[#0d0d0d]/95 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand - Clean static emblem without blinking dot or highlight glow */}
        <div 
          onClick={() => handleNavigation('overview')}
          className="flex items-center gap-3 cursor-pointer select-none"
        >
          <div className="w-9 h-9 rounded-xl bg-[#171717] border border-[#282828] flex items-center justify-center overflow-hidden">
            <img src="/lyra-logo.png" alt="Lyra" draggable={false} className="w-7 h-7 rounded-lg object-contain select-none pointer-events-none" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-tight text-white">
                Lyra
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded bg-[#1a1a1a] text-[#888] border border-[#2c2c2c]">
                Neural Studio
              </span>
            </div>
            <p className="text-[10px] text-[#666] hidden sm:block">
              Neural Timbre Conversion & Remastering
            </p>
          </div>
        </div>

        {/* Center Nav Links - Work seamlessly from both landing and studio pages */}
        <nav className="flex items-center gap-5 sm:gap-7 text-xs font-medium">
          <button
            type="button"
            onClick={() => handleNavigation('overview')}
            className={`transition-colors cursor-pointer ${
              currentView === 'landing' ? 'text-white font-semibold' : 'text-[#888] hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => handleNavigation('models')}
            className="text-[#888] hover:text-white transition-colors cursor-pointer"
          >
            Models
          </button>
          <button
            type="button"
            onClick={() => handleNavigation('pipeline')}
            className="text-[#888] hover:text-white transition-colors cursor-pointer"
          >
            Pipeline
          </button>
          <button
            type="button"
            onClick={() => handleNavigation('features')}
            className="text-[#888] hover:text-white transition-colors cursor-pointer"
          >
            Features
          </button>
          <button
            type="button"
            onClick={() => onViewChange && onViewChange('studio')}
            className={`transition-colors cursor-pointer ${
              currentView === 'studio' ? 'text-[#10a37f] font-bold' : 'text-[#888] hover:text-white'
            }`}
          >
            Studio
          </button>
        </nav>

        {/* Right Info - Hardware status pill only, no loud Launch Studio buttons */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141414] border border-[#242424] text-[#888]">
            <Cpu className="w-3.5 h-3.5 text-[#10a37f]" />
            <span className="hidden sm:inline">
              {sysInfo?.torch_device === 'mps' ? 'Apple Silicon MPS' : 'Neural Core'}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#1f1f1f] text-[#10a37f] font-mono">
              Ready
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
