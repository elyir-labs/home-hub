#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Catches a house that stopped answering and nobody is there to notice.
#
# A household's only repair tool is the wall, and the wall is exactly what is missing when the brain
# is down: the panel it draws comes from the hub. Compose restarts a container that CRASHES on its
# own (`restart: unless-stopped`); what has no net under it is a stack that came up wrong -- a part
# left stopped after a power cut -- or a brain that is running and no longer answering. This is that
# net for both, and it is what makes a restart offered
# to somebody three hundred miles from the plug defensible at all (docs/restart.md, pieces 5 and 6).
#
# When a full restart does not bring the brain back, the next look restarts the machine itself, at most
# once in six hours: the case on the panel's ladder that a household could otherwise only reach with the
# plug.
#
# It is deliberately slow to act and loud afterwards. Three misses a minute apart before it moves, so
# a hub busy with an update or a big rebuild is not shot in the head for being slow; and it writes
# restart.json the way the brain does on its way down, so the brain reads it on the way back up and
# says on the panel that it restarted itself. Silent self-healing is how a household ends up running
# on a dying card for a year.
#
# Safe to run by hand.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
DL="$DIR/driver-layer"; DATA="$DL/brain-data"
ALIVE="${HOME_HUB_ALIVE:-http://127.0.0.1:8300/alive}"
LOG="$DATA/restart.log"
MISSES="${HOME_HUB_WATCHDOG_MISSES:-3}"
GAP="${HOME_HUB_WATCHDOG_GAP:-60}"
STEP="${HOME_HUB_WATCHDOG_STEP:-1200}"    # a full restart this recent that the brain still isn't answering after did not help
REST="${HOME_HUB_WATCHDOG_REST:-21600}"   # and the box is restarted by this at most once in this long
TAKES="${HOME_HUB_WATCHDOG_TAKES:-300}"   # a docker that hangs on `compose up` must not hang the watchdog with it
# What this did last and when, kept here rather than in restart.json because the brain clears that one.
# Read with sed, never sourced: the brain can write into this directory.
MEM="$DATA/watchdog.state"
was() { sed -n "s/^$1=\([0-9]*\)$/\1/p" "$MEM" 2>/dev/null | tail -n1; }

# Somebody is already doing something to this house. Every one of these ends in the stack coming back
# up by itself, and a watchdog racing them is a watchdog that breaks the thing it is guarding.
for f in update.request restore.request reset.request restart.request restore.tar.gz; do
  [ -e "$DATA/$f" ] && exit 0
done
for f in update.json restore.json; do
  grep -q '"state": *"running"' "$DATA/$f" 2>/dev/null && exit 0
done

alive() { curl -fsS --max-time 5 "$ALIVE" >/dev/null 2>&1; }

# The parts that should be running and are not. `restart: unless-stopped` has a hole exactly where a
# household makes one: pulled out of the wall, a container can come back from boot marked exited
# (dockerd could not restore it, "layer not mounted") and nothing ever starts it again. The brain goes
# on answering /alive without its broker, so the check below it never fires, and every puck and strip
# sits outside a locked door. That happened on 26 September when the hub moved rooms.
# Restarting ones are compose's own business and are left to it; so is a docker that is not answering.
down() {
  local want have s
  want="$(cd "$DL" && docker compose config --services 2>/dev/null)" || return 0
  have="$(cd "$DL" && docker compose ps -a --format '{{.Service}} {{.State}}' 2>/dev/null)" || return 0
  for s in $want; do
    case "$(printf '%s\n' "$have" | awk -v s="$s" '$1 == s { print $2 }')" in
      running|restarting|paused) ;;
      *) echo "$s" ;;
    esac
  done
}

gone=()
while read -r s; do [ -n "$s" ] && gone+=("$s"); done < <(down)
if [ "${#gone[@]}" -gt 0 ]; then
  # When each one stopped, read BEFORE starting it, because starting it is what wipes that. Docker's
  # own words for it; the brain turns them into a time. Empty for a part that was never created.
  parts=""
  for s in "${gone[@]}"; do
    id="$(cd "$DL" && docker compose ps -a -q "$s" 2>/dev/null | head -n1)"
    stopped="$( [ -n "$id" ] && docker inspect -f '{{.State.FinishedAt}}' "$id" 2>/dev/null )"
    parts="$parts${parts:+,}{\"service\":\"$s\",\"stopped\":\"$stopped\"}"
  done
  boot="$(awk '/^btime/ { print $2 }' /proc/stat 2>/dev/null)"
  # Only those, so nothing that is working is bounced; and no restart.json, because the brain has not
  # stopped and would read it at its next start as a restart that never happened. healed.jsonl is what
  # it reads instead: one line per time this happened, which the brain moves into the house's diary --
  # What happened says it once, and Needs a look says it when it keeps happening (design/healed/).
  printf '{"at":%s,"boot":%s,"parts":[%s]}\n' "$(date +%s)" "${boot:-null}" "$parts" >> "$DATA/healed.jsonl"
  {
    echo "--- $(date -Is) not running: ${gone[*]}; starting them"
    cd "$DL" && docker compose up -d "${gone[@]}"
  } >> "$LOG" 2>&1
  exit 0
fi

alive && exit 0
for _ in $(seq 2 "$MISSES"); do
  sleep "$GAP"
  # Anything that started while we were waiting takes the house back; this stands down.
  for f in update.request restore.request reset.request restart.request; do [ -e "$DATA/$f" ] && exit 0; done
  alive && exit 0
done

now="$(date +%s)"; full="$(was full)"; machine="$(was machine)"

# The next rung. A full restart that the brain still isn't answering after is a box that is stuck below
# the stack -- a wedged docker, a USB radio that has gone deaf, a kernel change waiting for a boot -- and
# only power fixes those. Once in REST, so a hub that is broken in a way rebooting does not fix goes on
# being brought up rather than rebooting all night.
if [ -n "$full" ] && [ $(( now - full )) -lt "$STEP" ] && [ $(( now - ${machine:-0} )) -ge "$REST" ]; then
  printf 'full=%s\nmachine=%s\n' "$full" "$now" > "$MEM"
  {
    echo "--- $(date -Is) the brain is still not answering $(( now - full ))s after a full restart; restarting the machine"
    printf '{"rung":"machine","at":%s,"who":"the hub itself","source":"watchdog"}\n' "$now" > "$DATA/restart.json"
    sync
    systemctl reboot
  } >> "$LOG" 2>&1
  exit 0
fi

# Written before compose runs, so a compose that hangs still counts as the full restart that did not help.
printf 'full=%s\nmachine=%s\n' "$now" "${machine:-}" > "$MEM"
{
  echo "--- $(date -Is) the brain has not answered in $(( MISSES * GAP ))s; bringing the house up"
  # Left where the brain looks for it, so the panel says the hub restarted itself and nobody asked.
  printf '{"rung":"everything","at":%s,"who":"the hub itself","source":"watchdog"}\n' "$now" > "$DATA/restart.json"
  # Recreated, as restart.sh does: a brain that is running and not answering is untouched by a bare `up -d`.
  cd "$DL" && timeout "$TAKES" docker compose up -d --force-recreate --remove-orphans \
    || echo "compose up failed or took longer than ${TAKES}s"
} >> "$LOG" 2>&1
