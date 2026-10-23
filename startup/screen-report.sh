#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Tells this screen's hub what it runs, once a minute, and updates now when the hub asks
# (design/developer/, B: Screens in this house, Update now).
#
# The wall's browser holds the screen's place in the house; this unit does not, and should not borrow it.
# So it names itself with a random id and a key of its own, made once and kept by root, and the hub knows
# it by the first key it gave (brain/hub/developer.py). The answer can only ever start screen-update.sh,
# which moves only to the hub's checked release or along this screen's own branch.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
CONF="${HUB_CONF:-/etc/home-hub.conf}"
STATE="${HUB_STATE:-/var/lib/home-hub}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
[ "${HUB_ROLE:-}" = screen ] && [ -n "${ELYIR_READY_URL:-}" ] && [ -d "$DIR/.git" ] || exit 0
HUB="${ELYIR_READY_URL%/alive}"

ID="$STATE/screen.id"
if [ ! -s "$ID" ]; then
  mkdir -p "$STATE" && (umask 077; printf '%s %s\n' "$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')" \
    "$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')" > "$ID")
fi
read -r unit key < "$ID"

channel=release
case "${HOME_HUB_CHANNEL:-}" in main|development) channel="$HOME_HUB_CHANNEL" ;; esac
[ -n "${HOME_HUB_BRANCH:-}" ] && channel="$HOME_HUB_BRANCH"
commit="$(git -C "$DIR" rev-parse HEAD 2>/dev/null)"
version="$(git -C "$DIR" describe --tags --exact-match 2>/dev/null || echo "$channel-${commit:0:7}")"
updating=false
case "$(systemctl is-active elyir-screen-update.service 2>/dev/null)" in active|activating) updating=true ;; esac

body="$(python3 -I -c 'import json, sys; u, k, h, v, c, ch, up = sys.argv[1:]
print(json.dumps({"unit": u, "key": k, "host": h, "version": v, "commit": c, "channel": ch, "updating": up == "true"}))' \
  "$unit" "$key" "$(hostname).local" "$version" "$commit" "$channel" "$updating")"
reply="$(curl -fsS -m 10 -H 'Content-Type: application/json' -d "$body" "$HUB/screens/report" 2>/dev/null)" || exit 0
case "$reply" in *'"update": true'*|*'"update":true'*) systemctl start --no-block elyir-screen-update.service ;; esac
exit 0
