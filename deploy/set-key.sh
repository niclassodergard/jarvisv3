#!/usr/bin/env bash
# Copies key.txt to the server's env file (mode 600) over ssh stdin, so it never appears in argv.
# Usage: deploy/set-key.sh [ssh-host]
set -euo pipefail
HOST="${1:-ubuntu}"
cd "$(dirname "$0")/.."
{ printf 'ANTHROPIC_API_KEY='; tr -d '\n' < key.txt; printf '\n'; } |
  ssh "$HOST" 'umask 077; cat > ~/.config/jarvis/jarvis.env; chmod 600 ~/.config/jarvis/jarvis.env'
echo "Key installed on $HOST"
