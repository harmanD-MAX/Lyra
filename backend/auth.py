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

# Firebase Authentication handles "Sign in with Google" (free, no Google Cloud Console setup).
# These web-app values are public; they're served to the browser by /api/auth/config.
FIREBASE_CONFIG = {
    "apiKey": os.environ.get("FIREBASE_API_KEY", "AIzaSyCuMgIiJKpBGCkpuW-GR4lPg7oUBvAHI2s"),
    "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN", "lyra-3db8f.firebaseapp.com"),
    "projectId": os.environ.get("FIREBASE_PROJECT_ID", "lyra-3db8f"),
    "appId": os.environ.get("FIREBASE_APP_ID", "1:577932462728:web:9146d4bdde2f1d8e47ad3d"),
}
SESSION_COOKIE = "lyra_session"
SESSION_TTL = 30 * 24 * 3600

# Without LYRA_SESSION_SECRET every restart (e.g. a new Colab runtime) signs everyone out.
_SECRET = os.environ.get("LYRA_SESSION_SECRET") or secrets.token_hex(32)
if not os.environ.get("LYRA_SESSION_SECRET"):
    logger.warning("LYRA_SESSION_SECRET not set; sessions will not survive a restart.")


def is_auth_enabled() -> bool:
    return bool(FIREBASE_CONFIG["apiKey"] and FIREBASE_CONFIG["authDomain"] and d1_db.is_d1_configured())


def verify_firebase_token(id_token: str) -> dict:
    """Checks a Firebase ID token with Firebase and returns the signed-in Google account."""
    resp = httpx.post(
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup",
        params={"key": FIREBASE_CONFIG["apiKey"]},
        json={"idToken": id_token},
        timeout=10,
    )
    if resp.status_code != 200:
        raise ValueError("Invalid or expired sign-in, please try again")
    users = resp.json().get("users") or []
    if not users:
        raise ValueError("Account not found")
    account = users[0]
    if not account.get("email") or not account.get("emailVerified"):
        raise ValueError("Google account email is not verified")
    return {
        "id": account["localId"],
        "email": account["email"],
        "name": account.get("displayName", ""),
        "picture": account.get("photoUrl", ""),
    }


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
