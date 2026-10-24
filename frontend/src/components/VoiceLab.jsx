import React, { useEffect, useRef, useState } from 'react';
import {
  X, Mic2, Upload, Trash2, Loader2, CheckCircle2, AlertCircle, Square, Play, Pause, Info, Sparkles,
  ArrowLeft, ArrowDown, ChevronRight, Sliders, Volume2, HelpCircle
} from 'lucide-react';

/**
 * Voice Lab: Record or upload voice samples and train a personalized model.
 * Supports both embedded full-page view inside Studio Workspace and modal overlay.
 */

// Guided prompts: varied vocal material to train a rich singing model
const PROMPTS = [
  {
    title: 'Natural Speaking & Story',
    text: 'Read this at a steady, expressive pace:\n"The morning light came through the studio window, and I hummed a quiet melody I could not quite forget. Every warm note felt like stepping onto an open stage, surrounded by gentle reverberation and acoustic clarity."',
    suggestion: 'Speak naturally as if talking to a friend. Do not rush.',
  },
  {
    title: 'Vocal Scale (Sa Re Ga Ma / Do Re Mi)',
    text: 'Sing smoothly up and down the scale:\n"Sa — Re — Ga — Ma — Pa — Dha — Ni — Saa"\n(or Do — Re — Mi — Fa — Sol — La — Ti — Do)\nHold each pitch for one second, then glide down.',
    suggestion: 'Focus on pure tone without vibrato first, then repeat with gentle vibrato.',
  },
  {
    title: 'Sustained Pure Vowels',
    text: 'Sing and sustain each vowel steadily on a comfortable mid-pitch for 4 seconds each:\n"Aaaaah... (4s)"\n"Eeeeeh... (4s)"\n"Oooooh... (4s)"\n"Uuuuuh... (4s)"',
    suggestion: 'Keep your airflow even. Avoid throat tension.',
  },
  {
    title: 'Soft Whispers to Full Belt',
    text: 'Sing one line very softly and breathy:\n"Underneath the quiet midnight sky..."\nNow sing the same line with your full chest voice and projection:\n"UNDERNEATH THE QUIET MIDNIGHT SKY!"',
    suggestion: 'This teaches the neural network your entire dynamic range from whisper to belt.',
  },
  {
    title: 'Favourite Song Chorus',
    text: 'Sing 30 to 45 seconds of any song you love in your native language (Hindi, Urdu, English, Punjabi, etc.) acapella without background music.',
    suggestion: 'Mistakes and breath pauses are completely fine! Natural phrasing trains best.',
  },
  {
    title: 'Free Singing & High Range',
    text: 'Sing anything you enjoy exploring your higher register, melodic runs (harkats, meend, or falsetto). Take deep breaths and have fun.',
    suggestion: 'Singing with emotion gives your AI model authentic character.',
  },
];

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Recorder({ takes, setTakes }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [prompt, setPrompt] = useState(0);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollSpeed, setScrollSpeed] = useState('normal'); // 'slow' | 'normal' | 'fast'

  const mediaRef = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const audioRef = useRef(null);
  const secondsRef = useRef(0);
  const teleprompterRef = useRef(null);
  const scrollIntervalRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timer.current);
    clearInterval(scrollIntervalRef.current);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Smooth dynamic auto-scrolling teleprompter effect while recording
  useEffect(() => {
    if (recording && autoScroll && teleprompterRef.current) {
      const step = scrollSpeed === 'slow' ? 0.6 : scrollSpeed === 'fast' ? 1.6 : 1.0;
      scrollIntervalRef.current = setInterval(() => {
        if (teleprompterRef.current) {
          teleprompterRef.current.scrollTop += step;
        }
      }, 50);
    } else {
      clearInterval(scrollIntervalRef.current);
    }
    return () => clearInterval(scrollIntervalRef.current);
  }, [recording, autoScroll, scrollSpeed]);

  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        const ext = (rec.mimeType || '').includes('ogg') ? 'ogg' : (rec.mimeType || '').includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `take_${Date.now()}.${ext}`, { type: blob.type });
        setTakes((t) => [...t, { file, url: URL.createObjectURL(blob), seconds: secondsRef.current, title: PROMPTS[prompt].title }]);
        stream.getTracks().forEach((t) => t.stop());
        cancelAnimationFrame(rafRef.current);
        setLevel(0);
      };

      // Realtime level meter
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const meter = () => {
        an.getFloatTimeDomainData(buf);
        setLevel(Math.min(1, Math.sqrt(buf.reduce((a, v) => a + v * v, 0) / buf.length) * 6));
        rafRef.current = requestAnimationFrame(meter);
      };
      meter();

      mediaRef.current = rec;
      rec.start(1000);
      setSeconds(0);
      secondsRef.current = 0;
      timer.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
      setRecording(true);

      // Reset scroll position to top
      if (teleprompterRef.current) {
        teleprompterRef.current.scrollTop = 0;
      }
    } catch {
      setErr('Microphone access was blocked. Please enable microphone permissions in your browser.');
    }
  };

  const stop = () => {
    clearInterval(timer.current);
    clearInterval(scrollIntervalRef.current);
    mediaRef.current?.stop();
    setRecording(false);
    setPrompt((p) => Math.min(p + 1, PROMPTS.length - 1));
  };

  const togglePlay = (i) => {
    if (playing === i) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    audioRef.current = new Audio(takes[i].url);
    audioRef.current.onended = () => setPlaying(null);
    audioRef.current.play();
    setPlaying(i);
  };

  const total = takes.reduce((a, t) => a + t.seconds, 0);
  const target = 300; // 5 mins recommended for smart auto-training

  return (
    <div className="space-y-5">
      {/* Dynamic Reading Teleprompter with Scroll Suggestions */}
      <div className="rounded-2xl bg-black/50 border border-white/10 p-5 shadow-inner">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-mono text-[#3fe0c5]">
              Prompt {prompt + 1} of {PROMPTS.length} • {PROMPTS[prompt].title}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Auto-Scroll Toggle */}
            <div className="flex items-center gap-1.5 text-xs text-white/60">
              <button
                type="button"
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono border cursor-pointer transition ${
                  autoScroll ? 'bg-[#3fe0c5]/15 border-[#3fe0c5]/40 text-[#3fe0c5]' : 'bg-white/5 border-white/10 text-white/40'
                }`}
              >
                {autoScroll ? '⚡ Auto-Scroll Active' : 'Auto-Scroll Off'}
              </button>

              {autoScroll && (
                <div className="flex gap-1 text-[10px] font-mono">
                  {['slow', 'normal', 'fast'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScrollSpeed(s)}
                      className={`px-1.5 py-0.5 rounded cursor-pointer ${
                        scrollSpeed === s ? 'bg-[#e5a958] text-black font-bold' : 'text-white/40 hover:text-white'
                      }`}
                    >
                      {s[0].toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Prompt navigation dots */}
            <div className="flex gap-1">
              {PROMPTS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => !recording && setPrompt(i)}
                  className={`w-2 h-2 rounded-full cursor-pointer transition ${
                    i === prompt ? 'bg-[#e5a958] scale-125' : 'bg-white/20 hover:bg-white/40'
                  }`}
                  aria-label={`Prompt ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Teleprompter Content Area */}
        <div
          ref={teleprompterRef}
          className="mt-4 max-h-44 overflow-y-auto pr-2 space-y-3 scroll-smooth"
          style={{ scrollbarWidth: 'thin' }}
        >
          <p className="text-base sm:text-lg text-white/90 font-medium leading-relaxed whitespace-pre-line">
            {PROMPTS[prompt].text}
          </p>
        </div>

        {/* Dynamic Scrolling & Breath Suggestion Banner */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-white/50">
          <div className="flex items-center gap-1.5 text-[#e5a958]">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span><b>Scroll Suggestion:</b> {PROMPTS[prompt].suggestion}</span>
          </div>
          <span className="hidden sm:inline font-mono text-[10px] text-white/40">Mic Distance: 3–5 inches</span>
        </div>
      </div>

      {/* Recording Control & Level Meter */}
      <div className="flex items-center gap-4 bg-white/[0.02] border border-white/10 rounded-2xl p-4">
        <button
          type="button"
          onClick={recording ? stop : start}
          className={`relative w-16 h-16 rounded-full grid place-items-center cursor-pointer transition-all shadow-xl flex-shrink-0 ${
            recording
              ? 'bg-rose-500 text-white scale-105 shadow-[0_0_25px_rgba(244,63,94,0.5)]'
              : 'bg-[#e5a958] text-black hover:scale-105 shadow-[0_0_20px_rgba(229,169,88,0.4)]'
          }`}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
        >
          {recording && <span className="absolute inset-0 rounded-full border-2 border-rose-400 animate-ping" />}
          {recording ? <Square className="w-6 h-6 fill-white" /> : <Mic2 className="w-7 h-7" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between text-xs text-white/70 mb-1.5">
            <span className="font-medium truncate">
              {recording ? `Recording Take… ${fmt(seconds)}` : takes.length ? 'Ready for next prompt' : 'Hit record and read prompt aloud'}
            </span>
            <span className="font-mono text-white/50">{fmt(total)} / {fmt(target)} recommended</span>
          </div>

          {/* Progress towards training threshold */}
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#e5a958] to-[#3fe0c5] transition-all duration-300"
              style={{ width: `${Math.min(100, (total / target) * 100)}%` }}
            />
          </div>

          {/* Live Audio Level Meter */}
          <div className="mt-2 h-1.5 rounded-full bg-black/40 overflow-hidden border border-white/5">
            <div
              className="h-full bg-[#3fe0c5] transition-[width] duration-75 shadow-[0_0_8px_#3fe0c5]"
              style={{ width: `${level * 100}%` }}
            />
          </div>
        </div>
      </div>

      {err && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* Recorded Takes List */}
      {takes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-white/70 flex items-center justify-between">
            <span>Recorded Vocal Takes ({takes.length})</span>
            <span className="font-mono text-[11px] text-[#3fe0c5]">Total: {fmt(total)}</span>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
            {takes.map((t, i) => (
              <div key={t.url} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => togglePlay(i)}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 grid place-items-center text-white cursor-pointer"
                  aria-label="Play take"
                >
                  {playing === i ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-xs font-medium text-white">Take {i + 1} • {t.title}</div>
                </div>
                <span className="font-mono text-xs text-white/45">{fmt(t.seconds)}</span>
                <button
                  type="button"
                  onClick={() => setTakes((ts) => ts.filter((_, k) => k !== i))}
                  className="p-1 rounded text-white/40 hover:text-rose-300 cursor-pointer"
                  aria-label="Delete take"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VoiceLab({ open = true, onClose, voices = [], onVoicesChanged, embedded = false }) {
  const [name, setName] = useState('My Voice');
  const [source, setSource] = useState('record'); // 'record' | 'upload'
  const [files, setFiles] = useState([]);
  const [takes, setTakes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [pth, setPth] = useState(null);
  const [idx, setIdx] = useState(null);
  const [engineInfo, setEngineInfo] = useState(null);
  const [sampleMsg, setSampleMsg] = useState('');
  const recInput = useRef(null);

  const training = (voices || []).some((v) => ['queued', 'training', 'pending'].includes(v.status));

  useEffect(() => {
    if (!open || !training) return undefined;
    const id = setInterval(onVoicesChanged, 1500);
    return () => clearInterval(id);
  }, [open, training, onVoicesChanged]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/engines').then((r) => (r.ok ? r.json() : null)).then(setEngineInfo).catch(() => {});
  }, [open, voices]);

  if (!open) return null;

  const recordings = source === 'record' ? takes.map((t) => t.file) : files;
  const minutes = source === 'record' ? takes.reduce((a, t) => a + t.seconds, 0) / 60 : null;

  const train = async () => {
    setError('');
    if (!recordings.length) {
      setError(source === 'record' ? 'Record at least one vocal take first.' : 'Add at least one clean audio file.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', name || 'My Voice');
      fd.append('preset', 'auto');
      recordings.forEach((f) => fd.append('recordings', f));
      const res = await fetch('/api/voices/train', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Training request failed');
      setFiles([]);
      setTakes([]);
      onVoicesChanged && onVoicesChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    setError('');
    if (!pth) {
      setError('Choose a .pth model file.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', uploadName || pth.name.replace(/\.pth$/, ''));
      fd.append('model_file', pth);
      if (idx) fd.append('index_file', idx);
      const res = await fetch('/api/voices/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Upload failed');
      setPth(null);
      setIdx(null);
      setUploadName('');
      onVoicesChanged && onVoicesChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadSample = async (voiceId, file) => {
    setSampleMsg('');
    const fd = new FormData();
    fd.append('sample', file);
    const res = await fetch(`/api/models/${voiceId}/reference`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    setSampleMsg(res.ok ? 'Voice sample saved — Seed-VC can now sing as this voice.' : data.detail || 'Upload failed');
    fetch('/api/engines').then((r) => r.json()).then(setEngineInfo).catch(() => {});
  };

  const remove = async (id) => {
    await fetch(`/api/voices/${id}`, { method: 'DELETE' });
    onVoicesChanged && onVoicesChanged();
  };

  const singers = [['arijit_singh', 'Arijit Singh'], ['sonu_nigam', 'Sonu Nigam'], ['kk', 'KK']];

  // Core Content of the Voice Lab
  const content = (
    <div className="space-y-8">
      {/* Existing Personal Voices Manager */}
      {(voices || []).length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Your Trained Models ({voices.length})
            </h3>
            <span className="text-xs text-[#3fe0c5] font-mono">Ready for Studio Inference</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {voices.map((v) => {
              const eng = engineInfo?.voices?.[v.id];
              return (
                <div key={v.id} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-sm">
                  {v.status === 'ready' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : v.status === 'error' ? (
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  ) : (
                    <Loader2 className="w-5 h-5 animate-spin text-[#e5a958] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{v.name}</div>
                    <div className="text-[11px] text-white/50 truncate mt-0.5">
                      {v.status === 'ready'
                        ? `Ready • ${v.sample_rate ? `${v.sample_rate / 1000} kHz • ` : ''}${v.trained_minutes ? `${v.trained_minutes} min • ` : ''}${eng ? eng.label : 'RVC v2'}`
                        : v.message || v.status}
                    </div>
                    {['training', 'queued'].includes(v.status) && (
                      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-[#e5a958] transition-all" style={{ width: `${v.progress || 0}%` }} />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(v.id)}
                    className="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-rose-300 transition cursor-pointer"
                    aria-label={`Delete ${v.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Training Section */}
      <section className="space-y-6 rounded-3xl border border-white/10 bg-black/40 p-6 sm:p-8">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Train a New Personal Voice Model
          </h3>
          <p className="text-xs sm:text-sm text-white/60 mt-1">
            Lyra automatically generates both an <b>RVC v2</b> model and a <b>Seed-VC 44.1kHz</b> voice clone for your persona.
          </p>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase text-white/50 mb-2">Voice Model Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Singing Voice, Harman Studio..."
            className="w-full bg-[#171a20] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#e5a958]"
          />
        </div>

        {/* Source Toggle */}
        <div className="inline-flex rounded-2xl border border-white/10 p-1 bg-white/[0.02]">
          {[
            ['record', Mic2, 'Record with Guided Teleprompter'],
            ['upload', Upload, 'Upload Clean Audio Files'],
          ].map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setSource(v)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition ${
                source === v ? 'bg-[#e5a958] text-black shadow-md' : 'text-white/65 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {source === 'record' ? (
          <Recorder takes={takes} setTakes={setTakes} />
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => recInput.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/20 p-8 text-sm text-white/70 hover:border-[#e5a958]/60 hover:bg-white/[0.02] cursor-pointer transition"
            >
              <Upload className="w-8 h-8 text-[#e5a958]" />
              <span className="font-semibold text-white">
                {files.length ? `${files.length} audio file${files.length > 1 ? 's' : ''} selected (${(files.reduce((a, f) => a + f.size, 0) / 1e6).toFixed(1)} MB)` : 'Drop or Choose Voice Recordings (WAV, MP3, M4A)'}
              </span>
              <span className="text-xs text-white/40">Clean, dry audio without backing music works best</span>
            </button>
            <input
              ref={recInput}
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </div>
        )}

        {/* Smart Auto Adaptive Training Banner */}
        <div className="rounded-2xl border border-[#3fe0c5]/25 bg-[#3fe0c5]/[0.05] p-4 text-xs text-white/80 leading-relaxed">
          <div className="flex items-center gap-2 text-[#3fe0c5] font-semibold text-sm mb-1">
            <Sparkles className="w-4 h-4" /> Smart Auto-Tuned Training (Zero Overheating)
          </div>
          <p className="text-white/60">
            Lyra computes optimal training epochs based on your total audio duration, maximizing voice resemblance in minutes.
          </p>
          {minutes !== null && minutes > 0 ? (
            <div className="mt-3 p-3 rounded-xl bg-black/40 border border-white/10 text-white/90 text-xs flex items-center justify-between">
              <span>Total Recorded Audio: <b>{minutes.toFixed(1)} mins</b></span>
              <span className="text-[#3fe0c5] font-bold">
                {minutes <= 1.5 ? '⚡ ~2.5 mins (180 steps)' : minutes <= 3.5 ? '⚡ ~3.5 mins (240 steps)' : minutes <= 7 ? '⚡ ~4.5 mins (320 steps)' : '⚡ ~6 mins (450 steps)'}
              </span>
            </div>
          ) : files.length > 0 ? (
            <div className="mt-3 p-3 rounded-xl bg-black/40 border border-white/10 text-white/90 text-xs flex items-center justify-between">
              <span>Selected Recordings: <b>{files.length}</b></span>
              <span className="text-[#3fe0c5] font-bold">⚡ Auto-calculated on start</span>
            </div>
          ) : null}
        </div>

        {/* Start Training Button */}
        <button
          type="button"
          disabled={busy || training}
          onClick={train}
          className="w-full rounded-full bg-gradient-to-r from-[#e5a958] to-[#f5ba6e] text-black font-bold py-4 text-base cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_30px_rgba(229,169,88,0.4)] transition"
        >
          {training ? 'A voice model is currently training…' : busy ? 'Uploading voice recordings…' : 'Start Fast Voice Training'}
        </button>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* Advanced Seed-VC Reference Clip & RVC Import Collapsibles */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Seed-VC 20s Sample Clip */}
        <details className="group rounded-2xl border border-white/10 bg-white/[0.02]">
          <summary className="list-none flex items-center justify-between px-5 py-4 cursor-pointer text-sm font-semibold text-white/80 hover:text-white">
            <span>Add Seed-VC Reference Clip</span>
            <span className="text-white/40 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="px-5 pb-5 space-y-3">
            <p className="text-xs text-white/50 leading-relaxed">
              Seed-VC sings from a 15–30s dry solo clip (no background music). Add one for an artist to enable Seed-VC.
            </p>
            {singers.map(([id, label]) => {
              const has = engineInfo?.voices?.[id]?.available?.seedvc;
              return (
                <label key={id} className="flex items-center justify-between rounded-xl border border-white/10 px-3.5 py-2.5 text-xs cursor-pointer hover:border-white/25">
                  <span>{label} <span className="text-[10px] text-white/45">• {has ? 'sample ready' : 'no sample yet'}</span></span>
                  <span className="text-xs font-semibold text-[#e5a958]">Upload Clip</span>
                  <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadSample(id, e.target.files[0])} />
                </label>
              );
            })}
            {sampleMsg && <p className="text-xs text-[#3fe0c5]">{sampleMsg}</p>}
          </div>
        </details>

        {/* Existing Pre-Trained RVC v2 Model (.pth/.index) Import */}
        <details className="group rounded-2xl border border-white/10 bg-white/[0.02]">
          <summary className="list-none flex items-center justify-between px-5 py-4 cursor-pointer text-sm font-semibold text-white/80 hover:text-white">
            <span>Import Existing RVC Model (.pth)</span>
            <span className="text-white/40 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="px-5 pb-5 space-y-3">
            <input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="Model persona name"
              className="w-full bg-[#171a20] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
            />
            <div className="grid sm:grid-cols-2 gap-2 text-xs">
              <label className="rounded-xl border border-white/10 px-3 py-2 cursor-pointer hover:border-white/30 truncate block text-white/70">
                {pth ? pth.name : 'Choose .pth file'}
                <input type="file" accept=".pth" className="hidden" onChange={(e) => setPth(e.target.files?.[0] || null)} />
              </label>
              <label className="rounded-xl border border-white/10 px-3 py-2 cursor-pointer hover:border-white/30 truncate block text-white/70">
                {idx ? idx.name : 'Choose .index file'}
                <input type="file" accept=".index" className="hidden" onChange={(e) => setIdx(e.target.files?.[0] || null)} />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={upload}
              className="w-full rounded-xl border border-white/20 py-2 text-xs font-semibold text-white hover:border-[#e5a958] cursor-pointer disabled:opacity-40 transition"
            >
              Add Pre-Trained Model
            </button>
          </div>
        </details>
      </div>
    </div>
  );

  // Embedded Full-Page View inside Studio
  if (embedded) {
    return (
      <div className="w-full max-w-5xl mx-auto space-y-6 animate-fadeIn py-2 sm:py-4">
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
                  title="Return to Studio Workspace"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                Personal Voice Training Lab
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-white/50 pl-1">
              Teach Lyra your vocal timbre and tone. Create personal models that sing in-key with studio fidelity.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-mono text-emerald-400 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              MPS Metal Ready
            </span>
          </div>
        </div>

        {content}
      </div>
    );
  }

  // Modal Fallback
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0e1013] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0e1013]/95 backdrop-blur">
          <div>
            <h2 className="font-display text-xl text-white">Voice Lab</h2>
            <p className="text-xs text-white/50">Teach Lyra your voice, so it can sing as you — in tune.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        <div className="p-6">
          {content}
        </div>
      </div>
    </div>
  );
}
