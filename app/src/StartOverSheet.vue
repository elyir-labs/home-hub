<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* Start over, from This hub (design/leaving/, B): what is erased, said before anything is, and a hold rather than a
   tap, as the drive move asks (DriveSheet.vue). The hub does the erasing (host/reset.sh) and comes back on Welcome,
   so once it has said yes this sheet only waits for a hub that answers as new, and opens on it. */
import { onUnmounted, ref } from 'vue'
import { downloadBackup, getStatus, startOver } from './api'
import { notify } from './store'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
const emit = defineEmits<{ close: [] }>()
const going = ref(false), error = ref('')
let poll = 0
async function go() {
  if (going.value) return
  going.value = true; error.value = ''
  try { await startOver() }
  catch (e: any) { going.value = false; if (!e?.canceled) error.value = e.message; return }
  poll = window.setInterval(async () => {
    try { if ((await getStatus()).setup_done === false) { clearInterval(poll); location.replace('/') } } catch {}
  }, 3000)
}
const backingUp = ref(false)
async function backUp() {
  if (backingUp.value) return
  backingUp.value = true
  try { await downloadBackup(); notify('Your backup is on its way. Keep it somewhere safe; it holds the house’s passwords and sign-ins.') }
  catch (e: any) { if (!e?.canceled) notify(e.message, 'error') }
  backingUp.value = false
}
onUnmounted(() => clearInterval(poll))
</script>

<template>
  <div class="sheet-back" @click.self="going || emit('close')">
    <div class="sheet" role="dialog" aria-label="Start over">
      <template v-if="!going">
        <div class="sheet-head">
          <h2 class="display">Start over</h2>
          <button class="round sheet-close" @click="emit('close')" aria-label="Close"><Icon name="close" :size="20" /></button>
        </div>
        <div class="sheet-body">
          <p class="sheet-lede">For giving the hub away, or for the next people to set up as their own.</p>
          <ul class="sov-means">
            <li class="hard"><b>Erased:</b> everything. Rooms, routines, phones, the passcode, the services the house signed into, what happened here and camera recordings.</li>
            <li class="hard">Lights that joined through the hub itself have to be reset, one by one, before they can join again. Ones on your Wi‑Fi are found again.</li>
            <li class="hard">The Wi‑Fi password goes too. On a cable the hub stays online; on Wi‑Fi it comes back on a Wi‑Fi of its own, which the code on its label joins.</li>
            <li>If the house has a web address, its name is given up and its payments stop.</li>
            <li>Switches on the wall keep working. The hub restarts and opens on Welcome, in about four minutes.</li>
          </ul>
          <p class="error" v-if="error">{{ error }}</p>
          <HoldButton label="Hold to erase the hub" :busy="going" @done="go" />
          <p class="sov-foot">Needs the passcode</p>
          <p class="sov-foot">Might you want this house back? <button class="sov-link" :class="{ busy: backingUp }" @click="backUp">Back up first</button></p>
        </div>
      </template>
      <div class="sheet-body sov-going" v-else>
        <h2 class="display">The hub is starting over.</h2>
        <p class="sheet-lede">About four minutes. Switches on the wall keep working, and this screen opens on Welcome by itself. A hub on Wi‑Fi is out of reach of phones until it is set up again.</p>
        <div class="sov-bar"><i></i></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sov-means { list-style: none; margin: 12px 0 14px; padding: 0; }
.sov-means li { font-size: 15px; line-height: 1.45; color: var(--ink-2); padding: 9px 0 9px 22px; position: relative; }
.sov-means li + li { border-top: 1px solid var(--edge); }
.sov-means li::before { content: ''; position: absolute; left: 2px; top: 16px; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.sov-means li.hard { color: var(--ink); }
.sov-means li.hard::before { background: var(--danger); }
.sov-foot { text-align: center; margin: 10px 0 0; font-size: 13.5px; color: var(--muted); }
.sov-link { background: none; border: 0; padding: 0; font: inherit; font-weight: 500; color: var(--lamp-text); cursor: pointer; }
.sov-going { padding-top: 8px; }
.sov-bar { height: 6px; border-radius: 999px; background: var(--surface-hi); overflow: hidden; margin-top: 18px; }
.sov-bar i { display: block; width: 30%; height: 100%; border-radius: 999px; background: var(--lamp); animation: sov-slide 1.6s ease-in-out infinite; }
@keyframes sov-slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
@media (prefers-reduced-motion: reduce) { .sov-bar i { animation: none; margin-left: 35%; } }
</style>
