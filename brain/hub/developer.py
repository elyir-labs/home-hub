# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""For working on the hub (design/developer/, B): what it follows, SSH, and the screens in the house.

A page nobody running a house needs. It is on This house by default only when the hub is not on
releases, because a hub flashed from a branch or set to development is one somebody is working on; on a
release hub it is put there by hand and taken away again.

Nothing here touches the machine. What the hub follows and whether SSH is on go out the way an update
does, as a file the host is watching (host/developer.sh), and each file carries **state, never a
command**: a channel name, or the whole set of keys that may sign in. The host checks both again against
rules of its own before it does anything, and says what it actually did in ssh.json, which is what the
page reports. A brain that could open SSH by itself would be one bad request from a shell in the house.

Screens report in from their own unit (startup/screen-report.sh), once a minute. The unit has no phone
cookie -- that lives in the browser on its wall -- so it names itself with a random id and a key of its
own, and the first key a unit gives is the one it must give after. Anything on the Wi-Fi could add a row;
nothing it says can choose what a screen runs, because a screen's update only ever moves to its hub's
release, checked, or along its own branch (startup/screen-update.sh).
"""
import base64, binascii, hashlib, hmac, json, logging, os, re, socket, struct, time, urllib.error, urllib.parse, urllib.request

from . import updates as updates_mod
from .settings import DATA

log = logging.getLogger("hub.developer")

CHANNEL_REQUEST = DATA / "channel.request"   # host/developer.sh is watching for these two
SSH_REQUEST = DATA / "ssh.request"
SSH_STATE = DATA / "ssh.json"                # ...and writes this back, saying what it did
SCREENS = DATA / "screens.json"

NAMED = ("release", "main", "development")
BRANCH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$")   # host/developer.sh holds the same rule
GITHUB_USER = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
KEY_TYPES = ("ssh-ed25519", "ecdsa-sha2-nistp256", "ecdsa-sha2-nistp384", "ecdsa-sha2-nistp521", "ssh-rsa",
             "sk-ssh-ed25519@openssh.com", "sk-ecdsa-sha2-nistp256@openssh.com")
RSA_BITS = 3072
MAX_KEYS = 20
MAX_SCREENS = 16
UNIT = re.compile(r"^[0-9a-f]{16,64}$")
FORGET_AFTER = 30 * 86400      # a screen unheard from for a month has left the house
SAVE_EVERY = 600               # how often a screen's last-seen alone is worth a write
CACHE = 600                    # how long an answer from GitHub about a branch is kept
REPORT_EVERY = 60              # what startup/elyir-screen-report.timer runs at; three misses is not answering


def branch_ok(name: str) -> bool:
    return bool(BRANCH.match(name)) and ".." not in name and "//" not in name and not name.endswith(("/", ".", ".lock"))


def parse_key(line: str) -> dict:
    """One authorized_keys line, checked: a type we allow, a body that decodes and names that type, a short comment."""
    parts = (line or "").strip().split(None, 2)
    if len(parts) < 2: raise ValueError("That doesn't look like a public key. It starts with ssh-ed25519 or similar.")
    kind, body = parts[0], parts[1]
    comment = parts[2].strip() if len(parts) > 2 else ""
    if kind not in KEY_TYPES: raise ValueError(f"{kind[:30]} keys aren't accepted. Use an ed25519 key.")
    try: blob = base64.b64decode(body, validate=True)
    except (binascii.Error, ValueError): raise ValueError("That key is cut short or has something extra in it.")
    if _string(blob, 0)[0] != kind.encode(): raise ValueError("That key's body doesn't match its type.")
    if kind == "ssh-rsa" and _rsa_bits(blob) < RSA_BITS:
        raise ValueError(f"That RSA key is too short. Use an ed25519 key, or RSA of at least {RSA_BITS} bits.")
    if len(comment) > 100 or any(ord(c) < 32 or ord(c) > 126 for c in comment):
        raise ValueError("That key's comment is too long or has odd characters in it.")
    fp = "SHA256:" + base64.b64encode(hashlib.sha256(blob).digest()).decode().rstrip("=")
    return {"line": f"{kind} {body}" + (f" {comment}" if comment else ""), "type": kind, "fingerprint": fp, "name": comment}


def _string(blob: bytes, at: int) -> tuple[bytes, int]:
    if at + 4 > len(blob): raise ValueError("That key is cut short.")
    n = struct.unpack(">I", blob[at:at + 4])[0]
    if at + 4 + n > len(blob): raise ValueError("That key is cut short.")
    return blob[at + 4:at + 4 + n], at + 4 + n


def _rsa_bits(blob: bytes) -> int:
    _, at = _string(blob, 0)
    _, at = _string(blob, at)          # the exponent
    n, _ = _string(blob, at)
    return int.from_bytes(n, "big").bit_length()


def _get_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "home-hub"})
    with urllib.request.urlopen(req, timeout=15) as r: return r.read(65536).decode("utf-8", "replace")


def _address() -> str:
    """The address phones reach this hub on: the interface the default route leaves by. Nothing is sent."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("192.0.2.1", 9)); return s.getsockname()[0]
    except OSError: return ""


class Developer:
    def __init__(self, hub):
        self.hub = hub
        self.screens: dict[str, dict] = {}
        self._saved = 0.0
        self._cache: dict[str, tuple[float, object]] = {}
        self._screen_ips: dict[str, str] = {}       # phone id of a joined screen -> the address its wall asks from
        try: self.screens = json.loads(SCREENS.read_text()).get("screens") or {}
        except Exception: self.screens = {}

    # ---------- shown or not ----------
    @property
    def shown(self) -> bool:
        v = self.hub.settings.get("developer_page")
        return self.hub.updates.channel != "release" if v is None else bool(v)

    def show(self, on: bool) -> dict:
        self.hub.settings.set(developer_page=bool(on))
        return self.summary()

    # ---------- what it follows ----------
    def choose_channel(self, channel: str) -> dict:
        channel = (channel or "").strip()
        if channel.lower() in NAMED: channel = channel.lower()
        elif not branch_ok(channel): raise ValueError("That isn't a branch name.")
        else:
            try: updates_mod._get(f"https://api.github.com/repos/{updates_mod.REPO}/branches/{urllib.parse.quote(channel, safe='')}")
            except urllib.error.HTTPError as e:
                if e.code == 404: raise ValueError(f"There is no branch called {channel} on GitHub.")
                raise ValueError("GitHub didn't answer, so that branch couldn't be checked. Try again in a minute.")
            except Exception:
                raise ValueError("GitHub didn't answer, so that branch couldn't be checked. Try again in a minute.")
        self.hub.settings.set(developer_channel=channel)
        CHANNEL_REQUEST.write_text(json.dumps({"at": time.time(), "channel": channel}))
        log.info("asked the host to follow %s", channel)
        return self.summary()

    def requested_channel(self) -> str | None:
        want = self.hub.settings.get("developer_channel")
        return want if want and want != self.hub.updates.channel else None

    def behind(self) -> int | None:
        u = self.hub.updates
        if not (u.follows_branch and u.commit): return None
        def ask():
            d = updates_mod._get(f"https://api.github.com/repos/{updates_mod.REPO}/compare/{u.commit}...{urllib.parse.quote(u.channel, safe='')}")
            return int(d.get("ahead_by")) if d.get("ahead_by") is not None else None
        return self._cached(f"behind:{u.channel}:{u.commit}", ask)

    # ---------- SSH ----------
    def _wanted(self) -> dict:
        w = self.hub.settings.get("developer_ssh") or {}
        return {"on": bool(w.get("on")), "keys": list(w.get("keys") or [])}

    def _want(self, on: bool, keys: list) -> None:
        self.hub.settings.set(developer_ssh={"on": on, "keys": keys})
        SSH_REQUEST.write_text(json.dumps({"at": time.time(), "on": on, "keys": [k["line"] for k in keys]}))

    def add_keys(self, lines: list, source: str) -> dict:
        source = str(source or "pasted")
        user = source.split(":", 1)[1] if source.startswith("github:") else ""
        if source != "pasted" and not (user and GITHUB_USER.match(user)): raise ValueError("Keys come pasted or from a GitHub username.")
        w = self._wanted(); have = {k["fingerprint"] for k in w["keys"]}
        if not lines: raise ValueError("There was no key in that.")
        for line in lines:
            k = parse_key(str(line))
            if k["fingerprint"] in have: continue
            k.update(name=k["name"] or (f"{user} on GitHub" if user else k["type"]), added=int(time.time()), source=source)
            w["keys"].append(k); have.add(k["fingerprint"])
        if len(w["keys"]) > MAX_KEYS: raise ValueError(f"That would be more than {MAX_KEYS} keys.")
        self._want(w["on"], w["keys"])
        return self.summary()

    def remove_key(self, fingerprint: str) -> dict:
        w = self._wanted()
        keys = [k for k in w["keys"] if k["fingerprint"] != fingerprint]
        if len(keys) == len(w["keys"]): raise KeyError(fingerprint)
        self._want(w["on"] and bool(keys), keys)
        return self.summary()

    def set_ssh(self, on: bool) -> dict:
        w = self._wanted()
        if on and not w["keys"]: raise ValueError("Add a key first. With none, nothing could sign in.")
        self._want(bool(on), w["keys"])
        return self.summary()

    def github_keys(self, user: str) -> list:
        if not GITHUB_USER.match(user or ""): raise ValueError("That isn't a GitHub username.")
        try: text = _get_text(f"https://github.com/{user}.keys")
        except urllib.error.HTTPError as e:
            if e.code == 404: raise ValueError(f"GitHub has no one called {user}.")
            raise ValueError("GitHub didn't answer. Try again in a minute.")
        except Exception: raise ValueError("GitHub didn't answer. Try again in a minute.")
        out = []
        for line in text.splitlines():
            try: k = parse_key(line)
            except ValueError: continue
            out.append({"line": k["line"], "type": k["type"], "fingerprint": k["fingerprint"], "name": f"{user} on GitHub"})
        if not out: raise ValueError(f"{user} has no keys on GitHub that this hub accepts.")
        return out

    def ssh(self) -> dict:
        w = self._wanted()
        try: did = json.loads(SSH_STATE.read_text())
        except Exception: did = {}
        done_on = bool(did.get("on"))
        wanted = (w["on"], sorted(k["line"] for k in w["keys"]) if w["on"] else [])
        done = (done_on, sorted(did.get("keys") or []) if done_on else [])
        # Until somebody asks for something here, SSH is however the card was flashed, and nothing is waiting.
        asked = self.hub.settings.get("developer_ssh") is not None
        pending = SSH_REQUEST.exists() or (asked and wanted != done)
        keys = [{k: key.get(k) for k in ("name", "type", "fingerprint", "added", "source")} for key in w["keys"]]
        return {"on": done_on, "user": did.get("user") or "pi", "host": f"{socket.gethostname().split('.')[0]}.local",
                "ip": _address(), "keys": keys, "pending": bool(pending)}

    # ---------- screens ----------
    def saw_screen(self, phone: dict, ip: str) -> None:
        """A joined screen's wall made a request: remember where from, so its unit's reports get its name."""
        if ip: self._screen_ips[phone["id"]] = ip

    def report(self, body: dict, ip: str) -> dict:
        unit = str(body.get("unit") or ""); key = str(body.get("key") or "")
        if not UNIT.match(unit) or len(key) < 32: raise ValueError("unit")
        hashed = hashlib.sha256(key.encode()).hexdigest()
        s = self.screens.get(unit)
        if s is None:
            self._forget_old()
            if len(self.screens) >= MAX_SCREENS: raise ValueError("full")
            s = self.screens[unit] = {"key": hashed, "update": False}
        elif not hmac.compare_digest(s.get("key") or "", hashed): raise PermissionError(unit)
        clean = lambda k, n=100: re.sub(r"[^\w.:/@+ -]", "", str(body.get(k) or ""))[:n]
        now = time.time()
        fields = {"host": clean("host", 64), "ip": ip, "version": clean("version"), "commit": clean("commit", 40).lower(),
                  "channel": clean("channel"), "updating": bool(body.get("updating"))}
        changed = any(s.get(k) != v for k, v in fields.items() if k != "updating")
        s.update(fields, seen=now)
        if not s["updating"] and s.get("asked") and now - s["asked"] > 60: s.pop("asked", None)
        wants, s["update"] = bool(s.get("update")), False
        if wants: s["asked"] = now
        if changed or wants or now - self._saved > SAVE_EVERY: self._save()
        return {"update": wants}

    def update_screen(self, unit: str | None) -> dict:
        targets = [unit] if unit else list(self.screens)
        if unit and unit not in self.screens: raise KeyError(unit)
        for u in targets: self.screens[u]["update"] = True
        self._save()
        return self.summary()

    def _forget_old(self) -> None:
        now = time.time()
        for u in [u for u, s in self.screens.items() if now - (s.get("seen") or 0) > FORGET_AFTER]: del self.screens[u]

    def _save(self) -> None:
        self._saved = time.time()
        try:
            tmp = SCREENS.with_suffix(".tmp"); tmp.write_text(json.dumps({"screens": self.screens}, indent=1)); os.replace(tmp, SCREENS)
        except OSError as e: log.warning("could not write %s: %s", SCREENS, e)

    def _name(self, s: dict) -> str:
        for pid, ip in self._screen_ips.items():
            if ip == s.get("ip"):
                p = self.hub.phones.get(pid)
                if p: return p.get("name") or s.get("host") or "A screen"
        return s.get("host") or "A screen"

    def _head(self, branch: str) -> str | None:
        return self._cached(f"head:{branch}", lambda: updates_mod._get(updates_mod.COMMIT_API.format(branch=urllib.parse.quote(branch, safe="")))["sha"])

    def _landed(self, branch: str) -> bool | None:
        if branch in NAMED: return False
        def ask():
            try: return updates_mod._get(updates_mod.COMPARE_API.format(branch=urllib.parse.quote(branch, safe=""))).get("status") == "behind"
            except urllib.error.HTTPError as e:
                if e.code == 404: return True
                raise
        return self._cached(f"landed:{branch}", ask)

    def _current(self, s: dict, landed: bool | None) -> bool | None:
        commit, ch = s.get("commit") or "", s.get("channel") or "release"
        if not commit: return None
        u = self.hub.updates
        if ch == "release":
            return commit == u.commit if u.channel == "release" and u.commit else None
        if landed is None: return None
        head = self._head("development" if landed else ch)
        return None if head is None else commit == head

    def _cached(self, key: str, ask):
        at, v = self._cache.get(key, (0.0, None))
        if time.time() - at < CACHE: return v
        try: v = ask()
        except Exception as e:
            log.debug("asking GitHub for %s: %s", key, e); v = None
        self._cache[key] = (time.time(), v)
        return v

    def screen_rows(self) -> list:
        now, out = time.time(), []
        for unit, s in sorted(self.screens.items(), key=lambda kv: kv[1].get("host") or ""):
            ch = s.get("channel") or "release"
            landed = self._landed(ch) if ch != "release" else False
            out.append({"id": unit, "name": self._name(s), "host": s.get("host") or "", "ip": s.get("ip") or "",
                        "version": s.get("version") or "", "commit": s.get("commit") or "", "channel": ch,
                        "landed": bool(landed), "current": self._current(s, landed), "seen": s.get("seen"),
                        "updating": bool(s.get("update") or s.get("asked") or (s.get("updating") and now - (s.get("seen") or 0) < 3 * REPORT_EVERY))})
        return out

    # ---------- the page ----------
    def summary(self) -> dict:
        u = self.hub.updates
        return {"shown": self.shown, "channel": u.channel, "version": u.version, "commit": u.commit,
                "landed": (u.latest or {}).get("landed"), "behind": self.behind(), "ssh": self.ssh(),
                "screens": self.screen_rows(), "requested": {"channel": self.requested_channel()}}
