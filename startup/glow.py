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
"""
import json
import os
import socket
import subprocess
import sys
import time

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


def run(config):
    # a frame has to fit in one datagram on a 1500-byte network: the strip does not put a split one back together
    where = points(config["corners"], config["path"], min(MOST, int(config.get("lights", 48))))
    key = bytes.fromhex(config["strip"]["key"])
    to = (config["strip"]["host"], int(config["strip"].get("port", 21325)))
    run_ = int(config["strip"].get("run", 0))
    out = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    seq = 0
    for frame in camera(config.get("camera", "/dev/video0")):
        colors = [tone(read(frame, x, y)) for x, y in where]
        out.sendto(packet(seq, key, colors, run_), to)
        seq = (seq + 1) & 0xFFFF


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ELYIR_GLOW", "/etc/elyir/glow.json")
    while True:
        try: run(json.load(open(path)))
        except (OSError, ValueError, KeyError) as e: print(f"glow: {e}", file=sys.stderr)
        time.sleep(2)   # a camera unplugged, or no settings yet: try again rather than give up
