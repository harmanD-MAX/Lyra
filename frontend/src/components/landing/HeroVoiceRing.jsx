import React, { useEffect, useRef, useState } from 'react';

const VOICES = [
  { id: 'arijit_singh', name: 'Arijit Singh', initials: 'AS', color: [229, 169, 88], tag: 'Soulful · warm' },
  { id: 'sonu_nigam', name: 'Sonu Nigam', initials: 'SN', color: [63, 224, 197], tag: 'Classical · bright' },
  { id: 'kk', name: 'KK', initials: 'KK', color: [244, 114, 182], tag: 'Rock · power' },
  { id: 'raw', name: 'Your voice', initials: 'You', color: [167, 139, 250], tag: 'In tune · yours' },
];

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));

/**
 * Hero visual: a radial "singing" spectrum. Bars around the ring move like a
 * voice (syllables, drifting formants, vibrato) and the ring morphs colour as
 * it cycles through the voices. 
 */
export default function HeroVoiceRing() {
  const canvasRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % VOICES.length), 3800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const N = 132;
    const cur = new Array(N).fill(0.1);
    let color = VOICES[0].color.slice();
    let raf, visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(canvas);

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const t = now / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w < 40 || h < 40) return;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      color = mix(color, VOICES[idxRef.current].color, 0.04);
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.25;
      const maxLen = Math.min(w, h) * 0.13;

      // a sung phrase: syllables, slowly drifting formants, vibrato shimmer
      const syll = Math.pow(Math.abs(Math.sin(t * 2.2)), 0.55) * (0.65 + 0.35 * Math.sin(t * 0.63));
      const f1 = 0.18 + 0.06 * Math.sin(t * 0.9);
      const f2 = 0.45 + 0.1 * Math.sin(t * 0.57 + 1);
      const f3 = 0.72 + 0.06 * Math.sin(t * 1.3 + 2);
      const vib = 0.5 + 0.5 * Math.sin(t * 34);
      for (let i = 0; i < N; i++) {
        const u = Math.abs((i / N) * 2 - 1); // mirror left / right
        const harm = 0.55 + 0.45 * Math.cos(u * 46 - t * 2.4);
        let v = (gauss(u, f1, 0.07) + 0.75 * gauss(u, f2, 0.06) + 0.5 * gauss(u, f3, 0.05)) * harm;
        v = 0.08 + v * (0.25 + 0.75 * syll) + 0.05 * vib * gauss(u, f1, 0.1);
        cur[i] += (Math.min(1.1, v) - cur[i]) * (v > cur[i] ? 0.35 : 0.12);
      }

      // soft core glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.9);
      glow.addColorStop(0, rgb(color, 0.22));
      glow.addColorStop(1, rgb(color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // guide rings
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.arc(cx, cy, R - 10, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([2, 8]);
      ctx.strokeStyle = rgb(color, 0.35);
      ctx.beginPath(); ctx.arc(cx, cy, R + maxLen + 22, t * 0.1, t * 0.1 + Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // radial bars
      const rot = -Math.PI / 2 + t * 0.05;
      for (let i = 0; i < N; i++) {
        const a = rot + (i / N) * Math.PI * 2;
        const len = 3 + cur[i] * maxLen;
        const x0 = cx + Math.cos(a) * R, y0 = cy + Math.sin(a) * R;
        const x1 = cx + Math.cos(a) * (R + len), y1 = cy + Math.sin(a) * (R + len);
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, rgb(color, 0.25));
        g.addColorStop(1, rgb(mix(color, [255, 255, 255], 0.45), 0.95));
        ctx.strokeStyle = g;
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }

      // glowing contour through the bar tips
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const k = i % N;
        const a = rot + (k / N) * Math.PI * 2;
        const r = R + 3 + cur[k] * maxLen + 7;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgb(mix(color, [255, 255, 255], 0.3), 0.8);
      ctx.lineWidth = 1.5;
      ctx.shadowColor = rgb(color, 1);
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // orbiting sparks
      for (let k = 0; k < 3; k++) {
        const a = t * (0.35 + k * 0.12) + k * 2.1;
        const r = R + maxLen + 22;
        ctx.fillStyle = k === 1 ? 'rgba(255,255,255,0.8)' : rgb(color, 1);
        ctx.shadowColor = rgb(color, 1);
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, k === 1 ? 1.8 : 2.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (still) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  const v = VOICES[idx];
  const c = rgb(v.color);

  return (
    <div className="relative w-full max-w-[560px] mx-auto">
      <div className="relative aspect-square">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
        {/* centre disc */}
        <div className="absolute inset-[27%] rounded-full grid place-items-center text-center border border-white/10 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.08),rgba(10,11,14,0.92)_65%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur">
          <div key={v.id} className="animate-fadeIn px-3">
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/40">Singing as</div>
            <div className="mt-1.5 text-3xl sm:text-4xl font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: c }}>{v.initials}</div>
            <div className="mt-2 text-sm font-semibold text-white">{v.name}</div>
            <div className="text-[11px] text-white/45">{v.tag}</div>
          </div>
        </div>
      </div>

    </div>
  );
}
