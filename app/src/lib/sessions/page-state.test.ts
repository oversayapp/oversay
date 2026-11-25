import { describe, expect, it } from 'vitest'
import { NO_BROWSE, PAGE_RUNS } from './browse'
import { withEveryRun } from './page-state'

describe('where Sessions was left', () => {
  it('shows every run again: no filters, the first page, grouped as before', () => {
    const left = { filters: { ...NO_BROWSE, status: ['review' as const] }, group: 'deck' as const, limit: PAGE_RUNS * 3 }
    expect(withEveryRun(left)).toEqual({ filters: NO_BROWSE, group: 'deck', limit: PAGE_RUNS })
  })
})
