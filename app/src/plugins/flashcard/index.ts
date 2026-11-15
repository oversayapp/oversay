import type { OverlayPlugin } from '../types'
import type { DeckView } from '../../lib/settings/overlays'
import type { OverlayWindowSize } from '../../lib/windows'
import { mount, unmount } from 'svelte'
import DeckWidget from './DeckWidget.svelte'
import { TAB_HEIGHT } from './fit'

/** The window each of the deck widget's views has; each view remembers its own place and size (ADR 0042). */
export function deckWidgetWindow(view: DeckView): OverlayWindowSize {
  // The Agenda view: the Blocks timeline's place along the bottom, wider so every card's title fits.
  // Each has room under its panel for the tab of buttons.
  // The Agenda view is no shorter than its bars and titles need.
  if (view === 'agenda') return { width: 960, height: 136 + TAB_HEIGHT, minWidth: 480, minHeight: 136 + TAB_HEIGHT, place: 'bottom-centre', layout: 'deck-agenda' }
  // The Card view: the upper left, in from the corner (John, 23 Oct): near the camera, and clear of
  // the Agenda view along the bottom. A layout of its own, so a place remembered from the bottom centre is not reused.
  return { width: 400, height: 280 + TAB_HEIGHT, minWidth: 300, minHeight: 160 + TAB_HEIGHT, place: 'upper-left', layout: 'card-upper-left' }
}

/**
 * The deck widget (ADR 0036, ADR 0042): a running deck, as one card at a time (the Card
 * view) or every card along the bottom (the Agenda view), switched beside ✕. A deck starts in the
 * Card view; the window takes the view shown (`deckView`) and moves to its place when switched.
 */
export const flashcard: OverlayPlugin = {
  id: 'flashcard',
  name: 'Deck widget',
  description: 'The deck on screen: the current card, or every card along the bottom.',
  window: deckWidgetWindow('card'),
  windowFor: (look) => deckWidgetWindow(look.deckView),
  // Only a deck opens it (Show); a talk never does.
  opensWith: () => false,
  mount: (target, ctx) => {
    const instance = mount(DeckWidget, { target, props: { ctx } })
    return () => void unmount(instance)
  },
}
