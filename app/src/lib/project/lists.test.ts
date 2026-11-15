import { describe, expect, it } from 'vitest'
import { dropIndex, insertItem, moveItem, moveItemTo, removeItem, setItem } from './lists'

describe('ordered text lists (talking points, hints)', () => {
  const list = ['a', 'b', 'c']

  it('inserts an empty item at a position, including the end', () => {
    expect(insertItem(list, 1)).toEqual(['a', '', 'b', 'c'])
    expect(insertItem(list, 3)).toEqual(['a', 'b', 'c', ''])
    expect(insertItem([], 0)).toEqual([''])
  })

  it('sets one item', () => {
    expect(setItem(list, 1, 'B')).toEqual(['a', 'B', 'c'])
  })

  it('removes one item and ignores an out-of-range index', () => {
    expect(removeItem(list, 0)).toEqual(['b', 'c'])
    expect(removeItem(list, 9)).toEqual(list)
  })

  it('moves an item one place, and stays put at the ends', () => {
    expect(moveItem(list, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b'])
    expect(moveItem(list, 0, -1)).toBe(list)
    expect(moveItem(list, 2, 1)).toBe(list)
  })

  it('never changes the list it was given', () => {
    const before = ['a', 'b']
    insertItem(before, 0)
    setItem(before, 0, 'x')
    removeItem(before, 0)
    moveItem(before, 0, 1)
    expect(before).toEqual(['a', 'b'])
  })
})

describe('moveItemTo', () => {
  it('drops an item at an insertion position, as a drag does', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItemTo(list, 0, 3)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItemTo(list, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
    expect(moveItemTo(list, 1, 4)).toEqual(['a', 'c', 'd', 'b'])
    expect(moveItemTo(list, 1, 1)).toBe(list)
    expect(moveItemTo(list, 1, 2)).toBe(list)
  })
})

describe('dropIndex', () => {
  const mids = [10, 30, 50, 70]
  it.each([
    [0, 0],
    [10, 0],
    [11, 1],
    [45, 2],
    [70, 3],
    [200, 4],
  ])('pointer at y=%i is insertion position %i', (y, expected) => expect(dropIndex(mids, y)).toBe(expected))

  it('is 0 for an empty list', () => expect(dropIndex([], 5)).toBe(0))
})
