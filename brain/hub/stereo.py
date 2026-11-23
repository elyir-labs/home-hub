# SPDX-FileCopyrightText: 2026 Temitope Adeyeri
# SPDX-License-Identifier: AGPL-3.0-or-later
"""Speakers that say they are one stereo pair (design/speaker-pair/, the "told" page, A, decided 22 November 2026).

Two AirPlay speakers set up as a left-and-right pair -- two HomePods beside a TV, say -- each tell the network so: the
same pair id, and which side they are. They can't be played apart, so the house doesn't ask whether they are a pair;
they are one card from the start, the way a pair the household said yes to is. The question stays for two speakers
that only happen to be playing the same song.

This only listens to what the speakers say about themselves. The music engine reaches the same speakers but keeps no
note of the pair, which is why the house has to hear it here.
"""
import asyncio, logging, re

log = logging.getLogger("hub.stereo")

SERVICE = "_airplay._tcp.local."


def address(deviceid: str | None) -> str | None:
    """A speaker's network address as the engine spells it in its player ids: twelve hex digits, no colons."""
    bare = re.sub(r"[^0-9a-f]", "", (deviceid or "").lower())
    return bare if len(bare) == 12 else None


def pairs_of(records: dict[str, dict]) -> set[frozenset[str]]:
    """{speaker: its announcement} -> the stereo pairs, each the two speakers' bare addresses. A speaker in a pair
    carries the pair's id ("pgid") and how many speakers the pair has ("pgm"); one that isn't in a pair carries neither."""
    by: dict[str, set[str]] = {}
    for txt in records.values():
        at, pair = address(txt.get("deviceid")), (txt.get("pgid") or "").upper()
        if at and pair and txt.get("pgm") == "2": by.setdefault(pair, set()).add(at)
    return {frozenset(s) for s in by.values() if len(s) == 2}


class Stereo:
    def __init__(self, changed):
        self.records: dict[str, dict] = {}
        self.pairs: set[frozenset[str]] = set()
        self._changed = changed

    async def watch(self):
        try:
            from zeroconf import ServiceStateChange
            from zeroconf.asyncio import AsyncServiceBrowser, AsyncServiceInfo, AsyncZeroconf
        except ImportError:
            log.info("stereo: no zeroconf here, so speaker pairs are only what the household says")
            return
        azc = AsyncZeroconf()

        async def look(name: str):
            info = AsyncServiceInfo(SERVICE, name)
            if not await info.async_request(azc.zeroconf, 3000): return
            self.records[name] = {k.decode(errors="replace"): (v or b"").decode(errors="replace") for k, v in info.properties.items()}
            self._settle()

        def on_change(zeroconf, service_type, name, state_change):
            # A speaker that goes quiet on the network keeps its pair: unplugged is not unpaired, and the card would
            # otherwise split in two while it is away. Unpairing changes what it announces, which comes here as Updated.
            if state_change is not ServiceStateChange.Removed: asyncio.ensure_future(look(name))

        browser = AsyncServiceBrowser(azc.zeroconf, SERVICE, handlers=[on_change])
        try: await asyncio.Event().wait()
        finally:
            await browser.async_cancel()
            await azc.async_close()

    def _settle(self):
        now = pairs_of(self.records)
        if now == self.pairs: return
        self.pairs = now
        log.info("stereo: %d pair(s) announced", len(now))
        self._changed(now)
