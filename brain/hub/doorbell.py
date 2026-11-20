# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Somebody at the door: the doorbell's button, read so every screen can show who rang (design/tv-doorbell/, A).

A doorbell reaches Home Assistant as two parts of one unit: its camera, and its button. Home Assistant's own
Ring integration and most others give the button as an `event` entity of class doorbell, whose state is the time of
the last press; ring-mqtt gives a `binary_sensor` named Ding that turns on for the press. The camera in the same
unit is the picture to show. A press is a change of that state, never its first reading: a hub starting up reads
the last ring, and that is history.
"""

GONE = (None, "", "unknown", "unavailable")


def is_button(entity_id: str, device_class: str | None) -> bool:
    if entity_id.startswith("event."): return device_class == "doorbell"
    return entity_id.startswith("binary_sensor.") and entity_id.endswith("_ding")


def rang(entity_id: str, old: dict | None, new: dict | None) -> bool:
    was, now = (old or {}).get("state"), (new or {}).get("state")
    if entity_id.startswith("event."): return was not in GONE and now not in GONE and now != was
    return was == "off" and now == "on"


def buttons(entities: list[dict], states: list[dict], cameras: dict[str, str]) -> dict[str, str]:
    """Each doorbell button's entity id -> the camera device in the same unit. `cameras` is unit -> camera id."""
    classes = {s["entity_id"]: (s.get("attributes") or {}).get("device_class") for s in states}
    out = {}
    for e in entities:
        eid, unit = e.get("entity_id", ""), e.get("device_id")
        if unit not in cameras: continue
        if is_button(eid, e.get("original_device_class") or e.get("device_class") or classes.get(eid)): out[eid] = cameras[unit]
    return out
