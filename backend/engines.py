"""
Voice engines.

    rvc     RVC v2 (40k / 48k) - Lyra's built-in engine. Needs a trained model
            (.pth + .index). Best pitch accuracy and audio cleanliness.
    seedvc  Seed-VC singing (DiT + Whisper + BigVGAN, 44.1 kHz, F0-conditioned).
            Zero-shot from a ~20s reference clip of the target voice, or a
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
REFERENCE_SECONDS = 20.0

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
    if opts["seedvc"]:
        return "seedvc", "default (Seed-VC installed, reference available)"
    if opts["rvc"]:
        return "rvc", "default (Seed-VC not set up for this voice)"
    return "rvc", "no engine ready; formant fallback"


# ---------------------------------------------------------------------------
# Reference clips
# ---------------------------------------------------------------------------

def build_reference(audio_paths: List[str], out_path: str, seconds: float = REFERENCE_SECONDS) -> Optional[str]:
    """
    Make a clean ~20s reference from a voice's recordings: the loudest
    (most clearly voiced) 2-6s phrases, joined with short gaps.
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
            seg = y[s:e]
            if len(seg) < sr * 1.5:
                continue
            seg = seg[: int(sr * 6)]
            phrases.append((float(np.sqrt(np.mean(seg ** 2))), seg))
    if not phrases:
        return None
    phrases.sort(key=lambda x: -x[0])
    out, total = [], 0
    gap = np.zeros(int(sr * 0.15), dtype=np.float32)
    for _, seg in phrases:
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


def convert_seedvc(source_wav: str, model_info: dict, out_wav: str, semitones: int = 0,
                   diffusion_steps: int = 40, progress_cb: Optional[Callable] = None) -> str:
    if not seedvc_available():
        raise RuntimeError("Seed-VC is not installed (run backend/tools/setup_seedvc.sh)")
    reference = reference_path(model_info)
    if not has_reference(model_info):
        raise RuntimeError(f"No reference clip for {model_info['name']}")
    work = tempfile.mkdtemp(prefix="lyra_seedvc_")
    cmd = [
        _python(), "inference.py",
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
        cmd += ["--checkpoint", os.path.abspath(ft[0]), "--config", os.path.abspath(ft[1])]
    if progress_cb:
        progress_cb(72, f"Seed-VC singing diffusion ({diffusion_steps} steps) for {model_info['name']}...")
    proc = subprocess.run(cmd, cwd=SEEDVC_DIR, capture_output=True, text=True)
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


def finetune_seedvc(clip_paths: List[str], model_info: dict, steps: int = 600,
                    progress_cb: Optional[Callable[[float, str], None]] = None) -> Optional[tuple]:
    """Fine-tune the Seed-VC singing model on a voice's clips (1-30s each)."""
    if not seedvc_available():
        return None
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
