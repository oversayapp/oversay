// A deck's sessions (ADR 0036, 0037, 0041): every Start of a deck, timed or not, is a
// session: how long each card was up and when, for After the deck and Sessions (planned against
// actual), and the person's note on it. They are kept in the deck's folder as sessions.json
// (quick.rs): the newest 20, plus any with a note, a transcript or a review; never in the deck
// file, which stays the person's text.

import { invoke } from '@tauri-apps/api/core'
import { logAction, logProblem } from '../log'
import { session as sessionStore } from '../session/store'
import { writable } from 'svelte/store'
import type { SegmentKind } from '../project/types'
import type { SessionState } from '../session/clock'
import { cardTimes } from './run'

/** How many sessions a deck keeps, besides those written about; older ones drop off (John, 23 Oct). */
export const KEEP_SESSIONS = 20

export interface DeckSessionCard {
  name: string
  kind: SegmentKind
  /** Its planned time, or null for an untimed card. */
  plannedSeconds: number | null
  /** How long it was up, over every visit, not counting pauses. */
  seconds: number
}

/** When a card was on screen: a visit ends at a move or a pause. */
export interface CardVisit {
  card: number
  from: string
  to: string
}

export interface DeckSession {
  /** When Start was pressed: what the session is known by. */
  startedAt: string
  endedAt: string
  cards: DeckSessionCard[]
  /** When each card was up, for lining up a transcript; absent in sessions kept before ADR 0041. */
  visits?: CardVisit[]
  /** Time spent paused. */
  pausedSeconds?: number
  /** The person's own words about the run: what went wrong, what to improve. Absent when blank. */
  note?: string
}

/** The run that `session` (a deck that has ended) records, or null when it never started. */
export function deckSessionOf(session: SessionState): DeckSession | null {
  if (!session.deck || session.preview) return null
  const start = session.events.find((e) => e.type === 'start')
  const end = session.events.findLast((e) => e.type === 'end')
  if (!start || !end) return null
  const { shown } = cardTimes(session, Date.parse(end.at))
  const segments = session.talk?.segments ?? []
  const { visits, pausedSeconds } = visitsOf(session)
  return {
    startedAt: start.at,
    endedAt: end.at,
    cards: session.plan.map((p, i) => ({
      name: p.name,
      kind: segments[i]?.kind ?? 'topic',
      plannedSeconds: p.openEnded || p.plannedSeconds <= 0 ? null : p.plannedSeconds,
      seconds: Math.round(shown[i] ?? 0),
    })),
    visits,
    pausedSeconds,
  }
}

/** When each card was up, as cardTimes counts it, and the time paused (up to Stop). */
function visitsOf(session: SessionState): { visits: CardVisit[]; pausedSeconds: number } {
  const visits: CardVisit[] = []
  let index = -1
  let from: string | null = null
  let pausedAt: number | null = null
  let paused = 0
  const close = (to: string) => {
    if (from !== null && index >= 0 && index < session.plan.length && Date.parse(to) > Date.parse(from)) visits.push({ card: index, from, to })
    from = null
  }
  for (const e of session.events) {
    if (e.type === 'start' || e.type === 'next' || e.type === 'previous') {
      close(e.at)
      if (pausedAt !== null) paused += Date.parse(e.at) - pausedAt
      pausedAt = null
      index = e.type === 'start' ? 0 : e.type === 'next' ? index + 1 : index - 1
      from = e.at
    } else if (e.type === 'pause' && pausedAt === null) {
      close(e.at)
      pausedAt = Date.parse(e.at)
    } else if (e.type === 'resume' && pausedAt !== null) {
      paused += Date.parse(e.at) - pausedAt
      pausedAt = null
      from = e.at
    } else if (e.type === 'end') {
      close(e.at)
      if (pausedAt !== null) paused += Date.parse(e.at) - pausedAt
      pausedAt = null
    }
  }
  return { visits, pausedSeconds: Math.round(paused / 1000) }
}

/** The sessions in a sessions file, oldest first; nothing for an empty or unreadable one. */
export function parseSessions(text: string): DeckSession[] {
  if (text.trim() === '') return []
  try {
    const file = JSON.parse(text) as { sessions?: DeckSession[] }
    return Array.isArray(file.sessions) ? file.sessions.filter((s) => s && Array.isArray(s.cards) && typeof s.startedAt === 'string') : []
  } catch {
    return []
  }
}

/** The file's own object, so fields Oversay doesn't know are written back as they were. */
function fileOf(text: string): { version: number; sessions: Record<string, unknown>[]; [key: string]: unknown } {
  let file: unknown
  try {
    file = text.trim() ? JSON.parse(text) : null
  } catch {
    file = null
  }
  const obj = file && typeof file === 'object' && !Array.isArray(file) ? (file as Record<string, unknown>) : {}
  const sessions = Array.isArray(obj.sessions) ? obj.sessions.filter((s): s is Record<string, unknown> => !!s && typeof s === 'object') : []
  return { ...obj, version: 1, sessions }
}

const written = (file: ReturnType<typeof fileOf>) => JSON.stringify(file, null, 2) + '\n'

/** Written about: it has a note. */
const hasNote = (s: Record<string, unknown>) => typeof s.note === 'string' && s.note.trim() !== ''

/**
 * The sessions file with `session` added, keeping the newest `KEEP_SESSIONS` and any with a note or
 * that `keep` says to keep (one with a transcript or a review, ADR 0041).
 */
export function withSession(text: string, session: DeckSession, keep: (s: DeckSession) => boolean = () => false): string {
  const file = fileOf(text)
  const all = [...file.sessions, session as unknown as Record<string, unknown>]
  const newest = all.length - KEEP_SESSIONS
  file.sessions = all.filter((s, i) => i >= newest || hasNote(s) || keep(s as unknown as DeckSession))
  return written(file)
}

/** The sessions file with the session that started at `startedAt` changed; a blank note is taken off. */
export function withChangedSession(text: string, startedAt: string, change: Partial<Pick<DeckSession, 'note'>>): string {
  const file = fileOf(text)
  file.sessions = file.sessions.map((s) => {
    if (s.startedAt !== startedAt) return s
    const next: Record<string, unknown> = { ...s, ...change }
    if (typeof next.note === 'string' && next.note.trim() === '') delete next.note
    return next
  })
  return written(file)
}

/** The sessions file without the session that started at `startedAt`. */
export function withoutSession(text: string, startedAt: string): string {
  const file = fileOf(text)
  file.sessions = file.sessions.filter((s) => s.startedAt !== startedAt)
  return written(file)
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * A session's name for its transcript, review and recording: its start in local time,
 * `YYYY-MM-DD HH-mm`, and ` -2`, ` -3` for later Starts of the deck in the same minute (John, 28 Oct).
 */
export function sessionName(sessions: readonly DeckSession[], session: DeckSession): string {
  const stamp = (s: DeckSession) => {
    const d = new Date(s.startedAt)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`
  }
  const name = stamp(session)
  const before = sessions.filter((s) => s !== session && stamp(s) === name && s.startedAt < session.startedAt).length
  return before ? `${name} -${before + 1}` : name
}

export const readDeckSessions = async (path: string): Promise<DeckSession[]> => parseSessions(await invoke<string>('read_deck_sessions', { path }))

/** Which of a deck's sessions have a transcript, a review or a recording, by session name (session_files.rs). */
export interface SessionFiles {
  transcripts: string[]
  reviews: string[]
  recordings: string[]
}

export const NO_SESSION_FILES: SessionFiles = { transcripts: [], reviews: [], recordings: [] }

/** A deck's session files; none for a deck not yet in a folder of its own, or one that can't be listed. */
export async function readSessionFiles(path: string): Promise<SessionFiles> {
  try {
    return await invoke<SessionFiles>('list_session_files', { path })
  } catch (e) {
    logProblem('session files not listed', `${path}: ${String(e)}`)
    return NO_SESSION_FILES
  }
}

/** Adds the ended deck's run to its sessions, keeping the older ones with a transcript or a review. */
export async function recordDeckSession(path: string, session: DeckSession): Promise<void> {
  const text = await invoke<string>('read_deck_sessions', { path })
  const files = await readSessionFiles(path)
  const sessions = parseSessions(text)
  const written = new Set([...files.transcripts, ...files.reviews, ...files.recordings])
  await invoke('write_deck_sessions', { path, contents: withSession(text, session, (s) => written.has(sessionName(sessions, s))) })
}

/** Saves the person's note on the session that started at `startedAt`. */
export async function noteDeckSession(path: string, startedAt: string, note: string): Promise<void> {
  const text = await invoke<string>('read_deck_sessions', { path })
  await invoke('write_deck_sessions', { path, contents: withChangedSession(text, startedAt, { note }) })
}

/** Deletes a session: its transcript, review and recording go to the Trash, then it leaves sessions.json. */
export async function deleteDeckSession(path: string, startedAt: string): Promise<void> {
  const text = await invoke<string>('read_deck_sessions', { path })
  const sessions = parseSessions(text)
  const session = sessions.find((s) => s.startedAt === startedAt)
  if (!session) return
  await invoke('trash_session_files', { path, name: sessionName(sessions, session) }).catch((e) => {
    // A lone deck (no folder) has no session files to trash; anything else stops the delete.
    if (!String(e).includes('folder of its own')) throw e
  })
  logAction('session deleted', `${path} ${startedAt}`)
  await invoke('write_deck_sessions', { path, contents: withoutSession(text, startedAt) })
}

/** The deck whose run was just kept, so its editor opens After the deck on it; null once seen. */
export const justRan = writable<string | null>(null)

/** The deck file a shown deck's session came from (`showDeckOnScreen` puts it on the talk). */
export const deckPathOf = (session: SessionState): string | null => (session.talk as { deckPath?: string } | null)?.deckPath ?? null

/**
 * Records each deck that ends, once, then calls `recorded` with its path and when the run started:
 * the manager opens that session's page. A run that couldn't be kept is logged; the deck
 * itself is never touched.
 */
export function recordFinishedDecks(recorded: (path: string, startedAt: string) => void): () => void {
  let last = ''
  return sessionStore.subscribe((s) => {
    if (!s || s.status !== 'finished') return
    const run = deckSessionOf(s)
    const path = deckPathOf(s)
    if (!run || !path || run.endedAt === last) return
    last = run.endedAt
    logAction('deck session kept', path)
    recordDeckSession(path, run)
      .then(() => recorded(path, run.startedAt))
      .catch((e) => logProblem('deck session not kept', String(e)))
  })
}
