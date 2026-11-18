/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseNoteDoc } from './format'
import { lintNote, noteSummary } from './lint'
import { staleSkill } from './made-with'

// Shared with check.rs's tests, so `Oversay --check` and the app agree on every case.
interface LintCase {
  case: string
  text: string
  problems: [number | null, string][]
  summary: string
  /** A deck: its own keys and values, counted in cards. */
  deck?: boolean
}

const CASES = JSON.parse(readFileSync(new URL('../../../../skills/fixtures/note-lint.json', import.meta.url), 'utf8')) as LintCase[]

describe.each(CASES)('lintNote: $case', (c) => {
  it('finds what the app would show differently', () => {
    expect(lintNote(c.text, c.deck).map((p) => [p.line, p.code])).toEqual(c.problems)
  })
  it('counts what the app shows', () => {
    expect(noteSummary(parseNoteDoc(c.text), c.deck)).toBe(c.summary)
  })
})

describe('lint messages', () => {
  it('name the keys and kinds the app uses', () => {
    const [key] = lintNote('---\nattendees: x\n---\n## A\n- b\n')
    expect(key.message).toBe('Oversay doesn’t use `attendees`. The keys are `with`, `when`, `length`, `made-with`.')
    const [time] = lintNote('## A [10 mins]\n- b\n')
    expect(time.message).toContain('`[10 mins]`')
    expect(time.message).toContain('`intro`, `topic`, `demo`, `outro`, `break`')
  })
})

describe('deck lint messages', () => {
  it('name the deck keys, and the values an option takes', () => {
    const [key] = lintNote('---\nwhen: today\n---\n## A [1m]\n- b\n', true)
    expect(key.message).toBe(
      'Oversay doesn’t use `when`. The keys are `id`, `title`, `audience`, `with`, `project`, `tags`, `timing`, `auto-advance`, `colour`, `hide`, `record-on-start`, `made-with`.',
    )
    const [value] = lintNote('---\ncolour: rainbow\n---\n## A [1m]\n- b\n', true)
    expect(value.message).toBe('`colour: rainbow` isn’t one Oversay reads, so it uses the default. Write one of `kinds`, `one`.')
    // `timeline` (ADR 0042), `deck-bar` and `record` are retired: a deck that has one is never flagged, whatever it says.
    expect(lintNote('---\ntimeline: sparkline\n---\n## A [1m]\n- b\n', true)).toEqual([])
    expect(lintNote('---\ndeck-bar: middle\n---\n## A [1m]\n- b\n', true)).toEqual([])
    expect(lintNote('---\nrecord: on\n---\n## A [1m]\n- b\n', true)).toEqual([])
    expect(lintNote('---\nrecord-on-start: on\n---\n## A [1m]\n- b\n', true)).toEqual([])
    expect(lintNote('---\nrecord-on-start: maybe\n---\n## A [1m]\n- b\n', true).map((f) => f.code)).toEqual(['deck-value'])
  })
})

describe('staleSkill', () => {
  const note = (made: string) => parseNoteDoc(`---\nmade-with: ${made}\n---\n## A\n- b\n`)
  it('names the older skill that made a note', () => {
    expect(staleSkill(note('Oversay skill 0.1.0'), '0.2.0')).toBe('0.1.0')
    expect(staleSkill(note('Oversay skill 0.2.0'), '0.2.0')).toBeNull()
    expect(staleSkill(note('Claude'), '0.2.0')).toBeNull()
    expect(staleSkill(parseNoteDoc('## A\n- b\n'), '0.2.0')).toBeNull()
    expect(staleSkill(note('Oversay skill 0.1.0'), '')).toBeNull()
  })
})
