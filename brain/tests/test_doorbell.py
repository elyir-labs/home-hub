# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""A press on the doorbell brings its camera up on every screen (design/tv-doorbell/, A).

Run from brain/: .venv/bin/python -m unittest -v tests.test_doorbell
"""
import json, unittest
from hub import doorbell
from hub.model import Home
from tests.apptest import ApiTest


def house(button="event.front_door_ding", cls="doorbell"):
    areas = [{"area_id": "front", "name": "Front door"}]
    devices = [{"id": "ring1", "area_id": "front", "name": "Front Door", "manufacturer": "Ring"}]
    entities = [{"entity_id": "camera.front_door_live_view", "device_id": "ring1"},
                {"entity_id": button, "device_id": "ring1", "original_device_class": cls}]
    states = [{"entity_id": "camera.front_door_live_view", "state": "idle", "attributes": {"friendly_name": "Front Door"}},
              {"entity_id": button, "state": "2026-11-20T21:09:00+00:00", "attributes": {"device_class": cls}}]
    return areas, devices, entities, states


class Buttons(unittest.TestCase):
    def test_a_doorbell_event_is_paired_with_the_camera_in_the_same_unit(self):
        home = Home().build(*house())
        self.assertEqual(home.bells, {"event.front_door_ding": "camera.front_door_live_view"})

    def test_ring_mqtts_ding_is_a_button_too(self):
        self.assertEqual(Home().build(*house("binary_sensor.front_door_ding", None)).bells, {"binary_sensor.front_door_ding": "camera.front_door_live_view"})

    def test_an_event_of_another_class_on_the_unit_is_not_the_bell(self):
        self.assertEqual(Home().build(*house("event.front_door_motion", "motion")).bells, {})


class Pressing(unittest.TestCase):
    def test_an_event_rings_when_its_time_changes(self):
        at = lambda t: {"state": t}
        self.assertTrue(doorbell.rang("event.d", at("2026-11-20T21:00:00"), at("2026-11-20T21:09:00")))
        self.assertFalse(doorbell.rang("event.d", at("2026-11-20T21:09:00"), at("2026-11-20T21:09:00")))

    def test_a_hub_starting_up_reads_the_last_ring_as_history(self):
        self.assertFalse(doorbell.rang("event.d", None, {"state": "2026-11-20T21:09:00"}))
        self.assertFalse(doorbell.rang("event.d", {"state": "unavailable"}, {"state": "2026-11-20T21:09:00"}))

    def test_a_ding_rings_on_its_way_on(self):
        self.assertTrue(doorbell.rang("binary_sensor.d_ding", {"state": "off"}, {"state": "on"}))
        self.assertFalse(doorbell.rang("binary_sensor.d_ding", {"state": "on"}, {"state": "off"}))


class TellsTheScreens(ApiTest):
    def test_a_press_is_sent_to_every_screen_with_its_camera(self):
        said = []
        self.hub._broadcast = lambda m: said.append(json.loads(m))
        self.hub.home.bells = {"event.front_door_ding": "camera.front"}
        self.hub._on_state({"event_type": "state_changed", "data": {"entity_id": "event.front_door_ding",
                            "old_state": {"state": "2026-11-20T21:00:00"}, "new_state": {"state": "2026-11-20T21:09:00"}}})
        self.assertEqual([(m["type"], m["ring"]["camera"]) for m in said], [("ring", "camera.front")])
