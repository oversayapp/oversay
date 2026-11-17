#!/usr/bin/env node
// Oversay's version is set in one place, app/package.json (ADR 0030). tauri.conf.json reads it;
// Cargo.toml can't, so this keeps it in step and checks it.
//
// Usage:
//   node scripts/version.mjs 0.2.0      set the version in package.json, package-lock.json,
//                                       Cargo.toml and Cargo.lock, then run make skills
//   node scripts/version.mjs --check    fail when Cargo.toml differs from package.json (make check)
//   node scripts/version.mjs --tag v0.2.0
//                                       fail unless the tag is v + package.json's version (release job)

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE = 'app/package.json'
const LOCK = 'app/package-lock.json'
const CARGO = 'app/src-tauri/Cargo.toml'
const CARGO_LOCK = 'app/src-tauri/Cargo.lock'

// Plain X.Y.Z only: the Windows .msi takes no pre-release text, and caps each part.
export function validVersion(v) {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(v)
  if (!m) return `"${v}" is not a version: use X.Y.Z, numbers only`
  const [major, minor, patch] = m.slice(1).map(Number)
  if (major > 255 || minor > 255 || patch > 65535) return `"${v}" is too large for a Windows installer (255.255.65535 at most)`
  return null
}

// The [package] version in Cargo.toml.
export function cargoVersion(toml) {
  const pkg = /^\[package\]\n([\s\S]*?)(?=^\[)/m.exec(toml)
  const v = pkg && /^version = "([^"]*)"/m.exec(pkg[1])
  if (!v) throw new Error(`${CARGO}: no [package] version`)
  return v[1]
}

export function setCargoVersion(toml, v) {
  return toml.replace(/^(\[package\]\n[\s\S]*?^version = ")[^"]*(")/m, `$1${v}$2`)
}

// Our own crate's entry in Cargo.lock.
export function setCargoLockVersion(lock, v) {
  const next = lock.replace(/(\[\[package\]\]\nname = "oversay"\nversion = ")[^"]*(")/, `$1${v}$2`)
  if (next === lock && !lock.includes(`name = "oversay"\nversion = "${v}"`)) throw new Error(`${CARGO_LOCK}: no oversay package`)
  return next
}

// The Oversay skill's files embed the version, and make check fails while they are stale, so a
// bump rewrites them too. `run` is a parameter so the test needs no build.
export function regenerateSkills(run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })) {
  run('make', ['skills'])
}

export function checkTag(tag, version) {
  return tag === `v${version}` ? null : `tag ${tag} doesn't match package.json's version ${version}: expected v${version}`
}

const read = (f) => readFileSync(join(root, f), 'utf8')
const write = (f, s) => writeFileSync(join(root, f), s)
const packageVersion = () => JSON.parse(read(PACKAGE)).version

function fail(msg) {
  console.error(`version: ${msg}`)
  process.exit(1)
}

function main([arg, value]) {
  if (arg === '--check') {
    const want = packageVersion()
    const bad = validVersion(want)
    if (bad) fail(`${PACKAGE}: ${bad}`)
    const got = cargoVersion(read(CARGO))
    if (got !== want) fail(`${CARGO} has ${got}, ${PACKAGE} has ${want}: run node scripts/version.mjs ${want}`)
    console.log(`version: ok (${want})`)
  } else if (arg === '--tag') {
    const bad = checkTag(value ?? '', packageVersion())
    if (bad) fail(bad)
    console.log(`version: ${value} matches package.json`)
  } else if (arg && !arg.startsWith('-')) {
    const bad = validVersion(arg)
    if (bad) fail(bad)
    const pkg = JSON.parse(read(PACKAGE))
    pkg.version = arg
    write(PACKAGE, JSON.stringify(pkg, null, 2) + '\n')
    const lock = JSON.parse(read(LOCK))
    lock.version = arg
    lock.packages[''].version = arg
    write(LOCK, JSON.stringify(lock, null, 2) + '\n')
    write(CARGO, setCargoVersion(read(CARGO), arg))
    write(CARGO_LOCK, setCargoLockVersion(read(CARGO_LOCK), arg))
    console.log(`version: set to ${arg} in ${PACKAGE}, ${LOCK}, ${CARGO} and ${CARGO_LOCK}`)
    regenerateSkills()
  } else {
    fail('usage: node scripts/version.mjs X.Y.Z | --check | --tag vX.Y.Z')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
