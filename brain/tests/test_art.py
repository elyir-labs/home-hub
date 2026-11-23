# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Paintings for the screens at rest (design/tv-art/, decided 20 November 2026: C, and a channel too).

Run from brain/: .venv/bin/python -m unittest -v tests.test_art
"""
import asyncio, hashlib, json, tempfile, unittest
from pathlib import Path
from unittest import mock

from hub import art as art_mod
from hub.art import Art
from tests.apptest import ApiTest

TV = "a" * 16
PICTURE = b"\xff\xd8\xff" + b"a painting" * 50
OTHER = b"\xff\xd8\xff" + b"something else" * 50


def entry(pid: str, data: bytes = PICTURE, **more) -> dict:
    return {"id": pid, "title": pid.title(), "painter": "A painter", "year": "1889", "museum": "A museum", "line": "A line.",
            "file": f"{pid}.jpg", "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "w": 4, "h": 3, "focus": [0.3, 0.5], **more}


class Store(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp()); self.addCleanup(lambda: __import__("shutil").rmtree(self.dir, ignore_errors=True))
        self.set = self.dir / "paintings.json"
        self.write([entry("field"), entry("harbor"), {"id": "not-ready", "title": "Not prepared yet"}])
        for name, value in (("ROOT", self.dir / "art"), ("SET", self.set)):
            p = mock.patch.object(art_mod, name, value); p.start(); self.addCleanup(p.stop)
        self.asked: list[str] = []
        self.served = {"field.jpg": PICTURE, "harbor.jpg": PICTURE}

    def write(self, paintings):
        self.set.write_text(json.dumps({"paintings": paintings}))
        art_mod.paintings.cache_clear()
        self.addCleanup(art_mod.paintings.cache_clear)

    def fetch(self, url: str) -> bytes:
        self.asked.append(url)
        name = url.rsplit("/", 1)[-1]
        if name not in self.served: raise OSError("not there")
        return self.served[name]

    def test_only_prepared_paintings_are_in_the_set(self):
        self.assertEqual([p["id"] for p in art_mod.paintings()], ["field", "harbor"])

    def test_nothing_is_downloaded_until_a_screen_wants_art_and_then_only_from_our_own_host(self):
        a = Art(fetch=self.fetch)
        asyncio.run(a.settle(False))
        self.assertEqual(self.asked, [])
        self.assertEqual(a.list(), [])
        asyncio.run(a.settle(True))
        self.assertTrue(all(u.startswith(art_mod.HOST) for u in self.asked), self.asked)
        self.assertEqual([p["id"] for p in a.list()], ["field", "harbor"])
        self.assertEqual(a.state()["have"], 2)
        self.assertNotIn("sha256", a.list()[0], "the screens get what they show, not our bookkeeping")
        asyncio.run(a.settle(True))
        self.assertEqual(len(self.asked), 2, "a painting already here is not downloaded again")

    def test_paintings_arriving_nudge_the_screens_once_and_nothing_new_does_not(self):
        told = []
        a = Art(fetch=self.fetch, arrived=lambda: told.append(1))
        asyncio.run(a.settle(True))
        asyncio.run(a.settle(True))
        self.assertEqual(told, [1], "a screen showing art hears when they land, and not again when nothing new did")

    def test_a_picture_that_is_not_the_one_we_prepared_is_refused_and_the_rest_still_arrive(self):
        self.served["field.jpg"] = OTHER
        a = Art(fetch=self.fetch)
        asyncio.run(a.settle(True))
        self.assertEqual([p["id"] for p in a.list()], ["harbor"])
        self.assertIsNone(a.file("field"))
        self.assertTrue(a.state()["failed"])

    def test_turning_art_off_on_every_screen_frees_the_room(self):
        a = Art(fetch=self.fetch)
        asyncio.run(a.settle(True))
        self.assertTrue((self.dir / "art").exists())
        asyncio.run(a.settle(False))
        self.assertFalse((self.dir / "art").exists())
        self.assertEqual(a.state()["have"], 0)

    def test_a_painting_is_served_only_by_its_id_from_the_set(self):
        a = Art(fetch=self.fetch)
        asyncio.run(a.settle(True))
        self.assertEqual(a.file("field").read_bytes(), PICTURE)
        for bad in ("../paintings", "not-ready", "nothing"):
            self.assertIsNone(a.file(bad))


class Routes(ApiTest):
    def test_art_starts_off_and_a_screen_can_show_it_between_the_photos_or_all_day(self):
        me = self.client.post("/screens/me", json={"id": TV, "room": "living", "tv": True}).json()
        self.assertFalse(me["art"])
        self.assertFalse(self.hub.screens.want_art())
        with mock.patch.object(self.hub.art, "poke") as poked:
            r = self.client.post(f"/photos/screens/{TV}", json={"art": True})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertTrue(r.json()["art"])
            poked.assert_called()
        self.assertTrue(self.hub.screens.want_art())
        self.client.post(f"/photos/screens/{TV}", json={"art": False, "shows": "art"})
        self.assertEqual(self.client.post("/screens/me", json={"id": TV}).json()["shows"], "art")
        self.assertTrue(self.hub.screens.want_art(), "a screen that shows paintings all day wants them too")

    def test_art_says_what_is_here_and_how_getting_it_is_going(self):
        body = self.client.get("/art").json()
        self.assertEqual(body["paintings"], [])
        self.assertEqual(body["have"], 0)
        self.assertEqual(body["of"], len(art_mod.paintings()))
        self.assertEqual(self.client.get("/art/nothing").status_code, 404)


if __name__ == "__main__":
    unittest.main()
