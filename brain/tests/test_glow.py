# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The light behind the TV: the house tells one strip to follow the picture, with a key, and again whenever the strip
restarts; the host is told where to send the frames (hub/glow.py, design/tv-glow/).

Run from brain/: .venv/bin/python -m unittest -v tests.test_glow
"""
import asyncio, json, unittest
from hub.glow import Glow, GlowError, PORT


class Settings(dict):
    def set(self, **kw): self.update(kw)


class HA:
    def __init__(self): self.said = []
    async def call(self, domain, service, target, **data): self.said.append((data["topic"], json.loads(data["payload"]), data["retain"]))


class Strips:
    def __init__(self): self.strips = {"ab12": {"ip": "192.168.1.57", "online": True, "count": 120}}
    def _lights(self, id_): return {"light.behind_tv": [1]} if id_ == "ab12" else {}


class Dev:
    def __init__(self, room, name): self.room_id, self.name = room, name


class Home:
    devices = {"light.behind_tv": Dev("living_room", "Behind the TV")}


class Hub:
    def __init__(self): self.settings, self.ha, self.strip, self.home = Settings(), HA(), Strips(), Home()


class Following(unittest.TestCase):
    def setUp(self):
        self.hub = Hub(); self.glow = Glow(self.hub)

    def test_a_strip_is_told_to_follow_with_a_key_and_the_host_where_to_send(self):
        out = asyncio.run(self.glow.follow("ab12"))
        topic, body, retain = self.hub.ha.said[-1]
        self.assertEqual((topic, body["follow"], body["port"], retain), ("strip/ab12/follow/set", True, PORT, False))
        self.assertEqual(len(body["key"]), 16)
        self.assertEqual(out["target"], {"host": "192.168.1.57", "port": PORT, "key": body["key"], "run": 0})

    def test_the_key_is_kept_so_the_hosts_settings_stay_good(self):
        a = asyncio.run(self.glow.follow("ab12"))["glow"]["key"]
        b = asyncio.run(self.glow.follow("ab12"))["glow"]["key"]
        self.assertEqual(a, b)

    def test_a_second_run_has_its_own_topic(self):
        asyncio.run(self.glow.follow("ab12", run=1))
        self.assertEqual(self.hub.ha.said[-1][0], "strip/ab12/run2/follow/set")

    def test_a_strip_that_restarts_is_told_again(self):
        async def go():
            await self.glow.follow("ab12"); self.hub.ha.said.clear()
            self.glow.heard_online("ab12"); await asyncio.sleep(0)
            self.glow.heard_online("zz99"); await asyncio.sleep(0)
        asyncio.run(go())
        self.assertEqual([t for t, _, _ in self.hub.ha.said], ["strip/ab12/follow/set"])

    def test_stopping_tells_it_to_stop(self):
        asyncio.run(self.glow.follow("ab12")); asyncio.run(self.glow.stop())
        self.assertEqual(self.hub.ha.said[-1][1], {"follow": False})
        self.assertFalse(self.hub.settings["glow"]["on"])

    def test_no_such_strip(self):
        with self.assertRaises(GlowError): asyncio.run(self.glow.follow("nope"))

    def test_no_address_yet_is_no_target(self):
        self.hub.strip.strips["ab12"].pop("ip")
        self.assertIsNone(asyncio.run(self.glow.follow("ab12"))["target"])


class Choosing(unittest.TestCase):
    def test_the_strips_in_the_tvs_room_are_offered_with_their_own_count(self):
        g = Glow(Hub())
        self.assertEqual(g.choices("living_room"), [{"strip": "ab12", "run": 0, "light": "light.behind_tv", "name": "Behind the TV", "lights": 120, "reachable": True}])
        self.assertEqual(g.choices("kitchen"), [])
