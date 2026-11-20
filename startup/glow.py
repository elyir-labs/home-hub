#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The light behind the TV, following the picture (the living room's step 5, the camera way, 20 November 2026).

Shows from an Apple TV or any box are encrypted on the HDMI cable, and reading them takes a box that strips the
protection, which we will not build a product on. So the hub reads the picture the way a person does: a small camera
across the room looks at the screen, and this finds the colors along each edge of the picture and sends them to the
strip controller behind the TV, about 25 times a second.

The strip draws them itself and eases between frames (strip/firmware, follow mode); this only reads and sends. A frame
is the colors along the strip from its first light to its last, so the strip needs to know nothing about the TV, and
this needs to know where the screen is in the camera's view and which way the strip runs around it:

  corners   the screen's four corners in the camera's picture, top-left, top-right, bottom-right, bottom-left,
            each as [x, y] from 0 to 1
  path      the edges the strip covers, in the order it runs: "left-up" (the left edge, bottom to top),
            "top-right", "right-down", "bottom-left"
  lights    how many colors to send along the whole strip (the strip stretches them over its own lights)

Pure Python with no imaging library: a frame is 64 by 36, small enough to read by hand 25 times a second on the
smallest hub. ffmpeg reads the camera and makes it that size.

SETTING IT UP (design/tv-glow/, A). The panel on the hub's own TV asks this, on this machine's own address as the
screen helper is asked: it puts four white corners on the TV and has this find them (`/find`, a picture with them
and one without), lights a moving light from the strip's first light so the household can say which way it runs
(`/chase`), and keeps the answers (`/save`). Following starts as soon as there are settings and a camera.
"""
import json
import os
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

W, H = 64, 36
FPS = 25
MOST = 480     # colors in one frame: 18 + 480 x 3 bytes fits a single UDP datagram
EDGES = {"left-up": ("left", True), "left-down": ("left", False), "right-up": ("right", True), "right-down": ("right", False),
         "top-right": ("top", False), "top-left": ("top", True), "bottom-right": ("bottom", False), "bottom-left": ("bottom", True)}
INSET = 0.07    # how far inside the picture's edge to read: the edge itself is the TV's frame half the time


def at(corners, u, v):
    """The point at (u, v) across the screen, in the camera's picture. Bilinear between the four corners, which is close
    enough to the true perspective for a camera somewhere in front of the TV."""
    (tlx, tly), (trx, try_), (brx, bry), (blx, bly) = corners
    top = (tlx + (trx - tlx) * u, tly + (try_ - tly) * u)
    bottom = (blx + (brx - blx) * u, bly + (bry - bly) * u)
    return top[0] + (bottom[0] - top[0]) * v, top[1] + (bottom[1] - top[1]) * v


def along(edge, t):
    """(u, v) on the screen at t from 0 to 1 along one edge, in the direction its name says, read just inside it."""
    side, backward = EDGES[edge]
    t = 1 - t if backward else t
    lo, hi = INSET, 1 - INSET
    if side == "left": return lo, lo + (hi - lo) * t
    if side == "right": return hi, lo + (hi - lo) * t
    if side == "top": return lo + (hi - lo) * t, lo
    return lo + (hi - lo) * t, hi


def points(corners, path, lights, aspect=16 / 9):
    """Where in the camera's picture to read each of `lights` colors, in strip order. Each edge gets its share of the
    lights by its length on the screen, so a light on the side covers as much picture as one along the top."""
    lengths = [aspect if EDGES[e][0] in ("top", "bottom") else 1.0 for e in path]
    total = sum(lengths)
    counts = [max(1, round(lights * l / total)) for l in lengths]
    counts[-1] += lights - sum(counts)
    out = []
    for edge, n in zip(path, counts):
        for i in range(n):
            u, v = along(edge, (i + 0.5) / n)
            out.append(at(corners, u, v))
    return out


def read(frame, x, y, r=1):
    """The average color around (x, y), from 0 to 1 across the frame, over a little square so one pixel of noise
    does not flicker the light."""
    cx, cy = min(W - 1, max(0, round(x * (W - 1)))), min(H - 1, max(0, round(y * (H - 1))))
    rs = gs = bs = n = 0
    for yy in range(max(0, cy - r), min(H, cy + r + 1)):
        row = yy * W * 3
        for xx in range(max(0, cx - r), min(W, cx + r + 1)):
            i = row + xx * 3
            rs += frame[i]; gs += frame[i + 1]; bs += frame[i + 2]; n += 1
    return rs / n, gs / n, bs / n


def tone(rgb, saturation=1.35, floor=8):
    """A camera sees the screen washed out, so the color is pushed back toward what the picture was. Very dark reads
    as off rather than as a dim muddy glow."""
    r, g, b = rgb
    grey = (r + g + b) / 3
    if max(r, g, b) < floor: return 0, 0, 0
    return tuple(int(min(255, max(0, grey + (c - grey) * saturation))) for c in (r, g, b))


def packet(seq, key, colors, run=0):
    """One frame, as strip/firmware's follow mode reads it."""
    head = b"ELYF" + bytes([1, run]) + (seq & 0xFFFF).to_bytes(2, "big") + key + len(colors).to_bytes(2, "big")
    return head + bytes(c for rgb in colors for c in rgb)


def camera(device):
    """Frames from the camera, 64 by 36, 25 a second, as raw RGB bytes."""
    cmd = ["ffmpeg", "-loglevel", "error", "-f", "v4l2", "-framerate", str(FPS), "-i", device,
           "-vf", f"scale={W}:{H}", "-pix_fmt", "rgb24", "-f", "rawvideo", "-r", str(FPS), "-"]
    if device.startswith("test:"):   # a moving test picture instead of a camera, for trying it without one
        cmd = ["ffmpeg", "-loglevel", "error", "-re", "-f", "lavfi", "-i", f"testsrc2=size={W}x{H}:rate={FPS}",
               "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = W * H * 3
    try:
        while True:
            frame = p.stdout.read(size)
            if len(frame) < size: return
            yield frame
    finally:
        p.kill()


def run(config, stop=None):
    # a frame has to fit in one datagram on a 1500-byte network: the strip does not put a split one back together
    where = points(config["corners"], config["path"], min(MOST, int(config.get("lights", 48))))
    key = bytes.fromhex(config["strip"]["key"])
    to = (config["strip"]["host"], int(config["strip"].get("port", 21325)))
    run_ = int(config["strip"].get("run", 0))
    out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    seq = 0
    for frame in camera(config.get("camera", "/dev/video0")):
        if stop is not None and stop.is_set(): return
        if Setup.chasing: continue   # the setup's moving light has the strip for now
        colors = [tone(read(frame, x, y)) for x, y in where]
        out.sendto(packet(seq, key, colors, run_), to)
        seq = (seq + 1) & 0xFFFF




# ---------- finding the screen ----------

FW, FH = 160, 90   # a still for finding the corners: finer than a following frame, taken twice a setup


def still(device):
    """One picture from the camera, FW by FH, as raw RGB."""
    src = ["-f", "lavfi", "-i", f"color=black:size={FW}x{FH}"] if device.startswith("test:") else ["-f", "v4l2", "-i", device]
    out = subprocess.run(["ffmpeg", "-loglevel", "error", *src, "-frames:v", "1", "-vf", f"scale={FW}:{FH}",
                          "-pix_fmt", "rgb24", "-f", "rawvideo", "-"], capture_output=True, timeout=10).stdout
    if len(out) < FW * FH * 3: raise OSError("the camera gave no picture")
    return out


def corners(lit, dark, w=FW, h=FH):
    """Where the screen's corners are, from a picture with four white squares in the TV's corners and one without:
    what got brighter is the squares, and each square's point farthest from the middle of all four is a corner of
    the picture. None when four squares cannot be told apart -- a bright room, or a camera that sees part of it."""
    lum = lambda f, i: f[i] * 0.3 + f[i + 1] * 0.59 + f[i + 2] * 0.11
    diff = [lum(lit, i * 3) - lum(dark, i * 3) for i in range(w * h)]
    top = max(diff)
    if top < 40: return None
    bright = [(i % w, i // w) for i, d in enumerate(diff) if d > top * 0.5]
    if len(bright) < 8: return None
    cx, cy = sum(x for x, _ in bright) / len(bright), sum(y for _, y in bright) / len(bright)
    quads = {k: [] for k in ("tl", "tr", "br", "bl")}
    for x, y in bright:
        quads[("t" if y < cy else "b") + ("l" if x < cx else "r")].append((x, y))
    if any(len(q) < 2 for q in quads.values()): return None
    out = []
    for k in ("tl", "tr", "br", "bl"):
        x, y = max(quads[k], key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
        out.append([round(x / (w - 1), 4), round(y / (h - 1), 4)])
    tl, tr, _, bl = out
    if tr[0] - tl[0] < 0.1 or bl[1] - tl[1] < 0.1: return None   # four specks, not a screen
    return out


def path_of(start, first, bottom=False):
    """The edges in the strip's order, from the corner it starts at and the way it goes first: up or down the side,
    or across. A strip starting at a bottom corner usually leaves the bottom bare (the TV stands on it); `bottom`
    says it goes along it too."""
    cw = ["left-up", "top-right", "right-down", "bottom-left"]       # clockwise, from the bottom left
    ccw = ["bottom-right", "right-up", "top-left", "left-down"]      # anticlockwise, from the bottom left
    side = start.startswith("bottom") and first == "up" or start.startswith("top") and first == "down"
    starts = {("bottom-left", True): (cw, 0), ("top-left", False): (cw, 1), ("top-right", True): (cw, 2),
              ("bottom-right", False): (cw, 3), ("bottom-left", False): (ccw, 0), ("bottom-right", True): (ccw, 1),
              ("top-right", False): (ccw, 2), ("top-left", True): (ccw, 3)}
    edges, i = starts[(start, side)]
    path = [edges[(i + k) % 4] for k in range(4)]
    # only a strip that starts at a bottom corner and goes up the side can stop short of the bottom; any other way
    # round, the bottom is somewhere in the middle of it
    return path[:3] if start.startswith("bottom") and side and not bottom else path


# ---------- the helper the panel asks ----------

PORT = int(os.environ.get("ELYIR_GLOW_PORT", "8397"))
STATE = os.environ.get("ELYIR_GLOW", "/var/lib/elyir-glow/glow.json")
CAMERA = os.environ.get("ELYIR_CAMERA", "/dev/video0")
PANEL = os.environ.get("ELYIR_PANEL_URL", "http://localhost/?screen=1")
ALLOWED = {"{0.scheme}://{0.netloc}".format(urlsplit(PANEL))}


class Setup:
    lit = None
    chasing = None
    changed = threading.Event()


def chase(target, lights, until):
    """A light running from the strip's first light to its last, again and again, while the TV asks which way it went."""
    out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    key, to, run_ = bytes.fromhex(target["key"]), (target["host"], int(target.get("port", 21325))), int(target.get("run", 0))
    seq, n = 0, max(2, min(MOST, int(lights)))
    while time.time() < until and Setup.chasing == until:
        at = int((time.time() * 20) % n)
        out.sendto(packet(seq, key, [(255, 190, 120) if abs(i - at) < 2 else (0, 0, 0) for i in range(n)], run_), to)
        seq = (seq + 1) & 0xFFFF
        time.sleep(1 / FPS)


class Answer(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def allowed(self): return self.headers.get("Origin") in ALLOWED

    def reply(self, code, body=None):
        data = json.dumps(body if body is not None else {}).encode()
        self.send_response(code)
        if self.allowed():
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"]); self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data)))
        self.end_headers(); self.wfile.write(data)

    def body(self):
        n = min(int(self.headers.get("Content-Length") or 0), 4096)
        try: return json.loads(self.rfile.read(n) or b"{}")
        except ValueError: return {}

    def do_OPTIONS(self):
        if not self.allowed(): return self.reply(403)
        self.send_response(204)
        for k, v in (("Access-Control-Allow-Origin", self.headers["Origin"]), ("Access-Control-Allow-Methods", "GET, POST"),
                     ("Access-Control-Allow-Headers", "Content-Type"), ("Access-Control-Allow-Private-Network", "true"), ("Vary", "Origin")):
            self.send_header(k, v)
        self.end_headers()

    def do_GET(self):
        if not self.allowed(): return self.reply(403)
        if self.path != "/glow": return self.reply(404)
        self.reply(200, {"camera": CAMERA.startswith("test:") or os.path.exists(CAMERA), "set": os.path.exists(STATE)})

    def do_POST(self):
        if not self.allowed(): return self.reply(403)
        u = urlsplit(self.path); q = parse_qs(u.query); b = self.body()
        try:
            if u.path == "/find":
                if q.get("phase") == ["lit"]: Setup.lit = still(CAMERA); return self.reply(200, {"ok": True})
                if not Setup.lit: return self.reply(409, {"detail": "Show the corners first."})
                found = corners(Setup.lit, still(CAMERA)); Setup.lit = None
                return self.reply(200, {"corners": found})
            if u.path == "/chase":
                if b.get("stop"): Setup.chasing = None; return self.reply(200, {"ok": True})
                until = time.time() + 60; Setup.chasing = until
                threading.Thread(target=chase, args=(b["target"], b.get("lights", 48), until), daemon=True).start()
                return self.reply(200, {"ok": True})
            if u.path == "/save":
                config = {"camera": CAMERA, "corners": b["corners"], "lights": min(MOST, int(b.get("lights", 48))),
                          "path": path_of(b["start"], b["first"], bool(b.get("bottom"))), "strip": b["target"]}
                os.makedirs(os.path.dirname(STATE), exist_ok=True)
                with open(STATE + ".new", "w") as f: json.dump(config, f)
                os.replace(STATE + ".new", STATE)
                Setup.chasing = None; Setup.changed.set()
                return self.reply(200, {"path": config["path"]})
        except (OSError, KeyError, ValueError, subprocess.TimeoutExpired) as e:
            return self.reply(400, {"detail": str(e)})
        self.reply(404)


def follow_forever():
    """Follow the picture whenever there are settings and a camera: one at a time, started again when the settings
    change, and again a few seconds after the camera stops (unplugged, or not there yet)."""
    stop, t = None, None
    while True:
        changed = Setup.changed.wait(timeout=5)
        Setup.changed.clear()
        if changed and stop: stop.set(); t = None
        if t is not None and t.is_alive(): continue
        try: config = json.load(open(STATE))
        except (OSError, ValueError): continue
        stop = threading.Event()
        t = threading.Thread(target=run, args=(config, stop), daemon=True); t.start()


if __name__ == "__main__":
    if len(sys.argv) > 1: STATE = sys.argv[1]
    threading.Thread(target=follow_forever, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), Answer).serve_forever()
