# How an Elyir product starts

Every Elyir product with a screen starts the same way: *elyir* written by hand, the dot of the i
lighting like a lamp and breathing, then gliding into the product's own mark and breathing there
until the product is ready, when it opens onto the product. Chosen 7 October 2026 as J in
[`design/boot/`](../design/boot/); the board is the spec.

| File | What it is |
| --- | --- |
| `sequence.mjs` | The one source: the stroke, the dot, the house, the timings, the breath |
| `plymouth.mjs` | The boot splash as text, generated from the sequence |
| `render.mjs` | Draws the splash's images and writes the theme into `plymouth/elyir/` |
| `plymouth/elyir/` | The theme that ships, generated; do not edit by hand |
| `wall.sh`, `elyir-wall.service` | Keep the splash up until the product answers, let it end, then the panel full screen |
| `splash.sh` | The splash and a quiet boot around it, on a Pi's boot settings or a PC's GRUB |
| `elyir-splash.service` | On a hub with no wall (a NUC's monitor): the splash held until the hub answers, then its ending |
| `install.sh` | Sets all of it up on a unit with its own screen; first boot runs it when a DSI screen is connected, or on a Pi any screen |
| `screen-helper.py` | Beside the browser on every unit with a screen: which way up it is drawn, its restart, and a change of what the unit is, for the panel's This screen page |
| `turn.sh`, `elyir-screen-turn.*` | Turns the startup the way This screen turned the panel, on a Pi's boot line, from the next start |
| `role.sh`, `elyir-screen-role.*` | Makes this unit the hub or another hub's screen when This screen asks, by running first boot again |
| `screen-update.sh`, `elyir-screen-update.*` | On another hub's screen, every night: this unit's own part moved to the release its hub runs, checked like a hub's update |

**Changing it** goes board, then sequence, then render, the order AGENTS.md §1 sets:

```sh
# 1. the board in design/boot/ (J)
# 2. startup/sequence.mjs
node startup/render.mjs              # needs the panel's Playwright: cd app && npm ci
node --test startup/startup.test.mjs # fails while the three disagree; CI runs it
```

**A phone app** draws it itself, from `sequence.json` (`node startup/json.mjs` writes it; the test fails when it
is stale): all of J the first time it opens, the house breathing on every start after, and its own sentence when it
cannot reach anything (design/boot/, decided 19 October 2026).

**For another product**, the name and the lamp are the shared part, frame for frame. What the
product brings is where the dot lands (the hub's is the house) and the moment it is ready: its
service sends `plymouth update --status=elyir:ready`, and the splash plays its ending.

**Verified so far:** the script parses in Plymouth 22 on Debian Bookworm, the same release Raspberry
Pi OS is built on, and the test holds it to the board. Not yet: how it looks and moves on the wall's
own screen, the handoff from the splash to the browser, and the boot settings on a CM5. Those want
a unit on the bench.
