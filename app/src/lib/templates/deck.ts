// A template starts a deck (epic 036 (#54); ADR 0039 left this step for later): its segments become the
// deck's cards, each with its kind and time, an open segment an untimed card. The text is the deck's
// Markdown, which createDeck gives its id and title.

import { topicTimeText } from '../notes/format'
import { asNewDeck } from '../decks/deck'
import type { Template } from './catalog'

/** The Markdown of a deck for `template`: one `## ` card per segment, `[2m, intro]` after its name. */
export function deckFromTemplate(template: Template, name: string): string {
  const cards = template.segments.map((s) => {
    const time = s.openEnded || s.plannedSeconds <= 0 ? null : { seconds: s.plannedSeconds, open: false }
    return `## ${s.name.replace(/\s+/g, ' ').trim()}${topicTimeText(time, s.kind)}\n`
  })
  return asNewDeck(cards.join('\n'), name.trim() || template.name)
}
