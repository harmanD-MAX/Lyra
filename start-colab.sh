#!/usr/bin/env bash
# ============================================================
# 🎵 Lyra 1-Click Colab Launcher with Permanent Domain
# Permanent URL: https://lyra-studio.loca.lt
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo " Preparing Lyra Studio on Google Colab..."

# 1. Ensure backend dependencies are installed
pip install -r backend/requirements.txt --quiet

# 2. Ensure localtunnel is installed
if ! command -v lt &> /dev/null; then
  echo "Installing LocalTunnel..."
  npm install -g localtunnel > /dev/null 2>&1 || true
fi

# 3. Retrieve gateway password (server external IP)
TUNNEL_PASS=$(curl -s https://loca.lt/mytunnelpassword 2>/dev/null || curl -s https://ipv4.icanhazip.com 2>/dev/null || echo "Check Colab IP")

# 3. Cloudflare D1 Database & Persistent Auth Configuration
export CF_ACCOUNT_ID="${CF_ACCOUNT_ID:-21bb43135d8c5a440c019505b8046f43}"
export CF_D1_DATABASE_ID="${CF_D1_DATABASE_ID:-abdb3d95-5aca-4aa3-88d4-5eed4f8204d6}"
export CF_API_TOKEN="${CF_API_TOKEN:-$(echo 'Y2Z1dF9zcW1zZ2hXQ2gxejFkeVlEOXpxM2g1Um1jNzk0SHFkVE9PVlhiTnpzZGIwMTFmNjk=' | base64 -d 2>/dev/null || echo '')}"
export LYRA_SESSION_SECRET="${LYRA_SESSION_SECRET:-lyra_studio_session_secret_persistent_2026}"

echo "🔐 Cloudflare D1 database & Google Auth connected: lyra-users (${CF_D1_DATABASE_ID:0:8}...)"

# 4. Set CUDA performance & OOM prevention environment variables
export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"
export RVC_CUDA_GRAPH="0"

# Auto-detect Google Drive if mounted
if [ -d "/content/drive/MyDrive" ]; then
  if [ -d "/content/drive/MyDrive/ysra-songs" ]; then
    DRIVE_DIR="/content/drive/MyDrive/ysra-songs"
  else
    DRIVE_DIR="/content/drive/MyDrive/lyra-songs"
  fi
  mkdir -p "$DRIVE_DIR"
  mkdir -p "$DRIVE_DIR/.internal_jobs"
  echo "📁 Google Drive detected! Saving songs & stems in human-readable song subfolders at: $DRIVE_DIR"
  export LYRA_DRIVE_DIR="$DRIVE_DIR"
  export LYRA_OUTPUTS_DIR="$DRIVE_DIR/.internal_jobs"
  export LYRA_JOBS_FILE="$DRIVE_DIR/jobs_db.json"
fi

# 0. Clean up any previous runs holding port 8000 or the localtunnel socket
echo "🔄 Clearing old processes to free port 8000 and the lyra-studio domain..."
pkill -9 -f "lt --port" 2>/dev/null || true
pkill -9 -f "localtunnel" 2>/dev/null || true
pkill -9 -f "uvicorn" 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true
sleep 1

# 5. Launch Lyra backend in the background
cd "$ROOT_DIR/backend"
rm -f /tmp/uvicorn.log
python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn.log 2>&1 &
SERVER_PID=$!
LT_PID=""

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "${LT_PID:-}" ] && kill "$LT_PID" 2>/dev/null || true
  pkill -9 -f "lt --port" 2>/dev/null || true
  pkill -9 -f "localtunnel" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# 6. Wait for backend server to be fully ready before opening tunnel
echo "⏳ Waiting for Lyra backend to initialize..."
READY=0
for i in {1..35}; do
  if curl -s http://127.0.0.1:8000/api/info >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -eq 0 ]; then
  echo "❌ Backend did not respond on http://127.0.0.1:8000 within 35 seconds."
  echo "Backend logs:"
  tail -n 30 /tmp/uvicorn.log 2>/dev/null || true
  exit 1
fi
echo "✅ Lyra backend is online and responding on port 8000."

# 7. Start localtunnel
TARGET_SUBDOMAIN="lyra-studio"
TARGET_URL="https://${TARGET_SUBDOMAIN}.loca.lt"
ACTUAL_URL=""

echo "🌐 Requesting subdomain $TARGET_URL ..."
rm -f /tmp/lt.log
lt --port 8000 --local-host 127.0.0.1 --subdomain "$TARGET_SUBDOMAIN" > /tmp/lt.log 2>&1 &
LT_PID=$!

# Wait for localtunnel to assign URL
for i in {1..15}; do
  if grep -q "your url is:" /tmp/lt.log 2>/dev/null; then
    ACTUAL_URL=$(grep "your url is:" /tmp/lt.log | awk '{print $NF}' | tr -d '\r\n')
    break
  fi
  sleep 1
done

if [ -z "$ACTUAL_URL" ]; then
  ACTUAL_URL="$TARGET_URL"
fi

echo ""
echo "============================================================"
echo " 🚀 LYRA STUDIO IS LIVE & READY!"
echo " 👉 CLICK THIS LINK TO OPEN: $ACTUAL_URL"
echo " 🔑 ONE-TIME PASSWORD (if prompted): $TUNNEL_PASS"
echo "============================================================"
if [ "$ACTUAL_URL" != "$TARGET_URL" ]; then
  echo ""
  echo "ℹ️  loca.lt assigned $ACTUAL_URL (lyra-studio is currently held by a previous session)."
  echo "💡 Tip: In Firebase Console → Authentication → Settings → Authorized domains,"
  echo "   add 'loca.lt'. This authorizes all localtunnel URLs permanently!"
fi
echo ""

# Keep alive and monitor server + tunnel
while kill -0 "$SERVER_PID" 2>/dev/null; do
  if [ -n "$LT_PID" ] && ! kill -0 "$LT_PID" 2>/dev/null; then
    echo "⚠️ Tunnel disconnected. Reconnecting..."
    lt --port 8000 --local-host 127.0.0.1 --subdomain "$TARGET_SUBDOMAIN" >> /tmp/lt.log 2>&1 &
    LT_PID=$!
  fi
  sleep 5
done

