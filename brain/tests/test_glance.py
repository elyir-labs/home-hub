# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The house on a phone's home screen (design/widget/, A and C): what /glance says, and who may ask.

The store apps' widget is built against this answer in another repository, so its shape is a contract
(docs/apps.md, What the page gives the shell) and the words are pinned here, not there.

Run from brain/: .venv/bin/python -m unittest -v
"""
from hub.phones import COOKIE
from tests.apptest import ApiTest

AWAY = {"X-Hub-Via": "relay"}


class GlanceWords(ApiTest):
    def setUp(self):
        super().setUp()
        self.hub.settings.set(home_name="Maple Court")
        self.hub.weather = {"id": "weather.home", "condition": "partlycloudy", "temperature": 77.5, "unit": "°F"}

    def glance(self):
        r = self.client.get("/glance")
        self.assertEqual(r.status_code, 200)
        return r.json()

    def people(self, *home):
        self.hub.presence.people = {f"person.{i}": {"name": f"P{i}", "home": h} for i, h in enumerate(home)}
        self.hub.presence.somebody = self.hub.presence.compute()

    def test_the_shape_the_widget_is_built_against(self):
        g = self.glance()
        self.assertEqual(set(g), {"name", "temp", "sky", "said", "needs", "count", "at"})
        self.assertEqual((g["name"], g["temp"], g["sky"]), ("Maple Court", "78°", "partlycloudy"))
        self.assertIsInstance(g["at"], int)

    def test_one_room_on_is_named(self):
        self.assertEqual(self.glance()["said"], ["On in the Living room"])

    def test_things_on_in_several_rooms_are_counted_with_who_is_home(self):
        self.hub.home.devices["light.kitchen"].state = "on"
        self.people(True, True, False)
        self.assertEqual(self.glance()["said"], ["On in 2 rooms", "2 people home"])
        self.people(True, False)
        self.assertEqual(self.glance()["said"][1], "1 person home")

    def test_everything_off(self):
        for eid in ("light.ceiling", "media_player.tv"): self.hub.home.devices[eid].state = "off"
        self.people(False, False)
        self.assertEqual(self.glance()["said"], ["Everything is off", "Nobody home"])

    def test_what_the_panel_does_not_count_as_on_is_not_counted_here(self):
        for eid in ("light.ceiling", "media_player.tv"): self.hub.home.devices[eid].state = "off"
        self.hub.home.devices["binary_sensor.kitchen_motion"].state = "on"
        self.hub.home.devices["switch.kettle"].state = "on"
        self.hub.home.devices["switch.kettle"].attrs["off_home"] = True
        self.assertEqual(self.glance()["said"], ["Everything is off"])

    def test_no_people_part_when_the_house_does_not_know_who_is_home(self):
        self.people(None)
        self.assertEqual(len(self.glance()["said"]), 1)

    def test_needs_a_look_comes_first_in_its_own_words(self):
        self.hub.home.devices["light.kitchen"].state = "unavailable"
        notes = self.client.get("/health").json()["notes"]
        g = self.glance()
        self.assertEqual(g["needs"], notes[0]["text"])
        self.assertEqual(g["count"], len(notes))
        self.assertIn("Kitchen lights", g["needs"])

    def test_nothing_needs_a_look(self):
        g = self.glance()
        self.assertEqual((g["needs"], g["count"]), (None, len(self.client.get("/health").json()["notes"])))

    def test_no_weather_is_null_rather_than_a_guess(self):
        self.hub.weather = None
        g = self.glance()
        self.assertEqual((g["temp"], g["sky"]), (None, None))
        self.hub.weather = {"id": "weather.home", "condition": "unavailable", "temperature": None}
        g = self.glance()
        self.assertEqual((g["temp"], g["sky"]), (None, None))

    def test_a_starting_hub_says_so_rather_than_that_everything_is_off(self):
        self.hub.driver = "connecting"
        self.assertEqual(self.client.get("/glance").status_code, 503)


class GlanceDoor(ApiTest):
    """The same door as /health: the phone's pass as a cookie or a Bearer, and from away only a phone set to Anywhere."""
    def setUp(self):
        super().setUp()
        self.lock_the_house("4821")

    def phone(self, remote=False):
        phone, token = self.hub.phones.with_code("Jordan's phone")
        if remote: self.hub.phones.set_remote(phone["id"], True)
        return token

    def test_a_stranger_is_refused(self):
        self.assertEqual(self.client.get("/glance").status_code, 401)
        self.assertEqual(self.client.get("/glance", headers=AWAY).status_code, 403)

    def test_a_phone_of_the_house_is_answered_by_bearer_or_cookie(self):
        token = self.phone()
        self.assertEqual(self.client.get("/glance", headers={"Authorization": f"Bearer {token}"}).status_code, 200)
        self.client.cookies.set(COOKIE, token)
        self.assertEqual(self.client.get("/glance").status_code, 200)

    def test_from_away_only_a_phone_set_to_anywhere(self):
        home_only, anywhere = self.phone(), self.phone(remote=True)
        r = self.client.get("/glance", headers={**AWAY, "Authorization": f"Bearer {home_only}"})
        self.assertEqual((r.status_code, r.json()["detail"]), (403, "remote"))
        self.assertEqual(self.client.get("/glance", headers={**AWAY, "Authorization": f"Bearer {anywhere}"}).status_code, 200)


class WidgetScenesDoor(ApiTest):
    """Bedtime and Everything off from the widget: a Bearer pass, and from away a phone set to Anywhere."""
    def setUp(self):
        super().setUp()
        self.lock_the_house("4821")

    def bearer(self, remote=False):
        phone, token = self.hub.phones.with_code("Jordan's phone")
        if remote: self.hub.phones.set_remote(phone["id"], True)
        return {"Authorization": f"Bearer {token}"}

    def test_a_bearer_pass_runs_both_without_the_code(self):
        for scene in ("asleep", "away"):
            with self.subTest(scene=scene):
                r = self.client.post(f"/home/intent/{scene}", headers=self.bearer())
                self.assertEqual(r.status_code, 200)
                self.assertTrue(r.json()["ok"])
        self.assertTrue(self.ha.called("light", "turn_off", "light.ceiling"))

    def test_from_away_a_phone_set_to_anywhere_runs_them_and_no_other_does(self):
        self.assertEqual(self.client.post("/home/intent/away", headers={**AWAY, **self.bearer()}).status_code, 403)
        self.assertEqual(self.client.post("/home/intent/away", headers=AWAY).status_code, 403)
        self.assertEqual(self.client.post("/home/intent/asleep", headers={**AWAY, **self.bearer(remote=True)}).status_code, 200)
