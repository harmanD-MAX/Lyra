import React, { useEffect, useState } from 'react';
import VoiceRing from '../VoiceRing';

const VOICES = [
  { id: 'arijit_singh', name: 'Arijit Singh', initials: 'AS', color: [229, 169, 88], tag: 'Soulful · warm' },
  { id: 'sonu_nigam', name: 'Sonu Nigam', initials: 'SN', color: [63, 224, 197], tag: 'Classical · bright' },
  { id: 'kk', name: 'KK', initials: 'KK', color: [244, 114, 182], tag: 'Rock · power' },
  { id: 'raw', name: 'Your voice', initials: 'You', color: [167, 139, 250], tag: 'In tune · yours' },
];

const gauss = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));

/** A sung phrase: syllables, slowly drifting formants, vibrato shimmer. */
function singing(t, n) {
  const syll = Math.pow(Math.abs(Math.sin(t * 2.2)), 0.55) * (0.65 + 0.35 * Math.sin(t * 0.63));
  const f1 = 0.18 + 0.06 * Math.sin(t * 0.9);
  const f2 = 0.45 + 0.1 * Math.sin(t * 0.57 + 1);
  const f3 = 0.72 + 0.06 * Math.sin(t * 1.3 + 2);
  const vib = 0.5 + 0.5 * Math.sin(t * 34);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.abs((i / n) * 2 - 1); // mirror left / right
    const harm = 0.55 + 0.45 * Math.cos(u * 46 - t * 2.4);
    const v = (gauss(u, f1, 0.07) + 0.75 * gauss(u, f2, 0.06) + 0.5 * gauss(u, f3, 0.05)) * harm;
    out[i] = 0.08 + v * (0.25 + 0.75 * syll) + 0.05 * vib * gauss(u, f1, 0.1);
  }
  return out;
}

/** Landing hero: the voice ring cycling through the voices on its own. */
export default function HeroVoiceRing() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % VOICES.length), 3800);
    return () => clearInterval(id);
  }, []);
  const v = VOICES[idx];

  return (
    <div className="relative w-full max-w-[560px] mx-auto">
      <VoiceRing color={v.color} getBands={singing}>
        <div key={v.id} className="animate-fadeIn w-full px-[8cqw]">
          <div className="text-[5.5cqw] font-mono uppercase tracking-[0.2em] text-white/40">Singing as</div>
          <div className="mt-[3cqw] text-[18cqw] font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: `rgb(${v.color.join(',')})` }}>{v.initials}</div>
          <div className="mt-[4cqw] text-[7.5cqw] font-semibold text-white truncate">{v.name}</div>
          <div className="text-[5.5cqw] text-white/45 truncate">{v.tag}</div>
        </div>
      </VoiceRing>
    </div>
  );
}
