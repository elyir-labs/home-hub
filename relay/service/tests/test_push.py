# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The sender: who may hand it something, what it checks, and what it says to Apple. Apple is faked at httpx's door,
and the key is made fresh each run, never written down."""
import base64, json, os, tempfile, unittest
from pathlib import Path

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from fastapi.testclient import TestClient

from app import make
from push import JWT_KEEP, Apns, Limit, problem, read_key
from registry import DAY, Registry


def unb64(t: str) -> bytes:
    return base64.urlsafe_b64decode(t + "=" * (-len(t) % 4))


class FakeApple:
    def __init__(self): self.calls, self.answers = [], []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        status, reason = self.answers.pop(0) if self.answers else (200, None)
        return httpx.Response(status, json={"reason": reason} if reason else None)


def body(**kw):
    return {"house": "jordan", "token": os.urandom(32).hex(), "env": "sandbox", "sealed": base64.urlsafe_b64encode(os.urandom(200)).rstrip(b"=").decode(),
            "urgency": "normal", "collapse": "a" * 32, "ttl": 3600, **kw}


class Sender(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.t = 1_790_000_000.0
        self.r = Registry(Path(self.dir.name) / "houses.db", now=lambda: self.t)
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.apple = FakeApple()
        self.apns = Apns(self.key, "KEYID12345", "TEAMID1234", client=httpx.Client(transport=httpx.MockTransport(self.apple)), now=lambda: self.t)
        self.c = TestClient(make(self.r, now=lambda: self.t, apns=self.apns))
        self.secret = self.c.post("/houses", json={"name": "jordan"}).json()["secret"]
        self.r.grant("jordan", self.t + 30 * DAY)

    def tearDown(self):
        self.r.db.close(); self.dir.cleanup()

    def push(self, client=None, secret=None, **kw):
        return (client or self.c).post("/push", json=body(**kw), headers={"Authorization": f"Bearer {secret or self.secret}"})

    # ---- who may ----
    def test_only_the_house_itself_with_its_secret(self):
        self.assertEqual(self.push(secret="a-guess").status_code, 404)
        self.assertEqual(self.c.post("/push", json=body()).status_code, 404)
        other = self.c.post("/houses", json={"name": "robin"}).json()["secret"]
        self.r.grant("robin", self.t + DAY)
        self.assertEqual(self.push(secret=other).status_code, 404, "another house's secret is not this one's")
        self.assertEqual(self.apple.calls, [])
        self.assertEqual(self.push().status_code, 200)

    def test_only_a_house_that_is_carried(self):
        self.c.post("/houses", json={"name": "robin"})
        secret = self.r.rotate("robin")
        self.assertEqual(self.push(secret=secret, house="robin").status_code, 403)
        self.r.grant("robin", self.t + DAY)
        self.assertEqual(self.push(secret=secret, house="robin").status_code, 200)
        self.t += 2 * DAY
        self.assertEqual(self.push(secret=secret, house="robin").status_code, 403)

    def test_never_the_services_own_names(self):
        self.r.seed("houses", "the-apps-own-secret", note="the Houses app")
        self.assertEqual(self.push(secret="the-apps-own-secret", house="houses").status_code, 404)

    # ---- what it checks ----
    def test_what_it_refuses_to_carry(self):
        for bad in ({"token": "ab" * 31}, {"token": "zz" * 32}, {"env": "staging"}, {"sealed": "a" * 3073}, {"sealed": "not base64!"},
                    {"sealed": ""}, {"urgency": "now"}, {"collapse": "a" * 65}, {"collapse": "a\r\nx-evil: 1"}, {"ttl": -1}, {"ttl": DAY + 1}):
            self.assertEqual(self.push(**bad).status_code, 422, bad)
        self.assertEqual(self.apple.calls, [])
        self.assertIsNone(problem(body(sealed="a" * 3072, ttl=DAY, collapse="b" * 64)))

    def test_with_no_key_it_says_it_is_not_set_up(self):
        c = TestClient(make(self.r, now=lambda: self.t))
        r = self.push(client=c)
        self.assertEqual(r.status_code, 503)
        self.assertEqual(self.push(client=c, secret="a-guess").status_code, 404, "still nothing to a stranger")

    def test_a_house_is_slowed_down(self):
        for _ in range(10): self.assertEqual(self.push().status_code, 200)
        self.assertEqual(self.push().status_code, 429)
        self.t += 61
        for _ in range(10): self.push()
        self.t += 61
        for _ in range(10): self.push()
        self.t += 61
        for _ in range(10): self.push()
        self.t += 61
        for _ in range(10): self.push()
        self.t += 61
        for _ in range(10): self.assertEqual(self.push().status_code, 200)
        self.t += 61
        self.assertEqual(self.push().status_code, 429, "sixty in the hour")
        self.assertEqual(len(self.apple.calls), 60)
        self.t += 3600
        self.assertEqual(self.push().status_code, 200)

    def test_one_house_slowed_down_is_not_another(self):
        limit = Limit(per_minute=1, per_hour=5, now=lambda: self.t)
        self.assertTrue(limit.allow("jordan")); self.assertFalse(limit.allow("jordan")); self.assertTrue(limit.allow("robin"))

    # ---- what Apple is told ----
    def test_apple_is_handed_the_sealed_thing_and_a_fixed_sentence(self):
        sent = body(urgency="high", ttl=600)
        r = self.c.post("/push", json=sent, headers={"Authorization": f"Bearer {self.secret}"})
        self.assertEqual((r.status_code, r.json()), (200, {"sent": True}))
        [req] = self.apple.calls
        self.assertEqual(str(req.url), f"https://api.sandbox.push.apple.com/3/device/{sent['token']}")
        h = req.headers
        self.assertEqual((h["apns-topic"], h["apns-push-type"], h["apns-priority"], h["apns-collapse-id"]), ("app.elyir.houses", "alert", "10", "a" * 32))
        self.assertEqual(h["apns-expiration"], str(int(self.t) + 600))
        self.assertTrue(h["authorization"].startswith("bearer "))
        self.assertEqual(json.loads(req.content), {"aps": {"alert": {"title": "Houses", "body": "One of your houses needs a look."}, "mutable-content": 1,
                                                           "thread-id": "jordan"}, "h": "jordan", "s": sent["sealed"]})

    def test_normal_is_quiet_and_production_is_apples_own(self):
        self.push(env="production")
        req = self.apple.calls[0]
        self.assertEqual(req.url.host, "api.push.apple.com")
        self.assertEqual(req.headers["apns-priority"], "5")

    def test_apples_answers_as_the_house_hears_them(self):
        cases = [((410, "Unregistered"), 410), ((400, "BadDeviceToken"), 410), ((400, "DeviceTokenNotForTopic"), 410),
                 ((429, "TooManyRequests"), 429), ((400, "PayloadTooLarge"), 502), ((500, "InternalServerError"), 502), ((503, None), 502)]
        for apple, house in cases:
            self.apple.answers = [apple]
            r = self.push()
            self.assertEqual(r.status_code, house, apple)
            if house == 410: self.assertEqual(r.json(), {"gone": True})

    def test_apple_not_answering_is_a_502(self):
        def down(request): raise httpx.ConnectError("no route")
        apns = Apns(self.key, "KEYID12345", "TEAMID1234", client=httpx.Client(transport=httpx.MockTransport(down)), now=lambda: self.t)
        self.assertEqual(self.push(client=TestClient(make(self.r, now=lambda: self.t, apns=apns))).status_code, 502)

    # ---- the provider token ----
    def test_the_provider_token_is_es256_signed_by_the_key_and_kept_under_an_hour(self):
        token = self.apns.jwt()
        head, claims, sig = token.split(".")
        self.assertEqual(json.loads(unb64(head)), {"alg": "ES256", "kid": "KEYID12345"})
        self.assertEqual(json.loads(unb64(claims)), {"iss": "TEAMID1234", "iat": int(self.t)})
        raw = unb64(sig)
        self.assertEqual(len(raw), 64)
        der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
        self.key.public_key().verify(der, f"{head}.{claims}".encode(), ec.ECDSA(hashes.SHA256()))   # raises if not
        self.t += JWT_KEEP - 1
        self.assertEqual(self.apns.jwt(), token)
        self.t += 2
        self.assertNotEqual(self.apns.jwt(), token)
        self.assertLessEqual(JWT_KEEP, 50 * 60)

    def test_a_token_apple_refuses_is_made_again(self):
        first = self.apns.jwt()
        self.t += 60
        self.apple.answers = [(403, "ExpiredProviderToken")]
        self.assertEqual(self.push().status_code, 502)
        self.assertNotEqual(self.apns.jwt(), first)

    # ---- the key, as the box hands it over ----
    def test_the_key_from_the_box_as_pem_or_one_line(self):
        pem = self.key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
        self.assertEqual(read_key(pem).private_numbers(), self.key.private_numbers())
        self.assertEqual(read_key(base64.b64encode(pem.encode()).decode()).private_numbers(), self.key.private_numbers())
        env = {"RELAY_APNS_KEY": base64.b64encode(pem.encode()).decode(), "RELAY_APNS_KEY_ID": "KEYID12345", "RELAY_APNS_TEAM_ID": "TEAMID1234"}
        self.assertIsNotNone(Apns.from_env(env, client=httpx.Client(transport=httpx.MockTransport(self.apple))))
        for missing in env: self.assertIsNone(Apns.from_env({**env, missing: ""}), missing)
        self.assertIsNone(Apns.from_env({}))


class TheBox(unittest.TestCase):
    """The key reaches the service in a file only root reads, and never on the command line the unit shows."""
    def test_the_key_is_an_env_file_the_service_reads(self):
        text = (Path(__file__).resolve().parents[2] / "terraform" / "cloud-init.yaml.tftpl").read_text()
        block = text[text.index("- path: /etc/relay/apns.env"):]
        self.assertIn("permissions: '0600'", block[:200])
        self.assertIn("RELAY_APNS_KEY=${apns_key_b64}", block)
        self.assertIn("--env-file /etc/relay/apns.env", text)
        self.assertNotIn("-e RELAY_APNS", text)


if __name__ == "__main__":
    unittest.main()
