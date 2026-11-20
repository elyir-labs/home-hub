# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The light behind the TV, following the picture (design/tv-glow/, A with B as the fallback).

A camera across the room reads the TV's picture and a strip controller behind the TV follows the colors along its
edges. The reading is the host's (startup/glow.py, beside the camera); this is the house's half: which strip, told to
follow and given a key so nothing else on the Wi-Fi can drive it, and told again whenever it restarts, because a strip
forgets it was following when it does. The strip says its own address on `strip/<id>/ip`.
"""
import json
import logging
import os
import secrets
import urllib.request

log = logging.getLogger("hub.glow")
PORT = 21325
HELPER = os.environ.get("GLOW_HELPER", "http://127.0.0.1:8397")   # startup/glow.py, beside the camera on this machine


class GlowError(Exception):
    pass


def helper(path: str, body: dict | None = None, timeout: float = 15):
    """Ask the camera's helper on this machine. The brain is on the host's network, so this is the machine itself."""
    req = urllib.request.Request(HELPER + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="GET" if body is None else "POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type", "")


class Glow:
    def __init__(self, hub):
        self.hub = hub

    def state(self) -> dict:
        return dict(self.hub.settings.get("glow") or {})

    def _strip(self, id_: str) -> dict:
        return (getattr(self.hub, "strip", None) and self.hub.strip.strips.get(id_)) or {}

    def target(self) -> dict | None:
        """Where the host sends the frames: the strip's address, port, key and run, or None while it is not set."""
        g = self.state()
        if not g.get("strip") or not g.get("key"): return None
        ip = self._strip(g["strip"]).get("ip")
        return {"host": ip, "port": PORT, "key": g["key"], "run": int(g.get("run", 0))} if ip else None

    def choices(self, room: str | None) -> list[dict]:
        """The strips that could be the light behind the TV: each run that is a light in this room, with how many lights
        it has, so the colors are sent at its own count."""
        st, home = getattr(self.hub, "strip", None), getattr(self.hub, "home", None)
        if st is None or home is None: return []
        out = []
        for id_, known in st.strips.items():
            for lid, runs in st._lights(id_).items():
                d = home.devices.get(lid)
                if d is None or (room and d.room_id != room): continue
                run = runs[0] - 1
                count = (known.get("run2") or {}).get("count") if run else known.get("count")
                out.append({"strip": id_, "run": run, "light": lid, "name": d.name, "lights": int(count or 48), "reachable": bool(known.get("ip"))})
        return out

    async def follow(self, strip: str, run: int = 0) -> dict:
        """Tell one strip to follow the picture. The key is made once and kept, so the host's settings stay good."""
        if strip not in getattr(self.hub.strip, "strips", {}): raise GlowError("No such light strip.")
        g = self.state()
        key = g.get("key") if g.get("strip") == strip and g.get("run", 0) == run else None
        g.update(strip=strip, run=run, key=key or secrets.token_hex(8), on=True)
        self.hub.settings.set(glow=g)
        await self._arm(g)
        return {"glow": g, "target": self.target()}

    def lights(self) -> int:
        g = self.state()
        return next((c["lights"] for c in self.choices(None) if c["strip"] == g.get("strip") and c["run"] == g.get("run", 0)), 48)

    def save(self, corners: list, start: str | None = None, first: str | None = None, bottom: bool = False) -> dict:
        """Where the screen is (from the TV finding itself, or marked on a phone), and the way the strip runs if it was
        said; kept by the helper, which follows from them. The house remembers that it is set up."""
        t = self.target()
        if not t: raise GlowError("The light behind the TV isn't answering on the Wi-Fi.")
        if len(corners) != 4 or not all(len(c) == 2 and all(0 <= v <= 1 for v in c) for c in corners): raise ValueError("Four corners.")
        body = {"corners": corners, "target": t, "lights": self.lights()}
        if start: body.update(start=start, first=first, bottom=bool(bottom))
        elif not self.state().get("set"): raise ValueError("Say which way the strip runs the first time.")
        out = json.loads(helper("/save", body)[0])
        g = self.state(); g["set"] = True; self.hub.settings.set(glow=g)
        return out

    def chase(self, stop: bool = False):
        t = self.target()
        if not t: raise GlowError("The light behind the TV isn't answering on the Wi-Fi.")
        helper("/chase", {"stop": True} if stop else {"target": t, "lights": self.lights()})

    async def stop(self) -> dict:
        g = self.state()
        if g.get("strip"):
            g["on"] = False
            self.hub.settings.set(glow=g)
            await self._say(g, {"follow": False})
        return {"glow": g}

    def heard_online(self, strip: str):
        g = self.state()
        if g.get("on") and g.get("strip") == strip:
            import asyncio
            asyncio.ensure_future(self._arm(g))

    async def _arm(self, g: dict):
        await self._say(g, {"follow": True, "port": PORT, "key": g["key"]})

    async def _say(self, g: dict, body: dict):
        topic = f"strip/{g['strip']}/{'run2/' if g.get('run') else ''}follow/set"
        try: await self.hub.ha.call("mqtt", "publish", {}, topic=topic, payload=json.dumps(body), retain=False)
        except Exception as e: log.info("glow: could not tell %s (%s)", g["strip"], e)
