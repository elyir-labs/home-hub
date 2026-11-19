#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The move itself, at the very start of a boot (home-hub-move.service): before the house, Docker or the system
# log has written anything, with the disk made read-only, so nothing is copied half-written. Three reasons to
# move, and no others: the drive is empty (and HUB_AUTO_INTERNAL is not 0), somebody asked for this drive on the
# phone and drive.sh checked it (design/move-to-drive/, A), or somebody typed erase at the keyboard on the first
# start (screen-asks, C). Either way the work is move-to-drive.sh's.
#
# Staying on the stick, it asks the firmware for the stick again on the next start (boot-next.sh), so a restart
# comes back to the hub rather than to whatever was on the drive before.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
CONF="${HUB_CONF:-/etc/home-hub.conf}"; VAR="${HUB_VAR:-/var/lib/home-hub}"
SYS_BLOCK="${HUB_SYS_BLOCK:-/sys/block}"
log() { printf '[home-hub] %s\n' "$*"; }
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
[ "${HUB_IMAGE:-}" = x86 ] || exit 0
ROOT_DISK="$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" | head -1)"
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
splash_up() { command -v plymouth >/dev/null 2>&1 && plymouth --ping 2>/dev/null; }
# A line said on the way past stays long enough to be read.
hold() { splash_up && sleep "${HUB_SAY_HOLD:-6}"; return 0; }

on_stick "$ROOT_DISK" || { rm -f "$VAR/move.request"; boot_next gone; exit 0; }

TARGET=""; ASKED=""
if [ -f "$VAR/move.request" ]; then
  ASKED="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["disk"])' "$VAR/move.request" 2>/dev/null)"
  WANT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["serial"])' "$VAR/move.request" 2>/dev/null)"
  if internal | grep -qx -- "$ASKED" && [ -n "$WANT" ] && [ "$(lsblk -dno SERIAL "/dev/$ASKED" | tr -d ' ')" = "$WANT" ]; then TARGET="$ASKED"
  else log "the drive asked for is not the one here now; nothing moved"; ASKED=""; fi
fi
if [ -z "$TARGET" ]; then
  for d in $(internal); do
    if holds_hub "$d"; then
      # This stick already put its hub on the drive and the firmware started from the stick anyway. Off,
      # rather than a second hub: take the stick out and switch it back on.
      log "the hub is already on $d and this computer started from the stick again: turning off, take the stick out"
      rm -f "$VAR/move.request"; boot_next gone; poweroff; exit 0
    fi
  done
  if [ "${HUB_AUTO_INTERNAL:-1}" = 1 ]; then
    for d in $(internal); do empty "$d" && { TARGET="$d"; break; }; done
  fi
fi
# A first start beside a drive with something on it: asked at the keyboard, if there is one, before anything is
# written (design/move-to-drive/, screen-asks). Asked once: whatever it was told is kept in drive.screen, which the
# phone reads through drive.sh so it doesn't ask again. No keyboard, or no answer, and the phone asks instead.
if [ -z "$TARGET" ] && [ ! -e "$VAR/firstboot.done" ] && [ ! -s "$VAR/drive.screen" ]; then
  KEPT=""
  for d in $(internal); do empty "$d" || { KEPT="$d"; break; }; done
  if [ -n "$KEPT" ]; then
    # A keyboard plugged in at power-on can take a moment longer than the disks to be found.
    i=0; until keyboard || [ "$i" -ge "${HUB_KEYBOARD_WAIT:-6}" ]; do sleep 0.5; i=$((i + 1)); done
    answer=""
    if keyboard; then
      answer="$(say ask-drive "$("$HOST/drive.sh" describe "$KEPT" 2>/dev/null)")"
      log "asked at the keyboard about $KEPT: ${answer:-no answer}"
    fi
    case "$answer" in
      erase|keep)
        mkdir -p "$VAR"
        python3 -c 'import json, sys, time
print(json.dumps({"answer": sys.argv[1], "disk": sys.argv[2], "serial": sys.argv[3], "at": int(time.time())}))' \
          "$answer" "$KEPT" "$(lsblk -dno SERIAL "/dev/$KEPT" 2>/dev/null | tr -d ' ')" > "$VAR/drive.screen" ;;
    esac
    case "$answer" in
      erase) TARGET="$KEPT"; ASKED="$KEPT" ;;
      keep) say step keeping; hold ;;
      *) say step unasked; hold ;;
    esac
  fi
fi
[ -n "$TARGET" ] || { rm -f "$VAR/move.request"; boot_next stick "$ROOT_DISK"; exit 0; }

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
  boot_next stick "$ROOT_DISK"
fi
