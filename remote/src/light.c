/* SPDX-FileCopyrightText: 2026 Temitope Adeyeri */
/* SPDX-License-Identifier: AGPL-3.0-or-later */

/* The remote's one light, the lamp dot of the startup (design/boot/): dark while it is simply being used, breathing
   slowly while it waits to be joined to a hub, breathing quicker while it listens, and one short blink for done. It is
   an LED, so its amber is the emitter's own (red with a little green), never the panel's pastel. The PWM is only
   written while the light is moving or when it changes. */
#include "light.h"

#include <math.h>
#include <zephyr/drivers/pwm.h>
#include <zephyr/kernel.h>

#define FRAME_MS 40
#define SLOW_MS 3200
#define QUICK_MS 1200
#define BLINK_MS 160
#define GREEN_SHARE 0.28f

static const struct pwm_dt_spec red = PWM_DT_SPEC_GET(DT_NODELABEL(lamp_red));
static const struct pwm_dt_spec green = PWM_DT_SPEC_GET(DT_NODELABEL(lamp_green));

static struct k_work_delayable frame_work;
static enum light_mode mode = LIGHT_DARK;
static uint32_t started, blink_until;
static float shown = -1.0f;

static void show(float level)
{
	if (level == shown) {
		return;
	}
	shown = level;
	pwm_set_pulse_dt(&red, (uint32_t)(red.period * level));
	pwm_set_pulse_dt(&green, (uint32_t)(green.period * level * GREEN_SHARE));
}

static float breath(uint32_t since, uint32_t period)
{
	float phase = (float)(since % period) / (float)period;
	return 0.04f + 0.96f * (0.5f - 0.5f * cosf(2.0f * 3.14159265f * phase));
}

static void frame(struct k_work *work)
{
	ARG_UNUSED(work);
	uint32_t now = k_uptime_get_32();
	if ((int32_t)(blink_until - now) > 0) {
		show(1.0f);
		k_work_reschedule(&frame_work, K_MSEC(blink_until - now));
		return;
	}
	switch (mode) {
	case LIGHT_DARK:
		show(0.0f);
		return;
	case LIGHT_WAITING:
		show(breath(now - started, SLOW_MS));
		break;
	case LIGHT_LISTENING:
		show(breath(now - started, QUICK_MS));
		break;
	}
	k_work_reschedule(&frame_work, K_MSEC(FRAME_MS));
}

int light_init(void)
{
	if (!pwm_is_ready_dt(&red) || !pwm_is_ready_dt(&green)) {
		return -ENODEV;
	}
	k_work_init_delayable(&frame_work, frame);
	show(0.0f);
	return 0;
}

void light_set(enum light_mode m)
{
	if (m == mode) {
		return;
	}
	mode = m;
	started = k_uptime_get_32();
	k_work_reschedule(&frame_work, K_NO_WAIT);
}

void light_blink(void)
{
	blink_until = k_uptime_get_32() + BLINK_MS;
	k_work_reschedule(&frame_work, K_NO_WAIT);
}
