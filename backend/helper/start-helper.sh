#!/usr/bin/env bash
# Lyra download helper for Mac and Linux.
# Mac: run it from Terminal with  bash start-helper.command  (drag the file into Terminal after "bash "),
# or allow it once in System Settings > Privacy & Security > Open Anyway, then double-click.
cd "$(dirname "$0")" || exit 1
echo "Starting the Lyra download helper..."

PY="$(command -v python3 || command -v python || true)"
if [ -z "$PY" ]; then
  echo "Python 3 is needed. Install it from https://www.python.org/downloads/ and open this file again."
  read -r -p "Press Enter to close." _
  exit 1
fi

if [ ! -x ".venv/bin/python" ]; then
  echo "First start: setting up (this takes a minute)..."
  "$PY" -m venv .venv || { echo "Could not create a Python environment."; read -r -p "Press Enter to close." _; exit 1; }
fi
# keep yt-dlp current: YouTube changes often
.venv/bin/python -m pip install --quiet --disable-pip-version-check --upgrade "yt-dlp[default]" \
  || echo "Could not update yt-dlp (no internet?). Trying with the installed version."

.venv/bin/python lyra_helper.py "$@"
status=$?
if [ $status -ne 0 ]; then read -r -p "Press Enter to close." _; fi
exit $status
