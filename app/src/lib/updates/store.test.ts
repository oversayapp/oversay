import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
let support = { enabled: true, kind: 'installer' }
let outcome: unknown = { state: 'upToDate' }
let installError: string | null = null
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string) => {
    calls.push(cmd)
    if (cmd === 'update_support') return support
    if (cmd === 'check_for_update') return outcome
    if (cmd === 'install_update' && installError) throw installError
    if (cmd === 'read_config_file') return null
    return null
  },
}))
vi.mock('@tauri-apps/api/app', () => ({ setTheme: async () => {} }))
vi.mock('../log', () => ({ logAction: () => {}, logProblem: () => {} }))

const { settings, loadSettings, setUpdateSettings } = await import('../settings/store')
const { updates, loadUpdateSupport, checkAtStartup, checkNow, installUpdate, supported } = await import('./store')

const found = { state: 'available', kind: 'installer', release: { version: '0.3.0', notes: 'Faster', date: null, page: null } }
const requests = () => calls.filter((c) => c === 'check_for_update').length

beforeEach(async () => {
  calls.length = 0
  support = { enabled: true, kind: 'installer' }
  outcome = { state: 'upToDate' }
  installError = null
  await loadSettings()
  await loadUpdateSupport()
  updates.set({ found: null, message: null, phase: 'idle' })
})

describe('checking at start-up', () => {
  it('asks once, shows an update that is found, and remembers when', async () => {
    outcome = found
    await checkAtStartup()
    expect(requests()).toBe(1)
    expect(get(updates).found?.version).toBe('0.3.0')
    expect(get(settings).lastUpdateCheck).toBeTruthy()
  })

  it('does not ask again within the interval', async () => {
    await checkAtStartup()
    await checkAtStartup()
    expect(requests()).toBe(1)
  })

  it('makes no request with automatic checking off', async () => {
    await setUpdateSettings({ auto: false })
    await checkAtStartup()
    expect(requests()).toBe(0)
  })

  it('makes no request in a build with no feed', async () => {
    support = { enabled: false, kind: 'installer' }
    await loadUpdateSupport()
    expect(get(supported)).toBe(false)
    await checkAtStartup()
    await checkNow()
    expect(requests()).toBe(0)
  })

  it('is silent when the feed is unreachable', async () => {
    outcome = { state: 'unreachable' }
    await checkAtStartup()
    expect(get(updates).message).toBeNull()
  })

  it('tries again at the next start when the feed was unreachable', async () => {
    outcome = { state: 'unreachable' }
    await checkAtStartup()
    expect(get(settings).lastUpdateCheck).toBeUndefined()
  })

  it('does not count a check that a session refused', async () => {
    outcome = { state: 'busy' }
    await checkAtStartup()
    expect(get(settings).lastUpdateCheck).toBeUndefined()
  })
})

describe('checking by hand', () => {
  it('works with automatic checking off and says what it found', async () => {
    await setUpdateSettings({ auto: false })
    await checkNow()
    expect(requests()).toBe(1)
    expect(get(updates).message).toMatch(/up to date/i)
  })
})

describe('installing', () => {
  it('asks Rust to install the update found', async () => {
    outcome = found
    await checkNow()
    await installUpdate()
    expect(calls).toContain('install_update')
  })

  it('says why when the install fails, and goes back to idle', async () => {
    outcome = found
    await checkNow()
    installError = 'the update wasn’t installed: bad signature'
    await installUpdate()
    expect(get(updates).phase).toBe('idle')
    expect(get(updates).message).toMatch(/bad signature/)
    expect(get(updates).found?.version).toBe('0.3.0')
  })
})
