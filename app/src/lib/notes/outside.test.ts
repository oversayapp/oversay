import { describe, expect, it } from 'vitest'
import { diskChange, outsideName, whatChanged } from './outside'

describe('a note changed outside Oversay', () => {
  const note = (known: string, text: string, saved: boolean) => ({ known, text, saved })

  it.each([
    // [what Oversay last read or wrote, what is in the editor, nothing waiting?, on disk, outcome]
    ['A', 'A', true, 'A', 'none'], // our own save coming back
    ['A', 'A', true, 'B', 'reload'], // changed outside, nothing typed
    ['A', 'A2', false, 'B', 'conflict'], // changed outside while typing waits
    ['A', 'A2', false, 'A', 'none'], // only our typing, not saved yet
    ['A', 'B', false, 'B', 'none'], // outside wrote exactly what was typed
    ['A', 'A2', true, 'A2', 'none'], // our save landed before we recorded it
  ] as const)('known %s, typed %s, saved %s, disk %s → %s', (known, text, saved, disk, outcome) => {
    expect(diskChange(note(known, text, saved), disk)).toBe(outcome)
  })

  it('says what changed, by topics and points', () => {
    const before = '## A\n- one\n'
    expect(whatChanged(before, '## A\n- one\n- two\n\n## B\n- three\n')).toBe('1 topic and 2 points added')
    expect(whatChanged(before, '## A\n- one\n- two\n')).toBe('1 point added')
    expect(whatChanged('## A\n- one\n- two\n- three\n', before)).toBe('2 points removed')
    expect(whatChanged(before, '## B\n- one\n- two\n- three\n\n## C\n')).toBe('1 topic and 2 points added')
    expect(whatChanged('## A\n- one\n\n## B\n', '## A\n- one\n- two\n')).toBe('1 point added, 1 topic removed')
    expect(whatChanged(before, '## A\n- uno\n')).toBe('edited')
  })

  it('keeps the other version under a name that says where it came from', () => {
    expect(outsideName('Weekly standup')).toBe('Weekly standup (outside)')
  })
})
