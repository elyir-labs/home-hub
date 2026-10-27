# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Music in any room: radio and the household's own music, on the speakers the house already has.

The music engine is rented the way the house's devices are. An open-source music server runs beside the
rest of the hub (the `music` profile in driver-layer/docker-compose.yml) and does the playing: it finds
radio and the household's own files, sends the same song to several speakers in step, and hands every
speaker it can reach to the driver layer, where the house sees it. None of it reaches the screen -- no
sign-in, no settings, none of its words. design/music/ (A, with C's sentences) is what it looks like, and
docs/music.md is what runs and what comes next.

The brain does three things with it. It SETS IT UP, once, with nobody watching: an owner with a password
only the brain knows, internet radio switched on, and the driver layer told where it is and given a key.
It PLAYS: one thing, in one room or several, joined so they play in step. And it REMEMBERS what each room
played last, which is the card's Again and the command box's completions.

What it never does is sign in to a music service. Spotify plays only on speakers that have it built in
(decided 20 October 2026); the engine's own Spotify parts are never switched on, and this file has no
path that could.
"""
import asyncio, json, logging, secrets, time, urllib.error, urllib.parse, urllib.request
import websockets

log = logging.getLogger("hub.music")

DOMAIN = "music_assistant"
# What the engine is asked to switch on, and nothing else. Radio needs no account, so a house has
# something to play the first evening. The household's own files come with the drive question (phase 2).
SOURCES = ("radiobrowser",)
# What the engine must not be running, whoever switched it on. Its Spotify parts run a Spotify client inside the hub,
# which is not ours to run (Spotify plays on the speakers that have it built in); its AirPlay receiver the same; and
# its party page hands guests a web address into the engine's own screens. The engine switches the last one on by
# itself the first time it starts.
NEVER = ("spotify", "spotify_connect", "airplay_receiver", "party")
AGAIN = 2                  # what a quiet speaker's card offers to play again
REMEMBER = 8               # how many plays a room keeps, for the command box's completions
KINDS = ("radio", "playlist", "album", "track", "artist")
ACTIVE = ("playing", "paused", "buffering")


class MusicError(RuntimeError):
    """Something the person can be told, in the house's words."""


def item_of(raw: dict) -> dict | None:
    """The engine's media item, as the panel and the grammar hold it: what it is called, what it is, who by, a picture."""
    uri, name, kind = raw.get("uri"), (raw.get("name") or "").strip(), raw.get("media_type")
    if not uri or not name or kind not in KINDS: return None
    by = ", ".join(a.get("name", "") for a in raw.get("artists") or [] if isinstance(a, dict) and a.get("name"))
    img = raw.get("image")
    art = img if isinstance(img, str) else (img or {}).get("path") if isinstance(img, dict) else None
    return {"uri": uri, "name": name, "kind": kind, "by": by or None, "art": art if isinstance(art, str) and art.startswith("https://") else None}


class Music:
    def __init__(self, hub):
        self.hub = hub
        self.url = (hub.env.get("MUSIC_URL") or "http://127.0.0.1:8095").rstrip("/")
        self.state = "absent"          # absent (no engine answering), setting-up, ready, or failed
        self.entry: str | None = None  # the driver layer's entry for the engine, which its searches are asked under
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------ setting it up, unseen
    async def ensure(self) -> str:
        """Bring the engine and the driver layer together, if they are not already. Safe to call any time."""
        async with self._lock:
            try:
                if not await asyncio.to_thread(self._info): self.state = "absent"; return self.state
                self.state = "setting-up"
                token = await self._sign_in()
                await self._sources(token)
                self.entry = await self._connect(token)
                self.state = "ready" if self.entry else "failed"
            except Exception as e:
                log.warning("music: could not set the engine up: %s", e)
                self.state = "failed"
            return self.state

    def _info(self) -> dict | None:
        try:
            with urllib.request.urlopen(f"{self.url}/info", timeout=5) as r: return json.loads(r.read())
        except Exception: return None

    def _post(self, path: str, body: dict) -> tuple[int, dict]:
        r = urllib.request.Request(f"{self.url}{path}", data=json.dumps(body).encode(), method="POST",
                                   headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(r, timeout=20) as resp: return resp.status, json.loads(resp.read() or b"{}")
        except urllib.error.HTTPError as e:
            try: return e.code, json.loads(e.read() or b"{}")
            except Exception: return e.code, {}

    async def _sign_in(self) -> str:
        """A session on the engine as its owner. The owner is made the first time, with a password nobody types."""
        acct = self.hub.settings.get("music_engine") or {}
        if not acct.get("password"):
            acct = {"username": "hub", "password": secrets.token_urlsafe(24)}
            code, r = await asyncio.to_thread(self._post, "/setup", {**acct, "device_name": "The hub"})
            if code != 200 or not r.get("token"): raise MusicError(f"the engine would not take an owner: {r.get('error') or code}")
            self.hub.settings.set(music_engine=acct)
            return r["token"]
        code, r = await asyncio.to_thread(self._post, "/auth/login", {"credentials": acct})
        if code == 403 and "setup" in str(r.get("error") or "").lower():
            # The engine started over (its folder was lost, or a restore did not carry it): it has no owner, so make one.
            self.hub.settings.set(music_engine=None)
            return await self._sign_in()
        if code != 200 or not r.get("token"): raise MusicError(f"the engine refused the hub's own sign-in: {r.get('error') or code}")
        return r["token"]

    async def _engine(self, token: str, *commands) -> list:
        """Commands on the engine's own socket, in order. Each answer is its result, or raises."""
        ws_url = self.url.replace("http", "ws", 1) + "/ws"
        out = []
        async with websockets.connect(ws_url, max_size=None, open_timeout=10) as ws:
            await ws.recv()                                   # the server's hello
            await ws.send(json.dumps({"message_id": "auth", "command": "auth", "args": {"token": token}}))
            if "error_code" in json.loads(await ws.recv()): raise MusicError("the engine refused the hub's key")
            for i, (command, args) in enumerate(commands):
                await ws.send(json.dumps({"message_id": str(i), "command": command, "args": args}))
                while True:
                    m = json.loads(await asyncio.wait_for(ws.recv(), 30))
                    if m.get("message_id") != str(i): continue
                    if "error_code" in m: raise MusicError(f"{command}: {m.get('details')}")
                    out.append(m.get("result")); break
        return out

    async def _sources(self, token: str):
        (have,) = await self._engine(token, ("config/providers", {}))
        domains = {p.get("domain") for p in have or []}
        for p in have or []:
            if p.get("domain") in NEVER: await self._engine(token, ("config/providers/remove", {"instance_id": p.get("instance_id") or p["domain"]}))
        for want in SOURCES:
            if want not in domains: await self._engine(token, ("config/providers/setup", {"provider_domain": want}))

    # The driver layer's side: an entry for the engine, made through its own setup flow the way the
    # weather is. HA answers the engine's sign-in step one of two ways depending on how it is set up --
    # sending a browser to the engine's login page, or asking for a key -- and both are answered here.
    def _ha(self, method: str, path: str, data: dict | None = None):
        r = urllib.request.Request(f"{self.hub.ha_url}{path}", data=json.dumps(data).encode() if data is not None else None, method=method,
                                   headers={"Authorization": f"Bearer {self.hub.ha_token}", "Content-Type": "application/json"})
        with urllib.request.urlopen(r, timeout=30) as resp: return json.loads(resp.read() or b"null")

    def _callback(self, external_url: str, code: str):
        """Finish the browser step without a browser: HA's own callback, given the state it issued and the engine's key."""
        ret = urllib.parse.parse_qs(urllib.parse.urlparse(external_url).query).get("return_url", [""])[0]
        state = urllib.parse.parse_qs(urllib.parse.urlparse(ret).query).get("state", [""])[0]
        if not state: raise MusicError("the driver layer asked for a sign-in the hub cannot answer")
        q = urllib.parse.urlencode({"state": state, "code": code})
        with urllib.request.urlopen(f"{self.hub.ha_url}/auth/external/callback?{q}", timeout=30) as r: r.read()

    async def _answer(self, step: dict, token: str) -> dict:
        """Walk one of the driver layer's flows for the engine to its end."""
        for _ in range(6):
            kind, fid = step.get("type"), step.get("flow_id")
            if kind in ("create_entry", "abort"): return step
            if kind == "form" and step.get("step_id") in ("user", "manual"):
                step = await asyncio.to_thread(self._ha, "POST", f"/api/config/config_entries/flow/{fid}", {"url": self.url})
            elif kind == "form" and step.get("step_id") == "auth_manual":
                (key,) = await self._engine(token, ("auth/token/create", {"name": "Home engine"}))
                step = await asyncio.to_thread(self._ha, "POST", f"/api/config/config_entries/flow/{fid}", {"token": key})
            elif kind == "form" and step.get("step_id") in ("discovery_confirm", "reauth_confirm"):
                step = await asyncio.to_thread(self._ha, "POST", f"/api/config/config_entries/flow/{fid}", {})
            elif kind == "external":
                await asyncio.to_thread(self._callback, step.get("url") or "", token)
                step = await asyncio.to_thread(self._ha, "GET", f"/api/config/config_entries/flow/{fid}")
            elif kind == "external_done":
                step = await asyncio.to_thread(self._ha, "POST", f"/api/config/config_entries/flow/{fid}", {})
            else: raise MusicError(f"the driver layer asked something unexpected: {kind} {step.get('step_id')}")
        raise MusicError("the driver layer's setup went round in circles")

    async def _connect(self, token: str) -> str | None:
        ha = self.hub.ha
        # A sign-in that ran out (the engine's keys last a year) comes back as a reauth flow: answer it first.
        for f in await ha.send("config_entries/flow/progress"):
            if f.get("handler") == DOMAIN and (f.get("context") or {}).get("source") == "reauth":
                step = await asyncio.to_thread(self._ha, "GET", f"/api/config/config_entries/flow/{f['flow_id']}")
                await self._answer(step, token)
        entries = [e for e in await ha.send("config_entries/get", domain=DOMAIN) if e.get("source") != "ignore"]
        if entries: return entries[0]["entry_id"]
        step = await asyncio.to_thread(self._ha, "POST", "/api/config/config_entries/flow", {"handler": DOMAIN, "show_advanced_options": False})
        done = await self._answer(step, token)
        if done.get("type") == "abort" and done.get("reason") != "already_configured":
            raise MusicError(f"the driver layer would not add the engine: {done.get('reason')}")
        entries = [e for e in await ha.send("config_entries/get", domain=DOMAIN) if e.get("source") != "ignore"]
        return entries[0]["entry_id"] if entries else None

    # ------------------------------------------------------------------ who can play
    def players(self) -> list[dict]:
        """Every speaker that can start music: {id, room, name, kind}. The kind is open -- a speaker of any make, a place
        to send music, later a device of the house's own -- and nothing on the screen ever branches on it."""
        home = self.hub.home
        out = []
        for dev_id, p in home.players.items():
            d = home.devices.get(dev_id)
            if d and d.room_id != "unassigned": out.append({"id": d.id, "room": d.room_id, "name": d.name, "kind": p["kind"]})
        return out

    def in_room(self, room_id: str) -> list:
        """The speakers in a room that can start music, best first: a speaker before a screen."""
        from .commands import TV
        ds = [self.hub.home.devices[p["id"]] for p in self.players() if p["room"] == room_id]
        return sorted(ds, key=lambda d: bool(TV.search(d.name)))

    def rooms(self) -> list[str]:
        return list(dict.fromkeys(p["room"] for p in self.players()))

    def _engine_id(self, dev) -> str:
        return self.hub.home.players[dev.id]["entity"]

    # ------------------------------------------------------------------ playing
    async def _call(self, domain, service, entity_id, **data):
        if self.state != "ready" and not self.entry: raise MusicError("Music isn't ready on this hub yet.")
        await self.hub.ha.call(domain, service, entity_id, **data)

    async def play(self, item: dict, room_ids: list[str], source="user", said: str | None = None) -> dict:
        """Play one thing in these rooms, in step. The first room's speaker leads and the others join it."""
        speakers = [s for r in dict.fromkeys(room_ids) for s in self.in_room(r)[:1]]
        if not speakers: raise MusicError("There's no speaker there that can play music.")
        lead, rest = speakers[0], speakers[1:]
        await self._call(DOMAIN, "play_media", self._engine_id(lead), media_id=item["uri"], media_type=item["kind"], enqueue="replace")
        if rest:
            try: await self._call("media_player", "join", self._engine_id(lead), group_members=[self._engine_id(d) for d in rest])
            except Exception as e:
                # Speakers that cannot play in step (two makes that do not share a way to) each play it on their own.
                log.info("music: could not join %s (%s); playing each on its own", [d.id for d in rest], e)
                for d in rest: await self._call(DOMAIN, "play_media", self._engine_id(d), media_id=item["uri"], media_type=item["kind"], enqueue="replace")
        for r in dict.fromkeys(d.room_id for d in speakers): self.remember(r, item)
        self.hub.log.add("action", lead.id, None, "music", source=source,
                         detail={"name": item["name"], "rooms": [d.room_id for d in speakers], **({"said": said} if said else {})})
        for d in speakers:
            if d.room_id in self.hub.home.rooms: self.hub.hold(self.hub.home.rooms[d.room_id])
        return {"devices": [d.id for d in speakers], "rooms": [d.room_id for d in speakers]}

    async def join(self, room_id: str, into_room: str, source="user"):
        """Add a room to the music playing in another, as one more speaker in step."""
        here, there = self.in_room(into_room)[:1], self.in_room(room_id)[:1]
        if not here or not there: raise MusicError("There's no speaker there that can play music.")
        lead = self._leader(here[0])
        await self._call("media_player", "join", self._engine_id(lead), group_members=[self._engine_id(there[0])])
        self.hub.log.add("action", there[0].id, None, "music_join", source=source, detail={"room": into_room})

    async def leave(self, room_id: str, source="user"):
        """Take a room out of the music it is sharing; the others keep playing."""
        for d in self.in_room(room_id)[:1]:
            await self._call("media_player", "unjoin", self._engine_id(d))
            self.hub.log.add("action", d.id, None, "music_leave", source=source)

    async def stop(self, room_ids: list[str], source="user", said: str | None = None) -> list:
        """Stop the music in these rooms. A room sharing music with others leaves it; the rest play on."""
        stopped = []
        for r in dict.fromkeys(room_ids):
            for d in self.in_room(r):
                if d.state not in ACTIVE: continue
                if self.hub.home.together.get(d.id): await self._call("media_player", "unjoin", self._engine_id(d))
                await self._call("media_player", "media_stop", self._engine_id(d))
                stopped.append(d)
                self.hub.log.add("action", d.id, None, "music_stop", source=source, detail={"said": said} if said else None)
        return stopped

    def _leader(self, dev):
        """The speaker leading the music this one is part of: joining has to go to the leader."""
        mates = self.hub.home.together.get(dev.id) or []
        return self.hub.home.devices.get(mates[0], dev) if mates else dev

    def playing_in(self, room_id: str):
        return next((d for d in self.in_room(room_id) if d.state in ACTIVE), None)

    # ------------------------------------------------------------------ what to play
    def remember(self, room_id: str, item: dict):
        kept = dict(self.hub.settings.get("music_again") or {})
        row = [i for i in kept.get(room_id, []) if i.get("uri") != item["uri"]]
        kept[room_id] = [{k: item.get(k) for k in ("uri", "name", "kind", "by", "art")}, *row][:REMEMBER]
        self.hub.settings.set(music_again=kept)

    def again(self, room_id: str | None, n: int = AGAIN) -> list[dict]:
        kept = self.hub.settings.get("music_again") or {}
        if room_id: return list(kept.get(room_id, []))[:n]
        seen, out = set(), []
        for row in kept.values():
            for i in row:
                if i["uri"] not in seen: seen.add(i["uri"]); out.append(i)
        return out[:n]

    def known(self) -> list[dict]:
        """Everything the house has played, newest first, for the grammar to find by name."""
        return self.again(None, n=64)

    async def _service(self, service: str, **data) -> dict:
        if not self.entry: raise MusicError("Music isn't ready on this hub yet.")
        r = await self.hub.ha.send("call_service", domain=DOMAIN, service=service, service_data={"config_entry_id": self.entry, **data}, return_response=True)
        return (r or {}).get("response") or {}

    async def find(self, text: str, limit: int = 8) -> list[dict]:
        """Songs, artists, albums, playlists and stations by name, the household's own first."""
        text = (text or "").strip()
        if len(text) < 2: return []
        r = await self._service("search", name=text, limit=limit)
        order = ("radio", "playlists", "albums", "artists", "tracks")
        found = [item_of(x) for key in order for x in r.get(key) or []]
        return [i for i in found if i][: limit * 2]

    async def library(self, kind: str, limit: int = 12) -> list[dict]:
        r = await self._service("get_library", media_type=kind, limit=limit, order_by="last_played")
        return [i for i in (item_of(x) for x in r.get("items") or []) if i]

    async def catalog(self, room_id: str | None) -> dict:
        """The pane's left side: again, then radio, then the household's own music."""
        out = {"ready": self.state == "ready", "again": self.again(room_id, n=6), "radio": [], "own": []}
        if self.state != "ready": return out
        try:
            out["radio"] = await self.library("radio", 8)
            # The engine makes playlists of its own out of nothing ("500 random tracks"); a house with no music of its
            # own is shown none of them rather than a shelf of empty promises.
            if await self.library("track", 1):
                out["own"] = (await self.library("playlist", 6)) + (await self.library("album", 8))
        except Exception as e: log.warning("music: could not read the library: %s", e)
        return out

    async def resolve(self, name: str) -> dict | None:
        """A thing to play, by what somebody called it: something the house has played first, then the engine's search."""
        from .commands import norm
        want = norm(name)
        if not want: return None
        for i in self.known():
            if norm(i["name"]) == want: return i
        for i in self.known():
            if norm(i["name"]).startswith(want): return i
        if self.state != "ready": return None
        found = await self.find(name, limit=5)
        exact = [i for i in found if norm(i["name"]) == want]
        return (exact or found or [None])[0]

    def describe(self) -> dict:
        return {"state": self.state, "rooms": self.rooms(), "at": time.time()}
