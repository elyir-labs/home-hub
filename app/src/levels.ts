// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* One step brighter or dimmer, warmer or cooler, more open or less: the level of a thing, moved by a
   press rather than a drag. The thermostat tile's + and - and the TV remote's Up and Down are the same
   press, so they share these. */

import type { Device } from './api'
import { cap, isDead, perform, store } from './store'

type Step = { action: string; data?: Record<string, unknown>; guess: { state?: string; attrs?: Record<string, any> } }

export const LIGHT_STEP = 10, COVER_STEP = 10, VOLUME_STEP = 5

export const dimmable = (d: Device) => !!(d.attrs.supported_color_modes ?? []).some((m: string) => m !== 'onoff')
export const lightPct = (d: Device) => d.state !== 'on' ? 0 : Math.round((d.attrs.brightness ?? 255) / 2.55) || 100
const clampPct = (v: number) => Math.max(0, Math.min(100, v))

export function tempUnit(): string { return (store.tempUnit || '°').replace(/[^°CF]/g, '') }
const tempStep = () => tempUnit().includes('F') ? 1 : 0.5

export function climateStep(d: Device, dir: 1 | -1): Step | null {
  const a = d.attrs, F = tempUnit().includes('F')
  if (d.state === 'off') return null
  const s = tempStep() * dir
  /* A thermostat that doesn't say what it takes gets a fallback in the house's unit, not a bare 5 and 35: those are
     Celsius, and against a house reading in Fahrenheit one press asked a 71° room for 35°. */
  const clamp = (t: number) => Math.min(a.max_temp ?? (F ? 90 : 32), Math.max(a.min_temp ?? (F ? 50 : 10), t))
  const range = d.state === 'heat_cool' && a.target_temp_low != null && a.target_temp_high != null
  if (range) {
    const lo = clamp(a.target_temp_low + s), hi = clamp(a.target_temp_high + s)
    return { action: 'set', data: { target_temp_low: lo, target_temp_high: hi }, guess: { attrs: { target_temp_low: lo, target_temp_high: hi } } }
  }
  if (a.sense_from) {
    const t = clamp((a.wanted ?? a.sense_temp ?? 20) + s)
    return { action: 'set', data: { temperature: t }, guess: { attrs: { wanted: t } } }
  }
  const t = clamp((a.temperature ?? a.current_temperature ?? 20) + s)
  return { action: 'set', data: { temperature: t }, guess: { attrs: { temperature: t } } }
}

/* What one press of Up (1) or Down (-1) asks of a thing, or null when it has no level to move. A light
   dimmed past its floor goes off, and one brightened from off comes on at the first step. */
export function stepOf(d: Device, dir: 1 | -1): Step | null {
  if (isDead(d)) return null
  const c = cap(d)
  if (c === 'light') {
    if (!dimmable(d)) return dir > 0 ? (d.state === 'on' ? null : { action: 'on', guess: { state: 'on' } }) : (d.state === 'on' ? { action: 'off', guess: { state: 'off' } } : null)
    const now = lightPct(d), to = clampPct(now + dir * LIGHT_STEP)
    if (to === now) return null
    if (to === 0) return { action: 'off', guess: { state: 'off' } }
    return { action: 'on', data: { brightness_pct: to }, guess: { state: 'on', attrs: { brightness: Math.round(to * 2.55) } } }
  }
  if (c === 'cover' && d.attrs.current_position != null) {
    const to = clampPct(Number(d.attrs.current_position) + dir * COVER_STEP)
    if (to === Number(d.attrs.current_position)) return null
    return { action: 'set', data: { position: to }, guess: { attrs: { current_position: to }, state: to > 0 ? 'open' : 'closed' } }
  }
  if (c === 'climate') return climateStep(d, dir)
  if (c === 'media' && d.attrs.volume_level != null && d.state !== 'off') {
    const to = clampPct(Math.round(d.attrs.volume_level * 100) + dir * VOLUME_STEP) / 100
    return { action: 'volume', data: { volume_level: to }, guess: { attrs: { volume_level: to } } }
  }
  return null
}

export function step(d: Device, dir: 1 | -1): boolean {
  const s = stepOf(d, dir)
  if (!s) return false
  perform(d, s.action, s.data, s.guess)
  return true
}

/* How far along its level a thing is, 0 to 1, for a meter; null when it has none. */
export function levelOf(d: Device): number | null {
  const c = cap(d)
  if (c === 'light') return dimmable(d) ? lightPct(d) / 100 : null
  if (c === 'cover') return d.attrs.current_position != null ? Number(d.attrs.current_position) / 100 : null
  if (c === 'media') return d.attrs.volume_level != null ? Number(d.attrs.volume_level) : null
  if (c === 'climate') {
    const F = tempUnit().includes('F'), lo = d.attrs.min_temp ?? (F ? 50 : 10), hi = d.attrs.max_temp ?? (F ? 90 : 32)
    const t = d.attrs.sense_from ? d.attrs.wanted : d.attrs.temperature
    return t == null ? null : Math.max(0, Math.min(1, (t - lo) / (hi - lo)))
  }
  return null
}
