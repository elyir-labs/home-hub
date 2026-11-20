# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Which of the house's screens is a TV, and which show photos at rest (design/which-tv/, decided 20 November 2026).

Run from brain/: .venv/bin/python -m unittest -v tests.test_screens
"""
import tempfile, unittest
from pathlib import Path
from unittest import mock

from hub import screens as screens_mod
from hub.screens import Screens
from tests.apptest import ApiTest

TV, WALL = "a" * 16, "b" * 16


class Saying(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory(); self.addCleanup(self.dir.cleanup)
        p = mock.patch.object(screens_mod, "STATE", Path(self.dir.name) / "screens.json"); p.start(); self.addCleanup(p.stop)
        self.t = 1_000_000.0
        self.s = Screens(now=lambda: self.t)

    def test_a_tv_shows_photos_until_switched_off_and_a_wall_only_once_switched_on(self):
        self.assertTrue(self.s.said(TV, room="living", tv=True)["photos"])
        self.assertFalse(self.s.said(WALL, room="hall", tv=False)["photos"])
        self.assertFalse(self.s.show(TV, False)["photos"])
        self.assertTrue(self.s.show(WALL, True)["photos"])
        self.assertEqual({s["id"]: s["photos"] for s in Screens(now=lambda: self.t).listed()}, {TV: False, WALL: True}, "kept across a restart")

    def test_a_persons_answer_beats_the_screens_guess_from_then_on(self):
        self.s.said(TV, tv=False)
        self.assertTrue(self.s.said(TV, tv=True, by="person")["tv"])
        self.assertTrue(self.s.said(TV, tv=False)["tv"], "the guess says wall again; the person said TV")
        self.assertEqual(self.s.said(TV)["by"], "person")

    def test_the_tvs_are_listed_first_and_a_screen_quiet_for_a_month_is_not(self):
        self.s.said(WALL, room="hall", tv=False); self.s.said(TV, room="living", tv=True)
        self.assertEqual([s["id"] for s in self.s.listed()], [TV, WALL])
        self.t += screens_mod.FORGET_AFTER + 1
        self.s.said(WALL)
        self.assertEqual([s["id"] for s in self.s.listed()], [WALL])

    def test_photos_play_a_day_at_a_time_until_a_screen_is_set_to_one_after_another(self):
        self.assertEqual(self.s.said(TV, tv=True)["play"], "days")
        self.assertEqual(self.s.show(TV, play="each")["play"], "each")
        self.assertTrue(self.s.show(TV, play="sideways")["photos"], "an unknown way changes nothing, and leaves the switch alone")
        self.assertEqual(self.s.said(TV)["play"], "each")

    def test_a_screen_without_its_own_id_is_refused(self):
        for bad in (None, "", "short", "../../etc", "Z" * 20):
            with self.assertRaises(ValueError): self.s.said(bad)


class Routes(ApiTest):
    def test_a_screen_says_what_it_is_and_photos_names_it_by_its_room(self):
        r = self.client.post("/screens/me", json={"id": TV, "room": "living", "tv": True})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()["photos"])
        listed = self.client.get("/photos").json()["screens"]
        self.assertEqual([(s["id"], s["tv"], s["room_name"]) for s in listed], [(TV, True, "Living room")])
        self.assertEqual(self.client.get("/setup/status").json()["screens"], 1)

    def test_the_switch_on_photos_turns_a_wall_on(self):
        self.client.post("/screens/me", json={"id": WALL, "room": "kitchen", "tv": False})
        self.assertTrue(self.client.post(f"/photos/screens/{WALL}", json={"on": True}).json()["photos"])
        self.assertTrue(self.client.post("/screens/me", json={"id": WALL}).json()["photos"], "the wall hears it the next time it rests")
        self.assertEqual(self.client.post(f"/photos/screens/{'c' * 16}", json={"on": True}).status_code, 404)

    def test_the_page_sets_how_the_photos_play_without_touching_the_switch(self):
        self.client.post("/screens/me", json={"id": TV, "tv": True})
        r = self.client.post(f"/photos/screens/{TV}", json={"play": "each"}).json()
        self.assertEqual((r["play"], r["photos"]), ("each", True))

    def test_only_this_screen_says_by_person(self):
        self.client.post("/screens/me", json={"id": TV, "tv": False, "by": "person"})
        self.assertFalse(self.client.post("/screens/me", json={"id": TV, "tv": True}).json()["tv"])
        self.assertEqual(self.client.post("/screens/me", json={"id": "nope"}).status_code, 400)
