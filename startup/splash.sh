#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Elyir's startup splash, and a boot that says nothing of its own around it, on whatever starts the unit: a
# Pi's boot settings or a PC's GRUB. The maker's logo is the firmware's and stays; ours follows it with
# nothing in between. install.sh runs this on a unit with its own screen, and the x86 image when it is built,
# because a monitor on a NUC is the first thing somebody setting one up looks at. Running it again changes nothing.
set -euo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
HERE="$DIR/startup"
THEME=/usr/share/plymouth/themes/elyir
log() { printf '[startup] %s\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get install -y --no-install-recommends plymouth >/dev/null

log "the splash"
rm -rf "$THEME"; mkdir -p "$THEME"
cp "$HERE"/plymouth/elyir/*.png "$HERE"/plymouth/elyir/elyir.plymouth "$HERE"/plymouth/elyir/elyir.script "$THEME"/

# A Pi's boot says nothing of its own: no rainbow, no raspberries, no log, no cursor.
CFG=/boot/firmware/config.txt CMD=/boot/firmware/cmdline.txt
if [ -f "$CFG" ] && ! grep -q '^disable_splash=1' "$CFG"; then
  printf '\n# Elyir: the startup is ours from the first frame\ndisable_splash=1\n' >> "$CFG"
fi
if [ -f "$CMD" ]; then
  line=$(head -n1 "$CMD")
  line=${line//console=tty1/console=tty3}
  for arg in quiet splash plymouth.ignore-serial-consoles logo.nologo vt.global_cursor_default=0 loglevel=3; do
    case " $line " in *" $arg "*) ;; *) line="$line $arg" ;; esac
  done
  printf '%s\n' "$line" > "$CMD"
fi

# Nor does a PC's, past the maker's logo: no menu, no "Loading Linux", no kernel log. This file is read after
# the image's own, so it is the one that counts. The boot always goes through the initramfs, which is where
# the splash and the graphics driver are, rather than Ubuntu's cloud shortcut around it, which starts the
# splash seconds later. plymouth.use-simpledrm draws on the screen the firmware left lit until a graphics
# driver takes over, and is the only screen there is on an AMD box, whose firmware the image leaves out.
if [ -d /etc/default/grub.d ]; then
  cat > /etc/default/grub.d/99-elyir.cfg <<'GRUB'
# Elyir: after the maker's logo, the startup is ours (startup/splash.sh)
GRUB_CMDLINE_LINUX_DEFAULT="quiet splash loglevel=3 vt.global_cursor_default=0 plymouth.ignore-serial-consoles plymouth.use-simpledrm"
GRUB_TIMEOUT=0
GRUB_TIMEOUT_STYLE=hidden
GRUB_RECORDFAIL_TIMEOUT=0
GRUB_FORCE_PARTUUID=
GRUB
  update-grub
fi
plymouth-set-default-theme -R elyir >/dev/null
