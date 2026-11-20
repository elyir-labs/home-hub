# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The household's photos, kept for a TV at rest (design/rest-tv/, A).

Run from brain/: .venv/bin/python -m unittest -v tests.test_photos
"""
import tempfile, unittest
from pathlib import Path

from hub import photos as photos_mod
from hub.photos import Photos, kind_of
from tests.apptest import ApiTest

JPEG = b"\xff\xd8\xff\xe0" + b"\0" * 64
PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 64
WEBP = b"RIFF\0\0\0\0WEBP" + b"\0" * 64


class Keeping(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory(); self.addCleanup(self.dir.cleanup)
        self.t = 1_000_000.0
        self.p = Photos(Path(self.dir.name), now=lambda: self.t)

    def test_an_image_is_known_by_its_bytes_not_its_name(self):
        self.assertEqual([kind_of(b) for b in (JPEG, PNG, WEBP)], ["jpg", "png", "webp"])
        self.assertIsNone(kind_of(b"<svg xmlns='http://www.w3.org/2000/svg'/>"))
        self.assertIsNone(kind_of(b"GIF89a"))

    def test_what_is_not_a_photo_is_refused_in_words(self):
        for bad in (b"", b"<html>", b"\xff\xd8\xff" + b"\0" * (photos_mod.MAX_BYTES + 1)):
            with self.assertRaises(ValueError) as e: self.p.add(bad)
            self.assertTrue(str(e.exception).startswith("That"))
        self.assertEqual(self.p.list(), [])

    def test_a_photo_is_kept_with_whose_phone_and_when_and_survives_a_restart(self):
        a = self.p.add(JPEG, by="Sam's phone", taken=900_000)
        again = Photos(Path(self.dir.name))
        self.assertEqual(again.list(), [a])
        path, ctype = again.file(a["id"])
        self.assertEqual((path.read_bytes(), ctype), (JPEG, "image/jpeg"))
        self.assertEqual((a["by"], a["taken"]), ("Sam's phone", 900_000))

    def test_a_taken_date_from_the_future_is_not_believed(self):
        self.assertIsNone(self.p.add(JPEG, taken=self.t + 10 * 86400)["taken"])

    def test_a_size_that_is_not_two_sensible_numbers_is_left_out(self):
        for bad in ((0, 10), (10, 99999), ("10", "20"), (1,)):
            p = self.p.add(JPEG, size=bad)
            self.assertEqual((p["w"], p["h"]), (None, None), bad)

    def test_newest_first_and_past_the_ceiling_the_oldest_goes(self):
        keep = photos_mod.KEEP
        photos_mod.KEEP = 2; self.addCleanup(setattr, photos_mod, "KEEP", keep)
        ids = []
        for _ in range(3):
            self.t += 1; ids.append(self.p.add(JPEG)["id"])
        self.assertEqual([p["id"] for p in self.p.list()], [ids[2], ids[1]])
        self.assertIsNone(self.p.file(ids[0]))
        self.assertFalse(any(Path(self.dir.name).glob(f"{ids[0]}.*")))

    def test_a_removed_photo_is_gone_from_the_drive(self):
        a = self.p.add(PNG)
        self.assertTrue(self.p.remove(a["id"]))
        self.assertFalse(self.p.remove(a["id"]))
        self.assertEqual(list(Path(self.dir.name).glob("*.png")), [])


class Routes(ApiTest):
    def test_a_phone_sends_a_photo_and_the_tv_lists_and_shows_it(self):
        r = self.client.post("/photos", content=JPEG, headers={"Content-Type": "image/jpeg", "X-Taken": "1700000000", "X-Width": "1080", "X-Height": "1440"})
        self.assertEqual(r.status_code, 200, r.text)
        photo = r.json()
        self.assertEqual((photo["taken"], photo["w"], photo["h"]), (1700000000, 1080, 1440))
        self.assertEqual([p["id"] for p in self.client.get("/photos").json()["photos"]], [photo["id"]])
        got = self.client.get(f"/photos/{photo['id']}")
        self.assertEqual((got.status_code, got.headers["content-type"], got.content), (200, "image/jpeg", JPEG))
        self.assertTrue(str(photos_mod.ROOT).startswith(str(self.data)), "never the developer's own house")

    def test_something_that_is_not_a_photo_is_a_400_that_says_why(self):
        r = self.client.post("/photos", content=b"<script>", headers={"Content-Type": "image/jpeg"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("isn't a photo", r.json()["detail"])

    def test_a_removed_photo_is_a_404_after(self):
        photo = self.client.post("/photos", content=PNG).json()
        self.assertEqual(self.client.delete(f"/photos/{photo['id']}").status_code, 200)
        self.assertEqual(self.client.get(f"/photos/{photo['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"/photos/{photo['id']}").status_code, 404)

    def test_a_locked_house_does_not_hand_its_photos_to_a_stranger(self):
        self.lock_the_house("4821")
        self.client.cookies.clear()
        self.assertIn(self.client.get("/photos").status_code, (401, 403))
        self.assertIn(self.client.post("/photos", content=JPEG).status_code, (401, 403))
