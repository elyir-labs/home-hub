# The flash-and-go image for x86

The NUC and mini-PC image: Ubuntu Server 24.04 with the hub already on it, built by
`.github/workflows/x86-image.yml` on every version tag and attached to the release as `home-hub-<tag>-x86.img.xz`.

**To set up a NUC:** write the image to a USB stick (balenaEtcher, or Raspberry Pi Imager's *Use custom*), plug the
stick into the NUC with nothing else, and power it on.

- With an **empty internal disk**, the hub copies itself there, blanks the stick, and restarts from the internal disk.
  Take the stick out whenever you like; write the image to it again to set up another.
- With **anything on the internal disk** (Windows, an old install), the disk is left exactly as it is and the hub
  runs from the stick. To move it across, empty the disk first. `HUB_AUTO_INTERNAL=0` in `/etc/home-hub.conf` keeps
  it on the stick even when the disk is empty.

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
