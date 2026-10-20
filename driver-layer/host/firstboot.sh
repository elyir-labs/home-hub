#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The hub's first boot, for a box that was flashed rather than installed: the Home Hub image for a
# Pi, or any machine where someone dropped this unit in. Runs once (home-hub-firstboot.service),
# leaves a mark, and never runs again. Everything Pi-specific lives here, not in install.sh, so the
# install script stays the same on a NUC, a VM, or any Debian or Fedora box.
#
#   1. On a Pi 5: bring the bootloader current and make sure PCIe is on, so an NVMe on any base works.
#   2. On a Pi 5 that booted from SD with an empty NVMe attached: copy itself to the NVMe and reboot
#      from it (HUB_AUTO_NVME=0 in /etc/home-hub.conf turns this off).
#   3. On a unit with its own screen, in a house that already has a hub: become that hub's screen and
#      stop there -- no second house (design/companion/, C). HUB_ROLE=hub in /etc/home-hub.conf skips
#      the look. HUB_ROLE=screen makes any display the screen (an HDMI monitor too), looks for ten
#      minutes instead of twenty seconds, and never installs a hub: finding none, it tries again at
#      the next start.
#   4. Run install.sh, which does everything a hand install would.
#   5. On a unit with its own screen: startup/install.sh, the splash and the panel full screen.
#
# The x86 image (x86-image/) is written to a USB stick and booted on the NUC. Booted from the stick
# with an empty internal drive, it moves itself there (host/move-to-drive.sh) and restarts from the
# drive; the stick is never written, so it sets up the next hub. A drive with anything on it is never
# touched: the hub runs from the stick instead (HUB_AUTO_INTERNAL=0 in /etc/home-hub.conf turns the move
# off). Wherever it runs, the root filesystem is grown to fill its disk.
set -euo pipefail
MARK=${HUB_FIRSTBOOT_MARK:-/var/lib/home-hub/firstboot.done}
CONF=${HUB_CONF:-/etc/home-hub.conf}
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
[ -f "$MARK" ] && exit 0
mkdir -p "$(dirname "$MARK")"
log() { printf '[home-hub] %s\n' "$*"; }

is_pi5() { grep -q "Raspberry Pi 5" /proc/device-tree/model 2>/dev/null; }
booted_from_sd() { findmnt -no SOURCE / | grep -q mmcblk; }
nvme_empty() { [ -b /dev/nvme0n1 ] && [ -z "$(lsblk -no NAME /dev/nvme0n1 | tail -n +2)" ]; }

if is_pi5; then
  log "Raspberry Pi 5: bootloader and PCIe"
  rpi-eeprom-update -a >/dev/null 2>&1 || true
  CFG=/boot/firmware/config.txt
  if [ -f "$CFG" ] && ! grep -q '^dtparam=pciex1' "$CFG" && [ ! -d /proc/device-tree/hat ]; then
    printf '\n# home-hub: NVMe on a base without a HAT EEPROM\ndtparam=pciex1\n' >> "$CFG"    # harmless with nothing attached
    log "enabled PCIe in config.txt (takes effect on the next boot)"
  fi
  if [ "${HUB_AUTO_NVME:-1}" = "1" ] && booted_from_sd && nvme_empty; then
    log "empty NVMe found while running from SD: copying the system across, then rebooting from it"
    if ! command -v rpi-clone >/dev/null 2>&1; then
      curl -fsSL https://raw.githubusercontent.com/geerlingguy/rpi-clone/master/install | bash >/dev/null 2>&1 || true
    fi
    if command -v rpi-clone >/dev/null 2>&1 && rpi-clone -U nvme0n1 >/dev/null 2>&1; then
      touch "$MARK"                     # this SD is done; the NVMe copy has no mark yet and finishes the job
      log "copied; rebooting from the NVMe"
      reboot; exit 0
    fi
    log "could not copy to the NVMe; carrying on from the SD card"
  fi
fi

if [ "${HUB_IMAGE:-}" = x86 ]; then
  SYS_BLOCK="${HUB_SYS_BLOCK:-/sys/block}"
  ROOT_PART="$(findmnt -no SOURCE /)"
  ROOT_DISK="$(lsblk -no PKNAME "$ROOT_PART" | head -1)"
  on_stick() { [ "$(lsblk -dno TRAN "/dev/$1" 2>/dev/null)" = usb ] || [ "$(cat "$SYS_BLOCK/$1/removable" 2>/dev/null)" = 1 ]; }
  internal() { lsblk -dno NAME,TRAN,TYPE 2>/dev/null | awk -v r="$ROOT_DISK" '$3=="disk" && $1!=r && ($2=="nvme"||$2=="sata"||$2=="ata") {print $1}'; }
  # An internal drive with no partitions and no signature of any kind: nothing anybody could lose.
  empty() { [ -z "$(lsblk -no NAME "/dev/$1" | tail -n +2)" ] && [ -z "$(wipefs -n "/dev/$1" 2>/dev/null)" ]; }
  holds_hub() { lsblk -no LABEL "/dev/$1" 2>/dev/null | grep -qx hub-root; }
  if on_stick "$ROOT_DISK"; then
    for d in $(internal); do
      if holds_hub "$d"; then
        # This stick already put its hub on the drive, and the firmware started from the stick anyway.
        # Off, rather than a second hub: take the stick out and switch it back on.
        log "the hub is already on $d and this computer started from the stick again: turning off, take the stick out"
        poweroff; exit 0
      fi
    done
    TARGET=""
    for d in $(internal); do empty "$d" && { TARGET="$d"; break; }; done
    if [ "${HUB_AUTO_INTERNAL:-1}" = 1 ] && [ -n "$TARGET" ]; then
      log "running from a USB stick with an empty drive ($TARGET): moving the system there"
      if "$DIR/driver-layer/host/move-to-drive.sh" "$ROOT_DISK" "$TARGET"; then
        log "moved; restarting from the drive. The stick is untouched and can set up another hub."
        reboot; exit 0
      fi
      log "could not move to $TARGET; carrying on from the stick"
    elif [ -z "$TARGET" ]; then
      log "running from a USB stick, and the drive has something on it: it is left alone"
    fi
  fi
  PARTN="$(cat "$SYS_BLOCK/$ROOT_DISK/$(basename "$ROOT_PART")/partition" 2>/dev/null || true)"
  if [ -n "$PARTN" ] && growpart "/dev/$ROOT_DISK" "$PARTN" >/dev/null 2>&1; then
    resize2fs "$ROOT_PART" >/dev/null 2>&1 || true
    log "the system now fills its disk"
  fi
fi

# The wall, on its DSI connector. A monitor on HDMI is somebody's desk, not the product's face --
# unless this unit was told it is a screen.
screen_here() {
  { [ "${HUB_ROLE:-}" = screen ] || grep -qsx connected "${HUB_DRM:-/sys/class/drm}"/card*-DSI-*/status; } && [ -x "$DIR/startup/install.sh" ]
}
set_conf() { { grep -v "^$1=" "$CONF" 2>/dev/null || true; echo "$1=\"$2\""; } > "$CONF.new" && mv "$CONF.new" "$CONF"; }

if screen_here && [ "${HUB_ROLE:-}" != hub ]; then
  command -v avahi-browse >/dev/null 2>&1 || apt-get install -y --no-install-recommends avahi-utils >/dev/null 2>&1 || true
  log "a screen of its own: is there already a hub on this Wi-Fi?"
  [ "${HUB_ROLE:-}" = screen ] && export FIND_FOR=600
  if HUB=$("$DIR/startup/find-hub.sh"); then
    log "found the house's hub at $HUB: this unit is its screen, not a second house"
    # Its own name on the network, never the hub's. avahi makes a second one screen-2.
    hostnamectl set-hostname screen 2>/dev/null || echo screen > /etc/hostname
    sed -i "s/127\.0\.1\.1.*/127.0.1.1\tscreen/" /etc/hosts 2>/dev/null || true
    # A unit that was a hub before stops being one: nothing may bring its house back (the watchdog does,
    # every few minutes), and nothing may announce it as a hub, or another screen could join it.
    if systemctl list-unit-files 'home-hub-*' >/dev/null 2>&1; then
      # shellcheck disable=SC2046
      systemctl disable --now $(systemctl list-unit-files 'home-hub-*.timer' 'home-hub-*.path' --no-legend 2>/dev/null | awk '{print $1}') >/dev/null 2>&1 || true
    fi
    if [ -f "$DIR/driver-layer/docker-compose.yml" ] && command -v docker >/dev/null 2>&1; then
      (cd "$DIR/driver-layer" && docker compose down >/dev/null 2>&1) || true
    fi
    if [ -f "${HUB_AVAHI:-/etc/avahi/services}/home-hub.service" ]; then
      rm -f "${HUB_AVAHI:-/etc/avahi/services}/home-hub.service"
      systemctl reload-or-restart avahi-daemon >/dev/null 2>&1 || true
    fi
    set_conf HUB_ROLE screen
    set_conf ELYIR_READY_URL "$HUB/alive"
    set_conf ELYIR_PANEL_URL "$HUB/?screen=1"
    HOME_HUB_DIR="$DIR" "$DIR/startup/install.sh" || log "could not set up the screen"
    touch "$MARK"
    log "done: the house's hub asks this screen in"
    exit 0
  fi
  if [ "${HUB_ROLE:-}" = screen ]; then
    # Told it is a screen: becoming a second hub beside the house's real one is the one thing it must not do.
    log "no hub found on this Wi-Fi. This unit is set to be a screen, so it will look again at the next start"
    exit 1
  fi
  log "no hub found: this unit will run the house"
fi

# The containers a flashed image carries (pi-image/, x86-image/): enough to serve the Wi-Fi step before
# the hub has any internet (docs/network.md, piece 5). Loaded once and deleted, because the disk wants
# the room more than a second copy.
PRELOAD="${HUB_PRELOAD:-/var/lib/home-hub/preload}"
if ls "$PRELOAD"/*.tar >/dev/null 2>&1 && command -v docker >/dev/null 2>&1; then
  systemctl start docker >/dev/null 2>&1 || true
  log "loading the containers this image carries, so it can start before it has internet"
  for t in "$PRELOAD"/*.tar; do docker load -i "$t" >/dev/null 2>&1 && rm -f "$t"; done
fi

log "installing the hub"
if [ -x "$DIR/install.sh" ]; then
  HOME_HUB_DIR="$DIR" "$DIR/install.sh"
else
  curl -fsSL https://raw.githubusercontent.com/elyir-labs/home-hub/main/install.sh | HOME_HUB_DIR="$DIR" bash
fi
# A unit with a screen of its own starts the way every Elyir product does.
if screen_here; then
  log "a screen of its own: Elyir's startup"
  HOME_HUB_DIR="$DIR" "$DIR/startup/install.sh" || log "could not set up the screen's startup; the hub is unaffected"
fi
touch "$MARK"
log "done"
