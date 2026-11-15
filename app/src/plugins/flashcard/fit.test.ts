import { describe, expect, it } from 'vitest'
import { easeOut, wantedHeight } from './fit'

describe('the flashcard widget fitting its card', () => {
  it('asks for the frame less its body plus what the card holds', () => {
    // A 278 px frame whose body has 150 px; the card holds 230 px of points: 80 px more.
    expect(wantedHeight({ frame: 278, body: 150, content: 230 })).toBe(360)
    // A short card asks for less.
    expect(wantedHeight({ frame: 278, body: 150, content: 40.2 })).toBe(171)
  })

  it('eases out: quick at first, settling at the end', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.8)
  })
})
