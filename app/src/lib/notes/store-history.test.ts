// Undo and redo through the open-note store, with files in memory in place of the disk
// (epic 043): what is saved, and that an outside change is never written over.

import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = new Map<string, string>()
const logged: string[] = []
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: { path: string; contents: string; name: string }) => {
    if (command === 'read_quick_file') {
      const text = files.get(args.path)
      if (text === undefined) throw new Error('not found')
      return text
    }
    if (command === 'write_quick_file') files.set(args.path, args.contents)
    if (command === 'create_quick_file') {
      const path = `/Decks/${args.name}/deck.md`
      files.set(path, args.contents)
      return path
    }
    if (command === 'trash_quick_file') files.delete(args.path)
    if (command === 'list_quick_files') return []
    return null
  },
}))
vi.mock('@tauri-apps/plugin-log', () => ({
  info: async (line: string) => void logged.push(line),
  error: async (line: string) => void logged.push(line),
}))
vi.mock('../settings/store', () => ({
  markOpened: async () => {},
  markKnown: async () => {},
  listedQuickFiles: async () => {},
  forgetQuickPath: async () => {},
  renameQuickPath: async () => {},
}))

import { parseNoteDoc, removePoint, writeNoteDoc } from './format'
import { checkOpenNote, closeNote, editNote, flushNote, openNote, openNoteAt, redoNote, undoNote } from './store'

const PATH = '/Decks/demo/deck.md'
const DECK = '---\nid: d_k3x9a2bq\n---\n\n## Card [3m]\n- A\n- B\n> kept\n- C'

const text = () => get(openNote)!.text
const logs = (event: string) => logged.filter((line) => line.includes(event))
const deleteB = () => editNote(writeNoteDoc(removePoint(parseNoteDoc(text()), 1, 1)), { what: 'delete-point' })

describe('undo and redo in the open deck', () => {
  beforeEach(async () => {
    await closeNote()
    files.clear()
    files.set(PATH, DECK)
    await openNoteAt(PATH, 'decks')
    logged.length = 0
  })

  it('brings a deleted point back and saves the file byte for byte as before, and redo removes it again (epic-043/V1)', async () => {
    deleteB()
    await flushNote()
    const without = files.get(PATH)
    expect(without).not.toContain('- B')

    await undoNote('keys')
    await flushNote()
    expect(files.get(PATH)).toBe(DECK)
    expect(logs('deck.undo ')).toEqual([expect.stringContaining('by=keys what=delete-point check=epic-043/V1')])

    await redoNote('keys')
    await flushNote()
    expect(files.get(PATH)).toBe(without)
    expect(logs('deck.redo ')).toEqual([expect.stringContaining('check=epic-043/V1')])
  })

  it('keeps a change read in from outside, and has nothing from before it to undo (epic-043/V4)', async () => {
    deleteB()
    await flushNote()
    files.set(PATH, `${DECK}\n- added outside`)
    await checkOpenNote('decks')

    expect(await undoNote('keys')).toBeNull()
    await flushNote()
    expect(files.get(PATH)).toBe(`${DECK}\n- added outside`)
    expect(logs('deck.undo_history_cleared')).toEqual([expect.stringContaining('why=reload steps=1 check=epic-043/V4')])
  })

  it('reads a change not yet noticed before undoing, so it is not written over (epic-043/V4)', async () => {
    deleteB()
    await flushNote()
    files.set(PATH, `${DECK}\n- added outside`)

    expect(await undoNote('keys')).toBeNull()
    await flushNote()
    expect(files.get(PATH)).toBe(`${DECK}\n- added outside`)
    expect(text()).toBe(`${DECK}\n- added outside`)
  })

  it('writes nothing from before a change made while typing waits (epic-043/V4)', async () => {
    deleteB() // still waiting to be saved
    const typed = text()
    files.set(PATH, `${DECK}\n- added outside`)

    expect(await undoNote('keys')).toBeNull()
    await flushNote()
    // As without undo (ADR 0034): the typing is saved, and the outside version is kept as a copy.
    expect(files.get(PATH)).toBe(typed)
    expect([...files.entries()].filter(([path]) => path !== PATH)[0][1]).toContain('- added outside')
    expect(logs('deck.undo_history_cleared')).toEqual([expect.stringContaining('why=conflict')])
  })
})
