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
import { addCountdown, getBoard, getPhotosPage, leaveMorning, leaveNote, photoUrl, removePhoto, sendPhoto, showOnScreen, takeDown, type BoardNote, type Countdown, type MorningLine, type ShownScreen } from './api'
import { countLine, morningFor, noteLine, prepare, screenLines, sentLine, untilFor, yearly, type Until } from './photos'
import { countWords } from './restTv'
import { photoLine, type Photo } from './restTv'
import { locale } from './lang'
import { notify } from './store'
import Icon from './Icon.vue'

const photos = ref<Photo[]>([])
const screens = ref<ShownScreen[]>([])
const switching = ref('')
const screen = ref<ShownScreen | null>(null)   // the screen whose own page is open (design/tv-moments/ScreenA)
/* Notes and countdowns (design/tv-moments/WriteEvery). One taken down keeps its row, saying so, with Put it back, until
   the page is left: nothing vanishes under the finger that touched it. */
const notes = ref<BoardNote[]>([])
const counts = ref<Countdown[]>([])
const gone = ref<Record<string, BoardNote | Countdown | MorningLine>>({})
const writing = ref<'note' | 'count' | 'morning' | null>(null)
const text = ref(''), until = ref<Until>('tonight'), what = ref(''), day = ref(''), dawn = ref('')
const mornings = ref<MorningLine[]>([])
const saving = ref(false)
async function loadBoard() { try { const b = await getBoard(); notes.value = b.notes; counts.value = b.countdowns; mornings.value = b.mornings ?? [] } catch { /* an older hub */ } }
async function write() {
  if (saving.value) return
  saving.value = true
  try {
    if (writing.value === 'note') { await leaveNote(text.value, untilFor(until.value)); notify('The note is on your screens.'); text.value = '' }
    else if (writing.value === 'count') { await addCountdown(what.value, day.value); notify('The countdown is on your screens.'); what.value = ''; day.value = '' }
    else { await leaveMorning(dawn.value, morningFor()); notify('It will greet the first screen to wake in the morning.'); dawn.value = '' }
    writing.value = null
    await loadBoard()
  } catch (e: any) { notify(e.message, 'error') }
  saving.value = false
}
async function down(item: BoardNote | Countdown | MorningLine) {
  try { await takeDown(item.id); gone.value = { ...gone.value, [item.id]: item } } catch (e: any) { notify(e.message, 'error') }
}
async function putBack(item: BoardNote | Countdown | MorningLine) {
  try {
    if ('day' in item) await leaveMorning(item.text, item.day)
    else if ('text' in item) await leaveNote(item.text, item.until && item.until > Date.now() / 1000 ? item.until : null)
    else await addCountdown(item.what, item.date)
    const { [item.id]: _, ...rest } = gone.value; gone.value = rest
    await loadBoard()
  } catch (e: any) { notify(e.message, 'error') }
}
const shownNotes = computed(() => [...notes.value.filter(n => !gone.value[n.id]), ...Object.values(gone.value).filter((x): x is BoardNote => 'until' in x)])
const shownMornings = computed(() => [...mornings.value.filter(m => !gone.value[m.id]), ...Object.values(gone.value).filter((x): x is MorningLine => 'day' in x)])
const shownCounts = computed(() => [...counts.value.filter(c => !gone.value[c.id]), ...Object.values(gone.value).filter((x): x is Countdown => 'what' in x)])
const loaded = ref(false)
const sending = ref<{ done: number; of: number } | null>(null)
const open = ref<Photo | null>(null)
const removing = ref(false)
const picker = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  try { const p = await getPhotosPage(); photos.value = p.photos; screens.value = p.screens ?? [] } catch (e: any) { notify(e.message, 'error') }
  loadBoard()
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

/* The day's cards each screen may show between its photos (design/tv-moments/ScreenA); jokes and quotes start off. */
const FUN = [
  { key: 'today', name: 'The house today', sub: 'Sunset, frost, the moon', on: true },
  { key: 'facts', name: 'A fact or a trivia question', sub: 'One every few photos', on: true },
  { key: 'jokes', name: 'Jokes', sub: 'Picked to suit kids', on: false },
  { key: 'quotes', name: 'Quotes', sub: 'Short lines from long ago', on: false },
] as const
const funOn = (s: ShownScreen, k: (typeof FUN)[number]['key'], start: boolean) => (s[k] ?? start) === true
async function setScreen(s: ShownScreen, set: { on?: boolean; play?: 'each' | 'days'; shows?: 'photos' | 'board'; notes?: boolean; lines?: boolean; today?: boolean; facts?: boolean; jokes?: boolean; quotes?: boolean }) {
  if (switching.value) return
  switching.value = s.id
  try {
    const now = await showOnScreen(s.id, set)
    screens.value = screens.value.map(x => x.id === s.id ? { ...x, ...now } : x)
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
      <li class="photos-play-row">
        <span class="photos-screen-text"><b>What it shows</b><span>The family board puts the notes and countdowns up instead, with one photo beside them</span></span>
        <span class="photos-play">
          <button class="button small" :class="{ ghost: screen.shows === 'board' }" @click="setScreen(screen, { shows: 'photos' })">Photos</button>
          <button class="button small" :class="{ ghost: screen.shows !== 'board' }" @click="setScreen(screen, { shows: 'board' })">The family board</button>
        </span>
      </li>
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
      <li v-if="screen.shows !== 'board'">
        <span class="photos-screen-text"><b>Notes and countdowns</b><span>Left from your phones, between the photos</span></span>
        <button class="photos-switch" role="switch" :aria-checked="screen.notes !== false" aria-label="Notes and countdowns" :class="{ on: screen.notes !== false, busy: switching === screen.id }" @click="setScreen(screen, { notes: screen.notes === false })"></button>
      </li>
      <template v-if="screen.shows !== 'board'">
        <li v-for="f in FUN" :key="f.key">
          <span class="photos-screen-text"><b>{{ f.name }}</b><span>{{ f.sub }}</span></span>
          <button class="photos-switch" role="switch" :aria-checked="funOn(screen, f.key, f.on)" :aria-label="f.name" :class="{ on: funOn(screen, f.key, f.on), busy: switching === screen.id }" @click="setScreen(screen, { [f.key]: !funOn(screen, f.key, f.on) })"></button>
        </li>
      </template>
      <li>
        <span class="photos-screen-text"><b>A line for the day</b><span>Encouragement in the morning, rest at night</span></span>
        <button class="photos-switch" role="switch" :aria-checked="screen.lines !== false" aria-label="A line for the day" :class="{ on: screen.lines !== false, busy: switching === screen.id }" @click="setScreen(screen, { lines: screen.lines === false })"></button>
      </li>
    </ul>
  </div>
  <div class="page photos-page" v-else-if="writing">
    <button class="linkish photos-back" @click="writing = null"><Icon name="back" :size="16" />Your screens</button>
    <span class="photos-play photos-tabs">
      <button class="button small" :class="{ ghost: writing !== 'note' }" @click="writing = 'note'">A note</button>
      <button class="button small" :class="{ ghost: writing !== 'count' }" @click="writing = 'count'">A countdown</button>
      <button class="button small" :class="{ ghost: writing !== 'morning' }" @click="writing = 'morning'">For the morning</button>
    </span>
    <template v-if="writing === 'note'">
      <h2 class="photos-screen-title">Leave a note</h2>
      <label class="photos-label" for="note-text">What it says</label>
      <textarea id="note-text" v-model="text" class="photos-field" maxlength="120" rows="3" placeholder="Dinner at 7. Love, Mom"></textarea>
      <span class="photos-label">Shown until</span>
      <span class="photos-play">
        <button class="button small" :class="{ ghost: until !== 'tonight' }" @click="until = 'tonight'">Tonight</button>
        <button class="button small" :class="{ ghost: until !== 'tomorrow' }" @click="until = 'tomorrow'">Tomorrow</button>
        <button class="button small" :class="{ ghost: until !== 'down' }" @click="until = 'down'">I take it down</button>
      </span>
      <button class="button photos-add photos-go" :class="{ busy: saving }" :disabled="!text.trim()" @click="write">Put it on the screens</button>
    </template>
    <template v-else-if="writing === 'morning'">
      <h2 class="photos-screen-title">A line for the morning</h2>
      <label class="photos-label" for="morning-text">What it says</label>
      <textarea id="morning-text" v-model="dawn" class="photos-field" maxlength="90" rows="3" placeholder="Proud of you for today."></textarea>
      <p class="photos-foot photos-left">It greets the first screen that wakes in the morning, signed by you, then goes.</p>
      <button class="button photos-add photos-go" :class="{ busy: saving }" :disabled="!dawn.trim()" @click="write">Leave it for the morning</button>
    </template>
    <template v-else>
      <h2 class="photos-screen-title">Count down to</h2>
      <label class="photos-label" for="count-what">What</label>
      <input id="count-what" v-model="what" class="photos-field" maxlength="40" placeholder="Sam’s birthday" />
      <label class="photos-label" for="count-day">When</label>
      <input id="count-day" v-model="day" class="photos-field" type="date" />
      <p class="photos-foot photos-left" v-if="what && yearly(what)">Every year, since it’s {{ /anniversary/i.test(what) ? 'an anniversary' : 'a birthday' }}.</p>
      <button class="button photos-add photos-go" :class="{ busy: saving }" :disabled="!what.trim() || !day" @click="write">Add the countdown</button>
    </template>
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
    <div class="photos-count photos-on-head"><b>Notes and countdowns</b><span>between the photos, or on the family board</span></div>
    <ul class="photos-screens" v-if="shownNotes.length || shownCounts.length || shownMornings.length">
      <li v-for="n in shownNotes" :key="n.id" :class="{ 'photos-gone': !!gone[n.id] }">
        <span class="photos-screen-text"><b>{{ n.text }}</b><span>{{ gone[n.id] ? 'Taken down' : noteLine(n.until, n.by) }}</span></span>
        <button class="button small ghost" @click="gone[n.id] ? putBack(n) : down(n)">{{ gone[n.id] ? 'Put it back' : 'Take down' }}</button>
      </li>
      <li v-for="m in shownMornings" :key="m.id" :class="{ 'photos-gone': !!gone[m.id] }">
        <span class="photos-screen-text"><b>{{ m.text }}</b><span>{{ gone[m.id] ? 'Taken down' : `For the morning${m.by ? ` · from ${m.by}` : ''}` }}</span></span>
        <button class="button small ghost" @click="gone[m.id] ? putBack(m) : down(m)">{{ gone[m.id] ? 'Put it back' : 'Take down' }}</button>
      </li>
      <li v-for="c in shownCounts" :key="c.id" :class="{ 'photos-gone': !!gone[c.id] }">
        <span class="photos-screen-text"><b>{{ c.what }}</b><span>{{ gone[c.id] ? 'Removed' : (countWords(c, new Date()).big === 'Today' ? 'Today' : `In ${countWords(c, new Date()).big} ${countWords(c, new Date()).big === '1' ? 'day' : 'days'}`) + (c.yearly && !gone[c.id] ? ' · every year' : '') }}</span></span>
        <button class="button small ghost" @click="gone[c.id] ? putBack(c) : down(c)">{{ gone[c.id] ? 'Put it back' : 'Remove' }}</button>
      </li>
    </ul>
    <span class="photos-play photos-write">
      <button class="button small" @click="writing = 'note'"><Icon name="edit" :size="16" />Leave a note</button>
      <button class="button small" @click="writing = 'count'"><Icon name="clock" :size="16" />Add a countdown</button>
    </span>
    <button class="linkish photos-morning-link" @click="writing = 'morning'"><Icon name="moon" :size="16" />Leave a line for the morning</button>
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
