import { describe, expect, it } from 'vitest'
import { sampleDeckTalk } from './preview'

describe("the Look card's sample deck (ADR 0051)", () => {
  it('is the Why bees matter example, as a deck with its cards and options', () => {
    const talk = sampleDeckTalk()
    expect(talk.name).toBe('Why bees matter')
    expect(talk.segments.length).toBeGreaterThan(3)
    expect(talk.segments[0].name).toBe('Hook')
    expect(talk.segments[0].points[0]).toMatch(/supermarket/)
    expect(talk.deck).toBeDefined()
  })
})
