# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The house's screens, as each says what it is (design/which-tv/, decided 20 November 2026: A, with B as a row on
This screen, and C's choice of screens).

A screen works out for itself whether it is a TV (onTV in the panel's tv.ts) and says so here, with the room it
hangs in, whenever it starts and whenever it rests. Somebody standing at it can correct that on This screen, and
their answer is kept over the guess from then on. The Photos page lists these screens with a switch each: a TV
shows photos at rest unless it is switched off, a wall screen only once it is switched on.

These are not the phones' records. A house with no passcode has no phone records at all, and a screen there
still has a room and a kind, so a screen is known by an id it keeps itself. One not heard from in a month is no
longer listed; it comes back the next time it says anything.
"""
import json
import os
import re
import time

from .settings import DATA

STATE = DATA / "screens-shown.json"
FORGET_AFTER = 30 * 86400
ID = re.compile(r"^[a-f0-9]{16,64}$")


class Screens:
    def __init__(self, now=time.time):
        self.now = now
        try:
            self.items: dict[str, dict] = json.loads(STATE.read_text()).get("screens", {})
        except (OSError, ValueError):
            self.items = {}

    def _save(self):
        STATE.parent.mkdir(parents=True, exist_ok=True)
        tmp = STATE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"screens": self.items}, indent=1))
        os.replace(tmp, STATE)

    @staticmethod
    def shows_photos(rec: dict) -> bool:
        return rec["photos"] if rec.get("photos") is not None else bool(rec.get("tv"))

    def _public(self, rec: dict) -> dict:
        return {"id": rec["id"], "room": rec.get("room"), "tv": bool(rec.get("tv")), "by": rec.get("tv_by"), "photos": self.shows_photos(rec)}

    def said(self, sid: str, room: str | None = None, tv: bool | None = None, by: str = "screen") -> dict:
        """What a screen says about itself. A person's answer about what it is beats the screen's own guess, always."""
        if not isinstance(sid, str) or not ID.match(sid): raise ValueError("A screen needs its own id.")
        rec = self.items.setdefault(sid, {"id": sid, "room": None, "tv": None, "tv_by": None, "photos": None})
        if room is not None: rec["room"] = room or None
        if isinstance(tv, bool):
            if by == "person": rec["tv"], rec["tv_by"] = tv, "person"
            elif rec.get("tv_by") != "person": rec["tv"], rec["tv_by"] = tv, "screen"
        rec["seen"] = self.now()
        self._save()
        return self._public(rec)

    def show(self, sid: str, on: bool) -> dict | None:
        rec = self.items.get(sid)
        if not rec: return None
        rec["photos"] = bool(on)
        self._save()
        return self._public(rec)

    def listed(self) -> list[dict]:
        """The screens heard from this month: TVs first, then by room."""
        fresh = [r for r in self.items.values() if self.now() - r.get("seen", 0) < FORGET_AFTER]
        return [self._public(r) for r in sorted(fresh, key=lambda r: (not r.get("tv"), r.get("room") or "", r["id"]))]
