import os
import hmac
import time
import base64
import hashlib
import logging
import secrets
from typing import Optional

import httpx
from fastapi import Request

import d1_db

logger = logging.getLogger("lyra_auth")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
SESSION_COOKIE = "lyra_session"
SESSION_TTL = 30 * 24 * 3600

# Without LYRA_SESSION_SECRET every restart (e.g. a new Colab runtime) signs everyone out.
_SECRET = os.environ.get("LYRA_SESSION_SECRET") or secrets.token_hex(32)
if not os.environ.get("LYRA_SESSION_SECRET"):
    logger.warning("LYRA_SESSION_SECRET not set; sessions will not survive a restart.")


def is_auth_enabled() -> bool:
    return bool(GOOGLE_CLIENT_ID and d1_db.is_d1_configured())


def verify_google_credential(credential: str) -> dict:
    """Checks a Google Identity Services ID token and returns its claims."""
    resp = httpx.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": credential}, timeout=10)
    if resp.status_code != 200:
        raise ValueError("Invalid Google credential")
    claims = resp.json()
    if claims.get("aud") != GOOGLE_CLIENT_ID:
        raise ValueError("Google credential was issued for a different app")
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Google credential has an unexpected issuer")
    if int(claims.get("exp", 0)) < time.time():
        raise ValueError("Google credential has expired")
    if str(claims.get("email_verified")).lower() != "true":
        raise ValueError("Google account email is not verified")
    return claims


def _sign(payload: str) -> str:
    mac = hmac.new(_SECRET.encode(), payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")


def create_session_token(user_id: str) -> str:
    payload = f"{user_id}.{int(time.time()) + SESSION_TTL}"
    return f"{payload}.{_sign(payload)}"


def _user_id_from_token(token: str) -> Optional[str]:
    try:
        user_id, exp, sig = token.rsplit(".", 2)
    except ValueError:
        return None
    if not hmac.compare_digest(sig, _sign(f"{user_id}.{exp}")):
        return None
    if int(exp) < time.time():
        return None
    return user_id


def current_user_id(request: Request) -> Optional[str]:
    token = request.cookies.get(SESSION_COOKIE)
    return _user_id_from_token(token) if token else None
