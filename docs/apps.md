# Apps: the plan

*Written 12 September 2026, when the question was asked directly: a dedicated app for phone, tablet or desktop?
This is a plan for a decision, not a commitment to build. The decision itself waits on the relay in `docs/away.md`,
and the reason it can wait is the whole of the first section below.*

## Decided, 19 October 2026

**Native, and thin: Swift on iOS, Kotlin on Android, each a web view onto the Houses app. Not Capacitor, and not a
native panel.** Asked as "Capacitor, or native?", once the relay was carrying houses and the Houses app existed.

- **Why not Capacitor.** Its model is a web app bundled inside the binary, and the one thing this plan rules out is a
  panel that ships on the store's schedule instead of the hub's. Its remote-URL mode is documented as a development
  aid, not a way to ship. And it does not reach what an app is for: widgets, lock-screen controls, Siri, the Watch,
  Live Activities and critical alerts are WidgetKit and App Intents on iOS and Glance on Android whichever way the
  shell is built. A JavaScript bridge between two native layers buys nothing here.
- **What the shell opens is `houses.elyir.app`**, not a house. Since 3 October that is where every phone lives
  (`design/houses/`, B): it already lists the houses, opens the one whose Wi-Fi the phone is on, and frames each
  house's own panel. The shell adds the native pieces around it and nothing inside it.
- **The fork below is closed by the certificate.** Every house gets a real one on `elyir.app` (`docs/away.md`, step
  5), so the shell pins nothing and loads ordinary https like a browser does.
- **Push is the Houses app's**, one key for every house (`app/houses/public/sw.js`): web push from its worker in a
  browser, APNs and FCM from the shell. Not a worker per house -- the panel on a house's own name keeps no worker,
  and the Houses app's caches nothing on purpose.
- **The key is the phone's, as the printer app does it** (astromech's `docs/door.md`, *One push subscription for
  every printer*). A browser allows one subscription per worker, and the Houses app's one worker serves every house,
  so the phone makes the signing key once, subscribes with it, and hands each house it joins the subscription and
  the key. Each house keeps them in that phone's record in `phones.json` (0600), and Remove takes them with it. Two
  things follow, and *This hub* says them plainly: any house the phone has joined can notify it, and each such house
  holds that phone's key. This replaces `docs/messages.md`'s *the keypair is the hub's*.
- **The store app's notifications come through a sender Elyir runs, and it only ever carries sealed ones**
  (decided 19 October 2026). A web view inside an app has no web push, and APNs only takes notifications signed with
  Elyir's own key, which cannot sit on every house. So a small sender beside the relay (Terraform, like the rest)
  holds that key; a house hands it a notification already encrypted to a key only the phone has, with the phone's
  APNs token, and a Notification Service Extension in the app opens it on the phone. The sender and Apple see that a
  house sent something to a phone, and when, never what: the same as web push, and said the same way on *This hub*.
  A house proves itself to the sender with the secret it already holds for the relay. Android's FCM, later, the same.
- **The shells live in a repository of their own, `elyir-labs/home-hub-apps`, under Apache-2.0.** Not proprietary:
  there is nothing in a web view and four native pieces worth hiding, and what stops a lookalike in the store is the
  name and the icon, which are trademarks and are not licensed with the code. Not AGPL, for the store terms below.
  Not in this tree, because every hub clones it whole (the reason hardware moved out) and because one license per
  repository keeps the line obvious. Android still starts from `kiosk/`: its discovery and reconnecting are the
  maintainer's own code, so they can be carried over under the new license; the kiosk itself stays here.
- **One pretend house, in the browser, at `hub.elyir.com/try`.** (The site's word and address, decided 16 October
  in `design/site/`.) The panel built against the mock house running inside
  the page, no server behind it: each visitor gets a house of their own, and a reload puts it back. It lives on the
  hub's own site and ships with it (`site/`, Cloudflare Pages under Terraform), not on `elyir.app`: that zone is one
  flat list of names shared by houses, printers, Elyir Bench and whatever comes next, so a product's page has no
  business taking one of them, and not on `houses.elyir.app` either, the origin that holds every phone's passes. It
  serves three people at once: the website, which shows the real panel rather than a picture of it; App Review,
  which reaches it from the Houses app with no houses in it; and somebody who installs the app before the box
  arrives. Not bundled into the shell: that would put this AGPL panel inside the binary, and a copy in the binary
  is a panel that falls behind. The work is the mock's handler made runnable in a page (it is a Node server today,
  `app/mock/brain.mjs`) and a build of it `site/build.sh` copies in; the Houses app's way into it is a screen change,
  so it starts as a board.

### What the shell owes the page

Decided with `design/store-app/` (C, 19 October 2026), so the web half could be built before the shell exists:

- **It opens `https://houses.elyir.app/?shell=ios&store=US`**: `shell` is `ios` or `android`, `store` is the
  storefront as two letters (StoreKit gives three; the shell converts). The Houses app keeps both for the session
  and hands them to every house it frames (`app/houses/src/shell.ts`), and the panel reads them only when it is
  framed by the app (`readShell` in `app/src/inapp.ts`). A storefront nobody could read counts as not the US.
- **A `window.open` or `target="_blank"` to anywhere but a house goes to the system browser**, from any frame, and
  the shell allows it without a fresh tap (`javaScriptCanOpenWindowsAutomatically` on iOS): the panel opens the
  payment page right after the claim comes back, which is a beat after the tap. Paying never happens inside the
  app.

### What the page gives the shell

**The widget is one widget in two sizes** (`design/widget/`, decided 20 October 2026): small is A, one house's
name, its weather and its line, a tap opening that house; medium is C, the same line with **Bedtime** and
**Everything off** under it, the two routines the panel's own row has, run without opening anything. B, one thing
with a button that opens or unlocks it, waits for a rule about such a button on a home screen. The widget asks the
house itself, with the phone's own pass, at the house's Wi-Fi name at home and its own address away, never a
server of ours. So the page hands the shell what it needs for that, and the house answers it in its own words:

- **The houses.** Inside the store app (`shell` is `ios` or `android`), the Houses app posts its list whenever it
  loads or changes -- a house added, removed or renamed, a pass or a Wi-Fi name that changed -- and never outside
  it (`handHouses` in `app/houses/src/shell.ts`):
  iOS `window.webkit.messageHandlers.houses.postMessage({type: 'houses:list', houses: [...]})`, Android
  `window.HousesShell.postMessage(JSON.stringify({type: 'houses:list', houses: [...]}))`. Each house is
  `{id, name, origin, lan, token}`: `id` its label (`jordan` of `jordan.elyir.app`), `name` this phone's name for
  it, `origin` its https address, `lan` its Wi-Fi name or `null`, `token` its pass. The shell keeps them in the
  keychain for the widget.
- **The house opened.** `{type: 'houses:opened', id}`, the same two ways, each time a house is opened. The widget
  starts on the house opened last.
- **Opening a house from the widget.** The shell loads `https://houses.elyir.app/?shell=ios&store=XX&open=<id>`.
  `open` is the same label a notification uses; it comes off the address once read, and `shell` and `store` stay.
- **`GET /glance`** on the house, with the pass as `Authorization: Bearer` (or the cookie), behind the same door as
  `/health`: refused to a stranger, and from away answered only for a phone set to Anywhere. A starting hub
  answers 503. Otherwise:
  `{"name", "temp": "78°" | null, "sky": <the condition the panel draws its weather from> | null, "said": [...],
  "needs": <the first line of Needs a look, as it says it> | null, "count": <how many lines need a look>, "at": <epoch seconds>}`.
  `said` is one or two lines, written once in the brain (`brain/hub/glance.py`) from what it already holds, so
  nothing is asked of a device: *Everything is off*, *On in the Kitchen* or *On in 5 rooms*, counted the way the
  panel's "on right now" counts; then, only when the house can see its people, *Nobody home*, *1 person home* or
  *2 people home*.
- **The two routines** are the panel's own: `POST /home/intent/asleep` (Bedtime) and `POST /home/intent/away`
  (Everything off), with the same pass. Neither needs the passcode; from away, a phone set to Anywhere.

### What the stores will hold us to

Settled before any shell code, because three of them change what gets built rather than what gets filled in:

- **Selling the address inside the app.** Apple treats reaching your own house from away as a digital service used
  in the app, which is in-app purchase if it is bought there -- and it reads the panel inside the web view as the
  app. Outside the US the app may not even point at buying elsewhere. So the Houses app must know when it is inside
  the store app, and on which storefront, and leave the offer out where the store requires it. In the US a link out
  is allowed beside in-app purchase; Apple takes nothing on it today and asked the court in August 2026 for up to
  15%, so price it as unsettled. Google Play allows the link in the US; its fees follow the Epic settlement. This
  changes nothing about paying never happening on the wall.
- **A house for the reviewers.** Review rejects an app it cannot use, and a reviewer has no hub. The pretend house
  above has to exist before the first submission. It is also what keeps the
  app from reading as a bare website wrapper (guideline 4.2), with the widget and push.
- **The shell's license.** This repository is AGPL, and the App Store's terms have long been read as incompatible
  with the GPL family. The panel is served by the hub and never ships in the binary, so it is untouched; the shell's
  own code is licensed apart (Apache-2.0, above; `CLA.md` section 3 makes that possible) and takes no AGPL code from
  this tree.
- **Asked for by hand:** Apple's critical-alert entitlement (home security can qualify; time-sensitive needs no
  approval), the background-location declaration if phones ever report arriving (`docs/settings.md`), and on iOS the
  local-network reason with `_home-hub._tcp` listed. On Android 14+, full-screen notifications are for calls and
  alarms only.
- **Paperwork:** both accounts as an organization (Apple needs a D-U-N-S number; a personal Play account must run a
  closed test of 12 testers for 14 days first). Google's developer verification reaches `kiosk/` too, store or no
  store, so its package and key go under the same account. A privacy policy, Apple's privacy labels and Play's data
  safety form; in-app account deletion if the app ever creates an account. No *Home Assistant* or *Brilliant* in a
  listing. Updating the panel without review is ordinary web content; switching on a purchase flow reviewers never
  saw is not.

## The question, and the short answer

One native shell, phones only, after the relay carries its first tap from outside. Not a second panel, not now, and
not a desktop build at all.

Three questions were hiding in the one, and they have different answers:

| | Answer | Why |
|---|---|---|
| **Phone** | A thin shell around the panel, later | The web panel already is the app. Four capabilities are native-only and none of them can be used until the relay exists |
| **Tablet** | Already have it; build the kiosk instead | The wall is a tablet in a browser, which is right. What is missing is the thing that makes it *boot into* the panel |
| **Desktop** | No | A wall panel is not a desk. A laptop opens `hub.local` and is finished |

## Rules that do not change

- **The browser path stays complete, forever.** `docs/away.md`'s *Nothing to install* is not softened by this plan. A
  guest with a phone and no app gets the whole house, and anyone who never installs anything loses nothing but the four
  capabilities below, none of which is a way to control the house.
- **There is never a second client.** A shell is a web view onto the panel the hub itself serves, plus native
  capabilities that call the brain's own routes. Not a reimplementation of rooms, the command box or setup.
- **Nothing lives only in the app.** Any feature that exists in the shell and not in the browser makes the house
  smaller for the person who did not install it, which is the opposite of why this box exists.
- **The hub is still what ships.** `install.sh`, a version tag and a container. The shell is a fifth thing that
  versions on somebody else's schedule, and the plan below is shaped mostly by keeping that from mattering.

## Where this starts

The panel in `app/` is a Vue app the brain serves, added to a home screen from the code on the wall, and it already
does everything a phone needs to do: rooms, the command box, adding devices, joining and being let in. `index.html`
carries the home-screen meta, `public/manifest.json` makes it installable and standalone.

Two things are worth knowing before weighing a native app against it.

**There is no service worker.** Nothing in `app/src/` registers one, so what is installed today is an icon and a
full-screen browser — no offline shell, and on iOS web push is not even possible without one. The browser path is not
yet as good as the browser path can be, and some of what an app looks like it would fix is really that.

**The wall panel is not part of this question.** It is a device the hub's owner controls, on plain `http://hub.local`,
and it needs no certificate, no relay and no store. Everything below is about phones, except the kiosk section, which
is about the tablet on the wall being a tablet rather than a browser.

## What a phone shell would actually carry

The list is short, and that is the point. Everything not on it is either already true in a browser or is a satellite's
job in `docs/voice.md`.

| Capability | In the browser today | In a shell |
|---|---|---|
| **Widgets, lock-screen controls, Watch, Siri Shortcuts, CarPlay** | Impossible on iOS. Not "worse" — absent | The whole reason to consider one. *Garage — closed* on a lock screen is the most out-of-the-box thing in this product |
| **Alert-class push** | Web push works from a home-screen icon on a trusted origin, throttled, no critical alerts | Reliable, actionable, background. *Sam's iPhone wants to join* is fine on the web; a door unlocked at 2am is not |
| **Finding the house with no address** | `docs/away.md` already races the LAN against the public name, the way Plex does | Bonjour on the LAN, hub remembered, silent switch. A small improvement on a plan that already works |
| **Trusting the hub's own certificate authority** | A root certificate installed by hand, which fails the promise | Pinned at build time, invisible, no ACME anywhere. See the fork below |

And one that is not a capability: **an app in a store is what a customer looks for when they have bought a box.** Real,
and a reason the shell eventually exists rather than never. Not an engineering reason, and not urgent.

## The fork: the certificate, or the shell

Piece 3 of `docs/away.md` — a real certificate per hub, ACME over DNS-01, a Caddy built with a DNS provider module or
an ACME client in the brain, and the rough edge where a hub offline past a renewal window loses its name — exists
almost entirely **for browsers on phones**:

- The wall runs plain http and does not need it.
- Its microphone does not need it either: the kiosk captures audio natively and the hub recognizes it (settled 14
  September 2026; `docs/voice.md`, *The wall's microphone is the hub's ear*), so no secure context is ever asked for.
- Guests are LAN-only by rule, and the LAN is plain http, so a guest never meets it.
- What is left is a household's own phones, away from home, in a browser — plus web push and the phone microphone.

A shell that pins the hub's CA carries those three payloads and **deletes piece 3 from the hub entirely**. That is a
real simplification of the box: no ACME, no DNS credential minted per house, no renewal to lapse.

What it costs: two store accounts, two signing pipelines, and a review queue sitting between a bug and a house — in a
product whose update story is *one tap, and the code and the container move together*. It also trades a thing anyone
can open for a thing that must be installed first, which is the rule at the top of this file.

**Do not take this fork yet.** Piece 2, the relay, is unavoidable either way and is not started; a shell built before
it has nothing to connect to and no away case to serve. The honest decision point is the first tap from outside.

## Why a web view, and not a native panel

Because of the update story. The hub follows a channel and ships as a tag; an app follows a store. If the shell drew
rooms itself, every hub would have to keep answering a client from any month of the last two years, and a panel change
would land in a house only when Apple got round to it.

A web view has none of that: **the panel comes from the hub, so the UI always matches the hub it is talking to.** Only
the four native capabilities version independently, and each is small and additive enough to be written once and left
alone — a widget that reads `/health` and a room's state, a push registration, a Bonjour lookup, a pinned CA. When the
shell is older than the hub, it shows the newer panel and its widgets keep working. That is the whole design.

## The wall is a tablet, and the kiosk is the gap

Nothing here argues for a tablet app, but there is a real hole next to it. A tablet on the wall today is *a tablet with
a website open*: browser chrome, a screen that sleeps on its own schedule, a swipe that escapes to the home screen, and
nothing that brings it back after a power cut. The difference between that and a thing you hang on a wall is a small
Android kiosk launcher — full screen, screen kept awake, launch on boot, no way out without a gesture nobody finds by
accident.

It is cheaper than either app, it belongs to the out-of-the-box promise rather than to this plan, and it is the one
piece of native code here that is worth writing before the relay exists.

*Built, 13 September 2026: `kiosk/`. A home-screen launcher around a web view of the hub's own panel — full screen,
awake, home button leading back into the house, mDNS discovery for the tablets that cannot resolve `hub.local`, and
one way out in the clock's corner. `kiosk/README.md` has the build and the `dpm set-device-owner` step. One thing it
turned up for `docs/voice.md`: a WebView has no Web Speech API at all, so shape 1's browser microphone cannot run on
the wall as written. Settled 14 September 2026 -- the kiosk will capture audio natively and the hub will recognize it,
which makes shape 2 the wall's voice and leaves shape 1 to phones.*

## Desktop: no

A browser tab covers it completely. An Electron shell would be a third build target, a third signing story and a third
thing to update, serving a case that is already served. Recorded here so the question stops coming back.

## What to do now, either way

None of this is app work. All of it is work the browser path wants regardless, and all of it makes the shell cheaper
if it is ever built.

1. **Finish `docs/away.md` in its stated order** — the per-phone `remote` switch and the gate, then the relay. A shell
   needs every bit of it: pairing, tokens, the away tag, the name.
2. **Add a service worker to `app/`.** An offline shell for the panel, and the prerequisite for web push on iOS. It is
   also the hedge that matters: the better the browser path is, the longer the app stays optional.
3. **Keep the brain's routes the contract.** `/say`, `/phones`, `/health`, the live stream. A shell should need no
   route a browser does not already call, except a push registration.

## Open decisions

- **The fork above** — piece 3's certificate, or a pinned CA in a shell. Decide after the first tap from outside, not
  before. Both can be true: the certificate serves browsers, the shell pins as well, and the hub keeps one path.
- **iOS first, or both at once?** Widgets and the Watch are the reason to build at all, and they are the strongest on
  iOS. Android is where the kiosk launcher is needed. They may not be the same piece of work or the same month.
- **Does the shell ever hold a token of its own,** or is it exactly the phone cookie in `brain/hub/phones.py` in a
  native cookie store? Recommended the latter: one way in, one list under *This hub*, one Remove that works.
- **Who signs it, and under what name** — the same question as who runs the relay and who pays for the VPS in
  `docs/away.md`. It is the selling-a-box question again, not the building-one question.

## Milestones

1. **The kiosk launcher.** Independent of everything else here, and the wall stops being a browser. *Built.*
2. **Web push**, from the Houses app's worker rather than the panel's (decided 19 October, above), once the
   certificate in `docs/away.md` step 5 is on every house.
3. **The relay running** (`docs/away.md` pieces 2 and 3 up to the name). *Running since 2 October; this was the
   decision point, and the decision is at the top.*
4. **Before the shell, in the web:** the Houses app knowing it is inside the store app and on which storefront
   (`design/store-app/`), and the pretend house at `hub.elyir.com/try`, with the app's way into it
   (`design/pretend-in-app/`).
5. **The iOS shell** — a web view onto the Houses app, a push registration, a Bonjour lookup, and one widget with the
   App Intents behind it. No pinned CA any more. If the list grows past that in the planning, it has stopped being a
   shell and the plan is wrong.
6. **The Android shell**, in the same repository, starting from `kiosk/`'s discovery.
