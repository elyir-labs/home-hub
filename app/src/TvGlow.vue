<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* Setting up the light behind the TV, from the sofa (design/tv-glow/, A). The hub draws this screen, so it can put
   four white corners on it and have the camera find them (startup/glow.py, on this machine's own address, the way
   the screen helper is asked); then the strip runs a light from its first light and the TV asks, with the remote,
   which corner it started from and which way it went. When the camera cannot find the screen, it says what to try. */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { followTV, getGlow, glowCorners, type GlowChoice, type GlowTarget, type Room } from './api'
import { store } from './store'
import { hintParts, light, lit } from './tv'

const props = defineProps<{ room: Room }>()
const helper = new URLSearchParams(location.search).get('glowhelper') || 'http://127.0.0.1:8397'
const ask = async (path: string, body: unknown = {}) => {
  const r = await fetch(helper + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'The camera on the hub did not answer.')
  return r.json()
}
type Step = 'pick' | 'find' | 'missed' | 'way' | 'done'
const step = ref<Step>('find'), corners = ref(true), why = ref(''), choices = ref<GlowChoice[]>([])
const chosen = ref<GlowChoice | null>(null), target = ref<GlowTarget | null>(null), found = ref<number[][] | null>(null)
const start = ref(''), first = ref(''), bottom = ref<boolean | null>(null)
const needsBottom = computed(() => start.value.startsWith('bottom') && first.value === 'up')
const scale = ref(1)
const fit = () => (scale.value = Math.min(innerWidth / 1920, innerHeight / 1080))
const hint = computed(() => hintParts(lit.value?.dataset.hint ?? ''))
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const lightFirst = () => setTimeout(() => light(document.querySelector<HTMLElement>('.tvg [data-tv-start]')), 0)

async function begin() {
  try {
    const g = await getGlow(props.room.id)
    choices.value = g.choices.filter(c => c.reachable)
    if (!choices.value.length) { why.value = 'No light strip in this room is answering. It needs to be on the Wi-Fi first.'; step.value = 'missed'; lightFirst(); return }
    if (choices.value.length > 1) { step.value = 'pick'; lightFirst(); return }
    await pick(choices.value[0])
  } catch (e) { why.value = (e as Error).message; step.value = 'missed'; lightFirst() }
}
async function pick(c: GlowChoice) {
  chosen.value = c
  try {
    target.value = (await followTV(c.strip, c.run)).target
    if (!target.value) throw new Error(`The ${c.name.toLowerCase()} isn't answering on the Wi-Fi.`)
    await find()
  } catch (e) { why.value = (e as Error).message; step.value = 'missed'; lightFirst() }
}
async function find() {
  step.value = 'find'; corners.value = true; found.value = null
  await wait(900)
  await ask('/find?phase=lit')
  corners.value = false
  await wait(900)
  const r = await ask('/find?phase=dark')
  if (!r.corners) { why.value = "The camera couldn't find the screen. Move it so it sees the whole TV, or turn down a lamp shining at it, and try again."; step.value = 'missed'; lightFirst(); return }
  found.value = r.corners
  await wait(1200)
  await ask('/chase', { target: target.value, lights: chosen.value!.lights })
  step.value = 'way'; lightFirst()
}
async function retry() {
  try { chosen.value ? await find() : await begin() } catch (e) { why.value = (e as Error).message; step.value = 'missed'; lightFirst() }
}
async function choose(kind: 'start' | 'first' | 'bottom', v: string) {
  if (kind === 'start') start.value = v
  else if (kind === 'first') first.value = v
  else bottom.value = v === 'yes'
  if (!start.value || !first.value || (needsBottom.value && bottom.value === null)) return
  try {
    await glowCorners({ corners: found.value!, start: start.value, first: first.value, bottom: !!bottom.value })
    step.value = 'done'; lightFirst()
  } catch (e) { why.value = (e as Error).message; step.value = 'missed'; lightFirst() }
}
function close() { store.glowSetup = false }
onMounted(() => { fit(); window.addEventListener('resize', fit); begin() })
onUnmounted(() => { window.removeEventListener('resize', fit); ask('/chase', { stop: true }).catch(() => {}) })
const CORNERS = [['bottom-left', 'Bottom left'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-right', 'Bottom right']]
/* the camera's picture is drawn rather than shown: the outline of what it found is all the TV needs to say */
const quad = computed(() => found.value ? found.value.map(([x, y]) => `${x * 620},${y * 350}`).join(' ') : '')
</script>

<template>
  <div class="tvg-wrap" data-tv-own-scroll>
    <div class="tvg" :style="{ zoom: scale }">
      <template v-if="step === 'find'">
        <template v-if="corners"><i class="tvg-corner" style="left:0;top:0"></i><i class="tvg-corner" style="right:0;top:0"></i><i class="tvg-corner" style="right:0;bottom:0"></i><i class="tvg-corner" style="left:0;bottom:0"></i></template>
        <div class="tvg-ask" style="left:220px;top:180px"><h1>{{ found ? 'Found it' : 'Finding the screen' }}</h1>
          <p>{{ found ? 'The camera sees the whole picture.' : 'The camera is looking for the four white corners. Leave the room as it is for a few seconds.' }}</p></div>
        <svg class="tvg-cam" viewBox="0 0 620 350"><polygon v-if="quad" :points="quad" /></svg>
      </template>
      <template v-else-if="step === 'pick'">
        <div class="tvg-ask"><h1>Which light is behind the TV?</h1><p>It follows the colors on the screen.</p></div>
        <div class="tvg-opts" style="bottom:240px">
          <button v-for="(c, i) in choices" :key="c.strip + c.run" class="tvg-opt" data-tv :data-tv-start="i === 0 ? '' : null" :data-hint="`OK|The ${c.name.toLowerCase()}`" @click="pick(c)">{{ c.name }}</button>
        </div>
      </template>
      <template v-else-if="step === 'way'">
        <div class="tvg-ask"><h1>Where did the light start?</h1><p>The strip behind the TV is lighting up from its first light. Choose the corner it started from, then the way it went.</p></div>
        <div class="tvg-opts" :style="{ bottom: needsBottom ? '450px' : '330px' }">
          <button v-for="([v, w], i) in CORNERS" :key="v" class="tvg-opt" :class="{ on: start === v }" data-tv :data-tv-start="i === 0 ? '' : null" :data-hint="`OK|It started ${w.toLowerCase()}`" @click="choose('start', v)">{{ w }}</button>
        </div>
        <div class="tvg-opts" :style="{ bottom: needsBottom ? '330px' : '150px' }">
          <button class="tvg-opt" :class="{ on: first === 'up' }" data-tv data-hint="OK|Up or down the side first" @click="choose('first', 'up')">{{ start.startsWith('top') ? 'Down first' : 'Up first' }}</button>
          <button class="tvg-opt" :class="{ on: first === 'across' }" data-tv data-hint="OK|Across first" @click="choose('first', 'across')">Across first</button>
        </div>
        <div class="tvg-opts" v-if="needsBottom" style="bottom:150px">
          <span class="tvg-q">Along the bottom too?</span>
          <button class="tvg-opt" data-tv data-hint="OK|It goes along the bottom too" @click="choose('bottom', 'yes')">Yes</button>
          <button class="tvg-opt" data-tv data-hint="OK|It stops before the bottom" @click="choose('bottom', 'no')">No</button>
        </div>
      </template>
      <template v-else-if="step === 'missed'">
        <div class="tvg-ask"><h1>Not this time</h1><p>{{ why }}</p><p v-if="chosen">Or mark where the TV is on a phone: open the {{ chosen.name.toLowerCase() }} and choose Where the TV is.</p></div>
        <div class="tvg-opts" style="bottom:150px">
          <button class="tvg-opt" data-tv data-tv-start data-hint="OK|Try again" @click="retry">Try again</button>
          <button class="tvg-opt" data-tv data-hint="OK|Leave it for now" @click="close">Not now</button>
        </div>
      </template>
      <template v-else>
        <div class="tvg-ask"><h1>The light behind the TV follows the picture</h1><p>Whatever is on the TV, the {{ chosen?.name.toLowerCase() }} takes its colors from the edges.</p></div>
        <div class="tvg-opts" style="bottom:150px"><button class="tvg-opt" data-tv data-tv-start data-hint="OK|Done" @click="close">Done</button></div>
      </template>
      <div class="tvg-hint" v-if="step !== 'find'"><span v-for="(h, i) in hint" :key="i">{{ h.before }}<kbd v-for="k in h.keys" :key="k">{{ k }}</kbd>{{ h.words }}</span><span><kbd>Back</kbd>Not now</span></div>
    </div>
  </div>
</template>

<style scoped>
.tvg-wrap { position: fixed; inset: 0; z-index: 65; overflow: hidden; background: #07090d; }
.tvg { position: relative; width: 1920px; height: 1080px; color: var(--ink); }
.tvg-corner { position: absolute; width: 120px; height: 120px; background: #fff; }
.tvg-ask { position: absolute; left: 96px; top: 140px; max-width: 1100px; }
.tvg-ask h1 { margin: 0; font-size: 76px; font-weight: 400; letter-spacing: -0.03em; line-height: 1.02; }
.tvg-ask p { margin: 22px 0 0; font-size: 30px; line-height: 1.35; color: var(--ink); }
.tvg-cam { position: absolute; left: 1060px; top: 470px; width: 620px; height: 350px; border-radius: var(--r-lg); background: linear-gradient(#3a3229, #1a1611); }
.tvg-cam polygon { fill: none; stroke: var(--lamp); stroke-width: 3; stroke-dasharray: 8 6; }
.tvg-opts { position: absolute; left: 96px; display: flex; gap: 24px; align-items: center; }
.tvg-opt { height: 96px; padding: 0 40px; border-radius: 48px; font: inherit; font-size: 28px; font-weight: 500; color: inherit; cursor: pointer;
  background: rgba(22, 24, 30, 0.8); border: 1px solid var(--edge); }
.tvg-opt.on { border-color: rgba(var(--lamp-rgb), 0.8); color: var(--lamp); }
.tvg-q { font-size: 28px; color: var(--ink); margin-right: 8px; }
.tvg-hint { position: absolute; left: 96px; bottom: 54px; display: flex; gap: 28px; align-items: center; font-size: 22px; color: var(--ink); white-space: nowrap; }
.tvg-hint span { display: inline-flex; gap: 10px; align-items: center; }
.tvg-hint kbd { font-family: inherit; font-size: 17px; font-weight: 600; line-height: 1; min-width: 40px; height: 36px; padding: 0 10px; display: inline-grid; place-items: center;
  border-radius: 18px; color: var(--ink); background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge-hi); }
</style>
