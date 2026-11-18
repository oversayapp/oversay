import { describe, expect, it } from 'vitest'
import type { Resource } from '../decks/resources'
import { addResourceTarget, filterResources, movePlan, movedNote, resourceType } from './resources'
import type { Workspace } from './workspaces'

const ws = (id: string, decks: string[]): Workspace => ({ id, name: id, folder: id, tags: [], decks, when: '', where: '', notes: '', problem: null })
const res = (name: string, kind: Resource['kind'] = 'file'): Resource => ({ name, kind, size: 10, modifiedMs: 0 })

describe('Add resource to workspace goes where the deck lives (ADR 0046)', () => {
  it('goes straight to the only workspace the deck is in, wherever it was opened from', () => {
    expect(addResourceTarget(['w_a'], null)).toEqual({ kind: 'to', id: 'w_a' })
    expect(addResourceTarget(['w_a'], 'w_a')).toEqual({ kind: 'to', id: 'w_a' })
  })

  it('in several, goes straight to the one it was opened from', () => {
    expect(addResourceTarget(['w_a', 'w_b'], 'w_b')).toEqual({ kind: 'to', id: 'w_b' })
  })

  it('in several, asks which only when opened from outside a workspace', () => {
    expect(addResourceTarget(['w_a', 'w_b'], null)).toEqual({ kind: 'ask', ids: ['w_a', 'w_b'] })
    // Opened from a workspace the deck is no longer in: also outside.
    expect(addResourceTarget(['w_a', 'w_b'], 'w_c')).toEqual({ kind: 'ask', ids: ['w_a', 'w_b'] })
  })

  it('in none, offers to put the deck in a workspace first', () => {
    expect(addResourceTarget([], null)).toEqual({ kind: 'none' })
  })
})

describe('the Files and links tab', () => {
  it('names a resource as a file, a link or a folder', () => {
    expect(resourceType(res('a.pdf'))).toBe('file')
    expect(resourceType(res('Site.webloc', 'link'))).toBe('link')
    expect(resourceType(res('Slides', 'folder'))).toBe('folder')
    expect(resourceType(res('shortcut', 'alias'))).toBe('file')
  })

  it('filters by what is typed, in any case, and by type', () => {
    const all = [res('Q3 numbers.pdf'), res('Cell biology.pdf'), res('Notes.docx'), res('Cells.webloc', 'link')]
    expect(filterResources(all, 'cell', 'all').map((r) => r.name)).toEqual(['Cell biology.pdf', 'Cells.webloc'])
    expect(filterResources(all, '', 'link').map((r) => r.name)).toEqual(['Cells.webloc'])
    expect(filterResources(all, 'xyz', 'all')).toEqual([])
    expect(filterResources(all, '  ', 'all')).toHaveLength(4)
  })
})

describe('the one-time move up (ADR 0046)', () => {
  const decks = [
    { id: 'd_one', path: '/Decks/One/deck.md' },
    { id: 'd_two', path: '/Decks/Two/deck.md' },
    { id: 'd_none', path: '/Decks/None/deck.md' },
    { id: '', path: '/Decks/NoId/deck.md' },
  ]

  it('lists each deck with the workspaces it is in, and leaves out a deck in none', () => {
    const plan = movePlan(decks, [ws('w_a', ['d_one', 'd_two']), ws('w_b', ['d_two'])])
    expect(plan).toEqual([
      { deckPath: '/Decks/One/deck.md', workspaceIds: ['w_a'] },
      { deckPath: '/Decks/Two/deck.md', workspaceIds: ['w_a', 'w_b'] },
    ])
  })

  it('words the note', () => {
    expect(movedNote({ files: 1, decks: 1 })).toBe('Moved 1 resource from 1 deck up to its workspace.')
    expect(movedNote({ files: 5, decks: 2 })).toBe('Moved 5 resources from 2 decks up to their workspaces.')
  })
})
