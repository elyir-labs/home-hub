/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */

/* The remote as an ordinary Bluetooth keyboard with media keys, so the hub hears it exactly as it hears a bought
   remote: the TV screen's browser gets the same key names (app/src/tv.ts). */
#include "hid.h"

#include <bluetooth/services/hids.h>
#include <string.h>
#include <zephyr/bluetooth/conn.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/byteorder.h>
#include <zephyr/sys/util.h>

LOG_MODULE_REGISTER(hid, LOG_LEVEL_INF);

enum { REPORT_KEYBOARD, REPORT_CONSUMER };

#define KEYBOARD_LEN 8
#define CONSUMER_LEN 2

static const uint8_t report_map[] = {
	0x05, 0x01, 0x09, 0x06, 0xA1, 0x01, 0x85, 0x01,
	0x05, 0x07, 0x19, 0xE0, 0x29, 0xE7, 0x15, 0x00, 0x25, 0x01, 0x75, 0x01, 0x95, 0x08, 0x81, 0x02,
	0x95, 0x01, 0x75, 0x08, 0x81, 0x01,
	0x95, 0x06, 0x75, 0x08, 0x15, 0x00, 0x25, 0x65, 0x05, 0x07, 0x19, 0x00, 0x29, 0x65, 0x81, 0x00,
	0xC0,
	0x05, 0x0C, 0x09, 0x01, 0xA1, 0x01, 0x85, 0x02,
	0x15, 0x00, 0x26, 0xFF, 0x03, 0x19, 0x00, 0x2A, 0xFF, 0x03, 0x75, 0x10, 0x95, 0x01, 0x81, 0x00,
	0xC0,
};

BT_HIDS_DEF(hids, KEYBOARD_LEN, CONSUMER_LEN);

static struct bt_conn *host;
static uint8_t held[6];

int hid_init(void)
{
	struct bt_hids_init_param init = {0};
	struct bt_hids_inp_rep *rep = init.inp_rep_group_init.reports;

	init.rep_map.data = report_map;
	init.rep_map.size = sizeof(report_map);
	init.info.bcd_hid = 0x0101;
	init.info.b_country_code = 0x00;
	init.info.flags = BT_HIDS_REMOTE_WAKE | BT_HIDS_NORMALLY_CONNECTABLE;

	rep[REPORT_KEYBOARD].size = KEYBOARD_LEN;
	rep[REPORT_KEYBOARD].id = 1;
	rep[REPORT_CONSUMER].size = CONSUMER_LEN;
	rep[REPORT_CONSUMER].id = 2;
	init.inp_rep_group_init.cnt = 2;

	return bt_hids_init(&hids, &init);
}

void hid_connected(struct bt_conn *conn)
{
	if (bt_hids_connected(&hids, conn) == 0) {
		host = conn;
	}
}

void hid_disconnected(struct bt_conn *conn)
{
	bt_hids_disconnected(&hids, conn);
	if (conn == host) {
		host = NULL;
		memset(held, 0, sizeof(held));
	}
}

static void send(uint8_t index, const uint8_t *report, uint8_t len)
{
	if (!host) {
		return;
	}
	int err = bt_hids_inp_rep_send(&hids, host, index, report, len, NULL);
	if (err) {
		LOG_WRN("report %u not sent: %d", index, err);
	}
}

static void keyboard(uint16_t usage, bool down)
{
	int free = -1;
	for (int i = 0; i < (int)ARRAY_SIZE(held); i++) {
		if (held[i] == usage) {
			if (!down) {
				held[i] = 0;
			}
			goto report;
		}
		if (!held[i] && free < 0) {
			free = i;
		}
	}
	if (down && free >= 0) {
		held[free] = (uint8_t)usage;
	}
report:;
	uint8_t r[KEYBOARD_LEN] = {0};
	memcpy(&r[2], held, sizeof(held));
	send(REPORT_KEYBOARD, r, sizeof(r));
}

static void consumer(uint16_t usage, bool down)
{
	uint8_t r[CONSUMER_LEN] = {0};
	if (down) {
		sys_put_le16(usage, r);
	}
	send(REPORT_CONSUMER, r, sizeof(r));
}

void hid_send(const struct act *a)
{
	if (a->kind == ACT_KEYBOARD) {
		keyboard(a->usage, a->down);
	} else if (a->kind == ACT_CONSUMER) {
		consumer(a->usage, a->down);
	}
}
