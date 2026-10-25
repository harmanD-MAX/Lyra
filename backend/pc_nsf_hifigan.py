"""
PC-NSF-HiFiGAN: pitch-controllable neural vocoder for the final autotune.

The converted vocal is turned into a mel spectrogram (its timbre) and re-voiced
from the corrected pitch curve. Unlike PSOLA, nothing is cut and pasted, so
moved notes come out clean, without graininess on breathy or raspy notes.

Network code adapted from OpenVPI DiffSinger (Apache-2.0):
https://github.com/openvpi/DiffSinger/tree/main/modules/nsf_hifigan

Model weights: OpenVPI DiffSinger Community Vocoder, pc_nsf_hifigan_44.1k_hop512_128bin_2025.02,
licensed CC BY-NC-SA 4.0 (non-commercial use only). Downloaded on first use.
"""

import io
import json
import hashlib
import logging
import os
import urllib.request
import zipfile
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "assets", "pc_nsf_hifigan")
MODEL_NAME = "pc_nsf_hifigan_44.1k_hop512_128bin_2025.02"
MODEL_URL = ("https://github.com/openvpi/vocoders/releases/download/"
             f"pc-nsf-hifigan-44.1k-hop512-128bin-2025.02/{MODEL_NAME}.zip")
MODEL_SHA256 = "9d98ba73727f2abb75172cf8249d75182237e8472fc3b6ed09c721ae8b0e83c6"

SAMPLE_RATE = 44100
HOP = 512
CHUNK_FRAMES = 1024     # ~12 s of audio per pass keeps CPU/GPU memory bounded
CONTEXT_FRAMES = 32     # receptive-field context on each side of a chunk

_MODEL = None


def ensure_model() -> Optional[str]:
    """Download and verify the vocoder on first use. Returns the checkpoint path or None."""
    ckpt = os.path.join(MODEL_DIR, "model.ckpt")
    if os.path.exists(ckpt) and os.path.exists(os.path.join(MODEL_DIR, "config.json")):
        return ckpt
    try:
        logger.info("Downloading PC-NSF-HiFiGAN vocoder (~50 MB)...")
        req = urllib.request.Request(MODEL_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        if hashlib.sha256(data).hexdigest() != MODEL_SHA256:
            raise ValueError("checksum mismatch")
        os.makedirs(MODEL_DIR, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for name in ("model.ckpt", "config.json", "NOTICE.txt"):
                with z.open(f"{MODEL_NAME}/{name}") as src, open(os.path.join(MODEL_DIR, name), "wb") as dst:
                    dst.write(src.read())
        return ckpt
    except Exception as e:
        logger.warning(f"PC-NSF-HiFiGAN unavailable: {e}")
        return None


def _build_generator(h: dict):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.nn import Conv1d, ConvTranspose1d
    from torch.nn.utils import weight_norm, remove_weight_norm

    lrelu = 0.1

    def padding(k, d=1):
        return (k * d - d) // 2

    class ResBlock1(nn.Module):
        def __init__(self, ch, k, dil):
            super().__init__()
            self.convs1 = nn.ModuleList([weight_norm(Conv1d(ch, ch, k, 1, dilation=d, padding=padding(k, d))) for d in dil])
            self.convs2 = nn.ModuleList([weight_norm(Conv1d(ch, ch, k, 1, dilation=1, padding=padding(k))) for _ in dil])

        def forward(self, x):
            for c1, c2 in zip(self.convs1, self.convs2):
                xt = c2(F.leaky_relu(c1(F.leaky_relu(x, lrelu)), lrelu))
                x = xt + x
            return x

        def remove_weight_norm(self):
            for c in list(self.convs1) + list(self.convs2):
                remove_weight_norm(c)

    class Generator(nn.Module):
        """Mini-NSF generator: the sine excitation is injected after the second upsampling."""

        def __init__(self):
            super().__init__()
            rates, kernels = h["upsample_rates"], h["upsample_kernel_sizes"]
            self.num_kernels = len(h["resblock_kernel_sizes"])
            self.num_upsamples = len(rates)
            self.source_sr = h["sampling_rate"] / int(np.prod(rates[2:]))
            self.upp = int(np.prod(rates[:2]))
            self.conv_pre = weight_norm(Conv1d(h["num_mels"], h["upsample_initial_channel"], 7, 1, padding=3))
            self.ups = nn.ModuleList()
            self.resblocks = nn.ModuleList()
            ch = h["upsample_initial_channel"]
            for i, (u, k) in enumerate(zip(rates, kernels)):
                ch //= 2
                self.ups.append(weight_norm(ConvTranspose1d(2 * ch, ch, k, u, padding=(k - u) // 2)))
                for rk, rd in zip(h["resblock_kernel_sizes"], h["resblock_dilation_sizes"]):
                    self.resblocks.append(ResBlock1(ch, rk, rd))
                if i == 1:
                    self.source_conv = Conv1d(1, ch, 1)
            self.conv_post = weight_norm(Conv1d(ch, 1, 7, 1, padding=3))

        def sine_source(self, f0):
            """Phase-continuous sine at the source rate for f0 [B, T] -> [B, 1, T * upp]."""
            n = torch.arange(1, self.upp + 1, device=f0.device)
            s0 = f0.unsqueeze(-1) / self.source_sr
            ds0 = F.pad(s0[:, 1:, :] - s0[:, :-1, :], (0, 0, 0, 1))
            rad = s0 * n + 0.5 * ds0 * n * (n - 1) / self.upp
            rad2 = torch.fmod(rad[..., -1:].float() + 0.5, 1.0) - 0.5
            rad_acc = rad2.cumsum(dim=1).fmod(1.0).to(f0)
            rad += F.pad(rad_acc[:, :-1, :], (0, 0, 1, 0))
            return torch.sin(2 * np.pi * rad.reshape(f0.shape[0], 1, -1))

        def forward(self, mel, har_source):
            x = self.conv_pre(mel)
            for i in range(self.num_upsamples):
                x = self.ups[i](F.leaky_relu(x, lrelu))
                if i == 1:
                    x = x + self.source_conv(har_source)
                xs = None
                for j in range(self.num_kernels):
                    r = self.resblocks[i * self.num_kernels + j](x)
                    xs = r if xs is None else xs + r
                x = xs / self.num_kernels
            return torch.tanh(self.conv_post(F.leaky_relu(x)))

        def remove_weight_norm(self):
            for layer in list(self.ups) + [self.conv_pre, self.conv_post]:
                remove_weight_norm(layer)
            for block in self.resblocks:
                block.remove_weight_norm()

    return Generator()


def _load():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    import torch
    ckpt = ensure_model()
    if ckpt is None:
        return None
    with open(os.path.join(MODEL_DIR, "config.json")) as f:
        h = json.load(f)
    gen = _build_generator(h)
    state = torch.load(ckpt, map_location="cpu", weights_only=True)["generator"]
    gen.load_state_dict(state)
    gen.eval()
    gen.remove_weight_norm()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    gen.to(device)

    import librosa
    mel_basis = librosa.filters.mel(sr=h["sampling_rate"], n_fft=h["n_fft"], n_mels=h["num_mels"],
                                    fmin=h["fmin"], fmax=h["fmax"])
    _MODEL = {"gen": gen, "h": h, "device": device,
              "mel_basis": torch.from_numpy(mel_basis).float().to(device)}
    return _MODEL


def unload():
    global _MODEL
    _MODEL = None
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def is_available() -> bool:
    return _load() is not None


def mel_spectrogram(y: np.ndarray, m: dict):
    """Natural-log mel exactly as the vocoder was trained on (nvSTFT, center=False)."""
    import torch
    h = m["h"]
    win, hop, n_fft = h["win_size"], h["hop_size"], h["n_fft"]
    x = torch.from_numpy(np.clip(y, -1.0, 1.0).astype(np.float32)).to(m["device"]).unsqueeze(0)
    x = torch.nn.functional.pad(x.unsqueeze(1), ((win - hop) // 2, (win - hop + 1) // 2), mode="reflect").squeeze(1)
    spec = torch.stft(x, n_fft, hop_length=hop, win_length=win, window=torch.hann_window(win, device=m["device"]),
                      center=False, normalized=False, onesided=True, return_complex=True).abs()
    return torch.log(torch.clamp(torch.matmul(m["mel_basis"], spec), min=1e-5))  # [1, mels, T]


def revoice(y: np.ndarray, sr: int, f0_hz: np.ndarray, f0_fps: float) -> Optional[np.ndarray]:
    """
    Re-voice mono `y` (any rate) on the pitch curve `f0_hz` (sampled at `f0_fps`, 0 = unvoiced).
    Returns mono audio at `sr` with the same length, or None when the vocoder is unavailable.
    """
    import torch
    m = _load()
    if m is None:
        return None
    vsr = m["h"]["sampling_rate"]
    if sr != vsr:
        import librosa
        y_v = librosa.resample(y.astype(np.float32), orig_sr=sr, target_sr=vsr)
    else:
        y_v = y.astype(np.float32)
    n = len(y_v)
    if n < HOP * 4:
        return None

    with torch.no_grad():
        mel = mel_spectrogram(y_v, m)
        frames = mel.shape[-1]
        # Frame i is centred at i*hop + hop/2 (nvSTFT padding); unvoiced gaps are bridged in log-pitch
        t_mel = (np.arange(frames) * HOP + HOP / 2) / vsr
        t_f0 = np.arange(len(f0_hz)) / f0_fps
        voiced = f0_hz > 0
        if voiced.sum() < 2:
            return None
        log_f0 = np.interp(t_f0, t_f0[voiced], np.log(f0_hz[voiced]))
        f0_mel = np.exp(np.interp(t_mel, t_f0, log_f0)).astype(np.float32)
        f0_t = torch.from_numpy(f0_mel).to(m["device"]).unsqueeze(0)

        gen = m["gen"]
        source = gen.sine_source(f0_t)  # one continuous phase for the whole song
        upp = gen.upp
        out = np.zeros(frames * HOP, dtype=np.float32)
        for start in range(0, frames, CHUNK_FRAMES):
            end = min(frames, start + CHUNK_FRAMES)
            a, b = max(0, start - CONTEXT_FRAMES), min(frames, end + CONTEXT_FRAMES)
            wav = gen(mel[:, :, a:b], source[:, :, a * upp:b * upp]).view(-1).cpu().numpy()
            out[start * HOP:end * HOP] = wav[(start - a) * HOP:(start - a + end - start) * HOP]

    out = out[:n] if len(out) >= n else np.pad(out, (0, n - len(out)))
    if sr != vsr:
        import librosa
        out = librosa.resample(out, orig_sr=vsr, target_sr=sr)
        out = out[:len(y)] if len(out) >= len(y) else np.pad(out, (0, len(y) - len(out)))
    return out.astype(np.float32)
