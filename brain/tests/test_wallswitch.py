# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Setting a wall switch up after it joins, without a switch or a bridge (design/switch-setup/, C).

What these hold is what went wrong on 22 November and must not again: "Added." over a switch that
could not be used, and its own key handed to the screen and lost."""
import asyncio, json, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace

from hub import wallswitch as ws_mod
from hub.bridge import Bridges
from hub.settings import Settings
from hub.rules import validate
from hub.wallswitch import WallSwitches

NET = "ab" * 8


class FakeHA:
    """A broker with one puck on it. `answers` maps a command's verb to what the puck says back."""
    def __init__(self):
        self.cb, self.published, self.answers, self.registry = None, [], {}, []

    async def call(self, domain, service, target, **kw):
        self.published.append((kw.get("topic"), kw.get("payload")))
        verb = str(kw.get("payload", "")).split(" ")[0]
        chip = kw["topic"].split("/")[2] if kw.get("topic", "").startswith("mesh/bridge/") else None
        if chip and verb in self.answers and self.cb:
            said = self.answers[verb]
            leaf, body = said.pop(0) if isinstance(said, list) else said(kw["payload"]) if callable(said) else said
            self.cb({"topic": f"mesh/bridge/{chip}/{leaf}", "payload": json.dumps(body)})

    async def send(self, type_, **kw):
        return self.registry


class FakeRules:
    """The hub's routine engine (hub.engine), refusing what the real one refuses."""
    def __init__(self, hub):
        self.hub = hub
        self.raw = {"rules": [{"id": "welcome-home", "room": "entry", "when": {"presence": "somebody"},
                               "then": {"intent": "occupied"}}]}
    def as_data(self): return {**self.raw, "valid": True, "errors": []}
    def save(self, raw):
        _, errors = validate(raw, set(self.hub.home.rooms))
        if errors: raise ValueError("; ".join(errors))
        self.raw = raw


class FakeHub:
    def __init__(self, tmp):
        self.settings = Settings(Path(tmp) / "settings.json")
        self.settings.set(bridges={"c8ebba": {"since": 0}})
        self.ha, self.engine = FakeHA(), FakeRules(self)
        self.log = SimpleNamespace(add=lambda *a, **k: None)
        self.home = SimpleNamespace(devices={}, rooms={"hall": SimpleNamespace(name="Hallway")})
    def _broadcast(self, msg): pass


def run(coro): return asyncio.run(coro)


class Setting(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.hub = FakeHub(self.tmp.name)
        self.b = Bridges(self.hub, cable=SimpleNamespace())
        self.hub.ha.cb = self.b._on_mqtt
        self.b.pucks["c8ebba"] = {"online": True, "net": NET, "caps": "mesh setup"}
        self.ws = WallSwitches(self.hub, self.b)
        self.hub.wallswitch = self.ws
        self.waits = (ws_mod.CONFIG_WAIT, ws_mod.APPEAR_WAIT, ws_mod.LISTEN_WAIT)
        ws_mod.CONFIG_WAIT, ws_mod.APPEAR_WAIT, ws_mod.LISTEN_WAIT = 0.3, 0.2, 0.3

    def tearDown(self):
        ws_mod.CONFIG_WAIT, ws_mod.APPEAR_WAIT, ws_mod.LISTEN_WAIT = self.waits
        self.tmp.cleanup()

    def a_light(self, addr="0020", room="unassigned"):
        self.hub.ha.registry.append({"id": f"hw{addr}", "identifiers": [["mqtt", f"mesh_{NET}_{addr}"]]})
        dev = SimpleNamespace(id=f"light.switch_{addr}", name=f"Switch {addr}", hw=f"hw{addr}",
                              capability="light", room_id=room)
        self.hub.home.devices[dev.id] = dev
        return dev

    def joins(self, addr="0020"):
        self.hub.ha.answers["add"] = ("claimed", {"ok": True, "unicast": addr, "elements": 1, "devkey": "cd" * 16})


class JoiningIsNotTheEnd(Setting):
    def test_a_finished_switch_comes_back_with_its_light(self):
        self.joins(); self.a_light()
        self.hub.ha.answers["setup"] = ("configured", {"op": "setup", "addr": "0020", "ok": True})
        out = run(self.ws.let_in("aa" * 16))
        self.assertEqual(out["state"], "done")
        self.assertEqual(out["device_id"], "light.switch_0020")
        self.assertEqual(self.hub.ha.published[-1], ("mesh/bridge/c8ebba/config", f"setup 0020 {'cd' * 16}"))

    def test_its_own_key_is_kept_and_never_handed_to_the_screen(self):
        self.joins()
        out = run(self.ws.let_in("aa" * 16))          # the bridge never answers the setup
        self.assertEqual(self.ws.get("0020")["devkey"], "cd" * 16)
        self.assertNotIn("devkey", json.dumps(out))
        self.assertEqual(out["state"], "failed")
        self.assertTrue(out["retry"])

    def test_a_bridge_that_cannot_finish_never_says_added(self):
        self.joins()
        self.b.pucks["c8ebba"]["caps"] = "mesh"
        out = run(self.ws.let_in("aa" * 16))
        self.assertEqual(out["state"], "failed")
        self.assertIn("needs an update", out["text"])
        self.assertEqual(self.ws.get("0020")["devkey"], "cd" * 16)

    def test_an_answer_about_another_switch_is_not_this_ones(self):
        self.joins()
        self.hub.ha.answers["setup"] = ("configured", {"op": "setup", "addr": "0099", "ok": True})
        self.assertEqual(run(self.ws.let_in("aa" * 16))["state"], "failed")

    def test_the_blink_still_answering_is_not_taken_for_the_add(self):
        # Seen in a real house: That's the one was tapped while the blink was still being answered, the
        # blink's "ok" was taken as the add's, and the switch joined with its key thrown away.
        self.hub.ha.answers["setup"] = ("configured", {"op": "setup", "addr": "0024", "ok": True})
        say = lambda leaf, body: self.b._on_mqtt({"topic": f"mesh/bridge/c8ebba/{leaf}", "payload": json.dumps(body)})

        async def go():
            blink = asyncio.create_task(self.b.blink("aa" * 16, 1))
            await asyncio.sleep(0.05)
            add = asyncio.create_task(self.ws.let_in("aa" * 16))
            await asyncio.sleep(0.05)
            say("claimed", {"ok": True, "what": "blink"})
            await asyncio.sleep(0.05)
            say("claimed", {"ok": True, "unicast": "0024", "elements": 1, "devkey": "cd" * 16})
            return await blink, await add

        blinked, added = run(go())
        self.assertEqual(blinked["state"], "done")
        self.assertEqual(added["switch"], "0024")
        self.assertEqual(self.ws.get("0024")["devkey"], "cd" * 16)

    def test_a_join_that_names_no_address_is_not_finished(self):
        self.hub.ha.answers["add"] = ("claimed", {"ok": True, "elements": 1})
        out = run(self.ws.let_in("aa" * 16))
        self.assertEqual(out["state"], "failed")
        self.assertNotIn("hold a finger on it", out["text"])

    def test_without_its_key_the_house_says_how_to_start_over(self):
        out = run(self.ws.finish("0031"))
        self.assertEqual(out["state"], "failed")
        self.assertIn("hold a finger on it", out["text"])


class TheOtherSwitch(Setting):
    def test_the_one_without_a_light_is_told_its_partner(self):
        self.ws.remember("0020", light=True)
        self.ws.remember("0021", light=False)
        self.hub.ha.answers["pair"] = ("configured", {"op": "pair", "addr": "0021", "ok": True})
        out = run(self.ws.pair("0020", "0021"))
        self.assertEqual((out["companion"], out["main"]), ("0021", "0020"))
        self.assertEqual(self.hub.ha.published[-1][1], "pair 0021 0020")
        self.assertEqual(self.ws.get("0020")["partner"], "0021")

    def test_a_busy_bridge_is_waited_for_rather_than_passed_on(self):
        self.ws.remember("0020", light=True)
        self.ws.remember("0021", light=False)
        busy = {"op": "pair", "addr": "0021", "ok": False, "step": "busy", "why": "the bridge is already setting up a switch"}
        self.hub.ha.answers["pair"] = [("configured", busy), ("configured", {"op": "pair", "addr": "0021", "ok": True})]
        waited = ws_mod.BUSY_WAIT
        ws_mod.BUSY_WAIT = 0.01
        try: out = run(self.ws.pair("0020", "0021"))
        finally: ws_mod.BUSY_WAIT = waited
        self.assertEqual(out["state"], "done")
        self.assertEqual([m for _, m in self.hub.ha.published].count("pair 0021 0020"), 2)

    def test_a_press_somewhere_else_is_the_answer_and_a_retained_state_is_not(self):
        self.a_light("0021", room="hall")

        async def go():
            task = asyncio.create_task(self.ws.listen("0020"))
            await asyncio.sleep(0.02)
            self.b._on_mqtt({"topic": f"mesh/{NET}/0021/state", "payload": "ON", "retain": True})
            self.b._on_mqtt({"topic": f"mesh/{NET}/0020/state", "payload": "ON"})
            self.b._on_mqtt({"topic": f"mesh/{'cd' * 8}/0022/press", "payload": "1"})
            await asyncio.sleep(0.02)
            self.assertFalse(task.done())
            self.b._on_mqtt({"topic": f"mesh/{NET}/0021/press", "payload": "1"})
            return await task
        out = run(go())
        self.assertEqual(out["heard"]["switch"], "0021")
        self.assertEqual(out["heard"]["name"], "the switch in the hallway")

    def test_nobody_pressing_anything_is_said_plainly(self):
        self.assertEqual(run(self.ws.listen("0020")), {"heard": None})


class WalkingIn(Setting):
    def test_on_then_off_is_two_routines_beside_the_others(self):
        self.a_light(room="hall")
        run(self.ws.walkin("0020", "on_off"))
        ids = [r["id"] for r in self.hub.engine.raw["rules"]]
        self.assertEqual(ids, ["welcome-home", "switch-0020-walkin", "switch-0020-leave"])
        leave = self.hub.engine.raw["rules"][-1]
        self.assertEqual(leave["when"], {"idle": ws_mod.LEAVE_AFTER})
        self.assertEqual(leave["then"], {"device": "light.switch_0020", "action": "off"})

    def test_changing_it_replaces_rather_than_adds(self):
        self.a_light(room="hall")
        run(self.ws.walkin("0020", "on_off"))
        run(self.ws.walkin("0020", "nothing"))
        self.assertEqual([r["id"] for r in self.hub.engine.raw["rules"]], ["welcome-home"])
        self.assertEqual(self.ws.summary("0020")["walkin"], "nothing")

    def test_it_needs_a_room_to_know_where_walking_in_is(self):
        self.a_light()
        with self.assertRaises(ValueError):
            run(self.ws.walkin("0020", "on"))


class DimmingIsAChoice(Setting):
    def dims_ok(self): self.hub.ha.answers["dims"] = ("configured", {"op": "dims", "addr": "0020", "ok": True, "restart": True})

    def test_what_the_bulbs_can_do_is_kept_apart_from_what_the_switch_does(self):
        self.dims_ok()
        run(self.ws.dims("0020", True))
        run(self.ws.dims("0020", True, found=True))
        run(self.ws.dims("0020", False))
        s = self.ws.summary("0020")
        self.assertEqual((s["can_dim"], s["dims"]), (True, False))

    def test_the_test_answer_does_not_send_a_choice_already_sent(self):
        self.dims_ok()
        run(self.ws.dims("0020", True))
        sent = len(self.hub.ha.published)
        self.assertEqual(run(self.ws.dims("0020", True, found=True))["state"], "done")
        self.assertEqual(len(self.hub.ha.published), sent)

    def test_bulbs_that_cannot_dim_are_not_dimmed(self):
        self.dims_ok()
        run(self.ws.dims("0020", False, found=False))
        self.assertEqual(run(self.ws.dims("0020", True))["state"], "failed")
        self.assertFalse(self.ws.summary("0020")["dims"])

    def echo_dims(self):
        self.hub.ha.answers["dims"] = lambda cmd: ("configured", {"op": "dims", "addr": cmd.split()[1], "ok": True, "restart": True})
        self.hub.ha.answers["pair"] = lambda cmd: ("configured", {"op": "pair", "addr": cmd.split()[1], "ok": True})

    def sent(self): return [m for _, m in self.hub.ha.published if m.split()[0] in ("dims", "pair")]

    def test_the_other_end_of_a_pair_is_set_the_same_or_its_slider_does_nothing(self):
        self.echo_dims()
        self.ws.remember("0020", light=True, partner="0021"); self.ws.remember("0021", light=False, partner="0020")
        out = run(self.ws.dims("0020", True))
        self.assertEqual(out, {"state": "done", "restart": True})
        self.assertEqual(self.sent(), ["dims 0020 yes", "dims 0021 yes"])
        self.assertTrue(self.ws.get("0021")["dims"])
        run(self.ws.dims("0020", False))
        self.assertEqual(self.sent()[-1], "dims 0021 no")

    def test_before_the_dim_test_only_the_switch_with_the_light_is_told(self):
        self.echo_dims()
        self.ws.remember("0020", light=True, partner="0021"); self.ws.remember("0021", light=False, partner="0020")
        run(self.ws.dims("0020", True, alone=True))
        self.assertEqual(self.sent(), ["dims 0020 yes"])
        run(self.ws.dims("0020", True, found=True))
        self.assertEqual(self.sent(), ["dims 0020 yes", "dims 0021 yes"])

    def test_a_switch_paired_to_a_light_that_dims_is_set_to_dim_as_it_joins(self):
        self.echo_dims()
        self.ws.remember("0020", light=True, dims=True)
        self.ws.remember("0021", light=False)
        out = run(self.ws.pair("0020", "0021"))
        self.assertEqual((out["state"], out["restart"]), ("done", True))
        self.assertEqual(self.sent(), ["pair 0021 0020", "dims 0021 yes"])

    def test_an_on_and_off_light_leaves_its_new_partner_as_the_reset_left_it(self):
        self.echo_dims()
        self.ws.remember("0020", light=True, dims=False)
        self.ws.remember("0021", light=False)
        out = run(self.ws.pair("0020", "0021"))
        self.assertEqual((out["state"], out["restart"]), ("done", False))
        self.assertEqual(self.sent(), ["pair 0021 0020"])

    def test_a_light_finds_the_switch_behind_it(self):
        self.ws.remember("0020", finished=1)
        dev = self.a_light("0020")
        self.assertEqual(run(self.ws.of_device(dev.id)), "0020")
        self.assertIsNone(run(self.ws.of_device("light.somebody_else")))


class TryingItOnTheLight(Setting):
    def test_a_dim_goes_slowly_to_almost_off_and_back_twice_and_ends_full(self):
        async def go():
            await self.ws.show("0020", "dim")
            await self.ws._shows["0020"]
        was = asyncio.sleep

        async def quick(_s): await was(0)
        asyncio.sleep = quick
        try: run(go())
        finally: asyncio.sleep = was
        sent = [p for t, p in self.hub.ha.published if t == f"mesh/{NET}/0020/set"]
        way = [100, 75, 50, 30, 15, 6, 2, 6, 15, 30, 50, 75, 100]
        self.assertEqual(sent, [f"dim:{n}" for n in way + way[1:]])

    def test_the_restart_is_asked_for_after_dimming_is_chosen(self):
        self.hub.ha.answers["dims"] = ("configured", {"op": "dims", "addr": "0020", "ok": True, "restart": True})
        out = run(self.ws.dims("0020", True))
        self.assertEqual(out, {"state": "done", "restart": True})
        self.assertTrue(self.ws.get("0020")["dims"])


if __name__ == "__main__":
    unittest.main()
