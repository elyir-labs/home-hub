/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */
#pragma once

enum light_mode { LIGHT_DARK, LIGHT_WAITING, LIGHT_LISTENING };

int light_init(void);
void light_set(enum light_mode mode);
void light_blink(void);
