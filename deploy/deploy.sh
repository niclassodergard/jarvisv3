#!/usr/bin/env bash
# Builds locally, syncs to the server, installs prod deps and restarts the service.
# Usage: deploy/deploy.sh [ssh-host]
set -euo pipefail
HOST="${1:-ubuntu}"
cd "$(dirname "$0")/.."

npm run typecheck
npm test
npm run build

REMOTE=jarvis/app
ssh "$HOST" "mkdir -p $REMOTE"
rsync -az --delete --relative \
  package.json package-lock.json \
  server/package.json server/dist server/prompts \
  web/package.json web/dist deploy \
  "$HOST:$REMOTE/"
ssh "$HOST" "cd $REMOTE && PATH=\$HOME/.local/node/bin:\$PATH npm ci --omit=dev -w server --ignore-scripts"
ssh "$HOST" "sudo systemctl restart jarvis"

sleep 2
ssh "$HOST" "curl -fsS http://100.115.122.103:8080/api/health" && echo " <- deployed"
