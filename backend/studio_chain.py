"""
Studio finishing for the lead vocal and the final mix.

    vocal_chain        clean high-pass, proper (RBJ biquad) EQ, a split-band
                       de-esser and gentle 2.5:1 compression, the standard
                       studio vocal chain. Each EQ is a real minimum-phase
                       filter, so there is no hollow / phasey sound from adding
                       and subtracting filtered copies of the voice.
    reference_master   optional: master the final mix to sound like a
                       professionally released song you choose (Matchering,
                       installed separately: pip install matchering).

Built on numpy/scipy only. Works on (samples, channels) float arrays.
"""

import logging
import os
import tempfile
from typing import Optional

import numpy as np
from scipy import signal
from scipy.ndimage import uniform_filter1d

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# RBJ biquads (Audio EQ Cookbook)
# ---------------------------------------------------------------------------

def _biquad(b, a) -> np.ndarray:
    b = np.asarray(b, dtype=np.float64) / a[0]
    a = np.asarray(a, dtype=np.float64) / a[0]
    return np.concatenate([b, a])[None, :]


def peaking(f0: float, gain_db: float, q: float, sr: int) -> np.ndarray:
    A = 10.0 ** (gain_db / 40.0)
    w = 2 * np.pi * f0 / sr
    alpha = np.sin(w) / (2 * q)
    return _biquad([1 + alpha * A, -2 * np.cos(w), 1 - alpha * A],
                   [1 + alpha / A, -2 * np.cos(w), 1 - alpha / A])


def high_shelf(f0: float, gain_db: float, sr: int, slope: float = 0.8) -> np.ndarray:
    A = 10.0 ** (gain_db / 40.0)
    w = 2 * np.pi * f0 / sr
    alpha = np.sin(w) / 2 * np.sqrt((A + 1 / A) * (1 / slope - 1) + 2)
    c = np.cos(w)
    return _biquad([A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * alpha),
                    -2 * A * ((A - 1) + (A + 1) * c),
                    A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * alpha)],
                   [(A + 1) - (A - 1) * c + 2 * np.sqrt(A) * alpha,
                    2 * ((A - 1) - (A + 1) * c),
                    (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * alpha])


def _apply(sos: np.ndarray, x: np.ndarray) -> np.ndarray:
    return signal.sosfilt(sos, x, axis=0).astype(np.float32)


# ---------------------------------------------------------------------------
# Dynamics
# ---------------------------------------------------------------------------

def _smooth_gain_db(target_db: np.ndarray, attack_blocks: float, release_blocks: float) -> np.ndarray:
    """Attack/release smoothing of a gain-reduction curve (<= 0 dB), at block rate."""
    a_att = np.exp(-1.0 / max(attack_blocks, 1e-3))
    a_rel = np.exp(-1.0 / max(release_blocks, 1e-3))
    out = np.empty_like(target_db)
    g = 0.0
    for i, t in enumerate(target_db):
        coef = a_att if t < g else a_rel  # more reduction = attack, recovery = release
        g = coef * g + (1.0 - coef) * t
        out[i] = g
    return out


def _block_level_db(x_mono: np.ndarray, hop: int, window_blocks: int) -> np.ndarray:
    n = len(x_mono) // hop
    blocks = x_mono[: n * hop].reshape(n, hop)
    ms = uniform_filter1d(np.mean(blocks ** 2, axis=1), size=max(1, window_blocks))
    return 10.0 * np.log10(ms + 1e-12)


def _to_samples(gain_db_blocks: np.ndarray, hop: int, n_samples: int) -> np.ndarray:
    centres = np.arange(len(gain_db_blocks)) * hop + hop / 2.0
    return (10.0 ** (np.interp(np.arange(n_samples), centres, gain_db_blocks) / 20.0)).astype(np.float32)


def compress(x: np.ndarray, sr: int, ratio: float = 2.5, attack_ms: float = 10.0,
             release_ms: float = 120.0, max_reduction_db: float = 8.0) -> np.ndarray:
    """
    Gentle vocal compressor. The threshold follows the singing itself (a few dB
    under its typical sung level), so soft and loud phrases sit closer together
    without squashing. Make-up gain keeps the sung level where it was.
    """
    hop = max(1, int(sr * 0.001))
    mono = np.mean(x, axis=1)
    level = _block_level_db(mono, hop, 10)
    if len(level) < 50:
        return x
    sung = level[level > np.percentile(level, 95) - 30.0]
    if len(sung) < 50:
        return x
    threshold = np.percentile(sung, 60)
    over = np.maximum(level - threshold, 0.0)
    target = -np.minimum(over * (1.0 - 1.0 / ratio), max_reduction_db)
    gain_db = _smooth_gain_db(target, attack_ms, release_ms)  # 1 block = 1 ms
    makeup = -float(np.median(gain_db[level > threshold])) * 0.7 if np.any(level > threshold) else 0.0
    return (x * _to_samples(gain_db + makeup, hop, len(x))[:, None]).astype(np.float32)


def de_ess(x: np.ndarray, sr: int, split_hz: float = 5500.0, max_reduction_db: float = 8.0) -> np.ndarray:
    """
    Split-band de-esser: only the band above `split_hz` is turned down, and only
    while an "s"/"sh" is louder than the voice's normal top end. The bands are
    complementary (low = x - high), so with no reduction the voice is unchanged.
    """
    sos = signal.butter(4, split_hz, "hp", fs=sr, output="sos")
    high = signal.sosfiltfilt(sos, x, axis=0).astype(np.float32)  # zero-phase, so low = x - high is clean
    low = x - high
    hop = max(1, int(sr * 0.001))
    hi_db = _block_level_db(np.mean(high, axis=1), hop, 5)
    full_db = _block_level_db(np.mean(x, axis=1), hop, 5)
    if len(hi_db) < 50:
        return x
    rel = hi_db - full_db                                     # how "s"-heavy each moment is
    active = full_db > np.percentile(full_db, 95) - 40.0
    if not np.any(active):
        return x
    thresh = max(np.percentile(rel[active], 85), np.median(rel[active]) + 6.0)  # only real "s" peaks
    target = -np.clip((rel - thresh) * 1.5, 0.0, max_reduction_db)
    target[~active] = 0.0
    gain_db = _smooth_gain_db(target, 1.0, 40.0)
    return (low + high * _to_samples(gain_db, hop, len(x))[:, None]).astype(np.float32)


# ---------------------------------------------------------------------------
# Chains
# ---------------------------------------------------------------------------

def vocal_chain(vocal: np.ndarray, sr: int, warmth: float = 0.5, clarity: float = 0.85) -> np.ndarray:
    """
    Studio vocal chain for a (samples, 2) lead:
        high-pass 80 Hz -> warmth / mud EQ -> harshness cut -> presence & air
        -> de-esser -> gentle compression
    warmth, clarity: 0..1, as on the studio sliders.
    """
    x = np.asarray(vocal, dtype=np.float32)
    if x.ndim == 1:
        x = np.column_stack([x, x])
    warmth = float(np.clip(warmth, 0.0, 1.0))
    clarity = float(np.clip(clarity, 0.0, 1.0))
    try:
        eq = np.vstack([
            signal.butter(2, 80, "hp", fs=sr, output="sos"),
            peaking(200.0, 2.5 * warmth, 0.8, sr),        # chest warmth
            peaking(400.0, -1.5, 1.2, sr),                # boxy / muddy
            peaking(4300.0, -2.0, 2.0, sr),               # vocoder harshness
            peaking(2600.0, 2.0 * clarity, 1.0, sr),      # presence (words)
            high_shelf(10000.0, 2.0 * clarity, sr),       # air
        ])
        x = _apply(eq, x)
    except Exception as e:
        logger.warning(f"Vocal EQ skipped: {e}")
    try:
        x = de_ess(x, sr)
    except Exception as e:
        logger.warning(f"De-esser skipped: {e}")
    try:
        x = compress(x, sr)
    except Exception as e:
        logger.warning(f"Vocal compressor skipped: {e}")
    return x


def reference_master(mix: np.ndarray, sr: int, reference_path: str) -> Optional[np.ndarray]:
    """
    Master `mix` (samples, 2) to match the loudness, tone and width of a
    finished reference song, using Matchering. Returns None when Matchering is
    not installed or fails, so the caller can use the streaming master instead.
    """
    if not reference_path or not os.path.exists(reference_path):
        return None
    try:
        import matchering as mg
        import soundfile as sf
    except ImportError:
        logger.info("Reference mastering needs `pip install matchering`; using the streaming master")
        return None
    work = tempfile.mkdtemp(prefix="lyra_master_")
    try:
        src = os.path.join(work, "mix.wav")
        out = os.path.join(work, "mastered.wav")
        sf.write(src, mix, sr, subtype="PCM_24")
        mg.process(target=src, reference=reference_path, results=[mg.pcm24(out)])
        y, out_sr = sf.read(out, dtype="float32", always_2d=True)
        if out_sr != sr:
            import librosa
            y = librosa.resample(y.T, orig_sr=out_sr, target_sr=sr).T
        return y.astype(np.float32)
    except Exception as e:
        logger.warning(f"Reference mastering failed ({e}); using the streaming master")
        return None
    finally:
        import shutil
        shutil.rmtree(work, ignore_errors=True)
