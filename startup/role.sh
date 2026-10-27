#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Changes what this unit is, because somebody standing at its screen asked on This screen
# (design/this-screen/, A): the house's hub, or a screen for another hub. elyir-screen-role.path starts
# it when screen-helper.py leaves role.request; the file holds one word and is checked against two.
#
# It does not do the change itself. First boot already knows how to make a unit either one
# (driver-layer/host/firstboot.sh), so this says which, takes away first boot's mark and runs it again.
# A unit that stops being the hub keeps its house on disk, so becoming the hub again brings it back.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
CONF="${HUB_CONF:-/etc/home-hub.conf}"
REQ="${ELYIR_ROLE_REQUEST:-/var/lib/elyir-screen/role.request}"
MARK="${HUB_FIRSTBOOT_MARK:-/var/lib/home-hub/firstboot.done}"
log() { printf '[screen] %s\n' "$*"; }

[ -f "$REQ" ] || exit 0
WORD="$(head -c 16 "$REQ" | tr -cd 'a-z')"
rm -f "$REQ"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
NOW=hub; [ "${HUB_ROLE:-}" = screen ] && NOW=screen

set_conf() { { grep -v "^$1=" "$CONF" 2>/dev/null || true; echo "$1=\"$2\""; } > "$CONF.new" && mv "$CONF.new" "$CONF"; }
drop_conf() { { grep -v "^$1=" "$CONF" 2>/dev/null || true; } > "$CONF.new" && mv "$CONF.new" "$CONF"; }
again() { rm -f "$MARK"; HUB_AUTO_NVME=0 HOME_HUB_DIR="$DIR" HUB_CONF="$CONF" HUB_FIRSTBOOT_MARK="$MARK" "$DIR/driver-layer/host/firstboot.sh"; }

case "$WORD" in
  hub)
    [ "$NOW" = screen ] || { log "already the hub"; exit 0; }
    log "asked on the screen: run a house here"
    set_conf HUB_ROLE hub; drop_conf ELYIR_PANEL_URL; drop_conf ELYIR_READY_URL
    systemctl disable --now elyir-screen-update.timer >/dev/null 2>&1 || true
    # dark until this unit's own house answers, rather than showing the other hub's while it installs
    systemctl restart elyir-wall.service >/dev/null 2>&1 || true
    again ;;
  screen)
    [ "$NOW" = hub ] || { log "already a screen"; exit 0; }
    # checked here as well as on the screen: a unit told it is a screen with no hub to show keeps looking at every start
    FIND_FOR=10 "$DIR/startup/find-hub.sh" >/dev/null || { log "no other hub on this Wi-Fi: this unit stays the hub"; exit 1; }
    log "asked on the screen: show another hub's house"
    set_conf HUB_ROLE screen
    if again; then systemctl restart elyir-wall.service >/dev/null 2>&1 || true
    else log "it could not become a screen, so it stays the hub"; set_conf HUB_ROLE hub; touch "$MARK"; exit 1; fi ;;
  *)
    log "asked to become '$WORD', which is not something this unit can be"; exit 1 ;;
esac
