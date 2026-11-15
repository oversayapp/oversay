// The example deck: "Welcome to Oversay" (examples/), put in Decks on first run as
// the demo project is put in Projects, and put back from Settings (example_decks.rs). It is a new
// deck in a folder of its own; one whose name a deck already has is left alone.

import { invoke } from '@tauri-apps/api/core'
import { get } from 'svelte/store'
import { logAction } from '../log'
import { markExampleDecksInstalled, markKnown, settings, settingsReadable } from '../settings/store'
import { loadDecks } from './store'

/** The example decks Decks doesn't have, by name. */
export const missingExampleDecks = (): Promise<string[]> => invoke<string[]>('missing_example_decks')

/** Puts the missing example decks in Decks; returns their paths. Oversay made them, so they are never New. */
export async function installExampleDecks(): Promise<string[]> {
  const made = await invoke<string[]>('install_example_decks')
  for (const path of made) await markKnown('decks', path)
  logAction('example decks added', String(made.length))
  await loadDecks()
  return made
}

/**
 * On the first run only, so deleted examples stay deleted until put back from Settings. Skipped
 * when settings.json can't be read, as the demo project is: it would otherwise be written over.
 */
export async function installExampleDecksOnFirstRun(): Promise<void> {
  if (get(settings).exampleDecksInstalled) return
  if (!settingsReadable) return logAction('example decks not added', 'settings.json unreadable')
  await installExampleDecks()
  await markExampleDecksInstalled()
}
