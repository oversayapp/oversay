import { describe, expect, it } from 'vitest'
import { parseNoteDoc } from '../../lib/notes/format'
import { deckTalk } from '../../lib/decks/deck'
import { planFromTalk } from '../../lib/session/plan'
import type { SessionState } from '../../lib/session/clock'
import { flashcardModel } from './model'

const DECK = `---
colour: one
---
## Intro [1m, intro]
- Hello

## Atlas [3m]
- Shipped

## Questions
- Anything else?
`

function session(status: SessionState['status'], index = 0): SessionState {
  const talk = { ...deckTalk(parseNoteDoc(DECK), 'Stand-up'), deck: { colour: 'one' } }
  return { status, index, paused: false, plan: planFromTalk(talk), events: [], talk, shortcuts: {}, unavailable: [], deck: true }
}

describe('flashcard model', () => {
  it('shows nothing without a session', () => {
    expect(flashcardModel(null).status).toBe('none')
  })

  it('opens Ready on the first card, with the next one to come', () => {
    const m = flashcardModel(session('ready'))
    expect(m.status).toBe('ready')
    expect(m.card).toEqual({ name: 'Intro', kind: 'intro', seconds: 60, points: ['Hello'] })
    expect([m.index, m.count]).toEqual([0, 3])
    expect(m.next).toEqual({ name: 'Atlas', seconds: 180 })
    expect(m.bar.map((b) => b.state)).toEqual(['current', 'ahead', 'ahead'])
  })

  it('follows the session to the current card; the last has no next', () => {
    const m = flashcardModel(session('running', 2))
    expect(m.card?.name).toBe('Questions')
    expect(m.card?.seconds).toBeNull()
    expect(m.next).toBeNull()
    expect(m.bar.map((b) => b.state)).toEqual(['done', 'done', 'current'])
  })

  it('sizes the deck bar by time, giving untimed cards a small share', () => {
    expect(flashcardModel(session('running')).bar.map((b) => b.weight)).toEqual([60, 180, 20])
  })

  it('reads the deck options sent with the talk, defaults for the rest', () => {
    expect(flashcardModel(session('ready')).options).toEqual({ timing: true, autoAdvance: true, colour: 'one', hide: [] })
  })
})
