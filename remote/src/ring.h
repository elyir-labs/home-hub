/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */
#pragma once

/* +1 or -1 for each click. Called from the system work queue. */
typedef void (*ring_fn)(int step);

int ring_init(ring_fn fn);
