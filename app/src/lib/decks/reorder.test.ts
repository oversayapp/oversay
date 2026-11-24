import { describe, expect, it } from 'vitest'
import { cardMoveStep, edgeScrollStep } from './reorder'

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

describe('cardMoveStep: the keyboard move on a focused grip', () => {
  const press = (key: string, held: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}) => ({
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...held,
  })

  it('is one place up for Alt+ArrowUp and one down for Alt+ArrowDown (keyboard-move-card/V4)', () => {
    expect(cardMoveStep(press('ArrowUp', { altKey: true }))).toBe(-1)
    expect(cardMoveStep(press('ArrowDown', { altKey: true }))).toBe(1)
  })

  it.each([
    ['an arrow alone', press('ArrowUp')],
    ['another key with Alt', press('ArrowLeft', { altKey: true })],
    // Control+Alt+arrows are the app's opacity hotkeys.
    ['Control+Alt', press('ArrowUp', { altKey: true, ctrlKey: true })],
    ['Command+Alt', press('ArrowUp', { altKey: true, metaKey: true })],
    ['Shift+Alt', press('ArrowDown', { altKey: true, shiftKey: true })],
  ])('is nothing for %s', (_, e) => expect(cardMoveStep(e)).toBeNull())
})
