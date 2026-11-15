import { invoke } from '@tauri-apps/api/core'
import { get, writable } from 'svelte/store'
import { logAction } from '../log'
import type { Talk } from '../project/types'
import type { Category, CategoryColor, CategoryId, Template } from './catalog'
// The rules are pure functions in library.ts; this store applies them and saves the result.
// Many share a name with the action here, hence the namespace.
import * as rules from './library'
import type { Library } from './library'

const FILE = 'templates.json'

/** Your categories and templates, and which starters you deleted. Loaded once by the manager. */
export const library = writable<Library>(structuredClone(rules.EMPTY_LIBRARY))

export async function loadLibrary(): Promise<void> {
  library.set(rules.parseLibrary(await invoke<string | null>('read_config_file', { name: FILE })))
}

async function save(next: Library): Promise<void> {
  await invoke('write_config_file', { name: FILE, contents: rules.serializeLibrary(next) })
  library.set(next)
}

const update = (change: (lib: Library) => Library) => save(change(get(library)))

export async function saveTalkAsTemplate(talk: Talk, name: string, category: CategoryId): Promise<Template> {
  const template = rules.templateFromTalk(talk, name, category)
  logAction('save as template', category)
  await update((lib) => rules.addTemplate(lib, template))
  return template
}

export async function renameTemplate(id: string, name: string): Promise<void> {
  logAction('rename template', id)
  await update((lib) => rules.renameTemplate(lib, id, name))
}

export async function setTemplateCategory(id: string, category: CategoryId): Promise<void> {
  logAction('template category', `${id} ${category}`)
  await update((lib) => rules.recategoriseTemplate(lib, id, category))
}

/** Yours are deleted; a starter template is hidden until starters are restored. */
export async function deleteTemplate(id: string): Promise<void> {
  logAction('delete template', id)
  await update((lib) => rules.deleteTemplate(lib, id))
}

export async function createCategory(name: string): Promise<Category> {
  const { lib, category } = rules.addCategory(get(library), name)
  logAction('create category', category.id)
  await save(lib)
  return category
}

export async function renameCategory(id: CategoryId, name: string): Promise<void> {
  logAction('rename category', id)
  await update((lib) => rules.renameCategory(lib, id, name))
}

export async function setCategoryColor(id: CategoryId, color: CategoryColor): Promise<void> {
  logAction('category colour', `${id} ${color}`)
  await update((lib) => rules.recolorCategory(lib, id, color))
}

/** Deletes the category and every template in it. */
export async function deleteCategory(id: CategoryId): Promise<void> {
  logAction('delete category', id)
  await update((lib) => rules.deleteCategory(lib, id))
}

/** Brings back deleted starter categories and templates; yours are untouched. */
export async function restoreStarters(): Promise<void> {
  logAction('restore starters')
  await update(rules.restoreStarters)
}
