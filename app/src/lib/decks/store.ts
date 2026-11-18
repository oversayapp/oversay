// Decks in the manager (ADR 0036): every deck in Documents/Oversay/Decks, newest first.
// A copy of the quick notes list (lib/notes/store.ts); the deck open in the deck editor is kept
// there too, as the open note is. A deck is a folder, known by its id and named by its title
// (ADR 0037); one still a lone file from before is named by its file.

import { get, writable } from 'svelte/store'
import type { SegmentKind } from '../project/types'
import { logAction, logProblem } from '../log'
import { createQuickFile, listQuickFiles, quickName, readQuickFile, renameQuickFile, trashQuickFile, writeQuickFile } from '../notes/files'
import { parseNoteDoc, writeNoteDoc } from '../notes/format'
import { followDecks, forgetQuickPath, listedQuickFiles, renameQuickPath } from '../settings/store'
import { forgetDeck } from '../workspaces/store'
import { asNewDeck, deckAudience, deckCards, deckId, deckOptions, deckProject, deckSeconds, deckTags, deckTitle, setDeckOption, setDeckTitle, type RecordOnStart } from './deck'

export interface DeckEntry {
  /** The deck's file: `deck.md` in its folder, or a lone `.md` from before. */
  path: string
  /** Its id (ADR 0037), or '' for a deck that has none yet. */
  id: string
  /** Its `title`, or its folder's name without the date. */
  name: string
  modifiedMs: number
  /** Who the deck is for (front matter `audience`), or ''. */
  audience: string
  /** The project it belongs to (front matter `project`), or ''. */
  project: string
  tags: string[]
  cards: number
  /** The timed cards' time added up, in seconds; 0 when no card is timed. */
  seconds: number
  /** Runs untimed though its cards have times (`timing: off`). */
  timingOff: boolean
  /** Its `record-on-start` (ADR 0047): `global` follows Settings › Recordings › Auto record. */
  recordOnStart: RecordOnStart
  /** Each card's kind and time (null untimed), for the list's mini timeline. */
  bar: { kind: SegmentKind; seconds: number | null }[]
  /** Set when the file could not be read. */
  unreadable?: boolean
}

/** Every deck in the Decks folder, or null before the first load. */
export const decks = writable<DeckEntry[] | null>(null)

/** The deck's name: its `title`, or `fallback` (from its folder or file) when it has none. */
export const deckNameOf = (text: string, fallback: string): string => deckTitle(parseNoteDoc(text)) || fallback

export function summariseDeck(path: string, fallbackName: string, modifiedMs: number, text: string): DeckEntry {
  const doc = parseNoteDoc(text)
  const name = deckTitle(doc) || fallbackName
  const cards = deckCards(doc, name)
  return {
    path,
    id: deckId(doc),
    name,
    modifiedMs,
    audience: deckAudience(doc),
    project: deckProject(doc),
    tags: deckTags(doc),
    cards: cards.length,
    seconds: deckSeconds(cards),
    timingOff: !deckOptions(doc).timing,
    recordOnStart: deckOptions(doc).recordOnStart,
    bar: cards.map((c) => ({ kind: c.kind, seconds: c.seconds })),
  }
}

/** Reads the folder again, and each deck in it for its summary. */
export async function loadDecks(): Promise<void> {
  const files = await listQuickFiles('decks')
  const entries = await Promise.all(
    files.map(async (f) => {
      try {
        return summariseDeck(f.path, f.name, f.modifiedMs, await readQuickFile('decks', f.path))
      } catch (e) {
        logProblem('deck not read', `${f.path}: ${String(e)}`)
        return { path: f.path, id: '', name: f.name, modifiedMs: f.modifiedMs, audience: '', project: '', tags: [], cards: 0, seconds: 0, timingOff: false, recordOnStart: 'global' as const, bar: [], unreadable: true }
      }
    }),
  )
  decks.set(entries.sort((a, b) => b.modifiedMs - a.modifiedMs))
  await listedQuickFiles('decks', files.map((f) => f.path))
  // Pins and Recent find their decks again by id.
  await followDecks(entries)
}

/** What a new deck starts with: two timed cards, so Show has something to run. */
export const NEW_DECK = '## First card [2m]\n- A point to make\n\n## Second card [3m]\n- Another point\n'

/**
 * Makes a new deck from `text` with a new id and `name` as its title, in a folder of its own
 * (`<name> <date>`, numbered when taken), and returns its path. Never another deck's, whatever
 * its name (ADR 0037).
 */
export const createDeck = (name: string, text: string): Promise<string> => createQuickFile('decks', name, asNewDeck(text, name.trim() || 'Untitled deck'))

/** Makes a deck called `name` and returns its path. */
export async function newDeck(name = 'Untitled deck', text = NEW_DECK): Promise<string> {
  const path = await createDeck(name, text)
  logAction('new deck', name.trim() || 'Untitled deck')
  await loadDecks()
  return path
}

/**
 * Renames a deck: its folder takes the name, keeping its date, and its `title` the name as
 * typed. Returns its new path; its sessions are in its folder, so they go with it.
 */
export async function renameDeck(path: string, name: string): Promise<string> {
  const to = await renameQuickFile('decks', path, name)
  await writeDeckTitle(to, name)
  logAction('rename deck', `${listedName(path)} → ${name}`)
  // Its pin, star and Recent entry follow it.
  await renameQuickPath(path, to, name)
  await loadDecks()
  return to
}

/** The deck's name as the list shows it (its title), for the log. */
const listedName = (path: string): string => get(decks)?.find((d) => d.path === path)?.name ?? quickName(path)

/** Writes `title` into the deck at `path`, unless it says so already. */
export async function writeDeckTitle(path: string, title: string): Promise<void> {
  const text = await readQuickFile('decks', path)
  const doc = parseNoteDoc(text)
  if (deckTitle(doc) !== title.trim()) await writeQuickFile('decks', path, writeNoteDoc(setDeckTitle(doc, title)))
}

/** Sets a deck's Record on start (ADR 0047) in its `deck.md`, leaving every other line, and lists the decks again. */
export async function setDeckRecordOnStart(path: string, value: RecordOnStart): Promise<void> {
  const text = await readQuickFile('decks', path)
  const doc = parseNoteDoc(text)
  if (deckOptions(doc).recordOnStart === value) return
  logAction('deck option', `recordOnStart ${value} (${listedName(path)})`)
  await writeQuickFile('decks', path, writeNoteDoc(setDeckOption(doc, 'recordOnStart', value)))
  await loadDecks()
}

/** The listed deck with this id, or null: how a deck is found again after its folder moved. */
export function findDeck(id: string): DeckEntry | null {
  if (!id) return null
  return get(decks)?.find((d) => d.id === id) ?? null
}

/** Moves a deck to the Trash, and takes it out of every workspace (ADR 0040). */
export async function deleteDeck(path: string): Promise<void> {
  logAction('delete deck', listedName(path))
  const id = get(decks)?.find((d) => d.path === path)?.id ?? ''
  await trashQuickFile('decks', path)
  await forgetQuickPath(path)
  await loadDecks()
  await forgetDeck(id)
}
