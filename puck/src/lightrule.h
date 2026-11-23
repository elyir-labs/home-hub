// What the light says, as a rule with no hardware in it, so it can be held by a test on a laptop
// (native/test_light_native.cpp) as well as run on the puck.
//
// The light answers one question -- "is here good?" -- for somebody standing at a socket with the
// puck in their hand, and then gets out of the way. Four rows, strictly ordered (docs/puck-light.md):
//
//   1  anything wrong            the instrument. Outranks everything under it
//   2  well, not yet placed      green, until somebody taps "Leave it here"
//   3  placed, and asked for it  the nightlight
//   4  placed, and did not       dark
//
// What "well" means depends on what the puck carries. A puck bridging wall switches is well when it
// can hear them AND reach the hub, and it is far when it has looked for them and found none
// (design/puck/Placing.dc.html). A puck with nothing of that kind is well when it reached the hub,
// and far when there has been no Wi-Fi where it stands for half a minute (design/bridge-light/, A,
// chosen 5 October 2026).
//
// Once a bridge that carries switches is placed, nobody is standing at the socket, and the rule above
// turned a link that comes and goes into a strobe: warm, amber, red, warm. So a placed one answers with
// memory (design/puck-light/, C, chosen 23 November 2026): a loss under 20 seconds does not show, a
// longer one is slow amber that stays until the link has held for a minute, and red -- move me -- only
// after five minutes with nothing. The hub says that last one on the wall as well.
#pragma once
#include <stdint.h>
#include "light.h"

struct LightIn {
    bool broker;          // on the broker, which is the hub answering
    bool carries;         // a module with something to bridge (src/module.h, mod_carries)
    bool linkUp;          // ...and its link is up
    bool linkFar;         // ...and it has looked and found nothing in reach
    bool wifiLongDown;    // no Wi-Fi here for half a minute
    bool settled;         // somebody tapped "Leave it here"
    bool night;           // the nightlight is asked for
};

static const uint32_t SHAKY_AFTER_MS = 20000;     // a switch restarting, or a moment's noise, never shows
static const uint32_t STEADY_FOR_MS  = 60000;     // how long the link holds before slow amber clears
static const uint32_t FAR_AFTER_MS   = 300000;    // five minutes with no switch: then it really is "move me"

struct LightMemory {
    bool down = false;
    uint32_t downSince = 0;   // when the link last went
    uint32_t upSince = 0;     // when it last came back
    bool shaky = false;
};

inline Light lightFor(const LightIn &in);

// The rule with a memory. Placing and a bridge with nothing to carry keep the plain rule.
inline Light lightStep(LightMemory &m, const LightIn &in, uint32_t now) {
    if (!in.carries || !in.settled) { m = LightMemory(); return lightFor(in); }
    bool well = in.broker && in.linkUp;
    Light rest = in.night ? Light::Night : Light::Off;
    if (well) {
        if (m.down) { m.down = false; m.upSince = now; }
        if (m.shaky && now - m.upSince >= STEADY_FOR_MS) m.shaky = false;
        return m.shaky ? Light::Shaky : rest;
    }
    if (!m.down) { m.down = true; m.downSince = now; }
    uint32_t down = now - m.downSince;
    if (down >= SHAKY_AFTER_MS) m.shaky = true;
    if (down >= FAR_AFTER_MS) return Light::Far;
    return m.shaky ? Light::Shaky : rest;
}

inline Light lightFor(const LightIn &in) {
    bool well = in.broker && (!in.carries || in.linkUp);
    if (!well) return (in.carries ? in.linkFar : in.wifiLongDown) ? Light::Far : Light::Looking;
    if (!in.settled) return Light::Heard;
    if (in.night) return Light::Night;
    return Light::Off;
}
