# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""What this hub runs from, and the drive beside it (design/move-to-drive/, A with B's sheet).

The x86 image starts on a USB stick. With an empty drive beside it, it moves there on its own, before
anything else happens. With anything on the drive it never decides that by itself: first run asks (A),
and somebody who chose to keep the drive can change their mind from This hub (B's sheet). This module is
the brain's half of that question. It reads `drive.json`, which the host's drive.sh writes, and it writes
`drive.request`, which home-hub-drive.path is watching for -- the same shape as network.py, and for the
same reason: the brain never touches a disk, and the host checks everything again before it does.
"""
import json, os, time
from pathlib import Path

from .settings import DATA

STATE = DATA / "drive.json"
REQUEST = DATA / "drive.request"


class Drive:
    def __init__(self, hub, state: Path = STATE, request: Path = REQUEST):
        self.hub = hub
        self.state_path = state
        self.request_path = request

    def _host(self) -> dict:
        try:
            return json.loads(self.state_path.read_text())
        except Exception:
            return {}

    def drives(self) -> list:
        out = []
        for d in self._host().get("drives") or []:
            if not isinstance(d, dict) or not d.get("name"):
                continue
            out.append({"name": d["name"], "serial": d.get("serial") or "", "model": (d.get("model") or "").strip(),
                        "bytes": int(d.get("bytes") or 0), "empty": bool(d.get("empty")), "system": d.get("system"),
                        "used": d.get("used"), "last": d.get("last")})
        return out

    def state(self) -> dict:
        host = self._host()
        drives = self.drives()
        on_stick = host.get("from") == "stick"
        kept = bool(self.hub.settings.get("drive_kept"))
        moved = host.get("moved")
        asked = host.get("asked") if isinstance(host.get("asked"), dict) else {}
        return {
            "from": host.get("from") or "unknown",
            "drives": drives,
            # The one drive the question is about: the first with anything on it. An empty one never gets
            # here, because the host moved onto it before the brain started.
            "drive": next((d for d in drives if not d["empty"]), None) if on_stick else None,
            # First run asks once; after that the answer is the household's until they change it on This hub.
            "ask": on_stick and not kept and any(not d["empty"] for d in drives),
            "kept": kept,
            # Said once, on the first screen after the move, and then never again.
            "moved": bool(moved) and self.hub.settings.get("drive_moved_seen") != moved,
            "moving": bool(asked.get("moving")),
            "refused": asked.get("refused"),
            "failed": host.get("failed"),
        }

    def move(self, name: str, serial: str) -> dict:
        """Ask the host to move onto this drive. It checks again, writes it down for the start of the next
        boot, and restarts; the copy happens before anything on the disk is running."""
        d = next((d for d in self.drives() if d["name"] == name), None)
        if not d or not serial or d["serial"] != serial:
            raise ValueError("That isn't the drive the screen showed. Look again.")
        if self._host().get("from") != "stick":
            raise ValueError("This hub is already on its own drive.")
        self.request_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.request_path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"do": "move", "disk": name, "serial": serial, "at": time.time()}))
        os.replace(tmp, self.request_path)
        self.hub.log.add("home", "drive", None, f"moving onto {d['model'] or name}", source="user")
        return {**self.state(), "moving": True}

    def keep(self) -> dict:
        self.hub.settings.set(drive_kept=True)
        return self.state()

    def seen(self) -> dict:
        self.hub.settings.set(drive_moved_seen=self._host().get("moved"))
        return self.state()
