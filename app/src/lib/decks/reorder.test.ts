import { describe, expect, it } from 'vitest'
import { edgeScrollStep } from './reorder'

describe('edgeScrollStep: scrolling while a card is dragged near an edge', () => {
  it.each([
    ['in the middle', 400, 0],
    ['just inside the top band', 159, -12],
    ['above the list', 20, -12],
    ['just below the top band', 160, 0],
    ['just above the bottom band', 740, 0],
    ['inside the bottom band', 741, 12],
    ['below the list', 900, 12],
  ])('%s (drag-card-order/V5)', (_, y, step) => expect(edgeScrollStep(y, 100, 800)).toBe(step))

  it('keeps a still middle in a view too short for both bands', () => {
    expect(edgeScrollStep(150, 100, 200)).toBe(0)
  })
})
