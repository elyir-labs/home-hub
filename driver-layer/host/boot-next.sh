#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# A hub running from its USB stick comes back to the stick after a restart (design/move-to-drive/, screen-asks:
# C with BootNext). move-early.sh runs it on every start from the stick while the hub hasn't moved, and after a move.
#
#   boot-next.sh stick <disk>   the firmware has one entry for this stick, outside its boot order, and is asked
#                               for it once, on the next start (BootNext)
#   boot-next.sh gone           the hub is on its drive, so the stick's entry goes
#   boot-next.sh drive <disk>   the next start is the hub on that drive (stick-try: a stick started beside it, and
#                               Start the hub on the drive picked; or the hub just moved there): its own entry, or one
#                               made for it outside the order
#
# BootNext is used once and leaves BootOrder alone, so the system already on the drive keeps its place, and pulling
# the stick starts it as before. Nothing here ever changes BootOrder.
set -uo pipefail
EFI="${HUB_EFI:-/sys/firmware/efi}"
LABEL="Elyir hub (USB stick)"
LOADER='\EFI\BOOT\BOOTX64.EFI'
ESP_TYPE=c12a7328-f81f-11d2-ba4b-00a0c93ec93b
log() { printf '[home-hub] %s\n' "$*"; }
{ [ -d "$EFI" ] && command -v efibootmgr >/dev/null 2>&1; } || exit 0

# Our entries, one per line: its number and the partition it starts from.
ours() { entries "$LABEL"; }
entries() {
  efibootmgr -v 2>/dev/null | python3 -c 'import re, sys
for l in sys.stdin:
    m = re.match(r"Boot([0-9A-Fa-f]{4})\*?\s+(.*)", l)
    if m and m.group(2).startswith(sys.argv[1]):
        g = re.search(r"GPT,([0-9a-fA-F-]{36})", l)
        print(m.group(1), g.group(1).lower() if g else "-")' "${1:-}"
}
esp() {
  lsblk -lno PARTN,PARTUUID,PARTTYPE "/dev/$1" 2>/dev/null | awk -v t="$ESP_TYPE" 'tolower($3) == t {print $1, tolower($2); exit}'
}

case "${1:-}" in
  stick)
    disk="${2:?which disk}"
    read -r num uuid <<< "$(esp "$disk")"
    [ -n "${num:-}" ] && [ -n "${uuid:-}" ] || { log "no EFI partition on $disk, so a restart starts whatever the firmware lists first"; exit 0; }
    entry=""
    # One entry, for this stick: an older one for another stick goes.
    while read -r n u; do
      [ -n "$n" ] || continue
      if [ "$u" = "$uuid" ] && [ -z "$entry" ]; then entry="$n"; else efibootmgr -q -b "$n" -B >/dev/null 2>&1; fi
    done <<< "$(ours)"
    if [ -z "$entry" ]; then
      efibootmgr -q --create-only -d "/dev/$disk" -p "$num" -L "$LABEL" -l "$LOADER" >/dev/null 2>&1
      entry="$(ours | awk -v u="$uuid" '$2 == u {print $1; exit}')"
    fi
    [ -n "$entry" ] || { log "the firmware didn't take an entry for the stick"; exit 0; }
    efibootmgr -q -n "$entry" >/dev/null 2>&1 && log "the next start is the stick's again (Boot$entry, once)"
    ;;
  gone)
    while read -r n _; do [ -n "$n" ] && efibootmgr -q -b "$n" -B >/dev/null 2>&1; done <<< "$(ours)"
    ;;
  drive)
    disk="${2:?which disk}"
    read -r num uuid <<< "$(esp "$disk")"
    [ -n "${num:-}" ] && [ -n "${uuid:-}" ] || { log "no EFI partition on $disk"; exit 1; }
    entry="$(entries | awk -v u="$uuid" '$2 == u {print $1; exit}')"
    if [ -z "$entry" ]; then
      efibootmgr -q --create-only -d "/dev/$disk" -p "$num" -L "Elyir Home Hub" -l '\EFI\ubuntu\shimx64.efi' >/dev/null 2>&1
      entry="$(entries | awk -v u="$uuid" '$2 == u {print $1; exit}')"
    fi
    [ -n "$entry" ] || { log "the firmware didn't take an entry for $disk"; exit 1; }
    efibootmgr -q -n "$entry" >/dev/null 2>&1 && log "the next start is the hub on $disk (Boot$entry, once)"
    ;;
  *) echo "usage: $0 stick <disk> | gone | drive <disk>" >&2; exit 2 ;;
esac
exit 0
