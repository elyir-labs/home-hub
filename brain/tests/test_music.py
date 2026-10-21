# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Music in any room (hub/music.py, design/music/ A with C's sentences): the engine set up with nobody watching, the
speakers it reaches folded into the ones the house already has, and playing, joining and stopping by room.
Run from brain/: .venv/bin/python -m unittest -v"""
import unittest
from unittest import mock
from hub import music as music_mod
from hub.commands import Commands, NotUnderstood
from hub.model import Home
from hub.music import Music, MusicError, item_of
from hub.onboarding import Onboarding
from tests.test_commands import Catalog, Assistant
from tests.test_rules import FakeHub


def ent(eid, platform, unique_id, device_id=None, area_id=None):
    return {"entity_id": eid, "platform": platform, "unique_id": unique_id, "device_id": device_id, "area_id": area_id}


def st(eid, state, **attrs):
    return {"entity_id": eid, "state": state, "attributes": {"friendly_name": attrs.pop("name", eid), **attrs},
            "last_changed": "2026-10-20T19:00:00+00:00", "last_updated": "2026-10-20T19:00:00+00:00"}


# A Cast speaker in the living room and a Sonos in the kitchen, each reached by the engine as well; a speaker the
# driver layer only has through the engine (an AirPlay one) in the bedroom; and a TV the engine does not play on.
AREAS = [{"area_id": "living", "name": "Living room"}, {"area_id": "kitchen", "name": "Kitchen"}, {"area_id": "bedroom", "name": "Bedroom"}]
ENTITIES = [
    ent("media_player.bookshelf", "cast", "cast-uuid-1", area_id="living"),
    ent("media_player.bookshelf_2", "music_assistant", "cast-uuid-1"),
    ent("media_player.kitchen", "sonos", "RINCON_1", area_id="kitchen"),
    ent("media_player.kitchen_2", "music_assistant", "RINCON_1"),
    ent("media_player.bedroom_airplay", "music_assistant", "ap1122334455", area_id="bedroom"),
    ent("media_player.living_tv", "androidtv", "atv-1", area_id="living"),
]


def states(**over):
    base = {
        "media_player.bookshelf": st("media_player.bookshelf", "idle", name="Bookshelf speaker", volume_level=0.3),
        "media_player.bookshelf_2": st("media_player.bookshelf_2", "idle", name="Bookshelf speaker"),
        "media_player.kitchen": st("media_player.kitchen", "idle", name="Kitchen speaker"),
        "media_player.kitchen_2": st("media_player.kitchen_2", "idle", name="Kitchen speaker"),
        "media_player.bedroom_airplay": st("media_player.bedroom_airplay", "idle", name="Bedroom speaker"),
        "media_player.living_tv": st("media_player.living_tv", "off", name="Living room TV"),
    }
    base.update(over)
    return list(base.values())


class FakeHA:
    def __init__(self):
        self.calls, self.fail_join, self.sent = [], False, []
        self.responses = {}
    async def call(self, domain, service, eid, **data):
        if service == "join" and self.fail_join: raise RuntimeError("not compatible")
        self.calls.append((domain, service, eid, data))
    async def send(self, type, **kw):
        self.sent.append((type, kw))
        if type == "call_service": return {"response": self.responses.get(kw["service"], {})}
        return self.responses.get(type, [])


def house(**over):
    hub = FakeHub()
    hub.home = Home().build(AREAS, [], ENTITIES, states(**over))
    hub.env, hub.ha, hub.held = {}, FakeHA(), []
    hub.hold = lambda room: hub.held.append(room.id)
    hub.music = Music(hub); hub.music.state, hub.music.entry = "ready", "entry-music"
    return hub


RADIO = {"uri": "radiobrowser://radio/abc", "name": "Late-night jazz", "kind": "radio", "by": None, "art": None}


class Folding(unittest.TestCase):
    def test_the_engines_copy_of_a_speaker_is_not_a_second_speaker(self):
        h = house().home
        self.assertNotIn("media_player.bookshelf_2", h.devices)
        self.assertNotIn("media_player.kitchen_2", h.devices)
        self.assertEqual(h.players["media_player.bookshelf"], {"entity": "media_player.bookshelf_2", "kind": "cast"})
        self.assertEqual(h.players["media_player.kitchen"], {"entity": "media_player.kitchen_2", "kind": "sonos"})

    def test_a_speaker_only_the_engine_reaches_is_the_speaker(self):
        h = house().home
        self.assertIn("media_player.bedroom_airplay", h.devices)
        self.assertEqual(h.players["media_player.bedroom_airplay"]["entity"], "media_player.bedroom_airplay")
        self.assertTrue(h.devices["media_player.bedroom_airplay"].attrs["music"])

    def test_a_speaker_reached_through_the_driver_layer_is_matched_by_its_own_id(self):
        es = [ent("media_player.den", "cast", "cast-x", area_id="living"), ent("media_player.den_2", "music_assistant", "media_player.den")]
        self.assertEqual(Home.engine_players(es), {"media_player.den_2": "media_player.den"})

    def test_a_screen_the_engine_does_not_reach_cannot_start_music(self):
        h = house().home
        self.assertNotIn("media_player.living_tv", h.players)
        self.assertNotIn("music", h.devices["media_player.living_tv"].attrs)

    def test_while_the_engine_plays_the_card_shows_what_it_plays_and_falls_back_after(self):
        hub = house()
        h = hub.home
        h.apply_state("media_player.bookshelf_2", st("media_player.bookshelf_2", "playing", media_title="So What", media_artist="Miles Davis",
                                                    entity_picture="https://example.com/a.jpg", group_members=["media_player.bookshelf_2", "media_player.kitchen_2"]))
        d = h.devices["media_player.bookshelf"]
        self.assertEqual((d.state, d.attrs["media_title"], d.attrs["media_artist"]), ("playing", "So What", "Miles Davis"))
        self.assertEqual(d.attrs["together"], ["media_player.kitchen"])
        self.assertEqual(h.together["media_player.bookshelf"], ["media_player.bookshelf", "media_player.kitchen"])
        h.apply_state("media_player.bookshelf_2", st("media_player.bookshelf_2", "idle"))
        self.assertEqual(d.state, "idle")
        self.assertNotIn("media_title", d.attrs)
        self.assertNotIn("together", d.attrs)
        self.assertTrue(d.attrs["music"])

    def test_the_speakers_own_changes_still_reach_it(self):
        h = house().home
        d = h.apply_state("media_player.bookshelf", st("media_player.bookshelf", "playing", name="Bookshelf speaker", media_title="A podcast"))
        self.assertEqual((d.state, d.attrs["media_title"]), ("playing", "A podcast"))
        self.assertTrue(d.attrs["music"])


class Playing(unittest.IsolatedAsyncioTestCase):
    async def test_one_room_plays_on_its_speaker_through_the_engine(self):
        hub = house()
        out = await hub.music.play(RADIO, ["living"])
        self.assertEqual(hub.ha.calls, [("music_assistant", "play_media", "media_player.bookshelf_2",
                                         {"media_id": RADIO["uri"], "media_type": "radio", "enqueue": "replace"})])
        self.assertEqual(out["rooms"], ["living"])
        self.assertEqual(hub.held, ["living"])
        self.assertEqual(hub.music.again("living"), [RADIO])

    async def test_two_rooms_play_in_step_the_first_leading(self):
        hub = house()
        await hub.music.play(RADIO, ["kitchen", "living"])
        self.assertEqual(hub.ha.calls[0][2], "media_player.kitchen_2")
        self.assertEqual(hub.ha.calls[1], ("media_player", "join", "media_player.kitchen_2", {"group_members": ["media_player.bookshelf_2"]}))
        self.assertEqual(hub.music.again("living")[0]["uri"], RADIO["uri"])

    async def test_speakers_that_cannot_join_each_play_it(self):
        hub = house(); hub.ha.fail_join = True
        await hub.music.play(RADIO, ["living", "kitchen"])
        self.assertEqual([c[2] for c in hub.ha.calls], ["media_player.bookshelf_2", "media_player.kitchen_2"])

    async def test_a_room_with_no_speaker_says_so(self):
        hub = house()
        hub.home.rooms["garage"] = type(hub.home.rooms["living"])("garage", "Garage")
        with self.assertRaises(MusicError): await hub.music.play(RADIO, ["garage"])

    async def test_again_keeps_the_newest_and_no_repeats(self):
        hub = house()
        other = {**RADIO, "uri": "radiobrowser://radio/b", "name": "News"}
        await hub.music.play(RADIO, ["living"]); await hub.music.play(other, ["living"]); await hub.music.play(RADIO, ["living"])
        self.assertEqual([i["name"] for i in hub.music.again("living")], ["Late-night jazz", "News"])

    async def test_stopping_a_room_that_shares_takes_it_out_first(self):
        hub = house()
        hub.home.apply_state("media_player.kitchen_2", st("media_player.kitchen_2", "playing", media_title="x", group_members=["media_player.bookshelf_2", "media_player.kitchen_2"]))
        hub.home.apply_state("media_player.bookshelf_2", st("media_player.bookshelf_2", "playing", media_title="x", group_members=["media_player.bookshelf_2", "media_player.kitchen_2"]))
        stopped = await hub.music.stop(["kitchen"])
        self.assertEqual([d.id for d in stopped], ["media_player.kitchen"])
        self.assertEqual([c[1] for c in hub.ha.calls], ["unjoin", "media_stop"])

    async def test_joining_goes_to_the_leader(self):
        hub = house()
        for e in ("media_player.bookshelf_2", "media_player.kitchen_2"):
            hub.home.apply_state(e, st(e, "playing", media_title="x", group_members=["media_player.bookshelf_2", "media_player.kitchen_2"]))
        await hub.music.join("bedroom", "kitchen")
        self.assertEqual(hub.ha.calls, [("media_player", "join", "media_player.bookshelf_2", {"group_members": ["media_player.bedroom_airplay"]})])

    async def test_nothing_plays_before_the_engine_is_ready(self):
        hub = house(); hub.music.state, hub.music.entry = "absent", None
        with self.assertRaises(MusicError): await hub.music.play(RADIO, ["living"])

    async def test_finding_and_the_library_read_the_engine_answers(self):
        hub = house()
        hub.ha.responses["search"] = {"radio": [{"media_type": "radio", "uri": "radiobrowser://radio/z", "name": " Jazz FM ", "image": "https://x/i.png"}],
                                      "tracks": [{"media_type": "track", "uri": "library://track/1", "name": "Blue in Green", "artists": [{"name": "Miles Davis"}],
                                                  "image": "http://172.24.0.2:8095/imageproxy/abc"}]}
        found = await hub.music.find("jazz")
        self.assertEqual(found[0], {"uri": "radiobrowser://radio/z", "name": "Jazz FM", "kind": "radio", "by": None, "art": "https://x/i.png"})
        self.assertEqual((found[1]["by"], found[1]["art"]), ("Miles Davis", None))    # the engine's own address is not handed out
        self.assertEqual(hub.ha.sent[-1][1]["service_data"]["config_entry_id"], "entry-music")

    async def test_a_house_with_no_music_of_its_own_is_offered_none_of_the_engines_made_up_playlists(self):
        hub = house()
        hub.ha.responses["get_library"] = {"items": []}
        out = await hub.music.catalog("living")
        self.assertEqual((out["ready"], out["own"]), (True, []))

    async def test_resolving_prefers_what_the_house_has_played(self):
        hub = house()
        await hub.music.play(RADIO, ["living"])
        self.assertEqual(await hub.music.resolve("late-night jazz"), RADIO)
        self.assertEqual(await hub.music.resolve("late"), RADIO)
        hub.ha.responses["search"] = {"radio": [{"media_type": "radio", "uri": "r://1", "name": "BBC Radio 4"}, {"media_type": "radio", "uri": "r://2", "name": "Radio 4 Extra"}]}
        self.assertEqual((await hub.music.resolve("radio 4 extra"))["uri"], "r://2")


class Items(unittest.TestCase):
    def test_an_item_needs_a_name_a_kind_and_an_address(self):
        self.assertIsNone(item_of({"uri": "x://1", "name": "", "media_type": "radio"}))
        self.assertIsNone(item_of({"uri": "x://1", "name": "A", "media_type": "audiobook"}))
        self.assertEqual(item_of({"uri": "x://1", "name": "A", "media_type": "album", "image": {"path": "https://i/a.jpg"}})["art"], "https://i/a.jpg")


class SettingUp(unittest.IsolatedAsyncioTestCase):
    """Driven against the real engine and driver layer once (docs/music.md says how); these hold the shape of it."""

    def hub(self):
        hub = house(); hub.music.state, hub.music.entry = "absent", None
        hub.ha_url, hub.ha_token = "http://ha", "tok"
        return hub

    async def test_no_engine_answering_is_absent_and_nothing_else_is_tried(self):
        hub = self.hub()
        with mock.patch.object(Music, "_info", return_value=None), mock.patch.object(Music, "_sign_in") as sign_in:
            self.assertEqual(await hub.music.ensure(), "absent")
        sign_in.assert_not_called()

    async def test_the_first_time_makes_an_owner_nobody_types_for_and_keeps_it(self):
        hub = self.hub()
        with mock.patch.object(Music, "_post", return_value=(200, {"token": "session"})) as post:
            self.assertEqual(await hub.music._sign_in(), "session")
        path, body = post.call_args.args
        self.assertEqual((path, body["username"]), ("/setup", "hub"))
        self.assertGreaterEqual(len(body["password"]), 24)
        self.assertEqual(hub.settings.get("music_engine")["password"], body["password"])
        with mock.patch.object(Music, "_post", return_value=(200, {"token": "again"})) as post:
            self.assertEqual(await hub.music._sign_in(), "again")
        self.assertEqual(post.call_args.args[0], "/auth/login")

    async def test_an_engine_that_started_over_gets_a_new_owner(self):
        hub = self.hub(); hub.settings.set(music_engine={"username": "hub", "password": "old"})
        answers = [(403, {"success": False, "error": "Setup required"}), (200, {"token": "fresh"})]
        with mock.patch.object(Music, "_post", side_effect=lambda *a: answers.pop(0)) as post:
            self.assertEqual(await hub.music._sign_in(), "fresh")
        self.assertEqual([c.args[0] for c in post.call_args_list], ["/auth/login", "/setup"])
        self.assertNotEqual(hub.settings.get("music_engine")["password"], "old")

    async def test_only_radio_is_switched_on_never_a_music_service(self):
        hub = self.hub()
        seen = []
        async def engine(token, *cmds):
            seen.extend(cmds)
            return [[{"domain": "chromecast"}, {"domain": "party", "instance_id": "party"}, {"domain": "spotify", "instance_id": "spotify--x"}]] \
                if cmds[0][0] == "config/providers" else [{}]
        hub.music._engine = engine
        await hub.music._sources("t")
        self.assertEqual(seen, [("config/providers", {}), ("config/providers/remove", {"instance_id": "party"}),
                                ("config/providers/remove", {"instance_id": "spotify--x"}),
                                ("config/providers/setup", {"provider_domain": "radiobrowser"})])
        self.assertEqual(music_mod.SOURCES, ("radiobrowser",))

    async def test_the_driver_layers_browser_step_is_finished_through_its_own_callback(self):
        hub = self.hub()
        steps = [{"type": "form", "step_id": "user", "flow_id": "f"},
                 {"type": "external", "flow_id": "f", "url": "http://127.0.0.1:8095/login?return_url=https%3A%2F%2Fmy.home-assistant.io%2Fredirect%2Foauth%3Fstate%3DSTATE&device_name=x"},
                 {"type": "create_entry", "flow_id": "f", "result": {"entry_id": "e1"}}]
        posted, opened = [], []
        def ha(method, path, data=None):
            posted.append((method, path, data)); return steps.pop(0)
        hub.music._ha = ha
        with mock.patch("urllib.request.urlopen") as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = b""
            done = await hub.music._answer({"type": "form", "step_id": "user", "flow_id": "f"}, "session")
            opened.append(urlopen.call_args.args[0])
        self.assertEqual(done["type"], "create_entry")
        self.assertEqual(posted[0], ("POST", "/api/config/config_entries/flow/f", {"url": "http://127.0.0.1:8095"}))
        self.assertEqual(opened, ["http://ha/auth/external/callback?state=STATE&code=session"])

    async def test_or_given_a_key_when_it_asks_for_one(self):
        hub = self.hub()
        async def engine(token, *cmds): return ["long-lived"]
        hub.music._engine = engine
        posted = []
        hub.music._ha = lambda m, p, d=None: (posted.append(d), {"type": "create_entry", "flow_id": "f"})[1]
        await hub.music._answer({"type": "form", "step_id": "auth_manual", "flow_id": "f"}, "session")
        self.assertEqual(posted, [{"token": "long-lived"}])

    async def test_an_ignored_entry_is_not_the_engines_entry(self):
        hub = self.hub()
        hub.ha.responses["config_entries/flow/progress"] = []
        calls = []
        async def send(type, **kw):
            calls.append(type)
            if type == "config_entries/get": return [{"entry_id": "ign", "source": "ignore"}] if calls.count(type) == 1 else [{"entry_id": "e1", "source": "user"}]
            return []
        hub.ha.send = send
        async def answer(step, token): return {"type": "create_entry"}
        hub.music._answer = answer
        hub.music._ha = lambda *a, **k: {"type": "form", "step_id": "user", "flow_id": "f"}
        self.assertEqual(await hub.music._connect("t"), "e1")


class Words(unittest.IsolatedAsyncioTestCase):
    def hub(self):
        hub = house()
        hub.sounds, hub.assistant, hub.weather = Catalog(), Assistant(), None
        hub.acts = []
        async def act(dev, action, data=None, source="user", said=None): hub.acts.append((dev.id, action, dict(data or {})))
        hub.act = act
        hub.commands = Commands(hub)
        return hub

    async def test_play_a_thing_in_a_room(self):
        hub = self.hub(); hub.music.remember("living", RADIO)
        out = await hub.commands.say("play late-night jazz in the kitchen")
        self.assertEqual((out["kind"], out["text"]), ("done", "Late-night jazz, in the Kitchen."))
        self.assertEqual(hub.ha.calls[0][2], "media_player.kitchen_2")

    async def test_here_is_the_room_on_screen_and_everywhere_is_every_speaker(self):
        hub = self.hub(); hub.music.remember("living", RADIO)
        await hub.commands.say("play late-night jazz here", "bedroom")
        self.assertEqual(hub.ha.calls[0][2], "media_player.bedroom_airplay")
        hub.ha.calls.clear()
        await hub.commands.say("play late-night jazz everywhere")
        self.assertEqual(hub.ha.calls[0][1], "play_media")
        self.assertEqual(hub.ha.calls[1][1], "join")
        self.assertEqual(len(hub.ha.calls[1][3]["group_members"]), 2)

    async def test_naming_a_speaker_still_carries_on_rather_than_choosing(self):
        hub = self.hub()
        await hub.commands.say("play the bookshelf speaker")
        self.assertEqual(hub.acts, [("media_player.bookshelf", "play", {})])

    async def test_somewhere_with_no_speaker_and_nowhere_at_all(self):
        hub = self.hub(); hub.music.remember("living", RADIO)
        with self.assertRaises(NotUnderstood): await hub.commands.say("play late-night jazz")

    async def test_music_everywhere_takes_what_plays_here_to_every_room(self):
        hub = self.hub()
        hub.home.apply_state("media_player.bookshelf_2", st("media_player.bookshelf_2", "playing", media_title="So What"))
        out = await hub.commands.say("music everywhere", "living")
        self.assertEqual(out["text"], "So What, everywhere.")
        self.assertEqual([c[1] for c in hub.ha.calls], ["join", "join"])

    async def test_stop_the_music(self):
        hub = self.hub()
        hub.home.apply_state("media_player.kitchen_2", st("media_player.kitchen_2", "playing", media_title="x"))
        out = await hub.commands.say("stop the music", "kitchen")
        self.assertEqual(out["text"], "Music off.")
        self.assertEqual(hub.ha.calls, [("media_player", "media_stop", "media_player.kitchen_2", {})])

    async def test_every_music_sentence_offered_runs(self):
        hub = self.hub(); hub.music.remember("living", RADIO)
        hub.home.apply_state("media_player.bookshelf_2", st("media_player.bookshelf_2", "playing", media_title="x"))
        for here in (None, hub.home.rooms["living"]):
            offered = hub.commands._music_sentences(here)
            self.assertIn("play Late-night jazz everywhere", offered)
            for s in offered:
                fresh = self.hub(); fresh.music.remember("living", RADIO)
                fresh.home.apply_state("media_player.bookshelf_2", st("media_player.bookshelf_2", "playing", media_title="x"))
                with self.subTest(said=s, here=here and here.id):
                    self.assertIsNotNone(await fresh.commands._grammar(s, here))
        self.assertIn("play Late-night jazz in the kitchen", hub.commands.complete("play late", "living"))


class Hidden(unittest.IsolatedAsyncioTestCase):
    async def test_the_driver_layer_offering_the_engine_is_never_shown(self):
        hub = house()
        async def send(type, **kw):
            if type == "config_entries/flow/progress":
                return [{"flow_id": "a", "handler": "music_assistant", "context": {"source": "zeroconf"}},
                        {"flow_id": "b", "handler": "music_assistant", "context": {"source": "reauth"}},
                        {"flow_id": "c", "handler": "sonos", "context": {"source": "zeroconf"}}]
            if type == "manifest/get": return {"name": kw["integration"]}
            return {}
        hub.ha.send = send
        on = Onboarding(hub)
        on.strings = mock.AsyncMock(return_value={})
        self.assertEqual([r["handler"] for r in await on.discovered()], ["sonos"])
        self.assertEqual(await on.sign_ins(), [])
