#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# For working on the hub (design/developer/, B): what it follows, and whether SSH lets anybody in.
#
# home-hub-developer.path starts this when the brain writes channel.request or ssh.request into
# brain-data. Like restart.sh and update.sh, THE REQUEST CARRIES STATE AND NEVER A COMMAND, and the state
# is checked again here against rules written here: a channel is one of three names or a branch name of
# a fixed shape, and a key is one line of a type this file lists, with no options in front of it. Anything
# else is dropped and said so in the log. The brain never runs this and holds nothing that could.
#
# What the hub follows is handed to the update the hub already has: HUB_CHANNEL in .env, which install.sh
# reads back (a name it did not write is a typo there, so this writes exactly what it would), and an
# update.request, so the panel's progress, the rollback and the log are the ones every update gets.
#
# The keys This hub was given go in a file of their own, not in the user's authorized_keys, so a key
# added when the card was flashed (Raspberry Pi Imager) survives somebody adding another here. Turning
# SSH off stops the server, which shuts both out. ssh.json always says what is true afterwards.
#
# Safe to run by hand.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
DL="$DIR/driver-layer"; DATA="$DL/brain-data"; ENVF="$DL/.env"
CONF="${HUB_CONF:-/etc/home-hub.conf}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
CH_REQ="$DATA/channel.request"; SSH_REQ="$DATA/ssh.request"; SSH_STATE="$DATA/ssh.json"
KEYS_DIR="${HUB_KEYS_DIR:-/etc/home-hub/ssh}"
SSHD_CONF="${HUB_SSHD_CONF:-/etc/ssh/sshd_config.d/10-home-hub.conf}"
log() { printf '[developer] %s\n' "$*"; }

branch_ok() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$ ]] || return 1
  case "$1" in *..*|*//*|*/|*.|*.lock) return 1 ;; esac
}
KEY_RE='^(ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|ssh-rsa|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/]+={0,3}( [ -~]{0,100})?$'
key_ok() {
  [[ "$1" =~ $KEY_RE ]] || return 1
  case "$1" in ssh-rsa\ *)
    local bits; bits="$(printf '%s\n' "$1" | ssh-keygen -lf - 2>/dev/null | awk '{print $1}')"
    [ "${bits:-0}" -ge 3072 ] ;;
  esac
}

# A flashed Pi's user is pi; anything else has a first user too. HUB_SSH_USER in home-hub.conf says otherwise.
ssh_user() {
  [ -n "${HUB_SSH_USER:-}" ] && { echo "$HUB_SSH_USER"; return; }
  getent passwd 1000 2>/dev/null | cut -d: -f1 | grep . || echo pi
}
ssh_unit() { systemctl list-unit-files ssh.service >/dev/null 2>&1 && echo ssh || echo sshd; }

follow() {
  local want
  want="$(sed -n 's/.*"channel": *"\([^"]*\)".*/\1/p' "$CH_REQ" | head -1)"; rm -f "$CH_REQ"
  case "$want" in
    release|main|development) ;;
    *) branch_ok "$want" || { log "refused a channel that is no branch name"; return 0; } ;;
  esac
  local tmp; tmp="$(mktemp)"
  { grep -v '^HUB_CHANNEL=' "$ENVF" 2>/dev/null; echo "HUB_CHANNEL=$want"; } > "$tmp" && cat "$tmp" > "$ENVF"; rm -f "$tmp"
  printf '{"at": %s, "channel": "%s", "to": "%s"}\n' "$(date +%s)" "$want" "$want" > "$DATA/update.request"
  log "follows $want from now on; updating to it"
}

keys_in() {  # the request's keys, one per line, and "on" or "off" first
  python3 -I -c 'import json, sys
d = json.load(open(sys.argv[1]))
print("on" if d.get("on") is True else "off")
for k in d.get("keys") or []:
    if isinstance(k, str) and "\n" not in k and "\r" not in k: print(k)' "$1" 2>/dev/null
}

let_in() {
  local user want line good=() unit
  user="$(ssh_user)"; unit="$(ssh_unit)"
  { read -r want; while IFS= read -r line; do
      if key_ok "$line"; then good+=("$line"); else log "refused a key line that is not one key of a type this hub takes"; fi
    done; } < <(keys_in "$SSH_REQ")
  rm -f "$SSH_REQ"
  [ "${want:-off}" = on ] && [ ${#good[@]} -eq 0 ] && { log "asked to turn SSH on with no key; leaving it off"; want=off; }
  mkdir -p "$KEYS_DIR" && chmod 0755 "$KEYS_DIR"
  if [ "${want:-off}" = on ]; then printf '%s\n' "${good[@]}" > "$KEYS_DIR/$user.keys"; else : > "$KEYS_DIR/$user.keys"; fi
  chown root:root "$KEYS_DIR/$user.keys" 2>/dev/null; chmod 0644 "$KEYS_DIR/$user.keys"
  if [ "${want:-off}" = on ]; then
    mkdir -p "$(dirname "$SSHD_CONF")"
    cat > "$SSHD_CONF" <<EOF
# Written by home-hub's host/developer.sh when SSH was turned on from This hub. Keys only.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AuthorizedKeysFile .ssh/authorized_keys $KEYS_DIR/%u.keys
EOF
    ssh-keygen -A >/dev/null 2>&1 || true
    systemctl enable --now "$unit" >/dev/null 2>&1 && systemctl reload "$unit" >/dev/null 2>&1
    log "SSH on for $user, with ${#good[@]} key(s)"
  else
    systemctl disable --now "$unit" >/dev/null 2>&1
    log "SSH off"
  fi
}

say() {  # what is true now, whoever asked
  local user unit on=false
  user="$(ssh_user)"; unit="$(ssh_unit)"
  [ "$(systemctl is-active "$unit" 2>/dev/null)" = active ] && on=true
  python3 -I -c 'import json, os, sys, time
on, user, keys, out = sys.argv[1:]
keys = [l.strip() for l in open(keys)] if os.path.exists(keys) else []
json.dump({"on": on == "true", "user": user, "keys": [k for k in keys if k], "at": int(time.time())}, open(out, "w"))' \
    "$on" "$user" "$KEYS_DIR/$user.keys" "$SSH_STATE.new" && mv "$SSH_STATE.new" "$SSH_STATE"
}

[ -f "$CH_REQ" ] && follow
[ -f "$SSH_REQ" ] && let_in
[ -d "$DATA" ] && say
exit 0
