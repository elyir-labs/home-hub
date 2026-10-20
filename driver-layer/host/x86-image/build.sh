#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The flash-and-go image for x86 hosts: a NUC, a mini PC. Ubuntu 24.04's cloud image with the hub on it,
# customized in place with libguestfs (no VM to drive, no installer to answer). See README.md.
#
#   build.sh <ref> <out.img> [preload-dir]
#
# Needs: virt-customize and virt-resize (libguestfs-tools), qemu-img, curl, sha256sum. Runs as any user who can read
# /dev/kvm; without it libguestfs falls back to emulation and takes several times longer.
set -euo pipefail
REF="${1:?which tag or branch the image carries}"; OUT="${2:?where the image goes}"; PRELOAD="${3:-}"
REPO="${HOME_HUB_REPO:-https://github.com/elyir-labs/home-hub.git}"
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE="${HUB_BASE_URL:-https://cloud-images.ubuntu.com/releases/24.04/release}"
CLOUD="ubuntu-24.04-server-cloudimg-amd64.img"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

curl -fsSL -o "$WORK/$CLOUD" "$BASE/$CLOUD"
curl -fsSL -o "$WORK/SHA256SUMS" "$BASE/SHA256SUMS"
(cd "$WORK" && grep " \*\?$CLOUD\$" SHA256SUMS | sha256sum -c -)

# Raw, so it can be written to a disk as it is, and with room for a kernel that knows real hardware,
# its firmware, Docker and the containers. first boot grows it to fill whatever disk it lands on.
qemu-img create -f raw "$OUT" "${HUB_IMAGE_SIZE:-9G}"
virt-resize --format qcow2 --output-format raw --expand /dev/sda1 "$WORK/$CLOUD" "$OUT"

printf 'HOME_HUB_REF=%s\nHOME_HUB_REPO=%s\nHUB_IMAGE=x86\n' "$REF" "$REPO" > "$WORK/home-hub.conf"
ARGS=(--format raw -a "$OUT" --smp 2 --memsize 2048
      --upload "$WORK/home-hub.conf:/etc/home-hub.conf"
      # --run would hand the script to /bin/sh whatever its first line says; it is a bash script.
      --upload "$HERE/inside.sh:/tmp/inside.sh"
      --run-command "bash /tmp/inside.sh"
      --delete /tmp/inside.sh)
if [ -n "$PRELOAD" ] && ls "$PRELOAD"/*.tar >/dev/null 2>&1; then
  ARGS+=(--mkdir /var/lib/home-hub/preload)
  for t in "$PRELOAD"/*.tar; do ARGS+=(--copy-in "$t:/var/lib/home-hub/preload"); done
fi
virt-customize "${ARGS[@]}"
echo "built $OUT"
