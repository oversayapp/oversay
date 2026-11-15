#!/usr/bin/env node
// Writes the Tauri config a build merges in (`tauri build --config <file>`), from the
// environment (ADR 0030). Nothing about updates is in tauri.conf.json itself:
//
// - OVERSAY_UPDATE_FEED and OVERSAY_UPDATE_PUBKEY, both set: the build checks that feed and
//   trusts that key. Without them the app never registers the updater, so it never makes a request.
// - TAURI_SIGNING_PRIVATE_KEY set: the build also makes signed update packages (Tauri reads the
//   key and TAURI_SIGNING_PRIVATE_KEY_PASSWORD itself).
//
// Usage: node scripts/build-config.mjs <out.json>

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function buildConfig(env) {
  const feed = env.OVERSAY_UPDATE_FEED?.trim()
  const pubkey = env.OVERSAY_UPDATE_PUBKEY?.trim()
  if (!!feed !== !!pubkey) throw new Error('OVERSAY_UPDATE_FEED and OVERSAY_UPDATE_PUBKEY go together: set both or neither')
  const config = {}
  if (feed) {
    if (!feed.startsWith('https://')) throw new Error(`OVERSAY_UPDATE_FEED must be an https:// address, not ${feed}`)
    // requireSignedVersion: a package is refused unless its signature carries the version
    // latest.json announces, so a tampered feed can't pass an old release off as new.
    config.plugins = { updater: { endpoints: [feed], pubkey, requireSignedVersion: true } }
  }
  if (env.TAURI_SIGNING_PRIVATE_KEY?.trim()) config.bundle = { createUpdaterArtifacts: true }
  return config
}

// What the build does about updates, in one line for the log.
export function describe(config) {
  const checks = config.plugins?.updater ? `checks ${config.plugins.updater.endpoints[0]}` : 'never checks for updates'
  const signs = config.bundle?.createUpdaterArtifacts ? 'makes signed update packages' : 'makes no update packages'
  return `This build ${checks} and ${signs}.`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2]
  if (!out) {
    console.error('usage: node scripts/build-config.mjs <out.json>')
    process.exit(1)
  }
  try {
    const config = buildConfig(process.env)
    writeFileSync(out, JSON.stringify(config, null, 2) + '\n')
    console.log(describe(config))
  } catch (e) {
    console.error(`build-config: ${e.message}`)
    process.exit(1)
  }
}
