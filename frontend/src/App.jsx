import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import InputSection from './components/InputSection';
import ProcessingStatus from './components/ProcessingStatus';
import StudioPlayer from './components/StudioPlayer';
import {
  Wand2, Mic2, AlertCircle, History,
  Disc, CheckCircle2, Trash2, ArrowLeft
} from 'lucide-react';

export default function App() {
  // Navigation view: 'landing' | 'studio'
  const [currentView, setCurrentView] = useState('landing');

  // 4 Input states: 'file' | 'record' | 'youtube' | 'spotify'
  const [mode, setMode] = useState('file');
  const [audioFile, setAudioFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');

  // Model selection: 'arijit_singh' | 'sonu_nigam' | 'kk'
  const [selectedModel, setSelectedModel] = useState('arijit_singh');

  // Pipeline states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [currentJob, setCurrentJob] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [recentJobs, setRecentJobs] = useState([]);
  const [sysInfo, setSysInfo] = useState(null);

  const pollIntervalRef = useRef(null);

  const fetchRecentJobs = () => {
    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => {
        if (data.jobs) setRecentJobs(data.jobs);
      })
      .catch(() => { });
  };

  useEffect(() => {
    fetchRecentJobs();
    fetch('/api/info')
      .then(res => res.json())
      .then(data => setSysInfo(data))
      .catch(() => { });
  }, []);

  const handleDeleteJob = async (jobId, e) => {
    e.stopPropagation();
    try {
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      setRecentJobs(prev => prev.filter(j => j.id !== jobId));
      if (activeJobId === jobId) {
        setActiveJobId(null);
        setCurrentJob(null);
      }
    } catch (err) {
      console.error("Failed to delete job:", err);
    }
  };

  // Poll job status
  useEffect(() => {
    if (!activeJobId) return;

    const checkStatus = () => {
      fetch(`/api/status/${activeJobId}`)
        .then(res => {
          if (!res.ok) {
            throw new Error(res.status === 404 ? 'Job session expired' : `Server status ${res.status}`);
          }
          return res.json();
        })
        .then(job => {
          if (!job || !job.status) {
            throw new Error('Invalid status response from server');
          }
          setCurrentJob(job);
          if (job.status === 'completed' || job.status === 'error') {
            clearInterval(pollIntervalRef.current);
            setIsSubmitting(false);
            fetchRecentJobs();
          }
        })
        .catch(err => {
          console.error("Status polling failed:", err);
          clearInterval(pollIntervalRef.current);
          setIsSubmitting(false);
          setErrorMsg(err.message || 'Lost connection to processing server. Check backend terminal.');
        });
    };

    checkStatus();
    pollIntervalRef.current = setInterval(checkStatus, 2000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeJobId]);

  const handleStartConversion = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if ((mode === 'file' || mode === 'record') && !audioFile) {
      setErrorMsg(mode === 'record' ? 'Please record your voice first before converting.' : 'Please upload an audio file first.');
      return;
    }

    if (mode === 'youtube' && (!youtubeUrl || !youtubeUrl.trim())) {
      setErrorMsg('Please paste a valid YouTube song or video link.');
      return;
    }

    if (mode === 'spotify' && (!spotifyUrl || !spotifyUrl.trim())) {
      setErrorMsg('Please paste a valid Spotify track link.');
      return;
    }

    setIsSubmitting(true);
    setCurrentJob(null);

    const formData = new FormData();
    if ((mode === 'file' || mode === 'record') && audioFile) {
      formData.append('audio_file', audioFile);
    } else if (mode === 'youtube') {
      formData.append('youtube_url', youtubeUrl.trim());
    } else if (mode === 'spotify') {
      formData.append('spotify_url', spotifyUrl.trim());
    }

    formData.append('model_name', selectedModel);
    formData.append('pitch_shift', 0);
    formData.append('f0_method', 'rmvpe');         // Continuous sub-cent neural pitch tracking
    formData.append('index_rate', 0.28);           // Optimal sweet spot: zero warping on yodels/high notes
    formData.append('protect', 0.50);              // Smooth transition protection for unvoiced / falsetto / yodels
    formData.append('vocal_gain_db', 0.0);         // Clean natural vocal level
    formData.append('inst_gain_db', 0.0);          // Balanced original music level
    formData.append('reverb_amount', 0.0);         // Dry clean voice (applied on Remaster button)
    formData.append('echo_amount', 0.0);           // Dry clean voice (applied on Remaster button)
    formData.append('warmth', 0.50);
    formData.append('clarity', 0.85);
    formData.append('apply_autotune', true);       // Praat PSOLA smooth 35ms retune speed
    formData.append('autotune_strength', 0.50);
    formData.append('has_music', mode !== 'record');

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to start conversion process');
      }

      const data = await response.json();
      setActiveJobId(data.job_id);
    } catch (err) {
      setErrorMsg(err.message || 'Error communicating with audio backend server');
      setIsSubmitting(false);
    }
  };

  const getSingerDisplayName = (modelKey) => {
    switch (modelKey) {
      case 'sonu_nigam': return 'Sonu Nigam';
      default: return 'Arijit Singh';
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#ececec] flex flex-col selection:bg-[#10a37f] selection:text-white">
      {/* Universal Navbar */}
      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        sysInfo={sysInfo}
      />

      {/* View 1: Landing Page */}
      {currentView === 'landing' ? (
        <LandingPage
          onLaunchStudio={(modelKey) => {
            if (modelKey) setSelectedModel(modelKey);
            setCurrentView('studio');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          models={sysInfo?.models || []}
          sysInfo={sysInfo}
        />
      ) : (
        /* View 2: Studio / Conversion Engine */
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 animate-fadeIn">
          {/* Back to Landing Link */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentView('landing')}
              className="text-xs text-[#888] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#10a37f]" />
              <span>Back to Overview</span>
            </button>
            <span className="text-[11px] font-mono text-[#666]">
              Engine: {sysInfo?.torch_device === 'mps' ? 'MPS Accelerated' : 'Neural Core'}
            </span>
          </div>

          {/* Hero Header */}
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
              Neural Studio Vocal Conversion
            </h1>

            <p className="text-xs sm:text-sm text-[#888]">
              Select a neural vocalist persona, provide your audio input, and synthesize studio-quality remastered stems.
            </p>
          </div>

          {/* Error Notification */}
          {errorMsg && (
            <div className="max-w-2xl mx-auto p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleStartConversion} className="space-y-6">
            {/* 1. Singer Selection Switcher */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold tracking-wider uppercase text-[#888] flex items-center gap-1.5">
                  <Mic2 className="w-4 h-4 text-[#10a37f]" />
                  <span>1. Choose Neural Vocalist Persona</span>
                </label>
                <span className="text-[11px] text-[#666] font-medium font-mono">
                  2 Studio Weights Loaded
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Arijit Singh Option */}
                <button
                  type="button"
                  onClick={() => setSelectedModel('arijit_singh')}
                  disabled={isSubmitting}
                  className={`relative p-5 rounded-2xl border text-left transition-all cursor-pointer ${selectedModel === 'arijit_singh'
                      ? 'bg-[#1a1a1a] border-[#10a37f] shadow-lg shadow-[#10a37f]/10 ring-1 ring-[#10a37f]/40'
                      : 'bg-[#141414] border-[#252525] hover:border-[#383838] opacity-75 hover:opacity-100'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-extrabold text-white flex items-center gap-2">
                      Arijit Singh
                      {selectedModel === 'arijit_singh' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#10a37f]/20 text-[#10a37f] border border-[#10a37f]/40">
                          Selected
                        </span>
                      )}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-[#202020] text-[#10a37f] font-mono">
                      40kHz • v2
                    </span>
                  </div>
                  <p className="text-xs text-[#10a37f] font-medium">
                    Soulful & Emotional • Deep Chest Warmth
                  </p>
                  <p className="text-[11px] text-[#777] mt-1">
                    Ideal for ballads, acoustic tracks, intimate romantic melodies & natural Hindi phonetics.
                  </p>
                </button>

                {/* Sonu Nigam Option */}
                <button
                  type="button"
                  onClick={() => setSelectedModel('sonu_nigam')}
                  disabled={isSubmitting}
                  className={`relative p-5 rounded-2xl border text-left transition-all cursor-pointer ${selectedModel === 'sonu_nigam'
                      ? 'bg-[#1a1a1a] border-[#10a37f] shadow-lg shadow-[#10a37f]/10 ring-1 ring-[#10a37f]/40'
                      : 'bg-[#141414] border-[#252525] hover:border-[#383838] opacity-75 hover:opacity-100'
                    }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base font-extrabold text-white flex items-center gap-2">
                      Sonu Nigam
                      {selectedModel === 'sonu_nigam' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#10a37f]/20 text-[#10a37f] border border-[#10a37f]/40">
                          Selected
                        </span>
                      )}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-[#202020] text-teal-400 font-mono">
                      40kHz • v2
                    </span>
                  </div>
                  <p className="text-xs text-teal-300 font-medium">
                    Golden Era Legend • Crystalline Sur & Pitch
                  </p>
                  <p className="text-[11px] text-[#777] mt-1">
                    Ideal for high-octave vocals, intricate classical runs, pure clarity & agile diction.
                  </p>
                </button>
              </div>
            </div>

            {/* 2. Audio Input Section */}
            <div className="space-y-2">
              <InputSection
                mode={mode}
                setMode={setMode}
                audioFile={audioFile}
                setAudioFile={setAudioFile}
                youtubeUrl={youtubeUrl}
                setYoutubeUrl={setYoutubeUrl}
                spotifyUrl={spotifyUrl}
                setSpotifyUrl={setSpotifyUrl}
                disabled={isSubmitting}
              />
            </div>

            {/* Action Submit Button */}
            <div className="text-center pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full sm:w-auto min-w-[340px] px-10 py-4.5 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2.5 transition-all shadow-xl cursor-pointer ${isSubmitting
                    ? 'bg-[#222] text-[#666] cursor-not-allowed border border-[#333]'
                    : 'bg-[#10a37f] hover:bg-[#12b98f] text-black shadow-[#10a37f]/25 hover:scale-[1.01] active:scale-[0.99]'
                  }`}
              >
                {isSubmitting ? (
                  <>
                    <Disc className="w-5 h-5 animate-spin text-black" />
                    <span>Synthesizing Vocal Stems...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5 text-black" />
                    <span>Convert Track (Studio Quality)</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Live Pipeline Stepper */}
          {activeJobId && currentJob && (
            <div className="pt-2">
              <ProcessingStatus job={currentJob} />
            </div>
          )}

          {/* Master Output & Stems Player */}
          {currentJob && currentJob.status === 'completed' && currentJob.results && (
            <div className="pt-2">
              <StudioPlayer
                jobResults={currentJob.results}
                jobId={activeJobId || currentJob.id}
              />
            </div>
          )}

          {/* Recent Successfully Converted Songs */}
          {recentJobs.filter(job => job.status === 'completed').length > 0 && (
            <div className="bg-[#171717] border border-[#282828] rounded-3xl p-6 sm:p-7">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-[#10a37f]" />
                  <span>Recent Synthesized Songs ({recentJobs.filter(job => job.status === 'completed').length})</span>
                </h3>
                <span className="text-[11px] text-[#777] font-medium">Click to load in studio player</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {recentJobs
                  .filter(job => job.status === 'completed')
                  .map((job) => {
                    const singerVoice = job.results?.singer
                      || job.results?.settings?.singer_name
                      || (job.metadata?.model_name ? getSingerDisplayName(job.metadata.model_name) : null)
                      || (job.results?.model_name ? getSingerDisplayName(job.results.model_name) : null)
                      || job.metadata?.singer_name
                      || 'Arijit Singh';

                    let rawTitle = job.results?.title || job.metadata?.title || job.metadata?.filename;
                    let songName = '';
                    if (rawTitle && !rawTitle.startsWith('Song Conversion (') && !rawTitle.includes('Bigg Boss 20')) {
                      songName = rawTitle;
                    } else if (job.metadata?.filename) {
                      songName = job.metadata.filename.replace(/\.[^/.]+$/, "");
                    } else if (job.results?.uploader && job.results.uploader !== 'Unknown Artist' && job.results.uploader !== 'Bigg Boss 20') {
                      songName = `${job.results.uploader} (${singerVoice} Version)`;
                    } else if (job.metadata?.youtube_url) {
                      songName = `YouTube Track (${singerVoice} Version)`;
                    } else if (job.metadata?.spotify_url) {
                      songName = `Spotify Track (${singerVoice} Version)`;
                    } else {
                      songName = `Track ${job.id.slice(0, 6)} (${singerVoice} Version)`;
                    }

                    return (
                      <div
                        key={job.id}
                        onClick={() => {
                          setActiveJobId(job.id);
                          setCurrentJob(job);
                          window.scrollTo({ top: 300, behavior: 'smooth' });
                        }}
                        className={`group p-4 rounded-2xl border text-left cursor-pointer transition-all relative flex flex-col justify-between ${activeJobId === job.id
                            ? 'bg-[#1b1b1b] border-[#10a37f] ring-1 ring-[#10a37f]/30 shadow-lg shadow-[#10a37f]/10'
                            : 'bg-[#121212] border-[#252525] hover:border-[#383838] hover:bg-[#161616]'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white group-hover:text-[#10a37f] transition-colors truncate">
                              {songName}
                            </p>
                            <p className="text-[11px] text-[#888] mt-1 font-medium flex items-center gap-1.5">
                              <Mic2 className="w-3.5 h-3.5 text-[#10a37f] flex-shrink-0" />
                              <span>Voice: <span className="font-bold text-white">{singerVoice}</span></span>
                            </p>
                          </div>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={(e) => handleDeleteJob(job.id, e)}
                            title="Delete from recent list"
                            className="p-1.5 rounded-lg text-[#666] hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all flex-shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[#777] pt-2 border-t border-[#222] mt-1">
                          <span className="text-[#10a37f] font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Synthesized
                          </span>
                          <span className="text-white font-semibold group-hover:underline group-hover:text-[#10a37f]">
                            Load Track →
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </main>
      )}

      {/* Footer */}
      <footer className="border-t border-[#222] bg-[#0d0d0d] py-6 text-center text-xs text-[#777]">
        <p className="font-medium text-[#888]">
          Lyra Audio Studio • Neural Vocal Timbre Transformation & High-Fidelity Remastering
        </p>
      </footer>
    </div>
  );
}
