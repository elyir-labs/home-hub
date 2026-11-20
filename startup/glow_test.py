# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The light behind the TV reads the right part of the picture, in the strip's order, and says it the way the strip
reads it (glow.py). The last test runs it for real against a moving test picture and a stand-in strip.

Run from the repository: python3 startup/glow_test.py
"""
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import glow  # noqa: E402

SQUARE = [[0, 0], [1, 0], [1, 1], [0, 1]]


def frame(color_at):
    """A 64x36 frame whose pixel (x, y) is color_at(x, y)."""
    return bytes(c for y in range(glow.H) for x in range(glow.W) for c in color_at(x, y))


class Where(unittest.TestCase):
    def test_a_square_screen_reads_just_inside_its_edges(self):
        (x, y), = glow.points(SQUARE, ["top-right"], 1)
        self.assertAlmostEqual(x, 0.5)
        self.assertAlmostEqual(y, glow.INSET)

    def test_the_strip_runs_up_the_left_across_the_top_and_down_the_right(self):
        p = glow.points(SQUARE, ["left-up", "top-right", "right-down"], 34)
        self.assertGreater(p[0][1], 0.8)                 # starts at the bottom of the left edge
        self.assertAlmostEqual(p[0][0], glow.INSET)
        top = [q for q in p if abs(q[1] - glow.INSET) < 1e-9]
        self.assertEqual(top, sorted(top))               # left to right along the top
        self.assertGreater(p[-1][1], 0.8)                # ends at the bottom of the right edge
        self.assertAlmostEqual(p[-1][0], 1 - glow.INSET)

    def test_each_edge_gets_lights_by_its_length(self):
        p = glow.points(SQUARE, ["left-up", "top-right", "right-down"], 34)
        self.assertEqual(len(p), 34)
        top = [q for q in p if abs(q[1] - glow.INSET) < 1e-9]
        self.assertEqual(len(top), 16)                   # 16:9 -- a side is 9 of every 34, the top 16

    def test_a_screen_seen_at_an_angle_is_read_where_it_is(self):
        tilted = [[0.2, 0.1], [0.8, 0.2], [0.8, 0.8], [0.2, 0.9]]
        x, y = glow.at(tilted, 0, 0)
        self.assertEqual((x, y), (0.2, 0.1))
        x, y = glow.at(tilted, 1, 0.5)
        self.assertAlmostEqual(x, 0.8); self.assertAlmostEqual(y, 0.5)


class Color(unittest.TestCase):
    def test_the_left_half_red_and_the_right_blue_reads_red_on_the_left(self):
        f = frame(lambda x, y: (200, 20, 20) if x < glow.W // 2 else (20, 20, 200))
        colors = [glow.read(f, x, y) for x, y in glow.points(SQUARE, ["left-up", "right-down"], 2)]
        self.assertGreater(colors[0][0], colors[0][2])
        self.assertGreater(colors[1][2], colors[1][0])

    def test_dark_is_off_and_washed_out_color_is_pushed_back(self):
        self.assertEqual(glow.tone((4, 5, 3)), (0, 0, 0))
        r, g, b = glow.tone((150, 100, 100))
        self.assertGreater(r - g, 50)


class Packet(unittest.TestCase):
    def test_a_frame_is_said_the_way_the_strip_reads_it(self):
        p = glow.packet(0x1234, bytes(range(8)), [(1, 2, 3), (4, 5, 6)], run=1)
        self.assertEqual(p[:4], b"ELYF")
        self.assertEqual(p[4:6], bytes([1, 1]))
        self.assertEqual(p[6:8], b"\x12\x34")
        self.assertEqual(p[8:16], bytes(range(8)))
        self.assertEqual(p[16:18], b"\x00\x02")
        self.assertEqual(p[18:], bytes([1, 2, 3, 4, 5, 6]))

    def test_the_sequence_wraps(self):
        self.assertEqual(glow.packet(0x10000 + 5, bytes(8), [])[6:8], b"\x00\x05")


@unittest.skipUnless(shutil.which("ffmpeg"), "needs ffmpeg")
class ForReal(unittest.TestCase):
    def test_a_moving_picture_reaches_a_strip_about_25_times_a_second(self):
        strip = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        strip.bind(("127.0.0.1", 0)); strip.settimeout(5)
        got = []
        config = {"camera": "test:", "corners": SQUARE, "path": ["left-up", "top-right", "right-down"], "lights": 40,
                  "strip": {"host": "127.0.0.1", "port": strip.getsockname()[1], "key": "0011223344556677"}}
        threading.Thread(target=glow.run, args=(config,), daemon=True).start()
        start = time.time()
        while time.time() - start < 2.2:
            got.append(strip.recvfrom(2048)[0])
        rate = len(got) / (time.time() - start)
        self.assertGreater(rate, 15)
        self.assertTrue(all(p[:4] == b"ELYF" and int.from_bytes(p[16:18], "big") == 40 for p in got))
        self.assertEqual(got[0][8:16], bytes.fromhex("0011223344556677"))
        self.assertGreater(len({p[18:] for p in got}), 5)    # the picture moves, so the colors do
        strip.close()
        subprocess.run(["pkill", "-f", "testsrc2=size=64x36"], check=False)


if __name__ == "__main__":
    unittest.main()
