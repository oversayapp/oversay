import { get } from 'svelte/store'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
const handlers: Record<string, (e: { payload: unknown }) => void> = {}
let reply: unknown
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string) => {
    calls.push(cmd)
    return reply
  },
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, cb: (e: { payload: unknown }) => void) => {
    handlers[name] = cb
    return () => delete handlers[name]
  },
}))
vi.mock('../log', () => ({ logAction: () => {}, logProblem: () => {} }))
vi.mock('../decks/store', () => ({ loadDecks: async () => void calls.push('loadDecks') }))

const { sync, loadSync, turnSyncOn, turnSyncOff, outcomeText, watchSync } = await import('./sync')

const off = { on: false, working: false, last: null, problem: null, activity: 'idle', conflicts: [] }

beforeEach(() => {
  calls.length = 0
  reply = off
  sync.set(null)
})

describe('Save decks to the cloud in Settings', () => {
  it('only asks Rust for the status when loaded', async () => {
    await loadSync()
    expect(calls).toEqual(['sync_status'])
    expect(get(sync)).toEqual(off)
  })

  it('turning it on asks Rust, shows what it did, and reads the decks folder again', async () => {
    reply = { on: true, working: false, last: { uploaded: 5, downloaded: 0, leftAlone: 0, failed: 0 }, problem: null, activity: 'saved', conflicts: [] }
    await turnSyncOn()
    expect(calls).toEqual(['sync_turn_on', 'loadDecks'])
    expect(get(sync)?.on).toBe(true)
  })

  it('turning it off asks Rust', async () => {
    await turnSyncOff()
    expect(calls).toEqual(['sync_turn_off'])
  })

  it('says what happened, including decks it left alone', () => {
    expect(outcomeText({ uploaded: 5, downloaded: 0, leftAlone: 0, failed: 0 })).toBe('Saved 5 decks to the cloud and brought down 0 decks.')
    expect(outcomeText({ uploaded: 1, downloaded: 1, leftAlone: 2, failed: 1 })).toBe(
      "Saved 1 deck to the cloud and brought down 1 deck. 2 decks already in your cloud differ from the copy on this computer; both were left as they are. 1 deck couldn't be saved or brought down.",
    )
  })

  it('shows Saving, then Saved, as Rust says so', async () => {
    await watchSync()
    handlers['sync-changed']({ payload: { ...off, on: true, activity: 'saving' } })
    expect(get(sync)?.activity).toBe('saving')
    handlers['sync-changed']({ payload: { ...off, on: true, activity: 'saved' } })
    expect(get(sync)?.activity).toBe('saved')
  })
})
