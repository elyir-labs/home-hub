# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""A hub on its USB stick, beside a drive with something on it (design/move-to-drive/, A with B's sheet).

The brain's half: when first run asks, what it says about the drive, that a move names the drive by the
serial the screen showed, and that erasing a drive is a change to the house once it has a passcode.

Run from brain/: .venv/bin/python -m unittest -v tests.test_drive
"""
import json

from hub.drive import Drive
from hub.phones import COOKIE
from tests.apptest import ApiTest

UBUNTU = {"name": "nvme0n1", "serial": "S6P7NS0T", "model": "Samsung SSD 980 500GB", "bytes": 500107862016,
          "empty": False, "system": "Ubuntu 24.04", "used": 65498251264, "last": 1792400000}


class BesideADrive(ApiTest):
    def setUp(self):
        super().setUp()
        self.state, self.req = self.data / "drive.json", self.data / "drive.request"
        self.hub.drive = Drive(self.hub, state=self.state, request=self.req)
        self.write()

    def write(self, **kw):
        self.state.write_text(json.dumps({"at": 9e9, "image": "x86", "from": "stick", "drives": [UBUNTU], **kw}))

    def test_first_run_asks_about_the_drive_with_something_on_it(self):
        r = self.client.get("/drive").json()
        self.assertTrue(r["ask"])
        self.assertEqual((r["drive"]["model"], r["drive"]["system"]), ("Samsung SSD 980 500GB", "Ubuntu 24.04"))

    def test_on_its_own_drive_there_is_nothing_to_ask(self):
        self.write(**{"from": "drive"})
        r = self.client.get("/drive").json()
        self.assertEqual((r["ask"], r["drive"]), (False, None))

    def test_keep_is_the_households_answer_and_is_not_asked_again(self):
        self.client.post("/drive/keep")
        r = self.client.get("/drive").json()
        self.assertEqual((r["ask"], r["kept"], r["drive"]["name"]), (False, True, "nvme0n1"))

    def test_a_move_names_the_drive_by_the_serial_the_screen_showed(self):
        r = self.client.post("/drive/move", json={"name": "nvme0n1", "serial": "S6P7NS0T"})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["moving"])
        self.assertEqual(json.loads(self.req.read_text())["do"], "move")

    def test_a_serial_that_is_not_the_drives_asks_nothing_of_the_host(self):
        r = self.client.post("/drive/move", json={"name": "nvme0n1", "serial": "SOMETHING-ELSE"})
        self.assertEqual(r.status_code, 400)
        self.assertFalse(self.req.exists())

    def test_once_the_house_has_a_passcode_erasing_the_drive_needs_it(self):
        self.lock_the_house("4821")
        phone, token = self.hub.phones.with_code("Robin's phone", "phone")
        self.client.cookies.set(COOKIE, token)
        self.assertEqual(self.client.post("/drive/move", json={"name": "nvme0n1", "serial": "S6P7NS0T"}).json()["detail"], "code")
        self.assertFalse(self.req.exists())
        ok = self.client.post("/drive/move", json={"name": "nvme0n1", "serial": "S6P7NS0T"}, headers={"X-Hub-Code": "4821"})
        self.assertEqual(ok.status_code, 200)

    def test_never_from_away(self):
        self.assertEqual(self.client.post("/drive/move", json={"name": "nvme0n1", "serial": "S6P7NS0T"},
                                          headers={"X-Hub-Via": "relay"}).status_code, 403)
        self.assertFalse(self.req.exists())

    def test_the_move_is_said_once_on_the_drive_and_then_never_again(self):
        self.write(**{"from": "drive", "moved": 1792500000})
        self.assertTrue(self.client.get("/drive").json()["moved"])
        self.client.post("/drive/seen")
        self.assertFalse(self.client.get("/drive").json()["moved"])

    def test_the_hosts_refusal_and_a_failed_move_come_through_in_its_words(self):
        self.write(asked={"refused": "That isn't the drive the screen showed. Look again."},
                   failed="The hub couldn't move onto the drive, so it's still running from the USB stick.")
        r = self.client.get("/drive").json()
        self.assertEqual(r["refused"], "That isn't the drive the screen showed. Look again.")
        self.assertTrue(r["failed"].startswith("The hub couldn't move"))
