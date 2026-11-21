# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The family board: notes and countdowns the household leaves for its screens (design/tv-moments/, decided
20 November 2026).

A line for the morning is the same, written the night before: it greets the first screen to wake on its day, signed,
then goes. A note is a line somebody wrote on their phone ("Dinner at 7. Love, Mom"), up until a time the phone worked out in
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
MAX_NOTE, MAX_WHAT, MAX_EACH, MAX_MORNING = 120, 40, 40, 90
YEARLY = re.compile(r"\b(birthday|anniversary)\b", re.I)


class Board:
    def __init__(self, now=time.time, today=date.today):
        self.now, self.today = now, today
        try:
            d = json.loads(STATE.read_text())
            self.notes, self.countdowns, self.mornings = d.get("notes", []), d.get("countdowns", []), d.get("mornings", [])
        except (OSError, ValueError):
            self.notes, self.countdowns, self.mornings = [], [], []

    def _save(self):
        STATE.parent.mkdir(parents=True, exist_ok=True)
        tmp = STATE.with_suffix(".tmp")
        tmp.write_text(json.dumps({"notes": self.notes, "countdowns": self.countdowns, "mornings": self.mornings}, indent=1))
        os.replace(tmp, STATE)

    def current(self) -> dict:
        """What is up now, newest note first and the soonest countdown first; what has run out is dropped here."""
        now, today = self.now(), self.today()
        notes = [n for n in self.notes if not n.get("until") or n["until"] > now]
        counts = [c for c in self.countdowns if c["yearly"] or date.fromisoformat(c["date"]) >= today]
        # a day behind the hub's own, since the phone that wrote it may be a timezone behind; the screen keeps to its own day
        mornings = [m for m in self.mornings if date.fromisoformat(m["day"]).toordinal() >= today.toordinal() - 1]
        if len(notes) != len(self.notes) or len(counts) != len(self.countdowns) or len(mornings) != len(self.mornings):
            self.notes, self.countdowns, self.mornings = notes, counts, mornings
            self._save()
        return {"notes": sorted(notes, key=lambda n: n["added"], reverse=True), "mornings": sorted(mornings, key=lambda m: m["day"]),
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

    def for_morning(self, text: str, day: str, by: str | None) -> dict:
        """A line left for the morning of `day` ("YYYY-MM-DD", the phone's tomorrow): one per day, the latest kept."""
        text = " ".join(str(text or "").split())
        if not text: raise ValueError("A line for the morning needs something written in it.")
        if len(text) > MAX_MORNING: raise ValueError(f"A line for the morning fits {MAX_MORNING} letters.")
        try: d = date.fromisoformat(str(day))
        except ValueError: raise ValueError("That isn't a day.") from None
        if not (self.today().toordinal() - 1 <= d.toordinal() <= self.today().toordinal() + 2): raise ValueError("A line is left for tomorrow morning.")
        m = {"id": secrets.token_hex(6), "text": text, "day": d.isoformat(), "by": (by or "").strip()[:60] or None, "added": self.now()}
        self.mornings = [x for x in self.mornings if x["day"] != m["day"]] + [m]
        self._save()
        return m

    def remove(self, item_id: str) -> bool:
        before = len(self.notes) + len(self.countdowns) + len(self.mornings)
        self.notes = [n for n in self.notes if n["id"] != item_id]
        self.countdowns = [c for c in self.countdowns if c["id"] != item_id]
        self.mornings = [m for m in self.mornings if m["id"] != item_id]
        if len(self.notes) + len(self.countdowns) + len(self.mornings) == before: return False
        self._save()
        return True

    def clear(self):
        """Every note and countdown, for Moving out."""
        self.notes, self.countdowns, self.mornings = [], [], []
        STATE.unlink(missing_ok=True)
