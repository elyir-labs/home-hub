// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// main/follow.h on the Mac: a strip behind a television following the colors the hub reads from it.
//
//     c++ -std=c++17 -O1 -o /tmp/follow test_follow_native.cpp && /tmp/follow
//     c++ -std=c++17 -O1 -DSTRIP_BOARD_REVA -o /tmp/follow test_follow_native.cpp && /tmp/follow
//
// (The -isysroot note in test_hub_uri_native.cpp applies here too.)
//
// The datagrams come from another program on another machine, so everything a wrong one could do to
// the light -- step it back, light it from somebody else's stream, leave it on a frozen frame after
// the film stops -- is held here rather than found behind a television.
#include "main/follow.h"

#include <initializer_list>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int failures = 0;

#define CHECK(cond, ...)                                    \
    do {                                                    \
        if (!(cond)) {                                      \
            printf("  FAIL: ");                             \
            printf(__VA_ARGS__);                            \
            printf("   (%s:%d)\n", __FILE__, __LINE__);     \
            failures++;                                     \
        }                                                   \
    } while (0)

static const uint8_t KEY[8] = {0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45, 0x67};

static size_t frame(uint8_t *out, uint8_t run, uint16_t seq, const uint8_t key[8], const uint8_t *rgb, int count)
{
    memcpy(out, "ELYF", 4);
    out[4] = 1;
    out[5] = run;
    out[6] = (uint8_t)(seq >> 8);
    out[7] = (uint8_t)seq;
    memcpy(out + 8, key, 8);
    out[16] = (uint8_t)(count >> 8);
    out[17] = (uint8_t)count;
    memcpy(out + 18, rgb, (size_t)count * 3);
    return 18 + (size_t)count * 3;
}

static follow::Verdict send(follow::Run &r, uint16_t seq, const uint8_t *rgb, int count, uint32_t now,
                            const uint8_t *key = KEY)
{
    static uint8_t d[follow::BIGGEST];
    const size_t n = frame(d, 0, seq, key, rgb, count);
    follow::Packet p;
    const follow::Verdict v = follow::parse(d, n, p);
    return v == follow::TAKEN ? r.take(p, now) : v;
}

static px::Pixels strip(int n)
{
    px::Pixels p;
    p.order.set("rgb");
    p.set_count(n);
    return p;
}

static void a_frame_parses() {
    printf("a well-made frame parses and is taken by the run armed with its key\n");
    const uint8_t rgb[6] = {10, 20, 30, 40, 50, 60};
    uint8_t d[64];
    const size_t n = frame(d, 1, 0x1234, KEY, rgb, 2);
    follow::Packet p;
    CHECK(follow::parse(d, n, p) == follow::TAKEN, "parsed");
    CHECK(p.run == 1 && p.seq == 0x1234 && p.count == 2, "run %d seq %04x count %d", p.run, p.seq, p.count);
    CHECK(!memcmp(p.key, KEY, 8) && p.rgb[0] == 10 && p.rgb[5] == 60, "key and colors where they belong");
    follow::Run *r = new follow::Run;
    r->arm(KEY);
    CHECK(r->take(p, 0) == follow::TAKEN && r->count == 2 && r->rgb[3] == 40, "taken");
    delete r;
}

static void wrong_frames_are_refused() {
    printf("wrong magic, version, run, count, length or key, and frames to an unarmed run, are refused\n");
    const uint8_t rgb[9] = {1, 2, 3, 4, 5, 6, 7, 8, 9};
    uint8_t d[64];
    follow::Packet p;
    size_t n = frame(d, 0, 1, KEY, rgb, 3);
    CHECK(follow::parse(d, 17, p) == follow::SHORT, "shorter than the header");
    CHECK(follow::parse(d, n - 1, p) == follow::BAD_LENGTH, "a color cut short");
    CHECK(follow::parse(d, 0, p) == follow::SHORT && follow::parse(nullptr, 40, p) == follow::SHORT, "nothing");
    d[n] = 0;
    CHECK(follow::parse(d, n + 1, p) == follow::BAD_LENGTH, "a byte past the colors");
    d[0] = 'X';
    CHECK(follow::parse(d, n, p) == follow::NOT_OURS, "magic");
    n = frame(d, 0, 1, KEY, rgb, 3);
    d[4] = 2;
    CHECK(follow::parse(d, n, p) == follow::OTHER_VERSION, "version");
    n = frame(d, 2, 1, KEY, rgb, 3);
    CHECK(follow::parse(d, n, p) == follow::NO_SUCH_RUN, "run 2 of 0..1");
    n = frame(d, 0, 1, KEY, rgb, 3);
    d[16] = 0; d[17] = 0;
    CHECK(follow::parse(d, 18, p) == follow::BAD_COUNT, "no colors");
    d[16] = 0x02; d[17] = 0x01;
    CHECK(follow::parse(d, 18 + 513 * 3, p) == follow::BAD_COUNT, "513 colors");

    follow::Run *r = new follow::Run;
    CHECK(send(*r, 1, rgb, 3, 0) == follow::UNARMED, "never armed");
    r->arm(KEY);
    const uint8_t other[8] = {0xde, 0xad, 0xbe, 0xef, 0x01, 0x23, 0x45, 0x66};
    CHECK(send(*r, 1, rgb, 3, 0, other) == follow::WRONG_KEY, "one bit off in the key");
    CHECK(!r->heard, "and nothing of it kept");
    CHECK(send(*r, 2, rgb, 3, 0) == follow::TAKEN, "the right key");
    r->disarm();
    CHECK(send(*r, 3, rgb, 3, 0) == follow::UNARMED, "disarmed");
    delete r;
}

static void the_key_from_arming() {
    printf("the arming message's key is sixteen hex digits, either case\n");
    uint8_t k[8];
    CHECK(follow::parse_key("DEADbeef01234567", k) && !memcmp(k, KEY, 8), "parsed");
    uint8_t keep[8];
    memcpy(keep, k, 8);
    CHECK(!follow::parse_key("deadbeef0123456", k), "fifteen");
    CHECK(!follow::parse_key("deadbeef012345678", k), "seventeen");
    CHECK(!follow::parse_key("deadbeef0123456g", k), "not hex");
    CHECK(!follow::parse_key(nullptr, k), "nothing");
    CHECK(!memcmp(k, keep, 8), "a refused key leaves the old one");
}

static void the_sequence_wraps_and_never_steps_back() {
    printf("the sequence wraps from 65535 to 0, and a late or repeated frame is dropped\n");
    CHECK(follow::newer(0, 65535) && follow::newer(5, 65530) && !follow::newer(65535, 0), "wrap-aware");
    CHECK(!follow::newer(7, 7) && follow::newer(8, 7) && !follow::newer(6, 7), "plain order");
    const uint8_t a[3] = {1, 1, 1}, b[3] = {2, 2, 2};
    follow::Run *r = new follow::Run;
    r->arm(KEY);
    uint32_t t = 1000;
    for (uint16_t s : {65533, 65534, 65535, 0, 1})
        CHECK(send(*r, s, a, 1, t += 33) == follow::TAKEN, "seq %u through the wrap", s);
    CHECK(send(*r, 65535, b, 1, t += 33) == follow::STALE, "65535 after 1 is late");
    CHECK(send(*r, 1, b, 1, t += 33) == follow::STALE, "1 again is a repeat");
    CHECK(r->rgb[0] == 1 && r->seq == 1, "and neither stepped the light back");
    CHECK(send(*r, 2, b, 1, t += 33) == follow::TAKEN && r->rgb[0] == 2, "2 is next");
    CHECK(send(*r, 0, a, 1, t += 1500) == follow::TAKEN, "after a silence a hub may count from 0 again");
    r->arm(KEY);
    CHECK(send(*r, 40000, a, 1, t += 10) == follow::TAKEN, "arming again starts a new count");
    delete r;
}

static void three_colors_over_ten_lights() {
    printf("three colors stretched over ten lights: the ends exact, between them a straight line\n");
    const uint8_t rgb[9] = {0, 0, 0, 100, 200, 50, 255, 10, 255};
    uint8_t first[3], last[3];
    follow::stretch(rgb, 3, 10, 0, first);
    follow::stretch(rgb, 3, 10, 9, last);
    CHECK(!memcmp(first, rgb, 3), "light 0 is color 0: %d %d %d", first[0], first[1], first[2]);
    CHECK(!memcmp(last, rgb + 6, 3), "light 9 is color 2: %d %d %d", last[0], last[1], last[2]);
    for (int i = 0; i < 10; i++) {
        uint8_t got[3];
        follow::stretch(rgb, 3, 10, i, got);
        const double x = i * 2.0 / 9.0;
        const int k = x >= 2 ? 1 : (int)x;
        const double f = x - k;
        for (int c = 0; c < 3; c++) {
            const double want = rgb[k * 3 + c] * (1 - f) + rgb[(k + 1) * 3 + c] * f;
            CHECK(fabs(got[c] - want) <= 0.5, "light %d channel %d is %d, want %.2f", i, c, got[c], want);
        }
    }
    uint8_t mid[3];
    follow::stretch(rgb, 3, 10, 4, mid);
    CHECK(mid[0] > 0 && mid[0] < 100 && mid[1] > 150 && mid[1] < 200, "light 4 is between colors 0 and 1");
    const uint8_t one[3] = {9, 8, 7};
    uint8_t got[3];
    follow::stretch(one, 1, 10, 6, got);
    CHECK(!memcmp(got, one, 3), "one color is the whole strip");
    follow::stretch(rgb, 3, 1, 0, got);
    CHECK(!memcmp(got, rgb, 3), "one light takes the first color");
}

// Frames every 33 ms, the run stepped every `dt`, from `t` to `until`. Returns the time reached.
static uint32_t run_for(follow::Run &r, uint16_t &seq, const uint8_t *rgb, int count, int n, uint32_t t,
                        uint32_t until, uint32_t dt, bool frames = true)
{
    uint32_t next = t;
    while (t < until) {
        t += dt;
        if (frames && t >= next) {
            send(r, ++seq, rgb, count, t);
            next = t + 33;
        }
        r.step(t, n);
    }
    return t;
}

static void easing_takes_a_time_constant_whatever_the_step() {
    printf("each light goes 63%% of the way in 120 ms, stepped at 1, 10, 30 or 120 ms\n");
    const uint8_t black[3] = {0, 0, 0}, white[3] = {255, 255, 255};
    for (uint32_t dt : {1u, 10u, 30u, 120u}) {
        follow::Run *r = new follow::Run;
        r->arm(KEY);
        uint16_t seq = 0;
        uint32_t t = run_for(*r, seq, black, 1, 4, 0, 2000, 10);
        CHECK(r->w == follow::FULL, "fully followed after two seconds (w %u)", r->w);
        send(*r, ++seq, white, 1, t);
        for (uint32_t gone = 0; gone < follow::EASE_MS; gone += dt) r->step(t += dt, 4);
        const int got = r->level(2, 1);
        CHECK(abs(got - 161) <= 2, "steps of %u ms: %d after one time constant, want 161 (63%% of 255)", dt, got);
        t = run_for(*r, seq, white, 1, 4, t, t + 2000, dt);
        CHECK(r->level(0, 0) == 255 && r->cur[0] == 255 << 8, "and arrives exactly (%u)", r->cur[0]);
        delete r;
    }
    CHECK(follow::ease(0) == 0 && follow::ease(1000000) == follow::FULL, "no time is no move; forever is all of it");
}

static void silence_hands_the_light_back() {
    printf("1.5 s with no frame eases back to the light's own picture, still armed, and frames bring it back\n");
    const uint8_t white[3] = {255, 255, 255};
    px::Pixels own = strip(5), out = strip(5);
    own.solid(0, 0, 200);
    follow::Run *r = new follow::Run;
    r->arm(KEY);
    uint16_t seq = 0;
    uint32_t t = run_for(*r, seq, white, 1, 5, 0, 2000, 10);
    r->compose(out, &own, true, 255);
    CHECK(out.buf[0] == 255 && out.buf[2] == 255, "following: white (%d %d %d)", out.buf[0], out.buf[1], out.buf[2]);
    const uint32_t last = r->heard_at;
    t = run_for(*r, seq, white, 1, 5, t, last + 1490, 10, false);
    r->compose(out, &own, true, 255);
    CHECK(out.buf[0] == 255 && r->live(t), "1.49 s of silence is still following");
    t = run_for(*r, seq, white, 1, 5, t, last + 1500 + 120, 10, false);
    r->compose(out, &own, true, 255);
    CHECK(!r->live(t) && out.buf[0] > 60 && out.buf[0] < 140, "a time constant past the silence, on its way back (%d)",
          out.buf[0]);
    t = run_for(*r, seq, white, 1, 5, t, t + 1500, 10, false);
    CHECK(r->w == 0 && r->owns(t), "all the way back, and one more frame to write");
    r->compose(out, &own, true, 255);
    CHECK(!memcmp(out.buf, own.buf, own.bytes_used()), "the light's own picture exactly (%d %d %d)", out.buf[0],
          out.buf[1], out.buf[2]);
    CHECK(!r->owns(t) && r->armed && !r->done(t), "drawn by the light again, and still armed");
    const uint8_t red[3] = {255, 0, 0};
    send(*r, ++seq, red, 1, t);
    r->step(t += 10, 5);
    r->compose(out, &own, true, 255);
    CHECK(r->owns(t) && r->level(0, 0) == 255 && r->level(0, 1) == 0, "frames again: the new picture, not the old one");
    t = run_for(*r, seq, red, 1, 5, t, t + 2000, 10);
    r->compose(out, &own, true, 255);
    CHECK(out.buf[0] == 255 && out.buf[1] == 0 && out.buf[2] == 0, "and following it");
    delete r;
}

static void disarming_hands_back_at_once() {
    printf("disarming eases back straight away, and then the run is done\n");
    const uint8_t white[3] = {255, 255, 255};
    px::Pixels own = strip(3), out = strip(3);
    own.solid(10, 20, 30);
    follow::Run *r = new follow::Run;
    r->arm(KEY);
    uint16_t seq = 0;
    uint32_t t = run_for(*r, seq, white, 1, 3, 0, 2000, 10);
    r->disarm();
    t = run_for(*r, seq, white, 1, 3, t, t + 120, 10);
    CHECK(!r->live(t) && r->w > follow::FULL / 4 && r->w < follow::FULL / 2, "a time constant later, a third left (%u)",
          r->w);
    t = run_for(*r, seq, white, 1, 3, t, t + 1500, 10);
    r->compose(out, &own, true, 255);
    CHECK(!memcmp(out.buf, own.buf, own.bytes_used()) && r->done(t), "the light's own, and done");
    delete r;
}

static void off_and_brightness_still_apply() {
    printf("the light's own off is dark and its brightness scales what is followed\n");
    const uint8_t c[3] = {200, 100, 50};
    px::Pixels own = strip(4), out = strip(4);
    own.solid(1, 2, 3);
    follow::Run *r = new follow::Run;
    r->arm(KEY);
    uint16_t seq = 0;
    run_for(*r, seq, c, 1, 4, 0, 2000, 10);
    r->compose(out, &own, true, 255);
    CHECK(out.buf[0] == 200 && out.buf[1] == 100 && out.buf[2] == 50, "full brightness: as sent");
    r->compose(out, &own, true, 128);
    CHECK(out.buf[0] == 200 * 128 / 255 && out.buf[1] == 100 * 128 / 255 && out.buf[2] == 50 * 128 / 255,
          "half brightness: %d %d %d", out.buf[0], out.buf[1], out.buf[2]);
    r->compose(out, &own, false, 255);
    for (size_t i = 0; i < out.bytes_used(); i++) CHECK(out.buf[i] == 0, "off is dark, byte %zu is %d", i, out.buf[i]);
    delete r;
}

static void a_steady_picture_is_written_once() {
    printf("a steady picture is not written again (a WS2812 latches), and the strip's order is kept\n");
    const uint8_t c[3] = {200, 100, 50};
    px::Pixels out = strip(6);
    out.order.set("grb");
    follow::Run *r = new follow::Run;
    r->arm(KEY);
    uint16_t seq = 0;
    uint32_t t = run_for(*r, seq, c, 1, 6, 0, 2000, 10);
    CHECK(r->compose(out, nullptr, true, 255), "the first frame is a change");
    CHECK(out.buf[0] == 100 && out.buf[1] == 200 && out.buf[2] == 50, "grb: %d %d %d", out.buf[0], out.buf[1], out.buf[2]);
    int writes = 0;
    for (int k = 0; k < 100; k++) {
        t = run_for(*r, seq, c, 1, 6, t, t + 25, 25);
        writes += r->compose(out, nullptr, true, 255);
    }
    CHECK(writes == 0, "two and a half seconds of the same colors wrote %d frames", writes);
    delete r;
}

static void a_strip_that_changes_length() {
    printf("a length told while following is picked up without reading past the colors kept\n");
    const uint8_t rgb[6] = {255, 0, 0, 0, 0, 255};
    px::Pixels out = strip(PX_MOST);
    follow::Run *r = new follow::Run;
    r->arm(KEY);
    uint16_t seq = 0;
    uint32_t t = run_for(*r, seq, rgb, 2, 10, 0, 2000, 10);
    t = run_for(*r, seq, rgb, 2, PX_MOST + 50, t, t + 50, 10);
    CHECK(r->n == PX_MOST, "held to the most a strip can have (%d)", r->n);
    r->compose(out, nullptr, true, 255);
    const int last = (PX_MOST - 1) * 3;
    CHECK(out.buf[0] == 255 && out.buf[2] == 0 && out.buf[last] == 0 && out.buf[last + 2] == 255,
          "ends are the two colors at the new length");
    delete r;
}

int main() {
    a_frame_parses();
    wrong_frames_are_refused();
    the_key_from_arming();
    the_sequence_wraps_and_never_steps_back();
    three_colors_over_ten_lights();
    easing_takes_a_time_constant_whatever_the_step();
    silence_hands_the_light_back();
    disarming_hands_back_at_once();
    off_and_brightness_still_apply();
    a_steady_picture_is_written_once();
    a_strip_that_changes_length();
    printf(failures ? "\n%d failed\n" : "\nfollow: all good\n", failures);
    return failures ? 1 : 0;
}
