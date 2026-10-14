import React, { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, Download, Volume2, VolumeX,
  Music, Mic2, Disc, Layers, ArrowLeftRight,
  RefreshCw, CheckCircle2, Sparkles, Radio,
  Compass, Activity, RotateCcw, ChevronDown, ChevronUp,
  Sliders, ShieldCheck
} from 'lucide-react';

export default function StudioPlayer({ jobResults, jobId }) {
  // Active playing track: 'master', 'vocal_arijit', 'vocal_original', 'instrumental'
  const [activeTrack, setActiveTrack] = useState('master');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [comparisonMode, setComparisonMode] = useState('arijit'); // 'arijit' vs 'original'
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekTime, setSeekTime] = useState(0);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverX, setHoverX] = useState(0);

  // Dolby 3D Audio & Grand Hall Orchestra Master State & Sliders
  const [isRemixing, setIsRemixing] = useState(false);
  const [isRemastered, setIsRemastered] = useState(
    Boolean(jobResults?.settings?.echo_amount > 0.02 || jobResults?.settings?.reverb_amount > 0.02)
  );
  const [remixMsg, setRemixMsg] = useState('');
  const [cacheBuster, setCacheBuster] = useState('');
  const [isPanelExpanded, setIsPanelExpanded] = useState(true);

  // 4 Core Dolby & Grand Hall Reverb Pillars
  const [centerAnchor, setCenterAnchor] = useState(1.0); // 1. Direct Center Channel Anchor (100% sur clarity)
  const [spatialDepth, setSpatialDepth] = useState(0.03); // 2. Ultra-Subtle 3D Stereo Spatializer (Haas & ambient reflections)
  const [hallGoonj, setHallGoonj] = useState(0.05); // 3. Grand Hall Orchestra Reverb (Velvet diffusion tail & 4.5kHz damping)
  const [presenceBoostDb, setPresenceBoostDb] = useState(2.8); // 4. Lead Vocal Presence Lift (+2.8dB at 2.8k-4.8kHz)
  
  // Complementary Balance Sliders
  const [vocalGainDb, setVocalGainDb] = useState(2.8); // Lead vocal focus level
  const [instGainDb, setInstGainDb] = useState(-7.5); // Backing music pocket ducking

  const audioRef = useRef(null);

  const res = jobResults || {};
  const singerName = res.singer || (res.settings?.singer_name) || (res.model_name === 'sonu_nigam' ? 'Sonu Nigam' : 'Arijit Singh');

  const applyPreset = (presetName) => {
    if (presetName === 'default') {
      setCenterAnchor(1.0);
      setSpatialDepth(0.03);
      setHallGoonj(0.05);
      setPresenceBoostDb(2.8);
      setVocalGainDb(2.8);
      setInstGainDb(-7.5);
    } else if (presetName === 'symphony') {
      setCenterAnchor(0.95);
      setSpatialDepth(0.055);
      setHallGoonj(0.085);
      setPresenceBoostDb(3.2);
      setVocalGainDb(3.0);
      setInstGainDb(-8.5);
    } else if (presetName === 'diction') {
      setCenterAnchor(1.0);
      setSpatialDepth(0.015);
      setHallGoonj(0.025);
      setPresenceBoostDb(3.5);
      setVocalGainDb(2.5);
      setInstGainDb(-6.0);
    } else if (presetName === 'dry') {
      setCenterAnchor(1.0);
      setSpatialDepth(0.0);
      setHallGoonj(0.0);
      setPresenceBoostDb(0.0);
      setVocalGainDb(0.0);
      setInstGainDb(0.0);
    }
  };

  const handleApplyRemix = async (isCleanRevert = false) => {
    if (!jobId || isRemixing) return;
    setIsRemixing(true);
    setRemixMsg(isCleanRevert ? 'Restoring clean natural mix...' : 'Remastering with custom Dolby 3D & Grand Hall Orchestra settings...');

    try {
      const formData = new FormData();
      formData.append('job_id', jobId);
      formData.append('center_anchor', isCleanRevert ? 1.0 : centerAnchor);
      formData.append('echo_amount', isCleanRevert ? 0.0 : spatialDepth);
      formData.append('reverb_amount', isCleanRevert ? 0.0 : hallGoonj);
      formData.append('presence_boost_db', isCleanRevert ? 0.0 : presenceBoostDb);
      formData.append('vocal_gain_db', isCleanRevert ? 0.0 : vocalGainDb);
      formData.append('inst_gain_db', isCleanRevert ? 0.0 : instGainDb);
      formData.append('warmth', isCleanRevert ? 0.50 : 0.55);
      formData.append('clarity', 0.85);
      formData.append('apply_autotune', true);
      formData.append('autotune_strength', 0.50);

      const res = await fetch('/api/remix', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Failed to remaster track');
      const data = await res.json();

      const newBuster = Date.now().toString();
      setCacheBuster(newBuster);
      setIsRemastered(!isCleanRevert);
      setRemixMsg(!isCleanRevert ? 'Custom master applied! Playing remastered mix.' : 'Clean mix restored!');
      setTimeout(() => setRemixMsg(''), 5000);

      // Seamlessly reload audio element at current playback position without resetting to 0
      const audio = audioRef.current;
      if (audio) {
        const savedTime = audio.currentTime;
        const wasPlaying = isPlaying || (!audio.paused && !audio.ended);

        const baseSrc = (activeTrack === 'vocal_arijit')
          ? (data.vocal_wav || jobResults.vocals_arijit)
          : (data.master_mp3 || data.master_wav || jobResults.master_remastered_mp3 || jobResults.master_remastered_wav);
        const freshUrl = baseSrc.includes('?') ? `${baseSrc}&cb=${newBuster}` : `${baseSrc}?cb=${newBuster}`;

        const handleCanPlay = () => {
          audio.removeEventListener('canplay', handleCanPlay);
          if (savedTime > 0 && isFinite(savedTime) && savedTime < audio.duration) {
            try {
              audio.currentTime = savedTime;
            } catch {
              // ignore seek race
            }
          }
          if (wasPlaying) {
            audio.play().catch(() => { });
          }
        };

        audio.addEventListener('canplay', handleCanPlay);
        audio.src = freshUrl;
        audio.load();
      }
    } catch (err) {
      setRemixMsg(`Remix error: ${err.message}`);
    } finally {
      setIsRemixing(false);
    }
  };



  const getDownloadUrl = (rawUrl) => {
    if (!rawUrl) return '';
    const hasQuery = rawUrl.includes('?');
    const separator = hasQuery ? '&' : '?';
    return `${rawUrl}${separator}download=true${cacheBuster ? `&cb=${cacheBuster}` : ''}`;
  };

  const tracks = [
    {
      id: 'master',
      name: 'Full Remastered Song',
      subtitle: `${singerName} Lead + Remixed Backing Track`,
      src: `${res.master_remastered_mp3 || res.master_remastered_wav}${cacheBuster ? `?cb=${cacheBuster}` : ''}`,
      downloadWav: res.master_remastered_wav,
      downloadMp3: res.master_remastered_mp3,
      badge: 'PRODUCTION MASTER',
      badgeColor: 'bg-[#10a37f]/15 text-[#10a37f] border-[#10a37f]/30',
      icon: Disc,
    },
    {
      id: 'vocal_arijit',
      name: `${singerName} Vocal Stem`,
      subtitle: 'Auto-Tuned & Polished Lead Acapella • Pure Sur & Timbre',
      src: `${res.vocals_arijit}${cacheBuster ? `?cb=${cacheBuster}` : ''}`,
      downloadWav: res.vocals_arijit,
      badge: 'SOLO VOCAL',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      icon: Mic2,
    },
    {
      id: 'instrumental',
      name: 'Isolated Instrumental Backing',
      subtitle: 'Demucs Extracted Music (Drums, Bass, Guitars, Synths)',
      src: res.instrumental,
      downloadWav: res.instrumental,
      badge: 'BACKING TRACK',
      badgeColor: 'bg-zinc-800 text-zinc-300 border-zinc-700',
      icon: Music,
    },
    {
      id: 'vocal_original',
      name: 'Original Vocal Input Stem',
      subtitle: `Raw Isolated Singer Before ${singerName} Voice Conversion`,
      src: res.vocals_original || res.input_audio,
      downloadWav: res.vocals_original || res.input_audio,
      badge: 'BEFORE CONVERSION',
      badgeColor: 'bg-zinc-900 text-zinc-400 border-zinc-800',
      icon: Layers,
    }
  ].filter(t => !!t.src);

  const currentTrackData = tracks.find(t => t.id === activeTrack) || tracks[0];

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Handle changing tracks while maintaining current time if desired
  const selectTrack = (trackId) => {
    const prevTime = audioRef.current ? audioRef.current.currentTime : 0;
    setActiveTrack(trackId);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = prevTime;
        if (isPlaying) {
          audioRef.current.play().catch(() => { });
        }
      }
    }, 50);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Playback error:", err);
      });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && !isSeeking) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration && !isNaN(audioRef.current.duration) && audioRef.current.duration > 0) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const handleSeekChange = (e) => {
    const newTime = parseFloat(e.target.value);
    setSeekTime(newTime);
    setCurrentTime(newTime);
  };

  const handleSeekEnd = (e) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    setCurrentTime(newTime);
    setIsSeeking(false);
  };

  const formatTime = (seconds) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Instant A/B Comparison Switcher
  const toggleABComparison = () => {
    if (comparisonMode === 'arijit') {
      setComparisonMode('original');
      selectTrack('vocal_original');
    } else {
      setComparisonMode('arijit');
      selectTrack('vocal_arijit');
    }
  };

  if (!jobResults) return null;

  return (
    <div className="bg-[#171717] border border-[#282828] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={currentTrackData?.src}
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onDurationChange={(e) => {
          if (e.target.duration && !isNaN(e.target.duration)) {
            setDuration(e.target.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Header with Title and A/B Comparison Switch */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#10a37f] bg-[#10a37f]/10 px-2.5 py-0.5 rounded-full border border-[#10a37f]/25">
              Synthesis Complete
            </span>
            <span className="text-xs text-[#888]">
              {jobResults.title || 'Studio Audio Project'}
            </span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {singerName} Studio Listening Console
          </h2>
        </div>

        {/* Instant A/B Compare Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleABComparison}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${comparisonMode === 'arijit'
                ? 'bg-[#10a37f]/10 border-[#10a37f]/40 text-[#10a37f] shadow-md'
                : 'bg-[#1f1f1f] border-[#333] text-[#ccc]'
              }`}
          >
            <ArrowLeftRight className="w-4 h-4 text-[#10a37f]" />
            <span>A/B Compare: </span>
            <span className="font-extrabold underline decoration-[#10a37f]">
              {comparisonMode === 'arijit' ? `${singerName} Voice` : 'Original Input Voice'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Studio Deck Player */}
      <div className="bg-[#101010] border border-[#242424] rounded-2xl p-6 sm:p-8 mb-8 shadow-inner">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={togglePlay}
              className="w-16 h-16 rounded-2xl bg-[#10a37f] hover:bg-[#12b98f] text-black flex items-center justify-center shadow-xl shadow-[#10a37f]/25 hover:scale-105 active:scale-95 transition-all flex-shrink-0 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-7 h-7 fill-black" /> : <Play className="w-7 h-7 fill-black ml-1" />}
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${currentTrackData.badgeColor}`}>
                  {currentTrackData.badge}
                </span>
                <span className="text-xs text-[#777]">Playing Now</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">{currentTrackData.name}</h3>
              <p className="text-xs text-[#888]">{currentTrackData.subtitle}</p>
            </div>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-3 bg-[#171717] px-4 py-2 rounded-xl border border-[#282828] self-end sm:self-center">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="text-[#888] hover:text-white cursor-pointer"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                setIsMuted(false);
              }}
              className="w-20 h-1.5 bg-[#2a2a2a] rounded-lg appearance-none cursor-pointer accent-[#10a37f]"
            />
          </div>
        </div>

        {/* Upgraded High-Precision Waveform Visualizer & Direct Seek */}
        <div className="space-y-2.5 mb-5">
          <div
            onMouseMove={(e) => {
              if (!duration || duration <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setHoverTime(ratio * duration);
              setHoverX(e.clientX - rect.left);
            }}
            onMouseLeave={() => setHoverTime(null)}
            onClick={(e) => {
              if (!duration || duration <= 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const targetTime = ratio * duration;
              if (audioRef.current) {
                audioRef.current.currentTime = targetTime;
              }
              setCurrentTime(targetTime);
            }}
            title="Click or drag anywhere to seek"
            className="h-20 flex items-center gap-[2px] sm:gap-[3px] px-3 py-2 bg-[#0d0d0d] rounded-2xl border border-[#242424] overflow-hidden cursor-pointer hover:border-[#383838] transition-colors relative group select-none"
          >
            {/* Realtime Playhead Needle */}
            {duration > 0 && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_12px_#10a37f] z-20 pointer-events-none transition-all duration-75"
                style={{
                  left: `${Math.min(100, Math.max(0, ((isSeeking ? seekTime : currentTime) / duration) * 100))}%`
                }}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-[#10a37f] border-2 border-white absolute -top-1 -left-[4px] shadow-md shadow-[#10a37f]/50"></div>
              </div>
            )}

            {/* Hover Timestamp Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-7 px-2 py-0.5 rounded-md bg-[#222] border border-[#333] text-[10px] font-mono text-[#10a37f] pointer-events-none z-30 transform -translate-x-1/2 shadow-lg"
                style={{ left: `${hoverX}px` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}

            {/* 64-Bar Mirror Spectrogram Visualizer */}
            {Array.from({ length: 64 }).map((_, i) => {
              const activeRatio = duration > 0 ? (isSeeking ? seekTime : currentTime) / duration : 0;
              const barRatio = i / 64;
              const isPassed = barRatio <= activeRatio;

              // Organic simulated frequency envelope
              const envelope = Math.sin((i / 64) * Math.PI);
              const harmonic = Math.sin(i * 0.45) * 18 + Math.cos(i * 0.8) * 14;
              const baseHeight = 22 + envelope * 38 + harmonic;
              const dynamicBounce = isPlaying ? Math.sin((currentTime * 10) + (i * 0.5)) * 16 : 0;
              const heightPct = Math.min(95, Math.max(14, baseHeight + dynamicBounce));

              return (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-all duration-100 ${isPassed
                      ? 'bg-[#10a37f] shadow-[0_0_8px_rgba(16,163,127,0.4)] opacity-100'
                      : 'bg-[#262626] group-hover:bg-[#2e2e2e] opacity-45'
                    }`}
                  style={{ height: `${heightPct}%` }}
                ></div>
              );
            })}
          </div>

          {/* Time Scrubber Slider & Monospace Timestamps */}
          <div className="space-y-1.5 px-0.5">
            <div className="relative flex items-center">
              <input
                type="range"
                min="0"
                max={duration > 0 ? duration : 100}
                step="0.05"
                value={isSeeking ? seekTime : currentTime}
                onMouseDown={handleSeekStart}
                onTouchStart={handleSeekStart}
                onChange={handleSeekChange}
                onMouseUp={handleSeekEnd}
                onTouchEnd={handleSeekEnd}
                className="w-full h-2 bg-[#222] rounded-lg appearance-none cursor-pointer accent-[#10a37f] hover:accent-[#12b98f] transition-all"
              />
            </div>

            <div className="flex justify-between items-center text-xs font-mono text-[#888]">
              <div className="flex items-center gap-2">
                <span className="text-[#10a37f] font-bold text-sm">
                  {formatTime(isSeeking ? seekTime : currentTime)}
                </span>
                <span className="text-[#555]">/</span>
                <span>{formatTime(duration)}</span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-[#666]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10a37f]/70"></span>
                <span>40kHz Studio PCM</span>
                {duration > 0 && (
                  <span className="hidden sm:inline text-[#555]">
                    • -{formatTime(Math.max(0, duration - (isSeeking ? seekTime : currentTime)))} remaining
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Track Console & Download Selector */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#10a37f]" />
            <span>Multi-Track Audio Stems & Stems Export</span>
          </h4>
          <span className="text-[10px] text-[#10a37f] font-medium bg-[#10a37f]/10 px-2 py-0.5 rounded-full border border-[#10a37f]/20">
            ✓ Phase-aligned lossless stems
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tracks.map((track) => {
            const isSelected = activeTrack === track.id;
            const Icon = track.icon;

            return (
              <div
                key={track.id}
                onClick={() => selectTrack(track.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${isSelected
                    ? 'bg-[#1a1a1a] border-[#10a37f] shadow-lg shadow-[#10a37f]/10'
                    : 'bg-[#121212] border-[#252525] hover:border-[#383838] hover:bg-[#151515]'
                  }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[#10a37f]/20 text-[#10a37f]' : 'bg-[#1a1a1a] text-[#777]'
                    }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h5 className="text-xs font-bold text-white truncate">{track.name}</h5>
                      <span className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded border ${track.badgeColor}`}>
                        {track.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#888] truncate mt-0.5">{track.subtitle}</p>
                  </div>
                </div>

                {/* Direct Download Button */}
                <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {track.downloadWav && (
                    <a
                      href={getDownloadUrl(track.downloadWav)}
                      download
                      title="Download Lossless WAV"
                      className="px-2.5 py-1.5 rounded-lg bg-[#202020] hover:bg-[#282828] text-[#ccc] hover:text-white border border-[#303030] text-[11px] font-semibold flex items-center gap-1 transition-all"
                    >
                      <Download className="w-3.5 h-3.5 text-[#10a37f]" />
                      <span>WAV</span>
                    </a>
                  )}
                  {track.downloadMp3 && (
                    <a
                      href={getDownloadUrl(track.downloadMp3)}
                      download
                      title="Download 320kbps MP3"
                      className="px-2.5 py-1.5 rounded-lg bg-[#202020] hover:bg-[#282828] text-[#ccc] hover:text-white border border-[#303030] text-[11px] font-semibold flex items-center gap-1 transition-all"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-400" />
                      <span>MP3</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dolby 3D Audio & Grand Hall Orchestra Engine - Interactive Mastering Section */}
      <div className="pt-2 border-t border-[#262626]">
        <div className="bg-[#141414] border border-[#272727] rounded-2xl p-5 sm:p-6 shadow-2xl transition-all">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Dolby 3D Audio & Grand Hall Orchestra Engine
                </h3>
                <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Mastering Suite
                </span>
              </div>
              <p className="text-xs text-[#888]">
                Adjust the 4 acoustic pillars with interactive sliders and remaster immediately without re-running neural RVC.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsPanelExpanded(!isPanelExpanded)}
              className="text-xs font-semibold text-[#888] hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1f1f1f] border border-[#2e2e2e] transition-colors cursor-pointer"
            >
              <span>{isPanelExpanded ? 'Collapse Sliders' : 'Expand Sliders'}</span>
              {isPanelExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Quick Acoustic Presets */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#777] mr-1">Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset('default')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#1e1e1e] hover:bg-[#282828] text-white border border-[#333] transition-colors cursor-pointer"
            >
              Dolby 3D Master (Default)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('symphony')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#1e1e1e] hover:bg-[#282828] text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
            >
              Grand Symphony Hall
            </button>
            <button
              type="button"
              onClick={() => applyPreset('diction')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#1e1e1e] hover:bg-[#282828] text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
            >
              Intimate Diction
            </button>
            <button
              type="button"
              onClick={() => applyPreset('dry')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#1e1e1e] hover:bg-[#282828] text-[#aaa] border border-[#333] transition-colors cursor-pointer"
            >
              100% Dry Clean Mix
            </button>
          </div>

          {isPanelExpanded && (
            <div className="space-y-4 mb-6 animate-fadeIn">
              {/* The 4 Core Pillars Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pillar 1: Direct Center Channel Anchor */}
                <div className="bg-[#101010] p-4 rounded-xl border border-[#242424] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-emerald-400" />
                      <span>1. Direct Center Channel Anchor</span>
                    </label>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {Math.round(centerAnchor * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={centerAnchor}
                    onChange={(e) => setCenterAnchor(parseFloat(e.target.value))}
                    disabled={isRemixing}
                    className="w-full h-1.5 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                  <p className="text-[11px] text-[#777] leading-relaxed">
                    Preserves dead-center lead vocal presence for 100% Hindi diction & sur clarity. Keeps vocals stationary and pristine in the center of the soundstage.
                  </p>
                </div>

                {/* Pillar 2: Ultra-Subtle 3D Stereo Spatializer */}
                <div className="bg-[#101010] p-4 rounded-xl border border-[#242424] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-cyan-400" />
                      <span>2. Ultra-Subtle 3D Stereo Spatializer</span>
                    </label>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      {spatialDepth.toFixed(3)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.10"
                    step="0.005"
                    value={spatialDepth}
                    onChange={(e) => setSpatialDepth(parseFloat(e.target.value))}
                    disabled={isRemixing}
                    className="w-full h-1.5 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <p className="text-[11px] text-[#777] leading-relaxed">
                    Gentle Haas micro-delays (11.5ms L / 17.8ms R) + stationary reflections (95ms, 185ms, 275ms) + 200Hz-3.6kHz bandpass for transparent side width without circular panning.
                  </p>
                </div>

                {/* Pillar 3: Grand Hall Orchestra Reverb */}
                <div className="bg-[#101010] p-4 rounded-xl border border-[#242424] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>3. Grand Hall Orchestra Reverb</span>
                    </label>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {hallGoonj.toFixed(3)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.15"
                    step="0.005"
                    value={hallGoonj}
                    onChange={(e) => setHallGoonj(parseFloat(e.target.value))}
                    disabled={isRemixing}
                    className="w-full h-1.5 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-amber-400"
                  />
                  <p className="text-[11px] text-[#777] leading-relaxed">
                    Ultra-soft, delicate late diffusion tail with 4.5kHz high-cut absorption damping to prevent clutter or splash behind singing words.
                  </p>
                </div>

                {/* Pillar 4: Lead Vocal Presence */}
                <div className="bg-[#101010] p-4 rounded-xl border border-[#242424] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-rose-400" />
                      <span>4. Lead Vocal Presence Lift</span>
                    </label>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      +{presenceBoostDb.toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="6.0"
                    step="0.2"
                    value={presenceBoostDb}
                    onChange={(e) => setPresenceBoostDb(parseFloat(e.target.value))}
                    disabled={isRemixing}
                    className="w-full h-1.5 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-rose-400"
                  />
                  <p className="text-[11px] text-[#777] leading-relaxed">
                    Upper-mid presence lift (+2.8dB at 2.8kHz - 4.8kHz) for crystal clear lyric intelligibility and forward vocal prominence.
                  </p>
                </div>
              </div>

              {/* Master Balance Controls Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="bg-[#101010] p-3.5 rounded-xl border border-[#242424] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-medium flex items-center gap-1.5">
                      <Mic2 className="w-3.5 h-3.5 text-emerald-400" />
                      Lead Vocal Master Level
                    </span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {vocalGainDb > 0 ? `+${vocalGainDb.toFixed(1)}` : vocalGainDb.toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-6.0"
                    max="6.0"
                    step="0.5"
                    value={vocalGainDb}
                    onChange={(e) => setVocalGainDb(parseFloat(e.target.value))}
                    disabled={isRemixing}
                    className="w-full h-1.5 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>

                <div className="bg-[#101010] p-3.5 rounded-xl border border-[#242424] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-medium flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-indigo-400" />
                      Music Backing Pocket Ducking
                    </span>
                    <span className="font-mono text-indigo-400 font-bold">
                      {instGainDb.toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-18.0"
                    max="0.0"
                    step="0.5"
                    value={instGainDb}
                    onChange={(e) => setInstGainDb(parseFloat(e.target.value))}
                    disabled={isRemixing}
                    className="w-full h-1.5 bg-[#252525] rounded-lg appearance-none cursor-pointer accent-indigo-400"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#202020]">
            <div className="flex items-center gap-2 text-xs text-[#777]">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Broadcast Normalization (-14 LUFS) & True-Peak Limiter (-0.5 dBFS)</span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleApplyRemix(true)}
                disabled={isRemixing}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-xs bg-[#202020] hover:bg-[#282828] text-[#ccc] border border-[#333] transition-all cursor-pointer"
              >
                Revert Clean Mix
              </button>

              <button
                type="button"
                onClick={() => handleApplyRemix(false)}
                disabled={isRemixing}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 bg-[#10a37f] hover:bg-[#12b98f] text-black shadow-lg shadow-[#10a37f]/20 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRemixing ? 'animate-spin' : ''}`} />
                <span>{isRemixing ? 'Remastering...' : 'Remaster with Custom Settings'}</span>
              </button>
            </div>
          </div>

          {remixMsg && (
            <div className="mt-3 text-center text-xs font-semibold text-[#10a37f] flex items-center justify-center gap-1.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4" />
              <span>{remixMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
