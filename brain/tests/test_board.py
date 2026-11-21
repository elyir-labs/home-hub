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


class Mornings(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory(); self.addCleanup(self.dir.cleanup)
        p = mock.patch.object(board_mod, "STATE", Path(self.dir.name) / "board.json"); p.start(); self.addCleanup(p.stop)
        self.d = date(2026, 11, 20)
        self.b = Board(now=lambda: 1.0, today=lambda: self.d)

    def test_a_line_for_the_morning_is_one_per_day_the_latest_kept_and_gone_after(self):
        self.b.for_morning("Proud of you", "2026-11-21", by="Dad's phone")
        self.b.for_morning("Proud of you for yesterday.", "2026-11-21", by="Dad's phone")
        self.assertEqual([m["text"] for m in self.b.current()["mornings"]], ["Proud of you for yesterday."])
        self.d = date(2026, 11, 23)
        self.assertEqual(self.b.current()["mornings"], [])

    def test_a_line_for_a_morning_far_off_or_empty_is_refused(self):
        for text, day in (("Hi", "2026-12-25"), ("", "2026-11-21"), ("x" * 91, "2026-11-21"), ("Hi", "tomorrow")):
            with self.assertRaises(ValueError): self.b.for_morning(text, day, by=None)


class Words(unittest.TestCase):
    def test_every_word_file_is_there_and_every_line_fits(self):
        from hub import words
        limits = {"morning": 70, "evening": 70}
        for name, most in limits.items():
            pool = words.lines(name)
            self.assertGreater(len(pool), 30, name)
            self.assertEqual([x for x in pool if len(x) > most], [], f"{name}: lines too long for the TV")

    def test_the_line_of_the_day_is_the_same_all_day_and_changes_the_next(self):
        from hub import words
        a, b = words.of_the_day("morning", date(2026, 11, 21)), words.of_the_day("morning", date(2026, 11, 22))
        self.assertEqual(a, words.of_the_day("morning", date(2026, 11, 21)))
        self.assertNotEqual(a, b)
        self.assertIsNone(words.of_the_day("nothing-by-this-name", date(2026, 11, 21)))


class MorningRoutes(ApiTest):
    def test_a_phone_leaves_a_line_for_the_morning_and_a_screen_reads_its_day(self):
        r = self.client.post("/board/mornings", json={"text": "Proud of you", "day": date.today().isoformat()})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual([m["text"] for m in self.client.get("/board").json()["mornings"]], ["Proud of you"])
        w = self.client.get("/words/today", params={"day": "2026-11-21"}).json()
        self.assertTrue(w["morning"] and w["evening"])
        self.assertEqual(self.client.get("/words/today", params={"day": "soon"}).status_code, 400)

    def test_a_screen_turns_its_lines_off(self):
        sid = "b" * 16
        self.client.post("/screens/me", json={"id": sid, "tv": True})
        self.assertFalse(self.client.post(f"/photos/screens/{sid}", json={"lines": False}).json()["lines"])


class Cards(unittest.TestCase):
    def test_a_day_brings_two_facts_two_questions_a_joke_and_a_quote_each_in_two_parts(self):
        from hub import words
        day = words.cards_of_the_day(date(2026, 11, 21))
        self.assertEqual({k: len(v) for k, v in day.items()}, {"facts": 2, "trivia": 2, "jokes": 1, "quotes": 1})
        self.assertTrue(all(len(c) == 2 and all(c) for v in day.values() for c in v))
        self.assertNotEqual(day["facts"], words.cards_of_the_day(date(2026, 11, 22))["facts"])

    def test_every_card_has_its_two_parts_within_what_the_tv_fits(self):
        from hub import words
        most = {"facts": (60, 110), "trivia": (70, 40), "jokes": (70, 70), "quotes": (90, 40)}
        for name, (a, b) in most.items():
            for line in words.lines(name):
                first, _, second = line.partition("|")
                self.assertTrue(second.strip(), f"{name}: {line!r} has no second part")
                self.assertLessEqual(len(first.strip()), a, f"{name}: {line!r}")
                self.assertLessEqual(len(second.strip()), b, f"{name}: {line!r}")


class CardRoutes(ApiTest):
    def test_the_days_cards_come_with_its_lines_and_each_screen_chooses_which(self):
        w = self.client.get("/words/today", params={"day": "2026-11-21"}).json()
        self.assertEqual(len(w["facts"][0]), 2)
        sid = "c" * 16
        me = self.client.post("/screens/me", json={"id": sid, "tv": True}).json()
        self.assertEqual({k: me[k] for k in ("today", "facts", "jokes", "quotes")}, {"today": True, "facts": True, "jokes": False, "quotes": False})
        r = self.client.post(f"/photos/screens/{sid}", json={"jokes": True, "facts": False}).json()
        self.assertEqual((r["jokes"], r["facts"], r["today"]), (True, False, True))
