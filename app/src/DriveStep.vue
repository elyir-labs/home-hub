<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* First run on a hub running from its USB stick, beside a drive with something on it (design/move-to-drive/,
   A). Asked once, before the house exists, so moving loses nothing: erase the drive and put the hub on it, or
   keep the drive and run from the stick. Erasing says what is lost by name and wakes only on a typed word;
   the copy itself happens while the hub restarts (driver-layer/host/move-early.sh), and this page waits. */
import { computed, onUnmounted, ref } from 'vue'
import { driveSeen, getDrive, keepDrive, moveToDrive, type DriveState } from './api'
import { confirmed, lost, title } from './drive'
import DriveCard from './DriveCard.vue'

const props = defineProps<{ page: 'drive' | 'erase' | 'moving' | 'moved'; state: DriveState }>()
const emit = defineEmits<{ go: [page: 'drive' | 'erase' | 'moving' | 'moved' | 'welcome'] }>()
const choice = ref<'erase' | 'keep'>('erase')
const typed = ref(''), busy = ref(false), error = ref('')
const drive = computed(() => props.state.drive)

async function onward() {
  if (choice.value === 'erase') return emit('go', 'erase')
  busy.value = true
  try { await keepDrive(); emit('go', 'welcome') } catch (e: any) { error.value = e.message }
  busy.value = false
}

let poll = 0
async function erase() {
  if (!drive.value || !confirmed(typed.value) || busy.value) return
  busy.value = true; error.value = ''
  try { await moveToDrive(drive.value.name, drive.value.serial) }
  catch (e: any) { error.value = e.message; busy.value = false; return }
  emit('go', 'moving')
  // The hub restarts to copy itself, so for a few minutes nothing answers. Then it answers from the drive.
  poll = window.setInterval(async () => {
    let s: DriveState
    try { s = await getDrive() } catch { return }
    if (s.from === 'drive') { clearInterval(poll); emit('go', s.moved ? 'moved' : 'welcome') }
    else if (s.failed || s.refused) { clearInterval(poll); busy.value = false; error.value = s.failed || s.refused || ''; emit('go', 'drive') }
  }, 3000)
}
onUnmounted(() => clearInterval(poll))

async function moved() { try { await driveSeen() } catch {} emit('go', 'welcome') }
</script>

<template>
  <template v-if="page === 'drive' && drive">
    <span class="setup-mark"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="9" width="8" height="12" rx="1.5" /><path d="M9.5 9V3.5h5V9M11 5.5h.01M13 5.5h.01" /></svg></span>
    <h1 class="display">This computer’s drive isn’t empty.</h1>
    <p class="setup-lede">The hub is running from the USB stick for now, and hasn’t touched the drive.</p>
    <p class="setup-note" v-if="error || state.failed">{{ error || state.failed }}</p>
    <DriveCard :drive="drive" />
    <div class="ds-opts" role="radiogroup">
      <button class="ds-opt" role="radio" :aria-checked="choice === 'erase'" :class="{ on: choice === 'erase' }" @click="choice = 'erase'">
        <b>Erase the drive and put the hub on it</b><small>Faster, and the stick can come out afterwards.</small></button>
      <button class="ds-opt" role="radio" :aria-checked="choice === 'keep'" :class="{ on: choice === 'keep' }" @click="choice = 'keep'">
        <b>Keep what’s on the drive</b><small>The hub runs from the stick, which has to stay plugged in.</small></button>
    </div>
    <div class="setup-actions"><button class="button big ds-wide" :class="{ busy }" @click="onward">Continue</button></div>
  </template>

  <template v-else-if="page === 'erase' && drive">
    <button class="ds-back" @click="emit('go', 'drive')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7" /></svg>Back</button>
    <h1 class="display">Erase {{ title(drive).split(' · ')[0] }}?</h1>
    <ul class="ds-means">
      <li class="hard"><span>Everything on it is deleted for good: <b>{{ lost(drive) }}</b>. This can’t be undone.</span></li>
      <li><span>It takes about three minutes. The hub restarts on the drive and comes back to this page.</span></li>
      <li><span>Afterwards the stick can come out, and set up another hub.</span></li>
    </ul>
    <label class="field"><span class="field-label">To erase it, type <b>erase</b></span>
      <input class="input" v-model="typed" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" @keydown.enter="erase" /></label>
    <p class="error" v-if="error">{{ error }}</p>
    <div class="setup-actions"><button class="button big ds-wide ds-danger" :disabled="!confirmed(typed) || busy" :class="{ busy }" @click="erase">Erase the drive</button></div>
  </template>

  <template v-else-if="page === 'moving'">
    <span class="setup-mark pulse"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="2" /><path d="M7 12h.01M11 12h6" /></svg></span>
    <h1 class="display">Moving the hub onto the drive…</h1>
    <p class="setup-lede">About three minutes. Leave it plugged in. This page comes back by itself.</p>
    <div class="ds-bar"><i></i></div>
  </template>

  <template v-else-if="page === 'moved'">
    <span class="setup-mark done"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
    <h1 class="display">The hub is on its own drive.</h1>
    <p class="setup-lede">Take the USB stick out whenever you like. It can set up another hub.</p>
    <div class="setup-actions"><button class="button big" @click="moved">Continue</button></div>
  </template>
</template>

<style scoped>
.ds-opts { margin-top: 18px; display: flex; flex-direction: column; gap: 10px; }
.ds-opt { position: relative; text-align: left; padding: 15px 16px 14px 48px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--edge); color: var(--ink); font: inherit; }
.ds-opt::before { content: ''; position: absolute; left: 16px; top: 17px; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--edge-hi); }
.ds-opt.on { border-color: rgba(var(--lamp-rgb), 0.6); background: rgba(var(--lamp-rgb), 0.08); }
.ds-opt.on::before { border-color: var(--lamp); box-shadow: inset 0 0 0 4px var(--bg), inset 0 0 0 10px var(--lamp); }
.ds-opt b { display: block; font-size: 16px; font-weight: 500; }
.ds-opt small { display: block; font-size: 13.5px; color: var(--ink-2); margin-top: 3px; }
.ds-wide { flex: 1; justify-content: center; }
.ds-danger { background: var(--danger); color: #2a0f0f; }
.ds-danger:disabled { opacity: 0.35; }
.ds-back { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; margin: 0 0 14px; padding: 0; background: none; border: 0; color: var(--ink-2); font: inherit; font-size: 15px; }
.ds-means { list-style: none; margin: 14px 0 18px; padding: 0; }
.ds-means li { font-size: 15px; line-height: 1.45; color: var(--ink-2); padding: 9px 0 9px 26px; position: relative; }
.ds-means li + li { border-top: 1px solid var(--edge); }
.ds-means li::before { content: ''; position: absolute; left: 4px; top: 16px; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.ds-means li.hard { color: var(--ink); }
.ds-means li.hard::before { background: var(--danger); }
.ds-bar { height: 6px; border-radius: 999px; background: var(--surface-hi); overflow: hidden; }
.ds-bar i { display: block; width: 30%; height: 100%; border-radius: 999px; background: var(--lamp); animation: ds-slide 1.6s ease-in-out infinite; }
@keyframes ds-slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
@media (prefers-reduced-motion: reduce) { .ds-bar i { animation: none; margin-left: 35%; } }
</style>
