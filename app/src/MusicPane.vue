<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/*
 * Choosing music for a room (design/music/RoomA, the second moment; PhoneA).
 *
 * One pane over the room: what to play on the left, which rooms on the right, with the room it was opened from
 * already ticked. A tap on something plays it in the ticked rooms, in step, and the pane goes -- the speaker's card
 * is where the person looks next, and it says what is playing and where. On a phone the same pane comes up from the
 * foot and the rooms are a row of chips under what to play.
 *
 * Nothing here knows what kind of speaker a room has, or what the engine underneath is called.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { findMusic, getMusic, playMusic, type MusicCatalog } from './api'
import { loadMusic, notify, store } from './store'
import { paneRooms, sections, type MusicItem } from './music'
import Icon from './Icon.vue'

const here = computed(() => store.musicPane)
const room = computed(() => store.rooms.find(r => r.id === here.value))
const catalog = ref<MusicCatalog | null>(null)
const rows = computed(() => paneRooms(store.rooms, here.value))
const ticked = ref(new Set<string>(here.value ? [here.value] : []))
const everywhere = ref(false)
const q = ref('')
const found = ref<MusicItem[] | null>(null)
const busy = ref('')
const shelves = computed(() => catalog.value ? sections(catalog.value) : [])

onMounted(async () => {
  try { catalog.value = await getMusic(here.value) } catch (e) { notify((e as Error).message, 'error') }
})
const close = () => { store.musicPane = null }
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

let timer: number | undefined
watch(q, v => {
  clearTimeout(timer)
  if (v.trim().length < 2) { found.value = null; return }
  timer = window.setTimeout(async () => {
    try { found.value = await findMusic(v) } catch (e) { found.value = []; notify((e as Error).message, 'error') }
  }, 300)
})

function tick(id: string, all = false) {
  if (all) { everywhere.value = !everywhere.value; return }
  everywhere.value = false
  const next = new Set(ticked.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  ticked.value = next
}
const isOn = (r: { id: string; everywhere?: true }) => r.everywhere ? everywhere.value : !everywhere.value && ticked.value.has(r.id)
/* the room it was opened from leads, then the others in the order they are listed */
const chosen = computed(() => rows.value.filter(r => !r.everywhere && ticked.value.has(r.id)).map(r => r.id))

async function play(item: MusicItem) {
  if (!everywhere.value && !chosen.value.length) { notify('Choose a room to play it in.'); return }
  busy.value = item.uri
  try {
    await playMusic(item, chosen.value, everywhere.value)
    loadMusic()
    close()
  } catch (e) { notify((e as Error).message, 'error') } finally { busy.value = '' }
}
const where = computed(() => room.value ? (/'s\b|’s\b/.test(room.value.name) ? room.value.name : room.value.name.toLowerCase()) : 'the house')
const KIND: Record<MusicItem['kind'], string> = { radio: 'Station', playlist: 'Playlist', album: 'Album', track: 'Song', artist: 'Artist' }
const line = (i: MusicItem) => i.by ?? KIND[i.kind]
</script>

<template>
  <div class="music-pane-wrap" role="dialog" aria-modal="true" :aria-label="`Play in the ${where}`">
    <div class="music-pane-veil" @click="close"></div>
    <section class="music-pane">
      <header class="music-pane-head">
        <h2>Play in the {{ where }}</h2>
        <button class="music-pane-close" @click="close" aria-label="Close"><Icon name="close" :size="20" /></button>
      </header>
      <div class="music-pane-what">
        <label class="music-pane-search">
          <Icon name="search" :size="18" />
          <input v-model="q" type="search" enterkeyhint="search" placeholder="Find a song, an artist or a station" aria-label="Find music" autocomplete="off" spellcheck="false" />
        </label>
        <p class="music-pane-quiet" v-if="catalog && !catalog.ready">Music is still starting on this hub. It takes a minute the first time.</p>
        <template v-if="found">
          <h3 class="music-pane-shelf">Found</h3>
          <p class="music-pane-quiet" v-if="!found.length">Nothing by that name.</p>
          <div class="music-pane-list">
            <button v-for="i in found" :key="i.uri" class="music-pane-row" :disabled="!!busy" @click="play(i)">
              <span class="music-pane-cover small" :style="i.art ? { backgroundImage: `url(${i.art})` } : {}"></span>
              <span class="music-pane-words"><b>{{ i.name }}</b><small>{{ line(i) }}</small></span>
            </button>
          </div>
        </template>
        <template v-else>
          <div v-for="s in shelves" :key="s.key" class="music-pane-section" :data-shelf="s.key">
            <h3 class="music-pane-shelf">{{ s.title }}</h3>
            <div v-if="s.key === 'again'" class="music-pane-covers">
              <button v-for="i in s.items.slice(0, 4)" :key="i.uri" class="music-pane-cover-btn" :disabled="!!busy" @click="play(i)">
                <span class="music-pane-cover" :style="i.art ? { backgroundImage: `url(${i.art})` } : {}"><Icon v-if="!i.art" :name="i.kind === 'radio' ? 'music' : 'play'" :size="26" /></span>
                <span class="music-pane-words"><b>{{ i.name }}</b><small>{{ line(i) }}</small></span>
              </button>
            </div>
            <div v-else class="music-pane-chips">
              <button v-for="i in s.items" :key="i.uri" class="clim-chip" :disabled="!!busy" @click="play(i)">{{ i.name }}</button>
            </div>
          </div>
          <p class="music-pane-quiet" v-if="catalog?.ready && !shelves.length">Find a station by its name, or by what it plays: jazz, news, classical.</p>
        </template>
      </div>
      <aside class="music-pane-where">
        <h3 class="music-pane-shelf">Play it in</h3>
        <div class="music-pane-rooms">
          <button v-for="r in rows" :key="r.id" class="music-pane-room" :class="{ on: isOn(r) }" :aria-pressed="isOn(r)" @click="tick(r.id, !!r.everywhere)">
            <Icon :name="r.everywhere ? 'home' : 'music'" :size="18" />
            <span class="music-pane-words"><b>{{ r.name }}</b><small>{{ r.note }}</small></span>
            <span class="music-pane-tick" aria-hidden="true"><Icon v-if="isOn(r)" name="check" :size="14" /></span>
          </button>
        </div>
        <p class="music-pane-note">Radio and your own music play from the hub. Spotify plays on the speakers that have it built in.</p>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.music-pane-wrap {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
}
.music-pane-veil {
  position: absolute;
  inset: 0;
  background: rgba(8, 9, 12, 0.62);
  backdrop-filter: blur(6px);
}
.music-pane {
  position: relative;
  width: min(1200px, calc(100vw - 80px));
  height: min(692px, calc(100vh - 120px));
  display: grid;
  grid-template-columns: minmax(0, 1fr) 328px;
  grid-template-rows: auto minmax(0, 1fr);
  column-gap: 40px;
  padding: 30px 36px;
  border-radius: var(--r-lg);
  border: 1px solid var(--edge-hi);
  background: rgba(var(--surface-rgb), 0.96);
  box-shadow: 0 40px 90px -30px rgba(0, 0, 0, 0.7);
}
.music-pane-head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.music-pane-head h2 {
  margin: 0;
  font-size: 30px;
  font-weight: 400;
  letter-spacing: -0.02em;
}
.music-pane-close {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface-hi);
  color: var(--ink);
  border: 0;
}
.music-pane-what {
  min-height: 0;
  overflow-y: auto;
}
.music-pane-search {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid var(--edge);
  background: var(--surface-hi);
  color: var(--muted);
}
.music-pane-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: 16px;
  outline: none;
}
.music-pane-shelf {
  margin: 24px 0 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.music-pane-covers {
  display: flex;
  gap: 20px;
}
.music-pane-cover-btn {
  width: 150px;
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  text-align: left;
}
.music-pane-cover {
  width: 150px;
  height: 150px;
  border-radius: var(--r-md);
  background: var(--surface-hi) center / cover;
  display: grid;
  place-items: center;
  color: var(--muted);
  flex: none;
}
.music-pane-cover.small {
  width: 44px;
  height: 44px;
  border-radius: 10px;
}
.music-pane-words {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.music-pane-words b {
  font-weight: 500;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.music-pane-words small {
  font-size: 13px;
  color: var(--ink-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.music-pane-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.music-pane-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.music-pane-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px;
  border-radius: var(--r-sm);
  border: 0;
  background: none;
  color: var(--ink);
  text-align: left;
}
.music-pane-quiet {
  margin: 18px 0 0;
  color: var(--ink-2);
  font-size: 15px;
}
.music-pane-where {
  position: relative;
  min-height: 0;
  border-left: 1px solid var(--edge);
  padding-left: 28px;
  display: flex;
  flex-direction: column;
}
.music-pane-where .music-pane-shelf {
  margin-top: 0;
}
.music-pane-rooms {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  min-height: 0;
}
.music-pane-room {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 10px 14px;
  border-radius: var(--r-sm);
  border: 1px solid var(--edge);
  background: var(--surface-hi);
  color: var(--ink);
  text-align: left;
}
.music-pane-room.on {
  border-color: rgba(var(--lamp-rgb), 0.5);
  background: rgba(var(--lamp-rgb), 0.12);
}
.music-pane-room .music-pane-words {
  flex: 1;
}
.music-pane-tick {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--edge-hi);
  display: grid;
  place-items: center;
  flex: none;
}
.music-pane-room.on .music-pane-tick {
  background: var(--lamp);
  border-color: var(--lamp);
  color: var(--lamp-ink);
}
.music-pane-note {
  margin: auto 0 0;
  padding-top: 16px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ink-2);
}

/* PhoneA: the same pane, from the foot, the rooms a row of chips under what to play */
@media (max-width: 640px) {
  .music-pane-wrap {
    place-items: end stretch;
  }
  .music-pane {
    width: 100%;
    height: min(640px, calc(100vh - 120px));
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    padding: 26px 20px 20px;
    border-radius: 28px 28px 0 0;
  }
  .music-pane-head h2 {
    font-size: 24px;
  }
  .music-pane-head {
    margin-bottom: 14px;
  }
  .music-pane-search {
    height: 44px;
  }
  .music-pane-shelf {
    margin: 18px 0 10px;
  }
  .music-pane-covers {
    gap: 14px;
    overflow-x: auto;
  }
  .music-pane-cover-btn {
    width: 96px;
  }
  .music-pane-cover {
    width: 96px;
    height: 96px;
  }
  .music-pane-where {
    border-left: 0;
    border-top: 1px solid var(--edge);
    padding: 14px 0 0;
    margin-top: 12px;
  }
  .music-pane-rooms {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
  }
  .music-pane-room {
    min-height: 36px;
    padding: 0 14px;
    border-radius: 999px;
  }
  .music-pane-room small,
  .music-pane-room .music-pane-tick,
  .music-pane-room > svg {
    display: none;
  }
  .music-pane-note {
    display: none;
  }
}
</style>
