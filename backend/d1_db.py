import os
import json
import time
import logging
from typing import Any, Optional

import httpx

logger = logging.getLogger("lyra_d1")

# Cloudflare D1 is reached over its REST API, so the backend can run anywhere
# (Colab, Mac, a VPS) and still share one database with the R2 bucket's account.
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("R2_ACCOUNT_ID", "")
CF_D1_DATABASE_ID = os.environ.get("CF_D1_DATABASE_ID", "")
CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        picture TEXT,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS songs (
        job_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        cloud_url TEXT,
        data TEXT,
        created_at INTEGER NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_songs_user ON songs(user_id, created_at DESC)",
]


def is_d1_configured() -> bool:
    return bool(CF_ACCOUNT_ID and CF_D1_DATABASE_ID and CF_API_TOKEN)


def query(sql: str, params: Optional[list] = None) -> list[dict[str, Any]]:
    """Runs one SQL statement on D1 and returns its rows. Raises on failure."""
    if not is_d1_configured():
        raise RuntimeError("Cloudflare D1 is not configured")
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{CF_D1_DATABASE_ID}/query"
    resp = httpx.post(
        url,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}"},
        json={"sql": sql, "params": params or []},
        timeout=15,
    )
    data = resp.json()
    if resp.status_code != 200 or not data.get("success"):
        raise RuntimeError(f"D1 query failed: {data.get('errors') or resp.text}")
    result = data.get("result") or [{}]
    return result[0].get("results") or []


def init_schema() -> bool:
    if not is_d1_configured():
        logger.info("Cloudflare D1 not configured; accounts are disabled.")
        return False
    try:
        for stmt in SCHEMA:
            query(stmt)
        # Databases created before songs.data existed
        try:
            query("ALTER TABLE songs ADD COLUMN data TEXT")
        except RuntimeError as e:
            if "duplicate column" not in str(e).lower():
                raise
        return True
    except Exception as e:
        logger.error(f"Failed to initialise D1 schema: {e}")
        return False


def upsert_user(user_id: str, email: str, name: str, picture: str) -> dict:
    now = int(time.time())
    query(
        """INSERT INTO users (id, email, name, picture, created_at, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             email = excluded.email, name = excluded.name,
             picture = excluded.picture, last_login_at = excluded.last_login_at""",
        [user_id, email, name, picture, now, now],
    )
    return {"id": user_id, "email": email, "name": name, "picture": picture}


def get_user(user_id: str) -> Optional[dict]:
    rows = query("SELECT id, email, name, picture FROM users WHERE id = ?", [user_id])
    return rows[0] if rows else None


def add_song(job_id: str, user_id: str, title: str, cloud_url: str, job: dict) -> None:
    """Records a saved song; `job` is the full job record so the song can be reopened anywhere."""
    query(
        """INSERT INTO songs (job_id, user_id, title, cloud_url, data, created_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(job_id) DO UPDATE SET
             title = excluded.title, cloud_url = excluded.cloud_url, data = excluded.data""",
        [job_id, user_id, title, cloud_url, json.dumps(job), int(time.time())],
    )


def list_songs(user_id: str) -> list[dict]:
    """Returns the user's songs as job records, newest first."""
    rows = query(
        "SELECT job_id, title, cloud_url, data, created_at FROM songs WHERE user_id = ? ORDER BY created_at DESC",
        [user_id],
    )
    songs = []
    for r in rows:
        try:
            job = json.loads(r.get("data") or "{}")
        except ValueError:
            job = {}
        job["id"] = r["job_id"]
        job["status"] = "completed"
        job.setdefault("progress", 100)
        job.setdefault("created_at", r["created_at"])
        job.setdefault("metadata", {})
        results = job.get("results") or {}
        results.setdefault("title", r.get("title"))
        results["saved_to_cloud"] = True
        results["cloud_master_3d_url"] = results.get("cloud_master_3d_url") or r.get("cloud_url")
        job["results"] = results
        songs.append(job)
    return songs


def get_song_owner(job_id: str) -> Optional[str]:
    rows = query("SELECT user_id FROM songs WHERE job_id = ?", [job_id])
    return rows[0]["user_id"] if rows else None


def delete_song(job_id: str) -> None:
    query("DELETE FROM songs WHERE job_id = ?", [job_id])
