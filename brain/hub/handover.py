# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Moving out: the house handed to the next people who live in it (design/leaving/, B, from People).

The house stays and the people go. What stays is what belongs to the building: its rooms, the lights, switches and
sensors on its own radios and Wi-Fi, its routines and scenes, where it is, how it looks. What goes is what belongs to
the people: their phones (the wall screens stay, they are the house's), the passcode, the people the house knows, what
happened here, the services they signed the house into, Apple Home or Google Home they shared it with, the assistant's
key, the web address and its plan, and the Wi-Fi password, which is theirs and usually leaves with their router.

A service is somebody's when it reaches the house through the cloud (its integration says cloud_polling or
cloud_push): their camera account, their thermostat account. Signing the house out of one takes its devices with it,
so before it does, the hub writes down which room and name each of those devices had. When the next people sign in to
the same kind of service and the same devices come back, `welcome_back` puts them in their old rooms with their old
names: the camera over the porch is still the porch camera. A device that never comes back is forgotten after a year.

The hub does its own part here, while the engine is running, then asks the host (host/reset.sh, "people") for the parts
only the host can reach: the Wi-Fi, the SSH keys, Ring's sign-in, the sharing bridge's pairings. It then opens on a
first run that asks only who the new people are and for a passcode of their own.
"""
import asyncio, json, logging, time

from .backup import ARCHIVE, REQUEST, RESET
from .printers import STATE as PRINTERS

log = logging.getLogger("hub.handover")

CLOUD = ("cloud_polling", "cloud_push")
PLUMBING = {"mqtt", "zwave_js", "matter"}
KEEP_SCREENS = ("wall", "screen")
REMEMBER_FOR = 365 * 24 * 3600
# Settings that are the people's rather than the house's. Everything else in settings.json is the house's and stays.
THEIRS = ("pin", "owner", "home_name", "assistant", "developer_ssh", "developer_page", "developer_channel", "dismissed",
          "notes_seen", "music_again", "wifi", "leads")


def cloud_domains(descriptions: dict) -> set[str]:
    """Every integration that reaches its devices through somebody's cloud account, from the engine's own descriptions."""
    out = set()
    def take(domain, d):
        if (d.get("iot_class") or "") in CLOUD: out.add(domain)
        for sub, k in (d.get("integrations") or {}).items():
            if isinstance(k, dict): take(sub, k)
    for domain, d in ((descriptions.get("core") or {}).get("integration") or {}).items(): take(domain, d)
    return out


class Handover:
    def __init__(self, hub): self.hub = hub

    async def _cloud_entries(self) -> list[dict]:
        try: desc = await self.hub.ha.send("integration/descriptions")
        except Exception: desc = {}
        cloud = cloud_domains(desc or {})
        rows = list(await self.hub.ha.send("config_entries/get") or [])
        return [r for r in rows if r.get("domain") in cloud and r.get("domain") not in PLUMBING]

    async def _people(self) -> list[dict]:
        try: listed = await self.hub.ha.send("person/list") or {}
        except Exception: return []
        return list(listed.get("storage") or [])

    def _phones(self) -> list[dict]:
        return [p for p in self.hub.phones.data if p.get("kind") not in KEEP_SCREENS]

    async def ask(self) -> dict:
        """What handing over would take and leave, in this house, for the sheet. Open, like /restart's: a sheet that
        wanted the code before it said what the button does is one nobody reads."""
        self.hub.ready()
        entries = await self._cloud_entries()
        return {"phones": len(self._phones()), "people": [p.get("name") for p in await self._people() if p.get("name")],
                "accounts": sorted({r.get("title") or r.get("domain") for r in entries}),
                "rooms": sum(1 for r in self.hub.home.rooms.values() if r.id != "unassigned"),
                "devices": len(self.hub.home.devices), "routines": len(getattr(self.hub.engine, "rules", []) or [])}

    async def run(self, who: str = "the wall") -> dict:
        self.hub.ready()
        if not self.hub.lock.locked:
            raise PermissionError("Set a passcode first. Without one, anyone on your Wi‑Fi could hand the house over.")
        if any(p.exists() for p in (RESET, REQUEST, ARCHIVE)):
            raise ValueError("The hub is already being started over or restored.")
        ha = self.hub.ha

        # The services: remember where their devices were, then sign the house out, credentials and all.
        entries = await self._cloud_entries()
        ids = {r["entry_id"] for r in entries}
        try: devices = list(await ha.send("config/device_registry/list") or [])
        except Exception: devices = []
        remembered = list(self.hub.settings.get("returning") or [])
        for d in devices:
            if ids & set(d.get("config_entries") or []) and (d.get("area_id") or d.get("name_by_user")):
                remembered.append({"identifiers": d.get("identifiers") or [], "area_id": d.get("area_id"),
                                   "name": d.get("name_by_user"), "until": time.time() + REMEMBER_FOR})
        self.hub.settings.set(returning=remembered)
        for r in entries:
            try: await asyncio.to_thread(self.hub.add._rest, "DELETE", f"/api/config/config_entries/entry/{r['entry_id']}")
            except Exception as e: log.warning("could not sign out of %s: %s", r.get("domain"), e)
        try:
            for c in await ha.send("application_credentials/list") or []:
                await ha.send("application_credentials/delete", application_credentials_id=c["id"])
        except Exception as e: log.info("no application credentials to remove: %s", e)

        # The people, and everything the engine remembers about who was where.
        for p in await self._people():
            try: await ha.send("person/delete", person_id=p["id"])
            except Exception as e: log.warning("could not remove a person: %s", e)
        try: await ha.call("recorder", "purge", None, keep_days=0, repack=True)
        except Exception as e: log.warning("could not empty the engine's history: %s", e)

        # The house's own records.
        try: self.hub.address.forget(who)
        except Exception: pass
        try: self.hub.share.set(on=False)
        except Exception: pass
        self.hub.phones.data = [p for p in self.hub.phones.data if p.get("kind") in KEEP_SCREENS]
        self.hub.phones.asks.clear()
        self.hub.phones._save()
        self.hub.log.clear()
        PRINTERS.unlink(missing_ok=True)       # the printers go with their people, and each was let in by one of them
        data = {k: v for k, v in self.hub.settings.data.items() if k not in THEIRS}
        data.update(setup_done=False, handed_over=time.time())
        self.hub.settings.replace(data)
        self.hub.log.add("home", "handover", None, "handed over", source="user")

        RESET.parent.mkdir(parents=True, exist_ok=True)
        RESET.write_text(json.dumps({"at": time.time(), "what": "people"}))
        return {"ok": True}

    async def welcome_back(self, devices: list[dict]) -> int:
        """A device the last people's service brought, back with the next people's: its old room and name. Returns how
        many were put back. Called after every registry rebuild; does nothing once nobody is waiting."""
        waiting = list(self.hub.settings.get("returning") or [])
        if not waiting: return 0
        now, back = time.time(), 0
        def key(ids): return {tuple(i) for i in ids or []}
        for d in devices:
            if d.get("area_id"): continue
            mine = key(d.get("identifiers"))
            hit = next((w for w in waiting if mine & key(w["identifiers"])), None)
            if not hit: continue
            upd = {"area_id": hit.get("area_id")} | ({"name_by_user": hit["name"]} if hit.get("name") else {})
            try:
                await self.hub.ha.send("config/device_registry/update", device_id=d["id"], **upd)
                waiting.remove(hit); back += 1
            except Exception as e: log.warning("could not put a returning device back: %s", e)
        waiting = [w for w in waiting if w.get("until", 0) > now]
        if waiting != (self.hub.settings.get("returning") or []): self.hub.settings.set(returning=waiting)
        return back
