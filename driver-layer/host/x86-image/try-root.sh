#!/bin/sh
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# shellcheck shell=sh
# The USB stick is an installer that can hold one try, never a hub (design/move-to-drive/, stick-try). This runs in
# the initramfs (scripts/init-bottom, installed by inside.sh) and is why a start from the stick never writes the
# stick's own system: the root becomes an overlay, the stick's system read-only underneath and on top either the
# try (its own partition on the stick, labeled hub-try) or, with none, memory that is gone at the next start.
#
# Only the stick's own root: labeled cloudimg-rootfs as flashed, and carrying /etc/home-hub-stick. A drive copy is
# relabeled hub-root and loses the mark (move-to-drive.sh), so it starts as an ordinary system.
#
# Named home-hub-try so it sorts before udev's, which moves /dev onto the root this replaces.
#
# There is no fallback to the stick's root read-write: no try, or one that will not mount, means memory, and if
# even that fails the start stops here.
#
# What the running system reads (try.sh), under /run/home-hub-try:
#   state      try | fresh          disk     the stick, e.g. sda          system   its root, e.g. /dev/sda1
#   lower/     the stick's root, read-only     part/   the try's partition, when the stick has one
#   fresh/     the memory a start without a try runs on
PREREQ=""
case "${1:-}" in prereqs) echo "$PREREQ"; exit 0 ;; esac

PATH="${HUB_PATH:-/usr/sbin:/usr/bin:/sbin:/bin}"
RUN="${HUB_TRY_RUN:-/run/home-hub-try}"
MOUNTS="${HUB_MOUNTS:-/proc/mounts}"
BLOCK="${HUB_BLOCK:-/sys/class/block}"
root="${rootmnt:-/root}"
say() { echo "home-hub: $*" > /dev/kmsg 2>/dev/null || echo "home-hub: $*" >&2; }
stop() {
  say "$*"
  # shellcheck disable=SC1091
  [ -f /scripts/functions ] && . /scripts/functions && panic "$*"
  exit 3
}
label() { blkid -o value -s LABEL "$1" 2>/dev/null; }

dev="$(awk -v m="$root" '$2 == m { d = $1 } END { print d }' "$MOUNTS")"
[ -n "$dev" ] && [ "$(label "$dev")" = cloudimg-rootfs ] && [ -e "$root/etc/home-hub-stick" ] || exit 0
mount -o remount,ro "$root" || stop "the stick's system would not stay read-only; not starting"
disk="$(basename "$(dirname "$(readlink -f "$BLOCK/${dev##*/}")")")"

part=""
for p in "$BLOCK/$disk/$disk"*; do
  [ -e "$p/partition" ] || continue
  [ "$(label "/dev/${p##*/}")" = hub-try ] && { part="/dev/${p##*/}"; break; }
done

mkdir -p "$RUN/lower"
state=fresh
if [ -n "$part" ]; then
  mkdir -p "$RUN/part"
  # 1 is "fixed something"; above that the try is not trusted, and this start runs on memory.
  e2fsck -p "$part" >/dev/null 2>&1; fixed=$?
  if [ "$fixed" -le 1 ] && mount -t ext4 -o rw,noatime "$part" "$RUN/part"; then
    # Emptied (Start over, or put on a drive), or a try that was never finished being made: made empty again
    # before anything reads it.
    left=""
    for f in "$RUN/part"/* "$RUN/part"/.[!.]*; do [ -e "$f" ] && [ "${f##*/}" != lost+found ] && left=1; done
    if [ -e "$RUN/part/clear" ] || { [ ! -e "$RUN/part/made" ] && [ -n "$left" ]; }; then
      say "emptying the try on the stick"
      umount "$RUN/part"
      mke2fs -q -F -t ext4 -L hub-try "$part" >/dev/null 2>&1 && mount -t ext4 -o rw,noatime "$part" "$RUN/part" || part=""
    fi
    [ -n "$part" ] && [ -e "$RUN/part/made" ] && state=try
  else
    say "the try on the stick would not open; this start keeps nothing"
    part=""
  fi
  [ -n "$part" ] || rmdir "$RUN/part" 2>/dev/null
fi

if [ "$state" = fresh ]; then
  mkdir -p "$RUN/fresh"
  mount -t tmpfs -o mode=0755,size=50% hub-fresh "$RUN/fresh" || stop "no memory for a start from the stick"
  base="$RUN/fresh"
else
  base="$RUN/part"
fi
mkdir -p "$base/upper" "$base/work" "$base/docker" "$base/containerd"

mount -o move "$root" "$RUN/lower" || stop "could not set the stick's system aside"
# Named after the stick's system partition, so `findmnt -no SOURCE /` still names the stick, as move-early.sh,
# drive.sh and firstboot.sh expect.
if ! mount -t overlay -o "lowerdir=$RUN/lower,upperdir=$base/upper,workdir=$base/work" "$dev" "$root"; then
  [ "$state" = try ] || stop "could not start on memory over the stick"
  say "the try would not open as the system; this start keeps nothing"
  state=fresh; base="$RUN/fresh"; mkdir -p "$base"
  mount -t tmpfs -o mode=0755,size=50% hub-fresh "$base" && mkdir -p "$base/upper" "$base/work" "$base/docker" "$base/containerd" \
    && mount -t overlay -o "lowerdir=$RUN/lower,upperdir=$base/upper,workdir=$base/work" "$dev" "$root" \
    || stop "could not start on memory over the stick"
fi

# Docker's and containerd's layers are overlays of their own, which cannot sit on an overlay: on the try's own
# filesystem instead.
for d in docker containerd; do
  mkdir -p "$root/var/lib/$d" && mount -o bind "$base/$d" "$root/var/lib/$d" || say "no room of its own for $d"
done

# The stick's fstab, but with no root line (the root is this overlay, never the stick's partition) and the stick's
# boot partitions read-only and never checked: a check can write, and a kernel update can't land on a stick whose
# system underneath stays as flashed.
awk 'BEGIN { OFS = "\t" }
  /^[ \t]*#/ || NF < 4 { print; next }
  $2 == "/" { print "# / is the stick under a try (home-hub-try)"; next }
  $2 == "/boot" || $2 ~ /^\/boot\// { $4 = $4 ",ro"; if ($3 ~ /^ext/) $4 = $4 ",noload"; $6 = 0; print; next }
  { print }' "$root/etc/fstab" > "$RUN/fstab" && mount -o bind "$RUN/fstab" "$root/etc/fstab" \
  || stop "could not keep the stick's boot partitions read-only"

echo "$disk" > "$RUN/disk"; echo "$dev" > "$RUN/system"; echo "$state" > "$RUN/state"
say "started from the stick on $( [ "$state" = try ] && echo its try || echo memory)"
exit 0
