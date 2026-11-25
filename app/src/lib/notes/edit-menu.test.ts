import { describe, expect, it, vi } from 'vitest'

const sent: unknown[] = []
/** Set to hold the next call until it is let go. */
let hold: Promise<void> | null = null
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: unknown) => {
    sent.push([command, args])
    const held = hold
    hold = null
    await held
  },
}))

import { EDIT_MENU_EVENT, checkEditMenuChoice, editMenuState, sendEditMenu } from './edit-menu'
import { NO_HISTORY, record, stepBack } from './history'

const inDeck = { inEditor: true, textEntry: false, savedAsTyped: false, value: '', committed: null }
const inSearch = { ...inDeck, inEditor: false, textEntry: true }

describe('Edit › Undo and Redo (epic-043/V5)', () => {
  it('are the deck’s, greyed by its history, wherever the keys would be', () => {
    const once = record(NO_HISTORY, 'a', 'b')
    // The same cases as the Rust side reads (edit_menu.rs).
    expect(editMenuState(inDeck, NO_HISTORY)).toEqual({ undo: false, redo: false })
    expect(editMenuState(inDeck, once)).toEqual({ undo: true, redo: false })
    expect(editMenuState(inDeck, stepBack(once)!.history)).toEqual({ undo: false, redo: true })
  })

  it('are left to the field elsewhere', () => {
    expect(editMenuState(inSearch, NO_HISTORY)).toBeNull()
    expect(editMenuState({ ...inDeck, textEntry: true, committed: 'Weekly', value: 'Weekly sync' }, NO_HISTORY)).toBeNull()
  })

  it('are told to the menu only when that changes', async () => {
    sent.length = 0
    for (const state of [null, { undo: true, redo: false }, { undo: true, redo: false }, null]) await sendEditMenu(state)
    expect(sent).toEqual([
      ['set_edit_menu', { deck: { undo: true, redo: false } }],
      ['set_edit_menu', { deck: null }],
    ])
  })

  it('are told in order: a call waits for the one before, as commands can overtake each other', async () => {
    sent.length = 0
    let letGo = () => {}
    hold = new Promise((r) => (letGo = r))
    const first = sendEditMenu({ undo: true, redo: true })
    const second = sendEditMenu(null)
    await new Promise((r) => setTimeout(r))
    expect(sent).toHaveLength(1)
    letGo()
    await Promise.all([first, second])
    expect(sent.at(-1)).toEqual(['set_edit_menu', { deck: null }])
  })

  it('arrive by the name the Rust side sends, as undo or redo only', () => {
    expect(EDIT_MENU_EVENT).toBe('edit-menu')
    expect(checkEditMenuChoice('undo')).toBe('undo')
    expect(checkEditMenuChoice('redo')).toBe('redo')
    expect(checkEditMenuChoice('quit')).toBeNull()
    expect(checkEditMenuChoice(undefined)).toBeNull()
  })
})
