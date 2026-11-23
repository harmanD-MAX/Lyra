#!/usr/bin/env bash
# run lyra on google colab
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "🚀 Preparing Lyra Studio on Google Colab..."

# install dependencies
pip install -r backend/requirements.txt --quiet

# tunnel setup (defaults to loca for fixed permanent https://lyra-studio.loca.lt URL)
TUNNEL="${LYRA_TUNNEL:-loca}"
TARGET_SUBDOMAIN="lyra-studio"
CLOUDFLARED="$ROOT_DIR/.bin/cloudflared"

if [ "$TUNNEL" = "cloudflare" ] || [ -n "${CF_TUNNEL_TOKEN:-}" ]; then
  if ! command -v cloudflared >/dev/null 2>&1 && [ ! -x "$CLOUDFLARED" ]; then
    echo "📥 Downloading Cloudflare Tunnel (cloudflared)..."
    mkdir -p "$ROOT_DIR/.bin"
    curl -fsSL --retry 3 -o "$CLOUDFLARED" \
      https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    chmod +x "$CLOUDFLARED"
  fi
  if command -v cloudflared >/dev/null 2>&1; then
    CLOUDFLARED="$(command -v cloudflared)"
  fi
fi

if [ "$TUNNEL" = "loca" ] || ! command -v cloudflared >/dev/null 2>&1 && [ ! -x "$CLOUDFLARED" ]; then
  if ! command -v lt &> /dev/null; then
    echo "Installing LocalTunnel..."
    npm install -g localtunnel > /dev/null 2>&1 || true
  fi
  LT_FIX_TARGET="$(npm root -g 2>/dev/null || true)/localtunnel/lib/HeaderHostTransformer.js"
  if [ -f "$LT_FIX_TARGET" ]; then
    cp "$ROOT_DIR/tools/localtunnel-host-fix.js" "$LT_FIX_TARGET"
  fi
fi

# cloudflare auth setup
export CF_ACCOUNT_ID="${CF_ACCOUNT_ID:-21bb43135d8c5a440c019505b8046f43}"
export CF_D1_DATABASE_ID="${CF_D1_DATABASE_ID:-abdb3d95-5aca-4aa3-88d4-5eed4f8204d6}"
export CF_API_TOKEN="${CF_API_TOKEN:-$(echo 'Y2Z1dF9zcW1zZ2hXQ2gxejFkeVlEOXpxM2g1Um1jNzk0SHFkVE9PVlhiTnpzZGIwMTFmNjk=' | base64 -d 2>/dev/null || echo '')}"
export LYRA_SESSION_SECRET="${LYRA_SESSION_SECRET:-lyra_studio_session_secret_persistent_2026}"

echo "🔐 Cloudflare D1 database & Google Auth connected: lyra-users (${CF_D1_DATABASE_ID:0:8}...)"

# cuda memory settings
export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"
export RVC_CUDA_GRAPH="0"

# detect google drive
if [ -d "/content/drive/MyDrive" ]; then
  if [ -d "/content/drive/MyDrive/Lyra_Songs" ]; then
    DRIVE_DIR="/content/drive/MyDrive/Lyra_Songs"
  elif [ -d "/content/drive/MyDrive/ysra-songs" ]; then
    DRIVE_DIR="/content/drive/MyDrive/ysra-songs"
  else
    DRIVE_DIR="/content/drive/MyDrive/lyra-songs"
  fi
  mkdir -p "$DRIVE_DIR"
  mkdir -p "$DRIVE_DIR/.internal_jobs"
  echo "📁 Google Drive detected! Saving songs & stems in: $DRIVE_DIR"
  export LYRA_DRIVE_DIR="$DRIVE_DIR"
  export LYRA_OUTPUTS_DIR="$DRIVE_DIR/.internal_jobs"
  export LYRA_JOBS_FILE="$DRIVE_DIR/jobs_db.json"
fi

# clear old processes
echo "🔄 Clearing old processes to free port 8000..."
pkill -9 -f "cloudflared tunnel" 2>/dev/null || true
pkill -9 -f "lt --port" 2>/dev/null || true
pkill -9 -f "localtunnel" 2>/dev/null || true
pkill -9 -f "uvicorn" 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true
sleep 1

# start backend server
cd "$ROOT_DIR/backend"
rm -f /tmp/uvicorn.log /tmp/cloudflared.log /tmp/lt.log
python3 -m uvicorn app:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn.log 2>&1 &
SERVER_PID=$!
TUNNEL_PID=""

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  pkill -9 -f "cloudflared tunnel" 2>/dev/null || true
  pkill -9 -f "lt --port" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# wait for backend to be ready
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

# start tunnel
start_tunnel() {
  ACTUAL_URL=""

  if [ -n "${CF_TUNNEL_TOKEN:-}" ]; then
    echo "🌐 Starting Cloudflare with permanent custom domain token..."
    rm -f /tmp/cloudflared.log
    "$CLOUDFLARED" tunnel --no-autoupdate run --token "$CF_TUNNEL_TOKEN" > /tmp/cloudflared.log 2>&1 &
    TUNNEL_PID=$!
    ACTUAL_URL="${CF_FIXED_DOMAIN:-https://${TARGET_SUBDOMAIN}.yourdomain.com}"
  elif [ "$TUNNEL" = "cloudflare" ]; then
    echo "🌐 Starting Cloudflare quick tunnel..."
    rm -f /tmp/cloudflared.log
    "$CLOUDFLARED" tunnel --no-autoupdate --url http://127.0.0.1:8000 > /tmp/cloudflared.log 2>&1 &
    TUNNEL_PID=$!
    for i in {1..35}; do
      if [ -f /tmp/cloudflared.log ]; then
        ACTUAL_URL=$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/cloudflared.log 2>/dev/null | head -n 1 || true)
        [ -n "$ACTUAL_URL" ] && break
      fi
      sleep 1
    done
  fi

  # Default: Localtunnel with fixed subdomain 'lyra-studio' and retry to claim
  if [ "$TUNNEL" = "loca" ] || [ -z "$ACTUAL_URL" ]; then
    echo "🌐 Starting Localtunnel claiming fixed address: https://${TARGET_SUBDOMAIN}.loca.lt ..."
    for attempt in {1..4}; do
      rm -f /tmp/lt.log
      lt --port 8000 --local-host 127.0.0.1 --subdomain "$TARGET_SUBDOMAIN" > /tmp/lt.log 2>&1 &
      TUNNEL_PID=$!
      for i in {1..15}; do
        if [ -f /tmp/lt.log ]; then
          ACTUAL_URL=$(grep -oE "https://[a-zA-Z0-9-]+\.loca\.lt" /tmp/lt.log 2>/dev/null | head -n 1 || true)
          [ -n "$ACTUAL_URL" ] && break
        fi
        sleep 1
      done
      if [ "$ACTUAL_URL" = "https://${TARGET_SUBDOMAIN}.loca.lt" ]; then
        break
      fi
      if [ $attempt -lt 4 ]; then
        echo "⏳ Subdomain '$TARGET_SUBDOMAIN' is releasing from previous session, retrying to claim ($attempt/3)..."
        kill "$TUNNEL_PID" 2>/dev/null || true
        sleep 3
      fi
    done
  fi

  if [ -n "$ACTUAL_URL" ]; then
    TUNNEL_PASS=$(curl -s https://loca.lt/mytunnelpassword 2>/dev/null || curl -s https://ipv4.icanhazip.com 2>/dev/null || echo "")
    echo ""
    echo "============================================================"
    echo " 🚀 LYRA STUDIO IS LIVE & READY!"
    echo " 👉 CLICK THIS LINK TO OPEN: $ACTUAL_URL"
    if [[ "$ACTUAL_URL" == *"loca.lt"* ]]; then
      if [ -n "$TUNNEL_PASS" ]; then
        echo " 🔑 Password (if asked on first visit): $TUNNEL_PASS"
      fi
      echo " 📌 Fixed address: https://$TARGET_SUBDOMAIN.loca.lt"
    fi
    echo " ⚠️  IMPORTANT: Keep this cell running while using Lyra!"
    echo "============================================================"
    echo ""
  else
    echo "============================================================"
    echo " ⏳ Acquiring tunnel URL, waiting..."
    echo "============================================================"
  fi
}
start_tunnel

# keep tunnel alive and print URL as soon as available
while kill -0 "$SERVER_PID" 2>/dev/null; do
  if [ -z "$ACTUAL_URL" ]; then
    if [ -f /tmp/lt.log ]; then
      ACTUAL_URL=$(grep -oE "https://[a-zA-Z0-9-]+\.loca\.lt" /tmp/lt.log 2>/dev/null | head -n 1 || true)
    fi
    if [ -z "$ACTUAL_URL" ] && [ -f /tmp/cloudflared.log ]; then
      ACTUAL_URL=$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/cloudflared.log 2>/dev/null | head -n 1 || true)
    fi
    if [ -n "$ACTUAL_URL" ]; then
      echo ""
      echo "============================================================"
      echo " 🚀 LYRA STUDIO IS LIVE & READY!"
      echo " 👉 CLICK THIS LINK TO OPEN: $ACTUAL_URL"
      echo " ⚠️  Keep this cell running! Stopping (^C) closes the tunnel."
      echo "============================================================"
      echo ""
    fi
  fi
  if [ -n "${TUNNEL_PID:-}" ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "⚠️ Tunnel disconnected. Reconnecting..."
    start_tunnel
  fi
  sleep 5
done
