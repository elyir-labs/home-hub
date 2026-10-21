#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Tells the startup splash what a first start is doing (design/first-start/, A with B's quieter line, and Ready).
# Each step calls it as the step starts, so the line under the house is never a guess. With no splash up -- an
# update, a hub with no screen, an install by hand -- it does nothing, quietly.
#
#   say.sh step preparing|moving|downloading|starting
#   say.sh first      at the very start of a boot: marks it a first start, and says it is getting ready
#   say.sh end        once the hub answers: a first start ends on where to go next, any other start as it always has
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CONF="${HUB_CONF:-/etc/home-hub.conf}"
DONE="${HUB_FIRSTBOOT_DONE:-/var/lib/home-hub/firstboot.done}"
FIRST="${ELYIR_FIRST:-/run/elyir-first-start}"
READY_URL=${ELYIR_READY_URL:-http://localhost/alive}
CODE_DIR="${ELYIR_CODE_DIR:-/run/elyir}"    # where the splash looks for the code (CODE in startup/plymouth.mjs)

up() { command -v plymouth >/dev/null 2>&1 && plymouth --ping 2>/dev/null; }
tell() { plymouth update --status="$1" 2>/dev/null || true; }
# This hub's own words go a character at a time: Plymouth's scripts can read a string no other way.
spell() { local s="$2" i; tell "elyir:$1"; for ((i = 0; i < ${#s}; i++)); do tell "elyir:c:${s:i:1}"; done; }
conf() { sed -n "s/^$1=//p" "$CONF" 2>/dev/null | tail -1 | tr -d '"'; }
# A Wi-Fi code's own escaping: a backslash before any of \ ; , : "
wifi_escape() { printf '%s' "$1" | sed 's/[\\;,:"]/\\&/g'; }
# A code to scan (design/first-start/, E): the pattern from the brain's own QR maker, which the panel's codes come from
# too, written as a picture with nothing but Python's standard library, since the host has no image tools.
code() {
  local pattern
  pattern=$(docker exec brain python -c 'import sys, qrcode
q = qrcode.QRCode(border=0, error_correction=qrcode.constants.ERROR_CORRECT_M); q.add_data(sys.argv[1]); q.make(fit=True)
print("\n".join("".join("1" if v else "0" for v in row) for row in q.get_matrix()))' "$1" 2>/dev/null) || return 1
  [ -n "$pattern" ] && mkdir -p "$CODE_DIR" || return 1
  printf '%s\n' "$pattern" | python3 -c 'import struct, sys, zlib
rows, k = [r.strip() for r in sys.stdin if r.strip()], 12
light, dark = bytes((241, 238, 232)), bytes((12, 13, 16))
raw = b"".join(b"\0" + b"".join((dark if c == "1" else light) * k for c in r) for r in rows for _ in range(k))
chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
size = struct.pack(">IIBBBBB", len(rows[0]) * k, len(rows) * k, 8, 2, 0, 0, 0)
open(sys.argv[1], "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", size) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))' "$CODE_DIR/code.png" || return 1
  tell "elyir:code"
}

case "${1:-}" in
  step)
    case "${2:-}" in preparing|moving|downloading|starting) ;; *) echo "say.sh: no step called ${2:-}" >&2; exit 2 ;; esac
    up && tell "elyir:step:$2" ;;
  first)
    [ -e "$DONE" ] && exit 0
    mkdir -p "$(dirname "$FIRST")" && : > "$FIRST"
    up && tell "elyir:step:preparing" ;;
  end)
    [ -e "$FIRST" ] || exec "$HERE/wall.sh" wait
    until curl -fsS -m 2 -o /dev/null "$READY_URL"; do sleep 1; done
    up || exit 0
    tell "elyir:step:starting"
    # On a network, its address; on nothing, the Wi-Fi it makes of its own, which a flashed NUC has no label for.
    # Without a code it is the same words, under the house.
    if ip -4 route show default 2>/dev/null | grep -q . || [ -z "$(conf HUB_SETUP_SSID)" ]; then
      name="$(hostname 2>/dev/null || echo hub).local"
      spell addr "$name"
      code "http://$name" || true
    else
      ssid="$(conf HUB_SETUP_SSID)" pass="$(conf HUB_SETUP_PASS)"
      spell wifi "$ssid"
      spell pass "$pass"
      code "WIFI:T:WPA;S:$(wifi_escape "$ssid");P:$(wifi_escape "$pass");;" || true
    fi
    tell "elyir:hello" ;;
  *) echo "usage: $0 step <name> | first | end" >&2; exit 2 ;;
esac
exit 0
