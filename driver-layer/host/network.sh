#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The only thing in this product that talks to NetworkManager.
#
# Two ways in, and they are the same two the update and restart paths already use:
#
#   network.sh                 write brain-data/network.json: what this hub is connected to.
#                              home-hub-network.timer runs this once a minute.
#   network.sh (with a request) brain-data/network.request appeared. home-hub-network.path starts
#                              this, it does the one thing the file asks for, and deletes it.
#
# THE REQUEST NAMES A VERB AND NEVER A COMMAND. Four of them -- scan, join, forget, off -- checked
# again below against a list written here rather than sent from there. An SSID and a password are
# DATA: they are read into shell variables and handed to nmcli as single arguments, never evaluated,
# never concatenated into a command line. update.sh makes the same point about the version it is
# handed and restart.sh about the rung; keep the three shaped alike so a reader of one recognizes
# the others.
#
# WHAT THIS NEVER WRITES IS A PASSWORD. network.json rides the backup and is read by anything that
# can read the data volume; NetworkManager already keeps the PSK at 0600 under /etc and there is no
# reason for a second copy. The brain holds whatever was typed at the panel and knows it might be
# for a different network -- that is bridge.wifi_for_pucks()'s whole job.
#
# A HUB WITH NO NETWORK MAKES ONE OF ITS OWN (docs/network.md, piece 5; design/setup-network/, A).
# Every tick, a hub that is on nothing -- no cable, no Wi-Fi -- and has a setup password in
# /etc/home-hub.conf starts a Wi-Fi called HUB_SETUP_SSID, the code on its label joins it, and the
# phone is sent to the panel at 10.42.0.1 to say which Wi-Fi is the house's. Where the card can do
# both at once it runs on a second interface, so the hub can try the house's Wi-Fi without dropping
# the phone that is telling it the password. It goes the moment the hub is online, and never exists
# on a hub without a password to put on it: an open network in somebody's house is not a default.
#
# Safe to run by hand.
set -uo pipefail
DIR="${HOME_HUB_DIR:-/opt/home-hub}"
DL="$DIR/driver-layer"; DATA="$DL/brain-data"
REQ="$DATA/network.request"; STATE="$DATA/network.json"; LOG="$DATA/network.log"
# How long a new connection has to prove itself before this puts the old one back. Long enough for
# DHCP on a slow router, short enough that nobody has gone to find a keyboard.
SETTLE="${HOME_HUB_NETWORK_SETTLE:-180}"
CONF="${HUB_CONF:-/etc/home-hub.conf}"
SYS_NET="${HUB_NET:-/sys/class/net}"
SETUP_CON=home-hub-setup; SETUP_IF=hubsetup0; SETUP_ADDR=10.42.0.1
SETUP="$DATA/network.setup"; JOINED="$DATA/network.joined"; OFFLINE="$DATA/network.offline"
# The setup Wi-Fi's password, for the one screen plugged into this hub to show (design/screen-wifi/, C). A
# file of its own because network.setup is copied whole into network.json, which anything can read; this
# one is root's alone, and exists only while that Wi-Fi does.
KEY="$DATA/network.setup-key"
# How long a hub is on nothing before it offers its own Wi-Fi. Short on a hub that has never had a
# Wi-Fi, because somebody is standing there with the box; long on one that had one, because a router
# rebooting is not a reason to start broadcasting.
FIRST_WAIT="${HOME_HUB_SETUP_FIRST:-30}"; LOST_WAIT="${HOME_HUB_SETUP_LOST:-300}"
# After the hub joins, its own Wi-Fi stays up this long so the phone can be told it worked.
HOLD="${HOME_HUB_SETUP_HOLD:-120}"
# On a card that cannot do both, the setup Wi-Fi takes the radio a saved network would need, so every
# so often it steps aside while nobody is on it, and the saved one gets a chance to come back.
RETRY="${HOME_HUB_SETUP_RETRY:-600}"
SETUP_SSID=""; SETUP_PASS=""
if [ -r "$CONF" ]; then
  SETUP_SSID="$(sed -n 's/^HUB_SETUP_SSID=//p' "$CONF" | tail -1 | tr -d '"')"
  SETUP_PASS="$(sed -n 's/^HUB_SETUP_PASS=//p' "$CONF" | tail -1 | tr -d '"')"
fi

have() { command -v "$1" >/dev/null 2>&1; }
say() { echo "$(date -Is) $*" >> "$LOG"; }

# ---------------------------------------------------------------- what is true now

# nmcli's terse output, one field, for one device.
dev_field() { nmcli -t -g "$1" device show "$2" 2>/dev/null | head -1; }

write_state() {
  local tmp="$STATE.tmp" first=1
  {
    printf '{"at": %s, "hostname": "%s", "links": [' "$(date +%s)" "$(hostname -s 2>/dev/null || echo hub)"
    # Every wired and wireless device NetworkManager admits to, with what it is doing. A device that
    # is present but down still belongs here: "this hub has a radio and is not using it" is a
    # different sentence from "this hub has no radio", and the panel has to tell them apart.
    while IFS=: read -r name type state _; do
      [ -n "$name" ] || continue
      [ "$name" = "$SETUP_IF" ] && continue          # the hub's own setup Wi-Fi is not a way onto anything
      local kind
      case "$type" in ethernet) kind=ethernet ;; wifi) kind=wifi ;; *) continue ;; esac
      local up=false ip="" ssid="" signal="" band=""
      [ "$state" = "connected" ] && up=true
      ip="$(dev_field IP4.ADDRESS "$name" | cut -d/ -f1)"
      if [ "$kind" = ethernet ] && [ "$state" = unmanaged ]; then
        # Ubuntu Server gives the cable to systemd-networkd and NetworkManager only reports it as
        # unmanaged, which read as "no cable" on a hub plugged into its router. A real port has a
        # device behind it (a container's veth does not); a plugged-in one has carrier and an address.
        [ -e "$SYS_NET/$name/device" ] || continue
        ip="$(ip -4 -o addr show dev "$name" 2>/dev/null | awk '{print $4; exit}' | cut -d/ -f1)"
        [ "$(cat "$SYS_NET/$name/carrier" 2>/dev/null)" = 1 ] && [ -n "$ip" ] && up=true
      fi
      if [ "$kind" = wifi ]; then
        # The line nmcli marks with a * is the one this device is actually on.
        local row
        row="$(nmcli -t -f IN-USE,SSID,SIGNAL,FREQ device wifi list ifname "$name" 2>/dev/null | grep '^\*' | head -1)"
        ssid="$(echo "$row" | cut -d: -f2)"
        signal="$(echo "$row" | cut -d: -f3)"
        case "$(echo "$row" | cut -d: -f4)" in 5*|6*) band=5 ;; 2*) band=2.4 ;; esac
      fi
      [ $first -eq 1 ] || printf ','
      first=0
      printf '{"kind":"%s","device":"%s","up":%s,"ip":"%s"' "$kind" "$name" "$up" "$ip"
      [ -n "$ssid" ] && printf ',"ssid":%s' "$(json_str "$ssid")"
      [ -n "$signal" ] && printf ',"signal":%s' "$signal"
      [ -n "$band" ] && printf ',"band":"%s"' "$band"
      printf '}'
    done < <(nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device 2>/dev/null)
    printf ']'
    # Anything the last scan found, and anything the last join is still being judged on, are kept
    # across a state write: they are slower-moving facts than a link's IP and re-deriving them every
    # minute would mean scanning every minute.
    [ -f "$DATA/network.scan" ] && printf ', "scan": %s, "scanned": %s' "$(cat "$DATA/network.scan")" "$(stat -c %Y "$DATA/network.scan" 2>/dev/null || stat -f %m "$DATA/network.scan")"
    [ -f "$DATA/network.moving" ] && printf ', "moving": %s' "$(cat "$DATA/network.moving")"
    [ -f "$DATA/network.reverted" ] && printf ', "reverted": %s' "$(json_str "$(cat "$DATA/network.reverted")")"
    [ -f "$DATA/network.reverted-why" ] && printf ', "reverted_why": %s' "$(json_str "$(cat "$DATA/network.reverted-why")")"
    [ -f "$SETUP" ] && printf ', "setup": %s, "setup_phones": %s' "$(cat "$SETUP")" "$(setup_phones)"
    [ -f "$JOINED" ] && printf ', "joined": %s' "$(cat "$JOINED")"
    printf '}\n'
  } > "$tmp" 2>/dev/null && mv "$tmp" "$STATE"
}

# A shell string into a JSON string, without pulling in a JSON library for four values. An SSID may
# contain a quote, a backslash or a stray byte, and a state file that will not parse is a panel that
# says the hub has no network at all.
json_str() { printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '""'; }

scan() {
  local dev; dev="$(wifi_dev)"
  nmcli device wifi rescan ${dev:+ifname "$dev"} >/dev/null 2>&1
  sleep 4
  # Every access point, not one row per name: a house's Wi-Fi is usually one name on two bands, and
  # the hub's own setup Wi-Fi can only share a channel on 2.4 GHz, so which one is where matters.
  nmcli -t -f SSID,SIGNAL,FREQ,SECURITY,BSSID,CHAN device wifi list --rescan no 2>/dev/null | OWN="$SETUP_SSID" python3 -c '
import json, os, sys
rows = []
for line in sys.stdin:
    # nmcli escapes a colon inside a field as \:, so unescape before splitting on the real ones.
    parts, cur, esc = [], "", False
    for ch in line.rstrip("\n"):
        if esc: cur += ch; esc = False
        elif ch == "\\": esc = True
        elif ch == ":": parts.append(cur); cur = ""
        else: cur += ch
    parts.append(cur)
    if len(parts) < 6 or not parts[0] or parts[0] == os.environ.get("OWN"): continue
    try: signal = int(parts[1])
    except ValueError: signal = -1
    freq = parts[2].split()[0] if parts[2] else ""
    rows.append({"ssid": parts[0], "signal": signal, "secure": parts[3].strip() not in ("", "--"),
                 "band": "5" if freq[:1] in ("5", "6") else "2.4" if freq[:1] == "2" else None,
                 "bssid": parts[4], "chan": parts[5]})
rows.sort(key=lambda r: -r["signal"])
out, at = [], {}
for r in rows:
    if r["ssid"] not in at:
        at[r["ssid"]] = {"ssid": r["ssid"], "signal": r["signal"] if r["signal"] >= 0 else None, "band": r["band"], "secure": r["secure"]}
        out.append(at[r["ssid"]])
    if r["band"] == "2.4" and "b24" not in at[r["ssid"]]:
        at[r["ssid"]]["b24"] = {"bssid": r["bssid"], "chan": r["chan"]}
print(json.dumps(out))' > "$DATA/network.scan.tmp" 2>/dev/null \
    && mv "$DATA/network.scan.tmp" "$DATA/network.scan"
}

# One field of the last scan, for one network: `b24.chan` is the 2.4 GHz channel it is strongest on.
seen_field() {
  python3 -c 'import json,sys
for n in json.load(open(sys.argv[1])):
    if n.get("ssid") == sys.argv[2]:
        v = n
        for k in sys.argv[3].split("."): v = (v or {}).get(k)
        print(v or ""); break' "$DATA/network.scan" "$1" "$2" 2>/dev/null
}

# ---------------------------------------------------------------- the hub's own Wi-Fi

# The radio a house's Wi-Fi goes on: the first wireless device that is not the setup Wi-Fi.
# How many phones are on the hub's own Wi-Fi, so the screen on the hub can step aside for one.
setup_phones() {
  local ifname="$SETUP_IF"; ip link show "$SETUP_IF" >/dev/null 2>&1 || ifname="$(wifi_dev)"
  iw dev "$ifname" station dump 2>/dev/null | grep -c '^Station'
}
wifi_dev() { nmcli -t -f DEVICE,TYPE device 2>/dev/null | awk -F: -v s="$SETUP_IF" '$2=="wifi" && $1!=s {print $1; exit}'; }

# Online is a default route out of the house through anything but the setup Wi-Fi -- which never has
# one -- so a cable NetworkManager does not manage counts as much as a Wi-Fi it does.
online() { ip route show default 2>/dev/null | grep -v "dev $SETUP_IF" | grep -q .; }

# Can this card hold the setup Wi-Fi and join another at the same time? The kernel lists what each card
# can run at once; both modes have to be in the same combination. Without `iw` there is no asking, and
# the answer is no: the single-radio way still works, it just cannot say a password was wrong on the
# phone that typed it.
#
# The Pi's own chip (brcmfmac) lists the combination but cannot keep it up: with the card's own interface
# joined to nothing, it keeps scanning, and the setup Wi-Fi on the second interface never reached a phone.
# Found on a Pi 5 on 23 October 2026, "up on hubsetup0" in the log and invisible to every phone in the room.
both_at_once() {
  have iw || return 1
  [ "$(basename "$(readlink "$SYS_NET/$1/device/driver" 2>/dev/null)")" = brcmfmac ] && return 1
  local phy; phy="$(cat "$SYS_NET/$1/phy80211/name" 2>/dev/null)"; [ -n "$phy" ] || return 1
  iw phy "$phy" info 2>/dev/null | awk '/valid interface combinations/{on=1; next} on && /^\t[A-Z]/{on=0} on' \
    | tr -d '\n' | tr '*' '\n' | grep -q 'managed.*AP\|AP.*managed'
}

setup_up() {
  local dev chan ifname both=false
  # Raspberry Pi OS starts with Wi-Fi switched off until a country is set, which left a hub on nothing with no way on.
  nmcli radio wifi on >/dev/null 2>&1
  dev="$(wifi_dev)"
  [ -n "$dev" ] || return 1
  scan                       # before the radio is busy: a card hosting a network may not scan at all
  # The strongest 2.4 GHz channel nearby is most likely the house's own, which is the channel the hub
  # will have to be on to try it without dropping the phone.
  chan="$(python3 -c 'import json,sys
c=[n["b24"]["chan"] for n in json.load(open(sys.argv[1])) if n.get("b24")]
print(c[0] if c else 6)' "$DATA/network.scan" 2>/dev/null || echo 6)"
  ifname="$dev"
  if both_at_once "$dev"; then
    ip link show "$SETUP_IF" >/dev/null 2>&1 || iw dev "$dev" interface add "$SETUP_IF" type __ap >/dev/null 2>&1
    if ip link show "$SETUP_IF" >/dev/null 2>&1; then
      nmcli device set "$SETUP_IF" managed yes >/dev/null 2>&1; ifname="$SETUP_IF"; both=true
    fi
  fi
  nmcli connection delete "$SETUP_CON" >/dev/null 2>&1
  # The password reaches nmcli as one argument, as the house's own does in join().
  nmcli connection add type wifi ifname "$ifname" con-name "$SETUP_CON" autoconnect no ssid "$SETUP_SSID" \
    802-11-wireless.mode ap 802-11-wireless.band bg 802-11-wireless.channel "$chan" \
    ipv4.method shared ipv4.addresses "$SETUP_ADDR/24" ipv6.method disabled \
    wifi-sec.key-mgmt wpa-psk wifi-sec.proto rsn wifi-sec.pairwise ccmp wifi-sec.group ccmp wifi-sec.pmf disable \
    wifi-sec.psk "$SETUP_PASS" >/dev/null 2>&1
  if nmcli connection up "$SETUP_CON" >/dev/null 2>&1; then
    printf '{"ssid": %s, "both": %s, "since": %s, "chan": "%s"}' "$(json_str "$SETUP_SSID")" "$both" "$(date +%s)" "$chan" > "$SETUP"
    (umask 077; printf '%s' "$SETUP_PASS" > "$KEY")
    say "setup: $SETUP_SSID up on $ifname, channel $chan (both at once: $both)"
  else
    say "setup: $SETUP_SSID would not start on $ifname"
    nmcli connection delete "$SETUP_CON" >/dev/null 2>&1
    [ "$ifname" = "$SETUP_IF" ] && iw dev "$SETUP_IF" del >/dev/null 2>&1
    return 1
  fi
}

setup_down() {
  nmcli connection delete "$SETUP_CON" >/dev/null 2>&1
  ip link show "$SETUP_IF" >/dev/null 2>&1 && iw dev "$SETUP_IF" del >/dev/null 2>&1
  # The house's Wi-Fi was joined on the 2.4 GHz side so the two could share a channel. Let it go back
  # to choosing for itself, which on most routers is 5 GHz (piece 4 prefers it).
  if [ -f "$JOINED" ]; then
    local ssid; ssid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["ssid"])' "$JOINED" 2>/dev/null)"
    if [ -n "$ssid" ]; then
      nmcli connection modify "$ssid" 802-11-wireless.bssid "" >/dev/null 2>&1 && nmcli connection up "$ssid" >/dev/null 2>&1
    fi
  fi
  rm -f "$SETUP" "$JOINED" "$KEY"
  say "setup: down"
}

# Once a tick, and never while a request is being handled: whether the setup Wi-Fi should exist.
setup_tick() {
  if [ -z "$SETUP_PASS" ] || [ -z "$SETUP_SSID" ]; then
    [ -f "$SETUP" ] && setup_down
    return
  fi
  local now; now=$(date +%s)
  if online; then
    rm -f "$OFFLINE"
    if [ -f "$SETUP" ]; then
      local at; at="$(python3 -c 'import json,sys; print(int(json.load(open(sys.argv[1]))["at"]))' "$JOINED" 2>/dev/null || echo 0)"
      [ $(( now - at )) -lt "$HOLD" ] || setup_down
    fi
    return
  fi
  if [ -f "$SETUP" ]; then
    # On a card that can't do both, a saved network can only come back if the setup Wi-Fi steps
    # aside. Only while nobody is on it: somebody halfway through typing a password keeps it.
    local since; since="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["since"])' "$SETUP" 2>/dev/null || echo "$now")"
    if grep -q '"both": false' "$SETUP" && [ $(( now - since )) -ge "$RETRY" ] && saved_wifi \
       && [ -z "$(iw dev "$(wifi_dev)" station dump 2>/dev/null)" ]; then
      setup_down; echo "$now" > "$OFFLINE"
    fi
    return
  fi
  [ -f "$OFFLINE" ] || echo "$now" > "$OFFLINE"
  local wait=$FIRST_WAIT; saved_wifi && wait=$LOST_WAIT
  [ $(( now - $(cat "$OFFLINE") )) -ge "$wait" ] && setup_up
}

# A hub that started without internet (install.sh) finishes installing once it is online. Not more
# often than every two minutes: a route out is not proof the registry answers, and an install that
# finds it still cannot reach it leaves the mark again.
FINISH="${HUB_FINISH:-/var/lib/home-hub/finish-install}"
finish_install() {
  [ -f "$FINISH" ] && online || return 0
  local age; age=$(( $(date +%s) - $(stat -c %Y "$FINISH" 2>/dev/null || stat -f %m "$FINISH") ))
  [ "$age" -ge "${HOME_HUB_FINISH_WAIT:-120}" ] || return 0
  local channel; channel="$(head -1 "$FINISH")"; rm -f "$FINISH"
  say "online: finishing the install that started without internet"
  have systemd-run && systemd-run --no-block --collect --unit=home-hub-finish \
    -E HOME_HUB_DIR="$DIR" -E HOME_HUB_CHANNEL="${channel:-release}" "$DIR/install.sh" >/dev/null 2>&1
}

saved_wifi() { nmcli -t -f NAME,TYPE connection show 2>/dev/null | grep ':802-11-wireless$' | grep -qv "^$SETUP_CON:"; }

# ---------------------------------------------------------------- moving this hub

# Did it actually work? Not "is the brain answering" -- the brain is on the host's loopback and
# answers perfectly well on a machine with no network at all, which is exactly the failure this is
# supposed to catch. The test is the network's own: the device is connected, it has an address, and
# something at the other end of the wire answers.
came_up() {
  local dev="$1" deadline=$(( $(date +%s) + SETTLE ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if [ "$(dev_field GENERAL.STATE "$dev" | cut -d' ' -f2 | tr -d '()')" = "connected" ]; then
      local gw; gw="$(dev_field IP4.GATEWAY "$dev")"
      if [ -n "$(dev_field IP4.ADDRESS "$dev")" ] && [ -n "$gw" ] && ping -c1 -W3 "$gw" >/dev/null 2>&1; then
        return 0
      fi
    fi
    sleep 5
  done
  return 1
}

join() {
  local ssid="$1" pass="$2"
  local dev; dev="$(wifi_dev)"
  if [ -z "$dev" ]; then say "join: this machine has no wireless device"; return 1; fi
  # What to go back to. A hub on a cable has nothing to lose here and this is empty, which is the
  # right answer: adding Wi-Fi to a wired hub cannot strand it and must not pretend it can. On a card
  # that cannot do both it is the setup Wi-Fi, and putting it back is exactly what a typo needs.
  local was; was="$(nmcli -t -f NAME,DEVICE connection show --active 2>/dev/null | awk -F: -v d="$dev" '$2==d{print $1; exit}')"
  printf '{"ssid": %s, "since": %s}' "$(json_str "$ssid")" "$(date +%s)" > "$DATA/network.moving"
  rm -f "$DATA/network.reverted" "$DATA/network.reverted-why" "$JOINED"
  write_state
  say "join: $ssid on $dev (was: ${was:-nothing})"

  # Trying the house's Wi-Fi while the setup Wi-Fi stays up means both on one channel, and the setup
  # Wi-Fi is 2.4 GHz. So the hub joins the house's 2.4 GHz side, moving its own Wi-Fi to that channel
  # first if it has to (the phone rejoins it by itself in a few seconds); setup_down lets it go later.
  local pin=()
  if [ -f "$SETUP" ] && grep -q '"both": true' "$SETUP"; then
    local bssid chan; bssid="$(seen_field "$ssid" b24.bssid)"; chan="$(seen_field "$ssid" b24.chan)"
    if [ -n "$bssid" ]; then
      pin=(bssid "$bssid")
      if ! grep -q "\"chan\": \"$chan\"" "$SETUP"; then
        nmcli connection modify "$SETUP_CON" 802-11-wireless.channel "$chan" >/dev/null 2>&1
        nmcli connection up "$SETUP_CON" >/dev/null 2>&1
        python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); d["chan"]=sys.argv[2]; json.dump(d,open(sys.argv[1],"w"))' "$SETUP" "$chan" 2>/dev/null
        say "join: setup Wi-Fi moved to channel $chan to share it with $ssid"
      fi
    fi
  fi

  # The password reaches nmcli as one argument and is never evaluated. It is briefly visible in the
  # process list, which on this machine means visible to root, which is what is running this script.
  # nmcli waits for the router's answer, so a wrong password is known in seconds, not after SETTLE.
  local out=""
  if [ -n "$pass" ]; then out="$(nmcli --wait 45 device wifi connect "$ssid" password "$pass" ifname "$dev" ${pin[@]+"${pin[@]}"} 2>&1)"
  else out="$(nmcli --wait 45 device wifi connect "$ssid" ifname "$dev" ${pin[@]+"${pin[@]}"} 2>&1)"; fi
  local said=$?

  if [ $said -eq 0 ] && came_up "$dev"; then
    say "join: $ssid came up"
    rm -f "$DATA/network.moving"
    # The setup Wi-Fi stays a little longer, so the phone on it can be told this worked (setup_tick).
    [ -f "$SETUP" ] && printf '{"ssid": %s, "at": %s}' "$(json_str "$ssid")" "$(date +%s)" > "$JOINED"
  else
    # The case this whole script exists for. Nothing reached the far end, so put back whatever was
    # working and say which network did not take, and why if the router said -- the panel names both.
    local why=unreachable
    case "$out" in *[Ss]ecrets*|*802-1[Xx]*|*password*|*4-way*|*handshake*) why=password ;; esac
    say "join: $ssid did not come up ($why); putting back ${was:-the previous connection}"
    nmcli connection delete "$ssid" >/dev/null 2>&1
    [ -n "$was" ] && nmcli connection up "$was" >/dev/null 2>&1
    if [ -f "$SETUP" ] && ! nmcli -t -f NAME connection show --active 2>/dev/null | grep -qx "$SETUP_CON"; then
      nmcli connection up "$SETUP_CON" >/dev/null 2>&1
    fi
    printf '%s' "$ssid" > "$DATA/network.reverted"
    printf '%s' "$why" > "$DATA/network.reverted-why"
    rm -f "$DATA/network.moving"
  fi
  write_state
}

forget() {
  local ssid="$1"
  [ -n "$ssid" ] || return 1
  nmcli connection delete "$ssid" >/dev/null 2>&1
  say "forget: $ssid"
}

# ---------------------------------------------------------------- the one thing being asked

if ! have nmcli; then
  # Not a failure worth a log line every minute: it is a permanent property of this machine, and the
  # brain reads the absence of network.json as "nobody can change this from here" and says so.
  exit 0
fi

if [ -f "$REQ" ]; then
  DO="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("do",""))' "$REQ" 2>/dev/null)"
  SSID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("ssid",""))' "$REQ" 2>/dev/null)"
  PASS="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("password",""))' "$REQ" 2>/dev/null)"
  rm -f "$REQ"
  case "$DO" in
    scan)   scan ;;
    join)   join "$SSID" "$PASS" ;;
    forget) forget "$SSID" ;;
    off)    nmcli radio wifi off >/dev/null 2>&1; say "radio off" ;;
    *)      say "not a thing this hub knows how to do: ${DO:-<nothing>} -- nothing done" ;;
  esac
else
  setup_tick
  finish_install
fi

write_state
