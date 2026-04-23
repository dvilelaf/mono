#!/usr/bin/env bash
# Expose PDS API over HTTPS to the tailnet (not the public internet).
# Uses tailscale serve (tailnet-only); NOT tailscale funnel (public).
# Idempotent; persists across reboots.
set -euo pipefail

tailscale serve --bg --https=443 http://localhost:3000
echo
echo "HTTPS endpoint active on the tailnet."
echo "Check status: tailscale serve status"
echo "Stop:         tailscale serve reset"
