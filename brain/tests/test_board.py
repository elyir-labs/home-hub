# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The family board: notes and countdowns for the screens (design/tv-moments/, decided 20 November 2026).

Run from brain/: .venv/bin/python -m unittest -v tests.test_board
"""
import tempfile, unittest
from datetime import date
from pathlib import Path
from unittest import mock

from hub import board as board_mod
from hub.board import Board
from tests.apptest import ApiTest


class Keeping(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory(); self.addCleanup(self.dir.cleanup)
        p = mock.patch.object(board_mod, "STATE", Path(self.dir.name) / "board.json"); p.start(); self.addCleanup(p.stop)
        self.t, self.d = 1_000_000.0, date(2026, 11, 20)
        self.b = Board(now=lambda: self.t, today=lambda: self.d)

    def test_a_note_is_up_until_the_time_the_phone_gave_and_one_without_stays(self):
        self.b.leave("Dinner at 7. Love, Mom", by="Mom's phone", until=self.t + 3600)
        self.b.leave("Piano at 4 on Saturday", by=None, until=None)
        self.assertEqual([n["text"] for n in self.b.current()["notes"]], ["Dinner at 7. Love, Mom", "Piano at 4 on Saturday"])
        self.t += 3601
        self.assertEqual([n["text"] for n in self.b.current()["notes"]], ["Piano at 4 on Saturday"])
        self.assertEqual(len(Board(now=lambda: self.t, today=lambda: self.d).notes), 1, "and it is gone from the drive too")

    def test_a_note_is_refused_in_words_when_it_is_empty_too_long_or_already_over(self):
        for text, until in (("   ", None), ("x" * 121, None), ("fine", self.t - 1), ("fine", self.t + 400 * 86400)):
            with self.assertRaises(ValueError): self.b.leave(text, by=None, until=until)

    def test_a_birthday_comes_round_every_year_and_anything_else_goes_after_its_day(self):
        sam = self.b.count_to("Sam's birthday", "2010-11-23", by="Dad's phone")
        trip = self.b.count_to("The trip", "2026-12-01", by=None)
        self.assertEqual((sam["yearly"], sam["next"]), (True, "2026-11-23"))
        self.assertEqual([c["what"] for c in self.b.current()["countdowns"]], ["Sam's birthday", "The trip"], "soonest first")
        self.d = date(2026, 11, 24)
        self.assertEqual([(c["what"], c["next"]) for c in self.b.current()["countdowns"]], [("The trip", "2026-12-01"), ("Sam's birthday", "2027-11-23")])
        self.d = date(2026, 12, 2)
        self.assertEqual([c["what"] for c in self.b.current()["countdowns"]], ["Sam's birthday"])
        self.assertFalse(trip["yearly"])

    def test_a_february_29th_birthday_falls_on_march_1st_in_other_years(self):
        self.assertEqual(self.b.count_to("Leap birthday", "2008-02-29", by=None)["next"], "2027-03-01")

    def test_a_countdown_to_a_day_gone_by_or_no_day_is_refused(self):
        for what, day in (("The trip", "2026-11-19"), ("The trip", "soon"), ("", "2026-12-01"), ("x" * 41, "2026-12-01")):
            with self.assertRaises(ValueError): self.b.count_to(what, day, by=None)

    def test_taking_one_down(self):
        n = self.b.leave("Dinner at 7", by=None, until=None)
        self.assertTrue(self.b.remove(n["id"]))
        self.assertFalse(self.b.remove(n["id"]))


class Routes(ApiTest):
    def test_a_phone_leaves_a_note_and_a_countdown_and_the_screens_read_them(self):
        n = self.client.post("/board/notes", json={"text": "Dinner at 7. Love, Mom", "until": None})
        self.assertEqual(n.status_code, 200, n.text)
        c = self.client.post("/board/countdowns", json={"what": "Sam's birthday", "date": "2010-11-23"})
        self.assertEqual(c.status_code, 200, c.text)
        now = self.client.get("/board").json()
        self.assertEqual(([x["text"] for x in now["notes"]], [x["what"] for x in now["countdowns"]]), (["Dinner at 7. Love, Mom"], ["Sam's birthday"]))
        self.assertEqual(self.client.delete(f"/board/{n.json()['id']}").status_code, 200)
        self.assertEqual(self.client.delete(f"/board/{n.json()['id']}").status_code, 404)

    def test_a_note_that_cannot_be_kept_is_a_400_that_says_why(self):
        r = self.client.post("/board/notes", json={"text": "  "})
        self.assertEqual(r.status_code, 400)
        self.assertIn("written", r.json()["detail"])

    def test_a_screen_can_rest_on_the_board_and_turn_its_notes_off(self):
        sid = "a" * 16
        self.client.post("/screens/me", json={"id": sid, "tv": False})
        r = self.client.post(f"/photos/screens/{sid}", json={"shows": "board", "notes": False}).json()
        self.assertEqual((r["shows"], r["notes"]), ("board", False))
        self.assertEqual(self.client.post(f"/photos/screens/{sid}", json={"shows": "sideways"}).json()["shows"], "board")
