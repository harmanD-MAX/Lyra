"""
Melody Engine: musical analysis and pitch-curve (F0-domain) correction.

All pitch correction in Lyra happens on the F0 curve *before* the voice is
synthesized (RVC or WORLD), so the audio is rendered once with zero PSOLA
artifacts. This module provides:

- Key / scale detection (Krumhansl-Schmuckler on chroma, or F0 histogram)
- Tempo (BPM) detection
- Note segmentation from an F0 curve
- Scale-aware, note-level pitch correction that keeps glides and vibrato,
  steadies shaky pitch and can bloom vibrato on long held notes
- Guide-melody alignment: pull a singer's pitch onto a reference vocal (DTW)
- Timing alignment: warp a vocal recording onto a reference vocal's timing
- Diatonic harmony generation (e.g. a third above in key)
- MIDI export of the detected melody

F0 arrays use Hz with 0 for unvoiced frames.
"""

import logging
import struct
from typing import List, Optional, Tuple

import numpy as np
from scipy.ndimage import gaussian_filter1d, median_filter

logger = logging.getLogger(__name__)

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
    "chromatic": list(range(12)),
}

# Krumhansl-Kessler key profiles
_MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

VOICED_MIN_HZ = 50.0


# ---------------------------------------------------------------------------
# Unit helpers
# ---------------------------------------------------------------------------

def hz_to_midi(f0: np.ndarray) -> np.ndarray:
    f0 = np.asarray(f0, dtype=np.float64)
    midi = np.zeros_like(f0)
    voiced = f0 > VOICED_MIN_HZ
    midi[voiced] = 69.0 + 12.0 * np.log2(f0[voiced] / 440.0)
    return midi


def midi_to_hz(midi: np.ndarray, voiced: np.ndarray) -> np.ndarray:
    hz = 440.0 * (2.0 ** ((np.asarray(midi, dtype=np.float64) - 69.0) / 12.0))
    return np.where(voiced, hz, 0.0)


def key_name(tonic: int, mode: str) -> str:
    return f"{NOTE_NAMES[int(tonic) % 12]} {mode.replace('_', ' ')}"


def parse_key(key: Optional[str]) -> Optional[Tuple[int, str]]:
    """Parse strings like 'C# minor', 'A major', 'D harmonic_minor', 'chromatic'."""
    if not key or key.strip().lower() in ("auto", ""):
        return None
    parts = key.strip().replace("-", " ").split()
    if parts[0].lower() == "chromatic":
        return 0, "chromatic"
    name = parts[0][0].upper() + parts[0][1:].lower()
    flats = {"Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#"}
    name = flats.get(name, name)
    if name not in NOTE_NAMES:
        return None
    mode = "_".join(parts[1:]).lower() if len(parts) > 1 else "major"
    if mode not in SCALES:
        mode = "major"
    return NOTE_NAMES.index(name), mode


# ---------------------------------------------------------------------------
# Analysis: key, tempo, notes
# ---------------------------------------------------------------------------

def _key_from_chroma_profile(profile: np.ndarray) -> Tuple[int, str, float]:
    best = (0, "major", -np.inf)
    if np.allclose(profile, 0):
        return 0, "major", 0.0
    for tonic in range(12):
        for mode, ref in (("major", _MAJOR_PROFILE), ("minor", _MINOR_PROFILE)):
            corr = np.corrcoef(profile, np.roll(ref, tonic))[0, 1]
            if corr > best[2]:
                best = (tonic, mode, float(corr))
    return best


def detect_key_from_audio(y: np.ndarray, sr: int) -> Tuple[int, str, float]:
    """Estimate (tonic pitch class, mode, confidence) from an audio signal."""
    import librosa
    if y.ndim > 1:
        y = np.mean(y, axis=0 if y.shape[0] <= 2 else 1)
    y = y.astype(np.float32)
    # Analyse at most ~3 minutes to keep it fast
    y = y[: sr * 180]
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=2048)
    return _key_from_chroma_profile(chroma.sum(axis=1))


def detect_key_from_f0(f0: np.ndarray) -> Tuple[int, str, float]:
    """Estimate key from a sung melody using a duration-weighted pitch-class histogram."""
    midi = hz_to_midi(f0)
    voiced = midi > 0
    if voiced.sum() < 20:
        return 0, "major", 0.0
    pcs = np.round(midi[voiced]).astype(int) % 12
    hist = np.bincount(pcs, minlength=12).astype(np.float64)
    return _key_from_chroma_profile(hist)


def detect_tempo(y: np.ndarray, sr: int) -> float:
    import librosa
    if y.ndim > 1:
        y = np.mean(y, axis=0 if y.shape[0] <= 2 else 1)
    try:
        tempo, _ = librosa.beat.beat_track(y=y.astype(np.float32)[: sr * 180], sr=sr)
        tempo = float(np.atleast_1d(tempo)[0])
        return round(tempo, 1) if tempo > 0 else 120.0
    except Exception as e:
        logger.warning(f"Tempo detection failed: {e}")
        return 120.0


def _voiced_runs(voiced: np.ndarray) -> List[Tuple[int, int]]:
    v = voiced.astype(np.int8)
    diffs = np.diff(np.r_[0, v, 0])
    starts = np.where(diffs == 1)[0]
    ends = np.where(diffs == -1)[0]
    return list(zip(starts, ends))


def segment_notes(f0: np.ndarray, fps: float = 100.0, min_note_ms: float = 60.0,
                  split_semitones: float = 0.75) -> List[Tuple[int, int, float]]:
    """
    Split an F0 curve into notes. Returns [(start_frame, end_frame, median_midi)].
    A new note starts when pitch departs from the running note centre by more
    than `split_semitones` for at least 30ms (so vibrato does not split notes).
    """
    midi = hz_to_midi(f0)
    voiced = midi > 0
    min_len = max(2, int(min_note_ms / 1000.0 * fps))
    confirm = max(2, int(0.03 * fps))
    notes = []
    for s, e in _voiced_runs(voiced):
        if e - s < 2:
            continue
        seg = median_filter(midi[s:e], size=min(5, e - s))
        # Use a lightly smoothed curve so vibrato excursions average out
        smooth = gaussian_filter1d(seg, sigma=max(1.0, 0.04 * fps))
        start = 0
        centre = smooth[0]
        out_count = 0
        for i in range(1, len(smooth)):
            if abs(smooth[i] - centre) > split_semitones:
                out_count += 1
                if out_count >= confirm:
                    split = i - confirm + 1
                    if split - start >= min_len:
                        notes.append((s + start, s + split, float(np.median(seg[start:split]))))
                        start = split
                    centre = smooth[i]
                    out_count = 0
            else:
                out_count = 0
                # Running centre follows the note slowly
                n = i - start + 1
                centre = centre + (smooth[i] - centre) / min(n, 8)
        if len(seg) - start >= min_len:
            notes.append((s + start, e, float(np.median(seg[start:]))))
        elif notes and notes[-1][1] == s + start:
            ps, _, pm = notes[-1]
            notes[-1] = (ps, e, pm)
    return notes


# ---------------------------------------------------------------------------
# Correction
# ---------------------------------------------------------------------------

def nearest_scale_midi(midi_value: float, tonic: int, mode: str) -> float:
    pcs = SCALES.get(mode, SCALES["major"])
    base = np.floor(midi_value / 12.0) * 12.0
    candidates = []
    for octave in (-12.0, 0.0, 12.0):
        for pc in pcs:
            candidates.append(base + octave + (tonic + pc) % 12)
    candidates = np.array(candidates)
    return float(candidates[np.argmin(np.abs(candidates - midi_value))])


def _bandpass_deviation(midi: np.ndarray, fps: float, lo_hz: float, hi_hz: float) -> np.ndarray:
    """Return the part of the pitch curve between lo_hz and hi_hz (frame-rate domain)."""
    sig_lo = fps / (2 * np.pi * max(lo_hz, 1e-3))
    sig_hi = fps / (2 * np.pi * max(hi_hz, 1e-3))
    slow = gaussian_filter1d(midi, sigma=sig_lo)
    fast = gaussian_filter1d(midi, sigma=sig_hi)
    return fast - slow


def correct_pitch(
    f0: np.ndarray,
    fps: float = 100.0,
    key: Optional[Tuple[int, str]] = None,
    strength: float = 0.7,
    retune_ms: float = 40.0,
    steadiness: float = 0.5,
    vibrato: float = 0.0,
    vibrato_rate_hz: float = 5.5,
    vibrato_depth: float = 0.30,
) -> np.ndarray:
    """
    Musical, note-level pitch correction in the F0 domain.

    strength:   0 = untouched, 1 = every note centred exactly on the scale
    retune_ms:  how quickly pitch moves onto a new target note (glide time)
    steadiness: 0..1, how much irregular wobble/drift inside a note is removed
                (true vibrato at 4.5-7.5 Hz is kept)
    vibrato:    0..1, bloom gentle vibrato on long straight notes (non-singers
                rarely have vibrato; adding a little sounds "trained")
    """
    if f0 is None or len(f0) == 0:
        return f0
    f0 = np.asarray(f0, dtype=np.float64)
    midi = hz_to_midi(f0)
    voiced = midi > 0
    if voiced.sum() < 5:
        return f0.astype(np.float32)

    if key is None:
        key = detect_key_from_f0(f0)[:2]
    tonic, mode = key

    notes = segment_notes(f0, fps=fps)
    out = midi.copy()
    offset = np.zeros_like(midi)
    has_offset = np.zeros(len(midi), dtype=bool)

    for s, e, centre in notes:
        target = nearest_scale_midi(centre, tonic, mode)
        offset[s:e] = (target - centre) * strength
        has_offset[s:e] = True

        if steadiness > 0 and e - s > 6:
            seg = midi[s:e]
            # Slow drift (< 3 Hz) pulls a held note off centre: flatten it.
            drift = gaussian_filter1d(seg, sigma=fps / (2 * np.pi * 3.0)) - np.median(seg)
            # Irregular jitter (> 8 Hz) is shakiness, not vibrato: remove it.
            jitter = seg - gaussian_filter1d(seg, sigma=fps / (2 * np.pi * 8.0))
            # Keep the edges of a note (attack/release glides) untouched.
            edge = min(len(seg) // 4, int(0.06 * fps))
            env = np.ones(len(seg))
            if edge > 0:
                ramp = np.linspace(0.0, 1.0, edge)
                env[:edge] = ramp
                env[-edge:] = ramp[::-1]
            out[s:e] = seg - steadiness * env * (drift * 0.85 + jitter * 0.9)

        if vibrato > 0 and (e - s) / fps > 0.40:
            seg_dev = _bandpass_deviation(midi[s:e], fps, 4.0, 8.0)
            if np.std(seg_dev) < 0.06:  # straight tone: bloom vibrato
                n = e - s
                t = np.arange(n) / fps
                onset = 0.22
                env = np.clip((t - onset) / 0.25, 0.0, 1.0)
                fade = np.clip((t[-1] - t) / 0.08, 0.0, 1.0)
                out[s:e] += vibrato * vibrato_depth * env * fade * np.sin(2 * np.pi * vibrato_rate_hz * np.maximum(t - onset, 0))

    # Fill offsets between notes so glides move smoothly between targets
    if has_offset.any():
        idx = np.arange(len(offset))
        offset = np.interp(idx, idx[has_offset], offset[has_offset])
    sigma = max(0.5, retune_ms / 1000.0 * fps / 2.0)
    offset = gaussian_filter1d(offset, sigma=sigma)
    out = out + offset
    return midi_to_hz(out, voiced).astype(np.float32)


def _octave_match(user_midi: np.ndarray, guide_midi: np.ndarray) -> float:
    """Return the 12*k shift that brings the guide into the user's register."""
    u = user_midi[user_midi > 0]
    g = guide_midi[guide_midi > 0]
    if len(u) < 5 or len(g) < 5:
        return 0.0
    diff = np.median(u) - np.median(g)
    return float(12.0 * np.round(diff / 12.0))


def _dtw_path(cost: np.ndarray) -> np.ndarray:
    import librosa
    _, wp = librosa.sequence.dtw(C=cost, subseq=False, backtrack=True)
    return wp[::-1]


def align_to_guide(
    f0: np.ndarray,
    guide_f0: np.ndarray,
    fps: float = 100.0,
    strength: float = 0.85,
    key: Optional[Tuple[int, str]] = None,
    use_dtw: bool = True,
    retune_ms: float = 30.0,
) -> np.ndarray:
    """
    Pull a vocal's pitch onto a reference ("guide") melody, e.g. the original
    singer's vocal for the same song. The guide is shifted by whole octaves
    into the user's register. If timing was not aligned beforehand, a coarse
    DTW maps each user frame to the matching guide frame. Where the guide is
    silent, falls back to scale-aware correction.
    """
    f0 = np.asarray(f0, dtype=np.float64)
    guide_f0 = np.asarray(guide_f0, dtype=np.float64)
    midi = hz_to_midi(f0)
    g_midi = hz_to_midi(guide_f0)
    voiced = midi > 0
    if voiced.sum() < 5 or (g_midi > 0).sum() < 5:
        return correct_pitch(f0, fps=fps, key=key, strength=strength)

    g_midi_shift = np.where(g_midi > 0, g_midi + _octave_match(midi, g_midi), 0.0)

    if use_dtw:
        # Coarse DTW at 10 fps on pitch, octave-invariant voiced/unvoiced aware
        step = max(1, int(fps / 10))
        u_c = midi[::step]
        g_c = g_midi_shift[::step]
        uv = u_c > 0
        gv = g_c > 0
        diff = np.abs(u_c[:, None] - g_c[None, :])
        diff = np.minimum(diff, 6.0)
        cost = np.where(uv[:, None] & gv[None, :], diff, 3.0)
        cost = np.where(~uv[:, None] & ~gv[None, :], 0.5, cost)
        path = _dtw_path(cost)
        # Map each user coarse frame to the mean guide frame on the path
        mapping = np.zeros(len(u_c))
        counts = np.zeros(len(u_c))
        np.add.at(mapping, path[:, 0], path[:, 1])
        np.add.at(counts, path[:, 0], 1)
        mapping = mapping / np.maximum(counts, 1)
        fine_map = np.interp(np.arange(len(midi)) / step, np.arange(len(u_c)), mapping) * step
        fine_map = np.clip(np.round(fine_map).astype(int), 0, len(g_midi_shift) - 1)
        target = g_midi_shift[fine_map]
    else:
        target = np.zeros_like(midi)
        n = min(len(midi), len(g_midi_shift))
        target[:n] = g_midi_shift[:n]

    fallback = hz_to_midi(correct_pitch(f0, fps=fps, key=key, strength=1.0, steadiness=0.5))
    has_target = (target > 0) & voiced
    # Ignore guide frames wildly far from the user (wrong lyric / harmony)
    has_target &= np.abs(target - midi) < 5.0
    goal = np.where(has_target, target, fallback)
    delta = np.where(voiced, goal - midi, 0.0)
    delta = gaussian_filter1d(delta, sigma=max(0.5, retune_ms / 1000.0 * fps / 2.0))
    out = midi + strength * delta
    return midi_to_hz(out, voiced).astype(np.float32)


def harmony_f0(f0: np.ndarray, fps: float = 100.0, key: Optional[Tuple[int, str]] = None,
               degrees: int = 2) -> np.ndarray:
    """
    Diatonic harmony: move each note `degrees` scale steps (2 = a third above,
    4 = a fifth above, -2 = a third below), staying in key.
    """
    f0 = np.asarray(f0, dtype=np.float64)
    if key is None:
        key = detect_key_from_f0(f0)[:2]
    tonic, mode = key
    pcs = SCALES.get(mode, SCALES["major"])
    midi = hz_to_midi(f0)
    voiced = midi > 0
    offset = np.zeros_like(midi)
    has = np.zeros(len(midi), dtype=bool)
    for s, e, centre in segment_notes(f0, fps=fps):
        snapped = nearest_scale_midi(centre, tonic, mode)
        rel = int(round(snapped - tonic)) % 12
        deg = pcs.index(rel) if rel in pcs else 0
        octave = (deg + degrees) // len(pcs)
        new_pc = pcs[(deg + degrees) % len(pcs)]
        shift = (new_pc - pcs[deg]) + 12 * octave
        offset[s:e] = shift
        has[s:e] = True
    if has.any():
        idx = np.arange(len(offset))
        offset = np.interp(idx, idx[has], offset[has])
    offset = gaussian_filter1d(offset, sigma=max(0.5, 0.025 * fps))
    return midi_to_hz(midi + offset, voiced).astype(np.float32)


# ---------------------------------------------------------------------------
# Timing alignment (audio domain)
# ---------------------------------------------------------------------------

def _alignment_features(y: np.ndarray, sr: int, hop: int) -> np.ndarray:
    import librosa
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20, hop_length=hop)[1:]
    chroma = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop)
    rms = librosa.feature.rms(y=y, hop_length=hop)
    mfcc = (mfcc - mfcc.mean(axis=1, keepdims=True)) / (mfcc.std(axis=1, keepdims=True) + 1e-6)
    feats = np.vstack([mfcc, chroma * 3.0, np.log(rms + 1e-5)])
    return feats


def wsola_time_map(y: np.ndarray, sr: int, in_pos_for_out: np.ndarray, out_len: int,
                   win: int = 2048, tolerance: int = 512) -> np.ndarray:
    """
    Waveform-similarity overlap-add with a variable time map.
    `in_pos_for_out` gives, for each output sample index (interpolated from a
    sparse map), the input sample to read around. Preserves pitch.
    """
    hop = win // 4
    window = np.hanning(win)
    out = np.zeros(out_len + win)
    norm = np.zeros(out_len + win)
    y_pad = np.pad(y, (win + tolerance, win + tolerance))
    offset = win + tolerance
    prev_tail = None
    for out_start in range(0, out_len, hop):
        centre_in = int(in_pos_for_out[min(out_start, len(in_pos_for_out) - 1)])
        nominal = centre_in + offset
        best = nominal
        if prev_tail is not None:
            lo = max(0, nominal - tolerance)
            hi = min(len(y_pad) - win, nominal + tolerance)
            if hi > lo:
                region = y_pad[lo: hi + hop]
                corr = np.correlate(region, prev_tail, mode="valid")
                if len(corr):
                    best = lo + int(np.argmax(corr[: hi - lo + 1]))
        best = int(np.clip(best, 0, len(y_pad) - win))
        frame = y_pad[best: best + win]
        out[out_start: out_start + win] += frame * window
        norm[out_start: out_start + win] += window
        prev_tail = y_pad[best + hop: best + hop + hop]
        if len(prev_tail) < hop:
            prev_tail = None
    norm[norm < 1e-3] = 1.0
    return (out / norm)[:out_len]


def align_timing_to_guide(user_y: np.ndarray, guide_y: np.ndarray, sr: int,
                          strength: float = 1.0) -> np.ndarray:
    """
    Warp a mono vocal so its phrasing lands where the guide vocal's does.
    Returns audio with the guide's length. Pitch is preserved (WSOLA).
    """
    hop = int(sr * 0.04)
    fu = _alignment_features(user_y, sr, hop)
    fg = _alignment_features(guide_y, sr, hop)
    import librosa
    from scipy.spatial.distance import cdist
    cost = cdist(fg.T, fu.T, metric="cosine")
    cost = np.nan_to_num(cost, nan=1.0)
    _, wp = librosa.sequence.dtw(C=cost, backtrack=True)
    wp = wp[::-1]
    # For each guide frame, mean user frame
    n_g = fg.shape[1]
    mapping = np.zeros(n_g)
    counts = np.zeros(n_g)
    np.add.at(mapping, wp[:, 0], wp[:, 1])
    np.add.at(counts, wp[:, 0], 1)
    mapping = mapping / np.maximum(counts, 1)
    # Smooth & enforce monotonic, bounded slope to avoid audible jumps
    mapping = gaussian_filter1d(mapping, sigma=3.0)
    mapping = np.maximum.accumulate(mapping)
    slope = np.diff(mapping, prepend=mapping[0])
    slope = np.clip(slope, 0.5, 2.0)
    slope[0] = mapping[0]
    mapping = np.cumsum(slope)
    identity = np.arange(n_g) * (fu.shape[1] / max(n_g, 1))
    mapping = (1.0 - strength) * identity + strength * mapping

    out_len = len(guide_y)
    frame_times = np.arange(n_g) * hop
    in_pos = np.interp(np.arange(0, out_len), frame_times, mapping * hop)
    in_pos = np.clip(in_pos, 0, len(user_y) - 1)
    return wsola_time_map(user_y.astype(np.float64), sr, in_pos, out_len).astype(np.float32)


# ---------------------------------------------------------------------------
# MIDI export
# ---------------------------------------------------------------------------

def _vlq(value: int) -> bytes:
    buf = [value & 0x7F]
    value >>= 7
    while value:
        buf.append((value & 0x7F) | 0x80)
        value >>= 7
    return bytes(reversed(buf))


def notes_to_midi_file(notes: List[Tuple[float, float, int, int]], path: str, bpm: float = 120.0,
                       track_name: str = "Lyra Melody") -> str:
    """notes: [(start_sec, end_sec, midi_note, velocity)]. Writes a type-0 MIDI file."""
    ppq = 480
    us_per_beat = int(60_000_000 / max(bpm, 1.0))
    ticks_per_sec = ppq * bpm / 60.0
    events = []
    for start, end, note, vel in notes:
        if end <= start:
            continue
        events.append((int(round(start * ticks_per_sec)), 1, 0x90, int(note), int(vel)))
        events.append((int(round(end * ticks_per_sec)), 0, 0x80, int(note), 0))
    events.sort(key=lambda e: (e[0], e[1]))

    data = bytearray()
    name = track_name.encode("utf-8")[:120]
    data += b"\x00\xff\x03" + _vlq(len(name)) + name
    data += b"\x00\xff\x51\x03" + struct.pack(">I", us_per_beat)[1:]
    last = 0
    for tick, _, status, note, vel in events:
        data += _vlq(max(0, tick - last)) + bytes([status, max(0, min(127, note)), max(0, min(127, vel))])
        last = tick
    data += b"\x00\xff\x2f\x00"

    with open(path, "wb") as f:
        f.write(b"MThd" + struct.pack(">IHHH", 6, 0, 1, ppq))
        f.write(b"MTrk" + struct.pack(">I", len(data)) + bytes(data))
    return path


def f0_to_notes(f0: np.ndarray, fps: float = 100.0, rms: Optional[np.ndarray] = None
                ) -> List[Tuple[float, float, int, int]]:
    out = []
    for s, e, centre in segment_notes(f0, fps=fps, min_note_ms=80):
        vel = 90
        if rms is not None and len(rms) >= e:
            level = float(np.mean(rms[s:e]))
            vel = int(np.clip(40 + 90 * level / (np.max(rms) + 1e-9), 30, 127))
        out.append((s / fps, e / fps, int(round(centre)), vel))
    return out


def export_melody_midi(f0: np.ndarray, path: str, fps: float = 100.0, bpm: float = 120.0) -> str:
    return notes_to_midi_file(f0_to_notes(f0, fps=fps), path, bpm=bpm)
