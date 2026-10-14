"""
Approach C: Hybrid Pitch Contour & Phrasing Stylizer
Musicological Phrasing Engine for Arijit Singh & Sonu Nigam

Transforms standard pitch tracks into artist-authentic performances:
- Arijit Singh: Soulful Meend (portamento glides), delayed vibrato bloom (~5.15Hz), and intimate release inflections.
- Sonu Nigam: Classical Harkat / Murki ornamentation, laser Sur-Lock, and agile vibrato (~5.95Hz).
"""

import numpy as np
import logging
from scipy.ndimage import gaussian_filter1d

logger = logging.getLogger(__name__)


def coarse_f0_from_pitchf(f0: np.ndarray) -> np.ndarray:
    """
    Quantizes continuous F0 (in Hz) into RVC v2 1-255 coarse mel-scale tokens.
    """
    f0_min = 50.0
    f0_max = 1100.0
    f0_mel_min = 1127.0 * np.log(1.0 + f0_min / 700.0)
    f0_mel_max = 1127.0 * np.log(1.0 + f0_max / 700.0)

    f0_safe = np.maximum(f0.copy(), 0.0)
    f0_mel = 1127.0 * np.log(1.0 + f0_safe / 700.0)
    
    pos_mask = (f0_mel > 0)
    f0_mel[pos_mask] = (f0_mel[pos_mask] - f0_mel_min) * 254.0 / (f0_mel_max - f0_mel_min) + 1.0
    f0_mel[f0_mel <= 1.0] = 1.0
    f0_mel[f0_mel > 255.0] = 255.0
    return np.rint(f0_mel).astype(np.int32)


def stylize_pitch_contour(
    f0: np.ndarray,
    singer: str = "arijit_singh",
    strength: float = 0.85,
    fps: float = 100.0
) -> np.ndarray:
    """
    Musicological Pitch Contour & Phrasing Stylizer (Approach C).
    
    Args:
        f0: 1D numpy array of continuous pitch in Hz.
        singer: Target artist style ('arijit_singh' or 'sonu_nigam').
        strength: Stylistic expression strength (0.0 = raw pitch, 1.0 = maximum artist phrasing).
        fps: Pitch frame rate (default 100.0 Hz for 160-sample hop at 16kHz).
        
    Returns:
        1D numpy array of stylized continuous F0 in Hz.
    """
    if f0 is None or len(f0) == 0 or strength <= 0.01:
        return f0

    f0_out = f0.astype(np.float32).copy()
    voiced_mask = (f0_out > 50.0)
    if not np.any(voiced_mask):
        return f0_out

    # Convert voiced regions to fractional MIDI note space: 69 + 12 * log2(f0 / 440)
    midi = np.zeros_like(f0_out)
    midi[voiced_mask] = 69.0 + 12.0 * np.log2(f0_out[voiced_mask] / 440.0)

    # Detect continuous voiced phrase segments
    diffs = np.diff(voiced_mask.astype(np.int32))
    starts = np.where(diffs == 1)[0] + 1
    if voiced_mask[0]:
        starts = np.r_[0, starts]
    ends = np.where(diffs == -1)[0] + 1
    if voiced_mask[-1]:
        ends = np.r_[ends, len(voiced_mask)]

    singer_lower = singer.lower() if singer else "arijit_singh"
    is_arijit = ("arijit" in singer_lower)
    is_sonu = ("sonu" in singer_lower)

    dt = 1.0 / fps

    for start, end in zip(starts, ends):
        seg_len = end - start
        if seg_len < 6:  # Less than 60ms, skip transient consonants
            continue

        seg_midi = midi[start:end].copy()
        t = np.arange(seg_len) * dt

        if is_arijit:
            # ==========================================
            # ARIJIT SINGH PHRASING & MEEND ENGINE
            # ==========================================
            # 1. Meend (Portamento Glide):
            # Smooth out abrupt, unnatural pitch step jumps into soulful S-glides
            smoothed_contour = gaussian_filter1d(seg_midi, sigma=3.2)

            # 2. Delayed Vibrato Bloom:
            # Arijit keeps the initial vowel steady and intimate (~280ms), then blooms
            # into a warm 5.15 Hz vibrato with depth up to 28 cents.
            vibrato = np.zeros(seg_len, dtype=np.float32)
            bloom_onset_frames = int(0.28 * fps)  # 280ms delay
            if seg_len > bloom_onset_frames + 15:
                bloom_time = t[bloom_onset_frames:] - t[bloom_onset_frames]
                # Ramp vibrato envelope smoothly over 220ms
                env = np.clip(bloom_time / 0.22, 0.0, 1.0)
                # 5.15 Hz vibrato, depth ~0.28 semitones (28 cents)
                vib_osc = np.sin(2.0 * np.pi * 5.15 * bloom_time)
                vibrato[bloom_onset_frames:] = env * 0.28 * vib_osc

            # 3. Soulful Phrase Release Inflection:
            # Subtle romantic pitch drop (22 cents) at the tail of held phrases (>400ms)
            release_inflection = np.zeros(seg_len, dtype=np.float32)
            if seg_len > int(0.40 * fps):
                rel_frames = min(8, seg_len // 4)
                release_inflection[-rel_frames:] = np.linspace(0.0, -0.22, rel_frames)

            seg_stylized = smoothed_contour + vibrato + release_inflection

        elif is_sonu:
            # ==========================================
            # SONU NIGAM CLASSICAL SUR & HARKAT ENGINE
            # ==========================================
            # 1. Classical Sur-Lock:
            # Center the fundamental firmly onto clean musical intervals (eliminates amateur wavering)
            seg_smooth = gaussian_filter1d(seg_midi, sigma=1.8)
            rounded_targets = np.round(seg_smooth)
            diff = np.abs(seg_smooth - rounded_targets)
            lock_weight = np.clip(1.0 - diff * 1.5, 0.0, 0.85)
            locked_contour = seg_smooth * (1.0 - lock_weight) + rounded_targets * lock_weight

            # 2. Harkat / Murki Ornamentation on Note Transitions:
            # When jumping between notes (>1.2 semitones), inject agile classical grace flutter
            murki = np.zeros(seg_len, dtype=np.float32)
            diff_midi = np.diff(seg_smooth)
            jump_points = np.where(np.abs(diff_midi) > 0.14)[0]
            for jp in jump_points:
                if 4 < jp < seg_len - 8:
                    direction = np.sign(diff_midi[jp])
                    murki_dur = min(5, seg_len - jp - 1)
                    if direction > 0:
                        murki[jp:jp + murki_dur] += 0.35 * np.sin(np.linspace(0, np.pi, murki_dur))
                    else:
                        murki[jp:jp + murki_dur] += 0.25 * np.sin(np.linspace(0, np.pi, murki_dur))

            # 3. Agile Classical Vibrato:
            # Faster (5.95 Hz), tighter (18 cents), earlier onset (~180ms)
            vibrato = np.zeros(seg_len, dtype=np.float32)
            onset_frames = int(0.18 * fps)
            if seg_len > onset_frames + 12:
                vib_time = t[onset_frames:] - t[onset_frames]
                env = np.clip(vib_time / 0.15, 0.0, 1.0)
                vib_osc = np.sin(2.0 * np.pi * 5.95 * vib_time)
                vibrato[onset_frames:] = env * 0.18 * vib_osc

            seg_stylized = locked_contour + murki + vibrato

        else:
            seg_stylized = seg_midi

        # Blend original with stylized contour according to strength
        blended = seg_midi * (1.0 - strength) + seg_stylized * strength
        f0_out[start:end] = 440.0 * (2.0 ** ((blended - 69.0) / 12.0))

    return f0_out
