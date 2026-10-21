# The flash-and-go image

A Raspberry Pi OS Lite (64-bit) image with the hub already on it, built by `.github/workflows/pi-image.yml`
with [pi-gen](https://github.com/RPi-Distro/pi-gen) on every version tag and attached to the release.
Flash it with Raspberry Pi Imager (*Use custom*), put the card or SSD in a Pi 5, plug in power and the
router, wait, open `http://hub.local`. There is no terminal step.

What the image carries beyond stock Raspberry Pi OS Lite:

- the hub's code at `/opt/home-hub`, at the tag the image was built from (`/etc/home-hub.conf` says which);
- Docker, git and avahi (so `hub.local` answers), so the first boot only has to pull the containers;
- `home-hub-firstboot.service`, enabled, which runs `driver-layer/host/firstboot.sh` once: bootloader and
  PCIe on a Pi 5, the copy to an empty NVMe, then `install.sh` exactly as a hand install would run it.

The first boot does not need the internet to start. The image carries the brain, the front door and the broker
(`/var/lib/home-hub/preload/`, loaded once and deleted), which is all the Wi‑Fi step needs: a Pi with no cable
offers a Wi‑Fi of its own (docs/network.md, piece 5). The engine and the rest download once the hub is online.
That Wi‑Fi's password is the one on a shipped hub's label; a card you flash yourself makes its own on first boot and
has no label to read it from, so give it Wi‑Fi with Raspberry Pi Imager's customization instead, or a cable. Raspberry Pi Imager's
own customization (Wi‑Fi, a user and password, an SSH key, the time zone) works on this image as on any
Raspberry Pi OS image; nothing here needs it, but it is how you get a shell if you ever want one. The
image ships with no password and SSH off; with a screen and keyboard attached, Raspberry Pi OS's own first-boot
user setup appears on the console, and headless nothing waits on it.

`stage-hub/` is the pi-gen stage. `00-home-hub/files/home-hub.conf` is written by the workflow just
before the build and is not committed. To build locally, follow pi-gen's README with
`STAGE_LIST="stage0 stage1 stage2 /path/to/stage-hub"` and write that file yourself.
