<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getMe, askToJoin, claimJoin, joinPluggedIn, joinWithCode } from './api'
import { lock, remember } from './code'
import Icon from './Icon.vue'
import { isScreen } from './screen'
import TurnPill from './TurnPill.vue'
import { hintParts, light, lit, onTV, typing } from './tv'

/* The house has a code and this device is not one of its phones yet. Two ways in: ask, and someone at a screen that
   is already in taps Allow (and types the passcode); or type the passcode here. Being on the Wi‑Fi alone gets nothing. */
const emit = defineEmits<{ joined: [] }>()
const home = ref('the house'), who = ref(''), code = ref(''), mode = ref<'ask' | 'code'>('ask'), error = ref(''), busy = ref(false), asked = ref<string | null>(null)
const ua = navigator.userAgent
const device = /iPad/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone'
  : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet') : matchMedia('(max-width: 860px)').matches ? 'phone' : 'screen'
/* A screen on the wall is nobody's, so it is not asked for a name: it takes its room's once it has one (design/companion/, C). */
const screen = isScreen()
const name = computed(() => { if (screen) return 'A screen'; const w = who.value.trim(); return w ? `${w}'s ${device}` : `A ${device}` })
let poll: number | undefined
const preview = new URLSearchParams(location.search).get('join') === '1'   // ?join=1 keeps the screen up against a hub that would let this device in
/* On a TV (design/tv-join/, C): the screen plugged into the hub is already in. Any other asks every phone as it comes
   up, and the passcode can be typed meanwhile, with the remote's numbers or on the pad the arrows move on. */
const tv = onTV()
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'join']
const boxes = computed(() => Math.min(8, Math.max(4, code.value.length + 1)))
const padEl = ref<HTMLElement | null>(null), scale = ref(1)
const fit = () => (scale.value = Math.min(innerWidth / 1920, innerHeight / 1080))
const hint = computed(() => hintParts(lit.value?.dataset.hint ?? ''))
onMounted(async () => {
  if (tv) {
    fit(); window.addEventListener('resize', fit)
    typing.value = { digit: d => key(d), back: () => !!code.value && (key('del'), true) }
    light(padEl.value?.querySelector<HTMLElement>('[data-tv-start]') ?? null)
  }
  try {
    const me = await getMe(); home.value = me.home
    if (me.paired && !preview) return done()
    if (me.plugged_in && me.locked) { await joinPluggedIn(); return done() }
  } catch {}
  if (tv && !asked.value) ask()
})
onUnmounted(() => { clearInterval(poll); if (tv) { typing.value = null; window.removeEventListener('resize', fit) } })
function key(k: string) {
  if (busy.value) return
  error.value = ''
  if (k === 'del') code.value = code.value.slice(0, -1)
  else if (k === 'join') { if (code.value.length >= 4) withCode() }
  else if (code.value.length < 8) {
    code.value += k
    if (code.value.length >= 4 && padEl.value?.contains(lit.value)) light(padEl.value.querySelector<HTMLElement>('[data-k="join"]'))
  }
}
function done() { clearInterval(poll); lock.unpaired = false; emit('joined') }
async function ask() {
  if (busy.value) return
  error.value = ''; busy.value = true
  try { const a = await askToJoin(name.value, screen ? 'screen' : undefined); asked.value = a.id; poll = window.setInterval(check, 2000) } catch (e: any) { if (!tv) error.value = e.message }
  busy.value = false
}
async function check() {
  if (!asked.value) return
  try {
    const c = await claimJoin(asked.value)
    if (c.state === 'allowed') done()
    else if (c.state === 'gone') { clearInterval(poll); asked.value = null; error.value = tv ? 'Not this time. Type the passcode.' : 'Not this time. Ask again, or type the passcode.' }
  } catch {}
}
function cancel() { clearInterval(poll); asked.value = null }
async function withCode() {
  if (busy.value) return
  error.value = ''
  if (!/^\d{4,8}$/.test(code.value)) { error.value = 'A passcode is 4 to 8 digits.'; return }
  busy.value = true
  try { await joinWithCode(code.value, name.value, screen ? 'screen' : undefined); remember(code.value); done() } catch (e: any) { error.value = e.message; if (tv) code.value = '' }
  busy.value = false
}
</script>

<template>
  <main v-if="tv" class="tvj-wrap join">
    <div class="tvj" :style="{ zoom: scale }">
      <div class="tvj-ask">
        <span class="tvj-mark"><Icon name="home" :size="40" /></span>
        <h1>This TV is for {{ home.replace(/ (\S+)$/, '\u00a0$1') }}.</h1>
        <p class="tvj-lede">Say yes on a phone that already uses the house, or type the house passcode with the remote's numbers or the pad.</p>
        <div class="tvj-code" aria-label="The passcode"><i v-for="i in boxes" :key="i" :class="{ on: i <= code.length, now: i === code.length + 1 }"></i></div>
        <p class="tvj-error">{{ busy ? 'Joining…' : error }}</p>
        <p class="tvj-waiting" v-if="asked"><span class="pulse-dot"></span>Asked every phone in the house</p>
      </div>
      <div class="tvj-pad" ref="padEl">
        <button v-for="k in PAD" :key="k" class="tvj-k" :class="{ small: k === 'del', go: k === 'join', off: k === 'join' && code.length < 4 }" :data-k="k"
                data-tv :data-tv-start="k === '1' ? '' : undefined" :aria-label="k === 'del' ? 'Take one off' : undefined"
                :data-hint="k === 'del' ? 'OK|Take one off;Back|Take one off' : k === 'join' ? 'OK|Join the house' : `OK|Type ${k};0–9|Type straight in`"
                @click="key(k)">{{ k === 'del' ? '⌫' : k === 'join' ? 'Join' : k }}</button>
      </div>
      <div class="tvj-hint" aria-live="polite"><span v-for="(h, i) in hint" :key="i">{{ h.before }}<kbd v-for="k in h.keys" :key="k">{{ k }}</kbd>{{ h.words }}</span></div>
    </div>
  </main>
  <main v-else class="setup join">
    <section class="setup-page" v-if="screen">
      <span class="setup-mark"><Icon name="home" :size="30" /></span>
      <h1 class="display">This screen is for {{ home }}.</h1>
      <template v-if="!asked">
        <p class="setup-lede">Its hub is on this Wi‑Fi. Type the house passcode to finish.</p>
        <input class="input code-input screen-code" v-model="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="8" placeholder="••••" aria-label="The passcode" @keydown.enter="withCode" />
        <p class="error" v-if="error">{{ error }}</p>
        <div class="setup-actions">
          <button class="button big" :class="{ busy }" :disabled="code.length < 4" @click="withCode">Continue</button>
          <button class="button ghost big" @click="ask">Ask from another screen</button>
        </div>
      </template>
      <template v-else>
        <p class="setup-lede">Asked. Say yes on a phone or another screen in the house, and this one opens by itself.</p>
        <p class="setup-status"><span class="pulse-dot"></span> Waiting for a yes…</p>
        <p class="setup-foot"><button class="linkish" @click="cancel">Type the passcode instead</button></p>
      </template>
    </section>
    <section class="setup-page" v-else>
      <span class="setup-mark"><Icon name="phone" :size="30" /></span>
      <h1 class="display">Join {{ home }}.</h1>
      <template v-if="!asked">
        <p class="setup-lede">This {{ device }} is new here. Someone at the wall screen can allow it, or you can type the house's passcode.</p>
        <label class="field"><span class="field-label">Your name <span class="field-opt">· so the house knows whose this is</span></span>
          <input class="input" v-model="who" autocomplete="given-name" autocapitalize="words" placeholder="Sam" @keydown.enter="mode === 'code' ? withCode() : ask()" /></label>
        <label class="field" v-if="mode === 'code'"><span class="field-label">The passcode</span>
          <input class="input code-input secret" v-model="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="8" placeholder="••••" @keydown.enter="withCode" /></label>
        <p class="error" v-if="error">{{ error }}</p>
        <div class="setup-actions" v-if="mode === 'ask'">
          <button class="button big" :class="{ busy }" @click="ask">Ask to join</button>
          <button class="button ghost" @click="mode = 'code'; error = ''">I know the passcode</button>
        </div>
        <div class="setup-actions" v-else>
          <button class="button big" :class="{ busy }" :disabled="code.length < 4" @click="withCode">Join</button>
          <button class="button ghost" @click="mode = 'ask'; error = ''">Ask instead</button>
        </div>
        <p class="setup-foot">Connect to your home Wi‑Fi first. You can see and remove phones any time in <i>People</i>.</p>
      </template>
      <template v-else>
        <p class="setup-lede">Asked as <b>{{ name }}</b>. On the wall screen, or on a phone that already uses the house, tap <b>Allow</b>.</p>
        <p class="setup-status"><span class="pulse-dot"></span> Waiting for someone to answer…</p>
        <div class="setup-actions"><button class="button ghost" @click="cancel">Cancel</button></div>
      </template>
    </section>
    <TurnPill v-if="screen" />
  </main>
</template>

<style scoped>
/* Drawn at the TV's 1920x1080 and scaled to it, read from the sofa: nothing a person must read is under 22px. */
.tvj-wrap { position: fixed; inset: 0; z-index: 1; overflow: hidden; }
.tvj { position: relative; width: 1920px; height: 1080px; color: var(--ink); --safe-x: 96px; --safe-y: 54px; }
.tvj-ask { position: absolute; left: 300px; top: 110px; width: 760px; }
.tvj-mark { width: 88px; height: 88px; border-radius: var(--r-lg); display: grid; place-items: center; color: var(--lamp);
            background: rgba(255, 255, 255, 0.06); border: 1px solid var(--edge); }
.tvj h1 { margin: 36px 0 0; font-size: 80px; font-weight: 400; letter-spacing: -0.03em; line-height: 1.02; }
.tvj-lede { margin: 26px 0 0; font-size: 30px; line-height: 1.35; color: var(--ink-2); max-width: 720px; }
.tvj-code { display: flex; gap: 22px; margin-top: 40px; }
.tvj-code i { width: 116px; height: 136px; border-radius: var(--r-lg); display: grid; place-items: center;
              background: rgba(255, 255, 255, 0.06); border: 1px solid var(--edge-hi); }
.tvj-code i.now { border-color: rgba(var(--lamp-rgb), 0.9); box-shadow: inset 0 0 0 1px rgba(var(--lamp-rgb), 0.9); }
.tvj-code i.now::after { content: ""; width: 3px; height: 56px; background: var(--lamp); animation: tvj-blink 1.1s steps(1) infinite; }
.tvj-code i.on::after { content: ""; width: 22px; height: 22px; border-radius: 50%; background: var(--ink); }
@keyframes tvj-blink { 50% { opacity: 0; } }
.tvj-error { margin: 14px 0 0; font-size: 26px; color: var(--ink-2); min-height: 34px; }
.tvj-waiting { display: flex; align-items: center; gap: 18px; margin-top: 8px; font-size: 28px; color: var(--ink-2); }
.tvj-pad { position: absolute; left: 1180px; top: 250px; display: grid; grid-template-columns: repeat(3, 132px); gap: 20px; }
.tvj-k { height: 112px; border-radius: 24px; display: grid; place-items: center; font-family: inherit; font-size: 46px; font-weight: 400; color: var(--ink); cursor: pointer;
         background: var(--surface); border: 1px solid var(--edge); }
.tvj-k.small { color: var(--ink-2); font-size: 30px; }
.tvj-k.go { background: rgba(var(--lamp-rgb), 0.2); border-color: rgba(var(--lamp-rgb), 0.5); color: var(--lamp); font-size: 26px; font-weight: 500; }
.tvj-k.off { opacity: 0.45; }
.tvj-hint { position: absolute; left: var(--safe-x); bottom: var(--safe-y); display: flex; gap: 28px; align-items: center; font-size: 22px; color: var(--ink-2); white-space: nowrap; }
.tvj-hint span { display: inline-flex; gap: 10px; align-items: center; }
.tvj-hint kbd { font-family: inherit; font-size: 17px; font-weight: 600; line-height: 1; letter-spacing: 0.04em; color: var(--ink); min-width: 40px; height: 36px; padding: 0 10px; display: inline-grid; place-items: center;
                border-radius: 18px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge-hi); }
</style>
