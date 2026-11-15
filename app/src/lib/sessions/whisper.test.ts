import { describe, expect, it } from 'vitest'
import type { DeckSession } from '../decks/sessions'
import { heardSinceStart } from './whisper'

const START = Date.parse('2026-10-28T09:00:00.000Z')
const iso = (s: number) => new Date(START + s * 1000).toISOString()
const heard = (s: number, text: string) => ({ fromMs: s * 1000, toMs: s * 1000 + 500, text })
const lines = (cues: { at: number; text: string }[]) => cues.map((c) => [c.at / 1000, c.text])

// Intro 0–60 s, Atlas 60–120 s, paused 120–150 s, Atlas 150–200 s.
const session: DeckSession = {
  startedAt: iso(0),
  endedAt: iso(200),
  cards: [],
  visits: [
    { card: 0, from: iso(0), to: iso(60) },
    { card: 1, from: iso(60), to: iso(120) },
    { card: 1, from: iso(150), to: iso(200) },
  ],
}

describe('a recording laid back over the run', () => {
  it('counts from Start, skipping the pause the recording paused for', () => {
    expect(lines(heardSinceStart([heard(5, 'a.'), heard(110, 'b.'), heard(125, 'c.')], session))).toEqual([
      [5, 'a.'],
      [110, 'b.'],
      // 125 s into the recording is 5 s after Resume.
      [155, 'c.'],
    ])
  })

  it('counts from Start for a session kept without visits', () => {
    expect(heardSinceStart([heard(30, 'x')], { ...session, visits: undefined })[0].at).toBe(30_000)
  })

  it('puts each word under the card on screen when it was said, not the card its line began on', () => {
    // John's Passkeys run: a line that began just before Next was filed whole under the card before.
    const words = [heard(58.8, 'Moving'), heard(59.3, 'on'), heard(59.8, 'to'), heard(60.3, 'Atlas,'), heard(60.8, 'which'), heard(61.3, 'is')]
    expect(lines(heardSinceStart(words, session))).toEqual([
      [58.8, 'Moving on to'],
      [60.3, 'Atlas, which is'],
    ])
  })

  it('ends a line where the speaker paused, for speech Whisper left without full stops', () => {
    // John's run of 6 Nov came back without punctuation, in lines of 30 words.
    const words = [heard(1, 'welcome'), heard(1.6, 'to'), heard(2.2, 'passwords'), heard(4, 'they'), heard(4.6, 'sync')]
    expect(lines(heardSinceStart(words, session))).toEqual([
      [1, 'welcome to passwords'],
      [4, 'they sync'],
    ])
  })

  it('ends a line at the end of a sentence, and a long one before it runs on', () => {
    expect(lines(heardSinceStart([heard(1, 'Morning.'), heard(2, 'Is'), heard(3, 'everyone'), heard(4, 'here?'), heard(5, 'Good.')], session))).toEqual([
      [1, 'Morning.'],
      [2, 'Is everyone here?'],
      [5, 'Good.'],
    ])
    const long = Array.from({ length: 50 }, (_, i) => heard(i * 0.5, 'word'))
    expect(heardSinceStart(long, session).map((c) => c.text.split(' ').length)).toEqual([30, 20])
  })
})
