# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The sender: a house's notification to a phone in the store app, through Apple (docs/apps.md, Decided 19 October).

A web view inside an app has no web push, and APNs takes only notifications signed with Elyir's own key, which
cannot sit on every house. So the key sits here, and a house hands over a notification it has already sealed to
a key only the phone holds (RFC 8291, as web push is sealed), with the phone's APNs token. The app's Notification
Service Extension opens it on the phone. Apple and this service see that a house sent a phone something, and
when, never what: the alert below is the same fixed sentence for everybody, and the house's words are inside `s`.

Nothing is kept: no token, no sealed body, no log of either. With no key configured every request is answered
503 and the house keeps the phone for when there is one.
"""
import base64, json, os, re, threading, time

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

TOPIC = "app.elyir.houses"
HOSTS = {"sandbox": "https://api.sandbox.push.apple.com", "production": "https://api.push.apple.com"}
JWT_KEEP = 50 * 60              # Apple refuses a token older than an hour, and one made more often than every 20 minutes
ALERT = {"title": "Houses", "body": "One of your houses needs a look."}
TOKEN = re.compile(r"^[0-9a-fA-F]{64,200}$")
SEALED = re.compile(r"^[A-Za-z0-9_-]{1,3072}$")
COLLAPSE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
MAX_TTL = 24 * 3600
GONE = {"BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"}


def problem(body: dict) -> str | None:
    """Why this cannot be sent, or None."""
    if not TOKEN.match(str(body.get("token") or "")): return "token must be the phone's APNs token, in hex"
    if body.get("env") not in HOSTS: return "env must be sandbox or production"
    if not SEALED.match(str(body.get("sealed") or "")): return "sealed must be base64url, at most 3 KB"
    if body.get("urgency") not in ("normal", "high"): return "urgency must be normal or high"
    if not COLLAPSE.match(str(body.get("collapse") or "")): return "collapse must be at most 64 base64url characters"
    ttl = body.get("ttl")
    if not isinstance(ttl, int) or isinstance(ttl, bool) or not 0 <= ttl <= MAX_TTL: return "ttl must be seconds, at most a day"
    return None


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def read_key(text: str):
    """The .p8 Apple hands out, as PEM, or as base64 of the PEM (which fits on one line of an env file)."""
    raw = text.strip().encode()
    if b"BEGIN" not in raw: raw = base64.b64decode(raw)
    return serialization.load_pem_private_key(raw, password=None)


class Apns:
    def __init__(self, key, key_id: str, team_id: str, client: httpx.Client | None = None, now=time.time):
        self.key, self.key_id, self.team_id, self.now = key, key_id, team_id, now
        self.client = client or httpx.Client(http2=True, timeout=15)
        self._jwt: tuple[float, str] | None = None
        self._lock = threading.Lock()

    @classmethod
    def from_env(cls, env=os.environ, **kw) -> "Apns | None":
        """None unless all three are set: RELAY_APNS_KEY, RELAY_APNS_KEY_ID, RELAY_APNS_TEAM_ID."""
        key, key_id, team_id = (env.get(k, "").strip() for k in ("RELAY_APNS_KEY", "RELAY_APNS_KEY_ID", "RELAY_APNS_TEAM_ID"))
        if not (key and key_id and team_id): return None
        return cls(read_key(key), key_id, team_id, **kw)

    def jwt(self) -> str:
        with self._lock:
            if self._jwt and self.now() - self._jwt[0] < JWT_KEEP: return self._jwt[1]
            iat = int(self.now())
            head = _b64(json.dumps({"alg": "ES256", "kid": self.key_id}, separators=(",", ":")).encode())
            claims = _b64(json.dumps({"iss": self.team_id, "iat": iat}, separators=(",", ":")).encode())
            r, s = decode_dss_signature(self.key.sign(f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256())))
            token = f"{head}.{claims}.{_b64(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"
            self._jwt = (iat, token)
            return token

    def forget_jwt(self):
        with self._lock: self._jwt = None

    def send(self, house: str, body: dict) -> int:
        """Hand one sealed notification to Apple. What the house is answered: 200, 410 gone, 429, or 502."""
        headers = {"authorization": f"bearer {self.jwt()}", "apns-topic": TOPIC, "apns-push-type": "alert",
                   "apns-priority": "10" if body["urgency"] == "high" else "5",
                   "apns-expiration": str(int(self.now()) + body["ttl"]), "apns-collapse-id": body["collapse"]}
        payload = {"aps": {"alert": ALERT, "mutable-content": 1, "thread-id": house}, "h": house, "s": body["sealed"]}
        try:
            r = self.client.post(f"{HOSTS[body['env']]}/3/device/{body['token']}", headers=headers,
                                 content=json.dumps(payload, separators=(",", ":")).encode())
        except httpx.HTTPError:
            return 502
        try: reason = (r.json() or {}).get("reason", "")
        except ValueError: reason = ""
        if r.status_code == 200: return 200
        if r.status_code == 410 or (r.status_code == 400 and reason in GONE): return 410
        if r.status_code == 429: return 429
        if r.status_code == 403 and reason in ("ExpiredProviderToken", "InvalidProviderToken"): self.forget_jwt()
        return 502


class Limit:
    """How often one house may hand something over. In memory: a restart forgets it, which costs a burst at most."""
    def __init__(self, per_minute: int = 10, per_hour: int = 60, now=time.time):
        self.per_minute, self.per_hour, self.now = per_minute, per_hour, now
        self.sent: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, house: str) -> bool:
        with self._lock:
            t = self.now()
            recent = [s for s in self.sent.get(house, []) if t - s < 3600]
            if len(recent) >= self.per_hour or sum(t - s < 60 for s in recent) >= self.per_minute:
                self.sent[house] = recent
                return False
            self.sent[house] = recent + [t]
            return True
