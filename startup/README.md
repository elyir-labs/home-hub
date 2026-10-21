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
| `say.sh`, `elyir-first-start.service` | A first start says which step it is on, and ends on Ready with a code to scan (`design/first-start/`) |
| `look.sh` | Runs the splash in real Plymouth, in Docker, through every moment, and reads the Ready codes back off the screen |
| `elyir-splash.service` | On a hub with no wall (a NUC's monitor): the splash held until the hub answers, then its ending |
| `install.sh` | Sets all of it up on a unit with its own screen; first boot runs it when a DSI screen is connected |

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

**A first start** (`design/first-start/`, decided 20 October 2026) says what it is doing: each step calls `say.sh step <name>` as it starts, and the line under the house becomes that step's. It ends, on a screen that is not a wall, on Ready: the house rises, and a code made from this hub's own Wi-Fi (or its address, on a cable) takes the middle, with the words under it. The splash can only draw pictures, so the hub's own words are set from letters drawn in advance, and the code is written by `say.sh` to `/run/elyir/code.png`.

**Run `startup/look.sh` after any change to the splash.** Plymouth's script language fails silently: a mistake is an empty screen on the unit, not an error. Three were caught this way that reading the script did not: it cannot take a string apart, a function is overwritten by a global of the same name, and it opens an image only by a path relative to the theme.

**Verified so far:** the script parses in Plymouth 22 on Debian Bookworm, the same release Raspberry
Pi OS is built on, and the test holds it to the board. Not yet: how it looks and moves on the wall's
own screen, the handoff from the splash to the browser, and the boot settings on a CM5. Those want
a unit on the bench.
