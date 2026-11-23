/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */

/* The house's own remote (design/remote/, G: the stone). It first joins a hub as an ordinary Bluetooth remote, so the
   hub hears it exactly as it hears a bought one. Every key and every click of the ring goes through one queue to one
   thread, which owns the rules in keys.c and sends what they say.

   Joining: a remote that has never been joined can be joined by anything nearby. Once joined it only lets its own hub
   back in, and it opens to a new one only while Home is held for three seconds (a press on the thing itself, as for
   everything we make), for a minute. Ten seconds forgets every hub it knew. */
#include "hid.h"
#include "keys.h"
#include "light.h"
#include "ring.h"

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/services/bas.h>
#include <zephyr/bluetooth/uuid.h>
#include <zephyr/input/input.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/settings/settings.h>

LOG_MODULE_REGISTER(remote, LOG_LEVEL_INF);

#define PAIRING_WINDOW K_SECONDS(60)

enum { EV_KEY, EV_RING };

struct event {
	uint8_t what;
	int8_t step;
	bool down;
	uint16_t code;
};

K_MSGQ_DEFINE(events, sizeof(struct event), 32, 4);

static struct keys keys;
static struct bt_conn *current;
static bool pairing_open;
static struct k_work advertise_work;
static struct k_work_delayable pairing_close_work;

static const struct bt_data ad[] = {
	BT_DATA_BYTES(BT_DATA_GAP_APPEARANCE, CONFIG_BT_DEVICE_APPEARANCE & 0xff, (CONFIG_BT_DEVICE_APPEARANCE >> 8) & 0xff),
	BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
	BT_DATA_BYTES(BT_DATA_UUID16_ALL, BT_UUID_16_ENCODE(BT_UUID_HIDS_VAL), BT_UUID_16_ENCODE(BT_UUID_BAS_VAL)),
};

static const struct bt_data sd[] = {
	BT_DATA(BT_DATA_NAME_COMPLETE, CONFIG_BT_DEVICE_NAME, sizeof(CONFIG_BT_DEVICE_NAME) - 1),
};

static int key_of(uint16_t code)
{
	switch (code) {
	case INPUT_KEY_UP: return KEY_UP;
	case INPUT_KEY_DOWN: return KEY_DOWN;
	case INPUT_KEY_LEFT: return KEY_LEFT;
	case INPUT_KEY_RIGHT: return KEY_RIGHT;
	case INPUT_KEY_ENTER: return KEY_OK;
	case INPUT_KEY_HOME: return KEY_HOME;
	case INPUT_BTN_0: return KEY_TALK;
	case INPUT_BTN_1: return KEY_FAVORITE_LEFT;
	case INPUT_BTN_2: return KEY_FAVORITE_RIGHT;
	default: return -1;
	}
}

static void on_input(struct input_event *evt, void *user_data)
{
	ARG_UNUSED(user_data);
	if (evt->type != INPUT_EV_KEY) {
		return;
	}
	struct event e = {.what = EV_KEY, .code = evt->code, .down = evt->value != 0};
	k_msgq_put(&events, &e, K_NO_WAIT);
}
INPUT_CALLBACK_DEFINE(NULL, on_input, NULL);

static void on_ring(int step)
{
	struct event e = {.what = EV_RING, .step = (int8_t)step};
	k_msgq_put(&events, &e, K_NO_WAIT);
}

static void show(void)
{
	if (keys_talking(&keys)) {
		light_set(LIGHT_LISTENING);
	} else if (!current && pairing_open) {
		light_set(LIGHT_WAITING);
	} else {
		light_set(LIGHT_DARK);
	}
}

static void accept_bond(const struct bt_bond_info *info, void *data)
{
	int *count = data;
	if (bt_le_filter_accept_list_add(&info->addr) == 0) {
		(*count)++;
	}
}

static void advertise(struct k_work *work)
{
	ARG_UNUSED(work);
	if (current) {
		return;
	}
	bt_le_adv_stop();
	bt_le_filter_accept_list_clear();
	int bonds = 0;
	if (!pairing_open) {
		bt_foreach_bond(BT_ID_DEFAULT, accept_bond, &bonds);
		if (bonds == 0) {
			pairing_open = true;
		}
	}
	struct bt_le_adv_param param = BT_LE_ADV_PARAM_INIT(
		BT_LE_ADV_OPT_CONNECTABLE | (pairing_open ? 0 : BT_LE_ADV_OPT_FILTER_CONN),
		BT_GAP_ADV_FAST_INT_MIN_2, BT_GAP_ADV_FAST_INT_MAX_2, NULL);
	int err = bt_le_adv_start(&param, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
	if (err) {
		LOG_ERR("advertising did not start: %d", err);
	}
	show();
}

static void close_pairing(struct k_work *work)
{
	ARG_UNUSED(work);
	pairing_open = false;
	k_work_submit(&advertise_work);
}

static void open_pairing(void)
{
	pairing_open = true;
	k_work_reschedule(&pairing_close_work, PAIRING_WINDOW);
	light_blink();
	if (current) {
		bt_conn_disconnect(current, BT_HCI_ERR_REMOTE_USER_TERM_CONN);
	} else {
		k_work_submit(&advertise_work);
	}
}

static void connected(struct bt_conn *conn, uint8_t err)
{
	if (err) {
		k_work_submit(&advertise_work);
		return;
	}
	current = bt_conn_ref(conn);
	hid_connected(conn);
	bt_conn_set_security(conn, BT_SECURITY_L2);
	light_blink();
	show();
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
	ARG_UNUSED(reason);
	hid_disconnected(conn);
	if (conn == current) {
		bt_conn_unref(current);
		current = NULL;
	}
	show();
}

static void recycled(void)
{
	k_work_submit(&advertise_work);
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
	.connected = connected,
	.disconnected = disconnected,
	.recycled = recycled,
};

static enum bt_security_err pairing_accept(struct bt_conn *conn, const struct bt_conn_pairing_feat *const feat)
{
	ARG_UNUSED(conn);
	ARG_UNUSED(feat);
	return pairing_open ? BT_SECURITY_ERR_SUCCESS : BT_SECURITY_ERR_PAIR_NOT_ALLOWED;
}

static struct bt_conn_auth_cb auth = {
	.pairing_accept = pairing_accept,
};

static void pairing_complete(struct bt_conn *conn, bool bonded)
{
	ARG_UNUSED(conn);
	if (bonded) {
		pairing_open = false;
		k_work_cancel_delayable(&pairing_close_work);
		light_blink();
		show();
	}
}

static struct bt_conn_auth_info_cb auth_info = {
	.pairing_complete = pairing_complete,
};

static void act(const struct act *acts, int n)
{
	for (int i = 0; i < n; i++) {
		switch (acts[i].kind) {
		case ACT_KEYBOARD:
		case ACT_CONSUMER:
			hid_send(&acts[i]);
			break;
		case ACT_PAIRING:
			open_pairing();
			break;
		case ACT_FORGET:
			bt_unpair(BT_ID_DEFAULT, BT_ADDR_LE_ANY);
			open_pairing();
			break;
		}
	}
}

int main(void)
{
	keys_init(&keys);
	k_work_init(&advertise_work, advertise);
	k_work_init_delayable(&pairing_close_work, close_pairing);

	int err = light_init();
	err = err ?: ring_init(on_ring);
	err = err ?: hid_init();
	err = err ?: bt_conn_auth_cb_register(&auth);
	err = err ?: bt_conn_auth_info_cb_register(&auth_info);
	err = err ?: bt_enable(NULL);
	if (err) {
		LOG_ERR("could not start: %d", err);
		return 0;
	}
	settings_load();
	bt_bas_set_battery_level(100);
	k_work_submit(&advertise_work);

	struct act acts[ACTS_MAX];
	for (;;) {
		int32_t wait = keys_wait(&keys, k_uptime_get_32());
		struct event e;
		bool got = k_msgq_get(&events, &e, wait < 0 ? K_FOREVER : K_MSEC(wait)) == 0;
		uint32_t now = k_uptime_get_32();
		if (got && e.what == EV_RING) {
			act(acts, keys_turn(&keys, e.step, acts));
		} else if (got) {
			int key = key_of(e.code);
			if (key >= 0) {
				act(acts, keys_press(&keys, (enum key)key, e.down, now, acts));
			}
		}
		act(acts, keys_tick(&keys, now, acts));
		show();
	}
}
