<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* Somebody at the door, on the TV (design/tv-doorbell/, A). The door's picture comes up in the corner over
   whatever was on, the room still in view behind it; OK makes it the whole screen (the viewer) and Back lets it
   go, and it goes by itself after a minute (`rang` in store.ts). The keys are App.vue's, because they have to
   reach it over a resting TV too. Live when the camera will stream, the newest still while it connects. */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { deviceById, roomOf, store } from './store'
import { webrtc, mjpeg, type Live } from './live'
import { ageLabel, useStill } from './still'

const cam = computed(() => store.ringing ? deviceById(store.ringing.camera) : undefined)
const where = computed(() => {
  const r = cam.value && roomOf(cam.value)
  return r && r.id !== 'unassigned' ? r.name.toLowerCase() : (cam.value?.name.toLowerCase() ?? 'door')
})
const video = ref<HTMLVideoElement>(), moving = ref<HTMLImageElement>()
const playing = ref(false)
const still = useStill(() => playing.value ? undefined : cam.value?.id, 2000)
let live: Live | null = null

function stop() { live?.stop(); live = null; playing.value = false }
async function start() {
  stop()
  const id = cam.value?.id
  await nextTick()
  if (!id || !video.value || !moving.value) return
  const on = (next: () => void) => ({ playing: () => { playing.value = true }, failed: () => { playing.value = false; next() } })
  const stills = () => { live = null }
  live = 'RTCPeerConnection' in window ? webrtc(id, video.value, on(() => { live = mjpeg(id, moving.value!, on(stills)) })) : mjpeg(id, moving.value, on(stills))
}

const scale = ref(1)
const fit = () => (scale.value = Math.min(innerWidth / 1920, innerHeight / 1080))
onMounted(() => { fit(); window.addEventListener('resize', fit); start() })
onUnmounted(() => { stop(); window.removeEventListener('resize', fit) })
watch(() => cam.value?.id, start)
</script>

<template>
  <div class="door-wrap" v-if="cam">
    <div class="door" :style="{ zoom: scale }">
      <div class="door-corner" role="alert">
        <div class="door-frame">
          <img v-if="still.url" class="door-pic" :src="still.url" alt="" />
          <img ref="moving" class="door-pic door-moving" :class="{ on: playing }" alt="" />
          <video ref="video" class="door-pic door-video" :class="{ on: playing }" autoplay muted playsinline></video>
          <span class="door-live" :class="{ on: playing }">{{ playing ? 'Live' : still.url ? ageLabel(still.at) : 'Connecting' }}</span>
        </div>
        <div class="door-txt">
          <div class="door-t">Someone's at the {{ where }}</div>
          <div class="door-s">Just now · goes in a minute</div>
        </div>
      </div>
      <div class="door-keys"><span><kbd>OK</kbd>Bigger</span><span><kbd>Back</kbd>Not now</span></div>
    </div>
  </div>
</template>

<style scoped>
.door-wrap { position: fixed; inset: 0; z-index: 70; overflow: hidden; pointer-events: none; }
.door { position: relative; width: 1920px; height: 1080px; color: var(--ink); }
.door::before { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 140px; background: linear-gradient(transparent, rgba(5, 7, 10, 0.85)); }
.door-corner { position: absolute; right: 96px; bottom: 130px; width: 640px; border-radius: var(--r-lg); overflow: hidden; pointer-events: auto;
  background: rgba(14, 16, 20, 0.94); box-shadow: 0 0 0 3px rgba(var(--lamp-rgb), 0.95), 0 0 0 9px rgba(var(--lamp-rgb), 0.18), 0 30px 80px rgba(0, 0, 0, 0.6);
  animation: door-in 0.32s cubic-bezier(0.2, 0.7, 0.2, 1); }
@keyframes door-in { from { transform: translateY(30px); opacity: 0; } }
.door-frame { position: relative; height: 360px; background: #000; }
.door-pic { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.door-moving, .door-video { opacity: 0; }
.door-moving.on, .door-video.on { opacity: 1; }
.door-live { position: absolute; left: 18px; top: 18px; display: inline-flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 999px;
  font-size: 20px; font-weight: 600; letter-spacing: 0.04em; color: var(--ink); background: rgba(0, 0, 0, 0.5); }
.door-live.on::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--danger); }
.door-txt { padding: 20px 26px 24px; }
.door-t { font-size: 34px; font-weight: 500; letter-spacing: -0.01em; }
.door-s { font-size: 24px; color: var(--ink-2); margin-top: 6px; }
.door-keys { position: absolute; left: 96px; bottom: 54px; display: flex; gap: 28px; align-items: center; font-size: 22px; color: var(--ink-2); white-space: nowrap; }
.door-keys span { display: inline-flex; gap: 10px; align-items: center; }
.door-keys kbd { font-family: inherit; font-size: 17px; font-weight: 600; line-height: 1; letter-spacing: 0.04em; color: var(--ink); min-width: 40px; height: 36px; padding: 0 10px;
  display: inline-grid; place-items: center; border-radius: 18px; background: rgba(255, 255, 255, 0.1); border: 1px solid var(--edge-hi); }
</style>
