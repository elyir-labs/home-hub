#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copies the system a hub is running from (a USB stick) onto a drive, and makes the drive the one it starts
# from. firstboot.sh calls it for an empty drive; a drive with anything on it is only ever moved to when
# somebody asked for that on the screen (design/move-to-drive/).
#
#   move-to-drive.sh <from> <to>        disk names, e.g. sda nvme0n1
#
# THE STICK IS NEVER WRITTEN. It sets up the next hub. What would otherwise make the copy and the stick
# confusable is changed on the copy instead: new partition and filesystem ids, its own labels, its own
# machine id, and every file that names them rewritten to match. Then the firmware is told to start from
# the drive. This script does not check that <to> may be erased; its callers do, and that is the point of
# keeping them separate.
set -euo pipefail
SRC="${1:?from which disk}"; DST="${2:?to which disk}"
M="$(mktemp -d)"
part() { case "$1" in *[0-9]) echo "/dev/${1}p$2" ;; *) echo "/dev/$1$2" ;; esac; }
log() { printf '[home-hub] %s\n' "$*"; }
done_with() { umount -R "$M" 2>/dev/null || true; rmdir "$M" 2>/dev/null || true; }
trap done_with EXIT

# Only as far as the last partition: the stick may be far bigger than the system on it.
BYTES="$(sfdisk -J "/dev/$SRC" | python3 -c 'import json,sys
p=json.load(sys.stdin)["partitiontable"]; print(max(x["start"]+x["size"] for x in p["partitions"])*p.get("sectorsize",512))')"
[ "$(blockdev --getsize64 "/dev/$DST")" -ge "$BYTES" ] || { log "$DST is too small for this system"; exit 1; }
dd if="/dev/$SRC" of="/dev/$DST" bs=4M count="$BYTES" iflag=count_bytes conv=fsync status=none
sfdisk --relocate gpt-bak-std "/dev/$DST" >/dev/null

# A new identity. Each old id is written down with its replacement, so every file that names one can follow.
SUBS=()
sfdisk --disk-id "/dev/$DST" "$(uuidgen)" >/dev/null
for n in $(sfdisk -J "/dev/$DST" | python3 -c 'import json,sys,re
for x in json.load(sys.stdin)["partitiontable"]["partitions"]: print(re.search(r"(\d+)$", x["node"]).group(1))'); do
  old="$(blkid -o value -s PARTUUID "$(part "$SRC" "$n")")"; new="$(uuidgen)"
  sfdisk --part-uuid "/dev/$DST" "$n" "$new" >/dev/null
  [ -n "$old" ] && SUBS+=("$old" "$new")
done
partx -u "/dev/$DST" 2>/dev/null || partprobe "/dev/$DST" 2>/dev/null || true
udevadm settle 2>/dev/null || true

ROOT=""; BOOT=""; EFI=""
for n in $(sfdisk -J "/dev/$DST" | python3 -c 'import json,sys,re
for x in json.load(sys.stdin)["partitiontable"]["partitions"]: print(re.search(r"(\d+)$", x["node"]).group(1))'); do
  p="$(part "$DST" "$n")"
  case "$(blkid -o value -s LABEL "$p")" in
    cloudimg-rootfs|hub-root) ROOT="$p"; label=hub-root ;;
    BOOT|hub-boot) BOOT="$p"; label=hub-boot ;;
    UEFI|HUB-EFI) EFI="$p"; EFIN="$n"; fatlabel "$p" HUB-EFI >/dev/null 2>&1 || true; continue ;;
    *) continue ;;
  esac
  old="$(blkid -o value -s UUID "$p")"
  e2fsck -fy "$p" >/dev/null 2>&1 || true
  tune2fs -U random "$p" >/dev/null
  e2label "$p" "$label"
  SUBS+=("$old" "$(blkid -o value -s UUID "$p")")
done
[ -n "$ROOT" ] || { log "no system found on the copy"; exit 1; }
SUBS+=("LABEL=cloudimg-rootfs" "LABEL=hub-root" "LABEL=BOOT" "LABEL=hub-boot" "LABEL=UEFI" "LABEL=HUB-EFI")

mount "$ROOT" "$M"
[ -n "$BOOT" ] && mount "$BOOT" "$M/boot"
[ -n "$EFI" ] && mount "$EFI" "$M/boot/efi"
for f in "$M/etc/fstab" "$M/boot/grub/grub.cfg" "$M/boot/efi/EFI/ubuntu/grub.cfg" "$M/boot/efi/EFI/BOOT/grub.cfg"; do
  [ -f "$f" ] || continue
  i=0; while [ "$i" -lt "${#SUBS[@]}" ]; do sed -i.was "s|${SUBS[$i]}|${SUBS[$((i + 1))]}|g" "$f"; i=$((i + 2)); done
  rm -f "$f.was"
done
# The stick made a machine id when it booted here; the drive makes its own, so no two hubs from one stick share one.
: > "$M/etc/machine-id"; rm -f "$M/var/lib/dbus/machine-id"
# The drive knows it was moved onto (the panel says so once), and does not take the request that moved it as its own.
mkdir -p "$M/var/lib/home-hub"; date +%s > "$M/var/lib/home-hub/moved"; rm -f "$M/var/lib/home-hub/move.request"
umount -R "$M"

# Start from the drive next, and from now on. Firmware that ignores this and prefers any USB stick boots the
# stick again; firstboot.sh sees its hub already on the drive and turns the computer off, for the stick to come out.
if [ -d /sys/firmware/efi ] && [ -n "$EFI" ] && command -v efibootmgr >/dev/null 2>&1; then
  efibootmgr -c -d "/dev/$DST" -p "$EFIN" -L "Elyir Home Hub" -l '\EFI\ubuntu\shimx64.efi' >/dev/null
fi
log "the system is on $DST"
