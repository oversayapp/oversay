// Moving a point, then saving, closing and reopening the deck through the open-note store, with a
// file in memory in place of the disk (epic 042).

import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = new Map<string, string>()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: { path: string; contents: string }) => {
    if (command === 'read_quick_file') return files.get(args.path)
    if (command === 'write_quick_file') files.set(args.path, args.contents)
    return null
  },
}))
vi.mock('../settings/store', () => ({ markOpened: async () => {}, markKnown: async () => {} }))

import { movePoint, parseNoteDoc, pointsOf, writeNoteDoc } from './format'
import { closeNote, editNote, openNote, openNoteAt } from './store'

const PATH = '/Decks/demo/deck.md'
const DECK = '---\nid: d_k3x9a2bq\n---\n\n## Card [3m]\n1. A\n  - a1\n> kept\n2. B\n  wrapped\n3. C\n'

async function saveAndReopen(change: (text: string) => string): Promise<string[]> {
  await openNoteAt(PATH, 'decks')
  editNote(change(get(openNote)!.text))
  await closeNote()
  await openNoteAt(PATH, 'decks')
  return pointsOf(parseNoteDoc(get(openNote)!.text).topics[1]).map((p) => p.text)
}

describe('a deck saved, closed and reopened after its points changed', () => {
  beforeEach(async () => {
    await closeNote()
    files.set(PATH, DECK)
  })

  it('keeps a moved point where it was put, and every other line as it was (epic-042/V4)', async () => {
    const points = await saveAndReopen((text) => writeNoteDoc(movePoint(parseNoteDoc(text), 1, 4, 0).doc))
    expect(points).toEqual(['C', 'A', 'a1', 'B wrapped'])
    expect(files.get(PATH)).toBe('---\nid: d_k3x9a2bq\n---\n\n## Card [3m]\n1. C\n2. A\n> kept\n  - a1\n3. B\n  wrapped\n')
  })
})
