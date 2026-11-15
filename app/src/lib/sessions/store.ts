// Every deck's sessions, for Sessions on the rail and a session's page: each deck's
// sessions.json and which of its sessions have a transcript, a review or a recording, read again
// when the decks are, after a run is kept, and when one deck's sessions change.

import { writable } from 'svelte/store'
import { logProblem } from '../log'
import { NO_SESSION_FILES, readDeckSessions, readSessionFiles, type DeckSession, type SessionFiles } from '../decks/sessions'
import type { DeckEntry } from '../decks/store'

export interface DeckRuns {
  /** Oldest first, as sessions.json keeps them. */
  sessions: DeckSession[]
  files: SessionFiles
}

/** Each readable deck's path and its runs; null before the first load. */
export const deckSessions = writable<Map<string, DeckRuns> | null>(null)

async function runsOf(path: string): Promise<DeckRuns> {
  try {
    const [sessions, files] = await Promise.all([readDeckSessions(path), readSessionFiles(path)])
    return { sessions, files }
  } catch (e) {
    logProblem('deck sessions not read', `${path}: ${String(e)}`)
    return { sessions: [], files: NO_SESSION_FILES }
  }
}

/** Reads the sessions of every deck in `decks`; a deck whose sessions can't be read has none. */
export async function loadDeckSessions(decks: readonly DeckEntry[]): Promise<void> {
  const read = await Promise.all(decks.filter((d) => !d.unreadable).map(async (d): Promise<[string, DeckRuns]> => [d.path, await runsOf(d.path)]))
  deckSessions.set(new Map(read))
}

/** Reads one deck's sessions again, after a note, a delete or a transcript. */
export async function reloadDeckSessions(path: string): Promise<void> {
  const runs = await runsOf(path)
  deckSessions.update((all) => new Map(all ?? []).set(path, runs))
}
