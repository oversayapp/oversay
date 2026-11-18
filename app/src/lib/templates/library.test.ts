import { describe, expect, it } from 'vitest'
import type { Talk } from '../project/types'
import { CATEGORY_COLORS, DEFAULT_CATEGORY, STARTER_CATEGORIES, STARTER_TEMPLATES } from './catalog'
import {
  EMPTY_LIBRARY,
  addCategory,
  addTemplate,
  countInCategory,
  categoryDeletion,
  deleteCategory,
  deleteTemplate,
  deletedStarters,
  parseLibrary,
  recategoriseTemplate,
  recolorCategory,
  renameCategory,
  renameTemplate,
  restoreStarters,
  serializeLibrary,
  templateFromTalk,
  visibleCategories,
  visibleTemplates,
  type Library,
} from './library'

const talk: Talk = {
  id: 't_abc',
  name: 'Product keynote',
  segments: [
    { id: 's_1', name: 'Opener', kind: 'intro', plannedSeconds: 120, openEnded: false, points: ['secret point'], hints: ['a hint'] },
    { id: 's_2', name: 'Demo', kind: 'demo', plannedSeconds: 300, openEnded: true, points: [], hints: [] },
  ],
  sessions: [{ id: 'r_1', startedAt: '2026-10-01T10:00:00Z', plan: [], events: [] }],
}

const fresh = (): Library => structuredClone(EMPTY_LIBRARY)

describe('your templates', () => {
  it('keep only the talk structure', () => {
    const t = templateFromTalk(talk, 'My keynote', 'conferences')
    expect(t).toMatchObject({ name: 'My keynote', category: 'conferences', builtin: false })
    const text = serializeLibrary(addTemplate(fresh(), t))
    expect(text).not.toContain('secret point')
    expect(text).not.toContain('a hint')
    expect(text).not.toContain('r_1')
  })

  it('rename (ignoring blanks), change category and delete', () => {
    const t = templateFromTalk(talk, 'A', 'mine')
    let lib = addTemplate(fresh(), t)
    lib = renameTemplate(lib, t.id, ' B ')
    lib = renameTemplate(lib, t.id, '  ')
    lib = recategoriseTemplate(lib, t.id, 'meetings')
    expect(lib.templates[0]).toMatchObject({ name: 'B', category: 'meetings' })
    expect(deleteTemplate(lib, t.id).templates).toEqual([])
  })
})

describe('categories', () => {
  it('start with the starters, then My templates', () => {
    const ids = visibleCategories(fresh()).map((c) => c.id)
    expect(ids).toEqual([...STARTER_CATEGORIES.map((c) => c.id), DEFAULT_CATEGORY.id])
  })

  it('a new one gets the next unused colour', () => {
    const used = new Set(visibleCategories(fresh()).map((c) => c.color))
    const { lib, category } = addCategory(fresh(), '  Client work ')
    expect(category.name).toBe('Client work')
    expect(used.has(category.color)).toBe(false)
    expect(CATEGORY_COLORS).toContain(category.color)
    const second = addCategory(lib, 'Second').category
    expect(second.color).not.toBe(category.color)
  })

  it('yours and My templates can be renamed and recoloured', () => {
    let lib = renameCategory(fresh(), 'mine', 'Saved')
    lib = recolorCategory(lib, 'mine', 'red')
    expect(lib.categories[0]).toMatchObject({ id: 'mine', name: 'Saved', color: 'red' })
    expect(renameCategory(lib, 'mine', '  ').categories[0].name).toBe('Saved')
  })

  it('deleting one of yours deletes its templates', () => {
    const { lib: withCat, category } = addCategory(fresh(), 'Client work')
    const keep = templateFromTalk(talk, 'Keep', 'mine')
    const drop = templateFromTalk(talk, 'Drop', category.id)
    let lib = addTemplate(addTemplate(withCat, keep), drop)
    expect(countInCategory(lib, category.id)).toBe(1)
    lib = deleteCategory(lib, category.id)
    expect(lib.categories.map((c) => c.id)).toEqual(['mine'])
    expect(lib.templates.map((t) => t.name)).toEqual(['Keep'])
  })

  it('My templates cannot be deleted', () => {
    const lib = addTemplate(fresh(), templateFromTalk(talk, 'Keep', 'mine'))
    expect(deleteCategory(lib, 'mine')).toBe(lib)
  })
})

describe('starters', () => {
  it('deleting a starter category hides it and its starter templates, and deletes yours in it', () => {
    const yours = templateFromTalk(talk, 'Mine in meetings', 'meetings')
    const lib = deleteCategory(addTemplate(fresh(), yours), 'meetings')
    expect(visibleCategories(lib).some((c) => c.id === 'meetings')).toBe(false)
    expect(visibleTemplates(lib).some((t) => t.category === 'meetings')).toBe(false)
    expect(lib.templates).toEqual([])
  })

  it('a single starter template can be deleted', () => {
    const lib = deleteTemplate(fresh(), STARTER_TEMPLATES[0].id)
    expect(visibleTemplates(lib)).toHaveLength(STARTER_TEMPLATES.length - 1)
    expect(deletedStarters(lib)).toEqual({ categories: 0, templates: 1 })
  })

  it('restoring brings every starter back and leaves yours alone', () => {
    const { lib: withCat, category } = addCategory(fresh(), 'Client work')
    let lib = addTemplate(withCat, templateFromTalk(talk, 'Mine', category.id))
    lib = deleteTemplate(deleteCategory(lib, 'speeches'), STARTER_TEMPLATES[0].id)
    expect(deletedStarters(lib).categories).toBe(1)
    const restored = restoreStarters(lib)
    expect(visibleTemplates(restored).filter((t) => t.builtin)).toHaveLength(STARTER_TEMPLATES.length)
    expect(visibleCategories(restored).map((c) => c.id)).toContain('speeches')
    expect(restored.categories).toEqual(lib.categories)
    expect(restored.templates).toEqual(lib.templates)
    expect(deletedStarters(restored)).toEqual({ categories: 0, templates: 0 })
  })

  it('never gives a new category the colour of a deleted starter category', () => {
    const speeches = STARTER_CATEGORIES.find((c) => c.id === 'speeches')!
    const { lib, category } = addCategory(deleteCategory(fresh(), 'speeches'), 'Talks')
    expect(category.color).not.toBe(speeches.color)
    const colors = visibleCategories(restoreStarters(lib)).map((c) => c.color)
    expect(new Set(colors).size).toBe(colors.length)
  })
})

describe('parseLibrary', () => {
  it('round-trips', () => {
    const { lib: withCat, category } = addCategory(fresh(), 'Client work')
    const lib = deleteTemplate(addTemplate(withCat, templateFromTalk(talk, 'A', category.id)), STARTER_TEMPLATES[2].id)
    expect(parseLibrary(serializeLibrary(lib))).toEqual(lib)
  })

  it('reads the templates-only files written before categories (005/03)', () => {
    const v1 = JSON.stringify({ version: 1, templates: [templateFromTalk(talk, 'Old', 'teaching'), templateFromTalk(talk, 'Gone', 'nowhere')] })
    const lib = parseLibrary(v1)
    expect(lib.categories).toEqual([DEFAULT_CATEGORY])
    expect(lib.templates.map((t) => [t.name, t.category])).toEqual([
      ['Old', 'teaching'],
      ['Gone', 'mine'],
    ])
  })

  it('treats a missing or broken file as an empty library', () => {
    expect(parseLibrary(null)).toEqual(EMPTY_LIBRARY)
    expect(parseLibrary('nope')).toEqual(EMPTY_LIBRARY)
  })

  it('skips templates with unknown segment kinds or bad lengths, and repairs a bad category', () => {
    const good = templateFromTalk(talk, 'Good', 'mine')
    const seg = good.segments[0]
    const text = JSON.stringify({
      version: 2,
      templates: [
        { ...good, category: 42 },
        { ...good, id: 'u_kind', segments: [{ ...seg, kind: 'dance' }] },
        { ...good, id: 'u_len', segments: [{ ...seg, plannedSeconds: -5 }] },
        { ...good, id: 'u_nan', segments: [{ ...seg, plannedSeconds: 'ten' }] },
      ],
    })
    const parsed = parseLibrary(text)
    expect(parsed.templates.map((t) => t.id)).toEqual([good.id])
    expect(parsed.templates[0].category).toBe('mine')
  })

  it('skips malformed entries and repairs unknown colours', () => {
    const text = JSON.stringify({
      version: 2,
      categories: [{ id: 'c_x', name: 'X', color: 'chartreuse' }, { id: 'meetings', name: 'Hijack', color: 'red' }, 7],
      templates: [{ id: 'u_bad', name: 'Bad', segments: [{}] }],
    })
    const lib = parseLibrary(text)
    expect(lib.categories.map((c) => [c.id, c.color])).toEqual([
      ['mine', 'indigo'],
      ['c_x', 'slate'],
    ])
    expect(lib.templates).toEqual([])
  })
})

describe('what deleting a category takes with it (epic 036 (#54))', () => {
  it('counts the starter and your own templates in it, which can and cannot be brought back', () => {
    const lib = addTemplate(EMPTY_LIBRARY, { ...templateFromTalk(talk, 'Mine', 'meetings') })
    const n = STARTER_TEMPLATES.filter((t) => t.category === 'meetings').length
    expect(categoryDeletion(lib, 'meetings')).toEqual({ templates: n + 1, starters: n, yours: 1 })
  })

  it('is empty for a category with nothing in it', () => {
    expect(categoryDeletion(EMPTY_LIBRARY, 'mine')).toEqual({ templates: 0, starters: 0, yours: 0 })
  })
})
