# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""A streaming box beside the TV (hub/boxes.py, design/tv-box/, A): its apps, what it last had on, opening an app on
it, woken first when it sleeps, and the keys of a remote plugged into the hub passed on to it.

Run from brain/: .venv/bin/python -m unittest -v"""
from tests.apptest import ApiTest, house, hardware, entity, state


def house_with_a_box():
    areas, devices, entities, states = house()
    devices += [hardware("hw-box", "living", "Apple TV", manufacturer="Apple"), hardware("hw-tv", "living", "TV", manufacturer="Samsung"),
                hardware("hw-pod", "living", "HomePod", manufacturer="Apple")]
    entities += [entity("media_player.apple_tv", "hw-box", platform="apple_tv"), entity("media_player.tv", "hw-tv", platform="samsungtv"),
                 entity("media_player.homepod", "hw-pod", platform="apple_tv"), entity("remote.apple_tv", "hw-box", platform="apple_tv"),
                 entity("remote.homepod", "hw-pod", platform="apple_tv")]
    states += [state("media_player.apple_tv", "standby", friendly_name="Apple TV", source_list=["Netflix", "YouTube", "Disney+"]),
               state("media_player.tv", "on", friendly_name="TV", source_list=["TV", "HDMI 1", "HDMI 2"]),
               state("media_player.homepod", "off", friendly_name="HomePod"), state("remote.apple_tv", "on"), state("remote.homepod", "on")]
    return areas, devices, entities, states


class BoxTests(ApiTest):
    def setUp(self):
        super().setUp()
        self.hub.home.build(*house_with_a_box())

    def box(self):
        return self.hub.home.devices["media_player.apple_tv"]

    def play(self, title, app, kind="tvshow", eid="media_player.apple_tv"):
        self.hub._on_event({"event_type": "state_changed", "data": {"entity_id": eid,
            "old_state": state(eid, "standby"),
            "new_state": state(eid, "playing", friendly_name="Apple TV", source_list=["Netflix", "YouTube", "Disney+"] if eid.endswith("apple_tv") else None,
                               media_title=title, app_name=app, media_content_type=kind)}})

    def test_a_homepod_from_the_same_integration_is_a_speaker_not_a_box(self):
        self.assertNotIn("box", self.hub.home.devices["media_player.homepod"].attrs)

    def test_the_apps_people_mostly_open_come_first_and_the_box_s_own_store_and_settings_are_not_apps(self):
        from hub.boxes import apps_of
        got = apps_of({"source_list": ["[adult swim]", "App\u00a0Store", "Angry Birds Reloaded", "Disney+", "Netflix", "Settings", "Search", "YouTube"]})
        self.assertEqual(got, ["Netflix", "YouTube", "Disney+", "[adult swim]", "Angry Birds Reloaded"])

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
        self.assertEqual(self.box().attrs["opened"]["app"], "Netflix")      # every screen hears it, the TV's included

    def test_an_app_the_box_does_not_have_is_refused(self):
        self.assertEqual(self.client.post("/devices/media_player.apple_tv/app", json={"source": "Settings"}).status_code, 400)
        self.assertEqual(self.client.post("/devices/media_player.tv/app", json={"source": "HDMI 1"}).status_code, 400)
        self.assertEqual(self.ha.called("media_player"), [])

    def test_music_through_the_box_or_a_homepod_is_not_what_was_last_on(self):
        self.play("Soul Provider", "Music", kind="music")
        self.play("Soul Provider", None, kind="music", eid="media_player.homepod")
        self.assertIsNone(self.box().attrs["last_on"])
        self.assertEqual(self.hub.settings.get("boxes") or {}, {})

    def test_what_the_box_plays_is_what_was_last_on_and_outlives_a_rebuild(self):
        self.play("Harbor Lights", "YouTube")
        last = self.box().attrs["last_on"]
        self.assertEqual((last["title"], last["app"]), ("Harbor Lights", "YouTube"))
        self.assertEqual(self.box().attrs["used_apps"], ["YouTube"])
        self.hub.home.build(*house_with_a_box())
        self.assertEqual(self.box().attrs["last_on"]["title"], "Harbor Lights")
        self.assertEqual(self.hub.settings.get("boxes")["last"]["media_player.apple_tv"]["app"], "YouTube")

    def test_a_remote_s_keys_reach_the_apple_tv_through_its_own_remote_in_the_box_s_words(self):
        self.assertTrue(self.box().attrs["keys"])
        for key in ("up", "ok", "back", "louder"):
            self.assertEqual(self.client.post("/devices/media_player.apple_tv/key", json={"key": key}).status_code, 200)
        sent = self.ha.called("remote", "send_command", entity_id="remote.apple_tv")
        self.assertEqual([c[3]["command"] for c in sent], ["up", "select", "menu", "volume_up"])
        self.assertEqual(self.hub.log.recent(subject="media_player.apple_tv"), [])

    def test_a_key_is_not_a_touch_on_the_room(self):
        self.client.post("/devices/media_player.apple_tv/key", json={"key": "ok"})
        self.assertIsNone(self.hub.home.rooms["living"].hold_until)

    def test_a_key_the_box_has_no_word_for_or_a_player_that_is_not_a_box_is_refused(self):
        self.assertEqual(self.client.post("/devices/media_player.apple_tv/key", json={"key": "eject"}).status_code, 400)
        self.assertEqual(self.client.post("/devices/media_player.homepod/key", json={"key": "up"}).status_code, 400)
        self.assertEqual(self.client.post("/devices/media_player.tv/key", json={"key": "up"}).status_code, 400)
        self.assertEqual(self.ha.called("remote"), [])

    def test_a_box_with_no_remote_beside_it_takes_no_keys(self):
        areas, devices, entities, states = house_with_a_box()
        self.hub.home.build(areas, devices, [e for e in entities if e["entity_id"] != "remote.apple_tv"], states)
        self.assertNotIn("keys", self.box().attrs)
        self.assertEqual(self.client.post("/devices/media_player.apple_tv/key", json={"key": "up"}).status_code, 400)
