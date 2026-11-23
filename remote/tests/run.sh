#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# The remote's key rules, built and run on this computer; no Nordic toolchain needed.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
cc -std=c11 -Wall -Wextra -Werror -o "$out/keys_test" "$here/keys_test.c" "$here/../src/keys.c"
"$out/keys_test"
