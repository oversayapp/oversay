import { describe, expect, it } from 'vitest'
import { DEFAULT_OVERLAY_SETTINGS } from '../../lib/settings/overlays'
import { overlayWindow } from '../registry'
import { deckWidgetWindow, flashcard } from '.'

describe('the deck widget window', () => {
  it('gives each view a layout of its own, so each keeps its own place and size', () => {
    const card = deckWidgetWindow('card')
    const agenda = deckWidgetWindow('agenda')
    expect(card).toMatchObject({ width: 400, place: 'upper-left', layout: 'card-upper-left' })
    expect(agenda).toMatchObject({ width: 960, place: 'bottom-centre', layout: 'deck-agenda' })
    expect(card.layout).not.toBe(agenda.layout)
  })

  it('opens in the view shown, the Card view by default', () => {
    expect(overlayWindow(flashcard, DEFAULT_OVERLAY_SETTINGS)).toEqual(deckWidgetWindow('card'))
    expect(overlayWindow(flashcard, { ...DEFAULT_OVERLAY_SETTINGS, deckView: 'agenda' })).toEqual(deckWidgetWindow('agenda'))
  })
})
