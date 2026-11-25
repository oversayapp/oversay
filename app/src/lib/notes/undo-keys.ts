// The deck editor's undo and redo keys, and when they mean the deck's history rather than a
// field's own undo (ADR 0052).

export type Way = 'undo' | 'redo'

type Keys = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>

/** ⌘Z and ⇧⌘Z on a Mac; Ctrl+Z, and Ctrl+Shift+Z or Ctrl+Y, elsewhere. */
export function undoKey(e: Keys, mac: boolean): Way | null {
  const command = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  if (!command || e.altKey) return null
  const key = e.key.toLowerCase()
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  return !mac && key === 'y' && !e.shiftKey ? 'redo' : null
}

export interface UndoTarget {
  /** In the deck editor's page and not in a dialog, or nowhere in particular. */
  inEditor: boolean
  /** A field that is typed in. */
  textEntry: boolean
  /** What is typed in it is saved as it is typed. */
  savedAsTyped: boolean
  value: string
  /** For a field saved when it is left or entered: what is saved now; otherwise null. */
  committed: string | null
}

/** Whether undo and redo are the deck's here. */
export function deckTakesUndo(at: UndoTarget): boolean {
  if (!at.inEditor) return false
  if (!at.textEntry || at.savedAsTyped) return true
  return at.committed !== null && at.value === at.committed
}

/**
 * What to do when the webview is about to undo or redo what is in `target`, with focus on
 * `focused`. Its history is page-wide, so with nothing left to undo where focus is it reaches
 * another field: a deck field is never changed by it, and the deck's undo runs only when it takes
 * undo where focus is.
 */
export function fieldHistory(target: UndoTarget, focused: UndoTarget): 'leave' | 'stop' | 'deck' {
  if (!deckTakesUndo(target)) return 'leave'
  return deckTakesUndo(focused) ? 'deck' : 'stop'
}
