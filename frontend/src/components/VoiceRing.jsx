import React, { useEffect, useRef } from 'react';

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/**
 * Radial "singing" ring shared by the landing hero and the studio player.
 *
 * `getBands(t, n)` is called every frame and returns n levels (0..1) for the
 * bars around the ring — synthetic on the landing page, the real spectrum of
 * the playing track in the studio. `color` ([r, g, b]) is eased towards, so
 * switching voices morphs the ring. `children` render in the centre disc.
 * `variant` picks the look: 'ring' (radial bars), 'waves' (layered contours),
 * 'bloom' (petals) or 'particles' (orbiting dust).
 */
export default function VoiceRing({ color = [229, 169, 88], getBands, variant = 'ring', className = '', children }) {
  const canvasRef = useRef(null);
  const colorRef = useRef(color);
  const getBandsRef = useRef(getBands);
  const variantRef = useRef(variant);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { getBandsRef.current = getBands; }, [getBands]);
  useEffect(() => { variantRef.current = variant; }, [variant]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const N = 132;
    const cur = new Array(N).fill(0.1);
    let col = colorRef.current.slice();
    // particles: fixed seeds so each dot keeps its lane around the ring
    const dust = Array.from({ length: 90 }, (_, i) => ({ k: (i * 37) % N, off: (i * 0.618) % 1, sp: 0.15 + ((i * 13) % 7) / 20 }));
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

      const rot = -Math.PI / 2 + t * 0.05;
      const style = variantRef.current;
      const tip = mix(col, [255, 255, 255], 0.45);
      const at = (k, r, spin = rot) => {
        const a = spin + (k / N) * Math.PI * 2;
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      };
      const contour = (radiusOf, spin) => {
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
          const [x, y] = at(i % N, radiusOf(i % N), spin);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      };

      if (style === 'waves') {
        // three breathing contours, each riding the spectrum at its own phase
        for (let L = 2; L >= 0; L--) {
          const phase = t * (0.6 + L * 0.25);
          contour((k) => R + 4 + L * maxLen * 0.32 + cur[(k + L * 11) % N] * maxLen * (1 - L * 0.22) + Math.sin(k * 0.19 + phase) * 3, rot - L * 0.12);
          ctx.fillStyle = rgb(col, 0.05 + (2 - L) * 0.04);
          ctx.fill();
          ctx.strokeStyle = rgb(L === 0 ? tip : col, 0.85 - L * 0.22);
          ctx.lineWidth = L === 0 ? 2 : 1.2;
          ctx.shadowColor = rgb(col, 1);
          ctx.shadowBlur = L === 0 ? 14 : 6;
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      } else if (style === 'bloom') {
        // petals: each band grows a curved leaf, two counter-rotating layers
        const P = 22;
        for (let layer = 0; layer < 2; layer++) {
          const spin = rot + (layer ? -t * 0.12 : t * 0.08) + (layer ? Math.PI / P : 0);
          for (let p = 0; p < P; p++) {
            const k = Math.floor((p / P) * N);
            const v = (cur[k] + cur[(k + 3) % N]) / 2;
            const len = maxLen * (0.55 + v * (layer ? 0.9 : 1.25));
            const a = spin + (p / P) * Math.PI * 2;
            const half = (Math.PI / P) * (layer ? 0.55 : 0.8);
            const r0 = R + 2;
            const x0 = cx + Math.cos(a - half) * r0, y0 = cy + Math.sin(a - half) * r0;
            const x2 = cx + Math.cos(a + half) * r0, y2 = cy + Math.sin(a + half) * r0;
            const xt = cx + Math.cos(a) * (r0 + len), yt = cy + Math.sin(a) * (r0 + len);
            const g = ctx.createLinearGradient(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, xt, yt);
            g.addColorStop(0, rgb(col, layer ? 0.12 : 0.22));
            g.addColorStop(1, rgb(tip, layer ? 0.55 : 0.85));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.quadraticCurveTo(cx + Math.cos(a - half * 1.6) * (r0 + len * 0.7), cy + Math.sin(a - half * 1.6) * (r0 + len * 0.7), xt, yt);
            ctx.quadraticCurveTo(cx + Math.cos(a + half * 1.6) * (r0 + len * 0.7), cy + Math.sin(a + half * 1.6) * (r0 + len * 0.7), x2, y2);
            ctx.closePath();
            ctx.fill();
          }
        }
      } else if (style === 'particles') {
        // dust drifting outward along each lane, pushed further by louder bands
        ctx.shadowColor = rgb(col, 1);
        for (const d of dust) {
          const v = cur[d.k];
          const life = (d.off + t * d.sp * (0.6 + v)) % 1;
          const r = R + 4 + life * (maxLen * (0.6 + v * 1.4) + 16);
          const [x, y] = at(d.k, r, rot + life * 0.4);
          const alpha = (1 - life) * (0.35 + v * 0.65);
          ctx.fillStyle = rgb(life < 0.3 ? tip : col, alpha);
          ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.arc(x, y, 1 + v * 2.4 * (1 - life), 0, Math.PI * 2); ctx.fill();
        }
        ctx.shadowBlur = 0;
        contour((k) => R + 2 + cur[k] * maxLen * 0.35, rot);
        ctx.strokeStyle = rgb(col, 0.6);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        // radial bars
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
      }

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
      <div className="@container absolute inset-[27%] rounded-full grid place-items-center text-center border border-white/10 bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.08),rgba(10,11,14,0.92)_65%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur overflow-hidden">
        {children}
      </div>
    </div>
  );
}
