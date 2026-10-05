#!/bin/sh
set -eu

OMNIROUTE_VERSION=3.8.51

mkdir -p "$HOME/.omniroute" "$HOME/.continue" "$HOME/.codex"
chmod 700 "$HOME/.omniroute" "$HOME/.continue" "$HOME/.codex"

if ! command -v omniroute >/dev/null 2>&1; then
  npm install --global "omniroute@$OMNIROUTE_VERSION"
fi

if ! command -v codex >/dev/null 2>&1; then
  npm install --global @openai/codex
fi

if ! omniroute --version | grep -qx "$OMNIROUTE_VERSION"; then
  printf '%s\n' "OmniRoute $OMNIROUTE_VERSION is required; an incompatible version is installed." >&2
  exit 1
fi
