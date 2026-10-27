#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The front door, asked rather than read. Caddy sorts the directives in a block by its own order, not the order
# they are written in, so a Caddyfile that reads right can still do something else: the setup Wi-Fi's redirect ran
# before the panel it was meant to fall back from, and sent 10.42.0.1 to itself until the browser gave up (a Pi 5,
# 25 October 2026). This runs the real Caddyfile in Docker on 10.42.0.0/16, with a stand-in brain that says which
# stamp it was handed, and asks it as a phone on the hub's own Wi-Fi, a phone on the house's, and the hub's own screen.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
NET=hub-door-test; PASS=0; FAIL=0
is() { if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"; else FAIL=$((FAIL + 1)); printf '  \033[31m✗\033[0m %s — wanted %s, got %s\n' "$1" "$3" "$2"; fi; }
gone() { docker rm -f hub-door-caddy hub-door-brain >/dev/null 2>&1; docker network rm "$NET" >/dev/null 2>&1; }
command -v docker >/dev/null 2>&1 || { echo "these tests need docker"; exit 2; }
gone; trap gone EXIT

docker network create --subnet 10.42.0.0/16 --gateway 10.42.255.254 "$NET" >/dev/null
docker run -d --name hub-door-brain --network "$NET" --ip 10.42.9.3 python:3-alpine python -c '
import http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(s):
        b = ("via=%s" % s.headers.get("X-Hub-Via")).encode()
        s.send_response(200); s.send_header("Content-Length", str(len(b))); s.end_headers(); s.wfile.write(b)
    def log_message(s, *a): pass
http.server.HTTPServer(("0.0.0.0", 8300), H).serve_forever()' >/dev/null
docker run -d --name hub-door-caddy --network "$NET" --ip 10.42.0.1 -v "$HERE":/etc/caddy:ro -e HUB_AWAY=off \
  -e "HUB_HTTP=http://hub.local, http://localhost" -e "HUB_HOSTS=https://hub.local" -e BRAIN_UPSTREAM=10.42.9.3:8300 caddy:2 >/dev/null
for _ in $(seq 30); do docker exec hub-door-caddy wget -qO- http://127.0.0.1:2019/config/ >/dev/null 2>&1 && break; sleep 1; done

# A phone: from an address on the network, naming a host, optionally bringing a stamp of its own.
ask() { docker run --rm --network "$NET" --ip "$1" curlimages/curl -s -o - -w ' %{http_code} %{redirect_url}' -H "Host: $2" ${3:+-H "X-Hub-Via: $3"} http://10.42.0.1/hotspot-detect.html; }

echo "the front door"
is "on the hub's own Wi-Fi, its address is the panel, stamped as the setup Wi-Fi" "$(ask 10.42.0.5 10.42.0.1)" "via=setup 200 "
is "...and a phone's internet check is sent there, which opens its sign-in sheet" "$(ask 10.42.0.5 captive.apple.com)" " 302 http://10.42.0.1/"
is "on the house's Wi-Fi, a stamp a phone brought is taken off" "$(ask 10.42.1.5 hub.local setup)" "via=None 200 "
is "the screen on the hub itself is stamped as that screen" \
  "$(docker exec hub-door-caddy wget -qO- --header 'Host: localhost' http://127.0.0.1/ 2>/dev/null)" "via=screen"

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
