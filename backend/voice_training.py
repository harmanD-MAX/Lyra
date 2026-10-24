"""
Personal voice training ("Keep my voice").

Fine-tunes an RVC v2 40 kHz model on 10-20 minutes of a user's own
recordings (reading + singing scales works best), starting from the public
RVC v2 pretrained generator/discriminator. The result is a normal RVC model,
so the corrected melody can be rendered back in the user's *own* timbre:
steady, in tune and free of voice cracks.

Stages:
    1. preprocess  - resample to 40k/48k, high-pass, slice on silence into ~3.5s clips
    2. features    - HuBERT/ContentVec v2 features + RMVPE F0 for every clip
    3. train       - GAN fine-tune (mel L1 + KL + feature matching + adversarial)
    4. export      - small inference checkpoint + FAISS retrieval index

Runs on CUDA / Apple MPS when available (CPU works but is slow).
"""

import json
import logging
import math
import os
import random
import time
import urllib.request
from typing import Callable, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRETRAINED_DIR = os.path.join(BASE_DIR, "assets", "pretrained_v2")
PRETRAINED_URL = "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/pretrained_v2/{name}"
SR = 40000  # default; 48000 for the "best" preset

# Training presets shown in the Voice Lab
PRESETS = {
    "quick": {"steps": 1000, "sample_rate": 40000, "seedvc_steps": 0},
    "standard": {"steps": 2000, "sample_rate": 40000, "seedvc_steps": 0},
    "best": {"steps": 4000, "sample_rate": 48000, "seedvc_steps": 600},
}


def _config_path(sample_rate: int) -> str:
    return os.path.join(BASE_DIR, "configs", "v2", f"{sample_rate // 1000}k.json")
SLICE_SEC = 3.5
OVERLAP_SEC = 0.3


def _device():
    import torch
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _load_config(sample_rate: int = SR) -> dict:
    with open(_config_path(sample_rate)) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# 1. Preprocess
# ---------------------------------------------------------------------------

def preprocess(audio_paths: List[str], min_total_sec: float = 30.0, sr: int = SR) -> List[np.ndarray]:
    """Load recordings, clean, and slice into training clips at 40 kHz."""
    import librosa
    from scipy import signal

    b, a = signal.butter(N=5, Wn=48, btype="high", fs=sr)
    clips = []
    total = 0.0
    for path in audio_paths:
        y, _ = librosa.load(path, sr=sr, mono=True)
        y = signal.lfilter(b, a, y).astype(np.float32)
        for s, e in librosa.effects.split(y, top_db=40, frame_length=2048, hop_length=512):
            seg = y[s:e]
            if len(seg) < sr * 0.6:
                continue
            step = int(sr * (SLICE_SEC - OVERLAP_SEC))
            for start in range(0, len(seg), step):
                clip = seg[start: start + int(sr * SLICE_SEC)]
                if len(clip) < sr * 0.6:
                    continue
                peak = np.abs(clip).max()
                if peak < 1e-3:
                    continue
                # Same loudness handling as RVC preprocessing
                clip = (clip / peak * 0.9 * 0.75 + 0.25 * clip).astype(np.float32)
                clips.append(clip)
                total += len(clip) / sr
    if total < min_total_sec:
        raise ValueError(f"Only {total:.0f}s of usable voice found; record at least {min_total_sec:.0f}s (10+ minutes is ideal).")
    logger.info(f"Preprocessed {len(clips)} clips ({total / 60:.1f} min)")
    return clips


# ---------------------------------------------------------------------------
# 2. Features
# ---------------------------------------------------------------------------

def extract_features(clips: List[np.ndarray], progress: Callable[[float], None] = lambda p: None,
                     sr: int = SR) -> List[dict]:
    """HuBERT v2 features (upsampled to 100 fps) + RMVPE F0 per clip."""
    import librosa
    import torch
    from configs.config import Config
    from infer.hubert import extract_hubert_features
    from infer.rmvpe import RMVPE
    from infer.vc.utils import load_hubert
    from infer.vc.stylizer import coarse_f0_from_pitchf

    config = Config()
    hubert = load_hubert(config)
    rmvpe_root = os.environ.get("rmvpe_root", os.path.join(BASE_DIR, "assets"))
    rmvpe = RMVPE(os.path.join(rmvpe_root, "rmvpe.pt"), is_half=config.is_half, device=config.device)

    items = []
    for i, clip in enumerate(clips):
        y16 = librosa.resample(clip, orig_sr=sr, target_sr=16000)
        with torch.no_grad():
            x = torch.from_numpy(y16).float().view(1, -1).to(config.device)
            if config.is_half:
                x = x.half()
            feats = extract_hubert_features(hubert, x, "v2")[0].float().cpu().numpy()
        feats = np.repeat(feats, 2, axis=0)  # 50 fps -> 100 fps, as at inference
        f0 = rmvpe.infer_from_audio(y16, thred=0.03).astype(np.float32)
        hop = sr // 100
        n_frames = min(len(feats), len(f0), len(clip) // hop)
        if n_frames < 40:
            continue
        items.append({
            "wav": clip[: n_frames * hop],
            "phone": feats[:n_frames].astype(np.float32),
            "pitchf": f0[:n_frames],
            "pitch": coarse_f0_from_pitchf(f0[:n_frames]).astype(np.int64),
        })
        progress((i + 1) / len(clips))
    del hubert, rmvpe
    if torch.backends.mps.is_available():
        try:
            torch.mps.empty_cache()
        except Exception:
            pass
    import gc
    gc.collect()
    return items


# ---------------------------------------------------------------------------
# 3. Train
# ---------------------------------------------------------------------------

def _download_pretrained(name: str) -> Optional[str]:
    os.makedirs(PRETRAINED_DIR, exist_ok=True)
    path = os.path.join(PRETRAINED_DIR, name)
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        return path
    try:
        logger.info(f"Downloading pretrained {name}...")
        urllib.request.urlretrieve(PRETRAINED_URL.format(name=name), path + ".part")
        os.replace(path + ".part", path)
        return path
    except Exception as e:
        logger.warning(f"Could not download pretrained {name}: {e}")
        return None


class _Mel:
    def __init__(self, cfg: dict, device):
        import librosa
        import torch
        d = cfg["data"]
        self.n_fft, self.hop, self.win = d["filter_length"], d["hop_length"], d["win_length"]
        mel = librosa.filters.mel(sr=d["sampling_rate"], n_fft=self.n_fft, n_mels=d["n_mel_channels"],
                                  fmin=d["mel_fmin"], fmax=d["mel_fmax"])
        self.mel_basis = torch.from_numpy(mel).float().to(device)
        self.window = torch.hann_window(self.win).to(device)

    def spec(self, y):
        import torch
        import torch.nn.functional as F
        pad = (self.n_fft - self.hop) // 2
        y = F.pad(y.unsqueeze(1), (pad, pad), mode="reflect").squeeze(1)
        s = torch.stft(y, self.n_fft, hop_length=self.hop, win_length=self.win, window=self.window,
                       center=False, return_complex=True)
        return torch.sqrt(s.real ** 2 + s.imag ** 2 + 1e-6)

    def mel(self, y=None, spec=None):
        import torch
        if spec is None:
            spec = self.spec(y)
        return torch.log(torch.clamp(torch.matmul(self.mel_basis, spec), min=1e-5))


def _feature_loss(fmap_r, fmap_g):
    loss = 0
    for dr, dg in zip(fmap_r, fmap_g):
        for rl, gl in zip(dr, dg):
            loss = loss + (rl.float().detach() - gl.float()).abs().mean()
    return loss * 2


def _discriminator_loss(real, fake):
    loss = 0
    for dr, dg in zip(real, fake):
        loss = loss + ((1 - dr.float()) ** 2).mean() + (dg.float() ** 2).mean()
    return loss


def _generator_loss(fake):
    loss = 0
    for dg in fake:
        loss = loss + ((1 - dg.float()) ** 2).mean()
    return loss


def _kl_loss(z_p, logs_q, m_p, logs_p, z_mask):
    kl = logs_p - logs_q - 0.5 + 0.5 * ((z_p - m_p) ** 2) * (-2.0 * logs_p).exp()
    return (kl * z_mask).sum() / z_mask.sum()


def build_models(cfg: dict, device, use_pretrained: bool = True):
    sr_tag = f"{cfg['data']['sampling_rate'] // 1000}k"
    import torch
    from infer.module.models import MultiPeriodDiscriminatorV2, SynthesizerTrnMs768NSFsid

    m, d = cfg["model"], cfg["data"]
    net_g = SynthesizerTrnMs768NSFsid(
        d["filter_length"] // 2 + 1,
        cfg["train"]["segment_size"] // d["hop_length"],
        m["inter_channels"], m["hidden_channels"], m["filter_channels"], m["n_heads"], m["n_layers"],
        m["kernel_size"], m["p_dropout"], m["resblock"], m["resblock_kernel_sizes"],
        m["resblock_dilation_sizes"], m["upsample_rates"], m["upsample_initial_channel"],
        m["upsample_kernel_sizes"], m["spk_embed_dim"], m["gin_channels"], d["sampling_rate"],
        is_half=False,
    ).to(device)
    net_d = MultiPeriodDiscriminatorV2(m["use_spectral_norm"]).to(device)
    if use_pretrained:
        for net, name in ((net_g, f"f0G{sr_tag}.pth"), (net_d, f"f0D{sr_tag}.pth")):
            path = _download_pretrained(name)
            if path:
                sd = torch.load(path, map_location="cpu")
                sd = sd.get("model", sd)
                missing, unexpected = net.load_state_dict(sd, strict=False)
                logger.info(f"Loaded {name} (missing={len(missing)}, unexpected={len(unexpected)})")
    return net_g, net_d


def train(items: List[dict], steps: int = 2000, batch_size: Optional[int] = None, use_pretrained: bool = True,
          progress: Callable[[float, dict], None] = lambda p, info: None, seed: int = 1234,
          sample_rate: int = SR):
    import gc
    import torch
    import resources
    from infer.module import commons

    if batch_size is None:
        if resources.ram_gb() <= 9.0:
            batch_size = 1  # 8GB RAM Mac: keep peak training memory under 1.5 GB
        elif resources.LITE:
            batch_size = 2
        else:
            batch_size = 4

    random.seed(seed)
    torch.manual_seed(seed)
    cfg = _load_config(sample_rate)
    device = _device()
    hop = cfg["data"]["hop_length"]
    seg_frames = cfg["train"]["segment_size"] // hop
    tc = cfg["train"]

    net_g, net_d = build_models(cfg, device, use_pretrained)
    mel = _Mel(cfg, device)
    optim_g = torch.optim.AdamW(net_g.parameters(), tc["learning_rate"], betas=tc["betas"], eps=tc["eps"])
    optim_d = torch.optim.AdamW(net_d.parameters(), tc["learning_rate"], betas=tc["betas"], eps=tc["eps"])
    sched_g = torch.optim.lr_scheduler.ExponentialLR(optim_g, gamma=tc["lr_decay"] ** (1 / 50))
    sched_d = torch.optim.lr_scheduler.ExponentialLR(optim_d, gamma=tc["lr_decay"] ** (1 / 50))

    # Use clips long enough for a training window; crop a random window per step
    win_frames = max(seg_frames * 3, 120)
    usable = [it for it in items if len(it["phone"]) >= seg_frames + 2]
    if not usable:
        raise ValueError("No clips long enough to train on.")

    def batch():
        phones, pitches, pitchfs, wavs = [], [], [], []
        n = min(win_frames, min(len(it["phone"]) for it in usable))
        for it in random.sample(usable, k=min(batch_size, len(usable))):
            start = random.randint(0, len(it["phone"]) - n)
            phones.append(it["phone"][start:start + n])
            pitches.append(it["pitch"][start:start + n])
            pitchfs.append(it["pitchf"][start:start + n])
            wavs.append(it["wav"][start * hop:(start + n) * hop])
        t = lambda xs, dt: torch.as_tensor(np.stack(xs), dtype=dt, device=device)
        return t(phones, torch.float32), t(pitches, torch.long), t(pitchfs, torch.float32), t(wavs, torch.float32), n

    net_g.train()
    net_d.train()
    sid = torch.zeros(batch_size, dtype=torch.long, device=device)
    started = time.time()
    for step in range(1, steps + 1):
        phone, pitch, pitchf, wav, n = batch()
        bs = phone.shape[0]
        lengths = torch.full((bs,), n, dtype=torch.long, device=device)
        spec = mel.spec(wav)[:, :, :n]
        y_hat, ids_slice, x_mask, z_mask, (z, z_p, m_p, logs_p, m_q, logs_q) = net_g(
            phone, lengths, pitch, pitchf, spec, lengths, sid[:bs]
        )
        y = commons.slice_segments(wav.unsqueeze(1), ids_slice * hop, seg_frames * hop)
        y_hat = y_hat[:, :, : y.shape[-1]]

        # Discriminator
        y_d_r, y_d_g, _, _ = net_d(y, y_hat.detach())
        loss_d = _discriminator_loss(y_d_r, y_d_g)
        optim_d.zero_grad()
        loss_d.backward()
        commons.clip_grad_value_(net_d.parameters(), None)
        optim_d.step()
        del y_d_r, y_d_g

        # Generator
        y_d_r, y_d_g, fmap_r, fmap_g = net_d(y, y_hat)
        loss_mel = torch.nn.functional.l1_loss(mel.mel(y.squeeze(1)), mel.mel(y_hat.squeeze(1))) * tc["c_mel"]
        loss_kl = _kl_loss(z_p, logs_q, m_p, logs_p, z_mask) * tc["c_kl"]
        loss_fm = _feature_loss(fmap_r, fmap_g)
        loss_gen = _generator_loss(y_d_g)
        loss_g = loss_gen + loss_fm + loss_mel + loss_kl
        optim_g.zero_grad()
        loss_g.backward()
        commons.clip_grad_value_(net_g.parameters(), None)
        optim_g.step()

        # Immediately free autograd graph tensors to keep MPS memory low
        del y_d_r, y_d_g, fmap_r, fmap_g, y_hat, y

        if step % 50 == 0:
            sched_g.step()
            sched_d.step()
        if step % 2 == 0 or step == steps:
            info = {
                "step": step, "loss_mel": float(loss_mel.detach()), "loss_g": float(loss_g.detach()), "loss_d": float(loss_d.detach()),
                "elapsed": time.time() - started,
            }
            progress(step / steps, info)

        # Periodic cleanup of intermediate MPS/CUDA buffers prevents memory growth
        if step % 10 == 0:
            if device.type == "mps":
                try:
                    torch.mps.empty_cache()
                except Exception:
                    pass
            elif device.type == "cuda":
                try:
                    torch.cuda.empty_cache()
                except Exception:
                    pass
            gc.collect()

        # Thermal protection: yield slightly on small machines to keep temperatures down
        # and ensure browser/IDE remain responsive with zero stutter
        if resources.LITE and step % 4 == 0:
            time.sleep(0.005)

    del net_d, optim_g, optim_d, mel
    if device.type == "mps":
        try:
            torch.mps.empty_cache()
        except Exception:
            pass
    gc.collect()

    return net_g, cfg


# ---------------------------------------------------------------------------
# 4. Export
# ---------------------------------------------------------------------------

def export_checkpoint(net_g, cfg: dict, path: str, name: str) -> str:
    import torch
    m, d = cfg["model"], cfg["data"]
    weights = {k: v.half().cpu() for k, v in net_g.state_dict().items() if "enc_q" not in k}
    ckpt = {
        "weight": weights,
        "config": [
            d["filter_length"] // 2 + 1, cfg["train"]["segment_size"] // d["hop_length"], m["inter_channels"], m["hidden_channels"], m["filter_channels"],
            m["n_heads"], m["n_layers"], m["kernel_size"], m["p_dropout"], m["resblock"],
            m["resblock_kernel_sizes"], m["resblock_dilation_sizes"], m["upsample_rates"],
            m["upsample_initial_channel"], m["upsample_kernel_sizes"], m["spk_embed_dim"],
            m["gin_channels"], d["sampling_rate"],
        ],
        "info": f"Lyra personal voice: {name}",
        "sr": f"{d['sampling_rate'] // 1000}k",
        "f0": 1,
        "version": "v2",
    }
    torch.save(ckpt, path)
    return path


def build_index(items: List[dict], path: str) -> Optional[str]:
    """FAISS IVF retrieval index over the user's HuBERT features (50 fps)."""
    import faiss
    feats = np.concatenate([it["phone"][::2] for it in items], axis=0).astype(np.float32)
    if len(feats) < 100:
        return None
    if len(feats) > 200_000:
        feats = feats[np.random.default_rng(0).choice(len(feats), 200_000, replace=False)]
    n_ivf = max(1, min(int(16 * math.sqrt(len(feats))), len(feats) // 39))
    index = faiss.index_factory(feats.shape[1], f"IVF{n_ivf},Flat")
    faiss.extract_index_ivf(index).nprobe = 1
    index.train(feats)
    for i in range(0, len(feats), 8192):
        index.add(feats[i:i + 8192])
    faiss.write_index(index, path)
    return path


def train_personal_voice(voice_id: str, audio_paths: List[str], steps: Optional[int] = None,
                         progress_cb: Optional[Callable[[int, str], None]] = None,
                         preset: str = "standard") -> dict:
    """
    End-to-end training job. Updates the voice's meta.json as it goes.

    Every preset trains an RVC v2 model and builds a Seed-VC reference clip
    from your recordings (so both engines can sing as you). "best" trains at
    48 kHz and, when Seed-VC is installed, also fine-tunes Seed-VC on you.
    """
    import engines
    import soundfile as sf
    import voices

    cfg_preset = dict(PRESETS.get(preset, PRESETS["standard"]))
    if steps:
        cfg_preset["steps"] = int(steps)
    sr = cfg_preset["sample_rate"]

    def auto_steps(total_sec: float) -> int:
        mins = total_sec / 60.0
        if mins <= 1.5:
            return 180  # ~2.5 mins
        elif mins <= 3.5:
            return 240  # ~3.5 mins
        elif mins <= 7.0:
            return 320  # ~4.5 mins
        else:
            return 450  # ~6-7 mins max

    def report(pct: float, msg: str):
        voices.update_meta(voice_id, progress=int(pct), message=msg, status="training")
        if progress_cb:
            progress_cb(int(pct), msg)

    vdir = os.path.join(voices.CUSTOM_ROOT, voice_id)
    meta = voices.read_meta(voice_id) or {}
    model_info = {"id": voice_id, "name": meta.get("name", voice_id), "dir": vdir}
    try:
        report(2, "Cleaning and slicing your recordings...")
        clips = preprocess(audio_paths, sr=sr)
        total_sec = sum(len(c) for c in clips) / sr
        if not steps or preset in ("auto", "standard"):
            cfg_preset["steps"] = auto_steps(total_sec)
            logger.info(f"Auto-set {cfg_preset['steps']} training steps for {total_sec / 60:.1f} min of audio")
        report(5, "Building your Seed-VC reference clip...")
        engines.build_reference(audio_paths, engines.reference_path(model_info))
        report(8, f"Analysing {len(clips)} clips (voice features + pitch)...")
        items = extract_features(clips, progress=lambda p: report(8 + 15 * p, "Analysing your voice..."), sr=sr)
        import audio_processor
        import resources
        audio_processor.clear_memory()

        can_seedvc = bool(cfg_preset["seedvc_steps"] and engines.seedvc_available() and not resources.LITE and resources.ram_gb() > 12.0)
        rvc_span = 70 if can_seedvc else 72
        report(23, f"Training your RVC v2 {sr // 1000} kHz voice model...")
        net_g, cfg = train(
            items, steps=cfg_preset["steps"], sample_rate=sr,
            progress=lambda p, info: report(
                23 + rvc_span * p * (0.75 if rvc_span == 70 else 1.0),
                f"Training step {info['step']}/{cfg_preset['steps']} (mel loss {info['loss_mel']:.2f})"
            ),
        )
        export_checkpoint(net_g, cfg, os.path.join(vdir, "model.pth"), meta.get("name", voice_id))
        build_index(items, os.path.join(vdir, "model.index"))
        del net_g
        audio_processor.clear_memory()

        seedvc_ft = None
        if can_seedvc:
            report(78, "Fine-tuning Seed-VC singing model on your voice...")
            clip_dir = os.path.join(vdir, "_clips")
            os.makedirs(clip_dir, exist_ok=True)
            clip_paths = []
            for i, c in enumerate(clips):
                cp = os.path.join(clip_dir, f"{i:04d}.wav")
                sf.write(cp, c, sr)
                clip_paths.append(cp)
            seedvc_ft = engines.finetune_seedvc(clip_paths, model_info, steps=cfg_preset["seedvc_steps"])
            import shutil
            shutil.rmtree(clip_dir, ignore_errors=True)
            audio_processor.clear_memory()

        report(97, "Finishing up...")
        if resources.LITE:
            # The model, index and reference are saved; raw takes are no longer needed
            import shutil as _sh
            _sh.rmtree(os.path.join(vdir, "recordings"), ignore_errors=True)
        voices.update_meta(
            voice_id, status="ready", progress=100, message="Your voice model is ready!",
            trained_minutes=round(sum(len(c) for c in clips) / sr / 60, 1),
            steps=cfg_preset["steps"], preset=preset, sample_rate=sr,
            seedvc_finetuned=bool(seedvc_ft),
        )
        return voices.read_meta(voice_id)
    except Exception as e:
        logger.error(f"Voice training failed: {e}", exc_info=True)
        voices.update_meta(voice_id, status="error", message=str(e))
        raise
    finally:
        try:
            import audio_processor
            audio_processor.clear_memory()
        except Exception:
            pass
