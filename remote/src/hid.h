/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */
#pragma once
#include "keys.h"

struct bt_conn;

int hid_init(void);
void hid_connected(struct bt_conn *conn);
void hid_disconnected(struct bt_conn *conn);
void hid_send(const struct act *a);
