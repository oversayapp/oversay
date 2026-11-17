// Tests for make setup and make doctor on Linux: node --test scripts/ (make check runs it).
// They run the real scripts against a stand-in Linux: uname, distrobox, podman, pkg-config and
// ldconfig are small stubs on PATH that log what they were asked to do, so the Steam Deck's
// route (a distrobox, no sudo) is checked from any machine.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const scripts = dirname(fileURLToPath(import.meta.url))

const STUBS = {
  uname: `case "$1" in -m) echo x86_64 ;; *) echo Linux ;; esac`,
  distrobox: `echo "distrobox $*" >> "$STUB_LOG"
case "$1" in
  version) echo "distrobox: 1.8" ;;
  enter) case "$*" in *linux.sh\\ missing-packages) echo "$MISSING_PKGS" ;; esac ;;
esac
exit 0`,
  podman: `case "$*" in "container inspect oversay-dev") [ "$BOX_EXISTS" = 1 ]; exit ;; esac
echo "podman $*" >> "$STUB_LOG"`,
  sudo: `echo "sudo $*" >> "$STUB_LOG"; exit 1`,
  pacman: `echo "pacman $*" >> "$STUB_LOG"; exit 1`,
  'pkg-config': `for m in $PC_MISSING; do [ "$2" = "$m" ] && exit 1; done; echo 2.0`,
  ldconfig: `echo "	libxdo.so (libc6,x86-64) => /usr/lib/x86_64-linux-gnu/libxdo.so"
echo "	libclang-18.so.18 (libc6,x86-64) => /usr/lib/x86_64-linux-gnu/libclang-18.so.18"`,
}

// A stand-in Linux. os: the os-release ID; mise: whether mise is installed.
function linux({ os = 'steamos', mise = true, box = false, missingPkgs = '', pcMissing = '', apt = false, badCurl = false, env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'oversay-setup-'))
  const bin = join(dir, 'bin')
  mkdirSync(bin)
  const stubs = { ...STUBS }
  if (mise) stubs.mise = `echo "mise $*" >> "$STUB_LOG"; [ "$1" = "--version" ] && echo "2026.11.0 linux-x64"; exit 0`
  // A download that is not what was pinned.
  if (badCurl) stubs.curl = `while [ $# -gt 0 ]; do [ "$1" = -o ] && echo tampered > "$2"; shift; done; exit 0`
  if (apt) stubs['apt-get'] = `echo "apt-get $*" >> "$STUB_LOG"; exit 1`
  for (const [name, body] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  writeFileSync(join(dir, 'os-release'), `NAME="Linux"\nID=${os}\n`)
  const log = join(dir, 'log')
  const run = (script, ...args) => {
    const [cmd, argv] = script === 'make' ? ['make', ['-C', join(scripts, '..'), ...args]] : ['bash', [join(scripts, script), ...args]]
    const r = spawnSync(cmd, argv, {
      encoding: 'utf8',
      env: {
        PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`,
        HOME: join(dir, 'home'),
        SHELL: '/bin/bash',
        OVERSAY_OS_RELEASE: join(dir, 'os-release'),
        STUB_LOG: log,
        BOX_EXISTS: box ? '1' : '0',
        MISSING_PKGS: missingPkgs,
        PC_MISSING: pcMissing,
        ...env,
      },
    })
    const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : []
    return { code: r.status, out: r.stdout + r.stderr, calls }
  }
  run.home = join(dir, 'home')
  return run
}

const mutating = (calls) => calls.filter((c) => /^(sudo|pacman|apt-get|podman|distrobox (create|enter)|mise (install|trust))/.test(c))

test('on SteamOS, make setup puts the build libraries in the oversay-dev box and carries on inside it', () => {
  const r = linux({ missingPkgs: 'libasound2-dev libxdo-dev' })('setup.sh')
  assert.equal(r.code, 0, r.out)
  const steps = mutating(r.calls)
  assert.match(steps[0], /^distrobox create --yes --no-entry --name oversay-dev --image quay\.io\/toolbx\/ubuntu-toolbox:24\.04$/)
  assert.equal(steps[1], 'distrobox enter oversay-dev -- true')
  assert.match(steps[2], /^distrobox enter oversay-dev -- .*\/scripts\/linux\.sh missing-packages$/)
  assert.match(steps[3], /^podman exec --user root oversay-dev sh -c .* sh libasound2-dev libxdo-dev$/)
  assert.match(steps[4], /^distrobox enter oversay-dev -- .*\/scripts\/setup\.sh$/)
  assert.equal(steps.length, 5)
  assert.ok(!r.calls.some((c) => /^(sudo|pacman)/.test(c)), 'never sudo or pacman on the host')
})

test('on SteamOS, a second make setup changes nothing on the host', () => {
  const r = linux({ box: true })('setup.sh')
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /already there: mise oversay-dev box build libraries/)
  assert.match(r.out, /installed: {5}nothing/)
  // Only the read-only check, then the hand-over to the same script inside the box.
  assert.deepEqual(mutating(r.calls).map((c) => c.replace(/ \/.*\//, ' …/')), [
    'distrobox enter oversay-dev -- …/linux.sh missing-packages',
    'distrobox enter oversay-dev -- …/setup.sh',
  ])
})

test('on SteamOS, DRY=1 shows the plan and changes nothing', () => {
  const deck = linux({ mise: false })
  const r = deck('setup.sh', '--dry-run')
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /\[dry-run\] download mise-v[\d.]+-linux-x64-musl\.tar\.gz .* install it as ~\/\.local\/bin\/mise/)
  assert.match(r.out, /\[dry-run\] distrobox create --yes --no-entry --name oversay-dev/)
  assert.match(r.out, /\[dry-run\] install in the box: build-essential pkg-config git curl lsof procps libwebkit2gtk-4\.1-dev/)
  assert.match(r.out, /\[dry-run\] continue inside the box/)
  assert.deepEqual(mutating(r.calls), [])
  assert.ok(!existsSync(deck.home), 'nothing written to the home folder')
})

test('on SteamOS, the hint for activating mise names its home-folder path', () => {
  const r = linux({ mise: false })('setup.sh', '--dry-run')
  assert.match(r.out, /eval "\$\(~\/\.local\/bin\/mise activate bash\)"/)
})

test('make setup refuses a mise download that does not match the pinned SHA-256', () => {
  const deck = linux({ mise: false, badCurl: true })
  const r = deck('setup.sh')
  assert.equal(r.code, 1)
  assert.match(r.out, /does not match its pinned SHA-256; nothing was installed/)
  assert.ok(!existsSync(join(deck.home, '.local/bin/mise')))
})

test('elsewhere on Linux, make setup stops on a missing library and names the command, without running it', () => {
  const r = linux({ os: 'ubuntu', apt: true, pcMissing: 'webkit2gtk-4.1' })('setup.sh')
  assert.equal(r.code, 1)
  assert.match(r.out, /MISSING {2}webkit2gtk {3}run: sudo apt-get install libwebkit2gtk-4\.1-dev/)
  assert.match(r.out, /never uses sudo/)
  assert.deepEqual(mutating(r.calls), [])
})

test('make doctor lists every library and exits 0 when all are there', () => {
  const r = linux({ os: 'ubuntu' })('linux.sh', 'check-libs')
  assert.equal(r.code, 0, r.out)
  for (const name of ['cc', 'pkg-config', 'webkit2gtk', 'appindicator', 'librsvg', 'alsa', 'openssl', 'libxdo', 'libclang', 'lsof']) {
    assert.match(r.out, new RegExp(`ok +${name} `))
  }
})

test('in the box, make doctor names a missing library and the command that fixes it, and exits 1', () => {
  // CONTAINER_ID is how distrobox marks its boxes.
  const r = linux({ pcMissing: 'alsa', env: { CONTAINER_ID: 'oversay-dev' } })('doctor.sh')
  assert.equal(r.code, 1)
  assert.match(r.out, /Build libraries \(in the oversay-dev box\):/)
  assert.match(r.out, /MISSING {2}alsa {9}run: make setup from the Deck's own terminal, not inside the box \(installs libasound2-dev in it\)/)
  assert.match(r.out, /ok +webkit2gtk /)
})

test('on the Deck before make setup, make doctor says the box is missing and exits 1', () => {
  const r = linux()('doctor.sh')
  assert.equal(r.code, 1)
  assert.match(r.out, /MISSING {2}devbox {7}run: make setup \(creates the oversay-dev box\)/)
})

test('on SteamOS, make doctor runs inside the box once it exists', () => {
  const r = linux({ box: true })('doctor.sh')
  assert.match(r.calls.at(-1), /^distrobox enter oversay-dev -- .*\/scripts\/doctor\.sh$/)
})

test('make runs inside the box only on a SteamOS host whose box exists', () => {
  const name = (opts) => linux(opts)('linux.sh', 'devbox-to-enter').out.trim()
  assert.equal(name({ box: true }), 'oversay-dev')
  assert.equal(name({ box: false }), '')
  assert.equal(name({ box: true, os: 'ubuntu' }), '')
  assert.equal(name({ box: true, os: 'ubuntu', env: { OVERSAY_DEVBOX: '1' } }), 'oversay-dev')
  assert.equal(name({ box: true, env: { CONTAINER_ID: 'oversay-dev' } }), '')
})

test("on the Deck's own terminal, make runs the targets that build or run the app inside the box", () => {
  const deck = linux({ box: true })
  assert.match(deck('make', '-n', 'dev', 'PORT=1430').out, /^MAKEFLAGS= distrobox enter oversay-dev -- make -C '.*' dev PORT=1430$/m)
  assert.match(deck('make', '-n', 'doctor').out, /^MAKEFLAGS= distrobox enter oversay-dev -- make -C '.*' doctor *$/m)
  assert.match(deck('make', '-n', 'setup').out, /^scripts\/setup\.sh *$/m)
  assert.match(deck('make', '-n').out, /^grep -E/m, 'a bare make still lists the targets')
  // Targets that need gh or claude, not the build libraries, stay on the host.
  assert.doesNotMatch(deck('make', '-n', 'fetch').out, /distrobox/)
  assert.match(deck('make', '-n', 'fetch').out, /scripts\/fetch-builds\.sh/)
  // The jobserver's file descriptors don't exist inside the box.
  assert.match(deck('make', '-n', '-j2', 'check').out, /^MAKEFLAGS= distrobox enter/m)
  // In the box, or without one, make runs the targets itself.
  assert.doesNotMatch(linux({ box: false })('make', '-n', 'dev').out, /distrobox/)
  assert.doesNotMatch(linux({ box: true, env: { CONTAINER_ID: 'oversay-dev' } })('make', '-n', 'dev').out, /distrobox/)
})

test('on a Mac, a stray OVERSAY_BOX in the environment changes nothing', () => {
  const r = spawnSync('make', ['-n', '-C', join(scripts, '..'), 'doctor'], { encoding: 'utf8', env: { ...process.env, OVERSAY_BOX: 'x', DEVBOX: 'x' } })
  if (process.platform === 'darwin') assert.doesNotMatch(r.stdout, /distrobox/)
})
