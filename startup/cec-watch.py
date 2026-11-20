#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Listening on the TV's HDMI for the way back from a streaming box (design/tv-box/, coming back: B, falling back to A).

While a streaming box is on the TV, the TV sends its remote's presses to the box, not to this unit. The four colored
buttons do nothing on an Apple TV, a Roku or a Google TV, so a colored press meant for the box is the way back to the
house: this hears it and switches the TV back (cec.sh tv show). The box never sees a scene, and the house runs none,
because the press was never this unit's.

Hearing a press meant for another device needs an adapter that can listen to the whole bus (cec-ctl --monitor-all).
One that can't still hears what the TV says to everybody, which is enough to know what the TV is showing, so the way
back falls back to Input on the TV's remote, or the box going to sleep.

What it learns is left in ELYIR_CEC_STATE (/run/elyir-cec) for the screen's helper to read:
  own     this unit's place on the TV's HDMI ("2.0.0.0")
  source  the place the TV is showing now
  hears   "all" when a colored press meant for the box is heard, "own" when it is not
"""
import os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.environ.get("ELYIR_CEC_STATE", "/run/elyir-cec")
CEC_SH = os.environ.get("ELYIR_CEC_SH", os.path.join(HERE, "cec.sh"))

HEAD = re.compile(r"\((\d+) to (\d+)\): ([A-Z_]+)")
ADDR = re.compile(r"(?:phys-addr|new-phys-addr): ([0-9a-f.]+)")
COLOR = re.compile(r"ui-cmd: .*\(0x7[1-4]\)")       # F1 to F4, the blue, red, green and yellow buttons


def keep(name, value):
    os.makedirs(STATE, exist_ok=True)
    tmp = os.path.join(STATE, f".{name}")
    with open(tmp, "w") as f:
        f.write(f"{value}\n")
    os.replace(tmp, os.path.join(STATE, name))


def whoami(dev):
    out = subprocess.run(["cec-ctl", "-d", dev], capture_output=True, text=True).stdout
    pa = re.search(r"Physical Address\s*: ([0-9a-f.]+)", out)
    la = re.search(r"Logical Address[^:]*: (\d+)", out)
    return (pa.group(1) if pa else None), (la.group(1) if la else None)


def listen(dev):
    """cec-ctl watching the whole bus where the adapter can, only what reaches this unit where it can't."""
    for how, hears in (("--monitor-all", "all"), ("--monitor", "own")):
        p = subprocess.Popen(["cec-ctl", "-d", dev, how], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        time.sleep(float(os.environ.get("ELYIR_CEC_SETTLE", "1")))
        if p.poll() in (None, 0) or how == "--monitor":     # still listening, or said what it heard and ended
            return p, hears
    return p, "own"


def main(dev):
    own, me = whoami(dev)
    if own: keep("own", own)
    p, hears = listen(dev)
    keep("hears", hears)
    msg, last = None, 0.0
    for line in p.stdout:
        h = HEAD.search(line)
        if h:
            msg = (h.group(1), h.group(2), h.group(3))
            continue
        if not msg: continue
        src, dst, kind = msg
        a = ADDR.search(line)
        if a and kind in ("ACTIVE_SOURCE", "ROUTING_CHANGE", "SET_STREAM_PATH", "ROUTING_INFORMATION"):
            keep("source", a.group(1))
        elif hears == "all" and kind == "USER_CONTROL_PRESSED" and COLOR.search(line) and dst not in (me, "15") and time.time() - last > 1:
            last = time.time()
            subprocess.run([CEC_SH, "tv", "show"], capture_output=True)
            if own: keep("source", own)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ELYIR_CEC", "/dev/cec0"))
