<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/*
 * Who the house knows, and who is in. Real presence from the brain, not decoration: a person keeps their color and
 * their initial but goes quiet when they are out. The last circle is always the + that adds one more, so a house
 * with nobody set up still shows where people go. Along the foot under the old bar, and in the top bar once the
 * dock has the foot (design/every-screen/, B).
 */
import { computed } from 'vue'
import { store } from './store'
import { initials, personTone } from './people'
import Icon from './Icon.vue'

const people = computed(() => store.presence?.people ?? [])
const line = computed(() => {
  const home = people.value.filter(p => p.home === true).map(p => p.name)
  if (!people.value.length) return ''
  if (!home.length) return 'Nobody home'
  if (home.length === people.value.length) return 'Everyone home'
  return home.length === 1 ? `${home[0]} is home` : `${home.slice(0, -1).join(', ')} and ${home[home.length - 1]} are home`
})
const open = () => (store.sheet = 'people')
</script>

<template>
  <div class="household" aria-label="Household">
    <span class="household-line" v-if="line">{{ line }}</span>
    <span class="household-label">People</span>
    <div class="household-people">
      <button v-for="(p, i) in people" :key="p.name" class="person" :class="{ out: p.home === false, unknown: p.home === null }" :style="{ background: personTone(i) }"
              :title="`${p.name}, ${p.home === true ? 'home' : p.home === false ? 'away' : 'not sure'}`"
              :aria-label="`${p.name}, ${p.home === true ? 'home' : p.home === false ? 'away' : 'not sure'}`" @click="open">{{ initials(p.name) }}</button>
      <button class="person add" @click="open" aria-label="Add a person"><Icon name="plus" :size="14" /></button>
    </div>
  </div>
</template>
