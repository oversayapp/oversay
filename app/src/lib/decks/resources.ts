// A workspace's resources (ADR 0046; a deck's, ADR 0037, moved up to its workspace): whatever is in its
// `resources/` folder (resources.rs).
// Files dropped on the workspace are copied in, a URL becomes a web link file, and a click opens one
// through the system. Oversay never reads them itself.

import { invoke } from '@tauri-apps/api/core'
import { logAction } from '../log'

export interface Resource {
  name: string
  kind: 'file' | 'folder' | 'link' | 'alias'
  /** Its size in bytes; null for a folder or an alias. */
  size: number | null
  modifiedMs: number
}

/**
 * Whose resources: a deck by its file's path, or a workspace by its id (ADR 0040). Same shape as
 * `Owner` in resources.rs.
 */
export type ResourceOwner = { deck: string } | { workspace: string }

export const listResources = (owner: ResourceOwner) => invoke<Resource[]>('list_resources', { owner })

/**
 * Copies dropped files into the resources of `owner`, the workspace called `where`. Returns what to
 * tell the person: what was added ("Added Q3 numbers.pdf to Biology seminar."), then why any file
 * wasn't (a folder, a file over the limit).
 */
export async function addResources(owner: ResourceOwner, paths: readonly string[], where = 'this workspace'): Promise<string> {
  const results = await invoke<({ Ok: string } | { Err: string })[]>('add_resources', { owner, paths })
  const added = results.flatMap((r) => ('Ok' in r ? [r.Ok.split(/[\\/]/).pop() ?? r.Ok] : []))
  logAction('add resources', `${added.length} of ${paths.length}`)
  return [addedMessage(added, where), ...results.flatMap((r) => ('Err' in r ? [r.Err] : []))].filter(Boolean).join(' ')
}

/** "Added Q3 numbers.pdf to Biology seminar.", "Added 3 files…", or '' for none. */
export function addedMessage(names: readonly string[], where = 'this workspace'): string {
  if (names.length === 0) return ''
  return `Added ${names.length === 1 ? names[0] : `${names.length} files`} to ${where}.`
}

/** Adds a web link file for `url`; refused unless it is an http or https link. */
export async function addLink(owner: ResourceOwner, url: string): Promise<void> {
  await invoke<string>('add_resource_link', { owner, url })
  logAction('add resource link')
}

export function openResource(owner: ResourceOwner, name: string): Promise<void> {
  logAction('open resource', name)
  return invoke('open_resource', { owner, name })
}

export function openResourcesFolder(owner: ResourceOwner): Promise<void> {
  logAction('open resources folder')
  return invoke('open_resources_folder', { owner })
}

/** "820 KB", "3.4 MB": a size as Finder shows it, in thousands. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`
  const units = ['KB', 'MB', 'GB']
  let n = bytes / 1000
  let i = 0
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000
    i++
  }
  return `${n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n)} ${units[i]}`
}

/** What a resource is, in a word, for the list. */
export function kindLabel(r: Resource): string {
  if (r.kind === 'folder') return 'Folder'
  if (r.kind === 'link') return 'Web link'
  if (r.kind === 'alias') return 'Alias'
  const ext = /\.([a-z0-9]{1,8})$/i.exec(r.name)?.[1]
  return ext ? ext.toUpperCase() : 'File'
}

/** The first web link in a drag's `text/uri-list` (lines starting `#` are comments), or null. */
export function droppedUrl(uriList: string): string | null {
  const url = uriList
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  return url && /^https?:\/\//i.test(url) ? url : null
}
