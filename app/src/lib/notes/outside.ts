// Notes and quick talks changed outside Oversay (ADR 0034): an AI, another editor or a sync
// tool writes the file while Oversay runs. These decide what Oversay does about it.

import { parseNoteDoc, pointsOf, shownTopics } from './format'

/**
 * What the open note does about the file on disk:
 * - `none`: the file is what Oversay last read or wrote (our own save coming back), or what is typed;
 * - `reload`: someone else changed it and nothing typed is waiting, so read it again;
 * - `conflict`: someone else changed it while typing was waiting to be saved.
 */
export type DiskChange = 'none' | 'reload' | 'conflict'

export function diskChange(note: { known: string; text: string; saved: boolean }, disk: string): DiskChange {
  if (disk === note.known || disk === note.text) return 'none'
  return note.saved ? 'reload' : 'conflict'
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** "1 topic and 2 points added", "3 points removed", or "edited", for the reload message. */
export function whatChanged(before: string, after: string): string {
  const measure = (text: string) => {
    const topics = shownTopics(parseNoteDoc(text))
    return { topics: topics.length, points: topics.reduce((n, t) => n + pointsOf(t).length, 0) }
  }
  const b = measure(before)
  const a = measure(after)
  const parts = (sign: 1 | -1) =>
    [
      sign * (a.topics - b.topics) > 0 ? count(sign * (a.topics - b.topics), 'topic') : '',
      sign * (a.points - b.points) > 0 ? count(sign * (a.points - b.points), 'point') : '',
    ].filter(Boolean)
  const added = parts(1)
  const removed = parts(-1)
  const said = [added.length ? `${added.join(' and ')} added` : '', removed.length ? `${removed.join(' and ')} removed` : ''].filter(Boolean)
  return said.length ? said.join(', ') : 'edited'
}

/** The name the other version is kept under when both changed: "Standup (outside)". */
export const outsideName = (name: string) => `${name} (outside)`
