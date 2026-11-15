import { describe, expect, it } from 'vitest'
import { SEGMENT_KINDS } from '../project/types'
import { STARTER_CATEGORIES, STARTER_TEMPLATES, templateSeconds, type Template } from './catalog'
import { filterTemplates } from './filter'

const ids = (templates: Template[]) => templates.map((t) => t.id)

describe('starter templates', () => {
  it('has 24 templates with unique ids', () => {
    expect(STARTER_TEMPLATES).toHaveLength(24)
    expect(new Set(ids([...STARTER_TEMPLATES])).size).toBe(24)
  })

  it.each(STARTER_TEMPLATES.map((t) => [t.name, t] as const))('%s totals the minutes in its name', (_name, t) => {
    const minutes = Number(/(\d+)$/.exec(t.name)?.[1])
    expect(templateSeconds(t)).toBe(minutes * 60)
  })

  it('uses starter categories and known segment kinds', () => {
    const categories = new Set<string>(STARTER_CATEGORIES.map((c) => c.id))
    for (const t of STARTER_TEMPLATES) {
      expect(categories.has(t.category)).toBe(true)
      expect(t.builtin).toBe(true)
      expect(t.segments.length).toBeGreaterThan(0)
      for (const s of t.segments) expect(SEGMENT_KINDS).toContain(s.kind)
    }
  })

  it('has starter templates in every starter category', () => {
    for (const c of STARTER_CATEGORIES) {
      expect(STARTER_TEMPLATES.some((t) => t.category === c.id)).toBe(true)
    }
  })

  it('gives each starter category its own colour', () => {
    expect(new Set(STARTER_CATEGORIES.map((c) => c.color)).size).toBe(STARTER_CATEGORIES.length)
  })
})

describe('filterTemplates', () => {
  const mine: Template = {
    id: 'u_1',
    name: 'My keynote 30',
    description: 'Saved from Product keynote.',
    category: 'conferences',
    builtin: false,
    segments: [{ name: 'Opener', kind: 'intro', plannedSeconds: 1800, openEnded: false }],
  }
  const all = [...STARTER_TEMPLATES, mine]

  it('shows everything for All with no search', () => {
    expect(filterTemplates(all, { chip: 'all', query: '' })).toHaveLength(25)
  })

  it('filters by category, including your templates in it', () => {
    const shown = filterTemplates(all, { chip: 'conferences', query: '' })
    expect(shown.every((t) => t.category === 'conferences')).toBe(true)
    expect(ids(shown)).toContain('u_1')
  })


  it('searches names and descriptions, any case, all words', () => {
    expect(ids(filterTemplates(all, { chip: 'all', query: 'DEMO stakeholder' }))).toEqual(['builtin:stakeholder-demo-15'])
    expect(ids(filterTemplates(all, { chip: 'all', query: 'questions' }))).toContain('builtin:talk-qa-45')
  })

})
