#!/bin/sh
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# shellcheck shell=sh
# What try-root.sh needs in the initramfs (installed by inside.sh as an initramfs-tools hook): the overlay, and
# util-linux's and e2fsprogs' own tools rather than whatever busybox has by the same names.
PREREQ=""
case "${1:-}" in prereqs) echo "$PREREQ"; exit 0 ;; esac
# shellcheck disable=SC1091
. /usr/share/initramfs-tools/hook-functions
manual_add_modules overlay ext4
for t in blkid e2fsck mke2fs; do copy_exec "/usr/sbin/$t" "/usr/sbin/$t"; done
copy_exec /usr/bin/mount /usr/sbin/mount
copy_exec /usr/bin/umount /usr/sbin/umount
copy_file config /etc/mke2fs.conf /etc/mke2fs.conf
exit 0
