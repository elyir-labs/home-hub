#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The built x86 image started for real as a USB stick, beside a second disk as the computer's drive, to prove the
# stick is an installer that can hold one try and never a hub (design/move-to-drive/, stick-try). tests.sh proves the
# scripts' decisions with fakes; only a real start proves the initramfs, the overlay, Docker on the try and the move.
#
#   sudo stick-e2e.sh <image.img> [work-dir]
#
# Needs root, KVM, qemu-system-x86 and ovmf, on amd64 Linux (x86-image.yml runs it after the image job). Each start
# is one QEMU run that ends when the system restarts or powers off. What happens inside is driven by a small control
# disk the image is given for the test: a unit added to a copy of the image runs the step written there for that
# start, writes what it saw back, and restarts or powers off. First boot is masked, so no start installs the hub.
#
#   A  an empty drive: moved onto at the very start, and the stick's system is unchanged
#   B  a drive with a filesystem: a try is made, a file written on it survives a restart, Docker's layers work on it,
#      and Start over leaves no trace
#   C  a move from a try: the drive starts as that house with no overlay, and the try on the stick is emptied
set -uo pipefail
IMG="$(readlink -f "${1:?the image}")"; W="$(mkdir -p "${2:-e2e}" && readlink -f "${2:-e2e}")"
# KVM on the runner; E2E_ACCEL=tcg anywhere without it, slowly.
ACCEL="${E2E_ACCEL:-kvm}"
CODE="${OVMF_CODE:-/usr/share/OVMF/OVMF_CODE_4M.fd}"; VARS="${OVMF_VARS:-/usr/share/OVMF/OVMF_VARS_4M.fd}"
SERIAL=E2EDRIVE01
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
no() { FAIL=$((FAIL + 1)); printf '  FAIL %s (wanted %s, got %s)\n' "$1" "$3" "$2"; }
is() { [ "$2" = "$3" ] && ok "$1" || no "$1" "$2" "$3"; }
say() { printf '\n== %s\n' "$*"; }
LOOPS=()
done_with() { set +e; for m in "$W"/mnt/*; do mountpoint -q "$m" && umount "$m"; done; for l in "${LOOPS[@]}"; do losetup -d "$l" 2>/dev/null; done; }
trap done_with EXIT
mkdir -p "$W/mnt/a" "$W/mnt/b" "$W/logs"

attach() {
  local l i=0; l="$(losetup -fP --show ${2:+-r} "$1")"; LOOPS+=("$l"); udevadm settle 2>/dev/null
  until [ -b "${l}p1" ] || [ "$i" -ge 50 ]; do sleep 0.1; i=$((i + 1)); done
  echo "$l"
}
detach() { losetup -d "$1"; }
bylabel() { local p; for p in "$1"p*; do [ "$(blkid -o value -s LABEL "$p")" = "$2" ] && { echo "$p"; return; }; done; }
# A partition's bytes, read straight from the stick's image file.
hash_part() {
  sfdisk -J "$1" 2>/dev/null | python3 -c 'import json, re, sys
for p in json.load(sys.stdin)["partitiontable"]["partitions"]:
    if re.search(r"(\d+)$", p["node"]).group(1) == sys.argv[1]: print(p["start"] * 512, p["size"] * 512)' "$2" | {
    read -r off len; dd if="$1" bs=4M iflag=skip_bytes,count_bytes skip="$off" count="$len" status=none | sha256sum | cut -c1-16; }
}
has_try() { sfdisk -J "$1" 2>/dev/null | python3 -c 'import json, sys
print(any(p.get("name") == "hub-try" for p in json.load(sys.stdin)["partitiontable"]["partitions"]))'; }
# What is on the stick's try partition, read-only, from outside.
try_holds() {
  local l p; l="$(attach "$1" ro)"; p="$(bylabel "$l" hub-try)"
  if [ -n "$p" ] && mount -o ro,noload "$p" "$W/mnt/b"; then find "$W/mnt/b" -mindepth 1 -maxdepth 1 ! -name lost+found -printf '%f\n' | sort | tr '\n' ' '; umount "$W/mnt/b"
  else echo "no-try-partition"; fi
  detach "$l"
}

# ------------------------------------------------------------------ the image, given the control disk's unit
say "preparing the image"
cp --sparse=always "$IMG" "$W/base.img"
L="$(attach "$W/base.img")"
mount "$(bylabel "$L" cloudimg-rootfs)" "$W/mnt/a"
R="$W/mnt/a"
[ -f "$R/etc/home-hub-stick" ] || { echo "this image has no try layer (no /etc/home-hub-stick)"; exit 1; }
cat > "$R/usr/local/sbin/hub-e2e" <<'SH'
#!/bin/bash
# The test's hand inside the hub: runs the step written on the control disk for this start.
C=/run/hub-e2e; mkdir -p "$C"
mount LABEL=E2ECTL "$C" 2>/dev/null || exit 0
cd "$C" || exit 0
{ date +%s; findmnt -no FSTYPE,SOURCE /; /opt/home-hub/driver-layer/host/try.sh status; } > boot.log 2>&1
rm -f next; bash ./step.sh > step.log 2>&1; echo "rc=$?" >> step.log
{ cat /proc/cmdline; findmnt -rno TARGET,SOURCE,FSTYPE,OPTIONS; dmesg; } > system.log 2>&1
journalctl -b --no-pager -o short-monotonic > journal.log 2>&1
journalctl -b -1 --no-pager -o short-monotonic -n 300 > journal-before.log 2>&1
next="$(cat next 2>/dev/null || echo poweroff)"
cd /; sync; umount "$C"
systemctl "$next"
SH
chmod 755 "$R/usr/local/sbin/hub-e2e"
cat > "$R/etc/systemd/system/hub-e2e.service" <<'U'
[Unit]
Description=Home Hub stick test: the step on the control disk
After=local-fs.target home-hub-move.service home-hub-try.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/hub-e2e
StandardOutput=journal+console
[Install]
WantedBy=multi-user.target
U
ln -sf /etc/systemd/system/hub-e2e.service "$R/etc/systemd/system/multi-user.target.wants/hub-e2e.service"
rm -f "$R/etc/systemd/system/home-hub-firstboot.service"; ln -s /dev/null "$R/etc/systemd/system/home-hub-firstboot.service"
umount "$R"
# The kernel's and systemd's messages on the serial port, for the log of each start.
B="$(bylabel "$L" BOOT)"
if [ -n "$B" ]; then
  mount "$B" "$W/mnt/a"; sed -i -E '/^\s*linux\s/ s/ (quiet|loglevel=3)//g; /^\s*linux\s/ s/$/ console=tty1 console=ttyS0,115200 systemd.show_status=1/' "$W/mnt/a/grub/grub.cfg"; umount "$W/mnt/a"
fi
detach "$L"

# The control disk, read and written between starts.
truncate -s 64M "$W/ctl.img"; mkfs.ext4 -q -F -L E2ECTL "$W/ctl.img"
step() { mount -o loop "$W/ctl.img" "$W/mnt/b"; rm -rf "${W:?}/mnt/b/"*; cat > "$W/mnt/b/step.sh"; umount "$W/mnt/b"; }
seen() { mount -o loop,ro "$W/ctl.img" "$W/mnt/b"; mkdir -p "$W/logs/$1"; cp -a "$W/mnt/b/." "$W/logs/$1/" 2>/dev/null; umount "$W/mnt/b"; }
# A start that restarted before the test's step ran (move-early.sh's work) leaves nothing in its logs but the step.
restarted_first() { [ -e "$W/logs/$1/boot.log" ] && echo no || echo yes; }
got() { cat "$W/logs/$1/$2" 2>/dev/null | tr -d '\n'; }
field() { python3 -c 'import json,sys
try: print(json.dumps(json.loads(open(sys.argv[1]).read().strip().splitlines()[-1])[sys.argv[2]]))
except Exception: print("none")' "$W/logs/$1/boot.log" "$2"; }

# One start. $1 names it in the logs; the stick and the drive come with their boot priority, or "-" when not plugged in.
start() {
  local name="$1" stick="$2" drive="$3" args=()
  # shellcheck disable=SC2054
  args=(-accel "$ACCEL" -machine q35,i8042=off -cpu "$([ "$ACCEL" = kvm ] && echo host || echo max)" -m 3072 -smp 2 -display none -no-reboot
        -drive "if=pflash,format=raw,readonly=on,file=$CODE" -drive "if=pflash,format=raw,file=$W/vars.fd"
        -device qemu-xhci,id=xhci -nic user,model=virtio-net-pci -drive "if=virtio,format=raw,file=$W/ctl.img"
        -serial "file:$W/logs/$name.serial")
  [ "$stick" != - ] && args+=(-drive "if=none,id=stick,format=raw,file=$W/stick.img" -device "usb-storage,bus=xhci.0,drive=stick,removable=on,bootindex=$stick")
  [ "$drive" != - ] && args+=(-drive "if=none,id=drive,format=raw,file=$W/drive.img" -device "nvme,drive=drive,serial=$SERIAL,bootindex=$drive")
  echo "-- start $name"
  timeout "${E2E_START_TIMEOUT:-900}" qemu-system-x86_64 "${args[@]}" || echo "   (qemu: $?)"
  seen "$name"
  grep -h -E 'home-hub|hub-e2e' "$W/logs/$name.serial" | tail -n 15 | sed 's/^/   | /'
}
fresh_stick() { cp --sparse=always "$W/base.img" "$W/stick.img"; truncate -s 16G "$W/stick.img"; cp "$VARS" "$W/vars.fd"; }
P1() { hash_part "$W/stick.img" 1; }
# When the stick's system is not as flashed, say how: how many bytes, the first few offsets, and the superblock fields
# that differ (mount count and times say who mounted it writable; the free counts say what was written).
as_flashed() {
  local now; now="$(P1)"; is "$1" "$now" "$before"
  [ "$now" = "$before" ] && return
  local a b; a="$(attach "$W/base.img" ro)"; b="$(attach "$W/stick.img" ro)"
  echo "   | bytes that differ: $(cmp -l "${a}p1" "${b}p1" 2>/dev/null | wc -l); the first: $(cmp -l "${a}p1" "${b}p1" 2>/dev/null | head -5 | awk '{printf "%s ", $1 - 1}')"
  diff <(dumpe2fs -h "${a}p1" 2>/dev/null) <(dumpe2fs -h "${b}p1" 2>/dev/null) | grep '^[<>]' | sed 's/^/   | /' | head -30
  detach "$b"; detach "$a"
}
others() { echo "$(hash_part "$W/stick.img" 15) $(hash_part "$W/stick.img" 16)"; }

T=/opt/home-hub/driver-layer/host/try.sh

# --------------------------------------------------------------------------------- A: an empty drive
a() {
say "A: an empty drive is moved onto at the very start, and the stick stays as flashed"
fresh_stick; rm -f "$W/drive.img"; truncate -s 20G "$W/drive.img"
before="$(P1)"; boot_before="$(others)"
step <<'S'
echo "not moved" > not-moved; echo poweroff > next
S
start A1 0 1
is "the start moved before anything else ran" "$(got A1 not-moved)" ""
as_flashed "the stick's system is byte for byte as flashed"
[ "$(others)" = "$boot_before" ] && ok "the stick's boot partitions too" || echo "  note the stick's boot partitions changed ($boot_before -> $(others)); not the system, but worth a look"
is "the stick holds no try" "$(has_try "$W/stick.img")" "False"
dl="$(attach "$W/drive.img" ro)"; is "the drive holds the system, as hub-root" "$([ -n "$(bylabel "$dl" hub-root)" ] && echo yes)" "yes"; detach "$dl"
step <<S
findmnt -no FSTYPE / > fstype; [ -e /run/home-hub-try ] && echo yes > overlay-run
e2label "\$(findmnt -no SOURCE /)" > label; $T status > status.json; echo poweroff > next
S
start A2 - 0
is "the drive starts on its own, as an ordinary system" "$(got A2 fstype) $(got A2 label) $(got A2 overlay-run)" "ext4 hub-root "
is "...and knows it is not the stick" "$(field A2 stick)" "false"

}

# A drive with somebody else's filesystem on it.
used_drive() {
  rm -f "$W/drive.img"; truncate -s 20G "$W/drive.img"
  printf 'label: gpt\nstart=2048, type=L\n' | sfdisk -q "$W/drive.img"
  local dl; dl="$(attach "$W/drive.img")"; mkfs.ext4 -q -L somebody-else "${dl}p1"; detach "$dl"
}

# ------------------------------------------------------------- B: a try, a restart, and Start over
b() {
say "B: a drive with something on it: a try is made, kept across a restart, and Start over leaves no trace"
fresh_stick; used_drive
before="$(P1)"
# Nobody answers at the keyboard, so move-early.sh makes a try before anything else runs and restarts onto it: this
# start never gets as far as the test's step.
step <<S
echo poweroff > next
S
start B1 0 1
is "a fresh stick beside a drive with something on it makes a try first, and restarts onto it" "$(restarted_first B1)" "yes"
as_flashed "the stick's system is unchanged by making it"
is "...the try has its own partition, after the system" "$(has_try "$W/stick.img")" "True"
step <<S
echo kept-by-the-try > /var/lib/home-hub/e2e-proof
findmnt -no FSTYPE /var/lib/docker > docker-fs
systemctl start docker && docker load -i /var/lib/home-hub/preload/caddy.tar >/dev/null && docker run --rm --entrypoint caddy caddy:2 version > docker-run 2>&1
docker info -f '{{.Driver}}' > docker-driver 2>&1
echo reboot > next
S
start B2 0 1
is "the restart runs on the try, on this computer" "$(field B2 active) $(field B2 present) $(field B2 here) $(field B2 disk)" 'true true true "sda"'
is "...the root is the overlay, still named after the stick's system" "$(awk 'NR == 2 {print $1, $2}' "$W/logs/B2/boot.log")" "overlay /dev/sda1"
is "...Docker's layers on the try's own filesystem, and a container runs" "$(got B2 docker-fs) $(grep -c -E '^v2' "$W/logs/B2/docker-run" 2>/dev/null)" "ext4 1"
step <<S
cat /var/lib/home-hub/e2e-proof > proof; docker image ls -q caddy:2 2>/dev/null | wc -l > images
$T clear; echo \$? > clear.rc; $T status > after-clear.json
echo reboot > next
S
start B3 0 1
is "a file written on the try survives a restart" "$(got B3 proof)" "kept-by-the-try"
is "...and so does the image Docker loaded" "$(got B3 images)" "1"
is "Start over: cleared" "$(got B3 clear.rc)" "0"
# Start over empties the try at the next start, and the stick is as flashed again; beside the same drive, that start
# then makes a new try, as the very first one did.
step <<S
echo poweroff > next
S
start B4 0 1
is "...and the next start empties it, then makes a new one, as a fresh stick does" "$(restarted_first B4)" "yes"
step <<S
ls /var/lib/home-hub/e2e-proof > left 2>/dev/null; $T status > status.json
systemctl start docker; docker image ls -q 2>/dev/null | wc -l > images
echo poweroff > next
S
start B5 0 1
is "...which holds no trace of the old one: no file, no image" "$(got B5 left)|$(got B5 images)|$(field B5 active)" "|0|true"
is "...and is newer than it" "$(python3 -c 'import sys; print("newer" if int(sys.argv[1] or 0) > int(sys.argv[2] or 0) else "not newer")' "$(field B5 made)" "$(field B2 made)")" "newer"
as_flashed "the stick's system is still as flashed"

}

# ---------------------------------------------------------------------------- C: a try put on the drive
c() {
say "C: a move from a try: the drive starts as that house, without an overlay, and the try on the stick is emptied"
fresh_stick; used_drive
before="$(P1)"
step <<S
echo poweroff > next
S
start C1 0 1
is "a new try is made by the first start" "$(restarted_first C1) $(has_try "$W/stick.img")" "yes True"
step <<S
echo the-house > /var/lib/home-hub/e2e-house
systemctl start docker && docker load -i /var/lib/home-hub/preload/caddy.tar >/dev/null
cat /etc/machine-id > machine-id
d="\$(lsblk -dno NAME,TRAN | awk '\$2=="nvme" {print \$1}')"
python3 -c 'import json,sys; print(json.dumps({"disk": sys.argv[1], "serial": sys.argv[2]}))' "\$d" "\$(lsblk -dno SERIAL /dev/\$d | tr -d ' ')" > /var/lib/home-hub/move.request
echo reboot > next
S
start C2 0 1
is "on the try, asked to move onto the drive" "$(field C2 active) $(wc -c < "$W/logs/C2/machine-id" | tr -d ' ')" "true 33"
step <<'S'
echo "not moved" > not-moved; echo poweroff > next
S
start C3 0 1
is "the move happens at the very start of the next" "$(got C3 not-moved)" ""
as_flashed "the stick's system is unchanged by the move"
is "the try on the stick is emptied: nothing of the house is used from it again" "$(try_holds "$W/stick.img" | tr ' ' '\n' | grep -x -E 'made|clear' | tr '\n' ' ')" "clear "
step <<S
findmnt -no FSTYPE / > fstype; [ -e /run/home-hub-try ] && echo yes > overlay-run
cat /var/lib/home-hub/e2e-house > house; cat /etc/machine-id > machine-id
systemctl start docker; docker image ls -q caddy:2 2>/dev/null | wc -l > images
systemctl start home-hub-try.service; $T status > status.json
echo poweroff > next
S
start C4 1 0
is "the drive starts as an ordinary system, no overlay" "$(got C4 fstype) $(got C4 overlay-run)" "ext4 "
is "...as that house: its file, its container image and its machine id" "$(got C4 house) $(got C4 images) $([ "$(got C4 machine-id)" = "$(got C2 machine-id)" ] && echo same)" "the-house 1 same"
is "...and with the stick still in, the try left on it is emptied for good" "$(try_holds "$W/stick.img")" ""
as_flashed "the stick's system, after all of it, is as flashed"
}

for s in ${E2E_ONLY:-a b c}; do "$s"; done

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
