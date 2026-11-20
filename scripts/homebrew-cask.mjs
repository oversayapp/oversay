#!/usr/bin/env node
// Points the Homebrew cask (Casks/oversay.rb in oversayapp/homebrew-tap) at a release: sets its
// version and the sha256 of that release's universal .dmg. The release job runs it after
// publishing a release; docs/releasing.md says how to run it by hand.
//
// Usage:
//   node scripts/homebrew-cask.mjs --cask <tap>/Casks/oversay.rb --version 0.5.0 --dmg Oversay_0.5.0_universal.dmg

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validVersion } from './version.mjs'

// The .dmg the macOS job builds (Tauri's name for productName Oversay, universal target), which
// the cask's url names as Oversay_#{version}_universal.dmg.
export function dmgName(version) {
  return `Oversay_${version}_universal.dmg`
}

// The cask's text with its version and sha256 lines replaced. Throws when either line is missing,
// so a reshaped cask fails the release job instead of being pushed unchanged.
export function setCask(text, version, sha256) {
  const bad = validVersion(version)
  if (bad) throw new Error(bad)
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`"${sha256}" is not a sha256`)
  const set = (src, key, value) => {
    const line = new RegExp(`^(\\s*${key}\\s+)"[^"]*"`, 'm')
    if (!line.test(src)) throw new Error(`the cask has no ${key} line`)
    return src.replace(line, `$1"${value}"`)
  }
  return set(set(text, 'version', version), 'sha256', sha256)
}

function main(argv) {
  const opt = {}
  for (let i = 0; i < argv.length; i += 2) opt[argv[i].replace(/^--/, '')] = argv[i + 1]
  for (const k of ['cask', 'version', 'dmg'])
    if (!opt[k]) {
      console.error(`homebrew-cask: --${k} is required`)
      process.exit(1)
    }
  if (basename(opt.dmg) !== dmgName(opt.version)) {
    console.error(`homebrew-cask: ${basename(opt.dmg)} is not ${dmgName(opt.version)}, the file the cask downloads`)
    process.exit(1)
  }
  const sha256 = createHash('sha256').update(readFileSync(opt.dmg)).digest('hex')
  writeFileSync(opt.cask, setCask(readFileSync(opt.cask, 'utf8'), opt.version, sha256))
  console.log(`homebrew-cask: ${opt.cask} is now ${opt.version}, sha256 ${sha256}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
