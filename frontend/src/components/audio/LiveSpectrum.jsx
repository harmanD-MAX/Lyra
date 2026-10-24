import React, { useEffect, useRef } from 'react';
import { createAnalyser } from './spectrum';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (hz) => {
  const m = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
};

/**
 * Live visualizer for the studio player. Bars rise and fall with the real
 * frequency content of the decoded track at the playhead, and a glowing line
 * traces their tops. While paused (or still decoding) it breathes quietly.
 *
 * `levelRef` (optional) receives the current loudness 0..1 every frame so
 * other visuals (the 3D orb) can pulse with the music.
 */
export default function LiveSpectrum({ track, getTime, playing, levelRef, className = '' }) {
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
    let cur = [], caps = [], raf, last = 0, note = '', noteAlpha = 0;

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const n = Math.max(24, Math.min(96, Math.floor(w / 10)));
      if (cur.length !== n) { cur = new Array(n).fill(0.03); caps = new Array(n).fill(0.03); }

      const live = playingRef.current && analyse;
      let target;
      if (live) {
        const res = analyse(getTimeRef.current(), n);
        target = res.bands;
        if (levelRef) levelRef.current = res.level;
        if (res.level > 0.04 && res.pitchHz > 0) { note = noteName(res.pitchHz); noteAlpha = 1; }
      } else {
        const t = now / 1000;
        target = cur.map((_, i) => 0.035 + 0.025 * (0.5 + 0.5 * Math.sin(t * 1.6 + i * 0.35)));
        if (levelRef) levelRef.current *= 0.9;
      }
      noteAlpha *= 0.985;

      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      for (let i = 0; i < n; i++) {
        const tv = target[i] ?? 0;
        cur[i] = tv > cur[i] ? cur[i] + (tv - cur[i]) * Math.min(1, dt * 28) : cur[i] + (tv - cur[i]) * Math.min(1, dt * 7);
        caps[i] = Math.max(cur[i], caps[i] - dt * 0.35);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const mid = h * 0.62;
      const top = mid - 8;
      const bw = w / n;
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#e5a958');
      grad.addColorStop(0.55, '#f6c98a');
      grad.addColorStop(1, '#3fe0c5');

      // baseline
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, mid, w, 1);

      // bars + reflection
      for (let i = 0; i < n; i++) {
        const v = cur[i];
        const bh = Math.max(2, v * top);
        const x = i * bw + bw * 0.2;
        const bwInner = bw * 0.6;
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, v * 1.4);
        ctx.beginPath();
        ctx.roundRect(x, mid - bh, bwInner, bh, Math.min(bwInner / 2, 3));
        ctx.fill();
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.roundRect(x, mid + 3, bwInner, bh * 0.45, Math.min(bwInner / 2, 3));
        ctx.fill();
        // falling peak caps
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, mid - Math.max(2, caps[i] * top) - 4, bwInner, 1.5);
      }
      ctx.globalAlpha = 1;

      // glowing contour through the bar tops
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = i * bw + bw / 2;
        const y = mid - Math.max(2, cur[i] * top) - 10;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const px = (i - 1) * bw + bw / 2;
          const py = mid - Math.max(2, cur[i - 1] * top) - 10;
          ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        }
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(246,201,138,0.9)';
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // detected note
      if (noteAlpha > 0.05 && note) {
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = `rgba(63,224,197,${noteAlpha})`;
        ctx.fillText(note, w - 6, 16);
      }
      if (still) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [track, levelRef]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
