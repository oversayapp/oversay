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
    if (command === 'rename_quick_file') {
      const to = `/Decks/${args.name}/deck.md`
      files.set(to, files.get(args.path)!)
      files.delete(args.path)
      return to
    }
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
  followDecks: async () => {},
}))

import { addTopic, movePointBy, moveTopicBy, parseNoteDoc, removePoint, removeTopic, setPointText, writeNoteDoc, type NoteDoc } from './format'
import type { Edit, Spot } from './history'
import { checkOpenNote, closeNote, editNote, flushNote, openNote, openNoteAt, redoNote, renameOpenNote, undoNote, useOutsideVersion } from './store'

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

  const change = (to: (doc: NoteDoc) => NoteDoc, edit?: Edit) => editNote(writeNoteDoc(to(parseNoteDoc(text()))), edit)
  const spot = (card: number, field: string): Spot => ({ view: 'cards', card, focus: { field, select: null } })

  it('takes back a card removed, moved cards and points and a card added, newest first, with where each was (epic-043/V2)', async () => {
    const two = `${DECK}\n\n## Second\n- D\n`
    files.set(PATH, two)
    await checkOpenNote('decks')
    const edits: [(doc: NoteDoc) => NoteDoc, Spot][] = [
      [(doc) => movePointBy(doc, 1, 0, 1).doc, spot(1, 'point')],
      [(doc) => moveTopicBy(doc, 2, -1).doc, spot(2, 'grip')],
      [(doc) => addTopic(doc, doc.topics.length - 1, 'New card').doc, spot(1, 'add')],
      [(doc) => removeTopic(doc, 1), spot(1, 'name')],
    ]
    const before: string[] = []
    for (const [to, where] of edits) {
      before.push(text())
      change(to, { before: where, after: spot(0, 'after') })
    }
    expect(new Set([...before, text()]).size).toBe(edits.length + 1)

    for (let n = edits.length - 1; n >= 0; n--) {
      expect(await undoNote('keys')).toEqual({ spot: edits[n][1] })
      expect(text()).toBe(before[n])
    }
    await flushNote()
    expect(files.get(PATH)).toBe(two)
    expect(logs('deck.undo ')).toHaveLength(4)
    expect(logs('deck.undo ').every((line) => line.includes('check=epic-043/V2'))).toBe(true)
  })

  it('takes back each phrase typed in one step (epic-043/V3)', async () => {
    for (const [i, phrase] of [[0, 'first phrase'], [3, 'second']] as const) {
      for (let n = 1; n <= phrase.length; n++)
        change((doc) => setPointText(doc, 1, i, phrase.slice(0, n)), { what: 'typing', before: spot(1, `1:${i}`), after: spot(1, `1:${i}`) })
    }
    await undoNote('keys')
    expect(text()).toContain('- first phrase\n')
    expect(text()).toContain('- C')
    await undoNote('keys')
    expect(text()).toBe(DECK)
    expect(await undoNote('keys')).toBeNull()
    expect(logs('deck.undo ')).toEqual([1, 2].map(() => expect.stringContaining('what=typing check=epic-043/V3')))
  })

  it('keeps the new name when undoing after a rename, and has no step for it', async () => {
    deleteB()
    const path = await renameOpenNote('Weekly')
    expect(get(openNote)!.history.past).toHaveLength(1)
    await undoNote('keys')
    await flushNote()
    expect(files.get(path)).toContain('title: Weekly')
    expect(files.get(path)).toContain('- A\n- B\n> kept\n- C')
    expect(get(openNote)!.name).toBe('Weekly')
  })

  it('has nothing to undo after taking the outside version (epic-043/V4)', async () => {
    deleteB()
    files.set(PATH, `${DECK}\n- added outside`)
    await flushNote()
    deleteB() // typed after the conflict: its own step
    await useOutsideVersion()
    expect(await undoNote('keys')).toBeNull()
    expect(text()).toContain('- added outside')
  })
})
