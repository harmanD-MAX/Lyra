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

        {/* Center Nav Links - Perfectly Centered in Navbar */}
        <nav className="hidden md:flex items-center gap-7 lg:gap-8 text-sm font-medium text-white/80 absolute left-1/2 -translate-x-1/2">
          <button
            type="button"
            onClick={() => handleNavigation('features')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Features
          </button>
          <button
            type="button"
            onClick={() => handleNavigation('models')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Vocalists
          </button>
          <button
            type="button"
            onClick={() => handleNavigation('benchmarks')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Benchmarks
          </button>
          <button
            type="button"
            onClick={() => handleNavigation('pricing')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Pricing
          </button>
          <button
            type="button"
            onClick={() => handleNavigation('faq')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            FAQ
          </button>
        </nav>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-5 text-sm font-medium">
          <button
            type="button"
            onClick={() => onViewChange && onViewChange('studio')}
            className="text-white/85 hover:text-white transition-colors cursor-pointer px-2 py-1"
          >
            Sign in
          </button>
          
          <button
            type="button"
            onClick={() => onViewChange && onViewChange('studio')}
            className="bg-[#0e0f12] hover:bg-black text-white px-5 py-2.5 rounded-full border border-white/15 hover:border-white/30 transition-all cursor-pointer font-medium shadow-lg hover:shadow-xl active:scale-95"
          >
            Get Started
          </button>
        </div>

      </div>
    </header>
  );
}
