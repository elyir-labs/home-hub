#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# What this hub is running from, and the drive beside it (design/move-to-drive/). Two ways in, the same two
# network.sh has:
#
#   drive.sh                    write brain-data/drive.json: running from a USB stick or a drive, and each
#                               internal drive described in a household's words. Once a boot.
#   drive.sh (with a request)   brain-data/drive.request asks to move onto a drive. Checked here, written for
#                               move-early.sh, and the hub restarts; the copy happens at the very start of
#                               that restart, before anything writes to the disk.
#
# THE REQUEST NAMES A DRIVE AND ITS SERIAL, AND BOTH ARE CHECKED AGAIN HERE: only on the x86 image, only while
# running from a stick, never the disk it is running from, and only if the serial is still the one the screen
# showed. A page left open for a week cannot erase a drive somebody swapped in since.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
DATA="$DIR/driver-layer/brain-data"
REQ="$DATA/drive.request"; STATE="$DATA/drive.json"
CONF="${HUB_CONF:-/etc/home-hub.conf}"; VAR="${HUB_VAR:-/var/lib/home-hub}"
SYS_BLOCK="${HUB_SYS_BLOCK:-/sys/block}"; PEEK="${HUB_PEEK:-/run/home-hub-peek}"
IMAGE="$(sed -n 's/^HUB_IMAGE=//p' "$CONF" 2>/dev/null | tail -1 | tr -d '"')"
ROOT_DISK="$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null | head -1)"

on_stick() { [ "$(lsblk -dno TRAN "/dev/$1" 2>/dev/null)" = usb ] || [ "$(cat "$SYS_BLOCK/$1/removable" 2>/dev/null)" = 1 ]; }
internal() { lsblk -dno NAME,TRAN,TYPE 2>/dev/null | awk -v r="$ROOT_DISK" '$3=="disk" && $1!=r && ($2=="nvme"||$2=="sata"||$2=="ata") {print $1}'; }
serial() { lsblk -dno SERIAL "/dev/$1" 2>/dev/null | tr -d ' '; }
empty() { [ -z "$(lsblk -no NAME "/dev/$1" | tail -n +2)" ] && [ -z "$(wipefs -n "/dev/$1" 2>/dev/null)" ]; }

# A drive in a household's words: the system on it by its own name, how much is stored, when it was last
# written. Read-only and without replaying a journal, so looking changes nothing.
describe() {
  local d="$1" system="" used=0 last=0 p fs m
  for p in $(lsblk -lno NAME "/dev/$d" | tail -n +2); do
    fs="$(lsblk -no FSTYPE "/dev/$p" 2>/dev/null)"
    case "$fs" in ext4|ext3|xfs|btrfs|ntfs|ntfs3|vfat|exfat) ;; *) continue ;; esac
    m="$PEEK/$p"; mkdir -p "$m"
    case "$fs" in ext4|ext3) mount -o ro,noload "/dev/$p" "$m" 2>/dev/null ;; *) mount -o ro "/dev/$p" "$m" 2>/dev/null ;; esac || { rmdir "$m"; continue; }
    if [ -z "$system" ] && [ -f "$m/etc/os-release" ]; then
      # Read, never sourced: it is somebody else's file, and sourcing it would run whatever is in it, as root.
      system="$(python3 -c 'import sys,shlex
f={}
for l in open(sys.argv[1], errors="replace"):
    k,_,v=l.strip().partition("=")
    if k in ("NAME","VERSION_ID"):
        try: f[k]=shlex.split(v)[0] if v else ""
        except ValueError: f[k]=v.strip("\"\x27")
print((f.get("NAME") or "Linux")+(" "+f["VERSION_ID"] if f.get("VERSION_ID") else ""))' "$m/etc/os-release" 2>/dev/null)"
    elif [ -z "$system" ] && [ -d "$m/Windows/System32" ]; then system="Windows"; fi
    [ "$fs" = vfat ] || used=$(( used + $(df -B1 --output=used "$m" 2>/dev/null | tail -1 | tr -d ' ' || echo 0) ))
    for f in "$m/var/log" "$m/home" "$m/Windows/System32/config" "$m/Users"; do
      [ -e "$f" ] && { t=$(stat -c %Y "$f" 2>/dev/null || echo 0); [ "$t" -gt "$last" ] && last=$t; }
    done
    umount "$m" 2>/dev/null; rmdir "$m" 2>/dev/null
  done
  python3 -c 'import json,sys
n,serial,model,size,empty,system,used,last=sys.argv[1:]
print(json.dumps({"name":n,"serial":serial,"model":model.strip(),"bytes":int(size or 0),"empty":empty=="1",
                  "system":system or None,"used":int(used) or None,"last":int(last) or None}))' \
    "$d" "$(serial "$d")" "$(lsblk -dno MODEL "/dev/$d" 2>/dev/null)" "$(lsblk -bdno SIZE "/dev/$d" 2>/dev/null)" \
    "$(empty "$d" && echo 1 || echo 0)" "$system" "$used" "$last"
}

write_state() {
  local from=drive drives="" d first=1
  on_stick "$ROOT_DISK" && from=stick
  for d in $(internal); do [ $first -eq 1 ] || drives="$drives,"; first=0; drives="$drives$(describe "$d")"; done
  {
    printf '{"at": %s, "image": "%s", "from": "%s", "drives": [%s]' "$(date +%s)" "$IMAGE" "$from" "$drives"
    [ -f "$VAR/moved" ] && printf ', "moved": %s' "$(head -1 "$VAR/moved")"
    [ -f "$VAR/move.failed" ] && printf ', "failed": %s' "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$(head -1 "$VAR/move.failed")")"
    [ -n "${1:-}" ] && printf ', "asked": %s' "$1"
    printf '}\n'
  } > "$STATE.tmp" && mv "$STATE.tmp" "$STATE"
}

refuse() { write_state "$(python3 -c 'import json,sys; print(json.dumps({"refused": sys.argv[1]}))' "$1")"; exit 0; }

if [ -f "$REQ" ]; then
  DO="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("do",""))' "$REQ" 2>/dev/null)"
  DISK="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("disk",""))' "$REQ" 2>/dev/null)"
  SERIAL="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("serial",""))' "$REQ" 2>/dev/null)"
  rm -f "$REQ"
  [ "$DO" = move ] || refuse "not a thing this hub knows how to do"
  [ "$IMAGE" = x86 ] || refuse "This hub wasn't installed from a USB stick."
  on_stick "$ROOT_DISK" || refuse "This hub is already on its own drive."
  internal | grep -qx -- "$DISK" || refuse "That drive isn't in this computer."
  [ -n "$SERIAL" ] && [ "$(serial "$DISK")" = "$SERIAL" ] || refuse "That isn't the drive the screen showed. Look again."
  mkdir -p "$VAR"; rm -f "$VAR/move.failed"
  printf '{"disk": "%s", "serial": "%s"}\n' "$DISK" "$SERIAL" > "$VAR/move.request"
  write_state '{"moving": true}'
  systemctl --no-block reboot 2>/dev/null || reboot
  exit 0
fi
write_state
