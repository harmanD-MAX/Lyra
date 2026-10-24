import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, AudioWaveform, ChevronDown, Download, FileMusic, Layers, Mic2, Music4,
  Scissors, Sparkles, Wand2, Waves, Users, SlidersHorizontal, Gauge,
} from 'lucide-react';
import LyraLogo from './LyraLogo';
import Glyph3D from './three/Glyph3D';

// three.js scenes load in their own chunk so the page text appears instantly
const VoiceOrbLazy = lazy(() => import('./three/VoiceOrb'));
const PitchRibbonLazy = lazy(() => import('./three/PitchRibbon'));
const VoiceOrb = (props) => <Suspense fallback={null}><VoiceOrbLazy {...props} /></Suspense>;
const PitchRibbon = (props) => <Suspense fallback={null}><PitchRibbonLazy {...props} /></Suspense>;

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
  // A non-singer's take: each note off by up to ±45 cents, slow drift and wobble.
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
 * Page
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
  { icon: Mic2, title: 'Render', body: 'Synthesized once: as a singer, your trained voice, or your untouched timbre.', glyph: 'render' },
  { icon: Layers, title: 'Mix & export', body: 'Master, 24-bit stems, MIDI melody, key & BPM — ready for your DAW.', glyph: 'export' },
];

const HERO_WORDS = ['Arijit', 'Sonu', 'KK', 'yourself'];

const FAQ = [
  ['I can\'t sing. Will this actually help?', 'Yes — that\'s what My Voice mode is for. Sing your take (optionally over the original song). Lyra aligns your timing to the original, moves your notes onto the melody, steadies wobble and can add gentle vibrato. Then you choose: keep your own voice, or have it sung by a voice model.'],
  ['How do I keep sounding like me?', 'Pick "Your voice" as the target. Without training, Lyra re-synthesizes your own timbre with the corrected melody. For the best quality, record 10–20 minutes of yourself (reading + scales) in the Voice Lab and train a personal model.'],
  ['What do composers get out of it?', 'Every render exports 24-bit dry stems (converted lead, harmony, original backing vocals, instrumental), a MIDI file of the final melody, and the detected key and tempo. You can re-render a single section with new settings without redoing the song.'],
  ['Which hardware do I need?', 'An NVIDIA GPU or Apple Silicon Mac makes separation and training fast. Everything also runs on CPU, just slower. Jobs run one at a time so memory stays predictable.'],
  ['Is it OK to use famous voices?', 'Lyra is a personal, for-fun project. Voice likeness is protected in many places, so keep celebrity-voice renders private and don\'t publish or monetise them. Your own voice is always yours to use.'],
];

export default function LandingPage({ onLaunchStudio }) {
  const [openFaq, setOpenFaq] = useState(0);
  const [wordIdx, setWordIdx] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const id = setInterval(() => setWordIdx((i) => (i + 1) % HERO_WORDS.length), 2200);
    return () => clearInterval(id);
  }, []);

  const launch = (model, opts) => onLaunchStudio && onLaunchStudio(model, opts);

  return (
    <main className="relative bg-[#07080a] text-white overflow-x-hidden">
      {/* ================================================================ HERO */}
      <section id="hero" className="relative min-h-[100svh] flex items-center overflow-hidden pt-24 pb-16 px-4 sm:px-6">
        <div className="hero-grid absolute inset-0" />
        <div className="aurora pointer-events-none absolute -top-40 right-[-10%] w-[900px] h-[600px]" />
        <div className="relative z-10 max-w-7xl mx-auto w-full grid lg:grid-cols-[1.05fr_1fr] gap-6 items-center">
          {/* text column: always on plain dark background */}
          <div className="order-2 lg:order-1 text-center lg:text-left">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs tracking-[0.2em] uppercase text-white/70">
                <Sparkles className="w-3.5 h-3.5" style={{ color: GOLD }} /> Neural vocal studio
              </span>
            </Reveal>
            <Reveal delay={120}>
              <h1 className="mt-6 text-[clamp(2.6rem,6.2vw,5.6rem)] leading-[0.95] font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Sing it badly.<br />
                <span className="text-white/90">Hear it as </span>
                <span className="relative inline-block min-w-[4ch] text-left">
                  {HERO_WORDS.map((w, i) => (
                    <span
                      key={w}
                      className={`absolute left-0 top-0 whitespace-nowrap bg-clip-text text-transparent transition-all ${i === wordIdx ? 'opacity-100 translate-y-0 blur-0 duration-700 delay-300' : 'opacity-0 -translate-y-5 blur-sm duration-300'}`}
                      style={{ backgroundImage: `linear-gradient(100deg, ${GOLD}, #ffe2b0 45%, ${TEAL})` }}
                    >
                      {w}.
                    </span>
                  ))}
                  <span className="invisible">yourself.</span>
                </span>
              </h1>
            </Reveal>
            <Reveal delay={240}>
              <p className="mx-auto lg:mx-0 mt-6 max-w-xl text-base sm:text-lg text-white/65 leading-relaxed">
                Lyra fixes your pitch and timing against the original song, then sings it back in your own voice —
                or as a legend. Studio stems and MIDI included.
              </p>
            </Reveal>
            <Reveal delay={360}>
              <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <button type="button" onClick={() => launch(undefined, { mode: 'my_voice' })} className="shine-btn group inline-flex items-center justify-center gap-2 rounded-full bg-[#e5a958] text-black font-semibold px-7 py-3.5 cursor-pointer">
                  <Mic2 className="w-4 h-4" /> Try My Voice
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button type="button" onClick={() => launch('arijit_singh', { mode: 'convert' })} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/[0.03] px-7 py-3.5 text-white/90 hover:border-white/50 transition cursor-pointer">
                  <AudioWaveform className="w-4 h-4" /> Convert a song
                </button>
              </div>
            </Reveal>
          </div>

          {/* 3D voice orb */}
          <div className="order-1 lg:order-2 relative h-[300px] sm:h-[420px] lg:h-[640px]">
            <VoiceOrb className="absolute inset-0" scale={0.88} />
            <div className="hidden md:block">
              {[
                { t: 'Key detected · C# minor', c: 'left-[4%] top-[16%]', d: '0s' },
                { t: '+38¢ → 0¢', c: 'right-[6%] top-[28%]', d: '1.2s' },
                { t: 'Timing aligned to original', c: 'left-[8%] bottom-[14%]', d: '2.1s' },
                { t: 'Stems · MIDI · 24-bit', c: 'right-[4%] bottom-[22%]', d: '0.6s' },
              ].map((chip) => (
                <span key={chip.t} className={`float-chip absolute ${chip.c} rounded-full border border-white/10 bg-black/60 backdrop-blur px-3 py-1.5 text-[11px] font-mono text-white/70`} style={{ animationDelay: chip.d }}>
                  {chip.t}
                </span>
              ))}
            </div>
          </div>
        </div>

        <button type="button" onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })} className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/40 hover:text-white/80 transition cursor-pointer" aria-label="Scroll down">
          <ChevronDown className="w-6 h-6 animate-bounce" />
        </button>
      </section>

      {/* ============================================================ MARQUEE */}
      <div className="relative border-y border-white/10 bg-black/60 py-4 overflow-hidden">
        <div className="marquee flex gap-12 whitespace-nowrap text-sm uppercase tracking-[0.25em] text-white/40">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-12 shrink-0">
              {['RoFormer separation', 'Lead / backing split', 'De-reverb', 'Note-level tuning', 'Guide melody', 'Timing alignment', 'Personal voice training', 'Diatonic harmony', 'MIDI export', '24-bit stems'].map((w) => (
                <span key={w} className="flex items-center gap-12">{w}<span style={{ color: GOLD }}>✦</span></span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* =============================================================== DEMO */}
      <section id="demo" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase" style={{ color: TEAL }}>Play with it</p>
            <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
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
              <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
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
              <button type="button" onClick={() => launch(undefined, { mode: 'my_voice' })} className="mt-10 inline-flex items-center gap-2 rounded-full border border-[#e5a958]/50 text-[#e5a958] px-6 py-3 hover:bg-[#e5a958] hover:text-black transition cursor-pointer">
                Start singing <ArrowRight className="w-4 h-4" />
              </button>
            </Reveal>
          </div>
          <Reveal delay={200}>
            <TiltCard className="aspect-[4/5] sm:aspect-[5/5] bg-[radial-gradient(circle_at_50%_40%,#15181d,#07080a)]" glow={GOLD}>
              <PitchRibbon className="absolute inset-0" />
              <div className="absolute top-5 left-6 right-6 flex justify-between text-[11px] font-mono">
                <span className="text-rose-300/80">your take</span>
                <span style={{ color: TEAL }}>after Lyra</span>
              </div>
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black via-black/60 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-6 space-y-3">
                {[['Target', 'Your voice'], ['Sound', 'Polished · in tune & steady']].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center rounded-xl bg-black/50 backdrop-blur border border-white/10 px-4 py-2.5 text-sm">
                    <span className="text-white/50">{k}</span><span className="font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </section>

      {/* ============================================================ PIPELINE */}
      <section id="features" className="relative py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase" style={{ color: TEAL }}>How it works</p>
            <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Five stages. One render. No robotic autotune passes.
            </h2>
          </Reveal>
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {PIPELINE.map((s, i) => (
              <Reveal key={s.title} delay={i * 100}>
                <TiltCard className="h-full min-h-[380px]" glow={i % 2 ? TEAL : GOLD}>
                  <Glyph3D kind={s.glyph} colorA={i % 2 ? TEAL : GOLD} colorB={i % 2 ? GOLD : TEAL} className="absolute inset-x-0 top-12 h-40 opacity-80 group-hover:opacity-100 transition-opacity" />
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
            <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
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
                      <h3 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{v.name}</h3>
                      <p className="text-sm mt-1" style={{ color: v.color }}>{v.tag}</p>
                      <p className="text-sm text-white/55 mt-3 min-h-[2.5rem]">{v.style}</p>
                      <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-white/80 group-hover:gap-3 transition-all">Use this voice <ArrowRight className="w-4 h-4" /></span>
                    </div>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
            <Reveal delay={300}>
              <TiltCard className="h-[420px] border-dashed border-[#e5a958]/40" glow={GOLD} onClick={() => launch(undefined, { mode: 'my_voice', openVoiceLab: true })}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(229,169,88,0.14),transparent_60%)]" />
                <Glyph3D kind="render" className="absolute inset-x-0 top-6 h-56 opacity-90" />
                <div className="relative h-full p-6 flex flex-col">
                  <div className="pulse-ring w-14 h-14 rounded-full grid place-items-center border border-[#e5a958]/50 mx-auto mt-24 bg-black/50 backdrop-blur">
                    <Users className="w-6 h-6" style={{ color: GOLD }} />
                  </div>
                  <div className="mt-auto">
                    <h3 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Your Voice</h3>
                    <p className="text-sm mt-1" style={{ color: GOLD }}>Personal model • trained on you</p>
                    <p className="text-sm text-white/55 mt-3">Record 10–20 minutes in the Voice Lab. Lyra fine-tunes a model that sings as you — in tune.</p>
                    <span className="mt-5 inline-flex items-center gap-1.5 text-sm text-white/80 group-hover:gap-3 transition-all">Open Voice Lab <ArrowRight className="w-4 h-4" /></span>
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
            <h2 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
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
              [Sparkles, 'Measured quality', 'A benchmark tool scores pitch accuracy, speaker similarity and intelligibility.'],
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
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Questions</h2>
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
      <section className="relative py-32 px-4 sm:px-6 overflow-hidden">
        <VoiceOrb className="absolute inset-0 opacity-35" scale={1.25} interactive={false} colorA="#3fe0c5" colorB="#e5a958" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(7,8,10,0.55),#07080a_70%)]" />
        <Reveal className="relative max-w-3xl mx-auto text-center">
          <div className="flex justify-center"><LyraLogo /></div>
          <h2 className="mt-6 text-4xl sm:text-6xl font-bold tracking-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Your song is waiting.</h2>
          <p className="mt-5 text-white/70 text-lg">Upload a take, paste a link, or hit record.</p>
          <button type="button" onClick={() => launch(undefined, { mode: 'my_voice' })} className="shine-btn group mt-10 inline-flex items-center gap-2 rounded-full bg-[#e5a958] text-black font-semibold px-8 py-4 cursor-pointer">
            Open the studio <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 py-8 px-6 text-center text-xs text-white/35">
        Lyra — a personal music project. Keep renders of real artists' voices private.
      </footer>
    </main>
  );
}
