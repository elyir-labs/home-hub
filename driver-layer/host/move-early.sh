#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The start of every boot from the USB stick (home-hub-move.service), before the house, Docker or the system log has
# written anything. The stick is never a hub (design/move-to-drive/, stick-try): it sets hubs up, and it can hold one
# try (try.sh). So a start from it ends one of four ways:
#
#   - moved onto a drive, with the try if there is one (move-to-drive.sh), when the drive is empty (and
#     HUB_AUTO_INTERNAL is not 0), when the phone asked for it and drive.sh checked it, or when erase was typed;
#   - carrying on with the try the stick holds;
#   - a try made from this start, and a restart onto it;
#   - a restart into the hub already on the drive.
#
# Which one is asked on the screen when a keyboard is plugged in (say.sh ask: keys-2, A and C together), and decided
# by the safe answer when there's none. Running from the stick, it asks the firmware for the stick again on the next
# start (boot-next.sh), so a restart comes back to it rather than to whatever was on the drive before.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
CONF="${HUB_CONF:-/etc/home-hub.conf}"; VAR="${HUB_VAR:-/var/lib/home-hub}"
SYS_BLOCK="${HUB_SYS_BLOCK:-/sys/block}"
log() { printf '[home-hub] %s\n' "$*"; }
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
[ "${HUB_IMAGE:-}" = x86 ] || exit 0
ROOT_DISK="$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null | head -1)"
on_stick() { [ "$(lsblk -dno TRAN "/dev/$1" 2>/dev/null)" = usb ] || [ "$(cat "$SYS_BLOCK/$1/removable" 2>/dev/null)" = 1 ]; }
internal() { lsblk -dno NAME,TRAN,TYPE 2>/dev/null | awk -v r="$ROOT_DISK" '$3=="disk" && $1!=r && ($2=="nvme"||$2=="sata"||$2=="ata") {print $1}'; }
empty() { [ -z "$(lsblk -no NAME "/dev/$1" | tail -n +2)" ] && [ -z "$(wipefs -n "/dev/$1" 2>/dev/null)" ]; }
holds_hub() { lsblk -no LABEL "/dev/$1" 2>/dev/null | grep -qx hub-root; }

HOST="$DIR/driver-layer/host"
boot_next() { [ -x "$HOST/boot-next.sh" ] && "$HOST/boot-next.sh" "$@"; }
say() { [ -x "$DIR/startup/say.sh" ] && "$DIR/startup/say.sh" "$@"; }
# A keyboard, not just a power button: a device with keys that repeat (EV_REP), which buttons don't.
keyboard() {
  python3 -c 'import re, sys
for b in open(sys.argv[1]).read().split("\n\n"):
    h, e = re.search(r"^H: Handlers=(.*)$", b, re.M), re.search(r"^B: EV=([0-9a-fA-F]+)", b, re.M)
    if h and e and "kbd" in h.group(1).split() and int(e.group(1), 16) & 0x100000: sys.exit(0)
sys.exit(1)' "${HUB_INPUT:-/proc/bus/input/devices}" 2>/dev/null
}
# A keyboard plugged in at power-on can take a moment longer than the disks to be found.
keyboard_now() { local i=0; until keyboard || [ "$i" -ge "${HUB_KEYBOARD_WAIT:-6}" ]; do sleep 0.5; i=$((i + 1)); done; keyboard; }
splash_up() { command -v plymouth >/dev/null 2>&1 && plymouth --ping 2>/dev/null; }
# A line said on the way past stays long enough to be read.
hold() { splash_up && sleep "${HUB_SAY_HOLD:-6}"; return 0; }
restart() { hold; sync; systemctl --no-block reboot 2>/dev/null || reboot; exit 0; }
TRY_SH="$HOST/try.sh"
TRY="$({ [ -x "$TRY_SH" ] && "$TRY_SH" status 2>/dev/null; } || echo '{}')"
try_is() { python3 -c 'import json, sys; sys.exit(0 if json.loads(sys.argv[1] or "{}").get(sys.argv[2]) is True else 1)' "$TRY" "$1" 2>/dev/null; }
# Started from the stick, / is the try's overlay and names no disk: the stick is the one try.sh found under it.
[ -n "$ROOT_DISK" ] || ROOT_DISK="$(python3 -c 'import json, sys; print(json.loads(sys.argv[1] or "{}").get("disk") or "")' "$TRY" 2>/dev/null)"
describe() { "$HOST/drive.sh" describe "$1" 2>/dev/null; }
# A try made from this start: what it has written so far (drive.screen, say) is kept, and it restarts onto the try.
make_try() {
  say step "$1"
  if "$TRY_SH" make; then boot_next stick "$ROOT_DISK"; restart; fi
  log "could not make a try on the stick; carrying on from it for this start only"
  boot_next stick "$ROOT_DISK"; exit 0
}
clear_try() { say step clearing; "$TRY_SH" clear || log "could not clear the try"; boot_next stick "$ROOT_DISK"; restart; }

on_stick "$ROOT_DISK" || { rm -f "$VAR/move.request"; boot_next gone; exit 0; }

TARGET=""; ASKED=""
if [ -f "$VAR/move.request" ]; then
  ASKED="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["disk"])' "$VAR/move.request" 2>/dev/null)"
  WANT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["serial"])' "$VAR/move.request" 2>/dev/null)"
  if internal | grep -qx -- "$ASKED" && [ -n "$WANT" ] && [ "$(lsblk -dno SERIAL "/dev/$ASKED" | tr -d ' ')" = "$WANT" ]; then TARGET="$ASKED"
  else log "the drive asked for is not the one here now; nothing moved"; ASKED=""; fi
fi
# Start over, asked on the phone (This hub): the try goes, and the stick starts as flashed.
if [ -z "$TARGET" ] && [ -f "$VAR/try.over" ]; then rm -f "$VAR/try.over"; clear_try; fi

if [ -z "$TARGET" ] && try_is present; then
  # A try on the stick: carried on unless somebody at the keyboard says otherwise. Nothing is cleared by nobody answering.
  if keyboard_now; then
    if try_is here; then
      D="$(internal | head -1)"; DESC=""; letters=CS
      [ -n "$D" ] && { DESC="$(describe "$D")"; letters=CDS; }
      answer="$(say ask here "$letters" "$DESC" "$TRY")"
      log "asked at the keyboard about the try: ${answer:-no answer}"
      case "$answer" in
        move) TARGET="$D"; ASKED="$D" ;;
        over) clear_try ;;
      esac
    else
      answer="$(say ask away NB "" "$TRY")"
      log "asked at the keyboard about a try from another computer: ${answer:-no answer}"
      case "$answer" in
        new) clear_try ;;
        bring) "$TRY_SH" adopt || log "could not bring the try to this computer" ;;
      esac
    fi
  fi
  [ -n "$TARGET" ] || { rm -f "$VAR/move.request"; boot_next stick "$ROOT_DISK"; exit 0; }
fi

if [ -z "$TARGET" ]; then
  # A fresh stick. Nothing this start writes is kept unless it becomes a try.
  HUBD=""
  for d in $(internal); do holds_hub "$d" && { HUBD="$d"; break; }; done
  if [ -n "$HUBD" ]; then
    # A hub this stick (or another) already put on the drive, and the firmware started the stick anyway.
    answer=""
    keyboard_now && answer="$(say ask hub HTR "$(describe "$HUBD")")"
    log "a hub is already on $HUBD; asked: ${answer:-no answer}"
    case "$answer" in
      try) make_try trying ;;
      erase) TARGET="$HUBD"; ASKED="$HUBD" ;;
      *) say step todrive; boot_next drive "$HUBD"; restart ;;
    esac
  fi
fi
if [ -z "$TARGET" ] && [ "${HUB_AUTO_INTERNAL:-1}" = 1 ]; then
  for d in $(internal); do empty "$d" && { TARGET="$d"; break; }; done
fi
if [ -z "$TARGET" ]; then
  # Beside a drive with something on it: asked at the keyboard before anything is written (screen-asks, keys-2). The
  # answer is kept in drive.screen, which goes into the try, so the phone doesn't ask again. No keyboard, or no answer,
  # and it starts as a try and the phone asks.
  KEPT=""
  for d in $(internal); do empty "$d" || { KEPT="$d"; break; }; done
  answer=""
  if [ -n "$KEPT" ] && keyboard_now; then
    answer="$(say ask drive TE "$(describe "$KEPT")")"
    log "asked at the keyboard about $KEPT: ${answer:-no answer}"
  fi
  if [ -n "$answer" ]; then
    mkdir -p "$VAR"
    python3 -c 'import json, sys, time
print(json.dumps({"answer": sys.argv[1], "disk": sys.argv[2], "serial": sys.argv[3], "at": int(time.time())}))' \
      "$([ "$answer" = erase ] && echo erase || echo keep)" "$KEPT" "$(lsblk -dno SERIAL "/dev/$KEPT" 2>/dev/null | tr -d ' ')" > "$VAR/drive.screen"
  fi
  case "$answer" in
    erase) TARGET="$KEPT"; ASKED="$KEPT" ;;
    try) make_try trying ;;
    *) if [ -n "$KEPT" ]; then make_try unasked; else make_try trying; fi ;;
  esac
fi

log "moving the system from the stick onto $TARGET"
[ -x "$DIR/startup/say.sh" ] && "$DIR/startup/say.sh" step moving
quiet() { for m in /boot/efi /boot /; do mountpoint -q "$m" && mount -o "remount,$1" "$m"; done; }
if quiet ro; then
  TMPDIR=/run "$DIR/driver-layer/host/move-to-drive.sh" "$ROOT_DISK" "$TARGET"; ok=$?
else
  ok=1; log "could not make the disk read-only to copy it"
fi
quiet rw
rm -f "$VAR/move.request"
if [ "$ok" -eq 0 ]; then
  log "moved; restarting from $TARGET. The stick is untouched and can set up another hub."
  boot_next gone
  sync; systemctl --no-block reboot 2>/dev/null || reboot
else
  [ -n "$ASKED" ] && echo "The hub couldn't move onto the drive, so it's still running from the USB stick. Nothing on the drive was changed until the copy started." > "$VAR/move.failed"
  log "could not move to $TARGET; carrying on from the stick"
  try_is present || make_try trying
  boot_next stick "$ROOT_DISK"
fi
