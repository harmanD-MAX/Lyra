import React, { useEffect, useMemo, useRef, useState } from 'react';

/* ---------------------------------------------------------------------------
 * Vector illustrations for the landing page. Pure SVG + CSS animation so they
 * stay crisp at every size and cost nothing to render.
 * ------------------------------------------------------------------------- */

const GOLD = '#e5a958';
const TEAL = '#3fe0c5';
const ROSE = '#fb7185';

/** Deterministic "messy take" waveform across [x0, x1] centred on y. */
function jaggedPath(x0, x1, y, amp, steps = 70) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const x = x0 + (x1 - x0) * u;
    const env = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.55);
    const v = Math.sin(u * 38) * 0.55 + Math.sin(u * 91 + 1.3) * 0.3 + Math.sin(u * 17 + 0.4) * 0.35;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)},${(y + v * amp * env).toFixed(1)} `;
  }
  return d;
}

/* --------------------------------------------------- HOW-TO STEP ICONS -- */
const stepFrame = (children, label) => (
  <svg viewBox="0 0 160 110" className="w-full h-auto" role="img" aria-label={label}>
    <defs>
      <linearGradient id="st-g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stopColor={GOLD} />
        <stop offset="100%" stopColor={TEAL} />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="158" height="108" rx="16" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.07)" />
    {children}
  </svg>
);

const STEP_ART = {
  mode: () => stepFrame(
    <>
      <rect x="18" y="30" width="58" height="50" rx="12" fill="rgba(229,169,88,0.14)" stroke={GOLD} />
      <rect x="40" y="40" width="14" height="22" rx="7" fill={GOLD} />
      <path d="M34 58 Q34 70 47 70 Q60 70 60 58" stroke={GOLD} strokeWidth="2" fill="none" />
      <rect x="84" y="30" width="58" height="50" rx="12" fill="rgba(63,224,197,0.08)" stroke="rgba(63,224,197,0.5)" />
      <circle cx="113" cy="55" r="13" fill="none" stroke={TEAL} strokeWidth="2" />
      <circle cx="113" cy="55" r="3" fill={TEAL} />
      <text x="47" y="96" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.5)" fontFamily="JetBrains Mono">VOCAL TAKE</text>
      <text x="113" y="96" textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.5)" fontFamily="JetBrains Mono">AI COVER</text>
    </>, 'Choose a mode'),
  source: () => stepFrame(
    <>
      <rect x="22" y="22" width="116" height="40" rx="10" fill="none" stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
      <path d="M80 50 V32 M72 39 L80 31 L88 39" stroke={GOLD} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[['#22c55e', 'SPOTIFY', 30], ['#ef4444', 'YOUTUBE', 82]].map(([c, t, x]) => (
        <g key={t}>
          <rect x={x} y="72" width="48" height="18" rx="9" fill={`${c}22`} stroke={`${c}88`} />
          <text x={x + 24} y="84" textAnchor="middle" fontSize="7.5" fill={c} fontFamily="JetBrains Mono">{t}</text>
        </g>
      ))}
    </>, 'Add a source'),
  voice: () => stepFrame(
    <>
      {[[42, GOLD, 'AS'], [80, TEAL, 'SN'], [118, '#f472b6', 'KK']].map(([x, c, t], i) => (
        <g key={t}>
          <circle cx={x} cy="48" r={i === 0 ? 19 : 16} fill={`${c}22`} stroke={c} strokeWidth={i === 0 ? 2 : 1} />
          <text x={x} y="52" textAnchor="middle" fontSize="10" fontWeight="700" fill={c} fontFamily="Bricolage Grotesque, sans-serif">{t}</text>
        </g>
      ))}
      <rect x="30" y="78" width="46" height="16" rx="8" fill="rgba(229,169,88,0.18)" stroke={GOLD} />
      <text x="53" y="89" textAnchor="middle" fontSize="7.5" fill={GOLD} fontFamily="JetBrains Mono">RVC v2</text>
      <rect x="84" y="78" width="46" height="16" rx="8" fill="none" stroke="rgba(63,224,197,0.5)" />
      <text x="107" y="89" textAnchor="middle" fontSize="7.5" fill={TEAL} fontFamily="JetBrains Mono">SEED-VC</text>
    </>, 'Pick a voice and engine'),
  tune: () => stepFrame(
    <>
      {[0, 1, 2, 3].map((k) => <line key={k} x1="18" x2="142" y1={30 + k * 16} y2={30 + k * 16} stroke="rgba(255,255,255,0.06)" />)}
      <path d={jaggedPath(18, 142, 55, 14, 40)} stroke={ROSE} strokeOpacity="0.6" strokeWidth="1.5" fill="none" strokeDasharray="1 3" />
      <path d="M18 62 H52 Q56 62 58 46 H96 Q100 46 102 62 H142" stroke={TEAL} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="44" y="84" width="72" height="16" rx="8" fill="rgba(229,169,88,0.15)" stroke={GOLD} />
      <circle cx="104" cy="92" r="5" fill={GOLD} />
      <text x="70" y="95" textAnchor="middle" fontSize="7.5" fill={GOLD} fontFamily="JetBrains Mono">FIX PITCH</text>
    </>, 'Fix pitch'),
  mix: () => stepFrame(
    <>
      {[[30, 0.7, GOLD], [58, 0.45, GOLD], [86, 0.25, TEAL], [114, 0.6, TEAL]].map(([x, v, c]) => (
        <g key={x}>
          <line x1={x} x2={x} y1="22" y2="86" stroke="rgba(255,255,255,0.12)" strokeWidth="3" strokeLinecap="round" />
          <line x1={x} x2={x} y1={86 - v * 64} y2="86" stroke={c} strokeWidth="3" strokeLinecap="round" />
          <rect x={x - 8} y={80 - v * 64} width="16" height="10" rx="3" fill="#15171c" stroke={c} />
        </g>
      ))}
      <text x="80" y="102" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.45)" fontFamily="JetBrains Mono">VOCAL · MUSIC · REVERB · DEPTH</text>
    </>, 'Mix'),
  export: () => stepFrame(
    <>
      {[['WAV', GOLD], ['MP3', GOLD], ['STEMS', TEAL], ['MIDI', TEAL]].map(([t, c], i) => (
        <g key={t} transform={`translate(${20 + i * 31} 26)`}>
          <path d="M0 0 H18 L26 8 V44 H0 Z" fill="rgba(255,255,255,0.03)" stroke={c} strokeOpacity="0.7" />
          <path d="M18 0 V8 H26" fill="none" stroke={c} strokeOpacity="0.7" />
          <text x="13" y="30" textAnchor="middle" fontSize="6.5" fill={c} fontFamily="JetBrains Mono">{t}</text>
        </g>
      ))}
      <path d="M80 80 V96 M73 89 L80 96 L87 89" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>, 'Export'),
};

export function StepArt({ kind }) {
  const Art = STEP_ART[kind];
  return Art ? <Art /> : null;
}

/* ------------------------------------------------- MY VOICE BEFORE/AFTER -- */
const TUNE_NOTES = [[20, 120, 3], [120, 210, 1], [210, 300, 2], [300, 410, 0], [410, 500, 2]];
const rowY = (r) => 70 + r * 40;

export function TuneIllustration() {
  const W = 520, H = 300;
  const notes = TUNE_NOTES;
  const rawPath = useMemo(() => {
    let d = '';
    notes.forEach(([a, b, r], i) => {
      for (let x = a; x <= b; x += 4) {
        const u = (x - a) / (b - a);
        const y = rowY(r) + [14, -12, 10, -15, 9][i] + Math.sin(x * 0.21) * 6 + Math.sin(x * 0.07 + i) * 8 * (1 - u);
        d += `${x === a && i === 0 ? 'M' : 'L'}${x},${y.toFixed(1)} `;
      }
    });
    return d;
  }, [notes]);
  const fixedPath = useMemo(() => {
    let d = '';
    notes.forEach(([a, b, r], i) => {
      const y = rowY(r);
      if (i === 0) d += `M${a},${y} `;
      else d += `Q${a - 6},${rowY(notes[i - 1][2])} ${a + 6},${y} `;
      // gentle vibrato bloom on the long last note
      if (i === notes.length - 1) {
        for (let x = a + 10; x <= b; x += 3) d += `L${x},${(y + Math.sin((x - a) * 0.3) * 4 * Math.min(1, (x - a - 10) / 40)).toFixed(1)} `;
      } else d += `L${b - 6},${y} `;
    });
    return d;
  }, [notes]);
  const names = ['A', 'G', 'F', 'E'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Pitch curve: a wobbly sung take snapped onto the notes of the melody">
      <defs>
        <linearGradient id="tune-g" x1="0" x2="1">
          <stop offset="0%" stopColor={GOLD} />
          <stop offset="100%" stopColor={TEAL} />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((r) => (
        <g key={r}>
          <rect x="0" y={rowY(r) - 20} width={W} height="40" fill={r % 2 ? 'rgba(255,255,255,0.018)' : 'transparent'} />
          <line x1="28" x2={W} y1={rowY(r)} y2={rowY(r)} stroke="rgba(255,255,255,0.07)" />
          <text x="6" y={rowY(r) + 3} fontSize="10" fill="rgba(255,255,255,0.35)" fontFamily="JetBrains Mono">{names[r]}4</text>
        </g>
      ))}
      {notes.map(([a, b, r]) => (
        <rect key={a} x={a + 2} y={rowY(r) - 7} width={b - a - 4} height="14" rx="5" fill="rgba(229,169,88,0.08)" stroke="rgba(229,169,88,0.25)" />
      ))}
      <path d={rawPath} fill="none" stroke={ROSE} strokeOpacity="0.75" strokeWidth="1.8" strokeDasharray="1 4" strokeLinecap="round" />
      <path d={fixedPath} fill="none" stroke="url(#tune-g)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="draw-line" style={{ '--len': 900 }} />
      <g fontFamily="JetBrains Mono" fontSize="10">
        <circle cx="30" cy="262" r="4" fill={ROSE} /><text x="40" y="266" fill="rgba(255,255,255,0.6)">your take</text>
        <circle cx="130" cy="262" r="4" fill={GOLD} /><text x="140" y="266" fill="rgba(255,255,255,0.6)">after Lyra (vibrato kept on long notes)</text>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------ BENCHMARK CHART -- */
/**
 * Two-bar comparison on the metric's real scale, with ticks, gridlines and
 * direct labels. Hover a bar for its exact value.
 */
export function BenchmarkChart({ metric }) {
  const { max, ticks, unit, lyra, base, better } = metric;
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const [W, setW] = useState(520);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = W < 440;
  const H = 170, L = narrow ? 92 : 150, R = 16, top = 18, barH = 30, gap = 26;
  const x = (v) => L + (v / max) * (W - L - R);
  const rows = [
    { key: 'lyra', label: 'Lyra', sub: 'Metal / MPS pipeline', v: lyra, fill: GOLD },
    { key: 'base', label: 'Typical RVC WebUI', sub: 'PyTorch / cloud', v: base, fill: '#6b7280' },
  ];
  const fmt = (v) => `${v.toLocaleString()}${unit === '%' ? '%' : ` ${unit}`}`;

  return (
    <div className="relative" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${metric.label}: Lyra ${fmt(lyra)}, typical ${fmt(base)}`}>
        {ticks.filter((t, i) => !narrow || i % 2 === 0 || i === ticks.length - 1).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 6} y2={H - 30} stroke="rgba(255,255,255,0.06)" />
            <text x={x(t)} y={H - 14} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.4)" fontFamily="JetBrains Mono">{t.toLocaleString()}</text>
          </g>
        ))}
        <line x1={L} x2={L} y1={top - 6} y2={H - 30} stroke="rgba(255,255,255,0.25)" />
        {rows.map((r, i) => {
          const y = top + i * (barH + gap);
          const w = Math.max(4, x(r.v) - L);
          return (
            <g key={r.key} onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
              <rect x="0" y={y - 8} width={W} height={barH + 16} fill="transparent" />
              <text x={L - 12} y={y + 13} textAnchor="end" fontSize="12.5" fontWeight="600" fill="rgba(255,255,255,0.9)" fontFamily="Inter, sans-serif">{narrow && r.key === 'base' ? 'Typical' : r.label}</text>
              {!narrow && <text x={L - 12} y={y + 27} textAnchor="end" fontSize="9.5" fill="rgba(255,255,255,0.4)" fontFamily="JetBrains Mono">{r.sub}</text>}
              <rect
                key={`${metric.id}-${r.key}`}
                x={L}
                y={y}
                width={w}
                height={barH}
                rx="4"
                fill={r.fill}
                opacity={hover && hover !== r.key ? 0.45 : 1}
                className="bar-grow"
                style={{ transformBox: 'fill-box', animationDelay: `${i * 120}ms`, transition: 'opacity 200ms' }}
              />
              <text
                x={x(r.v) + 8 > W - 70 ? x(r.v) - 8 : x(r.v) + 8}
                y={y + 20}
                textAnchor={x(r.v) + 8 > W - 70 ? 'end' : 'start'}
                fontSize="13"
                fontWeight="700"
                fill={x(r.v) + 8 > W - 70 ? '#0b0c0f' : 'rgba(255,255,255,0.92)'}
                fontFamily="JetBrains Mono"
              >
                {fmt(r.v)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-between text-[11px] font-mono text-white/40 mt-1 px-1">
        <span>{metric.axis}</span>
        <span className={better === 'lower' ? 'text-[#3fe0c5]' : 'text-[#e5a958]'}>{better === 'lower' ? '← lower is better' : 'higher is better →'}</span>
      </div>
    </div>
  );
}

/** The weights benchmark.py uses to pick a voice's "auto" engine. */
export function EngineScoreBar() {
  const parts = [
    { label: 'Voice likeness', sub: 'ECAPA speaker similarity', pct: 50, fill: GOLD },
    { label: 'Pitch accuracy', sub: 'frames within 50¢', pct: 25, fill: TEAL },
    { label: 'Lyric clarity', sub: 'Whisper word error rate', pct: 25, fill: '#a78bfa' },
  ];
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-[2px]">
        {parts.map((p) => <div key={p.label} style={{ width: `${p.pct}%`, background: p.fill }} className="first:rounded-l-full last:rounded-r-full" />)}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {parts.map((p) => (
          <div key={p.label}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
              <span className="text-sm font-semibold text-white">{p.pct}%</span>
            </div>
            <div className="text-xs text-white/75 mt-1">{p.label}</div>
            <div className="text-[11px] font-mono text-white/40">{p.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
