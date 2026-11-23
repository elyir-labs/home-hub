# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Renaming a room and taking one away (design/room-edit/, A).

A room is more than its name. It holds things, sometimes a wall screen that opens on it, routines that
light it, and a place on the list of rooms people come in through. Deleting the area in the engine and
nothing else -- what the brain used to do -- dropped the things into New devices without asking, left a
screen waking to a room that was gone, and left routines naming a room the house no longer had. That last
one was worse than it looks: rules.json is checked whole, so one routine naming a missing room made every
later change to every routine refuse to save.

So removing is done in an order, and everything it did is kept so Bring it back can undo all of it:

1. the things move to the room the person chose, or to New devices when they said to place them later;
2. a screen that opened on the room opens on that room instead (or on nothing, and asks again);
3. a routine that cannot run without this room goes with it, and one that names it among others loses it;
4. the room leaves the list of entrances;
5. only then is the room itself deleted.

What is kept lives in memory: the drained card on the panel is the undo, and it is gone by the time the
hub could restart.
"""
from __future__ import annotations

import copy
import json

from .model import Room
from .rules import rooms_of

KEPT = 8   # removed rooms remembered for Bring it back; the panel only ever offers the last one or two


class RoomError(Exception):
    """Something the person can be told, in words, with the status it should answer with."""
    def __init__(self, status: int, words: str):
        super().__init__(words)
        self.status, self.words = status, words


def _removed(hub) -> dict:
    return hub.__dict__.setdefault("removed_rooms", {})


def taken(hub, name: str, but: str | None = None) -> str | None:
    """The room already called this, ignoring case, other than `but`."""
    n = name.strip().lower()
    return next((r.name for r in hub.home.rooms.values() if r.id not in ("unassigned", but) and r.name.strip().lower() == n), None)


# ---- routines ----
def _quiet_rooms(c) -> list | None:
    """The rooms a `quiet` condition names: [quiet, rooms, op, seconds]. None when it names none (its rule's own)."""
    if not (isinstance(c, list) and len(c) == 4 and c[0] == "quiet"): return None
    return [c[1]] if isinstance(c[1], str) else list(c[1]) if isinstance(c[1], list) else None


def _without(rule: dict, room_id: str):
    """The rule with `room_id` taken out of it, None when it cannot run without it, or the same rule untouched."""
    r = copy.deepcopy(rule)
    changed = False
    rooms = rooms_of(r)
    if room_id in rooms:
        rest = [x for x in rooms if x != room_id]
        if not rest or not isinstance(r.get("room"), list): return None
        r["room"], changed = rest, True
    conds = []
    for c in r.get("if") or []:
        named = _quiet_rooms(c)
        if named is not None and room_id in named:
            rest = [x for x in named if x != room_id]
            if not rest: return None
            c = [c[0], rest if isinstance(c[1], list) else rest[0], *c[2:]]
            changed = True
        conds.append(c)
    if changed and "if" in r: r["if"] = conds
    return r if changed else rule


def _swap(rule: dict, old: str, new: str) -> dict:
    """A remembered rule pointed at the room's new id, when the engine gave it back under a different one."""
    if old == new: return rule
    r = copy.deepcopy(rule)
    if r.get("room") == old: r["room"] = new
    elif isinstance(r.get("room"), list): r["room"] = [new if x == old else x for x in r["room"]]
    for c in r.get("if") or []:
        if _quiet_rooms(c) is not None:
            c[1] = new if c[1] == old else [new if x == old else x for x in c[1]] if isinstance(c[1], list) else c[1]
    return r


def routines_without(raw: dict, room_id: str) -> tuple[dict, list[dict], list[dict]]:
    """rules.json with the room taken out: (the new file, the rules that go, the rules as they were before
    being trimmed). Drafts the assistant is still waiting on are treated the same way."""
    out, going, trimmed = {k: v for k, v in raw.items() if k not in ("valid", "errors")}, [], []
    for key in ("rules", "drafts"):
        rows = []
        for i, r in enumerate(raw.get(key) or []):
            if not isinstance(r, dict): rows.append(r); continue
            w = _without(r, room_id)
            if w is None: going.append({"list": key, "at": i, "rule": r})
            elif w is not r: trimmed.append({"list": key, "rule": r}); rows.append(w)
            else: rows.append(r)
        if key in raw: out[key] = rows
    return out, going, trimmed


# ---- what removing would do ----
def _screens(hub, room_id: str) -> list[dict]:
    return [p for p in hub.phones.data if p.get("room") == room_id and p.get("kind") == "screen"]


def follows(hub, room_id: str) -> dict:
    """What taking this room away touches, for the question asked before it is done."""
    room = hub.home.rooms.get(room_id)
    if not room or room_id == "unassigned": raise RoomError(404, "unknown room")
    _, going, trimmed = routines_without(hub.engine.as_data(), room_id)
    return {"id": room.id, "name": room.name, "things": len(room.devices),
            "screens": [p.get("name") for p in _screens(hub, room_id)],
            "routines_going": [g["rule"].get("name") or g["rule"].get("id") for g in going if g["list"] == "rules"],
            "routines_trimmed": [t["rule"].get("name") or t["rule"].get("id") for t in trimmed if t["list"] == "rules"]}


# ---- doing it ----
async def _move(hub, room: Room, to: str | None) -> list[tuple[str, str]]:
    """Every thing in the room to `to`. Hardware moves whole when its own room is this one; a part with a room of
    its own moves alone, so a hub's other parts in other rooms stay where they are. Returns what was moved."""
    moved, seen = [], set()
    for dev in list(room.devices):
        if dev.hw and not dev.own_room:
            if dev.hw in seen: continue
            seen.add(dev.hw)
            await hub.ha.send("config/device_registry/update", device_id=dev.hw, area_id=to)
            moved.append(("hw", dev.hw))
        else:
            await hub.ha.send("config/entity_registry/update", entity_id=dev.id, area_id=to)
            moved.append(("entity", dev.id))
    return moved


async def rename(hub, room_id: str, name: str) -> dict:
    room = hub.home.rooms.get(room_id)
    if not room or room_id == "unassigned": raise RoomError(404, "unknown room")
    name = (name or "").strip()
    if not name: raise RoomError(400, "A room needs a name.")
    if (other := taken(hub, name, but=room_id)): raise RoomError(409, f"There’s already a {other}.")
    if name == room.name: return {"id": room.id, "name": room.name}
    try: await hub.ha.send("config/area_registry/update", area_id=room_id, name=name)
    except Exception as e: raise RoomError(502, f"could not rename the room: {e}")
    was, room.name = room.name, name
    hub.log.add("home", "room-renamed", was, name, source="user")
    hub._broadcast(json.dumps({"type": "home", "home": hub.home_dict()}))
    return {"id": room.id, "name": name}


async def remove(hub, room_id: str, to: str | None) -> dict:
    room = hub.home.rooms.get(room_id)
    if not room or room_id == "unassigned": raise RoomError(404, "unknown room")
    to = None if to in (None, "", "unassigned") else to
    if to == room_id: raise RoomError(400, "Its things need a different room.")
    if to and to not in hub.home.rooms: raise RoomError(404, "unknown room")
    to_name = hub.home.rooms[to].name if to else None

    raw = hub.engine.as_data()
    new_raw, going, trimmed = routines_without(raw, room_id)
    kept = {"id": room.id, "name": room.name, "to": to, "to_name": to_name, "things": len(room.devices),
            "moved": [], "screens": [], "shows": [], "going": going, "trimmed": trimmed, "entry": room_id in hub.entry}
    # The routines first: the one step that can refuse, and refusing here leaves nothing half done. A file that
    # was already refusing for reasons of its own is left as it was rather than holding the room hostage.
    if going or trimmed:
        try: hub.engine.save(new_raw)
        except ValueError: kept["going"], kept["trimmed"] = [], []
    try:
        kept["moved"] = await _move(hub, room, to)
    except Exception as e:
        raise RoomError(502, f"could not move its things: {e}")

    for p in _screens(hub, room_id):
        kept["screens"].append({"id": p["id"], "name": p.get("name")})
        if to: hub.phones.place(p["id"], to, to_name)
        else: p["room"] = None
    if kept["screens"]: hub.phones._save(); hub.phones._changed()
    for sid, rec in hub.screens.items.items():
        if rec.get("room") == room_id: rec["room"] = to; kept["shows"].append(sid)
    if kept["shows"]: hub.screens._save()

    if kept["entry"]: hub.set_entry([r for r in hub.entry if r != room_id])

    try: await hub.ha.send("config/area_registry/delete", area_id=room_id)
    except Exception as e: raise RoomError(502, f"could not remove the room: {e}")
    hub.home.rooms.pop(room_id, None)

    gone = _removed(hub)
    gone[room_id] = kept
    while len(gone) > KEPT: gone.pop(next(iter(gone)))
    hub.log.add("home", "room-removed", room.name, to_name, source="user", detail={"things": kept["things"]})
    hub._broadcast(json.dumps({"type": "home", "home": hub.home_dict()}))
    return {"ok": True, "id": room_id, "name": room.name, "things": kept["things"], "to": to, "to_name": to_name,
            "routines_going": [g["rule"].get("name") or g["rule"].get("id") for g in going if g["list"] == "rules"]}


async def bring_back(hub, room_id: str) -> dict:
    """Undo a removal: the room again, under its old name, with everything that was moved out moved back."""
    kept = _removed(hub).get(room_id)
    if not kept: raise RoomError(404, "That room can’t be brought back now.")
    if (other := taken(hub, kept["name"])):
        raise RoomError(409, f"There’s already a {other}. Rename it first, then bring this one back.")
    try: a = await hub.ha.send("config/area_registry/create", name=kept["name"])
    except Exception as e: raise RoomError(502, f"could not bring the room back: {e}")
    new = a["area_id"]
    hub.home.rooms.setdefault(new, Room(new, a.get("name") or kept["name"]))

    try:
        for kind, ident in kept["moved"]:
            if kind == "hw": await hub.ha.send("config/device_registry/update", device_id=ident, area_id=new)
            else: await hub.ha.send("config/entity_registry/update", entity_id=ident, area_id=new)
    except Exception as e:
        raise RoomError(502, f"could not move its things back: {e}")

    for s in kept["screens"]:
        p = hub.phones.get(s["id"])
        if p: p["room"], p["name"] = new, s["name"]
    if kept["screens"]: hub.phones._save(); hub.phones._changed()
    for sid in kept["shows"]:
        if sid in hub.screens.items: hub.screens.items[sid]["room"] = new
    if kept["shows"]: hub.screens._save()

    if kept["going"] or kept["trimmed"]:
        raw = {k: v for k, v in hub.engine.as_data().items() if k not in ("valid", "errors")}
        for t in kept["trimmed"]:
            rows = raw.get(t["list"]) or []
            for i, r in enumerate(rows):
                if isinstance(r, dict) and r.get("id") == t["rule"].get("id"): rows[i] = _swap(t["rule"], room_id, new)
        for g in sorted(kept["going"], key=lambda g: g["at"]):
            rows = raw.setdefault(g["list"], [])
            if not any(isinstance(r, dict) and r.get("id") == g["rule"].get("id") for r in rows):
                rows.insert(min(g["at"], len(rows)), _swap(g["rule"], room_id, new))
        hub.engine.save(raw)
    if kept["entry"]: hub.set_entry([*hub.entry, new])

    _removed(hub).pop(room_id, None)
    hub.log.add("home", "room-back", None, kept["name"], source="user")
    hub._broadcast(json.dumps({"type": "home", "home": hub.home_dict()}))
    return {"ok": True, "id": new, "name": kept["name"]}
