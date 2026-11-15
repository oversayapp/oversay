// The Quick notes, Quick talks and Decks folders in Documents/Oversay (src-tauri/src/quick.rs).

import { invoke } from '@tauri-apps/api/core'
import { markKnown } from '../settings/store'

/** The `kind` the quick-file commands take. Same names as `Kind::parse` in quick.rs. */
export const QUICK_KINDS = ['notes', 'talks', 'decks'] as const
export type QuickKind = (typeof QUICK_KINDS)[number]

export interface QuickFile {
  path: string
  /** The file name without its extension. */
  name: string
  /** When it was last written, in milliseconds since 1970. */
  modifiedMs: number
}

/** The list as Rust sent it, dropping anything malformed. */
export function parseQuickFiles(value: unknown): QuickFile[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (f): f is QuickFile =>
      typeof f === 'object' &&
      f !== null &&
      typeof (f as QuickFile).path === 'string' &&
      typeof (f as QuickFile).name === 'string' &&
      typeof (f as QuickFile).modifiedMs === 'number',
  )
}

export async function listQuickFiles(kind: QuickKind): Promise<QuickFile[]> {
  return parseQuickFiles(await invoke<unknown>('list_quick_files', { kind }))
}

/** Same name as `QUICK_FILES_CHANGED_EVENT` in quick.rs; both sides test it. Its payload is the `QuickKind`. */
export const QUICK_FILES_CHANGED_EVENT = 'quick-files-changed'

/** Makes a new file called `name` (numbered when taken) and returns its path. Oversay's own files are never New. */
export async function createQuickFile(kind: QuickKind, name: string, contents: string): Promise<string> {
  const path = await invoke<string>('create_quick_file', { kind, name, contents })
  await markKnown(kind, path)
  return path
}

export const readQuickFile = (kind: QuickKind, path: string) => invoke<string>('read_quick_file', { kind, path })

export const writeQuickFile = (kind: QuickKind, path: string, contents: string) =>
  invoke<void>('write_quick_file', { kind, path, contents })

/** Renames the file and returns its new path; refused when another file has the name. */
export async function renameQuickFile(kind: QuickKind, path: string, name: string): Promise<string> {
  const to = await invoke<string>('rename_quick_file', { kind, path, name })
  await markKnown(kind, to)
  return to
}

/** Moves the file to the Trash. */
export const trashQuickFile = (kind: QuickKind, path: string) => invoke<void>('trash_quick_file', { kind, path })

/**
 * A deck folder's name without its date and counter (ADR 0037): `Weekly standup 2026-10-25 (2)` →
 * `Weekly standup`. Same as `deck_name` in quick.rs; both test deck-folders.json.
 */
export function deckFolderName(folder: string): string {
  const title = /^(.*?)(?: \d{4}-\d{2}-\d{2})?(?: \(\d+\))?$/.exec(folder)?.[1] ?? ''
  return title === '' ? folder : title
}

/** `…/Quick notes/Standup.md` → `Standup`; a deck in its folder, `…/Decks/Standup 2026-10-25/deck.md` → `Standup`. */
export function quickName(path: string): string {
  const parts = path.split(/[\\/]/)
  const file = parts.pop() ?? path
  if (parts.at(-2) === 'Decks' && parts.at(-1)) return deckFolderName(parts.at(-1)!)
  return file.replace(/(\.oversay\.json|\.md)$/i, '')
}

/** Copies a Markdown file dropped on the window into Decks as a new deck in a folder of its own (ADR 0037); returns its path. */
export async function importNote(path: string): Promise<string> {
  const to = await invoke<string>('import_note', { path })
  await markKnown('decks', to)
  return to
}
