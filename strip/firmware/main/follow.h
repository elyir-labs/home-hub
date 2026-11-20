// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Following a screen: a strip behind a television lit from what is on it (bias lighting), the colors
// read by a camera on the hub.
//
// THE ONE THING THAT IS STREAMED. look.h says why a look never is: boxes on a house's Wi-Fi cannot be
// kept in step by sending them frames, so each draws its own from a shared clock. Following is the
// deliberate exception. It is ONE box behind ONE television, so there is no seam to keep in step, and
// the picture is the film, which nothing on this box can draw. So the hub arms a run over MQTT and then
// sends it colors as UDP datagrams -- a broker in the middle is too slow and too bursty for thirty
// frames a second -- and this box only eases toward them.
//
// A LOST OR LATE DATAGRAM COSTS NOTHING ANYBODY SEES. Every light eases toward the newest colors over
// about EASE_MS, so a lost frame was never needed, and a late one is refused by its sequence rather
// than stepping the light back. Silence for QUIET_MS hands the strip back to its own light, eased,
// with the run still armed, so the picture comes back when the frames do. The household's own switch
// still wins throughout: off is dark, and the brightness scales what is followed.
//
// A frame, every number big-endian:
//
//   0-3    "ELYF"
//   4      version, 1
//   5      run, 0 or 1
//   6-7    sequence, wrapping
//   8-15   the key the run was armed with
//   16-17  how many colors, 1..512
//   18-    that many R,G,B, from the strip's first light to its last
//
// Free of ESP-IDF, so test_follow_native.cpp holds all of it on a Mac. app_main.cpp owns the socket,
// the arming message and the drawing loop.
#pragma once

#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "pixels.h"

namespace follow {

constexpr size_t HEAD = 18;
constexpr int MOST = 512;
constexpr size_t BIGGEST = HEAD + MOST * 3;
constexpr int KEY = 8;
constexpr uint8_t VERSION = 1;
constexpr uint32_t EASE_MS = 120;
constexpr uint32_t QUIET_MS = 1500;
constexpr uint32_t FULL = 65536;

enum Verdict : uint8_t { TAKEN, SHORT, NOT_OURS, OTHER_VERSION, NO_SUCH_RUN, BAD_COUNT, BAD_LENGTH, UNARMED,
                         WRONG_KEY, STALE };

struct Packet
{
    uint8_t run = 0;
    uint16_t seq = 0;
    const uint8_t *key = nullptr;
    uint16_t count = 0;
    const uint8_t *rgb = nullptr;
};

static inline uint16_t be16(const uint8_t *p) { return (uint16_t)((p[0] << 8) | p[1]); }

// Only the shape: whether the key and sequence are this run's is Run::take's to say.
static inline Verdict parse(const uint8_t *d, size_t n, Packet &p)
{
    if (!d || n < HEAD) return SHORT;
    if (memcmp(d, "ELYF", 4) != 0) return NOT_OURS;
    if (d[4] != VERSION) return OTHER_VERSION;
    if (d[5] > 1) return NO_SUCH_RUN;
    const uint16_t count = be16(d + 16);
    if (count < 1 || count > MOST) return BAD_COUNT;
    if (n != HEAD + (size_t)count * 3) return BAD_LENGTH;
    p.run = d[5];
    p.seq = be16(d + 6);
    p.key = d + 8;
    p.count = count;
    p.rgb = d + HEAD;
    return TAKEN;
}

// Whether `a` comes after `b` on a counter that wraps: half the circle ahead is later, half behind is
// earlier, so 0 follows 65535.
static inline bool newer(uint16_t a, uint16_t b) { return (int16_t)(uint16_t)(a - b) > 0; }

// The key as the arming message carries it: sixteen hex digits, either case, nothing else.
static inline bool parse_key(const char *hex, uint8_t out[KEY])
{
    if (!hex || strlen(hex) != KEY * 2) return false;
    uint8_t k[KEY];
    for (int i = 0; i < KEY * 2; i++) {
        const char c = hex[i];
        const int v = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10
                    : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1;
        if (v < 0) return false;
        if (i % 2 == 0) k[i / 2] = (uint8_t)(v << 4);
        else k[i / 2] |= (uint8_t)v;
    }
    memcpy(out, k, KEY);
    return true;
}

// Light i of n, from `count` colors laid evenly from the first light to the last: the ends are the
// first and last colors exactly, and a light between two of them is the straight line between.
static inline void stretch(const uint8_t *rgb, int count, int n, int i, uint8_t out[3])
{
    if (count < 2 || n < 2) {
        memcpy(out, rgb, 3);
        return;
    }
    const uint32_t num = (uint32_t)i * (uint32_t)(count - 1), den = (uint32_t)(n - 1);
    const uint32_t at = num / den, frac = num % den;
    const uint8_t *a = rgb + at * 3;
    if (!frac) {
        memcpy(out, a, 3);
        return;
    }
    const uint8_t *b = a + 3;
    for (int c = 0; c < 3; c++)
        out[c] = (uint8_t)(((int32_t)a[c] * (int32_t)(den - frac) + (int32_t)b[c] * (int32_t)frac + (int32_t)den / 2)
                           / (int32_t)den);
}

// How far toward its target a value moves in `dt` ms, out of FULL. From the elapsed time rather than
// per step, so the light moves the same way whether the loop ran at 100 Hz or stalled for a frame.
static inline uint32_t ease(uint32_t dt)
{
    if (!dt) return 0;
    const float a = 1.0f - expf(-(float)dt / (float)EASE_MS);
    const uint32_t q = (uint32_t)(a * (float)FULL + 0.5f);
    return q > FULL ? FULL : q;
}

// At least one unit a step, so a value arrives rather than creeping toward a target it never reaches
// -- a strip still changing by a fraction nobody can see would still be rewritten (AGENTS.md section 4).
static inline uint32_t toward(uint32_t v, uint32_t target, uint32_t a)
{
    if (v == target || !a) return v;
    const uint32_t d = v < target ? target - v : v - target;
    uint32_t s = (uint32_t)(((uint64_t)d * a) >> 16);
    if (!s) s = 1;
    if (s > d) s = d;
    return v < target ? v + s : v - s;
}

// ONE RUN'S FOLLOWING. `w` is how much of the picture is the followed colors rather than the light's
// own, out of FULL: it eases up while frames are arriving and back down when they stop or the run is
// disarmed, which is what makes both directions a fade rather than a jump -- and it fades against the
// light's own picture as drawn at that moment, so a moving look comes back moving.
struct Run
{
    bool armed = false;
    uint8_t key[KEY] = {};
    bool have_seq = false;
    uint16_t seq = 0;
    bool heard = false;
    uint32_t heard_at = 0;
    uint16_t count = 0;
    uint8_t rgb[MOST * 3] = {};
    uint16_t cur[PX_MOST * 3] = {};   // each light's eased color, in 1/256ths of a level
    int n = 0;
    bool fresh = true;                // `cur` is a picture from before a silence, not one to ease from
    uint32_t w = 0, shown_w = 0;
    bool stepped = false;
    uint32_t stepped_at = 0;

    // A new arming is a new stream, so its sequence starts wherever the hub's does.
    void arm(const uint8_t k[KEY])
    {
        memcpy(key, k, KEY);
        armed = true;
        have_seq = false;
    }
    void disarm() { armed = false; }

    bool live(uint32_t now) const { return armed && heard && now - heard_at < QUIET_MS; }
    // Whether this run's picture is drawn here rather than by the light's own drawing. One compose
    // past the moment `w` reaches nothing, so the last frame written is the light's own exactly.
    bool owns(uint32_t now) const { return live(now) || w > 0 || shown_w > 0; }
    bool done(uint32_t now) const { return !armed && !owns(now); }

    Verdict take(const Packet &p, uint32_t now)
    {
        if (!armed) return UNARMED;
        if (memcmp(p.key, key, KEY) != 0) return WRONG_KEY;
        // Compared only with a sequence heard lately: a hub that starts counting again after a restart
        // without arming again would otherwise be refused for half the counter, about eighteen minutes.
        if (have_seq && live(now) && !newer(p.seq, seq)) return STALE;
        have_seq = true;
        seq = p.seq;
        heard = true;
        heard_at = now;
        count = p.count;
        memcpy(rgb, p.rgb, (size_t)p.count * 3);
        return TAKEN;
    }

    uint8_t level(int i, int c) const { return (uint8_t)((cur[i * 3 + c] + 128) >> 8); }

    void step(uint32_t now, int pixels)
    {
        const uint32_t a = ease(stepped ? now - stepped_at : 0);
        stepped = true;
        stepped_at = now;
        if (pixels > PX_MOST) pixels = PX_MOST;
        if (pixels < 0) pixels = 0;
        const bool on = live(now);
        if (pixels != n) {
            n = pixels;
            if (heard) snap();
        } else if (heard && on && fresh) {
            snap();
        } else if (heard) {
            for (int i = 0; i < n; i++) {
                uint8_t t[3];
                stretch(rgb, count, n, i, t);
                for (int c = 0; c < 3; c++)
                    cur[i * 3 + c] = (uint16_t)toward(cur[i * 3 + c], (uint32_t)t[c] << 8, a);
            }
        }
        w = toward(w, on ? FULL : 0, a);
        if (!on && !w) fresh = true;
    }

    // The frame for this run into `out`: the followed colors at the light's brightness, faded against
    // `own`, which is the light's own picture drawn at the same size and order (null is dark). Off is
    // dark whatever is followed. Returns whether any byte changed, so a frame goes down the wire only
    // when it is a different one.
    bool compose(px::Pixels &out, const px::Pixels *own, bool on, uint8_t bri)
    {
        const int per = out.order.per_pixel();
        const uint32_t k = bri ? bri : 1;
        const int m = out.count < n ? out.count : n;
        bool changed = false;
        for (int i = 0; i < out.count; i++) {
            uint8_t px3[4] = {0, 0, 0, 0};
            if (on) {
                uint8_t f[4] = {0, 0, 0, 0};
                const uint32_t wi = i < m ? w : 0;
                if (i < m)
                    out.order.bytes((uint8_t)(level(i, 0) * k / 255), (uint8_t)(level(i, 1) * k / 255),
                                    (uint8_t)(level(i, 2) * k / 255), f);
                for (int c = 0; c < per; c++) {
                    const uint32_t o = own ? own->buf[i * per + c] : 0;
                    px3[c] = (uint8_t)((o * (FULL - wi) + f[c] * wi + FULL / 2) >> 16);
                }
            }
            uint8_t *at = &out.buf[i * per];
            if (memcmp(at, px3, per) != 0) {
                memcpy(at, px3, per);
                changed = true;
            }
        }
        shown_w = w;
        return changed;
    }

private:
    void snap()
    {
        for (int i = 0; i < n; i++) {
            uint8_t t[3];
            stretch(rgb, count, n, i, t);
            for (int c = 0; c < 3; c++) cur[i * 3 + c] = (uint16_t)(t[c] << 8);
        }
        fresh = false;
    }
};

}  // namespace follow
