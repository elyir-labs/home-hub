#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The screen on a unit that has one: keep the startup splash up until the product answers, let the
# splash finish, then hand the screen to the panel. elyir-wall.service runs it twice:
#
#   wall.sh wait   as root, before the browser: settles a turn nothing has acted on, waits for the product, tells
#                  the splash, lets it end
#   wall.sh run    as the wall's own user: cage, with Chromium on the panel full screen at the design's size,
#                  turned the way This screen last set it, and screen-helper.py beside it
#   wall.sh speaker   points the wall's sound at the screen's speakers, which `run` does first
#   wall.sh guess     turns a glass made tall a quarter, the first time only, which `wait` has the wall's user do
#
# When only the browser restarts, the splash is long gone and `wait` returns at once, so a screen
# coming back is a few seconds of nothing rather than the whole startup again.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=plymouth/elyir/timing.sh
. "$HERE/plymouth/elyir/timing.sh"
READY_URL=${ELYIR_READY_URL:-http://localhost/alive}
PANEL_URL=${ELYIR_PANEL_URL:-http://localhost/?screen=1}   # a screen: it asks which room it is in (design/companion/, C) and, seeing Linux, brings its own keyboard

# Seconds since the splash first drew, from when systemd says plymouth-start finished.
splash_seconds() {
  local since now
  since=$(systemctl show -p ActiveEnterTimestampMonotonic --value plymouth-start.service 2>/dev/null || echo 0)
  now=$(awk '{print $1}' /proc/uptime)
  awk -v s="${since:-0}" -v n="$now" 'BEGIN { if (s == 0) print 0; else print n - s / 1000000 }'
}

# The panel is drawn for 1440x900, one screen with nothing to scroll. A wall's screen is whatever size it is, so
# Chromium is told how big a CSS pixel is: big enough that the screen is at least 1440 by 900 of them. The 10-inch
# wall at 1920x1200 comes out at exactly 4/3; a 1024x600 test screen at 2/3. Landscape either way round, since a
# DSI panel can report its mode on its side. ELYIR_SCALE overrides it.
scale() {
  local mode s
  for s in /sys/class/drm/card*-*/status; do
    [ "$(cat "$s" 2>/dev/null)" = connected ] && mode=$(head -n1 "$(dirname "$s")/modes" 2>/dev/null) && [ -n "$mode" ] && break
  done
  awk -v m="${mode:-1440x900}" 'BEGIN { split(m, a, "x"); l = a[1] > a[2] ? a[1] : a[2]; t = a[1] > a[2] ? a[2] : a[1]
    s = l / 1440; if (t / 900 < s) s = t / 900; if (s <= 0) s = 1; printf "%.4f", s }'
}

# A wall is touched, not pointed at, but cage draws an arrow whenever a mouse is plugged in -- one used once to set
# the unit up is enough. The panel hides the browser's own pointer; this hides cage's, with a theme in which every
# cursor is a single transparent pixel (an Xcursor file: header, one table entry, one 1x1 image). It has to be the
# theme called "default": cage asks for that one by name and ignores XCURSOR_THEME, and only XCURSOR_PATH says
# where to look.
hidden_cursor() {
  local dir="${XDG_RUNTIME_DIR:-$HOME}/elyir-cursor/default/cursors" name
  mkdir -p "$dir"
  printf 'Xcur\x10\0\0\0\0\0\x01\0\x01\0\0\0\x02\0\xfd\xff\x18\0\0\0\x1c\0\0\0\x24\0\0\0\x02\0\xfd\xff\x18\0\0\0\x01\0\0\0\x01\0\0\0\x01\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0' > "$dir/default"
  for name in left_ptr arrow pointer hand1 hand2 text xterm grab grabbing not-allowed wait progress; do ln -sf default "$dir/$name"; done
  export XCURSOR_PATH="${dir%/default/cursors}" XCURSOR_THEME=default XCURSOR_SIZE=24
}

# Which way up This screen last asked for (screen-helper.py keeps it), as the compositor says it.
transform() {
  case "$(cat "${ELYIR_TURN_FILE:-$HOME/.config/elyir/turn}" 2>/dev/null)" in
    90) echo 90 ;; 180) echo 180 ;; 270) echo 270 ;; *) echo normal ;;
  esac
}

# A turn This screen made that nothing has acted on: a unit set up before turn.sh's watcher existed (an update
# brings the script but never installs the watcher), or one whose touch was left unturned before turn.sh turned it.
# The touch rule names the turn it was written for. Run as root before the wall starts, so cage reads the touch fresh.
settle() {
  local ask="${ELYIR_SCREEN_ASK:-/var/lib/elyir-screen}" rules="${ELYIR_TOUCH_RULES:-/etc/udev/rules.d/90-elyir-touch.rules}"
  local file="${ELYIR_TURN_FILE:-$(getent passwd elyir-wall 2>/dev/null | cut -d: -f6)/.config/elyir/turn}" t
  t=$(tr -cd '0-9' < "$file" 2>/dev/null) || return 0
  [ -n "$t" ] || return 0
  if [ ! -e "$ask/turn.request" ]; then
    if [ "$t" = 0 ]; then [ -e "$rules" ] || return 0; else grep -qs "touch turned $t," "$rules" && return 0; fi
    echo "$t" > "$ask/turn.request" || return 0
  fi
  ELYIR_TURN_REQUEST="$ask/turn.request" "$HERE/turn.sh" || true
}

# The panel is drawn wide, and a tall home is not designed, so a glass made tall (a mode taller than wide, as most
# DSI panels report) can only be hung on its side. The first time the wall starts, before anybody has turned it, it
# turns a quarter and leaves the same turn for turn.sh, so the startup follows from the next start
# (design/sideways-start/, B). A wrong guess is exactly upside down, which the first start's pill answers. Once a
# turn is kept it is the household's, and this never guesses again.
guess() {
  local file="${ELYIR_TURN_FILE:-$HOME/.config/elyir/turn}" ask="${ELYIR_SCREEN_ASK:-/var/lib/elyir-screen}" s mode
  [ -e "$file" ] && return 0
  for s in "${HUB_DRM:-/sys/class/drm}"/card*-*/status; do
    [ "$(cat "$s" 2>/dev/null)" = connected ] && mode=$(head -n1 "$(dirname "$s")/modes" 2>/dev/null) && [ -n "$mode" ] && break
  done
  [ -n "${mode:-}" ] || return 0
  awk -v m="$mode" 'BEGIN { split(m, a, "x"); exit !(a[2] + 0 > a[1] + 0) }' || return 0
  mkdir -p "$(dirname "$file")" && echo 90 > "$file"
  echo 90 > "$ask/turn.request" 2>/dev/null || true
}

# The panel speaks from the screen it was asked at (docs/voice.md), and a Pi sends that down the HDMI cable to the
# screen's own speakers. Its HDMI card takes only IEC958 frames, so a browser left on ALSA's plain default is
# silent; the hdmi: device converts to them. The card is the one on the port that is connected, worked out each
# time the wall starts, since a screen can move ports. A DSI screen, or a box with no such card, is left alone.
speaker() {
  local rc="$HOME/.asoundrc" s port card
  for s in "${HUB_DRM:-/sys/class/drm}"/card*-HDMI-A-*/status; do
    [ "$(cat "$s" 2>/dev/null)" = connected ] || continue
    port=${s%/status}; port=${port##*-}
    [ -e "${HUB_ASOUND:-/proc/asound}/vc4hdmi$((port - 1))" ] && { card=vc4hdmi$((port - 1)); break; }
  done
  if [ -z "${card:-}" ]; then rm -f "$rc"; return; fi
  printf '# Written by startup/wall.sh each time the wall starts.\npcm.!default { type plug; slave.pcm "hdmi:CARD=%s,DEV=0" }\nctl.!default { type hw; card %s }\n' \
    "$card" "$card" > "$rc"
}

browser() {
  local b
  for b in chromium chromium-browser; do command -v "$b" >/dev/null 2>&1 && { echo "$b"; return; }; done
  echo chromium
}

case "${1:-}" in
  wait)
    # the guess is the wall user's to keep, and settled with the rest before cage starts, so its touch is turned too
    home=$(getent passwd elyir-wall 2>/dev/null | cut -d: -f6)
    [ -n "$home" ] && runuser -u elyir-wall -- env HOME="$home" "$0" guess || true
    settle || true
    until curl -fsS -m 2 -o /dev/null "$READY_URL"; do sleep 1; done
    if plymouth --ping 2>/dev/null; then
      plymouth update --status=elyir:ready || true
      # The ending starts once the house has had its moment, and takes ENDING seconds.
      sleep "$(awk -v a="$READY_AFTER" -v s="$(splash_seconds)" -v e="$ENDING" 'BEGIN { w = a - s; if (w < 0) w = 0; print w + e + 0.1 }')"
      plymouth quit --retain-splash || true
    fi ;;
  speaker) speaker ;;
  settle) settle ;;
  guess) guess ;;
  run)
    hidden_cursor
    speaker || true
    # cage runs this script again inside itself, so the display can be scaled before the browser starts.
    exec cage -- "$0" browse "${ELYIR_SCALE:-$(scale)}" ;;
  browse)
    # The scale is set on the display, not in the browser: Chromium on Wayland draws a forced scale under 1 into a
    # corner of the screen, while a scaled output is simply a bigger screen to it.
    for out in $(wlr-randr 2>/dev/null | awk '/^[^ ]/ { print $1 }'); do wlr-randr --output "$out" --scale "$2" --transform "$(transform)" || true; done
    ELYIR_PANEL_URL="$PANEL_URL" python3 "$HERE/screen-helper.py" &
    # Chromium locks its profile under this machine's name and refuses to start, exit 21, when the name has changed
    # since -- which first boot does, to hub or to screen. Only this service runs a browser as this user, one at a
    # time, so a lock found here is always left over.
    rm -f "${XDG_CONFIG_HOME:-$HOME/.config}"/chromium/Singleton{Lock,Cookie,Socket}
    # A desktop browser ignores the panel's user-scalable=no, so a stray two-finger touch would zoom
    # the wall and a sideways swipe would go back a page; both are switched off here instead. Nobody may be standing
    # at the wall when it is asked to speak, so a sound plays without a tap first, as the Android kiosk's does.
    exec "$(browser)" --kiosk --noerrdialogs --disable-infobars --no-first-run \
      --ozone-platform=wayland --disable-session-crashed-bubble --check-for-update-interval=31536000 \
      --disable-pinch --overscroll-history-navigation=0 --autoplay-policy=no-user-gesture-required \
      "$PANEL_URL" ;;
  *) echo "usage: $0 wait|run|speaker|settle|guess|browse <scale>" >&2; exit 2 ;;
esac
