#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The one try a USB stick can hold (design/move-to-drive/, stick-try). The stick is an installer, never a hub: a
# start from it runs on an overlay (x86-image/try-root.sh, in the initramfs) whose top layer is either memory, gone
# at the next start, or the try, a partition of its own on the stick. This is everything else asks of the try.
#
#   try.sh status    one line of JSON: {"stick", "active", "present", "here", "made", "last", "disk"}
#   try.sh make      keep this start's changes as the try, bound to this computer; the caller restarts
#   try.sh clear     empty the try, so the stick is as flashed; the caller restarts
#   try.sh adopt     bind the try to this computer, when it was brought from another one
#   try.sh stamp     write down that the try was used now (home-hub-try.timer)
#   try.sh tidy      on a drive a try was moved onto: empty the stick it came from, if it is still plugged in
#
# THE STICK'S SYSTEM IS NEVER WRITTEN HERE. The partition table is, once, when the first try is made in the free
# space after the system; the try's partition is kept after that and only ever emptied.
set -uo pipefail
RUN="${HUB_TRY_RUN:-/run/home-hub-try}"; P="$RUN/part"
DMI="${HUB_DMI:-/sys/class/dmi/id}"; VAR="${HUB_VAR:-/var/lib/home-hub}"
MIN="${HUB_TRY_MIN:-3221225472}"
LINUX_TYPE=0FC63DAF-8483-4772-8E79-3D69D8477DE4
log() { printf '[home-hub] %s\n' "$*" >&2; }
fail() { log "$*"; exit 1; }

state() { cat "$RUN/state" 2>/dev/null; }
stick() { [ -n "$(state)" ]; }
active() { [ "$(state)" = try ]; }
present() { [ -f "$P/made" ]; }
disk() { cat "$RUN/disk" 2>/dev/null; }
epoch() { local v; v="$(head -1 "$1" 2>/dev/null | tr -dc 0-9)"; echo "${v:-null}"; }

# Firmware that never set its own id says one of these, and two such computers would look like one.
product() {
  local u; u="$(tr 'A-F' 'a-f' 2>/dev/null < "$DMI/product_uuid" | tr -d ' \n')"
  case "$u" in ""|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff|03000200-0400-0500-0006-000700080009) ;;
    *) echo "$u" ;; esac
}
drives() {
  local d
  for d in $(lsblk -dno NAME,TRAN,TYPE 2>/dev/null | awk -v s="$(disk)" '$3=="disk" && $1!=s && ($2=="nvme"||$2=="sata"||$2=="ata") {print $1}'); do
    lsblk -dno SERIAL "/dev/$d" 2>/dev/null | tr -d ' '
  done | { grep . || true; } | sort -u
}
# The same computer by its firmware's id; by a drive it still has when the firmware gives none.
here() {
  local was now; was="$(cat "$P/product" 2>/dev/null)"; now="$(product)"
  if [ -n "$was" ] && [ -n "$now" ]; then [ "$was" = "$now" ]; return; fi
  [ -s "$P/drives" ] && drives | grep -qxF -f "$P/drives"
}
bind_here() { product > "$P/product.new" && drives > "$P/drives.new" && mv "$P/product.new" "$P/product" && mv "$P/drives.new" "$P/drives"; }

# The try's partition on the stick, by the name its partition was given when it was made.
partition() {
  sfdisk -J "/dev/$(disk)" 2>/dev/null | python3 -c 'import json, sys
for p in json.load(sys.stdin)["partitiontable"]["partitions"]:
    if p.get("name") == "hub-try": print(p["node"]); break' 2>/dev/null
}

# Made new in the stick's free space after the system, the one change to the stick's layout there is.
new_partition() {
  local d; d="$(disk)"
  local plan start
  plan="$(sfdisk -J "/dev/$d" 2>/dev/null | python3 -c 'import json, sys
t = json.load(sys.stdin)["partitiontable"]; ss = t.get("sectorsize", 512)
end = max(p["start"] + p["size"] for p in t["partitions"])
start = -(-end // 2048) * 2048
free = int(sys.argv[1]) - start * ss - 2 * 1024 * 1024
print(start, free)' "$(blockdev --getsize64 "/dev/$d")")" || return 1
  read -r start free <<< "$plan"
  [ "${free:-0}" -ge "$MIN" ] || { log "the stick has $(( ${free:-0} / 1048576 )) MB free after the system, and a try needs $(( MIN / 1048576 ))"; return 1; }
  # Flashed from an image, the stick's backup partition table sits where the image ended, not at the stick's end.
  sfdisk -q --no-reread --no-tell-kernel --relocate gpt-bak-std "/dev/$d" >/dev/null || return 1
  printf 'start=%s, type=%s, name=hub-try\n' "$start" "$LINUX_TYPE" | sfdisk -q --append --no-reread --no-tell-kernel "/dev/$d" >/dev/null || return 1
  local n
  n="$(sfdisk -J "/dev/$d" 2>/dev/null | python3 -c 'import json, re, sys
for p in json.load(sys.stdin)["partitiontable"]["partitions"]:
    if p["start"] == int(sys.argv[1]): print(re.search(r"(\d+)$", p["node"]).group(1))' "$start")"
  [ -n "$n" ] || return 1
  partx -a --nr "$n" "/dev/$d" 2>/dev/null || true
  udevadm settle 2>/dev/null || true
  local i=0; until seen || [ "$i" -ge 40 ]; do sleep 0.25; i=$((i + 1)); done
  seen
}
seen() { local p; p="$(partition)"; [ -n "$p" ] && lsblk -no NAME "$p" >/dev/null 2>&1; }
fresh_fs() { mke2fs -q -F -t ext4 -L hub-try "$1" >/dev/null 2>&1; }

make_try() {
  stick || fail "this start is not from the stick, so there is no try to make"
  active && fail "this start already runs on a try"
  present && fail "the stick already holds a try; restart to use it"
  if ! mountpoint -q "$P"; then
    local dev; dev="$(partition)"
    [ -n "$dev" ] || { new_partition || fail "could not make room for a try on the stick"; dev="$(partition)"; }
    fresh_fs "$dev" || fail "could not prepare the try's partition"
    mkdir -p "$P" && mount -o noatime "$dev" "$P" || fail "could not open the try's partition"
  fi
  # What this start already wrote (drive.screen among it) is the try's first contents. Whiteouts and the overlay's
  # own marks come along as they are.
  local d
  for d in upper docker containerd; do
    mkdir -p "$P/$d" && cp -a "$RUN/fresh/$d/." "$P/$d/" || { rm -rf "${P:?}"/{upper,docker,containerd}; fail "could not copy this start into the try"; }
  done
  mkdir -p "$P/work"
  bind_here || fail "could not write down which computer the try is for"
  date +%s > "$P/last"
  date +%s > "$P/made.new" && mv "$P/made.new" "$P/made"
  sync
  log "the try is made, for this computer; it is used from the next start"
}

clear_try() {
  stick || fail "this start is not from the stick, so there is no try here"
  if active; then
    # In use as this start's system, so emptied at the very start of the next, before anything reads it.
    rm -f "$P/made" && : > "$P/clear" && sync || fail "could not empty the try"
    log "the try is emptied as the stick restarts"
    return 0
  fi
  local dev was=""; dev="$(partition)"
  [ -n "$dev" ] || return 0
  mountpoint -q "$P" && { was=1; umount "$P" || fail "the try is in use and can't be emptied"; }
  fresh_fs "$dev" || fail "could not empty the try"
  [ -n "$was" ] && mount -o noatime "$dev" "$P"
  log "the try is emptied; the stick is as it was flashed"
}

# On the drive a try was moved onto: the stick's try was marked emptied by the move, and is emptied for good here if
# that stick is still plugged in. Otherwise the stick does it itself, the next time it starts.
tidy() {
  local f="$VAR/try.clear" want dev m
  [ -f "$f" ] && ! stick || return 0
  want="$(head -1 "$f" | tr -d ' \n')"
  dev="$(lsblk -lnpo NAME,PARTUUID 2>/dev/null | awk -v u="$want" 'tolower($2)==tolower(u) {print $1; exit}')"
  [ -n "$dev" ] || return 0
  [ "$(lsblk -no PARTLABEL "$dev" 2>/dev/null)" = hub-try ] && [ -z "$(lsblk -no MOUNTPOINT "$dev" 2>/dev/null)" ] || return 0
  m="$(mktemp -d)"
  if mount -o ro,noload "$dev" "$m" 2>/dev/null; then
    local marked=""; [ -e "$m/clear" ] && [ ! -e "$m/made" ] && marked=1
    umount "$m"; rmdir "$m"
    [ -n "$marked" ] || { rm -f "$f"; return 0; }
  else rmdir "$m"; fi
  fresh_fs "$dev" && rm -f "$f" && log "the try left on the stick is emptied"
}

case "${1:-}" in
  status)
    if stick && present; then p=true; h="$(here && echo true || echo false)"; made="$(epoch "$P/made")"; last="$(epoch "$P/last")"
    else p=false; h=false; made=null; last=null; fi
    printf '{"stick": %s, "active": %s, "present": %s, "here": %s, "made": %s, "last": %s, "disk": %s}\n' \
      "$(stick && echo true || echo false)" "$(active && echo true || echo false)" "$p" "$h" "$made" "$last" \
      "$(stick && [ -n "$(disk)" ] && printf '"%s"' "$(disk)" || echo null)" ;;
  make) make_try ;;
  clear) clear_try ;;
  adopt)
    stick && present || fail "there is no try on the stick to bring here"
    bind_here || fail "could not write down this computer"
    log "the try is now this computer's" ;;
  stamp) active && present && { date +%s > "$P/last.new" && mv "$P/last.new" "$P/last"; } ; exit 0 ;;
  tidy) tidy ;;
  *) echo "usage: $0 status | make | clear | adopt | stamp | tidy" >&2; exit 2 ;;
esac
