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
import secrets

log = logging.getLogger("hub.glow")
PORT = 21325


class GlowError(Exception):
    pass


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

    async def follow(self, strip: str, run: int = 0) -> dict:
        """Tell one strip to follow the picture. The key is made once and kept, so the host's settings stay good."""
        if strip not in getattr(self.hub.strip, "strips", {}): raise GlowError("No such light strip.")
        g = self.state()
        key = g.get("key") if g.get("strip") == strip and g.get("run", 0) == run else None
        g.update(strip=strip, run=run, key=key or secrets.token_hex(8), on=True)
        self.hub.settings.set(glow=g)
        await self._arm(g)
        return {"glow": g, "target": self.target()}

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
