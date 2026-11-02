# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The registration service: names for houses, and the relay's yes or no.

Two audiences on one port. Hubs, from anywhere, at https://api.elyir.app: is this name free, take it
(with an invite code, if somebody was handed one), how is it doing, bring an invite to it later, let it go, and
hand a sealed notification to a phone in the store app (push.py). And frps, on this same box, asking before it carries a house (docs/service.md,
Where the check goes) -- which must never be reachable from outside, because whoever could answer it
could open the relay to anybody. The api name reaches this service the way a house reaches its own
door, through frps and a local Caddy (relay/terraform), so every request from outside arrives with
X-Forwarded-For on it and the plugin route turns away anything that has one.

The house never depends on this. With it down, frps refuses new tunnels and every house carries on at
home exactly as it does now.
"""
import base64, hashlib, hmac, os, shutil, time
from collections import Counter
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from home import Home, serve
from push import Apns, Limit, problem
from registry import RESERVED, Payers, Registry, read_ticket

CLAIMS_PER_DAY = 5               # per address: enough for a household changing its mind, not for a script
WRONG_INVITES_PER_DAY = 10       # per house: typos, not guessing


def watch_key(token: str) -> str:
    """The maker's watcher's key, derived from the relay token as the box's own names' secrets are, so a new route
    needs no new secret on the box. relay/terraform derives the same: sha256("watch:<token>")."""
    return hashlib.sha256(f"watch:{token}".encode()).hexdigest() if token else ""


def box(data: Path | None) -> dict:
    """The box under the service: the container shares the host's load and memory, and the volume is mounted at data."""
    out: dict = {"load": [round(x, 2) for x in os.getloadavg()]}
    try:
        mem = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines() if ":" in line)
        out["memory_used"] = round(1 - int(mem["MemAvailable"].split()[0]) / int(mem["MemTotal"].split()[0]), 3)
    except (OSError, KeyError, ValueError): pass
    if data:
        disk = shutil.disk_usage(data)
        out["disk_used"] = round(disk.used / disk.total, 3)
    return out


def make(registry: Registry, now=time.time, relay: dict | None = None, offer: dict | None = None, home: Home | None = None,
         nearby_origins: tuple = (), payers: Payers | None = None, apns: Apns | None = None, limit: Limit | None = None,
         data: Path | None = None) -> FastAPI:
    """`relay` is how a carried house reaches frps -- its address and the shared token, which is not the gate
    (the house's own secret is) but which frps wants, so the hub is handed it rather than anybody typing it.
    `offer` is what a household is shown: whether the service is open to them, at what price, and where to pay."""
    app = FastAPI(title="home-hub relay registration", docs_url=None, redoc_url=None, openapi_url=None)
    claims: dict[str, list[float]] = {}
    wrong: dict[str, list[float]] = {}
    relay = relay or {"addr": f"relay.{registry.zone}", "token": ""}
    offer = offer or {"open": False, "price": None, "pay": None}
    home = home or Home(registry, now=now)
    payers = payers or Payers()
    limit = limit or Limit(now=now)
    watcher = watch_key(relay["token"])
    started, tally = now(), Counter()

    def owner(name: str, authorization: str | None):
        secret = (authorization or "").removeprefix("Bearer ").strip()
        if not registry.holder(name, secret): raise HTTPException(404, "No house by that name holds that key.")

    @app.get("/alive")
    def alive(authorization: str | None = Header(default=None)):
        """Up, to anybody. To the maker's watcher (watch/), how it is doing too: /alive because Caddy on the box passes
        only the routes it lists, and a new one would mean a new box."""
        key = (authorization or "").removeprefix("Bearer ").strip()
        if not (watcher and key and hmac.compare_digest(key, watcher)): return {"ok": True}
        return {"ok": True, "up_since": started, "houses": registry.counts(), "since_start": dict(tally), "box": box(data)}

    @app.get("/offer")
    def what_is_offered():
        """Whether the panel may offer this at all. Closed until a household can actually pay: the panel never
        shows a promise the house cannot keep, and an address nobody can pay for is one."""
        return offer

    @app.get("/nearby")
    def nearby(request: Request, origin: str | None = Header(default=None)):
        """Which names have their tunnel at the same public address as the asker: what a phone or laptop on a
        house's Wi-Fi sees as "on this Wi-Fi". Served on nearby.<zone>, which has no IPv6 record, so the
        browser comes in over IPv4 like the printers' tunnels do and the two addresses can match."""
        who = request.client.host if request.client else ""
        r = JSONResponse({"names": registry.nearby(who)}, headers={"Cache-Control": "no-store", "Vary": "Origin"})
        if origin and origin in nearby_origins:
            r.headers["Access-Control-Allow-Origin"] = origin
        return r

    @app.get("/names/{name}")
    def look(name: str, also: list[str] = Query(default=[])):
        """As somebody types: free, or why not and three that are. `also` carries the hub's own hints -- its town, a surname."""
        return registry.look(name, also[:4])

    class Claim(BaseModel):
        name: str
        invite: str | None = None

    @app.post("/houses", status_code=201)
    def claim(body: Claim, request: Request):
        who = request.client.host if request.client else ""
        recent = [t for t in claims.get(who, []) if now() - t < 24 * 3600]
        if len(recent) >= CLAIMS_PER_DAY: raise HTTPException(429, "Too many names from here today. Try again tomorrow.")
        try: out = registry.claim(body.name, body.invite or None)
        except ValueError as e: raise HTTPException(422, str(e)) from None
        except LookupError: raise HTTPException(409, {"why": "taken", "suggestions": registry.suggest(body.name)}) from None
        except PermissionError as e:
            # a code that is no good counts against the day like a claim does: guessing is slower than typing
            claims[who] = recent + [now()]
            raise HTTPException(403, {"why": "invite", "message": str(e)}) from None
        claims[who] = recent + [now()]
        return out | {"relay": relay}

    class Invite(BaseModel):
        code: str

    @app.post("/houses/{name}/invite")
    def bring_invite(name: str, body: Invite, authorization: str | None = Header(default=None)):
        """An invite for a name the house already holds: set up first, handed a code after."""
        owner(name, authorization)
        recent = [t for t in wrong.get(name, []) if now() - t < 24 * 3600]
        if len(recent) >= WRONG_INVITES_PER_DAY: raise HTTPException(429, "Too many codes that didn't work today. Try again tomorrow.")
        try: registry.redeem(name, body.code)
        except PermissionError as e:
            wrong[name] = recent + [now()]
            raise HTTPException(403, {"why": "invite", "message": str(e)}) from None
        return {"name": name, "address": f"{name}.{registry.zone}", **registry.status(name), "relay": relay}

    class Ticket(BaseModel):
        ticket: str

    @app.post("/houses/{name}/carry")
    def carry(name: str, body: Ticket, authorization: str | None = Header(default=None)):
        """A paid plan elsewhere carries the house: its holder brings the payer's ticket (registry.py, Payers)."""
        owner(name, authorization)
        try: until, note = read_ticket(body.ticket, name, payers.keys(), now())
        except PermissionError as e: raise HTTPException(403, {"why": "ticket", "message": str(e)}) from None
        registry.carry(name, until, note)
        return {"name": name, "address": f"{name}.{registry.zone}", **registry.status(name), "relay": relay}

    @app.get("/houses/{name}")
    def status(name: str, authorization: str | None = Header(default=None)):
        owner(name, authorization)
        return {"name": name, "address": f"{name}.{registry.zone}", **registry.status(name), "relay": relay}

    @app.delete("/houses/{name}", status_code=204)
    def release(name: str, authorization: str | None = Header(default=None)):
        owner(name, authorization)
        registry.release(name)

    class Push(BaseModel):
        house: str
        token: str
        env: str
        sealed: str
        urgency: str
        collapse: str
        ttl: int

    @app.post("/push")
    def push(body: Push, authorization: str | None = Header(default=None)):
        """A notification a house sealed to a phone's own key, handed to Apple with Elyir's (push.py). Only a house
        that is carried, as itself, a few times a minute at most."""
        if body.house in RESERVED: raise HTTPException(404, "No house by that name holds that key.")
        owner(body.house, authorization)
        if not registry.status(body.house)["carried"]: raise HTTPException(403, "This house isn't carried by the relay.")
        why = problem(body.model_dump())
        if why: raise HTTPException(422, why)
        if not apns: raise HTTPException(503, "The sender isn't set up yet.")
        if not limit.allow(body.house): raise HTTPException(429, "Too many from this house just now.")
        status = apns.send(body.house, body.model_dump())
        tally["pushes_sent" if status == 200 else "pushes_failed"] += 1
        if status == 200: return {"sent": True}
        if status == 410: return JSONResponse({"gone": True}, status_code=410)
        if status == 429: raise HTTPException(429, "Apple asked for a pause.")
        raise HTTPException(502, "Apple didn't take it just now.")

    # ---- the house's LAN name: its certificate, proved over DNS-01 (home.py) ----
    # Shaped exactly like lego's `httpreq` DNS provider, so the hub needs a stock ACME client and nothing
    # of ours: POST {fqdn, value} with the house's name and secret as HTTP basic auth.
    def house_from_basic(authorization: str | None) -> str:
        try:
            kind, _, raw = (authorization or "").partition(" ")
            house, _, secret = base64.b64decode(raw).decode().partition(":")
            if kind.lower() == "basic" and registry.holder(house, secret): return house
        except Exception: pass
        raise HTTPException(401, "No house by that name holds that key.", headers={"WWW-Authenticate": "Basic"})

    class Challenge(BaseModel):
        fqdn: str
        value: str

    @app.post("/acme/present")
    def present(body: Challenge, authorization: str | None = Header(default=None)):
        why = home.present(house_from_basic(authorization), body.fqdn, body.value)
        if why: raise HTTPException(403, why)
        return {"ok": True}

    @app.post("/acme/cleanup")
    def cleanup(body: Challenge, authorization: str | None = Header(default=None)):
        home.cleanup(house_from_basic(authorization), body.fqdn)
        return {"ok": True}

    @app.post("/frps")
    async def plugin(request: Request):
        """frps's server plugin. Loopback only, and never anything that came through the public name."""
        host = request.client.host if request.client else ""
        if host not in ("127.0.0.1", "::1") or request.headers.get("x-forwarded-for"): raise HTTPException(404)
        body = await request.json()
        why = registry.judge(str(body.get("op") or ""), body.get("content") or {})
        if why: tally["tunnels_refused"] += 1
        return {"reject": True, "reject_reason": why} if why else {"reject": False, "unchange": True}

    return app


# The names this box carries for itself, each with the secret cloud-init derived from the relay token.
# The apps' static files are served from this box like api is (cloud-init), so they are always carried.
SEEDED = (("api", "RELAY_SELF_SECRET", "the service itself"),
          ("printers", "RELAY_PRINTERS_SECRET", "the printer app"),
          ("houses", "RELAY_HOUSES_SECRET", "the Houses app"),
          ("nearby", "RELAY_NEARBY_SECRET", "on this Wi-Fi"))


def seed_own_names(registry: Registry, env=os.environ):
    for label, var, note in SEEDED:
        if env.get(var): registry.seed(label, env[var], note=note)


def nearby_origins(zone: str, env=os.environ) -> tuple:
    """Who may read /nearby from a page: the printer app and the Houses app, and each one's dev server on its
    developer's own machine (5173 the printer app's, 5174 the Houses app's). The box sets the list itself
    (cloud-init) without the localhost ones; this default is for running the service anywhere else."""
    default = f"https://printers.{zone},https://houses.{zone},http://localhost:5173,http://localhost:5174"
    return tuple(o.strip() for o in env.get("RELAY_NEARBY_ORIGINS", default).split(",") if o.strip())


def main():
    import uvicorn
    data = Path(os.environ.get("RELAY_DATA", "/data"))
    data.mkdir(parents=True, exist_ok=True)
    registry = Registry(data / "houses.db", zone=os.environ.get("RELAY_ZONE", "elyir.app"))
    seed_own_names(registry)
    relay = {"addr": os.environ.get("RELAY_ADDR", f"relay.{registry.zone}"), "token": os.environ.get("RELAY_FRPS_TOKEN", "")}
    # The price is words, not a number: what it costs and how often, as the panel will say it.
    offer = {"open": os.environ.get("RELAY_OFFER_OPEN") == "1", "price": os.environ.get("RELAY_PRICE") or None, "pay": os.environ.get("RELAY_PAY_URL") or None}
    # proxy_headers from loopback only: Caddy is on this box and says who is really asking, so the
    # claims limit counts households rather than Caddy, and the plugin route can tell the two apart.
    home = Home(registry)
    # The address in the name (home.py): authoritative for home.<zone>, on 53 when RELAY_DNS_PORT says so.
    if os.environ.get("RELAY_DNS_PORT"):
        serve(home, ns=os.environ.get("RELAY_NS", f"ns1.{registry.zone}"), port=int(os.environ["RELAY_DNS_PORT"]))
    payers = Payers(data / "payers", os.environ.get("RELAY_PAYERS", ""))
    # The sender's key (push.py): from an env file on the box only the service reads. Without it /push answers 503.
    apns = Apns.from_env()
    uvicorn.run(make(registry, relay=relay, offer=offer, home=home, nearby_origins=nearby_origins(registry.zone), payers=payers, apns=apns, data=data),
                host="127.0.0.1", port=int(os.environ.get("RELAY_PORT", "7100")),
                proxy_headers=True, forwarded_allow_ips="127.0.0.1")


if __name__ == "__main__":
    main()
