import React, { useState, useEffect } from 'react';
import LyraLogo from './LyraLogo';
import { 
  MessageSquare, Music2, Sliders, Sparkles,
  Play, Pause, ArrowRight, Compass,
  Layers, Settings, MoreHorizontal, Check, Volume2,
  Cpu, Disc, Radio, ShieldCheck, ChevronDown,
  Clock, Zap, CheckCircle2, Headphones, Activity,
  BarChart3, TrendingUp, X, Upload, Mic, Download, RefreshCw
} from 'lucide-react';

export default function LandingPage({ onLaunchStudio }) {
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(38);
  const [previewModel, setPreviewModel] = useState('arijit_singh');
  const [previewStem, setPreviewStem] = useState('master');
  const [activeFaq, setActiveFaq] = useState(null);
  const [activeStoryStem, setActiveStoryStem] = useState('master');
  const [activeLegend, setActiveLegend] = useState('arijit');
  const [activeBenchmark, setActiveBenchmark] = useState('fidelity');

  // Simulated live playback timer for preview console
  useEffect(() => {
    let interval;
    if (isPlayingPreview) {
      interval = setInterval(() => {
        setPreviewProgress(prev => (prev >= 100 ? 0 : prev + 0.65));
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isPlayingPreview]);

  const previewVocalistMap = {
    arijit_singh: {
      name: 'Arijit Singh',
      vibe: 'Soulful Ballad & Warmth',
      track: 'Tum Hi Ho (Neural Studio Master)',
      genre: 'Romantic Acoustic • Grand Dolby Mix',
    },
    sonu_nigam: {
      name: 'Sonu Nigam',
      vibe: 'Classical Range & Laser Pitch',
      track: 'Kal Ho Naa Ho (Neural Studio Master)',
      genre: 'Orchestral Symphony • 3D Spatial Audio',
    },
    kk: {
      name: 'KK',
      vibe: 'Raw Rock Tenor & Power',
      track: 'Zara Sa (Neural Studio Master)',
      genre: 'High Belt Rock • Analog Tube Saturated',
    },
  };

  const formatPreviewTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Smooth Scroll-Driven Reveal Transitions (Natural Scrolling, Zero Hijacking)
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: '0px 0px -40px 0px'
    });

    const revealElements = document.querySelectorAll('.scroll-reveal, .story-section');
    revealElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const togglePreviewPlay = (e) => {
    if (e) e.stopPropagation();
    setIsPlayingPreview(!isPlayingPreview);
  };

  const toggleFaq = (index) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen text-white bg-[#0b0c0e] selection:bg-[#e5a958] selection:text-black">
      
      {/* =========================================================================
          HERO SECTION with Serene Ultra-Dark Luxury Acoustic Studio Background
         ========================================================================= */}
      <section id="hero" className="story-section relative min-h-screen w-full pt-32 pb-24 px-4 sm:px-6 flex flex-col items-center justify-center overflow-hidden">
        
        {/* Full Cinematic Background Image with Zero Text Clutter */}
        <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden">
          <img 
            src="/lyra_luxury_atmosphere.jpg" 
            alt="Lyra Luxury Audio Studio"
            className="w-full h-full object-cover object-center filter brightness-[0.68] contrast-[1.1]"
          />
          {/* Smooth Gradient Scrim for Crystal-Clear Text & Button Legibility */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b0c0e]/90 via-[#0b0c0e]/60 to-[#0b0c0e]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(11,12,14,0.3)_0%,_rgba(11,12,14,0.85)_80%)]" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-7 mt-4 sm:mt-8">
          
          {/* Hard-hitting Punchline Display Heading in Space Grotesk Font */}
          <h1 className="hero-headline text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.05] sm:leading-[1.0] pb-1 overflow-visible" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Your voice. <br />
            Reborn as a <span className="text-[#e5a958]">legend</span>.
          </h1>

          {/* Subtitle - Short, magnetic & memorable */}
          <p className="hero-subtext text-base sm:text-lg text-white/90 max-w-lg mx-auto font-normal leading-relaxed">
            Sing anything. Re-voice with Arijit, Sonu, or KK in one tap.
          </p>

          {/* Primary CTA Button */}
          <div className="pt-2 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => onLaunchStudio && onLaunchStudio()}
              className="group bg-[#0e0f12] hover:bg-black text-white px-9 py-4 rounded-full font-semibold text-base border border-white/20 hover:border-[#e5a958]/50 transition-all cursor-pointer shadow-[0_10px_35px_rgba(0,0,0,0.8)] hover:shadow-[0_0_40px_rgba(229,169,88,0.35)] flex items-center gap-3 active:scale-95"
            >
              <span>Create Your First Song</span>
              <ArrowRight className="w-4 h-4 text-white/70 group-hover:translate-x-1 group-hover:text-[#e5a958] transition-all" />
            </button>
            <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-white/60">
              Free Public Beta • Instant Neural Conversion
            </span>
          </div>

        </div>

        {/* =========================================================================
            Continuous Audio Pipeline Story Ribbon (Fluid, open, no clunky box cards)
           ========================================================================= */}
        <div className="relative z-10 max-w-5xl w-full mx-auto mt-14 sm:mt-18 px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 py-6 border-y border-white/10 backdrop-blur-md">
            
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#e5a958] flex-shrink-0">
                <Disc className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Universal Ingestion</div>
                <div className="text-xs text-white/50">Drop WAV, Spotify or YouTube</div>
              </div>
            </div>

            <div className="hidden sm:block w-8 h-[1px] bg-white/20" />

            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/90 flex-shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Pitch Lock™ Tracking</div>
                <div className="text-xs text-white/50">Micro-vibrato & portamento</div>
              </div>
            </div>

            <div className="hidden sm:block w-8 h-[1px] bg-white/20" />

            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#e5a958] flex-shrink-0">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Dolby 3D Acoustics</div>
                <div className="text-xs text-white/50">Binaural Haas soundstage</div>
              </div>
            </div>

          </div>
        </div>

        {/* =========================================================================
            Studio App Tablet Console Preview (Mirrors the Exact Real Studio Layout)
           ========================================================================= */}
        <div className="relative z-10 max-w-5xl w-full mx-auto mt-16 sm:mt-20">
          
          <div 
            className="rounded-t-[32px] sm:rounded-t-[40px] border-t-2 border-x-2 border-white/10 bg-[#121418] shadow-[0_-25px_80px_rgba(0,0,0,0.95)] overflow-hidden select-none"
          >
            {/* Top Mac/Studio Chrome Bar */}
            <div className="w-full flex items-center justify-between px-5 py-3.5 bg-[#0e1014] border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/50 border border-rose-500/30"></span>
                <span className="w-3 h-3 rounded-full bg-amber-500/50 border border-amber-500/30"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500/50 border border-emerald-500/30"></span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-white/50">
                <span className="w-1.5 h-1.5 rounded-full bg-[#e5a958] animate-pulse"></span>
                <span>Lyra Studio Workspace • Master Console</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onLaunchStudio && onLaunchStudio(previewModel)}
                  className="text-[11px] font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-[#e5a958] hover:text-black px-3.5 py-1 rounded-full border border-white/15 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <span>Open Studio</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 items-stretch min-h-[460px]">
              
              {/* Left Sidebar (Miniature of real StudioView sidebar) */}
              <div className="hidden md:flex md:col-span-4 bg-[#121418] border-r border-white/5 p-4 flex-col justify-between space-y-4">
                
                <div className="space-y-4">
                  {/* Logo + Back badge */}
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2.5">
                      <LyraLogo />
                      <span className="text-base font-bold uppercase tracking-[0.2em] text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Lyra</span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-white/50 border border-white/10">
                      Studio v2.4
                    </span>
                  </div>

                  {/* + New Song Button */}
                  <button
                    type="button"
                    onClick={() => onLaunchStudio && onLaunchStudio(previewModel)}
                    className="w-full bg-[#1b1e25] hover:bg-[#232731] active:scale-[0.98] text-white text-xs font-semibold py-2.5 px-3.5 rounded-xl border border-white/10 hover:border-[#e5a958]/40 flex items-center justify-start gap-2.5 transition-all shadow-sm cursor-pointer group"
                  >
                    <span className="text-base font-light leading-none text-[#e5a958] group-hover:scale-110 transition-transform">+</span>
                    <span className="font-semibold tracking-wide">New Song</span>
                  </button>

                  {/* Primary Nav Menu */}
                  <nav className="space-y-1 text-xs font-medium text-white/70">
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/5 text-white border border-white/10">
                      <div className="flex items-center gap-2.5">
                        <Compass className="w-4 h-4 text-[#e5a958]" />
                        <span className="font-semibold">Studio Workspace</span>
                      </div>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#e5a958]"></span>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl text-white/50 hover:text-white transition-colors">
                      <div className="flex items-center gap-2.5">
                        <Music2 className="w-4 h-4 text-white/40" />
                        <span>My Songs</span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-white/40">1</span>
                    </div>
                  </nav>

                  {/* Featured Vocalist Switcher */}
                  <div className="pt-2 border-t border-white/5 space-y-1.5">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-white/40 px-1 flex items-center justify-between">
                      <span>Target Vocalist</span>
                      <span className="text-[9px] font-mono text-[#e5a958]">Click to Switch</span>
                    </div>
                    
                    {[
                      { id: 'arijit_singh', name: 'Arijit Singh', vibe: 'Soulful Ballad & Warmth' },
                      { id: 'sonu_nigam', name: 'Sonu Nigam', vibe: 'Classical Range & Laser Pitch' },
                      { id: 'kk', name: 'KK', vibe: 'Raw Rock Tenor & Power' },
                    ].map(v => {
                      const isSel = (previewModel === v.id);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setPreviewModel(v.id)}
                          className={`w-full text-left p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                            isSel
                              ? 'bg-[#1e222a] border-[#e5a958]/50 text-white shadow-sm ring-1 ring-[#e5a958]/30'
                              : 'bg-[#15171d]/60 border-white/5 text-white/60 hover:text-white hover:border-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs text-white">{v.name}</span>
                            {isSel && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#e5a958]" />
                            )}
                          </div>
                          <div className="text-[10px] text-white/45 truncate mt-0.5">{v.vibe}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Hardware Status */}
                <div className="p-2.5 rounded-xl bg-[#17191f] border border-white/5 text-[10px] space-y-1">
                  <div className="flex items-center justify-between text-white/60 font-mono">
                    <span>Neural Engine</span>
                    <span className="text-[#e5a958]">Online</span>
                  </div>
                  <div className="text-[9px] text-white/40 truncate font-mono">
                    Apple Silicon Hardware Acceleration • 40kHz PCM
                  </div>
                </div>

              </div>

              {/* Right Main Studio Console (Exact replica of new Studio View player) */}
              <div className="md:col-span-8 p-4 sm:p-5 flex flex-col justify-between space-y-4 bg-[#0b0c0e]">
                
                {/* Master Track Header */}
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-[#e5a958] flex-shrink-0 shadow-lg relative overflow-hidden">
                      <Disc className={`w-6 h-6 text-[#e5a958] ${isPlayingPreview ? 'animate-spin-slow' : ''}`} />
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <h4 className="text-sm sm:text-base font-bold text-white tracking-tight truncate pb-0.5 leading-normal" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {previewVocalistMap[previewModel].track}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-white/60 flex-wrap">
                        <span className="font-semibold text-[#e5a958]">{previewVocalistMap[previewModel].name}</span>
                        <span className="text-white/30">•</span>
                        <span>Dolby 3D Grand Hall Master</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-1.5 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Pitch Lock Active
                  </span>
                </div>

                {/* Waveform Scrubber & Stem Player Dock */}
                <div className="bg-[#171a21] border border-white/10 rounded-2xl p-4 shadow-xl space-y-3">
                  
                  {/* Stem Selector Tabs */}
                  <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1 text-[11px]">
                    {[
                      { id: 'master', label: 'Master 3D Mix' },
                      { id: 'vocal', label: `${previewVocalistMap[previewModel].name} Solo Vocal` },
                      { id: 'instrumental', label: 'Solo Instrumental' },
                      { id: 'dry', label: 'Dry Reference' },
                    ].map(st => {
                      const isStActive = (previewStem === st.id);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setPreviewStem(st.id)}
                          className={`px-2.5 py-1 rounded-lg border font-mono text-[10px] transition-all cursor-pointer whitespace-nowrap ${
                            isStActive
                              ? 'bg-[#e5a958]/20 border-[#e5a958]/50 text-[#e5a958] font-semibold shadow-sm'
                              : 'bg-white/5 border-white/5 text-white/50 hover:text-white'
                          }`}
                        >
                          {st.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Main Scrubber Row: Play Button + Animated Waveform Bars + Time */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={togglePreviewPlay}
                      className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#e5a958] to-[#ffcf87] text-black flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
                      title={isPlayingPreview ? "Pause Preview" : "Play Preview"}
                    >
                      {isPlayingPreview ? (
                        <Pause className="w-4 h-4 fill-black text-black" />
                      ) : (
                        <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                      )}
                    </button>

                    {/* Waveform Bars */}
                    <div className="flex-1 flex items-center gap-[2px] h-9 overflow-hidden px-1">
                      {[
                        20, 32, 48, 70, 85, 56, 38, 52, 75, 92, 98, 72, 60, 42,
                        55, 78, 88, 95, 82, 64, 48, 66, 85, 98, 75, 54, 36, 48,
                        64, 80, 92, 68, 52, 34, 46, 70, 86, 94, 80, 62, 42, 26
                      ].map((h, idx) => {
                        const pct = (idx / 42) * 100;
                        const isPlayed = pct <= previewProgress;
                        return (
                          <span
                            key={idx}
                            style={{ 
                              height: isPlayingPreview ? `${Math.max(15, (h * (0.7 + 0.3 * Math.sin(idx + previewProgress * 0.2))))}%` : `${h}%` 
                            }}
                            className={`w-[2.5px] rounded-full transition-all duration-150 ${
                              isPlayed 
                                ? 'bg-gradient-to-t from-[#e5a958] to-[#ffcf87] shadow-[0_0_6px_rgba(229,169,88,0.5)]' 
                                : 'bg-white/20'
                            }`}
                          />
                        );
                      })}
                    </div>

                    <div className="text-[11px] font-mono text-white/70 flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[#e5a958] font-bold">
                        {formatPreviewTime(Math.floor((previewProgress / 100) * 192))}
                      </span>
                      <span className="text-white/30">/</span>
                      <span>03:12</span>
                    </div>
                  </div>

                </div>

                {/* 4-Stems Precision Mixing Rack (Miniature sliders) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {[
                    { label: 'Lead Vocal', val: '92%', peak: 'bg-[#e5a958]' },
                    { label: 'Backing Stems', val: '82%', peak: 'bg-emerald-400' },
                    { label: 'Bass & Drums', val: '76%', peak: 'bg-sky-400' },
                    { label: 'Hall Reverb', val: '88%', peak: 'bg-purple-400' },
                  ].map((stem, i) => (
                    <div key={i} className="bg-[#14161c] border border-white/5 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] text-white/60">
                        <span className="truncate">{stem.label}</span>
                        <span className="font-mono text-[#e5a958]">{stem.val}</span>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${stem.peak}`} style={{ width: stem.val }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* 4-Pillar Dolby Studio Mastering Rack Badges */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {[
                    { title: 'Dolby Atmos 3D', sub: 'Spatial Audio ON' },
                    { title: 'Acoustic Space', sub: 'Concert Hall ON' },
                    { title: 'Timbre Exciter', sub: '+2.5dB Tube ON' },
                    { title: 'Multi-Band Comp', sub: 'Broadcast Master' },
                  ].map((p, i) => (
                    <div key={i} className="bg-[#14161c] border border-white/5 rounded-xl p-2 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold text-white/90 truncate">{p.title}</div>
                        <div className="text-[9px] font-mono text-[#e5a958]/90 truncate">{p.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>

              </div>

            </div>

          </div>

        </div>

      </section>

      {/* =========================================================================
          SECTION: ICONIC VOCAL TIMBRE (Chapter 02: Flagship Vocalist Showcase)
         ========================================================================= */}
      <section id="models" className="story-section min-h-screen flex flex-col justify-center py-20 px-6 max-w-6xl mx-auto border-t border-white/10 relative">

        <div className="scroll-reveal text-center max-w-2xl mx-auto space-y-4 mb-16 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono tracking-widest uppercase text-[#e5a958]">
            <span>Chapter 02</span>
            <span>•</span>
            <span>Iconic Vocal Models</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Trained on musical legends.
          </h2>
          <p className="text-sm text-white/70 leading-relaxed font-normal">
            Three master vocal engines engineered with micro-timbre fidelity and uncapped dynamic range.
          </p>
        </div>

        {/* 3-Column Luxury Interactive Artist Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 relative z-10">
          
          {/* ARTIST 1: ARIJIT SINGH */}
          <div 
            onClick={() => onLaunchStudio && onLaunchStudio('arijit_singh')}
            className="scroll-reveal reveal-delay-1 rounded-3xl p-8 bg-[#111318]/90 border border-white/10 hover:border-[#e5a958]/50 hover:bg-[#151821] transition-all duration-300 flex flex-col justify-between space-y-6 shadow-xl cursor-pointer group relative overflow-hidden"
          >
            {/* Ambient Corner Glow on Hover */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#e5a958]/10 rounded-full blur-2xl pointer-events-none group-hover:bg-[#e5a958]/20 transition-all duration-500" />

            <div className="space-y-5 relative z-10">
              {/* Top Row: Artist Monogram & Model Tag */}
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-black/40 border border-[#e5a958]/30 flex items-center justify-center font-bold text-sm text-[#e5a958] shadow-inner group-hover:scale-105 group-hover:border-[#e5a958] transition-all" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  AS
                </div>
                <span className="text-[10px] font-mono tracking-widest text-[#e5a958] uppercase px-2.5 py-1 rounded-full bg-[#e5a958]/10 border border-[#e5a958]/20">
                  Model 01 • Ballad
                </span>
              </div>

              {/* Artist Name & Tagline */}
              <div className="space-y-1.5">
                <h3 className="text-3xl font-bold text-white tracking-tight group-hover:text-[#e5a958] transition-colors" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Arijit Singh
                </h3>
                <p className="text-xs text-white/50 font-medium">
                  Soulful Ballad & Acoustic Intimacy
                </p>
              </div>

              <p className="text-xs text-white/70 leading-relaxed font-normal">
                Warm chest resonance, delicate breath phrasing, and emotional acoustic dynamics for soul, pop, and ballads.
              </p>

              {/* Dynamic Sound Waveform Timbre Spectrum */}
              <div className="pt-2">
                <div className="flex items-center justify-between text-[10px] text-white/40 font-mono mb-2">
                  <span>Timbre Spectrum</span>
                  <span className="text-[#e5a958]">40kHz Resonant</span>
                </div>
                <div className="flex items-end gap-[3px] h-9 px-3 py-1.5 rounded-xl bg-black/40 border border-white/5">
                  {[28, 42, 65, 85, 96, 75, 58, 48, 62, 78, 88, 70, 52, 38, 50, 68, 82, 60].map((h, i) => (
                    <span 
                      key={i} 
                      style={{ height: `${h}%` }} 
                      className="flex-1 bg-white/20 rounded-full group-hover:bg-[#e5a958] transition-all duration-300"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Specs & Interactive Link (No clunky button) */}
            <div className="space-y-3 pt-4 border-t border-white/5 relative z-10">
              <div className="flex items-center justify-between text-xs font-mono text-white/50">
                <div>Range: <span className="text-white font-medium">E2 – C5</span></div>
                <div className="w-1 h-1 rounded-full bg-white/20" />
                <div>Style: <span className="text-white font-medium">Acoustic Soul</span></div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-white/60 group-hover:text-[#e5a958] transition-colors pt-1">
                <span>Load in Studio</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
              </div>
            </div>
          </div>

          {/* ARTIST 2: SONU NIGAM */}
          <div 
            onClick={() => onLaunchStudio && onLaunchStudio('sonu_nigam')}
            className="scroll-reveal reveal-delay-2 rounded-3xl p-8 bg-[#111318]/90 border border-white/10 hover:border-[#e5a958]/50 hover:bg-[#151821] transition-all duration-300 flex flex-col justify-between space-y-6 shadow-xl cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#e5a958]/10 rounded-full blur-2xl pointer-events-none group-hover:bg-[#e5a958]/20 transition-all duration-500" />

            <div className="space-y-5 relative z-10">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-black/40 border border-[#e5a958]/30 flex items-center justify-center font-bold text-sm text-[#e5a958] shadow-inner group-hover:scale-105 group-hover:border-[#e5a958] transition-all" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  SN
                </div>
                <span className="text-[10px] font-mono tracking-widest text-[#e5a958] uppercase px-2.5 py-1 rounded-full bg-[#e5a958]/10 border border-[#e5a958]/20">
                  Model 02 • Classical
                </span>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-3xl font-bold text-white tracking-tight group-hover:text-[#e5a958] transition-colors" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Sonu Nigam
                </h3>
                <p className="text-xs text-white/50 font-medium">
                  Classical Precision & Laser Pitch
                </p>
              </div>

              <p className="text-xs text-white/70 leading-relaxed font-normal">
                Classical agility, micro-pitch ornamentation, and crystalline articulation across 3.5 octaves.
              </p>

              <div className="pt-2">
                <div className="flex items-center justify-between text-[10px] text-white/40 font-mono mb-2">
                  <span>Timbre Spectrum</span>
                  <span className="text-[#e5a958]">Sub-Cent Intonation</span>
                </div>
                <div className="flex items-end gap-[3px] h-9 px-3 py-1.5 rounded-xl bg-black/40 border border-white/5">
                  {[35, 50, 72, 88, 70, 85, 95, 78, 60, 75, 90, 82, 65, 48, 60, 74, 85, 68].map((h, i) => (
                    <span 
                      key={i} 
                      style={{ height: `${h}%` }} 
                      className="flex-1 bg-white/20 rounded-full group-hover:bg-[#e5a958] transition-all duration-300"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/5 relative z-10">
              <div className="flex items-center justify-between text-xs font-mono text-white/50">
                <div>Range: <span className="text-white font-medium">F2 – F5</span></div>
                <div className="w-1 h-1 rounded-full bg-white/20" />
                <div>Style: <span className="text-white font-medium">Classical Agility</span></div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-white/60 group-hover:text-[#e5a958] transition-colors pt-1">
                <span>Load in Studio</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
              </div>
            </div>
          </div>

          {/* ARTIST 3: KK */}
          <div 
            onClick={() => onLaunchStudio && onLaunchStudio('kk')}
            className="scroll-reveal reveal-delay-3 rounded-3xl p-8 bg-[#111318]/90 border border-white/10 hover:border-[#e5a958]/50 hover:bg-[#151821] transition-all duration-300 flex flex-col justify-between space-y-6 shadow-xl cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#e5a958]/10 rounded-full blur-2xl pointer-events-none group-hover:bg-[#e5a958]/20 transition-all duration-500" />

            <div className="space-y-5 relative z-10">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-black/40 border border-[#e5a958]/30 flex items-center justify-center font-bold text-sm text-[#e5a958] shadow-inner group-hover:scale-105 group-hover:border-[#e5a958] transition-all" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  KK
                </div>
                <span className="text-[10px] font-mono tracking-widest text-[#e5a958] uppercase px-2.5 py-1 rounded-full bg-[#e5a958]/10 border border-[#e5a958]/20">
                  Model 03 • Arena Rock
                </span>
              </div>

              <div className="space-y-1.5">
                <h3 className="text-3xl font-bold text-white tracking-tight group-hover:text-[#e5a958] transition-colors" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  KK
                </h3>
                <p className="text-xs text-white/50 font-medium">
                  Raw Rock Tenor & Stadium Power
                </p>
              </div>

              <p className="text-xs text-white/70 leading-relaxed font-normal">
                Iconic straight-tone rock belting, stadium bite, and piercing high tenor projection for power ballads and rock.
              </p>

              <div className="pt-2">
                <div className="flex items-center justify-between text-[10px] text-white/40 font-mono mb-2">
                  <span>Timbre Spectrum</span>
                  <span className="text-[#e5a958]">High Dynamic Belt</span>
                </div>
                <div className="flex items-end gap-[3px] h-9 px-3 py-1.5 rounded-xl bg-black/40 border border-white/5">
                  {[45, 62, 80, 95, 100, 90, 75, 68, 82, 98, 92, 80, 64, 52, 70, 86, 94, 75].map((h, i) => (
                    <span 
                      key={i} 
                      style={{ height: `${h}%` }} 
                      className="flex-1 bg-white/20 rounded-full group-hover:bg-[#e5a958] transition-all duration-300"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/5 relative z-10">
              <div className="flex items-center justify-between text-xs font-mono text-white/50">
                <div>Range: <span className="text-white font-medium">G2 – D5</span></div>
                <div className="w-1 h-1 rounded-full bg-white/20" />
                <div>Style: <span className="text-white font-medium">High Rock Belt</span></div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-white/60 group-hover:text-[#e5a958] transition-colors pt-1">
                <span>Load in Studio</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform" />
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* =========================================================================
          SECTION: STUDIO CAPABILITIES (Chapter 03 - Fluid Architecture Journey)
         ========================================================================= */}
      <section id="features" className="story-section min-h-screen flex flex-col justify-center py-20 px-6 max-w-6xl mx-auto border-t border-white/10 relative">
        <div className="scroll-reveal text-center max-w-2xl mx-auto space-y-4 mb-16 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono tracking-widest uppercase text-[#e5a958]">
            <span>Chapter 03</span>
            <span>•</span>
            <span>Studio Capabilities</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            How music comes to life in Lyra
          </h2>
          <p className="text-sm text-white/70 leading-relaxed font-normal">
            A seamless studio pipeline that takes raw vocals and elevates them to release-ready master tracks.
          </p>
        </div>

        {/* 2-Column Borderless Narrative Experience */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start relative z-10">
          
          {/* Column 1: Progressive 4-Step Narrative Flow */}
          <div className="scroll-reveal lg:col-span-6 space-y-8">
            
            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-[#e5a958]/10 border border-[#e5a958]/30 flex items-center justify-center text-xs font-mono text-[#e5a958] flex-shrink-0">
                01
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-white">Universal Ingestion Engine</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  Drop lossless audio files (WAV, MP3, FLAC), paste any Spotify track URL or YouTube video link, or record live through your studio microphone.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-mono text-white/90 flex-shrink-0">
                02
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-white">Pitch Lock™ Neural Synthesis</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  Decouples vocal tremors and authentic ornamentation from pitch errors, delivering natural expression without digital autotune flattening.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-mono text-white/90 flex-shrink-0">
                03
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-white">Zero-Crosstalk 4-Track Isolation</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  Isolates converted lead vocals, instrumental backing, and reference stems with a -96dB noise floor and zero cymbal bleed.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="w-8 h-8 rounded-full bg-[#e5a958]/10 border border-[#e5a958]/30 flex items-center justify-center text-xs font-mono text-[#e5a958] flex-shrink-0">
                04
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-semibold text-white">Dolby 3D Acoustics & Lossless Export</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  Shapes final spatial Haas width, vocal ducking, and Grand Hall reverb tail. Instant download in 32-bit float WAV or 320k MP3.
                </p>
              </div>
            </div>

          </div>

          {/* Column 2: Pure Visual 4-Stem Acoustic Canvas (Completely Locked & Non-Interactive) */}
          <div className="scroll-reveal reveal-delay-2 lg:col-span-6 bg-[#13151b] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 pointer-events-none select-none">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-white uppercase tracking-wider">4-Stem Acoustic Canvas</div>
                <div className="text-[11px] text-white/50">Continuous discrete isolation pipeline without crosstalk</div>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-white/5 text-[#e5a958] border border-white/10">
                Hardware Isolation • Locked
              </span>
            </div>

            <div className="space-y-2.5">
              {[
                { id: 'master', name: 'Master 3D', desc: 'Full Dolby 3D binaural master mix', color: '#e5a958' },
                { id: 'vocal', name: 'Solo Vocal Stem', desc: 'Pure isolated converted vocal without music', color: 'rgba(255, 255, 255, 0.9)' },
                { id: 'music', name: 'Backing Instrumental', desc: 'Surgically separated backing music track', color: 'rgba(255, 255, 255, 0.6)' },
                { id: 'ref', name: 'Reference Vocal', desc: 'Original dry input guide vocal', color: 'rgba(255, 255, 255, 0.4)' }
              ].map(s => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-2.5 h-2.5 rounded-full" 
                      style={{ backgroundColor: s.color }} 
                    />
                    <div>
                      <div className="text-xs font-semibold text-white">{s.name}</div>
                      <div className="text-[10px] text-white/50">{s.desc}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 h-3 px-2 py-0.5 rounded bg-white/10">
                    <span className="w-0.5 h-3 bg-white rounded-full" />
                    <span className="w-0.5 h-4 bg-white rounded-full" />
                    <span className="w-0.5 h-2 bg-white rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* =========================================================================
          SECTION: OBJECTIVE GRAPHICAL BENCHMARKS (Chapter 04: Empirical Audio Data)
         ========================================================================= */}
      <section id="benchmarks" className="story-section min-h-screen flex flex-col justify-center py-20 px-6 max-w-6xl mx-auto border-t border-white/10 relative">
        {/* Ambient Backlight */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-gradient-to-r from-[#e5a958]/5 via-amber-500/5 to-purple-500/5 blur-3xl pointer-events-none rounded-full" />

        <div className="scroll-reveal text-center max-w-2xl mx-auto space-y-4 mb-16 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono tracking-widest uppercase text-[#e5a958]">
            <span>Chapter 04</span>
            <span>•</span>
            <span>Empirical Audio Data</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Engineered to outperform.
          </h2>
          <p className="text-sm text-white/70 leading-relaxed font-normal">
            Rigorous audio engineering benchmarks comparing Lyra to generic voice AI and traditional DSP algorithms.
          </p>
        </div>

        {/* Empirical Audio Engineering Telemetry Console */}
        {(() => {
          const benchmarkData = {
            fidelity: {
              id: 'fidelity',
              tabLabel: '01 • Harmonic Fidelity & Vibrato',
              title: 'Acoustic Fidelity & Micro-Vibrato Retention',
              subtitle: 'Evaluates dynamic preservation of breath transients and vocal vibrato as song complexity increases from raw input to full studio master.',
              metricLyra: '99.8%',
              metricLyraNote: 'Continuous Harmonic Retention • Zero Quantization',
              metricLyraSummary: 'Lyra scales dynamically without plateauing, capturing 99.8% of vocal nuances and emotional micro-tremors.',
              metricAi: '41.2%',
              metricAiNote: 'Robotic Quantization Ceiling',
              metricAiSummary: 'Generic voice AI services degrade under vocal dynamics, flattening emotional vibrato into autotune snaps.',
              metricDsp: '34.0%',
              metricDspNote: 'Phase Distortion Limit',
              metricDspSummary: 'Traditional DSP pitch plugins suffer from comb filtering and phase cancellation on complex arrangements.',
              lyraPath: 'M 85,275 C 190,265 310,170 432,115 C 540,68 660,52 780,46',
              lyraArea: 'M 85,275 C 190,265 310,170 432,115 C 540,68 660,52 780,46 L 780,275 L 85,275 Z',
              aiPath: 'M 85,275 C 180,250 290,185 432,165 C 540,150 660,185 780,180',
              dspPath: 'M 85,275 C 170,255 290,210 432,192 C 550,180 670,205 780,197',
              lyraPeakX: 780,
              lyraPeakY: 46,
              lyraCallout: 'Lyra Studio: 99.8%',
              aiPeakX: 780,
              aiPeakY: 180,
              aiCallout: 'Generic AI: 41.2%',
              dspPeakX: 780,
              dspPeakY: 197,
              dspCallout: 'Traditional DSP: 34.0%',
              chartFooter: 'Harmonic Fidelity Curve • Continuous Progression from Raw Audio to Release Master.'
            },
            pitch: {
              id: 'pitch',
              tabLabel: '02 • Pitch Tracking Accuracy',
              title: 'Continuous Pitch Tracking & Intonation Lock',
              subtitle: 'Measures vocal pitch tracking precision across rapid ornamentations, fast trills, and high-belt emotional expression.',
              metricLyra: '99.5%',
              metricLyraNote: 'Sub-Cent Accuracy • Uncapped Pitch Lock™',
              metricLyraSummary: 'Pitch Lock™ preserves natural ornamentation without autotune flattening or quantization drift.',
              metricAi: '45.0%',
              metricAiNote: 'Stair-Step Autotune Quantization',
              metricAiSummary: 'Stair-steps on fast ornaments, introducing mechanical artifacts and pitch drift.',
              metricDsp: '38.5%',
              metricDspNote: 'Latency Phase Lag',
              metricDspSummary: 'Traditional algorithms suffer from latency-induced overshoot on fast portamento notes.',
              lyraPath: 'M 85,275 C 185,260 300,160 432,108 C 540,65 660,50 780,46',
              lyraArea: 'M 85,275 C 185,260 300,160 432,108 C 540,65 660,50 780,46 L 780,275 L 85,275 Z',
              aiPath: 'M 85,275 C 180,240 300,175 432,158 C 550,145 670,182 780,171',
              dspPath: 'M 85,275 C 170,250 290,205 432,185 C 550,172 670,198 780,187',
              lyraPeakX: 780,
              lyraPeakY: 46,
              lyraCallout: 'Lyra Studio: 99.5%',
              aiPeakX: 780,
              aiPeakY: 171,
              aiCallout: 'Generic AI: 45.0%',
              dspPeakX: 780,
              dspPeakY: 187,
              dspCallout: 'Traditional DSP: 38.5%',
              chartFooter: 'Pitch Accuracy & Intonation Precision • Origin (0,0) to 100% Intonation Lock.'
            },
            isolation: {
              id: 'isolation',
              tabLabel: '03 • Stem Separation Purity',
              title: 'Discrete Stem Separation & Noise Floor Purity',
              subtitle: 'Tracks background crosstalk rejection across multitrack stems from raw mixed song to fully separated lead vocal.',
              metricLyra: '99.9%',
              metricLyraNote: '-96.2 dB Studio Floor • Zero Crosstalk',
              metricLyraSummary: 'Pristine black silence behind separated vocals with zero cymbal wash or drum bleed.',
              metricAi: '44.5%',
              metricAiNote: 'Cymbal & Snare Wash Bleed',
              metricAiSummary: 'Audible background wash and drum transients leak into the vocal stem.',
              metricDsp: '32.0%',
              metricDspNote: 'Phase Cancellation Flange',
              metricDspSummary: 'Audible comb filtering and hollow phase artifacts on complex multitrack arrangements.',
              lyraPath: 'M 85,275 C 180,250 290,145 432,95 C 530,55 650,47 780,45',
              lyraArea: 'M 85,275 C 180,250 290,145 432,95 C 530,55 650,47 780,45 L 780,275 L 85,275 Z',
              aiPath: 'M 85,275 C 180,245 300,170 432,160 C 540,150 670,180 780,173',
              dspPath: 'M 85,275 C 170,255 290,215 432,198 C 540,185 670,212 780,201',
              lyraPeakX: 780,
              lyraPeakY: 45,
              lyraCallout: 'Lyra Studio: 99.9%',
              aiPeakX: 780,
              aiPeakY: 173,
              aiCallout: 'Generic AI: 44.5%',
              dspPeakX: 780,
              dspPeakY: 201,
              dspCallout: 'Traditional DSP: 32.0%',
              chartFooter: 'Crosstalk Rejection Purity • Origin (0,0) to 100% Studio Silence.'
            }
          };

          const currentParam = benchmarkData[activeBenchmark] || benchmarkData.fidelity;

          return (
            <div className="scroll-reveal bg-[#121418] border border-white/10 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 mb-12 relative z-10 overflow-hidden">
              
              {/* Top Parameter Selector & Legend Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="space-y-1">
                  <span className="text-[11px] font-mono text-[#e5a958] uppercase tracking-wider block">
                    Performance Telemetry
                  </span>
                  <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {currentParam.title}
                  </h3>
                  <p className="text-xs text-white/60 max-w-2xl leading-relaxed">
                    {currentParam.subtitle}
                  </p>
                </div>

                {/* Graph Legend Indicators */}
                <div className="flex items-center gap-4 text-xs font-mono self-start sm:self-auto flex-shrink-0">
                  <div className="flex items-center gap-1.5 text-[#e5a958]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#e5a958] shadow-[0_0_8px_#e5a958]" />
                    <span className="font-semibold">Lyra Studio Engine</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-2.5 h-0.5 bg-slate-400" />
                    <span>Industry Voice AI</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/40 hidden md:flex">
                    <span className="w-2.5 h-0.5 border-b border-dotted border-white/40" />
                    <span>Traditional DSP</span>
                  </div>
                </div>
              </div>

              {/* 3 Interactive Parameter Selection Tabs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-[#0e1014] p-1.5 rounded-2xl border border-white/5">
                {[
                  { id: 'fidelity', label: '01 • Harmonic Fidelity & Vibrato' },
                  { id: 'pitch', label: '02 • Pitch Tracking Accuracy' },
                  { id: 'isolation', label: '03 • Stem Separation Purity' }
                ].map(tab => {
                  const isActive = (activeBenchmark === tab.id);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveBenchmark(tab.id)}
                      className={`py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer text-center ${
                        isActive
                          ? 'bg-[#1e222a] text-[#e5a958] shadow-md border border-white/10'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Dynamic Animated Empirical Trendline Graph (Accurate Curves, Proper Coordinates) */}
              <div className="relative w-full bg-[#0a0c0f] rounded-2xl border border-white/10 p-4 sm:p-6 shadow-inner">
                
                {/* SVG Coordinate Chart */}
                <div className="w-full aspect-[21/9] min-h-[280px] max-h-[380px]">
                  <svg 
                    viewBox="0 0 860 340" 
                    className="w-full h-full overflow-visible"
                  >
                    <defs>
                      {/* Gradient Fill under Lyra Curve */}
                      <linearGradient id="lyraAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e5a958" stopOpacity="0.25" />
                        <stop offset="70%" stopColor="#e5a958" stopOpacity="0.03" />
                        <stop offset="100%" stopColor="#e5a958" stopOpacity="0.0" />
                      </linearGradient>

                      {/* Golden Curve Stroke Gradient */}
                      <linearGradient id="lyraStrokeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#d4943f" />
                        <stop offset="50%" stopColor="#e5a958" />
                        <stop offset="100%" stopColor="#ffeaad" />
                      </linearGradient>

                      {/* Glow Filter for Golden Line */}
                      <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#e5a958" floodOpacity="0.5" />
                      </filter>
                    </defs>

                    {/* Horizontal Coordinate Grid Lines (Y-Axis: Fidelity %) */}
                    {[
                      { y: 46, label: '100%' },
                      { y: 103, label: '75%' },
                      { y: 160, label: '50%' },
                      { y: 218, label: '25%' },
                      { y: 275, label: '0%' }
                    ].map(grid => (
                      <g key={grid.y}>
                        <line 
                          x1="85" 
                          y1={grid.y} 
                          x2="780" 
                          y2={grid.y} 
                          stroke="rgba(255,255,255,0.06)" 
                          strokeDasharray={grid.y === 275 ? 'none' : '4 4'}
                          strokeWidth={grid.y === 275 ? '1.5' : '1'}
                        />
                        <text 
                          x="72" 
                          y={grid.y + 4} 
                          fill="rgba(255,255,255,0.4)" 
                          fontSize="11" 
                          fontFamily="monospace" 
                          textAnchor="end"
                        >
                          {grid.label}
                        </text>
                      </g>
                    ))}

                    {/* Vertical Progression Grid Lines (X-Axis: Audio Stages) */}
                    {[
                      { x: 85, label: 'Raw Audio', stage: 'Stage 01' },
                      { x: 258, label: 'Pitch Track', stage: 'Stage 02' },
                      { x: 432, label: 'Vocal Nuance', stage: 'Stage 03' },
                      { x: 606, label: 'Dynamic Belt', stage: 'Stage 04' },
                      { x: 780, label: 'Studio Master', stage: 'Stage 05' }
                    ].map((grid, idx) => (
                      <g key={idx}>
                        <line 
                          x1={grid.x} 
                          y1="46" 
                          x2={grid.x} 
                          y2="275" 
                          stroke="rgba(255,255,255,0.04)" 
                          strokeDasharray="4 4" 
                        />
                        <text 
                          x={grid.x} 
                          y="298" 
                          fill="rgba(255,255,255,0.5)" 
                          fontSize="11" 
                          fontFamily="monospace" 
                          textAnchor={idx === 0 ? 'start' : idx === 4 ? 'end' : 'middle'}
                        >
                          {grid.label}
                        </text>
                        <text 
                          x={grid.x} 
                          y="314" 
                          fill="rgba(255,255,255,0.25)" 
                          fontSize="9" 
                          fontFamily="monospace" 
                          textAnchor={idx === 0 ? 'start' : idx === 4 ? 'end' : 'middle'}
                        >
                          {grid.stage}
                        </text>
                      </g>
                    ))}

                    {/* TRENDLINE 3: Traditional DSP Plugins (Drops under load, Dotted white) */}
                    <path
                      d={currentParam.dspPath}
                      fill="none"
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      className="transition-all duration-500 ease-out"
                    />
                    <circle cx={currentParam.dspPeakX} cy={currentParam.dspPeakY} r="3" fill="rgba(255,255,255,0.4)" />
                    <text 
                      x={currentParam.dspPeakX - 10} 
                      y={currentParam.dspPeakY + 16} 
                      fill="rgba(255,255,255,0.45)" 
                      fontSize="10" 
                      fontFamily="monospace" 
                      textAnchor="end"
                    >
                      {currentParam.dspCallout}
                    </text>

                    {/* TRENDLINE 2: Industry Voice AI (Plateaus & falls, Dashed slate) */}
                    <path
                      d={currentParam.aiPath}
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.75)"
                      strokeWidth="2.5"
                      strokeDasharray="6 4"
                      className="transition-all duration-500 ease-out"
                    />
                    <circle cx={currentParam.aiPeakX} cy={currentParam.aiPeakY} r="3.5" fill="#94a3b8" />
                    <text 
                      x={currentParam.aiPeakX - 10} 
                      y={currentParam.aiPeakY - 8} 
                      fill="#94a3b8" 
                      fontSize="10" 
                      fontFamily="monospace" 
                      fontWeight="bold"
                      textAnchor="end"
                    >
                      {currentParam.aiCallout}
                    </text>

                    {/* TRENDLINE 1: LYRA STUDIO ENGINE (Dynamic Soaring Exponential Curve to 99.8%+) */}
                    <path
                      d={currentParam.lyraArea}
                      fill="url(#lyraAreaGrad)"
                      className="transition-all duration-500 ease-out"
                    />
                    <path
                      d={currentParam.lyraPath}
                      fill="none"
                      stroke="url(#lyraStrokeGrad)"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      filter="url(#goldGlow)"
                      className="transition-all duration-500 ease-out"
                    />

                    {/* Lyra Peak Marker */}
                    <circle 
                      cx={currentParam.lyraPeakX} 
                      cy={currentParam.lyraPeakY} 
                      r="4.5" 
                      fill="#ffffff" 
                      stroke="#e5a958"
                      strokeWidth="2"
                    />

                    {/* Lyra Callout Badge on Graph */}
                    <g transform={`translate(${currentParam.lyraPeakX - 145}, ${currentParam.lyraPeakY - 26})`}>
                      <rect 
                        x="0" 
                        y="0" 
                        width="140" 
                        height="22" 
                        rx="11" 
                        fill="#121418" 
                        stroke="#e5a958" 
                        strokeWidth="1.2" 
                      />
                      <text 
                        x="70" 
                        y="14" 
                        fill="#ffeaad" 
                        fontSize="10" 
                        fontFamily="monospace" 
                        fontWeight="bold" 
                        textAnchor="middle"
                      >
                        {currentParam.lyraCallout}
                      </text>
                    </g>
                  </svg>
                </div>

                {/* Subtitle Explaining Graph */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-3 border-t border-white/5 text-[11px] font-mono text-white/50">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{currentParam.chartFooter}</span>
                  </div>
                  <span className="text-[#e5a958] font-semibold">
                    Dynamic Exponential Synthesis Scaling
                  </span>
                </div>

              </div>

              {/* 3 Unified Architecture Telemetry Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                
                {/* Architecture 1: Lyra Studio Engine (Winner) */}
                <div className="p-5 rounded-2xl bg-gradient-to-b from-[#e5a958]/10 to-[#e5a958]/[0.02] border border-[#e5a958]/30 space-y-2 relative overflow-hidden shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#e5a958] uppercase">Lyra Studio Engine</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#e5a958]/20 text-[#e5a958] border border-[#e5a958]/40">
                      Uncapped
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {currentParam.metricLyra}
                  </div>
                  <p className="text-xs text-[#e5a958]/90 font-mono">
                    {currentParam.metricLyraNote}
                  </p>
                  <p className="text-[11px] text-white/60 leading-relaxed pt-1">
                    {currentParam.metricLyraSummary}
                  </p>
                </div>

                {/* Architecture 2: Generic AI Voice Cloud Services */}
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-white/70 uppercase">Generic Voice AI APIs</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/50">
                      Plateaued
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white/60 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {currentParam.metricAi}
                  </div>
                  <p className="text-xs text-rose-300/80 font-mono">
                    {currentParam.metricAiNote}
                  </p>
                  <p className="text-[11px] text-white/40 leading-relaxed pt-1">
                    {currentParam.metricAiSummary}
                  </p>
                </div>

                {/* Architecture 3: Traditional Pitch Plugins */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-white/50 uppercase">Traditional DSP Plugins</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-white/40">
                      Harmonic Limit
                    </span>
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white/40 tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {currentParam.metricDsp}
                  </div>
                  <p className="text-xs text-white/40 font-mono">
                    {currentParam.metricDspNote}
                  </p>
                  <p className="text-[11px] text-white/40 leading-relaxed pt-1">
                    {currentParam.metricDspSummary}
                  </p>
                </div>

              </div>

            </div>
          );
        })()}

        {/* Feature Architecture Comparison Matrix */}
        <div className="scroll-reveal bg-[#121418] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative z-10">
          <div className="px-6 py-5 border-b border-white/10 bg-black/30 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Full Feature Architecture Comparison</h3>
              <p className="text-xs text-white/50">Detailed engineering breakdown against industry alternatives</p>
            </div>
            <span className="text-xs font-mono text-[#e5a958]">Verified Benchmark</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white/[0.02] border-b border-white/5 text-white/50 font-mono uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-4 px-6">Capability / Standard</th>
                  <th className="py-4 px-6 text-[#e5a958] font-bold">Lyra Studio Engine</th>
                  <th className="py-4 px-6 text-white/70">Generic AI Voice Tools</th>
                  <th className="py-4 px-6 text-white/70">Traditional Pitch Plugins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-6 font-medium text-white">
                    Vocal Ornamentation & Vibrato Dynamic
                  </td>
                  <td className="py-4 px-6 text-[#e5a958] font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-[#e5a958]" /> 100% Native Pitch Lock™
                  </td>
                  <td className="py-4 px-6 text-white/50 flex items-center gap-1.5">
                    <X className="w-4 h-4 text-rose-400" /> Stripped / Robotic Snapping
                  </td>
                  <td className="py-4 px-6 text-white/50">
                    <X className="w-4 h-4 text-rose-400 inline mr-1.5" /> Flattens natural vibrato
                  </td>
                </tr>

                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-6 font-medium text-white">
                    Integrated 4-Stem Acoustic Separation
                  </td>
                  <td className="py-4 px-6 text-[#e5a958] font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-[#e5a958]" /> Zero-Bleed (-96dB)
                  </td>
                  <td className="py-4 px-6 text-white/50">
                    <X className="w-4 h-4 text-rose-400 inline mr-1.5" /> Single track only / Bleed
                  </td>
                  <td className="py-4 px-6 text-white/50">
                    <X className="w-4 h-4 text-rose-400 inline mr-1.5" /> None (External required)
                  </td>
                </tr>

                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-6 font-medium text-white">
                    Chest Resonance & Breath Synthesizer
                  </td>
                  <td className="py-4 px-6 text-[#e5a958] font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-[#e5a958]" /> Dynamic Organic Preserved
                  </td>
                  <td className="py-4 px-6 text-white/50">
                    <X className="w-4 h-4 text-rose-400 inline mr-1.5" /> Filtered out or hissing
                  </td>
                  <td className="py-4 px-6 text-white/50">
                    <X className="w-4 h-4 text-rose-400 inline mr-1.5" /> Distorts breath transients
                  </td>
                </tr>

                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-6 font-medium text-white">
                    Dolby 3D Soundstage & Reverb Tail
                  </td>
                  <td className="py-4 px-6 text-[#e5a958] font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-[#e5a958]" /> Real-time Acoustic Rack
                  </td>
                  <td className="py-4 px-6 text-white/50">
                    <X className="w-4 h-4 text-rose-400 inline mr-1.5" /> Dry Flat Mono
                  </td>
                  <td className="py-4 px-6 text-white/50">
                    <X className="w-4 h-4 text-rose-400 inline mr-1.5" /> Not included
                  </td>
                </tr>

                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-6 font-medium text-white">
                    Export Resolution
                  </td>
                  <td className="py-4 px-6 text-[#e5a958] font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-[#e5a958]" /> 32-bit WAV & 320k MP3
                  </td>
                  <td className="py-4 px-6 text-white/50">
                    128kbps / 192kbps MP3
                  </td>
                  <td className="py-4 px-6 text-white/50">
                    DAW Dependent
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION: PRICING (Chapter 05: Public Beta Access Showcase)
         ========================================================================= */}
      <section id="pricing" className="story-section min-h-screen flex flex-col justify-center py-20 px-6 max-w-6xl mx-auto border-t border-white/10 relative">
        {/* Warm Golden Glow Backdrop */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-gradient-to-r from-[#e5a958]/10 via-amber-500/5 to-purple-500/5 blur-3xl pointer-events-none rounded-full" />

        <div className="scroll-reveal text-center max-w-2xl mx-auto space-y-4 mb-14 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono tracking-widest uppercase text-[#e5a958]">
            <span>Chapter 05</span>
            <span>•</span>
            <span>Public Beta Access</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Free Public Beta Active Now
          </h2>
          <p className="text-sm text-white/70 leading-relaxed font-normal">
            During our open beta release, enjoy unrestricted studio access with all 3 vocal models and discrete 4-stem isolation.
          </p>
        </div>

        {/* Grand Borderless Public Beta Showcase Stage */}
        <div className="scroll-reveal reveal-delay-1 bg-[#121418] border border-white/10 rounded-3xl p-8 sm:p-12 shadow-2xl relative z-10 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left: Beta Access Hero */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e5a958]/15 border border-[#e5a958]/30 text-xs font-mono text-[#e5a958]">
                <span className="w-2 h-2 rounded-full bg-[#e5a958] animate-pulse" />
                <span>Unlimited Local & Cloud Access</span>
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl sm:text-6xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>$0</span>
                  <span className="text-sm font-mono text-[#e5a958] uppercase tracking-wider">Free Forever Beta</span>
                </div>
                <p className="text-sm text-white/70 leading-relaxed">
                  Full studio mastering capabilities with no watermark, no credit card required, and no conversion limits.
                </p>
              </div>

              {/* High-Impact Launch Button */}
              <button
                type="button"
                onClick={() => onLaunchStudio && onLaunchStudio()}
                className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-[#e5a958] hover:bg-[#ffcf87] text-black font-semibold text-sm transition-all cursor-pointer shadow-lg active:scale-95 group"
              >
                <span>Launch Studio Now</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Right: Feature Checklist */}
            <div className="lg:col-span-5 bg-black/30 border border-white/5 rounded-2xl p-6 sm:p-7 space-y-4">
              <div className="text-xs font-bold text-white uppercase tracking-wider">Everything Included in Public Beta</div>
              <ul className="space-y-3 text-xs text-white/80">
                <li className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-[#e5a958] flex-shrink-0" />
                  <span>All 3 vocalists (Arijit Singh, Sonu Nigam, KK)</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-[#e5a958] flex-shrink-0" />
                  <span>Universal Ingestion: File upload, Spotify & YouTube URLs</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-[#e5a958] flex-shrink-0" />
                  <span>Pristine 4-stem studio isolation (-96dB floor)</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-[#e5a958] flex-shrink-0" />
                  <span>100% Dynamic Pitch Lock™ micro-vibrato retention</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="w-4 h-4 text-[#e5a958] flex-shrink-0" />
                  <span>Lossless 32-bit float WAV & 320k MP3 download</span>
                </li>
              </ul>
            </div>

          </div>

          {/* Minimal Roadmap Footnote */}
          <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-white/50">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
              <span>Commercial tiers (Studio Pro $24/mo & Enterprise Custom Voice API) launching Q4 2026.</span>
            </div>
            <span className="font-mono text-white/40">Open Beta v2.4</span>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION: FAQ (Chapter 06: Frequently Asked Questions)
         ========================================================================= */}
      <section id="faq" className="story-section min-h-screen flex flex-col justify-center py-20 px-6 max-w-4xl mx-auto border-t border-white/10 relative">
        <div className="scroll-reveal text-center max-w-2xl mx-auto space-y-4 mb-16 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono tracking-widest uppercase text-[#e5a958]">
            <span>Chapter 06</span>
            <span>•</span>
            <span>Technical Clarifications</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Frequently Asked Questions
          </h2>
        </div>

        <div className="scroll-reveal reveal-delay-1 space-y-3 relative z-10">
          {[
            {
              q: "What makes Lyra vocal transformations sound so authentic?",
              a: "Lyra features proprietary Pitch Lock™ acoustic modeling that isolates melodic pitch contours from natural vocal oscillations. It preserves 100% of authentic vocal expression, micro-vibrato, and delicate breath texture without robotic autotune flattening."
            },
            {
              q: "Can I input songs directly from YouTube and Spotify?",
              a: "Yes. Simply paste any public YouTube video link or Spotify track URL into the studio ingestion dock. Lyra automatically loads the track, isolates the stems, and synthesizes the legend's vocals with studio fidelity."
            },
            {
              q: "What audio file formats are supported for upload and export?",
              a: "Lyra supports WAV, MP3, FLAC, M4A, and OGG up to 100MB. You can export studio-grade lossless 44.1kHz WAV or high-bitrate 320kbps MP3."
            },
            {
              q: "Is my music and voice data kept private and secure?",
              a: "Yes. Processing runs in private, isolated studio sessions. Your uploads, vocal recordings, and generated tracks are completely private to your account and never used for public training."
            },
            {
              q: "Can I download individual stems separately?",
              a: "Yes. Once processing completes, you can download the Full 3D Dolby Master, the isolated Vocal Stem, the Backing Instrumental Track, or the original reference vocal stem individually."
            }
          ].map((faq, i) => (
            <div 
              key={i}
              className="bg-[#14161c] border border-white/10 rounded-2xl overflow-hidden transition-all duration-200 hover:border-white/20"
            >
              <button
                type="button"
                onClick={() => toggleFaq(i)}
                className="w-full p-5 text-left flex items-center justify-between text-sm font-semibold text-white hover:text-[#e5a958] transition-colors cursor-pointer"
              >
                <span>{faq.q}</span>
                <ChevronDown className={`w-4 h-4 text-white/50 transition-transform duration-300 ${activeFaq === i ? 'rotate-180 text-[#e5a958]' : ''}`} />
              </button>
              {activeFaq === i && (
                <div className="px-5 pb-5 text-xs text-white/70 leading-relaxed font-normal border-t border-white/5 pt-3 animate-fadeIn">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================================
          FOOTER (Clean Apple Aesthetic without nav links or tech leaks)
         ========================================================================= */}
      <footer className="border-t border-white/10 py-12 px-6 text-center text-xs text-white/50 bg-[#0e1014]/60 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <LyraLogo />
            <span className="font-bold uppercase tracking-[0.2em] text-white text-xs" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Lyra</span>
            <span className="text-white/40">• Neural Vocal Studio</span>
          </div>
          <div className="text-white/40 text-xs font-mono">
            Crafted for Music Creators • All Rights Reserved
          </div>
        </div>
      </footer>

    </div>
  );
}
