import { describe, expect, it } from 'vitest'
import { summariseDeck } from './store'

describe('a deck in the list (ADR 0037)', () => {
  it('is named by its title, or by its folder without the date when it has none', () => {
    const titled = summariseDeck('/D/Weekly 2026-10-25/deck.md', 'Weekly', 0, '---\nid: d_k3x9a2bq\ntitle: Weekly: team\n---\n## A\n')
    expect(titled).toMatchObject({ id: 'd_k3x9a2bq', name: 'Weekly: team', cards: 1 })
    expect(summariseDeck('/D/Weekly 2026-10-25/deck.md', 'Weekly', 0, '## A\n')).toMatchObject({ id: '', name: 'Weekly' })
  })
})
