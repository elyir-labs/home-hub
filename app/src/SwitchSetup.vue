<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { addRoom, listenForSwitch, moveDevice, pairSwitch, renameDevice, showOnSwitch, switchDims, switchHasLight,
         switchSetup, switchWalkIn, unpairSwitch } from './api'
import { store, notify } from './store'
import type { Act, Caught, Working } from './adding'
import Blink from './prove/Blink.vue'
import { foundLine, next, nameFor, progress, said as saidRows, WALKIN_WORDS, type Answers, type Step, type WalkIn } from './switchSetup'
import Icon from './Icon.vue'

/*
 * A wall switch that just joined, set up on the light itself (design/switch-setup/, C). The rules for
 * which step follows which are switchSetup.ts's; this draws one step at a time and hands its buttons to
 * the Add shell, which puts them where every other route's are.
 */
/* `settings`: opened from the light's own screen, on the page setup ended on, with what the house already
   knows about the switch (design/switch-setup/, dimming is your choice, A). */
const props = defineProps<{ addr: string; deviceId?: string | null; name?: string | null; settings?: boolean }>()
const emit = defineEmits<{ acts: [Act[]]; head: [string]; another: []; done: [] }>()

const me = ref(props.addr)               // the switch being set up: becomes the one with the light when that joins second
const at = ref<Step>('light')
const a = ref<Answers>({ walkin: 'on_off' })
const device = ref<string | null>(props.deviceId ?? null)
const showing = ref('')                 // what the light is doing right now, said while it does it
const busy = ref(false)
/* A setting on its way to the switches takes tens of seconds over the mesh, so the choice moves when it is tapped and
   breathes until it lands; refused, it goes back and the reason stays in its row (design/switch-setup/ChooseA-working). */
type Row = 'dims' | 'other'
const pending = ref<{ row: Row; to: boolean } | null>(null)
const refused = ref<{ row: Row; text: string } | null>(null)
const dimsShown = computed(() => pending.value?.row === 'dims' ? pending.value.to : a.value.dims)
const partnerShown = computed(() => pending.value?.row === 'other' ? false : !!a.value.partner)
const heard = ref<{ switch: string; name: string } | null>(null)
const listening = ref(false)
const room = ref('')
const name = ref(props.name ?? '')
const suggested = ref(props.name ?? '')   // the house's own name for it counts as not typed
const partnerAddr = ref<string | null>(null)
/* The other switch for this light, added from inside this step (design/switch-setup/, two switches for one
   light, B, from either end). */
const adding = ref<'off' | 'looking' | 'working' | 'joined' | 'wrong'>('off')
const addingSays = ref('')
const blinkActs = ref<Act[]>([])
const blinkTry = ref(0)
const otherDevice = ref<string | null>(null)
const naming = ref(false), fresh = ref(''), madeRoom = ref('')
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
    const r = await showOnSwitch(me.value, what)
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
      const r = await switchDims(me.value, true, undefined, true)
      if (r.state === 'failed') notify(r.text ?? 'The switch didn’t take that.', 'error')
      else a.value = { ...a.value, restartOwed: true }
    } catch (e: any) { notify(e.message, 'error') }
    busy.value = false
    show('dim')
  }
  if (step === 'other') listen()
  if (step === 'room' && !device.value) {
    try { const s = await switchSetup(me.value); device.value = s.device_id ?? null; if (!name.value) name.value = s.name ?? '' } catch {}
  }
}

async function lightCame(yes: boolean) {
  a.value = { ...a.value, light: yes }
  try { await switchHasLight(me.value, yes) } catch (e: any) { notify(e.message, 'error') }
  go(next('light', a.value))
}

async function dimmed(yes: boolean) {
  stopShowing()
  busy.value = true
  try {
    const r = await switchDims(me.value, yes, yes)
    if (r.state === 'failed') { notify(r.text ?? 'The switch didn’t take that.', 'error'); return }
    a.value = { ...a.value, dims: yes, canDim: yes, restartOwed: true }
    go(next('dim', a.value))
  } catch (e: any) { notify(e.message, 'error') } finally { busy.value = false }
}

async function listen() {
  if (adding.value !== 'off') return
  heard.value = null; listening.value = true
  try { heard.value = (await listenForSwitch(me.value)).heard }
  catch (e: any) { notify(e.message, 'error') }
  finally { listening.value = false }
}

async function pairHeard() {
  if (!heard.value || busy.value) return
  busy.value = true
  try {
    const r = await pairSwitch(me.value, heard.value.switch)
    if (r.state === 'failed') { notify(r.text ?? 'The two switches weren’t paired.', 'error'); return }
    partnerAddr.value = heard.value.switch
    a.value = { ...a.value, partner: heard.value.name, restartOwed: a.value.restartOwed || !!r.restart }
    go(next('other', a.value))
  } catch (e: any) { notify(e.message, 'error') } finally { busy.value = false }
}

function addTheOther() { adding.value = 'looking'; addingSays.value = ''; blinkTry.value++ }
function addingWorks(w: Working) { adding.value = 'working'; addingSays.value = w.text }
function addingFailed(text: string) { adding.value = 'wrong'; addingSays.value = text }
function backFromAdding() { adding.value = 'off'; listen() }

/* Whichever end it was started from, the switch with no light of its own is the one told who its partner is
   (pair() in the hub). Started at the far end, the switch that just joined has the light, so the setup
   carries on as that one: its dim test, walking in, room and name. */
async function otherJoined(c: Caught) {
  if (!c.switch) return addingFailed('The other switch joined, but the bridge couldn’t finish it.')
  adding.value = 'working'; addingSays.value = 'Joining the two switches…'
  const first = me.value, firstHasLight = a.value.light !== false
  let restart: boolean
  try {
    await switchHasLight(c.switch, !firstHasLight)
    const r = await pairSwitch(first, c.switch)
    if (r.state === 'failed') return addingFailed(r.text ?? 'The two switches weren’t paired.')
    restart = !!r.restart
  } catch (e: any) { return addingFailed(e.message) }
  if (firstHasLight) {
    partnerAddr.value = c.switch; otherDevice.value = c.device_id ?? null
    a.value = { ...a.value, partner: 'the other end', restartOwed: a.value.restartOwed || restart }
    adding.value = 'joined'
    return
  }
  otherDevice.value = device.value
  me.value = c.switch; device.value = c.device_id ?? null; partnerAddr.value = first
  name.value = c.name ?? ''; suggested.value = c.name ?? ''
  a.value = { light: true, partner: 'the other end', walkin: 'on_off', otherFirst: true }
  adding.value = 'off'
  go('dim')
}

async function makeRoom() {
  const n = fresh.value.trim()
  if (!n) return
  try {
    const r = await addRoom(n)
    if (!store.rooms.some(x => x.id === r.id)) store.rooms.push({ id: r.id, name: r.name, devices: [], intent: 'unknown' })
    naming.value = false; fresh.value = ''; madeRoom.value = r.id
    pickRoom(r.id)
  } catch (e: any) { notify(e.message, 'error') }
}

async function noPartner() {
  if (pending.value) return
  if (partnerAddr.value) {
    refused.value = null
    pending.value = { row: 'other', to: false }
    try {
      const r = await unpairSwitch(me.value)
      if (r.state === 'failed') { refused.value = { row: 'other', text: r.text ?? 'The two switches weren’t separated. Try again.' }; return }
    } catch (e: any) { refused.value = { row: 'other', text: e.message }; return } finally { pending.value = null }
    partnerAddr.value = null
  }
  a.value = { ...a.value, partner: null }
  if (at.value === 'end') return
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
    if (otherDevice.value) await moveDevice(otherDevice.value, room.value)
    if (name.value.trim()) await renameDevice(device.value, name.value.trim(), true)
    if (a.value.light !== false) await switchWalkIn(me.value, a.value.walkin ?? 'nothing')
    go('end')
  } catch (e: any) { notify(e.message, 'error') } finally { busy.value = false }
}

/* The end is the switch's settings page: changing a row here does the same as answering it did. */
async function changeDims(yes: boolean) {
  if (pending.value || a.value.dims === yes || (yes && a.value.canDim === false)) return
  refused.value = null
  pending.value = { row: 'dims', to: yes }
  try {
    const r = await switchDims(me.value, yes)
    if (r.state === 'failed') { refused.value = { row: 'dims', text: r.text ?? 'The switch didn’t take that. Try again.' }; return }
    a.value = { ...a.value, dims: yes, restartOwed: true }
  } catch (e: any) { refused.value = { row: 'dims', text: e.message } } finally { pending.value = null }
}
async function changeWalkIn(mode: WalkIn) {
  const was = a.value.walkin
  a.value = { ...a.value, walkin: mode }
  try { await switchWalkIn(me.value, mode) } catch (e: any) { a.value = { ...a.value, walkin: was }; notify(e.message, 'error') }
}

watch([at, heard, listening, room, busy, () => a.value.light, adding, blinkActs], () => {
  const s = at.value
  if (s === 'other' && adding.value !== 'off') {
    const back = { label: 'Back', run: backFromAdding }
    if (adding.value === 'looking') emit('acts', [...blinkActs.value.filter(x => !/code/.test(x.label)), back])
    else if (adding.value === 'joined') emit('acts', [{ label: 'Next', primary: true, run: () => { adding.value = 'off'; go(next('other', a.value)) } }])
    else if (adding.value === 'wrong') emit('acts', [{ label: 'Try again', primary: true, run: addTheOther }, back])
    else emit('acts', [])
  } else if (s === 'other') {
    const acts: Act[] = []
    if (!busy.value && heard.value) acts.push({ label: 'Next', primary: true, run: pairHeard })
    else if (!busy.value && !listening.value) acts.push({ label: 'Listen again', primary: true, run: listen })
    if (!busy.value && a.value.light !== false) acts.push({ label: 'There isn’t another', run: noPartner })
    emit('acts', acts)
  } else if (s === 'walkin') emit('acts', [{ label: 'Next', primary: true, run: () => go(next('walkin', a.value)) }])
  else if (s === 'room') emit('acts', room.value && device.value ? [{ label: 'Next', primary: true, run: placeAndName }] : [])
  else if (s === 'end') emit('acts', props.settings ? [{ label: 'Done', primary: true, run: () => emit('done') }]
                                    : [{ label: 'Done', primary: true, run: () => emit('done') },
                                       { label: 'Add another switch', run: () => emit('another') }])
  else emit('acts', [])
  emit('head', s === 'end' ? (props.settings ? `${lightName.value} and its switch` : `${lightName.value} is set up.`) : '')
}, { immediate: true })

async function openSettings() {
  try {
    const s = await switchSetup(me.value)
    let partner: string | null = null
    if (s.partner) { try { partner = (await switchSetup(s.partner)).name ?? 'another switch' } catch { partner = 'another switch' } }
    a.value = { light: s.light, dims: s.dims, canDim: s.can_dim ?? null, walkin: s.walkin, partner }
    partnerAddr.value = s.partner
    device.value = s.device_id ?? device.value
    room.value = store.rooms.flatMap(r => r.devices.map(d => ({ room: r.id, id: d.id }))).find(d => d.id === device.value)?.room ?? ''
    if (!name.value) name.value = s.name ?? ''
  } catch (e: any) { notify(e.message, 'error') }
  at.value = 'end'
}

onMounted(() => props.settings ? openSettings() : go('light'))
onUnmounted(stopShowing)
</script>

<template>
  <div class="sw-setup">
    <template v-if="at !== 'end'">
      <div class="sw-count"><span class="sw-dots"><i v-for="n in count.of" :key="n" :class="{ on: n <= count.n }"></i></span>{{ count.n }} of {{ count.of }}</div>
      <div class="sw-said" v-for="r in answered" :key="r.step + r.lead">
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
        <button class="sw-pick" :disabled="busy" @click="dimmed(true)"><span class="sw-pi"><Icon name="sun" :size="20" /></span>
          <span>It got dimmer, smoothly, all the way down<small>It becomes a dimmer: slide to set how bright</small></span></button>
        <button class="sw-pick" :disabled="busy" @click="dimmed(false)"><span class="sw-pi"><Icon name="power" :size="20" /></span>
          <span>It stayed bright, then went off near the end<small>Or nothing changed at all. Then it stays on and off only</small></span></button>
        <button class="sw-pick" :disabled="busy" @click="dimmed(false)"><span class="sw-pi"><Icon name="wave" :size="20" /></span>
          <span>It flickered or buzzed<small>Then it stays on and off only. Some bulbs can’t dim</small></span></button>
        <button class="sw-pick" :disabled="busy" @click="show('dim')"><span class="sw-pi"><Icon name="eye" :size="20" /></span>
          <span>I can’t see it from here<small>Show it again, or go and stand by it</small></span></button>
      </div>
    </template>

    <!-- 3: the other switch for the same light -->
    <template v-else-if="at === 'other' && adding === 'off'">
      <h3 class="sw-ask">{{ a.light === false ? 'Which switch has the light?' : 'Is there another switch for this light?' }}</h3>
      <p class="flow-desc" v-if="a.light === false">If the switch that turns the light on is already on the house, go and press it.</p>
      <p class="flow-desc" v-else>Stairs and long halls often have one at each end. If the other one is already on the house, go and press it.</p>
      <span class="sw-live" v-if="listening"><i></i>Listening for the other switch…</span>
      <p class="sheet-status" v-else-if="!heard">Nothing was pressed.</p>
      <div class="sw-picks">
        <div class="sw-pick on" v-if="heard"><span class="sw-pi"><Icon name="switch" :size="20" /></span>
          <span>Heard: {{ heard.name }}<small>Pressing either one will work this light</small></span></div>
        <p class="flow-desc pulse" v-if="heard && busy">Joining the two switches…</p>
        <button class="sw-pick" v-else @click="addTheOther"><span class="sw-pi"><Icon name="plus" :size="20" /></span>
          <span>{{ a.light === false ? 'It isn’t added yet' : 'There is, but it isn’t added yet' }}<small>{{ a.light === false ? 'Add it now, from here. Then the light is set up from it' : 'Add it now, from here. Then this one carries on' }}</small></span></button>
      </div>
    </template>
    <template v-else-if="at === 'other' && adding === 'joined'">
      <div class="sw-said"><span class="sw-tick"><Icon name="check" :size="13" /></span>Other switches for this light: <b>the other end, just added</b></div>
      <h3 class="sw-ask">Both switches work this light now.</h3>
      <p class="flow-desc">Try the other end on your way past. Next, what the light does when someone walks in.</p>
    </template>
    <template v-else-if="at === 'other'">
      <h3 class="sw-ask">Start the other switch over.</h3>
      <p class="flow-desc">Go to the other switch. Pull its small tab out, push it back in, then hold a finger flat on it until it blinks.</p>
      <!-- kept mounted while it adds: its answer arrives after it says it is working -->
      <Blink v-if="adding === 'looking' || adding === 'working'" v-show="adding === 'looking'" :key="blinkTry" @acts="(x: Act[]) => blinkActs = x" @working="addingWorks" @caught="otherJoined" @wrong="addingFailed" @proof="() => {}" />
      <p class="flow-desc pulse" v-if="adding === 'working'">{{ addingSays }}</p>
      <p class="flow-desc" v-else-if="adding === 'wrong'">{{ addingSays }}</p>
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
        <button v-if="!naming" class="chip-btn sw-newroom" @click="naming = true"><Icon name="plus" :size="14" />New room</button>
        <span v-else class="chip-btn sw-newroom naming">
          <input class="sw-newroom-input" v-model="fresh" placeholder="Stairway" autocapitalize="words" aria-label="The new room’s name" @keydown.enter="makeRoom" />
          <button class="button small" :disabled="!fresh.trim()" @click="makeRoom">Add</button>
        </span>
      </div>
      <h3 class="label">And what do you call it?</h3>
      <label class="field"><input class="input" v-model="name" autocapitalize="words" spellcheck="false" /></label>
      <p class="sheet-status" v-if="madeRoom && room === madeRoom && name === suggested">Named after its new room. Type over it to call it something else.</p>
    </template>

    <!-- the end: what was found and chosen, and the switch's settings from now on -->
    <template v-else>
      <p class="flow-desc" v-if="settings">How the switch for this light is set up. Change any of it here.</p>
      <p class="flow-desc" v-else>This is what the house found out, and what you chose. Change any of it here, or later from the light.</p>
      <div class="sw-set">
        <span class="sw-k">Name and room</span>
        <span class="sw-seg plain"><b>{{ lightName }}</b><span class="chip-btn on"><Icon name="check" :size="14" />{{ rooms.find(r => r.id === room)?.name }}</span><button class="button small ghost" @click="go('room')">Change</button></span>
      </div>
      <div class="sw-set" v-if="a.light !== false">
        <span class="sw-k">From the switch<small v-if="pending?.row === 'dims'" class="sw-going">{{ partnerAddr ? 'Setting both switches… about half a minute' : 'Setting the switch…' }}</small><small v-else-if="refused?.row === 'dims'" class="sw-refused">{{ refused.text }}</small><small v-else-if="foundLine(a)">{{ foundLine(a) }}</small></span>
        <span class="sw-seg"><button :class="{ on: dimsShown, 'sw-going': pending?.row === 'dims' && dimsShown }" :disabled="a.canDim === false || (!!pending && !dimsShown)" @click="changeDims(true)">Dim</button><button :class="{ on: dimsShown === false, 'sw-going': pending?.row === 'dims' && dimsShown === false }" :disabled="!!pending && dimsShown !== false" @click="changeDims(false)">On and off only</button></span>
      </div>
      <div class="sw-set">
        <span class="sw-k">Other switches<small v-if="pending?.row === 'other'" class="sw-going">Separating the two switches…</small><small v-else-if="refused?.row === 'other'" class="sw-refused">{{ refused.text }}</small><small v-else-if="a.partner && !otherDevice">You pressed it</small><small v-else-if="a.partner">Added with this one</small></span>
        <span class="sw-seg"><button :class="{ on: partnerShown }" :disabled="!!pending" @click="go('other')">{{ a.partner ? a.partner[0].toUpperCase() + a.partner.slice(1) : 'Another switch' }}</button><button :class="{ on: !partnerShown, 'sw-going': pending?.row === 'other' }" :disabled="!!pending && pending.row !== 'other'" @click="noPartner">Just this one</button></span>
      </div>
      <div class="sw-set" v-if="a.light !== false">
        <span class="sw-k">When someone walks in</span>
        <span class="sw-seg"><button v-for="m in (['nothing', 'on', 'on_off'] as WalkIn[])" :key="m" :class="{ on: a.walkin === m }" @click="changeWalkIn(m)">{{ WALKIN_WORDS[m] }}</button></span>
      </div>
      <div class="sw-restart" v-if="a.restartOwed && a.light !== false">
        <span class="sw-pi"><Icon name="switch" :size="22" /></span>
        <span v-if="partnerAddr"><b>{{ settings ? 'Then restart both switches' : 'Last step: restart both switches' }}</b><small>At each switch, pull the small tab at the bottom out, then push it back in. The light goes off for a few seconds, and both come back the way you set them up.</small></span>
        <span v-else><b>{{ settings ? 'Then restart the switch' : 'Last step: restart the switch' }}</b><small>Pull the small tab at the bottom of the switch out, then push it back in. The light goes off for a few seconds, and the switch comes back the way you set it up.</small></span>
      </div>
    </template>
  </div>
</template>
