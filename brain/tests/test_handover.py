# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Run from brain/: .venv/bin/python -m unittest -v tests.test_handover"""
import asyncio, json, tempfile, time, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from hub import backup, handover
from hub.settings import Settings

DESCRIPTIONS = {"core": {"integration": {
    "nest": {"iot_class": "cloud_push"},
    "hue": {"iot_class": "local_push"},
    "google": {"name": "Google", "integrations": {"google_tasks": {"iot_class": "cloud_polling"}, "cast": {"iot_class": "local_polling"}}},
    "mqtt": {"iot_class": "local_push"},
}}}
ENTRIES = [{"entry_id": "e-nest", "domain": "nest", "title": "Thermostat account"},
           {"entry_id": "e-hue", "domain": "hue", "title": "Light bridge"},
           {"entry_id": "e-mqtt", "domain": "mqtt", "title": "Messages"}]
DEVICES = [{"id": "d1", "config_entries": ["e-nest"], "identifiers": [["nest", "abc"]], "area_id": "hall", "name_by_user": "Hall thermostat"},
           {"id": "d2", "config_entries": ["e-nest"], "identifiers": [["nest", "def"]], "area_id": None, "name_by_user": None},
           {"id": "d3", "config_entries": ["e-hue"], "identifiers": [["hue", "lamp"]], "area_id": "den", "name_by_user": None}]


class FakeHA:
    def __init__(self): self.sent, self.called = [], []
    async def send(self, type_, **kw):
        self.sent.append((type_, kw))
        return {"integration/descriptions": DESCRIPTIONS, "config_entries/get": ENTRIES, "config/device_registry/list": DEVICES,
                "person/list": {"storage": [{"id": "p1", "name": "Jordan"}, {"id": "p2", "name": "Sam"}]},
                "application_credentials/list": [{"id": "c1", "domain": "nest"}]}.get(type_)
    async def call(self, domain, service, entity_id, **data): self.called.append((domain, service, data))


class Handing(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory(); d = Path(self.dir.name)
        self.keep = (backup.RESET, backup.REQUEST, backup.ARCHIVE, handover.RESET, handover.REQUEST, handover.ARCHIVE, handover.PRINTERS)
        handover.RESET, handover.REQUEST, handover.ARCHIVE, handover.PRINTERS = d / "reset.request", d / "restore.request", d / "restore.tar.gz", d / "printers.json"
        handover.PRINTERS.write_text("{}")
        self.settings = Settings(d / "settings.json")
        self.settings.set(pin="hash", owner={"name": "Jordan"}, home_name="Maple Court", assistant={"key": "sk"}, wifi={"ssid": "Bluebell"},
                          location={"lat": 1}, kinds={"x": "lamp"}, look="nightfall", setup_done=True)
        self.removed, self.forgot = [], []
        phones = SimpleNamespace(data=[{"id": "w", "kind": "wall"}, {"id": "s", "kind": "screen"}, {"id": "p", "kind": "phone"}],
                                 asks={"a": {}}, _save=lambda: None)
        log = SimpleNamespace(cleared=False, rows=[])
        log.clear = lambda: setattr(log, "cleared", True)
        log.add = lambda *a, **k: log.rows.append(a)
        self.hub = SimpleNamespace(
            ha=FakeHA(), settings=self.settings, phones=phones, log=log, ready=lambda: None,
            lock=SimpleNamespace(locked=True), address=SimpleNamespace(forget=lambda who: self.forgot.append(who)),
            share=SimpleNamespace(set=lambda on=None: None), add=SimpleNamespace(_rest=lambda m, p: self.removed.append(p)),
            home=SimpleNamespace(rooms={}, devices={}), engine=SimpleNamespace(rules=[]))
        self.h = handover.Handover(self.hub)

    def tearDown(self):
        (backup.RESET, backup.REQUEST, backup.ARCHIVE, handover.RESET, handover.REQUEST, handover.ARCHIVE, handover.PRINTERS) = self.keep
        self.dir.cleanup()

    def test_a_service_is_somebodys_when_it_reaches_the_house_through_the_cloud(self):
        self.assertEqual(handover.cloud_domains(DESCRIPTIONS), {"nest", "google_tasks"})

    def test_a_house_with_no_code_is_refused(self):
        self.hub.lock.locked = False
        with self.assertRaises(PermissionError): asyncio.run(self.h.run())
        self.assertFalse(handover.RESET.exists())

    def test_the_people_go_and_the_house_stays(self):
        asyncio.run(self.h.run("the wall"))
        self.assertEqual(self.removed, ["/api/config/config_entries/entry/e-nest"], "only the cloud account; the light bridge and the plumbing stay")
        sent = [t for t, _ in self.hub.ha.sent]
        self.assertEqual([kw["person_id"] for t, kw in self.hub.ha.sent if t == "person/delete"], ["p1", "p2"])
        self.assertIn("application_credentials/delete", sent)
        self.assertIn(("recorder", "purge", {"keep_days": 0, "repack": True}), self.hub.ha.called)
        self.assertEqual(self.forgot, ["the wall"])
        self.assertEqual([p["id"] for p in self.hub.phones.data], ["w", "s"], "the screens are the house's")
        self.assertEqual(self.hub.phones.asks, {})
        self.assertTrue(self.hub.log.cleared)
        self.assertFalse(handover.PRINTERS.exists())
        for gone in ("pin", "owner", "home_name", "assistant", "wifi"): self.assertNotIn(gone, self.settings.data, gone)
        for kept in ("location", "kinds", "look"): self.assertIn(kept, self.settings.data, kept)
        self.assertFalse(self.settings.get("setup_done"))
        self.assertTrue(self.settings.get("handed_over"))
        self.assertEqual(json.loads(handover.RESET.read_text())["what"], "people")

    def test_where_the_services_devices_were_is_written_down_first(self):
        asyncio.run(self.h.run())
        back = self.settings.get("returning")
        self.assertEqual([(r["identifiers"], r["area_id"], r["name"]) for r in back], [([["nest", "abc"]], "hall", "Hall thermostat")],
                         "a device with no room had nothing to remember, and the light bridge's never left")

    def test_the_same_device_comes_home_to_its_room_and_name(self):
        self.settings.set(returning=[{"identifiers": [["nest", "abc"]], "area_id": "hall", "name": "Hall thermostat", "until": time.time() + 99},
                                     {"identifiers": [["nest", "old"]], "area_id": "den", "name": None, "until": time.time() - 1}])
        came = [{"id": "n1", "identifiers": [["nest", "abc"]], "area_id": None}, {"id": "n2", "identifiers": [["nest", "zzz"]], "area_id": None}]
        self.assertEqual(asyncio.run(self.h.welcome_back(came)), 1)
        self.assertIn(("config/device_registry/update", {"device_id": "n1", "area_id": "hall", "name_by_user": "Hall thermostat"}), self.hub.ha.sent)
        self.assertEqual(self.settings.get("returning"), [], "the one that came home, and the one waited for too long, are gone")
        self.hub.ha.sent.clear()
        self.assertEqual(asyncio.run(self.h.welcome_back(came)), 0)
        self.assertEqual(self.hub.ha.sent, [], "nobody waiting, nothing asked")


if __name__ == "__main__":
    unittest.main()
