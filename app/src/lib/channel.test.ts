import { beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'

type Handler = (event: { payload: unknown }) => void

const handlers = new Map<string, Handler>()
const unlisten = vi.fn()
let reply: (value: unknown) => void

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, handler: Handler) => {
    handlers.set(name, handler)
    return unlisten
  }),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => new Promise((resolve) => (reply = resolve))),
}))

// A minimal page, so the store can follow the window being hidden and shown.
const page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
;(globalThis as { document?: unknown }).document = page

const { RESYNC_EVENT, channel } = await import('./channel')

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const emit = (name: string, version: number, value: unknown) =>
  handlers.get(`state:${name}`)!({ payload: { version, value } })

describe('channel', () => {
  beforeEach(() => {
    handlers.clear()
    unlisten.mockClear()
  })

  it('starts with the initial value, then the current value from Rust', async () => {
    const store = channel('counter', 0)
    const values: number[] = []
    const stop = store.subscribe((v) => values.push(v))
    await flush()
    reply({ version: 3, value: 3 })
    await flush()
    expect(values).toEqual([0, 3])
    stop()
  })

  it('applies broadcast updates', async () => {
    const store = channel('counter', 0)
    const stop = store.subscribe(() => {})
    await flush()
    reply(null)
    await flush()
    emit('counter', 1, 1)
    emit('counter', 2, 2)
    expect(get(store)).toBe(2)
    stop()
  })

  it('ignores a current-value reply older than an event already seen', async () => {
    const store = channel('counter', 0)
    const values: number[] = []
    const stop = store.subscribe((v) => values.push(v))
    await flush()
    emit('counter', 5, 5)
    reply({ version: 4, value: 4 })
    await flush()
    expect(values).toEqual([0, 5])
    stop()
  })

  it('stops listening when the last subscriber leaves', async () => {
    const stop = channel('counter', 0).subscribe(() => {})
    await flush()
    stop()
    // Both listeners: the channel's updates and the resync request.
    expect(unlisten).toHaveBeenCalledTimes(2)
  })

  it('fetches the current value again when the window is shown, catching up on missed updates', async () => {
    const store = channel('session', 'old')
    const stop = store.subscribe(() => {})
    await flush()
    reply({ version: 1, value: 'old' })
    await flush()
    // Hidden meanwhile: versions 2 and 3 were broadcast but never arrived.
    page.dispatchEvent(new Event('visibilitychange'))
    await flush()
    reply({ version: 3, value: 'new' })
    await flush()
    expect(get(store)).toBe('new')
    stop()
  })

  it('fetches the current value again when Rust says the window may have missed updates', async () => {
    const store = channel('session', 'old')
    const stop = store.subscribe(() => {})
    await flush()
    reply({ version: 1, value: 'old' })
    await flush()
    handlers.get('state-resync')!({ payload: null })
    await flush()
    reply({ version: 4, value: 'new' })
    await flush()
    expect(get(store)).toBe('new')
    stop()
  })

  it('names the resync event as Rust does', () => {
    // Same value as resync_event_name_matches_the_frontend in src-tauri/src/state.rs.
    expect(RESYNC_EVENT).toBe('state-resync')
  })
})
