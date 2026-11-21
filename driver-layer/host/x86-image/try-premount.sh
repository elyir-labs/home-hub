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
# The kernel names the root by UUID, and here it is not yet a device path. blkid's cache did not always know it this
# early (on most starts, as it turned out), so udev's link comes first and a direct probe second.
DEV="${HUB_DEV:-/dev}"
by() { link="$(readlink -f "$DEV/disk/$1/$2" 2>/dev/null)"; if [ -b "$link" ]; then echo "$link"; else blkid "$3" "$2" 2>/dev/null; fi; }
case "${ROOT:-}" in
  /dev/*) dev="$ROOT" ;;
  UUID=*) dev="$(by by-uuid "${ROOT#UUID=}" -U)" ;;
  LABEL=*) dev="$(by by-label "${ROOT#LABEL=}" -L)" ;;
  *) dev="" ;;
esac
say() { echo "home-hub: $*" > /dev/kmsg 2>/dev/null || true; }
[ -n "$dev" ] && [ "$(blkid -p -o value -s LABEL "$dev" 2>/dev/null)" = cloudimg-rootfs ] || { say "premount: ${ROOT:-no root} is not the stick's system"; exit 0; }
blockdev --setro "$dev" || say "the stick's system could not be made read-only"
echo "fastboot=y" >> "${HUB_PARAM_CONF:-/conf/param.conf}"
say "premount: the stick's system ($dev) is read-only and not checked"
exit 0
