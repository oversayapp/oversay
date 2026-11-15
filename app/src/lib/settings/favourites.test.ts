import { describe, expect, it } from 'vitest'
import { isFavourite, parseFavourites, withFavourite, withRefreshedNames, type FavouriteTalk } from './favourites'

const launch: FavouriteTalk = { path: '/p/launch.oversay.json', talkId: 't_1', talkName: 'Launch 20', projectName: 'Launch' }
const board: FavouriteTalk = { path: '/p/board.oversay.json', talkId: 't_9', talkName: 'Board 10', projectName: 'Board' }

describe('favourites', () => {
  it('adds a favourite at the top, once, and removes it', () => {
    const one = withFavourite([board], launch, true)
    expect(one).toEqual([launch, board])
    expect(withFavourite(one, { ...launch, talkName: 'renamed' }, true)).toEqual([{ ...launch, talkName: 'renamed' }, board])
    expect(withFavourite(one, launch, false)).toEqual([board])
    expect(isFavourite(one, launch.path, 't_1')).toBe(true)
    expect(isFavourite(one, launch.path, 't_2')).toBe(false)
  })

  it('keeps names in step with the open project, and leaves the list alone when nothing changed', () => {
    const list = [launch, board]
    expect(withRefreshedNames(list, launch.path, 'Launch', new Map([['t_1', 'Launch 20']]))).toBe(list)
    expect(withRefreshedNames(list, launch.path, 'Launch event', new Map([['t_1', 'Launch 25']]))).toEqual([
      { ...launch, projectName: 'Launch event', talkName: 'Launch 25' },
      board,
    ])
  })

  it('reads only well-formed favourites from settings', () => {
    expect(parseFavourites(undefined)).toEqual([])
    expect(parseFavourites([launch, { path: 3 }, 'x', null])).toEqual([launch])
  })
})
