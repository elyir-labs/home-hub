#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""What a screen can answer about itself, for the panel's This screen page (design/this-screen/, A).

The panel on a screen is served by a hub, often a hub in another room, so it cannot turn this glass,
restart this browser or change what this unit is. This can. wall.sh starts it inside the screen's own
session, beside the browser, so it runs as the screen's user, lives exactly as long as the wall does,
and can reach the display. It listens on this unit alone and answers only the panel it was opened on.

Three things, and no more:

  turn      which way up the display is drawn: 0, 90, 180 or 270, kept for the next start, and left
            for turn.sh, which turns the startup the same way
  restart   the browser, which brings the screen back in a few seconds; the house is not touched
  role      whether this unit runs the house or shows another hub's. It cannot do that itself: it
            leaves one word in a file and role.sh, as root, decides what to do with it

Nothing here takes a command from the panel. A turn is checked against four numbers and a role
against two words, the way restart.sh checks its rungs.
"""
import json
import os
import shutil
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit
from urllib.request import urlopen

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("ELYIR_SCREEN_PORT", "8380"))
PANEL = os.environ.get("ELYIR_PANEL_URL", "http://localhost/?screen=1")
TURN_FILE = os.environ.get("ELYIR_TURN_FILE") or os.path.expanduser("~/.config/elyir/turn")
ASK_DIR = os.environ.get("ELYIR_SCREEN_ASK", "/var/lib/elyir-screen")
FIND_HUB = os.environ.get("ELYIR_FIND_HUB", os.path.join(HERE, "find-hub.sh"))
ROLE = "screen" if os.environ.get("HUB_ROLE") == "screen" else "hub"

# How each turn is said to the compositor. One place, because which way "90" goes is the display's
# convention, not ours, and is checked on the unit itself.
TRANSFORMS = {0: "normal", 90: "90", 180: "180", 270: "270"}


def origin_of(url):
    u = urlsplit(url)
    return f"{u.scheme}://{u.netloc}"


ALLOWED = {origin_of(PANEL)}


def read_turn():
    try:
        with open(TURN_FILE) as f:
            t = int(f.read().strip() or 0)
        return t if t in TRANSFORMS else 0
    except (OSError, ValueError):
        return 0


def can_turn():
    return bool(os.environ.get("WAYLAND_DISPLAY")) and shutil.which("wlr-randr") is not None


def outputs():
    out = subprocess.run(["wlr-randr"], capture_output=True, text=True, timeout=5).stdout
    return [line.split()[0] for line in out.splitlines() if line and not line[0].isspace()]


def turn_to(t):
    names = outputs()
    if not names:
        return False
    ok = all(subprocess.run(["wlr-randr", "--output", n, "--transform", TRANSFORMS[t]], capture_output=True, timeout=5).returncode == 0
             for n in names)
    if ok:
        os.makedirs(os.path.dirname(TURN_FILE), exist_ok=True)
        with open(TURN_FILE, "w") as f:
            f.write(f"{t}\n")
        # the startup is drawn before this compositor exists, so turn.sh, as root, turns it on the boot line
        try:
            os.makedirs(ASK_DIR, exist_ok=True)
            with open(os.path.join(ASK_DIR, "turn.request"), "w") as f:
                f.write(f"{t}\n")
        except OSError:
            pass
    return ok


class Other:
    """Another hub on this Wi-Fi, asked about now and then, and only by a unit that runs a house: it is
    what that unit could become the screen of. Its house's name comes from the hub itself."""
    home = None
    url = None

    @classmethod
    def look(cls):
        try:
            found = subprocess.run([FIND_HUB], capture_output=True, text=True, timeout=15,
                                   env={**os.environ, "FIND_FOR": "4"}).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            found = ""
        home = None
        if found:
            try:
                with urlopen(f"{found}/phones/me", timeout=4) as r:
                    home = json.load(r).get("home") or "Another house"
            except (OSError, ValueError):
                found = ""
        cls.url, cls.home = (found or None), home

    @classmethod
    def keep_looking(cls):
        while True:
            cls.look()
            time.sleep(60)


class Answer(BaseHTTPRequestHandler):
    server_version = "elyir-screen"

    def log_message(self, *_):
        pass

    def allowed(self):
        return self.headers.get("Origin") in ALLOWED

    def reply(self, code, body=None):
        data = json.dumps(body if body is not None else {}).encode()
        self.send_response(code)
        if self.allowed():
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = min(int(self.headers.get("Content-Length") or 0), 1024)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return {}

    def do_OPTIONS(self):
        if not self.allowed():
            return self.reply(403)
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
        self.send_header("Access-Control-Allow-Methods", "GET, POST")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome asks before a page on the house's network reaches this unit's own address.
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self):
        if not self.allowed():
            return self.reply(403)
        if self.path != "/this":
            return self.reply(404)
        other = {"home": Other.home} if ROLE == "hub" and Other.url else None
        self.reply(200, {"role": ROLE, "turn": read_turn(), "turns": can_turn(), "other": other})

    def do_POST(self):
        if not self.allowed():
            return self.reply(403)
        b = self.body()
        if self.path == "/turn":
            t = b.get("turn")
            if t not in TRANSFORMS or isinstance(t, bool):
                return self.reply(400, {"error": "A screen turns by quarters."})
            if not can_turn() or not turn_to(t):
                return self.reply(500, {"error": "This screen couldn't be turned."})
            return self.reply(200, {"turn": t})
        if self.path == "/restart":
            self.reply(200, {"ok": True})
            # The browser is the process that started this one; when it goes, the wall's service brings it back.
            threading.Timer(0.3, os.kill, (os.getppid(), signal.SIGTERM)).start()
            return None
        if self.path == "/role":
            to = b.get("to")
            if to not in ("hub", "screen") or to == ROLE:
                return self.reply(400, {"error": "This screen already does that."})
            if to == "screen":
                Other.look()
                if not Other.url:
                    return self.reply(409, {"error": "There's no other hub on your Wi‑Fi. Plug the other one in first."})
            os.makedirs(ASK_DIR, exist_ok=True)
            with open(os.path.join(ASK_DIR, "role.request"), "w") as f:
                f.write(to + "\n")
            return self.reply(200, {"ok": True})
        return self.reply(404)


def main():
    if ROLE == "hub":
        threading.Thread(target=Other.keep_looking, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), Answer).serve_forever()


if __name__ == "__main__":
    main()
