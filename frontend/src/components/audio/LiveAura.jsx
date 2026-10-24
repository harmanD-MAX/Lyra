import React, { useEffect, useRef } from 'react';
import { createAnalyser } from './spectrum';

// bass, mids, highs — each drives one translucent layer
const LAYERS = [
  { from: 0.0, to: 0.3, color: [229, 169, 88], gain: 1.0, spin: 0.06, lobes: 3 },
  { from: 0.25, to: 0.65, color: [244, 140, 120], gain: 0.85, spin: -0.09, lobes: 5 },
  { from: 0.55, to: 1.0, color: [63, 224, 197], gain: 0.75, spin: 0.13, lobes: 7 },
];

const avg = (arr, a, b) => {
  const i0 = Math.floor(a * arr.length), i1 = Math.max(i0 + 1, Math.floor(b * arr.length));
  let s = 0;
  for (let i = i0; i < i1; i++) s += arr[i];
  return s / (i1 - i0);
};

/**
 * Liquid aura for the studio player. Three soft, glowing shapes swell and
 * morph with the real bass / mid / high energy of the track at the playhead.
 * The shape around each layer is taken from that band's spectrum, so it
 * changes with what is actually being sung. Paused, it breathes slowly.
 */
export default function LiveAura({ track, getTime, playing, levelRef, className = '' }) {
  const canvasRef = useRef(null);
  const playingRef = useRef(playing);
  const getTimeRef = useRef(getTime);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { getTimeRef.current = getTime; }, [getTime]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const analyse = track ? createAnalyser(track) : null;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const BANDS = 48, PTS = 96;
    const bands = new Array(BANDS).fill(0);
    const energy = LAYERS.map(() => 0);
    let level = 0, raf;

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w < 40 || h < 40) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      const t = now / 1000;

      if (playingRef.current && analyse) {
        const res = analyse(getTimeRef.current(), BANDS);
        for (let i = 0; i < BANDS; i++) bands[i] += (res.bands[i] - bands[i]) * (res.bands[i] > bands[i] ? 0.5 : 0.15);
        level += (res.level - level) * 0.3;
      } else {
        for (let i = 0; i < BANDS; i++) bands[i] += (0.18 + 0.06 * Math.sin(t * 1.2 + i * 0.4) - bands[i]) * 0.05;
        level *= 0.94;
      }
      if (levelRef) levelRef.current = playingRef.current ? level : 0;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      const base = Math.min(w, h) * 0.24;
      const room = Math.min(w, h) * 0.2;

      ctx.globalCompositeOperation = 'lighter';
      LAYERS.forEach((L, li) => {
        const e = avg(bands, L.from, L.to);
        energy[li] += (e - energy[li]) * 0.25;
        const amp = room * L.gain * (0.25 + energy[li] * 1.1);
        const rot = t * L.spin;
        const pts = [];
        for (let k = 0; k < PTS; k++) {
          const a = (k / PTS) * Math.PI * 2;
          // map angle onto this layer's slice of the spectrum, mirrored so the shape is closed and smooth
          const u = Math.abs(((k / PTS) * 2) % 2 - 1);
          const bi = Math.min(BANDS - 1, Math.floor((L.from + (L.to - L.from) * u) * BANDS));
          const wob = 0.5 + 0.5 * Math.sin(a * L.lobes + t * (0.8 + li * 0.3));
          const r = base * (0.92 + li * 0.07) + amp * (0.35 * wob + 0.65 * bands[bi]);
          pts.push([cx + Math.cos(a + rot) * r, cy + Math.sin(a + rot) * r]);
        }
        ctx.beginPath();
        for (let k = 0; k <= PTS; k++) {
          const p = pts[k % PTS], q = pts[(k + 1) % PTS];
          const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
          if (k === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(p[0], p[1], mx, my);
        }
        ctx.closePath();
        const [r, g, b] = L.color;
        const grad = ctx.createRadialGradient(cx, cy, base * 0.4, cx, cy, base + amp * 1.1);
        grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.55, `rgba(${r},${g},${b},${0.1 + energy[li] * 0.18})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},${0.32 + energy[li] * 0.35})`);
        ctx.fillStyle = grad;
        ctx.shadowColor = `rgba(${r},${g},${b},0.9)`;
        ctx.shadowBlur = 24 + energy[li] * 30;
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';

      // soft halo that breathes with loudness
      const halo = ctx.createRadialGradient(cx, cy, base * 0.6, cx, cy, base + room * 1.6);
      halo.addColorStop(0, `rgba(246,201,138,${0.05 + level * 0.12})`);
      halo.addColorStop(1, 'rgba(246,201,138,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      if (still) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [track, levelRef]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
