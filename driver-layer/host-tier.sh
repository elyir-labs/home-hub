#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# What this machine is big enough for. docs/host-tiers.md.
#
# A Pi and a NUC run the same hub; what differs is how much more each can do beside the house. This
# looks once, writes the answer into .env, and everything sized by the host -- the voice, films,
# cameras, the assistant -- reads it from there instead of looking again on its own. One answer, so
# the panel, the containers and the setup questions never disagree about what this box is.
#
#   host-tier.sh                                    look, and write HOST_* into .env
#   host-tier.sh which <arch> <cores> <mem kB> <encoder> <accel>
#                                                   say what a machine like that would get, and change nothing
#
# HOST_PINNED=1 in .env leaves every HOST_* line as somebody wrote it.
set -euo pipefail
cd "$(dirname "$0")"

GIB=1048576                 # kB
# A machine sold as 8 GB reports about 7.6 GiB, and one sold as 16 GB about 15.5.
EIGHT=$((7 * GIB))
SIXTEEN=$((15 * GIB))

tier() {  # arch cores mem_kb encoder accel
  local arch="$1" cores="$2" mem="$3" accel="$5"
  if [ "$accel" != none ]; then echo accelerated
  elif [ "$arch" = x86_64 ] && [ "$cores" -ge 4 ] && [ "$mem" -ge "$EIGHT" ]; then echo large
  elif [ "$mem" -ge "$EIGHT" ]; then echo medium
  else echo small; fi
}

# What the house can be offered. Music is everywhere: it is light, and the speakers do the work.
# Films need a video encoder, not a tier: a Pi with an AI board is "accelerated" and still cannot turn
# a film into something every TV plays, which is a film that works on one TV and not the next.
can() {  # arch cores mem_kb encoder accel
  local arch="$1" cores="$2" mem="$3" enc="$4" accel="$5" out=music
  if [ "$enc" != none ] && [ "$mem" -ge "$EIGHT" ]; then out="$out,films"; fi
  if { [ "$arch" = x86_64 ] && [ "$enc" != none ] && [ "$cores" -ge 4 ] && [ "$mem" -ge "$EIGHT" ]; } \
     || [ "$accel" != none ]; then out="$out,cameras"; fi
  if [ "$mem" -ge "$SIXTEEN" ] && { [ "$arch" = x86_64 ] || [ "$accel" = nvidia ]; }; then out="$out,assistant"; fi
  echo "$out"
}

if [ "${1:-}" = "which" ]; then
  [ $# -eq 6 ] || { echo "usage: host-tier.sh which <arch> <cores> <mem kB> <encoder> <accel>" >&2; exit 2; }
  shift
  echo "$(tier "$@") $(can "$@")"
  exit 0
fi

# What the house is offered becomes which extras run. COMPOSE_PROFILES is one line everybody shares
# (radios.sh owns zigbee and zwave, host/away.sh owns away); only the extras' own names are touched here.
EXTRAS="music"
extras() {
  local can p out=""
  can="$(grep '^HOST_CAN=' .env | cut -d= -f2- || true)"
  for p in $(grep '^COMPOSE_PROFILES=' .env | cut -d= -f2- | tr ',' ' '); do
    case " $EXTRAS none " in *" $p "*) ;; *) out="${out:+$out,}$p" ;; esac
  done
  for p in $EXTRAS; do
    case ",$can," in *",$p,"*) out="${out:+$out,}$p" ;; esac
  done
  sed -i '/^COMPOSE_PROFILES=/d' .env
  echo "COMPOSE_PROFILES=${out:-none}" >> .env
}

touch .env
if grep -q '^HOST_PINNED=1' .env; then extras; exit 0; fi

ARCH="$(uname -m)"
CORES="$(nproc)"
MEM="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"

# The render node's driver names the encoder. A Pi has a render node too (its 3D core), and no
# encoder behind it, which is why the driver is read rather than the node's presence.
ENCODER=none
for d in /sys/class/drm/renderD*/device/driver; do
  [ -e "$d" ] || continue
  case "$(basename "$(readlink -f "$d")")" in
    i915|xe) ENCODER=intel; break ;;
    amdgpu)  ENCODER=amd; break ;;
    nvidia)  ENCODER=nvidia; break ;;
  esac
done

ACCEL=none
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then ACCEL=nvidia
elif [ -e /dev/hailo0 ]; then ACCEL=hailo
elif [ -e /dev/apex_0 ]; then ACCEL=coral
else
  # A USB Coral is one id before its firmware loads and another after.
  for u in /sys/bus/usb/devices/*; do
    case "$(cat "$u/idVendor" 2>/dev/null):$(cat "$u/idProduct" 2>/dev/null)" in
      1a6e:089a|18d1:9302) ACCEL=coral; break ;;
    esac
  done
fi

TIER="$(tier "$ARCH" "$CORES" "$MEM" "$ENCODER" "$ACCEL")"
CAN="$(can "$ARCH" "$CORES" "$MEM" "$ENCODER" "$ACCEL")"
# Extras may use every core but one, so a film being converted can always be interrupted by a light.
EXTRAS_CPUS=$(( CORES > 1 ? CORES - 1 : 1 ))

sed -i '/^HOST_TIER=/d; /^HOST_CAN=/d; /^HOST_ENCODER=/d; /^HOST_ACCEL=/d; /^HUB_EXTRAS_CPUS=/d' .env
{
  echo "HOST_TIER=$TIER"
  echo "HOST_CAN=$CAN"
  echo "HOST_ENCODER=$ENCODER"
  echo "HOST_ACCEL=$ACCEL"
  echo "HUB_EXTRAS_CPUS=$EXTRAS_CPUS"
} >> .env
extras
echo "  this hub: $TIER ($CAN)"
