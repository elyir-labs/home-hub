/* Nothing that runs in a house reports on it. The privacy page promises no tracking or analytics in the hub, and a
   crash reporter is the usual way that promise is broken without anyone deciding to: it arrives as a dependency and
   sends the house's state along with the stack. When a hub misbehaves, the household sends a diagnostics bundle
   themselves (docs/shipping.md). The update check-in in docs/updates.md is the one line allowed out, and it is ours.
   `node --test tools/nothing-reports.test.mjs` */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const MANIFESTS = [
  'brain/requirements.txt', 'brain/pyproject.toml',
  'app/package.json', 'app/package-lock.json',
  'matter-bridge/package.json', 'matter-bridge/package-lock.json',
  'kiosk/build.gradle.kts', 'kiosk/app/build.gradle.kts', 'kiosk/gradle/libs.versions.toml',
  'puck/platformio.ini',
  'relay/service/requirements.txt',
]

const REPORTERS = [
  'sentry', 'bugsnag', 'rollbar', 'honeybadger', 'raygun', 'airbrake', 'crashlytics', 'appcenter', 'instabug',
  'posthog', 'mixpanel', 'amplitude', 'segment-analytics', '@segment', 'analytics-node', 'heap-api', 'logrocket',
  'datadog', 'ddtrace', 'dd-trace', 'newrelic', 'elastic-apm', 'firebase-analytics', 'google-analytics', 'gtag',
]

// A whole name, so a lockfile's checksums can't spell one by chance.
const named = (name) => new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)

test('no part of the hub depends on a crash reporter or an analytics kit', () => {
  const read = MANIFESTS.filter((file) => existsSync(path.join(ROOT, file)))
  assert.ok(read.includes('brain/requirements.txt') && read.includes('app/package.json'), 'the manifests moved; follow them')
  for (const file of read) {
    const text = readFileSync(path.join(ROOT, file), 'utf8').toLowerCase()
    for (const name of REPORTERS) assert.ok(!named(name).test(text), `${file} brings in ${name}`)
  }
})
