/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */

/* What each touch of the remote sends (design/remote/, G). The remote stays simple and the hub decides: the ring
   sends the sound keys, and the hub turns them into the lights when nothing is playing. Only the chord is decided
   here, because only the remote knows a side key is being held while the ring turns. No Zephyr in this file, so it
   is tested on the computer (tests/run.sh). */
#pragma once
#include <stdbool.h>
#include <stdint.h>

enum key { KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_OK, KEY_HOME, KEY_TALK, KEY_FAVORITE_LEFT, KEY_FAVORITE_RIGHT };

enum act_kind { ACT_KEYBOARD, ACT_CONSUMER, ACT_PAIRING, ACT_FORGET };

struct act {
	enum act_kind kind;
	uint16_t usage;
	bool down;
};

#define HID_KB_UP 0x52
#define HID_KB_DOWN 0x51
#define HID_KB_LEFT 0x50
#define HID_KB_RIGHT 0x4F
#define HID_KB_ENTER 0x28
#define HID_KB_HOME 0x4A
#define HID_CC_VOLUME_UP 0xE9
#define HID_CC_VOLUME_DOWN 0xEA
#define HID_CC_BRIGHTNESS_UP 0x6F
#define HID_CC_BRIGHTNESS_DOWN 0x70
#define HID_CC_VOICE 0xCF
#define HID_CC_BOOKMARKS 0x22A

#define FAVORITE_LONG_MS 600
#define HOME_TAP_MS 1000
#define HOME_PAIRING_MS 3000
#define HOME_FORGET_MS 10000
#define ACTS_MAX 4

struct keys {
	bool favorite_left, favorite_right, turned, long_sent;
	uint32_t favorite_since;
	bool home, pairing_sent, forget_sent, talking;
	uint32_t home_since;
};

void keys_init(struct keys *k);
int keys_press(struct keys *k, enum key key, bool down, uint32_t now, struct act out[ACTS_MAX]);
int keys_turn(struct keys *k, int step, struct act out[ACTS_MAX]);
int keys_tick(struct keys *k, uint32_t now, struct act out[ACTS_MAX]);
/* Milliseconds until keys_tick has something to do, or -1 when nothing is waiting. */
int32_t keys_wait(const struct keys *k, uint32_t now);
bool keys_talking(const struct keys *k);
