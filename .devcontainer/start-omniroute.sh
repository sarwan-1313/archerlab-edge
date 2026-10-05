#!/bin/sh
set -eu

PORT=20128
STATE_DIR="$HOME/.omniroute"
LOG_FILE="$STATE_DIR/server.log"

if [ ! -d "$STATE_DIR" ]; then
  printf '%s\n' "OmniRoute state directory is missing: $STATE_DIR" >&2
  exit 0
fi

if curl --silent --show-error --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 ||
  curl --silent --show-error --max-time 2 "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1; then
  exit 0
fi

if ! command -v omniroute >/dev/null 2>&1; then
  printf '%s\n' "OmniRoute CLI is not installed; run .devcontainer/bootstrap-ai-tools.sh first." >&2
  exit 1
fi

setsid omniroute serve >>"$LOG_FILE" 2>&1 </dev/null &

i=0
while [ "$i" -lt 30 ]; do
  if curl --silent --show-error --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 ||
    curl --silent --show-error --max-time 2 "http://127.0.0.1:$PORT/v1/models" >/dev/null 2>&1; then
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done

printf '%s\n' "OmniRoute did not become reachable on port $PORT; see $LOG_FILE." >&2
exit 1
