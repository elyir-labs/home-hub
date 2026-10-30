#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Turns the startup too, once somebody has turned the screen on This screen (design/this-screen/, A).
# screen-helper.py turns the panel itself, but the splash is drawn before the panel's compositor starts, by
# Plymouth straight onto the display, so the panel's turn never reaches it. Plymouth, and the kernel's own
# console, follow the display's "panel orientation" instead, which the boot line can set for any screen:
# video=<connector>:panel_orientation=... elyir-screen-turn.path starts this when the helper leaves
# turn.request, which holds one of four numbers. It shows from the next start.
#
# Only a Pi's boot line, for now. A PC's GRUB starts on simpledrm, whose one screen has no connector name to
# give the orientation to.
#
# The touch is turned here too, at once. cage turns what is drawn and nothing else, so a touchscreen kept reporting
# where its glass was made to be touched, and a tap landed where the button was before the turn.
set -uo pipefail
REQ="${ELYIR_TURN_REQUEST:-/var/lib/elyir-screen/turn.request}"
CMD="${ELYIR_CMDLINE:-/boot/firmware/cmdline.txt}"
DRM="${HUB_DRM:-/sys/class/drm}"
RULES="${ELYIR_TOUCH_RULES:-/etc/udev/rules.d/90-elyir-touch.rules}"
INPUT="${HUB_INPUT:-/sys/class/input}"
UDEVADM="${HUB_UDEVADM:-udevadm}"
log() { printf '[screen] %s\n' "$*"; }

[ -f "$REQ" ] || exit 0
TURN="$(head -c 8 "$REQ" | tr -cd '0-9')"
rm -f "$REQ"
# The same direction the compositor's transform means: a display hung with its left side up shows the
# picture turned a quarter the other way, which is the panel's 90. TOUCH is libinput's calibration matrix for the
# same turn, from where the glass reports a touch to where that point now is in the turned picture.
case "$TURN" in
  0) WAY='' TOUCH='' ;;
  90) WAY=left_side_up TOUCH="0 1 0 -1 0 1" ;;
  180) WAY=upside_down TOUCH="-1 0 1 0 -1 1" ;;
  270) WAY=right_side_up TOUCH="0 -1 1 1 0 0" ;;
  *) log "asked to turn by '$TURN', which is not a quarter"; exit 1 ;;
esac

# Every touchscreen, whichever screen it belongs to: a unit has one. libinput reads the matrix only when a device
# arrives, so each touchscreen is made to leave and come back, which the running compositor follows.
if [ -n "$TOUCH" ]; then
  mkdir -p "$(dirname "$RULES")"
  printf '# Written by startup/turn.sh: touch turned %s, the way the screen is.\nSUBSYSTEM=="input", ENV{ID_INPUT_TOUCHSCREEN}=="1", ENV{LIBINPUT_CALIBRATION_MATRIX}="%s"\n' \
    "$TURN" "$TOUCH" > "$RULES"
else
  rm -f "$RULES"
fi
if command -v "$UDEVADM" >/dev/null 2>&1; then
  "$UDEVADM" control --reload 2>/dev/null || true
  for e in "$INPUT"/event*; do
    "$UDEVADM" info -q property "$e" 2>/dev/null | grep -qx 'ID_INPUT_TOUCHSCREEN=1' || continue
    "$UDEVADM" trigger --action=remove "$e" && "$UDEVADM" trigger --action=add "$e" || true
  done
  log "touch turned ${TURN}"
fi
[ -f "$CMD" ] || { log "no boot line here ($CMD), so the startup stays the way it is"; exit 0; }

# The screens plugged in now, by the names the kernel gives them on the boot line (card1-HDMI-A-1 is HDMI-A-1).
connected=()
for s in "$DRM"/card*-*/status; do
  [ "$(cat "$s" 2>/dev/null)" = connected ] || continue
  c=${s%/status}; c=${c##*/}; connected+=("${c#card*-}")
done
[ ${#connected[@]} -gt 0 ] || { log "no screen is plugged in, so the boot line is left alone"; exit 0; }
is_connected() { local c; for c in "${connected[@]}"; do [ "$c" = "$1" ] && return 0; done; return 1; }

# Each connected screen's video= keeps whatever else it says (a mode, a margin) and loses only its old
# orientation. The kernel reads the first video= for a connector, so one is changed rather than another added.
out=() seen=()
for w in $(head -n1 "$CMD"); do
  case "$w" in
    video=*:*)
      c=${w#video=}; c=${c%%:*}
      if is_connected "$c"; then
        rest=${w#video=*:}
        rest=$(printf '%s' "$rest" | tr ',' '\n' | grep -v '^panel_orientation=' | paste -sd, -)
        [ -n "$WAY" ] && rest="${rest:+$rest,}panel_orientation=$WAY"
        [ -n "$rest" ] && out+=("video=$c:$rest")
        seen+=("$c"); continue
      fi ;;
  esac
  out+=("$w")
done
if [ -n "$WAY" ]; then
  for c in "${connected[@]}"; do
    case " ${seen[*]:-} " in *" $c "*) ;; *) out+=("video=$c:panel_orientation=$WAY") ;; esac
  done
fi
printf '%s\n' "${out[*]}" > "$CMD.new" && mv "$CMD.new" "$CMD"
log "the startup is turned ${TURN} from the next start (${connected[*]})"
