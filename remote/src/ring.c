/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */

/* The ring: an Alps EC21A, 30 clicks and 15 pulses a turn, so a click is one edge of A, and only A rests at a fixed
   level on a click (B's level there is not specified). A click is counted when A has settled at a new level, which
   rides out contact bounce, and B read at that moment gives the way it turned. */
#include "ring.h"

#include <zephyr/drivers/gpio.h>
#include <zephyr/kernel.h>

#define SETTLE K_MSEC(1)

static const struct gpio_dt_spec a = GPIO_DT_SPEC_GET(DT_PATH(zephyr_user), ring_a_gpios);
static const struct gpio_dt_spec b = GPIO_DT_SPEC_GET(DT_PATH(zephyr_user), ring_b_gpios);

static struct gpio_callback edge_cb;
static struct k_work_delayable settle_work;
static ring_fn on_click;
static int last_a;

static void settled(struct k_work *work)
{
	ARG_UNUSED(work);
	int now = gpio_pin_get_dt(&a);
	if (now < 0 || now == last_a) {
		return;
	}
	last_a = now;
	on_click(now == gpio_pin_get_dt(&b) ? 1 : -1);
}

static void edge(const struct device *port, struct gpio_callback *cb, uint32_t pins)
{
	ARG_UNUSED(port);
	ARG_UNUSED(cb);
	ARG_UNUSED(pins);
	k_work_reschedule(&settle_work, SETTLE);
}

int ring_init(ring_fn fn)
{
	if (!gpio_is_ready_dt(&a) || !gpio_is_ready_dt(&b)) {
		return -ENODEV;
	}
	on_click = fn;
	k_work_init_delayable(&settle_work, settled);
	int err = gpio_pin_configure_dt(&a, GPIO_INPUT);
	err = err ?: gpio_pin_configure_dt(&b, GPIO_INPUT);
	if (err) {
		return err;
	}
	last_a = gpio_pin_get_dt(&a);
	gpio_init_callback(&edge_cb, edge, BIT(a.pin));
	err = gpio_add_callback(a.port, &edge_cb);
	return err ?: gpio_pin_interrupt_configure_dt(&a, GPIO_INT_EDGE_BOTH);
}
