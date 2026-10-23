# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""For working on the hub (design/developer/, B): what it follows, SSH, and the screens in the house.

These pin the brain's half: when the page is listed, that changes go out as state for the host and never
run anything, that a key is checked before it is kept, and that a screen's unit is known by its own key.

Run from brain/: .venv/bin/python -m unittest -v tests.test_developer
"""
import base64, json, os, struct, time, urllib.error
from unittest import mock

from hub import developer as developer_mod, updates as updates_mod
from hub.phones import COOKIE
from tests.apptest import ApiTest


def _s(b: bytes) -> bytes: return struct.pack(">I", len(b)) + b


def ed25519(comment="jordan@laptop", seed=b"\x01") -> str:
    return "ssh-ed25519 " + base64.b64encode(_s(b"ssh-ed25519") + _s(seed * 32)).decode() + (f" {comment}" if comment else "")


def rsa(bits: int) -> str:
    n = (1 << (bits - 1)) | 1
    return "ssh-rsa " + base64.b64encode(_s(b"ssh-rsa") + _s(b"\x01\x00\x01") + _s(b"\x00" + n.to_bytes(bits // 8, "big"))).decode()


class DeveloperTest(ApiTest):
    def read(self, name): return json.loads((self.data / name).read_text())

    def did(self, on, keys, user="pi"):
        (self.data / "ssh.json").write_text(json.dumps({"on": on, "keys": keys, "user": user}))
        (self.data / "ssh.request").unlink(missing_ok=True)


class ThePageIsListed(DeveloperTest):
    def test_on_a_release_hub_it_is_not_listed_until_somebody_shows_it(self):
        self.assertFalse(self.client.get("/developer").json()["shown"])
        self.assertTrue(self.client.post("/developer/show").json()["shown"])
        self.assertFalse(self.client.post("/developer/hide").json()["shown"])

    def test_on_a_hub_that_follows_a_branch_it_is_listed_until_somebody_takes_it_away(self):
        self.hub.updates.channel = "development"
        self.assertTrue(self.client.get("/developer").json()["shown"])
        self.client.post("/developer/hide")
        self.assertFalse(self.client.get("/developer").json()["shown"])

    def test_the_page_says_what_the_hub_runs(self):
        d = self.client.get("/developer").json()
        for k in ("channel", "version", "commit", "landed", "behind", "ssh", "screens", "requested"): self.assertIn(k, d)
        self.assertEqual((d["channel"], d["requested"]), ("release", {"channel": None}))


class WhatItFollows(DeveloperTest):
    def test_a_named_channel_goes_to_the_host_as_a_name(self):
        d = self.client.post("/developer/channel", json={"channel": "Development"}).json()
        self.assertEqual(self.read("channel.request")["channel"], "development")
        self.assertEqual(d["requested"], {"channel": "development"})

    def test_a_branch_is_checked_on_github_first(self):
        with mock.patch.object(updates_mod, "_get", return_value={"name": "try-it"}) as get:
            self.assertEqual(self.client.post("/developer/channel", json={"channel": "try-it"}).status_code, 200)
        self.assertIn("/branches/try-it", get.call_args.args[0])
        self.assertEqual(self.read("channel.request")["channel"], "try-it")

    def test_a_branch_github_does_not_have_is_refused_and_nothing_is_written(self):
        gone = urllib.error.HTTPError("u", 404, "Not Found", {}, None)
        with mock.patch.object(updates_mod, "_get", side_effect=gone):
            r = self.client.post("/developer/channel", json={"channel": "try-it"})
        self.assertEqual((r.status_code, r.json()["detail"]), (400, "There is no branch called try-it on GitHub."))
        self.assertFalse((self.data / "channel.request").exists())

    def test_anything_shaped_unlike_a_branch_never_reaches_github(self):
        with mock.patch.object(updates_mod, "_get") as get:
            for bad in ("", "../etc", "a b", "x;reboot", "-rf", "main..dev", "end/", "x.lock"):
                self.assertEqual(self.client.post("/developer/channel", json={"channel": bad}).status_code, 400, bad)
        get.assert_not_called()

    def test_once_the_hub_is_on_what_was_asked_for_nothing_is_still_asked(self):
        self.client.post("/developer/channel", json={"channel": "development"})
        self.hub.updates.channel = "development"
        self.assertEqual(self.client.get("/developer").json()["requested"], {"channel": None})

    def test_how_far_behind_a_branch_hub_is_comes_from_github(self):
        self.hub.updates.channel, self.hub.updates.commit = "development", "a" * 40
        with mock.patch.object(updates_mod, "_get", return_value={"ahead_by": 3}) as get:
            self.assertEqual(self.client.get("/developer").json()["behind"], 3)
            self.client.get("/developer")
        self.assertEqual(get.call_count, 1, "asked once, then kept a while")
        self.assertIn(f"/compare/{'a' * 40}...development", get.call_args.args[0])


class SSH(DeveloperTest):
    def test_a_pasted_key_is_kept_and_the_host_is_sent_the_whole_state(self):
        d = self.client.post("/developer/ssh/keys", json={"keys": [ed25519()], "source": "pasted"}).json()
        self.assertEqual([(k["name"], k["type"], k["source"]) for k in d["ssh"]["keys"]], [("jordan@laptop", "ssh-ed25519", "pasted")])
        self.assertTrue(d["ssh"]["keys"][0]["fingerprint"].startswith("SHA256:"))
        self.assertEqual(self.read("ssh.request")["on"], False)
        self.assertEqual(self.read("ssh.request")["keys"], [ed25519()])

    def test_the_same_key_twice_is_one_key(self):
        self.client.post("/developer/ssh/keys", json={"keys": [ed25519()]})
        d = self.client.post("/developer/ssh/keys", json={"keys": [ed25519("another comment")]}).json()
        self.assertEqual(len(d["ssh"]["keys"]), 1)

    def test_keys_that_are_not_keys_or_are_weak_are_refused(self):
        for bad in ("hello", "ssh-dss AAAAB3NzaC1kc3M=", "ssh-ed25519 not*base64", rsa(2048),
                    "ssh-rsa " + ed25519().split()[1], ed25519("x" * 101), ed25519("evil\ncommand")):
            r = self.client.post("/developer/ssh/keys", json={"keys": [bad]})
            self.assertEqual(r.status_code, 400, bad[:40])
        self.assertFalse((self.data / "ssh.request").exists())
        self.assertEqual(self.client.post("/developer/ssh/keys", json={"keys": [rsa(3072)]}).status_code, 200)

    def test_ssh_is_not_turned_on_with_no_key_to_sign_in_with(self):
        r = self.client.post("/developer/ssh", json={"on": True})
        self.assertEqual(r.status_code, 400)

    def test_turning_it_on_is_pending_until_the_host_says_it_did(self):
        self.client.post("/developer/ssh/keys", json={"keys": [ed25519()]})
        d = self.client.post("/developer/ssh", json={"on": True}).json()["ssh"]
        self.assertEqual((d["on"], d["pending"]), (False, True))
        self.assertEqual(self.read("ssh.request"), {**self.read("ssh.request"), "on": True, "keys": [ed25519()]})
        self.did(True, [ed25519()])
        d = self.client.get("/developer").json()["ssh"]
        self.assertEqual((d["on"], d["pending"], d["user"]), (True, False, "pi"))
        self.assertTrue(d["host"].endswith(".local"))

    def test_ssh_turned_on_when_the_card_was_flashed_is_on_and_nothing_is_waiting(self):
        (self.data / "ssh.json").write_text(json.dumps({"on": True, "keys": [], "user": "pi"}))
        d = self.client.get("/developer").json()["ssh"]
        self.assertEqual((d["on"], d["pending"], d["keys"]), (True, False, []))

    def test_removing_the_last_key_turns_it_off(self):
        d = self.client.post("/developer/ssh/keys", json={"keys": [ed25519()]}).json()
        self.client.post("/developer/ssh", json={"on": True})
        fp = d["ssh"]["keys"][0]["fingerprint"]
        d = self.client.delete(f"/developer/ssh/keys/{fp}").json()["ssh"]
        self.assertEqual((d["keys"], self.read("ssh.request")["on"]), ([], False))
        self.assertEqual(self.client.delete(f"/developer/ssh/keys/{fp}").status_code, 404)

    def test_keys_from_a_github_username(self):
        text = ed25519("") + "\n" + rsa(1024) + "\n" + ed25519("", b"\x02") + "\n"
        with mock.patch.object(developer_mod, "_get_text", return_value=text) as get:
            keys = self.client.get("/developer/github-keys", params={"user": "jordan"}).json()["keys"]
        self.assertEqual(get.call_args.args[0], "https://github.com/jordan.keys")
        self.assertEqual([k["name"] for k in keys], ["jordan on GitHub"] * 2, "the short RSA key is left out")
        d = self.client.post("/developer/ssh/keys", json={"keys": [keys[0]["line"]], "source": "github:jordan"}).json()
        self.assertEqual((d["ssh"]["keys"][0]["name"], d["ssh"]["keys"][0]["source"]), ("jordan on GitHub", "github:jordan"))

    def test_a_github_username_is_checked_before_anything_is_fetched(self):
        with mock.patch.object(developer_mod, "_get_text") as get:
            self.assertEqual(self.client.get("/developer/github-keys", params={"user": "../x"}).status_code, 400)
        get.assert_not_called()


class LockedHouse(DeveloperTest):
    def setUp(self):
        super().setUp()
        self.code = self.lock_the_house("4821")

    def guest(self):
        ask = self.hub.phones.ask("Somebody's phone")
        self.hub.phones.allow(ask["id"], "day")
        _, _, token = self.hub.phones.claim(ask["id"])
        self.client.cookies.set(COOKIE, token)

    def test_changes_need_the_code_and_a_phone_that_holds_keys(self):
        _, token = self.hub.phones.with_code("Jordan's phone")
        self.client.cookies.set(COOKIE, token)
        self.assertEqual(self.client.get("/developer").status_code, 200)
        self.assertEqual(self.client.post("/developer/show").status_code, 401)
        self.assertEqual(self.client.post("/developer/show", headers={"x-hub-code": self.code}).status_code, 200)
        self.guest()
        for m, path in (("post", "/developer/show"), ("post", "/developer/channel"), ("post", "/developer/ssh"),
                        ("post", "/developer/ssh/keys"), ("post", "/developer/screens/update")):
            r = getattr(self.client, m)(path, json={}, headers={"x-hub-code": self.code})
            self.assertEqual(r.status_code, 403, path)

    def test_who_can_sign_in_is_not_changed_from_away(self):
        phone, token = self.hub.phones.with_code("Jordan's phone")
        self.hub.phones.get(phone["id"])["remote"] = True      # let out, so the door itself would let this through
        self.client.cookies.set(COOKIE, token)
        with mock.patch.object(developer_mod.Developer, "add_keys") as add:
            r = self.client.post("/developer/ssh/keys", json={"keys": [ed25519()]}, headers={"x-hub-code": self.code, "X-Hub-Via": "relay"})
        self.assertEqual(r.status_code, 403)
        add.assert_not_called()

    def test_a_screens_unit_reports_without_a_cookie(self):
        self.client.cookies.clear()
        r = self.client.post("/screens/report", json={"unit": "ab" * 8, "key": "k" * 40, "host": "screen.local", "commit": "c" * 40})
        self.assertEqual((r.status_code, r.json()), (200, {"update": False}))

    def test_but_not_from_away(self):
        self.client.cookies.clear()
        r = self.client.post("/screens/report", json={"unit": "ab" * 8, "key": "k" * 40}, headers={"X-Hub-Via": "relay"})
        self.assertEqual(r.status_code, 403)


class Screens(DeveloperTest):
    UNIT, KEY = "ab" * 8, "k" * 40

    def report(self, key=None, **kw):
        body = {"unit": self.UNIT, "key": key or self.KEY, "host": "screen.local", "version": "v1.2.0",
                "commit": "c" * 40, "channel": "release", "updating": False, **kw}
        return self.client.post("/screens/report", json=body)

    def row(self): return self.client.get("/developer").json()["screens"][0]

    def test_a_screen_that_reports_is_on_the_page(self):
        self.report()
        r = self.row()
        self.assertEqual((r["id"], r["host"], r["version"], r["commit"], r["channel"], r["landed"]),
                         (self.UNIT, "screen.local", "v1.2.0", "c" * 40, "release", False))
        self.assertEqual(r["ip"], "testclient")
        self.assertAlmostEqual(r["seen"], time.time(), delta=5)

    def test_a_unit_is_known_by_the_key_it_first_gave(self):
        self.report()
        self.assertEqual(self.report(key="x" * 40).status_code, 403)
        self.assertEqual(self.report(key="short").status_code, 400)

    def test_update_now_is_answered_once_and_the_screen_shows_updating_meanwhile(self):
        self.report()
        self.client.post(f"/developer/screens/{self.UNIT}/update")
        self.assertTrue(self.row()["updating"])
        self.assertEqual(self.report().json(), {"update": True})
        self.assertEqual(self.report(updating=True).json(), {"update": False})
        self.assertTrue(self.row()["updating"])
        self.assertEqual(self.client.post("/developer/screens/nobody/update").status_code, 404)

    def test_update_all(self):
        self.report()
        self.client.post("/developer/screens/update")
        self.assertEqual(self.report().json(), {"update": True})

    def test_a_screen_on_releases_is_current_when_it_is_on_its_hubs_release(self):
        self.hub.updates.commit = "c" * 40
        self.report()
        self.assertTrue(self.row()["current"])
        self.hub.updates.commit = "d" * 40
        self.assertFalse(self.row()["current"])
        self.hub.updates.channel = "development"
        self.assertIsNone(self.row()["current"], "a screen on releases does not follow a hub on a branch")

    def test_a_screen_on_a_branch_is_current_when_it_is_on_that_branchs_head(self):
        def get(url):
            if "/compare/" in url: return {"status": "ahead"}
            return {"sha": "c" * 40}
        with mock.patch.object(updates_mod, "_get", side_effect=get):
            self.report(channel="try-it")
            self.assertEqual((self.row()["current"], self.row()["landed"]), (True, False))

    def test_a_screen_on_a_landed_branch_is_compared_with_development(self):
        def get(url):
            if "/compare/" in url: return {"status": "behind"}
            return {"sha": "d" * 40}
        with mock.patch.object(updates_mod, "_get", side_effect=get) as g:
            self.report(channel="pi-image-wall")
            r = self.row()
        self.assertEqual((r["landed"], r["current"]), (True, False))
        self.assertTrue(any("/commits/development" in c.args[0] for c in g.call_args_list))

    def test_it_takes_its_walls_name_once_the_wall_has_been_seen_from_the_same_address(self):
        phone, _ = self.hub.phones.with_code("Kitchen screen", "screen")
        self.hub.developer.saw_screen(phone, "testclient")
        self.report()
        self.assertEqual(self.row()["name"], "Kitchen screen")

    def test_screens_survive_a_restart_of_the_brain(self):
        self.report()
        self.assertEqual(list(developer_mod.Developer(self.hub).screens), [self.UNIT])

    def test_a_unit_that_says_something_odd_is_cleaned_not_trusted(self):
        self.report(host="screen.local; rm -rf /", channel="x" * 300)
        r = self.row()
        self.assertNotIn(";", r["host"])
        self.assertLessEqual(len(r["channel"]), 100)
