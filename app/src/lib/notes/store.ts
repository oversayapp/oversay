// Quick notes in the manager: the list of notes, and the one open in the editor,
// which saves as you type (ADR 0026): shortly after typing stops, and before anything else
// happens to it (leaving it, renaming it, showing it). A note changed outside Oversay while open
// is read again, or kept beside it when typing was waiting (ADR 0034). A deck is a note
// with times (ADR 0036), so the deck editor opens, saves and reads again its deck through here too.

import { get, writable } from 'svelte/store'
import { logAction, logProblem } from '../log'
import { createQuickFile, listQuickFiles, quickName, readQuickFile, renameQuickFile, trashQuickFile, writeQuickFile } from './files'
import { frontValue, parseNoteDoc, pointsOf, shownTopics, writeNoteDoc } from './format'
import { forgetQuickPath, listedQuickFiles, markOpened, renameQuickPath } from '../settings/store'
import { diskChange, outsideName, whatChanged } from './outside'
import { createDeck, deckNameOf, decks, findDeck, loadDecks, summariseDeck } from '../decks/store'
import { deckId, setDeckTitle } from '../decks/deck'
import { NO_HISTORY, record, retitle, stepBack, stepForward, type Edit, type EditKind, type History, type Spot } from './history'
import type { Way } from './undo-keys'

export interface NoteEntry {
  path: string
  name: string
  modifiedMs: number
  /** Who the note is with (front matter `with`), or ''. */
  with: string
  topics: number
  points: number
  /** Set when the file could not be read. */
  unreadable?: boolean
}

/** Every note in the Quick notes folder, or null before the first load. */
export const notes = writable<NoteEntry[] | null>(null)

export function summarise(path: string, name: string, modifiedMs: number, text: string): NoteEntry {
  const doc = parseNoteDoc(text)
  const topics = shownTopics(doc)
  return {
    path,
    name,
    modifiedMs,
    with: frontValue(doc, 'with'),
    topics: topics.length,
    points: topics.reduce((n, t) => n + pointsOf(t).length, 0),
  }
}

/** Reads the folder again, and each note in it for its summary. */
export async function loadNotes(): Promise<void> {
  const files = await listQuickFiles('notes')
  const entries = await Promise.all(
    files.map(async (f) => {
      try {
        return summarise(f.path, f.name, f.modifiedMs, await readQuickFile('notes', f.path))
      } catch (e) {
        logProblem('note not read', `${f.path}: ${String(e)}`)
        return { path: f.path, name: f.name, modifiedMs: f.modifiedMs, with: '', topics: 0, points: 0, unreadable: true }
      }
    }),
  )
  notes.set(entries.sort((a, b) => b.modifiedMs - a.modifiedMs))
  await listedQuickFiles('notes', files.map((f) => f.path))
}

/** What a new note starts with: one topic to type under. */
export const NEW_NOTE = '## First topic\n'

/** Makes a note called `name` (numbered when taken) and returns its path. */
export async function newNote(name = 'Untitled note', text = NEW_NOTE): Promise<string> {
  const path = await createQuickFile('notes', name, text)
  logAction('new note', quickName(path))
  await loadNotes()
  return path
}

/** Renames a note that is not open; returns its new path. */
export async function renameNote(path: string, name: string): Promise<string> {
  if (get(openNote)?.path === path) return renameOpenNote(name)
  const to = await renameQuickFile('notes', path, name)
  logAction('rename note', `${quickName(path)} → ${quickName(to)}`)
  await renameQuickPath(path, to, quickName(to))
  await loadNotes()
  return to
}

/** Moves a note to the Trash; an open one is closed first, without saving into it again. */
export async function deleteNote(path: string): Promise<void> {
  if (get(openNote)?.path === path) {
    clearTimeout(timer)
    openNote.set(null)
  }
  logAction('delete note', quickName(path))
  await trashQuickFile('notes', path)
  await forgetQuickPath(path)
  await loadNotes()
}

// ---- the open note

/** The folders whose files the editor opens: quick notes and decks. */
export type EditedKind = 'notes' | 'decks'

const word = (kind: EditedKind) => (kind === 'notes' ? 'note' : 'deck')

/** Reads the list of the kind again. */
const reload = (kind: EditedKind) => (kind === 'notes' ? loadNotes() : loadDecks())

export interface OpenNote {
  kind: EditedKind
  path: string
  name: string
  text: string
  /** False while there are edits not yet written. */
  saved: boolean
  /** The file as Oversay last read or wrote it: anything else on disk was written outside Oversay. */
  known: string
  /** Set when the file changed outside while typing was waiting: that version, kept as its own note. */
  outside: { path: string; text: string } | null
  /** What an outside change that was read in did ("1 topic added"), until dismissed; or ''. */
  changed: string
  /** Where a deck was before its folder was renamed or moved outside Oversay, once it is found again by its id. */
  movedFrom?: string
  /** What can be undone and redone while it is open (ADR 0052). */
  history: History
}

export const openNote = writable<OpenNote | null>(null)

/** The last save's failure, shown in the editor, or ''. */
export const noteSaveError = writable('')

/** How long after the last keystroke a note is written. */
export const SAVE_DELAY_MS = 600

let timer: ReturnType<typeof setTimeout> | undefined
let writing: Promise<void> = Promise.resolve()

/** Opens a note or a deck (saving the one that was open first). */
export async function openNoteAt(path: string, kind: EditedKind = 'notes'): Promise<void> {
  if (get(openNote)?.path === path) return
  await flushNote()
  const text = await readQuickFile(kind, path)
  const name = kind === 'decks' ? deckNameOf(text, quickName(path)) : quickName(path)
  logAction(`open ${word(kind)}`, name)
  void markOpened(word(kind), path, kind === 'decks' ? deckId(parseNoteDoc(text)) || undefined : undefined)
  noteSaveError.set('')
  openNote.set({ kind, path, name, text, saved: true, known: text, outside: null, changed: '', history: NO_HISTORY })
}

/** The editor changed the note's text: it is written shortly, and can be undone. */
export function editNote(text: string, edit?: Edit): void {
  const note = get(openNote)
  if (!note || note.text === text) return
  change(note, text, record(note.history, note.text, text, edit, Date.now()))
}

function change(note: OpenNote, text: string, history: History): void {
  openNote.set({ ...note, text, history, saved: false })
  clearTimeout(timer)
  timer = setTimeout(() => void flushNote(), SAVE_DELAY_MS)
}

// ---- undo and redo (ADR 0052)

/** The validation check each kind of step shows in the log. */
const UNDO_CHECK: Record<EditKind, string> = { 'delete-point': 'V1', edit: 'V2', typing: 'V3' }

/** What asked for an undo or a redo, for the debug log. */
export type UndoBy = 'keys' | 'menu'

/** Where the editor should go after an undo or a redo, or null when nothing changed. */
export type Undone = { spot: Spot | null } | null

export const undoNote = (by: UndoBy): Promise<Undone> => travel('undo', by)
export const redoNote = (by: UndoBy): Promise<Undone> => travel('redo', by)

async function travel(way: Way, by: UndoBy): Promise<Undone> {
  const kind = get(openNote)?.kind
  if (!kind) return null
  // The file is looked at first: a change from outside not yet noticed drops the history here,
  // so no text from before it is written.
  await checkOpenNote(kind)
  const note = get(openNote)
  const to = note && (way === 'undo' ? stepBack : stepForward)(note.history)
  if (!note || !to) return null
  logAction(`${word(note.kind)}.${way}`, `by=${by} what=${to.step.what} check=epic-043/${by === 'menu' ? 'V5' : UNDO_CHECK[to.step.what]}`)
  change(note, to.to.text, to.history)
  return { spot: to.to.spot }
}

/** The history to keep when text from outside comes into the editor: none, as it never merges. */
function dropHistory(note: OpenNote, why: 'reload' | 'conflict' | 'use-theirs'): History {
  const steps = note.history.past.length + note.history.future.length
  if (steps) logAction(`${word(note.kind)}.undo_history_cleared`, `why=${why} steps=${steps} check=epic-043/V4`)
  return NO_HISTORY
}

/** Writes the open note now if it has unsaved edits, and waits for any write in progress. */
export function flushNote(): Promise<void> {
  clearTimeout(timer)
  const note = get(openNote)
  if (note && !note.saved) {
    const { kind, path, text } = note
    writing = writing.then(async () => {
      try {
        // Changed outside since Oversay last read or wrote it: keep that version before writing ours.
        const disk = await readQuickFile(kind, path).catch(() => null)
        const now = get(openNote)
        if (disk !== null && now?.path === path && diskChange({ ...now, text, saved: false }, disk) === 'conflict') await keepOutside(kind, path, disk)
        await writeQuickFile(kind, path, text)
        noteSaveError.set('')
        // Saved, unless it was edited again (or another note opened) while writing.
        openNote.update((n) => (n && n.path === path ? { ...n, known: text, saved: n.saved || n.text === text } : n))
        if (kind === 'notes') notes.update((list) => list && list.map((e) => (e.path === path ? summarise(path, e.name, Date.now(), text) : e)))
        else decks.update((list) => list && list.map((e) => (e.path === path ? summariseDeck(path, e.name, Date.now(), text) : e)))
      } catch (e) {
        logProblem(`${word(kind)} not saved`, `${path}: ${String(e)}`)
        noteSaveError.set(`Not saved: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }
  return writing
}

/** Saves and closes the open note. */
export async function closeNote(): Promise<void> {
  await flushNote()
  openNote.set(null)
}

/** Renames the open note's file (a deck's folder, and its `title`, ADR 0037); returns its new path. */
export async function renameOpenNote(name: string): Promise<string> {
  await flushNote()
  const note = get(openNote)
  if (!note) throw new Error('No note is open')
  const to = await renameQuickFile(note.kind, note.path, name)
  const named = note.kind === 'decks' ? name.trim() : quickName(to)
  logAction(`rename ${word(note.kind)}`, `${note.name} → ${named}`)
  // The folder watcher may have found it at its new path already.
  openNote.update((n) => (n && (n.path === note.path || n.path === to) ? { ...n, path: to, name: named } : n))
  if (note.kind === 'decks') {
    const now = get(openNote)
    // Not a step to undo: undoing keeps the new name, so every step takes it too.
    const title = (text: string) => writeNoteDoc(setDeckTitle(parseNoteDoc(text), named))
    if (now?.path === to && title(now.text) !== now.text) change(now, title(now.text), retitle(now.history, title))
    await flushNote()
  }
  await renameQuickPath(note.path, to, named)
  await reload(note.kind)
  return to
}

// ---- changed outside Oversay (task 202, ADR 0034)

/** Keeps the version written outside as a file of its own beside this one, "<name> (outside)". */
async function keepOutside(kind: EditedKind, path: string, text: string): Promise<void> {
  const name = get(openNote)?.name ?? quickName(path)
  // A deck's copy is a deck of its own, with its own id.
  const copy = kind === 'decks' ? await createDeck(outsideName(name), text) : await createQuickFile(kind, outsideName(name), text)
  logAction(`${word(kind)} changed outside while typing`, name)
  openNote.update((n) => (n && n.path === path ? { ...n, known: text, outside: { path: copy, text }, history: dropHistory(n, 'conflict') } : n))
}

/** The folder `kind` changed: the open note or deck is read again if it changed outside Oversay. */
export function checkOpenNote(kind: EditedKind = 'notes'): Promise<void> {
  writing = writing.then(async () => {
    const note = get(openNote)
    if (!note || note.kind !== kind) return
    let disk: string
    try {
      disk = await readQuickFile(kind, note.path)
    } catch {
      // Renamed or deleted outside: the editor keeps what it has, and a deck is found again by its id.
      if (kind === 'decks') await followDeck(note)
      return
    }
    const now = get(openNote)
    if (!now || now.path !== note.path) return
    const change = diskChange(now, disk)
    if (change === 'reload') {
      logAction(`${word(kind)} read again`, now.name)
      openNote.set({ ...now, text: disk, known: disk, changed: whatChanged(now.text, disk), history: dropHistory(now, 'reload') })
    } else if (change === 'conflict') {
      await keepOutside(kind, now.path, disk)
    }
  })
  return writing.then(() => (get(openNote)?.saved === false ? flushNote() : undefined))
}

/** The open deck's folder was renamed or moved outside Oversay: it follows the deck with its id, if listed. */
async function followDeck(note: OpenNote): Promise<void> {
  const found = findDeck(deckId(parseNoteDoc(note.known)))
  if (!found || found.path === note.path) return
  logAction('deck moved outside', found.name)
  openNote.update((n) => (n && n.path === note.path ? { ...n, path: found.path, name: found.name, movedFrom: note.path } : n))
  await renameQuickPath(note.path, found.path, found.name)
}

/** Takes the version written outside in place of what was typed, and drops its separate copy. */
export async function useOutsideVersion(): Promise<void> {
  const note = get(openNote)
  if (!note?.outside) return
  const { path, text } = note.outside
  logAction(`${word(note.kind)} use outside version`, note.name)
  openNote.set({ ...note, text, saved: false, outside: null, history: dropHistory(note, 'use-theirs') })
  await flushNote()
  await trashQuickFile(note.kind, path)
  await forgetQuickPath(path)
  await reload(note.kind)
}

/** Keeps both: what was typed stays in the note, the outside version stays as its own note. */
export function keepBothVersions(): void {
  const note = get(openNote)
  if (!note?.outside) return
  logAction(`${word(note.kind)} keep both versions`, note.name)
  openNote.set({ ...note, outside: null })
}

export function dismissChanged(): void {
  openNote.update((n) => (n ? { ...n, changed: '' } : n))
}
