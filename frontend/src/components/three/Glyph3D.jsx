import React, { useEffect, useRef } from 'react';
import useInView, { prefersReducedMotion } from './useInView';

/**
 * Lightweight 3D point/line sculptures drawn on a 2D canvas with a manual
 * perspective projection (no WebGL context per card). Each `kind` illustrates
 * one idea: separating, cleaning, tuning, rendering, exporting, or a voice.
 */

const hexToRgb = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function project(x, y, z, rotY, rotX, w, h, zoom) {
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const y1 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  const d = 4.2;
  const s = (zoom * Math.min(w, h)) / (d + z2);
  return [w / 2 + x1 * s, h / 2 + y1 * s, z2];
}

const BUILDERS = {
  // a double helix that unzips into two strands (vocals / instrumental)
  separate: (t, ctx, P, A, B) => {
    const split = 0.5 + 0.5 * Math.sin(t * 0.8);
    for (let i = 0; i < 90; i++) {
      const u = i / 89;
      const y = (u - 0.5) * 2.6;
      const a = u * Math.PI * 4 + t;
      for (const [sign, col] of [[1, A], [-1, B]]) {
        const off = sign * split * 0.55;
        const [px, py, z] = P(Math.cos(a) * 0.55 * sign + off, y, Math.sin(a) * 0.55);
        dot(ctx, px, py, z, col, 2.2);
      }
    }
  },
  // concentric echo rings collapsing into one clean ring (de-reverb)
  clean: (t, ctx, P, A, B) => {
    for (let r = 0; r < 6; r++) {
      const phase = (t * 0.5 + r / 6) % 1;
      const rad = 0.4 + phase * 1.3;
      const alpha = r === 0 ? 1 : 1 - phase;
      ring(ctx, P, rad, r === 0 ? A : B, alpha * (r === 0 ? 1 : 0.6), 72);
    }
  },
  // note lanes in depth with points snapping onto them
  melody: (t, ctx, P, A, B) => {
    for (let lane = 0; lane < 5; lane++) {
      const y = (lane - 2) * 0.45;
      line(ctx, P(-1.6, y, 0), P(1.6, y, 0), 'rgba(255,255,255,0.12)');
    }
    for (let i = 0; i < 28; i++) {
      const x = -1.5 + (i / 27) * 3;
      const target = (Math.round(Math.sin(i * 1.7) * 2) * 0.45);
      const snap = 0.5 + 0.5 * Math.sin(t * 1.2 - i * 0.15);
      const y = target + (1 - snap) * Math.sin(i * 7.3 + t * 3) * 0.3;
      const [px, py, z] = P(x, y, Math.sin(i * 0.4 + t) * 0.3);
      dot(ctx, px, py, z, snap > 0.8 ? B : A, 3);
    }
  },
  // pulsing point sphere (the voice being synthesized)
  render: (t, ctx, P, A, B) => {
    const n = 220;
    for (let i = 0; i < n; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / n);
      const th = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 1.05 + 0.12 * Math.sin(t * 3 + phi * 6);
      const [px, py, z] = P(r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
      dot(ctx, px, py, z, i % 3 ? A : B, 2.2);
    }
  },
  // stems as stacked planes fanning out
  export: (t, ctx, P, A, B) => {
    const spread = 0.35 + 0.25 * Math.sin(t * 0.9);
    for (let k = 0; k < 4; k++) {
      const y = (k - 1.5) * spread;
      const col = k % 2 ? B : A;
      const corners = [[-1.1, y, -0.8], [1.1, y, -0.8], [1.1, y, 0.8], [-1.1, y, 0.8]].map((c) => P(...c));
      ctx.beginPath();
      corners.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
      ctx.closePath();
      ctx.fillStyle = `rgba(${col.join(',')},0.08)`;
      ctx.strokeStyle = `rgba(${col.join(',')},0.7)`;
      ctx.fill();
      ctx.stroke();
      for (let i = 0; i < 24; i++) {
        const x = -1 + (i / 23) * 2;
        const a = Math.abs(Math.sin(i * 0.9 + t * 2 + k)) * 0.25;
        line(ctx, P(x, y, 0), P(x, y - a, 0), `rgba(${col.join(',')},0.8)`);
      }
    }
  },
  // a voice "signature": spectral ridges with a vibrato wave travelling through
  voice: (t, ctx, P, A, B, opts) => {
    const rate = opts.rate || 5.5;
    for (let row = 0; row < 14; row++) {
      const z = -1.2 + row * 0.18;
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const x = -1.6 + (i / 60) * 3.2;
        const env = Math.exp(-((x * 1.1) ** 2));
        const y = -env * (0.5 + 0.35 * Math.sin(t * rate * 0.35 + row * 0.6 + x * 2)) + 0.6;
        const [px, py] = P(x, y, z);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      const mix = row / 13;
      const c = A.map((v, k) => Math.round(v * (1 - mix) + B[k] * mix));
      ctx.strokeStyle = `rgba(${c.join(',')},${0.25 + 0.6 * (1 - mix)})`;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  },
};

function dot(ctx, x, y, z, col, size) {
  const s = Math.max(0.6, size * (1.6 - z * 0.35));
  const a = Math.max(0.15, Math.min(1, 0.9 - z * 0.25));
  ctx.fillStyle = `rgba(${col.join(',')},${a})`;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx, [x1, y1], [x2, y2], style) {
  ctx.strokeStyle = style;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function ring(ctx, P, rad, col, alpha, seg) {
  ctx.beginPath();
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const [x, y] = P(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.strokeStyle = `rgba(${col.join(',')},${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export default function Glyph3D({ kind, colorA = '#e5a958', colorB = '#3fe0c5', rate, className = '', tilt = 0.45, zoom = 0.9 }) {
  const [wrapRef, inView] = useInView('100px');
  const canvasRef = useRef(null);
  const inViewRef = useRef(inView);
  const hover = useRef({ x: 0, y: 0 });
  useEffect(() => { inViewRef.current = inView; }, [inView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const A = hexToRgb(colorA);
    const B = hexToRgb(colorB);
    const build = BUILDERS[kind] || BUILDERS.render;
    let raf;
    const still = prefersReducedMotion();
    const start = performance.now();
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!inViewRef.current && !still) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = still ? 1.2 : (performance.now() - start) / 1000;
      const rotY = t * 0.35 + hover.current.x * 0.8;
      const rotX = tilt + hover.current.y * 0.4;
      const P = (x, y, z) => project(x, y, z, rotY, rotX, w, h, zoom);
      ctx.globalCompositeOperation = 'lighter';
      build(t, ctx, P, A, B, { rate });
      ctx.globalCompositeOperation = 'source-over';
      if (still) cancelAnimationFrame(raf);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [kind, colorA, colorB, rate, tilt, zoom]);

  return (
    <div
      ref={wrapRef}
      className={className}
      aria-hidden="true"
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        hover.current = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
      }}
      onPointerLeave={() => { hover.current = { x: 0, y: 0 }; }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
