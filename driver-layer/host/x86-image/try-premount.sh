#!/bin/sh
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# shellcheck shell=sh
# The stick's own system (labeled cloudimg-rootfs as flashed) is never written, so it is made read-only at the block
# device before anything mounts it: mounted read-only, the kernel still rewrote its superblock's last-write time on some
# starts and not others, and a read-only device ends that whoever does it. Nor is it checked, since e2fsck writes the
# superblock even on a clean filesystem, and there is nothing to repair (try-root.sh). A drive copy is relabeled
# hub-root and is checked and written as before. Installed by inside.sh as scripts/local-premount; /conf/param.conf is
# how such a script tells init to skip the check.
PREREQ=""
case "${1:-}" in prereqs) echo "$PREREQ"; exit 0 ;; esac

PATH="${HUB_PATH:-/usr/sbin:/usr/bin:/sbin:/bin}"
# The kernel names the root by UUID, and this runs before init has waited for it: a USB stick is found a few seconds
# into the start, and on most starts it was not there yet. So this waits for it, as init would next, through udev's
# link or a direct probe.
DEV="${HUB_DEV:-/dev}"
by() { link="$(readlink -f "$DEV/disk/$1/$2" 2>/dev/null)"; if [ -b "$link" ]; then echo "$link"; else blkid "$3" "$2" 2>/dev/null; fi; }
find_root() {
  case "${ROOT:-}" in
    /dev/*) echo "$ROOT" ;;
    UUID=*) by by-uuid "${ROOT#UUID=}" -U ;;
    LABEL=*) by by-label "${ROOT#LABEL=}" -L ;;
  esac
}
tries=0
until dev="$(find_root)"; [ -n "$dev" ] || [ "$tries" -ge "${HUB_ROOT_WAIT:-300}" ]; do
  sleep 0.1; tries=$((tries + 1))
done
say() { echo "home-hub: $*" > /dev/kmsg 2>/dev/null || true; }
[ -n "$dev" ] && [ "$(blkid -p -o value -s LABEL "$dev" 2>/dev/null)" = cloudimg-rootfs ] || { say "premount: ${ROOT:-no root} is not the stick's system"; exit 0; }
blockdev --setro "$dev" || say "the stick's system could not be made read-only"
echo "fastboot=y" >> "${HUB_PARAM_CONF:-/conf/param.conf}"
say "premount: the stick's system ($dev) is read-only and not checked"
exit 0
