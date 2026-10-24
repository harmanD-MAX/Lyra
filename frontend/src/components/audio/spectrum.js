/* ---------------------------------------------------------------------------
 * Audio analysis helpers for the studio visualizer.
 *
 * We decode the track that is playing and analyse its samples at the current
 * playhead, instead of routing the <audio> elements through Web Audio. That
 * keeps the multi-stem playback (mute / volume switching) exactly as it is.
 * ------------------------------------------------------------------------- */

let sharedCtx = null;
const getCtx = () => {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sharedCtx;
};

// Keep at most two decoded tracks in memory (a 4-minute song is ~40 MB mono).
const cache = new Map();
const CACHE_MAX = 2;

/** Fetch + decode `url` into mono samples and a coarse peak envelope. */
export async function decodeTrack(url, bins = 180) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const audio = await getCtx().decodeAudioData(await res.arrayBuffer());
  const n = audio.length;
  const samples = new Float32Array(n);
  for (let c = 0; c < audio.numberOfChannels; c++) {
    const ch = audio.getChannelData(c);
    for (let i = 0; i < n; i++) samples[i] += ch[i] / audio.numberOfChannels;
  }
  const peaks = new Array(bins);
  const step = Math.max(1, Math.floor(n / bins));
  let max = 1e-6;
  for (let b = 0; b < bins; b++) {
    let sum = 0;
    const start = b * step;
    const end = Math.min(n, start + step);
    for (let i = start; i < end; i += 4) sum += samples[i] * samples[i];
    peaks[b] = Math.sqrt(sum / Math.max(1, (end - start) / 4));
    max = Math.max(max, peaks[b]);
  }
  const track = { samples, sampleRate: audio.sampleRate, duration: audio.duration, peaks: peaks.map((p) => p / max) };
  cache.set(url, track);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return track;
}

/** In-place radix-2 FFT (re, im have length 2^k). */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/**
 * Analyser for one decoded track: `analyse(time, bands)` returns band levels
 * (0..1, log-spaced 70 Hz – 9 kHz), the overall level and the dominant pitch.
 */
export function createAnalyser(track, size = 2048) {
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const { samples, sampleRate } = track;
  const binHz = sampleRate / size;

  return function analyse(time, bands) {
    const start = Math.floor(time * sampleRate) - size / 2;
    let sum = 0;
    for (let i = 0; i < size; i++) {
      const s = samples[start + i] || 0;
      sum += s * s;
      re[i] = s * win[i];
      im[i] = 0;
    }
    fft(re, im);
    const out = new Array(bands);
    const lo = Math.log(70), hi = Math.log(9000);
    for (let b = 0; b < bands; b++) {
      const f0 = Math.exp(lo + ((hi - lo) * b) / bands);
      const f1 = Math.exp(lo + ((hi - lo) * (b + 1)) / bands);
      const k0 = Math.max(1, Math.floor(f0 / binHz));
      const k1 = Math.max(k0 + 1, Math.ceil(f1 / binHz));
      let m = 0;
      for (let k = k0; k < k1 && k < size / 2; k++) m = Math.max(m, Math.hypot(re[k], im[k]));
      const db = 20 * Math.log10(m / (size / 4) + 1e-9);
      // gentle tilt so the highs aren't buried under the bass
      out[b] = Math.max(0, Math.min(1, (db + 72 + (b / bands) * 14) / 64));
    }
    // dominant voiced pitch (80 Hz – 1 kHz)
    let best = 0, bestK = 0;
    for (let k = Math.floor(80 / binHz); k < 1000 / binHz; k++) {
      const m = Math.hypot(re[k], im[k]);
      if (m > best) { best = m; bestK = k; }
    }
    return { bands: out, level: Math.min(1, Math.sqrt(sum / size) * 3.2), pitchHz: bestK * binHz };
  };
}
