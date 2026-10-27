// SPDX-FileCopyrightText: 2026 Temitope Adeyeri
// SPDX-License-Identifier: AGPL-3.0-or-later
// The startup's numbers for a product that draws it itself rather than through the boot splash: the phone apps
// (docs/apps.md) read startup/sequence.json. `node startup/json.mjs` writes it from sequence.mjs.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SPACE, COLOR, NAME, HOUSE, TIME, BREATH } from './sequence.mjs'

export const json = () => JSON.stringify({ SPACE, COLOR, NAME, HOUSE, TIME, BREATH }, null, 1) + '\n'

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('sequence.json', import.meta.url), json())
  console.log('wrote startup/sequence.json')
}
