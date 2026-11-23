// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* Dark gradients drawn without bands, for a TV.

   A browser draws a gradient in whole shades, so a dark one across a 4K screen climbs a dozen shades in steps a
   hundred pixels wide, and a TV's processing shows each step as a ring (22 November 2026). Noise laid on afterwards
   can't help: the steps are already in the shades. What does is grain added before the shades are rounded, so a
   shade between two becomes a mix of both. A float16 canvas keeps the in-between until the screen rounds it, so the
   gradient is drawn there and the grain added on top, about three quarters of a shade either way: on the living
   room TV, a test of four strengths found this one clean and the stronger ones grainy. */

export const GRAIN_SHADES = 1.5   // the grain's whole spread, in shades: 0 to 1.5 added, centered near 0.75
const TILE = 128

let tile: HTMLCanvasElement | null = null
function noiseTile(): HTMLCanvasElement {
  if (tile) return tile
  tile = document.createElement('canvas')
  tile.width = tile.height = TILE
  const c = tile.getContext('2d')!
  const img = c.createImageData(TILE, TILE)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 256)
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255
  }
  c.putImageData(img, 0, 0)
  return tile
}

/* A canvas that keeps shades between shades, where the browser has one. Without it, no grain is added: on an 8-bit
   canvas it would land after the rounding and only add noise. */
export function floatContext(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D | null; float: boolean } {
  try {
    const ctx = canvas.getContext('2d', { colorType: 'float16' } as CanvasRenderingContext2DSettings)
    if (ctx && (ctx.getContextAttributes?.() as { colorType?: string } | undefined)?.colorType === 'float16') return { ctx, float: true }
    return { ctx, float: false }
  } catch { return { ctx: canvas.getContext('2d'), float: false } }
}

let floats: boolean | null = null
export function canFloat(): boolean {
  if (floats === null) floats = typeof document !== 'undefined' && floatContext(document.createElement('canvas')).float
  return floats
}

const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>()
/* The grain over everything drawn so far, one grain to a device pixel. */
export function grain(ctx: CanvasRenderingContext2D) {
  if (!patterns.has(ctx)) patterns.set(ctx, ctx.createPattern(noiseTile(), 'repeat'))
  const p = patterns.get(ctx)
  if (!p) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'lighter'
  ctx.globalAlpha = GRAIN_SHADES / 255
  ctx.fillStyle = p
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}

/* A CSS linear-gradient's line, for a canvas: the angle is CSS's (0 is up, turning clockwise). */
export function cssLine(w: number, h: number, deg: number): [number, number, number, number] {
  const a = deg * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a)
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
  return [w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half]
}
