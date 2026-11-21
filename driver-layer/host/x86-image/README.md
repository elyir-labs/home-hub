# The flash-and-go image for x86

The NUC and mini-PC image: Ubuntu Server 24.04 with the hub already on it, built by
`.github/workflows/x86-image.yml` on every version tag and attached to the release as `home-hub-<tag>-x86.img.xz`.

**To set up a NUC:** write the image to a USB stick with balenaEtcher, or with Raspberry Pi Imager's *Use custom*,
answering **No** when it offers OS customisation: those settings are for a Raspberry Pi, and Imager fails with
"Operating system did not mount FAT32 partition" trying to write them, because macOS keeps a PC's boot partition
to itself. An image downloaded from a CI run (rather than a release) comes inside a `.zip`; unzip it first and give
the writer the `.img.xz` inside, because neither app looks inside a zip for a second layer of compression. Plug the
stick into the NUC with nothing else, and power it on.

**The stick is an installer that can hold one try, never a hub** (`design/move-to-drive/`, stick-try). A start from
the stick never writes the stick's own system: in the initramfs (`try-root.sh`, installed by `inside.sh`) its root
becomes an overlay, the stick's system read-only underneath and on top either memory, gone at the next start, or the
*try*, a partition of its own (labeled `hub-try`) in the stick's free space after the system. Docker's and
containerd's data sit on the try's own filesystem, because their layers can't sit on an overlay. The stick's boot
partitions are mounted read-only too, so a kernel update never lands on a stick, and fstrim and the automatic upgrades
don't run there. Nothing ever falls back to the stick's system read-write: a try that won't open means memory, and if
even that fails the start stops.

- With an **empty internal drive**, the hub moves itself there at the start of its first boot, before anything has
  written to the disk (`host/move-early.sh`, `host/move-to-drive.sh`), and restarts from the drive. The stick stays as
  flashed, so the same one sets up the next hub: plug it into the next NUC and power on. The copy gets its own disk
  ids, labels and machine id, so it is never confused with the stick, and the firmware is told to start from the
  drive. The copy is labeled `hub-root` and loses the stick's mark (`/etc/home-hub-stick`), so it starts as an
  ordinary system, never an overlay.
- With **anything on the internal drive** (Windows, an old install), nothing on it is touched until somebody says so.
  The start runs on memory and makes a try there (`host/try.sh make`), so what the household sets up from then on is
  kept on the stick's try, bound to this computer by its firmware's id (and by its drives' serials when the firmware
  gives none). With a keyboard plugged in, the first start asks on the screen before anything is written (screen-asks):
  type *erase* to put the hub on the drive, or keep it. With no keyboard, the phone asks. `HUB_AUTO_INTERNAL=0` in
  `/etc/home-hub.conf` keeps a hub on its stick even when the drive is empty.
- **Putting a try on the drive** copies the system and the try's changes onto the drive as one ordinary system, the
  house's machine id and Docker's data included, then empties the try on the stick. A house is never left on a stick
  once it is somewhere else: the drive empties the stick's try for good on its first start if the stick is still in
  (`try.sh tidy`), and the stick does it itself at its next start otherwise.
- **Start over** on a try (`try.sh clear`) empties it, at the very start of the next boot, before anything reads it.
  The partition stays; the stick is otherwise as flashed.
- **While it runs from the stick**, every start asks the firmware for the stick again on the next start (BootNext,
  `host/boot-next.sh`), so a restart comes back to the hub rather than to what was on the drive. The firmware's own
  boot order is never changed: take the stick out and the computer starts its old system as before.

`host/try.sh status` says all of this in one line of JSON (on the stick, on a try, a try present, made on this
computer, when made and last used, and the stick's disk). `x86-image/stick-e2e.sh` starts the built image in QEMU as a
USB stick beside a drive and proves it, on every pull request that changes how the image or the move is built.

Then it is the same as every hub: with a cable it is at `http://hub.local`; without one it offers a Wi‑Fi of its own,
named on its label (docs/network.md, piece 5). The image carries the brain, the front door and the broker, so the
Wi‑Fi step works before the hub has any internet; the engine and the rest download once it is online.

**What it changes from Ubuntu's cloud image** (`inside.sh`): the full kernel and firmware, because the cloud kernel has
no drivers for real Wi‑Fi cards; NetworkManager running every link; Docker; no cloud-init, no login and no SSH, like the
Pi image; the hub's code at the tag and its first-boot unit; and after the maker's logo, Elyir's startup splash with no boot
menu or text between them (`startup/splash.sh`), which stays up on a monitor until the hub answers. The maker's logo
itself is in the computer's firmware and no image can change it. The machine id is emptied so every unit makes its own.

To build one yourself, as root on amd64 Linux with `qemu-utils` and `cloud-guest-utils` (it mounts the image on a
loop device and changes it from a chroot, the way pi-gen does):

```sh
sudo driver-layer/host/x86-image/build.sh v0.6.4 hub.img [dir-of-saved-container-tars]
```
