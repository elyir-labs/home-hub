#!/bin/bash -e
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Runs inside the image. The code, Docker and the first-boot unit go in now. The few containers the hub
# needs before it has internet were saved by the workflow (00-run.sh); the rest are pulled once it is online.
# shellcheck disable=SC1091
. /etc/home-hub.conf
REF="${HOME_HUB_REF:-main}"
REPO="${HOME_HUB_REPO:-https://github.com/elyir-labs/home-hub.git}"

git clone --depth 1 --branch "$REF" "$REPO" /opt/home-hub
chmod +x /opt/home-hub/install.sh /opt/home-hub/driver-layer/radios.sh /opt/home-hub/driver-layer/host/firstboot.sh

# get.docker.com ends by starting the daemon, which cannot happen in a chroot; the packages are what matter.
curl -fsSL https://get.docker.com | sh || true
command -v docker >/dev/null || { echo "docker did not install"; exit 1; }

install -m 644 /opt/home-hub/driver-layer/host/home-hub-firstboot.service /etc/systemd/system/home-hub-firstboot.service
systemctl enable docker avahi-daemon home-hub-firstboot
