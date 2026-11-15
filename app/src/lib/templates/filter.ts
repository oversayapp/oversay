import type { CategoryId, Template } from './catalog'

/** What the Templates page is showing: a category chip (or all) and the search text. */
export interface TemplateFilter {
  chip: 'all' | CategoryId
  query: string
}

/** The templates to list, in the given order. Search matches name and description, any case. */
export function filterTemplates(templates: readonly Template[], filter: TemplateFilter): Template[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean)
  return templates.filter((t) => {
    if (filter.chip !== 'all' && t.category !== filter.chip) return false
    const text = `${t.name} ${t.description}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
}
