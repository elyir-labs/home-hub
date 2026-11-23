# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""A change made on a phone reaches a screen that is already resting.

A resting TV asks for its photos, its board and what it shows when it starts and each time it comes to rest. A photo
added, a note left or photos switched to the board while it was resting waited for somebody to wake it and walk away
(22 November 2026). Each of those now nudges every open screen to ask again; paintings arriving do too (test_art).

Run from brain/: .venv/bin/python -m unittest -v tests.test_rest_nudge
"""
import json
from unittest import mock

from tests.apptest import ApiTest
from tests.test_photos import JPEG

TV = "a" * 16


class Nudged(ApiTest):
    def nudges(self, call):
        with mock.patch.object(self.hub, "_broadcast") as sent:
            r = call()
        return r, [json.loads(m.args[0]) for m in sent.call_args_list].count({"type": "rest"})

    def test_a_photo_added_or_removed_nudges_the_screens(self):
        r, n = self.nudges(lambda: self.client.post("/photos", content=JPEG))
        self.assertEqual((r.status_code, n), (200, 1))
        r, n = self.nudges(lambda: self.client.delete(f"/photos/{r.json()['id']}"))
        self.assertEqual((r.status_code, n), (200, 1))

    def test_what_a_screen_shows_changed_on_a_phone_nudges_the_screens(self):
        self.client.post("/screens/me", json={"id": TV, "room": "living", "tv": True})
        r, n = self.nudges(lambda: self.client.post(f"/photos/screens/{TV}", json={"shows": "board"}))
        self.assertEqual((r.status_code, n), (200, 1))

    def test_a_note_left_or_taken_down_nudges_the_screens(self):
        r, n = self.nudges(lambda: self.client.post("/board/notes", json={"text": "Back at six", "until": None}))
        self.assertEqual((r.status_code, n), (200, 1), r.text)
        r, n = self.nudges(lambda: self.client.delete(f"/board/{r.json()['id']}"))
        self.assertEqual((r.status_code, n), (200, 1))

    def test_a_refused_change_nudges_nobody(self):
        r, n = self.nudges(lambda: self.client.post("/photos", content=b"<script>"))
        self.assertEqual((r.status_code, n), (400, 0))

