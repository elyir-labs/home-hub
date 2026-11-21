#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copies the system a hub is running from (a USB stick) onto a drive, and makes the drive the one it starts
# from. firstboot.sh calls it for an empty drive; a drive with anything on it is only ever moved to when
# somebody asked for that on the screen (design/move-to-drive/).
#
#   move-to-drive.sh <from> <to>        disk names, e.g. sda nvme0n1
#
# THE STICK'S SYSTEM IS NEVER WRITTEN. It sets up the next hub. What would otherwise make the copy and the stick
# confusable is changed on the copy instead: new partition and filesystem ids, its own labels, its own
# machine id, and every file that names them rewritten to match. Then the firmware is told to start from
# the drive. This script does not check that <to> may be erased; its callers do, and that is the point of
# keeping them separate.
#
# Running on the stick's try (design/move-to-drive/, stick-try), the try comes along: the system and the try's
# changes land on the drive as one ordinary system, the house's own machine id included, and the try on the stick
# is emptied, so a house is never left on a stick once it is somewhere else. Only the try's partition on the stick
# is written, never its system.
set -euo pipefail
SRC="${1:?from which disk}"; DST="${2:?to which disk}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TRY_RUN="${HUB_TRY_RUN:-/run/home-hub-try}"
TRY=""; [ "$(cat "$TRY_RUN/state" 2>/dev/null)" = try ] && TRY="$TRY_RUN/part"
M="$(mktemp -d)"; V="$(mktemp -d)"
part() { case "$1" in *[0-9]) echo "/dev/${1}p$2" ;; *) echo "/dev/$1$2" ;; esac; }
log() { printf '[home-hub] %s\n' "$*"; }
done_with() { umount -R "$M" "$V" 2>/dev/null || true; rmdir "$M" "$V" 2>/dev/null || true; }
numbers() { sfdisk -J "/dev/$1" | python3 -c 'import json,sys,re
for x in json.load(sys.stdin)["partitiontable"]["partitions"]:
    if x.get("name") != "hub-try": print(re.search(r"(\d+)$", x["node"]).group(1))'; }
trap done_with EXIT

# Only as far as the system's last partition: the stick may be far bigger than the system on it, and the try's
# partition after it is brought over below as files, if this start runs on it.
BYTES="$(sfdisk -J "/dev/$SRC" | python3 -c 'import json,sys
p=json.load(sys.stdin)["partitiontable"]
print(max(x["start"]+x["size"] for x in p["partitions"] if x.get("name") != "hub-try")*p.get("sectorsize",512))')"
[ "$(blockdev --getsize64 "/dev/$DST")" -ge "$BYTES" ] || { log "$DST is too small for this system"; exit 1; }
# A filesystem on the drive that is in use can't be given its own id, and finding that out after the copy leaves a
# drive that starts nothing.
IN_USE="$(lsblk -lno MOUNTPOINTS "/dev/$DST" 2>/dev/null | grep -v '^$' | tr '\n' ' ' || true)"
[ -z "$IN_USE" ] || { log "$DST is in use ($IN_USE), so nothing was written to it"; exit 1; }
dd if="/dev/$SRC" of="/dev/$DST" bs=4M count="$BYTES" iflag=count_bytes conv=fsync status=none
sfdisk --relocate gpt-bak-std "/dev/$DST" >/dev/null
# The stick's table names its try, whose bytes were not copied.
for n in $(sfdisk -J "/dev/$DST" | python3 -c 'import json,sys,re
for x in json.load(sys.stdin)["partitiontable"]["partitions"]:
    if x.get("name") == "hub-try": print(re.search(r"(\d+)$", x["node"]).group(1))'); do
  sfdisk -q --delete "/dev/$DST" "$n" >/dev/null
done

# A new identity. Each old id is written down with its replacement, so every file that names one can follow.
SUBS=()
sfdisk --disk-id "/dev/$DST" "$(uuidgen)" >/dev/null
for n in $(numbers "$DST"); do
  old="$(blkid -o value -s PARTUUID "$(part "$SRC" "$n")")"; new="$(uuidgen)"
  sfdisk --part-uuid "/dev/$DST" "$n" "$new" >/dev/null
  [ -n "$old" ] && SUBS+=("$old" "$new")
done
partx -u "/dev/$DST" 2>/dev/null || partprobe "/dev/$DST" 2>/dev/null || true
udevadm settle 2>/dev/null || true

ROOT=""; BOOT=""; EFI=""
for n in $(numbers "$DST"); do
  p="$(part "$DST" "$n")"
  case "$(blkid -o value -s LABEL "$p")" in
    cloudimg-rootfs|hub-root) ROOT="$p"; ROOTN="$n"; label=hub-root ;;
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
# A try's house is bigger than the room the flashed system left, so the copy fills the drive before it arrives.
if [ -n "$TRY" ]; then
  growpart "/dev/$DST" "$ROOTN" >/dev/null || true
  e2fsck -fy "$ROOT" >/dev/null 2>&1 || true
  resize2fs "$ROOT" >/dev/null 2>&1 || { log "could not make room on $DST for the try"; exit 1; }
fi
SUBS+=("LABEL=cloudimg-rootfs" "LABEL=hub-root" "LABEL=BOOT" "LABEL=hub-boot" "LABEL=UEFI" "LABEL=HUB-EFI")

mount "$ROOT" "$M"
if [ -n "$TRY" ]; then
  # The root alone, without what is mounted on it, is the system exactly as the try sees it: a file the try
  # deleted is not there, so --delete deletes it on the copy too. Docker's own layers are beside it on the try.
  mount --bind / "$V" && mount -o remount,bind,ro "$V" || { log "could not read the try"; exit 1; }
  rsync -aHAX --numeric-ids --delete --exclude=/etc/home-hub-stick "$V/" "$M/" || { log "could not copy the try onto $DST"; exit 1; }
  umount "$V"
  for d in docker containerd; do
    [ -d "$TRY/$d" ] || continue
    mkdir -p "$M/var/lib/$d"
    rsync -aHAX --numeric-ids --delete "$TRY/$d/" "$M/var/lib/$d/" || { log "could not copy the try's $d onto $DST"; exit 1; }
  done
fi
[ -n "$BOOT" ] && mount "$BOOT" "$M/boot"
[ -n "$EFI" ] && mount "$EFI" "$M/boot/efi"
for f in "$M/etc/fstab" "$M/boot/grub/grub.cfg" "$M/boot/efi/EFI/ubuntu/grub.cfg" "$M/boot/efi/EFI/BOOT/grub.cfg"; do
  [ -f "$f" ] || continue
  i=0; while [ "$i" -lt "${#SUBS[@]}" ]; do sed -i.was "s|${SUBS[$i]}|${SUBS[$((i + 1))]}|g" "$f"; i=$((i + 2)); done
  rm -f "$f.was"
done
# The stick made a machine id when it booted here; the drive makes its own, so no two hubs from one stick share one.
# A try's id is its house's, and the try is emptied below, so it goes with the house.
[ -n "$TRY" ] || { : > "$M/etc/machine-id"; rm -f "$M/var/lib/dbus/machine-id"; }
# Never an overlay on the drive (x86-image/try-root.sh): the copy is relabeled above, and loses the stick's mark.
rm -f "$M/etc/home-hub-stick"
# The drive knows it was moved onto (the panel says so once), and does not take the request that moved it as its own.
mkdir -p "$M/var/lib/home-hub"; date +%s > "$M/var/lib/home-hub/moved"; rm -f "$M/var/lib/home-hub/move.request" "$M/var/lib/home-hub/try.over"
# The drive empties the stick's try for good on its first start, if the stick is still in (try.sh tidy).
if [ -n "$TRY" ]; then
  blkid -o value -s PARTUUID "$(findmnt -no SOURCE "$TRY")" > "$M/var/lib/home-hub/try.clear" 2>/dev/null || true
fi
umount -R "$M"
if [ -n "$TRY" ]; then
  "$HERE/try.sh" clear || { log "the try is on $DST but could not be emptied on the stick"; exit 1; }
fi

# Start from the drive next, and from now on. Firmware that ignores this and prefers any USB stick boots the
# stick again; firstboot.sh sees its hub already on the drive and turns the computer off, for the stick to come out.
if [ -d /sys/firmware/efi ] && [ -n "$EFI" ] && command -v efibootmgr >/dev/null 2>&1; then
  efibootmgr -c -d "/dev/$DST" -p "$EFIN" -L "Elyir Home Hub" -l '\EFI\ubuntu\shimx64.efi' >/dev/null
fi
log "the system is on $DST"
