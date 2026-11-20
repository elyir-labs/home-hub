# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The family board: notes and countdowns the household leaves for its screens (design/tv-moments/, decided
20 November 2026).

A note is a line somebody wrote on their phone ("Dinner at 7. Love, Mom"), up until a time the phone worked out in
its own local day (tonight, tomorrow) or until somebody takes it down. A countdown is a thing and its date ("Sam's
birthday", the 23rd); a birthday or an anniversary comes round every year, anything else goes the day after. The
screens show them between the photos, or a screen shows them all at once as the family board.

They are the people's, so Moving out takes them (handover.py), and Start over erases them with the brain's data.
"""
import json
import os
import re
import secrets
import time
from datetime import date

from .settings import DATA

STATE = DATA / "board.json"
MAX_NOTE, MAX_WHAT, MAX_EACH = 120, 40, 40
YEARLY = re.compile(r"\b(birthday|anniversary)\b", re.I)


class Board:
    def __init__(self, now=time.time, today=date.today):
        self.now, self.today = now, today
        try:
            d = json.loads(STATE.read_text())
            self.notes, self.countdowns = d.get("notes", []), d.get("countdowns", [])
        except (OSError, ValueError):
            self.notes, self.countdowns = [], []

    def _save(self):
        STATE.parent.mkdir(parents=True, exist_ok=True)
        tmp = STATE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"notes": self.notes, "countdowns": self.countdowns}, indent=1))
        os.replace(tmp, STATE)

    def current(self) -> dict:
        """What is up now, newest note first and the soonest countdown first; what has run out is dropped here."""
        now, today = self.now(), self.today()
        notes = [n for n in self.notes if not n.get("until") or n["until"] > now]
        counts = [c for c in self.countdowns if c["yearly"] or date.fromisoformat(c["date"]) >= today]
        if len(notes) != len(self.notes) or len(counts) != len(self.countdowns):
            self.notes, self.countdowns = notes, counts
            self._save()
        return {"notes": sorted(notes, key=lambda n: n["added"], reverse=True),
                "countdowns": sorted(({**c, "next": self.next_day(c).isoformat()} for c in counts), key=lambda c: c["next"])}

    def next_day(self, c: dict) -> date:
        """The day a countdown counts to next: its date, or for a birthday, this year's or next year's."""
        d, today = date.fromisoformat(c["date"]), self.today()
        if not c["yearly"]: return d
        for year in (today.year, today.year + 1):
            try: nxt = d.replace(year=year)
            except ValueError: nxt = date(year, 3, 1)   # February 29th, in a year without one
            if nxt >= today: return nxt
        return d

    def leave(self, text: str, by: str | None, until: float | None) -> dict:
        text = " ".join(str(text or "").split())
        if not text: raise ValueError("A note needs something written in it.")
        if len(text) > MAX_NOTE: raise ValueError(f"A note fits {MAX_NOTE} letters.")
        now = self.now()
        if until is not None and not (isinstance(until, (int, float)) and now < until <= now + 366 * 86400):
            raise ValueError("That note would already be over.")
        if len(self.current()["notes"]) >= MAX_EACH: raise ValueError("There are too many notes up. Take one down first.")
        n = {"id": secrets.token_hex(6), "text": text, "by": (by or "").strip()[:60] or None, "added": now, "until": until}
        self.notes.append(n)
        self._save()
        return n

    def count_to(self, what: str, day: str, by: str | None) -> dict:
        what = " ".join(str(what or "").split())
        if not what: raise ValueError("A countdown needs a name.")
        if len(what) > MAX_WHAT: raise ValueError(f"A countdown's name fits {MAX_WHAT} letters.")
        try: d = date.fromisoformat(str(day))
        except ValueError: raise ValueError("That isn't a date.") from None
        yearly = bool(YEARLY.search(what))
        if not yearly and d < self.today(): raise ValueError("That day has already been.")
        if len(self.current()["countdowns"]) >= MAX_EACH: raise ValueError("There are too many countdowns. Remove one first.")
        c = {"id": secrets.token_hex(6), "what": what, "date": d.isoformat(), "yearly": yearly, "by": (by or "").strip()[:60] or None, "added": self.now()}
        self.countdowns.append(c)
        self._save()
        return {**c, "next": self.next_day(c).isoformat()}

    def remove(self, item_id: str) -> bool:
        before = len(self.notes) + len(self.countdowns)
        self.notes = [n for n in self.notes if n["id"] != item_id]
        self.countdowns = [c for c in self.countdowns if c["id"] != item_id]
        if len(self.notes) + len(self.countdowns) == before: return False
        self._save()
        return True

    def clear(self):
        """Every note and countdown, for Moving out."""
        self.notes, self.countdowns = [], []
        STATE.unlink(missing_ok=True)
