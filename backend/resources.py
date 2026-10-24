"""
Resource profile: keep Lyra friendly to small machines.

    LYRA_PROFILE=lite       small models (~0.6 GB instead of ~2.7 GB), half the
                            CPU cores, low process priority, WAV masters and
                            intermediates removed after each song
    LYRA_PROFILE=standard   full-size models, most CPU cores
    (unset)                 auto: lite when free disk < 25 GB or RAM <= 16 GB

Also guards the disk: a model download that would leave less than
`MIN_FREE_GB` free is skipped instead of filling the drive.
"""

import logging
import os
import shutil

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MIN_FREE_GB = float(os.environ.get("LYRA_MIN_FREE_GB", "3"))

# Guard Apple Silicon unified memory against swap explosion:
# Disables MPS over-allocation and enables immediate buffer reclamation back to macOS
if "PYTORCH_MPS_HIGH_WATERMARK_RATIO" not in os.environ:
    os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"

try:
    import mlx.core as mx
    # Release inactive Metal buffers back to macOS immediately
    if hasattr(mx, "set_cache_limit"):
        mx.set_cache_limit(0)
    elif hasattr(mx.metal, "set_cache_limit"):
        mx.metal.set_cache_limit(0)
except Exception:
    pass


def free_gb(path: str = BASE_DIR) -> float:
    try:
        return shutil.disk_usage(path).free / 1e9
    except Exception:
        return 999.0


def ram_gb() -> float:
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9
    except Exception:
        return 0.0


def _detect() -> str:
    env = os.environ.get("LYRA_PROFILE", "").strip().lower()
    if env in ("lite", "standard"):
        return env
    ram = ram_gb()
    if free_gb() < 25 or (0 < ram <= 16.5):
        return "lite"
    return "standard"


PROFILE = _detect()
LITE = PROFILE == "lite"

# Separation models per profile (pymss catalog names)
SEPARATION_MODELS = {
    "lite": {
        "vocals": "bs_roformer_voc_hyperacev2",                 # ~290 MB
        "karaoke": "bs_roformer_karaoke_anvuew",                # ~205 MB
        "dereverb": "dereverb_room_anvuew_sdr_13.7432",         # ~120 MB
    },
    "standard": {
        "vocals": "mel_band_roformer_vocals_fv4_gabox",         # ~910 MB
        "karaoke": "mel_band_roformer_karaoke_gabox_v2",        # ~910 MB
        "dereverb": "dereverb_mel_band_roformer_less_aggressive_anvuew_sdr_18.8050",  # ~910 MB
    },
}


def cpu_threads() -> int:
    cores = os.cpu_count() or 4
    # On <=8GB RAM Macs, limit PyTorch to 2 threads to prevent 100% CPU saturation
    # and thermal throttling, keeping performance cores free for the browser & IDE.
    if ram_gb() <= 9.0:
        return max(1, min(2, cores // 2))
    return max(1, cores // 2) if LITE else max(1, cores - 1)


def apply_worker_limits():
    """Call at the start of each heavy job thread/process."""
    try:
        import torch
        torch.set_num_threads(cpu_threads())
    except Exception:
        pass
    if LITE:
        try:
            os.nice(15)  # give browser and IDE high priority
        except Exception:
            pass


def has_room_for(size_bytes: int, what: str = "model") -> bool:
    need_gb = size_bytes / 1e9
    left = free_gb() - need_gb
    if left < MIN_FREE_GB:
        logger.warning(f"Skipping {what}: needs {need_gb:.1f} GB, only {free_gb():.1f} GB free "
                       f"(keeping {MIN_FREE_GB:.0f} GB spare)")
        return False
    return True


# Lean retention: keep only the essential finished outputs
# 1. master_remastered.mp3 (the finished mastered song)
# 2. converted_vocals.wav / vocal_processed.wav (the AI lead vocals)
# 3. accompaniment.wav / instrumental.wav (the backing track)
# 4. meta.json & pipeline_state.json (track title, artist, art)
_KEEP = {
    "meta.json", "pipeline_state.json",
    "master_remastered.mp3",
    "converted_vocals.wav", "vocal_processed.wav",
    "accompaniment.wav", "instrumental.wav",
}


def cleanup_job(job_dir: str) -> float:
    """Delete intermediates and uncompressed duplicates of a finished job. Returns MB freed."""
    freed = 0
    for name in os.listdir(job_dir):
        path = os.path.join(job_dir, name)
        # Drop redundant scratch directories
        if name in ("guide", "stems") and os.path.isdir(path):
            freed += _dir_size(path)
            shutil.rmtree(path, ignore_errors=True)
            continue
        if os.path.isdir(path):
            freed += _dir_size(path)
            shutil.rmtree(path, ignore_errors=True)
        elif name not in _KEEP:
            freed += os.path.getsize(path)
            os.remove(path)
    return freed / 1e6


def _dir_size(path: str) -> int:
    total = 0
    for root, _, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def storage_report(outputs_dir: str) -> dict:
    models_dir = os.path.join(BASE_DIR, "models")
    assets_dir = os.path.join(BASE_DIR, "assets")
    return {
        "profile": PROFILE,
        "free_gb": round(free_gb(), 1),
        "ram_gb": round(ram_gb(), 1),
        "songs_mb": round(_dir_size(outputs_dir) / 1e6) if os.path.isdir(outputs_dir) else 0,
        "models_mb": round((_dir_size(models_dir) + _dir_size(assets_dir)) / 1e6),
    }
