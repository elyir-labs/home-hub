#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The TV's own remote, and the TV's power and input, over HDMI-CEC (design/living-room/). A mini PC's HDMI
# rarely carries CEC, so a Pulse-Eight USB adapter sits in the cable to the TV; a box whose HDMI does carry it is
# claimed the same way. 70-elyir-cec.rules starts the first two when the adapter appears.
#
#   cec.sh attach <tty>   the Pulse-Eight is a serial line until inputattach makes it a CEC device; runs while plugged in
#   cec.sh claim <cec>    tells the TV this is a player called Elyir, and has its remote arrive as the panel's keys
#   cec.sh tv on|off|show|status   wakes the TV, puts it to sleep, switches it to this box, or says whether it is on
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
DRM=${HUB_DRM:-/sys/class/drm}
CEC=${ELYIR_CEC:-/dev/cec0}

edid() {
  local s
  for s in "$DRM"/card*-HDMI-A-*/status; do
    [ "$(cat "$s" 2>/dev/null)" = connected ] && { echo "${s%/status}/edid"; return; }
  done
  return 1
}

# The remote's keys arrive through the adapter's own rc device, which hangs off the same parent.
rc_of() {
  local dev r
  dev=$(readlink -f "${HUB_CEC_SYS:-/sys/class/cec}/${1##*/}/device" 2>/dev/null) || return 1
  for r in "${HUB_RC_SYS:-/sys/class/rc}"/rc*; do
    [ "$(readlink -f "$r/device" 2>/dev/null)" = "$dev" ] && { echo "${r##*/}"; return; }
  done
  return 1
}

claim() {
  local d=$1 e rc pa=()
  # A USB adapter cannot see the HDMI lines it sits on, so it is told its place from the TV's EDID; a GPU's own
  # CEC is told by its driver.
  if cec-ctl -d "$d" | grep -q 'Driver.*pulse8' && e=$(edid); then pa=(--phys-addr-from-edid "$e"); fi
  cec-ctl -d "$d" --playback --osd-name Elyir ${pa[@]+"${pa[@]}"} >/dev/null
  rc=$(rc_of "$d") && ir-keytable -s "$rc" -c -w "$HERE/cec-keys.toml" >/dev/null
}

tv() {
  local pa
  case "${1:-}" in
    on) cec-ctl -d "$CEC" --to 0 --image-view-on >/dev/null ;;
    off) cec-ctl -d "$CEC" --to 0 --standby >/dev/null ;;
    show)
      pa=$(cec-ctl -d "$CEC" | sed -n 's/^[[:space:]]*Physical Address[[:space:]]*: \([0-9a-f.]*\)$/\1/p' | head -n1)
      cec-ctl -d "$CEC" --to 0 --image-view-on >/dev/null
      cec-ctl -d "$CEC" --to 15 --active-source "phys-addr=$pa" >/dev/null ;;
    status) cec-ctl -d "$CEC" --to 0 --give-device-power-status | sed -n 's/.*pwr-state: \(.*\) (0x.*/\1/p' | head -n1 ;;
    *) echo "usage: $0 tv on|off|show|status" >&2; exit 2 ;;
  esac
}

case "${1:-}" in
  attach) exec inputattach --pulse8-cec "$2" ;;
  claim) claim "$2" ;;
  tv) tv "${2:-}" ;;
  *) echo "usage: $0 attach <tty>|claim <cec>|tv on|off|show|status" >&2; exit 2 ;;
esac
