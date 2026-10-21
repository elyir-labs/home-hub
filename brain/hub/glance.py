# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""How the house is, for a phone's home screen (design/widget/, A and C, chosen 20 October 2026).

The widget asks the house itself, with the phone's own pass, roughly every quarter of an hour, so this has to be
cheap: everything here is already in memory for /home, /ambient and /health, and nothing is asked of a device.

The sentence is the house's, written once here so the store apps never write their own (docs/messages.md). What
counts as on is the panel's (`whatsOn` in app/src/store.ts): a thing that is on, playing, open or unlocked, never
a sensor, camera, charger or appliance, and never something the household took off Home.
"""
import math, time

from .model import kind_of

ACTIVE = {"on", "playing", "open", "unlocked", "cleaning", "streaming", "recording"}
PASSIVE = {"sensor", "motion", "contact", "camera", "charger", "appliance"}
NO_SKY = {"", "unknown", "unavailable"}

ALL_OFF = "Everything is off"
ON_IN_ROOM = "On in the {room}"
ON_IN_ROOMS = "On in {count} rooms"
NOBODY = "Nobody home"
ONE_PERSON = "1 person home"
PEOPLE = "{count} people home"


def on_rooms(home) -> list:
    """The rooms with something on in them, as the panel's "on right now" counts them."""
    out = []
    for room in home.rooms.values():
        if any(d.state in ACTIVE and kind_of(d).split(".")[0] not in PASSIVE and not (d.attrs or {}).get("off_home") and d.id not in home.off_home
               for d in room.devices):
            out.append(room)
    return out


def what_is_on(home) -> str:
    rooms = on_rooms(home)
    if not rooms: return ALL_OFF
    if len(rooms) == 1: return ON_IN_ROOM.format(room=rooms[0].name)
    return ON_IN_ROOMS.format(count=len(rooms))


def who_is_home(presence) -> str | None:
    """Said only when the house knows who is home: people it can see, not an alarm's mode alone."""
    known = [p for p in presence.people.values() if p.get("home") is not None]
    if not known: return None
    if presence.somebody is False: return NOBODY
    here = sum(1 for p in known if p["home"])
    if here == 0: return NOBODY
    return ONE_PERSON if here == 1 else PEOPLE.format(count=here)


def glance(hub) -> dict:
    w = hub.weather or {}
    t, sky = w.get("temperature"), w.get("condition") or ""
    notes = hub.health.notes()
    said = [what_is_on(hub.home)]
    who = who_is_home(hub.presence)
    if who: said.append(who)
    return {
        "name": hub.settings.get("home_name") or "Home",
        "temp": f"{math.floor(float(t) + 0.5)}°" if isinstance(t, (int, float)) else None,   # half up, as the panel's Math.round
        "sky": None if sky in NO_SKY else sky,
        "said": said,
        "needs": notes[0].get("text") if notes else None,
        "count": len(notes),
        "at": int(time.time()),
    }
