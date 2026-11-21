# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""The household's own photos, for a TV at rest (design/rest-tv/, A).

A TV the hub is plugged into spends most of its time on and unwatched, and what it shows then is the
house's picture frame: the photos the people in the house send it from their phones. They are kept here,
on the hub's own drive, and nowhere else -- no cloud album, no copy on the relay -- so a photo sent to the
TV goes exactly as far as the living room.

A phone sends the picture already made the TV's size and stripped of where it was taken (the panel
redraws it before sending), so what lands here is a picture, its size (so the TV can pair two upright
ones without opening every file) and the two things the TV says about it: when it was taken and whose
phone it came from. The bytes are checked to be an image before they are
kept, and the folder has a ceiling; past it the oldest go first.

Start over erases the folder with the rest of the brain's data. Moving out takes the photos with the
people (handover.py), since they are theirs and not the house's.
"""
import json
import os
import secrets
import shutil
import time
from pathlib import Path

from .settings import DATA

ROOT = DATA / "photos"
MAX_BYTES = 8 * 1024 * 1024     # one photo, already redrawn to the TV's size by the phone; a full camera original is refused
KEEP = 500                       # the folder's ceiling: past it the oldest photo goes, so a busy house never fills the drive

KINDS = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def kind_of(data: bytes) -> str | None:
    """Which image this is from its first bytes, or None. The name and the Content-Type are the sender's word; these are not."""
    if data[:3] == b"\xff\xd8\xff": return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n": return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP": return "webp"
    return None


class Photos:
    def __init__(self, root: Path | None = None, now=time.time):
        self.root, self.now = Path(root or ROOT), now
        try:
            self.items: list[dict] = json.loads((self.root / "photos.json").read_text()).get("photos", [])
        except (OSError, ValueError):
            self.items = []

    def _save(self):
        self.root.mkdir(parents=True, exist_ok=True)
        index = self.root / "photos.json"
        tmp = index.with_suffix(".tmp")
        tmp.write_text(json.dumps({"photos": self.items}, indent=1))
        os.replace(tmp, index)

    def list(self) -> list[dict]:
        """Newest first, as the TV shows them."""
        return sorted(self.items, key=lambda p: p["added"], reverse=True)

    def add(self, data: bytes, by: str | None = None, taken: float | None = None, size: tuple | None = None) -> dict:
        """Keep one photo. ValueError says why it was refused, in words a person can be shown."""
        if not data: raise ValueError("That photo was empty.")
        if len(data) > MAX_BYTES: raise ValueError("That photo is too large to keep.")
        kind = kind_of(data)
        if not kind: raise ValueError("That isn't a photo the TV can show.")
        now = self.now()
        # a taken date from the phone is believed only when it is a real moment, not from the future
        when = taken if isinstance(taken, (int, float)) and 0 < taken <= now + 86400 else None
        w, h = size if size and len(size) == 2 and all(isinstance(n, int) and 0 < n <= 20000 for n in size) else (None, None)
        photo = {"id": secrets.token_hex(8), "kind": kind, "added": now, "taken": when, "by": (by or "").strip()[:60] or None, "w": w, "h": h}
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / f"{photo['id']}.{kind}").write_bytes(data)
        self.items.append(photo)
        for old in sorted(self.items, key=lambda p: p["added"])[:max(0, len(self.items) - KEEP)]:
            self._drop(old)
        self._save()
        return photo

    def file(self, photo_id: str) -> tuple[Path, str] | None:
        p = next((p for p in self.items if p["id"] == photo_id), None)
        if not p: return None
        path = self.root / f"{p['id']}.{p['kind']}"
        return (path, KINDS[p["kind"]]) if path.exists() else None

    def _drop(self, photo: dict):
        (self.root / f"{photo['id']}.{photo['kind']}").unlink(missing_ok=True)
        self.items = [p for p in self.items if p["id"] != photo["id"]]

    def remove(self, photo_id: str) -> bool:
        p = next((p for p in self.items if p["id"] == photo_id), None)
        if not p: return False
        self._drop(p)
        self._save()
        return True

    def clear(self):
        """Every photo, for Moving out."""
        shutil.rmtree(self.root, ignore_errors=True)
        self.items = []
