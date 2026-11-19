// The Look card's sample deck (ADR 0051): with nothing running, the "Why bees matter" example is
// put on the deck widget while the card is open, so the opacity, panel and sharing can be set and
// seen against a slide before a meeting. It is never recorded, and ends when the card closes.

import bees from '../decks/examples/Why bees matter.md?raw'
import { talkOf } from '../decks/show'
import { parseNoteDoc } from '../notes/format'

/** The sample deck as the talk its preview session runs. */
export const sampleDeckTalk = () => talkOf(parseNoteDoc(bees), 'Why bees matter')
