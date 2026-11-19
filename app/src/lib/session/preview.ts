// The Look card's sample deck (ADR 0051): with nothing running, the "Why bees matter" example is
// put on the deck widget while the card is open, so the opacity, panel and sharing can be set and
// seen against a slide before a meeting. It is never recorded, and ends when the card closes.

import bees from '../decks/examples/Why bees matter.md?raw'
import { deckOptions, deckTalk, type DeckOptions } from '../decks/deck'
import { parseNoteDoc } from '../notes/format'
import type { Talk } from '../project/types'

/** The sample deck as the talk its preview session runs. */
export function sampleDeckTalk(): Talk & { deck: DeckOptions } {
  const doc = parseNoteDoc(bees)
  return { ...deckTalk(doc, 'Why bees matter'), deck: deckOptions(doc) }
}
