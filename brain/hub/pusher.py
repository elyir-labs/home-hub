# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Telling a phone that is not looking. docs/messages.md, Order step 5.

Needs a look says what is wrong to whoever is standing at a screen. This says it once more, to the phones
of the people who can put it right, at the moment it starts being true: a line that was not there on the
last look is sent, a line that stays is not sent again, and a line that goes and later comes back is news
again. Only `attention` and `alert` ever leave the house; the class decides that, never the call site.
A line has to be there on two looks in a row before it is sent, so a thing that is gone for a moment while
the engine restarts, or the hub does, never reaches anybody's pocket.

Each phone signs with its own key, the one it handed every house it joined (docs/apps.md, Decided), so a
phone with three houses holds one subscription. Apple, Google and Mozilla carry a message they cannot
read; what they see is that a house sent something to a phone, and when, which is why the house stays
quiet: overnight, in the phone's own time zone, an `attention` line waits for seven in the morning.

A phone in the store app has no web push. It hands each house its APNs token and a key of its own instead,
and the house seals the same payload to that key (RFC 8291, as web push does) and hands it to the sender
Elyir runs beside the relay, proving itself with the secret it already holds for the relay. The sender and
Apple see that a house sent a phone something, and when, never what. A house with no web address holds no
such secret, so its store-app phones stay recorded and are told nothing until it has one.
"""
import asyncio, base64, hashlib, json, logging, os, re, time, urllib.error, urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

from . import address
from .phones import holds_keys

log = logging.getLogger("hub.pusher")

# Sent to the push services on every message, so it names the maker and never the household.
SUBJECT = "https://hub.elyir.com"
TTL = 12 * 3600
URGENCY = {"attention": "normal", "alert": "high"}
QUIET = (22, 7)
GONE = (404, 410)
APNS_TOKEN = re.compile(r"^[0-9a-fA-F]{64,200}$")
B64URL = re.compile(r"^[A-Za-z0-9_-]+=*$")
ENVS = ("sandbox", "production")
NEEDS_ADDRESS = "This house needs its web address to tell this phone."


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def unb64(text: str) -> bytes:
    if not B64URL.match(text or ""): raise ValueError("not base64url")
    return base64.urlsafe_b64decode(text.rstrip("=") + "=" * (-len(text.rstrip("=")) % 4))


def public_of(private_b64: str) -> str:
    """The public half of a phone's signing key: the raw P-256 secret, base64url, as the phone sends it."""
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid02
    key = Vapid02.from_raw(private_b64.encode()).public_key
    return b64(key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))


def zone(name) -> str | None:
    """An IANA zone the hub knows, or None."""
    if not isinstance(name, str) or not name or len(name) > 64: return None
    try: ZoneInfo(name)
    except Exception: return None
    return name


def checked_apns(apns: dict) -> dict:
    """A store-app phone's way of being told things: its APNs token, and the key the house seals to."""
    token, env = str(apns.get("token") or ""), str(apns.get("env") or "")
    try:
        point, auth = unb64(str(apns.get("p256dh") or "")), unb64(str(apns.get("auth") or ""))
        from cryptography.hazmat.primitives.asymmetric import ec
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), point)
        ok = len(point) == 65 and point[0] == 4 and len(auth) == 16
    except Exception:
        ok = False
    if not ok or not APNS_TOKEN.match(token) or env not in ENVS: raise ValueError("That isn't a way to reach this phone.")
    return {"token": token.lower(), "env": env, "p256dh": b64(point), "auth": b64(auth)}


def checked(body: dict, now: float) -> dict:
    """What a phone sent to be told things, as its record keeps it. ValueError names what is wrong."""
    if isinstance(body.get("apns"), dict):
        return {"apns": checked_apns(body["apns"]), "tz": zone(body.get("tz")), "since": now}
    sub = body.get("subscription") if isinstance(body.get("subscription"), dict) else {}
    keys = sub.get("keys") if isinstance(sub.get("keys"), dict) else {}
    endpoint = str(sub.get("endpoint") or "")
    if not endpoint.startswith("https://") or not keys.get("p256dh") or not keys.get("auth"):
        raise ValueError("That isn't a way to reach this phone.")
    vapid = body.get("vapid") if isinstance(body.get("vapid"), dict) else {}
    try: ok = public_of(str(vapid["privateKey"])) == str(vapid["publicKey"]).rstrip("=")
    except Exception: ok = False
    if not ok: raise ValueError("This phone's key doesn't match itself.")
    return {"subscription": {"endpoint": endpoint, "keys": {"p256dh": str(keys["p256dh"]), "auth": str(keys["auth"])}},
            "vapid": {"publicKey": str(vapid["publicKey"]), "privateKey": str(vapid["privateKey"])},
            "tz": zone(body.get("tz")), "since": now}


def send(subscription: dict, data: str, headers: dict, ttl: int, private_key: str) -> int:
    """One push, signed with the phone's own key. The push service's answer, or 0 if there was none."""
    from py_vapid import Vapid02
    from pywebpush import WebPushException, webpush
    try:
        r = webpush(subscription_info=subscription, data=data, vapid_private_key=Vapid02.from_raw(private_key.encode()),
                    vapid_claims={"sub": SUBJECT}, ttl=ttl, headers=headers, timeout=15)
        return r.status_code
    except WebPushException as e:
        return e.response.status_code if e.response is not None else 0


def seal(data: str, p256dh: str, auth: str) -> str:
    """The payload encrypted to the phone's key exactly as web push encrypts it (RFC 8291, aes128gcm), base64url."""
    import http_ece
    from cryptography.hazmat.primitives.asymmetric import ec
    return b64(http_ece.encrypt(data.encode(), private_key=ec.generate_private_key(ec.SECP256R1()), dh=unb64(p256dh),
                                auth_secret=unb64(auth), version="aes128gcm"))


def hand(body: dict, secret: str) -> int:
    """One sealed notification to the sender, as the house it is. The sender's answer, or 0 if there was none."""
    req = urllib.request.Request(address.API.rstrip("/") + "/push", method="POST", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "home-hub", "Authorization": f"Bearer {secret}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:   # noqa: S310 -- the maker's own https API
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0


def key(line: dict) -> str:
    return f"{line['id']}|{line.get('subject') or ''}"


class Pusher:
    def __init__(self, hub, sender=send, hand=hand, now=time.time):
        self.hub, self.sender, self.hand, self.now = hub, sender, hand, now
        self.told_once: set[str] = set()
        self.path = hub.phones.path.with_name("pushed.json")
        try:
            d = json.loads(self.path.read_text())
            self.seen: set[str] | None = set(d["seen"])
            self.pending: set[str] = set(d.get("pending") or ())    # there on the last look, not yet sent
            self.held: list[dict] = list(d.get("held") or [])
        except Exception:
            self.seen, self.pending, self.held = None, set(), []

    def _save(self):
        try:
            tmp = self.path.with_suffix(".tmp")
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f: json.dump({"seen": sorted(self.seen or ()), "pending": sorted(self.pending), "held": self.held}, f)
            os.replace(tmp, self.path)
        except OSError:
            log.warning("push: could not keep what was sent", exc_info=True)

    def listeners(self) -> list[dict]:
        return [p for p in self.hub.phones.data if p.get("push") and holds_keys(p)]

    def quiet(self, p: dict) -> bool:
        tz = zone(p["push"].get("tz"))
        hour = datetime.fromtimestamp(self.now(), ZoneInfo(tz) if tz else self.hub.tz).hour
        return hour >= QUIET[0] or hour < QUIET[1]

    def house(self) -> str:
        return self.hub.settings.get("home_name") or "Home"

    def label(self) -> str | None:
        """The house's label in the zone (`jordan` of jordan.elyir.app): how the phone finds its own name for the house."""
        return self.hub.address.house()

    async def look(self) -> int:
        """Once a tick: what is new on Needs a look goes to every phone that can act on it. Never raises."""
        try:
            lines = {}
            for n in self.hub.health.notes():
                if n.get("id") and n.get("class") in URGENCY: lines.setdefault(key(n), n)
            before = (self.seen, set(self.pending), list(self.held))
            if self.seen is None:
                self.seen, self.pending = set(lines), set()
                self._save()
                return 0
            new = {k for k in lines if k not in self.seen}
            settled = new & self.pending
            self.seen = (self.seen & set(lines)) | settled
            self.pending = new - settled
            self.held = [h for h in self.held if h["key"] in lines]
            for k in sorted(settled): self._queue(lines[k])
            sent = await self.flush()
            if (self.seen, self.pending, self.held) != before: self._save()
            return sent
        except Exception:
            log.exception("push: looking for news")
            return 0

    def _queue(self, line: dict):
        now, house = self.now(), self.house()
        # Every house a phone joined shares its one subscription, so the tag says whose house it is.
        tag = f"{house}|{key(line)}"
        payload = {"id": line["id"], "class": line["class"], "text": line.get("text") or "", "subject": line.get("subject"),
                   "house": house, "label": self.label(), "at": now, "tag": tag}
        topic = b64(hashlib.sha256(tag.encode()).digest())[:32]   # Topic is at most 32 base64url characters
        for p in self.listeners():
            self.held = [h for h in self.held if not (h["phone"] == p["id"] and h["topic"] == topic)]
            self.held.append({"phone": p["id"], "key": key(line), "topic": topic, "urgency": URGENCY[line["class"]],
                              "payload": payload, "expires": now + TTL})

    async def flush(self) -> int:
        """Send what is waiting, unless it is night where that phone is. An alert never waits."""
        sent, keep = 0, []
        for h in self.held:
            p = self.hub.phones.get(h["phone"])
            if not p or not p.get("push") or h["expires"] <= self.now(): continue
            if h["urgency"] != "high" and self.quiet(p):
                keep.append(h); continue
            done, again = await (self._hand(p, h) if p["push"].get("apns") else self._deliver(p, h))
            sent += done
            if again: keep.append(h)
        self.held = keep
        return sent

    def _once(self, what: str, message: str):
        if what not in self.told_once:
            self.told_once.add(what)
            log.info(message)

    async def _hand(self, p: dict, h: dict) -> tuple[int, bool]:
        """A store-app phone, through the sender. (sent, try again on the next look)."""
        house, secret = self.label(), self.hub.address.secret()
        if not house or not secret:
            self._once("address", "push: this house has no web address, so phones in the store app are not told yet")
            return 0, False
        apns = p["push"]["apns"]
        try:
            body = {"house": house, "token": apns["token"], "env": apns["env"], "sealed": seal(json.dumps(h["payload"]), apns["p256dh"], apns["auth"]),
                    "urgency": h["urgency"], "collapse": h["topic"], "ttl": max(0, int(h["expires"] - self.now()))}
            status = await asyncio.to_thread(self.hand, body, secret)
        except Exception:
            log.info("push: the sender could not be reached for %s", p.get("name"), exc_info=True)
            return 0, True
        if 200 <= status < 300:
            self.told_once.discard("sender")
            return 1, False
        if status == 410:
            log.info("push: %s's app is gone, dropping it", p.get("name"))
            self.hub.phones.set_push(p["id"], None)
            return 0, False
        if status in (404, 503):   # 404: a relay box from before the sender, which answers no /push at all
            self._once("sender", "push: the sender is not set up to reach phones in the store app yet")
            return 0, False
        log.info("push: the sender answered %s for %s; trying again on the next look", status, p.get("name"))
        return 0, True

    async def _deliver(self, p: dict, h: dict) -> tuple[int, bool]:
        push = p["push"]
        headers = {"Urgency": h["urgency"], "Topic": h["topic"]}
        ttl = max(0, int(h["expires"] - self.now()))
        try:
            status = await asyncio.to_thread(self.sender, push["subscription"], json.dumps(h["payload"]), headers, ttl,
                                             (push.get("vapid") or {}).get("privateKey"))
        except Exception:
            log.warning("push: %s could not be reached", p.get("name"), exc_info=True)
            return 0, False
        if status in GONE:
            log.info("push: %s's subscription is gone, dropping it", p.get("name"))
            self.hub.phones.set_push(p["id"], None)
            return 0, False
        if not 200 <= status < 300:
            log.warning("push: %s answered %s", p.get("name"), status)
            return 0, False
        return 1, False
