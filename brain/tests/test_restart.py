# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Turning it off and on again: the ladder, the gate on it, and the two things it must never become.

Run from brain/: .venv/bin/python -m unittest -v
"""
import json, time, unittest
from unittest import mock

from hub import restart as restart_mod, updates as updates_mod
from hub.lock import needs_code
from hub.phones import COOKIE
from tests.apptest import ApiTest


class WhatItCosts(unittest.TestCase):
    def test_asking_is_open_and_doing_is_not(self):
        """A sheet that demanded the code before it would say what the button does is a sheet nobody reads."""
        self.assertFalse(needs_code("GET", "/restart"))
        self.assertTrue(needs_code("POST", "/restart"))


class AtTheWall(ApiTest):
    def setUp(self):
        super().setUp()
        self.code = self.lock_the_house()
        self.head = {"x-hub-code": self.code}
        # The wall: the screen that set the house up, and the one every test below taps unless it says otherwise.
        _, token = self.hub.phones.from_setup()
        self.client.cookies.set(COOKIE, token)
        self.went = mock.patch.object(restart_mod.Restart, "quit")   # nothing in a test raises SIGTERM at itself
        self.quit = self.went.start(); self.addCleanup(self.went.stop)


class Restarting(AtTheWall):

    # ---- the sheet ----
    def test_the_sheet_says_what_keeps_working_first(self):
        s = self.client.get("/restart").json()
        self.assertEqual(s["rung"], "hub")
        self.assertEqual(s["keeps"], "Lights and switches keep working.")
        self.assertIn("seconds", s["how_long"])
        self.assertIsNone(s["blocked"])
        self.assertTrue(s["may"])

    def test_what_stops_is_only_said_where_it_is_true(self):
        """A sentence true of some house is how a panel earns the reputation of exaggerating."""
        self.assertNotIn("Apple Home, Google Home and Alexa say “no response” until it's back.",
                         self.client.get("/restart").json()["stops"])
        self.hub.share.set(on=True)
        self.assertIn("Apple Home, Google Home and Alexa say “no response” until it's back.",
                      self.client.get("/restart").json()["stops"])

    def test_a_pairing_in_flight_is_named_before_it_is_lost(self):
        self.hub.pair.session = {"kind": "zigbee", "state": "listening", "text": "", "device": None, "needs": None, "until": None}
        self.assertIn("The house is waiting for a new device to pair; you'll need to start that again.",
                      self.client.get("/restart").json()["flight"])

    def test_a_deeper_rung_costs_more_and_says_so(self):
        s = self.client.get("/restart", params={"rung": "machine"}).json()
        self.assertEqual(s["yes"], "Power off and on")
        self.assertIn("Everything the hub talks to goes quiet until it's back — lights, sensors and the radios.", s["stops"])

    # ---- the doing ----
    def test_the_hub_rung_goes_by_itself_and_needs_no_host(self):
        r = self.client.post("/restart", json={"rung": "hub"}, headers=self.head)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["rung"], "hub")
        self.quit.assert_called_once()
        self.assertFalse(restart_mod.REQUEST.exists())         # nothing was asked of the host
        self.assertEqual(json.loads(restart_mod.STATE.read_text())["rung"], "hub")

    def test_a_deeper_rung_asks_the_host_for_a_word_and_never_a_command(self):
        r = self.client.post("/restart", json={"rung": "everything"}, headers=self.head)
        self.assertEqual(r.status_code, 200)
        self.quit.assert_not_called()
        asked = json.loads(restart_mod.REQUEST.read_text())
        self.assertEqual(asked["rung"], "everything")
        self.assertEqual(set(asked) - {"at"}, {"rung"})         # a rung, and nothing else to act on

    def test_a_rung_the_hub_does_not_know_is_refused(self):
        r = self.client.post("/restart", json={"rung": "; reboot"}, headers=self.head)
        self.assertEqual(r.status_code, 409)
        self.assertFalse(restart_mod.REQUEST.exists())

    def test_who_asked_is_written_down(self):
        self.client.post("/restart", json={"rung": "hub"}, headers=self.head)
        e = self.hub.log.recent(limit=5, subject="restart")[0]
        self.assertEqual((e["old"], e["new"], e["source"]), ("hub", "asked", "user"))
        self.assertEqual(json.loads(e["detail"])["who"], "Wall screen")   # the phone row names itself; "the wall" is only the fallback

    # ---- and what it must not become ----
    def test_it_will_not_happen_during_an_update(self):
        """The panel hides the button too; this is what answers a phone whose page is an hour old."""
        updates_mod.STATE.write_text(json.dumps({"state": "running"}))
        self.assertIn("installing an update", self.client.get("/restart").json()["blocked"])
        r = self.client.post("/restart", json={"rung": "hub"}, headers=self.head)
        self.assertEqual(r.status_code, 409)
        self.quit.assert_not_called()

    def test_one_at_a_time(self):
        self.client.post("/restart", json={"rung": "hub"}, headers=self.head)
        r = self.client.post("/restart", json={"rung": "hub"}, headers=self.head)
        self.assertEqual(r.status_code, 409)
        self.assertIn("already restarting", r.json()["detail"])
        self.quit.assert_called_once()

    def test_a_restart_that_never_came_back_stops_standing_in_the_way(self):
        """The alternative is a house that can never be restarted again."""
        restart_mod.STATE.write_text(json.dumps({"rung": "hub", "at": time.time() - restart_mod.IN_FLIGHT - 1}))
        self.assertEqual(self.client.post("/restart", json={"rung": "hub"}, headers=self.head).status_code, 200)

    def test_it_still_needs_the_code(self):
        self.assertEqual(self.client.post("/restart", json={"rung": "hub"}).status_code, 401)
        self.quit.assert_not_called()

    def test_a_phone_let_in_at_the_wall_holds_the_code_and_still_cannot(self):
        """The code is one secret the whole house shares. A guest runs the house; it does not take it down."""
        ask = self.client.post("/phones/ask", json={"name": "Guest"}).json()
        self.hub.phones.from_setup()
        self.hub.phones.allow(ask["id"], "day")
        _, _, token = self.hub.phones.claim(ask["id"])
        self.client.cookies.set(COOKIE, token)
        self.assertFalse(self.client.get("/restart").json()["may"])      # and the sheet says so rather than lying
        r = self.client.post("/restart", json={"rung": "hub"}, headers=self.head)
        self.assertEqual(r.status_code, 403)
        self.quit.assert_not_called()

    def test_a_hub_with_no_code_locks_nothing(self):
        self.hub.lock.set("")
        self.client.cookies.clear()
        self.assertEqual(self.client.post("/restart", json={"rung": "hub"}).status_code, 200)

    # ---- the ladder revealing itself ----
    def test_after_three_in_an_hour_the_same_rung_stops_being_the_answer(self):
        for _ in range(3): self.hub.log.add("home", "restart", "hub", "asked", source="user")
        s = self.client.get("/restart", params={"rung": "hub"}).json()
        self.assertEqual(s["harder"], "everything")
        self.assertIn("restarting isn't fixing", s["weary"])

    def test_coming_back_learns_how_long_this_hub_actually_takes(self):
        """A hub on a tired card that takes ninety seconds should say ninety seconds, not the figure
        that was true on the maker's desk."""
        restart_mod.STATE.write_text(json.dumps({"rung": "hub", "at": time.time() - 92, "who": "the wall"}))
        again = restart_mod.Restart(self.hub)
        self.assertEqual(again.seconds("hub"), 92)
        self.assertEqual(again.ask("hub")["how_long"], "about 2 minutes")
        self.assertFalse(restart_mod.STATE.exists())            # read once, and not counted twice
        e = self.hub.log.recent(limit=5, subject="restart")[0]
        self.assertEqual((e["old"], e["new"]), ("hub", "back"))

    def test_a_hub_that_was_pulled_out_of_the_wall_learns_nothing(self):
        """It did not restart. It stopped, and there is nothing on the floor to read."""
        self.assertEqual(restart_mod.Restart(self.hub).seconds("hub"), restart_mod.USUALLY["hub"])


class FromAway(Restarting):
    """The rung that can strand somebody. Allowed, because the household that most needs it is the one
    furthest from the socket -- and told, because nobody is there to reach the plug."""
    def setUp(self):
        super().setUp()
        p = self.hub.phones.data[0]
        p["remote"] = True                                    # somebody at the wall let this phone out
        self.hub.phones._save()
        self.away = {**self.head, "x-hub-via": "relay"}

    def test_the_machine_asks_once_more_and_then_allows_it(self):
        r = self.client.post("/restart", json={"rung": "machine"}, headers=self.away)
        self.assertEqual(r.status_code, 409)
        self.assertIn("Nobody is home to unplug it", r.json()["detail"])
        self.assertFalse(restart_mod.REQUEST.exists())
        r = self.client.post("/restart", json={"rung": "machine", "understood": True}, headers=self.away)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(json.loads(restart_mod.REQUEST.read_text())["rung"], "machine")

    def test_the_shallower_rungs_are_not_nagged_about(self):
        self.assertEqual(self.client.post("/restart", json={"rung": "hub"}, headers=self.away).status_code, 200)

    def test_an_away_phone_is_told_it_loses_the_house(self):
        self.assertIn("This phone loses the house until it's back.",
                      self.client.get("/restart", headers={"x-hub-via": "relay"}).json()["stops"])


class BackAtTheDoor(AtTheWall):
    """design/restart/, A: somebody back at Restart within half an hour is saying the last one did not help."""
    def aged(self, seconds):
        self.hub.log.db.execute("UPDATE events SET ts = ts - ? WHERE subject = 'restart'", (seconds,))
        self.hub.log.db.commit()

    def test_the_door_offers_the_smallest_when_nothing_was_tried(self):
        s = self.client.get("/restart").json()
        self.assertEqual((s["rung"], s["again"], s["smaller"]), ("hub", None, None))

    def test_a_quick_restart_that_did_not_help_offers_the_full_one_first(self):
        self.client.post("/restart", json={"rung": "hub"}, headers=self.head)
        self.aged(600)
        s = self.client.get("/restart").json()
        self.assertEqual(s["rung"], "everything")
        self.assertEqual(s["yes"], "Full restart")
        self.assertEqual(s["smaller"], {"rung": "hub", "yes": "Quick restart again"})
        self.assertTrue(s["again"].startswith("You restarted the hub 10 minutes ago."))

    def test_a_full_restart_that_did_not_help_offers_the_machine(self):
        self.hub.log.add("home", "restart", "everything", "asked", source="user")
        s = self.client.get("/restart").json()
        self.assertEqual((s["rung"], s["yes"]), ("machine", "Power off and on"))
        self.assertEqual(s["smaller"]["yes"], "Full restart again")
        self.assertIn("powering it off and on starts it fresh", s["again"])

    def test_the_machine_is_the_last_rung(self):
        self.hub.log.add("home", "restart", "machine", "asked", source="user")
        s = self.client.get("/restart").json()
        self.assertEqual((s["rung"], s["smaller"]), ("machine", None))

    def test_half_an_hour_on_it_is_a_new_problem(self):
        self.hub.log.add("home", "restart", "everything", "asked", source="user")
        self.aged(restart_mod.SOON + 1)
        self.assertEqual(self.client.get("/restart").json()["rung"], "hub")

    def test_the_hubs_own_restarts_are_not_somebody_coming_back(self):
        self.hub.log.add("home", "restart", "everything", "asked", source="watchdog")
        self.hub.log.add("home", "restart", "machine", "asked", source="hub")
        self.assertEqual(self.client.get("/restart").json()["rung"], "hub")

    def test_a_named_rung_is_that_rung(self):
        """The ghost buttons and Needs a look name theirs; only the door is the hub's to pick."""
        self.hub.log.add("home", "restart", "everything", "asked", source="user")
        s = self.client.get("/restart", params={"rung": "hub"}).json()
        self.assertEqual((s["rung"], s["again"]), ("hub", None))


class Owed(AtTheWall):
    """design/restart/, in every direction: a change waiting for a boot is said on the Restart row, and done
    at night if nobody does it."""
    def setUp(self):
        super().setUp()
        self.addCleanup(lambda: restart_mod.OWED.unlink(missing_ok=True))

    def owe(self, why):
        restart_mod.OWED.write_text(json.dumps({"why": why}))

    def test_nothing_owed_says_nothing(self):
        self.assertIsNone(self.client.get("/restart").json()["owed"])

    def test_an_update_waiting_for_a_boot_says_so_and_when_it_will_happen(self):
        self.owe("update")
        with mock.patch.object(updates_mod.Updates, "auto", new_callable=mock.PropertyMock, return_value=True):
            o = self.client.get("/restart").json()["owed"]
        self.assertEqual(o["text"], "The hub needs to restart to finish an update.")
        self.assertIn("It powers off and on, which takes about 3 minutes.", o["more"])
        self.assertRegex(o["more"], r"tonight at [2-4]:\d\d AM\.$")

    def test_a_hub_that_does_nothing_unasked_does_not_promise_tonight(self):
        self.owe("change")
        with mock.patch.object(updates_mod.Updates, "auto", new_callable=mock.PropertyMock, return_value=False):
            o = self.hub.restart.owed()
        self.assertEqual(o["text"], "The hub needs to restart to finish a change to how it's set up.")
        self.assertNotIn("tonight", o["more"])

    def test_what_the_host_wrote_is_never_shown_as_written(self):
        self.owe("<b>anything</b>")
        self.assertIsNone(self.hub.restart.owed())
        restart_mod.OWED.write_text("not json")
        self.assertIsNone(self.hub.restart.owed())

    def night(self, auto=True, quiet=True):
        a = mock.patch.object(updates_mod.Updates, "auto", new_callable=mock.PropertyMock, return_value=auto)
        q = mock.patch.object(updates_mod.Updates, "quiet_hours", return_value=quiet)
        d = mock.patch.object(updates_mod.Updates, "due", return_value=False)
        for p in (a, q, d): p.start(); self.addCleanup(p.stop)

    def test_at_night_with_nobody_up_it_powers_off_and_on(self):
        self.owe("update"); self.night()
        self.assertTrue(self.hub.restart.tick())
        self.assertEqual(json.loads(restart_mod.REQUEST.read_text())["rung"], "machine")
        e = self.hub.log.recent(limit=1, subject="restart")[0]
        self.assertEqual((e["old"], e["new"], e["source"]), ("machine", "asked", "hub"))

    def test_once_a_night_so_a_change_that_does_not_clear_cannot_loop(self):
        self.owe("update"); self.night()
        self.assertTrue(self.hub.restart.tick())
        restart_mod.REQUEST.unlink(); restart_mod.STATE.unlink()
        self.assertFalse(self.hub.restart.tick())

    def test_not_in_the_day_not_with_nothing_owed_and_not_when_told_not_to(self):
        self.night(quiet=False); self.owe("update")
        self.assertFalse(self.hub.restart.tick())
        restart_mod.OWED.unlink()
        self.night()
        self.assertFalse(self.hub.restart.tick())
        self.owe("update"); self.night(auto=False)
        self.assertFalse(self.hub.restart.tick())
        self.assertFalse(restart_mod.REQUEST.exists())

    def test_a_hub_restart_the_house_did_not_ask_for_is_not_a_reason_to_go_deeper(self):
        self.owe("update"); self.night()
        self.hub.restart.tick()
        restart_mod.STATE.unlink()
        self.assertEqual(self.client.get("/restart").json()["rung"], "hub")


class ForWorkingOnTheHub(AtTheWall):
    """design/restart/, C: the developer page says how long the hub has been up and who restarted it last."""
    def test_the_last_restart_and_who_asked(self):
        self.client.post("/restart", json={"rung": "everything"}, headers=self.head)
        last = self.client.get("/developer").json()["restart"]["last"]
        self.assertEqual((last["rung"], last["source"], last["who"]), ("everything", "user", "Wall screen"))
