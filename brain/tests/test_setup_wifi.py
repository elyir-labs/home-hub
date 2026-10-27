# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""A hub with no network, set up from a phone on the Wi-Fi it makes of its own (design/setup-network/, A).

The brain's half: what it says about the setup Wi-Fi, and how far a phone on it is let in. Holding the
label's password is enough to give the hub the house's Wi-Fi, before there is a house and after it has a
passcode, and it is never enough for anything else.

Run from brain/: .venv/bin/python -m unittest -v tests.test_setup_wifi
"""
import json

from fastapi.testclient import TestClient

from hub import api
from hub.network import Network
from tests.apptest import ApiTest

SETUP = {"X-Hub-Via": "setup"}
SCREEN = {"X-Hub-Via": "screen"}


class HubOnNothing(ApiTest):
    def setUp(self):
        super().setUp()
        self.state, self.req = self.data / "network.json", self.data / "network.request"
        self.hub.net = Network(self.hub, state=self.state, request=self.req)
        self.write()

    def write(self, **kw):
        self.state.write_text(json.dumps({"at": 9e9, "hostname": "hub", "links": [{"kind": "wifi", "device": "wlp1s0", "up": False}],
                                          "setup": {"ssid": "Elyir Hub 4F2A", "both": True, "since": 1, "chan": "6"},
                                          "scan": [{"ssid": "Elyir Hub 4F2A", "signal": 99, "secure": True},
                                                   {"ssid": "Bluebell", "signal": 80, "band": "5", "secure": True}], **kw}))


class OnTheSetupWifi(HubOnNothing):
    def test_the_hub_says_its_own_wifi_is_up_and_whether_it_can_stay_up_while_it_tries(self):
        r = self.client.get("/network", headers=SETUP).json()
        self.assertEqual((r["how"], r["setup"]), ("none", {"ssid": "Elyir Hub 4F2A", "both": True, "phones": 0}))

    def test_its_own_wifi_is_never_offered_as_the_houses(self):
        self.assertEqual([n["ssid"] for n in self.hub.net.seen()], ["Bluebell"])

    def test_a_wrong_password_and_a_network_that_never_answered_are_told_apart(self):
        self.write(reverted="Bluebell", reverted_why="password")
        r = self.client.get("/network", headers=SETUP).json()
        self.assertEqual((r["reverted"], r["reverted_why"]), ("Bluebell", "password"))

    def test_once_joined_the_phone_is_told_which_network_before_the_setup_wifi_goes(self):
        self.write(joined={"ssid": "Bluebell", "at": 9e9})
        self.assertEqual(self.client.get("/network", headers=SETUP).json()["joined"], "Bluebell")

    def test_the_wifi_can_be_given_before_the_house_has_started(self):
        self.hub.driver = "down"
        r = self.client.post("/network/hub", json={"ssid": "Bluebell", "password": "pw"}, headers=SETUP)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(json.loads(self.req.read_text())["do"], "join")

    def test_off_the_setup_wifi_a_house_that_has_not_started_still_waits(self):
        self.hub.driver = "down"
        self.assertEqual(self.client.post("/network/hub", json={"ssid": "Bluebell", "password": "pw"}).status_code, 503)

    def test_a_locked_house_lets_the_label_give_it_a_wifi_and_nothing_more(self):
        self.lock_the_house("4821")
        self.assertEqual(self.client.get("/network", headers=SETUP).status_code, 200)
        self.assertEqual(self.client.post("/network/scan", headers=SETUP).status_code, 200)
        self.assertEqual(self.client.post("/network/hub", json={"ssid": "Bluebell", "password": "pw"}, headers=SETUP).status_code, 200)
        self.assertEqual(self.client.get("/home", headers=SETUP).status_code, 401)
        self.assertEqual(self.client.post("/network/bridges", json={"ssid": "Bluebell", "password": "pw"}, headers=SETUP).status_code, 401)

    def test_on_the_houses_own_wifi_a_locked_house_still_wants_its_phone_and_code(self):
        self.lock_the_house("4821")
        self.assertEqual(self.client.post("/network/hub", json={"ssid": "Bluebell", "password": "pw"}).status_code, 401)
        self.assertFalse(self.req.exists())


class OnTheHubsOwnScreen(HubOnNothing):
    """A hub with a screen and no network asks which Wi-Fi on that screen, with its own Wi-Fi's code beside the
    question (design/screen-wifi/, C). The screen is where the label would be, so it alone is shown the password."""

    def setUp(self):
        super().setUp()
        (self.data / "network.setup-key").write_text("kite-maple-41")
        self.screen = TestClient(api.app, client=("127.0.0.1", 50000))

    def test_the_screen_plugged_into_the_hub_is_shown_its_wifis_password(self):
        self.assertEqual(self.screen.get("/network", headers=SCREEN).json()["setup"]["password"], "kite-maple-41")

    def test_nobody_else_is_shown_it_not_a_phone_on_the_hubs_wifi_nor_a_header_sent_from_the_house(self):
        self.assertNotIn("password", self.client.get("/network", headers=SETUP).json()["setup"])
        self.assertNotIn("password", self.client.get("/network", headers=SCREEN).json()["setup"])
        self.assertNotIn("password", self.client.get("/network").json()["setup"])

    def test_and_not_the_screen_once_the_hubs_wifi_is_gone(self):
        self.write(setup=None)
        self.assertNotIn("setup", self.screen.get("/network", headers=SCREEN).json())

    def test_a_phone_that_joins_the_hubs_wifi_is_counted_so_the_screen_can_step_aside(self):
        self.write(setup_phones=1)
        self.assertEqual(self.screen.get("/network", headers=SCREEN).json()["setup"]["phones"], 1)

    def test_the_screen_can_give_the_wifi_before_the_house_has_started(self):
        self.hub.driver = "down"
        self.assertEqual(self.screen.post("/network/hub", json={"ssid": "Bluebell", "password": "pw"}, headers=SCREEN).status_code, 200)
        self.assertEqual(json.loads(self.req.read_text())["ssid"], "Bluebell")

    def test_a_header_from_anywhere_but_the_hub_itself_is_not_the_screen(self):
        self.hub.driver = "down"
        self.assertEqual(self.client.post("/network/hub", json={"ssid": "Bluebell", "password": "pw"}, headers=SCREEN).status_code, 503)

    def test_the_screen_is_given_the_wifi_as_a_code_a_phones_camera_joins(self):
        r = self.screen.get("/network/setup.svg", headers=SCREEN)
        self.assertEqual((r.status_code, r.headers["content-type"]), (200, "image/svg+xml"))
        self.assertEqual(self.hub.net.setup_code(), "WIFI:T:WPA;S:Elyir Hub 4F2A;P:kite-maple-41;;")

    def test_and_nobody_else_is(self):
        self.assertEqual(self.client.get("/network/setup.svg", headers=SCREEN).status_code, 404)
        self.assertEqual(self.client.get("/network/setup.svg", headers=SETUP).status_code, 404)

    def test_a_name_or_password_with_the_codes_own_punctuation_still_joins(self):
        self.write(setup={"ssid": 'Flat; 3', "both": True})
        (self.data / "network.setup-key").write_text('a:b,c"d\\e')
        self.assertEqual(self.hub.net.setup_code(), 'WIFI:T:WPA;S:Flat\; 3;P:a\\:b\\,c\\"d\\\\e;;')
