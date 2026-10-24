import React from 'react';
import LyraLogo from './LyraLogo';

export default function Header({ currentView = 'landing', onViewChange }) {
  const handleNavigation = (sectionId) => {
    if (currentView !== 'landing') {
      if (onViewChange) onViewChange('landing');
      setTimeout(() => {
        if (sectionId) {
          const el = document.getElementById(sectionId);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
    } else {
      if (sectionId) {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-black/20 border-b border-white/10 transition-all">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between relative">
        
        {/* Brand Logo - Exact 5-bar waveform logo */}
        <div 
          onClick={() => handleNavigation('hero')}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <LyraLogo />
          <span 
            className="text-xl font-bold uppercase tracking-[0.2em] text-white group-hover:text-[#e5a958] transition-colors"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Lyra
          </span>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-7 lg:gap-8 text-sm font-medium text-white/75 absolute left-1/2 -translate-x-1/2">
          {[
            ['features', 'How it works'],
            ['myvoice', 'My Voice'],
            ['models', 'Voices'],
            ['composers', 'Composers'],
            ['faq', 'FAQ'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleNavigation(id)}
              className="relative hover:text-white transition-colors cursor-pointer after:absolute after:left-0 after:-bottom-1 after:h-px after:w-0 after:bg-[#e5a958] after:transition-all hover:after:w-full"
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right Action */}
        <button
          type="button"
          onClick={() => onViewChange && onViewChange('studio')}
          className="bg-[#e5a958] hover:bg-[#f0bb6e] text-black px-5 py-2.5 rounded-full transition-all cursor-pointer text-sm font-semibold shadow-[0_0_24px_rgba(229,169,88,0.35)] hover:shadow-[0_0_36px_rgba(229,169,88,0.55)] active:scale-95"
        >
          Open Studio
        </button>

      </div>
    </header>
  );
}
