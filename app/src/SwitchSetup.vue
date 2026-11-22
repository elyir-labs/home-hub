<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { listenForSwitch, moveDevice, pairSwitch, renameDevice, showOnSwitch, switchDims, switchHasLight,
         switchSetup, switchWalkIn, unpairSwitch } from './api'
import { store, notify } from './store'
import type { Act } from './adding'
import { next, nameFor, progress, said as saidRows, WALKIN_WORDS, type Answers, type Step, type WalkIn } from './switchSetup'
import Icon from './Icon.vue'

/*
 * A wall switch that just joined, set up on the light itself (design/switch-setup/, C). The rules for
 * which step follows which are switchSetup.ts's; this draws one step at a time and hands its buttons to
 * the Add shell, which puts them where every other route's are.
 */
const props = defineProps<{ addr: string; deviceId?: string | null; name?: string | null }>()
const emit = defineEmits<{ acts: [Act[]]; head: [string]; another: []; done: [] }>()

const at = ref<Step>('light')
const a = ref<Answers>({ walkin: 'on_off' })
const device = ref<string | null>(props.deviceId ?? null)
const showing = ref('')                 // what the light is doing right now, said while it does it
const busy = ref(false)
const dimSeen = ref('')                 // what they saw when it dimmed, said again on the end page
const heard = ref<{ switch: string; name: string } | null>(null)
const listening = ref(false)
const room = ref('')
const name = ref(props.name ?? '')
const suggested = ref(props.name ?? '')   // the house's own name for it counts as not typed
const partnerAddr = ref<string | null>(null)
let showTimer: number | undefined
let showTick: number | undefined

const rooms = computed(() => store.rooms.filter(r => r.id !== 'unassigned'))
const count = computed(() => progress(at.value, a.value))
const answered = computed(() => saidRows(at.value, a.value))
const lightName = computed(() => name.value.trim() || 'The light')

function stopShowing() {
  clearTimeout(showTimer); clearInterval(showTick)
  showing.value = ''
}

async function show(what: 'light' | 'dim') {
  stopShowing()
  showing.value = what === 'light' ? 'Turning it on and off…' : 'Going down…'
  try {
    const r = await showOnSwitch(props.addr, what)
    const levels = r.levels ?? []
    if (levels.length && r.every) {
      let i = 0
      const say = () => {
        const n = levels[i], before = levels[i - 1]
        showing.value = `${before != null && n > before ? 'Coming back up' : 'Going down'}… ${n}%`
        if (++i >= levels.length) clearInterval(showTick)
      }
      say()
      showTick = window.setInterval(say, r.every * 1000)
    }
    showTimer = window.setTimeout(stopShowing, (r.seconds || 8) * 1000)
  } catch (e: any) { stopShowing(); notify(e.message, 'error') }
}

async function go(step: Step) {
  at.value = step
  if (step === 'light') show('light')
  if (step === 'dim') {
    // A switch that has just joined dims only once it is told it may, so it is told before it is tried.
    busy.value = true
    try {
      const r = await switchDims(props.addr, true)
      if (r.state === 'failed') notify(r.text ?? 'The switch didn’t take that.', 'error')
      else a.value = { ...a.value, restartOwed: true }
    } catch (e: any) { notify(e.message, 'error') }
    busy.value = false
    show('dim')
  }
  if (step === 'other') listen()
  if (step === 'room' && !device.value) {
    try { const s = await switchSetup(props.addr); device.value = s.device_id ?? null; if (!name.value) name.value = s.name ?? '' } catch {}
  }
}

async function lightCame(yes: boolean) {
  a.value = { ...a.value, light: yes }
  try { await switchHasLight(props.addr, yes) } catch (e: any) { notify(e.message, 'error') }
  go(next('light', a.value))
}

async function dimmed(yes: boolean, seen: string) {
  stopShowing()
  dimSeen.value = seen
  busy.value = true
  try {
    if (!yes) {
      const r = await switchDims(props.addr, false)
      if (r.state === 'failed') { notify(r.text ?? 'The switch didn’t take that.', 'error'); return }
    }
    a.value = { ...a.value, dims: yes, restartOwed: true }
    go(next('dim', a.value))
  } catch (e: any) { notify(e.message, 'error') } finally { busy.value = false }
}

async function listen() {
  heard.value = null; listening.value = true
  try { heard.value = (await listenForSwitch(props.addr)).heard }
  catch (e: any) { notify(e.message, 'error') }
  finally { listening.value = false }
}

async function pairHeard() {
  if (!heard.value) return
  busy.value = true
  try {
    const r = await pairSwitch(props.addr, heard.value.switch)
    if (r.state === 'failed') { notify(r.text ?? 'The two switches weren’t paired.', 'error'); return }
    partnerAddr.value = heard.value.switch
    a.value = { ...a.value, partner: heard.value.name }
    go(next('other', a.value))
  } catch (e: any) { notify(e.message, 'error') } finally { busy.value = false }
}

async function noPartner() {
  if (partnerAddr.value) { try { await unpairSwitch(props.addr) } catch {} partnerAddr.value = null }
  a.value = { ...a.value, partner: null }
  go(next('other', a.value))
}

function pickRoom(id: string) {
  room.value = id
  const r = rooms.value.find(x => x.id === id)?.name ?? ''
  name.value = nameFor(r, name.value, suggested.value)
  suggested.value = `${r} light`
}

async function placeAndName() {
  if (!device.value || !room.value) return
  busy.value = true
  try {
    await moveDevice(device.value, room.value)
    if (name.value.trim()) await renameDevice(device.value, name.value.trim(), true)
    if (a.value.light !== false) await switchWalkIn(props.addr, a.value.walkin ?? 'nothing')
    go('end')
  } catch (e: any) { notify(e.message, 'error') } finally { busy.value = false }
}

/* The end is the switch's settings page: changing a row here does the same as answering it did. */
async function changeDims(yes: boolean) {
  if (a.value.dims === yes) return
  try {
    const r = await switchDims(props.addr, yes)
    if (r.state === 'failed') return notify(r.text ?? 'The switch didn’t take that.', 'error')
    a.value = { ...a.value, dims: yes, restartOwed: true }
  } catch (e: any) { notify(e.message, 'error') }
}
async function changeWalkIn(mode: WalkIn) {
  const was = a.value.walkin
  a.value = { ...a.value, walkin: mode }
  try { await switchWalkIn(props.addr, mode) } catch (e: any) { a.value = { ...a.value, walkin: was }; notify(e.message, 'error') }
}

watch([at, heard, listening, room, busy, () => a.value.light], () => {
  const s = at.value
  if (s === 'other') {
    const acts: Act[] = []
    if (heard.value) acts.push({ label: 'Next', primary: true, run: pairHeard })
    else if (!listening.value) acts.push({ label: 'Listen again', primary: true, run: listen })
    if (a.value.light !== false) acts.push({ label: 'There isn’t another', run: noPartner })
    acts.push({ label: 'It isn’t added yet', run: () => emit('another') })
    emit('acts', acts)
  } else if (s === 'walkin') emit('acts', [{ label: 'Next', primary: true, run: () => go(next('walkin', a.value)) }])
  else if (s === 'room') emit('acts', room.value && device.value ? [{ label: 'Next', primary: true, run: placeAndName }] : [])
  else if (s === 'end') emit('acts', [{ label: 'Done', primary: true, run: () => emit('done') },
                                      { label: 'Add another switch', run: () => emit('another') }])
  else emit('acts', [])
  emit('head', s === 'end' ? `${lightName.value} is set up.` : '')
}, { immediate: true })

onMounted(() => go('light'))
onUnmounted(stopShowing)
</script>

<template>
  <div class="sw-setup">
    <template v-if="at !== 'end'">
      <div class="sw-count"><span class="sw-dots"><i v-for="n in count.of" :key="n" :class="{ on: n <= count.n }"></i></span>{{ count.n }} of {{ count.of }}</div>
      <div class="sw-said" v-for="r in answered" :key="r.step">
        <span class="sw-tick"><Icon name="check" :size="13" /></span>{{ r.lead }} <b>{{ r.answer }}</b>
        <button class="sw-change" @click="go(r.step)">Change</button>
      </div>
    </template>

    <!-- 1: does a light come on -->
    <template v-if="at === 'light'">
      <h3 class="sw-ask">Watch for a light.</h3>
      <p class="flow-desc">The house is turning the switch on and off. Look at the lights near it.</p>
      <div class="sw-q">
        <h3 class="sw-ask small">Did a light come on?</h3>
        <span class="sw-live" v-if="showing"><i></i>{{ showing }}</span>
      </div>
      <div class="sw-picks">
        <button class="sw-pick" @click="lightCame(true)"><span class="sw-pi"><Icon name="light" :size="20" /></span><span>Yes, a light came on</span></button>
        <button class="sw-pick" @click="lightCame(false)"><span class="sw-pi"><Icon name="switch" :size="20" /></span>
          <span>No, nothing came on<small>Then it’s the other switch for a light somewhere</small></span></button>
        <button class="sw-pick" @click="show('light')"><span class="sw-pi"><Icon name="eye" :size="20" /></span>
          <span>I can’t see it from here<small>Show it again, or go and stand by it</small></span></button>
      </div>
    </template>

    <!-- 2: does it dim -->
    <template v-else-if="at === 'dim'">
      <h3 class="sw-ask">Watch the light.</h3>
      <p class="flow-desc">The house is taking it slowly down to almost off, then back up. Bulbs that can’t dim give themselves away near the bottom.</p>
      <div class="sw-q">
        <h3 class="sw-ask small">What did it do?</h3>
        <span class="sw-live" v-if="showing || busy"><i></i>{{ busy ? 'Getting the switch ready…' : showing }}</span>
      </div>
      <div class="sw-picks">
        <button class="sw-pick" :disabled="busy" @click="dimmed(true, 'You saw it dim')"><span class="sw-pi"><Icon name="sun" :size="20" /></span>
          <span>It got dimmer, smoothly, all the way down<small>It becomes a dimmer: slide to set how bright</small></span></button>
        <button class="sw-pick" :disabled="busy" @click="dimmed(false, 'It stayed bright, then went off')"><span class="sw-pi"><Icon name="power" :size="20" /></span>
          <span>It stayed bright, then went off near the end<small>Or nothing changed at all. Then it stays on and off only</small></span></button>
        <button class="sw-pick" :disabled="busy" @click="dimmed(false, 'It flickered or buzzed')"><span class="sw-pi"><Icon name="wave" :size="20" /></span>
          <span>It flickered or buzzed<small>Then it stays on and off only. Some bulbs can’t dim</small></span></button>
        <button class="sw-pick" :disabled="busy" @click="show('dim')"><span class="sw-pi"><Icon name="eye" :size="20" /></span>
          <span>I can’t see it from here<small>Show it again, or go and stand by it</small></span></button>
      </div>
    </template>

    <!-- 3: the other switch for the same light -->
    <template v-else-if="at === 'other'">
      <h3 class="sw-ask">{{ a.light === false ? 'Which switch has the light?' : 'Is there another switch for this light?' }}</h3>
      <p class="flow-desc" v-if="a.light === false">Go and press the switch that turns the light on. The house is listening.</p>
      <p class="flow-desc" v-else>Stairs and long halls often have one at each end. If there is, go and press it. The house is listening.</p>
      <span class="sw-live" v-if="listening"><i></i>Listening for the other switch…</span>
      <p class="sheet-status" v-else-if="!heard">Nothing was pressed.</p>
      <div class="sw-picks" v-if="heard">
        <div class="sw-pick on"><span class="sw-pi"><Icon name="switch" :size="20" /></span>
          <span>Heard: {{ heard.name }}<small>Pressing either one will work this light</small></span></div>
      </div>
    </template>

    <!-- 4: walking in -->
    <template v-else-if="at === 'walkin'">
      <h3 class="sw-ask">Should it come on when someone walks in?</h3>
      <p class="flow-desc">The switch can tell when somebody is near it. The house does the rest, and you can change it later.</p>
      <div class="sw-picks">
        <button v-for="m in (['on_off', 'on', 'nothing'] as WalkIn[])" :key="m" class="sw-pick" :class="{ on: a.walkin === m }" @click="a = { ...a, walkin: m }">
          <span class="sw-pi"><Icon :name="m === 'nothing' ? 'close' : 'motion'" :size="20" /></span>
          <span>{{ m === 'on_off' ? 'Yes, and off after they leave' : m === 'on' ? 'Just turn it on' : 'No' }}<small v-if="m === 'on_off'">Ten minutes after the room empties</small></span>
        </button>
      </div>
    </template>

    <!-- 5: its room and name -->
    <template v-else-if="at === 'room'">
      <h3 class="sw-ask">Which room is it in?</h3>
      <p class="sheet-status" v-if="!device">Waiting for the light to show up in the house…</p>
      <div class="press-rooms">
        <button v-for="r in rooms" :key="r.id" class="chip-btn" :class="{ on: room === r.id }" @click="pickRoom(r.id)">
          <Icon v-if="room === r.id" name="check" :size="14" />{{ r.name }}
        </button>
      </div>
      <h3 class="label">And what do you call it?</h3>
      <label class="field"><input class="input" v-model="name" autocapitalize="words" spellcheck="false" /></label>
    </template>

    <!-- the end: what was found and chosen, and the switch's settings from now on -->
    <template v-else>
      <p class="flow-desc">This is what the house found out, and what you chose. Change any of it here, or later from the light.</p>
      <div class="sw-set">
        <span class="sw-k">Name and room</span>
        <span class="sw-seg plain"><b>{{ lightName }}</b><span class="chip-btn on"><Icon name="check" :size="14" />{{ rooms.find(r => r.id === room)?.name }}</span><button class="button small ghost" @click="go('room')">Change</button></span>
      </div>
      <div class="sw-set" v-if="a.light !== false">
        <span class="sw-k">The bulbs<small>{{ dimSeen || (a.dims ? 'You saw them dim' : 'You said they don’t dim') }}</small></span>
        <span class="sw-seg"><button :class="{ on: a.dims }" @click="changeDims(true)">Dim</button><button :class="{ on: a.dims === false }" @click="changeDims(false)">On and off only</button></span>
      </div>
      <div class="sw-set">
        <span class="sw-k">Other switches<small v-if="a.partner">You pressed it</small></span>
        <span class="sw-seg"><button :class="{ on: !!a.partner }" @click="go('other')">{{ a.partner ? a.partner[0].toUpperCase() + a.partner.slice(1) : 'Another switch' }}</button><button :class="{ on: !a.partner }" @click="noPartner">Just this one</button></span>
      </div>
      <div class="sw-set" v-if="a.light !== false">
        <span class="sw-k">When someone walks in</span>
        <span class="sw-seg"><button v-for="m in (['nothing', 'on', 'on_off'] as WalkIn[])" :key="m" :class="{ on: a.walkin === m }" @click="changeWalkIn(m)">{{ WALKIN_WORDS[m] }}</button></span>
      </div>
      <div class="sw-restart" v-if="a.restartOwed && a.light !== false">
        <span class="sw-pi"><Icon name="switch" :size="22" /></span>
        <span><b>Last step: restart the switch</b><small>Pull the small tab at the bottom of the switch out, then push it back in. The light goes off for a few seconds, and the switch comes back the way you set it up.</small></span>
      </div>
    </template>
  </div>
</template>
