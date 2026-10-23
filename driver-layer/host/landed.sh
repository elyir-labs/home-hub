#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
# Whether the branch a unit follows has landed. Sourced by install.sh and startup/screen-update.sh.
#
# An image built from a branch follows that branch (install.sh, HOME_HUB_BRANCH), which is right while the
# branch is being worked on and a trap afterwards: once it is merged nobody pushes to it again, and the unit
# sits on its last commit for good. Landed means development already holds every commit on it and has moved
# past it, or the branch is gone. A branch just cut from development is not landed: same tip, nothing on it
# yet. A squash merge leaves no ancestor to find, so such a branch lands when it is deleted.
landed() {  # branch, checkout -> 0 once it has landed; anything unknown, like being offline, is "not yet"
  local mine dev
  case "$1" in ""|main|development) return 1 ;; esac
  git -C "$2" fetch -q origin "+refs/heads/development:refs/remotes/origin/development" 2>/dev/null || return 1
  if ! git -C "$2" fetch -q origin "+refs/heads/$1:refs/remotes/origin/$1" 2>/dev/null; then
    git -C "$2" ls-remote --exit-code --heads origin "$1" >/dev/null 2>&1
    [ $? -eq 2 ]; return    # 2: the repository answered, and has no such branch
  fi
  mine="$(git -C "$2" rev-parse "origin/$1")"; dev="$(git -C "$2" rev-parse origin/development)"
  [ "$mine" != "$dev" ] && git -C "$2" merge-base --is-ancestor "$mine" "$dev"
}
