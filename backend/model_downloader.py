import os
import sys
import shutil
import logging
import urllib.request
import zipfile
import io

logger = logging.getLogger("lyra_downloader")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
MODELS_DIR = os.path.join(BASE_DIR, "models")

# RVC v2 Core Foundation Models
RVC_BASE_FILES = {
    os.path.join(ASSETS_DIR, "rmvpe.pt"): "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt",
    os.path.join(ASSETS_DIR, "hubert_base", "config.json"): "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base/config.json",
    os.path.join(ASSETS_DIR, "hubert_base", "preprocessor_config.json"): "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base/preprocessor_config.json",
    os.path.join(ASSETS_DIR, "hubert_base", "pytorch_model.bin"): "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base/pytorch_model.bin",
}

# Singer RVC v2 Neural Voice Checkpoints
SINGER_MODEL_ZIPS = {
    "arijit_singh": "https://huggingface.co/enescakircali/Arijit-Singh/resolve/main/arijit-singh.zip",
    "sonu_nigam": "https://huggingface.co/Nitishkumar8948/Sonunigam/resolve/main/sonu-nigam-model.zip",
    "kk": "https://huggingface.co/sarkari/kk/resolve/main/Krishnkumar%20Kunnath%20[KK]%20Indian%20Singer%20Voice%20Model%20-%20Weights.gg%20Model.zip",
}


def _download_file(url: str, dest_path: str, progress_cb=None, label: str = ""):
    """Download a file with user-agent headers and progress notifications."""
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    temp_path = dest_path + ".downloading"
    logger.info(f"Downloading {url} to {dest_path}...")
    
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req) as resp, open(temp_path, "wb") as f_out:
        total_size = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 1024 * 1024  # 1MB
        last_pct = 0
        while True:
            chunk = resp.read(chunk_size)
            if not chunk:
                break
            f_out.write(chunk)
            downloaded += len(chunk)
            if total_size > 0:
                pct = int((downloaded / total_size) * 100)
                if pct - last_pct >= 15:
                    last_pct = pct
                    if progress_cb and label:
                        progress_cb(60 + int(pct * 0.08), f"{label} ({pct}%)...")

    shutil.move(temp_path, dest_path)
    logger.info(f"Successfully downloaded {dest_path} ({os.path.getsize(dest_path)} bytes)")


def ensure_rvc_base_assets(progress_cb=None) -> bool:
    """Ensures HuBERT base and RMVPE neural pitch models exist locally."""
    for dest_path, url in RVC_BASE_FILES.items():
        if not os.path.exists(dest_path) or os.path.getsize(dest_path) < 1000:
            fname = os.path.basename(dest_path)
            if progress_cb:
                progress_cb(58, f"Downloading neural foundation model ({fname})...")
            try:
                _download_file(url, dest_path, progress_cb=progress_cb, label=f"Downloading {fname}")
            except Exception as e:
                logger.error(f"Failed to download foundation model {fname}: {e}")
                return False
    return True


def ensure_singer_model(model_name: str, progress_cb=None) -> bool:
    """
    Downloads and extracts singer model weights (.pth and .index) if missing.
    Ensures authentic RVC v2 neural singing voice conversion on any machine (e.g. Google Colab).
    """
    from audio_processor import AVAILABLE_MODELS
    model_info = AVAILABLE_MODELS.get(model_name)
    if not model_info:
        return False

    target_dir = model_info["dir"]
    pth_file = os.path.join(target_dir, model_info["pth"])
    idx_file = os.path.join(target_dir, model_info["index"])

    if os.path.exists(pth_file) and os.path.getsize(pth_file) > 1000000:
        return True

    zip_url = SINGER_MODEL_ZIPS.get(model_name)
    if not zip_url:
        return False

    singer_name = model_info.get("name", model_name)
    if progress_cb:
        progress_cb(62, f"Downloading {singer_name} neural singing voice checkpoint...")

    os.makedirs(target_dir, exist_ok=True)
    temp_zip = os.path.join(target_dir, "temp_model.zip")
    try:
        _download_file(zip_url, temp_zip, progress_cb=progress_cb, label=f"Downloading {singer_name} voice")
        with zipfile.ZipFile(temp_zip, "r") as z:
            for member in z.namelist():
                filename = os.path.basename(member)
                if filename.endswith(".pth") or filename.endswith(".index") or filename.endswith(".json"):
                    src = z.open(member)
                    out_path = os.path.join(target_dir, filename)
                    with open(out_path, "wb") as f_out:
                        shutil.copyfileobj(src, f_out)
        if os.path.exists(temp_zip):
            os.remove(temp_zip)
        # Ensure the expected .pth and .index filenames exist even if named differently inside the zip
        if not os.path.exists(pth_file):
            for f in os.listdir(target_dir):
                if f.endswith(".pth") and os.path.getsize(os.path.join(target_dir, f)) > 1000000:
                    shutil.copyfile(os.path.join(target_dir, f), pth_file)
                    logger.info(f"Aliased {f} to {model_info['pth']}")
                    break
        if not os.path.exists(idx_file):
            for f in os.listdir(target_dir):
                if f.endswith(".index") and os.path.getsize(os.path.join(target_dir, f)) > 1000:
                    shutil.copyfile(os.path.join(target_dir, f), idx_file)
                    logger.info(f"Aliased {f} to {model_info['index']}")
                    break
        logger.info(f"Extracted {singer_name} model to {target_dir}")
        return os.path.exists(pth_file)
    except Exception as e:
        logger.error(f"Error extracting {singer_name} model: {e}", exc_info=True)
        if os.path.exists(temp_zip):
            os.remove(temp_zip)
        return False
