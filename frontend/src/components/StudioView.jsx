import React, { useState, useRef, useEffect } from 'react';
import LyraLogo from './LyraLogo';
import {
  Compass, Music2, Play, Pause,
  Download, Volume2, VolumeX, ArrowRight, ArrowLeft,
  Sparkles, Mic, Upload, Link as LinkIcon, RotateCcw, RotateCw,
  Sliders, MoreHorizontal, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Disc, Loader2, X, RefreshCw,
  PlusCircle, Radio, Trash2, Check, Cloud, Headphones
} from 'lucide-react';
import ProcessingStatus from './ProcessingStatus';
import ComposerTools from './ComposerTools';

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

  const STEM_KEYS = ['master', 'master_clean', 'vocal_arijit', 'instrumental', 'vocal_original'];

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
          LEFT SIDEBAR (Apple-grade Studio layout with original Lyra logo)
         ========================================================================= */}
      <aside className="w-64 sm:w-72 bg-[#0b0c0f]/90 backdrop-blur-xl border-r border-white/[0.07] flex flex-col justify-between p-4 flex-shrink-0 z-20">

        <div className="space-y-4">

          {/* Logo & Back to Landing Link with exact 5-bar Lyra waveform */}
          <div className="flex items-center justify-between px-2 py-1">
            <div
              onClick={onBackToLanding}
              className="flex items-center gap-2.5 cursor-pointer select-none group"
              title="Return to Landing Page"
            >
              <LyraLogo />
              <span
                className="text-lg font-bold uppercase tracking-[0.2em] text-white group-hover:text-[#e5a958] transition-colors leading-normal pb-0.5"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Lyra
              </span>
            </div>
            <button
              type="button"
              onClick={requestBackToLanding}
              className="text-[11px] font-medium text-white/50 hover:text-[#e5a958] flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
              title="Return to Landing Page"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>
          </div>

          {/* + New Song Button */}
          <button
            type="button"
            onClick={requestStartNewSong}
            className="w-full bg-[#1b1e25] hover:bg-[#232731] active:scale-[0.98] text-white text-xs font-semibold py-3 px-4 rounded-xl border border-white/10 hover:border-[#e5a958]/40 flex items-center justify-start gap-2.5 transition-all shadow-sm cursor-pointer group"
          >
            <span className="text-lg font-light leading-none text-[#e5a958] group-hover:scale-110 transition-transform">+</span>
            <span className="font-semibold tracking-wide">New Song</span>
          </button>

          {/* Primary Nav Menu: Only Studio Workspace & My Songs */}
          <nav className="space-y-1 text-xs font-medium text-white/70">
            <button
              type="button"
              onClick={() => setActiveTab('studio')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'studio'
                  ? 'bg-white/10 text-white font-semibold shadow-sm'
                  : 'hover:bg-white/5 hover:text-white'
                }`}
            >
              <Compass className="w-4 h-4 text-[#e5a958]" />
              <span>Studio Workspace</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('my-songs')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all cursor-pointer ${activeTab === 'my-songs'
                  ? 'bg-white/10 text-white font-semibold shadow-sm'
                  : 'hover:bg-white/5 hover:text-white'
                }`}
            >
              <div className="flex items-center gap-3">
                <Music2 className="w-4 h-4 text-white/60" />
                <span>My Songs</span>
              </div>
              {recentJobs.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-[#e5a958] font-mono">
                  {recentJobs.length}
                </span>
              )}
            </button>
          </nav>


        </div>

        {/* Engine Hardware Status Card at Bottom */}
        <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5 text-[11px] space-y-1">
          <div className="flex items-center justify-between text-white/60">
            <span>Voice engines</span>
            <span className="text-[#3fe0c5] font-mono">Online</span>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${sysInfo?.seedvc_available ? 'border-[#3fe0c5]/40 text-[#3fe0c5]' : 'border-white/10 text-white/35'}`} title={sysInfo?.seedvc_available ? 'Seed-VC singing engine installed' : 'Run backend/tools/setup_seedvc.sh to enable Seed-VC'}>
              Seed-VC {sysInfo?.seedvc_available ? '✓' : '· not installed'}
            </span>
            <span className="px-2 py-0.5 rounded-full border border-[#e5a958]/40 text-[#e5a958] text-[10px] font-mono">RVC v2 48k ✓</span>
          </div>
          <div className="text-[10px] text-white/40 truncate font-mono">
            {sysInfo?.torch_device === 'cuda' ? 'NVIDIA GPU' : sysInfo?.torch_device === 'mps' ? 'Apple Silicon' : 'CPU'} acceleration
          </div>
          {storage && (
            <div className="pt-2 mt-1 border-t border-white/5 space-y-1.5">
              <div className="flex items-center justify-between text-white/60">
                <span>Storage</span>
                <span className={`font-mono text-[10px] ${storage.free_gb < 6 ? 'text-rose-300' : 'text-white/50'}`}>{storage.free_gb} GB free</span>
              </div>
              <div className="text-[10px] text-white/40 font-mono">
                {storage.profile === 'lite' ? 'Lite mode · small models' : 'Standard mode'} · songs {storage.songs_mb} MB
              </div>
              <button
                type="button"
                onClick={freeUpSpace}
                disabled={cleaning}
                className="w-full mt-1 px-2 py-1.5 rounded-lg border border-white/10 hover:border-white/25 text-[10px] text-white/70 hover:text-white cursor-pointer disabled:opacity-50"
                title="Deletes temporary files from finished songs. Your masters, stems and MIDI are kept."
              >
                {cleaning ? 'Cleaning…' : 'Free up space'}
              </button>
            </div>
          )}
        </div>

      </aside>

      {/* =========================================================================
          MAIN WORKSPACE (Fixed to Viewport Height - Zero Scrolling)
         ========================================================================= */}
      <main className="flex-1 flex flex-col bg-transparent h-screen overflow-hidden relative select-none">
        {/* Same backdrop as the landing page: perspective grid + warm/teal glow */}
        <div className="hero-grid absolute inset-0 pointer-events-none" />
        <div className="aurora pointer-events-none absolute -top-48 right-[-15%] w-[900px] h-[560px] opacity-70" />

        {/* Viewport Canvas: 100% Fitted inside Viewport Height */}
        <div className="flex-1 h-full max-h-screen overflow-hidden px-4 sm:px-6 py-2 sm:py-3 flex flex-col justify-center items-center">

          {/* =====================================================================
              TAB: MY SONGS (Fixed Viewport Table with Internal Scrollable Rows)
             ===================================================================== */}
          {activeTab === 'my-songs' && (
            <div className="max-w-6xl w-full mx-auto h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden space-y-3 animate-fadeIn">

              {/* Header Title with Total Tracks Count */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-white/10 flex-shrink-0">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight pb-1 leading-normal" style={{ fontFamily: "var(--font-display)" }}>
                      My Created Songs
                    </h3>
                    <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-[#e5a958]/15 text-[#e5a958] border border-[#e5a958]/30">
                      {recentJobs.length} {recentJobs.length === 1 ? 'Track' : 'Tracks'}
                    </span>
                  </div>
                  <p className="text-xs text-white/50">
                    Your converted neural masters with isolated vocal and backing stems.
                  </p>
                </div>
              </div>

              {recentJobs.length === 0 ? (
                <div className="p-16 text-center space-y-3 rounded-2xl bg-white/[0.04] border border-white/5 my-auto">
                  <Disc className="w-10 h-10 text-white/20 mx-auto animate-spin-slow" />
                  <p className="text-base font-semibold text-white/80">No songs created yet</p>
                  <p className="text-xs text-white/50 max-w-sm mx-auto">
                    Transform your first track with Arijit Singh, Sonu Nigam, or KK in one tap.
                  </p>
                  <button
                    type="button"
                    onClick={requestStartNewSong}
                    className="mt-3 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    Upload Song
                  </button>
                </div>
              ) : (
                <div className="bg-[#0e1013]/80 border border-white/10 rounded-2xl flex-1 min-h-0 flex flex-col overflow-hidden shadow-2xl">
                  {/* Fixed Tracklist Column Headers */}
                  <div className="grid grid-cols-12 px-5 py-3 text-[11px] font-mono text-white/40 uppercase tracking-wider border-b border-white/5 bg-black/40 flex-shrink-0">
                    <div className="col-span-1 text-center">#</div>
                    <div className="col-span-6 sm:col-span-6 md:col-span-6">Track & Acoustic Mix</div>
                    <div className="col-span-3 sm:col-span-3 md:col-span-3 text-left">Vocalist</div>
                    <div className="col-span-2 sm:col-span-2 md:col-span-2 text-right">Actions</div>
                  </div>

                  {/* Scrollable Track Rows ONLY (Outer page NEVER scrolls) */}
                  <div className="divide-y divide-white/5 overflow-y-auto flex-1">
                    {recentJobs.map((j, idx) => {
                      const r = j.results || {};
                      const s = r.singer || j.metadata?.singer_name || 'Arijit Singh';
                      const isSelected = (currentJob?.id === j.id);

                      // Clean title from YouTube boilerplate
                      let displayTitle = r.title || j.metadata?.title || 'Studio Audio Project';
                      displayTitle = displayTitle.replace(/#[\w\d_-]+/gi, '');
                      displayTitle = displayTitle.replace(/\|\s*Fan Farmayish[\w\s|]*/gi, '');
                      displayTitle = displayTitle.replace(/\|.*$/g, '');
                      displayTitle = displayTitle.replace(/-\s*Topic/gi, '');
                      displayTitle = displayTitle.trim() || 'Studio Vocal Project';

                      // Vocalist color scheme
                      const isArijit = s.toLowerCase().includes('arijit');
                      const isSonu = s.toLowerCase().includes('sonu');
                      const badgeColor = isArijit
                        ? 'bg-[#e5a958]/15 text-[#e5a958] border-[#e5a958]/30'
                        : isSonu
                          ? 'bg-teal-500/15 text-teal-400 border-teal-500/30'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/30';

                      return (
                        <div
                          key={j.id}
                          onClick={() => requestSwitchJob(j.id)}
                          className={`grid grid-cols-12 items-center px-5 py-3 transition-all duration-200 cursor-pointer group ${isSelected
                              ? 'bg-[#1b1f28] shadow-inner'
                              : 'hover:bg-white/[0.04]'
                            }`}
                        >
                          {/* Col 1: Track Index or Equalizer Wave */}
                          <div className="col-span-1 flex items-center justify-center">
                            {isSelected && isPlaying ? (
                              <div className="flex items-center gap-0.5 h-3.5">
                                <span className="w-1 h-3 bg-[#e5a958] rounded-full animate-wave-bar" style={{ animationDelay: '0.1s' }}></span>
                                <span className="w-1 h-4 bg-[#e5a958] rounded-full animate-wave-bar" style={{ animationDelay: '0.3s' }}></span>
                                <span className="w-1 h-2 bg-[#e5a958] rounded-full animate-wave-bar" style={{ animationDelay: '0.5s' }}></span>
                              </div>
                            ) : (
                              <span className="text-xs font-mono text-white/40 group-hover:hidden">
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                            )}
                            <Play className="w-3.5 h-3.5 text-white hidden group-hover:block fill-current" />
                          </div>

                          {/* Col 2: Album Artwork + Title + Stem Badges */}
                          <div className="col-span-6 sm:col-span-6 md:col-span-6 flex items-center gap-3.5 min-w-0 pr-4">
                            <div className="w-10 h-10 rounded-xl bg-black/60 border border-white/10 flex items-center justify-center text-[#e5a958] flex-shrink-0 overflow-hidden shadow-md">
                              {r.thumbnail ? (
                                <img src={r.thumbnail} alt={displayTitle} className="w-full h-full object-cover" />
                              ) : (
                                <Disc className="w-5 h-5 text-white/40" />
                              )}
                            </div>

                            <div className="min-w-0 space-y-0.5">
                              <h4 className={`text-sm font-semibold truncate transition-colors ${isSelected ? 'text-[#e5a958]' : 'text-white group-hover:text-white'
                                }`}>
                                {displayTitle}
                              </h4>
                              <div className="flex items-center gap-2 text-[11px] text-white/50">
                                <span className="font-mono">{formatTime(r.duration || 180)}</span>
                                <span>•</span>
                                <span className="text-emerald-400 font-mono">4 Discrete Stems</span>
                                {isSelected && (
                                  <>
                                    <span>•</span>
                                    <span className="text-[#e5a958] font-mono font-medium">Loaded in Studio</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Col 3: Vocalist Persona Badge */}
                          <div className="col-span-3 sm:col-span-3 md:col-span-3 flex items-center gap-2">
                            <span className={`text-xs px-3 py-1 rounded-full font-medium border ${badgeColor}`}>
                              {s}
                            </span>
                          </div>

                          {/* Col 4: Quick Actions */}
                          <div className="col-span-2 sm:col-span-2 md:col-span-2 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveJobId(j.id);
                                setActiveTab('studio');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-[#e5a958] hover:text-black text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span className="hidden md:inline">Open Master</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => onDeleteJob && onDeleteJob(j.id, e)}
                              className="text-white/20 hover:text-rose-400 p-2 transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                              title="Delete song"
                            >
                              <Trash2 className="w-4 h-4" />
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



          {/* =====================================================================
          {/* =====================================================================
              TAB: STUDIO WORKSPACE (Fixed Viewport Console)
             ===================================================================== */}
          {activeTab === 'studio' && (
            <div className="max-w-5xl w-full mx-auto h-full max-h-full flex flex-col justify-center overflow-hidden animate-fadeIn">

              {/* If actively processing: show real-time pipeline status */}
              {isSubmitting && currentJob && (
                <div className="animate-fadeIn">
                  <ProcessingStatus job={currentJob} selectedModel={selectedModel} onReset={onResetJob} />
                </div>
              )}

              {/* Studio Master Console */}
              {currentResults && (
                <div className="studio-glass border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between w-full max-w-5xl mx-auto animate-fadeIn relative max-h-full overflow-hidden">

                  {/* Subtle Top Acoustic Rim Glow */}
                  <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-[#e5a958]/50 to-transparent" />

                  {/* Top Master Info Row: Album Art + Clean Title + Voice Persona Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10 flex-shrink-0">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-center text-[#e5a958] flex-shrink-0 overflow-hidden shadow-xl">
                        {currentResults.thumbnail ? (
                          <img src={currentResults.thumbnail} alt={currentResults.title} className="w-full h-full object-cover" />
                        ) : (
                          <Disc className="w-7 h-7 text-white/40" />
                        )}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        {(() => {
                          let cleanTitle = currentResults.title || 'Studio Vocal Project';
                          cleanTitle = cleanTitle.replace(/#[\w\d_-]+/gi, '');
                          cleanTitle = cleanTitle.replace(/\|\s*Fan Farmayish[\w\s|]*/gi, '');
                          cleanTitle = cleanTitle.replace(/\|.*$/g, '');
                          cleanTitle = cleanTitle.replace(/-\s*Topic/gi, '');
                          cleanTitle = cleanTitle.trim() || 'Studio Audio Project';
                          return (
                            <h3 className="text-base sm:text-xl font-bold text-white tracking-tight truncate pb-1 leading-normal" style={{ fontFamily: "var(--font-display)" }}>
                              {cleanTitle}
                            </h3>
                          );
                        })()}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-semibold text-[#e5a958]">
                            {singerName}
                          </span>
                          <span className="text-white/30">•</span>
                          <span className="text-white/60">Dolby 3D Grand Hall Master</span>
                          <span className="text-white/30">•</span>
                          <span className="font-mono text-white/50">{formatTime(duration || currentResults.duration || 180)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Acoustic Badges */}
                    <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1 flex-shrink-0">
                      <span className="text-[11px] font-mono text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Pitch Lock Active
                      </span>
                      <span className="text-[10px] font-mono text-white/40 px-2 py-0.5 rounded-full bg-white/5">
                        40kHz • 32-bit Float PCM
                      </span>
                    </div>
                  </div>

                  {/* Audio Waveform Player with Smooth Scrubber & Seamless Stems */}
                  <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between gap-2.5 my-2 flex-1 min-h-0 overflow-hidden">

                    {/* Top Row of Player: Active Stem Name + Duration & Live Volume */}
                    <div className="flex items-center justify-between gap-3 pb-1.5 border-b border-white/5 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#e5a958]/15 text-[#e5a958] border border-[#e5a958]/30 font-semibold truncate max-w-[280px]">
                          {activeTrack === 'master' ? '✨ Master 3D (Full Spatial Mix)' : activeTrack === 'master_clean' ? '🎧 Clean Natural (Pure Mix - 0 Reverb)' : activeTrack === 'vocal_arijit' ? `🎤 ${singerName} Solo Vocal` : activeTrack === 'instrumental' ? '🎸 Solo Instrumental Backing' : '🎙️ Original Dry Vocal Reference'}
                        </span>
                      </div>

                      {/* Time Duration & Volume */}
                      <div className="flex items-center gap-3 text-xs font-mono text-white/70">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#e5a958] font-bold text-sm sm:text-base">{formatTime(isSeeking ? seekTime : currentTime)}</span>
                          <span className="text-white/30">/</span>
                          <span>{formatTime(duration || currentResults.duration || 180)}</span>
                        </div>

                        <div className="flex items-center gap-1.5 pl-2.5 border-l border-white/10">
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
                          >
                            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                          </button>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={isMuted ? 0 : volume}
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
                            className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#e5a958]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* EXPANSIVE GOLDEN WAVEFORM VISUALIZER (Height dynamically adapts when rack is open) */}
                    <div
                      onClick={handleSeek}
                      onMouseMove={(e) => {
                        const maxD = duration > 0 ? duration : (currentResults?.duration || 180);
                        if (!maxD) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        setHoverTime(ratio * maxD);
                        setHoverX(e.clientX - rect.left);
                      }}
                      onMouseLeave={() => setHoverTime(null)}
                      className={`relative ${showAcousticPanel ? 'h-16 sm:h-20' : 'h-24 sm:h-28'} w-full flex items-center justify-between gap-[1.5px] sm:gap-[2.5px] px-3 bg-black/50 rounded-2xl border border-white/10 overflow-hidden cursor-pointer select-none group shadow-inner transition-all duration-300 flex-shrink-0`}
                      title="Click anywhere on the waveform to scrub"
                    >
                      {/* Playhead needle */}
                      {duration > 0 && (
                        <div
                          className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_15px_#e5a958] z-20 pointer-events-none transition-all duration-75"
                          style={{
                            left: `${Math.min(100, Math.max(0, ((isSeeking ? seekTime : currentTime) / duration) * 100))}%`
                          }}
                        />
                      )}

                      {/* Hover Tooltip */}
                      {hoverTime !== null && (
                        <div
                          className="absolute -top-7 px-2.5 py-1 rounded-md bg-[#1a1a1a] border border-[#555] text-xs font-mono text-[#e5a958] pointer-events-none z-30 transform -translate-x-1/2 shadow-xl"
                          style={{ left: `${hoverX}px` }}
                        >
                          {formatTime(hoverTime)}
                        </div>
                      )}

                      {/* 112 Waveform bars distributed evenly across 100% of the wide container */}
                      {[
                        18, 25, 34, 48, 65, 82, 54, 38, 50, 72, 90, 98, 76, 58, 42, 55, 78, 88, 95, 80,
                        62, 45, 60, 82, 96, 74, 52, 36, 50, 70, 85, 92, 70, 54, 38, 48, 68, 85, 92, 78,
                        58, 42, 55, 75, 88, 96, 82, 64, 48, 62, 80, 94, 72, 52, 38, 50, 68, 84, 90, 75,
                        56, 40, 52, 72, 88, 95, 80, 62, 46, 60, 78, 92, 70, 50, 36, 48, 66, 82, 90, 74,
                        54, 38, 50, 70, 88, 98, 80, 60, 42, 56, 76, 92, 68, 48, 34, 46, 64, 80, 92, 76,
                        52, 36, 48, 68, 86, 94, 78, 58, 40, 28, 20, 14
                      ].map((h, idx) => {
                        const maxD = duration > 0 ? duration : (currentResults?.duration || 180);
                        const pct = maxD > 0 ? ((isSeeking ? seekTime : currentTime) / maxD) : 0;
                        const isActive = (idx / 111) <= pct;
                        return (
                          <div key={idx} className="flex-1 h-full flex items-center justify-center">
                            <span
                              style={{ height: `${h}%` }}
                              className={`w-full max-w-[3px] rounded-full transition-all duration-150 ${isActive
                                  ? 'bg-gradient-to-t from-[#e5a958] via-[#ffd391] to-white shadow-[0_0_10px_rgba(229,169,88,0.7)]'
                                  : 'bg-white/20 group-hover:bg-white/30'
                                }`}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Smooth Range Scrubber Slider (Full Width) */}
                    <div className="space-y-1 flex-shrink-0">
                      <input
                        type="range"
                        min="0"
                        max={duration > 0 ? duration : (currentResults?.duration || 100)}
                        step="0.05"
                        value={isSeeking ? seekTime : currentTime}
                        onMouseDown={handleSeekStart}
                        onTouchStart={handleSeekStart}
                        onChange={handleSeekChange}
                        onMouseUp={handleSeekEnd}
                        onTouchEnd={handleSeekEnd}
                        className="w-full h-1.5 bg-white/[0.03] rounded-lg appearance-none cursor-pointer accent-[#e5a958] hover:accent-[#ffcf87] transition-all"
                      />
                      <div className="flex justify-between text-[11px] font-mono text-white/50 px-1">
                        <span>{formatTime(isSeeking ? seekTime : currentTime)}</span>
                        {duration > 0 && (
                          <span>-{formatTime(Math.max(0, duration - (isSeeking ? seekTime : currentTime)))} remaining</span>
                        )}
                      </div>
                    </div>

                    {/* Stems Selector Buttons Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5 flex-shrink-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { id: 'master', label: '✨ Master 3D', hint: 'Full Dolby 3D Spatial Remaster' },
                          { id: 'master_clean', label: '🎧 Clean Natural', hint: 'Pristine Clean Mix (0 Reverb / Delay Remastering)' },
                          { id: 'vocal_arijit', label: `🎤 ${singerName} Solo`, hint: 'Solo AI Vocal Stem' },
                          { id: 'instrumental', label: '🎸 Instrumental', hint: 'Isolated Instrumental Backing' },
                          { id: 'vocal_original', label: '🎙️ Original Reference', hint: 'Original Input Reference Vocal' }
                        ].map(stem => (
                          <button
                            key={stem.id}
                            type="button"
                            onClick={() => selectTrack(stem.id)}
                            title={stem.hint}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${activeTrack === stem.id
                                ? 'bg-[#e5a958] text-black font-semibold shadow-md'
                                : 'bg-white/5 hover:bg-white/10 text-white/75 border border-white/5'
                              }`}
                          >
                            {stem.label}
                          </button>
                        ))}
                      </div>

                      {/* Acoustic Remaster Accordion Toggle */}
                      <button
                        type="button"
                        onClick={() => setShowAcousticPanel(!showAcousticPanel)}
                        className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer font-medium border transition-all ${showAcousticPanel
                            ? 'bg-[#e5a958]/20 text-[#e5a958] border-[#e5a958]/40'
                            : 'bg-white/5 hover:bg-white/10 text-[#e5a958] border-white/10'
                          }`}
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>{showAcousticPanel ? 'Close Rack' : 'Dolby Acoustic Rack'}</span>
                        {showAcousticPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Transport Controls (Center: -10s, Large Play/Pause, +10s) */}
                    <div className="flex items-center justify-center gap-5 pt-1 pb-1 flex-shrink-0">
                      {/* Skip Backward 10s */}
                      <button
                        type="button"
                        onClick={() => skipTime(-10)}
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
                        title="Skip back 10 seconds"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>

                      {/* Large Circular Play / Pause Button */}
                      <button
                        type="button"
                        onClick={handlePlayPause}
                        disabled={isAudioLoading}
                        className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-white hover:bg-zinc-100 text-black flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer disabled:opacity-75 disabled:cursor-wait"
                        title={isAudioLoading ? "Buffering Audio..." : isPlaying ? "Pause" : "Play"}
                      >
                        {isAudioLoading ? (
                          <Loader2 className="w-6 h-6 text-black animate-spin" />
                        ) : isPlaying ? (
                          <Pause className="w-6 h-6 fill-black" />
                        ) : (
                          <Play className="w-6 h-6 fill-black ml-0.5" />
                        )}
                      </button>

                      {/* Skip Forward 10s */}
                      <button
                        type="button"
                        onClick={() => skipTime(10)}
                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-md"
                        title="Skip forward 10 seconds"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                    </div>

                  </div>

                  {/* Compact Viewport-Safe Acoustic & Dolby Remastering Rack */}
                  {showAcousticPanel && (
                    <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2 animate-fadeIn shadow-2xl flex-shrink-0 mb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-white/5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Sliders className="w-3.5 h-3.5 text-[#e5a958]" />
                          <h4 className="text-xs font-bold text-white">Dolby Acoustic & Spatial Console</h4>
                          {remixSuccessMsg && (
                            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md animate-fadeIn flex items-center gap-1 shadow-sm">
                              <Check className="w-3 h-3" />
                              <span>{remixSuccessMsg}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Re-create Clean Natural Live On-Demand without R2 storage */}
                          <button
                            type="button"
                            onClick={() => handleApplyRemix({ vocalGainDb: 0, instGainDb: 0, hallReverb: 0, spatialDepth: 0 })}
                            disabled={isRemixing}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-[11px] font-medium border border-cyan-500/25 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                            title="Re-creates pure Clean Natural mix live (0 reverb / delay) so no cloud storage is needed"
                          >
                            <Headphones className="w-3 h-3 text-cyan-400" />
                            <span>🎧 Re-create Clean Natural</span>
                          </button>

                          {/* Restore default Dolby 3D Preset */}
                          <button
                            type="button"
                            onClick={() => handleApplyRemix({ vocalGainDb: 2.5, instGainDb: -4.5, hallReverb: 0.05, spatialDepth: 0.03 })}
                            disabled={isRemixing}
                            className="px-2.5 py-1 rounded-lg bg-[#e5a958]/10 hover:bg-[#e5a958]/20 text-[#e5a958] text-[11px] font-medium border border-[#e5a958]/25 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                            title="Restore default Dolby 3D Spatial Master acoustics"
                          >
                            <Sparkles className="w-3 h-3 text-[#e5a958]" />
                            <span>✨ Dolby 3D Preset</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleApplyRemix()}
                            disabled={isRemixing}
                            className="px-3 py-1 rounded-lg bg-[#e5a958] text-black font-semibold text-xs hover:bg-[#f0bb6e] active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                            title="Apply custom slider values to master"
                          >
                            {isRemixing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            <span>Apply</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="space-y-1 p-2 rounded-xl bg-black/30 border border-white/5">
                          <div className="flex justify-between text-[11px] text-white/70">
                            <span>Lead Vocal</span>
                            <span className="font-mono text-[#e5a958]">+{vocalGainDb} dB</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="6"
                            step="0.2"
                            value={vocalGainDb}
                            onChange={(e) => setVocalGainDb(parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/20 rounded accent-[#e5a958]"
                          />
                        </div>

                        <div className="space-y-1 p-2 rounded-xl bg-black/30 border border-white/5">
                          <div className="flex justify-between text-[11px] text-white/70">
                            <span>Music Ducking</span>
                            <span className="font-mono text-[#e5a958]">{instGainDb} dB</span>
                          </div>
                          <input
                            type="range"
                            min="-14"
                            max="0"
                            step="0.5"
                            value={instGainDb}
                            onChange={(e) => setInstGainDb(parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/20 rounded accent-[#e5a958]"
                          />
                        </div>

                        <div className="space-y-1 p-2 rounded-xl bg-black/30 border border-white/5">
                          <div className="flex justify-between text-[11px] text-white/70">
                            <span>Grand Reverb</span>
                            <span className="font-mono text-[#e5a958]">{Math.round(hallReverb * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="0.25"
                            step="0.01"
                            value={hallReverb}
                            onChange={(e) => setHallReverb(parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/20 rounded accent-[#e5a958]"
                          />
                        </div>

                        <div className="space-y-1 p-2 rounded-xl bg-black/30 border border-white/5">
                          <div className="flex justify-between text-[11px] text-white/70">
                            <span>Haas Depth</span>
                            <span className="font-mono text-[#e5a958]">{Math.round(spatialDepth * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="0.15"
                            step="0.01"
                            value={spatialDepth}
                            onChange={(e) => setSpatialDepth(parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/20 rounded accent-[#e5a958]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Lossless Broadcast Download & Cloud Storage Dock */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10 flex-shrink-0">
                    <div className="text-[11px] text-white/50 flex items-center gap-1.5">
                      <span>Download uncompressed master audio or preserve Master 3D in Cloudflare R2.</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setShowComposerTools(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-[#3fe0c5]/15 hover:bg-[#3fe0c5]/25 border border-[#3fe0c5]/40 text-[#3fe0c5] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                        title="Stems, MIDI, key/BPM and section re-render"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Stems · MIDI · Re-render</span>
                      </button>
                      {/* Cloudflare R2 Single-File Cloud Storage Button / Status Badge */}
                      {currentResults.saved_to_cloud ? (
                        <div
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 shadow-md"
                          title="Master 3D audio is safely preserved in Cloudflare R2 edge storage"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Saved to Cloud (Master 3D)</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSaveToCloud()}
                          disabled={isSavingToCloud}
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#e5a958]/20 to-[#e5a958]/35 hover:from-[#e5a958]/30 hover:to-[#e5a958]/50 border border-[#e5a958]/40 text-[#e5a958] hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
                          title="Save only 1 single file (Master 3D, ~2.8MB) to Cloudflare R2 cloud storage"
                        >
                          {isSavingToCloud ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                          <span>{isSavingToCloud ? 'Saving Master 3D...' : '☁️ Save Master 3D to Cloud'}</span>
                        </button>
                      )}

                      <a
                        href={currentResults.master_remastered_wav || `/api/audio/${currentJob.id}/master_wav`}
                        download={`${currentResults.title || 'Lyra_Song'}_Master_3D.wav`}
                        className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Master 3D (WAV)</span>
                      </a>

                      <a
                        href={`/api/audio/${currentJob.id}/master_clean_mp3`}
                        download={`${currentResults.title || 'Lyra_Song'}_Clean_Natural.mp3`}
                        className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                        title="Download Clean Natural Mix without remastering reverb or delay"
                      >
                        <Download className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Clean Natural (MP3)</span>
                      </a>

                      <a
                        href={currentResults.master_remastered_mp3 || `/api/audio/${currentJob.id}/master_mp3`}
                        download={`${currentResults.title || 'Lyra_Song'}_Master_3D.mp3`}
                        className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                      >
                        <Download className="w-3.5 h-3.5 text-[#e5a958]" />
                        <span>Master 3D (MP3)</span>
                      </a>
                    </div>
                  </div>

                </div>
              )}

              {/* Error Notification */}
              {errorMsg && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {/* =================================================================
                  SONG INGESTION DOCK (Completely Fixed Height - Zero Jumping/Shrinking)
                 ================================================================= */}
              {(!currentResults && !activeJobId) && (
                <div className="studio-glass border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col justify-between max-w-4xl w-full mx-auto relative overflow-hidden animate-fadeIn">

                  {/* Subtle Top Ambient Rim Glow */}
                  <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-[#e5a958]/40 to-transparent" />

                  {/* Top Bar: Title & Active Model Badge */}
                  <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/10 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-bold text-white leading-none" style={{ fontFamily: "var(--font-display)" }}>
                        {creationCategory === 'sang_by_me' ? (
                          <>Your <span className="font-accent text-[#e5a958]">Vocal Take</span> & Pitch Engine</>
                        ) : (
                          <>Neural <span className="font-accent text-[#3fe0c5]">AI Song Cover</span> Studio</>
                        )}
                      </h3>
                      <span className="hidden md:inline-block text-[11px] text-white/40">
                        {creationCategory === 'sang_by_me'
                          ? '• Auto-tune, clean echo, & master voice.'
                          : '• Separate stems & resing lead vocals.'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] font-mono text-[#e5a958] px-2.5 py-0.5 rounded-full bg-[#e5a958]/10 border border-[#e5a958]/25 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#e5a958] animate-pulse" />
                        <span>{singerName} · {selectedEngine === 'seedvc' ? 'Seed-VC 44k' : 'RVC v2 48k'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Combined Toolbar: Mode Switcher (Left) + Source Tabs (Right) */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 my-2.5 flex-shrink-0">
                    {/* Mode A vs Mode B */}
                    <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setCreationCategory('sang_by_me');
                          if (ingestMethod === 'spotify' || ingestMethod === 'youtube') {
                            setIngestMethod('record');
                          }
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          creationCategory === 'sang_by_me'
                            ? 'bg-[#e5a958] text-black shadow-sm font-bold'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>Mode A: Vocal Take</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCreationCategory('cover');
                          if (ingestMethod === 'record') {
                            setIngestMethod('file');
                          }
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          creationCategory === 'cover'
                            ? 'bg-[#3fe0c5] text-black shadow-sm font-bold'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Mode B: AI Song Cover</span>
                      </button>
                    </div>

                    {/* Ingestion Source Tabs */}
                    <div className="inline-flex p-1 rounded-xl bg-white/[0.03] border border-white/5">
                      {(creationCategory === 'sang_by_me'
                        ? [
                            { id: 'record', label: 'Microphone (Record)', icon: Mic },
                            { id: 'file', label: 'Upload Vocal Audio', icon: Upload }
                          ]
                        : [
                            { id: 'file', label: 'Upload Song', icon: Upload },
                            { id: 'spotify', label: 'Spotify Track', icon: LinkIcon },
                            { id: 'youtube', label: 'YouTube Video', icon: Disc }
                          ]
                      ).map(tab => {
                        const Icon = tab.icon;
                        const isActive = (ingestMethod === tab.id);
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                              if (previewAudioRef.current) previewAudioRef.current.pause();
                              setPreviewPlaying(false);
                              setIngestMethod(tab.id);
                            }}
                            className={`py-1 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                              isActive
                                ? 'bg-white/15 text-white font-semibold shadow-sm border border-white/20'
                                : 'text-white/50 hover:text-white'
                            }`}
                          >
                            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#e5a958]' : ''}`} />
                            <span>{tab.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* SINGER PERSONA & CONVERSION ENGINE CONSOLE */}
                  <div className="p-3 rounded-xl bg-white/[0.025] border border-white/10 mb-2.5 space-y-2 flex-shrink-0">
                    {/* Row 1: Singer Persona Choice */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-white/50 mb-1">
                        <span className="uppercase tracking-wider font-semibold">1. SELECT SINGER PERSONA</span>
                        <span className="text-[#3fe0c5]">Arijit • Sonu • KK (RVC & Seed-VC Ready)</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {creationCategory === 'sang_by_me' && (
                          <button
                            type="button"
                            onClick={() => setSelectedModel('raw')}
                            className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                              selectedModel === 'raw'
                                ? 'bg-[#e5a958]/20 border-[#e5a958] text-white shadow-sm ring-1 ring-[#e5a958]'
                                : 'bg-white/[0.02] border-white/10 text-white/70 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-xs">Keep My Voice</div>
                              <div className="text-[10px] text-white/50">In Tune • No Model</div>
                            </div>
                            {selectedModel === 'raw' && <Check className="w-3.5 h-3.5 text-[#e5a958]" />}
                          </button>
                        )}

                        {[
                          { id: 'arijit_singh', name: 'Arijit Singh', vibe: 'Soulful & Warmth' },
                          { id: 'sonu_nigam', name: 'Sonu Nigam', vibe: 'Classical & High Sur' },
                          { id: 'kk', name: 'KK', vibe: 'Raw Rock & Power' },
                        ].map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedModel(s.id)}
                            className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                              selectedModel === s.id
                                ? 'bg-[#e5a958]/20 border-[#e5a958] text-white shadow-sm ring-1 ring-[#e5a958]'
                                : 'bg-white/[0.02] border-white/10 text-white/70 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-xs">{s.name}</div>
                              <div className="text-[10px] text-white/50">{s.vibe}</div>
                            </div>
                            {selectedModel === s.id && <Check className="w-3.5 h-3.5 text-[#e5a958]" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Row 2: Choose Engine (Left) & Auto-Tune Pitch Fix (Right) */}
                    <div className="pt-2 border-t border-white/5 grid sm:grid-cols-12 gap-2 items-center">
                      {/* Dual Engine Switch: 7 cols */}
                      <div className="sm:col-span-7 flex items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 shrink-0 mr-1">Engine:</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEngine('rvc')}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                            selectedEngine === 'rvc'
                              ? 'bg-[#e5a958]/20 border-[#e5a958] text-white ring-1 ring-[#e5a958]'
                              : 'bg-white/[0.02] border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-white">⚡ RVC v2</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#e5a958]/15 text-[#e5a958]">48k Metal</span>
                          </div>
                          {selectedEngine === 'rvc' && <Check className="w-3 h-3 text-[#e5a958]" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedEngine('seedvc')}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                            selectedEngine === 'seedvc'
                              ? 'bg-[#3fe0c5]/20 border-[#3fe0c5] text-white ring-1 ring-[#3fe0c5]'
                              : 'bg-white/[0.02] border-white/10 text-white/60 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-white">🌱 Seed-VC</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#3fe0c5]/15 text-[#3fe0c5]">44.1k DiT</span>
                          </div>
                          {selectedEngine === 'seedvc' && <Check className="w-3 h-3 text-[#3fe0c5]" />}
                        </button>
                      </div>

                      {/* Pitch Fix Checkbox: 5 cols */}
                      <div className="sm:col-span-5">
                        <label className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-black/40 border border-white/10 hover:border-[#e5a958]/40 transition cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={fixPitch}
                            onChange={(e) => setFixPitch(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-white/20 text-[#e5a958] bg-black/60 cursor-pointer accent-[#e5a958]"
                          />
                          <span className="text-xs font-semibold text-white truncate">Fix Pitch & Auto-Tune</span>
                          {fixPitch ? (
                            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-full ml-auto">On</span>
                          ) : (
                            <span className="text-[9px] font-mono text-white/40 bg-white/5 px-1.5 py-0.2 rounded-full ml-auto">Raw</span>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* DOCK CONTENT STAGE: Shared audio preview element for all ingest methods */}
                  <div className="min-h-[110px] sm:min-h-[125px] h-auto w-full flex flex-col justify-center my-0.5 flex-shrink-0">

                    {/* Shared preview audio element for listening to recording or uploaded audio */}
                    <audio
                      ref={previewAudioRef}
                      src={vocalPitchMode === 'tuned' ? (tunedAudioUrl || rawAudioUrl) : rawAudioUrl}
                      onTimeUpdate={(e) => setPreviewTime(e.target.currentTime)}
                      onLoadedMetadata={(e) => setPreviewDuration(e.target.duration)}
                      onEnded={() => setPreviewPlaying(false)}
                      onPause={() => setPreviewPlaying(false)}
                      onPlay={() => setPreviewPlaying(true)}
                    />

                    {/* METHOD 1: Audio File Upload */}
                    {ingestMethod === 'file' && (
                      <div className="h-full w-full flex flex-col justify-center">
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

                        {audioFile && !audioFile.name?.startsWith('vocal_recording_') ? (
                          <div className="h-full flex flex-col justify-center space-y-3.5 bg-white/[0.035] p-4 sm:p-5 rounded-2xl border border-white/10 shadow-lg">
                            {/* Top row: Status, File info & Change file button */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <div className="space-y-0.5 min-w-0">
                                  <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2 truncate">
                                    <span className="truncate">{rawAudioFile?.name || audioFile.name}</span>
                                    <span className="text-xs font-mono font-normal text-white/50 flex-shrink-0">
                                      ({((rawAudioFile || audioFile).size / (1024 * 1024)).toFixed(2)} MB)
                                    </span>
                                  </div>
                                  <p className="text-xs text-white/50 truncate">
                                    {isTuningVocal
                                      ? '✨ Applying Studio Sur Lock to perfect pitch notes...'
                                      : (vocalPitchMode === 'tuned'
                                        ? '✨ Pitch Corrected: notes snapped to perfect musical scale'
                                        : '📁 Original audio track without note correction')}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 flex-shrink-0">
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
                                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all cursor-pointer"
                                >
                                  Change file
                                </button>
                                <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                  <Check className="w-3.5 h-3.5" /> Ready
                                </span>
                              </div>
                            </div>

                            {/* Note Correction Mode Toggle & Live Preview */}
                            <div className="pt-2 border-t border-white/5 space-y-3 animate-fadeIn">
                              {/* Toggle Switch: Pitch-Corrected Notes vs Raw Audio */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/10">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectPitchMode('tuned')}
                                    disabled={isTuningVocal && !tunedAudioFile}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${vocalPitchMode === 'tuned'
                                        ? 'bg-gradient-to-r from-[#e5a958] to-[#ffcf87] text-black shadow-md font-bold'
                                        : 'text-white/60 hover:text-white'
                                      }`}
                                  >
                                    {isTuningVocal && !tunedAudioFile ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Sparkles className="w-3.5 h-3.5" />
                                    )}
                                    <span>✨ Fixed Notes (Auto-Tuned)</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleSelectPitchMode('raw')}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${vocalPitchMode === 'raw'
                                        ? 'bg-white/20 text-white font-bold shadow-md'
                                        : 'text-white/60 hover:text-white'
                                      }`}
                                  >
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>Raw Audio</span>
                                  </button>
                                </div>

                                <div className="text-[11px] text-white/50 flex items-center gap-1.5 font-mono">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#e5a958]" />
                                  <span>{vocalPitchMode === 'tuned' ? 'Maximum Studio Sur Lock applied' : 'Direct original audio input'}</span>
                                </div>
                              </div>



                              {/* In-Card Audio Playback Preview */}
                              <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5">
                                <button
                                  type="button"
                                  onClick={togglePreviewPlay}
                                  className="w-8 h-8 rounded-full bg-white hover:bg-zinc-200 text-black flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 cursor-pointer shadow-md"
                                  title={previewPlaying ? "Pause preview" : "Play preview"}
                                >
                                  {previewPlaying ? (
                                    <Pause className="w-3.5 h-3.5 fill-black" />
                                  ) : (
                                    <Play className="w-3.5 h-3.5 fill-black ml-0.5" />
                                  )}
                                </button>

                                <div className="flex-1 flex items-center gap-3 min-w-0">
                                  <input
                                    type="range"
                                    min="0"
                                    max={previewDuration || 1}
                                    step="0.05"
                                    value={previewTime}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value);
                                      setPreviewTime(val);
                                      if (previewAudioRef.current) previewAudioRef.current.currentTime = val;
                                    }}
                                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#e5a958]"
                                  />
                                  <span className="text-[11px] font-mono text-white/60 flex-shrink-0">
                                    {formatTime(previewTime)} / {formatTime(previewDuration)}
                                  </span>
                                </div>
                              </div>
                            </div>
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
                            className={`border-2 border-dashed rounded-xl p-3 flex items-center justify-center gap-3 text-center cursor-pointer transition-all duration-300 ${dragActive
                                ? 'border-[#e5a958] bg-[#e5a958]/10'
                                : 'border-white/15 hover:border-white/30 bg-white/[0.03] hover:bg-white/[0.05]'
                              }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[#e5a958] shrink-0">
                              <Upload className="w-4 h-4" />
                            </div>
                            <div className="text-left">
                              <div className="text-xs sm:text-sm font-bold text-white">
                                Drop vocal or song audio file here (or click to browse)
                              </div>
                              <p className="text-[10px] text-white/50">
                                Supports lossless WAV, MP3, FLAC, M4A, OGG up to 100MB with automatic Sur Lock note fixing.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* METHOD 2: Spotify Track URL */}
                    {ingestMethod === 'spotify' && (
                      <div className="flex flex-col justify-center space-y-2 bg-white/[0.035] p-3 rounded-xl border border-white/5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-white/90 uppercase tracking-wider block">
                            Spotify Song or Track Link
                          </label>
                          <span className="text-[10px] text-white/40 font-mono">open.spotify.com/track/...</span>
                        </div>

                        <div className="flex items-center gap-2.5 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 focus-within:border-green-500 transition-all shadow-inner">
                          <span className="text-[10px] font-bold text-green-400 font-mono px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20">
                            Spotify
                          </span>
                          <input
                            type="url"
                            placeholder="https://open.spotify.com/track/..."
                            value={spotifyUrl}
                            onChange={(e) => setSpotifyUrl(e.target.value)}
                            className="bg-transparent text-xs sm:text-sm text-white placeholder-white/40 focus:outline-none flex-1 font-mono"
                          />
                          {spotifyUrl && (
                            <button type="button" onClick={() => setSpotifyUrl('')} className="text-white/40 hover:text-white p-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {isFetchingSpotify && (
                          <div className="text-[10px] text-white/60 flex items-center gap-1.5 font-mono">
                            <Loader2 className="w-3 h-3 animate-spin text-green-400" />
                            <span>Resolving high-res track metadata and artwork...</span>
                          </div>
                        )}

                        {spotifyMeta && (
                          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-white/5 border border-white/10">
                            {spotifyMeta.thumbnail && (
                              <img src={spotifyMeta.thumbnail} alt={spotifyMeta.title} className="w-8 h-8 rounded object-cover shadow-sm" />
                            )}
                            <div className="flex-1 truncate space-y-0.5">
                              <div className="text-xs font-bold text-white truncate">{spotifyMeta.title}</div>
                              <div className="text-[10px] text-white/60 truncate">{spotifyMeta.artist}</div>
                            </div>
                            <span className="text-[10px] text-green-400 font-mono px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20">
                              Matched
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* METHOD 3: YouTube Video URL */}
                    {ingestMethod === 'youtube' && (
                      <div className="flex flex-col justify-center space-y-2 bg-white/[0.035] p-3 rounded-xl border border-white/5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold text-white/90 uppercase tracking-wider block">
                            YouTube Video Link
                          </label>
                          <span className="text-[10px] text-white/40 font-mono">youtube.com/watch?v=...</span>
                        </div>

                        <div className="flex items-center gap-2.5 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 focus-within:border-red-500 transition-all shadow-inner">
                          <span className="text-[10px] font-bold text-red-400 font-mono px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                            YouTube
                          </span>
                          <input
                            type="url"
                            placeholder="https://www.youtube.com/watch?v=..."
                            value={youtubeUrl}
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                            className="bg-transparent text-xs sm:text-sm text-white placeholder-white/40 focus:outline-none flex-1 font-mono"
                          />
                          {youtubeUrl && (
                            <button type="button" onClick={() => setYoutubeUrl('')} className="text-white/40 hover:text-white p-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* METHOD 4: Microphone Recording */}
                    {ingestMethod === 'record' && (
                      <div className="h-full flex flex-col justify-center space-y-4 bg-white/[0.035] p-5 sm:p-6 rounded-2xl border border-white/5">

                        {/* Top row: Status, Title, Recording state / Action buttons */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isRecording
                                ? 'bg-red-500/20 text-red-500 animate-pulse border border-red-500/40'
                                : audioFile && audioFile.name?.startsWith('vocal_recording_')
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-white/5 text-[#e5a958] border border-white/10'
                              }`}>
                              <Mic className="w-6 h-6" />
                            </div>
                            <div className="space-y-0.5">
                              <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                                {isRecording
                                  ? `Recording Vocal Track (${recordingSeconds}s)...`
                                  : audioFile && audioFile.name?.startsWith('vocal_recording_')
                                    ? (
                                      <>
                                        <span>Vocal Recording Ready</span>
                                        <span className="text-xs font-mono font-normal text-white/50">
                                          ({recordingSeconds ? `${recordingSeconds}s` : formatTime(previewDuration)})
                                        </span>
                                      </>
                                    )
                                    : 'Direct Studio Microphone Ingestion'}
                              </div>
                              <p className="text-xs text-white/50">
                                {isRecording
                                  ? 'Sing clearly with zero latency monitoring'
                                  : isTuningVocal
                                    ? '✨ Applying Studio Sur Lock to perfect your pitch...'
                                    : audioFile && audioFile.name?.startsWith('vocal_recording_')
                                      ? (vocalPitchMode === 'tuned' ? '✨ Pitch Corrected: notes snapped to perfect musical scale' : '🎙️ Original microphone recording without tuning')
                                      : 'Sing or hum directly into your studio or laptop microphone'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 flex-shrink-0">
                            {isRecording ? (
                              <button
                                type="button"
                                onClick={stopRecording}
                                className="px-5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-xs transition-all shadow-lg cursor-pointer active:scale-95"
                              >
                                Stop & Save Track
                              </button>
                            ) : audioFile && audioFile.name?.startsWith('vocal_recording_') ? (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={startRecording}
                                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all cursor-pointer"
                                >
                                  Re-record
                                </button>
                                <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                  <Check className="w-3.5 h-3.5" /> Ready
                                </span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={startRecording}
                                className="px-5 py-2.5 rounded-xl bg-[#e5a958] hover:bg-[#f0bb6e] text-black font-bold text-xs transition-all shadow-lg cursor-pointer active:scale-95"
                              >
                                Start Recording
                              </button>
                            )}
                          </div>
                        </div>

                        {/* RECORDING CONTROLS & NOTE CORRECTION TOGGLE (Only rendered once audio is recorded) */}
                        {audioFile && audioFile.name?.startsWith('vocal_recording_') && (
                          <div className="pt-2 border-t border-white/5 space-y-3 animate-fadeIn">

                            {/* Toggle Switch: Pitch-Corrected Notes vs Raw Voice */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/10">
                                <button
                                  type="button"
                                  onClick={() => handleSelectPitchMode('tuned')}
                                  disabled={isTuningVocal && !tunedAudioFile}
                                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${vocalPitchMode === 'tuned'
                                      ? 'bg-gradient-to-r from-[#e5a958] to-[#ffcf87] text-black shadow-md font-bold'
                                      : 'text-white/60 hover:text-white'
                                    }`}
                                >
                                  {isTuningVocal && !tunedAudioFile ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Sparkles className="w-3.5 h-3.5" />
                                  )}
                                  <span>✨ Fixed Notes (Auto-Tuned)</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSelectPitchMode('raw')}
                                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${vocalPitchMode === 'raw'
                                      ? 'bg-white/20 text-white font-bold shadow-md'
                                      : 'text-white/60 hover:text-white'
                                    }`}
                                >
                                  <Mic className="w-3.5 h-3.5" />
                                  <span>Raw Voice</span>
                                </button>
                              </div>

                              <div className="text-[11px] text-white/50 flex items-center gap-1.5 font-mono">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#e5a958]" />
                                <span>{vocalPitchMode === 'tuned' ? 'Maximum Studio Sur Lock applied' : 'Direct unedited mic input'}</span>
                              </div>
                            </div>



                            {/* In-Card Audio Playback Preview */}
                            <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5">
                              <button
                                type="button"
                                onClick={togglePreviewPlay}
                                className="w-8 h-8 rounded-full bg-white hover:bg-zinc-200 text-black flex items-center justify-center flex-shrink-0 transition-transform active:scale-95 cursor-pointer shadow-md"
                                title={previewPlaying ? "Pause preview" : "Play preview"}
                              >
                                {previewPlaying ? (
                                  <Pause className="w-3.5 h-3.5 fill-black" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-black ml-0.5" />
                                )}
                              </button>

                              <div className="flex-1 flex items-center gap-3 min-w-0">
                                <input
                                  type="range"
                                  min="0"
                                  max={previewDuration || 1}
                                  step="0.05"
                                  value={previewTime}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    setPreviewTime(val);
                                    if (previewAudioRef.current) previewAudioRef.current.currentTime = val;
                                  }}
                                  className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#e5a958]"
                                />
                                <span className="text-[11px] font-mono text-white/60 flex-shrink-0">
                                  {formatTime(previewTime)} / {formatTime(previewDuration || recordingSeconds)}
                                </span>
                              </div>
                            </div>

                          </div>
                        )}

                      </div>
                    )}

                  </div>

                  {/* Submit Transform Button */}
                  <div className="pt-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={handleConvertTrigger}
                      disabled={isSubmitting || !hasValidInput}
                      className={`w-full py-3 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all shadow-xl ${isSubmitting || !hasValidInput
                          ? 'bg-white/10 text-white/30 cursor-not-allowed border border-white/5'
                          : 'bg-[#e5a958] hover:bg-[#f0bb6e] text-black cursor-pointer active:scale-[0.99] shadow-[#e5a958]/25'
                        }`}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin text-white" />
                          <span className="text-white">Synthesizing Vocal Stems with {singerName}...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          <span>Transform Song with {singerName} ({selectedEngine === 'seedvc' ? 'Seed-VC 44.1k' : 'RVC v2 48k'})</span>
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

        </div>

      </main>

      {/* Cloudflare R2 Single-File Cloud Storage Confirmation Modal */}
      {showCloudModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white/[0.04] border border-[#e5a958]/35 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-[0_0_60px_rgba(229,169,88,0.2)] space-y-4 relative overflow-hidden animate-scaleIn">

            {/* Top ambient glow */}
            <div className="absolute -top-16 -left-16 w-36 h-36 bg-[#e5a958]/20 rounded-full blur-3xl pointer-events-none" />

            {/* Close X */}
            <button
              type="button"
              onClick={() => {
                setShowCloudModal(false);
                setPendingAction(null);
              }}
              className="absolute top-4 right-4 p-1 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Cloud Icon */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#e5a958]/25 to-[#e5a958]/5 border border-[#e5a958]/40 flex items-center justify-center mx-auto text-[#e5a958] shadow-inner">
              <Cloud className="w-6 h-6" />
            </div>

            {/* Text Header */}
            <div className="text-center space-y-1">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                Save Master 3D to Cloud Storage?
              </h3>
              <p className="text-xs text-white/60">
                You are navigating away from <span className="text-[#e5a958] font-semibold">"{currentResults?.title || 'Current Track'}"</span>.
              </p>
            </div>

            {/* Info Box */}
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-1.5 text-left text-xs text-white/70">
              <div className="flex items-start gap-2">
                <span className="text-[#e5a958] text-sm leading-none mt-0.5">●</span>
                <span><strong>Only 1 file stored:</strong> Only the Master 3D spatial mix (~2.8 MB) is preserved in Cloudflare R2 cloud storage.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-cyan-400 text-sm leading-none mt-0.5">●</span>
                <span><strong>No extra space wasted:</strong> Clean Natural and stems are not stored in cloud; you can re-create Clean Natural anytime on-demand in the studio.</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              {/* Option 1: Yes, Save to Cloud */}
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
                className="w-full py-3 px-4 rounded-xl bg-[#e5a958] hover:bg-[#f0bb6e] text-black font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-98 disabled:opacity-50"
              >
                {isSavingToCloud ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Saving Master 3D to Cloud...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4" />
                    <span>Yes, Save Master 3D to Cloud</span>
                  </>
                )}
              </button>

              {/* Option 2: Don't Save / Discard */}
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
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-semibold border border-white/10 transition-all cursor-pointer active:scale-98"
              >
                Don't Save (Delete Local Audio & Discard)
              </button>

              {/* Option 3: Cancel */}
              <button
                type="button"
                disabled={isSavingToCloud}
                onClick={() => {
                  setShowCloudModal(false);
                  setPendingAction(null);
                }}
                className="w-full py-2 text-white/40 hover:text-white text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel (Stay in Studio)
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
