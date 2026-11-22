#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Sets this computer's clock to the house's time zone.
#
# The house's zone is chosen at setup, from its place, and goes to the home engine; the computer kept the zone its
# image was made in. A screen on the hub draws the time in the computer's zone, so the living room TV read UTC
# (22 November 2026). The brain writes brain-data/zone.request whenever it learns the zone; home-hub-zone.path
# starts this. Only a zone this computer has a file for is set. Safe to run by hand.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
DATA="$DIR/driver-layer/brain-data"
REQ="$DATA/zone.request"; ENVF="$DIR/driver-layer/.env"
ZONES="${HUB_ZONEINFO:-/usr/share/zoneinfo}"
log() { printf '[zone] %s\n' "$*"; }

[ -f "$REQ" ] || exit 0
zone="$(sed -n 's/.*"zone": *"\([^"]*\)".*/\1/p' "$REQ" | head -1)"; rm -f "$REQ"
if ! [[ "$zone" =~ ^[A-Za-z]+(/[A-Za-z0-9_+-]+){0,2}$ ]] || [ ! -f "$ZONES/$zone" ]; then
  log "not a time zone this computer knows: ${zone:-<nothing>}; nothing changed"; exit 0
fi
if [ "$(timedatectl show -p Timezone --value 2>/dev/null)" != "$zone" ]; then
  timedatectl set-timezone "$zone" && log "this computer's clock reads $zone now, as the house's does"
fi
# The containers read it from .env when they next start.
if [ -f "$ENVF" ] && ! grep -qx "TZ=$zone" "$ENVF"; then
  { grep -v '^TZ=' "$ENVF"; echo "TZ=$zone"; } > "$ENVF.new" && cat "$ENVF.new" > "$ENVF"; rm -f "$ENVF.new"
fi
exit 0
