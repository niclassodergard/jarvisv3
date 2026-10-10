#!/usr/bin/env bash
# One-time, run ON the server with sudo:  sudo bash install-service.sh
# Installs the systemd unit and lets user nickus restart it without a password (used by deploy.sh).
set -euo pipefail
install -m 644 "$(dirname "$0")/jarvis.service" /etc/systemd/system/jarvis.service
echo 'nickus ALL=(root) NOPASSWD: /usr/bin/systemctl restart jarvis, /usr/bin/systemctl status jarvis' > /etc/sudoers.d/jarvis
chmod 440 /etc/sudoers.d/jarvis
visudo -cf /etc/sudoers.d/jarvis
systemctl daemon-reload
systemctl enable jarvis
echo "Installed. Start with: sudo systemctl start jarvis"
