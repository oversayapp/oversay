import { describe, expect, it } from 'vitest'
import { firstLine, parseInline, parseNote } from './markdown'

describe('parseInline', () => {
  it('leaves plain text as it is', () => {
    expect(parseInline('Why timers fail')).toEqual([{ text: 'Why timers fail' }])
  })

  it('reads bold, italic and code', () => {
    expect(parseInline('**never** read the *slide* aloud, run `npm test`')).toEqual([
      { text: 'never', bold: true },
      { text: ' read the ' },
      { text: 'slide', italic: true },
      { text: ' aloud, run ' },
      { text: 'npm test', code: true },
    ])
    expect(parseInline('__also__ _this_')).toEqual([{ text: 'also', bold: true }, { text: ' ' }, { text: 'this', italic: true }])
  })

  it('reads italic inside bold', () => {
    expect(parseInline('**a *b* c**')).toEqual([
      { text: 'a ', bold: true },
      { text: 'b', bold: true, italic: true },
      { text: ' c', bold: true },
    ])
  })

  it('reads bold inside italic, and bold italic', () => {
    expect(parseInline('*a **b** c*')).toEqual([
      { text: 'a ', italic: true },
      { text: 'b', bold: true, italic: true },
      { text: ' c', italic: true },
    ])
    expect(parseInline('***x***')).toEqual([{ text: 'x', bold: true, italic: true }])
  })

  it('shows a link as its text alone', () => {
    expect(parseInline('see [the docs](https://example.com) later')).toEqual([{ text: 'see the docs later' }])
  })

  it('keeps raw HTML as typed', () => {
    expect(parseInline('<script>alert(1)</script> <b>hi</b>')).toEqual([{ text: '<script>alert(1)</script> <b>hi</b>' }])
  })

  it('leaves snake_case words, lone stars and unclosed marks alone', () => {
    expect(parseInline('use snake_case_names, 2 * 3, and **unclosed')).toEqual([{ text: 'use snake_case_names, 2 * 3, and **unclosed' }])
  })

  it('lets a backslash keep a mark literal', () => {
    expect(parseInline('\\*not italic\\*')).toEqual([{ text: '*not italic*' }])
  })

  it('does not read marks inside code', () => {
    expect(parseInline('`**x**`')).toEqual([{ text: '**x**', code: true }])
  })
})

describe('parseNote', () => {
  it('splits a point into its lines and a sub-list one level deep', () => {
    expect(parseNote('Show the editor:\n- add a segment\n- **drag** it')).toEqual([
      { kind: 'line', spans: [{ text: 'Show the editor:' }] },
      { kind: 'list', ordered: false, items: [[{ text: 'add a segment' }], [{ text: 'drag', bold: true }, { text: ' it' }]] },
    ])
  })

  it('reads a numbered sub-list', () => {
    expect(parseNote('Steps\n1. open\n2) save')).toEqual([
      { kind: 'line', spans: [{ text: 'Steps' }] },
      { kind: 'list', ordered: true, items: [[{ text: 'open' }], [{ text: 'save' }]] },
    ])
  })

  it('treats a deeper item as one level deep', () => {
    expect(parseNote('A\n- one\n  - two')).toEqual([
      { kind: 'line', spans: [{ text: 'A' }] },
      { kind: 'list', ordered: false, items: [[{ text: 'one' }], [{ text: 'two' }]] },
    ])
  })

  it('reads a point that starts like a list item as typed: a sub-list only follows a first line', () => {
    expect(parseNote('1) do X')).toEqual([{ kind: 'line', spans: [{ text: '1) do X' }] }])
    expect(parseNote('- aside\n- more')).toEqual([
      { kind: 'line', spans: [{ text: '- aside' }] },
      { kind: 'list', ordered: false, items: [[{ text: 'more' }]] },
    ])
  })

  it('skips blank lines', () => {
    expect(parseNote('A\n\nB')).toEqual([
      { kind: 'line', spans: [{ text: 'A' }] },
      { kind: 'line', spans: [{ text: 'B' }] },
    ])
  })
})

describe('firstLine', () => {
  it('is the point as the inline notes show it: its first line, without a sub-list', () => {
    expect(firstLine('Show the editor:\n- add a segment')).toEqual([{ text: 'Show the editor:' }])
    expect(firstLine('- typed with a dash')).toEqual([{ text: '- typed with a dash' }])
    expect(firstLine('')).toEqual([])
  })
})
