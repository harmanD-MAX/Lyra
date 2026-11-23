#!/usr/bin/env bash
# run lyra on kaggle
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "Preparing Lyra Studio on Kaggle..."

if ! nvidia-smi >/dev/null 2>&1; then
  echo "⚠️  No GPU found. In the notebook sidebar set Accelerator to 'GPU T4 x2', then run again."
fi

# install dependencies
if ! command -v ffmpeg >/dev/null 2>&1; then
  apt-get -qq update && apt-get -qq install -y ffmpeg >/dev/null
fi
pip install -r backend/requirements.txt --quiet

# setup tunnel clients (defaults to cloudflare for instant, high-speed connection)
TUNNEL="${LYRA_TUNNEL:-cloudflare}"
SUBDOMAIN="${LYRA_SUBDOMAIN:-lyra-studio}"
CLOUDFLARED="$ROOT_DIR/.bin/cloudflared"

if ! command -v cloudflared >/dev/null 2>&1 && [ ! -x "$CLOUDFLARED" ]; then
  echo "📥 Downloading Cloudflare Tunnel (cloudflared)..."
  mkdir -p "$ROOT_DIR/.bin"
  curl -fsSL --retry 3 -o "$CLOUDFLARED" \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 2>/dev/null || true
  chmod +x "$CLOUDFLARED" 2>/dev/null || true
fi
if command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED="$(command -v cloudflared)"
fi

if [ "$TUNNEL" = "loca" ]; then
  if ! command -v lt >/dev/null 2>&1; then
    if ! command -v npm >/dev/null 2>&1; then
      apt-get -qq update && apt-get -qq install -y nodejs npm >/dev/null 2>&1 || true
    fi
    npm install -g localtunnel >/dev/null 2>&1 || true
  fi
  LT_FIX_TARGET="$(npm root -g 2>/dev/null || true)/localtunnel/lib/HeaderHostTransformer.js"
  if [ -f "$LT_FIX_TARGET" ]; then
    cp "$ROOT_DIR/tools/localtunnel-host-fix.js" "$LT_FIX_TARGET" 2>/dev/null || true
  fi
fi

# persistent storage directory
OUT_DIR="/kaggle/working/lyra-songs"
mkdir -p "$OUT_DIR/.internal_jobs"
export LYRA_OUTPUTS_DIR="$OUT_DIR/.internal_jobs"
export LYRA_JOBS_FILE="$OUT_DIR/jobs_db.json"

export PYTORCH_CUDA_ALLOC_CONF="expandable_segments:True"
export RVC_CUDA_GRAPH="0"

# start backend server
pkill -9 -f "uvicorn app:app" 2>/dev/null || true
pkill -9 -f "cloudflared tunnel" 2>/dev/null || true
pkill -9 -f "lt --port" 2>/dev/null || true
cd "$ROOT_DIR/backend"
rm -f /tmp/uvicorn.log /tmp/cloudflared.log /tmp/lt.log
python3 -m uvicorn app:app --host 127.0.0.1 --port 8000 > /tmp/uvicorn.log 2>&1 &
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

echo "⏳ Waiting for Lyra backend to initialize..."
READY=0
for i in {1..60}; do
  if curl -s http://127.0.0.1:8000/api/info >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
if [ "$READY" -eq 0 ]; then
  echo "❌ Backend did not respond on port 8000 within 60 seconds. Last log lines:"
  tail -n 30 /tmp/uvicorn.log 2>/dev/null || true
  exit 1
fi
echo "✅ Lyra backend is online."

# start tunnel
start_tunnel() {
  URL=""

  # 1. Custom domain with Cloudflare tunnel token if provided
  if [ -n "${CF_TUNNEL_TOKEN:-}" ] && [ -x "$CLOUDFLARED" ]; then
    echo "🌐 Starting Cloudflare with permanent domain token..."
    rm -f /tmp/cloudflared.log
    "$CLOUDFLARED" tunnel --no-autoupdate run --token "$CF_TUNNEL_TOKEN" > /tmp/cloudflared.log 2>&1 &
    TUNNEL_PID=$!
    URL="${CF_FIXED_DOMAIN:-https://${SUBDOMAIN}.yourdomain.com}"
  fi

  # 2. Localtunnel (only if explicitly requested via LYRA_TUNNEL=loca)
  if [ -z "$URL" ] && [ "$TUNNEL" = "loca" ]; then
    echo "🌐 Connecting Localtunnel (fixed: https://${SUBDOMAIN}.loca.lt)..."
    rm -f /tmp/lt.log
    lt --port 8000 --local-host 127.0.0.1 --subdomain "$SUBDOMAIN" > /tmp/lt.log 2>&1 &
    TUNNEL_PID=$!
    for i in {1..8}; do
      if [ -f /tmp/lt.log ]; then
        URL=$(grep -oE "https://[a-zA-Z0-9-]+\.loca\.lt" /tmp/lt.log 2>/dev/null | head -n 1 || true)
        [ -n "$URL" ] && break
      fi
      sleep 1
    done

    if [ -z "$URL" ]; then
      echo "⚠️ Localtunnel is currently slow or unreachable. Falling back to Cloudflare..."
      kill "$TUNNEL_PID" 2>/dev/null || true
      TUNNEL="cloudflare"
    fi
  fi

  # 3. Cloudflare Quick Tunnel (default, instant, 100% uptime)
  if [ -z "$URL" ] && [ -x "$CLOUDFLARED" ]; then
    echo "🌐 Starting Cloudflare tunnel..."
    rm -f /tmp/cloudflared.log
    "$CLOUDFLARED" tunnel --no-autoupdate --url http://127.0.0.1:8000 > /tmp/cloudflared.log 2>&1 &
    TUNNEL_PID=$!
    for i in {1..30}; do
      if [ -f /tmp/cloudflared.log ]; then
        URL=$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/cloudflared.log 2>/dev/null | head -n 1 || true)
        [ -n "$URL" ] && break
      fi
      sleep 1
    done
  fi

  if [ -n "$URL" ]; then
    echo ""
    echo "============================================================"
    echo " 🚀 LYRA STUDIO IS LIVE"
    echo " 👉 OPEN THIS LINK: $URL"
    if [[ "$URL" == *"loca.lt"* ]]; then
      TUNNEL_PASS=$(curl -s -m 2 https://loca.lt/mytunnelpassword 2>/dev/null || curl -s -m 2 https://ipv4.icanhazip.com 2>/dev/null || echo "")
      if [ -n "$TUNNEL_PASS" ]; then
        echo " 🔑 Password (if asked): $TUNNEL_PASS"
      fi
    fi
    echo " ⚠️  IMPORTANT: Keep this Kaggle cell running!"
    echo "    (If you stop or ^C this cell, the tunnel closes with Error 1033)."
    echo "============================================================"
    echo " Server log: tail -n 30 /tmp/uvicorn.log"
    echo ""
  else
    echo "============================================================"
    echo " ⏳ Acquiring tunnel URL, waiting in background..."
    echo "============================================================"
  fi
}
start_tunnel

# keep tunnel alive and display URL as soon as available
while kill -0 "$SERVER_PID" 2>/dev/null; do
  if [ -z "$URL" ]; then
    if [ -f /tmp/cloudflared.log ]; then
      URL=$(grep -oE "https://[a-zA-Z0-9-]+\.trycloudflare\.com" /tmp/cloudflared.log 2>/dev/null | head -n 1 || true)
    fi
    if [ -z "$URL" ] && [ -f /tmp/lt.log ]; then
      URL=$(grep -oE "https://[a-zA-Z0-9-]+\.loca\.lt" /tmp/lt.log 2>/dev/null | head -n 1 || true)
    fi
    if [ -n "$URL" ]; then
      echo ""
      echo "============================================================"
      echo " 🚀 LYRA STUDIO IS LIVE"
      echo " 👉 OPEN THIS LINK: $URL"
      echo " ⚠️  IMPORTANT: Keep this cell running while using Lyra!"
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
echo "❌ Backend stopped. Last log lines:"
tail -n 30 /tmp/uvicorn.log 2>/dev/null || true
