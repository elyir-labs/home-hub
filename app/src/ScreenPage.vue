<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { store } from './store'
import { keepScreenRoom, screenRoom } from './screen'
import { pick, picked, defaultChoice } from './shade'
import { ask, becomeRole, here, lastTurn, putBack, restartScreen, turn, turnedLine, WAYS, type Role, type Turn } from './thisScreen'
import Icon from './Icon.vue'

/* This screen (design/this-screen/, A): what belongs to this glass rather than the house. Which way up it
   is drawn, the room it opens on, light or dark, whether it runs the house or shows another hub's, and its
   own restart. Only a screen has this page; the rows that need the screen itself to act show only when
   something on it answers (thisScreen.ts). */
onMounted(ask)

const room = computed(() => store.rooms.find(r => r.id === screenRoom())?.name ?? null)
const shade = computed(() => picked.value === 'light' || picked.value === 'dark' ? picked.value : defaultChoice(true) === 'light' ? 'light' : 'dark')
const home = computed(() => store.homeName || 'the house')
const where = computed(() => !room.value ? '' : /['’]/.test(room.value) ? room.value : `the ${room.value.toLowerCase()}`)

const error = ref('')
const busy = ref<string | null>(null)
async function doing(what: string, fn: () => Promise<unknown>) {
  busy.value = what; error.value = ''
  try { await fn() } catch (e: any) { error.value = e.message } finally { busy.value = null }
}
const turnBy = (by: Turn) => doing('turn', () => turn(by))

const asking = ref(false)
const chosen = ref<Role | null>(null)
const changed = ref(false)
function openAsk() { chosen.value = here.value?.role === 'hub' ? 'screen' : 'hub'; error.value = ''; asking.value = true }
async function change() {
  const to = chosen.value; if (!to || to === here.value?.role) { asking.value = false; return }
  await doing('role', () => becomeRole(to))
  if (!error.value) changed.value = true
}
const canShowOther = computed(() => here.value?.role === 'screen' || !!here.value?.other)
</script>

<template>
  <div class="page">
    <p class="page-lede">What you set here is for this screen alone, not the house.</p>

    <template v-if="here?.turns">
      <h3 class="label">Which way up</h3>
      <div class="ts-ways">
        <button v-for="w in WAYS" :key="w.by" class="ts-way" :class="['ts-by' + w.by, { on: w.by === 0, busy: busy === 'turn' }]" :disabled="!!busy" @click="turnBy(w.by)">
          <span class="ts-way-cell"><span class="ts-way-m" aria-hidden="true"><i class="roof"><Icon name="home" :size="11" /></i><i class="lit"></i><i class="wide"></i></span></span>
          <span class="ts-way-name">{{ w.name }}<span class="look-tick" v-if="w.by === 0"><Icon name="check" :size="11" /></span></span>
        </button>
      </div>
      <p class="ts-hint" v-if="lastTurn">{{ turnedLine(lastTurn.by) }} <button class="linkish" :disabled="!!busy" @click="doing('turn', putBack)">Put it back</button></p>
      <p class="ts-hint" v-else>Tap the one that looks the right way up from where you stand. Everything turns with it, and taps land where you touch.</p>
    </template>

    <ul class="hub-rows ts-rows">
      <li>
        <span class="hub-k">Room</span>
        <span class="hub-v">{{ room ?? 'Not chosen yet' }}<span class="hub-sub line">{{ room ? `It opens on ${where}, and goes back to it after resting.` : 'It opens on the room you choose, and goes back to it after resting.' }}</span></span>
        <button class="button small" @click="keepScreenRoom(null)">{{ room ? 'Change' : 'Choose' }}</button>
      </li>
      <li>
        <span class="hub-k">Light or dark</span>
        <span class="hub-v">{{ shade === 'light' ? 'Light' : 'Dark' }}<span class="hub-sub line">Only this screen. Phones pick their own.</span></span>
        <span class="ts-pair">
          <button class="button small" :class="{ ghost: shade !== 'light' }" @click="pick('light')">Light</button>
          <button class="button small" :class="{ ghost: shade !== 'dark' }" @click="pick('dark')">Dark</button>
        </span>
      </li>
      <li v-if="here?.role === 'screen'">
        <span class="hub-k">What it does</span>
        <span class="hub-v">Shows {{ home }} from the hub.<span class="hub-sub line">The hub is the small computer that runs the house. This screen runs nothing itself, so unplugging it changes nothing in the house.</span></span>
        <button class="button small" @click="openAsk">Change</button>
      </li>
      <li v-else-if="here?.role === 'hub'">
        <span class="hub-k">What it does</span>
        <span class="hub-v">Runs {{ home }}. This screen is the hub.<span class="hub-sub line">Phones and other screens show the house from here. Unplug it, and the house stops until it's back.</span></span>
        <button class="button small" @click="openAsk">Change</button>
      </li>
      <li v-if="here?.role === 'screen'">
        <span class="hub-k">Restart</span>
        <span class="hub-v">Restart this screen.<span class="hub-sub line">Only the screen. The house keeps running, and so do its lights.</span></span>
        <button class="button small ghost" :class="{ busy: busy === 'restart' }" @click="doing('restart', restartScreen)">Restart</button>
      </li>
      <li v-else-if="here?.role === 'hub'">
        <span class="hub-k">Restart</span>
        <span class="hub-v">This screen is the hub, so restarting it restarts the house.<span class="hub-sub line">That's on The hub, with the rest of what keeps the house running.</span></span>
        <button class="button small ghost" @click="store.sheet = 'hub'">The hub</button>
      </li>
    </ul>
    <p class="error" v-if="error && !asking">{{ error }}</p>

    <div class="ts-ask" v-if="asking" role="dialog" aria-label="What should this screen do?">
      <div class="ts-ask-veil" @click="!busy && !changed && (asking = false)"></div>
      <div class="ts-ask-card">
        <template v-if="changed">
          <h3 class="display">{{ chosen === 'hub' ? 'Starting a new house here' : 'Switching to the other hub' }}</h3>
          <p class="page-lede">This screen goes dark in a moment, and comes back when it's ready. It takes about two minutes.</p>
        </template>
        <template v-else>
          <h3 class="display">What should this screen do?</h3>
          <p class="page-lede">One or the other. Changing it takes about two minutes, and the screen goes dark while it does.</p>
          <template v-if="here?.role === 'screen'">
            <button class="ts-choice" :class="{ on: chosen === 'screen' }" @click="chosen = 'screen'"><span class="ts-radio"></span><span><span class="ts-choice-t1">Show {{ home }}</span><span class="ts-choice-t2">From the hub, as it does now.</span></span></button>
            <button class="ts-choice" :class="{ on: chosen === 'hub' }" @click="chosen = 'hub'"><span class="ts-radio"></span><span><span class="ts-choice-t1">Run a house of its own</span><span class="ts-choice-t2">A separate house, set up from the start on this screen, for a flat or an office with its own lights. {{ home }} carries on without it.</span></span></button>
            <p class="ts-ask-foot">Moving {{ home }} itself onto this screen is a backup on The hub, restored here once it's set up.</p>
          </template>
          <template v-else>
            <button class="ts-choice" :class="{ on: chosen === 'hub' }" @click="chosen = 'hub'"><span class="ts-radio"></span><span><span class="ts-choice-t1">Run {{ home }}</span><span class="ts-choice-t2">As it does now. This screen is the hub.</span></span></button>
            <button class="ts-choice" :class="{ on: chosen === 'screen' }" :disabled="!canShowOther" @click="chosen = 'screen'"><span class="ts-radio"></span><span><span class="ts-choice-t1">Show the house from another hub</span>
              <span class="ts-choice-t2">{{ here?.other ? `Found on your Wi‑Fi: a hub running ${here.other.home}.` : 'There’s no other hub on your Wi‑Fi. Plug the other one in first.' }}</span></span></button>
            <p class="ts-ask-foot warn" v-if="chosen === 'screen' && here?.other">This screen stops running {{ home }}, and anything set up only on it stops answering until it's added to the other hub. The house stays saved on this screen, so running it here again brings it back.</p>
          </template>
          <p class="error" v-if="error">{{ error }}</p>
          <div class="ts-ask-actions">
            <button class="button big ghost" :disabled="!!busy" @click="asking = false">Keep it as it is</button>
            <button class="button big" :class="{ busy: busy === 'role' }" :disabled="!chosen || chosen === here?.role || (chosen === 'screen' && !canShowOther)" @click="change">
              {{ here?.role === 'screen' ? 'Start a new house here' : 'Show the other hub’s house' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* the four turns, each the panel's three cards turned that far: the board's .way, at the panel's sizes */
.ts-ways { display: flex; gap: 10px; flex-wrap: wrap; }
.ts-way { width: 112px; padding: 8px 8px 10px; border-radius: var(--r-md); border: 1px solid var(--edge); background: var(--surface-hi);
          color: var(--ink); display: flex; flex-direction: column; align-items: center; }
.ts-way.on { border-color: rgba(var(--lamp-rgb), .75); background: rgba(var(--lamp-rgb), .06); }
.ts-way.busy { opacity: .6; }
.ts-way-cell { height: 92px; display: grid; place-items: center; }
.ts-way-m { width: 86px; height: 54px; border-radius: 8px; padding: 6px; display: grid; gap: 4px; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
            background: linear-gradient(#262842, #3a2a3a); }
.ts-way-m i { border-radius: 4px; background: rgba(255, 255, 255, .14); }
.ts-way-m i.lit { background: linear-gradient(#f8c98a, #f0ac63); }
.ts-way-m i.wide { grid-column: span 2; }
.ts-way-m i.roof { display: grid; place-items: center; color: var(--ink); }
.ts-by90 .ts-way-m { transform: rotate(90deg); }
.ts-by180 .ts-way-m { transform: rotate(180deg); }
.ts-by270 .ts-way-m { transform: rotate(-90deg); }
.ts-way-name { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 14.5px; white-space: nowrap; }
.ts-hint { margin: 10px 0 20px; font-size: 13.5px; color: var(--ink-2); }
.ts-pair { display: flex; gap: 6px; }

.ts-ask { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 24px; }
.ts-ask-veil { position: absolute; inset: 0; background: rgba(6, 7, 10, .62); }
.ts-ask-card { position: relative; width: min(100%, 640px); padding: 30px 32px 28px; border-radius: 26px; background: rgba(22, 24, 30, .97);
               border: 1px solid var(--edge-hi); box-shadow: 0 40px 100px -30px rgba(0, 0, 0, .9); }
.ts-ask-card h3 { margin: 0 0 10px; font-size: 34px; font-weight: 400; line-height: 1.08; }
.ts-choice { width: 100%; display: flex; gap: 14px; align-items: flex-start; text-align: left; padding: 16px 18px; border-radius: var(--r-md);
             border: 1px solid var(--edge); background: rgba(255, 255, 255, .03); color: var(--ink); }
.ts-choice + .ts-choice { margin-top: 10px; }
.ts-choice.on { border-color: rgba(var(--lamp-rgb), .75); background: rgba(var(--lamp-rgb), .07); }
.ts-choice:disabled { opacity: .55; }
.ts-radio { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--edge-hi); flex: none; margin-top: 2px; }
.ts-choice.on .ts-radio { border: 6px solid var(--lamp); }
.ts-choice-t1 { display: block; font-size: 17px; font-weight: 500; }
.ts-choice-t2 { display: block; margin-top: 3px; font-size: 14px; color: var(--muted); }
.ts-ask-foot { margin: 16px 0 0; font-size: 13px; color: var(--muted); }
.ts-ask-foot.warn { color: var(--lamp); }
.ts-ask-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; margin-top: 22px; }
.ts-ask-actions .button { margin: 0; }
</style>
