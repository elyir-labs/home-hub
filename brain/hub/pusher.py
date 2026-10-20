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
"""
import asyncio, base64, hashlib, json, logging, os, time
from datetime import datetime
from zoneinfo import ZoneInfo

from .phones import holds_keys

log = logging.getLogger("hub.pusher")

# Sent to the push services on every message, so it names the maker and never the household.
SUBJECT = "https://hub.elyir.com"
TTL = 12 * 3600
URGENCY = {"attention": "normal", "alert": "high"}
QUIET = (22, 7)
GONE = (404, 410)


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


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


def checked(body: dict, now: float) -> dict:
    """What a phone sent to be told things, as its record keeps it. ValueError names what is wrong."""
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


def key(line: dict) -> str:
    return f"{line['id']}|{line.get('subject') or ''}"


class Pusher:
    def __init__(self, hub, sender=send, now=time.time):
        self.hub, self.sender, self.now = hub, sender, now
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
            sent += await self._deliver(p, h)
        self.held = keep
        return sent

    async def _deliver(self, p: dict, h: dict) -> int:
        push = p["push"]
        headers = {"Urgency": h["urgency"], "Topic": h["topic"]}
        ttl = max(0, int(h["expires"] - self.now()))
        try:
            status = await asyncio.to_thread(self.sender, push["subscription"], json.dumps(h["payload"]), headers, ttl,
                                             (push.get("vapid") or {}).get("privateKey"))
        except Exception:
            log.warning("push: %s could not be reached", p.get("name"), exc_info=True)
            return 0
        if status in GONE:
            log.info("push: %s's subscription is gone, dropping it", p.get("name"))
            self.hub.phones.set_push(p["id"], None)
            return 0
        if not 200 <= status < 300:
            log.warning("push: %s answered %s", p.get("name"), status)
            return 0
        return 1
