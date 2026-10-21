#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Tells the startup splash what a first start is doing (design/first-start/, A with B's quieter line, and Ready).
# Each step calls it as the step starts, so the line under the house is never a guess. With no splash up -- an
# update, a hub with no screen, an install by hand -- it does nothing, quietly.
#
#   say.sh step preparing|moving|downloading|starting
#   say.sh first      at the very start of a boot: marks it a first start, and says it is getting ready
#   say.sh end        once the hub answers: a first start ends on where to go next, any other start as it always has
set -uo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CONF="${HUB_CONF:-/etc/home-hub.conf}"
DONE="${HUB_FIRSTBOOT_DONE:-/var/lib/home-hub/firstboot.done}"
FIRST="${ELYIR_FIRST:-/run/elyir-first-start}"
READY_URL=${ELYIR_READY_URL:-http://localhost/alive}

up() { command -v plymouth >/dev/null 2>&1 && plymouth --ping 2>/dev/null; }
tell() { plymouth update --status="$1" 2>/dev/null || true; }
# This hub's own words go a character at a time: Plymouth's scripts can read a string no other way.
spell() { local s="$2" i; tell "elyir:$1"; for ((i = 0; i < ${#s}; i++)); do tell "elyir:c:${s:i:1}"; done; }
conf() { sed -n "s/^$1=//p" "$CONF" 2>/dev/null | tail -1 | tr -d '"'; }

case "${1:-}" in
  step)
    case "${2:-}" in preparing|moving|downloading|starting) ;; *) echo "say.sh: no step called ${2:-}" >&2; exit 2 ;; esac
    up && tell "elyir:step:$2" ;;
  first)
    [ -e "$DONE" ] && exit 0
    mkdir -p "$(dirname "$FIRST")" && : > "$FIRST"
    up && tell "elyir:step:preparing" ;;
  end)
    [ -e "$FIRST" ] || exec "$HERE/wall.sh" wait
    until curl -fsS -m 2 -o /dev/null "$READY_URL"; do sleep 1; done
    up || exit 0
    tell "elyir:step:starting"
    # On a network, its address; on nothing, the Wi-Fi it makes of its own, which a flashed NUC has no label for.
    if ip -4 route show default 2>/dev/null | grep -q . || [ -z "$(conf HUB_SETUP_SSID)" ]; then
      spell addr "$(hostname 2>/dev/null || echo hub).local"
    else
      spell wifi "$(conf HUB_SETUP_SSID)"
      spell pass "$(conf HUB_SETUP_PASS)"
    fi
    tell "elyir:hello" ;;
  *) echo "usage: $0 step <name> | first | end" >&2; exit 2 ;;
esac
exit 0
