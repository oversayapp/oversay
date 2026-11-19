import { describe, expect, it, vi } from 'vitest'
import { writable } from 'svelte/store'
const invoke = vi.fn(async (..._args: unknown[]) => null)
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }))
const { TRAY_EVENT, checkTrayChoice, pinnedDecks, syncTrayTitle, trayTitle } = await import('./tray')
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
  it('leaves the text as it is when a deck is closed and opened again within a second (Rust keeps it; ADR 0051)', () => {
    vi.useFakeTimers()
    const titles = () => invoke.mock.calls.filter(([cmd]) => cmd === 'set_tray_title').map(([, a]) => (a as { title: string }).title)
    const source = writable<SessionState | null>({ ...base, status: 'ready', events: [] })
    const stop = syncTrayTitle(source)
    vi.advanceTimersByTime(1000)
    source.set(null) // closed while Ready
    source.set({ ...base, status: 'ready', events: [] })
    vi.advanceTimersByTime(1000)
    expect(titles()).toEqual(['Ready'])
    stop()
    vi.useRealTimers()
  })
})

describe('syncTrayTitle when the run ends', () => {
  it('clears the text beside the icon when the deck stops, and keeps none for a preview', () => {
    vi.useFakeTimers()
    invoke.mockClear()
    const titles = () => invoke.mock.calls.filter(([cmd]) => cmd === 'set_tray_title').map(([, a]) => (a as { title: string }).title)
    const source = writable<SessionState | null>({ ...base, status: 'ready', events: [] })
    const stop = syncTrayTitle(source)
    vi.advanceTimersByTime(1000)
    source.set({ ...base, status: 'finished' })
    vi.advanceTimersByTime(1000)
    source.set({ ...base, preview: true })
    vi.advanceTimersByTime(2000)
    expect(titles()).toEqual(['Ready', ''])
    stop()
    vi.useRealTimers()
  })
})

describe('the pinned decks for Show a deck ▸ (ADR 0051)', () => {
  const deck = (path: string, id: string, name: string) => ({ path, id, name })
  const decks = [deck('a/deck.md', 'd_a', 'Alpha'), deck('b/deck.md', 'd_b', 'Beta'), deck('c/deck.md', '', 'Gamma')]

  it('lists the pinned decks newest pin first, by path, skipping workspaces and decks that have gone', () => {
    const pins = [
      { kind: 'deck' as const, path: 'a/deck.md', id: 'd_a', at: '2026-11-01T10:00:00Z' },
      { kind: 'deck' as const, path: 'moved/deck.md', id: 'd_b', at: '2026-11-03T10:00:00Z' },
      { kind: 'deck' as const, path: 'c/deck.md', at: '2026-11-02T10:00:00Z' },
      { kind: 'deck' as const, path: 'gone/deck.md', at: '2026-11-04T10:00:00Z' },
      { kind: 'note' as const, path: 'n.md', at: '2026-11-05T10:00:00Z' },
    ]
    expect(pinnedDecks(pins, decks)).toEqual([
      { id: 'b/deck.md', name: 'Beta' },
      { id: 'c/deck.md', name: 'Gamma' },
      { id: 'a/deck.md', name: 'Alpha' },
    ])
    expect(pinnedDecks([], decks)).toEqual([])
    expect(pinnedDecks(pins, null)).toEqual([])
  })
})

describe('a choice from the menu', () => {
  it('is named as Rust names it, and checked, not trusted', () => {
    // Same name as TRAY_EVENT in src-tauri/src/tray.rs.
    expect(TRAY_EVENT).toBe('tray-choice')
    expect(checkTrayChoice({ kind: 'settings' })).toEqual({ kind: 'settings' })
    expect(checkTrayChoice({ kind: 'library' })).toEqual({ kind: 'library' })
    expect(checkTrayChoice({ kind: 'deck', id: 'a/deck.md' })).toEqual({ kind: 'deck', id: 'a/deck.md' })
    expect(checkTrayChoice({ kind: 'deck' })).toBeNull()
    expect(checkTrayChoice({ kind: 'delete' })).toBeNull()
    expect(checkTrayChoice('settings')).toBeNull()
  })
})
