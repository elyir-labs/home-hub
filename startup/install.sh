#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Gives a unit with its own screen Elyir's startup: a quiet boot, the splash from startup/, and the
# panel full screen once the product answers. Run once, as root, from first boot when a screen is
# connected (driver-layer/host/firstboot.sh), or by hand; running it again brings the splash up to
# date with this checkout.
set -euo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
HERE="$DIR/startup"
log() { printf '[startup] %s\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

log "packages: a one-window compositor, its display scaling and a browser"
export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends cage wlr-randr curl >/dev/null
apt-get install -y --no-install-recommends chromium >/dev/null 2>&1 \
  || apt-get install -y --no-install-recommends chromium-browser >/dev/null

HOME_HUB_DIR="$DIR" "$HERE/splash.sh"

log "the screen's own user and service"
id elyir-wall >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin elyir-wall
usermod -aG video,render,input elyir-wall
cat > /etc/pam.d/elyir-wall <<'PAM'
auth     required pam_unix.so nullok
account  required pam_unix.so
session  required pam_unix.so
session  required pam_systemd.so
PAM
install -m 0644 "$HERE/elyir-wall.service" /etc/systemd/system/elyir-wall.service
# The wall ends the splash itself, onto the panel.
systemctl disable elyir-splash.service >/dev/null 2>&1 || true

log "the hub, reachable even when its name stops answering"
"$DIR/driver-layer/host/wifi-awake.sh" || true
install -m 0644 "$HERE/elyir-keep-hub.service" "$HERE/elyir-keep-hub.timer" /etc/systemd/system/
# avahi would otherwise say this screen is also at Docker's internal address, which nothing else can reach.
AVAHI_CONF=/etc/avahi/avahi-daemon.conf
if [ -f "$AVAHI_CONF" ] && ! grep -q '^deny-interfaces=' "$AVAHI_CONF"; then
  sed -i 's/^#\?deny-interfaces=.*/deny-interfaces=docker0/' "$AVAHI_CONF"
  grep -q '^deny-interfaces=' "$AVAHI_CONF" || sed -i '/^\[server\]/a deny-interfaces=docker0' "$AVAHI_CONF"
  systemctl try-restart avahi-daemon >/dev/null 2>&1 || true
fi

log "this screen's own updates, following its hub"
install -m 0644 "$HERE/elyir-screen-update.service" "$HERE/elyir-screen-update.timer" \
               "$HERE/elyir-screen-report.service" "$HERE/elyir-screen-report.timer" /etc/systemd/system/

systemctl daemon-reload
systemctl enable elyir-wall.service >/dev/null
systemctl enable --now elyir-keep-hub.timer >/dev/null 2>&1 || true
systemctl enable --now elyir-screen-update.timer >/dev/null 2>&1 || true
systemctl enable --now elyir-screen-report.timer >/dev/null 2>&1 || true
log "done; it shows from the next boot"
