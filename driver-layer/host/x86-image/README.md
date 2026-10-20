# The flash-and-go image for x86

The NUC and mini-PC image: Ubuntu Server 24.04 with the hub already on it, built by
`.github/workflows/x86-image.yml` on every version tag and attached to the release as `home-hub-<tag>-x86.img.xz`.

**To set up a NUC:** write the image to a USB stick with balenaEtcher, or with Raspberry Pi Imager's *Use custom*,
answering **No** when it offers OS customisation: those settings are for a Raspberry Pi, and Imager fails with
"Operating system did not mount FAT32 partition" trying to write them, because macOS keeps a PC's boot partition
to itself. An image downloaded from a CI run (rather than a release) comes inside a `.zip`; unzip it first and give
the writer the `.img.xz` inside, because neither app looks inside a zip for a second layer of compression. Plug the
stick into the NUC with nothing else, and power it on.

- With an **empty internal drive**, the hub moves itself there at the start of its first boot, before anything has
  written to the disk (`host/move-early.sh`, `host/move-to-drive.sh`), and restarts from the drive. The stick is never
  written, so the same one sets up the next hub: plug it into the next NUC and power on. The copy gets its own disk
  ids, labels and machine id, so it is never confused with the stick, and the firmware is told to start from the
  drive. Firmware that starts from any USB stick regardless finds its hub already on the drive and turns the computer
  off: take the stick out and switch it back on.
- With **anything on the internal drive** (Windows, an old install), nothing on it is touched until somebody says so.
  First run opens on the question: the drive named, with what is on it, and erase it and put the hub there, or keep
  it and run from the stick. Erasing names what is lost and wakes only on the typed word *erase*. Keep is an answer,
  and the first row on This hub offers the move again, on a hold, behind the passcode (`design/move-to-drive/`).
  `HUB_AUTO_INTERNAL=0` in `/etc/home-hub.conf` keeps a hub on its stick even when the drive is empty.

Then it is the same as every hub: with a cable it is at `http://hub.local`; without one it offers a Wi‑Fi of its own,
named on its label (docs/network.md, piece 5). The image carries the brain, the front door and the broker, so the
Wi‑Fi step works before the hub has any internet; the engine and the rest download once it is online.

**What it changes from Ubuntu's cloud image** (`inside.sh`): the full kernel and firmware, because the cloud kernel has
no drivers for real Wi‑Fi cards; NetworkManager running every link; Docker; no cloud-init, no login and no SSH, like the
Pi image; the hub's code at the tag and its first-boot unit. The machine id is emptied so every unit makes its own.

To build one yourself, as root on amd64 Linux with `qemu-utils` and `cloud-guest-utils` (it mounts the image on a
loop device and changes it from a chroot, the way pi-gen does):

```sh
sudo driver-layer/host/x86-image/build.sh v0.6.4 hub.img [dir-of-saved-container-tars]
```
