"""
Voice registry: built-in singer models plus personal ("My Voice") models.

Personal voices live in models/custom/<voice_id>/ with a meta.json:
    {"id", "name", "kind": "personal", "pth", "index", "status", "created_at", ...}
They are either trained here (voice_training.py) or uploaded as an RVC v2
.pth (+ optional .index) trained elsewhere.
"""

import json
import os
import re
import shutil
import time
import uuid
from typing import Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CUSTOM_ROOT = os.path.join(BASE_DIR, "models", "custom")


def _slug(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", name.strip().lower()).strip("_")
    return s[:40] or "voice"


def _meta_path(voice_id: str) -> str:
    return os.path.join(CUSTOM_ROOT, voice_id, "meta.json")


def read_meta(voice_id: str) -> Optional[dict]:
    if not re.fullmatch(r"[a-z0-9_]+", voice_id or ""):
        return None
    p = _meta_path(voice_id)
    if not os.path.exists(p):
        return None
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return None


def write_meta(voice_id: str, meta: dict) -> dict:
    os.makedirs(os.path.join(CUSTOM_ROOT, voice_id), exist_ok=True)
    tmp = _meta_path(voice_id) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(meta, f, indent=2)
    os.replace(tmp, _meta_path(voice_id))
    return meta


def update_meta(voice_id: str, **fields) -> Optional[dict]:
    meta = read_meta(voice_id)
    if meta is None:
        return None
    meta.update(fields)
    return write_meta(voice_id, meta)


def new_voice(name: str, status: str = "pending") -> dict:
    voice_id = f"my_{_slug(name)}_{uuid.uuid4().hex[:6]}"
    meta = {
        "id": voice_id,
        "name": name.strip() or "My Voice",
        "kind": "personal",
        "tagline": "Your own voice • Personal neural model",
        "pth": "model.pth",
        "index": "model.index",
        "status": status,
        "progress": 0,
        "message": "",
        "created_at": time.time(),
    }
    return write_meta(voice_id, meta)


def register_uploaded_voice(name: str, pth_src: str, index_src: Optional[str] = None) -> dict:
    meta = new_voice(name, status="ready")
    vdir = os.path.join(CUSTOM_ROOT, meta["id"])
    shutil.move(pth_src, os.path.join(vdir, "model.pth"))
    if index_src and os.path.exists(index_src):
        shutil.move(index_src, os.path.join(vdir, "model.index"))
    meta["message"] = "Uploaded model"
    return write_meta(meta["id"], meta)


def list_custom_voices() -> list:
    if not os.path.isdir(CUSTOM_ROOT):
        return []
    out = []
    for vid in sorted(os.listdir(CUSTOM_ROOT)):
        meta = read_meta(vid)
        if meta:
            vdir = os.path.join(CUSTOM_ROOT, vid)
            meta["is_ready"] = meta.get("status") == "ready" and os.path.exists(os.path.join(vdir, meta["pth"]))
            meta["has_index"] = os.path.exists(os.path.join(vdir, meta["index"]))
            out.append(meta)
    return sorted(out, key=lambda m: m.get("created_at", 0), reverse=True)


def delete_voice(voice_id: str) -> bool:
    if read_meta(voice_id) is None:
        return False
    shutil.rmtree(os.path.join(CUSTOM_ROOT, voice_id), ignore_errors=True)
    return True


def resolve_model(model_name: str, builtin: dict) -> dict:
    """Return a model-info dict for a built-in singer or a personal voice."""
    if model_name in builtin:
        return builtin[model_name]
    meta = read_meta(model_name)
    if meta:
        return {
            "id": meta["id"],
            "name": meta["name"],
            "tagline": meta.get("tagline", ""),
            "dir": os.path.join(CUSTOM_ROOT, meta["id"]),
            "pth": meta["pth"],
            "index": meta["index"],
            "formant_type": None,
            "singing_style": None,  # never impose a celebrity's phrasing on your own voice
            "default_index_rate": 0.75,
            "kind": "personal",
        }
    return builtin["arijit_singh"]
