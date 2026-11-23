# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Paintings for the screens at rest (design/tv-art/, decided 20 November 2026: C, and a channel too).

A painting takes a turn between the photos like the other cards, opening close on one part of it and pulling back to
the whole; a screen can also show nothing but paintings, one at a time all day. Either is a switch on the screen's
page, and art starts off on every screen, because it is the one card that costs the hub a download.

The set is chosen by hand from museums that give their public-domain collections away for any use, and prepared once
at the TV's size by tools/art/prepare.py. paintings.json, beside this file, names each painting, says one true line
about it, and carries the hash of the picture we prepared; the pictures themselves are on Elyir's own host and never in
this repository, which every hub clones whole. The hub downloads them from there, and only there, the first time any
screen turns art on, and refuses a picture whose bytes are not the ones named here. Turning art off on every screen
frees the room again.

The paintings are the unit's, not the house's: moving out leaves them, and Start over erases them with the rest.
"""
import asyncio
import hashlib
import json
import logging
import os
import shutil
import time
import urllib.request
from functools import cache
from pathlib import Path

from .settings import DATA

log = logging.getLogger("hub.art")

ROOT = DATA / "art"
SET = Path(__file__).parent / "paintings.json"
HOST = "https://art.elyir.com/"     # site/terraform/art.tf
MAX_BYTES = 4 * 1024 * 1024     # one prepared painting is well under this; anything larger is not one of ours
AGAIN_AFTER = 3600              # a download that failed is tried again an hour later, not in a loop


@cache
def paintings() -> tuple[dict, ...]:
    """The set as this hub's code knows it: only paintings that have been prepared, so each has its file and hash."""
    try: raw = json.loads(SET.read_text(encoding="utf-8")).get("paintings", [])
    except (OSError, ValueError): return ()
    return tuple(p for p in raw if p.get("id") and p.get("file") and p.get("sha256"))


def public(p: dict) -> dict:
    return {k: p.get(k) for k in ("id", "title", "painter", "year", "museum", "line", "w", "h", "focus")}


class Art:
    def __init__(self, fetch=None, arrived=None):
        self.fetch = fetch or self._download
        self.arrived = arrived   # told when paintings land, so a screen showing art doesn't wait for its next rest
        self.getting = False
        self.failed_at = 0.0
        self._poke = asyncio.Event()

    def _path(self, p: dict) -> Path:
        return ROOT / f"{p['id']}.jpg"

    def _have(self, p: dict) -> bool:
        return self._path(p).is_file()

    def list(self) -> list[dict]:
        """The paintings on this hub now, in the set's order."""
        return [public(p) for p in paintings() if self._have(p)]

    def state(self) -> dict:
        """For the phone's line under the switch: how many are here of how many, how big the set is, and whether the
        hub is getting them now or could not."""
        ps = paintings()
        return {"have": sum(self._have(p) for p in ps), "of": len(ps), "bytes": sum(p.get("bytes") or 0 for p in ps),
                "getting": self.getting, "failed": bool(self.failed_at) and not self.getting}

    def file(self, pid: str) -> Path | None:
        found = next((p for p in paintings() if p["id"] == pid), None)
        return self._path(found) if found and self._have(found) else None

    def poke(self):
        """A switch changed: look now rather than at the next hour."""
        self._poke.set()

    @staticmethod
    def _download(url: str) -> bytes:
        req = urllib.request.Request(url, headers={"User-Agent": "home-hub"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES: raise ValueError("larger than any painting we prepare")
        return data

    async def get_missing(self) -> int:
        """Download every painting not here yet, each checked against its hash. Returns how many arrived."""
        missing = [p for p in paintings() if not self._have(p)]
        if not missing: return 0
        self.getting, got, bad = True, 0, 0
        ROOT.mkdir(parents=True, exist_ok=True)
        try:
            for p in missing:
                try:
                    data = await asyncio.to_thread(self.fetch, HOST + p["file"])
                    if hashlib.sha256(data).hexdigest() != p["sha256"]: raise ValueError("not the picture we prepared")
                    tmp = self._path(p).with_suffix(".part")
                    tmp.write_bytes(data)
                    os.replace(tmp, self._path(p))
                    got += 1
                except Exception as e:   # one bad painting never stops the rest
                    bad += 1
                    log.warning("art: %s did not download: %s", p["id"], e)
        finally:
            self.getting = False
        self.failed_at = time.time() if bad else 0.0
        return got

    def free(self):
        """Nothing shows art any more: give the room back."""
        if ROOT.exists():
            shutil.rmtree(ROOT, ignore_errors=True)
            log.info("art: no screen shows paintings, so they are removed")
        self.failed_at = 0.0

    async def settle(self, wanted: bool):
        if not wanted: return self.free()
        if await self.get_missing() and self.arrived: self.arrived()

    async def run(self, wanted):
        """Keep the paintings here while any screen wants them, and gone when none does. `wanted` is asked each time."""
        while True:
            try: await self.settle(wanted())
            except Exception: log.exception("art")
            self._poke.clear()
            try: await asyncio.wait_for(self._poke.wait(), AGAIN_AFTER)
            except TimeoutError: pass
