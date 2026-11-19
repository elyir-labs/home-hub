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
  imagemagick python3-minimal python3-qrcode zbar-tools iproute2 curl xdotool >/dev/null 2>&1
T=/usr/share/plymouth/themes/elyir; mkdir -p $T /etc/plymouth /fake/cable /fake/wifi
printf "[Daemon]\nTheme=elyir\n" > /etc/plymouth/plymouthd.conf; cp /startup/plymouth/elyir/* $T/
# The brain'"'"'s QR maker, stood in for by the same library; and a hub with no network, for the Wi-Fi code.
printf "#!/bin/sh\nshift 3; exec python3 \"\$@\"\n" > /fake/cable/docker; cp /fake/cable/docker /fake/wifi/
printf "#!/bin/sh\nexit 0\n" > /fake/wifi/ip
# A hub that gets a cable while Ready is up: no route until /tmp/online appears.
mkdir -p /fake/later; cp /fake/cable/docker /fake/later/
printf "#!/bin/sh\n[ -e /tmp/online ] && echo \"default via 10.0.0.1\"\nexit 0\n" > /fake/later/ip; chmod +x /fake/*/*
printf "HUB_SETUP_SSID=\"Elyir Hub 4F2A\"\nHUB_SETUP_PASS=\"kite-maple-41\"\n" > /tmp/conf
Xvfb :1 -screen 0 1440x900x24 >/dev/null 2>&1 & sleep 2; export DISPLAY=:1
shot() { xwd -root -display :1 | convert xwd:- "/out/$1.png"; echo "  $1.png"; }
start() { plymouthd --tty="$(tty)" --kernel-command-line="quiet splash plymouth.ignore-serial-consoles"; sleep 1; plymouth show-splash; }
start; sleep 2; shot 1-name; sleep 5; shot 2-house
for s in preparing moving unpacking setting downloading starting; do plymouth update --status=elyir:step:$s; sleep 1; shot "3-$s"; done
# A first start'"'"'s lamp, half a pulse apart: the two should differ plainly (first-2, C'"'"'s pulse).
sleep 2; shot 3-pulse-a; sleep 1.2; shot 3-pulse-b
plymouth quit; sleep 1
fail=0
for net in cable wifi; do
  start; sleep 7; touch /tmp/first
  PATH="/fake/$net:$PATH" HUB_CONF=/tmp/conf ELYIR_FIRST=/tmp/first ELYIR_READY_URL=file:///etc/hostname bash /startup/say.sh end & ended=$!
  sleep 4; shot "4-ready-$net"
  read=$(zbarimg -q --raw "/out/4-ready-$net.png" || true); echo "    reads: $read"
  case "$net:$read" in "cable:http://hub.local"|"wifi:WIFI:T:WPA;S:Elyir Hub 4F2A;P:kite-maple-41;;") ;; *) fail=1 ;; esac
  plymouth quit; wait $ended 2>/dev/null; sleep 1
done
# Ready follows the network: drawn on nothing with the Wi-Fi code, then a cable, and the address replaces it.
start; sleep 7; touch /tmp/first; rm -f /tmp/online
PATH="/fake/later:$PATH" HUB_CONF=/tmp/conf ELYIR_FIRST=/tmp/first ELYIR_READY_URL=file:///etc/hostname ELYIR_FOLLOW_EVERY=1 \
  bash /startup/say.sh end & follow=$!
sleep 3; shot 5-follow-before; touch /tmp/online; sleep 5; shot 5-follow-after
for f in before after; do read=$(zbarimg -q --raw "/out/5-follow-$f.png" || true); echo "    $f reads: $read"; eval "r_$f=\$read"; done
[ "$r_before" = "WIFI:T:WPA;S:Elyir Hub 4F2A;P:kite-maple-41;;" ] && [ "$r_after" = "http://hub.local" ] || fail=1
plymouth quit; wait $follow 2>/dev/null

# Asked at the keyboard on a start from the stick (design/move-to-drive/: screen-asks, keys-2, stick-try). Plymouth
# drops the arrows, so say.sh reads the keyboard itself (keys.py); here a fifo stands in for /dev/input, and key
# presses are written into it as the kernel would.
drive="{\"model\": \"Samsung SSD 980 512GB\", \"bytes\": 512110190592, \"system\": \"Ubuntu 24.04\", \"hub\": true, \"used\": 61000000000, \"last\": $(( $(date +%s) - 100000 ))}"
try="{\"present\": true, \"here\": true, \"made\": $(( $(date +%s) - 90000 )), \"last\": $(( $(date +%s) - 100000 ))}"
mkdir -p /tmp/input; rm -f /tmp/input/event0; mkfifo /tmp/input/event0; export HUB_INPUT_DIR=/tmp/input
key() {
  python3 -c "import struct, sys, time
codes = dict(up=103, down=108, tab=15, enter=28, back=14, wheel=-1, **{c: k for k, c in zip(range(16, 26), \"qwertyuiop\")},
             **{c: k for k, c in zip(range(30, 39), \"asdfghjkl\")}, **{c: k for k, c in zip(range(44, 51), \"zxcvbnm\")})
for k in sys.argv[1:]:
    c = codes[k]
    ev = struct.pack(\"llHHi\", 0, 0, 2, 8, -1) if c < 0 else struct.pack(\"llHHi\", 0, 0, 1, c, 1) + struct.pack(\"llHHi\", 0, 0, 1, c, 0)
    sys.stdout.buffer.write(ev); sys.stdout.flush(); time.sleep(0.3)" "$@" >&9
  sleep 1
}
ask() { bash /startup/say.sh ask "$@" > /tmp/answer & asking=$!; exec 9>/tmp/input/event0; sleep 2; }
answered() { wait $asking; exec 9>&-; echo "    answered: \"$(cat /tmp/answer)\" (want \"$1\")"; [ "$(cat /tmp/answer)" = "$1" ] || fail=1; }
start; sleep 7
ask drive TE "$drive"; sleep 4; shot 6-ask
key down; shot 6-highlight
key enter; shot 6-box
key e r a; shot 6-typing
key s e; shot 6-sure
key back; shot 6-back
key e enter; answered erase
bash /startup/say.sh step moving; sleep 1.5; shot 6-moving
plymouth quit; sleep 1
start; sleep 7
ask drive TE "$drive"; key wheel wheel enter; answered try
bash /startup/say.sh step trying; sleep 1.5; shot 6-trying
plymouth quit; sleep 1
start; sleep 7
ELYIR_ASK_FOR=3 ask drive TE "$drive"; answered ""
bash /startup/say.sh step unasked; sleep 1.5; shot 6-unasked
plymouth quit; sleep 1
start; sleep 7
ask here CDS "$drive" "$try"; sleep 4; shot 8-here
key s; shot 8-over
key back d; shot 8-here-erase
key back tab; shot 8-here-tab
key up up enter; answered carry
plymouth quit; sleep 1
start; sleep 7
ask away NB "" "$try"; sleep 3; shot 8-away
key n; answered new
bash /startup/say.sh step clearing; sleep 1.5; shot 8-clearing
plymouth quit; sleep 1
start; sleep 7
ask hub HTR "$drive"; sleep 4; shot 8-hub
key r; shot 8-hub-erase
key back up up enter; answered drive
bash /startup/say.sh step todrive; sleep 1.5; shot 8-todrive
plymouth quit; sleep 1

# Ready while the phone still has the question about the drive (B1), with the code for the Wi-Fi under it.
echo "{\"ask\": true}" > /tmp/drive.json
start; sleep 7; touch /tmp/first
PATH="/fake/wifi:$PATH" HUB_CONF=/tmp/conf ELYIR_FIRST=/tmp/first ELYIR_READY_URL=file:///etc/hostname ELYIR_DRIVE_URL=file:///tmp/drive.json \
  bash /startup/say.sh end & ended=$!
sleep 4; shot 7-ready-question
read=$(zbarimg -q --raw "/out/7-ready-question.png" || true); echo "    reads: $read"
[ "$read" = "WIFI:T:WPA;S:Elyir Hub 4F2A;P:kite-maple-41;;" ] || fail=1
plymouth quit; wait $ended 2>/dev/null
exit $fail'
echo "pictures in $OUT"
