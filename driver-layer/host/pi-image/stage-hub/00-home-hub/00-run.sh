#!/bin/bash -e
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Runs on the build host with the image's root at ${ROOTFS_DIR}. Bakes in which code the image carries
# (files/home-hub.conf, written by the workflow) so the chroot step can clone exactly that.
if [ ! -f files/home-hub.conf ]; then
	printf 'HOME_HUB_REF=main\nHOME_HUB_REPO=https://github.com/elyir-labs/home-hub.git\n' > files/home-hub.conf
fi
install -m 644 files/home-hub.conf "${ROOTFS_DIR}/etc/home-hub.conf"
# The workflow gave pi-gen a throwaway password only so the first-boot username prompt stays off. Nobody can sign in
# as this user; Raspberry Pi Imager's customization sets a real password when someone wants a shell.
on_chroot <<- EOF
	usermod -p '*' "${FIRST_USER_NAME}"
EOF
# The containers the hub starts with before it has internet, saved by the workflow (files/preload/*.tar).
# firstboot.sh loads them and deletes them.
if ls files/preload/*.tar >/dev/null 2>&1; then
	install -d "${ROOTFS_DIR}/var/lib/home-hub/preload"
	install -m 644 files/preload/*.tar "${ROOTFS_DIR}/var/lib/home-hub/preload/"
fi
