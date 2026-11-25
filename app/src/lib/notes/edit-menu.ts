// Edit › Undo and Redo in the Mac menu bar (ADR 0052): what the manager tells the Rust side
// (src-tauri/src/edit_menu.rs) and what it hears back.

import { invoke } from '@tauri-apps/api/core'
import type { History } from './history'
import { deckTakesUndo, type UndoTarget, type Way } from './undo-keys'

/** Sent by Rust when an item is chosen while the deck's history takes it. Same name as `EDIT_MENU_EVENT` in edit_menu.rs. */
export const EDIT_MENU_EVENT = 'edit-menu'

/** What the deck's history can do. Same shape as `DeckUndo` in edit_menu.rs. */
export interface DeckUndo {
  undo: boolean
  redo: boolean
}

/** What the items show with focus at `at`: the deck's history, or null to leave them to the field. */
export function editMenuState(at: UndoTarget, history: History): DeckUndo | null {
  return deckTakesUndo(at) ? { undo: history.past.length > 0, redo: history.future.length > 0 } : null
}

/** The menu starts, and is left, with its items the field's. */
let told = 'null'

export async function sendEditMenu(deck: DeckUndo | null): Promise<void> {
  const text = JSON.stringify(deck)
  if (text === told) return
  told = text
  await invoke('set_edit_menu', { deck }).catch(() => {})
}

/** The item chosen, or null when the event isn't one (it is checked, not trusted). */
export const checkEditMenuChoice = (value: unknown): Way | null => (value === 'undo' || value === 'redo' ? value : null)
