#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The flash-and-go image for x86 hosts: a NUC, a mini PC. Ubuntu 24.04's cloud image with the hub on it,
# changed the way pi-gen changes Raspberry Pi OS: mounted on a loop device and entered with chroot, using
# this machine's own network. See README.md.
#
#   sudo build.sh <ref> <out.img> [preload-dir]
#
# Needs root, qemu-img, growpart (cloud-guest-utils), curl and sha256sum, on an amd64 Linux machine.
set -euo pipefail
REF="${1:?which tag or branch the image carries}"; OUT="${2:?where the image goes}"; PRELOAD="${3:-}"
REPO="${HOME_HUB_REPO:-https://github.com/elyir-labs/home-hub.git}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE="${HUB_BASE_URL:-https://cloud-images.ubuntu.com/releases/24.04/release}"
CLOUD="ubuntu-24.04-server-cloudimg-amd64.img"
WORK="$(mktemp -d)"; ROOT="$WORK/root"; LOOP=""
done_with() {
  set +e
  umount -R "$ROOT" 2>/dev/null || umount -R -l "$ROOT" 2>/dev/null
  [ -n "$LOOP" ] && losetup -d "$LOOP"
  # Never delete through a mount that is still there: under $ROOT were this machine's own /dev and /sys.
  if findmnt -rn -o TARGET | grep -q "^$ROOT"; then echo "still mounted under $ROOT; leaving $WORK alone" >&2
  else rm -rf "$WORK"; fi
}
trap done_with EXIT

curl -fsSL -o "$WORK/$CLOUD" "$BASE/$CLOUD"
curl -fsSL -o "$WORK/SHA256SUMS" "$BASE/SHA256SUMS"
(cd "$WORK" && grep " \*\?$CLOUD\$" SHA256SUMS | sha256sum -c -)

# Raw, so it can be written to a disk as it is, and with room for a kernel that knows real hardware, its
# firmware, Docker and the containers. first boot grows it again to fill whatever disk it lands on.
qemu-img convert -O raw "$WORK/$CLOUD" "$OUT"
qemu-img resize -f raw "$OUT" "${HUB_IMAGE_SIZE:-9G}"
LOOP="$(losetup -fP --show "$OUT")"
growpart "$LOOP" 1
e2fsck -pf "${LOOP}p1" || [ $? -le 1 ]   # 1 is "fixed something", which a fresh image may well need
resize2fs "${LOOP}p1"

# The image's own partitions, by their labels on this loop device and nowhere else: the machine building
# it is quite likely an Ubuntu cloud image itself, with partitions of the same names.
part() { for p in "$LOOP"p*; do [ "$(blkid -o value -s LABEL "$p")" = "$1" ] && { echo "$p"; return; }; done; }
mkdir -p "$ROOT"; mount "$(part cloudimg-rootfs)" "$ROOT"
[ -n "$(part BOOT)" ] && mount "$(part BOOT)" "$ROOT/boot"
mount "$(part UEFI)" "$ROOT/boot/efi"
for m in dev dev/pts proc sys run; do mount --bind "/$m" "$ROOT/$m"; done

printf 'HOME_HUB_REF=%s\nHOME_HUB_REPO=%s\nHUB_IMAGE=x86\n' "$REF" "$REPO" > "$ROOT/etc/home-hub.conf"
# Built from a branch, not a release tag: the hub follows that branch (install.sh, HOME_HUB_BRANCH).
case "$REF" in v[0-9]*) ;; *) echo "HOME_HUB_BRANCH=$REF" >> "$ROOT/etc/home-hub.conf" ;; esac
install -m 755 "$HERE/inside.sh" "$ROOT/tmp/inside.sh"
if [ -n "$PRELOAD" ] && ls "$PRELOAD"/*.tar >/dev/null 2>&1; then
  install -d "$ROOT/var/lib/home-hub/preload"
  install -m 644 "$PRELOAD"/*.tar "$ROOT/var/lib/home-hub/preload/"
fi
# Packages must not start services in here, and names are looked up the way this machine looks them up.
printf '#!/bin/sh\nexit 101\n' > "$ROOT/usr/sbin/policy-rc.d"; chmod 755 "$ROOT/usr/sbin/policy-rc.d"
mv "$ROOT/etc/resolv.conf" "$WORK/resolv.keep"; cp -L /etc/resolv.conf "$ROOT/etc/resolv.conf"

chroot "$ROOT" bash /tmp/inside.sh

rm -f "$ROOT/tmp/inside.sh" "$ROOT/usr/sbin/policy-rc.d" "$ROOT/etc/resolv.conf"
mv "$WORK/resolv.keep" "$ROOT/etc/resolv.conf"
# Lazily: these are this machine's own /dev, /proc, /sys and /run, and a package may have left something open in one.
for m in dev/pts dev proc sys run; do umount -R -l "$ROOT/$m"; done
# Blocks that held the downloaded packages still hold their bytes after the files are gone, and xz cannot
# tell them from the system. Discarding them leaves zeros in the image file, which compress to nothing.
fstrim -v "$ROOT/boot/efi" || true; mountpoint -q "$ROOT/boot" && { fstrim -v "$ROOT/boot" || true; }
fstrim -v "$ROOT"
echo "built $OUT"
