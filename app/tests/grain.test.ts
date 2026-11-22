// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { GRAIN, SPREAD, grainStyle } from '../src/grain'

describe('the grain over the sky', () => {
  it('is a shade or two either side of middle gray, so overlay smooths the ramps without lightening them', () => {
    expect(SPREAD).toBeLessThanOrEqual(16)
    expect(GRAIN).toBe(128)
  })
  it('is one grain to a device pixel', () => {
    expect(grainStyle(2.4)).toEqual({}) // no canvas outside a browser, so nothing is laid
  })
  it('lies over the veil, laid with overlay, and takes no touches', () => {
    const css = readFileSync('src/panel.css', 'utf8')
    const rule = css.match(/\n\.sky-grain \{([^}]*)\}/)![1]
    expect(rule).toMatch(/mix-blend-mode: overlay/)
    expect(rule).toMatch(/pointer-events: none/)
    const app = readFileSync('src/App.vue', 'utf8')
    expect(app.indexOf('class="sky-grain"')).toBeGreaterThan(app.indexOf('class="sky-veil"'))
  })
  it('lies over the TV\'s resting backgrounds too, under its words', () => {
    const rest = readFileSync('src/TvRest.vue', 'utf8')
    const at = rest.indexOf('class="tvrest-grain"')
    expect(at).toBeGreaterThan(rest.indexOf('class="tvrest-night"'))
    expect(at).toBeGreaterThan(rest.indexOf('class="tvrest-wash"'))
    expect(at).toBeLessThan(rest.indexOf('class="tvrest-moves"'))
    const css = readFileSync('src/panel.css', 'utf8')
    expect(css.match(/\n\.tvrest-grain \{([^}]*)\}/)![1]).toMatch(/mix-blend-mode: overlay/)
  })
})
