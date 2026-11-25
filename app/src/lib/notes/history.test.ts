import { describe, expect, it } from 'vitest'
import { MAX_STEPS, NO_HISTORY, TYPING_PAUSE_MS, record, retitle, stepBack, stepForward, type Edit, type History, type Spot } from './history'

const spot = (field: string, at: number): Spot => ({ view: 'cards', card: 1, focus: { field, select: [at, at] } })
/** One keystroke that takes the text from `from` to `to`, in `field`. */
const typed = (field: string, from: string, to: string): Edit => ({ what: 'typing', before: spot(field, from.length), after: spot(field, to.length) })

/** The texts typed one after another into `field`, `gap` ms apart. */
function type(history: History, field: string, texts: string[], from: number, gap = 100): History {
  return texts.slice(1).reduce((h, text, n) => record(h, texts[n], text, typed(field, texts[n], text), from + n * gap), history)
}

describe('a run of typing in one field (epic-043/V3)', () => {
  it('is one step, back to the text and cursor it started from', () => {
    const history = type(NO_HISTORY, 'a', ['', 'h', 'he', 'hey'], 0)
    expect(history.past).toHaveLength(1)
    expect(stepBack(history)!.to).toEqual({ text: '', spot: spot('a', 0) })
    expect(stepForward(stepBack(history)!.history)!.to).toEqual({ text: 'hey', spot: spot('a', 3) })
  })

  it('ends with a pause of a second', () => {
    expect(type(NO_HISTORY, 'a', ['', 'h', 'he'], 0, TYPING_PAUSE_MS).past).toHaveLength(1)
    expect(type(NO_HISTORY, 'a', ['', 'h', 'he'], 0, TYPING_PAUSE_MS + 1).past).toHaveLength(2)
  })

  it('ends with typing in another field', () => {
    const history = type(type(NO_HISTORY, 'a', ['', 'h', 'he'], 0), 'b', ['he', 'he y', 'he yo'], 200)
    expect(history.past).toHaveLength(2)
    expect(stepBack(history)!.to.text).toBe('he')
  })

  it('ends with any other edit', () => {
    const typedOnce = type(NO_HISTORY, 'a', ['', 'h'], 0)
    const moved = record(typedOnce, 'h', 'moved', {}, 10)
    expect(type(moved, 'a', ['moved', 'moved!'], 20).past).toHaveLength(3)
  })

  it('ends with an undo or a redo', () => {
    const two = record(type(NO_HISTORY, 'a', ['', 'h'], 0), 'h', 'x', {}, 10)
    const back = stepBack(two)!.history
    expect(type(back, 'a', ['h', 'hi'], 20).past).toHaveLength(2)
    const again = stepForward(stepBack(type(NO_HISTORY, 'a', ['', 'h'], 0))!.history)!.history
    expect(type(again, 'a', ['h', 'hi'], 20).past).toHaveLength(2)
  })

  it('leaves no step when it ends where it began', () => {
    expect(type(NO_HISTORY, 'a', ['', 'h', ''], 0).past).toHaveLength(0)
  })
})

describe('the history', () => {
  it('drops what could be redone at a new edit (epic-043/V1)', () => {
    const back = stepBack(record(NO_HISTORY, 'a', 'b'))!.history
    expect(record(back, 'a', 'c').future).toHaveLength(0)
  })

  it(`keeps the last ${MAX_STEPS} steps (epic-043/V2)`, () => {
    let history = NO_HISTORY
    for (let n = 0; n < MAX_STEPS + 5; n++) history = record(history, `${n}`, `${n + 1}`)
    expect(history.past).toHaveLength(MAX_STEPS)
    expect(history.past[0].before.text).toBe('5')
  })

  it('has nothing to step to when empty', () => {
    expect(stepBack(NO_HISTORY)).toBeNull()
    expect(stepForward(NO_HISTORY)).toBeNull()
  })

  it('takes a new title in every step, and forgets a step that only differed by it', () => {
    let history = record(record(NO_HISTORY, 'old a', 'old b'), 'old b', 'new b')
    history = stepBack(record(history, 'new b', 'new c'))!.history
    const renamed = retitle(history, (text) => text.replace('old', 'new'))
    expect(renamed.past.map((s) => [s.before.text, s.after.text])).toEqual([['new a', 'new b']])
    expect(renamed.future.map((s) => [s.before.text, s.after.text])).toEqual([['new b', 'new c']])
  })
})
