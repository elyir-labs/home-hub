<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { addRoom, placeScreen, type Phone, type Room } from './api'
import { keepScreenRoom, openOn, roomLine } from './screen'
import Icon from './Icon.vue'
import TurnPill from './TurnPill.vue'
import { hintParts, light, lit, onTV } from './tv'

/* Which room this screen is in (design/companion/, C). Asked once, after it has joined, never before:
   a device on the Wi-Fi without the passcode never sees the house's rooms. */
const props = defineProps<{ home: string; locked: boolean; rooms: Room[]; screens: Phone[] }>()
const emit = defineEmits<{ placed: [id: string] }>()
const picked = ref<string | null>(null), naming = ref(false), fresh = ref(''), busy = ref(false), error = ref('')
const choices = computed(() => props.rooms.filter(r => r.id !== 'unassigned'))
const chosen = computed(() => choices.value.find(r => r.id === picked.value) ?? null)

async function name() {
  const n = fresh.value.trim()
  if (!n || busy.value) return
  busy.value = true; error.value = ''
  try { const r = await addRoom(n); picked.value = r.id; naming.value = false; fresh.value = '' } catch (e: any) { error.value = e.message }
  busy.value = false
}
/* On a TV (design/tv-join/, C) OK on a room is the answer, and there is no naming one: a remote cannot type it.
   The rooms are one row that slides sideways, as Other rooms does on the TV's home (RoomsRowA): the lit card keeps
   the fourth place from the left once the row has started to move, however many rooms the house has. */
const tv = onTV()
const plugged = computed(() => props.screens.some(p => p.me && p.how === 'plugged in'))
const hint = computed(() => hintParts(lit.value?.dataset.hint ?? ''))
const roomsEl = ref<HTMLElement | null>(null), scale = ref(1)
const fit = () => (scale.value = Math.min(innerWidth / 1920, innerHeight / 1080))
onMounted(() => { if (tv) { fit(); window.addEventListener('resize', fit); light(roomsEl.value?.querySelector<HTMLElement>('[data-tv-start]') ?? null) } })
onUnmounted(() => { if (tv) window.removeEventListener('resize', fit) })
function place(id: string) { picked.value = id; done() }
const at = ref(0), slide = ref(0)
watch(lit, (e) => {
  const cards = [...(roomsEl.value?.children ?? [])] as HTMLElement[]
  const i = e ? cards.indexOf(e) : -1
  if (i < 0) return
  at.value = i
  slide.value = cards.length > 1 ? Math.max(0, i - 3) * (cards[1].offsetLeft - cards[0].offsetLeft) : 0
})

async function done() {
  if (!picked.value || busy.value) return
  busy.value = true; error.value = ''
  try { await placeScreen(picked.value); keepScreenRoom(picked.value); emit('placed', picked.value) } catch (e: any) { error.value = e.message }
  busy.value = false
}
</script>

<template>
  <main v-if="tv && choices.length" class="tvr-wrap screen-room">
    <div class="tvr" :style="{ zoom: scale }" data-tv-own-scroll>
      <div class="tvr-ask">
        <span class="tvr-mark"><Icon name="home" :size="40" /></span>
        <h1>Which room is this TV in?</h1>
        <p class="tvr-lede">{{ plugged ? `It's plugged into the hub, so it's already part of ${home}. ` : '' }}It opens on the room you choose.</p>
        <p class="tvr-error">{{ busy ? 'Opening…' : error }}</p>
      </div>
      <div class="tvr-strip">
      <div class="tvr-rooms" ref="roomsEl" :style="{ transform: `translateX(${-slide}px)` }">
        <button v-for="(r, i) in choices" :key="r.id" class="tvr-room" data-tv :data-tv-start="i === 0 ? '' : undefined"
                :data-hint="`OK|${openOn(r.name)}`" @click="place(r.id)">
          <span class="tvr-nm">{{ r.name }}</span><span class="tvr-st">{{ roomLine(r, screens) }}</span>
        </button>
      </div>
      </div>
      <p class="tvr-count" v-if="choices.length > 5">{{ at + 1 }} of {{ choices.length }} rooms</p>
      <div class="tvr-hint" aria-live="polite"><span v-for="(h, i) in hint" :key="i">{{ h.before }}<kbd v-for="k in h.keys" :key="k">{{ k }}</kbd>{{ h.words }}</span></div>
    </div>
  </main>
  <main v-else class="setup screen-room">
    <section class="setup-page">
      <p class="screen-trail">
        <span class="screen-trail-ok"><Icon name="check" :size="13" /></span><b>{{ home }}</b>
        <template v-if="locked"><span>·</span><span class="screen-trail-ok"><Icon name="check" :size="13" /></span><b>Passcode</b></template>
        <span>·</span><span class="screen-trail-now">Room</span>
      </p>
      <h1 class="display">Which room is this screen in?</h1>
      <p class="setup-lede">It opens on that room, and goes back to it after resting.</p>
      <div class="screen-rooms">
        <button v-for="r in choices" :key="r.id" class="screen-room-tile" :class="{ on: picked === r.id }" @click="picked = r.id">
          <span class="screen-room-name">{{ r.name }}</span><span class="screen-room-line">{{ roomLine(r, screens) }}</span>
        </button>
        <button v-if="!naming" class="screen-room-tile new" @click="naming = true">
          <span class="screen-room-name">Somewhere new</span><span class="screen-room-line">name a room</span>
        </button>
        <label v-else class="screen-room-tile new naming">
          <input class="screen-room-input" v-model="fresh" placeholder="Hallway" autocapitalize="words" aria-label="The room's name" @keydown.enter="name" />
          <button class="linkish" :disabled="!fresh.trim()" @click="name">Add</button>
        </label>
      </div>
      <p class="error" v-if="error">{{ error }}</p>
      <div class="setup-actions">
        <button class="button big" :class="{ busy }" :disabled="!chosen" @click="done">{{ chosen ? openOn(chosen.name) : 'Pick a room' }}</button>
      </div>
      <p class="setup-foot">You can change it later, under This screen.</p>
    </section>
    <TurnPill />
  </main>
</template>

<style scoped>
/* Drawn at the TV's 1920x1080 and scaled to it, read from the sofa (design/tv-join/OwnC). */
.tvr-wrap { position: fixed; inset: 0; z-index: 1; overflow: hidden; }
.tvr { position: relative; width: 1920px; height: 1080px; color: var(--ink); --safe-x: 96px; --safe-y: 54px; }
.tvr-ask { position: absolute; left: 300px; top: 110px; width: 1200px; }
.tvr-mark { width: 88px; height: 88px; border-radius: var(--r-lg); display: grid; place-items: center; color: var(--lamp);
            background: rgba(255, 255, 255, 0.06); border: 1px solid var(--edge); }
.tvr h1 { margin: 36px 0 0; font-size: 80px; font-weight: 400; letter-spacing: -0.03em; line-height: 1.02; }
.tvr-lede { margin: 26px 0 0; font-size: 30px; line-height: 1.35; color: var(--ink-2); max-width: 1000px; }
.tvr-error { margin: 14px 0 0; font-size: 26px; color: var(--ink-2); min-height: 34px; }
.tvr-strip { position: absolute; left: 0; right: 0; top: 600px; height: 230px; overflow: hidden;
              mask-image: linear-gradient(90deg, transparent 0, #000 220px, #000 calc(100% - 160px), transparent 100%); }
.tvr-rooms { position: absolute; left: 300px; top: 30px; display: flex; gap: 28px; transition: transform 0.28s ease; }
.tvr-count { position: absolute; left: 300px; top: 860px; margin: 0; font-size: 22px; color: var(--muted); }
.tvr-room { flex: none; width: 250px; height: 170px; padding: 24px; display: flex; flex-direction: column; justify-content: space-between; text-align: left;
            font: inherit; color: inherit; cursor: pointer; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--edge); }
.tvr-nm { font-size: 28px; font-weight: 500; }
.tvr-st { font-size: 22px; color: var(--ink-2); }
.tvr-hint { position: absolute; left: var(--safe-x); bottom: var(--safe-y); display: flex; gap: 28px; align-items: center; font-size: 22px; color: var(--ink-2); white-space: nowrap; }
.tvr-hint span { display: inline-flex; gap: 10px; align-items: center; }
.tvr-hint kbd { font-family: inherit; font-size: 17px; font-weight: 600; line-height: 1; letter-spacing: 0.04em; color: var(--ink); min-width: 40px; height: 36px; padding: 0 10px; display: inline-grid; place-items: center;
                border-radius: 18px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge-hi); }
</style>
