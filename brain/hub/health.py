# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Health in plain words. The facts are already in the house: which devices have gone quiet and since when
(the event log), how full the hub's storage is, which driver parts want attention, whether the last update
finished. This turns them into a short list for one quiet place on the panel.

It used to only say. A page of nine true sentences with two buttons on it is a report, and a person who
opens it because the panel told them eight things need a look has been handed a report and no way out of
it. So two rules turn a sentence into a job.

**A fault is said once.** A radio that stops answering takes everything on it quiet with it, and a house
that reports that eight times has buried the one thing worth doing. The fault is the line; what went
quiet behind it rides along in `with`, named, so a person can see it is their front door and their
dimmer and not wonder. Fix the radio and the eight go together. This is why a device carries the entry
that brought it (model.Device.entry) and why Provision keeps what each entry is (Provision.domains):
without those two the panel can only show effects and never the cause.

**Every line carries what can be done about it,** in `acts`: `{do, act, to}`, and `ask`/`yes` where the
doing is worth a second's thought first -- the question and the words that answer it, both with the name
in them, because "Are you sure?" is not a question anybody can answer. The panel draws them as buttons and invents none of its own, because
it does not know what it is looking at. An empty `acts` is a line worth saying and not worth tapping --
which should be rare, and where it is not, the thing to fix is here rather than in the panel.

The sentences and the words on the buttons are messages.py's, by id. This file decides when a line exists
and what fills its holes.
"""
import shutil, time
from datetime import datetime
from .messages import said as message, way
from .model import kind_of
from .provision import PARTS
from .restart import DEEPER, HOUR, WEARY
from .settings import DATA

LOW_FREE = 2 * 1024 ** 3     # bytes; below this, or below a tenth of the disk, storage is "nearly full"
RETRIED = 10 * 60            # seconds a part counts as "already asked", so the next rung is offered instead

# Which integration each part the hub runs itself is, so the things on it can be gathered under it when it
# stops. The parts with no integration of their own (Zigbee, Ring) arrive over Messages and group under that.
PART_DOMAIN = {pid: domain for pid, _, _, domain, _ in PARTS if domain}

# What a thing is, for a line that has to help somebody walk to it. The panel's own KIND_WORD (api.py) is
# the label on a menu; these are the same idea in the middle of a sentence.
KIND_WORDS = {"light": "a light", "switch": "a plug", "fan": "a fan", "media": "a speaker", "cover": "a blind",
              "climate": "a thermostat", "lock": "a lock", "camera": "a camera", "vacuum": "a vacuum", "charger": "a car charger"}


def when(ts, tz, now=None) -> str:
    """'3:10 pm' today, 'yesterday', a weekday within the week, else 'Aug 30'."""
    now = now or time.time()
    d, n = datetime.fromtimestamp(ts, tz), datetime.fromtimestamp(now, tz)
    days = (n.date() - d.date()).days
    if days <= 0: return d.strftime("%-I:%M %p").lower()
    if days == 1: return "yesterday"
    if days < 7: return d.strftime("%A")
    return d.strftime("%b %-d")



def said(p: dict) -> dict:
    """A connection that is not working, as a sentence with its name in it. Its own line follows when
    there is one -- "Not plugged in. Plug a stick in..." says what to do, and an error's words are the
    only clue anybody has -- but never as a bare fragment after a colon."""
    name, text = p["name"], (p.get("text") or "").strip()
    if text.startswith("Not plugged in."):
        then = text[len("Not plugged in."):].strip()
        return message("part.unplugged", None if then else "bare", name=name, then=then)
    if not text or text.lower().startswith(("not working", "not running")): return message("part.stopped", "quiet", name=name)
    return message("part.stopped", name=name, why=text)

class Health:
    def __init__(self, hub): self.hub = hub

    def notes(self) -> list:
        """The jobs, causes first. A fault that explains a device takes it out of the list of its own, so
        a house with one dead radio has one line and not nine."""
        healed = getattr(self.hub, "healed", None)
        if healed: healed.take()
        gone = [d for d in self.hub.home.devices.values() if d.state == "unavailable" and d.room_id != "unassigned"]
        since = self.hub.log.last_by_subject("state", "unavailable") if gone else {}
        gone.sort(key=lambda d: since.get(d.id, float("inf")))
        faults = self.drivers(gone)
        claimed = {w["id"] for f in faults for w in f.get("with", ())}
        # A STRIP HELD DARK SORTS FIRST, because it is the one with a person's hands in the answer: the
        # controller is protecting it, and only somebody at the controller can put it right
        # (design/controller-panel/NeedsLookB.dc.html). It is answering, so it is never also "offline".
        strip = getattr(self.hub, "strip", None)
        held = strip.notes() if strip is not None and hasattr(strip, "notes") else []
        printers = getattr(self.hub, "printers", None)
        waiting = printers.notes() if printers is not None else []    # a printer that needs somebody, in its own words
        return (held + waiting + faults + self.offline([d for d in gone if d.id not in claimed], since)
                + self.bridges() + self.storage() + self.restarts() + (healed.notes() if healed else []) + self.update())

    def where(self, d) -> str:
        """Which room, and what sort of thing -- the two facts somebody needs to go and look at it. A name
        on its own ("Dimmer is offline") is a riddle in a house with more than one room."""
        room = self.hub.home.rooms.get(d.room_id)
        what = KIND_WORDS.get(kind_of(d).split(".")[0])
        return " · ".join(x for x in ((room.name if room else None), what) if x)

    def about(self, d) -> dict:
        """One quiet thing, as it rides along under the fault that took it."""
        return {"id": d.id, "name": d.name, "where": self.where(d)}

    def offline(self, gone, since: dict | None = None) -> list:
        """The things nothing else explains. Every one of them is here -- the list used to stop at five and
        end with "And 3 more things are offline", which is a sentence with nowhere to go. The panel folds
        a long list itself, where the fold can be opened."""
        if since is None: since = self.hub.log.last_by_subject("state", "unavailable") if gone else {}
        out = []
        for d in gone:
            ts = since.get(d.id)
            out.append({"kind": "offline", "subject": d.id, "since": ts, "where": self.where(d), "name": d.name,
                        **(message("device.offline", name=d.name, when=when(ts, self.hub.tz)) if ts else message("device.offline", "unsure", name=d.name)),
                        "acts": [way("device.offline", "check", d.id), way("device.offline", "forget", d.id, name=d.name)]})
        return out

    def bridges(self) -> list:
        """A bridge that never came back, and what to do with it.

        The move's own screen says this once and is then dismissed, which is right for a screen and
        wrong for the house: by morning nothing remembers that the Wi-Fi changed without two of the
        bridges. This is the remembering. docs/network.md, piece 6.

        The second sentence of each line is not decoration. A household whose panel has stopped
        showing the hallway lights will assume the hallway lights are broken, walk to the switch, and
        find that it works -- and now they distrust the panel rather than the bridge. Saying it first
        is the difference between a fault and a mystery.

        THE RECOVERY IS IN THE TEXT AND NOT IN A BUTTON, because it is a walk to a socket with a puck
        in your hand and there is no tap that performs it. What the panel can actually do is the one
        act here: agree the thing is gone for good.
        """
        out = []
        for b in self.hub.bridge.quiet():
            it = f"The {b['room']} bridge" if b["room"] else "A bridge"
            if b["missed"]: line = message("bridge.quiet", "moved", name=it, network=b["missed"])
            elif b["since"]: line = message("bridge.quiet", name=it, when=when(b["since"], self.hub.tz))
            else: line = message("bridge.quiet", "unsure", name=it)
            out.append({
                "kind": "bridge", "subject": b["chip"], "since": b["since"], "where": b["room"],
                "name": it, **line,
                "acts": [way("bridge.quiet", "forget", b["chip"], name=it)],
            })
        return out

    def storage(self) -> list:
        try: u = shutil.disk_usage(DATA)
        except OSError: return []
        if u.free < LOW_FREE or u.free < u.total / 10:
            gb = u.free / 1024 ** 3
            left = f"{gb:.1f} GB" if gb >= 1 else f"{u.free / 1024 ** 2:.0f} MB"
            return [{"kind": "storage", "subject": None, "since": None, "acts": [], **message("storage.low", left=left)}]
        return []

    def drivers(self, gone=()) -> list:
        """What the house talks through, where it has stopped talking -- and, under each one, the devices
        that went quiet with it.

        A device says which entry brought it and Provision says what each entry is, so a fault can claim
        its own: an account by the integration it signs into, a part of the driver layer by the integration
        it adds, something HA could not start by the entry it could not start. Nothing is claimed twice; the
        first fault that can explain a device keeps it.
        """
        out, claimed = [], set()
        domains = getattr(self.hub.provision, "domains", None) or {}
        by_domain, by_entry = {}, {}
        for d in gone:
            by_entry.setdefault(d.entry, []).append(d)
            if d.entry in domains: by_domain.setdefault(domains[d.entry], []).append(d)

        def took(*, domain=None, entry=None) -> list:
            pool = by_domain.get(domain, []) if domain else by_entry.get(entry, [])
            mine = [self.about(d) for d in pool if d.id not in claimed]
            claimed.update(w["id"] for w in mine)
            return mine

        # accounts waiting for a person. `flow` is the conversation that finishes it, so the panel can offer it here.
        for w in self.hub.provision.sign_ins:
            mid, act = ("account.check", "check") if w.get("source") == "reconfigure" else ("account.signed_out", "sign_in")
            who = w.get("kind") or w.get("title") or "An account"
            titled = bool(w.get("title") and w["title"] != who)
            out.append({"kind": "driver", "subject": w.get("handler"), "since": None,
                        **message(mid, "titled" if titled else None, name=who, title=w.get("title")),
                        "with": took(domain=w.get("handler")),
                        "acts": [way(mid, act, w["flow_id"])]})
        for p in self.hub.provision.summary():
            mine = took(domain=PART_DOMAIN.get(p["id"]))
            if p.get("state") == "sign-in":
                out.append({"kind": "driver", "subject": p["id"], "since": None, "acts": [], "with": mine,
                            **message("part.signed_out", name=p["name"])})
            elif p.get("state") == "failed":
                out.append({"kind": "driver", "subject": p["id"], "since": None, "with": mine, **said(p),
                            "acts": self.part_acts(p)})
            elif p.get("state") == "off" and mine:
                # A part that is simply not there is only news when something was depending on it. A Zigbee
                # stick nobody has plugged in is not a fault; a Zigbee stick six devices are waiting on is.
                out.append({"kind": "driver", "subject": p["id"], "since": None, "with": mine, **said(p),
                            "acts": self.part_acts(p)})
            else:
                claimed.difference_update(w["id"] for w in mine)   # a part that is fine explains nothing
        # something HA has but could not start. `retry` is the entry to ask again, once whatever it complained about is fixed.
        for q in self.hub.provision.problems:
            out.append({"kind": "driver", "subject": q.get("entry_id"), "since": None, "with": took(entry=q.get("entry_id")),
                        **message("entry.failed", None if q.get("reason") else "bare", name=q.get("title"), reason=q.get("reason")),
                        "acts": [way("entry.failed", "again", q.get("entry_id"))]})
        return out

    def part_acts(self, p: dict) -> list:
        """What to offer for a part that is not running, and when to offer the next rung.

        *Try again* was the only word here, and it is the right one exactly once: the first time, when
        somebody has just plugged the stick back in and the part is still inside its backoff. After
        that it is a restart and saying so is more honest -- and once the restart has been asked for
        and the part is still not answering, the button that did not work is not the button to offer
        again. That is the ladder in docs/restart.md, revealed at the point it is earned rather than
        drawn as a menu nobody can choose from.
        """
        tried = self.hub.provision.retried_at.get(p["id"], 0)
        acts = [way("part.stopped", "restart", p["id"], name=p["name"])]
        if time.time() - tried < RETRIED:
            acts.append(way("part.stopped", "quick", "hub", name=p["name"]))
        return acts

    def restarts(self) -> list:
        """Restarting that has stopped being a repair, and restarting nobody asked for.

        Two different lines and both matter. A hub that has been restarted three times in an hour has
        a fault that restarting is not fixing, and offering a fourth restart would be the panel
        joining in. A hub that restarted ITSELF is the one that must never be quiet about it: silent
        self-healing is how a household runs on a dying card for a year.
        """
        out, now = [], time.time()
        events = [e for e in self.hub.log.recent(limit=50, subject="restart", kinds=("home",)) if now - e["ts"] < HOUR]
        asked = [e for e in events if e["new"] == "asked"]
        if len(asked) >= WEARY:
            rung = asked[0]["old"]
            deeper = DEEPER.get(rung)
            out.append({"kind": "restart", "subject": None, "since": asked[-1]["ts"], **message("hub.restarts", count=len(asked)),
                        "acts": [way("hub.restarts", "full" if rung == "hub" else "power", deeper)] if deeper else []})
        # One that came back on its own. `source` is the host's watchdog rather than a person, and the
        # line says the time because that is the fact a household can act on.
        alone = next((e for e in events if e["new"] == "back" and e["source"] == "watchdog"), None)
        if alone:
            out.append({"kind": "restart", "subject": None, "since": alone["ts"], "acts": [],
                        **message("hub.restarted_itself", when=when(alone["ts"], self.hub.tz))})
        return out

    def update(self) -> list:
        """An update that did not finish, did not start, or could not be undone.

        All three end in the same *Try again*, because that is the only thing a household can do from
        the wall, and all three say the house is working -- which is true, and is the sentence somebody
        standing in front of a panel full of warnings most needs to read.
        """
        st = self.hub.updates.state() or {}
        state, bad = st.get("state"), st.get("bad")
        how = None if bad else "unnamed"
        if state == "refused":
            # Nothing was installed and nothing is broken, so this is news rather than a job. And it
            # carries no Try again: the same tap would refuse the same release, and sending somebody
            # round that loop is worse than telling them plainly that it is not theirs to fix.
            return [{"kind": "update", "subject": None, "since": st.get("finished"), "acts": [], **message("update.refused", how, version=bad)}]
        if state == "reverted": mid = "update.put_back"
        elif state == "failed" and st.get("reverted") is False: mid = "update.stuck"
        elif state == "failed": mid, how = "update.unfinished", None
        else: return []
        return [{"kind": "update", "subject": None, "since": st.get("finished"), **message(mid, how, version=bad),
                 "acts": [way(mid, "again", None)]}]
