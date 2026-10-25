import React from 'react';
import LyraLogo from './LyraLogo';
import AccountMenu from './AccountMenu';

export default function Header({ currentView = 'landing', onViewChange, auth, onLogin, onOpenSongs }) {
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
    <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#07080a]/60 border-b border-white/[0.06] transition-all">
      <div className="max-w-7xl mx-auto px-6 h-16 sm:h-[4.5rem] flex items-center justify-between relative">
        
        {/* Brand Logo - Exact 5-bar waveform logo */}
        <div 
          onClick={() => handleNavigation('hero')}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <LyraLogo />
          <span 
            className="text-lg font-bold uppercase tracking-[0.22em] text-white group-hover:text-[#e5a958] transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Lyra
          </span>
        </div>

        {/* Center Nav Links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-white/75 absolute left-1/2 -translate-x-1/2">
          {[
            ['guide', 'How to use'],
            ['benchmarks', 'Benchmarks'],
            ['myvoice', 'Vocal Take'],
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
        <div className="flex items-center gap-3">
          {auth?.user ? (
            <AccountMenu user={auth.user} onSignOut={auth.signOut} onOpenSongs={onOpenSongs} />
          ) : auth && !auth.loading ? (
            <button type="button" onClick={onLogin} className="btn btn-secondary">
              Log in
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onViewChange && onViewChange('studio')}
            className="btn btn-primary"
          >
            Open Studio
          </button>
        </div>

      </div>
    </header>
  );
}
