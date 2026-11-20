// Save decks to the cloud (ADR 0050), as Settings › Account shows it. Rust does the saving
// (src-tauri/src/sync): this only asks it to turn on or off and shows what it says.

import { invoke } from '@tauri-apps/api/core'
import { writable } from 'svelte/store'
import { logAction } from '../log'
import { loadDecks } from '../decks/store'

export interface SyncOutcome {
  uploaded: number
  downloaded: number
  /** Decks the cloud and this computer both have, with different contents: left as they are. */
  leftAlone: number
  failed: number
}

export interface SyncStatus {
  on: boolean
  /** The first upload and download is running. */
  working: boolean
  last: SyncOutcome | null
  problem: string | null
}

/** Null until Rust has been asked. */
export const sync = writable<SyncStatus | null>(null)

export async function loadSync() {
  sync.set(await invoke<SyncStatus>('sync_status'))
}

/** Uploads every local deck the cloud lacks and downloads every deck this computer lacks. */
export async function turnSyncOn() {
  logAction('account', 'save decks to the cloud: on')
  sync.update((s) => (s ? { ...s, working: true, problem: null } : s))
  try {
    sync.set(await invoke<SyncStatus>('sync_turn_on'))
  } finally {
    // Decks may have come down: the list reads the folder again.
    await loadDecks().catch(() => {})
  }
}

export async function turnSyncOff() {
  logAction('account', 'save decks to the cloud: off')
  sync.set(await invoke<SyncStatus>('sync_turn_off'))
}

/** What turning it on did, in words. */
export function outcomeText(o: SyncOutcome): string {
  const n = (count: number) => `${count} deck${count === 1 ? '' : 's'}`
  const parts = [`Saved ${n(o.uploaded)} to the cloud`, `brought down ${n(o.downloaded)}`]
  let text = `${parts.join(' and ')}.`
  if (o.leftAlone > 0)
    text += ` ${n(o.leftAlone)} already in your cloud ${o.leftAlone === 1 ? 'differs' : 'differ'} from the copy on this computer; both were left as they are.`
  if (o.failed > 0) text += ` ${n(o.failed)} couldn't be saved or brought down.`
  return text
}
