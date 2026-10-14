import React, { useState, useEffect } from 'react';
import { 
  Sparkles, ArrowRight, Disc, 
  Cpu, Music, Layers, ShieldCheck, 
  Zap, ArrowLeftRight,
  Sliders, Activity
} from 'lucide-react';

export default function LandingPage({ onLaunchStudio, sysInfo = null }) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Intersection observer for section entrance scaling & fade animations
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0', 'scale-100');
            entry.target.classList.remove('opacity-0', 'translate-y-8', 'scale-[0.97]');
          }
        });
      },
      { threshold: 0.12 }
    );

    const elements = document.querySelectorAll('.scroll-reveal');
    elements.forEach((el) => observer.observe(el));

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);

  const voiceDetails = {
    arijit_singh: {
      name: "Arijit Singh",
      tagline: "Soulful & Emotional • Deep Chest Warmth",
      badge: "Ballads & Acoustic",
      desc: "Warm chest fundamentals with breathy falsetto inflections and natural phonetics.",
      range: "E2 - C5 (Chest / Mixed)",
      timbre: "Warm Velvet • High Chest Resonance",
      f0: "RMVPE High-Res Pitch Lock",
      bars: [85, 92, 98, 70, 62, 54]
    },
    sonu_nigam: {
      name: "Sonu Nigam",
      tagline: "Golden Era Legend • Crystalline Sur & High Pitch",
      badge: "Classical & High-Register",
      desc: "Ultra-crisp articulation, intricate classical ornamentation, and soaring high octaves.",
      range: "F2 - F5 (Extended 3.5 Octaves)",
      timbre: "Crystal Clarity • Flawless Sur",
      f0: "Classical Micro-Ornamentation",
      bars: [60, 75, 88, 96, 100, 88]
    }
  };

  return (
    <div className="bg-[#0d0d0d] text-[#ececec] min-h-screen selection:bg-[#10a37f] selection:text-white select-none">
      {/* Hero Section: Full Viewport Height & Width with Studio Mixing Console Background */}
      <section 
        id="overview" 
        className="relative w-full min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 border-b border-[#222] overflow-hidden isolate py-12 md:py-16"
      >
        {/* Full Background Image: Studio Mixing Console with scaling on scroll */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
          <img 
            src="/studio_mixing_console.jpg" 
            alt="Mastering Studio Mixing Console" 
            draggable={false}
            style={{ 
              transform: `scale(${1 + Math.min(scrollY * 0.00035, 0.15)}) translateY(${scrollY * 0.05}px)` 
            }}
            className="w-full h-full object-cover object-center sm:object-[center_35%] opacity-55 select-none pointer-events-none filter brightness-95 contrast-115 transition-transform duration-100 ease-out will-change-transform"
          />
          {/* Studio vignette overlays for text readability while keeping illuminated meters and console visible */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0d0d0d]/80 via-[#0d0d0d]/45 to-[#0d0d0d]" />
          <div className="absolute inset-0 bg-[#0d0d0d]/25" />
        </div>

        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-[#10a37f]/15 blur-[150px] rounded-full pointer-events-none z-0" />

        {/* Centered Hero Content */}
        <div className="text-center max-w-3xl mx-auto space-y-6 relative z-10 w-full">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#171717]/90 backdrop-blur-md border border-[#282828] text-xs font-medium text-[#10a37f] shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10a37f]" />
            <span className="font-semibold tracking-wide">Lyra 2.0 • Neural Vocal Timbre Studio</span>
          </div>

          {/* Headline with Crisp High Contrast */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1] drop-shadow-lg">
            Sculpt Voices. <br />
            <span className="bg-gradient-to-r from-white via-[#e0e0e0] to-[#10a37f] bg-clip-text text-transparent">
              Rewrite Vocal Timbre.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-[#ddd] max-w-2xl mx-auto font-normal leading-relaxed drop-shadow-md">
            Next-generation neural architecture that converts any song or acapella into iconic vocalist personas.
            Powered by phase-coherent stem isolation, sub-cent RMVPE pitch estimation, and studio-grade acoustics.
          </p>

          {/* Action Button */}
          <div className="flex items-center justify-center pt-2">
            <button
              onClick={() => onLaunchStudio()}
              className="w-full sm:w-auto px-9 py-3.5 rounded-xl font-bold text-sm text-black bg-[#10a37f] hover:bg-[#12b98f] shadow-xl shadow-[#10a37f]/30 transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              <span>Enter Studio</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          {/* Key Metric Pills with Backdrop Blur */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 max-w-2xl mx-auto text-left">
            <div className="bg-[#141414]/90 backdrop-blur-md border border-[#2c2c2c] rounded-xl p-3 shadow-md">
              <span className="text-[10px] font-mono uppercase text-[#888] tracking-wider block">Sample Rate</span>
              <span className="text-sm font-bold text-white">40 kHz High-Res</span>
            </div>
            <div className="bg-[#141414]/90 backdrop-blur-md border border-[#2c2c2c] rounded-xl p-3 shadow-md">
              <span className="text-[10px] font-mono uppercase text-[#888] tracking-wider block">F0 Tracking</span>
              <span className="text-sm font-bold text-[#10a37f]">RMVPE Sub-Cent</span>
            </div>
            <div className="bg-[#141414]/90 backdrop-blur-md border border-[#2c2c2c] rounded-xl p-3 shadow-md">
              <span className="text-[10px] font-mono uppercase text-[#888] tracking-wider block">Stem Separation</span>
              <span className="text-sm font-bold text-white">Demucs v4 Hybrid</span>
            </div>
            <div className="bg-[#141414]/90 backdrop-blur-md border border-[#2c2c2c] rounded-xl p-3 shadow-md">
              <span className="text-[10px] font-mono uppercase text-[#888] tracking-wider block">Acceleration</span>
              <span className="text-sm font-bold text-[#10a37f]">MPS / CUDA Core</span>
            </div>
          </div>
        </div>
      </section>

      {/* Model Roster Section */}
      <section id="models" className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-20 lg:py-24 border-t border-[#222] bg-[#0f0f0f]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full scroll-reveal transition-all duration-700 ease-out opacity-0 translate-y-8 scale-[0.97]">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#10a37f]">
              Neural Persona Weights
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Trained On Legendary Vocal Timbre
            </h2>
            <p className="text-sm text-[#999]">
              High-dimensional latent embeddings extracted from isolated 24-bit multitrack master recordings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(voiceDetails).map(([key, item]) => (
              <div
                key={key}
                className="bg-[#141414] border border-[#262626] hover:border-[#383838] rounded-2xl p-6 transition-all flex flex-col justify-between shadow-lg select-none"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-md bg-[#1f1f1f] text-[#10a37f] border border-[#2e2e2e]">
                      RVC v2 • 40kHz
                    </span>
                    <span className="text-[11px] font-medium text-[#777]">
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-1">
                    {item.name}
                  </h3>
                  <p className="text-xs text-[#10a37f] font-medium mb-3">
                    {item.tagline}
                  </p>
                  <p className="text-xs text-[#999] leading-relaxed mb-5">
                    {item.desc}
                  </p>

                  {/* Frequency Bars for Vocal Profile */}
                  <div className="bg-[#0d0d0d] p-3 rounded-xl border border-[#222] mb-5">
                    <span className="text-[10px] font-mono text-[#777] block mb-2 uppercase tracking-wider">
                      Harmonic Timbre Contour
                    </span>
                    <div className="flex items-end gap-1.5 h-8">
                      {item.bars.map((bar, idx) => (
                        <div key={idx} className="flex-1 bg-[#1a1a1a] rounded-sm overflow-hidden h-full flex items-end">
                          <div 
                            className="w-full bg-[#10a37f]/80 rounded-sm transition-all duration-300"
                            style={{ height: `${bar}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 py-3 border-t border-[#222] text-xs">
                    <div className="flex justify-between">
                      <span className="text-[#777]">Vocal Span:</span>
                      <span className="text-[#ddd] font-mono font-semibold">{item.range}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#777]">Sonic Profile:</span>
                      <span className="text-[#ddd] font-mono">{item.timbre}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#777]">F0 Engine:</span>
                      <span className="text-[#10a37f] font-mono">{item.f0}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#202020] flex items-center justify-between text-xs text-[#777]">
                  <span>Status: <strong className="text-white font-mono">Loaded in Memory</strong></span>
                  <span className="text-[#10a37f] font-mono">100% Ready</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Pipeline Section */}
      <section id="pipeline" className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-20 lg:py-24 border-t border-[#222] bg-[#0d0d0d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full scroll-reveal transition-all duration-700 ease-out opacity-0 translate-y-8 scale-[0.97]">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#10a37f]">
              Processing Pipeline
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Under The Hood of Lyra
            </h2>
            <p className="text-sm text-[#999]">
              How raw audio transitions from source waveforms to studio-grade remastered stems.
            </p>
          </div>

          {/* Analog Mastering Studio Rack Photo Showcase */}
          <div className="mb-14 rounded-3xl overflow-hidden border border-[#242424] bg-[#141414] p-3 sm:p-4 shadow-2xl select-none">
            <div className="relative rounded-2xl overflow-hidden border border-[#222] bg-[#080808]">
              <img 
                src="/studio_mastering_rack.jpg" 
                alt="Analog Audio Mastering Racks & Control Room" 
                draggable={false}
                className="w-full h-64 sm:h-80 md:h-[450px] object-cover object-center select-none pointer-events-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 sm:gap-6 relative">
            {/* Step 1 */}
            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6 relative">
              <span className="text-2xl font-black font-mono text-[#333] block mb-3">01</span>
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <Disc className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white mb-2">Hybrid Stem Isolation</h4>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Demucs v4 phase-aware model separates polyphonic tracks into pure lead vocals and pristine backing instrumentals without spectral bleed.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6 relative">
              <span className="text-2xl font-black font-mono text-[#333] block mb-3">02</span>
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <Activity className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white mb-2">Sub-Cent RMVPE F0</h4>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Continuous neural pitch estimation maps fundamental frequency variations, vocal vibrato, and micro-ornamentations with zero octave jumps.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6 relative">
              <span className="text-2xl font-black font-mono text-[#333] block mb-3">03</span>
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <Cpu className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white mb-2">FAISS Index & RVC v2</h4>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Retrieval-augmented latent network compares source phonemes against target singer vectors, restructuring formant envelopes and timbre.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6 relative">
              <span className="text-2xl font-black font-mono text-[#333] block mb-3">04</span>
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <Sliders className="w-5 h-5" />
              </div>
              <h4 className="text-base font-bold text-white mb-2">Dolby Staging & Master</h4>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Phase-coherent remuxing applies vocal pocket ducking (-7.5dB), lead prominence (+2.8dB), and wide spatial imaging in the final master.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Grid */}
      <section id="features" className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-20 lg:py-24 border-t border-[#222] bg-[#0f0f0f]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full scroll-reveal transition-all duration-700 ease-out opacity-0 translate-y-8 scale-[0.97]">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-bold uppercase tracking-widest text-[#10a37f]">
              Studio Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Engineered For Audio Purists
            </h2>
            <p className="text-sm text-[#999]">
              Every tool required to produce broadcast-ready vocal transformations.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <Music className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">4 Ingestion Channels</h3>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Upload uncompressed WAV/MP3, record live voice through browser microphone, or paste any Spotify or YouTube song link directly with instant metadata matching.
              </p>
            </div>

            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">PSOLA Smooth Auto-Tuner</h3>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Integrated pitch-synchronous overlap-add pitch alignment ensures pitch stabilization without robotized vocoder artifacts or metallic harshness.
              </p>
            </div>

            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">4-Stem Isolated Export</h3>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Export individual production stems: Full Remastered Master (WAV/MP3), Lead Acapella, Backing Instrumental, and Raw Original Stem.
              </p>
            </div>

            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">A/B Instant Blind Compare</h3>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Seamlessly flip between the original singer and the neural converted voice with micro-second accuracy at the exact same playback position.
              </p>
            </div>

            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">Hardware-Accelerated Engine</h3>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Native execution on PyTorch MPS (Apple Silicon GPU) or CUDA cores delivers high-throughput inference without cloud dependency or latency.
              </p>
            </div>

            <div className="bg-[#141414] border border-[#242424] rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-[#1e1e1e] border border-[#303030] text-[#10a37f] flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-2">1-Click Dolby Remaster</h3>
              <p className="text-xs text-[#8a8a8a] leading-relaxed">
                Enhance your track on demand with acoustic spatial width, warm chest harmonic excitation, and precise acoustic envelope balancing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Technical Specifications Table */}
      <section className="py-20 border-t border-[#222] bg-[#0d0d0d]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full scroll-reveal transition-all duration-700 ease-out opacity-0 translate-y-8 scale-[0.97]">
          <div className="text-center mb-10 space-y-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[#10a37f]">
              Specifications
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              System Architecture & Benchmarks
            </h2>
          </div>

          <div className="bg-[#141414] border border-[#242424] rounded-2xl overflow-hidden">
            <div className="divide-y divide-[#202020] text-xs">
              <div className="flex justify-between p-4">
                <span className="font-medium text-[#888]">Voice Conversion Framework</span>
                <span className="font-mono font-semibold text-white">RVC v2 (Retrieval-based Voice Conversion)</span>
              </div>
              <div className="flex justify-between p-4 bg-[#111]">
                <span className="font-medium text-[#888]">Pitch Estimation Model</span>
                <span className="font-mono font-semibold text-[#10a37f]">RMVPE (Robust Multi-Scale Pitch Estimator)</span>
              </div>
              <div className="flex justify-between p-4">
                <span className="font-medium text-[#888]">Source Separation Model</span>
                <span className="font-mono font-semibold text-white">Demucs v4 htdemucs (Hybrid Transformer)</span>
              </div>
              <div className="flex justify-between p-4 bg-[#111]">
                <span className="font-medium text-[#888]">Feature Retrieval Index</span>
                <span className="font-mono font-semibold text-white">FAISS IVF-Flat with Index Rate 0.28</span>
              </div>
              <div className="flex justify-between p-4">
                <span className="font-medium text-[#888]">Inference Device</span>
                <span className="font-mono font-semibold text-[#10a37f]">
                  {sysInfo?.torch_device === 'mps' ? 'Apple Silicon MPS (Metal)' : 'PyTorch CUDA / Neural Core'}
                </span>
              </div>
              <div className="flex justify-between p-4 bg-[#111]">
                <span className="font-medium text-[#888]">Audio I/O Formats</span>
                <span className="font-mono font-semibold text-white">44.1 kHz / 16-bit PCM WAV & 320kbps MP3</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clean Bottom CTA Banner - Single clear action */}
      <section className="py-20 border-t border-[#222] bg-[#0f0f0f] relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6 scroll-reveal transition-all duration-700 ease-out opacity-0 translate-y-8 scale-[0.97]">
          <div className="w-14 h-14 rounded-2xl bg-[#171717] border border-[#282828] flex items-center justify-center mx-auto shadow-xl select-none">
            <img src="/lyra-logo.png" alt="Lyra" draggable={false} className="w-10 h-10 rounded-xl object-contain select-none pointer-events-none" />
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Ready to Synthesize Your Master?
          </h2>

          <p className="text-sm text-[#888] max-w-lg mx-auto">
            Experience next-level neural vocal transformations in seconds with zero latency.
          </p>

          <div className="pt-2">
            <button
              onClick={() => onLaunchStudio()}
              className="px-8 py-3.5 rounded-xl font-bold text-sm text-black bg-[#10a37f] hover:bg-[#12b98f] shadow-xl shadow-[#10a37f]/20 transition-all inline-flex items-center gap-2 cursor-pointer"
            >
              <span>Enter Studio</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Clean Footer - No nav links in footer */}
      <footer className="border-t border-[#202020] bg-[#0a0a0a] py-8 px-4 text-center text-xs text-[#666] select-none">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/lyra-logo.png" alt="Lyra" draggable={false} className="w-5 h-5 rounded-md object-contain select-none pointer-events-none" />
            <span className="font-bold text-white text-sm">Lyra</span>
            <span className="text-[#444]">•</span>
            <span>Neural Vocal Timbre Studio</span>
          </div>

          <p className="text-[#555]">
            &copy; 2025 Lyra Audio Engine. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
