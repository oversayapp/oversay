import { describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { deckSessions, openFinishedRun, reloadDeckSessions } from './store'

// The deck's sessions.json on disk: the folder watcher doesn't report a change to it.
let onDisk = ''
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => (cmd === 'read_deck_sessions' ? onDisk : { transcripts: [], reviews: [], recordings: [] })),
}))
vi.mock('../log', () => ({ logAction: vi.fn(), logProblem: vi.fn() }))

const kept = (...starts: string[]) => JSON.stringify({ version: 1, sessions: starts.map((startedAt) => ({ startedAt, endedAt: startedAt, cards: [] })) })
const loaded = (path: string) => get(deckSessions)?.get(path)?.sessions.map((s) => s.startedAt)

describe('opening the run that has just ended (epic 044 (#100))', () => {
  it('has that run loaded before its page opens, even for a deck run twice in a row', async () => {
    onDisk = kept('first')
    await reloadDeckSessions('/a/deck.md')
    onDisk = kept('first', 'second')
    let atOpen: string[] | undefined
    await openFinishedRun('/a/deck.md', () => (atOpen = loaded('/a/deck.md')))
    expect(atOpen).toEqual(['first', 'second'])
  })
})
