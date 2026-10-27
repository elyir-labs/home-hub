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
from tests.apptest import apns_identity, signing_key, subscription

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


class FakeAddress:
    def __init__(self): self.label, self.key = "maple", "the-houses-relay-secret"
    def house(self): return self.label
    def secret(self): return self.key


class FakeHub:
    def __init__(self, data: Path):
        self.log, self.health, self.tz, self.address = FakeLog(), FakeHealth(), CHICAGO, FakeAddress()
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
                          "subject": None, "house": "Maple Street", "label": "maple", "tag": "Maple Street|storage.low|"})
        self.assertEqual(sent["payload"]["at"], self.clock[0])
        self.assertEqual(sent["headers"]["Urgency"], "normal")
        self.assertRegex(sent["headers"]["Topic"], re.compile(r"^[A-Za-z0-9_-]{1,32}$"))
        self.assertEqual(sent["ttl"], 12 * 3600)
        self.assertEqual(sent["key"], self.keys[self.owner["id"]]["privateKey"])       # signed with that phone's own key

    async def test_it_names_the_house_by_its_label_so_the_phone_can_use_its_own_name_for_it(self):
        await self.look()
        self.hub.address.label = None                                                   # a house with no address yet
        await self.settle(line())
        self.assertEqual({c["payload"]["label"] for c in self.sender.calls}, {None})
        self.assertEqual({c["payload"]["house"] for c in self.sender.calls}, {"Maple Street"})

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


class Sealed:
    """Stands where the sender Elyir runs stands: opens nothing, records what a house handed it, answers as told."""
    def __init__(self): self.calls, self.answers = [], []
    def __call__(self, body, secret):
        self.calls.append({"body": body, "secret": secret})
        answer = self.answers.pop(0) if self.answers else 200
        if isinstance(answer, Exception): raise answer
        return answer


class SealedTests(unittest.IsolatedAsyncioTestCase):
    """A phone in the store app: the same news, sealed to its own key and handed to the sender."""
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory(); self.addCleanup(self.dir.cleanup)
        self.hub = FakeHub(Path(self.dir.name))
        self.clock = [at(12)]
        self.web, self.sealed = Sender(), Sealed()
        self.pusher = pusher.Pusher(self.hub, sender=self.web, hand=self.sealed, now=lambda: self.clock[0])
        self.apns, self.private = apns_identity()
        self.app = self.hub.phones._admit("Sam's iPhone", "phone", "code")[0]
        self.hub.phones.set_push(self.app["id"], {"apns": self.apns, "tz": "America/Chicago", "since": 0})
        self.browser = self.hub.phones._admit("Robin's phone", "phone", "code")[0]
        self.hub.phones.set_push(self.browser["id"], {"subscription": subscription("https://push.example/robin"), "vapid": signing_key(), "tz": "America/Chicago", "since": 0})

    def open(self, sealed: str) -> dict:
        import base64, http_ece
        raw = lambda t: base64.urlsafe_b64decode(t + "=" * (-len(t) % 4))
        return json.loads(http_ece.decrypt(raw(sealed), private_key=self.private, auth_secret=raw(self.apns["auth"]), version="aes128gcm"))

    async def settle(self, *lines):
        self.hub.health.lines = list(lines)
        return await self.pusher.look() + await self.pusher.look()

    async def test_it_is_sealed_to_the_phones_key_and_handed_over_as_the_house(self):
        await self.pusher.look()
        self.assertEqual(await self.settle(line()), 2)
        self.assertEqual(self.web.to(), ["https://push.example/robin"])                 # the browser's way is unchanged
        [call] = self.sealed.calls
        self.assertEqual(call["secret"], "the-houses-relay-secret")
        body = call["body"]
        self.assertEqual(set(body), {"house", "token", "env", "sealed", "urgency", "collapse", "ttl"})
        self.assertEqual((body["house"], body["token"], body["env"], body["urgency"], body["ttl"]), ("maple", self.apns["token"], "sandbox", "normal", 12 * 3600))
        self.assertEqual(body["collapse"], self.web.calls[0]["headers"]["Topic"])
        self.assertEqual(len(body["collapse"]), 32)
        self.assertRegex(body["sealed"], r"^[A-Za-z0-9_-]+$")
        self.assertEqual(self.open(body["sealed"]), self.web.calls[0]["payload"])         # the very payload web push carries
        self.assertNotIn("storage", json.dumps({k: v for k, v in body.items() if k != "sealed"}))

    async def test_each_seal_is_new(self):
        a = pusher.seal('{"x": 1}', self.apns["p256dh"], self.apns["auth"])
        b = pusher.seal('{"x": 1}', self.apns["p256dh"], self.apns["auth"])
        self.assertNotEqual(a, b)
        self.assertEqual(self.open(a), {"x": 1})

    async def test_an_alert_is_high(self):
        await self.pusher.look()
        await self.settle({"id": "door.unlocked", "class": "alert", "text": "The front door unlocked.", "subject": "lock.front"})
        self.assertEqual(self.sealed.calls[0]["body"]["urgency"], "high")

    async def test_an_app_that_is_gone_is_dropped(self):
        await self.pusher.look()
        self.sealed.answers = [410]
        self.assertEqual(await self.settle(line()), 1)
        self.assertNotIn("push", self.hub.phones.get(self.app["id"]))
        self.assertTrue(self.hub.phones.get(self.browser["id"])["push"])

    async def test_slow_down_and_failures_are_tried_again_on_the_next_look_within_the_ttl(self):
        await self.pusher.look()
        self.sealed.answers = [429, 502, OSError("no route"), 0]
        self.assertEqual(await self.settle(line()), 1)                                   # the browser's
        for _ in range(3): self.assertEqual(await self.pusher.look(), 0)
        self.assertEqual(await self.pusher.look(), 1)
        self.assertEqual(len(self.sealed.calls), 5)
        self.assertEqual(await self.pusher.look(), 0)                                    # and once is once
        self.assertTrue(self.hub.phones.get(self.app["id"])["push"])
        self.assertLess(self.sealed.calls[-1]["body"]["ttl"], 12 * 3600 + 1)

    async def test_nothing_is_tried_after_the_ttl(self):
        await self.pusher.look()
        self.sealed.answers = [429]
        await self.settle(line())
        self.clock[0] += 12 * 3600
        self.assertEqual(await self.pusher.look(), 0)
        self.assertEqual(len(self.sealed.calls), 1)

    async def test_a_sender_with_no_key_yet_keeps_the_phone_and_says_so_once(self):
        await self.pusher.look()
        self.sealed.answers = [503, 503]
        with self.assertLogs("hub.pusher", "INFO") as said:
            await self.settle(line())
            self.hub.health.lines = [line(), line("hub.restarted_itself", when="3:10 am")]
            await self.pusher.look(); await self.pusher.look()
        self.assertEqual(len(self.sealed.calls), 2)                                      # not tried again
        self.assertEqual(sum("not set up" in m for m in said.output), 1)
        self.assertTrue(self.hub.phones.get(self.app["id"])["push"])

    async def test_a_relay_from_before_the_sender_is_not_asked_every_half_minute(self):
        await self.pusher.look()
        self.sealed.answers = [404, 404]
        await self.settle(line())
        self.hub.health.lines = [line(), line("hub.restarted_itself", when="3:10 am")]
        await self.pusher.look(); await self.pusher.look()
        self.assertEqual(len(self.sealed.calls), 2)                                      # one try each, not one per look
        self.assertTrue(self.hub.phones.get(self.app["id"])["push"])

    async def test_a_house_with_no_address_tells_the_app_nothing_and_keeps_it(self):
        await self.pusher.look()
        self.hub.address.key = None
        self.assertEqual(await self.settle(line()), 1)
        self.assertEqual(self.sealed.calls, [])
        self.assertTrue(self.hub.phones.get(self.app["id"])["push"])
        self.hub.address.key, self.hub.address.label = "the-houses-relay-secret", None
        await self.settle(line(), line("hub.restarted_itself", when="3:10 am"))
        self.assertEqual(self.sealed.calls, [])

    async def test_overnight_it_waits_like_any_phone(self):
        await self.pusher.look()
        self.clock[0] = at(23)
        await self.settle(line())
        self.assertEqual(self.sealed.calls, [])
        self.clock[0] = at(7, day=20)
        self.hub.health.lines = [line()]
        await self.pusher.look()
        self.assertEqual(len(self.sealed.calls), 1)


class HandTests(unittest.TestCase):
    """The real hand-over, with the network taken away at urllib's door."""
    def test_it_posts_to_the_makers_api_as_the_house(self):
        seen = {}

        class Answer:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def fake(req, timeout):
            seen.update(url=req.full_url, auth=req.get_header("Authorization"), body=json.loads(req.data), timeout=timeout)
            return Answer()
        with mock.patch.object(pusher.address, "API", "https://api.example"), mock.patch("urllib.request.urlopen", fake):
            self.assertEqual(pusher.hand({"house": "maple"}, "secret-1"), 200)
        self.assertEqual(seen, {"url": "https://api.example/push", "auth": "Bearer secret-1", "body": {"house": "maple"}, "timeout": 15})

        import io, urllib.error
        def gone(req, timeout): raise urllib.error.HTTPError(req.full_url, 410, "gone", {}, io.BytesIO(b"{}"))
        with mock.patch("urllib.request.urlopen", gone):
            self.assertEqual(pusher.hand({}, "s"), 410)
        def down(req, timeout): raise urllib.error.URLError("no route")
        with mock.patch("urllib.request.urlopen", down):
            self.assertEqual(pusher.hand({}, "s"), 0)


class KeyTests(unittest.TestCase):
    def test_what_the_store_app_sends_is_kept_as_its_record_keeps_it(self):
        apns, _ = apns_identity("production")
        got = pusher.checked({"apns": {**apns, "extra": 1, "auth": apns["auth"] + "=="}, "tz": "Europe/London", "subscription": subscription()}, 5)
        self.assertEqual(got, {"apns": apns, "tz": "Europe/London", "since": 5})

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
