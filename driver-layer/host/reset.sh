#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Starts the hub over: Start over on The hub (design/leaving/, B). home-hub-reset.path starts this when
# brain-data/reset.request appears. It stops the house, erases everything that is this house -- the brain's
# data, the engine's settings, the radios' networks and keys, the services it signed into, the front door's
# certificates, the web address's settings, and the SSH keys This hub was given -- puts each part back the way
# a fresh install leaves it, and starts the house again, which then opens on Welcome.
#
# What belongs to the unit rather than the house stays: what it updates from and the key it checks updates
# with, its name and address on the network, and its own Wi-Fi with the label's password. The house's Wi-Fi
# password goes: a hub on a cable stays online, and one on Wi-Fi comes back on its own, for the label's code.
# Every secret the house had is made again, so nothing that knew the old one gets in.
#
# Moving out, on People, asks for "people" instead: the brain has already signed the house out of its people's
# services and erased their phones, passcode and history (hub/handover.py), and this does only what the brain cannot
# reach -- Ring's sign-in, the pairings with Apple Home or Google Home, the assistant's key and the web address's lines
# in .env, the Wi-Fi password and the SSH keys -- and starts the house again, everything else of it as it was.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
DL="$DIR/driver-layer"; DATA="$DL/brain-data"
REQ="$DATA/reset.request"
KEYS_DIR="${HUB_KEYS_DIR:-/etc/home-hub/ssh}"
[ -f "$REQ" ] || exit 0
WHAT=everything; grep -q '"what": *"people"' "$REQ" && WHAT=people
rm -f "$REQ"
STARTED="$(date +%s)"
# brain-data is one of the things erased, so the log is kept aside and put back with the outcome.
LOG="$(mktemp)"
# Each part of the driver layer that holds the house. A tracked file in one of them (zigbee2mqtt's
# configuration.yaml, the broker's mosquitto.conf) is what install left there, and comes back as it was.
PARTS="brain-data homeassistant zigbee2mqtt zwave-js-ui ring-mqtt matter-server matter-bridge-data music-data
       caddy/data caddy/away lan-cert/data mosquitto/config mosquitto/data mosquitto/log frp"
# The lines of .env that describe this unit. Anything else is the house's, or a secret, and goes.
KEEP='^(TZ|HUB_HOST|HUB_IP|HUB_CHANNEL|HUB_VERIFIED|HUB_BRAIN_IMAGE|HUB_BRIDGE_IMAGE|HUB_IMG_[A-Z0-9_]+|HOST_[A-Z_]+|HUB_EXTRAS_CPUS|COMPOSE_PROFILES|ZIGBEE_SERIAL|ZIGBEE_PORT|ZWAVE_SERIAL)='

said() { mkdir -p "$DATA"; cp "$LOG" "$DATA/reset.log"; rm -f "$LOG"
         printf '{"state":"%s","started":%s,"finished":%s}\n' "$1" "$STARTED" "$(date +%s)" > "$DATA/reset.json"; }

erase() {
  local part="$DL/$1"
  [ -e "$part" ] || return 0
  # The checkout is what says which files install left; without it there is no telling them from the house's.
  git -C "$DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "$DIR is not a checkout"; return 1; }
  git -C "$DIR" clean -qffdx -- "driver-layer/$1" || return 1
  git -C "$DIR" checkout -q HEAD -- "driver-layer/$1" 2>/dev/null || true
  mkdir -p "$part"
}

# The people's parts the brain cannot reach, and the lines of .env that were theirs.
PEOPLES="ring-mqtt matter-bridge-data"
THEIRS='^(ANTHROPIC_API_KEY|HUB_AWAY_[A-Z_]+|HUB_RELAY_[A-Z_]+)='

(
  cd "$DL" || exit 1
  echo "--- $(date -Is) starting over: $WHAT"
  docker compose stop
  if [ "$WHAT" = people ]; then
    for p in $PEOPLES; do erase "$p" || exit 1; echo "erased $p"; done
    grep -Ev "$THEIRS" .env > .env.new; mv .env.new .env
    echo "took the assistant's key and the web address out of .env"
  else
    for p in $PARTS; do erase "$p" || exit 1; echo "erased $p"; done
    grep -E "$KEEP" .env > .env.kept 2>/dev/null || true
    {
      cat .env.kept
      echo "ZWAVE_SESSION_SECRET=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' )"
      echo "HUB_SHARE_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -d '/+=' )"
    } > .env.new && mv .env.new .env && rm -f .env.kept
    echo "kept $(grep -c . .env) lines of .env, every secret made again"
  fi
  chmod 600 .env
  if command -v nmcli >/dev/null 2>&1; then
    nmcli -t -f UUID,TYPE connection show 2>/dev/null | awk -F: '$2 == "802-11-wireless" {print $1}' | while read -r id; do
      [ "$(nmcli -g connection.id connection show "$id" 2>/dev/null)" = home-hub-setup ] && continue
      nmcli connection delete "$id" >/dev/null 2>&1 && echo "forgot a Wi-Fi network"
    done
  fi
  for f in "$KEYS_DIR"/*.keys; do [ -f "$f" ] && : > "$f" && echo "emptied $(basename "$f")"; done
  chmod +x mqtt-auth.sh host-tier.sh && ./mqtt-auth.sh && ./host-tier.sh
  docker compose up -d
  # With nothing saved left, network.sh raises the hub's own Wi-Fi now rather than on the next minute.
  if [ -x host/network.sh ]; then host/network.sh; fi
) > "$LOG" 2>&1 || { said failed; exit 1; }
said done
