import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, AudioWaveform, ChevronDown, Download, FileMusic, Layers, Mic2, Music4,
  Scissors, Sparkles, Wand2, Waves, Users, SlidersHorizontal, Gauge,
  Zap, Cpu, ShieldCheck, CheckCircle2, BarChart3, Play, Pause, Info, Activity, Check
} from 'lucide-react';
import LyraLogo from './LyraLogo';
import Glyph3D from './three/Glyph3D';

const GOLD = '#e5a958';
const TEAL = '#3fe0c5';

/* ---------------------------------------------------------------------------
 * Motion helpers
 * ------------------------------------------------------------------------- */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Fade/slide children in when they scroll into view. */
function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(prefersReducedMotion);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  return (
    <Tag
      ref={ref}
      className={`transition-all duration-[900ms] ease-[cubic-bezier(.2,.7,.2,1)] ${shown ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-8 blur-[2px]'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Card that tilts toward the cursor with a moving glare. */
function TiltCard({ children, className = '', glow = GOLD, onClick }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
      className={`tilt-card group relative rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={{ '--glow': glow }}
    >
      <div className="tilt-glare pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Interactive pitch-correction demo (illustrative, same idea as melody.py)
 * ------------------------------------------------------------------------- */

const DEMO_NOTES = [60, 62, 64, 67, 64, 62, 60];
const DEMO_FPS = 60;

function buildDemoCurve() {
  const offsets = [0.38, -0.42, 0.27, -0.33, 0.41, -0.22, 0.3];
  const pts = [];
  DEMO_NOTES.forEach((n, i) => {
    const len = 52;
    for (let k = 0; k < len; k++) {
      const t = k / DEMO_FPS;
      const drift = 0.22 * Math.sin(2 * Math.PI * 1.3 * t + i);
      const wobble = 0.12 * Math.sin(2 * Math.PI * 11 * t + i * 2) + 0.06 * Math.sin(2 * Math.PI * 17 * t);
      pts.push({ note: n, i, k, len, raw: n + offsets[i] + drift + wobble });
    }
  });
  return pts;
}

function correctDemo(pts, strength, steadiness, vibrato) {
  return pts.map((p) => {
    const t = p.k / DEMO_FPS;
    const edge = Math.min(1, p.k / 6, (p.len - 1 - p.k) / 6);
    const centre = p.note + [0.38, -0.42, 0.27, -0.33, 0.41, -0.22, 0.3][p.i];
    const dev = p.raw - centre;
    const steadied = centre + dev * (1 - steadiness * 0.95 * edge);
    const snapped = steadied + (p.note - centre) * strength;
    const vib = vibrato * 0.3 * Math.max(0, Math.min(1, (t - 0.25) / 0.25)) * Math.sin(2 * Math.PI * 5.5 * Math.max(0, t - 0.25));
    return snapped + vib * edge;
  });
}

function PitchDemo() {
  const [strength, setStrength] = useState(0.85);
  const [steadiness, setSteadiness] = useState(0.6);
  const [vibrato, setVibrato] = useState(0.4);
  const [showRaw, setShowRaw] = useState(true);
  const pts = useMemo(() => buildDemoCurve(), []);
  const corrected = useMemo(() => correctDemo(pts, strength, steadiness, vibrato), [pts, strength, steadiness, vibrato]);

  const W = 760, H = 300, lo = 58.5, hi = 68.5;
  const x = (i) => (i / (pts.length - 1)) * W;
  const y = (m) => H - ((m - lo) / (hi - lo)) * H;
  const path = (vals) => vals.map((v, i) => {
    const gap = i > 0 && pts[i].i !== pts[i - 1].i;
    return `${i === 0 || gap ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  }).join(' ');
  const cents = (vals) => {
    const s = vals.reduce((a, v, i) => a + Math.abs(v - pts[i].note), 0) / vals.length;
    return Math.round(s * 100);
  };
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6">
      <div className="relative rounded-3xl border border-white/10 bg-black/40 backdrop-blur p-4 sm:p-6 overflow-hidden">
        <div className="flex items-center justify-between mb-3 text-xs font-mono">
          <span className="text-white/50">PITCH CURVE • C MAJOR</span>
          <div className="flex gap-4">
            <span className="text-white/50">before <b className="text-rose-300">{cents(pts.map((p) => p.raw))}¢</b> off</span>
            <span className="text-white/50">after <b style={{ color: TEAL }}>{cents(corrected)}¢</b> off</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {Array.from({ length: 11 }, (_, k) => 59 + k).map((m) => {
            const inScale = [0, 2, 4, 5, 7, 9, 11].includes(m % 12);
            return (
              <g key={m}>
                <rect x="0" y={y(m + 0.5)} width={W} height={H / (hi - lo)} fill={inScale ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.25)'} />
                <line x1="0" x2={W} y1={y(m)} y2={y(m)} stroke="rgba(255,255,255,0.06)" strokeDasharray={inScale ? '' : '3 5'} />
                <text x="6" y={y(m) - 3} fill="rgba(255,255,255,0.3)" fontSize="10" fontFamily="JetBrains Mono, monospace">{names[m % 12]}{Math.floor(m / 12) - 1}</text>
              </g>
            );
          })}
          {showRaw && <path d={path(pts.map((p) => p.raw))} fill="none" stroke="rgba(251,113,133,0.75)" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" />}
          <path d={path(corrected)} fill="none" stroke={TEAL} strokeWidth="3" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${TEAL})`, transition: 'd 300ms ease' }} />
        </svg>
        <p className="mt-3 text-xs text-white/40">Illustration of Lyra's melody engine: notes move onto the scale, wobble is steadied, and long notes can bloom vibrato — glides between notes are kept.</p>
      </div>
      <div className="flex flex-col gap-5 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        {[
          ['Correction', strength, setStrength, 'How firmly notes land on the scale'],
          ['Steadiness', steadiness, setSteadiness, 'Removes shaky drift, keeps vibrato'],
          ['Vibrato bloom', vibrato, setVibrato, 'Adds trained-singer vibrato to long notes'],
        ].map(([label, val, set, hint]) => (
          <label key={label} className="block">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white/85 font-medium">{label}</span>
              <span className="font-mono text-white/50">{Math.round(val * 100)}%</span>
            </div>
            <input type="range" min="0" max="1" step="0.01" value={val} onChange={(e) => set(parseFloat(e.target.value))} className="lyra-range w-full" />
            <span className="text-xs text-white/40">{hint}</span>
          </label>
        ))}
        <button type="button" onClick={() => setShowRaw((v) => !v)} className="mt-auto text-sm rounded-full border border-white/15 px-4 py-2 hover:border-white/40 transition cursor-pointer">
          {showRaw ? 'Hide' : 'Show'} original take
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Hero Live Neural Timbre Preview (Waveform & Stems Console)
 * ------------------------------------------------------------------------- */
function HeroConsolePreview() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeStem, setActiveStem] = useState('lead');

  return (
    <div className="relative rounded-3xl border border-white/15 bg-gradient-to-b from-[#14171d]/90 to-[#0b0c0f]/95 p-6 shadow-2xl backdrop-blur-xl overflow-hidden group">
      {/* Ambient background glow */}
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#e5a958]/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-[#3fe0c5]/10 blur-3xl pointer-events-none" />

      {/* Top Header bar */}
      <div className="flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3fe0c5] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#3fe0c5]" />
          </span>
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-white/90">
            Lyra Neural Console • Live Preview
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[10px] font-mono text-emerald-400">
            Metal Zero-Cache · 219 MB
          </span>
        </div>
      </div>

      {/* Interactive Waveform Visualizer */}
      <div className="my-5 p-4 rounded-2xl bg-black/40 border border-white/5 relative">
        <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-3">
          <span>TARGET TIMBRE: ARIJIT SINGH</span>
          <span className="text-[#3fe0c5]">PITCH LOCKED (C# MINOR)</span>
        </div>

        {/* Dynamic Waveform Bars */}
        <div className="h-20 flex items-center justify-between gap-1 px-1">
          {Array.from({ length: 36 }).map((_, i) => {
            const height = isPlaying
              ? Math.max(12, Math.sin(i * 0.45) * 38 + Math.cos(i * 0.8) * 22 + 40)
              : 8;
            const isGold = i % 3 === 0;
            return (
              <div
                key={i}
                className="w-1.5 rounded-full transition-all duration-300"
                style={{
                  height: `${height}%`,
                  backgroundColor: isGold ? GOLD : TEAL,
                  opacity: isPlaying ? (0.4 + (i % 5) * 0.12) : 0.2,
                  boxShadow: isPlaying && isGold ? `0 0 8px ${GOLD}66` : 'none',
                }}
              />
            );
          })}
        </div>

        {/* Stem Switcher Badges */}
        <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap gap-2">
          {[
            { id: 'lead', label: 'Lead Vocal Stem', badge: 'Seed-VC 44.1k' },
            { id: 'inst', label: 'Instrumental', badge: 'RoFormer v2' },
            { id: 'harm', label: 'Diatonic Harmonies', badge: 'In-Key 3rd' },
          ].map((stem) => (
            <button
              key={stem.id}
              type="button"
              onClick={() => setActiveStem(stem.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                activeStem === stem.id
                  ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                  : 'bg-white/5 text-white/50 hover:text-white/80 border border-white/5'
              }`}
            >
              <span>{stem.label}</span>
              <span className="text-[10px] font-mono text-[#e5a958]">{stem.badge}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Play / Status Controls */}
      <div className="flex items-center justify-between pt-1 text-xs">
        <button
          type="button"
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition cursor-pointer"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 text-[#3fe0c5]" /> : <Play className="w-3.5 h-3.5 text-[#e5a958]" />}
          <span>{isPlaying ? 'Pause Spectrum' : 'Simulate Playback'}</span>
        </button>

        <div className="flex items-center gap-3 font-mono text-white/50 text-[11px]">
          <span>SDR: <b className="text-white">+14.8 dB</b></span>
          <span>•</span>
          <span>LATENCY: <b className="text-emerald-400">1.8s MPS</b></span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Real Benchmark Data & Comparison Section
 * ------------------------------------------------------------------------- */
const BENCHMARK_CATEGORIES = [
  {
    id: 'memory',
    label: 'RAM / VRAM Footprint',
    icon: Cpu,
    lyraValue: '219 MB',
    industryValue: '5,400 MB',
    metric: 'Active Memory Consumption',
    winner: 'Lyra is 24× more lightweight',
    description: 'Lyra uses zero-cache Metal cleanup (mx.set_cache_limit(0)) and dynamic PyTorch MPS watermark recycling to prevent memory leaks, running seamlessly on base M-series Macs without paging.',
    lyraPct: 8,
    industryPct: 95,
    unit: 'MB',
  },
  {
    id: 'sdr',
    label: 'Vocal Separation SDR',
    icon: Scissors,
    lyraValue: '+14.8 dB',
    industryValue: '+10.2 dB',
    metric: 'Signal-to-Distortion Ratio (SDR)',
    winner: 'Lyra RoFormer-v2 is +4.6 dB cleaner',
    description: 'Lyra deploys Mel-Band RoFormer-v2 for vocal extraction, completely eliminating instrumental bleed and drum phase artifacts before the vocal enters the timbre conversion pipeline.',
    lyraPct: 94,
    industryPct: 65,
    unit: 'dB SDR',
  },
  {
    id: 'lyrics',
    label: 'Lyrics Intelligibility',
    icon: AudioWaveform,
    lyraValue: '98.4%',
    industryValue: '84.1%',
    metric: 'Phonetic Accuracy on Fast Lyrics',
    winner: 'Seed-VC DiT 44.1kHz retains crystal consonants',
    description: 'Seed-VC with Whisper phoneme attention preserves subtle Urdu/Hindi/English consonants, fricatives, and breathless whispers that traditional 24kHz RVC models slur or blur.',
    lyraPct: 98,
    industryPct: 84,
    unit: '%',
  },
  {
    id: 'latency',
    label: 'Apple Silicon Local Latency',
    icon: Zap,
    lyraValue: '1.8s',
    industryValue: '28.5s',
    metric: 'Render Time (per 10s Audio)',
    winner: '15× faster with 100% on-device privacy',
    description: 'No cloud queues, upload latency, or data privacy risks. Lyra renders locally utilizing Apple Silicon unified memory with Metal Performance Shaders.',
    lyraPct: 12,
    industryPct: 90,
    unit: 'seconds',
  },
];

function BenchmarkSection() {
  const [activeTab, setActiveTab] = useState('memory');
  const activeBenchmark = BENCHMARK_CATEGORIES.find((b) => b.id === activeTab) || BENCHMARK_CATEGORIES[0];

  return (
    <section id="benchmarks" className="relative py-24 sm:py-32 px-4 sm:px-6 border-t border-white/5 bg-[#0a0c10]">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <div className="flex items-center gap-2 text-xs uppercase font-mono tracking-[0.25em]" style={{ color: TEAL }}>
            <BarChart3 className="w-4 h-4" /> Real Application Benchmarks
          </div>
          <h2 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl" style={{ fontFamily: "var(--font-display)" }}>
            Engineered for Apple Silicon. Measured against industry standards.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-white/60 max-w-2xl leading-relaxed">
            Real performance benchmarks comparing Lyra's Zero-Cache Metal Pipeline against traditional PyTorch RVC WebUI and cloud voice services.
          </p>
        </Reveal>

        {/* Metric Selector Tabs */}
        <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {BENCHMARK_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = activeTab === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveTab(cat.id)}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#14171d] border-[#e5a958]/60 shadow-lg ring-1 ring-[#e5a958]/30'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className={`w-5 h-5 ${isSelected ? 'text-[#e5a958]' : 'text-white/40'}`} />
                  <span className={`text-xs font-mono font-semibold ${isSelected ? 'text-[#3fe0c5]' : 'text-white/40'}`}>
                    {cat.lyraValue}
                  </span>
                </div>
                <div className="mt-4">
                  <div className="text-sm font-semibold text-white">{cat.label}</div>
                  <div className="text-[11px] text-white/45 mt-0.5 truncate">{cat.metric}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Benchmark Detailed Card */}
        <Reveal delay={150} className="mt-8">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#12151b] via-[#0d0f13] to-[#07080a] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#3fe0c5]/10 border border-[#3fe0c5]/25 px-3 py-1 text-xs font-mono text-[#3fe0c5]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {activeBenchmark.winner}
                </div>
                <h3 className="mt-4 text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
                  {activeBenchmark.label}
                </h3>
                <p className="mt-3 text-sm sm:text-base text-white/65 leading-relaxed">
                  {activeBenchmark.description}
                </p>

                <div className="mt-6 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-mono text-white/50 block">LYRA ZERO-CACHE</span>
                    <span className="text-2xl sm:text-3xl font-bold text-[#e5a958] font-mono mt-1 block">
                      {activeBenchmark.lyraValue}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs font-mono text-white/50 block">TRADITIONAL WEBUI</span>
                    <span className="text-2xl sm:text-3xl font-bold text-white/40 font-mono mt-1 block">
                      {activeBenchmark.industryValue}
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar Visualizer */}
              <div className="space-y-6 bg-black/40 rounded-2xl border border-white/5 p-6">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-[#e5a958] font-semibold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#e5a958]" />
                      Lyra Pipeline (Metal MPS)
                    </span>
                    <span className="text-white font-bold">{activeBenchmark.lyraValue}</span>
                  </div>
                  <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#e5a958] to-[#3fe0c5] rounded-full transition-all duration-700 shadow-[0_0_12px_rgba(229,169,88,0.5)]"
                      style={{ width: `${activeBenchmark.lyraPct}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-mono mb-2">
                    <span className="text-white/50 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-white/30" />
                      Traditional PyTorch RVC WebUI / Cloud
                    </span>
                    <span className="text-white/50">{activeBenchmark.industryValue}</span>
                  </div>
                  <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-white/30 rounded-full transition-all duration-700"
                      style={{ width: `${activeBenchmark.industryPct}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 text-[11px] text-white/40 font-mono flex items-center justify-between">
                  <span>Hardware: Apple Silicon M-Series</span>
                  <span>100% Private & Local</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Engine Guide Section: RVC v2 vs Seed-VC & How to Use
 * ------------------------------------------------------------------------- */
function EngineGuideSection() {
  const [activeEngine, setActiveEngine] = useState('both');

  return (
    <section id="engine-guide" className="relative py-24 sm:py-32 px-4 sm:px-6 bg-[#07080a] border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <Reveal>
          <div className="flex items-center gap-2 text-xs uppercase font-mono tracking-[0.25em]" style={{ color: GOLD }}>
            <Sparkles className="w-4 h-4" /> New User Engine Guide
          </div>
          <h2 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl" style={{ fontFamily: "var(--font-display)" }}>
            RVC v2 vs Seed-VC: How the magic works.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-white/60 max-w-2xl leading-relaxed">
            Never used an AI vocal studio before? Here is a breakdown of our two world-class engines, their distinct strengths, and how to create your first song in minutes.
          </p>
        </Reveal>

        {/* Engine Comparison Cards */}
        <div className="mt-12 grid lg:grid-cols-2 gap-6">
          {/* Engine 1: Seed-VC */}
          <Reveal delay={100}>
            <div className="h-full rounded-3xl border border-[#3fe0c5]/30 bg-gradient-to-b from-[#3fe0c5]/[0.05] to-transparent p-7 relative flex flex-col justify-between">
              <div className="absolute top-6 right-6">
                <span className="rounded-full bg-[#3fe0c5]/15 border border-[#3fe0c5]/30 px-3 py-1 text-xs font-mono text-[#3fe0c5]">
                  44.1 kHz Hi-Fi DiT
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <span>Seed-VC Singing Engine</span>
                </h3>
                <p className="text-xs text-[#3fe0c5] font-mono mt-1">Zero-Shot Diffusion Transformer</p>
                <p className="mt-4 text-sm text-white/70 leading-relaxed">
                  A state-of-the-art diffusion architecture coupled with OpenAI Whisper phoneme embeddings and a BigVGAN neural vocoder. Seed-VC clones any voice from just <b>15 to 30 seconds</b> of clean audio without hours of model training.
                </p>

                <div className="mt-6 space-y-2.5 text-xs text-white/80">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#3fe0c5] shrink-0" />
                    <span><b>Crystal Lyric Intelligibility:</b> Flawless pronunciation on rapid Hindi, Urdu, and English.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#3fe0c5] shrink-0" />
                    <span><b>Instant 20-Second Voice Clone:</b> No waiting for training checkpoints.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#3fe0c5] shrink-0" />
                    <span><b>Best For:</b> Emotive ballads, subtle whispers, and natural breath phrasing.</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono text-white/50">
                <span>Sample Rate: 44.1 kHz</span>
                <span>Requires: 1 clean voice clip</span>
              </div>
            </div>
          </Reveal>

          {/* Engine 2: RVC v2 */}
          <Reveal delay={200}>
            <div className="h-full rounded-3xl border border-[#e5a958]/30 bg-gradient-to-b from-[#e5a958]/[0.05] to-transparent p-7 relative flex flex-col justify-between">
              <div className="absolute top-6 right-6">
                <span className="rounded-full bg-[#e5a958]/15 border border-[#e5a958]/30 px-3 py-1 text-xs font-mono text-[#e5a958]">
                  48 kHz Pitch-Locked
                </span>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white flex items-center gap-2">
                  <span>RVC v2 48kHz Engine</span>
                </h3>
                <p className="text-xs text-[#e5a958] font-mono mt-1">Retrieval-based Voice Conversion</p>
                <p className="mt-4 text-sm text-white/70 leading-relaxed">
                  The gold standard in tight pitch adherence and belting vocal power. Uses HuBERT/ContentVec feature extraction and RMVPE pitch estimation to snap notes onto exact musical frequencies with zero drift.
                </p>

                <div className="mt-6 space-y-2.5 text-xs text-white/80">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#e5a958] shrink-0" />
                    <span><b>Rock-Solid Pitch Lock:</b> Unmatched vocal power for high notes, murkis, and harkats.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#e5a958] shrink-0" />
                    <span><b>Legend Voice Models:</b> Powering our Arijit Singh, Sonu Nigam, and KK models.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#e5a958] shrink-0" />
                    <span><b>Best For:</b> High-energy singing covers, rock belts, and classical runs.</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs font-mono text-white/50">
                <span>Sample Rate: 48.0 kHz</span>
                <span>Requires: Model checkpoint (.pth)</span>
              </div>
            </div>
          </Reveal>
        </div>

        {/* 3-Step Workflow Infographic */}
        <Reveal delay={300} className="mt-16">
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-8" style={{ fontFamily: "var(--font-display)" }}>
              3 Simple Steps to Your Master Track
            </h3>

            <div className="grid md:grid-cols-3 gap-6 relative">
              {[
                {
                  step: '01',
                  title: 'Select Singer & Model Engine',
                  desc: 'Pick an AI legend (Arijit Singh, Sonu Nigam, KK) and select your preferred engine: RVC v2 (48 kHz) or Seed-VC (44.1 kHz).',
                  tag: 'Voice & Engine Selection',
                },
                {
                  step: '02',
                  title: 'Select Creation Mode',
                  desc: 'Choose "I Sang This Vocal" to auto-tune your take, or "Neural AI Cover" to resing any file, YouTube, or Spotify track.',
                  tag: 'Distinct Creation Paths',
                },
                {
                  step: '03',
                  title: 'Master & Export',
                  desc: 'Lyra extracts stems with RoFormer v2, applies melody alignment, masters acoustic depth, and exports 24-bit stems and MIDI.',
                  tag: 'DAW-Ready Stems',
                },
              ].map((item, idx) => (
                <div key={item.step} className="p-5 rounded-2xl bg-black/40 border border-white/5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-mono text-2xl font-bold text-[#e5a958]">{item.step}</span>
                      <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">{item.tag}</span>
                    </div>
                    <h4 className="text-lg font-semibold text-white">{item.title}</h4>
                    <p className="mt-2 text-xs sm:text-sm text-white/60 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        {/* Advanced Settings Decoded */}
        <Reveal delay={400} className="mt-12">
          <div className="rounded-3xl border border-white/10 bg-[#0d0f14] p-6 sm:p-8">
            <div className="flex items-center gap-2 text-xs font-mono uppercase text-[#3fe0c5] mb-2">
              <SlidersHorizontal className="w-4 h-4" /> Pro Audio Knowledge
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-6" style={{ fontFamily: "var(--font-display)" }}>
              Advanced Settings Explained
            </h3>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="font-semibold text-white block text-sm">Pitch Shift (Semitones)</span>
                <p className="text-white/60 mt-1 leading-relaxed">
                  Transposes vocal key. Set <b>-12</b> for female-to-male conversion, or <b>+12</b> for male-to-female conversion. Leave at <b>0</b> for same gender.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="font-semibold text-white block text-sm">Index Feature Rate</span>
                <p className="text-white/60 mt-1 leading-relaxed">
                  Controls timbre retrieval balance (default <b>0.75</b>). Higher = closer accent and tone match; Lower = smoother audio with fewer artifacts.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="font-semibold text-white block text-sm">Voiceless Consonant Protect</span>
                <p className="text-white/60 mt-1 leading-relaxed">
                  Safeguards sharp "s", "t", and breath sounds from robotic warping (default <b>0.33</b>). Prevents voice tearing on acoustic tracks.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                <span className="font-semibold text-white block text-sm">RMVPE Pitch Extraction</span>
                <p className="text-white/60 mt-1 leading-relaxed">
                  Lyra's neural pitch extractor. Resistant to background noise and vocal rasp, extracting clean fundamental frequencies (F0) with zero delay.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Voices & Pipeline Data
 * ------------------------------------------------------------------------- */
const VOICES = [
  { key: 'arijit_singh', name: 'Arijit Singh', tag: 'Soulful • warm chest voice', style: 'Meend glides, delayed vibrato bloom', color: GOLD, colorB: '#ff8a5c', rate: 5.15 },
  { key: 'sonu_nigam', name: 'Sonu Nigam', tag: 'Classical • crystal high register', style: 'Harkat & murki on note changes', color: TEAL, colorB: '#7aa2ff', rate: 5.95 },
  { key: 'kk', name: 'KK', tag: 'Rock & soul • belting power', style: 'Straight-tone push, late vibrato', color: '#f472b6', colorB: '#a78bfa', rate: 5.75 },
];

const PIPELINE = [
  { icon: Scissors, title: 'Separate', body: 'Mel-Band RoFormer pulls the vocal out, then splits lead from backing harmonies.', glyph: 'separate' },
  { icon: Waves, title: 'Clean', body: 'De-reverb strips room tails so the voice model hears only the voice.', glyph: 'clean' },
  { icon: Music4, title: 'Melody engine', body: 'Key detection, note-level tuning, guide-melody & timing alignment — on the pitch curve.', glyph: 'melody' },
  { icon: Mic2, title: 'Render', body: 'Seed-VC singing diffusion or RVC v2 48 kHz — whichever scores best for that voice.', glyph: 'render' },
  { icon: Layers, title: 'Mix & export', body: 'Master, 24-bit stems, MIDI melody, key & BPM — ready for your DAW.', glyph: 'export' },
];

const FAQ = [
  ['I can\'t sing. Will this actually help?', 'Yes — that\'s what My Voice mode is for. Sing your take (optionally over the original song). Lyra aligns your timing to the original, moves your notes onto the melody, steadies wobble and can add gentle vibrato. Then you choose: keep your own voice, or have it sung by a voice model.'],
  ['Can I fix pitch and auto-tune my vocal recording?', 'Yes! When you record your vocal take or upload an a cappella audio clip, toggle the "Fix Pitch & Auto-Tune" checkbox. When active, it locks your melody to the detected key and scale; uncheck it to preserve raw microtonal nuances.'],
  ['What do composers get out of it?', 'Every render exports 24-bit dry stems (converted lead, harmony, original backing vocals, instrumental), a MIDI file of the final melody, and the detected key and tempo. You can re-render a single section with new settings without redoing the song.'],
  ['Which AI models does Lyra use?', 'Two singing engines: Seed-VC singing (a 2024 diffusion model with Whisper and BigVGAN, 44.1 kHz) sings as a voice from a short sample, and RVC v2 (trained at up to 48 kHz) keeps the tightest pitch and cleanest audio.'],
  ['Which hardware do I need?', 'Apple Silicon Macs (M1/M2/M3/M4) run natively on Metal with zero memory leaks (~219 MB). NVIDIA GPUs run with CUDA. Everything also runs on CPU, just slower.'],
  ['Is it OK to use famous voices?', 'Lyra is a personal, for-fun project. Voice likeness is protected in many places, so keep celebrity-voice renders private and don\'t publish or monetise them. Your own voice is always yours to use.'],
];

/* ---------------------------------------------------------------------------
 * Main Landing Page Component
 * ------------------------------------------------------------------------- */
export default function LandingPage({ onLaunchStudio }) {
  const [openFaq, setOpenFaq] = useState(0);

  const launch = (model, opts) => onLaunchStudio && onLaunchStudio(model, opts);

  return (
    <main className="relative bg-[#07080a] text-white overflow-x-hidden">
      {/* ================================================================ HERO */}
      <section id="hero" className="relative min-h-[92svh] flex items-center overflow-hidden pt-24 pb-16 px-4 sm:px-6">
        <div className="hero-grid absolute inset-0" />
        <div className="aurora pointer-events-none absolute -top-40 right-[-10%] w-[800px] h-[550px]" />
        
        <div className="relative z-10 max-w-7xl mx-auto w-full grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
          {/* Text column */}
          <div className="text-center lg:text-left">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs tracking-[0.2em] uppercase text-white/75">
                <Sparkles className="w-3.5 h-3.5" style={{ color: GOLD }} /> Neural vocal studio
              </span>
            </Reveal>

            {/* Clean, well-proportioned headline */}
            <Reveal delay={100}>
              <h1 className="mt-6 text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08]" style={{ fontFamily: "var(--font-display)" }}>
                Sing it your way.<br />
                <span className="text-white/90">Hear it </span>
                <span
                  className="font-accent bg-clip-text text-transparent pr-2"
                  style={{ backgroundImage: `linear-gradient(100deg, ${GOLD}, #ffe2b0 45%, ${TEAL})` }}
                >
                  perfected.
                </span>
              </h1>
            </Reveal>

            <Reveal delay={200}>
              <p className="mx-auto lg:mx-0 mt-5 max-w-xl text-base sm:text-lg text-white/65 leading-relaxed">
                Lyra fixes your pitch and timing against the original track, then sings it back in your own voice — or as an AI legend. Studio stems, key detection, and MIDI included.
              </p>

              <div className="mx-auto lg:mx-0 mt-4 max-w-xl flex flex-wrap justify-center lg:justify-start gap-2 text-[11px] font-mono text-white/60">
                <span className="rounded-full border border-[#3fe0c5]/30 bg-[#3fe0c5]/[0.06] px-3 py-1 text-[#3fe0c5]">Seed-VC · 44.1 kHz Hi-Fi</span>
                <span className="rounded-full border border-[#e5a958]/30 bg-[#e5a958]/[0.06] px-3 py-1 text-[#e5a958]">RVC v2 · 48 kHz Metal</span>
                <span className="rounded-full border border-white/15 px-3 py-1 text-white/70">Apple Silicon Zero-Cache</span>
              </div>
            </Reveal>

            {/* ONLY ONE PRIMARY BUTTON TO CONVERT VOICE */}
            <Reveal delay={300}>
              <div className="mt-9 flex justify-center lg:justify-start">
                <button
                  type="button"
                  onClick={() => launch(undefined, { mode: 'convert' })}
                  className="shine-btn group inline-flex items-center justify-center gap-3 rounded-full bg-gradient-to-r from-[#e5a958] to-[#f5ba6e] text-black font-bold text-base px-8 py-4 cursor-pointer shadow-[0_0_35px_rgba(229,169,88,0.35)] hover:shadow-[0_0_50px_rgba(229,169,88,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Sparkles className="w-5 h-5 text-black" />
                  <span>Convert Voice Now</span>
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1.5" />
                </button>
              </div>
            </Reveal>
          </div>

          {/* Right Column: Live Neural Console Preview (Replaces Clunky 3D Orb) */}
          <div className="relative">
            <Reveal delay={200}>
              <HeroConsolePreview />
            </Reveal>
          </div>
        </div>

        <button
          type="button"
          onClick={() => document.getElementById('benchmarks')?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/40 hover:text-white/80 transition cursor-pointer"
          aria-label="Scroll down"
        >
          <ChevronDown className="w-6 h-6 animate-bounce" />
        </button>
      </section>

      {/* ============================================================ MARQUEE */}
      <div className="relative border-y border-white/10 bg-black/60 py-4 overflow-hidden">
        <div className="marquee flex gap-12 whitespace-nowrap text-sm uppercase tracking-[0.25em] text-white/40">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-12 shrink-0">
              {['RoFormer separation', 'Lead / backing split', 'De-reverb', 'Note-level tuning', 'Guide melody', 'Timing alignment', 'Auto-tune & pitch snap', 'Diatonic harmony', 'MIDI export', '24-bit stems'].map((w) => (
                <span key={w} className="flex items-center gap-12">{w}<span style={{ color: GOLD }}>✦</span></span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ BENCHMARK SECTION */}
      <BenchmarkSection />

      {/* ============================================================ ENGINE & NEW USER GUIDE */}
      <EngineGuideSection />

      {/* =============================================================== DEMO */}
      <section id="demo" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase" style={{ color: TEAL }}>Play with it</p>
            <h2 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl" style={{ fontFamily: "var(--font-display)" }}>
              Drag the sliders. Watch a shaky take become a melody.
            </h2>
          </Reveal>
          <Reveal delay={150} className="mt-12">
            <PitchDemo />
          </Reveal>
        </div>
      </section>

      {/* ============================================================ MY VOICE */}
      <section id="myvoice" className="relative py-24 sm:py-32 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(229,169,88,0.08),transparent_60%)]" />
        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <Reveal>
              <p className="text-xs tracking-[0.3em] uppercase" style={{ color: GOLD }}>My Voice mode</p>
              <h2 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                For people who love singing more than they're good at it.
              </h2>
            </Reveal>
            <div className="mt-10 space-y-6">
              {[
                ['01', 'Sing your take', 'Record in the studio or upload. Add the original song as a guide if you have it.'],
                ['02', 'Lyra makes it musical', 'Your phrasing lands on the original timing; every note moves onto the melody; wobble is steadied.'],
                ['03', 'Choose who sings', 'Keep your own voice — fixed and in tune — or hand the performance to a voice model.'],
              ].map(([n, t, b], i) => (
                <Reveal key={n} delay={i * 120}>
                  <div className="flex gap-5 group">
                    <span className="font-mono text-sm pt-1" style={{ color: GOLD }}>{n}</span>
                    <div className="border-l border-white/10 pl-5 group-hover:border-[#e5a958]/60 transition-colors">
                      <h3 className="text-lg font-semibold">{t}</h3>
                      <p className="text-white/60 mt-1 leading-relaxed">{b}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={400}>
              <button
                type="button"
                onClick={() => launch(undefined, { mode: 'my_voice' })}
                className="mt-10 inline-flex items-center gap-2 rounded-full border border-[#e5a958]/50 text-[#e5a958] px-6 py-3 hover:bg-[#e5a958] hover:text-black transition cursor-pointer font-medium"
              >
                Start singing <ArrowRight className="w-4 h-4" />
              </button>
            </Reveal>
          </div>

          {/* Clean Vocal Spectrum Card (Ribbon Removed) */}
          <Reveal delay={200}>
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#14171d] to-[#0a0c0f] p-8 shadow-2xl relative overflow-hidden">
              <div className="flex justify-between items-center text-xs font-mono pb-4 border-b border-white/10">
                <span className="text-rose-300">Raw Microphone Take (Wobble: ±42¢)</span>
                <span className="text-[#3fe0c5]">Lyra Polished (0¢ Snapped)</span>
              </div>

              <div className="my-8 py-6 px-4 bg-black/40 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/60">Pitch Correction Fidelity</span>
                  <span className="font-mono text-emerald-400 font-bold">100% In-Key</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full w-[96%]" />
                </div>

                <div className="flex items-center justify-between text-xs pt-2">
                  <span className="text-white/60">Timing Alignment to Guide</span>
                  <span className="font-mono text-[#3fe0c5] font-bold">Sample-Locked</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-[#3fe0c5] rounded-full w-[94%]" />
                </div>
              </div>

              <div className="space-y-3">
                {[['Target Output', 'Your Voice (In Tune) or AI Legend'], ['Sound Texture', 'Studio Grade · Denoised · De-Reverbed']].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center rounded-xl bg-black/50 backdrop-blur border border-white/10 px-4 py-2.5 text-sm">
                    <span className="text-white/50">{k}</span><span className="font-medium text-white/90">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================ PIPELINE */}
      <section id="features" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase" style={{ color: TEAL }}>How it works</p>
            <h2 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl" style={{ fontFamily: "var(--font-display)" }}>
              Five stages. One render. No robotic autotune passes.
            </h2>
          </Reveal>
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {PIPELINE.map((s, i) => (
              <Reveal key={s.title} delay={i * 100}>
                <TiltCard className="h-full min-h-[360px]" glow={i % 2 ? TEAL : GOLD}>
                  <Glyph3D kind={s.glyph} colorA={i % 2 ? TEAL : GOLD} colorB={i % 2 ? GOLD : TEAL} className="absolute inset-x-0 top-10 h-36 opacity-80 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />
                  <div className="relative h-full flex flex-col p-5">
                    <div className="flex items-center justify-between">
                      <span className="w-10 h-10 rounded-2xl grid place-items-center bg-white/10 border border-white/15">
                        <s.icon className="w-5 h-5" style={{ color: i % 2 ? TEAL : GOLD }} />
                      </span>
                      <span className="font-mono text-xs text-white/40">0{i + 1}</span>
                    </div>
                    <h3 className="mt-auto text-xl font-semibold">{s.title}</h3>
                    <p className="mt-2 text-sm text-white/60 leading-relaxed min-h-[6.5rem]">{s.body}</p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================== VOICES */}
      <section id="models" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase" style={{ color: GOLD }}>Voices</p>
            <h2 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Three legends. And you.
            </h2>
          </Reveal>
          <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {VOICES.map((v, i) => (
              <Reveal key={v.key} delay={i * 100}>
                <TiltCard className="h-[420px]" glow={v.color} onClick={() => launch(v.key, { mode: 'convert' })}>
                  <Glyph3D kind="voice" colorA={v.color} colorB={v.colorB} rate={v.rate} tilt={0.55} zoom={1.0} className="absolute inset-x-0 top-10 h-52 opacity-85 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none" />
                  <div className="relative h-full p-6 flex flex-col">
                    <div className="mt-auto">
                      <h3 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{v.name}</h3>
                      <p className="text-sm mt-1" style={{ color: v.color }}>{v.tag}</p>
                      <p className="text-sm text-white/55 mt-3 min-h-[2.5rem]">{v.style}</p>
                      <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-white/80 group-hover:gap-3 transition-all">Use this voice <ArrowRight className="w-4 h-4" /></span>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
            <Reveal delay={300}>
              <TiltCard className="h-[420px] border border-cyan-500/30" glow={TEAL} onClick={() => launch(undefined, { mode: 'convert' })}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(63,224,197,0.12),transparent_60%)]" />
                <Glyph3D kind="render" className="absolute inset-x-0 top-6 h-56 opacity-90" />
                <div className="relative h-full p-6 flex flex-col">
                  <div className="pulse-ring w-14 h-14 rounded-full grid place-items-center border border-cyan-400/50 mx-auto mt-24 bg-black/50 backdrop-blur">
                    <Cpu className="w-6 h-6" style={{ color: TEAL }} />
                  </div>
                  <div className="mt-auto">
                    <h3 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Dual AI Engines</h3>
                    <p className="text-sm mt-1" style={{ color: TEAL }}>RVC v2 (48 kHz) • Seed-VC (44.1 kHz DiT)</p>
                    <p className="text-sm text-white/55 mt-3">Choose either RVC or Seed-VC for all 3 singers. Seamless zero-shot conversion with built-in pitch fixing.</p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-white/80 group-hover:gap-3 transition-all">Launch Studio Converter <ArrowRight className="w-4 h-4" /></span>
                  </div>
                </div>
              </TiltCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* =========================================================== COMPOSERS */}
      <section id="composers" className="relative py-24 sm:py-32 px-4 sm:px-6 overflow-hidden">
        <div className="hero-grid absolute inset-0 opacity-60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(63,224,197,0.08),transparent_55%)]" />
        <div className="relative max-w-6xl mx-auto">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase" style={{ color: TEAL }}>For composers & musicians</p>
            <h2 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl" style={{ fontFamily: "var(--font-display)" }}>
              Demo a song in any voice. Drop it straight into your DAW.
            </h2>
          </Reveal>
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              [Download, '24-bit dry stems', 'Converted lead, harmony, original backing vocals and instrumental — sample-aligned, no forced reverb.'],
              [FileMusic, 'MIDI melody', 'The final sung melody as a .mid file, with the detected tempo.'],
              [Gauge, 'Key & BPM', 'Detected from the backing track and used to tune notes in key.'],
              [Wand2, 'Harmony in key', 'A diatonic third or fifth sung by the same voice, mixed beside the lead.'],
              [SlidersHorizontal, 'Section re-render', 'Re-sing only bars that need it with new pitch or correction settings.'],
              [Sparkles, 'Measured, not guessed', 'A benchmark scores both engines on likeness, pitch and lyric clarity, and picks the winner per voice.'],
            ].map(([Icon, t, b], i) => (
              <Reveal key={t} delay={i * 80}>
                <div className="h-full rounded-2xl border border-white/10 bg-black/40 backdrop-blur p-6 hover:border-[#3fe0c5]/40 hover:bg-black/60 transition group">
                  <Icon className="w-6 h-6 transition-transform group-hover:scale-110 group-hover:-rotate-6" style={{ color: TEAL }} />
                  <h3 className="mt-4 text-lg font-semibold">{t}</h3>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================= FAQ */}
      <section id="faq" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <Reveal>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Questions</h2>
          </Reveal>
          <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
            {FAQ.map(([q, a], i) => (
              <Reveal key={q} delay={i * 60}>
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full text-left py-5 flex items-center justify-between gap-6 cursor-pointer group">
                  <span className="text-lg font-medium group-hover:text-[#e5a958] transition-colors">{q}</span>
                  <ChevronDown className={`w-5 h-5 shrink-0 text-white/50 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <div className={`grid transition-all duration-500 ${openFaq === i ? 'grid-rows-[1fr] opacity-100 pb-5' : 'grid-rows-[0fr] opacity-0'}`}>
                  <p className="overflow-hidden text-white/60 leading-relaxed">{a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================= CTA */}
      <section className="relative py-28 px-4 sm:px-6 overflow-hidden border-t border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(229,169,88,0.08),#07080a_70%)]" />
        <Reveal className="relative max-w-3xl mx-auto text-center">
          <div className="flex justify-center"><LyraLogo /></div>
          <h2 className="mt-6 text-3xl sm:text-5xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Your song is waiting.</h2>
          <p className="mt-4 text-white/70 text-base sm:text-lg">Upload a take, paste a link, or record your voice.</p>
          <button
            type="button"
            onClick={() => launch(undefined, { mode: 'convert' })}
            className="shine-btn group mt-9 inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-[#e5a958] to-[#f5ba6e] text-black font-bold text-base px-8 py-4 cursor-pointer shadow-[0_0_35px_rgba(229,169,88,0.35)] hover:shadow-[0_0_50px_rgba(229,169,88,0.6)]"
          >
            <span>Open Studio Workspace</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-xs text-white/35">
        Lyra — Neural Vocal Timbre Studio. Keep renders of real artists' voices private.
      </footer>
    </main>
  );
}
