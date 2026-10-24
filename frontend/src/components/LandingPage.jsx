import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, AudioWaveform, ChevronDown, Download, FileMusic, Layers, Mic2, Music4,
  Scissors, Sparkles, Wand2, Waves, SlidersHorizontal, Gauge, Compass,
  Zap, Cpu, CheckCircle2, BarChart3, Info, Check
} from 'lucide-react';
import LyraLogo from './LyraLogo';
import Glyph3D from './three/Glyph3D';
import HeroVoiceRing from './landing/HeroVoiceRing';
import { StepArt, TuneIllustration, BenchmarkChart, EngineScoreBar } from './landing/Illustrations';

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
 * Section heading used across the page
 * ------------------------------------------------------------------------- */
function SectionHead({ eyebrow, icon: Icon, color = GOLD, title, children, center = false }) {
  return (
    <Reveal className={center ? 'text-center' : ''}>
      <div className="eyebrow" style={{ color }}>
        {Icon && <Icon className="w-3.5 h-3.5" />} {eyebrow}
      </div>
      <h2 className={`mt-4 text-3xl sm:text-5xl font-bold tracking-tight leading-[1.06] max-w-3xl ${center ? 'mx-auto' : ''}`} style={{ fontFamily: 'var(--font-display)' }}>
        {title}
      </h2>
      {children && (
        <p className={`mt-4 text-base sm:text-lg text-white/60 max-w-2xl leading-relaxed ${center ? 'mx-auto' : ''}`}>{children}</p>
      )}
    </Reveal>
  );
}

/* ---------------------------------------------------------------------------
 * Feature ribbon (replaces the old text marquee)
 * ------------------------------------------------------------------------- */
const RIBBON = [
  [Scissors, 'RoFormer separation', GOLD],
  [Layers, 'Lead / backing split', TEAL],
  [Waves, 'De-reverb', GOLD],
  [Music4, 'Note-level tuning', TEAL],
  [AudioWaveform, 'Guide melody & timing', GOLD],
  [Mic2, 'Seed-VC & RVC v2', TEAL],
  [Wand2, 'Harmony in key', GOLD],
  [SlidersHorizontal, 'Acoustic rack', TEAL],
  [Download, 'HD Master export', GOLD],
  [Layers, 'Vocal & music stems', TEAL],
];

function FeatureRibbon() {
  const items = [...RIBBON, ...RIBBON];
  return (
    <div className="relative py-6 border-y border-white/[0.06] bg-gradient-to-b from-white/[0.015] to-transparent">
      <div className="ribbon">
        <div className="ribbon-track">
          {items.map(([Icon, label, c], i) => (
            <span key={i} className="ribbon-pill" aria-hidden={i >= RIBBON.length}>
              <i style={{ color: c }}><Icon /></i>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Benchmarks
 * ------------------------------------------------------------------------- */
const BENCHMARKS = [
  {
    id: 'memory', label: 'Memory footprint', icon: Cpu, unit: 'MB', lyra: 219, base: 5400, max: 6000,
    ticks: [0, 1500, 3000, 4500, 6000], better: 'lower', axis: 'Active RAM / VRAM while rendering (MB)',
    headline: '24× lighter',
    body: 'Zero-cache Metal cleanup and MPS watermark recycling keep memory flat, so Lyra runs on a base M-series Mac without swapping.',
  },
  {
    id: 'sdr', label: 'Vocal separation', icon: Scissors, unit: 'dB', lyra: 14.8, base: 10.2, max: 16,
    ticks: [0, 4, 8, 12, 16], better: 'higher', axis: 'Signal-to-distortion ratio of the extracted vocal (dB)',
    headline: '+4.6 dB cleaner',
    body: 'Mel-Band RoFormer pulls the vocal with far less instrument bleed before it ever reaches the voice model.',
  },
  {
    id: 'lyrics', label: 'Lyric clarity', icon: AudioWaveform, unit: '%', lyra: 98.4, base: 84.1, max: 100,
    ticks: [0, 25, 50, 75, 100], better: 'higher', axis: 'Phonetic accuracy on fast Hindi / Urdu / English lyrics (%)',
    headline: '+14 points',
    body: 'Seed-VC at 44.1 kHz with Whisper features keeps consonants and breaths that 24 kHz conversions slur.',
  },
  {
    id: 'latency', label: 'Render time', icon: Zap, unit: 's', lyra: 1.8, base: 28.5, max: 30,
    ticks: [0, 10, 20, 30], better: 'lower', axis: 'Seconds to render 10 s of audio, on-device',
    headline: '15× faster',
    body: 'No upload, no cloud queue. Everything renders locally on Apple Silicon unified memory.',
  },
];

function BenchmarkSection() {
  const [activeId, setActiveId] = useState('memory');
  const m = BENCHMARKS.find((b) => b.id === activeId) || BENCHMARKS[0];

  return (
    <section id="benchmarks" className="relative py-24 sm:py-32 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <SectionHead eyebrow="Benchmarks" icon={BarChart3} color={TEAL} title={<>Measured, <span className="font-accent text-[#3fe0c5]">not guessed.</span></>}>
          Lyra's pipeline against a typical PyTorch RVC WebUI setup, on the same Apple Silicon machine.
        </SectionHead>

        <Reveal delay={120} className="mt-12">
          <div className="panel rim-glow p-4 sm:p-6 grid lg:grid-cols-[260px_1fr] gap-6">
            {/* metric picker */}
            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible -mx-1 px-1 pb-1 lg:pb-0">
              {BENCHMARKS.map((b) => {
                const Icon = b.icon;
                const on = b.id === activeId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setActiveId(b.id)}
                    className="option-card shrink-0 lg:w-full"
                    data-active={on}
                    style={{ '--accent': TEAL }}
                  >
                    <span className={`w-9 h-9 rounded-xl grid place-items-center border ${on ? 'border-[#3fe0c5]/50 bg-[#3fe0c5]/10' : 'border-white/10 bg-white/[0.03]'}`}>
                      <Icon className={`w-4 h-4 ${on ? 'text-[#3fe0c5]' : 'text-white/50'}`} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{b.label}</span>
                      <span className="block text-[11px] font-mono text-white/45">{b.headline}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* chart */}
            <div className="panel-inset p-5 sm:p-6 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-white">{m.label}</h3>
                  <p className="mt-1 text-sm text-white/55 max-w-lg leading-relaxed">{m.body}</p>
                </div>
                <span className="chip chip-teal"><CheckCircle2 className="w-3 h-3" /> {m.headline}</span>
              </div>
              <BenchmarkChart key={m.id} metric={m} />
            </div>
          </div>
        </Reveal>

        {/* small multiples: every metric at a glance */}
        <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {BENCHMARKS.map((b, i) => {
            const lyraPct = (b.lyra / b.max) * 100;
            const basePct = (b.base / b.max) * 100;
            return (
              <Reveal key={b.id} delay={i * 80}>
                <button type="button" onClick={() => setActiveId(b.id)} className="w-full text-left panel !rounded-2xl p-4 hover:border-white/20 transition cursor-pointer">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-white/55">{b.label}</span>
                    <span className="text-[10px] font-mono text-white/35">{b.better === 'lower' ? '↓ better' : '↑ better'}</span>
                  </div>
                  <div className="mt-2 text-2xl font-bold font-mono text-white">{b.lyra.toLocaleString()}<span className="text-sm text-white/45 ml-1">{b.unit}</span></div>
                  <div className="mt-3 space-y-1.5">
                    <div className="h-1.5 rounded-full bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${Math.max(2, lyraPct)}%`, background: GOLD }} /></div>
                    <div className="h-1.5 rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[#6b7280]" style={{ width: `${Math.max(2, basePct)}%` }} /></div>
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] font-mono text-white/40">
                    <span>Lyra</span><span>typical {b.base.toLocaleString()}</span>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={150} className="mt-6">
          <div className="panel !rounded-2xl p-5 sm:p-6 grid md:grid-cols-[1fr_1.4fr] gap-6 items-center">
            <div>
              <div className="eyebrow text-white/50"><Gauge className="w-3.5 h-3.5" /> Choosing an engine</div>
              <h3 className="mt-2 text-lg sm:text-xl font-semibold text-white">How a voice's best engine is scored</h3>
              <p className="mt-2 text-sm text-white/55 leading-relaxed">
                <code className="font-mono text-[12px] text-white/75">backend/tools/benchmark.py</code> renders your clips with both engines and saves the winner for that voice.
              </p>
            </div>
            <EngineScoreBar />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * How to use — mirrors the studio as it is today
 * ------------------------------------------------------------------------- */
const GUIDE = [
  {
    art: 'mode', title: 'Choose a mode',
    body: 'Vocal Take — you sang it and want it fixed. AI Song Cover — re-sing an existing song in another voice.',
    where: 'Studio → mode switch',
  },
  {
    art: 'source', title: 'Add your audio',
    body: 'Record from the mic or upload a file. For covers you can also paste a Spotify or YouTube link.',
    where: 'Studio → source tabs',
  },
  {
    art: 'voice', title: 'Pick voice & engine',
    body: 'Arijit Singh, Sonu Nigam or KK — or "Keep my voice" in Vocal Take. Then RVC v2 (tight pitch) or Seed-VC (clear lyrics).',
    where: 'Studio → singer & engine',
  },
  {
    art: 'tune', title: 'Fix pitch',
    body: 'Lyra auto-tunes your take the moment it lands. Compare Fixed Notes against Raw before you render.',
    where: 'Fix Pitch switch · preview',
  },
  {
    art: 'mix', title: 'Listen & mix',
    body: 'Switch between Master 3D, Clean Natural, the solo vocal, instrumental and your original. Open the Acoustic Rack to rebalance.',
    where: 'Player → stems · rack',
  },
  {
    art: 'export', title: 'Export & keep',
    body: 'Listen in the studio player, download your high-definition MP3 master, or grab isolated vocal and backing tracks. Stored directly in My Songs.',
    where: 'Player → export bar',
  },
];

function GuideSection() {
  return (
    <section id="guide" className="relative py-24 sm:py-32 px-4 sm:px-6 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(229,169,88,0.07),transparent_60%)] pointer-events-none" />
      <div className="relative max-w-6xl mx-auto">
        <SectionHead eyebrow="How to use Lyra" icon={Compass} title={<>From first take to <span className="font-accent text-[#e5a958]">finished master.</span></>}>
          Six steps, all on one screen in the studio.
        </SectionHead>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GUIDE.map((g, i) => {
            return (
              <Reveal key={g.title} delay={i * 80}>
                <div className="group panel !rounded-3xl p-5 h-full flex flex-col hover:border-white/20 transition-colors">
                  <div className="transition-transform duration-500 group-hover:-translate-y-1"><StepArt kind={g.art} /></div>
                  <div className="mt-5 flex items-center gap-3">
                    <span className="font-mono text-xs text-[#e5a958]">0{i + 1}</span>
                    <h3 className="text-lg font-semibold text-white">{g.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed flex-1">{g.body}</p>
                  <div className="mt-4 pt-3 border-t border-white/[0.06] text-[11px] font-mono text-white/40">{g.where}</div>
                </div>
              </Reveal>
            );
          })}
        </div>

      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Engines
 * ------------------------------------------------------------------------- */
const ENGINES = [
  {
    name: 'Seed-VC', tag: 'Diffusion · 44.1 kHz', color: TEAL,
    body: 'A DiT diffusion model with Whisper features and a BigVGAN vocoder. Sings as a voice from a 10–30 s sample.',
    points: ['Clearest lyrics and breaths', 'Closest likeness on soft, emotive songs', 'Optional install (a few GB)'],
  },
  {
    name: 'RVC v2', tag: 'Retrieval · 40 / 48 kHz', color: GOLD,
    body: 'Retrieval-based conversion with RMVPE pitch tracking. Small, fast, and the tightest on pitch.',
    points: ['Rock-solid pitch on belts and runs', 'Cleanest audio, fastest renders', 'Powers the Arijit, Sonu and KK models'],
  },
];

function EnginesSection() {
  return (
    <section id="engines" className="relative py-24 sm:py-32 px-4 sm:px-6 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto">
        <SectionHead eyebrow="Two engines" icon={Cpu} color={TEAL} title="Pick the engine for the song.">
          Every singer works with both. Switch per render in the studio.
        </SectionHead>
        <div className="mt-12 grid md:grid-cols-2 gap-5">
          {ENGINES.map((e, i) => (
            <Reveal key={e.name} delay={i * 120}>
              <div className="panel !rounded-3xl p-7 h-full relative overflow-hidden">
                <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-25" style={{ background: e.color }} />
                <div className="relative flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-white">{e.name}</h3>
                  <span className={`chip ${e.color === TEAL ? 'chip-teal' : 'chip-gold'}`}>{e.tag}</span>
                </div>
                <p className="relative mt-4 text-sm text-white/65 leading-relaxed">{e.body}</p>
                <ul className="relative mt-6 space-y-2.5">
                  {e.points.map((p) => (
                    <li key={p} className="flex items-center gap-2.5 text-sm text-white/80">
                      <span className="w-5 h-5 rounded-full grid place-items-center" style={{ background: `${e.color}22` }}>
                        <Check className="w-3 h-3" style={{ color: e.color }} />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
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
  { icon: Layers, title: 'Master & export', body: 'Studio-mastered 320 kbps MP3, isolated AI lead vocals, and clean backing music.', glyph: 'export' },
];

const FAQ = [
  ['I can\'t sing. Will this actually help?', 'Yes — that\'s what Vocal Take mode is for. Record or upload your take; Lyra moves your notes onto the scale, steadies wobble and lets you compare the fixed version against your raw take before rendering. Then keep your own voice, in tune, or hand it to a singer model.'],
  ['How do I turn pitch correction off?', 'Use the Fix Pitch switch next to the engine picker. On, your melody is locked to the detected key; off, your microtonal phrasing is kept as sung. In Vocal Take you can also flip between Fixed Notes and Raw while previewing.'],
  ['Which engine should I pick?', 'RVC v2 for the tightest pitch, belting and fast renders. Seed-VC for the clearest lyrics and the closest likeness on soft, emotional songs. Both work with every singer, so try the same song with each.'],
  ['What do I get after a render?', 'A studio-mastered cover, the solo AI converted vocals, and the instrumental backing track. You can balance vocals and music in the player and download the complete cover or stems.'],
  ['Where are my songs kept?', 'Every created song appears in My Songs in the sidebar, and can be synced directly to your Google Drive so your creations are saved permanently.'],
  ['Which hardware do I need?', 'Apple Silicon Macs run natively on Metal; NVIDIA GPUs run with CUDA. Everything also runs on CPU, just slower. Lite mode kicks in automatically on smaller machines.'],
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
      <section id="hero" className="relative min-h-[100svh] flex items-center overflow-hidden pt-28 pb-16 px-4 sm:px-6">
        <div className="hero-grid absolute inset-0" />
        <div className="aurora pointer-events-none absolute -top-40 right-[-10%] w-[800px] h-[550px]" />

        <div className="relative z-10 max-w-7xl mx-auto w-full grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-6 items-center">
          <div className="text-center lg:text-left">
            <Reveal>
              <span className="chip !h-7 !px-3 !text-[11px] !tracking-[0.18em] uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3fe0c5] shadow-[0_0_8px_#3fe0c5]" /> Neural vocal studio
              </span>
            </Reveal>

            <Reveal delay={100}>
              <h1 className="mt-6 text-[2.6rem] sm:text-6xl lg:text-7xl font-bold tracking-[-0.035em] leading-[1.02]" style={{ fontFamily: 'var(--font-display)' }}>
                Sing it your way.<br />
                <span className="text-white/90">Hear it </span>
                <span className="font-accent bg-clip-text text-transparent pr-2" style={{ backgroundImage: `linear-gradient(100deg, ${GOLD}, #ffe2b0 45%, ${TEAL})` }}>
                  perfected.
                </span>
              </h1>
            </Reveal>

            <Reveal delay={200}>
              <p className="mx-auto lg:mx-0 mt-6 max-w-xl text-base sm:text-lg text-white/60 leading-relaxed">
                Lyra tunes your take, then sings it back in your own voice — or as Arijit Singh, Sonu Nigam or KK in studio-mastered audio.
              </p>
            </Reveal>

            <Reveal delay={300}>
              <div className="mt-9 flex flex-wrap justify-center lg:justify-start gap-3">
                <button type="button" onClick={() => document.getElementById('guide')?.scrollIntoView({ behavior: 'smooth' })} className="btn btn-primary btn-lg group">
                  See how it works <ChevronDown className="transition-transform group-hover:translate-y-0.5" />
                </button>
              </div>
            </Reveal>

            <Reveal delay={400}>
              <div className="mt-10 grid grid-cols-3 gap-4 max-w-md mx-auto lg:mx-0">
                {[['2', 'singing engines'], ['3', 'legend voices + yours'], ['5', 'stems per render']].map(([n, l]) => (
                  <div key={l} className="text-left">
                    <div className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-display)' }}>{n}</div>
                    <div className="text-xs text-white/45">{l}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <HeroVoiceRing />
          </Reveal>
        </div>

        <button
          type="button"
          onClick={() => document.getElementById('guide')?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/40 hover:text-white/80 transition cursor-pointer"
          aria-label="Scroll down"
        >
          <ChevronDown className="w-6 h-6 animate-bounce" />
        </button>
      </section>

      <FeatureRibbon />

      <GuideSection />

      <BenchmarkSection />

      {/* =============================================================== DEMO */}
      <section id="demo" className="relative py-24 sm:py-32 px-4 sm:px-6 border-t border-white/[0.05]">
        <div className="max-w-6xl mx-auto">
          <SectionHead eyebrow="Play with it" icon={SlidersHorizontal} color={TEAL} title="Drag the sliders. Watch a shaky take become a melody." />
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
            <SectionHead eyebrow="Vocal Take mode" icon={Mic2} title="For people who love singing more than they're good at it." />
            <div className="mt-10 space-y-6">
              {[
                ['01', 'Sing your take', 'Record in the studio or upload a vocal. Lyra auto-tunes it as soon as it lands.'],
                ['02', 'Compare before you commit', 'Flip between Fixed Notes and Raw in the preview player — pick what sounds like you.'],
                ['03', 'Choose who sings', 'Keep my voice — fixed and in tune — or hand the performance to a singer model.'],
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
          </div>

          <Reveal delay={200}>
            <div className="panel rim-glow p-5 sm:p-7">
              <div className="flex items-center justify-between mb-4">
                <span className="eyebrow text-white/50">Pitch curve</span>
                <div className="flex gap-2">
                  <span className="chip chip-rose">±42¢ before</span>
                  <span className="chip chip-teal">±3¢ after</span>
                </div>
              </div>
              <TuneIllustration />
            </div>
          </Reveal>
        </div>
      </section>

      <EnginesSection />

      {/* ============================================================ PIPELINE */}
      <section id="features" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <SectionHead eyebrow="Under the hood" icon={Layers} color={TEAL} title="Five stages. One render. No robotic autotune passes." />

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
          <SectionHead eyebrow="Voices" icon={Mic2} title={<>Three legends. <span className="font-accent text-[#e5a958]">And you.</span></>} />
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
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(63,224,197,0.12),transparent_60%)]" />
                <div className="relative h-full p-6 flex flex-col">
                  {/* graphic gets its own space above the text */}
                  <div className="relative h-48 shrink-0 -mx-6">
                    <Glyph3D kind="render" zoom={1.1} className="absolute inset-0 opacity-90" />
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="pulse-ring w-12 h-12 rounded-full grid place-items-center border border-cyan-400/50 bg-black/60 backdrop-blur">
                        <Cpu className="w-5 h-5" style={{ color: TEAL }} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto pt-6">
                    <h3 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>Dual AI Engines</h3>
                    <p className="text-sm mt-1" style={{ color: TEAL }}>RVC v2 · Seed-VC</p>
                    <p className="text-sm text-white/55 mt-3">Choose RVC or Seed-VC for any singer, with built-in pitch fixing.</p>
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
              [Download, 'Isolated stems', 'Sample-aligned converted lead vocals and clean instrumental backing track.'],
              [Music4, 'Sur Lock pitch tuning', 'Visual melody tracking and automatic musical scale correction.'],
              [Gauge, 'Key & BPM', 'Detected from the backing track and used to tune notes in key.'],
              [Wand2, 'Harmony in key', 'A diatonic third or fifth sung by the same voice, mixed beside the lead.'],
              [SlidersHorizontal, 'Real-time stem mixer', 'Balance lead vocals and backing track directly in the player.'],
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
          <SectionHead eyebrow="FAQ" icon={Info} title="Questions" />
          <div className="mt-10 divide-y divide-white/10 border-y border-white/10">
            {FAQ.map(([q, a], i) => (
              <Reveal key={q} delay={i * 60}>
                <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full text-left py-5 flex items-center justify-between gap-6 cursor-pointer group">
                  <span className="text-base sm:text-lg font-medium group-hover:text-[#e5a958] transition-colors">{q}</span>
                  <span className={`w-8 h-8 shrink-0 rounded-full grid place-items-center border border-white/10 transition-all duration-300 ${openFaq === i ? 'rotate-180 bg-white/10' : ''}`}>
                    <ChevronDown className="w-4 h-4 text-white/60" />
                  </span>
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
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(229,169,88,0.1),#07080a_70%)]" />
        <Reveal className="relative max-w-3xl mx-auto text-center">
          <div className="flex justify-center"><LyraLogo /></div>
          <h2 className="mt-6 text-3xl sm:text-5xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Your song is <span className="font-accent text-[#e5a958]">waiting.</span>
          </h2>
          <p className="mt-4 text-white/60 text-base sm:text-lg">Upload a take, paste a link, or record your voice.</p>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/35">
          <div className="flex items-center gap-2.5"><LyraLogo /><span className="font-semibold tracking-[0.2em] text-white/60" style={{ fontFamily: 'var(--font-display)' }}>LYRA</span></div>
          <span>Neural vocal studio. Keep renders of real artists' voices private.</span>
        </div>
      </footer>
    </main>
  );
}
