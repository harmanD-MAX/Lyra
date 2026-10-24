import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import LyraLogo from './LyraLogo';
import {
  Compass, Music2, Play, Pause,
  Download, Volume2, VolumeX, ArrowRight,
  Sparkles, Mic, Upload, Link as LinkIcon, RotateCcw, RotateCw,
  Sliders, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Disc, Loader2, X, RefreshCw,
  PlusCircle, Trash2, Check, Cloud, Headphones,
  Cpu, HardDrive, Layers, FileAudio, Square, User, Zap, Waves
} from 'lucide-react';
import ProcessingStatus from './ProcessingStatus';
import ComposerTools from './ComposerTools';
import VoiceRing from './VoiceRing';
import { decodeTrack, createAnalyser } from './audio/spectrum';

const GOLD = '#e5a958';
const TEAL = '#3fe0c5';

const SINGERS = [
  { id: 'arijit_singh', name: 'Arijit Singh', vibe: 'Soulful · warm', initials: 'AS', color: GOLD },
  { id: 'sonu_nigam', name: 'Sonu Nigam', vibe: 'Classical · bright', initials: 'SN', color: TEAL },
  { id: 'kk', name: 'KK', vibe: 'Rock · power', initials: 'KK', color: '#f472b6' },
];

const STEMS = [
  { id: 'master', label: 'Master 3D', hint: 'Full 3D spatial remaster' },
  { id: 'vocal_arijit', label: 'Solo vocal', hint: 'Converted vocal only' },
  { id: 'instrumental', label: 'Instrumental', hint: 'Isolated backing track' },
  { id: 'vocal_original', label: 'Original', hint: 'Your original input vocal' },
];

const WAVE = [
  18, 25, 34, 48, 65, 82, 54, 38, 50, 72, 90, 98, 76, 58, 42, 55, 78, 88, 95, 80,
  62, 45, 60, 82, 96, 74, 52, 36, 50, 70, 85, 92, 70, 54, 38, 48, 68, 85, 92, 78,
  58, 42, 55, 75, 88, 96, 82, 64, 48, 62, 80, 94, 72, 52, 38, 50, 68, 84, 90, 75,
  56, 40, 52, 72, 88, 95, 80, 62, 46, 60, 78, 92, 70, 50, 36, 48, 66, 82, 90, 74,
  54, 38, 50, 70, 88, 98, 80, 60, 42, 56, 76, 92, 68, 48, 34, 46, 64, 80, 92, 76,
  52, 36, 48, 68, 86, 94, 78, 58, 40, 28, 20, 14,
];

const hexToRgb = (hex) => {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** Strip YouTube boilerplate from a track title. */
function cleanTitle(title, fallback = 'Studio Vocal Project') {
  let t = title || '';
  t = t.replace(/#[\w\d_-]+/gi, '');
  t = t.replace(/\|\s*Fan Farmayish[\w\s|]*/gi, '');
  t = t.replace(/\|.*$/g, '');
  t = t.replace(/-\s*Topic/gi, '');
  return t.trim() || fallback;
}

/** Range input whose track fills up to the current value. */
function FillRange({ value, min = 0, max = 1, step = 0.01, onChange, color = GOLD, className = '', ...rest }) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className={`lyra-range w-full cursor-pointer ${className}`}
      style={{ background: `linear-gradient(90deg, ${color} ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
      {...rest}
    />
  );
}

/** Live microphone level bars, drawn from an AnalyserNode. */
function LiveMeter({ analyser, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const data = analyser ? new Uint8Array(analyser.fftSize) : null;
    const bars = 48;
    const hist = new Array(bars).fill(0.04);
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let level = 0.04 + Math.random() * 0.03;
      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        level = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
      }
      hist.shift();
      hist.push(Math.max(0.04, level));
      ctx.clearRect(0, 0, w, h);
      const bw = w / bars;
      hist.forEach((v, i) => {
        const bh = Math.max(3, v * h * 0.95);
        const a = 0.25 + 0.75 * (i / bars);
        const grad = ctx.createLinearGradient(0, h / 2 - bh / 2, 0, h / 2 + bh / 2);
        grad.addColorStop(0, `rgba(251,113,133,${a})`);
        grad.addColorStop(1, `rgba(229,169,88,${a})`);
        ctx.fillStyle = grad;
        const x = i * bw + bw * 0.25;
        const r = Math.min(bw * 0.25, 2);
        ctx.beginPath();
        ctx.roundRect(x, h / 2 - bh / 2, bw * 0.5, bh, r);
        ctx.fill();
      });
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

/** Compact preview transport used for recorded / uploaded takes. */
function PreviewPlayer({ playing, onToggle, time, duration, onSeek, formatTime }) {
  return (
    <div className="flex items-center gap-3 panel-inset px-3 py-2.5">
      <button type="button" onClick={onToggle} className="btn btn-primary btn-sm btn-icon" title={playing ? 'Pause preview' : 'Play preview'}>
        {playing ? <Pause className="fill-current" /> : <Play className="fill-current ml-0.5" />}
      </button>
      <span className={`eq-loader text-[#e5a958] ${playing ? '' : 'is-paused'}`}><span /><span /><span /></span>
      <FillRange value={time} min={0} max={duration || 1} step={0.05} onChange={onSeek} />
      <span className="text-[11px] font-mono text-white/55 shrink-0 tabular-nums">{formatTime(time)} / {formatTime(duration)}</span>
    </div>
  );
}

/** Fixed Notes vs Raw switch shown once a take is loaded. */
function PitchCompare({ mode, onSelect, tuning, hasTuned, rawLabel, RawIcon }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div className="seg">
        <button type="button" className="seg-item" data-active={mode === 'tuned'} data-tone="gold" onClick={() => onSelect('tuned')} disabled={tuning && !hasTuned}>
          {tuning && !hasTuned ? <Loader2 className="animate-spin" /> : <Sparkles />} Fixed notes
        </button>
        <button type="button" className="seg-item" data-active={mode === 'raw'} onClick={() => onSelect('raw')}>
          <RawIcon /> {rawLabel}
        </button>
      </div>
      <span className="text-[11px] text-white/45 font-mono flex items-center gap-1.5">
        {tuning ? <span className="eq-loader text-[#e5a958] !h-3"><span /><span /><span /></span> : <span className="w-1.5 h-1.5 rounded-full bg-[#e5a958]" />}
        {tuning ? 'Tuning your take…' : mode === 'tuned' ? 'Notes snapped to the scale' : 'Untouched original'}
      </span>
    </div>
  );
}

/** Upload illustration for the empty drop zone. */
function DropArt({ active }) {
  return (
    <svg viewBox="0 0 120 84" className="w-40 h-28 shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="drop-g" x1="0" x2="1">
          <stop offset="0%" stopColor={GOLD} />
          <stop offset="100%" stopColor={TEAL} />
        </linearGradient>
      </defs>
      <rect x="22" y="10" width="76" height="64" rx="12" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
        const h = [10, 18, 28, 20, 34, 24, 30, 16, 26, 14, 8][i];
        return <rect key={i} x={31 + i * 5.6} y={52 - h / 2} width="3" height={h} rx="1.5" fill="url(#drop-g)" opacity={0.35 + (i % 3) * 0.2} />;
      })}
      <g className={active ? '' : 'svg-float'}>
        <circle cx="60" cy="24" r="11" fill="#15171c" stroke={GOLD} />
        <path d="M60 29 V19 M55.5 23 L60 18.5 L64.5 23" stroke={GOLD} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function StudioView({
  selectedModel,
  setSelectedModel,
  mode,
  setMode,
  audioFile,
  setAudioFile,
  youtubeUrl,
  setYoutubeUrl,
  spotifyUrl,
  setSpotifyUrl,
  isSubmitting,
  currentJob,
  setCurrentJob,
  activeJobId,
  setActiveJobId,
  errorMsg,
  recentJobs,
  sysInfo,
  onStartConversion,
  onResetJob,
  onBackToLanding,
  onDeleteJob,
  personalVoices = [],
}) {
  const [showComposerTools, setShowComposerTools] = useState(false);
  const [storage, setStorage] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  useEffect(() => {
    fetch('/api/storage').then((r) => (r.ok ? r.json() : null)).then(setStorage).catch(() => {});
  }, [recentJobs.length]);
  const freeUpSpace = async () => {
    setCleaning(true);
    try {
      const r = await fetch('/api/storage/cleanup', { method: 'POST' });
      if (r.ok) setStorage(await r.json());
    } finally {
      setCleaning(false);
    }
  };
  // Navigation tabs in sidebar: 'studio' | 'my-songs' (Templates & Settings removed per request)
  const [activeTab, setActiveTab] = useState('studio');

  // Input method tabs in the Ingestion Dock: 'file' | 'spotify' | 'youtube' | 'record'
  const [ingestMethod, setIngestMethod] = useState('file');
  // High-level distinct song creation option: 'cover' (Neural AI Cover) | 'sang_by_me' (I Sang / Vocal Take)
  const [creationCategory, setCreationCategory] = useState(mode === 'record' || mode === 'my_voice' ? 'sang_by_me' : 'cover');
  // Chosen neural engine for conversion: 'rvc' | 'seedvc'
  const [selectedEngine, setSelectedEngine] = useState('rvc');
  // Auto-tune & Fix Pitch toggle checkbox for recorded/uploaded audio
  const [fixPitch, setFixPitch] = useState(true);

  // Active playing audio track: 'master' | 'vocal_arijit' | 'instrumental' | 'vocal_original'
  const [activeTrack, setActiveTrack] = useState('master');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [showAcousticPanel, setShowAcousticPanel] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  // High precision slider scrubbing & waveform seek states
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverX, setHoverX] = useState(0);

  // Acoustic Remix parameters
  const [vocalGainDb, setVocalGainDb] = useState(2.8);
  const [instGainDb, setInstGainDb] = useState(-7.5);
  const [hallReverb, setHallReverb] = useState(0.05);
  const [spatialDepth, setSpatialDepth] = useState(0.03);
  const [isRemixing, setIsRemixing] = useState(false);
  const [cacheBuster, setCacheBuster] = useState('');
  const [remixSuccessMsg, setRemixSuccessMsg] = useState('');

  // Mic recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  // Live input level for the recording meter
  const recCtxRef = useRef(null);
  const [recAnalyser, setRecAnalyser] = useState(null);

  // Mic recording pitch correction & preview states
  const [rawAudioFile, setRawAudioFile] = useState(null);
  const [tunedAudioFile, setTunedAudioFile] = useState(null);
  const [rawAudioUrl, setRawAudioUrl] = useState('');
  const [tunedAudioUrl, setTunedAudioUrl] = useState('');
  const [vocalPitchMode, setVocalPitchMode] = useState('tuned'); // 'tuned' | 'raw'
  const [isTuningVocal, setIsTuningVocal] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const previewAudioRef = useRef(null);

  // Drag and drop state
  const [dragActive, setDragActive] = useState(false);

  // Spotify live preview metadata
  const [spotifyMeta, setSpotifyMeta] = useState(null);
  const [isFetchingSpotify, setIsFetchingSpotify] = useState(false);

  const audioRef = useRef(null);
  const stemAudiosRef = useRef({});
  const fileInputRef = useRef(null);

  const STEM_KEYS = ['master', 'vocal_arijit', 'instrumental', 'vocal_original'];

  // When job completes or changes, auto-load track
  const currentResults = currentJob?.results;
  const singerName = currentResults?.singer || (
    selectedModel === 'raw' ? 'Your Voice'
      : personalVoices.find((v) => v.id === selectedModel)?.name
      || (selectedModel === 'sonu_nigam' ? 'Sonu Nigam' : selectedModel === 'kk' ? 'KK' : 'Arijit Singh')
  );

  // Cloudflare R2 Single-File Storage States & Confirmation Modal
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'new_song' | 'back' | { type: 'switch_song', jobId }
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
  const [cloudSaveSuccess, setCloudSaveSuccess] = useState(false);

  // Warn on page reload or close if completed Master 3D is unsaved
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (currentJob?.id && currentResults && !currentResults.saved_to_cloud) {
        e.preventDefault();
        e.returnValue = 'You have an unsaved Master 3D track. Save to cloud before leaving?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentJob?.id, currentResults]);

  // Upload ONLY the 1 Master 3D file to Cloudflare R2
  const handleSaveToCloud = async (targetJobId = null) => {
    const jobId = targetJobId || currentJob?.id;
    if (!jobId) return false;
    setIsSavingToCloud(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/save_to_cloud`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCloudSaveSuccess(true);
        if (setCurrentJob) {
          setCurrentJob(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              results: {
                ...(prev.results || {}),
                saved_to_cloud: true,
                cloud_master_3d_url: data.cloud_url
              }
            };
          });
        }
        setTimeout(() => setCloudSaveSuccess(false), 4000);
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Cloud upload failed: ${err.detail || 'Could not save to Cloudflare R2'}`);
        return false;
      }
    } catch (e) {
      console.error("Cloud save failed:", e);
      alert("Network error connecting to backend.");
      return false;
    } finally {
      setIsSavingToCloud(false);
    }
  };

  const executePendingAction = (action) => {
    if (!action) return;
    if (action === 'new_song') {
      handleStartNewSong();
    } else if (action === 'back') {
      onBackToLanding && onBackToLanding();
    } else if (action.type === 'switch_song') {
      setActiveJobId(action.jobId);
      setActiveTab('studio');
    }
    setPendingAction(null);
  };

  const requestStartNewSong = () => {
    if (currentJob?.id && currentResults && !currentResults.saved_to_cloud) {
      setPendingAction('new_song');
      setShowCloudModal(true);
    } else {
      handleStartNewSong();
    }
  };

  const requestBackToLanding = () => {
    if (currentJob?.id && currentResults && !currentResults.saved_to_cloud) {
      setPendingAction('back');
      setShowCloudModal(true);
    } else {
      onBackToLanding && onBackToLanding();
    }
  };

  const requestSwitchJob = (targetJobId) => {
    if (targetJobId === currentJob?.id) {
      setActiveTab('studio');
      return;
    }
    if (currentJob?.id && currentResults && !currentResults.saved_to_cloud) {
      setPendingAction({ type: 'switch_song', jobId: targetJobId });
      setShowCloudModal(true);
    } else {
      setActiveJobId(targetJobId);
      setActiveTab('studio');
    }
  };

  // Reset to create a brand new song (shows upload dock again)
  const handleStartNewSong = () => {
    STEM_KEYS.forEach(k => {
      const el = stemAudiosRef.current[k];
      if (el) {
        try {
          el.pause();
          el.src = '';
        } catch (e) { }
      }
    });
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.src = '';
      } catch (e) { }
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (onResetJob) {
      onResetJob();
    } else {
      if (setActiveJobId) setActiveJobId(null);
      if (setCurrentJob) setCurrentJob(null);
    }
    setAudioFile(null);
    setRawAudioFile(null);
    setTunedAudioFile(null);
    if (rawAudioUrl) URL.revokeObjectURL(rawAudioUrl);
    if (tunedAudioUrl) URL.revokeObjectURL(tunedAudioUrl);
    setRawAudioUrl('');
    setTunedAudioUrl('');
    setPreviewPlaying(false);
    setPreviewTime(0);
    setPreviewDuration(0);
    setYoutubeUrl('');
    setSpotifyUrl('');
    setSpotifyMeta(null);
    setActiveTab('studio');
  };

  // Determine stem audio source URL
  const getStemSource = (trackId, cbOverride = null) => {
    if (!currentJob?.id) return '';
    const effectiveCb = cbOverride !== null ? cbOverride : cacheBuster;
    const cb = effectiveCb ? `?cb=${effectiveCb}` : '';
    switch (trackId) {
      case 'master_clean':
        return `/api/audio/${currentJob.id}/master_clean${cb}`;
      case 'vocal_arijit':
        return `/api/audio/${currentJob.id}/vocal_arijit${cb}`;
      case 'instrumental':
        return `/api/audio/${currentJob.id}/instrumental${cb}`;
      case 'vocal_original':
        return `/api/audio/${currentJob.id}/vocal_original${cb}`;
      case 'master':
      default:
        return `/api/audio/${currentJob.id}/master_mp3${cb}`;
    }
  };

  const getAudioSource = () => getStemSource(activeTrack);

  // Decoded samples of the stem that's playing, for the live visualizer
  const [decodedEntry, setDecodedEntry] = useState(null);
  const activeStemSrc = currentJob?.id && currentResults ? getStemSource(activeTrack) : '';
  useEffect(() => {
    if (!activeStemSrc) return undefined;
    let alive = true;
    decodeTrack(activeStemSrc)
      .then((t) => { if (alive) setDecodedEntry({ src: activeStemSrc, track: t }); })
      .catch(() => { });
    return () => { alive = false; };
  }, [activeStemSrc]);
  const decoded = decodedEntry?.src === activeStemSrc ? decodedEntry.track : null;
  const getPlayheadTime = useCallback(
    () => stemAudiosRef.current[activeTrack]?.currentTime || 0,
    [activeTrack],
  );

  // Voice ring: real spectrum while playing, a quiet breath while paused
  const ringAnalyser = useMemo(() => (decoded ? createAnalyser(decoded) : null), [decoded]);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  const getRingBands = useCallback((t, n) => {
    const out = new Array(n);
    if (isPlayingRef.current && ringAnalyser) {
      const { bands } = ringAnalyser(getPlayheadTime(), 48);
      for (let i = 0; i < n; i++) {
        const u = Math.abs((i / n) * 2 - 1); // low notes at the top, highs at the bottom, mirrored
        out[i] = 0.04 + bands[Math.min(47, Math.floor(u * 47.99))] * 1.05;
      }
    } else {
      for (let i = 0; i < n; i++) out[i] = 0.07 + 0.04 * (0.5 + 0.5 * Math.sin(t * 1.4 + i * 0.3));
    }
    return out;
  }, [ringAnalyser, getPlayheadTime]);

  // Auto-preload all stem audio elements in parallel as soon as job completes
  useEffect(() => {
    if (currentJob?.id && currentResults) {
      STEM_KEYS.forEach(k => {
        const el = stemAudiosRef.current[k];
        if (el) {
          const expectedSrc = getStemSource(k);
          if (expectedSrc && el.src !== expectedSrc && el.src !== window.location.origin + expectedSrc) {
            el.src = expectedSrc;
            el.preload = 'auto';
            el.load();
          }
        }
      });
    }
  }, [currentJob?.id, currentResults, cacheBuster]);

  // Seamless 0ms latency stem switching without stopping playback or losing timestamp
  const selectTrack = (trackId) => {
    if (trackId === activeTrack) return;
    const oldAudio = stemAudiosRef.current[activeTrack];
    const newAudio = stemAudiosRef.current[trackId];

    const wasPlay = isPlaying || (oldAudio && !oldAudio.paused && !oldAudio.ended);
    const exactTime = oldAudio ? oldAudio.currentTime : currentTime;

    setActiveTrack(trackId);

    // Mute previously active stem instantly
    if (oldAudio) {
      oldAudio.muted = true;
      oldAudio.volume = 0;
    }

    if (newAudio) {
      audioRef.current = newAudio;
      // Transfer exact current playhead position without reset
      if (exactTime > 0 && isFinite(exactTime)) {
        try {
          newAudio.currentTime = exactTime;
        } catch (e) { }
      }
      newAudio.muted = isMuted;
      newAudio.volume = isMuted ? 0 : volume;

      if (wasPlay) {
        newAudio.play().catch(() => { });
      }
    }
  };

  const handlePlayPause = async () => {
    const activeEl = stemAudiosRef.current[activeTrack] || audioRef.current;
    if (!activeEl) return;

    if (isPlaying || (!activeEl.paused && !activeEl.ended)) {
      // Pause all stems synchronously
      STEM_KEYS.forEach(k => {
        const el = stemAudiosRef.current[k];
        if (el) el.pause();
      });
      setIsPlaying(false);
      setIsAudioLoading(false);
    } else {
      try {
        setIsAudioLoading(true);
        const curTime = isSeeking ? seekTime : (activeEl.currentTime || currentTime || 0);

        // If active track had an error or was unready, reload its source
        if (activeEl.error || activeEl.readyState < 2 || !activeEl.src) {
          activeEl.src = getStemSource(activeTrack);
          activeEl.load();
        }

        // Synchronize and play all stems together in lockstep
        STEM_KEYS.forEach(k => {
          const el = stemAudiosRef.current[k];
          if (el) {
            if (k === activeTrack) {
              el.muted = isMuted;
              el.volume = isMuted ? 0 : volume;
            } else {
              el.muted = true;
              el.volume = 0;
            }
            if (Math.abs(el.currentTime - curTime) > 0.05) {
              try { el.currentTime = curTime; } catch (e) { }
            }
            el.play().catch(() => { });
          }
        });

        setIsPlaying(true);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn("Audio playback issue:", err);
        }
        setIsPlaying(false);
      } finally {
        setIsAudioLoading(false);
      }
    }
  };

  const handleTimeUpdate = (e) => {
    if (isSeeking) return;
    const cur = e.target.currentTime;
    setCurrentTime(cur);
    if (e.target.duration && !isNaN(e.target.duration) && e.target.duration > 0) {
      setDuration(e.target.duration);
    }
    // Micro-drift correction across stems (aligns if drift exceeds 0.08s)
    if (isPlaying) {
      STEM_KEYS.forEach(k => {
        if (k !== activeTrack) {
          const el = stemAudiosRef.current[k];
          if (el && Math.abs(el.currentTime - cur) > 0.08) {
            try { el.currentTime = cur; } catch (err) { }
          }
        }
      });
    }
  };

  // Scrubber drag handlers
  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const handleSeekChange = (e) => {
    const val = parseFloat(e.target.value);
    setSeekTime(val);
    setCurrentTime(val);
  };

  const handleSeekEnd = (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      STEM_KEYS.forEach(k => {
        const el = stemAudiosRef.current[k];
        if (el) {
          try { el.currentTime = val; } catch (err) { }
        }
      });
    }
    setCurrentTime(val);
    setIsSeeking(false);
  };

  // Skip forward or backward by seconds across all stems
  const skipTime = (seconds) => {
    const activeEl = stemAudiosRef.current[activeTrack] || audioRef.current;
    const maxD = duration > 0 ? duration : (currentResults?.duration || 180);
    const target = Math.max(0, Math.min(maxD, ((activeEl ? activeEl.currentTime : currentTime) || 0) + seconds));
    STEM_KEYS.forEach(k => {
      const el = stemAudiosRef.current[k];
      if (el) {
        try { el.currentTime = target; } catch (err) { }
      }
    });
    setCurrentTime(target);
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const maxD = duration > 0 ? duration : (currentResults?.duration || 180);
    if (maxD) {
      const target = pos * maxD;
      STEM_KEYS.forEach(k => {
        const el = stemAudiosRef.current[k];
        if (el) {
          try { el.currentTime = target; } catch (err) { }
        }
      });
      setCurrentTime(target);
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Fetch Spotify track preview metadata
  useEffect(() => {
    if (!spotifyUrl || (!spotifyUrl.includes('spotify.com') && !spotifyUrl.startsWith('spotify:'))) {
      setSpotifyMeta(null);
      setIsFetchingSpotify(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsFetchingSpotify(true);
      try {
        const res = await fetch(`/api/spotify/info?url=${encodeURIComponent(spotifyUrl.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success' && data.data) {
            setSpotifyMeta(data.data);
          }
        }
      } catch (err) {
        // Fallback gracefully
      } finally {
        setIsFetchingSpotify(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [spotifyUrl]);

  // Mic recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.75;
        ctx.createMediaStreamSource(stream).connect(analyser);
        recCtxRef.current = ctx;
        setRecAnalyser(analyser);
      } catch {
        setRecAnalyser(null);
      }

      if (rawAudioUrl) URL.revokeObjectURL(rawAudioUrl);
      if (tunedAudioUrl) URL.revokeObjectURL(tunedAudioUrl);
      setRawAudioFile(null);
      setTunedAudioFile(null);
      setRawAudioUrl('');
      setTunedAudioUrl('');
      setPreviewPlaying(false);
      setPreviewTime(0);
      setPreviewDuration(0);

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const rawFile = new File([audioBlob], `vocal_recording_${Date.now()}.wav`, { type: 'audio/wav' });
        const rawUrl = URL.createObjectURL(rawFile);

        setRawAudioFile(rawFile);
        setRawAudioUrl(rawUrl);
        setAudioFile(rawFile);
        setVocalPitchMode('tuned');
        setMode('record');
        setIsRecording(false);
        stream.getTracks().forEach(t => t.stop());
        setRecAnalyser(null);
        recCtxRef.current?.close().catch(() => { });
        recCtxRef.current = null;

        // Immediately auto-generate maximum pitch-corrected track
        setIsTuningVocal(true);
        try {
          const fd = new FormData();
          fd.append('audio_file', rawFile);
          const res = await fetch('/api/tune_preview', { method: 'POST', body: fd });
          if (res.ok) {
            const tunedBlob = await res.blob();
            const tunedFile = new File([tunedBlob], `vocal_recording_tuned_${Date.now()}.wav`, { type: 'audio/wav' });
            const tunedUrl = URL.createObjectURL(tunedBlob);
            setTunedAudioFile(tunedFile);
            setTunedAudioUrl(tunedUrl);
            // Default to the tuned file for the best fixed notes into RVC!
            setAudioFile(tunedFile);
            setVocalPitchMode('tuned');
          }
        } catch (err) {
          console.warn("Auto-tune preview error:", err);
        } finally {
          setIsTuningVocal(false);
        }
      };

      mr.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone access denied or unavailable: " + err.message);
    }
  };

  const stopRecording = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    if (previewAudioRef.current) previewAudioRef.current.pause();
    setPreviewPlaying(false);
    setPreviewTime(0);

    const url = URL.createObjectURL(file);
    setRawAudioFile(file);
    setRawAudioUrl(url);
    setAudioFile(file);
    setTunedAudioFile(null);
    setTunedAudioUrl(null);
    setVocalPitchMode('tuned');

    // Immediately trigger studio pitch correction for uploaded audio track
    setIsTuningVocal(true);
    try {
      const fd = new FormData();
      fd.append('audio_file', file);
      const res = await fetch('/api/tune_preview', { method: 'POST', body: fd });
      if (res.ok) {
        const tunedBlob = await res.blob();
        const baseName = (file.name || 'uploaded_audio').replace(/\.[^/.]+$/, "");
        const tunedFile = new File([tunedBlob], `${baseName}_tuned.wav`, { type: 'audio/wav' });
        const tunedUrl = URL.createObjectURL(tunedBlob);
        setTunedAudioFile(tunedFile);
        setTunedAudioUrl(tunedUrl);
        // Default to tuned file for the best fixed notes into RVC!
        setAudioFile(tunedFile);
        setVocalPitchMode('tuned');
      }
    } catch (err) {
      console.warn("Auto-tune preview error on upload:", err);
    } finally {
      setIsTuningVocal(false);
    }
  };

  const togglePreviewPlay = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (previewPlaying) {
      audio.pause();
      setPreviewPlaying(false);
    } else {
      audio.play().catch(() => { });
      setPreviewPlaying(true);
    }
  };

  const handleSelectPitchMode = (targetMode) => {
    setVocalPitchMode(targetMode);
    const audio = previewAudioRef.current;
    const prevPos = audio ? audio.currentTime : previewTime;
    const wasPlay = previewPlaying;

    if (targetMode === 'tuned') {
      if (tunedAudioFile) setAudioFile(tunedAudioFile);
      if (audio && (tunedAudioUrl || rawAudioUrl)) {
        audio.src = tunedAudioUrl || rawAudioUrl;
        audio.load();
        audio.currentTime = prevPos;
        if (wasPlay) audio.play().catch(() => { });
      }
    } else {
      if (rawAudioFile) setAudioFile(rawAudioFile);
      if (audio && rawAudioUrl) {
        audio.src = rawAudioUrl;
        audio.load();
        audio.currentTime = prevPos;
        if (wasPlay) audio.play().catch(() => { });
      }
    }
  };

  const handleApplyRemix = async (overrideParams = null) => {
    if (!currentJob?.id) return;
    setIsRemixing(true);
    setRemixSuccessMsg('');
    const vGain = overrideParams && overrideParams.vocalGainDb !== undefined ? overrideParams.vocalGainDb : vocalGainDb;
    const iGain = overrideParams && overrideParams.instGainDb !== undefined ? overrideParams.instGainDb : instGainDb;
    const hReverb = overrideParams && overrideParams.hallReverb !== undefined ? overrideParams.hallReverb : hallReverb;
    const sDepth = overrideParams && overrideParams.spatialDepth !== undefined ? overrideParams.spatialDepth : spatialDepth;

    if (overrideParams) {
      if (overrideParams.vocalGainDb !== undefined) setVocalGainDb(overrideParams.vocalGainDb);
      if (overrideParams.instGainDb !== undefined) setInstGainDb(overrideParams.instGainDb);
      if (overrideParams.hallReverb !== undefined) setHallReverb(overrideParams.hallReverb);
      if (overrideParams.spatialDepth !== undefined) setSpatialDepth(overrideParams.spatialDepth);
    }

    try {
      const fd = new FormData();
      fd.append('job_id', currentJob.id);
      fd.append('vocal_gain_db', vGain);
      fd.append('inst_gain_db', iGain);
      fd.append('reverb_amount', hReverb);
      fd.append('echo_amount', sDepth);

      const res = await fetch('/api/remix', {
        method: 'POST',
        body: fd
      });
      if (res.ok) {
        const wasPlay = isPlaying;
        const exactTime = currentTime;
        const newCb = Date.now().toString();
        setCacheBuster(newCb);
        setActiveTrack('master');

        setTimeout(() => {
          STEM_KEYS.forEach(k => {
            const el = stemAudiosRef.current[k];
            if (el) {
              const src = getStemSource(k, newCb);
              el.src = src;
              el.load();
              if (exactTime > 0) {
                try { el.currentTime = exactTime; } catch (e) { }
              }
              if (wasPlay) {
                if (k === 'master') {
                  el.muted = isMuted;
                  el.volume = isMuted ? 0 : volume;
                } else {
                  el.muted = true;
                  el.volume = 0;
                }
                el.play().catch(() => { });
              }
            }
          });
        }, 150);

        setRemixSuccessMsg('✓ Remaster applied live!');
        setTimeout(() => setRemixSuccessMsg(''), 4000);
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(`Remaster failed: ${errJson.detail || 'Server error while applying remaster'}`);
      }
    } catch (err) {
      console.error("Remix failed:", err);
      alert("Network error while communicating with audio backend.");
    } finally {
      setIsRemixing(false);
    }
  };



  const handleConvertTrigger = (e) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    // Set correct input mode
    if (ingestMethod === 'file') setMode('file');
    else if (ingestMethod === 'spotify') setMode('spotify');
    else if (ingestMethod === 'youtube') setMode('youtube');
    else if (ingestMethod === 'record') setMode('record');

    onStartConversion(ingestMethod, { engine: selectedEngine, fixPitch });
  };

  // Check if current input method has a valid song selected
  const hasValidInput = Boolean(
    (ingestMethod === 'file' && audioFile) ||
    (ingestMethod === 'spotify' && spotifyUrl && spotifyUrl.trim()) ||
    (ingestMethod === 'youtube' && youtubeUrl && youtubeUrl.trim()) ||
    (ingestMethod === 'record' && audioFile)
  );

  const maxDuration = duration > 0 ? duration : (currentResults?.duration || 180);
  const playhead = isSeeking ? seekTime : currentTime;
  const playPct = maxDuration > 0 ? Math.min(1, Math.max(0, playhead / maxDuration)) : 0;
  const activeStem = STEMS.find((st) => st.id === activeTrack) || STEMS[0];
  const ringSinger = SINGERS.find((sg) => singerName.toLowerCase().includes(sg.name.toLowerCase().split(' ')[0].toLowerCase()));
  const ringColor = hexToRgb(ringSinger?.color || '#a78bfa');
  const ringInitials = ringSinger?.initials || (selectedModel === 'raw' ? 'You' : singerName.slice(0, 2).toUpperCase());
  const isRecordedTake = Boolean(audioFile && audioFile.name?.startsWith('vocal_recording_'));

  return (
    <div className="flex h-screen w-full bg-[#07080a] text-white overflow-hidden font-sans select-none">

      {/* HTML5 Synchronized Multi-Stem Audio Elements Engine */}
      {STEM_KEYS.map((stemKey) => (
        <audio
          key={stemKey}
          ref={(el) => {
            stemAudiosRef.current[stemKey] = el;
            if (stemKey === activeTrack) audioRef.current = el;
          }}
          src={currentJob?.id && currentResults ? getStemSource(stemKey) : undefined}
          preload="auto"
          onTimeUpdate={stemKey === activeTrack ? handleTimeUpdate : undefined}
          onLoadedMetadata={stemKey === activeTrack ? handleTimeUpdate : undefined}
          onDurationChange={(e) => {
            if (stemKey === activeTrack && e.target.duration && !isNaN(e.target.duration) && e.target.duration > 0) {
              setDuration(e.target.duration);
            }
          }}
          onWaiting={() => {
            if (stemKey === activeTrack) setIsAudioLoading(true);
          }}
          onPlaying={() => {
            if (stemKey === activeTrack) {
              setIsAudioLoading(false);
              setIsPlaying(true);
            }
          }}
          onCanPlay={() => {
            if (stemKey === activeTrack) setIsAudioLoading(false);
          }}
          onCanPlayThrough={() => {
            if (stemKey === activeTrack) setIsAudioLoading(false);
          }}
          onPlay={() => {
            if (stemKey === activeTrack) setIsPlaying(true);
          }}
          onPause={() => {
            if (stemKey === activeTrack) {
              setIsAudioLoading(false);
              setIsPlaying(false);
            }
          }}
          onEnded={() => {
            if (stemKey === activeTrack) {
              setIsAudioLoading(false);
              setIsPlaying(false);
            }
          }}
          onError={() => {
            if (stemKey === activeTrack) {
              setIsAudioLoading(false);
              setIsPlaying(false);
            }
          }}
        />
      ))}

      {/* =========================================================================
          SIDEBAR
         ========================================================================= */}
      <aside className="w-60 lg:w-64 bg-[#0a0b0e]/90 backdrop-blur-xl border-r border-white/[0.06] flex flex-col justify-between p-4 flex-shrink-0 z-20">
        <div className="space-y-5">
          <button
            type="button"
            onClick={onBackToLanding}
            className="flex items-center gap-2.5 px-2 pt-1 cursor-pointer select-none group"
            title="Back to the home page"
          >
            <LyraLogo />
            <span className="text-lg font-bold uppercase tracking-[0.22em] text-white group-hover:text-[#e5a958] transition-colors" style={{ fontFamily: 'var(--font-display)' }}>
              Lyra
            </span>
          </button>

          <button type="button" onClick={requestStartNewSong} className="btn btn-primary w-full">
            <PlusCircle /> New song
          </button>

          <nav className="space-y-1">
            <div className="px-3 pb-1 eyebrow !text-[10px] text-white/30">Workspace</div>
            {[
              { id: 'studio', label: 'Studio', icon: Compass },
              { id: 'my-songs', label: 'My Songs', icon: Music2, count: recentJobs.length },
            ].map(({ id, label, icon: Icon, count }) => {
              const on = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`relative w-full flex items-center justify-between gap-3 px-3 h-10 rounded-xl text-sm transition-all cursor-pointer ${on ? 'bg-white/[0.08] text-white font-semibold' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'}`}
                >
                  {on && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-[#e5a958]" />}
                  <span className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${on ? 'text-[#e5a958]' : ''}`} />
                    {label}
                  </span>
                  {count > 0 && <span className="chip chip-gold !h-5 !px-2 !text-[10px]">{count}</span>}
                </button>
              );
            })}
          </nav>

          {/* Now playing mini card */}
          {currentResults && (
            <div className="panel-inset p-3 flex items-center gap-3 animate-fadeIn">
              <div className={`vinyl w-10 h-10 shrink-0 ${isPlaying ? 'is-playing' : ''}`}>
                <div className="vinyl-label bg-[#e5a958]">
                  {currentResults.thumbnail && <img src={currentResults.thumbnail} alt="" className="w-full h-full object-cover" />}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white truncate">{cleanTitle(currentResults.title, 'Studio Audio Project')}</div>
                <div className="text-[10px] text-white/45 truncate">{singerName}</div>
              </div>
              <span className={`eq-loader text-[#e5a958] ${isPlaying ? '' : 'is-paused'}`}><span /><span /><span /></span>
            </div>
          )}
        </div>

        {/* Engine & storage status */}
        <div className="panel-inset p-3 text-[11px] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-white/55 font-medium">Voice engines</span>
            <span className="flex items-center gap-1.5 text-[#3fe0c5] font-mono text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3fe0c5] shadow-[0_0_6px_#3fe0c5]" /> Online
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            <span
              className={`chip !h-5 !text-[10px] ${sysInfo?.seedvc_available ? 'chip-teal' : ''}`}
              title={sysInfo?.seedvc_available ? 'Seed-VC singing engine installed' : 'Run backend/tools/setup_seedvc.sh to enable Seed-VC'}
            >
              Seed-VC {sysInfo?.seedvc_available ? '✓' : '· off'}
            </span>
            <span className="chip chip-gold !h-5 !text-[10px]">RVC v2 ✓</span>
          </div>
          <div className="text-[10px] text-white/40 font-mono flex items-center gap-1.5">
            <Cpu className="w-3 h-3" />
            {sysInfo?.torch_device === 'cuda' ? 'NVIDIA GPU' : sysInfo?.torch_device === 'mps' ? 'Apple Silicon' : 'CPU'} acceleration
          </div>
          {storage && (
            <div className="pt-2.5 border-t border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between text-white/55">
                <span className="flex items-center gap-1.5"><HardDrive className="w-3 h-3" /> Storage</span>
                <span className={`font-mono text-[10px] ${storage.free_gb < 6 ? 'text-rose-300' : 'text-white/50'}`}>{storage.free_gb} GB free</span>
              </div>
              <div className="text-[10px] text-white/40 font-mono">
                {storage.profile === 'lite' ? 'Lite mode' : 'Standard mode'} · songs {storage.songs_mb} MB
              </div>
              <button
                type="button"
                onClick={freeUpSpace}
                disabled={cleaning}
                className="btn btn-secondary btn-sm w-full"
                title="Deletes temporary files from finished songs. Your masters, stems and MIDI are kept."
              >
                {cleaning ? <><span className="ring-loader !w-3 !h-3" /> Cleaning…</> : 'Free up space'}
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* =========================================================================
          MAIN WORKSPACE (fixed to viewport height)
         ========================================================================= */}
      <main className="flex-1 flex flex-col bg-transparent h-screen overflow-hidden relative select-none">
        <div className="hero-grid absolute inset-0 pointer-events-none" />
        <div className="aurora pointer-events-none absolute -top-48 right-[-15%] w-[900px] h-[560px] opacity-60" />

        <div className="relative flex-1 h-full max-h-screen overflow-hidden p-3 sm:p-4 lg:p-5 flex flex-col">

          {/* ===================================================== MY SONGS */}
          {activeTab === 'my-songs' && (
            <div className="max-w-6xl w-full mx-auto h-full flex flex-col overflow-hidden gap-4 animate-fadeIn">
              <div className="flex items-end justify-between gap-3 flex-shrink-0 pt-2">
                <div>
                  <div className="eyebrow text-white/40">Library</div>
                  <h3 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">
                    My <span className="font-accent text-[#e5a958]">songs</span>
                  </h3>
                </div>
                <span className="chip chip-gold">{recentJobs.length} {recentJobs.length === 1 ? 'track' : 'tracks'}</span>
              </div>

              {recentJobs.length === 0 ? (
                <div className="panel p-14 text-center my-auto">
                  <div className="vinyl w-20 h-20 mx-auto is-playing">
                    <div className="vinyl-label bg-gradient-to-br from-[#e5a958] to-[#3fe0c5]" />
                  </div>
                  <p className="mt-6 text-lg font-semibold text-white">No songs yet</p>
                  <p className="mt-1 text-sm text-white/50 max-w-sm mx-auto">Your first render with Arijit Singh, Sonu Nigam, KK or your own voice will show up here.</p>
                  <button type="button" onClick={requestStartNewSong} className="btn btn-primary mt-6">
                    <PlusCircle /> Create a song
                  </button>
                </div>
              ) : (
                <div className="panel flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="grid grid-cols-12 px-5 py-3 text-[10px] font-mono text-white/35 uppercase tracking-[0.18em] border-b border-white/[0.06] flex-shrink-0">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-6">Track</div>
                    <div className="col-span-3">Voice</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  <div className="divide-y divide-white/[0.05] overflow-y-auto flex-1">
                    {recentJobs.map((j, idx) => {
                      const r = j.results || {};
                      const s = r.singer || j.metadata?.singer_name || 'Arijit Singh';
                      const isSelected = (currentJob?.id === j.id);
                      const displayTitle = cleanTitle(r.title || j.metadata?.title || 'Studio Audio Project');
                      const singer = SINGERS.find((x) => s.toLowerCase().includes(x.name.toLowerCase().split(' ')[0])) || null;
                      const tone = singer?.color || '#a78bfa';

                      return (
                        <div
                          key={j.id}
                          onClick={() => requestSwitchJob(j.id)}
                          className={`grid grid-cols-12 items-center px-5 py-3 transition-colors duration-200 cursor-pointer group ${isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                        >
                          <div className="col-span-1 flex items-center justify-center">
                            {isSelected && isPlaying ? (
                              <span className="eq-loader text-[#e5a958]"><span /><span /><span /></span>
                            ) : (
                              <>
                                <span className="text-xs font-mono text-white/35 group-hover:hidden">{String(idx + 1).padStart(2, '0')}</span>
                                <Play className="w-3.5 h-3.5 text-white hidden group-hover:block fill-current" />
                              </>
                            )}
                          </div>

                          <div className="col-span-6 flex items-center gap-3.5 min-w-0 pr-4">
                            <div className={`vinyl w-10 h-10 shrink-0 ${isSelected && isPlaying ? 'is-playing' : ''}`}>
                              <div className="vinyl-label" style={{ background: tone }}>
                                {r.thumbnail && <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />}
                              </div>
                            </div>
                            <div className="min-w-0">
                              <h4 className={`text-sm font-semibold truncate ${isSelected ? 'text-[#e5a958]' : 'text-white'}`} style={{ fontFamily: 'var(--font-sans)', letterSpacing: 0 }}>
                                {displayTitle}
                              </h4>
                              <div className="flex items-center gap-2 text-[11px] text-white/45 font-mono">
                                <span>{formatTime(r.duration || 180)}</span>
                                <span className="text-white/20">·</span>
                                <span>4 stems</span>
                                {isSelected && <><span className="text-white/20">·</span><span className="text-[#e5a958]">loaded</span></>}
                              </div>
                            </div>
                          </div>

                          <div className="col-span-3 flex items-center gap-2 min-w-0">
                            <span className="w-6 h-6 rounded-full grid place-items-center text-[9px] font-bold shrink-0" style={{ background: `${tone}22`, color: tone, border: `1px solid ${tone}55` }}>
                              {singer?.initials || s.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="text-xs text-white/75 truncate">{s}</span>
                          </div>

                          <div className="col-span-2 flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveJobId(j.id);
                                setActiveTab('studio');
                              }}
                              className="btn btn-secondary btn-sm"
                            >
                              <Play className="fill-current" />
                              <span className="hidden md:inline">Open</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => onDeleteJob && onDeleteJob(j.id, e)}
                              className="btn btn-ghost btn-sm btn-icon hover:!text-rose-300"
                              title="Delete song"
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================================================== STUDIO */}
          {activeTab === 'studio' && (
            <div className="w-full h-full flex flex-col gap-3 overflow-hidden animate-fadeIn">

              {/* Rendering: live pipeline status */}
              {isSubmitting && currentJob && (
                <div className="animate-fadeIn my-auto max-w-4xl w-full mx-auto">
                  <ProcessingStatus job={currentJob} selectedModel={selectedModel} onReset={onResetJob} />
                </div>
              )}

              {/* ------------------------------------------------- PLAYER */}
              {currentResults && (
                <div className="panel rim-glow p-4 sm:p-5 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden animate-fadeIn">

                  {/* Header: disc + title + badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className={`vinyl w-14 h-14 sm:w-16 sm:h-16 shrink-0 ${isPlaying ? 'is-playing' : ''}`}>
                        <div className="vinyl-label bg-gradient-to-br from-[#e5a958] to-[#a8722f]">
                          {currentResults.thumbnail
                            ? <img src={currentResults.thumbnail} alt="" className="w-full h-full object-cover" />
                            : <span className="w-1.5 h-1.5 rounded-full bg-[#07080a]" />}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate leading-tight">
                          {cleanTitle(currentResults.title, 'Studio Audio Project')}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[#e5a958]">{singerName}</span>
                          <span className="text-white/20">·</span>
                          <span className="text-white/50">3D spatial master</span>
                          <span className="text-white/20">·</span>
                          <span className="font-mono text-white/45">{formatTime(maxDuration)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                      <span className="chip chip-green"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Pitch lock</span>
                      <span className="chip">40 kHz · 32-bit float</span>
                    </div>
                  </div>

                  {/* Stage: live aura + 3D orb, real waveform, scrubber */}
                  <div className="flex-1 min-h-0 flex">
                    <div className="panel-inset p-3 sm:p-4 flex flex-col gap-3 min-h-0 flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 flex-shrink-0">
                        <span className="chip chip-gold max-w-[60%] truncate">
                          {activeTrack === 'vocal_arijit' ? `${singerName} · solo vocal` : activeStem.label}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-white/50 tabular-nums">
                            <span className="text-[#e5a958] font-semibold text-sm">{formatTime(playhead)}</span> / {formatTime(maxDuration)}
                          </span>
                          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-white/10 w-32">
                            <button
                              type="button"
                              onClick={() => {
                                const nextMuted = !isMuted;
                                setIsMuted(nextMuted);
                                const activeEl = stemAudiosRef.current[activeTrack];
                                if (activeEl) {
                                  activeEl.muted = nextMuted;
                                  activeEl.volume = nextMuted ? 0 : volume;
                                }
                              }}
                              className="text-white/60 hover:text-white transition-colors cursor-pointer"
                              title={isMuted ? 'Unmute' : 'Mute'}
                            >
                              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                            <FillRange
                              value={isMuted ? 0 : volume}
                              min={0}
                              max={1}
                              step={0.05}
                              color="rgba(255,255,255,0.75)"
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setVolume(v);
                                setIsMuted(false);
                                const activeEl = stemAudiosRef.current[activeTrack];
                                if (activeEl) {
                                  activeEl.muted = false;
                                  activeEl.volume = v;
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Voice ring driven by the real audio at the playhead */}
                      <div className="relative flex-1 min-h-[150px] grid place-items-center overflow-hidden">
                        <VoiceRing className="h-full max-w-full" color={ringColor} getBands={getRingBands}>
                          <div className="px-2">
                            <div className="text-[9px] sm:text-[10px] font-mono uppercase tracking-[0.22em] text-white/40">{isPlaying ? 'Now playing' : 'Paused'}</div>
                            <div className="mt-1 text-2xl sm:text-3xl font-bold leading-none" style={{ fontFamily: 'var(--font-display)', color: `rgb(${ringColor.join(',')})` }}>
                              {ringInitials}
                            </div>
                            <div className="mt-1.5 text-xs sm:text-sm font-semibold text-white truncate max-w-[9rem]">{singerName}</div>
                            <div className="text-[10px] sm:text-[11px] text-white/45">{activeStem.label}</div>
                          </div>
                        </VoiceRing>
                        {!decoded && (
                          <span className="absolute left-0 top-0 chip !h-6 animate-fadeIn">
                            <span className="eq-loader text-[#e5a958] !h-3"><span /><span /><span /></span> Analysing audio…
                          </span>
                        )}
                      </div>

                      {/* Real waveform of the track (click to seek) */}
                      <div
                        onClick={handleSeek}
                        onMouseMove={(e) => {
                          if (!maxDuration) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                          setHoverTime(ratio * maxDuration);
                          setHoverX(e.clientX - rect.left);
                        }}
                        onMouseLeave={() => setHoverTime(null)}
                        className="relative h-12 flex-shrink-0 w-full flex items-center gap-[2px] px-1 cursor-pointer group rounded-xl bg-black/25"
                        title="Click to seek"
                      >
                        {duration > 0 && (
                          <div
                            className="absolute top-0 bottom-0 w-[2px] rounded-full bg-white shadow-[0_0_14px_#e5a958] z-20 pointer-events-none"
                            style={{ left: `${playPct * 100}%` }}
                          />
                        )}
                        {hoverTime !== null && (
                          <div
                            className="absolute -top-1 px-2 py-0.5 rounded-md bg-[#15171c] border border-white/15 text-[11px] font-mono text-[#e5a958] pointer-events-none z-30 -translate-x-1/2 -translate-y-full shadow-xl"
                            style={{ left: `${hoverX}px` }}
                          >
                            {formatTime(hoverTime)}
                          </div>
                        )}
                        {(decoded?.peaks || WAVE.map((h) => h / 100)).map((v, idx, arr) => {
                          const played = (idx / (arr.length - 1)) <= playPct;
                          return (
                            <div key={idx} className="flex-1 h-full flex items-center justify-center">
                              <span
                                style={{ height: `${Math.max(8, v * 90)}%` }}
                                className={`w-full max-w-[3px] rounded-full transition-colors duration-150 ${played
                                  ? 'bg-gradient-to-t from-[#e5a958] to-[#f6c98a]'
                                  : decoded ? 'bg-white/20 group-hover:bg-white/30' : 'bg-white/[0.07]'}`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Scrubber */}
                      <div className="flex-shrink-0">
                        <input
                          type="range"
                          min="0"
                          max={duration > 0 ? duration : (currentResults?.duration || 100)}
                          step="0.05"
                          value={playhead}
                          onMouseDown={handleSeekStart}
                          onTouchStart={handleSeekStart}
                          onChange={handleSeekChange}
                          onMouseUp={handleSeekEnd}
                          onTouchEnd={handleSeekEnd}
                          className="lyra-range w-full cursor-pointer"
                          style={{ background: `linear-gradient(90deg, #e5a958 ${playPct * 100}%, rgba(255,255,255,0.1) ${playPct * 100}%)` }}
                        />
                        <div className="mt-1.5 flex justify-between text-[10px] font-mono text-white/40">
                          <span>{formatTime(playhead)}</span>
                          {duration > 0 && <span>-{formatTime(Math.max(0, duration - playhead))}</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Transport + stems */}
                  <div className="flex flex-col xl:flex-row items-center justify-between gap-3 flex-shrink-0">
                    <div className="seg max-w-full overflow-x-auto">
                      {STEMS.map((stem) => (
                        <button
                          key={stem.id}
                          type="button"
                          onClick={() => selectTrack(stem.id)}
                          title={stem.hint}
                          className="seg-item"
                          data-active={activeTrack === stem.id}
                          data-tone="gold"
                        >
                          {stem.id === 'vocal_arijit' ? `${singerName.split(' ')[0]} solo` : stem.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => skipTime(-10)} className="btn btn-secondary btn-icon" title="Back 10 seconds">
                        <RotateCcw />
                      </button>
                      <button
                        type="button"
                        onClick={handlePlayPause}
                        disabled={isAudioLoading}
                        className={`relative w-14 h-14 rounded-full grid place-items-center text-[#120c03] cursor-pointer transition-transform hover:scale-105 active:scale-95 disabled:cursor-wait ${isPlaying ? 'pulse-ring' : ''}`}
                        style={{ background: 'linear-gradient(180deg, #f6c98a, #e5a958 60%, #cf8f3d)', boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 12px 30px -8px rgba(229,169,88,0.8)' }}
                        title={isAudioLoading ? 'Buffering…' : isPlaying ? 'Pause' : 'Play'}
                      >
                        {isAudioLoading ? (
                          <span className="ring-loader !w-6 !h-6 !border-[2.5px] !border-black/20 !border-t-black" />
                        ) : isPlaying ? (
                          <Pause className="w-6 h-6 fill-current" />
                        ) : (
                          <Play className="w-6 h-6 fill-current ml-0.5" />
                        )}
                      </button>
                      <button type="button" onClick={() => skipTime(10)} className="btn btn-secondary btn-icon" title="Forward 10 seconds">
                        <RotateCw />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAcousticPanel(!showAcousticPanel)}
                      className={`btn btn-sm ${showAcousticPanel ? 'btn-outline-gold' : 'btn-secondary'}`}
                    >
                      <Sliders /> Acoustic rack {showAcousticPanel ? <ChevronUp /> : <ChevronDown />}
                    </button>
                  </div>

                  {/* Acoustic rack */}
                  {showAcousticPanel && (
                    <div className="panel-inset p-3.5 space-y-3 animate-fadeIn flex-shrink-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Sliders className="w-4 h-4 text-[#e5a958]" />
                          <h4 className="text-sm font-semibold text-white" style={{ fontFamily: 'var(--font-sans)', letterSpacing: 0 }}>Acoustic rack</h4>
                          {remixSuccessMsg && (
                            <span className="chip chip-green animate-fadeIn"><Check className="w-3 h-3" /> Applied</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleApplyRemix({ vocalGainDb: 0, instGainDb: 0, hallReverb: 0, spatialDepth: 0 })}
                            disabled={isRemixing}
                            className="btn btn-outline-teal btn-sm"
                            title="Re-create the Clean Natural mix (no reverb or delay)"
                          >
                            <Headphones /> Clean preset
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApplyRemix({ vocalGainDb: 2.5, instGainDb: -4.5, hallReverb: 0.05, spatialDepth: 0.03 })}
                            disabled={isRemixing}
                            className="btn btn-outline-gold btn-sm"
                            title="Restore the default 3D spatial master"
                          >
                            <Sparkles /> 3D preset
                          </button>
                          <button type="button" onClick={() => handleApplyRemix()} disabled={isRemixing} className="btn btn-primary btn-sm" title="Apply the slider values to the master">
                            {isRemixing ? <span className="ring-loader !w-3.5 !h-3.5" /> : <RefreshCw />} Apply
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3">
                        {[
                          { label: 'Lead vocal', val: vocalGainDb, set: setVocalGainDb, min: 0, max: 6, step: 0.2, fmt: (v) => `+${v} dB` },
                          { label: 'Music level', val: instGainDb, set: setInstGainDb, min: -14, max: 0, step: 0.5, fmt: (v) => `${v} dB` },
                          { label: 'Hall reverb', val: hallReverb, set: setHallReverb, min: 0, max: 0.25, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
                          { label: 'Stereo depth', val: spatialDepth, set: setSpatialDepth, min: 0, max: 0.15, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
                        ].map((k) => (
                          <label key={k.label} className="block">
                            <div className="flex justify-between text-[11px] mb-1.5">
                              <span className="text-white/65">{k.label}</span>
                              <span className="font-mono text-[#e5a958]">{k.fmt(k.val)}</span>
                            </div>
                            <FillRange value={k.val} min={k.min} max={k.max} step={k.step} onChange={(e) => k.set(parseFloat(e.target.value))} />
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Export bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/[0.06] flex-shrink-0">
                    <button type="button" onClick={() => setShowComposerTools(true)} className="btn btn-outline-teal btn-sm" title="Stems, MIDI, key/BPM and section re-render">
                      <Layers /> Stems · MIDI · Re-render
                    </button>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {currentResults.saved_to_cloud ? (
                        <span className="chip chip-green !h-8 !px-3" title="The Master 3D mix is saved in cloud storage">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Saved to cloud
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSaveToCloud()}
                          disabled={isSavingToCloud}
                          className="btn btn-outline-gold btn-sm"
                          title="Save the Master 3D mix (~2.8 MB) to cloud storage"
                        >
                          {isSavingToCloud ? <span className="ring-loader !w-3.5 !h-3.5" /> : <Cloud />}
                          {isSavingToCloud ? 'Saving…' : 'Save to cloud'}
                        </button>
                      )}
                      <a
                        href={currentResults.master_remastered_wav || `/api/audio/${currentJob.id}/master_wav`}
                        download={`${currentResults.title || 'Lyra_Song'}_Master_3D.wav`}
                        className="btn btn-secondary btn-sm"
                      >
                        <Download className="text-[#e5a958]" /> Master WAV
                      </a>
                      <a
                        href={currentResults.master_remastered_mp3 || `/api/audio/${currentJob.id}/master_mp3`}
                        download={`${currentResults.title || 'Lyra_Song'}_Master_3D.mp3`}
                        className="btn btn-secondary btn-sm"
                      >
                        <Download className="text-[#e5a958]" /> Master MP3
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {errorMsg && (
                <div className="flex-shrink-0 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-200 text-sm flex items-center gap-2.5 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* ------------------------------------------------- CREATE DOCK */}
              {(!currentResults && !activeJobId) && (
                <div className="panel rim-glow p-4 sm:p-5 lg:p-6 flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto animate-fadeIn">

                  {/* Title + mode switch */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 flex-shrink-0">
                    <div>
                      <div className="eyebrow text-white/40">New song</div>
                      <h3 className="mt-1 text-xl sm:text-2xl font-bold text-white tracking-tight">
                        {creationCategory === 'sang_by_me'
                          ? <>Your <span className="font-accent text-[#e5a958]">vocal take</span></>
                          : <>AI <span className="font-accent text-[#3fe0c5]">song cover</span></>}
                      </h3>
                      <p className="text-xs text-white/50 mt-0.5">
                        {creationCategory === 'sang_by_me' ? 'Record or upload yourself — Lyra tunes, cleans and masters it.' : 'Separate any song and re-sing the lead in another voice.'}
                      </p>
                    </div>
                    <div className="seg self-start lg:self-auto">
                      <button
                        type="button"
                        className="seg-item"
                        data-active={creationCategory === 'sang_by_me'}
                        data-tone="gold"
                        onClick={() => {
                          setCreationCategory('sang_by_me');
                          if (ingestMethod === 'spotify' || ingestMethod === 'youtube') {
                            setIngestMethod('record');
                          }
                        }}
                      >
                        <Mic /> Vocal take
                      </button>
                      <button
                        type="button"
                        className="seg-item"
                        data-active={creationCategory === 'cover'}
                        data-tone="teal"
                        onClick={() => {
                          setCreationCategory('cover');
                          if (ingestMethod === 'record') {
                            setIngestMethod('file');
                          }
                        }}
                      >
                        <Sparkles /> AI cover
                      </button>
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-[1.15fr_1fr] gap-4 flex-1 min-h-0">
                    {/* LEFT: source */}
                    <div className="flex flex-col gap-3 min-h-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="eyebrow text-white/45"><span className="text-[#e5a958]">01</span> Source</span>
                        <div className="seg">
                          {(creationCategory === 'sang_by_me'
                            ? [
                                { id: 'record', label: 'Record', icon: Mic },
                                { id: 'file', label: 'Upload', icon: Upload },
                              ]
                            : [
                                { id: 'file', label: 'Upload', icon: Upload },
                                { id: 'spotify', label: 'Spotify', icon: LinkIcon },
                                { id: 'youtube', label: 'YouTube', icon: Disc },
                              ]
                          ).map((tab) => {
                            const Icon = tab.icon;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                className="seg-item"
                                data-active={ingestMethod === tab.id}
                                onClick={() => {
                                  if (previewAudioRef.current) previewAudioRef.current.pause();
                                  setPreviewPlaying(false);
                                  setIngestMethod(tab.id);
                                }}
                              >
                                <Icon /> {tab.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Shared preview audio element for recording or uploaded audio */}
                      <audio
                        ref={previewAudioRef}
                        src={vocalPitchMode === 'tuned' ? (tunedAudioUrl || rawAudioUrl) : rawAudioUrl}
                        onTimeUpdate={(e) => setPreviewTime(e.target.currentTime)}
                        onLoadedMetadata={(e) => setPreviewDuration(e.target.duration)}
                        onEnded={() => setPreviewPlaying(false)}
                        onPause={() => setPreviewPlaying(false)}
                        onPlay={() => setPreviewPlaying(true)}
                      />

                      <div className="flex-1 min-h-[220px] flex flex-col">
                        {/* Upload */}
                        {ingestMethod === 'file' && (
                          <>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="audio/*"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleFileUpload(e.target.files[0]);
                                }
                              }}
                            />
                            {audioFile && !isRecordedTake ? (
                              <div className="flex-1 panel-inset p-4 flex flex-col justify-center gap-4 animate-fadeIn">
                                <div className="flex items-center gap-3.5 min-w-0">
                                  <div className="w-12 h-12 rounded-2xl grid place-items-center shrink-0 bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                                    <FileAudio className="w-5 h-5" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-white truncate">{rawAudioFile?.name || audioFile.name}</div>
                                    <div className="text-[11px] font-mono text-white/45">
                                      {((rawAudioFile || audioFile).size / (1024 * 1024)).toFixed(2)} MB
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (previewAudioRef.current) previewAudioRef.current.pause();
                                      setPreviewPlaying(false);
                                      setAudioFile(null);
                                      setRawAudioFile(null);
                                      setTunedAudioFile(null);
                                      setRawAudioUrl(null);
                                      setTunedAudioUrl(null);
                                      fileInputRef.current?.click();
                                    }}
                                    className="btn btn-secondary btn-sm"
                                  >
                                    Change
                                  </button>
                                </div>
                                <PitchCompare mode={vocalPitchMode} onSelect={handleSelectPitchMode} tuning={isTuningVocal} hasTuned={Boolean(tunedAudioFile)} rawLabel="Raw" RawIcon={Upload} />
                                <PreviewPlayer
                                  playing={previewPlaying}
                                  onToggle={togglePreviewPlay}
                                  time={previewTime}
                                  duration={previewDuration}
                                  formatTime={formatTime}
                                  onSeek={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setPreviewTime(val);
                                    if (previewAudioRef.current) previewAudioRef.current.currentTime = val;
                                  }}
                                />
                              </div>
                            ) : (
                              <div
                                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                onDragLeave={() => setDragActive(false)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setDragActive(false);
                                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                    handleFileUpload(e.dataTransfer.files[0]);
                                  }
                                }}
                                onClick={() => fileInputRef.current?.click()}
                                className={`flex-1 rounded-2xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all duration-300 ${dragActive
                                  ? 'border-[#e5a958] bg-[#e5a958]/[0.07] scale-[0.99]'
                                  : 'border-white/12 hover:border-white/25 bg-white/[0.015] hover:bg-white/[0.03]'}`}
                              >
                                <DropArt active={dragActive} />
                                <div>
                                  <div className="text-sm sm:text-base font-semibold text-white">
                                    {dragActive ? 'Drop it here' : creationCategory === 'sang_by_me' ? 'Drop your vocal, or click to browse' : 'Drop a song, or click to browse'}
                                  </div>
                                  <p className="text-xs text-white/45 mt-1">WAV, MP3, FLAC, M4A or OGG · up to 100 MB · auto-tuned on upload</p>
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Spotify / YouTube link */}
                        {(ingestMethod === 'spotify' || ingestMethod === 'youtube') && (
                          <div className="flex-1 panel-inset p-4 flex flex-col justify-center gap-3 animate-fadeIn">
                            <div className="flex items-center gap-3">
                              <span className={`w-10 h-10 rounded-xl grid place-items-center border ${ingestMethod === 'spotify' ? 'bg-green-500/10 border-green-500/25 text-green-400' : 'bg-red-500/10 border-red-500/25 text-red-400'}`}>
                                {ingestMethod === 'spotify' ? <LinkIcon className="w-4 h-4" /> : <Disc className="w-4 h-4" />}
                              </span>
                              <div>
                                <div className="text-sm font-semibold text-white">{ingestMethod === 'spotify' ? 'Spotify track link' : 'YouTube video link'}</div>
                                <div className="text-[11px] text-white/45">Lyra fetches the audio and separates the vocal.</div>
                              </div>
                            </div>
                            <div className="field">
                              <input
                                type="url"
                                placeholder={ingestMethod === 'spotify' ? 'https://open.spotify.com/track/…' : 'https://www.youtube.com/watch?v=…'}
                                value={ingestMethod === 'spotify' ? spotifyUrl : youtubeUrl}
                                onChange={(e) => (ingestMethod === 'spotify' ? setSpotifyUrl(e.target.value) : setYoutubeUrl(e.target.value))}
                              />
                              {(ingestMethod === 'spotify' ? spotifyUrl : youtubeUrl) && (
                                <button
                                  type="button"
                                  onClick={() => (ingestMethod === 'spotify' ? setSpotifyUrl('') : setYoutubeUrl(''))}
                                  className="text-white/40 hover:text-white cursor-pointer"
                                  title="Clear"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {ingestMethod === 'spotify' && isFetchingSpotify && (
                              <div className="text-[11px] text-white/55 flex items-center gap-2 font-mono">
                                <span className="eq-loader text-green-400 !h-3"><span /><span /><span /></span> Looking up the track…
                              </div>
                            )}
                            {ingestMethod === 'spotify' && spotifyMeta && (
                              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 animate-fadeIn">
                                {spotifyMeta.thumbnail && <img src={spotifyMeta.thumbnail} alt="" className="w-10 h-10 rounded-lg object-cover" />}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-semibold text-white truncate">{spotifyMeta.title}</div>
                                  <div className="text-[11px] text-white/55 truncate">{spotifyMeta.artist}</div>
                                </div>
                                <span className="chip chip-green">Matched</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Record */}
                        {ingestMethod === 'record' && (
                          <div className="flex-1 panel-inset p-4 sm:p-5 flex flex-col justify-center gap-4 animate-fadeIn">
                            <div className="flex items-center gap-4">
                              <div className={`rec-orb w-14 h-14 shrink-0 ${isRecording ? 'is-live' : ''}`}>
                                <div className={`w-14 h-14 rounded-full grid place-items-center border transition-colors ${isRecording
                                  ? 'bg-rose-500/20 border-rose-400/60 text-rose-300'
                                  : isRecordedTake
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                    : 'bg-[#e5a958]/10 border-[#e5a958]/35 text-[#e5a958]'}`}>
                                  <Mic className="w-6 h-6" />
                                </div>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                                  {isRecording ? (
                                    <><span className="rec-dot" /> Recording <span className="font-mono text-rose-300">{formatTime(recordingSeconds)}</span></>
                                  ) : isRecordedTake ? (
                                    <>Take ready <span className="text-xs font-mono font-normal text-white/45">{recordingSeconds ? `${recordingSeconds}s` : formatTime(previewDuration)}</span></>
                                  ) : 'Sing into your microphone'}
                                </div>
                                <p className="text-xs text-white/45 mt-0.5">
                                  {isRecording
                                    ? 'Sing clearly — stop when you are done.'
                                    : isTuningVocal
                                      ? 'Tuning your take…'
                                      : isRecordedTake
                                        ? (vocalPitchMode === 'tuned' ? 'Notes snapped to the scale.' : 'Untouched microphone take.')
                                        : 'Headphones help keep the backing track out of your take.'}
                                </p>
                              </div>
                              {isRecording ? (
                                <button type="button" onClick={stopRecording} className="btn btn-danger">
                                  <Square className="fill-current" /> Stop
                                </button>
                              ) : isRecordedTake ? (
                                <button type="button" onClick={startRecording} className="btn btn-secondary btn-sm">
                                  <RotateCcw /> Re-record
                                </button>
                              ) : (
                                <button type="button" onClick={startRecording} className="btn btn-primary">
                                  <span className="w-2 h-2 rounded-full bg-rose-600" /> Record
                                </button>
                              )}
                            </div>

                            {isRecording && <LiveMeter analyser={recAnalyser} className="w-full h-16" />}

                            {!isRecording && isRecordedTake && (
                              <div className="space-y-3 animate-fadeIn">
                                <PitchCompare mode={vocalPitchMode} onSelect={handleSelectPitchMode} tuning={isTuningVocal} hasTuned={Boolean(tunedAudioFile)} rawLabel="Raw voice" RawIcon={Mic} />
                                <PreviewPlayer
                                  playing={previewPlaying}
                                  onToggle={togglePreviewPlay}
                                  time={previewTime}
                                  duration={previewDuration || recordingSeconds}
                                  formatTime={formatTime}
                                  onSeek={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setPreviewTime(val);
                                    if (previewAudioRef.current) previewAudioRef.current.currentTime = val;
                                  }}
                                />
                              </div>
                            )}

                            {!isRecording && !isRecordedTake && <LiveMeter analyser={null} className="w-full h-10 opacity-40" />}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RIGHT: voice + engine */}
                    <div className="flex flex-col gap-4 min-h-0">
                      <div>
                        <span className="eyebrow text-white/45"><span className="text-[#e5a958]">02</span> Voice</span>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          {creationCategory === 'sang_by_me' && (
                            <button type="button" onClick={() => setSelectedModel('raw')} className="option-card" data-active={selectedModel === 'raw'} style={{ '--accent': '#a78bfa' }}>
                              <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 bg-[#a78bfa]/15 text-[#c4b5fd] border border-[#a78bfa]/40"><User className="w-4 h-4" /></span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold truncate">My voice</span>
                                <span className="block text-[11px] text-white/45 truncate">In tune · no model</span>
                              </span>
                            </button>
                          )}
                          {SINGERS.map((sg) => (
                            <button key={sg.id} type="button" onClick={() => setSelectedModel(sg.id)} className="option-card" data-active={selectedModel === sg.id} style={{ '--accent': sg.color }}>
                              <span className="w-9 h-9 rounded-full grid place-items-center shrink-0 text-[11px] font-bold" style={{ background: `${sg.color}1f`, color: sg.color, border: `1px solid ${sg.color}66` }}>
                                {sg.initials}
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold truncate">{sg.name}</span>
                                <span className="block text-[11px] text-white/45 truncate">{sg.vibe}</span>
                              </span>
                              {selectedModel === sg.id && <Check className="w-4 h-4 ml-auto shrink-0" style={{ color: sg.color }} />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="eyebrow text-white/45"><span className="text-[#e5a958]">03</span> Engine & pitch</span>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          {[
                            { id: 'rvc', name: 'RVC v2', sub: 'Tight pitch · 48 kHz', icon: Zap, color: GOLD },
                            { id: 'seedvc', name: 'Seed-VC', sub: 'Clear lyrics · 44.1 kHz', icon: Waves, color: TEAL },
                          ].map((en) => (
                            <button key={en.id} type="button" onClick={() => setSelectedEngine(en.id)} className="option-card" data-active={selectedEngine === en.id} style={{ '--accent': en.color }}>
                              <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: `${en.color}1a`, color: en.color, border: `1px solid ${en.color}55` }}>
                                <en.icon className="w-4 h-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-sm font-semibold">{en.name}</span>
                                <span className="block text-[11px] text-white/45 truncate">{en.sub}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => setFixPitch(!fixPitch)}
                          className="mt-2 w-full option-card !py-3"
                          aria-pressed={fixPitch}
                        >
                          <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0 bg-white/[0.05] border border-white/10 text-[#e5a958]">
                            <Music2 className="w-4 h-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-white">Fix pitch & auto-tune</span>
                            <span className="block text-[11px] text-white/45">{fixPitch ? 'Melody locked to the detected key' : 'Keep the raw, as-sung pitch'}</span>
                          </span>
                          <span className="switch" data-on={fixPitch} />
                        </button>
                      </div>

                      <div className="mt-auto hidden lg:block panel-inset p-4">
                        <div className="eyebrow !text-[10px] text-white/40">Every render includes</div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {['Master 3D', 'Clean Natural', 'Solo vocal', 'Instrumental', 'Original', 'MIDI', 'Key & BPM'].map((t, i) => (
                            <span key={t} className={`chip ${i < 2 ? 'chip-gold' : i > 4 ? 'chip-teal' : ''}`}>{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Render */}
                  <button
                    type="button"
                    onClick={handleConvertTrigger}
                    disabled={isSubmitting || !hasValidInput}
                    className={`btn btn-lg w-full flex-shrink-0 ${isSubmitting || !hasValidInput ? 'btn-secondary' : 'btn-primary shine-btn'}`}
                  >
                    {isSubmitting ? (
                      <><span className="eq-loader"><span /><span /><span /><span /></span> Converting…</>
                    ) : (
                      <>
                        <Sparkles /> Convert song
                        <ArrowRight />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Save-to-cloud confirmation */}
      {showCloudModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="panel rim-glow p-6 sm:p-7 max-w-md w-full space-y-5 overflow-hidden animate-scaleIn">
            <div className="absolute -top-16 -left-16 w-40 h-40 bg-[#e5a958]/15 rounded-full blur-3xl pointer-events-none" />
            <button
              type="button"
              onClick={() => {
                setShowCloudModal(false);
                setPendingAction(null);
              }}
              className="absolute top-4 right-4 btn btn-ghost btn-sm btn-icon"
              title="Close"
            >
              <X />
            </button>

            <div className="relative w-12 h-12 rounded-2xl bg-[#e5a958]/12 border border-[#e5a958]/35 grid place-items-center mx-auto text-[#e5a958]">
              <Cloud className="w-6 h-6" />
            </div>

            <div className="relative text-center space-y-1.5">
              <h3 className="text-lg font-bold text-white tracking-tight">Save this master first?</h3>
              <p className="text-sm text-white/55">
                You're leaving <span className="text-[#e5a958] font-medium">"{cleanTitle(currentResults?.title, 'Current track')}"</span>.
              </p>
            </div>

            <ul className="relative panel-inset p-3.5 space-y-2 text-xs text-white/65">
              <li className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#e5a958] mt-1.5 shrink-0" /> Only the Master 3D mix (~2.8 MB) is uploaded to cloud storage.</li>
              <li className="flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#3fe0c5] mt-1.5 shrink-0" /> Clean Natural and stems stay local — you can re-create Clean Natural any time.</li>
            </ul>

            <div className="relative space-y-2">
              <button
                type="button"
                disabled={isSavingToCloud}
                onClick={async () => {
                  const success = await handleSaveToCloud();
                  if (success) {
                    setShowCloudModal(false);
                    executePendingAction(pendingAction);
                  }
                }}
                className="btn btn-primary w-full"
              >
                {isSavingToCloud ? <><span className="ring-loader" /> Saving…</> : <><Cloud /> Save to cloud</>}
              </button>
              <button
                type="button"
                disabled={isSavingToCloud}
                onClick={async () => {
                  setShowCloudModal(false);
                  if (currentJob?.id) {
                    try {
                      await fetch(`/api/jobs/${currentJob.id}`, { method: 'DELETE' });
                    } catch (e) { }
                  }
                  executePendingAction(pendingAction);
                }}
                className="btn btn-secondary w-full"
              >
                Don't save — discard local audio
              </button>
              <button
                type="button"
                disabled={isSavingToCloud}
                onClick={() => {
                  setShowCloudModal(false);
                  setPendingAction(null);
                }}
                className="btn btn-ghost w-full"
              >
                Stay in the studio
              </button>
            </div>
          </div>
        </div>
      )}

      <ComposerTools
        open={showComposerTools}
        onClose={() => setShowComposerTools(false)}
        job={currentJob}
        onRerendered={() => setCacheBuster(String(Date.now()))}
      />
    </div>
  );
}
