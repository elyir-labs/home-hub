<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* The room, over the picture (design/living-room/OverC). While the TV is resting -- and once the hub plays
   films, while it plays one -- OK brings this room up as one band along the foot and Back puts it away;
   whatever is behind keeps going. Left and Right walk the room's things, Up and Down are the level itself,
   one press each, and the colored buttons start the room's scenes. The rest of the house is behind Other
   rooms, which opens the rows. While the room plays music it is a sheet under the record instead (design/tv-playing/, A):
   the music's keys, the room's things and scenes, and the other rooms, each a row, so Up and Down move between them and
   the volume is a key of its own. */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Device, Room } from './api'
import { activity, cap, perform, runScene, scenesFor, shortName, store } from './store'
import { levelOf, step } from './levels'
import { coloredScenes, COLOR_OF, hintFor, hintParts, light, lit, louder, okOf, playPause, speakersOf, stateOf, thingsIn } from './tv'

const props = defineProps<{ room: Room; music?: Device | null; start?: 'pause' | 'volume' }>()
const emit = defineEmits<{ rooms: []; open: [d: Device]; room: [id: string]; music: [] }>()

const scale = ref(1)
const fit = () => (scale.value = Math.min(innerWidth / 1920, innerHeight / 1080))

const things = computed(() => thingsIn(props.room).slice(0, 6))
const scenes = computed(() => coloredScenes(scenesFor(props.room)))
const others = computed(() => store.rooms.filter(r => r.id !== props.room.id && r.id !== 'unassigned' && r.devices.length))
const othersLine = computed(() => { const n = others.value.map(r => r.name); return n.length <= 2 ? n.join(' and ') : `${n.slice(0, 2).join(', ')} and ${n.length - 2} more` })
const hint = computed(() => hintParts(lit.value?.dataset.hint ?? ''))

/* The sheet's rows are one line each, the TV's width and never scrolled: the room's things (less the speakers the music
   row works) share theirs with its scenes, so with scenes there is room for four cards, without them six, and when
   there are more the last place is Everything here, the room's rows. Other rooms stop at six for the same reason. */
const here = computed(() => { const sp = props.music ? speakersOf(props.music, props.room) : []; return thingsIn(props.room).filter(d => !sp.includes(d)) })
const sheetThings = computed(() => { const n = scenes.value.length ? 4 : 6; return here.value.length > n ? here.value.slice(0, n - 1) : here.value })
const sheetRooms = computed(() => others.value.slice(0, 6))
const lightsOn = (r: Room) => { const n = r.devices.filter(d => cap(d) === 'light' && d.state === 'on').length; return n ? `${n} ${n === 1 ? 'light' : 'lights'} on` : '' }

function ok(d: Device) {
  const o = okOf(d)
  if ('open' in o) { emit('open', d); return }   // a pane is the awake panel's, so opening one wakes it
  perform(d, o.action, undefined, o.guess)
}
function level(e: Event, d: Device) {
  if (step(d, (e as CustomEvent<1 | -1>).detail)) e.preventDefault()
  else if (levelOf(d) != null) e.preventDefault()   // at the end of its level: stay on the card rather than leave the band
}

function pair(e: Event) { if (props.music && louder(props.music, props.room, (e as CustomEvent<1 | -1>).detail)) e.preventDefault(); else e.preventDefault() }
const playing = computed(() => props.music?.state === 'playing')
const vol = computed(() => props.music?.attrs.volume_level != null ? Math.round(Number(props.music.attrs.volume_level) * 100) : null)

const band = ref<HTMLElement | null>(null)
onMounted(() => { fit(); window.addEventListener('resize', fit); light(band.value?.querySelector<HTMLElement>('[data-tv-start]') ?? null) })
onUnmounted(() => window.removeEventListener('resize', fit))
</script>

<template>
  <div class="tvb-wrap">
    <div class="tvb" :style="{ zoom: scale }">
      <div class="tvb-scrim" v-if="!music"></div>
      <div class="tvb-band" :class="{ 'tvb-sheet': music }" ref="band" data-tv-own-scroll>
        <template v-if="music">
        <section class="tvb-srow">
          <h2 class="tvb-here">Playing here</h2>
          <div class="tvb-line">
            <button class="tvb-key" data-tv :data-tv-start="start !== 'volume' ? '' : null" :data-hint="`OK|${playing ? 'Pause' : 'Play'};Back|Put it away`"
                    :data-thing="music.id" @click="playPause(music, room)">{{ playing ? 'Pause' : 'Play' }}</button>
            <button class="tvb-key" data-tv data-hint="OK|Skip this one;Back|Put it away" @click="perform(music, 'next')">Next</button>
            <button class="tvb-key" data-tv data-hint="OK|Choose something else to play;Back|Put it away" @click="emit('music')">Something else</button>
            <button class="tvb-key" data-tv data-hint="OK|Play it in other rooms too;Back|Put it away" @click="emit('music')">Other rooms too</button>
            <button class="tvb-key tvb-vol" v-if="vol != null" data-tv :data-tv-start="start === 'volume' ? '' : null"
                    data-hint="▲ ▼|Louder or quieter;Back|Put it away" @tv-level="pair($event)">Volume<span class="tvb-vol-bar"><i :style="{ width: `${vol}%` }"></i></span>{{ vol }}%</button>
          </div>
        </section>
        <section class="tvb-srow" v-if="sheetThings.length || scenes.length">
          <h2>In the {{ room.name.toLowerCase() }}</h2>
          <div class="tvb-line">
            <button v-for="d in sheetThings" :key="d.id" class="tvb-small" :class="{ on: d.state === 'on' || d.state === 'playing' }"
                    data-tv :data-hint="`OK|${okOf(d).label};Back|Put it away`" :data-thing="d.id"
                    :style="{ '--v': `${Math.round((levelOf(d) ?? 0) * 100)}%` }" @click="ok(d)">
              <span class="tvb-nm">{{ shortName(d, room) }}</span>
              <span class="tvb-st">{{ stateOf(d) }}</span>
              <span class="tvb-bar" v-if="levelOf(d) != null && d.state === 'on'"><i></i></span>
            </button>
            <button class="tvb-small tvb-all" v-if="here.length > sheetThings.length" data-tv :data-hint="`OK|Everything in the ${room.name.toLowerCase()};Back|Put it away`" @click="emit('rooms')">
              <span class="tvb-nm">Everything here</span><span class="tvb-st">{{ here.length - sheetThings.length }} more</span>
            </button>
            <button v-for="sc in scenes" :key="sc.id" class="tvb-chip" :class="{ now: room.intent === sc.id }" data-tv
                    :data-hint="`OK|${sc.label};Back|Put it away`" @click="runScene(room, sc)"><i :class="COLOR_OF[sc.id]"></i>{{ sc.label }}</button>
          </div>
        </section>
        <section class="tvb-srow" v-if="others.length">
          <h2>Other rooms</h2>
          <div class="tvb-line">
            <button v-for="r in sheetRooms" :key="r.id" class="tvb-chip" data-tv :data-hint="`OK|Go to the ${r.name.toLowerCase()};Back|Put it away`" @click="emit('room', r.id)">
              {{ r.name }}<small v-if="lightsOn(r)">{{ lightsOn(r) }}</small>
            </button>
            <button class="tvb-chip" v-if="others.length > sheetRooms.length" data-tv data-hint="OK|Every room;Back|Put it away" @click="emit('rooms')">
              All rooms<small>{{ others.length - sheetRooms.length }} more</small>
            </button>
          </div>
        </section>
        </template>
        <template v-else>
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
        </template>
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
.tvb-key { height: 84px; padding: 0 30px; font: inherit; font-size: 26px; color: inherit; cursor: pointer; border-radius: var(--r-lg);
  background: rgba(22, 24, 30, 0.62); border: 1px solid var(--edge); }
.tvb-vol { margin-left: auto; display: inline-flex; gap: 16px; align-items: center; font-size: 24px; color: var(--ink-2); }
.tvb-vol-bar { width: 300px; height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.14); }
.tvb-vol-bar i { display: block; height: 100%; border-radius: 3px; background: var(--ink); transition: width 0.15s; }
/* the sheet under the record (design/tv-playing/SheetA): the width of the TV, three rows */
.tvb-band.tvb-sheet { left: 0; right: 0; bottom: 0; padding: 34px 96px 30px; border-radius: 36px 36px 0 0; background: rgba(12, 14, 19, 0.9);
  border-top: 1px solid var(--edge-hi); backdrop-filter: blur(30px); animation-name: tvb-rise; }
@keyframes tvb-rise { from { transform: translateY(100%); } }
.tvb-srow { margin-bottom: 26px; }
.tvb-srow h2 { margin: 0 0 14px; font-size: 20px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); }
.tvb-srow h2.tvb-here { color: var(--lamp); }
.tvb-line { display: flex; gap: 20px; align-items: center; }
.tvb-small { position: relative; width: 236px; height: 96px; padding: 14px 20px; flex: none; display: flex; flex-direction: column; justify-content: center; text-align: left;
  font: inherit; color: inherit; cursor: pointer; white-space: nowrap; border-radius: var(--r-lg); background: rgba(22, 24, 30, 0.62); border: 1px solid var(--edge); }
.tvb-small .tvb-nm { font-size: 24px; }
.tvb-small.on { background: linear-gradient(160deg, rgba(var(--lamp-rgb), 0.45), rgba(var(--lamp-rgb), 0.1) 60%, rgba(22, 24, 30, 0.7)); border-color: rgba(var(--lamp-rgb), 0.5); }
.tvb-small.on .tvb-st { color: var(--lamp); }
.tvb-bar { position: absolute; left: 20px; right: 20px; bottom: 10px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); }
.tvb-bar i { display: block; height: 100%; width: var(--v, 0%); border-radius: 2px; background: var(--lamp); }
.tvb-chip { height: 72px; padding: 0 26px; flex: none; display: inline-flex; gap: 14px; align-items: center; font: inherit; font-size: 24px; color: inherit; cursor: pointer;
  border-radius: 36px; background: rgba(22, 24, 30, 0.62); border: 1px solid var(--edge); }
.tvb-chip.now { border-color: rgba(var(--lamp-rgb), 0.8); color: var(--lamp); }
.tvb-chip small { font-size: 22px; color: var(--ink-2); }
.tvb-chip i { width: 18px; height: 18px; border-radius: 50%; }
.tvb-chip i.red { background: #e5484d; } .tvb-chip i.green { background: #46a758; } .tvb-chip i.yellow { background: #f5d90a; } .tvb-chip i.blue { background: #3e63dd; }
.tvb-sheet .tvb-hint { justify-content: center; margin-top: 4px; }
.tvb-more { justify-content: center; gap: 10px; white-space: normal; padding: 22px; }
.tvb-hint { margin-top: 26px; display: flex; gap: 28px; align-items: center; font-size: 22px; color: var(--ink-2); white-space: nowrap; }
.tvb-hint span { display: inline-flex; gap: 10px; align-items: center; }
.tvb-hint kbd { font-family: inherit; font-size: 17px; font-weight: 600; line-height: 1; letter-spacing: 0.04em; color: var(--ink); min-width: 40px; height: 36px; padding: 0 10px; display: inline-grid; place-items: center;
  border-radius: 18px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge-hi); }
</style>
