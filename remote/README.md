<!-- SPDX-FileCopyrightText: 2026 Temitope Adeyeri -->
<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# The remote

The house's own remote: the stone of `design/remote/` (direction G), a pebble with a ring that turns around a pad
that tilts to move and presses for OK, Home, a key to talk, and one Favorite key on each side. This is its firmware,
for a Nordic nRF52840, written on Zephyr (Nordic's nRF Connect SDK).

It first joins a hub as an ordinary Bluetooth keyboard with media keys, so the hub hears it exactly as it hears a
bought remote, and the TV screen's browser gets the key names it already knows (`app/src/tv.ts`). The remote stays
simple and the hub decides: the ring sends the sound keys, and the hub is the one that turns them into the lights
when nothing is playing. Only the chord is decided on the remote, because only the remote knows a side key is held
while the ring turns.

## What each touch sends

| Touch | Sent | The browser hears |
|---|---|---|
| Pad up, down, left, right | keyboard arrows, held while held | `ArrowUp` ... `ArrowRight` |
| Pad pressed (OK) | keyboard Enter, held while held | `Enter` |
| Home, a short press | keyboard Home | `Home` |
| Ring, a click either way | Volume Increment / Decrement | `AudioVolumeUp` / `AudioVolumeDown` |
| Ring while a Favorite key is held | Display Brightness Increment / Decrement | `BrightnessUp` / `BrightnessDown` |
| Favorite, a short press | AC Bookmarks | `BrowserFavorites` |
| Favorite, held 0.6 s without turning | AC Bookmarks, held until let go | `BrowserFavorites`, repeating |
| Talk, held | Voice Command, held while held | not known yet (see below) |
| Home held 3 s | opens joining for a minute (the light breathes) | nothing |
| Home held 10 s | forgets every hub, then opens joining | nothing |

A Favorite key held and turned sends only the lights: no scene when it is let go. Both Favorite keys are one key.

## Joining a hub

A remote that has never been joined can be joined by anything nearby, and its light breathes slowly until it is.
Once joined it lets only that hub back in. To join it to a different hub, hold Home for three seconds: it lets go of
the one it has, and for a minute anything nearby can join it. Holding Home for ten seconds forgets every hub it knew.
This is the press on the thing itself that everything we make asks for.

## On the dev board

Until the remote's own board exists (`remote/stone-board/` in the hardware repository), it runs on a **Seeed XIAO
nRF52840 Sense**, with the keys and the ring wired by hand. Every line is a switch to ground; the firmware turns the
pull-ups on.

| XIAO pin | Line |
|---|---|
| D0 | pad up |
| D1 | pad down |
| D2 | pad left |
| D3 | pad right |
| D4 | pad pressed (OK) |
| D5 | Home |
| D6 | Talk |
| D7 | Favorite, left side |
| D8 | Favorite, right side |
| D9 | ring A |
| D10 | ring B |
| GND | every switch's other side, and the ring's C |

The ring is an Alps EC21A1520401 and the pad an Alps SKRHABE010; `remote/ring-rig/` in the hardware repository has
their pins. Any push buttons will do for everything else. The light is the XIAO's own LED (red and green make the
amber). The XIAO's serial, I2C and SPI pins are among D0-D10, so the firmware switches those off and has no console.

## Building

Needs the nRF Connect SDK. Install it once:

```sh
# nrfutil, from https://www.nordicsemi.com/Products/Development-tools/nRF-Util, then:
nrfutil install sdk-manager
nrfutil sdk-manager search
nrfutil sdk-manager install --ncs-version <the newest v3.x it lists>
```

Then, from the SDK's shell (`nrfutil sdk-manager toolchain launch --ncs-version <version> --shell`):

```sh
west build -b xiao_ble/nrf52840/sense remote -d remote/build
```

To put it on the XIAO, double-tap its reset button: it shows up as a USB drive. Copy
`remote/build/remote/zephyr/zephyr.uf2` onto it.

The key rules in `src/keys.c` need no SDK and run on this computer:

```sh
remote/tests/run.sh
```

## Not done yet, and not known

- **It has never been built.** The SDK was not installed where it was written. Expect a first round of compile
  fixes; only `src/keys.c` has been compiled and tested.
- **The talk key does not talk yet.** It sends Voice Command, which the browser may report as `Unidentified`. The
  microphone (the XIAO Sense has one), sending speech to the hub, and the hub's side of it come next.
- **The hub does not act on the new keys yet.** The ring rule (sound while something plays, lights otherwise),
  `BrightnessUp`/`BrightnessDown` and `BrowserFavorites` are panel work, drawn on `design/remote/` G. The bought remote's
  key counter (`GET /remote/pressed`) will show what reaches the browser.
- **The hub's Linux may take some keys first.** Volume and brightness keys can be caught by the system before the
  browser sees them. To check on the living room hub.
- Waking when picked up, knowing its room, the battery level (it says 100% for now), "where is the remote", and
  sleeping between presses come with the remote's own board.
