import { describe, expect, it } from 'vitest'
import { deckCards, deckId, deckTitle } from '../decks/deck'
import { parseNoteDoc } from '../notes/format'
import { STARTER_TEMPLATES, type Template } from './catalog'
import { deckFromTemplate } from './deck'

const template: Template = {
  id: 'u_1',
  name: 'Kickoff 20',
  description: '',
  category: 'mine',
  builtin: false,
  segments: [
    { name: 'Intro', kind: 'intro', plannedSeconds: 120, openEnded: false },
    { name: 'Demo', kind: 'demo', plannedSeconds: 90, openEnded: false },
    { name: 'Questions', kind: 'outro', plannedSeconds: 300, openEnded: true },
    { name: 'Break', kind: 'break', plannedSeconds: 0, openEnded: true },
  ],
}

describe('a deck from a template (epic 036 (#54), ADR 0039)', () => {
  it("the template's segments are the deck's cards, with their kinds and times", () => {
    const doc = parseNoteDoc(deckFromTemplate(template, 'Atlas kickoff'))
    expect(deckTitle(doc)).toBe('Atlas kickoff')
    expect(deckId(doc)).toMatch(/^d_/)
    expect(deckCards(doc, 'x').map((c) => [c.name, c.kind, c.seconds])).toEqual([
      ['Intro', 'intro', 120],
      ['Demo', 'demo', 90],
      ['Questions', 'outro', null],
      ['Break', 'break', null],
    ])
  })

  it('an open segment becomes an untimed card, even when it has an estimate', () => {
    const cards = deckCards(parseNoteDoc(deckFromTemplate(template, 'n')), 'n')
    expect(cards[2].seconds).toBeNull()
  })

  it('every starter template makes a deck with its cards, kinds and times', () => {
    for (const t of STARTER_TEMPLATES) {
      const cards = deckCards(parseNoteDoc(deckFromTemplate(t, t.name)), t.name)
      expect(cards.map((c) => [c.name, c.kind, c.seconds])).toEqual(t.segments.map((s) => [s.name, s.kind, s.openEnded ? null : s.plannedSeconds || null]))
    }
  })

  it('a card name that would read as a time or a heading is kept as a name', () => {
    const odd: Template = { ...template, segments: [{ name: 'Q&A [live] #1', kind: 'topic', plannedSeconds: 60, openEnded: false }] }
    expect(deckCards(parseNoteDoc(deckFromTemplate(odd, 'n')), 'n')[0].name).toBe('Q&A [live] #1')
  })
})
