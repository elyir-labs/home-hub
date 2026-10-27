#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The move itself, at the very start of a boot (home-hub-move.service): before the house, Docker or the system
# log has written anything, with the disk made read-only, so nothing is copied half-written. Two reasons to
# move, and no others: the drive is empty (and HUB_AUTO_INTERNAL is not 0), or somebody asked for this drive on
# the screen and drive.sh checked it (design/move-to-drive/). Either way the work is move-to-drive.sh's.
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

on_stick "$ROOT_DISK" || { rm -f "$VAR/move.request"; exit 0; }

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
      rm -f "$VAR/move.request"; poweroff; exit 0
    fi
  done
  if [ "${HUB_AUTO_INTERNAL:-1}" = 1 ]; then
    for d in $(internal); do empty "$d" && { TARGET="$d"; break; }; done
  fi
fi
[ -n "$TARGET" ] || { rm -f "$VAR/move.request"; exit 0; }

log "moving the system from the stick onto $TARGET"
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
  sync; systemctl --no-block reboot 2>/dev/null || reboot
else
  [ -n "$ASKED" ] && echo "The hub couldn't move onto the drive, so it's still running from the USB stick. Nothing on the drive was changed until the copy started." > "$VAR/move.failed"
  log "could not move to $TARGET; carrying on from the stick"
fi
