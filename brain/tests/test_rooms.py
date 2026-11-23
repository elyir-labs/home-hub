# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Renaming a room and taking one away (design/room-edit/, A).

These pin what removing does to everything the room held, in the order the module says, and that Bring it
back undoes all of it. The routines tests matter most: rules.json is checked whole, so a routine left naming
a room that is gone stops every later change to every routine from saving.

Run from brain/: .venv/bin/python -m unittest -v tests.test_rooms
"""
import json

from hub import rooms
from hub import rules as rules_mod
from tests.apptest import ApiTest


def rule(id, room, **kw):
    return {"id": id, "name": kw.pop("name", id), "room": room, "when": {"time": "07:00"}, "then": {"intent": "occupied"}, **kw}


class Routines(ApiTest):
    def test_a_routine_that_lights_only_the_room_goes_with_it(self):
        raw, going, trimmed = rooms.routines_without({"rules": [rule("a", "kitchen"), rule("b", "living")]}, "kitchen")
        self.assertEqual([r["id"] for r in raw["rules"]], ["b"])
        self.assertEqual([g["rule"]["id"] for g in going], ["a"])
        self.assertEqual(trimmed, [])

    def test_a_routine_that_names_it_among_others_just_loses_it(self):
        raw, going, trimmed = rooms.routines_without({"rules": [rule("a", ["kitchen", "living"])]}, "kitchen")
        self.assertEqual(raw["rules"][0]["room"], ["living"])
        self.assertEqual((going, [t["rule"]["room"] for t in trimmed]), ([], [["kitchen", "living"]]))

    def test_a_routine_waiting_on_the_room_being_quiet_goes_too_unless_another_room_is_named(self):
        only = rule("a", "living", **{"if": [["quiet", "kitchen", "above", 600]]})
        some = rule("b", "living", **{"if": [["quiet", ["kitchen", "front"], "above", 600]]})
        raw, going, _ = rooms.routines_without({"rules": [only, some]}, "kitchen")
        self.assertEqual([g["rule"]["id"] for g in going], ["a"])
        self.assertEqual(raw["rules"][0]["if"], [["quiet", ["front"], "above", 600]])

    def test_home_and_the_entrance_are_not_rooms_and_are_left_alone(self):
        raw, going, trimmed = rooms.routines_without({"rules": [rule("a", "home"), rule("b", "entry")]}, "kitchen")
        self.assertEqual((len(raw["rules"]), going, trimmed), (2, [], []))


class Renaming(ApiTest):
    def test_the_room_takes_its_new_name_and_every_panel_is_told(self):
        r = self.client.post("/rooms/kitchen/rename", json={"name": "Back kitchen"})
        self.assertEqual(r.json(), {"id": "kitchen", "name": "Back kitchen"})
        self.assertIn(("config/area_registry/update", {"area_id": "kitchen", "name": "Back kitchen"}), self.ha.sent)
        self.assertEqual(self.hub.home.rooms["kitchen"].name, "Back kitchen")
        self.assertTrue(self.sent("home"))

    def test_a_name_the_house_already_has_is_refused_in_words(self):
        r = self.client.post("/rooms/kitchen/rename", json={"name": "living ROOM"})
        self.assertEqual((r.status_code, r.json()["detail"]), (409, "There’s already a Living room."))

    def test_an_empty_name_is_refused(self):
        self.assertEqual(self.client.post("/rooms/kitchen/rename", json={"name": "  "}).status_code, 400)

    def test_new_devices_is_not_a_room(self):
        self.assertEqual(self.client.post("/rooms/unassigned/rename", json={"name": "Junk"}).status_code, 404)
        self.assertEqual(self.client.delete("/rooms/unassigned").status_code, 404)


class Removing(ApiTest):
    def setUp(self):
        super().setUp()
        rules_mod.RULES_PATH.write_text(json.dumps({"rules": [rule("morning", "kitchen", name="Morning kitchen"),
                                                    rule("both", ["kitchen", "living"], name="Both"),
                                                    rule("tv", "living", name="TV time")]}))
        self.hub.engine.load(force=True)
        self.screen, _ = self.hub.phones.with_code("A screen", "screen")
        self.hub.phones.place(self.screen["id"], "kitchen", "Kitchen")
        self.hub.set_entry(["kitchen", "front"])

    def moves(self):
        return [(t, kw) for t, kw in self.ha.sent if t in ("config/device_registry/update", "config/entity_registry/update")]

    def test_the_question_says_what_follows(self):
        f = self.client.get("/rooms/kitchen/removing").json()
        self.assertEqual((f["name"], f["things"]), ("Kitchen", 4))
        self.assertEqual(f["screens"], ["Kitchen screen"])
        self.assertEqual((f["routines_going"], f["routines_trimmed"]), (["Morning kitchen"], ["Both"]))

    def test_its_things_move_to_the_room_chosen_before_the_room_goes(self):
        r = self.client.delete("/rooms/kitchen", params={"to": "living"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()["things"], r.json()["to_name"]), (4, "Living room"))
        hw = sorted(kw["device_id"] for t, kw in self.moves() if t == "config/device_registry/update" and kw["area_id"] == "living")
        self.assertEqual(hw, ["hw-kettle", "hw-kitchen", "hw-motion", "hw-temp"])
        types = [t for t, _ in self.ha.sent]
        self.assertLess(types.index("config/device_registry/update"), types.index("config/area_registry/delete"))
        self.assertNotIn("kitchen", self.hub.home.rooms)

    def test_left_to_place_later_they_wait_in_new_devices(self):
        self.client.delete("/rooms/kitchen")
        self.assertTrue(self.moves())
        self.assertTrue(all(kw["area_id"] is None for _, kw in self.moves()))

    def test_a_part_with_a_room_of_its_own_moves_alone(self):
        self.hub.home.devices["light.kitchen"].own_room = True
        self.client.delete("/rooms/kitchen", params={"to": "living"})
        self.assertIn(("config/entity_registry/update", {"entity_id": "light.kitchen", "area_id": "living"}), self.moves())
        self.assertNotIn("hw-kitchen", [kw.get("device_id") for _, kw in self.moves()])

    def test_the_screen_opens_on_the_room_the_things_went_to(self):
        self.client.delete("/rooms/kitchen", params={"to": "living"})
        p = self.hub.phones.get(self.screen["id"])
        self.assertEqual((p["room"], p["name"]), ("living", "Living room screen"))

    def test_the_routines_stay_saveable_and_keep_running(self):
        self.client.delete("/rooms/kitchen", params={"to": "living"})
        data = self.client.get("/rules").json()
        self.assertTrue(data["valid"], data["errors"])
        self.assertEqual([r["id"] for r in data["rules"]], ["both", "tv"])
        self.assertEqual(data["rules"][0]["room"], ["living"])
        self.assertEqual(self.client.post("/rules/tv/enable", json={"enabled": False}).status_code, 200)

    def test_it_leaves_the_entrances(self):
        self.client.delete("/rooms/kitchen", params={"to": "living"})
        self.assertEqual(self.hub.entry, ["front"])

    def test_its_things_cannot_go_to_the_room_being_removed(self):
        self.assertEqual(self.client.delete("/rooms/kitchen", params={"to": "kitchen"}).status_code, 400)
        self.assertEqual(self.client.delete("/rooms/kitchen", params={"to": "attic"}).status_code, 404)
        self.assertFalse(self.moves())

    def test_what_happened_says_it_in_words(self):
        self.client.delete("/rooms/kitchen", params={"to": "living"})
        rows = [r for r in self.hub.log.recent(10) if r["subject"] == "room-removed"]
        self.assertEqual(self.hub.changes.sentence(rows[0]), "removed the Kitchen, and moved what was in it to the Living room.")


class BringingItBack(Removing):
    def remove_then_back(self):
        self.client.delete("/rooms/kitchen", params={"to": "living"})
        self.ha.sent.clear()
        return self.client.post("/rooms/kitchen/back")

    def test_the_room_comes_back_under_its_old_name_with_its_things(self):
        r = self.remove_then_back()
        self.assertEqual(r.json(), {"ok": True, "id": "kitchen", "name": "Kitchen"})
        self.assertIn(("config/area_registry/create", {"name": "Kitchen"}), self.ha.sent)
        back = sorted(kw["device_id"] for t, kw in self.moves() if kw.get("area_id") == "kitchen")
        self.assertEqual(back, ["hw-kettle", "hw-kitchen", "hw-motion", "hw-temp"])

    def test_its_screen_routines_and_entrance_come_back(self):
        self.remove_then_back()
        p = self.hub.phones.get(self.screen["id"])
        self.assertEqual((p["room"], p["name"]), ("kitchen", "Kitchen screen"))
        data = self.client.get("/rules").json()
        self.assertTrue(data["valid"], data["errors"])
        self.assertEqual([(r["id"], r["room"]) for r in data["rules"]],
                         [("morning", "kitchen"), ("both", ["kitchen", "living"]), ("tv", "living")])
        self.assertIn("kitchen", self.hub.entry)

    def test_under_a_new_id_everything_points_at_the_new_one(self):
        self.ha.answers["config/area_registry/create"] = lambda name=None, **kw: {"area_id": "kitchen_2", "name": name}
        self.remove_then_back()
        rules = {r["id"]: r for r in self.client.get("/rules").json()["rules"]}
        self.assertEqual((rules["morning"]["room"], rules["both"]["room"]), ("kitchen_2", ["kitchen_2", "living"]))
        self.assertEqual(self.hub.phones.get(self.screen["id"])["room"], "kitchen_2")

    def test_it_can_only_be_brought_back_once(self):
        self.remove_then_back()
        self.assertEqual(self.client.post("/rooms/kitchen/back").status_code, 404)

    def test_a_room_made_since_under_the_same_name_is_not_doubled(self):
        self.client.delete("/rooms/kitchen", params={"to": "living"})
        self.client.post("/rooms/living/rename", json={"name": "Kitchen"})
        self.assertEqual(self.client.post("/rooms/kitchen/back").status_code, 409)


class Passcode(ApiTest):
    def test_renaming_removing_and_bringing_back_all_need_the_code(self):
        self.lock_the_house("4821")
        from hub.lock import needs_code
        for method, path in (("POST", "/rooms/kitchen/rename"), ("DELETE", "/rooms/kitchen"), ("POST", "/rooms/kitchen/back")):
            self.assertTrue(needs_code(method, path), path)
        self.assertFalse(needs_code("GET", "/rooms/kitchen/removing"))
