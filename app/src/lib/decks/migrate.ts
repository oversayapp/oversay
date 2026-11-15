// Quick notes and quick talks become decks (ADR 0036), once, with nothing lost: each file is
// copied into Decks and read back before its original goes to the Trash (where Put Back works).
// A note moves as it is (a note is a deck without times), with `timing: off` when it has topic
// times, since a note's times were only a guide and its clock counted up. A quick talk is written
// out as a deck with its segments' times, kinds and points, and its sessions kept as the deck's.
// It runs at start and whenever a file lands in the old folders, so an older AI skill that still
// writes notes there keeps working.

import { get } from 'svelte/store'
import { invoke } from '@tauri-apps/api/core'
import { logAction, logProblem } from '../log'
import { formatDuration } from '../project/duration'
import { loadProject } from '../project/load'
import { createQuickFile, listQuickFiles, readQuickFile, trashQuickFile } from '../notes/files'
import { moveQuickItemToDeck } from '../settings/store'
import { session } from '../session/store'
import { withSession } from './sessions'
import type { Talk } from '../project/types'
import type { SessionState } from '../session/clock'
import { parseNoteDoc, shownTopics, topicTimeText, writeNoteDoc } from '../notes/format'
import { asNewDeck, setDeckOption } from './deck'
import { cardTimes } from './run'
import type { DeckSession } from './sessions'

/** A note as a deck: as it is, with `timing: off` when any topic has a time. */
export function noteAsDeck(text: string): string {
  const doc = parseNoteDoc(text)
  if (!shownTopics(doc).some((t) => t.time && t.time.seconds > 0)) return text
  return writeNoteDoc(setDeckOption(doc, 'timing', false))
}

/** A point with sub-points (`Two customers:\n- Acme`) as Markdown list lines. */
function pointLines(point: string): string[] {
  const [head, ...subs] = point.split('\n')
  return [`- ${head}`, ...subs.map((s) => `  ${s.startsWith('- ') ? s : `- ${s}`}`)]
}

/** A quick talk's talk as a deck file, and its sessions as the deck's. */
export function talkAsDeck(talk: Talk): { text: string; sessions: DeckSession[] } {
  const lines: string[] = []
  const front: string[] = []
  const audience = (talk as { audience?: string }).audience?.trim()
  if (audience) front.push(`audience: ${audience.replace(/[\r\n]+/g, ' ')}`)
  if (front.length) lines.push('---', ...front, '---', '')
  lines.push(`# ${talk.name}`, '')
  if (talk.description?.trim()) lines.push(...talk.description.trim().split('\n').map((l) => `> ${l}`), '')
  if (talk.targetSeconds) lines.push(`> Target: ${formatDuration(talk.targetSeconds)}`, '')
  for (const s of talk.segments) {
    // An open-ended segment waits for Next, as an untimed card does; its estimate is kept as a note.
    const time = s.openEnded ? { seconds: 0, open: true } : s.plannedSeconds > 0 ? { seconds: s.plannedSeconds, open: false } : null
    lines.push(`## ${s.name}${topicTimeText(time, s.kind === 'topic' ? null : s.kind)}`)
    if (s.openEnded && s.plannedSeconds > 0) lines.push(`> About ${formatDuration(s.plannedSeconds)}`)
    for (const p of s.points) lines.push(...pointLines(p))
    for (const h of s.hints) lines.push(`> ${h}`)
    lines.push('')
  }
  const kinds = new Map(talk.segments.map((s) => [s.id, s.kind]))
  const sessions: DeckSession[] = talk.sessions.flatMap((run) => {
    const end = run.events.findLast((e) => e.type === 'end')
    if (!run.events.some((e) => e.type === 'start') || !end) return []
    const replay = { status: 'finished', index: 0, paused: false, plan: run.plan, events: run.events } as unknown as SessionState
    const { shown } = cardTimes(replay, Date.parse(end.at))
    return [
      {
        startedAt: run.startedAt,
        endedAt: end.at,
        cards: run.plan.map((p, i) => ({
          name: p.name,
          kind: kinds.get(p.segmentId) ?? 'topic',
          plannedSeconds: p.openEnded || p.plannedSeconds <= 0 ? null : p.plannedSeconds,
          seconds: Math.round(shown[i] ?? 0),
        })),
      },
    ]
  })
  return { text: lines.join('\n').replace(/\n+$/, '\n'), sessions }
}

let moving: Promise<{ notes: number; talks: number }> | null = null

/**
 * Moves every quick note and quick talk into Decks: copy, read the copy back, then the original to
 * the Trash. Not while a session runs (one may be showing that note). What couldn't move stays where
 * it is and is logged; the next run tries again.
 */
export function moveIntoDecks(): Promise<{ notes: number; talks: number }> {
  if (moving) return moving
  moving = (async () => {
    const moved = { notes: 0, talks: 0 }
    const s = get(session)
    if (s && s.status !== 'finished' && !s.preview) return moved
    for (const kind of ['notes', 'talks'] as const) {
      for (const file of await listQuickFiles(kind).catch(() => [])) {
        try {
          const text = await readQuickFile(kind, file.path)
          const deck = kind === 'notes' ? { text: noteAsDeck(text), sessions: [] } : talkAsDeck(loadProject(text, file.path).talks[0])
          // A deck of its own, in a folder of its own, with an id (ADR 0037).
          const made = asNewDeck(deck.text, file.name)
          const to = await createQuickFile('decks', file.name, made)
          if ((await readQuickFile('decks', to)) !== made) throw new Error('the copy reads back differently')
          let runs = ''
          for (const run of deck.sessions) runs = withSession(runs, run)
          if (runs) await invoke('write_deck_sessions', { path: to, contents: runs })
          await trashQuickFile(kind, file.path)
          await moveQuickItemToDeck(file.path, to, file.name)
          logAction('moved into Decks', `${kind} ${file.name}`)
          moved[kind]++
        } catch (e) {
          logProblem('not moved into Decks', `${file.path}: ${String(e)}`)
        }
      }
    }
    return moved
  })().finally(() => (moving = null))
  return moving
}
