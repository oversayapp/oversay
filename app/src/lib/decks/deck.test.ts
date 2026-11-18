import { describe, expect, it } from 'vitest'
import { parseNoteDoc, setPointText, writeNoteDoc } from '../notes/format'
import { DECK_DEFAULTS, DECK_TALK_ID, asNewDeck, deckId, deckTitle, deckAudience, deckCards, deckOptions, deckSeconds, deckTags, deckTalk, isUntimed, setDeckAudience, setDeckOption, setDeckTags } from './deck'

const STANDUP = `---
with: Platform team
when: 2026-10-23 09:30
timeline: waveform
auto-advance: off
deck-bar: top
colour: one
made-with: Oversay skill 0.1.0
---

# Stand-up · 23 Oct

## Intro [1m, intro]
- Goal for today

## Atlas [3m]
1. Shipped the importer
2. **Blocked** on review
   - Ask Sam

## Beacon [~4m, demo]
- Live demo
> keep it short

## Questions
- Anything else?
`

describe('deck options', () => {
  it('reads the front matter', () => {
    expect(deckOptions(parseNoteDoc(STANDUP))).toEqual({ timing: true, autoAdvance: false, colour: 'one', hide: [], recordOnStart: 'global' })
  })

  it('defaults to auto-advance on and colour by kind', () => {
    expect(deckOptions(parseNoteDoc('## Only [1m]\n- a\n'))).toEqual(DECK_DEFAULTS)
    expect(DECK_DEFAULTS).toEqual({ timing: true, autoAdvance: true, colour: 'kinds', hide: [], recordOnStart: 'global' })
  })

  it('ignores values it does not know, and reads them in any case', () => {
    const doc = parseNoteDoc('---\ntimeline: sideways\nauto-advance: OFF\ndeck-bar: Top\ncolour: rainbow\n---\n## A\n')
    expect(deckOptions(doc)).toEqual({ ...DECK_DEFAULTS, autoAdvance: false })
  })
})

describe('deck cards', () => {
  const cards = deckCards(parseNoteDoc(STANDUP), 'Stand-up')

  it('makes one card per topic, with its time, kind and points', () => {
    expect(cards.map((c) => [c.name, c.seconds, c.kind])).toEqual([
      ['Intro', 60, 'intro'],
      ['Atlas', 180, 'topic'],
      ['Beacon', 240, 'demo'],
      ['Questions', null, 'topic'],
    ])
    expect(cards[1].points).toEqual(['Shipped the importer', '**Blocked** on review\n- Ask Sam'])
  })

  it('treats about a time as timed, and no time or [open] as untimed', () => {
    expect(cards[2].seconds).toBe(240)
    expect(isUntimed(cards[3])).toBe(true)
    const open = deckCards(parseNoteDoc('## Q&A [open]\n- a\n'), 'D')
    expect(open[0].seconds).toBeNull()
  })

  it('names an untitled first card after the deck', () => {
    expect(deckCards(parseNoteDoc('- a point before any card\n'), 'Loose')[0].name).toBe('Loose')
  })
})

describe('deck as a talk', () => {
  it('runs each card as a segment: timed ones with their time, untimed ones open-ended', () => {
    const talk = deckTalk(parseNoteDoc(STANDUP), 'Stand-up')
    expect(talk.id).toBe(DECK_TALK_ID)
    expect(talk.name).toBe('Stand-up')
    expect(talk.segments.map((s) => [s.name, s.plannedSeconds, s.openEnded, s.kind])).toEqual([
      ['Intro', 60, false, 'intro'],
      ['Atlas', 180, false, 'topic'],
      ['Beacon', 240, false, 'demo'],
      ['Questions', 0, true, 'topic'],
    ])
    expect(talk.segments[0].points).toEqual(['Goal for today'])
  })
})

describe('deck file', () => {
  it('is kept line for line, as a quick note is', () => {
    const doc = parseNoteDoc(STANDUP)
    expect(writeNoteDoc(doc)).toBe(STANDUP)
    const edited = writeNoteDoc(setPointText(doc, 1, 0, 'Goal for the week'))
    expect(edited).toBe(STANDUP.replace('Goal for today', 'Goal for the week'))
  })
})

describe('setting deck options', () => {
  it('writes each option to the front matter as the reader reads it back', () => {
    let doc = parseNoteDoc('# Stand-up\n\n## Intro [1m]\n- Hello\n')
    doc = setDeckOption(doc, 'autoAdvance', false)
    doc = setDeckOption(doc, 'colour', 'one')
    expect(deckOptions(doc)).toEqual({ timing: true, autoAdvance: false, colour: 'one', hide: [], recordOnStart: 'global' })
    expect(writeNoteDoc(doc)).toBe('---\nauto-advance: off\ncolour: one\n---\n# Stand-up\n\n## Intro [1m]\n- Hello\n')
  })

  it('changes only its own line, keeping the rest byte for byte', () => {
    const text = '---\r\nwith: Platform team\r\nauto-advance: on\r\nmade-with: Oversay skill 0.1.0\r\n---\r\n## Intro [1m]\r\n> a quote\r\n'
    const doc = setDeckOption(parseNoteDoc(text), 'autoAdvance', false)
    expect(writeNoteDoc(doc)).toBe(text.replace('auto-advance: on', 'auto-advance: off'))
  })

  it('adds up the timed cards', () => {
    expect(deckSeconds(deckCards(parseNoteDoc('## A [1m]\n## B\n## C [30s]\n'), 'D'))).toBe(90)
  })
})

describe('audience and tags', () => {
  it('reads the audience, or with as decks first wrote it, and writes audience in its place', () => {
    const old = parseNoteDoc('---\nwith: Platform team\n---\n## A [1m]\n')
    expect(deckAudience(old)).toBe('Platform team')
    const doc = setDeckAudience(old, 'Leadership')
    expect(writeNoteDoc(doc)).toBe('---\naudience: Leadership\n---\n## A [1m]\n')
    expect(deckAudience(doc)).toBe('Leadership')
  })

  it('reads tags once each, and writes them as one line, or none', () => {
    const doc = parseNoteDoc('---\ntags: weekly, Platform,, platform , q4\n---\n')
    expect(deckTags(doc)).toEqual(['weekly', 'Platform', 'q4'])
    expect(writeNoteDoc(setDeckTags(doc, ['weekly', 'a,b']))).toBe('---\ntags: weekly, a b\n---\n')
    expect(writeNoteDoc(setDeckTags(doc, []))).toBe('')
  })
})

describe('timing', () => {
  it('is on unless the deck says off, and is written as on or off', () => {
    expect(deckOptions(parseNoteDoc('## A [1m]\n')).timing).toBe(true)
    const doc = setDeckOption(parseNoteDoc('## A [1m]\n'), 'timing', false)
    expect(writeNoteDoc(doc)).toBe('---\ntiming: off\n---\n## A [1m]\n')
    expect(deckOptions(doc).timing).toBe(false)
  })
})

describe('a deck written with timeline: (retired, ADR 0042)', () => {
  it('keeps the line as written and reads the rest as before', () => {
    const doc = setDeckOption(parseNoteDoc('---\ntimeline: waveform\n---\n## A [1m]\n'), 'colour', 'one')
    expect(writeNoteDoc(doc)).toBe('---\ntimeline: waveform\ncolour: one\n---\n## A [1m]\n')
    expect(deckOptions(doc)).toEqual({ ...DECK_DEFAULTS, colour: 'one' })
  })
})

describe('what the card shows', () => {
  it('shows everything unless the deck hides parts, read in order and ignoring anything else', () => {
    expect(deckOptions(parseNoteDoc('## A\n')).hide).toEqual([])
    expect(deckOptions(parseNoteDoc('---\nhide: Ends, next, clouds\n---\n')).hide).toEqual(['next', 'ends'])
  })

  it('writes the parts it hides as one line, or none', () => {
    const doc = setDeckOption(parseNoteDoc('## A\n'), 'hide', ['ends', 'position'])
    expect(writeNoteDoc(doc)).toBe('---\nhide: position, ends\n---\n## A\n')
    expect(writeNoteDoc(setDeckOption(doc, 'hide', []))).toBe('## A\n')
  })
})

describe('a deck’s id and title (ADR 0037)', () => {
  it('reads a valid id, and none from a malformed one', () => {
    expect(deckId(parseNoteDoc('---\nid: d_k3x9a2bq\n---\n## A\n'))).toBe('d_k3x9a2bq')
    expect(deckId(parseNoteDoc('---\nid: 42\n---\n## A\n'))).toBe('')
    expect(deckId(parseNoteDoc('## A\n'))).toBe('')
  })

  it('makes a new deck with a new id and its title, keeping the rest', () => {
    const made = asNewDeck('## A [1m]\n- b\n', 'Standup')
    expect(made).toMatch(/^---\nid: d_[a-z0-9]{8}\ntitle: Standup\n---\n## A \[1m\]\n- b\n$/)
    // A copy of a deck is a deck of its own: its id is new, its other keys stay.
    const copy = asNewDeck('---\naudience: Team\nid: d_k3x9a2bq\ntitle: Old\n---\n## A\n', 'Old (outside)')
    expect(deckId(parseNoteDoc(copy))).not.toBe('d_k3x9a2bq')
    expect(deckTitle(parseNoteDoc(copy))).toBe('Old (outside)')
    expect(deckAudience(parseNoteDoc(copy))).toBe('Team')
  })
})

describe('record on start (ADR 0047)', () => {
  it('follows the global setting until the deck says on or off', () => {
    expect(deckOptions(parseNoteDoc('## A\n')).recordOnStart).toBe('global')
    expect(deckOptions(parseNoteDoc('---\nrecord-on-start: on\n---\n## A\n')).recordOnStart).toBe('on')
    expect(deckOptions(parseNoteDoc('---\nrecord-on-start: OFF\n---\n## A\n')).recordOnStart).toBe('off')
    expect(deckOptions(parseNoteDoc('---\nrecord-on-start: maybe\n---\n## A\n')).recordOnStart).toBe('global')
  })

  it('never reads the retired record key', () => {
    expect(deckOptions(parseNoteDoc('---\nrecord: on\n---\n## A\n')).recordOnStart).toBe('global')
  })

  it('is written to deck.md, and going back to global removes the key and keeps every other line', () => {
    let doc = setDeckOption(parseNoteDoc('---\nrecord: on\n---\n## A\n'), 'recordOnStart', 'off')
    expect(writeNoteDoc(doc)).toBe('---\nrecord: on\nrecord-on-start: off\n---\n## A\n')
    doc = setDeckOption(doc, 'recordOnStart', 'global')
    expect(writeNoteDoc(doc)).toBe('---\nrecord: on\n---\n## A\n')
  })
})
