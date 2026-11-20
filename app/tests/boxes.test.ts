// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* A streaming box on the wall and the phone (design/box-card/, B): which players are boxes, and what the card says asleep. */
import { describe, expect, it } from 'vitest'
import type { Device } from '../src/api'
import { asleepLines, isBox } from '../src/boxes'

const dev = (attrs: Record<string, any>, state = 'standby'): Device => ({ id: 'b', name: 'Apple TV', room_id: 'living', capability: 'media', state, attrs })

describe('a streaming box on the wall and the phone', () => {
  it('is a player the brain says is a box, with apps to open', () => {
    expect(isBox(dev({ box: true, apps: ['Netflix'] }))).toBe(true)
    expect(isBox(dev({ box: true, apps: [] }))).toBe(false)
    expect(isBox(dev({ apps: ['Netflix'] }))).toBe(false)
    expect(isBox(dev({ source_list: ['HDMI 1'] }))).toBe(false)
  })
  it('asleep, says Asleep rather than Off, and what was last on when the house knows it', () => {
    expect(asleepLines(dev({ box: true, apps: ['Netflix'], last_on: { title: 'The Bear', app: 'Disney+' } }))).toEqual({ title: 'Asleep', sub: 'Last on The Bear' })
    expect(asleepLines(dev({ box: true, apps: ['Netflix'] }))).toEqual({ title: 'Asleep', sub: '' })
  })
})
