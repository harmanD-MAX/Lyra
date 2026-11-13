"""
Voice engines.

    rvc     RVC v2 (40k / 48k) - Lyra's built-in engine. Needs a trained model
            (.pth + .index). Best pitch accuracy and audio cleanliness.
    seedvc  Seed-VC singing (DiT + Whisper + BigVGAN, 44.1 kHz, F0-conditioned).
            Zero-shot from a ~25s reference clip of the target voice, or a
            fine-tuned checkpoint. Clearer lyrics and closer likeness in
            Seed-VC's published singing evaluation against RVCv2-48k.

Which engine renders a job:
    1. the engine the user asked for, if it is available for that voice;
    2. otherwise ("auto") the winner recorded by tools/benchmark.py for that
       voice (models/engine_choice.json);
    3. otherwise Seed-VC when it is installed and the voice has a reference
       clip, else RVC.

Seed-VC is GPL-3.0 and is not vendored: tools/setup_seedvc.sh clones it into
backend/third_party/seed-vc (or point LYRA_SEEDVC_DIR at a checkout). It is
run as a separate process.
"""

import glob
import json
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from typing import Callable, List, Optional

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SEEDVC_DIR = os.environ.get("LYRA_SEEDVC_DIR", os.path.join(BASE_DIR, "third_party", "seed-vc"))
SEEDVC_SINGING_CONFIG = "configs/presets/config_dit_mel_seed_uvit_whisper_base_f0_44k.yml"
ENGINE_CHOICE_PATH = os.path.join(BASE_DIR, "models", "engine_choice.json")
REFERENCE_NAME = "reference.wav"
REFERENCE_SECONDS = 25.0  # Seed-VC uses up to 25 s of the reference

ENGINE_LABELS = {
    "rvc": "RVC v2",
    "seedvc": "Seed-VC singing (44.1 kHz)",
    "world": "Your voice (WORLD re-synthesis)",
}


# ---------------------------------------------------------------------------
# Availability & choice
# ---------------------------------------------------------------------------

def seedvc_available() -> bool:
    return os.path.exists(os.path.join(SEEDVC_DIR, "inference.py"))


def reference_path(model_info: dict) -> str:
    return os.path.join(model_info["dir"], REFERENCE_NAME)


def has_reference(model_info: dict) -> bool:
    p = reference_path(model_info)
    return os.path.exists(p) and os.path.getsize(p) > 10_000


def seedvc_checkpoint(model_info: dict) -> Optional[tuple]:
    """(checkpoint, config) of a Seed-VC fine-tune for this voice, if any."""
    ckpt = os.path.join(model_info["dir"], "seedvc", "ft_model.pth")
    cfgs = glob.glob(os.path.join(model_info["dir"], "seedvc", "*.yml"))
    if os.path.exists(ckpt) and cfgs:
        return ckpt, cfgs[0]
    return None


def rvc_available(model_info: dict) -> bool:
    return os.path.exists(os.path.join(model_info["dir"], model_info["pth"]))


def read_engine_choices() -> dict:
    try:
        with open(ENGINE_CHOICE_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


def write_engine_choice(voice_id: str, engine: str, scores: dict):
    os.makedirs(os.path.dirname(ENGINE_CHOICE_PATH), exist_ok=True)
    data = read_engine_choices()
    data[voice_id] = {"engine": engine, "scores": scores}
    with open(ENGINE_CHOICE_PATH, "w") as f:
        json.dump(data, f, indent=2)


def engine_options(model_info: dict) -> dict:
    """What can render this voice right now."""
    return {
        "rvc": rvc_available(model_info),
        "seedvc": seedvc_available() and (has_reference(model_info) or seedvc_checkpoint(model_info) is not None),
    }


def choose_engine(model_info: dict, requested: str = "auto") -> tuple:
    """Returns (engine, reason)."""
    opts = engine_options(model_info)
    if requested in opts and opts[requested]:
        return requested, "chosen in settings"
    bench = read_engine_choices().get(model_info["id"])
    if bench and opts.get(bench["engine"]):
        return bench["engine"], "benchmark winner for this voice"
    if opts["rvc"]:
        return "rvc", "trained RVC model available"
    if opts["seedvc"]:
        return "seedvc", "Seed-VC reference available"
    return "rvc", "no engine ready; formant fallback"


# ---------------------------------------------------------------------------
# Reference clips
# ---------------------------------------------------------------------------

REFERENCE_MIN_PHRASE = 1.5    # seconds
REFERENCE_MAX_PHRASE = 8.0


def _split_long_phrase(seg: np.ndarray, sr: int, max_len: float = REFERENCE_MAX_PHRASE) -> List[np.ndarray]:
    """Cut a long phrase at its quietest moments (never mid-word on a hard length limit)."""
    out = [seg]
    while len(out[-1]) > max_len * sr:
        cur = out.pop()
        lo, hi = int(sr * REFERENCE_MIN_PHRASE), min(len(cur) - int(sr * REFERENCE_MIN_PHRASE), int(sr * max_len))
        if hi <= lo:
            out.append(cur[: int(sr * max_len)])
            break
        win = int(sr * 0.05)
        energy = np.convolve(cur[lo:hi] ** 2, np.ones(win) / win, mode="same")
        cut = lo + int(np.argmin(energy))
        out += [cur[:cut], cur[cut:]]
    return out


def _phrase_score(seg: np.ndarray, sr: int) -> Optional[dict]:
    """How good a phrase is as a voice sample: clean, tonal, steady pitch. None = unusable."""
    import librosa
    if np.mean(np.abs(seg) > 0.985) > 0.0005:
        return None  # clipped / distorted
    rms_db = 20.0 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)
    flatness = float(np.mean(librosa.feature.spectral_flatness(y=seg, n_fft=2048, hop_length=512)))
    try:
        f0 = librosa.yin(seg, fmin=70, fmax=1000, sr=sr, frame_length=2048, hop_length=512)
        midi = 69 + 12 * np.log2(f0 / 440.0)
        jitter = float(np.median(np.abs(np.diff(midi))))
    except Exception:
        jitter = 1.0
    return {"rms_db": rms_db, "flatness": flatness, "jitter": jitter}


def build_reference(audio_paths: List[str], out_path: str, seconds: float = REFERENCE_SECONDS) -> Optional[str]:
    """
    Make a clean ~25s reference of a voice for Seed-VC from its recordings.

    The best phrases are steady, clearly sung ones at a comfortable level, not
    the loudest: belted or clipped phrases teach Seed-VC a strained, rough
    version of the voice. Long phrases are cut at pauses, never mid-word.
    """
    import librosa
    sr = 44100
    phrases = []
    for p in audio_paths:
        try:
            y, _ = librosa.load(p, sr=sr, mono=True)
        except Exception:
            continue
        for s, e in librosa.effects.split(y, top_db=35):
            for seg in _split_long_phrase(y[s:e], sr):
                if len(seg) < sr * REFERENCE_MIN_PHRASE:
                    continue
                score = _phrase_score(seg, sr)
                if score is not None:
                    phrases.append((score, seg))
    if not phrases:
        return None

    # Rank: tonal (low flatness), steady (low jitter), loudness close to the voice's typical level
    typical = float(np.median([sc["rms_db"] for sc, _ in phrases]))
    def rank(item):
        sc, _ = item
        return (abs(sc["rms_db"] - typical) / 6.0
                + sc["flatness"] * 20.0
                + min(sc["jitter"], 2.0) * 2.0)
    phrases.sort(key=rank)

    out, total = [], 0
    gap = np.zeros(int(sr * 0.15), dtype=np.float32)
    fade = int(sr * 0.01)
    ramp = np.linspace(0.0, 1.0, fade, dtype=np.float32)
    for _, seg in phrases:
        seg = seg.astype(np.float32).copy()
        # level each phrase to the typical loudness so the sample is even
        seg *= 10.0 ** ((typical - 20.0 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)) / 20.0)
        seg[:fade] *= ramp
        seg[-fade:] *= ramp[::-1]
        out += [seg, gap]
        total += len(seg)
        if total >= sr * seconds:
            break
    ref = np.concatenate(out)[: int(sr * (seconds + 1))]
    ref = ref / (np.max(np.abs(ref)) + 1e-9) * 0.9
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sf.write(out_path, ref.astype(np.float32), sr, subtype="PCM_24")
    return out_path


def save_reference_upload(src_path: str, model_info: dict) -> str:
    """Use an uploaded dry clip of the target voice as its Seed-VC reference."""
    return build_reference([src_path], reference_path(model_info))


# ---------------------------------------------------------------------------
# Seed-VC inference / fine-tuning (separate process)
# ---------------------------------------------------------------------------

def _python() -> str:
    return os.environ.get("LYRA_SEEDVC_PYTHON", sys.executable)


GUIDED_SCRIPT = os.path.join(BASE_DIR, "tools", "seedvc_guided.py")


def convert_seedvc(source_wav: str, model_info: dict, out_wav: str, semitones: int = 0,
                   diffusion_steps: int = 40, f0_curve: Optional[np.ndarray] = None, f0_fps: float = 100.0,
                   progress_cb: Optional[Callable] = None) -> str:
    """
    Render `source_wav` in the target voice with Seed-VC.

    f0_curve: Lyra's cleaned (and optionally corrected) melody for the source, in Hz
    with 0 for unvoiced frames, at `f0_fps`. When given, Seed-VC sings this curve
    instead of re-reading the pitch from the audio (see tools/seedvc_guided.py).
    """
    if not seedvc_available():
        raise RuntimeError("Seed-VC is not installed (run backend/tools/setup_seedvc.sh)")
    reference = reference_path(model_info)
    if not has_reference(model_info):
        raise RuntimeError(f"No reference clip for {model_info['name']}")
    work = tempfile.mkdtemp(prefix="lyra_seedvc_")
    args = [
        "--source", os.path.abspath(source_wav),
        "--target", os.path.abspath(reference),
        "--output", work,
        "--diffusion-steps", str(int(diffusion_steps)),
        "--f0-condition", "True",
        "--auto-f0-adjust", "False",
        "--semi-tone-shift", str(int(semitones)),
        "--inference-cfg-rate", "0.7",
        "--fp16", "True",
    ]
    ft = seedvc_checkpoint(model_info)
    if ft:
        args += ["--checkpoint", os.path.abspath(ft[0]), "--config", os.path.abspath(ft[1])]
    if progress_cb:
        progress_cb(72, f"Seed-VC singing diffusion ({diffusion_steps} steps) for {model_info['name']}...")

    proc = None
    if f0_curve is not None and os.path.exists(GUIDED_SCRIPT):
        curve_path = os.path.join(work, "lyra_f0.npy")
        np.save(curve_path, np.asarray(f0_curve, dtype=np.float32))
        cmd = [_python(), GUIDED_SCRIPT, "--lyra-f0", curve_path, "--lyra-f0-fps", str(float(f0_fps))] + args
        proc = subprocess.run(cmd, cwd=SEEDVC_DIR, capture_output=True, text=True)
        if proc.returncode != 0 or "[lyra] using Lyra's cleaned pitch curve" not in proc.stdout:
            logger.warning(f"Seed-VC with Lyra's pitch curve failed; using Seed-VC's own pitch read: "
                           f"{(proc.stderr or proc.stdout)[-800:]}")
            for f in glob.glob(os.path.join(work, "*.wav")):
                os.remove(f)
            proc = None
    if proc is None:
        proc = subprocess.run([_python(), "inference.py"] + args, cwd=SEEDVC_DIR, capture_output=True, text=True)
    if proc.returncode != 0:
        shutil.rmtree(work, ignore_errors=True)
        raise RuntimeError(f"Seed-VC failed: {proc.stderr[-1500:]}")
    outs = sorted(glob.glob(os.path.join(work, "*.wav")), key=os.path.getmtime)
    if not outs:
        shutil.rmtree(work, ignore_errors=True)
        raise RuntimeError("Seed-VC produced no output")
    y, sr = sf.read(outs[-1], always_2d=True)
    sf.write(out_wav, y, sr, subtype="PCM_24")
    shutil.rmtree(work, ignore_errors=True)
    return out_wav


def seedvc_steps_for(total_seconds: float) -> int:
    """
    Fine-tune length for the amount of clean singing available. Short runs copy
    the voice's colour; smooth, steady singing needs more steps.
    """
    minutes = total_seconds / 60.0
    if minutes < 3.0:
        return 1000
    return int(min(5000, max(2000, 250 * minutes)))


def finetune_seedvc(clip_paths: List[str], model_info: dict, steps: Optional[int] = None,
                    progress_cb: Optional[Callable[[float, str], None]] = None) -> Optional[tuple]:
    """Fine-tune the Seed-VC singing model on a voice's clips (1-30s each)."""
    if not seedvc_available():
        return None
    if not steps:
        total = 0.0
        for p in clip_paths:
            try:
                total += sf.info(p).duration
            except Exception:
                pass
        steps = seedvc_steps_for(total)
    run_name = f"lyra_{model_info['id']}"
    data_dir = tempfile.mkdtemp(prefix="lyra_seedvc_data_")
    for i, p in enumerate(clip_paths):
        shutil.copy(p, os.path.join(data_dir, f"{i:04d}.wav"))
    cmd = [
        _python(), "train.py",
        "--config", SEEDVC_SINGING_CONFIG,
        "--dataset-dir", data_dir,
        "--run-name", run_name,
        "--batch-size", "2",
        "--max-steps", str(int(steps)),
        "--max-epochs", "1000",
        "--save-every", str(int(steps)),
        "--num-workers", "0",
    ]
    if progress_cb:
        progress_cb(0.0, "Fine-tuning Seed-VC singing model on your voice...")
    proc = subprocess.run(cmd, cwd=SEEDVC_DIR, capture_output=True, text=True)
    shutil.rmtree(data_dir, ignore_errors=True)
    run_dir = os.path.join(SEEDVC_DIR, "runs", run_name)
    ckpt = os.path.join(run_dir, "ft_model.pth")
    if proc.returncode != 0 or not os.path.exists(ckpt):
        logger.warning(f"Seed-VC fine-tune failed: {proc.stderr[-1500:]}")
        return None
    dest = os.path.join(model_info["dir"], "seedvc")
    os.makedirs(dest, exist_ok=True)
    shutil.move(ckpt, os.path.join(dest, "ft_model.pth"))
    for cfg in glob.glob(os.path.join(run_dir, "*.yml")):
        shutil.copy(cfg, dest)
    shutil.rmtree(run_dir, ignore_errors=True)
    return seedvc_checkpoint(model_info)
