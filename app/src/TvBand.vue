<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* The room, over the picture (design/living-room/OverC). While the TV is resting -- and once the hub plays
   films, while it plays one -- OK brings this room up as one band along the foot and Back puts it away;
   whatever is behind keeps going. Left and Right walk the room's things, Up and Down are the level itself,
   one press each, and the colored buttons start the room's scenes. The rest of the house is behind Other
   rooms, which opens the rows. */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Device, Room } from './api'
import { activity, perform, scenesFor, shortName, store } from './store'
import { levelOf, step } from './levels'
import { coloredScenes, COLOR_OF, hintFor, hintParts, light, lit, okOf, stateOf, thingsIn } from './tv'

const props = defineProps<{ room: Room }>()
const emit = defineEmits<{ rooms: []; open: [d: Device] }>()

const scale = ref(1)
const fit = () => (scale.value = Math.min(innerWidth / 1920, innerHeight / 1080))

const things = computed(() => thingsIn(props.room).slice(0, 6))
const scenes = computed(() => coloredScenes(scenesFor(props.room)))
const others = computed(() => store.rooms.filter(r => r.id !== props.room.id && r.id !== 'unassigned' && r.devices.length))
const othersLine = computed(() => { const n = others.value.map(r => r.name); return n.length <= 2 ? n.join(' and ') : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more` })
const hint = computed(() => hintParts(lit.value?.dataset.hint ?? ''))

function ok(d: Device) {
  const o = okOf(d)
  if ('open' in o) { emit('open', d); return }   // a pane is the awake panel's, so opening one wakes it
  perform(d, o.action, undefined, o.guess)
}
function level(e: Event, d: Device) {
  if (step(d, (e as CustomEvent<1 | -1>).detail)) e.preventDefault()
  else if (levelOf(d) != null) e.preventDefault()   // at the end of its level: stay on the card rather than leave the band
}

const band = ref<HTMLElement | null>(null)
onMounted(() => { fit(); window.addEventListener('resize', fit); light(band.value?.querySelector<HTMLElement>('[data-tv-start]') ?? null) })
onUnmounted(() => window.removeEventListener('resize', fit))
</script>

<template>
  <div class="tvb-wrap">
    <div class="tvb" :style="{ zoom: scale }">
      <div class="tvb-scrim"></div>
      <div class="tvb-band" ref="band" data-tv-own-scroll>
        <div class="tvb-hd">
          <h1>{{ room.name }}<small>{{ activity(room) }}</small></h1>
          <div class="tvb-scenes">
            <span v-for="s in scenes" :key="s.id" :class="{ now: room.intent === s.id }"><i :class="COLOR_OF[s.id]"></i>{{ s.label }}</span>
          </div>
        </div>
        <div class="tvb-row">
          <button v-for="(d, i) in things" :key="d.id" class="tvb-thing" :class="{ on: d.state === 'on' || d.state === 'playing' }"
                  data-tv :data-tv-start="i === 0 ? '' : null" :data-hint="hintFor(d, true) + ';Back|Close'" :data-thing="d.id"
                  :style="{ '--v': `${Math.round((levelOf(d) ?? 0) * 100)}%` }"
                  @click="ok(d)" @tv-level="level($event, d)">
            <span class="tvb-nm">{{ shortName(d, room) }}</span>
            <span class="tvb-val">{{ stateOf(d) }}</span>
            <span class="tvb-meter" v-if="levelOf(d) != null"><i></i></span>
          </button>
          <button class="tvb-thing tvb-more" data-tv data-hint="OK|The whole house;Back|Close" @click="emit('rooms')">
            <span class="tvb-nm">Other rooms</span><span class="tvb-st">{{ othersLine }}</span>
          </button>
        </div>
        <div class="tvb-hint">
          <span v-for="(h, i) in hint" :key="i">{{ h.before }}<kbd v-for="k in h.keys" :key="k">{{ k }}</kbd>{{ h.words }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tvb-wrap { position: fixed; inset: 0; z-index: 60; overflow: hidden; pointer-events: none; }
.tvb { position: relative; width: 1920px; height: 1080px; color: var(--ink); }
.tvb-scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 62%; background: linear-gradient(transparent, rgba(5, 7, 10, 0.78) 45%, rgba(5, 7, 10, 0.9)); }
.tvb-band { position: absolute; left: 96px; right: 96px; bottom: 54px; pointer-events: auto; animation: tvb-up 0.32s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes tvb-up { from { transform: translateY(40px); opacity: 0; } }
.tvb-hd { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 26px; }
.tvb-hd h1 { margin: 0; font-size: 52px; font-weight: 400; letter-spacing: -0.02em; }
.tvb-hd h1 small { font-size: 26px; color: var(--ink-2); margin-left: 18px; letter-spacing: 0; }
.tvb-scenes { display: flex; gap: 14px; }
.tvb-scenes span { display: inline-flex; gap: 12px; align-items: center; height: 54px; padding: 0 22px 0 16px; border-radius: 27px; font-size: 22px;
  background: rgba(20, 22, 28, 0.6); border: 1px solid var(--edge); }
.tvb-scenes span.now { border-color: rgba(var(--lamp-rgb), 0.8); color: var(--lamp); }
.tvb-scenes i { width: 20px; height: 20px; border-radius: 50%; }
.tvb-scenes i.red { background: #e5484d; } .tvb-scenes i.green { background: #46a758; } .tvb-scenes i.yellow { background: #f5d90a; } .tvb-scenes i.blue { background: #3e63dd; }
.tvb-row { display: flex; gap: 20px; }
.tvb-thing { position: relative; width: 229px; height: 250px; padding: 22px 32px 22px 22px; display: flex; flex-direction: column; justify-content: space-between; text-align: left;
  font: inherit; color: inherit; cursor: pointer; white-space: nowrap; border-radius: var(--r-lg); background: rgba(22, 24, 30, 0.62); border: 1px solid var(--edge); backdrop-filter: blur(24px); }
.tvb-thing.on { background: linear-gradient(160deg, rgba(var(--lamp-rgb), 0.45), rgba(var(--lamp-rgb), 0.1) 60%, rgba(22, 24, 30, 0.7)); border-color: rgba(var(--lamp-rgb), 0.5); }
.tvb-nm { font-size: 26px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.tvb-val { font-size: 34px; font-weight: 300; letter-spacing: -0.02em; white-space: normal; }
.tvb-st { font-size: 22px; color: var(--ink-2); white-space: normal; }
.tvb-meter { position: absolute; right: 14px; top: 22px; bottom: 22px; width: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.12); opacity: 0; transition: opacity 0.2s; }
.tvb-meter i { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 4px; height: var(--v, 0%); background: var(--lamp); transition: height 0.15s; }
.tvb-thing[data-lit] .tvb-meter { opacity: 1; }
.tvb-more { justify-content: center; gap: 10px; white-space: normal; padding: 22px; }
.tvb-hint { margin-top: 26px; display: flex; gap: 28px; align-items: center; font-size: 22px; color: var(--ink-2); white-space: nowrap; }
.tvb-hint span { display: inline-flex; gap: 10px; align-items: center; }
.tvb-hint kbd { font: 600 17px/1 inherit; letter-spacing: 0.04em; color: var(--ink); min-width: 40px; height: 36px; padding: 0 10px; display: inline-grid; place-items: center;
  border-radius: 18px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge-hi); }
</style>
