#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The light strip's shipped image, as one file: what a strip is first flashed with, and what the hub
# offers a strip that is behind (brain/hub/bridge_updates.py, StripKind).
#
#   tools/build-strip.sh                    the devkit's image, into releases/strip/esp32s3-ship.bin
#   tools/build-strip.sh roofbox            the roofline's devkit box, into esp32s3-roofbox-ship.bin
#   tools/build-strip.sh [board] --dirty    build anyway from an unclean tree, and say so in the stamp
#
# ONE IMAGE PER BOARD. The same firmware is built for more than one board, each under its own project
# name, and a strip refuses an image built for another (main/fwupdate.cpp). The hub offers each strip
# the release for the board it says it is (bridge_updates.py, StripKind), so each board has its own
# file here. Rev A is left out until it has a board to run on.
#
# The same shape as tools/build-bridge.sh, and the same reason to refuse an unclean tree: the stamp
# names a commit, and a stamp the image does not match is worse than none. ESP-IDF rather than
# PlatformIO, so it wants the environment strip/firmware/README.md describes; this sets it up the way
# that README does rather than trusting whatever shell it was run from.
set -euo pipefail
cd "$(dirname "$0")/.."
F=strip/firmware
OUT=releases/strip

BOARD=devkit
for a in "$@"; do case "$a" in --dirty) ;; devkit|roofbox) BOARD=$a ;;
  *) echo "build-strip.sh: $a is not a board this builds (devkit, roofbox) or --dirty"; exit 2 ;; esac; done
DIRTY_OK=no; for a in "$@"; do [ "$a" = --dirty ] && DIRTY_OK=yes; done

STAMP="$(git rev-parse --short HEAD)"
DIRTY="$(git status --porcelain -- "$F/main" "$F/CMakeLists.txt" "$F/sdkconfig.defaults" "$F"/sdkconfig.defaults.* "$F"/*.csv)"
if [ -n "$DIRTY" ]; then
  if [ "$DIRTY_OK" != yes ]; then
    echo "The firmware sources are not clean, so a release built now would claim $STAMP and not be it:"
    echo "$DIRTY" | sed 's/^/    /'
    echo
    echo "Commit them, stash them, or build anyway with:  tools/build-strip.sh $BOARD --dirty"
    exit 2
  fi
  STAMP="$STAMP+dirty"
  echo "building from an unclean tree; stamping $STAMP"
fi

export IDF_PYTHON_ENV_PATH="${IDF_PYTHON_ENV_PATH:-$HOME/.espressif/python_env/idf6.0_py3.10_env}"
# Not under -u: esp-matter's export.sh reads ESP_MATTER_PATH before it sets it.
set +u
# shellcheck disable=SC1091
. "${IDF_PATH:-$HOME/esp/esp-idf-v6.0.2}/export.sh" >/dev/null 2>&1
# shellcheck disable=SC1091
. "$HOME/esp/esp-matter/export.sh" >/dev/null 2>&1
set -u

# A release is never a test build and never a board's pin. sdkconfig is not in git, so a checkout that
# built before a default changed still carries the old answer; the two settings a release cannot ship
# without are checked by name rather than trusted.
# The devkit builds where it always has, with the sdkconfig beside the sources; any other board in a
# build directory of its own with its own sdkconfig (CMakeLists.txt), made on its first build.
if [ "$BOARD" = devkit ]; then BUILD=build; PROJECT=strip; NAME=esp32s3-ship; IDF=(idf.py)
else BUILD=build-$BOARD; PROJECT=strip-$BOARD; NAME=esp32s3-$BOARD-ship; IDF=(idf.py -B "$BUILD" -DSTRIP_BOARD="$BOARD"); fi
cd "$F"
[ "$BOARD" = devkit ] || [ -f "$BUILD/sdkconfig" ] || "${IDF[@]}" set-target esp32s3 >/dev/null
CONF=$([ "$BOARD" = devkit ] && echo sdkconfig || echo "$BUILD/sdkconfig")
for want in CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y; do
  grep -qx "$want" "$CONF" 2>/dev/null || {
    echo "$CONF lacks $want -- it predates sdkconfig.defaults. Remove it and run ${IDF[*]} set-target esp32s3."; exit 1; }
done
grep -q '^CONFIG_ENABLE_OTA_REQUESTOR=y' "$CONF" && {
  echo "$CONF still turns Matter's own updates on. Remove it and run ${IDF[*]} set-target esp32s3."; exit 1; }
"${IDF[@]}" -DSTRIP_FW= -DDATA_PIN= -DSELFTEST= build >/dev/null
cd - >/dev/null

FW=$(sed -n 's/^#define STRIP_FW "\(.*\)"/\1/p' "$F/main/fwupdate.h")
grep -aq "$FW  chip" "$F/$BUILD/$PROJECT.bin" || { echo "the image does not say it is $FW"; exit 1; }
grep -aq "$PROJECT" "$F/$BUILD/$PROJECT.bin" || { echo "the image does not say it is $PROJECT"; exit 1; }
mkdir -p "$OUT"
# flash_args is ESP-IDF's own list of what goes where (bootloader 0x0, table 0x8000, otadata 0xf000,
# app 0x20000) with the flash settings in front, so the offsets are never restated here.
(cd "$F/$BUILD" && python -m esptool --chip esp32s3 merge-bin -o "$OLDPWD/$OUT/$NAME.bin" @flash_args >/dev/null)
cat > "$OUT/$NAME.json" <<JSON
{"env": "$PROJECT", "board": "$BOARD", "chip": "esp32s3", "fw": "$FW", "offset": 0, "flash_mode": "dio", "flash_freq": "80m", "flash_size": "8MB",
 "sha256": "$(shasum -a 256 "$OUT/$NAME.bin" | cut -d' ' -f1)", "built": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "commit": "$STAMP"}
JSON
ls -la "$OUT/$NAME.bin"; cat "$OUT/$NAME.json"
