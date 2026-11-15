"""
Find and download the audio of a song by title and artist (used for Spotify
links, which carry no audio) or from a direct link.

Shared by the Lyra server and the Lyra download helper that runs on your own
computer (backend/helper/), so both pick exactly the same recording: candidates
from YouTube and SoundCloud are scored on title, artist and length, and edits
(slowed, reverb, karaoke, covers...) are rejected.

Needs only yt-dlp and the Python standard library.
"""

import logging
import re
from typing import Callable, List, Optional, Tuple

logger = logging.getLogger(__name__)


def is_bot_block(message: str) -> bool:
    """YouTube's "sign in to confirm you're not a bot" (it blocks cloud servers)."""
    m = (message or "").lower()
    return "sign in to confirm" in m or "not a bot" in m


def score_candidate(
    cand_title: str,
    cand_uploader: str,
    cand_duration: float,
    target_title: str,
    target_artist: str,
    target_duration: float
) -> float:
    """
    Scores an audio stream candidate against target metadata.
    Rejects slowed/reverb edits, fan covers, instrumental/karaoke, and duration mismatches.
    """
    t_clean = (target_title or "").lower().strip()
    a_clean = (target_artist or "").lower().strip()
    cand_text = f"{cand_title or ''} {cand_uploader or ''}".lower()

    # Penalize unwanted edits, covers, slowed/reverb, ringtones
    penalties = [
        "slowed", "reverb", "sped up", "speed up", "nightcore", "lofi", "lo-fi",
        "8d", "8-d", "remix", "cover", "status", "whatsapp", "ringtone", "teaser",
        "trailer", "reaction", "mashup", "karaoke", "instrumental", "clean vocal",
        "acapella", "isolated vocals", "bass boosted", "slow reverb", "slow+reverb",
        "pitched", "edit audio", "slow version", "reverb version"
    ]
    for p in penalties:
        if p in cand_text and p not in t_clean:
            return -999.0

    score = 0.0

    # Duration matching (huge signal for studio track vs teaser/podcast/slowed)
    if target_duration > 0 and cand_duration > 0:
        diff = abs(cand_duration - target_duration)
        if cand_duration < 45 and target_duration > 70:
            return -999.0
        if diff <= 4:
            score += 50.0
        elif diff <= 10:
            score += 35.0
        elif diff <= 20:
            score += 20.0
        elif diff <= 35:
            score += 5.0
        elif diff > 60:
            score -= 60.0
        if diff > 100:
            return -999.0

    # Target title word match
    t_words = [w for w in re.split(r'\W+', t_clean) if len(w) > 2]
    matched_words = [w for w in t_words if w in cand_text]
    if t_words:
        ratio = len(matched_words) / len(t_words)
        score += ratio * 40.0
        if ratio < 0.5:
            score -= 30.0

    # Exact title phrase match
    if t_clean and t_clean in cand_text:
        score += 25.0

    # Artist word match
    a_words = [w for w in re.split(r'\W+', a_clean) if len(w) > 2]
    matched_a = [w for w in a_words if w in cand_text]
    if a_words:
        score += (len(matched_a) / len(a_words)) * 30.0

    # Official track indicators
    for boost in ["official audio", "original audio", "full song", "official music video", "official video", "original motion picture"]:
        if boost in cand_text:
            score += 15.0

    return score


def search_queries(title: str, artist: str) -> List[str]:
    primary = artist.split(",")[0].strip() if artist else ""
    qs = [f"{primary} {title}".strip(), f"{artist} {title}".strip(), f"{title}".strip()]
    return list(dict.fromkeys(q for q in qs if q))


def find_candidates(title: str, artist: str, duration: float, search_opts: dict) -> List[Tuple]:
    """[(score, url, title, duration, source)] best first, from YouTube and SoundCloud search."""
    import yt_dlp
    queries = search_queries(title, artist)
    candidates = []
    with yt_dlp.YoutubeDL({**search_opts, "extract_flat": True}) as ydl:
        for q in queries[:2]:
            try:
                res = ydl.extract_info(f"ytsearch8:{q}", download=False)
                for e in (res or {}).get("entries") or []:
                    if not e or not e.get("id"):
                        continue
                    s = score_candidate(e.get("title") or "", e.get("uploader") or "", e.get("duration") or 0,
                                        title, artist, duration)
                    if s > 0:
                        candidates.append((s, f"https://www.youtube.com/watch?v={e['id']}", e.get("title") or "",
                                           e.get("duration") or 0, "YouTube"))
            except Exception as e:
                logger.warning(f"YouTube search error for query '{q}': {e}")
    for q in queries[:2]:
        try:
            with yt_dlp.YoutubeDL({"extract_flat": True, "quiet": True}) as sc:
                res = sc.extract_info(f"scsearch8:{q}", download=False)
            for e in (res or {}).get("entries") or []:
                if not e or not e.get("url"):
                    continue
                s = score_candidate(e.get("title") or "", e.get("uploader") or "", e.get("duration") or 0,
                                    title, artist, duration)
                if s > 0:
                    candidates.append((s, e["url"], e.get("title") or "", e.get("duration") or 0, "SoundCloud"))
        except Exception as e:
            logger.warning(f"SoundCloud search error for query '{q}': {e}")
    seen, unique = set(), []
    for c in candidates:
        if c[1] not in seen:
            seen.add(c[1])
            unique.append(c)
    unique.sort(key=lambda c: -c[0])
    return unique


def download_song(title: str, artist: str, duration: float, search_opts: dict, download_opts: dict,
                  log: Optional[Callable[[str], None]] = None) -> dict:
    """
    Download the best matching recording of a song. Returns the yt-dlp info of the
    download plus "source". Raises RuntimeError (with bot_blocked=True when YouTube
    refused every candidate with its bot check).
    """
    import yt_dlp
    candidates = find_candidates(title, artist, duration, search_opts)
    name = f"{artist} - {title}" if artist else title
    if not candidates:
        raise RuntimeError(f"Could not find '{name}' on YouTube or SoundCloud. Upload the song file instead.")
    last_err, blocked = None, False
    for score, url, c_title, c_dur, source in candidates:
        (log or logger.info)(f"Trying {source} (score {score:.0f}): '{c_title}' ({c_dur}s)")
        try:
            with yt_dlp.YoutubeDL(download_opts) as ydl:
                info = ydl.extract_info(url, download=True)
            info = dict(info or {})
            info["source"] = source
            info["matched_title"] = c_title
            return info
        except Exception as e:
            last_err = e
            blocked = blocked or is_bot_block(str(e))
            logger.warning(f"Candidate {url} failed ({e}), trying next")
    err = RuntimeError(f"Could not download audio for '{name}': {last_err}")
    err.bot_blocked = blocked
    raise err
