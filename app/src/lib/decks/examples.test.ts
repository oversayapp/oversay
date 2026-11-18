import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => {
  // Plain stand-ins for svelte/store, which can't be imported inside a hoisted block.
  const store = <T,>(value: T) => {
    const subs = new Set<(v: T) => void>()
    return {
      set: (v: T) => {
        value = v
        subs.forEach((f) => f(v))
      },
      subscribe: (f: (v: T) => void) => {
        subs.add(f)
        f(value)
        return () => subs.delete(f)
      },
    }
  }
  return {
    invoke: vi.fn(),
    setPin: vi.fn(),
    seedOpened: vi.fn(),
    markInstalled: vi.fn(),
    loadWorkspaces: vi.fn(),
    settings: store<{ exampleDecksInstalled?: boolean }>({}),
    decks: store<{ id: string; path: string }[] | null>(null),
  }
})
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => m.invoke(...a) }))
vi.mock('../settings/store', () => ({
  settings: m.settings,
  settingsReadable: true,
  markKnown: vi.fn(),
  markExampleDecksInstalled: () => m.markInstalled(),
  setPin: (...a: unknown[]) => m.setPin(...a),
  seedOpened: (...a: unknown[]) => m.seedOpened(...a),
}))
vi.mock('../workspaces/store', () => ({ loadWorkspaces: () => m.loadWorkspaces() }))
vi.mock('./store', () => ({
  decks: m.decks,
  loadDecks: async () => m.decks.set([
    { id: 'd_exinterv', path: '/Decks/Interview/deck.md' },
    { id: 'd_exsemin', path: '/Decks/Bees/deck.md' },
    { id: 'd_exconf', path: '/Decks/Notes/deck.md' },
    { id: 'd_exwelcome', path: '/Decks/Welcome/deck.md' },
  ]),
}))

import { EXAMPLE_PINNED_ID, installExampleDecks, installExampleDecksOnFirstRun } from './examples'

describe('the example decks on the first run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.settings.set({})
    m.invoke.mockResolvedValue(['/Decks/Interview/deck.md'])
  })

  it('reads the example workspaces in and pins the interview deck, once', async () => {
    await installExampleDecksOnFirstRun()
    expect(m.loadWorkspaces).toHaveBeenCalled()
    expect(m.setPin).toHaveBeenCalledWith('deck', '/Decks/Interview/deck.md', true, EXAMPLE_PINNED_ID)
    expect(m.markInstalled).toHaveBeenCalled()
  })

  it('does nothing after the first run, so deleted examples stay deleted', async () => {
    m.settings.set({ exampleDecksInstalled: true })
    await installExampleDecksOnFirstRun()
    expect(m.invoke).not.toHaveBeenCalled()
    expect(m.setPin).not.toHaveBeenCalled()
  })

  it('puts the three unpinned examples in Recent on the first run, Welcome first', async () => {
    await installExampleDecksOnFirstRun()
    expect(m.seedOpened).toHaveBeenCalledTimes(1)
    expect(m.seedOpened).toHaveBeenCalledWith([
      { path: '/Decks/Welcome/deck.md', id: 'd_exwelcome' },
      { path: '/Decks/Notes/deck.md', id: 'd_exconf' },
      { path: '/Decks/Bees/deck.md', id: 'd_exsemin' },
    ])
  })

  it('does not touch Recent after the first run, or when examples are restored from Settings', async () => {
    m.settings.set({ exampleDecksInstalled: true })
    await installExampleDecksOnFirstRun()
    await installExampleDecks()
    expect(m.seedOpened).not.toHaveBeenCalled()
  })
})
