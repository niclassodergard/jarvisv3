#!/usr/bin/env bash
# One-time server setup (no sudo): installs Node 24 LTS into ~/.local/node and creates app dirs.
# Usage: deploy/bootstrap-server.sh [ssh-host]   (default: ubuntu)
set -euo pipefail
HOST="${1:-ubuntu}"
ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
mkdir -p ~/jarvis/app ~/jarvis/data ~/.config/jarvis ~/.local
if [ ! -x ~/.local/node/bin/node ]; then
  tmp=$(mktemp -d)
  curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$tmp/SHASUMS256.txt"
  ver=$(grep -o 'node-v[0-9.]*-linux-x64.tar.xz' "$tmp/SHASUMS256.txt" | head -1)
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$ver" -o "$tmp/$ver"
  (cd "$tmp" && grep " $ver\$" SHASUMS256.txt | sha256sum -c -)
  mkdir -p ~/.local/node && tar -xJf "$tmp/$ver" -C ~/.local/node --strip-components=1
  rm -rf "$tmp"
fi
~/.local/node/bin/node -v
~/.local/node/bin/node -e 'require("node:sqlite"); console.log("node:sqlite ok")'
REMOTE
