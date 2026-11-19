import { describe, expect, it } from 'vitest'
import { getPlugin, overlayWindow, plugins } from './registry'
import { DEFAULT_OVERLAY_SETTINGS } from '../lib/settings/overlays'
import { isValidPluginId } from '../lib/windows'

describe('plugin registry', () => {
  it('finds plugins by id: the deck widget and Talking Points, and no Timeline (epic 030)', () => {
    expect(getPlugin('flashcard')?.name).toBe('Deck widget')
    expect(getPlugin('talking-points')?.name).toBe('Talking Points')
    expect(getPlugin('timeline')).toBeUndefined()
  })

  it('returns undefined for unknown ids', () => {
    expect(getPlugin('does-not-exist')).toBeUndefined()
  })

  it('has unique ids that are valid window label suffixes', () => {
    const ids = plugins.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(isValidPluginId(id)).toBe(true)
  })

  it('opens the deck widget in the window of the view it shows', () => {
    const flashcard = getPlugin('flashcard')!
    expect(overlayWindow(flashcard, { ...DEFAULT_OVERLAY_SETTINGS, deckView: 'agenda' }).layout).toBe('deck-agenda')
    expect(overlayWindow(flashcard, DEFAULT_OVERLAY_SETTINGS).layout).toBe('card-upper-left')
  })
})
