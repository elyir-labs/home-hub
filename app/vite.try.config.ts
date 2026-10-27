// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
/* The pretend house (src/try.ts): the panel built to run with the mock house inside the page, for hub.elyir.com/try.
   site/build.sh copies it in. The panel's own index.html, entered through src/try.ts instead of src/main.ts. */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/try/',
  plugins: [
    vue(),
    {
      name: 'enter-through-try',
      transformIndexHtml: { order: 'pre', handler: html => html.replace('/src/main.ts', '/src/try.ts') },
    },
  ],
  build: {
    outDir: fileURLToPath(new URL('./dist-try', import.meta.url)),
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
})
