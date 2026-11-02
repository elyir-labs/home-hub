<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* Moving out, from People (design/leaving/, B): the house to the next people. What goes is named from this house --
   its phones, its people, the services it signed into -- before anything goes, then a hold. The hub does the rest
   (hub/handover.py, host/reset.sh) and opens on a first run for the next people, which this sheet waits for. */
import { computed, onUnmounted, ref } from 'vue'
import { getHandover, getStatus, handOver, type HandoverAsk } from './api'
import HoldButton from './HoldButton.vue'
import Icon from './Icon.vue'
const emit = defineEmits<{ close: [] }>()
const ask = ref<HandoverAsk | null>(null), going = ref(false), error = ref('')
let poll = 0
getHandover().then(a => (ask.value = a)).catch(() => {})

const list = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
const count = (n: number, one: string, many: string) => n === 1 ? `1 ${one}` : `${n} ${many}`
const erased = computed(() => {
  const a = ask.value
  const parts = [a ? `the ${count(a.phones, 'phone', 'phones')} that can use the house` : 'the phones that can use the house', 'the passcode']
  if (a?.people.length) parts.push(list(a.people))
  parts.push(a?.accounts.length ? `the services the house signed into (${list(a.accounts)})` : 'the services the house signed into')
  parts.push('what happened here')
  return list(parts)
})
const stays = computed(() => {
  const a = ask.value
  return a ? `${count(a.rooms, 'room', 'rooms')}, the lights and switches in them, ${count(a.routines, 'routine', 'routines')}, and the screens on the wall`
           : 'the rooms, the lights and switches in them, the routines, and the screens on the wall'
})

async function go() {
  if (going.value) return
  going.value = true; error.value = ''
  try { await handOver() }
  catch (e: any) { going.value = false; if (!e?.canceled) error.value = e.message; return }
  poll = window.setInterval(async () => {
    try { if ((await getStatus()).handed_over) { clearInterval(poll); location.replace('/') } } catch {}
  }, 3000)
}
onUnmounted(() => clearInterval(poll))
</script>

<template>
  <div class="sheet-back" @click.self="going || emit('close')">
    <div class="sheet" role="dialog" aria-label="Hand the house over">
      <template v-if="!going">
        <div class="sheet-head">
          <h2 class="display">Hand the house over</h2>
          <button class="round sheet-close" @click="emit('close')" aria-label="Close"><Icon name="close" :size="20" /></button>
        </div>
        <div class="sheet-body">
          <p class="sheet-lede">For the next people who live here. The house keeps working the whole time.</p>
          <ul class="hov-means">
            <li class="hard"><b>Erased:</b> {{ erased }}.</li>
            <li class="hard">The Wi‑Fi password goes too. On a cable the hub stays online; on Wi‑Fi it comes back on a Wi‑Fi of its own, which the code on its label joins.</li>
            <li class="keep"><b>Stays:</b> {{ stays }}. Things a service brought go back to their rooms when the next people sign in to it.</li>
            <li>If the house has a web address, its name is given up and its payments stop.</li>
            <li>Then this screen asks the new people who they are and for a passcode of their own.</li>
          </ul>
          <p class="error" v-if="error">{{ error }}</p>
          <HoldButton label="Hold to hand the house over" :busy="going" @done="go" />
          <p class="hov-foot">Needs the passcode</p>
        </div>
      </template>
      <div class="sheet-body hov-going" v-else>
        <h2 class="display">The house is being handed over.</h2>
        <p class="sheet-lede">A few minutes. Switches on the wall keep working, and this screen opens for the next people by itself.</p>
        <div class="hov-bar"><i></i></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hov-means { list-style: none; margin: 12px 0 14px; padding: 0; }
.hov-means li { font-size: 15px; line-height: 1.45; color: var(--ink-2); padding: 9px 0 9px 22px; position: relative; }
.hov-means li + li { border-top: 1px solid var(--edge); }
.hov-means li::before { content: ''; position: absolute; left: 2px; top: 16px; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.hov-means li.hard { color: var(--ink); }
.hov-means li.hard::before { background: var(--danger); }
.hov-means li.keep::before { background: var(--live); }
.hov-foot { text-align: center; margin: 10px 0 0; font-size: 13.5px; color: var(--muted); }
.hov-going { padding-top: 8px; }
.hov-bar { height: 6px; border-radius: 999px; background: var(--surface-hi); overflow: hidden; margin-top: 18px; }
.hov-bar i { display: block; width: 30%; height: 100%; border-radius: 999px; background: var(--lamp); animation: hov-slide 1.6s ease-in-out infinite; }
@keyframes hov-slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
@media (prefers-reduced-motion: reduce) { .hov-bar i { animation: none; margin-left: 35%; } }
</style>
