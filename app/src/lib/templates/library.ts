// Your template library (005/03, 005/04, 005/06), saved as templates.json in the config folder.
// The starter categories and templates live in the app (catalog.ts); the library records
// your own categories and templates, and which starters you deleted. Restoring starters
// only clears that record, so it never touches anything of yours.
import { SEGMENT_KINDS, type Talk } from '../project/types'
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY,
  STARTER_CATEGORIES,
  STARTER_TEMPLATES,
  type Category,
  type CategoryColor,
  type CategoryId,
  type Template,
} from './catalog'

export interface Library {
  /** Your categories, My templates first (always present). */
  categories: Category[]
  /** Your templates, newest last. */
  templates: Template[]
  removedStarterCategories: string[]
  removedStarterTemplates: string[]
}

export const EMPTY_LIBRARY: Library = {
  categories: [DEFAULT_CATEGORY],
  templates: [],
  removedStarterCategories: [],
  removedStarterTemplates: [],
}

function randomBody(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let body = ''
  for (const b of crypto.getRandomValues(new Uint8Array(8))) body += alphabet[b % alphabet.length]
  return body
}

const isStarterCategory = (id: CategoryId) => STARTER_CATEGORIES.some((c) => c.id === id)

/** Starter categories that haven't been deleted, then yours. */
export function visibleCategories(lib: Library): Category[] {
  const removed = new Set(lib.removedStarterCategories)
  return [...STARTER_CATEGORIES.filter((c) => !removed.has(c.id)), ...lib.categories]
}

/** Starter templates that haven't been deleted (nor their category), then yours. */
export function visibleTemplates(lib: Library): Template[] {
  const removedCategories = new Set(lib.removedStarterCategories)
  const removedTemplates = new Set(lib.removedStarterTemplates)
  const starters = STARTER_TEMPLATES.filter((t) => !removedTemplates.has(t.id) && !removedCategories.has(t.category))
  return [...starters, ...lib.templates]
}

export function findCategory(lib: Library, id: CategoryId): Category | undefined {
  return visibleCategories(lib).find((c) => c.id === id)
}

/** How many visible templates (starters and yours) are in this category. */
export function countInCategory(lib: Library, id: CategoryId): number {
  return visibleTemplates(lib).filter((t) => t.category === id).length
}

/**
 * The first palette colour no category uses, or the next one round the palette. Deleted
 * starter categories count as using theirs, so restoring them can't duplicate a colour.
 */
export function nextColor(lib: Library): CategoryColor {
  const used = new Set([...STARTER_CATEGORIES, ...lib.categories].map((c) => c.color))
  return CATEGORY_COLORS.find((c) => !used.has(c)) ?? CATEGORY_COLORS[lib.categories.length % CATEGORY_COLORS.length]
}

export function addCategory(lib: Library, name: string): { lib: Library; category: Category } {
  const category: Category = {
    id: `c_${randomBody()}`,
    name: name.trim() || 'New category',
    color: nextColor(lib),
    builtin: false,
  }
  return { lib: { ...lib, categories: [...lib.categories, category] }, category }
}

const editCategory = (lib: Library, id: CategoryId, change: (c: Category) => Category): Library => ({
  ...lib,
  categories: lib.categories.map((c) => (c.id === id ? change(c) : c)),
})

/** Your categories only; starter names are fixed. Blank names are ignored. */
export function renameCategory(lib: Library, id: CategoryId, name: string): Library {
  const trimmed = name.trim()
  return trimmed ? editCategory(lib, id, (c) => ({ ...c, name: trimmed })) : lib
}

/** Your categories only; starter colours are fixed. */
export function recolorCategory(lib: Library, id: CategoryId, color: CategoryColor): Library {
  return editCategory(lib, id, (c) => ({ ...c, color }))
}

/**
 * Deletes a category and every template in it (yours and, for a starter category, its
 * starters). My templates can't be deleted.
 */
export function deleteCategory(lib: Library, id: CategoryId): Library {
  if (id === DEFAULT_CATEGORY.id) return lib
  const templates = lib.templates.filter((t) => t.category !== id)
  if (isStarterCategory(id)) {
    return {
      ...lib,
      templates,
      removedStarterCategories: [...new Set([...lib.removedStarterCategories, id])],
    }
  }
  return { ...lib, templates, categories: lib.categories.filter((c) => c.id !== id) }
}

/**
 * What deleting a category takes with it: its templates, starters (Settings brings them back) and yours
 * (nothing does), so the question before it can say which (epic 036 (#54)).
 */
export function categoryDeletion(lib: Library, id: CategoryId): { templates: number; starters: number; yours: number } {
  const inIt = visibleTemplates(lib).filter((t) => t.category === id)
  const starters = inIt.filter((t) => t.builtin).length
  return { templates: inIt.length, starters, yours: inIt.length - starters }
}

/** The talk's structure only: segment names, kinds, lengths and open-ended flags. */
export function templateFromTalk(talk: Talk, name: string, category: CategoryId): Template {
  return {
    id: `u_${randomBody()}`,
    name: name.trim() || talk.name,
    description: `Saved from “${talk.name}” on ${new Date().toLocaleDateString()}.`,
    category,
    builtin: false,
    segments: talk.segments.map(({ name, kind, plannedSeconds, openEnded }) => ({ name, kind, plannedSeconds, openEnded })),
  }
}

export function addTemplate(lib: Library, template: Template): Library {
  return { ...lib, templates: [...lib.templates, template] }
}

const editTemplate = (lib: Library, id: string, change: (t: Template) => Template): Library => ({
  ...lib,
  templates: lib.templates.map((t) => (t.id === id ? change(t) : t)),
})

export function renameTemplate(lib: Library, id: string, name: string): Library {
  const trimmed = name.trim()
  return trimmed ? editTemplate(lib, id, (t) => ({ ...t, name: trimmed })) : lib
}

export function recategoriseTemplate(lib: Library, id: string, category: CategoryId): Library {
  return editTemplate(lib, id, (t) => ({ ...t, category }))
}

/** Deletes one of your templates, or hides a starter template until starters are restored. */
export function deleteTemplate(lib: Library, id: string): Library {
  if (STARTER_TEMPLATES.some((t) => t.id === id)) {
    return { ...lib, removedStarterTemplates: [...new Set([...lib.removedStarterTemplates, id])] }
  }
  return { ...lib, templates: lib.templates.filter((t) => t.id !== id) }
}

/** How many starter categories and starter templates are deleted. */
export interface StarterCounts {
  categories: number
  templates: number
}

/** What restoring would bring back: deleted starter categories and starter templates. */
export function deletedStarters(lib: Library): StarterCounts {
  const before = visibleTemplates(lib).filter((t) => t.builtin).length
  return { categories: lib.removedStarterCategories.length, templates: STARTER_TEMPLATES.length - before }
}

/** Brings every starter category and template back; your own are untouched. */
export function restoreStarters(lib: Library): Library {
  return { ...lib, removedStarterCategories: [], removedStarterTemplates: [] }
}

export function serializeLibrary(lib: Library): string {
  return JSON.stringify({ version: 2, ...lib }, null, 2) + '\n'
}

const COLORS = new Set<string>(CATEGORY_COLORS)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])

const KINDS = new Set<string>(SEGMENT_KINDS)

/** A segment a talk can safely be built from: a known kind and a sensible length. */
function isSegment(s: unknown): boolean {
  if (typeof s !== 'object' || s === null) return false
  const { name, kind, plannedSeconds, openEnded } = s as Record<string, unknown>
  return (
    typeof name === 'string' &&
    typeof kind === 'string' &&
    KINDS.has(kind) &&
    typeof plannedSeconds === 'number' &&
    Number.isFinite(plannedSeconds) &&
    plannedSeconds >= 0 &&
    typeof openEnded === 'boolean'
  )
}

function isTemplate(t: unknown): t is Template {
  if (typeof t !== 'object' || t === null) return false
  const { id, name, segments } = t as Record<string, unknown>
  return typeof id === 'string' && typeof name === 'string' && Array.isArray(segments) && segments.every(isSegment)
}

function parseCategory(c: unknown): Category | null {
  if (typeof c !== 'object' || c === null) return null
  const { id, name, color } = c as Record<string, unknown>
  if (typeof id !== 'string' || typeof name !== 'string' || isStarterCategory(id)) return null
  return { id, name, color: COLORS.has(color as string) ? (color as CategoryColor) : 'slate', builtin: false }
}

/**
 * Reads templates.json, version 1 (templates only, from 005/03) or 2. Missing or broken files
 * give an empty library; malformed entries are skipped; templates whose category no longer
 * exists move to My templates.
 */
export function parseLibrary(text: string | null): Library {
  if (text === null) return structuredClone(EMPTY_LIBRARY)
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return structuredClone(EMPTY_LIBRARY)
  } catch {
    return structuredClone(EMPTY_LIBRARY)
  }
  const yours = (Array.isArray(data.categories) ? data.categories : []).map(parseCategory).filter((c) => c !== null)
  const mine = yours.find((c) => c.id === DEFAULT_CATEGORY.id) ?? DEFAULT_CATEGORY
  const categories = [mine, ...yours.filter((c) => c.id !== DEFAULT_CATEGORY.id)]
  const lib: Library = {
    categories,
    templates: [],
    removedStarterCategories: strings(data.removedStarterCategories).filter(isStarterCategory),
    removedStarterTemplates: strings(data.removedStarterTemplates),
  }
  const known = new Set(visibleCategories(lib).map((c) => c.id))
  lib.templates = (Array.isArray(data.templates) ? data.templates : [])
    .filter(isTemplate)
    .map((t) => ({
      ...t,
      description: typeof t.description === 'string' ? t.description : '',
      category: typeof t.category === 'string' && known.has(t.category) ? t.category : DEFAULT_CATEGORY.id,
      builtin: false,
    }))
  return lib
}
