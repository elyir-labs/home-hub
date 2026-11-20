<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/* One painting on a resting screen (design/tv-art/StoryC, decided 20 November 2026): close on one part of it, then the
   whole painting uncropped, then what it is. The same between the photos and on a screen that shows paintings all day.
   `from` is when it came up, so a screen that wakes halfway through picks the story up where it is rather than
   starting it again. */
import { computed } from 'vue'
import { paintingUrl, type Painting } from './api'
import { ART_LOOK, hang } from './restTv'

const props = defineProps<{ painting: Painting; from: number; tall: number; drift?: { x: number; y: number } }>()

const box = computed(() => hang(props.painting, props.tall))
const focus = computed(() => { const f = props.painting.focus ?? [0.5, 0.45]; return `${(f[0] * 100).toFixed(1)}% ${(f[1] * 100).toFixed(1)}%` })
const into = `${-Math.max(0, Date.now() - props.from)}ms`
const moved = computed(() => props.drift ? { translate: `${props.drift.x}px ${props.drift.y}px` } : {})
const by = computed(() => [props.painting.painter, props.painting.year].filter(Boolean).join(', '))
</script>

<template>
  <div class="tvrest-gallery"></div>
  <div class="tvrest-painting" :style="{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px`, ...moved }">
    <img class="tvrest-painting-look" :src="paintingUrl(painting.id)" alt="" :style="{ transformOrigin: focus, animationDuration: `${ART_LOOK}ms`, animationDelay: into }" />
  </div>
  <div class="tvrest-plaque" :style="{ left: `${box.label}px`, animationDelay: `calc(${ART_LOOK}ms + ${into})`, ...moved }">
    <div class="tvrest-card-cap">A painting</div>
    <div class="tvrest-plaque-title">{{ painting.title }}</div>
    <div class="tvrest-plaque-by">{{ by }}</div>
    <div class="tvrest-plaque-line" v-if="painting.line">{{ painting.line }}</div>
    <div class="tvrest-plaque-from" v-if="painting.museum">{{ painting.museum }}</div>
  </div>
</template>
