#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Tells the startup splash what a first start is doing (design/first-start/: A with B's quieter line, and Ready;
# round 2, A with C's pulse).
# Each step calls it as the step starts, so the line under the house is never a guess. With no splash up -- an
# update, a hub with no screen, an install by hand -- it does nothing, quietly.
#
#   say.sh step preparing|moving|unpacking|setting|downloading|starting|trying|unasked|clearing|todrive
#   say.sh first      at the very start of a boot: marks it a first start, and says it is getting ready
#   say.sh end        once the hub answers: a first start ends on where to go next, any other start as it always has
#   say.sh ask <kind> <letters> [<drive.sh describe JSON>] [<try.sh status JSON>]
#                     asks a question on the screen (design/move-to-drive/: keys-2 and stick-try) with the answers
#                     <letters> names, in that order, and prints what was picked, or nothing when nobody answered:
#                       drive (T E)    try | erase           the drive isn't empty
#                       here (C D S)   carry | move | over   a try made on this computer
#                       away (N B)     new | bring           a try from another computer
#                       hub (H T R)    drive | try | erase   a hub already on the drive
#                       failed (A C)   again | carry         a move onto the drive that stopped partway
#                     exits 3 with no splash to ask on
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

MOVED="${HUB_MOVED:-/var/lib/home-hub/moved}"
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
# On a network, its address; on nothing, the Wi-Fi it makes of its own, which a flashed NUC has no label for. On a
# cable into the modem (design/modem-cable/, C) the address is no use to a phone in the house, so it is both: that
# Wi-Fi, and where the cable should go; or, on a hub with no Wi-Fi card, where the cable should go alone. Fields are
# split by a unit separator, which no address, Wi-Fi name or password has.
US=$'\x1f'
modem() { "$HERE/../driver-layer/host/public.sh" links 2>/dev/null; }
at_home() {
  ip -4 route show default 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "dev") print $(i + 1)}' | grep -vx hubsetup0 \
    | grep -vxFf <(printf '%s\n' "$(modem)") | grep -q .
}
radio() { ls -d "${HUB_NET:-/sys/class/net}"/*/phy80211 >/dev/null 2>&1; }
where_now() {
  local ssid on_modem; ssid="$(conf HUB_SETUP_SSID)"; on_modem="$(modem)"
  if at_home || { [ -z "$ssid" ] && [ -z "$on_modem" ]; }; then
    printf 'addr%s%s%s%s%s' "$US" "$(mdns_name)" "$US" "$US" "$(drive_waiting)"
  elif [ -n "$ssid" ] && { [ -z "$on_modem" ] || radio; }; then
    printf '%s%s%s%s%s%s%s' "$([ -n "$on_modem" ] && echo modem || echo wifi)" "$US" "$ssid" "$US" "$(conf HUB_SETUP_PASS)" "$US" "$(drive_waiting)"
  else
    printf 'alone%s%s%s%s' "$US" "$US" "$US" "$(drive_waiting)"
  fi
}
# Without a code it is the same words, under the house.
draw() {
  local kind a b q
  IFS="$US" read -r kind a b q <<< "$1"
  [ "$q" = 1 ] && tell "elyir:drive:phone" || tell "elyir:drive:none"
  case "$kind" in modem|alone) tell "elyir:modem" ;; *) tell "elyir:nomodem" ;; esac
  if [ "$kind" = addr ]; then
    spell addr "$a"
    code "http://$a" || tell "elyir:nocode"
  elif [ "$kind" = alone ]; then
    tell "elyir:nocode"
  else
    spell wifi "$a"
    spell pass "$b"
    code "WIFI:T:WPA;S:$(wifi_escape "$a");P:$(wifi_escape "$b");;" || tell "elyir:nocode"
  fi
}

# The first start of a hub a stick just moved onto this drive, while the stick is still in (design/move-to-drive/,
# after-move: C): our stick is a USB disk whose system keeps the label it was flashed with; the drive's is hub-root.
stick_plugged() {
  local d
  for d in $(lsblk -dnro NAME,TRAN 2>/dev/null | awk '$2 == "usb" {print $1}'); do
    lsblk -nro LABEL "/dev/$d" 2>/dev/null | grep -qx cloudimg-rootfs && return 0
  done
  return 1
}
stick_said=""
follow_stick() {
  [ -e "$MOVED" ] || return 0
  local now=out; stick_plugged && now=in
  [ "$now" = "$stick_said" ] || { tell "elyir:stick:$now"; stick_said="$now"; }
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
if sys.argv[2:] == ["hub"]:
    print("A hub on this computer\u2019s drive")
    print(f"{model} · {size(d.get("bytes") or 0)}")
elif sys.argv[2:] == ["failed"]:
    print(f"{model} · {size(d.get("bytes") or 0)}")
    print("Partly written")
    rest = " · it won\u2019t start by itself"
else:
    print(f"{model} · {size(d.get("bytes") or 0)}")
    print((system or "Something the hub can\u2019t read") + (", with a hub on it" if hub else ""))
print(rest)
print(f"This erases {lost}.")' "$@"
}
# A try's card (design/move-to-drive/, stick-try): when it was set up and last used, from try.sh status.
try_words() {
  python3 -c 'import json, sys, time
t = json.loads(sys.argv[2] or "{}")
def day(e): return time.strftime("%-d %B" if time.localtime(e).tm_year == time.localtime().tm_year else "%-d %B %Y", time.localtime(e))
def ago(e):
    days = int((time.time() - e) // 86400)
    return "today" if days < 1 else "yesterday" if days < 2 else f"{days} days ago" if days < 30 else "in " + day(e)
made, last = t.get("made"), t.get("last")
if sys.argv[1] == "here":
    print(f"Your try, set up {day(made)}" if made else "Your try")
    print(f"Last used {ago(last)}" if last else "Kept on the USB stick")
    print(" · kept on the USB stick" if last else "")
else:
    print("A try from another computer")
    print(f"Set up {day(made)}" if made else "Kept on the USB stick")
    print(f" · last used {ago(last)}" if last else "")' "$1" "$2"
}

case "${1:-}" in
  step)
    case "${2:-}" in preparing|moving|unpacking|setting|downloading|starting|trying|unasked|clearing|todrive) ;; *) echo "say.sh: no step called ${2:-}" >&2; exit 2 ;; esac
    up && tell "elyir:step:$2" ;;
  first)
    [ -e "$DONE" ] && exit 0
    mkdir -p "$(dirname "$FIRST")" && : > "$FIRST"
    up && tell "elyir:step:preparing" ;;
  end)
    [ -e "$FIRST" ] || exec "$HERE/wall.sh" wait
    until curl -fs -m 2 -o /dev/null "$READY_URL"; do follow_stick; sleep 1; done
    up || exit 0
    tell "elyir:step:starting"
    # Ready follows the network for as long as it is on screen: a cable plugged in after it was drawn turns the
    # Wi-Fi's code into the address, and a name avahi changed (another hub already has hub.local) is redrawn.
    shown=""
    while up; do
      follow_stick
      now="$(where_now)"
      if [ "$now" != "$shown" ]; then
        [ -n "$shown" ] && tell "elyir:clear"
        draw "$now"
        [ -n "$shown" ] || tell "elyir:hello"
        shown="$now"
      fi
      sleep "${ELYIR_FOLLOW_EVERY:-5}"
    done ;;
  ask)
    up || exit 3
    kind="${2:-}"; letters="${3:-}"; drive="${4:-}"; try="${5:-}"
    case "$kind" in drive) safe=T; wait=120 ;; here) safe=C; wait=30 ;; away) safe=B; wait=120 ;; hub) safe=H; wait=120 ;; failed) safe=A; wait=120 ;;
      *) echo "say.sh: no question called $kind" >&2; exit 2 ;; esac
    [ -n "$letters" ] || exit 2
    wait="${ELYIR_ASK_FOR:-$wait}"
    coproc KEYS { exec python3 "$HERE/keys.py"; }
    # The card's words: the drive's own (drive), the hub found on it (hub), or the try's (here, away). The erase page's
    # card is always the drive, spelled into fields of its own once the question is up, so turning to it is instant.
    card() {
      local m s r w
      case "$1" in
        here|away) { IFS= read -r m; IFS= read -r s; IFS= read -r r; } <<< "$(try_words "$1" "$try")" ;;
        *) { IFS= read -r m; IFS= read -r s; IFS= read -r r; } <<< "$(drive_words "$drive" "$1")" ;;
      esac
      spell dmodel "$m"; spell dsys "$s"; spell drest "$r"
      [ -n "$drive" ] || return 0
      { IFS= read -r m; IFS= read -r s; IFS= read -r r; IFS= read -r w; } <<< "$(drive_words "$drive" drive)"
      erase_card=("$m" "$s" "$r" "$w")
    }
    at() { local p="${letters%%"$1"*}"; [ "$p" = "$letters" ] && echo -1 || echo "${#p}"; }
    typed=""; page=choose; answer=""; erase_card=()
    pick=$(at "$safe"); [ "$pick" -ge 0 ] || pick=0
    n=${#letters}
    card "$kind"
    tell "elyir:ask:$kind"
    for ((i = 0; i < n; i++)); do tell "elyir:opt:$kind:${letters:i:1}"; done
    tell "elyir:pick:$pick"
    if [ -n "$drive" ]; then
      spell emodel "${erase_card[0]}"; spell esys "${erase_card[1]}"; spell erest "${erase_card[2]}"; spell dwarn "${erase_card[3]}"
    fi
    to_page() { page="$1"; tell "elyir:page:$1"; }
    # What a letter does here: an answer, or the box for erase, or starting over said plainly.
    act() {
      case "$kind:$1" in
        drive:T|hub:T) answer=try ;;
        drive:E|hub:R) typed=""; tell "elyir:dtyped"; to_page erase ;;
        here:C) answer=carry ;;
        here:D) if [ "$(python3 -c 'import json,sys; print(1 if json.loads(sys.argv[1] or "{}").get("empty") else 0)' "$drive" 2>/dev/null)" = 1 ]
                then answer=move; else typed=""; tell "elyir:dtyped"; to_page erase; fi ;;
        here:S) to_page over ;;
        away:N) answer=new ;;
        away:B) answer=bring ;;
        hub:H) answer=drive ;;
        failed:A) answer=again ;;
        failed:C) answer=carry ;;
      esac
    }
    back() { to_page choose; }
    end=$(( $(date +%s) + wait ))
    while [ -z "$answer" ]; do
      left=$(( end - $(date +%s) )); [ "$left" -gt 0 ] || break
      IFS= read -r -t "$left" -u "${KEYS[0]}" key || { [ $? -gt 128 ] && break; sleep 1; continue; }
      end=$(( $(date +%s) + wait ))
      case "$page:$key" in
        choose:up) pick=$(( (pick + n - 1) % n )); tell "elyir:pick:$pick" ;;
        choose:down|choose:tab) pick=$(( (pick + 1) % n )); tell "elyir:pick:$pick" ;;
        choose:enter) act "${letters:pick:1}" ;;
        choose:?) L="${key^^}"
                  case "$letters" in *"$L"*) pick=$(at "$L"); tell "elyir:pick:$pick"; act "$L" ;; esac ;;
        erase:?) [ "${#typed}" -lt 12 ] && { typed="$typed$key"; spell dtyped "$typed"; } ;;
        erase:back) if [ -z "$typed" ]; then back; else typed="${typed%?}"; spell dtyped "$typed"; fi ;;
        erase:enter) [ "$typed" = erase ] && case "$kind" in here) answer=move ;; *) answer=erase ;; esac ;;
        over:enter) answer=over ;;
        over:back) back ;;
      esac
    done
    kill "$KEYS_PID" 2>/dev/null
    tell "elyir:ask:done"
    echo "$answer" ;;
  *) echo "usage: $0 step <name> | first | end | ask <kind> <letters> [<drive>] [<try>]" >&2; exit 2 ;;
esac
exit 0
