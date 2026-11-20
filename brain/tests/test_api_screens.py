# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""A second screen in a house that has a hub (design/companion/, C).

The screen joins the house the way any phone does -- the passcode, or a yes from somewhere already in --
and then says which room it hangs in. These pin the brain's half: that a screen is written down as a
screen, that the room lands on its own record and names it, and that nothing about it widens the door.

Run from brain/: .venv/bin/python -m unittest -v tests.test_api_screens
"""
from fastapi.testclient import TestClient

from hub import api
from hub.phones import COOKIE, holds_keys
from tests.apptest import ApiTest

SCREEN = {"X-Hub-Via": "screen"}


class ScreenJoinsALockedHouse(ApiTest):
    def setUp(self):
        super().setUp()
        self.code = self.lock_the_house("4821")

    def join_with_code(self):
        r = self.client.post("/phones/code", json={"code": self.code, "name": "A screen", "kind": "screen"})
        self.assertEqual(r.status_code, 200)
        return r.json()["phone"]

    def test_a_screen_that_typed_the_passcode_is_written_down_as_a_screen_and_holds_keys(self):
        phone = self.join_with_code()
        self.assertEqual((phone["kind"], phone["how"]), ("screen", "code"))
        # a wall is where Allow is tapped, so a screen that was given the passcode can let phones in
        self.assertTrue(holds_keys(self.hub.phones.get(phone["id"])))

    def test_the_room_lands_on_the_screens_record_and_names_it(self):
        phone = self.join_with_code()
        r = self.client.post("/phones/me/room", json={"room": "kitchen"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()["phone"]["room"], r.json()["phone"]["name"]), ("kitchen", "Kitchen screen"))
        self.assertEqual(self.hub.phones.get(phone["id"])["room"], "kitchen")
        self.assertTrue(self.sent("phones"), "every panel is told, so People shows the new name")

    def test_moving_it_to_another_room_renames_it_again(self):
        self.join_with_code()
        self.client.post("/phones/me/room", json={"room": "kitchen"})
        r = self.client.post("/phones/me/room", json={"room": "living"})
        self.assertEqual(r.json()["phone"]["name"], "Living room screen")

    def test_a_name_somebody_chose_is_kept(self):
        phone, token = self.hub.phones.with_code("Jordan's iPad", "phone")
        self.client.cookies.set(COOKIE, token)
        r = self.client.post("/phones/me/room", json={"room": "kitchen"})
        self.assertEqual((r.json()["phone"]["name"], r.json()["phone"]["room"]), ("Jordan's iPad", "kitchen"))

    def test_choosing_a_room_does_not_need_the_passcode_but_does_need_to_be_in(self):
        r = self.client.post("/phones/me/room", json={"room": "kitchen"})
        self.assertEqual((r.status_code, r.json()["detail"]), (401, "phone"))
        self.join_with_code()
        self.assertEqual(self.client.post("/phones/me/room", json={"room": "kitchen"}).status_code, 200)

    def test_a_room_the_house_does_not_have_is_refused(self):
        self.join_with_code()
        self.assertEqual(self.client.post("/phones/me/room", json={"room": "attic"}).status_code, 404)

    def test_a_screen_that_asked_is_a_screen_too(self):
        a = self.client.post("/phones/ask", json={"name": "A screen", "kind": "screen"}).json()
        self.assertEqual(a["kind"], "screen")


class TheHubsOwnScreen(ApiTest):
    """The screen plugged into the hub joins without the passcode and is asked only its room (design/tv-join/, C)."""
    def setUp(self):
        super().setUp()
        self.lock_the_house("4821")
        self.own = TestClient(api.app, client=("127.0.0.1", 50000))
        self.addCleanup(self.own.close)

    def test_it_is_told_it_is_the_hubs_own_and_joins_as_a_screen_without_keys(self):
        self.assertTrue(self.own.get("/phones/me", headers=SCREEN).json()["plugged_in"])
        r = self.own.post("/phones/plugged-in", headers=SCREEN)
        self.assertEqual(r.status_code, 200)
        self.assertIn(COOKIE, r.cookies)
        phone = r.json()["phone"]
        self.assertEqual((phone["kind"], phone["how"]), ("screen", "plugged in"))
        # the HDMI port is proof enough to use the house, not to let other phones into it
        self.assertFalse(holds_keys(self.hub.phones.get(phone["id"])))

    def test_the_stamp_counts_only_from_the_hub_itself(self):
        # the brain also listens where anything on the Wi-Fi can reach it and send whatever header it likes
        self.assertFalse(self.client.get("/phones/me", headers=SCREEN).json()["plugged_in"])
        self.assertEqual(self.client.post("/phones/plugged-in", headers=SCREEN).status_code, 403)
        self.assertEqual(self.own.post("/phones/plugged-in").status_code, 403)
        self.assertEqual(self.hub.phones.data, [])

    def test_never_from_away(self):
        r = self.own.post("/phones/plugged-in", headers={"X-Hub-Via": "relay"})
        self.assertEqual(r.status_code, 403)


class ScreenInAnOpenHouse(ApiTest):
    def test_with_no_passcode_there_is_no_record_and_the_screen_keeps_its_room_itself(self):
        r = self.client.post("/phones/me/room", json={"room": "kitchen"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"room": "kitchen", "phone": None})
