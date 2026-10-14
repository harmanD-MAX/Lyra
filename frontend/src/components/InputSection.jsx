import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, Mic, Square, Play, Pause, RotateCcw, 
  FileAudio, CheckCircle2, X, Radio, Music, Loader2
} from 'lucide-react';

const YoutubeIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const SpotifyIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.485 17.308c-.215.353-.674.464-1.026.249-2.812-1.718-6.353-2.107-10.523-1.155-.403.092-.803-.16-.895-.563-.092-.403.16-.803.563-.895 4.568-1.044 8.49-.607 11.632 1.312.352.215.464.674.249 1.026zm1.464-3.255c-.27.44-.848.58-1.288.31-3.218-1.978-8.124-2.55-11.93-1.394-.497.15-1.023-.134-1.173-.631-.15-.497.134-1.023.631-1.173 4.353-1.321 9.774-.679 13.45 1.58.44.27.58.848.31 1.288zm.126-3.39c-3.858-2.29-10.222-2.502-13.904-1.385-.59.18-1.218-.16-1.398-.75-.18-.59.16-1.218.75-1.398 4.236-1.286 11.272-1.036 15.717 1.602.532.316.707 1.006.39 1.538-.316.532-1.006.707-1.538.393z"/>
  </svg>
);

export default function InputSection({
  mode,
  setMode,
  audioFile,
  setAudioFile,
  youtubeUrl,
  setYoutubeUrl,
  spotifyUrl,
  setSpotifyUrl,
  disabled
}) {
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  // Microphone recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [isPlayingRecorded, setIsPlayingRecorded] = useState(false);
  
  // Spotify live preview metadata state
  const [spotifyMeta, setSpotifyMeta] = useState(null);
  const [isFetchingSpotify, setIsFetchingSpotify] = useState(false);
  const [spotifyFetchError, setSpotifyFetchError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const recordedAudioPlayerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Fetch Spotify track preview on URL input
  useEffect(() => {
    if (!spotifyUrl || (!spotifyUrl.includes('spotify.com') && !spotifyUrl.startsWith('spotify:'))) {
      setSpotifyMeta(null);
      setSpotifyFetchError('');
      setIsFetchingSpotify(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsFetchingSpotify(true);
      setSpotifyFetchError('');
      try {
        const res = await fetch(`/api/spotify/info?url=${encodeURIComponent(spotifyUrl.trim())}`);
        if (!res.ok) {
          throw new Error('Track not found on Spotify');
        }
        const data = await res.json();
        if (data.status === 'success' && data.data) {
          setSpotifyMeta(data.data);
        }
      } catch (err) {
        setSpotifyFetchError('Audio will be resolved and downloaded directly during conversion.');
      } finally {
        setIsFetchingSpotify(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [spotifyUrl]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setAudioFile(file);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
        setAudioFile(file);
        const url = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setRecordedAudioUrl(null);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      alert("Microphone permission denied or not available: " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resetRecording = () => {
    setAudioFile(null);
    setRecordedAudioUrl(null);
    setIsRecording(false);
    setRecordingTime(0);
    setIsPlayingRecorded(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#171717] border border-[#282828] rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
      {/* 3 Main Choice Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#10a37f]" />
            Audio Ingestion Source
          </h3>
          <p className="text-xs text-[#888] mt-0.5">
            Choose an audio source to transform with your selected artist persona:
          </p>
        </div>

        {/* 4 Options Switcher in one straight line */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-[#101010] rounded-xl border border-[#262626] w-full sm:w-auto">
          <button
            type="button"
            onClick={() => { setMode('file'); setAudioFile(null); }}
            disabled={disabled || isRecording}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              mode === 'file'
                ? 'bg-[#10a37f] text-black shadow-md font-bold'
                : 'text-[#888] hover:text-[#ddd]'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5 shrink-0" />
            <span>File Upload</span>
          </button>

          <button
            type="button"
            onClick={() => { setMode('record'); setAudioFile(null); }}
            disabled={disabled || isRecording}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              mode === 'record'
                ? 'bg-[#10a37f] text-black shadow-md font-bold'
                : 'text-[#888] hover:text-[#ddd]'
            }`}
          >
            <Mic className="w-3.5 h-3.5 shrink-0" />
            <span>Record Mic</span>
          </button>

          <button
            type="button"
            onClick={() => { setMode('youtube'); setAudioFile(null); }}
            disabled={disabled || isRecording}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              mode === 'youtube'
                ? 'bg-[#10a37f] text-black shadow-md font-bold'
                : 'text-[#888] hover:text-[#ddd]'
            }`}
          >
            <YoutubeIcon className="w-3.5 h-3.5 shrink-0" />
            <span>YouTube URL</span>
          </button>

          <button
            type="button"
            onClick={() => { setMode('spotify'); setAudioFile(null); }}
            disabled={disabled || isRecording}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              mode === 'spotify'
                ? 'bg-[#1DB954] text-black shadow-md font-bold'
                : 'text-[#888] hover:text-[#1DB954]'
            }`}
          >
            <SpotifyIcon className="w-3.5 h-3.5 shrink-0" />
            <span>Spotify URL</span>
          </button>
        </div>
      </div>

      {/* OPTION 1: Upload Audio File */}
      {mode === 'file' && (
        <div>
          {!audioFile ? (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-2xl p-10 sm:p-12 text-center cursor-pointer transition-all ${
                dragActive
                  ? 'border-[#10a37f] bg-[#10a37f]/10 scale-[1.01]'
                  : 'border-[#2d2d2d] hover:border-[#404040] bg-[#121212] hover:bg-[#151515]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac"
                onChange={handleFileChange}
                className="hidden"
                disabled={disabled}
              />
              <div className="w-14 h-14 rounded-2xl bg-[#1c1c1c] border border-[#333] mx-auto flex items-center justify-center mb-3.5 text-[#10a37f]">
                <UploadCloud className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-white mb-1">
                Drop Audio File or Browse Computer
              </p>
              <p className="text-xs text-[#777] mb-4">
                Supports WAV, MP3, FLAC, M4A, AAC (Lossless recommended)
              </p>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-[#10a37f] bg-[#10a37f]/10 px-3 py-1 rounded-full border border-[#10a37f]/25 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Polyphonic music? Demucs extracts clean vocal stem automatically</span>
              </div>
            </div>
          ) : (
            <div className="bg-[#121212] border border-[#2d2d2d] rounded-2xl p-4.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-[#1f1f1f] border border-[#333] flex items-center justify-center text-[#10a37f]">
                  <FileAudio className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white break-all">{audioFile.name}</h4>
                  <p className="text-[11px] text-[#888]">
                    {(audioFile.size / (1024 * 1024)).toFixed(2)} MB • Stems ready for neural conversion
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAudioFile(null)}
                disabled={disabled}
                className="px-3 py-1.5 rounded-xl bg-[#222] hover:bg-[#2c2c2c] text-xs font-semibold text-[#ccc] flex items-center gap-1.5 transition-colors cursor-pointer border border-[#333]"
              >
                <X className="w-3.5 h-3.5 text-[#888]" />
                Remove
              </button>
            </div>
          )}
        </div>
      )}

      {/* OPTION 2: Live Microphone Recording */}
      {mode === 'record' && (
        <div className="bg-[#121212] border border-[#2d2d2d] rounded-2xl p-8 sm:p-10 text-center">
          {!recordedAudioUrl ? (
            <div className="max-w-md mx-auto space-y-5">
              <div className="relative inline-block">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                  isRecording
                    ? 'bg-[#10a37f] text-black shadow-xl shadow-[#10a37f]/40 scale-105 animate-pulse'
                    : 'bg-[#1c1c1c] border border-[#333] text-[#aaa] hover:border-[#10a37f] hover:text-white'
                }`}>
                  <Mic className="w-8 h-8" />
                </div>
                {isRecording && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10a37f] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-[#10a37f]"></span>
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-base font-bold text-white">
                  {isRecording ? 'Capturing Vocal Signal...' : 'Studio Microphone Capture'}
                </h3>
                <p className="text-xs text-[#888] mt-1">
                  {isRecording
                    ? 'Sing or speak into your microphone. Click Stop when finished.'
                    : 'Your vocal performance will be analyzed with sub-cent pitch alignment.'}
                </p>
              </div>

              {isRecording && (
                <div className="text-2xl font-mono font-bold text-[#10a37f] tracking-wider">
                  {formatTimer(recordingTime)}
                </div>
              )}

              <div className="flex items-center justify-center gap-3">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={disabled}
                    className="px-6 py-3 rounded-xl font-bold text-xs text-black bg-[#10a37f] hover:bg-[#12b98f] shadow-lg shadow-[#10a37f]/20 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Start Recording</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="px-6 py-3 rounded-xl font-bold text-xs text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-950/50 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    <span>Stop Recording</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto space-y-4">
              <div className="p-4 rounded-xl bg-[#191919] border border-[#2f2f2f] flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!recordedAudioPlayerRef.current) return;
                      if (isPlayingRecorded) {
                        recordedAudioPlayerRef.current.pause();
                        setIsPlayingRecorded(false);
                      } else {
                        recordedAudioPlayerRef.current.play();
                        setIsPlayingRecorded(true);
                      }
                    }}
                    className="w-10 h-10 rounded-xl bg-[#10a37f] text-black flex items-center justify-center shadow-md transition-all cursor-pointer"
                  >
                    {isPlayingRecorded ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                  </button>
                  <div className="text-left">
                    <p className="text-xs font-bold text-white">Vocal Performance Capture</p>
                    <p className="text-[11px] text-[#888]">Duration: {formatTimer(recordingTime)}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={resetRecording}
                  disabled={disabled}
                  className="px-3 py-1.5 rounded-lg bg-[#242424] hover:bg-[#2c2c2c] text-xs font-semibold text-[#ccc] flex items-center gap-1.5 transition-colors cursor-pointer border border-[#333]"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Re-record</span>
                </button>
              </div>

              <audio
                ref={recordedAudioPlayerRef}
                src={recordedAudioUrl}
                onEnded={() => setIsPlayingRecorded(false)}
                className="hidden"
              />

              <div className="inline-flex items-center gap-1.5 text-xs text-[#10a37f] font-semibold bg-[#10a37f]/10 px-3.5 py-1.5 rounded-full border border-[#10a37f]/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Performance captured! Click below to transform timbre.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OPTION 3: YouTube Song URL */}
      {mode === 'youtube' && (
        <div className="space-y-2.5">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <YoutubeIcon className="w-4 h-4 text-[#888]" />
            </div>
            <input
              type="url"
              placeholder="Paste any YouTube song or video link (e.g. https://www.youtube.com/watch?v=...)"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              disabled={disabled}
              className="w-full pl-11 pr-4 py-3.5 bg-[#121212] border border-[#2d2d2d] rounded-2xl text-xs sm:text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#10a37f] focus:ring-1 focus:ring-[#10a37f] transition-all font-medium"
            />
          </div>
          <p className="text-[11px] text-[#777] pl-1">
            Accepts any public YouTube link. Demucs isolates vocals and backing tracks automatically.
          </p>
        </div>
      )}

      {/* OPTION 4: Spotify Song URL */}
      {mode === 'spotify' && (
        <div className="space-y-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <SpotifyIcon className="w-4 h-4 text-[#1DB954]" />
            </div>
            <input
              type="url"
              placeholder="Paste any Spotify song or track link (e.g. https://open.spotify.com/track/...)"
              value={spotifyUrl || ''}
              onChange={(e) => setSpotifyUrl(e.target.value)}
              disabled={disabled}
              className="w-full pl-11 pr-10 py-3.5 bg-[#121212] border border-[#2d2d2d] rounded-2xl text-xs sm:text-sm text-white placeholder-[#666] focus:outline-none focus:border-[#1DB954] focus:ring-1 focus:ring-[#1DB954] transition-all font-medium"
            />
            {spotifyUrl && (
              <button
                type="button"
                onClick={() => setSpotifyUrl('')}
                disabled={disabled}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#666] hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Live Preview Card */}
          {isFetchingSpotify && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-[#151515] border border-[#252525] rounded-xl text-xs text-[#aaa]">
              <Loader2 className="w-4 h-4 animate-spin text-[#1DB954]" />
              <span>Fetching track details and cover artwork from Spotify...</span>
            </div>
          )}

          {spotifyMeta && !isFetchingSpotify && (
            <div className="flex items-center gap-3.5 p-3.5 bg-gradient-to-r from-[#14231b] to-[#121212] border border-[#1DB954]/30 rounded-xl shadow-lg transition-all animate-fadeIn">
              {spotifyMeta.thumbnail ? (
                <img
                  src={spotifyMeta.thumbnail}
                  alt={spotifyMeta.title}
                  className="w-14 h-14 rounded-lg object-cover shadow-md border border-white/10 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-[#1DB954]/20 flex items-center justify-center shrink-0">
                  <Music className="w-6 h-6 text-[#1DB954]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#1DB954] bg-[#1DB954]/15 px-2 py-0.5 rounded-full border border-[#1DB954]/30">
                    Spotify Track Ready
                  </span>
                  {spotifyMeta.duration > 0 && (
                    <span className="text-[10px] text-[#888] font-mono">
                      {Math.floor(spotifyMeta.duration / 60)}:{(spotifyMeta.duration % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-white truncate">{spotifyMeta.title}</h4>
                <p className="text-xs text-[#aaa] truncate">{spotifyMeta.artist || 'Original Artist'}</p>
              </div>
              <div className="hidden sm:flex flex-col items-end shrink-0 pr-1">
                <div className="w-7 h-7 rounded-full bg-[#1DB954]/15 flex items-center justify-center border border-[#1DB954]/30">
                  <CheckCircle2 className="w-4 h-4 text-[#1DB954]" />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-[#777] px-1">
            <span>Accepts any public Spotify track or podcast link. Demucs isolates vocals and backing tracks automatically.</span>
            <span className="hidden sm:inline-block text-[#1DB954] font-medium">Lossless 44.1kHz WAV</span>
          </div>
        </div>
      )}
    </div>
  );
}
