#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Prepare the paintings the screens show (design/tv-art/, brain/hub/art.py), and publish them to Elyir's own host.

  python3 tools/art/prepare.py              download what is new from its museum, redraw it at the TV's size, and write
                                            each one's file, hash, size and close-look point into brain/hub/paintings.json
  python3 tools/art/prepare.py --publish    the same, then put every prepared file on art.<zone> (site/terraform/art.tf)
                                            with wrangler, which reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID

Needs Pillow and numpy. The pictures land in ~/.cache/elyir/art (ART_CACHE), never in this repository. A file's name is
its own hash, so a picture once published never changes under a hub that already has it, and a hub only ever accepts
the bytes paintings.json names. Commit paintings.json after publishing, never before: a hub that reads a hash for a
file that is not up yet tries again every hour until it is.

The close look opens on the busiest part of the painting, where the brushwork is, unless the entry already says where
(`focus`, as fractions across and down), which is how a person overrides a poor guess.
"""
import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
SET = ROOT / "brain" / "hub" / "paintings.json"
CACHE = Path(os.environ.get("ART_CACHE", Path.home() / ".cache" / "elyir" / "art"))
BUCKET = os.environ.get("ART_BUCKET", "elyir-art")
LONG_EDGE = 2400        # the close look is 2.6 times in on a 1100-wide frame, so the whole needs about this many pixels
QUALITY = 80
ZOOM = 2.6              # TvPainting's close look: the window the busiest part is looked for in


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "art-prepare/1.0"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception:
            if attempt == 2: raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def busiest(img: Image.Image) -> list[float]:
    """Where the close look should open: the window, ZOOM times smaller than the painting, with the most edges in it,
    kept off the very border so the look never opens on the frame or a blank margin."""
    small = ImageOps.grayscale(img).copy()
    small.thumbnail((320, 320))
    a = np.asarray(small, dtype=np.float32)
    edges = np.abs(np.diff(a, axis=0))[:, :-1] + np.abs(np.diff(a, axis=1))[:-1, :]
    h, w = edges.shape
    wh, ww = max(1, int(h / ZOOM)), max(1, int(w / ZOOM))
    s = np.pad(edges, ((1, 0), (1, 0))).cumsum(0).cumsum(1)
    sums = s[wh:, ww:] - s[:-wh, ww:] - s[wh:, :-ww] + s[:-wh, :-ww]
    y, x = np.unravel_index(int(np.argmax(sums)), sums.shape)
    fx, fy = (x + ww / 2) / w, (y + wh / 2) / h
    clamp = lambda v: round(min(0.85, max(0.15, float(v))), 2)
    return [clamp(fx), clamp(fy)]


def prepare(p: dict) -> dict:
    src = CACHE / "source" / p["id"]
    if not src.exists():
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_bytes(fetch(p["source"]))
    img = Image.open(src)
    img = ImageOps.exif_transpose(img).convert("RGB")
    if max(img.size) > LONG_EDGE:
        r = LONG_EDGE / max(img.size)
        img = img.resize((round(img.width * r), round(img.height * r)), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    data = out.getvalue()
    digest = hashlib.sha256(data).hexdigest()
    name = f"{digest[:20]}.jpg"
    (CACHE / "out").mkdir(parents=True, exist_ok=True)
    (CACHE / "out" / name).write_bytes(data)
    return {**p, "file": name, "sha256": digest, "bytes": len(data), "w": img.width, "h": img.height,
            "focus": p.get("focus") or busiest(img)}


def publish(paintings: list[dict]):
    for p in paintings:
        path = CACHE / "out" / p["file"]
        subprocess.run(["npx", "--yes", "wrangler@4", "r2", "object", "put", f"{BUCKET}/{p['file']}", "--file", str(path),
                        "--content-type", "image/jpeg", "--cache-control", "public, max-age=31536000, immutable", "--remote"],
                       check=True, stdout=subprocess.DEVNULL)
        print(f"published {p['id']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--only", help="one painting's id")
    args = ap.parse_args()
    doc = json.loads(SET.read_text(encoding="utf-8"))
    done = []
    for p in doc["paintings"]:
        if args.only and p["id"] != args.only: done.append(p); continue
        try:
            done.append(prepare(p))
            print(f"{p['id']}: {done[-1]['w']}x{done[-1]['h']}, {done[-1]['bytes'] // 1000} kB, look at {done[-1]['focus']}")
        except Exception as e:
            print(f"{p['id']}: not prepared: {e}", file=sys.stderr)
            done.append(p)
    doc["paintings"] = done
    SET.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(p.get("bytes") or 0 for p in done)
    print(f"{sum(1 for p in done if p.get('file'))} of {len(done)} prepared, {total / 1e6:.1f} MB in all")
    if args.publish: publish([p for p in done if p.get("file")])


if __name__ == "__main__":
    main()
