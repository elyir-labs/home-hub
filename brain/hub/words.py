# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The line for the day: a word of encouragement in the morning and one for rest at night (design/tv-moments/,
morning A and the night line), and the day's handful of cards that take a turn between the photos: a fact or two, a
trivia question or two, a joke and a quote (cards A).

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


# how many of each a day brings, few enough that a day's cards stay a treat between the photos
A_DAY = {"facts": 2, "trivia": 2, "jokes": 1, "quotes": 1}


def cards_of_the_day(day: date) -> dict[str, list[list[str]]]:
    """Each kind's cards for the day, as [first part, second part] (a fact and its line, a question and its answer). Each
    day takes the next few from the shuffled file, so the whole file comes round before any card does again."""
    out = {}
    for name, k in A_DAY.items():
        pool = lines(name)
        at = (day.toordinal() * k) % len(pool) if pool else 0
        out[name] = [[part.strip() for part in pool[(at + i) % len(pool)].split("|", 1)] for i in range(min(k, len(pool)))]
    return out
