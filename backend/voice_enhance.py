"""
"Keep my voice" without a trained model: WORLD vocoder re-synthesis.

The vocal is analysed into pitch (F0), spectral envelope (timbre) and
aperiodicity (breathiness). The melody engine corrects only the F0 curve,
then WORLD re-synthesizes, so the singer's own timbre is kept while pitch
becomes steady and in tune. A light envelope smoothing evens out strained,
uneven tone. For the highest quality, train a personal voice model instead
(voice_training.py) and render through RVC.
"""

import logging
from typing import Callable, Optional

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

FRAME_PERIOD_MS = 5.0


def analyse_f0(y: np.ndarray, sr: int) -> np.ndarray:
    try:
        import pyworld as pw
        mono = y.astype(np.float64) if y.ndim == 1 else y.mean(axis=1 if y.ndim > 1 else 0).astype(np.float64)
        # Downsample to 16kHz for harvest to avoid multi-gigabyte C memory allocation spikes on Colab/Linux
        if sr > 16000:
            import librosa
            mono_16k = librosa.resample(mono.astype(np.float32), orig_sr=sr, target_sr=16000).astype(np.float64)
            f0, t = pw.harvest(mono_16k, 16000, f0_floor=60.0, f0_ceil=1100.0, frame_period=FRAME_PERIOD_MS)
            return pw.stonemask(mono_16k, f0, t, 16000)
        else:
            f0, t = pw.harvest(mono, sr, f0_floor=60.0, f0_ceil=1100.0, frame_period=FRAME_PERIOD_MS)
            return pw.stonemask(mono, f0, t, sr)
    except Exception as e:
        logger.debug(f"pyworld harvest unavailable ({e}), using fallback pitch analysis")
        try:
            import parselmouth
            mono = y.astype(np.float64) if y.ndim == 1 else y.mean(axis=1 if y.ndim > 1 else 0).astype(np.float64)
            snd = parselmouth.Sound(mono, sr)
            pitch = snd.to_pitch(time_step=FRAME_PERIOD_MS / 1000.0, pitch_floor=60.0, pitch_ceiling=1100.0)
            return pitch.selected_array["frequency"].astype(np.float64)
        except Exception:
            try:
                import librosa
                mono = y.astype(np.float32) if y.ndim == 1 else y.mean(axis=1 if y.ndim > 1 else 0).astype(np.float32)
                f0 = librosa.yin(mono, fmin=60.0, fmax=1100.0, sr=sr, hop_length=int(sr * FRAME_PERIOD_MS / 1000.0))
                return np.nan_to_num(f0).astype(np.float64)
            except Exception:
                return np.zeros(max(1, int(len(y) / (sr * FRAME_PERIOD_MS / 1000.0))), dtype=np.float64)


def retune_world(
    input_wav: str,
    output_wav: str,
    correct_f0: Callable[[np.ndarray, float], np.ndarray],
    smooth_tone: float = 0.3,
    progress_cb=None,
) -> dict:
    """
    correct_f0(f0_hz, fps) -> corrected f0. Returns {"path", "f0", "fps"}.
    The original (uncorrected) unvoiced/voiced decisions are kept.
    Uses WORLD vocoder if available, falling back to Parselmouth PSOLA on macOS/systems without pyworld.
    """
    audio, sr = sf.read(input_wav, always_2d=True)
    mono = audio.mean(axis=1).astype(np.float64)
    fps = 1000.0 / FRAME_PERIOD_MS

    try:
        import pyworld as pw
        from scipy.ndimage import uniform_filter1d

        if progress_cb:
            progress_cb(70, "Analysing your voice (pitch, timbre, breath)...")
        # Pitch is tracked at 16 kHz (about 3x faster than harvest at 44.1 kHz on a full song);
        # timbre and breathiness are still analysed at full rate
        f0 = analyse_f0(mono, sr)
        t = np.arange(len(f0)) * (FRAME_PERIOD_MS / 1000.0)
        sp = pw.cheaptrick(mono, f0, t, sr)
        ap = pw.d4c(mono, f0, t, sr)

        if progress_cb:
            progress_cb(76, "Correcting melody on the pitch curve...")
        f0_new = np.asarray(correct_f0(f0, fps), dtype=np.float64)
        f0_new = np.where(f0 > 0, f0_new, 0.0)

        if smooth_tone > 0:
            log_sp = np.log(np.maximum(sp, 1e-12))
            size = 1 + 2 * int(round(smooth_tone * 3))
            log_sp = (1 - smooth_tone) * log_sp + smooth_tone * uniform_filter1d(log_sp, size=size, axis=0)
            sp = np.exp(log_sp)

        if progress_cb:
            progress_cb(80, "Re-synthesizing in your own voice...")
        y = pw.synthesize(f0_new, sp, ap, sr, frame_period=FRAME_PERIOD_MS)
        y = y[: len(mono)]
        if len(y) < len(mono):
            y = np.pad(y, (0, len(mono) - len(y)))
        peak = np.max(np.abs(y)) + 1e-9
        if peak > 0.98:
            y = y / peak * 0.95
        sf.write(output_wav, y.astype(np.float32), sr, subtype="PCM_24")
        return {"path": output_wav, "f0": f0_new.astype(np.float32), "fps": fps}

    except Exception as e:
        logger.info(f"pyworld synthesis unavailable ({e}); using Parselmouth PSOLA retune")
        import parselmouth
        from parselmouth.praat import call

        if progress_cb:
            progress_cb(70, "Analysing vocal pitch with studio precision...")

        snd0 = parselmouth.Sound(mono, sampling_frequency=sr)
        pitch = snd0.to_pitch(time_step=FRAME_PERIOD_MS / 1000.0, pitch_floor=60.0, pitch_ceiling=1100.0)
        f0 = pitch.selected_array["frequency"].astype(np.float64)

        if progress_cb:
            progress_cb(76, "Aligning vocal melody curve...")
        f0_new = np.asarray(correct_f0(f0, fps), dtype=np.float64)
        f0_new = np.where(f0 > 0, f0_new, 0.0)

        if progress_cb:
            progress_cb(80, "Resynthesizing natural vocal timbre...")

        t_step = FRAME_PERIOD_MS / 1000.0
        manip = call(snd0, "To Manipulation", t_step, 60.0, 1100.0)
        pitch_tier = call(manip, "Extract pitch tier")
        call(pitch_tier, "Remove points between", 0.0, snd0.duration + 0.1)

        frame_times = np.arange(len(f0_new)) * t_step + (t_step / 2.0)
        for t_val, f_val in zip(frame_times, f0_new):
            if f_val > 0:
                call(pitch_tier, "Add point", float(t_val), float(f_val))

        call([manip, pitch_tier], "Replace pitch tier")
        y = call(manip, "Get resynthesis (overlap-add)").as_array()[0]

        peak = np.max(np.abs(y)) + 1e-9
        if peak > 0.98:
            y = y / peak * 0.95

        # If input was stereo, also process or match channels
        if audio.shape[1] > 1:
            snd1 = parselmouth.Sound(audio[:, 1].astype(np.float64), sampling_frequency=sr)
            manip1 = call(snd1, "To Manipulation", t_step, 60.0, 1100.0)
            call([manip1, pitch_tier], "Replace pitch tier")
            y1 = call(manip1, "Get resynthesis (overlap-add)").as_array()[0]
            min_l = min(len(y), len(y1))
            out_stereo = np.column_stack([y[:min_l], y1[:min_l]])
            sf.write(output_wav, out_stereo.astype(np.float32), sr, subtype="PCM_24")
        else:
            sf.write(output_wav, y.astype(np.float32), sr, subtype="PCM_24")

        return {"path": output_wav, "f0": f0_new.astype(np.float32), "fps": fps}


# ---------------------------------------------------------------------------
# Final vocal tune: polish the converted vocal itself
# ---------------------------------------------------------------------------

# Seed-VC re-generates the voice, so its output can drift off the corrected
# melody and crack on fast or high notes. The final tune polishes the output
# with one "soulful" setting: in key, steady held notes, gentle vibrato on long
# notes, and a retune speed slow enough to keep slides and meend.
SOULFUL_TUNE = dict(strength=0.70, retune_ms=55.0, steadiness=0.50, vibrato=0.35)


def analyse_f0_rmvpe(y: np.ndarray, sr: int):
    """Singing pitch with RMVPE (robust on breathy and high notes). Returns (f0, fps); harvest fallback."""
    try:
        import os
        import librosa
        import torch
        from configs.config import Config
        from infer.rmvpe import RMVPE

        root = os.environ.get("rmvpe_root", os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets"))
        path = os.path.join(root, "rmvpe.pt")
        if not os.path.exists(path):
            raise FileNotFoundError(path)
        config = Config()
        model = RMVPE(path, is_half=config.is_half, device=config.device)
        mono = y.astype(np.float32) if y.ndim == 1 else y.mean(axis=1).astype(np.float32)
        y16 = librosa.resample(mono, orig_sr=sr, target_sr=16000) if sr != 16000 else mono
        with torch.no_grad():
            f0 = model.infer_from_audio(y16, thred=0.03).astype(np.float64)
        del model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return f0, 100.0
    except Exception as e:
        logger.info(f"RMVPE unavailable for the final tune ({e}); using harvest")
        return analyse_f0(y, sr), 1000.0 / FRAME_PERIOD_MS


def repair_f0_cracks(f0: np.ndarray, fps: float) -> np.ndarray:
    """
    Fix pitch cracks in a voiced F0 curve: octave flips and short spikes that jump
    far from the surrounding melody are pulled back onto it. Unvoiced frames stay 0.
    """
    from scipy.ndimage import median_filter

    f0 = np.asarray(f0, dtype=np.float64)
    voiced = f0 > 0
    if voiced.sum() < 5:
        return f0
    midi = np.zeros_like(f0)
    midi[voiced] = 69.0 + 12.0 * np.log2(f0[voiced] / 440.0)
    idx = np.arange(len(f0))
    filled = np.interp(idx, idx[voiced], midi[voiced])
    ref = median_filter(filled, size=max(5, int(0.08 * fps) | 1), mode="nearest")

    dev = midi - ref
    fixed = midi.copy()
    octave = voiced & (np.abs(dev) > 7.0)
    fixed[octave] -= 12.0 * np.round(dev[octave] / 12.0)
    still_off = voiced & (np.abs(fixed - ref) > 3.0)
    fixed[still_off] = ref[still_off]
    return np.where(voiced, 440.0 * 2.0 ** ((fixed - 69.0) / 12.0), 0.0)


def _psola_retune(audio: np.ndarray, sr: int, f0_target: np.ndarray, fps: float) -> np.ndarray:
    """Move the voiced pitch of `audio` (n, ch) onto `f0_target` with PSOLA. Timbre and breath are kept."""
    import parselmouth
    from parselmouth.praat import call

    t_step = 1.0 / fps
    channels = audio.shape[1]
    if channels > 1 and np.allclose(audio[:, 0], audio[:, 1:].T, atol=1e-4):
        audio = audio[:, :1]  # dual-mono: retune once, copy back to every channel
    out = []
    pitch_tier = None
    for ch in range(audio.shape[1]):
        snd = parselmouth.Sound(audio[:, ch].astype(np.float64), sampling_frequency=sr)
        manip = call(snd, "To Manipulation", t_step, 60.0, 1100.0)
        if pitch_tier is None:
            pitch_tier = call(manip, "Extract pitch tier")
            call(pitch_tier, "Remove points between", 0.0, snd.duration + 0.1)
            for i, f in enumerate(f0_target):
                if f > 0:
                    call(pitch_tier, "Add point", float(i * t_step), float(f))
        call([manip, pitch_tier], "Replace pitch tier")
        out.append(call(manip, "Get resynthesis (overlap-add)").as_array()[0])
    n = min(len(audio), *(len(y) for y in out))
    y = np.zeros((len(audio), audio.shape[1]), dtype=np.float32)
    y[:n] = np.column_stack([o[:n] for o in out])
    return np.repeat(y, channels, axis=1) if y.shape[1] < channels else y


def polish_output_pitch(
    input_wav: str,
    output_wav: str,
    key=None,
    progress_cb=None,
) -> dict:
    """
    Final vocal tune on the converted vocal: repair pitch cracks, bring notes into
    key, steady shaky held notes and bloom gentle vibrato on long notes.
    Pitch is moved with PSOLA, and only notes that actually need moving are replaced,
    so the rest of the converted vocal is left untouched. Returns {"path", "f0", "fps"}.
    """
    import melody

    audio, sr = sf.read(input_wav, always_2d=True)

    if progress_cb:
        progress_cb(84, "Autotune: reading the sung pitch (RMVPE)...")
    f0, fps = analyse_f0_rmvpe(audio, sr)
    repaired = repair_f0_cracks(f0, fps)
    target = melody.correct_pitch(repaired, fps=fps, key=key, **SOULFUL_TUNE).astype(np.float64)

    # Never move a frame more than 2 semitones from what was sung (tracker errors)
    voiced = (repaired > 0) & (target > 0)
    ratio = np.ones_like(target)
    ratio[voiced] = np.clip(target[voiced] / repaired[voiced], 2 ** (-2 / 12), 2 ** (2 / 12))
    target = np.where(voiced, repaired * ratio, 0.0)

    if progress_cb:
        progress_cb(85, "Autotune: in key, steady notes, vibrato on long notes...")
    try:
        y = _psola_retune(audio, sr, target, fps)
    except Exception as e:
        logger.info(f"PSOLA retune unavailable ({e}); using WORLD for the final tune")
        return retune_world(input_wav, output_wav,
                            lambda f, _fps: melody.correct_pitch(repair_f0_cracks(f, _fps), fps=_fps, key=key, **SOULFUL_TUNE),
                            smooth_tone=0.0)

    # Keep the original wherever a note barely moves (< 4 cents) and in all
    # unvoiced sound (consonants, breaths); crossfade 15 ms in and out
    from scipy.ndimage import binary_dilation, uniform_filter1d
    cents = np.zeros_like(target)
    cents[voiced] = 1200.0 * np.abs(np.log2(ratio[voiced]))
    need = binary_dilation(voiced & (cents > 4.0), iterations=max(1, int(0.03 * fps)))
    hop = sr / fps
    frame_of_sample = np.minimum((np.arange(len(audio)) / hop).astype(int), len(need) - 1)
    mask = uniform_filter1d(need[frame_of_sample].astype(np.float32), size=max(1, int(0.015 * sr)))
    y = audio.astype(np.float32) * (1.0 - mask[:, None]) + y * mask[:, None]

    peak = float(np.max(np.abs(y))) + 1e-9
    if peak > 0.98:
        y = y / peak * 0.95
    sf.write(output_wav, y, sr, subtype="PCM_24")
    return {"path": output_wav, "f0": target.astype(np.float32), "fps": fps}
