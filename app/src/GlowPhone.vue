<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* Marking where the TV is on a phone (design/tv-glow/, B), for when the TV cannot find itself: the hub's camera's
   picture with four dots to drag to the TV's corners. The first time, the strip then runs a light from its start and
   the same questions as the TV's are asked here; after that only the corners change. The picture is taken when the
   sheet opens and kept nowhere. */
import { computed, onUnmounted, ref } from 'vue'
import { glowChase, glowCorners, glowStill } from './api'
import Icon from './Icon.vue'

const props = defineProps<{ name: string; set: boolean }>()
const emit = defineEmits<{ done: [] }>()
const src = ref(glowStill()), broken = ref(false), busy = ref(false), error = ref('')
const dots = ref([[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]])
const step = ref<'mark' | 'way' | 'done'>('mark')
const start = ref(''), first = ref(''), bottom = ref<boolean | null>(null)
const needsBottom = computed(() => start.value.startsWith('bottom') && first.value === 'up')
const frame = ref<HTMLElement | null>(null)
let held = -1
function down(i: number, e: PointerEvent) { held = i; (e.target as HTMLElement).setPointerCapture(e.pointerId) }
function move(e: PointerEvent) {
  if (held < 0 || !frame.value) return
  const r = frame.value.getBoundingClientRect()
  dots.value[held] = [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]
}
const up = () => { held = -1 }
const outline = computed(() => dots.value.map(([x, y]) => `${x * 100},${y * 56.25}`).join(' '))
async function marked() {
  busy.value = true; error.value = ''
  try {
    if (props.set) { await glowCorners({ corners: dots.value }); step.value = 'done' }
    else { await glowChase(); step.value = 'way' }
  } catch (e) { error.value = (e as Error).message }
  busy.value = false
}
async function choose(kind: 'start' | 'first' | 'bottom', v: string) {
  if (kind === 'start') start.value = v; else if (kind === 'first') first.value = v; else bottom.value = v === 'yes'
  if (!start.value || !first.value || (needsBottom.value && bottom.value === null)) return
  busy.value = true; error.value = ''
  try { await glowCorners({ corners: dots.value, start: start.value, first: first.value, bottom: !!bottom.value }); step.value = 'done' }
  catch (e) { error.value = (e as Error).message }
  busy.value = false
}
onUnmounted(() => { if (step.value === 'way') glowChase(true).catch(() => {}) })
const CORNERS = [['bottom-left', 'Bottom left'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-right', 'Bottom right']]
</script>

<template>
  <div class="sheet-back" @click.self="emit('done')">
    <div class="sheet gp" role="dialog" aria-label="Where the TV is">
      <div class="sheet-head">
        <h2 class="display">{{ step === 'way' ? 'Where did the light start?' : step === 'done' ? 'Done' : 'Where is the TV?' }}</h2>
        <button class="round sheet-close" aria-label="Close" @click="emit('done')"><Icon name="close" :size="20" /></button>
      </div>
      <div class="sheet-body" v-if="step === 'mark'">
        <p class="sheet-lede">Drag the four dots to the corners of the TV's picture, as the hub's camera sees it. The picture isn't kept.</p>
        <div class="gp-frame" ref="frame" @pointermove="move" @pointerup="up" @pointercancel="up">
          <img v-if="!broken" :src="src" alt="What the hub's camera sees" draggable="false" @error="broken = true" />
          <p v-else class="gp-none">The hub's camera isn't answering.</p>
          <svg viewBox="0 0 100 56.25" preserveAspectRatio="none"><polygon :points="outline" /></svg>
          <button v-for="(d, i) in dots" :key="i" class="gp-dot" :style="{ left: `${d[0] * 100}%`, top: `${d[1] * 100}%` }"
                  :aria-label="['Top left', 'Top right', 'Bottom right', 'Bottom left'][i] + ' corner'" @pointerdown.prevent="down(i, $event)"></button>
        </div>
        <p class="error" v-if="error">{{ error }}</p>
        <button class="button big gp-go" :class="{ busy }" :disabled="broken" @click="marked">That's the TV</button>
      </div>
      <div class="sheet-body" v-else-if="step === 'way'">
        <p class="sheet-lede">The {{ name.toLowerCase() }} is lighting up from its first light. Choose the corner it started from, then the way it went.</p>
        <div class="gp-opts"><button v-for="[v, w] in CORNERS" :key="v" class="clim-chip" :class="{ on: start === v }" @click="choose('start', v)">{{ w }}</button></div>
        <div class="gp-opts">
          <button class="clim-chip" :class="{ on: first === 'up' }" @click="choose('first', 'up')">{{ start.startsWith('top') ? 'Down first' : 'Up first' }}</button>
          <button class="clim-chip" :class="{ on: first === 'across' }" @click="choose('first', 'across')">Across first</button>
        </div>
        <div class="gp-opts" v-if="needsBottom"><span class="gp-q">Along the bottom too?</span>
          <button class="clim-chip" @click="choose('bottom', 'yes')">Yes</button><button class="clim-chip" @click="choose('bottom', 'no')">No</button></div>
        <p class="error" v-if="error">{{ error }}</p>
      </div>
      <div class="sheet-body" v-else>
        <p class="sheet-lede">The {{ name.toLowerCase() }} follows the picture now.</p>
        <button class="button big gp-go" @click="emit('done')">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gp-frame { position: relative; margin-top: 14px; aspect-ratio: 16 / 9; border-radius: var(--r-md); overflow: hidden; background: #111; touch-action: none; }
.gp-frame img { width: 100%; height: 100%; object-fit: cover; display: block; user-select: none; }
.gp-frame svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.gp-frame polygon { fill: rgba(var(--lamp-rgb), 0.12); stroke: var(--lamp); stroke-width: 0.5; }
.gp-dot { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 3px solid var(--lamp);
  background: rgba(var(--lamp-rgb), 0.3); touch-action: none; cursor: grab; }
.gp-none { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: #f1eee8; }
.gp-go { width: 100%; margin-top: 16px; }
.gp-opts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
.gp-q { font-size: 15px; margin-right: 4px; }
</style>
