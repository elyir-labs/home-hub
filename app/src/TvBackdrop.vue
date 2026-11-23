<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* A resting face's background on a TV, drawn between shades with grain so its dark ramps don't band (dither.ts):
   the bedtime glow, the board's, and the blurred cover behind what is playing. Each is the same as its CSS class,
   stop for stop; anywhere the browser can't keep shades between shades, and on a wall, the CSS class is used. */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { cssLine, floatContext, grain } from './dither'

const props = defineProps<{ kind: 'night' | 'board' | 'wash'; art?: string | null; dithered: boolean }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const css = { night: 'tvrest-night', board: 'tvrest-boardbg', wash: 'tvrest-wash' }[props.kind]
let cover: HTMLImageElement | null = null, ro: ResizeObserver | undefined

function lamp(): string { return getComputedStyle(document.documentElement).getPropertyValue('--lamp-rgb').trim() || '233, 184, 114' }

function paint() {
  const c = canvas.value; if (!c) return
  const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr))
  c.width = W; c.height = H
  const { ctx, float } = floatContext(c); if (!ctx) return
  const k = W / c.clientWidth   // device pixels to one of the face's own (it is 1920 across, scaled)
  if (props.kind === 'night') {
    // radial-gradient(60% 50% at 30% 100%, #1a1830, transparent 70%), #08090e
    ctx.fillStyle = '#08090e'; ctx.fillRect(0, 0, W, H)
    ctx.save(); ctx.translate(W * .3, H); ctx.scale(W * .6, H * .5)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    g.addColorStop(0, 'rgba(26, 24, 48, 1)'); g.addColorStop(.7, 'rgba(26, 24, 48, 0)')
    ctx.fillStyle = g; ctx.fillRect(-1, -2, 2, 2); ctx.restore()
  } else if (props.kind === 'board') {
    // linear-gradient(160deg, #1b2030, #11131b)
    const g = ctx.createLinearGradient(...cssLine(W, H, 160))
    g.addColorStop(0, '#1b2030'); g.addColorStop(1, '#11131b')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  } else {
    // .tvrest-wash: the cover over #0d1420 with the lamp's tint, blurred 90px and at .8 over the night; then .tvrest-dim
    ctx.fillStyle = '#0c0d10'; ctx.fillRect(0, 0, W, H)
    const pad = 120 * k, bw = W + pad * 2, bh = H + pad * 2
    const off = document.createElement('canvas'); off.width = Math.ceil(bw); off.height = Math.ceil(bh)
    const o = off.getContext('2d')!
    o.fillStyle = '#0d1420'; o.fillRect(0, 0, bw, bh)
    if (cover?.naturalWidth) {
      const s = Math.max(bw / cover.naturalWidth, bh / cover.naturalHeight), iw = cover.naturalWidth * s, ih = cover.naturalHeight * s
      o.drawImage(cover, (bw - iw) / 2, (bh - ih) / 2, iw, ih)
    } else {   // the lamp's tint is the wash's own picture until a cover takes its place, as the page's style does
      o.save(); o.translate(bw * .25, bh * .45); o.scale(bw * .4, bh * .5)
      const t = o.createRadialGradient(0, 0, 0, 0, 0, 1)
      t.addColorStop(0, `rgba(${lamp()}, .18)`); t.addColorStop(.7, `rgba(${lamp()}, 0)`)
      o.fillStyle = t; o.fillRect(-1, -1, 2, 2); o.restore()
    }
    ctx.save(); ctx.globalAlpha = .8; ctx.filter = `blur(${90 * k}px) saturate(1.15)`
    ctx.drawImage(off, -pad, -pad); ctx.restore()
    const d = ctx.createLinearGradient(0, 0, W, 0)
    d.addColorStop(0, 'rgba(8, 10, 14, .15)'); d.addColorStop(.65, 'rgba(8, 10, 14, .55)'); d.addColorStop(1, 'rgba(8, 10, 14, .55)')
    ctx.fillStyle = d; ctx.fillRect(0, 0, W, H)
  }
  if (float) grain(ctx)
}

async function load() {
  cover = null
  if (props.kind === 'wash' && props.art) {
    const img = new Image(); img.src = props.art
    try { await img.decode(); cover = img } catch { cover = null }
  }
  paint()
}

onMounted(() => {
  if (!props.dithered) return
  load()
  ro = new ResizeObserver(paint); ro.observe(canvas.value!)
})
watch(() => props.art, () => { if (props.dithered) load() })
onUnmounted(() => ro?.disconnect())
</script>

<template>
  <canvas v-if="dithered" ref="canvas" class="tvrest-dither" aria-hidden="true"></canvas>
  <template v-else>
    <div :class="css" :style="kind === 'wash' && art ? { backgroundImage: `url(${art})` } : undefined"></div>
    <div v-if="kind === 'wash'" class="tvrest-dim"></div>
  </template>
</template>
