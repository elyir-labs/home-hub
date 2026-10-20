<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/*
 * The pretend house, framed the way a house is (design/pretend-in-app/, B). It is never one of this phone's houses:
 * nothing is kept, and it holds no pass worth keeping -- the made-up house runs inside its own page. Its name reads
 * Pretend house, and a tap on the name goes back to the two doors.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { pretendAt } from './houses'
import { shell } from './shell'

const emit = defineEmits<{ leave: [] }>()
const base = pretendAt(location)
const src = computed(() => `${base}/?app=1${shell}`)
const frame = ref<HTMLIFrameElement | null>(null)

function onMessage(ev: MessageEvent) {
  if (!frame.value || ev.source !== frame.value.contentWindow || ev.origin !== new URL(base).origin) return
  if (ev.data?.type === 'houses:ready') frame.value.contentWindow!.postMessage({ type: 'houses:token', token: 'pretend', lan: null, name: 'Pretend house', others: false }, ev.origin)
  else if (ev.data?.type === 'houses:open') emit('leave')
}
onMounted(() => window.addEventListener('message', onMessage))
onUnmounted(() => window.removeEventListener('message', onMessage))
</script>

<template>
  <div class="hs-house">
    <iframe ref="frame" class="hs-frame" :src="src" title="A pretend house" allow="fullscreen" referrerpolicy="no-referrer"></iframe>
  </div>
</template>
