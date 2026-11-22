# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Setting up a wall switch once it has joined, by trying it on the real light (design/switch-setup/, C).

Joining is only the first step. Until a switch is finished it holds no key to take commands with and
tells nobody when it is pressed, so it is on the network without being a light anybody can use. The
bridge finishes it (`setup`), and from then on every question is answered on the light itself, with
the person standing next to it: a light came on or it didn't, it dimmed or it didn't, this is the
other switch because I just pressed it. Nobody is asked what their bulbs are.

The bridge owns the switches' settings and takes them in plain words (`dims`, `pair`); what each
means on a particular maker's switch is the bridge's to know, never this file's. Walking in is the
house's own routine, not a setting on the switch.

A switch's own key comes back once, when it joins, and is the only way to set it up again later.
It is kept beside the house's mesh keys and never leaves the hub.
"""
import asyncio, json, logging, os, time

log = logging.getLogger("hub.wallswitch")

CONFIG_WAIT = 200         # a `setup` is seven acknowledged exchanges and ten reads, each retried, over a link that may be weak
APPEAR_WAIT = 25          # from finished to a light the panel can name
LISTEN_WAIT = 30          # how long somebody gets to walk to the other switch
LEAVE_AFTER = 600         # On, then off: off after ten minutes with nobody in the room
DIM_DOWN = [100, 75, 50, 30, 15, 6, 2]   # the dim test's way down; back up is the same, reversed
DIM_EVERY = 0.7          # seconds per level: about five seconds each way
WALKIN = ("nothing", "on", "on_off")


class WallSwitches:
    def __init__(self, hub, bridge):
        self.hub, self.bridge = hub, bridge
        self._listeners: list[tuple[str, asyncio.Future]] = []
        self._shows: dict[str, asyncio.Task] = {}

    # ---- what the house keeps about each switch ----
    def _path(self):
        return self.hub.settings.path.parent / "mesh-keys.json"

    def all(self) -> dict:
        try: return dict(json.loads(self._path().read_text()).get("switches") or {})
        except Exception: return {}

    def get(self, addr: str) -> dict:
        return dict(self.all().get(addr.lower()) or {})

    def remember(self, addr: str, **fields) -> dict:
        p = self._path()
        try: k = json.loads(p.read_text())
        except Exception: k = {}
        sw = k.setdefault("switches", {})
        row = {**(sw.get(addr.lower()) or {}), **fields}
        sw[addr.lower()] = row
        p.write_text(json.dumps(k, indent=1)); os.chmod(p, 0o600)
        return row

    # ---- talking to the bridge ----
    def can_setup(self) -> bool:
        chip = self.bridge._our_puck()
        caps = ((self.bridge.pucks.get(chip or "") or {}).get("caps") or "").split()
        return "setup" in caps

    def net(self) -> str | None:
        return (self.bridge.pucks.get(self.bridge._our_puck() or "") or {}).get("net")

    async def _config(self, cmd: str, timeout: float | None = None) -> dict:
        op, addr = cmd.split()[0], cmd.split()[1].lower()
        body = await self.bridge._ask(cmd, "configured", timeout or CONFIG_WAIT, topic="config",
                                      match=lambda b: isinstance(b, dict) and b.get("op") == op
                                      and str(b.get("addr", "")).lower() == addr)
        if body is None:
            return {"ok": False, "why": "The bridge stopped answering. It may be out of range of the switch."}
        return body

    # ---- joining, finished ----
    async def let_in(self, uuid: str, oob: str | None = None) -> dict:
        r = await self.bridge.let_in(uuid, oob)
        if r.get("state") != "done": return r
        addr = str(r.get("unicast") or "").lower()
        if not addr:
            return {"state": "failed", "text": "The bridge didn't say where the switch joined. Try adding it again."}
        if not self.can_setup():
            # A bridge from before setup could be finished cannot do it, and saying "added" over a switch
            # nobody can use is the thing this file exists to stop.
            return {"state": "failed", "switch": addr,
                    "text": "The switch joined, but the bridge needs an update before it can finish setting it up. "
                            "It updates on its own; try again once it has."}
        return await self.finish(addr)

    async def finish(self, addr: str) -> dict:
        """The bridge's half: the key to take commands with, its controls, and telling the house when it is
        pressed. Safe to run again on a switch that is already finished."""
        row = self.get(addr)
        if not row.get("devkey"):
            return {"state": "failed", "switch": addr,
                    "text": "The house doesn't have this switch's key, so it can't finish it. Start the switch over "
                            "(pull its tab out and back in, then hold a finger on it until it blinks) and add it again."}
        r = await self._config(f"setup {addr} {row['devkey']}")
        if not r.get("ok"):
            return {"state": "failed", "switch": addr, "retry": True,
                    "text": r.get("why") or "The switch didn't finish setting up."}
        self.remember(addr, finished=time.time())
        dev = await self.appears(addr)
        return {"state": "done", "switch": addr, "device_id": dev.id if dev else None,
                "name": dev.name if dev else None, "setup": True}

    async def device_of(self, addr: str):
        net = self.net()
        if not net or not getattr(self.hub, "home", None): return None
        want = f"mesh_{net}_{addr.lower()}"
        try: rows = list(await self.hub.ha.send("config/device_registry/list") or [])
        except Exception: return None
        hw = next((r.get("id") for r in rows
                   if any(want in (i if isinstance(i, (list, tuple)) else [i]) for i in r.get("identifiers") or [])), None)
        if not hw: return None
        parts = [d for d in self.hub.home.devices.values() if d.hw == hw]
        return next((d for d in parts if d.capability.startswith("light")), parts[0] if parts else None)

    async def appears(self, addr: str, wait: float | None = None):
        end = time.time() + (wait or APPEAR_WAIT)
        while True:
            dev = await self.device_of(addr)
            if dev or time.time() >= end: return dev
            await asyncio.sleep(1)

    # ---- trying it on the light ----
    async def _set(self, addr: str, payload: str) -> None:
        await self.hub.ha.call("mqtt", "publish", None, topic=f"mesh/{self.net()}/{addr}/set", payload=payload)

    async def show(self, addr: str, what: str) -> dict:
        """On and off three times, or slowly down to almost off and back, twice. Runs while the person
        watches; the panel says what is happening and asks what they saw.

        The dim goes all the way down because half proves nothing: many bulbs that can't dim ignore half and
        only give themselves away near the bottom, where they cut out (design/switch-setup/, dim test A)."""
        if what not in ("light", "dim"): raise ValueError("Nothing to show.")
        if not self.net(): raise ValueError("No bridge of this house is on.")
        old = self._shows.pop(addr, None)
        if old: old.cancel()
        if what == "light":
            steps, every, levels = ["on", "off"] * 3 + ["on"], 1.2, []
        else:
            sweep = DIM_DOWN + DIM_DOWN[-2::-1]
            levels = sweep + sweep[1:]
            steps, every = [f"dim:{n}" for n in levels], DIM_EVERY

        async def go():
            for s in steps:
                await self._set(addr, s)
                await asyncio.sleep(every)
        self._shows[addr] = asyncio.create_task(go())
        return {"state": "showing", "seconds": round(len(steps) * every), "every": every, "levels": levels}

    async def has_light(self, addr: str, yes: bool) -> dict:
        self.remember(addr, light=bool(yes))
        return self.summary(addr)

    async def dims(self, addr: str, yes: bool, found: bool | None = None) -> dict:
        """What the switch does, chosen; and, from the dim test, what its bulbs can do, found. The two are kept
        apart because a light that can dim is not always one somebody wants dimmed (design/switch-setup/,
        dimming is your choice, A). The test's answer repeats a choice already sent, so that is not sent again."""
        if found is not None:
            self.remember(addr, can_dim=bool(found))
            if not found and yes: return {"state": "failed", "text": "Its bulbs can't dim, so it stays on and off."}
            if self.get(addr).get("dims") == bool(yes): return {"state": "done", "restart": False}
        elif yes and self.get(addr).get("can_dim") is False:
            return {"state": "failed", "text": "Its bulbs can't dim, so it stays on and off."}
        r = await self._config(f"dims {addr} {'yes' if yes else 'no'}")
        if not r.get("ok"):
            return {"state": "failed", "text": r.get("why") or "The switch didn't take that."}
        self.remember(addr, dims=bool(yes))
        return {"state": "done", "restart": bool(r.get("restart", True))}

    # ---- the other switch for the same light ----
    def heard(self, net: str, addr: str, leaf: str, retained: bool) -> None:
        """Every switch's stream passes here. A press or a change of state while somebody is listening is
        an answer to "press the other one"."""
        if retained or leaf not in ("state", "press") or net != self.net(): return
        for who, fut in list(self._listeners):
            if addr.lower() != who and not fut.done(): fut.set_result(addr.lower())

    async def listen(self, addr: str, wait: float | None = None) -> dict:
        fut = asyncio.get_running_loop().create_future()
        entry = (addr.lower(), fut)
        self._listeners.append(entry)
        try: other = await asyncio.wait_for(fut, wait or LISTEN_WAIT)
        except (asyncio.TimeoutError, TimeoutError): other = None
        finally: self._listeners.remove(entry)
        if not other: return {"heard": None}
        dev = await self.device_of(other)
        return {"heard": {"switch": other, "device_id": dev.id if dev else None, "name": self.called(dev, other)}}

    def called(self, dev, addr: str) -> str:
        if not dev: return "another switch"
        room = getattr(self.hub.home.rooms.get(dev.room_id), "name", None) if getattr(self.hub, "home", None) else None
        return f"the switch in the {room.lower()}" if room and dev.room_id != "unassigned" else dev.name

    async def pair(self, addr: str, other: str) -> dict:
        """The switch with no light of its own is the one told who its partner is. The light keeps working
        with the hub switched off: the two switches talk to each other."""
        a, b = addr.lower(), other.lower()
        if a == b: raise ValueError("A switch can't be paired with itself.")
        companion, main = (a, b) if self.get(a).get("light") is False else (b, a)
        r = await self._config(f"pair {companion} {main}")
        if not r.get("ok"):
            return {"state": "failed", "text": r.get("why") or "The two switches weren't paired."}
        self.remember(companion, partner=main, light=False)
        self.remember(main, partner=companion)
        return {"state": "done", "companion": companion, "main": main}

    async def unpair(self, addr: str) -> dict:
        me = self.get(addr)
        partner = me.get("partner")
        if not partner: return {"state": "done"}
        companion = addr.lower() if me.get("light") is False else partner
        r = await self._config(f"unpair {companion}")
        if not r.get("ok"):
            return {"state": "failed", "text": r.get("why") or "The two switches weren't separated."}
        self.remember(addr, partner=None)
        self.remember(partner, partner=None)
        return {"state": "done"}

    # ---- walking in: the house's routine, kept beside the light ----
    async def walkin(self, addr: str, mode: str) -> dict:
        if mode not in WALKIN: raise ValueError("Walking in is nothing, on, or on then off.")
        dev = await self.device_of(addr)
        if not dev: raise ValueError("The house can't see that light yet.")
        rules = getattr(self.hub, "engine", None)
        if not rules: raise ValueError("Routines aren't running.")
        mine = (f"switch-{addr}-walkin", f"switch-{addr}-leave")
        raw = dict(rules.as_data()); raw.pop("valid", None); raw.pop("errors", None)
        kept = [r for r in raw.get("rules") or [] if r.get("id") not in mine]
        if mode != "nothing":
            if not dev.room_id or dev.room_id == "unassigned":
                raise ValueError("Say which room it's in first, so the house knows where somebody walking in is.")
            kept.append({"id": mine[0], "name": f"{dev.name} comes on when someone walks in", "room": dev.room_id,
                         "when": {"motion": "on"}, "then": {"device": dev.id, "action": "on"},
                         "enabled": True, "by": "user"})
            if mode == "on_off":
                kept.append({"id": mine[1], "name": f"{dev.name} goes off ten minutes after the room empties",
                             "room": dev.room_id, "when": {"idle": LEAVE_AFTER},
                             "then": {"device": dev.id, "action": "off"}, "enabled": True, "by": "user"})
        rules.save({**raw, "rules": kept})
        self.remember(addr, walkin=mode)
        return self.summary(addr)

    async def of_device(self, device_id: str) -> str | None:
        """The wall switch behind a light, for the light's own screen to say how it is set up."""
        for addr in self.all():
            dev = await self.device_of(addr)
            if dev and dev.id == device_id: return addr
        return None

    def summary(self, addr: str) -> dict:
        row = self.get(addr)
        return {"switch": addr.lower(), "light": row.get("light"), "dims": row.get("dims"), "can_dim": row.get("can_dim"),
                "partner": row.get("partner"), "walkin": row.get("walkin") or "nothing",
                "finished": bool(row.get("finished"))}
