# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""A streaming box beside the TV: an Apple TV, a Google TV, a Roku or a Fire TV (design/tv-box/, A).

The hub never plays Netflix, Apple TV+ or the rest itself. Those services stream in full only on devices they have
certified, and the hub is not one. What it can do is drive the box the household already has: open an app on it,
and remember what was last on, so the TV's home can lead with a row to watch from. Switching the TV over to the box
and back is the screen's own job, over HDMI (startup/cec.sh), because only the screen is plugged into the TV.

Which integrations are boxes is the brain's to know; the panel only ever sees a player with apps."""
import time

# A TV with apps built in counts too (a Google TV is androidtv_remote). An LG TV's list mixes its HDMI inputs in with
# its apps, so it waits until there is one to try it on.
BOXES = {"apple_tv", "roku", "androidtv", "androidtv_remote"}

# Not apps: Roku lists its own home screen among its channels.
NOT_APPS = {"Home"}

USED_KEEP = 12


def is_box(entity: dict) -> bool:
    return entity.get("entity_id", "").startswith("media_player.") and entity.get("platform") in BOXES


def apps_of(attrs: dict) -> list[str]:
    return [s for s in attrs.get("source_list") or [] if isinstance(s, str) and s not in NOT_APPS]


class Watched:
    """What each box last had on and which apps the house has seen used, newest first, kept in settings so the row
    reads the same after a restart."""

    def __init__(self, settings):
        self.settings = settings
        kept = settings.get("boxes") or {}
        self.last = dict(kept.get("last") or {})
        self.used = {k: list(v) for k, v in (kept.get("used") or {}).items()}

    def attrs(self, eid: str) -> dict:
        return {"last_on": self.last.get(eid), "used_apps": self.used.get(eid, [])}

    def _keep(self):
        self.settings.set(boxes={"last": self.last, "used": self.used})

    def _use(self, eid: str, app: str):
        self.used[eid] = [app] + [a for a in self.used.get(eid, []) if a != app][:USED_KEEP - 1]

    def opened(self, eid: str, app: str):
        self._use(eid, app)
        self._keep()

    def seen(self, eid: str, state: str, attrs: dict, apps: list[str]) -> bool:
        """A box playing something is what was last on. Returns True when that changed."""
        if state != "playing": return False
        title, app = attrs.get("media_title") or None, attrs.get("app_name") or None
        if not title and not app: return False
        was = self.last.get(eid) or {}
        if was.get("title") == title and was.get("app") == app: return False
        self.last[eid] = {"title": title, "app": app, "at": int(time.time())}
        if app in apps: self._use(eid, app)
        self._keep()
        return True
