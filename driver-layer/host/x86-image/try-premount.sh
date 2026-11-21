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
case "${ROOT:-}" in
  /dev/*) dev="$ROOT" ;;
  ?*) dev="$(blkid -l -o device -t "$ROOT" 2>/dev/null)" ;;
  *) dev="" ;;
esac
[ -n "$dev" ] && [ "$(blkid -o value -s LABEL "$dev" 2>/dev/null)" = cloudimg-rootfs ] || exit 0
blockdev --setro "$dev" || echo "home-hub: the stick's system could not be made read-only" > /dev/kmsg 2>/dev/null
echo "fastboot=y" >> "${HUB_PARAM_CONF:-/conf/param.conf}"
exit 0
