import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import StudioView from './components/StudioView';
import LoginModal from './components/LoginModal';
import { useAuth } from './auth';
import { DEFAULT_CREATIVE, resolveCreative } from './creative';

export default function App() {
  const auth = useAuth();
  const needsSignIn = auth.enabled && !auth.user;
  const [loginOpen, setLoginOpen] = useState(false);
  const openLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);
  const [studioTab, setStudioTab] = useState('studio');

  // Navigation view: 'landing' | 'studio'
  const [currentView, setCurrentView] = useState('landing');

  // Input states: 'file' | 'record' | 'youtube' | 'spotify'
  const [mode, setMode] = useState('file');
  const [audioFile, setAudioFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [spotifyUrl, setSpotifyUrl] = useState('');

  // Model selection: 'arijit_singh' | 'sonu_nigam' | 'kk'
  const [selectedModel, setSelectedModel] = useState('arijit_singh');

  // Pipeline execution states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [currentJob, setCurrentJob] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [recentJobs, setRecentJobs] = useState([]);
  const [sysInfo, setSysInfo] = useState(null);

  // Creative controls (mode, melody engine, guide, harmony) & personal voices
  const [creative, setCreative] = useState(DEFAULT_CREATIVE);
  const [showCreative, setShowCreative] = useState(false);
  const [personalVoices, setPersonalVoices] = useState([]);

  const refreshVoices = useCallback(() => {
    fetch('/api/voices')
      .then(res => res.json())
      .then(data => setPersonalVoices(data.voices || []))
      .catch(() => { });
  }, []);

  useEffect(() => { refreshVoices(); }, [refreshVoices]);

  const pollIntervalRef = useRef(null);

  // Synchronize browser history and handle back/forward navigation
  useEffect(() => {
    const isStudioUrl = window.location.hash === '#studio';
    if (isStudioUrl) {
      setCurrentView('studio');
      window.history.replaceState({ view: 'studio' }, '', '#studio');
    } else {
      window.history.replaceState({ view: 'landing' }, '', window.location.pathname + window.location.search);
    }

    const handlePopState = (event) => {
      const isStudio = window.location.hash === '#studio' || event.state?.view === 'studio';
      setCurrentView(isStudio ? 'studio' : 'landing');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (view, modelKey, opts = {}) => {
    if (modelKey) setSelectedModel(modelKey);
    setStudioTab(opts.tab || 'studio');
    if (opts.mode) {
      setCreative((c) => ({ ...c, studioMode: opts.mode }));
      if (opts.mode === 'my_voice' && !modelKey) setSelectedModel('raw');
      if (opts.mode === 'convert' && selectedModel === 'raw' && !modelKey) setSelectedModel('arijit_singh');
    }

    if (view === 'studio') {
      if (currentView !== 'studio') {
        window.history.pushState({ view: 'studio' }, '', '#studio');
        setCurrentView('studio');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      if (currentView !== 'landing') {
        if (window.location.hash === '#studio' && window.history.state?.view === 'studio') {
          window.history.back();
        } else {
          window.history.pushState({ view: 'landing' }, '', window.location.pathname + window.location.search);
          setCurrentView('landing');
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const fetchRecentJobs = () => {
    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => {
        if (data.jobs) setRecentJobs(data.jobs);
      })
      .catch(() => { });
  };

  // "My Songs" is per account, so reload it whenever the signed-in user changes
  useEffect(() => {
    if (!auth.loading) fetchRecentJobs();
  }, [auth.loading, auth.user?.id]);

  useEffect(() => {
    fetch('/api/info')
      .then(res => res.json())
      .then(data => setSysInfo(data))
      .catch(() => { });
  }, []);

  const handleDeleteJob = async (jobId, e) => {
    if (e) e.stopPropagation();
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

    // Tunnels (loca.lt, trycloudflare) drop for a few seconds now and then and answer 404/5xx
    // while they reconnect. The job keeps running on the server, so keep polling through
    // those gaps; give up only when Lyra itself says the job is gone or the server stays
    // unreachable for several minutes.
    let failingSince = 0;
    const stopWithError = (message) => {
      clearInterval(pollIntervalRef.current);
      setIsSubmitting(false);
      setErrorMsg(message);
      setActiveJobId(null);
      fetchRecentJobs();
    };

    const checkStatus = () => {
      fetch(`/api/status/${activeJobId}`)
        .then(async res => {
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            if (res.status === 404 && body?.detail === 'Job not found') {
              const err = new Error('This job is no longer on the server. If it had finished, it is in My Songs.');
              err.fatal = true;
              throw err;
            }
            throw new Error(`Server status ${res.status}`);
          }
          return res.json();
        })
        .then(job => {
          if (!job || !job.status) {
            throw new Error('Invalid status response from server');
          }
          if (failingSince) {
            failingSince = 0;
            setErrorMsg('');
          }
          setCurrentJob(job);
          if (job.status === 'completed' || job.status === 'error') {
            clearInterval(pollIntervalRef.current);
            setIsSubmitting(false);
            fetchRecentJobs();
          }
          if (job.status === 'error') {
            // Back to the song form (the take is kept) with the reason, instead of an empty screen
            setErrorMsg(`Conversion failed: ${job.error || job.message || 'unknown error'}`);
            setActiveJobId(null);
          }
        })
        .catch(err => {
          console.warn("Status polling failed:", err);
          if (err.fatal) {
            stopWithError(err.message);
            return;
          }
          if (!failingSince) failingSince = Date.now();
          if (Date.now() - failingSince > 5 * 60 * 1000) {
            stopWithError('Lost connection to the server. Your song may still finish: check My Songs in a few minutes.');
          } else {
            setErrorMsg('Connection to the server dropped. Reconnecting… your song is still rendering.');
          }
        });
    };

    checkStatus();
    pollIntervalRef.current = setInterval(checkStatus, 2000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeJobId]);

  const handleStartConversion = async (overrideMode, options = {}) => {
    setErrorMsg('');

    // Determine mode based on attached media
    let activeMode = overrideMode || mode;
    if (activeMode === 'record' && audioFile) {
      activeMode = 'record';
    } else if (audioFile && activeMode === 'file') {
      activeMode = 'file';
    } else if (spotifyUrl && spotifyUrl.trim() && activeMode === 'spotify') {
      activeMode = 'spotify';
    } else if (youtubeUrl && youtubeUrl.trim() && activeMode === 'youtube') {
      activeMode = 'youtube';
    }

    if ((activeMode === 'file' || activeMode === 'record') && !audioFile) {
      setErrorMsg('Please upload or record an audio file to convert.');
      return;
    }
    if (activeMode === 'youtube' && !youtubeUrl.trim()) {
      setErrorMsg('Please paste a valid YouTube song URL.');
      return;
    }
    if (activeMode === 'spotify' && !spotifyUrl.trim()) {
      setErrorMsg('Please paste a valid Spotify track link.');
      return;
    }

    setIsSubmitting(true);
    setCurrentJob(null);

    const formData = new FormData();
    if ((activeMode === 'file' || activeMode === 'record') && audioFile) {
      formData.append('audio_file', audioFile);
    } else if (activeMode === 'youtube') {
      formData.append('youtube_url', youtubeUrl.trim());
    } else if (activeMode === 'spotify') {
      formData.append('spotify_url', spotifyUrl.trim());
    }

    const c = creative;
    const r = resolveCreative(c);
    const myVoice = c.studioMode === 'my_voice';
    if (selectedModel === 'raw' && !myVoice) {
      setErrorMsg('"Your voice" is a My Voice target. Switch mode in Creative controls or pick another voice.');
      setIsSubmitting(false);
      return;
    }

    const engineToUse = options.engine || r.engine || 'rvc';
    const fixPitchToUse = options.fixPitch !== undefined ? options.fixPitch : (r.pitchMode !== 'off');

    formData.append('mode', c.studioMode);
    formData.append('model_name', selectedModel);
    formData.append('engine', engineToUse);
    formData.append('pitch_shift', 0);
    formData.append('style_strength', 1.0);
    formData.append('f0_method', 'rmvpe');
    formData.append('protect', 0.33);              // shields consonants & breaths
    formData.append('vocal_gain_db', 0.0);
    formData.append('inst_gain_db', 0.0);
    formData.append('reverb_amount', 0.0);
    formData.append('echo_amount', 0.0);
    formData.append('warmth', 0.50);
    formData.append('clarity', 0.85);
    // Melody engine (pitch correction happens on the F0 curve, once)
    formData.append('apply_autotune', fixPitchToUse);
    formData.append('pitch_mode', fixPitchToUse ? (r.pitchMode === 'off' ? 'auto' : r.pitchMode) : 'off');
    formData.append('key', r.key);
    formData.append('autotune_strength', fixPitchToUse ? r.correction : 0.0);
    formData.append('steadiness', r.steadiness);
    formData.append('vibrato', r.vibrato);
    formData.append('retune_ms', r.retuneMs);
    formData.append('harmony', selectedModel === 'raw' ? 'none' : r.harmony);
    formData.append('split_backing', r.splitBacking);
    formData.append('dereverb', r.dereverb);
    // A recorded or "My Voice" take is a bare vocal unless it's a full song link
    formData.append('has_music', !(activeMode === 'record' || (myVoice && activeMode === 'file')));
    if (myVoice) {
      if (c.guideFile) formData.append('guide_file', c.guideFile);
      else if (c.guideUrl.trim()) formData.append('guide_url', c.guideUrl.trim());
      formData.append('align_timing', r.alignTiming);
    }

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        let detail = '';
        try {
          const d = JSON.parse(body).detail;
          detail = typeof d === 'string' ? d : (d ? JSON.stringify(d) : '');
        } catch {
          // Not JSON: the tunnel or a proxy answered, not Lyra. Show what it said.
          detail = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
        }
        throw new Error(`Failed to start conversion (server replied ${response.status})${detail ? `: ${detail}` : ''}`);
      }

      const data = await response.json();
      setActiveJobId(data.job_id);
    } catch (err) {
      setErrorMsg(err.message || 'Error communicating with audio backend server');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-[#ececec] flex flex-col selection:bg-[#e5a958] selection:text-black">

      {/* View 1: Landing Page (Matches Screenshot) */}
      {currentView === 'landing' ? (
        <>
          <Header
            currentView="landing"
            onViewChange={navigateTo}
            auth={auth}
            onLogin={openLogin}
            onOpenSongs={() => navigateTo('studio', null, { tab: 'my-songs' })}
          />
          <LandingPage
            onLaunchStudio={(modelKey, opts) => navigateTo('studio', modelKey, opts)}
          />
        </>
      ) : needsSignIn || auth.loading ? (
        <>
          <Header currentView="studio" onViewChange={navigateTo} auth={auth} onLogin={openLogin} />
          <main className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
            {auth.loading ? (
              <p className="text-white/60">Loading…</p>
            ) : (
              <>
                <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                  Sign in to open the studio
                </h1>
                <p className="text-white/60 max-w-md">
                  Your songs are saved to your account, so you can pick them up on any device.
                </p>
                <button type="button" onClick={openLogin} className="btn btn-primary">
                  Log in
                </button>
              </>
            )}
          </main>
        </>
      ) : (
        /* View 2: Lyra Studio Page (Exact Tablet Interface from Screenshot) */
        <StudioView
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          mode={mode}
          setMode={setMode}
          audioFile={audioFile}
          setAudioFile={setAudioFile}
          youtubeUrl={youtubeUrl}
          setYoutubeUrl={setYoutubeUrl}
          spotifyUrl={spotifyUrl}
          setSpotifyUrl={setSpotifyUrl}
          isSubmitting={isSubmitting}
          currentJob={currentJob}
          setCurrentJob={setCurrentJob}
          activeJobId={activeJobId}
          setActiveJobId={setActiveJobId}
          errorMsg={errorMsg}
          recentJobs={recentJobs}
          sysInfo={sysInfo}
          onStartConversion={handleStartConversion}
          onResetJob={() => {
            setActiveJobId(null);
            setCurrentJob(null);
          }}
          onBackToLanding={() => navigateTo('landing')}
          onDeleteJob={handleDeleteJob}
          personalVoices={personalVoices}
          initialTab={studioTab}
          auth={auth}
          onLogin={openLogin}
          onRefreshJobs={fetchRecentJobs}
        />
      )}

      <LoginModal auth={auth} open={loginOpen} onClose={closeLogin} />

    </div>
  );
}
