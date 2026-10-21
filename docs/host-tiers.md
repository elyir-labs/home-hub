# Host tiers: what a hub is big enough for

*Written 20 October 2026, from the question "should the NUC also be a media player, and if the small box cannot
run it, should there be two models?" The answer is yes to both, as one software image that measures the machine
it lands on. This document owns the measuring, what each size is offered, and the rule that keeps the extras from
touching the house. `docs/voice.md` owns how big a voice model each size gets, `design/media/` owns films, and
`design/music/` owns music to the speakers. `docs/shipping.md` owns the hardware we sell.*

## The short answers

| Question | Answer |
|---|---|
| **Should a hub do more than run the house?** | Yes, where it can afford to: music to the speakers, films, camera recording, a local assistant. None of them is part of the house, and the house is complete without any of them. |
| **Two models?** | Yes. **Hub** runs the house, the command box, the voice and music. **Hub Plus** adds films, camera recording and the assistant. It is the same image; what a box is offered depends on what it measures. |
| **Does the Pi get films?** | No. A Pi has no video encoder, so a film plays on one TV and fails on the next. A household reads that as broken. The small hub spends its budget on the house. |
| **What keeps an extra from slowing a light?** | Every extra runs capped, at a quarter of the house's CPU weight, and first to go when memory runs out. A film never makes a switch slow. |

## The tiers

`driver-layer/host-tier.sh` looks once per install and update and writes the answer into `driver-layer/.env`.
Everything sized by the host reads it from there rather than looking again.

| `HOST_TIER` | Recognized by | Typical box | Product |
|---|---|---|---|
| `small` | under 8 GB | Pi 5 4 GB, an old two-core PC | the developer kit |
| `medium` | 8 GB or more, not x86 with 4 cores | Pi 5 8 GB, CM5 8 GB | **Hub** |
| `large` | x86-64, 4 cores or more, 8 GB or more | Intel N100/N150 mini PC, NUC | **Hub Plus** |
| `accelerated` | any of the above with an NVIDIA GPU, Hailo or Coral | a NUC with a GPU, a Pi with an AI board | depends on the box |

"8 GB" is tested as 7 GiB, and "16 GB" as 15 GiB, because that is what a machine sold at that size reports.

The tier is a size. Whether a feature is offered is a separate answer, `HOST_CAN`, because a size does not decide
everything. A Pi with an AI board is `accelerated` and still has no video encoder.

| `HOST_CAN` | Offered when | Why that test |
|---|---|---|
| `music` | always | The speakers do the decoding. Music Assistant reads a drive directly, so the household's own library plays on a Pi too. |
| `films` | a video encoder (`HOST_ENCODER` intel, amd or nvidia) and 8 GB | A film has to be converted for whatever TV asks for it. Without hardware for that it plays on some TVs and not others. |
| `cameras` | x86 with an encoder, 4 cores and 8 GB, or any accelerator | Spotting a person or a car in every frame needs an iGPU, a Coral, a Hailo or a GPU, not the CPU. |
| `assistant` | 16 GB, and x86 or an NVIDIA GPU | A local model worth answering with wants several gigabytes to itself, beside everything else. |

The voice follows `HOST_TIER` directly, using the table in `docs/voice.md`. That table's `VOICE_TIER` is this
`HOST_TIER`, and nothing writes a second one.

**Pinning.** `HOST_PINNED=1` in `.env` leaves every `HOST_*` line as somebody wrote it, for a box that measures
wrong or a test. Otherwise the answer is rewritten on every run, so a house restored onto a bigger box grows into it
and nobody has to tell it.

## The house comes first

This is the one rule that makes bundling safe. Bundling can go wrong in one main way: a film or a camera starts
competing with the house for the same machine.

Every extra's container takes the `x-extra` block in `driver-layer/docker-compose.yml`:

- **CPU weight 256** against the house's default 1024. Weight only matters when the machine is busy, which is
  exactly when it should matter: the engine, the brain and the radios get four times the CPU of any extra.
- **Every core but one** (`HUB_EXTRAS_CPUS`), so a core is always free for a tap even if an extra misbehaves.
- **Out-of-memory score +500**, so when memory runs out the kernel stops an extra, never the engine.
- **Disk weight 100** against the default 500, so a recording being written does not stall the engine's database.

Each extra also has a memory ceiling of its own:

| Extra | Memory ceiling | On |
|---|---|---|
| Music (Music Assistant) | 768 MB | every hub |
| Films (Jellyfin) | 3 GB | `films` |
| Cameras (Frigate) | 3 GB, plus 512 MB shared memory | `cameras` |
| Assistant (local model) | 8 GB | `assistant` |

The ceilings add up to more than a 16 GB box has left after the house, and that is on purpose. They are limits,
not reservations, and the out-of-memory score decides who goes if every extra peaks at once.

The voice is not an extra. Speech-to-text is how a command reaches the house, so it keeps the house's weight.

## Storage

Films and recordings need a disk the house does not. The system drive holds the house, and the extras' own data
(a library's index, a model) fits beside it on Hub Plus's 512 GB. The films themselves and the camera footage go on
a drive the household plugs in, found and named in plain words during setup, the way a radio stick is found today.
A hub with no such drive offers neither, rather than filling the drive the house runs from.

## What the panel says

The panel says what this hub is in plain words under This hub, for example "This hub plays music. Films and camera
recording need a bigger hub." It never shows a tier name or a list of capabilities. The setup offers only what
`HOST_CAN` allows, as questions ("Do you have films or shows of your own?"). How that looks is a board in
`design/`, drawn before any of it is built (AGENTS.md §1). It is not drawn yet.

## Open

- **Selling Hub Plus changes `docs/shipping.md`.** That document says x86 is bring-your-own until an ODM run makes
  sense. Hub Plus does not need an ODM: it is an off-the-shelf N100/N150 mini PC, 16 GB and 512 GB, flashed with the
  x86 image. That is the same process as the CM5's partner carrier, with one supplier's part number. It still
  needs a supplier, and a decision.
- **The brain does not read `HOST_CAN` yet.** It will once something offers an extra: music first
  (`design/music/`), then films (`design/media/`).

## Where this stands

- Built: `driver-layer/host-tier.sh`, run by `install.sh` on every install and update, with its rules pinned in the
  "what a machine is big enough for" group of `driver-layer/host/tests.sh`; the `x-extra` block in
  `driver-layer/docker-compose.yml`, used by nothing yet.
- Not built: anything that reads `HOST_CAN`, the extras themselves, the drive question in setup, the This hub line.
