import { describe, expect, it, vi } from 'vitest'
import { writable } from 'svelte/store'
const invoke = vi.fn(async (..._args: unknown[]) => null)
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }))
const { syncTrayTitle, trayTitle } = await import('./tray')
import type { SessionState } from './clock'

const base: SessionState = {
  status: 'running',
  index: 0,
  paused: false,
  plan: [
    { segmentId: 's_1', name: 'Intro', plannedSeconds: 120, openEnded: false },
    { segmentId: 's_2', name: 'Demo', plannedSeconds: 300, openEnded: true },
  ],
  events: [{ at: '2026-10-20T14:00:00.000Z', type: 'start' }],
  talk: null,
  shortcuts: {},
  unavailable: [],
}
const at = (t: string) => Date.parse(`2026-10-20T${t}Z`)

describe('trayTitle', () => {
  it('shows time left, then time over, on a fixed segment', () => {
    expect(trayTitle(base, at('14:00:30'))).toBe('1:30')
    expect(trayTitle(base, at('14:02:20'))).toBe('+0:20')
  })

  it('counts up on an open-ended segment, and names the other states', () => {
    const demo = { ...base, index: 1, events: [...base.events, { at: '2026-10-20T14:01:00.000Z', type: 'next' as const }] }
    expect(trayTitle(demo, at('14:02:10'))).toBe('1:10 ↑')
    expect(trayTitle({ ...base, status: 'ready', events: [] }, at('14:00:00'))).toBe('Ready')
    expect(trayTitle({ ...base, paused: true }, at('14:00:30'))).toBe('Paused')
  })
})

describe('syncTrayTitle', () => {
  it('gives a session opened after a closed one its text, even if the text is the same', () => {
    vi.useFakeTimers()
    const titles = () => invoke.mock.calls.filter(([cmd]) => cmd === 'set_tray_title').map(([, a]) => (a as { title: string }).title)
    const source = writable<SessionState | null>({ ...base, status: 'ready', events: [] })
    const stop = syncTrayTitle(source)
    vi.advanceTimersByTime(1000)
    source.set(null) // closed while Ready
    source.set({ ...base, status: 'ready', events: [] })
    vi.advanceTimersByTime(1000)
    expect(titles()).toEqual(['Ready', 'Ready'])
    stop()
    vi.useRealTimers()
  })
})
