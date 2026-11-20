#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# A hub plugged straight into the internet answers nobody there.
#
# A cable into the ISP's modem rather than the router hands the hub a public address, and the panel,
# the home engine and the radios' broker are then open to anyone on the internet (a NUC, 19 November
# 2026). Away from home goes through the relay, a connection the hub makes outward, so a link with a
# public address takes no new connections: only replies, DHCP, and the ICMP IPv6 cannot do without.
#
# Decided per link by its IPv4 address, because the same hub may also be on the house's Wi-Fi and must
# stay open there; a home network's IPv6 addresses are global too, so they cannot tell. The rules sit in
# mangle PREROUTING, ahead of Docker's NAT, so ports Docker publishes are covered as well.
#
# network.sh runs this every tick. Safe to run by hand.
set -uo pipefail
CHAIN=HOME-HUB-PUBLIC
have() { command -v "$1" >/dev/null 2>&1; }
have iptables || exit 0
[ "$(id -u)" = 0 ] || [ -n "${HUB_PUBLIC_ANY_USER:-}" ] || exit 0

# Every link with an IPv4 address the internet routes to: not private, not shared (CGNAT), not link-local.
public_links() {
  ip -4 -o addr show scope global 2>/dev/null | awk '{print $2, $4}' | python3 -c '
import ipaddress, sys
seen = []
for line in sys.stdin:
    dev, cidr = line.split()
    if ipaddress.ip_interface(cidr).ip.is_global and dev not in seen:
        seen.append(dev)
print("\n".join(seen))'
}

rules() {  # family (4|6), then each public link
  local fam="$1" dev; shift
  for dev in "$@"; do
    echo "-A $CHAIN -i $dev -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN"
    if [ "$fam" = 4 ]; then
      echo "-A $CHAIN -i $dev -p icmp -j RETURN"
      echo "-A $CHAIN -i $dev -p udp -m udp --dport 68 -j RETURN"
    else
      echo "-A $CHAIN -i $dev -p ipv6-icmp -j RETURN"
      echo "-A $CHAIN -i $dev -p udp -m udp --dport 546 -j RETURN"
    fi
    echo "-A $CHAIN -i $dev -j DROP"
  done
}

apply() {  # tool, family, links...
  local tool="$1" fam="$2"; shift 2
  have "$tool" || return 0
  "$tool" -t mangle -N "$CHAIN" 2>/dev/null
  "$tool" -t mangle -C PREROUTING -j "$CHAIN" 2>/dev/null || "$tool" -t mangle -I PREROUTING -j "$CHAIN"
  local want have_now
  want="$(rules "$fam" "$@")"
  have_now="$("$tool" -t mangle -S "$CHAIN" 2>/dev/null | grep '^-A ')"
  [ "$want" = "$have_now" ] && return 1
  "$tool" -t mangle -F "$CHAIN"
  local line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    # shellcheck disable=SC2086
    "$tool" -t mangle $line
  done <<< "$want"
  return 0
}

LINKS="$(public_links | xargs)"
changed=0
# shellcheck disable=SC2086
apply iptables 4 $LINKS && changed=1
# shellcheck disable=SC2086
apply ip6tables 6 $LINKS && changed=1
if [ "$changed" = 1 ]; then
  if [ -n "$LINKS" ]; then echo "on the open internet, taking no connections there: $LINKS"
  else echo "no link on the open internet"; fi
fi
exit 0
