import { describe, expect, it } from 'vitest'
import {
  isPinned,
  parseQuickSeen,
  seenRenamed,
  withKnown,
  withListed,
  withoutFresh,
  OPENED_KEPT,
  parseOpened,
  parsePins,
  parseQuickFavourites,
  starsAsPins,
  pinnedFirst,
  recentOf,
  withOpened,
  withoutPath,
  withPathRenamed,
  withPin,
  withQuickFavourite,
  withDecksFollowed,
} from './quick'

const items = ['/n/a.md', '/n/b.md', '/n/c.md', '/n/d.md'].map((path) => ({ path }))

describe('pins', () => {
  it('pins an item as the newest pin, once, and unpins it', () => {
    const one = withPin([], 'note', '/n/b.md', true, '1')
    const two = withPin(one, 'note', '/n/d.md', true, '2')
    expect(two.map((p) => p.path)).toEqual(['/n/d.md', '/n/b.md'])
    expect(withPin(two, 'note', '/n/b.md', true, '3').map((p) => p.path)).toEqual(['/n/b.md', '/n/d.md'])
    expect(isPinned(two, 'note', '/n/b.md')).toBe(true)
    expect(isPinned(two, 'talk', '/n/b.md')).toBe(false)
    expect(withPin(two, 'note', '/n/b.md', false, '4').map((p) => p.path)).toEqual(['/n/d.md'])
  })

  it('puts pinned items at the top of their own list, newest pin first', () => {
    const pins = withPin(withPin(withPin([], 'note', '/n/c.md', true, '1'), 'note', '/n/b.md', true, '2'), 'talk', '/n/a.md', true, '3')
    const { items: ordered, pinned } = pinnedFirst(items, pins, 'note')
    expect(ordered.map((i) => i.path)).toEqual(['/n/b.md', '/n/c.md', '/n/a.md', '/n/d.md'])
    expect(pinned).toBe(2)
  })
})

describe('recent', () => {
  it('shows the last three opened that still exist', () => {
    let opened = withOpened([], 'note', '/n/a.md', '1')
    opened = withOpened(opened, 'note', '/n/gone.md', '2')
    opened = withOpened(opened, 'talk', '/n/b.md', '3')
    opened = withOpened(opened, 'note', '/n/c.md', '4')
    opened = withOpened(opened, 'note', '/n/d.md', '5')
    opened = withOpened(opened, 'note', '/n/b.md', '6')
    opened = withOpened(opened, 'note', '/n/a.md', '7')
    expect(recentOf(opened, 'note', items).map((i) => i.path)).toEqual(['/n/a.md', '/n/b.md', '/n/d.md'])
  })

  it('keeps a few of each kind', () => {
    let opened = withOpened([], 'talk', '/t/x', '0')
    for (let i = 0; i < 20; i++) opened = withOpened(opened, 'note', `/n/${i}.md`, String(i))
    expect(opened.filter((o) => o.kind === 'note')).toHaveLength(OPENED_KEPT)
    expect(opened.filter((o) => o.kind === 'talk')).toHaveLength(1)
  })
})

describe('favourites', () => {
  it('stars at the top, once, and takes off', () => {
    const a = { kind: 'note' as const, path: '/n/a.md', name: 'A' }
    const b = { kind: 'note' as const, path: '/n/b.md', name: 'B' }
    const list = withQuickFavourite(withQuickFavourite([], a, true), b, true)
    expect(list).toEqual([b, a])
    expect(withQuickFavourite(list, a, false)).toEqual([b])
  })
})

describe('renames and deletes', () => {
  it('follows a renamed file, and its name', () => {
    const favs = [{ kind: 'note' as const, path: '/n/a.md', name: 'A' }]
    expect(withPathRenamed(favs, '/n/a.md', '/n/z.md', 'Z')).toEqual([{ kind: 'note', path: '/n/z.md', name: 'Z' }])
    const pins = [{ kind: 'note' as const, path: '/n/a.md', at: '1' }]
    expect(withPathRenamed(pins, '/n/a.md', '/n/z.md', 'Z')).toEqual([{ kind: 'note', path: '/n/z.md', at: '1' }])
    expect(withPathRenamed(pins, '/n/q.md', '/n/z.md')).toBe(pins)
  })

  it('drops a deleted file', () => {
    expect(withoutPath(items, '/n/b.md').map((i) => i.path)).toEqual(['/n/a.md', '/n/c.md', '/n/d.md'])
  })
})

describe('reading settings', () => {
  it('keeps only well-formed entries', () => {
    expect(parsePins([{ kind: 'note', path: '/a', at: '1' }, { kind: 'x', path: '/b', at: '1' }, null])).toHaveLength(1)
    expect(parseQuickFavourites([{ kind: 'talk', path: '/a', name: 'A' }, { kind: 'project', path: '/b', name: 'B' }])).toHaveLength(1)
    expect(parseOpened('nope')).toEqual([])
  })
})

describe('new files', () => {
  it('learns what is there on the first listing, so nothing already there is New', () => {
    expect(withListed(undefined, ['/n/a.md', '/n/b.md'])).toEqual({ known: ['/n/a.md', '/n/b.md'], fresh: [] })
  })

  it('marks a file that appears after that as New, newest first, until it is opened', () => {
    let seen = withListed(undefined, ['/n/a.md'])
    seen = withListed(seen, ['/n/a.md', '/n/b.md'])
    seen = withListed(seen, ['/n/a.md', '/n/b.md', '/n/c.md'])
    expect(seen.fresh).toEqual(['/n/c.md', '/n/b.md'])
    expect(withoutFresh(seen, '/n/b.md')?.fresh).toEqual(['/n/c.md'])
  })

  it('forgets a New file once it is gone', () => {
    let seen = withListed(withListed(undefined, []), ['/n/a.md'])
    seen = withListed(seen, [])
    expect(seen).toEqual({ known: [], fresh: [] })
  })

  it("never marks a file Oversay made or renamed itself", () => {
    const seen = withKnown(withListed(undefined, ['/n/a.md']), '/n/mine.md')
    expect(withListed(seen, ['/n/a.md', '/n/mine.md']).fresh).toEqual([])
    expect(withKnown(undefined, '/n/mine.md')).toBeUndefined()
    const renamed = seenRenamed({ known: ['/n/a.md'], fresh: ['/n/a.md'] }, '/n/a.md', '/n/b.md')
    expect(renamed).toEqual({ known: ['/n/b.md'], fresh: ['/n/b.md'] })
  })

  it('reads only what it understands from settings', () => {
    expect(parseQuickSeen({ notes: { known: ['/a', 3], fresh: 'x' }, other: {} })).toEqual({ notes: { known: ['/a'], fresh: [] } })
    expect(parseQuickSeen(null)).toEqual({})
  })
})

describe('starred decks become pins', () => {
  it('pins each starred deck or note once, keeps starred talks, and does nothing when there are none', () => {
    const favs = [
      { kind: 'deck' as const, path: '/D/a.md', name: 'A' },
      { kind: 'talk' as const, path: '/T/t.oversay.json', name: 'T' },
      { kind: 'note' as const, path: '/D/b.md', name: 'B' },
    ]
    const moved = starsAsPins([{ kind: 'deck', path: '/D/b.md', at: 'then' }], favs, 'now')!
    expect(moved.quickFavourites).toEqual([favs[1]])
    expect(moved.pins).toEqual([
      { kind: 'deck', path: '/D/a.md', at: 'now' },
      { kind: 'deck', path: '/D/b.md', at: 'then' },
    ])
    expect(starsAsPins([], [favs[1]], 'now')).toBeNull()
  })
})

describe('pins and Recent go by a deck’s id', () => {
  const D = '/u/Documents/Oversay/Decks'
  const decks = [
    { path: `${D}/Weekly standup 2026-10-25/deck.md`, id: 'd_aaaaaaaa', name: 'Weekly standup' },
    { path: `${D}/Retro 2026-10-24/deck.md`, id: 'd_bbbbbbbb', name: 'Retro' },
    { path: `${D}/Retro 2026-10-25/deck.md`, id: 'd_cccccccc', name: 'Retro' },
  ]
  const at = '2026-10-25T10:00:00Z'

  it('follows a deck renamed or moved in Finder, by its id', () => {
    const pins = [{ kind: 'deck' as const, path: `${D}/Standup 2026-10-25/deck.md`, id: 'd_aaaaaaaa', at }]
    expect(withDecksFollowed(pins, decks)).toEqual([{ ...pins[0], path: decks[0].path }])
  })

  it('gives an entry saved before ids the id of the deck at its path', () => {
    const opened = [{ kind: 'deck' as const, path: decks[1].path, at }]
    expect(withDecksFollowed(opened, decks)).toEqual([{ ...opened[0], id: 'd_bbbbbbbb' }])
  })

  it('finds a deck that was a lone file before it had a folder, when one deck alone has its name', () => {
    const pins = [
      { kind: 'deck' as const, path: `${D}/Weekly standup.md`, at },
      // Two decks are called Retro: which one is meant can't be told, so it is left as it is.
      { kind: 'deck' as const, path: `${D}/Retro.md`, at },
    ]
    expect(withDecksFollowed(pins, decks)).toEqual([{ ...pins[0], path: decks[0].path, id: 'd_aaaaaaaa' }, pins[1]])
  })

  it('leaves what isn’t a deck, or a deck that isn’t listed now, as it is, and returns the same list when nothing changed', () => {
    const list = [
      { kind: 'note' as const, path: `${D}/Weekly standup.md`, at },
      { kind: 'deck' as const, path: `${D}/Gone 2026-10-01/deck.md`, id: 'd_dddddddd', at },
      { kind: 'deck' as const, path: decks[2].path, id: 'd_cccccccc', at },
    ]
    expect(withDecksFollowed(list, decks)).toBe(list)
  })

  it('keeps one entry per deck when two come to name the same one', () => {
    const opened = [
      { kind: 'deck' as const, path: decks[0].path, id: 'd_aaaaaaaa', at },
      { kind: 'deck' as const, path: `${D}/Weekly standup.md`, at: '2026-10-20T10:00:00Z' },
    ]
    expect(withDecksFollowed(opened, decks)).toEqual([opened[0]])
  })

  it('reads an id saved with a pin, and ignores one that isn’t a string', () => {
    expect(parsePins([{ kind: 'deck', path: 'p', at, id: 'd_aaaaaaaa' }])).toEqual([{ kind: 'deck', path: 'p', at, id: 'd_aaaaaaaa' }])
    expect(parsePins([{ kind: 'deck', path: 'p', at, id: 3 }])).toEqual([{ kind: 'deck', path: 'p', at }])
  })
})
