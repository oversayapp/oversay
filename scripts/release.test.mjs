// Tests for the release scripts: node --test scripts/ (make check runs it).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validVersion, cargoVersion, setCargoVersion, setCargoLockVersion, checkTag, regenerateSkills } from './version.mjs'
import { latestJson } from './latest-json.mjs'
import { buildConfig, describe } from './build-config.mjs'

test('versions are plain X.Y.Z within what a Windows installer takes', () => {
  assert.equal(validVersion('0.2.0'), null)
  assert.equal(validVersion('255.255.65535'), null)
  assert.match(validVersion('0.2'), /not a version/)
  assert.match(validVersion('0.2.0-beta.1'), /not a version/)
  assert.match(validVersion('v0.2.0'), /not a version/)
  assert.match(validVersion('01.2.0'), /not a version/)
  assert.match(validVersion('256.0.0'), /too large/)
})

const TOML = `[package]
name = "oversay"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1.0" }
`

test("Cargo.toml's package version is read and set, not a dependency's", () => {
  assert.equal(cargoVersion(TOML), '0.1.0')
  const next = setCargoVersion(TOML, '0.2.0')
  assert.equal(cargoVersion(next), '0.2.0')
  assert.match(next, /serde = \{ version = "1.0" \}/)
})

test("Cargo.lock's oversay entry is set, and only that one", () => {
  const lock = `[[package]]\nname = "objc2"\nversion = "0.1.0"\n\n[[package]]\nname = "oversay"\nversion = "0.1.0"\ndependencies = []\n`
  const next = setCargoLockVersion(lock, '0.2.0')
  assert.match(next, /name = "objc2"\nversion = "0.1.0"/)
  assert.match(next, /name = "oversay"\nversion = "0.2.0"/)
  assert.throws(() => setCargoLockVersion('[[package]]\nname = "other"\nversion = "1.0.0"\n', '0.2.0'))
})

test('a release tag must be v plus the version', () => {
  assert.equal(checkTag('v0.2.0', '0.2.0'), null)
  assert.match(checkTag('v0.2.1', '0.2.0'), /expected v0.2.0/)
  assert.match(checkTag('0.2.0', '0.2.0'), /expected v0.2.0/)
})

const FILES = [
  'Oversay.app.tar.gz',
  'Oversay.app.tar.gz.sig',
  'Oversay_0.2.0_x64-setup.exe',
  'Oversay_0.2.0_x64-setup.exe.sig',
  'Oversay_0.2.0_x64_en-US.msi',
  'Oversay_0.2.0_x64_en-US.msi.sig',
  'Oversay_0.2.0_universal.dmg',
  'Oversay_portable_x64.exe',
]
const args = (over = {}) => ({
  files: FILES,
  sig: (f) => `SIG(${f})\n`,
  version: '0.2.0',
  notes: 'Fixes',
  base: 'https://example.test/feed/',
  date: new Date('2026-10-21T12:00:00.123Z'),
  ...over,
})

test('latest.json lists the Mac archive under both architectures and each Windows installer under its kind', () => {
  const j = latestJson(args())
  assert.deepEqual(Object.keys(j.platforms), ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64-msi', 'windows-x86_64-nsis'])
  assert.equal(j.platforms['darwin-x86_64'].url, 'https://example.test/feed/Oversay.app.tar.gz')
  assert.equal(j.platforms['darwin-aarch64'].signature, 'SIG(Oversay.app.tar.gz.sig)')
  assert.equal(j.platforms['windows-x86_64-nsis'].url, 'https://example.test/feed/Oversay_0.2.0_x64-setup.exe')
  assert.equal(j.version, '0.2.0')
  assert.equal(j.notes, 'Fixes')
  assert.equal(j.pub_date, '2026-10-21T12:00:00Z')
})

test('latest.json carries the release page for builds that cannot install, only when given', () => {
  assert.equal(latestJson(args({ page: 'https://example.test/r/v0.2.0' })).release_page, 'https://example.test/r/v0.2.0')
  assert.equal('release_page' in latestJson(args()), false)
})

test('latest.json never lists plain windows-x86_64, so the portable exe finds nothing to install', () => {
  assert.equal(latestJson(args()).platforms['windows-x86_64'], undefined)
})

test('a package without its .sig is left out, and no signed package at all is an error', () => {
  const j = latestJson(args({ files: FILES.filter((f) => f !== 'Oversay_0.2.0_x64_en-US.msi.sig') }))
  assert.equal(j.platforms['windows-x86_64-msi'], undefined)
  assert.throws(() => latestJson(args({ files: ['Oversay_0.2.0_universal.dmg'] })), /no signed update packages/)
})

test('file names are escaped in URLs', () => {
  const files = ['Oversay_0.2.0_x64_en-US.msi', 'Oversay_0.2.0_x64_en-US.msi.sig']
  assert.equal(latestJson(args({ files, base: 'https://h/a b' })).platforms['windows-x86_64-msi'].url, 'https://h/a b/Oversay_0.2.0_x64_en-US.msi')
})

test('without a feed the build never checks for updates; without a key it makes no update packages', () => {
  const c = buildConfig({})
  assert.deepEqual(c, {})
  assert.equal(describe(c), 'This build never checks for updates and makes no update packages.')
})

test('a feed and key make the build check that feed and refuse unsigned or downgraded versions', () => {
  const c = buildConfig({ OVERSAY_UPDATE_FEED: 'https://h/latest.json', OVERSAY_UPDATE_PUBKEY: 'KEY', TAURI_SIGNING_PRIVATE_KEY: 'x' })
  assert.deepEqual(c.plugins.updater.endpoints, ['https://h/latest.json'])
  assert.equal(c.plugins.updater.pubkey, 'KEY')
  assert.equal(c.plugins.updater.requireSignedVersion, true)
  assert.equal(c.bundle.createUpdaterArtifacts, true)
  assert.equal(describe(c), 'This build checks https://h/latest.json and makes signed update packages.')
})

test('a feed needs its key, and must be https', () => {
  assert.throws(() => buildConfig({ OVERSAY_UPDATE_FEED: 'https://h/latest.json' }), /go together/)
  assert.throws(() => buildConfig({ OVERSAY_UPDATE_PUBKEY: 'KEY' }), /go together/)
  assert.throws(() => buildConfig({ OVERSAY_UPDATE_FEED: 'http://h/latest.json', OVERSAY_UPDATE_PUBKEY: 'KEY' }), /https/)
  assert.deepEqual(buildConfig({ OVERSAY_UPDATE_FEED: ' ', OVERSAY_UPDATE_PUBKEY: '' }), {})
})

test('a version bump regenerates the skill files, which embed the version', () => {
  const calls = []
  regenerateSkills((cmd, args) => calls.push([cmd, ...args]))
  assert.deepEqual(calls, [['make', 'skills']])
})
