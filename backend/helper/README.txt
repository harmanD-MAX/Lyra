LYRA DOWNLOAD HELPER
====================

YouTube and Instagram block downloads from cloud servers like Google Colab.
This helper downloads on YOUR computer (home internet is not blocked) and
sends the song to your Lyra, which then converts it as usual.

START IT
  Windows: double-click  start-helper.bat
  Mac:     open Terminal, type  bash  and a space, drag start-helper.command
           into the Terminal window, press Enter.
           (Double-clicking shows "Apple could not verify..." because the file
           is not from the App Store. Either use Terminal as above, or click
           Done, go to System Settings > Privacy & Security, click
           "Open Anyway", then double-click it again.)
  Linux:   run           ./start-helper.sh

  The first start installs what it needs (about a minute). You need Python 3:
  https://www.python.org/downloads/  (Windows: tick "Add python.exe to PATH").
  For YouTube, also install Deno: https://deno.com  (one command on that page).

USE IT
  Keep the helper window open, then paste Spotify / YouTube / Instagram links
  into Lyra as usual. Lyra shows "Your computer is connected" and downloads go
  through this computer. Close the window to stop.

IF YOUR LYRA ADDRESS CHANGES (e.g. a new Colab session)
  Windows:  start-helper.bat --server https://NEW-ADDRESS
  Mac:      ./start-helper.command --server https://NEW-ADDRESS
  (or edit "server" in config.json)

KEEP config.json PRIVATE
  It contains the key that lets this helper talk to your Lyra. If you share
  it by mistake, use "Reset key" in Lyra and download the helper again.
