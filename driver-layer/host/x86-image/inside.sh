#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Runs inside the x86 image, in build.sh's chroot: what a NUC needs that a cloud VM does not, then
# the hub's code and its first-boot unit. Everything else happens on the hub's first boot (firstboot.sh).
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive
. /etc/home-hub.conf

# The cloud image's kernel is the virtual flavor, which leaves out the drivers for real Wi-Fi cards and
# the firmware they load. NetworkManager runs every link, cable and Wi-Fi alike, because host/network.sh
# is the one thing that talks to the network and it speaks nmcli. iw and dnsmasq are the hub's own
# setup Wi-Fi (docs/network.md, piece 5).
# A hub has no screen to drive and no data-center card to run, and that firmware is most of linux-firmware's size,
# already compressed, so it is most of the image's too. Every Wi-Fi, Bluetooth and Ethernet chip's stays. dpkg
# leaves these paths out now and on every upgrade after.
{
  echo "# home-hub: a headless hub never loads these (driver-layer/host/x86-image/inside.sh)"
  for d in nvidia amdgpu radeon i915 xe qcom mellanox netronome liquidio qed cxgb4 cirrus intel/ipu intel/vpu \
           ti-keystone dpaa2 mrvl/prestera ueagle-atm vsc nxp/sdma imx; do
    printf 'path-exclude=/lib/firmware/%s/*\npath-exclude=/usr/lib/firmware/%s/*\n' "$d" "$d"
  done
} > /etc/dpkg/dpkg.cfg.d/90-home-hub-firmware

# Snaps are not how anything on a hub is installed, and the cloud image seeds several.
apt-get purge -y snapd || true
rm -rf /var/lib/snapd /snap /var/snap /var/cache/snapd

apt-get update
apt-get install -y --no-install-recommends linux-generic linux-firmware wireless-regdb network-manager wpasupplicant \
  iw dnsmasq-base avahi-daemon git curl ca-certificates python3 cloud-guest-utils
curl -fsSL https://get.docker.com | sh || true
command -v docker >/dev/null || { echo "docker did not install"; exit 1; }

rm -f /etc/netplan/*.yaml
printf 'network:\n  version: 2\n  renderer: NetworkManager\n' > /etc/netplan/01-home-hub.yaml
chmod 600 /etc/netplan/01-home-hub.yaml
# No cloud to ask for a configuration, and waiting for one on every boot would be minutes of nothing.
touch /etc/cloud/cloud-init.disabled
systemctl disable systemd-networkd.service systemd-networkd-wait-online.service >/dev/null 2>&1 || true
# Like the Pi image: no login, no SSH. Nothing on the hub needs either.
systemctl disable ssh.service ssh.socket >/dev/null 2>&1 || true

echo hub > /etc/hostname
sed -i 's/^127\.0\.1\.1.*/127.0.1.1\thub/' /etc/hosts; grep -q '^127\.0\.1\.1' /etc/hosts || printf '127.0.1.1\thub\n' >> /etc/hosts

git clone --depth 1 --branch "$HOME_HUB_REF" "$HOME_HUB_REPO" /opt/home-hub
chmod +x /opt/home-hub/install.sh /opt/home-hub/driver-layer/radios.sh /opt/home-hub/driver-layer/host/firstboot.sh
install -m 644 /opt/home-hub/driver-layer/host/home-hub-firstboot.service /etc/systemd/system/home-hub-firstboot.service
systemctl enable docker avahi-daemon NetworkManager home-hub-firstboot

# Every unit its own: a machine id made on first boot names the hub's setup Wi-Fi, among other things.
du -sh /usr/lib/firmware /usr/lib/modules /var/lib/home-hub/preload /usr/bin/docker* /var 2>/dev/null || true
apt-get clean; rm -rf /var/lib/apt/lists/*
truncate -s 0 /etc/machine-id; rm -f /var/lib/dbus/machine-id
