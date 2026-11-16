#!/bin/zsh
set -eu

cd "$(dirname "$0")/.."

if ! command -v python3 >/dev/null 2>&1; then
  echo "DayOrbit needs Python 3. Install it first, then run this file again."
  read -r "?Press Return to close."
  exit 1
fi

if ! curl -fsS http://127.0.0.1:8765/manifest.webmanifest 2>/dev/null | grep -Eq '"id"[[:space:]]*:[[:space:]]*"/workbench"'; then
  nohup python3 src/workbench-server.py >/tmp/dayorbit-server.log 2>&1 &
  sleep 1
fi

open http://127.0.0.1:8765/
