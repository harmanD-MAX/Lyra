@echo off
rem Lyra download helper for Windows: double-click to start.
cd /d "%~dp0"
echo Starting the Lyra download helper...

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (where python >nul 2>nul && set "PY=python")
if not defined PY (
  echo Python 3 is needed. Install it from https://www.python.org/downloads/
  echo ^(tick "Add python.exe to PATH" in the installer^), then open this file again.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo First start: setting up ^(this takes a minute^)...
  %PY% -m venv .venv || (echo Could not create a Python environment. & pause & exit /b 1)
)
rem keep yt-dlp current: YouTube changes often
".venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check --upgrade "yt-dlp[default]" || echo Could not update yt-dlp, trying with the installed version.

".venv\Scripts\python.exe" lyra_helper.py %*
if errorlevel 1 pause
