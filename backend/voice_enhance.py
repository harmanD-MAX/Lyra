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
        x = y.astype(np.float64)
        f0, t = pw.harvest(x, sr, f0_floor=60.0, f0_ceil=1100.0, frame_period=FRAME_PERIOD_MS)
        return pw.stonemask(x, f0, t, sr)
    except Exception as e:
        logger.debug(f"pyworld harvest unavailable ({e}), using Parselmouth pitch analysis")
        import parselmouth
        mono = y.astype(np.float64) if y.ndim == 1 else y.mean(axis=1 if y.ndim > 1 else 0).astype(np.float64)
        snd = parselmouth.Sound(mono, sr)
        pitch = snd.to_pitch(time_step=FRAME_PERIOD_MS / 1000.0, pitch_floor=60.0, pitch_ceiling=1100.0)
        return pitch.selected_array["frequency"].astype(np.float64)


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
        f0, t = pw.harvest(mono, sr, f0_floor=60.0, f0_ceil=1100.0, frame_period=FRAME_PERIOD_MS)
        f0 = pw.stonemask(mono, f0, t, sr)
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
