import React, { useEffect, useRef, useState } from 'react';
import {
  X, Mic2, Upload, Trash2, Loader2, CheckCircle2, AlertCircle, Square, Play, Pause, Info, Sparkles,
} from 'lucide-react';

/**
 * Voice Lab: record or upload your voice and train a personal model,
 * add a voice sample so Seed-VC can sing as a voice, or register an
 * RVC v2 model trained elsewhere.
 */

const PRESETS = [
  {
    id: 'quick',
    label: 'Quick',
    tagline: 'Try it out',
    record: '3–5 min of recording',
    time: 'Fastest training',
    detail: 'RVC v2 · 40 kHz · 1,000 steps',
    note: 'A rough likeness to hear how it works. Good for a first test before you record more.',
  },
  {
    id: 'standard',
    label: 'Standard',
    tagline: 'Recommended',
    record: '10 min of recording',
    time: 'About 2× Quick',
    detail: 'RVC v2 · 40 kHz · 2,000 steps',
    note: 'Sounds clearly like you on most songs. The best balance of time and quality.',
  },
  {
    id: 'best',
    label: 'Best',
    tagline: 'Closest likeness',
    record: '15–20 min of recording',
    time: 'About 4–5× Quick · GPU strongly recommended',
    detail: 'RVC v2 · 48 kHz · 4,000 steps + Seed-VC fine-tune',
    note: 'Highest fidelity (48 kHz) and also teaches the Seed-VC singing engine your voice. Worth it once you have enough clean recordings.',
  },
];

// Guided prompts: varied material trains a model that handles real songs
const PROMPTS = [
  { title: 'Read aloud', text: 'Read this at a normal pace: "The morning light came through the window, and I hummed a melody I couldn\'t quite remember. Every note felt like home."' },
  { title: 'Sing a scale', text: 'Sing slowly up and down a scale (Sa Re Ga Ma Pa Dha Ni Sa, or do re mi…), on "aa". Then once more a little higher.' },
  { title: 'Long notes', text: 'Hold three long, steady notes — low, middle and high — for about 4 seconds each.' },
  { title: 'Soft to loud', text: 'Sing one line of any song very softly, then the same line with full voice.' },
  { title: 'Your favourite chorus', text: 'Sing the chorus of a song you love, without music playing. Mistakes are fine.' },
  { title: 'Free singing', text: 'Sing anything you like across your range — this is the biggest part of your recording.' },
];

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Recorder({ takes, setTakes }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [prompt, setPrompt] = useState(0);
  const [level, setLevel] = useState(0);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(null);
  const mediaRef = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const audioRef = useRef(null);
  const secondsRef = useRef(0);

  useEffect(() => () => {
    clearInterval(timer.current);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
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
      // input level meter
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
      timer.current = setInterval(() => { secondsRef.current += 1; setSeconds(secondsRef.current); }, 1000);
      setRecording(true);
    } catch {
      setErr('Microphone access was blocked. Allow it in your browser, or upload files instead.');
    }
  };

  const stop = () => {
    clearInterval(timer.current);
    mediaRef.current?.stop();
    setRecording(false);
    setPrompt((p) => Math.min(p + 1, PROMPTS.length - 1));
  };

  const togglePlay = (i) => {
    if (playing === i) { audioRef.current?.pause(); setPlaying(null); return; }
    audioRef.current?.pause();
    audioRef.current = new Audio(takes[i].url);
    audioRef.current.onended = () => setPlaying(null);
    audioRef.current.play();
    setPlaying(i);
  };

  const total = takes.reduce((a, t) => a + t.seconds, 0);
  const target = 600;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-black/30 border border-white/10 p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-[#3fe0c5]">Prompt {prompt + 1} of {PROMPTS.length} · {PROMPTS[prompt].title}</span>
          <div className="flex gap-1">
            {PROMPTS.map((_, i) => (
              <button key={i} type="button" onClick={() => !recording && setPrompt(i)} className={`w-1.5 h-1.5 rounded-full cursor-pointer ${i === prompt ? 'bg-[#e5a958]' : 'bg-white/20'}`} aria-label={`Prompt ${i + 1}`} />
            ))}
          </div>
        </div>
        <p className="mt-2 text-sm text-white/80 leading-relaxed">{PROMPTS[prompt].text}</p>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={recording ? stop : start}
          className={`relative w-16 h-16 rounded-full grid place-items-center cursor-pointer transition ${recording ? 'bg-rose-500 text-white' : 'bg-[#e5a958] text-black hover:scale-105'}`}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
        >
          {recording && <span className="absolute inset-0 rounded-full border-2 border-rose-400 animate-ping" />}
          {recording ? <Square className="w-6 h-6 fill-white" /> : <Mic2 className="w-7 h-7" />}
        </button>
        <div className="flex-1">
          <div className="flex justify-between text-xs text-white/60 mb-1.5">
            <span>{recording ? `Recording… ${fmt(seconds)}` : takes.length ? 'Ready for the next prompt' : 'Press to record your first take'}</span>
            <span className="font-mono">{fmt(total)} / {fmt(target)}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#e5a958] to-[#3fe0c5] transition-all" style={{ width: `${Math.min(100, (total / target) * 100)}%` }} />
          </div>
          <div className="mt-2 h-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full bg-[#3fe0c5] transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
          </div>
        </div>
      </div>
      {err && <p className="text-xs text-rose-300">{err}</p>}

      {takes.length > 0 && (
        <div className="space-y-1.5">
          {takes.map((t, i) => (
            <div key={t.url} className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm">
              <button type="button" onClick={() => togglePlay(i)} className="text-white/70 hover:text-white cursor-pointer" aria-label="Play take">
                {playing === i ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <span className="flex-1 truncate">Take {i + 1} · {t.title}</span>
              <span className="font-mono text-xs text-white/45">{fmt(t.seconds)}</span>
              <button type="button" onClick={() => setTakes((ts) => ts.filter((_, k) => k !== i))} className="text-white/40 hover:text-rose-300 cursor-pointer" aria-label="Delete take">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VoiceLab({ open, onClose, voices, onVoicesChanged }) {
  const [name, setName] = useState('My Voice');
  const [source, setSource] = useState('record'); // record | upload
  const [files, setFiles] = useState([]);
  const [takes, setTakes] = useState([]);
  const [preset, setPreset] = useState('standard');
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
    if (!recordings.length) { setError(source === 'record' ? 'Record at least one take first.' : 'Add at least one recording.'); return; }
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
      onVoicesChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    setError('');
    if (!pth) { setError('Choose a .pth model file.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('name', uploadName || pth.name.replace(/\.pth$/, ''));
      fd.append('model_file', pth);
      if (idx) fd.append('index_file', idx);
      const res = await fetch('/api/voices/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Upload failed');
      setPth(null); setIdx(null); setUploadName('');
      onVoicesChanged();
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
    onVoicesChanged();
  };

  const singers = [['arijit_singh', 'Arijit Singh'], ['sonu_nigam', 'Sonu Nigam'], ['kk', 'KK']];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0e1013] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0e1013]/95 backdrop-blur">
          <div>
            <h2 className="font-display text-xl">Voice Lab</h2>
            <p className="text-xs text-white/50">Teach Lyra your voice, so it can sing as you — in tune.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-8">
          {(voices || []).length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-white/85">Your voices</h3>
              {voices.map((v) => {
                const eng = engineInfo?.voices?.[v.id];
                return (
                  <div key={v.id} className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-3">
                    {v.status === 'ready' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      : v.status === 'error' ? <AlertCircle className="w-4 h-4 text-rose-400" />
                        : <Loader2 className="w-4 h-4 animate-spin text-[#e5a958]" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{v.name}</div>
                      <div className="text-[11px] text-white/45 truncate">
                        {v.status === 'ready'
                          ? `Ready · ${v.preset ? `${v.preset} · ` : ''}${v.sample_rate ? `${v.sample_rate / 1000} kHz · ` : ''}${v.trained_minutes ? `${v.trained_minutes} min` : ''}${eng ? ` · sings with ${eng.label}` : ''}`
                          : v.message || v.status}
                      </div>
                      {['training', 'queued'].includes(v.status) && (
                        <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full bg-[#e5a958] transition-all" style={{ width: `${v.progress || 0}%` }} />
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => remove(v.id)} className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-rose-300 cursor-pointer" aria-label={`Delete ${v.name}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </section>
          )}

          {/* Train */}
          <section className="space-y-5">
            <h3 className="font-display text-lg">Train a new voice</h3>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Voice name" className="w-full bg-[#171a20] border border-white/10 rounded-lg px-3 py-2.5 text-sm" />

            <div className="inline-flex rounded-full border border-white/10 p-1 text-sm">
              {[['record', Mic2, 'Record here'], ['upload', Upload, 'Upload files']].map(([v, Icon, label]) => (
                <button key={v} type="button" onClick={() => setSource(v)} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full cursor-pointer transition ${source === v ? 'bg-[#e5a958] text-black font-semibold' : 'text-white/65 hover:text-white'}`}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            {source === 'record' ? (
              <Recorder takes={takes} setTakes={setTakes} />
            ) : (
              <>
                <button type="button" onClick={() => recInput.current?.click()} className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-6 text-sm text-white/70 hover:border-[#e5a958]/60 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {files.length ? `${files.length} recording${files.length > 1 ? 's' : ''} · ${(files.reduce((a, f) => a + f.size, 0) / 1e6).toFixed(1)} MB` : 'Choose recordings (WAV/MP3/M4A)'}
                </button>
                <input ref={recInput} type="file" accept="audio/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
              </>
            )}
            <p className="text-[11px] text-white/45 flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Quiet room, same distance from the mic, no music playing, headphones off your ears.</p>

            {/* Smart Auto Adaptive Training */}
            <div className="rounded-2xl border border-[#3fe0c5]/25 bg-[#3fe0c5]/[0.06] p-4 text-xs text-white/75 leading-relaxed">
              <div className="flex items-center gap-2 text-[#3fe0c5] font-semibold text-sm mb-1.5">
                <Sparkles className="w-4 h-4" /> Smart Auto-Tuned Training (Fastest)
              </div>
              <p className="text-white/60 leading-relaxed">
                Automatically tunes training steps to your audio duration for maximum likeness in minutes with zero overheating.
              </p>
              {minutes !== null && minutes > 0 ? (
                <div className="mt-3 p-2.5 rounded-xl bg-black/30 border border-white/10 text-white/90 text-xs flex items-center justify-between">
                  <span>Recorded audio: <b>{minutes.toFixed(1)} min</b></span>
                  <span className="text-[#3fe0c5] font-semibold">
                    {minutes <= 1.5 ? '⚡ ~2.5 mins (180 steps)' : minutes <= 3.5 ? '⚡ ~3.5 mins (240 steps)' : minutes <= 7 ? '⚡ ~4.5 mins (320 steps)' : '⚡ ~6 mins (450 steps)'}
                  </span>
                </div>
              ) : files.length > 0 ? (
                <div className="mt-3 p-2.5 rounded-xl bg-black/30 border border-white/10 text-white/90 text-xs flex items-center justify-between">
                  <span>Selected files: <b>{files.length}</b></span>
                  <span className="text-[#3fe0c5] font-semibold">⚡ Auto-calculated on start</span>
                </div>
              ) : null}
              <div className="mt-2.5 text-[11px] text-white/50">
                Both RVC v2 and Seed-VC engines are built automatically for your voice.
              </div>
            </div>

            <button type="button" disabled={busy || training} onClick={train} className="w-full rounded-full bg-[#e5a958] text-black font-semibold py-3.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#f0bb6e] transition">
              {training ? 'A voice is training…' : busy ? 'Uploading…' : 'Start Fast Voice Training'}
            </button>
          </section>

          {/* Voice samples for Seed-VC */}
          <details className="group rounded-2xl border border-white/10">
            <summary className="list-none flex items-center justify-between px-5 py-3.5 cursor-pointer text-sm text-white/60 hover:text-white">
              Voice samples for the Seed-VC singing engine
              <span className="text-white/40 transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="px-5 pb-5 space-y-3">
              <p className="text-xs text-white/50">
                Seed-VC sings as a voice from a 10–30 second <b>dry, solo</b> clip (no music, no reverb). Add one for a built-in voice to let it use Seed-VC.
                {engineInfo && !engineInfo.seedvc_installed && <span className="block mt-1 text-amber-300/80">Seed-VC isn't installed on this server yet — run backend/tools/setup_seedvc.sh.</span>}
              </p>
              {singers.map(([id, label]) => {
                const has = engineInfo?.voices?.[id]?.available?.seedvc;
                return (
                  <label key={id} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-2.5 text-sm cursor-pointer hover:border-white/25">
                    <span>{label} <span className="text-[11px] text-white/45">· {has ? 'sample added' : 'no sample yet'}</span></span>
                    <span className="text-xs text-[#e5a958]">Upload clip</span>
                    <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadSample(id, e.target.files[0])} />
                  </label>
                );
              })}
              {sampleMsg && <p className="text-xs text-white/60">{sampleMsg}</p>}
            </div>
          </details>

          {/* Upload */}
          <details className="group rounded-2xl border border-white/10">
            <summary className="list-none flex items-center justify-between px-5 py-3.5 cursor-pointer text-sm text-white/60 hover:text-white">
              Already have an RVC v2 model?
              <span className="text-white/40 transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="px-5 pb-5 space-y-3">
              <input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="Voice name" className="w-full bg-[#171a20] border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                <label className="rounded-lg border border-white/10 px-3 py-2.5 cursor-pointer hover:border-white/30 truncate">
                  {pth ? pth.name : 'Model (.pth)'}
                  <input type="file" accept=".pth" className="hidden" onChange={(e) => setPth(e.target.files?.[0] || null)} />
                </label>
                <label className="rounded-lg border border-white/10 px-3 py-2.5 cursor-pointer hover:border-white/30 truncate">
                  {idx ? idx.name : 'Index (.index, optional)'}
                  <input type="file" accept=".index" className="hidden" onChange={(e) => setIdx(e.target.files?.[0] || null)} />
                </label>
              </div>
              <button type="button" disabled={busy} onClick={upload} className="w-full rounded-full border border-white/20 py-2.5 text-sm hover:border-white/40 cursor-pointer disabled:opacity-40">Add model</button>
            </div>
          </details>

          {error && <p className="text-sm text-rose-300">{error}</p>}
        </div>
      </div>
    </div>
  );
}
