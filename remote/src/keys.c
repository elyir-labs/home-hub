/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */

#include "keys.h"

#include <string.h>

static int put(struct act *out, int n, enum act_kind kind, uint16_t usage, bool down)
{
	out[n] = (struct act){.kind = kind, .usage = usage, .down = down};
	return n + 1;
}

static int tap(struct act *out, int n, enum act_kind kind, uint16_t usage)
{
	n = put(out, n, kind, usage, true);
	return put(out, n, kind, usage, false);
}

static bool favorite_held(const struct keys *k)
{
	return k->favorite_left || k->favorite_right;
}

void keys_init(struct keys *k)
{
	memset(k, 0, sizeof(*k));
}

bool keys_talking(const struct keys *k)
{
	return k->talking;
}

static const uint16_t KEYBOARD[] = {
	[KEY_UP] = HID_KB_UP, [KEY_DOWN] = HID_KB_DOWN, [KEY_LEFT] = HID_KB_LEFT,
	[KEY_RIGHT] = HID_KB_RIGHT, [KEY_OK] = HID_KB_ENTER,
};

static int favorite(struct keys *k, bool *side, bool down, uint32_t now, struct act *out)
{
	bool was = favorite_held(k);
	*side = down;
	bool is = favorite_held(k);
	if (!was && is) {
		k->favorite_since = now;
		k->turned = false;
		k->long_sent = false;
		return 0;
	}
	if (was && !is) {
		if (k->long_sent) {
			return put(out, 0, ACT_CONSUMER, HID_CC_BOOKMARKS, false);
		}
		if (!k->turned) {
			return tap(out, 0, ACT_CONSUMER, HID_CC_BOOKMARKS);
		}
	}
	return 0;
}

int keys_press(struct keys *k, enum key key, bool down, uint32_t now, struct act out[ACTS_MAX])
{
	switch (key) {
	case KEY_UP:
	case KEY_DOWN:
	case KEY_LEFT:
	case KEY_RIGHT:
	case KEY_OK:
		return put(out, 0, ACT_KEYBOARD, KEYBOARD[key], down);
	case KEY_TALK:
		k->talking = down;
		return put(out, 0, ACT_CONSUMER, HID_CC_VOICE, down);
	case KEY_FAVORITE_LEFT:
		return favorite(k, &k->favorite_left, down, now, out);
	case KEY_FAVORITE_RIGHT:
		return favorite(k, &k->favorite_right, down, now, out);
	case KEY_HOME:
		if (down) {
			k->home = true;
			k->home_since = now;
			k->pairing_sent = false;
			k->forget_sent = false;
			return 0;
		}
		if (!k->home) {
			return 0;
		}
		k->home = false;
		if (!k->pairing_sent && now - k->home_since < HOME_TAP_MS) {
			return tap(out, 0, ACT_KEYBOARD, HID_KB_HOME);
		}
		return 0;
	}
	return 0;
}

int keys_turn(struct keys *k, int step, struct act out[ACTS_MAX])
{
	if (step == 0) {
		return 0;
	}
	if (favorite_held(k)) {
		k->turned = true;
		return tap(out, 0, ACT_CONSUMER, step > 0 ? HID_CC_BRIGHTNESS_UP : HID_CC_BRIGHTNESS_DOWN);
	}
	return tap(out, 0, ACT_CONSUMER, step > 0 ? HID_CC_VOLUME_UP : HID_CC_VOLUME_DOWN);
}

int keys_tick(struct keys *k, uint32_t now, struct act out[ACTS_MAX])
{
	int n = 0;
	if (favorite_held(k) && !k->turned && !k->long_sent && now - k->favorite_since >= FAVORITE_LONG_MS) {
		k->long_sent = true;
		n = put(out, n, ACT_CONSUMER, HID_CC_BOOKMARKS, true);
	}
	if (k->home && !k->pairing_sent && now - k->home_since >= HOME_PAIRING_MS) {
		k->pairing_sent = true;
		n = put(out, n, ACT_PAIRING, 0, true);
	}
	if (k->home && !k->forget_sent && now - k->home_since >= HOME_FORGET_MS) {
		k->forget_sent = true;
		n = put(out, n, ACT_FORGET, 0, true);
	}
	return n;
}

static int32_t sooner(int32_t a, int32_t b)
{
	return a < 0 ? b : (b < 0 || a < b ? a : b);
}

int32_t keys_wait(const struct keys *k, uint32_t now)
{
	int32_t wait = -1;
	if (favorite_held(k) && !k->turned && !k->long_sent) {
		uint32_t gone = now - k->favorite_since;
		wait = sooner(wait, gone >= FAVORITE_LONG_MS ? 0 : (int32_t)(FAVORITE_LONG_MS - gone));
	}
	if (k->home && !k->forget_sent) {
		uint32_t gone = now - k->home_since;
		uint32_t at = k->pairing_sent ? HOME_FORGET_MS : HOME_PAIRING_MS;
		wait = sooner(wait, gone >= at ? 0 : (int32_t)(at - gone));
	}
	return wait;
}
