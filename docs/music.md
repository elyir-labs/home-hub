# Music in every room

*Written 20 October 2026, when phase 1 was built to `design/music/` (A, with C's sentences, picked that day). This
document says what runs, how it is set up with nobody watching, what the household can do with it, and what comes
next. `docs/host-tiers.md` says why every hub gets it; `design/media/` owns films.*

## What a household can do

- **Put music on in a room.** A quiet speaker's card says Play something, and offers its last two things again.
  Play something opens one pane: what to play on the left, which rooms on the right, the room it came from already
  ticked. A tap plays it in the ticked rooms, in step.
- **Share it.** Music in two rooms is a row of rooms on the card. A tap takes a room out; its chip stays, drained,
  and is the way to put it back (AGENTS.md §4, the `done` map).
- **Say it.** "play late-night jazz in the kitchen", "play Dinner here", "music everywhere" (what is playing here,
  in every room), "stop the music". A fixed grammar (`brain/hub/commands.py`), no model. The command box only completes names the
  house has played before, so every suggestion runs as written.
- **Have it stop.** Sleep and All off stop it in the room; good night stops it everywhere. Nothing turns music on
  by itself.

Phase 1 plays **internet radio**, and the household's own music when the engine already has some. The pane's footer
says it plainly: radio and your own music play from the hub; Spotify plays on the speakers that have it built in.

## The engine

Music Assistant, rented the way Home Assistant is: `ghcr.io/music-assistant/server`, pinned in
`driver-layer/docker-compose.yml` (the `music` service and profile), host networking, its data in
`driver-layer/music-data`, under the `x-extra` caps with a 768 MB ceiling. Its own web page on :8095 is never linked
from anywhere.

`brain/hub/music.py` sets it up on the brain's own clock (`Hub._keep_music`, every minute until it answers, then
twice a day):

1. **An owner nobody types for.** The first time, `POST /setup` with a generated password, kept in the brain's
   settings as `music_engine`. Later, `POST /auth/login` with the same. If the engine has started over (its folder
   lost, or a restore without it), it has no owner, and the brain makes a new one.
2. **What it may run.** Internet radio (`radiobrowser`) is switched on. The engine's Spotify parts, its AirPlay
   receiver and its party page (a web address for guests into the engine's own screens) are removed if they are
   there; the engine switches the party page on by itself the first time it starts.
3. **The driver layer told where it is.** The brain walks Home Assistant's own setup flow for the engine. With the
   `my` integration loaded, HA sends a browser to the engine's login page; the brain answers that step itself, by
   calling HA's `/auth/external/callback` with the state HA issued and an engine session. Without it, HA asks for a
   key, and the brain makes a long-lived one. HA's own offer of the engine on the Add page, and its yearly request
   to sign in again, are hidden from the household (`OWN` in `brain/hub/onboarding.py`); the brain answers the
   second itself.

Both paths were run against the pinned engine and the pinned Home Assistant on a private Docker network, with two
silent squeezelite players: set up from nothing, a second run that changes nothing, a station found by name,
played in two rooms in step, one room taken out while the other played on, and stopped.

**Backups** carry `music-data` (without its caches) beside `brain-data`, so the engine's owner and the password
that opens it travel together.

## One speaker, not two

The engine hands every speaker it reaches back to Home Assistant as a second media player, so a Cast speaker
arrives twice. `Home.engine_players` in `brain/hub/model.py` pairs them by the id the engine gives its copy — the
speaker's own integration id (Cast, Sonos), or its entity id when the engine reaches it through Home Assistant —
and folds the copy into the speaker the house already shows. While the engine is playing on it, the card shows what
it plays; when it stops, the speaker's own state comes back. A speaker that only the engine can reach (an AirPlay
one) is the speaker.

**A player is a room, a name and a kind, and the kind is open.** `Music.players()` carries the kind for the brain;
the panel never sees it and never branches on it. A device of the house's own (a line-out puck playing in step
over Snapcast or Sendspin) is meant to arrive as one more kind with nothing on the screen changing.

## Seams for what comes next

- **Spotify** (decided 20 October 2026, until there is a partnership): only through speakers the house already owns
  that have it built in. The hub controls what is already playing there through the speaker's own integration. The
  engine's Spotify provider and its Spotify Connect plugin stay off and are never configured; the pinned image
  carries their binaries (and an AirPlay receiver's), and nothing runs them. `NEVER` in `brain/hub/music.py`
  removes them if anything ever switches them on.
- **The household's own files.** The drive question in setup (`docs/host-tiers.md`, *Storage*). Once a drive is
  found, the engine's local-files source is pointed at it; the pane's "Your own music" shelf already reads the
  library, and is empty until there is one. The engine's made-up playlists ("500 random tracks") are not shown to
  a house with no music of its own.
- **Films' music.** On Hub Plus, the engine can read the household's music from Jellyfin (`design/media/`, which
  sends Music on the TV to this pane with the TV's room chosen).
- **The wall's own speaker.** An open question on `design/music/canvas.json`: when a room has both, music goes to
  the real speaker.
- **A lamps rule for music.** None. "Lamps down while it plays" is films' (`design/media/`, D); if music ever gets
  one, it has to read the same.
