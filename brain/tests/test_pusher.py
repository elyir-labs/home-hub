# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""What needs a look, told once to the phones that can act on it: pusher.py. No network: the sender is faked.

Run from brain/: .venv/bin/python -m unittest -v
"""
import asyncio, json, re, tempfile, unittest
from datetime import datetime
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives import serialization

from hub import provision, pusher
from hub.messages import said
from hub.phones import Phones
from tests.apptest import signing_key, subscription

CHICAGO = ZoneInfo("America/Chicago")


def at(hour, minute=0, day=19):
    return datetime(2026, 10, day, hour, minute, tzinfo=CHICAGO).timestamp()


def line(mid="storage.low", subject=None, **holes):
    return {"kind": "x", "subject": subject, **said(mid, **(holes or {"left": "1.2 GB"}))}


class FakeLog:
    def add(self, *a, **k): pass


class FakeHealth:
    def __init__(self): self.lines = []
    def notes(self): return list(self.lines)


class FakeHub:
    def __init__(self, data: Path):
        self.log, self.health, self.tz = FakeLog(), FakeHealth(), CHICAGO
        self.settings, self.sent = {"home_name": "Maple Street"}, []
        self.phones = Phones(self, data / "phones.json")
    def _broadcast(self, msg): self.sent.append(msg)


class Sender:
    """Stands where pywebpush stands: records each push and answers with what a test says for its endpoint."""
    def __init__(self): self.calls, self.answers = [], {}
    def __call__(self, sub, data, headers, ttl, key):
        self.calls.append({"to": sub["endpoint"], "payload": json.loads(data), "headers": headers, "ttl": ttl, "key": key})
        answer = self.answers.get(sub["endpoint"], 201)
        if isinstance(answer, Exception): raise answer
        return answer
    def to(self): return sorted(c["to"] for c in self.calls)


class PusherTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory(); self.addCleanup(self.dir.cleanup)
        self.data = Path(self.dir.name)
        self.hub = FakeHub(self.data)
        self.clock = [at(12)]
        self.sender = Sender()
        self.pusher = self.fresh()
        self.keys = {}
        self.owner = self.phone("Sam's iPhone", "code", "https://push.example/sam")
        self.setup = self.phone("The phone that set up the house", "setup", "https://push.example/setup")
        self.guest = self.phone("A guest", "wall", "https://push.example/guest")
        self.quiet_owner = self.phone("Old phone", "code", None)

    def fresh(self):
        return pusher.Pusher(self.hub, sender=self.sender, now=lambda: self.clock[0])

    def phone(self, name, how, endpoint, tz="America/Chicago"):
        p, _ = self.hub.phones._admit(name, "phone", how)
        if endpoint:
            self.keys[p["id"]] = signing_key()
            self.hub.phones.set_push(p["id"], {"subscription": subscription(endpoint), "vapid": self.keys[p["id"]], "tz": tz, "since": 0})
        return p

    async def look(self, *lines):
        self.hub.health.lines = list(lines)
        return await self.pusher.look()

    async def settle(self, *lines):
        """Two looks with the same lines, which is what it takes for a line to be sent."""
        return await self.look(*lines) + await self.look(*lines)

    async def test_the_first_look_sends_nothing_already_there(self):
        hall = line("device.offline", "light.hall", name="Hall", when="3:10 pm")
        self.assertEqual(await self.look(line(), hall), 0)
        self.assertEqual(await self.settle(line(), hall), 0)
        self.assertEqual(self.sender.calls, [])

    async def test_a_new_line_goes_once_to_each_phone_that_can_act_on_it(self):
        await self.look()
        self.assertEqual(await self.look(line()), 0)                                    # not on its first look
        self.assertEqual(await self.look(line()), 2)
        self.assertEqual(self.sender.to(), ["https://push.example/sam", "https://push.example/setup"])
        sent = next(c for c in self.sender.calls if c["to"].endswith("/sam"))
        self.assertEqual({k: v for k, v in sent["payload"].items() if k != "at"},
                         {"id": "storage.low", "class": "attention", "text": "The hub's storage is nearly full: 1.2 GB left.",
                          "subject": None, "house": "Maple Street", "tag": "Maple Street|storage.low|"})
        self.assertEqual(sent["payload"]["at"], self.clock[0])
        self.assertEqual(sent["headers"]["Urgency"], "normal")
        self.assertRegex(sent["headers"]["Topic"], re.compile(r"^[A-Za-z0-9_-]{1,32}$"))
        self.assertEqual(sent["ttl"], 12 * 3600)
        self.assertEqual(sent["key"], self.keys[self.owner["id"]]["privateKey"])       # signed with that phone's own key

    async def test_a_line_there_for_one_look_is_never_sent(self):
        await self.look()
        await self.look(line())
        self.assertEqual(await self.settle(), 0)
        self.assertEqual(self.sender.calls, [])
        await self.look(line())                                                         # back: one look again is still not enough
        self.assertEqual(self.sender.calls, [])

    async def test_the_same_line_again_sends_nothing(self):
        await self.look()
        await self.settle(line())
        self.sender.calls.clear()
        self.assertEqual(await self.settle(line(left="900 MB")), 0)     # the words may move; it is the same line
        self.assertEqual(self.sender.calls, [])

    async def test_a_line_that_goes_and_comes_back_is_news_again(self):
        await self.look()
        await self.settle(line())
        await self.look()
        self.sender.calls.clear()
        self.assertEqual(await self.settle(line()), 2)

    async def test_two_things_about_one_subject_are_two_lines(self):
        await self.look()
        hall = line("device.offline", "light.hall", name="Hall", when="3:10 pm")
        await self.settle(hall)
        self.assertEqual(await self.settle(hall, line("device.offline", "light.porch", name="Porch", when="3:12 pm")), 2)
        sent = {c["payload"]["subject"]: c for c in self.sender.calls}
        self.assertNotEqual(sent["light.hall"]["headers"]["Topic"], sent["light.porch"]["headers"]["Topic"])
        self.assertEqual(sent["light.porch"]["payload"]["tag"], "Maple Street|device.offline|light.porch")

    async def test_the_same_line_from_another_house_is_another_notification(self):
        await self.look()
        await self.settle(line())
        here = self.sender.calls[0]
        self.hub.settings["home_name"] = "The cabin"
        await self.settle()
        self.sender.calls.clear()
        await self.settle(line())
        there = self.sender.calls[0]
        self.assertNotEqual(here["payload"]["tag"], there["payload"]["tag"])
        self.assertNotEqual(here["headers"]["Topic"], there["headers"]["Topic"])

    async def test_only_attention_and_alert_leave_the_house(self):
        await self.look()
        self.assertEqual(await self.settle(line("rule.note", "rule-1", note="Bins tonight")), 0)
        alert = {"id": "door.unlocked", "class": "alert", "text": "The front door unlocked.", "subject": "lock.front"}
        self.assertEqual(await self.settle(alert), 2)
        self.assertEqual({c["headers"]["Urgency"] for c in self.sender.calls}, {"high"})

    async def test_a_subscription_the_push_service_threw_away_is_dropped(self):
        await self.look()
        self.sender.answers["https://push.example/sam"] = 410
        self.assertEqual(await self.settle(line()), 1)
        self.assertNotIn("push", self.hub.phones.get(self.owner["id"]))
        self.assertFalse(Phones(self.hub, self.hub.phones.path).get(self.owner["id"]).get("push"))
        self.sender.calls.clear()
        await self.settle(line(), line("hub.restarted_itself", when="3:10 am"))
        self.assertEqual(self.sender.to(), ["https://push.example/setup"])

    async def test_a_push_that_fails_is_quiet_and_nothing_else_breaks(self):
        await self.look()
        self.sender.answers["https://push.example/sam"] = OSError("no route")
        self.sender.answers["https://push.example/setup"] = 500
        with self.assertLogs("hub.pusher", "WARNING"):
            self.assertEqual(await self.settle(line()), 0)
        self.assertTrue(self.hub.phones.get(self.owner["id"])["push"])                # kept: it may answer next time

    async def test_a_look_that_cannot_read_the_house_raises_nothing(self):
        def broken(): raise RuntimeError("no house")
        self.hub.health.notes = broken
        with self.assertLogs("hub.pusher", "ERROR"):
            self.assertEqual(await self.pusher.look(), 0)

    # ---- overnight ----
    async def test_overnight_attention_waits_for_seven_where_the_phone_is(self):
        await self.look()
        self.clock[0] = at(23)
        self.assertEqual(await self.settle(line()), 0)
        self.clock[0] = at(3, day=20)
        self.assertEqual(await self.look(line()), 0)
        self.assertEqual(self.sender.calls, [])
        self.clock[0] = at(7, day=20)
        self.assertEqual(await self.look(line()), 2)
        self.assertEqual({c["ttl"] for c in self.sender.calls}, {(12 - 8) * 3600})    # the twelve hours run from 11 pm
        self.assertEqual(await self.look(line()), 0)                                   # and once is once

    async def test_a_phone_where_it_is_already_morning_is_told_now(self):
        await self.look()
        self.hub.phones.get(self.owner["id"])["push"]["tz"] = "Europe/London"         # 11 pm in Chicago is 5 am there
        self.clock[0] = at(23)
        await self.settle(line())
        self.assertEqual(self.sender.calls, [])
        self.clock[0] = at(2, day=20)                                                  # 8 am in London
        self.assertEqual(await self.look(line()), 1)
        self.assertEqual(self.sender.to(), ["https://push.example/sam"])

    async def test_a_phone_with_no_zone_keeps_the_houses_hours(self):
        await self.look()
        self.hub.phones.get(self.owner["id"])["push"]["tz"] = None
        self.clock[0] = at(22, 30)
        self.assertEqual(await self.settle(line()), 0)

    async def test_what_was_put_right_overnight_is_not_sent_in_the_morning(self):
        await self.look()
        self.clock[0] = at(23)
        await self.settle(line())
        await self.look()
        self.clock[0] = at(7, day=20)
        self.assertEqual(await self.look(), 0)
        self.assertEqual(self.sender.calls, [])

    async def test_an_alert_never_waits(self):
        await self.look()
        self.clock[0] = at(2)
        alert = {"id": "door.unlocked", "class": "alert", "text": "The front door unlocked.", "subject": "lock.front"}
        self.assertEqual(await self.settle(alert), 2)

    # ---- across a restart ----
    async def test_a_restart_does_not_send_it_again_and_keeps_what_waits(self):
        await self.look()
        await self.settle(line())
        self.clock[0] = at(23)
        await self.settle(line(), line("hub.restarted_itself", when="10:58 pm"))
        self.sender.calls.clear()
        self.pusher = self.fresh()
        self.assertEqual(await self.look(line(), line("hub.restarted_itself", when="10:58 pm")), 0)
        self.clock[0] = at(7, day=20)
        self.assertEqual(await self.look(line(), line("hub.restarted_itself", when="10:58 pm")), 2)
        self.assertEqual({c["payload"]["id"] for c in self.sender.calls}, {"hub.restarted_itself"})

    async def test_things_gone_for_a_moment_while_the_house_restarts_tell_nobody(self):
        await self.look()
        self.pusher = self.fresh()
        hall = line("device.offline", "light.hall", name="Hall", when="3:10 pm")
        self.assertEqual(await self.look(hall), 0)                                      # the first look after a restart
        self.assertEqual(await self.settle(), 0)
        self.assertEqual(self.sender.calls, [])

    async def test_a_restart_between_the_two_looks_sends_it_once(self):
        await self.look()
        await self.look(line())
        self.pusher = self.fresh()
        self.assertEqual(await self.look(line()), 2)
        self.pusher = self.fresh()
        self.assertEqual(await self.settle(line()), 0)
        self.assertEqual(len(self.sender.calls), 2)

    async def test_what_it_keeps_is_readable_by_the_hub_alone_and_written_only_on_a_change(self):
        await self.look(line())
        path = self.data / "pushed.json"
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        before = path.stat().st_mtime_ns
        with mock.patch.object(self.pusher, "_save") as save:
            await self.settle(line())
        save.assert_not_called()
        self.assertEqual(path.stat().st_mtime_ns, before)

    async def test_a_phone_removed_with_a_push_waiting_is_not_sent_it(self):
        await self.look()
        self.clock[0] = at(23)
        await self.settle(line())
        self.hub.phones.remove(self.owner["id"])
        self.clock[0] = at(7, day=20)
        await self.look(line())
        self.assertEqual(self.sender.to(), ["https://push.example/setup"])


class KeyTests(unittest.TestCase):
    def test_a_phones_key_and_its_public_half(self):
        k = signing_key()
        self.assertEqual(pusher.public_of(k["privateKey"]), k["publicKey"])

    def test_what_a_phone_sends_is_kept_as_its_record_keeps_it(self):
        k = signing_key()
        got = pusher.checked({"subscription": {**subscription(), "expirationTime": None, "extra": 1}, "vapid": k, "tz": "Europe/London"}, 5)
        self.assertEqual(got, {"subscription": subscription(), "vapid": k, "tz": "Europe/London", "since": 5})

    def test_a_padded_public_key_is_the_same_key(self):
        k = signing_key()
        self.assertEqual(pusher.checked({"subscription": subscription(), "vapid": {**k, "publicKey": k["publicKey"] + "="}}, 0)["tz"], None)

    def test_the_maker_signs_its_name_and_never_the_households(self):
        self.assertEqual(pusher.SUBJECT, "https://hub.elyir.com")


class SendTests(unittest.TestCase):
    """The real sender, with the network taken away at pywebpush's own door."""
    def test_it_signs_with_the_phones_key_and_the_makers_name(self):
        from pywebpush import WebPushException
        k = signing_key()
        seen = {}

        def fake(**kw):
            seen.update(kw)
            return mock.Mock(status_code=201)
        with mock.patch("pywebpush.webpush", fake):
            self.assertEqual(pusher.send(subscription(), "{}", {"Urgency": "normal"}, 60, k["privateKey"]), 201)
        self.assertEqual(seen["vapid_claims"], {"sub": "https://hub.elyir.com"})
        signed_by = seen["vapid_private_key"].public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        self.assertEqual(pusher.b64(signed_by), k["publicKey"])

        def gone(**kw): raise WebPushException("gone", response=mock.Mock(status_code=410))
        with mock.patch("pywebpush.webpush", gone):
            self.assertEqual(pusher.send(subscription(), "{}", {}, 60, k["privateKey"]), 410)

        def nothing(**kw): raise WebPushException("no answer")
        with mock.patch("pywebpush.webpush", nothing):
            self.assertEqual(pusher.send(subscription(), "{}", {}, 60, k["privateKey"]), 0)


class TickTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_drivers_half_minute_look_is_when_it_looks(self):
        hub = mock.Mock(driver="ready")
        hub.pusher.look = mock.AsyncMock()
        p = provision.Provision(hub)
        p.refresh = mock.AsyncMock()
        with mock.patch.object(provision.asyncio, "sleep", mock.AsyncMock(side_effect=asyncio.CancelledError)):
            with self.assertRaises(asyncio.CancelledError): await p.run()
        hub.pusher.look.assert_awaited_once()

    async def test_and_not_before_the_house_is_ready(self):
        hub = mock.Mock(driver="connecting")
        hub.pusher.look = mock.AsyncMock()
        p = provision.Provision(hub)
        with mock.patch.object(provision.asyncio, "sleep", mock.AsyncMock(side_effect=asyncio.CancelledError)):
            with self.assertRaises(asyncio.CancelledError): await p.run()
        hub.pusher.look.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
