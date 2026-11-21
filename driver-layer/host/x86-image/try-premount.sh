#!/bin/sh
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# shellcheck shell=sh
# The initramfs checks the root before mounting it, and e2fsck writes the superblock's last-write time even on a clean
# filesystem, so the stick's own system (labeled cloudimg-rootfs as flashed) is not checked: nothing writes it, so
# there is nothing to repair (try-root.sh). A drive copy is relabeled hub-root and is checked as before. Installed by
# inside.sh as scripts/local-premount; /conf/param.conf is how such a script tells init to skip the check.
PREREQ=""
case "${1:-}" in prereqs) echo "$PREREQ"; exit 0 ;; esac

PATH="${HUB_PATH:-/usr/sbin:/usr/bin:/sbin:/bin}"
case "${ROOT:-}" in
  /dev/*) dev="$ROOT" ;;
  ?*) dev="$(blkid -l -o device -t "$ROOT" 2>/dev/null)" ;;
  *) dev="" ;;
esac
[ -n "$dev" ] && [ "$(blkid -o value -s LABEL "$dev" 2>/dev/null)" = cloudimg-rootfs ] \
  && echo "fastboot=y" >> "${HUB_PARAM_CONF:-/conf/param.conf}"
exit 0
