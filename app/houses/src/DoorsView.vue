<!--
  SPDX-FileCopyrightText: 2026 Temitope Adeyeri
  SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
/*
 * A phone with no house yet (design/pretend-in-app/, B, chosen 19 October 2026): what the app is, and two ways on.
 * Somebody holding a code adds their house; anybody else, App Review included, can look around a pretend one first.
 * Once a house is added this is never seen again.
 */
const emit = defineEmits<{ add: []; pretend: [] }>()
</script>

<template>
  <div class="hs-field"></div>
  <main class="hs-page">
    <div class="hs-doors">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-6 8 6v8a1 1 0 01-1 1H5a1 1 0 01-1-1z"/></svg>
      <h1 class="hs-title">Your house, on this phone.</h1>
      <p class="hs-lede">Add a house with the code its screen shows you, or look around one that isn’t real first.</p>
    </div>
    <div class="hs-actions hs-doors-go">
      <button class="hs-btn wide" @click="emit('add')">Add a house</button>
      <button class="hs-btn ghost wide" @click="emit('pretend')">Try a pretend house</button>
    </div>
  </main>
</template>
