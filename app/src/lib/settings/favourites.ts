// Favourite talks (011/02): talks presented often, from any project, kept in this computer's
// settings rather than in the project. A favourite names its project file and its talk; the
// names are a copy for when the file can't be read (moved or deleted).

export interface FavouriteTalk {
  /** The project file. */
  path: string
  talkId: string
  talkName: string
  projectName: string
}

/** What makes a favourite the same talk: its project file and its talk id. */
export type FavouriteKey = Pick<FavouriteTalk, 'path' | 'talkId'>

export const sameTalk = (a: FavouriteKey, b: FavouriteKey): boolean => a.path === b.path && a.talkId === b.talkId

/** A favourite in the action log and in keys: its file and talk id. */
export const favouriteLabel = (key: FavouriteKey): string => `${key.path} ${key.talkId}`

export const isFavourite = (list: readonly FavouriteTalk[], path: string, talkId: string): boolean =>
  list.some((f) => sameTalk(f, { path, talkId }))

/** Adds a favourite at the top (once), or removes it. */
export function withFavourite(list: readonly FavouriteTalk[], favourite: FavouriteTalk, on: boolean): FavouriteTalk[] {
  const rest = list.filter((f) => !sameTalk(f, favourite))
  return on ? [favourite, ...rest] : rest
}

/** Keeps the copied names in step with the project, when it's open under the same path. */
export function withRefreshedNames(list: readonly FavouriteTalk[], path: string, projectName: string, talkNames: ReadonlyMap<string, string>): FavouriteTalk[] {
  let changed = false
  const next = list.map((f) => {
    if (f.path !== path) return f
    const talkName = talkNames.get(f.talkId) ?? f.talkName
    if (talkName === f.talkName && projectName === f.projectName) return f
    changed = true
    return { ...f, talkName, projectName }
  })
  return changed ? next : (list as FavouriteTalk[])
}

/** The favourites in settings.json, skipping anything that isn't one. */
export function parseFavourites(value: unknown): FavouriteTalk[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (f): f is FavouriteTalk =>
      typeof f === 'object' &&
      f !== null &&
      typeof f.path === 'string' &&
      typeof f.talkId === 'string' &&
      typeof f.talkName === 'string' &&
      typeof f.projectName === 'string',
  )
}
