#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The update path, exercised rather than read.
#
# Everything under host/ is the safety net for a hub in somebody's house: the undo that puts a build
# back when it does not start, the signature that decides what may run as root, and the hold that
# stops a bad release spreading. Until this existed CI checked their syntax and nothing more, which
# is the weakest possible guarantee about the three scripts a household most depends on and can
# least repair. docs/updates.md.
#
# It needs git, openssl, curl and python3 and nothing else -- no docker, no network, no root. The
# registry and the releases server are a directory and a `file://` URL; the only Docker in here is a
# shell script on PATH that prints what the daemon would have said.
#
#   driver-layer/host/tests.sh            all of it
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PASS=0; FAIL=0

ok() { PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
no() { FAIL=$((FAIL + 1)); printf '  \033[31m✗\033[0m %s — %s\n' "$1" "$2"; }
is() { [ "$2" = "$3" ] && ok "$1" || no "$1" "wanted $3, got $2"; }
group() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# A hub: a checkout with two releases on it, sitting on the older one.
hub() {
  local dir="$1"
  mkdir -p "$dir/driver-layer/brain-data" "$dir/driver-layer/host"
  cp "$HERE/verify.sh" "$dir/driver-layer/host/"          # the hub has its own copy; channel.sh reads it
  git init -q "$dir"; git -C "$dir" config user.email t@t; git -C "$dir" config user.name t
  echo old > "$dir/f"; git -C "$dir" add -A; git -C "$dir" commit -qm old; git -C "$dir" tag v0.2.0
  echo new > "$dir/f"; git -C "$dir" add -A; git -C "$dir" commit -qm new; git -C "$dir" tag v0.3.0
  git -C "$dir" reset -q --hard v0.2.0
}

keypair() { openssl genpkey -algorithm ed25519 -out "$1" 2>/dev/null; openssl pkey -in "$1" -pubout -out "$2" 2>/dev/null; }
sign() { openssl pkeyutl -sign -inkey "$2" -rawin -in "$1" -out "$1.sig"; }

manifest() {  # file, version, commit, min_from
  cat > "$1" <<J
{
  "schema": 1,
  "version": "$2",
  "commit": "$3",
  "brain": "ghcr.io/elyir-labs/home-hub-brain@sha256:aaaa",
  "images": {
    "caddy": "caddy@sha256:bbbb",
    "mosquitto": "eclipse-mosquitto@sha256:cccc"
  },
  "min_from": "${4:-v0.1.0}"
}
J
}

channel_file() {  # file, held version (or empty), made
  cat > "$1" <<J
{
  "schema": 1,
  "made": "${3:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}",
  "hold": [
    "${2:-v9.9.9}"
  ],
  "rollout": {}
}
J
}

# Run verify_release in a subshell so the sourced functions and exports never leak between cases.
verify() {  # keys dir, releases dir, hub dir -> prints rc
  ( HOME_HUB_KEYS="$1" HOME_HUB_RELEASES="file://$2" . "$HERE/verify.sh" >/dev/null 2>&1
    verify_release v0.3.0 "$3" >/dev/null 2>&1; echo $? )
}


# ---------------------------------------------------------------- what may run as root in a house
signatures() {
  group "A release is what the maker signed, or it is not installed"
  local root; root="$(mktemp -d)"
  local dir="$root/hub" serve="$root/serve" keys="$root/keys"
  mkdir -p "$serve/v0.3.0" "$keys"; hub "$dir"
  local commit; commit="$(git -C "$dir" rev-list -n 1 v0.3.0)"
  local old; old="$(git -C "$dir" rev-list -n 1 v0.2.0)"
  keypair "$root/maker.pem" "$keys/release.pub"
  keypair "$root/thief.pem" "$root/thief.pub"
  local m="$serve/v0.3.0/release.json"

  manifest "$m" v0.3.0 "$commit"; sign "$m" "$root/maker.pem"
  is "signed by the maker, tag and commit agree: installs" "$(verify "$keys" "$serve" "$dir")" 0

  manifest "$m" v0.3.0 "$old"; sign "$m" "$root/maker.pem"
  is "the tag was moved onto another commit: refuses" "$(verify "$keys" "$serve" "$dir")" 1

  manifest "$m" v0.3.0 "$commit"; sign "$m" "$root/thief.pem"
  is "signed by a key this hub does not hold: refuses" "$(verify "$keys" "$serve" "$dir")" 1

  manifest "$m" v0.3.0 "$commit"; sign "$m" "$root/maker.pem"
  manifest "$m" v0.3.0 "$old"                                  # edited after signing
  is "the record was changed after signing: refuses" "$(verify "$keys" "$serve" "$dir")" 1

  manifest "$m" v0.3.0 "$commit"; sign "$m" "$root/maker.pem"; rm -f "$m.sig"
  is "no signature published at all: refuses" "$(verify "$keys" "$serve" "$dir")" 1

  manifest "$m" v9.9.9 "$commit"; sign "$m" "$root/maker.pem"
  is "the record names a different version: refuses" "$(verify "$keys" "$serve" "$dir")" 1

  manifest "$m" v0.3.0 "$commit" v0.2.5; sign "$m" "$root/maker.pem"
  is "an upgrade path below min_from: refuses" "$(verify "$keys" "$serve" "$dir")" 1

  manifest "$m" v0.3.0 "$commit"; sign "$m" "$root/maker.pem"
  is "a hub with no keys yet says so rather than pretending" "$(verify "$root/no-keys-here" "$serve" "$dir")" 2

  # What a good verification leaves the caller holding, under the names docker-compose.yml reads: a
  # spelling mistake here is silent, and every image quietly comes down by tag instead of by digest.
  local got
  got="$( HOME_HUB_KEYS="$keys" HOME_HUB_RELEASES="file://$serve" . "$HERE/verify.sh" >/dev/null 2>&1
          verify_release v0.3.0 "$dir" >/dev/null 2>&1
          echo "$VERIFIED_COMMIT ${HUB_BRAIN_IMAGE##*@} $(echo "$HUB_IMAGE_VARS" | xargs)" )"
  is "the caller is left the commit to check out" "${got%% *}" "$commit"
  case "$got" in
    *"sha256:aaaa HUB_IMG_CADDY HUB_IMG_MOSQUITTO"*) ok "...the brain digest and one HUB_IMG_ per service" ;;
    *) no "...the brain digest and one HUB_IMG_ per service" "got: $got" ;;
  esac

  # install.sh calls this from inside go_to_ref, under set -u. A cleanup trap that outlived the check
  # fired again when go_to_ref returned, found its variable gone, and stopped every verified install
  # after the checkout had already moved -- so update.sh put it back, and the house never updated.
  got="$( bash -c 'set -euo pipefail
                   HOME_HUB_KEYS="$1" HOME_HUB_RELEASES="file://$2" . "$4/verify.sh" >/dev/null 2>&1
                   hub="$3"; go() { verify_release v0.3.0 "$hub" >/dev/null 2>&1; }
                   go; echo carried-on' _ "$keys" "$serve" "$dir" "$HERE" 2>&1 )"
  is "the installer carries on past a verified release" "$got" carried-on
  rm -rf "$root"
}


# ------------------------------------------------------- and what the maker is saying about it now
holds() {
  group "A release the maker has pulled since signing it"
  local root; root="$(mktemp -d)"
  local dir="$root/hub" serve="$root/serve" keys="$root/keys"
  mkdir -p "$serve/v0.3.0" "$serve/channel" "$keys"; hub "$dir"
  local commit; commit="$(git -C "$dir" rev-list -n 1 v0.3.0)"
  keypair "$root/maker.pem" "$keys/release.pub"
  keypair "$root/thief.pem" "$root/thief.pub"
  manifest "$serve/v0.3.0/release.json" v0.3.0 "$commit"; sign "$serve/v0.3.0/release.json" "$root/maker.pem"

  local fetch='HOME_HUB_DIR="'"$dir"'" HOME_HUB_KEYS="'"$keys"'" HOME_HUB_RELEASES="file://'"$serve"'"'
  ask() { eval "$fetch" "$HERE/channel.sh" >/dev/null 2>&1; }
  local c="$serve/channel/channel.json"

  channel_file "$c" v9.9.9; sign "$c" "$root/maker.pem"; ask
  is "nothing held: installs" "$(verify "$keys" "$serve" "$dir")" 0

  channel_file "$c" v0.3.0; sign "$c" "$root/maker.pem"; ask
  is "held by the maker: refuses" "$(verify "$keys" "$serve" "$dir")" 1

  channel_file "$c" v0.3.0; sign "$c" "$root/thief.pem"; ask
  is "a hold signed by somebody else withholds nothing" "$(verify "$keys" "$serve" "$dir")" 0
  [ -f "$dir/driver-layer/brain-data/channel.json" ] \
    && no "...and is not written to disk" "it was written" || ok "...and is not written to disk"

  channel_file "$c" v0.3.0 2020-09-16T00:00:00Z; sign "$c" "$root/maker.pem"; ask
  is "a genuine hold replayed from years ago is ignored" "$(verify "$keys" "$serve" "$dir")" 0

  rm -f "$c" "$c.sig"; ask
  is "a maker who publishes nothing holds nothing" "$(verify "$keys" "$serve" "$dir")" 0

  # The one that caught a harness lying about all of the above: without verify.sh there is no way to
  # check a channel file, and a hub that cannot check one must not be told by one.
  channel_file "$c" v0.3.0; sign "$c" "$root/maker.pem"; ask
  rm -f "$dir/driver-layer/host/verify.sh"; ask
  [ -f "$dir/driver-layer/brain-data/channel.json" ] \
    && no "a hub that cannot check a hold drops the one it had" "it kept it" \
    || ok "a hub that cannot check a hold drops the one it had"
  rm -rf "$root"
}


# ------------------------------------------------------------------- and the undo, which is piece 1
undo() {
  group "An update that does not come back is put back"
  local root; root="$(mktemp -d)"
  local dir="$root/hub" bin="$root/bin" fake="$root/fake" data
  data="$dir/driver-layer/brain-data"
  mkdir -p "$bin" "$fake"; hub "$dir"
  local old new; old="$(git -C "$dir" rev-list -n 1 v0.2.0)"; new="$(git -C "$dir" rev-list -n 1 v0.3.0)"

  cat > "$bin/docker" <<'D'
#!/usr/bin/env bash
case "$1 ${2:-}" in
  "inspect --format") echo "sha256:oldimageid" ;;
  "image inspect")    echo "ghcr.io/elyir-labs/home-hub-brain@sha256:olddigest" ;;
  "compose up")       touch "$FAKE/answering" ;;   # the old brain is back and answering
esac
D
  cat > "$bin/curl" <<'C'
#!/usr/bin/env bash
[ -f "$FAKE/answering" ]
C
  cat > "$bin/systemctl" <<'S'
#!/usr/bin/env bash
exit 0
S
  chmod +x "$bin/docker" "$bin/curl" "$bin/systemctl"

  start() {  # $1 = whether the installer succeeds, $2 = whether the new build answers
    git -C "$dir" reset -q --hard "$old"
    printf 'HUB_CHANNEL=release\nTZ=UTC\n' > "$dir/driver-layer/.env"
    cat > "$dir/install.sh" <<I
#!/usr/bin/env bash
git -C "$dir" reset -q --hard "$new"
printf '{"phase":"restarting","at":%s}\\n' "\$(date +%s)" >> "\$HUB_PROGRESS"
[ "$1" = ok ] && { [ "$2" = ok ] && touch "\$FAKE/answering"; exit 0; }
exit 1
I
    chmod +x "$dir/install.sh"
    rm -f "$fake/answering"
    printf '{"at":1,"channel":"release","from":"v0.2.0","to":"v0.3.0"}' > "$data/update.request"
  }
  run() { PATH="$bin:$PATH" FAKE="$fake" HOME_HUB_DIR="$dir" HOME_HUB_UPDATE_WAIT=4 HOME_HUB_UPDATE_SETTLE=1 \
          "$HERE/update.sh" >/dev/null 2>&1; }
  state() { sed -n 's/.*"state":"\([a-z]*\)".*/\1/p' "$data/update.json"; }
  # The phases, in the order they were written. This is the panel's only clock and the only place the
  # dark stretch is measurable, so what is checked here is that the two scripts write to the SAME file
  # -- update.sh's own phases and the ones install.sh adds from inside its run.
  phases() { sed -n 's/.*"phase": *"\([a-z_]*\)".*/\1/p' "$data/update.progress" 2>/dev/null | tr '\n' ' ' | sed 's/ $//'; }
  at() { git -C "$dir" rev-parse HEAD; }

  start ok ok
  printf '{"phase":"proving","at":1}\n' > "$data/update.progress"   # last time's, and not this time's
  run
  is "it installed and came back: done" "$(state)" 'done'
  is "...and the hub is on the new build" "$(at)" "$new"
  is "...and left a timeline, the installer's phases in it too" "$(phases)" 'checking restarting proving'

  start ok no; run
  is "it installed and did not come back: reverted" "$(state)" reverted
  # The six minutes this piece exists for. A panel cannot hear this phase -- the brain is not there to
  # be asked -- but the hub that comes back can, which is how "that one did not start" gets said at all.
  is "...and the putting back is on the record" "$(phases)" 'checking restarting putting_back proving'
  is "...and the hub is back where it was" "$(at)" "$old"
  case "$(cat "$dir/driver-layer/.env")" in
    *"HUB_BRAIN_IMAGE=ghcr.io/elyir-labs/home-hub-brain@sha256:olddigest"*)
      ok "...with the old image pinned, so nothing walks back onto the new one" ;;
    *) no "...with the old image pinned" "no pin in .env" ;;
  esac

  start fail no; run
  is "the installer stopped part way: put back" "$(at)" "$old"
  is "...and says so" "$(state)" failed

  start ok ok; run >/dev/null
  [ -f "$data/update.request" ] && no "the request never survives a run" "it is still there" \
                                || ok "the request never survives a run, so a hub cannot loop"
  rm -rf "$root"
}


# What a stick is taken for. One substring in one pattern decided that an ESP32 bridge puck was a
# Z-Wave controller -- zwave-js-ui held its port open for as long as it was plugged in, and the hub
# could never talk to its own puck. The matching is pure and radios.sh can be asked about one name
# without touching anything, so there is no reason for it not to be held here.
radios() {
  group "which radio is which"
  local r="$HERE/../radios.sh"
  taken() { "$r" which "$1"; }

  is "an ESP32 bridge puck is not a radio, whatever its serial number reads" \
     "$(taken usb-1a86_USB_Single_Serial_5A46080020-if00)" none
  is "...and neither is one on its native USB port" \
     "$(taken usb-Espressif_USB_JTAG_serial_debug_unit_34:85:18:AB-if00)" none
  # The pattern the puck collided with. It is there for a real stick and has to keep finding it.
  is "an 800-series Z-Wave stick still is one" \
     "$(taken usb-ZOOZ_800_Z-Wave_Stick_533D004242-if00)" zwave
  # Two radios on one plug: -if00 is the Z-Wave side and -if01 an EM3581 Zigbee2MQTT cannot drive.
  is "the HubZ is Z-Wave on -if00" \
     "$(taken usb-Silicon_Labs_HubZ_Smart_Home_Controller_C1301AAC-if00-port0)" zwave
  is "...and nothing on -if01, rather than Zigbee it cannot use" \
     "$(taken usb-Silicon_Labs_HubZ_Smart_Home_Controller_C1301AAC-if01-port0)" none
  is "a SkyConnect is Zigbee" "$(taken usb-Nabu_Casa_SkyConnect_v1.0_9e2a4f-if00)" zigbee
  is "a Sonoff dongle is Zigbee" "$(taken usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus_abc123-if00)" zigbee
  # A product that simply ends in a word must keep it, or the stripping eats the name.
  is "a stick with no serial in its name is still read by its product" \
     "$(taken usb-dresden_elektronik_ingenieurtechnik_GmbH_ConBee_II-if00)" none
}


# ------------------------------------------------------- a part left stopped after the plug was pulled
# The broker came back from a power cut marked exited and nothing started it; the brain kept answering,
# so the watchdog, which only asked the brain, saw a healthy house while every puck was locked out.
watchdog() {
  group "A part that did not come back after a power cut is started"
  local root; root="$(mktemp -d)"
  local dir="$root/hub" bin="$root/bin" fake="$root/fake" data
  data="$dir/driver-layer/brain-data"
  mkdir -p "$bin" "$fake" "$data"

  # $FAKE/states is what `compose ps -a` would print; `compose up` is written down, not done.
  cat > "$bin/docker" <<'D'
#!/usr/bin/env bash
[ -f "$FAKE/no-daemon" ] && exit 1
case "$1 ${2:-} ${3:-}" in
  "compose config --services") printf 'mosquitto\nhomeassistant\nbrain\n' ;;
  "compose ps -a")             [ "${4:-}" = -q ] && echo "id-$5" || cat "$FAKE/states" ;;
  "inspect -f {{.State.FinishedAt}}") echo "2026-09-26T22:29:45.477055085Z" ;;
  "compose up -d")             shift 3; echo "$*" >> "$FAKE/up" ;;
esac
D
  cat > "$bin/curl" <<'C'
#!/usr/bin/env bash
[ -f "$FAKE/answering" ]
C
  chmod +x "$bin/docker" "$bin/curl"

  run() {  # states, one "service state" per line
    printf '%b' "$1" > "$fake/states"; rm -f "$fake/up" "$data/restart.json" "$data/healed.jsonl"
    PATH="$bin:$PATH" FAKE="$fake" HOME_HUB_DIR="$dir" HOME_HUB_WATCHDOG_GAP=0 "$HERE/watchdog.sh" >/dev/null 2>&1
  }
  up() { cat "$fake/up" 2>/dev/null || echo nothing; }
  touch "$fake/answering"

  run 'mosquitto exited\nhomeassistant running\nbrain running\n'
  is "the broker left exited is started, and only it" "$(up)" mosquitto
  [ -f "$data/restart.json" ] && no "...without telling the brain it restarted" "restart.json was written" \
                              || ok "...without telling the brain it restarted, because it did not"
  # What the brain reads to say so on What happened: the part, and when Docker says it stopped.
  python3 -c 'import json,sys; r=json.loads(open(sys.argv[1]).read()); print(r["parts"][0]["service"], r["parts"][0]["stopped"][:19], "at" in r)' \
    "$data/healed.jsonl" > "$fake/said" 2>&1
  is "...and writes down what it started, and when that stopped" "$(cat "$fake/said")" "mosquitto 2026-09-26T22:29:45 True"

  run 'homeassistant running\nbrain running\n'
  is "a part that was never created is started" "$(up)" mosquitto

  run 'mosquitto restarting\nhomeassistant running\nbrain running\n'
  is "a part compose is already restarting is left to compose" "$(up)" nothing

  run 'mosquitto running\nhomeassistant running\nbrain running\n'
  is "a whole house is left alone" "$(up)" nothing
  [ -f "$data/healed.jsonl" ] && no "...and writes nothing down" "healed.jsonl was written" || ok "...and writes nothing down"

  touch "$data/update.request"
  run 'mosquitto exited\nhomeassistant running\nbrain running\n'
  is "an update in flight is not raced" "$(up)" nothing
  rm -f "$data/update.request"

  touch "$fake/no-daemon"
  run 'mosquitto exited\n'
  is "a docker that does not answer starts nothing" "$(up)" nothing
  rm -rf "$root"
}

# ------------------------------------------------------------ outside, turned on and off from the panel
# The values arrive from a service on the internet by way of the brain and land in a file docker compose
# reads as root, so the one property worth proving is that nothing that does not look like a house's
# value ever gets in -- and that the line everybody shares, COMPOSE_PROFILES, keeps the radios'.
away() {
  group "Outside, on and off, and nothing odd reaches .env"
  local root; root="$(mktemp -d)"
  local dir="$root/hub" bin="$root/bin" fake="$root/fake" data dl
  dl="$dir/driver-layer"; data="$dl/brain-data"
  mkdir -p "$bin" "$fake" "$data"
  cat > "$bin/docker" <<'D'
#!/usr/bin/env bash
echo "$*" >> "$FAKE/docker"
D
  # What `ip route get` says this host's address on the LAN is; $FAKE/lan changes it.
  cat > "$bin/ip" <<'I'
#!/usr/bin/env bash
echo "1.1.1.1 via 192.168.1.1 dev eth0 src $(cat "$FAKE/lan" 2>/dev/null || echo 192.168.1.53) uid 0"
I
  chmod +x "$bin/docker" "$bin/ip"
  local secret token; secret="$(printf 's%.0s' $(seq 43))"; token="$(printf 'a%.0s' $(seq 64))"
  good() { printf 'HUB_AWAY_HOUSE=jordan\nHUB_RELAY_SECRET=%s\nHUB_RELAY_TOKEN=%s\nHUB_RELAY_ADDR=relay.elyir.app\nHUB_AWAY_ZONE=elyir.app\n' "$secret" "$token" > "$data/away.env"; }
  run() { printf '{"at": 1, "want": "%s"}' "$1" > "$data/away.request"; rm -f "$fake/docker"
          PATH="$bin:$PATH" FAKE="$fake" HOME_HUB_DIR="$dir" "$HERE/away.sh" >/dev/null 2>&1; }
  env_() { grep -m1 "^$1=" "$dl/.env" | cut -d= -f2-; }

  printf 'TZ=UTC\nCOMPOSE_PROFILES=zigbee,voice\n' > "$dl/.env"
  good; run on
  is "on writes the house's name" "$(env_ HUB_AWAY_HOUSE)" jordan
  is "...and its secret" "$(env_ HUB_RELAY_SECRET)" "$secret"
  is "...and turns the away door on" "$(env_ HUB_AWAY)" on
  is "...adding away beside the radios and the voice" "$(env_ COMPOSE_PROFILES)" "zigbee,voice,away"
  is "...and brings caddy, frpc and lan-cert up" "$(cat "$fake/docker")" "compose up -d caddy frpc lan-cert"
  is "...naming the house at home from the address it really has" "$(env_ HUB_LAN_NAME)" "192-168-1-53.jordan.home.elyir.app"
  [ -f "$data/away.request" ] && no "...and takes the request away" "it is still there" || ok "...and takes the request away"
  python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["on"], d["house"])' "$data/away.json" > "$fake/said" 2>&1
  is "...and says what it did" "$(cat "$fake/said")" "True jordan"

  run on
  is "on twice is still one away" "$(env_ COMPOSE_PROFILES)" "zigbee,voice,away"

  run off
  is "off turns the door off" "$(env_ HUB_AWAY)" off
  is "...takes away out and leaves the rest" "$(env_ COMPOSE_PROFILES)" "zigbee,voice"
  is "...keeps the name for when it comes back" "$(env_ HUB_AWAY_HOUSE)" jordan
  is "...and stops frpc and lan-cert" "$(head -1 "$fake/docker")" "compose --profile away rm -sf frpc lan-cert"

  good; run on; : > "$data/away.env"; run forget
  is "forget takes the secret out of .env" "$(grep -c '^HUB_RELAY_SECRET=' "$dl/.env")" 0
  is "...and the name" "$(grep -c '^HUB_AWAY_HOUSE=' "$dl/.env")" 0
  is "...and the name at home" "$(grep -c '^HUB_LAN_NAME=' "$dl/.env")" 0

  printf 'TZ=UTC\n' > "$dl/.env"; echo 203.0.113.9 > "$fake/lan"; good; run on
  is "a public address gets no name at home" "$(grep -c '^HUB_LAN_NAME=' "$dl/.env")" 0
  is "...and outside still comes on" "$(env_ HUB_AWAY)" on
  rm -f "$fake/lan"

  printf 'COMPOSE_PROFILES=away\n' > "$dl/.env"; good; run off
  is "the last profile going leaves none rather than nothing" "$(env_ COMPOSE_PROFILES)" none

  local before
  for bad in 'HUB_AWAY_HOUSE=jordan|evil' 'HUB_AWAY_HOUSE=Jordan' 'HUB_AWAY_HOUSE=-jordan' "HUB_RELAY_SECRET=x" 'HUB_RELAY_SECRET=abc$(reboot)defghijklmnop' \
             'HUB_RELAY_ADDR=relay.elyir.app;rm' 'HUB_AWAY_ZONE=elyir.app;HUB_IMG_BRAIN=evil/brain'; do
    printf 'TZ=UTC\nCOMPOSE_PROFILES=none\n' > "$dl/.env"; before="$(cat "$dl/.env")"
    good; key="${bad%%=*}"; grep -v "^$key=" "$data/away.env" > "$fake/v"; printf '%b\n' "$bad" >> "$fake/v"; mv "$fake/v" "$data/away.env"
    run on
    [ "$(cat "$dl/.env")" = "$before" ] && [ ! -f "$fake/docker" ] && ok "refused, .env untouched: $bad" || no "refused, .env untouched: $bad" "$(cat "$dl/.env")"
  done

  # A line away.sh does not ask for is never read: only its five keys are, each by its own pattern.
  printf 'TZ=UTC\n' > "$dl/.env"; good; printf 'HUB_IMG_BRAIN=evil/brain\n' >> "$data/away.env"; run on
  is "a key it does not ask for never reaches .env" "$(grep -c '^HUB_IMG_BRAIN=' "$dl/.env")" 0

  printf 'TZ=UTC\n' > "$dl/.env"; before="$(cat "$dl/.env")"
  run 'sideways'
  is "a want it does not know does nothing" "$(cat "$dl/.env")" "$before"
  printf '{"at": 1, "want": "on; reboot"}' > "$data/away.request"; good; rm -f "$fake/docker"
  PATH="$bin:$PATH" FAKE="$fake" HOME_HUB_DIR="$dir" "$HERE/away.sh" >/dev/null 2>&1
  is "a want with anything after it is not a want" "$(cat "$dl/.env")" "$before"
  rm -rf "$root"
}


# A unit with a screen asks this before it installs a hub of its own (design/companion/, C). The
# network is a script on PATH: avahi-browse says who announced themselves, curl says who answers like
# a hub, and hostname says which addresses are this unit's own.
finding() {
  group "a screen looks for the house's hub before it builds a second house"
  local root bin; root=$(mktemp -d); bin="$root/bin"; mkdir -p "$bin"
  cat > "$bin/avahi-browse" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$ANNOUNCED"
SH
  # A hub's front door answers only the names it was installed with (driver-layer/caddy/Caddyfile):
  # HUBS is the list of them; anything else gets Caddy's empty page.
  cat > "$bin/curl" <<'SH'
#!/usr/bin/env bash
for a in "$@"; do case "$a" in http://*) url=$a ;; esac; done
case " $HUBS " in *" ${url%/phones/me} "*) echo '{"locked": true, "paired": false, "home": "Maple Court"}' ;; *) exit 0 ;; esac
SH
  printf '#!/usr/bin/env bash\n[ "$1" = -I ] && echo "$MINE" || echo "$NAME"\n' > "$bin/hostname"
  chmod +x "$bin"/*
  find_hub() { PATH="$bin:$PATH" FIND_FOR=0 NAME="${NAME:-screen}" "$HERE/../../startup/find-hub.sh"; }

  local hub='=;eth0;IPv4;hub;_home-hub._tcp;local;hub.local;192.168.1.20;80;"path=/"'
  is "a hub that answers is found, by its name" "$(ANNOUNCED="$hub" HUBS="http://hub.local http://192.168.1.20" MINE="192.168.1.30" find_hub)" "http://hub.local"
  is "...asked by its name, because its front door has forgotten the address the router gave it since" \
    "$(ANNOUNCED="$hub" HUBS="http://hub.local" MINE="192.168.1.30" find_hub)" "http://hub.local"
  ANNOUNCED="" HUBS="" MINE="192.168.1.30" find_hub >/dev/null; is "no hub, and it says so" "$?" "1"
  ANNOUNCED="$hub" HUBS="" MINE="192.168.1.30" find_hub >/dev/null; is "something announcing itself that does not answer like a hub is not one" "$?" "1"
  is "its own announcement is not another hub" "$(ANNOUNCED="$hub" HUBS="http://hub.local" MINE="192.168.1.20" find_hub)" ""
  local self='=;lo;IPv4;hub-2;_home-hub._tcp;local;hub-2.local;127.0.0.1;80;"path=/"'
  is "...nor is its own name, on loopback" "$(ANNOUNCED="$self" HUBS="http://hub-2.local" MINE="192.168.1.30" NAME=hub-2 find_hub)" ""
  # A unit installed as a hub once is still called hub, and avahi calls it hub-2: the real hub.local is not it.
  is "a unit that was once called hub still finds the real one" "$(ANNOUNCED="$hub" HUBS="http://hub.local" MINE="192.168.1.30" NAME=hub find_hub)" "http://hub.local"
  local odd='=;eth0;IPv4;hub;_home-hub._tcp;local;hub.local;192.168.1.20;8300;"path=/"'
  is "a hub on another port keeps its port" "$(ANNOUNCED="$odd" HUBS="http://hub.local:8300" MINE="" find_hub)" "http://hub.local:8300"
  local bare='=;eth0;IPv4;hub;_home-hub._tcp;local;;192.168.1.20;80;"path=/"'
  is "an announcement with no name is asked by its address" "$(ANNOUNCED="$bare" HUBS="http://192.168.1.20" MINE="" find_hub)" "http://192.168.1.20"
  rm -rf "$root"
}


# A screen opens the hub by its name, and the name is found by asking the whole Wi-Fi. When the Wi-Fi
# stops hearing the answers the hub is still right there, so the address it last had is kept in the
# hosts file, refreshed whenever the name answers and the thing answering is a hub.
keeping() {
  group "a screen keeps the hub's address for when its name stops answering"
  local root bin hosts; root=$(mktemp -d); bin="$root/bin"; hosts="$root/hosts"; mkdir -p "$bin"
  printf '#!/usr/bin/env bash\n[ -n "${ANSWER:-}" ] && printf "%%s\\t%%s\\n" "$3" "$ANSWER"\nexit 0\n' > "$bin/avahi-resolve"
  printf '#!/usr/bin/env bash\necho "$*" >> "%s/curled"\n[ "${ALIVE:-yes}" = yes ]\n' "$root" > "$bin/curl"
  chmod +x "$bin"/*
  keep() { PATH="$bin:$PATH" HUB_HOSTS="$hosts" ELYIR_PANEL_URL="${URL:-http://hub.local/?screen=1}" "$HERE/../../startup/keep-hub.sh" >/dev/null; }
  kept() { grep 'keep-hub' "$hosts" | cut -f1,2 | tr '\t' ' '; }
  printf '127.0.0.1\tlocalhost\n127.0.1.1\tscreen\n' > "$hosts"

  ANSWER=192.168.1.20 keep
  is "the name answers: its address is written down" "$(kept)" "192.168.1.20 hub.local"
  is "...beside what was already there" "$(head -2 "$hosts" | cut -f2 | tr '\n' ' ')" "localhost screen "
  is "...after asking the hub at that address, by its name" "$(tail -1 "$root/curled")" "-fsS -m 3 -o /dev/null --resolve hub.local:80:192.168.1.20 http://hub.local:80/alive"
  ANSWER="" keep
  is "the name stops answering: the address last seen is kept" "$(kept)" "192.168.1.20 hub.local"
  ANSWER=192.168.1.44 keep
  is "the hub moved: the new address replaces the old, once" "$(kept)" "192.168.1.44 hub.local"
  ANSWER=192.168.1.99 ALIVE=no keep
  is "something answering the name that is not a hub is not believed" "$(kept)" "192.168.1.44 hub.local"
  rm -f "$root/curled"; ANSWER=192.168.1.20 URL="http://192.168.1.20/?screen=1" keep
  is "a screen opening an address has nothing to keep" "$([ -f "$root/curled" ] && echo asked || echo left)" "left"
  ANSWER=192.168.1.20 URL="http://localhost/?screen=1" keep
  is "...nor does a hub's own screen" "$([ -f "$root/curled" ] && echo asked || echo left)" "left"
  ANSWER=192.168.1.21 URL="http://hub-2.local:8300/?screen=1" keep
  is "a hub on another name and port is asked on that port" "$(tail -1 "$root/curled" | cut -d" " -f7)" "hub-2.local:8300:192.168.1.21"
  rm -rf "$root"
}

# Wi-Fi that dozes misses what is said to everyone, including the key that unlocks it, and stays deaf
# until it rejoins. Hubs and screens are on mains: the radio is told never to doze, now and from now on.
awake() {
  group "Wi-Fi stays awake on hubs and screens"
  local root bin; root=$(mktemp -d); bin="$root/bin"; mkdir -p "$bin" "$root/nm" "$root/net/wlan0/wireless" "$root/net/eth0"
  printf '#!/usr/bin/env bash\necho "iw $*" >> "%s/asked"\n[ "$3" = get ] && echo "Power save: $(cat "%s/ps")"\nexit 0\n' "$root" "$root" > "$bin/iw"
  printf '#!/usr/bin/env bash\necho "nmcli $*" >> "%s/asked"\n' "$root" > "$bin/nmcli"
  chmod +x "$bin"/*
  wake() { rm -f "$root/asked"; PATH="$bin:$PATH" HUB_NM="$root/nm" HUB_NET="$root/net" "$HERE/wifi-awake.sh" >/dev/null; }
  echo on > "$root/ps"; wake
  is "NetworkManager is told for every connection" "$(grep '^wifi.powersave' "$root/nm/conf.d/home-hub-wifi.conf")" "wifi.powersave = 2"
  is "...and rereads its settings" "$(grep -c 'nmcli general reload conf' "$root/asked")" "1"
  is "the radio up now is woken without rejoining" "$(grep -c 'iw dev wlan0 set power_save off' "$root/asked")" "1"
  is "...and a wired port is left alone" "$(grep -c eth0 "$root/asked")" "0"
  echo off > "$root/ps"; wake
  is "run again, nothing is rewritten or set twice" "$(grep -c 'reload\|set power_save' "$root/asked")" "0"
  rm -rf "$root/nm"; wake
  is "a box without NetworkManager gets no settings file" "$([ -e "$root/nm" ] && echo written || echo none)" "none"
  rm -rf "$root"
}

# A Pi wall plays its sound on the screen it is plugged into: the card on the connected HDMI port. sysfs and
# /proc/asound are directories here.
speaking() {
  group "the wall's sound comes out of the screen it is plugged into"
  local root; root=$(mktemp -d); mkdir -p "$root/home" "$root/drm/card1-HDMI-A-1" "$root/drm/card1-HDMI-A-2" "$root/asound"
  plug() { echo "$1" > "$root/drm/card1-HDMI-A-1/status"; echo "$2" > "$root/drm/card1-HDMI-A-2/status"
    HOME="$root/home" HUB_DRM="$root/drm" HUB_ASOUND="$root/asound" "$HERE/../../startup/wall.sh" speaker; }
  said() { grep -o 'hdmi:CARD=[a-z0-9]*' "$root/home/.asoundrc" 2>/dev/null || echo nothing; }

  touch "$root/asound/vc4hdmi0" "$root/asound/vc4hdmi1"
  plug connected disconnected
  is "a screen on the first port plays through the first HDMI card" "$(said)" "hdmi:CARD=vc4hdmi0"
  plug disconnected connected
  is "moved to the second port, the sound follows it" "$(said)" "hdmi:CARD=vc4hdmi1"
  plug disconnected disconnected
  is "a DSI screen has no HDMI to point at, and nothing is left behind" "$(said)" "nothing"
  rm -f "$root/asound/"*; plug connected disconnected
  is "a box whose HDMI card is not a Pi's keeps ALSA's own default" "$(said)" "nothing"
  rm -rf "$root"
}

# What first boot makes of a unit: the house's screen, or the house's hub. Never a second hub beside a
# real one when the unit was told it is a screen (design/companion/, C). The checkout is fake: its
# installers leave a file saying they ran, and find-hub.sh answers with $FOUND or nothing.
becoming() {
  group "first boot makes a screen, or a hub, and never a second hub when told it is a screen"
  local root dir bin drm; root=$(mktemp -d); dir="$root/opt"; bin="$root/bin"; drm="$root/drm"
  mkdir -p "$dir/startup" "$bin" "$drm"
  printf '#!/usr/bin/env bash\n[ -n "${FOUND:-}" ] && echo "$FOUND"\n' > "$dir/startup/find-hub.sh"
  printf '#!/usr/bin/env bash\ntouch "%s/screen-installed"\n' "$root" > "$dir/startup/install.sh"
  printf '#!/usr/bin/env bash\ntouch "%s/hub-installed"\n' "$root" > "$dir/install.sh"
  for c in hostnamectl apt-get avahi-browse; do printf '#!/usr/bin/env bash\nexit 0\n' > "$bin/$c"; done
  # systemctl and docker write down what they were asked, so a unit that was a hub can be seen to stop being one
  printf '#!/usr/bin/env bash\necho "systemctl $*" >> "%s/asked"\n[ "$1" = list-unit-files ] && printf "home-hub-watchdog.timer enabled enabled\\nhome-hub-update.path enabled enabled\\n"\nexit 0\n' "$root" > "$bin/systemctl"
  printf '#!/usr/bin/env bash\necho "docker $* in $PWD" >> "%s/asked"\n' "$root" > "$bin/docker"
  mkdir -p "$dir/driver-layer" "$root/avahi"; touch "$dir/driver-layer/docker-compose.yml"
  chmod +x "$dir/startup/"*.sh "$dir/install.sh" "$bin"/*
  boot() {   # role, found, dsi, hdmi, the board's model
    rm -f "$root"/*-installed "$root/done" "$root/conf" "$root/asked"; rm -rf "${drm:?}"/*
    echo '<service-group/>' > "$root/avahi/home-hub.service"
    [ -n "$1" ] && echo "HUB_ROLE=\"$1\"" > "$root/conf"
    [ -n "$3" ] && { mkdir -p "$drm/card1-DSI-1"; echo connected > "$drm/card1-DSI-1/status"; }
    mkdir -p "$drm/card1-HDMI-A-1"; if [ -n "${4:-}" ]; then echo connected; else echo disconnected; fi > "$drm/card1-HDMI-A-1/status"
    printf '%s' "${5:-}" > "$root/model"
    PATH="$bin:$PATH" FOUND="$2" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" HUB_FIRSTBOOT_MARK="$root/done" HUB_DRM="$drm" HUB_AVAHI="$root/avahi" \
      HUB_MODEL="$root/model" "$HERE/firstboot.sh" >/dev/null 2>&1
  }
  wall() { cat "$root/asked" 2>/dev/null | grep -c 'systemctl start --no-block elyir-wall.service' || true; }
  ran() { local out=""; for k in hub screen; do [ -f "$root/$k-installed" ] && out="$out$k "; done; [ -f "$root/done" ] && out="${out}done"; echo "${out% }"; }

  boot screen http://hub.local ""
  is "told it is a screen, on HDMI, with a hub on the Wi-Fi: it becomes the screen and nothing else" "$(ran)" "screen done"
  is "...and opens the hub's panel as a screen" "$(grep '^ELYIR_PANEL_URL=' "$root/conf")" 'ELYIR_PANEL_URL="http://hub.local/?screen=1"'
  is "...now, not at the next boot" "$(wall)" "1"
  is "...a hub it used to be stops: its timers and watchers are switched off" "$(grep -c 'systemctl disable --now home-hub-watchdog.timer home-hub-update.path' "$root/asked")" "1"
  is "...its house is taken down" "$(grep -c "docker compose down in $dir/driver-layer" "$root/asked")" "1"
  is "...and it no longer says it is a hub" "$([ -f "$root/avahi/home-hub.service" ] && echo still || echo gone)" "gone"
  is "...said once, not appended twice" "$(grep -c '^HUB_ROLE=' "$root/conf")" "1"
  boot screen "" ""; local code=$?
  is "told it is a screen, and no hub found: no hub installed, and it tries again next start" "$(ran)" ""
  is "...and says it did not finish" "$code" "1"
  boot "" http://hub.local dsi
  is "the wall's own screen and a hub on the Wi-Fi: the screen, without being told" "$(ran)" "screen done"
  boot "" "" dsi
  is "the wall's own screen and no hub: it runs the house, on its own screen" "$(ran)" "hub screen done"
  is "...shown now, not at the next boot" "$(wall)" "1"
  boot "" http://hub.local "" hdmi "Intel(R) NUC"
  is "a monitor on a NUC's HDMI and nobody said screen: a hub, as before, whatever is on the Wi-Fi" "$(ran)" "hub done"
  is "...and a hub keeps its house: nothing taken down" "$(cat "$root/asked" 2>/dev/null | grep -c 'compose down\|disable')" "0"
  is "...and no wall" "$(wall)" "0"
  boot "" "" "" hdmi "Raspberry Pi 4 Model B Rev 1.5"
  is "a Pi with a monitor on HDMI and no hub: it runs the house, on that monitor" "$(ran)" "hub screen done"
  is "...shown now, not at the next boot" "$(wall)" "1"
  boot "" http://hub.local "" hdmi "Raspberry Pi 4 Model B Rev 1.5"
  is "a Pi with a monitor on HDMI and a hub on the Wi-Fi: that hub's screen" "$(ran)" "screen done"
  boot "" "" "" "" "Raspberry Pi 4 Model B Rev 1.5"
  is "a Pi with nothing plugged in: a hub, and no wall" "$(ran) $(wall)" "hub done 0"
  boot hub http://hub.local dsi
  is "HUB_ROLE=hub skips the look" "$(ran)" "hub screen done"
  rm -rf "$root"
}


# A reinstall is a stick in a USB port, never a card taken out: first boot puts USB first in a Pi's
# bootloader. rpi-eeprom-config prints what the bootloader holds now and keeps what it is given.
usb_first() {
  group "first boot makes a USB stick boot first on a Pi, and leaves anything else alone"
  local root dir bin; root=$(mktemp -d); dir="$root/opt"; bin="$root/bin"
  mkdir -p "$dir/startup" "$bin"
  printf '#!/usr/bin/env bash\n' > "$dir/startup/find-hub.sh"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$dir/install.sh"
  for c in hostnamectl apt-get avahi-browse systemctl docker rpi-eeprom-update reboot; do printf '#!/usr/bin/env bash\nexit 0\n' > "$bin/$c"; done
  printf '#!/usr/bin/env bash\nif [ "${1:-}" = --apply ]; then cp "$2" "%s/applied"; else cat "%s/eeprom"; fi\n' "$root" "$root" > "$bin/rpi-eeprom-config"
  chmod +x "$dir/startup/"*.sh "$dir/install.sh" "$bin"/*
  boot() {  # the board's model, what its bootloader holds now, /etc/home-hub.conf
    rm -f "$root/applied" "$root/done"
    printf '%s\0' "$1" > "$root/model"; printf '%b' "$2" > "$root/eeprom"; printf '%s\n' "${3:-}" > "$root/conf"
    PATH="$bin:$PATH" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" HUB_FIRSTBOOT_MARK="$root/done" HUB_DRM="$root/drm" \
      HUB_MODEL="$root/model" "$HERE/firstboot.sh" >/dev/null 2>&1
  }
  applied() { cat "$root/applied" 2>/dev/null | tr '\n' ' ' | sed 's/ $//'; }

  boot "Raspberry Pi 5 Model B Rev 1.0" '[all]\nBOOT_ORDER=0xf461\nPOWER_OFF_ON_HALT=0\n'
  is "a Pi 5 tries USB, then NVMe, then the card, and keeps its other settings" "$(applied)" "[all] BOOT_ORDER=0xf164 POWER_OFF_ON_HALT=0"
  boot "Raspberry Pi Compute Module 5 Rev 1.0" '[all]\nWAKE_ON_GPIO=1\n'
  is "a CM5 with no order of its own gets one under [all]" "$(applied)" "[all] BOOT_ORDER=0xf164 WAKE_ON_GPIO=1"
  boot "Raspberry Pi 4 Model B Rev 1.5" '[all]\nBOOT_ORDER=0xf41\n'
  is "a Pi 4 tries USB, then the card" "$(applied)" "[all] BOOT_ORDER=0xf14"
  boot "Raspberry Pi 5 Model B Rev 1.0" ''
  is "a bootloader with no settings at all still gets the order" "$(applied)" "BOOT_ORDER=0xf164"
  boot "Raspberry Pi 5 Model B Rev 1.0" '[all]\nBOOT_ORDER=0xf164\n'
  is "already in that order: nothing is rewritten" "$(applied)" ""
  boot "Raspberry Pi 5 Model B Rev 1.0" '[all]\nBOOT_ORDER=0xf461\n' 'HUB_USB_FIRST=0'
  is "HUB_USB_FIRST=0 leaves the order alone" "$(applied)" ""
  boot "Intel(R) NUC" '[all]\nBOOT_ORDER=0xf461\n'
  is "anything that is not a Pi is left alone" "$(applied)" ""
  rm -rf "$root"
}


# The page for working on the hub (design/developer/, B) writes state for the host and never a command:
# a channel, or the whole set of keys that may sign in. systemctl and ssh-keygen are scripts on PATH; the
# keys and sshd's config land in the temp directory.
developing() {
  group "working on the hub: what it follows and who may sign in, checked again on the host"
  local root dir data bin; root=$(mktemp -d); dir="$root/hub"; data="$dir/driver-layer/brain-data"; bin="$root/bin"
  mkdir -p "$data" "$bin"; printf 'HUB_CHANNEL=release\nTZ=UTC\n' > "$dir/driver-layer/.env"
  cat > "$bin/systemctl" <<'SH'
#!/usr/bin/env bash
echo "systemctl $*" >> "$ROOT/asked"
case "$*" in
  "is-active ssh") [ -f "$ROOT/ssh-on" ] && echo active || echo inactive ;;
  "enable --now ssh") touch "$ROOT/ssh-on" ;;
  "disable --now ssh") rm -f "$ROOT/ssh-on" ;;
esac
exit 0
SH
  printf '#!/usr/bin/env bash\ncase "$1" in -lf) read -r l; case "$l" in *SHORT*) echo "2048 SHA256:x (RSA)" ;; *) echo "3072 SHA256:x (RSA)" ;; esac ;; esac\nexit 0\n' > "$bin/ssh-keygen"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$bin/chown"
  chmod +x "$bin"/*
  run() {
    rm -f "$root/asked"
    PATH="$bin:$PATH" ROOT="$root" HOME_HUB_DIR="$dir" HUB_CONF=/dev/null HUB_SSH_USER=pi HUB_KEYS_DIR="$root/keys" \
      HUB_SSHD_CONF="$root/sshd/10-home-hub.conf" "$HERE/developer.sh" >/dev/null 2>&1
  }
  says() { python3 -c 'import json, sys; d = json.load(open(sys.argv[1])); print(d["on"], len(d["keys"]), d["user"])' "$data/ssh.json"; }
  asked() { grep -c "$1" "$root/asked" 2>/dev/null || true; }
  local key="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB jordan@laptop"

  echo '{"at": 1, "channel": "development"}' > "$data/channel.request"; run
  is "a named channel goes into .env, once, beside everything else" "$(grep -c '^HUB_CHANNEL=' "$dir/driver-layer/.env") $(grep '^HUB_CHANNEL=' "$dir/driver-layer/.env") $(grep -c '^TZ=UTC' "$dir/driver-layer/.env")" "1 HUB_CHANNEL=development 1"
  is "...and is handed to the update every update gets" "$(sed -n 's/.*"to": "\([^"]*\)".*/\1/p' "$data/update.request")" "development"
  is "...and the request is gone" "$([ -f "$data/channel.request" ] && echo there || echo gone)" "gone"
  rm -f "$data/update.request"
  echo '{"channel": "try-it/strip"}' > "$data/channel.request"; run
  is "a branch name is followed too" "$(grep '^HUB_CHANNEL=' "$dir/driver-layer/.env")" "HUB_CHANNEL=try-it/strip"
  rm -f "$data/update.request"
  for bad in 'x;reboot' '../etc' '-rf' 'a b' 'main..x' 'x.lock'; do
    printf '{"channel": "%s"}\n' "$bad" > "$data/channel.request"; run
  done
  is "anything that is no branch name changes nothing and updates nothing" \
    "$(grep '^HUB_CHANNEL=' "$dir/driver-layer/.env") $([ -f "$data/update.request" ] && echo updated || echo still)" "HUB_CHANNEL=try-it/strip still"

  run
  is "with nothing asked, it still says what is true: SSH off" "$(says)" "False 0 pi"
  printf '{"on": true, "keys": ["%s", "command=\\"sh\\" %s", "ssh-rsa AAAASHORT", "ssh-dss AAAA"]}\n' "$key" "$key" > "$data/ssh.request"; run
  is "on: the one good key is written, and nothing in front of a key gets through" "$(cat "$root/keys/pi.keys")" "$key"
  is "...sshd takes keys only, from that file as well as the user's own" \
    "$(grep -c -e '^PasswordAuthentication no' -e '^KbdInteractiveAuthentication no' -e "^AuthorizedKeysFile .ssh/authorized_keys $root/keys/%u.keys" "$root/sshd/10-home-hub.conf")" "3"
  is "...the server is started" "$(asked 'enable --now ssh')" "1"
  is "...and ssh.json says so" "$(says)" "True 1 pi"
  printf '{"on": true, "keys": ["ssh-rsa AAAASHORT"]}\n' > "$data/ssh.request"; run
  is "on with no key it would take: off, rather than open to nobody in particular" "$(says) $(asked 'disable --now ssh')" "False 0 pi 1"
  printf '{"on": true, "keys": ["%s"]}\n' "$key" > "$data/ssh.request"; run
  printf '{"on": false, "keys": ["%s"]}\n' "$key" > "$data/ssh.request"; run
  is "off: the server stops and the file is emptied" "$(says) $(wc -c < "$root/keys/pi.keys" | tr -d ' ')" "False 0 pi 0"
  touch "$root/ssh-on"; run
  is "a server somebody started some other way is reported as on" "$(says)" "True 0 pi"
  rm -rf "$root"
}


# A screen tells its hub what it runs once a minute, as a unit of its own, and updates when the hub asks.
# curl and systemctl are scripts on PATH; the hub's answer is a file.
reporting() {
  group "a screen tells its hub what it runs, by a key of its own, and updates when asked"
  local root dir bin startup; root=$(mktemp -d); dir="$root/screen"; bin="$root/bin"; startup="$(cd "$HERE/../../startup" && pwd)"
  mkdir -p "$bin"; git init -q "$dir"; git -C "$dir" -c user.email=t@t -c user.name=t commit -q --allow-empty -m one
  printf '#!/usr/bin/env bash\nfor a; do [ "$p" = -d ] && echo "$a" > "$ROOT/sent"; p="$a"; done\ncat "$ROOT/reply"\n' > "$bin/curl"
  printf '#!/usr/bin/env bash\necho "systemctl $*" >> "$ROOT/asked"\n[ "$1" = is-active ] && echo inactive\nexit 0\n' > "$bin/systemctl"
  chmod +x "$bin"/*
  run() {
    rm -f "$root/asked" "$root/sent"; echo "$1" > "$root/reply"
    printf 'HUB_ROLE="screen"\nELYIR_READY_URL="http://hub.local/alive"\n%s\n' "${2:-}" > "$root/conf"
    PATH="$bin:$PATH" ROOT="$root" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" HUB_STATE="$root/state" "$startup/screen-report.sh" >/dev/null 2>&1
  }
  sent() { python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$root/sent" "$1"; }
  run '{"update": false}'
  local first; first="$(sent unit) $(sent key)"
  is "it names itself with an id and a key made once" "$(sent unit | wc -c | tr -d ' ') $(sent key | wc -c | tr -d ' ')" "17 49"
  is "...kept where only root reads it" "$(ls -l "$root/state/screen.id" | cut -c1-10)" "-rw-------"
  is "...says what it runs" "$(sent commit) $(sent channel)" "$(git -C "$dir" rev-parse HEAD) release"
  is "...and nothing is started when the hub asks nothing" "$(grep -c 'start --no-block' "$root/asked" || true)" "0"
  run '{"update": true}' 'HOME_HUB_BRANCH="try-it"'
  is "the same id and key the next time" "$(sent unit) $(sent key)" "$first"
  is "a screen built from a branch says the branch" "$(sent channel)" "try-it"
  is "the hub asked: the screen's own update starts now" "$(grep -c 'start --no-block elyir-screen-update.service' "$root/asked")" "1"
  printf 'ELYIR_READY_URL="http://hub.local/alive"\n' > "$root/conf"; rm -f "$root/sent"
  PATH="$bin:$PATH" ROOT="$root" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" HUB_STATE="$root/state" "$startup/screen-report.sh" >/dev/null 2>&1
  is "a hub's own screen says nothing: the hub knows what it runs" "$([ -f "$root/sent" ] && echo sent || echo quiet)" "quiet"
  rm -rf "$root"
}

# A screen of another hub has every hub update switched off, so it follows its hub's release itself:
# checked as a hub checks one, and its wall put back when the new one does not stay up. The hub's /alive
# is a file, the releases server a directory, and systemctl says what the wall is doing.
following() {
  group "a screen follows its hub's release, checked, and puts its wall back if it does not stay up"
  local root up dir bin keys serve startup; root=$(mktemp -d); up="$root/up"; dir="$root/screen"; bin="$root/bin"
  keys="$root/keys"; serve="$root/serve"; startup="$(cd "$HERE/../../startup" && pwd)"
  mkdir -p "$bin" "$up/startup" "$up/driver-layer/host/release-keys.d" "$serve/v0.3.0" "$serve/v0.3.1"
  git init -q "$up"; git -C "$up" config user.email t@t; git -C "$up" config user.name t
  cp "$HERE/verify.sh" "$HERE/landed.sh" "$up/driver-layer/host/"
  keypair "$root/maker.pem" "$up/driver-layer/host/release-keys.d/release.pub"
  keypair "$root/thief.pem" "$root/thief.pub"
  printf '#!/usr/bin/env bash\necho installed >> "%s/asked"\n' "$root" > "$up/startup/install.sh"; chmod +x "$up/startup/install.sh"
  release() { git -C "$up" add -A; git -C "$up" commit -qm "$1"; git -C "$up" tag "$1"; }
  echo one > "$up/f"; release v0.2.0
  echo '# a newer wall' >> "$up/startup/install.sh"; release v0.3.0
  echo two > "$up/f"; release v0.3.1
  git -C "$up" checkout -qb development; echo three > "$up/f"; git -C "$up" commit -qam work
  for v in v0.3.0 v0.3.1; do manifest "$serve/$v/release.json" "$v" "$(git -C "$up" rev-list -n 1 "$v")"; sign "$serve/$v/release.json" "$root/maker.pem"; done
  git clone -q "$up" "$dir"; git -C "$dir" reset -q --hard v0.2.0
  cat > "$bin/systemctl" <<'SH'
#!/usr/bin/env bash
echo "systemctl $*" >> "$ROOT/asked"
case "$*" in
  "is-active elyir-wall.service") echo active ;;
  "show -p NRestarts --value elyir-wall.service") n=$(cat "$ROOT/restarts"); echo "$n"; [ -f "$ROOT/falling" ] && echo $((n + 1)) > "$ROOT/restarts" ;;
esac
exit 0
SH
  chmod +x "$bin/systemctl"; echo 0 > "$root/restarts"
  run() {  # the version the hub says it runs, and anything else /etc/home-hub.conf says
    rm -f "$root/asked"
    printf '{"ok": true, "version": "%s", "commit": "1a2b3c4d5e6f"}' "$1" > "$root/alive.json"
    printf 'HUB_ROLE="screen"\nELYIR_READY_URL="file://%s/alive.json"\n%s\n' "$root" "${2:-}" > "$root/conf"
    PATH="$bin:$PATH" ROOT="$root" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" HUB_STATE="$root/state" HOME_HUB_KEYS="$keys" \
      HOME_HUB_RELEASES="file://$serve" SCREEN_SETTLE=0 SCREEN_WATCH=0 "$startup/screen-update.sh" >/dev/null 2>&1
  }
  on() { git -C "$dir" describe --tags --always; }
  asked() { cat "$root/asked" 2>/dev/null | grep -c "$1" || true; }

  run 0.3.0
  is "the hub runs v0.3.0: the screen moves to it" "$(on)" "v0.3.0"
  is "...takes the keys it was set up with, once" "$(ls "$keys")" "release.pub"
  is "...and its startup changed, so the wall is set up again and restarted" "$(asked installed) $(asked 'restart elyir-wall')" "1 1"
  run 0.3.0
  is "run again on the same version: nothing moves or restarts" "$(asked 'restart elyir-wall')" "0"
  run 0.3.1
  is "a release that leaves the startup alone moves the code and leaves the wall alone" "$(on) $(asked 'restart elyir-wall')" "v0.3.1 0"

  git -C "$dir" reset -q --hard v0.2.0
  sign "$serve/v0.3.0/release.json" "$root/thief.pem"; run 0.3.0
  is "a release not signed by a key it holds: it stays where it is" "$(on)" "v0.2.0"
  sign "$serve/v0.3.0/release.json" "$root/maker.pem"
  run development-1a2b3c4
  is "a hub on a branch: a screen on releases stays where it is" "$(on)" "v0.2.0"
  printf 'ELYIR_READY_URL="file://%s/alive.json"\n' "$root" > "$root/conf"
  PATH="$bin:$PATH" ROOT="$root" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" "$startup/screen-update.sh" >/dev/null 2>&1
  is "a hub's own screen is left to the hub" "$(on)" "v0.2.0"

  touch "$root/falling"; run 0.3.0
  is "a wall that keeps restarting on the new version: the last one is put back" "$(on)" "v0.2.0"
  is "...set up and restarted again on it" "$(asked installed) $(asked 'restart elyir-wall')" "2 2"
  rm -f "$root/falling"; run 0.3.0
  is "...and that version is not tried again on its own" "$(on) $(asked 'restart elyir-wall')" "v0.2.0 0"
  run 0.3.1
  is "the next release is" "$(on)" "v0.3.1"

  run 0.3.0 'HOME_HUB_BRANCH="development"'
  is "a screen built from a branch follows that branch, whatever its hub runs" "$(git -C "$dir" log -1 --format=%s)" "work"

  following_a_branch() { run 0.3.0 "HOME_HUB_BRANCH=\"$1\""; }
  says() { sed -n 's/^HOME_HUB_BRANCH=//p' "$root/conf" | tr -d '"'; }
  git -C "$up" branch -q fresh
  following_a_branch fresh
  is "a branch just cut from development, with nothing on it yet, is still the branch" "$(says)" "fresh"
  git -C "$up" checkout -qb try-it; echo four > "$up/f"; git -C "$up" commit -qam trying; git -C "$up" checkout -q development
  following_a_branch try-it
  is "a branch still being worked on is followed" "$(git -C "$dir" log -1 --format=%s) $(says)" "trying try-it"
  git -C "$up" merge -q --no-ff -m "took try-it" try-it
  following_a_branch try-it
  is "once development holds it and has moved on, the screen follows development" "$(git -C "$dir" log -1 --format=%s)" "took try-it"
  is "...and says so for good" "$(says)" "development"
  git -C "$up" checkout -qb gone; echo five > "$up/f"; git -C "$up" commit -qam "gone soon"; git -C "$up" checkout -q development
  following_a_branch gone
  git -C "$up" branch -qD gone; following_a_branch gone
  is "a branch deleted without being merged in: development too" "$(git -C "$dir" log -1 --format=%s) $(says)" "took try-it development"
  rm -rf "$root"
}


# A hub with no cable and no Wi-Fi makes one of its own for a phone to set it up from (docs/network.md,
# piece 5; design/setup-network/, A). NetworkManager, the kernel's radio and the routing table are
# scripts on PATH; each says what this house looks like and writes down what it was asked.
setting_up() {
  group "a hub on nothing offers a Wi-Fi of its own, and gives it up once it is on the house's"
  local root bin dir data net; root=$(mktemp -d); bin="$root/bin"; dir="$root/hub"; data="$dir/driver-layer/brain-data"; net="$root/net"
  mkdir -p "$bin" "$data" "$net/wlp1s0/phy80211" "$net/enp3s0/device"
  echo phy0 > "$net/wlp1s0/phy80211/name"; echo 1 > "$net/enp3s0/carrier"
  cat > "$bin/nmcli" <<'SH'
#!/usr/bin/env bash
echo "nmcli $*" >> "$ROOT/asked"
case "$*" in
  "-t -f DEVICE,TYPE,STATE,CONNECTION device") printf 'wlp1s0:wifi:%s:\n' "$([ -f "$ROOT/up" ] && echo connected || echo disconnected)"
    [ -n "${CABLE:-}" ] && printf 'enp3s0:ethernet:unmanaged:\n'; [ -f "$ROOT/ap" ] && printf 'hubsetup0:wifi:connected:home-hub-setup\n' ;;
  "-t -f DEVICE,TYPE device") printf 'wlp1s0:wifi\n'; [ -f "$ROOT/ap" ] && printf 'hubsetup0:wifi\n' ;;
  *"BSSID,CHAN device wifi list"*) printf '%s\n' 'Bluebell:90:5180 MHz:WPA2:AA\:BB\:CC\:00\:00\:02:36' 'Bluebell:70:2462 MHz:WPA2:AA\:BB\:CC\:00\:00\:01:11' \
    'Elyir Hub 4F2A:99:2412 MHz:WPA2:DE\:AD\:00\:00\:00\:01:1' 'Bluebell Guest:60:2412 MHz:WPA2:AA\:BB\:CC\:00\:00\:03:1' ;;
  "-t -f NAME,TYPE connection show") [ -n "${SAVED:-}" ] && echo "$SAVED:802-11-wireless" ;;
  "-t -f NAME,DEVICE connection show --active") ;;
  "-t -f NAME connection show --active") [ -f "$ROOT/ap" ] && echo home-hub-setup ;;
  "connection up home-hub-setup") touch "$ROOT/ap" ;;
  "connection delete home-hub-setup") rm -f "$ROOT/ap" ;;
  *"device wifi connect"*) if [ -n "${WRONG:-}" ]; then echo "Error: Connection activation failed: Secrets were required, but not provided."; exit 4; fi
    touch "$ROOT/up" ;;
  "-t -g GENERAL.STATE device show wlp1s0") [ -f "$ROOT/up" ] && echo "100 (connected)" ;;
  "-t -g IP4.ADDRESS device show wlp1s0") [ -f "$ROOT/up" ] && echo "192.168.1.20/24" ;;
  "-t -g IP4.GATEWAY device show wlp1s0") [ -f "$ROOT/up" ] && echo "192.168.1.1" ;;
esac
exit 0
SH
  cat > "$bin/ip" <<'SH'
#!/usr/bin/env bash
case "$*" in
  "route show default") [ -n "${ROUTE:-}" ] && echo "default via 192.168.1.1 dev $ROUTE" ;;
  "link show hubsetup0") [ -f "$ROOT/iface" ] ;;
  "-4 -o addr show dev enp3s0") [ -n "${CABLE:-}" ] && echo "2: enp3s0    inet 192.168.1.9/24 brd 192.168.1.255 scope global enp3s0" ;;
  *) exit 0 ;;
esac
SH
  cat > "$bin/iw" <<'SH'
#!/usr/bin/env bash
echo "iw $*" >> "$ROOT/asked"
case "$*" in
  "phy phy0 info") [ -n "${BOTH:-}" ] && printf '\tvalid interface combinations:\n\t\t * #{ managed } <= 1, #{ AP, P2P-client, P2P-GO } <= 1,\n\t\t   total <= 2, #channels <= 1\n\tHT Capability overrides:\n' ;;
  "dev wlp1s0 interface add hubsetup0 type __ap") touch "$ROOT/iface" ;;
  "dev hubsetup0 del") rm -f "$ROOT/iface" ;;
  "dev wlp1s0 station dump"|"dev hubsetup0 station dump") [ -n "${PHONES:-}" ] && printf 'Station 3a:1f:00:00:00:01 (on wlp1s0)\n\tinactive time:\t40 ms\n' ;;
esac
exit 0
SH
  printf '#!/usr/bin/env bash\nexit 0\n' > "$bin/sleep"; cp "$bin/sleep" "$bin/ping"
  chmod +x "$bin"/*
  conf() { printf 'HUB_SETUP_SSID="Elyir Hub 4F2A"\nHUB_SETUP_PASS="kite-maple-41"\n' > "$root/conf"; }
  tick() { PATH="$bin:$PATH" ROOT="$root" HUB_NET="$net" HUB_CONF="$root/conf" HOME_HUB_DIR="$dir" HOME_HUB_SETUP_FIRST=0 HOME_HUB_NETWORK_SETTLE=5 "$HERE/network.sh"; }
  ask() { printf '%s' "$1" > "$data/network.request"; tick; }
  field() { python3 -c 'import json,sys
v=json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): v=v.get(k) if isinstance(v,dict) else None
print("" if v is None else str(v).lower())' "$data/network.json" "$1"; }
  fresh() { rm -f "$root"/asked "$root"/ap "$root"/iface "$root"/up "$data"/network.*; }

  printf '' > "$root/conf"; fresh; tick
  is "with no password to put on it, it is never started" "$(grep -c 'con-name home-hub-setup' "$root/asked")" "0"

  conf; fresh; tick
  is "on nothing, with a password: its own Wi-Fi, by the name and password on the label" \
    "$(grep -c 'con-name home-hub-setup autoconnect no ssid Elyir Hub 4F2A 802-11-wireless.mode ap' "$root/asked")" "1"
  is "...on the house's strongest 2.4 GHz channel, handing out addresses" "$(grep -c 'channel 11 ipv4.method shared ipv4.addresses 10.42.0.1/24' "$root/asked")" "1"
  is "...said in the hub's picture, for the panel" "$(field setup.ssid)" "elyir hub 4f2a"
  is "...on the card itself, which cannot do both" "$(field setup.both)" "false"
  is "...its password kept for the hub's own screen, and nobody else" \
    "$(cat "$data/network.setup-key") $(stat -c %a "$data/network.setup-key" 2>/dev/null || stat -f %Lp "$data/network.setup-key")" "kite-maple-41 600"
  is "...never in the picture anything can read" "$(grep -c kite-maple "$data/network.json")" "0"
  is "...with nobody on it yet" "$(field setup_phones)" "0"
  PHONES=1 tick
  is "a phone that joins it is counted, so the screen can step aside" "$(field setup_phones)" "1"
  is "its own Wi-Fi is not one of the house's choices" "$(python3 -c 'import json,sys; print(",".join(n["ssid"] for n in json.load(open(sys.argv[1]))))' "$data/network.scan")" "Bluebell,Bluebell Guest"

  fresh; BOTH=1 tick
  is "a card that can do both gets a second interface for it" "$(grep -c 'iw dev wlp1s0 interface add hubsetup0 type __ap' "$root/asked")" "1"
  is "...and says so" "$(field setup.both)" "true"
  BOTH=1 ask '{"do": "join", "ssid": "Bluebell", "password": "right"}'
  is "the house's Wi-Fi is tried on its 2.4 GHz side, so the phone on the hub's stays on" \
    "$(grep -c 'device wifi connect Bluebell password right ifname wlp1s0 bssid AA:BB:CC:00:00:01' "$root/asked")" "1"
  is "...and once it is on, the phone is told which" "$(field joined.ssid)" "bluebell"
  ROUTE=wlp1s0 BOTH=1 tick
  is "online, its own Wi-Fi stays a little while so the phone can be told" "$(field setup.ssid)" "elyir hub 4f2a"
  python3 -c 'import json,sys; json.dump({"ssid":"Bluebell","at":1},open(sys.argv[1],"w"))' "$data/network.joined"
  ROUTE=wlp1s0 BOTH=1 tick
  is "...and then goes" "$(field setup.ssid)" ""
  is "...and its password with it" "$([ -f "$data/network.setup-key" ] && echo kept || echo gone)" "gone"
  is "...taking its interface with it" "$(grep -c 'iw dev hubsetup0 del' "$root/asked")" "1"
  is "...and lets the house's Wi-Fi choose its own band again" "$(grep -c 'connection modify Bluebell 802-11-wireless.bssid' "$root/asked")" "1"

  fresh; BOTH=1 tick; rm -f "$root/asked"
  WRONG=1 BOTH=1 ask '{"do": "join", "ssid": "Bluebell", "password": "wrong"}'
  is "a wrong password is said as one, at once" "$(field reverted_why)" "password"
  is "...naming the network" "$(field reverted)" "bluebell"
  is "...and the hub's own Wi-Fi was never dropped" "$(grep -c 'connection up home-hub-setup' "$root/asked")" "0"

  fresh; ROUTE=enp3s0 CABLE=1 tick
  is "plugged into the router, it never offers its own" "$(grep -c 'con-name home-hub-setup' "$root/asked")" "0"
  is "a cable NetworkManager does not manage is still a cable" "$(python3 -c 'import json,sys; print([l["up"] for l in json.load(open(sys.argv[1]))["links"] if l["kind"]=="ethernet"])' "$data/network.json")" "[True]"

  fresh; SAVED=Bluebell HOME_HUB_SETUP_LOST=300 PATH="$bin:$PATH" ROOT="$root" HUB_NET="$net" HUB_CONF="$root/conf" HOME_HUB_DIR="$dir" HOME_HUB_SETUP_FIRST=0 "$HERE/network.sh"
  is "a hub that had a Wi-Fi waits before offering its own: a router rebooting is not a reason" "$(grep -c 'con-name home-hub-setup' "$root/asked")" "0"

  # A box that started without internet finishes installing once it is online.
  printf '#!/usr/bin/env bash\necho "systemd-run $*" >> "$ROOT/asked"\n' > "$bin/systemd-run"; chmod +x "$bin/systemd-run"
  finish() { PATH="$bin:$PATH" ROOT="$root" HUB_NET="$net" HUB_CONF="$root/conf" HOME_HUB_DIR="$dir" HUB_FINISH="$root/finish" HOME_HUB_FINISH_WAIT="${WAIT:-0}" "$HERE/network.sh"; }
  fresh; echo development > "$root/finish"; finish
  is "still on nothing, it waits" "$(grep -c 'systemd-run' "$root/asked")" "0"
  fresh; ROUTE=wlp1s0 WAIT=600 finish
  is "online, but only just tried: it waits" "$(grep -c 'systemd-run' "$root/asked")" "0"
  fresh; ROUTE=wlp1s0 finish
  is "online: the install is finished, on the channel it started on" "$(grep -c "systemd-run --no-block --collect --unit=home-hub-finish -E HOME_HUB_DIR=$dir -E HOME_HUB_CHANNEL=development $dir/install.sh" "$root/asked")" "1"
  is "...once" "$([ -f "$root/finish" ] && echo still || echo gone)" "gone"
  rm -rf "$root"
}


# The x86 image boots from a USB stick and moves to the NUC's own drive at the start of a boot: on its own to an
# empty drive, to any other only when asked for it by its serial, and never by writing the stick. Disks are
# scripts on PATH; mount, reboot and poweroff write down what they were asked and do nothing.
moving_in() {
  group "the x86 image moves off its stick onto an empty drive, onto any other only when asked, and never writes the stick"
  local root dir bin sys var; root=$(mktemp -d); dir="$root/opt"; bin="$root/bin"; sys="$root/sys"; var="$root/var"
  mkdir -p "$dir/driver-layer/host" "$bin" "$sys/sda" "$var"
  printf '#!/usr/bin/env bash\necho "move $*" >> "%s/asked"\n[ -z "${MOVE_FAILS:-}" ]\n' "$root" > "$dir/driver-layer/host/move-to-drive.sh"
  cat > "$bin/lsblk" <<'SH'
#!/usr/bin/env bash
case "$*" in
  "-no PKNAME /dev/sda1") echo sda ;;
  "-no PKNAME /dev/nvme0n1p1") echo nvme0n1 ;;
  "-dno TRAN /dev/sda") echo "${TRAN:-usb}" ;;
  "-dno TRAN /dev/nvme0n1") echo nvme ;;
  "-dno NAME,TRAN,TYPE") printf 'sda %s disk\nnvme0n1 nvme disk\n' "${TRAN:-usb}" ;;
  "-dno SERIAL /dev/nvme0n1") echo "S6P7NS0T" ;;
  "-no NAME /dev/nvme0n1") echo nvme0n1; [ -n "${USED:-}${MOVED:-}" ] && echo nvme0n1p1 ;;
  "-no LABEL /dev/nvme0n1") echo; [ -n "${MOVED:-}" ] && echo hub-root ;;
esac
exit 0
SH
  printf '#!/usr/bin/env bash\necho "${ROOTDEV:-/dev/sda1}"\n' > "$bin/findmnt"
  printf '#!/usr/bin/env bash\n[ "$1" = -n ] && { [ -n "${SIGNED:-}" ] && echo "nvme0n1 ntfs"; exit 0; }\necho "wipefs $*" >> "%s/asked"\n' "$root" > "$bin/wipefs"
  printf '#!/usr/bin/env bash\n[ "$2" = / ]\n' > "$bin/mountpoint"
  for c in mount reboot poweroff systemctl sync; do printf '#!/usr/bin/env bash\necho "%s $*" >> "%s/asked"\n' "$c" "$root" > "$bin/$c"; done
  chmod +x "$dir/driver-layer/host/move-to-drive.sh" "$bin"/*
  early() {
    rm -f "$root/asked"; printf 'HUB_IMAGE=x86\n%s\n' "${EXTRA:-}" > "$root/conf"; echo 0 > "$sys/sda/removable"
    PATH="$bin:$PATH" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" HUB_VAR="$var" HUB_SYS_BLOCK="$sys" "$HERE/move-early.sh" >/dev/null 2>&1
  }
  ask() { printf '{"disk": "nvme0n1", "serial": "%s"}\n' "${1:-S6P7NS0T}" > "$var/move.request"; }
  asked() { if [ -f "$root/asked" ]; then grep -c -- "$1" "$root/asked" || true; else echo 0; fi; }

  early
  is "on a stick, with an empty drive: the system moves there" "$(asked '^move sda nvme0n1$')" "1"
  is "...with the disk read-only while it is copied, and writable again after" "$(asked 'mount -o remount,ro /') $(asked 'mount -o remount,rw /')" "1 1"
  is "...and restarts from the drive" "$(asked 'systemctl --no-block reboot')" "1"
  is "...without ever wiping the stick" "$(asked 'wipefs -a')" "0"
  USED=1 early
  is "a drive with a partition on it is never moved to on its own" "$(asked '^move ')" "0"
  SIGNED=1 early
  is "nor one with any signature on it" "$(asked '^move ')" "0"
  EXTRA="HUB_AUTO_INTERNAL=0" early
  is "HUB_AUTO_INTERNAL=0 keeps it on the stick" "$(asked '^move ')" "0"
  ask; USED=1 early
  is "a drive with something on it, asked for by its serial: the system moves there" "$(asked '^move sda nvme0n1$')" "1"
  is "...and the request is used up" "$([ -f "$var/move.request" ] && echo kept || echo gone)" "gone"
  ask OTHER-SERIAL; USED=1 early
  is "asked for by a serial that is not this drive's: nothing moves" "$(asked '^move ')" "0"
  ask; USED=1 MOVE_FAILS=1 early
  is "a move that was asked for and failed is said, and the hub carries on from the stick" "$([ -s "$var/move.failed" ] && echo said) $(asked 'reboot')" "said 0"
  rm -f "$var/move.failed"; MOVED=1 early
  is "started from the stick with its hub already on the drive: off, for the stick to come out" "$(asked '^poweroff') $(asked '^move ')" "1 0"
  ask; TRAN=nvme ROOTDEV=/dev/nvme0n1p1 early
  is "already on the drive: nothing moves, and a request copied over with it is dropped" "$(asked '^move ') $([ -f "$var/move.request" ] && echo kept || echo gone)" "0 gone"
  printf 'HUB_IMAGE=\n' > "$root/conf"; rm -f "$root/asked"
  PATH="$bin:$PATH" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" HUB_VAR="$var" HUB_SYS_BLOCK="$sys" "$HERE/move-early.sh" >/dev/null 2>&1
  is "anywhere but the x86 image, it does nothing at all" "$(asked '.')" "0"
  rm -rf "$root"
}

# What the hub runs from, and the drive beside it, described for the screen; and a request to move checked
# again on the host before anything restarts.
describing() {
  group "the drive is described in a household's words, and a request to erase it is checked again before anything happens"
  local root dir bin sys var; root=$(mktemp -d); dir="$root/opt"; bin="$root/bin"; sys="$root/sys"; var="$root/var"
  mkdir -p "$dir/driver-layer/brain-data" "$bin" "$sys/sda" "$var"
  cat > "$bin/lsblk" <<'SH'
#!/usr/bin/env bash
case "$*" in
  "-no PKNAME /dev/sda1") echo sda ;;
  "-no PKNAME /dev/nvme0n1p1") echo nvme0n1 ;;
  "-dno TRAN /dev/sda") echo "${TRAN:-usb}" ;;
  "-dno NAME,TRAN,TYPE") printf 'sda %s disk\nnvme0n1 nvme disk\n' "${TRAN:-usb}" ;;
  "-dno SERIAL /dev/nvme0n1") echo " S6P7NS0T " ;;
  "-dno MODEL /dev/nvme0n1") echo "Samsung SSD 980 500GB" ;;
  "-bdno SIZE /dev/nvme0n1") echo 500107862016 ;;
  "-no NAME /dev/nvme0n1") printf 'nvme0n1\nnvme0n1p1\nnvme0n1p2\n' ;;
  "-lno NAME /dev/nvme0n1") printf 'nvme0n1\nnvme0n1p1\nnvme0n1p2\n' ;;
  "-no FSTYPE /dev/nvme0n1p1") echo vfat ;;
  "-no FSTYPE /dev/nvme0n1p2") echo ext4 ;;
esac
exit 0
SH
  printf '#!/usr/bin/env bash\necho "${ROOTDEV:-/dev/sda1}"\n' > "$bin/findmnt"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$bin/wipefs"
  cat > "$bin/mount" <<'SH'
#!/usr/bin/env bash
echo "mount $*" >> "$FAKES/asked"
[ "$3" = /dev/nvme0n1p2 ] && { mkdir -p "$4/etc" "$4/var/log"; printf 'NAME="Ubuntu"\nVERSION_ID="24.04"\nPRETTY_NAME="$(touch /tmp/should-not-run)Ubuntu 24.04.2 LTS"\n' > "$4/etc/os-release"; }
exit 0
SH
  printf '#!/usr/bin/env bash\nrm -rf "${1:?}"/*\n' > "$bin/umount"
  printf '#!/usr/bin/env bash\nprintf "Used\\n65498251264\\n"\n' > "$bin/df"
  printf '#!/usr/bin/env bash\necho 1792400000\n' > "$bin/stat"
  for c in reboot systemctl; do printf '#!/usr/bin/env bash\necho "%s $*" >> "$FAKES/asked"\n' "$c" > "$bin/$c"; done
  chmod +x "$bin"/*
  look() { rm -f "$root/asked"; echo 0 > "$sys/sda/removable"; printf 'HUB_IMAGE=%s\n' "${IMAGE-x86}" > "$root/conf"
    PATH="$bin:$PATH" FAKES="$root" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" HUB_VAR="$var" HUB_SYS_BLOCK="$sys" HUB_PEEK="$root/peek" "$HERE/drive.sh" >/dev/null 2>&1; }
  ask() { printf '{"do": "%s", "disk": "%s", "serial": "%s"}' "${3:-move}" "$1" "$2" > "$dir/driver-layer/brain-data/drive.request"; look; }
  field() { python3 -c 'import json,sys
v=json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): v = v[int(k)] if isinstance(v, list) else (v or {}).get(k)
print("" if v is None else v)' "$dir/driver-layer/brain-data/drive.json" "$1"; }
  asked() { if [ -f "$root/asked" ]; then grep -c -- "$1" "$root/asked" || true; else echo 0; fi; }

  look
  is "running from the stick, and says so" "$(field from)" "stick"
  is "the drive by its own name and size" "$(field drives.0.model) $(field drives.0.bytes)" "Samsung SSD 980 500GB 500107862016"
  is "...the system on it, by its own name, read and never run" "$(field drives.0.system) $([ -f /tmp/should-not-run ] && echo ran || echo read)" "Ubuntu 24.04 read"
  is "...how much is stored, and when it was last written" "$(field drives.0.used) $(field drives.0.last)" "65498251264 1792400000"
  is "...looked at read-only, without replaying its journal" "$(asked 'mount -o ro,noload /dev/nvme0n1p2')" "1"
  is "...and not empty" "$(field drives.0.empty)" "False"

  ask nvme0n1 S6P7NS0T
  is "a move asked for by the drive and its serial: written down for the start of the next boot" "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["disk"])' "$var/move.request")" "nvme0n1"
  is "...and the hub restarts to do it" "$(asked 'systemctl --no-block reboot')" "1"
  rm -f "$var/move.request"
  ask nvme0n1 SOMETHING-ELSE
  is "a serial that is not this drive's is refused, in words" "$(field asked.refused)" "That isn't the drive the screen showed. Look again."
  is "...and nothing is written or restarted" "$([ -f "$var/move.request" ] && echo written || echo nothing) $(asked reboot)" "nothing 0"
  ask sda S6P7NS0T
  is "the disk it is running from is never a drive to move onto" "$(field asked.refused)" "That drive isn't in this computer."
  TRAN=nvme ROOTDEV=/dev/nvme0n1p1 ask nvme0n1 S6P7NS0T
  is "already on its own drive: refused" "$(field asked.refused)" "This hub is already on its own drive."
  IMAGE="" ask nvme0n1 S6P7NS0T
  is "a hub not installed from the stick image: refused" "$(field asked.refused)" "This hub wasn't installed from a USB stick."
  ask nvme0n1 S6P7NS0T wipe
  is "a request for anything but a move is not a request" "$(field asked.refused)" "not a thing this hub knows how to do"
  rm -rf "$root"
}

# The move itself. Partitions, filesystems and their ids are a table the fakes read and write; mount copies a
# prepared system in and umount copies it out again, so what the move did to the copy's own files can be read.
moving() {
  group "the move gives the copy its own identity, and every file that names one follows"
  local root bin; root=$(mktemp -d); bin="$root/bin"; mkdir -p "$bin" "$root/system/etc" "$root/system/boot/grub" "$root/system/boot/efi/EFI/ubuntu"
  printf 'LABEL=cloudimg-rootfs / ext4 discard 0 1\nLABEL=BOOT /boot ext4 defaults 0 2\nLABEL=UEFI /boot/efi vfat umask=0077 0 1\n' > "$root/system/etc/fstab"
  printf 'search --no-floppy --fs-uuid --set=root bbbb-boot\nlinux /vmlinuz root=PARTUUID=pppp-root ro\n' > "$root/system/boot/grub/grub.cfg"
  printf 'search.fs_uuid bbbb-boot root hd0,gpt16\n' > "$root/system/boot/efi/EFI/ubuntu/grub.cfg"
  mkdir -p "$root/system/boot/efi/EFI/BOOT"; cp "$root/system/boot/efi/EFI/ubuntu/grub.cfg" "$root/system/boot/efi/EFI/BOOT/grub.cfg"
  echo stick-made-this > "$root/system/etc/machine-id"
  cat > "$root/table" <<'T'
/dev/sda1 PARTUUID pppp-root
/dev/sda15 PARTUUID pppp-efi
/dev/sda16 PARTUUID pppp-boot
/dev/nvme0n1p1 LABEL cloudimg-rootfs
/dev/nvme0n1p1 UUID rrrr-root
/dev/nvme0n1p15 LABEL UEFI
/dev/nvme0n1p16 LABEL BOOT
/dev/nvme0n1p16 UUID bbbb-boot
T
  local parts='{"partitiontable": {"sectorsize": 512, "partitions": [{"node": "/dev/X1", "start": 2099200, "size": 4000000}, {"node": "/dev/X15", "start": 10240, "size": 217088}, {"node": "/dev/X16", "start": 227328, "size": 1869825}]}}'
  printf '#!/usr/bin/env bash\necho "sfdisk $*" >> "$FAKES/asked"\n[ "$1" = -J ] && echo %q\nexit 0\n' "$parts" > "$bin/sfdisk"
  cat > "$bin/blkid" <<'SH'
#!/usr/bin/env bash
awk -v d="$5" -v k="$4" '$1==d && $2==k {v=$3} END {print v}' "$FAKES/table"
SH
  cat > "$bin/tune2fs" <<'SH'
#!/usr/bin/env bash
echo "tune2fs $*" >> "$FAKES/asked"; d="$3"; grep -v "^$d UUID " "$FAKES/table" > "$FAKES/t"; echo "$d UUID new-${d##*/}" >> "$FAKES/t"; mv "$FAKES/t" "$FAKES/table"
SH
  cat > "$bin/e2label" <<'SH'
#!/usr/bin/env bash
echo "e2label $*" >> "$FAKES/asked"; grep -v "^$1 LABEL " "$FAKES/table" > "$FAKES/t"; echo "$1 LABEL $2" >> "$FAKES/t"; mv "$FAKES/t" "$FAKES/table"
SH
  printf '#!/usr/bin/env bash\nn=$(( $(cat "$FAKES/n" 2>/dev/null || echo 0) + 1 )); echo $n > "$FAKES/n"; echo "uuid-$n"\n' > "$bin/uuidgen"
  printf '#!/usr/bin/env bash\n[ "$1" = /dev/nvme0n1p1 ] && cp -R "$FAKES/system/." "$2/"\nexit 0\n' > "$bin/mount"
  printf '#!/usr/bin/env bash\n[ "$1" = -R ] && [ -d "$2/etc" ] && { rm -rf "$FAKES/after"; cp -R "$2" "$FAKES/after"; rm -rf "${2:?}"/*; }\nexit 0\n' > "$bin/umount"
  printf '#!/usr/bin/env bash\necho "${SIZE:-512110190592}"\n' > "$bin/blockdev"
  for c in dd fatlabel e2fsck partx udevadm efibootmgr; do printf '#!/usr/bin/env bash\necho "%s $*" >> "$FAKES/asked"\n' "$c" > "$bin/$c"; done
  chmod +x "$bin"/*
  sed -i.bak 's|/dev/X|/dev/nvme0n1p|g' "$bin/sfdisk"
  move() { PATH="$bin:$PATH" FAKES="$root" "$HERE/move-to-drive.sh" sda nvme0n1 >"$root/out" 2>&1; }
  asked() { if [ -f "$root/asked" ]; then grep -c -- "$1" "$root/asked" || true; else echo 0; fi; }

  move
  is "copies the stick onto the drive, as far as its last partition" "$(asked 'dd if=/dev/sda of=/dev/nvme0n1 bs=4M count=3122790400 iflag=count_bytes conv=fsync status=none')" "1"
  is "...and never writes the stick" "$(grep -E -c '(sfdisk --(disk-id|part-uuid|relocate)|tune2fs|e2label|fatlabel|wipefs).* /dev/sda' "$root/asked")" "0"
  is "the copy gets its own partition ids" "$(asked 'sfdisk --part-uuid /dev/nvme0n1 ')" "3"
  is "...its own filesystem ids" "$(asked 'tune2fs -U random /dev/nvme0n1p')" "2"
  is "...and its own labels" "$(asked 'e2label /dev/nvme0n1p1 hub-root') $(asked 'e2label /dev/nvme0n1p16 hub-boot') $(asked 'fatlabel /dev/nvme0n1p15 HUB-EFI')" "1 1 1"
  is "its fstab finds its own filesystems, not the stick's" "$(cut -d' ' -f1 "$root/after/etc/fstab" | tr '\n' ' ')" "LABEL=hub-root LABEL=hub-boot LABEL=HUB-EFI "
  is "...and so does its boot menu" "$(cat "$root/after/boot/grub/grub.cfg" | tr '\n' ' ')" "search --no-floppy --fs-uuid --set=root new-nvme0n1p16 linux /vmlinuz root=PARTUUID=uuid-2 ro "
  is "...on every copy of it, the removable-media one included" "$(cat "$root/after/boot/efi/EFI/ubuntu/grub.cfg" "$root/after/boot/efi/EFI/BOOT/grub.cfg" | sort -u)" "search.fs_uuid new-nvme0n1p16 root hd0,gpt16"
  is "it makes its own machine id, rather than the one the stick made" "$(wc -c < "$root/after/etc/machine-id" | tr -d ' ')" "0"
  rm -f "$root/asked"; SIZE=1000 move
  is "a drive too small for the system is refused before anything is written" "$(asked '^dd ')" "0"
  rm -rf "$root"
}

tiers() {
  group "what a machine is big enough for"
  local t="$HERE/../host-tier.sh"
  gets() { "$t" which "$@"; }

  is "a 4 GB Pi runs the house and plays music" "$(gets aarch64 4 3900000 none none)" "small music"
  is "an 8 GB Pi is medium, and still no films" "$(gets aarch64 4 7900000 none none)" "medium music"
  # Its render node is the 3D core, not an encoder; an AI board makes it accelerated, never a film player.
  is "a Pi with an AI board records cameras but plays no films" \
     "$(gets aarch64 4 7900000 none hailo)" "accelerated music,cameras"
  is "an 8 GB N100 is Hub Plus without the assistant" \
     "$(gets x86_64 4 7900000 intel none)" "large music,films,cameras"
  is "a 16 GB N100 is everything" "$(gets x86_64 4 16200000 intel none)" "large music,films,cameras,assistant"
  is "an old two-core box with 4 GB is a small hub" "$(gets x86_64 2 3900000 intel none)" "small music"
  is "a mini PC with no encoder plays no films" "$(gets x86_64 4 7900000 none none)" "large music"

  local d; d="$(mktemp -d)"
  cp "$t" "$d/"; echo "HOST_PINNED=1" > "$d/.env"; echo "HOST_TIER=small" >> "$d/.env"
  "$d/host-tier.sh" >/dev/null 2>&1
  is "a pinned hub keeps what somebody wrote" "$(grep -c '^HOST_' "$d/.env")" "2"
  printf 'HOST_PINNED=1\nHOST_CAN=music,films\nCOMPOSE_PROFILES=zigbee,voice\n' > "$d/.env"
  "$d/host-tier.sh" >/dev/null 2>&1
  is "music runs where the house can play it, beside the radios and the voice" "$(grep '^COMPOSE_PROFILES=' "$d/.env")" "COMPOSE_PROFILES=zigbee,voice,music"
  "$d/host-tier.sh" >/dev/null 2>&1
  is "...once, however often it is measured" "$(grep '^COMPOSE_PROFILES=' "$d/.env")" "COMPOSE_PROFILES=zigbee,voice,music"
  printf 'HOST_PINNED=1\nHOST_CAN=films\nCOMPOSE_PROFILES=music\n' > "$d/.env"
  "$d/host-tier.sh" >/dev/null 2>&1
  is "...and stops where it cannot, leaving none rather than nothing" "$(grep '^COMPOSE_PROFILES=' "$d/.env")" "COMPOSE_PROFILES=none"
  rm -rf "$d"
}


# What This screen can change about the unit it is on (design/this-screen/, A). role.sh hands the change to
# first boot, so first boot is a stub here that writes down what the conf said when it ran; find-hub.sh
# answers with $FOUND or nothing. The helper is run for real, on a spare port, with a wlr-randr on PATH
# that writes down what it was told.
changing() {
  group "a screen changes what it is only when asked at it, and turns only by quarters"
  local root dir bin; root=$(mktemp -d); dir="$root/opt"; bin="$root/bin"
  mkdir -p "$dir/startup" "$dir/driver-layer/host" "$bin" "$root/ask"
  printf '#!/usr/bin/env bash\n[ -n "${FOUND:-}" ] && echo "$FOUND"\n' > "$dir/startup/find-hub.sh"
  printf '#!/usr/bin/env bash\n. "$HUB_CONF"; echo "firstboot as ${HUB_ROLE:-hub} nvme=${HUB_AUTO_NVME:-1}" >> "%s/asked"; [ -z "${FAIL_FIRSTBOOT:-}" ] && touch "$HUB_FIRSTBOOT_MARK"; [ -z "${FAIL_FIRSTBOOT:-}" ]\n' "$root" > "$dir/driver-layer/host/firstboot.sh"
  printf '#!/usr/bin/env bash\necho "systemctl $*" >> "%s/asked"\n' "$root" > "$bin/systemctl"
  chmod +x "$dir/startup/find-hub.sh" "$dir/driver-layer/host/firstboot.sh" "$bin/systemctl"
  ask() {   # what the unit is now, the word left for it, found
    rm -f "$root/asked" "$root/done"; : > "$root/conf"
    [ "$1" = screen ] && printf 'HUB_ROLE="screen"\nELYIR_PANEL_URL="http://hub.local/?screen=1"\nELYIR_READY_URL="http://hub.local/alive"\n' > "$root/conf"
    printf '%s\n' "$2" > "$root/ask/role.request"
    PATH="$bin:$PATH" FOUND="$3" HOME_HUB_DIR="$dir" HUB_CONF="$root/conf" HUB_FIRSTBOOT_MARK="$root/done" \
      ELYIR_ROLE_REQUEST="$root/ask/role.request" "$HERE/../../startup/role.sh" >/dev/null 2>&1
  }
  ask screen hub ""
  is "a screen asked to run a house here: first boot runs again as the hub, and never copies onto a drive" "$(grep firstboot "$root/asked")" "firstboot as hub nvme=0"
  is "...it stops showing the other hub" "$(grep -c 'ELYIR_PANEL_URL\|ELYIR_READY_URL' "$root/conf")" "0"
  is "...and stops following the other hub's version" "$(grep -c 'disable --now elyir-screen-update.timer' "$root/asked")" "1"
  is "...and the word is used once" "$([ -f "$root/ask/role.request" ] && echo kept || echo gone)" "gone"
  ask hub screen http://other.local
  is "a hub asked to show another hub, with one on the Wi-Fi: first boot runs again as a screen" "$(grep firstboot "$root/asked")" "firstboot as screen nvme=0"
  is "...and the wall starts again on what it now shows" "$(grep -c 'restart elyir-wall.service' "$root/asked")" "1"
  ask hub screen ""; local code=$?
  is "a hub asked to show another hub, and none found: nothing changes" "$(cat "$root/asked" 2>/dev/null | grep -c firstboot) $(grep -c HUB_ROLE "$root/conf")" "0 0"
  is "...and says it did not" "$code" "1"
  FAIL_FIRSTBOOT=1 ask hub screen http://other.local
  is "a hub whose first boot could not make it a screen stays the hub" "$(grep '^HUB_ROLE=' "$root/conf")" 'HUB_ROLE="hub"'
  ask screen screen http://other.local
  is "asked to be what it already is: nothing runs" "$(cat "$root/asked" 2>/dev/null | grep -c .)" "0"
  ask hub 'reboot; shutdown now' http://other.local
  is "a word that is not hub or screen: nothing runs" "$(cat "$root/asked" 2>/dev/null | grep -c .)" "0"

  # the helper, on a port of its own
  printf '#!/usr/bin/env bash\nif [ $# -eq 0 ]; then printf "DSI-1 \\"panel\\"\\n  Enabled: yes\\n"; else echo "wlr-randr $*" >> "%s/randr"; fi\n' "$root" > "$bin/wlr-randr"
  chmod +x "$bin/wlr-randr"
  local port=$((20000 + RANDOM % 20000)) at origin='http://hub.local' pid
  at="http://127.0.0.1:$port"
  helper() {   # role, found
    PATH="$bin:$PATH" WAYLAND_DISPLAY=wayland-0 HUB_ROLE="$1" FOUND="$2" ELYIR_SCREEN_PORT=$port ELYIR_PANEL_URL='http://hub.local/?screen=1' \
      ELYIR_TURN_FILE="$root/turn" ELYIR_SCREEN_ASK="$root/ask" ELYIR_FIND_HUB="$dir/startup/find-hub.sh" \
      python3 "$HERE/../../startup/screen-helper.py" & pid=$!
    for _ in $(seq 1 50); do curl -s -o /dev/null "$at/this" && break; sleep 0.1; done
  }
  call() { curl -s -o /dev/null -w '%{http_code}' -H "Origin: ${3:-$origin}" -H 'Content-Type: application/json' ${2:+-d "$2"} "$at$1"; }
  rm -f "$root/ask/role.request"
  helper screen ""
  is "the panel it was opened on asks what this screen is: a screen, drawn the way it was made" "$(curl -s -H "Origin: $origin" "$at/this")" '{"role": "screen", "turn": 0, "turns": true, "other": null}'
  is "...any other page is refused" "$(call /this '' 'http://elsewhere.example')" "403"
  is "a quarter turn is done and kept" "$(call /turn '{"turn": 90}') $(cat "$root/turn") $(cat "$root/randr")" "200 90 wlr-randr --output DSI-1 --transform 90"
  is "...an eighth is not" "$(call /turn '{"turn": 45}')" "400"
  is "a screen asked to show another hub, which it already does, is refused" "$(call /role '{"to": "screen"}')" "400"
  is "a screen asked to run a house leaves the one word for role.sh" "$(call /role '{"to": "hub"}') $(cat "$root/ask/role.request")" "200 hub"
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  rm -f "$root/ask/role.request"
  helper "" ""
  is "a hub asked to become a screen with no other hub to show is refused, and leaves nothing" "$(call /role '{"to": "screen"}') $([ -f "$root/ask/role.request" ] && echo left || echo nothing)" "409 nothing"
  kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  rm -rf "$root"
}

for need in git openssl curl python3; do
  command -v "$need" >/dev/null 2>&1 || { echo "these tests need $need"; exit 2; }
done
signatures; holds; undo; radios; tiers; watchdog; away; finding; becoming; changing; usb_first; following; developing; reporting; keeping; speaking; awake; setting_up; moving_in; moving; describing
printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
