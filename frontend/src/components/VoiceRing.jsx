import React, { useEffect, useRef } from 'react';

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * Radial "singing" ring shared by the landing hero and the studio player.
 *
 * `getBands(t, n)` is called every frame and returns n levels (0..1) for the
 * bars around the ring — synthetic on the landing page, the real spectrum of
 * the playing track in the studio. `color` ([r, g, b]) is eased towards, so
 * switching voices morphs the ring. `children` render in the centre disc,
 * which is a size container: use cqw units so text scales with the ring.
 */
export default function VoiceRing({ color = [229, 169, 88], getBands, className = '', children }) {
  const canvasRef = useRef(null);
  const colorRef = useRef(color);
  const getBandsRef = useRef(getBands);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { getBandsRef.current = getBands; }, [getBands]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const N = 132;
    const cur = new Array(N).fill(0.1);
    let col = colorRef.current.slice();
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
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      col = mix(col, colorRef.current, 0.04);
      const cx = w / 2, cy = h / 2;
      const R = Math.min(w, h) * 0.25;
      const maxLen = Math.min(w, h) * 0.13;

      const target = getBandsRef.current ? getBandsRef.current(t, N) : null;
      for (let i = 0; i < N; i++) {
        const v = target ? Math.min(1.1, target[i] ?? 0) : 0.08;
        cur[i] += (v - cur[i]) * (v > cur[i] ? 0.35 : 0.12);
      }

      // soft core glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.9);
      glow.addColorStop(0, rgb(col, 0.22));
      glow.addColorStop(1, rgb(col, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // guide rings
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.arc(cx, cy, R - 10, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([2, 8]);
      ctx.strokeStyle = rgb(col, 0.35);
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
        g.addColorStop(0, rgb(col, 0.25));
        g.addColorStop(1, rgb(mix(col, [255, 255, 255], 0.45), 0.95));
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
      ctx.strokeStyle = rgb(mix(col, [255, 255, 255], 0.3), 0.8);
      ctx.lineWidth = 1.5;
      ctx.shadowColor = rgb(col, 1);
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // orbiting sparks
      for (let k = 0; k < 3; k++) {
        const a = t * (0.35 + k * 0.12) + k * 2.1;
        const r = R + maxLen + 22;
        ctx.fillStyle = k === 1 ? 'rgba(255,255,255,0.8)' : rgb(col, 1);
        ctx.shadowColor = rgb(col, 1);
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, k === 1 ? 1.8 : 2.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
      if (still) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, []);

  return (
    <div className={`relative aspect-square ${className}`}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />
      <div className="absolute inset-[27%] rounded-full grid place-items-center text-center border border-white/10 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.08),rgba(10,11,14,0.92)_65%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur overflow-hidden @container">
        {children}
      </div>
    </div>
  );
}
