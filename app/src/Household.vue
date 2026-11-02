<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/*
 * The bar along the bottom, under the Top navigation.
 *
 * On a phone it is the command box on the left and the household on the right. On every bigger screen it is the
 * dock (design/every-screen/, B, chosen 1 November 2026): one thing along the foot, in the same order everywhere --
 * the command box as its orb, the three places, what is playing, then Add and This house as round doors of their
 * own. The foot is where a hand already is on a wall hung at eye height, and one dock is one thing to learn on
 * every screen in the house. The tabs are still three and Add is still a door, not a tab (design/knock/).
 *
 * While somebody is in the command box it has the dock to itself: the box opens across it and the rest steps
 * aside until they leave it, so what is being typed is never squeezed between the tabs.
 *
 * room: the room the panel is showing, so "lights off" said here means that room, the same as the box inside a
 * room would.
 */
import { computed } from 'vue'
import { cap, store, updateReady } from './store'
import { waitingToAdd } from './adding'
import { isPage } from './pages'
import { homeTab } from './layout'
import Icon from './Icon.vue'
import Say from './Say.vue'
import People from './People.vue'

type Tab = 'home' | 'rooms' | 'cameras'
const props = defineProps<{ room?: string | null; docked?: boolean; tab?: Tab; inRoom?: boolean; now?: Date }>()
const emit = defineEmits<{ go: [tab: Tab] }>()

const places = computed(() => [
  { id: 'home' as const, label: homeTab((props.now ?? new Date()).getHours()), icon: 'home' },
  { id: 'rooms' as const, label: 'Rooms', icon: 'rooms' },
  { id: 'cameras' as const, label: 'Cameras', icon: 'camera' },
])
const here = (t: Tab) => props.tab === t && !(props.inRoom && t === 'home')

/* What is playing, so music and the TV have a place on every screen without a tab of their own. The first
   thing playing, named by what it plays and where; a tap opens it. */
const playing = computed(() => {
  for (const r of store.rooms) {
    const d = r.devices.find(d => cap(d) === 'media' && d.state === 'playing')
    if (d) return { device: d, title: d.attrs.media_title || d.name, where: r.name }
  }
  return null
})
const waiting = computed(waitingToAdd)
/* This house stands above the dock rather than over it (design/every-screen/, This house B): its door stays lit
   while it is open and shuts it again, and a place goes there and shuts it. Add opens as one of its pages, so it
   is Add's door that is lit then. */
const housing = computed(() => isPage(store.sheet) && store.sheet !== 'add')
function place(t: Tab) { if (isPage(store.sheet)) store.sheet = null; store.opened = null; emit('go', t) }
</script>

<template>
  <footer class="bottombar" :class="{ dock: docked }">
    <template v-if="docked">
      <nav class="dock-body" aria-label="Around the house">
        <Say :room="room" />
        <div class="dock-places">
          <button v-for="t in places" :key="t.id" class="dock-place" :class="{ active: here(t.id) }" :aria-current="here(t.id) ? 'page' : undefined" @click="place(t.id)">
            <Icon :name="t.icon" :size="18" /><span>{{ t.label }}</span>
          </button>
        </div>
        <button v-if="playing" class="dock-now" @click="store.opened = playing.device" :aria-label="`${playing.title}, ${playing.where}`">
          <span class="dock-now-art"><Icon name="media" :size="16" /></span>
          <span class="dock-now-text"><b>{{ playing.title }}</b><small>{{ playing.where }}</small></span>
        </button>
        <button class="dock-door dock-add" :class="{ attention: waiting, active: store.sheet === 'add' }" @click="store.sheet = store.sheet === 'add' ? null : 'add'" :aria-label="waiting ? `Add to the house, ${waiting} waiting` : 'Add to the house'">
          <Icon name="plus" :size="20" />
        </button>
        <button class="dock-door dock-house" :class="{ attention: updateReady(), active: housing }" @click="store.sheet = housing ? null : 'house'" :aria-label="updateReady() ? 'This house, an update is ready' : 'This house'">
          <Icon name="menu" :size="20" />
        </button>
      </nav>
    </template>
    <template v-else>
      <Say :room="room" />
      <People />
    </template>
  </footer>
</template>
