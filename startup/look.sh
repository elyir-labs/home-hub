#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Runs the splash in real Plymouth -- Ubuntu 24.04's, in Docker, drawing to a virtual screen -- through every moment
# that matters, saves what it drew, and reads the Ready codes back off the screen. A splash script that Plymouth
# reads differently from how it looks fails silently on a unit, as an empty screen; this is the instrument that sees
# it (three such bugs were found this way, none by reading the script).
#
#   startup/look.sh [out-dir]        pictures land in out-dir (default: a fresh temporary directory)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="${1:-$(mktemp -d)}"; mkdir -p "$OUT"
docker run --rm -t --hostname hub -v "$HERE:/startup:ro" -v "$OUT:/out" ubuntu:24.04 bash -c '
set -u
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null && apt-get install -y -qq --no-install-recommends plymouth plymouth-x11 xvfb x11-apps \
  imagemagick python3-minimal python3-qrcode zbar-tools iproute2 curl >/dev/null 2>&1
T=/usr/share/plymouth/themes/elyir; mkdir -p $T /etc/plymouth /fake/cable /fake/wifi
printf "[Daemon]\nTheme=elyir\n" > /etc/plymouth/plymouthd.conf; cp /startup/plymouth/elyir/* $T/
# The brain'"'"'s QR maker, stood in for by the same library; and a hub with no network, for the Wi-Fi code.
printf "#!/bin/sh\nshift 3; exec python3 \"\$@\"\n" > /fake/cable/docker; cp /fake/cable/docker /fake/wifi/
printf "#!/bin/sh\nexit 0\n" > /fake/wifi/ip; chmod +x /fake/*/*
printf "HUB_SETUP_SSID=\"Elyir Hub 4F2A\"\nHUB_SETUP_PASS=\"kite-maple-41\"\n" > /tmp/conf
Xvfb :1 -screen 0 1440x900x24 >/dev/null 2>&1 & sleep 2; export DISPLAY=:1
shot() { xwd -root -display :1 | convert xwd:- "/out/$1.png"; echo "  $1.png"; }
start() { plymouthd --tty="$(tty)" --kernel-command-line="quiet splash plymouth.ignore-serial-consoles"; sleep 1; plymouth show-splash; }
start; sleep 2; shot 1-name; sleep 5; shot 2-house
for s in preparing moving downloading starting; do plymouth update --status=elyir:step:$s; sleep 1; shot "3-$s"; done
plymouth quit; sleep 1
fail=0
for net in cable wifi; do
  start; sleep 7; touch /tmp/first
  PATH="/fake/$net:$PATH" HUB_CONF=/tmp/conf ELYIR_FIRST=/tmp/first ELYIR_READY_URL=file:///etc/hostname bash /startup/say.sh end
  sleep 2; shot "4-ready-$net"
  read=$(zbarimg -q --raw "/out/4-ready-$net.png" || true); echo "    reads: $read"
  case "$net:$read" in "cable:http://hub.local"|"wifi:WIFI:T:WPA;S:Elyir Hub 4F2A;P:kite-maple-41;;") ;; *) fail=1 ;; esac
  plymouth quit; sleep 1
done
exit $fail'
echo "pictures in $OUT"
