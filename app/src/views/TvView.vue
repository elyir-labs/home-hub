<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* The house on a TV, from the sofa (design/living-room/RowsB). It opens on the room the TV is in, because
   that is where whoever holds the remote is, and reads down in rows: this room's things, its scenes, the
   other rooms, the cameras. Up and Down move between rows, and the lit row rides to the top while the
   ones above slide away. Drawn at the TV's 1920x1080 and scaled to whatever the TV says it is. */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Device, Room } from '../api'
import { activity, capsOf, iconFor, shortName, perform, roomActive, runScene, scenesFor, store, type Scene } from '../store'
import { levelOf } from '../levels'
import { camerasIn, COLOR_OF, hintFor, hintParts, light, lit, okOf, stateOf, thingsIn } from '../tv'
import { locale } from '../lang'
import Icon from '../Icon.vue'

const props = defineProps<{ rooms: Room[]; here: Room | null; now: Date; home: string | null }>()
const emit = defineEmits<{ open: [id: string | null] }>()

const scale = ref(1)
const fit = () => (scale.value = Math.min(innerWidth / 1920, innerHeight / 1080))

const things = computed(() => props.here ? thingsIn(props.here) : [])
const scenes = computed(() => props.here ? scenesFor(props.here) : [])
const others = computed(() => props.rooms.filter(r => r.id !== props.here?.id && r.id !== 'unassigned' && r.devices.length))
const cameras = computed(() => camerasIn(props.rooms))
const away = computed(() => !!props.here && !!props.home && props.here.id !== props.home)

const clock = computed(() => props.now.toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }))
const day = computed(() => props.now.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' }))
const who = computed(() => {
  const names = (store.presence?.people ?? []).filter(p => p.home).map(p => p.name)
  if (!names.length) return ''
  return `${names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]} ${names.length === 1 ? 'is' : 'are'} home`
})

function ok(d: Device) {
  const o = okOf(d)
  if ('open' in o) { store.opened = d; return }
  perform(d, o.action, undefined, o.guess)
}
const more = (d: Device) => { store.opened = d }
const scene = (s: Scene) => props.here && runScene(props.here, s)
const watchCam = (d: Device) => { store.viewer = d }

const hint = computed(() => hintParts(lit.value?.dataset.hint ?? ''))

/* The lit row rides at the top of the view; the rows above it slide away. */
const rowsEl = ref<HTMLElement | null>(null)
const ride = ref(0), rowAt = ref(0)
watch(lit, (e) => {
  const rows = rowsEl.value; if (!e || !rows || !rows.contains(e)) return
  const r = e.closest<HTMLElement>('.tv-row'); if (!r) return
  rowAt.value = [...rows.querySelectorAll('.tv-row')].indexOf(r)
  ride.value = r.offsetTop
  /* along a row, the lit card stays in view */
  const strip = r.querySelector<HTMLElement>('.tv-cards')
  if (strip) {
    const want = e.offsetLeft - 96, room = strip.scrollWidth - strip.clientWidth
    if (e.offsetLeft + e.offsetWidth > strip.scrollLeft + strip.clientWidth - 96 || e.offsetLeft < strip.scrollLeft + 96)
      strip.scrollTo({ left: Math.max(0, Math.min(room, want)), behavior: 'smooth' })
  }
})
/* Going to another room starts on its first thing, and coming back to this one does too. */
watch(() => props.here?.id, () => nextTick(() => { ride.value = 0; rowAt.value = 0; light(rowsEl.value?.querySelector<HTMLElement>('[data-tv-start]') ?? null) }))

onMounted(() => { fit(); window.addEventListener('resize', fit); light(rowsEl.value?.querySelector<HTMLElement>('[data-tv-start]') ?? null) })
onUnmounted(() => window.removeEventListener('resize', fit))
</script>

<template>
  <div class="tv-wrap">
    <div class="tv" :style="{ zoom: scale }" data-tv-own-scroll>
      <div class="tv-top">
        <div class="tv-clock">{{ clock }}<small>{{ day }}</small></div>
        <div class="tv-who" v-if="who"><span class="tv-dot"></span>{{ who }}</div>
      </div>
      <div class="tv-title" v-if="here">
        <h1>{{ here.name }}</h1>
        <p>{{ activity(here) }}</p>
      </div>
      <div class="tv-view">
        <div class="tv-rows" ref="rowsEl" :style="{ transform: `translateY(${-ride}px)` }">
          <section class="tv-row tv-here" :class="{ gone: rowAt > 0 }" v-if="things.length">
            <h2>In the {{ here!.name.toLowerCase() }}</h2>
            <div class="tv-cards">
              <button v-for="(d, i) in things" :key="d.id" class="tv-card tv-thing" :class="{ on: d.state === 'on' || d.state === 'playing' || d.state === 'open', dead: d.state === 'unavailable' }"
                      data-tv :data-tv-start="i === 0 ? '' : null" :data-hint="hintFor(d, false)" :data-thing="d.id"
                      :style="{ '--v': `${Math.round((levelOf(d) ?? 0) * 100)}%` }"
                      @click="ok(d)" @tv-hold="more(d)">
                <span class="tv-ic"><Icon :name="iconFor(d)" :size="26" /></span>
                <span><span class="tv-nm">{{ shortName(d, here) }}</span><span class="tv-st">{{ stateOf(d) }}</span></span>
                <span class="tv-bar" v-if="levelOf(d) != null"><i></i></span>
              </button>
            </div>
          </section>
          <section class="tv-row" :class="{ gone: rowAt > 1 }" v-if="scenes.length">
            <h2>Scenes here</h2>
            <div class="tv-cards">
              <button v-for="(s, i) in scenes" :key="s.id" class="tv-card tv-scene" data-tv :data-tv-start="!things.length && i === 0 ? '' : null"
                      :data-hint="`OK|Start ${s.label}`" @click="scene(s)">
                <span class="tv-ic"><Icon :name="s.icon" :size="26" /></span>
                <span><span class="tv-nm">{{ s.label }}</span><span class="tv-st">{{ s.hint(capsOf(here!.devices)) }}</span></span>
                <span class="tv-key" :class="COLOR_OF[s.id]" v-if="COLOR_OF[s.id]"></span>
              </button>
            </div>
          </section>
          <section class="tv-row" :class="{ gone: rowAt > 2 }" v-if="others.length || away">
            <h2>Other rooms</h2>
            <div class="tv-cards">
              <button v-if="away" class="tv-card tv-room lit" data-tv data-hint="OK|Back to the TV’s room" @click="emit('open', home)">
                <span class="tv-nm">{{ rooms.find(r => r.id === home)?.name }}</span><span class="tv-st">Where the TV is</span>
              </button>
              <button v-for="r in others.filter(r => r.id !== home)" :key="r.id" class="tv-card tv-room" :class="{ lit: roomActive(r) }" data-tv
                      :data-hint="`OK|Go to the ${r.name.toLowerCase()}`" @click="emit('open', r.id)">
                <span class="tv-nm">{{ r.name }}</span><span class="tv-st">{{ activity(r) }}</span>
              </button>
            </div>
          </section>
          <section class="tv-row" :class="{ gone: rowAt > 3 }" v-if="cameras.length">
            <h2>Cameras</h2>
            <div class="tv-cards">
              <button v-for="c in cameras" :key="c.id" class="tv-card tv-cam" data-tv :data-hint="`OK|Watch the ${c.name.toLowerCase()}`" @click="watchCam(c)">
                <span class="tv-ic"><Icon name="camera" :size="26" /></span>
                <span class="tv-nm">{{ c.name }}</span>
              </button>
            </div>
          </section>
          <section class="tv-row">
            <h2>This house</h2>
            <div class="tv-cards">
              <button class="tv-card tv-scene" data-tv data-hint="OK|Add something to the house" @click="store.sheet = 'add'">
                <span class="tv-ic"><Icon name="plus" :size="26" /></span><span class="tv-nm">Add to the house</span>
              </button>
              <button class="tv-card tv-scene" data-tv data-hint="OK|Settings, people and the hub" @click="store.sheet = 'house'">
                <span class="tv-ic"><Icon name="menu" :size="26" /></span><span class="tv-nm">This house</span>
              </button>
            </div>
          </section>
        </div>
      </div>
      <div class="tv-hint" aria-live="polite">
        <span v-for="(h, i) in hint" :key="i">{{ h.before }}<kbd v-for="k in h.keys" :key="k">{{ k }}</kbd>{{ h.words }}</span>
        <span v-if="hint.length && away"><kbd>Back</kbd>The {{ rooms.find(r => r.id === home)?.name.toLowerCase() }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tv-wrap { position: fixed; inset: 0; z-index: 1; overflow: hidden; }
.tv { position: relative; width: 1920px; height: 1080px; color: var(--ink); --safe-x: 96px; --safe-y: 54px; }
.tv-top { position: absolute; left: var(--safe-x); right: var(--safe-x); top: var(--safe-y); display: flex; justify-content: space-between; align-items: baseline; }
.tv-clock { font-size: 40px; font-weight: 300; }
.tv-clock small { font-size: 22px; color: var(--ink-2); margin-left: 14px; }
.tv-who { font-size: 22px; color: var(--ink-2); display: flex; gap: 14px; align-items: center; }
.tv-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--live); }
.tv-title { position: absolute; left: var(--safe-x); top: 140px; }
.tv-title h1 { margin: 0; font-size: 76px; font-weight: 400; letter-spacing: -0.03em; line-height: 1; }
.tv-title p { margin: 12px 0 0; font-size: 26px; color: var(--ink-2); }
.tv-view { position: absolute; left: 0; right: 0; top: 300px; bottom: 120px; overflow: hidden;
  mask: linear-gradient(transparent, #000 34px, #000 calc(100% - 60px), transparent); }
.tv-rows { padding: 34px 0 0; transition: transform 0.28s cubic-bezier(0.2, 0.7, 0.2, 1); }
.tv-row { margin-bottom: 46px; transition: opacity 0.28s; }
.tv-row.gone { opacity: 0; }
.tv-row h2 { margin: 0 0 18px var(--safe-x); font-size: 20px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
.tv-row.tv-here h2 { color: var(--lamp); }
/* room for the lit card's rim and lift, which a strip that scrolls would otherwise clip */
.tv-cards { display: flex; gap: 28px; overflow: hidden; padding: 16px var(--safe-x); margin: -16px 0; }
.tv-card { position: relative; flex: none; display: flex; text-align: left; font: inherit; color: inherit; cursor: pointer;
  border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--edge); overflow: hidden; backdrop-filter: blur(24px); }
.tv-nm { display: block; font-size: 28px; font-weight: 500; letter-spacing: -0.005em; }
.tv-st { display: block; font-size: 22px; color: var(--ink-2); margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tv-ic { width: 44px; height: 44px; border-radius: var(--r-sm); display: grid; place-items: center; background: rgba(255, 255, 255, 0.08); flex: none; }
.tv-thing { width: 260px; height: 230px; padding: 24px 24px 44px; flex-direction: column; justify-content: space-between; }
.tv-thing.on { background: linear-gradient(160deg, rgba(var(--lamp-rgb), 0.5), rgba(var(--lamp-rgb), 0.12) 60%, var(--surface)); border-color: rgba(var(--lamp-rgb), 0.5); }
.tv-thing.on .tv-ic { background: var(--lamp); color: var(--lamp-ink); }
.tv-thing.on .tv-st { color: var(--lamp); }
.tv-thing.dead { opacity: 0.55; }
.tv-bar { position: absolute; left: 24px; right: 24px; bottom: 22px; height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); }
.tv-bar i { display: block; height: 100%; border-radius: 3px; background: var(--lamp); width: var(--v, 0%); transition: width 0.15s; }
.tv-scene { width: 400px; height: 112px; padding: 0 28px; gap: 20px; align-items: center; }
.tv-key { position: absolute; top: 16px; right: 16px; width: 18px; height: 18px; border-radius: 50%; }
.tv-key.red { background: #e5484d; } .tv-key.green { background: #46a758; } .tv-key.yellow { background: #f5d90a; } .tv-key.blue { background: #3e63dd; }
.tv-room { width: 260px; height: 190px; padding: 24px; flex-direction: column; }
.tv-room.lit { background: linear-gradient(170deg, rgba(var(--lamp-rgb), 0.2), var(--surface) 70%); }
.tv-cam { width: 400px; height: 225px; padding: 22px; flex-direction: column; justify-content: space-between; background: linear-gradient(#2b3444, #11151c); }
.tv-hint { position: absolute; left: 0; right: 0; bottom: var(--safe-y); display: flex; gap: 28px; justify-content: center; align-items: center; font-size: 22px; color: var(--ink-2); white-space: nowrap; }
.tv-hint span { display: inline-flex; gap: 10px; align-items: center; }
.tv-hint kbd { font: 600 17px/1 inherit; letter-spacing: 0.04em; color: var(--ink); min-width: 40px; height: 36px; padding: 0 10px; display: inline-grid; place-items: center;
  border-radius: 18px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge-hi); }
</style>
