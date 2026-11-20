<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/*
 * Photos (design/tv-photos/PageA, decided 20 November 2026 with C; design/which-tv/, C's screens). Add photos opens
 * the phone's own picker; each one is redrawn here and sent in turn, the grid filling as they land. Anyone in the
 * house can take any photo off, from the sheet a tap opens, which says when it was taken and whose phone it came from.
 * Above the grid, every screen the house has and a switch for whether it shows them at rest: a TV starts on.
 */
import { computed, onMounted, ref } from 'vue'
import { getPhotosPage, photoUrl, removePhoto, sendPhoto, showOnScreen, type ShownScreen } from './api'
import { countLine, prepare, screenLines, sentLine } from './photos'
import { photoLine, type Photo } from './restTv'
import { locale } from './lang'
import { notify } from './store'
import Icon from './Icon.vue'

const photos = ref<Photo[]>([])
const screens = ref<ShownScreen[]>([])
const switching = ref('')
const screen = ref<ShownScreen | null>(null)   // the screen whose own page is open (design/tv-moments/ScreenA)
const loaded = ref(false)
const sending = ref<{ done: number; of: number } | null>(null)
const open = ref<Photo | null>(null)
const removing = ref(false)
const picker = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  try { const p = await getPhotosPage(); photos.value = p.photos; screens.value = p.screens ?? [] } catch (e: any) { notify(e.message, 'error') }
  loaded.value = true
})

const counted = computed(() => countLine(photos.value))

async function picked(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length || sending.value) return
  sending.value = { done: 0, of: files.length }
  let failed = 0
  for (const f of files) {
    try { photos.value = [await sendPhoto(await prepare(f)), ...photos.value] }
    catch (e: any) { failed++; if (failed === 1) notify(e.message, 'error') }
    sending.value = { done: sending.value.done + 1, of: files.length }
  }
  sending.value = null
  if (!failed) notify(files.length === 1 ? 'The photo is on the TV.' : `${files.length} photos are on the TV.`)
}

async function setScreen(s: ShownScreen, set: { on?: boolean; play?: 'each' | 'days' }) {
  if (switching.value) return
  switching.value = s.id
  try {
    const now = await showOnScreen(s.id, set)
    screens.value = screens.value.map(x => x.id === s.id ? { ...x, photos: now.photos, play: now.play } : x)
    if (screen.value?.id === s.id) screen.value = screens.value.find(x => x.id === s.id) ?? null
  } catch (e: any) { notify(e.message, 'error') }
  switching.value = ''
}

async function takeOff(p: Photo) {
  if (removing.value) return
  removing.value = true
  try { await removePhoto(p.id); photos.value = photos.value.filter(x => x.id !== p.id); open.value = null }
  catch (e: any) { notify(e.message, 'error') }
  removing.value = false
}
</script>

<template>
  <div class="page photos-page" v-if="screen">
    <button class="linkish photos-back" @click="screen = null"><Icon name="back" :size="16" />Your screens</button>
    <h2 class="photos-screen-title">{{ screenLines(screen).name }}</h2>
    <p class="page-lede">What it shows when nobody is watching.</p>
    <ul class="photos-screens">
      <li>
        <span class="photos-screen-text"><b>Photos</b><span>{{ counted.count }}, {{ counted.from }}</span></span>
        <button class="photos-switch" role="switch" :aria-checked="screen.photos" aria-label="Photos" :class="{ on: screen.photos, busy: switching === screen.id }" @click="setScreen(screen, { on: !screen.photos })"></button>
      </li>
      <li class="photos-play-row" v-if="screen.photos">
        <span class="photos-screen-text"><b>How the photos play</b><span>Day by day groups a day’s photos, and starts with one from this day in an earlier year</span></span>
        <span class="photos-play">
          <button class="button small" :class="{ ghost: screen.play !== 'each' }" @click="setScreen(screen, { play: 'each' })">One after another</button>
          <button class="button small" :class="{ ghost: (screen.play ?? 'days') !== 'days' }" @click="setScreen(screen, { play: 'days' })">Day by day</button>
        </span>
      </li>
    </ul>
  </div>
  <div class="page photos-page" v-else>
    <p class="page-lede">The screens you choose show these when nobody is watching them. They stay on the hub, in this house, and nowhere else.</p>
    <input ref="picker" class="photos-input" type="file" accept="image/*" multiple @change="picked" />
    <button class="button photos-add" :class="{ ghost: !!sending }" :disabled="!!sending" @click="picker?.click()">
      <template v-if="sending">Sending {{ sending.done + 1 }} of {{ sending.of }}…</template>
      <template v-else><Icon name="plus" :size="18" />Add photos</template>
    </button>
    <template v-if="screens.length">
      <div class="photos-count photos-on-head"><b>Your screens</b><span>what each shows at rest</span></div>
      <ul class="photos-screens">
        <li v-for="s in screens" :key="s.id">
          <button class="photos-screen-open" @click="screen = s">
            <Icon :name="s.tv ? 'tv' : 'phone'" :size="20" />
            <span class="photos-screen-text"><b>{{ screenLines(s).name }}</b><span>{{ screenLines(s).sub }}</span></span>
            <Icon name="chevron" :size="16" />
          </button>
        </li>
      </ul>
    </template>
    <template v-if="photos.length">
      <div class="photos-count"><b>{{ counted.count }}</b><span>{{ counted.from }}</span></div>
      <div class="photos-grid">
        <button v-for="p in photos" :key="p.id" class="photos-cell" :aria-label="photoLine(p, locale())" @click="open = p">
          <img :src="photoUrl(p.id)" alt="" loading="lazy" />
        </button>
      </div>
    </template>
    <p class="empty" v-else-if="loaded">No photos yet. Until there are some, the TV shows the sky.</p>

    <div class="photos-scrim" v-if="open" @click="open = null"></div>
    <div class="photos-sheet" v-if="open" role="dialog" :aria-label="photoLine(open, locale())">
      <div class="photos-sheet-head">
        <img :src="photoUrl(open.id)" alt="" />
        <div><b>{{ photoLine({ ...open, by: null }, locale()) }}</b><span>{{ sentLine(open, new Date(), locale()) }}</span></div>
      </div>
      <button class="button ghost warn photos-off" :class="{ busy: removing }" @click="takeOff(open)">Take off the TV</button>
      <p class="photos-foot">It is removed from the hub. The phone it came from keeps its own copy.</p>
    </div>
  </div>
</template>
