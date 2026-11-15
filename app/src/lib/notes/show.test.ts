import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({}) }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: async () => null }))

const { noteAsTalk, noteTalk, NOTE_TALK_ID } = await import('./show')
const { parseNoteDoc } = await import('./format')

describe('noteTalk', () => {
  it('makes a segment per topic, counting up, with sub-points under their points', () => {
    const talk = noteTalk(parseNoteDoc('- before\n\n## Hiring [5m, demo]\n- One\n  - sub\n> kept\n\n## Rest\n'), 'Priya')
    expect(talk.id).toBe(NOTE_TALK_ID)
    expect(talk.segments.map((s) => [s.name, s.kind, s.plannedSeconds, s.openEnded, s.points, s.hints])).toEqual([
      ['Priya', 'topic', 0, true, ['before'], []],
      ['Hiring', 'demo', 300, true, ['One\n- sub'], []],
      ['Rest', 'topic', 0, true, [], []],
    ])
  })
})

describe('noteAsTalk', () => {
  it('keeps times and kinds, and shares the length among untimed topics', () => {
    const doc = parseNoteDoc('---\nlength: 30m\n---\n## Hiring [10m, demo]\n- One\n## Open [~5m]\n## A\n## B\n')
    const talk = noteAsTalk(doc, 'Priya')
    expect(talk.targetSeconds).toBe(1800)
    expect(talk.segments.map((s) => [s.name, s.kind, s.plannedSeconds, s.openEnded])).toEqual([
      ['Hiring', 'demo', 600, false],
      ['Open', 'topic', 300, true],
      ['A', 'topic', 450, false],
      ['B', 'topic', 450, false],
    ])
    expect(talk.segments[0].points).toEqual(['One'])
    expect(talk.sessions).toEqual([])
  })

  it('gives untimed topics a minute when the note has no length', () => {
    const talk = noteAsTalk(parseNoteDoc('## A\n## B [open]\n'), 'N')
    expect(talk.targetSeconds).toBeUndefined()
    expect(talk.segments.map((s) => [s.plannedSeconds, s.openEnded])).toEqual([
      [60, false],
      [60, true],
    ])
  })
})
