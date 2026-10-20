<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/*
 * Which screen the app is on. /add: adding a house (AppSafari, AppFirst, AppName). No houses yet: the two doors,
 * adding one or trying a pretend one (design/pretend-in-app/, B). Otherwise a
 * house -- the one whose Wi-Fi this phone is on, else the one opened last (design/houses/, B) -- with Houses
 * over it when somebody taps the house's name. A notification tapped opens the house that sent it (public/sw.js):
 * as /?open=<label> when the app was closed, as a message from the worker when it was open. The store app opens one
 * its widget was tapped on the same way, /?shell=ios&store=US&open=<label>; only `open` comes off the address.
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { houseToOpen, load, reach, state, type House } from './houses'
import { askedFor } from './push'
import AddView from './AddView.vue'
import DoorsView from './DoorsView.vue'
import PretendView from './PretendView.vue'
import HouseView from './HouseView.vue'

const view = ref<'loading' | 'doors' | 'pretend' | 'add' | 'house'>('loading')
const current = ref<string | null>(null)
const bases = ref<Record<string, string>>({})

async function reachAll() {
  await Promise.all(state.houses.map(async (h: House) => {
    const got = await reach(h)
    h.reach = got.reach; bases.value[h.id] = got.base
  }))
}

function fromWorker(ev: MessageEvent) {
  if (ev.data?.type !== 'houses:open-house') return
  const id = askedFor(ev.data.label, state.houses)
  if (id) open(id)
}
onUnmounted(() => navigator.serviceWorker?.removeEventListener('message', fromWorker))

onMounted(async () => {
  navigator.serviceWorker?.addEventListener('message', fromWorker)
  await load()
  if (location.pathname.startsWith('/add')) { view.value = 'add'; return }
  if (!state.houses.length) { view.value = 'doors'; return }
  const q = new URLSearchParams(location.search)
  const asked = askedFor(q.get('open'), state.houses)
  if (q.has('open')) { q.delete('open'); history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '')) }
  if (asked) { reachAll(); open(asked); return }
  // A house answering at home opens at once; otherwise the one opened last, once everybody has been asked.
  const all = reachAll()
  await Promise.race([all, new Promise(r => setTimeout(r, 1700))])
  current.value = houseToOpen(state.houses)
  view.value = 'house'
  all.then(() => { if (!current.value) current.value = houseToOpen(state.houses) })
})

function open(id: string) {
  current.value = id
  view.value = 'house'
  if (location.pathname !== '/') history.replaceState(null, '', '/')
}
function adding() { view.value = 'add'; history.pushState(null, '', '/add') }
function backToDoors() { view.value = 'doors'; history.replaceState(null, '', '/') }
</script>

<template>
  <DoorsView v-if="view === 'doors'" @add="adding" @pretend="view = 'pretend'" />
  <PretendView v-else-if="view === 'pretend'" @leave="view = 'doors'" />
  <AddView v-else-if="view === 'add'" :back="!state.houses.length" @added="open" @cancel="state.houses.length ? open(houseToOpen(state.houses)!) : backToDoors()" />
  <HouseView v-else-if="view === 'house' && current" :key="current" :id="current" :base="bases[current] ?? ''" @switch="open" @add="adding" @reached="(id, b) => (bases[id] = b)" />
</template>
