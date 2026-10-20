# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Run from brain/: .venv/bin/python -m unittest -v

The catalog is the house's whole voice in one table (docs/messages.md). These pin what makes it one:
an id is said once, a class is one of four, every hole a template has is one its caller fills, and the
lines on Needs a look carry their id and class without a word of theirs changing."""
import asyncio, json, os, re, time, unittest
from collections import namedtuple
from pathlib import Path
from unittest import mock
from hub import health, messages, updates
from tests.test_health import FakeProvision
from tests.test_rules import FakeBridges, FakeHub, rule, use

HUB = Path(messages.__file__).parent
DISK = namedtuple("u", "total used free")
ROOMY = DISK(100 * 1024 ** 3, 10 * 1024 ** 3, 90 * 1024 ** 3)

# One set of holes for every message, as its call sites fill them. A template asking for a hole that is
# not here is a call site that cannot fill it either.
SAMPLES = {
    "device.offline": {"name": "Hall light", "when": "yesterday"},
    "bridge.quiet": {"name": "The Hallway bridge", "when": "3:10 pm", "network": "Home"},
    "storage.low": {"left": "1.0 GB"},
    "account.signed_out": {"name": "Nest", "title": "Home"},
    "account.check": {"name": "Nest", "title": "Home"},
    "part.signed_out": {"name": "Ring"},
    "part.stopped": {"name": "Z-Wave radio", "why": "the stick vanished"},
    "part.unplugged": {"name": "Zigbee radio", "then": "Plug a Zigbee stick in and it starts on its own."},
    "entry.failed": {"name": "Nest", "reason": "the key expired"},
    "hub.restarts": {"count": 3},
    "hub.restarted_itself": {"when": "3:10 pm"},
    "hub.power_lost": {"part": "the Zigbee radio", "count": 3},
    "hub.part_restarted": {"part": "the Zigbee radio", "count": 3},
    "update.refused": {"version": "v1.3.0"},
    "update.put_back": {"version": "v1.3.0"},
    "update.stuck": {"version": "v1.3.0"},
    "update.unfinished": {},
    "strip.held": {"row": "The kitchen strip is staying off."},
    "printer.needs_you": {"headline": "The spool ran out", "name": "Workshop printer"},
    "rule.note": {"note": "The garage door has been open for ten minutes."},
}


def callers() -> str:
    return "\n".join(p.read_text() for p in HUB.glob("*.py") if p.name != "messages.py")


class CatalogTests(unittest.TestCase):
    def test_every_id_is_said_once(self):
        ids = [m.id for m in messages.TABLE]
        self.assertEqual(len(ids), len(set(ids)), [i for i in ids if ids.count(i) > 1])
        for i in ids: self.assertRegex(i, r"^[a-z]+\.[a-z_]+$")

    def test_there_are_four_classes_and_every_message_has_one(self):
        self.assertEqual(messages.CLASSES, ("receipt", "house", "attention", "alert"))
        for m in messages.TABLE: self.assertIn(m.cls, messages.CLASSES, m.id)

    def test_alert_ships_empty(self):
        """Alert-class is the household's list, not ours."""
        self.assertEqual([m.id for m in messages.TABLE if m.cls == "alert"], [])

    def test_every_template_is_filled_by_what_its_callers_pass(self):
        self.assertEqual(set(SAMPLES), set(messages.CATALOG))
        for m in messages.TABLE:
            holes = SAMPLES[m.id]
            for how in (None, *m.also):
                text = messages.say(m.id, how, **holes)
                self.assertNotIn("{", text, (m.id, how)); self.assertNotIn("}", text, (m.id, how))
                self.assertRegex(text, r"^[A-Z]", (m.id, how))
            for button in m.back:
                w = messages.way(m.id, button, "x", **holes)
                self.assertEqual(w["to"], "x")
                self.assertFalse(any("{" in str(v) for v in w.values()), (m.id, button))

    def test_every_message_has_a_caller_and_every_caller_names_a_message(self):
        """An id nobody says is a sentence the house never speaks; an id nobody wrote down is a KeyError on a screen."""
        src = callers()
        for mid in messages.CATALOG: self.assertIn(f'"{mid}"', src, mid)
        for mid in re.findall(r'\b(?:said|message|way|stream)\("([a-z_]+\.[a-z_]+)"', src):
            self.assertIn(mid, messages.CATALOG)

    def test_a_reason_somebody_else_wrote_becomes_a_sentence(self):
        self.assertEqual(messages.say("part.stopped", name="Matter", why="it crashed"), "Matter is not working. It crashed.")
        self.assertEqual(messages.say("part.stopped", name="Matter", why="Gone!"), "Matter is not working. Gone!")

    def test_a_name_mid_sentence(self):
        w = messages.way("bridge.quiet", "forget", "c1", name="The Hallway bridge")
        self.assertEqual(w["ask"], "Remove the Hallway bridge? Its switches stop appearing here; they keep working on the wall.")


class HealthCarriesItsIdTests(unittest.TestCase):
    def setUp(self):
        self.hub = FakeHub(); self.hub.provision = FakeProvision()
        with mock.patch.dict(os.environ, {"HUB_VERSION": "v1", "HUB_COMMIT": "a" * 40}): self.hub.updates = updates.Updates(self.hub)
        self.h = health.Health(self.hub)

    def notes(self, free=ROOMY):
        with mock.patch("hub.health.shutil.disk_usage", return_value=free): return self.h.notes()

    def test_an_offline_thing(self):
        self.hub.light.state = "unavailable"
        self.hub.log.last_by_subject = lambda kind, new: {"light.hall": time.time() - 2 * 86400}
        [n] = self.notes()
        self.assertEqual((n["id"], n["class"]), ("device.offline", "attention"))
        self.assertTrue(n["text"].startswith("Hall light has not answered since "))
        self.assertEqual(n["acts"][1], {"do": "It’s gone, remove it", "act": "forget", "to": "light.hall", "yes": "Yes, remove Hall light",
                                        "ask": "Remove Hall light from the house? It comes off the app or account it came from too."})

    def test_an_offline_thing_nobody_knows_since_when_is_the_same_message(self):
        self.hub.light.state = "unavailable"
        [n] = self.notes()
        self.assertEqual((n["id"], n["text"]), ("device.offline", "Hall light is not answering."))

    def test_faults_and_storage(self):
        self.hub.provision.parts = [{"id": "ring", "name": "Ring", "state": "sign-in", "text": ""},
                                    {"id": "zwave", "name": "Z-Wave radio", "state": "failed", "text": "the stick vanished"}]
        self.hub.provision.problems = [{"entry_id": "e1", "title": "Nest", "reason": "the key expired"}]
        self.hub.provision.sign_ins = [{"source": "reconfigure", "kind": "Nest", "title": "Home", "flow_id": "f1", "handler": "nest"}]
        notes = self.notes(DISK(100 * 1024 ** 3, 99 * 1024 ** 3, 1024 ** 3))
        self.assertEqual([(n["id"], n["class"], n["text"]) for n in notes], [
            ("account.check", "attention", "Nest needs a setting checked: Home."),
            ("part.signed_out", "attention", "Ring needs signing in again."),
            ("part.stopped", "attention", "Z-Wave radio is not working. The stick vanished."),
            ("entry.failed", "attention", "Nest could not connect: the key expired"),
            ("storage.low", "attention", "The hub's storage is nearly full: 1.0 GB left."),
        ])
        self.assertEqual(notes[0]["acts"], [{"do": "Check it", "act": "flow", "to": "f1"}])

    def test_a_bridge_gone_quiet(self):
        self.hub.bridge = FakeBridges([{"room": "Hallway", "chip": "c1", "missed": "Home2", "since": None}])
        [n] = self.notes()
        self.assertEqual((n["id"], n["class"]), ("bridge.quiet", "attention"))
        self.assertEqual(n["text"], "The Hallway bridge has not answered since the Wi‑Fi changed to Home2. Its switches still work on the wall — "
                                    "the hub just can’t see them. Plug it into the hub for a minute to set it right.")

    def test_an_update_that_did_not_finish(self):
        self.hub.updates.state = lambda: {"state": "failed", "finished": 5}
        [n] = self.notes()
        self.assertEqual((n["id"], n["class"], n["text"]), ("update.unfinished", "attention", "The last update did not finish. You can try it again from here."))
        self.assertEqual(n["acts"], [{"do": "Try again", "act": "update", "to": None}])


class RuleNoteTests(unittest.IsolatedAsyncioTestCase):
    async def test_a_rules_note_goes_down_the_stream_as_a_message(self):
        hub = FakeHub()
        use(hub, rule("say", then={"notify": "Someone is in the hall"}))
        hub.motion.state = "on"; hub.engine.on_state(hub.motion, "off")
        for _ in range(3): await asyncio.sleep(0)
        [m] = [json.loads(s) for s in hub.sent if json.loads(s).get("type") == "message"]
        self.assertEqual({k: v for k, v in m.items() if k != "at"},
                         {"type": "message", "id": "rule.note", "class": "house", "text": "Someone is in the hall", "subject": "say"})
        self.assertLess(abs(m["at"] - time.time()), 5)
        self.assertFalse([s for s in hub.sent if json.loads(s).get("type") == "notify"])


if __name__ == "__main__":
    unittest.main()
