# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Everything the house says on its own, in one table. docs/messages.md.

A message used to be a string built where it was needed, so nothing could count the house's sentences,
route them, hold one back, or read them all in one sitting. Here each one has an id that never changes
(the log line, a push's tag and the panel's way of collapsing two about the same thing all key on it), a
class, a template with named holes, the sort of thing it is about, and its way back: the words on the
buttons that answer it. Call sites decide WHEN a message exists and fill its holes; the words are only
ever here.

The class is the one thing that will decide where a message goes, never the call site:

  receipt    the screen that asked, for a breath. The only class the panel may raise on its own
  house      a toast on every screen at home, and the log
  attention  the band until somebody answers it, and the log
  alert      the band, the log, and a push with a sound. The household's list, not ours: none ship

A message with more than one way of being said keeps them together under `also`, because they are one
message -- a light that has gone quiet is the same news whether or not the house knows since when.
"""
import json, string, time
from dataclasses import dataclass, field

CLASSES = ("receipt", "house", "attention", "alert")


@dataclass(frozen=True)
class Message:
    id: str
    cls: str
    text: str
    subject: str
    back: dict = field(default_factory=dict)
    more: str | None = None
    also: dict = field(default_factory=dict)


class _Fill(string.Formatter):
    """`{name!u}` starts a sentence with it, `{name!l}` puts it mid-sentence, `{why!S}` makes a reason
    somebody else wrote into a sentence of ours: a capital, and a full stop unless it has its own."""
    def convert_field(self, value, conversion):
        if conversion == "u": return value[:1].upper() + value[1:]
        if conversion == "l": return value[:1].lower() + value[1:]
        if conversion == "S": return value[:1].upper() + value[1:] + ("" if value[-1:] in (".", "!", "?") else ".")
        return super().convert_field(value, conversion)


_FILL = _Fill()

GONE_FOR_GOOD = {"do": "It’s gone, remove it", "act": "forget", "yes": "Yes, remove {name}",
                 "ask": "Remove {name} from the house? It comes off the app or account it came from too."}
PART_WAYS = {"restart": {"do": "Restart {name}", "act": "part"},
             "quick": {"do": "Quick restart", "act": "restart", "ask": "{name} did not come back. Restart the hub? Lights and switches keep working.",
                       "yes": "Quick restart", "no": "Not now"}}
UPDATE_AGAIN = {"again": {"do": "Try again", "act": "update"}}
BACK_UP = {"backup": {"do": "Back up", "act": "backup"}}
BRIDGE_TAIL = " Its switches still work on the wall — the hub just can’t see them. Plug it into the hub for a minute to set it right."

TABLE = (
    Message("device.offline", "attention", "{name} has not answered since {when}.", "device",
            back={"check": {"do": "Check again", "act": "check"}, "forget": GONE_FOR_GOOD},
            also={"unsure": "{name} is not answering."}),
    Message("bridge.quiet", "attention", "{name} has not answered since {when}." + BRIDGE_TAIL, "bridge",
            back={"forget": {"do": "It’s gone, remove it", "act": "bridge", "yes": "Yes, remove it", "no": "Keep it",
                             "ask": "Remove {name!l}? Its switches stop appearing here; they keep working on the wall."}},
            also={"moved": "{name} has not answered since the Wi‑Fi changed to {network}." + BRIDGE_TAIL,
                  "unsure": "{name} has not answered." + BRIDGE_TAIL}),
    Message("storage.low", "attention", "The hub's storage is nearly full: {left} left.", "hub"),
    Message("account.signed_out", "attention", "{name} needs signing in again.", "account",
            back={"sign_in": {"do": "Sign in again", "act": "flow"}},
            also={"titled": "{name} needs signing in again: {title}."}),
    Message("account.check", "attention", "{name} needs a setting checked.", "account",
            back={"check": {"do": "Check it", "act": "flow"}},
            also={"titled": "{name} needs a setting checked: {title}."}),
    Message("part.signed_out", "attention", "{name} needs signing in again.", "part"),
    Message("part.stopped", "attention", "{name} is not working. {why!S}", "part", back=PART_WAYS,
            also={"quiet": "{name} is not working."}),
    Message("part.unplugged", "attention", "{name} is not plugged in. {then}", "part", back=PART_WAYS,
            also={"bare": "{name} is not plugged in."}),
    Message("entry.failed", "attention", "{name} could not connect: {reason}", "entry",
            back={"again": {"do": "Try again", "act": "entry"}},
            also={"bare": "{name} could not connect."}),
    Message("hub.restarts", "attention", "The hub has restarted {count} times in the past hour. Something is wrong that restarting is not fixing.", "hub",
            back={"full": {"do": "Full restart", "act": "restart", "ask": "A quick restart has not helped. Try the next one up?",
                           "yes": "Yes, try that", "no": "Not now"},
                  "power": {"do": "Power off and on", "act": "restart", "ask": "A full restart has not helped. Try the next one up?",
                            "yes": "Yes, try that", "no": "Not now"}}),
    Message("hub.restarted_itself", "attention", "The hub stopped answering at {when} and started itself again. Nobody asked it to.", "hub"),
    Message("hub.power_lost", "attention", "The hub has lost power {count} times this week, and each time {part} did not start again by itself.", "hub",
            back=BACK_UP, more="A power cut can wear out the hub's memory card. A backup now means nothing is lost if it goes.",
            also={"several": "The hub has lost power {count} times this week, and each time part of the hub did not start again by itself."}),
    Message("hub.part_restarted", "attention", "{part!u} did not start again by itself {count} times this week, and the hub had to start it.", "hub",
            back=BACK_UP, more="Something is wrong that starting it again is not fixing. A backup now means nothing is lost if it gets worse.",
            also={"several": "Part of the hub did not start again by itself {count} times this week, and the hub had to start it."}),
    Message("update.refused", "house", "Version {version} could not be checked, so the hub did not install it. Nothing has changed and the house is working normally.", "hub",
            also={"unnamed": "The last update could not be checked, so the hub did not install it. Nothing has changed and the house is working normally."}),
    Message("update.put_back", "attention", "Version {version} did not start, so the hub put back the one it was on. Everything is working; you can try it again from here.", "hub",
            back=UPDATE_AGAIN,
            also={"unnamed": "The last update did not start, so the hub put back the one it was on. Everything is working; you can try it again from here."}),
    Message("update.stuck", "attention", "Version {version} did not start, and the hub could not put back the one it was on. Try it again; if this keeps happening, get in touch with us.", "hub",
            back=UPDATE_AGAIN,
            also={"unnamed": "The last update did not start, and the hub could not put back the one it was on. Try it again; if this keeps happening, get in touch with us."}),
    Message("update.unfinished", "attention", "The last update did not finish. You can try it again from here.", "hub", back=UPDATE_AGAIN),
    # The words of these three are somebody else's: the controller's (controller.py), the printer's own
    # screen, and the person who wrote the routine. The catalog gives them an id and a class, not a sentence.
    Message("strip.held", "attention", "{row}", "strip", back={"open": {"do": "Show me", "act": "open"}}),
    Message("printer.needs_you", "attention", "{headline}", "printer", back={"open": {"do": "Open {name}", "act": "printer"}}),
    Message("rule.note", "house", "{note}", "rule"),
)

CATALOG = {m.id: m for m in TABLE}


def say(mid: str, how: str | None = None, /, **holes) -> str:
    m = CATALOG[mid]
    return _FILL.vformat(m.also[how] if how else m.text, (), holes)


def said(mid: str, how: str | None = None, /, **holes) -> dict:
    """The fields every message carries wherever it is shown: what it is, its class, and its words."""
    m = CATALOG[mid]
    out = {"id": mid, "class": m.cls, "text": say(mid, how, **holes)}
    if m.more is not None: out["more"] = _FILL.vformat(m.more, (), holes)
    return out


def way(mid: str, button: str, to, /, **holes) -> dict:
    """One button that answers a message: its words, filled, and what it acts on."""
    w = CATALOG[mid].back[button]
    out = {"do": _FILL.vformat(w["do"], (), holes), "act": w["act"], "to": to}
    out.update({k: _FILL.vformat(v, (), holes) for k, v in w.items() if k not in ("do", "act")})
    return out


def stream(mid: str, subject, how: str | None = None, /, **holes) -> str:
    """A message as it goes down the stream to every screen."""
    s = said(mid, how, **holes)
    return json.dumps({"type": "message", "id": mid, "class": s["class"], "text": s["text"], "subject": subject, "at": time.time()})
