# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""A streaming box beside the TV (hub/boxes.py, design/tv-box/, A): its apps, what it last had on, and opening an
app on it, woken first when it sleeps.

Run from brain/: .venv/bin/python -m unittest -v"""
from tests.apptest import ApiTest, house, hardware, entity, state


def house_with_a_box():
    areas, devices, entities, states = house()
    devices += [hardware("hw-box", "living", "Apple TV", manufacturer="Apple"), hardware("hw-tv", "living", "TV", manufacturer="Samsung")]
    entities += [entity("media_player.apple_tv", "hw-box", platform="apple_tv"), entity("media_player.tv", "hw-tv", platform="samsungtv")]
    states += [state("media_player.apple_tv", "standby", friendly_name="Apple TV", source_list=["Netflix", "YouTube", "Disney+"]),
               state("media_player.tv", "on", friendly_name="TV", source_list=["TV", "HDMI 1", "HDMI 2"])]
    return areas, devices, entities, states


class BoxTests(ApiTest):
    def setUp(self):
        super().setUp()
        self.hub.home.build(*house_with_a_box())

    def box(self):
        return self.hub.home.devices["media_player.apple_tv"]

    def play(self, title, app):
        self.hub._on_event({"event_type": "state_changed", "data": {"entity_id": "media_player.apple_tv",
            "old_state": state("media_player.apple_tv", "standby"),
            "new_state": state("media_player.apple_tv", "playing", friendly_name="Apple TV", source_list=["Netflix", "YouTube", "Disney+"],
                               media_title=title, app_name=app)}})

    def test_a_box_carries_its_apps_and_a_tv_its_inputs_do_not_become_apps(self):
        self.assertEqual(self.box().attrs["apps"], ["Netflix", "YouTube", "Disney+"])
        self.assertTrue(self.box().attrs["box"])
        tv = self.hub.home.devices["media_player.tv"].attrs
        self.assertNotIn("apps", tv)
        self.assertNotIn("box", tv)

    def test_opening_an_app_wakes_a_sleeping_box_first(self):
        self.assertEqual(self.client.post("/devices/media_player.apple_tv/app", json={"source": "Netflix"}).status_code, 200)
        self.assertEqual([c[1] for c in self.ha.called("media_player", entity_id="media_player.apple_tv")], ["turn_on", "select_source"])
        self.assertEqual(self.ha.called("media_player", "select_source")[0][3], {"source": "Netflix"})
        self.assertEqual(self.box().attrs["used_apps"], ["Netflix"])

    def test_an_app_the_box_does_not_have_is_refused(self):
        self.assertEqual(self.client.post("/devices/media_player.apple_tv/app", json={"source": "Settings"}).status_code, 400)
        self.assertEqual(self.client.post("/devices/media_player.tv/app", json={"source": "HDMI 1"}).status_code, 400)
        self.assertEqual(self.ha.called("media_player"), [])

    def test_what_the_box_plays_is_what_was_last_on_and_outlives_a_rebuild(self):
        self.play("Harbor Lights", "YouTube")
        last = self.box().attrs["last_on"]
        self.assertEqual((last["title"], last["app"]), ("Harbor Lights", "YouTube"))
        self.assertEqual(self.box().attrs["used_apps"], ["YouTube"])
        self.hub.home.build(*house_with_a_box())
        self.assertEqual(self.box().attrs["last_on"]["title"], "Harbor Lights")
        self.assertEqual(self.hub.settings.get("boxes")["last"]["media_player.apple_tv"]["app"], "YouTube")
