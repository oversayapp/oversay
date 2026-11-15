import { describe, expect, it } from 'vitest'
import { count } from './words'

describe('count', () => {
  it('uses the singular only for one', () => {
    expect(count(1, 'segment')).toBe('1 segment')
    expect(count(0, 'segment')).toBe('0 segments')
    expect(count(2, 'category', 'categories')).toBe('2 categories')
  })
})
