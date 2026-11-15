import { describe, expect, it } from 'vitest'
import { readReview, reviewRequest } from './review'

describe("a session's review", () => {
  it('reads its sections and points, in the format’s order', () => {
    const r = readReview(`---
session: 2026-10-28T09:00:04.120Z
made-with: Oversay skill 0.2.0
---

# Stand-up · Wed 28 Oct 09:00

## What to change in the deck
- Atlas: keep it to 3:00.

## What ran over
- **Atlas** took 4:20 for 3:00.
- Intro, a little.
Said in passing.
`)
    expect(r.madeWith).toBe('Oversay skill 0.2.0')
    expect(r.sections).toEqual([
      { title: 'What ran over', points: ['**Atlas** took 4:20 for 3:00.', 'Intro, a little.'], lines: ['Said in passing.'] },
      { title: 'What to change in the deck', points: ['Atlas: keep it to 3:00.'], lines: [] },
    ])
  })

  it('asks the AI for the session by its deck and when it ran', () => {
    expect(reviewRequest('Weekly standup', '2026-10-28T09:00:04.120Z')).toMatch(/^Review my Weekly standup session of \w{3} 28 Oct \d{2}:\d{2} in Oversay\.$/)
  })
})
