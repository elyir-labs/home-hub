#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Says when the machine has a change waiting for it to start again, so the Restart row on The hub can say so
# and the hub can do it in the night if nobody does (design/restart/). home-hub-owed.timer runs this every
# few minutes. brain-data/reboot.json holds one word from a fixed set, or is not there; the brain reads it,
# never writes it, and shows its own sentence for the word rather than anything written here.
#
#   update   the system says so (/run/reboot-required), or the kernel running is no longer the one installed
#   change   the boot settings (config.txt, cmdline.txt) changed since this boot: the hardware watchdog
#            harden.sh turns on, the way the screen is turned, or somebody's own edit
#
# Safe to run by hand.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
OUT="$DIR/driver-layer/brain-data/reboot.json"
RUN="${HUB_RUN:-/run}"
MODULES="${HUB_MODULES:-/lib/modules}"
BOOT="${HUB_BOOT:-/boot/firmware /boot}"
STAT="${HUB_STAT:-/proc/stat}"
KERNEL="${HUB_KERNEL:-$(uname -r)}"

booted="$(awk '/^btime/ { print $2 }' "$STAT" 2>/dev/null)"
why=""
if [ -e "$RUN/reboot-required" ] || { [ -d "$MODULES" ] && [ ! -d "$MODULES/$KERNEL" ]; }; then
  why=update
elif [ -n "$booted" ]; then
  for d in $BOOT; do
    for f in "$d/config.txt" "$d/cmdline.txt"; do
      [ -f "$f" ] || continue
      # `date -r` rather than stat, whose flags differ between GNU and BSD.
      [ "$(date -r "$f" +%s 2>/dev/null || echo 0)" -gt "$booted" ] && why=change
    done
  done
fi

if [ -z "$why" ]; then rm -f "$OUT"; exit 0; fi
want="{\"why\":\"$why\",\"booted\":${booted:-null}}"
# Only when it changes, so a hub waiting days for a night it can restart in is not writing every five minutes.
[ "$(cat "$OUT" 2>/dev/null)" = "$want" ] && exit 0
mkdir -p "$(dirname "$OUT")"
printf '%s\n' "$want" > "$OUT.new" && mv "$OUT.new" "$OUT"
