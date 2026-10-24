"""
Personal voice training ("Keep my voice").

Fine-tunes an RVC v2 40 kHz model on 10-20 minutes of a user's own
recordings (reading + singing scales works best), starting from the public
RVC v2 pretrained generator/discriminator. The result is a normal RVC model,
so the corrected melody can be rendered back in the user's *own* timbre:
steady, in tune and free of voice cracks.

Stages:
    1. preprocess  - resample to 40k, high-pass, slice on silence into ~3.5s clips
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
CONFIG_PATH = os.path.join(BASE_DIR, "configs", "v2", "40k.json")

SR = 40000
SLICE_SEC = 3.5
OVERLAP_SEC = 0.3


def _device():
    import torch
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# 1. Preprocess
# ---------------------------------------------------------------------------

def preprocess(audio_paths: List[str], min_total_sec: float = 30.0) -> List[np.ndarray]:
    """Load recordings, clean, and slice into training clips at 40 kHz."""
    import librosa
    from scipy import signal

    b, a = signal.butter(N=5, Wn=48, btype="high", fs=SR)
    clips = []
    total = 0.0
    for path in audio_paths:
        y, _ = librosa.load(path, sr=SR, mono=True)
        y = signal.lfilter(b, a, y).astype(np.float32)
        for s, e in librosa.effects.split(y, top_db=40, frame_length=2048, hop_length=512):
            seg = y[s:e]
            if len(seg) < SR * 0.6:
                continue
            step = int(SR * (SLICE_SEC - OVERLAP_SEC))
            for start in range(0, len(seg), step):
                clip = seg[start: start + int(SR * SLICE_SEC)]
                if len(clip) < SR * 0.6:
                    continue
                peak = np.abs(clip).max()
                if peak < 1e-3:
                    continue
                # Same loudness handling as RVC preprocessing
                clip = (clip / peak * 0.9 * 0.75 + 0.25 * clip).astype(np.float32)
                clips.append(clip)
                total += len(clip) / SR
    if total < min_total_sec:
        raise ValueError(f"Only {total:.0f}s of usable voice found; record at least {min_total_sec:.0f}s (10+ minutes is ideal).")
    logger.info(f"Preprocessed {len(clips)} clips ({total / 60:.1f} min)")
    return clips


# ---------------------------------------------------------------------------
# 2. Features
# ---------------------------------------------------------------------------

def extract_features(clips: List[np.ndarray], progress: Callable[[float], None] = lambda p: None) -> List[dict]:
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
        y16 = librosa.resample(clip, orig_sr=SR, target_sr=16000)
        with torch.no_grad():
            x = torch.from_numpy(y16).float().view(1, -1).to(config.device)
            if config.is_half:
                x = x.half()
            feats = extract_hubert_features(hubert, x, "v2")[0].float().cpu().numpy()
        feats = np.repeat(feats, 2, axis=0)  # 50 fps -> 100 fps, as at inference
        f0 = rmvpe.infer_from_audio(y16, thred=0.03).astype(np.float32)
        n_frames = min(len(feats), len(f0), len(clip) // 400)
        if n_frames < 40:
            continue
        items.append({
            "wav": clip[: n_frames * 400],
            "phone": feats[:n_frames].astype(np.float32),
            "pitchf": f0[:n_frames],
            "pitch": coarse_f0_from_pitchf(f0[:n_frames]).astype(np.int64),
        })
        progress((i + 1) / len(clips))
    del hubert, rmvpe
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
        for net, name in ((net_g, "f0G40k.pth"), (net_d, "f0D40k.pth")):
            path = _download_pretrained(name)
            if path:
                sd = torch.load(path, map_location="cpu")
                sd = sd.get("model", sd)
                missing, unexpected = net.load_state_dict(sd, strict=False)
                logger.info(f"Loaded {name} (missing={len(missing)}, unexpected={len(unexpected)})")
    return net_g, net_d


def train(items: List[dict], steps: int = 2000, batch_size: int = 4, use_pretrained: bool = True,
          progress: Callable[[float, dict], None] = lambda p, info: None, seed: int = 1234):
    import torch
    from infer.module import commons

    random.seed(seed)
    torch.manual_seed(seed)
    cfg = _load_config()
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

        if step % 50 == 0:
            sched_g.step()
            sched_d.step()
        if step % 10 == 0 or step == steps:
            info = {
                "step": step, "loss_mel": float(loss_mel), "loss_g": float(loss_g), "loss_d": float(loss_d),
                "elapsed": time.time() - started,
            }
            progress(step / steps, info)

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
            d["filter_length"] // 2 + 1, 32, m["inter_channels"], m["hidden_channels"], m["filter_channels"],
            m["n_heads"], m["n_layers"], m["kernel_size"], m["p_dropout"], m["resblock"],
            m["resblock_kernel_sizes"], m["resblock_dilation_sizes"], m["upsample_rates"],
            m["upsample_initial_channel"], m["upsample_kernel_sizes"], m["spk_embed_dim"],
            m["gin_channels"], d["sampling_rate"],
        ],
        "info": f"Lyra personal voice: {name}",
        "sr": "40k",
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


def train_personal_voice(voice_id: str, audio_paths: List[str], steps: int = 2000,
                         progress_cb: Optional[Callable[[int, str], None]] = None) -> dict:
    """End-to-end training job. Updates the voice's meta.json as it goes."""
    import voices

    def report(pct: float, msg: str):
        voices.update_meta(voice_id, progress=int(pct), message=msg, status="training")
        if progress_cb:
            progress_cb(int(pct), msg)

    vdir = os.path.join(voices.CUSTOM_ROOT, voice_id)
    meta = voices.read_meta(voice_id) or {}
    try:
        report(2, "Cleaning and slicing your recordings...")
        clips = preprocess(audio_paths)
        report(8, f"Analysing {len(clips)} clips (voice features + pitch)...")
        items = extract_features(clips, progress=lambda p: report(8 + 17 * p, "Analysing your voice..."))
        report(25, "Training your personal voice model...")
        net_g, cfg = train(
            items, steps=steps,
            progress=lambda p, info: report(
                25 + 70 * p, f"Training step {info['step']}/{steps} (mel loss {info['loss_mel']:.2f})"
            ),
        )
        report(96, "Exporting model and building retrieval index...")
        export_checkpoint(net_g, cfg, os.path.join(vdir, "model.pth"), meta.get("name", voice_id))
        build_index(items, os.path.join(vdir, "model.index"))
        voices.update_meta(voice_id, status="ready", progress=100, message="Your voice model is ready!",
                           trained_minutes=round(sum(len(c) for c in clips) / SR / 60, 1), steps=steps)
        return voices.read_meta(voice_id)
    except Exception as e:
        logger.error(f"Voice training failed: {e}", exc_info=True)
        voices.update_meta(voice_id, status="error", message=str(e))
        raise
