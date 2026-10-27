#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The hubs and screens on this network, and the images they are flashed from.
#
#   tools/dev.sh devices [host...]   what each one runs, what it follows, how far behind it is, whether SSH gets in
#   tools/dev.sh image [branch]      a Pi image of a branch (this one by default), built by CI and downloaded
#
# A unit flashed from a branch follows that branch until it lands in development (driver-layer/host/landed.sh).
# Knowing which build a screen is on used to mean finding its address, then finding it had no SSH.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
if [ -t 1 ]; then B=$'\033[1m'; D=$'\033[2m'; Y=$'\033[33m'; G=$'\033[32m'; R=$'\033[0m'; else B=; D=; Y=; G=; R=; fi
REPO=elyir-labs/home-hub
USER_AT="${HUB_SSH_USER:-pi}"

found() {  # hosts advertising _home-hub._tcp, which every hub does (install.sh) and no screen does
  if command -v avahi-browse >/dev/null 2>&1; then
    avahi-browse -tpr _home-hub._tcp 2>/dev/null | awk -F';' '$1 == "=" { print $7 }' | sort -u
  elif command -v dns-sd >/dev/null 2>&1; then
    local out; out="$(mktemp)"; dns-sd -B _home-hub._tcp local. > "$out" 2>/dev/null & local pid=$!
    sleep 2; kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
    awk '$2 == "Add" { $1=$2=$3=$4=$5=$6=""; sub(/^ +/, ""); print $0 ".local" }' "$out" | sort -u; rm -f "$out"
  fi
}

ssh_in() {  # host, command -> output; says why when it cannot
  local out rc
  out="$(ssh -o BatchMode=yes -o ConnectTimeout=4 "$USER_AT@$1" "$2" 2>&1)"; rc=$?
  if [ $rc -eq 0 ]; then printf '%s' "$out" | grep -v setlocale; return 0; fi
  case "$out" in
    *"IDENTIFICATION HAS CHANGED"*) echo "!its SSH key changed, as after a reflash: ssh-keygen -R $1" ;;
    *"Permission denied"*)          echo "!SSH is on but takes no key of yours: turn it on from This hub, or add one in Imager" ;;
    *refused*|*"timed out"*)        echo "!SSH is off: turn it on from This hub, or add a key in Imager when flashing" ;;
    *)                              echo "!no SSH: $(printf '%s' "$out" | tail -1)" ;;
  esac
  return 1
}

behind() {  # channel, commit -> a few words
  local ch="$1" sha="$2" n tip
  [ -n "$sha" ] || { echo "cannot tell"; return; }
  if [ "$ch" = release ]; then
    git fetch -q --tags origin 2>/dev/null; tip="$(git tag -l 'v*' --sort=-v:refname | head -1)"
    [ "$(git rev-list -n1 "$tip" 2>/dev/null)" = "$sha" ] && echo "${G}up to date${R}" || echo "${Y}$tip is out${R}"
    return
  fi
  git fetch -q origin "+refs/heads/$ch:refs/remotes/origin/$ch" 2>/dev/null || { echo "${Y}$ch is gone${R}: lands on development"; return; }
  # shellcheck source=driver-layer/host/landed.sh
  . driver-layer/host/landed.sh
  if landed "$ch" .; then echo "${Y}$ch has landed${R}: moves to development on its next update"; return; fi
  git cat-file -e "$sha^{commit}" 2>/dev/null || git fetch -q origin "$sha" 2>/dev/null
  n="$(git rev-list --count "$sha..origin/$ch" 2>/dev/null)" || { echo "on a commit $ch never had"; return; }
  [ "$n" = 0 ] && echo "${G}up to date${R}" || echo "${Y}$n behind $ch${R}"
}

show() {  # host
  local h="$1" alive ver sha brain role ch info code from
  alive="$(curl -s -m 3 "http://$h/alive" 2>/dev/null)"
  # shellcheck disable=SC2016  # expanded on the unit, not here
  info="$(ssh_in "$h" 'grep -E "^(HUB_ROLE|HOME_HUB_BRANCH|HOME_HUB_CHANNEL)=" /etc/home-hub.conf 2>/dev/null
    echo "HEAD=$(sudo -n git -C /opt/home-hub rev-parse HEAD 2>/dev/null)"; echo "ORIGIN=$(sudo -n git -C /opt/home-hub remote get-url origin 2>/dev/null)"
    sudo -n sed -n "s/^HUB_CHANNEL=/ENV_CHANNEL=/p" /opt/home-hub/driver-layer/.env 2>/dev/null')"
  if [ -z "$alive" ] && [ "${info#!}" != "$info" ] && ! ping -c1 -W1000 "$h" >/dev/null 2>&1 && ! ping -c1 -W1 "$h" >/dev/null 2>&1; then
    printf '%s%-16s%s %snot on the network%s\n' "$B" "$h" "$R" "$D" "$R"; return
  fi
  conf() { printf '%s\n' "$info" | sed -n "s/^$1=//p" | tr -d '"' | tail -1; }
  ver="$(printf '%s' "$alive" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')"
  role="$(conf HUB_ROLE)"; [ -n "$alive" ] && role=hub; role="${role:-?}"
  code="$(conf HEAD)"; from="$(conf ORIGIN)"
  brain="$(printf '%s' "$ver" | sed -n 's/.*-\([0-9a-f]\{40\}\)$/\1/p')"
  sha="${brain:-$code}"
  ch="$(conf ENV_CHANNEL)"
  [ -n "$ch" ] || ch="$(conf HOME_HUB_BRANCH)"
  [ -n "$ch" ] || ch="$(conf HOME_HUB_CHANNEL)"
  if [ -z "$ch" ]; then case "$ver" in v[0-9]*|[0-9]*) ch=release ;; ?*-*) ch="${ver%-*}" ;; esac; fi
  printf '%s%-16s%s %-7s %-22s %s\n' "$B" "$h" "$R" "$role" "${ch:-?} ${D}${sha:0:7}${R}" "$(behind "${ch:-release}" "$sha")"
  [ "${info#!}" != "$info" ] && printf '  %s%s%s\n' "$D" "${info#!}" "$R"
  case "$from" in ""|*elyir-labs/home-hub*) ;; *) printf '  %sits code fetches from %s: ssh %s sudo git -C /opt/home-hub remote set-url origin https://github.com/%s.git%s\n' "$Y" "$from" "$USER_AT@$h" "$REPO" "$R" ;; esac
  if [ -n "$brain" ] && [ -n "$code" ] && [ "$brain" != "$code" ]; then
    printf '  %sits code is at %s, its brain at %s%s\n' "$Y" "${code:0:7}" "${brain:0:7}" "$R"
  fi
  return 0
}

devices() {
  local hosts=("$@")
  if [ ${#hosts[@]} -eq 0 ]; then
    while read -r h; do [ -n "$h" ] && hosts+=("$h"); done < <({ echo hub.local; found; echo screen.local; echo screen-2.local; } | awk '!seen[tolower($0)]++')
  fi
  for h in "${hosts[@]}"; do show "$h"; done
}

image() {
  local branch="${1:-$(git rev-parse --abbrev-ref HEAD)}" sha run dir
  command -v gh >/dev/null || { echo "this needs the GitHub CLI (gh)"; exit 1; }
  sha="$(git ls-remote origin "refs/heads/$branch" | cut -f1)"
  [ -n "$sha" ] || { echo "$branch is not on GitHub; push it first (git push -u origin $branch)"; exit 1; }
  run="$(gh run list -R "$REPO" --workflow pi-image.yml --branch "$branch" --json databaseId,headSha,status,conclusion \
        --jq "[.[] | select(.headSha == \"$sha\" and (.conclusion == \"success\" or .status != \"completed\"))][0].databaseId // empty")"
  if [ -z "$run" ]; then
    echo "building a Pi image of $branch at ${sha:0:7} (about 15 minutes)"
    gh workflow run pi-image.yml -R "$REPO" --ref "$branch" >/dev/null || exit 1
    for _ in $(seq 1 20); do
      run="$(gh run list -R "$REPO" --workflow pi-image.yml --branch "$branch" --json databaseId,headSha --jq "[.[] | select(.headSha == \"$sha\")][0].databaseId // empty")"
      [ -n "$run" ] && break; sleep 3
    done
    [ -n "$run" ] || { echo "the build did not show up; see https://github.com/$REPO/actions/workflows/pi-image.yml"; exit 1; }
  else
    echo "an image of $branch at ${sha:0:7} is already built or building"
  fi
  gh run watch "$run" -R "$REPO" --exit-status >/dev/null || { echo "the build failed: https://github.com/$REPO/actions/runs/$run"; exit 1; }
  dir="${HUB_IMAGES:-$HOME/Downloads}/home-hub-${branch//\//-}-${sha:0:7}"
  mkdir -p "$dir" && gh run download "$run" -R "$REPO" -n home-hub-image -D "$dir" || exit 1
  (cd "$dir" && shasum -a 256 -c ./*.sha256 >/dev/null 2>&1) && echo "${G}checksum matches${R}" || echo "${Y}could not check the checksum${R}"
  echo
  echo "$B$dir$R"; ls -1 "$dir" | sed 's/^/  /'
  cat <<EOF

In Raspberry Pi Imager: Use custom, pick the .img.xz, then Edit settings > Services >
Enable SSH with public-key authentication only, and paste $(ls ~/.ssh/id_*.pub 2>/dev/null | head -1 || echo "your public key").
The image ships with SSH off; this is the one way in until it can be turned on from This hub.
It follows $branch until $branch lands in development, then development.
EOF
}

case "${1:-devices}" in
  devices) shift || true; devices "$@" ;;
  image)   shift || true; image "$@" ;;
  *)       sed -n '4,7p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
