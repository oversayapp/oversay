import { describe, expect, it } from 'vitest'
import type { DeckEntry } from '../decks/store'
import type { Workspace } from '../workspaces/workspaces'
import { HOME_TILES, homeSections } from './home'
import type { LibraryRef } from './groups'

const deck = (n: string): LibraryRef => ({ kind: 'deck', at: 0, deck: { path: `/d/${n}`, id: `d_${n}`, name: n } as DeckEntry })
const space = (n: string): LibraryRef => ({ kind: 'workspace', at: 0, workspace: { id: `w_${n}`, name: n } as Workspace })
const name = (r: LibraryRef) => (r.kind === 'deck' ? r.deck.name : r.workspace.name)
const groups = (recent: LibraryRef[], pinned: LibraryRef[] = []) => ({ recent, pinned, week: [], unsorted: [] })

describe('what Home shows (epic 036 (#54))', () => {
  it('on a first run shows nothing but the welcome: no lists, no pick-up', () => {
    expect(homeSections(groups([]), { decks: 0, workspaces: 0 })).toEqual({ pickUp: null, recent: [], pinned: [], nudge: false })
  })

  it('picks up at the last deck opened, and lists Recent without it', () => {
    const s = homeSections(groups([space('w1'), deck('a'), deck('b'), space('w2')]), { decks: 2, workspaces: 2 })
    expect(s.pickUp && name(s.pickUp)).toBe('a')
    expect(s.recent.map(name)).toEqual(['w1', 'b', 'w2'])
  })

  it('shows only a few things however many decks there are', () => {
    const many = Array.from({ length: 60 }, (_, i) => deck(`d${i}`))
    const s = homeSections(groups(many.slice(0, 10), many.slice(10, 40)), { decks: 60, workspaces: 12 })
    expect(s.recent).toHaveLength(HOME_TILES)
    expect(s.pinned).toHaveLength(HOME_TILES)
    expect(s.nudge).toBe(false)
  })

  it('with one deck and no workspace, nudges towards a first workspace', () => {
    expect(homeSections(groups([deck('a')]), { decks: 1, workspaces: 0 }).nudge).toBe(true)
    expect(homeSections(groups([deck('a')]), { decks: 1, workspaces: 1 }).nudge).toBe(false)
  })

  it('a pinned item is not listed twice when it is also Recent', () => {
    const a = deck('a')
    const s = homeSections(groups([deck('x'), a], [a]), { decks: 2, workspaces: 0 })
    expect(s.pinned.map(name)).toEqual(['a'])
    expect(s.recent.map(name)).toEqual([])
  })
})
