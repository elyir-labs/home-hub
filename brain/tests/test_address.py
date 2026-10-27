# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The house's own address: offered only when it can be paid for, claimed once, its secret kept here and
never shown, and outside turned on and off through a file the host checks again (host/away.sh)."""
import json, os, unittest
from pathlib import Path
from unittest import mock

from hub.address import Unreachable, first_guess
from hub.lock import needs_code
from tests.apptest import ApiTest

SECRET = "s" * 43
TOKEN = "a" * 64


class Service:
    """The registration service, as far as the hub can tell: what relay/service/app.py answers."""
    def __init__(self, offer=None):
        self.houses: dict[str, str] = {}
        self.carried: set[str] = set()
        self.offer = offer or {"open": True, "price": "$3 a month", "pay": "https://account.example/hub"}
        self.calls = []
        self.account = Account()

    def __call__(self, method, path, body=None, secret=None, timeout=8.0):
        self.calls.append((method, path))
        if path.startswith("https://account.example/"): return self.account(method, path, body, secret)
        if path == "/offer": return 200, self.offer
        if path.endswith("/carry") and method == "POST":
            name = path.split("/")[2]
            if self.houses.get(name) != secret: return 404, {"detail": "No house by that name holds that key."}
            if body.get("ticket") != f"ticket-for-{name}": return 403, {"detail": "That ticket is not good here."}
            self.carried.add(name)
            return 200, {"name": name, "entitled_until": 1.9e9}
        if path.startswith("/names/"):
            name = path.split("/")[2].split("?")[0]
            return 200, ({"name": name, "free": False, "why": "taken", "suggestions": ["jordans-house", "jordan-cedar", "jordan-lee"]}
                         if name in self.houses else {"name": name, "free": True, "address": f"{name}.elyir.app"})
        if path == "/houses" and method == "POST":
            name = body["name"]
            if name in self.houses: return 409, {"detail": {"why": "taken", "suggestions": ["jordans-house"]}}
            self.houses[name] = SECRET
            return 201, {"name": name, "address": f"{name}.elyir.app", "secret": SECRET, "carried": False,
                         "relay": {"addr": "relay.elyir.app", "token": TOKEN}}
        if path.startswith("/houses/"):
            name = path.split("/")[2]
            if self.houses.get(name) != secret: return 404, {"detail": "No house by that name holds that key."}
            if method == "DELETE": del self.houses[name]; return 204, None
            return 200, {"name": name, "carried": name in self.carried, "held_until": None, "entitled_until": 1.9e9 if name in self.carried else None,
                         "relay": {"addr": "relay.elyir.app", "token": TOKEN}}
        return 404, None


HUB_TOKEN = "hb_" + "h" * 43


class Account:
    """account.elyir.com, as far as the hub can tell: bench-cloud's cloud/hubs.py."""
    def __init__(self):
        self.hubs: dict[str, dict] = {}       # token -> {"name", "home", "paid"}
        self.codes = 0

    def __call__(self, method, url, body=None, secret=None):
        path = url.removeprefix("https://account.example")
        if path == "/v1/hubs" and method == "POST":
            self.hubs[HUB_TOKEN] = {"name": body["name"], "home": body["home"], "paid": False}
            self.codes += 1
            return 200, {"hub": "hb1", "hub_token": HUB_TOKEN, "code": f"hc_{self.codes}", "code_expires": 0}
        hub = self.hubs.get(secret or "")
        if hub is None: return 401, {"error": "This hub isn't known here."}
        if path == "/v1/hub/code":
            self.codes += 1
            return 200, {"code": f"hc_{self.codes}", "code_expires": 0}
        if path == "/v1/hub/ticket":
            return (200, {"ticket": f"ticket-for-{hub['name']}", "until": 1.9e9, "expires": 0}) if hub["paid"] else (403, {"error": "not paid"})
        if path == "/v1/hub":
            return 200, {"name": hub["name"], "payer": "t•••i@example.com" if hub["paid"] else None,
                         "plan": {"on": hub["paid"], "until": 1.9e9 if hub["paid"] else None, "cancels": False, "price": "$3 a month"}}
        return 404, None


class Guess(unittest.TestCase):
    def test_the_field_starts_from_what_the_house_was_called(self):
        self.assertEqual(first_guess("Jordan's house"), "jordan")
        self.assertEqual(first_guess("Maple Court"), "maple-court")
        self.assertEqual(first_guess("The Lee Home"), "lee")
        self.assertEqual(first_guess(None), "home-hub")
        self.assertEqual(first_guess("House"), "home-hub")


class Addressing(ApiTest):
    def setUp(self):
        super().setUp()
        self.service = Service()
        self.hub.address.fetch = self.service
        self.hub.settings.set(home_name="Jordan's house", owner={"name": "Jordan Lee"})
        self.hub.location = {"name": "Cedar Falls, IA", "lat": 42.5, "lon": -92.4}

    def test_nothing_is_offered_until_the_service_says_it_can_be_paid_for(self):
        self.service.offer = {"open": False, "price": None, "pay": None}
        seen = self.client.get("/address").json()
        self.assertFalse(seen["offer"]["open"]); self.assertIsNone(seen["house"])
        self.assertEqual(seen["guess"], "jordan")

    def test_a_service_that_is_down_offers_nothing_and_breaks_nothing(self):
        self.hub.address.fetch = mock.Mock(side_effect=Unreachable("down"))
        self.assertFalse(self.client.get("/address").json()["offer"]["open"])
        self.assertEqual(self.client.get("/address/names/jordan").status_code, 503)

    def test_the_makers_own_hub_is_offered_it_by_hand(self):
        self.service.offer = {"open": False, "price": None, "pay": None}
        with mock.patch.dict(os.environ, {"HUB_AWAY_OFFER": "on"}):
            self.assertEqual(self.client.get("/address").json()["offer"], {"open": True, "price": None, "pay": None, "by_hand": True})

    def test_looking_sends_the_town_and_the_surname_as_hints(self):
        self.client.get("/address/names/jordan")
        path = self.service.calls[-1][1]
        self.assertIn("also=Cedar+Falls", path); self.assertIn("also=Lee", path)

    def test_claiming_keeps_the_secret_here_and_never_shows_it(self):
        out = self.client.post("/address", json={"name": "jordan"})
        self.assertEqual(out.status_code, 200)
        self.assertEqual(out.json()["address"], "jordan.elyir.app")
        self.assertNotIn(SECRET, json.dumps(out.json()))
        self.assertNotIn(SECRET, json.dumps(self.client.get("/address").json()))
        kept = json.loads((self.data / "address.json").read_text())
        self.assertEqual(kept["secret"], SECRET)
        self.assertEqual(oct((self.data / "address.json").stat().st_mode & 0o777), "0o600")

    def test_claiming_asks_the_host_to_turn_outside_on_with_values_it_can_check(self):
        self.client.post("/address", json={"name": "jordan"})
        self.assertEqual(json.loads((self.data / "away.request").read_text())["want"], "on")
        values = (self.data / "away.env").read_text()
        self.assertEqual(values, f"HUB_AWAY_HOUSE=jordan\nHUB_RELAY_SECRET={SECRET}\nHUB_RELAY_TOKEN={TOKEN}\nHUB_RELAY_ADDR=relay.elyir.app\nHUB_AWAY_ZONE=elyir.app\n")

    def test_a_taken_address_answers_with_somewhere_else(self):
        self.service.houses["jordan"] = "someone else's"
        out = self.client.post("/address", json={"name": "jordan"})
        self.assertEqual(out.status_code, 409); self.assertEqual(out.json()["detail"]["why"], "taken")
        self.assertFalse((self.data / "away.request").exists())

    def test_a_house_has_one_address(self):
        self.client.post("/address", json={"name": "jordan"})
        self.assertEqual(self.client.post("/address", json={"name": "palace"}).status_code, 422)

    def test_what_the_panel_shows_once_the_house_is_carried(self):
        self.client.post("/address", json={"name": "jordan"})
        self.assertFalse(self.client.get("/address").json()["carried"])
        self.service.carried.add("jordan"); self.hub.address._status = None
        (self.data / "away.json").write_text(json.dumps({"on": True, "house": "jordan"}))
        (self.data / "away.request").unlink()
        seen = self.client.get("/address").json()
        self.assertTrue(seen["carried"]); self.assertTrue(seen["on"]); self.assertFalse(seen["waiting"])

    def test_off_and_on_keep_the_address(self):
        self.client.post("/address", json={"name": "jordan"})
        self.assertEqual(self.client.post("/address/off").json()["want"], "off")
        self.assertEqual(json.loads((self.data / "away.request").read_text())["want"], "off")
        self.assertEqual(self.client.get("/address").json()["house"], "jordan")
        self.assertEqual(self.client.post("/address/on").json()["want"], "on")
        self.assertEqual(self.client.post("/address/sideways").status_code, 404)

    def test_giving_it_back_takes_the_secret_out_of_everything(self):
        self.client.post("/address", json={"name": "jordan"})
        self.client.delete("/address")
        self.assertNotIn("jordan", self.service.houses)
        self.assertFalse((self.data / "address.json").exists())
        self.assertEqual((self.data / "away.env").read_text(), "")
        self.assertEqual(json.loads((self.data / "away.request").read_text())["want"], "forget")

    def test_an_answer_that_does_not_look_right_never_reaches_the_host(self):
        def odd(method, path, body=None, secret=None, timeout=8.0):
            if path == "/houses": return 201, {"name": "jordan", "address": "jordan.elyir.app", "secret": "bad secret; rm -rf /", "relay": {"addr": "relay.elyir.app", "token": TOKEN}}
            return self.service(method, path, body, secret, timeout)
        self.hub.address.fetch = odd
        self.client.post("/address", json={"name": "jordan"})
        self.assertFalse((self.data / "away.request").exists())
        self.assertFalse((self.data / "away.env").exists())

    def test_it_is_behind_the_code_and_the_keys(self):
        for m, p in (("POST", "/address"), ("POST", "/address/pay"), ("POST", "/address/on"), ("POST", "/address/off"), ("DELETE", "/address")):
            self.assertTrue(needs_code(m, p), (m, p))
        self.assertFalse(needs_code("GET", "/address"))
        self.assertFalse(needs_code("GET", "/address/names/jordan"))

    def test_claiming_hands_the_wall_a_code_for_the_payment_page_and_keeps_the_token(self):
        out = self.client.post("/address", json={"name": "jordan"}).json()
        self.assertEqual(out["pay"], "https://account.example/hub?c=hc_1")
        self.assertEqual(self.service.account.hubs[HUB_TOKEN], {"name": "jordan", "home": "Jordan's house", "paid": False})
        self.assertNotIn(HUB_TOKEN, json.dumps(out)); self.assertNotIn(HUB_TOKEN, json.dumps(self.client.get("/address").json()))
        self.assertEqual(json.loads((self.data / "address.json").read_text())["account"], {"api": "https://account.example", "token": HUB_TOKEN})
        # asked again (the wall's code ran out, or it is opened in the browser again): the same hub, a fresh code
        self.assertEqual(self.client.post("/address/pay").json(), {"pay": "https://account.example/hub?c=hc_2"})
        self.assertEqual(len(self.service.account.hubs), 1)

    def test_nothing_to_pay_by_hand_or_with_no_address(self):
        self.assertEqual(self.client.post("/address/pay").status_code, 409)
        self.service.offer = {"open": False, "price": None, "pay": None}
        with mock.patch.dict(os.environ, {"HUB_AWAY_OFFER": "on"}):
            self.assertIsNone(self.client.post("/address", json={"name": "jordan"}).json()["pay"])

    def test_the_name_is_kept_when_the_payment_page_is_not_answering(self):
        account = self.service.account
        self.service.account = lambda *a, **k: (502, None)
        out = self.client.post("/address", json={"name": "jordan"})
        self.assertEqual(out.status_code, 200)
        self.assertEqual(out.json()["house"], "jordan"); self.assertIsNone(out.json()["pay"])
        self.assertEqual(self.client.post("/address/pay").status_code, 503)
        self.service.account = account
        self.assertEqual(self.client.post("/address/pay").json(), {"pay": "https://account.example/hub?c=hc_1"})

    def test_once_it_is_paid_the_wall_moves_on_by_itself_and_says_who_pays(self):
        self.client.post("/address", json={"name": "jordan"})
        seen = self.client.get("/address").json()
        self.assertFalse(seen["carried"]); self.assertIsNone(seen["paid"]["payer"])
        self.service.account.hubs[HUB_TOKEN]["paid"] = True        # Stripe told the account
        self.hub.address._tried = 0; self.hub.address._paid = None
        seen = self.client.get("/address").json()
        self.assertTrue(seen["carried"])
        self.assertEqual(seen["paid"], {"payer": "t•••i@example.com", "price": "$3 a month", "paid_until": 1.9e9, "cancels": False})

    def test_the_account_is_asked_only_while_somebody_may_be_paying(self):
        self.client.post("/address", json={"name": "jordan"})
        self.hub.address._paying_until = 0
        before = len(self.service.calls)
        self.client.get("/address")
        self.assertNotIn(("POST", "https://account.example/v1/hub/ticket"), self.service.calls[before:])

    def test_a_paid_address_is_carried_again_before_it_runs_out(self):
        self.client.post("/address", json={"name": "jordan"})
        self.assertFalse(self.hub.address.renew())                 # not paid: nothing to carry
        self.service.account.hubs[HUB_TOKEN]["paid"] = True
        self.assertTrue(self.hub.address.renew())
        self.hub.address._status = None
        self.hub.address.now = lambda: 1.9e9 - 30 * 86400          # a month still to run: no need to ask
        before = len(self.service.calls)
        self.assertFalse(self.hub.address.renew())
        self.assertNotIn(("POST", "https://account.example/v1/hub/ticket"), self.service.calls[before:])

    def test_the_house_is_backed_up_with_its_address(self):
        from hub import backup
        self.assertIn("address.json", backup.DATA_FILES)


class Paths(unittest.TestCase):
    def test_the_host_watches_the_file_this_writes(self):
        unit = (Path(__file__).resolve().parents[2] / "driver-layer" / "host" / "home-hub-away.path").read_text()
        self.assertIn("brain-data/away.request", unit)
