# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The line for the day: a word of encouragement in the morning and one for rest at night (design/tv-moments/,
morning A and the night line).

The lines are plain files in words/, written for this and read by a person before they ship, one line each, which
come with every hub update. Nothing is fetched and nothing is written by a model. A day's line is the same on every
screen in the house and the same all day; the order is shuffled once, the same way on every hub, so a hundred lines
come round about every hundred days rather than in the order they were written.
"""
import random
from datetime import date
from functools import cache
from pathlib import Path

HERE = Path(__file__).parent / "words"


@cache
def lines(name: str) -> tuple[str, ...]:
    try: raw = (HERE / f"{name}.txt").read_text(encoding="utf-8").splitlines()
    except OSError: return ()
    kept = [x.strip() for x in raw if x.strip() and not x.startswith("#")]
    random.Random(name).shuffle(kept)
    return tuple(kept)


def of_the_day(name: str, day: date) -> str | None:
    pool = lines(name)
    return pool[day.toordinal() % len(pool)] if pool else None
