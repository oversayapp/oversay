#!/usr/bin/env node
// Points the Homebrew cask (Casks/oversay.rb in oversayapp/homebrew-tap) at a release: sets its
// version and the sha256 of that release's universal .dmg. The release job runs it after
// publishing a release; docs/releasing.md says how to run it by hand. A version older than the
// cask's leaves it as it is, so re-running an old release's job never moves the cask backwards.
//
// Usage:
//   node scripts/homebrew-cask.mjs --cask <tap>/Casks/oversay.rb --version 0.5.0 --dir <folder holding the .dmg>

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validVersion } from './version.mjs'

// The .dmg the macOS job builds (Tauri's name for productName Oversay, universal target), which
// the cask's url names as Oversay_#{version}_universal.dmg.
export function dmgName(version) {
  return `Oversay_${version}_universal.dmg`
}

const line = (key) => new RegExp(`^([ \\t]*${key}[ \\t]+)"([^"]*)"`, 'm')

// The version the cask points at, or null when it has no version line.
export function caskVersion(text) {
  return line('version').exec(text)?.[2] ?? null
}

// Negative when a is older than b, 0 when equal, positive when newer (plain X.Y.Z).
export function compareVersions(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

// The cask's text with its version and sha256 lines replaced. Throws when either line is missing,
// so a reshaped cask fails the release job instead of being pushed unchanged.
export function setCask(text, version, sha256) {
  const bad = validVersion(version)
  if (bad) throw new Error(bad)
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`"${sha256}" is not a sha256`)
  const set = (src, key, value) => {
    if (!line(key).test(src)) throw new Error(`the cask has no ${key} line`)
    return src.replace(line(key), `$1"${value}"`)
  }
  return set(set(text, 'version', version), 'sha256', sha256)
}

function main(argv) {
  const opt = {}
  for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, '')] = argv[i + 1]
  for (const k of ['cask', 'version', 'dir'])
    if (!opt[k]) {
      console.error(`homebrew-cask: --${k} is required`)
      process.exit(1)
    }
  const text = readFileSync(opt.cask, 'utf8')
  const current = caskVersion(text)
  if (current && !validVersion(current) && compareVersions(opt.version, current) < 0) {
    console.log(`homebrew-cask: the cask already points at ${current}, newer than ${opt.version}; left as it is`)
    return
  }
  const sha256 = createHash('sha256').update(readFileSync(join(opt.dir, dmgName(opt.version)))).digest('hex')
  writeFileSync(opt.cask, setCask(text, opt.version, sha256))
  console.log(`homebrew-cask: ${opt.cask} is now ${opt.version}, sha256 ${sha256}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
