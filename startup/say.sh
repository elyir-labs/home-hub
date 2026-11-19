#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Tells the startup splash what a first start is doing (design/first-start/: A with B's quieter line, and Ready;
# round 2, A with C's pulse).
# Each step calls it as the step starts, so the line under the house is never a guess. With no splash up -- an
# update, a hub with no screen, an install by hand -- it does nothing, quietly.
#
#   say.sh step preparing|moving|unpacking|setting|downloading|starting|keeping|unasked
#   say.sh first      at the very start of a boot: marks it a first start, and says it is getting ready
#   say.sh end        once the hub answers: a first start ends on where to go next, any other start as it always has
#   say.sh ask-drive <drive.sh describe's JSON>
#                     asks on the screen what to do with the drive (design/move-to-drive/, screen-asks) and prints
#                     erase, keep, or nothing when nobody answered in time; exits 3 with no splash to ask on
set -uo pipefail
# Letters, not bytes: spelling a · or a ’ a byte at a time sends the splash halves it has no picture for. Early in a
# boot nothing has set a locale yet.
export LC_ALL=C.UTF-8
HERE=$(cd "$(dirname "$0")" && pwd)
CONF="${HUB_CONF:-/etc/home-hub.conf}"
DONE="${HUB_FIRSTBOOT_DONE:-/var/lib/home-hub/firstboot.done}"
FIRST="${ELYIR_FIRST:-/run/elyir-first-start}"
READY_URL=${ELYIR_READY_URL:-http://localhost/alive}
DRIVE_URL=${ELYIR_DRIVE_URL:-${READY_URL%/alive}/drive}
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

# The name phones find this hub by: avahi's, which is hub-2.local when another hub already answers to hub.local.
mdns_name() {
  local n
  n="$(busctl --system call org.freedesktop.Avahi / org.freedesktop.Avahi.Server GetHostNameFqdn 2>/dev/null \
    | sed -n 's/^s "\(.*\)"$/\1/p')"
  printf '%s' "${n:-$(hostname 2>/dev/null || echo hub).local}"
}
# Whether the phone still has the drive's question to ask (B1), from the brain, which knows whether it was answered.
drive_waiting() {
  curl -fsS -m 2 "$DRIVE_URL" 2>/dev/null | python3 -c 'import json,sys; print(1 if json.load(sys.stdin).get("ask") else 0)' 2>/dev/null \
    || echo 0
}
# On a network, its address; on nothing, the Wi-Fi it makes of its own, which a flashed NUC has no label for. Fields are
# split by a unit separator, which no address, Wi-Fi name or password has.
US=$'\x1f'
where_now() {
  if ip -4 route show default 2>/dev/null | grep -q . || [ -z "$(conf HUB_SETUP_SSID)" ]; then
    printf 'addr%s%s%s%s%s' "$US" "$(mdns_name)" "$US" "$US" "$(drive_waiting)"
  else
    printf 'wifi%s%s%s%s%s%s' "$US" "$(conf HUB_SETUP_SSID)" "$US" "$(conf HUB_SETUP_PASS)" "$US" "$(drive_waiting)"
  fi
}
# Without a code it is the same words, under the house.
draw() {
  local kind a b q
  IFS="$US" read -r kind a b q <<< "$1"
  [ "$q" = 1 ] && tell "elyir:drive:phone" || tell "elyir:drive:none"
  if [ "$kind" = addr ]; then
    spell addr "$a"
    code "http://$a" || tell "elyir:nocode"
  else
    spell wifi "$a"
    spell pass "$b"
    code "WIFI:T:WPA;S:$(wifi_escape "$a");P:$(wifi_escape "$b");;" || tell "elyir:nocode"
  fi
}

# The drive in the words the card and the warning use (design/move-to-drive/, KeysA-1 and KeysA-2): its name and size,
# what is on it, how much and since when, and what erasing it loses. Sizes and ages as the phone's drive.ts says them.
drive_words() {
  python3 -c 'import json, sys, time
d = json.loads(sys.argv[1])
def size(b): return (f"{b / 1e12:.1f}".rstrip("0").rstrip(".") + " TB") if b >= 1e12 else f"{round(b / 1e9)} GB"
import re
model = re.sub(r"\s*\d+(\.\d+)?\s*[GT]B$", "", (d.get("model") or "").strip(), flags=re.I).strip() or "A drive"
system, hub, used, last = d.get("system"), d.get("hub"), d.get("used"), d.get("last")
rest = ""
if used: rest += " · " + size(used)
if last:
    days = int((time.time() - last) // 86400)
    when = "used today" if days < 1 else "used yesterday" if days < 2 else f"used {days} days ago" if days < 30 \
        else "used in " + time.strftime("%B" if time.localtime(last).tm_year == time.localtime().tm_year else "%B %Y", time.localtime(last))
    rest += " · " + when
files = f"{size(used)} of files" if used else ""
if system and hub: lost = f"{system}, the hub on it with its house, and {files}" if files else f"{system} and the hub on it with its house"
elif system and files: lost = f"{system} and {files}"
else: lost = system or files or "everything on it"
print(f"{model} · {size(d.get("bytes") or 0)}")
print((system or "Something the hub can\u2019t read") + (", with a hub on it" if hub else ""))
print(rest)
print(f"This erases {lost}.")' "$1"
}

case "${1:-}" in
  step)
    case "${2:-}" in preparing|moving|unpacking|setting|downloading|starting|keeping|unasked) ;; *) echo "say.sh: no step called ${2:-}" >&2; exit 2 ;; esac
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
    # Ready follows the network for as long as it is on screen: a cable plugged in after it was drawn turns the
    # Wi-Fi's code into the address, and a name avahi changed (another hub already has hub.local) is redrawn.
    shown=""
    while up; do
      now="$(where_now)"
      if [ "$now" != "$shown" ]; then
        [ -n "$shown" ] && tell "elyir:clear"
        draw "$now"
        [ -n "$shown" ] || tell "elyir:hello"
        shown="$now"
      fi
      sleep "${ELYIR_FOLLOW_EVERY:-5}"
    done ;;
  ask-drive)
    up || exit 3
    words="$(drive_words "${2:-}")" || exit 3
    { IFS= read -r model; IFS= read -r sys; IFS= read -r rest; IFS= read -r warn; } <<< "$words"
    spell dmodel "$model"; spell dsys "$sys"; spell drest "$rest"; spell dwarn "$warn"
    tell "elyir:drive:ask"
    end=$(( $(date +%s) + ${ELYIR_ASK_FOR:-120} )); answer=""
    while :; do
      left=$(( end - $(date +%s) )); [ "$left" -gt 0 ] || break
      got="$(timeout "$left" plymouth ask-question --prompt=elyir-drive 2>/dev/null)" || break
      case "${got,,}" in
        "") answer=keep; break ;;
        erase) answer=erase; break ;;
        *) tell "elyir:drive:again" ;;
      esac
    done
    tell "elyir:drive:done"
    echo "$answer" ;;
  *) echo "usage: $0 step <name> | first | end | ask-drive <drive>" >&2; exit 2 ;;
esac
exit 0
