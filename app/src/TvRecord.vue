<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* The resting TV while its room plays music (design/tv-music/, B): the record fills the screen and the time keeps a
   corner. OK raises the band (TvBand's music row) with Pause, Next and the volume, and Back puts it away. */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { imageUrl, type Device, type Room } from './api'
import { shortName } from './store'
import { speakersOf } from './tv'

const props = defineProps<{ d: Device; room: Room; time: string; period: string; day: string; temp: string | null; under: boolean }>()
const scale = ref(1)
const fit = () => (scale.value = Math.min(innerWidth / 1920, innerHeight / 1080))
onMounted(() => { fit(); window.addEventListener('resize', fit) })
onUnmounted(() => window.removeEventListener('resize', fit))
const where = computed(() => {
  const n = speakersOf(props.d, props.room).map(x => shortName(x, props.room))
  return `On the ${n.length > 1 ? `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}` : n[0]}, in the ${props.room.name.toLowerCase()}`
})
const pos = computed(() => {
  const at = Number(props.d.attrs.media_position), of = Number(props.d.attrs.media_duration)
  return at >= 0 && of > 0 ? Math.min(100, (at / of) * 100) : null
})
</script>

<template>
  <div class="rec-wrap">
    <div class="rec" :style="{ zoom: scale }">
      <div class="rec-corner"><div class="rec-time">{{ time }}<small v-if="period"> {{ period }}</small></div><div class="rec-day">{{ day }}<template v-if="temp"> · {{ temp }}</template></div></div>
      <div class="rec-main">
        <div class="rec-art"><img v-if="d.attrs.entity_picture" :src="imageUrl(d.id)" alt="" /></div>
        <div class="rec-words">
          <div class="rec-t">{{ d.attrs.media_title || 'Music' }}</div>
          <div class="rec-a" v-if="d.attrs.media_artist">{{ d.attrs.media_artist }}</div>
          <div class="rec-w">{{ where }}</div>
          <div class="rec-bar" v-if="pos != null"><i :style="{ width: `${pos}%` }"></i></div>
        </div>
      </div>
      <div class="rec-keys" v-if="!under"><kbd>OK</kbd>Pause, next, louder</div>
    </div>
  </div>
</template>

<style scoped>
.rec-wrap { position: fixed; inset: 0; overflow: hidden; }
.rec { position: relative; width: 1920px; height: 1080px; color: var(--ink); }
.rec-corner { position: absolute; right: 96px; top: 54px; text-align: right; }
.rec-time { font-size: 56px; font-weight: 300; }
.rec-time small { font-size: 0.6em; }
.rec-day { font-size: 22px; color: var(--ink); }
.rec-main { position: absolute; left: 240px; top: 240px; display: flex; gap: 70px; align-items: center; }

.rec-art { width: 560px; height: 560px; flex: none; border-radius: var(--r-lg); overflow: hidden; box-shadow: 0 40px 100px rgba(0, 0, 0, 0.6);
  background: radial-gradient(60% 60% at 30% 30%, rgba(var(--lamp-rgb), 0.55), transparent 70%), linear-gradient(160deg, #2a3142, #151a24); }
.rec-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rec-words { max-width: 900px; }
.rec-t { font-size: 84px; font-weight: 400; letter-spacing: -0.03em; line-height: 1.02; }
.rec-a { font-size: 34px; color: var(--ink); margin-top: 18px; }
.rec-w { font-size: 26px; color: var(--ink); margin-top: 40px; }
.rec-bar { width: 560px; height: 5px; margin-top: 40px; border-radius: 3px; background: rgba(255, 255, 255, 0.14); }
.rec-bar i { display: block; height: 100%; border-radius: 3px; background: var(--ink); }
.rec-keys { position: absolute; right: 96px; bottom: 54px; display: inline-flex; gap: 10px; align-items: center; font-size: 22px; color: var(--ink); }
.rec-keys kbd { font-family: inherit; font-size: 17px; font-weight: 600; line-height: 1; min-width: 40px; height: 36px; padding: 0 10px; display: inline-grid; place-items: center;
  border-radius: 18px; color: var(--ink); background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge-hi); }
</style>
