import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Upload, Link as LinkIcon, Play, Pause, Scissors, Trash2, Undo2, Redo2, ZoomIn, ZoomOut,
  Music, Film, Type, Crop, Palette, Download, Share2, Wand2, Volume2, VolumeX, Plus, Clapperboard,
  Copy, Check, SkipBack, Magnet, AlertCircle, Loader2, FileAudio,
} from 'lucide-react';

/*
 * Reel Studio: put the converted song on a video (an Instagram post / reel link
 * or an uploaded clip) and export a finished reel.
 *
 * The project is a small edit list (see backend/reel_studio.py):
 *   clips  ordered {in, out} pieces of the source video, played back to back
 *   songs  {track, in, out, at, volume, fade_in, fade_out} song pieces placed on the reel timeline
 *   video  original-sound volume (0 = muted) and fades from / to black
 *   canvas aspect, fit (fill / fit / blur), zoom, pan
 *   adjust brightness, contrast, saturation
 *   texts  {text, start, end, x, y, size, color, box}
 * The preview plays the same edit list (song audio through Web Audio, so pieces,
 * fades and overlaps are sample-accurate) and the server renders it with ffmpeg.
 */

const GOLD = '#e5a958';
const TEAL = '#3fe0c5';

const TRACKS = [
  { id: 'master', label: 'Full song', hint: 'Master mix' },
  { id: 'clean', label: 'Clean mix', hint: 'No reverb or 3D' },
  { id: 'vocal', label: 'Vocal only', hint: 'Converted voice' },
  { id: 'instrumental', label: 'Music only', hint: 'Instrumental' },
];
const TRACK_AUDIO = {
  master: (j) => `/api/audio/${j}/master_mp3`,
  clean: (j) => `/api/audio/${j}/master_clean_mp3`,
  vocal: (j) => `/api/audio/${j}/vocal_converted`,
  instrumental: (j) => `/api/audio/${j}/instrumental`,
};
const ASPECTS = [
  { id: '9:16', label: 'Reel', sub: '9:16', r: 9 / 16 },
  { id: '4:5', label: 'Post', sub: '4:5', r: 4 / 5 },
  { id: '1:1', label: 'Square', sub: '1:1', r: 1 },
  { id: '16:9', label: 'Wide', sub: '16:9', r: 16 / 9 },
  { id: 'source', label: 'Original', sub: 'as shot', r: null },
];
const FITS = [
  { id: 'fill', label: 'Fill', hint: 'Crop to fill the frame' },
  { id: 'blur', label: 'Blur', hint: 'Whole video on a blurred copy' },
  { id: 'fit', label: 'Fit', hint: 'Whole video with black bars' },
];
const LOOKS = [
  { id: 'natural', label: 'Natural', a: { brightness: 0, contrast: 1, saturation: 1 } },
  { id: 'vivid', label: 'Vivid', a: { brightness: 0.02, contrast: 1.1, saturation: 1.35 } },
  { id: 'bright', label: 'Bright', a: { brightness: 0.07, contrast: 1.03, saturation: 1.1 } },
  { id: 'moody', label: 'Moody', a: { brightness: -0.05, contrast: 1.18, saturation: 0.8 } },
  { id: 'mono', label: 'B & W', a: { brightness: 0, contrast: 1.12, saturation: 0 } },
];
const TEXT_COLORS = ['#ffffff', '#e5a958', '#3fe0c5', '#f472b6', '#facc15', '#000000'];
const TABS = [
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'frame', label: 'Frame', icon: Crop },
  { id: 'color', label: 'Color', icon: Palette },
  { id: 'text', label: 'Text', icon: Type },
];
const LANE_H = { video: 56, song: 52, text: 30 };
const MIN_CLIP = 0.1;

const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (t) => {
  if (!Number.isFinite(t)) return '0:00.0';
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

const reelLength = (clips) => clips.reduce((s, c) => s + (c.out - c.in), 0);
const clipStarts = (clips) => {
  const out = [];
  let acc = 0;
  for (const c of clips) { out.push(acc); acc += c.out - c.in; }
  return out;
};
/** Reel time -> {index, source time} of the video clip playing then. */
function locate(T, clips, starts) {
  for (let i = clips.length - 1; i >= 0; i--) {
    if (T >= starts[i] - 1e-6) {
      const c = clips[i];
      return { index: i, src: clamp(c.in + (T - starts[i]), c.in, c.out) };
    }
  }
  return { index: 0, src: clips[0]?.in || 0 };
}

/** Start of the loudest `len`-second window of a song (its hook / chorus, usually). */
function loudestStart(peaks, perSecond, len) {
  if (!peaks?.length) return 0;
  const w = Math.max(1, Math.round(len * perSecond));
  if (w >= peaks.length) return 0;
  let sum = 0;
  for (let i = 0; i < w; i++) sum += peaks[i] * peaks[i];
  let best = sum;
  let bestI = 0;
  for (let i = w; i < peaks.length; i++) {
    sum += peaks[i] * peaks[i] - peaks[i - w] * peaks[i - w];
    if (sum > best) { best = sum; bestI = i - w + 1; }
  }
  return Math.round((bestI / perSecond) * 10) / 10;
}

function defaultProject(duration, song) {
  const sd = song?.duration || 0;
  const len = Math.min(duration, sd || duration);
  const start = song ? loudestStart(song.peaks, song.per_second, len) : 0;
  return {
    clips: [{ id: uid(), in: 0, out: duration }],
    songs: sd ? [{ id: uid(), track: 'master', in: start, out: Math.min(sd, start + len), at: 0, volume: 1, fade_in: 0.3, fade_out: Math.min(1.2, len / 4) }] : [],
    video: { volume: 0, fade_in: 0, fade_out: 0 },
    canvas: { aspect: '9:16', fit: 'fill', zoom: 1, pan_x: 0, pan_y: 0 },
    adjust: { brightness: 0, contrast: 1, saturation: 1 },
    texts: [],
    export: { resolution: 1080, quality: 'high' },
  };
}

function Slider({ label, value, min, max, step, onChange, onStart, display, color = GOLD }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <label className="block">
      <div className="flex justify-between text-[11px] mb-1.5">
        <span className="text-white/65">{label}</span>
        <span className="font-mono" style={{ color }}>{display ? display(value) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onPointerDown={onStart} onKeyDown={onStart}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="lyra-range w-full cursor-pointer"
        style={{ background: `linear-gradient(90deg, ${color} ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
      />
    </label>
  );
}

function Seg({ options, value, onChange, small }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id} type="button" title={o.hint}
          onClick={() => onChange(o.id)}
          className={`rounded-lg border px-2.5 ${small ? 'py-1 text-[11px]' : 'py-1.5 text-xs'} transition-colors ${value === o.id
            ? 'border-[#e5a958]/60 bg-[#e5a958]/15 text-[#ffd9a1]'
            : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.07]'}`}
        >
          {o.label}{o.sub && <span className="ml-1 text-white/40">{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** Waveform of song[in..out], drawn into the piece. */
const Waveform = React.memo(function Waveform({ peaks, perSecond, from, to, width, height, color }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks?.length || width < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.min(Math.round(width), 8000);
    c.width = w * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    ctx.fillStyle = color;
    const a = from * perSecond;
    const span = Math.max(1e-3, (to - from) * perSecond);
    const mid = height / 2;
    for (let x = 0; x < w; x += 2) {
      const i0 = Math.floor(a + (x / w) * span);
      const i1 = Math.max(i0 + 1, Math.floor(a + ((x + 2) / w) * span));
      let m = 0;
      for (let i = i0; i < i1 && i < peaks.length; i++) m = Math.max(m, peaks[i] || 0);
      const h = Math.max(1, m * (height - 6));
      ctx.fillRect(x, mid - h / 2, 1.4, h);
    }
  }, [peaks, perSecond, from, to, width, height, color]);
  return <canvas ref={ref} style={{ width: Math.min(width, 8000), height }} className="pointer-events-none block" />;
});

export default function ReelStudio({ open, onClose, job }) {
  const jobId = job?.id;
  const results = job?.results || {};
  const songTitle = results.title || job?.metadata?.title || 'My song';

  // ---- reel (source video) ----
  const [stage, setStage] = useState('source'); // source | importing | edit
  const [reel, setReel] = useState(null);
  const [linkInput, setLinkInput] = useState('');
  const [importError, setImportError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // ---- song tracks ----
  const [songs, setSongs] = useState({}); // track -> {duration, per_second, peaks} | {missing:true}
  const buffersRef = useRef({}); // track -> AudioBuffer
  const [buffersReady, setBuffersReady] = useState({});

  // ---- project + history ----
  const [project, setProjectState] = useState(null);
  const projectRef = useRef(null);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const [, setHistoryTick] = useState(0);
  const setProject = useCallback((updater) => {
    setProjectState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      projectRef.current = next;
      return next;
    });
  }, []);
  const checkpoint = useCallback(() => {
    if (!projectRef.current) return;
    pastRef.current = [...pastRef.current.slice(-79), projectRef.current];
    futureRef.current = [];
    setHistoryTick((n) => n + 1);
  }, []);
  const change = useCallback((updater) => { checkpoint(); setProject(updater); }, [checkpoint, setProject]);
  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(projectRef.current);
    setProject(prev);
    setHistoryTick((n) => n + 1);
  }, [setProject]);
  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(projectRef.current);
    setProject(next);
    setHistoryTick((n) => n + 1);
  }, [setProject]);

  // ---- editor ui ----
  const [selected, setSelected] = useState(null); // {kind: 'clip'|'song'|'text', id}
  const [tab, setTab] = useState('audio');
  const [time, setTime] = useState(0);
  const timeRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [pps, setPps] = useState(40); // timeline pixels per second
  const [snapOn, setSnapOn] = useState(true);
  const timelineRef = useRef(null);
  const previewBoxRef = useRef(null);
  const [frameBox, setFrameBox] = useState({ w: 270, h: 480 });

  // ---- export ----
  const [renderState, setRenderState] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [caption, setCaption] = useState('');
  const [copied, setCopied] = useState(false);
  const renderedKeyRef = useRef('');

  const videoRef = useRef(null);
  const bgVideoRef = useRef(null);
  const audioCtxRef = useRef(null);
  const nodesRef = useRef([]);
  const clockRef = useRef(null); // {t0, ctxStart}
  const rafRef = useRef(0);

  const duration = reel?.duration || 0;
  const [addingAudio, setAddingAudio] = useState(false);
  const peaksRequested = useRef(new Set());
  const [audioError, setAudioError] = useState('');
  const audios = reel?.audios || [];
  const allTracks = useMemo(() => [
    ...TRACKS,
    ...audios.map((a) => ({ id: a.id, label: a.name, hint: 'Your audio file', ext: true })),
  ], [audios]);
  const trackLabel = (id) => allTracks.find((t) => t.id === id)?.label || 'Audio';
  const trackUrl = useCallback((track) => (track.startsWith('ext_')
    ? `/api/reels/${reel?.id}/audio/${track}`
    : TRACK_AUDIO[track](jobId)), [reel?.id, jobId]);
  const clips = project?.clips || [];
  const starts = useMemo(() => clipStarts(clips), [clips]);
  const L = useMemo(() => reelLength(clips), [clips]);

  // ------------------------------------------------------------------
  // open / resume
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!open || !jobId) return undefined;
    let alive = true;
    setCaption(`${songTitle} 🎶 sung with Lyra\n\n#cover #singing #aicover #reels`);
    // song tracks (waveforms + availability)
    TRACKS.forEach((t) => {
      fetch(`/api/reels/song/${jobId}/${t.id}`)
        .then((r) => (r.ok ? r.json() : { missing: true }))
        .then((d) => { if (alive) setSongs((s) => ({ ...s, [t.id]: d })); })
        .catch(() => { if (alive) setSongs((s) => ({ ...s, [t.id]: { missing: true } })); });
    });
    // resume the last reel made for this song
    const last = lsGet(`lyra.reel.${jobId}`);
    if (last?.reelId) {
      fetch(`/api/reels/${last.reelId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => {
          if (!alive || !m || m.status !== 'ready') return;
          setReel(m);
          const saved = lsGet(`lyra.reel.project.${m.id}`);
          if (saved?.clips?.length) setProject(saved);
          if (m.render?.status === 'done') {
            setRenderState(m.render);
            renderedKeyRef.current = saved ? JSON.stringify(saved) : '';
          }
          setStage('edit');
        })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [open, jobId, songTitle, setProject]);

  // default project once the video and the main song are known
  useEffect(() => {
    if (stage !== 'edit' || !reel || project) return;
    if (!songs.master) return;
    const p = defaultProject(reel.duration, songs.master.missing ? null : songs.master);
    projectRef.current = p;
    setProjectState(p);
  }, [stage, reel, project, songs.master]);

  // keep the project for this reel (survives closing the studio)
  useEffect(() => {
    if (reel?.id && project) lsSet(`lyra.reel.project.${reel.id}`, project);
  }, [reel?.id, project]);

  // decode the song tracks the project uses (Web Audio, for exact preview)
  useEffect(() => {
    if (!open || !jobId || !project) return;
    const need = [...new Set(project.songs.map((s) => s.track))].filter((t) => !buffersRef.current[t] && !buffersReady[t]);
    need.forEach((track) => {
      setBuffersReady((b) => ({ ...b, [track]: 'loading' }));
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AC();
      }
      fetch(`${trackUrl(track)}?t=${Date.now()}`)
        .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then((buf) => audioCtxRef.current.decodeAudioData(buf))
        .then((ab) => { buffersRef.current[track] = ab; setBuffersReady((b) => ({ ...b, [track]: true })); })
        .catch(() => setBuffersReady((b) => ({ ...b, [track]: 'error' })));
    });
  }, [open, jobId, project, buffersReady, trackUrl]);

  // waveforms of your own audio files
  useEffect(() => {
    if (!open || !reel?.id) return;
    audios.filter((a) => !songs[a.id] && !peaksRequested.current.has(a.id)).forEach((a) => {
      peaksRequested.current.add(a.id);
      setSongs((s) => ({ ...s, [a.id]: { loading: true, duration: a.duration } }));
      fetch(`/api/reels/${reel.id}/audio/${a.id}/peaks`)
        .then((r) => (r.ok ? r.json() : { missing: true }))
        .then((d) => setSongs((s) => ({ ...s, [a.id]: d })))
        .catch(() => setSongs((s) => ({ ...s, [a.id]: { missing: true } })));
    });
  }, [open, reel?.id, audios, songs]);

  // ------------------------------------------------------------------
  // import
  // ------------------------------------------------------------------
  const pollImport = useCallback((id) => {
    const tick = () => {
      fetch(`/api/reels/${id}`).then((r) => r.json()).then((m) => {
        setReel(m);
        if (m.status === 'importing') { setTimeout(tick, 900); return; }
        if (m.status === 'ready') {
          lsSet(`lyra.reel.${jobId}`, { reelId: m.id });
          setProjectState(null);
          projectRef.current = null;
          pastRef.current = [];
          futureRef.current = [];
          setRenderState(null);
          setTime(0);
          timeRef.current = 0;
          setStage('edit');
        } else {
          setImportError(m.message || 'Could not import this video.');
          setStage('source');
        }
      }).catch(() => { setImportError('Lost connection while importing.'); setStage('source'); });
    };
    tick();
  }, [jobId]);

  const startImport = async ({ url, file }) => {
    setImportError('');
    const fd = new FormData();
    if (url) fd.append('url', url.trim());
    if (file) fd.append('video_file', file);
    if (jobId) fd.append('job_id', jobId);
    setStage('importing');
    setReel({ message: file ? 'Uploading your video...' : 'Downloading the video...' });
    try {
      const res = await fetch('/api/reels', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Import failed');
      pollImport(data.id);
    } catch (e) {
      setImportError(e.message);
      setStage('source');
    }
  };

  // ------------------------------------------------------------------
  // playback (video element + Web Audio song pieces on one clock)
  // ------------------------------------------------------------------
  const stopNodes = () => {
    nodesRef.current.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    nodesRef.current = [];
  };

  const syncVideo = useCallback((T, force) => {
    const p = projectRef.current;
    const v = videoRef.current;
    if (!p || !v) return;
    const st = clipStarts(p.clips);
    const { src } = locate(T, p.clips, st);
    if (force || Math.abs(v.currentTime - src) > 0.25) {
      try { v.currentTime = src; } catch { /* not loaded */ }
    }
    const bg = bgVideoRef.current;
    if (bg && (force || Math.abs(bg.currentTime - v.currentTime) > 0.3)) {
      try { bg.currentTime = v.currentTime; } catch { /* not loaded */ }
    }
  }, []);

  const pause = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    stopNodes();
    clockRef.current = null;
    videoRef.current?.pause();
    bgVideoRef.current?.pause();
    setPlaying(false);
  }, []);

  const seek = useCallback((T) => {
    const p = projectRef.current;
    if (!p) return;
    const t = clamp(T, 0, reelLength(p.clips));
    timeRef.current = t;
    setTime(t);
    if (clockRef.current) {
      // restart playback from the new point so audio stays exact
      pause();
      setTimeout(() => playRef.current?.(), 0);
    } else {
      syncVideo(t, true);
    }
  }, [pause, syncVideo]);

  const play = useCallback(async () => {
    const p = projectRef.current;
    const v = videoRef.current;
    if (!p || !v) return;
    const len = reelLength(p.clips);
    let T0 = timeRef.current >= len - 0.05 ? 0 : timeRef.current;
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new AC();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();
    stopNodes();
    const ctxStart = ctx.currentTime + 0.08;
    for (const s of p.songs) {
      const buf = buffersRef.current[s.track];
      if (!buf) continue;
      const dur = s.out - s.in;
      const endT = Math.min(s.at + dur, len);
      if (endT <= T0 || s.at >= len) continue;
      const startT = Math.max(s.at, T0);
      const off = startT - s.at; // seconds into the piece
      const when = ctxStart + (startT - T0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const vol = s.volume;
      const fi = s.fade_in || 0;
      const fo = s.fade_out || 0;
      const gainAt = (u) => {
        let k = 1;
        if (fi > 0 && u < fi) k = Math.min(k, u / fi);
        if (fo > 0 && u > dur - fo) k = Math.min(k, (dur - u) / fo);
        return vol * clamp(k, 0, 1);
      };
      g.gain.setValueAtTime(gainAt(off), when);
      if (fi > 0 && off < fi) g.gain.linearRampToValueAtTime(vol, when + (fi - off));
      if (fo > 0) {
        const foStart = dur - fo;
        if (off < foStart) g.gain.setValueAtTime(gainAt(foStart), when + (foStart - off));
        g.gain.linearRampToValueAtTime(0, when + (dur - off));
      }
      src.connect(g).connect(ctx.destination);
      src.start(when, s.in + off, endT - startT);
      nodesRef.current.push(src);
    }
    clockRef.current = { t0: T0, ctxStart };
    timeRef.current = T0;
    syncVideo(T0, true);
    v.muted = p.video.volume <= 0.001;
    v.volume = clamp(p.video.volume, 0, 1);
    v.play().catch(() => {});
    bgVideoRef.current?.play().catch(() => {});
    setPlaying(true);

    const loop = () => {
      const c = clockRef.current;
      if (!c) return;
      const T = c.t0 + Math.max(0, ctx.currentTime - c.ctxStart);
      const cur = projectRef.current;
      const curLen = reelLength(cur.clips);
      if (T >= curLen) {
        pause();
        timeRef.current = curLen;
        setTime(curLen);
        return;
      }
      timeRef.current = T;
      setTime(T);
      syncVideo(T, false);
      if (v.paused) v.play().catch(() => {});
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [pause, syncVideo]);
  const playRef = useRef(play);
  playRef.current = play;

  const togglePlay = useCallback(() => (clockRef.current ? pause() : play()), [pause, play]);

  // edits change what plays: restart the audio graph (debounced) while playing
  const editKey = project ? JSON.stringify([project.clips, project.songs, project.video.volume]) : '';
  useEffect(() => {
    if (!clockRef.current) return undefined;
    const id = setTimeout(() => { if (clockRef.current) { pause(); playRef.current?.(); } }, 120);
    return () => clearTimeout(id);
  }, [editKey, pause]);

  // original sound level on the element (live)
  useEffect(() => {
    const v = videoRef.current;
    if (v && project) {
      v.muted = project.video.volume <= 0.001;
      v.volume = clamp(project.video.volume, 0, 1);
    }
  }, [project?.video.volume]);

  // stop everything when closed
  useEffect(() => { if (!open) pause(); }, [open, pause]);
  useEffect(() => () => {
    pause();
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
  }, [pause]);

  // ------------------------------------------------------------------
  // preview frame size
  // ------------------------------------------------------------------
  const aspectRatio = useMemo(() => {
    if (!project || !reel) return 9 / 16;
    const a = ASPECTS.find((x) => x.id === project.canvas.aspect);
    return a?.r || (reel.width && reel.height ? reel.width / reel.height : 9 / 16);
  }, [project, reel]);

  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return undefined;
    const measure = () => {
      const W = el.clientWidth - 8;
      const H = el.clientHeight - 8;
      if (W <= 0 || H <= 0) return;
      let w = W;
      let h = W / aspectRatio;
      if (h > H) { h = H; w = H * aspectRatio; }
      setFrameBox({ w: Math.round(w), h: Math.round(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspectRatio, stage]);

  // fit the timeline to the width when the reel length changes a lot
  const fitTimeline = useCallback(() => {
    const el = timelineRef.current;
    const p = projectRef.current;
    if (!el || !p) return;
    const songEnd = Math.max(0, ...p.songs.map((s) => s.at + s.out - s.in));
    const span = Math.max(reelLength(p.clips), Math.min(songEnd, reelLength(p.clips) * 1.5), 1);
    setPps(clamp((el.clientWidth - 24) / (span + 0.5), 4, 400));
  }, []);
  useEffect(() => { if (stage === 'edit' && project) fitTimeline(); }, [stage, !!project]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------
  // editing actions
  // ------------------------------------------------------------------
  const snapPoints = useCallback((exclude) => {
    const p = projectRef.current;
    const pts = [0, reelLength(p.clips), timeRef.current];
    clipStarts(p.clips).forEach((s) => pts.push(s));
    p.songs.forEach((s) => { if (s.id !== exclude) pts.push(s.at, s.at + s.out - s.in); });
    p.texts.forEach((t) => { if (t.id !== exclude) pts.push(t.start, t.end); });
    return pts;
  }, []);
  const snap = useCallback((t, exclude) => {
    if (!snapOn) return t;
    const thr = 8 / pps;
    let best = t;
    let bestD = thr;
    for (const s of snapPoints(exclude)) {
      const d = Math.abs(s - t);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }, [snapOn, pps, snapPoints]);

  const splitAtPlayhead = useCallback(() => {
    const p = projectRef.current;
    if (!p) return;
    const T = timeRef.current;
    if (selected?.kind === 'song') {
      const s = p.songs.find((x) => x.id === selected.id);
      if (s && T > s.at + 0.05 && T < s.at + (s.out - s.in) - 0.05) {
        const cut = s.in + (T - s.at);
        const b = { ...s, id: uid(), in: cut, at: T, fade_in: 0 };
        change((q) => ({ ...q, songs: q.songs.flatMap((x) => (x.id === s.id ? [{ ...x, out: cut, fade_out: 0 }, b] : [x])) }));
        setSelected({ kind: 'song', id: b.id });
      }
      return;
    }
    const st = clipStarts(p.clips);
    const { index, src } = locate(T, p.clips, st);
    const c = p.clips[index];
    if (!c || src - c.in < MIN_CLIP || c.out - src < MIN_CLIP) return;
    const b = { id: uid(), in: src, out: c.out };
    change((q) => ({ ...q, clips: q.clips.flatMap((x) => (x.id === c.id ? [{ ...x, out: src }, b] : [x])) }));
    setSelected({ kind: 'clip', id: b.id });
  }, [selected, change]);

  const deleteSelected = useCallback(() => {
    const p = projectRef.current;
    if (!p || !selected) return;
    if (selected.kind === 'clip') {
      if (p.clips.length <= 1) return;
      change((q) => ({ ...q, clips: q.clips.filter((c) => c.id !== selected.id) }));
    } else if (selected.kind === 'song') {
      change((q) => ({ ...q, songs: q.songs.filter((s) => s.id !== selected.id) }));
    } else if (selected.kind === 'text') {
      change((q) => ({ ...q, texts: q.texts.filter((t) => t.id !== selected.id) }));
    }
    setSelected(null);
  }, [selected, change]);

  const addSong = (track = 'master') => {
    const sd = songs[track]?.duration;
    if (!sd) return;
    const p = projectRef.current;
    const len = reelLength(p.clips);
    const at = clamp(timeRef.current, 0, Math.max(0, len - 0.5));
    const dur = Math.min(sd, Math.max(1, len - at));
    const s = { id: uid(), track, in: 0, out: dur, at, volume: 1, fade_in: 0.2, fade_out: 0.5 };
    change((q) => ({ ...q, songs: [...q.songs, s] }));
    setSelected({ kind: 'song', id: s.id });
  };

  const placePiece = (track, sd) => {
    const p = projectRef.current;
    const len = reelLength(p.clips);
    const at = clamp(timeRef.current >= len - 0.5 ? 0 : timeRef.current, 0, Math.max(0, len - 0.5));
    const dur = Math.min(sd, Math.max(1, len - at));
    const s = { id: uid(), track, in: 0, out: dur, at, volume: 1, fade_in: 0.2, fade_out: 0.5 };
    change((q) => ({ ...q, songs: [...q.songs, s] }));
    setSelected({ kind: 'song', id: s.id });
  };

  /** Add your own audio file to the reel and put it on the timeline at the playhead. */
  const uploadAudio = async (file) => {
    if (!file || !reel?.id) return;
    setAddingAudio(true);
    setAudioError('');
    try {
      const fd = new FormData();
      fd.append('audio_file', file);
      const res = await fetch(`/api/reels/${reel.id}/audio`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Could not add this audio');
      setReel((r) => ({ ...r, audios: [...(r.audios || []), data] }));
      placePiece(data.id, data.duration);
    } catch (e) {
      setAudioError(e.message);
    } finally {
      setAddingAudio(false);
    }
  };

  const removeAudio = async (aid) => {
    if (!reel?.id) return;
    const res = await fetch(`/api/reels/${reel.id}/audio/${aid}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) return;
    setReel((r) => ({ ...r, audios: (r.audios || []).filter((a) => a.id !== aid) }));
    change((q) => ({ ...q, songs: q.songs.filter((s) => s.track !== aid) }));
    delete buffersRef.current[aid];
    setSelected(null);
  };

  const addText = () => {
    const p = projectRef.current;
    const len = reelLength(p.clips);
    const start = clamp(timeRef.current, 0, Math.max(0, len - 0.5));
    const t = { id: uid(), text: songTitle, start, end: Math.min(len, start + 3), x: 0.5, y: 0.82, size: 0.045, color: '#ffffff', box: true };
    change((q) => ({ ...q, texts: [...q.texts, t] }));
    setSelected({ kind: 'text', id: t.id });
    setTab('text');
  };

  const updateSong = (id, patch, record = true) => (record ? change : setProject)((q) => ({ ...q, songs: q.songs.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const updateText = (id, patch, record = true) => (record ? change : setProject)((q) => ({ ...q, texts: q.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  const setSection = (key, patch, record = true) => (record ? change : setProject)((q) => ({ ...q, [key]: { ...q[key], ...patch } }));

  /** Generic horizontal drag on the timeline; onMove gets the change in seconds. */
  const startDrag = (e, onMove, { record = true } = {}) => {
    e.preventDefault();
    e.stopPropagation();
    if (record) checkpoint();
    const x0 = e.clientX;
    const move = (ev) => onMove((ev.clientX - x0) / pps);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const dragClipEdge = (e, clip, edge) => {
    setSelected({ kind: 'clip', id: clip.id });
    const orig = { ...clip };
    startDrag(e, (ds) => {
      setProject((q) => ({
        ...q,
        clips: q.clips.map((c) => {
          if (c.id !== clip.id) return c;
          if (edge === 'in') return { ...c, in: clamp(orig.in + ds, 0, orig.out - MIN_CLIP) };
          return { ...c, out: clamp(orig.out + ds, orig.in + MIN_CLIP, duration) };
        }),
      }));
    });
  };

  const dragSong = (e, s, mode) => {
    setSelected({ kind: 'song', id: s.id });
    const orig = { ...s };
    const sd = songs[s.track]?.duration || orig.out;
    startDrag(e, (ds) => {
      const dur = orig.out - orig.in;
      let patch;
      if (mode === 'move') {
        let at = Math.max(0, orig.at + ds);
        const a = snap(at, s.id);
        const b = snap(at + dur, s.id);
        at = Math.abs(a - at) <= Math.abs(b - (at + dur)) ? a : b - dur;
        patch = { at: Math.max(0, at) };
      } else if (mode === 'in') {
        const d = clamp(ds, -Math.min(orig.in, orig.at), dur - MIN_CLIP);
        const at = snap(orig.at + d, s.id);
        const dd = clamp(at - orig.at, -Math.min(orig.in, orig.at), dur - MIN_CLIP);
        patch = { in: orig.in + dd, at: orig.at + dd };
      } else {
        const endT = snap(orig.at + dur + ds, s.id);
        patch = { out: clamp(orig.in + (endT - orig.at), orig.in + MIN_CLIP, sd) };
      }
      setProject((q) => ({ ...q, songs: q.songs.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) }));
    });
  };

  const dragText = (e, t, mode) => {
    setSelected({ kind: 'text', id: t.id });
    setTab('text');
    const orig = { ...t };
    startDrag(e, (ds) => {
      const len = reelLength(projectRef.current.clips);
      let patch;
      if (mode === 'move') {
        const d = orig.end - orig.start;
        const st = clamp(snap(orig.start + ds, t.id), 0, Math.max(0, len - d));
        patch = { start: st, end: st + d };
      } else if (mode === 'in') {
        patch = { start: clamp(snap(orig.start + ds, t.id), 0, orig.end - MIN_CLIP) };
      } else {
        patch = { end: clamp(snap(orig.end + ds, t.id), orig.start + MIN_CLIP, len) };
      }
      setProject((q) => ({ ...q, texts: q.texts.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) }));
    });
  };

  const seekFromTimeline = (e) => {
    const el = timelineRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const toT = (clientX) => (clientX - rect.left + el.scrollLeft - 12) / pps;
    seek(toT(e.clientX));
    const move = (ev) => seek(toT(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** Drag a text overlay around the preview frame. */
  const dragTextInFrame = (e, t) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ kind: 'text', id: t.id });
    setTab('text');
    checkpoint();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const orig = { x: t.x, y: t.y };
    const move = (ev) => {
      const nx = clamp(orig.x + (ev.clientX - x0) / frameBox.w, 0.02, 0.98);
      const ny = clamp(orig.y + (ev.clientY - y0) / frameBox.h, 0.02, 0.98);
      setProject((q) => ({ ...q, texts: q.texts.map((x) => (x.id === t.id ? { ...x, x: Math.abs(nx - 0.5) < 0.02 ? 0.5 : nx, y: ny } : x)) }));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // keyboard shortcuts
  useEffect(() => {
    if (!open || stage !== 'edit') return undefined;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); splitAtPlayhead(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(timeRef.current - (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); seek(timeRef.current + (e.shiftKey ? 1 : 1 / 30)); }
      else if (e.key === 'Escape') { setSelected(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, stage, togglePlay, undo, redo, splitAtPlayhead, deleteSelected, seek]);

  // ------------------------------------------------------------------
  // export
  // ------------------------------------------------------------------
  const pollRender = useCallback((id) => {
    const tick = () => {
      fetch(`/api/reels/${id}`).then((r) => r.json()).then((m) => {
        setRenderState(m.render);
        if (m.render?.status === 'rendering') setTimeout(tick, 1000);
      }).catch(() => setTimeout(tick, 2500));
    };
    tick();
  }, []);

  const projectKey = project ? JSON.stringify(project) : '';
  const openExport = () => {
    pause();
    if (renderState?.status === 'done' && renderedKeyRef.current !== projectKey) setRenderState({ status: 'idle' });
    setShowExport(true);
  };

  const exportReel = async () => {
    if (!reel?.id || !project) return;
    pause();
    renderedKeyRef.current = projectKey;
    setShowExport(true);
    setRenderState({ status: 'rendering', progress: 0, message: 'Starting...' });
    const body = {
      job_id: jobId,
      clips: project.clips.map(({ in: a, out }) => ({ in: a, out })),
      songs: project.songs.map(({ id, ...s }) => s),
      video: project.video,
      canvas: project.canvas,
      adjust: project.adjust,
      texts: project.texts.map(({ id, ...t }) => t),
      export: project.export,
    };
    try {
      const res = await fetch(`/api/reels/${reel.id}/render`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Export failed');
      pollRender(reel.id);
    } catch (e) {
      setRenderState({ status: 'error', message: e.message });
    }
  };

  const cancelExport = async () => {
    if (!reel?.id) return;
    await fetch(`/api/reels/${reel.id}/render/cancel`, { method: 'POST' }).catch(() => {});
    setRenderState({ status: 'cancelled', message: 'Export cancelled' });
  };

  const shareReel = async () => {
    if (!renderState?.url) return;
    try {
      const blob = await (await fetch(renderState.url)).blob();
      const file = new File([blob], `Lyra Reel - ${songTitle}.mp4`.replace(/[^\w .-]+/g, ''), { type: 'video/mp4' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: caption });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    window.location.href = renderState.download_url;
  };

  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(caption); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };

  // ------------------------------------------------------------------
  // render
  // ------------------------------------------------------------------
  if (!open) return null;

  const close = () => { pause(); onClose?.(); };
  const selSong = selected?.kind === 'song' ? project?.songs.find((s) => s.id === selected.id) : null;
  const selText = selected?.kind === 'text' ? project?.texts.find((t) => t.id === selected.id) : null;
  const songsLoading = project?.songs.some((s) => buffersReady[s.track] === 'loading');

  // --- source picker / importing ---
  if (stage !== 'edit' || !project || !reel) {
    const busy = stage === 'importing' || (stage === 'edit' && !project);
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-fadeIn" onClick={close}>
        <div className="panel rim-glow w-full max-w-xl !bg-[#0f1115] p-6 sm:p-7 animate-scaleIn" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-display)' }}>
                <Clapperboard className="w-5 h-5 text-[#e5a958]" /> Create a reel
              </h2>
              <p className="text-xs text-white/50 mt-1">Put <span className="text-white/80">{songTitle}</span> on a video, then trim, frame, add text and export.</p>
            </div>
            <button type="button" onClick={close} className="btn btn-ghost btn-sm btn-icon" title="Close"><X /></button>
          </div>

          {busy ? (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <Loader2 className="w-8 h-8 text-[#e5a958] animate-spin" />
              <p className="text-sm text-white/80">{reel?.message || 'Preparing...'}</p>
              <p className="text-xs text-white/40">Instagram videos usually take 5–20 seconds.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <form
                onSubmit={(e) => { e.preventDefault(); if (linkInput.trim()) startImport({ url: linkInput }); }}
                className="space-y-2"
              >
                <label className="text-xs text-white/60">Instagram post or reel link</label>
                <div className="flex gap-2">
                  <div className="field flex-1">
                    <LinkIcon className="w-4 h-4 text-white/40" />
                    <input
                      value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
                      placeholder="https://www.instagram.com/reel/..." inputMode="url" autoFocus
                    />
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm !h-auto" disabled={!linkInput.trim()}>Import</button>
                </div>
                <p className="text-[11px] text-white/40">Public posts work best. YouTube Shorts and TikTok links work too.</p>
              </form>

              <div className="flex items-center gap-3 text-[11px] text-white/30"><div className="h-px flex-1 bg-white/10" />or<div className="h-px flex-1 bg-white/10" /></div>

              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) startImport({ file: f }); }}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 cursor-pointer transition-colors ${dragOver ? 'border-[#e5a958] bg-[#e5a958]/10' : 'border-white/15 bg-white/[0.02] hover:bg-white/[0.05]'}`}
              >
                <Upload className="w-6 h-6 text-[#3fe0c5]" />
                <span className="text-sm text-white/80">Upload a video from your device</span>
                <span className="text-[11px] text-white/40">MP4, MOV or WebM, up to 15 minutes</span>
                <input type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) startImport({ file: f }); }} />
              </label>

              {importError && (
                <div className="flex gap-2 items-start text-xs text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-px" /> <span>{importError}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- editor ---
  const { canvas, adjust, video } = project;
  const srcW = reel.width || 1080;
  const srcH = reel.height || 1920;
  const cover = Math.max(frameBox.w / srcW, frameBox.h / srcH);
  const contain = Math.min(frameBox.w / srcW, frameBox.h / srcH);
  let vStyle;
  if (canvas.fit === 'fill') {
    const s = cover * canvas.zoom;
    const dw = srcW * s;
    const dh = srcH * s;
    vStyle = { width: dw, height: dh, left: (frameBox.w - dw) * (0.5 + canvas.pan_x / 2), top: (frameBox.h - dh) * (0.5 + canvas.pan_y / 2) };
  } else {
    const dw = srcW * contain;
    const dh = srcH * contain;
    vStyle = { width: dw, height: dh, left: (frameBox.w - dw) / 2, top: (frameBox.h - dh) / 2 };
  }
  const cssFilter = `brightness(${1 + adjust.brightness * 1.6}) contrast(${adjust.contrast}) saturate(${adjust.saturation})`;
  const fadeOpacity = (() => {
    let o = 0;
    if (video.fade_in > 0 && time < video.fade_in) o = Math.max(o, 1 - time / video.fade_in);
    if (video.fade_out > 0 && time > L - video.fade_out) o = Math.max(o, 1 - (L - time) / video.fade_out);
    return clamp(o, 0, 1);
  })();
  const songEnd = Math.max(0, ...project.songs.map((s) => s.at + s.out - s.in));
  const span = Math.max(L, songEnd) + 2;
  const contentW = span * pps + 24;
  const tickStep = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * pps >= 60) || 120;

  return (
    <div className="fixed inset-0 z-[90] bg-[#0b0c0f] text-white flex flex-col animate-fadeIn select-none">
      {/* header */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-5 h-14 border-b border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Clapperboard className="w-5 h-5 text-[#e5a958] shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">Reel Studio</div>
            <div className="text-[11px] text-white/45 truncate">{songTitle} · {fmt(L)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={undo} disabled={!pastRef.current.length} title="Undo (Ctrl+Z)"><Undo2 /></button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={redo} disabled={!futureRef.current.length} title="Redo (Ctrl+Shift+Z)"><Redo2 /></button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { pause(); setStage('source'); }} title="Use a different video"><Film /> <span className="hidden sm:inline">Change video</span></button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openExport}><Download /> {renderState?.status === 'rendering' ? `${renderState.progress || 0}%` : 'Export'}</button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={close} title="Close"><X /></button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* preview */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col">
          <div ref={previewBoxRef} className="flex-1 min-h-[220px] flex items-center justify-center p-1 overflow-hidden" onPointerDown={() => setSelected(null)}>
            <div className="relative overflow-hidden rounded-lg shadow-2xl bg-black" style={{ width: frameBox.w, height: frameBox.h }}>
              {canvas.fit === 'blur' && (
                <video
                  ref={bgVideoRef} src={reel.preview_url} muted playsInline preload="auto"
                  onLoadedData={() => syncVideo(timeRef.current, true)}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ filter: `${cssFilter} blur(${Math.max(8, frameBox.w / 18)}px) brightness(0.85)`, transform: 'scale(1.15)' }}
                />
              )}
              <video
                ref={videoRef} src={reel.preview_url} playsInline preload="auto"
                onLoadedData={() => syncVideo(timeRef.current, true)}
                className="absolute max-w-none pointer-events-none"
                style={{ ...vStyle, objectFit: 'fill', filter: cssFilter }}
              />
              {project.texts.filter((t) => time >= t.start && time <= t.end).map((t) => {
                const px = t.size * frameBox.h;
                return (
                  <div
                    key={t.id}
                    onPointerDown={(e) => dragTextInFrame(e, t)}
                    className={`absolute whitespace-pre text-center font-bold cursor-move leading-tight ${selected?.id === t.id ? 'outline outline-1 outline-dashed outline-[#e5a958]' : ''}`}
                    style={{
                      left: `${t.x * 100}%`, top: `${t.y * 100}%`, transform: 'translate(-50%, -50%)',
                      fontSize: px, color: t.color, fontFamily: '"DejaVu Sans", Verdana, sans-serif',
                      WebkitTextStroke: `${Math.max(1, px / 18)}px rgba(0,0,0,0.55)`, paintOrder: 'stroke fill',
                      background: t.box ? 'rgba(0,0,0,0.55)' : 'transparent', padding: t.box ? `${px / 3}px` : 0,
                    }}
                  >
                    {t.text}
                  </div>
                );
              })}
              {fadeOpacity > 0 && <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: fadeOpacity }} />}
            </div>
          </div>

          {/* transport */}
          <div className="flex items-center justify-between gap-1 sm:gap-2 px-2 sm:px-5 py-2 border-t border-white/[0.07] shrink-0">
            <div className="flex items-center gap-1.5">
              <button type="button" className="btn btn-ghost btn-sm btn-icon max-sm:!hidden" onClick={() => seek(0)} title="Back to start"><SkipBack /></button>
              <button type="button" className="btn btn-primary btn-sm btn-icon !w-10 !h-10" onClick={togglePlay} title="Play / pause (Space)">
                {playing ? <Pause /> : <Play />}
              </button>
              <span className="font-mono text-xs text-white/70 ml-1 whitespace-nowrap">{fmt(time)} <span className="text-white/35">/ {fmt(L)}</span></span>
              {songsLoading && <span className="chip chip-gold ml-1"><Loader2 className="w-3 h-3 animate-spin" /> loading song</span>}
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1">
              <button type="button" className="btn btn-ghost btn-sm" onClick={splitAtPlayhead} title="Split at playhead (S)"><Scissors /> <span className="hidden sm:inline">Split</span></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={deleteSelected} disabled={!selected} title="Delete selected (Del)"><Trash2 /> <span className="hidden sm:inline">Delete</span></button>
              <button type="button" className={`btn btn-sm btn-icon ${snapOn ? 'btn-outline-gold' : 'btn-ghost'}`} onClick={() => setSnapOn((v) => !v)} title="Snap to edges and playhead"><Magnet /></button>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setPps((v) => clamp(v / 1.5, 4, 400))} title="Zoom out"><ZoomOut /></button>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setPps((v) => clamp(v * 1.5, 4, 400))} title="Zoom in"><ZoomIn /></button>
            </div>
          </div>

          {/* timeline */}
          <div ref={timelineRef} className="shrink-0 overflow-x-auto overflow-y-hidden border-t border-white/[0.07] bg-[#0e1014]" style={{ touchAction: 'pan-x' }}>
            <div className="relative" style={{ width: contentW, paddingLeft: 12, paddingRight: 12 }}>
              {/* ruler */}
              <div className="relative h-6 cursor-pointer" onPointerDown={seekFromTimeline}>
                {Array.from({ length: Math.ceil(span / tickStep) + 1 }, (_, i) => i * tickStep).map((t) => (
                  <div key={t} className="absolute top-0 h-full border-l border-white/15" style={{ left: t * pps }}>
                    <span className="absolute top-0.5 left-1 text-[10px] font-mono text-white/40">{fmt(t).replace(/\.0$/, '')}</span>
                  </div>
                ))}
              </div>

              {/* video lane */}
              <div className="relative mb-1.5" style={{ height: LANE_H.video }} onPointerDown={seekFromTimeline}>
                {clips.map((c, i) => {
                  const w = (c.out - c.in) * pps;
                  const sel = selected?.kind === 'clip' && selected.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onPointerDown={(e) => { e.stopPropagation(); setSelected({ kind: 'clip', id: c.id }); seekFromTimeline(e); }}
                      className={`absolute top-0 h-full rounded-md overflow-hidden border-2 ${sel ? 'border-[#e5a958]' : 'border-white/15'}`}
                      style={{
                        left: starts[i] * pps, width: Math.max(4, w - 2),
                        backgroundImage: reel.filmstrip_url ? `url(${reel.filmstrip_url})` : undefined,
                        backgroundSize: `${duration * pps}px 100%`, backgroundPosition: `${-c.in * pps}px 0`, backgroundColor: '#1f2937',
                      }}
                    >
                      <div className="absolute inset-x-0 bottom-0 px-1 text-[10px] bg-black/50 text-white/80 truncate"><Film className="inline w-3 h-3 mr-0.5" />{fmt(c.out - c.in)}</div>
                      <div onPointerDown={(e) => dragClipEdge(e, c, 'in')} className="absolute left-0 top-0 h-full w-2.5 cursor-ew-resize bg-[#e5a958]/70 hover:bg-[#e5a958]" title="Trim start" />
                      <div onPointerDown={(e) => dragClipEdge(e, c, 'out')} className="absolute right-0 top-0 h-full w-2.5 cursor-ew-resize bg-[#e5a958]/70 hover:bg-[#e5a958]" title="Trim end" />
                    </div>
                  );
                })}
              </div>

              {/* song lane */}
              <div className="relative mb-1.5 rounded-md bg-white/[0.02]" style={{ height: LANE_H.song }} onPointerDown={seekFromTimeline}>
                {project.songs.length === 0 && <div className="absolute inset-0 flex items-center px-3 text-[11px] text-white/35">No song on the reel. Add one in Audio.</div>}
                {project.songs.map((s) => {
                  const w = (s.out - s.in) * pps;
                  const sel = selected?.kind === 'song' && selected.id === s.id;
                  const peaks = songs[s.track];
                  return (
                    <div
                      key={s.id}
                      onPointerDown={(e) => { setTab('audio'); dragSong(e, s, 'move'); }}
                      className={`absolute top-0 h-full rounded-md overflow-hidden border-2 cursor-grab active:cursor-grabbing ${sel ? 'border-[#3fe0c5] bg-[#3fe0c5]/20' : 'border-[#3fe0c5]/35 bg-[#3fe0c5]/10'}`}
                      style={{ left: s.at * pps, width: Math.max(4, w) }}
                      title="Drag to move · drag the edges to trim"
                    >
                      {peaks?.peaks && <Waveform peaks={peaks.peaks} perSecond={peaks.per_second} from={s.in} to={s.out} width={w} height={LANE_H.song - 4} color="rgba(63,224,197,0.75)" />}
                      <div className="absolute left-1 top-0.5 text-[10px] text-white/80 pointer-events-none truncate max-w-full">
                        <Music className="inline w-3 h-3 mr-0.5" />{trackLabel(s.track)} · {fmt(s.in)}–{fmt(s.out)}
                      </div>
                      <div onPointerDown={(e) => dragSong(e, s, 'in')} className="absolute left-0 top-0 h-full w-2.5 cursor-ew-resize bg-[#3fe0c5]/60 hover:bg-[#3fe0c5]" title="Trim start" />
                      <div onPointerDown={(e) => dragSong(e, s, 'out')} className="absolute right-0 top-0 h-full w-2.5 cursor-ew-resize bg-[#3fe0c5]/60 hover:bg-[#3fe0c5]" title="Trim end" />
                    </div>
                  );
                })}
              </div>

              {/* text lane */}
              <div className="relative mb-2 rounded-md bg-white/[0.02]" style={{ height: LANE_H.text }} onPointerDown={seekFromTimeline}>
                {project.texts.length === 0 && <div className="absolute inset-0 flex items-center px-3 text-[11px] text-white/30">Text</div>}
                {project.texts.map((t) => {
                  const sel = selected?.kind === 'text' && selected.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onPointerDown={(e) => dragText(e, t, 'move')}
                      className={`absolute top-0 h-full rounded-md border-2 px-2 text-[10px] flex items-center truncate cursor-grab ${sel ? 'border-[#f472b6] bg-[#f472b6]/25' : 'border-[#f472b6]/40 bg-[#f472b6]/10'}`}
                      style={{ left: t.start * pps, width: Math.max(6, (t.end - t.start) * pps) }}
                    >
                      <Type className="w-3 h-3 mr-1 shrink-0" /><span className="truncate">{t.text}</span>
                      <div onPointerDown={(e) => dragText(e, t, 'in')} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-[#f472b6]/50" />
                      <div onPointerDown={(e) => dragText(e, t, 'out')} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-[#f472b6]/50" />
                    </div>
                  );
                })}
              </div>

              {/* past the end of the reel */}
              <div className="absolute top-6 bottom-0 bg-black/45 pointer-events-none" style={{ left: 12 + L * pps, right: 0 }} />
              {/* playhead */}
              <div className="absolute top-0 bottom-0 w-0.5 bg-[#e5a958] pointer-events-none" style={{ left: 12 + time * pps }}>
                <div className="absolute -top-0 -left-[5px] w-3 h-3 rotate-45 bg-[#e5a958]" />
              </div>
            </div>
          </div>
        </div>

        {/* side panel */}
        <div className="lg:w-[340px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.07] flex flex-col min-h-0 max-h-[42vh] lg:max-h-none">
          <div className="flex border-b border-white/[0.07] shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors ${tab === t.id ? 'text-[#ffd9a1] border-b-2 border-[#e5a958]' : 'text-white/55 hover:text-white'}`}
              >
                <t.icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {tab === 'audio' && (
              <>
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-white/80">Video's own sound</h4>
                    <button
                      type="button"
                      onClick={() => setSection('video', { volume: video.volume > 0 ? 0 : 1 })}
                      className={`btn btn-sm ${video.volume > 0 ? 'btn-secondary' : 'btn-outline-gold'}`}
                    >
                      {video.volume > 0 ? <><Volume2 /> On</> : <><VolumeX /> Muted</>}
                    </button>
                  </div>
                  {!reel.has_audio && <p className="text-[11px] text-white/40">This video has no sound of its own.</p>}
                  {reel.has_audio && (
                    <Slider label="Level" value={video.volume} min={0} max={2} step={0.05}
                      display={(v) => (v <= 0 ? 'muted' : `${Math.round(v * 100)}%`)}
                      onStart={checkpoint} onChange={(v) => setSection('video', { volume: v }, false)} />
                  )}
                </section>

                <section className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-white/80">Music &amp; audio</h4>
                    <div className="flex gap-1.5">
                      <button type="button" className="btn btn-outline-teal btn-sm" onClick={() => addSong(selSong?.track || 'master')} disabled={!songs.master?.duration} title="Add another piece of your converted song"><Plus /> Song</button>
                      <label className={`btn btn-outline-gold btn-sm cursor-pointer ${addingAudio ? 'opacity-60 pointer-events-none' : ''}`} title="Add any audio file: another song, a voice-over, a sound effect, or a video's sound">
                        {addingAudio ? <Loader2 className="animate-spin" /> : <FileAudio />} Audio file
                        <input type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; uploadAudio(f); }} />
                      </label>
                    </div>
                  </div>
                  {audioError && <p className="text-[11px] text-rose-300">{audioError}</p>}
                  {audios.length > 0 && !selSong && (
                    <div className="space-y-1">
                      <div className="text-[11px] text-white/45">Your audio files</div>
                      {audios.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs">
                          <FileAudio className="w-3.5 h-3.5 text-[#e5a958] shrink-0" />
                          <span className="truncate flex-1">{a.name}</span>
                          <span className="font-mono text-white/40">{fmt(a.duration)}</span>
                          <button type="button" className="text-white/50 hover:text-white" title="Add to the timeline at the playhead" onClick={() => placePiece(a.id, a.duration)}><Plus className="w-3.5 h-3.5" /></button>
                          <button type="button" className="text-white/40 hover:text-rose-300" title="Remove this file from the reel" onClick={() => removeAudio(a.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {songs.master?.missing && <p className="text-[11px] text-rose-300">The song's audio isn't on the server anymore.</p>}
                  {!selSong && project.songs.length > 0 && (
                    <div className="space-y-1.5">
                      {project.songs.map((s, i) => (
                        <button key={s.id} type="button" onClick={() => setSelected({ kind: 'song', id: s.id })}
                          className="w-full text-left rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-3 py-2 text-xs">
                          <Music className="inline w-3.5 h-3.5 mr-1 text-[#3fe0c5]" /> Piece {i + 1}: {trackLabel(s.track)}, {fmt(s.in)}–{fmt(s.out)} at {fmt(s.at)}
                        </button>
                      ))}
                      <p className="text-[11px] text-white/40">Select a piece on the timeline to edit it. Drag it to move, drag its edges to trim, press S to split.</p>
                    </div>
                  )}
                  {selSong && (() => {
                    const sd = songs[selSong.track]?.duration || selSong.out;
                    const dur = selSong.out - selSong.in;
                    return (
                      <div className="space-y-3 rounded-xl border border-[#3fe0c5]/25 bg-[#3fe0c5]/[0.04] p-3">
                        <Seg small value={selSong.track}
                          options={allTracks.map((t) => ({ ...t, label: songs[t.id]?.missing ? `${t.label} ✕` : t.label }))}
                          onChange={(track) => {
                            if (!songs[track]?.duration) return;
                            const d2 = songs[track].duration;
                            const a = Math.min(selSong.in, Math.max(0, d2 - MIN_CLIP));
                            updateSong(selSong.id, { track, in: a, out: Math.min(d2, a + dur) });
                          }} />
                        <Slider label={selSong.track.startsWith('ext_') ? 'Part of the audio' : 'Part of the song'} value={selSong.in} min={0} max={Math.max(0, sd - dur)} step={0.1} color={TEAL}
                          display={(v) => `${fmt(v)} – ${fmt(v + dur)}`}
                          onStart={checkpoint} onChange={(v) => updateSong(selSong.id, { in: v, out: v + dur }, false)} />
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" className="btn btn-outline-teal btn-sm" title="Use the loudest part of the song (usually the hook)"
                            onClick={() => { const st = loudestStart(songs[selSong.track]?.peaks, songs[selSong.track]?.per_second, dur); updateSong(selSong.id, { in: st, out: Math.min(sd, st + dur) }); }}>
                            <Wand2 /> Best part
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" title="Start with the video and last as long as it"
                            onClick={() => { const d2 = Math.min(L, sd - selSong.in); updateSong(selSong.id, { at: 0, out: selSong.in + d2 }); }}>
                            Fit to video
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateSong(selSong.id, { at: timeRef.current })} title="Start the piece at the playhead">
                            Start at playhead
                          </button>
                        </div>
                        <Slider label="Volume" value={selSong.volume} min={0} max={2} step={0.05} color={TEAL} display={(v) => `${Math.round(v * 100)}%`}
                          onStart={checkpoint} onChange={(v) => updateSong(selSong.id, { volume: v }, false)} />
                        <div className="grid grid-cols-2 gap-3">
                          <Slider label="Fade in" value={selSong.fade_in} min={0} max={Math.min(5, dur / 2)} step={0.1} color={TEAL} display={(v) => `${v.toFixed(1)}s`}
                            onStart={checkpoint} onChange={(v) => updateSong(selSong.id, { fade_in: v }, false)} />
                          <Slider label="Fade out" value={selSong.fade_out} min={0} max={Math.min(5, dur / 2)} step={0.1} color={TEAL} display={(v) => `${v.toFixed(1)}s`}
                            onStart={checkpoint} onChange={(v) => updateSong(selSong.id, { fade_out: v }, false)} />
                        </div>
                        <div className="text-[11px] text-white/45 font-mono">Plays {fmt(selSong.at)} → {fmt(Math.min(L, selSong.at + dur))} on the reel</div>
                      </div>
                    );
                  })()}
                </section>
              </>
            )}

            {tab === 'frame' && (
              <>
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-white/80">Shape</h4>
                  <Seg options={ASPECTS} value={canvas.aspect} onChange={(v) => setSection('canvas', { aspect: v })} />
                </section>
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-white/80">Fit</h4>
                  <Seg options={FITS} value={canvas.fit} onChange={(v) => setSection('canvas', { fit: v })} />
                </section>
                {canvas.fit === 'fill' && (
                  <section className="space-y-3">
                    <Slider label="Zoom" value={canvas.zoom} min={1} max={3} step={0.01} display={(v) => `${v.toFixed(2)}×`}
                      onStart={checkpoint} onChange={(v) => setSection('canvas', { zoom: v }, false)} />
                    <Slider label="Move left / right" value={canvas.pan_x} min={-1} max={1} step={0.01} display={(v) => `${Math.round(v * 100)}`}
                      onStart={checkpoint} onChange={(v) => setSection('canvas', { pan_x: v }, false)} />
                    <Slider label="Move up / down" value={canvas.pan_y} min={-1} max={1} step={0.01} display={(v) => `${Math.round(v * 100)}`}
                      onStart={checkpoint} onChange={(v) => setSection('canvas', { pan_y: v }, false)} />
                  </section>
                )}
                <section className="space-y-3">
                  <h4 className="text-xs font-semibold text-white/80">Fade from / to black</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Slider label="Start" value={video.fade_in} min={0} max={Math.min(3, L / 2)} step={0.1} display={(v) => `${v.toFixed(1)}s`}
                      onStart={checkpoint} onChange={(v) => setSection('video', { fade_in: v }, false)} />
                    <Slider label="End" value={video.fade_out} min={0} max={Math.min(3, L / 2)} step={0.1} display={(v) => `${v.toFixed(1)}s`}
                      onStart={checkpoint} onChange={(v) => setSection('video', { fade_out: v }, false)} />
                  </div>
                </section>
                <section className="space-y-1.5 text-[11px] text-white/45">
                  <p>Trim the video by dragging the gold edges of a clip. Split (S) and delete pieces to cut parts out.</p>
                  <p>Source: {reel.width}×{reel.height}, {fmt(duration)}{reel.title ? ` · ${reel.title}` : ''}</p>
                </section>
              </>
            )}

            {tab === 'color' && (
              <>
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold text-white/80">Look</h4>
                  <Seg options={LOOKS} value={LOOKS.find((l) => Object.entries(l.a).every(([k, v]) => Math.abs(adjust[k] - v) < 1e-3))?.id}
                    onChange={(id) => setSection('adjust', { ...LOOKS.find((l) => l.id === id).a })} />
                </section>
                <section className="space-y-3">
                  <Slider label="Brightness" value={adjust.brightness} min={-0.3} max={0.3} step={0.01} display={(v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`}
                    onStart={checkpoint} onChange={(v) => setSection('adjust', { brightness: v }, false)} />
                  <Slider label="Contrast" value={adjust.contrast} min={0.6} max={1.6} step={0.01} display={(v) => `${Math.round(v * 100)}%`}
                    onStart={checkpoint} onChange={(v) => setSection('adjust', { contrast: v }, false)} />
                  <Slider label="Saturation" value={adjust.saturation} min={0} max={2} step={0.01} display={(v) => `${Math.round(v * 100)}%`}
                    onStart={checkpoint} onChange={(v) => setSection('adjust', { saturation: v }, false)} />
                </section>
              </>
            )}

            {tab === 'text' && (
              <>
                <button type="button" className="btn btn-outline-gold btn-sm w-full" onClick={addText}><Plus /> Add text at playhead</button>
                {!selText && project.texts.map((t) => (
                  <button key={t.id} type="button" onClick={() => setSelected({ kind: 'text', id: t.id })}
                    className="w-full text-left rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] px-3 py-2 text-xs truncate">
                    <Type className="inline w-3.5 h-3.5 mr-1 text-[#f472b6]" /> {t.text} <span className="text-white/40">{fmt(t.start)}–{fmt(t.end)}</span>
                  </button>
                ))}
                {selText && (
                  <div className="space-y-3 rounded-xl border border-[#f472b6]/25 bg-[#f472b6]/[0.04] p-3">
                    <textarea
                      value={selText.text} rows={2} onFocus={checkpoint}
                      onChange={(e) => updateText(selText.id, { text: e.target.value }, false)}
                      className="w-full rounded-lg bg-black/30 border border-white/10 px-2.5 py-2 text-sm outline-none focus:border-[#e5a958]/60 resize-none select-text"
                    />
                    <Slider label="Size" value={selText.size} min={0.02} max={0.12} step={0.002} display={(v) => `${Math.round(v * 1000)}`}
                      onStart={checkpoint} onChange={(v) => updateText(selText.id, { size: v }, false)} />
                    <div className="flex items-center gap-1.5">
                      {TEXT_COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => updateText(selText.id, { color: c })} title={c}
                          className={`w-6 h-6 rounded-full border-2 ${selText.color === c ? 'border-[#e5a958]' : 'border-white/20'}`} style={{ background: c }} />
                      ))}
                      <button type="button" onClick={() => updateText(selText.id, { box: !selText.box })}
                        className={`ml-auto btn btn-sm ${selText.box ? 'btn-outline-gold' : 'btn-secondary'}`}>Background</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateText(selText.id, { start: Math.min(timeRef.current, selText.end - MIN_CLIP) })}>Start here</button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateText(selText.id, { end: Math.max(timeRef.current, selText.start + MIN_CLIP) })}>End here</button>
                    </div>
                    <div className="text-[11px] text-white/45 font-mono">Shows {fmt(selText.start)} → {fmt(selText.end)} · drag it on the video to place it</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* export sheet */}
      {showExport && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm" onClick={() => renderState?.status !== 'rendering' && setShowExport(false)}>
          <div className="panel rim-glow w-full max-w-md !bg-[#0f1115] p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Download className="w-4 h-4 text-[#e5a958]" /> Export reel</h3>
              {renderState?.status !== 'rendering' && <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setShowExport(false)}><X /></button>}
            </div>

            {(!renderState || ['idle', 'error', 'cancelled'].includes(renderState.status)) && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs text-white/60">Resolution</div>
                  <Seg options={[{ id: 1080, label: '1080p', sub: 'best' }, { id: 720, label: '720p', sub: 'smaller' }]}
                    value={project.export.resolution} onChange={(v) => setSection('export', { resolution: v })} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs text-white/60">Quality</div>
                  <Seg options={[{ id: 'high', label: 'High' }, { id: 'standard', label: 'Fast' }]}
                    value={project.export.quality} onChange={(v) => setSection('export', { quality: v })} />
                </div>
                {renderState?.status === 'error' && <p className="text-xs text-rose-300 break-words">{renderState.message}</p>}
                <button type="button" className="btn btn-primary w-full" onClick={exportReel}><Download /> Export {fmt(L)} reel</button>
              </div>
            )}

            {renderState?.status === 'rendering' && (
              <div className="space-y-3">
                <div className="flex justify-between text-xs"><span className="text-white/70">{renderState.message}</span><span className="font-mono text-[#e5a958]">{renderState.progress || 0}%</span></div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#e5a958] transition-all" style={{ width: `${renderState.progress || 0}%` }} /></div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={cancelExport}>Cancel</button>
              </div>
            )}

            {renderState?.status === 'done' && (
              <div className="space-y-3">
                <video src={renderState.url} controls playsInline className="w-full max-h-[40vh] rounded-lg bg-black" />
                <div className="grid grid-cols-2 gap-2">
                  <a href={renderState.download_url} className="btn btn-primary btn-sm"><Download /> Download</a>
                  <button type="button" className="btn btn-outline-teal btn-sm" onClick={shareReel}><Share2 /> Share</button>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>Caption</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={copyCaption}>{copied ? <><Check /> Copied</> : <><Copy /> Copy</>}</button>
                  </div>
                  <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
                    className="w-full rounded-lg bg-black/30 border border-white/10 px-2.5 py-2 text-xs outline-none focus:border-[#e5a958]/60 resize-none select-text" />
                </div>
                <p className="text-[11px] text-white/40">On your phone, Share opens Instagram directly. On a computer, download the reel and post it from the Instagram app or website.</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenderState({ status: 'idle' })}>Export again</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
