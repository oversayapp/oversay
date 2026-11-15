// Showing a quick note on screen (ADR 0026): the note's topics as a talk's segments, run as
// a note session. Only Talking Points opens, with Previous topic and Next topic and a clock
// counting up; the overlay's ✕ (or the menu-bar menu's End) closes it, and nothing is recorded.

import { getCurrentWindow } from '@tauri-apps/api/window'
import { logAction, logProblem } from '../log'
import type { Talk } from '../project/types'
import type { SessionState } from '../session/clock'
import { closeSession, openSession, session, sessionCommands } from '../session/store'
import { closeOverlay, keepOverlaysApart, openOverlay } from '../windows'
import { talkingPoints as talkingPointsPlugin } from '../../plugins/talking-points'
import { frontValue, shownTopics, talkingPoints, type NoteDoc } from './format'
import { parseDuration } from '../project/duration'
import { newId } from '../project/ids'

/** The id a shown note's talk has: never a project talk's (`t_…`). */
export const NOTE_TALK_ID = 'note'

/** The note as a talk: one segment per topic that shows, its points as talking points. */
export function noteTalk(doc: NoteDoc, name: string): Talk {
  return {
    id: NOTE_TALK_ID,
    name,
    segments: shownTopics(doc).map((topic, i) => ({
      id: `s_note${i}`,
      name: topic.name || name,
      kind: topic.segmentKind ?? 'topic',
      plannedSeconds: topic.time?.seconds ?? 0,
      // A note counts up: no topic has an end to run over.
      openEnded: true,
      points: talkingPoints(topic),
      hints: [],
    })),
    sessions: [],
  }
}

/** Puts the note on screen and the manager out of the way. */
export async function showNoteOnScreen(doc: NoteDoc, name: string): Promise<void> {
  const talk = noteTalk(doc, name)
  if (talk.segments.length === 0) throw new Error('Add a topic to the note before showing it.')
  logAction('show note', name)
  const plugin = talkingPointsPlugin
  await openSession(talk, { mode: 'note' })
  try {
    await openOverlay(plugin.id, plugin.name, plugin.window)
  } catch (e) {
    // A note runs from the start, so it is ended (and then closed by `closeFinishedNotes`).
    await sessionCommands.end().catch(() => {})
    throw e
  }
  await keepOverlaysApart().catch((e) => logProblem('keep overlays apart', String(e)))
  // The Rust core brings the manager back when the note is closed (ADR 0018).
  await getCurrentWindow()
    .minimize()
    .catch(() => {})
}

/**
 * A closed note or deck leaves nothing to look at: its session is closed as soon as it finishes, so a
 * talk can start straight after. Returns the unsubscribe.
 */
export function closeFinishedNotes(): () => void {
  return session.subscribe((s) => {
    if ((s?.note || s?.deck || s?.preview) && s.status === 'finished') {
      closeSession().catch((e) => logProblem('note session not closed', String(e)))
      closeOverlay(s.deck ? 'flashcard' : 'talking-points').catch(() => {})
    }
  })
}

/** Whether a note can be shown now: not while a talk or another note is on screen. */
export function showBlockedBy(s: SessionState | null): string | null {
  if (!s || s.status === 'finished' || s.preview) return null
  return s.note ? 'Another note is on screen' : s.deck ? 'Another deck is on screen' : `A session for “${s.talk?.name ?? 'a talk'}” is open`
}

/** An untimed topic's length when nothing says otherwise, as for a new segment. */
const UNTIMED_SECONDS = 60
const STEP = 30

/**
 * The note as a quick talk's talk: a segment per topic with its time, kind and points.
 * Untimed topics share what is left of the note's `length` (in 30-second steps), or get a minute
 * each; the length becomes the talk's target.
 */
export function noteAsTalk(doc: NoteDoc, name: string): Talk {
  const topics = shownTopics(doc)
  const length = parseDuration(frontValue(doc, 'length') || '-')
  const timed = topics.reduce((sum, t) => sum + (t.time?.seconds ?? 0), 0)
  const untimed = topics.filter((t) => !t.time || t.time.seconds === 0).length
  const share = length && untimed > 0 && length > timed ? Math.max(STEP, Math.floor((length - timed) / untimed / STEP) * STEP) : UNTIMED_SECONDS
  return {
    id: newId('talk'),
    name,
    ...(length ? { targetSeconds: length } : {}),
    segments: topics.map((topic) => ({
      id: newId('segment'),
      name: topic.name || name,
      kind: topic.segmentKind ?? 'topic',
      plannedSeconds: topic.time && topic.time.seconds > 0 ? topic.time.seconds : share,
      openEnded: topic.time?.open ?? false,
      points: talkingPoints(topic),
      hints: [],
    })),
    sessions: [],
  }
}
