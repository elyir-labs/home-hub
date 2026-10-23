#!/bin/bash -e
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Runs inside the image. The code, Docker and the first-boot unit go in now. The few containers the hub
# needs before it has internet were saved by the workflow (00-run.sh); the rest are pulled once it is online.
# shellcheck disable=SC1091
. /etc/home-hub.conf
REF="${HOME_HUB_REF:-main}"
REPO="${HOME_HUB_REPO:-https://github.com/elyir-labs/home-hub.git}"

# Without design/ and site/, the same list as trim_checkout in install.sh.
git clone --depth 1 --filter=blob:none --no-checkout --branch "$REF" "$REPO" /opt/home-hub
git -C /opt/home-hub sparse-checkout set --no-cone '/*' '!/design/' '!/site/'
git -C /opt/home-hub reset -q --hard
chmod +x /opt/home-hub/install.sh /opt/home-hub/driver-layer/radios.sh /opt/home-hub/driver-layer/host/firstboot.sh

# get.docker.com ends by starting the daemon, which cannot happen in a chroot; the packages are what matter.
curl -fsSL https://get.docker.com | sh || true
command -v docker >/dev/null || { echo "docker did not install"; exit 1; }

install -m 644 /opt/home-hub/driver-layer/host/home-hub-firstboot.service /etc/systemd/system/home-hub-firstboot.service
systemctl enable docker avahi-daemon home-hub-firstboot

# Elyir's startup from the very first boot, held until the hub answers, as the x86 image does. First boot turns a Pi
# with a screen into a wall (firstboot.sh), whose own service takes over from the splash.
HOME_HUB_DIR=/opt/home-hub /opt/home-hub/startup/splash.sh
install -m 644 /opt/home-hub/startup/elyir-splash.service /etc/systemd/system/elyir-splash.service
systemctl enable elyir-splash.service
