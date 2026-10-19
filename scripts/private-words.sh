#!/bin/sh
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# This repository is public: no person's name or email, no real printer's name, no home network, no link to a
# private claude.ai page (nobody else can open one). Exits 1 and lists file:line for each. The copyright notices
# are the one place the maintainer's name belongs.
#
#   scripts/private-words.sh            every tracked file (ci.yml's secrets job)
#   scripts/private-words.sh --cached   what is staged (.githooks/pre-commit; git config core.hooksPath .githooks)
#
# The private words are not written here: a published list of what must not be published is the leak. They
# come from PRIVATE_WORDS (CI's repository secret of that name) or ~/.config/elyir/private-words, one
# Perl-style pattern per line, matched without case. Without either, only the maintainer's name and claude.ai
# links are checked, and it says so.
#
# Printers in examples and tests are Atlas, Juno and Vega; people are Jordan, Sam, Alex and Robin; the town is
# Cedar Falls, IA; addresses at home are 192.168.1.x.
FILE="${PRIVATE_WORDS_FILE:-$HOME/.config/elyir/private-words}"
private="${PRIVATE_WORDS:-}"
[ -z "$private" ] && [ -r "$FILE" ] && private="$(cat "$FILE")"
private="$(printf '%s\n' "$private" | grep -v -e '^[[:space:]]*$' -e '^#' | paste -sd'|' -)"
[ -z "$private" ] && echo "private-words: no private list (PRIVATE_WORDS or $FILE), so only the public patterns" >&2

WORDS='\b(temi|temitope|adeyeri)\b|temi\.adeyeri|claude\.ai/'
[ -n "$private" ] && WORDS="$WORDS|$private"
hits=$(git grep -n -I -i -P ${1:+"$1"} "$WORDS" -- . ':!scripts/private-words.sh' ':!LICENSE' ':!CLA.md' \
  | grep -v -E 'SPDX-FileCopyrightText: 2026 Temitope Adeyeri|Copyright 2026 Temitope Adeyeri')
[ -z "$hits" ] && exit 0
echo "$hits"
echo "private words in a public repository (above): use Atlas, Juno, Vega; Jordan, Sam, Alex, Robin; Cedar Falls; 192.168.1.x; no claude.ai links" >&2
exit 1
