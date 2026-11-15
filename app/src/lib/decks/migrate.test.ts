import { describe, expect, it } from 'vitest'
import type { Talk } from '../project/types'
import { deckCards, deckOptions } from './deck'
import { parseNoteDoc } from '../notes/format'
import { noteAsDeck, talkAsDeck } from './migrate'
import { deckPathFor } from './paths'

describe('a quick note as a deck', () => {
  it('moves as it is when it has no times', () => {
    const note = '---\nwith: Sam\n---\n## Plan\n- One\n> kept\n'
    expect(noteAsDeck(note)).toBe(note)
  })

  it('keeps its times but runs untimed, as a note did', () => {
    const deck = noteAsDeck('## Plan [10m]\n- One\n')
    expect(deck).toBe('---\ntiming: off\n---\n## Plan [10m]\n- One\n')
    expect(deckOptions(parseNoteDoc(deck)).timing).toBe(false)
  })
})

describe('a quick talk as a deck', () => {
  const at = (s: number) => new Date(Date.parse('2026-10-20T09:00:00Z') + s * 1000).toISOString()
  const talk = {
    id: 't_1',
    name: 'Friday demo',
    description: 'For the platform team',
    targetSeconds: 600,
    segments: [
      { id: 's_a', name: 'Welcome', kind: 'intro', plannedSeconds: 60, openEnded: false, points: ['Who I am'], hints: ['Smile'] },
      { id: 's_b', name: 'Checkout', kind: 'demo', plannedSeconds: 300, openEnded: true, points: ['Two customers:\n- Acme\n- Globex'], hints: [] },
      { id: 's_c', name: 'Roadmap', kind: 'topic', plannedSeconds: 240, openEnded: false, points: [], hints: [] },
    ],
    sessions: [
      {
        id: 'x_1',
        startedAt: at(0),
        endedAt: at(700),
        plan: [
          { segmentId: 's_a', name: 'Welcome', plannedSeconds: 60, openEnded: false },
          { segmentId: 's_b', name: 'Checkout', plannedSeconds: 300, openEnded: true },
          { segmentId: 's_c', name: 'Roadmap', plannedSeconds: 240, openEnded: false },
        ],
        events: [
          { type: 'start', at: at(0) },
          { type: 'next', at: at(70) },
          { type: 'next', at: at(400) },
          { type: 'end', at: at(700) },
        ],
      },
    ],
  } as unknown as Talk

  it('writes each segment as a card with its time, kind, points and hints', () => {
    const { text } = talkAsDeck(talk)
    expect(text).toBe(
      [
        '# Friday demo',
        '',
        '> For the platform team',
        '',
        '> Target: 10:00',
        '',
        '## Welcome [1m, intro]',
        '- Who I am',
        '> Smile',
        '',
        '## Checkout [open, demo]',
        '> About 5:00',
        '- Two customers:',
        '  - Acme',
        '  - Globex',
        '',
        '## Roadmap [4m]',
        '',
      ].join('\n'),
    )
    expect(deckCards(parseNoteDoc(text), 'Friday demo').map((c) => [c.name, c.seconds, c.kind])).toEqual([
      ['Welcome', 60, 'intro'],
      ['Checkout', null, 'demo'],
      ['Roadmap', 240, 'topic'],
    ])
  })

  it('keeps its sessions as the deck’s', () => {
    expect(talkAsDeck(talk).sessions).toEqual([
      {
        startedAt: at(0),
        endedAt: at(700),
        cards: [
          { name: 'Welcome', kind: 'intro', plannedSeconds: 60, seconds: 70 },
          { name: 'Checkout', kind: 'demo', plannedSeconds: null, seconds: 330 },
          { name: 'Roadmap', kind: 'topic', plannedSeconds: 240, seconds: 300 },
        ],
      },
    ])
  })
})

describe('where a moved note or quick talk is', () => {
  it('is its name in Decks, beside the old folder', () => {
    expect(deckPathFor('/Users/sam/Documents/Oversay/Quick notes/Standup.md')).toBe('/Users/sam/Documents/Oversay/Decks/Standup.md')
    expect(deckPathFor('C:\\Users\\sam\\Documents\\Oversay\\Quick talks\\Friday demo.oversay.json')).toBe('C:\\Users\\sam\\Documents\\Oversay\\Decks\\Friday demo.md')
    expect(deckPathFor('/Users/sam/Documents/Oversay/Decks/Standup.md')).toBe('/Users/sam/Documents/Oversay/Decks/Standup.md')
  })
})
