import { describe, expect, it } from 'vitest'
import folders from '../decks/deck-folders.json'
import { QUICK_FILES_CHANGED_EVENT, deckFolderName, quickName } from './files'

it('names the folder-changed event as quick.rs does', () => {
  expect(QUICK_FILES_CHANGED_EVENT).toBe('quick-files-changed')
})

describe('deck folders (ADR 0037)', () => {
  // quick.rs names decks by the same cases.
  it.each(folders.names)('names the deck in $folder “$name”', ({ folder, name }) => {
    expect(deckFolderName(folder)).toBe(name)
  })

  it('names a deck by its folder, and a lone deck by its file', () => {
    expect(quickName('/Users/sam/Documents/Oversay/Decks/Weekly standup 2026-10-25 (2)/deck.md')).toBe('Weekly standup')
    expect(quickName('C:\\Users\\sam\\Documents\\Oversay\\Decks\\Retro 2026-09-01\\Retro.md')).toBe('Retro')
    expect(quickName('/Users/sam/Documents/Oversay/Decks/Stand-up.md')).toBe('Stand-up')
    expect(quickName('/Users/sam/Documents/Oversay/Quick notes/Standup.md')).toBe('Standup')
  })
})
