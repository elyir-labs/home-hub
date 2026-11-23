/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */

/* The remote's key rules, run on the computer: tests/run.sh. */
#include "../src/keys.h"

#include <stdio.h>
#include <stdlib.h>

static int failed;

#define CHECK(cond)                                                                                                    \
	do {                                                                                                           \
		if (!(cond)) {                                                                                         \
			printf("FAIL %s:%d %s\n", __FILE__, __LINE__, #cond);                                          \
			failed++;                                                                                      \
		}                                                                                                      \
	} while (0)

static struct keys k;
static struct act a[ACTS_MAX];

static int is_tap(int n, enum act_kind kind, uint16_t usage)
{
	return n == 2 && a[0].kind == kind && a[0].usage == usage && a[0].down && a[1].usage == usage && !a[1].down;
}

static void arrows_and_ok_follow_the_finger(void)
{
	keys_init(&k);
	int n = keys_press(&k, KEY_UP, true, 0, a);
	CHECK(n == 1 && a[0].kind == ACT_KEYBOARD && a[0].usage == HID_KB_UP && a[0].down);
	n = keys_press(&k, KEY_UP, false, 50, a);
	CHECK(n == 1 && !a[0].down);
	n = keys_press(&k, KEY_OK, true, 0, a);
	CHECK(n == 1 && a[0].usage == HID_KB_ENTER);
}

static void the_ring_is_the_sound(void)
{
	keys_init(&k);
	CHECK(is_tap(keys_turn(&k, 1, a), ACT_CONSUMER, HID_CC_VOLUME_UP));
	CHECK(is_tap(keys_turn(&k, -1, a), ACT_CONSUMER, HID_CC_VOLUME_DOWN));
	CHECK(keys_turn(&k, 0, a) == 0);
}

static void favorite_held_and_turned_is_the_lights_and_nothing_else(void)
{
	keys_init(&k);
	CHECK(keys_press(&k, KEY_FAVORITE_RIGHT, true, 0, a) == 0);
	CHECK(is_tap(keys_turn(&k, 1, a), ACT_CONSUMER, HID_CC_BRIGHTNESS_UP));
	CHECK(is_tap(keys_turn(&k, -1, a), ACT_CONSUMER, HID_CC_BRIGHTNESS_DOWN));
	CHECK(keys_tick(&k, 2000, a) == 0);
	CHECK(keys_press(&k, KEY_FAVORITE_RIGHT, false, 2100, a) == 0);
	CHECK(is_tap(keys_turn(&k, 1, a), ACT_CONSUMER, HID_CC_VOLUME_UP));
}

static void favorite_short_is_the_scene(void)
{
	keys_init(&k);
	keys_press(&k, KEY_FAVORITE_LEFT, true, 0, a);
	CHECK(keys_tick(&k, 300, a) == 0);
	CHECK(is_tap(keys_press(&k, KEY_FAVORITE_LEFT, false, 300, a), ACT_CONSUMER, HID_CC_BOOKMARKS));
}

static void favorite_long_is_held_until_let_go(void)
{
	keys_init(&k);
	keys_press(&k, KEY_FAVORITE_LEFT, true, 0, a);
	CHECK(keys_wait(&k, 100) == FAVORITE_LONG_MS - 100);
	int n = keys_tick(&k, FAVORITE_LONG_MS, a);
	CHECK(n == 1 && a[0].usage == HID_CC_BOOKMARKS && a[0].down);
	CHECK(keys_tick(&k, 900, a) == 0);
	n = keys_press(&k, KEY_FAVORITE_LEFT, false, 1500, a);
	CHECK(n == 1 && a[0].usage == HID_CC_BOOKMARKS && !a[0].down);
}

static void both_favorites_are_one_key(void)
{
	keys_init(&k);
	keys_press(&k, KEY_FAVORITE_LEFT, true, 0, a);
	keys_press(&k, KEY_FAVORITE_RIGHT, true, 50, a);
	CHECK(keys_press(&k, KEY_FAVORITE_LEFT, false, 100, a) == 0);
	CHECK(is_tap(keys_turn(&k, 1, a), ACT_CONSUMER, HID_CC_BRIGHTNESS_UP));
	CHECK(keys_press(&k, KEY_FAVORITE_RIGHT, false, 200, a) == 0);
}

static void home_tap_pairing_and_forgetting(void)
{
	keys_init(&k);
	keys_press(&k, KEY_HOME, true, 0, a);
	CHECK(is_tap(keys_press(&k, KEY_HOME, false, 200, a), ACT_KEYBOARD, HID_KB_HOME));

	keys_press(&k, KEY_HOME, true, 1000, a);
	CHECK(keys_wait(&k, 1000) == HOME_PAIRING_MS);
	int n = keys_tick(&k, 1000 + HOME_PAIRING_MS, a);
	CHECK(n == 1 && a[0].kind == ACT_PAIRING);
	CHECK(keys_wait(&k, 1000 + HOME_PAIRING_MS) == HOME_FORGET_MS - HOME_PAIRING_MS);
	n = keys_tick(&k, 1000 + HOME_FORGET_MS, a);
	CHECK(n == 1 && a[0].kind == ACT_FORGET);
	CHECK(keys_wait(&k, 1000 + HOME_FORGET_MS) == -1);
	CHECK(keys_press(&k, KEY_HOME, false, 12000, a) == 0);

	keys_press(&k, KEY_HOME, true, 20000, a);
	CHECK(keys_press(&k, KEY_HOME, false, 21500, a) == 0);
}

static void talk_is_held(void)
{
	keys_init(&k);
	int n = keys_press(&k, KEY_TALK, true, 0, a);
	CHECK(n == 1 && a[0].usage == HID_CC_VOICE && a[0].down && keys_talking(&k));
	keys_press(&k, KEY_TALK, false, 900, a);
	CHECK(!keys_talking(&k));
}

static void wait_survives_the_clock_wrapping(void)
{
	keys_init(&k);
	keys_press(&k, KEY_FAVORITE_LEFT, true, 0xFFFFFF00u, a);
	CHECK(keys_wait(&k, 0x00000010u) == FAVORITE_LONG_MS - 0x110);
}

int main(void)
{
	arrows_and_ok_follow_the_finger();
	the_ring_is_the_sound();
	favorite_held_and_turned_is_the_lights_and_nothing_else();
	favorite_short_is_the_scene();
	favorite_long_is_held_until_let_go();
	both_favorites_are_one_key();
	home_tap_pairing_and_forgetting();
	talk_is_held();
	wait_survives_the_clock_wrapping();
	printf(failed ? "%d failed\n" : "all passed\n", failed);
	return failed ? EXIT_FAILURE : EXIT_SUCCESS;
}
