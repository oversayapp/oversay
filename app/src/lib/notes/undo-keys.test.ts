import { describe, expect, it } from 'vitest'
import { deckTakesUndo, fieldHistory, undoKey } from './undo-keys'

const key = (k: string, mods: Partial<Record<'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey', boolean>>) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
})

describe('the undo and redo keys (epic-043/V1)', () => {
  it('are ⌘Z and ⇧⌘Z on a Mac', () => {
    expect(undoKey(key('z', { metaKey: true }), true)).toBe('undo')
    expect(undoKey(key('Z', { metaKey: true, shiftKey: true }), true)).toBe('redo')
    expect(undoKey(key('z', { ctrlKey: true }), true)).toBeNull()
    expect(undoKey(key('y', { metaKey: true }), true)).toBeNull()
  })

  it('are Ctrl+Z, and Ctrl+Shift+Z or Ctrl+Y, on Windows', () => {
    expect(undoKey(key('z', { ctrlKey: true }), false)).toBe('undo')
    expect(undoKey(key('Z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo')
    expect(undoKey(key('y', { ctrlKey: true }), false)).toBe('redo')
    expect(undoKey(key('z', { metaKey: true }), false)).toBeNull()
  })

  it('are nothing with Alt (AltGr types characters), another modifier or no modifier', () => {
    expect(undoKey(key('z', { ctrlKey: true, altKey: true }), false)).toBeNull()
    expect(undoKey(key('z', { metaKey: true, ctrlKey: true }), true)).toBeNull()
    expect(undoKey(key('z', {}), true)).toBeNull()
  })
})

describe('whose undo the keys are in the deck editor', () => {
  const there = { inEditor: true, textEntry: true, savedAsTyped: false, value: '', committed: null }

  it('is the deck’s in a field saved as you type, and away from any field', () => {
    expect(deckTakesUndo({ ...there, savedAsTyped: true, value: 'typed' })).toBe(true)
    expect(deckTakesUndo({ ...there, textEntry: false })).toBe(true)
  })

  it('is the field’s own while it holds typing not yet committed, and the deck’s once it holds none', () => {
    expect(deckTakesUndo({ ...there, committed: 'Ana', value: 'Ana and Raj' })).toBe(false)
    expect(deckTakesUndo({ ...there, committed: 'Ana', value: 'Ana' })).toBe(true)
  })

  it('is the field’s own in any other field, and outside the editor', () => {
    expect(deckTakesUndo({ ...there, value: 'a search' })).toBe(false)
    expect(deckTakesUndo({ ...there, inEditor: false, textEntry: false })).toBe(false)
    expect(deckTakesUndo({ ...there, inEditor: false, savedAsTyped: true })).toBe(false)
  })
})

describe('a field’s own undo asked for by the webview', () => {
  const point = { inEditor: true, textEntry: true, savedAsTyped: true, value: 'typed', committed: null }
  const button = { ...point, textEntry: false, savedAsTyped: false }
  const search = { ...point, inEditor: false, savedAsTyped: false }

  it('on a deck field becomes the deck’s undo where the deck takes undo', () => {
    expect(fieldHistory(point, point)).toBe('deck')
    expect(fieldHistory(point, button)).toBe('deck')
  })

  // Its history is page-wide: with nothing left to undo where focus is, it reaches another field.
  it('on a deck field is only stopped while focus is in another field (epic-043/V5)', () => {
    expect(fieldHistory(point, search)).toBe('stop')
  })

  it('on any other field is left alone', () => {
    expect(fieldHistory(search, search)).toBe('leave')
    expect(fieldHistory(search, point)).toBe('leave')
  })
})
