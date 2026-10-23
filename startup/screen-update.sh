#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Keeps a screen's own part current. The panel on a screen is always its hub's, served by the hub; what
# runs on the unit itself -- the startup, the wall, what keeps the hub reachable -- is whatever its image
# carried, because first boot switches off every update a hub has (driver-layer/host/firstboot.sh). This
# is the update a screen has instead.
#
# A screen follows its hub, not the newest release, so the two never disagree: the hub says which
# version it runs (/alive), and that release is checked against the same signed record and the same keys
# a hub checks it against (driver-layer/host/verify.sh) before anything moves. A screen built from a
# branch follows that branch, as a hub would (install.sh).
#
# elyir-screen-update.timer runs it as root after the hub's own window in the small hours. When the
# startup changed, the wall restarts then, while nobody is looking; a wall that does not come back is put
# back, and that version is not tried again on its own. Safe to run by hand:
#   sudo systemctl start elyir-screen-update
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
CONF="${HUB_CONF:-/etc/home-hub.conf}"
STATE="${HUB_STATE:-/var/lib/home-hub}"
REFUSED="$STATE/screen-update.refused"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
log() { printf '[screen] %s\n' "$*"; }

# A hub's own screen moves with the hub's install.sh; only another hub's screen has nobody else to do it.
[ "${HUB_ROLE:-}" = screen ] && [ -n "${ELYIR_READY_URL:-}" ] && [ -d "$DIR/.git" ] || exit 0
# shellcheck source=driver-layer/host/verify.sh
. "$DIR/driver-layer/host/verify.sh"

# Taken once from the code this unit was set up with, as a hub's first install takes them.
if [ ! -d "$KEYS" ] && ls "$DIR"/driver-layer/host/release-keys.d/*.pub >/dev/null 2>&1; then
  mkdir -p "$KEYS" && cp "$DIR"/driver-layer/host/release-keys.d/*.pub "$KEYS"/ && chmod 0644 "$KEYS"/*.pub
fi

BRANCH=""
case "${HOME_HUB_CHANNEL:-release}" in main|development) BRANCH="$HOME_HUB_CHANNEL" ;; esac
[ -n "${HOME_HUB_BRANCH:-}" ] && BRANCH="$HOME_HUB_BRANCH"
# shellcheck source=driver-layer/host/landed.sh
. "$DIR/driver-layer/host/landed.sh"
if [ -n "${HOME_HUB_BRANCH:-}" ] && landed "$HOME_HUB_BRANCH" "$DIR"; then
  log "$HOME_HUB_BRANCH has landed in development; following development from now on"
  BRANCH=development
  { grep -v '^HOME_HUB_BRANCH=' "$CONF"; echo 'HOME_HUB_BRANCH="development"'; } > "$CONF.new" && mv "$CONF.new" "$CONF"
fi

if [ -n "$BRANCH" ]; then
  git -C "$DIR" fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null \
    || { log "could not reach $BRANCH; staying as it is"; exit 0; }
  target="$(git -C "$DIR" rev-parse "origin/$BRANCH")"; name="$BRANCH"
else
  version="$(curl -fsS -m 10 "$ELYIR_READY_URL" 2>/dev/null | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')"
  # A hub on a branch is a hub being worked on, and there is nothing signed to check a branch against.
  printf '%s' "$version" | grep -Eq '^v?[0-9]+\.[0-9]+' \
    || { log "the hub is not on a release (${version:-no answer}); staying as it is"; exit 0; }
  tag="v${version#v}"
  git -C "$DIR" fetch -q --tags --force origin 2>/dev/null || { log "could not fetch releases; staying as it is"; exit 0; }
  [ "$(git -C "$DIR" rev-parse HEAD)" = "$(git -C "$DIR" rev-list -n 1 "$tag" 2>/dev/null)" ] && exit 0
  verify_release "$tag" "$DIR" || { log "$tag could not be checked; staying as it is"; exit 0; }
  target="$VERIFIED_COMMIT"; name="$tag"
fi

from="$(git -C "$DIR" rev-parse HEAD)"
[ "$from" = "$target" ] && exit 0
[ "$(cat "$REFUSED" 2>/dev/null)" = "$target" ] && { log "$name did not come back last time; staying as it is"; exit 0; }

move() { git -C "$DIR" reset -q --hard "$1" && git -C "$DIR" clean -qfd -e driver-layer/; }
move "$target" || { log "could not move the code to $name"; move "$from"; exit 1; }
log "now on $name"
git -C "$DIR" diff --quiet "$from" "$target" -- startup/ driver-layer/host/wifi-awake.sh && exit 0

wall() { HOME_HUB_DIR="$DIR" "$DIR/startup/install.sh" >/dev/null && systemctl restart elyir-wall.service; }
# Restart=always hides a wall that keeps falling over behind "activating", so it has to stay up and stop restarting.
came_back() {
  local n
  sleep "${SCREEN_SETTLE:-60}"
  n="$(systemctl show -p NRestarts --value elyir-wall.service)"
  sleep "${SCREEN_WATCH:-30}"
  [ "$(systemctl is-active elyir-wall.service)" = active ] \
    && [ "$(systemctl show -p NRestarts --value elyir-wall.service)" = "$n" ]
}
if wall && came_back; then log "the wall is back, on $name"; exit 0; fi

log "the wall did not come back on $name; putting the last one back"
mkdir -p "$STATE" && echo "$target" > "$REFUSED"
move "$from" && wall
exit 1
