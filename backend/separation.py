"""
Pro vocal separation chain built on the bundled pymss (RoFormer) toolkit.

    mix ──► vocals / instrumental   (Mel-Band / BS RoFormer, far cleaner than htdemucs)
    vocals ──► lead / backing       (karaoke RoFormer: harmonies & chorus stay unconverted)
    lead ──► dry lead               (de-reverb / de-echo: RVC turns reverb tails into mush)

Every stage falls back gracefully: if a model can't be downloaded or loaded,
the chain uses the previous stage's output (and Demucs for the first stage).
Model choices can be overridden with environment variables.
"""

import os
import sys
import logging
from typing import Optional

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOOLS_DIR = os.path.join(BASE_DIR, "tools")
SEPARATION_MODELS_DIR = os.environ.get("LYRA_SEPARATION_MODELS", os.path.join(BASE_DIR, "models", "separation"))

import resources

_DEFAULTS = resources.SEPARATION_MODELS[resources.PROFILE]
VOCAL_MODEL = os.environ.get("LYRA_VOCAL_MODEL", _DEFAULTS["vocals"])
KARAOKE_MODEL = os.environ.get("LYRA_KARAOKE_MODEL", _DEFAULTS["karaoke"])
DEREVERB_MODEL = os.environ.get("LYRA_DEREVERB_MODEL", _DEFAULTS["dereverb"])
DOWNLOAD_SOURCE = os.environ.get("LYRA_MODEL_SOURCE", "huggingface")

STEM_SR = 44100


def _import_pymss():
    if TOOLS_DIR not in sys.path:
        sys.path.insert(0, TOOLS_DIR)
    import pymss  # noqa: F401
    return pymss


def _pick(results: dict, *names: str) -> Optional[np.ndarray]:
    lower = {k.lower(): v for k, v in results.items()}
    for n in names:
        if n.lower() in lower:
            return lower[n.lower()]
    return None


def _to_channels_first(audio: np.ndarray) -> np.ndarray:
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim == 1:
        return np.stack([audio, audio], axis=0)
    if audio.shape[0] > audio.shape[1]:
        audio = audio.T
    return audio


def _run_model(model_name: str, mix_cf: np.ndarray, progress_cb=None, label: str = "") -> dict:
    """Run one pymss model on a (channels, samples) array at 44.1 kHz."""
    pymss = _import_pymss()
    os.makedirs(SEPARATION_MODELS_DIR, exist_ok=True)
    if progress_cb and label:
        progress_cb(None, label)
    # Never fill the disk with a model download
    entry = pymss.get_model_entry(model_name)
    try:
        pymss.resolve_model(model_name, model_dir=SEPARATION_MODELS_DIR, require_supported=True, require_exists=True)
        downloaded = True
    except Exception:
        downloaded = False
    if not downloaded and not resources.has_room_for(int(entry.size_bytes or 0), f"separation model {model_name}"):
        raise RuntimeError(f"Not enough free disk space to download {model_name}")
    params = {"normalize": False}
    if resources.LITE:
        params["batch_size"] = 1  # lower peak memory
    sep = pymss.MSSeparator.from_model_name(
        model_name,
        model_dir=SEPARATION_MODELS_DIR,
        download=not downloaded,
        source=DOWNLOAD_SOURCE,
        device="auto",
        inference_params=params,
    )
    try:
        results = sep.separate(mix_cf, pbar=False)
    finally:
        try:
            sep.close()
        except Exception:
            pass
        del sep
        _clear()
    return {k: _to_channels_first(v) for k, v in results.items()}


def _clear():
    import gc
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        elif torch.backends.mps.is_available():
            torch.mps.empty_cache()
    except Exception:
        pass


def _write(path: str, audio_cf: np.ndarray, sr: int = STEM_SR) -> str:
    data = audio_cf.T
    peak = float(np.max(np.abs(data))) if data.size else 0.0
    if peak > 0.99:
        data = data / peak * 0.98
    sf.write(path, data, sr, subtype="PCM_24")
    return path


def load_stereo_44k(path: str) -> np.ndarray:
    audio, sr = sf.read(path, always_2d=True)
    audio = audio.T.astype(np.float32)
    if sr != STEM_SR:
        import librosa
        audio = librosa.resample(audio, orig_sr=sr, target_sr=STEM_SR)
    if audio.shape[0] == 1:
        audio = np.vstack([audio, audio])
    return audio[:2]


def separate_pro(
    audio_path: str,
    output_dir: str,
    has_music: bool = True,
    split_backing: bool = True,
    dereverb: bool = True,
    progress_cb=None,
) -> dict:
    """
    Returns paths:
        vocals_path         full vocal stem (lead + backing)
        lead_path           lead vocal (what gets converted)
        lead_dry_path       lead with reverb/echo removed (converter input)
        backing_path        backing vocals ("" if not split)
        instrumental_path   instrumental ("" if input had no music)
        accompaniment_path  instrumental + backing vocals (what the lead sits on)
        engine              which separator produced the first split
    """
    os.makedirs(output_dir, exist_ok=True)

    def report(pct, msg):
        if progress_cb:
            progress_cb(pct if pct is not None else 40, msg)

    out = {
        "vocals_path": os.path.join(output_dir, "vocals.wav"),
        "lead_path": os.path.join(output_dir, "vocals_lead.wav"),
        "lead_dry_path": os.path.join(output_dir, "vocals_lead_dry.wav"),
        "backing_path": "",
        "instrumental_path": "",
        "accompaniment_path": "",
        "engine": "none",
    }

    mix = load_stereo_44k(audio_path)

    # Stage 1: vocals / instrumental
    vocals = None
    inst = None
    if has_music:
        try:
            res = _run_model(VOCAL_MODEL, mix, progress_cb, "Isolating vocals with Mel-Band RoFormer...")
            vocals = _pick(res, "vocals", "vocal")
            inst = _pick(res, "instrumental", "other", "no_vocals")
            if vocals is not None and inst is None:
                inst = mix[:, : vocals.shape[1]] - vocals
            out["engine"] = f"roformer:{VOCAL_MODEL}"
        except Exception as e:
            logger.warning(f"RoFormer vocal separation unavailable ({e}); falling back to Demucs")
            vocals = None
        if vocals is None:
            import audio_processor
            demucs_dir = os.path.join(output_dir, "_demucs")
            stems = audio_processor.separate_stems_demucs(audio_path, demucs_dir, progress_cb=progress_cb)
            vocals = load_stereo_44k(stems["vocals_path"])
            inst = load_stereo_44k(stems["instrumental_path"])
            out["engine"] = "demucs:htdemucs"
        report(48, "Vocal and instrumental stems extracted.")
    else:
        vocals = mix
    _write(out["vocals_path"], vocals)
    if inst is not None:
        out["instrumental_path"] = _write(os.path.join(output_dir, "instrumental.wav"), inst)

    # Stage 2: lead / backing
    lead = vocals
    backing = None
    if split_backing:
        try:
            res = _run_model(KARAOKE_MODEL, vocals, progress_cb, "Splitting lead vocal from backing harmonies...")
            lead_c = _pick(res, "vocals", "lead", "karaoke")
            back_c = _pick(res, "instrumental", "backing_vocal", "other")
            if lead_c is not None:
                lead = lead_c
                backing = back_c if back_c is not None else vocals[:, : lead.shape[1]] - lead
                out["backing_path"] = _write(os.path.join(output_dir, "vocals_backing.wav"), backing)
            report(53, "Lead and backing vocals separated.")
        except Exception as e:
            logger.warning(f"Lead/backing split skipped: {e}")
    _write(out["lead_path"], lead)

    # Stage 3: de-reverb / de-echo the lead
    lead_dry = lead
    if dereverb:
        try:
            res = _run_model(DEREVERB_MODEL, lead, progress_cb, "Removing reverb & echo from the lead vocal...")
            dry = _pick(res, "noreverb", "dry", "no reverb", "vocals")
            if dry is not None:
                lead_dry = dry
            report(57, "Lead vocal cleaned (reverb tails removed).")
        except Exception as e:
            logger.warning(f"De-reverb skipped: {e}")
    _write(out["lead_dry_path"], lead_dry)

    # Accompaniment = instrumental + original backing vocals
    if inst is not None or backing is not None:
        parts = [p for p in (inst, backing) if p is not None]
        n = min(p.shape[1] for p in parts)
        acc = sum(p[:, :n] for p in parts)
        out["accompaniment_path"] = _write(os.path.join(output_dir, "accompaniment.wav"), acc)

    return out
