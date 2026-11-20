<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* A TV at rest (design/rest-tv/): the household's photos, the sky when there are none, the music while it
   plays, and Bedtime late in the evening. Drawn 1920 wide, as the boards are, as tall as the screen's own shape,
   and scaled to it; restTv.ts decides which face and where everything sits this minute. A wall screen with its
   photos switched on rests on the photo face alone, with nothing about a remote (design/which-tv/, Wall A). */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Room } from './api'
import { imageUrl, photoUrl, qrUrl } from './api'
import { photosPageUrl } from './photos'
import { clockParts, restingFacts, restWeather } from './resting'
import { countWords, drift, faceFor, loadRestPhotos, noteFrom, withCards, bedtimeLine, mmss, nightOf, photoLine, playingNow, playingRooms, position, rest, shapeOf,
  SLEEP_AFTER, BEAT_FOR, beats, beatAt, dayTitle, agoLine, stillOn, type Photo, type Shape } from './restTv'
import { locale } from './lang'
import Icon from './Icon.vue'

const props = defineProps<{ now: Date; room: Room | null; since: number; wall?: boolean }>()

const scale = ref(1)
const tall = ref(1080)
const fit = () => { scale.value = innerWidth / 1920; tall.value = Math.round(1920 * innerHeight / innerWidth) }

const photos = computed(() => rest.photos)
const learned = ref<Record<string, Shape>>({})
const qrOk = ref(true)

const tick = ref(Date.now())
let timer: number | undefined, reload: number | undefined
onMounted(() => {
  fit(); addEventListener('resize', fit)
  timer = window.setInterval(() => (tick.value = Date.now()), 1000)
  reload = window.setInterval(loadRestPhotos, 10 * 60 * 1000)
})
onUnmounted(() => { removeEventListener('resize', fit); clearInterval(timer); clearInterval(reload) })

const music = computed(() => playingNow())
const left = computed(() => stillOn())
const listed = computed(() => (left.value.length > 6 ? left.value.slice(0, 5) : left.value))
const board = computed(() => rest.view === 'board')
const face = computed(() => props.wall ? (board.value ? 'board' : 'photos') : faceFor({ playing: !!music.value, stillOn: left.value.length,
  photos: rest.shows ? photos.value.length : 0, now: props.now, notYet: rest.notYet === nightOf(props.now), board: board.value }))
watch(face, f => { if (!props.wall) rest.face = f }, { immediate: true })

const timeline = computed(() => withCards(beats(photos.value, rest.play, props.now), rest.cards ? rest.board : { notes: [], countdowns: [] }))
const previewBeat = new URLSearchParams(location.search).get('beat')   // ?beat=note (or count, title, collage) holds the first of that kind, for a preview
const current = computed(() => {
  const held = previewBeat ? timeline.value.find(b => b.kind === previewBeat) : null
  return held ? { beat: held, index: 0, from: 0, lasts: BEAT_FOR[held.kind] } : beatAt(timeline.value, tick.value)
})
const onCard = computed(() => beat.value?.kind === 'note' || beat.value?.kind === 'count')
/* The family board (design/tv-moments/BoardC): the notes as paper, what is coming up, and one photo at a time beside them. */
const boardNotes = computed(() => rest.board.notes.slice(0, 4))
const boardCounts = computed(() => rest.board.countdowns.slice(0, 3))
const framed = computed(() => photos.value.length && rest.shows ? photos.value[Math.floor(tick.value / BEAT_FOR.photo) % photos.value.length] : null)
const beat = computed(() => current.value?.beat ?? null)
const beatKey = computed(() => `${current.value?.from}`)
const isTall = (p: Photo) => shapeOf(p, learned.value) === 'tall'
const said = computed(() => beat.value?.kind === 'photo' ? beat.value.photo : null)
const titled = computed(() => beat.value?.kind === 'title' ? dayTitle(beat.value, locale()) : null)
function opened(p: Photo, e: Event) {
  const img = e.target as HTMLImageElement
  if (!shapeOf(p, learned.value) && img.naturalWidth) learned.value = { ...learned.value, [p.id]: img.naturalHeight > img.naturalWidth ? 'tall' : 'wide' }
}

const place = computed(() => drift(props.now))
const time = computed(() => clockParts(props.now))
const day = computed(() => props.now.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' }))
const wx = computed(() => restWeather())
const facts = computed(() => restingFacts(props.now).filter(f => f.key !== 'playing' && f.key !== 'next'))
const unlocked = computed(() => { const h = facts.value.find(f => f.key === 'house'); return h?.value === 'Unlocked' ? `${h.where} unlocked` : '' })

const where = computed(() => (music.value ? playingRooms(music.value) : []))
const played = computed(() => (music.value ? position(music.value, tick.value) : null))
const art = computed(() => (music.value?.attrs.entity_picture ? imageUrl(music.value.id) : null))

const sleepsIn = computed(() => Math.max(1, Math.ceil((props.since + SLEEP_AFTER - tick.value) / 60000)))

const ok = computed(() => {
  if (props.wall) return ''
  if (face.value === 'bedtime') return 'Bedtime'
  return props.room ? `The ${props.room.name.toLowerCase()}` : ''
})
</script>

<template>
  <div class="tvrest-fit">
    <div class="tvrest" :class="`tvrest-${face}`" :style="{ transform: `translate(-50%, -50%) scale(${scale})`, height: `${tall}px` }" :data-face="face" :data-wall="wall ? '' : null">

      <template v-if="face === 'photos'">
        <Transition name="tvrest-fade">
          <div class="tvrest-slide" v-if="beat" :key="beatKey" :style="{ '--beat': `${current?.lasts ?? 18000}ms` }">
            <template v-if="beat.kind === 'photo'">
              <template v-if="isTall(beat.photo)">
                <img class="tvrest-fill" :src="photoUrl(beat.photo.id)" alt="" />
                <div class="tvrest-tall"><img class="tvrest-move" :class="`m${beat.move}`" :src="photoUrl(beat.photo.id)" alt="" @load="opened(beat.photo, $event)" /></div>
              </template>
              <img v-else class="tvrest-photo tvrest-move" :class="`m${beat.move}`" :src="photoUrl(beat.photo.id)" alt="" @load="opened(beat.photo, $event)" />
            </template>
            <template v-else-if="beat.kind === 'title' && titled">
              <img class="tvrest-fill tvrest-fill-dim" :src="photoUrl(beat.cover.id)" alt="" />
              <div class="tvrest-daytitle"><div class="tvrest-daytitle-day">{{ titled.day }}</div><div class="tvrest-daytitle-sub">{{ titled.sub }}</div></div>
            </template>
            <template v-else-if="beat.kind === 'collage'">
              <img class="tvrest-fill tvrest-fill-dim" :src="photoUrl(beat.photos[0].id)" alt="" />
              <div class="tvrest-collage"><div v-for="p in beat.photos" :key="p.id"><img class="tvrest-move m1" :src="photoUrl(p.id)" alt="" /></div></div>
            </template>
            <template v-else-if="beat.kind === 'note'">
              <img v-if="photos.length" class="tvrest-fill tvrest-fill-dim" :src="photoUrl(photos[0].id)" alt="" /><div v-else class="tvrest-night"></div>
              <div class="tvrest-card">
                <div class="tvrest-paper">{{ beat.note.text }}</div>
                <div class="tvrest-card-from">{{ noteFrom(beat.note, now, locale()) }}</div>
              </div>
            </template>
            <template v-else-if="beat.kind === 'count'">
              <img v-if="photos.length" class="tvrest-fill tvrest-fill-dim" :src="photoUrl(photos[photos.length - 1].id)" alt="" /><div v-else class="tvrest-night"></div>
              <div class="tvrest-card">
                <div class="tvrest-card-cap">{{ beat.count.what }}</div>
                <div class="tvrest-count display" :class="{ word: countWords(beat.count, now).big === 'Today' }">{{ countWords(beat.count, now, locale()).big }}</div>
                <div class="tvrest-card-under" v-if="countWords(beat.count, now).under">{{ countWords(beat.count, now, locale()).under }}</div>
              </div>
            </template>
          </div>
        </Transition>
        <div class="tvrest-scrim"></div>
      </template>

      <template v-else-if="face === 'playing' && music">
        <div class="tvrest-wash" :style="art ? { backgroundImage: `url(${art})` } : undefined"></div>
        <div class="tvrest-dim"></div>
      </template>

      <template v-else-if="face === 'bedtime'">
        <div class="tvrest-night"></div>
      </template>

      <template v-else-if="face === 'board'">
        <div class="tvrest-boardbg"></div>
      </template>

      <div class="tvrest-moves" :class="{ flip: place.flip }" :style="{ translate: `${place.x}px ${place.y}px` }">

        <template v-if="face === 'photos' && onCard">
          <div class="tvrest-cardclock"><span class="tvrest-time display">{{ time.time }}<span class="tvrest-period" v-if="time.period">{{ time.period }}</span></span><span class="tvrest-day">{{ day }}</span></div>
        </template>
        <template v-else-if="face === 'photos'">
          <div class="tvrest-said" v-if="said">
            <span class="tvrest-ago" v-if="beat?.kind === 'photo' && beat.ago"><Icon name="clock" :size="26" />{{ agoLine(beat.ago) }}</span>{{ photoLine(said, locale()) }}
          </div>
          <div class="tvrest-clock-corner">
            <div class="tvrest-time display">{{ time.time }}<span class="tvrest-period" v-if="time.period">{{ time.period }}</span></div>
            <div class="tvrest-day">{{ day }}<template v-if="wx"> · {{ wx.temp }}, {{ wx.label.toLowerCase() }}</template></div>
          </div>
          <div class="tvrest-strip">
            <div class="tvrest-fact" v-for="f in facts" :key="f.key" :class="{ live: f.live }">
              <span class="tvrest-fact-value"><Icon :name="f.icon" :size="30" />{{ f.value }}</span>
              <span class="tvrest-fact-where" v-if="f.key !== 'house'">{{ f.key === 'inside' ? 'inside' : f.where }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="face === 'board'">
          <div class="tvrest-boardclock"><span class="tvrest-time display">{{ time.time }}<span class="tvrest-period" v-if="time.period">{{ time.period }}</span></span><span class="tvrest-day">{{ day }}<template v-if="wx"> · {{ wx.temp }}</template></span></div>
          <div class="tvrest-boardnotes" v-if="boardNotes.length || boardCounts.length">
            <div class="tvrest-paper small" v-for="(n, k) in boardNotes" :key="n.id" :class="`tone${k % 2}`">{{ n.text }}<small>{{ noteFrom(n, now, locale()).replace(/^A note from /, 'From ').replace(/^A note · /, '') }}</small></div>
            <div class="tvrest-coming" v-if="boardCounts.length">
              <div class="tvrest-card-cap">Coming up</div>
              <div class="tvrest-coming-row"><span v-for="c in boardCounts" :key="c.id"><b class="display">{{ countWords(c, now).big }}</b>{{ countWords(c, now).big === 'Today' ? '' : (countWords(c, now).big === '1' ? ' day' : ' days') }} · {{ c.what }}</span></div>
            </div>
          </div>
          <div class="tvrest-boardempty" v-else>Nothing on the board yet. Leave a note from a phone, on Your screens.</div>
          <div class="tvrest-boardphoto" v-if="framed"><img :src="photoUrl(framed.id)" alt="" /></div>
          <div class="tvrest-boardsaid" v-if="framed">{{ photoLine(framed, locale()) }}</div>
          <div class="tvrest-strip tvrest-strip-small">
            <div class="tvrest-fact" v-for="f in facts.slice(0, 2)" :key="f.key" :class="{ live: f.live }">
              <span class="tvrest-fact-value"><Icon :name="f.icon" :size="26" />{{ f.value }}</span>
              <span class="tvrest-fact-where" v-if="f.key === 'lights' && f.live">{{ f.where }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="face === 'window'">
          <div class="tvrest-alert" v-if="unlocked"><Icon name="lock" :size="32" />{{ unlocked }}</div>
          <div class="tvrest-ask" v-if="rest.photosKnown && !photos.length && qrOk">
            <div><h2>Put your photos on this TV</h2><p>Point your phone’s camera at the code. The photos stay on the hub, in this house.</p></div>
            <img :src="qrUrl(photosPageUrl())" alt="A code that opens Photos on the TV on a phone" @error="qrOk = false" />
          </div>
          <div class="tvrest-caption">
            <div class="tvrest-time display">{{ time.time }}<span class="tvrest-period" v-if="time.period">{{ time.period }}</span></div>
            <div class="tvrest-day" v-if="wx">{{ wx.temp }} and {{ wx.label.toLowerCase() }}</div>
          </div>
        </template>

        <template v-else-if="face === 'playing' && music">
          <div class="tvrest-art">
            <img v-if="art" :src="art" alt="" />
            <Icon v-else name="music" :size="160" />
          </div>
          <div class="tvrest-song">
            <div class="tvrest-where"><Icon name="music" :size="26" />{{ where.length > 1 ? `Playing in ${where.length} rooms` : `Playing in the ${(where[0] ?? '').toLowerCase()}` }}</div>
            <div class="tvrest-title">{{ music.attrs.media_title || 'Music' }}</div>
            <div class="tvrest-artist" v-if="music.attrs.media_artist">{{ music.attrs.media_artist }}</div>
            <div class="tvrest-bar" v-if="played"><span>{{ mmss(played.at) }}</span><i><b :style="{ width: `${(played.at / played.of) * 100}%` }"></b></i><span>{{ mmss(played.of) }}</span></div>
            <div class="tvrest-rooms" v-if="where.length > 1"><span v-for="r in where" :key="r"><Icon name="media" :size="24" />{{ r }}</span></div>
          </div>
          <div class="tvrest-clock-top">
            <span class="tvrest-day" v-if="wx">{{ wx.temp }} · {{ day }}</span>
            <span class="tvrest-time display">{{ time.time }}<span class="tvrest-period" v-if="time.period">{{ time.period }}</span></span>
          </div>
          <div class="tvrest-strip tvrest-strip-small">
            <div class="tvrest-fact" v-for="f in facts.slice(0, 2)" :key="f.key" :class="{ live: f.live }">
              <span class="tvrest-fact-value"><Icon :name="f.icon" :size="26" />{{ f.value }}</span>
              <span class="tvrest-fact-where" v-if="f.key === 'lights' && f.live">{{ f.where }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="face === 'bedtime'">
          <div class="tvrest-clock-top tvrest-clock-left">
            <span class="tvrest-time display">{{ time.time }}<span class="tvrest-period" v-if="time.period">{{ time.period }}</span></span>
            <span class="tvrest-day">{{ day }}<template v-if="wx"> · {{ wx.temp }} outside</template></span>
          </div>
          <div class="tvrest-left">
            <h2>Still on before bed</h2>
            <ul>
              <li v-for="s in listed" :key="s.kind + s.name"><i :class="s.kind"></i>{{ s.name }}<small>{{ s.what }}</small></li>
              <li v-if="listed.length < left.length" class="tvrest-more">and {{ left.length - listed.length }} more</li>
            </ul>
          </div>
          <div class="tvrest-bed">
            <div class="tvrest-go"><Icon name="moon" :size="64" /><div><b>Bedtime</b><small>{{ bedtimeLine(left) }}</small></div></div>
            <div class="tvrest-sleeps">This TV turns itself off in {{ sleepsIn }} {{ sleepsIn === 1 ? 'minute' : 'minutes' }}. The house stays as it is.</div>
            <div class="tvrest-sleeps">After Bedtime, the TV turns off with the lights.</div>
          </div>
          <div class="tvrest-back"><kbd>Back</kbd>Not yet</div>
        </template>

        <div class="tvrest-ok" v-if="ok"><kbd>OK</kbd>{{ ok }}</div>
      </div>
    </div>
  </div>
</template>
