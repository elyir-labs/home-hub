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
import { drift, faceFor, loadRestPhotos, bedtimeLine, mmss, nightOf, photoLine, playingNow, playingRooms, position, rest, shapeOf,
  SLEEP_AFTER, slideAt, slides, stillOn, type Photo, type Shape } from './restTv'
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
const face = computed(() => props.wall ? 'photos' : faceFor({ playing: !!music.value, stillOn: left.value.length, photos: rest.shows ? photos.value.length : 0,
  now: props.now, notYet: rest.notYet === nightOf(props.now) }))
watch(face, f => { if (!props.wall) rest.face = f }, { immediate: true })

const shown = computed(() => slideAt(slides(photos.value, learned.value), tick.value) ?? [])
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
          <div class="tvrest-slide" :key="shown.map(p => p.id).join()">
            <img v-if="shown.length === 1" class="tvrest-photo" :src="photoUrl(shown[0].id)" alt="" @load="opened(shown[0], $event)" />
            <template v-else>
              <img class="tvrest-pair-wash" :src="photoUrl(shown[0].id)" alt="" />
              <div class="tvrest-pair"><img v-for="p in shown" :key="p.id" :src="photoUrl(p.id)" alt="" @load="opened(p, $event)" /></div>
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

      <div class="tvrest-moves" :class="{ flip: place.flip }" :style="{ translate: `${place.x}px ${place.y}px` }">

        <template v-if="face === 'photos'">
          <div class="tvrest-said" v-if="shown.length">{{ photoLine(shown[0], locale()) }}</div>
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
