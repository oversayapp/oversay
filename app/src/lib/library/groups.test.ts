import { describe, expect, it } from 'vitest'
import { libraryGroups, type GroupInput } from './groups'
import type { DeckEntry } from '../decks/store'
import type { Workspace } from '../workspaces/workspaces'

const NOW = Date.parse('2026-11-18T12:00:00Z')
const DAY = 86400000
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString()

const deck = (n: string, daysAgo = 30, extra: Partial<DeckEntry> = {}): DeckEntry => ({
  path: `/d/${n}/deck.md`, id: `d_${n}`, name: n, modifiedMs: NOW - daysAgo * DAY, audience: '', project: '', tags: [], cards: 3, seconds: 0, timingOff: false, bar: [], ...extra,
})
const space = (id: string, decks: string[] = []): Workspace => ({ id, name: id, folder: id, tags: [], decks, when: '', where: '', notes: '', problem: null })

const input = (over: Partial<GroupInput>): GroupInput => ({
  decks: [], workspaces: [], pins: [], opened: [], workspaceNav: { pins: [], opened: [] }, now: NOW, ...over,
})

describe('libraryGroups', () => {
  it('lists recent decks and workspaces together, newest first', () => {
    const g = libraryGroups(input({
      decks: [deck('a'), deck('b')],
      workspaces: [space('w_1')],
      opened: [{ kind: 'deck', path: '/d/a/deck.md', id: 'd_a', at: iso(3) }, { kind: 'deck', path: '/d/b/deck.md', id: 'd_b', at: iso(1) }],
      workspaceNav: { pins: [], opened: [{ id: 'w_1', at: iso(2) }] },
    }))
    expect(g.recent.map((r) => (r.kind === 'deck' ? r.deck.name : r.workspace.id))).toEqual(['b', 'w_1', 'a'])
  })

  it('lists pinned decks and workspaces together, newest pin first, skipping what has gone', () => {
    const g = libraryGroups(input({
      decks: [deck('a')],
      workspaces: [space('w_1')],
      pins: [{ kind: 'deck', path: '/d/a/deck.md', id: 'd_a', at: iso(5) }, { kind: 'deck', path: '/d/gone/deck.md', at: iso(1) }],
      workspaceNav: { pins: [{ id: 'w_1', at: iso(2) }, { id: 'w_gone', at: iso(1) }], opened: [] },
    }))
    expect(g.pinned.map((r) => (r.kind === 'deck' ? r.deck.name : r.workspace.id))).toEqual(['w_1', 'a'])
  })

  it('This week holds decks changed in the last 7 days and workspaces opened in them', () => {
    const g = libraryGroups(input({
      decks: [deck('new', 2), deck('old', 20)],
      workspaces: [space('w_1'), space('w_2')],
      workspaceNav: { pins: [], opened: [{ id: 'w_1', at: iso(1) }, { id: 'w_2', at: iso(9) }] },
    }))
    expect(g.week.map((r) => (r.kind === 'deck' ? r.deck.name : r.workspace.id))).toEqual(['w_1', 'new'])
  })

  it('Unsorted is the decks in no workspace, and only while a workspace exists', () => {
    const decks = [deck('a'), deck('b')]
    expect(libraryGroups(input({ decks, workspaces: [space('w_1', ['d_a'])] })).unsorted.map((d) => d.name)).toEqual(['b'])
    expect(libraryGroups(input({ decks, workspaces: [] })).unsorted).toEqual([])
    expect(libraryGroups(input({ decks, workspaces: [space('w_1', ['d_a', 'd_b'])] })).unsorted).toEqual([])
  })

  it('leaves out decks that could not be read', () => {
    const g = libraryGroups(input({ decks: [deck('a', 1, { unreadable: true })], workspaces: [space('w_1')] }))
    expect(g.week).toEqual([])
    expect(g.unsorted).toEqual([])
  })
})
